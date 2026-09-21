"""Company-level data isolation (strict mode).

Rule: superadmin/admin see every company in their org. Every other role sees
ONLY their own company, derived server-side from their employee record
(Employee.user_id -> Employee.company_id). Client-supplied company filters
(query param or X-Company-Id header) are validated against that allow-list —
spoofing another company's id returns 403 instead of data.

Users with no employee row (pure logins) get an empty allow-list: they see
no company data until an admin links them to an employee/company.
A NULL employee.company_id (unassigned) also yields an empty allow-list
(secure default); admins must assign the company.

Usage in list endpoints:
    from core.company_scope import resolve_company_scope
    company_id = resolve_company_scope(db, current_user, companyId, request)
    if company_id is not None:
        query = query.filter(Model.company_id == company_id)

Usage in detail endpoints (record already loaded + org-checked):
    from core.company_scope import assert_company_allowed
    assert_company_allowed(db, current_user, getattr(record, "company_id", None))

Usage in writes (stamp or validate the payload company):
    company_id = require_write_company(db, current_user, payload_company_id)
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

FULL_ACCESS_ROLES = {"superadmin", "admin"}


def _role(user) -> str:
    return (getattr(user, "role", None) or "").strip().lower()


def get_user_company_ids(db: Session, user) -> Optional[List[int]]:
    """Allow-list of company ids for the caller. None = unrestricted (admin)."""
    if _role(user) in FULL_ACCESS_ROLES:
        return None
    try:
        from models import Employee

        emp = (
            db.query(Employee)
            .filter(Employee.user_id == getattr(user, "id", None), Employee.deleted_at.is_(None))
            .first()
        )
    except Exception:
        return []
    if not emp or not getattr(emp, "company_id", None):
        return []
    return [int(emp.company_id)]


def resolve_company_scope(
    db: Session,
    user,
    requested_id=None,
    request: Request = None,
) -> Optional[int]:
    """Resolve the effective company filter for a read.

    Returns None when the caller may see all companies. Otherwise returns the
    single allowed company id (forcing the filter even when the caller asked
    for nothing). Raises 403 when the caller requests a company outside
    their allow-list (header/query spoofing).
    """
    allowed = get_user_company_ids(db, user)
    if allowed is None:
        if requested_id in (None, "", "all"):
            if request is not None:
                from core.tenant import get_header_company_id

                hdr = get_header_company_id(request)
                if hdr not in (None, "", "all"):
                    return int(hdr)
            return None
        return int(requested_id)
    # Restricted caller: determine what was asked (explicit param wins, then header).
    asked = requested_id
    if asked in (None, "", "all") and request is not None:
        from core.tenant import get_header_company_id

        asked = get_header_company_id(request)
    if asked in (None, "", "all"):
        if not allowed:
            raise HTTPException(status_code=403, detail="No company assigned to this user")
        return allowed[0]
    try:
        asked_int = int(asked)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid company id")
    if asked_int not in allowed:
        raise HTTPException(status_code=403, detail="Not authorized for this company")
    return asked_int


def assert_company_allowed(db: Session, user, company_id) -> None:
    """Raise 403 unless the caller may access records of this company."""
    allowed = get_user_company_ids(db, user)
    if allowed is None:
        return
    if company_id is None:
        return  # org-wide record (global default) — visible to all in org
    try:
        cid = int(company_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized for this company")
    if cid not in allowed:
        raise HTTPException(status_code=403, detail="Not authorized for this company")


def require_write_company(db: Session, user, payload_company_id):
    """Resolve the company id a write may target.

    Restricted callers can only write into their own company: an explicit
    foreign company id is rejected, and a missing one is stamped with theirs.
    Returns the validated company id (or None for unrestricted callers that
    passed none).
    """
    allowed = get_user_company_ids(db, user)
    if allowed is None:
        return payload_company_id
    if payload_company_id in (None, "", "all", 0):
        if not allowed:
            raise HTTPException(status_code=403, detail="No company assigned to this user")
        return allowed[0]
    try:
        cid = int(payload_company_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid company id")
    if cid not in allowed:
        raise HTTPException(status_code=403, detail="Not authorized for this company")
    return cid
