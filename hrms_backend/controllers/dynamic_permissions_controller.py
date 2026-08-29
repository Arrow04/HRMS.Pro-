"""
Dynamic Permissions Management API
Enterprise-grade endpoints for managing modules, roles, and permissions
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_

from database import get_db
from models import (
    User, SystemRole, PermissionModule, PermissionAction,
    RolePermissionMatrix, UserRoleAssignment, UserPermissionOverride,
    PermissionAuditLog
)
from core.auth import get_current_user
from core.permissions import require_superadmin, require_admin_or_above
from core.dynamic_permissions import (
    PermissionChecker,
    seed_permission_system,
    assign_role_to_user,
    revoke_role_from_user,
    set_user_permission_override
)

router = APIRouter(tags=["dynamic-permissions"])


# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST/RESPONSE SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class ModuleCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    category: str = "general"
    sort_order: int = 0
    route_path: Optional[str] = None
    parent_module_code: Optional[str] = None


class ModuleResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    category: str
    sort_order: int
    is_active: bool
    is_system: bool
    route_path: Optional[str]
    parent_module_code: Optional[str]
    submodules: Optional[List[dict]] = []
    
    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    level: int = Field(1, ge=1, le=100)
    parent_role_code: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    can_access_web: bool = True
    can_access_mobile: bool = True


class RoleResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    level: int
    is_active: bool
    is_system: bool
    icon: Optional[str]
    color: Optional[str]
    can_access_web: bool
    can_access_mobile: bool
    permissions_count: int = 0
    
    class Config:
        from_attributes = True


class ActionResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    color: Optional[str]
    is_active: bool
    
    class Config:
        from_attributes = True


class PermissionMatrixItem(BaseModel):
    module_code: str
    action_code: str
    is_allowed: bool
    conditions: Optional[Dict[str, Any]] = None


class RolePermissionsUpdate(BaseModel):
    permissions: List[PermissionMatrixItem]


class UserRoleAssign(BaseModel):
    user_id: int
    role_code: str
    organization_id: Optional[int] = None
    department_id: Optional[int] = None
    is_primary: bool = False
    valid_until: Optional[str] = None  # ISO format datetime


class UserPermissionOverrideCreate(BaseModel):
    user_id: int
    module_code: str
    action_code: str
    override_type: str = Field(..., pattern="^(grant|deny)$")
    reason: Optional[str] = None
    expires_at: Optional[str] = None  # ISO format datetime


class UserPermissionsResponse(BaseModel):
    user_id: int
    roles: List[Dict[str, Any]]
    permissions: Dict[str, Dict[str, bool]]
    allowed_modules: List[str]


class PermissionAuditLogResponse(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: int
    previous_value: Optional[Dict]
    new_value: Optional[Dict]
    performed_by: int
    performed_at: str
    
    class Config:
        from_attributes = True


class SeedResponse(BaseModel):
    success: bool
    results: Dict[str, Dict[str, int]]
    message: str


# ═══════════════════════════════════════════════════════════════════════════════
# MODULE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/modules", response_model=List[ModuleResponse])
def list_modules(
    category: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all permission modules"""
    query = db.query(PermissionModule)
    
    if category:
        query = query.filter(PermissionModule.category == category)
    
    if not include_inactive and is_active is not False:
        query = query.filter(PermissionModule.is_active == True)
    elif is_active is not None:
        query = query.filter(PermissionModule.is_active == is_active)
    
    modules = query.order_by(PermissionModule.sort_order).all()
    
    # Build response with submodules
    result = []
    for module in modules:
        module_dict = {
            "id": module.id,
            "code": module.code,
            "name": module.name,
            "description": module.description,
            "icon": module.icon,
            "category": module.category,
            "sort_order": module.sort_order,
            "is_active": module.is_active,
            "is_system": module.is_system,
            "route_path": module.route_path,
            "parent_module_code": module.parent_module_code,
            "submodules": [
                {"id": sm.id, "code": sm.code, "name": sm.name}
                for sm in module.submodules
            ] if module.submodules else []
        }
        result.append(module_dict)
    
    return result


@router.post("/modules", response_model=ModuleResponse)
def create_module(
    data: ModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Create a new permission module"""
    # Check if code exists
    existing = db.query(PermissionModule).filter(PermissionModule.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Module with code '{data.code}' already exists")
    
    # Validate parent module
    if data.parent_module_code:
        parent = db.query(PermissionModule).filter(PermissionModule.code == data.parent_module_code).first()
        if not parent:
            raise HTTPException(status_code=400, detail=f"Parent module '{data.parent_module_code}' not found")
    
    module = PermissionModule(
        code=data.code,
        name=data.name,
        description=data.description,
        icon=data.icon,
        category=data.category,
        sort_order=data.sort_order,
        route_path=data.route_path or f"/{data.code}",
        parent_module_code=data.parent_module_code,
        created_by=current_user.id
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    
    return module


@router.put("/modules/{module_id}", response_model=ModuleResponse)
def update_module(
    module_id: int,
    data: ModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Update a permission module"""
    module = db.query(PermissionModule).filter(PermissionModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    if module.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system modules")
    
    # Update fields
    for field, value in data.dict(exclude_unset=True).items():
        setattr(module, field, value)
    
    db.commit()
    db.refresh(module)
    
    return module


@router.delete("/modules/{module_id}")
def delete_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Delete a permission module (superadmin only)"""
    module = db.query(PermissionModule).filter(PermissionModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    
    if module.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system modules")
    
    # Soft delete
    module.is_active = False
    db.commit()
    
    return {"message": f"Module '{module.code}' deactivated"}


# ═══════════════════════════════════════════════════════════════════════════════
# ROLE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/roles", response_model=List[RoleResponse])
def list_roles(
    is_active: Optional[bool] = Query(None),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all system roles"""
    query = db.query(SystemRole)
    
    if not include_inactive and is_active is not False:
        query = query.filter(SystemRole.is_active == True)
    elif is_active is not None:
        query = query.filter(SystemRole.is_active == is_active)
    
    roles = query.order_by(SystemRole.level.desc()).all()
    
    # Add permissions count
    result = []
    for role in roles:
        perm_count = db.query(RolePermissionMatrix).filter(
            RolePermissionMatrix.role_id == role.id,
            RolePermissionMatrix.is_allowed == True
        ).count()
        
        result.append({
            "id": role.id,
            "code": role.code,
            "name": role.name,
            "description": role.description,
            "level": role.level,
            "is_active": role.is_active,
            "is_system": role.is_system,
            "icon": role.icon,
            "color": role.color,
            "can_access_web": role.can_access_web,
            "can_access_mobile": role.can_access_mobile,
            "permissions_count": perm_count
        })
    
    return result


@router.post("/roles", response_model=RoleResponse)
def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Create a new system role"""
    # Check if code exists
    existing = db.query(SystemRole).filter(SystemRole.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Role with code '{data.code}' already exists")
    
    # Validate parent role
    parent_role_id = None
    if data.parent_role_code:
        parent = db.query(SystemRole).filter(SystemRole.code == data.parent_role_code).first()
        if not parent:
            raise HTTPException(status_code=400, detail=f"Parent role '{data.parent_role_code}' not found")
        parent_role_id = parent.id
    
    role = SystemRole(
        code=data.code,
        name=data.name,
        description=data.description,
        level=data.level,
        parent_role_id=parent_role_id,
        icon=data.icon,
        color=data.color,
        can_access_web=data.can_access_web,
        can_access_mobile=data.can_access_mobile,
        created_by=current_user.id
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    
    return role


@router.put("/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int,
    data: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Update a system role"""
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.is_system and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can modify system roles")
    
    # Update fields
    for field, value in data.dict(exclude_unset=True).items():
        if field == "parent_role_code":
            if value:
                parent = db.query(SystemRole).filter(SystemRole.code == value).first()
                if parent:
                    role.parent_role_id = parent.id
        else:
            setattr(role, field, value)
    
    db.commit()
    db.refresh(role)
    
    return role


@router.get("/roles/{role_code}/permissions", response_model=Dict[str, Dict[str, bool]])
def get_role_permissions(
    role_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Get permission matrix for a role"""
    role = db.query(SystemRole).filter(SystemRole.code == role_code).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Get all modules and actions
    modules = db.query(PermissionModule).filter(PermissionModule.is_active == True).all()
    actions = db.query(PermissionAction).filter(PermissionAction.is_active == True).all()
    
    # Get role permissions
    role_perms = db.query(RolePermissionMatrix).filter(
        RolePermissionMatrix.role_id == role.id,
        RolePermissionMatrix.is_allowed == True
    ).all()
    
    # Build permission dict
    permissions: Dict[str, Dict[str, bool]] = {}
    module_map = {m.id: m.code for m in modules}
    action_map = {a.id: a.code for a in actions}
    
    for mod in modules:
        permissions[mod.code] = {}
        for act in actions:
            permissions[mod.code][act.code] = False
    
    for perm in role_perms:
        mod_code = module_map.get(perm.module_id)
        act_code = action_map.get(perm.action_id)
        if mod_code and act_code:
            permissions[mod_code][act_code] = perm.is_allowed
    
    return permissions


@router.put("/roles/{role_code}/permissions")
def update_role_permissions(
    role_code: str,
    data: RolePermissionsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Update permission matrix for a role"""
    role = db.query(SystemRole).filter(SystemRole.code == role_code).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.is_system and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can modify system role permissions")
    
    # Get module and action mappings
    modules = {m.code: m.id for m in db.query(PermissionModule).all()}
    actions = {a.code: a.id for a in db.query(PermissionAction).all()}
    
    updated = 0
    for item in data.permissions:
        module_id = modules.get(item.module_code)
        action_id = actions.get(item.action_code)
        
        if not module_id or not action_id:
            continue
        
        # Find existing permission
        perm = db.query(RolePermissionMatrix).filter(
            RolePermissionMatrix.role_id == role.id,
            RolePermissionMatrix.module_id == module_id,
            RolePermissionMatrix.action_id == action_id
        ).first()
        
        if perm:
            perm.is_allowed = item.is_allowed
            perm.conditions = item.conditions
            perm.updated_by = current_user.id
        else:
            perm = RolePermissionMatrix(
                role_id=role.id,
                module_id=module_id,
                action_id=action_id,
                is_allowed=item.is_allowed,
                conditions=item.conditions,
                updated_by=current_user.id
            )
            db.add(perm)
        
        updated += 1
    
    db.commit()
    
    return {"message": f"Updated {updated} permissions for role '{role_code}'"}


# ═══════════════════════════════════════════════════════════════════════════════
# ACTION MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/actions", response_model=List[ActionResponse])
def list_actions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all permission actions"""
    actions = db.query(PermissionAction).filter(
        PermissionAction.is_active == True
    ).order_by(PermissionAction.code).all()
    
    return actions


# ═══════════════════════════════════════════════════════════════════════════════
# USER PERMISSION MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/users/{user_id}/permissions", response_model=UserPermissionsResponse)
def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Get comprehensive permissions for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    checker = PermissionChecker(db)
    permissions = checker.get_user_permissions(user)
    allowed_modules = checker.get_allowed_modules(user)
    
    # Get user roles
    role_assignments = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_id,
        UserRoleAssignment.is_active == True
    ).options(joinedload(UserRoleAssignment.role)).all()
    
    roles = [
        {
            "id": ra.role.id,
            "code": ra.role.code,
            "name": ra.role.name,
            "is_primary": ra.is_primary,
            "organization_id": ra.organization_id,
            "department_id": ra.department_id
        }
        for ra in role_assignments if ra.role
    ]
    
    return {
        "user_id": user_id,
        "roles": roles,
        "permissions": permissions,
        "allowed_modules": allowed_modules
    }


@router.post("/users/assign-role")
def assign_role(
    data: UserRoleAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Assign a role to a user"""
    try:
        from datetime import datetime
        valid_until = datetime.fromisoformat(data.valid_until) if data.valid_until else None
        
        assignment = assign_role_to_user(
            db=db,
            user_id=data.user_id,
            role_code=data.role_code,
            assigned_by=current_user.id,
            organization_id=data.organization_id,
            department_id=data.department_id,
            is_primary=data.is_primary,
            valid_until=valid_until
        )
        
        return {
            "message": f"Role '{data.role_code}' assigned to user {data.user_id}",
            "assignment_id": assignment.id
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/users/revoke-role")
def revoke_role(
    user_id: int = Query(...),
    role_code: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Revoke a role from a user"""
    success = revoke_role_from_user(
        db=db,
        user_id=user_id,
        role_code=role_code,
        revoked_by=current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Role assignment not found")
    
    return {"message": f"Role '{role_code}' revoked from user {user_id}"}


@router.post("/users/override-permission")
def create_override(
    data: UserPermissionOverrideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """Create a user-specific permission override"""
    try:
        from datetime import datetime
        expires_at = datetime.fromisoformat(data.expires_at) if data.expires_at else None
        
        override = set_user_permission_override(
            db=db,
            user_id=data.user_id,
            module_code=data.module_code,
            action_code=data.action_code,
            override_type=data.override_type,
            created_by=current_user.id,
            reason=data.reason,
            expires_at=expires_at
        )
        
        return {
            "message": f"Permission override created for user {data.user_id}",
            "override_id": override.id
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/seed", response_model=SeedResponse)
def seed_system(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin)
):
    """Seed the permission system with default data (superadmin only)"""
    try:
        results = seed_permission_system(db, performed_by=current_user.id)
        
        return {
            "success": True,
            "results": results,
            "message": "Permission system seeded successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seeding failed: {str(e)}")


@router.get("/audit-logs", response_model=List[PermissionAuditLogResponse])
def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_above)
):
    """List permission audit logs"""
    query = db.query(PermissionAuditLog)
    
    if entity_type:
        query = query.filter(PermissionAuditLog.entity_type == entity_type)
    
    logs = query.order_by(PermissionAuditLog.performed_at.desc()).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "previous_value": log.previous_value,
            "new_value": log.new_value,
            "performed_by": log.performed_by,
            "performed_at": log.performed_at.isoformat() if log.performed_at else None
        }
        for log in logs
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# MY PERMISSIONS (for current user)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/me")
def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's permissions"""
    checker = PermissionChecker(db)
    
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "role": current_user.role,
        },
        "permissions": checker.get_user_permissions(current_user),
        "allowed_modules": checker.get_allowed_modules(current_user),
        "can_access_web": any(
            ra.role.can_access_web
            for ra in db.query(UserRoleAssignment).filter(
                UserRoleAssignment.user_id == current_user.id,
                UserRoleAssignment.is_active == True
            ).options(joinedload(UserRoleAssignment.role)).all()
            if ra.role
        ) if db.query(UserRoleAssignment).filter(
            UserRoleAssignment.user_id == current_user.id,
            UserRoleAssignment.is_active == True
        ).first() else current_user.role != "employee",
        "can_access_mobile": any(
            ra.role.can_access_mobile
            for ra in db.query(UserRoleAssignment).filter(
                UserRoleAssignment.user_id == current_user.id,
                UserRoleAssignment.is_active == True
            ).options(joinedload(UserRoleAssignment.role)).all()
            if ra.role
        ) if db.query(UserRoleAssignment).filter(
            UserRoleAssignment.user_id == current_user.id,
            UserRoleAssignment.is_active == True
        ).first() else True
    }


@router.get("/me/check")
def check_my_permission(
    module: str = Query(...),
    action: str = Query("read"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if current user has a specific permission"""
    checker = PermissionChecker(db)
    has_perm = checker.has_permission(current_user, module, action)
    
    return {
        "module": module,
        "action": action,
        "has_permission": has_perm
    }
