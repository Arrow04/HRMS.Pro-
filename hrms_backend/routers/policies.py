"""HRMS API company policies routes — full CRUD for admins, read-only for employees."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.cache import invalidate_cache
from core.tenant import get_header_company_id
from database import get_db
from models import CompanyPolicy, User

router = APIRouter(tags=["Company Policies"])


class PolicyCreate(BaseModel):
    key: str
    title: str
    icon: Optional[str] = "document-text-outline"
    color: Optional[str] = "#3B82F6"
    description: Optional[str] = ""
    bullets: Optional[List[str]] = []
    sort_order: Optional[int] = 0


class PolicyUpdate(BaseModel):
    key: Optional[str] = None
    title: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    bullets: Optional[List[str]] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None


def _to_dict(p: CompanyPolicy) -> dict:
    return {
        "id": p.id,
        "key": p.key,
        "title": p.title,
        "icon": p.icon,
        "color": p.color,
        "description": p.description,
        "bullets": p.bullets or [],
        "sortOrder": p.sort_order,
        "status": p.status,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/api/policies")
def list_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    request: Request = None,
):
    q = db.query(CompanyPolicy).filter(CompanyPolicy.deleted_at.is_(None))
    if current_user.role != "superadmin":
        q = q.filter(
            (CompanyPolicy.organization_id == current_user.organization_id)
            | (CompanyPolicy.organization_id.is_(None))
        )
    if current_user.role in ("employee",):
        q = q.filter(CompanyPolicy.status == "active")
    policies = q.order_by(CompanyPolicy.sort_order, CompanyPolicy.id).all()

    if not policies and current_user.role in ("admin", "superadmin", "hr_admin", "hr_manager"):
        defaults = [
            {"key": "attendance", "title": "Attendance Policy", "icon": "finger-print-outline", "color": "#3B82F6", "description": "All employees are expected to clock in and out daily using the HRMS mobile app or web portal.", "bullets": ["Check-in time: 09:00 AM. Check-out time: 06:00 PM.", "A grace period of 15 minutes is allowed after check-in time.", "Late arrivals beyond the grace period will be marked as Late.", "Overtime must be pre-approved by your reporting manager."], "sort_order": 0},
            {"key": "leave", "title": "Leave Policy", "icon": "calendar-outline", "color": "#4F46E5", "description": "Employees are entitled to paid time off as per company policy.", "bullets": ["Casual Leave: 12 days per year.", "Sick Leave: 6 days per year.", "Earned/Privilege Leave: 15 days per year.", "Leave must be applied at least 1 day in advance."], "sort_order": 1},
            {"key": "payroll", "title": "Payroll & Compensation", "icon": "wallet-outline", "color": "#059669", "description": "Salaries are processed monthly and credited by the 7th of each month.", "bullets": ["Salary cycle: Monthly (1st to last day).", "Deductions include PF, ESI, Professional Tax, and TDS.", "Payslips are available in the Payslips section.", "Final settlement within 30 days of separation."], "sort_order": 2},
            {"key": "conduct", "title": "Code of Conduct", "icon": "shield-checkmark-outline", "color": "#DC2626", "description": "All employees are expected to maintain professional conduct.", "bullets": ["Respect and dignity in all interactions.", "Discrimination and harassment strictly prohibited.", "Confidential information must not be shared externally.", "Violations may lead to disciplinary action."], "sort_order": 3},
            {"key": "assets", "title": "Asset Policy", "icon": "laptop-outline", "color": "#0D9488", "description": "Company assets assigned to employees must be used responsibly.", "bullets": ["Assets issued based on role requirements.", "Damage or loss must be reported immediately.", "Assets must be returned within 7 days of last working day.", "Unreturned assets deducted from final settlement."], "sort_order": 4},
        ]
        for d in defaults:
            db.add(CompanyPolicy(organization_id=current_user.organization_id, **d))
        db.commit()
        policies = db.query(CompanyPolicy).filter(CompanyPolicy.deleted_at.is_(None)).order_by(CompanyPolicy.sort_order, CompanyPolicy.id).all()

    return {"data": [_to_dict(p) for p in policies]}


@router.post("/api/policies", status_code=201)
def create_policy(
    data: PolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "superadmin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Not authorized")
    policy = CompanyPolicy(
        organization_id=current_user.organization_id,
        **data.model_dump(),
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    invalidate_cache("hrms:tenant:*")
    return {"message": "Policy created", "id": policy.id, "data": _to_dict(policy)}


@router.put("/api/policies/{policy_id}")
def update_policy(
    policy_id: int,
    data: PolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "superadmin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Not authorized")
    policy = db.query(CompanyPolicy).filter(
        CompanyPolicy.id == policy_id,
        CompanyPolicy.deleted_at.is_(None),
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(policy, k, v)
    policy.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(policy)
    invalidate_cache("hrms:tenant:*")
    return {"message": "Policy updated", "data": _to_dict(policy)}


@router.delete("/api/policies/{policy_id}")
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "superadmin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Not authorized")
    policy = db.query(CompanyPolicy).filter(
        CompanyPolicy.id == policy_id,
        CompanyPolicy.deleted_at.is_(None),
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    policy.deleted_at = datetime.utcnow()
    db.commit()
    invalidate_cache("hrms:tenant:*")
    return {"message": "Policy deleted"}
