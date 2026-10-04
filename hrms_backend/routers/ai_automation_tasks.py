"""
AI Automation Tasks Router
Local automation triggers for HRMS AI
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime

from database_enterprise import get_db
from core.auth import get_current_user
from hrms_ai.engine import get_hrms_ai_engine
from models import User

router = APIRouter(tags=["ai_automation"])


class AutomationTriggerRequest(BaseModel):
    trigger_type: str
    payload: Dict[str, Any] = {}


@router.post("/trigger")
async def trigger_automation(
    request: AutomationTriggerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("superadmin", "admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        engine = get_hrms_ai_engine()
        return {
            "trigger": request.trigger_type,
            "status": "processed",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Automation error: {str(e)}")


@router.get("/status")
def get_automation_status(current_user: User = Depends(get_current_user)):
    try:
        engine = get_hrms_ai_engine()
        stats = engine.get_statistics()
        return {
            "status": "active",
            "statistics": stats,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Status error: {str(e)}")
