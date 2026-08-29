"""
Unified PDF generator for all HRMS paperwork (offer letters, payslips, exit documents).
Handles: company logo, org header, footer, and consistent styling.
"""
from datetime import datetime
from typing import Dict, Optional
from urllib.request import urlopen


def load_logo_path(logo_url: Optional[str], tmp_dir: str = "uploads/logos") -> Optional[str]:
    """Download the logo to a local temp path fpdf can read (or None if unavailable)."""
    if not logo_url:
        return None
    try:
        import io
        import os
        # Resolve relative URLs against the backend origin
        url = logo_url
        if url.startswith("/"):
            url = "http://localhost:8001" + url
        data = urlopen(url, timeout=5).read()
        ext = ".png"
        if url.lower().endswith((".jpg", ".jpeg")):
            ext = ".jpg"
        elif url.lower().endswith(".svg"):
            ext = ".png"  # fpdf can't render svg; skip logos that are svg
        os.makedirs(tmp_dir, exist_ok=True)
        path = os.path.join(tmp_dir, f"logo_{abs(hash(url))}{ext}")
        with open(path, "wb") as f:
            f.write(data)
        return path
    except Exception:
        return None


def _resolve_country(org_country: Optional[str], company_country: Optional[str]) -> str:
    return (company_country or org_country or "India").strip()


def country_config(country_code: str) -> Dict:
    """Country-specific payroll/tax labels & tax form for documents."""
    c = country_code.lower()
    if c in ("us", "usa", "united states", "united states of america"):
        return {
            "country": "USA",
            "currency": "USD",
            "tax_form": "W-2",
            "tax_form_name": "W-2 Wage and Tax Statement",
            "tax_year_note": "Tax year is January - December",
            "deduction_labels": ["Federal Income Tax", "Social Security", "Medicare", "State Income Tax", "401(k)"],
            "deduction_keys": ["federal_tax", "social_security", "medicare", "state_tax", "retirement_401k"],
            "has_income_tax": True,
            "no_tax_note": None,
        }
    if c in ("uk", "gb", "united kingdom", "england", "scotland", "wales"):
        return {
            "country": "United Kingdom",
            "currency": "GBP",
            "tax_form": "P45",
            "tax_form_name": "P45 (Certificate of Pay and Tax Deducted)",
            "tax_year_note": "Tax year is 6 April - 5 April",
            "deduction_labels": ["Income Tax (PAYE)", "National Insurance"],
            "deduction_keys": ["paye_tax", "national_insurance"],
            "has_income_tax": True,
            "no_tax_note": None,
        }
    if c in ("uae", "united arab emirates", "dubai", "abu dhabi"):
        return {
            "country": "UAE",
            "currency": "AED",
            "tax_form": None,
            "tax_form_name": "No income tax — tax form not applicable",
            "tax_year_note": "Tax year is January - December",
            "deduction_labels": [],
            "deduction_keys": [],
            "has_income_tax": False,
            "no_tax_note": "There is no personal income tax in the UAE. No tax certificate is issued.",
        }
    if c in ("sg", "singapore"):
        return {
            "country": "Singapore",
            "currency": "SGD",
            "tax_form": "IR8A",
            "tax_form_name": "IR8A (Form for Tax Clearance / Employment Income)",
            "tax_year_note": "Tax year is January - December",
            "deduction_labels": ["CPF Contribution"],
            "deduction_keys": ["cpf"],
            "has_income_tax": True,
            "no_tax_note": None,
        }
    # Default: India-style
    return {
        "country": "India",
        "currency": "INR",
        "tax_form": "Form 16",
        "tax_form_name": "Form 16 (TDS Certificate under Section 203)",
        "tax_year_note": "Tax year is April - March (Financial Year)",
        "deduction_labels": ["Provident Fund (PF)", "Professional Tax", "TDS / Income Tax"],
        "deduction_keys": ["pf_deduction", "professional_tax", "tds_deduction"],
        "has_income_tax": True,
        "no_tax_note": None,
    }


def _logo_meta(logo_url: Optional[str]):
    """Return (path, width_mm, height_mm) for the logo or (None, None, None)."""
    path = load_logo_path(logo_url)
    if not path:
        return None, None, None
    try:
        from PIL import Image
        img = Image.open(path)
        w, h = img.size
        # scale to ~18mm wide max, preserve aspect
        target_w = 18.0
        scale = target_w / w
        return path, target_w, h * scale
    except Exception:
        return None, None, None


def render_document_pdf(
    title: str,
    body_html_parts: str,  # plain-ish text content (will be split into lines)
    org: Dict,
    company: Optional[Dict] = None,
    extra_meta: Optional[Dict] = None,
    country: Optional[str] = None,
) -> bytes:
    """
    Build a clean A4 PDF with logo + org header + body + footer.
    org/company are dicts with keys: name, legal_name, address, email, phone, logo_url, default_currency, country, tax_id, registration_number
    """
    from fpdf import FPDF

    org_name = (org.get("legal_name") or org.get("name") or "Our Organisation")
    country_code = _resolve_country(country or org.get("country"), (company or {}).get("country"))
    cfg = country_config(country_code)

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=22)

    # Register a Unicode font so currency symbols (₹, $, £, €) render correctly.
    # Arial (Windows) ships with these glyphs; fpdf2 can embed a TTF.
    _UNICODE_FONT = "UnicodeArial"
    _FONT_PATH = r"C:\Windows\Fonts\arial.ttf"
    _FONT_PATH_B = r"C:\Windows\Fonts\arialbd.ttf"
    _FONT_PATH_I = r"C:\Windows\Fonts\ariali.ttf"
    try:
        import os
        if os.path.exists(_FONT_PATH):
            pdf.add_font(_UNICODE_FONT, "", _FONT_PATH, uni=True)
            if os.path.exists(_FONT_PATH_B):
                pdf.add_font(_UNICODE_FONT, "B", _FONT_PATH_B, uni=True)
            if os.path.exists(_FONT_PATH_I):
                pdf.add_font(_UNICODE_FONT, "I", _FONT_PATH_I, uni=True)
            BODY_FONT = _UNICODE_FONT
        else:
            BODY_FONT = "helvetica"
    except Exception:
        BODY_FONT = "helvetica"

    primary = (25, 55, 109)
    accent = (41, 128, 185)
    light_bg = (245, 247, 250)
    text_dark = (33, 37, 41)
    text_muted = (108, 117, 125)
    white = (255, 255, 255)
    border_clr = (222, 226, 230)

    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.5)
    pdf.line(10, 4, 200, 4)

    # ── HEADER BAND ──
    pdf.set_fill_color(*primary)
    pdf.rect(0, 5, 210, 26, "F")
    pdf.set_fill_color(*accent)
    pdf.rect(0, 31, 210, 1.5, "F")

    logo_path = (company or {}).get("logo_url") or org.get("logo_url")
    lpath, lw, lh = _logo_meta(logo_path)
    if lpath and lw:
        try:
            pdf.image(lpath, x=10, y=9, w=lw)
        except Exception:
            lpath = None

    text_x = 34 if lpath else 14
    pdf.set_xy(text_x, 9)
    pdf.set_text_color(*white)
    pdf.set_font(BODY_FONT, "B", 15)
    pdf.cell(0, 8, org_name)
    pdf.set_xy(text_x, 18)
    pdf.set_font(BODY_FONT, "", 8.5)
    pdf.set_text_color(210, 220, 235)
    addr = org.get("address") or ""
    pdf.cell(0, 5, addr[:90])
    pdf.set_xy(text_x, 23.5)
    contact = " | ".join([x for x in [org.get("email"), org.get("phone")] if x])
    pdf.cell(0, 5, contact[:100])

    # ── TITLE ──
    pdf.set_text_color(*text_dark)
    pdf.ln(14)
    pdf.set_font(BODY_FONT, "B", 16)
    pdf.set_x(12)
    pdf.cell(0, 10, title, ln=1)
    pdf.set_draw_color(*accent)
    pdf.line(12, pdf.get_y() + 1, 198, pdf.get_y() + 1)
    pdf.ln(6)

    # ── BODY ──
    pdf.set_font(BODY_FONT, "", 10.5)
    pdf.set_text_color(*text_dark)
    pdf.set_x(12)
    for line in body_html_parts.split("\n"):
        line = line.replace("\r", "")
        if not line.strip():
            pdf.ln(2)
            continue
        # basic bold handling for **text**
        if "**" in line:
            pdf.set_font(BODY_FONT, "B", 10.5)
            pdf.set_x(12)
            pdf.multi_cell(0, 5.5, line.replace("**", ""), align="L")
            pdf.set_font(BODY_FONT, "", 10.5)
        else:
            pdf.set_x(12)
            pdf.multi_cell(0, 5.5, line, align="L")
        pdf.ln(1)

    # ── FOOTER ──
    pdf.set_y(-18)
    pdf.set_font(BODY_FONT, "I", 8)
    pdf.set_text_color(*text_muted)
    pdf.set_x(12)
    pdf.cell(0, 5, f"Generated by HRMS on {datetime.utcnow().strftime('%d %B %Y')}", ln=1)
    pdf.set_x(12)
    pdf.cell(0, 5, f"Country: {cfg['country']} · Tax form: {cfg['tax_form_name']}")

    return bytes(pdf.output(dest="S"))
