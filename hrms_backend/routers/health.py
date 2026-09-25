"""
Health check and readiness endpoints for enterprise monitoring
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from database import get_db
from sqlalchemy.orm import Session
import redis
import os
import time
from core.datetime_utils import ist_now_naive

router = APIRouter(tags=["health"])

# Lazy Redis access via the shared timeout-bounded pool (never at import:
# an unreachable Redis must not block app startup).
def _redis_client():
    try:
        from core.cache import get_redis
        return get_redis()
    except Exception:
        return None

@router.get("/health")
async def health_check():
    """Basic health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": ist_now_naive().isoformat(),
        "service": "hrms-api"
    }

@router.get("/health/ready")
async def readiness_check(db: Session = Depends(get_db)):
    """Readiness check - verifies database and Redis connectivity"""
    checks = {
        "database": False,
        "redis": False,
        "timestamp": ist_now_naive().isoformat()
    }
    
    # Check database
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception as e:
        checks["database_error"] = str(e)
    
    # Check Redis
    try:
        redis_client = _redis_client()
        if not redis_client:
            raise RuntimeError("Redis unavailable")
        redis_client.ping()
        checks["redis"] = True
    except Exception as e:
        checks["redis_error"] = str(e)
    
    # Overall status
    checks["status"] = "ready" if all([checks["database"], checks["redis"]]) else "not_ready"
    
    return checks

@router.get("/health/live")
async def liveness_check():
    """Liveness check - indicates if the service is running"""
    return {
        "status": "alive",
        "timestamp": ist_now_naive().isoformat()
    }

@router.get("/health/detailed")
async def detailed_health_check(db: Session = Depends(get_db)):
    """Detailed health check with metrics"""
    start_time = time.time()
    
    # Database health
    db_health = {"status": "unknown"}
    try:
        result = db.execute(text("SELECT COUNT(*) FROM employees"))
        employee_count = result.scalar()
        db_health = {
            "status": "healthy",
            "employee_count": employee_count,
            "response_time_ms": round((time.time() - start_time) * 1000, 2)
        }
    except Exception as e:
        db_health = {
            "status": "unhealthy",
            "error": str(e)
        }
    
    # Redis health
    redis_health = {"status": "unknown"}
    try:
        redis_client = _redis_client()
        if not redis_client:
            raise RuntimeError("Redis unavailable")
        redis_start = time.time()
        redis_client.ping()
        info = redis_client.info()
        redis_health = {
            "status": "healthy",
            "connected_clients": info.get("connected_clients", 0),
            "used_memory_human": info.get("used_memory_human", "unknown"),
            "response_time_ms": round((time.time() - redis_start) * 1000, 2)
        }
    except Exception as e:
        redis_health = {
            "status": "unhealthy",
            "error": str(e)
        }
    
    return {
        "status": "healthy" if db_health["status"] == "healthy" and redis_health["status"] == "healthy" else "degraded",
        "timestamp": ist_now_naive().isoformat(),
        "checks": {
            "database": db_health,
            "redis": redis_health
        },
        "version": "2.0.0"
    }
