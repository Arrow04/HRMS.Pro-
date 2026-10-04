"""Hash-chained audit trail — tamper evidence for every audit row.

Each AuditLog row stores previous_hash + signature where
    signature = sha256(previous_hash + canonical_payload)
chained per organization (NULL-org rows chain on their own tail). Editing or
deleting any row in the chain breaks verification of that row and everything
after it — the property an auditor actually needs.

The chain is maintained by an after_flush Session listener: INSERTs are
already done at that point, so each new row reads the previous committed /
same-transaction signature with `id < self.id` and stamps itself — every
audit writer in the codebase is covered without touching call sites.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

GENESIS = "GENESIS"
_attached = False


def _canonical(target) -> str:
    payload = {
        "user_id": target.user_id,
        "organization_id": target.organization_id,
        "action": target.action,
        "module": target.module,
        "entity_type": target.entity_type,
        "entity_id": target.entity_id,
        "changes": target.changes,
        "old_values": target.old_values,
        "new_values": target.new_values,
        "created_at": (target.created_at.isoformat() if target.created_at else None),
    }
    return json.dumps(payload, sort_keys=True, default=str)


def compute_signature(prev_hash: str, payload: str) -> str:
    return hashlib.sha256(f"{prev_hash or GENESIS}|{payload}".encode("utf-8")).hexdigest()


def verify_audit_chain(db, org_id: Optional[int] = None) -> Dict[str, Any]:
    """Replay the chain and report the first broken link (if any)."""
    from models import AuditLog
    q = db.query(AuditLog).filter(AuditLog.signature.isnot(None)).order_by(AuditLog.id.asc())
    if org_id:
        q = q.filter(AuditLog.organization_id == org_id)
    else:
        q = q.filter(AuditLog.organization_id.is_(None))
    prev = GENESIS
    checked = 0
    for row in q.all():
        payload = _canonical(row)
        expected = compute_signature(prev, payload)
        checked += 1
        if row.signature != expected or (row.previous_hash or GENESIS) != prev:
            return {
                "valid": False,
                "checked": checked,
                "firstInvalidId": row.id,
                "reason": "hash mismatch — audit chain broken (tampering or gap)",
            }
        prev = row.signature
    return {"valid": True, "checked": checked, "firstInvalidId": None}


def attach_audit_chain() -> None:
    """Register the after_flush chain listener (idempotent)."""
    global _attached
    if _attached:
        return
    from datetime import datetime
    from sqlalchemy import event, text
    from sqlalchemy.orm import Session
    from models import AuditLog

    @event.listens_for(Session, "after_flush")
    def _chain_after_flush(session, flush_context):  # noqa: ANN001
        try:
            new_rows = [
                o for o in session.new
                if isinstance(o, AuditLog) and not o.signature
            ]
            if not new_rows:
                return
            conn = session.connection()
            for row in sorted(new_rows, key=lambda r: (r.id or 0)):
                if row.signature or not row.id:
                    continue
                if row.created_at is None:
                    row.created_at = datetime.utcnow()
                payload = _canonical(row)
                if row.organization_id:
                    res = conn.execute(text(
                        "SELECT signature FROM audit_logs "
                        "WHERE organization_id = :org AND signature IS NOT NULL "
                        "AND id < :rid ORDER BY id DESC LIMIT 1"),
                        {"org": row.organization_id, "rid": row.id})
                else:
                    res = conn.execute(text(
                        "SELECT signature FROM audit_logs "
                        "WHERE organization_id IS NULL AND signature IS NOT NULL "
                        "AND id < :rid ORDER BY id DESC LIMIT 1"),
                        {"rid": row.id})
                prev = res.scalar() or GENESIS
                row.previous_hash = prev
                row.signature = compute_signature(prev, payload)
                conn.execute(text(
                    "UPDATE audit_logs SET signature = :sig, previous_hash = :prev "
                    "WHERE id = :rid"),
                    {"sig": row.signature, "prev": prev, "rid": row.id})
        except Exception:
            # The audit chain must never break the business transaction.
            logger.exception("Audit chain hook failed")

    _attached = True
