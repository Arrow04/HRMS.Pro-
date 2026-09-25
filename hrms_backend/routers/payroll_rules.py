"""Payroll Rule Platform API.

Versioned, effective-dated statutory rules and government notifications.

The mandate: *the law changes; the rule changes; the payroll engine does not.*
Everything legal lives in these rows; publishing never overwrites history.

Endpoints (tenant-scoped; rule writes are compliance actions):
  GET    /api/payroll/rules                    list/filter rules
  POST   /api/payroll/rules                    create a rule version (draft/active)
  POST   /api/payroll/rules/{id}/publish       draft -> active (conflict-checked)
  GET    /api/payroll/rules/trace              explain which rule wins and why
  POST   /api/payroll/rules/simulate           old-vs-new impact analysis
  GET    /api/payroll/notifications            list government notifications
  POST   /api/payroll/notifications            record a notification
  POST   /api/payroll/notifications/{id}/status  workflow status change
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User
from core.auth import get_current_user
from services.rule_platform import (
    RuleExpressionError,
    MissingInputError,
    evaluate_definition,
    find_rule_conflicts,
    resolve_with_trace,
    validate_definition,
)

router = APIRouter(tags=["Payroll Rules"])

_RULE_WRITE_ROLES = ("superadmin", "admin", "hr_admin", "finance")
_RULE_READ_ROLES = _RULE_WRITE_ROLES + ("hr_manager", "hr_executive", "accountant")


def _require_roles(user: User, roles: tuple, action: str):
    if (user.role or "").lower() not in roles:
        raise HTTPException(status_code=403, detail=f"Not authorized to {action} payroll rules")


# ────────────────────────────────────────────────────────────────────────────
# Schemas
# ────────────────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    rule_type: str = Field(..., min_length=2, max_length=50)
    rule_subtype: Optional[str] = None
    country: str = "India"
    state_code: Optional[str] = None
    organization_id: Optional[int] = None
    company_id: Optional[int] = None
    effective_from: date
    effective_to: Optional[date] = None
    definition: Dict[str, Any]
    status: str = Field("active", pattern="^(draft|active)$")
    notes: Optional[str] = None
    notification_number: Optional[str] = None
    notification_date: Optional[date] = None
    gazette_url: Optional[str] = None
    government_notification_id: Optional[int] = None
    supersede_existing: bool = True


class RuleSimulate(BaseModel):
    rule_type: str
    proposed_definition: Dict[str, Any]
    as_of: date
    country: str = "India"
    state_code: Optional[str] = None
    organization_id: Optional[int] = None
    company_id: Optional[int] = None
    context: Dict[str, Any] = Field(default_factory=dict)


class NotificationCreate(BaseModel):
    authority: str = Field(..., min_length=2, max_length=200)
    title: str = Field(..., min_length=2, max_length=500)
    effective_date: date
    notification_number: Optional[str] = None
    summary: Optional[str] = None
    publication_date: Optional[date] = None
    source_url: Optional[str] = None
    affected_rules: List[str] = Field(default_factory=list)
    organization_id: Optional[int] = None
    notes: Optional[str] = None


class NotificationStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|review|approved|published)$")
    notes: Optional[str] = None


# ────────────────────────────────────────────────────────────────────────────
# Rules
# ────────────────────────────────────────────────────────────────────────────

@router.get("/api/payroll/rules")
def list_rules(
    ruleType: Optional[str] = None,
    stateCode: Optional[str] = None,
    country: str = Query("India"),
    organizationId: Optional[int] = None,
    asOf: Optional[date] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_roles(current_user, _RULE_READ_ROLES, "view")
    from models import StatutoryRule

    q = db.query(StatutoryRule).filter(StatutoryRule.deleted_at.is_(None))
    if (current_user.role or "").lower() != "superadmin":
        # Org scoping: central rules + own org's rules
        q = q.filter(
            (StatutoryRule.organization_id.is_(None))
            | (StatutoryRule.organization_id == current_user.organization_id)
        )
    elif organizationId is not None:
        q = q.filter(
            (StatutoryRule.organization_id == organizationId)
            | (StatutoryRule.organization_id.is_(None))
        )
    if ruleType:
        q = q.filter(StatutoryRule.rule_type == ruleType)
    if country:
        q = q.filter(StatutoryRule.country == country)
    if stateCode:
        q = q.filter(StatutoryRule.state_code == stateCode)
    if status:
        q = q.filter(StatutoryRule.status == status)
    if asOf:
        q = q.filter(
            StatutoryRule.effective_from <= asOf,
            (StatutoryRule.effective_to.is_(None)) | (StatutoryRule.effective_to >= asOf),
        )
    rows = q.order_by(StatutoryRule.rule_type, StatutoryRule.effective_from.desc()).all()
    return [_rule_dict(r) for r in rows]


@router.post("/api/payroll/rules", status_code=201)
def create_rule(
    payload: RuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_roles(current_user, _RULE_WRITE_ROLES, "create")
    from models import StatutoryRule

    if payload.effective_to and payload.effective_to < payload.effective_from:
        raise HTTPException(status_code=400, detail="effective_to cannot be before effective_from")
    try:
        validate_definition(payload.definition)
    except RuleExpressionError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid rule definition: {exc}")

    # Tenant isolation: a non-superadmin can only create org-scoped rules.
    if (current_user.role or "").lower() != "superadmin":
        if payload.organization_id not in (None, current_user.organization_id):
            raise HTTPException(status_code=403, detail="Cannot create rules for another organization")
        payload.organization_id = current_user.organization_id

    if payload.status == "active":
        conflicts = find_rule_conflicts(
            db, payload.rule_type, payload.country, payload.effective_from, payload.effective_to,
            state_code=payload.state_code, organization_id=payload.organization_id,
            company_id=payload.company_id, rule_subtype=payload.rule_subtype,
        )
        if conflicts and not payload.supersede_existing:
            raise HTTPException(
                status_code=409,
                detail={"message": "Overlapping active rule in the same scope", "conflicts": conflicts},
            )
        if conflicts and payload.supersede_existing:
            # End-date the previous active rule the day before this one starts.
            # History is preserved: rows are never overwritten or deleted.
            prev_end = payload.effective_from - timedelta(days=1)
            for c in conflicts:
                row = db.query(StatutoryRule).filter(StatutoryRule.id == c["id"]).first()
                if row and row.status == "active":
                    row.effective_to = prev_end
                    row.status = "superseded"

    latest = (
        db.query(StatutoryRule)
        .filter(
            StatutoryRule.rule_type == payload.rule_type,
            StatutoryRule.country == payload.country,
            StatutoryRule.state_code == payload.state_code,
            StatutoryRule.organization_id == payload.organization_id,
            StatutoryRule.company_id == payload.company_id,
            StatutoryRule.rule_subtype == payload.rule_subtype,
        )
        .order_by(StatutoryRule.version.desc())
        .first()
    )
    version = (getattr(latest, "version", 0) or 0) + 1

    rule = StatutoryRule(
        rule_type=payload.rule_type,
        rule_subtype=payload.rule_subtype,
        country=payload.country,
        state_code=payload.state_code,
        organization_id=payload.organization_id,
        company_id=payload.company_id,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        definition=payload.definition,
        status=payload.status,
        notes=payload.notes,
        notification_number=payload.notification_number,
        notification_date=payload.notification_date,
        gazette_url=payload.gazette_url,
        government_notification_id=payload.government_notification_id,
        version=version,
        created_by=current_user.id,
        approved_by=current_user.id if payload.status == "active" else None,
        approved_at=datetime.utcnow() if payload.status == "active" else None,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_dict(rule)


@router.post("/api/payroll/rules/{rule_id}/publish")
def publish_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_roles(current_user, _RULE_WRITE_ROLES, "publish")
    from models import StatutoryRule

    rule = db.query(StatutoryRule).filter(
        StatutoryRule.id == rule_id, StatutoryRule.deleted_at.is_(None)
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.status == "active":
        raise HTTPException(status_code=400, detail="Rule is already published")
    if rule.status not in ("draft", "superseded"):
        raise HTTPException(status_code=400, detail=f"Cannot publish a rule in status '{rule.status}'")

    conflicts = find_rule_conflicts(
        db, rule.rule_type, rule.country, rule.effective_from, rule.effective_to,
        state_code=rule.state_code, organization_id=rule.organization_id,
        company_id=rule.company_id, rule_subtype=rule.rule_subtype, exclude_id=rule.id,
    )
    conflicts = [c for c in conflicts if c["status"] == "active"]
    if conflicts:
        prev_end = rule.effective_from - timedelta(days=1)
        for c in conflicts:
            row = db.query(StatutoryRule).filter(StatutoryRule.id == c["id"]).first()
            if row:
                row.effective_to = prev_end
                row.status = "superseded"

    rule.status = "active"
    rule.approved_by = current_user.id
    rule.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return _rule_dict(rule)


@router.get("/api/payroll/rules/trace")
def rule_trace(
    ruleType: str,
    asOf: date,
    country: str = Query("India"),
    stateCode: Optional[str] = None,
    organizationId: Optional[int] = None,
    companyId: Optional[int] = None,
    ruleSubtype: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Explain which rule version wins for a given date/scope, and why."""
    _require_roles(current_user, _RULE_READ_ROLES, "view")
    if (current_user.role or "").lower() != "superadmin":
        organizationId = current_user.organization_id
    return resolve_with_trace(
        db, ruleType, asOf, country=country, state_code=stateCode,
        organization_id=organizationId, company_id=companyId, rule_subtype=ruleSubtype,
    )


@router.post("/api/payroll/rules/simulate")
def simulate_rule(
    payload: RuleSimulate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Impact analysis: current rule vs proposed definition on a sample context.

    Simulation never persists anything (mandate section 42).
    """
    _require_roles(current_user, _RULE_WRITE_ROLES, "simulate")
    try:
        validate_definition(payload.proposed_definition)
    except RuleExpressionError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid proposed definition: {exc}")

    org_id = payload.organization_id
    if (current_user.role or "").lower() != "superadmin":
        org_id = current_user.organization_id

    resolved = resolve_with_trace(
        db, payload.rule_type, payload.as_of, country=payload.country,
        state_code=payload.state_code, organization_id=org_id,
        company_id=payload.company_id,
    )
    current_def = (resolved.get("chosen") or {}).get("definition")

    def _safe(definition):
        try:
            return {"ok": True, "value": evaluate_definition(definition, payload.context)}
        except MissingInputError as exc:
            return {"ok": False, "error": f"missing_input: {exc.name}"}
        except RuleExpressionError as exc:
            return {"ok": False, "error": str(exc)}

    before = _safe(current_def)
    after = _safe(payload.proposed_definition)
    impact = None
    if before.get("ok") and after.get("ok"):
        b, a = before["value"], after["value"]
        if isinstance(b, (int, float)) and isinstance(a, (int, float)):
            impact = {"delta": round(float(a) - float(b), 2), "pct_change": (
                round((float(a) - float(b)) / float(b) * 100, 2) if b else None
            )}
    return {
        "rule_type": payload.rule_type,
        "as_of": str(payload.as_of),
        "current": {"definition": current_def, "result": before},
        "proposed": {"definition": payload.proposed_definition, "result": after},
        "impact": impact,
        "trace": resolved.get("trace", []),
    }


def _rule_dict(r) -> Dict[str, Any]:
    return {
        "id": r.id,
        "ruleType": r.rule_type,
        "ruleSubtype": r.rule_subtype,
        "country": r.country,
        "stateCode": r.state_code,
        "organizationId": r.organization_id,
        "companyId": r.company_id,
        "effectiveFrom": str(r.effective_from),
        "effectiveTo": str(r.effective_to) if r.effective_to else None,
        "definition": r.definition,
        "status": r.status,
        "version": getattr(r, "version", 1),
        "notes": r.notes,
        "notificationNumber": r.notification_number,
        "notificationDate": str(r.notification_date) if getattr(r, "notification_date", None) else None,
        "gazetteUrl": r.gazette_url,
        "governmentNotificationId": getattr(r, "government_notification_id", None),
        "createdBy": getattr(r, "created_by", None),
        "approvedBy": getattr(r, "approved_by", None),
        "approvedAt": r.approved_at.isoformat() if getattr(r, "approved_at", None) else None,
    }


# ────────────────────────────────────────────────────────────────────────────
# Government notifications
# ────────────────────────────────────────────────────────────────────────────

@router.get("/api/payroll/notifications")
def list_notifications(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_roles(current_user, _RULE_READ_ROLES, "view")
    from models import GovernmentNotification

    q = db.query(GovernmentNotification).filter(GovernmentNotification.deleted_at.is_(None))
    if (current_user.role or "").lower() != "superadmin":
        q = q.filter(
            (GovernmentNotification.organization_id.is_(None))
            | (GovernmentNotification.organization_id == current_user.organization_id)
        )
    if status:
        q = q.filter(GovernmentNotification.status == status)
    rows = q.order_by(GovernmentNotification.effective_date.desc()).all()
    return [_notification_dict(n) for n in rows]


@router.post("/api/payroll/notifications", status_code=201)
def create_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_roles(current_user, _RULE_WRITE_ROLES, "record")
    from models import GovernmentNotification

    if (current_user.role or "").lower() != "superadmin":
        payload.organization_id = current_user.organization_id

    n = GovernmentNotification(
        authority=payload.authority,
        notification_number=payload.notification_number,
        title=payload.title,
        summary=payload.summary,
        publication_date=payload.publication_date,
        effective_date=payload.effective_date,
        source_url=payload.source_url,
        affected_rules=payload.affected_rules,
        organization_id=payload.organization_id,
        status="draft",
        notes=payload.notes,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return _notification_dict(n)


@router.post("/api/payroll/notifications/{notification_id}/status")
def update_notification_status(
    notification_id: int,
    payload: NotificationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_roles(current_user, _RULE_WRITE_ROLES, "update")
    from models import GovernmentNotification

    n = db.query(GovernmentNotification).filter(
        GovernmentNotification.id == notification_id,
        GovernmentNotification.deleted_at.is_(None),
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")

    n.status = payload.status
    if payload.notes:
        n.notes = payload.notes
    if payload.status in ("review", "approved"):
        n.reviewed_by = current_user.id
    if payload.status == "approved":
        n.approved_by = current_user.id
    if payload.status == "published":
        n.published_at = datetime.utcnow()
    db.commit()
    db.refresh(n)
    return _notification_dict(n)


def _notification_dict(n) -> Dict[str, Any]:
    return {
        "id": n.id,
        "authority": n.authority,
        "notificationNumber": n.notification_number,
        "title": n.title,
        "summary": n.summary,
        "publicationDate": str(n.publication_date) if n.publication_date else None,
        "effectiveDate": str(n.effective_date),
        "sourceUrl": n.source_url,
        "affectedRules": n.affected_rules or [],
        "status": n.status,
        "organizationId": n.organization_id,
        "notes": n.notes,
    }
