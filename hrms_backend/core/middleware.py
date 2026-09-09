"""
Enterprise-grade middleware for FastAPI
"""
import json as _json
import logging
import os
import time
import uuid
from typing import Callable, Optional

from fastapi import Request, Response
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware

from core.cache import get_redis, make_key
from core.config import settings

logger = logging.getLogger(__name__)

_PLAN_RATE_LIMITS = {
    "free": 100,
    "trial": 50,
    "pro": 500,
    "enterprise": 2000,
}


def _get_user_plan_limit(user_id: Optional[int]) -> int:
    if user_id is None:
        return 0
    rc = get_redis()
    cache_key = make_key("rate", "plan", str(user_id))
    if rc is not None:
        try:
            cached = rc.get(cache_key)
            if cached is not None:
                return int(cached)
        except Exception:
            pass

    limit = 0
    try:
        from sqlalchemy.orm import Session as _Session
        from database import SessionLocal as _SL
        from models import User, Subscription, Plan
        db: _Session = _SL()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.role == "superadmin":
                limit = -1
            elif user:
                sub = (
                    db.query(Subscription)
                    .filter(Subscription.organization_id == user.organization_id, Subscription.deleted_at.is_(None))
                    .order_by(Subscription.created_at.desc())
                    .first()
                )
                if sub and sub.plan:
                    limit = _PLAN_RATE_LIMITS.get((sub.plan.name or "").lower(), 0) or 0
        finally:
            db.close()
    except Exception:
        limit = 0

    if rc is not None and limit > 0:
        try:
            rc.setex(cache_key, 300, str(limit))
        except Exception:
            pass
    return limit


def _extract_user_id_from_token(request: Request) -> Optional[int]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        return int(user_id) if user_id is not None else None
    except Exception:
        return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis-based rate limiting middleware with per-user plan limits"""

    def __init__(self, app, default_limit: int = 100, window: int = 60):
        super().__init__(app)
        self.default_limit = default_limit
        self.window = window

    async def dispatch(self, request: Request, call_next: Callable):
        client_ip = request.client.host if request.client else "unknown"
        token_user_id = _extract_user_id_from_token(request)
        state_user_id = getattr(request.state, "user_id", None)
        user_id = token_user_id or state_user_id

        if user_id is not None:
            plan_limit = _get_user_plan_limit(user_id)
            if plan_limit == -1:
                return await call_next(request)
            if plan_limit > 0:
                key = make_key("rate", "user", str(user_id))
                limit = plan_limit
            else:
                key = make_key("rate", client_ip, str(user_id) if user_id else "anon")
                limit = self.default_limit
        else:
            key = make_key("rate", client_ip, "anon")
            limit = self.default_limit

        current = 0
        rc = get_redis()
        if rc is not None:
            try:
                current = rc.incr(key)
                if current == 1:
                    rc.expire(key, self.window)

                if current > limit:
                    return Response(
                        content=_json.dumps({"detail": "Rate limit exceeded"}),
                        status_code=429,
                        media_type="application/json",
                    )
            except Exception as exc:
                logger.error("Rate limiting error: %s", exc)

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - current))
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + self.window)

        return response

class RequestIDMiddleware(BaseHTTPMiddleware):
    """Add unique request ID for tracing"""
    
    async def dispatch(self, request: Request, call_next: Callable):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        
        return response

class PerformanceMiddleware(BaseHTTPMiddleware):
    """Track request performance metrics"""
    
    async def dispatch(self, request: Request, call_next: Callable):
        start_time = time.time()
        
        response = await call_next(request)
        
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        
        # Log slow requests
        if process_time > 1.0:
            logger.warning(f"Slow request: {request.method} {request.url.path} took {process_time:.3f}s")
        
        return response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers for enterprise security"""
    
    async def dispatch(self, request: Request, call_next: Callable):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        return response

class TenantContextMiddleware(BaseHTTPMiddleware):
    """Extract tenant_id from headers/token and inject it into request context"""
    
    async def dispatch(self, request: Request, call_next: Callable):
        tenant_id = request.headers.get("X-Tenant-ID")
        company_id_header = request.headers.get("X-Company-Id")
        request.state.tenant_id = tenant_id
        request.state.company_id_header = int(company_id_header) if company_id_header and company_id_header.isdigit() else None
        
        response = await call_next(request)
        return response


class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    """Timeout slow requests to prevent resource exhaustion"""
    
    def __init__(self, app, timeout: float = 30.0):
        super().__init__(app)
        self.timeout = timeout
    
    async def dispatch(self, request: Request, call_next: Callable):
        import asyncio
        try:
            response = await asyncio.wait_for(call_next(request), timeout=self.timeout)
            return response
        except asyncio.TimeoutError:
            request_id = getattr(request.state, "request_id", None)
            return Response(
                content=_json.dumps({"detail": "Request timeout", "request_id": request_id}),
                status_code=504,
                media_type="application/json"
            )


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    """Basic input sanitization for common attack patterns"""
    
    async def dispatch(self, request: Request, call_next: Callable):
        if request.method in ("POST", "PUT", "PATCH"):
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body = await request.body()
                    if body:
                        body_str = body.decode("utf-8", errors="replace")
                        if "<script" in body_str.lower() or "javascript:" in body_str.lower():
                            return Response(
                                content=_json.dumps({"detail": "Invalid input detected"}),
                                status_code=400,
                                media_type="application/json"
                            )
                except Exception:
                    pass
        
        response = await call_next(request)
        return response


class CompressionMiddleware(BaseHTTPMiddleware):
    """Brotli/Gzip compression for responses"""
    
    def __init__(self, app, minimum_size: int = 500):
        super().__init__(app)
        self.minimum_size = minimum_size
    
    async def dispatch(self, request: Request, call_next: Callable):
        response = await call_next(request)
        
        if response.status_code >= 400:
            return response
        
        accept_encoding = request.headers.get("accept-encoding", "")
        
        if "br" in accept_encoding and hasattr(response, "body"):
            try:
                import brotli
                body = response.body
                if len(body) >= self.minimum_size:
                    compressed = brotli.compress(body)
                    response.headers["Content-Encoding"] = "br"
                    response.headers["Content-Length"] = str(len(compressed))
                    response.body = compressed
                    response.headers["Vary"] = "Accept-Encoding"
            except ImportError:
                pass
        
        return response


def setup_middleware(app):
    """Setup all enterprise middleware"""
    
    # CORS - restrict in production
    env = os.getenv("APP_ENV", "development")
    cors_origins_env = os.getenv("CORS_ORIGINS", "")
    if env == "production":
        cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()] if cors_origins_env else []
        if not cors_origins:
            logger.warning("CORS_ORIGINS not set in production! Falling back to localhost only.")
            cors_origins = ["http://localhost:5173", "http://localhost:3000"]
    else:
        cors_origins = ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Gzip compression (Disabled due to python 3.14 bug)
    # app.add_middleware(GZipMiddleware, minimum_size=1000)
    
    # Trusted hosts - restrict in production
    if env == "production":
        allowed_hosts = os.getenv("ALLOWED_HOSTS", "").split(",") if os.getenv("ALLOWED_HOSTS") else ["localhost", "127.0.0.1"]
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
    else:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
    
    # Critical middleware (always enabled)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    # Performance monitoring (enable selectively in production)
    if os.getenv("ENABLE_PERFORMANCE_MIDDLEWARE", "false").lower() == "true":
        app.add_middleware(PerformanceMiddleware)
    
    # Enable Tenant scoping middleware
    app.add_middleware(TenantContextMiddleware)
    
    # Request timeout
    timeout = float(os.getenv("REQUEST_TIMEOUT", "30.0"))
    app.add_middleware(RequestTimeoutMiddleware, timeout=timeout)
    
    # Input sanitization
    app.add_middleware(InputSanitizationMiddleware)
    
    # Response compression
    app.add_middleware(CompressionMiddleware, minimum_size=500)
    
    # API versioning
    app.add_middleware(APIVersionMiddleware, default_version="1.0", supported_versions=["1.0", "2.0"])
    
    # Rate limiting - enabled in production
    if os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true":
        default_limit = int(os.getenv("RATE_LIMIT_REQUESTS", "200"))
        window = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
        app.add_middleware(RateLimitMiddleware, default_limit=default_limit, window=window)
