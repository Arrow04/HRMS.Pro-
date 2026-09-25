"""Arrears & retroactive adjustment API (mandate sections 33-34).

POST /api/payroll/arrears/simulate   dry-run retro impact (persists nothing)
POST   /api/payroll/arrears          create adjustment entries (originals preserved)
GET    /api/payroll/arrears          list adjustments
POST   /api/payroll/arrears/{id}/apply    book into an adjustment payroll
POST   /api/payroll/arrears/{id}/status   confirm / cancel
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from core.auth import get_current_user
from services.arrears_engine import (
    apply_adjustment,
    create_arrears_adjustments,
    simulate_retro,
)

router = APIRouter(tags=["Payroll Arrears"])

_WRITE_ROLES = ("superadmin", "admin", "hr_admin", "finance")
_READ_ROLES = _WRITE_ROLES + ("hr_manager", "hr_executive", "accountant")


def _require(user: User, roles: tuple, action: str):
    if (user.role or "").lower() not in roles:
        raise HTTPException(status_code=403, detail=f"Not authorized to {action} payroll adjustments")


class RetroRequest(BaseModel):
    effective_from: date
    effective_to: Optional[date] = None
    employee_id: Optional[int] = None
    company_id: Optional[int] = None
    source: str = Field("retro_rule", pattern="^(retro_rule|salary_revision|correction|manual)$")
    reason: Optional[str] = None
    rule_id: Optional[int] = None
    rule_version_old: Optional[int] = None
    rule_version_new: Optional[int] = None


class ApplyRequest(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)


class StatusRequest(BaseModel):
    status: str = Field(..., pattern="^(draft|confirmed|cancelled)$")


@router.post("/api/payroll/arrears/simulate")
def simulate(
    payload: RetroRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "simulate")
    org_id = current_user.organization_id
    return simulate_retro(
        db, org_id, payload.effective_from,
        effective_to=payload.effective_to,
        employee_id=payload.employee_id, company_id=payload.company_id,
    )


@router.post("/api/payroll/arrears", status_code=201)
def create(
    payload: RetroRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "create")
    org_id = current_user.organization_id
    return create_arrears_adjustments(
        db, org_id, payload.effective_from,
        effective_to=payload.effective_to,
        employee_id=payload.employee_id, company_id=payload.company_id,
        source=payload.source, reason=payload.reason,
        rule_id=payload.rule_id,
        rule_version_old=payload.rule_version_old,
        rule_version_new=payload.rule_version_new,
        created_by=current_user.id,
    )


@router.get("/api/payroll/arrears")
def list_adjustments(
    status: Optional[str] = None,
    source: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _READ_ROLES, "view")
    from models import PayrollAdjustment

    q = db.query(PayrollAdjustment).filter(
        PayrollAdjustment.organization_id == current_user.organization_id
    )
    if status:
        q = q.filter(PayrollAdjustment.status == status)
    if source:
        q = q.filter(PayrollAdjustment.source == source)
    rows = q.order_by(PayrollAdjustment.created_at.desc()).all()
    from services.arrears_engine import _adjustment_dict
    return [_adjustment_dict(a) for a in rows]


@router.post("/api/payroll/arrears/{adjustment_id}/apply")
def apply(
    adjustment_id: int,
    payload: ApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "apply")
    from models import PayrollAdjustment

    adj = db.query(PayrollAdjustment).filter(
        PayrollAdjustment.id == adjustment_id,
        PayrollAdjustment.organization_id == current_user.organization_id,
    ).first()
    if not adj:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    if adj.status == "cancelled":
        raise HTTPException(status_code=400, detail="Adjustment is cancelled")
    try:
        return apply_adjustment(db, adj, payload.month, payload.year,
                                applied_by=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/payroll/arrears/{adjustment_id}/status")
def set_status(
    adjustment_id: int,
    payload: StatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "update")
    from models import PayrollAdjustment

    adj = db.query(PayrollAdjustment).filter(
        PayrollAdjustment.id == adjustment_id,
        PayrollAdjustment.organization_id == current_user.organization_id,
    ).first()
    if not adj:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    if adj.status == "applied":
        raise HTTPException(status_code=400, detail="Applied adjustments cannot change status")
    adj.status = payload.status
    db.commit()
    from services.arrears_engine import _adjustment_dict
    return _adjustment_dict(adj)
