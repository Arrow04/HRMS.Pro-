"""
Read Replica Router and utilities.

Provides a ReplicaRouter class that automatically routes GET/HEAD/OPTIONS
requests to the read replica, while write requests go to the primary.
"""
from __future__ import annotations

import inspect
from functools import wraps
from typing import Callable, List, Optional, Sequence

from fastapi import APIRouter
from fastapi.params import Depends
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from database import get_db, get_read_db


READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def _replace_db_dependency(endpoint: Callable, dependency_factory: Callable) -> Callable:
    """Return a wrapper with the same behavior but with ``db`` dependency replaced."""
    sig = inspect.signature(endpoint)
    params = list(sig.parameters.values())

    new_params = []
    replaced = False
    for p in params:
        default = p.default
        is_db_dep = (
            p.name == "db"
            and isinstance(default, Depends)
            and default.dependency is get_db
        )
        if is_db_dep and not replaced:
            new_params.append(p.replace(default=Depends(dependency_factory)))
            replaced = True
        else:
            new_params.append(p)

    if not replaced:
        return endpoint

    new_sig = sig.replace(parameters=new_params)

    @wraps(endpoint)
    def wrapper(*args, **kwargs):
        return endpoint(*args, **kwargs)

    wrapper.__signature__ = new_sig  # type: ignore[attr-defined]
    return wrapper


class ReplicaRouter(APIRouter):
    """
    APIRouter subclass that automatically routes read methods (GET/HEAD/OPTIONS)
    to the read replica via ``get_read_db``, while write methods continue to
    use the primary via ``get_db``.

    Usage::

        router = ReplicaRouter(tags=["Employees"])

        @router.get("/employees")
        def list_employees(db: Session = Depends(get_db)):
            ...
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def add_api_route(self, path: str, endpoint: Callable, methods: Optional[Sequence[str]] = None, **kwargs):
        methods = list(methods or ["GET"])
        if any(m.upper() in READ_METHODS for m in methods):
            endpoint = _replace_db_dependency(endpoint, get_read_db)
        super().add_api_route(path, endpoint, methods=methods, **kwargs)

    def get(self, path: str, **kwargs):
        kwargs.setdefault("dependencies", [])
        return super().get(path, **kwargs)

    def post(self, path: str, **kwargs):
        return super().post(path, **kwargs)

    def put(self, path: str, **kwargs):
        return super().put(path, **kwargs)

    def patch(self, path: str, **kwargs):
        return super().patch(path, **kwargs)

    def delete(self, path: str, **kwargs):
        return super().delete(path, **kwargs)
