"""
Statutory Rules Router
=====================
CRUD API for versioned, effective-dated statutory rules.
Allows admins to manage PF/ESI/PT/Bonus/Tax rules per country/state/org.
"""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.auth import check_role, get_current_user
from database import get_db
from models import StatutorySetting, User

router = APIRouter(prefix="/api/statutory-rules", tags=["Statutory Rules"])


def _require_role(current_user: User, allowed_roles: List[str]) -> None:
    """Inline role guard (check_role is a dependency factory, not a checker)."""
    if (current_user.role or "") not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Role '{current_user.role}' does not have permission to access this resource",
        )


def _scoped_org_id(current_user: User, requested_org_id: Optional[int]) -> Optional[int]:
    """Tenant isolation: a caller may only ever resolve rules for their own org.

    Superadmin may target an explicit org id (tenant control hub). Everyone
    else is pinned to their own organization — asking for another org's id is
    a 403, and passing nothing never widens the scope to "all tenants".
    """
    if (current_user.role or "") == "superadmin":
        return requested_org_id
    if requested_org_id and requested_org_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot access statutory rules of another organization",
        )
    return current_user.organization_id


def _org_filter(q, org_id: Optional[int]):
    """Apply org + global scope: own-org rows plus shared global (NULL) rows.
    With no org id, only global rows are visible — never another tenant's."""
    from models import StatutoryRule
    if org_id:
        return q.filter(
            (StatutoryRule.organization_id == org_id)
            | (StatutoryRule.organization_id.is_(None))
        )
    return q.filter(StatutoryRule.organization_id.is_(None))


def _assert_rule_in_scope(rule, current_user: User) -> None:
    """Object-level tenant guard for update/delete/supersede by id."""
    if (current_user.role or "") == "superadmin":
        return
    if rule.organization_id is None:
        raise HTTPException(
            status_code=403,
            detail="Global statutory rules can only be modified by superadmin",
        )
    if rule.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Cannot modify statutory rules of another organization",
        )


# ── Schemas ──

class StatutoryRuleCreate(BaseModel):
    rule_type: str
    rule_subtype: Optional[str] = None
    country: str = "India"
    state_code: Optional[str] = None
    company_id: Optional[int] = None
    effective_from: date
    effective_to: Optional[date] = None
    definition: dict
    notification_number: Optional[str] = None
    notification_date: Optional[date] = None
    gazette_url: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None


class StatutoryRuleUpdate(BaseModel):
    effective_to: Optional[date] = None
    definition: Optional[dict] = None
    notification_number: Optional[str] = None
    notification_date: Optional[date] = None
    gazette_url: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class StatutoryRuleResponse(BaseModel):
    id: int
    organization_id: Optional[int] = None
    company_id: Optional[int] = None
    rule_type: str
    rule_subtype: Optional[str] = None
    country: str
    state_code: Optional[str] = None
    effective_from: date
    effective_to: Optional[date] = None
    definition: dict
    notification_number: Optional[str] = None
    notification_date: Optional[date] = None
    gazette_url: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RuleEngineTestRequest(BaseModel):
    rule_type: str
    as_of: date
    country: str = "India"
    state_code: Optional[str] = None
    organization_id: Optional[int] = None
    # Test parameters
    basic: Optional[float] = None
    gross_salary: Optional[float] = None
    annual_taxable: Optional[float] = None
    regime: str = "new"


# ── Endpoints ──

@router.get("/", response_model=List[StatutoryRuleResponse])
def list_statutory_rules(
    rule_type: Optional[str] = Query(None),
    country: str = Query("India"),
    state_code: Optional[str] = Query(None),
    organization_id: Optional[int] = Query(None),
    companyId: Optional[int] = Query(None),
    status: str = Query("active"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List statutory rules with optional filters. Supports company-scoped rules.

    Always tenant-scoped: the caller's org (plus shared global rules) is the
    maximum visibility — never another organization's rows.
    """
    from models import StatutoryRule

    org_id = _scoped_org_id(current_user, organization_id)

    q = db.query(StatutoryRule).filter(
        StatutoryRule.deleted_at.is_(None),
        StatutoryRule.country == country,
    )
    if rule_type:
        q = q.filter(StatutoryRule.rule_type == rule_type)
    if state_code:
        q = q.filter(StatutoryRule.state_code == state_code)
    q = _org_filter(q, org_id)
    if companyId is not None and org_id:
        q = q.filter(
            (StatutoryRule.company_id == companyId)
            | (StatutoryRule.company_id.is_(None))
        )
    if status:
        q = q.filter(StatutoryRule.status == status)

    rules = q.order_by(StatutoryRule.rule_type, StatutoryRule.effective_from.desc()).all()
    return rules


@router.get("/active")
def list_active_rules_for_date(
    as_of: date = Query(...),
    country: str = Query("India"),
    organization_id: Optional[int] = Query(None),
    companyId: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active statutory rules for a given date, with company override support."""
    from services.statutory_rule_engine import StatutoryRuleEngine

    org_id = _scoped_org_id(current_user, organization_id)
    engine = StatutoryRuleEngine(db)
    return engine.list_active_rules(as_of, country, org_id, company_id=companyId)


@router.post("/", response_model=StatutoryRuleResponse)
def create_statutory_rule(
    rule: StatutoryRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new statutory rule. Admin only. company_id makes it company-specific."""
    _require_role(current_user, ["admin", "superadmin", "hr_manager", "hr_admin"])
    from models import StatutoryRule

    if rule.company_id and current_user.organization_id:
        from core.tenant import validate_company_in_org
        from models import Company
        validate_company_in_org(db, Company, rule.company_id, current_user.organization_id)

    new_rule = StatutoryRule(
        organization_id=current_user.organization_id,
        company_id=rule.company_id,
        rule_type=rule.rule_type,
        rule_subtype=rule.rule_subtype,
        country=rule.country,
        state_code=rule.state_code,
        effective_from=rule.effective_from,
        effective_to=rule.effective_to,
        definition=rule.definition,
        notification_number=rule.notification_number,
        notification_date=rule.notification_date,
        gazette_url=rule.gazette_url,
        status=rule.status,
        notes=rule.notes,
    )
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)
    from core.audit import log_activity
    log_activity(
        db, current_user.id,
        module="statutory_rules",
        action="create_statutory_rule",
        entity_type="statutory_rule",
        entity_id=new_rule.id,
        entity_name=f"{new_rule.rule_type} v{new_rule.version}",
        new_value=f"effective_from={new_rule.effective_from} status={new_rule.status}",
    )
    return new_rule


# Fields that change what a rule MEANS — only editable while the rule is
# still a draft. On a published (active) rule these must go through
# supersede-and-create so history is never rewritten.
_DEFINITION_FIELDS = {"definition", "effective_from", "effective_to",
                      "notification_number", "notification_date", "gazette_url"}


@router.put("/{rule_id}", response_model=StatutoryRuleResponse)
def update_statutory_rule(
    rule_id: int,
    update: StatutoryRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a statutory rule. Admin only. Tenant-scoped.

    Published rules are immutable in place: definition/date changes are
    rejected with 409 (create a new version + supersede the old one).
    Only `notes` and supersession (`status`) may touch a published rule.
    """
    _require_role(current_user, ["admin", "superadmin", "hr_manager", "hr_admin"])
    from models import StatutoryRule

    rule = db.query(StatutoryRule).filter(
        StatutoryRule.id == rule_id,
        StatutoryRule.deleted_at.is_(None),
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    _assert_rule_in_scope(rule, current_user)

    changes = update.model_dump(exclude_unset=True)
    published = (rule.status or "").lower() in ("active", "superseded")
    illegal = _DEFINITION_FIELDS & set(changes)
    if published and illegal:
        raise HTTPException(
            status_code=409,
            detail=(
                "Published statutory rules are immutable — create a new version "
                "with the new effective_from and supersede this one instead of "
                f"editing in place (attempted: {', '.join(sorted(illegal))})"
            ),
        )
    if published and changes.get("status") not in (None, "superseded", "active"):
        raise HTTPException(
            status_code=409,
            detail="Published rules can only be reactivated or superseded",
        )

    old_status = rule.status
    for field, value in changes.items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    from core.audit import log_activity
    log_activity(
        db, current_user.id,
        module="statutory_rules",
        action="update_statutory_rule",
        entity_type="statutory_rule",
        entity_id=rule.id,
        entity_name=f"{rule.rule_type} v{rule.version}",
        old_value=str(old_status),
        new_value=(
            f"status {old_status} -> {rule.status}; fields {sorted(changes)}"
        ),
    )
    return rule


@router.delete("/{rule_id}")
def delete_statutory_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a statutory rule. Admin only. Tenant-scoped + audited."""
    _require_role(current_user, ["admin", "superadmin", "hr_manager", "hr_admin"])
    from datetime import datetime as _dt
    from models import StatutoryRule

    rule = db.query(StatutoryRule).filter(
        StatutoryRule.id == rule_id,
        StatutoryRule.deleted_at.is_(None),
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    _assert_rule_in_scope(rule, current_user)

    rule.deleted_at = _dt.utcnow()
    rule.status = "superseded"
    db.commit()
    from core.audit import log_activity
    log_activity(
        db, current_user.id,
        module="statutory_rules",
        action="delete_statutory_rule",
        entity_type="statutory_rule",
        entity_id=rule.id,
        entity_name=f"{rule.rule_type} v{rule.version}",
        old_value="active",
        new_value="deleted",
    )
    return {"message": "Rule deleted"}


@router.post("/supersede/{rule_id}")
def supersede_rule(
    rule_id: int,
    new_effective_to: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set the effective_to date on a rule to supersede it (tenant-scoped + audited)."""
    _require_role(current_user, ["admin", "superadmin", "hr_manager", "hr_admin"])
    from models import StatutoryRule

    rule = db.query(StatutoryRule).filter(
        StatutoryRule.id == rule_id,
        StatutoryRule.deleted_at.is_(None),
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    _assert_rule_in_scope(rule, current_user)

    old_to = rule.effective_to
    rule.effective_to = new_effective_to
    rule.status = "superseded"
    db.commit()
    from core.audit import log_activity
    log_activity(
        db, current_user.id,
        module="statutory_rules",
        action="supersede_statutory_rule",
        entity_type="statutory_rule",
        entity_id=rule.id,
        entity_name=f"{rule.rule_type} v{rule.version}",
        old_value=f"effective_to={old_to}",
        new_value=f"effective_to={new_effective_to}",
    )
    return {"message": f"Rule superseded effective {new_effective_to}"}


@router.post("/test")
def test_rule_engine(
    req: RuleEngineTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test the rule engine for a given rule type and date (tenant-scoped)."""
    from services.statutory_rule_engine import StatutoryRuleEngine

    req.organization_id = _scoped_org_id(current_user, req.organization_id)
    engine = StatutoryRuleEngine(db)
    result = {}

    rule = engine.resolve(req.rule_type, req.as_of, req.country, req.state_code, req.organization_id)
    result["rule_found"] = rule is not None
    if rule:
        result["rule_definition"] = rule

    if req.rule_type == "pf_contribution" and req.basic is not None:
        result["pf_calculation"] = engine.calculate_pf(
            req.basic, req.as_of, req.country, req.state_code, req.organization_id
        )
    elif req.rule_type == "esi_contribution" and req.gross_salary is not None:
        result["esi_calculation"] = engine.calculate_esi(
            req.gross_salary, req.as_of, req.country, req.state_code, req.organization_id
        )
    elif req.rule_type == "professional_tax" and req.gross_salary is not None:
        result["pt_amount"] = engine.calculate_professional_tax(
            req.gross_salary, req.as_of, req.country, req.state_code, req.organization_id
        )
    elif req.rule_type == "bonus" and req.gross_salary is not None:
        result["bonus_calculation"] = engine.calculate_bonus(
            req.gross_salary, req.as_of, req.country, req.state_code, req.organization_id
        )
    elif req.rule_type == "tax_slab" and req.annual_taxable is not None:
        result["tax_calculation"] = engine.calculate_income_tax(
            req.annual_taxable, req.as_of, req.country, req.state_code, req.organization_id, req.regime
        )
    elif req.rule_type == "gratuity" and req.basic is not None:
        result["gratuity_calculation"] = engine.calculate_gratuity(
            req.basic, req.as_of, req.country, req.organization_id
        )

    return result


@router.get("/version-history/{rule_type}")
def rule_version_history(
    rule_type: str,
    country: str = Query("India"),
    state_code: Optional[str] = Query(None),
    organization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get version history for a specific rule type (all versions, not just active).

    Tenant-scoped: own org + shared global rules only.
    """
    from models import StatutoryRule

    org_id = _scoped_org_id(current_user, organization_id)

    q = db.query(StatutoryRule).filter(
        StatutoryRule.rule_type == rule_type,
        StatutoryRule.country == country,
        StatutoryRule.deleted_at.is_(None),
    )
    if state_code:
        q = q.filter(StatutoryRule.state_code == state_code)
    q = _org_filter(q, org_id)

    rules = q.order_by(StatutoryRule.effective_from.desc()).all()
    return [
        {
            "id": r.id,
            "effective_from": str(r.effective_from),
            "effective_to": str(r.effective_to) if r.effective_to else None,
            "status": r.status,
            "definition": r.definition,
            "notification_number": r.notification_number,
            "notification_date": str(r.notification_date) if r.notification_date else None,
        }
        for r in rules
    ]


# ── Custom statutory deductions (admin-defined, no code changes needed) ──────

class CustomDeductionCreate(BaseModel):
    code: str
    label: str
    kind: str = "percent_of_gross"  # percent_of_gross, percent_of_basic, fixed_amount, slab
    rate: float = 0.0
    amount: float = 0.0
    slabs: Optional[list] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    min_gross: Optional[float] = None
    max_gross: Optional[float] = None
    effective_from: str
    effective_to: Optional[str] = None
    notification_number: Optional[str] = None
    company_id: Optional[int] = None


@router.get("/custom-deductions", tags=["Statutory Rules"])
def list_custom_deductions(
    companyId: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active custom deduction rules for the org/company."""
    from services.custom_deduction_engine import CustomDeductionEngine
    engine = CustomDeductionEngine(db, current_user.organization_id, companyId)
    rules = engine.get_active_custom_rules()
    return {"rules": rules, "count": len(rules)}


@router.post("/custom-deductions", tags=["Statutory Rules"])
def create_custom_deduction(
    data: CustomDeductionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new custom statutory deduction rule."""
    _require_role(current_user, ["admin", "hr_admin"])
    from models import StatutoryRule

    if data.company_id and current_user.organization_id:
        from core.tenant import validate_company_in_org
        from models import Company
        validate_company_in_org(db, Company, data.company_id, current_user.organization_id)

    rule = StatutoryRule(
        rule_type="custom_deduction",
        rule_subtype=data.code,
        country=current_user.organization.country if current_user.organization else "IN",
        effective_from=datetime.strptime(data.effective_from, "%Y-%m-%d").date(),
        effective_to=datetime.strptime(data.effective_to, "%Y-%m-%d").date() if data.effective_to else None,
        definition={
            "code": data.code,
            "label": data.label,
            "kind": data.kind,
            "rate": data.rate,
            "amount": data.amount,
            "slabs": data.slabs or [],
            "min_amount": data.min_amount,
            "max_amount": data.max_amount,
            "min_gross": data.min_gross,
            "max_gross": data.max_gross,
        },
        notification_number=data.notification_number,
        organization_id=current_user.organization_id,
        company_id=data.company_id,
        status="active",
        version=1,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"message": f"Custom deduction '{data.label}' created", "id": rule.id}


@router.delete("/custom-deductions/{rule_id}", tags=["Statutory Rules"])
def delete_custom_deduction(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deactivate a custom deduction rule."""
    _require_role(current_user, ["admin", "hr_admin"])
    from models import StatutoryRule

    rule = db.query(StatutoryRule).filter(
        StatutoryRule.id == rule_id,
        StatutoryRule.rule_type == "custom_deduction",
        StatutoryRule.organization_id == current_user.organization_id,
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Custom deduction rule not found")
    rule.status = "superseded"
    db.commit()
    return {"message": "Custom deduction deactivated"}
