"""Retirement & Pension engine (mandate section 22).

A generic scheme framework - NPS today, superannuation and future schemes as
new registered schemes - NOT a hard-coded deduction. Every rate, ceiling and
tax treatment comes from versioned rules:

    statutory_rules.rule_type = 'nps'
    definition = {"kind": "composite", "outputs": {
        "employee_rate":   {"kind": "param", "value": 10.0},
        "employer_rate":   {"kind": "param", "value": 10.0},
        "wage_basis":      {"kind": "param", "value": "BASIC_DA"},
        "ccd1_pct_cap":    {"kind": "param", "value": 10.0},   # u/s 80CCD(1)
        "ccd1b_cap":       {"kind": "param", "value": 50000.0},# u/s 80CCD(1B)
        "ccd2_pct":        {"kind": "param", "value": 14.0},   # u/s 80CCD(2)
    }}

Government/PSU corporates publish their own rates - configuration only.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from services.rule_platform import evaluate_definition, resolve_with_trace

__all__ = [
    "RetirementScheme",
    "register_scheme",
    "get_scheme",
    "list_schemes",
    "calculate_nps",
]


class RetirementScheme:
    """A named retirement scheme with a calculator and rule type."""

    def __init__(self, code: str, label: str, rule_type: str,
                 calculator: Callable[..., Dict[str, Any]]):
        self.code = code
        self.label = label
        self.rule_type = rule_type
        self.calculator = calculator


_SCHEMES: Dict[str, RetirementScheme] = {}


def register_scheme(scheme: RetirementScheme) -> None:
    _SCHEMES[scheme.code] = scheme


def get_scheme(code: str) -> Optional[RetirementScheme]:
    return _SCHEMES.get(code)


def list_schemes() -> List[Dict[str, str]]:
    return [{"code": s.code, "label": s.label, "ruleType": s.rule_type}
            for s in _SCHEMES.values()]


# ────────────────────────────────────────────────────────────────────────────
# NPS (National Pension System)
# ────────────────────────────────────────────────────────────────────────────

DEFAULT_NPS_DEFINITION: Dict[str, Any] = {
    "kind": "composite",
    "outputs": {
        "employee_rate": {"kind": "param", "value": 10.0},
        "employer_rate": {"kind": "param", "value": 10.0},
        "wage_basis": {"kind": "param", "value": "BASIC_DA"},
        "ccd1_pct_cap": {"kind": "param", "value": 10.0},
        "ccd1b_cap": {"kind": "param", "value": 50000.0},
        "ccd2_pct": {"kind": "param", "value": 14.0},
    },
}


def _resolve_nps_definition(db: Optional[Session], employee, as_of: date) -> Dict[str, Any]:
    if db is not None and employee is not None:
        try:
            res = resolve_with_trace(
                db, "nps", as_of, country="India",
                organization_id=employee.organization_id,
                company_id=getattr(employee, "company_id", None),
            )
            chosen = (res.get("chosen") or {}).get("definition")
            if chosen:
                return chosen
        except Exception:
            pass
    return DEFAULT_NPS_DEFINITION


def calculate_nps(
    db: Optional[Session],
    employee,
    wages: Dict[str, float],
    as_of: Optional[date] = None,
) -> Dict[str, Any]:
    """NPS employee/employer contributions for the period.

    wages binds BASIC, DA, GROSS (the wage basis rule picks its inputs).
    Applicability is rule/flag driven - never assumed from employment type.
    """
    as_of = as_of or date.today()
    definition = _resolve_nps_definition(db, employee, as_of)

    explicit = bool(getattr(employee, "nps_applicable", False))
    rule_found = db is not None and employee is not None
    # A published nps rule or an explicit employee flag turns the scheme on.
    has_published_rule = False
    if rule_found:
        try:
            res = resolve_with_trace(
                db, "nps", as_of, country="India",
                organization_id=employee.organization_id,
                company_id=getattr(employee, "company_id", None),
            )
            has_published_rule = bool(res.get("chosen"))
        except Exception:
            has_published_rule = False
    applicable = explicit or has_published_rule
    if not applicable:
        return {"applicable": False, "employee": 0.0, "employer": 0.0, "breakdown": {}}

    params = evaluate_definition(definition, dict(wages))
    if not isinstance(params, dict):
        return {"applicable": False, "employee": 0.0, "employer": 0.0, "breakdown": {}}

    basis_code = str(params.get("wage_basis") or "BASIC_DA")
    if basis_code == "GROSS":
        basis = float(wages.get("GROSS") or 0)
    elif basis_code == "BASIC":
        basis = float(wages.get("BASIC") or 0)
    else:  # BASIC_DA
        basis = float(wages.get("BASIC") or 0) + float(wages.get("DA") or 0)

    employee_contrib = round(basis * float(params.get("employee_rate") or 0) / 100.0, 2)
    employer_contrib = round(basis * float(params.get("employer_rate") or 0) / 100.0, 2)

    return {
        "applicable": True,
        "employee": employee_contrib,
        "employer": employer_contrib,
        "breakdown": {
            "scheme": "NPS",
            "wage_basis": basis_code,
            "wage_basis_value": round(basis, 2),
            "employee_rate": params.get("employee_rate"),
            "employer_rate": params.get("employer_rate"),
            # Tax treatment heads (used by the tax engine):
            # 80CCD(1) employee cap %, 80CCD(1B) extra cap, 80CCD(2) employer %
            "ccd1_pct_cap": params.get("ccd1_pct_cap"),
            "ccd1b_cap": params.get("ccd1b_cap"),
            "ccd2_pct": params.get("ccd2_pct"),
            "pran": getattr(employee, "pran_number", None),
        },
    }


register_scheme(RetirementScheme("NPS", "National Pension System", "nps", calculate_nps))
