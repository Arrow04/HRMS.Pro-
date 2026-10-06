"""Report generation and scheduling routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from core.auth import get_current_user
from core.datetime_utils import ist_now_naive
from models import ReportExecutionLog, User

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
        created_at=ist_now_naive(),
        updated_at=ist_now_naive(),
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
    from models import Employee
    org_id = current_user.organization_id
    q = db.query(Employee).filter(Employee.deleted_at.is_(None))
    if current_user.role != "superadmin" and org_id:
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
    log = ReportExecutionLog(
        schedule_id=None,
        report_name="Live Report",
        status="completed",
        format=format,
        execution_time=ist_now_naive(),
        created_by=current_user.id,
    )
    db.add(log)
    db.commit()
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
    if current_user.role != "superadmin" and org_id:
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
    new_log = ReportExecutionLog(
        schedule_id=None,
        report_name=f"Report {report_id}",
        status="completed",
        format=format,
        execution_time=ist_now_naive(),
        created_by=current_user.id,
    )
    db.add(new_log)
    db.commit()
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
    report_lower = report.lower().strip()
    if report_lower.endswith(" report"):
        report_lower = report_lower[:-7].strip()

    if report_lower in ("employees", "employee") or report_lower.startswith("employee"):
        q = db.query(Employee).filter(Employee.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
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
    elif report_lower in ("company", "companies") or report_lower.startswith("company"):
        from models import Company
        q = db.query(Company).filter(Company.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
            q = q.filter(Company.organization_id == org_id)
        rows = [
            {
                "name": c.name,
                "code": c.code or "",
                "industry": c.industry or "",
                "email": c.email or "",
                "phone": c.phone or "",
                "address": c.address or "",
                "state": c.state or "",
                "country": c.country or "",
                "pan_no": c.pan_no or "",
                "gst_no": c.gst_no or "",
                "cin": c.cin or "",
                "status": c.status or "",
            }
            for c in q.all()
        ]
    elif report_lower in ("branch", "branches") or report_lower.startswith("branch"):
        from models import Branch
        q = db.query(Branch).filter(Branch.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
            q = q.filter(Branch.organization_id == org_id)
        rows = [
            {
                "name": b.name,
                "code": b.code or "",
                "location": b.location or "",
                "state": b.state or "",
                "pincode": b.pincode or "",
                "status": b.status or "",
            }
            for b in q.all()
        ]
    elif report_lower in ("department", "departments") or report_lower.startswith("department"):
        from models import Department
        q = db.query(Department).filter(Department.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
            q = q.filter(Department.organization_id == org_id)
        rows = [
            {
                "name": d.name,
                "code": d.code or "",
                "description": d.description or "",
                "manager_id": d.manager_id or "",
                "status": d.status or "",
            }
            for d in q.all()
        ]
    elif report_lower in ("designation", "designations") or report_lower.startswith("designation"):
        from models import Designation
        q = db.query(Designation).filter(Designation.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
            q = q.filter(Designation.organization_id == org_id)
        rows = [
            {
                "title": d.title,
                "code": d.code or "",
                "grade": d.grade or "",
                "description": d.description or "",
                "min_salary": d.min_salary or "",
                "max_salary": d.max_salary or "",
                "status": d.status or "",
            }
            for d in q.all()
        ]
    elif report_lower in ("leaves", "leave") or report_lower.startswith("leave"):
        q = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
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
    elif report_lower in ("expenses", "expense") or report_lower.startswith("expense"):
        q = db.query(Expense).filter(Expense.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
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
    elif report_lower in ("payroll", "salary") or report_lower.startswith("payroll"):
        q = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
        if current_user.role != "superadmin" and org_id:
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
        if current_user.role != "superadmin" and org_id:
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
    log = ReportExecutionLog(
        schedule_id=None,
        report_name=report,
        status="completed",
        format=format,
        execution_time=ist_now_naive(),
        created_by=current_user.id,
    )
    db.add(log)
    db.commit()
    return _export_response(format, rows, f"{safe}_report")


# --------------------------------------------------------------------------
# Custom Report Builder - schema + data engine
# --------------------------------------------------------------------------

CUSTOM_REPORT_SOURCES = {
    "employees": {
        "label": "Employees",
        "date_field": "join_date",
        "fields": [
            {"key": "employee_code", "label": "Employee Code", "type": "string"},
            {"key": "full_name", "label": "Name", "type": "string", "from": "employee"},
            {"key": "email", "label": "Email", "type": "string"},
            {"key": "designation", "label": "Designation", "type": "string"},
            {"key": "department", "label": "Department", "type": "string", "from": "department"},
            {"key": "company", "label": "Company", "type": "string", "from": "company"},
            {"key": "status", "label": "Status", "type": "string"},
            {"key": "join_date", "label": "Join Date", "type": "date"},
            {"key": "base_salary", "label": "Base Salary", "type": "number"},
            {"key": "pay_frequency", "label": "Pay Frequency", "type": "string"},
            {"key": "cost_center", "label": "Cost Center", "type": "string"},
            {"key": "phone", "label": "Phone", "type": "string"},
        ],
        "filters": ["search", "status", "companyId", "departmentId", "dateFrom", "dateTo"],
        "numeric": ["base_salary"],
    },
    "payroll": {
        "label": "Payroll",
        "date_field": None,
        "fields": [
            {"key": "employee_name", "label": "Employee", "type": "string", "from": "employee"},
            {"key": "employee_code", "label": "Employee Code", "type": "string", "from": "employee"},
            {"key": "month", "label": "Month", "type": "number"},
            {"key": "year", "label": "Year", "type": "number"},
            {"key": "status", "label": "Status", "type": "string"},
            {"key": "basic_salary", "label": "Basic", "type": "number"},
            {"key": "gross_salary", "label": "Gross", "type": "number"},
            {"key": "pf_deduction", "label": "PF", "type": "number"},
            {"key": "esi_deduction", "label": "ESI", "type": "number"},
            {"key": "professional_tax", "label": "PT", "type": "number"},
            {"key": "tds_deduction", "label": "TDS", "type": "number"},
            {"key": "net_salary", "label": "Net Pay", "type": "number"},
            {"key": "total_earnings", "label": "Total Earnings", "type": "number"},
            {"key": "total_deductions", "label": "Total Deductions", "type": "number"},
            {"key": "paid_days", "label": "Paid Days", "type": "number"},
        ],
        "filters": ["month", "year", "status", "companyId", "departmentId", "employeeId", "search"],
        "numeric": ["month", "year", "basic_salary", "gross_salary", "pf_deduction",
                    "esi_deduction", "professional_tax", "tds_deduction", "net_salary",
                    "total_earnings", "total_deductions", "paid_days"],
    },
    "attendance": {
        "label": "Attendance",
        "date_field": "date",
        "fields": [
            {"key": "employee_name", "label": "Employee", "type": "string", "from": "employee"},
            {"key": "employee_code", "label": "Employee Code", "type": "string", "from": "employee"},
            {"key": "date", "label": "Date", "type": "date"},
            {"key": "status", "label": "Status", "type": "string"},
            {"key": "work_hours", "label": "Work Hours", "type": "number"},
            {"key": "overtime_hours", "label": "Overtime Hours", "type": "number"},
            {"key": "is_late", "label": "Late", "type": "bool"},
            {"key": "check_in", "label": "Check In", "type": "string"},
            {"key": "check_out", "label": "Check Out", "type": "string"},
        ],
        "filters": ["dateFrom", "dateTo", "status", "companyId", "departmentId", "search"],
        "numeric": ["work_hours", "overtime_hours"],
    },
    "leave_applications": {
        "label": "Leave Applications",
        "date_field": "start_date",
        "fields": [
            {"key": "employee_name", "label": "Employee", "type": "string", "from": "employee"},
            {"key": "leave_type", "label": "Leave Type", "type": "string", "from": "leave_type"},
            {"key": "start_date", "label": "Start", "type": "date"},
            {"key": "end_date", "label": "End", "type": "date"},
            {"key": "total_days", "label": "Days", "type": "number"},
            {"key": "status", "label": "Status", "type": "string"},
            {"key": "reason", "label": "Reason", "type": "string"},
        ],
        "filters": ["dateFrom", "dateTo", "status", "search"],
        "numeric": ["total_days"],
    },
    "leave_balances": {
        "label": "Leave Balances",
        "date_field": None,
        "fields": [
            {"key": "employee_name", "label": "Employee", "type": "string", "from": "employee"},
            {"key": "leave_type", "label": "Leave Type", "type": "string", "from": "leave_type"},
            {"key": "year", "label": "Year", "type": "number"},
            {"key": "total_days", "label": "Total Days", "type": "number"},
            {"key": "used_days", "label": "Used Days", "type": "number"},
            {"key": "remaining_days", "label": "Remaining Days", "type": "number"},
        ],
        "filters": ["year", "search"],
        "numeric": ["year", "total_days", "used_days", "remaining_days"],
    },
    "expenses": {
        "label": "Expenses",
        "date_field": "expense_date",
        "fields": [
            {"key": "employee_name", "label": "Employee", "type": "string", "from": "employee"},
            {"key": "category", "label": "Category", "type": "string"},
            {"key": "amount", "label": "Amount", "type": "number"},
            {"key": "tax_amount", "label": "Tax", "type": "number"},
            {"key": "status", "label": "Status", "type": "string"},
            {"key": "expense_date", "label": "Expense Date", "type": "date"},
            {"key": "payment_method", "label": "Payment Method", "type": "string"},
            {"key": "billable", "label": "Billable", "type": "bool"},
        ],
        "filters": ["dateFrom", "dateTo", "status", "companyId", "departmentId", "search"],
        "numeric": ["amount", "tax_amount"],
    },
    "assets": {
        "label": "Assets",
        "date_field": None,
        "fields": [
            {"key": "employee_name", "label": "Assigned To", "type": "string", "from": "employee"},
            {"key": "asset_type", "label": "Type", "type": "string"},
            {"key": "asset_name", "label": "Asset", "type": "string"},
            {"key": "serial_number", "label": "Serial", "type": "string"},
            {"key": "status", "label": "Status", "type": "string"},
            {"key": "value", "label": "Value", "type": "number"},
        ],
        "filters": ["status", "search"],
        "numeric": ["value"],
    },
    "performance_reviews": {
        "label": "Performance Reviews",
        "date_field": None,
        "fields": [
            {"key": "employee_name", "label": "Employee", "type": "string", "from": "employee"},
            {"key": "review_period", "label": "Period", "type": "string"},
            {"key": "review_year", "label": "Year", "type": "number"},
            {"key": "overall_score", "label": "Overall Score", "type": "number"},
            {"key": "rating", "label": "Rating", "type": "string"},
            {"key": "status", "label": "Status", "type": "string"},
        ],
        "filters": ["year", "status", "search"],
        "numeric": ["review_year", "overall_score"],
    },
    "exit_records": {
        "label": "Exits (F&F)",
        "date_field": "exit_date",
        "fields": [
            {"key": "employee_name", "label": "Employee", "type": "string", "from": "employee"},
            {"key": "exit_type", "label": "Exit Type", "type": "string"},
            {"key": "exit_date", "label": "Exit Date", "type": "date"},
            {"key": "fnf_status", "label": "F&F Status", "type": "string"},
            {"key": "clearance_status", "label": "Clearance", "type": "string"},
            {"key": "approval_status", "label": "Approval", "type": "string"},
        ],
        "filters": ["dateFrom", "dateTo", "exitType", "fnfStatus", "search"],
        "numeric": [],
    },
}


@router.get("/api/reports/custom/schema")
def custom_report_schema(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Field/filter catalogue for the custom report builder."""
    sources = []
    for sid, s in CUSTOM_REPORT_SOURCES.items():
        sources.append({
            "id": sid,
            "label": s["label"],
            "fields": s["fields"],
            "filters": s["filters"],
            "numeric": s["numeric"],
            "defaultFields": [f["key"] for f in s["fields"][:6]],
        })
    return {"sources": sources, "aggregations": ["sum", "avg", "min", "max", "count"]}


def _custom_rows(db: Session, org_id: Optional[int], source_id: str, params: dict):
    """Load + project rows for one source (org-scoped, display joins)."""
    from models import (Asset, Attendance, Department, Employee, ExitRecord,
                        Expense, LeaveApplication, LeaveBalance, LeaveType, Payroll)
    spec = CUSTOM_REPORT_SOURCES[source_id]
    emp_map, dept_map, co_map, lt_map = {}, {}, {}, {}

    def _emp(eid):
        if eid not in emp_map:
            emp_map[eid] = db.query(Employee).filter(Employee.id == eid).first()
        return emp_map.get(eid)

    def _dept(did):
        if did and did not in dept_map:
            dept_map[did] = db.query(Department).filter(Department.id == did).first()
        return dept_map.get(did) if did else None

    def _co(cid):
        if cid and cid not in co_map:
            from models import Company
            co_map[cid] = db.query(Company).filter(Company.id == cid).first()
        return co_map.get(cid) if cid else None

    def _lt(lid):
        if lid not in lt_map:
            lt_map[lid] = db.query(LeaveType).filter(LeaveType.id == lid).first()
        return lt_map.get(lid)

    search = (params.get("search") or "").strip()
    status = params.get("status")
    company_id = params.get("companyId")
    department_id = params.get("departmentId")
    employee_id = params.get("employeeId")
    date_from, date_to = params.get("dateFrom"), params.get("dateTo")
    year_f = params.get("year")
    month_f = params.get("month")
    exit_type_f = params.get("exitType")
    fnf_f = params.get("fnfStatus")


    rows_out = []
    if source_id == "employees":
        q = db.query(Employee).filter(Employee.deleted_at.is_(None))
        if org_id:
            q = q.filter(Employee.organization_id == org_id)
        if status:
            q = q.filter(Employee.status == status)
        if company_id:
            q = q.filter(Employee.company_id == int(company_id))
        if department_id:
            q = q.filter(Employee.department_id == int(department_id))
        if date_from:
            q = q.filter(Employee.join_date >= date_from)
        if date_to:
            q = q.filter(Employee.join_date <= date_to)
        if search:
            like = f"%{search}%"
            from sqlalchemy import or_
            q = q.filter(or_(Employee.first_name.ilike(like), Employee.last_name.ilike(like),
                             Employee.email.ilike(like), Employee.employee_code.ilike(like)))
        for e in q.order_by(Employee.id).limit(5000).all():
            rows_out.append({
                "employee_code": e.employee_code,
                "full_name": f"{e.first_name or ''} {e.last_name or ''}".strip(),
                "email": e.email, "designation": e.designation,
                "department": (_dept(e.department_id).name if _dept(e.department_id) else None),
                "company": (_co(e.company_id).name if _co(e.company_id) else None),
                "status": e.status,
                "join_date": e.join_date.isoformat() if e.join_date else None,
                "base_salary": e.base_salary, "pay_frequency": e.pay_frequency,
                "cost_center": e.cost_center, "phone": e.phone,
            })
    elif source_id == "payroll":
        q = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
        if org_id:
            q = q.filter(Payroll.organization_id == org_id)
        if month_f:
            q = q.filter(Payroll.month == int(month_f))
        if year_f:
            q = q.filter(Payroll.year == int(year_f))
        if status:
            q = q.filter(Payroll.status == status)
        if company_id:
            q = q.filter(Payroll.company_id == int(company_id))
        if employee_id:
            q = q.filter(Payroll.employee_id == int(employee_id))
        if department_id:
            emps = db.query(Employee.id).filter(Employee.department_id == int(department_id))
            q = q.filter(Payroll.employee_id.in_(emps))
        if search:
            emps = db.query(Employee).filter(
                (Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%"))
                | (Employee.employee_code.ilike(f"%{search}%")))
            q = q.filter(Payroll.employee_id.in_([e.id for e in emps]))
        for p in q.order_by(Payroll.year.desc(), Payroll.month.desc()).limit(5000).all():
            e = _emp(p.employee_id)
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "employee_code": e.employee_code if e else None,
                "month": p.month, "year": p.year, "status": p.status,
                "basic_salary": p.basic_salary, "gross_salary": p.gross_salary,
                "pf_deduction": p.pf_deduction, "esi_deduction": p.esi_deduction,
                "professional_tax": p.professional_tax, "tds_deduction": p.tds_deduction,
                "net_salary": p.net_salary, "total_earnings": p.total_earnings,
                "total_deductions": p.total_deductions, "paid_days": p.paid_days,
            })
    elif source_id == "attendance":
        q = db.query(Attendance).filter(Attendance.deleted_at.is_(None))
        if org_id:
            q = q.filter(Attendance.organization_id == org_id)
        if date_from:
            q = q.filter(Attendance.date >= date_from)
        if date_to:
            q = q.filter(Attendance.date <= date_to)
        if status:
            q = q.filter(Attendance.status == status)
        if company_id:
            emps = db.query(Employee.id).filter(Employee.company_id == int(company_id))
            q = q.filter(Attendance.employee_id.in_(emps))
        if department_id:
            emps = db.query(Employee.id).filter(Employee.department_id == int(department_id))
            q = q.filter(Attendance.employee_id.in_(emps))
        if search:
            emps = db.query(Employee).filter(
                (Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%")))
            q = q.filter(Attendance.employee_id.in_([e.id for e in emps]))
        for a in q.order_by(Attendance.date.desc()).limit(5000).all():
            e = _emp(a.employee_id)
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "employee_code": e.employee_code if e else None,
                "date": a.date.isoformat() if a.date else None,
                "status": a.status, "work_hours": a.work_hours,
                "overtime_hours": a.overtime_hours, "is_late": a.is_late,
                "check_in": str(a.check_in) if a.check_in else None,
                "check_out": str(a.check_out) if a.check_out else None,
            })
    elif source_id == "leave_applications":
        q = db.query(LeaveApplication).filter(LeaveApplication.deleted_at.is_(None))
        if org_id:
            q = q.filter(LeaveApplication.organization_id == org_id)
        if date_from:
            q = q.filter(LeaveApplication.start_date >= date_from)
        if date_to:
            q = q.filter(LeaveApplication.start_date <= date_to)
        if status:
            q = q.filter(LeaveApplication.status == status)
        if search:
            emps = db.query(Employee).filter(
                (Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%")))
            q = q.filter(LeaveApplication.employee_id.in_([e.id for e in emps]))
        for la in q.order_by(LeaveApplication.start_date.desc()).limit(5000).all():
            e = _emp(la.employee_id)
            lt = _lt(la.leave_type_id)
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "leave_type": lt.name if lt else None,
                "start_date": la.start_date.isoformat() if la.start_date else None,
                "end_date": la.end_date.isoformat() if la.end_date else None,
                "total_days": la.total_days, "status": la.status, "reason": la.reason,
            })
    elif source_id == "leave_balances":
        q = db.query(LeaveBalance).filter(LeaveBalance.deleted_at.is_(None))
        if year_f:
            q = q.filter(LeaveBalance.year == int(year_f))
        if search:
            emps = db.query(Employee).filter(
                (Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%")))
            q = q.filter(LeaveBalance.employee_id.in_([e.id for e in emps]))
        for lb in q.limit(5000).all():
            e = _emp(lb.employee_id)
            if org_id and (e is None or e.organization_id != org_id):
                continue
            lt = _lt(lb.leave_type_id)
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "leave_type": lt.name if lt else None,
                "year": lb.year, "total_days": lb.total_days,
                "used_days": lb.used_days, "remaining_days": lb.remaining_days,
            })
    elif source_id == "expenses":
        q = db.query(Expense).filter(Expense.deleted_at.is_(None))
        if org_id:
            q = q.filter(Expense.organization_id == org_id)
        if date_from:
            q = q.filter(Expense.expense_date >= date_from)
        if date_to:
            q = q.filter(Expense.expense_date <= date_to)
        if status:
            q = q.filter(Expense.status == status)
        if company_id:
            q = q.filter(Expense.company_id == int(company_id))
        if department_id:
            q = q.filter(Expense.department_id == int(department_id))
        if search:
            emps = db.query(Employee).filter(
                (Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%")))
            q = q.filter(Expense.employee_id.in_([e.id for e in emps]))
        for x in q.order_by(Expense.expense_date.desc()).limit(5000).all():
            e = _emp(x.employee_id)
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "category": x.category, "amount": x.amount, "tax_amount": x.tax_amount,
                "status": x.status,
                "expense_date": x.expense_date.isoformat() if x.expense_date else None,
                "payment_method": x.payment_method, "billable": x.billable,
            })
    elif source_id == "assets":
        q = db.query(Asset).filter(Asset.deleted_at.is_(None))
        if status:
            q = q.filter(Asset.status == status)
        if search:
            like = f"%{search}%"
            from sqlalchemy import or_
            q = q.filter(or_(Asset.asset_name.ilike(like), Asset.serial_number.ilike(like),
                             Asset.asset_type.ilike(like)))
        for a in q.limit(5000).all():
            e = _emp(a.employee_id)
            if org_id and (e is None or e.organization_id != org_id):
                continue
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "asset_type": a.asset_type, "asset_name": a.asset_name,
                "serial_number": a.serial_number, "status": a.status, "value": a.value,
            })
    elif source_id == "performance_reviews":
        q = db.query(PerformanceReview).filter(PerformanceReview.deleted_at.is_(None))
        if org_id:
            q = q.filter(PerformanceReview.organization_id == org_id)
        if year_f:
            q = q.filter(PerformanceReview.review_year == int(year_f))
        if status:
            q = q.filter(PerformanceReview.status == status)
        if search:
            emps = db.query(Employee).filter(
                (Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%")))
            q = q.filter(PerformanceReview.employee_id.in_([e.id for e in emps]))
        for pr in q.limit(5000).all():
            e = _emp(pr.employee_id)
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "review_period": pr.review_period, "review_year": pr.review_year,
                "overall_score": pr.overall_score, "rating": pr.rating, "status": pr.status,
            })
    elif source_id == "exit_records":
        q = db.query(ExitRecord).filter(ExitRecord.deleted_at.is_(None))
        if org_id:
            q = q.filter(ExitRecord.organization_id == org_id)
        if date_from:
            q = q.filter(ExitRecord.exit_date >= date_from)
        if date_to:
            q = q.filter(ExitRecord.exit_date <= date_to)
        if exit_type_f:
            q = q.filter(ExitRecord.exit_type == exit_type_f)
        if fnf_f:
            q = q.filter(ExitRecord.fnf_status == fnf_f)
        if search:
            emps = db.query(Employee).filter(
                (Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%")))
            q = q.filter(ExitRecord.employee_id.in_([e.id for e in emps]))
        for x in q.limit(5000).all():
            e = _emp(x.employee_id)
            rows_out.append({
                "employee_name": f"{e.first_name} {e.last_name or ''}".strip() if e else None,
                "exit_type": x.exit_type,
                "exit_date": x.exit_date.isoformat() if x.exit_date else None,
                "fnf_status": x.fnf_status, "clearance_status": x.clearance_status,
                "approval_status": x.approval_status,
            })
    return rows_out


@router.get("/api/reports/custom/data")
def custom_report_data(
    dataSource: str,
    fields: Optional[str] = None,
    groupBy: Optional[str] = None,
    aggregation: Optional[str] = None,
    aggField: Optional[str] = None,
    sort: Optional[str] = None,
    order: str = "asc",
    limit: int = 500,
    search: Optional[str] = None,
    status: Optional[str] = None,
    companyId: Optional[int] = None,
    departmentId: Optional[int] = None,
    employeeId: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    exitType: Optional[str] = None,
    fnfStatus: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run a custom report: selected fields, filters, optional group-by aggregation."""
    if dataSource not in CUSTOM_REPORT_SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown data source: {dataSource}")
    spec = CUSTOM_REPORT_SOURCES[dataSource]
    org_id = current_user.organization_id if current_user.role != "superadmin" else None
    params = {
        "search": search, "status": status, "companyId": companyId,
        "departmentId": departmentId, "employeeId": employeeId,
        "month": month, "year": year, "dateFrom": dateFrom, "dateTo": dateTo,
        "exitType": exitType, "fnfStatus": fnfStatus,
    }
    rows = _custom_rows(db, org_id, dataSource, params)

    selected = [f.strip() for f in (fields or "").split(",") if f.strip()]
    field_defs = {f["key"]: f for f in spec["fields"]}
    if not selected:
        selected = [f["key"] for f in spec["fields"]]
    selected = [k for k in selected if k in field_defs]

    # Group-by + aggregation
    if groupBy and aggregation:
        gkey = groupBy if groupBy in {f["key"] for f in spec["fields"]} else None
        akey = aggField if aggField in spec["numeric"] else (spec["numeric"][0] if spec["numeric"] else None)
        agg = aggregation if aggregation in ("sum", "avg", "min", "max", "count") else "sum"
        if gkey and akey:
            buckets: dict = {}
            for r in rows:
                b = r.get(gkey)
                buckets.setdefault(b, []).append(r)
            agg_rows = []
            for b, items in buckets.items():
                vals = []
                for it in items:
                    v = it.get(akey)
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        vals.append(float(v))
                if agg == "count":
                    result_val = len(items)
                elif not vals:
                    result_val = 0
                elif agg == "sum":
                    result_val = round(sum(vals), 2)
                elif agg == "avg":
                    result_val = round(sum(vals) / len(vals), 2)
                elif agg == "min":
                    result_val = round(min(vals), 2)
                else:
                    result_val = round(max(vals), 2)
                agg_rows.append({gkey: b, f"{agg}_{akey}": result_val, "records": len(items)})
            cols = [{"key": gkey, "label": field_defs[gkey]["label"], "type": field_defs[gkey]["type"]},
                    {"key": f"{agg}_{akey}", "label": f"{agg.title()} of {field_defs[akey]['label']}", "type": "number"},
                    {"key": "records", "label": "Records", "type": "number"}]
            agg_rows.sort(key=lambda r: (r.get(f"{agg}_{akey}") is None, -(r.get(f"{agg}_{akey}") or 0)))
            return {"columns": cols, "rows": agg_rows[: max(limit, 1) or 500],
                    "rowCount": len(agg_rows), "source": dataSource,
                    "groupBy": gkey, "aggregation": agg, "aggField": akey}

    # Project selected fields
    proj = [{k: r.get(k) for k in selected} for r in rows]
    if sort and sort in selected:
        reverse = (order or "asc").lower() == "desc"
        proj.sort(key=lambda r: (r.get(sort) is None, r.get(sort)), reverse=reverse)
    cols = [{"key": k, "label": field_defs[k]["label"], "type": field_defs[k]["type"]} for k in selected]
    lim = max(1, min(int(limit or 500), 5000))
    return {"columns": cols, "rows": proj[:lim], "rowCount": len(proj),
            "source": dataSource, "truncated": len(proj) > lim}
