"""HRMS API assets routes."""
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
from core.schemas import (AssetCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from core.tenant import org_owned, get_employee_in_org
from database import Base, SessionLocal, engine, get_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Assets"])




@router.get("/api/assets", tags=["Assets"])
def get_assets(
    status: Optional[str] = None,
    employeeId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Asset).filter(Asset.deleted_at.is_(None))
    if current_user.organization_id:
        query = query.filter(Asset.organization_id == current_user.organization_id)
    if status:
        query = query.filter(Asset.status == status)
    if employeeId:
        query = query.filter(Asset.employee_id == employeeId)
    results = query.order_by(Asset.created_at.desc()).limit(500).all()

    # Batch-load employees in one query (avoids N+1 for large result sets)
    emp_ids = {a.employee_id for a in results if a.employee_id}
    emp_map = {e.id: e for e in db.query(Employee).filter(
        Employee.deleted_at.is_(None), Employee.id.in_(emp_ids)
    ).all()} if emp_ids else {}

    # Batch-load company, department, and branch names
    comp_ids = {e.company_id for e in emp_map.values() if e.company_id}
    dept_ids = {e.department_id for e in emp_map.values() if e.department_id}
    comp_map = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(comp_ids), Company.deleted_at.is_(None)).all()} if comp_ids else {}
    dept_map = {d.id: d.name for d in db.query(Department).filter(Department.id.in_(dept_ids), Department.deleted_at.is_(None)).all()} if dept_ids else {}

    # Branch via EmployeeBranchAssignment (primary or latest active)
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

    assets = []
    for a in results:
        emp = emp_map.get(a.employee_id)
        assets.append({
            "id": a.id,
            "employeeId": a.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}" if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "companyName": comp_map.get(emp.company_id) if emp and emp.company_id else None,
            "branchName": branch_map.get(emp_branch_map.get(a.employee_id)) if a.employee_id in emp_branch_map else None,
            "departmentName": dept_map.get(emp.department_id) if emp and emp.department_id else None,
            "assetType": a.asset_type,
            "assetName": a.asset_name,
            "serialNumber": a.serial_number,
            "status": a.status,
            "purchaseDate": str(a.purchase_date) if a.purchase_date else None,
            "issueDate": str(a.issue_date) if a.issue_date else None,
            "value": a.value,
            "purchaseValue": a.purchase_value,
            "usefulLifeYears": a.useful_life_years,
            "depreciationRate": a.depreciation_rate,
            "salvageValue": a.salvage_value,
            "notes": a.notes,
            "organizationId": a.organization_id,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        })
    return assets


@router.post("/api/assets", tags=["Assets"])
def create_asset(
    data: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Asset).filter(
        Asset.serial_number == data.serialNumber,
        Asset.deleted_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Asset with this serial number already exists")
    snake = convert_camel_to_snake(data.model_dump())
    if current_user.role != "superadmin":
        snake["organization_id"] = current_user.organization_id
        if snake.get("employee_id"):
            get_employee_in_org(db, Employee, snake["employee_id"], current_user.organization_id)
    else:
        snake["organization_id"] = data.organizationId or current_user.organization_id
    if snake.get("purchase_date"):
        snake["purchase_date"] = dateparser.parse(snake["purchase_date"]).date()
    if snake.get("issue_date"):
        snake["issue_date"] = dateparser.parse(snake["issue_date"]).date()
    att = Asset(**snake)
    db.add(att)
    db.commit()
    db.refresh(att)
    return {"message": "Asset created", "id": att.id}


@router.put("/api/assets/{asset_id}", tags=["Assets"])
def update_asset(
    asset_id: int,
    data: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(Asset).filter(Asset.id == asset_id, Asset.deleted_at.is_(None)).first()
    if not att:
        raise HTTPException(status_code=404, detail="Asset not found")
    if current_user.role != "superadmin":
        org_owned(att, current_user.organization_id)
    update_data = data.model_dump(exclude_unset=True)
    snake = convert_camel_to_snake(update_data)
    if snake.get("purchase_date"):
        snake["purchase_date"] = dateparser.parse(snake["purchase_date"]).date()
    if snake.get("issue_date"):
        snake["issue_date"] = dateparser.parse(snake["issue_date"]).date()
    if current_user.role != "superadmin" and snake.get("employee_id"):
        get_employee_in_org(db, Employee, snake["employee_id"], current_user.organization_id)
    for key, val in snake.items():
        if val is not None:
            setattr(att, key, val)
    db.commit()
    return {"message": "Asset updated"}


@router.delete("/api/assets/{asset_id}", tags=["Assets"])
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(Asset).filter(Asset.id == asset_id, Asset.deleted_at.is_(None)).first()
    if not att:
        raise HTTPException(status_code=404, detail="Asset not found")
    if current_user.role != "superadmin":
        org_owned(att, current_user.organization_id)
    att.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Asset deleted"}


@router.get("/api/assets/template", tags=["Assets"])
def download_asset_template(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["assetName", "assetType", "serialNumber", "status", "value", "purchaseValue", "purchaseDate", "notes", "employeeCode"])
    writer.writerow(["MacBook Pro 14\"", "laptop", "SN-0001", "available", 85000, 85000, "2026-01-15", "Example row", ""])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=assets_template.csv"},
    )


@router.post("/api/assets/import", tags=["Assets"])
async def import_assets(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode()))
    created = 0
    errors = []
    for idx, row in enumerate(reader, start=2):
        try:
            name = (row.get("assetName") or "").strip()
            serial = (row.get("serialNumber") or "").strip()
            if not name or not serial:
                errors.append(f"Row {idx}: assetName and serialNumber are required")
                continue
            existing = db.query(Asset).filter(
                Asset.serial_number == serial,
                Asset.deleted_at.is_(None),
            ).first()
            if existing:
                errors.append(f"Row {idx}: serial {serial} already exists")
                continue
            employee_code = (row.get("employeeCode") or "").strip()
            employee_id = None
            if employee_code:
                emp_query = db.query(Employee).filter(
                    Employee.employee_code == employee_code,
                    Employee.deleted_at.is_(None),
                )
                if current_user.role != "superadmin":
                    emp_query = emp_query.filter(Employee.organization_id == current_user.organization_id)
                emp = emp_query.first()
                if emp:
                    employee_id = emp.id
            purchase_value = float(row.get("purchaseValue") or row.get("value") or 0 or 0)
            att = Asset(
                asset_name=name,
                asset_type=(row.get("assetType") or "laptop").strip() or "laptop",
                serial_number=serial,
                status=(row.get("status") or "available").strip() or "available",
                value=purchase_value,
                purchase_value=purchase_value,
                useful_life_years=float(row.get("usefulLifeYears") or 0 or 0),
                depreciation_rate=float(row.get("depreciationRate") or 0 or 0),
                salvage_value=float(row.get("salvageValue") or 0 or 0),
                purchase_date=dateparser.parse(row["purchaseDate"]).date() if row.get("purchaseDate") else None,
                notes=row.get("notes") or "",
                employee_id=employee_id,
                organization_id=current_user.organization_id,
            )
            db.add(att)
            created += 1
        except Exception as e:
            errors.append(f"Row {idx}: {e}")
    db.commit()
    return {
        "message": f"Imported {created} assets",
        "created": created,
        "errors": errors[:20],
    }


@router.get("/api/bonuses", tags=["Payroll"])
def get_bonuses(
    employeeId: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Payroll).filter(
        Payroll.bonus > 0,
        Payroll.deleted_at.is_(None),
    )
    if employeeId:
        query = query.filter(Payroll.employee_id == employeeId)
    if month:
        query = query.filter(Payroll.month == month)
    if year:
        query = query.filter(Payroll.year == year)
    results = query.order_by(Payroll.year.desc(), Payroll.month.desc()).all()
    bonuses = []
    for p in results:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == p.employee_id).first()
        bonuses.append({
            "id": p.id,
            "employeeId": p.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}" if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "month": p.month,
            "year": p.year,
            "amount": p.bonus,
            "reason": p.notes or "",
        })
    return bonuses


@router.post("/api/bonuses", tags=["Payroll"])
def create_bonus(
    data: BonusCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Payroll).filter(
        Payroll.employee_id == data.employeeId,
        Payroll.month == data.month,
        Payroll.year == data.year,
        Payroll.deleted_at.is_(None),
    ).first()
    if existing:
        existing.bonus = (existing.bonus or 0) + data.amount
        if data.reason:
            existing.notes = (existing.notes or "") + f"; Bonus: {data.reason}"
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == data.employeeId).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        p = Payroll(
            employee_id=data.employeeId,
            month=data.month,
            year=data.year,
            bonus=data.amount,
            notes=data.reason,
            organization_id=current_user.organization_id,
            gross_salary=0,
            net_salary=0,
            status="draft",
        )
        db.add(p)
    db.commit()
    return {"message": "Bonus recorded"}

