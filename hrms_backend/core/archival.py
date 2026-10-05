"""
Data archival system for HRMS backend.

Moves old records from high-volume tables to corresponding archive tables
to keep the primary tables small and performant.

Schema-drift safety: archive tables are created with `LIKE source INCLUDING
ALL` once, but source tables gain columns over time. Instead of `SELECT *`
(which breaks the moment the schemas diverge — the nightly job used to
crash with "INSERT has more expressions than target columns"), every run:
  1. ADDs any missing source columns to the archive table (non-destructive)
  2. INSERTs column-explicitly, restricted to the live column intersection
Archived data is never dropped to "fix" a mismatch.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _archive_table_exists(db: Session, table_name: str) -> bool:
    result = db.execute(
        text(
            "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = :t)"
        ),
        {"t": table_name},
    )
    return result.scalar() is True


def _ensure_archive_table(db: Session, create_sql: str, table_name: str):
    if not _archive_table_exists(db, table_name):
        try:
            db.execute(text(create_sql))
            db.commit()
            logger.info("Created archive table: %s", table_name)
        except Exception as exc:
            db.rollback()
            logger.error("Failed to create archive table %s: %s", table_name, exc)
            raise


def _sync_archive_schema(db: Session, source_table: str, archive_table: str) -> None:
    """ADD any source columns the archive table is missing (non-destructive)."""
    try:
        insp = inspect(db.bind)
        src = {c["name"]: c["type"] for c in insp.get_columns(source_table)}
        arc = {c["name"] for c in insp.get_columns(archive_table)}
        added = 0
        for name, col_type in src.items():
            if name not in arc:
                db.execute(text(
                    f'ALTER TABLE "{archive_table}" '
                    f'ADD COLUMN IF NOT EXISTS "{name}" {col_type}'
                ))
                added += 1
        if added:
            db.commit()
            logger.info("Synced %d column(s) into archive table %s", added, archive_table)
    except Exception as exc:
        db.rollback()
        logger.warning("Could not sync archive schema %s: %s", archive_table, exc)


def archive_old_attendance(db: Session, cutoff_days: int = 365) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_days)
    _ensure_archive_table(
        db,
        'CREATE TABLE IF NOT EXISTS attendance_archive (LIKE attendances INCLUDING ALL)',
        "attendance_archive",
    )
    _sync_archive_schema(db, "attendances", "attendance_archive")
    insp = inspect(db.bind)
    src_cols = [c["name"] for c in insp.get_columns("attendances")]
    arc_cols = {c["name"] for c in insp.get_columns("attendance_archive")}
    common = [c for c in src_cols if c in arc_cols]
    col_list = ", ".join(f'"{c}"' for c in common)
    sel_list = ", ".join(f'a."{c}"' for c in common)
    result = db.execute(
        text(
            f'INSERT INTO attendance_archive ({col_list}) '
            f"SELECT {sel_list} FROM attendances a "
            f"WHERE a.date < :cutoff AND a.deleted_at IS NULL "
            f"RETURNING id"
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(text("DELETE FROM attendances WHERE id = ANY(:ids)"), {"ids": archived_ids})
        db.commit()
    logger.info("Archived %d attendance records older than %d days", len(archived_ids), cutoff_days)
    return {"archived": len(archived_ids)}


def archive_old_payroll(db: Session, cutoff_years: int = 2) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_years * 365)
    _ensure_archive_table(
        db,
        'CREATE TABLE IF NOT EXISTS payroll_archive (LIKE payrolls INCLUDING ALL)',
        "payroll_archive",
    )
    _sync_archive_schema(db, "payrolls", "payroll_archive")
    insp = inspect(db.bind)
    src_cols = [c["name"] for c in insp.get_columns("payrolls")]
    arc_cols = {c["name"] for c in insp.get_columns("payroll_archive")}
    common = [c for c in src_cols if c in arc_cols]
    col_list = ", ".join(f'"{c}"' for c in common)
    sel_list = ", ".join(f'p."{c}"' for c in common)
    result = db.execute(
        text(
            f'INSERT INTO payroll_archive ({col_list}) '
            f"SELECT {sel_list} FROM payrolls p "
            f"WHERE p.created_at < :cutoff AND p.deleted_at IS NULL "
            f"RETURNING id"
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(text("DELETE FROM payrolls WHERE id = ANY(:ids)"), {"ids": archived_ids})
        db.commit()
    logger.info("Archived %d payroll records older than %d years", len(archived_ids), cutoff_years)
    return {"archived": len(archived_ids)}


def archive_old_notifications(db: Session, cutoff_days: int = 90) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_days)
    _ensure_archive_table(
        db,
        'CREATE TABLE IF NOT EXISTS notification_archive (LIKE notifications INCLUDING ALL)',
        "notification_archive",
    )
    # notifications gained organization_id + deleted_at after the archive
    # table was first created — sync them in before inserting.
    _sync_archive_schema(db, "notifications", "notification_archive")
    insp = inspect(db.bind)
    src_cols = [c["name"] for c in insp.get_columns("notifications")]
    arc_cols = {c["name"] for c in insp.get_columns("notification_archive")}
    common = [c for c in src_cols if c in arc_cols]
    col_list = ", ".join(f'"{c}"' for c in common)
    sel_list = ", ".join(f'n."{c}"' for c in common)
    result = db.execute(
        text(
            f'INSERT INTO notification_archive ({col_list}) '
            f"SELECT {sel_list} FROM notifications n "
            f"WHERE n.created_at < :cutoff "
            f"RETURNING id"
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(text("DELETE FROM notifications WHERE id = ANY(:ids)"), {"ids": archived_ids})
        db.commit()
    logger.info("Archived %d notifications older than %d days", len(archived_ids), cutoff_days)
    return {"archived": len(archived_ids)}


def archive_old_audit_logs(db: Session, cutoff_days: int = 365) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_days)
    _ensure_archive_table(
        db,
        'CREATE TABLE IF NOT EXISTS audit_log_archive (LIKE audit_logs INCLUDING ALL)',
        "audit_log_archive",
    )
    _sync_archive_schema(db, "audit_logs", "audit_log_archive")
    insp = inspect(db.bind)
    src_cols = [c["name"] for c in insp.get_columns("audit_logs")]
    arc_cols = {c["name"] for c in insp.get_columns("audit_log_archive")}
    common = [c for c in src_cols if c in arc_cols]
    col_list = ", ".join(f'"{c}"' for c in common)
    sel_list = ", ".join(f'a."{c}"' for c in common)
    result = db.execute(
        text(
            f'INSERT INTO audit_log_archive ({col_list}) '
            f"SELECT {sel_list} FROM audit_logs a "
            f"WHERE a.created_at < :cutoff "
            f"RETURNING id"
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(text("DELETE FROM audit_logs WHERE id = ANY(:ids)"), {"ids": archived_ids})
        db.commit()
    logger.info("Archived %d audit log records older than %d days", len(archived_ids), cutoff_days)
    return {"archived": len(archived_ids)}


def run_nightly_archival(db: Optional[Session] = None) -> Dict[str, Dict[str, int]]:
    """Run all archival jobs. Returns counts per table."""
    if db is None:
        from database import SessionLocal
        db = SessionLocal()
        close = True
    else:
        close = False
    try:
        results = {
            "attendance": archive_old_attendance(db),
            "payroll": archive_old_payroll(db),
            "notifications": archive_old_notifications(db),
            "audit_logs": archive_old_audit_logs(db),
        }
        return results
    except Exception as exc:
        logger.error("Nightly archival failed: %s", exc)
        raise
    finally:
        if close:
            db.close()
