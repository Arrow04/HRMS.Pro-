"""
Keyset (cursor) pagination utilities.

Offset-based pagination degrades badly beyond ~100k rows because
PostgreSQL must scan and discard (page-1)*limit rows. Keyset pagination
uses the index on the sort key to start reading directly after the last
seen row, giving O(log n) + page-size cost per request regardless of depth.

These helpers work with SQLAlchemy ORM queries and stay backward
compatible with the existing `page`/`limit`/`offset` API contract.
"""
from typing import Optional


def apply_keyset(query, model, sort_column, cursor: Optional[int], limit: int, descending: bool = True):
    """
    Apply keyset pagination on an integer sort key (typically the PK).

    - When `cursor` is provided, adds `WHERE sort_column < cursor`
      (or `>` when not descending) and orders by `sort_column`.
    - When `cursor` is None, falls back to a plain ORDER BY + LIMIT.
    """
    if cursor is not None:
        if descending:
            query = query.filter(sort_column < cursor)
        else:
            query = query.filter(sort_column > cursor)
    if descending:
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())
    return query.limit(limit)


def build_keyset_meta(
    items,
    cursor: Optional[int],
    limit: int,
    has_more: bool = False,
    next_cursor: Optional[int] = None,
    total: Optional[int] = None,
    pages: Optional[int] = None,
) -> dict:
    """Build pagination metadata compatible with the existing response shape."""
    meta = {
        "page": cursor or 1,
        "limit": limit,
        "hasMore": has_more,
    }
    if next_cursor is not None:
        meta["nextCursor"] = next_cursor
    if total is not None:
        meta["total"] = total
    if pages is not None:
        meta["pages"] = pages
    return meta
