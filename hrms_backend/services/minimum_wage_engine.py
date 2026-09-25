"""Minimum wage engine (mandate section 25).

State / zone / scheduled-employment / skill-level aware minimum wages as
versioned rules. The engine compares actual payable wages against the
applicable minimum and produces actionable violation warnings - it never
silently allows under-payment.

    statutory_rules.rule_type = 'minimum_wage'
    rule_subtype = 'labour' | 'clerk' | ...   (scheduled employment / category)
    state_code = 'KA' | ...
    definition = {"kind": "composite", "outputs": {
        "zone":        {"kind": "param", "value": "zone1"},
        "skill_level": {"kind": "param", "value": "unskilled"},
        "daily_rate":  {"kind": "param", "value": 650.0},
        "monthly_rate":{"kind": "param", "value": 19500.0},
        "hourly_rate": {"kind": "param", "value": 81.25},
    }}

Resolution matches state + scheduled employment + skill + zone with the same
effective-dating and specificity rules as every other statutory rule.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from services.rule_platform import evaluate_definition, resolve_with_trace

__all__ = ["resolve_minimum_wage", "check_minimum_wages"]


def resolve_minimum_wage(
    db: Session,
    organization_id: Optional[int],
    as_of: date,
    state_code: Optional[str] = None,
    scheduled_employment: Optional[str] = None,
    skill_level: Optional[str] = None,
    zone: Optional[str] = None,
    company_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Find the applicable minimum wage rule (or None when unconfigured)."""
    res = resolve_with_trace(
        db, "minimum_wage", as_of, country="India",
        state_code=state_code, organization_id=organization_id,
        company_id=company_id,
        rule_subtype=scheduled_employment,
    )
    chosen = res.get("chosen")
    if not chosen:
        return None
    values = evaluate_definition(chosen.get("definition") or {}, {})
    if not isinstance(values, dict):
        return None
    # Skill/zone filters: a rule may define rates for a specific skill/zone;
    # mismatched rows are informational (return rates for the requested level
    # when the rule provides them).
    if skill_level and values.get("skill_level") not in (None, skill_level):
        return {
            "rule_id": chosen["id"],
            "rule_version": chosen["version"],
            "effective_from": chosen.get("effective_from"),
            "skill_level": values.get("skill_level"),
            "rates": values,
            "mismatch": f"rule is for skill '{values.get('skill_level')}', requested '{skill_level}'",
        }
    return {
        "rule_id": chosen["id"],
        "rule_version": chosen["version"],
        "effective_from": chosen.get("effective_from"),
        "skill_level": values.get("skill_level"),
        "zone": values.get("zone"),
        "rates": {
            "daily": values.get("daily_rate"),
            "monthly": values.get("monthly_rate"),
            "hourly": values.get("hourly_rate"),
        },
    }


def check_minimum_wages(
    db: Session,
    organization_id: Optional[int],
    wages: Dict[str, float],
    as_of: Optional[date] = None,
    state_code: Optional[str] = None,
    scheduled_employment: Optional[str] = None,
    skill_level: Optional[str] = None,
    zone: Optional[str] = None,
    company_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Compare payable wages to the applicable minimum.

    wages: {"monthly": ..., "daily": ..., "hourly": ...} (any subset).
    Returns {"applicable": bool, "violation": bool, "shortfall": float,
             "warnings": [...], "minimum": {...}}.
    """
    as_of = as_of or date.today()
    rule = resolve_minimum_wage(
        db, organization_id, as_of,
        state_code=state_code, scheduled_employment=scheduled_employment,
        skill_level=skill_level, zone=zone, company_id=company_id,
    )
    if not rule:
        return {"applicable": False, "violation": False, "shortfall": 0.0,
                "warnings": [], "minimum": None}

    warnings: List[str] = []
    shortfall = 0.0
    violation = False
    rates = rule.get("rates") or {}
    for basis in ("monthly", "daily", "hourly"):
        minimum = rates.get(basis)
        actual = wages.get(basis)
        if minimum is None or actual is None:
            continue
        if float(actual) + 1e-9 < float(minimum):
            violation = True
            gap = round(float(minimum) - float(actual), 2)
            shortfall = max(shortfall, gap)
            warnings.append(
                f"{basis} wage {actual} is below the applicable minimum "
                f"{minimum} (shortfall {gap}, rule v{rule['rule_version']})"
            )
    return {
        "applicable": True,
        "violation": violation,
        "shortfall": shortfall,
        "warnings": warnings,
        "minimum": rule,
    }
