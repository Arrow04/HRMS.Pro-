"""Scheduled maintenance tasks (selfie retention, etc.)."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.document_retention import (
    EMPLOYEE_DOC_MAX_UPLOAD_BYTES,
    get_document_retention_policy,
    purge_exited_employee_documents,
)
from core.selfie_storage import SELFIE_RETENTION_DAYS, run_selfie_retention_job
from database import get_db
from models import User

router = APIRouter(tags=["Maintenance"])

_ADMIN_ROLES = frozenset({"superadmin", "admin", "hr_admin"})


def _check_cron_secret(x_cron_secret: Optional[str]) -> bool:
    expected = os.getenv("CRON_SECRET", "").strip()
    return bool(expected and x_cron_secret and x_cron_secret == expected)


@router.post("/api/admin/maintenance/purge-selfies")
def purge_attendance_selfies_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete check-in/out selfie photos older than 3 months (90 days).
    Attendance punch records are kept; only image files and URLs are removed.
    """
    if current_user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = run_selfie_retention_job(db)
    return {
        "message": f"Purged attendance selfies older than {SELFIE_RETENTION_DAYS} days",
        **result,
    }


@router.post("/api/cron/purge-selfies")
def purge_attendance_selfies_cron(
    db: Session = Depends(get_db),
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
):
    """Unattended nightly job — requires ``CRON_SECRET`` env and matching header."""
    if not _check_cron_secret(x_cron_secret):
        raise HTTPException(status_code=403, detail="Invalid or missing X-Cron-Secret")
    result = run_selfie_retention_job(db)
    return {
        "message": f"Purged attendance selfies older than {SELFIE_RETENTION_DAYS} days",
        **result,
    }


@router.get("/api/admin/maintenance/document-retention")
def document_retention_policy(current_user: User = Depends(get_current_user)):
    """Full retention policy for selfies vs identity docs vs payslips."""
    if current_user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    return get_document_retention_policy()


@router.post("/api/admin/maintenance/purge-exited-documents")
def purge_exited_documents_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove uploaded PAN/Aadhaar/resume **files** for employees who exited
  more than 7 years ago (configurable). Payroll and archive records stay.
    """
    if current_user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    result = purge_exited_employee_documents(db)
    return {
        "message": "Exited-employee document file purge complete",
        **result,
    }


@router.post("/api/cron/purge-exited-documents")
def purge_exited_documents_cron(
    db: Session = Depends(get_db),
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
):
    if not _check_cron_secret(x_cron_secret):
        raise HTTPException(status_code=403, detail="Invalid or missing X-Cron-Secret")
    result = purge_exited_employee_documents(db)
    return {"message": "Exited-employee document file purge complete", **result}


@router.get("/api/admin/maintenance/selfie-retention")
def selfie_retention_policy(current_user: User = Depends(get_current_user)):
    """Read-only policy for ops dashboards."""
    if current_user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    return {
        "retentionDays": SELFIE_RETENTION_DAYS,
        "retentionMonths": 3,
        "scope": "check_in_selfie_url and check_out_selfie_url only",
        "attendanceRecordsKept": True,
    }
