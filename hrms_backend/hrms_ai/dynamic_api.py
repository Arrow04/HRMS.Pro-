"""
HRMS AI Dynamic API Action Module
Enables the AI to call ANY existing FastAPI endpoint dynamically
This is the KEY to making the AI truly robust - no hardcoding needed
"""
import json
import inspect
from typing import Optional, Dict, Any, List, Callable, Union
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum

from fastapi import FastAPI, Request
from fastapi.routing import APIRoute
from pydantic import BaseModel
from sqlalchemy.orm import Session

from hrms_ai.schemas import AIContext
from hrms_ai.audit import get_ai_audit_logger, AuditEventType, AuditSeverity
from hrms_ai.exceptions import AIActionExecutionError, AIPermissionError


class HTTPMethod(str, Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


@dataclass
class APIEndpoint:
    """Represents a discovered FastAPI endpoint"""
    path: str
    method: HTTPMethod
    name: str
    summary: str
    description: str
    parameters: Dict[str, Any]
    request_body: Optional[Dict[str, Any]] = None
    response_model: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    requires_auth: bool = True
    required_roles: List[str] = field(default_factory=list)


@dataclass
class APICallResult:
    """Result of a dynamic API call"""
    success: bool
    status_code: int
    data: Any = None
    error: Optional[str] = None
    message: str = ""
    endpoint: Optional[str] = None


class DynamicAPIRegistry:
    """
    Discovers and indexes all FastAPI endpoints in the application
    Provides a searchable registry for the AI to find relevant endpoints
    """
    
    def __init__(self, app: Optional[FastAPI] = None):
        self.app = app
        self._endpoints: Dict[str, APIEndpoint] = {}
        self._endpoint_index: Dict[str, List[str]] = {}  # tag/category -> endpoint keys
        self._initialized = False
    
    def initialize(self, app: FastAPI):
        """Initialize the registry by scanning the FastAPI app"""
        self.app = app
        self._scan_routes()
        self._build_index()
        self._initialized = True
    
    def _scan_routes(self):
        """Scan all routes in the FastAPI app"""
        if not self.app:
            return
            
        for route in self.app.routes:
            if not isinstance(route, APIRoute):
                continue
            
            for method in route.methods:
                if method in ("HEAD", "OPTIONS"):
                    continue
                    
                endpoint = self._parse_route(route, method)
                if endpoint:
                    key = f"{method}:{endpoint.path}"
                    self._endpoints[key] = endpoint
    
    def _parse_route(self, route: APIRoute, method: str) -> Optional[APIEndpoint]:
        """Parse a FastAPI route into an APIEndpoint"""
        try:
            # Get endpoint function
            endpoint_func = route.endpoint
            
            # Extract metadata
            summary = route.summary or ""
            description = route.description or ""
            tags = list(route.tags) if route.tags else []
            
            # Parse parameters from function signature
            sig = inspect.signature(endpoint_func)
            parameters = {}
            request_body = None
            
            for param_name, param in sig.parameters.items():
                if param_name in ("request", "db", "current_user", "background_tasks"):
                    continue
                    
                param_info = {
                    "type": "query" if param.kind == inspect.Parameter.POSITIONAL_OR_KEYWORD else "path",
                    "required": param.default == inspect.Parameter.empty,
                }
                
                # Get type annotation
                if param.annotation != inspect.Parameter.empty:
                    param_info["schema"] = self._get_type_schema(param.annotation)
                
                # Check if it's a request body (Pydantic model)
                if hasattr(param.annotation, '__origin__') or (
                    hasattr(param.annotation, '__bases__') and 
                    any('BaseModel' in str(b) for b in param.annotation.__bases__)
                ):
                    request_body = self._get_model_schema(param.annotation)
                    param_info["type"] = "body"
                
                parameters[param_name] = param_info
            
            # Extract path parameters
            path_params = self._extract_path_params(route.path)
            for pp in path_params:
                if pp in parameters:
                    parameters[pp]["type"] = "path"
                    parameters[pp]["required"] = True
            
            # Determine required roles from dependencies
            required_roles = self._extract_required_roles(route)
            
            return APIEndpoint(
                path=route.path,
                method=HTTPMethod(method),
                name=route.name or f"{method}_{route.path}",
                summary=summary,
                description=description,
                parameters=parameters,
                request_body=request_body,
                response_model=self._get_response_model(route),
                tags=tags,
                requires_auth=True,
                required_roles=required_roles,
            )
        except Exception:
            return None
    
    def _extract_path_params(self, path: str) -> List[str]:
        """Extract path parameters from route path"""
        import re
        return re.findall(r'\{(\w+)\}', path)
    
    def _extract_required_roles(self, route: APIRoute) -> List[str]:
        """Extract required roles from route dependencies"""
        roles = []
        for dep in route.dependencies:
            if hasattr(dep, 'dependency'):
                dep_func = dep.dependency
                if hasattr(dep_func, '__name__'):
                    name = dep_func.__name__
                    if 'check_role' in name or 'require_role' in name:
                        # Try to extract roles from the dependency
                        pass
        return roles
    
    def _get_type_schema(self, annotation: Any) -> Dict[str, Any]:
        """Get JSON schema for a type annotation"""
        if hasattr(annotation, '__origin__'):
            origin = annotation.__origin__
            args = annotation.__args__ if hasattr(annotation, '__args__') else ()
            
            if origin is list or origin is List:
                return {"type": "array", "items": self._get_type_schema(args[0]) if args else {}}
            elif origin is dict or origin is Dict:
                return {"type": "object"}
            elif origin is Union:
                # Handle Optional[T] which is Union[T, None]
                non_none = [a for a in args if a is not type(None)]
                if len(non_none) == 1:
                    schema = self._get_type_schema(non_none[0])
                    schema["nullable"] = True
                    return schema
                return {"anyOf": [self._get_type_schema(a) for a in non_none]}
        
        # Basic types
        type_map = {
            int: {"type": "integer"},
            float: {"type": "number"},
            str: {"type": "string"},
            bool: {"type": "boolean"},
            datetime: {"type": "string", "format": "date-time"},
        }
        
        for py_type, schema in type_map.items():
            if annotation is py_type or (hasattr(annotation, '__name__') and annotation.__name__ == py_type.__name__):
                return schema
        
        # Check for Pydantic model
        if hasattr(annotation, 'model_json_schema'):
            return annotation.model_json_schema()
        
        return {"type": "string"}
    
    def _get_model_schema(self, model: Any) -> Optional[Dict[str, Any]]:
        """Get JSON schema for a Pydantic model"""
        try:
            if hasattr(model, 'model_json_schema'):
                return model.model_json_schema()
            if hasattr(model, 'schema'):
                return model.schema()
        except Exception:
            pass
        return None
    
    def _get_response_model(self, route: APIRoute) -> Optional[str]:
        """Get response model name"""
        if route.response_model:
            return getattr(route.response_model, '__name__', str(route.response_model))
        return None
    
    def _build_index(self):
        """Build searchable index by tags and keywords"""
        self._endpoint_index = {}
        
        for key, endpoint in self._endpoints.items():
            # Index by tags
            for tag in endpoint.tags:
                if tag not in self._endpoint_index:
                    self._endpoint_index[tag] = []
                self._endpoint_index[tag].append(key)
            
            # Index by path segments (for category search)
            path_parts = [p for p in endpoint.path.split('/') if p and not p.startswith('{')]
            for part in path_parts:
                part_lower = part.lower()
                if part_lower not in self._endpoint_index:
                    self._endpoint_index[part_lower] = []
                self._endpoint_index[part_lower].append(key)
    
    def find_endpoints(
        self,
        query: str,
        tags: Optional[List[str]] = None,
        method: Optional[HTTPMethod] = None,
        max_results: int = 10,
    ) -> List[APIEndpoint]:
        """Find endpoints matching a query"""
        query_lower = query.lower()
        scored = []
        
        for key, endpoint in self._endpoints.items():
            if method and endpoint.method != method:
                continue
            
            if tags and not any(t in endpoint.tags for t in tags):
                continue
            
            score = 0.0
            
            # Score by path match
            if query_lower in endpoint.path.lower():
                score += 10
            
            # Score by summary/description match
            if query_lower in endpoint.summary.lower():
                score += 8
            if query_lower in endpoint.description.lower():
                score += 5
            
            # Score by tag match
            for tag in endpoint.tags:
                if query_lower in tag.lower():
                    score += 6
            
            # Score by name match
            if query_lower in endpoint.name.lower():
                score += 4
            
            if score > 0:
                scored.append((score, endpoint))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        return [e for _, e in scored[:max_results]]
    
    def get_endpoint(self, method: HTTPMethod, path: str) -> Optional[APIEndpoint]:
        """Get a specific endpoint by method and path"""
        key = f"{method.value}:{path}"
        return self._endpoints.get(key)
    
    def get_all_endpoints(self, tag: Optional[str] = None) -> List[APIEndpoint]:
        """Get all endpoints, optionally filtered by tag"""
        if tag:
            keys = self._endpoint_index.get(tag, [])
            return [self._endpoints[k] for k in keys if k in self._endpoints]
        return list(self._endpoints.values())
    
    def get_categories(self) -> List[str]:
        """Get all available categories/tags"""
        return list(self._endpoint_index.keys())


class DynamicAPIExecutor:
    """
    Executes dynamic API calls on behalf of the AI
    Handles authentication, parameter binding, and response processing
    """
    
    def __init__(
        self,
        app: FastAPI,
        db_session_factory: Optional[Callable] = None,
        registry: Optional[DynamicAPIRegistry] = None,
    ):
        self.app = app
        self.db_session_factory = db_session_factory
        self.registry = registry or DynamicAPIRegistry(app)
        self.audit = get_ai_audit_logger()
    
    def _get_db(self) -> Optional[Session]:
        if self.db_session_factory:
            return self.db_session_factory()
        return None
    
    def _check_permission(
        self,
        user_role: str,
        endpoint: APIEndpoint,
        context: AIContext,
    ) -> bool:
        """Check if user has permission to call this endpoint"""
        # Superadmin can do everything
        if user_role == "superadmin":
            return True
        
        # Check required roles
        if endpoint.required_roles:
            if user_role not in endpoint.required_roles:
                # Check role hierarchy
                role_hierarchy = {
                    "employee": 0,
                    "manager": 1,
                    "hr_executive": 2,
                    "hr_manager": 3,
                    "hr_admin": 4,
                    "admin": 5,
                }
                user_level = role_hierarchy.get(user_role, 0)
                required_level = max(role_hierarchy.get(r, 0) for r in endpoint.required_roles)
                if user_level < required_level:
                    return False
        
        # Check tenant isolation
        if context.organization_id:
            # The endpoint will enforce this, but we can pre-check
            pass
        
        return True
    
    def _build_request_params(
        self,
        endpoint: APIEndpoint,
        parameters: Dict[str, Any],
        context: AIContext,
    ) -> Dict[str, Any]:
        """Build request parameters with context injection"""
        params = {}
        
        # Add path parameters
        for name, info in endpoint.parameters.items():
            if info.get("type") == "path":
                if name in parameters:
                    params[name] = parameters[name]
                elif name == "organization_id" and context.organization_id:
                    params[name] = context.organization_id
                elif name == "company_id" and context.company_id:
                    params[name] = context.company_id
                elif name == "employee_id" and context.employee_id:
                    params[name] = context.employee_id
        
        # Add query parameters
        for name, info in endpoint.parameters.items():
            if info.get("type") == "query":
                if name in parameters:
                    params[name] = parameters[name]
        
        # Add request body if needed
        body = None
        if endpoint.request_body:
            body = {}
            for prop_name, prop_info in endpoint.request_body.get("properties", {}).items():
                if prop_name in parameters:
                    body[prop_name] = parameters[prop_name]
                elif prop_name == "employee_id" and context.employee_id:
                    body[prop_name] = context.employee_id
                elif prop_name == "organization_id" and context.organization_id:
                    prop_name = "organization_id"
                    body[prop_name] = context.organization_id
            
            # Remove None values
            body = {k: v for k, v in body.items() if v is not None}
            if not body:
                body = None
        
        return {"params": params, "body": body}
    
    async def execute(
        self,
        method: HTTPMethod,
        path: str,
        parameters: Dict[str, Any],
        context: AIContext,
        user_role: str = "employee",
    ) -> APICallResult:
        """Execute a dynamic API call"""
        start_time = datetime.now()
        
        # Find the endpoint
        endpoint = self.registry.get_endpoint(method, path)
        if not endpoint:
            return APICallResult(
                success=False,
                status_code=404,
                error=f"Endpoint not found: {method.value} {path}",
                message=f"I couldn't find the API endpoint {method.value} {path}.",
            )
        
        # Check permissions
        if not self._check_permission(user_role, endpoint, context):
            self.audit.log_permission_denied(
                user_id=context.user_id,
                action=f"dynamic_api_{method.value}_{path}",
                reason=f"Role '{user_role}' not authorized for this endpoint",
                organization_id=context.organization_id,
            )
            return APICallResult(
                success=False,
                status_code=403,
                error="Permission denied",
                message=f"You don't have permission to call {method.value} {path}.",
            )
        
        # Build request
        request_data = self._build_request_params(endpoint, parameters, context)
        
        # Create a mock request to call the endpoint
        try:
            # We'll use the TestClient approach for internal calls
            from fastapi.testclient import TestClient
            client = TestClient(self.app)
            
            # Prepare headers
            headers = {
                "X-User-ID": str(context.user_id),
                "X-Employee-ID": str(context.employee_id) if context.employee_id else "",
                "X-Organization-ID": str(context.organization_id) if context.organization_id else "",
                "X-Company-ID": str(context.company_id) if context.company_id else "",
                "X-User-Role": user_role,
            }
            
            # Make the call
            url = path
            # Replace path parameters
            for name, value in request_data["params"].items():
                url = url.replace(f"{{{name}}}", str(value))
            
            if method == HTTPMethod.GET:
                response = client.get(url, params=request_data["params"], headers=headers)
            elif method == HTTPMethod.POST:
                response = client.post(url, json=request_data["body"], params=request_data["params"], headers=headers)
            elif method == HTTPMethod.PUT:
                response = client.put(url, json=request_data["body"], params=request_data["params"], headers=headers)
            elif method == HTTPMethod.PATCH:
                response = client.patch(url, json=request_data["body"], params=request_data["params"], headers=headers)
            elif method == HTTPMethod.DELETE:
                response = client.delete(url, params=request_data["params"], headers=headers)
            else:
                return APICallResult(
                    success=False,
                    status_code=405,
                    error=f"Method {method.value} not supported",
                )
            
            latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # Parse response
            try:
                response_data = response.json()
            except Exception:
                response_data = {"raw": response.text}
            
            success = 200 <= response.status_code < 300
            
            # Audit log
            self.audit.log_action(
                user_id=context.user_id,
                action=f"dynamic_api_{method.value}_{path}",
                parameters=parameters,
                result={"success": success, "status_code": response.status_code},
                organization_id=context.organization_id,
                success=success,
                error=None if success else f"HTTP {response.status_code}",
                latency_ms=latency_ms,
            )
            
            if success:
                return APICallResult(
                    success=True,
                    status_code=response.status_code,
                    data=response_data,
                    message=f"Successfully executed {method.value} {path}",
                    endpoint=f"{method.value} {path}",
                )
            else:
                error_msg = response_data.get("detail", f"HTTP {response.status_code}")
                return APICallResult(
                    success=False,
                    status_code=response.status_code,
                    error=str(error_msg),
                    message=f"API call failed: {error_msg}",
                    endpoint=f"{method.value} {path}",
                )
                
        except Exception as e:
            latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            self.audit.log_action(
                user_id=context.user_id,
                action=f"dynamic_api_{method.value}_{path}",
                parameters=parameters,
                result={"success": False, "error": str(e)},
                organization_id=context.organization_id,
                success=False,
                error=str(e),
                latency_ms=latency_ms,
            )
            return APICallResult(
                success=False,
                status_code=500,
                error=str(e),
                message=f"Failed to execute API call: {str(e)}",
                endpoint=f"{method.value} {path}",
            )


class DynamicAPIAction:
    """
    High-level action that the AI can use to call any API endpoint
    This is the main interface for the AI to execute dynamic API calls
    """
    
    def __init__(
        self,
        app: FastAPI,
        db_session_factory: Optional[Callable] = None,
        registry: Optional[DynamicAPIRegistry] = None,
    ):
        self.executor = DynamicAPIExecutor(app, db_session_factory, registry)
        self.registry = self.executor.registry
    
    def discover_endpoints(
        self,
        query: str,
        context: AIContext,
        max_results: int = 5,
    ) -> List[Dict[str, Any]]:
        """Discover relevant endpoints for a query"""
        endpoints = self.registry.find_endpoints(query, max_results=max_results)
        
        results = []
        for ep in endpoints:
            results.append({
                "method": ep.method.value,
                "path": ep.path,
                "name": ep.name,
                "summary": ep.summary,
                "description": ep.description,
                "tags": ep.tags,
                "parameters": ep.parameters,
                "request_body": ep.request_body,
            })
        
        return results
    
    def get_endpoint_details(self, method: str, path: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about an endpoint"""
        try:
            http_method = HTTPMethod(method.upper())
        except ValueError:
            return None
        
        endpoint = self.registry.get_endpoint(http_method, path)
        if not endpoint:
            return None
        
        return {
            "method": endpoint.method.value,
            "path": endpoint.path,
            "name": endpoint.name,
            "summary": endpoint.summary,
            "description": endpoint.description,
            "tags": endpoint.tags,
            "parameters": endpoint.parameters,
            "request_body": endpoint.request_body,
            "response_model": endpoint.response_model,
            "required_roles": endpoint.required_roles,
        }
    
    async def execute_action(
        self,
        method: str,
        path: str,
        parameters: Dict[str, Any],
        context: AIContext,
        user_role: str = "employee",
    ) -> Dict[str, Any]:
        """Execute a dynamic API action - main entry point for the AI"""
        try:
            http_method = HTTPMethod(method.upper())
        except ValueError:
            return {
                "success": False,
                "error": f"Invalid HTTP method: {method}",
                "message": f"Invalid HTTP method: {method}. Use GET, POST, PUT, PATCH, or DELETE.",
            }
        
        result = await self.executor.execute(http_method, path, parameters, context, user_role)
        
        return {
            "success": result.success,
            "status_code": result.status_code,
            "data": result.data,
            "error": result.error,
            "message": result.message,
            "endpoint": result.endpoint,
        }
    
    def list_available_categories(self) -> List[str]:
        """List all available API categories"""
        return self.registry.get_categories()


# Global instances
_dynamic_api_registry: Optional[DynamicAPIRegistry] = None
_dynamic_api_action: Optional[DynamicAPIAction] = None


def get_dynamic_api_registry(app: Optional[FastAPI] = None) -> DynamicAPIRegistry:
    """Get the global dynamic API registry"""
    global _dynamic_api_registry
    if _dynamic_api_registry is None:
        _dynamic_api_registry = DynamicAPIRegistry(app)
        if app:
            _dynamic_api_registry.initialize(app)
    elif app and not _dynamic_api_registry._initialized:
        _dynamic_api_registry.initialize(app)
    return _dynamic_api_registry


def get_dynamic_api_action(
    app: Optional[FastAPI] = None,
    db_session_factory: Optional[Callable] = None,
) -> DynamicAPIAction:
    """Get the global dynamic API action executor"""
    global _dynamic_api_action
    if _dynamic_api_action is None:
        registry = get_dynamic_api_registry(app)
        _dynamic_api_action = DynamicAPIAction(app, db_session_factory, registry)
    return _dynamic_api_action


def init_dynamic_api(
    app: FastAPI,
    db_session_factory: Optional[Callable] = None,
) -> DynamicAPIAction:
    """Initialize the dynamic API system"""
    global _dynamic_api_registry, _dynamic_api_action
    _dynamic_api_registry = DynamicAPIRegistry(app)
    _dynamic_api_registry.initialize(app)
    _dynamic_api_action = DynamicAPIAction(app, db_session_factory, _dynamic_api_registry)
    return _dynamic_api_action