"""
SuperAdmin Controller - Multi-tenant Management Console
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, and_, or_, desc
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
from schemas.superadmin import TenantCreate

from database import get_db
from models import User, Organization, Company, ModulePermission, AuditLog, Employee
from core.auth import get_current_user
from core.datetime_utils import ist_now_naive

router = APIRouter(tags=["superadmin"])

# ============ REQUEST SCHEMAS ============


class PermissionUpdate(BaseModel):
    module: str
    can_read: bool = True
    can_write: bool = False
    can_delete: bool = False

class FeatureFlagUpdate(BaseModel):
    enabled: bool
    per_tenant: Optional[int] = None  # company_id if per-tenant

class AuditLogFilter(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    tenant_id: Optional[int] = None
    user_id: Optional[int] = None
    action: Optional[str] = None

# ============ AUTHORIZATION ============

def require_superadmin(current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return current_user

# ============ TENANT MANAGEMENT ============

@router.get("/tenants")
async def list_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """List all organizations with stats"""
    orgs = db.query(Organization).all()
    
    result = []
    for org in orgs:
        # Get employee count (need to join through company or just get all for org)
        employee_count = db.query(Employee).filter(Employee.organization_id == org.id).count()
        
        # Get last admin login
        last_login = db.query(User).filter(
            User.organization_id == org.id
        ).order_by(desc(User.last_login)).first()
        
        result.append({
            "id": org.id,
            "name": org.name,
            "email": org.email,
            "phone": org.phone,
            "address": org.address,
            "is_active": org.status == 'active',
            "created_at": org.created_at.isoformat() if org.created_at else None,
            "updated_at": org.updated_at.isoformat() if org.updated_at else None,
            "employee_count": employee_count,
            "last_admin_login": last_login.last_login.isoformat() if last_login and last_login.last_login else None,
            "status": org.status
        })
    
    return {"tenants": result, "total": len(result)}

@router.post("/tenants")
async def create_tenant(
    data: TenantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Create new company + admin user in one transaction"""
    try:
        org_code = data.company_code if data.company_code and data.company_code.strip() else None
        if org_code:
            suffix = 1
            base_code = org_code
            while db.query(Organization).filter(Organization.code == org_code).first():
                org_code = f"{base_code}-{suffix}"
                suffix += 1
        org_domain = data.domain if data.domain and data.domain.strip() else None
        org = Organization(
            name=data.company_name,
            code=org_code,
            email=data.admin_email,
            phone=data.admin_phone or "",
            address="",
            status="active",
            domain=org_domain,
            industry=data.industry,
            company_size=data.company_size,
            legal_name=data.legal_name,
            gst_no=data.gst_no,
            pan_no=data.pan_no,
            registration_no=data.registration_no,
            tin_no=data.tin_no,
            timezone=data.timezone,
            date_format=data.date_format,
            language_preference=data.language_preference,
            default_currency=data.default_currency,
        )
        db.add(org)
        db.flush()  # Get org.id
        
        # Create admin user
        from core.auth import get_password_hash
        admin_pass = data.password or data.admin_password
        if not admin_pass:
            raise HTTPException(status_code=422, detail="Password is required")
            
        admin = User(
            email=data.admin_email,
            full_name=data.admin_name,
            password_hash=get_password_hash(admin_pass),
            passcode=get_password_hash(data.passcode) if data.passcode else None,
            role="admin",
            organization_id=org.id,
            is_active=True
        )
        db.add(admin)
        db.flush()
        
        # Create Initial Employee Record for Admin
        names = data.admin_name.split()
        first_name = names[0]
        last_name = " ".join(names[1:]) if len(names) > 1 else ""
        
        admin_employee = Employee(
            user_id=admin.id,
            organization_id=org.id,
            first_name=first_name,
            last_name=last_name,
            email=data.admin_email,
            employee_code=f"{(org_code or org.id)}-ADMIN-01",
            designation="Tenant Administrator",
            status="active"
        )
        db.add(admin_employee)

        print("ABOUT TO COMMIT:", {
            "org_name": data.company_name,
            "org_code": org_code,
            "admin_email": data.admin_email,
            "employee_code": f"{(org_code or org.id)}-ADMIN-01",
        })

        # Create permissions based on selected modules
        modules = data.modules if data.modules else ["dashboard", "employees", "attendance", "leave", "payroll", "expenses", "holidays", "reports", "settings"]
        for module in modules:
            perm = ModulePermission(
                user_id=admin.id,
                module=module,
                can_read=True,
                can_write=module in ["employees", "attendance", "leave", "expenses"],
                can_delete=False
            )
            db.add(perm)
        
        db.commit()
        
        # Create subscription if plan_id is provided
        if data.plan_id:
            plan = db.query(Plan).filter(Plan.id == data.plan_id, Plan.is_active == True).first()
            if plan:
                from core.datetime_utils import ist_now_naive
                from datetime import timedelta
                sub = Subscription(
                    organization_id=org.id,
                    plan_id=plan.id,
                    status="active",
                    start_date=ist_now_naive(),
                    end_date=ist_now_naive() + timedelta(days=30),
                    next_billing_date=ist_now_naive() + timedelta(days=30),
                )
                db.add(sub)
                db.commit()
        
        return {
            "message": "Tenant created successfully",
            "tenant_id": org.id,
            "admin_id": admin.id,
            "admin_email": admin.email
        }
        
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as e:
        db.rollback()
        msg = str(e.orig) if hasattr(e, 'orig') and e.orig else str(e)
        print("INTEGRITY ERROR:", msg)
        if 'users.email' in msg or ('email' in msg.lower() and 'user' in msg.lower()):
            detail = f"Admin email '{data.admin_email}' conflicts with an existing record"
        elif 'organizations' in msg.lower():
            detail = "Organization creation failed due to a data conflict"
        else:
            detail = "Data conflict: a required value already exists"
        raise HTTPException(status_code=400, detail=detail)
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create tenant: {str(e)}")

@router.patch("/tenants/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Suspend organization"""
    org = db.query(Organization).filter(Organization.id == tenant_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    org.status = "suspended"
    db.commit()
    
    return {"message": "Tenant suspended", "tenant_id": tenant_id}

@router.patch("/tenants/{tenant_id}/activate")
async def activate_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Reactivate organization"""
    org = db.query(Organization).filter(Organization.id == tenant_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    org.status = "active"
    db.commit()
    
    return {"message": "Tenant activated", "tenant_id": tenant_id}

@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Soft delete organization"""
    org = db.query(Organization).filter(Organization.id == tenant_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Soft delete - mark as inactive and add deleted timestamp
    org.status = "deleted"
    org.name = f"{org.name} [DELETED {ist_now_naive().isoformat()}]"
    db.commit()
    
    return {"message": "Tenant deleted", "tenant_id": tenant_id}

@router.post("/tenants/{tenant_id}/impersonate")
async def impersonate_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Issue a single-use code the HRMS exchanges for a scoped tenant session.

    The hub and the HRMS run on different origins (separate localStorage), so
    the token itself is never handed to the browser here — only a 60-second
    single-use code that the HRMS redeems at /api/auth/impersonate-exchange.
    """
    # Find admin user for this tenant
    admin = db.query(User).filter(
        User.organization_id == tenant_id,
        User.role == "admin"
    ).first()
    
    if not admin:
        raise HTTPException(status_code=404, detail="No admin found for this tenant")
    if not admin.is_active:
        raise HTTPException(status_code=400, detail="Tenant admin account is inactive")

    from core.impersonation import create_impersonation_code
    code = create_impersonation_code({
        "user_id": admin.id,
        "organization_id": tenant_id,
        "impersonated_by": current_user.id,
    })

    return {
        "code": code,
        "expires_in": 60
    }

# ============ PERMISSIONS MANAGEMENT ============

MODULES_LIST = [
    "dashboard", "employees", "payroll", "leave", "attendance", 
    "recruitment", "holidays", "reports", "expenses", "performance", 
    "settings"
]

@router.get("/permissions/{user_id}")
async def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get all module permissions for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    perms = db.query(ModulePermission).filter(ModulePermission.user_id == user_id).all()
    
    # Build permissions map
    perm_map = {p.module: p for p in perms}
    
    result = []
    for module in MODULES_LIST:
        if module in perm_map:
            p = perm_map[module]
            result.append({
                "module": module,
                "can_read": p.can_view,
                "can_write": p.can_create or p.can_edit,
                "can_delete": p.can_delete
            })
        else:
            result.append({
                "module": module,
                "can_read": False,
                "can_write": False,
                "can_delete": False
            })
    
    return {
        "user_id": user_id,
        "user_email": user.email,
        "permissions": result
    }

@router.post("/permissions/{user_id}")
async def set_user_permissions(
    user_id: int,
    permissions: List[PermissionUpdate],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Set module permissions for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    for perm_data in permissions:
        # Check if permission exists
        existing = db.query(ModulePermission).filter(
            ModulePermission.user_id == user_id,
            ModulePermission.module == perm_data.module
        ).first()
        
        if existing:
            # Update
            existing.can_view = perm_data.can_read
            existing.can_create = perm_data.can_write
            existing.can_edit = perm_data.can_write
            existing.can_delete = perm_data.can_delete
        else:
            # Create new
            new_perm = ModulePermission(
                user_id=user_id,
                module=perm_data.module,
                can_view=perm_data.can_read,
                can_create=perm_data.can_write,
                can_edit=perm_data.can_write,
                can_delete=perm_data.can_delete,
                can_approve=False
            )
            db.add(new_perm)
    
    db.commit()
    
    return {"message": "Permissions updated", "user_id": user_id}

@router.delete("/permissions/{user_id}/{module}")
async def revoke_permission(
    user_id: int,
    module: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Revoke a permission"""
    perm = db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id,
        ModulePermission.module == module
    ).first()
    
    if perm:
        db.delete(perm)
        db.commit()
    
    return {"message": "Permission revoked", "user_id": user_id, "module": module}

# ============ AUDIT LOG ============

@router.get("/audit-logs")
async def get_audit_logs(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    tenant_id: Optional[int] = None,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get paginated audit logs with filters"""
    query = db.query(AuditLog).join(User, AuditLog.user_id == User.id, isouter=True)
    
    # Apply filters
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            query = query.filter(AuditLog.created_at >= start)
        except Exception as exc:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            query = query.filter(AuditLog.created_at <= end)
        except Exception as exc:
            pass
    
    if tenant_id:
        query = query.filter(User.organization_id == tenant_id)
    
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    
    if action:
        query = query.filter(AuditLog.action == action)
    
    # Get total count
    total = query.count()
    
    # Paginate
    logs = query.order_by(desc(AuditLog.created_at)).offset((page - 1) * per_page).limit(per_page).all()
    
    result = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        tenant = None
        if user and user.organization_id:
            tenant = db.query(Organization).filter(Organization.id == user.organization_id).first()
        
        result.append({
            "id": log.id,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
            "user": user.email if user else "Unknown",
            "user_id": log.user_id,
            "tenant": tenant.name if tenant else "N/A",
            "tenant_id": user.organization_id if user else None,
            "action": log.action,
            "module": log.entity_type or "system",
            "entity_id": log.entity_id,
            "changes": log.changes,
            "ip_address": log.ip_address,
            "result": "success"  # Assuming success if logged
        })
    
    return {
        "logs": result,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page
    }

# ============ SYSTEM HEALTH ============

@router.get("/health")
async def system_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Get system health status"""
    health = {
        "timestamp": ist_now_naive().isoformat(),
        "database": {"status": "unknown", "message": ""},
        "redis": {"status": "unknown", "message": "Redis not configured"},
        "stats": {}
    }
    
    # Check database
    try:
        db.execute("SELECT 1")
        health["database"] = {"status": "connected", "message": "OK"}
    except Exception as e:
        health["database"] = {"status": "error", "message": str(e)}
    
    # Get stats
    try:
        total_tenants = db.query(Organization).count()
        active_tenants = db.query(Organization).filter(Organization.status == "active").count()
        total_employees = db.query(Employee).count()
        active_users = db.query(User).filter(User.is_active == True).count()
        
        # Get today's API calls (from audit log)
        today_start = ist_now_naive().replace(hour=0, minute=0, second=0, microsecond=0)
        api_calls_today = db.query(AuditLog).filter(AuditLog.created_at >= today_start).count()
        
        health["stats"] = {
            "total_tenants": total_tenants,
            "active_tenants": active_tenants,
            "total_employees": total_employees,
            "active_users": active_users,
            "api_calls_today": api_calls_today
        }
        
        health["status"] = "healthy" if health["database"]["status"] == "connected" else "degraded"
        
    except Exception as e:
        health["stats"] = {"error": str(e)}
        health["status"] = "error"
    
    return health

# ============ FEATURE FLAGS ============

# In-memory feature flags (in production, these would be in Redis or DB)
FEATURE_FLAGS = {
    "payroll_module": {"enabled": True, "description": "Payroll processing module", "per_tenant": False},
    "recruitment_module": {"enabled": True, "description": "Recruitment and hiring module", "per_tenant": False},
    "expense_tracking": {"enabled": True, "description": "Employee expense tracking", "per_tenant": True},
    "performance_reviews": {"enabled": False, "description": "Performance review system", "per_tenant": True},
    "advanced_reports": {"enabled": True, "description": "Advanced reporting and analytics", "per_tenant": False},
    "mobile_access": {"enabled": True, "description": "Mobile app access", "per_tenant": False},
}

@router.get("/feature-flags")
async def list_feature_flags(
    current_user: User = Depends(require_superadmin)
):
    """List all feature flags"""
    return {
        "flags": [
            {
                "name": name,
                "enabled": data["enabled"],
                "description": data["description"],
                "per_tenant": data["per_tenant"]
            }
            for name, data in FEATURE_FLAGS.items()
        ]
    }

@router.patch("/feature-flags/{flag_name}")
async def toggle_feature_flag(
    flag_name: str,
    data: FeatureFlagUpdate,
    current_user: User = Depends(require_superadmin)
):
    """Toggle feature flag globally or per tenant"""
    if flag_name not in FEATURE_FLAGS:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    
    FEATURE_FLAGS[flag_name]["enabled"] = data.enabled
    
    return {
        "flag": flag_name,
        "enabled": data.enabled,
        "message": f"Feature flag '{flag_name}' {'enabled' if data.enabled else 'disabled'}"
    }
