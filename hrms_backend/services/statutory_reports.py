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

# Built-in filing templates - DATA, seeded per org on demand. The
# file_layout sections reproduce the government file layouts; a new or
# revised format is a definition change (mandate section 51).
BUILTIN_REPORT_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "code": "EPF_ECR",
        "name": "EPF Electronic Challan cum Return (ECR)",
        "authority": "EPFO",
        "period_type": "monthly",
        "fields": [
            {"key": "uan", "label": "UAN", "source": "employee.pf_uan"},
            {"key": "name", "label": "Member Name", "source": "employee_name"},
            {"key": "gross_wages", "label": "Gross Wages", "source": "payroll.gross_salary"},
            {"key": "epf_wages", "label": "EPF Wages", "source": "payroll.basic_salary"},
            {"key": "eps_wages", "label": "EPS Wages", "source": "payroll.basic_salary"},
            {"key": "edli_wages", "label": "EDLI Wages", "source": "payroll.basic_salary"},
            {"key": "epf_contribution", "label": "EPF Contribution", "source": "payroll.pf_deduction"},
            {"key": "eps_contribution", "label": "EPS Contribution",
             "formula": "MIN(basic_salary, 15000) * 0.0833"},
            {"key": "epf_eps_diff", "label": "EPF EPS Difference",
             "formula": "pf_deduction - MIN(basic_salary, 15000) * 0.0833"},
            {"key": "ee_share", "label": "Employee Share", "source": "payroll.pf_deduction"},
            {"key": "er_share", "label": "Employer Share", "source": "payroll.pf_employer_contribution"},
            {"key": "ncp_days", "label": "NCP Days", "source": "payroll.unpaid_days"},
        ],
        "file_layout": {
            "type": "pipe",
            "delimiter": "~",
            "header": "#HDR#~{establishment_code}~{month:02d}-{year}~{record_count}",
            "row": ("{uan}~{name}~{gross_wages}~{epf_wages}~{eps_wages}~{edli_wages}~"
                    "{epf_contribution}~{eps_contribution}~{epf_eps_diff}~{ee_share}~"
                    "{er_share}~{ncp_days}~0"),
            "footer": "#TRL#~{record_count}~{total_gross_wages}~{total_epf_wages}~{total_ee_share}~{total_er_share}",
        },
    },
    {
        "code": "ESI_RETURN",
        "name": "ESI Monthly Return",
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
            {"key": "days", "label": "Days", "source": "payroll.paid_days"},
        ],
        "file_layout": {
            "type": "pipe",
            "delimiter": "~",
            "header": "ESIRET~{establishment_code}~{month:02d}-{year}~{record_count}",
            "row": "{esi_number}~{name}~{esi_wages}~{employee_contribution}~{employer_contribution}~{days}",
            "footer": "ESITRL~{record_count}~{total_esi_wages}~{total_employee_contribution}~{total_employer_contribution}",
        },
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
        "file_layout": {
            "type": "csv",
            "delimiter": ",",
            "row": "{pan},{name},{gross},{pt}",
        },
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


def render_filing_file(
    db: Session,
    definition: Dict[str, Any],
    organization_id: int,
    month: int,
    year: int,
    employee_ids: Optional[List[int]] = None,
    establishment_code: str = "",
) -> Dict[str, Any]:
    """Render the ACTUAL government filing file for a report definition.

    The file layout is configuration (mandate section 51: never hard-code a
    single report format):

      "file_layout": {
          "delimiter": "~",
          "header": "#HDR#~{establishment_code}~{month:02d}-{year}~{record_count}",
          "row": "{uan}~{name}~{gross_wages}~{epf_wages}~...",
          "footer": "#TRL#~{record_count}~{total_epf_wages}~..."
      }

    Templates reference rendered row values ({key}) and summary aggregates
    ({record_count}, {total_<key>}).
    """
    report = render_report(db, definition, organization_id, month, year,
                           employee_ids=employee_ids)
    layout = definition.get("file_layout") or {}
    delimiter = layout.get("delimiter", ",")
    rows = report["rows"]

    totals: Dict[str, float] = {}
    for r in rows:
        for k, v in r.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                totals[k] = round(totals.get(k, 0.0) + float(v), 2)
    ctx_base = {
        "establishment_code": establishment_code,
        "month": month,
        "year": year,
        "record_count": len(rows),
    }
    for k, v in totals.items():
        ctx_base[f"total_{k}"] = v

    def _fill(template: str, ctx: Dict[str, Any]) -> str:
        out = template
        for k, v in ctx.items():
            out = out.replace("{" + k + "}", "" if v is None else str(v))
            out = out.replace("{" + k + ":02d}", f"{int(v):02d}" if isinstance(v, (int, float)) else str(v))
        return out

    lines = []
    if layout.get("header"):
        lines.append(_fill(layout["header"], ctx_base))
    row_template = layout.get("row")
    for r in rows:
        ctx = dict(ctx_base)
        ctx.update({k: ("" if v is None else v) for k, v in r.items()})
        if row_template:
            lines.append(_fill(row_template, ctx))
        else:
            lines.append(delimiter.join(str(r.get(c["key"], "")) for c in report["columns"]))
    if layout.get("footer"):
        lines.append(_fill(layout["footer"], ctx_base))

    content = "\n".join(lines) + ("\n" if lines else "")
    fmt = layout.get("type", "pipe" if layout else "csv")
    ext = "csv" if fmt == "csv" else "txt"
    filename = f"{definition.get('code', 'REPORT')}_{year}{int(month):02d}.{ext}"
    return {
        "filename": filename,
        "content": content,
        "rowCount": len(rows),
        "totals": totals,
        "format": fmt,
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
