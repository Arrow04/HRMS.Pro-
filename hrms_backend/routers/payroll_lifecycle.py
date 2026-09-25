"""Payroll lifecycle, approvals & what-if simulation API (mandate 44-47).

POST /api/payroll/{id}/status            lifecycle transition (validated)
GET  /api/payroll/{id}/approvals         approval steps
POST /api/payroll/{id}/approvals         initiate multi-level approval
POST /api/payroll/approvals/{id}/decide  approve / reject a step
POST /api/payroll/simulate               what-if (persists nothing)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from core.auth import get_current_user
from services.payroll_lifecycle import transition_payroll
from services.payroll_simulator import simulate_changes

router = APIRouter(tags=["Payroll Lifecycle"])

_WRITE_ROLES = ("superadmin", "admin", "hr_admin", "finance")
_READ_ROLES = _WRITE_ROLES + ("hr_manager", "hr_executive", "accountant")
_APPROVER_ROLES = _WRITE_ROLES + ("hr_manager",)


def _require(user: User, roles: tuple, action: str):
    if (user.role or "").lower() not in roles:
        raise HTTPException(status_code=403, detail=f"Not authorized to {action} payroll")


class StatusRequest(BaseModel):
    status: str = Field(..., pattern="^(draft|calculating|calculated|validation|pending_approval|approved|locked|processed|paid|rejected|cancelled|reopened|reversed)$")
    reason: Optional[str] = None


class ApprovalsInitiate(BaseModel):
    steps: Optional[List[Dict[str, Any]]] = None   # [{"name": "HR Manager", "role": "hr_manager"}]


class DecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approved|rejected)$")
    comment: Optional[str] = None


class SimulateRequest(BaseModel):
    employee_id: int
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)
    changes: Dict[str, Any] = Field(default_factory=dict)


def _load_payroll(db, payroll_id: int, user: User):
    from models import Payroll

    p = db.query(Payroll).filter(
        Payroll.id == payroll_id, Payroll.deleted_at.is_(None)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payroll not found")
    if (user.role or "").lower() != "superadmin" and p.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Payroll not found")
    return p


@router.post("/api/payroll/{payroll_id}/status")
def change_status(
    payroll_id: int,
    payload: StatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "transition")
    payroll = _load_payroll(db, payroll_id, current_user)
    try:
        result = transition_payroll(db, payroll, payload.status,
                                    user=current_user, reason=payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not result.get("ok"):
        raise HTTPException(status_code=422, detail={
            "message": result.get("detail"),
            "validation": result.get("validation"),
        })
    return result


@router.get("/api/payroll/{payroll_id}/approvals")
def list_approvals(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _READ_ROLES, "view")
    _load_payroll(db, payroll_id, current_user)
    from models import PayrollApproval

    rows = db.query(PayrollApproval).filter(
        PayrollApproval.payroll_id == payroll_id
    ).order_by(PayrollApproval.step_order).all()
    return [_approval_dict(a) for a in rows]


@router.post("/api/payroll/{payroll_id}/approvals", status_code=201)
def initiate_approvals(
    payroll_id: int,
    payload: ApprovalsInitiate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create the configured approval chain and move payroll to PENDING_APPROVAL."""
    _require(current_user, _WRITE_ROLES, "initiate approvals for")
    payroll = _load_payroll(db, payroll_id, current_user)
    from models import PayrollApproval

    steps = payload.steps
    if not steps:
        # Org-configurable chain (org.settings.payroll.approvalSteps); a
        # single admin approval is the documented default.
        org = getattr(payroll, "organization", None)
        cfg = ((getattr(org, "settings", None) or {}).get("payroll") or {})
        steps = cfg.get("approvalSteps") or [{"name": "Authorized Approver", "role": "admin"}]

    existing = db.query(PayrollApproval).filter(
        PayrollApproval.payroll_id == payroll_id,
        PayrollApproval.decision == "pending",
    ).count()
    if existing:
        raise HTTPException(status_code=409, detail="Approval chain already in progress")

    rows = []
    for idx, step in enumerate(steps, start=1):
        row = PayrollApproval(
            organization_id=payroll.organization_id,
            payroll_id=payroll.id,
            step_order=idx,
            step_name=str(step.get("name") or f"Step {idx}"),
            role=str(step.get("role") or "admin"),
            decision="pending",
        )
        db.add(row)
        rows.append(row)
    db.commit()

    try:
        result = transition_payroll(db, payroll, "pending_approval",
                                    user=current_user, reason="approval chain initiated")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not result.get("ok"):
        raise HTTPException(status_code=422, detail={
            "message": result.get("detail"),
            "validation": result.get("validation"),
        })
    for row in rows:
        db.refresh(row)
    return {"payrollStatus": payroll.status, "steps": [_approval_dict(r) for r in rows]}


@router.post("/api/payroll/approvals/{approval_id}/decide")
def decide(
    approval_id: int,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _APPROVER_ROLES, "decide")
    from models import PayrollApproval, Payroll

    row = db.query(PayrollApproval).filter(
        PayrollApproval.id == approval_id
    ).first()
    if not row or (current_user.role != "superadmin"
                   and row.organization_id != current_user.organization_id):
        raise HTTPException(status_code=404, detail="Approval step not found")
    if row.decision != "pending":
        raise HTTPException(status_code=400, detail="Step already decided")
    role = (current_user.role or "").lower()
    if role not in ("superadmin", "admin") and role != row.role.lower():
        raise HTTPException(status_code=403, detail=f"Step requires role '{row.role}'")

    from datetime import datetime
    row.decision = payload.decision
    row.comment = payload.comment
    row.approver_id = current_user.id
    row.decided_at = datetime.utcnow()
    db.commit()

    payroll = db.query(Payroll).filter(Payroll.id == row.payroll_id).first()
    status_now = payroll.status if payroll else None
    if payload.decision == "rejected":
        if payroll:
            try:
                transition_payroll(db, payroll, "rejected", user=current_user,
                                   reason=payload.comment or "approval rejected")
            except ValueError:
                pass
    else:
        remaining = db.query(PayrollApproval).filter(
            PayrollApproval.payroll_id == row.payroll_id,
            PayrollApproval.decision == "pending",
        ).count()
        if remaining == 0 and payroll:
            try:
                transition_payroll(db, payroll, "approved", user=current_user,
                                   reason="all approval steps approved")
            except ValueError:
                pass
    return {
        "step": _approval_dict(row),
        "payrollStatus": payroll.status if payroll else status_now,
    }


@router.post("/api/payroll/simulate")
def simulate(
    payload: SimulateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """What-if simulation (mandate section 44). Never touches real payroll."""
    _require(current_user, _READ_ROLES, "simulate")
    from models import Employee

    emp = db.query(Employee).filter(
        Employee.id == payload.employee_id, Employee.deleted_at.is_(None)
    ).first()
    if not emp or ((current_user.role or "").lower() != "superadmin"
                   and emp.organization_id != current_user.organization_id):
        raise HTTPException(status_code=404, detail="Employee not found")
    return simulate_changes(db, emp, payload.month, payload.year, payload.changes)


def _approval_dict(a) -> Dict[str, Any]:
    return {
        "id": a.id,
        "payrollId": a.payroll_id,
        "stepOrder": a.step_order,
        "stepName": a.step_name,
        "role": a.role,
        "approverId": a.approver_id,
        "decision": a.decision,
        "comment": a.comment,
        "decidedAt": a.decided_at.isoformat() if a.decided_at else None,
    }
