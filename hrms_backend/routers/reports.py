"""Report generation and scheduling routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from core.auth import get_current_user
from models import User

router = APIRouter(tags=["Reports"])


@router.get("/api/reports/types")
def get_report_types():
    from services.report_scheduler import get_report_types
    return get_report_types()


@router.get("/api/reports/generate/{report_type}")
def generate_report(
    report_type: str,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.report_scheduler import generate_report
    org_id = current_user.organization_id
    result = generate_report(db, report_type, {"organization_id": org_id, "month": month, "year": year})
    return result


@router.get("/api/reports/scheduled")
def get_scheduled_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models import ScheduledReport
    org_id = current_user.organization_id
    reports = db.query(ScheduledReport).filter(
        ScheduledReport.organization_id == org_id
    ).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "report_type": r.report_type,
            "frequency": r.frequency,
            "recipients": r.recipients,
            "format": r.format,
            "params": r.params,
            "is_active": r.is_active,
            "last_sent_at": r.last_sent_at,
            "created_at": r.created_at,
        }
        for r in reports
    ]


@router.post("/api/reports/scheduled")
def create_scheduled_report(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models import ScheduledReport
    from datetime import datetime
    org_id = current_user.organization_id
    report = ScheduledReport(
        organization_id=org_id,
        name=payload.get("name") or f"{payload.get('report_type') or 'Report'} schedule",
        report_type=payload.get("report_type"),
        frequency=payload.get("frequency") or payload.get("schedule_cron") or "daily",
        recipients=payload.get("recipients") or [],
        format=payload.get("format") or "csv",
        params=payload.get("params") or {},
        is_active=payload.get("is_active", True),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"message": "Scheduled report created", "id": report.id}


@router.delete("/api/reports/scheduled/{report_id}")
def delete_scheduled_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models import ScheduledReport
    report = db.query(ScheduledReport).filter(
        ScheduledReport.id == report_id,
        ScheduledReport.organization_id == current_user.organization_id,
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    db.delete(report)
    db.commit()
    return {"message": "Scheduled report deleted"}


def _export_response(format: str, rows: list, filename: str):
    """Return a CSV (or simple PDF) download for a report row set."""
    import io
    import csv
    from fastapi.responses import StreamingResponse

    if format == "pdf":
        # Minimal printable PDF from CSV rows (text-based, valid PDF).
        text_lines = []
        for row in rows:
            if isinstance(row, dict):
                text_lines.append(",".join(str(v) for v in row.values()))
            else:
                text_lines.append(str(row))
        body = "\n".join(text_lines) or "No data"
        pdf = (
            "%PDF-1.4\n"
            "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n"
            "4 0 obj<</Length {0}>>stream\n".format(len(body.encode("latin-1", "replace")))
            + body.encode("latin-1", "replace").decode("latin-1")
            + "\nendstream\nendobj\n"
            "trailer<</Root 1 0 R>>\n%%EOF"
        )
        return StreamingResponse(
            iter([pdf.encode("latin-1", "replace")]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
        )

    output = io.StringIO()
    if rows and isinstance(rows[0], dict):
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        writer = csv.writer(output)
        for r in rows:
            writer.writerow([r] if not isinstance(r, (list, tuple)) else r)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


@router.get("/api/reports/live-export")
def export_live_report(
    format: str = "csv",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export the live report overview data."""
    from sqlalchemy import func
    from models import Employee
    from datetime import datetime
    org_id = current_user.organization_id
    q = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if org_id:
        q = q.filter(Employee.organization_id == org_id)
    rows = [
        {
            "fullName": (e.first_name or "") + " " + (e.last_name or ""),
            "email": e.email,
            "status": e.status,
            "departmentId": e.department_id,
            "joinDate": e.join_date.isoformat() if e.join_date else "",
        }
        for e in q.limit(2000).all()
    ]
    return _export_response(format, rows, "live_report")


@router.get("/api/reports/{report_id}/export")
def export_report_by_id(
    report_id: int,
    format: str = "csv",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a generated report by its execution log id."""
    from models import ReportExecutionLog, Employee
    log = db.query(ReportExecutionLog).filter(ReportExecutionLog.id == report_id).first()

    if current_user.role != "superadmin":
        if log is None:
            raise HTTPException(status_code=404, detail="Report not found")
        if log.created_by != current_user.id:
            owner = db.query(User).filter(User.id == log.created_by).first()
            if not owner or owner.organization_id != current_user.organization_id:
                raise HTTPException(status_code=404, detail="Report not found")

    # If a stored file exists, re-serve it (original bytes).
    if log and log.file_path:
        import os as _os
        if _os.path.exists(log.file_path):
            import mimetypes
            mime = mimetypes.guess_type(log.file_path)[0] or "application/octet-stream"
            with open(log.file_path, "rb") as f:
                data = f.read()
            from fastapi.responses import Response
            name = _os.path.basename(log.file_path)
            return Response(
                content=data,
                media_type=mime,
                headers={"Content-Disposition": f'attachment; filename="{name}"'},
            )

    # Otherwise fall back to a live data export scoped to the user's org.
    org_id = current_user.organization_id
    q = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if org_id:
        q = q.filter(Employee.organization_id == org_id)
    rows = [
        {
            "fullName": (e.first_name or "") + " " + (e.last_name or ""),
            "email": e.email,
            "status": e.status,
            "joinDate": e.join_date.isoformat() if e.join_date else "",
        }
        for e in q.limit(2000).all()
    ]
    return _export_response(format, rows, f"report_{report_id}")


@router.get("/api/reports/export-hub")
def export_report_hub(
    report: str = "employees",
    format: str = "csv",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a named report from the report hub."""
    from models import Employee, LeaveApplication, Expense, Payroll
    from sqlalchemy import func
    org_id = current_user.organization_id

    rows = []
    if report.lower() in ("employees", "employee"):
        q = db.query(Employee).filter(Employee.deleted_at.is_(None))
        if org_id:
            q = q.filter(Employee.organization_id == org_id)
        rows = [
            {
                "fullName": (e.first_name or "") + " " + (e.last_name or ""),
                "email": e.email,
                "status": e.status,
                "designation": e.designation or "",
                "joinDate": e.join_date.isoformat() if e.join_date else "",
            }
            for e in q.limit(2000).all()
        ]
    elif report.lower() in ("leaves", "leave"):
        q = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None))
        if org_id:
            q = q.filter(LeaveApplication.organization_id == org_id)
        rows = [
            {
                "employeeId": l.employee_id,
                "startDate": l.start_date.isoformat() if l.start_date else "",
                "endDate": l.end_date.isoformat() if l.end_date else "",
                "status": l.status,
                "reason": l.reason or "",
            }
            for l in q.limit(2000).all()
        ]
    elif report.lower() in ("expenses", "expense"):
        q = db.query(Expense).filter(Expense.deleted_at.is_(None))
        if org_id:
            q = q.filter(Expense.organization_id == org_id)
        rows = [
            {
                "employeeId": e.employee_id,
                "category": e.category,
                "amount": e.amount,
                "expenseDate": str(e.expense_date) if e.expense_date else "",
                "status": e.status,
            }
            for e in q.limit(2000).all()
        ]
    elif report.lower() in ("payroll", "salary"):
        q = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
        if org_id:
            q = q.filter(Payroll.organization_id == org_id)
        rows = [
            {
                "employeeId": p.employee_id,
                "month": p.month,
                "year": p.year,
                "grossSalary": p.gross_salary,
                "netSalary": p.net_salary,
                "status": p.status,
            }
            for p in q.limit(2000).all()
        ]
    else:
        q = db.query(Employee).filter(Employee.deleted_at.is_(None))
        if org_id:
            q = q.filter(Employee.organization_id == org_id)
        rows = [
            {
                "fullName": (e.first_name or "") + " " + (e.last_name or ""),
                "email": e.email,
                "status": e.status,
            }
            for e in q.limit(2000).all()
        ]

    safe = report.lower().replace(" ", "_")
    return _export_response(format, rows, f"{safe}_report")
