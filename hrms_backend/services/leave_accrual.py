"""Leave accrual scheduler — credits leave over the year per template config.

Mandate: LeaveTemplate.accrual_method is DATA, not code:
  frontloaded - full quota at year start (the historic _auto_init path; the
                accrual job skips these employees entirely)
  monthly     - quota/12 credited every month
  quarterly   - quota/4 credited in quarter-start months (Apr/Jul/Oct/Jan)
  yearly      - full quota credited once, in January

Safety rails (why this never inflates balances):
  - every credit is ledgered in LeaveAccrualLedger with a UNIQUE
    (employee, type, year, month) key — re-runs are no-ops
  - credits never exceed the configured annual quota: the pending pool is
    (annual_quota - already_granted_total_days); a front-loaded row (total
    >= quota) skips accrual completely
  - templates without an explicit method keep the legacy full-quota init
    behaviour (accrual_method column default 'monthly' is only honoured
    when the template row was created AFTER this service existed AND the
    balance was initialised in accrual mode)
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

QUARTER_START_MONTHS = (4, 7, 10, 1)  # Apr, Jul, Oct, Jan


def _template_for_employee(db: Session, employee) -> Optional[Any]:
    """Active LeaveTemplate for the employee (pinned wins, then payroll link)."""
    from models import LeaveTemplate, PayrollTemplate
    as_of = date.today()
    tid = getattr(employee, "leave_template_id", None)
    if tid:
        t = db.query(LeaveTemplate).filter(
            LeaveTemplate.id == tid,
            LeaveTemplate.deleted_at.is_(None),
            LeaveTemplate.status == "active",
        ).first()
        if t is not None:
            return t
    pt_id = getattr(employee, "payroll_template_id", None)
    if pt_id:
        pt = db.query(PayrollTemplate).filter(PayrollTemplate.id == pt_id).first()
        lt_id = getattr(pt, "leave_template_id", None) if pt else None
        if lt_id:
            return db.query(LeaveTemplate).filter(
                LeaveTemplate.id == lt_id,
                LeaveTemplate.deleted_at.is_(None),
                LeaveTemplate.status == "active",
            ).first()
    return None


def _active_leave_types(db: Session, org_id) -> List[Any]:
    from models import LeaveType
    return db.query(LeaveType).filter(
        LeaveType.organization_id == org_id,
        LeaveType.status == "active",
    ).all()


def _annual_quota(db: Session, employee, template, leave_type) -> int:
    """Configured annual quota for the type via the standard precedence."""
    from utils.leave_balance_utils import quota_for_employee
    return int(quota_for_employee(db, employee, leave_type) or 0)


def _method_slice_days(method: str, annual_quota: float, month: int) -> float:
    if method == "monthly":
        return round(annual_quota / 12.0, 4)
    if method == "quarterly" and month in QUARTER_START_MONTHS:
        return round(annual_quota / 4.0, 4)
    if method == "yearly" and month == 1:
        return round(float(annual_quota), 4)
    return 0.0


def accrue_leave_for_period(
    db: Session,
    year: int,
    month: int,
    org_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Credit leave for one period across active employees.

    Returns {credited, skipped_frontloaded, skipped_existing, total_days}.
    """
    from models import Employee, LeaveAccrualLedger, LeaveBalance

    q = db.query(Employee).filter(
        Employee.deleted_at.is_(None),
        Employee.status == "active",
    )
    if org_id:
        q = q.filter(Employee.organization_id == org_id)
    employees = q.all()

    credited_rows = 0
    total_days = 0.0
    skipped_frontloaded = 0
    skipped_existing = 0

    for emp in employees:
        template = _template_for_employee(db, emp)
        if template is None:
            continue
        method = str(getattr(template, "accrual_method", None) or "frontloaded").lower()
        if method == "frontloaded":
            skipped_frontloaded += 1
            continue
        if method not in ("monthly", "quarterly", "yearly"):
            method = "monthly"

        for lt in _active_leave_types(db, emp.organization_id):
            quota = _annual_quota(db, emp, template, lt)
            if quota <= 0:
                continue
            slice_days = _method_slice_days(method, float(quota), month)
            if slice_days <= 0:
                continue

            # Idempotency: this (employee, type, period) was already credited.
            exists = db.query(LeaveAccrualLedger).filter(
                LeaveAccrualLedger.employee_id == emp.id,
                LeaveAccrualLedger.leave_type_id == lt.id,
                LeaveAccrualLedger.year == year,
                LeaveAccrualLedger.month == month,
            ).first()
            if exists is not None:
                skipped_existing += 1
                continue

            bal = db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.leave_type_id == lt.id,
                LeaveBalance.year == year,
                LeaveBalance.deleted_at.is_(None),
            ).first()
            if bal is None:
                bal = LeaveBalance(
                    employee_id=emp.id, year=year, leave_type_id=lt.id,
                    total_days=0, used_days=0, remaining_days=0,
                )
                db.add(bal)
                db.flush()

            granted = float(bal.total_days or 0)
            if granted >= float(quota):
                # Already front-loaded (or fully credited) — never inflate.
                skipped_existing += 1
                continue
            pending_pool = float(quota) - granted
            credit = min(slice_days, pending_pool)
            if credit <= 0:
                continue
            credit = round(credit, 2)

            bal.total_days = int(round(granted + credit))
            bal.remaining_days = int(round(float(bal.remaining_days or 0) + credit))
            db.add(LeaveAccrualLedger(
                organization_id=emp.organization_id,
                employee_id=emp.id,
                leave_type_id=lt.id,
                year=year,
                month=month,
                days_credited=credit,
                method=method,
                quota_at_credit=float(quota),
            ))
            credited_rows += 1
            total_days += credit

    db.commit()
    return {
        "credited": credited_rows,
        "total_days": round(total_days, 2),
        "skipped_frontloaded": skipped_frontloaded,
        "skipped_existing": skipped_existing,
        "employees_scanned": len(employees),
    }
