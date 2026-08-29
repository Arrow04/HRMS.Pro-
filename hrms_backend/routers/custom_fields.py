"""Custom field definition and management routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from core.auth import get_current_user
from models import User

router = APIRouter(tags=["Custom Fields"])


@router.get("/api/custom-fields/types")
def get_custom_field_types():
    from services.custom_fields_service import get_field_types
    return get_field_types()


@router.get("/api/custom-fields/entities")
def get_custom_field_entities():
    from services.custom_fields_service import get_supported_entities
    return get_supported_entities()


@router.get("/api/custom-fields/{entity_type}")
def get_custom_fields(
    entity_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.custom_fields_service import get_custom_fields
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization required")
    return get_custom_fields(db, org_id, entity_type)


@router.post("/api/custom-fields/{entity_type}")
def create_custom_field(
    entity_type: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.custom_fields_service import create_custom_field
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization required")
    return create_custom_field(
        db, org_id, entity_type,
        field_name=payload.get("field_name"),
        field_type=payload.get("field_type"),
        label=payload.get("label"),
        placeholder=payload.get("placeholder"),
        is_required=payload.get("is_required", False),
        default_value=payload.get("default_value"),
        options=payload.get("options"),
        display_order=payload.get("display_order", 0),
    )


@router.put("/api/custom-fields/{field_id}")
def update_custom_field(
    field_id: int, payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.custom_fields_service import update_custom_field
    org_id = current_user.organization_id if current_user.role != "superadmin" else None
    result = update_custom_field(db, field_id, payload, organization_id=org_id)
    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Custom field not found")
    return result


@router.delete("/api/custom-fields/{field_id}")
def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.custom_fields_service import delete_custom_field
    org_id = current_user.organization_id if current_user.role != "superadmin" else None
    result = delete_custom_field(db, field_id, organization_id=org_id)
    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Custom field not found")
    return result
