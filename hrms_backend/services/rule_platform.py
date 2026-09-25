"""Rule platform: definition evaluation, resolution trace, conflict detection.

This is the mechanism layer of the payroll rule architecture. Rule
*definitions* (legal interpretation) live in the database as versioned,
effective-dated JSON (models.StatutoryRule); this module evaluates them safely
via services.rule_dsl and explains how they were resolved.

Definition kinds:

  {"kind": "param", "value": 12.0}
  {"kind": "formula", "expr": "MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)",
   "params": {"RATE": 12.0, "MAX_MONTHLY": 1800.0}}
  {"kind": "eligibility", "expr": "GROSS_WAGES <= 21000"}                -> bool
  {"kind": "conditional", "if": "STATE = 'KA'", "then": {...}, "else": {...}}
  {"kind": "slab", "basis": "GROSS_WAGES", "mode": "fixed|percent_of_basis|marginal",
   "slabs": [{"from": 0, "to": 15000, "rate": 0, "fixed": 0}, ...]}
  {"kind": "composite", "outputs": {"employee": {...}, "employer": {...}}}

Missing context inputs raise MissingInputError. The platform never silently
substitutes defaults for unknown inputs (mandate: a genuinely new computational
concept must be identified, not guessed).
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Mapping, Optional

from sqlalchemy.orm import Session

from services.rule_dsl import (
    MissingInputError,
    RuleExpressionError,
    evaluate_expression,
    validate_expression,
)

__all__ = [
    "evaluate_definition",
    "validate_definition",
    "find_rule_conflicts",
    "resolve_with_trace",
    "RuleExpressionError",
    "MissingInputError",
]


def evaluate_definition(definition: Optional[Dict], context: Optional[Mapping[str, Any]] = None):
    """Evaluate a rule definition against a bound context."""
    if not definition:
        return None
    kind = definition.get("kind")
    ctx: Dict[str, Any] = dict(context or {})
    for key, val in (definition.get("params") or {}).items():
        ctx[str(key)] = val

    if kind == "param":
        return definition.get("value")

    if kind == "formula":
        if "expr" not in definition:
            raise RuleExpressionError("formula rule requires an 'expr'")
        return evaluate_expression(definition["expr"], ctx)

    if kind == "eligibility":
        return bool(evaluate_expression(definition.get("expr", "FALSE"), ctx))

    if kind == "conditional":
        cond = evaluate_expression(definition.get("if", "FALSE"), ctx)
        branch = definition.get("then") if cond else definition.get("else")
        return evaluate_definition(branch, ctx) if branch is not None else None

    if kind == "slab":
        basis = definition.get("basis") or "GROSS_WAGES"
        if basis not in ctx:
            raise MissingInputError(basis)
        value = float(ctx[basis] or 0)
        mode = (definition.get("mode") or "fixed").lower()
        slabs = definition.get("slabs") or []

        def _bounds(s):
            lo = float(s.get("from", 0) or 0)
            hi = s.get("to")
            hi = float("inf") if hi is None else float(hi)
            return lo, hi

        if mode == "fixed":
            for s in slabs:
                lo, hi = _bounds(s)
                if lo <= value < hi:
                    return float(s.get("fixed", 0) or 0)
            return 0.0
        if mode == "percent_of_basis":
            for s in slabs:
                lo, hi = _bounds(s)
                if lo <= value < hi:
                    return round(
                        value * float(s.get("rate", 0) or 0) / 100.0
                        + float(s.get("fixed", 0) or 0),
                        2,
                    )
            return 0.0
        if mode == "marginal":
            amount = 0.0
            for s in slabs:
                lo, hi = _bounds(s)
                if value <= lo:
                    continue
                overlap = min(value, hi) - lo
                if overlap > 0:
                    amount += overlap * float(s.get("rate", 0) or 0) / 100.0
                    amount += float(s.get("fixed", 0) or 0)
            return round(amount, 2)
        raise RuleExpressionError(f"Unknown slab mode: {mode!r}")

    if kind == "composite":
        return {
            name: evaluate_definition(sub, ctx)
            for name, sub in (definition.get("outputs") or {}).items()
        }

    raise RuleExpressionError(f"Unknown rule definition kind: {kind!r}")


def validate_definition(definition: Optional[Dict]) -> None:
    """Publish-time validation: structure + expression parse-checks."""
    if not definition or not isinstance(definition, dict):
        raise RuleExpressionError("Rule definition must be an object")
    kind = definition.get("kind")
    if kind == "param":
        if "value" not in definition:
            raise RuleExpressionError("param rule requires a 'value'")
    elif kind in ("formula", "eligibility"):
        validate_expression(definition.get("expr", ""))
    elif kind == "conditional":
        validate_expression(definition.get("if", ""))
        validate_definition(definition.get("then"))
        if definition.get("else") is not None:
            validate_definition(definition.get("else"))
    elif kind == "slab":
        if not definition.get("slabs"):
            raise RuleExpressionError("slab rule requires 'slabs'")
        mode = (definition.get("mode") or "fixed").lower()
        if mode not in ("fixed", "percent_of_basis", "marginal"):
            raise RuleExpressionError(f"Unknown slab mode: {mode!r}")
    elif kind == "composite":
        outputs = definition.get("outputs")
        if not outputs:
            raise RuleExpressionError("composite rule requires 'outputs'")
        for sub in outputs.values():
            validate_definition(sub)
    else:
        raise RuleExpressionError(f"Unknown rule definition kind: {kind!r}")


def find_rule_conflicts(
    db: Session,
    rule_type: str,
    country: str,
    effective_from: date,
    effective_to: Optional[date],
    state_code: Optional[str] = None,
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
    rule_subtype: Optional[str] = None,
    exclude_id: Optional[int] = None,
) -> List[Dict]:
    """Active/draft rules with identical scope whose date ranges overlap.

    Overlaps in the same scope are ambiguous: the resolver would silently pick
    one. The platform refuses them instead of producing a wrong payroll.
    """
    from models import StatutoryRule

    q = db.query(StatutoryRule).filter(
        StatutoryRule.rule_type == rule_type,
        StatutoryRule.country == country,
        StatutoryRule.deleted_at.is_(None),
        StatutoryRule.status.in_(["active", "draft"]),
    )
    q = q.filter(
        StatutoryRule.state_code.is_(None) if state_code is None
        else StatutoryRule.state_code == state_code
    )
    q = q.filter(
        StatutoryRule.organization_id.is_(None) if organization_id is None
        else StatutoryRule.organization_id == organization_id
    )
    q = q.filter(
        StatutoryRule.company_id.is_(None) if company_id is None
        else StatutoryRule.company_id == company_id
    )
    q = q.filter(
        StatutoryRule.rule_subtype.is_(None) if rule_subtype is None
        else StatutoryRule.rule_subtype == rule_subtype
    )
    if exclude_id is not None:
        q = q.filter(StatutoryRule.id != exclude_id)

    conflicts = []
    for r in q.all():
        r_to = r.effective_to
        overlaps = (r_to is None or r_to >= effective_from) and (
            effective_to is None or r.effective_from <= effective_to
        )
        if overlaps:
            conflicts.append({
                "id": r.id,
                "version": getattr(r, "version", 1),
                "status": r.status,
                "effective_from": str(r.effective_from),
                "effective_to": str(r.effective_to) if r.effective_to else None,
            })
    return conflicts


def resolve_with_trace(
    db: Session,
    rule_type: str,
    as_of: date,
    country: str = "",
    state_code: Optional[str] = None,
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
    rule_subtype: Optional[str] = None,
) -> Dict[str, Any]:
    """Like StatutoryRuleEngine.resolve but explains the decision.

    Returns {"chosen": {...} | None, "trace": [candidates with specificity and
    why each lost]} - the explainability backbone for "why was this amount
    calculated?".
    """
    from models import StatutoryRule

    q = db.query(StatutoryRule).filter(
        StatutoryRule.rule_type == rule_type,
        StatutoryRule.deleted_at.is_(None),
        # 'superseded' rows were the published law during their window and must
        # keep resolving for historical payroll; only 'draft' is excluded.
        StatutoryRule.status.in_(["active", "superseded"]),
        StatutoryRule.country == country,
        StatutoryRule.effective_from <= as_of,
        (StatutoryRule.effective_to.is_(None)) | (StatutoryRule.effective_to >= as_of),
    )
    if rule_subtype is not None:
        q = q.filter(StatutoryRule.rule_subtype == rule_subtype)

    candidates = q.all()
    if state_code:
        candidates = [r for r in candidates if r.state_code in (None, state_code)]
    else:
        candidates = [r for r in candidates if r.state_code is None]
    if organization_id:
        candidates = [r for r in candidates if r.organization_id in (None, organization_id)]
    else:
        candidates = [r for r in candidates if r.organization_id is None]
    if company_id:
        candidates = [r for r in candidates if r.company_id in (None, company_id)]
    else:
        candidates = [r for r in candidates if r.company_id is None]

    def specificity(r):
        return (
            0 if r.company_id else 1,
            0 if r.organization_id else 1,
            0 if r.state_code else 1,
            -(r.effective_from.toordinal() if r.effective_from else 0),
            # Deterministic tie-break: the highest version wins when two rules
            # share scope and effective date (mandate: payroll is deterministic).
            -(getattr(r, "version", 1) or 1),
        )

    ranked = sorted(candidates, key=specificity)
    trace = []
    for idx, r in enumerate(ranked):
        trace.append({
            "id": r.id,
            "version": getattr(r, "version", 1),
            "rule_type": r.rule_type,
            "rule_subtype": r.rule_subtype,
            "country": r.country,
            "state_code": r.state_code,
            "organization_id": r.organization_id,
            "company_id": r.company_id,
            "effective_from": str(r.effective_from),
            "effective_to": str(r.effective_to) if r.effective_to else None,
            "specificity": list(specificity(r)),
            "reason": (
                "chosen (most specific scope, latest effective_from)"
                if idx == 0
                else "overridden by a more specific or later rule"
            ),
        })
    chosen = None
    if ranked:
        r = ranked[0]
        chosen = {
            "id": r.id,
            "version": getattr(r, "version", 1),
            "ruleType": r.rule_type,
            "ruleSubtype": r.rule_subtype,
            "country": r.country,
            "stateCode": r.state_code,
            "state_code": r.state_code,
            "organizationId": r.organization_id,
            "companyId": r.company_id,
            "definition": r.definition,
            "effective_from": str(r.effective_from),
            "effective_to": str(r.effective_to) if r.effective_to else None,
            "effectiveFrom": str(r.effective_from),
            "effectiveTo": str(r.effective_to) if r.effective_to else None,
            "notification_number": r.notification_number,
        }
    return {"chosen": chosen, "trace": trace}
