"""
Lookup router for serving dropdown data from core master with tab-based organization
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Lookup, User
from routers.auth import get_current_user

router = APIRouter(tags=["lookup"])

@router.get("")
async def get_all_lookups(category: str = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all lookup records with tab structure. If category provided, filter by tab_category and return flat list."""
    if category:
        # Return flat list for MasterData page with frontend-friendly field names
        lookups = db.query(Lookup).filter(
            Lookup.tab_category == category
        ).order_by(Lookup.sort_order).all()
        return [
            {
                "id": lookup.id,
                "code": lookup.key,
                "name": lookup.value,
                "description": lookup.description,
                "status": "active" if lookup.is_active else "inactive",
                "tabCategory": lookup.tab_category,
                "fieldName": lookup.field_name,
                "sortOrder": lookup.sort_order
            }
            for lookup in lookups
        ]

    # Return all lookups with original structure
    lookups = db.query(Lookup).filter(Lookup.is_active == True).order_by(
        Lookup.tab_category, Lookup.field_name, Lookup.sort_order
    ).all()
    return [
        {
            "id": lookup.id,
            "tabCategory": lookup.tab_category,
            "fieldName": lookup.field_name,
            "key": lookup.key,
            "value": lookup.value,
            "description": lookup.description,
            "isActive": lookup.is_active,
            "sortOrder": lookup.sort_order
        }
        for lookup in lookups
    ]

@router.get("/tabs")
async def get_tab_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all tab categories (basic, personal, identity, academic, etc.)"""
    categories = db.query(Lookup.tab_category).filter(Lookup.is_active == True).distinct().all()
    return [category[0] for category in categories]

@router.get("/tab/{tab_category}")
async def get_lookup_by_tab(tab_category: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get lookup records by tab category"""
    lookups = db.query(Lookup).filter(
        Lookup.tab_category == tab_category,
        Lookup.is_active == True
    ).order_by(Lookup.field_name, Lookup.sort_order).all()
    
    result = {}
    for lookup in lookups:
        if lookup.field_name not in result:
            result[lookup.field_name] = []
        result[lookup.field_name].append({
            "id": lookup.id,
            "tabCategory": lookup.tab_category,
            "fieldName": lookup.field_name,
            "key": lookup.key,
            "value": lookup.value,
            "description": lookup.description,
            "isActive": lookup.is_active,
            "sortOrder": lookup.sort_order
        })
    
    return result

@router.get("/field/{field_name}")
async def get_lookup_by_field(field_name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get lookup records by field name (backward compatibility)"""
    lookups = db.query(Lookup).filter(
        Lookup.field_name == field_name,
        Lookup.is_active == True
    ).order_by(Lookup.sort_order).all()
    
    return [
        {
            "id": lookup.id,
            "tabCategory": lookup.tab_category,
            "fieldName": lookup.field_name,
            "key": lookup.key,
            "value": lookup.value,
            "description": lookup.description,
            "isActive": lookup.is_active,
            "sortOrder": lookup.sort_order
        }
        for lookup in lookups
    ]

@router.get("/tab/{tab_category}/{field_name}")
async def get_lookup_by_tab_and_field(tab_category: str, field_name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get lookup records by tab category and field name"""
    lookups = db.query(Lookup).filter(
        Lookup.tab_category == tab_category,
        Lookup.field_name == field_name,
        Lookup.is_active == True
    ).order_by(Lookup.sort_order).all()
    
    return [
        {
            "id": lookup.id,
            "tabCategory": lookup.tab_category,
            "fieldName": lookup.field_name,
            "key": lookup.key,
            "value": lookup.value,
            "description": lookup.description,
            "isActive": lookup.is_active,
            "sortOrder": lookup.sort_order
        }
        for lookup in lookups
    ]

@router.get("/fields")
async def get_field_names(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all distinct field names"""
    field_names = db.query(Lookup.field_name).filter(Lookup.is_active == True).distinct().all()
    return [field_name[0] for field_name in field_names]

@router.get("/structure")
async def get_lookup_structure(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get complete lookup structure organized by tabs and fields"""
    lookups = db.query(Lookup).filter(Lookup.is_active == True).order_by(
        Lookup.tab_category, Lookup.field_name, Lookup.sort_order
    ).all()
    
    structure = {}
    for lookup in lookups:
        if lookup.tab_category not in structure:
            structure[lookup.tab_category] = {}
        if lookup.field_name not in structure[lookup.tab_category]:
            structure[lookup.tab_category][lookup.field_name] = []
        
        structure[lookup.tab_category][lookup.field_name].append({
            "id": lookup.id,
            "key": lookup.key,
            "value": lookup.value,
            "description": lookup.description,
            "sortOrder": lookup.sort_order
        })
    
    return structure

# CRUD Operations for Core Master Management
@router.post("")
async def create_lookup_item(lookup_data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a new lookup item"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    try:
        new_lookup = Lookup(
            tab_category=lookup_data["tabCategory"],
            field_name=lookup_data["fieldName"],
            key=lookup_data["key"],
            value=lookup_data["value"],
            description=lookup_data.get("description", ""),
            sort_order=lookup_data.get("sortOrder", 0),
            is_active=lookup_data.get("isActive", True)
        )
        db.add(new_lookup)
        db.commit()
        db.refresh(new_lookup)
        
        return {
            "id": new_lookup.id,
            "tabCategory": new_lookup.tab_category,
            "fieldName": new_lookup.field_name,
            "key": new_lookup.key,
            "value": new_lookup.value,
            "description": new_lookup.description,
            "isActive": new_lookup.is_active,
            "sortOrder": new_lookup.sort_order
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{lookup_id}")
async def update_lookup_item(lookup_id: int, lookup_data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Update an existing lookup item"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    try:
        lookup = db.query(Lookup).filter(Lookup.id == lookup_id).first()
        if not lookup:
            raise HTTPException(status_code=404, detail="Lookup item not found")
        
        lookup.tab_category = lookup_data.get("tabCategory", lookup.tab_category)
        lookup.field_name = lookup_data.get("fieldName", lookup.field_name)
        lookup.key = lookup_data.get("key", lookup.key)
        lookup.value = lookup_data.get("value", lookup.value)
        lookup.description = lookup_data.get("description", lookup.description)
        lookup.sort_order = lookup_data.get("sortOrder", lookup.sort_order)
        lookup.is_active = lookup_data.get("isActive", lookup.is_active)
        
        db.commit()
        db.refresh(lookup)
        
        return {
            "id": lookup.id,
            "tabCategory": lookup.tab_category,
            "fieldName": lookup.field_name,
            "key": lookup.key,
            "value": lookup.value,
            "description": lookup.description,
            "isActive": lookup.is_active,
            "sortOrder": lookup.sort_order
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{lookup_id}")
async def delete_lookup_item(lookup_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a lookup item"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    try:
        lookup = db.query(Lookup).filter(Lookup.id == lookup_id).first()
        if not lookup:
            raise HTTPException(status_code=404, detail="Lookup item not found")
        
        db.delete(lookup)
        db.commit()
        
        return {"message": "Lookup item deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/{lookup_id}/toggle")
async def toggle_lookup_item(lookup_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Toggle active status of a lookup item"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    try:
        lookup = db.query(Lookup).filter(Lookup.id == lookup_id).first()
        if not lookup:
            raise HTTPException(status_code=404, detail="Lookup item not found")
        
        lookup.is_active = not lookup.is_active
        db.commit()
        db.refresh(lookup)
        
        return {
            "id": lookup.id,
            "isActive": lookup.is_active
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/bulk")
async def bulk_create_lookup_items(items: list[dict], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Bulk create lookup items"""
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    try:
        created_items = []
        for item_data in items:
            new_lookup = Lookup(
                tab_category=item_data["tabCategory"],
                field_name=item_data["fieldName"],
                key=item_data["key"],
                value=item_data["value"],
                description=item_data.get("description", ""),
                sort_order=item_data.get("sortOrder", 0),
                is_active=item_data.get("isActive", True)
            )
            db.add(new_lookup)
            created_items.append(new_lookup)
        
        db.commit()
        
        return {
            "message": f"Successfully created {len(created_items)} lookup items",
            "count": len(created_items)
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
