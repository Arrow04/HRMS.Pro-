"""Company-wise leave templates: per-type quotas + accrual/carry/encash rules.

Mirrors the payroll-template pattern: grid + wizard CRUD on the Leave page
Configuration tab; pinned on the employee form (Employee.leave_template_id).
Quota precedence: pinned template -> scoped config -> single policy ->
type Days/Year (utils.leave_balance_utils).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.schemas import LeaveTemplateCreate, LeaveTemplateUpdate
from core.auth import get_current_user
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from database import get_db
from models import Company, Employee, LeaveTemplate, User

router = APIRouter(tags=["Leave Templates"])


def _serialize(t: LeaveTemplate, db: Session) -> dict:
    body = t.body or {}
    types = body.get("leaveTypes") or []
    emp_count = 0
    try:
        emp_count = db.query(Employee).filter(
            Employee.deleted_at.is_(None),
            Employee.leave_template_id == t.id,
        ).count()
    except Exception:
        pass
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "company_id": t.company_id,
        "status": t.status,
        "body": body,
        "type_count": len(types),
        "employee_count": emp_count,
        "version": t.version or 1,
        "effective_from": t.effective_from.isoformat() if t.effective_from else None,
        "accrual_method": getattr(t, "accrual_method", "monthly"),
        "accrual_day": getattr(t, "accrual_day", 1),
        "probation_accrual_rate": getattr(t, "probation_accrual_rate", 0.5),
        "max_balance_cap": getattr(t, "max_balance_cap", None),
        "lapse_unused": getattr(t, "lapse_unused", False),
        "carry_forward_enabled": getattr(t, "carry_forward_enabled", False),
        "carry_forward_max_days": getattr(t, "carry_forward_max_days", None),
        "carry_forward_expiry": getattr(t, "carry_forward_expiry", "year_end"),
        "carry_forward_use_it_or_lose_it": getattr(t, "carry_forward_use_it_or_lose_it", False),
        "encashment_enabled": getattr(t, "encashment_enabled", False),
        "encashment_min_balance": getattr(t, "encashment_min_balance", None),
        "encashment_rate": getattr(t, "encashment_rate", None),
        "encashment_taxable": getattr(t, "encashment_taxable", False),
        "holiday_optional_limit": getattr(t, "holiday_optional_limit", None),
        "holiday_auto_apply_national": getattr(t, "holiday_auto_apply_national", False),
        "enable_half_day": getattr(t, "enable_half_day", False),
        "min_leave_for_half_day": getattr(t, "min_leave_for_half_day", None),
        "advance_notice_days": getattr(t, "advance_notice_days", None),
        "max_consecutive_days": getattr(t, "max_consecutive_days", None),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _validate_body(body: dict) -> dict:
    """Sanitize the template body: keep known keys, coerce type rows."""
    body = body or {}
    out_types = []
    for row in body.get("leaveTypes") or []:
        try:
            days = int(row.get("days", 0))
        except (TypeError, ValueError):
            days = 0
        out_types.append({
            "leave_type_id": row.get("leave_type_id"),
            "code": (row.get("code") or "").strip(),
            "name": (row.get("name") or "").strip(),
            "days": max(0, days),
            "paid": bool(row.get("paid", True)),
            "encashable": bool(row.get("encashable", False)),
            "active": row.get("active", True) is not False,
        })
    return {
        "leaveTypes": out_types,
        "accrual": body.get("accrual") or {},
        "carryForward": body.get("carryForward") or {},
        "encashment": body.get("encashment") or {},
    }


def _parse_effective(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


@router.get("/api/leave-templates", response_model=List[dict])
def list_leave_templates(
    companyId: Optional[int] = None,
    includeInactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(LeaveTemplate).filter(
        LeaveTemplate.deleted_at.is_(None),
        LeaveTemplate.organization_id == current_user.organization_id,
    )
    if not includeInactive:
        q = q.filter(LeaveTemplate.status == "active")
    companyId = resolve_company_scope(db, current_user, companyId)
    if companyId is not None:
        q = q.filter(LeaveTemplate.company_id == companyId)
    return [_serialize(t, db) for t in q.order_by(LeaveTemplate.id.desc()).all()]


@router.get("/api/leave-templates/{template_id}", response_model=dict)
def get_leave_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(LeaveTemplate).filter(
        LeaveTemplate.id == template_id,
        LeaveTemplate.deleted_at.is_(None),
        LeaveTemplate.organization_id == current_user.organization_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Leave template not found")
    assert_company_allowed(db, current_user, t.company_id)
    return _serialize(t, db)


@router.post("/api/leave-templates", status_code=201)
def create_leave_template(
    data: LeaveTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = data.companyId
    if company_id is not None and current_user.role != "superadmin":
        comp = db.query(Company).filter(
            Company.id == company_id,
            Company.organization_id == current_user.organization_id,
        ).first()
        if not comp:
            raise HTTPException(status_code=400, detail="Company not found in organization")
    if company_id not in (None, "", 0):
        company_id = require_write_company(db, current_user, company_id)
    t = LeaveTemplate(
        organization_id=current_user.organization_id,
        company_id=company_id,
        name=data.name.strip(),
        description=(data.description or "").strip() or None,
        status=data.status or "active",
        body=_validate_body(data.body or {}),
        version=1,
        effective_from=_parse_effective(data.effectiveFrom),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"message": "Leave template created", "id": t.id}


@router.put("/api/leave-templates/{template_id}")
def update_leave_template(
    template_id: int,
    data: LeaveTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(LeaveTemplate).filter(
        LeaveTemplate.id == template_id,
        LeaveTemplate.deleted_at.is_(None),
        LeaveTemplate.organization_id == current_user.organization_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Leave template not found")
    assert_company_allowed(db, current_user, t.company_id)
    patch = data.model_dump(exclude_unset=True)
    if "companyId" in patch and patch["companyId"] is not None and current_user.role != "superadmin":
        comp = db.query(Company).filter(
            Company.id == patch["companyId"],
            Company.organization_id == current_user.organization_id,
        ).first()
        if not comp:
            raise HTTPException(status_code=400, detail="Company not found in organization")
        patch["companyId"] = require_write_company(db, current_user, patch["companyId"])
    # Versioned edit: bump version + stamp effective date so history stays
    # intact; past payroll inputs resolved older versions.
    bumped = False
    if "name" in patch and patch["name"] is not None:
        t.name = patch["name"].strip()
    if "description" in patch:
        t.description = (patch["description"] or "").strip() or None
    if "companyId" in patch:
        t.company_id = patch["companyId"]
    if "status" in patch and patch["status"] is not None:
        t.status = patch["status"]
    if "body" in patch and patch["body"] is not None:
        t.body = _validate_body(patch["body"])
        bumped = True
    if "effectiveFrom" in patch:
        eff = _parse_effective(patch["effectiveFrom"])
        if eff:
            t.effective_from = eff
            bumped = True
    if bumped:
        t.version = (t.version or 1) + 1
    db.commit()
    updated = 0
    if bumped and (t.body or {}).get("leaveTypes"):
        # Quotas changed: push them into current-year balances of pinned
        # employees (used days always preserved). This replaces manual
        # bulk-initialize — saves propagate automatically.
        updated = _propagate_template_quotas(db, t)
    return {"message": "Leave template updated", "id": t.id, "version": t.version,
            "balancesUpdated": updated}


def _propagate_template_quotas(db: Session, t) -> int:
    """Upsert current-year balances for employees pinned to this template."""
    from datetime import date as _date
    from models import Employee, LeaveBalance, LeaveType

    year = _date.today().year
    try:
        from utils.leave_balance_utils import match_leave_type
        rows = (t.body or {}).get("leaveTypes") or []
        emps = db.query(Employee).filter(
            Employee.deleted_at.is_(None),
            Employee.leave_template_id == t.id,
        ).all()
        if not emps or not rows:
            return 0
        updated = 0
        for row in rows:
            if row.get("active") is False or row.get("paid") is False:
                continue
            try:
                days = max(0, int(row.get("days", 0)))
            except (TypeError, ValueError):
                continue
            lt = None
            if row.get("leave_type_id"):
                lt = db.query(LeaveType).filter(LeaveType.id == row.get("leave_type_id")).first()
            if not lt:
                lt = match_leave_type(
                    db.query(LeaveType).filter(LeaveType.status == "active").all(),
                    row.get("code") or row.get("name"),
                )
            if not lt:
                continue
            for emp in emps:
                bal = db.query(LeaveBalance).filter(
                    LeaveBalance.employee_id == emp.id,
                    LeaveBalance.year == year,
                    LeaveBalance.leave_type_id == lt.id,
                    LeaveBalance.deleted_at.is_(None),
                ).first()
                if bal:
                    bal.total_days = days
                    bal.remaining_days = max(0, days - (bal.used_days or 0))
                else:
                    db.add(LeaveBalance(
                        employee_id=emp.id, year=year, leave_type_id=lt.id,
                        total_days=days, used_days=0, remaining_days=days,
                    ))
                updated += 1
        db.commit()
        return updated
    except Exception:
        db.rollback()
        return 0


@router.delete("/api/leave-templates/{template_id}")
def delete_leave_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(LeaveTemplate).filter(
        LeaveTemplate.id == template_id,
        LeaveTemplate.deleted_at.is_(None),
        LeaveTemplate.organization_id == current_user.organization_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Leave template not found")
    assert_company_allowed(db, current_user, t.company_id)
    pinned = db.query(Employee).filter(
        Employee.deleted_at.is_(None),
        Employee.leave_template_id == t.id,
    ).count()
    if pinned:
        raise HTTPException(
            status_code=400,
            detail=f"Template is pinned by {pinned} employee(s). Reassign them first.",
        )
    t.status = "inactive"
    t.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Leave template deleted"}
