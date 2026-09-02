"""HRMS API expenses routes."""
from __future__ import annotations

import base64
import calendar
import collections
import io
import json
import math
import os
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union

import redis
import structlog
from dateutil import parser as dateparser
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import case, event, func, inspect, or_, text
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, with_loader_criteria

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.datetime_utils import ist_now_naive
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import (ExpenseCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org, get_header_company_id
from database import Base, SessionLocal, engine, get_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Expenses"])




@cached(ttl=60)
@router.get("/api/expenses", tags=["Expenses"])
def get_expenses(
    employeeId: Optional[int] = None,
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    status: Optional[str] = None,
    includeInactive: bool = False,
    limit: int = Query(500, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    if companyId is None and request is not None:
        companyId = get_header_company_id(request)
    query = db.query(Expense).filter(Expense.deleted_at.is_(None))
    # Exclude expenses belonging to deactivated/terminated employees (unless requested)
    if not includeInactive:
        query = query.join(Employee, Expense.employee_id == Employee.id).filter(
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        )
    if current_user.role != "superadmin":
        query = query.filter(Expense.organization_id == current_user.organization_id)
    elif organizationId:
        query = query.filter(Expense.organization_id == organizationId)
    if companyId:
        query = query.filter(Expense.company_id == companyId)
    if status:
        query = query.filter(Expense.status == status)
    if employeeId:
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, employeeId, current_user.organization_id)
        query = query.filter(Expense.employee_id == employeeId)
    expenses = query.order_by(Expense.created_at.desc()).limit(limit).all()

    emp_ids = {e.employee_id for e in expenses}
    emp_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}

    result = []
    for e in expenses:
        emp = emp_map.get(e.employee_id)
        result.append({
            "id": e.id,
            "employeeId": e.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}".strip() if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "category": e.category,
            "amount": e.amount,
            "description": e.description,
            "expenseDate": str(e.expense_date) if e.expense_date else None,
            "status": e.status,
            "currency": e.currency,
            "organizationId": e.organization_id,
            "companyId": e.company_id,
            "departmentId": e.department_id,
            "projectId": e.project_id,
            "location": e.location,
            "vendor": e.vendor,
            "paymentMethod": e.payment_method,
            "billable": e.billable,
            "clientId": e.client_id,
            "justification": e.justification,
            "notes": e.notes,
            "taxAmount": e.tax_amount,
            "taxInclusive": e.tax_inclusive,
            "receiptUrl": e.receipt_url,
            "createdAt": e.created_at.isoformat() if e.created_at else None,
        })
    return result


def _serialize_expense(e) -> dict:
    """SQLAlchemy Expense ORM doesn't round-trip through dict(); return a clean payload."""
    return {
        "id": e.id,
        "employeeId": e.employee_id,
        "category": e.category,
        "amount": e.amount,
        "description": e.description,
        "expenseDate": str(e.expense_date) if e.expense_date else None,
        "status": e.status,
        "currency": e.currency,
        "organizationId": e.organization_id,
        "companyId": e.company_id,
        "departmentId": e.department_id,
        "vendor": e.vendor,
        "invoiceNumber": e.invoice_number,
        "paymentMethod": e.payment_method,
        "billable": e.billable,
        "approverId": e.approver_id,
        "approvedAt": e.approved_at.isoformat() if e.approved_at else None,
    }


@router.post("/api/expenses", tags=["Expenses"])
def create_expense(
    employeeId: int = Form(...),
    category: str = Form(...),
    amount: float = Form(...),
    expenseDate: str = Form(...),
    description: Optional[str] = Form(None),
    currency: Optional[str] = Form("INR"),
    organizationId: Optional[int] = Form(None),
    companyId: Optional[int] = Form(None),
    departmentId: Optional[int] = Form(None),
    projectId: Optional[int] = Form(None),
    location: Optional[str] = Form(None),
    vendor: Optional[str] = Form(None),
    invoiceNumber: Optional[str] = Form(None),
    taxAmount: Optional[float] = Form(0),
    taxInclusive: Optional[bool] = Form(False),
    paymentMethod: Optional[str] = Form("cash"),
    billable: Optional[bool] = Form(False),
    clientId: Optional[int] = Form(None),
    justification: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    status: Optional[str] = Form("pending"),
    receipt: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import date as _date
    data = {
        "employee_id": employeeId,
        "category": category,
        "amount": amount,
        "description": description,
        "currency": currency,
        "expense_date": _date.fromisoformat(expenseDate) if isinstance(expenseDate, str) else expenseDate,
        "organization_id": organizationId,
        "company_id": companyId,
        "department_id": departmentId,
        "project_id": projectId,
        "location": location,
        "vendor": vendor,
        "invoice_number": invoiceNumber,
        "tax_amount": taxAmount,
        "tax_inclusive": taxInclusive,
        "payment_method": paymentMethod,
        "billable": billable,
        "client_id": clientId,
        "justification": justification,
        "notes": notes,
    }
    data = {k: v for k, v in data.items() if v is not None}
    from core.employee_scope import apply_employee_scope
    data = apply_employee_scope(db, data)
    data.pop("branch_id", None)
    if amount is not None and amount <= 0:
        raise HTTPException(status_code=400, detail="Expense amount must be greater than zero")
    # Only the submitter's org may create the expense; status is always pending on submit.
    if not organizationId:
        organizationId = current_user.organization_id
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employeeId, current_user.organization_id)
        validate_company_in_org(db, Company, companyId, current_user.organization_id)
        organizationId = current_user.organization_id
    data["organization_id"] = organizationId
    emp_check = db.query(Employee).filter(Employee.id == employeeId).first()
    if not emp_check:
        raise HTTPException(status_code=400, detail="Employee not found")
    exp = Expense(**data)
    exp.status = "pending"
    if receipt is not None and receipt.filename:
        filename = f"expense_{uuid.uuid4().hex[:12]}_{receipt.filename}"
        upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "expenses")
        os.makedirs(upload_dir, exist_ok=True)
        save_path = os.path.join(upload_dir, filename)
        with open(save_path, "wb") as f:
            f.write(receipt.file.read())
        exp.receipt_url = f"/uploads/expenses/{filename}"
    db.add(exp)
    db.commit()
    db.refresh(exp)
    from services.notifier import notify_expense_submitted
    emp = db.query(Employee).filter(Employee.id == exp.employee_id).first()
    employee_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() if emp else f"Employee #{exp.employee_id}"
    try:
        notify_expense_submitted(db, exp, employee_name)
        db.commit()
    except Exception:
        db.rollback()
    invalidate_cache("hrms:tenant:*")
    return _serialize_expense(exp)


@cached(ttl=60)
@router.get("/api/expenses/stats", tags=["Expenses"])
def get_expenses_stats(
    includeInactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Expense).filter(Expense.deleted_at.is_(None))
    # Exclude expenses belonging to deactivated/terminated employees (unless requested)
    if not includeInactive:
        query = query.join(Employee, Expense.employee_id == Employee.id).filter(
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        )
    if current_user.organization_id:
        query = query.filter(Expense.organization_id == current_user.organization_id)

    now = ist_now_naive()

    pending = query.filter(Expense.status == "pending").count()
    approved_count = query.filter(Expense.status == "approved").count()
    rejected = query.filter(Expense.status == "rejected").count()
    reimbursed = query.filter(Expense.status == "reimbursed").count()

    # Amounts (scoped the same way as the counts)
    base_filter = [Expense.deleted_at.is_(None)]
    if not includeInactive:
        base_filter.append(Expense.employee_id.in_(
            db.query(Employee.id).filter(
                Employee.deleted_at.is_(None),
                Employee.status == "active",
            )
        ))
    if current_user.organization_id:
        base_filter.append(Expense.organization_id == current_user.organization_id)

    def _amount(status_cond=None, date_cond=None):
        q = db.query(func.coalesce(func.sum(Expense.amount), 0)).select_from(Expense).filter(*base_filter)
        if status_cond is not None:
            q = q.filter(Expense.status == status_cond)
        if date_cond is not None:
            q = q.filter(date_cond)
        return q.scalar() or 0

    this_month_start = datetime(now.year, now.month, 1)
    total_amount = _amount()
    this_month_amount = _amount(date_cond=Expense.expense_date >= this_month_start)

    return {
        "totalAmount": total_amount,
        "total": total_amount,
        "pending": pending,
        "approved": approved_count,
        "rejected": rejected,
        "reimbursed": reimbursed,
        "totalExpenses": pending + approved_count + rejected + reimbursed,
        "thisMonth": query.filter(Expense.expense_date >= this_month_start).count(),
        "pendingAmount": _amount("pending"),
        "approvedAmount": _amount("approved"),
        "thisMonthAmount": this_month_amount,
    }


@router.post("/api/expenses/{expense_id}/approve", tags=["Expenses"])
def approve_expense(
    expense_id: int,
    approval_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_role(["admin", "superadmin", "hr_admin", "hr_manager"])),
):
    exp = db.query(Expense).filter(Expense.deleted_at.is_(None), Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.organization_id and current_user.organization_id and exp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this expense")
    # Approver cannot be the claimant (separation of duties)
    emp = db.query(Employee).filter(Employee.id == exp.employee_id).first()
    if emp and emp.user_id and emp.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot approve your own expense")
    action = str(approval_data.get("action", "approved")).lower()
    allowed = {"pending": {"approved", "rejected"}, "approved": {"rejected"}, "rejected": {"pending"}}
    if action not in allowed.get(exp.status, set()):
        raise HTTPException(status_code=400, detail=f"Invalid transition: {exp.status} -> {action}")
    exp.status = action
    exp.approver_id = current_user.id
    exp.approved_at = ist_now_naive()
    db.commit()
    db.refresh(exp)
    from services.notifier import notify_expense_decided
    employee_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() if emp else f"Employee #{exp.employee_id}"
    try:
        notify_expense_decided(db, exp, employee_name, action, approver_name=(current_user.full_name or "").strip() or current_user.email or "HR", employee_user_id=emp.user_id if emp else None, actor_user_id=current_user.id)
        db.commit()
    except Exception:
        db.rollback()
    invalidate_cache("hrms:tenant:*")
    return _serialize_expense(exp)


@router.put("/api/expenses/{expense_id}/approve", tags=["Expenses"])
def approve_expense_put(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_role(["admin", "superadmin", "hr_admin", "hr_manager"])),
):
    exp = db.query(Expense).filter(Expense.deleted_at.is_(None), Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.organization_id and current_user.organization_id and exp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this expense")
    emp = db.query(Employee).filter(Employee.id == exp.employee_id).first()
    if emp and emp.user_id and emp.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot approve your own expense")
    if exp.status not in ("pending", "rejected"):
        raise HTTPException(status_code=400, detail=f"Invalid transition: {exp.status} -> approved")
    exp.status = "approved"
    exp.approver_id = current_user.id
    exp.approved_at = ist_now_naive()
    db.commit()
    db.refresh(exp)
    from services.notifier import notify_expense_decided
    employee_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() if emp else f"Employee #{exp.employee_id}"
    try:
        notify_expense_decided(db, exp, employee_name, "approved", approver_name=(current_user.full_name or "").strip() or current_user.email or "HR", employee_user_id=emp.user_id if emp else None, actor_user_id=current_user.id)
        db.commit()
    except Exception:
        db.rollback()
    return _serialize_expense(exp)


@router.put("/api/expenses/{expense_id}/reject", tags=["Expenses"])
def reject_expense_put(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_role(["admin", "superadmin", "hr_admin", "hr_manager"])),
):
    exp = db.query(Expense).filter(Expense.deleted_at.is_(None), Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.organization_id and current_user.organization_id and exp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this expense")
    if exp.status != "pending":
        raise HTTPException(status_code=400, detail=f"Invalid transition: {exp.status} -> rejected")
    exp.status = "rejected"
    exp.approver_id = current_user.id
    db.commit()
    db.refresh(exp)
    from services.notifier import notify_expense_decided
    emp = db.query(Employee).filter(Employee.id == exp.employee_id).first()
    employee_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() if emp else f"Employee #{exp.employee_id}"
    try:
        notify_expense_decided(db, exp, employee_name, "rejected", approver_name=(current_user.full_name or "").strip() or current_user.email or "HR", employee_user_id=emp.user_id if emp else None, actor_user_id=current_user.id)
        db.commit()
    except Exception:
        db.rollback()
    return _serialize_expense(exp)


@router.put("/api/expenses/{expense_id}", tags=["Expenses"])
def update_expense(
    expense_id: int,
    expense_data: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exp = db.query(Expense).filter(Expense.deleted_at.is_(None), Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.organization_id and current_user.organization_id and exp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this expense")
    # Only the claimant or an admin may edit; status is managed via approve/reject.
    emp = db.query(Employee).filter(Employee.id == exp.employee_id).first()
    is_admin = current_user.role in ("admin", "superadmin", "hr_admin", "hr_manager")
    is_owner = emp and emp.user_id and emp.user_id == current_user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="Not authorized to edit this expense")
    if exp.status not in ("pending", "rejected"):
        raise HTTPException(status_code=400, detail="Approved/reimbursed expenses cannot be edited")
    protected = {"status", "approver_id", "approved_by", "approved_at", "reimbursed_at", "employee_id", "organization_id"}
    for key, val in expense_data.model_dump(exclude_unset=True).items():
        if key not in protected:
            setattr(exp, key, val)
    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/api/expenses/{expense_id}", tags=["Expenses"])
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exp = db.query(Expense).filter(Expense.deleted_at.is_(None), Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.organization_id and current_user.organization_id and exp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this expense")
    is_admin = current_user.role in ("admin", "superadmin", "hr_admin", "hr_manager")
    emp = db.query(Employee).filter(Employee.id == exp.employee_id).first()
    is_owner = emp and emp.user_id and emp.user_id == current_user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="Not authorized")
    exp.deleted_at = ist_now_naive()
    db.commit()
    return {"message": "Expense deleted"}


@cached(ttl=60)
@router.get("/api/expenses/summary", tags=["Expenses"])
def get_expense_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Expense summary for the Expenses page header cards."""
    query = db.query(Expense).filter(Expense.deleted_at.is_(None))
    if current_user.organization_id:
        query = query.filter(Expense.organization_id == current_user.organization_id)

    this_month = ist_now_naive().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_start = datetime(year or this_month.year, month or this_month.month, 1) if (month or year) else this_month

    def _sum(status_: Optional[str] = None):
        q = query
        if status_:
            q = q.filter(Expense.status == status_)
        val = q.with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar()
        return round(float(val or 0), 2)

    this_month_q = query.filter(Expense.expense_date >= month_start.date())
    this_month_total = this_month_q.with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar()

    return {
        "total": _sum(),
        "pending": _sum("pending"),
        "approved": _sum("approved"),
        "rejected": _sum("rejected"),
        "reimbursed": _sum("reimbursed"),
        "thisMonth": round(float(this_month_total or 0), 2),
        "count": query.count(),
    }


@router.get("/api/expenses/template", tags=["Expenses"])
def download_expense_template(current_user: User = Depends(get_current_user)):
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["employeeId", "category", "amount", "expenseDate", "description", "currency"])
    writer.writerow(["1", "Travel", "5000", "2025-01-10", "Client meeting", "INR"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses_template.csv"},
    )


@router.post("/api/expenses/bulk-upload", tags=["Expenses"])
def bulk_upload_expenses(
    file: UploadFile = File(...),
    organizationId: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk upload expenses from a CSV file."""
    import csv, io
    from datetime import date as _date

    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    org_id = current_user.organization_id

    created = []
    for row in reader:
        emp_id = row.get("employeeId") or row.get("employee_id")
        if not emp_id:
            continue
        try:
            amount = float(row.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0
        exp_date = None
        try:
            exp_date = _date.fromisoformat((row.get("expenseDate") or row.get("expense_date") or "").strip()[:10])
        except (ValueError, TypeError):
            exp_date = _date.today()
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, int(emp_id), current_user.organization_id)
        emp = db.query(Employee).filter(Employee.id == int(emp_id)).first()
        exp = Expense(
            employee_id=int(emp_id),
            organization_id=org_id,
            company_id=emp.company_id if emp else None,
            department_id=emp.department_id if emp else None,
            category=(row.get("category") or "Other").strip() or "Other",
            amount=amount,
            expense_date=exp_date,
            description=(row.get("description") or "").strip() or None,
            currency=(row.get("currency") or "INR").strip() or "INR",
            status="pending",
        )
        db.add(exp)
        created.append(exp)
    db.commit()
    return {"message": f"{len(created)} expenses imported", "count": len(created)}

