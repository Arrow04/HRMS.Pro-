"""
Batch operations for high-performance bulk inserts/updates
"""
from typing import List, Dict, Any, Optional, Type
from sqlalchemy.orm import Session
from sqlalchemy import insert, update, delete
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class BatchOperationResult:
    """Result of a batch operation"""
    def __init__(self):
        self.success_count = 0
        self.error_count = 0
        self.errors: List[Dict[str, Any]] = []
        self.processed_ids: List[Any] = []
    
    def add_success(self, id: Any):
        self.success_count += 1
        self.processed_ids.append(id)
    
    def add_error(self, id: Any, error: str):
        self.error_count += 1
        self.errors.append({"id": id, "error": error})
    
    def to_dict(self):
        return {
            "success_count": self.success_count,
            "error_count": self.error_count,
            "errors": self.errors[:100],  # Limit error details
            "processed_ids": self.processed_ids[:1000],
        }


def batch_insert(
    db: Session,
    model: Type,
    records: List[Dict[str, Any]],
    batch_size: int = 1000,
    ignore_duplicates: bool = True
) -> BatchOperationResult:
    """
    High-performance bulk insert using core INSERT statements
    
    Args:
        db: Database session
        model: SQLAlchemy model class
        records: List of dictionaries with record data
        batch_size: Number of records per batch
        ignore_duplicates: Skip records that violate unique constraints
    """
    result = BatchOperationResult()
    
    if not records:
        return result
    
    try:
        # Process in batches
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            
            try:
                # Use core insert for maximum performance
                stmt = insert(model).values(batch)
                
                if ignore_duplicates:
                    stmt = stmt.on_conflict_do_nothing()
                
                db.execute(stmt)
                db.commit()
                
                for record in batch:
                    result.add_success(record.get("id", i))
                    
            except Exception as e:
                db.rollback()
                logger.error(f"Batch insert failed for batch {i}: {e}")
                
                # Try individual inserts for better error reporting
                for record in batch:
                    try:
                        obj = model(**record)
                        db.add(obj)
                        db.commit()
                        result.add_success(record.get("id", i))
                    except Exception as e2:
                        db.rollback()
                        result.add_error(record.get("id", i), str(e2))
    
    except Exception as e:
        logger.error(f"Batch insert failed: {e}")
    
    return result


def batch_update(
    db: Session,
    model: Type,
    updates: List[Dict[str, Any]],
    key_field: str = "id",
    batch_size: int = 500
) -> BatchOperationResult:
    """
    High-performance bulk update
    
    Args:
        db: Database session
        model: SQLAlchemy model class
        updates: List of dicts with key_field and values to update
        key_field: Field to identify records (usually 'id')
        batch_size: Number of updates per batch
    """
    result = BatchOperationResult()
    
    if not updates:
        return result
    
    try:
        for i in range(0, len(updates), batch_size):
            batch = updates[i:i + batch_size]
            
            try:
                # Extract IDs and update values
                ids = [u[key_field] for u in batch if key_field in u]
                update_values = [{k: v for k, v in u.items() if k != key_field} for u in batch if key_field in u]
                
                if ids and update_values:
                    # Use CASE WHEN for bulk update
                    stmt = update(model).where(model.id.in_(ids))
                    
                    # Build CASE WHEN for each field
                    for field_name in update_values[0].keys():
                        case_stmt = {}
                        for update_data, record_id in zip(update_values, ids):
                            case_stmt[record_id] = update_data[field_name]
                        
                        stmt = stmt.values({field_name: case_stmt})
                    
                    db.execute(stmt)
                    db.commit()
                    
                    for record_id in ids:
                        result.add_success(record_id)
                        
            except Exception as e:
                db.rollback()
                logger.error(f"Batch update failed for batch {i}: {e}")
                
                # Try individual updates
                for update_data in batch:
                    try:
                        record_id = update_data.get(key_field)
                        if record_id:
                            obj = db.query(model).filter(getattr(model, key_field) == record_id).first()
                            if obj:
                                for k, v in update_data.items():
                                    if k != key_field:
                                        setattr(obj, k, v)
                                db.commit()
                                result.add_success(record_id)
                    except Exception as e2:
                        db.rollback()
                        result.add_error(update_data.get(key_field), str(e2))
    
    except Exception as e:
        logger.error(f"Batch update failed: {e}")
    
    return result


def batch_delete(
    db: Session,
    model: Type,
    ids: List[Any],
    soft_delete: bool = True,
    batch_size: int = 1000
) -> BatchOperationResult:
    """
    High-performance bulk delete
    
    Args:
        db: Database session
        model: SQLAlchemy model class
        ids: List of IDs to delete
        soft_delete: Use soft delete (set deleted_at) instead of hard delete
        batch_size: Number of deletes per batch
    """
    result = BatchOperationResult()
    
    if not ids:
        return result
    
    try:
        for i in range(0, len(ids), batch_size):
            batch_ids = ids[i:i + batch_size]
            
            try:
                if soft_delete:
                    stmt = update(model).where(model.id.in_(batch_ids)).values(
                        deleted_at=datetime.utcnow(),
                        is_active=False
                    )
                else:
                    stmt = delete(model).where(model.id.in_(batch_ids))
                
                db.execute(stmt)
                db.commit()
                
                for record_id in batch_ids:
                    result.add_success(record_id)
                    
            except Exception as e:
                db.rollback()
                logger.error(f"Batch delete failed for batch {i}: {e}")
                
                for record_id in batch_ids:
                    result.add_error(record_id, str(e))
    
    except Exception as e:
        logger.error(f"Batch delete failed: {e}")
    
    return result


def bulk_attendance_punches(
    db: Session,
    organization_id: int,
    punches: List[Dict[str, Any]]
) -> BatchOperationResult:
    """
    Bulk insert attendance punches with conflict handling
    Optimized for high-volume attendance marking
    """
    from models import Attendance
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    
    result = BatchOperationResult()
    
    if not punches:
        return result
    
    try:
        # Use PostgreSQL-specific INSERT ... ON CONFLICT
        stmt = pg_insert(Attendance).values(punches)
        
        stmt = stmt.on_conflict_do_nothing(
            index_elements=['employee_id', 'date', 'organization_id']
        )
        
        db.execute(stmt)
        db.commit()
        
        for punch in punches:
            result.add_success(punch.get("id"))
    
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk attendance punches failed: {e}")
    
    return result


def bulk_notification_create(
    db: Session,
    notifications: List[Dict[str, Any]],
    batch_size: int = 500
) -> BatchOperationResult:
    """
    Bulk create notifications for broadcast/marketing
    """
    from models import Notification
    
    return batch_insert(db, Notification, notifications, batch_size=batch_size, ignore_duplicates=True)


def bulk_employee_status_update(
    db: Session,
    employee_ids: List[int],
    status: str,
    updated_by: int
) -> BatchOperationResult:
    """
    Bulk update employee status (activation, deactivation, etc.)
    """
    result = BatchOperationResult()
    
    if not employee_ids:
        return result
    
    try:
        stmt = update(Employee).where(
            Employee.id.in_(employee_ids),
            Employee.deleted_at.is_(None)
        ).values(
            status=status,
            updated_at=datetime.utcnow()
        )
        
        db.execute(stmt)
        db.commit()
        
        for emp_id in employee_ids:
            result.add_success(emp_id)
    
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk employee status update failed: {e}")
    
    return result
