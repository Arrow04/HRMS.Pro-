"""HRMS API helpdesk routes (IT / HR / facility tickets)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.shared import _get_employee_id_for_user
from database import get_db, get_read_db
from models import Employee, SupportTicket, User

router = APIRouter(tags=["Helpdesk"])

ADMIN_ROLES = ("superadmin", "hr_admin", "admin")

TICKET_CATEGORIES = ("it", "hr", "facility", "admin", "general")
TICKET_PRIORITIES = ("low", "medium", "high", "urgent")
TICKET_STATUSES = ("open", "in_progress", "on_hold", "resolved", "closed")


def _serialize(ticket: SupportTicket, db: Session) -> dict:
    employee_name = None
    if ticket.employee_id:
        emp = db.query(Employee).filter(Employee.id == ticket.employee_id).first()
        if emp:
            employee_name = (emp.full_name or f"{emp.first_name or ''} {emp.last_name or ''}").strip() or None
    return {
        "id": ticket.id,
        "ticket_no": ticket.ticket_no,
        "subject": ticket.subject,
        "description": ticket.description,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "employeeId": ticket.employee_id,
        "employeeName": employee_name,
        "assignedTo": ticket.assigned_to,
        "resolutionNotes": ticket.resolution_notes,
        "resolvedAt": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "createdAt": ticket.created_at.isoformat() if ticket.created_at else None,
        "updatedAt": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }


def _ticket_number(ticket_id: int) -> str:
    return f"HD-{datetime.utcnow().year}-{ticket_id:05d}"


@router.get("/api/helpdesk/tickets", tags=["Helpdesk"])
def list_tickets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(SupportTicket).filter(SupportTicket.deleted_at.is_(None))
    if current_user.role not in ADMIN_ROLES:
        employee_id = _get_employee_id_for_user(db, current_user)
        if not employee_id:
            raise HTTPException(status_code=400, detail="Employee profile not found")
        query = query.filter(SupportTicket.employee_id == employee_id)
    if status:
        query = query.filter(SupportTicket.status == status)
    if category:
        query = query.filter(SupportTicket.category == category)
    tickets = query.order_by(SupportTicket.created_at.desc()).limit(500).all()
    return [_serialize(t, db) for t in tickets]


@router.post("/api/helpdesk/tickets", tags=["Helpdesk"])
def create_ticket(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subject = (data.get("subject") or "").strip()
    if not subject:
        raise HTTPException(status_code=400, detail="Subject is required")
    category = (data.get("category") or "general").strip().lower()
    priority = (data.get("priority") or "medium").strip().lower()
    if category not in TICKET_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if priority not in TICKET_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    employee_id = _get_employee_id_for_user(db, current_user)
    employee = db.query(Employee).filter(Employee.id == employee_id).first() if employee_id else None
    ticket = SupportTicket(
        subject=subject,
        description=(data.get("description") or "").strip(),
        category=category,
        priority=priority,
        status="open",
        employee_id=employee_id,
        organization_id=getattr(employee, "organization_id", None) or current_user.organization_id,
        company_id=getattr(employee, "company_id", None),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    ticket.ticket_no = _ticket_number(ticket.id)
    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket raised", "id": ticket.id, "ticket_no": ticket.ticket_no}


@router.put("/api/helpdesk/tickets/{ticket_id}", tags=["Helpdesk"])
def update_ticket(
    ticket_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = db.query(SupportTicket).filter(
        SupportTicket.id == ticket_id, SupportTicket.deleted_at.is_(None)
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    is_admin = current_user.role in ADMIN_ROLES
    employee_id = _get_employee_id_for_user(db, current_user)
    is_owner = employee_id and ticket.employee_id == employee_id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="Not authorized")
    if "subject" in data and data["subject"] is not None:
        ticket.subject = str(data["subject"]).strip() or ticket.subject
    if "description" in data and data["description"] is not None:
        ticket.description = str(data["description"])
    if "category" in data and data["category"]:
        category = str(data["category"]).strip().lower()
        if category not in TICKET_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        ticket.category = category
    if "priority" in data and data["priority"]:
        priority = str(data["priority"]).strip().lower()
        if priority not in TICKET_PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        ticket.priority = priority
    if "status" in data and data["status"]:
        status = str(data["status"]).strip().lower()
        if status not in TICKET_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        if status in ("resolved", "closed") and not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can resolve tickets")
        ticket.status = status
        if status in ("resolved", "closed") and not ticket.resolved_at:
            ticket.resolved_at = datetime.utcnow()
        if status not in ("resolved", "closed"):
            ticket.resolved_at = None
    if "assigned_to" in data and is_admin:
        ticket.assigned_to = data["assigned_to"]
    if "resolution_notes" in data and is_admin:
        ticket.resolution_notes = data["resolution_notes"]
    db.commit()
    return {"message": "Ticket updated", "id": ticket_id}


@router.delete("/api/helpdesk/tickets/{ticket_id}", tags=["Helpdesk"])
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Not authorized")
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Ticket deleted", "id": ticket_id}
