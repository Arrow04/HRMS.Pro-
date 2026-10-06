"""HRMS Analyst — the data-grounded brain of the in-app AI.

Every answer is computed from the organisation's live data (org-scoped,
tenant-safe): payroll rows, leave balances, attendance, compliance calendar,
statutory configuration — plus curated how-to guides for operating the
platform. Free-text without a data match returns None so the engine can fall
back to its conversational layer instead of inventing numbers.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from hrms_ai.app_knowledge import (
    describe_concept, describe_module, lookup_glossary, lookup_module,
)

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

HOW_TO: Dict[str, Dict[str, Any]] = {
    "run_payroll": {
        "title": "Run payroll for a month",
        "steps": [
            "Open Payroll in the sidebar.",
            "Click Generate (single employee) or Generate All (whole company).",
            "Nothing is paid automatically — generated payslips stay in draft.",
            "Review each payslip (gross, PF, ESI, TDS, net) on the Payroll page.",
            "Submit for approval (draft → pending approval).",
            "A DIFFERENT user than the generator must approve (maker-checker).",
            "Approve → Process → Mark paid. Payment posts the accounting journal automatically.",
        ],
    },
    "approve_leave": {
        "title": "Approve a leave request",
        "steps": [
            "Open Leaves → Leave Requests.",
            "Filter by Pending.",
            "Open the request — check dates, type and remaining balance.",
            "Approve or Reject with a note. The employee is notified in-app.",
            "Multi-level approval: if configured, level-1 approval routes to level-2.",
        ],
    },
    "configure_attendance": {
        "title": "Configure attendance",
        "steps": [
            "Open Attendance → Configuration tab.",
            "Set the workweek (Mon–Fri / Mon–Sat) and check-in/out times.",
            "Configure overtime threshold and multiplier, late grace, half-day rules.",
            "Optionally enable geofence, selfie check-in or WFH.",
            "Save — new rules apply to future attendance calculations.",
        ],
    },
    "setup_modules": {
        "title": "Set up the platform",
        "steps": [
            "The dashboard shows a setup checklist while modules are unconfigured.",
            "Each step opens that module's own Configuration wizard.",
            "Company & statutory + payroll → Payroll → Payroll Setup.",
            "Attendance / Leave / Expenses / Performance → each page's Configuration tab.",
            "The checklist clears as each module gets configured.",
        ],
    },
    "generate_ecr": {
        "title": "Download the EPF ECR (challan file)",
        "steps": [
            "Open Payroll → Compliance console.",
            "Go to Statutory Filings.",
            "Pick EPF ECR and the month.",
            "Download the filing file — pipe-delimited ECR format for the EPFO portal.",
        ],
    },
    "compliance_status": {
        "title": "Check compliance status",
        "steps": [
            "Open Payroll → Compliance → Overview tab.",
            "You'll see filings due soon, overdue, filed — with amounts.",
            "Mark a filing as filed from the Compliance Calendar tab.",
            "Statutory constants in force are listed on the Overview.",
        ],
    },
    "fnf_settlement": {
        "title": "Full & Final settlement for an exit",
        "steps": [
            "Open Exits and initiate the exit (or open the existing exit record).",
            "Run F&F settlement — it computes salary until last working day, gratuity, leave encashment, bonus, notice pay/recovery and TDS.",
            "TDS is deducted on taxable components (gratuity exempt up to ₹20L; encashment exempt up to the configured limit).",
            "Unreturned company assets are added as recovery deductions.",
            "Approve the exit; the F&F journal posts to accounting.",
        ],
    },
    "maker_checker": {
        "title": "How approvals (maker-checker) work",
        "steps": [
            "Whoever generates or submits a payslip is the maker.",
            "The SAME user can never approve it — a different user must.",
            "Company-wide runs submit for approval instead of approving in one click.",
            "Locked periods can only be reopened by a different user than the locker.",
            "Every status change is written to the hash-chained audit log.",
        ],
    },
    "proration": {
        "title": "How partial months are prorated",
        "steps": [
            "Partial months are prorated by paid days (default), calendar days or working days — set in Payroll policy.",
            "Daily-wage staff convert to monthly using a 26 or 30-day convention (payroll policy).",
            "An effective-dated 'proration' rule can override the divisor for specific companies.",
            "Attendance drives the paid-days factor automatically.",
        ],
    },
    "payslip_breakdown": {
        "title": "Understand a payslip",
        "steps": [
            "Open Payroll, find the employee's row for the month.",
            "Gross = basic + allowances + earnings.",
            "Deductions = PF + ESI + PT + TDS + loans/advances.",
            "Net = gross − total deductions.",
            "The Payslip Explainer tab shows WHY each figure is what it is (rule, formula, inputs).",
        ],
    },
    "add_employee": {
        "title": "Add an employee",
        "steps": [
            "Open Employees → Add Employee.",
            "Enter name, email, joining date and salary.",
            "Assign company/department; statutory fields (UAN, ESIC, PAN) are optional at entry.",
            "The employee appears in payroll runs for their joining month onwards.",
        ],
    },
}

_TOPIC_KEYWORDS = {
    "run_payroll": ["run payroll", "generate payroll", "process payroll", "salary run", "payroll run", "run salary"],
    "approve_leave": ["approve leave", "leave approval", "approve request", "reject leave"],
    "configure_attendance": ["configure attendance", "attendance setup", "attendance config", "set up attendance", "workweek", "overtime policy"],
    "setup_modules": ["setup", "set up", "onboarding", "configure the platform", "first time", "getting started", "checklist"],
    "generate_ecr": ["ecr", "epf challan", "pf challan", "download ecr", "epfo"],
    "compliance_status": ["compliance status", "what is due", "pending filings", "compliance dashboard", "overdue"],
    "fnf_settlement": ["full and final", "fnf", "final settlement", "exit settlement", "full final"],
    "maker_checker": ["maker checker", "who can approve", "self approve", "approval flow"],
    "proration": ["proration", "prorated", "partial month", "26 day", "30 day", "daily divisor"],
    "payslip_breakdown": ["payslip", "breakdown", "why is my", "explain my salary", "salary structure"],
    "add_employee": ["add employee", "new employee", "onboard employee", "create employee"],
}


def _money(v: Any) -> str:
    try:
        return f"₹{float(v or 0):,.0f}"
    except (TypeError, ValueError):
        return "₹0"


def _parse_month_year(query: str, today: Optional[date] = None) -> Tuple[int, int]:
    today = today or date.today()
    q = query.lower()
    month, year = today.month, today.year
    for name, num in _MONTHS.items():
        if re.search(rf"\b{name}\b", q):
            month = num
            break
    m = re.search(r"\b(20\d{2})\b", q)
    if m:
        year = int(m.group(1))
    else:
        m2 = re.search(r"\b(1[0-2]|0?[1-9])\s*/\s*(20\d{2})\b", q)
        if m2:
            month, year = int(m2.group(1)), int(m2.group(2))
    return month, year


def _match_how_to(query: str) -> Optional[str]:
    q = query.lower()
    if not any(k in q for k in ("how do i", "how to", "how can i", "steps to",
                                "guide me", "what are the steps", "how does")):
        return None
    best_key, best_hits = None, 0
    for key, topics in _TOPIC_KEYWORDS.items():
        hits = sum(1 for kw in topics if kw in q)
        if hits > best_hits:
            best_key, best_hits = key, hits
    return best_key


def _find_employee(db, org_id: Optional[int], text: str, context_employee_id: Optional[int] = None):
    from models import Employee
    q = (text or "").strip()
    if re.search(r"\b(my|mine|me)\b", q, re.I) and context_employee_id:
        return db.query(Employee).filter(
            Employee.id == context_employee_id,
            Employee.deleted_at.is_(None),
        ).first()
    q = _clean_name_query(q)
    if not q or len(q) < 2:
        return None
    eq = db.query(Employee).filter(Employee.deleted_at.is_(None), Employee.status == "active")
    if org_id:
        eq = eq.filter(Employee.organization_id == org_id)
    from sqlalchemy import or_
    code = eq.filter(Employee.employee_code.ilike(q)).first()
    if code:
        return code
    parts = [p for p in re.split(r"\s+", q) if len(p) > 1]
    if not parts:
        return None
    # Full-name first (first token + last token)
    combo = eq.filter(
        Employee.first_name.ilike(f"%{parts[0]}%"),
        Employee.last_name.ilike(f"%{parts[-1]}%"),
    ).first()
    if combo:
        return combo
    # Fallback: any remaining token may be the first OR last name
    for tok in parts:
        hit = eq.filter(or_(
            Employee.first_name.ilike(f"%{tok}%"),
            Employee.last_name.ilike(f"%{tok}%"),
        )).first()
        if hit:
            return hit
    return None


class HRMSAnalyst:
    """Answers HRMS questions from live org data."""

    def answer(
        self,
        query: str,
        context: Any,
        db,
    ) -> Optional[Dict[str, Any]]:
        q = (query or "").strip()
        if not q:
            return None
        org_id = getattr(context, "organization_id", None)
        ctx_emp = getattr(context, "employee_id", None)
        role = (getattr(context, "role", "") or "").lower()

        # ── How-to guides ──────────────────────────────────────────────
        how_key = _match_how_to(q)
        if how_key:
            guide = HOW_TO[how_key]
            text = f"{guide['title']}\n" + "\n".join(f"{i}. {s}" for i, s in enumerate(guide["steps"], 1))
            return {"text": text, "confidence": 0.92, "tool": f"howto:{how_key}", "intent": "how_to"}

        ql = q.lower()

        # ── Commands are for the action pipeline, not the analyst ──────
        # "run payroll for june" / "finalize attendance" / "initialise
        # leave balances" must EXECUTE, not get a description.
        if re.search(r"^(run|generate|process|finalize|initialise|initialize|mark)\b", ql) and \
           re.search(r"\b(payroll|attendance|leave balance|period)\b", ql) and \
           not re.search(r"\b(how|what|why|when|where|explain|steps|guide)\b", ql):
            return None

        # ── App concepts: "what is payroll / HRMS / PF / F&F" ─────────
        # The AI must teach the product — definition, product context, where.
        is_definition_q = bool(re.search(
            r"^(what is|what's|what are|whats|explain|meaning of|define|tell me about)\b", ql))
        if is_definition_q:
            entry = lookup_glossary(q)
            if entry:
                return {"text": describe_concept(entry), "confidence": 0.93,
                        "tool": "glossary", "intent": "concept_query"}
            # Module fallback only for short concept-like topics — never for
            # "what is <person>'s salary for <month>" (figure query) or
            # "what's my leave balance" (personal data query).
            topic = re.sub(
                r"^(what is|what's|what are|whats|explain|meaning of|define|tell me about)\b",
                "", ql).strip()
            if len(topic.split()) <= 4 and " my " not in f" {topic} ":
                mod = lookup_module(q)
                if mod:
                    return {"text": describe_module(mod), "confidence": 0.9,
                            "tool": "module", "intent": "module_query"}

        # ── Navigation: "where is X" / "how do I get to X" ─────────────
        if re.search(r"\b(where is|where do i find|where can i find|how do i get to|"
                     r"how do i open|take me to|how do i reach)\b", ql):
            mod = lookup_module(q)
            if mod:
                return {"text": describe_module(mod), "confidence": 0.92,
                        "tool": "navigation", "intent": "navigation_query"}

        # ── Module capabilities: "what can I do with X" / "features" ───
        if re.search(r"\b(what can i do with|features of|capabilities of|"
                     r"tell me about|about the|explain the)\b", ql):
            mod = lookup_module(q)
            if mod:
                return {"text": describe_module(mod), "confidence": 0.9,
                        "tool": "module", "intent": "module_query"}

        # ── Statutory facts (definition questions win over figure lookups)
        stat_triggers = any(k in ql for k in (
            "pf ceiling", "esi ceiling", "gratuity", "bonus act", "pt rate",
            "professional tax", "tds slab", "what is pf", "what is esi",
            "standard deduction", "cess", "ceiling", "slab", "exemption",
            "formula",
        ))
        figure_triggers = any(w in ql for w in (
            "gross", "net salary", "net pay", "payslip", "deduction",
            "salary for", "payroll for", "salary of", "payroll of", "ctc",
        ))
        if stat_triggers and not figure_triggers:
            text = self._statutory_answer(db, org_id, ql)
            if text:
                return {"text": text, "confidence": 0.85, "tool": "statutory_facts", "intent": "statutory_query"}

        # ── Payroll / salary figures ───────────────────────────────────
        payroll_words = ("payroll", "salary", "gross", "net salary", "pf", "tds",
                         "esi", "deduction", "payslip", "net pay", "ctc")
        if any(w in ql for w in payroll_words):
            text = self._payroll_answer(db, org_id, ctx_emp, q, role)
            if text:
                return {"text": text, "confidence": 0.9, "tool": "payroll", "intent": "payroll_query"}

        # ── Statutory facts (second chance when mixed with payroll words)
        if stat_triggers:
            text = self._statutory_answer(db, org_id, ql)
            if text:
                return {"text": text, "confidence": 0.85, "tool": "statutory_facts", "intent": "statutory_query"}

        # ── Leave balance ──────────────────────────────────────────────
        if "leave" in ql and any(w in ql for w in ("balance", "remaining", "how many", "left")):
            text = self._leave_answer(db, org_id, ctx_emp, q)
            if text:
                return {"text": text, "confidence": 0.9, "tool": "leave_balance", "intent": "leave_balance_query"}

        # ── Attendance ─────────────────────────────────────────────────
        if "attendance" in ql and any(w in ql for w in ("summary", "present", "absent", "this month", "june", "record")):
            text = self._attendance_answer(db, org_id, ctx_emp, q)
            if text:
                return {"text": text, "confidence": 0.85, "tool": "attendance", "intent": "attendance_query"}

        # ── Compliance ─────────────────────────────────────────────────
        if any(w in ql for w in ("compliance", "challan", "filing", "due date", "overdue",
                                  "ecr status", "form 16", "statutory report")):
            text = self._compliance_answer(db, org_id)
            if text:
                return {"text": text, "confidence": 0.88, "tool": "compliance", "intent": "compliance_query"}

        # ── Org overview ───────────────────────────────────────────────
        if any(w in ql for w in ("headcount", "how many employees", "total employees",
                                  "number of employees", "companies", "overview", "summary of")):
            text = self._org_answer(db, org_id)
            if text:
                return {"text": text, "confidence": 0.85, "tool": "org_overview", "intent": "org_query"}

        # ── Employee directory ─────────────────────────────────────────
        dir_triggers = any(w in ql for w in (
            "who is", "find employee", "search employee", "employee details",
            "profile of", "contact details", "details of", "show me",
        ))
        name_probe = _clean_name_query(q)
        find_verb = bool(re.search(r"\b(find|search|lookup|locate|show)\b", ql))
        if dir_triggers or (find_verb and name_probe and len(name_probe.split()) <= 5):
            text = self._employee_answer(db, org_id, q)
            if text:
                return {"text": text, "confidence": 0.9, "tool": "employee", "intent": "employee_search"}

        # ── Last resort: any resolvable name → full profile ────────────
        if name_probe and len(name_probe.split()) <= 5:
            text = self._employee_answer(db, org_id, q)
            if text:
                return {"text": text, "confidence": 0.85, "tool": "employee", "intent": "employee_search"}

        return None

    # ── Tool implementations ───────────────────────────────────────────

    def _statutory_answer(self, db, org_id, ql) -> Optional[str]:
        try:
            from models import StatutorySetting
            from services.compliance_engine import _get_statutory_constant
            setting = None
            if org_id:
                setting = db.query(StatutorySetting).filter(
                    StatutorySetting.organization_id == org_id,
                    StatutorySetting.status == "active",
                ).first()

            def _knob(field: str, key: str, default: Optional[float]) -> Optional[float]:
                val = getattr(setting, field, None) if setting is not None else None
                try:
                    if val is not None and float(val) > 0:
                        return float(val)
                except (TypeError, ValueError):
                    pass
                cfg = _get_statutory_constant(db, key, default)
                return float(cfg) if cfg is not None else None

            knobs = [
                ("PF wage ceiling", _knob("pf_wage_ceiling", "pf_wage_ceiling", 15000.0)),
                ("EPS wage ceiling", _knob("eps_wage_ceiling", "eps_wage_ceiling", 15000.0)),
                ("PF employee rate", _knob("pf_employee_rate", "pf_employee_rate", 12.0)),
                ("ESI employee rate", _knob("esi_employee_rate", "esi_employee_rate", 0.75)),
                ("ESI employer rate", _knob("esi_employer_rate", "esi_employer_rate", 3.25)),
                ("Gratuity tax-exempt ceiling",
                 _knob("gratuity_tax_exempt_ceiling", "gratuity_exemption_limit", 2000000.0)),
            ]
            lines = ["Statutory configuration for your organisation:"]
            for label, val in knobs:
                if val is None:
                    continue
                if "ceiling" in label.lower():
                    lines.append(f"• {label}: ₹{val:,.0f}")
                elif "rate" in label.lower():
                    lines.append(f"• {label}: {val}%")
                else:
                    lines.append(f"• {label}: ₹{val:,.0f}")
            lines.append("• Gratuity formula: (15 days × last drawn wages × years of service) ÷ 26")
            lines.append("• TDS slabs: managed under Payroll → Compliance → Tax Planner")
            return "\n".join(lines)
        except Exception:
            return None

    def _payroll_answer(self, db, org_id, ctx_emp, q, role) -> Optional[str]:
        from models import Payroll
        emp = _find_employee(db, org_id, q, ctx_emp)
        month, year = _parse_month_year(q)
        eq = db.query(Payroll).filter(Payroll.deleted_at.is_(None))
        if org_id:
            eq = eq.filter(Payroll.organization_id == org_id)
        if emp is not None:
            row = eq.filter(Payroll.employee_id == emp.id, Payroll.month == month,
                            Payroll.year == year).first()
            if row is None:
                row = (eq.filter(Payroll.employee_id == emp.id)
                       .order_by(Payroll.year.desc(), Payroll.month.desc()).first())
            if row is None:
                who = f"{emp.first_name} {emp.last_name or ''}".strip()
                return (f"No payroll record found for {who} "
                        f"({_MONTH_NAME.get(month, month)} {year}). "
                        f"Generate payroll for that period first.")
            who = (f"{emp.first_name} {emp.last_name or ''}".strip() if emp else "Employee")
            return (
                f"{who} — payroll for {_MONTH_NAME.get(month, month)} {year} (status: {row.status}):\n"
                f"• Gross: {_money(row.gross_salary)}\n"
                f"• Basic: {_money(row.basic_salary)}\n"
                f"• PF deduction: {_money(row.pf_deduction)}\n"
                f"• ESI deduction: {_money(row.esi_deduction)}\n"
                f"• Professional Tax: {_money(row.professional_tax)}\n"
                f"• TDS: {_money(row.tds_deduction)}\n"
                f"• Net pay: {_money(row.net_salary)}"
            )
        # Org-level payroll picture
        q2 = eq.filter(Payroll.month == month, Payroll.year == year)
        rows = q2.all()
        if not rows:
            return (f"No payroll has been generated for {_MONTH_NAME.get(month, month)} {year} "
                    f"in this organisation yet.")
        gross = sum(float(r.gross_salary or 0) for r in rows)
        net = sum(float(r.net_salary or 0) for r in rows)
        pf = sum(float(r.pf_deduction or 0) for r in rows)
        tds = sum(float(r.tds_deduction or 0) for r in rows)
        return (
            f"Payroll for {_MONTH_NAME.get(month, month)} {year} — {len(rows)} payslips:\n"
            f"• Total gross: {_money(gross)}\n"
            f"• Total PF deducted: {_money(pf)}\n"
            f"• Total TDS deducted: {_money(tds)}\n"
            f"• Total net payable: {_money(net)}"
        )

    def _leave_answer(self, db, org_id, ctx_emp, q) -> Optional[str]:
        from models import Employee, LeaveBalance, LeaveType
        emp = _find_employee(db, org_id, q, ctx_emp)
        if emp is None:
            return None
        who = f"{emp.first_name} {emp.last_name or ''}".strip()
        year = _parse_month_year(q)[1]
        rows = (db.query(LeaveBalance, LeaveType)
                .join(LeaveType, LeaveType.id == LeaveBalance.leave_type_id)
                .filter(LeaveBalance.employee_id == emp.id,
                        LeaveBalance.deleted_at.is_(None),
                        LeaveBalance.year == year)
                .all())
        if not rows:
            return (f"No leave balance rows for {who} in {year}. "
                    f"Balances are created when leave is initialised for the year.")
        lines = [f"Leave balance for {who} ({year}):"]
        for lb, lt in rows:
            lines.append(f"• {lt.name}: {lb.remaining_days or 0} of {lb.total_days or 0} days remaining"
                         f" ({lb.used_days or 0} used)")
        return "\n".join(lines)

    def _attendance_answer(self, db, org_id, ctx_emp, q) -> Optional[str]:
        from models import Attendance, Employee
        emp = _find_employee(db, org_id, q, ctx_emp)
        month, year = _parse_month_year(q)
        start = date(year, month, 1)
        end = date(year, month, 28)
        from calendar import monthrange
        end = date(year, month, monthrange(year, month)[1])
        aq = db.query(Attendance).filter(
            Attendance.deleted_at.is_(None),
            Attendance.date >= start, Attendance.date <= end,
        )
        if org_id:
            aq = aq.filter(Attendance.organization_id == org_id)
        if emp is not None:
            aq = aq.filter(Attendance.employee_id == emp.id)
        rows = aq.all()
        present = sum(1 for r in rows if (r.status or "").lower() == "present")
        absent = sum(1 for r in rows if (r.status or "").lower() in ("absent", "absent without pay", "lop"))
        on_leave = sum(1 for r in rows if (r.status or "").lower() in ("on_leave", "leave", "half_day"))
        who = f"{emp.first_name} {emp.last_name or ''}".strip() if emp else "Organisation"
        return (
            f"Attendance for {who} — {_MONTH_NAME.get(month, month)} {year}:\n"
            f"• Records: {len(rows)}\n"
            f"• Present: {present}\n"
            f"• On leave: {on_leave}\n"
            f"• Absent: {absent}"
        )

    def _compliance_answer(self, db, org_id) -> Optional[str]:
        try:
            from services.compliance_calendar import build_calendar
            items = build_calendar(db, org_id) if org_id else []
            overdue = [i for i in items if i["status"] == "overdue"]
            due_soon = [i for i in items if i["status"] == "due_soon"]
            filed = [i for i in items if i["status"] == "filed"]
            lines = [f"Compliance status: {len(overdue)} overdue, {len(due_soon)} due within 7 days, "
                     f"{len(filed)} filed recently."]
            for i in (overdue + due_soon)[:5]:
                lines.append(f"• {i['name']} — {i['periodLabel']}, due {i['dueDate']} "
                             f"({_money(i.get('amount'))}) [{i['status']}]")
            if not overdue and not due_soon:
                lines.append("Nothing is overdue and nothing is due in the next 7 days.")
            return "\n".join(lines)
        except Exception:
            return None

    def _org_answer(self, db, org_id) -> Optional[str]:
        try:
            from models import Company, Employee
            emp_count = db.query(Employee).filter(
                Employee.deleted_at.is_(None), Employee.status == "active",
            )
            co_count = db.query(Company).filter(Company.deleted_at.is_(None))
            if org_id:
                emp_count = emp_count.filter(Employee.organization_id == org_id)
                co_count = co_count.filter(Company.organization_id == org_id)
            return (f"Organisation overview:\n"
                    f"• Active employees: {emp_count.count()}\n"
                    f"• Companies (legal entities): {co_count.count()}")
        except Exception:
            return None

    def _employee_answer(self, db, org_id, q) -> Optional[str]:
        emp = _find_employee(db, org_id, q, None)
        if emp is None:
            return None
        # Comprehensive profile — the answer a knowledgeable HR consultant gives
        dept_name = company_name = "—"
        try:
            from models import Company, Department
            if getattr(emp, "department_id", None):
                d = db.query(Department).filter(Department.id == emp.department_id).first()
                dept_name = d.name if d else "—"
            if getattr(emp, "company_id", None):
                c = db.query(Company).filter(Company.id == emp.company_id).first()
                company_name = c.name if c else "—"
        except Exception:
            pass
        joined = emp.join_date
        joined_str = joined.date().isoformat() if hasattr(joined, "date") else (str(joined) if joined else "—")

        # Latest payroll (if any)
        payroll_line = None
        try:
            from models import Payroll
            row = (db.query(Payroll).filter(
                Payroll.employee_id == emp.id, Payroll.deleted_at.is_(None),
            ).order_by(Payroll.year.desc(), Payroll.month.desc()).first())
            if row is not None:
                payroll_line = (
                    f"• Latest payroll ({_MONTH_NAME.get(row.month, row.month)} {row.year}): "
                    f"gross {_money(row.gross_salary)} · net {_money(row.net_salary)} "
                    f"(PF {_money(row.pf_deduction)}, TDS {_money(row.tds_deduction)})"
                )
        except Exception:
            pass

        # Leave balance summary (current year)
        leave_line = None
        try:
            from models import LeaveBalance
            year = date.today().year
            lbs = db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.deleted_at.is_(None),
                LeaveBalance.year == year,
            ).all()
            if lbs:
                remaining = sum(float(b.remaining_days or 0) for b in lbs)
                total = sum(float(b.total_days or 0) for b in lbs)
                leave_line = f"• Leave balance ({year}): {int(remaining)} of {int(total)} days remaining"
        except Exception:
            pass

        lines = [
            f"{emp.first_name or ''} {emp.last_name or ''}".strip()
            + (f" ({emp.designation})" if getattr(emp, "designation", None) else ""),
            f"• Employee code: {getattr(emp, 'employee_code', None) or '—'}",
            f"• Department: {dept_name} · Company: {company_name}",
            f"• Email: {getattr(emp, 'email', None) or '—'}"
            + (f" · Phone: {emp.phone}" if getattr(emp, "phone", None) else ""),
            f"• Joined: {joined_str} · Status: {getattr(emp, 'status', '—')}",
        ]
        if payroll_line:
            lines.append(payroll_line)
        if leave_line:
            lines.append(leave_line)
        return "\n".join(lines)


_MONTH_NAME = {
    1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
    7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
}

# Words that are never part of an employee name — stripped before lookup.
_NAME_NOISE = {
    "what", "whats", "is", "are", "the", "a", "an", "my", "mine", "me", "our",
    "show", "tell", "give", "please", "for", "in", "on", "of", "to", "and",
    "salary", "salaries", "payroll", "payslip", "payslips", "gross", "net",
    "pf", "esi", "tds", "deduction", "deductions", "ctc", "breakup", "breakdown",
    "balance", "how", "many", "days", "day", "left", "remaining", "remain",
    "do", "does", "did", "i", "we", "have", "has", "employee", "employees",
    "details", "detail", "who", "find", "search", "lookup", "about", "this",
    "that", "month", "year", "total", "summary", "status", "attendance",
    "leave", "leaves", "present", "absent", "record", "records", "payment",
    "payments", "amount", "amounts", "much", "cost", "package", "month",
    "june", "july", "may", "march", "april", "august", "september", "october",
    "november", "december", "january", "february", "jan", "feb", "mar", "apr",
    "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    "2025", "2026", "2027", "s",
}


def _clean_name_query(query: str) -> str:
    """Strip question scaffolding and domain nouns; keep name-like tokens."""
    q = query.lower().replace("'s", " ").replace("’s", " ")
    tokens = [t for t in re.split(r"[^a-z]+", q) if t and t not in _NAME_NOISE]
    return " ".join(tokens).strip()


_analyst: Optional[HRMSAnalyst] = None


def get_analyst() -> HRMSAnalyst:
    global _analyst
    if _analyst is None:
        _analyst = HRMSAnalyst()
    return _analyst
