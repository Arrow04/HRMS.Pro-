"""HRMS API companies routes."""
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
from core.schemas import (CompanyCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from database import Base, SessionLocal, engine, get_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Companies"])


def _save_logo(logo: Optional[str], company_id: Optional[int] = None) -> Optional[str]:
    """If the logo is a base64 data URL, persist it as a file and return its URL path.
    If it's already a normal URL/path, return it unchanged. Empty values -> None."""
    if not logo:
        return None
    if not logo.startswith("data:"):
        return logo

    try:
        header, b64 = logo.split(",", 1)
        ext = "png"
        mime = header.split(";")[0].split(":")[1] if ":" in header else ""
        if mime == "image/jpeg" or mime == "image/jpg":
            ext = "jpg"
        elif mime == "image/png":
            ext = "png"
        elif mime == "image/webp":
            ext = "webp"
        elif mime == "image/gif":
            ext = "gif"
        raw = base64.b64decode(b64)
    except Exception:
        return None

    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads", "logos")
    os.makedirs(uploads_dir, exist_ok=True)
    fname = f"company_{company_id or uuid.uuid4().hex[:8]}_{uuid.uuid4().hex[:8]}.{ext}"
    fpath = os.path.join(uploads_dir, fname)
    with open(fpath, "wb") as f:
        f.write(raw)
    return f"/uploads/logos/{fname}"




@router.get("/api/branches/{branch_id}/context")
async def get_branch_context(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get branch context with weather/time info."""
    branch = db.query(Branch).filter(Branch.deleted_at.is_(None), Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    now = datetime.utcnow()
    return {
        "branch": {"id": branch.id, "name": branch.name, "location": branch.location},
        "currentTime": now.isoformat(),
        "currentDate": now.strftime("%Y-%m-%d"),
        "timezone": "UTC",
        "alerts": [],
    }


@router.get("/api/organizations/{org_id}/companies", tags=["Companies"])
def get_companies_for_org(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.organization_id and org_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized for this organization")
    return db.query(Company).filter(Company.deleted_at.is_(None), Company.organization_id == org_id).all()


@router.get("/api/companies", tags=["Companies"])
def get_all_companies(
    search: Optional[str] = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Company).filter(Company.deleted_at.is_(None))
    if current_user.organization_id:
        query = query.filter(Company.organization_id == current_user.organization_id)
    if active_only:
        query = query.filter(Company.status == "active")
    if search:
        query = query.filter(Company.name.ilike(f"%{search}%"))
    return query.all()


@router.get("/api/department-head-candidates", tags=["Companies"])
def get_department_head_candidates(
    company_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight list of active employees for the department-head picker.
    Supports an optional company_id filter. Unpaginated so the search works
    across the whole org (not just the first page of /employees)."""
    query = (
        db.query(Employee)
        .filter(
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        )
    )
    if current_user.organization_id:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    if company_id:
        query = query.filter(Employee.company_id == company_id)
    employees = query.order_by(Employee.first_name, Employee.last_name).limit(500).all()
    return [
        {
            "id": emp.id,
            "firstName": emp.first_name or "",
            "lastName": emp.last_name or "",
            "employeeCode": emp.employee_code or "",
            "companyId": emp.company_id,
        }
        for emp in employees
    ]


@router.post("/api/companies", tags=["Companies"])
def create_company(
    company: CompanyCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(company.model_dump())
    logo = data.pop("logo", None) or company.logo
    comp = Company(**data)
    comp.organization_id = current_user.organization_id
    db.add(comp)
    db.flush()
    comp.logo = _save_logo(logo, comp.id) or comp.logo
    db.commit()
    db.refresh(comp)
    return comp


@router.put("/api/companies/{company_id}", tags=["Companies"])
def update_company(
    company_id: int,
    company_data: CompanyCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = db.query(Company).filter(Company.deleted_at.is_(None), Company.id == company_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    allowed_fields = {
        "name", "code", "description", "registration_number", "tax_id",
        "industry", "company_size", "address", "website", "email",
        "phone", "logo", "status", "country",
    }
    for key, val in company_data.model_dump(exclude_unset=True).items():
        if key in allowed_fields:
            if key == "logo":
                val = _save_logo(val, company_id)
            setattr(comp, key, val)
    db.commit()
    db.refresh(comp)
    return comp


@router.delete("/api/companies/{company_id}", tags=["Companies"])
def delete_company(
    company_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = db.query(Company).filter(Company.deleted_at.is_(None), Company.id == company_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Company not found")
    comp.status = "inactive"
    db.commit()
    return {"message": "Company deactivated"}


@router.get("/api/companies/count", tags=["Companies"])
def get_companies_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"count": db.query(Company).filter(Company.deleted_at.is_(None)).count()}


@router.get("/api/branches/count", tags=["Branches"])
def get_branches_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"count": db.query(Branch).filter(Branch.deleted_at.is_(None)).count()}


@router.get("/api/departments/count", tags=["Departments"])
def get_departments_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"count": db.query(Department).filter(Department.deleted_at.is_(None)).count()}


@router.get("/api/designations/count", tags=["Designations"])
def get_designations_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"count": db.query(Designation).filter(Designation.deleted_at.is_(None)).count()}

