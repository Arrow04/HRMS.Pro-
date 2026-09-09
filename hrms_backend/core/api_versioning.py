"""
API Versioning middleware and utilities
Supports version negotiation via headers and URL prefixes
"""
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class APIVersionMiddleware(BaseHTTPMiddleware):
    """API versioning via X-API-Version header"""
    
    def __init__(self, app, default_version: str = "1.0", supported_versions: list = None):
        super().__init__(app)
        self.default_version = default_version
        self.supported_versions = supported_versions or ["1.0", "2.0"]
    
    async def dispatch(self, request: Request, call_next):
        version = request.headers.get("X-API-Version", self.default_version)
        
        if version not in self.supported_versions:
            version = self.default_version
        
        request.state.api_version = version
        
        response = await call_next(request)
        response.headers["X-API-Version"] = version
        response.headers["X-API-Supported-Versions"] = ", ".join(self.supported_versions)
        
        return response


def get_api_version(request: Request) -> str:
    """Extract API version from request state"""
    return getattr(request.state, "api_version", "1.0")


class VersionedRouter:
    """Wrapper for versioned API routers"""
    
    def __init__(self, version: str):
        self.version = version
        self.routers = {}
    
    def include_router(self, prefix: str, router, tags: list = None):
        """Include a router with version prefix"""
        versioned_prefix = f"/api/v{self.version.replace('.', '')}/{prefix}"
        # This would be integrated with FastAPI's router inclusion
        logger.info(f"Versioned router: {versioned_prefix}")


# API version routing
API_VERSION_ROUTERS = {
    "1.0": "/api/v1",
    "2.0": "/api/v2",
}
