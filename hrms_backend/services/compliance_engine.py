"""
Indian Payroll Compliance Engine
=================================
Calculates PF, ESI, PT, LWF, Gratuity, Bonus, and TDS per employee per month.

This is the core competitive moat against Keka / greytHR / Zoho People.
"""
from typing import Optional
from datetime import date, datetime
from sqlalchemy.orm import Session
from models import (
    Employee, Payroll, StatutorySetting, TaxRegime, TaxSlab, Organization,
    PayrollComponent, PayrollPolicy, SalaryTemplate,
)
from data.state_compliance import PROFESSIONAL_TAX, LWF as LABOUR_WELFARE_FUND


# ── PF Calculation ────────────────────────────────────────────────────────

def calculate_pf(gross_basic: float, setting: StatutorySetting) -> dict:
    """Calculate PF contributions as per Employee Provident Fund & MP Act 1952.
    
    Splits employer contribution into:
      - PF (A/c 1): (employer_rate - eps_rate - edli_rate) of basic
      - EPS (A/c 10): eps_rate% of basic (capped at eps_wage_ceiling)
      - EDLIS (A/c 21): edli_rate% of basic
      - PF Admin (A/c 2): admin_rate% (paid by employer, not deducted from employee)
    
    All rates read from StatutorySetting — fully configurable per company.
    """
    if not setting.pf_applicable:
        return {"employee": 0, "employer": 0, "eps": 0, "edlis": 0, "admin": 0}

    # Computation base is capped by the wage ceiling — never by the opt-out
    # threshold (those are different statutory concepts that only share a default).
    wage_ceiling = float(getattr(setting, 'pf_wage_ceiling', None) or 0.0) or float(getattr(setting, 'pf_min_basic_for_exclusion', None) or 15000.0)
    capped_basic = min(gross_basic, wage_ceiling)
    
    employee_share = round(capped_basic * setting.pf_employee_rate / 100, 2)
    employee_share = min(employee_share, setting.pf_max_monthly)
    
    employer_share = round(capped_basic * setting.pf_employer_rate / 100, 2)
    
    # EPS — prefer the current eps_employer_rate field, fall back to legacy eps_rate
    eps_rate = float(getattr(setting, 'eps_employer_rate', None) or getattr(setting, 'eps_rate', None) or 0.0)
    eps_ceiling = float(getattr(setting, 'eps_wage_ceiling', None) or 0.0)
    eps = round(min(capped_basic, eps_ceiling) * eps_rate / 100, 2)
    
    # EDLI — read from DB
    edli_rate = float(getattr(setting, 'pf_edli_rate', None) or 0.0)
    edlis = round(capped_basic * edli_rate / 100, 2)
    
    # Admin — read from DB
    admin_rate = float(getattr(setting, 'pf_admin_rate', None) or 0.0)
    admin = round(capped_basic * admin_rate / 100, 2)
    
    return {
        "employee": employee_share,
        "employer": round(employer_share - eps - edlis, 2),
        "eps": eps,
        "edlis": edlis,
        "admin": admin,
        "total_employer": employer_share,
    }


# ── ESI Calculation ───────────────────────────────────────────────────────

# ESIC Rule 52: employees at/below this average daily wage pay no employee
# share (the employer share is still due). Daily wage = monthly gross / 26.
# These are now read from statutory_rule_configs table via _get_statutory_constant().
_ESI_LOW_WAGE_DAILY_AVG_DEFAULT = 176.0
_ESI_WAGE_DAYS_DIVISOR_DEFAULT = 26.0


def _get_statutory_constant(db, rule_key: str, default: float) -> float:
    """Read a statutory constant from the config table, falling back to default.
    
    Uses the global config (organization_id=NULL) so all orgs share the same
    legal constants. When the government changes a rule, update the config
    and every org's engine adapts automatically.
    """
    try:
        from models import StatutoryRuleConfig
        row = db.query(StatutoryRuleConfig).filter(
            StatutoryRuleConfig.rule_key == rule_key,
            StatutoryRuleConfig.organization_id.is_(None),
            StatutoryRuleConfig.status == 'active',
        ).first()
        return float(row.current_value) if row and row.current_value is not None else default
    except Exception:
        return default


def esi_employee_exempt(monthly_gross: float, db=None) -> bool:
    """True when the employee's ESI share is waived under the low-wage rule."""
    try:
        daily_avg = _get_statutory_constant(db, 'esi_wage_days_divisor', _ESI_WAGE_DAYS_DIVISOR_DEFAULT) if db else _ESI_WAGE_DAYS_DIVISOR_DEFAULT
        threshold = _get_statutory_constant(db, 'esi_low_wage_daily_avg', _ESI_LOW_WAGE_DAILY_AVG_DEFAULT) if db else _ESI_LOW_WAGE_DAILY_AVG_DEFAULT
        return (float(monthly_gross or 0) / daily_avg) <= threshold
    except (TypeError, ValueError):
        return False


def calculate_esi(gross_salary: float, setting: StatutorySetting, is_disabled: bool = False,
                  keep_covered: bool = False, db=None) -> dict:
    """Calculate ESI as per ESI Act 1948.

    Employee: 0.75% of gross wages (waived at/below Rs.176 average daily wage
    = monthly/26 per ESIC Rule 52; employer share still due)
    Employer: 3.25% of gross wages
    Applicable for gross wages <= ceiling (Rs.21,000 general, Rs.25,000
    disabled). The ceiling decides coverage, not the amount — a covered
    employee contributes on full gross. keep_covered=True continues
    insurrance to the end of the Apr-Sep / Oct-Mar contribution period even
    after wages cross the ceiling (ESIC contribution-period rule).
    """
    ceiling = float(getattr(setting, 'esi_disabled_ceiling', None) or 0.0) if is_disabled else float(getattr(setting, 'esi_gross_ceiling', None) or 0.0)
    if not setting.esi_applicable or (gross_salary > ceiling and not keep_covered):
        return {"employee": 0, "employer": 0}

    employee = 0.0 if esi_employee_exempt(gross_salary, db) else round(gross_salary * setting.esi_employee_rate / 100, 2)
    return {
        "employee": employee,
        "employer": round(gross_salary * setting.esi_employer_rate / 100, 2),
    }


def esi_period_months(year: int, month: int) -> list:
    """Earlier months of the ESIC contribution period (Apr-Sep / Oct-Mar)."""
    if 4 <= month <= 9:
        return [(year, m) for m in range(4, month)]
    if month >= 10:
        return [(year, m) for m in range(10, month)]
    return [(year - 1, 10), (year - 1, 11), (year - 1, 12)] + [(year, m) for m in range(1, month)]


def esi_covered_earlier(db, employee_id: int, year: int, month: int) -> bool:
    """True when the employee was ESI-insured earlier in the current
    contribution period - coverage continues to the period end even if this
    month's wages cross the ceiling."""
    from sqlalchemy import and_, or_
    from models import Payroll
    prior = esi_period_months(year, month)
    if not prior:
        return False
    window = or_(*[and_(Payroll.year == y, Payroll.month == m) for y, m in prior])
    row = db.query(Payroll.id).filter(
        Payroll.employee_id == employee_id,
        window,
        or_(Payroll.esi_deduction > 0, Payroll.esi_employer_contribution > 0),
    ).first()
    return row is not None


# ── Professional Tax ──────────────────────────────────────────────────────

def _resolve_state_key(state_code: Optional[str]) -> Optional[str]:
    """Resolve a state code/name to the internal snake_case key used by the DB
    tables and the static defaults (e.g. 'KA' -> 'karnataka')."""
    if not state_code:
        return None
    from data.state_compliance import resolve_state_key as _rs
    return _rs(state_code)


def resolve_jurisdiction_state(*candidates) -> Optional[str]:
    """Return the first candidate value that resolves to a known state key.

    Candidates are tried in precedence order, e.g. employee state_code /
    work_state, payroll template registered_state, org registered_state.
    """
    for c in candidates:
        c = (c or "").strip()
        if c and _resolve_state_key(c):
            return c
    return None


def _active_rows_for_scope(db, model, state_key: str, as_of, organization_id=None, company_id=None):
    """Effective-dated rows for a state resolved by scope tier:
    company override -> org override -> platform default -> None (static).

    A tier is all-or-nothing so a partial override can never silently mix
    with a broader tier's slab set. Returns (rows, scope) where scope is
    'company' | 'organization' | 'platform' | None.
    """
    def _q(org, comp):
        q = (
            db.query(model)
            .filter(model.state_code == state_key)
            .filter(model.effective_from <= as_of)
            .filter((model.effective_to.is_(None)) | (model.effective_to >= as_of))
        )
        if org is None:
            q = q.filter(model.organization_id.is_(None))
        else:
            q = q.filter(model.organization_id == org)
            if comp is None:
                q = q.filter(model.company_id.is_(None))
            else:
                q = q.filter(model.company_id == comp)
        return q.all()

    if organization_id is not None and company_id is not None:
        rows = _q(organization_id, company_id)
        if rows:
            return rows, "company"
    if organization_id is not None:
        rows = _q(organization_id, None)
        if rows:
            return rows, "organization"
    rows = _q(None, None)
    if rows:
        return rows, "platform"
    return None, None


def _pt_rows_from_db(
    db, state_key: str, as_of, organization_id: int = None, company_id: int = None,
) -> Optional[list]:
    """Return effective-dated PT slabs for a state, or None to fall back to static."""
    try:
        from models import StatePTSlab
        rows, _scope = _active_rows_for_scope(
            db, StatePTSlab, state_key, as_of, organization_id, company_id,
        )
        if rows:
            rows.sort(key=lambda r: (r.from_gross or 0.0))
        return rows or None
    except Exception:
        return None


def calculate_professional_tax(
    gross_salary: float,
    state_code: Optional[str],
    db: Session = None,
    as_of=None,
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
) -> dict:
    """Calculate Professional Tax based on state-wise slabs.

    Uses the effective-dated DB slabs (StatePTSlab) when present for the period;
    otherwise falls back to the static table in data/state_compliance.py.
    """
    if not state_code:
        return {"amount": 0, "state": None}

    state_key = _resolve_state_key(state_code)
    if not state_key:
        return {"amount": 0, "state": state_code}

    as_of = as_of or datetime.utcnow().date()

    if db is not None:
        rows = _pt_rows_from_db(db, state_key, as_of, organization_id, company_id)
        if rows is not None:
            for slab in rows:
                if slab.from_gross <= gross_salary:
                    if slab.to_gross is None or gross_salary <= slab.to_gross:
                        return {"amount": float(slab.amount), "state": slab.state_name or state_key, "source": "db"}
            return {"amount": 0.0, "state": (rows[0].state_name if rows else state_key) or state_key, "source": "db"}

    state_data = PROFESSIONAL_TAX.get(state_key)
    if not state_data:
        return {"amount": 0, "state": state_code}

    for slab in state_data["slabs"]:
        if slab["from_gross"] <= gross_salary:
            if slab["to_gross"] is None or gross_salary <= slab["to_gross"]:
                return {"amount": slab["amount"], "state": state_data["state_name"], "source": "static"}

    return {"amount": 0, "state": state_data["state_name"], "source": "static"}


# ── LWF Calculation ───────────────────────────────────────────────────────

def _lwf_row_from_db(
    db, state_key: str, as_of, organization_id: int = None, company_id: int = None,
) -> Optional[object]:
    """Return the effective-dated LWF config for a state, or None to fall back to static."""
    try:
        from models import StateLWFConfig
        rows, _scope = _active_rows_for_scope(
            db, StateLWFConfig, state_key, as_of, organization_id, company_id,
        )
        if not rows:
            return None
        rows.sort(key=lambda r: (r.effective_from or date.min), reverse=True)
        return rows[0]
    except Exception:
        return None


def calculate_lwf(
    gross_salary: float,
    state_code: Optional[str],
    db: Session = None,
    as_of=None,
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
) -> dict:
    """Calculate Labour Welfare Fund based on state contribution rules.

    LWF amounts are fixed per state (not percentage-based), e.g.:
      - Karnataka: Employee ₹20/mo, Employer ₹40/mo
      - Maharashtra: Employee ₹12/mo, Employer ₹24/mo
    Applicable only if gross salary <= state's max_wage_for_applicability.

    Uses the effective-dated DB config (StateLWFConfig) when present for the
    period; otherwise falls back to the static table.
    """
    if not state_code:
        return {"employee": 0, "employer": 0, "state": None}

    state_key = _resolve_state_key(state_code)
    if not state_key:
        return {"employee": 0, "employer": 0, "state": state_code}

    as_of = as_of or datetime.utcnow().date()

    if db is not None:
        row = _lwf_row_from_db(db, state_key, as_of, organization_id, company_id)
        if row is not None:
            if not row.applicable:
                return {"employee": 0, "employer": 0, "applicable": False, "state": row.state_name or state_key, "source": "db"}
            max_wage = row.max_wage_for_applicability
            if max_wage and gross_salary > max_wage:
                return {"employee": 0, "employer": 0, "applicable": False, "state": row.state_name or state_key, "source": "db"}
            emp_contrib = float(row.employee_contribution or 0)
            employer_contrib = float(row.employer_contribution or 0)
            frequency = row.frequency or "monthly"
            if frequency == "half_yearly":
                emp_contrib = round(emp_contrib / 6, 2)
                employer_contrib = round(employer_contrib / 6, 2)
            elif frequency == "yearly":
                emp_contrib = round(emp_contrib / 12, 2)
                employer_contrib = round(employer_contrib / 12, 2)
            return {
                "employee": emp_contrib,
                "employer": employer_contrib,
                "applicable": True,
                "state": row.state_name or state_key,
                "frequency": frequency,
                "source": "db",
            }

    state_data = LABOUR_WELFARE_FUND.get(state_key)
    if not state_data or not state_data.get("applicable", False):
        return {"employee": 0, "employer": 0, "state": state_code}

    max_wage = state_data.get("max_wage_for_applicability", 0)
    if max_wage and gross_salary > max_wage:
        return {"employee": 0, "employer": 0, "state": state_data.get("state_name")}

    emp_contrib = state_data.get("employee_contribution", 0)
    employer_contrib = state_data.get("employer_contribution", 0)
    frequency = state_data.get("frequency", "monthly")

    # Convert half-yearly / yearly to a monthly figure
    if frequency == "half_yearly":
        emp_contrib = round(emp_contrib / 6, 2)
        employer_contrib = round(employer_contrib / 6, 2)
    elif frequency == "yearly":
        emp_contrib = round(emp_contrib / 12, 2)
        employer_contrib = round(employer_contrib / 12, 2)

    return {
        "employee": emp_contrib,
        "employer": employer_contrib,
        "state": state_data.get("state_name", state_code),
        "frequency": frequency,
        "source": "static",
    }


# ── Gratuity ──────────────────────────────────────────────────────────────

def _gratuity_act_default(key: str) -> float:
    """Payment of Gratuity Act 1972 constants — single shared source.

    Delegates to gratuity_engine's DEFAULT_GRATUITY_DEFINITION (the same
    definition the statutory_rules 'gratuity' seed mirrors) so the Act
    numbers exist in exactly one Python module.
    """
    try:
        from services.gratuity_engine import gratuity_act_default
        val = gratuity_act_default(key)
        return float(val) if val is not None else 0.0
    except Exception:
        return 0.0


def calculate_gratuity(
    basic_da: float,
    years_of_service: int,
    setting: Optional[StatutorySetting] = None,
    divisor: Optional[float] = None,
) -> dict:
    """Calculate gratuity as per Payment of Gratuity Act 1972.
    
    Formula: (days_per_year * last_drawn_basic_da * years_of_service) / divisor
    Cap: configurable (default ₹20,00,000 tax-free limit)
    Eligibility: configurable (default 5 years)

    Parameters read from StatutorySetting — fully configurable per company.
    When no setting (or a blank field) is supplied, the Payment of Gratuity
    Act 1972 defaults from gratuity_engine.gratuity_act_default apply:
    15 days/year, 5 years eligibility, 26-day divisor, ₹20,00,000 ceiling.
    """
    eligible_years = float(getattr(setting, 'gratuity_eligible_years', None) or 0.0) if setting else 0.0
    days_per_year = float(getattr(setting, 'gratuity_days_per_year', None) or 0.0) if setting else 0.0
    tax_exempt_ceiling = float(getattr(setting, 'gratuity_tax_exempt_ceiling', None) or 0.0) if setting else 0.0

    if eligible_years <= 0:
        eligible_years = _gratuity_act_default("min_years") or 5.0
    if days_per_year <= 0:
        days_per_year = _gratuity_act_default("days_per_year") or 15.0
    if tax_exempt_ceiling <= 0:
        tax_exempt_ceiling = _gratuity_act_default("tax_exempt_ceiling") or 2000000.0
    divisor = float(divisor or 0.0) or _gratuity_act_default("divisor") or 26.0

    if years_of_service < eligible_years:
        return {"amount": 0, "eligible": False, "years_of_service": years_of_service}
    
    amount = (days_per_year * basic_da * years_of_service) / divisor
    return {
        "amount": round(min(amount, tax_exempt_ceiling), 2),
        "eligible": True,
        "years_of_service": years_of_service,
        "capped": amount > tax_exempt_ceiling,
    }


# ── Bonus Calculation ─────────────────────────────────────────────────────

def resolve_bonus_params(db, organization_id: Optional[int] = None) -> dict:
    """Payment of Bonus Act 1965 parameters — the single resolution point.

    Priority per knob: StatutorySetting (org config) → statutory_rule_configs
    (seeded global rows) → Act defaults. Callers pass the result into
    calculate_bonus instead of restating statutory numbers inline.
    """
    setting = None
    if db is not None and organization_id:
        try:
            setting = db.query(StatutorySetting).filter(
                StatutorySetting.organization_id == organization_id,
                StatutorySetting.status == "active",
            ).first()
        except Exception:
            setting = None

    def _knob(field: str, rule_key: str, act_default: float) -> float:
        val = getattr(setting, field, None) if setting is not None else None
        try:
            if val is not None and float(val) > 0:
                return float(val)
        except (TypeError, ValueError):
            pass
        if db is not None:
            return float(_get_statutory_constant(db, rule_key, act_default))
        return act_default

    return {
        "min_rate": _knob("bonus_min_rate", "bonus_min_rate", 8.33),
        "max_rate": _knob("bonus_max_rate", "bonus_max_rate", 20.0),
        "calc_ceiling": _knob("bonus_wage_ceiling", "bonus_wage_ceiling", 7000.0),
        "eligible_ceiling": _knob("bonus_eligible_ceiling", "bonus_eligible_ceiling", 21000.0),
    }


def calculate_bonus(gross_salary: float, months_worked: int, min_rate: float = 8.33,
                    max_rate: float = 20.0, calc_ceiling: float = 7000.0,
                    eligible_ceiling: float = 21000.0) -> dict:
    """Calculate bonus as per Payment of Bonus Act 1965.

    Eligibility: monthly salary within the eligibility ceiling. The payout is
    then computed on salary capped at the calculation ceiling, between the
    minimum and maximum rates. The signature defaults are the Act values;
    callers should resolve org-specific knobs via resolve_bonus_params() and
    pass them in.
    """
    if gross_salary > eligible_ceiling:
        return {"amount": 0, "minimum": 0, "maximum": 0, "eligible": False}

    bonus_wages = min(gross_salary, calc_ceiling)
    annual_salary = bonus_wages * months_worked
    min_bonus = round(annual_salary * min_rate / 100, 2)
    max_bonus = round(annual_salary * max_rate / 100, 2)

    return {
        "minimum": min_bonus,
        "maximum": max_bonus,
        "eligible": True,
        "months_worked": months_worked,
    }


# ── Income Tax / TDS Calculation ──────────────────────────────────────────

def _normalize_tax_slabs(slabs):
    """Normalize ORM rows or dicts to sorted (from, to|None, rate) tuples.
    Rates are clamped to 0-100 so legacy bad rows can never invert money."""
    out = []
    for s in slabs or []:
        if isinstance(s, dict):
            frm = float(s.get("from_amount", s.get("from", 0)) or 0)
            to = s.get("to_amount", s.get("to"))
            rate = float(s.get("rate", 0) or 0)
        else:
            frm = float(getattr(s, "from_amount", 0) or 0)
            to = getattr(s, "to_amount", None)
            rate = float(getattr(s, "rate", 0) or 0)
        rate = max(0.0, min(100.0, rate))
        out.append((frm, float(to) if to is not None else None, rate))
    return sorted(out, key=lambda t: t[0])


def _slab_tax_at(income, slabs):
    """Slab tax for an income using normalized slabs."""
    tax = 0.0
    for frm, to, rate in slabs:
        if income <= frm:
            break
        top = to if to is not None else income
        part = min(income, top) - frm
        if part > 0:
            tax += part * rate / 100.0
    return tax


def apply_tax_relief(slab_tax, taxable_income, slabs,
                     rebate_threshold=0, rebate_amount=0,
                     regime_type="new", surcharge_slabs=None):
    """87A rebate with new-regime marginal relief + surcharge with marginal relief.

    Below/at the threshold the rebate wipes slab tax out. Just above it (new
    regime), tax is capped at the excess over the threshold so a small rise in
    income never costs more in tax than the income gained. Surcharge uses the
    highest threshold crossed, capped at (slab tax at that threshold + excess
    over it) per CBDT marginal-relief rules. Assumes contiguous slabs from 0,
    which is how all seeded and UI-built slab sets are stored.
    Returns (tax_after_rebate, rebate_given, surcharge).
    """
    threshold = float(rebate_threshold or 0)
    cap_amount = float(rebate_amount or 0)
    tax = float(slab_tax)
    rebate = 0.0
    if threshold > 0 and cap_amount > 0:
        if taxable_income <= threshold:
            rebate = min(tax, cap_amount)
            tax = max(0.0, tax - cap_amount)
        elif (regime_type or "new") == "new":
            capped = max(0.0, taxable_income - threshold)
            if tax > capped:
                rebate = tax - capped
                tax = capped
    surcharge = 0.0
    top_from = None
    top_rate = 0.0
    for s in surcharge_slabs or []:
        try:
            if isinstance(s, dict):
                s_from = float(s.get("from", 0))
                s_rate = float(s.get("rate", 0))
            else:
                s_from = float(getattr(s, "from", 0))
                s_rate = float(getattr(s, "rate", 0))
        except (TypeError, ValueError, AttributeError):
            continue
        if taxable_income >= s_from and (top_from is None or s_from >= top_from):
            top_from, top_rate = s_from, s_rate
    if top_from is not None and top_rate > 0:
        surcharge = tax * top_rate / 100.0
        base_at_threshold = _slab_tax_at(top_from, _normalize_tax_slabs(slabs))
        cap_total = base_at_threshold + (taxable_income - top_from)
        if tax + surcharge > cap_total:
            surcharge = max(0.0, cap_total - tax)
    return tax, rebate, surcharge


def calculate_income_tax(annual_gross: float, regime: TaxRegime, slabs: list[TaxSlab],
                         deductions_80c: float = 0, deductions_80d: float = 0,
                         hra_exemption: float = 0, lta_exemption: float = 0,
                         nps_deduction: float = 0, home_loan_interest: float = 0) -> dict:
    """Calculate income tax under Old or New tax regime.
    
    New Regime (default since FY 2023-24):
      - No deductions allowed (except standard deduction ₹50,000)
      - Lower slab rates
    Old Regime:
      - Allows 80C (₹1.5L max), 80D, HRA, LTA, NPS, home loan interest
      - Higher slab rates
    """
    std_deduction = regime.standard_deduction
    taxable_income = annual_gross - std_deduction
    
    if regime.regime_type == "new":
        # New regime: no deductions except standard deduction
        pass
    else:
        # Old regime: allow deductions — all caps read from TaxRegime
        cap_80c = float(getattr(regime, 'section_80c_old_cap', None) or 0)
        cap_80d = float(getattr(regime, 'section_80d_cap', None) or 0)
        cap_nps = float(getattr(regime, 'section_80ccd_1b_cap', None) or 0)
        cap_home_loan = float(getattr(regime, 'section_24_home_loan_cap', None) or 0)
        taxable_income -= min(deductions_80c, cap_80c)
        taxable_income -= min(deductions_80d, cap_80d)
        taxable_income -= hra_exemption
        taxable_income -= lta_exemption
        taxable_income -= min(nps_deduction, cap_nps)
        taxable_income -= min(home_loan_interest, cap_home_loan)
    
    taxable_income = max(taxable_income, 0)
    
    # Apply rebate (87A)
    tax = 0
    for slab in sorted(slabs, key=lambda s: s.from_amount):
        if taxable_income <= slab.from_amount:
            break
        slab_max = slab.to_amount if slab.to_amount else taxable_income
        slab_income = min(taxable_income, slab_max) - slab.from_amount
        if slab_income > 0:
            tax += slab_income * slab.rate / 100
    
    # Rebate u/s 87A (with new-regime marginal relief) + surcharge
    # (with marginal relief) via the shared helper so every tax path agrees.
    tax, _rebate_given, surcharge = apply_tax_relief(
        tax, taxable_income, slabs,
        rebate_threshold=getattr(regime, "rebate_threshold", 0),
        rebate_amount=getattr(regime, "rebate_amount", 0),
        regime_type=getattr(regime, "regime_type", "new"),
        surcharge_slabs=getattr(regime, "surcharge_config", None),
    )
    
    # Surcharge is computed inside apply_tax_relief above.
    
    # Health & Education Cess
    cess = (tax + surcharge) * regime.cess_rate / 100
    
    total_tax = round(tax + surcharge + cess, 2)
    monthly_tds = round(total_tax / 12, 2)
    
    return {
        "annual_gross": annual_gross,
        "standard_deduction": std_deduction,
        "taxable_income": round(taxable_income, 2),
        "tax": round(tax, 2),
        "surcharge": round(surcharge, 2),
        "cess": round(cess, 2),
        "total_tax": total_tax,
        "monthly_tds": monthly_tds,
        "effective_tax_rate": round(total_tax / annual_gross * 100, 2) if annual_gross > 0 else 0,
        "regime_type": regime.regime_type,
    }


# ── Full Payroll Processing ───────────────────────────────────────────────

def _compute_salary_components(
    db: Session, employee: Employee, org: Organization, policy_id: Optional[int] = None
) -> dict:
    """Compute earnings from org-defined PayrollComponent records.
    
    Each organization defines their own salary components with:
      - calculation_type: 'percentage' or 'fixed'
      - calculation_base: 'basic', 'gross', 'ctc', or None for fixed
      - calculation_value: the percentage or fixed amount
      - max_cap / min_cap: optional limits
    """
    policy_id = policy_id or employee.payroll_policy_id or org.default_payroll_policy_id
    query = db.query(PayrollComponent).filter(
        PayrollComponent.organization_id == org.id,
        PayrollComponent.is_active == True,
        PayrollComponent.component_type == "earning",
    )
    if policy_id:
        query = query.filter(
            (PayrollComponent.payroll_policy_id == policy_id) |
            (PayrollComponent.payroll_policy_id.is_(None))
        )
    components = query.order_by(PayrollComponent.priority).all()

    base_salary = employee.base_salary or 0
    computed = {}
    total_earnings = 0.0

    for comp in components:
        value = 0.0
        if comp.calculation_type == "percentage":
            base_value = base_salary
            if comp.calculation_base == "basic":
                # Use the computed "basic" if available, otherwise use base_salary directly
                base_value = computed.get("basic", base_salary)
            elif comp.calculation_base == "ctc":
                base_value = base_salary
            value = base_value * comp.calculation_value / 100
        else:
            value = comp.calculation_value

        if comp.max_cap:
            value = min(value, comp.max_cap)
        if comp.min_cap:
            value = max(value, comp.min_cap)

        computed[comp.name] = round(value, 2)
        total_earnings += value

    # Fallback if no components defined: basic = base_salary, everything else = 0
    if not computed:
        basic = round(base_salary, 2)
        computed = {
            "basic": basic,
        }
        total_earnings = sum(computed.values())

    return {"components": computed, "gross": round(total_earnings, 2)}


def process_monthly_payroll(
    db: Session,
    employee_id: int,
    month: int,
    year: int,
    attendance_data: Optional[dict] = None,
) -> dict:
    """Process full payroll for one employee for one month.
    
    Uses org-configured:
      - PayrollComponent records for earnings structure
      - StatutorySetting for PF, ESI, PT, LWF, Gratuity rates
      - TaxRegime + TaxSlab for TDS
      - Organization's registered_state for state-specific PT/LWF
    """
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    org = db.query(Organization).filter(Organization.id == employee.organization_id).first()
    if not org:
        raise ValueError(f"Organization not found for employee {employee_id}")

    # ── Load org-level configurations ──
    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == employee.organization_id
    ).first()
    if not setting:
        raise ValueError(f"Statutory settings not configured for org {employee.organization_id}. "
                         "Configure at /api/payroll-config/statutory-settings")

    state_code = org.registered_state.lower().replace(" ", "_") if org.registered_state else None

    # Payroll-period date for effective-dated state slab lookups (first day of the month).
    try:
        period_date = date(year, month, 1)
    except Exception:
        period_date = date.today()

    # ── Earnings from org-defined PayrollComponent records ──
    salary_result = _compute_salary_components(db, employee, org)
    components = salary_result["components"]
    gross = salary_result["gross"]

    # Extract basic for PF calculation (use component "basic" or configurable fallback % of gross)
    basic_fallback_pct = _get_statutory_constant(db, 'basic_salary_fallback_pct', 50.0) if db else 50.0
    basic = components.get("basic", gross * (basic_fallback_pct / 100))

    # ── Statutory deductions (rates from StatutorySetting in DB) ──
    pf = calculate_pf(basic, setting)
    esi = calculate_esi(
        gross, setting,
        is_disabled=bool(getattr(employee, 'is_person_with_disability', False)),
        keep_covered=esi_covered_earlier(db, employee.id, year, month),
    )
    pt = calculate_professional_tax(gross, state_code, db=db, as_of=period_date)
    lwf = calculate_lwf(gross, state_code, db=db, as_of=period_date)

    # ── TDS from org-defined TaxRegime + TaxSlab ──
    tax_regime = None
    if employee.tax_regime_id:
        tax_regime = db.query(TaxRegime).filter(TaxRegime.id == employee.tax_regime_id).first()
    if not tax_regime:
        tax_regime = db.query(TaxRegime).filter(
            TaxRegime.organization_id == employee.organization_id,
            TaxRegime.is_default == True,
        ).first()

    tds = 0
    if tax_regime:
        slabs = db.query(TaxSlab).filter(
            TaxSlab.tax_regime_id == tax_regime.id
        ).order_by(TaxSlab.from_amount).all()
        annual_gross = gross * 12
        tax_result = calculate_income_tax(annual_gross, tax_regime, slabs)
        tds = tax_result["monthly_tds"]

    total_statutory = pf["employee"] + esi["employee"] + pt["amount"] + lwf["employee"]
    total_deductions = total_statutory + tds
    net_salary = max(0, gross - total_deductions)

    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "salary_components": components,
        "gross_salary": round(gross, 2),
        "pf_employee": pf["employee"],
        "pf_employer": pf["employer"],
        "pf_eps": pf["eps"],
        "pf_edlis": pf["edlis"],
        "esi_employee": esi["employee"],
        "esi_employer": esi["employer"],
        "professional_tax": pt["amount"],
        "lwf_employee": lwf["employee"],
        "lwf_employer": lwf["employer"],
        "tds": tds,
        "total_statutory_deductions": round(total_statutory, 2),
        "total_deductions": round(total_deductions, 2),
        "net_salary": round(net_salary, 2),
        "state": org.registered_state,
        "data_source": "org_configured",
        "note": "All rates sourced from your org's PayrollConfig. Adjust at /api/payroll-config/*",
    }


def generate_payslip_pdf(payroll_data: dict) -> dict:
    """Generate payslip PDF with all compliance details.
    
    Returns a stub — production version would use ReportLab / WeasyPrint
    to generate a proper Indian-format payslip with:
      - Company logo & details
      - Employee details (UAN, ESIC, PAN)
      - Earnings table (Basic, HRA, Conveyance, Medical, Special, Gross)
      - Deductions table (PF, ESI, PT, LWF, TDS, Total)
      - Net Pay (in words)
      - Compliance summary (PF Wages, EPS Wages, EDLIS, Admin Charges)
    """
    return {
        "payslip_ready": True,
        "format": "pdf_stub",
        "note": "Production PDF generation requires ReportLab/WeasyPrint",
    }
