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


def _monthly_salary(db: Session, employee: Employee, leaving_date) -> tuple:
    """Resolve (monthly_gross, monthly_basic) correctly.

    base_salary stores the ANNUAL CTC, so it is divided by 12 when no paid
    payroll exists yet — otherwise F&F would overstate monthly pay 12x.
    """
    from services.payroll_service import _get_effective_annual_ctc
    latest = db.query(Payroll).filter(
        Payroll.employee_id == employee.id,
        Payroll.status == "paid",
    ).order_by(Payroll.year.desc(), Payroll.month.desc()).first()
    if latest and latest.gross_salary:
        return float(latest.gross_salary), float(latest.basic_salary or latest.gross_salary * 0.5)
    annual = _get_effective_annual_ctc(db, employee, leaving_date.year, leaving_date.month)
    monthly_gross = round(annual / 12, 2) if annual else 0.0
    return monthly_gross, round(monthly_gross * 0.5, 2)


def _leave_encashment(db: Session, employee: Employee, monthly_gross: float) -> float:
    """Encash the employee's actual unused paid-leave balance at exit."""
    try:
        from models import LeaveBalance, LeaveType
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
        return round((monthly_gross / 30.0) * days, 2)
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


def calculate_full_final_settlement(db: Session, employee_id: int, notice_in_lieu: bool = False) -> dict:
    """Calculate Full & Final settlement for an exiting employee.

    Covers the mandate section 35 list: salary until last working day,
    unpaid leave, notice recovery OR notice payout (employer-initiated),
    leave encashment, statutory bonus, gratuity settlement, loans/advances
    and reimbursements.
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
    daily_rate = (monthly_gross / 30.0) if monthly_gross else 0.0
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
    bonus_payable = 0.0
    try:
        cfg = ((getattr(org, "settings", None) or {}).get("payroll") or {})
        if cfg.get("statutoryBonus", False):
            from services.compliance_engine import calculate_bonus
            months_worked = min(12, max(1, (leaving_day.timetuple().tm_yday // 30) or 1))
            b = calculate_bonus(monthly_gross, months_worked)
            if b.get("eligible"):
                bonus_payable = round(float(b.get("minimum", 0) or 0) / 12.0, 2)
    except Exception:
        bonus_payable = 0.0

    outstanding_loans = _outstanding_loans(db, employee_id)
    approved_expenses = _approved_expenses(db, employee_id, leaving_date)

    deductions = {
        "notice_period_shortfall": notice_recovery,
        "pending_advances": outstanding_loans,
        "training_bond_penalty": 0,
        "other_deductions": 0,
    }
    total_deductions = sum(deductions.values())

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
