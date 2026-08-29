"""HRMS API employees routes."""
from __future__ import annotations

import base64
import calendar
import collections
import io
import json
import math
import re
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
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import case, event, func, inspect, or_, text
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, with_loader_criteria

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.tenant import get_employee_in_org, org_owned
from core.schemas import (UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from database import Base, SessionLocal, engine, get_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Goal, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization,            Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift,     
           StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee, EmployeeBranchAssignment)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake
from utils.name_utils import employee_display_name

router = APIRouter(tags=["Employees"])




@router.get("/api/employees/{employee_id}/lifecycle", tags=["Employees"])
def get_employee_lifecycle(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    return {
        "employeeId": emp.id,
        "employeeName": f"{emp.first_name} {emp.last_name}",
        "joinDate": emp.created_at.isoformat() if emp.created_at else None,
        "status": emp.status,
    }


@router.get("/api/employees/{employee_id}/attendance", tags=["Employees"])
def get_employee_attendance_history(
    employee_id: int,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(500, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated attendance history for an employee (fast for large datasets)."""
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    query = db.query(Attendance).filter(Attendance.deleted_at.is_(None), Attendance.employee_id == employee_id)
    if startDate:
        query = query.filter(Attendance.date >= startDate)
    if endDate:
        query = query.filter(Attendance.date <= endDate + " 23:59:59")
    total = query.count()
    records = query.order_by(Attendance.date.desc()).offset((page - 1) * limit).limit(limit).all()
    items = [
        {
            "id": r.id,
            "date": r.date.isoformat() if r.date else None,
            "status": r.status,
            "checkIn": r.check_in.isoformat() if r.check_in else None,
            "checkOut": r.check_out.isoformat() if r.check_out else None,
            "workHours": r.work_hours,
            "overtimeHours": r.overtime_hours,
            "isLate": r.is_late,
            "lateMinutes": r.late_minutes,
        }
        for r in records
    ]
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit else 0,
    }


@router.get("/api/employees/{employee_id}/attendance/summary", tags=["Employees"])
def get_employee_attendance_summary(
    employee_id: int,
    months: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregated monthly attendance summary — O(rows) but returns only N months.

    Uses a single grouped query so even years of data aggregate on the database
    side (fast, memory-safe) instead of shipping every row to the client.
    """
    from sqlalchemy import extract, case as sql_case, func
    today = datetime.utcnow()
    year = today.year
    month = today.month

    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)

    # Build month boundaries going back `months` months
    boundaries = []
    y, m = year, month
    for _ in range(months):
        boundaries.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1

    # Group attendance by year+month (aggregate in DB)
    rows = (
        db.query(
            extract('year', Attendance.date).label('y'),
            extract('month', Attendance.date).label('m'),
            func.count(Attendance.id).label('total'),
            func.sum(sql_case((Attendance.status == "present", 1), else_=0)).label('present'),
            func.sum(sql_case((Attendance.status == "absent", 1), else_=0)).label('absent'),
            func.sum(sql_case((Attendance.status == "on_leave", 1), else_=0)).label('leaves'),
            func.sum(sql_case((Attendance.status == "half_day", 1), else_=0)).label('half_days'),
            func.sum(sql_case((Attendance.is_late.is_(True), 1), else_=0)).label('late_days'),
            func.coalesce(func.sum(Attendance.work_hours), 0).label('hours'),
        )
        .filter(Attendance.deleted_at.is_(None), Attendance.employee_id == employee_id)
        .group_by('y', 'm')
        .all()
    )

    month_map = {}
    for r in rows:
        y_key, m_key = int(r[0]), int(r[1])
        month_map[(y_key, m_key)] = {
            "totalDays": int(r[2] or 0),
            "present": int(r[3] or 0),
            "absent": int(r[4] or 0),
            "leaves": int(r[5] or 0),
            "halfDays": int(r[6] or 0),
            "lateDays": int(r[7] or 0),
            "workHours": round(float(r[8] or 0), 1),
        }
    result = []
    for (y, m) in boundaries:
        agg = month_map.get((y, m))
        if not agg:
            result.append({
                "year": y, "month": m, "totalDays": 0, "present": 0, "absent": 0,
                "leaves": 0, "halfDays": 0, "lateDays": 0, "workHours": 0,
                "attendanceRate": 0,
            })
            continue
        rate = round(agg["present"] / agg["totalDays"] * 100, 1) if agg["totalDays"] > 0 else 0
        result.append({
            "year": y, "month": m,
            "totalDays": agg["totalDays"], "present": agg["present"], "absent": agg["absent"],
            "leaves": agg["leaves"], "halfDays": agg["halfDays"], "lateDays": agg["lateDays"],
            "workHours": agg["workHours"], "attendanceRate": rate,
        })
    return {"employeeId": employee_id, "months": result}


@router.get("/api/employees/{employee_id}/leaves", tags=["Employees"])
def get_employee_leaves_history(
    employee_id: int,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    query = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.employee_id == employee_id)
    if status:
        query = query.filter(LeaveApplication.status == status)
    total = query.count()
    leaves = query.order_by(LeaveApplication.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    type_ids = {l.leave_type_id for l in leaves if l.leave_type_id}
    types_map = {t.id: t.name for t in db.query(LeaveType).filter(LeaveType.id.in_(type_ids)).all()} if type_ids else {}
    items = [
        {
            "id": l.id,
            "leaveType": types_map.get(l.leave_type_id) or "Leave",
            "leaveTypeId": l.leave_type_id,
            "startDate": l.start_date.isoformat() if l.start_date else None,
            "endDate": l.end_date.isoformat() if l.end_date else None,
            "totalDays": l.total_days,
            "status": l.status,
            "reason": l.reason,
        }
        for l in leaves
    ]
    return {"items": items, "total": total, "page": page, "limit": limit,
            "pages": (total + limit - 1) // limit if limit else 0}


@router.get("/api/employees/{employee_id}/payroll", tags=["Employees"])
def get_employee_payroll_history(
    employee_id: int,
    month: Optional[int] = None,
    year: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    query = db.query(Payroll).filter(Payroll.employee_id == employee_id)
    if month:
        query = query.filter(Payroll.month == month)
    if year:
        query = query.filter(Payroll.year == year)
    total = query.count()
    records = query.order_by(Payroll.year.desc(), Payroll.month.desc()).offset((page - 1) * limit).limit(limit).all()
    items = [
        {
            "id": p.id,
            "month": p.month,
            "year": p.year,
            "grossSalary": p.gross_salary,
            "netSalary": p.net_salary,
            "totalDeductions": p.total_deductions,
            "status": p.status,
            "paidAt": p.paid_at.isoformat() if p.paid_at else None,
        }
        for p in records
    ]
    return {"items": items, "total": total, "page": page, "limit": limit,
            "pages": (total + limit - 1) // limit if limit else 0}


@router.get("/api/employees/{employee_id}/full-statement", tags=["Employees"])
def get_employee_full_statement(
    employee_id: int,
    month: int = None,
    year: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Complete payroll & FnF statement: ties attendance + leave + expenses +
    loans + latest payroll + FnF projection into one aggregated view."""
    from datetime import date as _d
    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(
            Employee.deleted_at.is_(None), Employee.id == employee_id
        ).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    # Payroll for the period (all, incl. multiple runs)
    payroll_rows = db.query(Payroll).filter(
        Payroll.employee_id == employee_id,
        Payroll.month == month,
        Payroll.year == year,
        Payroll.deleted_at.is_(None),
    ).order_by(Payroll.id.desc()).all()
    payrolls = [
        {
            "id": p.id,
            "gross_salary": p.gross_salary,
            "net_salary": p.net_salary,
            "basic_salary": p.basic_salary,
            "total_earnings": p.total_earnings,
            "total_deductions": p.total_deductions,
            "status": p.status,
            "paid_days": p.paid_days,
            "working_days": p.working_days,
        }
        for p in payroll_rows
    ]

    # Attendance for the period (shared engine)
    att_summary = {}
    proration_factor = None
    try:
        from services.payroll_service import (
            _get_attendance_policy,
            _get_payroll_policy,
            _compute_attendance_payout,
        )
        payout = _compute_attendance_payout(
            db, emp, month, year,
            _get_attendance_policy(db, emp),
            _get_payroll_policy(db, emp),
        )
        att_summary = {
            "working_days": payout["working_days"],
            "present_days": payout["present_days"],
            "absent_days": payout["absent_days"],
            "half_days": payout["half_days"],
            "leave_days": payout["leave_days"],
            "paid_leave_days": payout["paid_leave_days"],
            "unpaid_leave_days": payout["unpaid_leave_days"],
            "holiday_days": payout["holiday_days"],
            "overtime_hours": payout["overtime_hours"],
            "paid_days": payout["paid_days"],
            "unpaid_days": payout["unpaid_days"],
        }
        proration_factor = payout["factor"]
    except Exception:
        pass

    # Approved expenses for the period (reimbursement eligible)
    approved_expenses = 0.0
    try:
        import calendar as _cal
        end = _d(year, month, _cal.monthrange(year, month)[1])
        from models import Expense
        rows = db.query(Expense).filter(
            Expense.employee_id == employee_id,
            Expense.deleted_at.is_(None),
            Expense.status == "approved",
            Expense.expense_date >= _d(year, month, 1),
            Expense.expense_date <= end,
        ).all()
        approved_expenses = round(sum(float(e.amount or 0) for e in rows), 2)
    except Exception:
        pass

    # Leave balance for encashment
    leave_balance = 0.0
    try:
        from models import LeaveBalance
        lbs = db.query(LeaveBalance).filter(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.deleted_at.is_(None),
        ).all()
        leave_balance = round(sum(float(b.remaining_days or 0) for b in lbs), 2)
    except Exception:
        pass

    # Outstanding loans
    outstanding_loans = 0.0
    try:
        from services.exit_management_service import _outstanding_loans
        outstanding_loans = _outstanding_loans(db, employee_id)
    except Exception:
        pass

    # FnF projection (if the employee has an exit record / is leaving)
    fnf = None
    try:
        if emp.date_of_leaving or emp.termination_date or db.query(ExitRecord).filter(
            ExitRecord.employee_id == employee_id,
            ExitRecord.deleted_at.is_(None),
        ).first():
            from services.exit_management_service import calculate_full_final_settlement
            fnf = calculate_full_final_settlement(db, employee_id)
    except Exception:
        pass

    return {
        "employee_id": employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
        "period": {"month": month, "year": year},
        "payroll": payrolls,
        "attendance": att_summary,
        "proration_factor": proration_factor,
        "approved_expenses": approved_expenses,
        "leave_balance": leave_balance,
        "outstanding_loans": outstanding_loans,
        "fnf_projection": fnf,
    }


@router.get("/api/employees/{employee_id}/expenses", tags=["Employees"])
def get_employee_expenses_history(
    employee_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    query = db.query(Expense).filter(Expense.deleted_at.is_(None), Expense.employee_id == employee_id)
    total = query.count()
    records = query.order_by(Expense.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    items = [
        {
            "id": e.id,
            "category": e.category,
            "amount": e.amount,
            "description": e.description,
            "date": e.expense_date.isoformat() if e.expense_date else None,
            "status": e.status,
        }
        for e in records
    ]
    return {"items": items, "total": total, "page": page, "limit": limit,
            "pages": (total + limit - 1) // limit if limit else 0}


@router.get("/api/employees/{employee_id}/performance-history", tags=["Employees"])
def get_employee_performance_history(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    reviews = db.query(PerformanceReview).filter(
        PerformanceReview.deleted_at.is_(None),
        PerformanceReview.employee_id == employee_id,
    ).order_by(PerformanceReview.review_year.desc(), PerformanceReview.review_period.desc()).all()
    goals = db.query(Goal).filter(
        Goal.deleted_at.is_(None),
        Goal.employee_id == employee_id,
    ).order_by(Goal.created_at.desc()).all()
    return {
        "reviews": [
            {
                "id": r.id,
                "reviewPeriod": r.review_period,
                "reviewYear": r.review_year,
                "rating": r.rating,
                "overallScore": r.overall_score,
                "status": r.status,
                "reviewDate": r.review_date.isoformat() if r.review_date else None,
                "reviewerComments": r.reviewer_comments,
            }
            for r in reviews
        ],
        "goals": [
            {
                "id": g.id,
                "title": g.title,
                "goalType": g.goal_type,
                "status": g.status,
                "progress": g.progress or 0,
                "targetDate": g.target_date.isoformat() if g.target_date else None,
            }
            for g in goals
        ],
    }


@router.get("/api/employees/{employee_id}/exit-history", tags=["Employees"])
def get_employee_exit_history(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    records = db.query(ExitRecord).filter(
        ExitRecord.deleted_at.is_(None),
        ExitRecord.employee_id == employee_id,
    ).order_by(ExitRecord.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "exitType": r.exit_type,
            "exitDate": r.exit_date.isoformat() if r.exit_date else None,
            "lastWorkingDay": r.last_working_day.isoformat() if r.last_working_day else None,
            "reason": r.reason,
            "fnfStatus": r.fnf_status,
            "fnfCompletedAt": r.fnf_completed_at.isoformat() if r.fnf_completed_at else None,
            "clearanceStatus": r.clearance_status,
            "clearanceCompletedAt": r.clearance_completed_at.isoformat() if r.clearance_completed_at else None,
            "approvalStatus": r.approval_status,
            "archivedAt": r.archived_at.isoformat() if r.archived_at else None,
        }
        for r in records
    ]


@router.get("/api/employees/{employee_id}/history/export")
def export_employee_history(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the complete history of an employee as a single CSV file.

    Includes: profile summary, attendance, leaves, payroll, expenses,
    performance reviews, goals, and exit records — aggregated on the server
    side so even employees with years of data export cleanly.
    """
    import csv
    import io

    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    name = f"{emp.first_name} {emp.last_name}".strip() or emp.email
    buf = io.StringIO()
    writer = csv.writer(buf)

    # ── Complete employee profile (all onboarding fields) ──
    writer.writerow(["EMPLOYEE PROFILE"])
    writer.writerow([])
    writer.writerow(["Field", "Value"])
    writer.writerow(["Full Name", name])
    writer.writerow(["First Name", emp.first_name or ""])
    writer.writerow(["Last Name", emp.last_name or ""])
    writer.writerow(["Employee Code", emp.employee_code or ""])
    writer.writerow(["Email", emp.email or ""])
    writer.writerow(["Phone", emp.phone or ""])
    writer.writerow(["Date of Birth", emp.date_of_birth.strftime("%Y-%m-%d") if emp.date_of_birth else ""])
    writer.writerow(["Gender", emp.gender or ""])
    writer.writerow(["Blood Group", emp.blood_group or ""])
    writer.writerow(["Marital Status", emp.marital_status or ""])
    writer.writerow(["Employment Type", emp.employment_type or ""])
    writer.writerow(["Status", emp.status or ""])
    writer.writerow(["Join Date", emp.join_date.strftime("%Y-%m-%d") if emp.join_date else ""])
    writer.writerow(["Company", emp.companies[0].name if emp.companies else ""])
    writer.writerow(["Branch", ", ".join(b.name for b in emp.branches) if emp.branches else ""])
    writer.writerow(["Department", emp.department.name if emp.department else ""])
    writer.writerow(["Designation", emp.designation or ""])
    # Address
    writer.writerow(["Current Address", (emp.current_address or "").replace("\n", ", ")])
    writer.writerow(["Permanent Address", (emp.permanent_address or "").replace("\n", ", ")])
    writer.writerow(["Landmark", emp.landmark or ""])
    # Emergency
    writer.writerow(["Emergency Contact", emp.emergency_contact or ""])
    writer.writerow(["Emergency Phone", emp.emergency_phone or ""])
    # Identity documents
    writer.writerow(["Aadhaar Number", emp.aadhar_number or ""])
    writer.writerow(["PAN Number", emp.pan_number or ""])
    writer.writerow(["Voter ID", emp.voter_id or ""])
    writer.writerow(["Driving License", emp.driving_license or ""])
    writer.writerow(["Passport Number", emp.passport_number or ""])
    writer.writerow(["Birth Certificate Number", emp.birth_certificate_number or ""])
    # Education
    writer.writerow(["Education Level", emp.education_level or ""])
    writer.writerow(["Institution", emp.institution or ""])
    writer.writerow(["Degree", emp.degree or ""])
    writer.writerow(["Field of Study", emp.field_of_study or ""])
    writer.writerow(["Graduation Year", emp.graduation_year or ""])
    writer.writerow(["Grade", emp.grade or ""])
    writer.writerow(["Certification", emp.certification or ""])
    writer.writerow(["Certification Org", emp.certification_org or ""])
    writer.writerow(["Certification Date", emp.certification_date.strftime("%Y-%m-%d") if emp.certification_date else ""])
    writer.writerow(["Certification Expiry", emp.certification_expiry.strftime("%Y-%m-%d") if emp.certification_expiry else ""])
    # Skills & languages
    writer.writerow(["Skills", (emp.skills or "").replace("\n", ", ")])
    writer.writerow(["Language 1", emp.language1 or ""])
    writer.writerow(["Language 2", emp.language2 or ""])
    writer.writerow(["Language 3", emp.language3 or ""])
    # Benefits / statutory
    writer.writerow(["PF Number", emp.pf_number or ""])
    writer.writerow(["PF UAN", emp.pf_uan or ""])
    writer.writerow(["ESIC Number", emp.esic_number or ""])
    writer.writerow(["Mediclaim Number", emp.mediclaim_number or ""])
    writer.writerow(["Mediclaim Provider", emp.mediclaim_provider or ""])
    # Family
    writer.writerow(["Father's Name", emp.father_name or ""])
    writer.writerow(["Mother's Name", emp.mother_name or ""])
    writer.writerow(["Spouse Name", emp.spouse_name or ""])
    writer.writerow(["Spouse Phone", emp.spouse_phone or ""])
    writer.writerow(["Number of Children", emp.number_of_children if emp.number_of_children is not None else ""])
    writer.writerow(["Nominee Name", emp.nominee_name or ""])
    writer.writerow(["Nominee Relationship", emp.nominee_relationship or ""])
    # Salary
    writer.writerow(["Annual Base Salary", emp.base_salary or 0])
    if emp.salary_components:
        import json as _json
        writer.writerow(["Salary Components", _json.dumps(emp.salary_components, default=str)])
    # Bank
    writer.writerow(["Bank Name", emp.bank_name or ""])
    writer.writerow(["Bank Account Number", emp.bank_account_number or ""])
    writer.writerow(["IFSC Code", emp.ifsc_code or ""])
    if emp.bank_accounts:
        import json as _json
        writer.writerow(["All Bank Accounts", _json.dumps(emp.bank_accounts, default=str)])
    # Device
    writer.writerow(["Device Type", emp.device_type or ""])
    writer.writerow(["Device IP", emp.device_ip_address or ""])
    writer.writerow(["Device MAC", emp.device_mac_address or ""])
    writer.writerow(["Device Serial", emp.device_serial_number or ""])
    # Exit / termination
    writer.writerow(["Date of Leaving", emp.date_of_leaving.strftime("%Y-%m-%d") if emp.date_of_leaving else ""])
    writer.writerow(["Termination Type", emp.termination_type or ""])
    writer.writerow(["Notice Period Served", emp.notice_period_served or ""])
    writer.writerow(["Full & Final Settlement", emp.full_final_settlement or ""])
    writer.writerow([])

    # ── Additional education details (multiple entries) ──
    if emp.education_details:
        import json as _json
        writer.writerow(["EDUCATION DETAILS"])
        writer.writerow(["Entries", _json.dumps(emp.education_details, default=str)])
        writer.writerow([])

    # ── Experience history (multiple entries) ──
    if emp.experience_details:
        import json as _json
        writer.writerow(["EXPERIENCE"])
        writer.writerow(["Entries", _json.dumps(emp.experience_details, default=str)])
        writer.writerow([])

    # ── Achievements ──
    if emp.achievements_details:
        import json as _json
        writer.writerow(["ACHIEVEMENTS"])
        writer.writerow(["Entries", _json.dumps(emp.achievements_details, default=str)])
        writer.writerow([])

    # ── Activities ──
    if emp.activities_details:
        import json as _json
        writer.writerow(["ACTIVITIES"])
        writer.writerow(["Entries", _json.dumps(emp.activities_details, default=str)])
        writer.writerow([])

    # ── Skills list ──
    if emp.skills_list:
        import json as _json
        writer.writerow(["SKILLS"])
        writer.writerow(["Entries", _json.dumps(emp.skills_list, default=str)])
        writer.writerow([])

    # ── Attendance ──
    writer.writerow(["ATTENDANCE"])
    writer.writerow(["Date", "Status", "Check In", "Check Out", "Work Hours", "Overtime", "Late"])
    atts = db.query(Attendance).filter(
        Attendance.deleted_at.is_(None), Attendance.employee_id == employee_id
    ).order_by(Attendance.date.asc()).all()
    for a in atts:
        writer.writerow([
            a.date.strftime("%Y-%m-%d") if a.date else "",
            a.status or "",
            a.check_in.strftime("%Y-%m-%d %H:%M") if a.check_in else "",
            a.check_out.strftime("%Y-%m-%d %H:%M") if a.check_out else "",
            round(a.work_hours, 2) if a.work_hours is not None else "",
            round(a.overtime_hours, 2) if a.overtime_hours else "",
            "Yes" if a.is_late else "No",
        ])
    writer.writerow([])

    # ── Leaves ──
    writer.writerow(["LEAVES"])
    writer.writerow(["Leave Type", "Start", "End", "Days", "Status", "Reason"])
    leaves = db.query(LeaveApplication).filter(
        LeaveApplication.deleted_at.is_(None), LeaveApplication.employee_id == employee_id
    ).order_by(LeaveApplication.created_at.asc()).all()
    leave_type_ids = {l.leave_type_id for l in leaves if l.leave_type_id}
    lt_map = {t.id: t.name for t in db.query(LeaveType).filter(LeaveType.id.in_(leave_type_ids)).all()} if leave_type_ids else {}
    for l in leaves:
        writer.writerow([
            lt_map.get(l.leave_type_id) or "Leave",
            l.start_date.strftime("%Y-%m-%d") if l.start_date else "",
            l.end_date.strftime("%Y-%m-%d") if l.end_date else "",
            l.total_days or "",
            l.status or "",
            (l.reason or "").replace("\n", " "),
        ])
    writer.writerow([])

    # ── Payroll ──
    writer.writerow(["PAYROLL"])
    writer.writerow(["Period", "Gross", "Deductions", "Net", "Status", "Paid On"])
    pays = db.query(Payroll).filter(Payroll.employee_id == employee_id).order_by(Payroll.year.asc(), Payroll.month.asc()).all()
    for p in pays:
        writer.writerow([
            f"{p.month}/{p.year}",
            round(p.gross_salary or 0, 2),
            round(p.total_deductions or 0, 2),
            round(p.net_salary or 0, 2),
            p.status or "",
            p.paid_at.strftime("%Y-%m-%d") if p.paid_at else "",
        ])
    writer.writerow([])

    # ── Expenses ──
    writer.writerow(["EXPENSES"])
    writer.writerow(["Date", "Category", "Amount", "Status", "Description"])
    exps = db.query(Expense).filter(
        Expense.deleted_at.is_(None), Expense.employee_id == employee_id
    ).order_by(Expense.created_at.asc()).all()
    for e in exps:
        writer.writerow([
            e.expense_date.strftime("%Y-%m-%d") if e.expense_date else "",
            e.category or "",
            round(e.amount or 0, 2),
            e.status or "",
            (e.description or "").replace("\n", " "),
        ])
    writer.writerow([])

    # ── Performance reviews ──
    writer.writerow(["PERFORMANCE REVIEWS"])
    writer.writerow(["Period", "Year", "Rating", "Score", "Status", "Reviewer Comments"])
    reviews = db.query(PerformanceReview).filter(
        PerformanceReview.deleted_at.is_(None), PerformanceReview.employee_id == employee_id
    ).order_by(PerformanceReview.review_year.asc(), PerformanceReview.review_period.asc()).all()
    reviewer_ids = {r.reviewer_id for r in reviews if r.reviewer_id}
    u_map = {u.id: (u.full_name or u.email) for u in db.query(User).filter(User.id.in_(reviewer_ids)).all()} if reviewer_ids else {}
    for r in reviews:
        writer.writerow([
            r.review_period or "",
            r.review_year or "",
            r.rating or "",
            r.overall_score or "",
            r.status or "",
            (r.reviewer_comments or "").replace("\n", " ") if hasattr(r, "reviewer_comments") else "",
        ])
    writer.writerow([])

    # ── Goals ──
    writer.writerow(["GOALS"])
    writer.writerow(["Title", "Type", "Status", "Progress %", "Target Date"])
    goals = db.query(Goal).filter(
        Goal.deleted_at.is_(None), Goal.employee_id == employee_id
    ).order_by(Goal.created_at.asc()).all()
    for g in goals:
        writer.writerow([
            (g.title or "").replace("\n", " "),
            g.goal_type or "",
            g.status or "",
            g.progress or 0,
            g.target_date.strftime("%Y-%m-%d") if g.target_date else "",
        ])
    writer.writerow([])

    # ── Exit records ──
    writer.writerow(["EXIT RECORDS"])
    writer.writerow(["Exit Type", "Exit Date", "Last Working Day", "FnF", "Clearance", "Reason"])
    exits = db.query(ExitRecord).filter(
        ExitRecord.deleted_at.is_(None), ExitRecord.employee_id == employee_id
    ).order_by(ExitRecord.created_at.asc()).all()
    for x in exits:
        writer.writerow([
            x.exit_type or "",
            x.exit_date.strftime("%Y-%m-%d") if x.exit_date else "",
            x.last_working_day.strftime("%Y-%m-%d") if x.last_working_day else "",
            x.fnf_status or "",
            x.clearance_status or "",
            (x.reason or "").replace("\n", " "),
        ])

    buf.seek(0)
    safe_name = re.sub(r"[^\w\- ]", "", name).replace(" ", "_")
    filename = f"{safe_name}_history_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/api/employees/{employee_id}/resume")
def download_employee_resume(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download an employee's CV if uploaded; otherwise generate a resume PDF
    from their profile data (education, experience, skills, achievements, etc.)."""
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    name = f"{emp.first_name} {emp.last_name}".strip() or emp.email or "employee"
    safe_name = re.sub(r"[^\w\- ]", "", name).replace(" ", "_")

    # If a CV was uploaded, serve it directly
    if emp.resume_url:
        resume_path = os.path.join(os.path.dirname(__file__), emp.resume_url.lstrip("/"))
        if os.path.exists(resume_path):
            ext = os.path.splitext(resume_path)[1].lower() or ".pdf"
            media = "application/pdf" if ext in (".pdf",) else "application/octet-stream"
            return FileResponse(resume_path, media_type=media, filename=f"{safe_name}_cv{ext}")

    # Otherwise build a resume from the stored profile
    from services.resume_generator import build_resume_pdf

    profile = {
        "first_name": emp.first_name or "",
        "last_name": emp.last_name or "",
        "designation": emp.designation or "",
        "email": emp.email or "",
        "phone": emp.phone or "",
        "location": emp.current_address or emp.address or "",
        "summary": (emp.custom_fields or {}).get("resume_summary") if isinstance(emp.custom_fields, dict) else "",
        "skills_text": emp.skills or "",
        "language1": emp.language1 or "",
        "language2": emp.language2 or "",
        "language3": emp.language3 or "",
        "degree": emp.degree or "",
        "institution": emp.institution or "",
        "field_of_study": emp.field_of_study or "",
        "graduation_year": emp.graduation_year or "",
    }

    data = {
        "profile": profile,
        "education": emp.education_details or [],
        "experience": emp.experience_details or [],
        "skills": emp.skills_list or [],
        "achievements": emp.achievements_details or [],
        "activities": emp.activities_details or [],
        "certifications": emp.certifications or [],
    }

    pdf_bytes = bytes(build_resume_pdf(data))
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={safe_name}_resume.pdf"},
    )


@router.get("/api/employees/{employee_id}/onboarding-progress", tags=["Onboarding"])
def get_onboarding_progress(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    return {
        "employeeId": emp.id,
        "onboardingStep": emp.onboarding_step or "pending",
        "onboardingProgress": emp.onboarding_progress or [],
        "status": emp.status,
    }


@router.patch("/api/employees/{employee_id}/onboarding-step", tags=["Onboarding"])
def update_onboarding_step(
    employee_id: int,
    payload: OnboardingStepUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    step_id = payload.stepId
    if not step_id:
        raise HTTPException(status_code=400, detail="stepId is required")

    progress = emp.onboarding_progress or []
    if step_id not in progress:
        progress.append(step_id)
        emp.onboarding_progress = progress

    emp.onboarding_step = "in_progress"
    db.commit()

    return {"status": "success", "onboardingProgress": progress}


@router.put("/api/employees/{employee_id}/onboarding-data", tags=["Onboarding"])
def save_onboarding_data(
    employee_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save the full onboarding form data to the employee record."""
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    from utils.helpers import convert_camel_to_snake
    from utils.name_utils import normalize_name_payload, apply_name_fields, employee_display_name
    data = convert_camel_to_snake(payload or {})
    if any(k in data for k in ("full_name", "first_name", "last_name", "fullName", "firstName", "lastName")):
        merged = normalize_name_payload({
            "full_name": getattr(emp, "full_name", None),
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            **{k: v for k, v in data.items() if k in ("full_name", "first_name", "last_name")},
        })
        apply_name_fields(emp, merged)
        if emp.user_id:
            user = db.query(User).filter(User.id == emp.user_id).first()
            if user:
                user.full_name = merged["full_name"]
        data.pop("full_name", None)
        data.pop("first_name", None)
        data.pop("last_name", None)
    if current_user.role != "superadmin":
        data.pop("organization_id", None)

    # Fields that must never hold an empty string — empty means "not set".
    integer_fields = {
        "designation_id", "department_id", "company_id", "organization_id",
        "manager_id", "reporting_to", "branch_id", "graduation_year",
        "number_of_children", "experience_years", "notice_period_days",
    }
    date_fields = {
        "date_of_birth", "join_date", "certification_date",
        "certification_expiry", "device_assigned_date", "date_of_leaving",
        "termination_date", "date_of_joining",
    }

    def _clean_value(f: str, val):
        if f in integer_fields:
            if val in ("", None):
                return None
            try:
                return int(float(val))
            except (TypeError, ValueError):
                return None
        if f in date_fields and isinstance(val, str):
            if not val.strip():
                return None
        if f == "base_salary" and val in ("", None):
            return None
        return val

    # Basic / identity / personal
    # Never allow blank values to wipe out core identity fields — these come
    # from the candidate on onboarding and must be preserved.
    identity_fields = {"full_name", "first_name", "last_name", "email", "employee_code"}
    for f in ["full_name", "first_name", "last_name", "email", "phone", "gender", "blood_group",
              "marital_status", "date_of_birth", "employee_code", "designation",
              "designation_id", "department_id", "company_id", "organization_id",
              "employment_type", "join_date", "aadhar_number", "pan_number",
              "voter_id", "passport_number", "driving_license", "address",
              "current_address", "permanent_address", "landmark",
              "emergency_contact", "emergency_phone", "education_level",
              "institution", "degree", "field_of_study", "graduation_year",
              "grade", "certification", "certification_org", "skills",
              "language1", "language2", "language3", "base_salary",
              "salary_components", "bank_name", "bank_account_number", "ifsc_code",
              "pf_number", "pf_uan", "esic_number", "mediclaim_number",
              "mediclaim_provider", "father_name", "mother_name", "spouse_name",
              "spouse_phone", "number_of_children", "nominee_name",
              "nominee_relationship", "user_role", "device_type",
              "device_ip_address", "device_mac_address", "device_serial_number",
              "status", "birth_certificate_number"]:
        if f in data and data[f] is not None:
            val = _clean_value(f, data[f])
            # Skip empty strings for identity fields to avoid clobbering the
            # candidate-derived name/email/code with a blank value.
            if f in identity_fields and (val == "" or val is None):
                continue
            try:
                if f in ("date_of_birth", "join_date", "certification_date", "certification_expiry", "device_assigned_date"):
                    if isinstance(val, str) and val:
                        parsed = dateparser.parse(val)
                        setattr(emp, f, parsed) if parsed else None
                    elif isinstance(val, datetime):
                        setattr(emp, f, val)
                elif f in ("salary_components",):
                    setattr(emp, f, val if isinstance(val, dict) else {})
                else:
                    setattr(emp, f, val)
            except Exception:
                pass

    # Family info (array/JSON)
    if "family_info" in data and isinstance(data["family_info"], list):
        emp.family_info = data["family_info"]
    elif "familyInfo" in payload and isinstance(payload["familyInfo"], list):
        emp.family_info = payload["familyInfo"]

    # Education details (array/JSON)
    if "education_details" in data and isinstance(data["education_details"], list):
        emp.education_details = data["education_details"]
    elif "educationDetails" in payload and isinstance(payload["educationDetails"], list):
        emp.education_details = payload["educationDetails"]

    if "certifications" in data and isinstance(data["certifications"], list):
        emp.certifications = data["certifications"]
    elif "certifications" in payload and isinstance(payload["certifications"], list):
        emp.certifications = payload["certifications"]
    if "languages" in data and isinstance(data["languages"], list):
        emp.languages = data["languages"]
    elif "languages" in payload and isinstance(payload["languages"], list):
        emp.languages = payload["languages"]

    # Multiple bank accounts
    if "bank_accounts" in data and isinstance(data["bank_accounts"], list):
        emp.bank_accounts = data["bank_accounts"]
    elif "bankAccounts" in payload and isinstance(payload["bankAccounts"], list):
        emp.bank_accounts = payload["bankAccounts"]

    # Multiple experience / achievements / activities
    if "experience_details" in data and isinstance(data["experience_details"], list):
        emp.experience_details = data["experience_details"]
    elif "experienceDetails" in payload and isinstance(payload["experienceDetails"], list):
        emp.experience_details = payload["experienceDetails"]

    if "achievements_details" in data and isinstance(data["achievements_details"], list):
        emp.achievements_details = data["achievements_details"]
    elif "achievementsDetails" in payload and isinstance(payload["achievementsDetails"], list):
        emp.achievements_details = payload["achievementsDetails"]

    if "activities_details" in data and isinstance(data["activities_details"], list):
        emp.activities_details = data["activities_details"]
    elif "activitiesDetails" in payload and isinstance(payload["activitiesDetails"], list):
        emp.activities_details = payload["activitiesDetails"]

    if "skills_list" in data and isinstance(data["skills_list"], list):
        emp.skills_list = data["skills_list"]
    elif "skillsList" in payload and isinstance(payload["skillsList"], list):
        emp.skills_list = payload["skillsList"]

    # Salary
    if "base_salary" in data and data["base_salary"] is not None:
        try:
            emp.base_salary = float(data["base_salary"])
        except Exception:
            pass
    if "salary_components" in data and isinstance(data["salary_components"], dict):
        emp.salary_components = data["salary_components"]
    elif "salaryComponents" in payload and isinstance(payload["salaryComponents"], dict):
        emp.salary_components = payload["salaryComponents"]

    # Branch assignment (many-to-many) — sync the active branch assignments table
    # (which the payroll/attendance branch filters read) plus the association
    # relationship. The UI sends `branchIds`; the first selected branch becomes
    # the primary/default branch.
    raw_branch_ids = data.get("branch_ids") or payload.get("branchIds")
    if raw_branch_ids is not None:
        try:
            branch_ids = [int(b) for b in (raw_branch_ids or []) if b not in (None, "")]
        except (TypeError, ValueError):
            branch_ids = []
        if current_user.role != "superadmin" and emp.organization_id:
            org_branch_ids = {
                b.id for b in db.query(Branch).filter(
                    Branch.organization_id == emp.organization_id,
                    Branch.deleted_at.is_(None),
                ).all()
            }
            branch_ids = [b for b in branch_ids if b in org_branch_ids]
        branches = db.query(Branch).filter(Branch.id.in_(branch_ids)).all() if branch_ids else []
        # Soft-delete any existing active assignments so the current selection wins.
        active_branch_ids = [row.branch_id for row in db.query(
            EmployeeBranchAssignment.branch_id
        ).filter(
            EmployeeBranchAssignment.employee_id == emp.id,
            EmployeeBranchAssignment.status == "active",
            EmployeeBranchAssignment.deleted_at.is_(None),
        ).all()]
        if active_branch_ids:
            db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == emp.id,
                EmployeeBranchAssignment.status == "inactive",
                EmployeeBranchAssignment.branch_id.in_(active_branch_ids),
            ).delete(synchronize_session=False)
        db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == emp.id,
            EmployeeBranchAssignment.status == "active",
            EmployeeBranchAssignment.deleted_at.is_(None),
        ).update({"deleted_at": datetime.utcnow(), "status": "inactive"})
        for idx, bid in enumerate(branch_ids):
            db.add(EmployeeBranchAssignment(
                employee_id=emp.id,
                branch_id=bid,
                is_primary=(idx == 0),
                start_date=datetime.utcnow(),
                status="active",
            ))
        emp.branches = branches
        emp.branch_id = branches[0].id if branches else None

    # Sync login credentials (email + phone) to the linked user account so the
    # employee can sign in and reset a forgotten password with matching details.
    if emp.user_id:
        user = db.query(User).filter(User.id == emp.user_id).first()
        if user:
            if data.get("email"):
                # users.email is unique — never overwrite it with an email already
                # used by ANOTHER user (silently keep the old email instead of
                # failing the whole save with a UniqueViolation).
                new_email = str(data["email"]).strip().lower()
                other = None
                if new_email:
                    other = db.query(User).filter(
                        User.id != user.id,
                        func.lower(User.email) == new_email,
                    ).first()
                if new_email and not other:
                    user.email = data["email"]
            if data.get("phone"):
                user.phone = data["phone"]

    emp.onboarding_step = emp.onboarding_step or "in_progress"
    db.commit()
    db.refresh(emp)
    return {"status": "success", "message": "Onboarding data saved", "employeeId": emp.id}


@router.post("/api/employees/{employee_id}/complete-onboarding", tags=["Onboarding"])
def complete_onboarding(
    employee_id: int,
    payload: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    # Optionally save onboarding data before completing
    if payload:
        from utils.helpers import convert_camel_to_snake
        data = convert_camel_to_snake(payload or {})
        if current_user.role != "superadmin":
            data.pop("organization_id", None)
        identity_fields = {"first_name", "last_name", "email", "employee_code"}
        integer_fields = {
            "designation_id", "department_id", "company_id", "organization_id",
            "manager_id", "reporting_to", "branch_id", "graduation_year",
            "number_of_children", "experience_years", "notice_period_days",
        }
        date_fields = {
            "date_of_birth", "join_date", "certification_date",
            "certification_expiry", "device_assigned_date", "date_of_leaving",
            "termination_date", "date_of_joining",
        }

        def _clean_value(f: str, val):
            if f in integer_fields:
                if val in ("", None):
                    return None
                try:
                    return int(float(val))
                except (TypeError, ValueError):
                    return None
            if f in date_fields and isinstance(val, str) and not val.strip():
                return None
            if f == "base_salary" and val in ("", None):
                return None
            return val

        for f in ["first_name", "last_name", "email", "phone", "gender", "blood_group",
                  "marital_status", "date_of_birth", "employee_code", "designation",
                  "designation_id", "department_id", "company_id", "organization_id",
                  "employment_type", "join_date", "aadhar_number", "pan_number",
                  "voter_id", "passport_number", "driving_license", "address",
                  "current_address", "permanent_address", "landmark",
                  "emergency_contact", "emergency_phone", "education_level",
                  "institution", "degree", "field_of_study", "graduation_year",
                  "grade", "certification", "certification_org", "skills",
                  "language1", "language2", "language3", "base_salary",
                  "salary_components", "bank_name", "bank_account_number", "ifsc_code",
                  "pf_number", "pf_uan", "esic_number", "mediclaim_number",
                  "mediclaim_provider", "father_name", "mother_name", "spouse_name",
                  "spouse_phone", "number_of_children", "nominee_name",
                  "nominee_relationship", "user_role", "status", "birth_certificate_number"]:
            if f in data and data[f] is not None:
                val = _clean_value(f, data[f])
                if f in identity_fields and (val == "" or val is None):
                    continue
                try:
                    if f in ("date_of_birth", "join_date", "certification_date", "certification_expiry", "device_assigned_date"):
                        if isinstance(val, str) and val:
                            parsed = dateparser.parse(val)
                            setattr(emp, f, parsed) if parsed else None
                        elif isinstance(val, datetime):
                            setattr(emp, f, val)
                    elif f == "salary_components":
                        setattr(emp, f, val if isinstance(val, dict) else {})
                    else:
                        setattr(emp, f, val)
                except Exception:
                    pass
        if "family_info" in data and isinstance(data["family_info"], list):
            emp.family_info = data["family_info"]
        if "education_details" in data and isinstance(data["education_details"], list):
            emp.education_details = data["education_details"]
        if "certifications" in data and isinstance(data["certifications"], list):
            emp.certifications = data["certifications"]

    emp.onboarding_step = "completed"
    db.commit()

    return {"status": "success", "message": "Onboarding completed", "employeeId": emp.id, "newStatus": emp.status}


@router.post("/api/employees/{employee_id}/activate-onboarding", tags=["Onboarding"])
def activate_onboarding(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a completed onboarding record to an active employee.

    Stores the system date as the employee's onboarding/join date. The date is
    captured from the confirmation modal (read-only) on the frontend.
    """
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    emp.onboarding_step = "completed"
    emp.status = "active"
    emp.join_date = emp.join_date or datetime.utcnow()

    # Enforce plan employee limit when activating a new joiner.
    try:
        from routers.employees import _enforce_employee_limit
        _enforce_employee_limit(db, current_user.organization_id, extra=1)
    except HTTPException:
        db.rollback()
        emp.onboarding_step = "in_progress"
        emp.status = "inactive"
        db.commit()
        raise

    # Log lifecycle event
    event = EmployeeLifecycleEvent(
        employee_id=emp.id,
        event_type="joined",
        event_date=datetime.utcnow(),
        description="Onboarding completed, employee activated",
        recorded_by=current_user.id,
    )
    db.add(event)
    db.commit()

    # Run onboarding automation (login account, leave balances, notifications,
    # IT checklist). Welcome email is opt-in only.
    try:
        from services.onboarding_automation import run_onboarding_automation
        run_onboarding_automation(db, emp, actor_user_id=current_user.id)
    except Exception as e:
        db.rollback()
        print(f"Onboarding automation failed for emp {emp.id}: {e}")

    return {"status": "success", "message": "Employee activated", "employeeId": emp.id, "newStatus": emp.status}


@router.post("/api/employees/{employee_id}/initiate-exit", tags=["Exit Management"])
def initiate_exit(
    employee_id: int,
    payload: InitiateExitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")

    exit_type = payload.exitType or "resigned"
    exit_date = payload.exitDate or datetime.utcnow().strftime("%Y-%m-%d")
    reason = payload.reason or ""
    last_working_day = payload.lastWorkingDay or exit_date

    # 1. Create ExitRecord
    exit_record = ExitRecord(
        employee_id=emp.id,
        organization_id=emp.organization_id,
        exit_type=exit_type,
        exit_date=datetime.strptime(exit_date, "%Y-%m-%d") if isinstance(exit_date, str) else exit_date,
        last_working_day=datetime.strptime(last_working_day, "%Y-%m-%d") if isinstance(last_working_day, str) else last_working_day,
        reason=reason,
        notice_period_served=payload.noticePeriodServed or "no",
        handover_completed="no",
        fnf_status="pending",
        clearance_status="pending",
        initiated_by=current_user.id,
    )
    db.add(exit_record)
    db.flush()

    # 3. Update employee status (archiving happens after FnF + clearance)
    emp.status = "inactive"
    emp.termination_type = exit_type
    emp.termination_date = exit_record.exit_date
    emp.date_of_leaving = exit_record.last_working_day

    # 4. Log lifecycle event
    event = EmployeeLifecycleEvent(
        employee_id=emp.id,
        event_type="termination" if exit_type == "terminated" else "resignation",
        event_date=datetime.utcnow(),
        description=f"Employee {exit_type} — exit initiated",
        recorded_by=current_user.id,
        to_value=exit_type,
    )
    db.add(event)
    db.commit()

    return {
        "status": "success",
        "message": f"Exit initiated for {emp.first_name} {emp.last_name}",
        "exitRecordId": exit_record.id,
    }


@router.get("/api/exit-records", tags=["Exit Management"])
def list_exit_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = db.query(ExitRecord).filter(
        ExitRecord.deleted_at.is_(None),
        ExitRecord.archived_at.is_(None),
    )
    if current_user.role != "superadmin":
        records = records.filter(ExitRecord.organization_id == current_user.organization_id)
    records = records.order_by(ExitRecord.created_at.desc()).all()
    result = []
    for r in records:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == r.employee_id).first()
        company_name = None
        department_name = None
        branch_names = None
        if emp:
            company = db.query(Company).filter(Company.deleted_at.is_(None), Company.id == emp.company_id).first() if emp.company_id else None
            dept = db.query(Department).filter(Department.deleted_at.is_(None), Department.id == emp.department_id).first() if emp.department_id else None
            company_name = company.name if company else None
            department_name = dept.name if dept else None
            try:
                branches = emp.branches if hasattr(emp, 'branches') else []
                branch_names = ", ".join(b.name for b in branches) if branches else None
            except Exception:
                branch_names = None
        result.append({
            "id": r.id,
            "employeeId": r.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
            "email": emp.email if emp else "",
            "companyId": emp.company_id if emp else None,
            "companyName": company_name,
            "branchName": branch_names,
            "departmentId": emp.department_id if emp else None,
            "departmentName": department_name,
            "exitType": r.exit_type,
            "exitDate": r.exit_date.isoformat() if r.exit_date else None,
            "lastWorkingDay": r.last_working_day.isoformat() if r.last_working_day else None,
            "reason": r.reason,
            "fnfStatus": r.fnf_status,
            "clearanceStatus": r.clearance_status,
            "approvalStatus": r.approval_status,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        })
    return result


@router.post("/api/exit-records", tags=["Exit Management"])
def create_exit_record(
    payload: ExitRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == payload.employeeId).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role != "superadmin":
        org_owned(emp, current_user.organization_id)
    exit_type = payload.exitType or "resigned"
    exit_date = datetime.strptime(payload.exitDate, "%Y-%m-%d") if isinstance(payload.exitDate, str) else payload.exitDate
    last_working_day = datetime.strptime(payload.lastWorkingDay, "%Y-%m-%d") if isinstance(payload.lastWorkingDay, str) else payload.lastWorkingDay
    reason = payload.reason or ""
    exit_record = ExitRecord(
        employee_id=emp.id,
        organization_id=emp.organization_id,
        exit_type=exit_type,
        exit_date=exit_date,
        last_working_day=last_working_day,
        reason=reason,
        notice_period_served=payload.noticePeriodServed or "no",
        fnf_status="pending",
        clearance_status="pending",
        initiated_by=current_user.id,
    )
    db.add(exit_record)
    db.flush()

    # Update employee status (record is NOT archived yet — archiving happens
    # only after FnF settlement + clearance are both completed)
    emp.status = "inactive"
    emp.termination_type = exit_type
    emp.termination_date = exit_record.exit_date
    emp.date_of_leaving = exit_record.last_working_day

    # Log lifecycle event
    event = EmployeeLifecycleEvent(
        employee_id=emp.id,
        event_type="termination" if exit_type == "terminated" else "resignation",
        event_date=datetime.utcnow(),
        description=f"Employee {exit_type} — exit initiated",
        recorded_by=current_user.id,
        to_value=exit_type,
    )
    db.add(event)
    db.commit()
    db.refresh(exit_record)
    return {"id": exit_record.id, "message": "Exit record created"}


@router.post("/api/exit-records/bulk-upload", tags=["Exit Management"])
def bulk_upload_exit_records(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk create exit records from a CSV upload."""
    import csv as _csv
    import io as _io
    content = file.file.read().decode("utf-8-sig", errors="replace")
    file.file.close()
    reader = _csv.DictReader(_io.StringIO(content))
    created, skipped, errors = 0, 0, []
    for idx, row in enumerate(reader, start=2):
        emp_code = (row.get("employee_code") or row.get("employeeCode") or "").strip()
        emp_email = (row.get("email") or "").strip()
        emp_id = None
        if emp_code:
            emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.employee_code == emp_code)
            if current_user.role != "superadmin":
                emp = emp.filter(Employee.organization_id == current_user.organization_id)
            emp = emp.first()
            emp_id = emp.id if emp else None
        elif emp_email:
            emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.email == emp_email)
            if current_user.role != "superadmin":
                emp = emp.filter(Employee.organization_id == current_user.organization_id)
            emp = emp.first()
            emp_id = emp.id if emp else None
        if not emp_id:
            errors.append(f"Row {idx}: no matching employee")
            skipped += 1
            continue
        exit_date = row.get("exit_date") or row.get("exitDate") or row.get("last_working_day") or row.get("lastWorkingDay")
        if not exit_date:
            errors.append(f"Row {idx}: missing exit date")
            skipped += 1
            continue
        try:
            parsed_date = datetime.strptime(str(exit_date)[:10], "%Y-%m-%d")
        except Exception:
            errors.append(f"Row {idx}: invalid exit date {exit_date}")
            skipped += 1
            continue
        last_wd = row.get("last_working_day") or row.get("lastWorkingDay") or exit_date
        try:
            parsed_lwd = datetime.strptime(str(last_wd)[:10], "%Y-%m-%d")
        except Exception:
            parsed_lwd = parsed_date
        db.add(ExitRecord(
            employee_id=emp_id,
            organization_id=current_user.organization_id or db.query(Employee).filter(Employee.id == emp_id).first().organization_id,
            exit_type=(row.get("exit_type") or "resigned").strip(),
            exit_date=parsed_date,
            last_working_day=parsed_lwd,
            reason=(row.get("reason") or "").strip(),
            notice_period_served=(row.get("notice_period_served") or "no").strip(),
            fnf_status="pending",
            clearance_status="pending",
            initiated_by=current_user.id,
        ))
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors[:50]}


@router.put("/api/exit-records/{exit_id}", tags=["Exit Management"])
def update_exit_record(    exit_id: int,
    payload: ExitRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)
    if payload.exitType is not None:
        exit_record.exit_type = payload.exitType
    if payload.exitDate is not None:
        exit_record.exit_date = datetime.strptime(payload.exitDate, "%Y-%m-%d") if isinstance(payload.exitDate, str) else payload.exitDate
    if payload.lastWorkingDay is not None:
        exit_record.last_working_day = datetime.strptime(payload.lastWorkingDay, "%Y-%m-%d") if isinstance(payload.lastWorkingDay, str) else payload.lastWorkingDay
    if payload.reason is not None:
        exit_record.reason = payload.reason
    if payload.noticePeriodServed is not None:
        exit_record.notice_period_served = payload.noticePeriodServed
    if payload.approvalStatus is not None:
        exit_record.approval_status = payload.approvalStatus
    db.commit()
    return {"message": "Exit record updated"}


@router.delete("/api/exit-records/{exit_id}", tags=["Exit Management"])
def delete_exit_record(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)
    db.query(ArchivedEmployee).filter(ArchivedEmployee.exit_record_id == exit_id).delete()
    db.delete(exit_record)
    db.commit()
    return {"message": "Exit record deleted"}


@router.post("/api/exit-records/{exit_id}/calculate-fnf", tags=["Exit Management"])
def calculate_fnf(
    exit_id: int,
    payload: FnfCalculationRequest = FnfCalculationRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == exit_record.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get archived record
    archived = db.query(ArchivedEmployee).filter(
        ArchivedEmployee.original_id == emp.id
    ).first()

    # Basic FnF calculation
    from datetime import date
    if emp.join_date and exit_record.last_working_day:
        jd = emp.join_date.date() if hasattr(emp.join_date, 'date') else emp.join_date
        lwd = exit_record.last_working_day.date() if hasattr(exit_record.last_working_day, 'date') else exit_record.last_working_day
        years_of_service = (lwd - jd).days / 365.25
    else:
        years_of_service = 0

    # base_salary stores the ANNUAL CTC — convert to monthly so F&F is not 12x inflated.
    monthly_salary = payload.monthlySalary if payload.monthlySalary is not None else round((emp.base_salary or 0) / 12, 2)

    # Salary until last working day — prorated by ACTUAL attendance in the
    # final month, reusing the same engine payroll uses so F&F == payroll.
    salary_until_lwd = 0.0
    final_month_attendance = {}
    try:
        from services.payroll_service import (
            _get_attendance_policy,
            _get_payroll_policy,
            _compute_attendance_payout,
        )
        lwd = exit_record.last_working_day or datetime.utcnow()
        att_policy = _get_attendance_policy(db, emp)
        pay_policy = _get_payroll_policy(db, emp)
        payout = _compute_attendance_payout(db, emp, lwd.month, lwd.year, att_policy, pay_policy)
        factor = 0.0 if not payout["employed_this_month"] else payout["factor"]
        salary_until_lwd = round(monthly_salary * factor, 2)
        final_month_attendance = {
            "month": lwd.month,
            "year": lwd.year,
            "workingDays": payout["working_days"],
            "presentDays": payout["present_days"],
            "leaveDays": payout["leave_days"],
            "holidayDays": payout["holiday_days"],
            "paidDays": payout["paid_days"],
            "unpaidDays": payout["unpaid_days"],
            "prorationFactor": round(factor, 4),
        }
    except Exception:
        salary_until_lwd = round(monthly_salary, 2)

    # Approved (not yet reimbursed) expenses due at exit
    expense_reimbursement = 0.0
    try:
        from services.exit_management_service import _approved_expenses
        expense_reimbursement = _approved_expenses(db, emp.id, exit_record.last_working_day)
    except Exception:
        expense_reimbursement = 0.0

    gratuity_days_per_year = payload.gratuityDays if payload.gratuityDays is not None else 15
    gratuity_eligible_years = payload.gratuityEligibleYears if payload.gratuityEligibleYears is not None else 5

    # Gratuity: 15 days wage per year of service (max 15 years)
    gratuity = round((monthly_salary / 26) * gratuity_days_per_year * min(years_of_service, 15), 2) if years_of_service >= gratuity_eligible_years else 0

    # Leave encashment (editable balance; defaults to the employee's actual leave balance)
    if payload.leaveBalance is not None:
        leave_balance = payload.leaveBalance
    else:
        try:
            from models import LeaveBalance
            lb = db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.year == datetime.now().year,
            ).all()
            leave_balance = sum((b.remaining_days or 0) for b in lb) if lb else 0
        except Exception:
            leave_balance = 0
    leave_encashment = round((monthly_salary / 30) * leave_balance, 2) if leave_balance else 0

    # Notice period deduction (editable days)
    notice_days = payload.noticeDays if payload.noticeDays is not None else 0
    rate_per_day = payload.noticeRatePerDay if payload.noticeRatePerDay is not None else (monthly_salary / 30)
    notice_deduction = round(rate_per_day * notice_days, 2) if notice_days else 0

    other_earnings = payload.otherEarnings if payload.otherEarnings is not None else 0
    other_deductions = payload.otherDeductions if payload.otherDeductions is not None else 0

    # Outstanding loans/advances are recovered from the settlement
    loan_recovery = 0
    try:
        from services.exit_management_service import _outstanding_loans
        loan_recovery = _outstanding_loans(db, emp.id)
    except Exception:
        loan_recovery = 0

    total_earnings = gratuity + leave_encashment + other_earnings + salary_until_lwd + expense_reimbursement
    total_deductions = notice_deduction + other_deductions + loan_recovery
    net_settlement = max(0, total_earnings - total_deductions)

    exit_record.fnf_status = "in_progress"
    # Persist the settlement snapshot so the PDF/audit reflect exactly what was calculated.
    exit_record.fnf_amount = net_settlement
    exit_record.fnf_details = {
        "gratuity": gratuity,
        "leaveEncashment": leave_encashment,
        "leaveBalance": leave_balance,
        "noticeDeduction": notice_deduction,
        "loanRecovery": loan_recovery,
        "otherEarnings": other_earnings,
        "otherDeductions": other_deductions,
        "salaryUntilLastWorkingDay": salary_until_lwd,
        "expenseReimbursement": expense_reimbursement,
        "totalEarnings": total_earnings,
        "totalDeductions": total_deductions,
        "netSettlement": net_settlement,
        "monthlySalary": monthly_salary,
        "yearsOfService": round(years_of_service, 2),
        "finalMonthAttendance": final_month_attendance,
    }
    db.commit()

    return {
        "exitId": exit_id,
        "employeeName": f"{emp.first_name} {emp.last_name}",
        "yearsOfService": round(years_of_service, 2),
        "monthlySalary": monthly_salary,
        "leaveBalance": round(leave_balance, 2),
        "gratuity": gratuity,
        "leaveEncashment": leave_encashment,
        "noticeDeduction": notice_deduction,
        "otherEarnings": other_earnings,
        "otherDeductions": other_deductions,
        "salaryUntilLastWorkingDay": salary_until_lwd,
        "expenseReimbursement": expense_reimbursement,
        "totalEarnings": round(total_earnings, 2),
        "totalDeductions": round(total_deductions, 2),
        "netSettlement": net_settlement,
        "fnfStatus": exit_record.fnf_status,
        "finalMonthAttendance": final_month_attendance,
    }


@router.get("/api/exit-records/{exit_id}/fnf/pdf", tags=["Exit Management"])
def download_fnf_pdf(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a full & final settlement PDF with all the details."""
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == exit_record.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    org = db.query(Organization).filter(Organization.id == (emp.organization_id or current_user.organization_id)).first()
    company = db.query(Company).filter(Company.id == emp.company_id).first() if emp.company_id else None
    dept = db.query(Department).filter(Department.id == emp.department_id).first() if emp.department_id else None

    # ── Use the persisted FnF snapshot (matches the UI exactly), with a
    # correct fallback if no snapshot exists yet (base_salary is ANNUAL CTC).
    fd = exit_record.fnf_details or {}
    monthly_salary = float(fd.get("monthlySalary") or round((emp.base_salary or 0) / 12, 2))
    gratuity = float(fd.get("gratuity") or 0)
    leave_encashment = float(fd.get("leaveEncashment") or 0)
    notice_deduction = float(fd.get("noticeDeduction") or 0)
    loan_recovery = float(fd.get("loanRecovery") or 0)
    other_earnings = float(fd.get("otherEarnings") or 0)
    other_deductions = float(fd.get("otherDeductions") or 0)
    salary_until_lwd = float(fd.get("salaryUntilLastWorkingDay") or 0)
    expense_reimbursement = float(fd.get("expenseReimbursement") or 0)
    net_settlement = float(exit_record.fnf_amount or fd.get("netSettlement") or 0)
    leave_balance = float(fd.get("leaveBalance") or 0)
    final_att = fd.get("finalMonthAttendance") or {}

    if emp.join_date and exit_record.last_working_day:
        jd = emp.join_date.date() if hasattr(emp.join_date, 'date') else emp.join_date
        lwd = exit_record.last_working_day.date() if hasattr(exit_record.last_working_day, 'date') else exit_record.last_working_day
        years_of_service = (lwd - jd).days / 365.25
    else:
        jd = lwd = None
        years_of_service = 0

    # ── Build PDF ──
    from fpdf import FPDF
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    primary = (25, 55, 109)
    accent = (41, 128, 185)
    light_bg = (245, 247, 250)
    text_dark = (33, 37, 41)
    text_muted = (108, 117, 125)
    success_green = (22, 115, 60)
    danger = (192, 30, 30)
    white = (255, 255, 255)

    # Header band
    pdf.set_fill_color(*primary)
    pdf.rect(0, 0, 210, 28, "F")
    pdf.set_text_color(*white)
    pdf.set_font("helvetica", "B", 15)
    pdf.set_xy(10, 8)
    pdf.cell(0, 8, "Full & Final Settlement", ln=1)
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(210, 220, 235)
    pdf.set_x(10)
    pdf.cell(0, 6, (org.name if org else "Our Organisation"), ln=1)
    pdf.set_x(10)
    pdf.cell(0, 6, "Employee Exit Settlement Statement", ln=1)

    pdf.set_text_color(*text_dark)
    pdf.ln(8)

    # Employee details
    pdf.set_fill_color(*light_bg)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_x(10); pdf.cell(0, 7, "Employee Details", fill=True, ln=1)
    pdf.ln(2)
    rows = [
        ("Employee Name", f"{emp.first_name} {emp.last_name or ''}".strip() or "—"),
        ("Employee Code", emp.employee_code or "—"),
        ("Designation", emp.designation or "—"),
        ("Company", company.name if company else "—"),
        ("Department", dept.name if dept else "—"),
        ("Date of Joining", jd.strftime("%d %B %Y") if emp.join_date else "—"),
        ("Last Working Day", lwd.strftime("%d %B %Y") if exit_record.last_working_day else "—"),
        ("Exit Type", str(exit_record.exit_type).title() if exit_record.exit_type else "—"),
        ("Years of Service", f"{years_of_service:.1f} years"),
    ]
    for label, value in rows:
        pdf.set_font("helvetica", "", 9.5)
        pdf.set_text_color(*text_muted)
        pdf.set_x(12); pdf.cell(50, 6, label)
        pdf.set_text_color(*text_dark)
        pdf.cell(0, 6, str(value), ln=1)

    pdf.ln(4)

    # Settlement summary
    pdf.set_fill_color(*light_bg)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_x(10); pdf.cell(0, 7, "Settlement Summary", fill=True, ln=1)
    pdf.ln(2)

    def row(label, value, amount=True, bold=False, color=None):
        pdf.set_font("helvetica", "B" if bold else "", 9.5)
        pdf.set_text_color(*(color if color else text_dark))
        pdf.set_x(12); pdf.cell(90, 6.5, label)
        pdf.set_font("helvetica", "B" if bold else "", 9.5)
        if amount:
            pdf.cell(0, 6.5, f"Rs. {value:,.2f}", align="R", ln=1)
        else:
            pdf.cell(0, 6.5, str(value), align="R", ln=1)

    row("Monthly Salary", monthly_salary)
    row("Years of Service", f"{years_of_service:.1f}", amount=False)
    pdf.ln(1)
    pdf.set_draw_color(200, 205, 212)
    pdf.line(12, pdf.get_y(), 198, pdf.get_y())
    pdf.ln(2)
    pdf.set_font("helvetica", "B", 9)
    pdf.set_x(12); pdf.cell(0, 6, "Earnings")
    pdf.ln(2)
    row("Salary till Last Working Day", salary_until_lwd)
    row("Gratuity", gratuity)
    row("Leave Encashment", leave_encashment)
    row("Expense Reimbursement", expense_reimbursement)
    if other_earnings:
        row("Other Earnings", other_earnings)
    pdf.ln(1)
    pdf.set_draw_color(200, 205, 212)
    pdf.line(12, pdf.get_y(), 198, pdf.get_y())
    pdf.ln(2)
    pdf.set_font("helvetica", "B", 9)
    pdf.set_x(12); pdf.cell(0, 6, "Deductions")
    pdf.ln(2)
    row("Notice Period Deduction", notice_deduction, color=danger)
    row("Loan / Advance Recovery", loan_recovery, color=danger)
    if other_deductions:
        row("Other Deductions", other_deductions, color=danger)
    pdf.ln(1)
    pdf.set_draw_color(150, 160, 175)
    pdf.line(12, pdf.get_y(), 198, pdf.get_y())
    pdf.ln(2)
    row("NET SETTLEMENT", net_settlement, bold=True, color=success_green)
    if final_att:
        pdf.ln(3)
        pdf.set_font("helvetica", "B", 9)
        pdf.set_x(12); pdf.cell(0, 6, f"Final Month Attendance ({final_att.get('month', '')}/{final_att.get('year', '')}): {final_att.get('presentDays', 0)} present / {final_att.get('paidDays', 0)} paid / {final_att.get('workingDays', 0)} working days")
    pdf.ln(2)

    # Footer
    pdf.set_font("helvetica", "I", 8)
    pdf.set_text_color(*text_muted)
    pdf.set_x(12)
    pdf.multi_cell(0, 5, "This is a system-generated statement. The settlement will be disbursed after all clearances are complete.", align="C")

    import urllib.parse
    safe_name = urllib.parse.quote((f"{emp.first_name}_{emp.last_name or 'Employee'}").replace(' ', '_'))
    pdf_bytes = bytes(pdf.output(dest="S"))
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="FNF_{safe_name}.pdf"'},
    )


@router.post("/api/exit-records/{exit_id}/complete-fnf", tags=["Exit Management"])
def complete_fnf(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == exit_record.employee_id).first()

    exit_record.fnf_status = "completed"
    exit_record.fnf_completed_at = datetime.utcnow()

    # Post the F&F settlement journal (double-entry GL).
    try:
        from services.accounting_service import post_fnf_journal
        post_fnf_journal(db, exit_record, exit_record.fnf_details or {}, current_user)
    except Exception as e:
        logger.exception("Failed to post FnF journal for exit %s", exit_id)
        raise HTTPException(status_code=500, detail=f"FnF completed but journal posting failed: {e}")

    # Revoke login/access for the departed employee so they can't clock in or use the app.
    if emp:
        emp.status = "inactive"
        if emp.user_id:
            user = db.query(User).filter(User.id == emp.user_id).first()
            if user:
                user.is_active = False
                user.token_version = (user.token_version or 0) + 1

    db.commit()

    return {
        "status": "success",
        "message": "FnF completed",
        "exitId": exit_id,
        "fnfStatus": exit_record.fnf_status,
        "clearanceStatus": exit_record.clearance_status,
    }


@router.post("/api/exit-records/{exit_id}/mark-clearance-complete", tags=["Exit Management"])
def mark_clearance_complete(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all clearance items as done for an exit record."""
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)
    exit_record.clearance_status = "completed"
    exit_record.clearance_completed_at = datetime.utcnow()
    db.commit()
    return {
        "status": "success",
        "message": "Clearance marked complete",
        "exitId": exit_id,
        "clearanceStatus": exit_record.clearance_status,
    }


@router.get("/api/exit-records/{exit_id}/clearance/pdf", tags=["Exit Management"])
def download_clearance_pdf(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a comprehensive clearance form PDF."""
    from fpdf import FPDF
    import io
    from fastapi.responses import StreamingResponse

    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == exit_record.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    org = db.query(Organization).filter(Organization.id == emp.organization_id).first() if emp.organization_id else None
    company = db.query(Company).filter(Company.id == emp.company_id).first() if emp.company_id else None
    dept = db.query(Department).filter(Department.id == emp.department_id).first() if emp.department_id else None
    branches_list = [b.branch.name for b in db.query(EmployeeBranchAssignment).filter(EmployeeBranchAssignment.employee_id == emp.id, EmployeeBranchAssignment.status == "active").all() if hasattr(b, 'branch') and b.branch]

    class ClearancePDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 14)
            self.cell(0, 8, "EMPLOYEE CLEARANCE FORM", align="C", new_x="LMARGIN", new_y="NEXT")
            self.set_font("Helvetica", "", 9)
            self.cell(0, 5, f"{org.name if org else 'Organization'} | Generated: {datetime.now().strftime('%d %b %Y %I:%M %p')}", align="C", new_x="LMARGIN", new_y="NEXT")
            self.line(10, self.get_y() + 2, 200, self.get_y() + 2)
            self.ln(5)
        def footer(self):
            self.set_y(-15)
            self.set_font("Helvetica", "I", 7)
            self.cell(0, 10, f"Page {self.page_no()}/{{nb}} | Confidential HR Document", align="C")

    pdf = ClearancePDF(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Section 1: Employee Details
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "1. EMPLOYEE DETAILS", new_x="LMARGIN", new_y="NEXT")
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 9)
    fields = [
        ("Employee Name", f"{emp.first_name} {emp.last_name or ''}".strip()),
        ("Employee Code", emp.employee_code or "-"),
        ("Phone", emp.phone or "-"),
        ("Email", emp.email or "-"),
        ("Address", getattr(emp, 'address', '') or "-"),
        ("Company", company.name if company else "-"),
        ("Branch", ", ".join(branches_list) or "-"),
        ("Department", dept.name if dept else "-"),
        ("Designation", getattr(emp, 'designation', '') or "-"),
        ("Join Date", emp.join_date.strftime("%d %b %Y") if emp.join_date else "-"),
        ("Last Working Day", exit_record.last_working_day.strftime("%d %b %Y") if exit_record.last_working_day else "-"),
        ("Exit Type", (exit_record.exit_type or "-").title()),
        ("Exit Date", exit_record.exit_date.strftime("%d %b %Y") if exit_record.exit_date else "-"),
    ]
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(40, 6, "Field", border=1)
    pdf.cell(150, 6, "Value", border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    for label, value in fields:
        pdf.cell(40, 6, label, border=1)
        pdf.cell(150, 6, str(value)[:80], border=1, new_x="LMARGIN", new_y="NEXT")

    # Section 2: FnF Settlement
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "2. FULL & FINAL SETTLEMENT", new_x="LMARGIN", new_y="NEXT")
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    fnf = exit_record.fnf_details or {}
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, "Earnings", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    earnings = [
        ("Salary till Last Working Day", fnf.get("salary_until_last_working_day", 0)),
        ("Gratuity", fnf.get("gratuity", 0)),
        ("Leave Encashment", fnf.get("leave_encashment", 0)),
        ("Expense Reimbursement", fnf.get("expense_reimbursement", 0)),
        ("Other Earnings", fnf.get("other_earnings", 0)),
    ]
    for label, amount in earnings:
        pdf.cell(100, 5, label, border=1)
        pdf.cell(90, 5, f"Rs. {float(amount or 0):,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    total_earnings = fnf.get("total_earnings", sum(a for _, a in earnings))
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(100, 6, "Total Earnings", border=1)
    pdf.cell(90, 6, f"Rs. {float(total_earnings or 0):,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 6, "Deductions", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    deductions = [
        ("Notice Period Deduction", fnf.get("notice_deduction", 0)),
        ("Other Deductions", fnf.get("other_deductions", 0)),
    ]
    for label, amount in deductions:
        pdf.cell(100, 5, label, border=1)
        pdf.cell(90, 5, f"Rs. {float(amount or 0):,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    total_deductions = fnf.get("total_deductions", sum(a for _, a in deductions))
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(100, 6, "Total Deductions", border=1)
    pdf.cell(90, 6, f"Rs. {float(total_deductions or 0):,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    net = fnf.get("net_settlement", (total_earnings or 0) - (total_deductions or 0))
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(100, 7, "Net Settlement Amount", border=1)
    pdf.cell(90, 7, f"Rs. {float(net or 0):,.2f}", border=1, align="R", new_x="LMARGIN", new_y="NEXT")

    # Section 3: Clearance Checklist
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "3. CLEARANCE CHECKLIST", new_x="LMARGIN", new_y="NEXT")
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    from services.exit_management_service import get_clearance_checklist
    checklist = get_clearance_checklist()
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(10, 6, "S.No", border=1, align="C")
    pdf.cell(80, 6, "Checklist Item", border=1)
    pdf.cell(30, 6, "Department", border=1)
    pdf.cell(25, 6, "Status", border=1, align="C")
    pdf.cell(45, 6, "Remarks", border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    cleared_items = getattr(exit_record, 'clearance_checklist', None) or []
    for i, item in enumerate(checklist, 1):
        status = "Cleared" if item.get("item") in cleared_items else "Pending"
        pdf.cell(10, 5, str(i), border=1, align="C")
        pdf.cell(80, 5, item.get("item", "")[:50], border=1)
        pdf.cell(30, 5, item.get("department", "General")[:20], border=1)
        pdf.cell(25, 5, status, border=1, align="C")
        pdf.cell(45, 5, "", border=1, new_x="LMARGIN", new_y="NEXT")

    # Section 4: Signatures
    pdf.ln(10)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "4. SIGNATURES", new_x="LMARGIN", new_y="NEXT")
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(60, 5, "Employee Signature", border=1)
    pdf.cell(10, 5, "")
    pdf.cell(60, 5, "HR Department", border=1)
    pdf.cell(10, 5, "")
    pdf.cell(50, 5, "Management", border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(20)
    pdf.cell(60, 5, "________________________", border=1)
    pdf.cell(10, 5, "")
    pdf.cell(60, 5, "________________________", border=1)
    pdf.cell(10, 5, "")
    pdf.cell(50, 5, "________________________", border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 7)
    pdf.cell(60, 4, f"{emp.first_name} {emp.last_name or ''}", align="C")
    pdf.cell(10, 4, "")
    pdf.cell(60, 4, "HR Manager", align="C")
    pdf.cell(10, 4, "")
    pdf.cell(50, 4, "Authorized Signatory", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(0, 5, f"Date: {datetime.now().strftime('%d %B %Y')}", align="R", new_x="LMARGIN", new_y="NEXT")

    pdf_bytes = pdf.output()
    if isinstance(pdf_bytes, str):
        pdf_bytes = pdf_bytes.encode("latin-1")

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=clearance_{emp.employee_code or exit_id}.pdf"}
    )


@router.post("/api/exit-records/{exit_id}/archive", tags=["Exit Management"])
def archive_exit_record(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archive an exit record once FnF settlement + clearance are both complete.

    Moves the record to the archive section by creating an ArchivedEmployee
    snapshot and marking the exit record as archived.
    """
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)
    if exit_record.fnf_status != "completed" or exit_record.clearance_status != "completed":
        raise HTTPException(status_code=400, detail="Both FnF settlement and clearance must be completed before archiving")

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == exit_record.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Check it isn't already archived
    existing = db.query(ArchivedEmployee).filter(
        ArchivedEmployee.original_id == emp.id,
        ArchivedEmployee.exit_record_id == exit_record.id,
    ).first()
    if existing:
        return {"status": "success", "message": "Already archived", "archivedId": existing.id}

    archived = ArchivedEmployee(
        original_id=emp.id,
        exit_record_id=exit_record.id,
        organization_id=emp.organization_id,
        company_id=emp.company_id,
        department_id=emp.department_id,
        full_name=employee_display_name(emp),
        first_name=emp.first_name,
        last_name=emp.last_name,
        email=emp.email,
        employee_code=emp.employee_code,
        phone=emp.phone,
        gender=emp.gender,
        date_of_birth=emp.date_of_birth,
        blood_group=emp.blood_group,
        marital_status=emp.marital_status,
        address=emp.address,
        designation=emp.designation,
        employment_type=emp.employment_type,
        join_date=emp.join_date,
        exit_type=exit_record.exit_type,
        exit_date=exit_record.exit_date,
        last_working_day=exit_record.last_working_day,
        aadhar_number=emp.aadhar_number,
        pan_number=emp.pan_number,
        pf_number=emp.pf_number,
        pf_uan=emp.pf_uan,
        esic_number=emp.esic_number,
        bank_name=emp.bank_name,
        bank_account_number=emp.bank_account_number,
        ifsc_code=emp.ifsc_code,
        archive_date=datetime.utcnow(),
        archived_by=current_user.id,
        archive_reason=exit_record.reason,
        fnf_settled_date=exit_record.fnf_completed_at,
    )
    db.add(archived)
    exit_record.archived_at = datetime.utcnow()
    db.commit()

    return {
        "status": "success",
        "message": "Employee archived",
        "archivedId": archived.id,
        "exitId": exit_record.id,
    }


@router.post("/api/archived-employees/{archived_id}/restore", tags=["Exit Management"])
def restore_archived_employee(
    archived_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore an archived employee back to active status.

    Re-activates the employee, removes the archive snapshot, and re-opens the
    associated exit record so the lifecycle can start over.
    """
    archived = db.query(ArchivedEmployee).filter(ArchivedEmployee.id == archived_id).first()
    if not archived:
        raise HTTPException(status_code=404, detail="Archived record not found")
    if current_user.role != "superadmin":
        org_owned(archived, current_user.organization_id)

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == archived.original_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Original employee not found")

    emp.status = "active"
    emp.termination_type = None
    emp.termination_date = None
    emp.date_of_leaving = None

    # Re-open the exit record so it shows on the Exit Management page
    if archived.exit_record_id:
        er = db.query(ExitRecord).filter(ExitRecord.id == archived.exit_record_id).first()
        if er:
            er.archived_at = None
            er.deleted_at = None
            er.fnf_status = "pending"
            er.clearance_status = "pending"
            er.fnf_completed_at = None

    # Log lifecycle event
    event = EmployeeLifecycleEvent(
        employee_id=emp.id,
        event_type="restore",
        event_date=datetime.utcnow(),
        description=f"Employee restored from archive",
        recorded_by=current_user.id,
        from_value="archived",
        to_value="active",
    )
    db.add(event)

    # Remove the archive snapshot
    db.delete(archived)
    db.commit()

    return {
        "status": "success",
        "message": f"Employee {emp.first_name} {emp.last_name} restored to active",
        "employeeId": emp.id,
    }


@router.patch("/api/employees/{employee_id}/restore", tags=["Exit Management"])
def restore_employee_by_id(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore an employee from the archived list by employee id (UI alias)."""
    archived = db.query(ArchivedEmployee).filter(
        ArchivedEmployee.original_id == employee_id
    ).order_by(ArchivedEmployee.id.desc()).first()
    if not archived:
        raise HTTPException(status_code=404, detail="Archived record not found for this employee")
    if current_user.role != "superadmin":
        org_owned(archived, current_user.organization_id)

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == archived.original_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Original employee not found")

    emp.status = "active"
    emp.termination_type = None
    emp.termination_date = None
    emp.date_of_leaving = None

    if archived.exit_record_id:
        er = db.query(ExitRecord).filter(ExitRecord.id == archived.exit_record_id).first()
        if er:
            er.archived_at = None
            er.deleted_at = None
            er.fnf_status = "pending"
            er.clearance_status = "pending"
            er.fnf_completed_at = None

    event = EmployeeLifecycleEvent(
        employee_id=emp.id,
        event_type="restore",
        event_date=datetime.utcnow(),
        description=f"Employee restored from archive",
        recorded_by=current_user.id,
        from_value="archived",
        to_value="active",
    )
    db.add(event)
    db.delete(archived)
    db.commit()

    return {
        "status": "success",
        "message": f"Employee {emp.first_name} {emp.last_name} restored to active",
        "employeeId": emp.id,
    }


@router.get("/api/exit-records/{exit_id}/document/{doc_type}")
def generate_exit_document(
    exit_id: int,
    doc_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an exit document PDF (experience-letter | relieving-letter | tax-form | fnf)."""
    exit_record = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None), ExitRecord.id == exit_id).first()
    if not exit_record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if current_user.role != "superadmin":
        org_owned(exit_record, current_user.organization_id)
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == exit_record.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    org = db.query(Organization).filter(Organization.id == (emp.organization_id or current_user.organization_id)).first()
    company = db.query(Company).filter(Company.id == emp.company_id).first() if emp.company_id else None
    org_name = org.legal_name or org.name if org else "Our Organisation"
    emp_name = f"{emp.first_name} {emp.last_name or ''}".strip() or "Employee"
    doj = emp.join_date.strftime("%d %B %Y") if emp.join_date else "—"
    lwd = exit_record.last_working_day.strftime("%d %B %Y") if exit_record.last_working_day else "—"
    designation = emp.designation or emp.designation_name or "Employee"
    years = 0
    if emp.join_date and exit_record.last_working_day:
        try:
            years = max(0, (exit_record.last_working_day - emp.join_date).days / 365.25)
        except Exception:
            years = 0

    from services.document_pdf_service import render_document_pdf, country_config
    org_country = getattr(org, "country", None) or "India"
    company_country = getattr(company, "country", None)
    country_code = (company_country or org_country or "India").strip()
    cfg = country_config(country_code)

    org_dict = {
        "name": org.name if org else "Our Organisation",
        "legal_name": org.legal_name or (org.name if org else "Our Organisation"),
        "address": org.address or "",
        "email": org.email or "",
        "phone": org.phone or "",
        "logo_url": org.logo_url or "",
        "country": org_country,
    }
    company_dict = None
    if company:
        company_dict = {"name": company.name, "logo_url": company.logo or "", "country": company_country}

    doc_type = doc_type.lower()
    if doc_type == "experience-letter":
        title = "Experience Letter"
        body = (
            f"This is to certify that **{emp_name}** was employed with {org_name} as "
            f"**{designation}** from {doj} to {lwd}.\n\n"
            f"During their tenure of approximately {years:.1f} year(s), they demonstrated professionalism, "
            f"dedication and a strong work ethic. We wish them success in all future endeavours."
        )
    elif doc_type == "relieving-letter":
        title = "Relieving Letter"
        body = (
            f"Mr./Ms. **{emp_name}**, who was employed as **{designation}** with "
            f"{org_name} from {doj}, has been relieved from their duties effective **{lwd}**.\n\n"
            f"We confirm that there are no outstanding obligations towards the organisation. All company "
            f"property and access have been returned."
        )
    elif doc_type == "form16" or doc_type == "tax-form":
        title = cfg["tax_form_name"]
        if not cfg.get("has_income_tax"):
            body = (
                f"{emp_name} was employed with {org_name} as {designation} from {doj} to {lwd}.\n\n"
                f"{cfg['no_tax_note']}\n\n"
                f"This document serves as an employment/income certificate for the period {doj} to {lwd}."
            )
        elif cfg["tax_form"] == "W-2":
            title = "W-2 Wage and Tax Statement"
            body = (
                f"Wage and Tax Statement for the tax year.\n\n"
                f"Employee Name: **{emp_name}**\n"
                f"Social Security Number: {emp.pf_uan or emp.employee_code or '—'}\n"
                f"Employer: {org_name}\n"
                f"Wages, tips, other compensation: Refer to payroll records\n"
                f"Federal income tax withheld: Refer to payroll records\n\n"
                f"This is a system-generated summary. Detailed figures are available in the payroll module."
            )
        elif cfg["tax_form"] == "P45":
            title = "P45 (Certificate of Pay and Tax Deducted)"
            body = (
                f"Certificate of Pay and Tax Deducted for **{emp_name}** ({designation}).\n\n"
                f"Employer: {org_name}\n"
                f"Period of employment: {doj} to {lwd}\n"
                f"PAYE tax deducted: Refer to payroll records\n\n"
                f"This is a system-generated summary. Detailed figures are available in the payroll module."
            )
        else:
            body = (
                f"Tax Certificate under the applicable law for **{emp_name}** ({designation}).\n\n"
                f"Employer: {org_name}\n"
                f"Period: {doj} to {lwd}\n\n"
                f"Tax form applicable: {cfg['tax_form_name']}"
            )
    elif doc_type == "fnf":
        title = "Full & Final Settlement"
        body = (
            f"Full & Final settlement summary for **{emp_name}** ({designation}).\n\n"
            f"Date of joining: {doj}\n"
            f"Last working day: {lwd}\n"
            f"Years of service: {years:.1f}\n\n"
            f"Settlement details (gratuity, leave encashment, net settlement) are available under the "
            f"F&F Settlement tab and can be downloaded as a separate F&F PDF."
        )
    else:
        raise HTTPException(status_code=400, detail="Unknown document type")

    pdf_bytes = render_document_pdf(
        title=title,
        body_html_parts=body,
        org=org_dict,
        company=company_dict,
        country=country_code,
    )

    import urllib.parse
    safe_name = urllib.parse.quote(emp_name.replace(' ', '_'))
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_{doc_type}.pdf"'},
    )


@router.get("/api/archived-employees", tags=["Exit Management"])
def list_archived_employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ArchivedEmployee)
    if current_user.role != "superadmin":
        query = query.filter(ArchivedEmployee.organization_id == current_user.organization_id)
    records = query.order_by(ArchivedEmployee.archive_date.desc()).all()
    # Resolve company + department names (and branch via the employee record)
    company_ids = {a.company_id for a in records if a.company_id}
    dept_ids = {a.department_id for a in records if a.department_id}
    companies = {c.id: c.name for c in db.query(Company).filter(Company.id.in_(company_ids)).all()} if company_ids else {}
    depts = {d.id: d.name for d in db.query(Department).filter(Department.id.in_(dept_ids)).all()} if dept_ids else {}
    return [
        {
            "id": a.id,
            "originalId": a.original_id,
            "name": employee_display_name(a),
            "fullName": employee_display_name(a),
            "email": a.email,
            "employeeCode": a.employee_code,
            "designation": a.designation,
            "exitType": a.exit_type,
            "exitDate": a.exit_date.isoformat() if a.exit_date else None,
            "archiveDate": a.archive_date.isoformat() if a.archive_date else None,
            "fnfSettledDate": a.fnf_settled_date.isoformat() if a.fnf_settled_date else None,
            "companyId": a.company_id,
            "companyName": companies.get(a.company_id),
            "departmentId": a.department_id,
            "departmentName": depts.get(a.department_id),
            "branchIds": [],
            "branchNames": [],
        }
        for a in records
    ]


@router.get("/api/employees/template", tags=["Employees"])
def get_employees_template(current_user: User = Depends(get_current_user)):
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["firstName", "lastName", "email", "phone", "designation", "departmentId", "status"])
    writer.writerow(["John", "Doe", "john@example.com", "1234567890", "Developer", "1", "active"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employee_template.csv"},
    )


@router.post("/api/employees/bulk-upload", tags=["Employees"])
async def bulk_upload_employees(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv, io
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode()))
    count = 0
    for row in reader:
        emp = Employee(
            first_name=row.get("firstName"),
            last_name=row.get("lastName"),
            email=row.get("email"),
            phone=row.get("phone"),
            designation=row.get("designation"),
            status=row.get("status", "active"),
        )
        db.add(emp)
        count += 1
    db.commit()
    return {"message": f"{count} employees uploaded", "count": count}


@router.get("/api/my-permissions", tags=["Permissions"])
def get_my_permissions_main(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {
        "userId": current_user.id,
        "role": current_user.role,
        "organizationId": current_user.organization_id,
        "modules": {
            "dashboard": True,
            "employees": True,
            "attendance": True,
            "leaves": True,
            "payroll": current_user.role in ("superadmin", "admin", "hr_admin"),
            "expenses": True,
            "holidays": True,
            "performance": True,
            "recruitment": True,
            "reports": current_user.role in ("superadmin", "admin"),
            "settings": current_user.role in ("superadmin", "admin"),
        },
    }

