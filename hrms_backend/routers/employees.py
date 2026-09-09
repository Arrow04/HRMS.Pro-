from __future__ import annotations

import calendar
import csv
import io
import os
import uuid
from datetime import datetime
from typing import List, Optional
import pandas as pd

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import asc, func

from core.auth import check_role, get_current_user, get_password_hash
from core.datetime_utils import ist_now_naive
from core.document_retention import EMPLOYEE_DOC_MAX_UPLOAD_BYTES
from core.tenant import get_header_company_id


def _require_module_action(db: Session, user: User, module: str, action: str = "read"):
    """Raise 403 unless the user has the given module+action permission."""
    from core.permissions import has_module_permission
    if not has_module_permission(user, module, action, db):
        raise HTTPException(
            status_code=403,
            detail=f"You do not have {action} permission on the {module} module",
        )


def _plan_limit_info(db: Session, org_id: Optional[int]) -> Optional[dict]:
    """Return {plan_max, current_count} for an org's subscription plan, or None."""
    if not org_id:
        return None
    try:
        from models import Subscription
        sub = (
            db.query(Subscription)
            .filter(Subscription.organization_id == org_id, Subscription.deleted_at.is_(None))
            .order_by(Subscription.created_at.desc())
            .first()
        )
        if not sub or not sub.plan or not sub.plan.max_employees:
            return None
        current_count = db.query(Employee).filter(
            Employee.organization_id == org_id,
            Employee.deleted_at.is_(None),
            Employee.status == "active",
        ).count()
        return {"plan_max": int(sub.plan.max_employees), "current_count": current_count}
    except Exception:
        return None


def _enforce_employee_limit(db: Session, org_id: Optional[int], extra: int = 1):
    """Raise 403 when adding `extra` employees would exceed the plan limit."""
    info = _plan_limit_info(db, org_id)
    if info and (info["current_count"] + extra) > info["plan_max"]:
        raise HTTPException(
            status_code=403,
            detail=(
                f"You have reached your plan limit of {info['plan_max']} employees. "
                "Please upgrade your plan to add more."
            ),
        )
from database import get_db, get_read_db
from models import Attendance, Branch, Company, Department, Employee, Organization, User, OnboardingTask, Candidate, PayrollTemplate, EmployeeBranchAssignment
from sqlalchemy.orm import selectinload
from utils.helpers import convert_camel_to_snake
from utils.name_utils import (
    normalize_name_payload,
    apply_name_fields,
    employee_display_name,
    employee_name_api_fields,
    split_name,
)
from core.cache import cached, invalidate_master_data_caches, make_key, get_redis
from core.scale import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, MAX_PICKER_LIMIT, MAX_EXPORT_LIMIT, PICKER_PAGE_SIZE
from core.employee_filters import apply_picker_scope_filters

router = APIRouter(tags=["employees"])


def _bust_employee_cache(user: User) -> None:
    from core.cache import invalidate_employee_caches
    invalidate_employee_caches(getattr(user, "organization_id", None))


def _resolve_employee_company(emp, db: Session):
    """Return the employee's company dict, preferring the many-to-many
    relationship and falling back to the legacy company_id column."""
    if emp.companies and len(emp.companies) > 0:
        return {"id": emp.companies[0].id, "name": emp.companies[0].name}
    if emp.company_id:
        company = db.query(Company).filter(Company.id == emp.company_id).first()
        if company:
            return {"id": company.id, "name": company.name}
    return None


class PerformanceDetail(BaseModel):
    daysWorked: int
    hoursWorked: float
    avgHoursPerDay: float
    lateDays: int
    period: str


class PerformanceResponse(BaseModel):
    employeeId: int
    employeeName: str
    metrics: List[PerformanceDetail]
    summary: dict


@router.post("/{employee_id}/cv", response_model=dict)
async def upload_employee_cv(
    employee_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload / replace an employee's CV or biodata document."""
    import uuid
    employee = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".pdf"
    if ext not in (".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOC, DOCX, TXT or image.")
    filename = f"employee_{employee.id}_cv_{uuid.uuid4().hex[:8]}{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "employees")
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    employee.resume_url = f"/uploads/employees/{filename}"
    db.commit()
    return {"message": "CV uploaded", "resumeUrl": employee.resume_url}


@router.get("/{employee_id}/cv", response_model=dict)
def get_employee_cv(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"resumeUrl": employee.resume_url or "", "employeeId": employee.id}


@router.get("/check-duplicate")
def check_employee_duplicate(
    field: str = Query(...),
    value: str = Query(...),
    excludeId: Optional[int] = Query(None, description="Employee id to exclude (for edits)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if an employee field (email / employee_code / phone) is already taken.
    Returns { duplicate: bool, existingName: str|None }.
    """
    field = field.lower()
    if field not in ("email", "employee_code", "phone"):
        raise HTTPException(status_code=400, detail="field must be email, employee_code or phone")

    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.organization_id is not None:
        query = query.filter(Employee.organization_id == current_user.organization_id)

    # Compare case-insensitively for email / code, exact for phone
    if field == "email":
        query = query.filter(func.lower(Employee.email) == (value or "").strip().lower())
    elif field == "employee_code":
        query = query.filter(func.lower(Employee.employee_code) == (value or "").strip().lower())
    else:
        query = query.filter(Employee.phone == (value or "").strip())

    if excludeId is not None:
        query = query.filter(Employee.id != excludeId)

    existing = query.first()
    if not existing:
        return {"duplicate": False, "existingName": None}
    return {
        "duplicate": True,
        "existingName": employee_display_name(existing, "Another employee"),
    }


@router.get("/count", response_model=dict)
@cached(ttl=120, namespace="employees")
def get_employee_count(
    status: Optional[str] = None,
    companyId: Optional[int] = None,
    joinDateAfter: Optional[str] = None,
    exitStatus: Optional[str] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """Get employee count with optional filters (Redis-cached for 2 minutes)"""
    if companyId is None and request is not None:
        companyId = get_header_company_id(request)
    query = db.query(Employee)
    if current_user.organization_id is not None:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(Employee.company_id == companyId)
    if status:
        query = query.filter(Employee.status == status)
    if joinDateAfter:
        try:
            join_date = datetime.fromisoformat(joinDateAfter)
            query = query.filter(Employee.join_date >= join_date)
        except Exception as exc:
            pass
    if exitStatus:
        # Use status field instead of exit_status
        query = query.filter(Employee.status == exitStatus)
    elif not status:
        # Exclude hiring-pipeline employees (shortlisted + onboarding) from default totals
        query = query.filter(Employee.status.notin_(['new', 'shortlisted']))
    
    count = query.filter(Employee.deleted_at.is_(None)).count()
    return {"count": count}


@router.get("", response_model=dict)
def get_employees(
    companyId: Optional[int] = None,
    branchId: Optional[int] = None,
    departmentId: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    joinDateAfter: Optional[str] = None,
    includeDeleted: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    view: str = Query("summary", pattern="^(summary|full)$"),
    cursor: Optional[int] = Query(None, description="Keyset cursor (employee id). Enables O(log n) deep pagination."),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    """Paginated employee list — summary view by default (safe at 1M+ scale)."""
    if companyId is None and request is not None:
        companyId = get_header_company_id(request)

    from sqlalchemy.orm import selectinload, joinedload

    load_opts = (
        selectinload(Employee.companies),
        selectinload(Employee.department),
        selectinload(Employee.branches),
        selectinload(Employee.designation_obj),
    ) if view == "full" else (
        joinedload(Employee.department),
        joinedload(Employee.company),
        selectinload(Employee.branches),
        joinedload(Employee.designation_obj),
    )

    query = db.query(Employee).options(*load_opts)
    
    if current_user.organization_id is not None:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    
    # Apply filters efficiently using indexed columns
    query = apply_picker_scope_filters(
        query,
        db,
        company_id=companyId,
        branch_id=branchId,
        department_id=departmentId,
    )
    if joinDateAfter:
        try:
            join_date = datetime.fromisoformat(joinDateAfter.replace("Z", "+00:00") if "T" in joinDateAfter else joinDateAfter)
            query = query.filter(Employee.join_date >= join_date)
        except Exception:
            pass
    if status:
        query = query.filter(Employee.status == status)
    else:
        # Default list: exclude employees still in the hiring pipeline.
        # Shortlisted employees live in the Shortlisted tab, and employees
        # in active onboarding (status='new') live in the Onboarding tab.
        # They only appear here once onboarding is completed (status='active').
        query = query.filter(Employee.status.notin_(['new', 'shortlisted']))
    
    # Optimize search with indexed columns
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Employee.full_name.ilike(search_pattern)) |
            (Employee.first_name.ilike(search_pattern)) |
            (Employee.last_name.ilike(search_pattern)) |
            (Employee.email.ilike(search_pattern)) |
            (Employee.employee_code.ilike(search_pattern))
        )
    
    if not includeDeleted:
        query = query.filter(Employee.deleted_at.is_(None))
    
    if cursor is not None:
        from core.pagination import apply_keyset
        eff_limit = limit
        query = apply_keyset(query, Employee, Employee.id, cursor, eff_limit, descending=True)
        employees = query.all()
        total_count = None
        next_cursor = employees[-1].id if len(employees) == eff_limit else None
        has_more = len(employees) == eff_limit
        pages = None
        effective_page = page
    else:
        total_count = query.count()
        eff_limit = limit
        offset = (page - 1) * eff_limit
        employees = query.order_by(Employee.id.desc()).offset(offset).limit(eff_limit).all()
        next_cursor = employees[-1].id if len(employees) == eff_limit else None
        has_more = (page * eff_limit) < total_count
        pages = (total_count + eff_limit - 1) // eff_limit if eff_limit else 1
        effective_page = page

    def _summary_record(emp):
        company = None
        if getattr(emp, "company", None):
            company = {"id": emp.company.id, "name": emp.company.name}
        elif emp.company_id:
            company = {"id": emp.company_id}
        return {
            "id": emp.id,
            "userId": emp.user_id,
            **employee_name_api_fields(emp),
            "email": emp.email,
            "employeeCode": emp.employee_code,
            "designation": emp.designation,
            "designationId": emp.designation_id,
            "designationName": emp.designation_obj.title if getattr(emp, "designation_obj", None) else None,
            "departmentId": emp.department_id,
            "department": {"id": emp.department.id, "name": emp.department.name} if emp.department else None,
            "organizationId": emp.organization_id,
            "companyId": emp.company_id,
            "company": company,
            "branchIds": [branch.id for branch in emp.branches] if emp.branches else [],
            "branches": [{"id": branch.id, "name": branch.name, "code": branch.code} for branch in emp.branches] if emp.branches else [],
            "branch": {"id": emp.branches[0].id, "name": emp.branches[0].name} if emp.branches and len(emp.branches) > 0 else None,
            "status": emp.status,
            "onboardingStep": emp.onboarding_step or "pending",
            "deletedAt": emp.deleted_at.isoformat() if emp.deleted_at else None,
            "employmentType": emp.employment_type,
            "joinDate": emp.join_date.isoformat() if emp.join_date else None,
            "reportingManagerId": emp.reporting_manager_id,
            "phone": emp.phone,
            "photoUrl": emp.photo_url,
        }

    if view == "summary":
        employee_list = [_summary_record(emp) for emp in employees]
    else:
        employee_list = [
        {
            "id": emp.id,
            "userId": emp.user_id,
            **employee_name_api_fields(emp),
            "email": emp.email,
            "employeeCode": emp.employee_code,
            "designation": emp.designation,
            "designationId": emp.designation_id,
            "departmentId": emp.department_id,
            "department": {"id": emp.department.id, "name": emp.department.name} if emp.department else None,
            "organizationId": emp.organization_id,
            "companyId": emp.company_id,
            "company": _resolve_employee_company(emp, db),
            "branchIds": [branch.id for branch in emp.branches] if emp.branches else [],
            "branches": [{"id": branch.id, "name": branch.name, "code": branch.code} for branch in emp.branches] if emp.branches else [],
            "branch": {"id": emp.branches[0].id, "name": emp.branches[0].name} if emp.branches and len(emp.branches) > 0 else None,
            "status": emp.status,
            "onboardingStep": emp.onboarding_step or "pending",
            "deletedAt": emp.deleted_at.isoformat() if emp.deleted_at else None,
            "employmentType": emp.employment_type,
            "geofenceEnabled": emp.geofence_enabled,
            "joinDate": emp.join_date.isoformat() if emp.join_date else None,
            "phone": emp.phone,
            "address": emp.address,
            "currentAddress": emp.current_address,
            "permanentAddress": emp.permanent_address,
            "landmark": emp.landmark,
            "permanentLandmark": emp.permanent_landmark,
            "currentState": emp.current_state,
            "currentPincode": emp.current_pincode,
            "permanentState": emp.permanent_state,
            "permanentPincode": emp.permanent_pincode,
            "dateOfBirth": emp.date_of_birth.isoformat() if emp.date_of_birth else None,
            "gender": emp.gender,
            "bloodGroup": emp.blood_group,
            "maritalStatus": emp.marital_status,
            "emergencyContact": emp.emergency_contact,
            "emergencyPhone": emp.emergency_phone,
            "voterId": emp.voter_id,
            "aadharNumber": emp.aadhar_number,
            "panNumber": emp.pan_number,
            "drivingLicense": emp.driving_license,
            "passportNumber": emp.passport_number,
            "birthCertificateNumber": emp.birth_certificate_number,
            # Academic fields
            "educationLevel": emp.education_level,
            "institution": emp.institution,
            "degree": emp.degree,
            "fieldOfStudy": emp.field_of_study,
            "graduationYear": emp.graduation_year,
            "grade": emp.grade,
            "certification": emp.certification,
            "certificationOrg": emp.certification_org,
            "certificationDate": emp.certification_date.isoformat() if emp.certification_date else None,
            "certificationExpiry": emp.certification_expiry.isoformat() if emp.certification_expiry else None,
            "skills": emp.skills,
            "language1": emp.language1,
            "language2": emp.language2,
            "language3": emp.language3,
            # Bank info
            "bankName": emp.bank_name,
            "bankAccountNumber": emp.bank_account_number,
            "ifscCode": emp.ifsc_code,
            "accountHolderName": emp.account_holder_name,
            "bankAccounts": emp.bank_accounts or [],
            "experienceDetails": emp.experience_details or [],
            "achievementsDetails": emp.achievements_details or [],
            "activitiesDetails": emp.activities_details or [],
            "educationDetails": emp.education_details or [],
            "certifications": emp.certifications or [],
            "languages": emp.languages or [],
            "skillsList": emp.skills_list or [],
            "idDocuments": emp.id_documents or {},
            # Salary
            "baseSalary": emp.base_salary or 0,
            "salaryComponents": emp.salary_components or {},
            "salaryCompanyId": emp.salary_company_id,
            "salaryTemplateId": emp.salary_template_id,
            "payrollPolicyId": emp.payroll_policy_id,
            "attendancePolicyId": emp.attendance_policy_id,
            "taxRegimeId": emp.tax_regime_id,
            "payrollTemplateId": emp.payroll_template_id,
            "resumeUrl": emp.resume_url,
            "idProofUrl": emp.id_proof_url,
            "photoUrl": emp.photo_url,
            # Benefits
            "pfNumber": emp.pf_number,
            "pfUan": emp.pf_uan,
            "mediclaimNumber": emp.mediclaim_number,
            "mediclaimProvider": emp.mediclaim_provider,
            "lifeInsuranceNumber": emp.life_insurance_number,
            "lifeInsuranceProvider": emp.life_insurance_provider,
            # Family
            "fatherName": emp.father_name,
            "motherName": emp.mother_name,
            "siblingName": emp.sibling_name,
            "spouseName": emp.spouse_name,
            "spousePhone": emp.spouse_phone,
            "numberOfChildren": emp.number_of_children,
            "nomineeName": emp.nominee_name,
            "nomineeRelationship": emp.nominee_relationship,
            "familyInfo": getattr(emp, "family_info", []) or [],
            "educationDetails": getattr(emp, "education_details", []) or [],
            # Login
            "userRole": emp.user_role,
            "loginEmail": emp.login_email,
            "reportingManagerId": emp.reporting_manager_id,
            # Device
            "deviceName": emp.device_name,
            "deviceType": emp.device_type,
            "deviceIpAddress": emp.device_ip_address,
            "deviceMacAddress": emp.device_mac_address,
            "deviceSerialNumber": emp.device_serial_number,
            "deviceAssignedDate": emp.device_assigned_date.isoformat() if emp.device_assigned_date else None,
            # Designation
            "designationName": emp.designation_obj.title if emp.designation_obj else None,
        }
        for emp in employees
        ]

    # Privacy guard applies to full records only.
    if view == "full":
        role = (current_user.role or "").lower()
        if role not in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive", "finance", "accountant"):
            my_emp_id = None
            my_emp = db.query(Employee).filter(
                Employee.user_id == current_user.id, Employee.deleted_at.is_(None)
            ).first()
            if my_emp:
                my_emp_id = my_emp.id
            _SENSITIVE_KEYS = (
                "panNumber", "aadharNumber", "voterId", "drivingLicense", "passportNumber",
                "birthCertificateNumber", "bankName", "bankAccountNumber", "ifscCode",
                "bankAccounts", "dateOfBirth", "emergencyPhone", "emergencyContact",
                "baseSalary", "salaryComponents", "idDocuments", "idProofUrl",
                "deviceIpAddress", "deviceMacAddress", "deviceSerialNumber",
                "pfNumber", "pfUan", "spousePhone", "nomineeName",
                "permanentAddress", "permanentLandmark", "currentAddress",
            )
            for rec in employee_list:
                if rec.get("id") == my_emp_id:
                    continue
                for k in _SENSITIVE_KEYS:
                    if k in rec:
                        rec[k] = None if not isinstance(rec[k], list) else []
    
    # Return paginated response with metadata
    pagination = {
        "page": effective_page,
        "limit": limit,
        "hasMore": has_more,
        "nextCursor": next_cursor,
    }
    if total_count is not None:
        pagination["total"] = total_count
        pagination["pages"] = pages
    return {
        "data": employee_list,
        "pagination": pagination,
    }


@router.get("/org-structure", response_model=dict)
def get_org_structure(
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    """Return org structure as manager -> reportees tree."""
    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.organization_id is not None:
        query = query.filter(Employee.organization_id == current_user.organization_id)

    employees = query.options(
        joinedload(Employee.department),
        joinedload(Employee.designation_obj),
        joinedload(Employee.company),
    ).all()

    emp_map = {}
    for emp in employees:
        emp_map[emp.id] = {
            "id": emp.id,
            "name": emp.full_name or f"{emp.first_name} {emp.last_name}".strip(),
            "email": emp.email,
            "designation": emp.designation,
            "department": emp.department.name if emp.department else None,
            "company": emp.company.name if emp.company else None,
            "reportingManagerId": emp.reporting_manager_id,
            "directReports": [],
        }

    roots = []
    for emp in employees:
        node = emp_map[emp.id]
        if emp.reporting_manager_id and emp.reporting_manager_id in emp_map:
            emp_map[emp.reporting_manager_id]["directReports"].append(node)
        else:
            roots.append(node)

    return {
        "data": roots,
        "totalEmployees": len(employees),
    }


@router.get("/list", response_model=dict)
@cached(ttl=60, namespace="employees-picker")
def get_employee_light_list(
    limit: int = Query(PICKER_PAGE_SIZE, ge=1, le=MAX_PICKER_LIMIT),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    status: Optional[str] = None,
    companyId: Optional[int] = None,
    branchId: Optional[int] = None,
    departmentId: Optional[int] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight employee list for dropdowns — slim payload, read-replica safe."""
    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.organization_id is not None:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    query = apply_picker_scope_filters(
        query,
        db,
        company_id=companyId,
        branch_id=branchId,
        department_id=departmentId,
    )
    if status:
        query = query.filter(Employee.status == status)
    else:
        query = query.filter(Employee.status.notin_(['new', 'shortlisted']))
    if search:
        sp = f"%{search.strip()}%"
        query = query.filter(
            (Employee.full_name.ilike(sp)) |
            (Employee.first_name.ilike(sp)) |
            (Employee.last_name.ilike(sp)) |
            (Employee.email.ilike(sp)) |
            (Employee.employee_code.ilike(sp))
        )
    total = query.count()
    employees = (
        query.order_by(
            asc(func.lower(func.coalesce(Employee.full_name, Employee.first_name))),
            asc(func.lower(func.coalesce(Employee.last_name, ''))),
            asc(func.lower(func.coalesce(Employee.employee_code, ''))),
            asc(Employee.id),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    emp_ids = [e.id for e in employees]
    primary_branch: dict[int, int] = {}
    if emp_ids:
        from models import EmployeeBranchAssignment
        br_rows = (
            db.query(EmployeeBranchAssignment.employee_id, EmployeeBranchAssignment.branch_id)
            .filter(
                EmployeeBranchAssignment.employee_id.in_(emp_ids),
                EmployeeBranchAssignment.status == "active",
                EmployeeBranchAssignment.deleted_at.is_(None),
            )
            .order_by(EmployeeBranchAssignment.is_primary.desc())
            .all()
        )
        for eid, bid in br_rows:
            if eid not in primary_branch:
                primary_branch[eid] = bid

    return {
        "data": [
            {
                "id": e.id,
                **employee_name_api_fields(e),
                "email": e.email,
                "employeeCode": e.employee_code,
                "departmentId": e.department_id,
                "designationId": e.designation_id,
                "branchId": primary_branch.get(e.id),
                "status": e.status,
                "phone": e.phone,
                "companyId": e.company_id,
            }
            for e in employees
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{employee_id}/scope", response_model=dict)
def get_employee_scope(
    employee_id: int,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    """Org scope for an employee — used to auto-fill forms (company/branch/department)."""
    from core.employee_scope import resolve_employee_org_scope

    if current_user.role != "superadmin" and current_user.organization_id:
        get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    return resolve_employee_org_scope(db, employee_id)


@router.get("/template")
def download_employee_template(current_user: User = Depends(get_current_user)):
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "full_name*",
            "phone*",
            "current_address*",
            "employee_code",
            "email",
            "designation",
            "department_name",
            "branch_name",
            "company_name",
            "organization_name",
            "join_date",
            "employment_type",
            "status",
            "date_of_birth",
            "gender",
            "permanent_address",
            "emergency_contact",
            "emergency_phone",
            "aadhar_number",
            "pan_number",
            "bank_name",
            "bank_account_number",
            "ifsc_code",
        ]
    )
    writer.writerow(
        [
            "John Doe",
            "9876543210",
            "123 Main St, City",
            "EMP001",
            "john.doe@company.com",
            "Software Engineer",
            "Engineering",
            "Head Office",
            "Acme Corp",
            "Acme Holdings",
            "2024-01-15",
            "full_time",
            "active",
            "1990-05-15",
            "male",
            "456 Home St, Hometown",
            "Jane Doe",
            "9876543211",
            "123456789012",
            "ABCDE1234F",
            "HDFC Bank",
            "1234567890",
            "HDFC0001234",
        ]
    )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employee_bulk_upload_template.csv"},
    )


@router.get("/{employee_id}", response_model=dict)
def get_employee(employee_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    employee_query = db.query(Employee).filter(Employee.id == employee_id)
    if current_user.organization_id is not None:
        employee_query = employee_query.filter(Employee.organization_id == current_user.organization_id)
    employee = employee_query.first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    return {
        "id": employee.id,
        "userId": employee.user_id,
        **employee_name_api_fields(employee),
        "email": employee.email,
        "employeeCode": employee.employee_code,
        "designation": employee.designation,
        "designationId": employee.designation_id,
        "departmentId": employee.department_id,
        "organizationId": employee.organization_id,
        "companyId": employee.company_id,
        "branchIds": [branch.id for branch in employee.branches] if employee.branches else [],
        "branches": [{"id": branch.id, "name": branch.name, "code": branch.code} for branch in employee.branches] if employee.branches else [],
        "status": employee.status,
        "employmentType": employee.employment_type,
        "geofenceEnabled": employee.geofence_enabled,
        "joinDate": employee.join_date.isoformat() if employee.join_date else None,
        "phone": employee.phone,
        "address": employee.address,
        "currentAddress": employee.current_address,
        "permanentAddress": employee.permanent_address,
        "landmark": employee.landmark,
        "permanentLandmark": employee.permanent_landmark,
        "currentState": employee.current_state,
        "currentPincode": employee.current_pincode,
        "permanentState": employee.permanent_state,
        "permanentPincode": employee.permanent_pincode,
        "dateOfBirth": employee.date_of_birth.isoformat() if employee.date_of_birth else None,
        "gender": employee.gender,
        "bloodGroup": employee.blood_group,
        "maritalStatus": employee.marital_status,
        "emergencyContact": employee.emergency_contact,
        "emergencyPhone": employee.emergency_phone,
        "bankName": employee.bank_name,
        "bankAccountNumber": employee.bank_account_number,
        "ifscCode": employee.ifsc_code,
        "accountHolderName": employee.account_holder_name,
        "bankAccounts": employee.bank_accounts or [],
        "experienceDetails": employee.experience_details or [],
        "achievementsDetails": employee.achievements_details or [],
        "activitiesDetails": employee.activities_details or [],
        "educationDetails": employee.education_details or [],
        "certifications": employee.certifications or [],
        "languages": employee.languages or [],
        "skillsList": employee.skills_list or [],
        "idDocuments": employee.id_documents or {},
        "baseSalary": employee.base_salary or 0,
        "salaryComponents": employee.salary_components or {},
        "salaryCompanyId": employee.salary_company_id,
        "salaryTemplateId": employee.salary_template_id,
        "payrollPolicyId": employee.payroll_policy_id,
        "attendancePolicyId": employee.attendance_policy_id,
        "taxRegimeId": employee.tax_regime_id,
        "payrollTemplateId": employee.payroll_template_id,
        "panNumber": employee.pan_number,
        "voterId": employee.voter_id,
        "aadharNumber": employee.aadhar_number,
        "drivingLicense": employee.driving_license,
        "passportNumber": employee.passport_number,
        "birthCertificateNumber": employee.birth_certificate_number,
        # Academic fields
        "educationLevel": employee.education_level,
        "institution": employee.institution,
        "degree": employee.degree,
        "fieldOfStudy": employee.field_of_study,
        "graduationYear": employee.graduation_year,
        "grade": employee.grade,
        "certification": employee.certification,
        "certificationOrg": employee.certification_org,
        "certificationDate": employee.certification_date.isoformat() if employee.certification_date else None,
        "certificationExpiry": employee.certification_expiry.isoformat() if employee.certification_expiry else None,
        "skills": employee.skills,
        "language1": employee.language1,
        "language2": employee.language2,
        "language3": employee.language3,
        # Documents
        "resumeUrl": employee.resume_url,
        "idProofUrl": employee.id_proof_url,
        "photoUrl": employee.photo_url,
        # Benefits
        "pfNumber": employee.pf_number,
        "pfUan": employee.pf_uan,
        "mediclaimNumber": employee.mediclaim_number,
        "mediclaimProvider": employee.mediclaim_provider,
        "lifeInsuranceNumber": employee.life_insurance_number,
        "lifeInsuranceProvider": employee.life_insurance_provider,
        # Family
        "fatherName": employee.father_name,
        "motherName": employee.mother_name,
        "siblingName": employee.sibling_name,
        "spouseName": employee.spouse_name,
        "spousePhone": employee.spouse_phone,
        "numberOfChildren": employee.number_of_children,
        "nomineeName": employee.nominee_name,
        "nomineeRelationship": employee.nominee_relationship,
        "familyInfo": getattr(employee, "family_info", []) or [],
        "educationDetails": getattr(employee, "education_details", []) or [],
        "userRole": employee.user_role,
        "userId": employee.user_id,
        "loginEmail": employee.login_email,
        # Device
        "deviceName": employee.device_name,
        "deviceType": employee.device_type,
        "deviceIpAddress": employee.device_ip_address,
        "deviceMacAddress": employee.device_mac_address,
        "deviceSerialNumber": employee.device_serial_number,
        "deviceAssignedDate": employee.device_assigned_date.isoformat() if employee.device_assigned_date else None,
    }


@router.post("", response_model=dict)
def create_employee(employee_data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Permission enforcement: only users with write access to employees can add.
    _require_module_action(db, current_user, "employees", "write")
    # Plan limit enforcement: block adding employees beyond the plan's limit.
    _enforce_employee_limit(db, current_user.organization_id, extra=1)

    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(employee_data)
    snake_case_data = normalize_name_payload(snake_case_data)
    
    email = snake_case_data.get("email")
    # Use provided password or default
    password = snake_case_data.get("password") or snake_case_data.get("temp_password", "TempPass123!")
    
    email = snake_case_data.get("email")
    if not email:
        import uuid
        email = f"dev_dummy_{uuid.uuid4().hex[:8]}@hrms.com"
        
    # Email is used for login, so it must be unique across users, employees and candidates.
    email_l = email.strip().lower()
    if db.query(User).filter(func.lower(User.email) == email_l).first() or \
       db.query(Employee).filter(Employee.deleted_at.is_(None), func.lower(Employee.email) == email_l).first() or \
       db.query(Candidate).filter(func.lower(Candidate.email) == email_l).first():
        raise HTTPException(
            status_code=400,
            detail="Email already exists",
        )

    # Duplicate phone enforcement — the employee phone must be unique.
    phone = snake_case_data.get("phone")
    if phone:
        dup_emp = db.query(Employee).filter(
            Employee.deleted_at.is_(None),
            Employee.phone == str(phone).strip(),
        ).first()
        if dup_emp:
            raise HTTPException(
                status_code=400,
                detail=f"Phone number already used by {employee_display_name(dup_emp)}",
            )
    
    # Optional device security fields (can be updated later)
    device_type = snake_case_data.get("device_type", "Web")
    device_ip = snake_case_data.get("device_ip_address", "0.0.0.0")
    device_mac = snake_case_data.get("device_mac_address", "00:00:00:00:00:00")
    device_serial = snake_case_data.get("device_serial_number", "Unknown")

    phone = snake_case_data.get("phone")
    user_phone = phone
    if user_phone:
        existing_user_phone = db.query(User).filter(User.phone == str(user_phone).strip()).first()
        if existing_user_phone:
            user_phone = None

    new_user = User(
        email=email,
        password_hash=get_password_hash(password),
        full_name=snake_case_data.get("full_name") or snake_case_data.get("first_name", ""),
        role=snake_case_data.get("user_role", "employee"),
        phone=user_phone,
    )
    db.add(new_user)
    db.flush()

    employee_code = snake_case_data.get("employee_code") or f"EMP-{new_user.id:06d}"

    date_of_birth = None
    if snake_case_data.get("date_of_birth"):
        try:
            date_of_birth = datetime.fromisoformat(snake_case_data["date_of_birth"])
        except Exception:
            date_of_birth = None

    org_id = snake_case_data.get("organization_id")
    if isinstance(org_id, str):
        org = db.query(Organization).filter(Organization.code == org_id).first()
        org_id = org.id if org else current_user.organization_id
    elif org_id is None:
        org_id = current_user.organization_id

    dept_id = snake_case_data.get("department_id")
    if isinstance(dept_id, str) and dept_id.strip():
        dept = db.query(Department).filter(Department.name == dept_id).first()
        if dept:
            dept_id = dept.id
        elif org_id:
            new_dept = Department(name=dept_id, code=dept_id[:3].upper(), organization_id=org_id)
            db.add(new_dept)
            db.flush()
            dept_id = new_dept.id
        else:
            dept_id = None
    elif not dept_id and snake_case_data.get("department"):
        dept_name = snake_case_data.get("department")
        dept = db.query(Department).filter(Department.name == dept_name).first()
        if dept:
            dept_id = dept.id
        elif org_id:
            new_dept = Department(name=dept_name, code=dept_name[:3].upper(), organization_id=org_id)
            db.add(new_dept)
            db.flush()
            dept_id = new_dept.id

    address_field = snake_case_data.get("current_address") or snake_case_data.get("permanent_address") or snake_case_data.get("address")

    employee = Employee(
        user_id=new_user.id,
        full_name=snake_case_data.get("full_name"),
        first_name=snake_case_data.get("first_name"),
        last_name=snake_case_data.get("last_name"),
        email=email,
        employee_code=employee_code,
        designation=snake_case_data.get("designation"),
        department_id=dept_id,
        organization_id=org_id if isinstance(org_id, int) else None,
        reporting_manager_id=snake_case_data.get("reporting_manager_id"),
        status=snake_case_data.get("status", "active"),
        phone=snake_case_data.get("phone"),
        address=address_field,
        current_address=snake_case_data.get("current_address"),
        permanent_address=snake_case_data.get("permanent_address"),
        landmark=snake_case_data.get("landmark"),
        permanent_landmark=snake_case_data.get("permanent_landmark"),
        current_state=snake_case_data.get("current_state"),
        current_pincode=snake_case_data.get("current_pincode"),
        permanent_state=snake_case_data.get("permanent_state"),
        permanent_pincode=snake_case_data.get("permanent_pincode"),
        date_of_birth=date_of_birth,
        gender=snake_case_data.get("gender"),
        blood_group=snake_case_data.get("blood_group"),
        marital_status=snake_case_data.get("marital_status"),
        emergency_contact=snake_case_data.get("emergency_contact"),
        emergency_phone=snake_case_data.get("emergency_phone"),
        voter_id=snake_case_data.get("voter_id"),
        aadhar_number=snake_case_data.get("aadhar_number"),
        pan_number=snake_case_data.get("pan_number"),
        driving_license=snake_case_data.get("driving_license"),
        passport_number=snake_case_data.get("passport_number"),
        birth_certificate_number=snake_case_data.get("birth_certificate_number"),
        # Academic fields
        education_level=snake_case_data.get("education_level"),
        institution=snake_case_data.get("institution"),
        degree=snake_case_data.get("degree"),
        field_of_study=snake_case_data.get("field_of_study"),
        graduation_year=snake_case_data.get("graduation_year"),
        grade=snake_case_data.get("grade"),
        certification=snake_case_data.get("certification"),
        certification_org=snake_case_data.get("certification_org"),
        certification_date=datetime.fromisoformat(snake_case_data.get("certification_date")) if snake_case_data.get("certification_date") else None,
        certification_expiry=datetime.fromisoformat(snake_case_data.get("certification_expiry")) if snake_case_data.get("certification_expiry") else None,
        skills=snake_case_data.get("skills"),
        language1=snake_case_data.get("language1"),
        language2=snake_case_data.get("language2"),
        language3=snake_case_data.get("language3"),
        bank_name=snake_case_data.get("bank_name"),
        bank_account_number=snake_case_data.get("bank_account_number"),
        ifsc_code=snake_case_data.get("ifsc_code"),
        account_holder_name=snake_case_data.get("account_holder_name"),
        bank_accounts=snake_case_data.get("bank_accounts", []),
        # Salary
        base_salary=snake_case_data.get("base_salary") or 0,
        salary_components=snake_case_data.get("salary_components", {}),
        salary_company_id=snake_case_data.get("salary_company_id") if snake_case_data.get("salary_company_id") not in (None, "", 0) else None,
        salary_template_id=snake_case_data.get("salary_template_id") if snake_case_data.get("salary_template_id") not in (None, "", 0) else None,
        payroll_policy_id=snake_case_data.get("payroll_policy_id") if snake_case_data.get("payroll_policy_id") not in (None, "", 0) else None,
        attendance_policy_id=snake_case_data.get("attendance_policy_id") if snake_case_data.get("attendance_policy_id") not in (None, "", 0) else None,
        tax_regime_id=snake_case_data.get("tax_regime_id") if snake_case_data.get("tax_regime_id") not in (None, "", 0) else None,
        payroll_template_id=snake_case_data.get("payroll_template_id") if snake_case_data.get("payroll_template_id") not in (None, "", 0) else None,
        resume_url=snake_case_data.get("resume_url"),
        id_proof_url=snake_case_data.get("id_proof_url"),
        photo_url=snake_case_data.get("photo_url"),
        # Benefits
        pf_number=snake_case_data.get("pf_number"),
        pf_uan=snake_case_data.get("pf_uan"),
        mediclaim_number=snake_case_data.get("mediclaim_number"),
        mediclaim_provider=snake_case_data.get("mediclaim_provider"),
        life_insurance_number=snake_case_data.get("life_insurance_number"),
        life_insurance_provider=snake_case_data.get("life_insurance_provider"),
        # Family
        father_name=snake_case_data.get("father_name"),
        mother_name=snake_case_data.get("mother_name"),
        sibling_name=snake_case_data.get("sibling_name"),
        spouse_name=snake_case_data.get("spouse_name"),
        spouse_phone=snake_case_data.get("spouse_phone"),
        number_of_children=snake_case_data.get("number_of_children"),
        nominee_name=snake_case_data.get("nominee_name"),
        nominee_relationship=snake_case_data.get("nominee_relationship"),
        family_info=snake_case_data.get("family_info", []),
        education_details=snake_case_data.get("education_details", []),
        certifications=snake_case_data.get("certifications", []),
        languages=snake_case_data.get("languages", []),
        # Login
        user_role=snake_case_data.get("user_role", "employee"),
        login_email=snake_case_data.get("login_email"),
        # Geofence
        geofence_enabled=bool(snake_case_data.get("geofence_enabled", False)),
        # Device
        device_name=snake_case_data.get("device_name"),
        device_type=snake_case_data.get("device_type"),
        device_ip_address=snake_case_data.get("device_ip_address"),
        device_mac_address=snake_case_data.get("device_mac_address"),
        device_serial_number=snake_case_data.get("device_serial_number"),
        device_assigned_date=datetime.fromisoformat(snake_case_data.get("device_assigned_date")) if snake_case_data.get("device_assigned_date") else None,
    )
    db.add(employee)

    # When a payroll template is selected, snapshot its policy/attendance/tax ids
    # so legacy resolution and the UI reflect the template even if the linked
    # objects change later.
    ptid = snake_case_data.get("payroll_template_id")
    if ptid:
        tpl = db.query(PayrollTemplate).filter(
            PayrollTemplate.id == ptid,
            PayrollTemplate.deleted_at.is_(None),
        ).first()
        if tpl:
            if not employee.payroll_policy_id and tpl.payroll_policy_id:
                employee.payroll_policy_id = tpl.payroll_policy_id
            if not employee.attendance_policy_id and tpl.attendance_policy_id:
                employee.attendance_policy_id = tpl.attendance_policy_id
            if not employee.tax_regime_id and tpl.tax_regime_id:
                employee.tax_regime_id = tpl.tax_regime_id

    # Handle company assignment (many-to-many)
    if snake_case_data.get("company_ids"):
        companies = db.query(Company).filter(Company.id.in_(snake_case_data["company_ids"])).all()
        employee.companies = companies
        if companies:
            employee.company_id = companies[0].id
    elif snake_case_data.get("company_id"):
        company = db.query(Company).filter(Company.id == snake_case_data["company_id"]).first()
        if company:
            employee.companies = [company]
            employee.company_id = company.id

    # Handle branch assignment (many-to-many)
    if snake_case_data.get("branch_ids"):
        branches = db.query(Branch).filter(Branch.id.in_(snake_case_data["branch_ids"])).all()
        employee.branches = branches

    db.commit()
    db.refresh(employee)
    
    # Massive Automation: Generate standard Onboarding Tasks based on Indian requirements
    try:
        tasks = [
            OnboardingTask(employee_id=employee.id, title="Collect Aadhaar & PAN copies", department="HR", status="pending"),
            OnboardingTask(employee_id=employee.id, title="Open/Update Salary Bank Account", department="Finance", status="pending"),
            OnboardingTask(employee_id=employee.id, title="Generate UAN for EPF", department="Finance", status="pending"),
            OnboardingTask(employee_id=employee.id, title="Register for ESIC (if applicable)", department="Finance", status="pending"),
            OnboardingTask(employee_id=employee.id, title="Provision IT Assets (Laptop/Phone)", department="IT", status="pending"),
            OnboardingTask(employee_id=employee.id, title="Create Email & System Access", department="IT", status="pending")
        ]
        db.add_all(tasks)
        db.commit()
    except Exception as e:
        print(f"Error generating onboarding tasks: {e}")
        db.rollback()

    _bust_employee_cache(current_user)

    # Run onboarding automation (login account, leave balances, notifications,
    # IT checklist, lifecycle event). Welcome email is opt-in only.
    try:
        from services.onboarding_automation import run_onboarding_automation
        run_onboarding_automation(db, employee, actor_user_id=current_user.id)
    except Exception as e:
        print(f"Error running onboarding automation: {e}")
        db.rollback()

    return {"message": "Employee created successfully", "id": employee.id, "employeeCode": employee.employee_code}


@router.put("/{employee_id}", response_model=dict)
def update_employee(employee_id: int, employee_data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Permission enforcement: only users with write access to employees can edit.
    _require_module_action(db, current_user, "employees", "write")
    employee_query = db.query(Employee).filter(Employee.id == employee_id)
    if current_user.organization_id is not None:
        employee_query = employee_query.filter(Employee.organization_id == current_user.organization_id)
    employee = employee_query.first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Self-service enforcement: non-admin employees may only update their own record,
    # and only when the selfService feature is enabled.
    from services.settings_service import is_feature_enabled
    is_self = employee.user_id == current_user.id
    if not is_self and current_user.role not in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive"):
        raise HTTPException(status_code=403, detail="You can only update your own profile")
    if is_self and current_user.role not in ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive"):
        if not is_feature_enabled(db, current_user.organization_id, "selfService"):
            raise HTTPException(status_code=403, detail="Self-service profile updates are disabled by your organisation")
    
    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(employee_data)

    # Document uploads toggle: block document field changes when disabled.
    if not is_feature_enabled(db, current_user.organization_id, "docUploads"):
        doc_keys = {"resume_url", "id_proof_url", "photo_url"}
        if doc_keys.intersection(snake_case_data.keys()):
            raise HTTPException(status_code=403, detail="Document uploads are disabled by your organisation")

    if any(k in snake_case_data for k in ("full_name", "first_name", "last_name")):
        apply_name_fields(employee, {
            "full_name": snake_case_data.get("full_name", employee.full_name),
            "first_name": snake_case_data.get("first_name", employee.first_name),
            "last_name": snake_case_data.get("last_name", employee.last_name),
        })
        if employee.user_id:
            linked_user = db.query(User).filter(User.id == employee.user_id).first()
            if linked_user:
                linked_user.full_name = employee.full_name or employee_display_name(employee)
    if "employee_code" in snake_case_data:
        employee.employee_code = snake_case_data["employee_code"]
    if "email" in snake_case_data:
        employee.email = snake_case_data["email"]
    if "designation" in snake_case_data:
        employee.designation = snake_case_data["designation"]
    # Integer foreign-key fields must never receive an empty string — blank means "not set"
    def _int_or_none(v):
        if v in (None, ""):
            return None
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None
    if "designation_id" in snake_case_data:
        employee.designation_id = _int_or_none(snake_case_data["designation_id"])
    if "department_id" in snake_case_data:
        employee.department_id = _int_or_none(snake_case_data["department_id"])
    if "organization_id" in snake_case_data:
        employee.organization_id = _int_or_none(snake_case_data["organization_id"])
    if "reporting_manager_id" in snake_case_data:
        employee.reporting_manager_id = _int_or_none(snake_case_data["reporting_manager_id"])
    # Handle company assignment (many-to-many)
    if "company_ids" in snake_case_data:
        companies = db.query(Company).filter(Company.id.in_(snake_case_data["company_ids"])).all()
        employee.companies = companies
        if companies:
            employee.company_id = companies[0].id
    elif "company_id" in snake_case_data:
        # Convert single company_id to company_ids array for many-to-many
        company = db.query(Company).filter(Company.id == snake_case_data["company_id"]).first()
        if company:
            employee.companies = [company]
            employee.company_id = company.id
    if "branch_ids" in snake_case_data:
        branches = db.query(Branch).filter(Branch.id.in_(snake_case_data["branch_ids"])).all()
        employee.branches = branches
        # Also sync the active branch-assignments table that the payroll/attendance
        # branch filters read (the relationship table alone is not enough).
        branch_ids = [b for b in (snake_case_data.get("branch_ids") or []) if b not in (None, "")]
        if employee.organization_id and current_user.role != "superadmin":
            org_branch_ids = {b.id for b in db.query(Branch).filter(
                Branch.organization_id == employee.organization_id,
                Branch.deleted_at.is_(None),
            ).all()}
            branch_ids = [b for b in branch_ids if b in org_branch_ids]
        active_branch_ids = [row.branch_id for row in db.query(
            EmployeeBranchAssignment.branch_id
        ).filter(
            EmployeeBranchAssignment.employee_id == employee.id,
            EmployeeBranchAssignment.status == "active",
            EmployeeBranchAssignment.deleted_at.is_(None),
        ).all()]
        if active_branch_ids:
            db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == employee.id,
                EmployeeBranchAssignment.status == "inactive",
                EmployeeBranchAssignment.branch_id.in_(active_branch_ids),
            ).delete(synchronize_session=False)
        db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == employee.id,
            EmployeeBranchAssignment.status == "active",
            EmployeeBranchAssignment.deleted_at.is_(None),
        ).update({"deleted_at": ist_now_naive(), "status": "inactive"})
        for idx, bid in enumerate(branch_ids):
            db.add(EmployeeBranchAssignment(
                employee_id=employee.id,
                branch_id=bid,
                is_primary=(idx == 0),
                start_date=ist_now_naive(),
                status="active",
            ))
        if branches:
            employee.branch_id = branches[0].id
    if "status" in snake_case_data:
        employee.status = snake_case_data["status"]
    if "employment_type" in snake_case_data:
        employee.employment_type = snake_case_data["employment_type"]
    if "geofence_enabled" in snake_case_data:
        employee.geofence_enabled = bool(snake_case_data["geofence_enabled"])
    if "join_date" in snake_case_data:
        try:
            employee.join_date = datetime.fromisoformat(snake_case_data["join_date"]) if snake_case_data["join_date"] else None
        except Exception as exc:
            pass
    if "termination_date" in snake_case_data:
        try:
            employee.termination_date = datetime.fromisoformat(snake_case_data["termination_date"]) if snake_case_data["termination_date"] else None
        except Exception as exc:
            pass
    if "date_of_leaving" in snake_case_data:
        try:
            employee.date_of_leaving = datetime.fromisoformat(snake_case_data["date_of_leaving"]) if snake_case_data["date_of_leaving"] else None
        except Exception as exc:
            pass
    if "termination_type" in snake_case_data:
        employee.termination_type = snake_case_data["termination_type"]
    if "notice_period_served" in snake_case_data:
        employee.notice_period_served = snake_case_data["notice_period_served"]
    if "handover_completed" in snake_case_data:
        employee.handover_completed = snake_case_data["handover_completed"]
    if "full_final_settlement" in snake_case_data:
        employee.full_final_settlement = snake_case_data["full_final_settlement"]
    # Address fields
    if "address" in snake_case_data:
        employee.address = snake_case_data["address"]
    if "current_address" in snake_case_data:
        employee.current_address = snake_case_data["current_address"]
    if "permanent_address" in snake_case_data:
        employee.permanent_address = snake_case_data["permanent_address"]
    if "landmark" in snake_case_data:
        employee.landmark = snake_case_data["landmark"]
    if "permanent_landmark" in snake_case_data:
        employee.permanent_landmark = snake_case_data["permanent_landmark"]
    if "current_state" in snake_case_data:
        employee.current_state = snake_case_data["current_state"]
    if "current_pincode" in snake_case_data:
        employee.current_pincode = snake_case_data["current_pincode"]
    if "permanent_state" in snake_case_data:
        employee.permanent_state = snake_case_data["permanent_state"]
    if "permanent_pincode" in snake_case_data:
        employee.permanent_pincode = snake_case_data["permanent_pincode"]
    # Personal details
    if "date_of_birth" in snake_case_data:
        try:
            employee.date_of_birth = datetime.fromisoformat(snake_case_data["date_of_birth"]) if snake_case_data["date_of_birth"] else None
        except Exception as exc:
            pass
    if "gender" in snake_case_data:
        employee.gender = snake_case_data["gender"]
    if "blood_group" in snake_case_data:
        employee.blood_group = snake_case_data["blood_group"]
    if "marital_status" in snake_case_data:
        employee.marital_status = snake_case_data["marital_status"]
    if "phone" in snake_case_data:
        new_phone = str(snake_case_data["phone"] or "").strip()
        if new_phone:
            dup_emp = db.query(Employee).filter(
                Employee.deleted_at.is_(None),
                Employee.phone == new_phone,
                Employee.id != employee.id,
            ).first()
            if dup_emp:
                raise HTTPException(
                    status_code=400,
                    detail=f"Phone number already used by {employee_display_name(dup_emp)}",
                )
        employee.phone = new_phone or None
    if "emergency_contact" in snake_case_data:
        employee.emergency_contact = snake_case_data["emergency_contact"]
    if "emergency_phone" in snake_case_data:
        employee.emergency_phone = snake_case_data["emergency_phone"]
    # Identity details
    if "voter_id" in snake_case_data:
        employee.voter_id = snake_case_data["voter_id"]
    if "aadhar_number" in snake_case_data:
        employee.aadhar_number = snake_case_data["aadhar_number"]
    if "pan_number" in snake_case_data:
        employee.pan_number = snake_case_data["pan_number"]
    if "driving_license" in snake_case_data:
        employee.driving_license = snake_case_data["driving_license"]
    if "passport_number" in snake_case_data:
        employee.passport_number = snake_case_data["passport_number"]
    if "birth_certificate_number" in snake_case_data:
        employee.birth_certificate_number = snake_case_data["birth_certificate_number"]
    # Academic fields
    if "education_level" in snake_case_data:
        employee.education_level = snake_case_data["education_level"]
    if "institution" in snake_case_data:
        employee.institution = snake_case_data["institution"]
    if "degree" in snake_case_data:
        employee.degree = snake_case_data["degree"]
    if "field_of_study" in snake_case_data:
        employee.field_of_study = snake_case_data["field_of_study"]
    if "graduation_year" in snake_case_data:
        employee.graduation_year = snake_case_data["graduation_year"]
    if "grade" in snake_case_data:
        employee.grade = snake_case_data["grade"]
    if "certification" in snake_case_data:
        employee.certification = snake_case_data["certification"]
    if "certification_org" in snake_case_data:
        employee.certification_org = snake_case_data["certification_org"]
    if "certification_date" in snake_case_data:
        try:
            employee.certification_date = datetime.fromisoformat(snake_case_data["certification_date"]) if snake_case_data["certification_date"] else None
        except Exception as exc:
            pass
    if "certification_expiry" in snake_case_data:
        try:
            employee.certification_expiry = datetime.fromisoformat(snake_case_data["certification_expiry"]) if snake_case_data["certification_expiry"] else None
        except Exception as exc:
            pass
    if "skills" in snake_case_data:
        employee.skills = snake_case_data["skills"]
    if "language1" in snake_case_data:
        employee.language1 = snake_case_data["language1"]
    if "language2" in snake_case_data:
        employee.language2 = snake_case_data["language2"]
    if "language3" in snake_case_data:
        employee.language3 = snake_case_data["language3"]
    # Bank info
    if "bank_name" in snake_case_data:
        employee.bank_name = snake_case_data["bank_name"]
    if "bank_account_number" in snake_case_data:
        employee.bank_account_number = snake_case_data["bank_account_number"]
    if "ifsc_code" in snake_case_data:
        employee.ifsc_code = snake_case_data["ifsc_code"]
    if "account_holder_name" in snake_case_data:
        employee.account_holder_name = snake_case_data["account_holder_name"]
    if "bank_accounts" in snake_case_data and isinstance(snake_case_data["bank_accounts"], list):
        employee.bank_accounts = snake_case_data["bank_accounts"]
    # Multiple details arrays
    for f in ("experience_details", "achievements_details", "activities_details", "education_details", "skills_list", "certifications", "languages"):
        if f in snake_case_data and isinstance(snake_case_data[f], list):
            setattr(employee, f, snake_case_data[f])
    # Salary
    if "base_salary" in snake_case_data and snake_case_data["base_salary"] is not None:
        try:
            employee.base_salary = float(snake_case_data["base_salary"])
        except Exception:
            pass
    if "salary_components" in snake_case_data and isinstance(snake_case_data["salary_components"], dict):
        employee.salary_components = snake_case_data["salary_components"]
    if "salary_template_id" in snake_case_data:
        try:
            employee.salary_template_id = int(snake_case_data["salary_template_id"]) if snake_case_data["salary_template_id"] not in (None, "", 0) else None
        except (TypeError, ValueError):
            employee.salary_template_id = None
    if "salary_company_id" in snake_case_data:
        try:
            employee.salary_company_id = int(snake_case_data["salary_company_id"]) if snake_case_data["salary_company_id"] not in (None, "", 0) else None
        except (TypeError, ValueError):
            employee.salary_company_id = None
    # Policy assignments (org-level defaults are used when these are unset)
    for field in ("payroll_policy_id", "attendance_policy_id", "tax_regime_id"):
        if field in snake_case_data:
            try:
                setattr(employee, field, int(snake_case_data[field]) if snake_case_data[field] not in (None, "", 0) else None)
            except (TypeError, ValueError):
                setattr(employee, field, None)
    if "payroll_template_id" in snake_case_data:
        try:
            employee.payroll_template_id = int(snake_case_data["payroll_template_id"]) if snake_case_data["payroll_template_id"] not in (None, "", 0) else None
        except (TypeError, ValueError):
            employee.payroll_template_id = None
        if employee.payroll_template_id:
            tpl = db.query(PayrollTemplate).filter(
                PayrollTemplate.id == employee.payroll_template_id,
                PayrollTemplate.deleted_at.is_(None),
            ).first()
            if tpl:
                if not employee.payroll_policy_id and tpl.payroll_policy_id:
                    employee.payroll_policy_id = tpl.payroll_policy_id
                if not employee.attendance_policy_id and tpl.attendance_policy_id:
                    employee.attendance_policy_id = tpl.attendance_policy_id
                if not employee.tax_regime_id and tpl.tax_regime_id:
                    employee.tax_regime_id = tpl.tax_regime_id
    # Documents
    if "resume_url" in snake_case_data:
        employee.resume_url = snake_case_data["resume_url"]
    if "id_proof_url" in snake_case_data:
        employee.id_proof_url = snake_case_data["id_proof_url"]
    if "photo_url" in snake_case_data:
        employee.photo_url = snake_case_data["photo_url"]
    # Benefits
    if "pf_number" in snake_case_data:
        employee.pf_number = snake_case_data["pf_number"]
    if "pf_uan" in snake_case_data:
        employee.pf_uan = snake_case_data["pf_uan"]
    if "mediclaim_number" in snake_case_data:
        employee.mediclaim_number = snake_case_data["mediclaim_number"]
    if "mediclaim_provider" in snake_case_data:
        employee.mediclaim_provider = snake_case_data["mediclaim_provider"]
    if "life_insurance_number" in snake_case_data:
        employee.life_insurance_number = snake_case_data["life_insurance_number"]
    if "life_insurance_provider" in snake_case_data:
        employee.life_insurance_provider = snake_case_data["life_insurance_provider"]
    # Family
    if "father_name" in snake_case_data:
        employee.father_name = snake_case_data["father_name"]
    if "mother_name" in snake_case_data:
        employee.mother_name = snake_case_data["mother_name"]
    if "sibling_name" in snake_case_data:
        employee.sibling_name = snake_case_data["sibling_name"]
    if "spouse_name" in snake_case_data:
        employee.spouse_name = snake_case_data["spouse_name"]
    if "spouse_phone" in snake_case_data:
        employee.spouse_phone = snake_case_data["spouse_phone"]
    if "number_of_children" in snake_case_data:
        employee.number_of_children = snake_case_data["number_of_children"]
    if "nominee_name" in snake_case_data:
        employee.nominee_name = snake_case_data["nominee_name"]
    if "nominee_relationship" in snake_case_data:
        employee.nominee_relationship = snake_case_data["nominee_relationship"]
    if "family_info" in snake_case_data:
        employee.family_info = snake_case_data["family_info"]
    if "education_details" in snake_case_data:
        employee.education_details = snake_case_data["education_details"]
    # Login
    if "user_role" in snake_case_data:
        employee.user_role = snake_case_data["user_role"]
    if "login_email" in snake_case_data:
        employee.login_email = snake_case_data["login_email"]
    # Device
    if "device_name" in snake_case_data:
        employee.device_name = snake_case_data["device_name"]
    if "device_type" in snake_case_data:
        employee.device_type = snake_case_data["device_type"]
    if "device_ip_address" in snake_case_data:
        employee.device_ip_address = snake_case_data["device_ip_address"]
    if "device_mac_address" in snake_case_data:
        employee.device_mac_address = snake_case_data["device_mac_address"]
    if "device_serial_number" in snake_case_data:
        employee.device_serial_number = snake_case_data["device_serial_number"]
    if "device_assigned_date" in snake_case_data:
        try:
            employee.device_assigned_date = datetime.fromisoformat(snake_case_data["device_assigned_date"]) if snake_case_data["device_assigned_date"] else None
        except Exception as exc:
            pass
    
    # Sync login credentials (email + phone) to the linked user account so the
    # employee can sign in and reset a forgotten password with matching details.
    # Guard against changing the user email to one already used by ANOTHER user
    # (the users.email column is unique) — silently keep the old user email in
    # that case instead of failing the whole employee update.
    if employee.user_id:
        user = db.query(User).filter(User.id == employee.user_id).first()
        if user:
            if "email" in snake_case_data and snake_case_data["email"]:
                new_email = str(snake_case_data["email"]).strip().lower()
                other = None
                if new_email:
                    other = db.query(User).filter(
                        User.id != user.id,
                        func.lower(User.email) == new_email,
                    ).first()
                if new_email and not other:
                    user.email = snake_case_data["email"]
            if "phone" in snake_case_data and snake_case_data["phone"]:
                user.phone = snake_case_data["phone"]

    # Update password if provided
    if "password" in snake_case_data and snake_case_data["password"]:
        if employee.user_id:
            user = db.query(User).filter(User.id == employee.user_id).first()
            if user:
                user.password_hash = get_password_hash(snake_case_data["password"])

    employee.updated_at = ist_now_naive()
    db.commit()
    _bust_employee_cache(current_user)

    # Auto-create an exit record when an employee is toggled inactive,
    # so the employee automatically appears on the Exit Management page.
    if employee.status == "inactive":
        try:
            from models import ExitRecord
            existing = db.query(ExitRecord).filter(
                ExitRecord.employee_id == employee.id,
                ExitRecord.deleted_at.is_(None),
                ExitRecord.archived_at.is_(None),
            ).first()
            if not existing:
                today = ist_now_naive()
                er = ExitRecord(
                    employee_id=employee.id,
                    organization_id=employee.organization_id,
                    exit_type="resigned",
                    exit_date=today,
                    last_working_day=today,
                    reason="Employee deactivated",
                    fnf_status="pending",
                    clearance_status="pending",
                    initiated_by=current_user.id,
                )
                db.add(er)
                db.commit()
        except Exception as exc:
            db.rollback()

        # Auto-create a job opening for the vacated position so the role
        # is immediately reposted on the Recruitment page.
        try:
            from models import JobOpening
            title = employee.designation or "Open Position"
            # Skip if an open job with the same title + department already exists
            dup = db.query(JobOpening).filter(
                JobOpening.deleted_at.is_(None),
                JobOpening.status.in_(["open", "on_hold"]),
                JobOpening.title == title,
                JobOpening.department_id == employee.department_id,
            ).first()
            if not dup:
                jo = JobOpening(
                    title=title,
                    description=(
                        f"Replacement position for {employee.first_name} {employee.last_name or ''}. "
                        "Submit your application to join the team."
                    ).strip(),
                    location=getattr(employee, "work_location", None) or "",
                    organization_id=employee.organization_id,
                    company_id=employee.company_id,
                    department_id=employee.department_id,
                    employment_type=employee.employment_type or "full_time",
                    salary_min=int(employee.base_salary or 0) or None,
                    salary_max=None,
                    skills_required=employee.skills,
                    vacancy_count=1,
                    status="open",
                    published_date=ist_now_naive(),
                )
                db.add(jo)
                db.commit()
        except Exception as exc:
            db.rollback()

    db.refresh(employee)
    _bust_employee_cache(current_user)
    return {"message": "Employee updated successfully"}


@router.patch("/{employee_id}", response_model=dict)
def patch_employee(employee_id: int, employee_data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """PATCH endpoint for partial employee updates (same as PUT for compatibility)"""
    return update_employee(employee_id, employee_data, db, current_user)


@router.delete("/document")
def delete_employee_document(
    docType: str = Query(...),
    employeeId: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a stored identity/HR document (aadhar, pan, voter, drivingLicense,
    passport, photo, resume, birthCertificate, certificate) from the employee."""
    valid_types = ("aadhar", "pan", "voter", "drivingLicense", "passport", "photo", "resume", "birthCertificate", "certificate")
    if docType not in valid_types:
        raise HTTPException(status_code=400, detail=f"docType must be one of {', '.join(valid_types)}")

    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employeeId).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Capture the file path so we can delete it from disk after clearing the record
    old_url = None
    docs = emp.id_documents or {}
    if docType in docs:
        old_url = docs[docType]
        del docs[docType]
        emp.id_documents = docs
    if docType == "photo" and emp.photo_url:
        old_url = emp.photo_url
        emp.photo_url = None
    elif docType == "resume" and emp.resume_url:
        old_url = emp.resume_url
        emp.resume_url = None
    # Also clear the auto-filled number for identity docs
    field_map = {
        "aadhar": "aadhar_number",
        "pan": "pan_number",
        "voter": "voter_id",
        "drivingLicense": "driving_license",
        "passport": "passport_number",
    }
    field = field_map.get(docType)
    if field:
        setattr(emp, field, None)
    db.commit()

    # Remove the file from disk (best-effort) so deleted docs free up server space
    if old_url and old_url.startswith("/uploads/employees/"):
        fname = old_url.rsplit("/", 1)[-1]
        upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "employees")
        file_path = os.path.join(upload_dir, fname)
        if os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

    return {"message": "Document deleted", "docType": docType}


@router.post("/cleanup-orphan-docs")
def cleanup_orphan_docs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete uploaded files under uploads/employees that are no longer referenced
    by any employee's id_documents / photo_url / resume_url. Superadmin only."""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")

    upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "employees")
    if not os.path.isdir(upload_dir):
        return {"deleted": 0, "freedBytes": 0}

    referenced = set()
    from sqlalchemy import or_
    rows = db.query(Employee).filter(
        or_(
            Employee.id_documents.isnot(None),
            Employee.photo_url.isnot(None),
            Employee.resume_url.isnot(None),
        )
    ).all()
    for emp in rows:
        docs = emp.id_documents or {}
        for v in docs.values():
            if isinstance(v, str):
                referenced.add(v.split("/")[-1])
        if emp.photo_url:
            referenced.add(emp.photo_url.split("/")[-1])
        if emp.resume_url:
            referenced.add(emp.resume_url.split("/")[-1])

    deleted = 0
    freed = 0
    for fname in os.listdir(upload_dir):
        if fname in referenced:
            continue
        path = os.path.join(upload_dir, fname)
        if os.path.isfile(path):
            try:
                freed += os.path.getsize(path)
                os.remove(path)
                deleted += 1
            except Exception:
                pass
    return {"deleted": deleted, "freedBytes": freed, "freedKB": round(freed / 1024, 1)}


@router.delete("/{employee_id}", response_model=dict)
def delete_employee(employee_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_module_action(db, current_user, "employees", "delete")
    employee_query = db.query(Employee).filter(Employee.id == employee_id)
    if current_user.organization_id is not None:
        employee_query = employee_query.filter(Employee.organization_id == current_user.organization_id)
    employee = employee_query.first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    employee.status = "terminated"
    employee.termination_date = ist_now_naive()
    db.commit()
    db.refresh(employee)
    _bust_employee_cache(current_user)
    return {"message": "Employee deactivated successfully"}


@router.post("/export-csv")
def export_employees(
    company_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    department_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    import csv
    import io

    if company_id is None and request is not None:
        company_id = get_header_company_id(request)

    # Build query with filters (live employees only)
    query = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.organization_id is not None:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    if company_id:
        query = query.filter(Employee.company_id == company_id)
    if branch_id:
        query = query.join(Employee.branches).filter(Branch.id == branch_id)
    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if status:
        query = query.filter(Employee.status == status)

    header_row = [
            "employee_code",
            "first_name",
            "last_name",
            "email",
            "phone",
            "designation",
            "designation_id",
            "department_id",
            "organization_id",
            "company_id",
            "date_of_birth",
            "gender",
            "blood_group",
            "marital_status",
            "current_address",
            "permanent_address",
            "landmark",
            "emergency_contact",
            "emergency_phone",
            "aadhar_number",
            "pan_number",
            "driving_license",
            "passport_number",
            "voter_id",
            "pf_number",
            "pf_uan",
            "mediclaim_number",
            "mediclaim_provider",
            "father_name",
            "mother_name",
            "spouse_name",
            "spouse_phone",
            "number_of_children",
            "nominee_name",
            "nominee_relationship",
            "join_date",
            "employment_type",
            "status",
            "termination_date",
            "date_of_leaving",
            "termination_type",
            "notice_period_served",
            "handover_completed",
            "full_final_settlement",
            "bank_name",
            "bank_account_number",
            "ifsc_code",
            "education_level",
            "institution",
            "degree",
            "field_of_study",
            "graduation_year",
            "grade",
            "certification",
            "certification_org",
            "certification_date",
            "certification_expiry",
            "skills",
            "language1",
            "language2",
            "language3",
            "device_type",
            "device_ip_address",
            "device_mac_address",
            "device_serial_number",
            "device_assigned_date",
        ]

    def _row(emp):
        return [
            emp.employee_code or "",
            emp.first_name or "",
            emp.last_name or "",
            emp.email or "",
            emp.phone or "",
            emp.designation or "",
            emp.designation_id or "",
            emp.department_id or "",
            emp.organization_id or "",
            emp.company_id or "",
            str(emp.date_of_birth) if emp.date_of_birth else "",
            emp.gender or "",
            emp.blood_group or "",
            emp.marital_status or "",
            emp.current_address or "",
            emp.permanent_address or "",
            emp.landmark or "",
            emp.emergency_contact or "",
            emp.emergency_phone or "",
            emp.aadhar_number or "",
            emp.pan_number or "",
            emp.driving_license or "",
            emp.passport_number or "",
            emp.voter_id or "",
            emp.pf_number or "",
            emp.pf_uan or "",
            emp.mediclaim_number or "",
            emp.mediclaim_provider or "",
            emp.father_name or "",
            emp.mother_name or "",
            emp.spouse_name or "",
            emp.spouse_phone or "",
            emp.number_of_children or "",
            emp.nominee_name or "",
            emp.nominee_relationship or "",
            str(emp.join_date) if emp.join_date else "",
            emp.employment_type or "",
            emp.status or "",
            str(emp.termination_date) if emp.termination_date else "",
            str(emp.date_of_leaving) if emp.date_of_leaving else "",
            emp.termination_type or "",
            emp.notice_period_served or "",
            emp.handover_completed or "",
            emp.full_final_settlement or "",
            emp.bank_name or "",
            emp.bank_account_number or "",
            emp.ifsc_code or "",
            emp.education_level or "",
            emp.institution or "",
            emp.degree or "",
            emp.field_of_study or "",
            emp.graduation_year or "",
            emp.grade or "",
            emp.certification or "",
            emp.certification_org or "",
            str(emp.certification_date) if emp.certification_date else "",
            str(emp.certification_expiry) if emp.certification_expiry else "",
            emp.skills or "",
            emp.language1 or "",
            emp.language2 or "",
            emp.language3 or "",
            emp.device_type or "",
            emp.device_ip_address or "",
            emp.device_mac_address or "",
            emp.device_serial_number or "",
            str(emp.device_assigned_date) if emp.device_assigned_date else "",
        ]

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(header_row)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        exported = 0
        for emp in query.order_by(Employee.id).yield_per(1000):
            if exported >= MAX_EXPORT_LIMIT:
                break
            writer.writerow(_row(emp))
            exported += 1
            if buf.tell() > 65536:
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate(0)
        tail = buf.getvalue()
        if tail:
            yield tail

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employees_export.csv"},
    )


@router.post("/bulk-upload")
def bulk_upload_employees(
    file: UploadFile = File(...),
    companyId: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_module_action(db, current_user, "employees", "write")
    import csv
    import io

    # Check file type
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported")

    content = file.file.read()
    
    # Read file based on type
    if file.filename.endswith(".csv"):
        decoded = content.decode("utf-8")
        df = pd.read_csv(io.StringIO(decoded))
    else:
        df = pd.read_excel(io.BytesIO(content))

    # Normalize column names: strip whitespace and trailing asterisks
    df.columns = df.columns.str.strip().str.replace(r'\*$', '', regex=True).str.lower()
    
    # Column mapping for different naming conventions
    column_map = {
        'full name': 'full_name',
        'fullname': 'full_name',
        'first name': 'first_name',
        'firstname': 'first_name',
        'last name': 'last_name',
        'lastname': 'last_name',
        'name': 'full_name',
        'employee code': 'employee_code',
        'employeecode': 'employee_code',
        'company name': 'company_name',
        'companyname': 'company_name',
        'branch name': 'branch_name',
        'branchname': 'branch_name',
        'date of birth': 'date_of_birth',
        'dateofbirth': 'date_of_birth',
        'join date': 'join_date',
        'joindate': 'join_date',
        'current address': 'current_address',
        'currentaddress': 'current_address',
        'permanent address': 'permanent_address',
        'permanentaddress': 'permanent_address',
        'emergency contact': 'emergency_contact',
        'emergencycontact': 'emergency_contact',
        'emergency phone': 'emergency_phone',
        'emergencyphone': 'emergency_phone',
        'aadhar number': 'aadhar_number',
        'aadharnumber': 'aadhar_number',
        'pan number': 'pan_number',
        'pannumber': 'pan_number',
        'bank name': 'bank_name',
        'bankname': 'bank_name',
        'bank account number': 'bank_account_number',
        'bankaccountnumber': 'bank_account_number',
        'ifsc code': 'ifsc_code',
        'ifsccode': 'ifsc_code',
    }
    
    df = df.rename(columns=column_map)

    # Build a display-friendly header map for error messages
    original_headers = list(df.columns)

    def _row_val(row, key, default=""):
        v = row.get(key, default)
        return "" if pd.isna(v) else str(v).strip()

    # Enforce plan employee limit before inserting.
    try:
        _enforce_employee_limit(db, current_user.organization_id, extra=int(len(df)))
    except HTTPException:
        raise

    created = 0
    updated = 0
    errors = []

    for row_num, row in df.iterrows():
        savepoint = db.begin_nested()
        try:
            employee_code = _row_val(row, "employee_code")
            email = _row_val(row, "email")
            full_name = _row_val(row, "full_name")
            first_name = _row_val(row, "first_name")
            last_name = _row_val(row, "last_name")
            if not full_name:
                full_name = f"{first_name} {last_name}".strip()
            first_name, last_name = split_name(full_name)
            phone = _row_val(row, "phone")
            current_address = _row_val(row, "current_address")

            if not full_name:
                raise ValueError("full_name is required. Available columns in file: " + ", ".join(original_headers))

            company_id = companyId
            if 'company_name' in row and pd.notna(row['company_name']):
                company = db.query(Organization).filter(Organization.name == str(row['company_name']).strip()).first()
                if company:
                    company_id = company.id

            branch_id = None
            if 'branch_name' in row and pd.notna(row['branch_name']):
                branch = db.query(Branch).filter(Branch.name == str(row['branch_name']).strip()).first()
                if branch:
                    branch_id = branch.id

            department_id = None
            if 'department' in row and pd.notna(row['department']):
                dept = db.query(Department).filter(Department.name == str(row['department']).strip()).first()
                if dept:
                    department_id = dept.id

            existing = (
                db.query(Employee).filter((Employee.employee_code == employee_code) | (Employee.email == email)).first()
                if email
                else db.query(Employee).filter(Employee.employee_code == employee_code).first()
            )

            if existing:
                existing.full_name = full_name
                existing.first_name = first_name or full_name
                existing.last_name = last_name
                existing.phone = phone or existing.phone
                existing.current_address = current_address or existing.current_address
                existing.designation = str(row.get("designation", existing.designation)) if pd.notna(row.get("designation")) else existing.designation
                existing.status = str(row.get("status", existing.status)) if pd.notna(row.get("status")) else existing.status
                if company_id:
                    existing.company_id = company_id
                if branch_id:
                    branch = db.query(Branch).filter(Branch.id == branch_id).first()
                    if branch and branch not in existing.branches:
                        existing.branches.append(branch)
                if department_id:
                    existing.department_id = department_id
                existing.updated_at = ist_now_naive()
                updated += 1
            else:
                join_date = None
                if 'join_date' in row and pd.notna(row['join_date']):
                    try:
                        join_date = pd.to_datetime(row['join_date']).to_pydatetime()
                    except Exception:
                        join_date = ist_now_naive()
                else:
                    join_date = ist_now_naive()

                date_of_birth = None
                if 'date_of_birth' in row and pd.notna(row['date_of_birth']):
                    try:
                        date_of_birth = pd.to_datetime(row['date_of_birth']).to_pydatetime()
                    except Exception:
                        pass

                new_emp = Employee(
                    employee_code=employee_code,
                    full_name=full_name,
                    first_name=first_name or full_name,
                    last_name=last_name,
                    email=email or f"{employee_code.lower()}@company.com",
                    phone=phone,
                    current_address=current_address,
                    designation=str(row.get("designation")) if pd.notna(row.get("designation")) else None,
                    organization_id=current_user.organization_id,
                    company_id=company_id,
                    department_id=department_id,
                    status=str(row.get("status", "active")) if pd.notna(row.get("status")) else "active",
                    employment_type=str(row.get("employment_type", "full_time")) if pd.notna(row.get("employment_type")) else "full_time",
                    join_date=join_date,
                    date_of_birth=date_of_birth,
                    gender=str(row.get("gender")) if pd.notna(row.get("gender")) else None,
                    address=str(row.get("address")) if pd.notna(row.get("address")) else None,
                    emergency_contact=str(row.get("emergency_contact")) if pd.notna(row.get("emergency_contact")) else None,
                    emergency_phone=str(row.get("emergency_phone")) if pd.notna(row.get("emergency_phone")) else None,
                )
                if branch_id:
                    branch = db.query(Branch).filter(Branch.id == branch_id).first()
                    if branch:
                        new_emp.branches.append(branch)
                db.add(new_emp)
                db.flush()
                created += 1
            savepoint.commit()
        except Exception as e:
            savepoint.rollback()
            errors.append({"row": row_num + 2, "error": str(e)})

    db.commit()
    _bust_employee_cache(current_user)
    return {"message": "Bulk upload completed", "created": created, "updated": updated, "errors": errors}


@router.get("/{employee_id}/performance", response_model=PerformanceResponse)
def get_employee_performance(
    employee_id: int,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee_query = db.query(Employee).filter(Employee.id == employee_id)
    if current_user.organization_id is not None:
        employee_query = employee_query.filter(Employee.organization_id == current_user.organization_id)
    employee = employee_query.first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    now = ist_now_naive()
    target_month = month or now.month
    target_year = year or now.year
    start_date = datetime(target_year, target_month, 1)
    end_date = datetime(target_year + 1, 1, 1) if target_month == 12 else datetime(target_year, target_month + 1, 1)

    attendances = (
        db.query(Attendance)
        .filter(Attendance.employee_id == employee_id, Attendance.date >= start_date, Attendance.date < end_date)
        .all()
    )
    days_worked = len([a for a in attendances if a.status in ["present", "late"]])
    hours_worked = sum([a.work_hours or 0 for a in attendances])
    late_days = len([a for a in attendances if a.status == "late"])
    avg_hours = hours_worked / days_worked if days_worked > 0 else 0

    detail = PerformanceDetail(
        daysWorked=days_worked,
        hoursWorked=round(hours_worked, 2),
        avgHoursPerDay=round(avg_hours, 2),
        lateDays=late_days,
        period=f"{calendar.month_name[target_month]} {target_year}",
    )
    return PerformanceResponse(
        employeeId=employee_id,
        employeeName=f"{employee.first_name} {employee.last_name or ''}".strip(),
        metrics=[detail],
        summary={
            "totalDays": days_worked,
            "totalHours": round(hours_worked, 2),
            "efficiency": "High" if avg_hours >= 8 else "Normal",
        },
    )


@router.post("/photo")
async def upload_employee_photo(
    file: UploadFile = File(...),
    employeeId: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an employee profile photo. Returns the public photo URL."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    ext = os.path.splitext(file.filename or "")[1] or ".jpg"
    filename = f"emp_{uuid.uuid4().hex[:12]}{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "employees")
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, filename)
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    photo_url = f"/uploads/employees/{filename}"

    # Optionally attach to an existing employee
    if employeeId:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employeeId).first()
        if emp:
            emp.photo_url = photo_url
            db.commit()

    return {"photoUrl": photo_url, "url": photo_url}


@router.post("/document")
async def upload_employee_document(
    file: UploadFile = File(...),
    docType: str = Form(...),
    employeeId: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an identity/HR document (aadhar, pan, voter, drivingLicense, passport).

    Stores the URL in the employee's `id_documents` JSON map keyed by docType.
    """
    valid_types = ("aadhar", "pan", "voter", "drivingLicense", "passport", "photo", "resume", "birthCertificate", "certificate")
    if docType not in valid_types:
        raise HTTPException(status_code=400, detail=f"docType must be one of {', '.join(valid_types)}")

    ext = os.path.splitext(file.filename or "")[1] or ".jpg"
    if ext.lower() not in (".jpg", ".jpeg", ".png", ".pdf", ".webp"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use JPG, PNG, PDF or WebP.")

    filename = f"emp_doc_{docType}_{uuid.uuid4().hex[:12]}{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "employees")
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, filename)
    content = await file.read()
    if len(content) > EMPLOYEE_DOC_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {EMPLOYEE_DOC_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
        )

    ocr_source = content

    # Compress / resize raster images so uploaded docs stay lightweight on disk.
    if ext.lower() in (".jpg", ".jpeg", ".png", ".webp"):
        try:
            from PIL import Image
            import io as _io
            img = Image.open(_io.BytesIO(content))
            img = img.convert("RGB")
            # Downscale large images to keep photos/ID scans small
            max_side = 1200
            w, h = img.size
            if max(w, h) > max_side:
                ratio = max_side / max(w, h)
                img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
            buf = _io.BytesIO()
            img.save(buf, format="JPEG", quality=82, optimize=True, progressive=True)
            content = buf.getvalue()
            # update extension to .jpg for the stored file
            filename = f"emp_doc_{docType}_{uuid.uuid4().hex[:12]}.jpg"
            save_path = os.path.join(upload_dir, filename)
        except Exception:
            # fall back to original bytes if Pillow can't process the image
            pass

    with open(save_path, "wb") as f:
        f.write(content)

    doc_url = f"/uploads/employees/{filename}"
    parsed_number = ""
    field_map = {
        "aadhar": "aadhar_number",
        "pan": "pan_number",
        "voter": "voter_id",
        "drivingLicense": "driving_license",
        "passport": "passport_number",
    }
    # Auto-parse the document number via OCR / text extraction
    if docType in field_map:
        try:
            from services.document_parser import parse_document_number
            parsed = parse_document_number(file.filename or "", ocr_source, docType)
            parsed_number = parsed.get("parsedNumber") or ""
        except Exception:
            parsed_number = ""

    if employeeId:
        emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employeeId).first()
        if emp:
            docs = emp.id_documents or {}
            docs[docType] = doc_url
            emp.id_documents = docs
            # Also sync to the dedicated columns for photo / resume
            if docType == "photo":
                emp.photo_url = doc_url
            elif docType == "resume":
                emp.resume_url = doc_url
            # Auto-fill the parsed number into the employee record
            field = field_map.get(docType)
            if field and parsed_number:
                setattr(emp, field, parsed_number)
            db.commit()

    return {
        "docType": docType,
        "documentUrl": doc_url,
        "url": doc_url,
        "parsedNumber": parsed_number,
        "parsed": bool(parsed_number),
    }
