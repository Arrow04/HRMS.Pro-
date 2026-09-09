"""
Batch operations API endpoints for high-performance bulk data operations
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
import logging

from database import get_db
from models import User, Employee, Attendance, LeaveApplication, Expense, Notification
from core.auth import get_current_user, check_role
from core.batch_operations import (
    batch_insert,
    batch_update,
    batch_delete,
    bulk_attendance_punches,
    bulk_notification_create,
    bulk_employee_status_update,
    BatchOperationResult
)
from core.pagination import PaginatedResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/batch", tags=["batch-operations"])


class BulkInsertRequest(BaseModel):
    table: str = Field(..., description="Target table name")
    records: List[Dict[str, Any]] = Field(..., description="List of records to insert")
    batch_size: int = Field(1000, description="Records per batch", ge=1, le=5000)
    ignore_duplicates: bool = Field(True, description="Skip duplicate records")


class BulkUpdateRequest(BaseModel):
    table: str = Field(..., description="Target table name")
    updates: List[Dict[str, Any]] = Field(..., description="Update operations")
    key_field: str = Field("id", description="Field to match records")


class BulkDeleteRequest(BaseModel):
    table: str = Field(..., description="Target table name")
    ids: List[Any] = Field(..., description="IDs to delete")
    soft_delete: bool = Field(True, description="Use soft delete")


class BulkAttendanceRequest(BaseModel):
    organization_id: int = Field(..., description="Organization ID")
    punches: List[Dict[str, Any]] = Field(..., description="Attendance punches")


class BulkNotificationRequest(BaseModel):
    notifications: List[Dict[str, Any]] = Field(..., description="Notification objects")


class BulkEmployeeStatusRequest(BaseModel):
    employee_ids: List[int] = Field(..., description="Employee IDs")
    status: str = Field(..., description="New status")


@router.post("/insert")
def bulk_insert_records(
    req: BulkInsertRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk insert records into any table"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    allowed_tables = ["employees", "attendance", "expenses", "notifications", "leave_applications"]
    if req.table not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Table {req.table} not allowed for bulk insert")
    
    table_map = {
        "employees": Employee,
        "attendance": Attendance,
        "expenses": Expense,
        "notifications": Notification,
        "leave_applications": LeaveApplication,
    }
    
    model = table_map.get(req.table)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid table")
    
    try:
        result = batch_insert(db, model, req.records, req.batch_size, req.ignore_duplicates)
        return {
            "request_id": getattr(request.state, "request_id", None),
            "result": result.to_dict()
        }
    except Exception as e:
        logger.exception("Bulk insert failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update")
def bulk_update_records(
    req: BulkUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk update records in any table"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    allowed_tables = ["employees", "attendance", "expenses", "notifications"]
    if req.table not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Table {req.table} not allowed for bulk update")
    
    table_map = {
        "employees": Employee,
        "attendance": Attendance,
        "expenses": Expense,
        "notifications": Notification,
    }
    
    model = table_map.get(req.table)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid table")
    
    try:
        result = batch_update(db, model, req.updates, req.key_field)
        return {
            "request_id": getattr(request.state, "request_id", None),
            "result": result.to_dict()
        }
    except Exception as e:
        logger.exception("Bulk update failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/delete")
def bulk_delete_records(
    req: BulkDeleteRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk delete records from any table"""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can bulk delete")
    
    allowed_tables = ["notifications", "audit_logs", "archived_employees"]
    if req.table not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Table {req.table} not allowed for bulk delete")
    
    table_map = {
        "notifications": Notification,
    }
    
    model = table_map.get(req.table)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid table")
    
    try:
        result = batch_delete(db, model, req.ids, req.soft_delete)
        return {
            "request_id": getattr(request.state, "request_id", None),
            "result": result.to_dict()
        }
    except Exception as e:
        logger.exception("Bulk delete failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance/punches")
def bulk_attendance_punches(
    req: BulkAttendanceRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk mark attendance - optimized for high volume"""
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Verify organization access
    if current_user.organization_id and current_user.organization_id != req.organization_id:
        if current_user.role != "superadmin":
            raise HTTPException(status_code=403, detail="Cannot access other organizations")
    
    try:
        result = bulk_attendance_punches(db, req.organization_id, req.punches)
        return {
            "request_id": getattr(request.state, "request_id", None),
            "result": result.to_dict()
        }
    except Exception as e:
        logger.exception("Bulk attendance failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notifications/broadcast")
def bulk_notification_broadcast(
    req: BulkNotificationRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Broadcast notifications to multiple users"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        result = bulk_notification_create(db, req.notifications)
        return {
            "request_id": getattr(request.state, "request_id", None),
            "result": result.to_dict()
        }
    except Exception as e:
        logger.exception("Bulk notification failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/employees/status")
def bulk_employee_status(
    req: BulkEmployeeStatusRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk update employee status"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        result = bulk_employee_status_update(db, req.employee_ids, req.status, current_user.id)
        
        # Invalidate caches
        if current_user.organization_id:
            from core.cache import invalidate_employee_caches
            invalidate_employee_caches(current_user.organization_id)
        
        return {
            "request_id": getattr(request.state, "request_id", None),
            "result": result.to_dict()
        }
    except Exception as e:
        logger.exception("Bulk employee status update failed")
        raise HTTPException(status_code=500, detail=str(e))
