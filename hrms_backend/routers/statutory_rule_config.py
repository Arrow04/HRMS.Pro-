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
