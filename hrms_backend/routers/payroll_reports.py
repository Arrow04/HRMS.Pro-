"""Statutory filing API (mandate section 51).

GET  /api/payroll/reports                      list report definitions
GET  /api/payroll/reports/{code}               rendered table for a period
GET  /api/payroll/reports/{code}/file          the government filing file
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User
from core.auth import get_current_user
from services.statutory_reports import (
    BUILTIN_REPORT_DEFINITIONS,
    ensure_builtin_definitions,
    render_filing_file,
    render_report,
)

router = APIRouter(tags=["Payroll Reports"])

_READ_ROLES = ("superadmin", "admin", "hr_admin", "finance", "accountant",
               "hr_manager", "hr_executive")


def _require(user: User, action: str):
    if (user.role or "").lower() not in _READ_ROLES:
        raise HTTPException(status_code=403, detail=f"Not authorized to {action} statutory reports")


def _definition_for(db, code: str, organization_id: int) -> dict:
    from models import StatutoryReportDefinition

    row = db.query(StatutoryReportDefinition).filter(
        StatutoryReportDefinition.code == code,
        (StatutoryReportDefinition.organization_id == organization_id)
        | (StatutoryReportDefinition.organization_id.is_(None)),
        StatutoryReportDefinition.status == "active",
    ).order_by(StatutoryReportDefinition.organization_id.desc().nullslast()).first()
    if row is not None:
        return {
            "code": row.code, "name": row.name, "authority": row.authority,
            "fields": row.fields or [], "period_type": row.period_type,
        }
    builtin = next((d for d in BUILTIN_REPORT_DEFINITIONS if d["code"] == code), None)
    if builtin is None:
        raise HTTPException(status_code=404, detail="Unknown report definition")
    return builtin


@router.get("/api/payroll/reports")
def list_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, "view")
    ensure_builtin_definitions(db, current_user.organization_id)
    return [
        {"code": d["code"], "name": d["name"], "authority": d.get("authority"),
         "periodType": d.get("period_type", "monthly")}
        for d in BUILTIN_REPORT_DEFINITIONS
    ]


@router.get("/api/payroll/reports/{code}")
def report_table(
    code: str,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user, "view")
    definition = _definition_for(db, code, current_user.organization_id)
    return render_report(db, definition, current_user.organization_id, month, year)


@router.get("/api/payroll/reports/{code}/file")
def report_file(
    code: str,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    establishmentCode: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The actual government filing file (EPF ECR pipe format, etc.)."""
    _require(current_user, "download")
    definition = _definition_for(db, code, current_user.organization_id)
    out = render_filing_file(
        db, definition, current_user.organization_id, month, year,
        establishment_code=establishmentCode,
    )
    return PlainTextResponse(out["content"], headers={
        "Content-Disposition": f'attachment; filename="{out["filename"]}"',
        "X-File-Name": out["filename"],
        "X-Row-Count": str(out["rowCount"]),
    })
