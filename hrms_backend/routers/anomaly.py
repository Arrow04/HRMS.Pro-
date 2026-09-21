"""
Anomaly Detection Router
========================
Endpoints for scanning, listing, and managing anomaly alerts.
"""

import logging
from datetime import datetime
from typing import List, Optional

from core.datetime_utils import ist_now_naive
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.company_scope import resolve_company_scope
from database import get_db
from models import AnomalyAlert, User
from services.anomaly_service import run_full_scan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/anomalies", tags=["Anomaly Detection"])


# ── Schemas ──

class AnomalyAlertResponse(BaseModel):
    id: int
    anomaly_type: str
    severity: str
    title: str
    description: Optional[str] = None
    employee_ids: Optional[List[int]] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    evidence_data: Optional[dict] = None
    status: str
    created_at: datetime
    dismissed_at: Optional[datetime] = None
    dismissed_reason: Optional[str] = None


    class Config:
        from_attributes = True


class ScanResponse(BaseModel):
    scanned_at: str
    detected: int
    new_alerts: int
    by_type: dict


class DismissRequest(BaseModel):
    reason: Optional[str] = None


# ── Endpoints ──

@router.get("", response_model=List[AnomalyAlertResponse])
def list_anomalies(
    status: Optional[str] = Query(None, pattern="^(open|dismissed|resolved)$"),
    severity: Optional[str] = Query(None, pattern="^(low|medium|high|critical)$"),
    anomaly_type: Optional[str] = None,
    companyId: Optional[int] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List anomaly alerts for the organization."""
    query = db.query(AnomalyAlert).filter(
        AnomalyAlert.organization_id == current_user.organization_id,
    )
    company_scope = resolve_company_scope(db, current_user, companyId)
    if company_scope is not None:
        query = query.filter(AnomalyAlert.company_id == company_scope)
    if status:
        query = query.filter(AnomalyAlert.status == status)
    if severity:
        query = query.filter(AnomalyAlert.severity == severity)
    if anomaly_type:
        query = query.filter(AnomalyAlert.anomaly_type == anomaly_type)

    alerts = query.order_by(AnomalyAlert.created_at.desc()).limit(limit).all()
    return alerts


@router.get("/stats")
def anomaly_stats(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get anomaly alert summary statistics."""
    org_id = current_user.organization_id
    company_scope = resolve_company_scope(db, current_user, companyId)

    base_filters = [AnomalyAlert.organization_id == org_id]
    if company_scope is not None:
        base_filters.append(AnomalyAlert.company_id == company_scope)

    total = db.query(AnomalyAlert).filter(*base_filters).count()
    open_count = db.query(AnomalyAlert).filter(
        *base_filters, AnomalyAlert.status == "open"
    ).count()

    # Type breakdown
    from sqlalchemy import func
    type_rows = db.query(
        AnomalyAlert.anomaly_type, func.count(AnomalyAlert.id)
    ).filter(
        *base_filters,
        AnomalyAlert.status == "open",
    ).group_by(AnomalyAlert.anomaly_type).all()

    return {
        "total_alerts": total,
        "open_alerts": open_count,
        "by_type": {t: c for t, c in type_rows},
    }


@router.post("/scan", response_model=ScanResponse)
def trigger_scan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run all anomaly detectors and create new alerts.

    This is like running an AI audit on your HR data —
    detecting buddy punching, payroll drift, OT abuse, and more.
    """
    try:
        result = run_full_scan(db, current_user.organization_id, current_user.id)
        return result
    except Exception as e:
        logger.exception("Anomaly scan failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{alert_id}/dismiss", response_model=AnomalyAlertResponse)
def dismiss_anomaly(
    alert_id: int,
    req: DismissRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dismiss an anomaly alert."""
    alert = db.query(AnomalyAlert).filter(
        AnomalyAlert.id == alert_id,
        AnomalyAlert.organization_id == current_user.organization_id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "dismissed"
    alert.dismissed_by = current_user.id
    alert.dismissed_at = ist_now_naive()
    alert.dismissed_reason = req.reason
    db.commit()
    db.refresh(alert)
    return alert


@router.put("/{alert_id}/resolve", response_model=AnomalyAlertResponse)
def resolve_anomaly(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an anomaly alert as resolved."""
    alert = db.query(AnomalyAlert).filter(
        AnomalyAlert.id == alert_id,
        AnomalyAlert.organization_id == current_user.organization_id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "resolved"
    alert.resolved_at = ist_now_naive()
    db.commit()
    db.refresh(alert)
    return alert
