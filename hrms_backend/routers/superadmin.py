"""
SuperAdmin API Router
Multi-tenant SaaS management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, File, UploadFile
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_
from typing import List, Optional
from pydantic import BaseModel
import re
from datetime import datetime, timedelta
import redis
try:
    import psutil
except ImportError:
    psutil = None
import socket

from database import get_db, SessionLocal
from models import User, Organization, Plan, Subscription, FeatureFlag, SystemHealthLog, ModulePermission, AuditLog
from schemas.superadmin import (
    PlanCreate, PlanUpdate, PlanResponse,
    TenantCreate, TenantUpdate, TenantResponse,
    PermissionCreate, PermissionUpdate, PermissionMatrix,
    FeatureFlagCreate, FeatureFlagUpdate, FeatureFlagResponse,
    AuditLogResponse, AuditLogFilter,
    SystemHealthResponse, HealthStatus,
    ImpersonateRequest, ImpersonateResponse,
    SuperAdminDashboardStats
)
from core.auth import get_password_hash, verify_password, create_access_token, get_current_user
from services.email_service import EmailService
from services.notification_templates import tenant_approved_email, tenant_rejected_email

router = APIRouter(tags=["SuperAdmin"])

import os
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
except Exception as exc:
    redis_client = None


# ============== AUTHENTICATION ==============

def require_superadmin(current_user: User = Depends(get_current_user)):
    """Verify user is superadmin"""
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required"
        )
    return current_user


# ============== ORGANIZATION MANAGEMENT ==============

@router.post("/tenants", response_model=dict)
def create_tenant(
    data: TenantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Create new tenant with admin user"""
    
    # Check if email already exists
    if db.query(User).filter(User.email == data.admin_email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check if phone already exists (if provided)
    admin_phone = data.admin_phone if data.admin_phone and data.admin_phone.strip() else None
    if admin_phone and db.query(User).filter(User.phone == admin_phone).first():
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Create organization
    company_code = data.company_code if data.company_code and data.company_code.strip() else None
    domain = data.domain if data.domain and data.domain.strip() else None
    
    org = Organization(
        name=data.company_name,
        code=company_code,
        email=data.admin_email,
        status="active",
        domain=domain,
        industry=data.industry,
        company_size=data.company_size,
        legal_name=data.legal_name,
        gst_no=data.gst_no,
        pan_no=data.pan_no,
        tan_no=data.tan_no,
        registration_no=data.registration_no,
        tin_no=data.tin_no,
        data_retention_policy=data.data_retention_policy,
        audit_logging_enabled=data.audit_logging_enabled,
        device_verification_enabled=data.device_verification_enabled,
        default_currency=data.default_currency,
        timezone=data.timezone,
        date_format=data.date_format,
        language_preference=data.language_preference,
        logo_url=data.logo_url
    )
    db.add(org)
    db.flush()
    
    # Create admin user
    admin = User(
        email=data.admin_email,
        full_name=data.admin_name,
        password_hash=get_password_hash(data.password),
        role="admin",
        organization_id=org.id,
        is_active=True,
        phone=admin_phone
    )
    db.add(admin)
    db.flush()
    
    # Assign plan (default to free if not specified)
    plan_id = data.plan_id or 1
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        plan = db.query(Plan).filter(Plan.name == "free").first()
        if not plan:
            # Create default free plan
            plan = Plan(
                name="free",
                display_name="Free",
                max_employees=10,
                features=["basic_employees", "basic_attendance"]
            )
            db.add(plan)
            db.flush()
    
    subscription = Subscription(
        organization_id=org.id,
        plan_id=plan.id,
        status="trial",
        trial_ends_at=datetime.utcnow() + timedelta(days=14)
    )
    db.add(subscription)
    
    # Seed default permissions for admin
    modules_to_seed = data.modules if data.modules is not None else [
        "employees", "attendance", "leave", "payroll", 
        "recruitment", "performance", "expenses"
    ]
    for module in modules_to_seed:
        perm = ModulePermission(
            user_id=admin.id,
            module=module,
            can_read=True,
            can_write=True,
            can_delete=True
        )
        db.add(perm)
    
    # Log action
    log = AuditLog(
        user_id=current_user.id,
        action="CREATE_TENANT",
        module="superadmin",
        entity_type="Organization",
        entity_id=org.id,
        new_values={"company_name": data.company_name, "admin_email": data.admin_email}
    )
    db.add(log)
    
    db.commit()
    
    return {
        "message": "Tenant created successfully",
        "tenant_id": org.id,
        "admin_id": admin.id,
        "trial_ends": subscription.trial_ends_at
    }


@router.get("/tenants", response_model=List[TenantResponse])
def list_tenants(
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """List all tenants with filters"""
    
    query = db.query(Organization).outerjoin(
        Subscription, Organization.id == Subscription.organization_id
    ).outerjoin(
        Plan, Subscription.plan_id == Plan.id
    ).options(
        joinedload(Organization.subscription).joinedload(Subscription.plan)
    )
    
    if status:
        query = query.filter(Organization.status == status)
    
    if search:
        query = query.filter(
            or_(
                Organization.name.ilike(f"%{search}%"),
                Organization.email.ilike(f"%{search}%")
            )
        )
    
    orgs = query.all()
    
    # Get employee counts
    result = []
    for org in orgs:
        emp_count = db.query(func.count(User.id)).filter(
            User.organization_id == org.id
        ).scalar()
        
        # Get last login
        last_login = db.query(func.max(User.last_login)).filter(
            User.organization_id == org.id
        ).scalar()
        
        plan_name = org.subscription.plan.display_name if org.subscription and org.subscription.plan else "Unknown"
        max_emp = org.subscription.plan.max_employees if org.subscription and org.subscription.plan else 10
        
        admin_user = db.query(User).filter(User.organization_id == org.id, User.role == 'admin').first()
        org_modules = []
        if admin_user:
            org_modules = [m.module for m in db.query(ModulePermission).filter(ModulePermission.user_id == admin_user.id).all()]

        result.append({
            "id": org.id,
            "subscription_id": org.subscription.id if org.subscription else None,
            "company_name": org.name,
            "company_code": getattr(org, 'company_code', None),
            "domain": getattr(org, 'domain', None),
            "industry": getattr(org, 'industry', None),
            "company_size": getattr(org, 'company_size', None),
            "email": org.email,
            "status": org.status,
            "plan_name": plan_name,
            "max_employees": max_emp,
            "employee_count": emp_count,
            "created_at": org.created_at,
            "last_login": last_login,
            "logo_url": getattr(org, 'logo_url', None),
            "legal_name": getattr(org, 'legal_name', None),
            "gst_no": getattr(org, 'gst_no', None),
            "pan_no": getattr(org, 'pan_no', None),
            "registration_no": getattr(org, 'registration_no', None),
            "tin_no": getattr(org, 'tin_no', None),
            "data_retention_policy": getattr(org, 'data_retention_policy', None),
            "audit_logging_enabled": getattr(org, 'audit_logging_enabled', None),
            "device_verification_enabled": getattr(org, 'device_verification_enabled', None),
            "default_currency": getattr(org, 'default_currency', None),
            "timezone": getattr(org, 'timezone', None),
            "date_format": getattr(org, 'date_format', None),
            "language_preference": getattr(org, 'language_preference', None),
            "modules": org_modules
        })
    
    return result

@router.patch("/tenants/{organization_id}/suspend")
def suspend_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Suspend an organization"""
    return update_tenant_status(organization_id, "suspended", db, current_user)

@router.patch("/tenants/{organization_id}/activate")
def activate_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Activate an organization"""
    return update_tenant_status(organization_id, "active", db, current_user)


@router.patch("/tenants/{organization_id}/status")
def update_tenant_status(
    organization_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update organization status (active/suspended/deleted)"""
    
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    org.status = status
    
    # Log action
    log = AuditLog(
        user_id=current_user.id,
        action=f"UPDATE_ORGANIZATION_STATUS_{status.upper()}",
        module="superadmin",
        entity_type="Organization",
        entity_id=organization_id,
        new_values={"status": status}
    )
    db.add(log)
    db.commit()
    
    return {"message": f"Organization status updated to {status}"}


@router.put("/tenants/{organization_id}", response_model=dict)
def update_organization(
    organization_id: int,
    data: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update organization details"""
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
        
    old_values = {"name": org.name, "email": org.email}
    new_values = {}
    
    if data.company_name:
        org.name = data.company_name
        new_values["name"] = data.company_name
        
    for field in [
        'company_code', 'domain', 'industry', 'company_size', 
        'logo_url', 'legal_name', 'gst_no', 'pan_no', 'registration_no', 'tin_no',
        'data_retention_policy', 'audit_logging_enabled', 'device_verification_enabled',
        'default_currency', 'timezone', 'date_format', 'language_preference'
    ]:
        val = getattr(data, field)
        if val is not None:
            setattr(org, field, val)
            new_values[field] = val

    if getattr(data, 'modules', None) is not None:
        admin_user = db.query(User).filter(User.organization_id == org.id, User.role == 'admin').first()
        if admin_user:
            db.query(ModulePermission).filter(ModulePermission.user_id == admin_user.id).delete()
            for mod in data.modules:
                db.add(ModulePermission(
                    user_id=admin_user.id,
                    module=mod,
                    can_read=True,
                    can_write=True,
                    can_delete=True,
                    granted_by=current_user.id
                ))
            new_values['modules'] = data.modules
            
    if data.admin_email:
        org.email = data.admin_email
        new_values["email"] = data.admin_email
        
        # Also update the admin user's email
        admin = db.query(User).filter(User.organization_id == organization_id, User.role == "admin").first()
        if admin:
            admin.email = data.admin_email
            if data.admin_name:
                admin.full_name = data.admin_name

    # Log action
    log = AuditLog(
        user_id=current_user.id,
        action="UPDATE_ORGANIZATION",
        module="superadmin",
        entity_type="Organization",
        entity_id=organization_id,
        old_values=old_values,
        new_values=new_values
    )
    db.add(log)
    db.commit()
    
    return {"message": "Organization updated successfully"}


@router.delete("/tenants/{organization_id}", response_model=dict)
def delete_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Soft delete organization and disable its users"""
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
        
    org.status = "deleted"
    
    # Disable all users in the organization
    users = db.query(User).filter(User.organization_id == organization_id).all()
    for u in users:
        u.is_active = False
        
    # Log action
    log = AuditLog(
        user_id=current_user.id,
        action="DELETE_ORGANIZATION",
        module="superadmin",
        entity_type="Organization",
        entity_id=organization_id,
        new_values={"status": "deleted"}
    )
    db.add(log)
    db.commit()
    
    return {"message": "Organization deleted successfully"}


# ============== PENDING TENANT APPROVAL FLOW ==============

@router.get("/pending-tenants", response_model=List[dict])
def list_pending_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    """List organisations pending approval"""
    orgs = (
        db.query(Organization)
        .filter(Organization.status == "pending", Organization.deleted_at.is_(None))
        .order_by(Organization.created_at.desc())
        .all()
    )
    result = []
    for org in orgs:
        admin = db.query(User).filter(User.organization_id == org.id, User.role == "admin").first()
        sub = db.query(Subscription).filter(Subscription.organization_id == org.id).first()
        result.append({
            "id": org.id,
            "company_name": org.name,
            "code": org.code,
            "email": org.email,
            "admin_name": admin.full_name if admin else None,
            "admin_email": admin.email if admin else None,
            "industry": org.industry,
            "company_size": org.company_size,
            "registered_state": org.registered_state,
            "plan_name": sub.plan.display_name if sub and sub.plan else "Free Trial",
            "created_at": org.created_at.isoformat() if org.created_at else None,
        })
    return result


@router.post("/approve-tenant/{org_id}", response_model=dict)
def approve_tenant(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    """Approve a pending organisation"""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    if org.status != "pending":
        raise HTTPException(status_code=400, detail=f"Organisation status is '{org.status}', not 'pending'")

    org.status = "active"
    log = AuditLog(
        user_id=current_user.id,
        action="APPROVE_TENANT",
        module="superadmin",
        entity_type="Organization",
        entity_id=org_id,
        new_values={"status": "active"},
    )
    db.add(log)
    db.commit()

    admin = db.query(User).filter(User.organization_id == org.id, User.role == "admin").first()
    login_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    if admin:
        email_svc = EmailService()
        email_svc.send_email(
            admin.email,
            "Your Organisation Has Been Approved",
            tenant_approved_email(org.name, admin.full_name or admin.email, login_url),
        )

    return {"message": "Organisation approved successfully", "organisation_id": org.id, "status": "active"}


@router.post("/reject-tenant/{org_id}", response_model=dict)
def reject_tenant(
    org_id: int,
    reason: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    """Reject a pending organisation"""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    if org.status != "pending":
        raise HTTPException(status_code=400, detail=f"Organisation status is '{org.status}', not 'pending'")

    org.status = "rejected"
    log = AuditLog(
        user_id=current_user.id,
        action="REJECT_TENANT",
        module="superadmin",
        entity_type="Organization",
        entity_id=org_id,
        new_values={"status": "rejected", "reason": reason},
    )
    db.add(log)
    db.commit()

    admin = db.query(User).filter(User.organization_id == org.id, User.role == "admin").first()
    if admin:
        email_svc = EmailService()
        email_svc.send_email(
            admin.email,
            "Registration Update",
            tenant_rejected_email(org.name, admin.full_name or admin.email, reason),
        )

    return {"message": "Organisation rejected", "organisation_id": org.id, "status": "rejected"}


# ============== IMPERSONATION ==============

@router.post("/impersonate", response_model=ImpersonateResponse)
def impersonate_user(
    request: ImpersonateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Generate impersonation token for any user"""
    
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "org": user.organization_id,
        "impersonated": True,
        "impersonated_by": current_user.id
    })
    
    # Log action
    log = AuditLog(
        user_id=current_user.id,
        action="IMPERSONATE_USER",
        module="superadmin",
        entity_type="User",
        entity_id=user.id,
        new_values={"impersonated_user_email": user.email}
    )
    db.add(log)
    db.commit()
    
    return {"access_token": token, "message": f"Impersonating {user.email}"}


# ============== PERMISSION MANAGEMENT ==============

@router.get("/permissions/{user_id}", response_model=PermissionMatrix)
def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get full permission matrix for a user"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    perms = db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id
    ).all()
    
    perm_dict = {}
    all_modules = [
        "employees", "attendance", "leave", "payroll",
        "recruitment", "performance", "expenses", "users"
    ]
    
    for module in all_modules:
        perm_dict[module] = {"can_read": False, "can_write": False, "can_delete": False}
    
    for p in perms:
        perm_dict[p.module] = {
            "can_read": p.can_read,
            "can_write": p.can_write,
            "can_delete": p.can_delete
        }
    
    return {
        "user_id": user_id,
        "user_name": user.full_name or user.email,
        "user_email": user.email,
        "permissions": perm_dict
    }


@router.post("/permissions/{user_id}")
def set_user_permissions(
    user_id: int,
    permissions: List[PermissionCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update permissions for a user"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete existing permissions
    db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id
    ).delete()
    
    # Add new permissions
    for perm in permissions:
        p = ModulePermission(
            user_id=user_id,
            module=perm.module,
            can_read=perm.can_read,
            can_write=perm.can_write,
            can_delete=perm.can_delete
        )
        db.add(p)
    
    # Log action
    log = AuditLog(
        user_id=current_user.id,
        action="UPDATE_PERMISSIONS",
        module="superadmin",
        entity_type="User",
        entity_id=user_id,
        new_values={"permissions": [p.dict() for p in permissions]}
    )
    db.add(log)
    db.commit()
    
    return {"message": "Permissions updated"}


# ============== BILLING & PLANS ==============

@router.get("/plans", response_model=List[PlanResponse])
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """List all subscription plans"""
    return db.query(Plan).all()


@router.post("/plans", response_model=PlanResponse)
def create_plan(
    plan: PlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Create new plan"""
    
    existing = db.query(Plan).filter(Plan.name == plan.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Plan name already exists")
    
    new_plan = Plan(**plan.dict())
    db.add(new_plan)
    
    log = AuditLog(
        user_id=current_user.id,
        action="CREATE_PLAN",
        module="billing",
        entity_type="Plan",
        new_values=plan.dict()
    )
    db.add(log)
    db.commit()
    db.refresh(new_plan)
    
    return new_plan


@router.put("/plans/{plan_id}", response_model=PlanResponse)
def update_plan(
    plan_id: int,
    plan: PlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update an existing plan."""
    db_plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if plan.name and plan.name != db_plan.name:
        existing = db.query(Plan).filter(Plan.name == plan.name, Plan.id != plan_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Plan name already exists")

    old_values = db_plan.dict() if hasattr(db_plan, 'dict') else {}
    for key, val in plan.dict(exclude_unset=True).items():
        setattr(db_plan, key, val)

    log = AuditLog(
        user_id=current_user.id,
        action="UPDATE_PLAN",
        module="billing",
        entity_type="Plan",
        entity_id=plan_id,
        old_values=old_values,
        new_values=plan.dict(exclude_unset=True)
    )
    db.add(log)
    db.commit()
    db.refresh(db_plan)
    return db_plan


@router.delete("/plans/{plan_id}", response_model=dict)
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Delete a plan. Plans in use by subscriptions are deactivated instead."""
    db_plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    in_use = db.query(Subscription).filter(Subscription.plan_id == plan_id).count()
    if in_use > 0:
        db_plan.is_active = False
        db.commit()
        return {"message": "Plan is in use by subscriptions and was deactivated instead", "deactivated": True}

    log = AuditLog(
        user_id=current_user.id,
        action="DELETE_PLAN",
        module="billing",
        entity_type="Plan",
        entity_id=plan_id,
        new_values={"name": db_plan.name}
    )
    db.add(log)
    db.delete(db_plan)
    db.commit()
    return {"message": "Plan deleted", "deactivated": False}


@router.patch("/subscriptions/{subscription_id}")
def update_subscription(
    subscription_id: int,
    plan_id: int,
    organization_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Change tenant subscription plan. If the tenant has no subscription yet,
    one is created (organization_id required in that case)."""
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    sub = None
    if subscription_id:
        sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()

    if not sub and organization_id:
        sub = (
            db.query(Subscription)
            .filter(Subscription.organization_id == organization_id, Subscription.deleted_at.is_(None))
            .order_by(Subscription.created_at.desc())
            .first()
        )

    if not sub:
        if not organization_id:
            raise HTTPException(status_code=404, detail="Subscription not found")
        sub = Subscription(
            organization_id=organization_id,
            plan_id=plan_id,
            status="active",
            billing_cycle="monthly",
            next_billing_date=datetime.utcnow() + timedelta(days=30),
        )
        db.add(sub)
        db.flush()
        old_plan_id = None
    else:
        old_plan_id = sub.plan_id
        sub.plan_id = plan_id
        sub.updated_at = datetime.utcnow()

    log = AuditLog(
        user_id=current_user.id,
        action="CHANGE_PLAN",
        module="billing",
        entity_type="Subscription",
        entity_id=sub.id,
        old_values={"plan_id": old_plan_id},
        new_values={"plan_id": plan_id}
    )
    db.add(log)
    db.commit()

    return {"message": f"Subscription updated to {plan.display_name}"}


# ============== FEATURE FLAGS ==============

@router.get("/feature-flags", response_model=List[FeatureFlagResponse])
def list_feature_flags(
    organization_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """List feature flags (global or per-tenant)"""
    
    query = db.query(FeatureFlag)
    
    if organization_id:
        query = query.filter(
            or_(
                FeatureFlag.organization_id == organization_id,
                FeatureFlag.organization_id == None
            )
        )
    
    return query.all()


@router.post("/feature-flags", response_model=FeatureFlagResponse)
def create_feature_flag(
    flag: FeatureFlagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Create feature flag"""
    
    new_flag = FeatureFlag(**flag.dict())
    db.add(new_flag)
    db.commit()
    db.refresh(new_flag)
    
    return new_flag


@router.patch("/feature-flags/{flag_id}")
def toggle_feature_flag(
    flag_id: int,
    enabled: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Toggle feature flag"""
    
    flag = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    
    flag.enabled = enabled
    db.commit()
    
    return {"message": f"Feature flag {flag.flag} set to {enabled}"}


@router.put("/feature-flags/{flag_id}", response_model=FeatureFlagResponse)
def update_feature_flag(
    flag_id: int,
    flag: FeatureFlagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update feature flag description/enabled."""
    db_flag = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not db_flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")

    if flag.enabled is not None:
        db_flag.enabled = flag.enabled
    if flag.description is not None:
        db_flag.description = flag.description
    db.commit()
    db.refresh(db_flag)
    return db_flag


@router.delete("/feature-flags/{flag_id}", response_model=dict)
def delete_feature_flag(
    flag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Delete a feature flag."""
    db_flag = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not db_flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    log = AuditLog(
        user_id=current_user.id,
        action="DELETE_FEATURE_FLAG",
        module="system",
        entity_type="FeatureFlag",
        entity_id=flag_id,
        new_values={"flag": db_flag.flag}
    )
    db.add(log)
    db.delete(db_flag)
    db.commit()
    return {"message": "Feature flag deleted"}


# ============== SYSTEM HEALTH ==============

@router.get("/health", response_model=SystemHealthResponse)
def system_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get system health status"""
    
    # Check database
    db_start = datetime.utcnow()
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db_latency = (datetime.utcnow() - db_start).total_seconds() * 1000
        db_status = {"status": "healthy", "latency_ms": int(db_latency)}
    except Exception as e:
        db_status = {"status": "down", "latency_ms": None, "error": str(e)}
    
    # Check Redis
    redis_status = None
    if redis_client:
        redis_start = datetime.utcnow()
        try:
            redis_client.ping()
            redis_latency = (datetime.utcnow() - redis_start).total_seconds() * 1000
            redis_status = {"status": "healthy", "latency_ms": int(redis_latency)}
        except Exception as exc:
            redis_status = {"status": "down", "latency_ms": None}
    
    # Get metrics
    active_users = db.query(func.count(User.id)).filter(
        User.last_login >= datetime.utcnow() - timedelta(hours=24)
    ).scalar()
    
    total_tenants = db.query(func.count(Organization.id)).filter(
        Organization.status == "active"
    ).scalar()
    
    # API calls today (from audit logs)
    api_calls = db.query(func.count(AuditLog.id)).filter(
        AuditLog.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).scalar()
    
    return {
        "database": db_status,
        "redis": redis_status,
        "active_users": active_users or 0,
        "total_tenants": total_tenants or 0,
        "api_calls_today": api_calls or 0,
        "timestamp": datetime.utcnow()
    }


# ============== AUDIT LOGS ==============

@router.get("/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
    module: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get audit logs with filters"""
    
    query = db.query(AuditLog).outerjoin(
        User, AuditLog.user_id == User.id
    ).outerjoin(
        Organization, AuditLog.organization_id == Organization.id
    )
    
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if organization_id:
        query = query.filter(AuditLog.organization_id == organization_id)
    if module:
        query = query.filter(AuditLog.module == module)
    if action:
        query = query.filter(AuditLog.action == action)
    
    logs = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "action": log.action,
            "module": log.module,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "old_values": log.old_values,
            "new_values": log.new_values,
            "user_id": log.user_id,
            "user_name": log.user.full_name if log.user else None,
            "organization_id": log.organization_id,
            "organization_name": log.organization.name if log.organization else None,
            "ip_address": log.ip_address,
            "created_at": log.created_at
        })
    
    return result


# ============== DASHBOARD STATS ==============

@router.get("/dashboard/stats", response_model=SuperAdminDashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get SuperAdmin dashboard statistics"""
    
    total_tenants = db.query(func.count(Organization.id)).scalar()
    active_tenants = db.query(func.count(Organization.id)).filter(
        Organization.status == "active"
    ).scalar()
    suspended_tenants = db.query(func.count(Organization.id)).filter(
        Organization.status == "suspended"
    ).scalar()
    trial_tenants = db.query(func.count(Organization.id)).join(
        Subscription, Organization.id == Subscription.organization_id
    ).filter(Subscription.status == "trial").scalar()
    
    total_users = db.query(func.count(User.id)).scalar()
    active_users_today = db.query(func.count(User.id)).filter(
        User.last_login >= datetime.utcnow() - timedelta(hours=24)
    ).scalar()
    
    api_calls_24h = db.query(func.count(AuditLog.id)).filter(
        AuditLog.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).scalar()
    
    # Revenue calculation
    revenue = db.query(func.sum(Plan.price_monthly)).join(
        Subscription, Plan.id == Subscription.plan_id
    ).filter(Subscription.status == "active").scalar()
    
    health = system_health(db, current_user)
    
    return {
        "total_tenants": total_tenants or 0,
        "active_tenants": active_tenants or 0,
        "suspended_tenants": suspended_tenants or 0,
        "trial_tenants": trial_tenants or 0,
        "total_users": total_users or 0,
        "active_users_today": active_users_today or 0,
        "api_calls_24h": api_calls_24h or 0,
        "revenue_this_month": revenue or 0.0,
        "system_status": health
    }

# ============== SYSTEM CONFIGURATION ==============

@router.get("/config")
def get_system_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get global system configuration"""
    # Simple placeholder - normally would read from a GlobalSettings table
    return {
        "enforce_password_complexity": True,
        "global_mfa_enforcement": False,
        "default_timezone": "UTC",
        "maintenance_mode": False
    }

@router.put("/config")
def update_system_config(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update global system configuration"""
    # Simple placeholder
    return {"message": "Configuration updated successfully", "config": data}


DEFAULT_BILLING_CONFIG = {
    "gateway": "manual",
    "gateway_key": "",
    "gateway_secret": "",
    "currency": "INR",
    "tax_percent": 0.0,
    "tax_label": "GST",
    "trial_days": 30,
    "invoice_prefix": "INV",
    "invoice_footer": "Thank you for your business!",
    "billing_email": "",
    "payment_methods": ["upi", "bank_transfer"],
    "auto_renew": True,
    "qr_code_url": "",
    "upi_id": "",
    "bank_details": [],
    # Per-employee count pricing tiers for the paid (all-features) plan.
    # Each tier: {"min": 0, "max": 100, "price": 3000}. The price for an org is
    # the tier whose [min, max] contains its active employee count.
    "price_tiers": [
        {"min": 0, "max": 100, "price": 3000},
        {"min": 101, "max": 250, "price": 5000},
        {"min": 251, "max": 500, "price": 8000},
        {"min": 501, "max": 999999, "price": 15000},
    ],
}


def _price_for_employee_count(db, employee_count: int) -> float:
    """Return the configured price for an org with the given active headcount."""
    cfg = _get_billing_config(db)
    tiers = cfg.get("price_tiers") or []
    if not tiers:
        return 0.0
    for tier in tiers:
        lo = int(tier.get("min", 0))
        hi = int(tier.get("max", 999999))
        if lo <= employee_count <= hi:
            return float(tier.get("price", 0) or 0)
    # Fallback: highest tier
    last = tiers[-1]
    return float(last.get("price", 0) or 0)


def _get_billing_config(db) -> dict:
    from models import GlobalSettings
    gs = db.query(GlobalSettings).first()
    if not gs:
        gs = GlobalSettings()
        db.add(gs)
        db.flush()
    merged = dict(DEFAULT_BILLING_CONFIG)
    if gs.billing_config:
        merged.update(gs.billing_config)
    return merged


@router.get("/billing-config", response_model=dict)
def get_billing_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get global billing configuration."""
    return _get_billing_config(db)


@router.put("/billing-config", response_model=dict)
def update_billing_config(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Update global billing configuration."""
    from models import GlobalSettings
    gs = db.query(GlobalSettings).first()
    if not gs:
        gs = GlobalSettings()
        db.add(gs)
    merged = dict(DEFAULT_BILLING_CONFIG)
    if gs.billing_config:
        merged.update(gs.billing_config)
    # Only store whitelisted keys (don't persist random payload fields)
    allowed = set(DEFAULT_BILLING_CONFIG.keys())
    for k in allowed:
        if k in data:
            merged[k] = data[k]
    gs.billing_config = merged
    db.commit()
    return {"message": "Billing configuration saved", "config": merged}


@router.post("/billing-config/qr-code", response_model=dict)
def upload_billing_qr(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    """Upload a payment QR code image, decode the UPI ID from it, and store both."""
    from models import GlobalSettings
    import os as _os
    import uuid

    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    ext = _os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Only PNG/JPG/JPEG/WEBP images are allowed")

    upload_dir = _os.path.join(_os.path.dirname(__file__), "..", "static", "billing")
    _os.makedirs(upload_dir, exist_ok=True)
    fname = f"qr_{uuid.uuid4().hex[:12]}{ext}"
    dest = _os.path.join(upload_dir, fname)

    contents = file.file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")

    with open(dest, "wb") as f:
        f.write(contents)

    qr_url = f"/static/billing/{fname}"

    # Decode the QR to auto-fill the UPI ID
    upi_id = None
    try:
        import cv2
        import re
        det = cv2.QRCodeDetector()
        val, _, _ = det.detectAndDecode(cv2.imread(dest))
        if val:
            m = re.search(r"[?&]pa=([^&]+)", val or "")
            upi_id = m.group(1) if m else None
    except Exception:
        pass

    gs = db.query(GlobalSettings).first()
    if not gs:
        gs = GlobalSettings()
        db.add(gs)
    merged = dict(DEFAULT_BILLING_CONFIG)
    if gs.billing_config:
        merged.update(gs.billing_config)
    merged["qr_code_url"] = qr_url
    if upi_id:
        merged["upi_id"] = upi_id
    gs.billing_config = merged
    db.commit()

    return {"message": "QR code uploaded", "qr_code_url": qr_url, "upi_id": upi_id}


IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


@router.get("/ifsc/{ifsc_code}")
def validate_ifsc(
    ifsc_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    """Validate an IFSC code (format + free bank lookup via Razorpay's public API)."""
    code = (ifsc_code or "").strip().upper()
    if not IFSC_RE.match(code):
        return {
            "valid": False,
            "format_valid": False,
            "error": "Invalid IFSC format. Expected 11 chars, e.g. HDFC0001234",
        }

    try:
        import httpx
        resp = httpx.get(f"https://ifsc.razorpay.com/{code}", timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "valid": True,
                "format_valid": True,
                "bank": data.get("BANK"),
                "branch": data.get("BRANCH"),
                "address": data.get("ADDRESS"),
                "city": data.get("CITY"),
                "state": data.get("STATE"),
                "contact": data.get("CONTACT"),
                "micr": data.get("MICR"),
            }
        return {
            "valid": False,
            "format_valid": True,
            "error": "IFSC not found in bank records",
        }
    except Exception:
        # Offline fallback: format is valid but we can't reach the lookup service
        return {
            "valid": True,
            "format_valid": True,
            "bank": None,
            "branch": None,
            "offline": True,
            "message": "Format valid; bank lookup unavailable right now",
        }

# ============== SUPERADMIN USERS ==============

@router.get("/admins")
def list_superadmins(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """List all superadmin users"""
    admins = db.query(User).filter(User.role == "superadmin").all()
    return [{
        "id": a.id,
        "email": a.email,
        "name": a.full_name,
        "created_at": a.created_at
    } for a in admins]


class SuperAdminCreate(BaseModel):
    email: str
    name: Optional[str] = None
    password: str


@router.post("/admins", response_model=dict)
def create_superadmin(
    data: SuperAdminCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Create a new superadmin user."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    from core.auth import get_password_hash
    admin = User(
        email=data.email,
        full_name=data.name or data.email.split("@")[0],
        password_hash=get_password_hash(data.password),
        role="superadmin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"message": "Superadmin created", "id": admin.id, "email": admin.email}


@router.delete("/admins/{admin_id}", response_model=dict)
def delete_superadmin(
    admin_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Delete a superadmin user."""
    if admin_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    admin = db.query(User).filter(User.id == admin_id, User.role == "superadmin").first()
    if not admin:
        raise HTTPException(status_code=404, detail="Superadmin not found")
    db.delete(admin)
    db.commit()
    return {"message": "Superadmin deleted"}

# ============== CUSTOM ANALYTICS & BILLING ==============

@router.get("/api-usage")
def get_api_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get API usage per tenant (last 24 hours)"""
    time_threshold = datetime.utcnow() - timedelta(hours=24)
    usage = db.query(
        AuditLog.organization_id,
        Organization.name,
        func.count(AuditLog.id).label("call_count")
    ).join(
        Organization, AuditLog.organization_id == Organization.id
    ).filter(
        AuditLog.created_at >= time_threshold
    ).group_by(
        AuditLog.organization_id, Organization.name
    ).order_by(
        func.count(AuditLog.id).desc()
    ).limit(10).all()

    return [{"tenant": u.name, "calls": u.call_count} for u in usage]

@router.get("/invoices")
def get_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Generate mock invoices based on active subscriptions"""
    subscriptions = db.query(Subscription).filter(
        Subscription.status == "active"
    ).all()

    invoices = []
    import random
    for sub in subscriptions:
        org = db.query(Organization).filter(Organization.id == sub.organization_id).first()
        plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
        if not org or not plan: continue
        
        status_choice = random.choices(["Paid", "Pending", "Failed"], weights=[80, 15, 5])[0]
        
        inv = {
            "id": f"INV-2023-{sub.id:03d}",
            "tenant": org.name,
            "plan": plan.display_name,
            "amount": plan.price_monthly,
            "date": datetime.utcnow().strftime("%d/%m/%Y"),
            "status": status_choice
        }
        invoices.append(inv)
        
    return invoices
