"""HRMS API announcements routes."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.cache import cached
from core.schemas import NotificationCreate, NotificationSettingsUpdate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BulkDeleteRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationResponse, BonusCreate, BonusResponse
from core.shared import RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org, get_header_company_id
from database import Base, SessionLocal, engine, get_db, get_read_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Announcements"])


@cached(ttl=60)
@router.get("/api/announcements", tags=["Announcements"])
def get_announcements(
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    if companyId is None and request is not None:
        companyId = get_header_company_id(request)
    query = db.query(Notification).filter(Notification.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(Notification.organization_id == current_user.organization_id)
        if companyId:
            validate_company_in_org(db, Company, companyId, current_user.organization_id)
    elif organizationId:
        query = query.filter(Notification.organization_id == organizationId)
    if companyId:
        query = query.filter(Notification.company_id == companyId)
    return query.order_by(Notification.created_at.desc()).limit(200).all()


@router.post("/api/announcements", tags=["Announcements"])
def create_announcement(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    notification = Notification(
        user_id=current_user.id,
        title=data.get("title", ""),
        body=data.get("body", ""),
        type=data.get("type", "announcement"),
        reference_id=data.get("referenceId"),
        data=data.get("data"),
        organization_id=current_user.organization_id,
        company_id=data.get("companyId"),
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return {"message": "Announcement created", "id": notification.id}


@router.put("/api/announcements/{announcement_id}", tags=["Announcements"])
def update_announcement(
    announcement_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    notification = db.query(Notification).filter(Notification.id == announcement_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Announcement not found")
    notification.title = data.get("title", notification.title)
    notification.body = data.get("body", notification.body)
    notification.type = data.get("type", notification.type)
    notification.reference_id = data.get("referenceId", notification.reference_id)
    notification.data = data.get("data", notification.data)
    db.commit()
    return {"message": "Announcement updated", "id": notification.id}


@router.delete("/api/announcements/{announcement_id}", tags=["Announcements"])
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    notification = db.query(Notification).filter(Notification.id == announcement_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Announcement not found")
    notification.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Announcement deleted", "id": announcement_id}
