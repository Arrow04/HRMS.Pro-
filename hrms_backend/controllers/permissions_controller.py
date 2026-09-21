"""
Permissions Management Controller
Admin-only access to manage user module permissions
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from database import get_db
from models import User, ModulePermission, MODULES_LIST
from core.auth import get_current_user
from core.permissions import (
    require_admin_or_above,
    seed_default_permissions,
    reset_to_role_defaults,
    can_assign_permissions,
    set_module_permission,
    _level_from_flags,
)

router = APIRouter(tags=["permissions"])

# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class PermissionItem(BaseModel):
    module: str
    level: Optional[str] = None  # none, view, edit, full
    menu_visible: Optional[bool] = None
    can_read: bool = False
    can_write: bool = False
    can_delete: bool = False

class BulkPermissionRequest(BaseModel):
    permissions: List[PermissionItem]

class SinglePermissionRequest(BaseModel):
    level: Optional[str] = None
    menu_visible: Optional[bool] = None
    can_read: Optional[bool] = None
    can_write: Optional[bool] = None
    can_delete: Optional[bool] = None

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    organization_id: Optional[int]

# ═══════════════════════════════════════════════════════════════════════════════
# USER LISTING
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    role: Optional[str] = None,
    organization_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """List all users with their roles (admin and above only)"""
    query = db.query(User)
    
    # Superadmin sees all, admin sees only their organization's users
    if current_user.role == "admin":
        query = query.filter(User.organization_id == current_user.organization_id)
    
    # Apply filters
    if role:
        query = query.filter(User.role == role)
    
    if organization_id and current_user.role == "superadmin":
        query = query.filter(User.organization_id == organization_id)
    
    if search:
        query = query.filter(
            (User.email.ilike(f"%{search}%")) | 
            (User.full_name.ilike(f"%{search}%"))
        )
    
    users = query.order_by(User.id.desc()).all()
    
    return [
        UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            organization_id=user.organization_id
        )
        for user in users
    ]

# ═══════════════════════════════════════════════════════════════════════════════
# GET MY PERMISSIONS (for current user) — MUST be defined before /{user_id}
# ═══════════════════════════════════════════════════════════════════════════════

# All available modules for reference
ALL_MODULES = [
    "dashboard", "company", "employees", "recruitment", "holidays",
    "attendance", "leaves", "payroll", "expenses", "performance",
    "reports", "settings"
]

@router.get("/me/current")
async def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's permissions and allowed modules"""
    from core.permissions import get_user_permissions, has_module_permission, DEFAULT_PERMISSIONS, _level_from_flags
    
    # ADMIN, SUPERADMIN, and HR roles get ALL modules (full access)
    if current_user.role in ["admin", "superadmin", "hr_admin", "hr_manager", "hr_executive"]:
        full_perms = [
            {
                "module": m,
                "level": "full",
                "can_read": True,
                "can_write": True,
                "can_delete": True,
                "menu_visible": True
            }
            for m in MODULES_LIST
        ]
        return {
            "user_id": current_user.id,
            "role": current_user.role,
            "permissions": full_perms,
            "allowed_modules": ALL_MODULES
        }
    
    # Other roles: check permissions dynamically
    perms = get_user_permissions(current_user, db)
    
    allowed_modules = []
    for module in MODULES_LIST:
        if has_module_permission(current_user, module, "read", db):
            allowed_modules.append(module)
    
    return {
        "user_id": current_user.id,
        "role": current_user.role,
        "permissions": perms,
        "allowed_modules": allowed_modules
    }

# ═══════════════════════════════════════════════════════════════════════════════
# GET USER PERMISSIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{user_id}")
async def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Get all module permissions for a user (admin and above only)"""
    
    # Get target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check authorization
    if current_user.role == "admin":
        # Admin can only manage users in their organization
        if target_user.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Can only manage users in your organization")
        # Admin cannot manage superadmin or other admins
        if target_user.role in ["superadmin", "admin"]:
            raise HTTPException(status_code=403, detail="Cannot manage superadmin or admin users")
    
    # Get permissions from database
    perms = db.query(ModulePermission).filter(ModulePermission.user_id == user_id).all()
    
    # Build permissions map
    perm_map = {p.module: p for p in perms}
    
    # Admin/superadmin targets are locked at full access
    is_elevated = target_user.role in ["admin", "superadmin"]
    
    # Return all modules with their permissions
    result = []
    for module in MODULES_LIST:
        if is_elevated:
            result.append({
                "module": module,
                "level": "full",
                "menu_visible": True,
                "can_read": True,
                "can_write": True,
                "can_delete": True,
                "locked": True
            })
        elif module in perm_map:
            p = perm_map[module]
            result.append({
                "module": module,
                "level": p.level or _level_from_flags(p.can_read, p.can_write, p.can_delete),
                "menu_visible": p.menu_visible if p.menu_visible is not None else True,
                "can_read": p.can_read,
                "can_write": p.can_write,
                "can_delete": p.can_delete,
                "locked": False
            })
        else:
            result.append({
                "module": module,
                "level": "none",
                "menu_visible": False,
                "can_read": False,
                "can_write": False,
                "can_delete": False,
                "locked": False
            })
    
    return {
        "user_id": user_id,
        "user_email": target_user.email,
        "user_role": target_user.role,
        "permissions": result
    }

# ═══════════════════════════════════════════════════════════════════════════════
# BULK SET PERMISSIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{user_id}")
async def set_user_permissions(
    user_id: int,
    data: BulkPermissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Bulk set permissions for a user (admin and above only)"""
    
    # Get target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check authorization
    if current_user.role == "admin":
        if target_user.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Can only manage users in your organization")
        if target_user.role in ["superadmin", "admin"]:
            raise HTTPException(status_code=403, detail="Cannot manage superadmin or admin users")
        # Admin can only assign permissions to non-admin roles
        if target_user.role not in ["hr_admin", "hr_manager", "hr_executive", "employee"]:
            raise HTTPException(status_code=403, detail="Cannot assign permissions to this role")
    
    # Update permissions
    for perm_data in data.permissions:
        set_module_permission(
            user_id=user_id,
            module=perm_data.module,
            can_read=perm_data.can_read,
            can_write=perm_data.can_write,
            can_delete=perm_data.can_delete,
            db=db,
            granted_by=current_user.id,
            level=perm_data.level,
            menu_visible=perm_data.menu_visible
        )
    
    db.commit()
    
    return {
        "message": "Permissions updated successfully",
        "user_id": user_id,
        "permissions_count": len(data.permissions)
    }

# ═══════════════════════════════════════════════════════════════════════════════
# UPDATE SINGLE MODULE PERMISSION
# ═══════════════════════════════════════════════════════════════════════════════

@router.patch("/{user_id}/{module}")
async def update_module_permission(
    user_id: int,
    module: str,
    data: SinglePermissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Update single module permission for a user"""
    
    # Validate module
    if module not in MODULES_LIST:
        raise HTTPException(status_code=400, detail=f"Invalid module. Must be one of: {', '.join(MODULES_LIST)}")
    
    # Get target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check authorization
    if current_user.role == "admin":
        if target_user.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Can only manage users in your organization")
        if target_user.role in ["superadmin", "admin"]:
            raise HTTPException(status_code=403, detail="Cannot manage superadmin or admin users")
    
    # Get or create permission
    perm = db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id,
        ModulePermission.module == module
    ).first()
    
    # Apply level + menu_visible if provided (level determines flags)
    if data.level:
        from core.permissions import _flags_from_level
        can_read, can_write, can_delete = _flags_from_level(data.level)
        if perm:
            perm.can_read = can_read
            perm.can_write = can_write
            perm.can_delete = can_delete
            perm.level = data.level
        else:
            perm = ModulePermission(
                user_id=user_id,
                module=module,
                level=data.level,
                can_read=can_read,
                can_write=can_write,
                can_delete=can_delete,
                granted_by=current_user.id
            )
            db.add(perm)
    else:
        if perm:
            # Update only provided fields
            if data.can_read is not None:
                perm.can_read = data.can_read
            if data.can_write is not None:
                perm.can_write = data.can_write
            if data.can_delete is not None:
                perm.can_delete = data.can_delete
            perm.level = _level_from_flags(perm.can_read, perm.can_write, perm.can_delete)
        else:
            # Create new permission
            perm = ModulePermission(
                user_id=user_id,
                module=module,
                can_read=data.can_read if data.can_read is not None else False,
                can_write=data.can_write if data.can_write is not None else False,
                can_delete=data.can_delete if data.can_delete is not None else False,
                granted_by=current_user.id
            )
            db.add(perm)
    
    if data.menu_visible is not None:
        perm.menu_visible = data.menu_visible
    
    db.commit()
    
    return {
        "message": f"Permission for {module} updated",
        "user_id": user_id,
        "module": module,
        "level": perm.level,
        "menu_visible": perm.menu_visible,
        "can_read": perm.can_read,
        "can_write": perm.can_write,
        "can_delete": perm.can_delete
    }

# ═══════════════════════════════════════════════════════════════════════════════
# REVOKE MODULE PERMISSION
# ═══════════════════════════════════════════════════════════════════════════════

@router.delete("/{user_id}/{module}")
async def revoke_module_permission(
    user_id: int,
    module: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Revoke all permissions for a module (delete the permission row)"""
    
    # Validate module
    if module not in MODULES_LIST:
        raise HTTPException(status_code=400, detail=f"Invalid module. Must be one of: {', '.join(MODULES_LIST)}")
    
    # Get target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check authorization
    if current_user.role == "admin":
        if target_user.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Can only manage users in your organization")
        if target_user.role in ["superadmin", "admin"]:
            raise HTTPException(status_code=403, detail="Cannot manage superadmin or admin users")
    
    # Delete permission
    perm = db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id,
        ModulePermission.module == module
    ).first()
    
    if perm:
        db.delete(perm)
        db.commit()
    
    return {
        "message": f"Permission for {module} revoked",
        "user_id": user_id,
        "module": module
    }

# ═══════════════════════════════════════════════════════════════════════════════
# RESET TO ROLE DEFAULTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{user_id}/reset")
async def reset_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Reset user permissions to their role defaults"""
    
    # Get target user
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check authorization
    if current_user.role == "admin":
        if target_user.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Can only manage users in your organization")
        if target_user.role in ["superadmin", "admin"]:
            raise HTTPException(status_code=403, detail="Cannot manage superadmin or admin users")
    
    # Reset permissions
    reset_to_role_defaults(target_user, db, granted_by=current_user.id)
    
    return {
        "message": f"Permissions reset to {target_user.role} defaults",
        "user_id": user_id,
        "role": target_user.role
    }

# ═══════════════════════════════════════════════════════════════════════════════
# RESET TO ROLE DEFAULTS (moved here — was previously the last section)
# ═══════════════════════════════════════════════════════════════════════════════
