"""HRMS API recruitment routes."""
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
from utils.name_utils import resolve_full_name, split_name

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.tenant import validate_company_in_org
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import (CandidateCreate, InterviewCreate, JobOpeningCreate, UserBase, PermissionBase, ThemeSettings, EmployeeBase, OrganizationBase, AuditLogBase, CompanyBase, PayrollStatusUpdate, GeneralSettingsUpdate, AttendanceSettingsUpdate, LeavePolicyUpdate, PayrollSettingsUpdate, PerformanceSettingsUpdate, NotificationSettingsUpdate, SecuritySettingsUpdate, IntegrationSettingsUpdate, OnboardingStepUpdate, InitiateExitRequest, ExitRecordCreate, ExitRecordUpdate, FnfCalculationRequest, DepartmentBase, LeaveBase, LeaveApprovalAction, AttendanceBase, ClockInRequest, ClockOutRequest, ManualAttendanceCreate, AttendanceSyncRequest, ConflictResolutionRequest, BulkMarkRequest, BranchTransferCreate, BranchBase, DesignationBase, LeaveTypeBase, PayrollCalculateRequest, PayrollCalculateResponse, PayrollBase, SalaryTemplateBase, ShiftBase, DutyRosterBase, JobOpeningBase, CandidateBase, PerformanceReviewBase, GoalBase, FeedbackBase, ExpenseBase, InterviewBase, HolidayBase, AssetBase, AssetUpdate, LeaveBalanceResponse, LeaveBalanceUpdate, NotificationCreate, NotificationResponse, BonusCreate, BonusResponse)
from core.shared import (RateLimiter, rate_limiter, check_rate_limit, _log, calculate_distance, save_selfie, record_audit_log, seed_initial_data, _create_audit_log, _get_employee_id_for_user)
from database import Base, SessionLocal, engine, get_db
from models import (Attendance, AttendanceAuditLog, AttendancePolicy, AuditLog, Asset, Branch, Candidate, Company, Department, Designation, Employee, EmployeeLifecycleEvent, Expense, Holiday, Interview, JobOpening, LeaveApplication, LeaveApprovalHistory, LeaveBalance, LeaveType, Notification, OnboardingTask, Organization, Payroll, PayrollComponent, PayrollPolicy, PerformanceReview, ReportExecutionLog, SalaryTemplate, Shift, StatutorySetting, TaxRegime, TaxSlab, User, ExitRecord, ArchivedEmployee)
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["Recruitment"])


def _candidate_in_org(db, candidate, org_id) -> bool:
    """Boolean org-ownership check for Candidate (no org column; resolved via company/job)."""
    if candidate is None:
        return False
    if getattr(candidate, "company_id", None):
        comp = db.query(Company).filter(Company.id == candidate.company_id).first()
        if comp and comp.organization_id == org_id:
            return True
    if getattr(candidate, "job_opening_id", None):
        job = db.query(JobOpening).filter(JobOpening.id == candidate.job_opening_id).first()
        if job and job.organization_id == org_id:
            return True
    return False


def _load_candidate_in_org(db, candidate_id, current_user):
    """Load a candidate by PK and 404 unless it belongs to the caller's org (superadmin bypass)."""
    cand = _load_candidate_in_org(db, candidate_id, current_user)
    if current_user.role != "superadmin" and not _candidate_in_org(db, cand, current_user.organization_id):
        raise HTTPException(status_code=404, detail="Candidate not found")
    return cand


def _load_job_in_org(db, job_id, current_user):
    """Load a JobOpening by PK and 404 unless it belongs to the caller's org (superadmin bypass)."""
    jo = _load_job_in_org(db, job_id, current_user)
    if current_user.role != "superadmin" and jo.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Job opening not found")
    return jo


def _load_interview_in_org(db, interview_id, current_user):
    """Load an Interview by PK and 404 unless its candidate belongs to the caller's org."""
    interview = _load_interview_in_org(db, interview_id, current_user)
    if current_user.role != "superadmin":
        cand = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
        if not _candidate_in_org(db, cand, current_user.organization_id):
            raise HTTPException(status_code=404, detail="Interview not found")
    return interview


def _serialize_job(jo, db: Session) -> dict:
    company = db.query(Company).filter(Company.id == jo.company_id).first() if jo.company_id else None
    dept = db.query(Department).filter(Department.id == jo.department_id).first() if jo.department_id else None
    branch = db.query(Branch).filter(Branch.id == jo.branch_id).first() if jo.branch_id else None
    return {
        "id": jo.id,
        "title": jo.title or "",
        "jobCode": jo.job_code or "",
        "description": jo.description or "",
        "requirements": jo.requirements or "",
        "location": jo.location or "",
        "organizationId": jo.organization_id,
        "companyId": jo.company_id,
        "companyName": company.name if company else None,
        "departmentId": jo.department_id,
        "departmentName": dept.name if dept else None,
        "branchId": jo.branch_id,
        "branchName": branch.name if branch else None,
        "employmentType": jo.employment_type or "full_time",
        "salaryMin": jo.salary_min,
        "salaryMax": jo.salary_max,
        "experienceRequired": jo.experience_required,
        "educationRequired": jo.education_required,
        "skillsRequired": jo.skills_required,
        "benefits": jo.benefits,
        "vacancyCount": jo.vacancy_count,
        "expiryDate": jo.expiry_date.isoformat() if jo.expiry_date else None,
        "publishedDate": jo.published_date.isoformat() if jo.published_date else None,
        "status": jo.status or "open",
        "createdAt": jo.created_at.isoformat() if jo.created_at else None,
        "updatedAt": jo.updated_at.isoformat() if jo.updated_at else None,
    }


def _serialize_candidate(cand, db: Session) -> dict:
    job = db.query(JobOpening).filter(JobOpening.id == cand.job_opening_id).first() if cand.job_opening_id else None
    onboarded = bool(cand.employee_id)
    # Derive company/branch/department from the applied job so candidates can be
    # sorted the same way as jobs and employees (company/branch/department wise).
    cand_company_id = cand.company_id or (job.company_id if job else None)
    cand_branch_id = cand.branch_id or (job.branch_id if job else None)
    cand_dept_id = cand.department_id or (job.department_id if job else None)
    company = db.query(Company).filter(Company.id == cand_company_id).first() if cand_company_id else None
    dept = db.query(Department).filter(Department.id == cand_dept_id).first() if cand_dept_id else None
    branch = db.query(Branch).filter(Branch.id == cand_branch_id).first() if cand_branch_id else None
    # Interview round progress
    cand_interviews = db.query(Interview).filter(Interview.candidate_id == cand.id).order_by(Interview.interview_round.asc()).all()
    total_rounds = max((iv.interview_round or 1) for iv in cand_interviews) if cand_interviews else 0
    completed_rounds = sum(1 for iv in cand_interviews if iv.status == "completed")
    pending_rounds = sum(1 for iv in cand_interviews if iv.status in ("scheduled", "pending", "in_progress"))
    pending_round_nums = [iv.interview_round or 1 for iv in cand_interviews if iv.status in ("scheduled", "pending", "in_progress")]
    next_round = max(pending_round_nums) if pending_round_nums else (total_rounds + 1 if total_rounds else 1)
    # Rejection source: if the candidate has a rejected interview, they were rejected from interviews
    rejected_interview = next((iv for iv in cand_interviews if iv.status == "rejected"), None)
    # Point interviewId at the most relevant round: the rejected interview (if any),
    # otherwise the latest round, so round-management actions target the right record.
    if rejected_interview is not None:
        interview_id = rejected_interview.id
    elif cand_interviews:
        interview_id = max(cand_interviews, key=lambda iv: iv.interview_round or 1).id
    else:
        interview_id = None
    custom = cand.custom_fields or {}
    return {
        "id": cand.id,
        "fullName": cand.full_name or "",
        "name": cand.full_name or "",
        "email": cand.email or "",
        "phone": cand.phone or "",
        "interviewId": interview_id,
        "rejectedFromInterview": rejected_interview is not None,
        "jobId": cand.job_opening_id,
        "jobTitle": job.title if job else None,
        "companyId": cand_company_id,
        "companyName": company.name if company else None,
        "branchId": cand_branch_id,
        "branchName": branch.name if branch else None,
        "departmentId": cand_dept_id,
        "departmentName": dept.name if dept else None,
        "status": cand.candidate_status or "applied",
        "source": cand.source or "",
        "currentCompany": cand.current_company,
        "currentPosition": cand.current_position,
        "currentSalary": cand.current_salary,
        "expectedSalary": cand.expected_salary,
        "noticePeriod": cand.notice_period,
        "experienceYears": cand.experience_years,
        "education": cand.education,
        "skills": cand.skills,
        "resumeUrl": cand.resume_url,
        "notes": cand.notes,
        "appliedDate": cand.applied_date.isoformat() if cand.applied_date else None,
        "hiredDate": cand.hired_date.isoformat() if cand.hired_date else None,
        "rejectedAt": cand.rejected_at.isoformat() if cand.rejected_at else None,
        "rejectionReason": cand.rejection_reason or "",
        "selectionReason": cand.selection_reason or "",
        "employeeId": cand.employee_id,
        "onboarded": onboarded,
        "interviewRounds": total_rounds,
        "completedRounds": completed_rounds,
        "pendingRounds": pending_rounds,
        "nextRound": next_round,
        "createdAt": cand.created_at.isoformat() if cand.created_at else None,
        "address": custom.get("address", ""),
        "state": custom.get("state", ""),
        "pincode": custom.get("pincode", ""),
    }


def _serialize_interview(iv, db: Session) -> dict:
    cand = db.query(Candidate).filter(Candidate.id == iv.candidate_id).first() if iv.candidate_id else None
    job = db.query(JobOpening).filter(JobOpening.id == iv.job_opening_id).first() if iv.job_opening_id else None
    interviewer = db.query(User).filter(User.id == iv.interviewer_id).first() if iv.interviewer_id else None
    company = db.query(Company).filter(Company.id == iv.company_id).first() if iv.company_id else None
    return {
        "id": iv.id,
        "candidateId": iv.candidate_id,
        "candidateName": cand.full_name if cand else None,
        "jobId": iv.job_opening_id,
        "jobTitle": job.title if job else None,
        "companyId": iv.company_id,
        "companyName": company.name if company else None,
        "interviewerId": iv.interviewer_id,
        "interviewerName": interviewer.full_name if interviewer else None,
        "interviewType": iv.interview_type or "technical",
        "interviewRound": iv.interview_round or 1,
        "scheduledAt": iv.date.isoformat() if iv.date else None,
        "durationMinutes": iv.duration_minutes,
        "location": iv.location,
        "meetingLink": iv.meeting_link,
        "status": iv.status or "scheduled",
        "feedback": iv.feedback,
        "rating": iv.rating,
        "technicalScore": iv.technical_score,
        "communicationScore": iv.communication_score,
        "overallScore": iv.overall_score,
        "interviewerNotes": iv.interviewer_notes,
        "nextSteps": iv.next_steps,
        "createdAt": iv.created_at.isoformat() if iv.created_at else None,
        "updatedAt": iv.updated_at.isoformat() if iv.updated_at else None,
    }


@router.get("/api/recruitment/pipeline-stats", tags=["Recruitment"])
def get_pipeline_stats(
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Counts of candidates at every pipeline stage (for the pipeline board).
    Pure SQL GROUP BY — scales to millions of candidates without loading rows."""
    from collections import Counter

    query = db.query(Candidate.candidate_status, func.count(Candidate.id))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(or_(
            Candidate.company_id.in_(db.query(Company.id).filter(Company.organization_id == current_user.organization_id)),
            Candidate.job_opening_id.in_(db.query(JobOpening.id).filter(JobOpening.organization_id == current_user.organization_id)),
        ))
    if companyId:
        query = query.filter(Candidate.company_id == companyId)
    counts = Counter(dict(query.group_by(Candidate.candidate_status).all()))

    onboarded_q = db.query(func.count(Candidate.id)).filter(Candidate.employee_id.isnot(None))
    offered_q = db.query(func.count(Candidate.id)).filter(
        Candidate.candidate_status.in_(["offered", "selected", "hired"]),
        Candidate.employee_id.is_(None),
    )
    if current_user.role != "superadmin" and current_user.organization_id:
        onboarded_q = onboarded_q.filter(or_(
            Candidate.company_id.in_(db.query(Company.id).filter(Company.organization_id == current_user.organization_id)),
            Candidate.job_opening_id.in_(db.query(JobOpening.id).filter(JobOpening.organization_id == current_user.organization_id)),
        ))
        offered_q = offered_q.filter(or_(
            Candidate.company_id.in_(db.query(Company.id).filter(Company.organization_id == current_user.organization_id)),
            Candidate.job_opening_id.in_(db.query(JobOpening.id).filter(JobOpening.organization_id == current_user.organization_id)),
        ))
    if companyId:
        onboarded_q = onboarded_q.filter(Candidate.company_id == companyId)
        offered_q = offered_q.filter(Candidate.company_id == companyId)

    return {
        "applied": counts.get("applied", 0),
        "screened": counts.get("screened", 0),
        "shortlisted": counts.get("shortlisted", 0),
        "interviewed": counts.get("interviewed", 0),
        "offered": counts.get("offered", 0),
        "selected": counts.get("selected", 0),
        "hired": counts.get("hired", 0),
        "rejected": counts.get("rejected", 0),
        "total": sum(counts.values()),
        "onboarded": onboarded_q.scalar() or 0,
        "offeredNotJoined": offered_q.scalar() or 0,
    }


@router.get("/api/recruitment/jobs/template", tags=["Recruitment"])
def download_jobs_template(current_user: User = Depends(get_current_user)):
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["title", "description", "requirements", "location", "companyId", "departmentId", "branchId", "employmentType", "salaryMin", "salaryMax", "experienceRequired", "skillsRequired", "vacancyCount", "status"])
    writer.writerow(["Senior React Developer", "Build web apps", "5+ yrs React", "Bengaluru", "1", "1", "1", "full_time", "1200000", "1800000", "5+ years", "React, TypeScript", "1", "open"])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=jobs_template.csv"})


@router.get("/api/recruitment/candidates/template", tags=["Recruitment"])
def download_candidates_template(current_user: User = Depends(get_current_user)):
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["firstName", "lastName", "email", "phone", "jobId", "source", "status", "currentPosition", "currentCompany", "experienceYears", "skills"])
    writer.writerow(["John", "Doe", "john@example.com", "1234567890", "2", "linkedin", "applied", "Developer", "Acme", "5", "React, Python"])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=candidates_template.csv"})


@router.get("/api/recruitment/interviews/template", tags=["Recruitment"])
def download_interviews_template(current_user: User = Depends(get_current_user)):
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["candidateId", "jobId", "interviewerId", "round", "type", "scheduledAt", "status"])
    writer.writerow(["34", "2", "1", "1", "technical", "2026-08-20T10:00:00", "scheduled"])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=interviews_template.csv"})


@router.post("/api/recruitment/jobs/bulk-upload", tags=["Recruitment"])
async def bulk_upload_jobs(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig", errors="replace")))
    created, updated, errors = 0, 0, []
    for idx, row in enumerate(reader, start=2):
        try:
            data = {k: v for k, v in row.items() if v and hasattr(JobOpening, k)}
            if not data.get("title"):
                errors.append(f"Row {idx}: missing title")
                continue
            data["organization_id"] = current_user.organization_id
            jo = JobOpening(**data)
            db.add(jo)
            created += 1
        except Exception as e:
            errors.append(f"Row {idx}: {e}")
    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


@router.post("/api/recruitment/candidates/bulk-upload", tags=["Recruitment"])
async def bulk_upload_candidates(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig", errors="replace")))
    created, updated, errors = 0, 0, []
    for idx, row in enumerate(reader, start=2):
        try:
            email = (row.get("email") or "").strip()
            existing = db.query(Candidate).filter(Candidate.email == email).first() if email else None
            data = {k: v for k, v in row.items() if v and hasattr(Candidate, k)}
            if data.get("jobId") and "job_opening_id" not in data:
                data["job_opening_id"] = data.pop("jobId")
            if "status" in row and row.get("status") and "candidate_status" not in data:
                data["candidate_status"] = row["status"]
            first = data.pop("firstName", "") or ""
            last = data.pop("lastName", "") or ""
            if "full_name" not in data:
                data["full_name"] = f"{first} {last}".strip()
            if existing:
                if current_user.role != "superadmin" and not _candidate_in_org(db, existing, current_user.organization_id):
                    errors.append(f"Row {idx}: candidate email already registered in another organization")
                    continue
                for k, v in data.items():
                    if hasattr(Candidate, k) and v is not None:
                        setattr(existing, k, v)
                updated += 1
            else:
                if current_user.role != "superadmin" and data.get("job_opening_id"):
                    job = db.query(JobOpening).filter(JobOpening.id == data["job_opening_id"]).first()
                    if not job or job.organization_id != current_user.organization_id:
                        errors.append(f"Row {idx}: job does not belong to your organization")
                        continue
                cand = Candidate(**data)
                db.add(cand)
                created += 1
        except Exception as e:
            errors.append(f"Row {idx}: {e}")
    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


@router.post("/api/recruitment/interviews/bulk-upload", tags=["Recruitment"])
async def bulk_upload_interviews(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig", errors="replace")))
    created, updated, errors = 0, 0, []
    for idx, row in enumerate(reader, start=2):
        try:
            data = {k: v for k, v in row.items() if v and hasattr(Interview, k)}
            if data.get("jobId") and "job_opening_id" not in data:
                data["job_opening_id"] = data.pop("jobId")
            if data.get("round") and "interview_round" not in data:
                data["interview_round"] = data.pop("round")
            if data.get("scheduledAt") and "date" not in data:
                try:
                    data["date"] = dateparser.parse(str(data.pop("scheduledAt")))
                except Exception:
                    data.pop("scheduledAt", None)
            if not data.get("candidate_id"):
                errors.append(f"Row {idx}: missing candidateId")
                continue
            if current_user.role != "superadmin":
                cand = db.query(Candidate).filter(Candidate.id == data["candidate_id"]).first()
                if not _candidate_in_org(db, cand, current_user.organization_id):
                    errors.append(f"Row {idx}: candidate does not belong to your organization")
                    continue
            iv = Interview(**data)
            db.add(iv)
            created += 1
        except Exception as e:
            errors.append(f"Row {idx}: {e}")
    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


@router.get("/api/recruitment/jobs", tags=["Recruitment"])
def get_job_openings(
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(JobOpening).filter(JobOpening.deleted_at.is_(None))
    if current_user.role == "superadmin" and organizationId:
        query = query.filter(JobOpening.organization_id == organizationId)
    elif current_user.role != "superadmin":
        query = query.filter(JobOpening.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(JobOpening.company_id == companyId)
    result = query.order_by(JobOpening.created_at.desc()).limit(200).all()
    return [_serialize_job(j, db) for j in result]


@router.get("/api/recruitment/jobs/check-code", tags=["Recruitment"])
def check_job_code(
    code: str,
    excludeId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(JobOpening).filter(JobOpening.job_code == code, JobOpening.deleted_at.is_(None))
    if excludeId:
        query = query.filter(JobOpening.id != excludeId)
    existing = query.first()
    return {"duplicate": bool(existing)}


@router.post("/api/recruitment/jobs", tags=["Recruitment"])
def create_job_opening(
    job_data: JobOpeningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(job_data.model_dump())
    # Map frontend postDate -> published_date column
    if "post_date" in data:
        try:
            data["published_date"] = datetime.fromisoformat(data.pop("post_date").replace("Z", "+00:00")) if data.get("post_date") else None
        except Exception:
            data.pop("post_date", None)
    data["organization_id"] = current_user.organization_id
    if current_user.role != "superadmin":
        validate_company_in_org(db, Company, data.get("company_id"), current_user.organization_id)
    jo = JobOpening(**data)
    db.add(jo)
    db.commit()
    db.refresh(jo)
    try:
        _create_audit_log(db, current_user, "create", "job", str(jo.id), f"Job opening created: {jo.title or ''}")
    except Exception:
        pass
    return _serialize_job(jo, db)


@router.get("/api/recruitment/candidates", tags=["Recruitment"])
def get_candidates(
    jobId: Optional[int] = None,
    status: Optional[str] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Candidate)
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(or_(
            Candidate.company_id.in_(db.query(Company.id).filter(Company.organization_id == current_user.organization_id)),
            Candidate.job_opening_id.in_(db.query(JobOpening.id).filter(JobOpening.organization_id == current_user.organization_id)),
        ))
    if jobId:
        query = query.filter(Candidate.job_opening_id == jobId)
    if status:
        query = query.filter(Candidate.candidate_status == status)
    if companyId:
        query = query.filter(Candidate.company_id == companyId)
    result = query.order_by(Candidate.created_at.desc()).limit(200).all()
    return [_serialize_candidate(c, db) for c in result]


@router.post("/api/recruitment/candidates", tags=["Recruitment"])
def create_candidate(
    candidate_data: CandidateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(candidate_data.model_dump())
    if data.get("job_id") is not None and not data.get("job_opening_id"):
        data["job_opening_id"] = data.pop("job_id")
    # Map the status field to the renamed candidate_status column.
    # Use exclude_unset so we only see fields the client explicitly sent.
    explicit = candidate_data.model_dump(exclude_unset=True)
    sent_status = None
    if "candidateStatus" in explicit:
        sent_status = explicit.get("candidateStatus")
    elif "status" in explicit:
        sent_status = explicit.get("status")
    if sent_status is not None:
        data["candidate_status"] = sent_status
    data.pop("status", None)
    data["full_name"] = resolve_full_name(
        full_name=data.get("full_name"),
        first_name=data.pop("first_name", None),
        last_name=data.pop("last_name", None),
    )

    # Email and phone are used for login, so they must be unique across users,
    # employees and other candidates.
    new_email = (data.get("email") or "").strip().lower()
    new_phone = (data.get("phone") or "").strip()
    if new_email:
        dup_user = db.query(User).filter(func.lower(User.email) == new_email).first()
        dup_emp = db.query(Employee).filter(func.lower(Employee.email) == new_email).first()
        dup_cand = db.query(Candidate).filter(func.lower(Candidate.email) == new_email).first()
        if dup_user or dup_emp or dup_cand:
            raise HTTPException(status_code=400, detail="Email already exists")
    if new_phone:
        dup_user_p = db.query(User).filter(User.phone == new_phone).first()
        dup_emp_p = db.query(Employee).filter(Employee.phone == new_phone).first()
        dup_cand_p = db.query(Candidate).filter(Candidate.phone == new_phone).first()
        if dup_user_p or dup_emp_p or dup_cand_p:
            raise HTTPException(status_code=400, detail="Phone number already exists")

    # Preserve fields without a dedicated column (e.g. address) in custom_fields
    extra_fields = {}
    for key in ("address", "state", "pincode", "current_address", "permanent_address", "github_url", "parsed_education", "highlights"):
        if data.get(key) is not None:
            extra_fields[key] = data.pop(key)
    data = {k: v for k, v in data.items() if hasattr(Candidate, k)}
    if extra_fields:
        data["custom_fields"] = {**(data.get("custom_fields") or {}), **extra_fields}
    cand = Candidate(**data)
    if not cand.full_name:
        raise HTTPException(status_code=400, detail="Full name is required")
    # Inherit company/department from the applied job so the candidate sorts
    # consistently under the same company/branch/department as the role.
    if cand.job_opening_id and not cand.company_id:
        job = db.query(JobOpening).filter(JobOpening.id == cand.job_opening_id).first()
        if job:
            cand.company_id = job.company_id
    if current_user.role != "superadmin":
        if cand.job_opening_id:
            job = db.query(JobOpening).filter(JobOpening.id == cand.job_opening_id).first()
            if not job or job.organization_id != current_user.organization_id:
                raise HTTPException(status_code=404, detail="Job opening not found")
        validate_company_in_org(db, Company, cand.company_id, current_user.organization_id)
    db.add(cand)
    db.commit()
    db.refresh(cand)
    try:
        _create_audit_log(db, current_user, "create", "candidate", str(cand.id), f"Candidate created: {cand.full_name or cand.email or ''}")
    except Exception:
        pass
    return _serialize_candidate(cand, db)


@router.post("/api/recruitment/parse-resume", tags=["Recruitment"])
def parse_resume_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse a resume (PDF/DOCX/TXT) and return structured candidate data."""
    from services.resume_parser import enrich_with_llm, parse_resume, extract_text

    data = file.file.read()
    file.file.close()
    parsed = parse_resume(file.filename or "resume", data)
    if "error" in parsed:
        raise HTTPException(status_code=400, detail=parsed["error"])
    text = extract_text(file.filename or "resume", data)
    parsed = enrich_with_llm(parsed, text)
    return parsed


@router.post("/api/recruitment/resume-upload", tags=["Recruitment"])
async def upload_candidate_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a resume file and return its public URL (used in the Add Candidate modal)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".pdf"
    if ext not in (".pdf", ".doc", ".docx", ".txt"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOC, DOCX or TXT.")
    filename = f"candidate_resume_{uuid.uuid4().hex[:8]}{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "candidates")
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    return {"resumeUrl": f"/uploads/candidates/{filename}", "url": f"/uploads/candidates/{filename}"}


@router.post("/api/recruitment/candidates/with-resume", tags=["Recruitment"])
def create_candidate_with_resume(
    file: UploadFile = File(...),
    job_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse a resume and create a candidate record from the extracted data."""
    from services.resume_parser import enrich_with_llm, parse_resume, extract_text

    data = file.file.read()
    file.file.close()
    parsed = parse_resume(file.filename or "resume", data)
    if "error" in parsed:
        raise HTTPException(status_code=400, detail=parsed["error"])
    text = extract_text(file.filename or "resume", data)
    parsed = enrich_with_llm(parsed, text)

    existing = db.query(Candidate).filter(Candidate.email == (parsed.get("email") or "")).first()
    if existing:
        raise HTTPException(status_code=409, detail="A candidate with this email already exists")

    if current_user.role != "superadmin":
        job_for_cand = db.query(JobOpening).filter(JobOpening.id == job_id).first()
        if not job_for_cand or job_for_cand.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Job opening not found")
    else:
        job_for_cand = db.query(JobOpening).filter(JobOpening.id == job_id).first()

    cand = Candidate(
        full_name=parsed.get("name") or "Unnamed Candidate",
        email=parsed.get("email") or "",
        phone=parsed.get("phone"),
        job_opening_id=job_id,
        candidate_status="applied",
        source="resume_upload",
        current_company=parsed.get("currentCompany"),
        current_position=parsed.get("currentTitle"),
        experience_years=int(parsed.get("experienceYears") or 0) if parsed.get("experienceYears") else None,
        education=parsed.get("educationText"),
        skills=parsed.get("skillsText"),
        linkedin_url=parsed.get("linkedinUrl"),
        notes=parsed.get("summary"),
        custom_fields={"address": parsed.get("address") or "", "parsedEducation": parsed.get("education") or []},
    )
    # Inherit company from the applied job
    if job_for_cand:
        cand.company_id = job_for_cand.company_id
    db.add(cand)
    db.commit()
    db.refresh(cand)
    return _serialize_candidate(cand, db)


@router.put("/api/recruitment/candidates/{candidate_id}/status", tags=["Recruitment"])
@router.patch("/api/recruitment/candidates/{candidate_id}/status", tags=["Recruitment"])
def update_candidate_status(
    candidate_id: int,
    status_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cand = _load_candidate_in_org(db, candidate_id, current_user)
    old_status = cand.candidate_status
    cand.candidate_status = status_data.get("status", cand.candidate_status)
    reason = status_data.get("reason") or status_data.get("rejectionReason") or status_data.get("comments") or ""
    # Track rejection records so rejected candidates are stored for later review
    if cand.candidate_status == "rejected" and old_status != "rejected":
        cand.rejected_at = datetime.utcnow()
        cand.rejection_reason = reason
    elif cand.candidate_status != "rejected":
        cand.rejected_at = None
    # not_joined keeps its reason visible in the reason column
    if cand.candidate_status in ("not_joined", "rejected"):
        if reason:
            cand.rejection_reason = reason
    # Store selection/offer reason
    if cand.candidate_status in ("offered", "selected", "hired"):
        if reason:
            cand.selection_reason = reason
    else:
        cand.selection_reason = None
    db.commit()
    db.refresh(cand)
    try:
        _create_audit_log(
            db, current_user, "status_changed", "candidate", str(cand.id),
            f"Candidate status changed from {old_status or 'none'} to {cand.candidate_status}" + (f" - {reason}" if reason else ""),
        )
    except Exception:
        pass
    return _serialize_candidate(cand, db)


@router.post("/api/recruitment/candidates/bulk-status", tags=["Recruitment"])
def bulk_update_candidate_status(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk update candidate statuses in a single transaction.

    Accepts: {"ids": [1,2,3], "status": "shortlisted", "reason": "..."}
    This avoids firing one HTTP request per candidate which freezes the UI
    when hundreds of records are selected at once.
    """
    ids = payload.get("ids") or []
    if not ids:
        raise HTTPException(status_code=400, detail="No candidate ids provided")
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a list")

    target_status = (payload.get("status") or "").strip()
    if not target_status:
        raise HTTPException(status_code=400, detail="status is required")
    reason = (payload.get("reason") or "").strip()

    now = datetime.utcnow()
    updated = 0
    for candidate_id in ids:
        cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not cand:
            continue
        if current_user.role != "superadmin" and not _candidate_in_org(db, cand, current_user.organization_id):
            continue
        old_status = cand.candidate_status
        cand.candidate_status = target_status
        if target_status == "rejected" and old_status != "rejected":
            cand.rejected_at = now
            cand.rejection_reason = reason
        elif target_status != "rejected":
            cand.rejected_at = None
            if reason:
                cand.rejection_reason = reason
        if target_status in ("offered", "selected", "hired"):
            if reason:
                cand.selection_reason = reason
        else:
            cand.selection_reason = None
        updated += 1

    db.commit()
    try:
        _create_audit_log(
            db, current_user, "bulk_status_changed", "candidate", ",".join(str(i) for i in ids),
            f"{updated} candidate(s) moved to status '{target_status}'" + (f" - {reason}" if reason else ""),
        )
    except Exception:
        pass
    return {"updated": updated, "status": target_status}


@router.put("/api/recruitment/interviews/{interview_id}", tags=["Recruitment"])
def update_interview(
    interview_id: int,
    interview_data: InterviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = _load_interview_in_org(db, interview_id, current_user)
    data = convert_camel_to_snake(interview_data.model_dump())
    if data.get("job_id") is not None and not data.get("job_opening_id"):
        data["job_opening_id"] = data.pop("job_id")
    if "scheduled_at" in data and data["scheduled_at"]:
        sa_val = data.pop("scheduled_at")
        # Guard against malformed/empty date strings (e.g. "T") from the UI.
        if isinstance(sa_val, str) and sa_val.strip() in ("", "T"):
            data.pop("date", None)
        else:
            data["date"] = sa_val
    if data.get("status") == "":
        data.pop("status", None)
    for k, v in data.items():
        if hasattr(Interview, k) and v is not None:
            setattr(interview, k, v)
    db.commit()
    db.refresh(interview)
    try:
        _create_audit_log(
            db, current_user, "update", "interview", str(interview.id),
            f"Interview round {interview.interview_round or 1} updated",
        )
    except Exception:
        pass
    return _serialize_interview(interview, db)


@router.delete("/api/recruitment/interviews/{interview_id}", tags=["Recruitment"])
def delete_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = _load_interview_in_org(db, interview_id, current_user)
    cand_id = interview.candidate_id
    round_no = interview.interview_round or 1
    db.delete(interview)
    db.commit()
    try:
        _create_audit_log(db, current_user, "delete", "interview", str(interview_id), f"Interview round {round_no} deleted for candidate {cand_id}")
    except Exception:
        pass
    return {"message": "Interview deleted"}


@router.put("/api/recruitment/interviews/{interview_id}/status", tags=["Recruitment"])
@router.patch("/api/recruitment/interviews/{interview_id}/status", tags=["Recruitment"])
def update_interview_status(
    interview_id: int,
    status_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = _load_interview_in_org(db, interview_id, current_user)
    old_status = interview.status
    interview.status = status_data.get("status", interview.status)
    if status_data.get("interview_round") is not None:
        try:
            interview.interview_round = int(status_data["interview_round"])
        except Exception:
            pass
    if status_data.get("interview_type"):
        interview.interview_type = status_data["interview_type"]
    if status_data.get("feedback") is not None:
        interview.feedback = status_data["feedback"]
    if status_data.get("rating"):
        try:
            interview.rating = int(status_data["rating"])
        except Exception:
            pass
    if status_data.get("overall_score") is not None:
        try:
            interview.overall_score = int(status_data["overall_score"])
        except Exception:
            pass
    if status_data.get("technical_score") is not None:
        try:
            interview.technical_score = int(status_data["technical_score"])
        except Exception:
            pass
    if status_data.get("communication_score") is not None:
        try:
            interview.communication_score = int(status_data["communication_score"])
        except Exception:
            pass
    if status_data.get("interviewer_notes") is not None:
        interview.interviewer_notes = status_data["interviewer_notes"]
    if status_data.get("next_steps") is not None:
        interview.next_steps = status_data["next_steps"]
    db.commit()

    # Auto-advance the candidate pipeline based on the interview decision.
    # This only runs for legacy "completed" status updates. The UI "Selected" /
    # "Rejected" actions only mark the interview; moving the candidate to
    # offered/rejected happens via the explicit Move buttons.
    cand = None
    if interview.candidate_id:
        cand = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
    if cand:
        decision = status_data.get("decision")
        if interview.status == "completed":
            if decision == "reject":
                cand.candidate_status = "rejected"
                cand.rejected_at = datetime.utcnow()
                cand.rejection_reason = status_data.get("reason") or "Rejected after interview"
            elif decision == "select":
                # Is there another round pending for this candidate?
                higher_rounds = db.query(Interview).filter(
                    Interview.candidate_id == cand.id,
                    Interview.id != interview.id,
                    Interview.interview_round > (interview.interview_round or 1),
                ).count()
                pending_rounds = db.query(Interview).filter(
                    Interview.candidate_id == cand.id,
                    Interview.id != interview.id,
                    Interview.status.in_(["scheduled", "pending", "in_progress"]),
                    Interview.interview_round >= (interview.interview_round or 1),
                ).count()
                if higher_rounds > 0 or pending_rounds > 0:
                    cand.candidate_status = "interviewed"
                else:
                    cand.candidate_status = "offered"
            elif cand.candidate_status in ("applied", "screened", "shortlisted"):
                cand.candidate_status = "interviewed"
        elif decision == "select":
            cand.candidate_status = "offered"
        elif decision == "reject":
            cand.candidate_status = "rejected"
            cand.rejected_at = datetime.utcnow()
            cand.rejection_reason = status_data.get("reason") or "Rejected after interview"
        db.commit()

    db.refresh(interview)
    try:
        _create_audit_log(
            db, current_user, "status_changed", "interview", str(interview.id),
            f"Interview round {interview.interview_round or 1} status changed to {interview.status}",
        )
    except Exception:
        pass
    result = _serialize_interview(interview, db)
    if cand:
        result["candidateStatus"] = cand.candidate_status
    return result


@router.post("/api/recruitment/interviews/bulk-status", tags=["Recruitment"])
def bulk_update_interview_status(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk update interview statuses in a single transaction.

    Accepts: {"ids": [1,2,3], "status": "selected", "decision": "select"}
    This avoids firing one HTTP request per interview which freezes the UI
    when many records are selected at once.
    """
    ids = payload.get("ids") or []
    if not ids:
        raise HTTPException(status_code=400, detail="No interview ids provided")
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a list")

    target_status = (payload.get("status") or "").strip()
    if not target_status:
        raise HTTPException(status_code=400, detail="status is required")
    decision = payload.get("decision") or ""

    updated = 0
    for interview_id in ids:
        interview = db.query(Interview).filter(Interview.id == interview_id).first()
        if not interview:
            continue
        if current_user.role != "superadmin":
            _icand = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
            if not _candidate_in_org(db, _icand, current_user.organization_id):
                continue
        interview.status = target_status
        updated += 1

    # Sync candidate statuses based on the bulk decision, mirroring the
    # single-interview flow but without repeated commits.
    if decision == "select" and updated:
        for interview_id in ids:
            interview = db.query(Interview).filter(Interview.id == interview_id).first()
            if not interview or not interview.candidate_id:
                continue
            cand = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
            if not cand:
                continue
            cand.candidate_status = "offered"
        db.commit()
    elif decision == "reject" and updated:
        now = datetime.utcnow()
        for interview_id in ids:
            interview = db.query(Interview).filter(Interview.id == interview_id).first()
            if not interview or not interview.candidate_id:
                continue
            cand = db.query(Candidate).filter(Candidate.id == interview.candidate_id).first()
            if not cand:
                continue
            cand.candidate_status = "rejected"
            cand.rejected_at = now
            cand.rejection_reason = payload.get("reason") or "Rejected after interview"
        db.commit()

    db.commit()
    try:
        _create_audit_log(
            db, current_user, "bulk_status_changed", "interview", ",".join(str(i) for i in ids),
            f"{updated} interview(s) moved to status '{target_status}'",
        )
    except Exception:
        pass
    return {"updated": updated, "status": target_status}


@router.post("/api/recruitment/candidates/{candidate_id}/cv", tags=["Recruitment"])
async def upload_candidate_cv(
    candidate_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload / replace a candidate's CV or biodata document."""
    cand = _load_candidate_in_org(db, candidate_id, current_user)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".pdf"
    if ext not in (".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOC, DOCX, TXT or image.")
    filename = f"candidate_{cand.id}_cv_{uuid.uuid4().hex[:8]}{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "candidates")
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    cand.resume_url = f"/uploads/candidates/{filename}"
    db.commit()
    return {"message": "CV uploaded", "resumeUrl": cand.resume_url}


@router.get("/api/recruitment/candidates/{candidate_id}/cv", tags=["Recruitment"])
def get_candidate_cv(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cand = _load_candidate_in_org(db, candidate_id, current_user)
    return {"resumeUrl": cand.resume_url or "", "candidateId": cand.id}


@router.put("/api/recruitment/candidates/{candidate_id}", tags=["Recruitment"])
def update_candidate(
    candidate_id: int,
    candidate_data: CandidateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cand = _load_candidate_in_org(db, candidate_id, current_user)
    data = convert_camel_to_snake(candidate_data.model_dump())
    if data.get("job_id") is not None and not data.get("job_opening_id"):
        data["job_opening_id"] = data.pop("job_id")

    new_email = (data.get("email") or "").strip().lower() or (cand.email or "").strip().lower()
    new_phone = (data.get("phone") or "").strip() or (cand.phone or "").strip()
    if new_email:
        dup_user = db.query(User).filter(func.lower(User.email) == new_email).first()
        dup_emp = db.query(Employee).filter(func.lower(Employee.email) == new_email).first()
        dup_cand = db.query(Candidate).filter(func.lower(Candidate.email) == new_email, Candidate.id != candidate_id).first()
        if dup_user or dup_emp or dup_cand:
            raise HTTPException(status_code=400, detail="Email already exists")
    if new_phone:
        dup_user_p = db.query(User).filter(User.phone == new_phone).first()
        dup_emp_p = db.query(Employee).filter(Employee.phone == new_phone).first()
        dup_cand_p = db.query(Candidate).filter(Candidate.phone == new_phone, Candidate.id != candidate_id).first()
        if dup_user_p or dup_emp_p or dup_cand_p:
            raise HTTPException(status_code=400, detail="Phone number already exists")

    if any(data.get(k) for k in ("full_name", "first_name", "last_name")):
        data["full_name"] = resolve_full_name(
            full_name=data.get("full_name") or cand.full_name,
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
        )
        data.pop("first_name", None)
        data.pop("last_name", None)
    # Map legacy status -> renamed candidate_status column.
    # Use exclude_unset so we only see fields the client explicitly sent.
    explicit = candidate_data.model_dump(exclude_unset=True)
    sent_status = None
    if "candidateStatus" in explicit:
        sent_status = explicit.get("candidateStatus")
    elif "status" in explicit:
        sent_status = explicit.get("status")
    if sent_status is not None:
        data["candidate_status"] = sent_status
    data.pop("status", None)
    extra_fields = {}
    for key in ("address", "state", "pincode", "current_address", "permanent_address", "github_url", "parsed_education", "highlights"):
        if key in data:
            extra_fields[key] = data.pop(key)
    if extra_fields:
        cand.custom_fields = {**(cand.custom_fields or {}), **extra_fields}
    for k, v in data.items():
        if hasattr(Candidate, k) and v is not None:
            setattr(cand, k, v)
    db.commit()
    db.refresh(cand)
    try:
        _create_audit_log(db, current_user, "update", "candidate", str(cand.id), f"Candidate updated: {cand.full_name or cand.email or ''}")
    except Exception:
        pass
    return _serialize_candidate(cand, db)


@router.delete("/api/recruitment/candidates/{candidate_id}", tags=["Recruitment"])
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cand = _load_candidate_in_org(db, candidate_id, current_user)
    name = cand.full_name or cand.email or ""
    db.delete(cand)
    db.commit()
    try:
        _create_audit_log(db, current_user, "delete", "candidate", str(candidate_id), f"Candidate deleted: {name}")
    except Exception:
        pass
    return {"message": "Candidate deleted"}


@router.put("/api/recruitment/jobs/{job_id}", tags=["Recruitment"])
def update_job_opening(
    job_id: int,
    job_data: JobOpeningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jo = _load_job_in_org(db, job_id, current_user)
    data = convert_camel_to_snake(job_data.model_dump())
    # Map frontend postDate -> published_date column
    if "post_date" in data:
        try:
            data["published_date"] = datetime.fromisoformat(data.pop("post_date").replace("Z", "+00:00")) if data.get("post_date") else None
        except Exception:
            data.pop("post_date", None)
    for k, v in data.items():
        if hasattr(JobOpening, k) and v is not None:
            setattr(jo, k, v)
    db.commit()
    db.refresh(jo)
    try:
        _create_audit_log(db, current_user, "update", "job", str(jo.id), f"Job opening updated: {jo.title or ''}")
    except Exception:
        pass
    return _serialize_job(jo, db)


@router.delete("/api/recruitment/jobs/{job_id}", tags=["Recruitment"])
def delete_job_opening(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jo = _load_job_in_org(db, job_id, current_user)
    title = jo.title or ""
    db.delete(jo)
    db.commit()
    try:
        _create_audit_log(db, current_user, "delete", "job", str(job_id), f"Job opening deleted: {title}")
    except Exception:
        pass
    return {"message": "Job opening deleted"}


@router.put("/api/recruitment/jobs/{job_id}/status", tags=["Recruitment"])
@router.patch("/api/recruitment/jobs/{job_id}/status", tags=["Recruitment"])
def update_job_status(
    job_id: int,
    status_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jo = _load_job_in_org(db, job_id, current_user)
    old = jo.status
    jo.status = status_data.get("status", jo.status)
    db.commit()
    db.refresh(jo)
    try:
        _create_audit_log(db, current_user, "status_changed", "job", str(jo.id), f"Job status changed from {old or 'none'} to {jo.status}")
    except Exception:
        pass
    return _serialize_job(jo, db)


@router.get("/api/recruitment/jobs/{job_id}", tags=["Recruitment"])
def get_job_opening(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jo = _load_job_in_org(db, job_id, current_user)
    return _serialize_job(jo, db)


@router.get("/api/recruitment/interviews", tags=["Recruitment"])
def get_interviews(
    candidateId: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Interview)
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.join(Candidate, Interview.candidate_id == Candidate.id).filter(or_(
            Candidate.company_id.in_(db.query(Company.id).filter(Company.organization_id == current_user.organization_id)),
            Candidate.job_opening_id.in_(db.query(JobOpening.id).filter(JobOpening.organization_id == current_user.organization_id)),
        ))
    if candidateId:
        query = query.filter(Interview.candidate_id == candidateId)
    if companyId:
        query = query.filter(Interview.company_id == companyId)
    result = query.order_by(Interview.date.desc()).limit(2000).all()
    return [_serialize_interview(i, db) for i in result]


@router.post("/api/recruitment/interviews", tags=["Recruitment"])
def schedule_interview(
    interview_data: InterviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = convert_camel_to_snake(interview_data.model_dump())
    if data.get("job_id") is not None and not data.get("job_opening_id"):
        data["job_opening_id"] = data.pop("job_id")
    if "scheduled_at" in data and data["scheduled_at"] and "date" not in data:
        sa_val = data.pop("scheduled_at")
        # Guard against malformed/empty date strings (e.g. "T") from the UI.
        if isinstance(sa_val, str) and sa_val.strip() in ("", "T"):
            data["date"] = datetime.utcnow()
        else:
            data["date"] = sa_val
    elif "scheduled_at" in data:
        data.pop("scheduled_at", None)
    data = {k: v for k, v in data.items() if hasattr(Interview, k)}
    if "date" not in data or data.get("date") in (None, ""):
        data["date"] = datetime.utcnow()
    if current_user.role != "superadmin":
        _load_candidate_in_org(db, data.get("candidate_id"), current_user)
    interview = Interview(**data)
    db.add(interview)
    db.commit()
    db.refresh(interview)
    try:
        _create_audit_log(
            db, current_user, "scheduled", "interview", str(interview.id),
            f"Interview round {interview.interview_round or 1} scheduled for candidate {interview.candidate_id}",
        )
    except Exception:
        pass
    return _serialize_interview(interview, db)


@router.post("/api/recruitment/candidates/{candidate_id}/onboard", tags=["Recruitment"])
def onboard_candidate(
    candidate_id: int,
    payload: dict = {},
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a shortlisted/offered candidate into the Employee Onboarding pipeline."""
    cand = _load_candidate_in_org(db, candidate_id, current_user)
    if cand.employee_id:
        raise HTTPException(status_code=400, detail="Candidate already onboarded")

    join_date = cand.hired_date or datetime.utcnow()
    if payload.get("joinDate"):
        try:
            join_date = dateparser.parse(str(payload["joinDate"]))
        except Exception:
            pass

    org_id = current_user.organization_id

    # Create a matching user account (login credentials for the new employee)
    email = (cand.email or "").strip()
    base_email = email or f"candidate_{cand.id}_noemail@hrms.com"
    # Reuse an existing account if the email is already registered, so onboarding
    # does not crash on the unique users.email / employees.user_id constraints
    # (e.g. the person already has an admin/employee login).
    existing_emp = db.query(Employee).filter(Employee.email == base_email).first()
    if existing_emp:
        emp = existing_emp
    else:
        existing_user = db.query(User).filter(User.email == base_email).first()
        if existing_user:
            user = existing_user
        else:
            user = User(
                email=base_email,
                password_hash=get_password_hash("TempPass123!"),
                full_name=cand.full_name or "",
                role="employee",
                organization_id=org_id,
            )
            db.add(user)
            db.flush()

        first_name, last_name = split_name(cand.full_name)

        # Generate a unique employee code (seed data already uses EMP-0001..EMP-0100).
        base_code = f"EMP-{cand.id:04d}"
        emp_code = base_code
        i = 1
        while db.query(Employee).filter(Employee.employee_code == emp_code).first():
            i += 1
            emp_code = f"{base_code}-{i}"

        custom = cand.custom_fields or {}
        emp = Employee(
            user_id=user.id,
            full_name=cand.full_name,
            first_name=first_name or cand.full_name,
            last_name=last_name,
            email=base_email,
            employee_code=emp_code,
            designation=cand.current_position,
            organization_id=org_id,
            company_id=cand.company_id,
            department_id=payload.get("departmentId"),
            status="new",
            onboarding_step="pending",
            phone=cand.phone,
            skills=cand.skills,
            education_level=cand.education,
            current_address=custom.get("address") or payload.get("currentAddress"),
            permanent_address=custom.get("address") or payload.get("permanentAddress"),
            address=custom.get("address") or payload.get("currentAddress"),
            resume_url=cand.resume_url,
            base_salary=cand.expected_salary or cand.current_salary or 0,
            join_date=join_date,
        )
        db.add(emp)
        db.flush()

        # Populate the many-to-many company/branch relationships so the employee
        # list UI can show the company/branch columns (they read emp.companies / emp.branches).
        if cand.company_id:
            company = db.query(Company).filter(Company.id == cand.company_id).first()
            if company:
                emp.companies = [company]
        if cand.branch_id:
            branch = db.query(Branch).filter(Branch.id == cand.branch_id).first()
            if branch:
                emp.branches = [branch]
        db.flush()

        # Generate standard onboarding tasks
        try:
            tasks = [
                OnboardingTask(employee_id=emp.id, title="Collect Aadhaar & PAN copies", department="HR", status="pending"),
                OnboardingTask(employee_id=emp.id, title="Open/Update Salary Bank Account", department="Finance", status="pending"),
                OnboardingTask(employee_id=emp.id, title="Generate UAN for EPF", department="Finance", status="pending"),
                OnboardingTask(employee_id=emp.id, title="Register for ESIC (if applicable)", department="Finance", status="pending"),
                OnboardingTask(employee_id=emp.id, title="Provision IT Assets (Laptop/Phone)", department="IT", status="pending"),
                OnboardingTask(employee_id=emp.id, title="Create Email & System Access", department="IT", status="pending"),
            ]
            db.add_all(tasks)
        except Exception as e:
            print(f"Error generating onboarding tasks: {e}")

    # Link candidate -> employee and advance pipeline status
    cand.employee_id = emp.id
    cand.candidate_status = "hired"
    cand.hired_date = join_date

    db.commit()
    db.refresh(emp)
    try:
        _create_audit_log(
            db, current_user, "onboarded", "candidate", str(cand.id),
            f"Candidate onboarded (employee {emp.employee_code or emp.id})",
        )
    except Exception:
        pass

    return {
        "message": "Candidate moved to onboarding",
        "candidateId": cand.id,
        "employeeId": emp.id,
        "employeeCode": emp.employee_code,
        "candidate": _serialize_candidate(cand, db),
    }


@router.get("/api/recruitment/logs", tags=["Recruitment"])
def get_recruitment_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return audit logs for recruitment entities (job / candidate / interview).

    Optionally filter by entity_type and entity_id. Used by the Log column in
    the recruitment tables.
    """
    query = db.query(AuditLog).filter(AuditLog.entity_type.in_(["job", "candidate", "interview"]))
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(AuditLog.organization_id == current_user.organization_id)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    rows = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": log.id,
            "entityType": log.entity_type,
            "entityId": log.entity_id,
            "action": log.action,
            "changes": log.changes,
            "userName": log.user_name,
            "createdAt": log.created_at.isoformat() if log.created_at else None,
        }
        for log in rows
    ]

