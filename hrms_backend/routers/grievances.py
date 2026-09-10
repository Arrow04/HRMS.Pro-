"""HRMS API grievances routes (dedicated grievance records)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.shared import _get_employee_id_for_user
from database import get_db, get_read_db
from models import Employee, Grievance, User

router = APIRouter(tags=["Grievances"])

ADMIN_ROLES = ("superadmin", "hr_admin", "admin")
GRIEVANCE_STATUSES = ("open", "in_progress", "resolved", "closed")


def _user_name(db: Session, user_id) -> Optional[str]:
    if not user_id:
        return None
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return None
    return (u.full_name or u.email or f"User #{u.id}") or None


def _serialize(grievance: Grievance, db: Session) -> dict:
    employee_name = None
    if grievance.employee_id:
        emp = db.query(Employee).filter(Employee.id == grievance.employee_id).first()
        if emp:
            employee_name = (emp.full_name or f"{emp.first_name or ''} {emp.last_name or ''}").strip() or None
    return {
        "id": grievance.id,
        "subject": grievance.subject,
        "description": grievance.description,
        "status": grievance.status,
        "type": grievance.type,
        "priority": grievance.priority or "medium",
        "employeeId": grievance.employee_id,
        "employeeName": employee_name,
        "assignedTo": grievance.assigned_to,
        "assignedToName": _user_name(db, grievance.assigned_to),
        "resolutionNotes": grievance.resolution_notes,
        "resolvedAt": grievance.resolved_at.isoformat() if grievance.resolved_at else None,
        "createdAt": grievance.created_at.isoformat() if grievance.created_at else None,
        "updatedAt": grievance.updated_at.isoformat() if grievance.updated_at else None,
    }


@router.get("/api/grievances", tags=["Grievances"])
def get_grievances(
    status: Optional[str] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Grievance).filter(Grievance.deleted_at.is_(None))
    if current_user.role not in ADMIN_ROLES:
        employee_id = _get_employee_id_for_user(db, current_user)
        if not employee_id:
            raise HTTPException(status_code=400, detail="Employee profile not found")
        query = query.filter(Grievance.employee_id == employee_id)
    if status:
        query = query.filter(Grievance.status == status)
    grievances = query.order_by(Grievance.created_at.desc()).limit(500).all()
    return [_serialize(g, db) for g in grievances]


@router.post("/api/grievances", tags=["Grievances"])
def create_grievance(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subject = (data.get("subject") or "").strip()
    if not subject:
        raise HTTPException(status_code=400, detail="Subject is required")
    description = (data.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="Description is required")
    employee_id = _get_employee_id_for_user(db, current_user)
    employee = db.query(Employee).filter(Employee.id == employee_id).first() if employee_id else None
    priority = (data.get("priority") or "medium").strip().lower()
    if priority not in ("low", "medium", "high", "urgent"):
        raise HTTPException(status_code=400, detail="Invalid priority")
    grievance = Grievance(
        subject=subject,
        description=description,
        type=(data.get("type") or "grievance").strip().lower() or "grievance",
        status="open",
        priority=priority,
        employee_id=employee_id,
        organization_id=getattr(employee, "organization_id", None) or current_user.organization_id,
        company_id=getattr(employee, "company_id", None),
    )
    db.add(grievance)
    db.commit()
    db.refresh(grievance)
    return {"message": "Grievance submitted", "id": grievance.id}


@router.put("/api/grievances/{grievance_id}", tags=["Grievances"])
def update_grievance(
    grievance_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    grievance = db.query(Grievance).filter(
        Grievance.id == grievance_id, Grievance.deleted_at.is_(None)
    ).first()
    if not grievance:
        raise HTTPException(status_code=404, detail="Grievance not found")
    is_admin = current_user.role in ADMIN_ROLES
    employee_id = _get_employee_id_for_user(db, current_user)
    is_owner = employee_id and grievance.employee_id == employee_id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="Not authorized")
    if "subject" in data and data["subject"] is not None:
        grievance.subject = str(data["subject"]).strip() or grievance.subject
    if "description" in data and data["description"] is not None:
        grievance.description = str(data["description"])
    if "type" in data and data["type"]:
        grievance.type = str(data["type"])
    if "priority" in data and data["priority"]:
        priority = str(data["priority"]).strip().lower()
        if priority not in ("low", "medium", "high", "urgent"):
            raise HTTPException(status_code=400, detail="Invalid priority")
        grievance.priority = priority
    if "assigned_to" in data and is_admin:
        grievance.assigned_to = data["assigned_to"]
    if "resolution_notes" in data and is_admin:
        grievance.resolution_notes = data["resolution_notes"]
    if "status" in data and data["status"]:
        status = str(data["status"]).strip().lower()
        if status not in GRIEVANCE_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        if status in ("resolved", "closed") and not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can resolve grievances")
        grievance.status = status
        if status in ("resolved", "closed") and not grievance.resolved_at:
            grievance.resolved_at = datetime.utcnow()
        if status not in ("resolved", "closed"):
            grievance.resolved_at = None
    db.commit()
    return {"message": "Grievance updated", "id": grievance_id}


@router.delete("/api/grievances/{grievance_id}", tags=["Grievances"])
def delete_grievance(
    grievance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")
    grievance = db.query(Grievance).filter(Grievance.id == grievance_id).first()
    if not grievance:
        raise HTTPException(status_code=404, detail="Grievance not found")
    grievance.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Grievance deleted", "id": grievance_id}
