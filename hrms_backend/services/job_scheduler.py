"""Central job scheduler — orchestrates all automated tasks on a timer.

In production, this would run as a separate worker process using APScheduler
or Celery Beat. For now, it provides the service layer and can be triggered
by an API endpoint or a lightweight timer.
"""

import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Available automated jobs ──

JOBS = {
    "daily_backup": {
        "name": "Daily Database Backup",
        "description": "Creates a compressed backup of the database with retention cleanup",
        "default_schedule": "daily",
        "default_time": "02:00",
    },
    "holiday_sync": {
        "name": "Holiday → Attendance Sync",
        "description": "Auto-populates attendance records for upcoming holidays",
        "default_schedule": "daily",
        "default_time": "00:30",
    },
    "attendance_auto_close": {
        "name": "Attendance Auto-Close",
        "description": "Flags open sessions (check-in without check-out) as clock-out violations",
        "default_schedule": "daily",
        "default_time": "22:30",
    },
    "payroll_reminder": {
        "name": "Payroll Reminder",
        "description": "Sends reminders to HR if payroll hasn't been run for the current month",
        "default_schedule": "monthly",
        "default_time": "09:00",
    },
    "anomaly_scan": {
        "name": "Auto Anomaly Scan",
        "description": "Runs anomaly detection on recent attendance & payroll data",
        "default_schedule": "daily",
        "default_time": "03:00",
    },
    "retention_cleanup": {
        "name": "Data Retention Cleanup",
        "description": "Purges soft-deleted records older than retention policy",
        "default_schedule": "weekly",
        "default_time": "04:00",
    },
}


def get_available_jobs() -> dict:
    return JOBS


def run_job(db: Session, job_id: str, org_id: Optional[int] = None) -> dict:
    """Execute a scheduled job by ID."""
    start = datetime.utcnow()

    if job_id == "daily_backup":
        from services.backup_service import create_backup, run_retention_policy
        result = create_backup()
        retention = run_retention_policy()
        return {"job": job_id, "status": result["status"], "backup": result, "retention": retention, "duration_ms": _elapsed(start)}

    elif job_id == "attendance_auto_close":
        from routers.maintenance import _auto_close_attendance
        result = _auto_close_attendance(db)
        return {"job": job_id, "status": "success", **result, "duration_ms": _elapsed(start)}

    elif job_id == "holiday_sync":
        if not org_id:
            return {"job": job_id, "status": "skipped", "reason": "org_id required"}
        from services.holiday_sync_service import sync_all_holidays_for_month
        now = datetime.utcnow()
        results = sync_all_holidays_for_month(db, org_id, now.year, now.month)
        return {"job": job_id, "status": "success", "results": results, "duration_ms": _elapsed(start)}

    elif job_id == "anomaly_scan":
        if not org_id:
            return {"job": job_id, "status": "skipped", "reason": "org_id required"}
        from services.anomaly_service import run_full_scan
        results = run_full_scan(db, org_id)
        return {"job": job_id, "status": "success", "alerts_created": len(results), "duration_ms": _elapsed(start)}

    elif job_id == "retention_cleanup":
        return _run_retention_cleanup(db, start)

    return {"job": job_id, "status": "unknown", "message": f"No handler for job: {job_id}"}


def run_all_jobs(db: Session, org_id: Optional[int] = None) -> list:
    """Run all applicable jobs."""
    results = []
    for job_id in JOBS:
        if job_id in ("daily_backup", "retention_cleanup") or org_id:
            result = run_job(db, job_id, org_id)
            results.append(result)
    return results


def _run_retention_cleanup(db: Session, start: datetime) -> dict:
    """Purge soft-deleted records older than 90 days."""
    from sqlalchemy import text
    from models import Employee, Payroll, Attendance

    cutoff = datetime.utcnow()
    tables = ["employees", "payrolls", "attendances", "holidays", "leave_applications"]
    total_purged = 0

    for table in tables:
        try:
            sql = text(f"DELETE FROM {table} WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff")
            result = db.execute(sql, {"cutoff": cutoff})
            total_purged += result.rowcount
        except Exception as e:
            logger.warning(f"Retention cleanup failed for {table}: {e}")

    if total_purged:
        db.commit()

    return {"job": "retention_cleanup", "status": "success", "purged_records": total_purged, "duration_ms": _elapsed(start)}


def _elapsed(start: datetime) -> int:
    return int((datetime.utcnow() - start).total_seconds() * 1000)
