"""Central in-app notification dispatcher.

Fires in-app notifications (stored in `notifications` table) and optionally
queues emails for HR workflows. Call sites use `notify_user(...)` or the
semantic helpers below.
"""
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from models import Notification, User


def _short_date(value):
    """Format a date/datetime as YYYY-MM-DD (or pass strings through)."""
    if value is None:
        return "-"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if hasattr(value, "date") and not isinstance(value, str):
        try:
            return value.date().strftime("%Y-%m-%d")
        except Exception:
            pass
    s = str(value)
    return s[:10]


def notify_user(
    db: Session,
    user_id: Optional[int],
    title: str,
    body: str = "",
    type: str = "system",
    reference_id: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> Optional[Notification]:
    """Persist an in-app notification for a user. No-op if user_id is falsy."""
    if not user_id:
        return None
    n = Notification(
        user_id=user_id,
        title=title,
        body=body,
        type=type,
        reference_id=reference_id,
        data=data or {},
    )
    db.add(n)
    db.flush()
    return n


def _approver_users(db: Session, organization_id: Optional[int], roles: tuple = ("admin", "hr_admin", "hr_manager", "superadmin")):
    """Users in the org with approval roles (fallback: any user in org)."""
    def _base():
        q = db.query(User).filter(User.is_active == True)
        if hasattr(User, "deleted_at"):
            q = q.filter(User.deleted_at.is_(None))
        return q
    q = _base()
    if organization_id:
        q = q.filter(User.organization_id == organization_id)
    users = q.all()
    # Prefer role-based users if any match
    role_q = _base().filter(User.role.in_(list(roles)))
    if organization_id:
        role_q = role_q.filter(User.organization_id == organization_id)
    role_users = role_q.all()
    return role_users if role_users else users


def notify_leave_submitted(db: Session, lv, employee_name: str):
    org_id = getattr(lv, "organization_id", None)
    approvers = _approver_users(db, org_id)
    ref = f"leave:{lv.id}"
    start = _short_date(getattr(lv, "start_date", None))
    end = _short_date(getattr(lv, "end_date", None))
    for u in approvers:
        if u.id == getattr(lv, "created_by", None):
            continue
        notify_user(
            db,
            u.id,
            "New leave request",
            f"{employee_name} requested leave ({lv.total_days or 0} day(s), {start} to {end})",
            type="leave",
            reference_id=ref,
            data={"leaveId": lv.id, "employeeName": employee_name, "status": lv.status},
        )


def notify_leave_decided(db: Session, lv, employee_name: str, action: str, approver_name: str = "HR", employee_user_id: Optional[int] = None, actor_user_id: Optional[int] = None):
    """Notify the employee (and HR team) that a leave was approved/rejected."""
    ref = f"leave:{lv.id}"
    status = "approved" if action == "approve" else "rejected"
    verb = "approved" if status == "approved" else "rejected"
    # 1. Notify the employee who requested it
    notify_user(
        db,
        employee_user_id or getattr(lv, "user_id", None),
        f"Leave {status}",
        f"Your leave request was {status} by {approver_name}.",
        type="leave",
        reference_id=ref,
        data={"leaveId": lv.id, "status": status, "approver": approver_name},
    )
    # 2. Notify the acting approver/HR with a confirmation
    start = _short_date(getattr(lv, "start_date", None))
    end = _short_date(getattr(lv, "end_date", None))
    if actor_user_id and actor_user_id != employee_user_id:
        notify_user(
            db,
            actor_user_id,
            f"Leave {status}",
            f"You {verb} {employee_name}'s leave request ({lv.total_days or 0} day(s), {start} to {end}).",
            type="leave",
            reference_id=ref,
            data={"leaveId": lv.id, "status": status, "employeeName": employee_name},
        )
    # 3. Notify the rest of the HR/admin team
    org_id = getattr(lv, "organization_id", None)
    for u in _approver_users(db, org_id):
        if u.id == actor_user_id or u.id == employee_user_id:
            continue
        notify_user(
            db,
            u.id,
            f"Leave {status}",
            f"{employee_name}'s leave request was {verb} by {approver_name}.",
            type="leave",
            reference_id=ref,
            data={"leaveId": lv.id, "status": status, "employeeName": employee_name},
        )


def notify_expense_submitted(db: Session, exp, employee_name: str):
    org_id = getattr(exp, "organization_id", None)
    approvers = _approver_users(db, org_id)
    ref = f"expense:{exp.id}"
    for u in approvers:
        notify_user(
            db,
            u.id,
            "New expense claim",
            f"{employee_name} submitted an expense of {getattr(exp, 'currency', '')} {getattr(exp, 'amount', 0):,} ({getattr(exp, 'category', '')})",
            type="expense",
            reference_id=ref,
            data={"expenseId": exp.id, "employeeName": employee_name, "amount": getattr(exp, "amount", 0), "status": exp.status},
        )


def notify_expense_decided(db: Session, exp, employee_name: str, action: str, approver_name: str = "HR", employee_user_id: Optional[int] = None, actor_user_id: Optional[int] = None):
    status = "approved" if action in ("approved", "approve") else "rejected"
    verb = "approved" if status == "approved" else "rejected"
    ref = f"expense:{exp.id}"
    amt = f"{getattr(exp, 'currency', '')} {getattr(exp, 'amount', 0):,}"
    # 1. Notify the employee who submitted it
    notify_user(
        db,
        employee_user_id or getattr(exp, "user_id", None),
        f"Expense {status}",
        f"Your expense claim for {amt} was {status} by {approver_name}.",
        type="expense",
        reference_id=ref,
        data={"expenseId": exp.id, "status": status, "approver": approver_name},
    )
    # 2. Notify the acting approver/HR with a confirmation
    if actor_user_id and actor_user_id != employee_user_id:
        notify_user(
            db,
            actor_user_id,
            f"Expense {status}",
            f"You {verb} {employee_name}'s expense claim of {amt}.",
            type="expense",
            reference_id=ref,
            data={"expenseId": exp.id, "status": status, "employeeName": employee_name},
        )
    # 3. Notify the rest of the HR/admin team
    org_id = getattr(exp, "organization_id", None)
    for u in _approver_users(db, org_id):
        if u.id == actor_user_id or u.id == employee_user_id:
            continue
        notify_user(
            db,
            u.id,
            f"Expense {status}",
            f"{employee_name}'s expense claim of {amt} was {verb} by {approver_name}.",
            type="expense",
            reference_id=ref,
            data={"expenseId": exp.id, "status": status, "employeeName": employee_name},
        )


def notify_payslip(db: Session, user_id: Optional[int], employee_name: str, month: int, year: int, net_salary: float):
    notify_user(
        db,
        user_id,
        "Payslip generated",
        f"Your payslip for {month}/{year} is ready. Net pay: {net_salary:,.2f}",
        type="payroll",
        reference_id=f"payslip:{month}:{year}",
        data={"month": month, "year": year, "netSalary": net_salary},
    )


def notify_hr(db: Session, organization_id: Optional[int], title: str, body: str, type: str = "system", reference_id: Optional[str] = None, data: Optional[Dict[str, Any]] = None):
    """Broadcast to all HR/admin users in an org."""
    for u in _approver_users(db, organization_id):
        notify_user(db, u.id, title, body, type=type, reference_id=reference_id, data=data)
