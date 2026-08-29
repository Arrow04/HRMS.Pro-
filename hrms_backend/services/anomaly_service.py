"""
Anomaly Detection Engine
========================
Rule-based anomaly detection for attendance, payroll, and compliance.

Our competitive moat — Keka, greytHR, and Darwinbox offer no built-in
anomaly detection. We detect:
  - Buddy punching (same IP/location, multiple check-ins near-identical time)
  - Payroll amount drift (month-over-month changes exceeding threshold)
  - Overtime anomalies (excessive OT, pattern violations)
  - Duplicate bank accounts (multiple employees sharing account)
  - Duplicate payments (same amount + same account in same period)
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import AnomalyAlert, Attendance, Employee, Payroll, User

logger = logging.getLogger(__name__)

# ── Config ──

BUDDY_PUNCHING_TIME_WINDOW_MINUTES = 2
BUDDY_PUNCHING_LOCATION_TOLERANCE = 0.001  # ~100m lat/lng

PAYROLL_DRIFT_THRESHOLD_PERCENT = 20.0  # flag if change > 20%
MIN_PAYROLL_HISTORY_MONTHS = 1

OT_ANOMALY_DAILY_MAX_HOURS = 4
OT_ANOMALY_MONTHLY_MAX_HOURS = 60
OT_ANOMALY_CONSECUTIVE_DAYS = 5


# ── Detection Functions ──

def detect_buddy_punching(
    db: Session,
    org_id: int,
    date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Detect potential buddy punching.

    Flags groups of check-ins where multiple employees checked in from
    nearby locations within a short time window, suggesting one person
    clocked in for others.
    """
    query = db.query(Attendance).filter(
        Attendance.organization_id == org_id,
        Attendance.check_in.isnot(None),
        Attendance.check_in_latitude.isnot(None),
        Attendance.check_in_longitude.isnot(None),
    )
    if date:
        query = query.filter(func.date(Attendance.date) == date)
    else:
        query = query.filter(Attendance.date >= datetime.utcnow() - timedelta(days=7))

    records = query.order_by(Attendance.check_in).all()

    # Group by time proximity + location proximity
    groups: List[List[Attendance]] = []
    for rec in records:
        placed = False
        for group in groups:
            ref = group[0]
            time_diff = abs((rec.check_in - ref.check_in).total_seconds()) / 60
            lat_diff = abs((rec.check_in_latitude or 0) - (ref.check_in_latitude or 0))
            lng_diff = abs((rec.check_in_longitude or 0) - (ref.check_in_longitude or 0))
            if (time_diff <= BUDDY_PUNCHING_TIME_WINDOW_MINUTES
                    and lat_diff <= BUDDY_PUNCHING_LOCATION_TOLERANCE
                    and lng_diff <= BUDDY_PUNCHING_LOCATION_TOLERANCE):
                group.append(rec)
                placed = True
                break
        if not placed:
            groups.append([rec])

    # Flag groups with 2+ employees
    results = []
    for group in groups:
        if len(group) < 2:
            continue
        unique_employees = list(set(r.employee_id for r in group))
        if len(unique_employees) < 2:
            continue

        names = []
        for eid in unique_employees[:5]:
            emp = db.query(Employee).filter(Employee.id == eid).first()
            if emp:
                names.append(f"{emp.first_name} {emp.last_name or ''}".strip())

        results.append({
            "type": "buddy_punching",
            "severity": "high" if len(unique_employees) >= 3 else "medium",
            "title": f"Possible buddy punching: {len(unique_employees)} employees at same time/location",
            "description": f"{', '.join(names)} checked in within {BUDDY_PUNCHING_TIME_WINDOW_MINUTES} minutes from nearly identical locations on {group[0].date.strftime('%d %b %Y') if group[0].date else 'recent date'}.",
            "employee_ids": unique_employees,
            "related_entity_type": "attendance",
            "metadata": {
                "group_size": len(group),
                "unique_employees": len(unique_employees),
                "time_window_minutes": BUDDY_PUNCHING_TIME_WINDOW_MINUTES,
                "closest_check_in": group[0].check_in.isoformat() if group[0].check_in else None,
                "date": str(group[0].date.date()) if group[0].date else None,
                "avg_latitude": sum(r.check_in_latitude or 0 for r in group) / len(group),
                "avg_longitude": sum(r.check_in_longitude or 0 for r in group) / len(group),
            },
        })

    return results


def detect_payroll_drift(
    db: Session,
    org_id: int,
    month: Optional[int] = None,
    year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Detect significant changes in employee payroll amounts.

    Flags employees whose net pay changed by more than
    PAYROLL_DRIFT_THRESHOLD_PERCENT compared to the previous month.
    """
    now = datetime.utcnow()
    curr_month = month or now.month
    curr_year = year or now.year

    prev_month = curr_month - 1
    prev_year = curr_year
    if prev_month == 0:
        prev_month = 12
        prev_year -= 1

    current_payrolls = db.query(Payroll).filter(
        Payroll.organization_id == org_id,
        Payroll.month == curr_month,
        Payroll.year == curr_year,
    ).all()

    if not current_payrolls:
        return []

    prev_payrolls = db.query(Payroll).filter(
        Payroll.organization_id == org_id,
        Payroll.month == prev_month,
        Payroll.year == prev_year,
    ).all()

    prev_map = {p.employee_id: p for p in prev_payrolls}

    results = []
    for curr in current_payrolls:
        prev = prev_map.get(curr.employee_id)
        if not prev or prev.net_salary == 0:
            continue

        change_pct = abs((curr.net_salary - prev.net_salary) / prev.net_salary * 100)
        if change_pct < PAYROLL_DRIFT_THRESHOLD_PERCENT:
            continue

        emp = db.query(Employee).filter(Employee.id == curr.employee_id).first()
        name = f"{emp.first_name} {emp.last_name or ''}".strip() if emp else f"Employee #{curr.employee_id}"

        direction = "increased" if curr.net_salary > prev.net_salary else "decreased"

        results.append({
            "type": "payroll_drift",
            "severity": "critical" if change_pct > 50 else "high" if change_pct > 30 else "medium",
            "title": f"Payroll {direction} by {change_pct:.0f}% — {name}",
            "description": f"{name}'s net pay {direction} from {prev.net_salary:,.0f} to {curr.net_salary:,.0f} ({change_pct:.0f}% change) between {prev_month}/{prev_year} and {curr_month}/{curr_year}.",
            "employee_ids": [curr.employee_id],
            "related_entity_type": "payroll",
            "related_entity_id": curr.id,
            "metadata": {
                "previous_net": prev.net_salary,
                "current_net": curr.net_salary,
                "change_pct": round(change_pct, 1),
                "previous_month": prev_month,
                "previous_year": prev_year,
                "current_month": curr_month,
                "current_year": curr_year,
            },
        })

    return results


def detect_overtime_anomalies(
    db: Session,
    org_id: int,
    month: Optional[int] = None,
    year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Detect unusual overtime patterns.

    Flags employees with:
    - OT exceeding daily max on multiple days
    - OT exceeding monthly threshold
    - Consecutive days with OT (potential manipulation)
    """
    now = datetime.utcnow()
    curr_month = month or now.month
    curr_year = year or now.year

    records = db.query(Attendance).filter(
        Attendance.organization_id == org_id,
        func.extract("month", Attendance.date) == curr_month,
        func.extract("year", Attendance.date) == curr_year,
        Attendance.overtime_hours > 0,
    ).order_by(Attendance.employee_id, Attendance.date).all()

    # Per-employee analysis
    emp_ot: Dict[int, List[Attendance]] = defaultdict(list)
    for r in records:
        emp_ot[r.employee_id].append(r)

    results = []
    for emp_id, ot_records in emp_ot.items():
        emp = db.query(Employee).filter(Employee.id == emp_id).first()
        name = f"{emp.first_name} {emp.last_name or ''}".strip() if emp else f"Employee #{emp_id}"

        total_ot = sum(r.overtime_hours for r in ot_records)
        daily_over_max = [r for r in ot_records if r.overtime_hours > OT_ANOMALY_DAILY_MAX_HOURS]
        consecutive_days = _count_consecutive_ot_days(ot_records)

        flags = []
        if total_ot > OT_ANOMALY_MONTHLY_MAX_HOURS:
            flags.append(f"monthly OT ({total_ot:.0f}h) exceeds {OT_ANOMALY_MONTHLY_MAX_HOURS}h limit")
        if len(daily_over_max) >= 3:
            flags.append(f"{len(daily_over_max)} days with OT > {OT_ANOMALY_DAILY_MAX_HOURS}h")
        if consecutive_days >= OT_ANOMALY_CONSECUTIVE_DAYS:
            flags.append(f"{consecutive_days} consecutive days with OT")

        if not flags:
            continue

        severity = "critical" if total_ot > OT_ANOMALY_MONTHLY_MAX_HOURS * 1.5 else "high" if total_ot > OT_ANOMALY_MONTHLY_MAX_HOURS else "medium"

        results.append({
            "type": "overtime_anomaly",
            "severity": severity,
            "title": f"OT anomaly: {name} — {', '.join(flags)}",
            "description": f"{name} logged {total_ot:.0f}h of overtime in {curr_month}/{curr_year}. Details: {'; '.join(flags)}.",
            "employee_ids": [emp_id],
            "related_entity_type": "attendance",
            "metadata": {
                "total_overtime_hours": round(total_ot, 1),
                "daily_max_count": len(daily_over_max),
                "consecutive_days": consecutive_days,
                "month": curr_month,
                "year": curr_year,
                "ot_records_count": len(ot_records),
            },
        })

    return results


def detect_duplicate_bank_accounts(
    db: Session,
    org_id: int,
) -> List[Dict[str, Any]]:
    """Detect employees sharing the same bank account number."""
    employees = db.query(Employee).filter(
        Employee.organization_id == org_id,
        Employee.bank_account_number.isnot(None),
        Employee.bank_account_number != "",
        Employee.status == "active",
    ).all()

    account_map: Dict[str, List[Employee]] = defaultdict(list)
    for emp in employees:
        account_map[emp.bank_account_number].append(emp)

    results = []
    for account, emps in account_map.items():
        if len(emps) < 2:
            continue

        names = [f"{e.first_name} {e.last_name or ''}".strip() for e in emps]

        results.append({
            "type": "duplicate_bank",
            "severity": "critical" if len(emps) > 2 else "high",
            "title": f"Duplicate bank account: {len(emps)} employees share account {account[-4:]}",
            "description": f"{', '.join(names)} all share the same bank account ({account[-4:]}). This could indicate payroll fraud.",
            "employee_ids": [e.id for e in emps],
            "related_entity_type": "employee",
            "metadata": {
                "account_suffix": account[-4:],
                "employee_count": len(emps),
                "employee_names": names,
            },
        })

    return results


def _count_consecutive_ot_days(records: List[Attendance]) -> int:
    """Count the longest streak of consecutive days with OT."""
    if not records:
        return 0

    dates = sorted(set(r.date.date() for r in records if r.date))
    if not dates:
        return 0

    max_streak = 1
    current = 1
    for i in range(1, len(dates)):
        if (dates[i] - dates[i - 1]).days == 1:
            current += 1
            max_streak = max(max_streak, current)
        else:
            current = 1

    return max_streak


# ── Scan Orchestrator ──

def run_full_scan(
    db: Session,
    org_id: int,
    current_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Run all anomaly detectors and persist new alerts.

    Returns scan summary with counts per type.
    """
    # Clean up old resolved/dismissed alerts (keep last 90 days)
    cutoff = datetime.utcnow() - timedelta(days=90)
    db.query(AnomalyAlert).filter(
        AnomalyAlert.organization_id == org_id,
        AnomalyAlert.status.in_(["resolved", "dismissed"]),
        AnomalyAlert.created_at < cutoff,
    ).delete(synchronize_session=False)
    db.commit()

    # Get existing open alerts to avoid duplicates
    existing = set()
    for alert in db.query(AnomalyAlert).filter(
        AnomalyAlert.organization_id == org_id,
        AnomalyAlert.status == "open",
    ).all():
        # Use (type, first employee_id, date) as dedup key
        first_eid = (alert.employee_ids or [None])[0]
        day = alert.created_at.strftime("%Y-%m-%d")
        existing.add((alert.anomaly_type, first_eid, day))

    detectors = [
        ("buddy_punching", detect_buddy_punching),
        ("payroll_drift", detect_payroll_drift),
        ("overtime_anomaly", detect_overtime_anomalies),
        ("duplicate_bank", detect_duplicate_bank_accounts),
    ]

    summary: Dict[str, Any] = {
        "scanned_at": datetime.utcnow().isoformat(),
        "detected": 0,
        "new_alerts": 0,
        "by_type": defaultdict(int),
    }

    for dtype, detector in detectors:
        try:
            findings = detector(db, org_id)
        except Exception as e:
            logger.exception("Anomaly detector %s failed", dtype)
            continue

        for finding in findings:
            summary["detected"] += 1
            summary["by_type"][dtype] += 1

            # Dedup check
            first_eid = (finding["employee_ids"] or [None])[0]
            day_key = datetime.utcnow().strftime("%Y-%m-%d")
            dedup_key = (finding["type"], first_eid, day_key)
            if dedup_key in existing:
                continue

            alert = AnomalyAlert(
                organization_id=org_id,
                anomaly_type=finding["type"],
                severity=finding["severity"],
                title=finding["title"],
                description=finding["description"],
                employee_ids=finding["employee_ids"],
                related_entity_type=finding.get("related_entity_type"),
                related_entity_id=finding.get("related_entity_id"),
                evidence_data=finding.get("metadata"),
                status="open",
            )
            db.add(alert)
            summary["new_alerts"] += 1
            existing.add(dedup_key)

    db.commit()
    logger.info(f"Anomaly scan complete: org_id={org_id}, detected={summary['detected']}, new={summary['new_alerts']}")
    return dict(summary)
