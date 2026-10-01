"""HRMS API dashboard routes."""
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
from sqlalchemy import case, event, func, inspect, or_, text, Integer
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, with_loader_criteria

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.tenant import get_header_company_id
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from core.schemas import (UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from database import Base, SessionLocal, engine, get_db, get_read_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from core.datetime_utils import ist_now_naive, ist_today_str, ist_month_start_str, ist_month_end_str
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Dashboard"])




@cached(ttl=60)
@router.get("/api/dashboard/summary", tags=["Dashboard"])
def get_dashboard_summary(
    companyId: Optional[int] = None,
    months: int = 6,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    org_id = current_user.organization_id
    companyId = resolve_company_scope(db, current_user, companyId, request)

    # Validate company belongs to the org if provided
    if companyId:
        comp = db.query(Company).filter(
            Company.id == companyId,
            Company.organization_id == org_id,
            Company.deleted_at.is_(None),
        ).first()
        if not comp:
            raise HTTPException(status_code=404, detail="Company not found")

    def _org_scope(q):
        if org_id:
            q = q.filter(Employee.organization_id == org_id)
        if companyId:
            q = q.filter(Employee.company_id == companyId)
        return q

    now = ist_now_naive()
    today_str = now.strftime("%Y-%m-%d")
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    last_day = calendar.monthrange(now.year, now.month)[1]
    month_end = f"{now.year}-{now.month:02d}-{last_day}"

    # Base employee query (org + optional company scoped)
    emp_q = _org_scope(db.query(Employee).filter(Employee.deleted_at.is_(None)))

    # --- Employee counts ---
    total_employees = emp_q.count()
    active_employees = emp_q.filter(Employee.status == "active").count()
    male_count = emp_q.filter(func.lower(Employee.gender) == "male").count()
    female_count = emp_q.filter(func.lower(Employee.gender) == "female").count()
    new_hires = emp_q.filter(Employee.join_date >= month_start, Employee.join_date <= month_end).count()
    attritions = emp_q.filter(Employee.termination_date >= month_start, Employee.termination_date <= month_end).count()

    # --- Department distribution (single query with all filters applied) ---
    dept_dist = {}
    dept_codes = {}
    dept_q = db.query(Employee.department_id, func.count(Employee.id)).filter(Employee.deleted_at.is_(None))
    if org_id:
        dept_q = dept_q.filter(Employee.organization_id == org_id)
    if companyId:
        dept_q = dept_q.filter(Employee.company_id == companyId)
    dept_counts = dict(dept_q.group_by(Employee.department_id).all())
    dept_names_map = {}
    if dept_counts:
        dept_ids = list(dept_counts.keys())
        for dname, did, dcode in db.query(Department.name, Department.id, Department.code).filter(
            Department.id.in_(dept_ids), Department.deleted_at.is_(None)
        ).all():
            dept_names_map[did] = dname
            if dcode:
                dept_codes[dname] = dcode
    for did, cnt in dept_counts.items():
        name = dept_names_map.get(did, f"Department {did}")
        if cnt > 0:
            dept_dist[name] = cnt

    # --- Age distribution (single query, compute age in SQL) ---
    age_brackets = {"18-25": 0, "26-35": 0, "36-45": 0, "46-55": 0, "55+": 0}
    dob_q = db.query(Employee.date_of_birth).filter(Employee.deleted_at.is_(None), Employee.date_of_birth.isnot(None))
    if org_id:
        dob_q = dob_q.filter(Employee.organization_id == org_id)
    if companyId:
        dob_q = dob_q.filter(Employee.company_id == companyId)
    age_expr = func.extract('year', func.age(func.now(), Employee.date_of_birth))
    age_rows = dict(
        db.query(
            func.cast(func.floor(age_expr / 10), Integer) * 10,
            func.count(Employee.id),
        )
        .filter(Employee.deleted_at.is_(None), Employee.date_of_birth.isnot(None))
        .group_by(func.cast(func.floor(age_expr / 10), Integer) * 10)
        .all()
    )
    if org_id:
        age_rows = dict(
            db.query(
                func.cast(func.floor(age_expr / 10), Integer) * 10,
                func.count(Employee.id),
            )
            .filter(Employee.deleted_at.is_(None), Employee.organization_id == org_id, Employee.date_of_birth.isnot(None))
            .group_by(func.cast(func.floor(age_expr / 10), Integer) * 10)
            .all()
        )
    if companyId:
        age_rows = dict(
            db.query(
                func.cast(func.floor(age_expr / 10), Integer) * 10,
                func.count(Employee.id),
            )
            .filter(Employee.deleted_at.is_(None), Employee.company_id == companyId, Employee.date_of_birth.isnot(None))
            .group_by(func.cast(func.floor(age_expr / 10), Integer) * 10)
            .all()
        )
    for decade, cnt in age_rows.items():
        low = decade
        high = decade + 9
        if high <= 25:
            age_brackets["18-25"] += cnt
        elif low <= 35:
            age_brackets["26-35"] += cnt
        elif low <= 45:
            age_brackets["36-45"] += cnt
        elif low <= 55:
            age_brackets["46-55"] += cnt
        else:
            age_brackets["55+"] += cnt

    # --- Today's attendance (range query so it can use the check_in index) ---
    att_today = db.query(Attendance).filter(
        Attendance.deleted_at.is_(None),
        Attendance.check_in >= f"{today_str} 00:00:00",
        Attendance.check_in < f"{today_str} 23:59:59",
    )
    if org_id:
        att_today = att_today.join(Employee, Attendance.employee_id == Employee.id).filter(Employee.organization_id == org_id)
    if companyId:
        att_today = att_today.filter(Attendance.company_id == companyId)
    present_today = att_today.filter(Attendance.status.in_(["present", "late", "work_from_home", "half_day"])).count()
    late_today = att_today.filter(Attendance.is_late == True).count()
    early_departures = att_today.filter(Attendance.is_early_departure == True).count()

    # Employees who never clocked in today
    emp_today_q = db.query(Attendance.employee_id).filter(
        Attendance.deleted_at.is_(None),
        Attendance.date == today_str,
    )
    if companyId:
        emp_today_q = emp_today_q.filter(Attendance.company_id == companyId)
    emp_today_ids = {r[0] for r in emp_today_q.all()}

    absent_q = db.query(Employee).filter(
        Employee.deleted_at.is_(None),
        Employee.status == "active",
        Employee.id.notin_(emp_today_ids),
    )
    if companyId:
        absent_q = absent_q.filter(Employee.company_id == companyId)
    if org_id:
        absent_q = absent_q.filter(Employee.organization_id == org_id)
    absent_today = absent_q.count()

    # --- Leave stats ---
    leave_base = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None))
    if org_id:
        leave_base = leave_base.join(Employee, LeaveApplication.employee_id == Employee.id).filter(Employee.organization_id == org_id)
    if companyId:
        leave_base = leave_base.filter(LeaveApplication.company_id == companyId)
    pending_leaves = leave_base.filter(LeaveApplication.status == "pending").count()
    leaves_this_month = leave_base.filter(
        LeaveApplication.status == "approved",
        LeaveApplication.start_date >= month_start,
        LeaveApplication.start_date <= month_end,
    ).count()

    # --- Expense stats (filter via employee's org/company) ---
    expense_q = db.query(Expense).filter(Expense.deleted_at.is_(None))
    if org_id or companyId:
        expense_q = expense_q.join(Employee, Expense.employee_id == Employee.id)
        if org_id:
            expense_q = expense_q.filter(Employee.organization_id == org_id)
        if companyId:
            expense_q = expense_q.filter(Employee.company_id == companyId)
    pending_expenses = expense_q.filter(Expense.status == "pending").count()
    expense_total = expense_q.filter(
        Expense.expense_date >= month_start,
        Expense.expense_date <= month_end,
    ).with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar()

    # --- Upcoming holidays (next 5, org/company scoped) ---
    holiday_q = db.query(Holiday).filter(Holiday.deleted_at.is_(None), Holiday.date >= today_str)
    if org_id:
        holiday_q = holiday_q.filter(Holiday.organization_id == org_id)
    if companyId:
        holiday_q = holiday_q.filter(Holiday.company_id == companyId)
    upcoming_holidays = holiday_q.order_by(Holiday.date).limit(5).all()

    holidays_list = [
        {"name": h.name, "date": h.date.strftime("%Y-%m-%d") if hasattr(h.date, "strftime") else str(h.date), "type": h.type or "public"}
        for h in upcoming_holidays
    ]

    # --- Performance (org/company scoped) ---
    perf_base = db.query(PerformanceReview).filter(
        PerformanceReview.deleted_at.is_(None),
        PerformanceReview.overall_score.isnot(None)
    )
    if current_user.role != "superadmin" and org_id:
        perf_base = perf_base.filter(PerformanceReview.organization_id == org_id)
    if companyId:
        perf_base = perf_base.filter(PerformanceReview.company_id == companyId)
    avg_rating = perf_base.with_entities(func.avg(PerformanceReview.overall_score)).scalar() or 0

    reviews_this_month = db.query(func.count(PerformanceReview.id)).filter(
        PerformanceReview.deleted_at.is_(None),
        PerformanceReview.created_at >= month_start,
        PerformanceReview.created_at <= month_end,
    )
    if current_user.role != "superadmin" and org_id:
        reviews_this_month = reviews_this_month.filter(PerformanceReview.organization_id == org_id)
    if companyId:
        reviews_this_month = reviews_this_month.filter(PerformanceReview.company_id == companyId)
    reviews_this_month = reviews_this_month.scalar() or 0

    # --- Monthly trend ---
    # The trend always runs from January of the current calendar year through
    # the current month (Jan–Dec), so it covers a full year for all regions —
    # not just an Indian financial year (which starts in April).
    # Aggregated in 6 batched GROUP BY queries (not 8 months x 6 queries) so it
    # scales to millions of rows.
    year_start = f"{now.year}-01-01"
    year_end = f"{now.year}-12-31"

    att_by_month = dict(
        db.query(
            func.date_trunc('month', Attendance.check_in).label('bkt'),
            func.count(Attendance.id),
        )
        .filter(
            Attendance.deleted_at.is_(None),
            Attendance.check_in >= year_start, Attendance.check_in <= year_end,
        )
        .group_by('bkt')
        .all()
    )
    if org_id:
        att_by_month = dict(
            db.query(
                func.date_trunc('month', Attendance.check_in).label('bkt'),
                func.count(Attendance.id),
            )
            .join(Employee, Attendance.employee_id == Employee.id)
            .filter(
                Attendance.deleted_at.is_(None),
                Attendance.check_in >= year_start, Attendance.check_in <= year_end,
                Employee.organization_id == org_id,
            )
            .group_by('bkt')
            .all()
        )
    elif companyId:
        att_by_month = dict(
            db.query(
                func.date_trunc('month', Attendance.check_in).label('bkt'),
                func.count(Attendance.id),
            )
            .filter(
                Attendance.deleted_at.is_(None),
                Attendance.check_in >= year_start, Attendance.check_in <= year_end,
                Attendance.company_id == companyId,
            )
            .group_by('bkt')
            .all()
        )

    lv_by_month = dict(
        db.query(
            func.date_trunc('month', LeaveApplication.created_at).label('bkt'),
            func.count(LeaveApplication.id),
        )
        .filter(LeaveApplication.deleted_at.is_(None))
        .group_by('bkt')
        .all()
    )
    if org_id:
        lv_by_month = dict(
            db.query(
                func.date_trunc('month', LeaveApplication.created_at).label('bkt'),
                func.count(LeaveApplication.id),
            )
            .join(Employee, LeaveApplication.employee_id == Employee.id)
            .filter(LeaveApplication.deleted_at.is_(None), Employee.organization_id == org_id)
            .group_by('bkt')
            .all()
        )
    elif companyId:
        lv_by_month = dict(
            db.query(
                func.date_trunc('month', LeaveApplication.created_at).label('bkt'),
                func.count(LeaveApplication.id),
            )
            .filter(LeaveApplication.deleted_at.is_(None), LeaveApplication.company_id == companyId)
            .group_by('bkt')
            .all()
        )

    pay_rows = db.query(Payroll.year, Payroll.month, func.coalesce(func.sum(Payroll.net_salary), 0)).filter(
        Payroll.deleted_at.is_(None), Payroll.year == now.year
    )
    if current_user.role != "superadmin" and org_id:
        pay_rows = pay_rows.filter(Payroll.organization_id == org_id)
    if companyId:
        pay_rows = pay_rows.filter(Payroll.company_id == companyId)
    pay_by_month = {((y, m)): float(s) for y, m, s in pay_rows.group_by(Payroll.year, Payroll.month).all()}

    exp_by_month = {
        (b.strftime("%Y-%m") if hasattr(b, "strftime") else str(b)[:7]): float(s)
        for b, s in db.query(
            func.date_trunc('month', Expense.expense_date).label('bkt'),
            func.coalesce(func.sum(Expense.amount), 0),
        )
        .filter(Expense.deleted_at.is_(None))
        .group_by('bkt')
        .all()
    }
    if org_id:
        exp_by_month = {
            (b.strftime("%Y-%m") if hasattr(b, "strftime") else str(b)[:7]): float(s)
            for b, s in db.query(
                func.date_trunc('month', Expense.expense_date).label('bkt'),
                func.coalesce(func.sum(Expense.amount), 0),
            )
            .join(Employee, Expense.employee_id == Employee.id)
            .filter(Expense.deleted_at.is_(None), Employee.organization_id == org_id)
            .group_by('bkt')
            .all()
        }
    elif companyId:
        exp_by_month = {
            (b.strftime("%Y-%m") if hasattr(b, "strftime") else str(b)[:7]): float(s)
            for b, s in db.query(
                func.date_trunc('month', Expense.expense_date).label('bkt'),
                func.coalesce(func.sum(Expense.amount), 0),
            )
            .filter(Expense.deleted_at.is_(None), Expense.company_id == companyId)
            .group_by('bkt')
            .all()
        }

    cand_query = db.query(
        func.date_trunc('month', Candidate.applied_date).label('bkt'),
        func.count(Candidate.id),
    )
    if current_user.role != "superadmin" and org_id:
        cand_query = cand_query.join(Company, Candidate.company_id == Company.id).filter(Company.organization_id == org_id)
    cand_by_month = dict(cand_query.group_by('bkt').all())
    if companyId:
        cand_by_month = dict(
            db.query(
                func.date_trunc('month', Candidate.applied_date).label('bkt'),
                func.count(Candidate.id),
            )
            .filter(Candidate.company_id == companyId)
            .group_by('bkt')
            .all()
        )

    perf_by_month = dict(
        db.query(
            func.date_trunc('month', PerformanceReview.created_at).label('bkt'),
            func.avg(PerformanceReview.overall_score),
        )
        .filter(PerformanceReview.deleted_at.is_(None), PerformanceReview.overall_score.isnot(None))
        .group_by('bkt')
        .all()
    )
    if current_user.role != "superadmin" and org_id:
        perf_by_month = dict(
            db.query(
                func.date_trunc('month', PerformanceReview.created_at).label('bkt'),
                func.avg(PerformanceReview.overall_score),
            )
            .filter(
                PerformanceReview.deleted_at.is_(None),
                PerformanceReview.overall_score.isnot(None),
                PerformanceReview.organization_id == org_id,
            )
            .group_by('bkt')
            .all()
        )
    if companyId:
        perf_by_month = dict(
            db.query(
                func.date_trunc('month', PerformanceReview.created_at).label('bkt'),
                func.avg(PerformanceReview.overall_score),
            )
            .filter(
                PerformanceReview.deleted_at.is_(None),
                PerformanceReview.overall_score.isnot(None),
                PerformanceReview.company_id == companyId,
            )
            .group_by('bkt')
            .all()
        )

    trend = []
    cur_y, cur_m = now.year, 1
    while (cur_y, cur_m) <= (now.year, now.month):
        bkt = datetime(cur_y, cur_m, 1)
        bkt_key = bkt.strftime("%Y-%m")
        trend.append({
            "month": cur_m, "year": cur_y,
            "label": f"{bkt.strftime('%b')}",
            "attendance": att_by_month.get(bkt, 0),
            "leaves": lv_by_month.get(bkt, 0),
            "payroll": round(pay_by_month.get((cur_y, cur_m), 0) or 0, 2),
            "expenses": round(exp_by_month.get(bkt_key, 0) or 0, 2),
            "candidates": cand_by_month.get(bkt, 0),
            "rating": round(perf_by_month.get(bkt, 0) or 0, 2),
        })
        cur_m += 1
        if cur_m > 12:
            cur_m = 1
            cur_y += 1

    # On leave today (org/company scoped)
    on_leave_q = db.query(LeaveApplication).filter(
        LeaveApplication.deleted_at.is_(None),
        LeaveApplication.status == "approved",
        LeaveApplication.start_date <= today_str,
        LeaveApplication.end_date >= today_str,
    )
    on_leave_q = on_leave_q.join(Employee, LeaveApplication.employee_id == Employee.id)
    if org_id:
        on_leave_q = on_leave_q.filter(Employee.organization_id == org_id)
    if companyId:
        on_leave_q = on_leave_q.filter(LeaveApplication.company_id == companyId)
    on_leave_today = on_leave_q.count()

    # Interviews scheduled today (org/company scoped via candidate)
    interview_q = db.query(Interview).filter(
        Interview.date >= f"{today_str} 00:00:00",
        Interview.date < f"{today_str} 23:59:59",
    )
    if org_id or companyId:
        interview_q = interview_q.join(Candidate, Interview.candidate_id == Candidate.id)
        if org_id:
            interview_q = interview_q.filter(Candidate.company_id.in_(
                db.query(Company.id).filter(Company.organization_id == org_id)
            ))
        if companyId:
            interview_q = interview_q.filter(Candidate.company_id == companyId)
    interviews_today = interview_q.count()

    # Job offers (org/company scoped)
    offer_q = db.query(Candidate).filter(Candidate.candidate_status.in_(["offered", "selected"]))
    if current_user.role != "superadmin" and org_id:
        offer_q = offer_q.join(Company, Candidate.company_id == Company.id).filter(Company.organization_id == org_id)
    if companyId:
        offer_q = offer_q.filter(Candidate.company_id == companyId)
    job_offered = offer_q.count()

    return {
        "employees": {
            "total": total_employees,
            "active": active_employees,
            "male": male_count,
            "female": female_count,
            "newHires": new_hires,
            "attritions": attritions,
            "terminated": emp_q.filter(Employee.status.in_(["terminated", "inactive"])).count(),
        },
        "attendance": {
            "presentToday": present_today,
            "lateToday": late_today,
            "earlyDepartures": early_departures,
            "onLeaveToday": on_leave_today,
            "absentToday": absent_today,
        },
        "leaves": {
            "pending": pending_leaves,
            "thisMonth": leaves_this_month,
        },
        "expenses": {
            "pending": pending_expenses,
            "monthTotal": round(expense_total or 0, 2),
        },
        "recruitment": {
            "interviewsScheduled": interviews_today,
            "jobOffered": job_offered,
        },
        "departmentDistribution": dept_dist,
        "departmentCodes": dept_codes,
        "ageDistribution": age_brackets,
        "upcomingHolidays": holidays_list,
        "averagePerformanceRating": round(avg_rating, 2),
        "reviewsThisMonth": reviews_this_month,
        "monthlyTrend": trend,
        "meta": {
            "companies": db.query(Company).filter(
                Company.deleted_at.is_(None),
                Company.organization_id == org_id,
            ).count() if org_id else db.query(Company).filter(Company.deleted_at.is_(None)).count(),
            "departments": len(dept_dist),
            "branches": db.query(Branch).filter(
                Branch.deleted_at.is_(None),
                Branch.organization_id == org_id,
            ).count() if org_id else db.query(Branch).filter(Branch.deleted_at.is_(None)).count(),
            "designations": db.query(Designation).filter(
                Designation.deleted_at.is_(None),
                Designation.organization_id == org_id,
            ).count() if org_id else db.query(Designation).filter(Designation.deleted_at.is_(None)).count(),
        },
    }


@cached(ttl=60)
@router.get("/api/dashboard/stats", tags=["Dashboard"])
def get_dashboard_stats(
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    org_id = current_user.organization_id
    # Company isolation for aggregate KPIs (restricted roles see only their company).
    _dash_scope = resolve_company_scope(db, current_user, None)

    emp_query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if org_id:
        emp_query = emp_query.filter(Employee.organization_id == org_id)
    if _dash_scope is not None:
        emp_query = emp_query.filter(Employee.company_id == _dash_scope)

    total_employees = emp_query.count()
    active_employees = emp_query.filter(Employee.status == "active").count()

    today = ist_today_str()
    present_q = db.query(Attendance).filter(
        Attendance.deleted_at.is_(None),
        func.date(Attendance.check_in) == today,
        Attendance.status == "present",
    )

    leaves_q = db.query(LeaveApplication).filter(
        LeaveApplication.deleted_at.is_(None),
        LeaveApplication.status == "pending"
    )

    expenses_q = db.query(Expense).filter(
        Expense.deleted_at.is_(None),
        Expense.status == "pending"
    )

    dept_q = db.query(Department).filter(Department.deleted_at.is_(None))
    comp_q = db.query(Company).filter(Company.deleted_at.is_(None))
    if current_user.role != "superadmin" and org_id:
        present_q = present_q.filter(Attendance.organization_id == org_id)
        leaves_q = leaves_q.filter(LeaveApplication.organization_id == org_id)
        expenses_q = expenses_q.filter(Expense.organization_id == org_id)
        dept_q = dept_q.filter(Department.organization_id == org_id)
        comp_q = comp_q.filter(Company.organization_id == org_id)
    if _dash_scope is not None:
        present_q = present_q.filter(Attendance.company_id == _dash_scope)
        leaves_q = leaves_q.filter(LeaveApplication.company_id == _dash_scope)
        expenses_q = expenses_q.filter(Expense.company_id == _dash_scope)
        dept_q = dept_q.filter(Department.company_id == _dash_scope)
        comp_q = comp_q.filter(Company.id == _dash_scope)

    present_today = present_q.count()
    pending_leaves = leaves_q.count()
    pending_expenses = expenses_q.count()

    return {
        "totalEmployees": total_employees,
        "activeEmployees": active_employees,
        "presentToday": present_today,
        "pendingLeaves": pending_leaves,
        "pendingExpenses": pending_expenses,
        "departments": dept_q.count(),
        "companies": comp_q.count(),
    }

