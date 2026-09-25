"""Arrears & retroactive rule engine (mandate sections 33-34).

The mandated scenario - *notification received in August, effective April;
payroll already processed for April-July* - handled end to end:

    1. identify affected rules/employees/periods (processed payrolls only)
    2. recompute each affected period with the rules now in force
    3. compare old vs new results
    4. compute arrears / recovery (and its tax/statutory deltas)
    5. generate adjustment entries (PayrollAdjustment rows)
    6. PRESERVE the original payroll (never mutated)
    7. write an immutable audit trail

Salary-revision arrears (backdated increments/promotions) run through the
same diff machinery with source='salary_revision'.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

__all__ = [
    "identify_affected_payrolls",
    "diff_payroll",
    "simulate_retro",
    "create_arrears_adjustments",
    "compute_revision_arrears",
    "apply_adjustment",
]

_FINALIZED_STATUSES = ("approved", "locked", "processed", "paid")

# Result keys compared for the arrears/recovery diff.
_DIFF_KEYS = (
    "gross_salary", "total_earnings", "total_deductions", "net_salary",
    "pf_deduction", "esi_deduction", "professional_tax", "lwf_deduction",
    "tds_deduction", "nps_deduction", "bonus", "overtime_pay",
)


def _period_key(year: int, month: int) -> int:
    return year * 12 + month


def identify_affected_payrolls(
    db: Session,
    organization_id: int,
    effective_from: date,
    effective_to: Optional[date] = None,
    employee_id: Optional[int] = None,
    company_id: Optional[int] = None,
) -> List[Any]:
    """Finalized payrolls whose period should have used the new rule.

    Only finalized payroll participates - drafts can simply be re-run.
    """
    from models import Payroll

    start_key = _period_key(effective_from.year, effective_from.month)
    end_key = _period_key(effective_to.year, effective_to.month) if effective_to else _period_key(9999, 12)

    q = db.query(Payroll).filter(
        Payroll.organization_id == organization_id,
        Payroll.deleted_at.is_(None),
        Payroll.status.in_(_FINALIZED_STATUSES),
    )
    if employee_id is not None:
        q = q.filter(Payroll.employee_id == employee_id)
    if company_id is not None:
        q = q.filter(Payroll.company_id == company_id)

    out = []
    for p in q.all():
        key = _period_key(p.year, p.month)
        if start_key <= key <= end_key:
            out.append(p)
    return sorted(out, key=lambda p: (p.year, p.month, p.employee_id))


def diff_payroll(db: Session, payroll) -> Dict[str, Any]:
    """Recompute one period with the rules NOW in force and diff vs stored.

    Returns the original snapshot (verbatim), the revised computation, and
    per-key deltas. The original payroll row is never touched.
    """
    from models import Employee
    from services.payroll_service import calculate_payroll

    employee = db.query(Employee).filter(Employee.id == payroll.employee_id).first()
    original = {k: getattr(payroll, k, None) for k in _DIFF_KEYS}
    recomputed = calculate_payroll(db, employee, payroll.month, payroll.year)
    revised = {k: recomputed.get(k) for k in _DIFF_KEYS}

    deltas = {}
    for k in _DIFF_KEYS:
        try:
            deltas[k] = round(float(revised.get(k) or 0) - float(original.get(k) or 0), 2)
        except (TypeError, ValueError):
            deltas[k] = 0.0

    return {
        "payroll_id": payroll.id,
        "employee_id": payroll.employee_id,
        "month": payroll.month,
        "year": payroll.year,
        "original": original,
        "revised": revised,
        "deltas": deltas,
        "gross_delta": deltas.get("gross_salary", 0.0),
        "deduction_delta": deltas.get("total_deductions", 0.0),
        "net_delta": deltas.get("net_salary", 0.0),
    }


def simulate_retro(
    db: Session,
    organization_id: int,
    effective_from: date,
    effective_to: Optional[date] = None,
    employee_id: Optional[int] = None,
    company_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Dry-run impact of a retroactive change. Persists nothing (mandate 42)."""
    payrolls = identify_affected_payrolls(
        db, organization_id, effective_from,
        effective_to=effective_to, employee_id=employee_id, company_id=company_id,
    )
    diffs = [diff_payroll(db, p) for p in payrolls]
    totals = {
        "payrolls_affected": len(diffs),
        "gross_delta": round(sum(d["gross_delta"] for d in diffs), 2),
        "deduction_delta": round(sum(d["deduction_delta"] for d in diffs), 2),
        "net_delta": round(sum(d["net_delta"] for d in diffs), 2),
    }
    return {"effective_from": str(effective_from), "periods": diffs, "totals": totals}


def _audit(db: Session, user_id: Optional[int], organization_id: int,
           action: str, entity_id: str, changes: Dict[str, Any], user_name: str = None) -> None:
    try:
        from models import AuditLog
        db.add(AuditLog(
            user_id=user_id,
            organization_id=organization_id,
            user_name=user_name,
            action=action,
            module="payroll",
            entity_type="payroll_adjustment",
            entity_id=str(entity_id),
            changes=changes,
        ))
    except Exception:
        pass


def create_arrears_adjustments(
    db: Session,
    organization_id: int,
    effective_from: date,
    effective_to: Optional[date] = None,
    employee_id: Optional[int] = None,
    company_id: Optional[int] = None,
    source: str = "retro_rule",
    reason: Optional[str] = None,
    rule_id: Optional[int] = None,
    rule_version_old: Optional[int] = None,
    rule_version_new: Optional[int] = None,
    created_by: Optional[int] = None,
) -> Dict[str, Any]:
    """Create one adjustment per affected payroll (originals preserved)."""
    from models import PayrollAdjustment

    sim = simulate_retro(
        db, organization_id, effective_from,
        effective_to=effective_to, employee_id=employee_id, company_id=company_id,
    )
    created = []
    for d in sim["periods"]:
        adj = PayrollAdjustment(
            organization_id=organization_id,
            employee_id=d["employee_id"],
            payroll_id=d["payroll_id"],
            source=source,
            reason=reason,
            from_month=d["month"], from_year=d["year"],
            to_month=d["month"], to_year=d["year"],
            rule_id=rule_id,
            rule_version_old=rule_version_old,
            rule_version_new=rule_version_new,
            original=d["original"],
            revised=d["revised"],
            gross_delta=d["gross_delta"],
            deduction_delta=d["deduction_delta"],
            net_delta=d["net_delta"],
            amount=d["net_delta"],   # + payable to employee, - recoverable
            status="draft",
            created_by=created_by,
        )
        db.add(adj)
        created.append(adj)
    db.commit()
    for adj in created:
        db.refresh(adj)
        _audit(db, created_by, organization_id, "arrears_created",
               f"adjustment:{adj.id}",
               {
                   "employee_id": adj.employee_id,
                   "period": f"{adj.from_year}-{adj.from_month:02d}",
                   "amount": adj.amount,
                   "source": source,
                   "rule_id": rule_id,
                   "rule_version_old": rule_version_old,
                   "rule_version_new": rule_version_new,
                   "reason": reason,
               })
    db.commit()
    return {
        "created": [_adjustment_dict(a) for a in created],
        "totals": sim["totals"],
    }


def compute_revision_arrears(
    db: Session,
    employee,
    revision,
) -> Dict[str, Any]:
    """Arrears from a (backdated) salary revision.

    Months from the revision's effective date forward whose payroll was
    finalized under the OLD pay are recomputed; the engine's effective-dated
    base resolution picks up the revision automatically.
    """
    from models import Payroll

    if revision.effective_from is None or not getattr(revision, "base_salary", None):
        return {"periods": [], "totals": {"net_delta": 0.0}}
    payrolls = identify_affected_payrolls(
        db, employee.organization_id, revision.effective_from,
        employee_id=employee.id,
    )
    diffs = [diff_payroll(db, p) for p in payrolls]
    totals = {
        "payrolls_affected": len(diffs),
        "net_delta": round(sum(d["net_delta"] for d in diffs), 2),
    }
    return {"periods": diffs, "totals": totals}


def apply_adjustment(db: Session, adjustment, payroll_month: int, payroll_year: int,
                     applied_by: Optional[int] = None) -> Dict[str, Any]:
    """Book a confirmed adjustment into a standalone adjustment payroll row.

    The ORIGINAL payroll stays immutable; the adjustment becomes its own
    Payroll record carrying only the delta (lifecycle: ADJUSTED).
    """
    from models import Payroll

    if adjustment.status == "applied":
        raise ValueError("Adjustment is already applied")
    row = Payroll(
        employee_id=adjustment.employee_id,
        organization_id=adjustment.organization_id,
        month=payroll_month,
        year=payroll_year,
        status="adjusted",
        gross_salary=max(0.0, adjustment.gross_delta or 0),
        total_deductions=max(0.0, -(adjustment.deduction_delta or 0)) if (adjustment.deduction_delta or 0) < 0 else (adjustment.deduction_delta or 0),
        net_salary=adjustment.amount,
        other_earnings=adjustment.amount if (adjustment.amount or 0) > 0 else 0,
    )
    db.add(row)
    db.flush()
    adjustment.status = "applied"
    adjustment.applied_payroll_id = row.id
    adjustment.applied_at = datetime.utcnow()
    db.commit()
    _audit(db, applied_by, adjustment.organization_id, "arrears_applied",
           f"adjustment:{adjustment.id}",
           {"applied_payroll_id": row.id, "amount": adjustment.amount,
            "period": f"{payroll_year}-{payroll_month:02d}"})
    db.commit()
    return _adjustment_dict(adjustment)


def _adjustment_dict(a) -> Dict[str, Any]:
    return {
        "id": a.id,
        "employeeId": a.employee_id,
        "payrollId": a.payroll_id,
        "source": a.source,
        "reason": a.reason,
        "period": {"fromMonth": a.from_month, "fromYear": a.from_year,
                   "toMonth": a.to_month, "toYear": a.to_year},
        "ruleId": a.rule_id,
        "ruleVersionOld": a.rule_version_old,
        "ruleVersionNew": a.rule_version_new,
        "grossDelta": a.gross_delta,
        "deductionDelta": a.deduction_delta,
        "netDelta": a.net_delta,
        "amount": a.amount,
        "kind": "arrears" if (a.amount or 0) > 0 else "recovery",
        "status": a.status,
        "appliedPayrollId": a.applied_payroll_id,
    }
