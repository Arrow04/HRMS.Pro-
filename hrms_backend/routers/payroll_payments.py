"""Bank payments, reconciliation & year-end API (mandate sections 49, 52, 53).

POST /api/payroll/payments/batches                    create batch for a period
GET  /api/payroll/payments/batches                    list batches
GET  /api/payroll/payments/batches/{id}/file          bank payment file
POST /api/payroll/payments/batches/{id}/mark          record bank outcomes
POST /api/payroll/payments/batches/{id}/reconcile     books vs bank
GET  /api/payroll/payments/reconcile-accounting       payroll vs journals
GET  /api/payroll/year-end                            YTD / tax summary
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from core.auth import get_current_user
from services.payment_engine import (
    _batch_dict,
    create_payment_batch,
    generate_payment_file,
    mark_transactions,
    reconcile_batch,
    reconcile_payroll_accounting,
    year_end_summary,
)

router = APIRouter(tags=["Payroll Payments"])

_WRITE_ROLES = ("superadmin", "admin", "hr_admin", "finance", "accountant")
_READ_ROLES = _WRITE_ROLES + ("hr_manager", "hr_executive")


def _require(user: User, roles: tuple, action: str):
    if (user.role or "").lower() not in roles:
        raise HTTPException(status_code=403, detail=f"Not authorized to {action} payroll payments")


class BatchCreate(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)
    company_id: Optional[int] = None


class MarkRequest(BaseModel):
    updates: List[Dict[str, Any]]


class ReconcileRequest(BaseModel):
    actuals: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/api/payroll/payments/batches", status_code=201)
def create_batch(
    payload: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "create")
    try:
        return create_payment_batch(
            db, current_user.organization_id, payload.month, payload.year,
            company_id=payload.company_id, created_by=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/payroll/payments/batches")
def list_batches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _READ_ROLES, "view")
    from models import PaymentBatch

    rows = db.query(PaymentBatch).filter(
        PaymentBatch.organization_id == current_user.organization_id
    ).order_by(PaymentBatch.created_at.desc()).all()
    return [_batch_dict(b) for b in rows]


def _load_batch(db, batch_id: int, user: User):
    from models import PaymentBatch

    b = db.query(PaymentBatch).filter(PaymentBatch.id == batch_id).first()
    if not b or ((user.role or "").lower() != "superadmin"
                 and b.organization_id != user.organization_id):
        raise HTTPException(status_code=404, detail="Batch not found")
    return b


@router.get("/api/payroll/payments/batches/{batch_id}/file")
def batch_file(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _READ_ROLES, "download")
    batch = _load_batch(db, batch_id, current_user)
    name, content = generate_payment_file(db, batch)
    return PlainTextResponse(content, headers={
        "Content-Disposition": f'attachment; filename="{name}"',
        "X-File-Name": name,
    })


@router.post("/api/payroll/payments/batches/{batch_id}/mark")
def mark(
    batch_id: int,
    payload: MarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "update")
    batch = _load_batch(db, batch_id, current_user)
    try:
        return mark_transactions(db, batch, payload.updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/payroll/payments/batches/{batch_id}/reconcile")
def reconcile(
    batch_id: int,
    payload: ReconcileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _WRITE_ROLES, "reconcile")
    batch = _load_batch(db, batch_id, current_user)
    return reconcile_batch(db, batch, payload.actuals)


@router.get("/api/payroll/payments/reconcile-accounting")
def reconcile_accounting(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _READ_ROLES, "reconcile")
    return reconcile_payroll_accounting(db, current_user.organization_id, month, year)


@router.get("/api/payroll/year-end")
def year_end(
    financialYear: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, _READ_ROLES, "view")
    try:
        return year_end_summary(db, current_user.organization_id, financialYear)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
