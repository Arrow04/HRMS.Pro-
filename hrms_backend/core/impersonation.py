"""One-time impersonation codes for the tenant hub -> HRMS handoff.

The control hub (port 3005) and the HRMS app (port 5173) run on different
origins, so they cannot share localStorage. Instead, the hub receives a
single-use code with a short TTL and opens the HRMS with it on the URL; the
HRMS exchanges the code for a real session token via
POST /api/auth/impersonate-exchange. Codes live in Redis when available and
in process memory otherwise, and are invalidated on first use.
"""

from __future__ import annotations

import json
import secrets
import time
from typing import Optional

from core.cache import get_redis

_CODE_TTL_SECONDS = 60
_PREFIX = "hrms:impersonation:"

_local: dict[str, tuple[dict, float]] = {}


def create_impersonation_code(payload: dict, ttl: int = _CODE_TTL_SECONDS) -> str:
    """Issue a single-use code bound to the given payload."""
    code = secrets.token_urlsafe(32)
    client = get_redis()
    if client is not None:
        client.setex(f"{_PREFIX}{code}", ttl, json.dumps(payload, default=str))
    else:
        _local[code] = (payload, time.time() + ttl)
    return code


def consume_impersonation_code(code: str) -> Optional[dict]:
    """Return the payload for a code and invalidate it (single use)."""
    if not code or len(code) > 128:
        return None
    key = f"{_PREFIX}{code}"
    client = get_redis()
    if client is not None:
        try:
            raw = client.get(key)
            if raw is None:
                return None
            client.delete(key)
            return json.loads(raw)
        except Exception:
            return None
    now = time.time()
    for k, (_, exp) in list(_local.items()):
        if exp < now:
            _local.pop(k, None)
    item = _local.pop(code, None)
    if item is None:
        return None
    payload, exp = item
    return payload if exp >= now else None
