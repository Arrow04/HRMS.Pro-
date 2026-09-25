"""Perquisite engine (mandate section 16).

Employer-provided taxable benefits - accommodation, vehicles, loans, other -
valued through versioned rules. Each perquisite type resolves a
'perquisite' rule whose definition computes the taxable value:

    statutory_rules.rule_type = 'perquisite'
    rule_subtype = 'accommodation' | 'vehicle' | 'loan' | 'other'
    definition = {"kind": "formula",
                  "expr": "(BASIC + DA) * PCT / 100",
                  "params": {"PCT": 15}}          # metro (rule per state/city)

Per-period perquisite items ride in EmployeePayrollInput.inputs["perquisites"]:
    [{"type": "accommodation", "facts": {"metro": true}},
     {"type": "loan", "facts": {"outstanding": 200000, "actual_rate": 4,
                                "market_rate": 9}}]

The taxable total feeds TAXABLE_BENEFITS and the TDS base - never a silent
deduction line.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from services.rule_dsl import MissingInputError, RuleExpressionError
from services.rule_platform import evaluate_definition, resolve_with_trace

__all__ = ["calculate_perquisites", "DEFAULT_PERQUISITE_DEFINITIONS"]

# Built-in default valuation rules - rule-shaped data, overridden by published
# 'perquisite' rules (e.g. different metro percentages per state).
DEFAULT_PERQUISITE_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    # Sec 17(2) read with Rule 3: rent-free accommodation, metro 15% / other 10%
    # of salary (basic + DA + dearness-linked). The PCT param is the rule knob.
    "accommodation": {"kind": "formula",
                      "expr": "(BASIC + DA) * PCT / 100",
                      "params": {"PCT": 15.0}},
    # Motor car: taxable value per month based on engine capacity/ownership;
    # provided as facts (cc, owned_by_employer) with a monthly valuation rule.
    "vehicle": {"kind": "formula",
                "expr": "MONTHLY_VALUE * MONTHS",
                "params": {"MONTHLY_VALUE": 1800.0}},
    # Interest-free/concessional loan: differential interest is the perquisite.
    "loan": {"kind": "formula",
             "expr": "MAX(0, (MARKET_RATE - ACTUAL_RATE) / 100 * OUTSTANDING / 12) * MONTHS",
             "params": {"MONTHS": 1}},
    # Sweeping default for other employer-paid benefits: the paid amount.
    "other": {"kind": "formula", "expr": "AMOUNT", "params": {"AMOUNT": 0.0}},
}


def _resolve_perk_definition(
    db: Optional[Session], employee, perk_type: str, as_of: date,
) -> Dict[str, Any]:
    if db is not None and employee is not None:
        try:
            res = resolve_with_trace(
                db, "perquisite", as_of, country="India",
                organization_id=employee.organization_id,
                company_id=getattr(employee, "company_id", None),
                rule_subtype=perk_type,
            )
            chosen = (res.get("chosen") or {}).get("definition")
            if chosen:
                return chosen
        except Exception:
            pass
    return DEFAULT_PERQUISITE_DEFINITIONS.get(perk_type) or DEFAULT_PERQUISITE_DEFINITIONS["other"]


def calculate_perquisites(
    db: Optional[Session],
    employee,
    items: List[Dict[str, Any]],
    wages: Dict[str, float],
    as_of: Optional[date] = None,
) -> Dict[str, Any]:
    """Value perquisite items into a taxable total with rule provenance.

    wages binds BASIC, DA, GROSS (and anything custom rules reference).
    items: [{"type": "...", "facts": {...}}]. Unknown types or missing rule
    inputs surface as explicit errors in the line - never silent zeros.
    """
    as_of = as_of or date.today()
    ctx: Dict[str, Any] = {
        "BASIC": float(wages.get("BASIC") or 0),
        "DA": float(wages.get("DA") or 0),
        "GROSS_WAGES": float(wages.get("GROSS") or 0),
        "GROSS": float(wages.get("GROSS") or 0),
    }
    total = 0.0
    breakdown: List[Dict[str, Any]] = []
    for item in items or []:
        perk_type = str(item.get("type") or "other").strip().lower()
        facts = dict(item.get("facts") or {})
        definition = _resolve_perk_definition(db, employee, perk_type, as_of)
        eval_ctx = dict(ctx)
        eval_ctx.update({str(k).upper(): v for k, v in facts.items()})
        try:
            value = evaluate_definition(definition, eval_ctx)
            value = round(float(value or 0), 2)
            error = None
        except (MissingInputError, RuleExpressionError) as exc:
            value = 0.0
            error = str(exc)  # explicit capability message on the line
        total += value
        breakdown.append({
            "type": perk_type,
            "taxable_value": value,
            "facts": facts,
            "rule_type": "perquisite",
            "formula": (definition or {}).get("expr"),
            "error": error,
        })
    return {"taxable_total": round(total, 2), "breakdown": breakdown}
