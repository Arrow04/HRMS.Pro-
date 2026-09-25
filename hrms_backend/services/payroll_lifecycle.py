"""Payroll lifecycle state machine (mandate section 46).

    DRAFT -> CALCULATING -> CALCULATED -> VALIDATION -> PENDING_APPROVAL
          -> APPROVED -> LOCKED -> PROCESSED -> PAID
    side states: REJECTED | CANCELLED | REOPENED | ADJUSTED | REVERSED

Rules enforced here:
- transitions are legal (table-driven)
- finalized payroll (LOCKED/PROCESSED/PAID) is IMMUTABLE - corrections only
  through adjustments (ADJUSTED) or REVERSED, never silent mutation
- every transition writes an immutable audit row
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional, Set

from sqlalchemy.orm import Session

__all__ = ["TRANSITIONS", "FINALIZED_STATUSES", "transition_payroll", "can_transition"]

TRANSITIONS: Dict[str, Set[str]] = {
    "draft": {"calculated", "validation", "pending_approval", "cancelled"},
    "calculating": {"calculated", "cancelled"},
    "calculated": {"validation", "pending_approval", "draft", "cancelled"},
    "validation": {"pending_approval", "calculated", "cancelled"},
    "pending_approval": {"approved", "rejected", "cancelled"},
    "approved": {"locked", "cancelled", "pending_approval"},
    "locked": {"processed"},
    "processed": {"paid", "reversed"},
    "paid": {"reversed"},
    "rejected": {"draft", "reopened"},
    "cancelled": {"draft"},
    "reopened": {"draft", "calculated"},
    "adjusted": {"processed", "paid"},
    "reversed": set(),
}

# Amounts on these rows can never change - the mandate forbids silent edits.
FINALIZED_STATUSES = ("locked", "processed", "paid")

# Transitions that must pass finalization validation first.
_VALIDATED_TARGETS = {"pending_approval", "approved", "locked", "processed"}


def can_transition(current: str, new: str) -> bool:
    return new in TRANSITIONS.get(current or "draft", set())


def transition_payroll(
    db: Session,
    payroll,
    new_status: str,
    user=None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Move a payroll through the lifecycle with validation + audit."""
    current = (payroll.status or "draft").lower()
    new_status = (new_status or "").lower()
    if new_status not in {s for targets in TRANSITIONS.values() for s in targets} | set(TRANSITIONS):
        raise ValueError(f"Unknown payroll status '{new_status}'")
    if not can_transition(current, new_status):
        raise ValueError(f"Illegal payroll transition {current} -> {new_status}")
    # IMMUTABILITY: finalized rows only advance along their terminal path
    # (locked -> processed -> paid -> reversed). Never back to draft/computed
    # states - corrections use adjustments (ADJUSTED) or REVERSED only.
    if current in ("locked", "processed", "paid") and new_status in (
        "draft", "calculating", "calculated", "validation", "reopened",
    ):
        raise ValueError(
            f"Payroll is {current} and immutable - use adjustments (arrears) "
            f"or reversal instead of editing it"
        )

    if new_status in _VALIDATED_TARGETS:
        from services.payroll_validation import validate_finalization
        report = validate_finalization(db, [payroll])
        if not report["valid"]:
            return {
                "ok": False,
                "status": payroll.status,
                "validation": report,
                "detail": "Validation errors block this transition",
            }

    old_status = payroll.status
    payroll.status = new_status
    db.commit()

    try:
        from models import AuditLog
        db.add(AuditLog(
            user_id=getattr(user, "id", None),
            organization_id=payroll.organization_id,
            user_name=getattr(user, "full_name", None),
            action=f"payroll_status:{new_status}",
            module="payroll",
            entity_type="payroll",
            entity_id=str(payroll.id),
            changes={"from": old_status, "to": new_status, "reason": reason},
        ))
        db.commit()
    except Exception:
        db.rollback()

    return {"ok": True, "status": payroll.status, "from": old_status, "to": new_status}
