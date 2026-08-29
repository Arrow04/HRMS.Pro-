"""Industry-agnostic workday resolution.

Resolves which weekdays (0=Sun .. 6=Sat) count as working days for an employee,
following a strict priority chain so no industry is forced into a Mon-Fri default:

1. Employee's DutyRoster for the period -> its Shift.working_days (per-employee config)
2. Employee's assigned Shift (employee.shift_id) -> working_days
3. Organization's default AttendancePolicy -> working_days (org-wide default)
4. Any active shift in the organization -> its working_days
5. Neutral fallback: all 7 days [0..6] (never assume Mon-Fri)
"""
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from models import AttendancePolicy, DutyRoster, Employee, Organization, Shift

NEUTRAL_WORKDAYS: List[int] = [0, 1, 2, 3, 4, 5, 6]


def _parse_working_days(raw: Optional[str]) -> Optional[List[int]]:
    if not raw:
        return None
    try:
        parsed = [int(x.strip()) for x in str(raw).split(",") if str(x).strip().isdigit()]
    except Exception:
        return None
    parsed = [d for d in parsed if 0 <= d <= 6]
    return sorted(set(parsed)) if parsed else None


def _shift_workdays(db: Session, shift_id: Optional[int]) -> Optional[List[int]]:
    if not shift_id:
        return None
    shift = db.query(Shift).filter(
        Shift.id == shift_id, Shift.deleted_at.is_(None)
    ).first()
    return _parse_working_days(shift.working_days) if shift else None


def _org_policy_workdays(db: Session, organization_id: Optional[int]) -> Optional[List[int]]:
    if not organization_id:
        return None
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    policy = None
    if org and org.default_attendance_policy_id:
        policy = db.query(AttendancePolicy).filter(
            AttendancePolicy.id == org.default_attendance_policy_id,
            AttendancePolicy.status == "active",
        ).first()
    if not policy:
        policy = db.query(AttendancePolicy).filter(
            AttendancePolicy.organization_id == organization_id,
            AttendancePolicy.status == "active",
        ).order_by(AttendancePolicy.id.asc()).first()
    return _parse_working_days(policy.working_days) if policy else None


def _org_shift_workdays(db: Session, organization_id: Optional[int]) -> Optional[List[int]]:
    if not organization_id:
        return None
    shifts = db.query(Shift).filter(
        Shift.organization_id == organization_id,
        Shift.deleted_at.is_(None),
    ).all()
    for shift in shifts:
        parsed = _parse_working_days(shift.working_days)
        if parsed:
            return parsed
    return None


def _employee_branch_ids(db: Session, employee_id: int) -> List[int]:
    """Return the branch ids an employee belongs to (many-to-many employee_branches)."""
    try:
        rows = db.execute(
            text("SELECT branch_id FROM employee_branches WHERE employee_id = :eid"),
            {"eid": employee_id},
        ).fetchall()
        return [r[0] for r in rows if r[0] is not None]
    except Exception:
        return []


def resolve_scoped_attendance_config(
    db: Session,
    employee_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> Optional[dict]:
    """Resolve the most specific company/branch/department-wise attendance config.

    Priority: exact department > exact branch > exact company > any org-wide config.
    Configs are stored in org.settings["attendance_configs"] via the pages UI.
    """
    if not organization_id:
        return None
    org = db.query(Organization).filter(
        Organization.deleted_at.is_(None),
        Organization.id == organization_id,
    ).first()
    if not org:
        return None
    data = org.settings or {}
    configs = data.get("attendance_configs") or []
    if not configs:
        return None

    emp = None
    branch_ids: List[int] = []
    if employee_id:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if emp:
            branch_ids = _employee_branch_ids(db, employee_id)

    emp_company = emp.company_id if emp else None
    emp_dept = emp.department_id if emp else None

    def score(c: dict) -> tuple:
        cid = c.get("companyId")
        bid = c.get("branchId")
        did = c.get("departmentId")
        rank = 3 if did is not None else 2 if bid is not None else 1 if cid is not None else 0
        company_match = (cid is None) or (emp_company is not None and cid == emp_company)
        branch_match = (bid is None) or (bid in branch_ids)
        dept_match = (did is None) or (emp_dept is not None and did == emp_dept)
        if not (company_match and branch_match and dept_match):
            return (-1, -1, -1, -1)
        return (rank, 1 if company_match else 0, 1 if branch_match else 0, 1 if dept_match else 0)

    best = max(configs, key=score, default=None)
    if best and score(best)[0] >= 0:
        return best
    return None


def resolve_workdays(
    db: Session,
    employee_id: Optional[int] = None,
    organization_id: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> List[int]:
    """Resolve an employee's working weekdays using the priority chain above."""
    if employee_id:
        # 1. DutyRoster for the period
        if start and end:
            try:
                from datetime import datetime
                roster = db.query(DutyRoster).filter(
                    DutyRoster.deleted_at.is_(None),
                    DutyRoster.employee_id == employee_id,
                    DutyRoster.week_start_date >= datetime.strptime(start, "%Y-%m-%d"),
                    DutyRoster.week_start_date <= datetime.strptime(end, "%Y-%m-%d"),
                ).first()
                if roster:
                    wd = _shift_workdays(db, roster.shift_id)
                    if wd:
                        return wd
            except Exception:
                pass
        # 2. Resolve the employee's org for org-level fallbacks
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if emp:
            organization_id = organization_id or emp.organization_id
        # 2.5 Company/branch/department-wise attendance config (most specific wins)
        scoped = resolve_scoped_attendance_config(db, employee_id, organization_id)
        if scoped:
            wd = _parse_working_days(scoped.get("workingDays"))
            if wd:
                return wd
    # 3. Org default attendance policy
    wd = _org_policy_workdays(db, organization_id)
    if wd:
        return wd
    # 4. Any active org shift
    wd = _org_shift_workdays(db, organization_id)
    if wd:
        return wd
    # 5. Neutral fallback: never assume Mon-Fri
    return list(NEUTRAL_WORKDAYS)
