"""HRMS API grievances routes."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.schemas import UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BulkDeleteRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse
from core.shared import RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org, get_header_company_id
from database import Base, SessionLocal, engine, get_db, get_read_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Grievances"])


@router.get("/api/grievances", tags=["Grievances"])
def get_grievances(
    status: Optional[str] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        employee_id = _get_employee_id_for_user(db, current_user)
        if not employee_id:
            raise HTTPException(status_code=400, detail="Employee profile not found")
        query = query.filter(Employee.id == employee_id)
    return query.order_by(Employee.created_at.desc()).limit(500).all()


@router.post("/api/grievances", tags=["Grievances"])
def create_grievance(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee_id = _get_employee_id_for_user(db, current_user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee profile not found")
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    notification = Notification(
        user_id=current_user.id,
        title=data.get("subject", "Grievance"),
        body=data.get("description", ""),
        type="grievance",
        reference_id=str(employee_id),
        data={"status": "open", "subject": data.get("subject", "")},
        organization_id=current_user.organization_id,
        company_id=employee.company_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return {"message": "Grievance submitted", "id": notification.id}


@router.put("/api/grievances/{grievance_id}", tags=["Grievances"])
def update_grievance(
    grievance_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    notification = db.query(Notification).filter(Notification.id == grievance_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Grievance not found")
    notification.data = {**(notification.data or {}), **data}
    db.commit()
    return {"message": "Grievance updated", "id": grievance_id}


@router.delete("/api/grievances/{grievance_id}", tags=["Grievances"])
def delete_grievance(
    grievance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "hr_admin", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    notification = db.query(Notification).filter(Notification.id == grievance_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Grievance not found")
    notification.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Grievance deleted", "id": grievance_id}
