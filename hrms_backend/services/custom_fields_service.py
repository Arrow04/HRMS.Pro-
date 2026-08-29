"""Tenant-customizable fields — each organization can add/edit/remove fields
on core entities (Employee, Job, Candidate, etc.) without schema migration.

Uses a JSONB/metadata approach: each entity has a `custom_fields` JSON column
where per-tenant field definitions are stored. Field definitions themselves
are stored in a `custom_field_definitions` table.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Session
from sqlalchemy.ext.declarative import declarative_base

from models import Base, Employee

logger = logging.getLogger(__name__)

# ── Supported field types ──

FIELD_TYPES = [
    {"id": "text", "name": "Text", "icon": "Type"},
    {"id": "number", "name": "Number", "icon": "Hash"},
    {"id": "boolean", "name": "Yes/No", "icon": "ToggleLeft"},
    {"id": "date", "name": "Date", "icon": "Calendar"},
    {"id": "dropdown", "name": "Dropdown", "icon": "List"},
    {"id": "email", "name": "Email", "icon": "Mail"},
    {"id": "phone", "name": "Phone", "icon": "Phone"},
    {"id": "url", "name": "URL", "icon": "Link"},
    {"id": "textarea", "name": "Long Text", "icon": "AlignLeft"},
]

# ── Entities that support custom fields ──

SUPPORTED_ENTITIES = [
    {"id": "employee", "name": "Employee"},
    {"id": "candidate", "name": "Candidate"},
    {"id": "job_opening", "name": "Job Opening"},
    {"id": "organization", "name": "Organization"},
    {"id": "department", "name": "Department"},
]


def get_field_types() -> list:
    return FIELD_TYPES


def get_supported_entities() -> list:
    return SUPPORTED_ENTITIES


def get_custom_fields(db: Session, organization_id: int, entity_type: str) -> list:
    """Get all custom field definitions for an org + entity."""
    from sqlalchemy import text
    sql = text("""
        SELECT id, field_name, field_type, label, placeholder, is_required,
               default_value, options, validation_rules, display_order, is_active
        FROM custom_field_definitions
        WHERE organization_id = :org_id AND entity_type = :entity
          AND deleted_at IS NULL
        ORDER BY display_order ASC, id ASC
    """)
    rows = db.execute(sql, {"org_id": organization_id, "entity": entity_type}).fetchall()
    return [dict(r._mapping) for r in rows]


def create_custom_field(
    db: Session,
    organization_id: int,
    entity_type: str,
    field_name: str,
    field_type: str,
    label: str,
    placeholder: Optional[str] = None,
    is_required: bool = False,
    default_value: Optional[str] = None,
    options: Optional[list] = None,
    validation_rules: Optional[dict] = None,
    display_order: int = 0,
) -> dict:
    """Define a new custom field for a tenant."""
    from sqlalchemy import text

    # Validate field_type
    valid_types = {ft["id"] for ft in FIELD_TYPES}
    if field_type not in valid_types:
        return {"status": "error", "message": f"Invalid field type '{field_type}'. Valid: {valid_types}"}

    sql = text("""
        INSERT INTO custom_field_definitions
            (organization_id, entity_type, field_name, field_type, label, placeholder,
             is_required, default_value, options, validation_rules, display_order,
             created_at, updated_at)
        VALUES
            (:org_id, :entity, :fname, :ftype, :label, :placeholder,
             :req, :default, :opts, :rules, :order,
             :now, :now)
        RETURNING id
    """)
    result = db.execute(sql, {
        "org_id": organization_id,
        "entity": entity_type,
        "fname": field_name,
        "ftype": field_type,
        "label": label,
        "placeholder": placeholder or "",
        "req": is_required,
        "default": default_value or "",
        "opts": json.dumps(options or []),
        "rules": json.dumps(validation_rules or {}),
        "order": display_order,
        "now": datetime.utcnow(),
    })
    db.commit()
    field_id = result.fetchone()[0]

    return {"status": "success", "field_id": field_id}


def update_custom_field(db: Session, field_id: int, updates: dict, organization_id: int | None = None) -> dict:
    """Update an existing custom field definition."""
    from sqlalchemy import text

    allowed = {"label", "placeholder", "is_required", "default_value", "options",
               "validation_rules", "display_order", "is_active", "field_name"}

    set_clauses = []
    params = {"id": field_id, "now": datetime.utcnow()}
    for key, value in updates.items():
        if key in allowed:
            set_clauses.append(f"{key} = :{key}")
            if key in ("options", "validation_rules") and isinstance(value, (dict, list)):
                params[key] = json.dumps(value)
            else:
                params[key] = value

    if not set_clauses:
        return {"status": "error", "message": "No valid fields to update"}

    set_clauses.append("updated_at = :now")
    where = "id = :id"
    if organization_id is not None:
        where += " AND organization_id = :org_id"
        params["org_id"] = organization_id
    sql = text(f"UPDATE custom_field_definitions SET {', '.join(set_clauses)} WHERE {where}")
    result = db.execute(sql, params)
    db.commit()
    if result.rowcount == 0:
        return {"status": "not_found", "field_id": field_id}

    return {"status": "success", "field_id": field_id}


def delete_custom_field(db: Session, field_id: int, organization_id: int | None = None) -> dict:
    """Soft-delete a custom field definition."""
    from sqlalchemy import text
    where = "id = :id"
    params = {"id": field_id, "now": datetime.utcnow()}
    if organization_id is not None:
        where += " AND organization_id = :org_id"
        params["org_id"] = organization_id
    sql = text(f"UPDATE custom_field_definitions SET deleted_at = :now WHERE {where}")
    result = db.execute(sql, params)
    db.commit()
    if result.rowcount == 0:
        return {"status": "not_found", "field_id": field_id}
    return {"status": "deleted", "field_id": field_id}


def validate_custom_field_value(field_def: dict, value: Any) -> Optional[str]:
    """Validate a value against a field definition. Returns error message or None."""
    if field_def.get("is_required") and (value is None or value == ""):
        return f"{field_def['label']} is required"

    if value is None or value == "":
        return None

    field_type = field_def.get("field_type")

    if field_type == "number":
        try:
            float(value)
        except (ValueError, TypeError):
            return f"{field_def['label']} must be a number"

    if field_type == "email":
        import re
        if not re.match(r"[^@]+@[^@]+\.[^@]+", str(value)):
            return f"{field_def['label']} must be a valid email"

    return None
