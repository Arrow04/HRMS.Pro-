"""Payslip generation service — PDF and JSON."""

import io
import logging
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.request import urlopen
from urllib.error import URLError

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Company, Employee, Organization, Payroll, User

logger = logging.getLogger(__name__)

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

CURRENCY_SYMBOL = "Rs."

CURRENCY_SYMBOLS = {
    "INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "AED",
    "SGD": "S$", "AUD": "A$", "CAD": "C$", "JPY": "¥", "CNY": "¥",
    "CHF": "CHF", "SAR": "SAR", "QAR": "QAR", "KWD": "KWD", "MYR": "RM",
    "THB": "฿", "IDR": "Rp", "PHP": "₱", "BRL": "R$", "MXN": "MX$",
    "ZAR": "R", "NZD": "NZ$", "HKD": "HK$", "KRW": "₩",
}


def currency_symbol(currency: Optional[str]) -> str:
    """Return a display symbol for a currency code (fallback to the code)."""
    code = (currency or "INR").upper()
    return CURRENCY_SYMBOLS.get(code, f"{code} ")


# Latin-1-safe fallbacks for the PDF (Helvetica font can't render ₹/€/¥/₩ etc.)
PDF_SAFE_SYMBOLS = {
    "₹": "Rs.", "€": "EUR ", "£": "GBP ", "¥": "Y", "฿": "THB ", "₱": "PHP ",
    "₩": "KRW ", "₫": "VND ", "₦": "NGN ", "₨": "Rs.", "₪": "ILS ", "₺": "TRY ",
}


def pdf_safe_symbol(currency: Optional[str]) -> str:
    """Latin-1-safe currency symbol for PDF rendering."""
    sym = currency_symbol(currency)
    safe = "".join(PDF_SAFE_SYMBOLS.get(ch, ch) for ch in sym)
    return safe if safe.strip() else "Rs."


def get_org(db: Session, payroll: Payroll) -> Organization:
    org_id = payroll.organization_id
    if org_id:
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if org:
            return org
    return Organization(name="Your Organization")


def get_company(db: Session, payroll: Payroll) -> Optional[Company]:
    if payroll.company_id:
        return db.query(Company).filter(Company.id == payroll.company_id).first()
    return None


def _month_name(m: int) -> str:
    return MONTH_NAMES[m - 1] if 1 <= m <= 12 else str(m)


def get_payslip_data(db: Session, payroll_id: int) -> Dict[str, Any]:
    payroll = db.query(Payroll).filter(Payroll.id == payroll_id).first()
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll not found")

    emp = db.query(Employee).filter(Employee.id == payroll.employee_id).first()
    org = get_org(db, payroll)
    company = get_company(db, payroll)

    return {
        "payroll": {
            "id": payroll.id,
            "month": payroll.month,
            "year": payroll.year,
            "month_name": _month_name(payroll.month),
            "status": payroll.status,
            "basic_salary": payroll.basic_salary or 0,
            "hra": payroll.hra or 0,
            "da": payroll.da or 0,
            "conveyance": payroll.conveyance or 0,
            "medical": payroll.medical or 0,
            "special_allowance": payroll.special_allowance or 0,
            "gross_salary": payroll.gross_salary or 0,
            "overtime_pay": payroll.overtime_pay or 0,
            "bonus": payroll.bonus or 0,
            "commission": payroll.commission or 0,
            "incentive": payroll.incentive or 0,
            "other_earnings": payroll.other_earnings or 0,
            "total_earnings": payroll.total_earnings or 0,
            "pf_deduction": payroll.pf_deduction or 0,
            "pf_employer_contribution": payroll.pf_employer_contribution or 0,
            "pf_edli_contribution": payroll.pf_edli_contribution or 0,
            "pf_admin_contribution": payroll.pf_admin_contribution or 0,
            "esi_deduction": payroll.esi_deduction or 0,
            "esi_employer_contribution": payroll.esi_employer_contribution or 0,
            "professional_tax": payroll.professional_tax or 0,
            "lwf_deduction": payroll.lwf_deduction or 0,
            "lwf_employer_contribution": payroll.lwf_employer_contribution or 0,
            "gratuity": payroll.gratuity or 0,
            "tds_deduction": payroll.tds_deduction or 0,
            "income_tax": payroll.income_tax or 0,
            "surcharge": payroll.surcharge or 0,
            "cess": payroll.cess or 0,
            "loan_deduction": payroll.loan_deduction or 0,
            "advance_deduction": payroll.advance_deduction or 0,
            "other_deductions": payroll.other_deductions or 0,
            "total_deductions": payroll.total_deductions or 0,
            "net_salary": payroll.net_salary or 0,
            "working_days": payroll.working_days or 0,
            "present_days": payroll.present_days or 0,
            "absent_days": payroll.absent_days or 0,
            "paid_days": payroll.paid_days or 0,
            "unpaid_days": payroll.unpaid_days or 0,
            "leave_days": payroll.leave_days or 0,
            "created_at": payroll.created_at.isoformat() if payroll.created_at else None,
            "component_breakdown": payroll.component_breakdown or [],
        },
        "employee": {
            "name": f"{emp.first_name} {emp.last_name}".strip() if emp else "-",
            "employee_code": emp.employee_code or "-" if emp else "-",
            "designation": emp.designation or "-" if emp else "-",
            "department": emp.department.name if emp and emp.department else "-",
            "pan_number": emp.pan_number or "-",
            "bank_name": emp.bank_name or "-",
            "bank_account_number": emp.bank_account_number or "-",
            "ifsc_code": emp.ifsc_code or "-",
            "pf_uan": emp.pf_uan or "-",
            "esic_number": emp.esic_number or "-",
            "join_date": emp.join_date.isoformat() if emp and emp.join_date else None,
        } if emp else {},
        "organization": {
            "name": org.name if org else "-",
            "legal_name": org.legal_name or org.name,
            "address": org.address or "",
            "registered_city": org.registered_city or "",
            "registered_state": org.registered_state or "",
            "country": (getattr(org, "country", None) or "India"),
            "phone": org.phone or "",
            "email": org.email or "",
            "pan_no": org.pan_no or "",
            "gst_no": org.gst_no or "",
            "logo_url": org.logo_url or "",
            "default_currency": org.default_currency or "INR",
        } if org else {},
        "company": {
            "name": company.name if company else None,
        } if company else {},
    }


def generate_payslip_pdf(db: Session, payroll_id: int) -> bytes:
    data = get_payslip_data(db, payroll_id)
    payroll = data["payroll"]
    emp = data["employee"]
    org = data["organization"]
    company = data["company"]

    # Resolve country for country-aware deduction labels
    from services.document_pdf_service import country_config
    org_country = (org or {}).get("country") or "India"
    company_country = (company or {}).get("country")
    country_code = (company_country or org_country or "India").strip()
    cfg = country_config(country_code)

    from fpdf import FPDF

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=22)

    primary = (25, 55, 109)
    accent = (41, 128, 185)
    light_bg = (245, 247, 250)
    table_header_bg = (41, 128, 185)
    table_alt = (238, 242, 247)
    text_dark = (33, 37, 41)
    text_muted = (108, 117, 125)
    border_clr = (222, 226, 230)
    white = (255, 255, 255)
    success_green = (22, 115, 60)

    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.5)
    pdf.line(10, 4, 200, 4)

    # ── HEADER ──
    pdf.set_fill_color(*primary)
    pdf.rect(0, 5, 210, 27, "F")

    pdf.set_fill_color(*accent)
    pdf.rect(0, 32, 210, 1.5, "F")

    # Logo
    logo_path = org.get("logo_url") if org else None
    if logo_path:
        try:
            logo_bytes = urlopen(logo_path, timeout=3).read()
            logo_fp = io.BytesIO(logo_bytes)
            pdf.image(logo_fp, x=14, y=7, w=22, h=22)
            title_x = 40
        except (URLError, Exception):
            title_x = 10
    else:
        title_x = 10

    pdf.set_y(7)
    pdf.set_text_color(*white)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_x(title_x)
    pdf.cell(0, 8, "PAYSLIP", align="C", new_x="LMARGIN", new_y="NEXT")

    org_name = org.get("legal_name") or org.get("name") or company.get("name") or ""
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(200, 215, 235)
    pdf.set_x(title_x)
    pdf.cell(0, 4, org_name, align="C", new_x="LMARGIN", new_y="NEXT")

    month_str = f"{payroll['month_name']} {payroll['year']}"
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*white)
    pdf.set_x(title_x)
    pdf.cell(0, 4, month_str, align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(180, 195, 215)
    pdf.set_x(title_x)
    pdf.cell(0, 4, f"{cfg['country']} Payroll · {cfg['tax_year_note']}", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(180, 195, 215)
    pdf.set_x(title_x)
    created = payroll.get("created_at")
    created_str = datetime.fromisoformat(created).strftime("%d-%b-%Y") if created else datetime.utcnow().strftime("%d-%b-%Y")
    pdf.cell(0, 3, f"Slip # {payroll['id']:06d}  |  {created_str}", align="C", new_x="LMARGIN", new_y="NEXT")

    # ── ORG ADDRESS ──
    addr_parts = []
    if org.get("address"):
        addr_parts.append(org["address"])
    if org.get("registered_city"):
        addr_parts.append(org["registered_city"])
    if org.get("registered_state"):
        addr_parts.append(org["registered_state"])
    addr_line = ", ".join(addr_parts) if addr_parts else ""
    pan_gst = []
    if org.get("pan_no"):
        pan_gst.append(f"PAN: {org['pan_no']}")
    if org.get("gst_no"):
        pan_gst.append(f"GST: {org['gst_no']}")
    pan_gst_line = "  |  ".join(pan_gst)

    if addr_line or pan_gst_line:
        addr_y = 35
        pdf.set_fill_color(*light_bg)
        pdf.set_draw_color(*border_clr)
        pdf.rect(10, addr_y, 190, 12, "DF")
        pdf.set_text_color(*text_muted)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(14, addr_y + 1)
        full_addr = addr_line
        if pan_gst_line:
            full_addr = f"{full_addr}  |  {pan_gst_line}" if full_addr else pan_gst_line
        pdf.cell(182, 10, full_addr, align="C")
        info_card_top = addr_y + 14
    else:
        info_card_top = 36

    # ── EMPLOYEE INFO CARD ──
    box_y = info_card_top
    pdf.set_draw_color(*border_clr)
    pdf.set_fill_color(*light_bg)
    pdf.rect(10, box_y, 190, 40, "DF")

    pdf.set_xy(14, box_y + 2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*accent)
    pdf.cell(0, 4, "EMPLOYEE DETAILS", new_x="LMARGIN", new_y="NEXT")

    pdf.set_draw_color(*border_clr)
    pdf.line(14, box_y + 7, 196, box_y + 7)

    pdf.set_text_color(*text_dark)
    left_items = [
        ("Name", emp.get("name", "-")),
        ("Designation", emp.get("designation", "-")),
        ("Department", emp.get("department", "-")),
        ("PAN", emp.get("pan_number", "-")),
    ]
    for i, (lbl, val) in enumerate(left_items):
        y = box_y + 9 + i * 7.5
        pdf.set_xy(14, y)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*text_muted)
        pdf.cell(22, 5, lbl)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*text_dark)
        pdf.cell(60, 5, val, new_x="RIGHT", new_y="TOP")

    right_items = [
        ("Code", emp.get("employee_code", "-")),
        ("Bank A/c", emp.get("bank_account_number", "-")),
        ("IFSC", emp.get("ifsc_code", "-")),
        ("UAN", emp.get("pf_uan", "-")),
    ]
    for i, (lbl, val) in enumerate(right_items):
        y = box_y + 9 + i * 7.5
        pdf.set_xy(103, y)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*text_muted)
        pdf.cell(20, 5, lbl)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*text_dark)
        pdf.cell(60, 5, val, new_x="RIGHT", new_y="TOP")

    # ── EARNINGS & DEDUCTIONS TABLE ──
    table_top = box_y + 44
    col_w = 90
    gap = 2
    left_x = 14
    right_x = left_x + col_w + gap

    # Determine which earnings/deductions have values
    earnings_items = [
        ("Basic Salary", "basic_salary"),
        ("House Rent Allowance", "hra"),
        ("Dearness Allowance", "da"),
        ("Conveyance Allowance", "conveyance"),
        ("Medical Allowance", "medical"),
        ("Special Allowance", "special_allowance"),
        ("Overtime Pay", "overtime_pay"),
        ("Bonus", "bonus"),
        ("Commission", "commission"),
        ("Incentive", "incentive"),
        ("Other Earnings", "other_earnings"),
    ]
    # Country-aware deduction labels
    if cfg["country"] == "USA":
        deductions_items = [
            ("Federal Income Tax", "tds_deduction"),
            ("Social Security", "pf_deduction"),
            ("Medicare", "esi_deduction"),
            ("State Income Tax", "professional_tax"),
            ("401(k)", "other_deductions"),
        ]
        employer_items = [
            ("Social Security (Employer)", "pf_employer_contribution"),
            ("Medicare (Employer)", "esi_employer_contribution"),
        ]
    elif cfg["country"] == "United Kingdom":
        deductions_items = [
            ("Income Tax (PAYE)", "tds_deduction"),
            ("National Insurance", "pf_deduction"),
            ("Pension", "other_deductions"),
        ]
        employer_items = [
            ("NI (Employer)", "pf_employer_contribution"),
        ]
    elif cfg["country"] == "UAE":
        # No income tax in UAE
        deductions_items = [
            ("Pension / EOSB", "pf_deduction"),
        ]
        employer_items = [
            ("Pension (Employer)", "pf_employer_contribution"),
        ]
    elif cfg["country"] == "Singapore":
        deductions_items = [
            ("CPF Contribution", "pf_deduction"),
            ("Income Tax", "tds_deduction"),
        ]
        employer_items = [
            ("CPF (Employer)", "pf_employer_contribution"),
        ]
    else:
        # India default
        deductions_items = [
            ("Provident Fund", "pf_deduction"),
            ("ESI Contribution", "esi_deduction"),
            ("Professional Tax", "professional_tax"),
            ("LWF Deduction", "lwf_deduction"),
            ("TDS / Income Tax", "tds_deduction"),
            ("Loan Deduction", "loan_deduction"),
            ("Advance Deduction", "advance_deduction"),
            ("Other Deductions", "other_deductions"),
        ]
        employer_items = [
            ("PF Employer", "pf_employer_contribution"),
            ("EDLI (Employer)", "pf_edli_contribution"),
            ("PF Admin (Employer)", "pf_admin_contribution"),
            ("ESI Employer", "esi_employer_contribution"),
            ("LWF Employer", "lwf_employer_contribution"),
            ("Gratuity (Employer)", "gratuity"),
        ]

    # Itemize salary arrears & leave encashment on the payslip instead of burying
    # them inside "Other Earnings". The Payroll table stores them combined, so the
    # breakdown JSON is used to re-split them for display.
    breakdown = payroll.get("component_breakdown") or []
    extra_earnings = []
    for item in breakdown:
        try:
            if item.get("type") == "earnings" and item.get("name") in ("Arrears", "Leave Encashment"):
                val = round(float(item.get("value") or 0), 2)
                if val:
                    extra_earnings.append(((item.get("display_name") or item.get("name")), val))
        except (TypeError, ValueError):
            continue
    if extra_earnings:
        itemized_total = round(sum(v for _, v in extra_earnings), 2)
        other = round(float(payroll.get("other_earnings") or 0), 2)
        payroll["other_earnings"] = max(0.0, round(other - itemized_total, 2))

    def _build_earnings():
        result = []
        for l, k in earnings_items:
            if k == "other_earnings":
                for el, ev in extra_earnings:
                    result.append((el, ev))
            val = payroll.get(k)
            if val:
                result.append((l, val))
        return result

    active_earnings = _build_earnings()
    active_deductions = [(l, payroll[k]) for l, k in deductions_items if payroll.get(k)]

    if not active_earnings:
        active_earnings = [("Basic Salary", 0)]
    if not active_deductions:
        active_deductions = [("Provident Fund", 0)]

    # Employer contributions section
    active_employer = [(l, payroll[k]) for l, k in employer_items if payroll.get(k)]

    max_rows = max(len(active_earnings), len(active_deductions))
    row_h = 7

    # Header row
    pdf.set_fill_color(*table_header_bg)
    pdf.set_text_color(*white)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(left_x, table_top)
    pdf.cell(col_w, 7, "  EARNINGS", border=1, fill=True, align="L")
    pdf.set_xy(right_x, table_top)
    pdf.cell(col_w, 7, "  DEDUCTIONS", border=1, fill=True, align="L")

    pdf.set_font("Helvetica", "", 10)

    for i in range(max_rows):
        y = table_top + 7 + i * row_h
        bg = table_alt if i % 2 == 0 else white
        pdf.set_fill_color(*bg)

        pdf.set_xy(left_x, y)
        if i < len(active_earnings):
            label, val = active_earnings[i]
            pdf.set_text_color(*text_dark)
            pdf.cell(col_w * 0.65, row_h, f"  {label}", border="L", fill=True)
            pdf.set_text_color(*text_dark)
            pdf.cell(col_w * 0.35, row_h, f"{val:,.2f}", border="LR", fill=True, align="R")
        else:
            pdf.set_text_color(*text_muted)
            pdf.cell(col_w, row_h, "", border="LR", fill=True)

        pdf.set_xy(right_x, y)
        if i < len(active_deductions):
            label, val = active_deductions[i]
            pdf.set_text_color(*text_dark)
            pdf.cell(col_w * 0.65, row_h, f"  {label}", border="L", fill=True)
            pdf.set_text_color(*text_dark)
            pdf.cell(col_w * 0.35, row_h, f"{val:,.2f}", border="LR", fill=True, align="R")
        else:
            pdf.set_text_color(*text_muted)
            pdf.cell(col_w, row_h, "", border="LR", fill=True)

        pdf.line(right_x, y, right_x, y + row_h)

    # Total row
    total_y = table_top + 7 + max_rows * row_h
    pdf.set_fill_color(*primary)
    pdf.set_text_color(*white)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(left_x, total_y)
    pdf.cell(col_w * 0.65, 7, "  GROSS EARNINGS", border=1, fill=True, align="L")
    pdf.cell(col_w * 0.35, 7, f"  {payroll['gross_salary']:,.2f}", border=1, fill=True, align="R")
    pdf.set_xy(right_x, total_y)
    pdf.cell(col_w * 0.65, 7, "  TOTAL DEDUCTIONS", border=1, fill=True, align="L")
    pdf.cell(col_w * 0.35, 7, f"  {payroll['total_deductions']:,.2f}", border=1, fill=True, align="R")

    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.4)
    pdf.line(left_x, total_y + 7, left_x + col_w * 2 + gap, total_y + 7)

    # ── EMPLOYER CONTRIBUTIONS ──
    if active_employer:
        emp_contrib_y = total_y + 12
        pdf.set_fill_color(*light_bg)
        pdf.set_draw_color(*border_clr)
        pdf.rect(14, emp_contrib_y, 182, 8 + len(active_employer) * 6, "DF")

        pdf.set_xy(18, emp_contrib_y + 2)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*accent)
        pdf.cell(0, 4, "EMPLOYER CONTRIBUTIONS", new_x="LMARGIN", new_y="NEXT")

        pdf.set_draw_color(*border_clr)
        pdf.line(18, emp_contrib_y + 6, 192, emp_contrib_y + 6)

        for i, (label, val) in enumerate(active_employer):
            y = emp_contrib_y + 8 + i * 6
            pdf.set_xy(22, y)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*text_dark)
            pdf.cell(80, 5, label)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*success_green)
            pdf.cell(30, 5, f"{val:,.2f}", align="R")

        net_section_top = emp_contrib_y + 8 + len(active_employer) * 6 + 4
    else:
        net_section_top = total_y + 12

    # ── NET PAY BOX ──
    net_y = net_section_top
    pdf.set_fill_color(*primary)
    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.6)
    pdf.rect(left_x, net_y, col_w * 2 + gap, 17, "DF")

    pdf.set_xy(left_x + 8, net_y + 4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*white)
    pdf.cell(100, 9, "NET PAY (Take Home)")
    pdf.set_font("Helvetica", "B", 15)
    sym = pdf_safe_symbol(org.get("default_currency") if org else None)
    pdf.cell(60, 9, f"{sym} {payroll['net_salary'] or 0:,.2f}", align="R")

    # ── ATTENDANCE SUMMARY ──
    att_y = net_y + 22
    pdf.set_draw_color(*border_clr)
    pdf.set_fill_color(*light_bg)
    pdf.rect(14, att_y, 182, 36, "DF")

    pdf.set_xy(18, att_y + 3)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*accent)
    pdf.cell(0, 4, "ATTENDANCE SUMMARY", new_x="LMARGIN", new_y="NEXT")

    pdf.set_draw_color(*border_clr)
    pdf.line(18, att_y + 8, 192, att_y + 8)

    att_data = [
        ("Working Days", str(payroll.get("working_days", 0))),
        ("Present Days", str(payroll.get("present_days", 0))),
        ("Absent Days", str(payroll.get("absent_days", 0))),
        ("Paid Days", str(payroll.get("paid_days", 0))),
        ("Unpaid Days", str(payroll.get("unpaid_days", 0))),
        ("Leave Days", str(payroll.get("leave_days", 0))),
    ]
    att_col_w = 28
    start_x = 17
    for i, (lbl, val) in enumerate(att_data):
        x = start_x + i * att_col_w
        pdf.set_xy(x, att_y + 11)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*text_muted)
        pdf.cell(att_col_w, 4, lbl, align="C")
        pdf.set_xy(x, att_y + 19)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(*primary)
        pdf.cell(att_col_w, 8, val, align="C")

    pdf.set_fill_color(*accent)
    pdf.rect(14, att_y + 34, 182, 1.5, "F")

    # ── FOOTER ──
    pdf.set_y(262)
    pdf.set_draw_color(*border_clr)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())

    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(*text_muted)
    pdf.cell(0, 3.5, "This is a computer-generated payslip and does not require a physical signature.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 3.5, f"Generated {datetime.utcnow().strftime('%d %B %Y at %H:%M')} UTC  |  Slip #{payroll['id']:06d}", align="C", new_x="LMARGIN", new_y="NEXT")

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf.getvalue()
