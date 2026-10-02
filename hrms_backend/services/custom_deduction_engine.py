"""Custom statutory deduction engine — admin-defined rules, zero code changes.

When the government introduces a new deduction (e.g., "Employee Tax 1%"),
the admin creates a custom rule through the UI. This engine evaluates ALL
active custom rules for each employee and returns deduction amounts.

Rule definition JSON supports:
  - kind: 'percent_of_gross' | 'fixed_amount' | 'percent_of_basic' | 'slab'
  - rate: percentage (for percent kinds)
  - amount: fixed amount (for fixed kind)
  - slabs: [{from, to, rate}] (for slab kind)
  - min_amount / max_amount: optional caps
  - applicable_from / applicable_to: date range
  - min_gross / max_gross: eligibility range

Usage:
    engine = CustomDeductionEngine(db, org_id)
    results = engine.calculate_all(gross, basic, employee_id=emp_id)
    # returns [{"code": "employee_tax", "label": "Employee Tax", "amount": 500}, ...]
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import Employee, StatutoryRule


class CustomDeductionEngine:
    """Evaluates admin-defined custom statutory deductions."""

    def __init__(self, db: Session, org_id: Optional[int] = None):
        self.db = db
        self.org_id = org_id

    def get_active_custom_rules(self, as_of: Optional[date] = None) -> List[Dict[str, Any]]:
        """Fetch all active custom deduction rules for the org."""
        as_of = as_of or date.today()
        query = self.db.query(StatutoryRule).filter(
            StatutoryRule.status == "active",
            StatutoryRule.effective_from <= as_of,
            (StatutoryRule.effective_to.is_(None)) | (StatutoryRule.effective_to >= as_of),
            StatutoryRule.rule_type == "custom_deduction",
        )
        if self.org_id:
            query = query.filter(
                (StatutoryRule.organization_id == self.org_id) |
                (StatutoryRule.organization_id.is_(None))
            )
        rules = query.order_by(StatutoryRule.effective_from.desc()).all()

        # Deduplicate: keep only the latest rule per custom code
        seen: Dict[str, Dict[str, Any]] = {}
        for rule in rules:
            definition = rule.definition or {}
            code = definition.get("code") or f"custom_{rule.id}"
            if code not in seen:
                seen[code] = {
                    "code": code,
                    "label": definition.get("label") or code.replace("_", " ").title(),
                    "kind": definition.get("kind", "percent_of_gross"),
                    "rate": float(definition.get("rate") or 0),
                    "amount": float(definition.get("amount") or 0),
                    "slabs": definition.get("slabs") or [],
                    "min_amount": definition.get("min_amount"),
                    "max_amount": definition.get("max_amount"),
                    "min_gross": definition.get("min_gross"),
                    "max_gross": definition.get("max_gross"),
                    "rule_id": rule.id,
                    "notification_number": rule.notification_number,
                }
        return list(seen.values())

    def calculate_one(
        self,
        rule: Dict[str, Any],
        gross: float,
        basic: float = 0,
        employee_id: Optional[int] = None,
    ) -> float:
        """Calculate a single custom deduction amount."""
        # Check eligibility range
        min_gross = rule.get("min_gross")
        max_gross = rule.get("max_gross")
        if min_gross is not None and gross < float(min_gross):
            return 0.0
        if max_gross is not None and gross > float(max_gross):
            return 0.0

        kind = rule.get("kind", "percent_of_gross")
        amount = 0.0

        if kind == "percent_of_gross":
            amount = gross * rule.get("rate", 0) / 100
        elif kind == "percent_of_basic":
            basis = basic if basic > 0 else gross
            amount = basis * rule.get("rate", 0) / 100
        elif kind == "fixed_amount":
            amount = rule.get("amount", 0)
        elif kind == "slab":
            amount = self._calculate_slab(rule.get("slabs", []), gross)
        else:
            # Default: percent of gross
            amount = gross * rule.get("rate", 0) / 100

        # Apply caps
        min_amt = rule.get("min_amount")
        max_amt = rule.get("max_amount")
        if min_amt is not None:
            amount = max(amount, float(min_amt))
        if max_amt is not None:
            amount = min(amount, float(max_amt))

        return round(amount, 2)

    def _calculate_slab(self, slabs: List[Dict[str, Any]], gross: float) -> float:
        """Calculate slab-based deduction (marginal or flat per slab)."""
        if not slabs:
            return 0.0

        total = 0.0
        for slab in sorted(slabs, key=lambda s: s.get("from", 0)):
            from_val = float(slab.get("from", 0))
            to_val = slab.get("to")
            rate = float(slab.get("rate", 0))
            slab_type = slab.get("type", "flat")  # flat or marginal

            if gross < from_val:
                continue
            if to_val is not None and gross > float(to_val):
                # Full slab amount for ranges fully below gross
                if slab_type == "flat":
                    total += (float(to_val) - from_val) * rate / 100
                else:
                    total += (float(to_val) - from_val) * rate / 100
            else:
                # Partial slab (gross falls within this slab)
                effective_top = gross if to_val is None else min(gross, float(to_val))
                if slab_type == "flat":
                    total += (effective_top - from_val) * rate / 100
                else:
                    total += (effective_top - from_val) * rate / 100
        return round(total, 2)

    def calculate_all(
        self,
        gross: float,
        basic: float = 0,
        employee_id: Optional[int] = None,
        as_of: Optional[date] = None,
    ) -> List[Dict[str, Any]]:
        """Calculate all active custom deductions for an employee."""
        rules = self.get_active_custom_rules(as_of=as_of)
        results = []
        for rule in rules:
            amount = self.calculate_one(rule, gross, basic, employee_id)
            if amount > 0:
                results.append({
                    "code": rule["code"],
                    "label": rule["label"],
                    "amount": amount,
                    "kind": rule["kind"],
                    "rule_id": rule["rule_id"],
                })
        return results
