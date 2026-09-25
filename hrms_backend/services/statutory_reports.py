"""Statutory report rendering (mandate section 51).

The renderer is generic: a StatutoryReportDefinition supplies fields
(source columns or safe DSL formulas) and the module turns payroll rows into
a filing-ready table. EPF ECR, ESI returns, PT statements and any future
format are CONFIGURATION rows, never hard-coded report code.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from services.rule_dsl import evaluate_expression

__all__ = ["BUILTIN_REPORT_DEFINITIONS", "render_report", "ensure_builtin_definitions"]

# Built-in filing templates - DATA, seeded per org on demand.
BUILTIN_REPORT_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "code": "EPF_ECR",
        "name": "EPF Electronic Challan cum Return (ECR)",
        "authority": "EPFO",
        "period_type": "monthly",
        "fields": [
            {"key": "uan", "label": "UAN", "source": "employee.pf_uan"},
            {"key": "name", "label": "Member Name", "source": "employee_name"},
            {"key": "epf_wages", "label": "EPF Wages", "source": "payroll.basic_salary"},
            {"key": "employee_share", "label": "Employee Share", "source": "payroll.pf_deduction"},
            {"key": "employer_share", "label": "Employer Share", "source": "payroll.pf_employer_contribution"},
        ],
    },
    {
        "code": "ESI_RETURN",
        "name": "ESI Half-Yearly Return",
        "authority": "ESIC",
        "period_type": "monthly",
        "fields": [
            {"key": "esi_number", "label": "IP Number", "source": "employee.esic_number"},
            {"key": "name", "label": "Name", "source": "employee_name"},
            {"key": "esi_wages", "label": "ESI Wages", "source": "payroll.gross_salary"},
            {"key": "employee_contribution", "label": "Employee Contribution",
             "source": "payroll.esi_deduction"},
            {"key": "employer_contribution", "label": "Employer Contribution",
             "source": "payroll.esi_employer_contribution"},
        ],
    },
    {
        "code": "PT_STATEMENT",
        "name": "Professional Tax Statement",
        "authority": "State PT Department",
        "period_type": "monthly",
        "fields": [
            {"key": "pan", "label": "PAN", "source": "employee.pan_number"},
            {"key": "name", "label": "Name", "source": "employee_name"},
            {"key": "gross", "label": "Gross", "source": "payroll.gross_salary"},
            {"key": "pt", "label": "PT Deducted", "source": "payroll.professional_tax"},
        ],
    },
]


def _resolve_source(row: Dict[str, Any], employee, source: str) -> Any:
    if source == "employee_name":
        return f"{getattr(employee, 'first_name', '')} {getattr(employee, 'last_name', '') or ''}".strip() if employee else ""
    if source.startswith("employee."):
        return getattr(employee, source.split(".", 1)[1], None) if employee else None
    if source.startswith("payroll."):
        return row.get(source.split(".", 1)[1])
    return row.get(source)


def render_report(
    db: Session,
    definition: Dict[str, Any],
    organization_id: int,
    month: int,
    year: int,
    employee_ids: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """Render one period of payroll rows per the report definition."""
    from models import Employee, Payroll

    q = db.query(Payroll).filter(
        Payroll.organization_id == organization_id,
        Payroll.month == month, Payroll.year == year,
        Payroll.deleted_at.is_(None),
    )
    if employee_ids:
        q = q.filter(Payroll.employee_id.in_(employee_ids))
    payrolls = q.all()

    fields = definition.get("fields") or []
    rows = []
    for p in payrolls:
        emp = db.query(Employee).filter(Employee.id == p.employee_id).first()
        record = {
            k: getattr(p, k, None)
            for k in ("gross_salary", "basic_salary", "pf_deduction", "esi_deduction",
                      "professional_tax", "pf_employer_contribution", "esi_employer_contribution",
                      "net_salary", "tds_deduction")
        }
        out: Dict[str, Any] = {"employeeId": p.employee_id, "month": month, "year": year}
        for f in fields:
            if f.get("formula"):
                ctx = dict(record)
                if emp is not None:
                    ctx["EMPLOYEE_NAME"] = f"{emp.first_name} {emp.last_name or ''}".strip()
                try:
                    out[f["key"]] = evaluate_expression(f["formula"], ctx)
                except Exception as exc:
                    out[f["key"]] = f"ERROR: {exc}"
            else:
                out[f["key"]] = _resolve_source(record, emp, f.get("source", f["key"]))
        rows.append(out)

    return {
        "code": definition.get("code"),
        "name": definition.get("name"),
        "authority": definition.get("authority"),
        "period": {"month": month, "year": year},
        "columns": [{"key": f["key"], "label": f.get("label", f["key"])} for f in fields],
        "rows": rows,
        "rowCount": len(rows),
    }


def ensure_builtin_definitions(db: Session, organization_id: Optional[int] = None) -> int:
    """Seed the built-in filing templates as (possibly org-scoped) rows."""
    from models import StatutoryReportDefinition

    created = 0
    for d in BUILTIN_REPORT_DEFINITIONS:
        exists = db.query(StatutoryReportDefinition).filter(
            StatutoryReportDefinition.code == d["code"],
            StatutoryReportDefinition.organization_id == organization_id,
        ).first()
        if exists:
            continue
        db.add(StatutoryReportDefinition(
            organization_id=organization_id,
            code=d["code"], name=d["name"], authority=d.get("authority"),
            fields=d["fields"], period_type=d.get("period_type", "monthly"),
            file_format="csv", effective_from=date(2020, 1, 1), status="active",
        ))
        created += 1
    if created:
        db.commit()
    return created
