"""First-run setup status — the backbone of the onboarding wizard.

GET /api/setup/status auto-DETECTS what an org has configured (no manual
step ticking that can lie): statutory settings, tax regime, payroll policy,
leave types, employees, first payroll. The wizard and the home-screen
checklist both drive off this one endpoint, so they can never disagree.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.auth import get_current_user
from database import get_db
from models import (
    Employee, LeaveType, Organization, Payroll, PayrollPolicy,
    StatutorySetting, TaxRegime, User,
)

router = APIRouter(tags=["Setup"])

_SETUP_ROLES = ("superadmin", "admin")


def _require(user: User):
    if (user.role or "").lower() not in _SETUP_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can view setup status")


def compute_setup_status(db: Session, org_id: int) -> dict:
    """Readiness of one organization — derived from data, never from guesses."""
    has_statutory = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == org_id,
        StatutorySetting.status == "active",
    ).first() is not None
    has_regime = db.query(TaxRegime).filter(
        TaxRegime.organization_id == org_id,
        TaxRegime.is_active.is_(True),
    ).first() is not None
    has_policy = db.query(PayrollPolicy).filter(
        PayrollPolicy.organization_id == org_id,
        PayrollPolicy.status == "active",
    ).first() is not None
    leave_count = db.query(LeaveType).filter(
        LeaveType.organization_id == org_id,
        LeaveType.status == "active",
    ).count()
    employee_count = db.query(Employee).filter(
        Employee.organization_id == org_id,
        Employee.deleted_at.is_(None),
        Employee.status == "active",
    ).count()
    payroll_count = db.query(Payroll).filter(
        Payroll.organization_id == org_id,
        Payroll.deleted_at.is_(None),
    ).count()

    steps = [
        {
            "id": "statutory_settings",
            "title": "Statutory deductions",
            "why": "PF, ESI and Professional Tax rules. Every payslip's "
                   "deductions come from here — the government's rates, "
                   "applied automatically.",
            "hint": "One click applies India's standard rates (PF 12%, ESI "
                    "0.75%/3.25%, PT by state). You can fine-tune later.",
            "action": "Apply statutory defaults",
            "link": "/payroll/setup",
            "done": has_statutory,
        },
        {
            "id": "tax_regime",
            "title": "Income tax (TDS) slabs",
            "why": "Without tax slabs the system cannot deduct TDS from "
                   "salaries — employees would be overpaid and you'd owe "
                   "penalties at filing time.",
            "hint": "Creates the standard new-regime slabs (FY 2025-26). "
                    "Edit them any time in Payroll Setup.",
            "action": "Create tax slabs",
            "link": "/payroll/setup",
            "done": has_regime,
        },
        {
            "id": "payroll_policy",
            "title": "Payroll policy",
            "why": "Decides how salaries are calculated: rounding, "
                   "pro-ration (26 or 30 day months), pay frequency "
                   "defaults and the financial year start.",
            "hint": "Sensible monthly defaults — most Indian companies "
                    "never need to change this.",
            "action": "Create payroll policy",
            "link": "/payroll/setup",
            "done": has_policy,
        },
        {
            "id": "leave_types",
            "title": "Leave types",
            "why": "Casual, Sick and Earned leave — what employees can "
                   "apply for, and how many days a year.",
            "hint": "Adds the three standard Indian leave types. You can "
                    "add more (maternity, comp-off) later.",
            "action": "Add standard leave types",
            "link": "/leaves",
            "done": leave_count > 0,
        },
        {
            "id": "employees",
            "title": "Employees",
            "why": "You can't run payroll without people on it. Add your "
                   "first employee — name, salary and a joining date is "
                   "enough to start.",
            "hint": "Takes about a minute per person.",
            "action": "Add your first employee",
            "link": "/employees",
            "done": employee_count > 0,
        },
        {
            "id": "first_payroll",
            "title": "First payroll run",
            "why": "Generate payslips for the current month and see the "
                   "whole engine work: PF, ESI, TDS and net pay, calculated "
                   "from what you configured above.",
            "hint": "Nothing is paid or emailed until you approve — this is "
                    "a dry run you can review first.",
            "action": "Run first payroll",
            "link": "/payroll",
            "done": payroll_count > 0,
        },
    ]

    completed = sum(1 for s in steps if s["done"])
    next_step = next((s for s in steps if not s["done"]), None)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    return {
        "steps": steps,
        "completed": completed,
        "total": len(steps),
        "complete": completed == len(steps),
        "nextStep": next_step,
        "counts": {
            "employees": employee_count,
            "leaveTypes": leave_count,
            "payrolls": payroll_count,
        },
        "organization": {
            "id": org.id,
            "name": org.name,
            "country": getattr(org, "country", None),
            "currency": getattr(org, "default_currency", None),
        } if org else None,
    }


@router.get("/api/setup/status")
def setup_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user)
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    return compute_setup_status(db, org_id)
