"""
Aggregation endpoints for precomputed dashboard and summary statistics.

All endpoints use materialized views or cached aggregations to avoid
expensive live COUNT/SUM queries on large tables.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from core.auth import get_current_user
from core.cache import cached
from core.materialized_views import query_materialized_view
from core.read_replica import ReplicaRouter
from database import get_read_db
from models import User

logger = logging.getLogger(__name__)

router = ReplicaRouter(tags=["Aggregations"])


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager", "hr_executive"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


@router.get("/api/aggregations/dashboard/{organization_id}")
@cached(ttl=300)
def get_dashboard_stats(
    organization_id: int,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(_require_admin),
):
    if current_user.role != "superadmin" and current_user.organization_id != organization_id:
        raise HTTPException(status_code=403, detail="Cannot access other organizations")

    try:
        summary = query_materialized_view(db, "mv_employee_summary", organization_id, limit=1)
    except Exception as exc:
        logger.error("Dashboard summary query failed: %s", exc)
        summary = []

    total_employees = 0
    active_employees = 0
    if summary:
        for row in summary:
            total_employees += row.get("total_employees", 0) or 0
            active_employees += row.get("active_employees", 0) or 0

    try:
        attendance_rows = db.execute(
            text(
                """
                SELECT
                    COUNT(DISTINCT employee_id) as unique_employees,
                    SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
                    SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
                    SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_count
                FROM attendances
                WHERE organization_id = :org_id
                  AND date >= :from_date
                  AND deleted_at IS NULL
                """
            ),
            {"org_id": organization_id, "from_date": datetime.utcnow() - timedelta(days=30)},
        ).fetchone()
    except Exception as exc:
        logger.error("Dashboard attendance query failed: %s", exc)
        attendance_rows = None

    try:
        leave_rows = db.execute(
            text(
                """
                SELECT
                    COUNT(*) as pending_leaves,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_leaves
                FROM leave_applications
                WHERE organization_id = :org_id
                  AND status IN ('pending', 'approved')
                  AND deleted_at IS NULL
                  AND created_at >= :from_date
                """
            ),
            {"org_id": organization_id, "from_date": datetime.utcnow() - timedelta(days=30)},
        ).fetchone()
    except Exception as exc:
        logger.error("Dashboard leave query failed: %s", exc)
        leave_rows = None

    return {
        "organization_id": organization_id,
        "generated_at": datetime.utcnow().isoformat(),
        "employees": {
            "total": total_employees,
            "active": active_employees,
        },
        "attendance_last_30_days": {
            "unique_employees": attendance_rows.unique_employees if attendance_rows else 0,
            "present": attendance_rows.present_count if attendance_rows else 0,
            "absent": attendance_rows.absent_count if attendance_rows else 0,
            "late": attendance_rows.late_count if attendance_rows else 0,
        },
        "leaves_last_30_days": {
            "pending": leave_rows.pending_leaves if leave_rows else 0,
            "approved": leave_rows.approved_leaves if leave_rows else 0,
        },
    }


@router.get("/api/aggregations/attendance-summary")
def get_attendance_summary(
    organization_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = organization_id or current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required")

    try:
        if granularity == "day":
            date_trunc = "day"
        elif granularity == "week":
            date_trunc = "week"
        else:
            date_trunc = "month"

        rows = db.execute(
            text(
                f"""
                SELECT
                    DATE_TRUNC(:gran, date) as period,
                    COUNT(*) as total_records,
                    SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
                    SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count,
                    SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_count,
                    SUM(CASE WHEN status = 'half_day' THEN 1 ELSE 0 END) as half_day_count,
                    AVG(EXTRACT(EPOCH FROM (check_out - check_in))/3600) as avg_hours_worked
                FROM attendances
                WHERE organization_id = :org_id
                  AND deleted_at IS NULL
                  {("AND date >= :start_date" if start_date else "")}
                  {("AND date <= :end_date" if end_date else "")}
                GROUP BY period
                ORDER BY period DESC
                LIMIT 365
                """
            ),
            {
                "gran": date_trunc,
                "org_id": org_id,
                "start_date": start_date,
                "end_date": end_date,
            },
        ).fetchall()
    except Exception as exc:
        logger.error("Attendance summary query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch attendance summary")

    return {
        "organization_id": org_id,
        "granularity": granularity,
        "data": [
            {
                "period": r.period.isoformat() if r.period else None,
                "total_records": r.total_records or 0,
                "present_count": r.present_count or 0,
                "absent_count": r.absent_count or 0,
                "late_count": r.late_count or 0,
                "half_day_count": r.half_day_count or 0,
                "avg_hours_worked": float(r.avg_hours_worked or 0),
            }
            for r in rows
        ]
    }


@router.get("/api/aggregations/payroll-summary")
def get_payroll_summary(
    organization_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = organization_id or current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required")

    target_year = year or datetime.utcnow().year
    try:
        rows = db.execute(
            text(
                """
                SELECT
                    month,
                    SUM(gross_salary) as total_gross,
                    SUM(net_salary) as total_net,
                    SUM(total_deductions) as total_deductions,
                    COUNT(DISTINCT employee_id) as employee_count
                FROM payrolls
                WHERE organization_id = :org_id
                  AND year = :year
                  AND deleted_at IS NULL
                GROUP BY month
                ORDER BY month
                """
            ),
            {"org_id": org_id, "year": target_year},
        ).fetchall()
    except Exception as exc:
        logger.error("Payroll summary query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch payroll summary")

    return {
        "organization_id": org_id,
        "year": target_year,
        "data": [
            {
                "month": r.month,
                "total_gross": float(r.total_gross or 0),
                "total_net": float(r.total_net or 0),
                "total_deductions": float(r.total_deductions or 0),
                "employee_count": r.employee_count or 0,
            }
            for r in rows
        ],
    }


@router.get("/api/aggregations/employee-growth")
def get_employee_growth(
    organization_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    granularity: str = Query("month", pattern="^(day|week|month)$"),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = organization_id or current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required")

    end = end_date or datetime.utcnow().isoformat()
    start = start_date or (datetime.utcnow() - timedelta(days=365)).isoformat()

    try:
        rows = db.execute(
            text(
                f"""
                SELECT
                    DATE_TRUNC(:gran, join_date) as period,
                    COUNT(*) as new_employees
                FROM employees
                WHERE organization_id = :org_id
                  AND deleted_at IS NULL
                  AND join_date >= :start_date
                  AND join_date <= :end_date
                GROUP BY period
                ORDER BY period
                LIMIT 365
                """
            ),
            {"gran": granularity, "org_id": org_id, "start_date": start, "end_date": end},
        ).fetchall()
    except Exception as exc:
        logger.error("Employee growth query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch employee growth")

    return {
        "organization_id": org_id,
        "granularity": granularity,
        "start_date": start,
        "end_date": end,
        "data": [
            {
                "period": r.period.isoformat() if r.period else None,
                "new_employees": r.new_employees or 0,
            }
            for r in rows
        ],
    }
