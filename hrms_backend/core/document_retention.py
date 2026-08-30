"""
Employee identity / HR document retention (PAN, Aadhaar, CV, certificates, etc.).

These are NOT subject to the 90-day attendance selfie purge. Policy tiers:

- Attendance selfies: ephemeral, auto-deleted after 90 days (see selfie_storage.py).
- Identity uploads (PAN, Aadhaar, resume, certificates): kept while employed.
- After exit: file copies may be purged after a statutory window (default 7 years).
- Payslips: generated on demand from payroll rows — not stored as upload files.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from core.datetime_utils import ist_now_naive
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Years after exit/archive before uploaded identity **files** are removed (0 = never auto-delete).
IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT = int(
    os.getenv("IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT", "7")
)
EMPLOYEE_DOC_MAX_UPLOAD_BYTES = int(
    os.getenv("EMPLOYEE_DOC_MAX_UPLOAD_BYTES", str(8 * 1024 * 1024))
)

IDENTITY_DOC_TYPES = frozenset({
    "aadhar", "pan", "voter", "drivingLicense", "passport",
    "photo", "resume", "birthCertificate", "certificate",
})


def _employees_upload_dir() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "routers", "uploads", "employees"
    )


def _url_to_path(url: str) -> Optional[str]:
    if not url or not url.startswith("/uploads/employees/"):
        return None
    fname = url.rsplit("/", 1)[-1]
    path = os.path.join(_employees_upload_dir(), fname)
    return path if os.path.isfile(path) else None


def _delete_file_url(url: Optional[str]) -> bool:
    path = _url_to_path(url) if url else None
    if not path:
        return False
    try:
        os.remove(path)
        return True
    except OSError:
        return False


def collect_employee_file_urls(emp) -> Set[str]:
    urls: Set[str] = set()
    docs = emp.id_documents or {}
    for key, val in docs.items():
        if isinstance(val, str) and val.startswith("/uploads/"):
            urls.add(val)
    if emp.photo_url:
        urls.add(emp.photo_url)
    if emp.resume_url:
        urls.add(emp.resume_url)
    return urls


def clear_employee_document_refs(emp) -> None:
    emp.id_documents = {}
    emp.photo_url = None
    emp.resume_url = None


def get_document_retention_policy() -> Dict[str, Any]:
    return {
        "attendanceSelfies": {
            "retentionDays": int(os.getenv("SELFIE_RETENTION_DAYS", "90")),
            "autoPurge": True,
            "scope": "check_in_selfie_url, check_out_selfie_url files only",
            "attendanceRecordsKept": True,
        },
        "identityDocuments": {
            "types": sorted(IDENTITY_DOC_TYPES),
            "storage": "uploads/employees/ (compressed images; PDFs as uploaded)",
            "whileEmployed": "retained — never auto-deleted",
            "afterExitYears": IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT,
            "afterExitBehavior": (
                "uploaded file copies removed; archived employee text fields "
                "(PAN/Aadhaar numbers) and payroll history kept"
                if IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT > 0
                else "files kept until manual delete"
            ),
            "numbersInDatabase": "kept on employee/archive records (compliance)",
        },
        "payslips": {
            "storage": "generated from payroll table on demand (PDF in memory / email)",
            "diskFiles": False,
            "retention": "payroll rows kept per your accounting policy",
            "form16AndCertificates": "generated PDFs, not stored on disk by default",
        },
        "maxUploadBytes": EMPLOYEE_DOC_MAX_UPLOAD_BYTES,
    }


def _employee_exit_cutoff(years: int) -> datetime:
    return ist_now_naive() - timedelta(days=years * 365)


def purge_exited_employee_documents(
    db: Session,
    years_after_exit: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Remove identity document **files** for employees who left more than N years ago.
    Does not delete payroll, archive metadata, or attendance punch records.
    """
    years = (
        years_after_exit
        if years_after_exit is not None
        else IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT
    )
    if years <= 0:
        return {
            "yearsAfterExit": years,
            "employeesProcessed": 0,
            "filesDeleted": 0,
            "skipped": "IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT is 0 (disabled)",
        }

    cutoff = _employee_exit_cutoff(years)
    from models import ArchivedEmployee, Employee

    # Employees with a leaving date before cutoff who still reference uploads.
    exited = (
        db.query(Employee)
        .filter(
            or_(
                Employee.date_of_leaving.isnot(None),
                Employee.termination_date.isnot(None),
            ),
            or_(
                Employee.date_of_leaving < cutoff,
                Employee.termination_date < cutoff,
            ),
            or_(
                Employee.id_documents.isnot(None),
                Employee.photo_url.isnot(None),
                Employee.resume_url.isnot(None),
            ),
        )
        .all()
    )

    # Also process archived exits (files may still live on the original employee row).
    archived_ids = {
        row.original_id
        for row in db.query(ArchivedEmployee)
        .filter(
            or_(
                ArchivedEmployee.exit_date < cutoff,
                ArchivedEmployee.archive_date < cutoff,
            )
        )
        .all()
    }
    if archived_ids:
        extra = (
            db.query(Employee)
            .filter(
                Employee.id.in_(archived_ids),
                or_(
                    Employee.id_documents.isnot(None),
                    Employee.photo_url.isnot(None),
                    Employee.resume_url.isnot(None),
                ),
            )
            .all()
        )
        seen = {e.id for e in exited}
        for emp in extra:
            if emp.id not in seen:
                exited.append(emp)

    files_deleted = 0
    for emp in exited:
        urls = collect_employee_file_urls(emp)
        for url in urls:
            if _delete_file_url(url):
                files_deleted += 1
        clear_employee_document_refs(emp)

    if exited:
        db.commit()

    result = {
        "yearsAfterExit": years,
        "employeesProcessed": len(exited),
        "filesDeleted": files_deleted,
    }
    logger.info("Exited employee document purge complete", extra=result)
    return result
