"""HRMS API announcements routes (notification-backed announcements & notices)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.cache import cached
from core.tenant import validate_company_in_org, get_header_company_id
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from database import get_db, get_read_db
from models import Company, Notification, User

router = APIRouter(tags=["Announcements"])

ADMIN_ROLES = ("superadmin", "hr_admin", "admin")


def _extras(data: dict) -> dict:
    return {
        "category": (data.get("category") or "General"),
        "pinned": bool(data.get("pinned", False)),
        "audience": data.get("audience") or "all",
        "expiresAt": data.get("expires_at"),
    }


def _serialize(n: Notification) -> dict:
    data = n.data if isinstance(n.data, dict) else {}
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "type": n.type or "announcement",
        "isRead": bool(n.is_read),
        "createdAt": n.created_at.isoformat() if n.created_at else None,
        **_extras(data),
    }


@cached(ttl=60)
@router.get("/api/announcements", tags=["Announcements"])
def get_announcements(
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    companyId = resolve_company_scope(db, current_user, companyId, request)
    query = db.query(Notification).filter(
        Notification.deleted_at.is_(None),
        Notification.type.in_(["announcement", "notice"]),
    )
    if current_user.role != "superadmin":
        query = query.filter(Notification.organization_id == current_user.organization_id)
        if companyId:
            validate_company_in_org(db, Company, companyId, current_user.organization_id)
    elif organizationId:
        query = query.filter(Notification.organization_id == organizationId)
    if companyId:
        # Strict company match: org-wide broadcasts are NOT shared (admins see all by passing nothing).
        query = query.filter(Notification.company_id == companyId)
    rows = query.order_by(Notification.created_at.desc()).limit(200).all()
    return [_serialize(n) for n in rows]


@router.post("/api/announcements", tags=["Announcements"])
def create_announcement(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")
    title = (data.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    announcement_type = (data.get("type") or "announcement").strip().lower()
    if announcement_type not in ("announcement", "notice"):
        raise HTTPException(status_code=400, detail="Invalid type")
    notification = Notification(
        user_id=current_user.id,
        title=title,
        body=(data.get("body") or "").strip(),
        type=announcement_type,
        reference_id=data.get("referenceId"),
        data={
            "category": (data.get("category") or "General").strip() or "General",
            "pinned": bool(data.get("pinned", False)),
            "audience": (data.get("audience") or "all").strip().lower() or "all",
            "expires_at": data.get("expiresAt"),
        },
        organization_id=current_user.organization_id,
        company_id=require_write_company(db, current_user, data.get("companyId")),
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return {"message": "Announcement created", "id": notification.id}


@router.put("/api/announcements/{announcement_id}", tags=["Announcements"])
def update_announcement(
    announcement_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")
    notification = db.query(Notification).filter(
        Notification.id == announcement_id, Notification.deleted_at.is_(None)
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Announcement not found")
    assert_company_allowed(db, current_user, notification.company_id)
    if data.get("title") is not None:
        notification.title = str(data["title"]).strip() or notification.title
    if data.get("body") is not None:
        notification.body = str(data["body"])
    if data.get("type"):
        announcement_type = str(data["type"]).strip().lower()
        if announcement_type not in ("announcement", "notice"):
            raise HTTPException(status_code=400, detail="Invalid type")
        notification.type = announcement_type
    if data.get("referenceId") is not None:
        notification.reference_id = data["referenceId"]
    payload = dict(notification.data) if isinstance(notification.data, dict) else {}
    if data.get("category") is not None:
        payload["category"] = str(data["category"]).strip() or "General"
    if "pinned" in data:
        payload["pinned"] = bool(data["pinned"])
    if data.get("audience") is not None:
        payload["audience"] = str(data["audience"]).strip().lower() or "all"
    if "expiresAt" in data:
        payload["expires_at"] = data["expiresAt"]
    notification.data = payload
    db.commit()
    return {"message": "Announcement updated", "id": notification.id}


@router.delete("/api/announcements/{announcement_id}", tags=["Announcements"])
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")
    notification = db.query(Notification).filter(Notification.id == announcement_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Announcement not found")
    assert_company_allowed(db, current_user, notification.company_id)
    notification.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Announcement deleted", "id": announcement_id}
