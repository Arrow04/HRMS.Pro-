"""HRMS API leaves routes."""
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
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import (LeaveCreate, LeaveTypeCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org, get_header_company_id
from database import Base, SessionLocal, engine, get_db, get_read_db
from core.datetime_utils import ist_now_naive, ist_today, ist_year
from core.scale import MAX_LIST_LIMIT
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Leaves"])




@cached(ttl=120)
@router.get("/api/leave-types", tags=["Leave Types"])
def get_leave_types(
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    if companyId is None and request is not None:
        companyId = get_header_company_id(request)
    query = db.query(LeaveType)
    if current_user.role == "superadmin":
        if organizationId:
            query = query.filter(LeaveType.organization_id == organizationId)
    else:
        query = query.filter(LeaveType.organization_id == current_user.organization_id)
    if companyId is not None:
        # Company-specific leave types + org-wide defaults (company_id IS NULL).
        query = query.filter(or_(LeaveType.company_id == companyId, LeaveType.company_id.is_(None)))
    return query.all()


@router.post("/api/leave-types", tags=["Leave Types"])
def create_leave_type(
    lt_data: LeaveTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(lt_data.model_dump())
    data = {k: v for k, v in data.items() if hasattr(LeaveType, k)}
    if current_user.role != "superadmin":
        data["organization_id"] = current_user.organization_id
    lt = LeaveType(**data)
    db.add(lt)
    db.commit()
    db.refresh(lt)
    return lt


@router.put("/api/leave-types/{leave_type_id}", tags=["Leave Types"])
def update_leave_type(
    leave_type_id: int,
    lt_data: LeaveTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a leave type (name, paid/unpaid, encashable, color, days)."""
    lt = db.query(LeaveType).filter(LeaveType.id == leave_type_id).first()
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    if current_user.role != "superadmin" and lt.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    data = convert_camel_to_snake(lt_data.model_dump(exclude_unset=True))
    for k, v in data.items():
        if hasattr(LeaveType, k) and v is not None:
            setattr(lt, k, v)
    db.commit()
    db.refresh(lt)
    return lt


@router.delete("/api/leave-types/{leave_type_id}", tags=["Leave Types"])
def delete_leave_type(
    leave_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a leave type."""
    lt = db.query(LeaveType).filter(LeaveType.id == leave_type_id).first()
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    if current_user.role != "superadmin" and lt.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    lt.status = "inactive"
    db.commit()
    return {"message": "Leave type deactivated"}


def _auto_init_leave_balances(db: Session, employee_id: int, year: int) -> int:
    """Auto-create LeaveBalance records for an employee from the org's leave config.
    
    Reads from Organization.settings.leave_configs (the Leave Management page values).
    """
    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.deleted_at.is_(None)).first()
    if not emp:
        return 0
    org_id = emp.organization_id

    config = _resolve_leave_config(db, employee_id, org_id)
    if not config:
        return 0

    leave_types = db.query(LeaveType).filter(
        LeaveType.deleted_at.is_(None),
        LeaveType.status == "active",
    )
    if org_id:
        leave_types = leave_types.filter(
            (LeaveType.organization_id == org_id) | (LeaveType.organization_id.is_(None))
        )
    leave_types = leave_types.all()

    created = 0
    for field, (code, _label) in LEAVE_CONFIG_MAP.items():
        days = config.get(field)
        if days is None:
            continue
        try:
            days = int(days)
        except (TypeError, ValueError):
            continue
        lt = next((t for t in leave_types if (t.code or "").upper() == code), None)
        if not lt:
            continue
        existing = db.query(LeaveBalance).filter(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.year == year,
            LeaveBalance.leave_type_id == lt.id,
            LeaveBalance.deleted_at.is_(None),
        ).first()
        if existing:
            continue
        bal = LeaveBalance(
            employee_id=employee_id,
            year=year,
            leave_type_id=lt.id,
            total_days=days,
            used_days=0,
            remaining_days=days,
        )
        db.add(bal)
        created += 1

    if created:
        db.commit()
    return created


@router.get("/api/leave-balances", tags=["Leave Balances"])
def get_leave_balances(
    employeeId: Optional[int] = None,
    year: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    year = year or datetime.now().year
    query = db.query(LeaveBalance).filter(LeaveBalance.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.join(Employee, LeaveBalance.employee_id == Employee.id).filter(
            Employee.organization_id == current_user.organization_id)
    if employeeId:
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, employeeId, current_user.organization_id)
        query = query.filter(LeaveBalance.employee_id == employeeId)
    elif current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager", "hr_executive"):
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.user_id == current_user.id).first()
        if emp:
            query = query.filter(LeaveBalance.employee_id == emp.id)
            employeeId = emp.id
        else:
            return []

    # Auto-initialize leave balances if none exist for this employee+year
    if employeeId:
        existing = db.query(LeaveBalance).filter(
            LeaveBalance.employee_id == employeeId,
            LeaveBalance.year == year,
            LeaveBalance.deleted_at.is_(None),
        ).count()
        if existing == 0:
            try:
                _auto_init_leave_balances(db, employeeId, year)
            except Exception:
                pass
    if year:
        query = query.filter(LeaveBalance.year == year)
    total = query.count()
    results = query.order_by(LeaveBalance.id.desc()).offset((page - 1) * limit).limit(limit).all()

    # Batch load employees and leave types to avoid N+1 queries
    emp_ids = {b.employee_id for b in results}
    lt_ids = {b.leave_type_id for b in results}
    employees_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
    types_map = {t.id: t for t in db.query(LeaveType).filter(LeaveType.id.in_(lt_ids)).all()} if lt_ids else {}

    balances = []
    for b in results:
        emp = employees_map.get(b.employee_id)
        lt = types_map.get(b.leave_type_id)
        balances.append({
            "id": b.id,
            "employeeId": b.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}" if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "year": b.year,
            "leaveTypeId": b.leave_type_id,
            "leaveTypeName": lt.name if lt else None,
            "totalDays": b.total_days,
            "usedDays": b.used_days,
            "remainingDays": b.remaining_days,
        })
    if employeeId:
        return balances
    return {"data": balances, "pagination": {"page": page, "limit": limit, "total": total}}


@router.put("/api/leave-balances/{balance_id}", tags=["Leave Balances"])
def update_leave_balance(
    balance_id: int,
    data: LeaveBalanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bal = db.query(LeaveBalance).filter(LeaveBalance.id == balance_id, LeaveBalance.deleted_at.is_(None)).first()
    if not bal:
        raise HTTPException(status_code=404, detail="Leave balance not found")
    if current_user.role != "superadmin":
        emp = db.query(Employee).filter(Employee.id == bal.employee_id).first()
        if emp is None or int(emp.organization_id) != int(current_user.organization_id):
            raise HTTPException(status_code=404, detail="Leave balance not found")
    update_data = data.model_dump(exclude_unset=True)
    field_map = {"totalDays": "total_days", "usedDays": "used_days", "remainingDays": "remaining_days"}
    for camel, snake in field_map.items():
        if camel in update_data:
            setattr(bal, snake, update_data[camel])
    db.commit()
    db.refresh(bal)
    return {"message": "Leave balance updated"}


@router.get("/api/leaves/{leave_id}/history", tags=["Leaves"])
def get_leave_approval_history(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lv = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.id == leave_id).first()
    if current_user.role != "superadmin":
        org_owned(lv, current_user.organization_id)
    history = db.query(LeaveApprovalHistory).filter(
        LeaveApprovalHistory.leave_application_id == leave_id
    ).order_by(LeaveApprovalHistory.created_at.asc()).all()

    # Batch load approvers to avoid N+1 queries
    approver_ids = {h.approver_id for h in history if h.approver_id}
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(approver_ids)).all()} if approver_ids else {}

    result = []
    for h in history:
        approver = users_map.get(h.approver_id)
        result.append({
            "id": h.id,
            "leaveApplicationId": h.leave_application_id,
            "approverId": h.approver_id,
            "approverName": approver.full_name if approver else None,
            "approvalLevel": h.approval_level,
            "action": h.action,
            "previousStatus": h.previous_status,
            "newStatus": h.new_status,
            "comments": h.comments,
            "createdAt": h.created_at.isoformat() if h.created_at else None,
        })
    return result


@cached(ttl=60)
@router.get("/api/leaves", tags=["Leaves"])
def get_leaves(
    employeeId: Optional[int] = None,
    status: Optional[str] = None,
    companyId: Optional[int] = None,
    includeInactive: bool = False,
    limit: int = Query(100, ge=1, le=MAX_LIST_LIMIT),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    if companyId is None and request is not None:
        companyId = get_header_company_id(request)
    query = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(LeaveApplication.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(LeaveApplication.company_id == companyId)
    # Exclude leaves belonging to deactivated/terminated employees (unless requested)
    if not includeInactive:
        query = query.join(Employee, LeaveApplication.employee_id == Employee.id).filter(
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        )
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager", "hr_executive"):
        emp_id = _get_employee_id_for_user(db, current_user)
        if emp_id:
            query = query.filter(LeaveApplication.employee_id == emp_id)
        else:
            return []
    if employeeId:
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, employeeId, current_user.organization_id)
        query = query.filter(LeaveApplication.employee_id == employeeId)
    if status:
        query = query.filter(LeaveApplication.status == status)
    leaves = query.order_by(LeaveApplication.created_at.desc()).limit(limit).all()

    emp_ids = {l.employee_id for l in leaves}
    employees_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
    type_ids = {l.leave_type_id for l in leaves}
    types_map = {t.id: t for t in db.query(LeaveType).filter(LeaveType.id.in_(type_ids)).all()} if type_ids else {}

    # Batch-load company, department, and branch names
    comp_ids = {e.company_id for e in employees_map.values() if e.company_id}
    dept_ids = {e.department_id for e in employees_map.values() if e.department_id}
    comp_map = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(comp_ids), Company.deleted_at.is_(None)).all()} if comp_ids else {}
    dept_map = {d.id: d.name for d in db.query(Department).filter(Department.id.in_(dept_ids), Department.deleted_at.is_(None)).all()} if dept_ids else {}

    from models import EmployeeBranchAssignment
    emp_branch_map = {}
    if emp_ids:
        branch_rows = db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id.in_(emp_ids),
            EmployeeBranchAssignment.status == 'active',
            EmployeeBranchAssignment.deleted_at.is_(None),
        ).all()
        for br in branch_rows:
            if br.employee_id not in emp_branch_map:
                emp_branch_map[br.employee_id] = br.branch_id
    branch_ids = set(emp_branch_map.values())
    branch_map = {b.id: b.name for b in db.query(Branch).filter(Branch.id.in_(branch_ids), Branch.deleted_at.is_(None)).all()} if branch_ids else {}

    # Fallback: reconcile leave_types from LEAVE_TYPE master data for ids not resolved
    missing_type_ids = [tid for tid in type_ids if tid not in types_map]
    if missing_type_ids:
        try:
            from routers.master_data import sync_leave_types_from_master_data
            sync_leave_types_from_master_data(db)
            types_map = {t.id: t for t in db.query(LeaveType).filter(LeaveType.id.in_(type_ids)).all()}
        except Exception:
            pass

    result = []
    for l in leaves:
        emp = employees_map.get(l.employee_id)
        lt = types_map.get(l.leave_type_id)
        d = {
            "id": l.id,
            "employeeId": l.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}".strip() if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "leaveTypeId": l.leave_type_id,
            "leaveType": lt.name if lt else None,
            "organizationId": l.organization_id,
            "companyId": l.company_id,
            "companyName": comp_map.get(emp.company_id) if emp and emp.company_id else None,
            "branchName": branch_map.get(emp_branch_map.get(l.employee_id)) if l.employee_id in emp_branch_map else None,
            "departmentName": dept_map.get(emp.department_id) if emp and emp.department_id else None,
            "departmentId": l.department_id,
            "startDate": l.start_date.isoformat() if l.start_date else None,
            "endDate": l.end_date.isoformat() if l.end_date else None,
            "totalDays": l.total_days,
            "reason": l.reason,
            "purpose": l.purpose,
            "status": l.status,
            "approverId": l.approver_id,
            "approvedAt": l.approved_at.isoformat() if l.approved_at else None,
            "rejectionReason": l.rejection_reason,
            "isHalfDay": l.is_half_day,
            "isPaid": l.is_paid,
            "isPrivilege": l.is_privilege,
            "createdAt": l.created_at.isoformat() if l.created_at else None,
            "updatedAt": l.updated_at.isoformat() if l.updated_at else None,
        }
        result.append(d)
    return result


@cached(ttl=60)
@router.get("/api/leaves/stats", tags=["Leaves"])
def get_leave_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = ist_today()
    start_of_month = today.replace(day=1)
    query = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(LeaveApplication.organization_id == current_user.organization_id)
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager", "hr_executive"):
        emp_id = _get_employee_id_for_user(db, current_user)
        if emp_id:
            query = query.filter(LeaveApplication.employee_id == emp_id)
        else:
            return {"pending": 0, "approved": 0, "rejected": 0, "total": 0, "approvedToday": 0, "rejectedToday": 0, "totalMonth": 0}
    pending = query.filter(LeaveApplication.status == "pending").count()
    approved = query.filter(LeaveApplication.status == "approved").count()
    rejected = query.filter(LeaveApplication.status == "rejected").count()
    total = query.count()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)
    approved_today = query.filter(
        LeaveApplication.status == "approved",
        LeaveApplication.updated_at >= today_start,
        LeaveApplication.updated_at < today_end,
    ).count()
    rejected_today = query.filter(
        LeaveApplication.status == "rejected",
        LeaveApplication.updated_at >= today_start,
        LeaveApplication.updated_at < today_end,
    ).count()
    total_month = query.filter(LeaveApplication.created_at >= start_of_month).count()
    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "total": total,
        "approvedToday": approved_today,
        "rejectedToday": rejected_today,
        "totalMonth": total_month,
    }


def _deduct_leave_balance(db: Session, lv: LeaveApplication) -> None:
    """Deduct the approved leave days from the employee's leave balance once.

    Guards against double-deduction (balance_deducted already set) and against
    driving the balance negative (clamped at 0). Unpaid/LOP leaves still consume
    quota so balances stay honest.
    """
    if not lv or not lv.employee_id or not lv.leave_type_id:
        return
    if lv.balance_deducted:
        return
    try:
        year = lv.start_date.year if hasattr(lv.start_date, "year") else ist_year()
        bal = (
            db.query(LeaveBalance)
            .filter(
                LeaveBalance.employee_id == lv.employee_id,
                LeaveBalance.leave_type_id == lv.leave_type_id,
                LeaveBalance.year == year,
                LeaveBalance.deleted_at.is_(None),
            )
            .first()
        )
        days = int(lv.total_days or 0)
        if bal:
            bal.used_days = int(bal.used_days or 0) + days
            bal.remaining_days = max(0, int(bal.remaining_days or 0) - days)
        lv.balance_deducted = days
    except Exception:
        db.rollback()


def _sync_attendance_for_leave(db: Session, lv: LeaveApplication) -> None:
    """Create/update attendance records for each day of a leave so attendance stays in sync with leaves.

    Uses the leave type name as the attendance status (e.g. "Sick Leave"), links the leave
    application, and marks the days as on-leave.
    """
    from datetime import timedelta
    current = lv.start_date.date() if hasattr(lv.start_date, 'date') else dateparser.parse(str(lv.start_date)).date()
    end = lv.end_date.date() if hasattr(lv.end_date, 'date') else dateparser.parse(str(lv.end_date)).date()
    status = "on_leave"
    if lv.leave_type_id:
        lt = db.query(LeaveType).filter(LeaveType.id == lv.leave_type_id).first()
        if lt and lt.name:
            status = lt.name
    # Pre-fetch all existing attendance records for this employee+date range (batch query)
    start_dt = datetime.combine(current, datetime.min.time())
    end_dt = datetime.combine(end, datetime.min.time()) + timedelta(days=1)
    existing_records = {
        r.date.date(): r for r in db.query(Attendance).filter(
            Attendance.deleted_at.is_(None),
            Attendance.employee_id == lv.employee_id,
            Attendance.date >= start_dt,
            Attendance.date < end_dt,
        ).all()
    }
    while current <= end:
        existing = existing_records.get(current)
        if existing:
            # Only override unattributed / work-day statuses so we don't clobber manual entries
            if existing.leave_application_id is None or existing.status in ("present", "absent"):
                existing.status = status
                existing.is_on_leave = True
                existing.leave_application_id = lv.id
                existing.is_manual_entry = True
        else:
            att = Attendance(
                employee_id=lv.employee_id,
                organization_id=lv.organization_id,
                date=datetime.combine(current, datetime.min.time()),
                status=status,
                is_on_leave=True,
                leave_application_id=lv.id,
                is_manual_entry=True,
                sync_status="synced",
            )
            db.add(att)
        current += timedelta(days=1)


@router.post("/api/leaves", tags=["Leaves"])
def create_leave(
    employeeId: int = Form(...),
    leaveTypeId: int = Form(...),
    startDate: str = Form(...),
    endDate: str = Form(...),
    reason: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    isHalfDay: Optional[bool] = Form(False),
    attachment: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = {
        "employee_id": employeeId,
        "leave_type_id": leaveTypeId,
        "start_date": startDate,
        "end_date": endDate,
        "reason": reason,
        "description": description,
        "is_half_day": isHalfDay,
    }
    from core.employee_scope import apply_employee_scope
    data = apply_employee_scope(db, data)
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, data.get("employee_id"), current_user.organization_id)
        validate_company_in_org(db, Company, data.get("company_id"), current_user.organization_id)
        data["organization_id"] = current_user.organization_id

    # Handle attachment upload
    attachment_url = None
    if attachment and attachment.filename:
        filename = f"leave_{uuid.uuid4().hex[:12]}_{attachment.filename}"
        upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "leaves")
        os.makedirs(upload_dir, exist_ok=True)
        with open(os.path.join(upload_dir, filename), "wb") as f:
            f.write(attachment.file.read())
        attachment_url = f"/uploads/leaves/{filename}"

    lv = LeaveApplication(**data)
    if attachment_url:
        lv.attachment_url = attachment_url
    if not lv.total_days:
        start = dateparser.parse(str(lv.start_date)).date()
        end = dateparser.parse(str(lv.end_date)).date()
        lv.total_days = (end - start).days + 1
    lv.status = "pending"
    db.add(lv)
    db.commit()
    db.refresh(lv)
    try:
        _sync_attendance_for_leave(db, lv)
        db.commit()
    except Exception:
        db.rollback()
    from services.notifier import notify_leave_submitted
    emp = db.query(Employee).filter(Employee.id == lv.employee_id).first()
    employee_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() or f"Employee #{lv.employee_id}"
    try:
        notify_leave_submitted(db, lv, employee_name)
        db.commit()
    except Exception:
        db.rollback()
    invalidate_cache("hrms:tenant:*")
    return lv


@router.put("/api/leaves/{leave_id}", tags=["Leaves"])
def update_leave(
    leave_id: int,
    leave_data: LeaveCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lv = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.id == leave_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="Leave not found")
    if current_user.role != "superadmin":
        org_owned(lv, current_user.organization_id)
    for key, val in leave_data.model_dump(exclude_unset=True).items():
        if key in ("organizationId", "companyId"):
            continue
        setattr(lv, key, val)
    db.commit()
    db.refresh(lv)
    return lv


@router.post("/api/leaves/{leave_id}/approve", tags=["Leaves"])
def approve_leave(
    leave_id: int,
    approval_data: LeaveApprovalAction,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lv = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.id == leave_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="Leave not found")
    if current_user.role != "superadmin":
        org_owned(lv, current_user.organization_id)

    if approval_data.action == "approve":
        if approval_data.level >= (lv.total_approval_levels or 1):
            lv.status = "approved"
            lv.approved_at = ist_now_naive()
            # Auto-create/update attendance records for each day of the approved leave
            _sync_attendance_for_leave(db, lv)
            _deduct_leave_balance(db, lv)
        else:
            lv.current_approval_level = (lv.current_approval_level or 1) + 1
        if approval_data.level == 1:
            lv.level1_approved_at = ist_now_naive()
            lv.level1_approver_id = current_user.id
        elif approval_data.level == 2:
            lv.level2_approved_at = ist_now_naive()
            lv.level2_approver_id = current_user.id
        elif approval_data.level == 3:
            lv.level3_approved_at = ist_now_naive()
            lv.level3_approver_id = current_user.id
    else:
        lv.status = "rejected"
        lv.rejection_reason = approval_data.comments

    history_entry = LeaveApprovalHistory(
        leave_application_id=lv.id,
        approver_id=current_user.id,
        approval_level=approval_data.level or 1,
        action=approval_data.action,
        previous_status=lv.status,
        new_status=lv.status if approval_data.action == "approve" else "rejected",
        comments=approval_data.comments,
        ip_address=request.client.host if hasattr(request, 'client') and request.client else None,
    )
    db.add(history_entry)
    db.commit()
    db.refresh(lv)
    return lv


def _apply_leave_decision(db: Session, lv, action: str, current_user: User, comments: Optional[str] = None) -> LeaveApplication:
    """Shared leave approve/reject logic (used by POST and PUT endpoints)."""
    from datetime import timedelta
    if action == "approve":
        lv.status = "approved"
        lv.approved_at = ist_now_naive()
        # Auto-create/update attendance records for each day of the approved leave
        _sync_attendance_for_leave(db, lv)
        _deduct_leave_balance(db, lv)
    else:
        lv.status = "rejected"
        lv.rejection_reason = comments

    history_entry = LeaveApprovalHistory(
        leave_application_id=lv.id,
        approver_id=current_user.id,
        approval_level=1,
        action=action,
        previous_status=lv.status,
        new_status="approved" if action == "approve" else "rejected",
        comments=comments,
    )
    db.add(history_entry)
    db.commit()
    db.refresh(lv)
    # Notify the employee of the decision
    from services.notifier import notify_leave_decided
    emp = db.query(Employee).filter(Employee.id == lv.employee_id).first()
    employee_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() if emp else f"Employee #{lv.employee_id}"
    approver_name = (current_user.full_name or "").strip() or current_user.email or "HR"
    try:
        notify_leave_decided(db, lv, employee_name, action, approver_name=approver_name, employee_user_id=emp.user_id if emp else None, actor_user_id=current_user.id)
        db.commit()
    except Exception:
        db.rollback()
    invalidate_cache("hrms:tenant:*")
    return lv


@router.put("/api/leaves/{leave_id}/approve", tags=["Leaves"])
def approve_leave_put(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lv = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.id == leave_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="Leave not found")
    if current_user.role != "superadmin":
        org_owned(lv, current_user.organization_id)
    return _apply_leave_decision(db, lv, "approve", current_user)


@router.put("/api/leaves/{leave_id}/reject", tags=["Leaves"])
def reject_leave_put(
    leave_id: int,
    payload: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lv = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.id == leave_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="Leave not found")
    if current_user.role != "superadmin":
        org_owned(lv, current_user.organization_id)
    comments = (payload or {}).get("comments") if payload else None
    return _apply_leave_decision(db, lv, "reject", current_user, comments)


@router.delete("/api/leaves/{leave_id}", tags=["Leaves"])
def delete_leave(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lv = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.id == leave_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="Leave not found")
    if current_user.role != "superadmin":
        org_owned(lv, current_user.organization_id)
    lv.deleted_at = ist_now_naive()
    db.commit()
    return {"message": "Leave application deleted"}


@router.get("/api/leaves/template", tags=["Leaves"])
def download_leaves_template(current_user: User = Depends(get_current_user)):
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["employeeId", "leaveTypeId", "startDate", "endDate", "reason", "isHalfDay"])
    writer.writerow(["1", "1", "2025-01-01", "2025-01-02", "Annual leave", "false"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leave_template.csv"},
    )


@router.post("/api/leaves/bulk-upload", tags=["Leaves"])
async def bulk_upload_leaves(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode()))
    count = 0
    for row in reader:
        emp_id = int(row.get("employeeId", 0))
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, emp_id, current_user.organization_id)
        lv = LeaveApplication(
            employee_id=emp_id,
            organization_id=current_user.organization_id,
            leave_type_id=int(row.get("leaveTypeId", 0)),
            start_date=row.get("startDate"),
            end_date=row.get("endDate"),
            reason=row.get("reason", ""),
            status="pending",
        )
        db.add(lv)
        count += 1
    db.commit()
    return {"message": f"{count} leaves uploaded", "count": count}


# =============================================================================
# SCOPED LEAVE CONFIGURATION (company / branch / department wise)
# =============================================================================

LEAVE_CONFIG_MAP = {
    "casual": ("CL", "casual"),
    "sick": ("SL", "sick"),
    "earned": ("EL", "earned"),
    "maternity": ("ML", "maternity"),
}


def _employee_branch_ids(db, employee_id):
    try:
        rows = db.execute(
            text("SELECT branch_id FROM employee_branches WHERE employee_id = :eid"),
            {"eid": employee_id},
        ).fetchall()
        return [r[0] for r in rows if r[0] is not None]
    except Exception:
        return []


def _resolve_leave_config(db, employee_id, organization_id):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == organization_id).first()
    if not org:
        return None
    data = org.settings or {}
    # Leave config can be in "leave" (new format) or "leave_configs" (old format)
    config = data.get("leave") or {}
    if not config:
        configs = data.get("leave_configs") or []
        if configs:
            emp = db.query(Employee).filter(Employee.id == employee_id).first()
            if not emp:
                return None
            branch_ids = _employee_branch_ids(db, employee_id)
            def score(c):
                cid = c.get("companyId")
                bid = c.get("branchId")
                did = c.get("departmentId")
                rank = 3 if did is not None else 2 if bid is not None else 1 if cid is not None else 0
                cm = (cid is None) or (emp.company_id is not None and cid == emp.company_id)
                bm = (bid is None) or (bid in branch_ids)
                dm = (did is None) or (emp.department_id is not None and did == emp.department_id)
                if not (cm and bm and dm):
                    return (-1, -1, -1, -1)
                return (rank, 1 if cm else 0, 1 if bm else 0, 1 if dm else 0)
            best = max(configs, key=score, default=None)
            if best and score(best)[0] >= 0:
                return best
        return None
    return config


@router.post("/api/leave-balances/init", tags=["Leave Balances"])
def init_leave_balances(
    employeeId: int,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Initialize / resync an employee's leave balances from the resolved scoped leave config.

    Maps config fields (casual/sick/earned/maternity) onto matching leave types by code.
    """
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employeeId, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employeeId).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    org_id = emp.organization_id or current_user.organization_id
    year = year or datetime.now().year

    config = _resolve_leave_config(db, employeeId, org_id)
    if not config:
        return {"message": "No scoped leave config found; balances unchanged", "updated": 0}

    leave_types = db.query(LeaveType).filter(
        LeaveType.organization_id == org_id,
        LeaveType.status == "active",
    ).all() or db.query(LeaveType).filter(LeaveType.status == "active").all()

    updated = 0
    for field, (code, _label) in LEAVE_CONFIG_MAP.items():
        days = config.get(field)
        if days is None:
            continue
        try:
            days = int(days)
        except (TypeError, ValueError):
            continue
        lt = next((t for t in leave_types if (t.code or "").upper() == code), None)
        if not lt:
            continue
        bal = db.query(LeaveBalance).filter(
            LeaveBalance.employee_id == employeeId,
            LeaveBalance.year == year,
            LeaveBalance.leave_type_id == lt.id,
            LeaveBalance.deleted_at.is_(None),
        ).first()
        if bal:
            bal.total_days = days
            bal.remaining_days = max(0, days - (bal.used_days or 0))
        else:
            bal = LeaveBalance(
                employee_id=employeeId,
                year=year,
                leave_type_id=lt.id,
                total_days=days,
                used_days=0,
                remaining_days=days,
            )
            db.add(bal)
        updated += 1

    db.commit()
    return {
        "message": f"Initialized leave balances for employee {emp.first_name} {emp.last_name}",
        "updated": updated,
        "configName": config.get("name"),
    }


@router.post("/api/leave-balances/init-all", tags=["Leave Balances"])
def init_all_leave_balances(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Initialize leave balances for every active employee from their scoped leave config."""
    org_id = current_user.organization_id
    employees = db.query(Employee).filter(
        Employee.deleted_at.is_(None),
        Employee.organization_id == org_id if org_id else True,
    ).all()
    total = 0
    skipped = 0
    for emp in employees:
        config = _resolve_leave_config(db, emp.id, emp.organization_id or org_id)
        if not config:
            skipped += 1
            continue
        year_local = year or datetime.now().year
        leave_types = db.query(LeaveType).filter(
            LeaveType.organization_id == (emp.organization_id or org_id),
            LeaveType.status == "active",
        ).all() or db.query(LeaveType).filter(LeaveType.status == "active").all()
        for field, (code, _label) in LEAVE_CONFIG_MAP.items():
            days = config.get(field)
            if days is None:
                continue
            try:
                days = int(days)
            except (TypeError, ValueError):
                continue
            lt = next((t for t in leave_types if (t.code or "").upper() == code), None)
            if not lt:
                continue
            bal = db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.year == year_local,
                LeaveBalance.leave_type_id == lt.id,
                LeaveBalance.deleted_at.is_(None),
            ).first()
            if bal:
                bal.total_days = days
                bal.remaining_days = max(0, days - (bal.used_days or 0))
            else:
                db.add(LeaveBalance(
                    employee_id=emp.id,
                    year=year_local,
                    leave_type_id=lt.id,
                    total_days=days,
                    used_days=0,
                    remaining_days=days,
                ))
            total += 1
    db.commit()
    return {"message": f"Initialized balances for {total} leave types across {len(employees)} employees", "updated": total, "skipped": skipped}

