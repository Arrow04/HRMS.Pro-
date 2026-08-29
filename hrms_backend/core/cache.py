"""
Shared Redis cache layer for HRMS.

- Single connection pool per process (Redis best practice)
- Tenant-scoped key naming: hrms:tenant:{org_id}:{namespace}:...
- SCAN-based invalidation (never KEYS)
- Graceful degradation when Redis is down
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from functools import wraps
from typing import Any, Callable, Optional

import redis

logger = logging.getLogger(__name__)

CACHE_PREFIX = os.getenv("CACHE_PREFIX", "hrms")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))
REDIS_SOCKET_CONNECT_TIMEOUT = float(os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT", "0.5"))
REDIS_SOCKET_TIMEOUT = float(os.getenv("REDIS_SOCKET_TIMEOUT", "2.0"))
REDIS_HEALTH_CHECK_INTERVAL = int(os.getenv("REDIS_HEALTH_CHECK_INTERVAL", "30"))

_pool: Optional[redis.ConnectionPool] = None
_client: Optional[redis.Redis] = None
_down_until: float = 0.0
CACHING_AVAILABLE = False


def _build_pool() -> redis.ConnectionPool:
    return redis.ConnectionPool.from_url(
        REDIS_URL,
        decode_responses=True,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
        socket_timeout=REDIS_SOCKET_TIMEOUT,
        health_check_interval=REDIS_HEALTH_CHECK_INTERVAL,
        retry_on_timeout=True,
    )


def get_redis() -> Optional[redis.Redis]:
    """Return the shared Redis client, or None when unavailable."""
    global _pool, _client, _down_until, CACHING_AVAILABLE

    now = time.time()
    if now < _down_until:
        return None

    if _client is None:
        try:
            _pool = _build_pool()
            _client = redis.Redis(connection_pool=_pool)
            _client.ping()
            CACHING_AVAILABLE = True
        except Exception as exc:
            logger.warning("Redis unavailable: %s", exc)
            _client = None
            _pool = None
            CACHING_AVAILABLE = False
            _down_until = now + 30
            return None

    try:
        _client.ping()
        CACHING_AVAILABLE = True
        return _client
    except Exception as exc:
        logger.warning("Redis ping failed: %s", exc)
        _client = None
        _pool = None
        CACHING_AVAILABLE = False
        _down_until = now + 30
        return None


class _RedisProxy:
    """Lazy proxy so `from core.cache import redis_client` keeps working."""

    def __getattr__(self, name: str):
        client = get_redis()
        if client is None:
            raise AttributeError(f"Redis unavailable: no attribute '{name}'")
        return getattr(client, name)

    def __bool__(self) -> bool:
        return get_redis() is not None


redis_client = _RedisProxy()  # noqa: E305


def cache_key(*args, **kwargs) -> str:
    """Hash function arguments into a stable cache suffix."""
    key_parts = [str(arg) for arg in args]
    ignore_keys = {"db", "current_user", "request", "background_tasks"}
    filtered_kwargs = {k: v for k, v in kwargs.items() if k not in ignore_keys}
    key_parts += [f"{k}:{v}" for k, v in sorted(filtered_kwargs.items())]
    return hashlib.md5(":".join(key_parts).encode()).hexdigest()


def make_key(*parts: str) -> str:
    """Build a namespaced Redis key: hrms:part1:part2:..."""
    clean = [CACHE_PREFIX, *[p for p in parts if p]]
    return ":".join(clean)


def tenant_cache_key(
    tenant_id: Optional[int],
    namespace: str,
    suffix: str,
) -> str:
    tid = tenant_id if tenant_id is not None else "global"
    return make_key("tenant", str(tid), namespace, suffix)


def invalidate_cache(pattern: str) -> int:
    """Delete keys matching pattern using SCAN (safe at scale)."""
    client = get_redis()
    if client is None:
        return 0

    if not pattern.startswith(CACHE_PREFIX):
        pattern = make_key(pattern) if ":" not in pattern else f"{CACHE_PREFIX}:{pattern}"

    deleted = 0
    cursor = 0
    while True:
        cursor, keys = client.scan(cursor=cursor, match=pattern, count=500)
        if keys:
            pipe = client.pipeline(transaction=False)
            for key in keys:
                pipe.delete(key)
            deleted += sum(pipe.execute())
        if cursor == 0:
            break
    return deleted


def invalidate_tenant_cache(
    tenant_id: Optional[int],
    namespace: str,
    *,
    extra_pattern: Optional[str] = None,
) -> int:
    """Bust all cache entries for a tenant namespace (e.g. employees, dashboard)."""
    tid = tenant_id if tenant_id is not None else "*"
    deleted = invalidate_cache(make_key("tenant", str(tid), namespace, "*"))
    if extra_pattern:
        deleted += invalidate_cache(extra_pattern)
    return deleted


def invalidate_employee_caches(tenant_id: Optional[int]) -> None:
    """Call after any employee create/update/delete."""
    invalidate_tenant_cache(tenant_id, "employees")
    invalidate_tenant_cache(tenant_id, "employees-picker")
    invalidate_tenant_cache(tenant_id, "dashboard")


def invalidate_master_data_caches(category_code: Optional[str] = None) -> None:
    """Call after master-data mutations."""
    client = get_redis()
    if client is None:
        return
    client.delete(make_key("master_data", "categories"))
    client.delete(make_key("master_data", "categories", "grouped"))
    if category_code:
        code = category_code.upper()
        client.delete(make_key("master_data", "lookup", code))
    else:
        invalidate_cache(make_key("master_data", "lookup", "*"))


def cached(ttl: int = 300, namespace: str = "api"):
    """Decorator: cache JSON-serializable function results in Redis."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            client = get_redis()
            if client is None:
                return func(*args, **kwargs)

            try:
                tenant_id = kwargs.get("tenant_id") or kwargs.get("organization_id")
                if tenant_id is None and "current_user" in kwargs:
                    user = kwargs["current_user"]
                    tenant_id = getattr(user, "organization_id", None)

                suffix = f"{func.__module__}:{func.__name__}:{cache_key(*args, **kwargs)}"
                key = tenant_cache_key(tenant_id, namespace, suffix)

                cached_result = client.get(key)
                if cached_result is not None:
                    try:
                        return json.loads(cached_result)
                    except (json.JSONDecodeError, TypeError):
                        return cached_result

                result = func(*args, **kwargs)
                if result is not None:
                    client.setex(key, ttl, json.dumps(result, default=str))
                return result
            except Exception:
                return func(*args, **kwargs)

        return wrapper

    return decorator


def get_cache_stats() -> dict:
    """Redis INFO snapshot for ops dashboards."""
    client = get_redis()
    if client is None:
        return {"status": "disconnected"}

    try:
        info = client.info(section="memory")
        stats = client.info(section="stats")
        return {
            "status": "connected",
            "prefix": CACHE_PREFIX,
            "used_memory": info.get("used_memory_human"),
            "maxmemory": info.get("maxmemory_human"),
            "eviction_policy": info.get("maxmemory_policy"),
            "connected_clients": stats.get("total_connections_received"),
            "instantaneous_ops_per_sec": stats.get("instantaneous_ops_per_sec"),
            "keyspace_hits": stats.get("keyspace_hits"),
            "keyspace_misses": stats.get("keyspace_misses"),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


def ping_redis() -> bool:
    return get_redis() is not None
