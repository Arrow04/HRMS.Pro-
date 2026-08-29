"""
Split main.py inline routes into domain router files.

Collision-safe: uses distinct filenames where routers/<name>.py already exists
(settings_inline, reports_inline, recruitment_inline, employee_lifecycle).
"""
import ast
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "main.py")

with open(SRC, encoding="utf-8") as f:
    source = f.read()

lines = source.splitlines(keepends=True)
tree = ast.parse(source)

# ---------------------------------------------------------------------------
# 1. Classify nodes
# ---------------------------------------------------------------------------
route_nodes = []
schema_nodes = []
MODELS_IMPORTED = []

for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for dec in node.decorator_list:
            if (
                isinstance(dec, ast.Call)
                and isinstance(dec.func, ast.Attribute)
                and isinstance(dec.func.value, ast.Name)
                and dec.func.value.id == "app"
                and dec.func.attr in ("get", "post", "put", "delete", "patch")
            ):
                path = None
                if dec.args and isinstance(dec.args[0], ast.Constant):
                    path = dec.args[0].value
                route_nodes.append({
                    "node": node,
                    "method": dec.func.attr,
                    "path": path,
                    "start": dec.lineno,
                    "end": node.end_lineno,
                })
                break
    elif isinstance(node, ast.ClassDef):
        for base in node.bases:
            if isinstance(base, ast.Name) and base.id == "BaseModel":
                schema_nodes.append(node)
                break

for node in tree.body:
    if isinstance(node, ast.ImportFrom) and node.module == "models":
        for alias in node.names:
            MODELS_IMPORTED.append(alias.asname or alias.name)

# ---------------------------------------------------------------------------
# 2. Domain -> filename mapping (collision-safe)
# ---------------------------------------------------------------------------
DOMAIN_FILE = {
    "attendance": "attendance",
    "leaves": "leaves",
    "payroll": "payroll",
    "expenses": "expenses",
    "holidays": "holidays",
    "notifications": "notifications",
    "assets": "assets",
    "performance": "performance",
    "recruitment": "recruitment_inline",
    "reports": "reports_inline",
    "settings": "settings_inline",
    "companies": "companies",
    "dashboard": "dashboard",
    "employees": "employee_lifecycle",
}


def domain_for(path: str) -> str:
    if not path:
        return "misc"
    if path.startswith("/api/attendance"):
        return "attendance"
    if path.startswith("/api/leave-types") or path.startswith("/api/leave-balances") or path.startswith("/api/leaves"):
        return "leaves"
    if path.startswith("/api/salary-templates") or path.startswith("/api/payroll"):
        return "payroll"
    if path.startswith("/api/expenses"):
        return "expenses"
    if path.startswith("/api/holidays"):
        return "holidays"
    if path.startswith("/api/notifications"):
        return "notifications"
    if path.startswith("/api/assets") or path.startswith("/api/bonuses"):
        return "assets"
    if path.startswith("/api/performance") or path.startswith("/api/goals") or path.startswith("/api/feedback"):
        return "performance"
    if path.startswith("/api/recruitment"):
        return "recruitment"
    if path.startswith("/api/reports") or path.startswith("/api/activity-logs"):
        return "reports"
    if path.startswith("/api/settings"):
        return "settings"
    if path.startswith("/api/companies") or path.startswith("/api/branches") or path.startswith("/api/departments/count") or path.startswith("/api/designations/count") or path.startswith("/api/organizations/"):
        return "companies"
    if path.startswith("/api/dashboard"):
        return "dashboard"
    if path.startswith("/api/exit-records") or path.startswith("/api/archived-employees") or path.startswith("/api/my-permissions") or path.startswith("/api/employees"):
        return "employees"
    if path.startswith("/health"):
        return "health"
    return "misc"


groups = {}
for r in route_nodes:
    d = domain_for(r["path"])
    groups.setdefault(d, []).append(r)

print("Domain groups:")
for d, routes in sorted(groups.items()):
    print(f"  {d}: {len(routes)} routes  -> {DOMAIN_FILE.get(d, 'KEEP-IN-MAIN')}")

ROUTED_DOMAINS = [d for d in groups if d in DOMAIN_FILE]
assert set(ROUTED_DOMAINS) == set(DOMAIN_FILE), (
    f"Mismatch domains: routed={set(ROUTED_DOMAINS)} expected={set(DOMAIN_FILE)}"
)


# ---------------------------------------------------------------------------
# 3. Extract schemas -> core/schemas.py
# ---------------------------------------------------------------------------
def get_source(start: int, end: int) -> str:
    return "".join(lines[start - 1:end])


schema_source_parts = []
for n in sorted(schema_nodes, key=lambda n: n.lineno):
    schema_source_parts.append(get_source(n.lineno, n.end_lineno))

SCHEMAS_HEADER = '''"""Pydantic request/response models for the HRMS API."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict


'''
with open(os.path.join(BASE, "core", "schemas.py"), "w", encoding="utf-8") as f:
    f.write(SCHEMAS_HEADER)
    f.write("\n\n".join(schema_source_parts))
    f.write("\n")
print(f"Wrote core/schemas.py with {len(schema_nodes)} schema classes")

# ---------------------------------------------------------------------------
# 4. Shared helpers -> core/shared.py
# ---------------------------------------------------------------------------
HELPER_NAMES = [
    "RateLimiter",
    "rate_limiter",
    "check_rate_limit",
    "_log",
    "calculate_distance",
    "save_selfie",
    "record_audit_log",
    "seed_initial_data",
    "_create_audit_log",
    "_get_employee_id_for_user",
]

helper_source_parts = []
seen = set()
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        name = getattr(node, "name", None)
        if name in HELPER_NAMES:
            seg = get_source(node.lineno, node.end_lineno)
            if seg not in seen:
                seen.add(seg)
                helper_source_parts.append(seg)

LOGGER_HEADER = '''"""Shared helpers, logging, and runtime utilities."""
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


'''

rate_block = get_source(118, 148)
log_setup = get_source(155, 198)

with open(os.path.join(BASE, "core", "shared.py"), "w", encoding="utf-8") as f:
    f.write(LOGGER_HEADER)
    f.write(rate_block)
    f.write("\n\n")
    f.write(log_setup)
    f.write("\n\n")
    f.write("\n\n".join(helper_source_parts))
    f.write("\n")
print(f"Wrote core/shared.py with helpers: {HELPER_NAMES}")

# ---------------------------------------------------------------------------
# 5. Router files
# ---------------------------------------------------------------------------
def router_import_header(domain: str) -> str:
    schemas = ", ".join(n.name for n in schema_nodes)
    models = ", ".join(MODELS_IMPORTED)
    shared = ", ".join(HELPER_NAMES)
    return f'''"""HRMS API {domain} routes."""
from __future__ import annotations

import base64
import calendar
import collections
import io
import json
import math
import os
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union

import redis
import structlog
from dateutil import parser as dateparser
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import case, event, func, inspect, or_, text
from sqlalchemy.orm import ORMExecuteState, Session, joinedload, with_loader_criteria

from core.auth import check_role, get_current_user, get_password_hash, oauth2_scheme
from core.cache import CACHING_AVAILABLE, cached, get_cache_stats, invalidate_cache
from core.config import settings
from core.schemas import ({schemas})
from core.shared import ({shared})
from database import Base, SessionLocal, engine, get_db
from models import ({models})
from services.payroll_service import calculate_payroll, generate_payroll_record
from utils.helpers import convert_camel_to_snake

router = APIRouter(tags=["{domain.title()}"])


'''


def render_route(r: dict) -> str:
    seg = get_source(r["start"], r["end"])
    seg = re.sub(r"^@app\.", "@router.", seg, count=1, flags=re.MULTILINE)
    return seg


for domain in ROUTED_DOMAINS:
    fname = DOMAIN_FILE[domain]
    routes = groups[domain]
    parts = [router_import_header(domain)]
    for r in routes:
        parts.append(render_route(r))
    with open(os.path.join(BASE, "routers", f"{fname}.py"), "w", encoding="utf-8") as f:
        f.write("\n\n".join(parts) + "\n")
    print(f"Wrote routers/{fname}.py with {len(routes)} routes")

# ---------------------------------------------------------------------------
# 6. Rebuild main.py
# ---------------------------------------------------------------------------
def keep_lines(ranges):
    return "".join("".join(lines[a - 1:b]) for (a, b) in ranges)


parts = []
parts.append(keep_lines([(1, 112)]))  # imports + load_dotenv
parts.append("\n\n")
parts.append(keep_lines([(201, 392)]))  # lifespan .. health
parts.append("\n\n")
parts.append(keep_lines([(1473, 1491)]))  # tenant isolation
parts.append("\n\n\n")
parts.append(keep_lines([(1524, 1536)]))  # after_flush / after_commit
parts.append("\n\n")
parts.append(keep_lines([(1539, 1568)]))  # existing router includes
parts.append("\n")

for domain in ROUTED_DOMAINS:
    fname = DOMAIN_FILE[domain]
    var = f"{fname.replace('-', '_')}_router"
    parts.append(f"app.include_router({var})\n")

parts.append("\n")
parts.append(keep_lines([(5306, 5312)]))  # /test route
parts.append("\n")
parts.append(keep_lines([(5315, 5321)]))  # main guard
parts.append("\n")

new_main = "".join(parts)

# Insert new router imports after the last routers import
anchor = "from routers.ai_automation_tasks import router as ai_automation_router\n"
import_lines = []
for domain in ROUTED_DOMAINS:
    fname = DOMAIN_FILE[domain]
    var = f"{fname.replace('-', '_')}_router"
    import_lines.append(f"from routers.{fname} import router as {var}\n")
new_main = new_main.replace(anchor, anchor + "".join(import_lines))

# main needs logger (and rate_limiter/check_rate_limit may be unused in main now, keep logger only)
new_main = new_main.replace(
    "from routers.ai_automation_tasks import router as ai_automation_router\n",
    "from routers.ai_automation_tasks import router as ai_automation_router\n",
)
# Add logger import from shared (used by exception handlers)
new_main = new_main.replace(
    "from core.config import settings\n",
    "from core.config import settings\nfrom core.shared import logger\n",
)

with open(SRC, "w", encoding="utf-8") as f:
    f.write(new_main)
print("\nRewrote main.py")
