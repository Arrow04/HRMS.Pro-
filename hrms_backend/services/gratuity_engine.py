"""Gratuity engine (mandate section 23): eligibility, service, settlement.

Payment of Gratuity Act semantics, fully rule-driven:

    statutory_rules.rule_type = 'gratuity'
    definition = {"kind": "composite", "outputs": {
        "min_years":          {"kind": "param", "value": 5.0},
        "days_per_year":      {"kind": "param", "value": 15.0},   # 15-day rule
        "divisor":            {"kind": "param", "value": 26.0},   # monthly -> daily
        "wage_basis":         {"kind": "param", "value": "BASIC_DA"},
        "tax_exempt_ceiling": {"kind": "param", "value": 2000000.0},
    }}

Service years follow the Act: completed years plus a part-year when the
remaining service exceeds 240 days. Settlements are recorded
(GratuityCalculation) so accrual and settlement are auditable.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from services.rule_platform import evaluate_definition, resolve_with_trace

__all__ = [
    "DEFAULT_GRATUITY_DEFINITION",
    "service_years_act",
    "calculate_gratuity_settlement",
    "record_gratuity",
]

DEFAULT_GRATUITY_DEFINITION: Dict[str, Any] = {
    "kind": "composite",
    "outputs": {
        "min_years": {"kind": "param", "value": 5.0},
        "days_per_year": {"kind": "param", "value": 15.0},
        "divisor": {"kind": "param", "value": 26.0},
        "wage_basis": {"kind": "param", "value": "BASIC_DA"},
        "tax_exempt_ceiling": {"kind": "param", "value": 2000000.0},
    },
}


def service_years_act(join_date, as_of: date) -> float:
    """Act service computation: completed years + part-year when > 240 days."""
    if join_date is None:
        return 0.0
    jd = join_date.date() if isinstance(join_date, datetime) else join_date
    if as_of <= jd:
        return 0.0
    days = (as_of - jd).days
    years = days // 365
    remainder = days % 365
    if remainder > 240:
        years += 1
    return float(years)


def _resolve_definition(db: Optional[Session], employee, as_of: date) -> Dict[str, Any]:
    if db is not None and employee is not None:
        try:
            res = resolve_with_trace(
                db, "gratuity", as_of, country="India",
                organization_id=employee.organization_id,
                company_id=getattr(employee, "company_id", None),
            )
            chosen = (res.get("chosen") or {}).get("definition")
            if chosen:
                return chosen
        except Exception:
            pass
    return DEFAULT_GRATUITY_DEFINITION


def calculate_gratuity_settlement(
    db: Optional[Session],
    employee,
    as_of: Optional[date] = None,
    wage_basic: Optional[float] = None,
    wage_da: float = 0.0,
) -> Dict[str, Any]:
    """Gratuity payable at settlement (or accrual), with rule provenance."""
    as_of = as_of or date.today()
    definition = _resolve_definition(db, employee, as_of)
    params = evaluate_definition(definition, {}) or {}

    years = service_years_act(getattr(employee, "join_date", None), as_of)
    min_years = float(params.get("min_years") or 5.0)
    days_per_year = float(params.get("days_per_year") or 15.0)
    divisor = float(params.get("divisor") or 26.0) or 26.0
    ceiling = float(params.get("tax_exempt_ceiling") or 2000000.0)

    if wage_basic is None:
        wage_basic = float(getattr(employee, "base_salary", 0) or 0) / 12.0
    basis_code = str(params.get("wage_basis") or "BASIC_DA")
    basis_value = float(wage_basic) + (float(wage_da) if basis_code == "BASIC_DA" else 0.0)

    eligible = years >= min_years
    raw = (days_per_year * basis_value * years) / divisor if eligible else 0.0
    amount = round(min(raw, ceiling), 2)

    return {
        "eligible": eligible,
        "service_years": years,
        "min_years": min_years,
        "wage_basis": basis_code,
        "wage_basis_value": round(basis_value, 2),
        "days_per_year": days_per_year,
        "divisor": divisor,
        "amount": amount,
        "capped": bool(raw > ceiling),
        "tax_exempt_ceiling": ceiling,
    }


def record_gratuity(
    db: Session,
    employee,
    result: Dict[str, Any],
    status: str = "accrued",
    settlement_ref: Optional[str] = None,
) -> Any:
    """Persist a gratuity calculation (accrual or settlement) for audit."""
    from models import GratuityCalculation

    row = GratuityCalculation(
        organization_id=employee.organization_id,
        employee_id=employee.id,
        service_years=result.get("service_years", 0),
        wage_basis=result.get("wage_basis"),
        wage_basis_value=result.get("wage_basis_value", 0),
        days_per_year=result.get("days_per_year", 0),
        divisor=result.get("divisor", 0),
        amount=result.get("amount", 0),
        eligible=bool(result.get("eligible")),
        capped=bool(result.get("capped")),
        status=status,           # accrued | settled
        settlement_ref=settlement_ref,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
