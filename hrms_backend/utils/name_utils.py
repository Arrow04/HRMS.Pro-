"""Shared full-name helpers for employees, candidates, and API payloads."""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple


def split_name(full_name: Optional[str]) -> Tuple[str, str]:
    full_name = (full_name or "").strip()
    if not full_name:
        return "", ""
    parts = full_name.split(None, 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


def join_name(first: Optional[str], last: Optional[str]) -> str:
    return " ".join(p for p in [(first or "").strip(), (last or "").strip()] if p).strip()


def resolve_full_name(
    *,
    full_name: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
) -> str:
    direct = (full_name or "").strip()
    if direct:
        return direct
    return join_name(first_name, last_name)


def normalize_name_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize snake_case request fields to full_name (+ legacy first/last sync)."""
    out = dict(data)
    full = resolve_full_name(
        full_name=out.get("full_name"),
        first_name=out.get("first_name"),
        last_name=out.get("last_name"),
    )
    first, last = split_name(full)
    out["full_name"] = full
    # Keep legacy columns in sync for code paths still reading first_name/last_name.
    out["first_name"] = first or full or out.get("first_name") or ""
    out["last_name"] = last
    return out


def apply_name_fields(target: Any, data: Dict[str, Any]) -> None:
    """Write normalized name fields onto a SQLAlchemy model instance."""
    normalized = normalize_name_payload(data)
    if hasattr(target, "full_name"):
        target.full_name = normalized["full_name"]
    if hasattr(target, "first_name"):
        target.first_name = normalized["first_name"]
    if hasattr(target, "last_name"):
        target.last_name = normalized["last_name"]


def employee_display_name(emp: Any, fallback: str = "") -> str:
    stored = getattr(emp, "full_name", None)
    if stored and str(stored).strip():
        return str(stored).strip()
    return resolve_full_name(
        first_name=getattr(emp, "first_name", None),
        last_name=getattr(emp, "last_name", None),
    ) or fallback


def employee_name_api_fields(emp: Any) -> Dict[str, str]:
    full = employee_display_name(emp)
    first, last = split_name(full)
    return {
        "fullName": full,
        "name": full,
        "firstName": first,
        "lastName": last,
    }
