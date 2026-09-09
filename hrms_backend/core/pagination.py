"""
Cursor-based pagination for high-performance large dataset queries
"""
from typing import Generic, TypeVar, Optional, List, Dict, Any
from pydantic import BaseModel, Field
from sqlalchemy import asc, desc, func
from sqlalchemy.orm import Query
from datetime import datetime

T = TypeVar('T')


class PaginationMeta(BaseModel):
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    total: int = Field(..., description="Total items count")
    pages: int = Field(..., description="Total pages")
    has_next: bool = Field(..., description="Has next page")
    has_prev: bool = Field(..., description="Has previous page")
    next_cursor: Optional[str] = Field(None, description="Cursor for next page")
    prev_cursor: Optional[str] = Field(None, description="Cursor for previous page")


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    meta: PaginationMeta


def paginate_query(
    query: Query,
    page: int = 1,
    limit: int = 50,
    cursor_column: str = "id",
    cursor_value: Optional[Any] = None,
    sort_direction: str = "desc"
) -> Dict[str, Any]:
    """
    High-performance cursor-based pagination
    - Uses WHERE cursor > last_value instead of OFFSET
    - O(1) performance regardless of page depth
    - No hard limit on max page size
    """
    page = max(1, page)
    limit = max(1, limit)
    
    total = query.count()
    
    # Get column for cursor
    column = None
    if query.column_descriptions:
        mapper = query.column_descriptions[0]
        if hasattr(mapper['type'], cursor_column):
            column = getattr(mapper['type'], cursor_column)
    
    if column is not None and cursor_value is not None:
        if sort_direction == "desc":
            query = query.filter(column < cursor_value)
        else:
            query = query.filter(column > cursor_value)
    
    # Apply sorting
    if column is not None:
        if sort_direction == "desc":
            query = query.order_by(desc(column))
        else:
            query = query.order_by(asc(column))
    
    # Fetch one extra to check if there's a next page
    items = query.limit(limit + 1).all()
    
    has_next = len(items) > limit
    if has_next:
        items = items[:limit]
    
    # Calculate pagination meta
    pages = (total + limit - 1) // limit if limit > 0 else 0
    
    # Generate cursors
    next_cursor = None
    prev_cursor = None
    
    if items:
        if has_next:
            next_cursor = str(getattr(items[-1], cursor_column))
        if page > 1:
            prev_cursor = str(getattr(items[0], cursor_column))
    
    return {
        "data": items,
        "meta": PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            pages=pages,
            has_next=has_next,
            has_prev=page > 1,
            next_cursor=next_cursor,
            prev_cursor=prev_cursor,
        )
    }


def paginate_employees_query(
    query: Query,
    page: int = 1,
    limit: int = 50,
    cursor_id: Optional[int] = None,
    sort_direction: str = "desc"
) -> Dict[str, Any]:
    """Optimized pagination for employee queries - supports unlimited pages"""
    from models import Employee
    
    query = query.filter(Employee.deleted_at.is_(None))
    
    if cursor_id:
        if sort_direction == "desc":
            query = query.filter(Employee.id < cursor_id)
        else:
            query = query.filter(Employee.id > cursor_id)
    
    query = query.order_by(desc(Employee.id) if sort_direction == "desc" else asc(Employee.id))
    
    # No upper limit - client can request as many as needed
    items = query.limit(limit).all()
    
    total = query.count()
    pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return {
        "data": items,
        "meta": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": pages,
            "has_next": len(items) == limit and (page * limit) < total,
            "has_prev": page > 1,
            "next_cursor": str(items[-1].id) if items and len(items) == limit and (page * limit) < total else None,
            "prev_cursor": str(items[0].id) if items and page > 1 else None,
        }
    }


def paginate_employees_query(
    query: Query,
    page: int = 1,
    limit: int = 50,
    cursor_id: Optional[int] = None,
    sort_direction: str = "desc"
) -> Dict[str, Any]:
    """Optimized pagination for employee queries"""
    query = query.filter(Employee.deleted_at.is_(None))
    
    if cursor_id:
        if sort_direction == "desc":
            query = query.filter(Employee.id < cursor_id)
        else:
            query = query.filter(Employee.id > cursor_id)
    
    query = query.order_by(desc(Employee.id) if sort_direction == "desc" else asc(Employee.id))
    
    items = query.limit(limit + 1).all()
    has_next = len(items) > limit
    if has_next:
        items = items[:limit]
    
    total = query.count()
    pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return {
        "data": items,
        "meta": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": pages,
            "has_next": has_next,
            "has_prev": page > 1,
            "next_cursor": str(items[-1].id) if items and has_next else None,
            "prev_cursor": str(items[0].id) if items and page > 1 else None,
        }
    }


def paginate_attendance_query(
    query: Query,
    page: int = 1,
    limit: int = 100,
    cursor_id: Optional[int] = None,
    sort_direction: str = "desc"
) -> Dict[str, Any]:
    """Optimized pagination for attendance queries"""
    from models import Attendance
    
    query = query.filter(Attendance.deleted_at.is_(None))
    
    if cursor_id:
        if sort_direction == "desc":
            query = query.filter(Attendance.id < cursor_id)
        else:
            query = query.filter(Attendance.id > cursor_id)
    
    query = query.order_by(desc(Attendance.id) if sort_direction == "desc" else asc(Attendance.id))
    
    items = query.limit(limit + 1).all()
    has_next = len(items) > limit
    if has_next:
        items = items[:limit]
    
    total = query.count()
    pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return {
        "data": items,
        "meta": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": pages,
            "has_next": has_next,
            "has_prev": page > 1,
            "next_cursor": str(items[-1].id) if items and has_next else None,
            "prev_cursor": str(items[0].id) if items and page > 1 else None,
        }
    }


# Import here to avoid circular imports
from models import Employee, Attendance
