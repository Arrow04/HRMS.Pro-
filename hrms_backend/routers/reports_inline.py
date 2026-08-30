"""HRMS API reports routes."""
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
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import case, event, func, inspect, or_, text
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, with_loader_criteria

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import (UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.datetime_utils import ist_now_naive
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from database import Base, SessionLocal, engine, get_db
from models import (ActivityLog, Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, ReportSchedule, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

from routers.holidays import export_holidays

router = APIRouter(tags=["Reports"])




@router.get("/api/reports/overview", tags=["Reports"])
def get_reports_overview(
    period: Optional[str] = "month",
    branch: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = current_user.organization_id
    emp_query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if org_id:
        emp_query = emp_query.filter(Employee.organization_id == org_id)

    total_employees = emp_query.filter(Employee.deleted_at.is_(None)).count()
    active_employees = emp_query.filter(Employee.status == "active").count()

    now = ist_now_naive()
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    next_month = now.month % 12 + 1
    month_end = now.replace(month=next_month, day=1) - timedelta(days=1)
    month_end_str = month_end.strftime("%Y-%m-%d")

    attendance_q = db.query(Attendance).filter(
        Attendance.deleted_at.is_(None),
        Attendance.check_in >= month_start,
        Attendance.check_in <= month_end_str,
    )
    leaves_q = db.query(LeaveApplication).filter(
        LeaveApplication.deleted_at.is_(None),
        LeaveApplication.created_at >= month_start,
        LeaveApplication.created_at <= month_end_str,
    )
    if current_user.role != "superadmin" and org_id:
        attendance_q = attendance_q.filter(Attendance.organization_id == org_id)
        leaves_q = leaves_q.filter(LeaveApplication.organization_id == org_id)
    attendance_month = attendance_q.count()
    leaves_month = leaves_q.count()

    return {
        "totalEmployees": total_employees,
        "activeEmployees": active_employees,
        "attendanceThisMonth": attendance_month,
        "leavesThisMonth": leaves_month,
        "period": period,
    }


@router.get("/api/reports/live", tags=["Reports"])
def get_reports_live(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = ist_now_naive().strftime("%Y-%m-%d")
    active_q = db.query(User).filter(User.is_active == True)
    checked_in_q = db.query(Attendance).filter(
        Attendance.deleted_at.is_(None),
        func.date(Attendance.check_in) == today,
        Attendance.check_out.is_(None),
    )
    if current_user.role != "superadmin" and current_user.organization_id:
        active_q = active_q.filter(User.organization_id == current_user.organization_id)
        checked_in_q = checked_in_q.filter(Attendance.organization_id == current_user.organization_id)
    active_users = active_q.count()
    checked_in = checked_in_q.count()

    return {
        "activeUsers": active_users,
        "currentlyCheckedIn": checked_in,
        "timestamp": ist_now_naive().isoformat(),
    }


@router.get("/api/activity-logs", tags=["Reports"])
def get_activity_logs(
    module: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AuditLog)
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(AuditLog.organization_id == current_user.organization_id)
    if module:
        query = query.filter(AuditLog.entity_type == module)
    if action:
        query = query.filter(AuditLog.action == action)
    return query.order_by(AuditLog.created_at.desc()).limit(limit).all()


@router.get("/api/entity-history", tags=["Reports"])
def get_entity_history(
    entityType: str,
    entityId: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return change history for a single record: who changed what and when."""
    # Query both audit tables (audit_logs for system-level, activity_logs for module-level)
    audit_q = db.query(AuditLog).filter(
        AuditLog.entity_type == entityType,
        AuditLog.entity_id == str(entityId),
    )
    activity_q = db.query(ActivityLog).filter(
        ActivityLog.entity_type == entityType,
        ActivityLog.entity_id == str(entityId),
    )
    if current_user.role != "superadmin" and current_user.organization_id:
        audit_q = audit_q.filter(AuditLog.organization_id == current_user.organization_id)
        activity_q = activity_q.join(User, User.id == ActivityLog.user_id).filter(User.organization_id == current_user.organization_id)

    audit_logs = audit_q.all()
    activity = activity_q.all()

    result = []
    for log in audit_logs:
        user = db.query(User).filter(User.id == log.user_id, User.deleted_at.is_(None)).first() if log.user_id else None
        result.append({
            "id": f"a{log.id}",
            "action": log.action,
            "module": log.module,
            "entityType": log.entity_type,
            "entityId": log.entity_id,
            "userName": log.user_name or (user.full_name if user else "System"),
            "userEmail": user.email if user else None,
            "changes": log.changes or {},
            "oldValues": log.old_values or {},
            "newValues": log.new_values or {},
            "ipAddress": log.ip_address,
            "createdAt": log.created_at.isoformat() if log.created_at else None,
        })

    for log in activity:
        user = db.query(User).filter(User.id == log.user_id, User.deleted_at.is_(None)).first() if log.user_id else None
        old_val = {}
        new_val = {}
        if log.old_value:
            old_val["value"] = log.old_value
        if log.new_value:
            new_val["value"] = log.new_value
        result.append({
            "id": f"b{log.id}",
            "action": log.action,
            "module": log.module,
            "entityType": log.entity_type,
            "entityId": log.entity_id,
            "userName": user.full_name if user else "System",
            "userEmail": user.email if user else None,
            "changes": {},
            "oldValues": old_val,
            "newValues": new_val,
            "ipAddress": log.ip_address,
            "createdAt": log.created_at.isoformat() if log.created_at else None,
        })

    result.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return result[:50]


@router.get("/api/reports/employees", tags=["Reports"])
def export_employee_report(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(Employee.company_id == companyId)
    employees = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "firstName", "lastName", "email", "designation", "status", "phone"])
    for e in employees:
        writer.writerow([e.id, e.first_name, e.last_name, e.email, e.designation, e.status, e.phone])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employees.csv"},
    )


@router.get("/api/reports/attendance", tags=["Reports"])
def export_attendance_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    query = db.query(Attendance).filter(Attendance.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Attendance.organization_id == current_user.organization_id)
    if month:
        query = query.filter(func.extract("month", Attendance.check_in) == month)
    if year:
        query = query.filter(func.extract("year", Attendance.check_in) == year)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "employeeId", "checkIn", "checkOut", "status", "workHours"])
    for a in query.all():
        writer.writerow([a.id, a.employee_id, a.check_in, a.check_out, a.status, a.work_hours])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance.csv"},
    )


@router.get("/api/reports/payroll", tags=["Reports"])
def export_payroll_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    query = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Payroll.organization_id == current_user.organization_id)
    if month:
        query = query.filter(Payroll.month == month)
    if year:
        query = query.filter(Payroll.year == year)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "employeeId", "month", "year", "grossSalary", "netSalary", "status"])
    for p in query.all():
        writer.writerow([p.id, p.employee_id, p.month, p.year, p.gross_salary, p.net_salary, p.status])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=payroll.csv"},
    )


@router.get("/api/reports/holidays", tags=["Reports"])
def export_holiday_report(
    year: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return export_holidays(companyId, year, db, current_user)


@router.get("/api/reports/leaves", tags=["Reports"])
def export_leave_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    query = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(LeaveApplication.organization_id == current_user.organization_id)
    if month:
        query = query.filter(func.extract("month", LeaveApplication.created_at) == month)
    if year:
        query = query.filter(func.extract("year", LeaveApplication.created_at) == year)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "employeeId", "leaveTypeId", "startDate", "endDate", "status", "reason"])
    for lv in query.all():
        writer.writerow([lv.id, lv.employee_id, lv.leave_type_id, lv.start_date, lv.end_date, lv.status, lv.reason])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leaves.csv"},
    )


@router.get("/api/reports/expenses", tags=["Reports"])
def export_expense_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    query = db.query(Expense).filter(Expense.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Expense.organization_id == current_user.organization_id)
    if month:
        query = query.filter(func.extract("month", Expense.created_at) == month)
    if year:
        query = query.filter(func.extract("year", Expense.created_at) == year)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "employeeId", "category", "amount", "status", "expenseDate"])
    for e in query.all():
        writer.writerow([e.id, e.employee_id, e.category, e.amount, e.status, e.expense_date])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses.csv"},
    )


@router.post("/api/reports/schedule", tags=["Reports"])
def create_report_schedule(
    schedule_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import uuid
    from datetime import time as dtime
    from datetime import timedelta

    report_name = schedule_data.get("report") or schedule_data.get("reportName") or "Report"
    frequency = schedule_data.get("frequency") or "monthly"
    run_time_str = schedule_data.get("runTime") or "09:00"
    recipients = schedule_data.get("email") or schedule_data.get("recipients") or ""

    # parse run time (HH:MM) -> Time
    try:
        hh, mm = run_time_str.split(":")
        run_time = dtime(int(hh), int(mm))
    except Exception:
        run_time = dtime(9, 0)

    schedule = ReportSchedule(
        id=str(uuid.uuid4()),
        report_name=report_name,
        frequency=frequency,
        run_time=run_time,
        day_of_week=schedule_data.get("dayOfWeek"),
        day_of_month=schedule_data.get("dayOfMonth"),
        recipients=recipients,
        format=schedule_data.get("format") or "PDF",
        email_subject=schedule_data.get("subject"),
        include_body=schedule_data.get("includeBody", False),
        next_run=ist_now_naive() + timedelta(days=1),
        enabled=True,
        created_by=current_user.id,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return {"message": "Report schedule created", "id": schedule.id, "schedule_id": schedule.id}


@router.get("/api/reports/schedules", tags=["Reports"])
def get_scheduled_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedules_q = db.query(ReportSchedule)
    if current_user.role != "superadmin":
        schedules_q = schedules_q.filter(ReportSchedule.created_by == current_user.id)
    schedules = schedules_q.order_by(ReportSchedule.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "schedule_id": s.id,
            "report": s.report_name,
            "reportName": s.report_name,
            "frequency": s.frequency,
            "runTime": s.run_time.strftime("%H:%M") if s.run_time else "09:00",
            "dayOfWeek": s.day_of_week,
            "dayOfMonth": s.day_of_month,
            "email": s.recipients,
            "recipients": s.recipients,
            "format": s.format,
            "subject": s.email_subject,
            "includeBody": s.include_body,
            "nextRun": s.next_run.isoformat() if s.next_run else None,
            "enabled": s.enabled,
            "createdAt": s.created_at.isoformat() if s.created_at else None,
        }
        for s in schedules
    ]


@router.put("/api/reports/schedules/{schedule_id}", tags=["Reports"])
def update_report_schedule(
    schedule_id: str,
    schedule_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = db.query(ReportSchedule).filter(ReportSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if current_user.role != "superadmin":
        _owner = db.query(User).filter(User.id == schedule.created_by).first()
        if schedule.created_by != current_user.id and not (_owner and _owner.organization_id == current_user.organization_id):
            raise HTTPException(status_code=404, detail="Schedule not found")

    if schedule_data.get("report"):
        schedule.report_name = schedule_data["report"]
    if schedule_data.get("frequency"):
        schedule.frequency = schedule_data["frequency"]
    if schedule_data.get("runTime"):
        try:
            hh, mm = schedule_data["runTime"].split(":")
            from datetime import time as dtime
            schedule.run_time = dtime(int(hh), int(mm))
        except Exception:
            pass
    if "dayOfWeek" in schedule_data:
        schedule.day_of_week = schedule_data.get("dayOfWeek")
    if "dayOfMonth" in schedule_data:
        schedule.day_of_month = schedule_data.get("dayOfMonth")
    if schedule_data.get("email"):
        schedule.recipients = schedule_data["email"]
    if schedule_data.get("format"):
        schedule.format = schedule_data["format"]
    if schedule_data.get("subject"):
        schedule.email_subject = schedule_data["subject"]
    if "includeBody" in schedule_data:
        schedule.include_body = schedule_data.get("includeBody", False)
    db.commit()
    db.refresh(schedule)
    return {"message": "Schedule updated", "id": schedule.id}


@router.delete("/api/reports/schedules/{schedule_id}", tags=["Reports"])
def delete_report_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = db.query(ReportSchedule).filter(ReportSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if current_user.role != "superadmin":
        _owner = db.query(User).filter(User.id == schedule.created_by).first()
        if schedule.created_by != current_user.id and not (_owner and _owner.organization_id == current_user.organization_id):
            raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(schedule)
    db.commit()
    return {"message": "Schedule deleted"}


@router.get("/api/reports/export-history", tags=["Reports"])
def get_report_export_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = (
        db.query(ReportExecutionLog)
        .filter(ReportExecutionLog.created_by == current_user.id)
        .order_by(ReportExecutionLog.execution_time.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": str(log.id),
            "schedule_id": str(log.schedule_id),
            "report_name": log.report_name,
            "status": log.status,
            "format": log.format,
            "file_path": log.file_path,
            "error_message": log.error_message,
            "execution_time": log.execution_time.isoformat() if log.execution_time else None,
            "created_by": log.created_by,
        }
        for log in logs
    ]


@router.post("/api/reports/schedules/{schedule_id}/run", tags=["Reports"])
def run_report_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = db.query(ReportSchedule).filter(ReportSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if current_user.role != "superadmin":
        _owner = db.query(User).filter(User.id == schedule.created_by).first()
        if schedule.created_by != current_user.id and not (_owner and _owner.organization_id == current_user.organization_id):
            raise HTTPException(status_code=404, detail="Schedule not found")
    # Record an execution log
    from datetime import timedelta
    log = ReportExecutionLog(
        schedule_id=schedule.id,
        report_name=schedule.report_name,
        status="in_progress",
        format=schedule.format,
        execution_time=ist_now_naive(),
        created_by=current_user.id,
    )
    db.add(log)
    # compute next run
    try:
        schedule.next_run = ist_now_naive() + timedelta(days=1)
    except Exception:
        pass
    db.commit()
    db.refresh(log)
    return {"message": "Report scheduled for execution", "schedule_id": schedule.id, "log_id": log.id}


@router.patch("/api/reports/schedules/{schedule_id}/toggle", tags=["Reports"])
def toggle_report_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = db.query(ReportSchedule).filter(ReportSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if current_user.role != "superadmin":
        _owner = db.query(User).filter(User.id == schedule.created_by).first()
        if schedule.created_by != current_user.id and not (_owner and _owner.organization_id == current_user.organization_id):
            raise HTTPException(status_code=404, detail="Schedule not found")
    schedule.enabled = not schedule.enabled
    db.commit()
    db.refresh(schedule)
    return {"message": "Schedule toggled", "enabled": schedule.enabled}


@router.get("/api/reports/overview/timeseries", tags=["Dashboard"])
def get_dashboard_timeseries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = ist_now_naive()
    months = []
    for i in range(6):
        m = now.month - i
        y = now.year
        if m <= 0:
            m += 12
            y -= 1
        months.append({"month": m, "year": y})
    months.reverse()

    data = []
    for entry in months:
        m, y = entry["month"], entry["year"]
        start = f"{y}-{m:02d}-01"
        last_day = calendar.monthrange(y, m)[1]
        end = f"{y}-{m:02d}-{last_day}"

        emp_q = db.query(Employee).filter(Employee.deleted_at.is_(None))
        att_q = db.query(Attendance).filter(Attendance.deleted_at.is_(None),
            Attendance.check_in >= start,
            Attendance.check_in <= end,
        )
        if current_user.role != "superadmin" and current_user.organization_id:
            emp_q = emp_q.filter(Employee.organization_id == current_user.organization_id)
            att_q = att_q.filter(Attendance.organization_id == current_user.organization_id)
        emp_count = emp_q.count()
        att_count = att_q.count()

        data.append({
            "month": m,
            "year": y,
            "label": f"{y}-{m:02d}",
            "employees": emp_count,
            "attendance": att_count,
        })

    return data

