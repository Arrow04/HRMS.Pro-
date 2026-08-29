"""Scheduled report delivery — email reports on cron schedules."""

import csv
import io
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import Payroll, Employee, Organization, User, Attendance

logger = logging.getLogger(__name__)

# ── Report Definitions ──

REPORT_TYPES = {
    "payroll_summary": {
        "name": "Payroll Summary",
        "description": "Monthly payroll summary with gross, deductions, net per employee",
        "formats": ["csv", "json"],
    },
    "attendance_report": {
        "name": "Attendance Report",
        "description": "Monthly attendance overview — present, absent, leave days per employee",
        "formats": ["csv", "json"],
    },
    "headcount_report": {
        "name": "Headcount Report",
        "description": "Organization headcount by department, designation, status",
        "formats": ["csv", "json"],
    },
    "statutory_compliance": {
        "name": "Statutory Compliance",
        "description": "PF, ESI, PT, LWF contributions summary for statutory filings",
        "formats": ["csv", "json"],
    },
    "custom": {
        "name": "Custom Report",
        "description": "User-defined custom report",
        "formats": ["csv", "json", "pdf"],
    },
}

SCHEDULE_FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"]


def get_report_types() -> dict:
    return REPORT_TYPES


def get_schedule_frequencies() -> list:
    return SCHEDULE_FREQUENCIES


def generate_report(db: Session, report_type: str, params: Optional[Dict] = None) -> dict:
    """Generate report data based on type and parameters."""
    params = params or {}
    org_id = params.get("organization_id")
    year = params.get("year", datetime.utcnow().year)
    month = params.get("month", datetime.utcnow().month)

    if report_type == "payroll_summary":
        return _generate_payroll_summary(db, org_id, year, month)
    elif report_type == "attendance_report":
        return _generate_attendance_report(db, org_id, year, month)
    elif report_type == "headcount_report":
        return _generate_headcount_report(db, org_id)
    elif report_type == "statutory_compliance":
        return _generate_statutory_compliance(db, org_id, year, month)
    return {"error": f"Unknown report type: {report_type}"}


def _generate_payroll_summary(db: Session, org_id: int, year: int, month: int) -> dict:
    query = db.query(Payroll).filter(Payroll.year == year, Payroll.month == month)
    if org_id:
        query = query.filter(Payroll.organization_id == org_id)
    records = query.all()

    rows = []
    for p in records:
        emp = db.query(Employee).filter(Employee.id == p.employee_id).first()
        rows.append({
            "employee": f"{emp.first_name} {emp.last_name}" if emp else "N/A",
            "code": emp.employee_code if emp else "N/A",
            "basic": p.basic_salary or 0,
            "gross": p.gross_salary or 0,
            "pf": p.pf_deduction or 0,
            "esi": p.esi_deduction or 0,
            "pt": p.professional_tax or 0,
            "tds": p.tds_deduction or 0,
            "total_deductions": p.total_deductions or 0,
            "net": p.net_salary or 0,
        })

    return {
        "type": "payroll_summary",
        "period": f"{month}/{year}",
        "total_records": len(rows),
        "total_gross": sum(r["gross"] for r in rows),
        "total_net": sum(r["net"] for r in rows),
        "rows": rows,
    }


def _generate_attendance_report(db: Session, org_id: int, year: int, month: int) -> dict:
    from calendar import monthrange
    start = datetime(year, month, 1)
    end = datetime(year, month, monthrange(year, month)[1])

    query = db.query(Attendance).filter(
        Attendance.date >= start, Attendance.date <= end,
    )
    if org_id:
        query = query.filter(Attendance.organization_id == org_id)
    records = query.all()

    from collections import defaultdict
    by_employee = defaultdict(lambda: {"present": 0, "absent": 0, "leave": 0, "holiday": 0, "half_day": 0})

    for a in records:
        emp_id = a.employee_id
        if a.is_holiday:
            by_employee[emp_id]["holiday"] += 1
        elif a.is_on_leave:
            by_employee[emp_id]["leave"] += 1
        elif a.status == "absent":
            by_employee[emp_id]["absent"] += 1
        elif a.status == "half_day":
            by_employee[emp_id]["half_day"] += 1
        elif a.status == "present":
            by_employee[emp_id]["present"] += 1

    rows = []
    for emp_id, counts in by_employee.items():
        emp = db.query(Employee).filter(Employee.id == emp_id).first()
        rows.append({
            "employee": f"{emp.first_name} {emp.last_name}" if emp else "N/A",
            **counts,
        })

    return {"type": "attendance_report", "period": f"{month}/{year}", "rows": rows}


def _generate_headcount_report(db: Session, org_id: int) -> dict:
    query = db.query(Employee)
    if org_id:
        query = query.filter(Employee.organization_id == org_id)
    employees = query.all()

    from collections import Counter
    by_department = Counter()
    by_designation = Counter()
    by_status = Counter()
    by_employment_type = Counter()

    for e in employees:
        dept = e.department.name if e.department else "Unassigned"
        by_department[dept] += 1
        by_designation[e.designation or "Unspecified"] += 1
        by_status[e.status or "active"] += 1
        by_employment_type[e.employment_type or "full_time"] += 1

    return {
        "type": "headcount_report",
        "total": len(employees),
        "by_department": dict(by_department.most_common()),
        "by_designation": dict(by_designation.most_common()),
        "by_status": dict(by_status.most_common()),
        "by_employment_type": dict(by_employment_type.most_common()),
    }


def _generate_statutory_compliance(db: Session, org_id: int, year: int, month: int) -> dict:
    query = db.query(Payroll).filter(Payroll.year == year, Payroll.month == month)
    if org_id:
        query = query.filter(Payroll.organization_id == org_id)
    records = query.all()

    total_pf = sum(p.pf_deduction or 0 for p in records)
    total_pf_employer = sum(p.pf_employer_contribution or 0 for p in records)
    total_esi = sum(p.esi_deduction or 0 for p in records)
    total_esi_employer = sum(p.esi_employer_contribution or 0 for p in records)
    total_pt = sum(p.professional_tax or 0 for p in records)
    total_lwf = sum(p.lwf_deduction or 0 for p in records)
    total_lwf_employer = sum(p.lwf_employer_contribution or 0 for p in records)

    return {
        "type": "statutory_compliance",
        "period": f"{month}/{year}",
        "employee_count": len(records),
        "pf_employee": round(total_pf, 2),
        "pf_employer": round(total_pf_employer, 2),
        "esi_employee": round(total_esi, 2),
        "esi_employer": round(total_esi_employer, 2),
        "professional_tax": round(total_pt, 2),
        "lwf_employee": round(total_lwf, 2),
        "lwf_employer": round(total_lwf_employer, 2),
        "total_statutory": round(total_pf + total_pf_employer + total_esi + total_esi_employer + total_pt + total_lwf + total_lwf_employer, 2),
    }


def report_to_csv(report: dict) -> str:
    """Convert a report dict to CSV string."""
    output = io.StringIO()
    rows = report.get("rows", [])
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return output.getvalue()
