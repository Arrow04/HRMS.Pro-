"""HRMS API payroll routes."""
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
from core.datetime_utils import ist_now_naive, ist_today, ist_year
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import (PayrollCreate, SalaryTemplateCreate, SalaryTemplateUpdate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, logger, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org, get_header_company_id
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from database import Base, SessionLocal, engine, get_db, get_read_db
from core.scale import MAX_LIST_LIMIT, MAX_PERIOD_LIST_LIMIT, DEFAULT_LIST_LIMIT
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeBranchAssignment, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PayrollPeriodLock, PayrollRun, PerformanceReview, ReportExecutionLog, SalaryLoan, SalaryRevision, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record, _compute_cumulative_tds, _get_tax_regime, _get_payroll_policy
from services.accounting_service import post_payroll_journal
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Payroll"])




@cached(ttl=120)
@router.get("/api/salary-templates", tags=["Salary Templates"])
def get_salary_templates(
    organizationId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(SalaryTemplate)
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(SalaryTemplate.organization_id == current_user.organization_id)
    return query.all()


@router.post("/api/salary-templates", tags=["Salary Templates"])
def create_salary_template(
    st_data: SalaryTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    st = SalaryTemplate(**convert_camel_to_snake(st_data.model_dump()))
    if current_user.role != "superadmin":
        st.organization_id = current_user.organization_id
    db.add(st)
    db.commit()
    db.refresh(st)
    return st


@router.delete("/api/salary-templates/{template_id}", tags=["Salary Templates"])
def delete_salary_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    st = db.query(SalaryTemplate).filter(SalaryTemplate.id == template_id).first()
    if not st:
        raise HTTPException(status_code=404, detail="Salary template not found")
    if current_user.role != "superadmin":
        org_owned(st, current_user.organization_id)
    db.delete(st)
    db.commit()
    return {"message": "Salary template deleted"}


@router.put("/api/salary-templates/{template_id}", tags=["Salary Templates"])
def update_salary_template(
    template_id: int,
    st_data: SalaryTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    st = db.query(SalaryTemplate).filter(SalaryTemplate.id == template_id).first()
    if not st:
        raise HTTPException(status_code=404, detail="Salary template not found")
    if current_user.role != "superadmin":
        org_owned(st, current_user.organization_id)
    updates = {k: v for k, v in convert_camel_to_snake(st_data.model_dump(exclude_unset=True)).items() if v is not None}
    if current_user.role != "superadmin":
        updates.pop("organization_id", None)
    for k, v in updates.items():
        setattr(st, k, v)
    db.commit()
    db.refresh(st)
    return st


@router.get("/api/payroll/attendance-summary", tags=["Payroll"])
def get_attendance_summary_for_payroll(
    employeeId: int,
    startDate: str,
    endDate: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Attendance summary for payroll calculation over a date range."""
    from datetime import datetime as _dt

    def _parse(v: str):
        try:
            return _dt.fromisoformat((v or "").replace("Z", "+00:00"))
        except Exception:
            return _dt.strptime((v or "")[:10], "%Y-%m-%d")

    start_dt = _parse(startDate)
    end_dt = _parse(endDate).replace(hour=23, minute=59, second=59, microsecond=999999)

    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employeeId, current_user.organization_id)

    records = db.query(Attendance).filter(
        Attendance.employee_id == employeeId,
        Attendance.date >= start_dt,
        Attendance.date <= end_dt,
        Attendance.deleted_at.is_(None),
    ).all()

    total_days = 0
    present = 0
    absent = 0
    late = 0
    half_day = 0
    on_leave = 0
    holiday = 0
    wfh = 0
    total_work_hours = 0.0
    total_overtime = 0.0
    late_minutes_total = 0

    for r in records:
        total_days += 1
        s = (r.status or "").lower()
        if s in ("present",):
            present += 1
        elif s in ("absent",):
            absent += 1
        elif s in ("late",):
            late += 1
        elif s in ("half_day", "half day"):
            half_day += 1
        elif s in ("on_leave", "leave"):
            on_leave += 1
        elif s in ("holiday",):
            holiday += 1
        elif s in ("work_from_home", "wfh"):
            wfh += 1
        if r.work_hours:
            total_work_hours += r.work_hours
        if r.overtime_hours:
            total_overtime += r.overtime_hours
        if r.late_minutes:
            late_minutes_total += r.late_minutes

    return {
        "employeeId": employeeId,
        "startDate": startDate,
        "endDate": endDate,
        "totalDays": total_days,
        "present": present,
        "absent": absent,
        "late": late,
        "halfDay": half_day,
        "onLeave": on_leave,
        "holiday": holiday,
        "workFromHome": wfh,
        "totalWorkHours": round(total_work_hours, 2),
        "totalOvertime": round(total_overtime, 2),
        "lateMinutesTotal": late_minutes_total,
        "payableDays": present + half_day * 0.5 + on_leave + holiday,
    }


# ── Payroll period finalize (soft lock) ────────────────────────────────────

@router.get("/api/payroll/attendance-status", tags=["Payroll"])
def get_attendance_status(
    month: int,
    year: int,
    companyId: Optional[int] = None,
    employeeId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Whether the payroll period's attendance has been finalized (company or employee scope)."""
    org_id = current_user.organization_id
    lock = db.query(PayrollPeriodLock).filter(
        PayrollPeriodLock.organization_id == org_id,
        PayrollPeriodLock.month == month,
        PayrollPeriodLock.year == year,
        PayrollPeriodLock.company_id == companyId,
        PayrollPeriodLock.employee_id == employeeId,
    ).order_by(PayrollPeriodLock.id.desc()).first()
    if not lock or lock.status != "finalized":
        return {"finalized": False, "companyId": companyId, "employeeId": employeeId, "month": month, "year": year}
    return {
        "finalized": True,
        "companyId": lock.company_id,
        "employeeId": lock.employee_id,
        "month": month,
        "year": year,
        "finalizedBy": lock.finalized_by,
        "finalizedAt": lock.finalized_at.isoformat() if lock.finalized_at else None,
    }


@router.post("/api/payroll/finalize-attendance", tags=["Payroll"])
def finalize_attendance(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-finalize the attendance/leave/holiday inputs for a payroll period.

    Soft flag only — edits are still allowed, but the Run Payroll flow warns
    when the period is finalized. Scope by company (companyId) or employee
    (employeeId); employee scope wins for a per-employee double-check.
    """
    org_id = current_user.organization_id
    month = int(payload.get("month"))
    year = int(payload.get("year"))
    company_id = payload.get("companyId")
    company_id = int(company_id) if company_id not in (None, "", "all") else None
    employee_id = payload.get("employeeId")
    employee_id = int(employee_id) if employee_id not in (None, "", "all") else None
    if company_id is not None:
        validate_company_in_org(db, Company, company_id, org_id)
    if employee_id is not None:
        get_employee_in_org(db, Employee, employee_id, org_id)

    lock = db.query(PayrollPeriodLock).filter(
        PayrollPeriodLock.organization_id == org_id,
        PayrollPeriodLock.month == month,
        PayrollPeriodLock.year == year,
        PayrollPeriodLock.company_id == company_id,
        PayrollPeriodLock.employee_id == employee_id,
    ).first()
    if lock:
        lock.status = "finalized"
        lock.finalized_by = current_user.id
        lock.finalized_at = ist_now_naive()
        lock.reopened_by = None
        lock.reopened_at = None
    else:
        lock = PayrollPeriodLock(
            organization_id=org_id,
            company_id=company_id,
            employee_id=employee_id,
            month=month,
            year=year,
            status="finalized",
            finalized_by=current_user.id,
            finalized_at=ist_now_naive(),
        )
        db.add(lock)
    db.commit()
    return {"message": "Payroll period finalized", "finalized": True}


@router.post("/api/payroll/reopen-attendance", tags=["Payroll"])
def reopen_attendance(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reopen a finalized payroll period so corrections can be made."""
    org_id = current_user.organization_id
    month = int(payload.get("month"))
    year = int(payload.get("year"))
    company_id = payload.get("companyId")
    company_id = int(company_id) if company_id not in (None, "", "all") else None
    employee_id = payload.get("employeeId")
    employee_id = int(employee_id) if employee_id not in (None, "", "all") else None

    lock = db.query(PayrollPeriodLock).filter(
        PayrollPeriodLock.organization_id == org_id,
        PayrollPeriodLock.month == month,
        PayrollPeriodLock.year == year,
        PayrollPeriodLock.company_id == company_id,
        PayrollPeriodLock.employee_id == employee_id,
    ).first()
    if lock:
        lock.status = "reopened"
        lock.reopened_by = current_user.id
        lock.reopened_at = ist_now_naive()
        db.commit()
    return {"message": "Payroll period reopened", "finalized": False}


@router.get("/api/payroll/attendance-review", tags=["Payroll"])
def get_attendance_review_summary(
    month: int,
    year: int,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Company-level attendance/leave/holiday counts for HR review before payroll."""
    from calendar import monthrange
    org_id = current_user.organization_id
    start = datetime(year, month, 1)
    end = datetime(year, month, monthrange(year, month)[1], 23, 59, 59)

    emp_q = db.query(Employee).filter(
        Employee.organization_id == org_id,
        Employee.deleted_at.is_(None),
    )
    if companyId is not None:
        emp_q = emp_q.filter(Employee.company_id == companyId)
    emp_ids = [e.id for e in emp_q.all()]
    employee_count = len(emp_ids)

    att_q = db.query(Attendance).filter(
        Attendance.organization_id == org_id,
        Attendance.deleted_at.is_(None),
        Attendance.date >= start,
        Attendance.date <= end,
    )
    if companyId is not None:
        att_q = att_q.filter(Attendance.company_id == companyId)
    records = att_q.all()

    present = absent = half_day = late = holiday = week_off = 0
    overtime_hours = 0.0
    for r in records:
        s = (r.status or "").strip().lower()
        if s in ("present", "work_from_home", "work_from_home_approved", "overtime"):
            present += 1
        elif s in ("late",):
            present += 1
            late += 1
        elif s in ("absent",):
            absent += 1
        elif s in ("half_day", "half day"):
            half_day += 1
        elif s in ("holiday",) or r.is_holiday:
            holiday += 1
        elif s in ("week_off", "weekoff", "weekly_off", "week off"):
            week_off += 1
        overtime_hours += float(r.overtime_hours or 0)

    leave_q = db.query(LeaveApplication).filter(
        LeaveApplication.organization_id == org_id,
        LeaveApplication.deleted_at.is_(None),
        LeaveApplication.status == "approved",
        LeaveApplication.start_date <= end,
        LeaveApplication.end_date >= start,
    )
    if companyId is not None:
        leave_q = leave_q.filter(LeaveApplication.company_id == companyId)
    paid_leave = unpaid_leave = 0
    for lv in leave_q.all():
        days = int(lv.total_days or 0)
        if lv.is_paid:
            paid_leave += days
        else:
            unpaid_leave += days

    holiday_count = db.query(Holiday).filter(
        Holiday.organization_id == org_id,
        Holiday.deleted_at.is_(None),
        Holiday.date >= start,
        Holiday.date <= end,
    )
    if companyId is not None:
        holiday_count = holiday_count.filter((Holiday.company_id == companyId) | (Holiday.company_id.is_(None)))
    holiday_count = holiday_count.count()

    status = get_attendance_status(month=month, year=year, companyId=companyId, db=db, current_user=current_user)

    return {
        "companyId": companyId,
        "month": month,
        "year": year,
        "employeeCount": employee_count,
        "presentDays": present,
        "absentDays": absent,
        "halfDays": half_day,
        "lateDays": late,
        "holidayDays": holiday_count,
        "weekOffDays": week_off,
        "overtimeHours": round(overtime_hours, 2),
        "paidLeaveDays": paid_leave,
        "unpaidLeaveDays": unpaid_leave,
        "finalized": status["finalized"],
    }


@router.get("/api/payroll/attendance-checklist", tags=["Payroll"])
def get_attendance_checklist(
    month: int,
    year: int,
    companyId: Optional[int] = None,
    branchId: Optional[int] = None,
    departmentId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pre-payroll completeness checklist: block payroll on dirty inputs.

    Returns, per in-scope employee, working dates with NO attendance record
    (week-offs, non-working holidays and out-of-employment days excluded),
    pending leave applications overlapping the month, and check-in-without-
    checkout rows. `complete` is True only when every list is empty.
    Lists are capped; counts are exact.
    """
    from calendar import monthrange
    from datetime import date as _date
    from sqlalchemy import or_ as _or

    org_id = current_user.organization_id
    dim = monthrange(year, month)[1]
    m_start, m_end = _date(year, month, 1), _date(year, month, dim)

    emp_q = db.query(Employee).filter(
        Employee.organization_id == org_id,
        Employee.deleted_at.is_(None),
        Employee.status == "active",
    )
    if companyId is not None:
        emp_q = emp_q.filter(Employee.company_id == companyId)
    if departmentId is not None:
        emp_q = emp_q.filter(Employee.department_id == departmentId)
    if branchId is not None:
        emp_q = emp_q.filter(Employee.id.in_(
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(
                EmployeeBranchAssignment.branch_id == branchId,
                EmployeeBranchAssignment.status == "active",
                EmployeeBranchAssignment.deleted_at.is_(None),
            )
        ))
    employees = emp_q.all()

    # Non-working holidays in scope (working-day holidays need punches too —
    # they are normal workdays, so they stay in the expected set implicitly).
    hq = db.query(Holiday).filter(
        Holiday.organization_id == org_id,
        Holiday.deleted_at.is_(None),
        Holiday.date >= m_start,
        Holiday.date <= m_end,
        _or_(Holiday.is_working_day.is_(False), Holiday.is_working_day.is_(None)),
    )
    if companyId is not None:
        hq = hq.filter((Holiday.company_id == companyId) | (Holiday.company_id.is_(None)))
    off_dates = set()
    for h in hq.all():
        try:
            off_dates.add(h.date.date() if hasattr(h.date, "date") else h.date)
        except Exception:
            continue

    # All attendance rows in scope/month, grouped per employee.
    att_q = db.query(Attendance).filter(
        Attendance.organization_id == org_id,
        Attendance.deleted_at.is_(None),
        Attendance.date >= datetime(year, month, 1),
        Attendance.date < datetime(year, month, dim) + timedelta(days=1),
    )
    if companyId is not None:
        att_q = att_q.filter(Attendance.company_id == companyId)
    rec_dates: dict = {}
    no_checkout: list = []
    for r in att_q.all():
        try:
            d = r.date.date() if hasattr(r.date, "date") else r.date
        except Exception:
            continue
        rec_dates.setdefault(r.employee_id, set()).add(d.isoformat() if hasattr(d, "isoformat") else str(d)[:10])
        if getattr(r, "check_in", None) and not getattr(r, "check_out", None):
            emp = next((e for e in employees if e.id == r.employee_id), None)
            no_checkout.append({
                "employeeId": r.employee_id,
                "name": f"{emp.first_name} {emp.last_name}".strip() if emp else f"#{r.employee_id}",
                "date": d.isoformat() if hasattr(d, "isoformat") else str(d)[:10],
            })

    # Pending leaves overlapping the month.
    lv_q = db.query(LeaveApplication).filter(
        LeaveApplication.organization_id == org_id,
        LeaveApplication.deleted_at.is_(None),
        LeaveApplication.status == "pending",
        LeaveApplication.start_date <= datetime(year, month, dim, 23, 59, 59),
        LeaveApplication.end_date >= datetime(year, month, 1),
    )
    if companyId is not None:
        lv_q = lv_q.filter(LeaveApplication.company_id == companyId)
    pending_leaves = []
    for lv in lv_q.all():
        emp = next((e for e in employees if e.id == lv.employee_id), None)
        try:
            s = lv.start_date.date() if hasattr(lv.start_date, "date") else lv.start_date
            e = lv.end_date.date() if hasattr(lv.end_date, "date") else lv.end_date
            s, e = (s.isoformat(), e.isoformat()) if hasattr(s, "isoformat") else (str(s)[:10], str(e)[:10])
        except Exception:
            s, e = str(lv.start_date)[:10], str(lv.end_date)[:10]
        pending_leaves.append({
            "id": lv.id,
            "employeeId": lv.employee_id,
            "name": f"{emp.first_name} {emp.last_name}".strip() if emp else f"#{lv.employee_id}",
            "start": s, "end": e,
        })

    # Per-employee expected working dates (policy workweek + employment window,
    # minus non-working holidays). Policy lookups cached: most employees share.
    from services.payroll_service import _get_attendance_policy
    policy_cache: dict = {}
    missing = []
    total_missing = 0
    as_of = _date(year, month, dim)
    for emp in employees:
        key = (emp.company_id, getattr(emp, "attendance_policy_id", None), getattr(emp, "payroll_template_id", None))
        if key not in policy_cache:
            try:
                pol = _get_attendance_policy(db, emp, as_of)
                wd = set()
                for x in (pol.working_days or "1,2,3,4,5,6").split(","):
                    x = x.strip()
                    if x.isdigit():
                        wd.add(int(x))
                policy_cache[key] = wd or {1, 2, 3, 4, 5, 6}
            except Exception:
                policy_cache[key] = {1, 2, 3, 4, 5, 6}
        wd = policy_cache[key]
        try:
            join_d = emp.join_date.date() if emp.join_date and hasattr(emp.join_date, "date") else emp.join_date
        except Exception:
            join_d = None
        try:
            exit_d = (emp.date_of_leaving or emp.termination_date)
            exit_d = exit_d.date() if exit_d and hasattr(exit_d, "date") else exit_d
        except Exception:
            exit_d = None
        expected = []
        for day in range(1, dim + 1):
            d = _date(year, month, day)
            if join_d and d < join_d:
                continue
            if exit_d and d > exit_d:
                continue
            if d > _date.today():
                continue  # future days can't have punches yet
            if ((d.weekday() + 1) % 7) not in wd:
                continue
            if d in off_dates:
                continue
            expected.append(d.isoformat())
        have = rec_dates.get(emp.id, set())
        gap = [ds for ds in expected if ds not in have]
        if gap:
            total_missing += len(gap)
            missing.append({
                "employeeId": emp.id,
                "name": f"{emp.first_name} {emp.last_name}".strip(),
                "code": emp.employee_code,
                "missingCount": len(gap),
                "missingDates": gap[:15],
            })

    status = get_attendance_status(month=month, year=year, companyId=companyId, db=db, current_user=current_user)
    complete = not missing and not pending_leaves and not no_checkout
    return {
        "month": month, "year": year, "companyId": companyId,
        "branchId": branchId, "departmentId": departmentId,
        "employeesChecked": len(employees),
        "complete": complete,
        "finalized": status["finalized"],
        "employeesWithMissing": len(missing),
        "totalMissing": total_missing,
        "missingDays": missing[:200],
        "pendingLeaveCount": len(pending_leaves),
        "pendingLeaves": pending_leaves[:200],
        "missingCheckoutCount": len(no_checkout),
        "missingCheckouts": no_checkout[:200],
    }


@router.get("/api/payroll", tags=["Payroll"])
def get_payroll(
    employeeId: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    companyId: Optional[int] = None,
    departmentId: Optional[int] = None,
    branchId: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: Optional[int] = Query(None, ge=1),
    cursor: Optional[int] = Query(None, description="Keyset cursor (payroll id)"),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    companyId = resolve_company_scope(db, current_user, companyId, request)

    period_scoped = month is not None and year is not None
    max_allowed = MAX_PERIOD_LIST_LIMIT if period_scoped else MAX_LIST_LIMIT
    if limit is None:
        eff_limit = max_allowed if period_scoped else DEFAULT_LIST_LIMIT
    else:
        eff_limit = min(limit, max_allowed)

    query = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
    # Tenant scoping: never leak payrolls across organizations
    if current_user.organization_id:
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    if employeeId:
        if current_user.role != "superadmin":
            _pay_emp = db.query(Employee).filter(Employee.id == employeeId).first()
            if _pay_emp is not None:
                assert_company_allowed(db, current_user, _pay_emp.company_id)
        query = query.filter(Payroll.employee_id == employeeId)
    if month:
        query = query.filter(Payroll.month == month)
    if year:
        query = query.filter(Payroll.year == year)
    if companyId:
        query = query.filter(Payroll.company_id == companyId)
    if departmentId:
        query = query.filter(Payroll.department_id == departmentId)
    if branchId:
        query = query.filter(Payroll.employee_id.in_(
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(EmployeeBranchAssignment.branch_id == branchId)
            .filter(EmployeeBranchAssignment.status == "active")
            .filter(EmployeeBranchAssignment.deleted_at.is_(None))
        ))

    if cursor is not None:
        query = query.filter(Payroll.id < cursor).order_by(Payroll.id.desc()).limit(eff_limit)
        payrolls = query.all()
        total_count = None
        has_more = len(payrolls) == eff_limit
        next_cursor = payrolls[-1].id if has_more else None
    else:
        total_count = query.count()
        offset = (page - 1) * eff_limit
        payrolls = query.order_by(Payroll.id.desc()).offset(offset).limit(eff_limit).all()
        has_more = (page * eff_limit) < total_count
        next_cursor = payrolls[-1].id if has_more else None

    emp_ids = {p.employee_id for p in payrolls}
    emp_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}

    # Batch-resolve display names (company / department / branch) once per request.
    company_map: Dict[int, str] = {}
    dept_map: Dict[int, str] = {}
    branch_map: Dict[int, List[str]] = {}
    branch_id_map: Dict[int, int] = {}
    if emp_ids:
        cids = {e.company_id for e in emp_map.values() if e.company_id}
        dids = {e.department_id for e in emp_map.values() if e.department_id}
        if cids:
            company_map = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(cids)).all()}
        if dids:
            dept_map = {d.id: d.name for d in db.query(Department).filter(Department.id.in_(dids)).all()}
        br_rows = db.query(EmployeeBranchAssignment.employee_id, Branch.name, EmployeeBranchAssignment.branch_id).join(
            Branch, EmployeeBranchAssignment.branch_id == Branch.id
        ).filter(
            EmployeeBranchAssignment.employee_id.in_(emp_ids),
            EmployeeBranchAssignment.status == "active",
            EmployeeBranchAssignment.deleted_at.is_(None),
        ).order_by(EmployeeBranchAssignment.is_primary.desc()).all()
        for eid, bname, bid in br_rows:
            branch_map.setdefault(eid, []).append(bname)
            if eid not in branch_id_map:
                branch_id_map[eid] = bid

    result = []
    for p in payrolls:
        emp = emp_map.get(p.employee_id)
        company_id = emp.company_id if emp else p.company_id
        department_id = emp.department_id if emp else p.department_id
        result.append({
            "id": p.id,
            "employeeId": p.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}".strip() if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "month": p.month,
            "year": p.year,
            "companyId": company_id,
            "companyName": company_map.get(company_id) if company_id else None,
            "organizationId": p.organization_id,
            "departmentId": department_id,
            "departmentName": dept_map.get(department_id) if department_id else None,
            "branchId": branch_id_map.get(p.employee_id),
            "branchName": ", ".join(branch_map.get(p.employee_id, [])) or None,
            "country": p.country,
            "registeredState": p.registered_state,
            "basicSalary": p.basic_salary,
            "hra": p.hra,
            "da": p.da,
            "conveyance": p.conveyance,
            "medical": p.medical,
            "specialAllowance": p.special_allowance,
            "overtimePay": p.overtime_pay,
            "bonus": p.bonus,
            "commission": p.commission,
            "incentive": p.incentive,
            "otherEarnings": p.other_earnings,
            "grossSalary": p.gross_salary,
            "totalEarnings": p.total_earnings,
            "pfDeduction": p.pf_deduction,
            "esiDeduction": p.esi_deduction,
            "professionalTax": p.professional_tax,
            "lwfDeduction": p.lwf_deduction,
            "tdsDeduction": p.tds_deduction,
            "incomeTax": p.income_tax,
            "surcharge": p.surcharge,
            "cess": p.cess,
            "loanDeduction": p.loan_deduction,
            "advanceDeduction": p.advance_deduction,
            "otherDeductions": p.other_deductions,
            "gratuity": p.gratuity,
            "pfEmployerContribution": p.pf_employer_contribution,
            "esiEmployerContribution": p.esi_employer_contribution,
            "lwfEmployerContribution": p.lwf_employer_contribution,
            "totalDeductions": p.total_deductions,
            "deductions": p.total_deductions if p.total_deductions is not None else (p.gross_salary - p.net_salary),
            "netSalary": p.net_salary,
            "netPay": p.net_salary,
            "workingDays": p.working_days,
            "presentDays": p.present_days,
            "absentDays": p.absent_days,
            "paidDays": p.paid_days,
            "unpaidDays": p.unpaid_days,
            "leaveDays": p.leave_days,
            "halfDays": getattr(p, "half_days", 0),
            "holidayDays": getattr(p, "holiday_days", 0),
            "weekOffDays": getattr(p, "week_off_days", 0),
            "status": p.status,
            "paymentMethod": p.payment_method,
            "date": p.created_at.isoformat() if p.created_at else None,
            "paymentDate": p.paid_at.isoformat() if hasattr(p, 'paid_at') and p.paid_at else None,
            "updatedAt": p.updated_at.isoformat() if hasattr(p, 'updated_at') and p.updated_at else None,
            "notes": p.notes,
            "createdAt": p.created_at.isoformat() if p.created_at else None,
        })

    # Backward compatible: plain array when client expects legacy shape, plus pagination metadata.
    pagination = {
        "page": page,
        "limit": eff_limit,
        "hasMore": has_more,
        "nextCursor": next_cursor,
        "periodScoped": period_scoped,
    }
    if total_count is not None:
        pagination["total"] = total_count
        pagination["pages"] = (total_count + eff_limit - 1) // eff_limit if eff_limit else 1

    return {"data": result, "pagination": pagination}


@cached(ttl=60)
@router.get("/api/payroll/stats", tags=["Payroll"])
def get_payroll_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
    if current_user.organization_id:
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    _st_scope = resolve_company_scope(db, current_user, None)
    if _st_scope is not None:
        query = query.filter(Payroll.company_id == _st_scope)

    total_gross = db.query(func.coalesce(func.sum(Payroll.gross_salary), 0)).select_from(Payroll).filter(Payroll.deleted_at.is_(None))
    total_net = db.query(func.coalesce(func.sum(Payroll.net_salary), 0)).select_from(Payroll).filter(Payroll.deleted_at.is_(None))
    total_count = db.query(func.count(Payroll.id)).select_from(Payroll).filter(Payroll.deleted_at.is_(None))

    if current_user.organization_id:
        total_gross = total_gross.filter(Payroll.organization_id == current_user.organization_id)
        total_net = total_net.filter(Payroll.organization_id == current_user.organization_id)
        total_count = total_count.filter(Payroll.organization_id == current_user.organization_id)
    if _st_scope is not None:
        total_gross = total_gross.filter(Payroll.company_id == _st_scope)
        total_net = total_net.filter(Payroll.company_id == _st_scope)
        total_count = total_count.filter(Payroll.company_id == _st_scope)

    # Current month scope for the "paid this period" KPI
    now = ist_now_naive()
    cur_q = db.query(Payroll).filter(Payroll.deleted_at.is_(None), Payroll.month == now.month, Payroll.year == now.year)
    if current_user.organization_id:
        cur_q = cur_q.filter(Payroll.organization_id == current_user.organization_id)
    if _st_scope is not None:
        cur_q = cur_q.filter(Payroll.company_id == _st_scope)
    paid_cur = cur_q.filter(Payroll.status.in_(["paid", "processed"])).count()
    pending_cur = cur_q.filter(Payroll.status.in_(["draft", "pending_approval"])).count()
    cur_net = db.query(func.coalesce(func.sum(Payroll.net_salary), 0)).select_from(Payroll).filter(
        Payroll.deleted_at.is_(None), Payroll.month == now.month, Payroll.year == now.year,
        Payroll.status.in_(["paid", "processed"]),
    )
    if current_user.organization_id:
        cur_net = cur_net.filter(Payroll.organization_id == current_user.organization_id)
    if _st_scope is not None:
        cur_net = cur_net.filter(Payroll.company_id == _st_scope)

    total_count_val = total_count.scalar() or 0
    total_net_val = total_net.scalar() or 0

    return {
        "totalGrossSalary": total_gross.scalar() or 0,
        "totalNetSalary": total_net_val,
        "totalPayrolls": total_count_val,
        # Frontend-compatible KPI fields
        "totalPayroll": cur_net.scalar() or 0,
        "employeesPaid": paid_cur,
        "pending": pending_cur,
        "avgSalary": round(total_net_val / total_count_val, 2) if total_count_val else 0,
    }


@router.post("/api/payroll", tags=["Payroll"])
def create_payroll(
    payroll_data: PayrollCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = convert_camel_to_snake(payroll_data.model_dump())
    from core.employee_scope import apply_employee_scope
    payload = apply_employee_scope(db, payload)
    payload.pop("branch_id", None)
    pr = Payroll(**payload)
    pr.status = "draft"
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, payroll_data.employeeId, current_user.organization_id)
    db.add(pr)
    db.commit()
    db.refresh(pr)
    invalidate_cache("hrms:tenant:*")
    return pr


@router.get("/api/payroll/calculate", tags=["Payroll"])
def calculate_payroll_preview(
    employeeId: int,
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employeeId).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role != "superadmin":
        org_owned(emp, current_user.organization_id)
    assert_company_allowed(db, current_user, emp.company_id)
    result = calculate_payroll(db, emp, month, year)
    result["employeeName"] = f"{emp.first_name} {emp.last_name or ''}".strip()
    result["days_in_month"] = result["working_days"]
    return result


@router.post("/api/payroll/recalculate", tags=["Payroll"])
def recalculate_payroll_tds(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recompute cumulative TDS for an employee from the edited gross/PF/PT.

    Used by the Edit Payroll drawer so manual edits to taxable earnings
    (other earnings, incentives, bonus, etc.) keep the TDS correct.
    Body: { employeeId, month, year, totalEarnings, pfDeduction?, professionalTax? }
    """
    employee_id = payload.get("employeeId")
    month = payload.get("month")
    year = payload.get("year")
    if not employee_id or not month or not year:
        raise HTTPException(status_code=400, detail="employeeId, month and year are required")

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == int(employee_id)).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role != "superadmin":
        org_owned(emp, current_user.organization_id)

    def _f(key):
        v = payload.get(key)
        return float(v) if v not in (None, "", 0) else 0.0

    total_earnings = _f("totalEarnings")
    pf = _f("pfDeduction")
    pt = _f("professionalTax")

    pay_policy = _get_payroll_policy(db, emp)
    tax_regime = _get_tax_regime(db, emp)
    rounding = getattr(pay_policy, "rounding_method", "nearest") or "nearest"
    places = getattr(pay_policy, "decimal_places", 2) or 2

    tds_meta = _compute_cumulative_tds(
        db, emp, int(year), int(month), total_earnings, pf, pt, tax_regime, rounding, places,
    )
    return {
        "tds": tds_meta["tds"],
        "incomeTax": tds_meta["income_tax"],
        "surcharge": tds_meta["surcharge"],
        "cess": tds_meta["cess"],
    }


@router.post("/api/payroll/generate", tags=["Payroll"])
def generate_payroll_endpoint(
    employeeId: int,
    month: int,
    year: int,
    email: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculate and persist a payroll record for one employee.

    When email=True and the employee has an email address on file, the
    generated payslip is emailed to them automatically. The email is sent
    in the background so the request never blocks on MX/SMTP lookups.
    """
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employeeId).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role != "superadmin":
        org_owned(emp, current_user.organization_id)
    locked = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.employee_id == employeeId,
        Payroll.month == month,
        Payroll.year == year,
        Payroll.status == "locked",
    ).first()
    if locked:
        raise HTTPException(status_code=409, detail="Payroll period is locked; reopen before regenerating")
    assert_company_allowed(db, current_user, emp.company_id)
    payroll = generate_payroll_record(db, emp, month, year)
    email_sent = False
    email_skipped = ""
    if email:
        if not emp.email:
            email_skipped = "Employee has no email on file"
        else:
            _email_payslip_async(payroll.id, current_user.id)
            email_sent = True
    invalidate_cache("hrms:tenant:*")
    return {
        "message": "Payroll generated",
        "payrollId": payroll.id,
        "netSalary": payroll.net_salary,
        "emailSent": email_sent,
        "emailSkipped": email_skipped,
    }


def _email_payslip_async(payroll_id: int, user_id: int) -> None:
    """Email a payslip PDF on a background thread with its own DB session.

    Runs detached from the request lifecycle so a slow MX/SMTP lookup never
    blocks the generate-payroll HTTP response.
    """
    import threading
    from database import SessionLocal

    def _run():
        s = SessionLocal()
        try:
            payroll = s.query(Payroll).filter(Payroll.id == payroll_id).first()
            if not payroll:
                return
            emp = payroll.employee
            if not emp or not emp.email:
                return
            from services.email_service import EmailService
            from services.payslip_service import generate_payslip_pdf
            pdf_bytes = generate_payslip_pdf(s, payroll.id)
            emp_name = f"{emp.first_name} {emp.last_name or ''}".strip()
            subject = f"Payslip for {emp_name} — {payroll.month}/{payroll.year}"
            html = f"""
            <div style="font-family:'Segoe UI',Arial,sans-serif;color:#333;max-width:560px;margin:0 auto;">
              <h2 style="color:#1a237e;">Your Payslip is Ready</h2>
              <p>Hi {emp_name},</p>
              <p>Your payslip for <b>{payroll.month}/{payroll.year}</b> is attached as a PDF.</p>
              <p>Net pay: <b>{float(payroll.net_salary or 0):,.2f}</b></p>
              <p style="color:#888;font-size:12px;">This is a system-generated email. Do not reply.</p>
            </div>
            """
            sent = EmailService.send_email_with_attachment(
                emp.email,
                subject,
                html,
                text_content=f"Your payslip for {payroll.month}/{payroll.year} is attached. Net pay: {float(payroll.net_salary or 0):,.2f}",
                attachments=[{"filename": f"payslip_{emp.employee_code}_{payroll.month}_{payroll.year}.pdf", "data": pdf_bytes, "mime": "application/pdf"}],
            )
            if sent and user_id:
                user = s.query(User).filter(User.id == user_id).first()
                if user:
                    _create_audit_log(s, user, "email_payslip", "payroll", payroll.id, f"Auto-emailed payslip {payroll.month}/{payroll.year} to {emp.email}")
        except Exception:
            logger.exception("Background payslip email failed")
        finally:
            s.close()

    threading.Thread(target=_run, daemon=True).start()


def _run_payroll_job(run_id: int):
    """Background worker: processes a bulk payroll run and updates progress.

    Runs on a daemon thread with its own DB sessions so it never blocks the
    HTTP request and scales to very large workforces (100k+ employees).
    """
    import threading
    from database import SessionLocal

    try:
        db = SessionLocal()
        run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
        if not run:
            db.close()
            return
        month, year = run.month, run.year
        org_id, company_id, branch_id, email = run.organization_id, run.company_id, run.branch_id, run.email
        department_id = getattr(run, "department_id", None)
        run.status = "running"
        run.started_at = ist_now_naive()
        db.commit()

        query = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.status == "active")
        if org_id:
            query = query.filter(Employee.organization_id == org_id)
        if company_id:
            query = query.filter(Employee.company_id == company_id)
        if department_id:
            query = query.filter(Employee.department_id == department_id)
        if branch_id:
            query = query.filter(Employee.id.in_(
                db.query(EmployeeBranchAssignment.employee_id)
                .filter(EmployeeBranchAssignment.branch_id == branch_id)
                .filter(EmployeeBranchAssignment.status == "active")
                .filter(EmployeeBranchAssignment.deleted_at.is_(None))
            ))
        # Stream ids + names in batches so we never hold 100k rows in memory.
        emp_rows = query.with_entities(Employee.id, Employee.first_name, Employee.last_name,
                                       Employee.user_id, Employee.email).yield_per(500)
        employees = list(emp_rows)
        total = len(employees)
        run.total = total
        db.commit()
        db.close()

        def _gen_one(row):
            emp_id, fname, lname, user_id, emp_email = row
            name = f"{fname} {lname or ''}".strip()
            s = SessionLocal()
            try:
                emp = s.query(Employee).filter(Employee.id == emp_id).first()
                if not emp:
                    return {"employeeId": emp_id, "name": name, "reason": "Employee not found"}
                existing = s.query(Payroll).filter(
                    Payroll.deleted_at.is_(None),
                    Payroll.employee_id == emp_id,
                    Payroll.month == month,
                    Payroll.year == year,
                ).first()
                if existing:
                    if existing.status == "locked":
                        return {"employeeId": emp_id, "name": name, "reason": "Payroll period is locked"}
                    return {"employeeId": emp_id, "name": name, "reason": "Already exists"}
                pr = generate_payroll_record(s, emp, month, year)
                return {"employeeId": emp_id, "name": name, "netSalary": pr.net_salary, "payrollId": pr.id, "email": emp_email}
            except Exception as e:
                logger.exception(f"Failed to generate payroll for employee {emp_id}")
                return {"employeeId": emp_id, "name": name, "reason": str(e)}
            finally:
                s.close()

        # Parallelize generation (I/O bound). Worker count is bounded by the
        # DB pool so we never exhaust connections (pool_size + max_overflow).
        import os as _os
        from concurrent.futures import ThreadPoolExecutor, as_completed
        db_pool = int(_os.getenv("DB_POOL_SIZE", "10")) + int(_os.getenv("DB_MAX_OVERFLOW", "20"))
        workers = min(int(_os.getenv("PAYROLL_WORKERS", "8")), max(1, db_pool - 2), len(employees))
        workers = max(1, workers)

        generated, skipped, emailed = [], [], []
        processed = 0
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(_gen_one, row): row for row in employees}
            for fut in as_completed(futs):
                res = fut.result()
                if "netSalary" in res:
                    generated.append(res)
                    if email and res.get("email"):
                        if _email_payslip_for_row(res["payrollId"], res["email"], month, year):
                            emailed.append(res)
                else:
                    skipped.append(res)
                processed += 1
                # Frequent progress writes for a near-real-time progress bar.
                # Writes are cheap (PK lookup + small update) relative to the
                # per-employee payroll calculation.
                if processed % 5 == 0 or processed == total:
                    upd = SessionLocal()
                    try:
                        u = upd.query(PayrollRun).filter(PayrollRun.id == run_id).first()
                        if u:
                            u.processed = processed
                            u.generated = len(generated)
                            u.skipped = len(skipped)
                            u.emailed = len(emailed)
                            upd.commit()
                    except Exception:
                        upd.rollback()
                    finally:
                        upd.close()

        # Notify + finalize
        notified = 0
        try:
            ndb = SessionLocal()
            for g in generated:
                if not g.get("email"):
                    continue
                from services.notifier import notify_payslip
                row = next((r for r in employees if r[0] == g["employeeId"]), None)
                if row and row[3]:
                    notify_payslip(ndb, row[3], g["name"], month, year, float(g["netSalary"] or 0))
                    notified += 1
            ndb.commit()
            ndb.close()
        except Exception:
            logger.exception("Notification step failed for payroll run")

        fin = SessionLocal()
        try:
            f = fin.query(PayrollRun).filter(PayrollRun.id == run_id).first()
            if f:
                f.status = "completed"
                f.finished_at = ist_now_naive()
                f.processed = processed
                f.generated = len(generated)
                f.skipped = len(skipped)
                f.emailed = len(emailed)
                f.notified = notified
                fin.commit()
        except Exception:
            fin.rollback()
        finally:
            fin.close()
    except Exception as e:
        logger.exception(f"Payroll run {run_id} failed")
        try:
            fdb = SessionLocal()
            f = fdb.query(PayrollRun).filter(PayrollRun.id == run_id).first()
            if f:
                f.status = "failed"
                f.error = str(e)
                f.finished_at = ist_now_naive()
                fdb.commit()
            fdb.close()
        except Exception:
            pass


def _email_payslip_for_row(payroll_id, emp_email, month, year) -> bool:
    """Email a payslip PDF by id. Returns True on success (or queued/logged)."""
    from database import SessionLocal
    s = SessionLocal()
    try:
        payroll = s.query(Payroll).filter(Payroll.id == payroll_id).first()
        if not payroll or not emp_email:
            return False
        from services.email_service import EmailService
        from services.payslip_service import generate_payslip_pdf
        pdf_bytes = generate_payslip_pdf(s, payroll.id)
        emp = payroll.employee
        emp_name = f"{emp.first_name} {emp.last_name or ''}".strip() if emp else "Employee"
        subject = f"Payslip for {emp_name} — {month}/{year}"
        html = f"""
        <div style="font-family:'Segoe UI',Arial,sans-serif;color:#333;max-width:560px;margin:0 auto;">
          <h2 style="color:#1a237e;">Your Payslip is Ready</h2>
          <p>Hi {emp_name},</p>
          <p>Your payslip for <b>{month}/{year}</b> is attached as a PDF.</p>
          <p>Net pay: <b>{float(payroll.net_salary or 0):,.2f}</b></p>
          <p style="color:#888;font-size:12px;">This is a system-generated email. Do not reply.</p>
        </div>
        """
        sent = EmailService.send_email_with_attachment(
            emp_email, subject, html,
            text_content=f"Your payslip for {month}/{year} is attached. Net pay: {float(payroll.net_salary or 0):,.2f}",
            attachments=[{"filename": f"payslip_{emp.employee_code}_{month}_{year}.pdf", "data": pdf_bytes, "mime": "application/pdf"}],
        )
        return bool(sent)
    except Exception:
        logger.exception("Failed to email payslip row")
        return False
    finally:
        s.close()


@router.get("/api/payroll/preflight", tags=["Payroll"])
def payroll_preflight_check(
    month: int,
    year: int,
    companyId: int = Query(...),
    branchId: Optional[int] = Query(None),
    departmentId: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pre-flight validation before running payroll.

    Checks ALL required configuration for a company:
    - PayrollTemplate exists
    - PayrollPolicy configured
    - AttendancePolicy configured
    - StatutorySetting configured
    - TaxRegime + TaxSlabs exist
    - PayrollComponents exist
    - Employees have salary data
    - Attendance data exists for the period

    Returns {valid, errors, warnings, summary}.
    Use this BEFORE clicking "Generate Payroll" to show users what's missing.
    """
    from services.payroll_preflight import run_preflight
    result = run_preflight(db, current_user.organization_id, companyId, month, year, branchId, departmentId)
    return result


@router.post("/api/payroll/generate-all", tags=["Payroll"])
def generate_all_payroll(
    month: int,
    year: int,
    companyId: Optional[int] = None,
    branchId: Optional[int] = None,
    departmentId: Optional[int] = None,
    email: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Queue a bulk payroll generation run in the background and return its id.

    The actual generation runs on a background thread (scales to very large
    workforces). Poll GET /api/payroll/runs/{runId} for progress/status.
    """
    import threading
    from services.settings_service import is_feature_enabled
    multi_company = is_feature_enabled(db, current_user.organization_id, "multiCompany")
    if multi_company and not companyId:
        raise HTTPException(status_code=400, detail="Multi-company payroll is enabled. Select a company to generate payroll for.")
    # Company isolation: generate only within your allowed company.
    companyId = resolve_company_scope(db, current_user, companyId)

    # Pre-flight validation: block payroll if critical config is missing
    from services.payroll_preflight import run_preflight
    preflight = run_preflight(db, current_user.organization_id, companyId, month, year, branchId, departmentId)
    if not preflight["valid"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Payroll cannot be generated — configuration errors found",
                "errors": preflight["errors"],
                "warnings": preflight["warnings"],
                "fix": "Fix the errors below, then try again. Click 'Run Pre-flight Check' for details.",
            }
        )

    run = PayrollRun(
        organization_id=current_user.organization_id,
        company_id=companyId,
        branch_id=branchId,
        department_id=departmentId,
        month=month,
        year=year,
        email=email,
        status="queued",
        requested_by=current_user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    t = threading.Thread(target=_run_payroll_job, args=(run.id,), daemon=True)
    t.start()

    return {
        "message": "Payroll run queued",
        "runId": run.id,
        "status": run.status,
    }


@router.get("/api/payroll/runs/{run_id}", tags=["Payroll"])
def get_payroll_run(run_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return the status/progress of a background payroll run."""
    run = db.query(PayrollRun).filter(PayrollRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if current_user.organization_id and run.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    assert_company_allowed(db, current_user, run.company_id)
    return {
        "runId": run.id,
        "status": run.status,
        "month": run.month,
        "year": run.year,
        "total": run.total,
        "processed": run.processed,
        "generated": run.generated,
        "skipped": run.skipped,
        "emailed": run.emailed,
        "notified": run.notified,
        "approved": run.approved,
        "rerun": run.rerun,
        "error": run.error,
    }


@router.get("/api/payroll/runs", tags=["Payroll"])
def list_payroll_runs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List recent payroll runs for the organization (company-scoped for restricted roles)."""
    q = db.query(PayrollRun)
    if current_user.organization_id:
        q = q.filter(PayrollRun.organization_id == current_user.organization_id)
    _run_scope = resolve_company_scope(db, current_user, None)
    if _run_scope is not None:
        q = q.filter(PayrollRun.company_id == _run_scope)
    q = q.order_by(PayrollRun.id.desc()).limit(50)
    runs = q.all()
    user_ids = set()
    for r in runs:
        for uid in (r.requested_by, r.submitted_by, r.approved_by, r.rerun_by):
            if uid:
                user_ids.add(uid)
    users = {}
    if user_ids:
        users = {u.id: (u.full_name or u.email) for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    return [
        {
            "runId": r.id, "status": r.status, "month": r.month, "year": r.year,
            "total": r.total, "processed": r.processed, "generated": r.generated,
            "skipped": r.skipped, "emailed": r.emailed, "notified": r.notified,
            "approved": r.approved, "rerun": r.rerun,
            "error": r.error, "createdAt": r.created_at, "finishedAt": r.finished_at,
            "requestedBy": users.get(r.requested_by) or "—",
            "submittedBy": users.get(r.submitted_by),
            "submittedAt": r.submitted_at,
            "approvedBy": users.get(r.approved_by),
            "approvedAt": r.approved_at,
            "rerunBy": users.get(r.rerun_by),
            "rerunAt": r.rerun_at,
        }
        for r in runs
    ]


@router.post("/api/payroll/process", tags=["Payroll"])
def process_payroll(
    body: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Process (approve) payroll records for a month/year.

    Status flow: draft -> pending_approval -> approved -> processed -> paid.
    Body: { month, year, companyId?, action: 'approve' | 'process' | 'mark_paid' }
    """
    body = body or {}
    month = body.get("month")
    year = body.get("year")
    action = body.get("action", "process")
    company_id = body.get("companyId")
    payroll_ids = body.get("payrollIds")

    if payroll_ids:
        query = db.query(Payroll).filter(Payroll.deleted_at.is_(None), Payroll.id.in_(payroll_ids))
        if current_user.organization_id:
            query = query.filter(Payroll.organization_id == current_user.organization_id)
    else:
        if not month or not year:
            raise HTTPException(status_code=400, detail="month and year are required (or pass payrollIds)")
        query = db.query(Payroll).filter(
            Payroll.deleted_at.is_(None),
            Payroll.month == month,
            Payroll.year == year,
        )
        if current_user.role != "superadmin":
            query = query.filter(Payroll.organization_id == current_user.organization_id)
        if company_id:
            if current_user.role != "superadmin":
                validate_company_in_org(db, Company, company_id, current_user.organization_id)
            query = query.filter(Payroll.company_id == company_id)
        if body.get("branchId"):
            query = query.filter(Payroll.employee_id.in_(
                db.query(EmployeeBranchAssignment.employee_id)
                .filter(EmployeeBranchAssignment.branch_id == body["branchId"])
                .filter(EmployeeBranchAssignment.status == "active")
                .filter(EmployeeBranchAssignment.deleted_at.is_(None))
            ))

    records = query.all()
    if not records:
        raise HTTPException(status_code=404, detail="No payroll records found for this period")

    now = ist_now_naive()
    transitions = {"approve": "approved", "process": "processed", "mark_paid": "paid"}
    target = transitions.get(action)
    if not target:
        raise HTTPException(status_code=400, detail="action must be one of: approve, process, mark_paid")

    # Strict forward-only workflow:
    #   draft -> pending_approval -> approved -> processed -> paid
    allowed_from = {
        "approve": {"draft", "pending_approval"},
        "process": {"approved"},
        "mark_paid": {"processed"},
    }

    updated = []
    skipped = []
    for pr in records:
        if pr.status == "cancelled" or pr.status not in allowed_from.get(action, set()):
            skipped.append(pr.id)
            continue
        pr.status = target
        pr.processed_by = current_user.id
        pr.processed_at = now
        if target == "paid":
            pr.paid_at = now
        elif target == "approved":
            pr.approved_by = current_user.id
            pr.approved_at = now
        updated.append(pr.id)

    db.commit()

    # Notify employees for paid/processed records
    if target in ("paid", "processed"):
        try:
            from services.notifier import notify_payslip
            for pr in records:
                if pr.id not in updated:
                    continue
                emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == pr.employee_id).first()
                if emp and emp.user_id:
                    notify_payslip(db, emp.user_id, f"{emp.first_name} {emp.last_name}".strip(), pr.month or month or 0, pr.year or year or 0, float(pr.net_salary or 0))
            db.commit()
        except Exception:
            db.rollback()

    msg = f"{len(updated)} payroll record(s) {target}"
    if skipped:
        msg += f"; {len(skipped)} skipped (must follow draft -> pending_approval -> approved -> processed -> paid)"
    return {
        "message": msg,
        "status": target,
        "updated": updated,
        "skipped": skipped,
        "action": action,
    }


@router.post("/api/payroll/process-company", tags=["Payroll"])
def process_company_payroll(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Process all payroll records for a company in a period (approve + process)."""
    month = data.get("month")
    year = data.get("year")
    company_id = data.get("companyId")
    if not month or not year:
        raise HTTPException(status_code=400, detail="month and year are required")

    query = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.month == month,
        Payroll.year == year,
        Payroll.status == "draft",
    )
    if current_user.role != "superadmin":
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    if company_id:
        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, company_id, current_user.organization_id)
        query = query.filter(Payroll.company_id == company_id)
    if data.get("branchId"):
        query = query.filter(Payroll.employee_id.in_(
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(EmployeeBranchAssignment.branch_id == data["branchId"])
            .filter(EmployeeBranchAssignment.status == "active")
            .filter(EmployeeBranchAssignment.deleted_at.is_(None))
        ))

    records = query.all()
    now = ist_now_naive()
    for pr in records:
        # Strict workflow: draft -> pending_approval -> approved (never straight to processed/paid)
        pr.status = "approved"
        pr.approved_by = current_user.id
        pr.approved_at = now
        pr.processed_by = None
        pr.processed_at = None
    db.commit()

    return {
        "message": f"Company payroll processed — {len(records)} record(s) approved",
        "status": "approved",
        "count": len(records),
    }


@router.post("/api/payroll/reset", tags=["Payroll"])
def reset_payroll_period(
    body: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Wipe out every payroll record for a month/year so it can be regenerated fresh.

    Recovery from a mistaken run: soft-deletes all payroll records (any status)
    for the period and clears the period finalization lock, leaving the period
    clean so Generate All produces brand-new payslips.
    Body: { month, year, companyId?, branchId? }
    """
    body = body or {}
    month = body.get("month")
    year = body.get("year")
    company_id = body.get("companyId")
    branch_id = body.get("branchId")
    department_id = body.get("departmentId")
    if not month or not year:
        raise HTTPException(status_code=400, detail="month and year are required")

    query = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.month == month,
        Payroll.year == year,
    )
    if current_user.role != "superadmin":
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    if company_id:
        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, company_id, current_user.organization_id)
        query = query.filter(Payroll.company_id == company_id)
    if department_id:
        query = query.filter(Payroll.department_id == department_id)
    if branch_id:
        query = query.filter(Payroll.employee_id.in_(
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(EmployeeBranchAssignment.branch_id == branch_id)
            .filter(EmployeeBranchAssignment.status == "active")
            .filter(EmployeeBranchAssignment.deleted_at.is_(None))
        ))

    records = query.all()
    if not records:
        raise HTTPException(status_code=404, detail="No payroll records found for this period")

    now = ist_now_naive()
    count = len(records)
    # Hard-delete the selected period's payroll so the database stays clean.
    for pr in records:
        db.delete(pr)
    db.commit()

    # Clear the period finalization lock for the same scope so regeneration is allowed.
    lock_query = db.query(PayrollPeriodLock).filter(
        PayrollPeriodLock.month == month,
        PayrollPeriodLock.year == year,
    )
    if current_user.role != "superadmin":
        lock_query = lock_query.filter(PayrollPeriodLock.organization_id == current_user.organization_id)
    if company_id:
        lock_query = lock_query.filter(PayrollPeriodLock.company_id == company_id)
    for lock in lock_query.all():
        lock.status = "reopened"
        lock.reopened_by = current_user.id
        lock.reopened_at = now
    db.commit()

    _create_audit_log(
        db, current_user, "reset_payroll", "payroll", None,
        f"Wiped {count} payroll record(s) for {month}/{year} to regenerate fresh payslips",
    )

    # Record who re-ran this period on the matching payroll run for Run History.
    _record_run_action(db, current_user.organization_id, month, year, "rerun", current_user, 1)
    db.commit()

    return {
        "message": f"Wiped {count} payroll record(s) for {month}/{year}. You can now generate fresh payslips.",
        "deleted": count,
    }


@router.post("/api/payroll/void", tags=["Payroll"])
def void_payroll_period(
    body: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Void/nullify payroll records for a month/year without regenerating.

    Permanently deletes all payroll records for the period and clears the
    period finalization lock. Does NOT regenerate — use /reset for that.
    Body: { month, year, companyId?, branchId?, departmentId? }
    """
    body = body or {}
    month = body.get("month")
    year = body.get("year")
    company_id = body.get("companyId")
    branch_id = body.get("branchId")
    department_id = body.get("departmentId")
    if not month or not year:
        raise HTTPException(status_code=400, detail="month and year are required")

    query = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.month == month,
        Payroll.year == year,
    )
    if current_user.role != "superadmin":
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    if company_id:
        query = query.filter(Payroll.company_id == company_id)
    if department_id:
        query = query.filter(Payroll.department_id == department_id)
    if branch_id:
        query = query.filter(Payroll.employee_id.in_(
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(EmployeeBranchAssignment.branch_id == branch_id)
            .filter(EmployeeBranchAssignment.status == "active")
            .filter(EmployeeBranchAssignment.deleted_at.is_(None))
        ))

    records = query.all()
    if not records:
        raise HTTPException(status_code=404, detail="No payroll records found for this period")

    now = ist_now_naive()
    count = len(records)
    for pr in records:
        db.delete(pr)
    db.commit()

    # Clear the period finalization lock
    lock_query = db.query(PayrollPeriodLock).filter(
        PayrollPeriodLock.month == month,
        PayrollPeriodLock.year == year,
    )
    if current_user.role != "superadmin":
        lock_query = lock_query.filter(PayrollPeriodLock.organization_id == current_user.organization_id)
    if company_id:
        lock_query = lock_query.filter(PayrollPeriodLock.company_id == company_id)
    for lock in lock_query.all():
        lock.status = "reopened"
        lock.reopened_by = current_user.id
        lock.reopened_at = now
    db.commit()

    _create_audit_log(
        db, current_user, "void_payroll", "payroll", None,
        f"Voided {count} payroll record(s) for {month}/{year}",
    )

    _record_run_action(db, current_user.organization_id, month, year, "void", current_user, count)
    db.commit()

    return {
        "message": f"Voided {count} payroll record(s) for {month}/{year}.",
        "deleted": count,
    }


def _record_run_action(db: Session, org_id: Optional[int], month: int, year: int, action: str, user: User, count: int = 1) -> None:
    """Record who performed a lifecycle action on the latest payroll run for a period.

    action: 'submit' | 'approve' | 'rerun'
    """
    run = db.query(PayrollRun).filter(
        PayrollRun.organization_id == org_id,
        PayrollRun.month == month,
        PayrollRun.year == year,
    ).order_by(PayrollRun.id.desc()).first()
    if not run:
        return
    now = ist_now_naive()
    if action == "submit":
        run.submitted_by = user.id
        run.submitted_at = now
    elif action == "approve":
        run.approved_by = user.id
        run.approved_at = now
        run.approved = (run.approved or 0) + count
    elif action == "rerun":
        run.rerun_by = user.id
        run.rerun_at = now
        run.rerun = (run.rerun or 0) + count


@router.post("/api/payroll/bulk-status", tags=["Payroll"])
def bulk_update_payroll_status(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batch transition payroll statuses (approve / process / mark paid / cancel)."""
    payroll_ids = payload.get("payrollIds") or []
    action = payload.get("action")
    if not payroll_ids:
        raise HTTPException(status_code=400, detail="payrollIds is required")
    if action not in ("approve", "process", "mark_paid", "cancel", "pending_approval", "advance", "reverse_paid", "lock", "reopen"):
        raise HTTPException(status_code=400, detail="Invalid action")

    records = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.id.in_(payroll_ids),
    )
    if current_user.organization_id:
        records = records.filter(Payroll.organization_id == current_user.organization_id)
    records = records.all()
    now = ist_now_naive()

    # Strict forward-only workflow
    allowed_from = {
        "pending_approval": {"draft"},
        "approve": {"draft", "pending_approval"},
        "process": {"approved"},
        "mark_paid": {"processed"},
        "cancel": {"draft", "pending_approval", "approved", "processed"},
        "reverse_paid": {"paid"},
        "lock": {"paid"},
        "reopen": {"locked"},
    }
    advance_map = {
        "draft": "pending_approval",
        "pending_approval": "approved",
        "approved": "processed",
        "processed": "paid",
    }

    updated = []
    skipped = []
    target = None
    for pr in records:
        if action == "advance":
            if pr.status == "cancelled" or pr.status not in advance_map:
                skipped.append(pr.id)
                continue
            target = advance_map[pr.status]
        else:
            if pr.status == "cancelled" or pr.status not in allowed_from.get(action, set()):
                skipped.append(pr.id)
                continue
            target = {"approve": "approved", "process": "processed", "mark_paid": "paid",
                      "cancel": "cancelled", "pending_approval": "pending_approval",
                      "reverse_paid": "cancelled", "lock": "locked", "reopen": "paid"}[action]
        pr.status = target
        pr.processed_by = current_user.id
        pr.processed_at = now
        if target == "paid":
            pr.paid_at = now
            if action == "reopen":
                if pr.locked_by and pr.locked_by == current_user.id:
                    skipped.append(pr.id)
                    continue
                pr.reopened_by = current_user.id
                pr.reopened_at = now
                pr.remarks = f"{pr.remarks}\n[reopened {now.isoformat()} by user {current_user.id}]" if pr.remarks else f"[reopened {now.isoformat()} by user {current_user.id}]"
        elif target == "locked":
            pr.locked_by = current_user.id
            pr.locked_at = now
        elif target == "approved":
            pr.approved_by = current_user.id
            pr.approved_at = now
        elif action == "reverse_paid":
            # A reversed payment is un-done: restore loan installments that were
            # consumed for this period so the employee isn't double-charged next run.
            pr.paid_at = None
            try:
                _restore_loan_for_reversal(db, pr, current_user)
            except Exception:
                db.rollback()
        _create_audit_log(db, current_user, action, "payroll", str(pr.id),
                          f"Payroll {pr.month}/{pr.year} (emp {pr.employee_id}) {pr.status if action != 'advance' else 'advanced to ' + str(target)}")
        if action == "mark_paid":
            try:
                post_payroll_journal(db, pr, current_user)
            except Exception as e:
                logger.exception("Failed to post payroll journal for payroll %s", pr.id)
                raise HTTPException(status_code=500, detail=f"Payroll marked paid but journal posting failed: {e}")
        updated.append(pr.id)

    db.commit()

    # Notify on paid/processed
    if target in ("paid", "processed"):
        try:
            from services.notifier import notify_payslip
            for pr in records:
                if pr.id not in updated:
                    continue
                emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == pr.employee_id).first()
                if emp and emp.user_id:
                    notify_payslip(db, emp.user_id, f"{emp.first_name} {emp.last_name}".strip(), pr.month, pr.year, float(pr.net_salary or 0))
            db.commit()
        except Exception:
            db.rollback()

    # Record submit/approve actions (who did it) on the matching payroll run for Run History.
    if updated:
        sample = next((r for r in records if r.id in updated), None)
        if sample:
            if action == "pending_approval":
                _record_run_action(db, current_user.organization_id, sample.month, sample.year, "submit", current_user)
            elif action == "approve":
                _record_run_action(db, current_user.organization_id, sample.month, sample.year, "approve", current_user, len(updated))
            db.commit()

    msg = f"{len(updated)} record(s) {target or 'updated'}"
    if skipped:
        msg += f"; {len(skipped)} skipped (must follow draft -> pending_approval -> approved -> processed -> paid)"
    return {"message": msg, "status": target, "count": len(updated), "skipped": skipped}


def _restore_loan_for_reversal(db: Session, pr: Payroll, current_user: User) -> None:
    """When a paid payroll is reversed, restore the loan installments it consumed."""
    try:
        from models import SalaryLoan
        period = pr.year * 12 + pr.month - 1
        loans = db.query(SalaryLoan).filter(SalaryLoan.employee_id == pr.employee_id).all()
        for loan in loans:
            start = loan.start_year * 12 + (loan.start_month or 1) - 1
            if start > period:
                continue
            if loan.remaining_months < int(loan.total_months or 0):
                loan.remaining_months = min(int(loan.total_months or 0), int(loan.remaining_months or 0) + 1)
            if loan.status == "closed":
                loan.status = "active"
    except Exception:
        db.rollback()


def _assert_can_view_payroll(db: Session, payroll_id: int, current_user: User) -> Payroll:
    """Ensure the caller may view the payroll: admins/HR see all; employees see their own only."""
    payroll = db.query(Payroll).filter(Payroll.deleted_at.is_(None), Payroll.id == payroll_id).first()
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll not found")
    if current_user.organization_id and payroll.organization_id and payroll.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this payroll")
    role = (current_user.role or "").lower()
    if role in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive", "finance", "accountant"):
        _pe = db.query(Employee).filter(Employee.id == payroll.employee_id).first()
        if _pe is not None:
            assert_company_allowed(db, current_user, _pe.company_id)
        return payroll
    emp = db.query(Employee).filter(Employee.id == payroll.employee_id).first()
    if emp and emp.user_id and emp.user_id == current_user.id:
        return payroll
    raise HTTPException(status_code=403, detail="Not authorized to view this payslip")


@router.get("/api/payroll/employee/{employee_id}", tags=["Payroll"])
def get_payroll_by_employee(
    employee_id: int,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Non-admin users may only query their own payroll history.
    role = (current_user.role or "").lower()
    if role not in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive", "finance", "accountant"):
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp or emp.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this employee's payroll")
    else:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if emp is not None:
            assert_company_allowed(db, current_user, emp.company_id)
    query = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.employee_id == employee_id,
    )
    if current_user.organization_id:
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    if month:
        query = query.filter(Payroll.month == month)
    if year:
        query = query.filter(Payroll.year == year)
    return query.order_by(Payroll.year.desc(), Payroll.month.desc()).all()


@router.put("/api/payroll/{payroll_id}/status", tags=["Payroll"])
def update_payroll_status(
    payroll_id: int,
    payload: PayrollStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = db.query(Payroll).filter(Payroll.deleted_at.is_(None), Payroll.id == payroll_id)
    if current_user.organization_id:
        pr = pr.filter(Payroll.organization_id == current_user.organization_id)
    pr = pr.first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    _pr_emp = db.query(Employee).filter(Employee.id == pr.employee_id).first()
    if _pr_emp is not None:
        assert_company_allowed(db, current_user, _pr_emp.company_id)
    # Strict forward-only workflow; "locked" is the closed-period terminal state.
    # Reopening a locked payroll requires a DIFFERENT user than the one who locked
    # it (maker-checker), so a lock cannot be silently lifted by the same person.
    allowed_from = {
        "draft": {"draft"},
        "pending_approval": {"draft"},
        "approved": {"draft", "pending_approval"},
        "processed": {"approved"},
        "paid": {"processed", "locked"},
        "locked": {"paid"},
        "reopened": {"locked"},
        "cancelled": {"draft", "pending_approval", "approved", "processed", "paid"},
    }
    if pr.status == "cancelled" or payload.status not in allowed_from or pr.status not in allowed_from[payload.status]:
        raise HTTPException(status_code=409, detail=f"Cannot move '{pr.status}' -> '{payload.status}'. Must follow draft -> pending_approval -> approved -> processed -> paid (then lock).")
    was_paid = pr.status == "paid"
    pr.status = payload.status
    if payload.status in ("paid", "processed"):
        pr.processed_by = current_user.id
        pr.processed_at = ist_now_naive()
    if payload.status == "paid":
        pr.paid_at = pr.paid_at or ist_now_naive()
        pr.payment_method = pr.payment_method or "bank_transfer"
        try:
            post_payroll_journal(db, pr, current_user)
        except Exception as e:
            logger.exception("Failed to post payroll journal for payroll %s", pr.id)
            raise HTTPException(status_code=500, detail=f"Payroll marked paid but journal posting failed: {e}")
    if payload.status == "approved":
        pr.approved_by = current_user.id
        pr.approved_at = ist_now_naive()
    if payload.status == "locked":
        pr.locked_by = current_user.id
        pr.locked_at = ist_now_naive()
    if payload.status == "reopened":
        if pr.locked_by and pr.locked_by == current_user.id:
            raise HTTPException(status_code=403, detail="Maker-checker: the user who locked this payroll cannot reopen it. A different user must approve the reopen.")
        pr.reopened_by = current_user.id
        pr.reopened_at = ist_now_naive()
        pr.status = "paid"
        pr.remarks = f"{pr.remarks}\n[reopened {ist_now_naive().isoformat()} by user {current_user.id}]" if pr.remarks else f"[reopened {ist_now_naive().isoformat()} by user {current_user.id}]"
    if payload.status == "cancelled" and was_paid:
        pr.paid_at = None
        _restore_loan_for_reversal(db, pr, current_user)
    _create_audit_log(db, current_user, "status_changed", "payroll", str(pr.id),
                      f"Payroll {pr.month}/{pr.year} moved to {payload.status}")
    db.commit()
    db.refresh(pr)
    return pr


@router.put("/api/payroll/{payroll_id}", tags=["Payroll"])
def update_payroll_record(
    payroll_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a payroll record's amounts while it is still a draft / pending approval."""
    pr = db.query(Payroll).filter(Payroll.deleted_at.is_(None), Payroll.id == payroll_id)
    if current_user.organization_id:
        pr = pr.filter(Payroll.organization_id == current_user.organization_id)
    pr = pr.first()
    if not pr:
        raise HTTPException(status_code=404, detail="Payroll not found")
    if pr.status not in ("draft", "pending_approval"):
        raise HTTPException(status_code=409, detail="Only draft or pending-approval payrolls can be edited")

    # Server-side recalculation keeps the record internally consistent:
    # net = total_earnings - total_deductions (after applying the edits).
    allowed = {
        "basic_salary", "hra", "da", "conveyance", "medical", "special_allowance", "gross_salary",
        "overtime_pay", "bonus", "commission", "incentive", "other_earnings", "total_earnings",
        "pf_deduction", "esi_deduction", "professional_tax", "lwf_deduction", "gratuity",
        "tds_deduction", "income_tax", "surcharge", "cess",
        "loan_deduction", "advance_deduction", "other_deductions", "total_deductions",
        "net_salary",
        "working_days", "present_days", "absent_days", "paid_days", "unpaid_days", "leave_days",
        "payment_method", "notes", "remarks",
    }
    updates = {k: v for k, v in (payload or {}).items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No editable fields provided")

    for k, v in updates.items():
        setattr(pr, k, v)
    pr.updated_at = ist_now_naive()
    db.commit()
    db.refresh(pr)
    return pr


@cached(ttl=60)
@router.get("/api/payroll/summary", tags=["Payroll"])
def get_payroll_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    currency: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
    if month:
        query = query.filter(Payroll.month == month)
    if year:
        query = query.filter(Payroll.year == year)
    if current_user.organization_id:
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    _sum_scope = resolve_company_scope(db, current_user, None)
    if _sum_scope is not None:
        query = query.filter(Payroll.company_id == _sum_scope)

    records = query.all()
    total_gross = sum(r.gross_salary or 0 for r in records)
    total_net = sum(r.net_salary or 0 for r in records)
    total_deductions = sum(r.total_deductions or 0 for r in records)

    # Multi-currency reporting: rates configured in org.settings.payroll.currency_rates,
    # keyed by target currency (value of 1 base unit in that currency). Force-reload marker.
    base_currency = ""
    rates: dict = {}
    try:
        org = db.query(Organization).filter(
            Organization.deleted_at.is_(None),
            Organization.id == current_user.organization_id,
        ).first() if current_user.organization_id else None
        if org:
            base_currency = (org.default_currency or "")
            rates = ((org.settings or {}).get("payroll", {}) or {}).get("currency_rates", {}) or {}
    except Exception:
        pass

    def convert(amount: float) -> float:
        if not currency or not rates:
            return round(amount, 2)
        rate = float(rates.get(currency) or 0)
        if rate <= 0:
            return round(amount, 2)
        return round(amount * rate, 2)

    result = {
        "totalEmployees": len(records),
        "totalGrossSalary": round(total_gross, 2),
        "totalNetSalary": round(total_net, 2),
        "totalDeductions": round(total_deductions, 2),
        "month": month,
        "year": year,
        "currency": currency or base_currency,
        "baseCurrency": base_currency,
        "fxRate": (float(rates.get(currency) or 0) if currency and rates else 1.0),
    }
    if currency:
        result["totalGrossSalary"] = convert(total_gross)
        result["totalNetSalary"] = convert(total_net)
        result["totalDeductions"] = convert(total_deductions)
    return result


@router.get("/api/payroll/{payroll_id}/payslip", tags=["Payroll"])
def get_payslip_json(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.payslip_service import get_payslip_data
    _assert_can_view_payroll(db, payroll_id, current_user)
    return get_payslip_data(db, payroll_id)


@router.get("/api/payroll/{payroll_id}/pdf", tags=["Payroll"])
def download_payslip_pdf(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.payslip_service import generate_payslip_pdf

    payroll = _assert_can_view_payroll(db, payroll_id, current_user)
    pdf_bytes = generate_payslip_pdf(db, payroll_id)

    emp_code = payroll.employee.employee_code if payroll.employee else payroll_id
    filename = f"payslip_{emp_code}_{payroll.month}_{payroll.year}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _email_payslip(db: Session, payroll, current_user: User) -> bool:
    """Email a payslip PDF to its employee. Returns True when sent."""
    emp = payroll.employee
    if not emp or not emp.email:
        return False
    from services.email_service import EmailService
    from services.payslip_service import generate_payslip_pdf
    pdf_bytes = generate_payslip_pdf(db, payroll.id)
    emp_name = f"{emp.first_name} {emp.last_name or ''}".strip()
    subject = f"Payslip for {emp_name} — {payroll.month}/{payroll.year}"
    html = f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#333;max-width:560px;margin:0 auto;">
      <h2 style="color:#1a237e;">Your Payslip is Ready</h2>
      <p>Hi {emp_name},</p>
      <p>Your payslip for <b>{payroll.month}/{payroll.year}</b> is attached as a PDF.</p>
      <p>Net pay: <b>{float(payroll.net_salary or 0):,.2f}</b></p>
      <p style="color:#888;font-size:12px;">This is a system-generated email. Do not reply.</p>
    </div>
    """
    sent = EmailService.send_email_with_attachment(
        emp.email,
        subject,
        html,
        text_content=f"Your payslip for {payroll.month}/{payroll.year} is attached. Net pay: {float(payroll.net_salary or 0):,.2f}",
        attachments=[{"filename": f"payslip_{emp.employee_code}_{payroll.month}_{payroll.year}.pdf", "data": pdf_bytes, "mime": "application/pdf"}],
    )
    if sent:
        _create_audit_log(db, current_user, "email_payslip", "payroll", payroll.id, f"Auto-emailed payslip {payroll.month}/{payroll.year} to {emp.email}")
    return sent


@router.post("/api/payroll/{payroll_id}/email", tags=["Payroll"])
def email_payslip(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Email the payslip PDF to the employee. Admins/HR may email any payslip;
    employees may email their own."""
    payroll = _assert_can_view_payroll(db, payroll_id, current_user)
    emp = payroll.employee
    if not emp or not emp.email:
        raise HTTPException(status_code=400, detail="Employee has no email address on file")

    from services.email_service import EmailService
    from services.payslip_service import generate_payslip_pdf

    pdf_bytes = generate_payslip_pdf(db, payroll_id)
    emp_name = f"{emp.first_name} {emp.last_name or ''}".strip()
    subject = f"Payslip for {emp_name} — {payroll.month}/{payroll.year}"
    html = f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;color:#333;max-width:560px;margin:0 auto;">
      <h2 style="color:#1a237e;">Your Payslip is Ready</h2>
      <p>Hi {emp_name},</p>
      <p>Your payslip for <b>{payroll.month}/{payroll.year}</b> is attached as a PDF.</p>
      <p>Net pay: <b>{float(payroll.net_salary or 0):,.2f}</b></p>
      <p style="color:#888;font-size:12px;">This is a system-generated email. Do not reply.</p>
    </div>
    """
    sent = EmailService.send_email_with_attachment(
        emp.email,
        subject,
        html,
        text_content=f"Your payslip for {payroll.month}/{payroll.year} is attached. Net pay: {float(payroll.net_salary or 0):,.2f}",
        attachments=[{"filename": f"payslip_{emp.employee_code}_{payroll.month}_{payroll.year}.pdf", "data": pdf_bytes, "mime": "application/pdf"}],
    )
    _create_audit_log(db, current_user, "email_payslip", "payroll", payroll_id, f"Emailed payslip {payroll.month}/{payroll.year} to {emp.email}")
    return {"message": "Payslip emailed" if sent else "Payslip queued/logged (email delivery may require SMTP config)", "sent": sent}


@router.post("/api/payroll/bulk-email", tags=["Payroll"])
def bulk_email_payslips(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Email payslips for many payroll records at once (bulk payslip delivery)."""
    role = (current_user.role or "").lower()
    if role not in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive", "finance", "accountant"):
        raise HTTPException(status_code=403, detail="Only HR/finance roles may bulk-email payslips")

    payroll_ids = payload.get("payrollIds") or payload.get("ids") or []
    if not payroll_ids:
        raise HTTPException(status_code=400, detail="payrollIds is required")
    if len(payroll_ids) > 500:
        raise HTTPException(status_code=400, detail="Max 500 payslips per bulk email request")

    from services.email_service import EmailService
    from services.payslip_service import generate_payslip_pdf

    emailed, skipped, errors = [], [], []
    for raw_pid in payroll_ids:
        try:
            pid = int(raw_pid)
        except (TypeError, ValueError):
            errors.append({"payrollId": raw_pid, "reason": "invalid id"})
            continue
        try:
            payroll = _assert_can_view_payroll(db, pid, current_user)
        except HTTPException:
            skipped.append({"payrollId": pid, "reason": "not found or not authorized"})
            continue
        emp = payroll.employee
        if not emp or not emp.email:
            skipped.append({"payrollId": pid, "employeeCode": emp.employee_code if emp else None, "reason": "no email on file"})
            continue
        try:
            pdf_bytes = generate_payslip_pdf(db, pid)
            emp_name = f"{emp.first_name} {emp.last_name or ''}".strip()
            subject = f"Payslip for {emp_name} — {payroll.month}/{payroll.year}"
            html = f"""
            <div style="font-family:'Segoe UI',Arial,sans-serif;color:#333;max-width:560px;margin:0 auto;">
              <h2 style="color:#1a237e;">Your Payslip is Ready</h2>
              <p>Hi {emp_name},</p>
              <p>Your payslip for <b>{payroll.month}/{payroll.year}</b> is attached as a PDF.</p>
              <p>Net pay: <b>{float(payroll.net_salary or 0):,.2f}</b></p>
              <p style="color:#888;font-size:12px;">This is a system-generated email. Do not reply.</p>
            </div>
            """
            sent = EmailService.send_email_with_attachment(
                emp.email,
                subject,
                html,
                text_content=f"Your payslip for {payroll.month}/{payroll.year} is attached. Net pay: {float(payroll.net_salary or 0):,.2f}",
                attachments=[{"filename": f"payslip_{emp.employee_code}_{payroll.month}_{payroll.year}.pdf", "data": pdf_bytes, "mime": "application/pdf"}],
            )
            emailed.append({"payrollId": pid, "employeeCode": emp.employee_code, "email": emp.email, "sent": sent})
        except Exception as exc:
            errors.append({"payrollId": pid, "reason": str(exc)[:200]})

    _create_audit_log(
        db, current_user, "bulk_email_payslips", "payroll", 0,
        f"Bulk-emailed {len(emailed)} payslip(s), {len(skipped)} skipped, {len(errors)} error(s)",
    )
    return {
        "message": f"Emailed {len(emailed)} payslip(s), {len(skipped)} skipped, {len(errors)} failed",
        "emailed": emailed,
        "skipped": skipped,
        "errors": errors,
        "total": len(payroll_ids),
    }


@router.get("/api/payroll/form16/bulk", tags=["Payroll"])
def bulk_download_form16_pdfs(
    financial_year: Optional[str] = Query(default=None, description="Format YYYY-YY, e.g. 2025-26"),
    companyId: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export Form 16 (Part B) PDFs for every eligible employee in a financial year as a ZIP.

    Only employees for whom Form 16B is legally applicable (TDS was deducted in the FY AND
    the employer has a registered TAN/PAN) are included. Employees who are not eligible are
    listed in the manifest with the reason (no TDS deducted / employer TAN-PAN missing).
    Part A must always be issued from TRACES after filing Form 24Q.
    """
    role = (current_user.role or "").lower()
    if role not in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive", "finance", "accountant"):
        raise HTTPException(status_code=403, detail="Only HR/finance roles may export Form 16 in bulk")

    from services.form16_service import generate_form16_pdf, get_form16_data

    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.organization_id:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(Employee.company_id == companyId)
    employees = query.order_by(Employee.employee_code.asc()).all()

    import zipfile
    buf = io.BytesIO()
    manifest_rows = []
    included = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for emp in employees:
            try:
                data = get_form16_data(db, emp.id, financial_year)
                fy = data["financial_year"]
                elig = data["eligibility"]
                if not elig["eligible"]:
                    manifest_rows.append({
                        "employee_code": emp.employee_code or "",
                        "employee_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
                        "status": "skipped",
                        "reason": "No TDS deducted in FY - Form 16 not applicable (Salary/Service Certificate applies)",
                    })
                    continue
                if not elig["has_tan_pan"]:
                    manifest_rows.append({
                        "employee_code": emp.employee_code or "",
                        "employee_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
                        "status": "skipped",
                        "reason": "Employer has no registered TAN/PAN - Part A must be issued from TRACES",
                    })
                    continue
                pdf_bytes = generate_form16_pdf(db, emp.id, financial_year)
                fname = f"form16_{emp.employee_code or emp.id}_{fy}.pdf"
                zf.writestr(fname, pdf_bytes)
                manifest_rows.append({
                    "employee_code": emp.employee_code or "",
                    "employee_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
                    "status": "included",
                    "reason": "Form 16 (Part B) - Part A from TRACES",
                })
                included += 1
            except Exception as exc:
                manifest_rows.append({
                    "employee_code": emp.employee_code or "",
                    "employee_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
                    "status": "error",
                    "reason": str(exc)[:200],
                })
        # Manifest CSV
        import csv as _csv
        ms = io.StringIO()
        writer = _csv.DictWriter(ms, fieldnames=["employee_code", "employee_name", "status", "reason"])
        writer.writeheader()
        writer.writerows(manifest_rows)
        zf.writestr("manifest.csv", ms.getvalue())
        zf.writestr("README.txt", (
            "Form 16 (Part B) - employer's computation of income & TDS.\n"
            "Part A (TDS certificate with the TRACES certificate number) must be\n"
            "downloaded from traces.gov.in after the employer files Form 24Q using\n"
            "a registered TAN. These PDFs are the employer's Part B computation only.\n"
        ))

    _create_audit_log(
        db, current_user, "bulk_export_form16", "payroll", 0,
        f"Exported Form 16 (Part B) for {included} employee(s) FY {financial_year or 'default'}",
    )
    buf.seek(0)
    fy_label = financial_year or "FY"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="form16_bulk_{fy_label}.zip"',
            "X-Included-Count": str(included),
        },
    )


@router.get("/api/payroll/form16/{employee_id}", tags=["Payroll"])
def download_form16_pdf(
    employee_id: int,
    financial_year: Optional[str] = Query(default=None, description="Format YYYY-YY, e.g. 2025-26"),
    email: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Issue the annual TDS document for an employee for a financial year (Apr–Mar).

    Legal guardrails under Section 203 / Rule 31:
      * If no TDS was deducted in the FY, Form 16 is NOT applicable — a
        Salary/Service Certificate is returned instead.
      * If TDS was deducted but the employer has no registered TAN/PAN on file,
        the request is refused with guidance (Part A must come from TRACES).
    """
    from services.form16_service import (
        generate_form16_pdf,
        generate_salary_certificate_pdf,
        get_form16_data,
    )

    # Authorization: HR/admin may access any employee; employees only their own.
    role = (current_user.role or "").lower()
    if role not in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive", "finance", "accountant"):
        emp_self = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp_self or emp_self.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this employee's tax documents")
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.organization_id and emp.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this employee")

    data = get_form16_data(db, employee_id, financial_year)
    eligibility = data["eligibility"]

    # Case 1: no TDS deducted in the FY -> Form 16 not applicable; issue salary certificate.
    if not eligibility["eligible"]:
        pdf_bytes = generate_salary_certificate_pdf(db, employee_id, financial_year)
        if email:
            if not emp.email:
                raise HTTPException(status_code=400, detail="Employee has no email address on file")
            from services.email_service import EmailService
            emp_name = f"{emp.first_name} {emp.last_name or ''}".strip()
            sent = EmailService.send_email_with_attachment(
                emp.email,
                f"Salary/Service Certificate — FY {data['financial_year']} for {emp_name}",
                f"<div style='font-family:Segoe UI,Arial,sans-serif;color:#333'><h2 style='color:#1a237e'>Salary/Service Certificate</h2><p>Hi {emp_name},</p><p>No TDS was deducted from your salary in FY <b>{data['financial_year']}</b>, so a Form 16 is not applicable. Your Salary/Service Certificate is attached.</p></div>",
                text_content=f"Your Salary/Service Certificate for FY {data['financial_year']} is attached (no TDS was deducted).",
                attachments=[{"filename": f"salary_certificate_{emp.employee_code}_{data['financial_year']}.pdf", "data": pdf_bytes, "mime": "application/pdf"}],
            )
            _create_audit_log(db, current_user, "email_salary_certificate", "employee", employee_id, f"Emailed salary certificate FY {data['financial_year']}")
            return {"message": "Salary/Service Certificate emailed", "sent": sent}
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="salary_certificate_{emp.employee_code}_{data["financial_year"]}.pdf"',
                "X-Document-Type": "salary-certificate",
            },
        )

    # Case 2: TDS was deducted but the employer lacks a registered TAN/PAN.
    if not eligibility["has_tan_pan"]:
        raise HTTPException(
            status_code=400,
            detail=(
                "TDS was deducted in this financial year, but the employer has no "
                "registered TAN/PAN on file (Organization settings). Under Rule 31, Part A "
                "of Form 16 must carry the deductor's registered TAN/PAN and a TRACES-issued "
                "certificate number. Update the organization's TAN/PAN, then issue Part A "
                "from TRACES (traces.gov.in) after filing Form 24Q."
            ),
        )

    # Case 3: eligible -> Form 16 (employer's Part B computation; Part A from TRACES).
    pdf_bytes = generate_form16_pdf(db, employee_id, financial_year)
    if email:
        if not emp.email:
            raise HTTPException(status_code=400, detail="Employee has no email address on file")
        from services.email_service import EmailService
        emp_name = f"{emp.first_name} {emp.last_name or ''}".strip()
        sent = EmailService.send_email_with_attachment(
            emp.email,
            f"Form 16 — FY {data['financial_year']} for {emp_name}",
            f"<div style='font-family:Segoe UI,Arial,sans-serif;color:#333'><h2 style='color:#1a237e'>Form 16 / TDS Certificate</h2><p>Hi {emp_name},</p><p>Your Form 16 (Part B) for FY <b>{data['financial_year']}</b> is attached. Total tax deducted: <b>{data['totals']['tds']:,.2f}</b>. Part A must be downloaded from TRACES by your employer.</p></div>",
            text_content=f"Your Form 16 (Part B) for FY {data['financial_year']} is attached. Total TDS deducted: {data['totals']['tds']:,.2f}. Part A must be obtained from TRACES.",
            attachments=[{"filename": f"form16_{emp.employee_code}_{data['financial_year']}.pdf", "data": pdf_bytes, "mime": "application/pdf"}],
        )
        _create_audit_log(db, current_user, "email_form16", "employee", employee_id, f"Emailed Form 16 FY {data['financial_year']}")
        return {"message": "Form 16 emailed" if sent else "Form 16 queued/logged (email delivery may require SMTP config)", "sent": sent}

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="form16_{emp.employee_code}_{data["financial_year"]}.pdf"',
            "X-Document-Type": "form16",
        },
    )


@router.get("/api/payroll/template", tags=["Payroll"])
def download_payroll_template(current_user: User = Depends(get_current_user)):
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "employeeId", "month", "year", "basicSalary", "hra", "da", "conveyance", "medical",
        "specialAllowance", "overtimePay", "bonus", "pfDeduction", "esiDeduction",
        "professionalTax", "tdsDeduction", "status",
    ])
    writer.writerow([
        "1", "1", "2025", "50000", "20000", "0", "1600", "1250",
        "10000", "0", "0", "1800", "0", "200", "1000", "draft",
    ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=payroll_template.csv"},
    )


@router.post("/api/payroll/bulk-upload", tags=["Payroll"])
def bulk_upload_payroll(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk upload payroll records from a CSV file."""
    import csv
    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))

    created = 0
    updated = 0
    for row in reader:
        emp_id = row.get("employeeId") or row.get("employee_id")
        if not emp_id:
            continue
        try:
            emp_id = int(emp_id)
        except (TypeError, ValueError):
            continue
        emp = db.query(Employee).filter(Employee.id == emp_id, Employee.deleted_at.is_(None)).first()
        if not emp:
            continue
        if current_user.role != "superadmin":
            try:
                emp = get_employee_in_org(db, Employee, emp_id, current_user.organization_id)
            except HTTPException:
                continue
        month = row.get("month") or row.get("pay_month")
        year = row.get("year") or row.get("pay_year")
        try:
            month = int(month)
        except (TypeError, ValueError):
            month = ist_now_naive().month
        try:
            year = int(year)
        except (TypeError, ValueError):
            year = ist_now_naive().year

        existing = db.query(Payroll).filter(
            Payroll.deleted_at.is_(None),
            Payroll.employee_id == emp_id,
            Payroll.month == month,
            Payroll.year == year,
            Payroll.organization_id == emp.organization_id,
        ).first()

        def _f(key):
            try:
                return float(row.get(key)) if row.get(key) not in (None, "") else None
            except (TypeError, ValueError):
                return None

        payload = {
            "employee_id": emp_id,
            "organization_id": emp.organization_id,
            "company_id": emp.company_id,
            "department_id": emp.department_id,
            "month": month,
            "year": year,
            "basic_salary": _f("basicSalary") or _f("basic_salary"),
            "hra": _f("hra"),
            "da": _f("da"),
            "conveyance": _f("conveyance"),
            "medical": _f("medical"),
            "special_allowance": _f("specialAllowance") or _f("special_allowance"),
            "overtime_pay": _f("overtimePay") or _f("overtime_pay"),
            "bonus": _f("bonus"),
            "pf_deduction": _f("pfDeduction") or _f("pf_deduction"),
            "esi_deduction": _f("esiDeduction") or _f("esi_deduction"),
            "professional_tax": _f("professionalTax") or _f("professional_tax"),
            "tds_deduction": _f("tdsDeduction") or _f("tds_deduction"),
            "status": "draft",  # bulk-created records always enter as draft (no workflow bypass)
        }
        if existing:
            for k, v in payload.items():
                if v is not None:
                    setattr(existing, k, v)
            updated += 1
        else:
            db.add(Payroll(**payload))
            created += 1
    db.commit()
    return {"message": f"{created} created, {updated} updated", "created": created, "updated": updated}


# ════════════════════════════════════════════════════════════════
# Salary Revisions (effective-dated salary history)
# ════════════════════════════════════════════════════════════════

@router.get("/api/payroll/salary-revisions", tags=["Payroll"])
def list_salary_revisions(
    employeeId: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(SalaryRevision).join(Employee, Employee.id == SalaryRevision.employee_id)
    if current_user.role != "superadmin":
        q = q.filter(Employee.organization_id == current_user.organization_id)
    revisions = (
        q.filter(SalaryRevision.employee_id == employeeId)
        .order_by(SalaryRevision.effective_from.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "employeeId": r.employee_id,
            "effectiveFrom": r.effective_from.isoformat() if r.effective_from else None,
            "baseSalary": r.base_salary or 0,
            "salaryComponents": r.salary_components or {},
            "salaryTemplateId": r.salary_template_id,
            "reason": r.reason,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in revisions
    ]


@router.post("/api/payroll/salary-revisions", status_code=201, tags=["Payroll"])
def create_salary_revision(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee_id = payload.get("employeeId")
    effective_from = payload.get("effectiveFrom")
    base_salary = payload.get("baseSalary")
    if not employee_id or not effective_from or base_salary is None:
        raise HTTPException(status_code=400, detail="employeeId, effectiveFrom and baseSalary are required")
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if emp.organization_id and current_user.organization_id and emp.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this employee")
    try:
        from datetime import date as _d
        eff = _d.fromisoformat(str(effective_from)[:10])
    except Exception:
        raise HTTPException(status_code=400, detail="effectiveFrom must be a valid date (YYYY-MM-DD)")
    new_components = payload.get("salaryComponents")
    rev = SalaryRevision(
        employee_id=employee_id,
        effective_from=eff,
        base_salary=float(base_salary or 0),
        salary_components=new_components or emp.salary_components or {},
        salary_template_id=payload.get("salaryTemplateId") if payload.get("salaryTemplateId") not in (None, "", 0) else None,
        reason=payload.get("reason"),
    )
    db.add(rev)
    # Keep the employee's canonical CTC/components in sync so payroll always uses
    # the latest effective rate even outside the revision window.
    if eff >= ist_now_naive().date() or eff > (emp.join_date or ist_now_naive()).date():
        emp.base_salary = float(base_salary or 0)
        if new_components:
            emp.salary_components = new_components
    db.commit()
    db.refresh(rev)
    return {"message": "Salary revision created", "id": rev.id}


@router.delete("/api/payroll/salary-revisions/{revision_id}", tags=["Payroll"])
def delete_salary_revision(
    revision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rev = db.query(SalaryRevision).filter(SalaryRevision.id == revision_id).first()
    if not rev:
        raise HTTPException(status_code=404, detail="Salary revision not found")
    if current_user.role != "superadmin":
        emp = rev.employee
        if not emp or int(emp.organization_id or 0) != int(current_user.organization_id or 0):
            raise HTTPException(status_code=404, detail="Salary revision not found")
    db.delete(rev)
    db.commit()
    return {"message": "Salary revision deleted"}


@router.post("/api/payroll/salary-revisions/bulk", tags=["Payroll"])
def bulk_create_salary_revision(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a salary revision to many employees at once.

    Provide either an explicit `baseSalary` for everyone, or a `hikePercent`
    to raise each employee's current annual CTC by that percentage.
    """
    employee_ids = payload.get("employeeIds") or []
    effective_from = payload.get("effectiveFrom")
    if not employee_ids or not effective_from:
        raise HTTPException(status_code=400, detail="employeeIds and effectiveFrom are required")
    try:
        from datetime import date as _d
        eff = _d.fromisoformat(str(effective_from)[:10])
    except Exception:
        raise HTTPException(status_code=400, detail="effectiveFrom must be a valid date (YYYY-MM-DD)")

    explicit_base = payload.get("baseSalary")
    hike_pct = payload.get("hikePercent")
    if explicit_base is None and hike_pct is None:
        raise HTTPException(status_code=400, detail="Provide baseSalary or hikePercent")
    reason = payload.get("reason")
    new_components = payload.get("salaryComponents")

    role = (current_user.role or "").lower()
    if role not in ("admin", "superadmin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Only HR admins may apply bulk salary revisions")

    updated, skipped, errors = [], [], []
    for emp_id in employee_ids:
        try:
            emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == int(emp_id)).first()
            if not emp:
                skipped.append({"employeeId": emp_id, "reason": "not found"})
                continue
            if emp.organization_id and current_user.organization_id and emp.organization_id != current_user.organization_id:
                skipped.append({"employeeId": emp_id, "reason": "different organization"})
                continue
            if explicit_base is not None:
                new_base = float(explicit_base or 0)
            else:
                current = float(emp.base_salary or 0)
                new_base = round(current * (1 + float(hike_pct or 0) / 100.0), 2)
            rev = SalaryRevision(
                employee_id=emp.id,
                effective_from=eff,
                base_salary=new_base,
                salary_components=new_components or emp.salary_components or {},
                reason=reason or "Bulk revision",
            )
            db.add(rev)
            if eff >= ist_now_naive().date() or eff > (emp.join_date or ist_now_naive()).date():
                emp.base_salary = new_base
                if new_components:
                    emp.salary_components = new_components
            db.flush()
            updated.append({"employeeId": emp.id, "name": f"{emp.first_name} {emp.last_name or ''}".strip(), "baseSalary": new_base})
        except Exception as e:
            db.rollback()
            errors.append({"employeeId": emp_id, "reason": str(e)})
    db.commit()
    return {"message": f"{len(updated)} employee(s) revised", "updated": updated, "skipped": skipped, "errors": errors}


# ================================================================
# Employee Loans & Advances (auto-deducted from payroll)
# ================================================================

@router.get("/api/payroll/loans", tags=["Payroll"])
def list_salary_loans(
    employeeId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(SalaryLoan)
        .join(Employee, Employee.id == SalaryLoan.employee_id)
    )
    if current_user.organization_id:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    if employeeId:
        query = query.filter(SalaryLoan.employee_id == employeeId)
    loans = query.order_by(SalaryLoan.id.desc()).all()
    return [
        {
            "id": l.id,
            "employeeId": l.employee_id,
            "employeeName": f"{l.employee.first_name} {l.employee.last_name or ''}".strip() or f"#{l.employee_id}",
            "loanType": l.loan_type,
            "principalAmount": l.principal_amount or 0,
            "monthlyDeduction": l.monthly_deduction or 0,
            "totalMonths": l.total_months or 0,
            "remainingMonths": l.remaining_months or 0,
            "startMonth": l.start_month,
            "startYear": l.start_year,
            "interestRate": l.interest_rate or 0,
            "status": l.status,
            "notes": l.notes,
            "createdAt": l.created_at.isoformat() if l.created_at else None,
        }
        for l in loans
    ]


@router.post("/api/payroll/loans", status_code=201, tags=["Payroll"])
def create_salary_loan(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee_id = payload.get("employeeId")
    if not employee_id:
        raise HTTPException(status_code=400, detail="employeeId is required")
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    monthly = float(payload.get("monthlyDeduction") or 0)
    total_months = int(payload.get("totalMonths") or 1)
    loan = SalaryLoan(
        employee_id=employee_id,
        loan_type=payload.get("loanType") or "loan",
        principal_amount=float(payload.get("principalAmount") or 0),
        monthly_deduction=monthly,
        total_months=total_months,
        remaining_months=int(payload.get("remainingMonths") or total_months),
        start_month=int(payload.get("startMonth") or 1),
        start_year=int(payload.get("startYear") or 2000),
        interest_rate=float(payload.get("interestRate") or 0),
        status=(payload.get("status") or "active"),
        notes=payload.get("notes"),
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return {"message": "Loan/advance created", "id": loan.id}


@router.delete("/api/payroll/loans/{loan_id}", tags=["Payroll"])
def delete_salary_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    loan = db.query(SalaryLoan).filter(SalaryLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if current_user.role != "superadmin":
        emp = loan.employee
        if not emp or int(emp.organization_id or 0) != int(current_user.organization_id or 0):
            raise HTTPException(status_code=404, detail="Loan not found")
    db.delete(loan)
    db.commit()
    return {"message": "Loan deleted"}


@router.post("/api/payroll/loans/{loan_id}/close", tags=["Payroll"])
def close_salary_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    loan = db.query(SalaryLoan).filter(SalaryLoan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if current_user.role != "superadmin":
        emp = loan.employee
        if not emp or int(emp.organization_id or 0) != int(current_user.organization_id or 0):
            raise HTTPException(status_code=404, detail="Loan not found")
    loan.status = "closed"
    loan.remaining_months = 0
    db.commit()
    return {"message": "Loan closed"}


# ================================================================
# Compliance filings (PF/ESI/PT/LWF/TDS challan summaries + exports)
# ================================================================

@router.get("/api/payroll/compliance/challans", tags=["Payroll"])
def get_compliance_challans(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate statutory liabilities for a period, ready for challan filing."""
    q = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.month == month,
        Payroll.year == year,
        Payroll.status.in_(["processed", "paid"]),
    )
    if current_user.organization_id:
        q = q.filter(Payroll.organization_id == current_user.organization_id)
    records = q.all()

    def s(attr):
        return sum(float(getattr(p, attr) or 0) for p in records)

    totals = {
        "pf_employee": s("pf_deduction"),
        "pf_employer": s("pf_employer_contribution"),
        "esi_employee": s("esi_deduction"),
        "esi_employer": s("esi_employer_contribution"),
        "professional_tax": s("professional_tax"),
        "lwf_employee": s("lwf_deduction"),
        "lwf_employer": s("lwf_employer_contribution"),
        "tds": s("tds_deduction"),
        "gross": s("total_earnings"),
        "net": s("net_salary"),
        "employee_count": len(records),
    }
    totals["pf_total"] = round(totals["pf_employee"] + totals["pf_employer"], 2)
    totals["esi_total"] = round(totals["esi_employee"] + totals["esi_employer"], 2)
    totals["lwf_total"] = round(totals["lwf_employee"] + totals["lwf_employer"], 2)
    return {"month": month, "year": year, "totals": totals}


@router.get("/api/payroll/compliance/challans/export")
def export_compliance_challans(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """CSV export of per-employee statutory deductions for challan filing."""
    import io
    import csv
    q = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.month == month,
        Payroll.year == year,
        Payroll.status.in_(["processed", "paid"]),
    )
    if current_user.organization_id:
        q = q.filter(Payroll.organization_id == current_user.organization_id)
    records = q.all()
    emp_ids = {p.employee_id for p in records}
    emp_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Employee Code", "Employee Name", "Gross", "PF (Employee)", "PF (Employer)",
        "ESI (Employee)", "ESI (Employer)", "Professional Tax", "LWF (Employee)",
        "LWF (Employer)", "TDS", "Net Salary",
    ])
    for p in records:
        emp = emp_map.get(p.employee_id)
        name = f"{emp.first_name} {emp.last_name}".strip() if emp else ""
        writer.writerow([
            emp.employee_code if emp else "", name,
            p.total_earnings or 0, p.pf_deduction or 0, p.pf_employer_contribution or 0,
            p.esi_deduction or 0, p.esi_employer_contribution or 0,
            p.professional_tax or 0, p.lwf_deduction or 0, p.lwf_employer_contribution or 0,
            p.tds_deduction or 0, p.net_salary or 0,
        ])
    from fastapi.responses import Response
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=compliance_challans_{year}-{month}.csv"},
    )


@router.get("/api/payroll/disbursement")
def export_disbursement_bank_file(
    month: int,
    year: int,
    companyId: Optional[int] = None,
    branchId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bank disbursement CSV (NEFT/Salary bank file) for PAID payrolls.

    Includes the bank account snapshot + IFSC + net salary so the file can be
    handed directly to the bank for salary transfer.
    """
    import io
    import csv
    q = db.query(Payroll).filter(
        Payroll.deleted_at.is_(None),
        Payroll.month == month,
        Payroll.year == year,
        Payroll.status == "paid",
    )
    if current_user.organization_id:
        q = q.filter(Payroll.organization_id == current_user.organization_id)
    if companyId:
        q = q.filter(Payroll.company_id == companyId)
    if branchId:
        q = q.filter(Payroll.employee_id.in_(
            db.query(EmployeeBranchAssignment.employee_id)
            .filter(EmployeeBranchAssignment.branch_id == branchId)
            .filter(EmployeeBranchAssignment.status == "active")
            .filter(EmployeeBranchAssignment.deleted_at.is_(None))
        ))
    records = q.all()
    emp_ids = {p.employee_id for p in records}
    emp_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Employee Code", "Employee Name", "Bank Name", "Bank Account Number", "IFSC Code",
        "Net Salary", "Month", "Year", "Currency",
    ])
    for p in records:
        emp = emp_map.get(p.employee_id)
        name = f"{emp.first_name} {emp.last_name}".strip() if emp else ""
        bank = emp.bank_name if emp else None
        acct = p.bank_account or (emp.bank_account_number if emp else None) or ""
        ifsc = p.ifsc_code or (emp.ifsc_code if emp else None) or ""
        writer.writerow([
            emp.employee_code if emp else "", name,
            bank or "", acct, ifsc,
            p.net_salary or 0, p.month, p.year, (emp.currency if emp and getattr(emp, "currency", None) else "INR"),
        ])
    from fastapi.responses import Response
    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=disbursement_{year}-{month}.csv"},
    )

