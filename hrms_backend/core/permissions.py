"""
RBAC Permissions System
Default permissions per role and permission checking utilities
"""
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, Depends
from models import User, ModulePermission, MODULES_LIST, Role
from core.auth import get_current_user
from database import get_db

# ═══════════════════════════════════════════════════════════════════════════════
# DEFAULT PERMISSIONS PER ROLE
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_PERMISSIONS = {
    "superadmin": {
        "superadmin_console": {"can_read": True, "can_write": True, "can_delete": True},
        # All HR modules: False - superadmin only accesses SuperAdmin Console
        "dashboard": {"can_read": False, "can_write": False, "can_delete": False},
        "company": {"can_read": False, "can_write": False, "can_delete": False},
        "employees": {"can_read": False, "can_write": False, "can_delete": False},
        "attendance": {"can_read": False, "can_write": False, "can_delete": False},
        "holidays": {"can_read": False, "can_write": False, "can_delete": False},
        "recruitment": {"can_read": False, "can_write": False, "can_delete": False},
        "leaves": {"can_read": False, "can_write": False, "can_delete": False},
        "payroll": {"can_read": False, "can_write": False, "can_delete": False},
        "expenses": {"can_read": False, "can_write": False, "can_delete": False},
        "performance": {"can_read": False, "can_write": False, "can_delete": False},
        "reports": {"can_read": False, "can_write": False, "can_delete": False},
        "settings": {"can_read": False, "can_write": False, "can_delete": False},
    },
    "admin": {
        # All HR modules: full access
        "dashboard": {"can_read": True, "can_write": True, "can_delete": True},
        "company": {"can_read": True, "can_write": True, "can_delete": True},
        "employees": {"can_read": True, "can_write": True, "can_delete": True},
        "attendance": {"can_read": True, "can_write": True, "can_delete": True},
        "holidays": {"can_read": True, "can_write": True, "can_delete": True},
        "recruitment": {"can_read": True, "can_write": True, "can_delete": True},
        "leaves": {"can_read": True, "can_write": True, "can_delete": True},
        "payroll": {"can_read": True, "can_write": True, "can_delete": True},
        "expenses": {"can_read": True, "can_write": True, "can_delete": True},
        "performance": {"can_read": True, "can_write": True, "can_delete": True},
        "reports": {"can_read": True, "can_write": True, "can_delete": True},
        "settings": {"can_read": True, "can_write": True, "can_delete": True},
        # SuperAdmin Console: False
        "superadmin_console": {"can_read": False, "can_write": False, "can_delete": False},
    },
    "hr_admin": {
        # Empty - assigned by admin
    },
    "hr_manager": {
        # Empty - assigned by admin
    },
    "hr_executive": {
        # Empty - assigned by admin
    },
    "employee": {
        # Self-service modules only
        "attendance": {"can_read": True, "can_write": True, "can_delete": False},
        "leaves": {"can_read": True, "can_write": True, "can_delete": False},
        "expenses": {"can_read": True, "can_write": True, "can_delete": False},
        "performance": {"can_read": True, "can_write": False, "can_delete": False},
        "payroll": {"can_read": True, "can_write": False, "can_delete": False},
        # All other modules: False
        "dashboard": {"can_read": False, "can_write": False, "can_delete": False},
        "company": {"can_read": False, "can_write": False, "can_delete": False},
        "employees": {"can_read": False, "can_write": False, "can_delete": False},
        "holidays": {"can_read": False, "can_write": False, "can_delete": False},
        "recruitment": {"can_read": False, "can_write": False, "can_delete": False},
        "reports": {"can_read": False, "can_write": False, "can_delete": False},
        "settings": {"can_read": False, "can_write": False, "can_delete": False},
        "superadmin_console": {"can_read": False, "can_write": False, "can_delete": False},
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# PERMISSION SEEDING
# ═══════════════════════════════════════════════════════════════════════════════

def seed_default_permissions(user: User, db: Session, granted_by: Optional[int] = None):
    """Seed default permissions for a new user based on their role"""
    role_permissions = DEFAULT_PERMISSIONS.get(user.role, {})
    
    for module, perms in role_permissions.items():
        # Check if permission already exists
        existing = db.query(ModulePermission).filter(
            ModulePermission.user_id == user.id,
            ModulePermission.module == module
        ).first()
        
        cr = perms.get("can_read", False)
        cw = perms.get("can_write", False)
        cd = perms.get("can_delete", False)
        lvl = _level_from_flags(cr, cw, cd)
        
        if existing:
            # Update existing
            existing.can_read = cr
            existing.can_write = cw
            existing.can_delete = cd
            existing.level = lvl
            if existing.menu_visible is None:
                existing.menu_visible = lvl != "none"
        else:
            # Create new
            perm = ModulePermission(
                user_id=user.id,
                module=module,
                level=lvl,
                can_read=cr,
                can_write=cw,
                can_delete=cd,
                menu_visible=(lvl != "none"),
                granted_by=granted_by
            )
            db.add(perm)
    
    db.commit()

def reset_to_role_defaults(user: User, db: Session, granted_by: Optional[int] = None):
    """Reset user permissions to their role defaults"""
    # Delete existing permissions
    db.query(ModulePermission).filter(ModulePermission.user_id == user.id).delete()
    
    # Seed defaults
    seed_default_permissions(user, db, granted_by)

# ═══════════════════════════════════════════════════════════════════════════════
# PERMISSION CHECKING FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def has_module_permission(
    user: User,
    module: str,
    action: str = "read",
    db: Optional[Session] = None
) -> bool:
    """
    Check if user has permission for a specific module and action.
    This is the SINGLE SOURCE OF TRUTH for permission checking.
    """
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # ROLE-BASED PERMISSIONS (Hardcoded for system roles)
    # ═══════════════════════════════════════════════════════════════════════════════
    
    # SUPERADMIN: Full access to every HR module
    if user.role == "superadmin":
        return True
    
    # ADMIN: Full access to all modules except superadmin_console
    if user.role == "admin":
        return module != "superadmin_console"
    
    # EMPLOYEE: Limited to self-service modules
    if user.role == "employee":
        employee_modules = ["attendance", "leaves", "expenses", "performance", "payroll"]
        if module not in employee_modules:
            return False
        # Check specific action from defaults
        role_perms = DEFAULT_PERMISSIONS.get("employee", {})
        module_perms = role_perms.get(module, {})
        return module_perms.get(f"can_{action}", False)
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # DB-BASED PERMISSIONS (For hr_admin, hr_manager, manager, custom roles)
    # ═══════════════════════════════════════════════════════════════════════════════
    
    if db:
        # Check if user has specific permission in DB
        perm = db.query(ModulePermission).filter(
            ModulePermission.user_id == user.id,
            ModulePermission.module == module
        ).first()
        
        if perm:
            # Menu visibility gate: hidden modules are inaccessible
            if perm.menu_visible is False:
                return False
            if action == "read":
                return perm.can_read
            elif action == "write":
                return perm.can_write
            elif action == "delete":
                return perm.can_delete
    
    # Fallback to default permissions
    role_perms = DEFAULT_PERMISSIONS.get(user.role, {})
    module_perms = role_perms.get(module, {})
    
    return module_perms.get(f"can_{action}", False)

def _level_from_flags(can_read: bool, can_write: bool, can_delete: bool) -> str:
    if can_read and can_write and can_delete:
        return "full"
    if can_read and can_write:
        return "edit"
    if can_read:
        return "view"
    return "none"

def _flags_from_level(level: str) -> tuple:
    level = (level or "none").lower()
    if level == "full":
        return (True, True, True)
    if level == "edit":
        return (True, True, False)
    if level == "view":
        return (True, False, False)
    return (False, False, False)

def get_user_permissions(user: User, db: Session) -> List[Dict]:
    """Get all permissions for a user - includes defaults + DB overrides"""
    
    # Start with default permissions for the role
    default_perms = DEFAULT_PERMISSIONS.get(user.role, {})
    permissions_dict = {
        module: {
            "module": module,
            "level": _level_from_flags(perms.get("can_read", False), perms.get("can_write", False), perms.get("can_delete", False)),
            "can_read": perms.get("can_read", False),
            "can_write": perms.get("can_write", False),
            "can_delete": perms.get("can_delete", False),
            "menu_visible": True
        }
        for module, perms in default_perms.items()
    }
    
    # Overlay with DB permissions (these override defaults)
    db_perms = db.query(ModulePermission).filter(ModulePermission.user_id == user.id).all()
    for p in db_perms:
        level = p.level or _level_from_flags(p.can_read, p.can_write, p.can_delete)
        permissions_dict[p.module] = {
            "module": p.module,
            "level": level,
            "can_read": p.can_read,
            "can_write": p.can_write,
            "can_delete": p.can_delete,
            "menu_visible": p.menu_visible if p.menu_visible is not None else True
        }
    
    return list(permissions_dict.values())

def get_allowed_modules(user: User, action: str = "read", db: Optional[Session] = None) -> List[str]:
    """Get list of modules user has permission for (respecting menu visibility)"""
    
    # Superadmin: full access to every HR module
    if user.role == "superadmin":
        return [m for m in MODULES_LIST if m != "superadmin_console"]
    
    # Admin: all modules except superadmin_console
    if user.role == "admin":
        return [m for m in MODULES_LIST if m != "superadmin_console"]
    
    # Employee: restricted modules
    if user.role == "employee":
        employee_modules = ["attendance", "leaves", "expenses", "performance", "payroll"]
        return [m for m in MODULES_LIST if m in employee_modules]
    
    # Other roles: check DB permissions (respecting menu visibility)
    allowed = []
    for module in MODULES_LIST:
        if has_module_permission(user, module, action, db):
            allowed.append(module)
    
    return allowed

# ═══════════════════════════════════════════════════════════════════════════════
# FASTAPI DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════════

def require_superadmin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Dependency to require superadmin role"""
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=403,
            detail="Superadmin access required"
        )
    return current_user

def require_admin_or_above(
    current_user: User = Depends(get_current_user)
) -> User:
    """Dependency to require admin or superadmin role"""
    if current_user.role not in ["superadmin", "admin", "hr_admin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin or superadmin access required"
        )
    return current_user

def require_module_access(module: str, action: str = "read"):
    """Factory function to create module access dependency"""
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> User:
        # Superadmin can only access superadmin_console
        if current_user.role == "superadmin" and module != "superadmin_console":
            raise HTTPException(
                status_code=403,
                detail="Superadmin cannot access HR modules. Use SuperAdmin Console only."
            )
        
        # Admin has full access
        if current_user.role == "admin" and module != "superadmin_console":
            return current_user
        
        # Check module permission
        if not has_module_permission(current_user, module, action, db):
            raise HTTPException(
                status_code=403,
                detail=f"You do not have {action} permission for {module} module"
            )
        
        return current_user
    return dependency

# ═══════════════════════════════════════════════════════════════════════════════
# PERMISSION ASSIGNMENT HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def can_assign_permissions(assigner_role: str, target_role: str) -> bool:
    """Check if assigner can assign permissions to target role"""
    # Role hierarchy
    hierarchy = {
        "superadmin": 6,
        "admin": 5,
        "hr_admin": 4,
        "hr_manager": 3,
        "hr_executive": 2,
        "employee": 1
    }
    
    assigner_level = hierarchy.get(assigner_role, 0)
    target_level = hierarchy.get(target_role, 0)
    
    # Admin and above can assign permissions to lower or equal roles
    if assigner_role == "admin" and target_level < assigner_level:
        return True
    
    # Superadmin can assign to anyone
    if assigner_role == "superadmin":
        return True
    
    return False

def set_module_permission(
    user_id: int,
    module: str,
    can_read: bool,
    can_write: bool,
    can_delete: bool,
    db: Session,
    granted_by: Optional[int] = None,
    level: Optional[str] = None,
    menu_visible: Optional[bool] = None
) -> ModulePermission:
    """Set or update a module permission for a user"""
    
    existing = db.query(ModulePermission).filter(
        ModulePermission.user_id == user_id,
        ModulePermission.module == module
    ).first()
    
    if level:
        can_read, can_write, can_delete = _flags_from_level(level)
    
    if existing:
        existing.can_read = can_read
        existing.can_write = can_write
        existing.can_delete = can_delete
        if level:
            existing.level = level
        if menu_visible is not None:
            existing.menu_visible = menu_visible
        db.commit()
        return existing
    else:
        new_perm = ModulePermission(
            user_id=user_id,
            module=module,
            level=level or _level_from_flags(can_read, can_write, can_delete),
            can_read=can_read,
            can_write=can_write,
            can_delete=can_delete,
            menu_visible=True if menu_visible is None else menu_visible,
            granted_by=granted_by
        )
        db.add(new_perm)
        db.commit()
        return new_perm
