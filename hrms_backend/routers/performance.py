"""HRMS API performance routes."""
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
from core.tenant import get_employee_in_org, org_owned, get_header_company_id
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company, get_user_company_ids
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.datetime_utils import ist_now_naive
from core.schemas import (FeedbackCreate, GoalCreate, PerformanceReviewCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from database import Base, SessionLocal, engine, get_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Feedback, Goal, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Performance"])




@router.get("/api/performance/reviews", tags=["Performance"])
def get_performance_reviews(
    employeeId: Optional[int] = None,
    year: Optional[int] = None,
    companyId: Optional[int] = None,
    includeInactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    companyId = resolve_company_scope(db, current_user, companyId, request)
    query = db.query(PerformanceReview).filter(PerformanceReview.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(PerformanceReview.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(PerformanceReview.company_id == companyId)
    # Exclude reviews belonging to deactivated/terminated employees (unless requested)
    if not includeInactive:
        query = query.join(Employee, PerformanceReview.employee_id == Employee.id).filter(
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        )
    if employeeId:
        query = query.filter(PerformanceReview.employee_id == employeeId)
    if year:
        query = query.filter(PerformanceReview.review_year == year)
    records = query.order_by(PerformanceReview.created_at.desc()).limit(500).all()

    # Attach employee + reviewer names for the UI
    emp_ids = {r.employee_id for r in records if r.employee_id}
    reviewer_ids = {r.reviewer_id for r in records if r.reviewer_id}
    emp_map = {}
    if emp_ids:
        for e in db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id.in_(emp_ids)).all():
            emp_map[e.id] = e
    user_map = {}
    if reviewer_ids:
        for u in db.query(User).filter(User.id.in_(reviewer_ids)).all():
            user_map[u.id] = u

    result = []
    for r in records:
        emp = emp_map.get(r.employee_id)
        reviewer = user_map.get(r.reviewer_id)
        d = {
            "id": r.id,
            "employeeId": r.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}".strip() if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "reviewerId": r.reviewer_id,
            "reviewerName": (reviewer.full_name or reviewer.email) if reviewer else None,
            "reviewPeriod": r.review_period,
            "reviewYear": r.review_year,
            "reviewCycle": r.review_cycle,
            "rating": r.rating,
            "overallScore": r.overall_score,
            "status": r.status,
            "reviewDate": r.review_date.isoformat() if r.review_date else None,
            "nextReviewDate": r.next_review_date.isoformat() if r.next_review_date else None,
            "reviewerComments": r.reviewer_comments,
            "goalsAchieved": r.goals_achieved,
            "company_id": r.company_id,
            "branch_id": getattr(r, "branch_id", None),
            "department_id": r.department_id,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        # Include score breakdowns + recommendations
        for attr in ("productivity_score", "quality_score", "communication_score", "teamwork_score",
                     "leadership_score", "initiative_score", "punctuality_score", "problem_solving_score",
                     "collaboration_score", "adaptability_score", "creativity_score", "attendance_score",
                     "goals_set", "strengths", "areas_for_improvement", "development_plan",
                     "achievements", "key_projects", "training_needs", "reviewer_position",
                     "salary_recommendation", "salary_percentage"):
            if hasattr(r, attr):
                d[attr] = getattr(r, attr)
        # Boolean columns guarded against missing schema
        for attr in ("promotion_eligible",):
            if hasattr(r, attr):
                d[attr] = bool(getattr(r, attr))
        result.append(d)
    return result


@router.get("/api/performance/reviews/{review_id}", tags=["Performance"])
def get_performance_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = db.query(PerformanceReview).filter(PerformanceReview.deleted_at.is_(None), PerformanceReview.id == review_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Performance review not found")
    if current_user.role != "superadmin":
        org_owned(pr, current_user.organization_id)
    assert_company_allowed(db, current_user, pr.company_id)
    return pr


def _employee_branch_ids(db: Session, employee_id: int) -> List[int]:
    try:
        rows = db.execute(
            text("SELECT branch_id FROM employee_branches WHERE employee_id = :eid"),
            {"eid": employee_id},
        ).fetchall()
        return [r[0] for r in rows if r[0] is not None]
    except Exception:
        return []


_REVIEW_SCORE_FIELDS = (
    "productivity_score", "quality_score", "communication_score", "teamwork_score",
    "leadership_score", "initiative_score", "punctuality_score", "problem_solving_score",
    "collaboration_score", "adaptability_score", "creativity_score", "attendance_score",
)


def _load_performance_employee(db: Session, current_user: User, employee_id: int) -> Employee:
    if employee_id is None:
        raise HTTPException(status_code=422, detail="employeeId is required")
    if current_user.role != "superadmin":
        emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
        assert_company_allowed(db, current_user, emp.company_id)
        return emp
    emp = db.query(Employee).filter(
        Employee.deleted_at.is_(None),
        Employee.id == employee_id,
    ).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


def _apply_employee_org_fields(data: dict, emp: Employee) -> None:
    data["organization_id"] = emp.organization_id
    data["company_id"] = emp.company_id
    data["department_id"] = emp.department_id


def _parse_optional_datetime(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        return dateparser.parse(str(value))
    except Exception:
        return None


def _compute_overall_score(data: dict) -> Optional[float]:
    scores = [data[f] for f in _REVIEW_SCORE_FIELDS if data.get(f)]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 2)


def _resolve_scoped_perf_config(db: Session, emp: Employee) -> Optional[dict]:
    """Resolve the most specific company/branch/department-wise performance config."""
    org = db.query(Organization).filter(
        Organization.deleted_at.is_(None),
        Organization.id == emp.organization_id,
    ).first()
    if not org:
        return None
    data = org.settings or {}
    configs = data.get("performance_configs") or []
    if not configs:
        return None
    branch_ids = _employee_branch_ids(db, emp.id)

    def score(c: dict) -> tuple:
        cid = c.get("company_id") or c.get("companyId")
        bid = c.get("branch_id") or c.get("branchId")
        did = c.get("department_id") or c.get("departmentId")
        rank = 3 if did is not None else 2 if bid is not None else 1 if cid is not None else 0
        cm = (cid is None) or (emp.company_id is not None and cid == emp.company_id)
        bm = (bid is None) or (bid in branch_ids)
        dm = (did is None) or (emp.department_id is not None and did == emp.department_id)
        if not (cm and bm and dm):
            return (-1, -1, -1, -1)
        return (rank, 1 if cm else 0, 1 if bm else 0, 1 if dm else 0)

    best = max(configs, key=score, default=None)
    if best and score(best)[0] >= 0:
        return best
    return None


@router.post("/api/performance/reviews", tags=["Performance"])
def create_performance_review(
    review_data: PerformanceReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp = _load_performance_employee(db, current_user, review_data.employeeId)

    data = convert_camel_to_snake(review_data.model_dump())
    data["reviewer_id"] = data.get("reviewer_id") or current_user.id
    _apply_employee_org_fields(data, emp)

    parsed_review_date = _parse_optional_datetime(data.get("review_date"))
    if parsed_review_date:
        data["review_date"] = parsed_review_date
    else:
        data.pop("review_date", None)

    parsed_next_review = _parse_optional_datetime(data.get("next_review_date"))
    if parsed_next_review:
        data["next_review_date"] = parsed_next_review
    else:
        data.pop("next_review_date", None)

    overall_score = _compute_overall_score(data)
    if overall_score is not None:
        data["overall_score"] = overall_score

    scoped = _resolve_scoped_perf_config(db, emp)
    if scoped:
        cycle = scoped.get("reviewCycle")
        if cycle and not data.get("review_period"):
            data["review_period"] = cycle

    data = {k: v for k, v in data.items() if hasattr(PerformanceReview, k) and v is not None}
    data.setdefault("status", "draft")

    pr = PerformanceReview(**data)
    db.add(pr)
    db.commit()
    db.refresh(pr)
    invalidate_cache("hrms:tenant:*")
    return pr


@router.put("/api/performance/reviews/{review_id}", tags=["Performance"])
def update_performance_review(
    review_id: int,
    review_data: PerformanceReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = db.query(PerformanceReview).filter(PerformanceReview.deleted_at.is_(None), PerformanceReview.id == review_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Performance review not found")
    if current_user.role != "superadmin":
        org_owned(pr, current_user.organization_id)
    assert_company_allowed(db, current_user, pr.company_id)
    data = convert_camel_to_snake(review_data.model_dump(exclude_unset=True))
    if "employee_id" in data:
        emp = _load_performance_employee(db, current_user, data["employee_id"])
        _apply_employee_org_fields(data, emp)
    if "reviewer_id" not in data or not data.get("reviewer_id"):
        data["reviewer_id"] = pr.reviewer_id or current_user.id

    parsed_review_date = _parse_optional_datetime(data.get("review_date"))
    if "review_date" in data:
        if parsed_review_date:
            data["review_date"] = parsed_review_date
        else:
            data.pop("review_date", None)

    parsed_next_review = _parse_optional_datetime(data.get("next_review_date"))
    if "next_review_date" in data:
        if parsed_next_review:
            data["next_review_date"] = parsed_next_review
        else:
            data.pop("next_review_date", None)

    overall_score = _compute_overall_score(data)
    if overall_score is not None:
        data["overall_score"] = overall_score

    for key, val in data.items():
        if hasattr(pr, key) and val is not None:
            setattr(pr, key, val)
    pr.updated_at = ist_now_naive()
    db.commit()
    db.refresh(pr)
    return pr


@router.get("/api/goals", tags=["Performance"])
def get_goals(
    employeeId: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get goals for employees (with employee names attached)."""
    q = db.query(Goal).filter(Goal.deleted_at.is_(None))
    # Exclude goals belonging to deactivated/terminated employees
    q = q.join(Employee, Goal.employee_id == Employee.id).filter(
        Employee.deleted_at.is_(None),
        Employee.status == "active",
    )
    if employeeId:
        if current_user.role != "superadmin":
            _g_emp = db.query(Employee).filter(Employee.id == employeeId).first()
            if _g_emp is not None:
                assert_company_allowed(db, current_user, _g_emp.company_id)
        q = q.filter(Goal.employee_id == employeeId)
    if status:
        q = q.filter(Goal.status == status)
    if current_user.organization_id:
        q = q.filter(Goal.organization_id == current_user.organization_id)
    _g_scope = resolve_company_scope(db, current_user, None)
    if _g_scope is not None:
        q = q.filter(Employee.company_id == _g_scope)
    records = q.order_by(Goal.created_at.desc()).limit(500).all()

    emp_ids = {g.employee_id for g in records if g.employee_id}
    emp_map = {}
    if emp_ids:
        for e in db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id.in_(emp_ids)).all():
            emp_map[e.id] = e

    result = []
    for g in records:
        emp = emp_map.get(g.employee_id)
        result.append({
            "id": g.id,
            "employeeId": g.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}".strip() if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "title": g.title,
            "description": g.description,
            "goalType": g.goal_type,
            "category": g.category,
            "objective": g.objective,
            "keyResults": g.key_results,
            "startDate": g.start_date.isoformat() if g.start_date else None,
            "endDate": g.target_date.isoformat() if g.target_date else None,
            "completionDate": g.completion_date.isoformat() if g.completion_date else None,
            "progress": g.progress or 0,
            "status": g.status,
            "priority": g.priority,
            "weight": g.weight,
            "alignedWith": g.aligned_with,
            "metricType": g.metric_type,
            "targetValue": g.target_value,
            "currentValue": g.current_value,
            "company_id": g.company_id,
            "department_id": g.department_id,
            "createdAt": g.created_at.isoformat() if g.created_at else None,
            "updatedAt": g.updated_at.isoformat() if g.updated_at else None,
        })
    return result


@router.post("/api/goals", tags=["Performance"])
def create_goal(
    goal_data: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(goal_data.model_dump())
    data["status"] = data.get("status", "active")
    # target_date is NOT NULL — default to +3 months if not provided
    if "end_date" in data and data["end_date"]:
        try:
            data["target_date"] = dateparser.parse(str(data.pop("end_date")))
        except Exception:
            data.pop("end_date", None)
    if data.get("target_date") is None:
        from datetime import timedelta
        data["target_date"] = ist_now_naive() + timedelta(days=90)
    if "start_date" in data and data["start_date"]:
        try:
            data["start_date"] = dateparser.parse(str(data["start_date"]))
        except Exception:
            pass
    if "target_value" in data and data["target_value"] is not None:
        data["target_value"] = float(data["target_value"])
    if "current_value" in data and data["current_value"] is not None:
        data["current_value"] = float(data["current_value"])
    if "progress" in data and data["progress"] is not None:
        data["progress"] = int(data["progress"])
    emp = _load_performance_employee(db, current_user, data.get("employee_id"))
    _apply_employee_org_fields(data, emp)
    data = {k: v for k, v in data.items() if hasattr(Goal, k) and v is not None}
    goal = Goal(**data)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return {"message": "Goal created", "goalId": goal.id}


@router.put("/api/goals/{goal_id}", tags=["Performance"])
def update_goal(
    goal_id: int,
    goal_data: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(Goal).filter(Goal.deleted_at.is_(None), Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if current_user.role != "superadmin":
        org_owned(goal, current_user.organization_id)
    assert_company_allowed(db, current_user, goal.company_id)
    data = convert_camel_to_snake(goal_data.model_dump())
    if data.get("employee_id") is not None and current_user.role != "superadmin":
        get_employee_in_org(db, Employee, data["employee_id"], current_user.organization_id)
        _g_emp = db.query(Employee).filter(Employee.id == data["employee_id"]).first()
        if _g_emp is not None:
            assert_company_allowed(db, current_user, _g_emp.company_id)
    if "end_date" in data and data["end_date"]:
        try:
            data["target_date"] = dateparser.parse(str(data.pop("end_date")))
        except Exception:
            data.pop("end_date", None)
    if "start_date" in data and data["start_date"]:
        try:
            data["start_date"] = dateparser.parse(str(data["start_date"]))
        except Exception:
            pass
    for k, v in data.items():
        if hasattr(Goal, k) and v is not None:
            setattr(goal, k, v)
    goal.updated_at = ist_now_naive()
    db.commit()
    return {"message": "Goal updated", "goalId": goal.id}


@router.get("/api/feedback", tags=["Performance"])
def get_feedback(
    employeeId: Optional[int] = None,
    feedbackType: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get 360 feedback (with employee + reviewer names)."""
    q = db.query(Feedback).filter(Feedback.deleted_at.is_(None))
    if current_user.role != "superadmin" and current_user.organization_id:
        q = q.filter(Feedback.organization_id == current_user.organization_id)
    # Exclude feedback belonging to deactivated/terminated employees
    q = q.join(Employee, Feedback.employee_id == Employee.id).filter(
        Employee.deleted_at.is_(None),
        Employee.status == "active",
    )
    if employeeId:
        if current_user.role != "superadmin":
            _f_emp = db.query(Employee).filter(Employee.id == employeeId).first()
            if _f_emp is not None:
                assert_company_allowed(db, current_user, _f_emp.company_id)
        q = q.filter(Feedback.employee_id == employeeId)
    _f_scope = resolve_company_scope(db, current_user, None)
    if _f_scope is not None:
        q = q.filter(Employee.company_id == _f_scope)
    if feedbackType:
        q = q.filter(Feedback.feedback_type == feedbackType)
    records = q.order_by(Feedback.created_at.desc()).limit(500).all()

    emp_ids = {f.employee_id for f in records}
    reviewer_ids = {f.reviewer_id for f in records}
    emp_map = {}
    if emp_ids:
        for e in db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id.in_(emp_ids)).all():
            emp_map[e.id] = e
    user_map = {}
    if reviewer_ids:
        for u in db.query(User).filter(User.id.in_(reviewer_ids)).all():
            user_map[u.id] = u

    result = []
    for f in records:
        emp = emp_map.get(f.employee_id)
        reviewer = user_map.get(f.reviewer_id)
        result.append({
            "id": f.id,
            "employeeId": f.employee_id,
            "employeeName": f"{emp.first_name} {emp.last_name}".strip() if emp else None,
            "employeeCode": emp.employee_code if emp else None,
            "email": emp.email if emp else None,
            "reviewerId": f.reviewer_id,
            "reviewerName": (reviewer.full_name or reviewer.email) if reviewer else None,
            "feedbackType": f.feedback_type,
            "feedbackCycle": f.feedback_cycle,
            "feedbackPeriod": f.feedback_period,
            "feedbackYear": f.feedback_year,
            "communicationRating": f.communication_rating,
            "teamworkRating": f.teamwork_rating,
            "leadershipRating": f.leadership_rating,
            "problemSolvingRating": f.problem_solving_rating,
            "reliabilityRating": f.reliability_rating,
            "adaptabilityRating": f.adaptability_rating,
            "overallRating": f.overall_rating,
            "strengths": f.strengths,
            "areasForImprovement": f.areas_for_improvement,
            "specificExamples": f.specific_examples,
            "recommendations": f.recommendations,
            "whatEmployeeDoesWell": f.what_employee_does_well,
            "whatEmployeeCouldImprove": f.what_employee_could_improve,
            "collaborationFeedback": f.collaboration_feedback,
            "additionalComments": f.additional_comments,
            "isAnonymous": f.is_anonymous,
            "status": f.status,
            "submittedAt": f.submitted_at.isoformat() if f.submitted_at else None,
            "notes": f.notes,
            "company_id": f.company_id,
            "department_id": f.department_id,
            "createdAt": f.created_at.isoformat() if f.created_at else None,
        })
    return result


@router.post("/api/feedback", tags=["Performance"])
def create_feedback(
    feedback_data: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(feedback_data.model_dump())
    emp = _load_performance_employee(db, current_user, data.get("employee_id"))
    data["reviewer_id"] = data.get("reviewer_id") or current_user.id
    data["feedback_year"] = data.get("feedback_year") or ist_now_naive().year
    _apply_employee_org_fields(data, emp)
    data = {k: v for k, v in data.items() if hasattr(Feedback, k) and v is not None}
    fb = Feedback(**data)
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {"message": "Feedback submitted", "feedbackId": fb.id}


@router.put("/api/feedback/{feedback_id}", tags=["Performance"])
def update_feedback(
    feedback_id: int,
    feedback_data: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fb = db.query(Feedback).filter(Feedback.deleted_at.is_(None), Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    if current_user.role != "superadmin":
        org_owned(fb, current_user.organization_id)
    assert_company_allowed(db, current_user, fb.company_id)
    data = convert_camel_to_snake(feedback_data.model_dump())
    if data.get("employee_id") is not None and current_user.role != "superadmin":
        get_employee_in_org(db, Employee, data["employee_id"], current_user.organization_id)
        _fb_emp = db.query(Employee).filter(Employee.id == data["employee_id"]).first()
        if _fb_emp is not None:
            assert_company_allowed(db, current_user, _fb_emp.company_id)
    for k, v in data.items():
        if hasattr(Feedback, k) and v is not None:
            setattr(fb, k, v)
    fb.updated_at = ist_now_naive()
    db.commit()
    return {"message": "Feedback updated", "feedbackId": fb.id}


@router.get("/api/performance/stats", tags=["Performance"])
def get_performance_stats(
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Pure SQL aggregation — scales to millions of rows without loading into Python.
    if current_user.role != "superadmin":
        if not current_user.organization_id:
            return {
                "totalReviews": 0,
                "averageScore": 0.0,
                "highestScore": 0,
                "lowestScore": 0,
                "reviewsByStatus": {"draft": 0, "completed": 0, "submitted": 0, "acknowledged": 0},
                "completed": 0,
                "pending": 0,
                "avgRating": 0.0,
            }
        organizationId = current_user.organization_id
    base = db.query(PerformanceReview).filter(PerformanceReview.deleted_at.is_(None))
    if organizationId:
        base = base.filter(PerformanceReview.employee_id.in_(
            db.query(Employee.id).filter(Employee.organization_id == organizationId)
        ))
    company_scope = resolve_company_scope(db, current_user, companyId)
    if company_scope is not None:
        base = base.filter(PerformanceReview.employee_id.in_(
            db.query(Employee.id).filter(Employee.company_id == company_scope)
        ))
    if year:
        base = base.filter(PerformanceReview.review_year == year)

    total_reviews = base.count()

    avg_score = db.query(func.avg(PerformanceReview.overall_score)).filter(
        PerformanceReview.deleted_at.is_(None),
        PerformanceReview.overall_score.isnot(None),
    )
    max_score = db.query(func.max(PerformanceReview.overall_score)).filter(
        PerformanceReview.deleted_at.is_(None),
        PerformanceReview.overall_score.isnot(None),
    )
    min_score = db.query(func.min(PerformanceReview.overall_score)).filter(
        PerformanceReview.deleted_at.is_(None),
        PerformanceReview.overall_score.isnot(None),
    )
    if organizationId:
        org_filter = PerformanceReview.employee_id.in_(
            db.query(Employee.id).filter(Employee.organization_id == organizationId)
        )
        avg_score = avg_score.filter(org_filter)
        max_score = max_score.filter(org_filter)
        min_score = min_score.filter(org_filter)
    if company_scope is not None:
        _comp_filter = PerformanceReview.employee_id.in_(
            db.query(Employee.id).filter(Employee.company_id == company_scope)
        )
        avg_score = avg_score.filter(_comp_filter)
        max_score = max_score.filter(_comp_filter)
        min_score = min_score.filter(_comp_filter)
    if year:
        avg_score = avg_score.filter(PerformanceReview.review_year == year)
        max_score = max_score.filter(PerformanceReview.review_year == year)
        min_score = min_score.filter(PerformanceReview.review_year == year)

    status_filters = [PerformanceReview.deleted_at.is_(None)]
    if organizationId:
        status_filters.append(PerformanceReview.employee_id.in_(
            db.query(Employee.id).filter(Employee.organization_id == organizationId)
        ))
    if company_scope is not None:
        status_filters.append(PerformanceReview.employee_id.in_(
            db.query(Employee.id).filter(Employee.company_id == company_scope)
        ))
    if year:
        status_filters.append(PerformanceReview.review_year == year)
    status_rows = dict(
        db.query(PerformanceReview.status, func.count(PerformanceReview.id))
        .filter(*status_filters)
        .group_by(PerformanceReview.status)
        .all()
    )

    completed = status_rows.get("completed", 0) + status_rows.get("acknowledged", 0)
    pending = status_rows.get("draft", 0) + status_rows.get("submitted", 0)

    return {
        "totalReviews": total_reviews,
        "averageScore": round(avg_score.scalar() or 0, 2),
        "highestScore": max_score.scalar() or 0,
        "lowestScore": min_score.scalar() or 0,
        "reviewsByStatus": {
            "draft": status_rows.get("draft", 0),
            "completed": status_rows.get("completed", 0),
            "submitted": status_rows.get("submitted", 0),
            "acknowledged": status_rows.get("acknowledged", 0),
        },
        # Frontend-compatible KPI fields
        "completed": completed,
        "pending": pending,
        "avgRating": round(avg_score.scalar() or 0, 2),
    }


@router.get("/api/performance/template", tags=["Performance"])
def download_performance_template(current_user: User = Depends(get_current_user)):
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["employeeId", "reviewPeriod", "reviewYear", "productivityScore", "qualityScore", "communicationScore", "teamworkScore", "leadershipScore"])
    writer.writerow(["1", "2025-H1", "2025", "4", "4", "5", "5", "4"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=performance_template.csv"},
    )


@router.post("/api/performance/bulk-upload", tags=["Performance"])
def bulk_upload_performance(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk upload performance reviews from a CSV file."""
    import csv
    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))

    score_fields = {
        "productivity": "productivity_score",
        "quality": "quality_score",
        "communication": "communication_score",
        "teamwork": "teamwork_score",
        "leadership": "leadership_score",
        "initiative": "initiative_score",
        "punctuality": "punctuality_score",
        "problem_solving": "problem_solving_score",
        "collaboration": "collaboration_score",
        "adaptability": "adaptability_score",
        "creativity": "creativity_score",
    }

    created = 0
    updated = 0
    for row in reader:
        emp_id = row.get("employeeId") or row.get("employee_id")
        if not emp_id:
            continue
        try:
            emp_id = int(emp_id)
        except (TypeError, ValueError):
            continue
        emp = db.query(Employee).filter(Employee.id == emp_id, Employee.deleted_at.is_(None)).first()
        if not emp:
            continue
        if current_user.role != "superadmin":
            if emp.organization_id != current_user.organization_id:
                continue
            try:
                assert_company_allowed(db, current_user, emp.company_id)
            except HTTPException:
                continue
        review_period = (row.get("reviewPeriod") or row.get("review_period") or "").strip() or "Annual"
        review_year = None
        try:
            review_year = int(row.get("reviewYear") or row.get("review_year") or ist_now_naive().year)
        except (TypeError, ValueError):
            review_year = ist_now_naive().year

        existing = db.query(PerformanceReview).filter(
            PerformanceReview.employee_id == emp_id,
            PerformanceReview.review_period == review_period,
            PerformanceReview.review_year == review_year,
        ).first()

        if existing:
            pr = existing
            updated += 1
        else:
            pr = PerformanceReview(
                employee_id=emp_id,
                reviewer_id=current_user.id,
                review_period=review_period,
                review_year=review_year,
                organization_id=emp.organization_id,
                company_id=emp.company_id,
                department_id=emp.department_id,
                status="draft",
            )
            db.add(pr)
            created += 1

        for col_key, attr in score_fields.items():
            raw = row.get(col_key) or row.get(f"{col_key}Score")
            if raw is None:
                continue
            try:
                setattr(pr, attr, int(round(float(raw))))
            except (TypeError, ValueError):
                pass
    db.commit()
    return {"message": f"{created} created, {updated} updated", "created": created, "updated": updated}


@router.delete("/api/performance/reviews/{review_id}", tags=["Performance"])
def delete_performance_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = db.query(PerformanceReview).filter(PerformanceReview.deleted_at.is_(None), PerformanceReview.id == review_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Performance review not found")
    if current_user.role != "superadmin":
        org_owned(pr, current_user.organization_id)
    assert_company_allowed(db, current_user, pr.company_id)
    pr.deleted_at = ist_now_naive()
    db.commit()
    return {"message": "Performance review deleted"}


@router.delete("/api/goals/{goal_id}", tags=["Performance"])
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(Goal).filter(Goal.deleted_at.is_(None), Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if current_user.role != "superadmin":
        org_owned(goal, current_user.organization_id)
    assert_company_allowed(db, current_user, goal.company_id)
    goal.deleted_at = ist_now_naive()
    db.commit()
    return {"message": "Goal deleted"}


@router.delete("/api/feedback/{feedback_id}", tags=["Performance"])
def delete_feedback(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fb = db.query(Feedback).filter(Feedback.deleted_at.is_(None), Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    if current_user.role != "superadmin":
        org_owned(fb, current_user.organization_id)
    assert_company_allowed(db, current_user, fb.company_id)
    fb.deleted_at = ist_now_naive()
    db.commit()
    return {"message": "Feedback deleted"}

