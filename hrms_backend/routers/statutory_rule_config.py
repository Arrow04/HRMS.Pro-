"""Statutory Rule Configuration API.

Database-driven statutory rules so that when the government changes a rule,
you update the config once and the entire UI reflects the change automatically.
"""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_user
from database import get_db
from models import StatutoryRuleConfig, User

router = APIRouter(prefix="/api/statutory-rules", tags=["Statutory Rules"])


# ── Schema ──────────────────────────────────────────────────────────────

class StatutoryRuleConfigItem(BaseModel):
    category: str
    rule_key: str
    label: str
    standard_value: Optional[str] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    notification_ref: Optional[str] = None
    legal_basis: Optional[str] = None
    effective_date: Optional[str] = None
    description: Optional[str] = None
    status: str = 'active'


class StatutoryRuleConfigBulk(BaseModel):
    rules: List[StatutoryRuleConfigItem]


# ── GET ────────────────────────────────────────────────────────────────

@router.get("")
def list_statutory_rules(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all statutory rule configurations."""
    q = db.query(StatutoryRuleConfig).filter(
        StatutoryRuleConfig.status == 'active',
    )
    if current_user.organization_id:
        q = q.filter(
            (StatutoryRuleConfig.organization_id == current_user.organization_id)
            | (StatutoryRuleConfig.organization_id.is_(None))
        )
    if category:
        q = q.filter(StatutoryRuleConfig.category == category)
    rows = q.order_by(StatutoryRuleConfig.category, StatutoryRuleConfig.rule_key).all()
    return [_row_to_dict(r) for r in rows]


@router.get("/categories")
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List distinct categories."""
    rows = db.query(StatutoryRuleConfig.category).distinct().all()
    return [r[0] for r in rows]


# ── Rule type catalog ──────────────────────────────────────────────────
# Structure only: field keys mirror the rule engine's definition schema.
# Every default, help text and notification reference is read from
# statutory_rule_configs at request time, so a change in the law is a
# config edit — never a code change. Org-specific rows override globals.

RULE_TYPE_CATALOG: List[dict] = [
    {
        "value": "pf_contribution",
        "label": "PF contribution",
        "fields": [
            {"key": "rate", "label": "Employee rate", "kind": "number", "rule_key": "pf_employee_rate"},
            {"key": "wage_ceiling", "label": "PF wage ceiling", "kind": "number", "rule_key": "pf_wage_ceiling"},
            {"key": "max_monthly", "label": "Max monthly (cap)", "kind": "number", "rule_key": "pf_max_monthly"},
            {"key": "eps_rate", "label": "EPS rate", "kind": "number", "rule_key": "eps_employer_rate"},
            {"key": "eps_wage_ceiling", "label": "EPS wage ceiling", "kind": "number", "rule_key": "eps_wage_ceiling"},
            {"key": "edli_rate", "label": "EDLI rate", "kind": "number", "rule_key": "pf_edli_rate"},
            {"key": "edli_max", "label": "EDLI max", "kind": "number", "rule_key": "pf_edli_max_monthly"},
            {"key": "admin_rate", "label": "Admin charges", "kind": "number", "rule_key": "pf_admin_rate"},
            {"key": "admin_min", "label": "Admin min", "kind": "number", "rule_key": "pf_admin_min_monthly"},
        ],
    },
    {
        "value": "esi_contribution",
        "label": "ESI contribution",
        "fields": [
            {"key": "employee_rate", "label": "Employee rate", "kind": "number", "rule_key": "esi_employee_rate"},
            {"key": "employer_rate", "label": "Employer rate", "kind": "number", "rule_key": "esi_employer_rate"},
            {"key": "gross_ceiling", "label": "Gross ceiling", "kind": "number", "rule_key": "esi_gross_ceiling"},
            {"key": "disabled_ceiling", "label": "Gross ceiling (disability)", "kind": "number", "rule_key": "esi_disabled_ceiling"},
        ],
    },
    {
        "value": "pf_exclusion",
        "label": "PF exclusion (opt-out)",
        "fields": [
            {"key": "enabled", "label": "Exclusion enabled", "kind": "bool", "default": True},
            {"key": "wage_threshold", "label": "Basic wage threshold", "kind": "number", "rule_key": "pf_min_basic_for_exclusion"},
            {"key": "exclude_both", "label": "Exclude PF and EPS", "kind": "bool", "default": True},
        ],
    },
    {
        "value": "bonus",
        "label": "Statutory bonus",
        "fields": [
            {"key": "applicable", "label": "Bonus applicable", "kind": "bool", "default": True},
            {"key": "min_rate", "label": "Minimum rate", "kind": "number", "rule_key": "bonus_min_rate"},
            {"key": "wage_ceiling", "label": "Wage calculation cap", "kind": "number", "rule_key": "bonus_wage_ceiling"},
        ],
    },
    {
        "value": "gratuity",
        "label": "Gratuity provision",
        "fields": [
            {"key": "applicable", "label": "Gratuity applicable", "kind": "bool", "default": True},
            {"key": "rate", "label": "Monthly accrual rate", "kind": "number", "rule_key": "gratuity_rate"},
        ],
    },
    {"value": "professional_tax", "label": "Professional tax (slabs)", "isJson": True, "fields": []},
    {"value": "tax_slab", "label": "Income tax slabs", "isJson": True, "fields": []},
    {"value": "overtime", "label": "Overtime", "fields": [
        {"key": "multiplier", "label": "OT multiplier", "kind": "number"},
        {"key": "threshold_hours", "label": "Daily threshold hours", "kind": "number"},
    ]},
    {"value": "custom", "label": "Custom (JSON)", "isJson": True, "fields": []},
]


@router.get("/catalog")
def rule_type_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rule types + form fields for the dated-rule builder.

    Values, help text and notification references come from
    statutory_rule_configs (org rows override global defaults).
    """
    q = db.query(StatutoryRuleConfig).filter(StatutoryRuleConfig.status == 'active')
    if current_user.organization_id:
        q = q.filter(
            (StatutoryRuleConfig.organization_id == current_user.organization_id)
            | (StatutoryRuleConfig.organization_id.is_(None))
        )
    cfg = {}
    for row in q.all():
        existing = cfg.get(row.rule_key)
        if existing is None or (existing.organization_id is None and row.organization_id is not None):
            cfg[row.rule_key] = row

    out = []
    for rt in RULE_TYPE_CATALOG:
        fields = []
        for f in rt.get("fields", []):
            row = cfg.get(f.get("rule_key"))
            fields.append({
                "key": f["key"],
                "label": f["label"],
                "kind": f.get("kind", "number"),
                "unit": (row.unit if row and row.unit else f.get("unit")),
                "default": (row.current_value if row and row.current_value is not None else f.get("default")),
                "help": (row.description if row and row.description else f.get("help")),
                "standardValue": (row.standard_value if row else f.get("standardValue")),
                "notificationRef": (row.notification_ref if row else None),
                "legalBasis": (row.legal_basis if row else None),
                "effectiveDate": (str(row.effective_date) if row and row.effective_date else None),
            })
        out.append({
            "value": rt["value"],
            "label": rt["label"],
            "isJson": bool(rt.get("isJson", False)),
            "fields": fields,
        })
    return {"ruleTypes": out}


# ── PUT (bulk upsert) ──────────────────────────────────────────────────

@router.put("")
def upsert_statutory_rules(
    data: StatutoryRuleConfigBulk,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk upsert statutory rules. Missing rules are created, existing ones are updated."""
    created = 0
    updated = 0
    for item in data.rules:
        existing = db.query(StatutoryRuleConfig).filter(
            StatutoryRuleConfig.rule_key == item.rule_key,
            StatutoryRuleConfig.organization_id == current_user.organization_id,
        ).first()
        if existing:
            for k, v in item.model_dump(exclude_unset=True).items():
                if k == 'effective_date' and v:
                    setattr(existing, k, datetime.strptime(v, '%Y-%m-%d').date() if isinstance(v, str) else v)
                else:
                    setattr(existing, k, v)
            existing.updated_at = ist_now_naive()
            updated += 1
        else:
            row = StatutoryRuleConfig(
                organization_id=current_user.organization_id,
                **{k: (datetime.strptime(v, '%Y-%m-%d').date() if k == 'effective_date' and isinstance(v, str) else v)
                   for k, v in item.model_dump(exclude_unset=True).items()},
                created_at=ist_now_naive(),
                updated_at=datetime.utcnow(),
            )
            db.add(row)
            created += 1
    db.commit()
    return {"message": f"{created} created, {updated} updated", "created": created, "updated": updated}


# ── DELETE ──────────────────────────────────────────────────────────────

@router.delete("/{rule_key}")
def delete_statutory_rule(
    rule_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a statutory rule configuration."""
    row = db.query(StatutoryRuleConfig).filter(
        StatutoryRuleConfig.rule_key == rule_key,
        StatutoryRuleConfig.organization_id == current_user.organization_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    row.status = 'superseded'
    row.updated_at = datetime.utcnow()
    db.commit()
    return {"message": f"Rule '{rule_key}' superseded"}


# ── Helpers ─────────────────────────────────────────────────────────────

def _row_to_dict(r: StatutoryRuleConfig) -> dict:
    return {
        "id": r.id,
        "category": r.category,
        "rule_key": r.rule_key,
        "label": r.label,
        "standard_value": r.standard_value,
        "current_value": r.current_value,
        "unit": r.unit,
        "notification_ref": r.notification_ref,
        "legal_basis": r.legal_basis,
        "effective_date": str(r.effective_date) if r.effective_date else None,
        "description": r.description,
        "status": r.status,
    }
