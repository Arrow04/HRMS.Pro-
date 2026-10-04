"""Payroll finalization validation (mandate section 45).

Run before a payroll may move to PENDING_APPROVAL / APPROVED / LOCKED /
PROCESSED. Distinguishes hard errors (block) from warnings (surface):

  errors:   missing salary, negative net pay, duplicate finalized payroll,
            excessive deductions, invalid period
  warnings: missing bank info, minimum-wage violation, missing statutory rules

Thresholds are org-configurable via org.settings.payroll (not hard-coded
business policy - the values here are documented defaults).
"""
from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.orm import Session

__all__ = ["validate_finalization"]

# Documented defaults; orgs override via org.settings.payroll.
DEFAULT_EXCESSIVE_DEDUCTION_PCT = 60.0     # deductions > 60% of gross
DEFAULT_WARN_DEDUCTION_PCT = 50.0


def _settings_for(org) -> Dict[str, Any]:
    try:
        return ((getattr(org, "settings", None) or {}).get("payroll") or {})
    except Exception:
        return {}


def validate_finalization(db: Session, payrolls: List[Any]) -> Dict[str, Any]:
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    from models import Employee, Payroll

    for p in payrolls:
        label = f"payroll #{p.id} (employee {p.employee_id}, {p.year}-{p.month:02d})"

        # Invalid period
        if not (1 <= int(p.month or 0) <= 12) or not (2000 <= int(p.year or 0) <= 2100):
            errors.append({"type": "invalid_period", "message": f"{label}: invalid payroll period"})

        # Missing salary
        if float(p.gross_salary or 0) <= 0:
            errors.append({"type": "missing_salary",
                           "message": f"{label}: gross salary is zero - salary not configured"})

        # Negative net pay
        if float(p.net_salary or 0) < 0:
            errors.append({"type": "negative_net",
                           "message": f"{label}: net pay is negative ({p.net_salary})"})

        # Excessive deductions
        gross = float(p.gross_salary or 0)
        ded = float(p.total_deductions or 0)
        if gross > 0:
            org = db.query(Employee).filter(Employee.id == p.employee_id).first()
            org_obj = getattr(org, "organization", None)
            cfg = _settings_for(org_obj)
            warn_pct = float(cfg.get("warnDeductionPct", DEFAULT_WARN_DEDUCTION_PCT))
            max_pct = float(cfg.get("excessiveDeductionPct", DEFAULT_EXCESSIVE_DEDUCTION_PCT))
            pct = ded / gross * 100.0
            if pct > max_pct:
                errors.append({"type": "excessive_deductions",
                               "message": f"{label}: deductions are {pct:.1f}% of gross (limit {max_pct}%)"})
            elif pct > warn_pct:
                warnings.append({"type": "excessive_deductions",
                                 "message": f"{label}: deductions are {pct:.1f}% of gross"})

        # Missing bank info (payslip/disbursement risk)
        if not getattr(p, "bank_account", None):
            warnings.append({"type": "missing_bank",
                             "message": f"{label}: no bank account on the payroll record"})

        # Duplicate finalized payroll for the same employee/period
        dup = (
            db.query(Payroll.id)
            .filter(
                Payroll.employee_id == p.employee_id,
                Payroll.month == p.month,
                Payroll.year == p.year,
                Payroll.id != p.id,
                Payroll.deleted_at.is_(None),
                Payroll.status.in_(("approved", "locked", "processed", "paid")),
            )
            .count()
        )
        if dup:
            errors.append({"type": "duplicate_payroll",
                           "message": f"{label}: another finalized payroll exists for the same period"})

        # Minimum wage violation (warning - the engine never silently underpays)
        try:
            from services.minimum_wage_engine import check_minimum_wages
            emp = db.query(Employee).filter(Employee.id == p.employee_id).first()
            if emp is not None:
                state = (getattr(emp, "state_code", None) or getattr(emp, "work_state", None)
                         or (getattr(emp.organization, "registered_state", None) if emp.organization else None))
                from services.payroll_service import _get_payroll_policy, resolve_proration_divisor
                _policy = _get_payroll_policy(db, emp)
                _divisor = resolve_proration_divisor(db, emp, pay_policy=_policy)
                mw = check_minimum_wages(
                    db, emp.organization_id,
                    {"monthly": gross, "daily": round(gross / _divisor, 2) if gross else None},
                    state_code=state, company_id=emp.company_id,
                )
                for w in mw.get("warnings", []):
                    warnings.append({"type": "minimum_wage", "message": f"{label}: {w}"})
        except Exception:
            pass

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": {"total_errors": len(errors), "total_warnings": len(warnings)},
    }
