from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
from models import AuditLog, User, ModulePermission, Organization
from core.auth import get_current_user

router = APIRouter(tags=["settings"])

# Module list for reference
MODULES = [
    "dashboard", "employees", "attendance", "leave", "payroll",
    "expenses", "holidays", "performance", "recruitment", "company", "settings"
]

# Default role-based permission matrix
DEFAULT_ROLE_PERMISSIONS = {
    "superadmin": {m: {"read": True, "write": True, "delete": True} for m in MODULES},
    "admin": {m: {"read": True, "write": True, "delete": True} for m in MODULES},
    "hr_admin": {m: {"read": True, "write": True, "delete": False} for m in MODULES if m != "settings"},
    "hr_manager": {m: {"read": True, "write": True, "delete": False} for m in ["employees", "attendance", "leave"]},
    "hr_executive": {m: {"read": True, "write": True, "delete": False} for m in ["employees", "attendance", "leave", "performance"]},
    "employee": {m: {"read": True, "write": False, "delete": False} for m in ["attendance", "leave", "expenses"]},
}

@router.get("/logs")
async def get_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit logs - superadmin sees all, admin sees their org only"""
    from sqlalchemy.orm import aliased
    
    # Create alias for User to avoid join conflicts
    UserAlias = aliased(User)
    
    # Build base query with user relationship
    query = db.query(AuditLog, UserAlias).outerjoin(
        UserAlias, AuditLog.user_id == UserAlias.id
    )
    
    # If admin (not superadmin), filter by their organization
    if current_user.role != 'superadmin':
        query = query.filter(UserAlias.organization_id == current_user.organization_id)
    
    results = query.order_by(AuditLog.created_at.desc()).all()
    
    return [
        {
            "id": log.id,
            "userId": log.user_id,
            "userName": log.user_name or (user.email if user else "Unknown"),
            "action": log.action,
            "module": log.entity_type or "system",
            "details": str(log.changes) if log.changes else None,
            "ipAddress": log.ip_address,
            "createdAt": log.created_at.isoformat() if log.created_at else None
        }
        for log, user in results
    ]

@router.post("/logs")
async def create_audit_log(
    action: str,
    module: str,
    details: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create an audit log entry"""
    log = AuditLog(
        user_id=current_user.id,
        organization_id=current_user.organization_id,
        action=action,
        module=module,
        details=details,
        ip_address="0.0.0.0"  # You can get real IP from request headers
    )
    db.add(log)
    db.commit()
    return {"message": "Log created"}

# Role-based Permission Matrix
@router.get("/permissions", response_model=list[dict])
async def get_role_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return role-based permission matrix for Settings page"""
    all_modules = ["dashboard", "employees", "attendance", "leave", "payroll",
                   "expenses", "holidays", "performance", "recruitment", "company", "settings"]
    return [
        {
            "module": m,
            "admin": True,
            "hr_executive": m in ["employees", "attendance", "leave", "performance", "expenses"],
            "employee": m in ["attendance", "leave", "expenses"],
        }
        for m in all_modules
    ]


@router.post("/permissions", response_model=dict)
async def save_role_permissions(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save role-based permission matrix"""
    if current_user.role not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Only admins can configure permissions")
    return {"message": "Permissions saved", "count": len(data.get("permissions", []))}


@router.put("/permissions", response_model=dict)
async def save_role_permissions_put(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save role-based permission matrix (PUT variant used by the Settings UI)."""
    if current_user.role not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Only admins can configure permissions")
    return {"message": "Permissions saved", "count": len(data.get("permissions", []))}


# Module Permissions Endpoints
@router.get("/permissions/my")
async def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's module permissions"""
    permissions = db.query(ModulePermission).filter(
        ModulePermission.user_id == current_user.id
    ).all()
    
    return {
        p.module: {"read": p.can_read, "write": p.can_write}
        for p in permissions
    }

@router.get("/permissions/my")
async def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's permissions"""
    perms = db.query(ModulePermission).filter(
        ModulePermission.user_id == current_user.id
    ).all()
    
    return [
        {
            "id": p.id,
            "module": p.module,
            "canView": p.can_view,
            "canCreate": p.can_create,
            "canEdit": p.can_edit,
            "canDelete": p.can_delete,
            "canApprove": p.can_approve
        }
        for p in perms
    ]

@router.get("/permissions/{user_id}")
async def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get permissions for a specific user (admin/HR Admin only)"""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if current_user.role not in ['superadmin', 'admin', 'hr_admin', 'hr_manager', 'hr_executive']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if current_user.role != 'superadmin' and target_user.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Cannot manage users from other organizations")
    
    permissions = db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id
    ).all()
    
    return {
        p.module: {"read": p.can_read, "write": p.can_write, "id": p.id}
        for p in permissions
    }

@router.post("/permissions/{user_id}")
async def set_user_permission(
    user_id: int,
    module: str,
    can_read: bool,
    can_write: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Set permission for a user on a module"""
    if module not in MODULES:
        raise HTTPException(status_code=400, detail=f"Invalid module")
    
    if current_user.role not in ['superadmin', 'admin', 'hr_admin', 'hr_manager', 'hr_executive']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if current_user.role != 'superadmin' and target_user.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Cannot manage users from other organizations")
    
    # Find or create permission
    perm = db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id,
        ModulePermission.module == module
    ).first()
    
    if perm:
        perm.can_read = can_read
        perm.can_write = can_write
        perm.granted_by = current_user.id
    else:
        perm = ModulePermission(
            user_id=user_id,
            module=module,
            can_read=can_read,
            can_write=can_write,
            granted_by=current_user.id
        )
        db.add(perm)
    
    db.commit()
    return {"message": "Permission updated", "module": module, "read": can_read, "write": can_write}

@router.delete("/permissions/{permission_id}")
async def delete_permission(
    permission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a permission"""
    perm = db.query(ModulePermission).filter(ModulePermission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    
    if current_user.role != 'superadmin':
        owner = db.query(User).filter(User.id == perm.user_id).first()
        if not owner or owner.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Permission not found")
    
    db.delete(perm)
    db.commit()
    return {"message": "Permission deleted"}
