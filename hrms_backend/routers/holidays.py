"""HRMS API holidays routes."""
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
from core.schemas import (HolidayCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org, get_header_company_id
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from database import Base, SessionLocal, engine, get_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from core.datetime_utils import ist_now_naive, ist_year
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Holidays"])




@cached(ttl=300)
@router.get("/api/holidays", tags=["Holidays"])
def get_holidays(
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    companyId = resolve_company_scope(db, current_user, companyId, request)
    query = db.query(Holiday).filter(Holiday.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(Holiday.organization_id == current_user.organization_id)
        if companyId:
            validate_company_in_org(db, Company, companyId, current_user.organization_id)
    elif organizationId:
        query = query.filter(Holiday.organization_id == organizationId)
    if companyId:
        # Strict company match: org-wide rows are NOT shared (admins see all by passing nothing).
        query = query.filter(Holiday.company_id == companyId)
    if year:
        query = query.filter(Holiday.year == year)
    else:
        # Default to the current year — holidays are viewed per-year and this
        # keeps the response small even with millions of historical records.
        query = query.filter(Holiday.year == ist_year())
    return query.order_by(Holiday.date).limit(500).all()


@router.post("/api/holidays", tags=["Holidays"])
def create_holiday(
    holiday_data: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(holiday_data.model_dump())
    if current_user.role != "superadmin":
        data["organization_id"] = current_user.organization_id
        validate_company_in_org(db, Company, data.get("company_id"), current_user.organization_id)
    else:
        # Tenant isolation: superadmin must target an existing org explicitly.
        if not data.get("organization_id"):
            raise HTTPException(status_code=400, detail="organization_id is required for superadmin")
        if not db.query(Organization).filter(Organization.id == data["organization_id"]).first():
            raise HTTPException(status_code=404, detail="Organization not found")
        validate_company_in_org(db, Company, data.get("company_id"), data["organization_id"])
    # Company isolation: holidays can only be created inside your own company
    # (org-wide holidays carry company_id NULL and stay visible to all).
    if data.get("company_id") not in (None, "", 0):
        data["company_id"] = require_write_company(db, current_user, data.get("company_id"))
    # Duplicate holidays on the same date+scope would double-credit nothing
    # (payroll guards by date) but pollute calendars — reject them.
    _dup = db.query(Holiday.id).filter(
        Holiday.deleted_at.is_(None),
        Holiday.organization_id == data.get("organization_id"),
        Holiday.company_id == data.get("company_id"),
        Holiday.date == data.get("date"),
    ).first()
    if _dup:
        raise HTTPException(status_code=400, detail="Holiday already exists for this date and company")
    h = Holiday(**data)
    db.add(h)
    db.commit()
    db.refresh(h)
    invalidate_cache("hrms:tenant:*")
    return h


@router.post("/api/holidays/sync-attendance", tags=["Holidays"])
def sync_holidays_to_attendance(
    month: int,
    year: int,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.holiday_sync_service import sync_all_holidays_for_month
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization required")
    companyId = resolve_company_scope(db, current_user, companyId)
    results = sync_all_holidays_for_month(db, org_id, year, month, company_id=companyId)
    created = sum(r.get("created", 0) for r in results)
    return {"message": f"Synced {created} holiday attendance records", "count": created, "results": results}


@router.put("/api/holidays/{holiday_id}", tags=["Holidays"])
def update_holiday(
    holiday_id: int,
    holiday_data: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    h = db.query(Holiday).filter(Holiday.deleted_at.is_(None), Holiday.id == holiday_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
    if current_user.role != "superadmin":
        org_owned(h, current_user.organization_id)
    assert_company_allowed(db, current_user, h.company_id)
    from utils.helpers import camel_to_snake
    for key, val in holiday_data.model_dump(exclude_unset=True).items():
        if key in ("organizationId", "companyId"):
            continue
        col = camel_to_snake(key)
        if hasattr(h, col):
            setattr(h, col, val)
    db.commit()
    db.refresh(h)
    invalidate_cache("hrms:tenant:*")
    return h


@router.delete("/api/holidays/{holiday_id}", tags=["Holidays"])
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    h = db.query(Holiday).filter(Holiday.deleted_at.is_(None), Holiday.id == holiday_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
    if current_user.role != "superadmin":
        org_owned(h, current_user.organization_id)
    assert_company_allowed(db, current_user, h.company_id)
    # Remove the attendance records that were auto-synced for this holiday, so a
    # cancelled holiday no longer counts as a paid present day for its employees.
    from services.holiday_sync_service import remove_holiday_attendance
    remove_holiday_attendance(db, h)
    db.delete(h)
    db.commit()
    invalidate_cache("hrms:tenant:*")
    return {"message": "Holiday deleted"}


@router.get("/api/holidays/export", tags=["Holidays"])
def export_holidays(
    companyId: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    query = db.query(Holiday).filter(Holiday.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(Holiday.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(Holiday.company_id == companyId)
    if year:
        query = query.filter(Holiday.year == year)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "date", "type", "description", "isPaid"])
    for h in query.all():
        writer.writerow([h.name, h.date, h.type, h.description, h.is_paid])

    log = ReportExecutionLog(
        schedule_id=None,
        report_name="Holidays",
        status="completed",
        format="csv",
        execution_time=ist_now_naive(),
        created_by=current_user.id,
    )
    db.add(log)
    db.commit()

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=holidays.csv"},
    )


@router.post("/api/holidays/import", tags=["Holidays"])
async def import_holidays(
    companyId: int,
    year: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    if current_user.role != "superadmin":
        validate_company_in_org(db, Company, companyId, current_user.organization_id)
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode()))
    count = 0
    skipped = 0
    for row in reader:
        name = row.get("name")
        date = row.get("date")
        existing = db.query(Holiday).filter(
            Holiday.name == name,
            Holiday.date == date,
            Holiday.company_id == companyId,
            Holiday.organization_id == current_user.organization_id,
        ).first()
        if existing:
            skipped += 1
            continue
        h = Holiday(
            name=name,
            date=date,
            type=row.get("type", "public"),
            description=row.get("description", ""),
            company_id=companyId,
            organization_id=current_user.organization_id,
            year=year,
            is_paid=row.get("isPaid", "true").lower() == "true",
        )
        db.add(h)
        count += 1
    db.commit()
    msg = f"{count} holidays imported"
    if skipped:
        msg += f", {skipped} skipped (already exist)"
    return {"message": msg, "count": count}

