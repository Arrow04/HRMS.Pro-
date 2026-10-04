"""Form 16 (annual TDS certificate under Section 203) generation service.

Builds Part A (employer + TDS deposited) and Part B (computation of income
and tax) from the actual payroll records in a financial year (Apr–Mar), using
the organization's configured tax regime and slabs.
"""

import io
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Company, Employee, Organization, Payroll
from services.payslip_service import MONTH_NAMES

logger = logging.getLogger(__name__)

# Act defaults — consulted ONLY when the org's TaxRegime row predates these
# columns (they carry the same defaults in the model/migration). The caps
# actually applied below come from the TaxRegime configuration row.
STD_80C_CAP = 150000.0
STD_80D_CAP = 50000.0
NPS_CAP = 50000.0
HOME_LOAN_CAP = 200000.0


def _regime_cap(regime, attr: str, fallback: float) -> float:
    """Read a deduction cap from the org's TaxRegime; fallback only if unset."""
    val = getattr(regime, attr, None) if regime is not None else None
    try:
        if val is not None:
            return float(val)
    except (TypeError, ValueError):
        pass
    return fallback


def parse_financial_year(fy: Optional[str]) -> tuple:
    """Parse '2025-26' -> (2025, 2026). April 2025 .. March 2026 inclusive."""
    if not fy:
        fy = str(datetime.utcnow().year) if datetime.utcnow().month >= 4 else str(datetime.utcnow().year - 1)
    fy = fy.strip()
    start = int(fy[:4])
    return start, start + 1


def get_form16_data(db: Session, employee_id: int, financial_year: Optional[str] = None) -> Dict[str, Any]:
    emp = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    fy_start, fy_end = parse_financial_year(financial_year)

    payrolls = (
        db.query(Payroll)
        .filter(
            Payroll.deleted_at.is_(None),
            Payroll.employee_id == employee_id,
            Payroll.status.in_(("approved", "processed", "paid")),
        )
        .all()
    )
    period_payrolls = [
        p for p in payrolls
        if (p.year, p.month) >= (fy_start, 4) and (p.year, p.month) <= (fy_end, 3)
    ]
    period_payrolls.sort(key=lambda p: (p.year, p.month))

    org = db.query(Organization).filter(Organization.id == (emp.organization_id or emp.org_id)).first() if hasattr(emp, "org_id") else None
    if org is None:
        org = db.query(Organization).filter(Organization.id == emp.organization_id).first()
    company = db.query(Company).filter(Company.id == emp.company_id).first() if emp.company_id else None

    # The deductor (employer) is the legal entity the employee belongs to. For a
    # company-wise payroll that is the Company; otherwise the Organization. Each
    # legal entity carries its own registered TAN/PAN used for Form 16 Part B.
    employer_name = (company.name if company else None) or (org.name if org else None)
    employer_legal_name = (company.name if company else None) or ((org.legal_name or org.name) if org else None)
    employer_address = (company.address if company and company.address else None) or (org.address if org else "") or ""
    employer_tan = ((company.tan_no if company else None) or (org.tan_no if org else None)) or ""
    employer_pan = ((company.pan_no if company else None) or (org.pan_no if org else None)) or ""
    employer_gst = ((company.gst_no if company else None) or (org.gst_no if org else None)) or ""
    employer_email = (company.email if company and company.email else None) or (org.email if org else "") or ""

    from services.payroll_service import _get_annual_tax, _get_tax_regime
    regime = _get_tax_regime(db, emp)

    gross = sum(float(p.gross_salary or 0) for p in period_payrolls)
    pf_employee = sum(float(p.pf_deduction or 0) for p in period_payrolls)
    pf_employer = sum(float(p.pf_employer_contribution or 0) for p in period_payrolls)
    esi_employee = sum(float(p.esi_deduction or 0) for p in period_payrolls)
    esi_employer = sum(float(p.esi_employer_contribution or 0) for p in period_payrolls)
    pt = sum(float(p.professional_tax or 0) for p in period_payrolls)
    lwf = sum(float(p.lwf_deduction or 0) for p in period_payrolls)
    gratuity = sum(float(p.gratuity or 0) for p in period_payrolls)
    tds = sum(float(p.tds_deduction or 0) for p in period_payrolls)
    total_deductions = sum(float(p.total_deductions or 0) for p in period_payrolls)
    net = sum(float(p.net_salary or 0) for p in period_payrolls)

    # Old-regime exemptions configured in org.settings.payroll.tax_exemptions
    exemptions = {}
    try:
        exemptions = ((org.settings or {}).get("payroll", {}) or {}).get("tax_exemptions", {}) or {}
    except Exception:
        exemptions = {}

    def _cap(key: str, cap: float, cap_by_contribution: float = 0.0) -> float:
        val = float(exemptions.get(key, 0) or 0)
        if cap_by_contribution:
            val = max(val, cap_by_contribution)
        return min(val, cap)

    hra_exempt = float(exemptions.get("hra", 0) or 0)
    lta_exempt = float(exemptions.get("lta", 0) or 0)
    cap_80c = _regime_cap(regime, "section_80c_old_cap", 0.0) or _regime_cap(regime, "section_80c_cap", STD_80C_CAP)
    ded_80c = _cap("80c", cap_80c, cap_by_contribution=pf_employee)
    ded_80d = _cap("80d", _regime_cap(regime, "section_80d_cap", STD_80D_CAP))
    ded_nps = _cap("nps", _regime_cap(regime, "section_80ccd_1b_cap", NPS_CAP))
    ded_home_loan = _cap("home_loan", _regime_cap(regime, "section_24_home_loan_cap", HOME_LOAN_CAP))

    regime_is_new = regime is not None and str(getattr(regime, "regime_type", "new") or "new").lower() == "new"
    std_deduction = _regime_cap(regime, "standard_deduction", 50000.0)

    gross_salary_income = gross  # payroll gross = employee's taxable salary (employer PF/ESI/gratuity are separate)
    exempt_allowances = (hra_exempt + lta_exempt) if not regime_is_new else 0.0
    net_salary = max(0.0, gross_salary_income - exempt_allowances)
    chapter_vi_a = 0.0
    if not regime_is_new:
        chapter_vi_a = ded_80c + ded_80d + ded_nps + ded_home_loan
    total_income = max(0.0, net_salary - std_deduction - chapter_vi_a)

    tax_on_total = _get_annual_tax(total_income, regime) if regime else 0.0

    # Recompute the breakdown: base tax, rebate, surcharge, cess (mirrors payroll_service)
    base_tax = 0.0
    slabs = sorted((regime.slabs or []), key=lambda s: s.from_amount) if regime else []
    prev = 0.0
    for slab in slabs:
        upper = slab.to_amount if slab.to_amount is not None else float("inf")
        taxable = min(total_income, upper) - prev
        if taxable > 0:
            base_tax += taxable * slab.rate / 100.0
        prev = upper
    rebate = 0.0
    surcharge = 0.0
    if regime:
        from services.compliance_engine import apply_tax_relief
        base_tax, rebate, surcharge = apply_tax_relief(
            base_tax, total_income, regime.slabs,
            rebate_threshold=regime.rebate_threshold,
            rebate_amount=regime.rebate_amount,
            regime_type=getattr(regime, "regime_type", "new"),
            surcharge_slabs=regime.surcharge_config,
        )
    cess = (base_tax + surcharge) * (regime.cess_rate or 0) / 100.0 if regime and regime.cess_rate is not None else 0.0
    total_tax = base_tax + surcharge + cess

    months_paid = len(period_payrolls)
    return {
        "financial_year": f"{fy_start}-{str(fy_end)[2:]}",
        "period": f"April {fy_start} to March {fy_end}",
        "months_paid": months_paid,
        "employee": {
            "name": f"{emp.first_name} {emp.last_name or ''}".strip() or "-",
            "employee_code": emp.employee_code or "-",
            "designation": emp.designation or "-",
            "pan_number": emp.pan_number or "",
            "address": emp.address or "",
            "email": emp.email or "",
            "join_date": emp.join_date.isoformat() if emp.join_date else None,
        },
        "organization": {
            "name": employer_name or "Your Organization",
            "legal_name": employer_legal_name or "Your Organization",
            "address": employer_address or "",
            "city": (company.registered_city if company and getattr(company, "registered_city", None) else (org.registered_city if org else "")) or "",
            "state": (company.registered_state if company and getattr(company, "registered_state", None) else (org.registered_state if org else "")) or "",
            "pan_no": employer_pan,
            "tan_no": employer_tan,
            "gst_no": employer_gst,
            "email": employer_email,
        },
        "company": {"name": company.name if company else None},
        "totals": {
            "gross": gross,
            "pf_employee": pf_employee,
            "pf_employer": pf_employer,
            "esi_employee": esi_employee,
            "esi_employer": esi_employer,
            "professional_tax": pt,
            "lwf": lwf,
            "gratuity": gratuity,
            "tds": tds,
            "total_deductions": total_deductions,
            "net": net,
        },
        "computation": {
            "gross_salary_income": gross_salary_income,
            "exempt_allowances": exempt_allowances,
            "net_salary": net_salary,
            "standard_deduction": std_deduction,
            "chapter_vi_a": chapter_vi_a,
            "deductions": {
                "80c": ded_80c,
                "80d": ded_80d,
                "nps": ded_nps,
                "home_loan": ded_home_loan,
                "lta": lta_exempt,
            },
            "regime_is_new": regime_is_new,
            "regime_name": (regime.name if regime else "Standard"),
            "total_income": total_income,
            "base_tax": base_tax,
            "rebate": rebate,
            "surcharge": surcharge,
            "cess": cess,
            "total_tax": total_tax,
            "tds_deducted": tds,
            "tax_payable": max(0.0, total_tax - tds),
            "refund": max(0.0, tds - total_tax),
        },
        "monthly_breakdown": [
            {
                "month": MONTH_NAMES[p.month - 1] if 1 <= p.month <= 12 else str(p.month),
                "year": p.year,
                "gross": float(p.gross_salary or 0),
                "tds": float(p.tds_deduction or 0),
                "pf": float(p.pf_deduction or 0),
                "net": float(p.net_salary or 0),
                "status": p.status,
            }
            for p in period_payrolls
        ],
        "eligibility": {
            # Form 16 is only legally issuable under Section 203 when TDS was
            # actually deducted from salary during the financial year.
            "eligible": months_paid > 0 and tds > 0,
            "has_tan_pan": bool(
                employer_tan.strip() and employer_pan.strip()
            ),
            "months_paid": months_paid,
            "tds": tds,
            "reason": (
                "No income tax (TDS) was deducted from salary in this financial year, "
                "so a Form 16 certificate is not applicable under Section 203 of the "
                "Income-tax Act, 1961. A Salary/Service Certificate is issued instead."
                if not (months_paid > 0 and tds > 0)
                else "Eligible — TDS was deducted and is reported to the Income Tax Department."
            ),
        },
    }


def generate_form16_pdf(db: Session, employee_id: int, financial_year: Optional[str] = None) -> bytes:
    data = get_form16_data(db, employee_id, financial_year)
    from fpdf import FPDF

    emp = data["employee"]
    org = data["organization"]
    comp = data["computation"]
    tot = data["totals"]

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    primary = (25, 55, 109)
    accent = (41, 128, 185)
    light_bg = (245, 247, 250)
    text_dark = (33, 37, 41)
    text_muted = (108, 117, 125)
    border_clr = (200, 205, 212)

    def section_header(title: str, subtitle: str = ""):
        pdf.set_fill_color(*primary)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*text_muted)
        if subtitle:
            pdf.cell(0, 5, subtitle, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

    def kv(y: float, label: str, value: str, x: float = 16, w: int = 70, vw: int = 95):
        pdf.set_xy(x, y)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*text_muted)
        pdf.cell(w, 5, label)
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(*text_dark)
        pdf.cell(vw, 5, value, new_x="LMARGIN", new_y="TOP")

    def money_row(label: str, value: float, bold: bool = False, indent: int = 0):
        pdf.set_font("Helvetica", "B" if bold else "", 9)
        pdf.set_text_color(*text_dark if bold else text_muted)
        pdf.cell(10 + indent, 5.5, "")
        pdf.cell(110, 5.5, label)
        pdf.set_font("Helvetica", "B" if bold else "", 9)
        pdf.set_text_color(*text_dark)
        pdf.cell(40, 5.5, f"{value:,.2f}", align="R", new_x="LMARGIN", new_y="NEXT")

    # ── Header ──
    pdf.set_fill_color(*primary)
    pdf.rect(0, 0, 210, 26, "F")
    pdf.set_fill_color(*accent)
    pdf.rect(0, 26, 210, 1.5, "F")
    pdf.set_y(6)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 8, "FORM 16", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(210, 222, 240)
    pdf.cell(0, 4, "Certificate u/s 203 of the Income-tax Act, 1961 - TDS from Salary", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, f"Financial Year {data['financial_year']}  ({data['period']})", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, "EMPLOYER'S PART B COMPUTATION - PART A (TDS certificate) must be downloaded from TRACES", align="C", new_x="LMARGIN", new_y="NEXT")

    y = 34

    # ── Part A ──
    section_header("PART A - TDS FROM SALARY", "Employer details and tax deposited to the credit of the Central Government")
    pdf.set_draw_color(*border_clr)
    pdf.set_fill_color(*light_bg)
    pdf.rect(12, pdf.get_y(), 186, 44, "DF")
    base_y = pdf.get_y() + 3
    kv(base_y, "Employer (Name & Address):", f"{org['legal_name']}")
    kv(base_y + 6, "", f"{org['address']}{', ' if org['address'] else ''}{org['city']} {org['state']}".strip().strip(','))
    kv(base_y + 12, "TAN of Employer:", org['tan_no'] or "-")
    kv(base_y + 18, "PAN of Employer:", org['pan_no'] or "-")
    kv(base_y + 24, "GST No:", org['gst_no'] or "-")
    pdf.set_xy(112, base_y)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*text_muted)
    pdf.cell(20, 5, "Employee:")
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*text_dark)
    pdf.cell(70, 5, emp["name"], new_x="LMARGIN", new_y="TOP")
    pdf.set_xy(112, base_y + 6)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*text_muted)
    pdf.cell(20, 5, "PAN:")
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*text_dark)
    pdf.cell(70, 5, emp["pan_number"] or "-", new_x="LMARGIN", new_y="TOP")
    pdf.set_xy(112, base_y + 12)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*text_muted)
    pdf.cell(20, 5, "Designation:")
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*text_dark)
    pdf.cell(70, 5, emp["designation"], new_x="LMARGIN", new_y="TOP")

    pdf.ln(52)
    pdf.set_fill_color(*light_bg)
    pdf.set_draw_color(*border_clr)
    pdf.rect(12, pdf.get_y(), 186, 26, "DF")
    base_y2 = pdf.get_y() + 3
    kv(base_y2, "Summary of TDS deducted:", f"Total TDS deducted from salary: Rs. {tot['tds']:,.2f}")
    kv(base_y2 + 6, "", f"Total tax deposited to the credit of the Government: Rs. {tot['tds']:,.2f}")
    kv(base_y2 + 12, "", f"Months paid during the year: {data['months_paid']} (see monthly table below)")
    pdf.ln(34)

    # ── Part B ──
    section_header("PART B - COMPUTATION OF TOTAL INCOME AND TAX", f"Tax regime: {comp['regime_name']} ({'New Regime' if comp['regime_is_new'] else 'Old Regime'})")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*text_muted)
    pdf.cell(120, 5.5, "Particulars", new_x="LMARGIN", new_y="NEXT")
    money_row("1.  Income from salaries (gross)", comp["gross_salary_income"], indent=0)
    money_row("    Less: Exempt allowances (HRA/LTA)", comp["exempt_allowances"], indent=2)
    money_row("2.  Net salary", comp["net_salary"], bold=True)
    money_row("    Less: Standard deduction u/s 16(ia)", comp["standard_deduction"], indent=2)
    money_row("    Less: Chapter VI-A deductions (80C/80D/NPS/Home loan)", comp["chapter_vi_a"], indent=2)
    money_row("      - 80C (incl. PF)", comp["deductions"]["80c"], indent=4)
    money_row("      - 80D (health insurance)", comp["deductions"]["80d"], indent=4)
    money_row("      - NPS (80CCD)", comp["deductions"]["nps"], indent=4)
    money_row("      - Home loan interest (24b)", comp["deductions"]["home_loan"], indent=4)
    money_row("      - LTA", comp["deductions"]["lta"], indent=4)
    money_row("3.  Total income", comp["total_income"], bold=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*text_muted)
    pdf.cell(120, 5.5, "Tax computation", new_x="LMARGIN", new_y="NEXT")
    money_row("4.  Tax on total income (slab rates)", comp["base_tax"])
    money_row("    Less: Rebate u/s 87A", comp["rebate"], indent=2)
    money_row("5.  Add: Surcharge", comp["surcharge"])
    money_row("6.  Add: Health & Education Cess", comp["cess"])
    money_row("7.  Total tax liability", comp["total_tax"], bold=True)
    money_row("    Less: TDS already deducted from salary", comp["tds_deducted"], indent=2)
    money_row("8.  Tax payable / (refund due)", comp["tax_payable"] - comp["refund"], bold=True)

    # ── Monthly TDS table ──
    pdf.ln(3)
    section_header("MONTHLY TDS DEDUCTION SUMMARY", "Salary and tax deducted each month of the financial year")
    col_w = [26, 44, 40, 40, 36]
    headers = ["Month", "Gross Salary", "PF", "TDS", "Net Pay"]
    total_w = sum(col_w)
    x0 = (210 - total_w) / 2
    pdf.set_fill_color(*accent)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    for i, h in enumerate(headers):
        pdf.set_xy(x0 + sum(col_w[:i]), pdf.get_y())
        pdf.cell(col_w[i], 6, h, border=1, fill=True, align="C")
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 9)
    for idx, row in enumerate(data["monthly_breakdown"]):
        pdf.set_fill_color(*light_bg if idx % 2 else (255, 255, 255))
        pdf.set_text_color(*text_dark)
        cells = [f"{row['month']} {row['year']}", f"{row['gross']:,.2f}", f"{row['pf']:,.2f}", f"{row['tds']:,.2f}", f"{row['net']:,.2f}"]
        for i, c in enumerate(cells):
            pdf.set_xy(x0 + sum(col_w[:i]), pdf.get_y())
            pdf.cell(col_w[i], 6, c, border=1, fill=True, align="C")
        pdf.ln(6)
    if not data["monthly_breakdown"]:
        pdf.set_text_color(*text_muted)
        pdf.cell(0, 6, "No salary paid in this financial year.", align="C", new_x="LMARGIN", new_y="NEXT")

    # ── Footer ──
    pdf.ln(6)
    pdf.set_draw_color(*border_clr)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(*text_muted)
    pdf.cell(0, 4, "This is the EMPLOYER'S PART B computation. Part A is the TDS certificate issued by TRACES (traces.gov.in)", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, "after the employer files Form 24Q using its registered TAN. Issue Part A only from TRACES, never from this document.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, f"Generated {datetime.utcnow().strftime('%d %B %Y')}  |  Employee: {emp['name']} ({emp['employee_code']})", align="C", new_x="LMARGIN", new_y="NEXT")

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf.getvalue()


def generate_salary_certificate_pdf(db: Session, employee_id: int, financial_year: Optional[str] = None) -> bytes:
    """Salary/Service Certificate — the correct document when no TDS was deducted.

    Issued instead of Form 16 under Section 203 when an employee drew salary but
    no tax was deducted, so Form 16 is not applicable.
    """
    data = get_form16_data(db, employee_id, financial_year)
    from fpdf import FPDF

    emp = data["employee"]
    org = data["organization"]
    tot = data["totals"]

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    primary = (25, 55, 109)
    accent = (41, 128, 185)
    light_bg = (245, 247, 250)
    text_dark = (33, 37, 41)
    text_muted = (108, 117, 125)
    border_clr = (200, 205, 212)

    # Header
    pdf.set_fill_color(*primary)
    pdf.rect(0, 0, 210, 26, "F")
    pdf.set_fill_color(*accent)
    pdf.rect(0, 26, 210, 1.5, "F")
    pdf.set_y(6)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 8, "SALARY / SERVICE CERTIFICATE", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(210, 222, 240)
    pdf.cell(0, 5, f"Financial Year {data['financial_year']}  ({data['period']})", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)
    pdf.set_draw_color(*border_clr)
    pdf.set_fill_color(*light_bg)
    pdf.rect(14, pdf.get_y(), 182, 46, "DF")
    base_y = pdf.get_y() + 3
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*text_muted)
    pdf.cell(30, 5, "Issued to:")
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*text_dark)
    pdf.cell(120, 5, emp["name"], new_x="LMARGIN", new_y="TOP")
    rows = [
        ("Employee code", emp["employee_code"]),
        ("PAN", emp["pan_number"] or "-"),
        ("Designation", emp["designation"]),
        ("Period of employment", data["period"]),
        ("Months paid", str(data["months_paid"])),
    ]
    for i, (lbl, val) in enumerate(rows):
        y = base_y + 6 + i * 7
        pdf.set_xy(14, y)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*text_muted)
        pdf.cell(34, 5, lbl + ":")
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(*text_dark)
        pdf.cell(120, 5, val, new_x="LMARGIN", new_y="TOP")

    pdf.ln(58)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*text_dark)
    pdf.multi_cell(182, 6, (
        f"This is to certify that {emp['name']} was employed with {org['legal_name']} "
        f"during the financial year {data['financial_year']}. "
        f"The salary paid to the employee in this period is summarised below."
    ))
    pdf.ln(2)

    # Salary summary table
    col_w = [70, 54, 58]
    total_w = sum(col_w)
    x0 = (210 - total_w) / 2
    pdf.set_fill_color(*accent)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(x0, pdf.get_y())
    pdf.cell(col_w[0], 6, "Particulars", border=1, fill=True)
    pdf.cell(col_w[1], 6, "Employee share", border=1, fill=True, align="C")
    pdf.cell(col_w[2], 6, "Employer share", border=1, fill=True, align="C")
    pdf.ln(6)
    pdf.set_text_color(*text_dark)
    pdf.set_font("Helvetica", "", 9)
    rows_data = [
        ("Gross salary paid", tot["gross"], 0.0),
        ("Provident Fund", tot["pf_employee"], tot["pf_employer"]),
        ("ESI", tot["esi_employee"], tot["esi_employer"]),
        ("Professional Tax", tot["professional_tax"], 0.0),
        ("LWF", tot["lwf"], 0.0),
        ("TDS / Income Tax deducted", tot["tds"], 0.0),
    ]
    for idx, (lbl, emp_s, emp_r) in enumerate(rows_data):
        pdf.set_fill_color(*light_bg if idx % 2 else (255, 255, 255))
        pdf.set_xy(x0, pdf.get_y())
        pdf.cell(col_w[0], 6, f"  {lbl}", border=1, fill=True)
        pdf.cell(col_w[1], 6, f"{emp_s:,.2f}", border=1, fill=True, align="C")
        pdf.cell(col_w[2], 6, f"{emp_r:,.2f}" if emp_r else "-", border=1, fill=True, align="C")
        pdf.ln(6)
    pdf.set_fill_color(*primary)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(x0, pdf.get_y())
    pdf.cell(col_w[0], 6, "  Net amount paid to employee", border=1, fill=True)
    pdf.cell(col_w[1], 6, f"{tot['net']:,.2f}", border=1, fill=True, align="C")
    pdf.cell(col_w[2], 6, "", border=1, fill=True)
    pdf.ln(10)

    pdf.set_text_color(*text_dark)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(182, 6, (
        "No income tax (TDS) was deducted from the employee's salary during this "
        "period; hence a Form 16 certificate is not applicable under Section 203 of "
        "the Income-tax Act, 1961."
    ))
    pdf.ln(2)
    pdf.multi_cell(182, 6, (
        "For income-tax verification, the employee may check their Form 26AS / Annual "
        "Information Statement (AIS) on the Income Tax e-filing portal "
        "(www.incometax.gov.in) under their PAN."
    ))
    pdf.ln(10)

    # Signature block
    pdf.set_draw_color(*border_clr)
    pdf.line(120, pdf.get_y(), 195, pdf.get_y())
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*text_muted)
    pdf.cell(0, 5, f"For {org['legal_name']}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, "Authorised Signatory", new_x="LMARGIN", new_y="NEXT")

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf.getvalue()