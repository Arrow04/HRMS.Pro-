"""
Policy-Driven Payroll Calculation Engine
=========================================
Computes monthly payroll using per-organization configurable policies,
components, statutory settings, tax regimes, and attendance policies.

Every organization defines its own:
  - PayrollPolicy     (pro-ration, rounding, gratuity, currency)
  - PayrollComponent  (earnings & deductions — name, type, formula, caps)
  - StatutorySetting  (PF/ESI/PT/LWF rates & thresholds)
  - TaxRegime + slabs (tax calculation rules)
  - AttendancePolicy  (how attendance → paid days)

Statutory Rule Engine:
  All statutory rates/formulas are resolved via StatutoryRuleEngine which
  reads effective-dated rules from the statutory_rules table. When a rule
  exists, it takes precedence over the legacy StatutorySetting fields.
  This means EPFO/ESI/PT rate changes are handled by inserting new rules
  — no code modifications needed.
"""

import calendar
import json
import logging
import re
from datetime import datetime, date as _date
from typing import Any, Dict, List, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from data.state_compliance import resolve_state_key, calculate_pt
from services.statutory_rule_engine import StatutoryRuleEngine
from models import (
    Attendance,
    AttendancePolicy,
    Employee,
    Organization,
    Payroll,
    PayrollComponent,
    PayrollPolicy,
    PayrollTemplate,
    SalaryTemplate,
    StatutorySetting,
    TaxRegime,
    TaxSlab,
)

logger = logging.getLogger(__name__)


# ── Helpers ──

def _days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _last_day(year: int, month: int) -> datetime:
    import calendar as _cal
    return datetime(year, month, _cal.monthrange(year, month)[1])


def _round_val(value: float, method: str = "nearest", places: int = 2) -> float:
    if method == "floor":
        import math
        factor = 10 ** places
        return math.floor(value * factor) / factor
    elif method == "ceil":
        import math
        factor = 10 ** places
        return math.ceil(value * factor) / factor
    elif method == "truncate":
        factor = 10 ** places
        return int(value * factor) / factor
    return round(value, places)


def _safe_eval(expr: str, ctx: Dict[str, Any]) -> Any:
    """Safely evaluate arithmetic, comparison, and conditional expressions.

    Supports:
      - Arithmetic: +, -, *, /, **, %
      - Comparisons: >, <, >=, <=, ==, !=
      - Logical: and, or, not
      - Conditional: if X > 100 then 200 else 100  (ternary)
      - Functions: max, min, abs, round, floor, ceil, ifnull
      - Variable references: any key from ctx (basic, gross, component names, etc.)
    """
    import ast
    import operator
    import math

    _BINOPS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.Mod: operator.mod,
        ast.FloorDiv: operator.floordiv,
    }

    _CMPOPS = {
        ast.Gt: operator.gt,
        ast.Lt: operator.lt,
        ast.GtE: operator.ge,
        ast.LtE: operator.le,
        ast.Eq: operator.eq,
        ast.NotEq: operator.ne,
    }

    _UNARYOPS = {
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
        ast.Not: operator.not_,
    }

    _BOOL_OPS = {
        ast.And: lambda a, b: a and b,
        ast.Or: lambda a, b: a or b,
    }

    _CALLS = {
        "max": max,
        "min": min,
        "abs": abs,
        "round": round,
        "floor": math.floor,
        "ceil": math.ceil,
        "ifnull": lambda val, default: default if val is None else val,
    }

    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        # Numbers
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise ValueError(f"Unsupported constant type: {type(node.value).__name__}")
        # Variable names
        if isinstance(node, ast.Name):
            if node.id in ctx:
                return ctx[node.id]
            raise ValueError(f"Unknown variable: {node.id}")
        # Binary arithmetic
        if isinstance(node, ast.BinOp):
            left = _eval(node.left)
            right = _eval(node.right)
            op_type = type(node.op)
            if op_type not in _BINOPS:
                raise ValueError(f"Unsupported binary operator: {op_type.__name__}")
            return _BINOPS[op_type](left, right)
        # Comparisons (>, <, >=, <=, ==, !=)
        if isinstance(node, ast.Compare):
            result = True
            left = _eval(node.left)
            for op, comparator in zip(node.ops, node.comparators):
                op_type = type(op)
                if op_type not in _CMPOPS:
                    raise ValueError(f"Unsupported comparison: {op_type.__name__}")
                right = _eval(comparator)
                if not _CMPOPS[op_type](left, right):
                    result = False
                    break
                left = right
            return 1.0 if result else 0.0
        # Unary operators (-, +, not)
        if isinstance(node, ast.UnaryOp):
            operand = _eval(node.operand)
            op_type = type(node.op)
            if op_type not in _UNARYOPS:
                raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
            return _UNARYOPS[op_type](operand)
        # Boolean operators (and, or)
        if isinstance(node, ast.BoolOp):
            op_type = type(node.op)
            if op_type not in _BOOL_OPS:
                raise ValueError(f"Unsupported boolean operator: {op_type.__name__}")
            values = [_eval(v) for v in node.values]
            result = values[0]
            for v in values[1:]:
                result = _BOOL_OPS[op_type](result, v)
            return result
        # if-else ternary: if <condition> then <expr> else <expr>
        if isinstance(node, ast.IfExp):
            cond = _eval(node.test)
            if cond:
                return _eval(node.body)
            return _eval(node.orelse)
        # Function calls: max(), min(), abs(), round(), floor(), ceil(), ifnull()
        if isinstance(node, ast.Call):
            func_name = getattr(node.func, "id", None)
            if func_name not in _CALLS:
                raise ValueError(f"Unsupported function: {func_name}. Allowed: {', '.join(_CALLS.keys())}")
            args = [_eval(a) for a in node.args]
            return _CALLS[func_name](*args)
        raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    tree = ast.parse(expr, mode='eval')
    return _eval(tree)


# ── Policy Loaders ──

def _get_statutory_bonus(db: Session, employee: Employee, year: int, month: int, gross: float, working_days: int) -> float:
    """Statutory bonus per the Payment of Bonus Act (India), driven by StatutoryRuleEngine.

    Applies when the org is in India, bonus_applicable is on, and gross wages are
    within the eligibility ceiling. Returns the minimum statutory bonus (8.33%)
    spread across 12 months.

    Per the Act, bonus is payable on wages up to ₹21,000/month ceiling.
    Employees earning above ₹21,000 still get bonus calculated on the ceiling.
    """
    try:
        from datetime import date as _date
        cfg = ((getattr(employee.organization, "settings", None) or {}).get("payroll", {}) or {})
        if not cfg.get("statutoryBonus", False):
            return 0.0
        country = _effective_country(employee).lower()
        as_of = _date(year, month, 1)
        engine = _get_rule_engine(db, employee, as_of)
        state_code = getattr(employee, 'state_code', None) or getattr(employee, 'work_state', None)
        result = engine.calculate_bonus(gross, as_of, country, state_code, employee.organization_id)
        if result.get('bonus_applicable') and result.get('bonus_amount'):
            return float(result['bonus_amount'])
        # Statutory minimum per the Payment of Bonus Act: 8.33% of bonus
        # wages (ceiling-capped), spread across 12 months.
        ceiling = 21000.0
        try:
            stat = _get_statutory_settings(db, employee)
            ceiling = float(getattr(stat, "bonus_wage_ceiling", None) or 21000.0)
        except Exception:
            pass
        from services.compliance_engine import calculate_bonus
        b = calculate_bonus(min(float(gross), ceiling), 12)
        return round(float(b.get("minimum", 0)) / 12.0, 2)
    except Exception:
        return 0.0


def _get_arrears(db: Session, employee: Employee, year: int, month: int) -> float:
    """Backdated salary-revision arrears for months not yet processed.

    When a revision took effect in a past month and those months have no payroll
    record yet (never generated at the old rate), the monthly rate difference is
    paid out now as arrears.
    """
    try:
        from datetime import date
        from models import SalaryRevision
        revs = (db.query(SalaryRevision)
                .filter(SalaryRevision.employee_id == employee.id)
                .order_by(SalaryRevision.effective_from.asc())
                .all())
        if not revs:
            return 0.0
        latest = None
        cutoff = date(year, month, _days_in_month(year, month))
        for r in revs:
            if r.effective_from <= cutoff:
                latest = r
            else:
                break
        if latest is None:
            return 0.0
        # A revision taking effect this month (or later) has no past gap to cover
        if latest.effective_from.year == year and latest.effective_from.month == month:
            return 0.0
        new_monthly = float(latest.base_salary or 0) / 12.0
        idx = revs.index(latest)
        old_ctc = float(revs[idx - 1].base_salary or 0) if idx > 0 else float(employee.base_salary or 0)
        old_monthly = old_ctc / 12.0
        delta = new_monthly - old_monthly
        if delta <= 0:
            return 0.0
        gap = 0
        ey, em = latest.effective_from.year, latest.effective_from.month
        while (ey, em) < (year, month):
            exists = db.query(Payroll.id).filter(
                Payroll.deleted_at.is_(None),
                Payroll.employee_id == employee.id,
                Payroll.year == ey, Payroll.month == em,
            ).first()
            if not exists:
                gap += 1
            em += 1
            if em > 12:
                em, ey = 1, ey + 1
        return round(delta * gap, 2)
    except Exception:
        return 0.0


def _encashable_leave_rows(db: Session, employee: Employee, year: int):
    """Return encashable (LeaveBalance, LeaveType) rows for the employee/year."""
    try:
        org_settings = (employee.organization.settings or {})
        payroll_cfg = org_settings.get("payroll", {}) or {}
        if not payroll_cfg.get("leaveEncashment", False):
            return []
        from models import LeaveBalance, LeaveType
        codes = payroll_cfg.get("encashableLeaveCodes") or ["annual", "privilege", "comp_off", "paid"]
        codes = [str(c).lower() for c in codes]
        rows = (
            db.query(LeaveBalance, LeaveType)
            .join(LeaveType, LeaveType.id == LeaveBalance.leave_type_id)
            .filter(
                LeaveBalance.employee_id == employee.id,
                LeaveBalance.year == year,
                LeaveBalance.deleted_at.is_(None),
                LeaveBalance.remaining_days > 0,
            )
            .all()
        )
        return [(lb, lt) for lb, lt in rows if any(c in str(lt.code or lt.name or "").lower() for c in codes)]
    except Exception:
        return []


def _get_leave_encashment(db: Session, employee: Employee, year: int, month: int,
                          monthly_basic: float, working_days: int) -> float:
    """Encash unused paid-leave balance for the current year (opt-in via org settings).

    The encashed days are consumed on payroll persistence (see _consume_encashed_leave)
    so the same balance is never paid out repeatedly.
    """
    try:
        org_settings = (employee.organization.settings or {})
        payroll_cfg = org_settings.get("payroll", {}) or {}
        if not payroll_cfg.get("leaveEncashment", False):
            return 0.0
        rows = _encashable_leave_rows(db, employee, year)
        if not rows:
            return 0.0
        max_days = float(payroll_cfg.get("leaveEncashmentMaxDays") or 0)
        encashable = sum(float(lb.remaining_days or 0) for lb, _ in rows)
        if max_days > 0:
            encashable = min(encashable, max_days)
        # Daily rate divisor — configurable per company (30, 26, or actual working days)
        pay_policy = _get_payroll_policy(db, employee)
        daily_divisor = float(getattr(pay_policy, 'daily_rate_divisor', None) or 30.0)
        daily = (monthly_basic or 0) / daily_divisor
        return round(encashable * daily, 2)
    except Exception:
        return 0.0


def _consume_encashed_leave(db: Session, employee: Employee, year: int) -> None:
    """Consume encashed leave days from balances so they are paid only once."""
    try:
        org_settings = (employee.organization.settings or {})
        payroll_cfg = org_settings.get("payroll", {}) or {}
        if not payroll_cfg.get("leaveEncashment", False):
            return
        rows = _encashable_leave_rows(db, employee, year)
        if not rows:
            return
        max_days = float(payroll_cfg.get("leaveEncashmentMaxDays") or 0)
        budget = max_days if max_days > 0 else float("inf")
        for lb, _ in rows:
            if budget <= 0:
                break
            take = min(float(lb.remaining_days or 0), budget)
            if take > 0:
                lb.remaining_days = max(0, int(lb.remaining_days or 0) - int(take))
                lb.used_days = int(lb.used_days or 0) + int(take)
                budget -= take
        db.flush()
    except Exception:
        db.rollback()


def _get_fy_start_month(db: Session, employee: Employee) -> int:
    """Get financial year start month from PayrollPolicy. Default: 4 (April for India)."""
    try:
        pay_policy = _get_payroll_policy(db, employee)
        return int(getattr(pay_policy, 'fy_start_month', None) or 4)
    except Exception:
        return 4


def _get_effective_declaration(db: Session, employee: Employee, year: int, month: int):
    """Return the employee's active InvestmentDeclaration for the FY of this period.
    Falls back to the employee's most recent declaration if the exact FY has none
    (e.g. declaration submitted for the FY before payroll data exists)."""
    fy_start_month = _get_fy_start_month(db, employee)
    fy_year = year if month >= fy_start_month else year - 1
    fy_label = f"{fy_year}-{str((fy_year + 1) % 100).zfill(2)}"
    try:
        from models import InvestmentDeclaration
        q = db.query(InvestmentDeclaration).filter(
            InvestmentDeclaration.employee_id == employee.id,
            InvestmentDeclaration.deleted_at.is_(None),
        )
        exact = q.filter(InvestmentDeclaration.financial_year == fy_label).first()
        if exact:
            return exact
        return q.order_by(InvestmentDeclaration.financial_year.desc()).first()
    except Exception:
        return None


def _compute_cumulative_tds(
    db: Session,
    employee: Employee,
    year: int,
    month: int,
    month_gross: float,
    month_pf: float,
    month_pt: float,
    tax_regime: Optional[TaxRegime],
    rounding,
    places,
    taxable_benefits: float = 0.0,
) -> dict:
    """Cumulative FY TDS: project the full financial year, apply the employee's
    investment declaration + previous-employer income/TDS, compute the annual
    tax, then subtract TDS already deducted YTD so the current month's TDS
    reconciles as the year progresses (spec §11, §12, §13).

    Returns {tds, income_tax, surcharge, cess, base_tax, annual_taxable,
             projected_annual_gross, ytd_tds, declaration_used}.
    """
    fy_start_month = _get_fy_start_month(db, employee)
    months_elapsed = (month - fy_start_month) % 12 + 1  # Apr=1 ... Mar=12
    ytd = _get_ytd_payroll_totals(db, employee, year, month)
    ytd_gross = ytd["gross"] + month_gross
    ytd_pf = ytd["pf"] + month_pf
    ytd_pt = ytd["pt"] + month_pt
    ytd_tds = ytd["tds"]

    # Project the full year from YTD + current month as base for remaining months.
    projected_annual_gross = ytd_gross + max(0, 12 - months_elapsed) * month_gross
    projected_annual_pf = ytd_pf + max(0, 12 - months_elapsed) * month_pf
    projected_annual_pt = ytd_pt + max(0, 12 - months_elapsed) * month_pt

    regime_is_new = tax_regime is not None and str(tax_regime.regime_type or "new").lower() == "new"
    std_deduction = getattr(tax_regime, 'standard_deduction', None) or 0.0 if tax_regime else 0.0
    # `regime` below was only bound when the declaration carried a tax_regime_id,
    # leaving it unbound (UnboundLocalError) for every other employee. It always
    # starts as the incoming tax_regime; the declaration can override it later.
    regime = tax_regime

    # Employee's annual declaration + previous-employer carryforward
    declaration_used = None
    decl = _get_effective_declaration(db, employee, year, month)
    if decl:
        declaration_used = {
            "financial_year": decl.financial_year,
            "tax_regime_id": decl.tax_regime_id,
            "deduction_80c": float(decl.deduction_80c or 0),
            "deduction_80d": float(decl.deduction_80d or 0),
            "hra_exemption": float(decl.hra_exemption or 0),
            "lta_exemption": float(decl.lta_exemption or 0),
            "nps_deduction": float(decl.nps_deduction or 0),
            "home_loan_interest": float(decl.home_loan_interest or 0),
            "other_income": float(decl.other_income or 0),
            "previous_employer_income": float(decl.previous_employer_income or 0),
            "previous_employer_tds": float(decl.previous_employer_tds or 0),
        }
        if decl.tax_regime_id:
            regime = db.query(TaxRegime).filter(
                TaxRegime.id == decl.tax_regime_id,
                TaxRegime.organization_id == employee.organization_id,
            ).first()
            if regime:
                tax_regime = regime
                regime_is_new = str(regime.regime_type or "new").lower() == "new"
                std_deduction = regime.standard_deduction if regime.standard_deduction is not None else std_deduction

    # Income = projected gross + other income + previous-employer income
    other_income = float(decl.other_income or 0) if decl else 0.0
    prev_income = float(decl.previous_employer_income or 0) if decl else 0.0
    prev_tds = float(decl.previous_employer_tds or 0) if decl else 0.0

    annual_income = projected_annual_gross + other_income + prev_income + float(taxable_benefits or 0)

    # Deductions: 80C/80D/HRA/LTA/NPS/home-loan apply ONLY in the old regime.
    # Per-employee declaration takes precedence; otherwise fall back to the
    # org-level defaults configured via org.settings.payroll.tax_exemptions.
    deductions_total = 0.0
    if not regime_is_new:
        # Read deduction caps from TaxRegime
        cap_80c = float(getattr(regime, 'section_80c_old_cap', None) or 0)
        cap_80d = float(getattr(regime, 'section_80d_cap', None) or 0)
        cap_nps = float(getattr(regime, 'section_80ccd_1b_cap', None) or 0)
        cap_home_loan = float(getattr(regime, 'section_24_home_loan_cap', None) or 0)
        if decl:
            deductions_total += min(float(decl.deduction_80c or 0), cap_80c)
            deductions_total += min(float(decl.deduction_80d or 0), cap_80d)
            # HRA exemption: auto-calculate if rent data is provided (§10(13A))
            hra_amount = float(decl.hra_exemption or 0)
            monthly_rent = float(getattr(decl, "hra_monthly_rent", None) or 0)
            if monthly_rent > 0 and projected_annual_gross > 0:
                # Get monthly basic — read basic_pct_of_gross from TaxRegime
                basic_pct = float(getattr(regime, 'basic_pct_of_gross', None) or 0) / 100
                monthly_basic_for_hra = (projected_annual_gross / 12) * basic_pct
                is_metro = getattr(decl, "hra_is_metro", False)
                # Read metro/non-metro % from TaxRegime
                metro_pct = float(getattr(regime, 'hra_metro_pct', None) or 0) / 100
                non_metro_pct = float(getattr(regime, 'hra_non_metro_pct', None) or 0) / 100
                pct_rate = metro_pct if is_metro else non_metro_pct
                # (a) Actual HRA received (monthly, from salary components)
                actual_hra_received = (projected_annual_gross / 12) * 0.25  # approximate
                # (b) metro/non-metro % of basic
                pct_of_basic = monthly_basic_for_hra * pct_rate
                # (c) Rent paid minus rent_threshold_pct of basic (configurable, default 10%)
                rent_threshold = float(getattr(regime, 'hra_rent_threshold_pct', None) or 0) / 100
                rent_minus_pct = monthly_rent - (monthly_basic_for_hra * rent_threshold)
                # HRA exemption = least of (a), (b), (c), annualized
                hra_auto = max(0, min(actual_hra_received, pct_of_basic, rent_minus_pct)) * 12
                hra_amount = max(hra_amount, hra_auto)  # take the higher of manual or auto
            deductions_total += hra_amount
            deductions_total += float(decl.lta_exemption or 0)
            deductions_total += min(float(decl.nps_deduction or 0), cap_nps)
            deductions_total += min(float(decl.home_loan_interest or 0), cap_home_loan)
        else:
            try:
                exemptions = ((employee.organization.settings or {}).get("payroll", {}) or {}).get("tax_exemptions", {}) or {}
                deductions_total += float(exemptions.get("80c", 0) or 0)
                deductions_total += float(exemptions.get("80d", 0) or 0)
                deductions_total += float(exemptions.get("hra", 0) or 0)
                deductions_total += float(exemptions.get("lta", 0) or 0)
                deductions_total += float(exemptions.get("nps", 0) or 0)
                deductions_total += float(exemptions.get("home_loan", 0) or 0)
            except Exception:
                deductions_total = 0.0

    annual_taxable = max(
        0,
        annual_income
        - (0 if (decl and decl.opt_out_standard_deduction) else std_deduction)
        - projected_annual_pt
        - (0 if regime_is_new else projected_annual_pf)
        - deductions_total,
    )

    base_tax = 0.0
    surcharge = 0.0
    cess = 0.0
    if tax_regime:
        prev = 0.0
        for slab in sorted((tax_regime.slabs or []), key=lambda s: s.from_amount):
            upper = slab.to_amount if slab.to_amount is not None else float("inf")
            taxable = min(annual_taxable, upper) - prev
            if taxable > 0:
                base_tax += taxable * slab.rate / 100.0
            prev = upper
        rebate_threshold = tax_regime.rebate_threshold or 0
        if annual_taxable <= rebate_threshold and tax_regime.rebate_amount:
            base_tax = max(0.0, base_tax - tax_regime.rebate_amount)
        if tax_regime.surcharge_config:
            # Sort by "from" threshold ascending; pick the highest applicable slab (marginal surcharge)
            sorted_surcharge = sorted(tax_regime.surcharge_config, key=lambda s: float(s.get("from", 0)))
            for s_slab in sorted_surcharge:
                try:
                    if annual_taxable >= float(s_slab.get("from", 0)):
                        surcharge = base_tax * float(s_slab.get("rate", 0)) / 100.0
                except (TypeError, ValueError):
                    continue
        cess = (base_tax + surcharge) * (tax_regime.cess_rate or 0) / 100.0 if tax_regime.cess_rate is not None else 0.0

    annual_tax = base_tax + surcharge + cess

    # Cumulative: what SHOULD have been deducted by end of this month minus what
    # HAS been deducted (incl. previous-employer TDS) → this month's TDS.
    months_elapsed_fraction = months_elapsed / 12.0
    tds_due_to_date = annual_tax * months_elapsed_fraction
    already_deducted = ytd_tds + prev_tds
    tds = round(max(0.0, tds_due_to_date - already_deducted), 2)
    tds = _round_val(tds, rounding, places)

    return {
        "tds": tds,
        "income_tax": tds,
        "surcharge": round(surcharge, 2),
        "cess": round(cess, 2),
        "base_tax": round(base_tax, 2),
        "annual_tax": round(annual_tax, 2),
        "annual_taxable": round(annual_taxable, 2),
        "projected_annual_gross": round(projected_annual_gross + other_income + prev_income, 2),
        "ytd_tds": round(ytd_tds, 2),
        "previous_employer_tds": round(prev_tds, 2),
        "declaration_used": declaration_used,
    }


def _get_ytd_payroll_totals(db: Session, employee: Employee, year: int, month: int) -> dict:
    """Year-to-date payroll totals for the financial year (Apr-Mar), excluding the current month."""
    try:
        from models import Payroll
        fy_start_month = _get_fy_start_month(db, employee)
        fy_year = year if month >= fy_start_month else year - 1
        prior = db.query(
            func.coalesce(func.sum(Payroll.gross_salary), 0),
            func.coalesce(func.sum(Payroll.pf_deduction), 0),
            func.coalesce(func.sum(Payroll.professional_tax), 0),
            func.coalesce(func.sum(Payroll.tds_deduction), 0),
        ).filter(
            Payroll.deleted_at.is_(None),
            Payroll.employee_id == employee.id,
            Payroll.year == fy_year,
            Payroll.month >= fy_start_month,
            ((Payroll.year * 12 + Payroll.month) < (year * 12 + month)),
        ).first()
        return {
            "gross": float(prior[0] or 0),
            "pf": float(prior[1] or 0),
            "pt": float(prior[2] or 0),
            "tds": float(prior[3] or 0),
        }
    except Exception:
        return {"gross": 0.0, "pf": 0.0, "pt": 0.0, "tds": 0.0}


def _get_loan_deduction_total(db: Session, employee: Employee, year: int, month: int) -> float:
    """Total monthly EMI/repayment from active loans & advances for the period.

    Clamped to the loan's remaining principal so an over-deducted loan can never
    consume more salary than is actually owed.
    """
    try:
        from models import SalaryLoan
        loans = (
            db.query(SalaryLoan)
            .filter(
                SalaryLoan.employee_id == employee.id,
                SalaryLoan.status == "active",
                SalaryLoan.remaining_months > 0,
            )
            .all()
        )
        total = 0.0
        for loan in loans:
            period = loan.start_year * 12 + (loan.start_month or 1) - 1
            cur = year * 12 + month - 1
            if cur >= period:
                total += _loan_installment_for(loan)
        return total
    except Exception:
        return 0.0


def _loan_installment_for(loan) -> float:
    """The installment payable for a loan this month, never exceeding remaining principal."""
    emi = float(loan.monthly_deduction or 0)
    if emi <= 0:
        return 0.0
    principal = float(loan.principal_amount or 0)
    if principal <= 0:
        return emi  # no principal tracked — fall back to configured EMI
    remaining = principal * int(loan.remaining_months or 0) / max(1, int(loan.total_months or 1))
    return min(emi, max(0.0, remaining))


def _apply_loan_amortization(db: Session, employee: Employee, year: int, month: int) -> None:
    """Decrement loan remaining_months for a generated payroll period and auto-close finished loans.

    Called once when a payroll record is persisted so the same loan is not deducted
    indefinitely across months.
    """
    try:
        from models import SalaryLoan
        loans = (
            db.query(SalaryLoan)
            .filter(
                SalaryLoan.employee_id == employee.id,
                SalaryLoan.status == "active",
                SalaryLoan.remaining_months > 0,
            )
            .all()
        )
        for loan in loans:
            period = loan.start_year * 12 + (loan.start_month or 1) - 1
            cur = year * 12 + month - 1
            if cur >= period:
                loan.remaining_months = max(0, int(loan.remaining_months or 0) - 1)
                if loan.remaining_months <= 0:
                    loan.status = "closed"
        db.flush()
    except Exception:
        db.rollback()


def _effective_salary_components(db: Session, employee: Employee, year: int, month: int) -> dict:
    """Resolve the salary components in force for the employee in the given month.

    Priority: the effective-dated SalaryRevision's components -> employee's own.
    A revision with no components set falls back to the employee's current ones,
    so a hike to the CTC (base_salary) still flows through the policy breakdown.
    """
    try:
        from datetime import date as _date
        from models import SalaryRevision
        end_of_month = _date(year, month, _days_in_month(year, month))
        rev = (
            db.query(SalaryRevision)
            .filter(
                SalaryRevision.employee_id == employee.id,
                SalaryRevision.effective_from <= end_of_month,
            )
            .order_by(SalaryRevision.effective_from.desc(), SalaryRevision.id.desc())
            .first()
        )
        if rev and rev.salary_components:
            return dict(rev.salary_components)
    except Exception:
        pass
    return dict(employee.salary_components or {})


def _get_effective_annual_ctc(db: Session, employee: Employee, year: int, month: int) -> float:
    """Resolve the annual CTC in effect for an employee in a given month.

    Uses the latest SalaryRevision with effective_from <= end of that month;
    falls back to the employee's current base_salary when no revision applies.
    """
    from datetime import date as _date
    try:
        from models import SalaryRevision
        end_of_month = _date(year, month, _days_in_month(year, month))
        rev = (
            db.query(SalaryRevision)
            .filter(
                SalaryRevision.employee_id == employee.id,
                SalaryRevision.effective_from <= end_of_month,
            )
            .order_by(SalaryRevision.effective_from.desc(), SalaryRevision.id.desc())
            .first()
        )
        if rev and rev.base_salary is not None:
            return float(rev.base_salary)
    except Exception:
        pass
    return float(employee.base_salary or 0)


def monthly_from_rate(amount: float, frequency: Optional[str], pay_policy: Optional[Any] = None) -> float:
    """Convert a pay rate in its own frequency to the monthly equivalent.

    Conventions (configurable via PayrollPolicy):
      annual  -> /12            (legacy rows with no frequency: annual)
      monthly -> as-is
      weekly  -> x(monthly_divisor_for_weekly)  (default 4.33 = 52/12)
      daily   -> x(daily_rate_divisor)          (default 30)
    """
    amount = float(amount or 0)
    freq = (frequency or "annual").strip().lower()
    if freq == "monthly":
        return round(amount, 2)
    if freq == "weekly":
        weekly_to_monthly = float(getattr(pay_policy, 'monthly_divisor_for_weekly', None) or 4.33)
        return round(amount * weekly_to_monthly, 2)
    if freq == "daily":
        daily_divisor = float(getattr(pay_policy, 'daily_rate_divisor', None) or 30.0)
        return round(amount * daily_divisor, 2)
    return round(amount / 12, 2) if amount else 0.0


def _get_effective_monthly_base(db: Session, employee: Employee, year: int, month: int) -> float:
    """Monthly base salary in effect for an employee in a given month.

    SalaryRevisions are annual-denominated by contract (/12). Otherwise the
    employee's base_salary is interpreted by their pay_frequency (daily /
    weekly / monthly / annual); rows with no frequency keep the legacy
    annual assumption, so existing data calculates exactly as before.
    """
    from datetime import date as _date
    try:
        from models import SalaryRevision
        end_of_month = _date(year, month, _days_in_month(year, month))
        rev = (
            db.query(SalaryRevision)
            .filter(
                SalaryRevision.employee_id == employee.id,
                SalaryRevision.effective_from <= end_of_month,
            )
            .order_by(SalaryRevision.effective_from.desc(), SalaryRevision.id.desc())
            .first()
        )
        if rev and rev.base_salary is not None:
            return round(float(rev.base_salary) / 12, 2)
    except Exception:
        pass
    return monthly_from_rate(
        employee.base_salary,
        getattr(employee, "pay_frequency", None),
        _get_payroll_policy(db, employee) if db is not None else None,
    )


def _get_employee_template(db: Session, employee: Employee) -> Optional[PayrollTemplate]:
    """Resolve the employee's company-wise payroll template, if any.

    The template wins over per-employee/org defaults: picking a template on the
    employee form means "this template decides my payroll config".
    """
    if not getattr(employee, "payroll_template_id", None):
        return None
    try:
        tpl = db.query(PayrollTemplate).filter(
            PayrollTemplate.id == employee.payroll_template_id,
            PayrollTemplate.organization_id == employee.organization_id,
            PayrollTemplate.deleted_at.is_(None),
        ).first()
        return tpl
    except Exception:
        return None


def _get_payroll_policy(db: Session, employee: Employee) -> PayrollPolicy:
    """Resolve effective PayrollPolicy for an employee."""
    template = _get_employee_template(db, employee)
    pid = None
    if template and template.payroll_policy_id:
        pid = template.payroll_policy_id
    else:
        pid = employee.payroll_policy_id or employee.organization.default_payroll_policy_id
    if pid:
        policy = db.query(PayrollPolicy).filter(
            PayrollPolicy.id == pid, PayrollPolicy.status == "active",
            PayrollPolicy.organization_id == employee.organization_id,
        ).first()
        if policy:
            return policy
    # System fallback with explicit defaults (column defaults only apply on DB insert)
    return PayrollPolicy(
        organization_id=employee.organization_id,
        name="Default Policy (system fallback)",
        pro_ration_method="paid_days",
        rounding_method="nearest",
        decimal_places=2,
        round_net_salary=True,
        include_gratuity=False,
        gratuity_rate=0.0,
        default_currency="",
        allow_negative_net=False,
        status="active",
    )


def _get_attendance_policy(db: Session, employee: Employee, as_of=None) -> AttendancePolicy:
    """Resolve effective AttendancePolicy for an employee.

    Priority: payroll template -> company-scoped policy (auto-applied to that
    company's employees) -> employee override -> org default.

    Company policies are EFFECTIVE-DATED: the latest version with
    effective_from <= as_of wins, so a future-dated policy change never leaks
    into current calculations. Explicit pins (template link, employee
    override) apply as chosen.
    """
    from datetime import date as _date
    as_of = as_of or _date.today()
    template = _get_employee_template(db, employee)
    pid = None
    if template and template.attendance_policy_id:
        pid = template.attendance_policy_id
    if not pid:
        # Company-scoped attendance policy: a company's own working-day/week
        # configuration (e.g. IT 5-day vs restaurant 7-day) auto-applies to its
        # employees, independent of any payroll template. Effective-dated: the
        # latest version in force at as_of wins (NULL = since forever).
        company_id = getattr(employee, "company_id", None)
        if company_id:
            company_policy = db.query(AttendancePolicy).filter(
                AttendancePolicy.company_id == company_id,
                AttendancePolicy.organization_id == employee.organization_id,
                AttendancePolicy.status == "active",
                (AttendancePolicy.effective_from.is_(None) | (AttendancePolicy.effective_from <= as_of)),
            ).order_by(
                AttendancePolicy.effective_from.desc().nullslast(),
                AttendancePolicy.id.desc(),
            ).first()
            if company_policy:
                return company_policy
        pid = employee.attendance_policy_id or employee.organization.default_attendance_policy_id
    if pid:
        policy = db.query(AttendancePolicy).filter(
            AttendancePolicy.id == pid, AttendancePolicy.status == "active",
            AttendancePolicy.organization_id == employee.organization_id,
        ).first()
        if policy:
            return policy
    # System fallback with explicit defaults
    return AttendancePolicy(
        organization_id=employee.organization_id,
        name="Default Attendance (system fallback)",
        working_days_per_week=6,
        working_days="1,2,3,4,5,6",
        half_day_as_full_paid=True,
        paid_leave_as_present=True,
        holiday_as_present=True,
        overtime_threshold_hours=8.0,
        overtime_rate=1.5,
        late_mark_threshold_minutes=15,
        half_day_threshold_hours=4.0,
        status="active",
    )


def _rule_wage_bases(db: Session, employee: Employee, basic: float, gross: float,
                     da: float = 0.0, as_of=None) -> Optional[Dict[str, float]]:
    """Named wage bases from published 'wage_definition' rules.

    Returns None when the organization publishes no wage_definition rules so
    the legacy statutory computation remains untouched (config decides). When
    rules exist, PF/ESI/statutory wages follow them exactly - the mandated
    "wage base comes from rules" behaviour.
    """
    try:
        from datetime import date as _date
        from services.wage_engine import resolve_wage_bases
        res = resolve_wage_bases(
            {"BASIC": basic, "DA": da, "GROSS_WAGES": gross},
            db=db,
            organization_id=employee.organization_id,
            as_of=as_of or _date.today(),
            bases=("PF_WAGES", "ESI_WAGES"),
        )
        if any(v == "rule" for v in res["resolved_from"].values()):
            return res["bases"]
    except Exception:
        return None
    return None


def _effective_country(employee: Employee, scoped: Optional[dict] = None, template: Optional[PayrollTemplate] = None) -> str:
    """Resolve the payroll jurisdiction country for an employee.

    Priority: template country -> scoped company/branch config country ->
    Company.country -> Organization.country. Lets one org run India + UAE + US
    payrolls.
    """
    try:
        if template is not None and getattr(template, "country", None):
            return str(template.country).strip()
        if scoped and scoped.get("country"):
            return str(scoped["country"]).strip()
        company = getattr(employee, "company", None)
        if company is not None and getattr(company, "country", None):
            return str(company.country).strip()
        # Fall back to the many-to-many company assignment
        companies = getattr(employee, "companies", None) or []
        for comp in companies:
            if comp is not None and getattr(comp, "country", None):
                return str(comp.country).strip()
    except Exception:
        pass
    return str(getattr(employee.organization, "country", None) or "").strip() or None


def _get_statutory_settings(db: Session, employee: Employee,
                            scoped: Optional[dict] = None,
                            template: Optional[PayrollTemplate] = None) -> StatutorySetting:
    """Resolve statutory settings for an employee.

    Base is the organization-level StatutorySetting (or country-aware defaults),
    then company/branch scoped overrides are layered on top, then the employee's
    payroll template overrides, so a Dubai office can run UAE rules while the
    India office runs PF/ESI under the same org.
    """
    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == employee.organization_id,
        StatutorySetting.status == "active",
    ).first()
    country = _effective_country(employee, scoped, template)
    if not setting:
        # Return a disabled default — user must configure StatutorySetting for their country.
        # NO country-specific defaults here; the engine refuses to guess.
        setting = StatutorySetting(
            organization_id=employee.organization_id,
            pf_applicable=False,
            pf_employee_rate=0.0,
            pf_employer_rate=0.0,
            pf_max_monthly=0.0,
            pf_min_basic_for_exclusion=0.0,
            pf_edli_rate=0.0,
            pf_edli_max_monthly=0.0,
            pf_admin_rate=0.0,
            pf_admin_min_monthly=0.0,
            esi_applicable=False,
            esi_employee_rate=0.0,
            esi_employer_rate=0.0,
            esi_gross_ceiling=0.0,
            pt_applicable=False,
            pt_monthly_amount=0.0,
            pt_min_gross=0.0,
            lwf_applicable=False,
            lwf_employee_rate=0.0,
            lwf_employer_rate=0.0,
            gratuity_applicable=False,
            gratuity_rate=0.0,
        )
    # Apply scoped overrides (company/branch level). The DB setting is the source
    # of truth — no code overrides based on country. If the user configured
    # pf_applicable=True in the DB, it stays True regardless of country.
    if scoped:
        for attr, key in (
            ("pf_applicable", "pfApplicable"),
            ("esi_applicable", "esiApplicable"),
            ("pt_applicable", "ptApplicable"),
            ("lwf_applicable", "lwfApplicable"),
            ("gratuity_applicable", "gratuityApplicable"),
        ):
            v = scoped.get(key)
            if v is not None:
                try:
                    setattr(setting, attr, bool(v))
                except Exception:
                    pass
        pf_pct = scoped.get("pfPercent")
        esi_pct = scoped.get("esiPercent")
        if pf_pct is not None:
            try:
                setting.pf_employee_rate = float(pf_pct)
                setting.pf_employer_rate = float(pf_pct)
            except (TypeError, ValueError):
                pass
        if esi_pct is not None:
            try:
                # Accept separate employee/employer rates or split a single total
                esi_emp = scoped.get("esiEmployeeRate")
                esi_er = scoped.get("esiEmployerRate")
                if esi_emp is not None and esi_er is not None:
                    setting.esi_employee_rate = float(esi_emp)
                    setting.esi_employer_rate = float(esi_er)
                else:
                    # Legacy: split total ESI % into employee/employer (default 50/50 if unknown)
                    setting.esi_employee_rate = float(esi_pct) * 0.5
                    setting.esi_employer_rate = float(esi_pct) * 0.5
            except (TypeError, ValueError):
                pass
        g_rate = scoped.get("gratuityRate")
        if g_rate is not None:
            try:
                setting.gratuity_rate = float(g_rate)
            except (TypeError, ValueError):
                pass
    # Template statutory overrides have the highest priority.
    if template is not None and template.statutory:
        tstat = template.statutory
        for attr, key in (
            ("pf_applicable", "pf_applicable"),
            ("esi_applicable", "esi_applicable"),
            ("pt_applicable", "pt_applicable"),
            ("lwf_applicable", "lwf_applicable"),
            ("gratuity_applicable", "gratuity_applicable"),
            ("bonus_applicable", "bonus_applicable"),
        ):
            if tstat.get(key) is not None:
                try:
                    setattr(setting, attr, bool(tstat[key]))
                except Exception:
                    pass
        for attr in (
            "pf_employee_rate", "pf_employer_rate", "pf_max_monthly",
            "pf_min_basic_for_exclusion", "pf_wage_ceiling", "eps_wage_ceiling",
            "pf_edli_rate", "pf_edli_max_monthly", "pf_admin_rate", "pf_admin_min_monthly",
            "esi_employee_rate", "esi_employer_rate",
            "esi_gross_ceiling", "esi_disabled_ceiling",
            "pt_monthly_amount", "pt_min_gross",
            "lwf_employee_rate", "lwf_employer_rate", "gratuity_rate",
            "gratuity_eligible_years", "gratuity_days_per_year", "gratuity_tax_exempt_ceiling",
            "bonus_min_rate", "bonus_max_rate", "bonus_wage_ceiling",
        ):
            if tstat.get(attr) is not None:
                try:
                    setattr(setting, attr, float(tstat[attr]))
                except (TypeError, ValueError):
                    pass
    return setting


def _get_rule_engine(db: Session, employee: Employee, as_of: Optional[_date] = None) -> StatutoryRuleEngine:
    """Get a StatutoryRuleEngine instance configured for the employee's context."""
    return StatutoryRuleEngine(db)


def _resolve_pf_from_rule_engine(
    engine: StatutoryRuleEngine,
    basic_full: float,
    as_of: _date,
    country: str,
    state_code: Optional[str],
    organization_id: int,
) -> Optional[Dict[str, Any]]:
    """Try to resolve PF calculation from the rule engine. Returns None if no rule found."""
    rule = engine.resolve('pf_contribution', as_of, country, state_code, organization_id)
    if rule:
        return engine.calculate_pf(basic_full, as_of, country, state_code, organization_id)
    return None


def _resolve_esi_from_rule_engine(
    engine: StatutoryRuleEngine,
    gross_salary: float,
    as_of: _date,
    country: str,
    state_code: Optional[str],
    organization_id: int,
) -> Optional[Dict[str, Any]]:
    """Try to resolve ESI calculation from the rule engine. Returns None if no rule found."""
    rule = engine.resolve('esi_contribution', as_of, country, state_code, organization_id)
    if rule:
        return engine.calculate_esi(gross_salary, as_of, country, state_code, organization_id)
    return None


def _resolve_pt_from_rule_engine(
    engine: StatutoryRuleEngine,
    gross_salary: float,
    as_of: _date,
    country: str,
    state_code: Optional[str],
    organization_id: int,
) -> Optional[float]:
    """Try to resolve Professional Tax from the rule engine. Returns None if no rule found."""
    rule = engine.resolve('professional_tax', as_of, country, state_code, organization_id)
    if rule:
        return engine.calculate_professional_tax(gross_salary, as_of, country, state_code, organization_id)
    return None


def _employee_branch_ids(db: Session, employee_id: int) -> List[int]:
    try:
        rows = db.execute(
            text("SELECT branch_id FROM employee_branches WHERE employee_id = :eid"),
            {"eid": employee_id},
        ).fetchall()
        return [r[0] for r in rows if r[0] is not None]
    except Exception:
        return []


def resolve_scoped_payroll_config(
    db: Session,
    employee: Employee,
) -> Optional[dict]:
    """Resolve the most specific company/branch/department-wise payroll config.

    Priority: exact department > exact branch > exact company > any org-wide config.
    Configs are stored in org.settings["payroll_configs"].
    """
    org = db.query(Organization).filter(
        Organization.deleted_at.is_(None),
        Organization.id == employee.organization_id,
    ).first()
    if not org:
        return None
    data = org.settings or {}
    configs = data.get("payroll_configs") or []
    if not configs:
        return None

    branch_ids = _employee_branch_ids(db, employee.id)

    def score(c: dict) -> tuple:
        cid = c.get("companyId")
        bid = c.get("branchId")
        did = c.get("departmentId")
        rank = 3 if did is not None else 2 if bid is not None else 1 if cid is not None else 0
        cm = (cid is None) or (employee.company_id is not None and cid == employee.company_id)
        bm = (bid is None) or (bid in branch_ids)
        dm = (did is None) or (employee.department_id is not None and did == employee.department_id)
        if not (cm and bm and dm):
            return (-1, -1, -1, -1)
        return (rank, 1 if cm else 0, 1 if bm else 0, 1 if dm else 0)

    best = max(configs, key=score, default=None)
    if best and score(best)[0] >= 0:
        return best
    return None


def _apply_state_compliance(
    stat_settings: StatutorySetting,
    employee: Employee,
    gross_salary: float,
    basic_salary: float,
    country: Optional[str] = None,
    db: Session = None,
    as_of=None,
) -> dict:
    """Auto-compute PT and LWF from the effective jurisdiction's registered_state.

    This is our competitive moat — Keka requires manual PT slab updates.
    We look up the effective country + org's registered state and calculate exact
    PT/LWF using the state compliance engine, overriding static StatutorySetting values.

    Returns dict with keys: pt_amount, pt_applicable, lwf_applicable,
    lwf_employee, lwf_employer, state_code.
    """
    org = employee.organization
    country = (country or getattr(org, "country", None) or "India").strip().lower()
    state = (org.registered_state or "").strip()
    key = resolve_state_key(state) if state else None

    # India-specific state compliance (PT/LWF) only applies to India orgs.
    # Other countries use the org-configurable StatutorySetting instead, so the
    # engine stays country-agnostic (usable in India and beyond).
    if country != "india":
        lwf_emp = (basic_salary * stat_settings.lwf_employee_rate / 100) if stat_settings.lwf_applicable else 0.0
        lwf_epr = (basic_salary * stat_settings.lwf_employer_rate / 100) if stat_settings.lwf_applicable else 0.0
        return {
            "pt_amount": stat_settings.pt_monthly_amount if stat_settings.pt_applicable else 0.0,
            "pt_applicable": stat_settings.pt_applicable,
            "lwf_employee": lwf_emp,
            "lwf_employer": lwf_epr,
            "lwf_applicable": stat_settings.lwf_applicable,
            "state_code": None,
        }

    result = {
        "pt_amount": 0.0,
        "pt_applicable": False,
        "lwf_employee": 0.0,
        "lwf_employer": 0.0,
        "lwf_applicable": False,
        "state_code": key,
    }

    if not key:
        # No state configured — fall back to static StatutorySetting values
        pt_amount = stat_settings.pt_monthly_amount if stat_settings.pt_applicable else 0.0
        pt_applicable = stat_settings.pt_applicable and basic_salary > stat_settings.pt_min_gross
        lwf_employee = (
            basic_salary * stat_settings.lwf_employee_rate / 100
            if stat_settings.lwf_applicable else 0.0
        )
        lwf_employer = (
            basic_salary * stat_settings.lwf_employer_rate / 100
            if stat_settings.lwf_applicable else 0.0
        )
        return {
            "pt_amount": pt_amount if pt_applicable else 0.0,
            "pt_applicable": pt_applicable,
            "lwf_employee": lwf_employee,
            "lwf_employer": lwf_employer,
            "lwf_applicable": stat_settings.lwf_applicable,
            "state_code": None,
        }

    # Auto PT from state compliance engine (effective-dated DB slabs, static fallback)
    from services.compliance_engine import calculate_professional_tax, calculate_lwf as engine_calculate_lwf
    pt_result = calculate_professional_tax(gross_salary, key, db=db, as_of=as_of)
    pt_amount = pt_result.get("amount", 0.0)
    pt_applicable = pt_amount > 0

    # Auto LWF from state compliance engine
    lwf_result = engine_calculate_lwf(gross_salary, key, db=db, as_of=as_of)
    lwf_applicable = lwf_result.get("applicable", False)
    lwf_employee = lwf_result.get("employee", 0.0)
    lwf_employer = lwf_result.get("employer", 0.0)
    # Half-yearly LWF states (e.g. TN, Kerala, Rajasthan) return the half-yearly amount;
    # convert to a monthly figure so we don't over-charge ~6x every month.
    if lwf_result.get("frequency") == "half_yearly":
        lwf_employee = lwf_employee / 6
        lwf_employer = lwf_employer / 6

    logger.info(f"State compliance auto-calculated: state={key}, pt={pt_amount}, lwf_emp={lwf_employee}, lwf_epr={lwf_employer}, gross={gross_salary}")

    return {
        "pt_amount": pt_amount,
        "pt_applicable": pt_applicable,
        "lwf_employee": lwf_employee,
        "lwf_employer": lwf_employer,
        "lwf_applicable": lwf_applicable,
        "state_code": key,
    }


def _get_tax_regime(db: Session, employee: Employee) -> Optional[TaxRegime]:
    """Resolve effective TaxRegime for an employee."""
    template = _get_employee_template(db, employee)
    rid = None
    if template and template.tax_regime_id:
        rid = template.tax_regime_id
    else:
        rid = employee.tax_regime_id or employee.organization.default_tax_regime_id
    if rid:
        regime = db.query(TaxRegime).filter(
            TaxRegime.id == rid,
            TaxRegime.organization_id == employee.organization_id,
            TaxRegime.is_active.is_(True),
        ).first()
        if regime:
            return regime
    # Fall back to the org's default active regime
    return db.query(TaxRegime).filter(
        TaxRegime.organization_id == employee.organization_id,
        TaxRegime.is_default.is_(True),
        TaxRegime.is_active.is_(True),
    ).first()


def _get_components(db: Session, policy: PayrollPolicy) -> List[PayrollComponent]:
    """Return active components for a policy, ordered by priority."""
    return (
        db.query(PayrollComponent)
        .filter(
            PayrollComponent.payroll_policy_id == policy.id,
            PayrollComponent.is_active.is_(True),
            PayrollComponent.status == "active",
        )
        .order_by(PayrollComponent.priority)
        .all()
    )


# ── Attendance ──

def _get_attendance_counts(
    db: Session,
    employee_id: int,
    year: int,
    month: int,
    att_policy: AttendancePolicy,
    employee: Optional[Employee] = None,
) -> dict:
    """Count attendance records according to the attendance policy rules.

    Classifies leave days as paid/unpaid from the linked LeaveApplication,
    computes working days from the policy's workweek schedule, and tallies
    overtime hours for the period.
    """
    from datetime import timedelta
    dim = _days_in_month(year, month)
    start = datetime(year, month, 1)
    end = datetime(year, month, dim)

    def _as_date(v):
        if hasattr(v, 'date'):
            return v.date()
        s = str(v)
        return datetime.strptime(s[:10], "%Y-%m-%d").date()

    records = (
        db.query(Attendance)
        .filter(
            Attendance.employee_id == employee_id,
            Attendance.deleted_at.is_(None),
            Attendance.date >= start,
            Attendance.date <= end,
        )
        .all()
    )

    # Deduplicate: a date can have more than one attendance row (e.g. a bulk
    # import that inserted new rows without overwriting older ones). Keep only
    # the most recently created row per date so each day is counted exactly once.
    _by_date: Dict = {}
    for _r in records:
        _d = _as_date(_r.date)
        _prev = _by_date.get(_d)
        if _prev is None or _r.id > _prev.id:
            _by_date[_d] = _r
    records = list(_by_date.values())

    # Map leave dates in the period -> is_paid (from the linked leave application).
    # Only APPROVED leaves count toward payroll — pending/rejected leave must not pay.
    leave_paid: Dict[str, bool] = {}
    try:
        from models import LeaveApplication, LeaveType
        leaves = (
            db.query(LeaveApplication)
            .filter(
                LeaveApplication.employee_id == employee_id,
                LeaveApplication.deleted_at.is_(None),
                LeaveApplication.start_date <= end,
                LeaveApplication.end_date >= start,
                LeaveApplication.status == "approved",
            )
            .all()
        )
        # Paid/unpaid resolves through template precedence (pinned template
        # row -> payroll-template linked row -> LeaveType org default); the
        # per-application is_paid is the final fallback.
        type_ids = {lv.leave_type_id for lv in leaves if lv.leave_type_id}
        lt_paid: Dict[int, bool] = {}
        if type_ids:
            try:
                from utils.leave_balance_utils import resolve_type_flags
                from datetime import date as _d
                types = db.query(LeaveType).filter(LeaveType.id.in_(type_ids)).all()
                flags = resolve_type_flags(db, employee, types, as_of=_d(year, month, 1)) if employee is not None else {}
                lt_paid = {t.id: bool(flags.get(t.id, {}).get("paid", getattr(t, "is_paid", True))) for t in types}
            except Exception:
                lt_paid = {}
        for lv in leaves:
            s = _as_date(lv.start_date)
            e = _as_date(lv.end_date)
            paid = lt_paid.get(lv.leave_type_id, bool(lv.is_paid)) if lv.leave_type_id else bool(lv.is_paid)
            cur = s
            while cur <= e:
                if start.date() <= cur <= end.date():
                    leave_paid[cur.isoformat()] = paid
                cur += timedelta(days=1)
    except Exception:
        leave_paid = {}

    present = 0
    absent = 0
    half_day = 0
    on_leave = 0
    paid_leave = 0
    unpaid_leave = 0
    holiday = 0
    week_off = 0
    late = 0
    early = 0
    missing_checkout = 0
    late_converted = 0
    early_converted = 0
    overtime_hours = 0.0
    WORKED_STATUSES = ("present", "late", "workfromhome", "workfromhomeapproved", "overtime", "earlydeparture", "early")

    # Working days from policy workweek schedule (0=Sun ... 6=Sat) — computed first
    # so holiday classification below can exclude weekend holidays.
    working_weekdays = set()
    for x in (att_policy.working_days or "1,2,3,4,5,6").split(","):
        x = x.strip()
        if x.isdigit():
            working_weekdays.add(int(x))
    if not working_weekdays:
        working_weekdays = {1, 2, 3, 4, 5, 6}
    working_days = sum(
        1 for d in range(1, dim + 1)
        if ((datetime(year, month, d).weekday() + 1) % 7) in working_weekdays
    )
    if working_days <= 0:
        working_days = dim

    for r in records:
        d = _as_date(r.date)
        ds = d.isoformat()
        # Only attendance within the employment window counts (join_date .. exit date)
        if employee and employee.join_date and d < _as_date(employee.join_date):
            continue
        exit_date = employee.date_of_leaving or employee.termination_date if employee else None
        if exit_date and d > _as_date(exit_date):
            continue
        status = (r.status or "").strip().lower()
        # Normalised status: strip every non-letter so "Sick Leave",
        # "sick_leave", "sick" and "SICK-LEAVE " all classify identically.
        # Leave sync stamps the leave TYPE NAME (with spaces); without this,
        # paid leave like "Casual Leave" fell through uncounted/unpaid.
        nstatus = re.sub(r"[^a-z]", "", status)
        # Recognised leave statuses (both linked-leave rows and standalone
        # leave statuses stamped on the attendance record).
        PAID_LEAVE_STATUSES = {
            "onleave", "casualleave", "casual", "sickleave", "sick",
            "paidleave", "earnedleave", "privilegeleave", "maternity",
            "maternityleave", "paternity", "paternityleave", "bereavement",
            "bereavementleave", "compoff", "vacation", "vacationleave",
            "personal", "personalleave", "personalcasualleave",
        }
        UNPAID_LEAVE_STATUSES = {"unpaidleave", "lossofpay", "lop", "unpaid", "leavewithoutpay", "withoutpay"}
        # A day is "leave" only when its attendance status is a leave status (or
        # the is_on_leave flag is set). This keeps the classification status-based
        # so payroll's present/absent matches the attendance screen exactly — a day
        # stamped "absent" stays absent even if a leave application is linked.
        is_leave = (
            bool(r.is_on_leave)
            or nstatus in PAID_LEAVE_STATUSES | UNPAID_LEAVE_STATUSES
        )
        if is_leave:
            on_leave += 1
            if r.leave_application_id:
                # A linked leave application is authoritative: only APPROVED
                # leaves pay. Pending/rejected leaves (not in the leave_paid map)
                # must not count as paid.
                paid = leave_paid.get(ds, False)
            else:
                # Standalone leave status stamped on the attendance row (no linked
                # application) — classify paid/unpaid from the status type.
                paid = nstatus in PAID_LEAVE_STATUSES
            if paid:
                paid_leave += 1
            else:
                unpaid_leave += 1
        elif nstatus in ("present", "late", "workfromhome", "workfromhomeapproved", "overtime", "earlydeparture", "early"):
            # Missing checkout reclassifies the day BEFORE counting: a worked
            # day with check-in but no check-out becomes whatever status the
            # template's missing_checkout_rule names (default half-day).
            # Unknown rules fall back to half-day — never silent full-present.
            eff = nstatus
            if getattr(r, "check_in", None) and not getattr(r, "check_out", None):
                missing_checkout += 1
                rule = re.sub(r"[^a-z]", "", str(getattr(att_policy, "missing_checkout_rule", None) or "half_day").strip().lower())
                if rule == "absent":
                    eff = "absent"
                elif rule in ("halfday", "half"):
                    eff = "halfday"
                elif rule in ("weekoff", "weeklyoff", "weekoffday"):
                    week_off += 1
                    eff = "weekoff"
                elif rule in PAID_LEAVE_STATUSES | UNPAID_LEAVE_STATUSES:
                    on_leave += 1
                    if rule in PAID_LEAVE_STATUSES:
                        paid_leave += 1
                    else:
                        unpaid_leave += 1
                    eff = "leave"
                elif rule in ("present", "late", "workfromhome", "workfromhomeapproved", "overtime", "earlydeparture", "early"):
                    eff = rule
                else:
                    eff = "halfday"
            # Auto half-day from worked hours: a day shorter than the policy's
            # half_day_threshold_hours counts as a half day, never a silent
            # full day.
            if eff in WORKED_STATUSES:
                try:
                    _thr = float(getattr(att_policy, "half_day_threshold_hours", None) or 0)
                except (TypeError, ValueError):
                    _thr = 0.0
                if _thr > 0 and r.work_hours is not None:
                    try:
                        _wh = float(r.work_hours)
                    except (TypeError, ValueError):
                        _wh = None
                    if _wh is not None and 0 < _wh < _thr:
                        eff = "halfday"
            if eff == "absent":
                absent += 1
            elif eff == "halfday":
                half_day += 1
            elif eff in ("weekoff", "leave"):
                pass  # already tallied above
            else:
                present += 1
                if eff == "late" or (nstatus == "late" and eff in WORKED_STATUSES):
                    late += 1
                # Standalone early-departure status counts as early even without the flag.
                if eff in ("earlydeparture", "early") or (getattr(r, "is_early_departure", False) and eff in WORKED_STATUSES):
                    early += 1
        elif nstatus in ("holiday",):
            # Holiday status stays a holiday (not present) so payroll matches the
            # attendance screen, where holidays are shown separately. Weekend
            # (non-working-day) holidays are excluded so they can't inflate
            # paid_days and mask an unpaid absence.
            wd = (d.weekday() + 1) % 7
            if wd in working_weekdays or not working_weekdays:
                holiday += 1
        elif nstatus in ("weekoff", "weeklyoff", "weekoffday", "week off"):
            # Weekly off day — neither present nor absent, and excluded from pay.
            week_off += 1
        elif nstatus in ("absent",):
            absent += 1
        elif nstatus in ("halfday", "half day"):
            half_day += 1
        worked = nstatus in (
            "present", "late", "workfromhome", "workfromhomeapproved",
            "overtime", "earlydeparture", "early", "halfday", "half day",
        )
        if r.is_holiday and not is_leave and nstatus != "holiday" and not worked:
            # A worked day flagged as holiday (e.g. present on a holiday) must
            # NOT count twice — it is already paid as present above. Unworked
            # flagged days (absent/week-off/unclassified) still earn the paid
            # holiday credit. Weekend holidays stay excluded so they can't
            # inflate paid_days and mask an unpaid absence.
            wd = (d.weekday() + 1) % 7
            if wd in working_weekdays or not working_weekdays:
                holiday += 1
        overtime_hours += float(r.overtime_hours or 0)

    # Auto-apply company-scoped holidays: an employee's own company's holiday (or
    # an org-wide holiday) counts as a paid holiday when it falls on a working day
    # and isn't already covered by an attendance/leave record for that date.
    # Auto-apply company-scoped holidays: ONLY the employee's own company's
    # holidays count (strict — no shared rows). Working-day flagged holidays
    # are workdays, never credited.
    try:
        from models import Holiday
        from sqlalchemy import or_ as _or
        seen_dates = {_as_date(r.date).isoformat() for r in records}
        hq = db.query(Holiday).filter(
            Holiday.deleted_at.is_(None),
            Holiday.date >= start,
            Holiday.date <= end,
            _or_(Holiday.is_working_day.is_(False), Holiday.is_working_day.is_(None)),
        )
        if employee is not None:
            hq = hq.filter(Holiday.organization_id == employee.organization_id)
            cid = getattr(employee, "company_id", None)
            if cid:
                hq = hq.filter(Holiday.company_id == cid)
        for h in hq.all():
            hd = _as_date(h.date)
            ds = hd.isoformat()
            if ds in seen_dates:
                continue
            wd = (hd.weekday() + 1) % 7
            if wd in working_weekdays or not working_weekdays:
                holiday += 1
                seen_dates.add(ds)
    except Exception:
        pass

    # Template conversion rules: N lates / early-departures become 1 absent.
    # Applied AFTER missing-checkout reclassification so each day converts at
    # most once; clamped so present never goes negative on overlapping flags.
    try:
        late_n = int(getattr(att_policy, "late_to_absent_count", None) or 0)
    except (TypeError, ValueError):
        late_n = 0
    try:
        early_n = int(getattr(att_policy, "early_to_absent_count", None) or 0)
    except (TypeError, ValueError):
        early_n = 0
    if late_n > 0 and late > 0:
        late_converted = min(late // late_n, present)
        absent += late_converted
        present -= late_converted
    if early_n > 0 and early > 0:
        early_converted = min(early // early_n, present)
        absent += early_converted
        present -= early_converted

    # Policy: treat half-day as full paid day?
    half_day_paid = half_day if att_policy.half_day_as_full_paid else half_day * 0.5
    # Policy: count paid leave as present?
    paid_leave_effective = paid_leave if att_policy.paid_leave_as_present else 0
    # Policy: count holiday as present?
    holiday_effective = holiday if att_policy.holiday_as_present else 0

    paid_days = present + half_day_paid + paid_leave_effective + holiday_effective

    # No-attendance policy: an employee with no attendance rows for the month
    # is NOT auto-paid in full. Salary is only earned for days actually
    # attended, so zero attendance -> zero paid days -> pro-ration pays ₹0.
    # (Previously this fallback silently defaulted to full working days, which
    # overpaid employees who simply had no punches for the period.)
    if not records:
        if employee is not None:
            exit_date = employee.date_of_leaving or employee.termination_date if employee else None
            if (employee.join_date and _as_date(employee.join_date) > end.date()) or \
               (exit_date and _as_date(exit_date) < start.date()):
                paid_days = 0.0  # not employed at all in this month
            else:
                paid_days = 0.0  # employed but no attendance -> no pay
        else:
            paid_days = 0.0

    unpaid_days = absent + unpaid_leave

    # Effective "present" count for reporting: the attendance-status present
    # days plus any half-days / paid-leave / holidays that the policy toggles
    # treat as present. This keeps Present Days in line with how the employee
    # is actually paid (and honours the config toggles).
    effective_present = (
        present
        + (half_day if att_policy.half_day_as_full_paid else 0)
        + paid_leave_effective
        + holiday_effective
    )

    return {
        "days_in_month": dim,
        "working_days": working_days,
        "present_days": effective_present,
        "absent_days": absent,
        "half_days": half_day,
        "leave_days": on_leave,
        "paid_leave_days": paid_leave,
        "unpaid_leave_days": unpaid_leave,
        "holiday_days": holiday,
        "week_off_days": week_off,
        "late_days": late,
        "early_days": early,
        "missing_checkout_days": missing_checkout,
        "late_converted": late_converted,
        "early_converted": early_converted,
        "paid_days": round(paid_days, 2),
        "unpaid_days": unpaid_days,
        "overtime_hours": round(overtime_hours, 2),
    }


def _mark_expenses_reimbursed(db: Session, employee: Employee, year: int, month: int) -> None:
    """Flag picked-up approved expenses as reimbursed once a payroll is generated."""
    try:
        from models import Expense
        exps = (
            db.query(Expense)
            .filter(
                Expense.employee_id == employee.id,
                Expense.deleted_at.is_(None),
                Expense.status == "approved",
                Expense.expense_date >= datetime(year, month, 1),
                Expense.expense_date <= _last_day(year, month),
            )
            .all()
        )
        for e in exps:
            e.status = "reimbursed"
            e.reimbursed_at = datetime.utcnow()
        if exps:
            db.flush()
    except Exception:
        db.rollback()


# ── Component Calculation ──

def _calc_component_value(
    comp: PayrollComponent,
    computed: Dict[str, float],
    monthly_basic: float,
    input_vars: Optional[Dict[str, float]] = None,
    attendance_data: Optional[Dict[str, Any]] = None,
) -> float:
    """Compute a single component's value based on its configuration.

    Supports:
      - fixed: static amount
      - percentage: base_value * calc_value / 100
      - formula: free-form expression (conditionals, comparisons, functions)
      - hourly: hourly_rate * hours_worked
      - piece_rate: rate_per_unit * units_produced
      - tiered: progressive brackets (tiers stored in tiered_config)
      - shift_differential: differential multiplier for specific shift types
    """
    input_vars = input_vars or {}
    attendance_data = attendance_data or {}

    # Determine the base value
    base_name = comp.calculation_base or "basic"
    base_val = computed.get(base_name, 0.0) if base_name in computed else monthly_basic
    if base_name == "basic":
        base_val = monthly_basic
    elif base_name == "gross" and "gross_salary" in computed:
        base_val = computed["gross_salary"]
    elif base_name == "net" and "net_salary" in computed:
        base_val = computed["net_salary"]

    calc_type = comp.calculation_type or "fixed"

    # ── Fixed ──
    if calc_type == "fixed":
        val = float(comp.calculation_value)

    # ── Percentage ──
    elif calc_type == "percentage":
        val = base_val * float(comp.calculation_value) / 100.0

    # ── Formula (with conditionals, comparisons, functions) ──
    elif calc_type == "formula" and comp.formula:
        try:
            ctx = {
                "basic": monthly_basic,
                "base": base_val,
                "rate": float(comp.calculation_value),
                **computed,
                **input_vars,  # inject per-employee inputs (units_produced, hours_worked, etc.)
                **attendance_data,  # inject overtime_hours, night_shift_hours, etc.
            }
            val = _safe_eval(comp.formula, ctx)
            val = float(val)
        except Exception as e:
            logger.warning("Formula evaluation failed for component %s: %s", comp.name, e)
            val = 0.0

    # ── Hourly: hourly_rate * hours_worked ──
    elif calc_type == "hourly":
        hourly_rate = float(comp.calculation_value)  # rate per hour
        hours = float(input_vars.get("hours_worked", 0) or attendance_data.get("hours_worked", 0))
        val = hourly_rate * hours

    # ── Piece Rate: rate_per_unit * units_produced ──
    elif calc_type == "piece_rate":
        rate_per_unit = float(comp.calculation_value)
        units = float(input_vars.get("units_produced", 0))
        val = rate_per_unit * units

    # ── Tiered: progressive brackets ──
    elif calc_type == "tiered" and comp.tiered_config:
        tiers = comp.tiered_config  # [{"from": 0, "to": 40, "rate": 1.0}, ...]
        quantity = float(input_vars.get("quantity", 0) or attendance_data.get("overtime_hours", 0))
        val = 0.0
        for tier in sorted(tiers, key=lambda t: t.get("from", 0)):
            tier_from = float(tier.get("from", 0) or 0)
            tier_to_raw = tier.get("to")
            tier_to = float(tier_to_raw) if tier_to_raw is not None else float("inf")
            tier_rate = float(tier.get("rate", 0))
            if quantity > tier_from:
                taxable = min(quantity, tier_to) - tier_from
                val += taxable * tier_rate
        # If tiers use percentage multipliers, apply to base
        if comp.calculation_value and comp.calculation_value != 1.0:
            val = base_val * val / 100.0 if comp.calculation_value <= 100 else val

    # ── Shift Differential: apply multiplier based on shift type ──
    elif calc_type == "shift_differential" and comp.shift_differential_config:
        # shift_differential_config: {"day": 1.0, "evening": 1.15, "night": 1.25}
        shift_name = attendance_data.get("shift_type", "day")
        multiplier = float(comp.shift_differential_config.get(shift_name, 1.0))
        hours = float(input_vars.get("hours_worked", 0) or attendance_data.get("hours_worked", 0))
        hourly_rate = float(comp.calculation_value)  # base hourly rate
        val = hourly_rate * hours * multiplier

    else:
        val = 0.0

    # Apply caps
    if comp.max_cap is not None:
        val = min(val, float(comp.max_cap))
    if comp.min_cap is not None:
        val = max(val, float(comp.min_cap))

    return val


# ── Tax Calculation ──

def _get_annual_tax(annual_taxable_income: float, regime: TaxRegime) -> float:
    """Compute income tax using organization-defined tax regime and slabs.

    When no TaxRegime is configured, returns 0.0 — no country's tax slabs
    are used as a global default. The user MUST configure tax slabs for their
    country/jurisdiction.
    """
    if not regime or not regime.slabs:
        return 0.0

    slabs = regime.slabs

    tax = 0.0
    prev = 0.0
    for slab in sorted(slabs, key=lambda s: s.from_amount):
        upper = slab.to_amount if slab.to_amount is not None else float("inf")
        if annual_taxable_income > prev:
            taxable = min(annual_taxable_income, upper) - prev
            if taxable > 0:
                tax += taxable * slab.rate / 100.0
        prev = upper

    # Rebate (DB-driven, no hardcoded defaults)
    rebate_threshold = getattr(regime, 'rebate_threshold', None)
    if rebate_threshold and annual_taxable_income <= rebate_threshold:
        rebate = getattr(regime, 'rebate_amount', None) or tax
        tax = max(0.0, tax - rebate)

    # Cess (DB-driven, defaults to 0)
    cess_rate = getattr(regime, 'cess_rate', None) or 0.0
    cess = tax * cess_rate / 100.0
    tax += cess

    return tax


# ── Main Payroll Calculation ──

def _compute_attendance_payout(
    db: Session,
    employee: Employee,
    month: int,
    year: int,
    att_policy: AttendancePolicy,
    pay_policy: PayrollPolicy,
) -> dict:
    """Shared attendance + pro-ration resolver used by BOTH payroll and FnF.

    Returns the attendance counts, the effective employment window for the
    period, and the pro-ration factor so the final-month salary in a Full &
    Final settlement agrees exactly with what a payroll run would produce.
    """
    from datetime import date as _d

    def _as_day(v):
        if not v:
            return None
        return v.date() if hasattr(v, 'date') else v

    dim = _days_in_month(year, month)
    month_start = _d(year, month, 1)
    month_end = _d(year, month, dim)
    join_day = _as_day(employee.join_date)
    exit_day = _as_day(employee.date_of_leaving) or _as_day(employee.termination_date)

    employed_this_month = True
    if join_day and join_day > month_end:
        employed_this_month = False
    if exit_day and exit_day < month_start:
        employed_this_month = False

    att = _get_attendance_counts(db, employee.id, year, month, att_policy, employee)
    paid_days = float(att["paid_days"] or 0)
    working_days = float(att["working_days"] or 0)

    proration = (pay_policy.pro_ration_method or "paid_days").lower()
    if not employed_this_month:
        factor = 0.0
    elif proration in ("none", "no_pro_ration", "full", "not_applicable"):
        factor = 1.0
    elif proration in ("present_days", "present"):
        denom = working_days if working_days > 0 else dim
        factor = (att["present_days"] / denom) if denom > 0 else 1.0
    elif proration in ("calendar_days", "calendar"):
        factor = (paid_days / dim) if dim > 0 else 1.0
    else:  # paid_days / working_days
        denom = working_days if working_days > 0 else dim
        factor = (paid_days / denom) if denom > 0 else 1.0
    factor = min(1.0, max(0.0, factor))

    return {
        "days_in_month": dim,
        "working_days": working_days,
        "present_days": float(att.get("present_days") or 0),
        "absent_days": float(att.get("absent_days") or 0),
        "half_days": float(att.get("half_days") or 0),
        "leave_days": float(att.get("leave_days") or 0),
        "paid_leave_days": float(att.get("paid_leave_days") or 0),
        "unpaid_leave_days": float(att.get("unpaid_leave_days") or 0),
        "holiday_days": float(att.get("holiday_days") or 0),
        "late_days": float(att.get("late_days") or 0),
        "early_days": float(att.get("early_days") or 0),
        "missing_checkout_days": float(att.get("missing_checkout_days") or 0),
        "late_converted": float(att.get("late_converted") or 0),
        "early_converted": float(att.get("early_converted") or 0),
        "overtime_hours": float(att.get("overtime_hours") or 0),
        "paid_days": paid_days,
        "unpaid_days": float(att.get("unpaid_days") or 0),
        "factor": factor,
        "employed_this_month": employed_this_month,
        "month_start": month_start,
        "month_end": month_end,
    }


def calculate_payroll(
    db: Session,
    employee: Employee,
    month: int,
    year: int,
    *,
    # Override earnings
    override_basic: Optional[float] = None,
    override_hra: Optional[float] = None,
    override_da: Optional[float] = None,
    override_conveyance: Optional[float] = None,
    override_medical: Optional[float] = None,
    override_special: Optional[float] = None,
    override_overtime: Optional[float] = None,
    override_bonus: Optional[float] = None,
    override_commission: Optional[float] = None,
    override_incentive: Optional[float] = None,
    override_other_earnings: Optional[float] = None,
    # Override deductions
    override_pf_deduction: Optional[float] = None,
    override_esi_deduction: Optional[float] = None,
    override_professional_tax: Optional[float] = None,
    override_tds: Optional[float] = None,
    override_loan_deduction: Optional[float] = None,
    override_advance_deduction: Optional[float] = None,
    override_other_deductions: Optional[float] = None,
) -> dict:
    """
    Calculate payroll for one employee for the given month/year using
    the organization's configurable policies.

    Returns a dict with all computed values ready to persist.
    """
    dim = _days_in_month(year, month)

    # ── Employment window (mid-month join / exit awareness) ──
    from datetime import date as _date
    def _as_day(v):
        if not v:
            return None
        return v.date() if hasattr(v, 'date') else v
    month_start = _date(year, month, 1)
    month_end = _date(year, month, dim)
    join_day = _as_day(employee.join_date)
    exit_day = _as_day(employee.date_of_leaving) or _as_day(employee.termination_date)
    employed_this_month = True
    if join_day and join_day > month_end:
        employed_this_month = False
    if exit_day and exit_day < month_start:
        employed_this_month = False

    # ── Load Policies ──
    payroll_template = _get_employee_template(db, employee)
    pay_policy = _get_payroll_policy(db, employee)
    att_policy = _get_attendance_policy(db, employee, _date(year, month, dim))
    scoped_payroll = resolve_scoped_payroll_config(db, employee)
    stat_settings = _get_statutory_settings(db, employee, scoped_payroll, payroll_template)
    jurisdiction_country = _effective_country(employee, scoped_payroll, payroll_template)
    tax_regime = _get_tax_regime(db, employee)
    components = _get_components(db, pay_policy)
    rounding = pay_policy.rounding_method
    places = pay_policy.decimal_places

    # ── Attendance ──
    payout = _compute_attendance_payout(db, employee, month, year, att_policy, pay_policy)
    att = payout
    paid_days = payout["paid_days"]
    working_days = payout["working_days"]
    dim = payout["days_in_month"]
    employed_this_month = payout["employed_this_month"]
    factor = payout["factor"]

    # ── Base Salary ──
    # Monthly base in effect for this month: revision (annual-denominated) or
    # the employee's base_salary interpreted by their pay_frequency
    # (daily / weekly / monthly / annual). See _get_effective_monthly_base.
    monthly_basic = _get_effective_monthly_base(db, employee, year, month)

    # ── Custom salary components from the Salary tab (if provided) ──
    # The employee form's Salary tab stores per-field monthly amounts in
    # `employee.salary_components`. When present, those exact values drive
    # payroll instead of the policy-percentage breakdown. An effective-dated
    # SalaryRevision with its own components takes precedence so a salary hike
    # affects the payslip from the effective month.
    component_detail: List[Dict[str, Any]] = []
    component_deduction_total = 0.0
    computed: Dict[str, float] = {}
    custom_comps = _effective_salary_components(db, employee, year, month)
    if any(custom_comps.get(k) for k in (
        "basic", "hra", "specialAllowance", "otherAllowance",
        "conveyance", "medical", "travel", "performanceBonus",
    )):
        def _cc(key):
            try:
                return float(custom_comps.get(key) or 0)
            except (TypeError, ValueError):
                return 0.0
        basic = _cc("basic")
        hra = _cc("hra")
        da = _cc("da") or 0.0
        conveyance = _cc("conveyance")
        medical = _cc("medical")
        special_allowance = _cc("specialAllowance") or _cc("special_allowance")
        other_allowance = _cc("otherAllowance") or _cc("other_allowance")
        travel = _cc("travel")
        performance_bonus = _cc("performanceBonus") or _cc("performance_bonus")
        basic_full = basic

        # Pro-rate for partial attendance
        basic = _round_val(basic * factor, rounding, places)
        hra = _round_val(hra * factor, rounding, places)
        da = _round_val(da * factor, rounding, places)
        conveyance = _round_val(conveyance * factor, rounding, places)
        medical = _round_val(medical * factor, rounding, places)
        special_allowance = _round_val(special_allowance * factor, rounding, places)
        other_allowance = _round_val(other_allowance * factor, rounding, places)
        travel = _round_val(travel * factor, rounding, places)
        performance_bonus = _round_val(performance_bonus * factor, rounding, places)

        # Overrides win
        basic = override_basic if override_basic is not None else basic
        hra = override_hra if override_hra is not None else hra
        da = override_da if override_da is not None else da
        conveyance = override_conveyance if override_conveyance is not None else conveyance
        medical = override_medical if override_medical is not None else medical
        special_allowance = override_special if override_special is not None else special_allowance

        gross_salary = _round_val(
            basic + hra + da + conveyance + medical + special_allowance + other_allowance + travel + performance_bonus,
            rounding, places,
        )
        computed = {
            "basic": basic,
            "hra": hra,
            "da": da,
            "conveyance": conveyance,
            "medical": medical,
            "special_allowance": special_allowance,
            "other_allowance": other_allowance,
            "travel": travel,
            "performance_bonus": performance_bonus,
            "gross_salary": gross_salary,
        }
    elif not components:
        # ── Load Salary Template (legacy support) ──
        template = None
        if employee.salary_template_id:
            template = db.query(SalaryTemplate).filter(
                SalaryTemplate.id == employee.salary_template_id,
                SalaryTemplate.organization_id == employee.organization_id,
                SalaryTemplate.status == "active",
            ).first()

        # ── Compute Components ──
        if template:
            basic = monthly_basic * (template.basic_percent / 100) if template.basic_percent else monthly_basic
            hra = basic * (template.hra_percent / 100) if template.hra_percent else 0
            special_allowance = monthly_basic * (template.special_allowance_percent / 100) if template.special_allowance_percent else 0
            other_allowance = monthly_basic * (template.other_allowance_percent / 100) if template.other_allowance_percent else 0
            da = 0.0
            conveyance = 0.0
            medical = 0.0
        else:
            # Standard zero-config fallback structure: basic = monthly base,
            # HRA = 50% of basic, conveyance 1600, medical 1250. Orgs override
            # any of this with PayrollComponents or a SalaryTemplate.
            basic = monthly_basic
            hra = basic * 0.5
            special_allowance = 0
            other_allowance = 0
            da = 0.0
            conveyance = 1600.0
            medical = 1250.0
        basic_full = basic

        # Pro-rate
        basic = _round_val(basic * factor, rounding, places)
        hra = _round_val(hra * factor, rounding, places)
        da = _round_val(da * factor, rounding, places)
        conveyance = _round_val(conveyance * factor, rounding, places)
        medical = _round_val(medical * factor, rounding, places)
        special_allowance = _round_val(special_allowance * factor, rounding, places)
        other_allowance = _round_val(other_allowance * factor, rounding, places)

        # Overrides
        basic = override_basic if override_basic is not None else basic
        hra = override_hra if override_hra is not None else hra
        da = override_da if override_da is not None else da
        conveyance = override_conveyance if override_conveyance is not None else conveyance
        medical = override_medical if override_medical is not None else medical
        special_allowance = override_special if override_special is not None else special_allowance

        gross_salary = _round_val(basic + hra + da + conveyance + medical + special_allowance + other_allowance, rounding, places)

        computed = {
            "basic": basic,
            "hra": hra,
            "da": da,
            "conveyance": conveyance,
            "medical": medical,
            "special_allowance": special_allowance,
            "other_allowance": other_allowance,
            "gross_salary": gross_salary,
        }
    else:
        # Policy-driven component calculation
        computed["basic"] = monthly_basic
        basic_full = monthly_basic
        component_deduction_keys: List[str] = []

        # Load per-employee per-period input variables (for piece-rate, hourly, commission, etc.)
        input_vars: Dict[str, float] = {}
        try:
            from models import EmployeePayrollInput
            emp_input = db.query(EmployeePayrollInput).filter(
                EmployeePayrollInput.employee_id == employee.id,
                EmployeePayrollInput.year == year,
                EmployeePayrollInput.month == month,
            ).first()
            if emp_input and emp_input.inputs:
                input_vars = {k: float(v) for k, v in emp_input.inputs.items() if v is not None}
        except Exception:
            pass

        # Attendance data for shift differential and overtime tiers
        attendance_data: Dict[str, Any] = {
            "overtime_hours": att.get("overtime_hours", 0),
            "hours_worked": att.get("hours_worked", 0),
            "present_days": att.get("present_days", 0),
            "absent_days": att.get("absent_days", 0),
        }
        # Try to get shift type from attendance records
        try:
            from models import Attendance as AttModel
            shift_records = (
                db.query(AttModel.shift_id)
                .filter(
                    AttModel.employee_id == employee.id,
                    AttModel.date >= datetime(year, month, 1),
                    AttModel.date <= _last_day(year, month),
                    AttModel.shift_id.isnot(None),
                )
                .distinct()
                .all()
            )
            if shift_records:
                from models import Shift
                shift_id = shift_records[0][0]
                shift = db.query(Shift).filter(Shift.id == shift_id).first()
                if shift:
                    attendance_data["shift_type"] = shift.name.lower() if shift.name else "day"
        except Exception:
            pass

        for comp in components:
            raw_val = _calc_component_value(comp, computed, monthly_basic, input_vars, attendance_data)
            if comp.apply_pro_ration:
                raw_val = raw_val * factor
            val = _round_val(raw_val, rounding, places)

            comp_key = comp.name.lower().replace(" ", "_")
            computed[comp_key] = val
            if comp.component_type in ("deduction", "employer_contribution"):
                component_deduction_keys.append(comp_key)

            component_detail.append({
                "component_id": comp.id,
                "name": comp.name,
                "display_name": comp.display_name or comp.name,
                "type": comp.component_type,
                "value": val,
            })

        # Map to standard fields for backward compatibility
        basic = computed.get("basic", monthly_basic)
        hra = computed.get("hra", 0.0)
        da = computed.get("da", 0.0)
        conveyance = computed.get("conveyance", 0.0)
        medical = computed.get("medical", 0.0)
        special_allowance = computed.get("special_allowance", 0.0)
        # Gross = only earning components (deduction components must never inflate earnings)
        gross_salary = sum(
            v for k, v in computed.items()
            if k not in component_deduction_keys
            and k not in ("gross_salary", "net_salary", "total_earnings", "total_deductions")
        )
        gross_salary = _round_val(gross_salary, rounding, places)
        computed["gross_salary"] = gross_salary
        component_deduction_total = _round_val(
            sum(computed.get(k, 0.0) for k in component_deduction_keys), rounding, places,
        )

    # ── Additional Earnings ──
    # Statutory bonus (Payment of Bonus Act, India) — opt-in via org.settings.payroll.statutoryBonus
    if override_bonus is not None:
        bonus = _round_val(float(override_bonus), rounding, places)
    else:
        bonus = _round_val(_get_statutory_bonus(db, employee, year, month, gross_salary, working_days), rounding, places)
    commission = _round_val(float(override_commission or 0), rounding, places)
    incentive = _round_val(float(override_incentive or 0), rounding, places)

    # Overtime: explicit override wins, otherwise auto-computed from attendance
    if override_overtime is not None:
        overtime_pay = _round_val(float(override_overtime), rounding, places)
    else:
        std_hours = float(att_policy.overtime_threshold_hours or 8.0)
        hourly_rate = (basic / working_days / std_hours) if (working_days > 0 and std_hours > 0) else 0.0
        ot_hours = att["overtime_hours"]

        # Check for tiered overtime first (e.g., first 2hrs 1.5x, next 2hrs 2x)
        if att_policy.overtime_tiers:
            overtime_pay = 0.0
            for tier in sorted(att_policy.overtime_tiers, key=lambda t: t.get("from_hours", 0)):
                tier_from = float(tier.get("from_hours", 0))
                tier_to = float(tier.get("to_hours", float("inf")))
                tier_rate = float(tier.get("rate", 1.0))
                if ot_hours > tier_from:
                    taxable = min(ot_hours, tier_to) - tier_from
                    overtime_pay += taxable * hourly_rate * tier_rate
        else:
            overtime_pay = ot_hours * hourly_rate * float(att_policy.overtime_rate or 1.5)
        overtime_pay = _round_val(overtime_pay, rounding, places)

    # Expense reimbursements flow into payroll automatically: any approved or
    # reimbursed expense dated in this pay period is added to the payslip as
    # an "other earning" (reimbursement), so payroll always matches what HR
    # approved in the expenses module.
    expense_reimbursement = 0.0
    expense_items = []
    try:
        from models import Expense
        exps = (
            db.query(Expense)
            .filter(
                Expense.employee_id == employee.id,
                Expense.deleted_at.is_(None),
                Expense.status.in_(["approved", "reimbursed"]),
                Expense.expense_date >= datetime(year, month, 1),
                Expense.expense_date <= _last_day(year, month),
            )
            .all()
        )
        for e in exps:
            expense_reimbursement += float(e.amount or 0)
            expense_items.append({
                "id": e.id,
                "category": e.category,
                "amount": float(e.amount or 0),
                "date": str(e.expense_date),
            })
    except Exception as _e:
        print(f"Expense→payroll pickup failed for emp {employee.id}: {_e}")

    # Salary arrears (backdated revision) + leave encashment feed other earnings
    arrears = _get_arrears(db, employee, year, month)
    leave_encashment = _get_leave_encashment(db, employee, year, month, monthly_basic, working_days)
    other_earnings = _round_val(float(override_other_earnings or 0) + expense_reimbursement + arrears + leave_encashment, rounding, places)
    total_earnings = _round_val(
        gross_salary + overtime_pay + bonus + commission + incentive + other_earnings,
        rounding, places,
    )
    if component_detail:
        if arrears:
            component_detail.append({
                "component_id": None, "name": "Arrears", "display_name": "Salary Arrears",
                "type": "earnings", "value": arrears,
            })
        if leave_encashment:
            component_detail.append({
                "component_id": None, "name": "Leave Encashment", "display_name": "Leave Encashment",
                "type": "earnings", "value": leave_encashment,
            })

    # ── State Compliance (auto PT/LWF from org's registered_state) ──
    try:
        from datetime import date as _date
        period_date = _date(year, month, 1)
    except Exception:
        period_date = None
    state_compliance = _apply_state_compliance(
        stat_settings, employee, gross_salary, basic, jurisdiction_country,
        db=db, as_of=period_date,
    )

    # ── Statutory Deductions (from policy + state compliance) ──
    # If the salary tab provided explicit monthly deduction amounts, those win
    # (they already include the smart PF cap). Otherwise compute from policy.
    custom_pf = custom_comps.get("pf")
    custom_esi = custom_comps.get("esi")
    custom_pt = custom_comps.get("professionalTax")

    # ESI wage base follows published 'wage_definition' rules when present
    # (mandate: every statutory module names its wage base through rules).
    _esi_wages_base = gross_salary
    _rb_esi = _rule_wage_bases(db, employee, basic, gross_salary, computed.get("da", 0.0) or 0.0, month_start)
    if _rb_esi is not None and _rb_esi.get("ESI_WAGES") is not None:
        _esi_wages_base = float(_rb_esi["ESI_WAGES"])

    # PF — Rule Engine first, then fallback to legacy StatutorySetting
    pf_applicable = stat_settings.pf_applicable
    pf_edli = 0.0
    pf_admin = 0.0
    if custom_pf:
        pf_employee = _round_val(float(custom_pf), rounding, places)
        pf_employer = _round_val(float(custom_pf), rounding, places)
    elif pf_applicable:
        _pf_as_of = month_start
        _pf_rule_engine = _get_rule_engine(db, employee, _pf_as_of)
        _pf_state_code = getattr(employee, 'state_code', None) or getattr(employee, 'work_state', None)
        _pf_result = _resolve_pf_from_rule_engine(
            _pf_rule_engine, basic, _pf_as_of,
            jurisdiction_country, _pf_state_code, employee.organization_id,
        )
        if _pf_result:
            # Rule engine found an active rule — use it
            pf_wages = _pf_result['pf_wages']
            pf_exempt = _pf_result['pf_exempt']
            pf_employee = _round_val(_pf_result['pf_employee'], rounding, places)
            pf_employer = _round_val(_pf_result['pf_employer'], rounding, places)
            pf_edli = _round_val(_pf_result['edli'], rounding, places)
            pf_admin = _round_val(_pf_result['admin'], rounding, places)
            # Employer split for compliance reporting
            if component_detail and not pf_exempt:
                component_detail.extend([
                    {"component_id": None, "name": "PF Employer (EPS)", "display_name": "PF Employer (EPS)", "type": "employer_contribution", "value": _round_val(_pf_result['eps'], rounding, places)},
                    {"component_id": None, "name": "PF Employer (EDLIS)", "display_name": "PF Employer (EDLIS)", "type": "employer_contribution", "value": pf_edli},
                    {"component_id": None, "name": "PF Employer (Admin)", "display_name": "PF Employer (Admin)", "type": "employer_contribution", "value": pf_admin},
                ])
        else:
            # No rule engine rule — fall back to legacy StatutorySetting.
            # PF is charged on EARNED basic (pro-rated for partial months).
            pf_exempt = bool(stat_settings.pf_min_basic_for_exclusion and basic > stat_settings.pf_min_basic_for_exclusion)
            pf_ceiling = float(getattr(stat_settings, "pf_wage_ceiling", None) or stat_settings.pf_min_basic_for_exclusion or 15000.0)
            pf_wages = min(basic, pf_ceiling)
            _rb = _rule_wage_bases(db, employee, basic, gross_salary, computed.get("da", 0.0) or 0.0, month_start)
            if _rb is not None and _rb.get("PF_WAGES") is not None:
                pf_wages = float(_rb["PF_WAGES"])
            if pf_exempt:
                pf_employee = 0.0
                pf_employer = 0.0
            else:
                pf_employee = min(pf_wages * stat_settings.pf_employee_rate / 100, stat_settings.pf_max_monthly)
                pf_employer = _round_val(
                    min(pf_wages * stat_settings.pf_employer_rate / 100, stat_settings.pf_max_monthly),
                    rounding, places,
                )
            pf_employee = _round_val(pf_employee, rounding, places)
            pf_edli = 0.0
            pf_admin = 0.0
            if not pf_exempt:
                pf_edli_rate = float(getattr(stat_settings, "pf_edli_rate", None) or 0.5)
                pf_edli_max = float(getattr(stat_settings, "pf_edli_max_monthly", None) or 75.0)
                pf_admin_rate = float(getattr(stat_settings, "pf_admin_rate", None) or 0.5)
                pf_admin_min = float(getattr(stat_settings, "pf_admin_min_monthly", None) or 75.0)
                pf_edli = _round_val(min(pf_wages * pf_edli_rate / 100, pf_edli_max), rounding, places)
                pf_admin = _round_val(max(pf_wages * pf_admin_rate / 100, pf_admin_min), rounding, places)
                if component_detail:
                    try:
                        eps_ceiling = float(getattr(stat_settings, "eps_wage_ceiling", None) or 15000.0)
                        eps_rate_val = float(getattr(stat_settings, "eps_rate", None) or 8.33)
                        eps_cap = min(pf_wages, eps_ceiling)
                        pf_eps = _round_val(eps_cap * eps_rate_val / 100, rounding, places)
                        component_detail.extend([
                            {"component_id": None, "name": "PF Employer (EPS)", "display_name": "PF Employer (EPS)", "type": "employer_contribution", "value": pf_eps},
                            {"component_id": None, "name": "PF Employer (EDLIS)", "display_name": "PF Employer (EDLIS)", "type": "employer_contribution", "value": pf_edli},
                            {"component_id": None, "name": "PF Employer (Admin)", "display_name": "PF Employer (Admin)", "type": "employer_contribution", "value": pf_admin},
                        ])
                    except Exception:
                        pass
    else:
        pf_employee = 0.0
        pf_employer = 0.0
    pf_employee = override_pf_deduction if override_pf_deduction is not None else pf_employee

    # ESI — Rule Engine first, then fallback to legacy StatutorySetting
    _esi_rule_engine = _get_rule_engine(db, employee, month_start)
    _esi_state_code = getattr(employee, 'state_code', None) or getattr(employee, 'work_state', None)
    _esi_result = _resolve_esi_from_rule_engine(
        _esi_rule_engine, gross_salary, month_start,
        jurisdiction_country, _esi_state_code, employee.organization_id,
    )
    if _esi_result:
        esi_applicable = _esi_result['esi_applicable']
    else:
        esi_applicable = stat_settings.esi_applicable and gross_salary <= stat_settings.esi_gross_ceiling
    if custom_esi:
        esi = _round_val(float(custom_esi), rounding, places)
    else:
        if _esi_result:
            esi = _round_val(_esi_result['esi_employee'], rounding, places)
        else:
            esi = _round_val(_esi_wages_base * stat_settings.esi_employee_rate / 100, rounding, places) if esi_applicable else 0.0
    esi = override_esi_deduction if override_esi_deduction is not None else esi
    if _esi_result:
        esi_employer = _round_val(_esi_result['esi_employer'], rounding, places)
    else:
        esi_employer = _round_val(_esi_wages_base * stat_settings.esi_employer_rate / 100, rounding, places) if esi_applicable else 0.0

    # Professional Tax — Rule Engine first, then fallback
    _pt_rule_engine = _get_rule_engine(db, employee, month_start)
    _pt_state_code = getattr(employee, 'state_code', None) or getattr(employee, 'work_state', None)
    _pt_from_re = _resolve_pt_from_rule_engine(
        _pt_rule_engine, gross_salary, month_start,
        jurisdiction_country, _pt_state_code, employee.organization_id,
    )
    if custom_pt:
        professional_tax = _round_val(float(custom_pt), rounding, places)
    elif _pt_from_re is not None:
        professional_tax = _round_val(_pt_from_re, rounding, places)
    elif state_compliance["state_code"]:
        pt_applicable = state_compliance["pt_applicable"]
        professional_tax = state_compliance["pt_amount"]
    else:
        is_india = str(jurisdiction_country or "India").strip().lower() in ("india", "in", "")
        if is_india:
            # India with no registered state falls back to the statutory
            # default slab table ("other" states: 0 below 15k, 200/month).
            professional_tax = calculate_pt(gross_salary, "other")
            if stat_settings.pt_applicable and stat_settings.pt_monthly_amount and basic > stat_settings.pt_min_gross:
                professional_tax = stat_settings.pt_monthly_amount
        else:
            # Non-India jurisdictions use only their configured setting.
            pt_applicable = stat_settings.pt_applicable and basic > stat_settings.pt_min_gross
            professional_tax = stat_settings.pt_monthly_amount if pt_applicable else 0.0
    professional_tax = _round_val(professional_tax, rounding, places)
    professional_tax = override_professional_tax if override_professional_tax is not None else professional_tax

    # LWF (auto from state compliance, fallback to static settings)
    if state_compliance["state_code"]:
        lwf_applicable = state_compliance["lwf_applicable"]
        lwf_employee = state_compliance["lwf_employee"]
        lwf_employer = state_compliance["lwf_employer"]
    else:
        lwf_employee = _round_val(
            basic * stat_settings.lwf_employee_rate / 100, rounding, places
        ) if stat_settings.lwf_applicable else 0.0
        lwf_employer = _round_val(
            basic * stat_settings.lwf_employer_rate / 100, rounding, places
        ) if stat_settings.lwf_applicable else 0.0

    # Gratuity — Rule Engine first, then fallback
    gratuity_applicable = bool(pay_policy.include_gratuity or stat_settings.gratuity_applicable)
    gratuity_rate = pay_policy.gratuity_rate if pay_policy.gratuity_rate is not None else (stat_settings.gratuity_rate or 4.81)
    _grat_engine = _get_rule_engine(db, employee, month_start)
    _grat_rate_rule = _grat_engine.resolve('gratuity', month_start, jurisdiction_country, None, employee.organization_id)
    if _grat_rate_rule:
        gratuity = _round_val(_grat_engine.calculate_gratuity(basic, month_start, jurisdiction_country, employee.organization_id), rounding, places)
    else:
        gratuity = _round_val(basic * (gratuity_rate / 100), rounding, places) if gratuity_applicable else 0.0

    # NPS (Retirement & Pension engine) - turned on by the employee flag or a
    # published 'nps' rule; rates/basis/ceilings all come from the rule.
    nps_employee = 0.0
    nps_employer = 0.0
    nps_breakdown = None
    try:
        from services.retirement_engine import calculate_nps
        _nps = calculate_nps(
            db, employee,
            {"BASIC": basic, "DA": da, "GROSS": gross_salary},
            as_of=month_start,
        )
        if _nps and _nps.get("applicable"):
            nps_employee = _round_val(_nps["employee"], rounding, places)
            nps_employer = _round_val(_nps["employer"], rounding, places)
            nps_breakdown = _nps.get("breakdown")
    except Exception:
        nps_employee = 0.0
        nps_employer = 0.0

    # Perquisites (taxable employer-provided benefits) - rule-driven valuation.
    # Items ride in EmployeePayrollInput.inputs["perquisites"] for the period.
    taxable_perquisites = 0.0
    perquisite_breakdown = []
    try:
        _perk_items = []
        try:
            from models import EmployeePayrollInput as _EPI
            _pi = db.query(_EPI).filter(
                _EPI.employee_id == employee.id,
                _EPI.year == year, _EPI.month == month,
            ).first()
            if _pi and _pi.inputs:
                _perk_items = _pi.inputs.get("perquisites") or []
        except Exception:
            _perk_items = []
        if _perk_items:
            from services.perquisite_engine import calculate_perquisites
            _perks = calculate_perquisites(
                db, employee, _perk_items,
                {"BASIC": basic, "DA": da, "GROSS": gross_salary},
                as_of=month_start,
            )
            taxable_perquisites = _round_val(_perks["taxable_total"], rounding, places)
            perquisite_breakdown = _perks["breakdown"]
    except Exception:
        taxable_perquisites = 0.0

    # ── Income Tax (TDS) — CUMULATIVE, declaration-aware ──
    # Projects the full financial year, applies the employee's investment
    # declaration + previous-employer income/TDS, then subtracts TDS already
    # deducted YTD so the current month reconciles with the year's progress.
    if override_tds is not None:
        tds = _round_val(float(override_tds), rounding, places)
        income_tax = tds
        surcharge = 0.0
        cess = 0.0
        tds_meta = None
    else:
        tds_meta = _compute_cumulative_tds(
            db, employee, year, month,
            total_earnings, pf_employee, professional_tax,
            tax_regime, rounding, places,
            taxable_benefits=taxable_perquisites,
        )
        tds = tds_meta["tds"]
        income_tax = tds_meta["tds"]
        surcharge = tds_meta["surcharge"]
        cess = tds_meta["cess"]

    # ── Other Deductions ──
    # Active loans/advances auto-feed the deduction unless an explicit override is given
    if override_loan_deduction is not None:
        loan_deduction = _round_val(float(override_loan_deduction), rounding, places)
    else:
        loan_deduction = _round_val(_get_loan_deduction_total(db, employee, year, month), rounding, places)
    advance_deduction = _round_val(float(override_advance_deduction or 0), rounding, places)
    other_deductions = _round_val(float(override_other_deductions or 0), rounding, places)

    total_deductions = _round_val(
        pf_employee + esi + professional_tax + lwf_employee + tds
        + nps_employee
        + component_deduction_total
        + loan_deduction + advance_deduction + other_deductions,
        rounding, places,
    )

    # ── Net Salary ──
    net_salary = _round_val(total_earnings - total_deductions, rounding, places)
    if not pay_policy.allow_negative_net and net_salary < 0:
        net_salary = _round_val(max(0.0, total_earnings - total_deductions), rounding, places)

    # Minimum wage compliance (mandate section 25): warnings only - the engine
    # never silently accepts under-payment, but it also never mutates payroll.
    minimum_wage = None
    try:
        from services.minimum_wage_engine import check_minimum_wages
        _mw_state = (
            getattr(employee, "state_code", None)
            or getattr(employee, "work_state", None)
            or (getattr(employee.organization, "registered_state", None) if employee.organization else None)
        )
        minimum_wage = check_minimum_wages(
            db, employee.organization_id,
            {
                "monthly": gross_salary,
                "daily": _round_val(gross_salary / 30.0, 2) if gross_salary else None,
            },
            as_of=month_start,
            state_code=_mw_state,
            company_id=employee.company_id,
        )
    except Exception:
        minimum_wage = None

    return {
        "employee_id": employee.id,
        "month": month,
        "year": year,
        "organization_id": employee.organization_id,
        "department_id": employee.department_id,
        # Earnings
        "basic_salary": basic,
        "hra": hra,
        "da": da,
        "conveyance": conveyance,
        "medical": medical,
        "special_allowance": special_allowance,
        "gross_salary": gross_salary,
        # Additional earnings
        "overtime_pay": overtime_pay,
        "bonus": bonus,
        "commission": commission,
        "incentive": incentive,
        "other_earnings": other_earnings,
        "arrears": arrears,
        "leave_encashment": leave_encashment,
        "expense_reimbursement": expense_reimbursement,
        "expense_items": expense_items,
        "total_earnings": total_earnings,
        # Statutory deductions
        "pf_deduction": pf_employee,
        "pf_employer_contribution": pf_employer,
        "pf_edli_contribution": pf_edli,
        "pf_admin_contribution": pf_admin,
        "esi_deduction": esi,
        "esi_employer_contribution": esi_employer,
        "professional_tax": professional_tax,
        "lwf_deduction": lwf_employee,
        "lwf_employer_contribution": lwf_employer,
        "gratuity": gratuity,
        "nps_deduction": nps_employee,
        "nps_employer_contribution": nps_employer,
        "nps_breakdown": nps_breakdown,
        # Tax
        "tds_deduction": tds,
        "income_tax": income_tax,
        "surcharge": surcharge,
        "cess": cess,
        "tds_meta": tds_meta,
        "taxable_perquisites": taxable_perquisites,
        "perquisite_breakdown": perquisite_breakdown,
        "minimum_wage": minimum_wage,
        # Other deductions
        "loan_deduction": loan_deduction,
        "advance_deduction": advance_deduction,
        "other_deductions": other_deductions,
        "total_deductions": total_deductions,
        # Net
        "net_salary": net_salary,
        # Attendance
        "working_days": att["working_days"],
        "present_days": att["present_days"],
        "absent_days": att["absent_days"],
        "paid_days": paid_days,
        "unpaid_days": att["unpaid_days"],
        "leave_days": att["leave_days"],
        "half_days": att.get("half_days", 0),
        "holiday_days": att.get("holiday_days", 0),
        "week_off_days": att.get("week_off_days", 0),
        "overtime_hours": att.get("overtime_hours", 0),
        # Policy detail
        "payroll_policy_id": pay_policy.id if pay_policy.id else None,
        "component_breakdown": component_detail if component_detail else None,
        # Jurisdiction snapshot (country/state in force for this period)
        "country": jurisdiction_country,
        "registered_state": (getattr(employee.organization, "registered_state", None) or None) if jurisdiction_country.lower() == "india" else None,
        # Status
        "status": "draft",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }


def generate_payroll_record(
    db: Session,
    employee: Employee,
    month: int,
    year: int,
    **overrides,
) -> Payroll:
    """Calculate and persist a Payroll record using policy-driven engine."""
    data = calculate_payroll(db, employee, month, year, **overrides)
    data["company_id"] = employee.company_id
    data["organization_id"] = employee.organization_id
    # Snapshot bank details for disbursement at generation time.
    data["bank_account"] = employee.bank_account_number or None
    data["ifsc_code"] = employee.ifsc_code or None
    # Only persist columns that exist on the Payroll model
    valid = {c.name for c in Payroll.__table__.columns}
    payload = {k: v for k, v in data.items() if k in valid}
    payroll = Payroll(**payload)
    db.add(payroll)
    db.commit()
    db.refresh(payroll)
    # Explainability: persist WHY each figure is what it is (rule/version/
    # formula/inputs) next to the result, per mandate section 43.
    try:
        from services.payroll_explain import build_explain_lines, save_explain_lines
        lines = build_explain_lines(
            data, db=db, employee=employee,
            as_of=_date(year, month, 1),
        )
        save_explain_lines(db, payroll, lines)
    except Exception:
        # The payroll itself is already committed; a failed explainability
        # save must never poison the session or the generation flow.
        db.rollback()
        logger.exception("Failed to persist payroll explainability lines")
    try:
        _apply_loan_amortization(db, employee, year, month)
        _consume_encashed_leave(db, employee, year)
        _mark_expenses_reimbursed(db, employee, year, month)
        db.commit()
    except Exception:
        db.rollback()
    logger.info(f"Payroll generated (policy-driven): employee_id={employee.id}, month={month}, year={year}, net_salary={payroll.net_salary}")
    return payroll
