#!/usr/bin/env python3
"""HRMS Enterprise API v2.0.0 - Main Application Entry Point"""

from __future__ import annotations

import base64
import calendar
import collections
import io
import json
import logging
import logging.handlers
import math
import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union

import redis
import structlog
import uvicorn
from dateutil import parser as dateparser
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from sqlalchemy import case, event, func, inspect, or_, text
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, with_loader_criteria
from structlog import configure as structlog_configure
from structlog.dev import ConsoleRenderer
from structlog.processors import JSONRenderer, TimeStamper, format_exc_info
from structlog.stdlib import BoundLogger, LoggerFactory, add_log_level, add_logger_name, filter_by_level
from structlog.types import Processor

from controllers.dynamic_permissions_controller import router as dynamic_permissions_router
from controllers.employee_controller import router as employee_controller_router
from controllers.permissions_controller import router as permissions_controller_router
from controllers.superadmin_controller import router as superadmin_controller_router
from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.datetime_utils import ist_now_naive
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache, ping_redis
from core.config import settings
from core.shared import logger
from database import Base, SessionLocal, engine, get_db
from models import (
    Attendance,
    AttendanceAuditLog,
    AttendancePolicy,
    AuditLog,
    Asset,
    Branch,
    Candidate,
    Company,
    Department,
    Designation,
    Employee,
    EmployeeLifecycleEvent,
    Expense,
    Holiday,
    Interview,
    JobOpening,
    LeaveApplication,
    LeaveApprovalHistory,
    LeaveBalance,
    LeaveType,
    Notification,
    Organization,
    Payroll,
    PayrollComponent,
    PayrollPolicy,
    PerformanceReview,
    ReportExecutionLog,
    SalaryTemplate,
    Shift,
    StatutorySetting,
    TaxRegime,
    TaxSlab,
    User,
    ExitRecord,
    ArchivedEmployee,
)
from routers.ai_router import router as ai_router
from routers.auth import router as auth_router_inline
from routers.chatbot import router as chatbot_router
from routers.employees import router as employees_router
from routers.employee_assignments import router as assignments_router
from routers.employee_transfers import router as transfers_router
from routers.health import router as health_router
from routers.lookup import router as lookup_router
from routers.master_data import router as master_data_router
from routers.organizations import router as organizations_router
from routers.settings import router as settings_router
from routers.shifts import router as shifts_router
from routers.payroll_config import router as payroll_config_router
from routers.payroll_templates import router as payroll_templates_router
from routers.investment_declarations import router as investment_declarations_router
from routers.accounting import router as accounting_router
from routers.anomaly import router as anomaly_router
from routers.superadmin import router as superadmin_router
from routers.users import router as users_router
from routers.recruitment import router as recruitment_router
from routers.custom_fields import router as custom_fields_router
from routers.reports import router as reports_router
from routers.automation import router as automation_router
from routers.compliance import router as compliance_router
from routers.ai_automation_tasks import router as ai_automation_router
from routers.companies import router as companies_router
from routers.leaves import router as leaves_router
from routers.payroll import router as payroll_router
from routers.notifications import router as notifications_router
from routers.assets import router as assets_router
from routers.attendance import router as attendance_router
from routers.expenses import router as expenses_router
from routers.recruitment_inline import router as recruitment_inline_router
from routers.performance import router as performance_router
from routers.holidays import router as holidays_router
from routers.dashboard import router as dashboard_router
from routers.reports_inline import router as reports_inline_router
from routers.settings_inline import router as settings_inline_router
from routers.employee_lifecycle import router as employee_lifecycle_router
from routers.billing import router as billing_router
from routers.maintenance import router as maintenance_router
from routers.policies import router as policies_router
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

load_dotenv()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

def _validate_production_config():
    """Fail fast on startup if critical production env vars are missing or insecure."""
    if settings.APP_ENV != "production":
        return

    errors = []

    jwt_key = os.getenv("JWT_SECRET_KEY", "")
    if not jwt_key or jwt_key in ("your-secret-key-change-in-production", "hrms_dev_secret_key_change_in_prod", "CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING"):
        errors.append("JWT_SECRET_KEY must be set to a strong, unique value in production")

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        errors.append("DATABASE_URL must be set in production (PostgreSQL required)")
    elif "sqlite" in db_url:
        errors.append("DATABASE_URL must point to PostgreSQL in production, not SQLite")

    cors = os.getenv("CORS_ORIGINS", "")
    if not cors or cors == "*":
        errors.append("CORS_ORIGINS must be set to specific allowed origins in production (not '*')")

    allowed_hosts = os.getenv("ALLOWED_HOSTS", "")
    if not allowed_hosts:
        errors.append("ALLOWED_HOSTS must be set in production")

    admin_pw = os.getenv("ADMIN_PASSWORD", "")
    if not admin_pw or admin_pw == "CHANGE_ME_TO_A_STRONG_PASSWORD":
        errors.append("ADMIN_PASSWORD must be set to a strong password in production")

    if errors:
        msg = "\n".join(f"  - {e}" for e in errors)
        raise RuntimeError(
            f"Production configuration validation failed:\n{msg}\n\n"
            f"Fix these issues in your .env file or environment variables."
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    logger.info("Starting HRMS Enterprise API v2.0.0")
    _validate_production_config()
    from database import init_db
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error("Database initialization failed", error=str(e))

    # Reconcile leave_types with LEAVE_TYPE rows already stored in master data.
    try:
        from database import SessionLocal as _SL
        from routers.master_data import sync_leave_types_from_master_data
        with _SL() as _db:
            sync_leave_types_from_master_data(_db)
        logger.info("Leave types reconciled with master data")
    except Exception as e:
        logger.warning("Leave type reconciliation failed", error=str(e))

    try:
        from core.audit import setup_auditing
        setup_auditing()
        logger.info("Auditing setup complete")
    except Exception as e:
        logger.error("Auditing setup failed", error=str(e))

    try:
        from core.cache import ping_redis
        if ping_redis():
            logger.info("Redis connected (shared pool)")
        else:
            logger.warning("Redis unavailable - caching disabled")
    except Exception as e:
        logger.warning("Redis unavailable - caching disabled", error=str(e))

    async def _selfie_retention_loop():
        from core.selfie_storage import SELFIE_PURGE_INTERVAL_HOURS, run_selfie_retention_job

        await asyncio.sleep(120)
        interval = max(1, SELFIE_PURGE_INTERVAL_HOURS) * 3600
        while True:
            try:
                run_selfie_retention_job()
            except Exception as exc:
                logger.warning("Selfie retention job failed", error=str(exc))
            await asyncio.sleep(interval)

    async def _exited_document_retention_loop():
        from core.document_retention import (
            IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT,
            purge_exited_employee_documents,
        )
        from database import SessionLocal

        if IDENTITY_DOC_RETENTION_YEARS_AFTER_EXIT <= 0:
            return
        await asyncio.sleep(300)
        interval = 30 * 24 * 3600  # monthly
        while True:
            try:
                with SessionLocal() as db:
                    purge_exited_employee_documents(db)
            except Exception as exc:
                logger.warning("Exited document retention job failed", error=str(exc))
            await asyncio.sleep(interval)

    retention_task = asyncio.create_task(_selfie_retention_loop())
    exited_docs_task = asyncio.create_task(_exited_document_retention_loop())

    yield

    retention_task.cancel()
    exited_docs_task.cancel()
    try:
        await retention_task
    except asyncio.CancelledError:
        pass
    try:
        await exited_docs_task
    except asyncio.CancelledError:
        pass

    logger.info("Shutting down HRMS Enterprise API")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="HRMS Enterprise API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Serve uploaded files (employee photos, expense receipts, etc.)
_uploads_dir = os.path.join(os.path.dirname(__file__), "routers", "uploads")
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")

# Serve static billing assets (payment QR codes, logos)
_static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(_static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

cors_raw = settings.CORS_ORIGINS if settings.APP_ENV == "production" else "*"
if isinstance(cors_raw, str):
    cors_origins = [o.strip().rstrip("/") for o in cors_raw.split(",") if o.strip()] if cors_raw != "*" else ["*"]
else:
    cors_origins = [o.rstrip("/") for o in cors_raw] if isinstance(cors_raw, list) else cors_raw
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Enterprise Middleware (rate limiting, request IDs, security headers, tenant context)
# ---------------------------------------------------------------------------
# Each middleware degrades gracefully when Redis/aux services are unavailable,
# so this is safe to enable in all environments.
try:
    from core.middleware import (
        RateLimitMiddleware,
        RequestIDMiddleware,
        SecurityHeadersMiddleware,
        TenantContextMiddleware,
    )
    from core.config import settings as _mw_settings

    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(TenantContextMiddleware)
    if _mw_settings.APP_ENV == "production" or os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true":
        default_limit = int(os.getenv("RATE_LIMIT_REQUESTS", "300"))
        window = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
        app.add_middleware(RateLimitMiddleware, default_limit=default_limit, window=window)
except Exception as e:
    logger.warning(f"Enterprise middleware not enabled: {e}")


# ---------------------------------------------------------------------------
# Exception Handlers (most specific FIRST)
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    logger.exception("Unhandled exception", path=request.url.path, method=request.method)
    with open(r"D:\hrmsnew\hrms_backend\crash_debug.log", "a", encoding="utf-8") as f:
        f.write(f"GLOBAL HANDLER: path={request.url.path} exc={exc}\n{tb}\n")
    with open(r"D:\hrmsnew\hrms_backend\crash_debug.log", "a", encoding="utf-8") as f:
        f.write(f"GLOBAL_HANDLER: path={request.url.path} exc={exc!r}\n{tb}\n")
    return JSONResponse(
        status_code=500,
        content={"detail": f"GLOBAL_ERR: {str(exc)}", "path": request.url.path, "version": "v3"},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Validation error", path=request.url.path, errors=exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation error", "errors": exc.errors()},
    )


# ---------------------------------------------------------------------------
# Request Logging Middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Skip logging for health checks, static files, and docs
    path = request.url.path
    if path.startswith("/health") or path.startswith("/uploads") or path.startswith("/static") or path.startswith("/docs") or path.startswith("/openapi"):
        return await call_next(request)
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    logger.info(
        "Request",
        method=request.method,
        path=path,
        status=response.status_code,
        elapsed_ms=round(elapsed * 1000, 2),
    )
    return response


# ---------------------------------------------------------------------------
# Health Check Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": ist_now_naive().isoformat(), "service": "hrms-api"}


@app.get("/health/db")
async def db_health_check(db: Session = Depends(get_db)):
    try:
        result = db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {e}")


@app.get("/health/ready")
async def readiness_check(db: Session = Depends(get_db)):
    """Combined Postgres + Redis readiness for load balancers."""
    checks = {"postgres": "unknown", "redis": "unknown"}
    try:
        db.execute(text("SELECT 1"))
        checks["postgres"] = "connected"
    except Exception as exc:
        checks["postgres"] = str(exc)
    checks["redis"] = "connected" if ping_redis() else "degraded"
    healthy = checks["postgres"] == "connected"
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "healthy" if healthy else "degraded",
            "checks": checks,
            "timestamp": ist_now_naive().isoformat(),
        },
    )


@app.get("/health/redis")
async def redis_health_check():
    stats = get_cache_stats()
    code = 200 if stats.get("status") == "connected" else 503
    return JSONResponse(status_code=code, content=stats)


from core.context import current_user_ctx as _current_user_ctx
_request_ctx: ContextVar[dict] = ContextVar("_request_ctx", default={})


@event.listens_for(Session, "do_orm_execute")
def _tenant_isolation(execute_state: ORMExecuteState):
    """Auto-filter queries by organization_id for multi-tenant isolation."""
    if execute_state.is_column_load or execute_state.is_relationship_load:
        return
    if not execute_state.is_orm_statement:
        return
    user = _current_user_ctx.get()
    mapper = getattr(execute_state, "mapper", None)
    if not mapper:
        return
    if user and user.role != "superadmin" and hasattr(mapper.class_, "organization_id"):
        execute_state.statement = execute_state.statement.where(
            mapper.class_.organization_id == user.organization_id
        )



@event.listens_for(Session, "after_flush")
def _after_flush(session: Session, flush_context):
    """Track new/dirty/deleted objects for post-commit audit."""
    tracked = getattr(session, "_audit_entries", None)
    if tracked is None:
        session._audit_entries = []


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session):
    """Process audit entries after successful commit."""
    entries = getattr(session, "_audit_entries", [])
    session._audit_entries = []


# ---------------------------------------------------------------------------
# Router Includes
# ---------------------------------------------------------------------------

app.include_router(health_router, prefix="/api/health", tags=["Health"])
app.include_router(auth_router_inline, prefix="/api/auth", tags=["Auth"])
app.include_router(transfers_router, prefix="/api/employees/transfers", tags=["Transfers"])
app.include_router(assignments_router, prefix="/api/employees/assignments", tags=["Assignments"])
app.include_router(employees_router, prefix="/api/employees", tags=["Employees"])
app.include_router(organizations_router, prefix="/api", tags=["Organizations"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(master_data_router, prefix="/api/master-data", tags=["Master Data"])
app.include_router(shifts_router, prefix="/api/shifts", tags=["Shifts"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])
app.include_router(superadmin_router, prefix="/api/superadmin/legacy", tags=["SuperAdmin"])
app.include_router(superadmin_controller_router, prefix="/api/superadmin", tags=["SuperAdmin"])
app.include_router(employee_controller_router, prefix="/api/employee-controller", tags=["EmployeeController"])
app.include_router(permissions_controller_router, prefix="/api/permissions", tags=["Permissions"])
app.include_router(dynamic_permissions_router, prefix="/api/dynamic-permissions", tags=["DynamicPermissions"])
app.include_router(chatbot_router, prefix="/api/chatbot", tags=["Chatbot"])
app.include_router(lookup_router, prefix="/api/lookup", tags=["Lookup"])
app.include_router(ai_router, prefix="/api", tags=["AI"])
app.include_router(payroll_config_router, tags=["Payroll Configuration"])
app.include_router(payroll_templates_router, tags=["Payroll Templates"])
app.include_router(investment_declarations_router, tags=["Investment Declarations"])
app.include_router(accounting_router, tags=["Accounting"])
app.include_router(anomaly_router)
app.include_router(recruitment_router)
app.include_router(custom_fields_router)
app.include_router(reports_router)
app.include_router(automation_router)
app.include_router(compliance_router)
app.include_router(ai_automation_router)

app.include_router(companies_router)
app.include_router(leaves_router)
app.include_router(payroll_router)
app.include_router(notifications_router)
app.include_router(assets_router)
app.include_router(attendance_router)
app.include_router(expenses_router)
app.include_router(recruitment_inline_router)
app.include_router(performance_router)
app.include_router(holidays_router)
app.include_router(dashboard_router)
app.include_router(reports_inline_router)
app.include_router(settings_inline_router)
app.include_router(employee_lifecycle_router)
app.include_router(billing_router)
app.include_router(maintenance_router)
app.include_router(policies_router)

# --- Test Route ---

@app.get("/test")
def test():
    if settings.APP_ENV == "production":
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "ok", "message": "API is running", "environment": settings.APP_ENV}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
