"""
Advanced Redis caching strategy with cache warming for HRMS
"""
import json
import logging
from typing import Any, Optional, Callable, Dict, List
from datetime import datetime, timedelta
from functools import wraps

from core.cache import get_redis, make_key, tenant_cache_key

logger = logging.getLogger(__name__)


class CacheStrategy:
    """Defines TTL and invalidation rules for different data types"""
    
    # Static data - rarely changes
    MASTER_DATA_TTL = 3600 * 24  # 24 hours
    LOOKUP_DATA_TTL = 3600 * 12  # 12 hours
    
    # Semi-static data
    ORG_SETTINGS_TTL = 3600 * 2  # 2 hours
    DEPARTMENT_TTL = 3600 * 4    # 4 hours
    
    # Dynamic data
    DASHBOARD_TTL = 300          # 5 minutes
    REPORTS_TTL = 600            # 10 minutes
    NOTIFICATIONS_TTL = 60       # 1 minute
    
    # User-specific
    USER_PERMISSIONS_TTL = 1800  # 30 minutes
    LEAVE_BALANCE_TTL = 300      # 5 minutes
    
    # Heavy queries
    PAYROLL_SUMMARY_TTL = 1800   # 30 minutes
    ATTENDANCE_REPORT_TTL = 600  # 10 minutes


def cache_response(
    ttl: int,
    namespace: str = "api",
    tenant_key: bool = True,
    user_key: bool = False,
    key_prefix: str = ""
):
    """
    Decorator for caching API responses with advanced key generation
    
    Args:
        ttl: Time to live in seconds
        namespace: Cache namespace for grouping
        tenant_key: Include tenant/organization ID in cache key
        user_key: Include user ID in cache key (for user-specific data)
        key_prefix: Custom prefix for cache key
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            client = get_redis()
            if client is None:
                return func(*args, **kwargs)
            
            try:
                # Build cache key
                key_parts = [key_prefix or func.__name__]
                
                if tenant_key:
                    tenant_id = kwargs.get("tenant_id") or kwargs.get("organization_id")
                    if tenant_id is None and "current_user" in kwargs:
                        user = kwargs["current_user"]
                        tenant_id = getattr(user, "organization_id", None)
                    if tenant_id:
                        key_parts.append(f"t:{tenant_id}")
                
                if user_key and "current_user" in kwargs:
                    key_parts.append(f"u:{kwargs['current_user'].id}")
                
                # Add function arguments to key
                for arg in args:
                    if hasattr(arg, '__dict__'):
                        key_parts.append(str(arg.id) if hasattr(arg, 'id') else str(arg))
                    else:
                        key_parts.append(str(arg))
                
                cache_key = make_key(namespace, ":".join(key_parts))
                
                # Try to get from cache
                cached = client.get(cache_key)
                if cached is not None:
                    try:
                        return json.loads(cached)
                    except (json.JSONDecodeError, TypeError):
                        return cached
                
                # Execute function
                result = func(*args, **kwargs)
                
                # Cache the result
                if result is not None:
                    try:
                        client.setex(cache_key, ttl, json.dumps(result, default=str))
                    except Exception as e:
                        logger.warning(f"Cache set failed for {cache_key}: {e}")
                
                return result
            except Exception as e:
                logger.error(f"Cache error: {e}")
                return func(*args, **kwargs)
        
        return wrapper
    return decorator


class CacheWarmer:
    """Warms up cache for frequently accessed data"""
    
    def __init__(self):
        self.warming_tasks = []
    
    def register(self, func: Callable, *args, **kwargs):
        """Register a cache warming function"""
        self.warming_tasks.append((func, args, kwargs))
    
    async def warm_all(self):
        """Execute all cache warming tasks"""
        import asyncio
        
        async def warm_task(func, args, kwargs):
            try:
                if asyncio.iscoroutinefunction(func):
                    await func(*args, **kwargs)
                else:
                    func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Cache warming failed for {func.__name__}: {e}")
        
        tasks = [warm_task(func, args, kwargs) for func, args, kwargs in self.warming_tasks]
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"Cache warming completed: {len(tasks)} tasks")


# Global cache warmer instance
cache_warmer = CacheWarmer()


def invalidate_tenant_cache_on_change(tenant_id_field: str = "organization_id"):
    """
    Decorator that automatically invalidates tenant cache on data changes
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            result = func(*args, **kwargs)
            
            # Get tenant ID from kwargs or first arg
            tenant_id = kwargs.get(tenant_id_field)
            if tenant_id is None and args:
                first_arg = args[0]
                if hasattr(first_arg, tenant_id_field):
                    tenant_id = getattr(first_arg, tenant_id_field)
            
            # Invalidate cache
            if tenant_id:
                from core.cache import invalidate_tenant_cache
                try:
                    invalidate_tenant_cache(tenant_id, func.__module__.split('.')[-1])
                except Exception as e:
                    logger.warning(f"Cache invalidation failed: {e}")
            
            return result
        return wrapper
    return decorator


# Pre-warming functions for common queries
def warm_employee_cache(tenant_id: int, db_session):
    """Pre-cache employee lists"""
    from models import Employee
    from sqlalchemy.orm import Session
    
    if isinstance(db_session, Session):
        employees = db_session.query(Employee).filter(
            Employee.organization_id == tenant_id,
            Employee.deleted_at.is_(None)
        ).limit(1000).all()
        
        client = get_redis()
        if client:
            cache_key = tenant_cache_key(tenant_id, "employees", "list:all")
            try:
                client.setex(cache_key, CacheStrategy.DASHBOARD_TTL, json.dumps([e.to_dict() for e in employees], default=str))
            except Exception:
                pass


def warm_dashboard_cache(tenant_id: int, db_session):
    """Pre-cache dashboard statistics"""
    from sqlalchemy import func
    from models import Employee, Attendance, LeaveApplication, Payroll
    
    if not isinstance(db_session, Session):
        return
    
    stats = {
        "total_employees": db_session.query(func.count(Employee.id)).filter(
            Employee.organization_id == tenant_id,
            Employee.deleted_at.is_(None)
        ).scalar() or 0,
        "present_today": db_session.query(func.count(Attendance.id)).filter(
            Attendance.organization_id == tenant_id,
            Attendance.deleted_at.is_(None),
            Attendance.date == datetime.utcnow().date(),
            Attendance.status == "present"
        ).scalar() or 0,
        "pending_leaves": db_session.query(func.count(LeaveApplication.id)).filter(
            LeaveApplication.organization_id == tenant_id,
            LeaveApplication.deleted_at.is_(None),
            LeaveApplication.status == "pending"
        ).scalar() or 0,
    }
    
    client = get_redis()
    if client:
        cache_key = tenant_cache_key(tenant_id, "dashboard", "stats")
        try:
            client.setex(cache_key, CacheStrategy.DASHBOARD_TTL, json.dumps(stats, default=str))
        except Exception:
            pass


def warm_lookup_cache(db_session):
    """Pre-cache lookup/master data"""
    from models import LookupCategory, LookupValue
    
    if not isinstance(db_session, Session):
        return
    
    categories = db_session.query(LookupCategory).filter(
        LookupCategory.deleted_at.is_(None)
    ).all()
    
    client = get_redis()
    if client:
        cache_key = make_key("master_data", "categories")
        try:
            client.setex(cache_key, CacheStrategy.MASTER_DATA_TTL, json.dumps([c.to_dict() for c in categories], default=str))
        except Exception:
            pass
