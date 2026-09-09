"""HRMS API attendance routes."""
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, selectinload, with_loader_criteria

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import (AttendanceCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BulkDeleteRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org, get_header_company_id
from database import Base, SessionLocal, engine, get_db, get_read_db
from core.attendance_pulse import (
    get_idempotent_checkin,
    release_open_session,
    store_idempotent_checkin,
    try_acquire_open_session,
)
from core.datetime_utils import ist_now_naive, ist_today_str
from core.scale import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, MAX_PERIOD_LIST_LIMIT
from models import (Attendance, AttendanceAuditLog, AttendanceCorrectionRequest, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Attendance"])

IST_SUFFIX = "+05:30"

def _ist_iso(dt):
    if dt is None:
        return None
    s = dt.isoformat()
    if "+" in s or "Z" in s:
        return s
    return s + IST_SUFFIX


def _resolve_punch_employee(db: Session, current_user: User) -> Optional[Employee]:
    """Single round-trip employee lookup for check-in/out (branches eager-loaded)."""
    return (
        db.query(Employee)
        .options(selectinload(Employee.branches))
        .filter(
            Employee.deleted_at.is_(None),
            or_(Employee.user_id == current_user.id, Employee.email == current_user.email),
        )
        .first()
    )


def _parse_shift_time(time_str: str) -> Optional[tuple]:
    """Parse 'HH:MM' string to (hour, minute) tuple."""
    if not time_str:
        return None
    try:
        parts = str(time_str).strip().split(":")
        return (int(parts[0]), int(parts[1]))
    except (ValueError, IndexError):
        return None


def _resolve_shift(db: Session, employee_id: int, att_date) -> Optional[Shift]:
    """Resolve the correct shift for an employee on a given date.
    
    Priority: DutyRoster for that day → Employee's default shift → None.
    """
    from models import DutyRoster
    if att_date is None:
        return None

    if hasattr(att_date, 'date'):
        att_date = att_date.date()
    if isinstance(att_date, str):
        att_date = datetime.strptime(att_date[:10], "%Y-%m-%d").date()

    day_of_week = att_date.weekday()  # 0=Mon ... 6=Sun in Python

    # 1. Check DutyRoster for this specific day
    try:
        # Find the roster entry for this employee and day_of_week
        # week_start_date should be the Monday of the week containing att_date
        import datetime as _dt
        days_since_monday = att_date.weekday()
        week_monday = att_date - _dt.timedelta(days=days_since_monday)
        week_start = datetime.combine(week_monday, datetime.min.time())

        roster = db.query(DutyRoster).filter(
            DutyRoster.deleted_at.is_(None),
            DutyRoster.employee_id == employee_id,
            DutyRoster.day_of_week == day_of_week,
            DutyRoster.week_start_date == week_start,
        ).first()

        if roster and roster.shift_id:
            shift = db.query(Shift).filter(
                Shift.id == roster.shift_id,
                Shift.deleted_at.is_(None),
            ).first()
            if shift:
                return shift
    except Exception:
        pass

    # 2. Fallback to employee's default shift
    try:
        emp = db.query(Employee).filter(
            Employee.id == employee_id,
            Employee.deleted_at.is_(None),
        ).first()
        if emp and emp.shift_id:
            shift = db.query(Shift).filter(
                Shift.id == emp.shift_id,
                Shift.deleted_at.is_(None),
            ).first()
            if shift:
                return shift
    except Exception:
        pass

    return None


def _shift_duration_hours(shift: Shift) -> float:
    """Calculate scheduled work hours from a shift's start/end times minus break."""
    start = _parse_shift_time(shift.start_time)
    end = _parse_shift_time(shift.end_time)
    if not start or not end:
        return 8.0
    start_mins = start[0] * 60 + start[1]
    end_mins = end[0] * 60 + end[1]
    if end_mins <= start_mins:
        end_mins += 24 * 60  # cross midnight
    diff_mins = end_mins - start_mins
    break_mins = getattr(shift, 'break_duration', 60) or 60
    return round(max((diff_mins - break_mins) / 60, 0), 2)


def _compute_late(shift: Shift, check_in_time: datetime, grace_minutes: int = 15) -> tuple:
    """Check if check_in is late. Returns (is_late, late_minutes)."""
    start = _parse_shift_time(shift.start_time)
    if not start:
        return (False, 0)
    shift_start = check_in_time.replace(hour=start[0], minute=start[1], second=0, microsecond=0)
    grace_cutoff = shift_start + timedelta(minutes=grace_minutes)
    if check_in_time > grace_cutoff:
        late_mins = int((check_in_time - shift_start).total_seconds() / 60)
        return (True, late_mins)
    return (False, 0)


def _compute_overtime(shift: Shift, check_out_time: datetime) -> float:
    """Calculate overtime hours past shift end time."""
    end = _parse_shift_time(shift.end_time)
    if not end:
        return 0.0
    shift_end = check_out_time.replace(hour=end[0], minute=end[1], second=0, microsecond=0)
    if check_out_time > shift_end:
        overtime_secs = (check_out_time - shift_end).total_seconds()
        return round(max(overtime_secs / 3600, 0), 2)
    return 0.0


def _compute_early_departure(shift: Shift, check_out_time: datetime) -> tuple:
    """Check if check_out is before shift end. Returns (is_early, early_minutes)."""
    end = _parse_shift_time(shift.end_time)
    if not end:
        return (False, 0)
    shift_end = check_out_time.replace(hour=end[0], minute=end[1], second=0, microsecond=0)
    if check_out_time < shift_end:
        early_mins = int((shift_end - check_out_time).total_seconds() / 60)
        return (True, early_mins)
    return (False, 0)


_ADMIN_MULTI_PUNCH_ROLES = frozenset({
    "admin", "superadmin", "hr_admin", "hr_manager", "hr_executive",
})


def _allows_multiple_punches(user: User) -> bool:
    """Admins may run multiple check-in/out cycles per day (testing)."""
    return user.role in _ADMIN_MULTI_PUNCH_ROLES


@cached(ttl=60)
@router.get("/api/attendance", tags=["Attendance"])
def get_attendance(
    employeeId: Optional[int] = None,
    companyId: Optional[int] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    includeInactive: bool = False,
    page: int = Query(1, ge=1),
    limit: Optional[int] = Query(None, ge=1),
    cursor: Optional[int] = Query(None, description="Keyset cursor (attendance id)"),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    period_scoped = startDate is not None and endDate is not None
    max_allowed = MAX_PERIOD_LIST_LIMIT if period_scoped else MAX_LIST_LIMIT
    if limit is None:
        eff_limit = max_allowed if period_scoped else DEFAULT_LIST_LIMIT
    else:
        eff_limit = min(limit, max_allowed)
    if companyId is None and request is not None:
        companyId = get_header_company_id(request)
    query = db.query(Attendance).filter(Attendance.deleted_at.is_(None))
    if companyId:
        query = query.filter(Attendance.company_id == companyId)
    # Exclude records belonging to deactivated/terminated employees (unless requested)
    if not includeInactive:
        query = query.join(Employee, Attendance.employee_id == Employee.id).filter(
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        )
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Attendance.organization_id == current_user.organization_id)
    if employeeId:
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, employeeId, current_user.organization_id)
        query = query.filter(Attendance.employee_id == employeeId)
    elif current_user.role == "employee":
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.user_id == current_user.id).first()
        if emp:
            query = query.filter(Attendance.employee_id == emp.id)

    # Default to today (IST) if no dates provided
    from datetime import timezone as _tz_def
    IST_DEF = _tz_def(timedelta(hours=5, minutes=30))
    now = datetime.now(IST_DEF)
    if not startDate:
        startDate = now.strftime("%Y-%m-%d")
    if not endDate:
        endDate = now.strftime("%Y-%m-%d")

    if startDate:
        query = query.filter(Attendance.date >= startDate)
    if endDate:
        query = query.filter(Attendance.date <= endDate + " 23:59:59")

    if cursor is not None:
        # Keyset pagination on the id sort key (constant O(log n) per page)
        query = query.filter(Attendance.id < cursor).order_by(Attendance.id.desc()).limit(eff_limit)
    else:
        offset = (page - 1) * eff_limit
        query = query.order_by(Attendance.id.desc()).offset(offset).limit(eff_limit)

    records = query.all()

    emp_ids = list({r.employee_id for r in records})
    emp_map = {}
    if emp_ids:
        from sqlalchemy.orm import joinedload
        emps = (
            db.query(Employee)
            .options(joinedload(Employee.department))
            .filter(Employee.id.in_(emp_ids), Employee.deleted_at.is_(None))
            .all()
        )
        for e in emps:
            dept_name = e.department.name if e.department else None
            emp_map[e.id] = {
                "employeeName": f"{e.first_name or ''} {e.last_name or ''}".strip(),
                "department": dept_name,
                "designation": e.designation or None,
            }

    result = []

    for r in records:
        emp_info = emp_map.get(r.employee_id, {})
        result.append({
            "id": r.id, "employee_id": r.employee_id,
            "employeeName": emp_info.get("employeeName", ""),
            "department": emp_info.get("department"),
            "designation": emp_info.get("designation"),
            "organization_id": r.organization_id, "company_id": r.company_id,
            "department_id": r.department_id, "shift_id": r.shift_id,
            "date": str(r.date)[:10] if r.date else None,
            "check_in": _ist_iso(r.check_in),
            "check_out": _ist_iso(r.check_out),
            "status": r.status, "work_hours": r.work_hours,
            "clock_out_violation": bool(r.check_in and not r.check_out),
            "scheduled_hours": r.scheduled_hours, "overtime_hours": r.overtime_hours,
            "break_hours": r.break_hours, "is_late": r.is_late,
            "late_minutes": r.late_minutes, "is_early_departure": r.is_early_departure,
            "early_departure_minutes": r.early_departure_minutes,
            "notes": r.notes, "comments": r.comments, "reason": r.reason,
            "location": r.location, "check_in_location_name": r.check_in_location_name,
            "check_out_location_name": r.check_out_location_name,
            "check_in_latitude": r.check_in_latitude, "check_in_longitude": r.check_in_longitude,
            "check_out_latitude": r.check_out_latitude, "check_out_longitude": r.check_out_longitude,
            "geofence_id": r.geofence_id, "is_within_geofence": r.is_within_geofence,
            "check_in_selfie_url": r.check_in_selfie_url, "check_out_selfie_url": r.check_out_selfie_url,
            "selfie_verified": r.selfie_verified, "device_id": r.device_id,
            "device_type": r.device_type, "ip_address": r.ip_address,
            "user_agent": r.user_agent, "is_work_from_home": r.is_work_from_home,
            "wfh_approval_id": r.wfh_approval_id, "wfh_location": r.wfh_location,
            "is_manual_entry": r.is_manual_entry, "approved_by": r.approved_by,
            "approved_at": _ist_iso(r.approved_at),
            "approval_comments": r.approval_comments,
            "leave_application_id": r.leave_application_id, "is_on_leave": r.is_on_leave,
            "is_holiday": r.is_holiday, "holiday_id": r.holiday_id,
            "sync_status": r.sync_status, "sync_attempt_count": r.sync_attempt_count,
            "last_sync_attempt": _ist_iso(r.last_sync_attempt),
            "sync_error_message": r.sync_error_message,
            "offline_created_at": _ist_iso(r.offline_created_at),
            "offline_device_id": r.offline_device_id,
            "conflict_resolution_status": r.conflict_resolution_status,
            "conflict_resolved_by": r.conflict_resolved_by,
            "conflict_resolved_at": _ist_iso(r.conflict_resolved_at),
            "conflict_reason": r.conflict_reason,
            "created_at": _ist_iso(r.created_at),
            "updated_at": _ist_iso(r.updated_at),
            "deleted_at": _ist_iso(r.deleted_at),
        })

    # Merge approved leaves as synthetic on_leave records
    try:
        emp_ids = {r.employee_id for r in records}
        if employeeId:
            emp_ids.add(employeeId)
        elif current_user.role == "employee":
            emp = db.query(Employee).filter(Employee.user_id == current_user.id).first()
            if emp:
                emp_ids = {emp.id}

        if emp_ids:
            leaves_query = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), 
                LeaveApplication.employee_id.in_(list(emp_ids)),
                LeaveApplication.start_date <= (endDate + " 23:59:59"),
                LeaveApplication.end_date >= startDate,
                LeaveApplication.status == "approved",
            )
            if current_user.role != "superadmin" and current_user.organization_id:
                leaves_query = leaves_query.filter(LeaveApplication.organization_id == current_user.organization_id)
            leaves = leaves_query.all()
            from datetime import timedelta as _td
            existing = {(r["employee_id"], r["date"][:10]) for r in result}

            for lv in leaves:
                d = lv.start_date
                if hasattr(d, 'date'): d = d.date()
                e = lv.end_date
                if hasattr(e, 'date'): e = e.date()
                while d <= e:
                    key = d.strftime("%Y-%m-%d")
                    if (lv.employee_id, key) not in existing:
                        leave_emp = emp_map.get(lv.employee_id, {})
                        result.append({
                            "id": None, "employee_id": lv.employee_id,
                            "employeeName": leave_emp.get("employeeName", ""),
                            "department": leave_emp.get("department"),
                            "designation": leave_emp.get("designation"),
                            "date": key, "check_in": None, "check_out": None,
                            "status": "on_leave", "work_hours": 0,
                            "scheduled_hours": 8, "overtime_hours": 0,
                            "break_hours": 0, "is_late": False,
                            "late_minutes": 0, "is_early_departure": False,
                            "early_departure_minutes": 0, "notes": None,
                            "comments": None, "reason": None, "location": None,
                            "is_manual_entry": False, "is_on_leave": True,
                            "is_holiday": False, "leave_application_id": lv.id,
                            "sync_status": "synced",
                        })
                    d += _td(days=1)
    except Exception:
        pass

    # Backward-compatible response: period-scoped UI calls expect a plain array.
    if cursor is None and page == 1 and (period_scoped or limit == 500):
        return result

    return {
        "data": result,
        "pagination": {
            "page": cursor or page,
            "limit": eff_limit,
            "hasMore": len(records) == eff_limit,
            "nextCursor": records[-1].id if len(records) == eff_limit else None,
            "periodScoped": period_scoped,
        },
    }

@router.put("/api/attendance/{attendance_id}", tags=["Attendance"])
def update_attendance(
    attendance_id: int,
    data: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(Attendance).filter(Attendance.deleted_at.is_(None), Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    if current_user.role != "superadmin":
        org_owned(att, current_user.organization_id)

    old_status = att.status
    old_check_in = att.check_in
    old_check_out = att.check_out
    att.is_manual_entry = True
    att.approved_by = current_user.id

    for key, val in convert_camel_to_snake(data.model_dump(exclude_unset=True)).items():
        if key == "organization_id" and current_user.role != "superadmin":
            continue
        if val is not None and hasattr(att, key):
            if key in ("check_in", "check_out") and isinstance(val, str):
                if val.strip():
                    parsed = dateparser.parse(val)
                    if parsed:
                        setattr(att, key, parsed)
                else:
                    setattr(att, key, None)
            else:
                setattr(att, key, val)

    db.commit()
    db.refresh(att)

    prev: Dict[str, Any] = {"status": old_status}
    new: Dict[str, Any] = {"status": att.status}
    changed: List[str] = []
    if old_status != att.status:
        changed.append("status")
    for label, old, cur in (("check_in", old_check_in, att.check_in), ("check_out", old_check_out, att.check_out)):
        prev[label] = old.isoformat() if old else None
        new[label] = cur.isoformat() if cur else None
        if prev[label] != new[label]:
            changed.append(label)

    if changed:
        log = AttendanceAuditLog(
            attendance_id=att.id,
            employee_id=att.employee_id,
            action="updated",
            previous_values=prev,
            new_values=new,
            changed_fields=changed,
            action_by=current_user.id,
            action_source="web",
            reason="Manual override",
        )
        db.add(log)
        db.commit()

    return att


@router.delete("/api/attendance/{attendance_id}", tags=["Attendance"])
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(Attendance).filter(Attendance.deleted_at.is_(None), Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if current_user.role != "superadmin":
        org_owned(att, current_user.organization_id)
    log = AttendanceAuditLog(
        attendance_id=att.id,
        employee_id=att.employee_id,
        action="deleted",
        previous_values={"status": att.status, "date": str(att.date)},
        new_values={},
        changed_fields=["deleted_at"],
        action_by=current_user.id,
        action_source="web",
        reason="Manual deletion",
    )
    db.add(log)
    att.deleted_at = ist_now_naive()
    db.commit()
    return {"message": "Attendance record deleted"}


@router.get("/api/attendance/calendar", tags=["Attendance"])
def get_attendance_calendar(
    month: int,
    year: int,
    employeeId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = f"{year}-{month:02d}-01"
    last_day = calendar.monthrange(year, month)[1]
    end = f"{year}-{month:02d}-{last_day}"

    target_employee_id = employeeId
    if not target_employee_id and current_user.role == "employee":
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.user_id == current_user.id).first()
        if emp:
            target_employee_id = emp.id

    if target_employee_id and current_user.role != "superadmin":
        get_employee_in_org(db, Employee, target_employee_id, current_user.organization_id)

    records = []
    if target_employee_id:
        records_query = db.query(Attendance).filter(Attendance.deleted_at.is_(None), 
            Attendance.employee_id == target_employee_id,
            Attendance.date >= start,
            Attendance.date <= end,
        )
        if current_user.role != "superadmin" and current_user.organization_id:
            records_query = records_query.filter(Attendance.organization_id == current_user.organization_id)
        records = records_query.all()

    holidays_query = db.query(Holiday).filter(Holiday.deleted_at.is_(None), 
        Holiday.date >= start, Holiday.date <= end
    )
    if current_user.role != "superadmin" and current_user.organization_id:
        holidays_query = holidays_query.filter(Holiday.organization_id == current_user.organization_id)
    holidays = holidays_query.all()

    calendar_data = {}
    for r in records:
        day = r.date.strftime("%Y-%m-%d") if hasattr(r.date, 'strftime') else str(r.date)[:10]
        if day:
            calendar_data[day] = {"type": "attendance", "status": r.status}

    for h in holidays:
        day = h.date.strftime("%Y-%m-%d") if hasattr(h.date, 'strftime') else str(h.date)[:10]
        calendar_data[day] = {"type": "holiday", "name": h.name}

    return {"calendar": calendar_data, "month": month, "year": year}


@router.get("/api/attendance/employee/{employee_id}/calendar", tags=["Attendance"])
def get_employee_calendar(
    employee_id: int,
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full employee calendar: attendance + holidays + leaves for a month, with editable details per day.

    Security: users granted "attendance: write" (HR/managers) may view/manage any
    employee's calendar. Everyone else is restricted to their own employee record,
    keeping each company's data isolated from regular employees.
    """
    if current_user.role != "superadmin" and current_user.role not in ("admin", "hr_admin", "hr_manager", "hr_executive"):
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)

    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)

    start = f"{year}-{month:02d}-01"
    last_day = calendar.monthrange(year, month)[1]
    end = f"{year}-{month:02d}-{last_day}"

    records = db.query(Attendance).filter(
        Attendance.deleted_at.is_(None),
        Attendance.employee_id == employee_id,
        Attendance.date >= start,
        Attendance.date <= end,
    ).all()

    holidays_query = db.query(Holiday).filter(
        Holiday.deleted_at.is_(None),
        Holiday.date >= start, Holiday.date <= end
    )
    if current_user.role != "superadmin" and current_user.organization_id:
        holidays_query = holidays_query.filter(Holiday.organization_id == current_user.organization_id)
    holidays = holidays_query.all()

    leaves = db.query(LeaveApplication).filter(
        LeaveApplication.deleted_at.is_(None),
        LeaveApplication.employee_id == employee_id,
        LeaveApplication.start_date <= end,
        LeaveApplication.end_date >= start,
        LeaveApplication.status == "approved",
    ).all()

    # Resolve employee-specific working days from their shift/duty roster config.
    # Priority: DutyRoster shift -> employee shift -> org attendance policy -> org shift.
    # Fallback is all 7 days (neutral), never a hardcoded Mon-Fri default.
    from services.workday_service import resolve_workdays
    workdays = resolve_workdays(db, employee_id=employee_id, start=start, end=end)

    days: dict = {}
    for r in records:
        day_key = r.date.strftime("%Y-%m-%d") if hasattr(r.date, 'strftime') else str(r.date)[:10]
        days[day_key] = {
            "id": r.id,
            "type": "attendance",
            "status": r.status,
            "checkIn": r.check_in.strftime("%H:%M") if r.check_in else None,
            "checkOut": r.check_out.strftime("%H:%M") if r.check_out else None,
            "workHours": r.work_hours,
            "overtimeHours": r.overtime_hours,
            "isLate": r.is_late,
            "lateMinutes": r.late_minutes,
            "isEarlyDeparture": r.is_early_departure,
            "notes": r.notes,
            "shiftId": r.shift_id,
        }

    for h in holidays:
        day_key = h.date if isinstance(h.date, str) else h.date.strftime("%Y-%m-%d")
        if day_key not in days:
            days[day_key] = {"type": "holiday", "name": h.name, "isPaid": h.is_paid}

    for lv in leaves:
        from datetime import timedelta
        cur = lv.start_date.date() if hasattr(lv.start_date, 'date') else dateparser.parse(str(lv.start_date)).date()
        end_lv = lv.end_date.date() if hasattr(lv.end_date, 'date') else dateparser.parse(str(lv.end_date)).date()
        while cur <= end_lv:
            day_key = cur.strftime("%Y-%m-%d")
            if day_key not in days:
                leave_type = db.query(LeaveType).filter(LeaveType.id == lv.leave_type_id).first()
                days[day_key] = {
                    "type": "leave",
                    "status": "on_leave",
                    "leaveId": lv.id,
                    "leaveType": leave_type.name if leave_type else "Leave",
                    "isHalfDay": lv.is_half_day,
                }
            elif days[day_key].get("type") == "attendance":
                days[day_key]["status"] = "on_leave"
                days[day_key]["leaveId"] = lv.id
            cur += timedelta(days=1)

    return {"employeeId": employee_id, "month": month, "year": year, "workdays": workdays, "days": days}


@router.get("/api/attendance/geofence-info", tags=["Attendance"])
def get_geofence_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = _resolve_punch_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee record not found")

    from services.settings_service import is_feature_enabled
    geo_enabled = is_feature_enabled(db, current_user.organization_id, "geoFence")
    emp_geo = bool(getattr(emp, "geofence_enabled", False))

    branch_info = None
    if emp.branches:
        primary = emp.branches[0]
        branch_info = {
            "id": primary.id,
            "name": primary.name,
            "latitude": primary.latitude,
            "longitude": primary.longitude,
            "geofenceRadius": primary.geofence_radius or 100,
        }

    return {
        "geoFenceEnabled": geo_enabled and emp_geo,
        "branch": branch_info,
    }


@router.post("/api/attendance/checkin", tags=["Attendance"])
def check_in(
    request_data: ClockInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = _resolve_punch_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee record not found")

    if request_data.clientRequestId:
        cached = get_idempotent_checkin(emp.id, request_data.clientRequestId)
        if cached and cached.get("id"):
            att_cached = db.query(Attendance).filter(
                Attendance.deleted_at.is_(None),
                Attendance.id == cached["id"],
            ).first()
            if att_cached:
                return att_cached

    if not try_acquire_open_session(emp.id):
        if _allows_multiple_punches(current_user):
            # Clear stale Redis lock from a prior session (common during admin testing).
            release_open_session(emp.id)
            try_acquire_open_session(emp.id)
        else:
            raise HTTPException(status_code=400, detail="Already checked in")

    existing = db.query(Attendance.id).filter(
        Attendance.deleted_at.is_(None),
        Attendance.employee_id == emp.id,
        Attendance.check_out.is_(None),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already checked in")

    # Location is always mandatory for check-in/out.
    if request_data.latitude is None or request_data.longitude is None:
        release_open_session(emp.id)
        raise HTTPException(
            status_code=400,
            detail="Location is required. Please enable GPS and try again.",
        )

    # Enforce geo-fence per employee: when geofence_enabled is ON the employee
    # must be within their branch's geofence (latitude/longitude/radius).
    from services.settings_service import is_feature_enabled
    from services.workday_service import resolve_scoped_attendance_config
    geo_enabled = is_feature_enabled(db, current_user.organization_id, "geoFence")
    is_within = None
    if geo_enabled and emp.geofence_enabled:
        radius = 100
        try:
            cfg = resolve_scoped_attendance_config(db, emp.id, current_user.organization_id)
            if cfg and cfg.get("geoRadius"):
                radius = float(cfg.get("geoRadius"))
        except Exception:
            pass
        # Locate the anchor from the employee's primary branch
        anchor = None
        if emp.branches:
            primary = emp.branches[0]
            if primary.latitude and primary.longitude:
                anchor = (primary.latitude, primary.longitude, primary.geofence_radius or radius)
        if not anchor:
            # Fall back to the org geoRadius config without an anchor: accept
            # any provided coordinate but record whether it looks valid.
            is_within = request_data.latitude != 0 or request_data.longitude != 0
        else:
            lat0, lon0, rad = anchor
            dist = calculate_distance(lat0, lon0, request_data.latitude, request_data.longitude)
            is_within = dist <= rad
            if not is_within:
                release_open_session(emp.id)
                raise HTTPException(
                    status_code=400,
                    detail=f"You are {dist:.0f}m away from your branch. Please move within {rad:.0f}m of the branch to check in.",
                )

    selfie_url = None
    if request_data.selfieData:
        selfie_url = save_selfie(
            request_data.selfieData, emp.id, "checkin", organization_id=current_user.organization_id
        )

    from datetime import timezone as _tz
    IST = _tz(timedelta(hours=5, minutes=30))
    now = datetime.now(IST).replace(tzinfo=None)

    # Resolve shift and compute late status
    resolved_shift = _resolve_shift(db, emp.id, now.date())
    shift_id_to_use = resolved_shift.id if resolved_shift else (request_data.shiftId or None)

    is_late = False
    late_minutes = 0
    scheduled_hours = 8.0
    if resolved_shift:
        grace = 15
        try:
            from services.payroll_service import _get_attendance_policy
            att_policy = _get_attendance_policy(db, emp)
            if att_policy:
                grace = att_policy.late_mark_threshold_minutes or 15
                scheduled_hours = _shift_duration_hours(resolved_shift)
        except Exception:
            pass
        is_late, late_minutes = _compute_late(resolved_shift, now, grace)

    att = Attendance(
        employee_id=emp.id,
        organization_id=current_user.organization_id,
        company_id=emp.company_id,
        department_id=emp.department_id,
        date=now,
        check_in=now,
        status="late" if is_late else "present",
        check_in_latitude=request_data.latitude,
        check_in_longitude=request_data.longitude,
        check_in_location_name=request_data.locationName,
        check_in_selfie_url=selfie_url,
        device_id=request_data.deviceId,
        device_type=request_data.deviceType,
        shift_id=shift_id_to_use,
        notes=request_data.notes,
        is_within_geofence=is_within,
        is_manual_entry=False,
        is_late=is_late,
        late_minutes=late_minutes,
        scheduled_hours=scheduled_hours,
        sync_status="synced",
    )
    db.add(att)
    try:
        db.commit()
        db.refresh(att)
    except IntegrityError:
        db.rollback()
        release_open_session(emp.id)
        raise HTTPException(status_code=400, detail="Already checked in")

    if request_data.clientRequestId:
        store_idempotent_checkin(emp.id, request_data.clientRequestId, {"id": att.id})

    invalidate_cache("hrms:tenant:*")
    return {
        "id": att.id,
        "employee_id": att.employee_id,
        "date": str(att.date)[:10] if att.date else None,
        "check_in": _ist_iso(att.check_in),
        "check_out": _ist_iso(att.check_out),
        "status": att.status,
        "work_hours": att.work_hours,
        "is_within_geofence": att.is_within_geofence,
        "check_in_latitude": att.check_in_latitude,
        "check_in_longitude": att.check_in_longitude,
        "check_in_location_name": att.check_in_location_name,
        "device_id": att.device_id,
        "device_type": att.device_type,
    }


@router.post("/api/attendance/checkout", tags=["Attendance"])
def check_out(
    request_data: ClockOutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = _resolve_punch_employee(db, current_user)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee record not found")

    att = db.query(Attendance).filter(Attendance.deleted_at.is_(None),
        Attendance.employee_id == emp.id,
        Attendance.check_out.is_(None),
    ).order_by(Attendance.check_in.desc()).first()
    if not att:
        raise HTTPException(status_code=400, detail="No active check-in found")

    # Location is always mandatory for check-out.
    if request_data.latitude is None or request_data.longitude is None:
        raise HTTPException(
            status_code=400,
            detail="Location is required. Please enable GPS and try again.",
        )

    # Enforce geo-fence on check-out too (same per-employee toggle)
    from services.settings_service import is_feature_enabled
    from services.workday_service import resolve_scoped_attendance_config
    geo_enabled = is_feature_enabled(db, current_user.organization_id, "geoFence")
    if geo_enabled and emp.geofence_enabled:
        radius = 100
        try:
            cfg = resolve_scoped_attendance_config(db, emp.id, current_user.organization_id)
            if cfg and cfg.get("geoRadius"):
                radius = float(cfg.get("geoRadius"))
        except Exception:
            pass
        anchor = None
        if emp.branches:
            primary = emp.branches[0]
            if primary.latitude and primary.longitude:
                anchor = (primary.latitude, primary.longitude, primary.geofence_radius or radius)
        if anchor:
            lat0, lon0, rad = anchor
            dist = calculate_distance(lat0, lon0, request_data.latitude, request_data.longitude)
            if dist > rad:
                raise HTTPException(
                    status_code=400,
                    detail=f"You are {dist:.0f}m away from your branch. Please move within {rad:.0f}m of the branch to check out.",
                )
            att.is_within_geofence = dist <= rad

    selfie_url = None
    if request_data.selfieData:
        selfie_url = save_selfie(
            request_data.selfieData, emp.id, "checkout", organization_id=current_user.organization_id
        )

    from datetime import timezone as _tz2
    IST2 = _tz2(timedelta(hours=5, minutes=30))
    now = datetime.now(IST2).replace(tzinfo=None)
    att.check_out = now
    att.check_out_latitude = request_data.latitude
    att.check_out_longitude = request_data.longitude
    att.check_out_location_name = request_data.locationName
    att.check_out_selfie_url = selfie_url

    if att.check_in:
        try:
            ci = att.check_in if isinstance(att.check_in, datetime) else dateparser.parse(str(att.check_in))
            co = now if isinstance(now, datetime) else dateparser.parse(str(now))
            ci_naive = ci.replace(tzinfo=None) if ci.tzinfo else ci
            co_naive = co.replace(tzinfo=None) if co.tzinfo else co
            work_hours = (co_naive - ci_naive).total_seconds() / 3600
            att.work_hours = round(max(work_hours, 0), 2)

            # Resolve shift for overtime and early departure
            resolved_shift = _resolve_shift(db, att.employee_id, att.date.date() if att.date else co_naive.date())
            if resolved_shift:
                att.overtime_hours = _compute_overtime(resolved_shift, co_naive)
                is_early, early_mins = _compute_early_departure(resolved_shift, co_naive)
                att.is_early_departure = is_early
                att.early_departure_minutes = early_mins
        except Exception as e:
            _log(f"WORK_HOURS_CALC_ERROR: {e}")

    db.commit()
    db.refresh(att)
    release_open_session(emp.id)
    invalidate_cache("hrms:tenant:*")
    return {
        "id": att.id,
        "employee_id": att.employee_id,
        "date": str(att.date)[:10] if att.date else None,
        "check_in": _ist_iso(att.check_in),
        "check_out": _ist_iso(att.check_out),
        "status": att.status,
        "work_hours": att.work_hours,
        "overtime_hours": att.overtime_hours,
        "is_early_departure": att.is_early_departure,
        "early_departure_minutes": att.early_departure_minutes,
        "is_within_geofence": att.is_within_geofence,
        "check_out_latitude": att.check_out_latitude,
        "check_out_longitude": att.check_out_longitude,
        "check_out_location_name": att.check_out_location_name,
    }


@router.post("/api/attendance/manual", tags=["Attendance"])
def create_manual_attendance(
    data: ManualAttendanceCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import traceback
    _log(f"MANUAL_ATTENDANCE payload: emp={data.employeeId} date={data.date} status={data.status} ci={data.checkIn} co={data.checkOut}")
    try:
        date_str = data.date or ist_today_str()
        parsed_date = dateparser.parse(date_str)
        _log(f"  date_str={date_str} parsed_date={parsed_date}")

        if parsed_date is None:
            raise ValueError(f"Could not parse date: {date_str}")

        ci = dateparser.parse(f"{date_str} {(data.checkIn or '09:00')}")
        co = dateparser.parse(f"{date_str} {data.checkOut}") if data.checkOut else None
        _log(f"  ci={ci} co={co}")

        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, data.employeeId, current_user.organization_id)

        from core.employee_scope import resolve_employee_org_scope
        scope = resolve_employee_org_scope(db, data.employeeId)

        att = Attendance(
            employee_id=data.employeeId,
            organization_id=current_user.organization_id,
            date=parsed_date,
            check_in=ci,
            check_out=co,
            work_hours=data.workHours,
            scheduled_hours=data.scheduledHours or 8,
            overtime_hours=data.overtimeHours or 0,
            break_hours=data.breakHours or 0,
            notes=data.notes,
            reason=data.reason,
            status=data.status or "present",
            is_manual_entry=True,
            approved_by=current_user.id,
            sync_status="synced",
            company_id=data.companyId or scope.get("companyId"),
            branch_id=data.branchId or scope.get("branchId"),
            department_id=data.departmentId or scope.get("departmentId"),
            shift_id=data.shiftId,
            is_late=data.isLate or False,
            late_minutes=data.lateMinutes or 0,
            is_early_departure=data.isEarlyDeparture or False,
            early_departure_minutes=data.earlyDepartureMinutes or 0,
            location=data.location,
            check_in_location_name=data.checkInLocationName,
            check_out_location_name=data.checkOutLocationName,
            check_in_latitude=data.checkInLatitude,
            check_in_longitude=data.checkInLongitude,
            check_out_latitude=data.checkOutLatitude,
            check_out_longitude=data.checkOutLongitude,
            is_within_geofence=data.isWithinGeofence if data.isWithinGeofence is not None else True,
            device_type=data.deviceType,
        )
        db.add(att)
        db.commit()
        db.refresh(att)
        _log(f"  SUCCESS id={att.id}")

        log = AttendanceAuditLog(
            attendance_id=att.id,
            employee_id=data.employeeId,
            action="created",
            previous_values={},
            new_values={"status": att.status, "date": str(parsed_date.date())},
            changed_fields=["status", "date"],
            action_by=current_user.id,
            action_source="web",
            reason="Manual override" if data.reason else None,
        )
        db.add(log)
        db.commit()

        return att

    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        _log(f"  FAILED: {e}\n{tb}")
        raise HTTPException(status_code=500, detail=f"MANUAL_ATTENDANCE_ERROR: {e}")


@router.get("/api/attendance/template", tags=["Attendance"])
def download_attendance_template(current_user: User = Depends(get_current_user)):
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["employeeId", "date", "checkIn", "checkOut", "status", "workHours"])
    writer.writerow(["1", "2025-01-01", "09:00", "18:00", "present", "9"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance_template.csv"},
    )


@router.post("/api/attendance/sync", tags=["Attendance"])
def sync_attendance(
    sync_data: AttendanceSyncRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    synced = 0
    for rec in sync_data.attendanceRecords:
        emp_id = rec.get("employeeId")
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, emp_id, current_user.organization_id)
        att = Attendance(
            employee_id=emp_id,
            organization_id=current_user.organization_id,
            check_in=rec.get("checkIn"),
            check_out=rec.get("checkOut"),
            status=rec.get("status", "present"),
            work_hours=rec.get("workHours"),
            is_manual_entry=rec.get("isManualEntry", False),
            offline_created_at=rec.get("createdAt"),
            offline_device_id=rec.get("deviceId"),
            sync_status="pending",
        )
        db.add(att)
        synced += 1
    db.commit()
    return {"message": f"{synced} records synced", "count": synced}


@router.post("/api/attendance/bulk-mark", tags=["Attendance"])
def bulk_mark_attendance(
    data: BulkMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    created = 0
    updated = 0
    linked_leaves = 0

    def _resolve_leave_type(status: str):
        """Match a status/leave-type name to an active LeaveType via name, substring or code synonyms."""
        s = (status or "").strip().lower()
        if not s:
            return None
        synonyms = {
            "vacation": "annual", "holiday": "annual",
            "sick_leave": "sick", "sick": "sick",
            "personal": "personal", "personal_leave": "personal",
            "maternity": "maternity", "paternity": "paternity",
            "casual": "casual", "comp_off": "compoff", "compoff": "compoff",
            "bereavement": "bereavement",
        }
        want = synonyms.get(s, s)
        lt_query = db.query(LeaveType).filter(LeaveType.status == "active")
        if current_user.role != "superadmin":
            lt_query = lt_query.filter(LeaveType.organization_id == current_user.organization_id)
        lts = lt_query.all()
        for lt in lts:
            n = (lt.name or "").lower()
            c = (lt.code or "").lower()
            if want == n or want == c or want in n or n in want:
                return lt
        return None

    # If the applied status is a leave type, sync a linked (approved) leave application
    leave_type = _resolve_leave_type(data.status)

    for rec in data.records:
        emp_id = rec.get("employeeId")
        date_str = rec.get("date")
        if not emp_id or not date_str:
            continue
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, emp_id, current_user.organization_id)
        rec_date = dateparser.parse(date_str).date()
        existing = db.query(Attendance).filter(Attendance.deleted_at.is_(None),
            Attendance.employee_id == emp_id,
            func.date(Attendance.date) == rec_date,
        ).first()

        leave_application_id = existing.leave_application_id if existing else None
        if leave_type is not None and not leave_application_id:
            emp = db.query(Employee).filter(Employee.id == emp_id).first()
            leave = LeaveApplication(
                employee_id=emp_id,
                leave_type_id=leave_type.id,
                organization_id=emp.organization_id if emp else None,
                company_id=getattr(emp, 'company_id', None) if emp else None,
                department_id=getattr(emp, 'department_id', None) if emp else None,
                start_date=datetime.combine(rec_date, datetime.min.time()),
                end_date=datetime.combine(rec_date, datetime.min.time()),
                total_days=1,
                status="approved",
                approved_at=ist_now_naive(),
                approver_id=current_user.id,
                reason="Marked from attendance quick action",
                is_paid=True,
                is_half_day=(data.status or "").lower() in ("half_day", "half day"),
            )
            db.add(leave)
            db.flush()
            leave_application_id = leave.id
            linked_leaves += 1

        if existing:
            old_status = existing.status
            existing.status = data.status
            existing.is_manual_entry = True
            existing.approved_by = current_user.id
            if leave_type is not None:
                existing.is_on_leave = True
                existing.leave_application_id = leave_application_id
            log = AttendanceAuditLog(
                attendance_id=existing.id,
                employee_id=emp_id,
                action="status_changed",
                previous_values={"status": old_status},
                new_values={"status": data.status},
                changed_fields=["status"],
                action_by=current_user.id,
                action_source="web",
                reason="Bulk mark",
            )
            db.add(log)
            updated += 1
        else:
            dt = dateparser.parse(date_str)
            att = Attendance(
                employee_id=emp_id,
                date=dt,
                status=data.status,
                is_manual_entry=True,
                approved_by=current_user.id,
                sync_status="synced",
                is_on_leave=leave_type is not None,
                leave_application_id=leave_application_id,
            )
            db.add(att)
            db.flush()
            log = AttendanceAuditLog(
                attendance_id=att.id,
                employee_id=emp_id,
                action="created",
                previous_values={},
                new_values={"status": data.status, "date": date_str},
                changed_fields=["status", "date"],
                action_by=current_user.id,
                action_source="web",
                reason="Bulk mark",
            )
            db.add(log)
            created += 1
    db.commit()
    msg = f"Marked {created + updated} records as {data.status}"
    if linked_leaves:
        msg += f" and linked {linked_leaves} leave application(s)"
    return {"message": msg, "created": created, "updated": updated, "linked_leaves": linked_leaves}


@router.post("/api/attendance/bulk-delete", tags=["Attendance"])
def bulk_delete_attendance(
    data: BulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = 0
    for rec in data.records:
        emp_id = rec.get("employeeId")
        date_str = rec.get("date")
        if not emp_id or not date_str:
            continue
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, emp_id, current_user.organization_id)
        att = db.query(Attendance).filter(Attendance.deleted_at.is_(None),
            Attendance.employee_id == emp_id,
            func.date(Attendance.date) == dateparser.parse(date_str).date(),
        ).first()
        if not att:
            continue
        log = AttendanceAuditLog(
            attendance_id=att.id,
            employee_id=emp_id,
            action="deleted",
            previous_values={"status": att.status, "date": str(att.date)},
            new_values={},
            changed_fields=["deleted_at"],
            action_by=current_user.id,
            action_source="web",
            reason="Bulk delete",
        )
        db.add(log)
        att.deleted_at = ist_now_naive()
        deleted += 1
    db.commit()
    return {"message": f"{deleted} attendance records deleted", "deleted": deleted}


@router.post("/api/attendance/resolve-conflict", tags=["Attendance"])
def resolve_attendance_conflict(
    resolution_data: ConflictResolutionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(Attendance).filter(Attendance.deleted_at.is_(None), Attendance.id == resolution_data.attendanceId).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if current_user.role != "superadmin":
        org_owned(att, current_user.organization_id)
    att.conflict_resolution_status = resolution_data.resolutionAction
    att.sync_status = "synced"
    db.commit()
    return {"message": "Conflict resolved", "attendance_id": resolution_data.attendanceId}


@router.get("/api/attendance/logs", tags=["Attendance"])
def get_attendance_audit_logs(
    attendanceId: Optional[int] = None,
    employeeId: Optional[int] = None,
    date: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AttendanceAuditLog).join(Attendance, Attendance.id == AttendanceAuditLog.attendance_id)
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Attendance.organization_id == current_user.organization_id)
    if attendanceId:
        query = query.filter(AttendanceAuditLog.attendance_id == attendanceId)
    if employeeId:
        query = query.filter(AttendanceAuditLog.employee_id == employeeId)
    if date:
        try:
            day = datetime.strptime(date, "%Y-%m-%d").date()
            query = query.filter(func.date(Attendance.date) == day)
        except Exception:
            pass
    logs = query.order_by(AttendanceAuditLog.created_at.desc()).limit(limit).all()
    result = []
    for log in logs:
        actor = db.query(User).filter(User.deleted_at.is_(None), User.id == log.action_by).first()
        att = db.query(Attendance).filter(Attendance.id == log.attendance_id).first()
        result.append({
            "id": log.id,
            "attendanceId": log.attendance_id,
            "employeeId": log.employee_id,
            "date": att.date.strftime("%Y-%m-%d") if att and att.date else None,
            "action": log.action,
            "previousValues": log.previous_values,
            "newValues": log.new_values,
            "changedFields": log.changed_fields,
            "actionBy": log.action_by,
            "actorName": f"{actor.full_name} ({actor.email})" if actor else "System",
            "reason": log.reason,
            "createdAt": _ist_iso(log.created_at),
        })
    return result


@router.post("/api/attendance/bulk-upload", tags=["Attendance"])
def bulk_upload_attendance(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    content = file.file.read()
    reader = csv.DictReader(io.StringIO(content.decode()))
    count = 0
    for row in reader:
        emp_id = int(row.get("employeeId", 0))
        if current_user.role != "superadmin":
            get_employee_in_org(db, Employee, emp_id, current_user.organization_id)
        att = Attendance(
            employee_id=emp_id,
            organization_id=current_user.organization_id,
            check_in=row.get("checkIn"),
            check_out=row.get("checkOut"),
            status=row.get("status", "present"),
            work_hours=float(row.get("workHours", 0)) if row.get("workHours") else None,
            is_manual_entry=True,
        )
        db.add(att)
        db.flush()
        log = AttendanceAuditLog(
            attendance_id=att.id,
            employee_id=att.employee_id,
            action="created",
            previous_values={},
            new_values={"status": att.status},
            changed_fields=["status"],
            action_by=current_user.id,
            action_source="web",
            reason="Bulk upload",
        )
        db.add(log)
        count += 1
    db.commit()
    return {"message": f"{count} records uploaded", "count": count}


# ============== ATTENDANCE CORRECTION REQUESTS ==============

@router.get("/api/attendance/correction-requests", tags=["Attendance"])
def get_correction_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AttendanceCorrectionRequest).filter(
        AttendanceCorrectionRequest.deleted_at.is_(None),
    )
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        query = query.filter(AttendanceCorrectionRequest.employee_id == _get_employee_id_for_user(db, current_user))
    if status:
        query = query.filter(AttendanceCorrectionRequest.status == status)
    requests = query.order_by(AttendanceCorrectionRequest.created_at.desc()).all()
    result = []
    for req in requests:
        emp = db.query(Employee).filter(Employee.id == req.employee_id).first()
        reviewer = db.query(User).filter(User.id == req.reviewed_by).first() if req.reviewed_by else None
        result.append({
            "id": req.id,
            "employeeId": req.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}" if emp else None,
            "attendanceId": req.attendance_id,
            "requestDate": req.request_date.strftime("%Y-%m-%d") if req.request_date else None,
            "requestedCheckIn": req.requested_check_in.isoformat() if req.requested_check_in else None,
            "requestedCheckOut": req.requested_check_out.isoformat() if req.requested_check_out else None,
            "requestedStatus": req.requested_status,
            "requestedWorkHours": req.requested_work_hours,
            "reason": req.reason,
            "status": req.status,
            "reviewedBy": req.reviewed_by,
            "reviewerName": f"{reviewer.full_name} ({reviewer.email})" if reviewer else None,
            "reviewedAt": req.reviewed_at.isoformat() if req.reviewed_at else None,
            "reviewComments": req.review_comments,
            "createdAttendanceId": req.created_attendance_id,
            "createdAt": req.created_at.isoformat() if req.created_at else None,
            "updatedAt": req.updated_at.isoformat() if req.updated_at else None,
        })
    return result


@router.post("/api/attendance/correction-requests", tags=["Attendance"])
def create_correction_request(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee_id = _get_employee_id_for_user(db, current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee profile not found")
    req_date = dateparser.parse(data.get("requestDate", "")) if data.get("requestDate") else ist_now_naive()
    if req_date is None:
        raise HTTPException(status_code=400, detail="Invalid request date")
    req = AttendanceCorrectionRequest(
        employee_id=employee_id,
        organization_id=current_user.organization_id,
        attendance_id=data.get("attendanceId"),
        request_date=req_date,
        requested_check_in=dateparser.parse(data["requestedCheckIn"]) if data.get("requestedCheckIn") else None,
        requested_check_out=dateparser.parse(data["requestedCheckOut"]) if data.get("requestedCheckOut") else None,
        requested_status=data.get("requestedStatus"),
        requested_work_hours=data.get("requestedWorkHours"),
        reason=data.get("reason", ""),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"message": "Correction request submitted", "id": req.id}


@router.put("/api/attendance/correction-requests/{request_id}/approve", tags=["Attendance"])
def approve_correction_request(
    request_id: int,
    payload: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = db.query(AttendanceCorrectionRequest).filter(
        AttendanceCorrectionRequest.id == request_id,
        AttendanceCorrectionRequest.deleted_at.is_(None),
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    employee = db.query(Employee).filter(Employee.id == req.employee_id).first()
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        if not employee or employee.company_id and employee.branch_id:
            pass
    req.status = "approved"
    req.reviewed_by = current_user.id
    req.reviewed_at = ist_now_naive()
    req.review_comments = (payload or {}).get("comments")
    att = Attendance(
        employee_id=req.employee_id,
        organization_id=req.organization_id,
        company_id=req.company_id,
        branch_id=req.branch_id,
        department_id=req.department_id,
        date=req.request_date,
        check_in=req.requested_check_in,
        check_out=req.requested_check_out,
        status=req.requested_status or "present",
        work_hours=req.requested_work_hours or 0,
        is_manual_entry=True,
        approved_by=current_user.id,
        sync_status="synced",
        reason=req.reason,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    req.created_attendance_id = att.id
    db.add(AttendanceAuditLog(
        attendance_id=att.id,
        employee_id=req.employee_id,
        action="created",
        previous_values={},
        new_values={
            "date": att.date.isoformat() if att.date else None,
            "checkIn": att.check_in.isoformat() if att.check_in else None,
            "checkOut": att.check_out.isoformat() if att.check_out else None,
            "status": att.status,
        },
        changed_fields=["status", "checkIn", "checkOut"],
        action_by=current_user.id,
        action_source="web",
        reason=f"Approved correction request {req.id}: {req.reason}",
    ))
    db.commit()
    return {"message": "Correction request approved", "attendanceId": att.id}


@router.put("/api/attendance/correction-requests/{request_id}/reject", tags=["Attendance"])
def reject_correction_request(
    request_id: int,
    payload: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = db.query(AttendanceCorrectionRequest).filter(
        AttendanceCorrectionRequest.id == request_id,
        AttendanceCorrectionRequest.deleted_at.is_(None),
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    req.status = "rejected"
    req.reviewed_by = current_user.id
    req.reviewed_at = ist_now_naive()
    req.review_comments = (payload or {}).get("comments")
    db.commit()
    return {"message": "Correction request rejected"}

