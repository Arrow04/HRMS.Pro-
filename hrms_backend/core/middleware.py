"""
Enterprise-grade middleware for FastAPI
"""
import json as _json
import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from core.cache import get_redis, make_key

logger = logging.getLogger(__name__)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis-based rate limiting middleware"""
    
    def __init__(self, app, default_limit: int = 100, window: int = 60):
        super().__init__(app)
        self.default_limit = default_limit
        self.window = window
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Generate rate limit key
        client_ip = request.client.host if request.client else "unknown"
        user_id = getattr(request.state, 'user_id', None)
        key = make_key("rate", client_ip, str(user_id) if user_id else "anon")
        
        # Check rate limit
        current = 0
        rc = get_redis()
        if rc is not None:
            try:
                current = rc.incr(key)
                if current == 1:
                    rc.expire(key, self.window)
                
                if current > self.default_limit:
                    return Response(
                        content=_json.dumps({"detail": "Rate limit exceeded"}),
                        status_code=429,
                        media_type="application/json"
                    )
            except Exception as e:
                logger.error(f"Rate limiting error: {e}")
        
        # Add rate limit headers
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.default_limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, self.default_limit - current))
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
        # Extract from header for superadmin API calls or from token via auth middleware
        tenant_id = request.headers.get("X-Tenant-ID")
        
        # Extract company filter from frontend header
        company_id_header = request.headers.get("X-Company-Id")
        request.state.tenant_id = tenant_id
        request.state.company_id_header = int(company_id_header) if company_id_header and company_id_header.isdigit() else None
        
        response = await call_next(request)
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
    
    # Rate limiting - enabled in production
    if os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true":
        default_limit = int(os.getenv("RATE_LIMIT_REQUESTS", "200"))
        window = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
        app.add_middleware(RateLimitMiddleware, default_limit=default_limit, window=window)
