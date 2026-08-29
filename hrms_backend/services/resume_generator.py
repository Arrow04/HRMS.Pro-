"""Generate a professional resume PDF from an employee's profile data.

Used when an employee has no uploaded CV — this compiles their stored
onboarding information (personal, education, experience, skills, achievements,
activities, certifications) into a clean, A4 resume they can download.
"""
import io
import os
from typing import Dict, List, Optional

from fpdf import FPDF

_FONT = r"C:\Windows\Fonts\arial.ttf"
_FONT_B = r"C:\Windows\Fonts\arialbd.ttf"
_FONT_I = r"C:\Windows\Fonts\ariali.ttf"


def _clean(v: Optional[str]) -> str:
    return (v or "").replace("\r", " ").replace("\n", " ").strip()


def _fmt_date(d) -> str:
    if not d:
        return ""
    return d.strftime("%b %Y")


def build_resume_pdf(data: Dict) -> bytes:
    """data keys: profile{}, education[], experience[], skills[], achievements[],
    activities[], certifications{}"""
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Fonts
    try:
        pdf.add_font("ArialR", "", _FONT)
        pdf.add_font("ArialB", "", _FONT_B)
        pdf.add_font("ArialI", "", _FONT_I)
    except Exception:
        pdf.add_font("Helvetica", "", "", uni=True)
        pdf.set_font("Helvetica", "", 10)

    profile = data.get("profile") or {}
    name = _clean(f"{profile.get('first_name')} {profile.get('last_name')}".strip()) or "Employee"
    designation = _clean(profile.get("designation"))
    email = _clean(profile.get("email"))
    phone = _clean(profile.get("phone"))
    location = _clean(profile.get("location"))
    summary = _clean(profile.get("summary"))

    # ── Header band ──
    pdf.set_fill_color(30, 100, 243)
    pdf.rect(0, 0, 210, 34, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("ArialB", "", 22)
    pdf.set_xy(14, 9)
    pdf.cell(0, 9, name, ln=1)
    pdf.set_font("ArialR", "", 12)
    pdf.set_xy(14, 20)
    pdf.cell(0, 6, designation, ln=1)
    pdf.set_font("ArialI", "", 9)
    pdf.set_xy(14, 27)
    pdf.cell(0, 5, " | ".join(x for x in [email, phone, location] if x), ln=1)

    pdf.set_text_color(20, 20, 20)
    y = 42

    def section(title: str):
        nonlocal y
        if y > 270:
            pdf.add_page()
            y = 16
        pdf.set_xy(14, y)
        pdf.set_font("ArialB", "", 11)
        pdf.set_text_color(30, 100, 243)
        pdf.cell(0, 6, title, ln=1)
        pdf.set_draw_color(30, 100, 243)
        pdf.line(14, y + 6.5, 196, y + 6.5)
        y += 11
        pdf.set_text_color(40, 40, 40)

    def paragraph(text: str):
        nonlocal y
        if not text:
            return
        pdf.set_font("ArialR", "", 9.5)
        pdf.set_xy(14, y)
        pdf.multi_cell(182, 5, text)
        y = pdf.get_y() + 3

    # ── Summary ──
    if summary:
        section("PROFILE")
        paragraph(summary)

    # ── Experience ──
    experience = data.get("experience") or []
    if experience:
        section("EXPERIENCE")
        for e in experience:
            org = _clean(e.get("company"))
            role = _clean(e.get("designation"))
            period = f"{_clean(e.get('from'))} - {_clean(e.get('to'))}"
            line = " · ".join(x for x in [role, org, period] if x)
            if line:
                pdf.set_font("ArialB", "", 9.5)
                pdf.set_xy(14, y)
                pdf.multi_cell(182, 5, line)
                y = pdf.get_y() + 0.5
            reason = _clean(e.get("reason"))
            if reason:
                pdf.set_font("ArialI", "", 8.5)
                pdf.set_xy(14, y)
                pdf.multi_cell(182, 4.5, reason)
                y = pdf.get_y() + 1.5

    # ── Education ──
    education = data.get("education") or []
    if education:
        section("EDUCATION")
        for e in education:
            degree = _clean(e.get("degree"))
            institution = _clean(e.get("institution"))
            year = _clean(e.get("year") or e.get("graduationYear"))
            level = _clean(e.get("level") or e.get("educationLevel"))
            line = " · ".join(x for x in [degree, institution, year, level] if x)
            if line:
                pdf.set_font("ArialB", "", 9.5)
                pdf.set_xy(14, y)
                pdf.multi_cell(182, 5, line)
                y = pdf.get_y() + 2
        # Single education fields from profile
        if not education:
            edu_line = " · ".join(x for x in [
                _clean(profile.get("degree")),
                _clean(profile.get("institution")),
                _clean(profile.get("field_of_study")),
                _clean(profile.get("graduation_year")),
            ] if x)
            if edu_line:
                pdf.set_font("ArialB", "", 9.5)
                pdf.set_xy(14, y)
                pdf.multi_cell(182, 5, edu_line)
                y = pdf.get_y() + 2

    # ── Certifications ──
    cert = data.get("certifications") or {}
    if cert.get("name"):
        section("CERTIFICATIONS")
        cert_line = " · ".join(x for x in [_clean(cert.get("name")), _clean(cert.get("org")), _clean(cert.get("date"))] if x)
        if cert_line:
            pdf.set_font("ArialB", "", 9.5)
            pdf.set_xy(14, y)
            pdf.multi_cell(182, 5, cert_line)
            y = pdf.get_y() + 2

    # ── Skills ──
    skills = data.get("skills") or []
    if skills:
        section("SKILLS")
        skill_list = []
        for s in skills:
            name_s = _clean(s.get("name"))
            prof = _clean(s.get("proficiency"))
            skill_list.append(f"{name_s} ({prof})" if prof else name_s)
        if not skill_list and profile.get("skills_text"):
            skill_list = [p.strip() for p in str(profile.get("skills_text")).split(",") if p.strip()]
        if skill_list:
            paragraph(", ".join(skill_list))

    # ── Achievements ──
    achievements = data.get("achievements") or []
    if achievements:
        section("ACHIEVEMENTS")
        for a in achievements:
            title_a = _clean(a.get("title"))
            desc = _clean(a.get("description"))
            line = title_a + (f" — {desc}" if desc else "")
            if line:
                pdf.set_font("ArialR", "", 9.5)
                pdf.set_xy(14, y)
                pdf.multi_cell(182, 5, "• " + line)
                y = pdf.get_y() + 1

    # ── Activities ──
    activities = data.get("activities") or []
    if activities:
        section("ACTIVITIES")
        for a in activities:
            name_a = _clean(a.get("name"))
            role_a = _clean(a.get("role"))
            desc_a = _clean(a.get("description"))
            line = " · ".join(x for x in [name_a, role_a, desc_a] if x)
            if line:
                pdf.set_font("ArialR", "", 9.5)
                pdf.set_xy(14, y)
                pdf.multi_cell(182, 5, "• " + line)
                y = pdf.get_y() + 1

    # ── Languages ──
    langs = [x for x in [_clean(profile.get("language1")), _clean(profile.get("language2")), _clean(profile.get("language3"))] if x]
    if langs:
        section("LANGUAGES")
        paragraph(", ".join(langs))

    # Footer
    pdf.set_y(-15)
    pdf.set_font("ArialI", "", 8)
    pdf.set_text_color(140, 140, 140)
    pdf.cell(0, 5, f"Generated by HRMS Pro — {name}", align="C")

    return pdf.output()
