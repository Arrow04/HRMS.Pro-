"""
High-concurrency attendance check-in coordination.

At 100k simultaneous punches, the DB must not rely on SELECT-then-INSERT races.
Redis SET NX provides a fast per-employee open-session lock; Postgres partial
unique index is the source of truth when Redis is unavailable.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from core.cache import get_redis, make_key

logger = logging.getLogger(__name__)

OPEN_SESSION_TTL = 60 * 60 * 48  # 48h — covers overnight open sessions
IDEMPOTENCY_TTL = 60 * 10  # 10 min — safe mobile retries


def _open_key(employee_id: int) -> str:
    return make_key("att", "open", str(employee_id))


def _idem_key(employee_id: int, client_request_id: str) -> str:
    return make_key("att", "idem", str(employee_id), client_request_id)


def try_acquire_open_session(employee_id: int) -> bool:
    """Return True if this employee may start a new open check-in."""
    client = get_redis()
    if client is None:
        return True
    try:
        return bool(client.set(_open_key(employee_id), "1", nx=True, ex=OPEN_SESSION_TTL))
    except Exception as exc:
        logger.warning("Redis open-session lock failed: %s", exc)
        return True


def release_open_session(employee_id: int) -> None:
    client = get_redis()
    if client is None:
        return
    try:
        client.delete(_open_key(employee_id))
    except Exception:
        pass


def get_idempotent_checkin(employee_id: int, client_request_id: str) -> Optional[dict]:
    if not client_request_id:
        return None
    client = get_redis()
    if client is None:
        return None
    try:
        raw = client.get(_idem_key(employee_id, client_request_id))
        return json.loads(raw) if raw else None
    except Exception:
        return None


def store_idempotent_checkin(
    employee_id: int,
    client_request_id: str,
    payload: dict,
) -> None:
    if not client_request_id:
        return
    client = get_redis()
    if client is None:
        return
    try:
        client.setex(
            _idem_key(employee_id, client_request_id),
            IDEMPOTENCY_TTL,
            json.dumps(payload, default=str),
        )
    except Exception:
        pass
