"""Auto-sync holidays to attendance calendar for all employees."""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models import Attendance, Employee, Holiday, Organization

logger = logging.getLogger(__name__)


def sync_holiday_to_attendance(db: Session, holiday: Holiday) -> dict:
    """Auto-populate attendance records for all active employees on a holiday.

    Respects company-scoped holidays: if the holiday is linked to a company,
    only that company's active employees get the attendance record. If the
    holiday is org-wide (no company), all active employees in the org get it.
    """
    org = db.query(Organization).filter(Organization.id == holiday.organization_id).first()
    if not org:
        return {"status": "skipped", "reason": "Organization not found"}

    query = db.query(Employee).filter(
        Employee.organization_id == holiday.organization_id,
        Employee.status == "active",
    )
    if holiday.company_id:
        # Company-scoped holiday: only that company's employees.
        query = query.filter(Employee.company_id == holiday.company_id)

    employees = query.all()

    holiday_date = holiday.date
    if isinstance(holiday_date, str):
        from dateutil import parser as dateparser
        holiday_date = dateparser.parse(holiday_date)

    created = 0
    skipped = 0
    for emp in employees:
        existing = db.query(Attendance).filter(
            Attendance.employee_id == emp.id,
            Attendance.date == holiday_date,
        ).first()
        if existing:
            skipped += 1
            continue

        att = Attendance(
            employee_id=emp.id,
            organization_id=org.id,
            company_id=emp.company_id or holiday.company_id,
            department_id=emp.department_id,
            date=holiday_date,
            status="holiday",
            work_hours=0,
            scheduled_hours=0,
            is_holiday=True,
            holiday_id=holiday.id,
            notes=f"Holiday: {holiday.name}",
        )
        db.add(att)
        created += 1

    if created:
        db.commit()
        logger.info(f"Synced holiday '{holiday.name}' → {created} attendance records (skipped {skipped})")

    return {
        "status": "success",
        "holiday": holiday.name,
        "date": holiday_date.isoformat() if hasattr(holiday_date, "isoformat") else str(holiday_date),
        "created": created,
        "skipped": skipped,
    }


def sync_all_holidays_for_month(db: Session, org_id: int, year: int, month: int, company_id: Optional[int] = None) -> list:
    """Sync all holidays in a given month for an organization (optionally for one company)."""
    from calendar import monthrange
    start_date = datetime(year, month, 1)
    end_date = datetime(year, month, monthrange(year, month)[1])

    query = db.query(Holiday).filter(
        Holiday.organization_id == org_id,
        Holiday.date >= start_date,
        Holiday.date <= end_date,
    )
    if company_id:
        # Only sync holidays that apply to this company (or are org-wide).
        query = query.filter((Holiday.company_id == company_id) | (Holiday.company_id.is_(None)))

    holidays = query.all()

    results = []
    for h in holidays:
        result = sync_holiday_to_attendance(db, h)
        results.append(result)
    return results


def remove_holiday_attendance(db: Session, holiday: Holiday) -> dict:
    """Remove attendance records that were created for a holiday."""
    holiday_date = holiday.date
    if isinstance(holiday_date, str):
        from dateutil import parser as dateparser
        holiday_date = dateparser.parse(holiday_date)

    records = db.query(Attendance).filter(
        Attendance.holiday_id == holiday.id,
        Attendance.date == holiday_date,
    ).all()

    count = len(records)
    for rec in records:
        db.delete(rec)
    if count:
        db.commit()

    return {"status": "success", "deleted": count}
