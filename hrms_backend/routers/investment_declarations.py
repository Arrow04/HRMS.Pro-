"""Investment Declaration CRUD for cumulative TDS.

Per-employee annual declaration of investments/income (80C/80D/HRA/LTA/NPS/
home-loan), other income and previous-employer income/TDS. Drives the
cumulative TDS engine in payroll_service._compute_cumulative_tds.

Workflow: draft -> submitted -> approved/rejected (maker-checker lite).
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.auth import get_current_user
from database import get_db
from models import Employee, InvestmentDeclaration, TaxRegime, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/investment-declarations", tags=["Investment Declarations"])


# ── Schemas ──

def _to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class DeclarationPayload(BaseModel):
    model_config = {"alias_generator": _to_camel, "populate_by_name": True}

    financial_year: str = "2025-26"
    tax_regime_id: Optional[int] = None
    deduction_80c: float = 0
    deduction_80d: float = 0
    hra_exemption: float = 0
    lta_exemption: float = 0
    nps_deduction: float = 0
    home_loan_interest: float = 0
    other_income: float = 0
    previous_employer_income: float = 0
    previous_employer_tds: float = 0
    opt_out_standard_deduction: bool = False
    notes: Optional[str] = None


class DeclarationStatus(BaseModel):
    status: str  # submitted / approved / rejected
    notes: Optional[str] = None


def _serialize(decl: InvestmentDeclaration, regime_name: Optional[str] = None) -> dict:
    return {
        "id": decl.id,
        "employee_id": decl.employee_id,
        "financial_year": decl.financial_year,
        "tax_regime_id": decl.tax_regime_id,
        "tax_regime_name": regime_name,
        "deduction_80c": decl.deduction_80c or 0,
        "deduction_80d": decl.deduction_80d or 0,
        "hra_exemption": decl.hra_exemption or 0,
        "lta_exemption": decl.lta_exemption or 0,
        "nps_deduction": decl.nps_deduction or 0,
        "home_loan_interest": decl.home_loan_interest or 0,
        "other_income": decl.other_income or 0,
        "previous_employer_income": decl.previous_employer_income or 0,
        "previous_employer_tds": decl.previous_employer_tds or 0,
        "opt_out_standard_deduction": bool(decl.opt_out_standard_deduction),
        "status": decl.status,
        "declaration_date": decl.declaration_date.isoformat() if decl.declaration_date else None,
        "submitted_at": decl.submitted_at.isoformat() if decl.submitted_at else None,
        "approved_by": decl.approved_by,
        "approved_at": decl.approved_at.isoformat() if decl.approved_at else None,
        "notes": decl.notes,
        "created_at": decl.created_at.isoformat() if decl.created_at else None,
        "updated_at": decl.updated_at.isoformat() if decl.updated_at else None,
    }


def _regime_name(db: Session, regime_id: Optional[int]) -> Optional[str]:
    if not regime_id:
        return None
    r = db.query(TaxRegime).filter(TaxRegime.id == regime_id).first()
    return r.name if r else None


def _employee_id_for_user(db: Session, user: User) -> Optional[int]:
    """Resolve the employee row linked to the current user (employees.user_id)."""
    if getattr(user, "employee_id", None):
        return user.employee_id
    if not user.id:
        return None
    emp = db.query(Employee).filter(Employee.user_id == user.id, Employee.deleted_at.is_(None)).first()
    return emp.id if emp else None


def _get_decl(db: Session, decl_id: int, user: Optional[User] = None) -> InvestmentDeclaration:
    decl = db.query(InvestmentDeclaration).filter(
        InvestmentDeclaration.id == decl_id,
        InvestmentDeclaration.deleted_at.is_(None),
    ).first()
    if not decl:
        raise HTTPException(status_code=404, detail="Investment declaration not found")
    if user and user.role != "superadmin":
        emp = decl.employee
        if not emp or int(emp.organization_id or 0) != int(user.organization_id or 0):
            raise HTTPException(status_code=404, detail="Investment declaration not found")
    return decl


# ── CRUD ──

@router.get("")
def list_declarations(
    employee_id: Optional[int] = Query(None),
    financial_year: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    q = db.query(InvestmentDeclaration).join(Employee, Employee.id == InvestmentDeclaration.employee_id).filter(InvestmentDeclaration.deleted_at.is_(None))
    if user and user.role != "superadmin":
        q = q.filter(Employee.organization_id == user.organization_id)
    if employee_id:
        q = q.filter(InvestmentDeclaration.employee_id == employee_id)
    if financial_year:
        q = q.filter(InvestmentDeclaration.financial_year == financial_year)
    rows = q.order_by(InvestmentDeclaration.financial_year.desc(), InvestmentDeclaration.updated_at.desc()).all()
    return {"status": "success", "items": [_serialize(d, _regime_name(db, d.tax_regime_id)) for d in rows]}


@router.get("/{decl_id}")
def get_declaration(
    decl_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    decl = _get_decl(db, decl_id, user)
    return {"status": "success", "item": _serialize(decl, _regime_name(db, decl.tax_regime_id))}


@router.post("")
def create_declaration(
    payload: DeclarationPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    employee_id = _employee_id_for_user(db, user)
    if not employee_id:
        raise HTTPException(status_code=400, detail="Current user has no linked employee record")
    existing = db.query(InvestmentDeclaration).filter(
        InvestmentDeclaration.employee_id == employee_id,
        InvestmentDeclaration.financial_year == payload.financial_year,
        InvestmentDeclaration.deleted_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Declaration already exists for this financial year")
    if payload.tax_regime_id and user.role != "superadmin":
        regime = db.query(TaxRegime).filter(TaxRegime.id == payload.tax_regime_id).first()
        if not regime or int(regime.organization_id or 0) != int(user.organization_id or 0):
            raise HTTPException(status_code=404, detail="Tax regime not found")
    decl = InvestmentDeclaration(
        employee_id=employee_id,
        **payload.dict(exclude_none=True),
        status="draft",
    )
    db.add(decl)
    db.commit()
    db.refresh(decl)
    return {"status": "success", "item": _serialize(decl, _regime_name(db, decl.tax_regime_id))}


@router.put("/{decl_id}")
def update_declaration(
    decl_id: int,
    payload: DeclarationPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    decl = _get_decl(db, decl_id, user)
    if _employee_id_for_user(db, user) and _employee_id_for_user(db, user) != decl.employee_id:
        raise HTTPException(status_code=403, detail="Not allowed to edit this declaration")
    if decl.status == "approved":
        raise HTTPException(status_code=409, detail="Approved declarations cannot be edited")
    for k, v in payload.dict(exclude_none=True).items():
        setattr(decl, k, v)
    if decl.status == "rejected":
        decl.status = "draft"
    db.commit()
    db.refresh(decl)
    return {"status": "success", "item": _serialize(decl, _regime_name(db, decl.tax_regime_id))}


@router.post("/{decl_id}/submit")
def submit_declaration(
    decl_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    decl = _get_decl(db, decl_id, user)
    if _employee_id_for_user(db, user) and _employee_id_for_user(db, user) != decl.employee_id:
        raise HTTPException(status_code=403, detail="Not allowed to submit this declaration")
    decl.status = "submitted"
    decl.submitted_at = datetime.utcnow()
    decl.declaration_date = decl.declaration_date or date.today()
    db.commit()
    db.refresh(decl)
    return {"status": "success", "item": _serialize(decl, _regime_name(db, decl.tax_regime_id))}


@router.post("/{decl_id}/approve")
def approve_declaration(
    decl_id: int,
    payload: DeclarationStatus,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    decl = _get_decl(db, decl_id, user)
    decl.status = "approved"
    decl.approved_by = user.id
    decl.approved_at = datetime.utcnow()
    decl.notes = payload.notes or decl.notes
    db.commit()
    db.refresh(decl)
    return {"status": "success", "item": _serialize(decl, _regime_name(db, decl.tax_regime_id))}


@router.post("/{decl_id}/reject")
def reject_declaration(
    decl_id: int,
    payload: DeclarationStatus,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    decl = _get_decl(db, decl_id, user)
    decl.status = "rejected"
    decl.notes = payload.notes or decl.notes
    db.commit()
    db.refresh(decl)
    return {"status": "success", "item": _serialize(decl, _regime_name(db, decl.tax_regime_id))}


@router.delete("/{decl_id}")
def delete_declaration(
    decl_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    decl = _get_decl(db, decl_id, user)
    if _employee_id_for_user(db, user) and _employee_id_for_user(db, user) != decl.employee_id:
        raise HTTPException(status_code=403, detail="Not allowed to delete this declaration")
    if decl.status == "approved":
        raise HTTPException(status_code=409, detail="Approved declarations cannot be deleted")
    decl.deleted_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Declaration deleted"}