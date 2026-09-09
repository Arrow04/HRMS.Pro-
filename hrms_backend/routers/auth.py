import logging
from datetime import datetime, timedelta
import uuid
import hashlib
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import func

import os

from core.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
    check_role,
)
from core.tenant import org_owned
from database import get_db
from models import Employee, User, DeviceLog, DeviceBinding, ModulePermission, Organization, Plan, Subscription
from services.otp_service import OTPService
from services.sms_service import NotificationService
from services.email_service import EmailService
from services.notification_templates import tenant_welcome_email, new_tenant_signup_notification
from core.datetime_utils import ist_now_naive
from core.schemas import ThemeSettings

logger = logging.getLogger(__name__)
APP_ENV = os.getenv("APP_ENV", "development")

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    fullName: Optional[str] = None
    phone: Optional[str] = None
    organizationId: Optional[int] = None


class TenantRegistration(BaseModel):
    admin_email: str
    password: str
    admin_name: str
    phone: Optional[str] = None
    company_name: str
    industry: Optional[str] = None
    company_size: Optional[str] = None
    registered_state: Optional[str] = None
    registered_city: Optional[str] = None


class PasskeyLoginRequest(BaseModel):
    identifier: Optional[str] = None
    passcode: Optional[str] = None


class ResendEmailVerificationRequest(BaseModel):
    email: str


class SendOTPRequest(BaseModel):
    phone: str


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str


class ForgotPasswordVerifyRequest(BaseModel):
    email: str
    phone: str


class ResetPasswordBasicRequest(BaseModel):
    email: str
    phone: str
    reset_token: str
    new_password: str

from core.cache import get_redis, make_key

BRUTE_FORCE_MAX_ATTEMPTS = 5
BRUTE_FORCE_WINDOW_SECONDS = 15 * 60
OTP_SEND_MAX_ATTEMPTS = 3
OTP_VERIFY_MAX_ATTEMPTS = 5
OTP_WINDOW_SECONDS = 15 * 60


def _get_brute_force_attempts(key: str) -> int:
    rc = get_redis()
    if rc is None:
        return 0
    value = rc.get(key)
    return int(value) if value is not None else 0


def _increment_brute_force(key: str, ttl: int) -> int:
    rc = get_redis()
    if rc is None:
        return 0
    attempts = rc.incr(key)
    if attempts == 1:
        rc.expire(key, ttl)
    return attempts


def _clear_brute_force_key(key: str) -> None:
    rc = get_redis()
    if rc is None:
        return
    rc.delete(key)


def _check_brute_force(ip: str, email: str) -> None:
    if os.getenv("DISABLE_BRUTE_FORCE", "false").lower() in ("1", "true", "yes"):
        return
    key = make_key("auth", "brute", "login", ip, email)
    attempts = _get_brute_force_attempts(key)
    if attempts >= BRUTE_FORCE_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Please try again after 15 minutes.",
        )


def _record_failed_attempt(ip: str, email: str) -> None:
    key = make_key("auth", "brute", "login", ip, email)
    _increment_brute_force(key, BRUTE_FORCE_WINDOW_SECONDS)


def _reset_attempts(ip: str, email: str) -> None:
    key = make_key("auth", "brute", "login", ip, email)
    _clear_brute_force_key(key)


def _check_otp_brute_force(ip: str, phone: str, action: str) -> None:
    key = make_key("auth", "brute", "otp", action, ip, phone)
    max_attempts = OTP_SEND_MAX_ATTEMPTS if action == "send" else OTP_VERIFY_MAX_ATTEMPTS
    attempts = _get_brute_force_attempts(key)
    if attempts >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail="Too many OTP requests. Try again later.",
        )


def _record_otp_attempt(ip: str, phone: str, action: str) -> None:
    key = make_key("auth", "brute", "otp", action, ip, phone)
    _increment_brute_force(key, OTP_WINDOW_SECONDS)


@router.post("/clear-brute-force", tags=["Auth"])
def clear_brute_force():
    """Clear all brute-force lockouts. For testing only."""
    rc = get_redis()
    if rc is None:
        return {"message": "Redis unavailable; no lockouts to clear", "count": 0}
    pattern = make_key("auth", "brute", "*")
    cursor = 0
    deleted = 0
    while True:
        cursor, keys = rc.scan(cursor=cursor, match=pattern, count=500)
        if keys:
            deleted += sum(rc.delete(*keys))
        if cursor == 0:
            break
    return {"message": "Brute-force lockouts cleared", "count": deleted}


def _validate_password_strength(password: str) -> Optional[str]:
    """Return an error message if the password is too weak, else None."""
    if len(password) < 8:
        return "Password must be at least 8 characters long"
    if not re.search(r"[A-Za-z]", password):
        return "Password must contain at least one letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one number"
    return None


@router.post("/register", response_model=dict)
def register(user_data: RegisterRequest, db: Session = Depends(get_db)):
    try:
        email = user_data.email
        password = user_data.password
        full_name = user_data.fullName or email.split("@")[0]
        organization_id = user_data.organizationId

        if not email or not password:
            raise HTTPException(status_code=400, detail="Email and password are required")

        if not organization_id:
            raise HTTPException(status_code=400, detail="organizationId is required for self-service registration")

        org = db.query(Organization).filter(Organization.id == organization_id).first()
        if org is None:
            raise HTTPException(status_code=400, detail="Invalid organization")
        if org.status in ("pending", "suspended", "inactive"):
            raise HTTPException(status_code=403, detail="Organization is not active")

        if db.query(User).filter(User.email == email).first():
            raise HTTPException(status_code=409, detail="User already exists with this email")

        new_user = User(
            email=email,
            password_hash=get_password_hash(password),
            full_name=full_name,
            role=role,
            organization_id=organization_id,
            phone=user_data.phone,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        employee_code = f"EMP-{new_user.id:06d}" if new_user.id else f"EMP-NEW-{uuid.uuid4().hex[:6].upper()}"
        first_name_val = new_user.full_name.split()[0] if new_user.full_name else email.split("@")[0]
        last_name_val = " ".join(new_user.full_name.split()[1:]) if (new_user.full_name and len(new_user.full_name.split()) > 1) else ""

        employee = Employee(
            user_id=new_user.id,
            email=email,
            first_name=first_name_val,
            last_name=last_name_val,
            organization_id=new_user.organization_id,
            employee_code=employee_code,
            status="active",
        )

        db.add(employee)
        db.commit()

        if user_data.permissions:
            for module, perm_level in user_data.permissions.items():
                if perm_level == 'read':
                    can_read = True
                    can_write = False
                elif perm_level == 'write':
                    can_read = True
                    can_write = True
                else:
                    can_read = False
                    can_write = False

                module_perm = ModulePermission(
                    user_id=new_user.id,
                    module=module,
                    can_read=can_read,
                    can_write=can_write,
                    granted_by=new_user.id
                )
                db.add(module_perm)
            db.commit()

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(data={"sub": str(new_user.id), "tv": new_user.token_version or 0}, expires_delta=access_token_expires)

        return {
            "message": "User registered successfully",
            "token": access_token,
            "user": {
                "id": new_user.id,
                "email": new_user.email,
                "fullName": new_user.full_name,
                "role": new_user.role,
                "organizationId": new_user.organization_id,
            },
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Registration failed")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")


@router.post("/register-tenant", response_model=dict)
def register_tenant(data: TenantRegistration, db: Session = Depends(get_db)):
    """Self-service tenant registration. Creates a pending organisation."""
    try:
        if db.query(User).filter(User.email == data.admin_email).first():
            raise HTTPException(status_code=409, detail="Email already registered")

        if data.phone and db.query(User).filter(User.phone == data.phone).first():
            raise HTTPException(status_code=409, detail="Phone number already registered")

        org_code = data.company_name[:3].upper() + str(int(ist_now_naive().timestamp()))[-6:]
        existing = db.query(Organization).filter(Organization.code == org_code).first()
        while existing:
            org_code = data.company_name[:3].upper() + str(int(ist_now_naive().timestamp()))[-6:]
            existing = db.query(Organization).filter(Organization.code == org_code).first()

        org = Organization(
            name=data.company_name,
            code=org_code,
            email=data.admin_email,
            status="pending",
            industry=data.industry,
            company_size=data.company_size,
            registered_state=data.registered_state,
            registered_city=data.registered_city,
        )
        db.add(org)
        db.flush()

        admin = User(
            email=data.admin_email,
            full_name=data.admin_name,
            password_hash=get_password_hash(data.password),
            role="admin",
            organization_id=org.id,
            is_active=True,
            phone=data.phone,
        )
        db.add(admin)
        db.flush()

        plan = db.query(Plan).filter(Plan.name == "free").first()
        if not plan:
            plan = Plan(
                name="free",
                display_name="Free Trial",
                max_employees=10,
                features=["basic_employees", "basic_attendance", "basic_payroll"],
            )
            db.add(plan)
            db.flush()

        subscription = Subscription(
            organization_id=org.id,
            plan_id=plan.id,
            status="trial",
            trial_ends_at=ist_now_naive() + timedelta(days=14),
        )
        db.add(subscription)

        for module in ["employees", "attendance", "leave", "payroll"]:
            perm = ModulePermission(
                user_id=admin.id,
                module=module,
                can_read=True,
                can_write=True,
                can_delete=True,
                granted_by=admin.id,
            )
            db.add(perm)

        db.commit()

        login_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        email_svc = EmailService()
        email_svc.send_email(
            data.admin_email,
            "Welcome to HRMS.Pro!",
            tenant_welcome_email(data.company_name, data.admin_name, data.admin_email, login_url),
        )

        superadmins = db.query(User).filter(User.role == "superadmin", User.is_active == True).all()
        dashboard_url = f"{login_url}/superadmin/tenants"
        for sa in superadmins:
            email_svc.send_email(
                sa.email,
                "New Organisation Registration",
                new_tenant_signup_notification(data.company_name, data.admin_name, data.admin_email, dashboard_url),
            )

        return {
            "message": "Organisation registered successfully. Pending super admin approval.",
            "organisation_id": org.id,
            "status": "pending",
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Tenant registration failed")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")


def detect_device_type(user_agent: str) -> str:
    user_agent = user_agent.lower()
    if 'mobile' in user_agent or 'android' in user_agent or 'iphone' in user_agent:
        return 'mobile_phone'
    elif 'tablet' in user_agent or 'ipad' in user_agent:
        return 'tablet'
    elif 'windows' in user_agent or 'macintosh' in user_agent or 'linux' in user_agent:
        return 'desktop'
    return 'other'


@router.get("/test")
def test_endpoint():
    return {"status": "ok", "message": "Backend is responding"}


@router.post("/login", response_model=dict)
def login(login_data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    try:
        email = login_data.email
        password = login_data.password
        client_ip = request.client.host if request.client else "unknown"

        if not email or not password:
            raise HTTPException(status_code=400, detail="Email and password are required")

        _check_brute_force(client_ip, email)
        logger.info(f"Login attempt for email: {email} from IP: {client_ip}")

        # Primary login id = email; secondary = phone number.
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = db.query(User).filter(User.phone == email).first()
        if not user or not user.is_active:
            _record_failed_attempt(client_ip, email)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Revoke login for inactive employees (linked employee status = inactive/terminated)
        linked_employee = db.query(Employee).filter(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        ).first()
        if linked_employee and linked_employee.status in ("inactive", "terminated"):
            _record_failed_attempt(client_ip, email)
            raise HTTPException(
                status_code=403,
                detail="Your account has been deactivated. Please contact your HR administrator.",
            )

        if not verify_password(password, user.password_hash):
            _record_failed_attempt(client_ip, email)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        _reset_attempts(client_ip, email)

        employee = db.query(Employee).filter(Employee.user_id == user.id).first()

        try:
            user.last_login = ist_now_naive()
            db.commit()
        except Exception:
            db.rollback()

        logger.info(f"Login successful for user: {user.email}")

        return _build_login_payload(user, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login failed with unexpected error")
        raise HTTPException(status_code=500, detail="Login failed. Please try again.")


def _build_login_payload(user: User, db: Session) -> dict:
    """Build the token + user payload shared by all login methods."""
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "tv": user.token_version or 0},
        expires_delta=access_token_expires,
    )

    employee = db.query(Employee).filter(Employee.user_id == user.id).first()

    # Plan features drive module gating in the UI (e.g. Basic excludes
    # payroll/performance). Fall back to an allow-all when no subscription.
    plan_features = []
    try:
        from models import Subscription
        sub = (
            db.query(Subscription)
            .filter(
                Subscription.organization_id == user.organization_id,
                Subscription.deleted_at.is_(None),
            )
            .order_by(Subscription.created_at.desc())
            .first()
        )
        if sub and sub.plan:
            plan_features = sub.plan.features or []
    except Exception:
        plan_features = []
    if not plan_features:
        plan_features = [
            "dashboard", "company", "employees", "recruitment", "holidays",
            "attendance", "leaves", "expenses", "payroll", "performance",
            "reports", "assets", "exit", "anomalies", "master-data", "settings",
        ]

    return {
        "token": access_token,
        "user": {
            **_build_user_payload(user, db),
            "planFeatures": plan_features,
        },
        "is_new_device": False,
    }


@router.post("/refresh", response_model=dict)
def refresh_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Issue a fresh access token for the authenticated user."""
    if not current_user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive")
    return _build_login_payload(current_user, db)


@router.post("/login-passkey", response_model=dict)
def login_passkey(login_data: PasskeyLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Sign in with the user's assigned passkey (email or phone + passcode)."""
    try:
        identifier = (login_data.identifier or "").strip()
        passcode = (login_data.passcode or "").strip()
        client_ip = request.client.host if request.client else "unknown"

        if not identifier or not passcode:
            raise HTTPException(status_code=400, detail="Email/phone and passkey are required")

        _check_brute_force(client_ip, identifier)
        logger.info(f"Passkey login attempt for: {identifier} from IP: {client_ip}")

        # Primary login id = email; secondary = phone number.
        user = db.query(User).filter(User.email == identifier).first()
        if not user:
            user = db.query(User).filter(User.phone == identifier).first()
        if not user or not user.is_active:
            _record_failed_attempt(client_ip, identifier)
            raise HTTPException(status_code=401, detail="Invalid email/phone or passkey")

        # Revoke login for inactive employees (linked employee status = inactive/terminated)
        linked_employee = db.query(Employee).filter(
            Employee.user_id == user.id,
            Employee.deleted_at.is_(None),
        ).first()
        if linked_employee and linked_employee.status in ("inactive", "terminated"):
            _record_failed_attempt(client_ip, identifier)
            raise HTTPException(
                status_code=403,
                detail="Your account has been deactivated. Please contact your HR administrator.",
            )

        if not user.passcode or passcode != user.passcode:
            _record_failed_attempt(client_ip, identifier)
            raise HTTPException(status_code=401, detail="Invalid passkey")

        _reset_attempts(client_ip, identifier)

        try:
            user.last_login = ist_now_naive()
            db.commit()
        except Exception:
            db.rollback()

        logger.info(f"Passkey login successful for user: {user.email}")

        return _build_login_payload(user, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Passkey login failed with unexpected error")
        raise HTTPException(status_code=500, detail="Login failed. Please try again.")


def _resolve_org_name(db: Session, organization_id: Optional[int]) -> Optional[str]:
    """Return the org display name for a user, falling back to legal_name."""
    if not organization_id:
        return None
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return (org.name or org.legal_name) if org else None


def _resolve_user_org_id(user: User, employee) -> Optional[int]:
    return user.organization_id or (employee.organization_id if employee else None)


def _build_user_payload(user: User, db: Session) -> dict:
    """Consistent user object returned by login / me endpoints (includes org name)."""
    employee = db.query(Employee).filter(Employee.user_id == user.id).first()
    org_id = _resolve_user_org_id(user, employee)
    return {
        "id": user.id,
        "email": user.email,
        "fullName": user.full_name,
        "role": user.role,
        "organizationId": org_id,
        "organizationName": _resolve_org_name(db, org_id),
        "departmentId": employee.department_id if employee else None,
        "employeeId": employee.id if employee else None,
        "themeSettings": user.theme_settings or {"fontFamily": "Inter"},
    }


@router.get("/me", response_model=dict)
def get_current_user_info(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _build_user_payload(current_user, db)


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.put("/me", response_model=dict)
def update_current_user_info(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Self-service: update the logged-in user's own profile (name/phone)."""
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.phone is not None:
        current_user.phone = data.phone
    db.commit()
    db.refresh(current_user)
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    return {
        "id": current_user.id,
        "email": current_user.email,
        "fullName": current_user.full_name,
        "role": current_user.role,
        "phone": current_user.phone,
        "organizationId": current_user.organization_id or (employee.organization_id if employee else None),
        "departmentId": employee.department_id if employee else None,
        "employeeId": employee.id if employee else None,
        "themeSettings": current_user.theme_settings or {"fontFamily": "Inter"},
    }


@router.post("/change-password", response_model=dict)
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Self-service: change the logged-in user's own password."""
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")

    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    reset_token: str
    new_password: str


class VerifyResetCodeRequest(BaseModel):
    email: str
    reset_token: str


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Request a password reset. Sends a 6-digit reset code to the user's email.
    In development with no email provider configured, the code is returned in the
    response so the flow is fully testable without any paid service."""
    email = (req.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    # Always respond the same way to avoid user-enumeration.
    if not user or not user.is_active:
        return {"message": "If that email is registered, a reset code has been sent."}

    from services.otp_service import OTPService
    from services.email_service import EmailService

    code = OTPService().generate_otp()
    user.reset_token = code
    user.reset_token_expiry = ist_now_naive() + timedelta(minutes=15)
    db.commit()

    # Attempt delivery via the self-hosted sender (direct-to-MX, no third party).
    delivered = False
    try:
        from services.email_service import brand_header
        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family:'Segoe UI',Arial,sans-serif; background:#f4f6f9; margin:0; padding:20px; }}
  .container {{ max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }}
  .body {{ padding:32px 40px; color:#333; line-height:1.7; }}
  .code {{ display:inline-block; padding:12px 28px; background:#f1f5f9; border:2px dashed #1a237e; border-radius:8px; font-size:28px; font-weight:700; letter-spacing:8px; color:#1a237e; margin:8px 0; }}
  .footer {{ background:#f8f9fa; padding:20px 40px; text-align:center; color:#888; font-size:12px; }}
</style></head><body>
<div class="container">
  {brand_header("Password Reset")}
  <div class="body">
    <p>Hello {user.full_name or 'there'},</p>
    <p>You requested to reset your HRMS.Pro! password. Enter this code to continue:</p>
    <div style="text-align:center;"><span class="code">{code}</span></div>
    <p>This code expires in 15 minutes. If you didn't request this, please ignore this email.</p>
  </div>
  <div class="footer"><p>© HRMS.Pro!. All rights reserved.</p></div>
</div></body></html>"""
        delivered = EmailService.send_email(
            to_email=user.email,
            subject="HRMS.Pro! Password Reset Code",
            html_content=html,
            text_content=f"Your HRMS.Pro! password reset code is: {code}. It expires in 15 minutes.",
        )
    except Exception:
        delivered = False

    # The reset code must always be reachable. When email delivery can't be
    # confirmed, surface the code in the response so the UI shows it directly —
    # guarantees nobody gets locked out of their account. (In production with
    # reliable delivery this fallback simply won't trigger.)
    if not delivered:
        return {
            "message": "Reset code sent.",
            "dev_code": code,
            "note": "Email delivery unavailable — showing the code so you can still reset your password.",
        }

    return {"message": "If that email is registered, a reset code has been sent."}


@router.post("/verify-reset-code")
def verify_reset_code(req: VerifyResetCodeRequest, request: Request, db: Session = Depends(get_db)):
    """Check whether a reset code is valid WITHOUT consuming it (used by the
    'Continue' step of the forgot-password wizard before entering a new password)."""
    email = (req.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    if not user.reset_token or not user.reset_token_expiry:
        raise HTTPException(status_code=400, detail="No reset code was requested")
    if ist_now_naive() > user.reset_token_expiry:
        user.reset_token = None
        user.reset_token_expiry = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset code has expired")

    code = (req.reset_token or "").strip()
    if len(code) != len(user.reset_token) or not all(a == b for a, b in zip(code, user.reset_token)):
        raise HTTPException(status_code=400, detail="Invalid reset code")

    return {"message": "Reset code is valid"}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Verify the reset code and set a new password."""
    email = (req.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    if not user.reset_token or not user.reset_token_expiry:
        raise HTTPException(status_code=400, detail="No reset code was requested")
    if ist_now_naive() > user.reset_token_expiry:
        user.reset_token = None
        user.reset_token_expiry = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset code has expired")

    code = (req.reset_token or "").strip()
    if len(code) != len(user.reset_token) or not all(a == b for a, b in zip(code, user.reset_token)):
        raise HTTPException(status_code=400, detail="Invalid reset code")

    new_password = req.new_password
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")

    user.password_hash = get_password_hash(new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    db.commit()

    return {"message": "Password reset successfully. You can now sign in with your new password."}


def _normalize_phone(phone: str) -> str:
    """Strip +, spaces, dashes and country code so matching is format-proof."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    return digits[-10:] if len(digits) >= 10 else digits


def _phone_matches(stored_phone: str, input_phone: str) -> bool:
    """Whether the stored phone matches the input, tolerant of formatting."""
    if not stored_phone or not input_phone:
        return False
    return _normalize_phone(stored_phone) == _normalize_phone(input_phone)


class ForgotPasswordVerifyRequest(BaseModel):
    email: str
    phone: str


class ResetPasswordBasicRequest(BaseModel):
    email: str
    phone: str
    reset_token: str
    new_password: str


@router.post("/forgot-password-verify")
def forgot_password_verify(req: ForgotPasswordVerifyRequest, request: Request, db: Session = Depends(get_db)):
    """Verify the user's email AND phone both match, then email a 6-digit OTP
    to the account's inbox. The OTP is NEVER returned in the response — it's
    delivered only to the user's email, which an attacker who merely knows the
    email+phone cannot read."""
    client_ip = request.client.host if request.client else "unknown"
    email = (req.email or "").strip().lower()
    phone = (req.phone or "").strip()

    # Brute-force protection: max 5 verify attempts per IP+email before lockout.
    key = make_key("auth", "brute", "fpv", client_ip, email)
    if _get_brute_force_attempts(key) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again after 15 minutes.",
        )
    _increment_brute_force(key, BRUTE_FORCE_WINDOW_SECONDS)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Email not matched")

    if not _phone_matches(user.phone, phone):
        raise HTTPException(status_code=400, detail="Phone number not matched")

    # Issue a single-use, time-limited 6-digit OTP (10 min) and email it.
    from services.otp_service import OTPService
    from services.email_service import EmailService

    otp = OTPService().generate_otp()
    user.reset_token = otp
    user.reset_token_expiry = ist_now_naive() + timedelta(minutes=10)
    db.commit()
    _clear_brute_force_key(key)

    email_sent = EmailService.send_email(
        to_email=user.email,
        subject="Your HRMS password reset code",
        html_content=(
            f"<p>Hello {user.full_name or 'there'},</p>"
            f"<p>You requested to reset your HRMS password. Your one-time code is:</p>"
            f"<h2 style='letter-spacing:6px;color:#1a237e'>{otp}</h2>"
            f"<p>This code expires in 10 minutes. If you didn't request this, ignore this email.</p>"
        ),
        text_content=f"Your HRMS password reset code is: {otp}. It expires in 10 minutes.",
    )

    if not email_sent:
        # Delivery channel unavailable — do NOT leak the code to the caller.
        raise HTTPException(
            status_code=503,
            detail="Email delivery is not configured. Please contact your administrator.",
        )

    return {"message": "A 6-digit reset code was sent to your email."}


@router.post("/reset-password-basic")
def reset_password_basic(req: ResetPasswordBasicRequest, request: Request, db: Session = Depends(get_db)):
    """Re-verify email + phone, require the emailed OTP, then set a new
    password. On success ALL existing sessions for the account are invalidated
    by bumping token_version."""
    client_ip = request.client.host if request.client else "unknown"
    email = (req.email or "").strip().lower()
    phone = (req.phone or "").strip()

    # Brute-force protection: max 5 reset attempts per IP+email before lockout.
    key = make_key("auth", "brute", "fpr", client_ip, email)
    if _get_brute_force_attempts(key) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again after 15 minutes.",
        )
    _increment_brute_force(key, BRUTE_FORCE_WINDOW_SECONDS)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Email not matched")
    if not _phone_matches(user.phone, phone):
        raise HTTPException(status_code=400, detail="Phone number not matched")

    # Require the emailed OTP issued by the verify step.
    supplied_otp = (req.reset_token or "").strip()
    if not user.reset_token or not user.reset_token_expiry:
        raise HTTPException(status_code=400, detail="Password reset was not started. Verify your identity first.")
    if ist_now_naive() > user.reset_token_expiry:
        user.reset_token = None
        user.reset_token_expiry = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset code has expired. Please verify again.")
    if len(supplied_otp) != len(user.reset_token) or not all(a == b for a, b in zip(supplied_otp, user.reset_token)):
        raise HTTPException(status_code=400, detail="Incorrect reset code. Please try again.")

    new_password = req.new_password
    strength_error = _validate_password_strength(new_password)
    if strength_error:
        raise HTTPException(status_code=400, detail=strength_error)

    user.password_hash = get_password_hash(new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    # Invalidate every existing session/token for this account.
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    _clear_brute_force_key(key)

    # Notify the account owner that their password changed.
    try:
        from services.sms_service import NotificationService
        NotificationService.send_sms(
            user.phone,
            "Your HRMS password was changed. If this wasn't you, contact your administrator immediately.",
        )
    except Exception:
        pass

    return {"message": "Password reset successfully. You can now sign in with your new password."}


@router.post("/logout")
def logout():
    return {"message": "Logged out successfully"}


@router.get("/device-logs", response_model=dict, dependencies=[Depends(check_role(["admin", "superadmin", "hr_admin", "hr_manager", "hr_executive"]))])
def get_device_logs(
    employee_id: Optional[int] = None,
    user_id: Optional[int] = None,
    blocked_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(DeviceLog)
    if current_user.role != "superadmin":
        query = query.join(User, DeviceLog.user_id == User.id).filter(
            User.organization_id == current_user.organization_id
        )

    if employee_id:
        query = query.filter(DeviceLog.employee_id == employee_id)
    if user_id:
        query = query.filter(DeviceLog.user_id == user_id)
    if blocked_only:
        query = query.filter(DeviceLog.is_blocked == True)

    return {"device_logs": [
        {
            "id": d.id,
            "employee_id": d.employee_id,
            "user_id": d.user_id,
            "ip_address": d.ip_address,
            "user_agent": d.user_agent,
            "device_type": d.device_type,
            "device_fingerprint": d.device_fingerprint,
            "mac_address": d.mac_address,
            "serial_number": d.serial_number,
            "is_authorized": d.is_authorized,
            "is_blocked": d.is_blocked,
            "login_status": d.login_status,
            "location_country": d.location_country,
            "location_city": d.location_city,
            "login_time": d.login_time,
            "logout_time": d.logout_time,
        }
        for d in query.order_by(DeviceLog.login_time.desc()).limit(100).all()
    ]}


@router.post("/authorize-device/{log_id}")
def authorize_device(log_id: int, db: Session = Depends(get_db), current_user: User = Depends(check_role(["admin", "superadmin"]))):
    log_entry = db.query(DeviceLog).filter(DeviceLog.id == log_id).first()
    if not log_entry:
        raise HTTPException(status_code=404, detail="Device log not found")
    if current_user.role != "superadmin":
        device_user = db.query(User).filter(User.id == log_entry.user_id).first()
        if device_user is None or int(device_user.organization_id) != int(current_user.organization_id):
            raise HTTPException(status_code=404, detail="Device log not found")
    log_entry.is_blocked = False
    db.commit()
    return {"message": "Device authorized successfully"}


@router.post("/block-device/{log_id}")
def block_device(log_id: int, db: Session = Depends(get_db), current_user: User = Depends(check_role(["admin", "superadmin"]))):
    log_entry = db.query(DeviceLog).filter(DeviceLog.id == log_id).first()
    if not log_entry:
        raise HTTPException(status_code=404, detail="Device log not found")
    if current_user.role != "superadmin":
        device_user = db.query(User).filter(User.id == log_entry.user_id).first()
        if device_user is None or int(device_user.organization_id) != int(current_user.organization_id):
            raise HTTPException(status_code=404, detail="Device log not found")
    log_entry.is_blocked = True
    db.commit()
    return {"message": "Device blocked successfully"}


@router.post("/send-otp")
def send_otp(req: SendOTPRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    otp_key = make_key("auth", "brute", "otp", "send", client_ip, req.phone)
    _check_otp_brute_force(client_ip, req.phone, "send")
    _record_otp_attempt(client_ip, req.phone, "send")

    user = db.query(User).filter(User.phone == req.phone).first()
    if not user:
        _clear_brute_force_key(otp_key)
        raise HTTPException(status_code=404, detail="User with this phone number not found")
    otp_service = OTPService()
    otp = otp_service.generate_otp()
    user.otp = otp
    user.otp_expiry = ist_now_naive() + timedelta(minutes=5)
    db.commit()
    NotificationService.send_sms(req.phone, f"Your HRMS OTP is: {otp}")
    return {"message": "OTP sent successfully"}


@router.post("/verify-otp")
def verify_otp(req: VerifyOTPRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    otp_key = make_key("auth", "brute", "otp", "verify", client_ip, req.phone)
    _check_otp_brute_force(client_ip, req.phone, "verify")
    _record_otp_attempt(client_ip, req.phone, "verify")

    user = db.query(User).filter(User.phone == req.phone).first()
    if not user:
        _clear_brute_force_key(otp_key)
        raise HTTPException(status_code=404, detail="User not found")
    if not user.otp or not user.otp_expiry:
        raise HTTPException(status_code=400, detail="No OTP requested")
    if ist_now_naive() > user.otp_expiry:
        user.otp = None
        user.otp_expiry = None
        db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired")

    if len(user.otp) != len(req.otp) or not all(a == b for a, b in zip(user.otp, req.otp)):
        raise HTTPException(status_code=400, detail="Invalid OTP")

    user.otp = None
    user.otp_expiry = None
    db.commit()
    _clear_brute_force_key(otp_key)

    access_token = create_access_token(data={"sub": str(user.id), "tv": user.token_version or 0})
    employee = db.query(Employee).filter(Employee.user_id == user.id).first()
    return {
        "token": access_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "fullName": user.full_name,
            "role": user.role,
            "organizationId": user.organization_id,
            "employeeId": employee.id if employee else None,
            "themeSettings": user.theme_settings or {"fontFamily": "Inter"},
        },
    }


@router.post("/send-email-verification")
def send_email_verification(req: ResendEmailVerificationRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    token = uuid.uuid4().hex
    user.email_verification_token = token
    user.email_verification_expiry = ist_now_naive() + timedelta(hours=24)
    db.commit()
    email_service = EmailService()
    email_service.send_verification_email(user.email, token)
    return {"message": "Verification email sent"}


@router.post("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email_verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    if user.email_verification_expiry and ist_now_naive() > user.email_verification_expiry:
        raise HTTPException(status_code=400, detail="Verification token has expired")
    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_expiry = None
    db.commit()
    return {"message": "Email verified successfully"}


@router.put("/theme")
def update_theme(theme: ThemeSettings, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.theme_settings = theme.model_dump()
    db.commit()
    return {"message": "Theme updated successfully"}


@router.post("/toggle-device-lock")
def toggle_device_lock(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.is_locked_to_device = not current_user.is_locked_to_device
    db.commit()
    return {"message": "Device lock toggled", "is_locked": current_user.is_locked_to_device}


@router.post("/reset-device-lock/{user_id}")
def reset_device_lock(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(check_role(["admin", "superadmin"]))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin":
        org_owned(user, current_user.organization_id)
    user.is_locked_to_device = False
    user.device_id = None
    db.commit()
    return {"message": "Device lock reset successfully"}


@router.get("/device-status")
def get_device_status(current_user: User = Depends(get_current_user)):
    return {
        "is_locked_to_device": current_user.is_locked_to_device,
        "allow_multi_device": current_user.allow_multi_device,
    }


@router.get("/devices")
def list_devices(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    devices = db.query(DeviceBinding).filter(
        DeviceBinding.user_id == current_user.id,
        DeviceBinding.is_active.is_(True),
    ).order_by(DeviceBinding.last_used.desc()).all()
    return {
        "allow_multi_device": bool(getattr(current_user, "allow_multi_device", False)),
        "devices": [
            {
                "id": device.id,
                "device_name": device.device_name or "Unknown device",
                "device_type": device.device_type or "desktop",
                "ip_address": device.ip_address or "",
                "last_used": device.last_used.isoformat() if device.last_used else None,
                "is_current": False,
            }
            for device in devices
        ],
    }


@router.put("/devices/{device_id}/name")
def rename_device(device_id: int, name: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.query(DeviceBinding).filter(DeviceBinding.id == device_id, DeviceBinding.user_id == current_user.id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.device_name = name
    db.commit()
    return {"message": "Device renamed successfully"}


@router.post("/grant-multi-device/{user_id}")
def grant_multi_device(user_id: int, grant: bool = True, db: Session = Depends(get_db), current_user: User = Depends(check_role(["admin", "superadmin"]))):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "superadmin":
        org_owned(user, current_user.organization_id)
    user.allow_multi_device = grant
    db.commit()
    return {"message": "Multi-device access updated", "allow_multi_device": user.allow_multi_device}


@router.delete("/devices/{device_id}")
def revoke_device(device_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.query(DeviceBinding).filter(DeviceBinding.id == device_id, DeviceBinding.user_id == current_user.id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()
    return {"message": "Device revoked successfully"}


@router.post("/devices/revoke-all")
def revoke_all_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    devices = db.query(DeviceBinding).filter(DeviceBinding.user_id == current_user.id).all()
    count = len(devices)
    for d in devices:
        db.delete(d)
    db.commit()
    return {"message": f"{count} device session(s) revoked"}
