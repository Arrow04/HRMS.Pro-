"""
Fast JSON serialization utilities for high-performance API responses
"""
import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy.orm import Query
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class FastJSONEncoder(json.JSONEncoder):
    """Optimized JSON encoder for SQLAlchemy models and common types"""
    
    def default(self, obj: Any) -> Any:
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if hasattr(obj, '__dict__'):
            return obj.__dict__
        if hasattr(obj, 'to_dict'):
            return obj.to_dict()
        return super().default(obj)


def serialize_query_result(query: Query) -> List[Dict[str, Any]]:
    """Serialize SQLAlchemy query results to dicts efficiently"""
    results = query.all()
    return [serialize_model(obj) for obj in results]


def serialize_model(obj: Any) -> Dict[str, Any]:
    """Serialize a single SQLAlchemy model to dict"""
    if hasattr(obj, '__dict__'):
        data = {}
        for key, value in obj.__dict__.items():
            if not key.startswith('_'):
                if isinstance(value, datetime):
                    data[key] = value.isoformat()
                elif isinstance(value, date):
                    data[key] = value.isoformat()
                elif isinstance(value, Decimal):
                    data[key] = float(value)
                else:
                    data[key] = value
        return data
    return {}


def serialize_response(data: Any) -> Any:
    """Serialize any response data for JSON output"""
    if isinstance(data, list):
        return [serialize_response(item) for item in data]
    if isinstance(data, dict):
        return {k: serialize_response(v) for k, v in data.items()}
    if isinstance(data, Query):
        return serialize_query_result(data)
    if hasattr(data, '__dict__') and not isinstance(data, type):
        return serialize_model(data)
    if isinstance(data, (datetime, date)):
        return data.isoformat()
    if isinstance(data, Decimal):
        return float(data)
    return data


class CachedJSONResponse(JSONResponse):
    """JSONResponse with cache headers for client-side caching"""
    
    def __init__(self, content: Any, status_code: int = 200, headers: Optional[Dict[str, str]] = None, 
                 media_type: str = "application/json", cache_ttl: int = 0):
        super().__init__(content=content, status_code=status_code, headers=headers, media_type=media_type)
        if cache_ttl > 0:
            self.headers["Cache-Control"] = f"public, max-age={cache_ttl}"
            self.headers["X-Cache-TTL"] = str(cache_ttl)


def json_response(data: Any, status_code: int = 200, cache_ttl: int = 0) -> CachedJSONResponse:
    """Create a cached JSON response with fast serialization"""
    serialized = serialize_response(data)
    return CachedJSONResponse(
        content=serialized,
        status_code=status_code,
        cache_ttl=cache_ttl
    )
