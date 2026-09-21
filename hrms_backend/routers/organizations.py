from typing import Optional, Union

from core.datetime_utils import ist_now_naive
import csv
import io
import os
import uuid
import base64
import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import check_role, get_current_user
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from database import get_db
from models import Department, Organization, User, Company, Branch, Designation, Employee
from core.audit import log_activity, get_client_info
from core.tenant import force_org, org_owned, validate_company_in_org
from utils.helpers import camel_to_snake, convert_camel_to_snake

router = APIRouter(tags=["organizations"])


def _coerce_int(value: Optional[Union[str, int, None]]) -> Optional[int]:
    """Safely convert a value to int, returning None for empty/invalid values."""
    if value is None or value == "" or (isinstance(value, str) and value.strip() == ""):
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _coerce_float(value: Optional[Union[str, int, float, None]]) -> Optional[float]:
    """Safely convert a value to float, returning None for empty/invalid values."""
    if value is None or value == "" or (isinstance(value, str) and value.strip() == ""):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _save_company_logo(logo: Optional[str], company_id: Optional[int] = None) -> Optional[str]:
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
        if mime in ("image/jpeg", "image/jpg"):
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



@router.get("/departments", response_model=list[dict])
def get_departments(
    companyId: Optional[int] = None,
    includeDeleted: Optional[bool] = False,
    active_only: Optional[bool] = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Department).filter(Department.organization_id == current_user.organization_id)
    companyId = resolve_company_scope(db, current_user, companyId)
    if companyId:
        query = query.filter(Department.company_id == companyId)
    if active_only:
        query = query.filter(Department.status == "active")
    if not includeDeleted:
        query = query.filter(Department.status != 'deleted')
    departments = query.order_by(Department.company_id, Department.name).limit(100).all()
    
    result = []
    for dept in departments:
        manager_name = None
        if dept.manager_id:
            manager_id = int(dept.manager_id) if isinstance(dept.manager_id, str) else dept.manager_id
            manager = db.query(Employee).filter(Employee.id == manager_id, Employee.organization_id == current_user.organization_id).first()
            if manager:
                manager_name = f"{manager.first_name} {manager.last_name}"
        
        result.append({
            "id": dept.id,
            "name": dept.name or "",
            "code": dept.code or "",
            "description": dept.description or "",
            "companyId": dept.company_id,
            "managerId": dept.manager_id,
            "managerName": manager_name,
            "status": dept.status or "active",
            "createdAt": dept.created_at.isoformat() if dept.created_at else None,
        })
    
    return result


@router.get("/departments/count", response_model=int)
def get_departments_count(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Department).filter(Department.organization_id == current_user.organization_id)
    companyId = resolve_company_scope(db, current_user, companyId)
    if companyId:
        query = query.filter(Department.company_id == companyId)
    return query.count()


@router.post("/departments", response_model=dict)
def create_department(
    department_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        # Convert camelCase to snake_case for backend compatibility
        snake_case_data = convert_camel_to_snake(department_data)

        # Coerce integer fields - convert empty strings to None
        company_id = _coerce_int(snake_case_data.get("company_id"))
        manager_id = _coerce_int(snake_case_data.get("manager_id"))

        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, company_id, current_user.organization_id)

        department = Department(
            name=snake_case_data.get("name"),
            code=snake_case_data.get("code"),
            description=snake_case_data.get("description"),
            company_id=company_id,
            manager_id=manager_id,
            organization_id=current_user.organization_id,
            status=snake_case_data.get("status", "active"),
        )
        db.add(department)
        db.commit()
        db.refresh(department)

        # Log activity
        client_info = get_client_info(request)
        log_activity(
            db=db,
            user_id=current_user.id,
            module="Company",
            action="create",
            entity_type="department",
            entity_id=department.id,
            entity_name=department.name,
            new_value=f"Created department: {department.name}",
            ip_address=client_info["ip_address"],
            mac_address=client_info["mac_address"],
            device_info=client_info["device_info"],
            user_agent=client_info["user_agent"],
        )

        return {"message": "Department created successfully", "id": department.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"Error creating department: {error_msg}")
        import traceback
        traceback.print_exc()

        # Check for common constraint violations
        if "UNIQUE constraint" in error_msg or "duplicate" in error_msg.lower():
            raise HTTPException(status_code=400, detail="Department code already exists")

        raise HTTPException(status_code=500, detail=f"Failed to create department: {error_msg}")


@router.put("/departments/{dept_id}", response_model=dict)
def update_department(
    dept_id: int,
    department_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    department = db.query(Department).filter(Department.id == dept_id, Department.organization_id == current_user.organization_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Store old values for logging
    old_values = {
        "name": department.name,
        "code": department.code,
        "status": department.status,
    }
    
    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(department_data)
    
    if "name" in snake_case_data:
        department.name = snake_case_data["name"]
    if "code" in snake_case_data:
        department.code = snake_case_data["code"]
    if "description" in snake_case_data:
        department.description = snake_case_data["description"]
    if "company_id" in snake_case_data:
        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, _coerce_int(snake_case_data["company_id"]), current_user.organization_id)
        department.company_id = _coerce_int(snake_case_data["company_id"])
    if "manager_id" in snake_case_data:
        department.manager_id = _coerce_int(snake_case_data["manager_id"])
    if "status" in snake_case_data:
        department.status = snake_case_data["status"]
    
    department.updated_at = ist_now_naive()
    db.commit()
    db.refresh(department)

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="edit",
        entity_type="department",
        entity_id=dept_id,
        entity_name=department.name,
        old_value=str(old_values),
        new_value=str(snake_case_data),
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Department updated successfully", "id": department.id}


@router.delete("/departments/{dept_id}", response_model=dict)
def delete_department(
    dept_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    department = db.query(Department).filter(Department.id == dept_id, Department.organization_id == current_user.organization_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    department_name = department.name
    db.delete(department)
    db.commit()

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="delete",
        entity_type="department",
        entity_id=dept_id,
        entity_name=department_name,
        new_value=f"Deleted department: {department_name}",
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Department deleted successfully"}


@router.patch("/departments/{dept_id}", response_model=dict)
def toggle_department_status(
    dept_id: int,
    status_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle department status (active/inactive)"""
    department = db.query(Department).filter(Department.id == dept_id, Department.organization_id == current_user.organization_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    old_status = department.status
    new_status = status_data.get("status", old_status)
    department.status = new_status
    department.updated_at = ist_now_naive()
    db.commit()
    db.refresh(department)

    # Log activity
    client_info = get_client_info(request)
    action = "toggle_active" if new_status == "active" else "toggle_inactive"
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action=action,
        entity_type="department",
        entity_id=dept_id,
        entity_name=department.name,
        old_value=old_status,
        new_value=new_status,
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": f"Department status updated to {new_status}", "status": new_status}


# ============ COMPANIES ============

@router.get("/companies", response_model=list[dict])
def get_companies(
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Company).filter(Company.organization_id == current_user.organization_id)
    if active_only:
        query = query.filter(Company.status == "active")
    # Company isolation: restricted roles see only their own company (this rich
    # payload carries tax IDs — never leak the roster).
    _org_co_scope = resolve_company_scope(db, current_user, None)
    if _org_co_scope is not None:
        query = query.filter(Company.id == _org_co_scope)
    companies = query.limit(100).all()  # Limit for performance
    return [
        {
            "id": comp.id,
            "name": comp.name,
            "code": comp.code or "",
            "description": comp.description or "",
            "registrationNumber": comp.registration_number or "",
            "taxId": comp.tax_id or "",
            "cin": getattr(comp, "cin", None) or "",
            "industry": comp.industry or "",
            "companySize": comp.company_size or "",
            "panNo": getattr(comp, "pan_no", None) or "",
            "tanNo": getattr(comp, "tan_no", None) or "",
            "gstNo": getattr(comp, "gst_no", None) or "",
            "address": comp.address or "",
            "state": getattr(comp, "state", None) or "",
            "pincode": getattr(comp, "pincode", None) or "",
            "website": comp.website or "",
            "email": comp.email or "",
            "phone": comp.phone or "",
            "logo": comp.logo or "",
            "country": getattr(comp, "country", None) or "",
            "status": comp.status or "active",
            "createdAt": comp.created_at.isoformat() if comp.created_at else None,
        }
        for comp in companies
    ]


@router.get("/companies/count", response_model=int)
def get_companies_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Company).filter(Company.organization_id == current_user.organization_id)
    _cnt_scope = resolve_company_scope(db, current_user, None)
    if _cnt_scope is not None:
        query = query.filter(Company.id == _cnt_scope)
    return query.count()


from utils.helpers import camel_to_snake, convert_camel_to_snake


@router.post("/companies", response_model=dict)
def create_company(
    company_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        # Convert camelCase to snake_case for backend compatibility
        snake_case_data = convert_camel_to_snake(company_data)
        
        # Check if code already exists
        existing_code = db.query(Company).filter(Company.code == snake_case_data.get("code")).first()
        if existing_code:
            raise HTTPException(status_code=400, detail=f"Company code '{snake_case_data.get('code')}' already exists")
        
        logo = snake_case_data.get("logo") or company_data.get("logo")
        company = Company(
            name=snake_case_data.get("name"),
            code=snake_case_data.get("code"),
            description=snake_case_data.get("description"),
            registration_number=snake_case_data.get("registration_number"),
            tax_id=snake_case_data.get("tax_id"),
            cin=snake_case_data.get("cin"),
            industry=snake_case_data.get("industry"),
            company_size=snake_case_data.get("company_size"),
            pan_no=snake_case_data.get("pan_no") or snake_case_data.get("pan_number"),
            tan_no=snake_case_data.get("tan_no"),
            gst_no=snake_case_data.get("gst_no"),
            address=snake_case_data.get("address"),
            state=snake_case_data.get("state"),
            pincode=snake_case_data.get("pincode"),
            website=snake_case_data.get("website"),
            email=snake_case_data.get("email"),
            phone=snake_case_data.get("phone"),
            country=snake_case_data.get("country"),
            logo=None,
            organization_id=current_user.organization_id,
            status=snake_case_data.get("status", "active"),
        )
        db.add(company)
        db.flush()
        company.logo = _save_company_logo(logo, company.id)
        db.commit()
        db.refresh(company)

        # Log activity
        client_info = get_client_info(request)
        log_activity(
            db=db,
            user_id=current_user.id,
            module="Company",
            action="create",
            entity_type="company",
            entity_id=company.id,
            entity_name=company.name,
            new_value=f"Created company: {company.name}",
            ip_address=client_info["ip_address"],
            mac_address=client_info["mac_address"],
            device_info=client_info["device_info"],
            user_agent=client_info["user_agent"],
        )

        return {"message": "Company created successfully", "id": company.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"Error creating company: {error_msg}")
        import traceback
        traceback.print_exc()
        
        # Check for unique constraint violation
        if "UNIQUE constraint" in error_msg or "duplicate" in error_msg.lower():
            raise HTTPException(status_code=400, detail="Company code already exists")
        
        raise HTTPException(status_code=500, detail=f"Failed to create company: {error_msg}")


@router.put("/companies/{comp_id}", response_model=dict)
def update_company(
    comp_id: int,
    company_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == comp_id, Company.organization_id == current_user.organization_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Store old values for logging
    old_values = {
        "name": company.name,
        "code": company.code,
        "status": company.status,
    }
    
    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(company_data)
    
    if "name" in snake_case_data:
        company.name = snake_case_data["name"]
    if "code" in snake_case_data:
        company.code = snake_case_data["code"]
    if "status" in snake_case_data:
        company.status = snake_case_data["status"]
    if "description" in snake_case_data:
        company.description = snake_case_data["description"]
    if "registration_number" in snake_case_data:
        company.registration_number = snake_case_data["registration_number"]
    if "tax_id" in snake_case_data:
        company.tax_id = snake_case_data["tax_id"]
    if "cin" in snake_case_data:
        company.cin = snake_case_data["cin"]
    if "industry" in snake_case_data:
        company.industry = snake_case_data["industry"]
    if "company_size" in snake_case_data:
        company.company_size = snake_case_data["company_size"]
    if "address" in snake_case_data:
        company.address = snake_case_data["address"]
    if "state" in snake_case_data:
        company.state = snake_case_data["state"]
    if "pincode" in snake_case_data:
        company.pincode = snake_case_data["pincode"]
    if "website" in snake_case_data:
        company.website = snake_case_data["website"]
    if "email" in snake_case_data:
        company.email = snake_case_data["email"]
    if "phone" in snake_case_data:
        company.phone = snake_case_data["phone"]
    if "country" in snake_case_data:
        company.country = snake_case_data["country"]
    if "pan_no" in snake_case_data or "pan_number" in snake_case_data:
        company.pan_no = snake_case_data.get("pan_no") or snake_case_data.get("pan_number")
    if "tan_no" in snake_case_data:
        company.tan_no = snake_case_data["tan_no"]
    if "gst_no" in snake_case_data:
        company.gst_no = snake_case_data["gst_no"]
    if "logo" in company_data:
        company.logo = _save_company_logo(company_data["logo"], comp_id)
    company.updated_at = ist_now_naive()
    
    db.commit()
    db.refresh(company)

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="edit",
        entity_type="company",
        entity_id=comp_id,
        entity_name=company.name,
        old_value=str(old_values),
        new_value=str(snake_case_data),
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Company updated successfully", "id": company.id}


@router.delete("/companies/{comp_id}", response_model=dict)
def delete_company(
    comp_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == comp_id, Company.organization_id == current_user.organization_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company_name = company.name
    db.delete(company)
    db.commit()

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="delete",
        entity_type="company",
        entity_id=comp_id,
        entity_name=company_name,
        new_value=f"Deleted company: {company_name}",
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Company deleted successfully"}


@router.patch("/companies/{comp_id}", response_model=dict)
def toggle_company_status(
    comp_id: int,
    status_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle company status (active/inactive)"""
    company = db.query(Company).filter(Company.id == comp_id, Company.organization_id == current_user.organization_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    old_status = company.status
    new_status = status_data.get("status", old_status)
    company.status = new_status
    company.updated_at = ist_now_naive()
    db.commit()
    db.refresh(company)

    # Log activity
    client_info = get_client_info(request)
    action = "toggle_active" if new_status == "active" else "toggle_inactive"
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action=action,
        entity_type="company",
        entity_id=comp_id,
        entity_name=company.name,
        old_value=old_status,
        new_value=new_status,
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": f"Company status updated to {new_status}", "status": new_status}


# ============ BRANCHES ============

@router.get("/branches", response_model=list[dict])
def get_branches(
    companyId: Optional[int] = None,
    active_only: Optional[bool] = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Branch).filter(Branch.organization_id == current_user.organization_id)
    if active_only:
        query = query.filter(Branch.status == "active")
    companyId = resolve_company_scope(db, current_user, companyId)
    if companyId:
        query = query.filter(Branch.company_id == companyId)
    branches = query.limit(100).all()  # Limit for performance
    return [
        {
            "id": branch.id,
            "name": branch.name,
            "code": branch.code or "",
            "description": branch.description or "",
            "location": branch.location or "",
            "state": getattr(branch, "state", None) or "",
            "pincode": getattr(branch, "pincode", None) or "",
            "latitude": branch.latitude,
            "longitude": branch.longitude,
            "geofenceRadius": branch.geofence_radius,
            "companyId": branch.company_id,
            "status": branch.status or "active",
            "createdAt": branch.created_at.isoformat() if branch.created_at else None,
        }
        for branch in branches
    ]


@router.get("/branches/count", response_model=int)
def get_branches_count(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Branch).filter(Branch.organization_id == current_user.organization_id)
    _br_scope = resolve_company_scope(db, current_user, companyId)
    if _br_scope:
        query = query.filter(Branch.company_id == _br_scope)
    return query.count()


@router.get("/branches/template")
def download_branch_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["branch_name", "code", "company_id", "status"])
    writer.writerow(["Head Office", "HO", "1", "active"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=branch_bulk_upload_template.csv"},
    )


@router.get("/branches/export")
def export_branches(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Branch).filter(Branch.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(Branch.company_id == companyId)
    branches = query.all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "code", "description", "location", "latitude", "longitude", "geofenceRadius", "companyId", "organizationId", "status"])
    for branch in branches:
        writer.writerow([
            branch.name,
            branch.code or "",
            branch.description or "",
            branch.location or "",
            branch.latitude or "",
            branch.longitude or "",
            branch.geofence_radius or "",
            branch.company_id or "",
            branch.organization_id or "",
            branch.status or "active"
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=branches_export.csv"},
    )


@router.get("/branches/{branch_id:int}", response_model=dict)
def get_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = db.query(Branch).filter(Branch.id == branch_id, Branch.organization_id == current_user.organization_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    return {
        "id": branch.id,
        "name": branch.name,
        "code": branch.code or "",
        "description": branch.description or "",
        "location": branch.location or "",
        "state": getattr(branch, "state", None) or "",
        "pincode": getattr(branch, "pincode", None) or "",
        "latitude": branch.latitude,
        "longitude": branch.longitude,
        "geofenceRadius": branch.geofence_radius,
        "companyId": branch.company_id,
        "organizationId": branch.organization_id,
        "status": branch.status or "active",
    }


@router.post("/branches", response_model=dict)
def create_branch(
    branch_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        # Convert camelCase to snake_case for backend compatibility
        snake_case_data = convert_camel_to_snake(branch_data)

        # Coerce float fields - convert empty strings to None
        latitude = _coerce_float(snake_case_data.get("latitude"))
        longitude = _coerce_float(snake_case_data.get("longitude"))
        geofence_radius = _coerce_float(snake_case_data.get("geofence_radius"))
        if geofence_radius is None:
            geofence_radius = 100.0  # Default value

        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, _coerce_int(snake_case_data.get("company_id")), current_user.organization_id)

        branch = Branch(
            name=snake_case_data.get("name"),
            code=snake_case_data.get("code"),
            description=snake_case_data.get("description"),
            location=snake_case_data.get("location"),
            state=snake_case_data.get("state"),
            pincode=snake_case_data.get("pincode"),
            latitude=latitude,
            longitude=longitude,
            geofence_radius=geofence_radius,
            company_id=_coerce_int(snake_case_data.get("company_id")),
            organization_id=current_user.organization_id,
            status=snake_case_data.get("status", "active"),
        )
        db.add(branch)
        db.commit()
        db.refresh(branch)

        # Log activity
        client_info = get_client_info(request)
        log_activity(
            db=db,
            user_id=current_user.id,
            module="Company",
            action="create",
            entity_type="branch",
            entity_id=branch.id,
            entity_name=branch.name,
            new_value=f"Created branch: {branch.name}",
            ip_address=client_info["ip_address"],
            mac_address=client_info["mac_address"],
            device_info=client_info["device_info"],
            user_agent=client_info["user_agent"],
        )

        return {"message": "Branch created successfully", "id": branch.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"Error creating branch: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create branch: {error_msg}")


@router.put("/branches/{branch_id}", response_model=dict)
def update_branch(
    branch_id: int,
    branch_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = db.query(Branch).filter(Branch.id == branch_id, Branch.organization_id == current_user.organization_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    # Store old values for logging
    old_values = {
        "name": branch.name,
        "code": branch.code,
        "status": branch.status,
    }
    
    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(branch_data)
    
    if "name" in snake_case_data:
        branch.name = snake_case_data["name"]
    if "code" in snake_case_data:
        branch.code = snake_case_data["code"]
    if "description" in snake_case_data:
        branch.description = snake_case_data["description"]
    if "location" in snake_case_data:
        branch.location = snake_case_data["location"]
    if "state" in snake_case_data:
        branch.state = snake_case_data["state"]
    if "pincode" in snake_case_data:
        branch.pincode = snake_case_data["pincode"]
    if "latitude" in snake_case_data:
        branch.latitude = _coerce_float(snake_case_data["latitude"])
    if "longitude" in snake_case_data:
        branch.longitude = _coerce_float(snake_case_data["longitude"])
    if "geofence_radius" in snake_case_data:
        branch.geofence_radius = _coerce_float(snake_case_data["geofence_radius"])
    if "company_id" in snake_case_data:
        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, _coerce_int(snake_case_data["company_id"]), current_user.organization_id)
        branch.company_id = _coerce_int(snake_case_data["company_id"])
    if "organization_id" in snake_case_data:
        branch.organization_id = (current_user.organization_id if current_user.role != "superadmin" else snake_case_data["organization_id"])
    if "status" in snake_case_data:
        branch.status = snake_case_data["status"]
    
    branch.updated_at = ist_now_naive()
    db.commit()
    db.refresh(branch)

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="edit",
        entity_type="branch",
        entity_id=branch_id,
        entity_name=branch.name,
        old_value=str(old_values),
        new_value=str(snake_case_data),
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Branch updated successfully", "id": branch.id}


@router.delete("/branches/{branch_id}", response_model=dict)
def delete_branch(
    branch_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = db.query(Branch).filter(Branch.id == branch_id, Branch.organization_id == current_user.organization_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    branch_name = branch.name
    db.delete(branch)
    db.commit()

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="delete",
        entity_type="branch",
        entity_id=branch_id,
        entity_name=branch_name,
        new_value=f"Deleted branch: {branch_name}",
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Branch deleted successfully"}


@router.patch("/branches/{branch_id}", response_model=dict)
def toggle_branch_status(
    branch_id: int,
    status_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle branch status (active/inactive)"""
    branch = db.query(Branch).filter(Branch.id == branch_id, Branch.organization_id == current_user.organization_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    old_status = branch.status
    new_status = status_data.get("status", old_status)
    branch.status = new_status
    branch.updated_at = ist_now_naive()
    db.commit()
    db.refresh(branch)

    # Log activity
    client_info = get_client_info(request)
    action = "toggle_active" if new_status == "active" else "toggle_inactive"
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action=action,
        entity_type="branch",
        entity_id=branch_id,
        entity_name=branch.name,
        old_value=old_status,
        new_value=new_status,
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": f"Branch status updated to {new_status}", "status": new_status}


# ============ DESIGNATIONS ============

@router.get("/designations", response_model=list[dict])
def get_designations(
    departmentId: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Designation).filter(Designation.organization_id == current_user.organization_id)
    if departmentId:
        query = query.filter(Designation.department_id == departmentId)
    companyId = resolve_company_scope(db, current_user, companyId)
    if companyId:
        query = query.filter(Designation.company_id == companyId)
    designations = query.limit(100).all()  # Limit for performance
    return [
        {
            "id": desig.id,
            "title": desig.title or "",
            "code": desig.code or "",
            "grade": desig.grade or "",
            "description": desig.description or "",
            "minSalary": desig.min_salary,
            "maxSalary": desig.max_salary,
            "companyId": desig.company_id,
            "status": desig.status or "active",
            "createdAt": desig.created_at.isoformat() if desig.created_at else None,
        }
        for desig in designations
    ]


@router.get("/designations/count", response_model=int)
def get_designations_count(
    departmentId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Designation).filter(Designation.organization_id == current_user.organization_id)
    if departmentId:
        query = query.filter(Designation.department_id == departmentId)
    _dg_scope = resolve_company_scope(db, current_user, None)
    if _dg_scope is not None:
        query = query.filter(Designation.company_id == _dg_scope)
    return query.count()


@router.post("/designations", response_model=dict)
def create_designation(
    designation_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        # Convert camelCase to snake_case for backend compatibility
        snake_case_data = convert_camel_to_snake(designation_data)

        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, _coerce_int(snake_case_data.get("company_id")), current_user.organization_id)

        designation = Designation(
            code=snake_case_data.get("code"),
            title=snake_case_data.get("title"),
            grade=snake_case_data.get("grade"),
            description=snake_case_data.get("description"),
            min_salary=_coerce_float(snake_case_data.get("min_salary")),
            max_salary=_coerce_float(snake_case_data.get("max_salary")),
            company_id=_coerce_int(snake_case_data.get("company_id")),
            organization_id=current_user.organization_id,
            status=snake_case_data.get("status", "active"),
        )
        db.add(designation)
        db.commit()
        db.refresh(designation)

        # Log activity
        client_info = get_client_info(request)
        log_activity(
            db=db,
            user_id=current_user.id,
            module="Company",
            action="create",
            entity_type="designation",
            entity_id=designation.id,
            entity_name=designation.title,
            new_value=f"Created designation: {designation.title}",
            ip_address=client_info["ip_address"],
            mac_address=client_info["mac_address"],
            device_info=client_info["device_info"],
            user_agent=client_info["user_agent"],
        )

        return {"message": "Designation created successfully", "id": designation.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        print(f"Error creating designation: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create designation: {error_msg}")


@router.put("/designations/{desig_id}", response_model=dict)
def update_designation(
    desig_id: int,
    desig_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    designation = db.query(Designation).filter(Designation.id == desig_id, Designation.organization_id == current_user.organization_id).first()
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    
    # Store old values for logging
    old_values = {
        "title": designation.title,
        "code": designation.code,
        "status": designation.status,
    }
    
    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(desig_data)
    
    if "title" in snake_case_data:
        designation.title = snake_case_data["title"]
    if "code" in snake_case_data:
        designation.code = snake_case_data["code"]
    if "status" in snake_case_data:
        designation.status = snake_case_data["status"]
    if "grade" in snake_case_data:
        designation.grade = snake_case_data["grade"]
    if "description" in snake_case_data:
        designation.description = snake_case_data["description"]
    if "min_salary" in snake_case_data:
        designation.min_salary = _coerce_float(snake_case_data["min_salary"])
    if "max_salary" in snake_case_data:
        designation.max_salary = _coerce_float(snake_case_data["max_salary"])
    if "company_id" in snake_case_data:
        if current_user.role != "superadmin":
            validate_company_in_org(db, Company, _coerce_int(snake_case_data["company_id"]), current_user.organization_id)
        designation.company_id = _coerce_int(snake_case_data["company_id"])
    if "organization_id" in snake_case_data:
        designation.organization_id = (current_user.organization_id if current_user.role != "superadmin" else snake_case_data["organization_id"])
    
    designation.updated_at = ist_now_naive()
    db.commit()
    db.refresh(designation)

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="edit",
        entity_type="designation",
        entity_id=desig_id,
        entity_name=designation.title,
        old_value=str(old_values),
        new_value=str(snake_case_data),
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Designation updated successfully", "id": designation.id}


@router.delete("/designations/{desig_id}", response_model=dict)
def delete_designation(
    desig_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    designation = db.query(Designation).filter(Designation.id == desig_id, Designation.organization_id == current_user.organization_id).first()
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    
    designation_title = designation.title
    db.delete(designation)
    db.commit()

    # Log activity
    client_info = get_client_info(request)
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action="delete",
        entity_type="designation",
        entity_id=desig_id,
        entity_name=designation_title,
        new_value=f"Deleted designation: {designation_title}",
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": "Designation deleted successfully"}


@router.patch("/designations/{desig_id}", response_model=dict)
def toggle_designation_status(
    desig_id: int,
    status_data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle designation status (active/inactive)"""
    designation = db.query(Designation).filter(Designation.id == desig_id, Designation.organization_id == current_user.organization_id).first()
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    
    old_status = designation.status
    new_status = status_data.get("status", old_status)
    designation.status = new_status
    designation.updated_at = ist_now_naive()
    db.commit()
    db.refresh(designation)

    # Log activity
    client_info = get_client_info(request)
    action = "toggle_active" if new_status == "active" else "toggle_inactive"
    log_activity(
        db=db,
        user_id=current_user.id,
        module="Company",
        action=action,
        entity_type="designation",
        entity_id=desig_id,
        entity_name=designation.title,
        old_value=old_status,
        new_value=new_status,
        ip_address=client_info["ip_address"],
        mac_address=client_info["mac_address"],
        device_info=client_info["device_info"],
        user_agent=client_info["user_agent"],
    )

    return {"message": f"Designation status updated to {new_status}", "status": new_status}


# ============ ORGANIZATIONS ============

@router.get("/organizations/{org_id}", response_model=dict)
def get_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if current_user.role != "superadmin" and int(org.id) != int(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "id": org.id,
        "name": org.name,
        "code": org.code,
        "legal_name": org.legal_name,
        "email": org.email,
        "phone": org.phone,
        "website": org.website,
        "address": org.address,
        "status": org.status,
        "industry": org.industry,
        "company_size": org.company_size,
        "registered_state": org.registered_state,
        "registered_city": org.registered_city,
        "logo_url": org.logo_url or "",
        "country": getattr(org, "country", None) or "India",
        "pan_no": getattr(org, "pan_no", None),
        "tan_no": getattr(org, "tan_no", None),
        "gst_no": getattr(org, "gst_no", None),
    }


@router.get("/organizations", response_model=list[dict])
def list_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orgs = db.query(Organization).filter(
        Organization.deleted_at.is_(None)
    )
    if current_user.role != "superadmin":
        orgs = orgs.filter(Organization.id == current_user.organization_id)
    orgs = orgs.all()
    return [
        {
            "id": o.id,
            "name": o.name,
            "code": o.code,
            "email": o.email,
            "status": o.status,
            "industry": o.industry,
            "company_size": o.company_size,
            "registered_state": o.registered_state,
            "registered_city": o.registered_city,
            "logo_url": o.logo_url or "",
        }
        for o in orgs
    ]


@router.put("/organizations/{org_id}", response_model=dict)
def update_organization(
    org_id: int,
    org_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if current_user.role != "superadmin" and int(org.id) != int(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Organization not found")
    
    if "name" in org_data:
        org.name = org_data["name"]
    if "code" in org_data:
        org.code = org_data["code"]
    if "status" in org_data:
        org.status = org_data["status"]
    if "description" in org_data:
        org.description = org_data["description"]
    if "address" in org_data:
        org.address = org_data["address"]
    if "phone" in org_data:
        org.phone = org_data["phone"]
    if "email" in org_data:
        org.email = org_data["email"]
    if "website" in org_data:
        org.website = org_data["website"]
    if "logo_url" in org_data:
        org.logo_url = org_data["logo_url"]
    if "country" in org_data:
        org.country = org_data["country"]
    if "tan_no" in org_data:
        org.tan_no = org_data["tan_no"]
    if "pan_no" in org_data:
        org.pan_no = org_data["pan_no"]
    if "gst_no" in org_data:
        org.gst_no = org_data["gst_no"]
    # Deep-merge settings (e.g. payroll.tax_exemptions) so unrelated keys survive
    if "settings" in org_data and org_data["settings"] is not None:
        new_settings = org_data["settings"]
        if isinstance(new_settings, dict):
            current = org.settings or {}
            if not isinstance(current, dict):
                current = {}
            for k, v in new_settings.items():
                if isinstance(v, dict) and isinstance(current.get(k), dict):
                    current[k] = {**current[k], **v}
                else:
                    current[k] = v
            org.settings = current
    org.updated_at = ist_now_naive()
    
    db.commit()
    db.refresh(org)
    return {"message": "Organization updated successfully", "id": org.id}


@router.post("/organizations/{org_id}/logo", response_model=dict)
def upload_org_logo(
    org_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an organisation logo. Returns a public URL for use in documents/PDFs."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if current_user.role != "superadmin" and int(org.id) != int(current_user.organization_id):
        raise HTTPException(status_code=404, detail="Organization not found")

    import os
    import uuid
    ext = os.path.splitext(file.filename or "")[1] or ".png"
    if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="Only image files (png/jpg/jpeg/webp/gif) are allowed")

    upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", "logos")
    os.makedirs(upload_dir, exist_ok=True)
    fname = f"org_{org.id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(upload_dir, fname)
    content = file.file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Public URL
    public_url = f"/uploads/logos/{fname}"
    org.logo_url = public_url
    db.commit()

    return {"message": "Logo uploaded", "logo_url": public_url}


@router.delete("/organizations/{org_id}", response_model=dict, dependencies=[Depends(check_role(["superadmin"]))])
def delete_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    db.delete(org)
    db.commit()
    return {"message": "Organization deleted successfully"}


# ============ BULK UPLOAD/DOWNLOAD ENDPOINTS ============

@router.get("/departments/template")
def download_department_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["department_name", "code", "company_id", "status"])
    writer.writerow(["Engineering", "ENG", "1", "active"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=department_bulk_upload_template.csv"},
    )


@router.get("/departments/export")
def export_departments(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Department).filter(Department.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(Department.company_id == companyId)
    departments = query.all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "code", "description", "companyId", "managerId", "status"])
    for dept in departments:
        writer.writerow([
            dept.name,
            dept.code or "",
            dept.description or "",
            dept.company_id or "",
            dept.manager_id or "",
            dept.status or "active"
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=departments_export.csv"},
    )


@router.post("/departments/bulk-upload")
def bulk_upload_departments(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx/.xls) files are supported")
    
    content = file.file.read()
    if file.filename.endswith(".csv"):
        decoded = content.decode("utf-8")
        df = pd.read_csv(io.StringIO(decoded))
    else:
        df = pd.read_excel(io.BytesIO(content))
    df.columns = df.columns.str.strip().str.lower()
    
    # Validate required columns for departments (only mandatory fields)
    required_columns = {"department_name", "code"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise HTTPException(status_code=400, detail=f"Missing required columns for departments: {', '.join(missing_columns)}. Please download the correct template for departments.")
    
    created = 0
    updated = 0
    errors = []
    
    for row_num, row in df.iterrows():
        try:
            name = str(row.get("department_name", "")).strip()
            code = str(row.get("code", "")).strip()
            
            if not name:
                errors.append({"row": row_num + 2, "error": "name is required"})
                continue
            if not code:
                errors.append({"row": row_num + 2, "error": "code is required"})
                continue

            if current_user.role == "superadmin":
                effective_org = int(row["organization_id"]) if pd.notna(row.get("organization_id")) else current_user.organization_id
            else:
                effective_org = current_user.organization_id
            if current_user.role != "superadmin" and pd.notna(row.get("company_id")):
                validate_company_in_org(db, Company, int(row["company_id"]), current_user.organization_id)

            existing_q = db.query(Department).filter(Department.code == code)
            if current_user.role != "superadmin":
                existing_q = existing_q.filter(Department.organization_id == current_user.organization_id)
            existing = existing_q.first()
            if existing:
                existing.name = name
                existing.description = str(row.get("description", "")) if pd.notna(row.get("description")) else existing.description
                existing.organization_id = effective_org
                existing.company_id = int(row["company_id"]) if pd.notna(row.get("company_id")) else existing.company_id
                existing.manager_id = int(row["manager_id"]) if pd.notna(row.get("manager_id")) else existing.manager_id
                existing.status = str(row.get("status", "active")) if pd.notna(row.get("status")) else existing.status
                existing.updated_at = ist_now_naive()
                updated += 1
            else:
                dept = Department(
                    name=name,
                    code=code,
                    description=str(row.get("description", "")) if pd.notna(row.get("description")) else "",
                    organization_id=effective_org,
                    company_id=int(row["company_id"]) if pd.notna(row.get("company_id")) else None,
                    manager_id=int(row["manager_id"]) if pd.notna(row.get("manager_id")) else None,
                    status=str(row.get("status", "active")) if pd.notna(row.get("status")) else "active",
                )
                db.add(dept)
                created += 1
        except Exception as e:
            errors.append({"row": row_num + 2, "error": str(e)})
    
    db.commit()
    return {"message": "Bulk upload completed", "created": created, "updated": updated, "errors": errors}


@router.get("/companies/template")
def download_company_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["company_name", "code", "status"])
    writer.writerow(["Acme Corp", "ACME", "active"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=company_bulk_upload_template.csv"},
    )


@router.get("/companies/export")
def export_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    companies = db.query(Company)
    if current_user.role != "superadmin":
        companies = companies.filter(Company.organization_id == current_user.organization_id)
    companies = companies.all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "code", "description", "registrationNumber", "taxId", "address", "organizationId", "status"])
    for company in companies:
        writer.writerow([
            company.name,
            company.code or "",
            company.description or "",
            company.registration_number or "",
            company.tax_id or "",
            company.address or "",
            company.organization_id or "",
            company.status or "active"
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=companies_export.csv"},
    )


@router.post("/companies/bulk-upload")
def bulk_upload_companies(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx/.xls) files are supported")
    
    content = file.file.read()
    if file.filename.endswith(".csv"):
        decoded = content.decode("utf-8")
        df = pd.read_csv(io.StringIO(decoded))
    else:
        df = pd.read_excel(io.BytesIO(content))
    df.columns = df.columns.str.strip().str.lower()
    
    # Validate required columns for companies (only mandatory fields)
    required_columns = {"company_name", "code"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise HTTPException(status_code=400, detail=f"Missing required columns for companies: {', '.join(missing_columns)}. Please download the correct template for companies.")
    
    created = 0
    updated = 0
    errors = []
    
    for row_num, row in df.iterrows():
        try:
            name = str(row.get("company_name", "")).strip()
            code = str(row.get("code", "")).strip()
            
            if not name:
                errors.append({"row": row_num + 2, "error": "name is required"})
                continue
            if not code:
                errors.append({"row": row_num + 2, "error": "code is required"})
                continue

            if current_user.role == "superadmin":
                effective_org = int(row["organization_id"]) if pd.notna(row.get("organization_id")) else current_user.organization_id
            else:
                effective_org = current_user.organization_id

            existing_q = db.query(Company).filter(Company.code == code)
            if current_user.role != "superadmin":
                existing_q = existing_q.filter(Company.organization_id == current_user.organization_id)
            existing = existing_q.first()
            if existing:
                existing.name = name
                existing.description = str(row.get("description", "")) if pd.notna(row.get("description")) else existing.description
                existing.registration_number = str(row.get("registration_number", "")) if pd.notna(row.get("registration_number")) else existing.registration_number
                existing.tax_id = str(row.get("tax_id", "")) if pd.notna(row.get("tax_id")) else existing.tax_id
                existing.industry = str(row.get("industry", "")) if pd.notna(row.get("industry")) else existing.industry
                existing.company_size = str(row.get("company_size", "")) if pd.notna(row.get("company_size")) else existing.company_size
                existing.address = str(row.get("address", "")) if pd.notna(row.get("address")) else existing.address
                existing.website = str(row.get("website", "")) if pd.notna(row.get("website")) else existing.website
                existing.email = str(row.get("email", "")) if pd.notna(row.get("email")) else existing.email
                existing.phone = str(row.get("phone", "")) if pd.notna(row.get("phone")) else existing.phone
                existing.logo = str(row.get("logo", "")) if pd.notna(row.get("logo")) else existing.logo
                existing.organization_id = effective_org
                existing.status = str(row.get("status", "active")) if pd.notna(row.get("status")) else existing.status
                existing.updated_at = ist_now_naive()
                updated += 1
            else:
                company = Company(
                    name=name,
                    code=code,
                    description=str(row.get("description", "")) if pd.notna(row.get("description")) else "",
                    registration_number=str(row.get("registration_number", "")) if pd.notna(row.get("registration_number")) else "",
                    tax_id=str(row.get("tax_id", "")) if pd.notna(row.get("tax_id")) else "",
                    industry=str(row.get("industry", "")) if pd.notna(row.get("industry")) else "",
                    company_size=str(row.get("company_size", "")) if pd.notna(row.get("company_size")) else "",
                    address=str(row.get("address", "")) if pd.notna(row.get("address")) else "",
                    website=str(row.get("website", "")) if pd.notna(row.get("website")) else "",
                    email=str(row.get("email", "")) if pd.notna(row.get("email")) else "",
                    phone=str(row.get("phone", "")) if pd.notna(row.get("phone")) else "",
                    logo=str(row.get("logo", "")) if pd.notna(row.get("logo")) else "",
                    organization_id=effective_org,
                    status=str(row.get("status", "active")) if pd.notna(row.get("status")) else "active",
                )
                db.add(company)
                created += 1
        except Exception as e:
            errors.append({"row": row_num + 2, "error": str(e)})
    
    db.commit()
    return {"message": "Bulk upload completed", "created": created, "updated": updated, "errors": errors}


@router.post("/branches/bulk-upload")
def bulk_upload_branches(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx/.xls) files are supported")
    
    content = file.file.read()
    if file.filename.endswith(".csv"):
        decoded = content.decode("utf-8")
        df = pd.read_csv(io.StringIO(decoded))
    else:
        df = pd.read_excel(io.BytesIO(content))
    df.columns = df.columns.str.strip().str.lower()
    
    # Validate required columns for branches (only mandatory fields)
    required_columns = {"branch_name", "code"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise HTTPException(status_code=400, detail=f"Missing required columns for branches: {', '.join(missing_columns)}. Please download the correct template for branches.")
    
    created = 0
    updated = 0
    errors = []
    
    for row_num, row in df.iterrows():
        try:
            name = str(row.get("branch_name", "")).strip()
            code = str(row.get("code", "")).strip()
            
            if not name:
                errors.append({"row": row_num + 2, "error": "name is required"})
                continue
            if not code:
                errors.append({"row": row_num + 2, "error": "code is required"})
                continue

            if current_user.role == "superadmin":
                effective_org = int(row["organization_id"]) if pd.notna(row.get("organization_id")) else current_user.organization_id
            else:
                effective_org = current_user.organization_id
            if current_user.role != "superadmin" and pd.notna(row.get("company_id")):
                validate_company_in_org(db, Company, int(row["company_id"]), current_user.organization_id)

            existing_q = db.query(Branch).filter(Branch.name == name)
            if current_user.role != "superadmin":
                existing_q = existing_q.filter(Branch.organization_id == current_user.organization_id)
            existing = existing_q.first()
            if existing:
                existing.code = code
                existing.description = str(row.get("description", "")) if pd.notna(row.get("description")) else existing.description
                existing.location = str(row.get("location", "")) if pd.notna(row.get("location")) else existing.location
                existing.latitude = float(row["latitude"]) if pd.notna(row.get("latitude")) else existing.latitude
                existing.longitude = float(row["longitude"]) if pd.notna(row.get("longitude")) else existing.longitude
                existing.geofence_radius = float(row.get("geofence_radius", 100.0)) if pd.notna(row.get("geofence_radius")) else existing.geofence_radius
                existing.company_id = int(row["company_id"]) if pd.notna(row.get("company_id")) else existing.company_id
                existing.organization_id = effective_org
                existing.status = str(row.get("status", "active")) if pd.notna(row.get("status")) else existing.status
                existing.updated_at = ist_now_naive()
                updated += 1
            else:
                branch = Branch(
                    name=name,
                    code=code,
                    description=str(row.get("description", "")) if pd.notna(row.get("description")) else "",
                    location=str(row.get("location", "")) if pd.notna(row.get("location")) else "",
                    latitude=float(row["latitude"]) if pd.notna(row.get("latitude")) else None,
                    longitude=float(row["longitude"]) if pd.notna(row.get("longitude")) else None,
                    geofence_radius=float(row.get("geofence_radius", 100.0)) if pd.notna(row.get("geofence_radius")) else 100.0,
                    company_id=int(row["company_id"]) if pd.notna(row.get("company_id")) else None,
                    organization_id=effective_org,
                    status=str(row.get("status", "active")) if pd.notna(row.get("status")) else "active",
                )
                db.add(branch)
                created += 1
        except Exception as e:
            errors.append({"row": row_num + 2, "error": str(e)})
    
    db.commit()
    return {"message": "Bulk upload completed", "created": created, "updated": updated, "errors": errors}


@router.get("/designations/template")
def download_designation_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["designation_title", "code", "grade", "company_id", "status"])
    writer.writerow(["Software Engineer", "SE", "Grade A", "1", "active"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=designation_bulk_upload_template.csv"},
    )


@router.get("/designations/export")
def export_designations(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Designation).filter(Designation.organization_id == current_user.organization_id)
    if companyId:
        query = query.filter(Designation.company_id == companyId)
    designations = query.all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["title", "code", "grade", "description", "minSalary", "maxSalary", "companyId", "organizationId", "status"])
    for designation in designations:
        writer.writerow([
            designation.title,
            designation.code or "",
            designation.grade or "",
            designation.description or "",
            designation.min_salary or "",
            designation.max_salary or "",
            designation.company_id or "",
            designation.organization_id or "",
            designation.status or "active"
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=designations_export.csv"},
    )


@router.post("/designations/bulk-upload")
def bulk_upload_designations(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx/.xls) files are supported")
    
    content = file.file.read()
    if file.filename.endswith(".csv"):
        decoded = content.decode("utf-8")
        df = pd.read_csv(io.StringIO(decoded))
    else:
        df = pd.read_excel(io.BytesIO(content))
    df.columns = df.columns.str.strip().str.lower()
    
    # Validate required columns for designations (only mandatory fields)
    required_columns = {"designation_title", "code"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise HTTPException(status_code=400, detail=f"Missing required columns for designations: {', '.join(missing_columns)}. Please download the correct template for designations.")
    
    created = 0
    updated = 0
    errors = []
    
    for row_num, row in df.iterrows():
        try:
            title = str(row.get("designation_title", "")).strip()
            code = str(row.get("code", "")).strip()
            
            if not title:
                errors.append({"row": row_num + 2, "error": "title is required"})
                continue
            if not code:
                errors.append({"row": row_num + 2, "error": "code is required"})
                continue

            if current_user.role == "superadmin":
                effective_org = int(row["organization_id"]) if pd.notna(row.get("organization_id")) else current_user.organization_id
            else:
                effective_org = current_user.organization_id
            if current_user.role != "superadmin" and pd.notna(row.get("company_id")):
                validate_company_in_org(db, Company, int(row["company_id"]), current_user.organization_id)

            existing_q = db.query(Designation).filter(Designation.code == code)
            if current_user.role != "superadmin":
                existing_q = existing_q.filter(Designation.organization_id == current_user.organization_id)
            existing = existing_q.first()
            if existing:
                existing.title = title
                existing.grade = str(row.get("grade", "")) if pd.notna(row.get("grade")) else existing.grade
                existing.description = str(row.get("description", "")) if pd.notna(row.get("description")) else existing.description
                existing.min_salary = float(row.get("min_salary")) if pd.notna(row.get("min_salary")) else existing.min_salary
                existing.max_salary = float(row.get("max_salary")) if pd.notna(row.get("max_salary")) else existing.max_salary
                existing.company_id = int(row["company_id"]) if pd.notna(row.get("company_id")) else existing.company_id
                existing.organization_id = effective_org
                existing.status = str(row.get("status", "active")) if pd.notna(row.get("status")) else existing.status
                existing.updated_at = ist_now_naive()
                updated += 1
            else:
                designation = Designation(
                    code=code,
                    title=title,
                    grade=str(row.get("grade", "")) if pd.notna(row.get("grade")) else "",
                    description=str(row.get("description", "")) if pd.notna(row.get("description")) else "",
                    min_salary=float(row.get("min_salary")) if pd.notna(row.get("min_salary")) else None,
                    max_salary=float(row.get("max_salary")) if pd.notna(row.get("max_salary")) else None,
                    company_id=int(row["company_id"]) if pd.notna(row.get("company_id")) else None,
                    organization_id=effective_org,
                    status=str(row.get("status", "active")) if pd.notna(row.get("status")) else "active",
                )
                db.add(designation)
                created += 1
        except Exception as e:
            errors.append({"row": row_num + 2, "error": str(e)})
    
    db.commit()
    return {"message": "Bulk upload completed", "created": created, "updated": updated, "errors": errors}

