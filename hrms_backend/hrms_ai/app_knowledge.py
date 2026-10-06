"""App knowledge — the AI's complete map of HRMS.Pro!.

Two layers:
  MODULES  — every sidebar module: what it does, its tabs, its key actions,
             and where to find it. Answers "what can I do with X?" and
             "where is X?".
  GLOSSARY — every HRMS/payroll concept in plain language PLUS how THIS
             app handles it. Answers "what is payroll / PF / F&F / ...?"
             the way a knowledgeable consultant would — definition first,
             then the product context, then where to find it.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

MODULES: Dict[str, Dict[str, Any]] = {
    "dashboard": {
        "label": "Dashboard",
        "path": "/dashboard",
        "what": "The home screen: today's attendance, headcount, pending approvals, "
                "interviews and analytics charts for the whole organisation.",
        "tabs": ["KPI cards", "Analytics", "Recent activity"],
        "actions": ["Refresh data", "Jump to any module from the cards"],
    },
    "company": {
        "label": "Company",
        "path": "/company",
        "what": "Master data for the organisation's legal entities (companies), "
                "branches and departments — the structure payroll and attendance hang off.",
        "tabs": ["Companies", "Branches", "Departments"],
        "actions": ["Add a company (legal entity)", "Add branches/departments"],
    },
    "recruitment": {
        "label": "Recruitment",
        "path": "/recruitment",
        "what": "Hiring pipeline: job openings, candidates, interviews and offers — "
                "from job post to accepted offer letter.",
        "tabs": ["Openings", "Candidates", "Interviews"],
        "actions": ["Create a job opening", "Move candidates through stages", "Schedule interviews"],
    },
    "employees": {
        "label": "Employees",
        "path": "/employees",
        "what": "Employee directory and profiles: personal details, salary, "
                "documents, reporting lines and lifecycle status.",
        "tabs": ["Directory", "Profile", "Salary", "Documents"],
        "actions": ["Add an employee", "Edit profile/salary", "Change reporting manager"],
    },
    "letters": {
        "label": "Letters",
        "path": "/letters",
        "what": "Generate employment letters — offer letters, experience "
                "certificates, salary certificates and custom templates.",
        "tabs": ["Templates", "Generated letters"],
        "actions": ["Create a letter template", "Generate a letter for an employee"],
    },
    "attendance": {
        "label": "Attendance",
        "path": "/attendance",
        "what": "Daily attendance: check-ins, late/absent tracking, overtime, "
                "duty shifts and rosters. Attendance feeds payroll proration.",
        "tabs": ["Records", "Duty Shift", "Duty Roster", "Configuration"],
        "actions": ["View/mark attendance", "Configure workweek, overtime, geofence",
                    "Finalize the period before payroll"],
    },
    "leaves": {
        "label": "Leaves",
        "path": "/leaves",
        "what": "Leave requests, balances, leave types and the leave policy "
                "template (quotas, accrual, carry-forward, encashment).",
        "tabs": ["Requests", "Types", "Balance", "Configuration"],
        "actions": ["Apply/approve/reject leave", "Configure leave policy",
                    "Initialise yearly balances"],
    },
    "holidays": {
        "label": "Holidays",
        "path": "/holidays",
        "what": "Organisation holiday calendar — festival and optional holidays "
                "per company; holidays count as paid days in payroll.",
        "tabs": ["Calendar", "List"],
        "actions": ["Add holidays", "Mark optional holidays"],
    },
    "expenses": {
        "label": "Expenses",
        "path": "/expenses",
        "what": "Employee expense claims with receipts, categories and an "
                "approval workflow; approved claims reimburse via payroll/F&F.",
        "tabs": ["Records", "Approved", "Rejected", "Configuration"],
        "actions": ["File a claim", "Approve/reject", "Configure categories & workflow"],
    },
    "assets": {
        "label": "Assets",
        "path": "/assets",
        "what": "Company assets assigned to employees (laptops, phones). "
                "Unreturned assets are recovered in Full & Final settlement.",
        "tabs": ["Asset list"],
        "actions": ["Assign an asset", "Mark returned"],
    },
    "performance": {
        "label": "Performance",
        "path": "/performance",
        "what": "Performance reviews on a 1–5 scale, goals/OKRs, 360° feedback "
                "and analytics — cadence set in Configuration.",
        "tabs": ["Reviews", "Goals & OKRs", "360 Feedback", "Analytics", "Configuration"],
        "actions": ["Run a review cycle", "Set goals", "Configure review cycle"],
    },
    "payroll": {
        "label": "Payroll",
        "path": "/payroll",
        "what": "The salary engine: generate payslips, approve and pay. "
                "Computes PF, ESI, PT, TDS, loans and net pay from configured rules.",
        "tabs": ["Payroll runs", "Payroll Setup", "Components"],
        "actions": ["Generate payroll (single or all)", "Review payslips",
                    "Approve → Process → Mark paid"],
    },
    "compliance": {
        "label": "Compliance",
        "path": "/payroll/console",
        "what": "Statutory compliance console: filing calendar with due dates, "
                "ECR/ESI/TDS/gratuity registers, tax planner and payslip explainability.",
        "tabs": ["Overview", "Rules", "Calendar", "Filings", "Planner", "Explainer"],
        "actions": ["See what's overdue", "Download ECR/filing files",
                    "Mark filings as done", "Verify the audit chain"],
    },
    "exits": {
        "label": "Exits",
        "path": "/exit-management",
        "what": "Offboarding: exit records, clearance checklist and Full & Final "
                "settlement (salary, gratuity, encashment, notice, TDS, asset recovery).",
        "tabs": ["Exit records", "Clearance", "F&F"],
        "actions": ["Initiate an exit", "Run F&F settlement", "Track clearance"],
    },
    "anomalies": {
        "label": "Anomalies",
        "path": "/anomalies",
        "what": "Automatic anomaly detection on attendance and payroll — buddy "
                "punching, payroll drift, overtime spikes, duplicate bank accounts.",
        "tabs": ["Alerts"],
        "actions": ["Run a scan", "Review alerts"],
    },
    "reports": {
        "label": "Reports",
        "path": "/reports",
        "what": "Business reports and exports across HR, attendance and payroll.",
        "tabs": ["Reports", "Export history"],
        "actions": ["Generate a report", "Export to file"],
    },
    "announcements": {
        "label": "Announcements",
        "path": "/announcements",
        "what": "Company-wide or targeted announcements visible to employees.",
        "tabs": ["Announcements"],
        "actions": ["Post an announcement"],
    },
    "grievances": {
        "label": "Grievances",
        "path": "/grievances",
        "what": "Employee grievance redressal: file, track and resolve complaints.",
        "tabs": ["Grievances"],
        "actions": ["File a grievance", "Resolve/close"],
    },
    "helpdesk": {
        "label": "Helpdesk",
        "path": "/helpdesk",
        "what": "Internal IT/HR helpdesk tickets from employees.",
        "tabs": ["Tickets"],
        "actions": ["Raise a ticket", "Respond/resolve"],
    },
    "settings": {
        "label": "Settings",
        "path": "/settings",
        "what": "Organisation-wide settings: company profile, attendance/leave/"
                "payroll/performance defaults, notifications and security.",
        "tabs": ["General", "Attendance", "Leave", "Payroll", "Performance",
                 "Notifications", "Security"],
        "actions": ["Edit org profile", "Module defaults", "Notification prefs"],
    },
}

GLOSSARY: Dict[str, Dict[str, str]] = {
    "hrms": {
        "term": "HRMS (Human Resource Management System)",
        "definition": "Software that runs everything about employees in one place: "
                      "profiles, attendance, leave, salary, compliance and exits.",
        "in_app": "HRMS.Pro! is exactly this — org → companies → employees, with "
                  "attendance and leave feeding a statutory-aware payroll engine.",
        "where": "Start at the Dashboard; modules live in the left sidebar.",
    },
    "hrm": {
        "term": "HRM (Human Resource Management)",
        "definition": "The practice of managing people — hiring, paying, developing "
                      "and releasing employees. HRMS is the software that runs HRM.",
        "in_app": "Covers recruitment → onboarding → attendance/leave → payroll → "
                  "performance → exits, end to end.",
        "where": "Sidebar modules follow this lifecycle in order.",
    },
    "payroll": {
        "term": "Payroll",
        "definition": "The process of calculating and paying salaries — earnings, "
                      "statutory deductions (PF, ESI, tax) and net pay — every month.",
        "in_app": "Payroll module: Generate → review payslips → submit → a DIFFERENT "
                  "user approves (maker-checker) → process → mark paid. Accounting "
                  "journal posts automatically on payment.",
        "where": "Sidebar → Payroll. Setup in Payroll → Payroll Setup.",
    },
    "ctc": {
        "term": "CTC (Cost to Company)",
        "definition": "The total annual cost of employing someone — salary plus "
                      "employer contributions and benefits.",
        "in_app": "Employees store base salary as annual CTC; the engine converts "
                  "to monthly and splits basic/allowances per payroll policy.",
        "where": "Employees → Profile → Salary.",
    },
    "gross": {
        "term": "Gross salary",
        "definition": "Total earnings before any deductions — basic plus all allowances.",
        "in_app": "Shown on every payslip; feeds ESI and tax calculations.",
        "where": "Payroll → payslip line items.",
    },
    "net": {
        "term": "Net salary (take-home)",
        "definition": "What the employee actually receives: gross minus all deductions.",
        "in_app": "Net = gross − (PF + ESI + PT + TDS + loans + advances + other).",
        "where": "Payroll → Net pay column.",
    },
    "pf": {
        "term": "PF (Provident Fund)",
        "definition": "A mandatory retirement savings scheme: employee and employer "
                      "each contribute a % of wages (12% standard), capped at a wage "
                      "ceiling (₹15,000 by default).",
        "in_app": "Configured per company in statutory settings — rates, wage "
                  "ceiling, exclusion threshold, EDLI and admin charges. Auto-"
                  "deducted on every payslip; appears in the EPF ECR filing file.",
        "where": "Payroll Setup → statutory rates; Compliance → EPF ECR.",
    },
    "eps": {
        "term": "EPS (Employees' Pension Scheme)",
        "definition": "The pension arm of PF — part of the employer's 12% goes to "
                      "pension (8.33% standard), capped at the EPS wage ceiling.",
        "in_app": "EPS rate and ceiling are configurable per company; the engine "
                  "splits the employer PF share into EPS vs EPF automatically.",
        "where": "Payroll Setup → statutory rates (EPS fields).",
    },
    "esi": {
        "term": "ESI (Employee State Insurance)",
        "definition": "Health insurance for employees below a wage ceiling "
                      "(₹21,000/month standard): 0.75% employee + 3.25% employer.",
        "in_app": "Rate and ceilings configurable per company; auto-deducted for "
                  "eligible employees; feeds the ESI monthly return.",
        "where": "Payroll Setup → statutory rates; Compliance → ESI return.",
    },
    "pt": {
        "term": "PT (Professional Tax)",
        "definition": "A state-level tax on professions, a fixed monthly amount "
                      "above a gross threshold — ₹200/month common in many states.",
        "in_app": "Amount and threshold configurable per company; state matters "
                  "(different states charge differently).",
        "where": "Payroll Setup → statutory rates; Compliance → PT statement.",
    },
    "tds": {
        "term": "TDS (Tax Deducted at Source)",
        "definition": "Income tax deducted from salary each month using the "
                      "employee's declared investments and the configured slab rates.",
        "in_app": "Cumulative FY projection: annual income − standard deduction − "
                  "declared exemptions, taxed by slabs, minus TDS already deducted "
                  "YTD. Tax regime and slabs are configuration.",
        "where": "Payroll → TDS on payslips; Compliance → Tax Planner.",
    },
    "tax_regime": {
        "term": "Tax regime (old vs new)",
        "definition": "Two Income-tax structures: the new regime has lower rates "
                      "but fewer deductions; the old regime allows HRA, 80C, 80D etc.",
        "in_app": "An org picks/configures a regime with its own slabs, standard "
                  "deduction, rebate threshold and cess. TDS follows it.",
        "where": "Payroll Setup → tax regime; Compliance → Tax Planner compares both.",
    },
    "gratuity": {
        "term": "Gratuity",
        "definition": "A lump-sum retirement/exit benefit under the Payment of "
                      "Gratuity Act: (15 days' wages × years of service) ÷ 26, "
                      "payable after 5 years; tax-exempt up to ₹20 lakh.",
        "in_app": "Rule-driven settlement at exit — eligibility years, days-per-year "
                  "and divisor configurable; recorded for audit; tax ceiling "
                  "affects F&F TDS.",
        "where": "Exits → F&F settlement; statutory settings (gratuity fields).",
    },
    "bonus": {
        "term": "Statutory bonus",
        "definition": "Bonus payable under the Payment of Bonus Act — 8.33% to 20% "
                      "of wages for eligible employees.",
        "in_app": "Opt-in per company; minimum/maximum rates and wage ceilings "
                  "configurable; paid monthly via payroll or pro-rated at exit.",
        "where": "Statutory settings (bonus fields); Payroll.",
    },
    "fnf": {
        "term": "F&F (Full & Final settlement)",
        "definition": "The final payout when someone leaves: salary until last "
                      "working day, gratuity, leave encashment, bonus, notice pay "
                      "or recovery — minus loans, advances and TDS.",
        "in_app": "One calculation covering all of the above, plus recovery of "
                  "unreturned assets. TDS is deducted on taxable components "
                  "(gratuity exempt up to ₹20L).",
        "where": "Exits → initiate exit → F&F settlement.",
    },
    "maker_checker": {
        "term": "Maker-checker",
        "definition": "A control where the person who prepares something cannot "
                      "approve it — a second person must. Standard in finance to "
                      "prevent fraud and errors.",
        "in_app": "Payroll enforces it: whoever generates/submits a payslip cannot "
                  "approve it; company-wide runs submit instead of approving; locks "
                  "need a different user to reopen. All actions are audit-logged "
                  "in a hash-chained trail.",
        "where": "Payroll approvals; Compliance → audit verify.",
    },
    "proration": {
        "term": "Proration",
        "definition": "Adjusting pay for partial months (joining/leaving mid-month) "
                      "based on days worked.",
        "in_app": "Attendance drives the paid-days factor; policy chooses paid/"
                  "calendar/working days; daily wages convert via 26 or 30-day "
                  "convention; an effective-dated rule can override the divisor.",
        "where": "Payroll policy settings.",
    },
    "accrual": {
        "term": "Leave accrual",
        "definition": "How leave builds up during the year — full quota at start, "
                      "or in monthly/quarterly slices.",
        "in_app": "Per leave template: frontloaded, monthly, quarterly or yearly, "
                  "with probation rate and balance caps. A ledger makes accrual "
                  "idempotent — it can never double-credit.",
        "where": "Leaves → Configuration (leave template).",
    },
    "encashment": {
        "term": "Leave encashment",
        "definition": "Converting unused earned leave into cash, usually at exit.",
        "in_app": "Per template: enabled flag, minimum balance, rate multiplier, "
                  "taxable treatment. Feeds F&F with TDS rules applied.",
        "where": "Leaves → Configuration; Exits → F&F.",
    },
    "ecr": {
        "term": "EPF ECR",
        "definition": "Electronic Challan cum Return — the monthly EPFO filing "
                      "file listing every member's wages and PF contributions.",
        "in_app": "Generated from payroll data in pipe format, ready for the EPFO "
                  "portal. Config-driven layout (mandate: never hard-coded).",
        "where": "Compliance → Statutory Filings → EPF ECR → Download.",
    },
    "form16": {
        "term": "Form 16",
        "definition": "The annual TDS certificate an employer gives each employee "
                      "showing salary and tax deducted.",
        "in_app": "Generated from actual payroll records for the financial year — "
                  "Part A (deposit details) and Part B (income computation).",
        "where": "Payroll → Form 16 download per employee.",
    },
    "geofence": {
        "term": "Geofence check-in",
        "definition": "Restricting clock-in to a GPS radius around the office.",
        "in_app": "Per attendance policy: enable geofence + radius (metres). "
                  "Optional selfie verification at check-in.",
        "where": "Attendance → Configuration.",
    },
    "overtime": {
        "term": "Overtime (OT)",
        "definition": "Extra pay for hours worked beyond the standard day, "
                      "usually at a multiplier of the hourly rate.",
        "in_app": "Threshold hours, multiplier (e.g. 1.5×) and monthly cap "
                  "configurable per company; driven by attendance records.",
        "where": "Attendance → Configuration (Overtime section).",
    },
    "okr": {
        "term": "OKR / Goals",
        "definition": "Objectives and Key Results — a goal-setting framework for "
                      "tracking what each person is supposed to achieve.",
        "in_app": "Goals & OKRs tab under Performance, with optional self-review "
                  "and 360° feedback in the review cycle.",
        "where": "Performance → Goals & OKRs; Configuration.",
    },
    "appraisal": {
        "term": "Performance review (appraisal)",
        "definition": "A periodic evaluation of an employee's work — scores, "
                      "feedback, strengths and salary recommendations.",
        "in_app": "1–5 scoring across multiple dimensions, overall rating, "
                  "promotion/salary recommendations, configurable cadence "
                  "(monthly → annual).",
        "where": "Performance → Reviews; Configuration.",
    },
    "audit_log": {
        "term": "Audit log",
        "definition": "An immutable record of who did what and when — essential "
                      "for compliance and investigations.",
        "in_app": "Every sensitive action is logged, and audit rows are "
                  "hash-chained: editing history breaks verification at the exact "
                  "row. Verify any time from the API/UI.",
        "where": "Compliance → Overview (audit chain badge); GET /api/audit/verify.",
    },
    "onboarding": {
        "term": "Onboarding",
        "definition": "The process of bringing a new hire into the system — "
                      "accounts, leave balances, assets, welcome.",
        "in_app": "Adding an employee auto-provisions a login, leave balances "
                  "and notifications; IT assets are assigned from the Assets module.",
        "where": "Employees → Add; Assets; Leaves → balances.",
    },
    "statutory_register": {
        "term": "Statutory register",
        "definition": "Official registers companies must maintain — PF/ESI/PT "
                      "returns, TDS statements, gratuity register.",
        "in_app": "Generated from payroll data as configuration-driven reports: "
                  "ECR, ESI return, PT statement, TDS register, gratuity register.",
        "where": "Compliance → Statutory Filings.",
    },
}


def _norm(text: str) -> str:
    return "".join(ch for ch in (text or "").lower() if ch.isalnum() or ch.isspace()).strip()


def lookup_glossary(query: str) -> Optional[Dict[str, str]]:
    """Find the best glossary entry for a question."""
    q = _norm(query)
    # "what is X" / "explain X" / "meaning of X" — take the topic words
    topic = q
    for prefix in ("what is a ", "what is an ", "what is the ", "what is ",
                   "explain ", "meaning of ", "tell me about ", "define "):
        if topic.startswith(prefix):
            topic = topic[len(prefix):]
            break
    topic = topic.strip().replace("_", " ")
    if not topic:
        return None
    # Exact key match first (keys normalized: underscores → spaces)
    normalized_keys = {key.replace("_", " "): entry for key, entry in GLOSSARY.items()}
    if topic in normalized_keys:
        return normalized_keys[topic]
    if topic in GLOSSARY:
        return GLOSSARY[topic]
    for key, entry in GLOSSARY.items():
        nkey = key.replace("_", " ")
        if nkey in topic or topic in nkey:
            return entry
        if " " not in nkey and nkey in topic:
            return entry
    return None


def lookup_module(query: str) -> Optional[Dict[str, Any]]:
    """Find the module a question is about (navigation / capabilities)."""
    q = _norm(query)
    # strip navigation scaffolding
    for prefix in ("where is the ", "where is ", "where do i find ",
                   "where can i find ", "how do i get to ", "how do i open ",
                   "take me to ", "open ", "go to ", "show me the ",
                   "show me ", "i want to ", "need to ", "features of ",
                   "what can i do with the ", "what can i do with ",
                   "tell me about the ", "tell me about ", "about the ",
                   "explain the ", "explain "):
        if q.startswith(prefix):
            q = q[len(prefix):]
            break
    q = q.strip()
    if not q:
        return None
    # label containment (also match path segments like 'payroll console')
    for key, mod in MODULES.items():
        label = _norm(mod["label"])
        if q == key or q == label or q in label or label in q:
            return mod
        if q.replace(" ", "") == key.replace("_", ""):
            return mod
    # alias keywords → module keys
    aliases = {
        "leave": "leaves", "leave management": "leaves", "leave approval": "leaves",
        "salary": "payroll", "salaries": "payroll", "payslip": "payroll",
        "pf": "payroll", "esi": "payroll", "tds": "payroll",
        "statutory": "compliance", "challan": "compliance", "filing": "compliance",
        "ecr": "compliance", "tax": "compliance", "complaince": "compliance",
        "full and final": "exits", "fnf": "exits", "exit": "exits",
        "offboarding": "exits", "appraisal": "performance", "review": "performance",
        "goal": "performance", "okr": "performance",
        "claim": "expenses", "reimbursement": "expenses",
        "job": "recruitment", "hiring": "recruitment", "candidate": "recruitment",
        "offer": "recruitment", "holiday": "holidays", "help": "helpdesk",
        "ticket": "helpdesk", "complaint": "grievances", "announcement": "announcements",
        "report": "reports", "setting": "settings", "configuration": "settings",
        "attendance policy": "attendance", "workweek": "attendance",
        "master data": "company", "branch": "company", "department": "company",
    }
    for alias, key in aliases.items():
        if alias in q:
            return MODULES.get(key)
    return None


def describe_module(mod: Dict[str, Any]) -> str:
    lines = [
        f"{mod['label']} — {mod['what']}",
        f"Where: open {mod['path']} from the left sidebar.",
        "Key sections: " + ", ".join(mod.get("tabs", [])),
        "You can: " + "; ".join(mod.get("actions", [])) + ".",
    ]
    return "\n".join(lines)


def describe_concept(entry: Dict[str, str]) -> str:
    return (
        f"{entry['term']}\n"
        f"{entry['definition']}\n"
        f"In HRMS.Pro!: {entry['in_app']}\n"
        f"Where: {entry['where']}"
    )
