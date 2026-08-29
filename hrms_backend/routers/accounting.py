"""Accounting / GL router.

Exposes chart of accounts, posted journals, and reversal for payroll & F&F.
Journals are created automatically when payroll is marked paid and when an F&F
is marked completed; this router only reads them and supports reversal.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.auth import get_current_user
from database import get_db
from models import User
from services.accounting_service import (
    list_accounts, list_journals, reverse_journal,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accounting", tags=["Accounting"])


class ReversePayload(BaseModel):
    reason: Optional[str] = None


@router.get("/accounts")
def get_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    org_id = getattr(current_user, "organization_id", None)
    return {"status": "success", "items": list_accounts(db, org_id)}


@router.get("/journals")
def get_journals(
    entry_type: Optional[str] = Query(None),
    reference_type: Optional[str] = Query(None),
    reference_id: Optional[int] = Query(None),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    org_id = getattr(current_user, "organization_id", None)
    items = list_journals(db, org_id, entry_type, reference_type, reference_id, limit)
    return {"status": "success", "items": items}


@router.post("/journals/{journal_id}/reverse")
def reverse_journal_entry(
    journal_id: int,
    payload: ReversePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    org_id = getattr(current_user, "organization_id", None)
    rev = reverse_journal(db, journal_id, reversed_by=current_user.id, organization_id=org_id)
    if not rev:
        raise HTTPException(status_code=404, detail="Journal not found or already reversed")
    return {"status": "success", "message": "Journal reversed", "reversal_id": rev.id}