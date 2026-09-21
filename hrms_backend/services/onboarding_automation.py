"""
Onboarding Automation Service.

Runs automatically when an employee is added or onboarding is completed so a
single HR person can manage hundreds of employees. Everything is idempotent
(safe to run repeatedly).

Tasks performed (in order):
  1. Ensure the employee has a linked login User account (with default password).
  2. Provision default leave balances for the year (per active leave types).
  3. Notify the employee, their manager, and HR in-app.
  4. Create an IT checklist asset placeholder so admins can assign hardware.
  5. Log an EmployeeLifecycleEvent.
  6. OPTIONALLY send a welcome email — only when the org's `autoEmails`
     setting is enabled, so SMTP quota is never burned by default.

Email policy: in-app notifications always fire (free). Emails are sent only
when the admin explicitly turns on `autoEmails` in Settings.
"""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def ensure_user_account(db: Session, emp, default_password: str = "TempPass123!"):
    """Create a login User for the employee if they don't have one linked."""
    from models import User
    from core.auth import get_password_hash

    if emp.user_id:
        return db.query(User).filter(User.id == emp.user_id).first()

    email = getattr(emp, "email", None)
    if not email:
        return None

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        emp.user_id = existing.id
        db.flush()
        return existing

    full_name = f"{getattr(emp, 'first_name', '') or ''} {getattr(emp, 'last_name', '') or ''}".strip()
    user = User(
        email=email,
        password_hash=get_password_hash(default_password),
        full_name=full_name or email.split("@")[0],
        role="employee",
        organization_id=emp.organization_id,
        phone=getattr(emp, "phone", None),
    )
    db.add(user)
    db.flush()
    emp.user_id = user.id
    db.flush()
    return user


def provision_leave_balances(db: Session, emp) -> list:
    """Create MISSING LeaveBalance rows for the current year.

    Same engine as the Leave module (config-first, else type Days/Year;
    unpaid types skipped), so joiners match init-all exactly. Never touches
    existing rows.
    """
    from models import LeaveBalance
    from utils.leave_balance_utils import (
        active_leave_types,
        org_single_leave_policy,
        pinned_template_body,
        resolve_leave_config,
        resolve_quota,
        resolve_type_flags,
    )

    created = []
    year = datetime.now().year
    config = None
    single_policy = {}
    body = None
    try:
        config = resolve_leave_config(db, emp.id, emp.organization_id)
        single_policy = org_single_leave_policy(db, emp.organization_id)
        body = pinned_template_body(db, emp)
    except Exception:
        config = None
    types = active_leave_types(db, emp.organization_id)
    paid_map = {}
    try:
        paid_map = resolve_type_flags(db, emp, types)
    except Exception:
        paid_map = {}
    for lt in types:
        if paid_map.get(lt.id, {}).get("paid", getattr(lt, "is_paid", True)) is False:
            continue
        existing = (
            db.query(LeaveBalance)
            .filter(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.year == year,
                LeaveBalance.leave_type_id == lt.id,
            )
            .first()
        )
        if existing:
            continue
        days = resolve_quota(body, config, single_policy, lt)
        bal = LeaveBalance(
            employee_id=emp.id,
            year=year,
            leave_type_id=lt.id,
            total_days=days,
            used_days=0,
            remaining_days=days,
        )
        db.add(bal)
        created.append({"leave_type": lt.name, "days": days})
    db.flush()
    return created


def send_welcome_email(db: Session, emp, user, default_password: str) -> bool:
    """Email the new joiner their credentials and login link."""
    from services.email_service import EmailService, brand_header

    email = getattr(emp, "email", None)
    if not email:
        return False
    login_url = "http://localhost:5173/login"
    first = getattr(emp, "first_name", "") or ""
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family:'Segoe UI',Arial,sans-serif; background:#f4f6f9; margin:0; padding:20px; }}
  .container {{ max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }}
  .body {{ padding:32px 40px; color:#333; line-height:1.7; }}
  .creds {{ background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; margin:16px 0; }}
  .creds div {{ padding:4px 0; }}
  .creds span {{ color:#64748b; font-size:13px; display:block; }}
  .cta {{ display:inline-block; padding:12px 32px; background:#1a237e; color:#fff !important; text-decoration:none; border-radius:6px; font-weight:600; margin:16px 0; }}
  .footer {{ background:#f8f9fa; padding:20px 40px; text-align:center; color:#888; font-size:12px; }}
</style></head><body>
<div class="container">
  {brand_header("Welcome Aboard!")}
  <div class="body">
    <h2>Welcome to HRMS.Pro!, {first}!</h2>
    <p>Your employee account has been created and you are ready to start.</p>
    <div class="creds">
      <div><span>Login Email</span><strong>{email}</strong></div>
      <div><span>Default Password</span><strong>{default_password}</strong></div>
    </div>
    <p>Use these credentials to sign in. You will be asked to set your own secure password.</p>
    <div style="text-align:center;"><a href="{login_url}" class="cta">Login to HRMS.Pro!</a></div>
  </div>
  <div class="footer"><p>© HRMS.Pro!. All rights reserved.</p></div>
</div></body></html>"""
    try:
        EmailService.send_email(
            to_email=email,
            subject="Welcome to HRMS.Pro! — Your account is ready",
            html_content=html,
            text_content=f"Welcome to HRMS.Pro!, {first}! Login: {email} / Password: {default_password}",
        )
        return True
    except Exception as e:
        logger.warning(f"Welcome email failed for {email}: {e}")
        return False


def notify_stakeholders(db: Session, emp, user):
    """In-app notifications to employee and HR team."""
    from services.notifier import notify_user, notify_hr

    name = f"{getattr(emp, 'first_name', '') or ''} {getattr(emp, 'last_name', '') or ''}".strip()
    notify_user(
        db,
        user.id if user else None,
        f"Welcome, {name}!",
        "Your HRMS.Pro! account is ready. Check your email for login details.",
        type="onboarding",
        reference_id=f"employee:{emp.id}",
        data={"employeeId": emp.id, "employeeName": name},
    )
    notify_hr(
        db,
        emp.organization_id,
        "New employee onboarded",
        f"{name} has been onboarded to HRMS.Pro!.",
        type="onboarding",
        reference_id=f"employee:{emp.id}",
        data={"employeeId": emp.id, "employeeName": name},
    )


def create_it_checklist_asset(db: Session, emp):
    """Create a pending 'IT setup' placeholder asset so hardware can be assigned."""
    from models import Asset

    serial = f"IT-SETUP-{emp.id}"
    existing = (
        db.query(Asset)
        .filter(Asset.employee_id == emp.id, Asset.serial_number == serial, Asset.deleted_at.is_(None))
        .first()
    )
    if existing:
        return existing
    asset = Asset(
        employee_id=emp.id,
        asset_type="IT",
        asset_name=f"IT Setup — {getattr(emp, 'first_name', '') or ''} {getattr(emp, 'last_name', '') or ''}".strip(),
        serial_number=serial,
        status="assigned",
        issue_date=datetime.now().date(),
        organization_id=emp.organization_id,
        notes="Auto-created on onboarding. Assign laptop/phone and update details.",
    )
    db.add(asset)
    db.flush()
    return asset


def log_lifecycle_event(db: Session, emp, actor_user_id=None):
    from models import EmployeeLifecycleEvent
    event = EmployeeLifecycleEvent(
        employee_id=emp.id,
        event_type="joined",
        event_date=datetime.utcnow(),
        description="Onboarding automation: account + leave balance + notifications provisioned",
        recorded_by=actor_user_id,
    )
    db.add(event)
    db.flush()


def run_onboarding_automation(
    db: Session,
    emp,
    *,
    actor_user_id=None,
    default_password: str = "TempPass123!",
    send_email: bool = None,
) -> dict:
    """Run all onboarding automation for an employee. Returns a summary dict.

    Emails are sent only when the org enables `autoEmails` (or send_email is
    passed explicitly). In-app notifications always fire.
    """
    from services.settings_service import is_feature_enabled

    summary = {"employeeId": emp.id, "steps": []}

    # 1. Ensure login account
    user = ensure_user_account(db, emp, default_password)
    summary["steps"].append("account" if user else "account_failed")

    # 2. Leave balances
    try:
        leaves = provision_leave_balances(db, emp)
        summary["leaveBalances"] = leaves
        summary["steps"].append("leave_balance")
    except Exception as e:
        logger.warning(f"Leave balance provisioning failed for emp {emp.id}: {e}")
        summary["steps"].append("leave_balance_failed")

    # 3. Notifications (always — free, in-app)
    try:
        notify_stakeholders(db, emp, user)
        summary["steps"].append("notifications")
    except Exception as e:
        logger.warning(f"Notifications failed for emp {emp.id}: {e}")
        summary["steps"].append("notifications_failed")

    # 4. IT checklist asset
    try:
        create_it_checklist_asset(db, emp)
        summary["steps"].append("it_checklist")
    except Exception as e:
        logger.warning(f"IT checklist failed for emp {emp.id}: {e}")
        summary["steps"].append("it_checklist_failed")

    # 5. Lifecycle event
    try:
        log_lifecycle_event(db, emp, actor_user_id)
        summary["steps"].append("lifecycle_event")
    except Exception as e:
        logger.warning(f"Lifecycle event failed for emp {emp.id}: {e}")

    # 6. Welcome email — ONLY if the admin opted in (never by default)
    email_opt = is_feature_enabled(db, emp.organization_id, "autoEmails") if send_email is None else send_email
    if email_opt:
        email_ok = send_welcome_email(db, emp, user, default_password)
        summary["steps"].append("welcome_email" if email_ok else "welcome_email_failed")
    else:
        summary["steps"].append("welcome_email_skipped")

    db.commit()
    return summary
