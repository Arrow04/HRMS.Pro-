"""Payroll what-if simulator (mandate section 44).

Simulates salary changes, bonuses, regime switches and other scenarios and
shows Current vs Simulated payroll. NOTHING is ever persisted - actual
payroll is untouched.

Supported changes (v1 - the change map is deliberately open):
    base_salary / salary_increase_pct   (employee pay change, promotion...)
    bonus, commission, incentive        (variable pay)
    tax_regime_id                       (regime switch)
    override_basic/hra/...              (anything calculate_payroll overrides)
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

__all__ = ["simulate_changes"]


class _SimulatedEmployee:
    """Attribute proxy: real employee + in-memory overrides. Never persisted."""

    def __init__(self, employee, overrides: Dict[str, Any]):
        object.__setattr__(self, "_employee", employee)
        object.__setattr__(self, "_overrides", overrides)

    def __getattr__(self, name):
        overrides = object.__getattribute__(self, "_overrides")
        if name in overrides:
            return overrides[name]
        return getattr(object.__getattribute__(self, "_employee"), name)


_COMPARE_KEYS = (
    "basic_salary", "hra", "da", "gross_salary", "total_earnings",
    "pf_deduction", "esi_deduction", "professional_tax", "tds_deduction",
    "nps_deduction", "bonus", "total_deductions", "net_salary",
)


def simulate_changes(
    db: Session,
    employee,
    month: int,
    year: int,
    changes: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute current vs simulated payroll for a scenario. Pure function."""
    from services.payroll_service import calculate_payroll

    changes = dict(changes or {})

    emp_overrides: Dict[str, Any] = {}
    calc_overrides: Dict[str, Any] = {}

    # Pay change: direct or percentage
    base = float(getattr(employee, "base_salary", 0) or 0)
    if changes.get("base_salary") is not None:
        emp_overrides["base_salary"] = float(changes["base_salary"])
    elif changes.get("salary_increase_pct") is not None:
        emp_overrides["base_salary"] = round(
            base * (1.0 + float(changes["salary_increase_pct"]) / 100.0), 2
        )
    if changes.get("tax_regime_id") is not None:
        emp_overrides["tax_regime_id"] = int(changes["tax_regime_id"])

    # Variable pay / direct calculation overrides
    for key in ("bonus", "commission", "incentive", "basic", "hra", "conveyance",
                "medical", "pf_deduction", "esi_deduction", "professional_tax", "tds"):
        val = changes.get(key)
        if val is not None:
            calc_overrides[f"override_{key}"] = val

    current = calculate_payroll(db, employee, month, year)
    simulated = calculate_payroll(
        db,
        _SimulatedEmployee(employee, emp_overrides) if emp_overrides else employee,
        month, year,
        **calc_overrides,
    )

    current_cmp = {k: current.get(k) for k in _COMPARE_KEYS}
    simulated_cmp = {k: simulated.get(k) for k in _COMPARE_KEYS}
    delta = {
        k: round(float(simulated_cmp.get(k) or 0) - float(current_cmp.get(k) or 0), 2)
        for k in _COMPARE_KEYS
    }
    return {
        "period": {"month": month, "year": year},
        "changes": changes,
        "current": current_cmp,
        "simulated": simulated_cmp,
        "delta": delta,
        "note": "Simulation only - no payroll record was created or modified.",
    }
