"""
Exit Management & Full & Final (F&F) Settlement
Handles resignation, termination, clearance checks, and final settlement calculation.
"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy.orm import Session
from models import Employee, Payroll, LeaveApplication, Organization
from services.email_service import EmailService
from services.compliance_engine import calculate_gratuity


def _basic_fallback_ratio(db: Session) -> float:
    """Basic = fallback % of gross when no payroll row exists (config-driven)."""
    try:
        from services.compliance_engine import _get_statutory_constant
        return _get_statutory_constant(db, 'basic_salary_fallback_pct', 50.0) / 100.0
    except Exception:
        return 0.5


def _daily_divisor(db: Session, employee: Employee) -> float:
    """Monthly → daily rate divisor: proration rule -> PayrollPolicy -> 30."""
    try:
        from services.payroll_service import _get_payroll_policy, resolve_proration_divisor
        return resolve_proration_divisor(db, employee,
                                         pay_policy=_get_payroll_policy(db, employee))
    except Exception:
        return 30.0


def _monthly_salary(db: Session, employee: Employee, leaving_date) -> tuple:
    """Resolve (monthly_gross, monthly_basic) correctly.

    base_salary stores the ANNUAL CTC, so it is divided by 12 when no paid
    payroll exists yet — otherwise F&F would overstate monthly pay 12x.
    """
    from services.payroll_service import _get_effective_annual_ctc
    basic_ratio = _basic_fallback_ratio(db)
    latest = db.query(Payroll).filter(
        Payroll.employee_id == employee.id,
        Payroll.status == "paid",
    ).order_by(Payroll.year.desc(), Payroll.month.desc()).first()
    if latest and latest.gross_salary:
        return float(latest.gross_salary), float(latest.basic_salary or latest.gross_salary * basic_ratio)
    annual = _get_effective_annual_ctc(db, employee, leaving_date.year, leaving_date.month)
    monthly_gross = round(annual / 12, 2) if annual else 0.0
    return monthly_gross, round(monthly_gross * basic_ratio, 2)


def _asset_recovery(
    db: Session,
    employee: Employee,
    recovered_asset_ids: Optional[list] = None,
) -> dict:
    """Unreturned company assets assigned to the employee → F&F recovery.

    Recovery amount = current book value (fallback purchase_value) of every
    issued asset still open at settlement. Pass recovered_asset_ids to mark
    assets as returned (clearance) — those drop out of the recovery.
    """
    try:
        from models import Asset
        _returned = {"available", "returned", "retired", "disposed", "written_off"}
        q = db.query(Asset).filter(
            Asset.employee_id == employee.id,
            Asset.deleted_at.is_(None),
        )
        rows = q.all()
        items = []
        total = 0.0
        for a in rows:
            if str(a.status or "").lower() in _returned:
                continue
            if recovered_asset_ids and a.id in set(recovered_asset_ids):
                continue
            amt = float(getattr(a, "value", None) or getattr(a, "purchase_value", 0) or 0)
            total += amt
            items.append({
                "asset_id": a.id,
                "asset_type": a.asset_type,
                "asset_name": a.asset_name,
                "serial_number": a.serial_number,
                "status": a.status,
                "recovery_amount": round(amt, 2),
            })
        if recovered_asset_ids:
            try:
                db.query(Asset).filter(
                    Asset.id.in_(list(recovered_asset_ids)),
                    Asset.employee_id == employee.id,
                ).update({"status": "returned"}, synchronize_session=False)
            except Exception:
                pass
        return {"items": items, "total": round(total, 2)}
    except Exception:
        return {"items": [], "total": 0.0}


def _fnf_tds(db: Session, employee: Employee, org: Organization, payables: dict) -> dict:
    """TDS on Full & Final settlement (section 192, exit payments).

    Projects the employee's FY income — YTD salary from approved payrolls
    plus the taxable F&F components — through the org's configured TaxRegime,
    then withholds the shortfall over TDS already deducted YTD. Same
    principle as monthly TDS: slabs/regime are configuration; when no
    TaxRegime exists there is NO global default and TDS is 0.0.

    Taxable components:
      salary_until_last_working_day, notice_pay_in_lieu, statutory_bonus
      + leave_encashment (fully taxable when the template flags
        encashment_taxable; else exempt up to the configured limit)
      + gratuity above the statutory exemption ceiling
    Exempt: expense_reimbursement, gratuity up to ceiling.
    """
    try:
        from models import Payroll, StatutorySetting
        from services.compliance_engine import _get_statutory_constant
        from services.payroll_service import _get_annual_tax, _get_tax_regime

        leaving = employee.date_of_leaving or datetime.utcnow()
        leaving_day = leaving.date() if isinstance(leaving, datetime) else leaving
        regime = _get_tax_regime(db, employee)
        if regime is None:
            return {"amount": 0.0, "reason": "no_tax_regime_configured",
                    "taxable_income": 0.0, "annual_tax": 0.0,
                    "ytd_tds": 0.0, "shortfall": 0.0}

        # ── Exemption ceilings (org config -> statutory constant -> Act) ──
        org_settings = (getattr(org, "settings", None) or {})
        payroll_cfg = (org_settings.get("payroll") or {}) if isinstance(org_settings, dict) else {}

        def _cfg_float(key: str, stat_key: str, default: float) -> float:
            try:
                val = payroll_cfg.get(key)
                if val is not None and float(val) >= 0:
                    return float(val)
            except (TypeError, ValueError):
                pass
            return float(_get_statutory_constant(db, stat_key, default))

        gratuity_exempt = _cfg_float(
            "gratuityExemptionLimit", "gratuity_exemption_limit", 200000.0)
        leave_exempt = _cfg_float(
            "leaveEncashmentExemptLimit", "leave_encashment_exempt_limit", 300000.0)

        # ── Template encashment taxability (opt-in knob) ──
        encashment_taxable = False
        try:
            tid = getattr(employee, "leave_template_id", None)
            if tid:
                from models import LeaveTemplate
                tpl = db.query(LeaveTemplate).filter(
                    LeaveTemplate.id == tid,
                    LeaveTemplate.deleted_at.is_(None),
                    LeaveTemplate.status == "active",
                ).first()
                if tpl is not None and getattr(tpl, "encashment_taxable", False):
                    encashment_taxable = True
        except Exception:
            encashment_taxable = False

        def _amt(key: str) -> float:
            try:
                return float(payables.get(key) or 0)
            except (TypeError, ValueError):
                return 0.0

        salary = _amt("salary_until_last_working_day")
        notice = _amt("notice_pay_in_lieu")
        bonus = _amt("statutory_bonus")
        encashment = _amt("leave_encashment")
        gratuity = _amt("gratuity")

        encashment_taxable_amt = (
            encashment if encashment_taxable
            else max(0.0, encashment - leave_exempt)
        )
        gratuity_taxable_amt = max(0.0, gratuity - gratuity_exempt)
        taxable = salary + notice + bonus + encashment_taxable_amt + gratuity_taxable_amt
        breakdown = {
            "salary": round(salary, 2),
            "notice_pay_in_lieu": round(notice, 2),
            "statutory_bonus": round(bonus, 2),
            "leave_encashment_taxable": round(encashment_taxable_amt, 2),
            "gratuity_taxable": round(gratuity_taxable_amt, 2),
            "gratuity_exempt": round(min(gratuity, gratuity_exempt), 2),
            "leave_encashment_exempt": round(
                0.0 if encashment_taxable else min(encashment, leave_exempt), 2),
        }
        if taxable <= 0:
            return {"amount": 0.0, "reason": "nothing_taxable",
                    "taxable_income": 0.0, "breakdown": breakdown,
                    "annual_tax": 0.0, "ytd_tds": 0.0, "shortfall": 0.0}

        # ── FY YTD from approved payrolls (same statuses Form 16 trusts) ──
        month, year = leaving_day.month, leaving_day.year
        try:
            from services.payroll_service import _get_fy_start_month
            fy_start = _get_fy_start_month(db, employee)
        except Exception:
            fy_start = 4
        fy_year = year if month >= fy_start else year - 1
        ytd_rows = (
            db.query(Payroll)
            .filter(
                Payroll.employee_id == employee.id,
                Payroll.deleted_at.is_(None),
                Payroll.status.in_(("approved", "processed", "paid")),
            )
            .all()
        )
        # FY window: Apr fy_year .. Mar fy_year+1
        period_rows = [
            p for p in ytd_rows
            if ((p.month >= fy_start and p.year == fy_year)
                or (p.month < fy_start and p.year == fy_year + 1))
        ]
        ytd_gross = sum(float(p.gross_salary or 0) for p in period_rows)
        ytd_pf = sum(float(p.pf_deduction or 0) for p in period_rows)
        ytd_pt = sum(float(p.professional_tax or 0) for p in period_rows)
        ytd_tds = sum(float(p.tds_deduction or 0) for p in period_rows)

        regime_is_new = str(getattr(regime, "regime_type", "new") or "new").lower() == "new"
        std_deduction = float(getattr(regime, "standard_deduction", None) or 0.0)

        annual_gross = ytd_gross + taxable
        annual_taxable = max(
            0.0,
            annual_gross - std_deduction - ytd_pt - (0.0 if regime_is_new else ytd_pf),
        )
        annual_tax = _get_annual_tax(annual_taxable, regime)
        shortfall = max(0.0, annual_tax - ytd_tds)

        return {
            "amount": round(shortfall, 2),
            "reason": None,
            "taxable_income": round(taxable, 2),
            "breakdown": breakdown,
            "fy": {"start_year": fy_year, "start_month": fy_start},
            "annual_gross": round(annual_gross, 2),
            "annual_taxable": round(annual_taxable, 2),
            "annual_tax": round(annual_tax, 2),
            "ytd_tds": round(ytd_tds, 2),
            "shortfall": round(shortfall, 2),
        }
    except Exception as exc:
        return {"amount": 0.0, "reason": f"error: {exc}", "taxable_income": 0.0,
                "annual_tax": 0.0, "ytd_tds": 0.0, "shortfall": 0.0}


def _leave_encashment(db: Session, employee: Employee, monthly_gross: float) -> float:
    """Encash the employee's actual unused paid-leave balance at exit."""
    try:
        from models import LeaveBalance, LeaveTemplate, LeaveType
        org_settings = (employee.organization.settings or {})
        payroll_cfg = org_settings.get("payroll", {}) or {}
        codes = payroll_cfg.get("encashableLeaveCodes") or ["annual", "privilege", "comp_off", "paid"]
        codes = [str(c).lower() for c in codes]
        max_days = float(payroll_cfg.get("leaveEncashmentMaxDays") or 0)
        year = employee.date_of_leaving.year if employee.date_of_leaving else datetime.utcnow().year
        rows = (
            db.query(LeaveBalance, LeaveType)
            .join(LeaveType, LeaveType.id == LeaveBalance.leave_type_id)
            .filter(
                LeaveBalance.employee_id == employee.id,
                LeaveBalance.deleted_at.is_(None),
                LeaveBalance.remaining_days > 0,
            )
            .all()
        )
        days = sum(
            float(lb.remaining_days or 0)
            for lb, lt in rows
            if any(c in str(lt.code or lt.name or "").lower() for c in codes)
        )
        if max_days > 0:
            days = min(days, max_days)
        # Template-driven encashment knobs (LeaveTemplate) — OPT-IN. A template
        # with encashment_enabled=True takes over the per-day rate / minimum
        # balance; flag False/absent keeps the legacy org-settings behaviour
        # (False is also the column server default, so gating on it would
        # silently zero encashment for every template-pinned employee).
        tpl = None
        tid = getattr(employee, "leave_template_id", None)
        if tid:
            tpl = db.query(LeaveTemplate).filter(
                LeaveTemplate.id == tid,
                LeaveTemplate.deleted_at.is_(None),
                LeaveTemplate.status == "active",
            ).first()
        if tpl is not None and getattr(tpl, "encashment_enabled", False):
            min_bal = getattr(tpl, "encashment_min_balance", None)
            if min_bal is not None and days < float(min_bal):
                return 0.0
            amount = round((monthly_gross / _daily_divisor(db, employee)) * days, 2)
            # encashment_rate is a multiplier on the legacy amount
            # (model comment: 0.83 = 83% of the daily-wage encashment).
            rate = getattr(tpl, "encashment_rate", None)
            if rate is not None and float(rate) > 0:
                amount = round(amount * float(rate), 2)
            return amount
        return round((monthly_gross / _daily_divisor(db, employee)) * days, 2)
    except Exception:
        return 0.0


def _outstanding_loans(db: Session, employee_id: int) -> float:
    """Total outstanding principal of active loans/advances at exit (recovered from F&F)."""
    try:
        from models import SalaryLoan
        total = 0.0
        loans = db.query(SalaryLoan).filter(
            SalaryLoan.employee_id == employee_id,
            SalaryLoan.status == "active",
        ).all()
        for loan in loans:
            principal = float(loan.principal_amount or 0)
            if principal > 0:
                remaining = principal * int(loan.remaining_months or 0) / max(1, int(loan.total_months or 1))
                total += max(0.0, remaining)
            else:
                total += float(loan.monthly_deduction or 0) * max(0, int(loan.remaining_months or 0))
        return round(total, 2)
    except Exception:
        return 0.0


def _approved_expenses(db: Session, employee_id: int, until_date) -> float:
    """Approved-but-not-yet-reimbursed expense claims due at exit."""
    try:
        from models import Expense
        end = until_date.date() if hasattr(until_date, "date") else until_date
        total = db.query(Expense).filter(
            Expense.employee_id == employee_id,
            Expense.deleted_at.is_(None),
            Expense.status == "approved",
            Expense.expense_date <= end,
        ).with_entities(Expense.amount).all()
        return round(sum(float(r[0] or 0) for r in total), 2)
    except Exception:
        return 0.0


def calculate_full_final_settlement(
    db: Session,
    employee_id: int,
    notice_in_lieu: bool = False,
    recovered_asset_ids: Optional[list] = None,
) -> dict:
    """Calculate Full & Final settlement for an exiting employee.

    Covers the mandate section 35 list: salary until last working day,
    unpaid leave, notice recovery OR notice payout (employer-initiated),
    leave encashment, statutory bonus, gratuity settlement, loans/advances,
    reimbursements — plus section-192 TDS on the taxable F&F components and
    recovery of unreturned company assets.
    """
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise ValueError("Employee not found")

    org = db.query(Organization).filter(Organization.id == employee.organization_id).first()
    if not employee.join_date:
        return {"error": "Employee has no join date"}

    from services.gratuity_engine import (
        calculate_gratuity_settlement,
        record_gratuity,
        service_years_act,
    )
    leaving_date = employee.date_of_leaving or datetime.utcnow()
    leaving_day = leaving_date.date() if isinstance(leaving_date, datetime) else leaving_date
    years_of_service = service_years_act(employee.join_date, leaving_day)

    monthly_gross, monthly_basic = _monthly_salary(db, employee, leaving_date)

    # Salary until last working day: prorated by the ACTUAL attendance in the
    # final month using the same engine payroll uses.
    from services.payroll_service import (
        _get_attendance_policy,
        _get_payroll_policy,
        _compute_attendance_payout,
    )
    last_month = leaving_date.month
    last_year = leaving_date.year
    att_policy = _get_attendance_policy(db, employee)
    pay_policy = _get_payroll_policy(db, employee)
    payout = _compute_attendance_payout(db, employee, last_month, last_year, att_policy, pay_policy)
    factor = payout["factor"]
    if not payout["employed_this_month"]:
        factor = 0.0
    salary_until_lwd = round(monthly_gross * factor, 2)

    # Gratuity: rule-driven settlement, recorded for audit (section 23).
    gratuity_result = calculate_gratuity_settlement(db, employee, as_of=leaving_day)
    try:
        record_gratuity(db, employee, gratuity_result, status="settled",
                        settlement_ref=f"fnf:{employee_id}:{leaving_day.isoformat()}")
    except Exception:
        pass

    # Notice: recovery when not served; payout in lieu on employer-initiated
    # exits (ExitRecord.exit_type == 'terminated' or explicit notice_in_lieu).
    notice_period_days = int(getattr(employee, "notice_period_days", 0) or 0)
    if notice_period_days <= 0:
        try:
            cfg = ((getattr(org, "settings", None) or {}).get("payroll") or {})
            notice_period_days = int(cfg.get("noticePeriodDays", 0) or 0)
        except Exception:
            notice_period_days = 0
    try:
        from models import ExitRecord
        rec = (db.query(ExitRecord)
               .filter(ExitRecord.employee_id == employee_id,
                       ExitRecord.deleted_at.is_(None))
               .order_by(ExitRecord.exit_date.desc()).first())
        if rec is not None and str(getattr(rec, "exit_type", "") or "").lower() == "terminated":
            notice_in_lieu = True
    except Exception:
        pass
    daily_rate = (monthly_gross / _daily_divisor(db, employee)) if monthly_gross else 0.0
    if notice_in_lieu and employee.notice_period_served in (None, "no"):
        notice_payout = round(daily_rate * notice_period_days, 2)
        notice_recovery = 0.0
    elif employee.notice_period_served == "no":
        notice_payout = 0.0
        notice_recovery = round(daily_rate * notice_period_days, 2) if notice_period_days > 0 else 0.0
    else:
        notice_payout = 0.0
        notice_recovery = 0.0

    leave_encashment = _leave_encashment(db, employee, monthly_gross)

    # Statutory bonus (Payment of Bonus Act) pro-rated for the exit year.
    # Gated by the visible bonus_applicable toggle on StatutorySetting.
    bonus_payable = 0.0
    try:
        from models import StatutorySetting
        _bonus_setting = db.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org.id,
            StatutorySetting.status == "active",
        ).first()
        if _bonus_setting is not None and _bonus_setting.bonus_applicable:
            from services.compliance_engine import calculate_bonus, resolve_bonus_params
            months_worked = min(12, max(1, (leaving_day.timetuple().tm_yday // 30) or 1))
            b = calculate_bonus(monthly_gross, months_worked,
                                **resolve_bonus_params(db, org.id))
            if b.get("eligible"):
                bonus_payable = round(float(b.get("minimum", 0) or 0) / 12.0, 2)
    except Exception:
        bonus_payable = 0.0

    outstanding_loans = _outstanding_loans(db, employee_id)
    approved_expenses = _approved_expenses(db, employee_id, leaving_date)
    asset_recovery = _asset_recovery(db, employee, recovered_asset_ids)

    payables = {
        "salary_until_last_working_day": salary_until_lwd,
        "leave_encashment": leave_encashment,
        "gratuity": gratuity_result["amount"],
        "statutory_bonus": bonus_payable,
        "notice_pay_in_lieu": notice_payout,
        "other_payables": 0,
        "expense_reimbursement": approved_expenses,
    }
    total_payables = sum(payables.values())

    # TDS u/s 192 on the taxable F&F components — shortfall over YTD TDS
    # already withheld. Capped at the cash payable (you cannot withhold more
    # than you are paying out; any residual liability stays with the employee
    # via advance tax / self-assessment).
    tds_meta = _fnf_tds(db, employee, org, payables)
    fnf_tds = round(min(float(tds_meta.get("amount") or 0), max(0.0, total_payables)), 2)

    deductions = {
        "notice_period_shortfall": notice_recovery,
        "pending_advances": outstanding_loans,
        "training_bond_penalty": 0,
        "other_deductions": 0,
        "leave_encashment_tds": fnf_tds,
        "asset_recovery": asset_recovery["total"],
    }
    total_deductions = sum(deductions.values())

    net_settlement = total_payables - total_deductions

    return {
        "employee_id": employee_id,
        "employee_name": f"{employee.first_name} {employee.last_name or ''}".strip(),
        "date_of_joining": employee.join_date.isoformat() if employee.join_date else None,
        "date_of_leaving": leaving_date.isoformat() if isinstance(leaving_date, datetime) else leaving_date,
        "years_of_service": years_of_service,
        "monthly_gross": monthly_gross,
        "payables": payables,
        "total_payables": round(total_payables, 2),
        "deductions": deductions,
        "total_deductions": round(total_deductions, 2),
        "net_settlement": round(max(0, net_settlement), 2),
        "tds": {
            "amount": fnf_tds,
            "taxable_income": tds_meta.get("taxable_income"),
            "breakdown": tds_meta.get("breakdown"),
            "annual_tax": tds_meta.get("annual_tax"),
            "ytd_tds": tds_meta.get("ytd_tds"),
            "shortfall": tds_meta.get("shortfall"),
            "fy": tds_meta.get("fy"),
            "reason": tds_meta.get("reason"),
        },
        "asset_recovery": asset_recovery,
        "gratuity_eligible": gratuity_result["eligible"],
        "gratuity_detail": gratuity_result,
        "notice": {"days": notice_period_days, "served": employee.notice_period_served,
                   "recovery": notice_recovery, "payout": notice_payout},
        "final_month_attendance": {
            "month": last_month,
            "year": last_year,
            "working_days": payout["working_days"],
            "present_days": payout["present_days"],
            "leave_days": payout["leave_days"],
            "holiday_days": payout["holiday_days"],
            "paid_days": payout["paid_days"],
            "unpaid_days": payout["unpaid_days"],
            "proration_factor": round(factor, 4),
        },
    }


def get_clearance_checklist() -> list:
    """Return standard clearance items for exit process."""
    return [
        {"item": "IT Assets Returned", "department": "IT", "description": "Laptop, monitor, keyboard, mouse, headset"},
        {"item": "Access Revoked", "department": "IT", "description": "Email, VPN, system access, shared drives"},
        {"item": "Company Phone Returned", "department": "IT", "description": "Mobile phone, SIM card, charger"},
        {"item": "ID Card & Access Card", "department": "Admin", "description": "Return ID card, access cards, keys"},
        {"item": "Workspace Cleared", "department": "Admin", "description": "Personal belongings removed, desk cleaned"},
        {"item": "Library Books Returned", "department": "Admin", "description": "Return any borrowed books/materials"},
        {"item": "Finance Clearance", "department": "Finance", "description": "Outstanding advances, travel expenses, loans"},
        {"item": "PF & Gratuity Settlement", "department": "Finance", "description": "PF account transfer/gform, gratuity payment"},
        {"item": "Knowledge Transfer", "department": "Manager", "description": "Handover notes, documentation, KT sessions"},
        {"item": "Team Farewell", "department": "Manager", "description": "Exit interview, feedback collection"},
        {"item": "HR Clearance", "department": "HR", "description": "Experience letter, relieving letter, Form 16"},
        {"item": "Full & Final Settlement", "department": "HR", "description": "Final settlement calculation and disbursement"},
    ]


def send_exit_confirmation(employee_name: str, email: str, last_working_day: str) -> bool:
    """Send exit confirmation email with settlement details."""
    return EmailService.send_email(
        to_email=email,
        subject="Exit Process Initiated — Next Steps",
        html_content=f"""
        <h2>Exit Process Initiated</h2>
        <p>Dear {employee_name},</p>
        <p>Your exit process has been initiated. Your last working day is <strong>{last_working_day}</strong>.</p>
        <p>Please complete the clearance checklist on the HRMS portal under the Exit section.</p>
        <p>The following departments will clear you:</p>
        <ul>
            <li><strong>IT</strong> — Return laptop, revoke access</li>
            <li><strong>Admin</strong> — Return ID card, clear workspace</li>
            <li><strong>Finance</strong> — Clear dues, settle advances</li>
            <li><strong>Manager</strong> — Knowledge transfer, handover</li>
            <li><strong>HR</strong> — Experience letter, F&F settlement</li>
        </ul>
        <p>Your Full & Final settlement will be processed within 15 days of your last working day.</p>
        """,
        text_content=f"Your exit process has been initiated. Last working day: {last_working_day}."
    )
