"""Payroll compliance, offer letter, onboarding, and exit management routes."""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from core.auth import get_current_user, check_role
from core.tenant import get_employee_in_org
from core.datetime_utils import ist_now_naive
from models import User, Employee, Organization

router = APIRouter(tags=["Compliance"])


@router.post("/api/payroll/process/{employee_id}")
def process_payroll(
    employee_id: int,
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.compliance_engine import process_monthly_payroll
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    try:
        result = process_monthly_payroll(db, employee_id, month, year)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/payroll/calculate/pf/{employee_id}")
def calculate_pf(
    employee_id: int,
    gross_basic: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.compliance_engine import calculate_pf
    from models import StatutorySetting
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == emp.organization_id
    ).first()
    if not setting:
        raise HTTPException(status_code=400, detail="Statutory settings not configured")
    return calculate_pf(gross_basic, setting)


@router.get("/api/payroll/calculate/esi/{employee_id}")
def calculate_esi(
    employee_id: int,
    gross_salary: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.compliance_engine import calculate_esi
    from models import StatutorySetting
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == emp.organization_id
    ).first()
    if not setting:
        raise HTTPException(status_code=400, detail="Statutory settings not configured")
    return calculate_esi(gross_salary, setting, is_disabled=bool(getattr(emp, 'is_person_with_disability', False)))


@router.get("/api/payroll/calculate/pt/{employee_id}")
def calculate_professional_tax(
    employee_id: int,
    gross_salary: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.compliance_engine import calculate_professional_tax
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    org = db.query(Organization).filter(Organization.id == emp.organization_id).first()
    from services.compliance_engine import resolve_jurisdiction_state
    from services.payroll_service import _get_employee_template
    tpl = _get_employee_template(db, emp)
    state_code = resolve_jurisdiction_state(
        getattr(emp, "state_code", None),
        getattr(emp, "work_state", None),
        getattr(tpl, "registered_state", None),
        getattr(org, "registered_state", None) if org else None,
    )
    from datetime import date as _date
    return calculate_professional_tax(
        gross_salary, state_code, db=db, as_of=_date.today(),
        organization_id=emp.organization_id,
        company_id=getattr(emp, "company_id", None),
    )


@router.get("/api/payroll/calculate/income-tax/{employee_id}")
def calculate_income_tax(
    employee_id: int,
    annual_gross: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.compliance_engine import calculate_income_tax
    from models import TaxRegime, TaxSlab
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    regime_id = emp.tax_regime_id
    if not regime_id:
        regime = db.query(TaxRegime).filter(
            TaxRegime.organization_id == emp.organization_id,
            TaxRegime.is_default == True,
        ).first()
        if not regime:
            raise HTTPException(status_code=400, detail="No tax regime configured")
        regime_id = regime.id
    regime = db.query(TaxRegime).filter(TaxRegime.id == regime_id).first()
    slabs = db.query(TaxSlab).filter(TaxSlab.tax_regime_id == regime_id).order_by(TaxSlab.from_amount).all()
    return calculate_income_tax(annual_gross, regime, slabs)


@router.post("/api/payroll/calculate/gratuity")
def calculate_gratuity_endpoint(
    basic_da: float = Body(...), years_of_service: int = Body(...)
):
    from services.compliance_engine import calculate_gratuity
    return calculate_gratuity(basic_da, years_of_service)


@router.post("/api/payroll/calculate/bonus")
def calculate_bonus_endpoint(
    gross_salary: float = Body(...), months_worked: int = Body(12)
):
    from services.compliance_engine import calculate_bonus
    return calculate_bonus(gross_salary, months_worked)


@router.post("/api/onboarding/tasks/{employee_id}")
def create_onboarding_tasks(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.offer_letter_service import create_onboarding_tasks
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization required")
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, org_id)
    else:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    tasks = create_onboarding_tasks(db, employee_id, org_id)
    return {"message": f"{len(tasks)} onboarding tasks created", "tasks": [
        {"id": t.id, "title": t.title, "department": t.department, "status": t.status}
        for t in tasks
    ]}


@router.get("/api/onboarding/tasks/{employee_id}")
def get_onboarding_tasks(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models import OnboardingTask
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    tasks = db.query(OnboardingTask).filter(
        OnboardingTask.employee_id == employee_id
    ).order_by(OnboardingTask.created_at).all()
    return tasks


@router.put("/api/onboarding/tasks/{task_id}")
def update_onboarding_task(
    task_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models import OnboardingTask
    task = db.query(OnboardingTask).filter(OnboardingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role != "superadmin":
        task_emp = db.query(Employee).filter(Employee.id == task.employee_id).first()
        if not task_emp or task_emp.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Task not found")
    new_status = payload.get("status")
    if new_status:
        task.status = new_status
        if new_status == "completed":
            task.completed_at = ist_now_naive()
    db.commit()
    return {"message": "Task updated", "task": task}


@router.get("/api/exit/settlement/{employee_id}")
def get_full_final_settlement(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.exit_management_service import calculate_full_final_settlement
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    try:
        return calculate_full_final_settlement(db, employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/api/exit/clearance-checklist")
def get_clearance_checklist():
    from services.exit_management_service import get_clearance_checklist
    return get_clearance_checklist()


@router.post("/api/employees/{employee_id}/initiate-exit")
def initiate_exit(
    employee_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime as _dt
    from models import Employee, ExitRecord
    from services.exit_management_service import send_exit_confirmation
    exit_type = payload.get("exit_type") or payload.get("exitType") or "resigned"
    exit_date = payload.get("exit_date") or payload.get("exitDate") or ist_now_naive().strftime("%Y-%m-%d")
    last_wd = payload.get("last_working_day") or payload.get("lastWorkingDay") or exit_date
    reason = payload.get("reason") or ""
    notice_served = payload.get("notice_period_served") or payload.get("noticePeriodServed") or "no"

    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    if emp.status == "inactive":
        raise HTTPException(status_code=400, detail="Employee already inactive")

    exit_record = ExitRecord(
        employee_id=emp.id,
        organization_id=emp.organization_id,
        exit_type=exit_type,
        exit_date=_dt.strptime(exit_date, "%Y-%m-%d") if isinstance(exit_date, str) else exit_date,
        last_working_day=_dt.strptime(last_wd, "%Y-%m-%d") if isinstance(last_wd, str) else last_wd,
        reason=reason,
        notice_period_served=notice_served,
        handover_completed="no",
        fnf_status="pending",
        clearance_status="pending",
        initiated_by=current_user.id,
    )
    db.add(exit_record)
    db.flush()

    emp.status = "inactive"
    emp.termination_type = exit_type
    emp.termination_date = exit_record.exit_date
    emp.date_of_leaving = exit_record.last_working_day
    emp.full_final_settlement = "pending"
    db.commit()
    send_exit_confirmation(
        f"{emp.first_name} {emp.last_name or ''}",
        emp.email,
        last_wd,
    )
    return {"message": "Exit process initiated", "employee_id": employee_id, "exitRecordId": exit_record.id}


@router.get("/api/notifications/templates")
def get_notification_templates():
    """Return all available email notification templates."""
    return {
        "templates": [
            "payslip_generated",
            "leave_approved",
            "leave_rejected",
            "attendance_reminder",
            "offer_letter",
            "onboarding_welcome",
            "birthday_wish",
            "work_anniversary",
            "compliance_alert",
            "tds_deduction_summary",
        ]
    }
