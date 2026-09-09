"""
Full-text search endpoints using PostgreSQL GIN indexes.

Provides search across employees, departments, and other entities
with pagination and organization filtering.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.cache import cached
from core.read_replica import ReplicaRouter
from database import get_read_db
from models import User

logger = logging.getLogger(__name__)

router = ReplicaRouter(tags=["Search"])


@router.get("/api/search/employees")
@cached(ttl=60)
def search_employees(
    q: str = Query(..., min_length=1, description="Search query"),
    organization_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager", "employee"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = organization_id or current_user.organization_id
    if not org_id and current_user.role != "superadmin":
        raise HTTPException(status_code=400, detail="organization_id is required")

    search_term = f"%{q.lower()}%"
    offset = (page - 1) * limit

    query = db.query(
        User.id,
        User.full_name,
        User.email,
        User.role,
        User.organization_id,
    ).join(
        User, User.id == User.id, isouter=True
    )

    # Try using GIN index with similarity search if pg_trgm is available
    try:
        rows = db.execute(
            text(
                """
                SELECT e.id, e.full_name, e.email, e.employee_code, e.organization_id
                FROM employees e
                WHERE e.deleted_at IS NULL
                  AND (
                    LOWER(e.full_name) LIKE :term
                    OR LOWER(e.email) LIKE :term
                    OR LOWER(e.employee_code) LIKE :term
                    OR similarity(LOWER(e.full_name), :term) > 0.2
                  )
                  {org_filter}
                ORDER BY similarity(LOWER(e.full_name), :term) DESC, e.id
                LIMIT :limit OFFSET :offset
                """
            ),
            {
                "term": search_term,
                "limit": limit,
                "offset": offset,
                "org_filter": f"AND e.organization_id = {org_id}" if org_id else "",
            },
        ).fetchall()

        total = db.execute(
            text(
                """
                SELECT COUNT(*) FROM employees e
                WHERE e.deleted_at IS NULL
                  AND (
                    LOWER(e.full_name) LIKE :term
                    OR LOWER(e.email) LIKE :term
                    OR LOWER(e.employee_code) LIKE :term
                    OR similarity(LOWER(e.full_name), :term) > 0.2
                  )
                  {org_filter}
                """
            ),
            {
                "term": search_term,
                "org_filter": f"AND e.organization_id = {org_id}" if org_id else "",
            },
        ).scalar()
    except Exception as exc:
        logger.warning("GIN search failed, falling back to LIKE: %s", exc)
        rows = []
        total = 0
        # Fallback to basic LIKE search
        rows = db.execute(
            text(
                """
                SELECT e.id, e.full_name, e.email, e.employee_code, e.organization_id
                FROM employees e
                WHERE e.deleted_at IS NULL
                  AND (
                    LOWER(e.full_name) LIKE :term
                    OR LOWER(e.email) LIKE :term
                    OR LOWER(e.employee_code) LIKE :term
                  )
                  {org_filter}
                ORDER BY e.id
                LIMIT :limit OFFSET :offset
                """
            ),
            {
                "term": search_term,
                "limit": limit,
                "offset": offset,
                "org_filter": f"AND e.organization_id = {org_id}" if org_id else "",
            },
        ).fetchall()
        total = db.execute(
            text(
                """
                SELECT COUNT(*) FROM employees e
                WHERE e.deleted_at IS NULL
                  AND (
                    LOWER(e.full_name) LIKE :term
                    OR LOWER(e.email) LIKE :term
                    OR LOWER(e.employee_code) LIKE :term
                  )
                  {org_filter}
                """
            ),
            {
                "term": search_term,
                "org_filter": f"AND e.organization_id = {org_id}" if org_id else "",
            },
        ).scalar()

    return {
        "query": q,
        "organization_id": org_id,
        "page": page,
        "limit": limit,
        "total": total or 0,
        "results": [
            {
                "id": r.id,
                "full_name": r.full_name,
                "email": r.email,
                "employee_code": r.employee_code,
                "organization_id": r.organization_id,
            }
            for r in rows
        ],
    }


@router.get("/api/search/departments")
@cached(ttl=60)
def search_departments(
    q: str = Query(..., min_length=1, description="Search query"),
    organization_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = organization_id or current_user.organization_id
    if not org_id and current_user.role != "superadmin":
        raise HTTPException(status_code=400, detail="organization_id is required")

    search_term = f"%{q.lower()}%"
    offset = (page - 1) * limit

    from models import Department
    query = db.query(Department).filter(Department.deleted_at.is_(None))
    if org_id:
        query = query.filter(Department.organization_id == org_id)

    query = query.filter(
        or_(
            Department.name.ilike(search_term),
            Department.code.ilike(search_term),
            Department.description.ilike(search_term),
        )
    )

    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    return {
        "query": q,
        "organization_id": org_id,
        "page": page,
        "limit": limit,
        "total": total,
        "results": [
            {
                "id": r.id,
                "name": r.name,
                "code": r.code,
                "description": r.description,
                "organization_id": r.organization_id,
            }
            for r in rows
        ],
    }
