"""
Data archival system for HRMS backend.

Moves old records from high-volume tables to corresponding archive tables
to keep the primary tables small and performant.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

from sqlalchemy import text
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


def _recreate_if_stale(db: Session, archive_table: str, source_table: str) -> None:
    """Drop archive table if its column count doesn't match the source table."""
    try:
        src_cols = db.execute(text(
            f"SELECT count(*) FROM information_schema.columns WHERE table_name = '{source_table}'"
        )).scalar() or 0
        arc_exists = db.execute(text(
            f"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '{archive_table}')"
        )).scalar()
        if arc_exists:
            arc_cols = db.execute(text(
                f"SELECT count(*) FROM information_schema.columns WHERE table_name = '{archive_table}'"
            )).scalar() or 0
            if arc_cols != src_cols:
                db.execute(text(f"DROP TABLE IF EXISTS {archive_table}"))
                db.commit()
                logger.info("Dropped stale archive table %s (%d cols vs source %d cols)", archive_table, arc_cols, src_cols)
    except Exception as exc:
        db.rollback()
        logger.warning("Could not check archive table %s for staleness: %s", archive_table, exc)


def archive_old_attendance(db: Session, cutoff_days: int = 365) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_days)
    _ensure_archive_table(
        db,
        """
        CREATE TABLE IF NOT EXISTS attendance_archive (
            LIKE attendances INCLUDING ALL
        )
        """,
        "attendance_archive",
    )

    result = db.execute(
        text(
            """
            INSERT INTO attendance_archive
            SELECT a.* FROM attendances a
            WHERE a.date < :cutoff
              AND a.deleted_at IS NULL
            RETURNING id
            """
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(
            text("DELETE FROM attendances WHERE id = ANY(:ids)"),
            {"ids": archived_ids},
        )
        db.commit()
    logger.info("Archived %d attendance records older than %d days", len(archived_ids), cutoff_days)
    return {"archived": len(archived_ids)}


def archive_old_payroll(db: Session, cutoff_years: int = 2) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_years * 365)
    # Drop stale archive table if its columns don't match payrolls (schema drift).
    _recreate_if_stale(db, "payroll_archive", "payrolls")
    _ensure_archive_table(
        db,
        """
        CREATE TABLE IF NOT EXISTS payroll_archive (
            LIKE payrolls INCLUDING ALL
        )
        """,
        "payroll_archive",
    )
    result = db.execute(
        text(
            """
            INSERT INTO payroll_archive
            SELECT p.* FROM payrolls p
            WHERE p.created_at < :cutoff
              AND p.deleted_at IS NULL
            RETURNING id
            """
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(
            text("DELETE FROM payrolls WHERE id = ANY(:ids)"),
            {"ids": archived_ids},
        )
        db.commit()
    logger.info("Archived %d payroll records older than %d years", len(archived_ids), cutoff_years)
    return {"archived": len(archived_ids)}


def archive_old_notifications(db: Session, cutoff_days: int = 90) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_days)
    _ensure_archive_table(
        db,
        """
        CREATE TABLE IF NOT EXISTS notification_archive (
            LIKE notifications INCLUDING ALL
        )
        """,
        "notification_archive",
    )
    result = db.execute(
        text(
            """
            INSERT INTO notification_archive
            SELECT n.* FROM notifications n
            WHERE n.created_at < :cutoff
            RETURNING id
            """
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(
            text("DELETE FROM notifications WHERE id = ANY(:ids)"),
            {"ids": archived_ids},
        )
        db.commit()
    logger.info("Archived %d notifications older than %d days", len(archived_ids), cutoff_days)
    return {"archived": len(archived_ids)}


def archive_old_audit_logs(db: Session, cutoff_days: int = 365) -> Dict[str, int]:
    cutoff = datetime.utcnow() - timedelta(days=cutoff_days)
    _ensure_archive_table(
        db,
        """
        CREATE TABLE IF NOT EXISTS audit_log_archive (
            LIKE audit_logs INCLUDING ALL
        )
        """,
        "audit_log_archive",
    )
    result = db.execute(
        text(
            """
            INSERT INTO audit_log_archive
            SELECT a.* FROM audit_logs a
            WHERE a.created_at < :cutoff
            RETURNING id
            """
        ),
        {"cutoff": cutoff},
    )
    archived_ids = [row[0] for row in result.fetchall()]
    if archived_ids:
        db.execute(
            text("DELETE FROM audit_logs WHERE id = ANY(:ids)"),
            {"ids": archived_ids},
        )
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
