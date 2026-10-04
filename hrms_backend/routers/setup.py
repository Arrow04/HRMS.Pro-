"""First-run setup — status detection + guided concierge configuration.

GET  /api/setup/status     auto-detected readiness (no manual step ticking)
GET  /api/setup/questions  the guided-interview question set (config as data)
POST /api/setup/concierge  apply interview answers company-wide, idempotently

The concierge is the Gusto/Rippling pattern: a new admin answers a handful
of plain-language questions and the HRMS configures statutory settings,
attendance, payroll and leave for them — never overwriting what exists.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_user
from database import get_db
from models import (
    AttendancePolicy, Employee, LeaveTemplate, LeaveType, Organization,
    Payroll, PayrollPolicy, StatutorySetting, TaxRegime, TaxSlab, User,
)

router = APIRouter(tags=["Setup"])

_SETUP_ROLES = ("superadmin", "admin")


def _require(user: User):
    if (user.role or "").lower() not in _SETUP_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can view setup status")


# ── Guided interview: questions are DATA so copy stays editable ────────────

QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "country",
        "title": "Where is your company based?",
        "help": "This decides which government deductions (PF, ESI, tax) we set up for you.",
        "type": "choice",
        "default": "india",
        "options": [
            {"value": "india", "label": "India",
             "hint": "PF, ESI, Professional Tax & income tax configured automatically"},
            {"value": "other", "label": "Somewhere else",
             "hint": "You can publish country-specific rules later"},
        ],
    },
    {
        "id": "workweek",
        "title": "Which days do your teams usually work?",
        "help": "Sets weekends and the working-day count used for pay calculations.",
        "type": "choice",
        "default": "mon_fri",
        "options": [
            {"value": "mon_fri", "label": "Monday – Friday",
             "hint": "Saturday & Sunday off"},
            {"value": "mon_sat", "label": "Monday – Saturday",
             "hint": "Sunday off"},
        ],
    },
    {
        "id": "work_hours",
        "title": "What are your usual working hours?",
        "help": "Used for attendance check-in/out and overtime thresholds.",
        "type": "choice",
        "default": "9-6",
        "options": [
            {"value": "9-6", "label": "9:00 AM – 6:00 PM", "hint": "9 hours with a 1-hour break"},
            {"value": "10-7", "label": "10:00 AM – 7:00 PM", "hint": "9 hours with a 1-hour break"},
            {"value": "11-8", "label": "11:00 AM – 8:00 PM", "hint": "9 hours with a 1-hour break"},
        ],
    },
    {
        "id": "pay_type",
        "title": "How are most of your people paid?",
        "help": "Daily-wage staff are converted to monthly pay using a 26-day month; "
                "monthly salaried staff use the standard 30-day convention.",
        "type": "choice",
        "default": "monthly",
        "options": [
            {"value": "monthly", "label": "Monthly salary",
             "hint": "Standard for full-time employees"},
            {"value": "daily", "label": "Daily wages",
             "hint": "Field / contract staff paid per day"},
            {"value": "mixed", "label": "A mix of both"},
        ],
    },
    {
        "id": "leaves",
        "title": "Which leaves do you offer?",
        "help": "We'll create these leave types with standard Indian quotas. "
                "You can add more or change the days any time.",
        "type": "multi",
        "default": ["casual", "sick", "earned"],
        "options": [
            {"value": "casual", "label": "Casual Leave", "hint": "7 days / year"},
            {"value": "sick", "label": "Sick Leave", "hint": "7 days / year"},
            {"value": "earned", "label": "Earned / Privilege Leave",
             "hint": "15 days / year, encashable at exit"},
            {"value": "maternity", "label": "Maternity Leave",
             "hint": "182 days as per the Maternity Benefit Act"},
            {"value": "comp_off", "label": "Comp-off", "hint": "Granted for working on holidays"},
        ],
    },
    {
        "id": "statutory",
        "title": "Set up government deductions?",
        "help": "PF (provident fund) and ESI (insurance) are usually mandatory in India. "
                "We apply the current statutory rates — fine-tune them any time.",
        "type": "choice",
        "default": "yes",
        "options": [
            {"value": "yes", "label": "Yes — standard India rules",
             "hint": "PF 12%, ESI 0.75% employee / 3.25% employer, PT by state"},
            {"value": "later", "label": "I'll configure this later",
             "hint": "Payslips will show zero statutory deductions until you do"},
        ],
    },
]

_LEAVE_SPECS = {
    "casual": {"name": "Casual Leave", "code": "casual", "days_allowed": 7, "is_paid": True, "is_encashable": False},
    "sick": {"name": "Sick Leave", "code": "sick", "days_allowed": 7, "is_paid": True, "is_encashable": False},
    "earned": {"name": "Earned Leave", "code": "earned", "days_allowed": 15, "is_paid": True, "is_encashable": True},
    "maternity": {"name": "Maternity Leave", "code": "maternity", "days_allowed": 182, "is_paid": True, "is_encashable": False},
    "comp_off": {"name": "Comp Off", "code": "comp_off", "days_allowed": 5, "is_paid": True, "is_encashable": False},
}

_WORKWEEK_MAP = {
    "mon_fri": {"working_days": "1,2,3,4,5", "working_days_per_week": 5},
    "mon_sat": {"working_days": "1,2,3,4,5,6", "working_days_per_week": 6},
}

_WORK_HOURS_MAP = {
    "9-6": {"check_in_time": "09:00", "check_out_time": "18:00", "overtime_threshold_hours": 9.0},
    "10-7": {"check_in_time": "10:00", "check_out_time": "19:00", "overtime_threshold_hours": 9.0},
    "11-8": {"check_in_time": "11:00", "check_out_time": "20:00", "overtime_threshold_hours": 9.0},
}


class ConciergeAnswers(BaseModel):
    country: str = "india"
    workweek: str = "mon_fri"
    work_hours: str = "9-6"
    pay_type: str = "monthly"
    leaves: List[str] = ["casual", "sick", "earned"]
    statutory: str = "yes"
    # Architecture: an Organization holds multiple Companies (legal entities).
    # companyId scopes ALL configuration to one company; None = org-wide
    # defaults for single-company orgs.
    companyId: Optional[int] = None


def _company_scope_q(q, model, company_id: Optional[int]):
    """Filter a config query to one company, or to org-wide defaults."""
    if company_id is not None:
        return q.filter(model.company_id == company_id)
    return q.filter(model.company_id.is_(None))


def compute_setup_status(db: Session, org_id: int, company_id: Optional[int] = None) -> dict:
    """Readiness of one organization — derived from data, never from guesses.

    company_id scopes the checks to a single Company (legal entity); None
    checks org-wide defaults (single-company orgs).
    """
    has_statutory = _company_scope_q(
        db.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org_id,
            StatutorySetting.status == "active",
        ), StatutorySetting, company_id,
    ).first() is not None
    has_regime = _company_scope_q(
        db.query(TaxRegime).filter(
            TaxRegime.organization_id == org_id,
            TaxRegime.is_active.is_(True),
        ), TaxRegime, company_id,
    ).first() is not None
    has_policy = _company_scope_q(
        db.query(PayrollPolicy).filter(
            PayrollPolicy.organization_id == org_id,
            PayrollPolicy.status == "active",
        ), PayrollPolicy, company_id,
    ).first() is not None
    # Leave types are org-level master data (engine resolves by org)
    leave_count = db.query(LeaveType).filter(
        LeaveType.organization_id == org_id,
        LeaveType.status == "active",
    ).count()
    emp_q = db.query(Employee).filter(
        Employee.organization_id == org_id,
        Employee.deleted_at.is_(None),
        Employee.status == "active",
    )
    if company_id is not None:
        emp_q = emp_q.filter(Employee.company_id == company_id)
    employee_count = emp_q.count()
    pay_q = db.query(Payroll).filter(
        Payroll.organization_id == org_id,
        Payroll.deleted_at.is_(None),
    )
    if company_id is not None:
        pay_q = pay_q.filter(Payroll.company_id == company_id)
    payroll_count = pay_q.count()

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
    from models import Company
    companies = [
        {"id": c.id, "name": c.name}
        for c in db.query(Company).filter(
            Company.organization_id == org_id,
            Company.deleted_at.is_(None),
        ).order_by(Company.name).all()
    ]
    company_scope = None
    if company_id is not None:
        for c in companies:
            if c["id"] == company_id:
                company_scope = c
                break
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
        "companies": companies,
        "companyScope": company_scope,
        "companyId": company_id,
    }


@router.get("/api/setup/status")
def setup_status(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Readiness for one company (legal entity), or org-wide defaults when
    companyId is omitted — the multi-company architecture's setup view."""
    _require(current_user)
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    return compute_setup_status(db, org_id, company_id=companyId)


@router.get("/api/setup/questions")
def setup_questions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The guided-interview question set — rendered by the Setup wizard."""
    _require(current_user)
    return {"questions": QUESTIONS}


def _apply_concierge(db: Session, org: Organization, a: ConciergeAnswers) -> Dict[str, Any]:
    """Apply interview answers for ONE company (or org-wide when companyId is
    None). Architecture: Organization -> Companies (legal entities); every
    statutory/attendance/payroll/leave row created here is scoped to the
    chosen company so each entity keeps its own configuration. Idempotent:
    never overwrites existing configuration, only fills what's missing."""
    applied: List[str] = []
    skipped: List[str] = []
    org_id = org.id
    cid = a.companyId

    def _scope(q, model):
        return _company_scope_q(q, model, cid)

    # 1) Statutory settings (country preset)
    has_stat = _scope(
        db.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org_id,
            StatutorySetting.status == "active",
        ), StatutorySetting,
    ).first()
    if a.country == "india" and a.statutory == "yes":
        if has_stat is None:
            from routers.payroll_config import COUNTRY_STATUTORY_PRESETS
            preset = COUNTRY_STATUTORY_PRESETS.get("india", {})
            fields = {k: v for k, v in preset.items() if k != "label"}
            db.add(StatutorySetting(
                organization_id=org_id, company_id=cid, status="active", **fields))
            applied.append("Statutory deductions (PF 12%, ESI, PT)")
        else:
            skipped.append("Statutory settings already existed")
    else:
        skipped.append("Statutory deductions skipped (per your answer)")

    # 2) Attendance policy (workweek + hours)
    has_att = _scope(
        db.query(AttendancePolicy).filter(
            AttendancePolicy.organization_id == org_id,
        ), AttendancePolicy,
    ).first()
    if has_att is None:
        wk = _WORKWEEK_MAP.get(a.workweek, _WORKWEEK_MAP["mon_fri"])
        hrs = _WORK_HOURS_MAP.get(a.work_hours, _WORK_HOURS_MAP["9-6"])
        db.add(AttendancePolicy(
            organization_id=org_id,
            company_id=cid,
            name="Default Attendance Policy",
            working_days=wk["working_days"],
            working_days_per_week=wk["working_days_per_week"],
            overtime_threshold_hours=hrs["overtime_threshold_hours"],
            check_in_time=hrs["check_in_time"],
            check_out_time=hrs["check_out_time"],
        ))
        applied.append(
            f"Attendance ({hrs['check_in_time']}–{hrs['check_out_time']}, "
            f"{wk['working_days_per_week']}-day week)"
        )
    else:
        skipped.append("Attendance policy already existed")

    # 3) Payroll policy (26 vs 30-day divisor + FY start)
    has_policy = _scope(
        db.query(PayrollPolicy).filter(
            PayrollPolicy.organization_id == org_id,
            PayrollPolicy.status == "active",
        ), PayrollPolicy,
    ).first()
    if has_policy is None:
        divisor = 26.0 if a.pay_type in ("daily", "mixed") else 30.0
        db.add(PayrollPolicy(
            organization_id=org_id,
            company_id=cid,
            name="Default Payroll Policy",
            status="active",
            pro_ration_method="paid_days",
            rounding_method="nearest",
            decimal_places=2,
            round_net_salary=True,
            default_currency=(getattr(org, "default_currency", None) or "INR"),
            daily_rate_divisor=divisor,
            fy_start_month=4 if a.country == "india" else 1,
        ))
        applied.append(
            f"Payroll policy ({int(divisor)}-day month convention, "
            f"FY start {'April' if a.country == 'india' else 'January'})"
        )
    else:
        skipped.append("Payroll policy already existed")

    # 4) Tax regime (TDS slabs)
    has_regime = _scope(
        db.query(TaxRegime).filter(
            TaxRegime.organization_id == org_id,
            TaxRegime.is_active.is_(True),
        ), TaxRegime,
    ).first()
    if has_regime is None:
        year = datetime.utcnow().year
        regime = TaxRegime(
            organization_id=org_id,
            company_id=cid,
            name="New Regime (Standard)",
            regime_type="new",
            is_active=True,
            is_default=True,
            financial_year=f"{year}-{str((year + 1) % 100).zfill(2)}",
            standard_deduction=75000.0,
            rebate_threshold=700000.0,
            rebate_amount=0.0,
            cess_rate=4.0,
        )
        db.add(regime)
        db.flush()
        for i, (lo, hi, rate) in enumerate((
            (0.0, 400000.0, 0.0), (400000.0, 800000.0, 5.0),
            (800000.0, 1200000.0, 10.0), (1200000.0, 1600000.0, 15.0),
            (1600000.0, 2000000.0, 20.0), (2000000.0, 2400000.0, 25.0),
            (2400000.0, None, 30.0),
        )):
            db.add(TaxSlab(tax_regime_id=regime.id, from_amount=lo,
                           to_amount=hi, rate=rate, sort_order=i))
        applied.append("Income tax slabs (TDS)")
    else:
        skipped.append("Tax regime already existed")

    # 5) Leave types (ORG-level master data: leave_types.code is globally
    # unique and the leave engine resolves types by org, not company) +
    # pinned template (per-company — templates may differ per legal entity)
    created_types = []
    existing_codes = {
        (lt.code or "").strip().lower()
        for lt in db.query(LeaveType).filter(LeaveType.organization_id == org_id).all()
    }
    for key in (a.leaves or []):
        spec = _LEAVE_SPECS.get(key)
        if not spec or spec["code"] in existing_codes:
            continue
        db.add(LeaveType(
            organization_id=org_id, company_id=None,
            name=spec["name"], code=spec["code"],
            days_allowed=spec["days_allowed"], is_paid=spec["is_paid"],
            is_encashable=spec.get("is_encashable", False), status="active",
        ))
        existing_codes.add(spec["code"])
        created_types.append(spec["name"])
    if created_types:
        applied.append(f"Leave types: {', '.join(created_types)}")
    else:
        skipped.append("No new leave types needed")

    has_template = _scope(
        db.query(LeaveTemplate).filter(
            LeaveTemplate.organization_id == org_id,
            LeaveTemplate.deleted_at.is_(None),
            LeaveTemplate.status == "active",
        ), LeaveTemplate,
    ).first()
    # Template is per-company; build it whenever this company lacks one and
    # the selected leave types exist org-level (created earlier or pre-existing).
    body_rows = []
    for key in (a.leaves or []):
        spec = _LEAVE_SPECS.get(key)
        if spec and spec["code"] in existing_codes:
            body_rows.append({
                "code": spec["code"], "name": spec["name"],
                "days": spec["days_allowed"], "paid": spec["is_paid"],
                "encashable": spec.get("is_encashable", False), "active": True,
            })
    if has_template is None and body_rows:
        db.add(LeaveTemplate(
            organization_id=org_id, company_id=cid,
            name="Standard Leave Policy",
            status="active", accrual_method="frontloaded",
            effective_from=datetime.utcnow().date(),
            body={"leaveTypes": body_rows},
        ))
        applied.append("Leave policy template")
    elif has_template is not None:
        skipped.append("Leave policy template already existed")

    # 6) Record the guided setup (audit + future reference), per company
    settings = dict(getattr(org, "settings", None) or {})
    setup_key = f"company_{cid}" if cid is not None else "org"
    guided = dict(settings.get("setup") or {})
    guided[setup_key] = {
        "guidedConfigured": True,
        "guidedAt": datetime.utcnow().isoformat(),
        "companyId": cid,
        "answers": a.model_dump(),
    }
    settings["setup"] = guided
    org.settings = settings

    db.commit()
    return {"applied": applied, "skipped": skipped, "companyId": cid}


@router.post("/api/setup/concierge")
def setup_concierge(
    answers: ConciergeAnswers,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Configure the HRMS from interview answers for one company.

    companyId scopes every created row to that Company (legal entity);
    omit it for single-company orgs (org-wide defaults).
    """
    _require(current_user)
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if answers.companyId is not None:
        from models import Company
        company = db.query(Company).filter(
            Company.id == answers.companyId,
            Company.organization_id == org_id,
            Company.deleted_at.is_(None),
        ).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found in this organization")
    result = _apply_concierge(db, org, answers)
    result["status"] = compute_setup_status(db, org_id, company_id=answers.companyId)
    return result
