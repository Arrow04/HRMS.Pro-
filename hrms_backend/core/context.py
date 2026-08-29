"""Shared context variables for request-scoped data across the application."""
from contextvars import ContextVar
from typing import Optional

from models import User

current_user_ctx: ContextVar[Optional[User]] = ContextVar("current_user_ctx", default=None)
request_ctx: ContextVar[dict] = ContextVar("request_ctx", default={})
