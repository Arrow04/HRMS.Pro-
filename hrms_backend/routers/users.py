from typing import List, Optional
from datetime import datetime, date, time
from core.datetime_utils import ist_now_naive

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.auth import get_current_user, get_password_hash
from core.tenant import org_owned
from database import get_db
from models import User, Employee, ModulePermission, Candidate
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["users"])

USER_MANAGER_ROLES = ("admin", "superadmin", "hr_admin", "hr_manager", "hr_executive")


def _parse_date(value):
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _parse_time(value):
    if isinstance(value, time):
        return value
    if isinstance(value, str) and value:
        try:
            return time.fromisoformat(value[:8])
        except ValueError:
            return None
    return None


class UserResponse(BaseModel):
    id: int
    email: str
    fullName: Optional[str] = Field(None, alias="full_name", serialization_alias="fullName")
    phone: Optional[str] = None
    organizationId: Optional[int] = Field(None, alias="organization_id", serialization_alias="organizationId")
    isLockedToDevice: Optional[bool] = Field(False, alias="is_locked_to_device", serialization_alias="isLockedToDevice")
    deviceId: Optional[str] = Field(None, alias="device_id", serialization_alias="deviceId")
    role: str
    isActive: bool = Field(True, alias="is_active", serialization_alias="isActive")
    dateJoined: Optional[date] = Field(None, alias="date_joined", serialization_alias="dateJoined")
    joinTime: Optional[time] = Field(None, alias="join_time", serialization_alias="joinTime")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class UserRoleUpdate(BaseModel):
    role: str


class UserCreate(BaseModel):
    email: str
    password: str
    phone: Optional[str] = None
    role: Optional[str] = "employee"
    permissions: Optional[dict] = None


@router.post("", response_model=dict)
def create_user(
    user_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create users",
        )

    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(user_data)

    new_email = (snake_case_data.get("email") or "").strip().lower()
    new_phone = (snake_case_data.get("phone") or "").strip()

    # Only a superadmin may provision admin/superadmin accounts.
    if current_user.role != "superadmin" and snake_case_data.get("role") in ("admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create admin users",
        )

    # Email and phone are used for login, so they must be unique across users,
    # employees and candidates.
    if new_email:
        if db.query(User).filter(func.lower(User.email) == new_email).first():
            raise HTTPException(status_code=409, detail="Email already exists")
        if db.query(Employee).filter(func.lower(Employee.email) == new_email).first():
            raise HTTPException(status_code=409, detail="Email already exists")
        if db.query(Candidate).filter(func.lower(Candidate.email) == new_email).first():
            raise HTTPException(status_code=409, detail="Email already exists")
    if new_phone:
        if db.query(User).filter(User.phone == new_phone).first():
            raise HTTPException(status_code=409, detail="Phone number already exists")
        if db.query(Employee).filter(Employee.phone == new_phone).first():
            raise HTTPException(status_code=409, detail="Phone number already exists")
        if db.query(Candidate).filter(Candidate.phone == new_phone).first():
            raise HTTPException(status_code=409, detail="Phone number already exists")

    # Passcodes are credentials: store only a hash (login-passkey verifies
    # with passlib). A blank value means "no passkey".
    _raw_passcode = (snake_case_data.get("passcode") or "").strip()

    new_user = User(
        email=snake_case_data.get("email"),
        password_hash=get_password_hash(snake_case_data.get("password")),
        full_name=snake_case_data.get("full_name") or snake_case_data.get("email").split('@')[0],
        role=snake_case_data.get("role", "employee"),
        phone=snake_case_data.get("phone"),
        passcode=get_password_hash(_raw_passcode) if _raw_passcode else None,
        organization_id=current_user.organization_id,
        is_active=snake_case_data.get("is_active", True),
        date_joined=_parse_date(snake_case_data.get("date_joined")),
        join_time=_parse_time(snake_case_data.get("join_time")),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create employee record
    employee_code = f"EMP-{new_user.id:06d}"
    first_name_val = new_user.full_name.split()[0] if new_user.full_name else new_user.email.split("@")[0]
    last_name_val = " ".join(new_user.full_name.split()[1:]) if (new_user.full_name and len(new_user.full_name.split()) > 1) else ""

    employee = Employee(
        user_id=new_user.id,
        email=new_user.email,
        first_name=first_name_val,
        last_name=last_name_val,
        organization_id=new_user.organization_id,
        employee_code=employee_code,
        status="active",
    )

    db.add(employee)
    db.commit()

    # Create module permissions if provided
    if snake_case_data.get("permissions"):
        for module, perm_level in snake_case_data.get("permissions").items():
            if isinstance(perm_level, dict):
                lvl = perm_level.get("level") or (
                    "full" if perm_level.get("can_read") and perm_level.get("can_write") and perm_level.get("can_delete")
                    else "edit" if perm_level.get("can_read") and perm_level.get("can_write")
                    else "view" if perm_level.get("can_read")
                    else "none"
                )
                menu_vis = perm_level.get("menu_visible", lvl != "none")
                can_read = perm_level.get("can_read", lvl in ["view", "edit", "full"])
                can_write = perm_level.get("can_write", lvl in ["edit", "full"])
                can_delete = perm_level.get("can_delete", lvl == "full")
            else:
                lvl = perm_level if perm_level in ["none", "view", "edit", "full"] else (
                    "full" if perm_level == "write" else "view" if perm_level == "read" else "none"
                )
                menu_vis = lvl != "none"
                can_read = lvl in ["view", "edit", "full"]
                can_write = lvl in ["edit", "full"]
                can_delete = lvl == "full"
            
            module_perm = ModulePermission(
                user_id=new_user.id,
                module=module,
                level=lvl,
                can_read=can_read,
                can_write=can_write,
                can_delete=can_delete,
                menu_visible=menu_vis,
                granted_by=current_user.id
            )
            db.add(module_perm)
        db.commit()

    return {"message": "User created successfully", "userId": new_user.id}


@router.get("", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access user management",
        )
    query = db.query(User).filter(User.deleted_at == None)
    if current_user.role != "superadmin":
        # superadmin is a platform (tenant-hub) role — never listed inside a tenant
        query = query.filter(
            User.organization_id == current_user.organization_id,
            User.role != "superadmin",
        )
    return query.all()


class UserUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[dict] = None


@router.put("/{user_id}", response_model=dict)
def update_user(
    user_id: int,
    user_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update users",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin":
        org_owned(user, current_user.organization_id)

    # Convert camelCase to snake_case for backend compatibility
    snake_case_data = convert_camel_to_snake(user_data)

    if snake_case_data.get("email"):
        user.email = snake_case_data["email"]
        if snake_case_data.get("full_name"):
            user.full_name = snake_case_data["full_name"]
        elif user.full_name == user.email.split('@')[0]:
            user.full_name = snake_case_data["email"].split('@')[0]

    if snake_case_data.get("full_name") is not None and snake_case_data.get("email") is None:
        user.full_name = snake_case_data["full_name"]

    if snake_case_data.get("phone") is not None:
        user.phone = snake_case_data["phone"]

    if snake_case_data.get("passcode") is not None:
        # None keeps the current value; blank keeps it too (the edit form
        # cannot read stored hashes back); a non-blank value is re-hashed.
        _new_passcode = str(snake_case_data["passcode"]).strip()
        if _new_passcode:
            user.passcode = get_password_hash(_new_passcode)

    if snake_case_data.get("password"):
        user.password_hash = get_password_hash(snake_case_data["password"])
        # Invalidate every existing session/token for this account.
        user.token_version = (user.token_version or 0) + 1

    if snake_case_data.get("role"):
        new_role = snake_case_data["role"]
        if current_user.role != "superadmin" and new_role in ("admin", "superadmin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to assign this role",
            )
        user.role = new_role

    if snake_case_data.get("is_active") is not None:
        user.is_active = bool(snake_case_data["is_active"])
    if snake_case_data.get("date_joined"):
        user.date_joined = _parse_date(snake_case_data["date_joined"])
    if snake_case_data.get("join_time"):
        user.join_time = _parse_time(snake_case_data["join_time"])

    db.commit()
    db.refresh(user)

    # Update permissions if provided
    if snake_case_data.get("permissions"):
        # Delete existing permissions
        db.query(ModulePermission).filter(ModulePermission.user_id == user_id).delete()
        
        # Add new permissions
        for module, perm_level in snake_case_data.get("permissions").items():
            if isinstance(perm_level, dict):
                lvl = perm_level.get("level") or (
                    "full" if perm_level.get("can_read") and perm_level.get("can_write") and perm_level.get("can_delete")
                    else "edit" if perm_level.get("can_read") and perm_level.get("can_write")
                    else "view" if perm_level.get("can_read")
                    else "none"
                )
                menu_vis = perm_level.get("menu_visible", lvl != "none")
                can_read = perm_level.get("can_read", lvl in ["view", "edit", "full"])
                can_write = perm_level.get("can_write", lvl in ["edit", "full"])
                can_delete = perm_level.get("can_delete", lvl == "full")
            else:
                lvl = perm_level if perm_level in ["none", "view", "edit", "full"] else (
                    "full" if perm_level == "write" else "view" if perm_level == "read" else "none"
                )
                menu_vis = lvl != "none"
                can_read = lvl in ["view", "edit", "full"]
                can_write = lvl in ["edit", "full"]
                can_delete = lvl == "full"
            
            module_perm = ModulePermission(
                user_id=user_id,
                module=module,
                level=lvl,
                can_read=can_read,
                can_write=can_write,
                can_delete=can_delete,
                menu_visible=menu_vis,
                granted_by=current_user.id
            )
            db.add(module_perm)
        db.commit()

    return {"message": "User updated successfully"}


@router.put("/{user_id}/role", response_model=dict)
def update_user_role(
    user_id: int,
    role_data: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update roles",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin":
        org_owned(user, current_user.organization_id)
        if role_data.role in ("admin", "superadmin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to assign this role",
            )

    if user.id == current_user.id and user.role == "superadmin" and role_data.role != "superadmin":
        pass

    user.role = role_data.role
    db.commit()
    db.refresh(user)
    return {"message": "User role updated successfully", "userId": user.id, "role": user.role}


class UserStatusUpdate(BaseModel):
    is_active: Optional[bool] = None
    isActive: Optional[bool] = None  # camelCase variant sent by the web UI

    def resolved_active(self) -> bool:
        if self.is_active is not None:
            return self.is_active
        if self.isActive is not None:
            return self.isActive
        return False


@router.put("/{user_id}/status", response_model=dict)
def update_user_status(
    user_id: int,
    status_data: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Activate or deactivate a user account."""
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update user status",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin":
        org_owned(user, current_user.organization_id)

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own status")

    user.is_active = status_data.resolved_active()
    db.commit()
    db.refresh(user)
    return {"message": "User status updated", "userId": user.id, "is_active": user.is_active}


@router.delete("/{user_id}", response_model=dict)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete users",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin":
        org_owned(user, current_user.organization_id)

    # Prevent deletion of admin users (except by superadmin)
    if user.role == "admin" and current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete admin users",
        )

    # Prevent deletion of superadmin users
    if user.role == "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete superadmin users",
        )

    # Soft delete - set deleted_at timestamp
    user.deleted_at = ist_now_naive()
    db.commit()
    return {"message": "User deleted successfully", "userId": user.id}


# ---------------------------------------------------------------------------
# Provision User accounts for orphan employees (userId is NULL)
# ---------------------------------------------------------------------------

def _find_orphan_employees(db: Session):
    """Split active employees without a linked user into provisionable/skipped."""
    orphans = db.query(Employee).filter(
        Employee.user_id.is_(None),
        Employee.deleted_at.is_(None),
    ).all()
    provisionable, skipped = [], 0
    for emp in orphans:
        email = (emp.email or "").strip().lower()
        if not email:
            skipped += 1
            continue
        if db.query(User).filter(func.lower(User.email) == email).first():
            skipped += 1
            continue
        provisionable.append(emp)
    return provisionable, skipped


@router.get("/provision-all/preview", response_model=dict)
def provision_all_preview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dry-run: who would get an account, so the UI can ask for confirmation."""
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")
    provisionable, skipped = _find_orphan_employees(db)
    return {
        "count": len(provisionable),
        "skipped": skipped,
        "employees": [
            {
                "id": emp.id,
                "name": emp.full_name or f"{emp.first_name or ''} {emp.last_name or ''}".strip() or emp.email,
                "email": emp.email,
            }
            for emp in provisionable[:50]
        ],
    }


@router.post("/provision-all", response_model=dict)
def provision_all_orphan_employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")

    provisionable, skipped = _find_orphan_employees(db)

    default_password = "TempPass123!"
    created = 0

    for emp in provisionable:
        user_phone = None
        if emp.phone:
            if not db.query(User).filter(User.phone == str(emp.phone).strip()).first():
                user_phone = str(emp.phone).strip()

        new_user = User(
            email=emp.email,
            password_hash=get_password_hash(default_password),
            full_name=emp.full_name or f"{emp.first_name or ''} {emp.last_name or ''}".strip() or emp.email.split("@")[0],
            role="employee",
            phone=user_phone,
            organization_id=emp.organization_id or current_user.organization_id,
            is_active=True,
        )
        db.add(new_user)
        db.flush()

        emp.user_id = new_user.id
        created += 1

    db.commit()

    return {
        "message": f"Provisioned {created} user accounts ({skipped} skipped)",
        "created": created,
        "skipped": skipped,
        "defaultPassword": default_password,
    }


@router.post("/provision", response_model=dict)
def provision_single_employee(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in USER_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")

    employee_id = data.get("employeeId") or data.get("employee_id")
    if not employee_id:
        raise HTTPException(status_code=400, detail="employeeId is required")

    emp = db.query(Employee).filter(Employee.id == employee_id, Employee.deleted_at.is_(None)).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if emp.user_id:
        existing_user = db.query(User).filter(User.id == emp.user_id).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Employee already has a linked user account")

    email = (emp.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Employee has no email address")

    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="Email already exists as a user")

    user_phone = None
    if emp.phone:
        if not db.query(User).filter(User.phone == str(emp.phone).strip()).first():
            user_phone = str(emp.phone).strip()

    default_password = data.get("password") or "TempPass123!"
    new_user = User(
        email=emp.email,
        password_hash=get_password_hash(default_password),
        full_name=emp.full_name or f"{emp.first_name or ''} {emp.last_name or ''}".strip() or emp.email.split("@")[0],
        role="employee",
        phone=user_phone,
        organization_id=emp.organization_id or current_user.organization_id,
        is_active=True,
    )
    db.add(new_user)
    db.flush()

    emp.user_id = new_user.id
    db.commit()

    return {
        "message": f"User account created for {emp.full_name or emp.email}",
        "userId": new_user.id,
        "employeeId": emp.id,
        "email": emp.email,
        "defaultPassword": default_password,
    }
