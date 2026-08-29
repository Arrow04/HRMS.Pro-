"""HRMS API settings routes."""
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
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import case, event, func, inspect, or_, text
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, with_loader_criteria

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import (CompanyCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, logger, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from database import Base, SessionLocal, engine, get_db
from models import (ActivityLog, Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Settings"])




@router.get("/api/settings/theme", tags=["Settings"])
def get_theme(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = current_user.theme_settings or {}
    return {
        "primaryColor": settings.get("primaryColor", "#6366f1"),
        "isDarkMode": settings.get("isDarkMode", False),
        "glassIntensity": settings.get("glassIntensity", 0.1),
        "fontFamily": settings.get("fontFamily", "Inter"),
    }


@router.put("/api/settings/theme", tags=["Settings"])
def update_theme(
    theme: ThemeSettings,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.theme_settings = theme.model_dump()
    db.commit()
    return {"message": "Theme updated successfully"}


@router.get("/api/settings/general", tags=["Settings"])
def get_general_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.organization_id:
        return {}
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first()
    if not org:
        return {}
    return {
        "companyName": org.name,
        "companyEmail": org.email,
        "companyPhone": org.phone,
        "address": org.address,
        "timezone": org.timezone or "UTC",
        "language": org.language_preference or "en",
        "dateFormat": org.date_format or "DD/MM/YYYY",
        "currency": org.default_currency or "INR",
        "country": getattr(org, "country", None) or "India",
        "financialYear": (org.settings or {}).get("general", {}).get("financialYear", "April"),
        "geoFence": (org.settings or {}).get("general", {}).get("geoFence", True),
        "selfService": (org.settings or {}).get("general", {}).get("selfService", True),
        "docUploads": (org.settings or {}).get("general", {}).get("docUploads", True),
        "multiCompany": (org.settings or {}).get("general", {}).get("multiCompany", False),
        "autoEmails": (org.settings or {}).get("general", {}).get("autoEmails", False),
    }


@router.put("/api/settings/general", tags=["Settings"])
def update_general_settings(
    payload: GeneralSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.organization_id:
        org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first()
        if org:
            for key, val in payload.model_dump(exclude_unset=True).items():
                snake_key = next(iter(convert_camel_to_snake({key: val})), key)
                if snake_key == "currency":
                    snake_key = "default_currency"
                if snake_key == "company_name":
                    snake_key = "name"
                if snake_key == "language":
                    snake_key = "language_preference"
                if snake_key == "date_format":
                    snake_key = "date_format"
                if hasattr(org, snake_key):
                    setattr(org, snake_key, val)
                else:
                    # Persist non-column fields (financialYear, geoFence, selfService, docUploads, multiCompany) in settings JSON
                    settings = json.loads(json.dumps(org.settings or {}))
                    settings["general"] = {**(settings.get("general") or {}), **{key: val}}
                    org.settings = settings
            db.commit()
    return {"message": "General settings updated"}


@router.get("/api/settings/company", tags=["Settings"])
def get_company_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = current_user.organization_id
    company = db.query(Company).filter(Company.deleted_at.is_(None), Company.organization_id == org_id).first()
    if not company:
        return {}
    return {
        "companyName": company.name,
        "registrationNumber": company.registration_number,
        "taxId": company.tax_id,
        "industry": company.industry,
        "companySize": company.company_size,
        "address": company.address,
        "email": company.email,
        "phone": company.phone,
        "website": company.website,
    }


@router.put("/api/settings/company", tags=["Settings"])
def update_company_settings(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"message": "Company settings updated"}


@router.get("/api/settings/attendance", tags=["Settings"])
def get_attendance_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    defaults = {
        "checkInTime": "09:00",
        "checkOutTime": "18:00",
        "gracePeriod": 15,
        "halfDayCutoff": 4,
        "latePenalty": True,
        "enableGeofence": False,
        "enableSelfie": False,
        "enableOvertime": True,
        "geoFenceRadius": 100,
        "manualOverride": True,
        "weekendTracking": False,
        "workingDays": "0,1,2,3,4,5,6",
    }
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    settings = (org.settings or {}) if org else {}
    saved = settings.get("attendance", {})
    merged = {**defaults, **saved}

    policy = db.query(AttendancePolicy).filter(
        AttendancePolicy.organization_id == current_user.organization_id,
        AttendancePolicy.status == "active",
    ).order_by(AttendancePolicy.id.asc()).first()
    if policy and policy.working_days:
        merged["workingDays"] = policy.working_days
    return merged


@router.put("/api/settings/attendance", tags=["Settings"])
def update_attendance_settings(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    if not org:
        return {"message": "Attendance settings updated"}

    data = json.loads(json.dumps(org.settings or {}))
    incoming = {k: v for k, v in payload.items() if v is not None}
    data["attendance"] = {**(data.get("attendance") or {}), **incoming}

    # Persist workDays to the AttendancePolicy so the Attendance page picks it up
    if "workDays" in incoming or "workingDays" in incoming:
        wd = incoming.get("workDays", incoming.get("workingDays"))
        policy = db.query(AttendancePolicy).filter(
            AttendancePolicy.organization_id == current_user.organization_id,
            AttendancePolicy.status == "active",
        ).order_by(AttendancePolicy.id.asc()).first()
        if not policy:
            policy = AttendancePolicy(
                organization_id=current_user.organization_id,
                name="Default Attendance Policy",
                working_days_per_week=6,
            )
            db.add(policy)
            db.flush()
            if not org.default_attendance_policy_id:
                org.default_attendance_policy_id = policy.id
        if isinstance(wd, (list, tuple)):
            policy.working_days = ",".join(str(int(d) % 7) for d in wd)
            policy.working_days_per_week = len(wd)
        elif isinstance(wd, str) and wd.strip():
            policy.working_days = wd
            policy.working_days_per_week = len([x for x in wd.split(",") if x.strip()])

    org.settings = data
    db.commit()
    return {"message": "Attendance settings updated"}


@router.get("/api/settings/leave-policy", tags=["Settings"])
def get_leave_policy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    defaults = {
        "casual": "12",
        "sick": "10",
        "earned": "15",
        "maternity": "180",
        "carryForward": True,
        "encashment": False,
        "annualLeave": 18,
        "sickLeave": 12,
        "personalLeave": 6,
        "maxCarryForward": 10,
        "enableHalfDay": True,
        "enableMultiLevelApproval": True,
        "approvalLevels": 1,
    }
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    settings = (org.settings or {}) if org else {}
    return {**defaults, **(settings.get("leave") or {})}


@router.put("/api/settings/leave-policy", tags=["Settings"])
def update_leave_policy(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    if not org:
        return {"message": "Leave policy updated"}
    data = json.loads(json.dumps(org.settings or {}))
    data["leave"] = {**(data.get("leave") or {}), **payload}
    org.settings = data
    db.commit()
    return {"message": "Leave policy updated"}


@router.get("/api/settings/payroll", tags=["Settings"])
def get_payroll_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    defaults = {
        "cycle": "monthly",
        "payDay": "last-day",
        "pfPercent": "12",
        "esiPercent": "3.25",
        "autoPayslip": True,
        "emailPayslip": True,
        "payrollFrequency": "monthly",
        "currency": "INR",
        "enablePf": True,
        "pfPercentage": 12,
        "enableEsi": False,
        "esiPercentage": 1.75,
        "enableTaxDeduction": True,
        "payrollDay": 1,
    }
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    settings = (org.settings or {}) if org else {}
    return {**defaults, **(settings.get("payroll") or {})}


@router.put("/api/settings/payroll", tags=["Settings"])
def update_payroll_settings(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    if not org:
        return {"message": "Payroll settings updated"}
    data = json.loads(json.dumps(org.settings or {}))
    data["payroll"] = {**(data.get("payroll") or {}), **payload}
    org.settings = data
    db.commit()
    return {"message": "Payroll settings updated"}


@router.get("/api/settings/performance", tags=["Settings"])
def get_performance_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    defaults = {
        "reviewCycle": "half-yearly",
        "ratingScale": "1-5",
        "peerFeedback": True,
        "selfAppraisal": True,
        "enable360Feedback": True,
        "enableSelfReview": True,
        "enableGoalTracking": True,
    }
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    settings = (org.settings or {}) if org else {}
    return {**defaults, **(settings.get("performance") or {})}


@router.put("/api/settings/performance", tags=["Settings"])
def update_performance_settings(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    if not org:
        return {"message": "Performance settings updated"}
    data = json.loads(json.dumps(org.settings or {}))
    data["performance"] = {**(data.get("performance") or {}), **payload}
    org.settings = data
    db.commit()
    org.settings = data
    db.commit()
    return {"message": "Performance settings updated"}


DEFAULT_NOTIFICATION_SETTINGS = [
    {"event": "Leave request submitted", "inApp": True, "email": True, "sms": False},
    {"event": "Leave approved/rejected", "inApp": True, "email": True, "sms": True},
    {"event": "Payroll processed", "inApp": True, "email": True, "sms": False},
    {"event": "New employee onboarded", "inApp": True, "email": False, "sms": False},
    {"event": "Geo-fence violation", "inApp": True, "email": True, "sms": True},
    {"event": "Document expiry reminder", "inApp": True, "email": True, "sms": False},
]


@router.get("/api/settings/notifications", tags=["Settings"])
def get_notifications_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    settings = (org.settings or {}) if org else {}
    saved = settings.get("notifications")
    if isinstance(saved, list) and saved:
        return saved
    return DEFAULT_NOTIFICATION_SETTINGS


@router.put("/api/settings/notifications", tags=["Settings"])
def update_notifications_settings(
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    if not org:
        return {"message": "Notification settings updated"}
    data = json.loads(json.dumps(org.settings or {}))
    if isinstance(payload, dict) and "notifications" in payload:
        data["notifications"] = payload["notifications"]
    else:
        data["notifications"] = payload
    org.settings = data
    db.commit()
    return {"message": "Notification settings updated"}


@router.get("/api/settings/security", tags=["Settings"])
def get_security_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    defaults = {
        "deviceLock": False,
        "twoFactor": False,
        "sessionTimeout": True,
        "ipAllowlist": False,
        "allowedIPs": "",
        "twoFactorEnabled": False,
        "sessionTimeoutMinutes": 30,
        "passwordPolicy": "medium",
        "deviceVerification": False,
    }
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    settings = (org.settings or {}) if org else {}
    return {**defaults, **(settings.get("security") or {})}


@router.put("/api/settings/security", tags=["Settings"])
def update_security_settings(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    if not org:
        return {"message": "Security settings updated"}
    data = json.loads(json.dumps(org.settings or {}))
    data["security"] = {**(data.get("security") or {}), **payload}
    org.settings = data
    db.commit()
    return {"message": "Security settings updated"}


@router.get("/api/settings/integrations", tags=["Settings"])
def get_integrations_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    defaults = {
        "slack": False,
        "google": False,
        "payrollExport": False,
        "biometric": False,
        "slackEnabled": False,
        "googleCalendar": False,
        "zapierEnabled": False,
        "apiAccess": True,
    }
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    settings = (org.settings or {}) if org else {}
    return {**defaults, **(settings.get("integrations") or {})}


@router.put("/api/settings/integrations", tags=["Settings"])
def update_integrations_settings(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first() if current_user.organization_id else None
    if not org:
        return {"message": "Integration settings updated"}
    data = json.loads(json.dumps(org.settings or {}))
    data["integrations"] = {**(data.get("integrations") or {}), **payload}
    org.settings = data
    db.commit()
    return {"message": "Integration settings updated"}


# =============================================================================
# SCOPED CONFIGURATIONS (company / branch / department wise)
# Stored in org.settings["{domain}_configs"] as an array.
# domains: attendance, leave, payroll, performance
# =============================================================================

VALID_CONFIG_DOMAINS = {"attendance", "leave", "payroll", "performance"}


def _get_org(db, current_user):
    if not current_user.organization_id:
        return None
    return db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == current_user.organization_id).first()


def _configs_key(domain):
    return f"{domain}_configs"


@router.get("/api/settings/configs/{domain}", tags=["Settings"])
def list_configs(
    domain: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if domain not in VALID_CONFIG_DOMAINS:
        return []
    org = _get_org(db, current_user)
    if not org:
        return []
    data = org.settings or {}
    return data.get(_configs_key(domain), [])


@router.post("/api/settings/configs/{domain}", tags=["Settings"])
def create_config(
    domain: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if domain not in VALID_CONFIG_DOMAINS:
        return {"message": "Invalid domain"}
    org = _get_org(db, current_user)
    if not org:
        return {"message": "Could not save configuration"}
    data = json.loads(json.dumps(org.settings or {}))
    configs = list(data.get(_configs_key(domain), []))
    new_id = max([c.get("id", 0) for c in configs], default=0) + 1
    config = {"id": new_id}
    config.update({k: v for k, v in payload.items() if v is not None})
    configs.append(config)
    data[_configs_key(domain)] = configs
    org.settings = data
    db.commit()
    return config


@router.put("/api/settings/configs/{domain}/{config_id}", tags=["Settings"])
def update_config(
    domain: str,
    config_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if domain not in VALID_CONFIG_DOMAINS:
        return {"message": "Invalid domain"}
    org = _get_org(db, current_user)
    if not org:
        return {"message": "Could not update configuration"}
    data = json.loads(json.dumps(org.settings or {}))
    configs = list(data.get(_configs_key(domain), []))
    found = False
    for i, c in enumerate(configs):
        if c.get("id") == config_id:
            merged = {**c, **{k: v for k, v in payload.items() if v is not None}}
            merged["id"] = config_id
            configs[i] = merged
            found = True
            data[_configs_key(domain)] = configs
            org.settings = data
            db.commit()
            return merged
    if not found:
        return {"message": "Configuration not found"}


@router.delete("/api/settings/configs/{domain}/{config_id}", tags=["Settings"])
def delete_config(
    domain: str,
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if domain not in VALID_CONFIG_DOMAINS:
        return {"message": "Invalid domain"}
    org = _get_org(db, current_user)
    if not org:
        return {"message": "Could not delete configuration"}
    data = json.loads(json.dumps(org.settings or {}))
    configs = list(data.get(_configs_key(domain), []))
    data[_configs_key(domain)] = [c for c in configs if c.get("id") != config_id]
    org.settings = data
    db.commit()
    return {"message": "Configuration deleted"}


def _employee_branch_ids(db, employee_id):
    try:
        rows = db.execute(
            text("SELECT branch_id FROM employee_branches WHERE employee_id = :eid"),
            {"eid": employee_id},
        ).fetchall()
        return [r[0] for r in rows if r[0] is not None]
    except Exception:
        return []


def resolve_scoped_config(
    db,
    domain: str,
    employee_id: Optional[int] = None,
    company_id: Optional[int] = None,
    branch_ids: Optional[List[int]] = None,
    department_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> Optional[dict]:
    """Resolve the most specific {domain} config for an employee / scope.

    Priority: exact department > exact branch > exact company > any org-wide config.
    Configs are stored in org.settings["{domain}_configs"].
    """
    if not organization_id:
        return None
    org = db.query(Organization).filter(
        Organization.deleted_at.is_(None),
        Organization.id == organization_id,
    ).first()
    if not org:
        return None
    data = org.settings or {}
    configs = data.get(_configs_key(domain)) or []
    if not configs:
        return None

    if employee_id is not None:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if emp:
            company_id = company_id if company_id is not None else emp.company_id
            department_id = department_id if department_id is not None else emp.department_id
            branch_ids = branch_ids if branch_ids is not None else _employee_branch_ids(db, employee_id)

    def score(c: dict) -> tuple:
        cid = c.get("companyId")
        bid = c.get("branchId")
        did = c.get("departmentId")
        rank = 3 if did is not None else 2 if bid is not None else 1 if cid is not None else 0
        company_match = (cid is None) or (company_id is not None and cid == company_id)
        branch_match = (bid is None) or (bid in (branch_ids or []))
        dept_match = (did is None) or (department_id is not None and did == department_id)
        if not (company_match and branch_match and dept_match):
            return (-1, -1, -1, -1)
        return (rank, 1 if company_match else 0, 1 if branch_match else 0, 1 if dept_match else 0)

    best = max(configs, key=score, default=None)
    if best and score(best)[0] >= 0:
        return best
    return None


@router.get("/api/settings/configs/{domain}/resolve", tags=["Settings"])
def resolve_config_endpoint(
    domain: str,
    employeeId: Optional[int] = None,
    companyId: Optional[int] = None,
    branchId: Optional[int] = None,
    departmentId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if domain not in VALID_CONFIG_DOMAINS:
        return {"config": None}
    branch_ids = [branchId] if branchId is not None else None
    config = resolve_scoped_config(
        db, domain,
        employee_id=employeeId,
        company_id=companyId,
        branch_ids=branch_ids,
        department_id=departmentId,
        organization_id=current_user.organization_id,
    )
    return {"config": config}


@router.get("/api/settings/audit-log", tags=["Settings"])
def get_audit_log(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AuditLog)
    if current_user.organization_id:
        query = query.filter(AuditLog.user_id.in_(
            db.query(User.id).filter(User.organization_id == current_user.organization_id)
        ))
    logs = query.order_by(AuditLog.created_at.desc()).limit(100).all()

    # Fall back to activity_logs (which holds the seeded/live audit trail) if audit_logs is empty
    if not logs:
        aq = db.query(ActivityLog)
        if current_user.organization_id:
            aq = aq.join(User, User.id == ActivityLog.user_id).filter(User.organization_id == current_user.organization_id)
        activity = aq.order_by(ActivityLog.created_at.desc()).limit(100).all()
        result = []
        for a in activity:
            u = db.query(User).filter(User.id == a.user_id).first()
            result.append({
                "id": a.id,
                "userName": u.full_name if u else None,
                "userEmail": u.email if u else None,
                "action": a.action,
                "entityType": a.module or a.entity_type,
                "entityName": a.entity_name,
                "createdAt": a.created_at.isoformat() if a.created_at else None,
            })
        return result

    result = []
    for log_entry in logs:
        result.append({
            "id": log_entry.id,
            "userName": log_entry.user_name,
            "userEmail": None,
            "action": log_entry.action,
            "entityType": log_entry.entity_type,
            "entityName": None,
            "createdAt": log_entry.created_at.isoformat() if log_entry.created_at else None,
        })
    return result


@router.get("/api/settings/audit-log/download", tags=["Settings"])
def download_audit_log(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "userId", "userName", "action", "entityType", "entityId", "createdAt"])
    log_query = db.query(AuditLog)
    if current_user.role != "superadmin" and current_user.organization_id:
        log_query = log_query.filter(AuditLog.organization_id == current_user.organization_id)
    logs = log_query.order_by(AuditLog.created_at.desc()).limit(1000).all()
    if not logs:
        act_query = db.query(ActivityLog)
        if current_user.role != "superadmin" and current_user.organization_id:
            act_query = act_query.join(User, User.id == ActivityLog.user_id).filter(User.organization_id == current_user.organization_id)
        activity = act_query.order_by(ActivityLog.created_at.desc()).limit(1000).all()
        for a in activity:
            writer.writerow([a.id, a.user_id, a.module, a.action, a.entity_type, a.entity_id, a.created_at])
    else:
        for log_entry in logs:
            writer.writerow([log_entry.id, log_entry.user_id, log_entry.user_name, log_entry.action, log_entry.entity_type, log_entry.entity_id, log_entry.created_at])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )


@router.get("/api/settings/users", tags=["Users"])
def list_users(
    organizationId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(User).filter(User.deleted_at.is_(None))
    if organizationId is not None and current_user.role == "superadmin":
        query = query.filter(User.organization_id == organizationId)
    elif current_user.role != "superadmin":
        query = query.filter(User.organization_id == current_user.organization_id)
    return query.order_by(User.id.asc()).all()


@router.post("/api/settings/users", tags=["Users"])
def create_user(
    user_data: UserBase,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Only admins can create users")
    existing = db.query(User).filter(User.deleted_at.is_(None), User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=user_data.email,
        full_name=user_data.fullName,
        organization_id=current_user.organization_id,
        role="employee",
        is_active=True,
        password_hash=get_password_hash(os.urandom(16).hex()),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created user", user_id=user.id, email=user.email)
    return user


@router.put("/api/settings/users/{user_id}", tags=["Users"])
def update_user(
    user_id: int,
    user_data: UserBase,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.deleted_at.is_(None), User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin" and user.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="User not found")

    if user_data.email:
        user.email = user_data.email
    if user_data.fullName:
        user.full_name = user_data.fullName
    if user_data.isLockedToDevice is not None:
        user.is_locked_to_device = user_data.isLockedToDevice
    if user_data.deviceId:
        user.device_id = user_data.deviceId

    db.commit()
    db.refresh(user)
    return user


@router.delete("/api/settings/users/{user_id}", tags=["Users"])
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.deleted_at.is_(None), User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin" and user.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    user.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "User deactivated"}


