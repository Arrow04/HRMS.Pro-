"""
Dynamic Permissions System - Enterprise Grade
DB-driven permission checking with role inheritance and user overrides
"""
from typing import Dict, List, Optional, Set
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from fastapi import HTTPException, Depends
from datetime import datetime

from database import get_db
from models import (
    User, SystemRole, PermissionModule, PermissionAction,
    RolePermissionMatrix, UserRoleAssignment, UserPermissionOverride,
    PermissionAuditLog
)
from core.auth import get_current_user

# ═══════════════════════════════════════════════════════════════════════════════
# DEFAULT DATA (for initial seeding)
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_MODULES = [
    {"code": "dashboard", "name": "Dashboard", "category": "general", "icon": "LayoutDashboard", "sort_order": 1},
    {"code": "company", "name": "Company", "category": "admin", "icon": "Building2", "sort_order": 2},
    {"code": "employees", "name": "Employees", "category": "hr", "icon": "Users", "sort_order": 3},
    {"code": "attendance", "name": "Attendance", "category": "hr", "icon": "Clock", "sort_order": 4},
    {"code": "holidays", "name": "Holidays", "category": "hr", "icon": "Calendar", "sort_order": 5},
    {"code": "recruitment", "name": "Recruitment", "category": "hr", "icon": "UserPlus", "sort_order": 6},
    {"code": "leaves", "name": "Leaves", "category": "hr", "icon": "CalendarDays", "sort_order": 7},
    {"code": "payroll", "name": "Payroll", "category": "finance", "icon": "Banknote", "sort_order": 8},
    {"code": "expenses", "name": "Expenses", "category": "finance", "icon": "Receipt", "sort_order": 9},
    {"code": "performance", "name": "Performance", "category": "hr", "icon": "TrendingUp", "sort_order": 10},
    {"code": "reports", "name": "Reports", "category": "general", "icon": "FileText", "sort_order": 11},
    {"code": "master_data", "name": "Master Data", "category": "admin", "icon": "Database", "sort_order": 12},
    {"code": "settings", "name": "Settings", "category": "admin", "icon": "Settings", "sort_order": 13},
    {"code": "superadmin_console", "name": "SuperAdmin Console", "category": "system", "icon": "Shield", "sort_order": 99, "is_system": True},
]

DEFAULT_ACTIONS = [
    {"code": "read", "name": "Read/View", "icon": "Eye", "color": "blue"},
    {"code": "write", "name": "Write/Edit", "icon": "Edit", "color": "green"},
    {"code": "delete", "name": "Delete", "icon": "Trash2", "color": "red"},
    {"code": "create", "name": "Create", "icon": "Plus", "color": "purple"},
    {"code": "approve", "name": "Approve", "icon": "CheckCircle", "color": "teal"},
    {"code": "export", "name": "Export", "icon": "Download", "color": "orange"},
    {"code": "import", "name": "Import", "icon": "Upload", "color": "cyan"},
    {"code": "assign", "name": "Assign", "icon": "UserCheck", "color": "indigo"},
]

DEFAULT_ROLES = [
    {
        "code": "superadmin",
        "name": "Super Administrator",
        "level": 99,
        "is_system": True,
        "can_access_web": True,
        "can_access_mobile": False,
        "color": "red",
        "icon": "Shield"
    },
    {
        "code": "admin",
        "name": "Administrator",
        "level": 10,
        "is_system": True,
        "can_access_web": True,
        "can_access_mobile": True,
        "color": "purple",
        "icon": "UserCog"
    },
    {
        "code": "hr_admin",
        "name": "HR Administrator",
        "level": 8,
        "is_system": True,
        "can_access_web": True,
        "can_access_mobile": True,
        "color": "blue",
        "icon": "Users"
    },
    {
        "code": "hr_manager",
        "name": "HR Manager",
        "level": 6,
        "is_system": True,
        "can_access_web": True,
        "can_access_mobile": True,
        "color": "teal",
        "icon": "UserCheck"
    },
    {
        "code": "manager",
        "name": "Manager",
        "level": 5,
        "is_system": True,
        "can_access_web": True,
        "can_access_mobile": True,
        "color": "orange",
        "icon": "Briefcase"
    },
    {
        "code": "employee",
        "name": "Employee",
        "level": 1,
        "is_system": True,
        "is_default_for_new_users": True,
        "can_access_web": False,
        "can_access_mobile": True,
        "color": "gray",
        "icon": "User"
    },
]

# Default permissions matrix (role_code: {module_code: [action_codes]})
DEFAULT_PERMISSION_MATRIX = {
    "superadmin": {
        "superadmin_console": ["read", "write", "delete", "create"],
    },
    "admin": {
        "dashboard": ["read", "write", "delete", "create", "export"],
        "company": ["read", "write", "delete", "create"],
        "employees": ["read", "write", "delete", "create", "export", "import"],
        "attendance": ["read", "write", "delete", "create", "export"],
        "holidays": ["read", "write", "delete", "create"],
        "recruitment": ["read", "write", "delete", "create"],
        "leaves": ["read", "write", "delete", "create", "approve"],
        "payroll": ["read", "write", "delete", "create", "export"],
        "expenses": ["read", "write", "delete", "create", "approve"],
        "performance": ["read", "write", "delete", "create"],
        "reports": ["read", "export"],
        "master_data": ["read", "write", "delete", "create"],
        "settings": ["read", "write", "delete", "create"],
    },
    "hr_admin": {
        "dashboard": ["read"],
        "employees": ["read", "write", "create", "export", "import"],
        "attendance": ["read", "write", "export"],
        "holidays": ["read", "write"],
        "recruitment": ["read", "write", "create"],
        "leaves": ["read", "write", "approve"],
        "payroll": ["read", "export"],
        "expenses": ["read"],
        "performance": ["read", "write"],
        "reports": ["read"],
        "settings": ["read"],
    },
    "hr_manager": {
        "dashboard": ["read"],
        "employees": ["read", "write"],
        "attendance": ["read", "export"],
        "holidays": ["read"],
        "recruitment": ["read", "write", "create"],
        "leaves": ["read", "approve"],
        "payroll": ["read"],
        "expenses": ["read", "approve"],
        "performance": ["read", "write"],
        "reports": ["read"],
    },
    "manager": {
        "dashboard": ["read"],
        "employees": ["read"],
        "attendance": ["read"],
        "holidays": ["read"],
        "leaves": ["read", "approve"],
        "expenses": ["read", "approve"],
        "performance": ["read", "write"],
    },
    "employee": {
        "attendance": ["read", "write"],
        "leaves": ["read", "write", "create"],
        "expenses": ["read", "write", "create"],
        "performance": ["read"],
        "payroll": ["read"],
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# SEEDING FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def seed_permission_system(db: Session, performed_by: Optional[int] = None):
    """
    Initialize the entire permission system with default data.
    Safe to run multiple times - will skip existing records.
    """
    results = {
        "modules": {"created": 0, "skipped": 0},
        "actions": {"created": 0, "skipped": 0},
        "roles": {"created": 0, "skipped": 0},
        "permissions": {"created": 0, "skipped": 0},
    }
    
    # 1. Seed Modules
    for mod_data in DEFAULT_MODULES:
        existing = db.query(PermissionModule).filter(
            PermissionModule.code == mod_data["code"]
        ).first()
        
        if not existing:
            module = PermissionModule(
                code=mod_data["code"],
                name=mod_data["name"],
                category=mod_data.get("category", "general"),
                icon=mod_data.get("icon"),
                sort_order=mod_data.get("sort_order", 0),
                is_system=mod_data.get("is_system", False),
                route_path=f"/{mod_data['code']}" if mod_data["code"] != "superadmin_console" else "/superadmin/core",
                created_by=performed_by
            )
            db.add(module)
            results["modules"]["created"] += 1
            
            # Audit log
            log = PermissionAuditLog(
                action="created",
                entity_type="module",
                entity_id=0,  # Will be updated after commit
                new_value=mod_data,
                performed_by=performed_by or 1
            )
            db.add(log)
        else:
            results["modules"]["skipped"] += 1
    
    db.commit()  # Commit to get module IDs
    
    # 2. Seed Actions
    for act_data in DEFAULT_ACTIONS:
        existing = db.query(PermissionAction).filter(
            PermissionAction.code == act_data["code"]
        ).first()
        
        if not existing:
            action = PermissionAction(
                code=act_data["code"],
                name=act_data["name"],
                icon=act_data.get("icon"),
                color=act_data.get("color"),
                is_system=True
            )
            db.add(action)
            results["actions"]["created"] += 1
        else:
            results["actions"]["skipped"] += 1
    
    db.commit()
    
    # 3. Seed Roles
    for role_data in DEFAULT_ROLES:
        existing = db.query(SystemRole).filter(
            SystemRole.code == role_data["code"]
        ).first()
        
        if not existing:
            role = SystemRole(
                code=role_data["code"],
                name=role_data["name"],
                level=role_data["level"],
                is_system=role_data.get("is_system", False),
                is_default_for_new_users=role_data.get("is_default_for_new_users", False),
                can_access_web=role_data.get("can_access_web", True),
                can_access_mobile=role_data.get("can_access_mobile", True),
                color=role_data.get("color"),
                icon=role_data.get("icon"),
                created_by=performed_by
            )
            db.add(role)
            results["roles"]["created"] += 1
        else:
            results["roles"]["skipped"] += 1
    
    db.commit()
    
    # 4. Seed Permission Matrix
    # Get all modules, actions, and roles as dicts for quick lookup
    modules = {m.code: m for m in db.query(PermissionModule).all()}
    actions = {a.code: a for a in db.query(PermissionAction).all()}
    roles = {r.code: r for r in db.query(SystemRole).all()}
    
    for role_code, module_perms in DEFAULT_PERMISSION_MATRIX.items():
        role = roles.get(role_code)
        if not role:
            continue
            
        for module_code, action_codes in module_perms.items():
            module = modules.get(module_code)
            if not module:
                continue
                
            for action_code in action_codes:
                action = actions.get(action_code)
                if not action:
                    continue
                
                # Check if permission already exists
                existing = db.query(RolePermissionMatrix).filter(
                    RolePermissionMatrix.role_id == role.id,
                    RolePermissionMatrix.module_id == module.id,
                    RolePermissionMatrix.action_id == action.id
                ).first()
                
                if not existing:
                    perm = RolePermissionMatrix(
                        role_id=role.id,
                        module_id=module.id,
                        action_id=action.id,
                        is_allowed=True,
                        updated_by=performed_by
                    )
                    db.add(perm)
                    results["permissions"]["created"] += 1
                else:
                    results["permissions"]["skipped"] += 1
    
    db.commit()
    
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# PERMISSION CHECKING (DB-DRIVEN)
# ═══════════════════════════════════════════════════════════════════════════════

class PermissionChecker:
    """Enterprise-grade permission checker with caching and inheritance"""
    
    def __init__(self, db: Session):
        self.db = db
        self._cache: Dict[str, any] = {}
    
    def _get_cache_key(self, user_id: int, module_code: str, action_code: str) -> str:
        return f"perm:{user_id}:{module_code}:{action_code}"
    
    def get_user_permissions(self, user: User) -> Dict[str, Dict[str, bool]]:
        """
        Get all permissions for a user, considering:
        - Role-based permissions (with inheritance)
        - User-specific overrides
        - Active role assignments only
        """
        permissions: Dict[str, Dict[str, bool]] = {}
        
        # 1. Get user's active role assignments
        role_assignments = self.db.query(UserRoleAssignment).filter(
            UserRoleAssignment.user_id == user.id,
            UserRoleAssignment.is_active == True,
            or_(
                UserRoleAssignment.valid_until == None,
                UserRoleAssignment.valid_until > datetime.utcnow()
            )
        ).options(joinedload(UserRoleAssignment.role)).all()
        
        if not role_assignments:
            return permissions
        
        # 2. Collect all role IDs including inherited ones
        all_role_ids: Set[int] = set()
        role_levels: Dict[int, int] = {}  # role_id -> level
        
        for assignment in role_assignments:
            role = assignment.role
            if role and role.is_active:
                all_role_ids.add(role.id)
                role_levels[role.id] = role.level
                
                # Get parent roles (inheritance)
                parent = role.parent
                while parent and parent.is_active:
                    all_role_ids.add(parent.id)
                    role_levels[parent.id] = parent.level
                    parent = parent.parent
        
        if not all_role_ids:
            return permissions
        
        # 3. Get role permissions from matrix
        role_perms = self.db.query(RolePermissionMatrix).filter(
            RolePermissionMatrix.role_id.in_(list(all_role_ids)),
            RolePermissionMatrix.is_allowed == True
        ).options(
            joinedload(RolePermissionMatrix.module),
            joinedload(RolePermissionMatrix.action)
        ).all()
        
        # 4. Build permissions dict (higher level = more specific = takes precedence)
        for perm in role_perms:
            if not perm.module or not perm.action:
                continue
                
            module_code = perm.module.code
            action_code = perm.action.code
            role_level = role_levels.get(perm.role_id, 0)
            
            if module_code not in permissions:
                permissions[module_code] = {}
            
            # If we have a permission from a higher-level role, it overrides lower-level
            current_level = permissions[module_code].get(f"_{action_code}_level", 0)
            if role_level >= current_level or perm.is_override:
                permissions[module_code][action_code] = perm.is_allowed
                permissions[module_code][f"_{action_code}_level"] = role_level
        
        # 5. Apply user-specific overrides
        overrides = self.db.query(UserPermissionOverride).filter(
            UserPermissionOverride.user_id == user.id,
            UserPermissionOverride.is_active == True,
            or_(
                UserPermissionOverride.expires_at == None,
                UserPermissionOverride.expires_at > datetime.utcnow()
            )
        ).options(
            joinedload(UserPermissionOverride.module),
            joinedload(UserPermissionOverride.action)
        ).all()
        
        for override in overrides:
            if not override.module or not override.action:
                continue
                
            module_code = override.module.code
            action_code = override.action.code
            
            if module_code not in permissions:
                permissions[module_code] = {}
            
            # Override takes precedence
            permissions[module_code][action_code] = override.override_type == "grant"
        
        return permissions
    
    def has_permission(
        self,
        user: User,
        module_code: str,
        action_code: str = "read",
        organization_id: Optional[int] = None,
        department_id: Optional[int] = None
    ) -> bool:
        """
        Check if user has a specific permission
        """
        # Superadmin check (bypass all)
        user_roles = self.db.query(UserRoleAssignment).filter(
            UserRoleAssignment.user_id == user.id,
            UserRoleAssignment.is_active == True
        ).options(joinedload(UserRoleAssignment.role)).all()
        
        for assignment in user_roles:
            if assignment.role and assignment.role.code == "superadmin":
                # Superadmin only has access to superadmin_console
                return module_code == "superadmin_console"
        
        # Get all permissions for user
        permissions = self.get_user_permissions(user)
        
        # Check module permission
        module_perms = permissions.get(module_code, {})
        return module_perms.get(action_code, False)
    
    def get_allowed_modules(self, user: User) -> List[str]:
        """Get list of modules user has any access to"""
        permissions = self.get_user_permissions(user)
        return [
            module_code
            for module_code, actions in permissions.items()
            if any(actions.values())
        ]
    
    def can_access_module(self, user: User, module_code: str) -> bool:
        """Check if user can access a module (has any action permission)"""
        return self.has_permission(user, module_code, "read")


# ═══════════════════════════════════════════════════════════════════════════════
# FASTAPI DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════════

def require_dynamic_permission(
    module: str,
    action: str = "read"
):
    """
    FastAPI dependency factory for checking dynamic permissions
    Usage: @router.get("/", dependencies=[Depends(require_dynamic_permission("employees", "read"))])
    """
    async def checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        checker = PermissionChecker(db)
        
        if not checker.has_permission(current_user, module, action):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {action} access to {module}"
            )
        return current_user
    return checker


def get_user_permissions_dependency(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Dict[str, bool]]:
    """Get all permissions for current user"""
    checker = PermissionChecker(db)
    return checker.get_user_permissions(current_user)


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def assign_role_to_user(
    db: Session,
    user_id: int,
    role_code: str,
    assigned_by: int,
    organization_id: Optional[int] = None,
    department_id: Optional[int] = None,
    is_primary: bool = False,
    valid_until: Optional[datetime] = None
) -> UserRoleAssignment:
    """Assign a role to a user"""
    
    # Get role
    role = db.query(SystemRole).filter(SystemRole.code == role_code).first()
    if not role:
        raise ValueError(f"Role {role_code} not found")
    
    # Check if assignment already exists
    existing = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_id,
        UserRoleAssignment.role_id == role.id,
        UserRoleAssignment.organization_id == organization_id,
        UserRoleAssignment.department_id == department_id
    ).first()
    
    if existing:
        # Update existing
        existing.is_active = True
        existing.is_primary = is_primary
        existing.valid_until = valid_until
        existing.assigned_by = assigned_by
        assignment = existing
    else:
        # Create new
        assignment = UserRoleAssignment(
            user_id=user_id,
            role_id=role.id,
            organization_id=organization_id,
            department_id=department_id,
            is_primary=is_primary,
            valid_until=valid_until,
            assigned_by=assigned_by
        )
        db.add(assignment)
    
    # Audit log
    log = PermissionAuditLog(
        action="granted" if not existing else "updated",
        entity_type="user_role",
        entity_id=assignment.id,
        new_value={
            "user_id": user_id,
            "role_code": role_code,
            "organization_id": organization_id,
            "department_id": department_id
        },
        performed_by=assigned_by
    )
    db.add(log)
    
    db.commit()
    return assignment


def revoke_role_from_user(
    db: Session,
    user_id: int,
    role_code: str,
    revoked_by: int,
    organization_id: Optional[int] = None,
    department_id: Optional[int] = None
) -> bool:
    """Revoke a role from a user"""
    
    role = db.query(SystemRole).filter(SystemRole.code == role_code).first()
    if not role:
        return False
    
    assignment = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_id,
        UserRoleAssignment.role_id == role.id,
        UserRoleAssignment.organization_id == organization_id,
        UserRoleAssignment.department_id == department_id
    ).first()
    
    if not assignment:
        return False
    
    assignment.is_active = False
    
    # Audit log
    log = PermissionAuditLog(
        action="revoked",
        entity_type="user_role",
        entity_id=assignment.id,
        previous_value={
            "user_id": user_id,
            "role_code": role_code,
            "is_active": True
        },
        new_value={"is_active": False},
        performed_by=revoked_by
    )
    db.add(log)
    
    db.commit()
    return True


def set_user_permission_override(
    db: Session,
    user_id: int,
    module_code: str,
    action_code: str,
    override_type: str,  # "grant" or "deny"
    created_by: int,
    reason: Optional[str] = None,
    expires_at: Optional[datetime] = None
) -> UserPermissionOverride:
    """Set a user-specific permission override"""
    
    # Get module and action
    module = db.query(PermissionModule).filter(PermissionModule.code == module_code).first()
    action = db.query(PermissionAction).filter(PermissionAction.code == action_code).first()
    
    if not module or not action:
        raise ValueError("Module or action not found")
    
    # Check for existing override
    existing = db.query(UserPermissionOverride).filter(
        UserPermissionOverride.user_id == user_id,
        UserPermissionOverride.module_id == module.id,
        UserPermissionOverride.action_id == action.id
    ).first()
    
    if existing:
        existing.override_type = override_type
        existing.is_active = True
        existing.reason = reason
        existing.expires_at = expires_at
        existing.created_by = created_by
        override = existing
    else:
        override = UserPermissionOverride(
            user_id=user_id,
            module_id=module.id,
            action_id=action.id,
            override_type=override_type,
            reason=reason,
            expires_at=expires_at,
            created_by=created_by
        )
        db.add(override)
    
    # Audit log
    log = PermissionAuditLog(
        action="created" if not existing else "updated",
        entity_type="user_permission_override",
        entity_id=override.id,
        new_value={
            "user_id": user_id,
            "module_code": module_code,
            "action_code": action_code,
            "override_type": override_type
        },
        performed_by=created_by
    )
    db.add(log)
    
    db.commit()
    return override
