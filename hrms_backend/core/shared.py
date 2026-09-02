"""Shared helpers, logging, and runtime utilities."""
from __future__ import annotations

import logging
import logging.handlers
import math
import os
import time
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

import redis
import structlog
from fastapi import HTTPException, Request
from structlog import configure as structlog_configure
from structlog.dev import ConsoleRenderer
from structlog.processors import JSONRenderer, TimeStamper, format_exc_info
from structlog.stdlib import BoundLogger, LoggerFactory, add_log_level, add_logger_name, filter_by_level
from structlog.types import Processor

from core.auth import get_password_hash
from core.config import settings
from database import SessionLocal
from models import AuditLog, Employee, Organization, User


class RateLimiter:
    """
    In-memory rate limiter as a fallback when Redis is unavailable.
    Tracks request counts per key per time window.
    """
    def __init__(self):
        self._store: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, key: str, max_requests: int = 60, window_seconds: int = 60) -> bool:
        now = time.time()
        timestamps = self._store[key]
        cutoff = now - window_seconds
        self._store[key] = [t for t in timestamps if t > cutoff]
        if len(self._store[key]) >= max_requests:
            return False
        self._store[key].append(now)
        return True


rate_limiter = RateLimiter()


def check_rate_limit(endpoint_type: str = "default"):
    """Endpoint-level rate limiting dependency."""
    def decorator(request: Request):
        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:{endpoint_type}:{client_ip}"
        if not rate_limiter.is_allowed(key):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        return True
    return decorator


_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=_log_level, format="%(message)s")

structlog_configure(
    processors=[
        filter_by_level,
        add_logger_name,
        add_log_level,
        TimeStamper(fmt="iso"),
        JSONRenderer(),
    ],
    context_class=dict,
    logger_factory=LoggerFactory(),
    wrapper_class=BoundLogger,
    cache_logger_on_first_use=True,
)
logger = structlog.get_logger("hrms")

_DEBUG_LOG = r"D:\hrmsnew\hrms_backend\manual_attendance_debug.log"
def _log(msg: str):
    import datetime as _dt
    line = f"[{_dt.datetime.now().isoformat()}] {msg}\n"
    try:
        print(line, end="", flush=True)
    except OSError:
        pass
    try:
        with open(_DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass

if settings.APP_ENV == "production":
    log_dir = os.getenv("LOG_DIR", "logs")
    os.makedirs(log_dir, exist_ok=True)
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename=os.path.join(log_dir, "hrms.log"),
        when="midnight",
        interval=1,
        backupCount=30,
    )
    file_handler.setLevel(_log_level)
    file_handler.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger().addHandler(file_handler)


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine formula to calculate distance between two points in meters."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def save_selfie(
    base64_data: str,
    employee_id: int,
    selfie_type: str = "checkin",
    organization_id: Optional[int] = None,
) -> Optional[str]:
    """Save attendance selfie (compressed, date-partitioned, optional S3)."""
    from core.selfie_storage import save_attendance_selfie

    return save_attendance_selfie(
        base64_data,
        employee_id,
        selfie_type=selfie_type,
        organization_id=organization_id,
    )


async def record_audit_log(
    db: Session,
    user_id: int,
    organization_id: int,
    user_name: str,
    action: str,
    entity_type: str,
    entity_id: str = None,
    changes: str = None,
    ip_address: str = None,
    user_agent: str = None,
):
    """Helper to record an audit log entry."""
    log_entry = AuditLog(
        user_id=user_id,
        organization_id=organization_id,
        user_name=user_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log_entry)
    db.commit()
    return log_entry


def seed_initial_data():
    """Seed initial default organization and admin user."""
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.code == "ENT-CORP").first()
        if not org:
            org = Organization(
                name="Enterprise Corp",
                code="ENT-CORP",
                description="Default enterprise organization",
                status="active",
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            logger.info("Default organization created", org_id=org.id)

        admin = db.query(User).filter(User.deleted_at.is_(None), User.email == "admin@hrms.com").first()
        if not admin:
            admin = User(
                email="admin@hrms.com",
                password_hash=get_password_hash("admin123"),
                full_name="System Admin",
                role="admin",
                organization_id=org.id,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            logger.info("Default admin user created", user_id=admin.id)
    except Exception as e:
        db.rollback()
        logger.error("Failed to seed initial data", error=str(e))
    finally:
        db.close()


def _create_audit_log(
    db: Session,
    current_user: User,
    action: str,
    entity_type: str,
    entity_id: str = None,
    changes: str = None,
    request: Request = None,
):
    """Helper to create an AuditLog entry."""
    client_info = {}
    if request:
        client_info = {
            "ip_address": request.client.host if request.client else "Unknown",
            "user_agent": request.headers.get("user-agent", "Unknown"),
        }
    log_entry = AuditLog(
        user_id=current_user.id,
        organization_id=current_user.organization_id,
        user_name=current_user.full_name or current_user.email,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes,
        ip_address=client_info.get("ip_address"),
        user_agent=client_info.get("user_agent"),
    )
    db.add(log_entry)
    db.commit()


def _get_employee_id_for_user(db: Session, current_user: User) -> Optional[int]:
    """Helper to get employee ID from current user. Returns None if not found."""
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.user_id == current_user.id).first()
    return emp.id if emp else None

