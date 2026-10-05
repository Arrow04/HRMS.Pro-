"""Comprehensive module-based first-run setup.

GET  /api/setup/modules     the interview — one section per module, every
                            question mapped to the REAL configuration fields
                            that module's own settings page edits
GET  /api/setup/status      per-module readiness (company-scoped)
POST /api/setup/modules/{module_id}
                            apply one module's answers: AttendancePolicy,
                            LeaveTemplate/LeaveTypes, PayrollPolicy,
                            StatutorySetting, TaxRegime, expense categories,
                            performance settings — upserts, per company.

Architecture: Organization -> Companies (legal entities). Every module
apply is scoped to companyId (None = org-wide defaults for single-company
orgs). Leave types are org-level master data (global unique codes; the
leave engine resolves by org) — templates, statutory, attendance, payroll
policy and tax regime are per-company.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_user
from database import get_db
from models import (
    AttendancePolicy, Company, Employee, LeaveTemplate, LeaveType,
    LookupCategory, LookupValue, Organization, Payroll, PayrollPolicy,
    StatutorySetting, TaxRegime, TaxSlab, User,
)

router = APIRouter(tags=["Setup"])

_SETUP_ROLES = ("superadmin", "admin")


def _require(user: User):
    if (user.role or "").lower() not in _SETUP_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can run setup")


def _scope_q(q, model, company_id: Optional[int]):
    if company_id is not None:
        return q.filter(model.company_id == company_id)
    return q.filter(model.company_id.is_(None))


def _get_org_company(db: Session, org_id: int, company_id: Optional[int]):
    if company_id is None:
        return None
    co = db.query(Company).filter(
        Company.id == company_id,
        Company.organization_id == org_id,
        Company.deleted_at.is_(None),
    ).first()
    if not co:
        raise HTTPException(status_code=404, detail="Company not found in this organization")
    return co


# ══════════════════════════════════════════════════════════════════════════
# MODULES — interview data. Every field maps to a real model/settings column.
# ══════════════════════════════════════════════════════════════════════════

MODULES: List[Dict[str, Any]] = [
    {
        "id": "company",
        "title": "Company & Statutory",
        "help": "Registration basics and the government deductions that apply to this company.",
        "questions": [
            {
                "id": "country", "type": "choice", "default": "india",
                "title": "Where is the company registered?",
                "help": "Decides which statutory regime we configure.",
                "options": [
                    {"value": "india", "label": "India",
                     "hint": "EPF, ESI, Professional Tax & TDS under Indian law"},
                    {"value": "other", "label": "Outside India",
                     "hint": "Country-specific rules can be published later"},
                ],
            },
            {
                "id": "state", "type": "choice", "default": "KA",
                "title": "Registered office state?",
                "help": "Professional Tax rates and labour funds differ by state.",
                "options": [
                    {"value": "KA", "label": "Karnataka"}, {"value": "MH", "label": "Maharashtra"},
                    {"value": "TN", "label": "Tamil Nadu"}, {"value": "DL", "label": "Delhi"},
                    {"value": "TG", "label": "Telangana"}, {"value": "AP", "label": "Andhra Pradesh"},
                    {"value": "WB", "label": "West Bengal"}, {"value": "GJ", "label": "Gujarat"},
                    {"value": "RJ", "label": "Rajasthan"}, {"value": "UP", "label": "Uttar Pradesh"},
                    {"value": "MP", "label": "Madhya Pradesh"}, {"value": "KL", "label": "Kerala"},
                    {"value": "OTHER", "label": "Other state"},
                ],
            },
            {
                "id": "currency", "type": "choice", "default": "INR",
                "title": "Payroll currency?",
                "options": [
                    {"value": "INR", "label": "Indian Rupee (₹)"},
                    {"value": "USD", "label": "US Dollar ($)"},
                    {"value": "AED", "label": "UAE Dirham"},
                    {"value": "GBP", "label": "British Pound (£)"},
                    {"value": "EUR", "label": "Euro (€)"},
                    {"value": "SGD", "label": "Singapore Dollar"},
                ],
            },
            {
                "id": "fy_start", "type": "choice", "default": "april",
                "title": "Financial year starts in?",
                "options": [
                    {"value": "april", "label": "April", "hint": "Indian financial year (Apr–Mar)"},
                    {"value": "january", "label": "January", "hint": "Calendar year (Jan–Dec)"},
                ],
            },
            {
                "id": "deductions", "type": "fields", "default": {},
                "title": "Statutory deductions — review the rates",
                "help": "These are the current statutory defaults. Change anything that "
                        "differs for this company; the payroll engine uses exactly these numbers.",
                "fields": [
                    {"id": "pf_applicable", "type": "toggle", "label": "Provident Fund (PF)", "default": True},
                    {"id": "pf_employee_rate", "type": "number", "label": "PF employee rate (%)", "default": 12.0, "showIf": "pf_applicable"},
                    {"id": "pf_employer_rate", "type": "number", "label": "PF employer rate (%)", "default": 12.0, "showIf": "pf_applicable"},
                    {"id": "pf_wage_ceiling", "type": "number", "label": "PF wage ceiling (₹ / month)", "default": 15000.0, "showIf": "pf_applicable"},
                    {"id": "pf_min_basic_for_exclusion", "type": "number", "label": "Exclude members earning above (₹ / month)", "default": 15000.0, "showIf": "pf_applicable"},
                    {"id": "pf_edli_rate", "type": "number", "label": "EDLI rate (%)", "default": 0.5, "showIf": "pf_applicable"},
                    {"id": "pf_edli_max_monthly", "type": "number", "label": "EDLI max (₹ / month)", "default": 75.0, "showIf": "pf_applicable"},
                    {"id": "pf_admin_rate", "type": "number", "label": "PF admin rate (%)", "default": 0.5, "showIf": "pf_applicable"},
                    {"id": "pf_admin_min_monthly", "type": "number", "label": "PF admin min (₹ / month)", "default": 75.0, "showIf": "pf_applicable"},
                    {"id": "eps_employer_rate", "type": "number", "label": "EPS (pension) employer rate (%)", "default": 8.33, "showIf": "pf_applicable"},
                    {"id": "eps_wage_ceiling", "type": "number", "label": "EPS wage ceiling (₹ / month)", "default": 15000.0, "showIf": "pf_applicable"},
                    {"id": "esi_applicable", "type": "toggle", "label": "Employee State Insurance (ESI)", "default": True},
                    {"id": "esi_employee_rate", "type": "number", "label": "ESI employee rate (%)", "default": 0.75, "showIf": "esi_applicable"},
                    {"id": "esi_employer_rate", "type": "number", "label": "ESI employer rate (%)", "default": 3.25, "showIf": "esi_applicable"},
                    {"id": "esi_gross_ceiling", "type": "number", "label": "ESI wage ceiling (₹ / month)", "default": 21000.0, "showIf": "esi_applicable"},
                    {"id": "esi_disabled_ceiling", "type": "number", "label": "ESI ceiling — persons with disabilities (₹ / month)", "default": 25000.0, "showIf": "esi_applicable"},
                    {"id": "pt_applicable", "type": "toggle", "label": "Professional Tax (PT)", "default": True},
                    {"id": "pt_monthly_amount", "type": "number", "label": "PT per month (₹)", "default": 200.0, "showIf": "pt_applicable"},
                    {"id": "pt_min_gross", "type": "number", "label": "PT applies above gross (₹ / month)", "default": 10000.0, "showIf": "pt_applicable"},
                    {"id": "lwf_applicable", "type": "toggle", "label": "Labour Welfare Fund (LWF)", "default": False},
                    {"id": "lwf_employee_rate", "type": "number", "label": "LWF employee (₹ / month)", "default": 0.0, "showIf": "lwf_applicable"},
                    {"id": "lwf_employer_rate", "type": "number", "label": "LWF employer (₹ / month)", "default": 0.0, "showIf": "lwf_applicable"},
                    {"id": "gratuity_applicable", "type": "toggle", "label": "Gratuity (Payment of Gratuity Act)", "default": True},
                    {"id": "bonus_applicable", "type": "toggle", "label": "Statutory bonus (Payment of Bonus Act)", "default": False},
                ],
            },
        ],
    },
    {
        "id": "attendance",
        "title": "Attendance",
        "help": "Working schedule, overtime, late/half-day rules and verification — the same fields the Attendance → Configuration page edits.",
        "questions": [
            {
                "id": "schedule", "type": "fields", "default": {},
                "title": "Work schedule",
                "fields": [
                    {"id": "workweek", "type": "choice", "label": "Workweek",
                     "default": "mon_fri",
                     "options": [
                         {"value": "mon_fri", "label": "Mon–Fri (Sat & Sun off)"},
                         {"value": "mon_sat", "label": "Mon–Sat (Sun off)"},
                     ]},
                    {"id": "check_in_time", "type": "time", "label": "Check-in time", "default": "09:00"},
                    {"id": "check_out_time", "type": "time", "label": "Check-out time", "default": "18:00"},
                    {"id": "break_hours", "type": "number", "label": "Unpaid break (hours)", "default": 1.0},
                    {"id": "min_hours_for_full_day", "type": "number", "label": "Hours for a full day", "default": 8.0},
                    {"id": "late_grace_minutes", "type": "number", "label": "Grace period for late arrival (minutes)", "default": 15},
                ],
            },
            {
                "id": "overtime", "type": "fields", "default": {},
                "title": "Overtime",
                "fields": [
                    {"id": "overtime_enabled", "type": "toggle", "label": "Pay overtime", "default": True},
                    {"id": "overtime_threshold_hours", "type": "number", "label": "Overtime starts after (hours/day)", "default": 9.0, "showIf": "overtime_enabled"},
                    {"id": "overtime_rate", "type": "number", "label": "Overtime multiplier (× hourly rate)", "default": 1.5, "showIf": "overtime_enabled"},
                    {"id": "max_overtime_hours_per_month", "type": "number", "label": "Max overtime hours / month (0 = unlimited)", "default": 0, "showIf": "overtime_enabled"},
                ],
            },
            {
                "id": "day_rules", "type": "fields", "default": {},
                "title": "Late, half-day & missing punch rules",
                "fields": [
                    {"id": "half_day_threshold_hours", "type": "number", "label": "Below this many hours = half day", "default": 4.0},
                    {"id": "half_day_as_full_paid", "type": "toggle", "label": "Half day counts as full paid day", "default": True},
                    {"id": "late_to_absent", "type": "choice", "label": "Lates that convert to an absence",
                     "default": "off",
                     "options": [
                         {"value": "off", "label": "Never"},
                         {"value": "3", "label": "3 lates = 1 absent"},
                         {"value": "5", "label": "5 lates = 1 absent"},
                     ]},
                    {"id": "missing_checkout_rule", "type": "choice", "label": "Check-in without check-out counts as",
                     "default": "half_day",
                     "options": [
                         {"value": "half_day", "label": "Half day"},
                         {"value": "absent", "label": "Absent"},
                     ]},
                    {"id": "paid_leave_as_present", "type": "toggle", "label": "Paid leave counts as present for payroll", "default": True},
                    {"id": "holiday_as_present", "type": "toggle", "label": "Holidays count as paid days", "default": True},
                ],
            },
            {
                "id": "work_mode", "type": "fields", "default": {},
                "title": "Work mode & verification",
                "fields": [
                    {"id": "wfh_allowed", "type": "toggle", "label": "Work from home allowed", "default": False},
                    {"id": "geofence_enabled", "type": "toggle", "label": "Geofence check-in (office location required)", "default": False},
                    {"id": "geofence_radius", "type": "number", "label": "Geofence radius (metres)", "default": 100, "showIf": "geofence_enabled"},
                    {"id": "selfie_checkin_enabled", "type": "toggle", "label": "Selfie required at check-in", "default": False},
                    {"id": "comp_off_enabled", "type": "toggle", "label": "Comp-off for working on holidays", "default": False},
                    {"id": "max_comp_off_balance", "type": "number", "label": "Max comp-off balance", "default": 5, "showIf": "comp_off_enabled"},
                ],
            },
        ],
    },
    {
        "id": "leave",
        "title": "Leave Policy",
        "help": "Leave types and quotas, accrual, carry-forward, encashment and application rules — the same fields the Leave → Templates page edits.",
        "questions": [
            {
                "id": "types", "type": "fields", "default": {},
                "title": "Leave types & annual quotas",
                "help": "Enable the types you offer; days are per employee per year.",
                "fields": [
                    {"id": "casual_enabled", "type": "toggle", "label": "Casual Leave", "default": True},
                    {"id": "casual_days", "type": "number", "label": "Casual — days / year", "default": 7, "showIf": "casual_enabled"},
                    {"id": "sick_enabled", "type": "toggle", "label": "Sick Leave", "default": True},
                    {"id": "sick_days", "type": "number", "label": "Sick — days / year", "default": 7, "showIf": "sick_enabled"},
                    {"id": "earned_enabled", "type": "toggle", "label": "Earned / Privilege Leave", "default": True},
                    {"id": "earned_days", "type": "number", "label": "Earned — days / year", "default": 15, "showIf": "earned_enabled"},
                    {"id": "earned_encashable", "type": "toggle", "label": "Earned leave is encashable at exit", "default": True, "showIf": "earned_enabled"},
                    {"id": "maternity_enabled", "type": "toggle", "label": "Maternity Leave", "default": False},
                    {"id": "maternity_days", "type": "number", "label": "Maternity — days", "default": 182, "showIf": "maternity_enabled"},
                    {"id": "comp_off_enabled", "type": "toggle", "label": "Comp-off type", "default": False},
                    {"id": "comp_off_days", "type": "number", "label": "Comp-off — days / year", "default": 5, "showIf": "comp_off_enabled"},
                ],
            },
            {
                "id": "accrual", "type": "fields", "default": {},
                "title": "Accrual & balance rules",
                "help": "How leave builds up over the year, and the caps that apply.",
                "fields": [
                    {"id": "accrual_method", "type": "choice", "label": "Leave accrues",
                     "default": "frontloaded",
                     "options": [
                         {"value": "frontloaded", "label": "Full quota at year start",
                          "hint": "Standard for most Indian companies"},
                         {"value": "monthly", "label": "Equally every month"},
                         {"value": "quarterly", "label": "Every quarter"},
                         {"value": "yearly", "label": "Once a year (January)"},
                     ]},
                    {"id": "accrual_day", "type": "number", "label": "Accrual day of month", "default": 1},
                    {"id": "probation_accrual_rate", "type": "number", "label": "Accrual rate during probation (0–1)", "default": 0.5},
                    {"id": "max_balance_cap", "type": "number", "label": "Max balance cap per type (0 = unlimited)", "default": 0},
                    {"id": "lapse_unused", "type": "toggle", "label": "Unused leave lapses at year end", "default": False},
                    {"id": "carry_forward_enabled", "type": "toggle", "label": "Carry-forward to next year", "default": False},
                    {"id": "carry_forward_max_days", "type": "number", "label": "Max days carried forward", "default": 0, "showIf": "carry_forward_enabled"},
                    {"id": "carry_forward_expiry", "type": "choice", "label": "Carried leave expires",
                     "default": "year_end", "showIf": "carry_forward_enabled",
                     "options": [
                         {"value": "year_end", "label": "At year end"},
                         {"value": "quarter", "label": "After a quarter"},
                         {"value": "never", "label": "Never"},
                     ]},
                    {"id": "carry_forward_use_it_or_lose_it", "type": "toggle", "label": "Use-it-or-lose-it on carried leave", "default": False, "showIf": "carry_forward_enabled"},
                ],
            },
            {
                "id": "encashment", "type": "fields", "default": {},
                "title": "Encashment & application rules",
                "fields": [
                    {"id": "encashment_enabled", "type": "toggle", "label": "Allow leave encashment at exit", "default": False},
                    {"id": "encashment_min_balance", "type": "number", "label": "Minimum balance required to encash", "default": 0, "showIf": "encashment_enabled"},
                    {"id": "encashment_rate", "type": "number", "label": "Encashment rate multiplier (1 = full day wage)", "default": 1, "showIf": "encashment_enabled"},
                    {"id": "encashment_taxable", "type": "toggle", "label": "Encashment amount is fully taxable", "default": False, "showIf": "encashment_enabled"},
                    {"id": "enable_half_day", "type": "toggle", "label": "Half-day leave allowed", "default": True},
                    {"id": "min_leave_for_half_day", "type": "number", "label": "Min consecutive days to qualify for half-day", "default": 1, "showIf": "enable_half_day"},
                    {"id": "advance_notice_days", "type": "number", "label": "Advance notice required (days)", "default": 1},
                    {"id": "max_consecutive_days", "type": "number", "label": "Max consecutive leave days (0 = unlimited)", "default": 0},
                    {"id": "holiday_optional_limit", "type": "number", "label": "Optional holidays allowed / year (0 = none)", "default": 0},
                    {"id": "approval_levels", "type": "number", "label": "Approval levels (1 = manager only)", "default": 1},
                ],
            },
        ],
    },
    {
        "id": "payroll",
        "title": "Payroll & Salary",
        "help": "Pay calculation conventions, retirement benefits and income-tax — the same fields Payroll Setup edits.",
        "questions": [
            {
                "id": "structure", "type": "fields", "default": {},
                "title": "Pay calculation conventions",
                "fields": [
                    {"id": "pay_frequency", "type": "choice", "label": "Most employees are paid",
                     "default": "monthly",
                     "options": [
                         {"value": "monthly", "label": "Monthly salary"},
                         {"value": "daily", "label": "Daily wages"},
                         {"value": "mixed", "label": "A mix of both"},
                     ]},
                    {"id": "daily_divisor", "type": "choice", "label": "Daily wage converts to monthly using",
                     "default": "30",
                     "options": [
                         {"value": "30", "label": "30-day month"},
                         {"value": "26", "label": "26-day month (26-wage convention)"},
                         {"value": "working", "label": "Actual working days"},
                     ]},
                    {"id": "pro_ration_method", "type": "choice", "label": "Partial months are prorated by",
                     "default": "paid_days",
                     "options": [
                         {"value": "paid_days", "label": "Paid days"},
                         {"value": "calendar_days", "label": "Calendar days"},
                         {"value": "working_days", "label": "Working days"},
                     ]},
                    {"id": "rounding_method", "type": "choice", "label": "Money rounding",
                     "default": "nearest",
                     "options": [
                         {"value": "nearest", "label": "Nearest paisa"},
                         {"value": "floor", "label": "Always round down"},
                         {"value": "ceil", "label": "Always round up"},
                         {"value": "truncate", "label": "Truncate decimals"},
                     ]},
                    {"id": "decimal_places", "type": "number", "label": "Decimal places", "default": 2},
                    {"id": "payroll_day", "type": "number", "label": "Salary credited on (day of month, 0 = month end)", "default": 1},
                ],
            },
            {
                "id": "benefits", "type": "fields", "default": {},
                "title": "Retirement & bonus benefits",
                "fields": [
                    {"id": "gratuity_eligible_years", "type": "number", "label": "Gratuity eligibility (years of service)", "default": 5.0},
                    {"id": "gratuity_days_per_year", "type": "number", "label": "Gratuity days per year of service", "default": 15.0},
                    {"id": "gratuity_rate", "type": "number", "label": "Gratuity rate (% of last wages)", "default": 4.81},
                    {"id": "gratuity_tax_exempt_ceiling", "type": "number", "label": "Gratuity tax-exempt ceiling (₹)", "default": 2000000.0},
                    {"id": "bonus_min_rate", "type": "number", "label": "Bonus minimum rate (%)", "default": 8.33},
                    {"id": "bonus_max_rate", "type": "number", "label": "Bonus maximum rate (%)", "default": 20.0},
                    {"id": "bonus_eligible_ceiling", "type": "number", "label": "Bonus eligibility wage ceiling (₹ / month)", "default": 21000.0},
                    {"id": "bonus_wage_ceiling", "type": "number", "label": "Bonus payable wage ceiling (₹ / month)", "default": 7000.0},
                ],
            },
            {
                "id": "tds", "type": "fields", "default": {},
                "title": "Income tax (TDS)",
                "help": "Standard new-regime configuration. Slabs ship with the regime and stay editable in Payroll Setup.",
                "fields": [
                    {"id": "tds_enabled", "type": "toggle", "label": "Deduct TDS from salaries", "default": True},
                    {"id": "std_deduction", "type": "number", "label": "Standard deduction (₹ / year)", "default": 75000.0},
                    {"id": "rebate_threshold", "type": "number", "label": "Rebate threshold — 87A (₹ / year)", "default": 700000.0},
                    {"id": "cess_rate", "type": "number", "label": "Health & education cess (%)", "default": 4.0},
                ],
            },
        ],
    },
    {
        "id": "expenses",
        "title": "Expenses",
        "help": "Expense categories employees can claim, and the approval workflow.",
        "questions": [
            {
                "id": "categories", "type": "multi",
                "default": ["travel", "food", "accommodation", "office", "transport", "medical", "other"],
                "title": "Expense categories",
                "help": "Employees pick from these when filing a claim.",
                "options": [
                    {"value": "travel", "label": "Travel", "hint": "Flights, cabs, fuel, tickets"},
                    {"value": "food", "label": "Food", "hint": "Meals during travel or client work"},
                    {"value": "accommodation", "label": "Accommodation", "hint": "Hotels, stays"},
                    {"value": "office", "label": "Office supplies", "hint": "Stationery, peripherals"},
                    {"value": "transport", "label": "Local transport", "hint": "Daily commute claims"},
                    {"value": "medical", "label": "Medical", "hint": "Health-related expenses"},
                    {"value": "other", "label": "Other", "hint": "Everything else"},
                ],
            },
            {
                "id": "workflow", "type": "fields", "default": {},
                "title": "Approval workflow",
                "fields": [
                    {"id": "require_receipt", "type": "toggle", "label": "Receipt / proof mandatory with every claim", "default": True},
                    {"id": "dual_approval", "type": "toggle", "label": "Two-level approval (manager + finance)", "default": False},
                ],
            },
        ],
    },
    {
        "id": "performance",
        "title": "Performance",
        "help": "Review cadence and the evaluation features your managers will use.",
        "questions": [
            {
                "id": "cycle", "type": "choice", "default": "quarterly",
                "title": "How often do you run performance reviews?",
                "options": [
                    {"value": "monthly", "label": "Monthly"},
                    {"value": "quarterly", "label": "Quarterly", "hint": "Most common for growing teams"},
                    {"value": "semi_annual", "label": "Half-yearly"},
                    {"value": "annual", "label": "Annual"},
                ],
            },
            {
                "id": "features", "type": "fields", "default": {},
                "title": "Review workflow",
                "fields": [
                    {"id": "enable_self_review", "type": "toggle", "label": "Employees self-review before the manager review", "default": True},
                    {"id": "enable_360_feedback", "type": "toggle", "label": "360° peer feedback", "default": False},
                    {"id": "enable_goal_tracking", "type": "toggle", "label": "Goal tracking (OKRs / KPIs)", "default": True},
                ],
            },
        ],
    },
]

MODULE_IDS = [m["id"] for m in MODULES]


# ══════════════════════════════════════════════════════════════════════════
# STATUS — per-module readiness, company-scoped
# ══════════════════════════════════════════════════════════════════════════

def compute_setup_status(db: Session, org_id: int, company_id: Optional[int] = None) -> dict:
    has_statutory = _scope_q(
        db.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org_id,
            StatutorySetting.status == "active",
        ), StatutorySetting, company_id,
    ).first() is not None
    has_attendance = _scope_q(
        db.query(AttendancePolicy).filter(AttendancePolicy.organization_id == org_id),
        AttendancePolicy, company_id,
    ).first() is not None
    has_leave_template = _scope_q(
        db.query(LeaveTemplate).filter(
            LeaveTemplate.organization_id == org_id,
            LeaveTemplate.deleted_at.is_(None),
            LeaveTemplate.status == "active",
        ), LeaveTemplate, company_id,
    ).first() is not None
    leave_type_count = db.query(LeaveType).filter(
        LeaveType.organization_id == org_id,
        LeaveType.status == "active",
    ).count()
    has_policy = _scope_q(
        db.query(PayrollPolicy).filter(
            PayrollPolicy.organization_id == org_id,
            PayrollPolicy.status == "active",
        ), PayrollPolicy, company_id,
    ).first() is not None
    has_regime = _scope_q(
        db.query(TaxRegime).filter(
            TaxRegime.organization_id == org_id,
            TaxRegime.is_active.is_(True),
        ), TaxRegime, company_id,
    ).first() is not None
    has_expense_cats = (
        db.query(LookupCategory).filter(
            LookupCategory.code == "EXPENSE_CATEGORY",
            LookupCategory.deleted_at.is_(None),
        ).first() is not None
        and db.query(LookupValue).join(
            LookupCategory, LookupValue.category_id == LookupCategory.id,
        ).filter(
            LookupCategory.code == "EXPENSE_CATEGORY",
            LookupValue.deleted_at.is_(None),
            LookupValue.is_active.is_(True),
        ).count() > 0
    )
    org = db.query(Organization).filter(Organization.id == org_id).first()
    perf_settings = ((getattr(org, "settings", None) or {}).get("performance") or {}) if org else {}
    has_performance = bool(perf_settings.get("reviewCycle"))

    emp_q = db.query(Employee).filter(
        Employee.organization_id == org_id,
        Employee.deleted_at.is_(None),
        Employee.status == "active",
    )
    pay_q = db.query(Payroll).filter(
        Payroll.organization_id == org_id,
        Payroll.deleted_at.is_(None),
    )
    if company_id is not None:
        emp_q = emp_q.filter(Employee.company_id == company_id)
        pay_q = pay_q.filter(Payroll.company_id == company_id)

    module_done = {
        "company": has_statutory,
        "attendance": has_attendance,
        "leave": has_leave_template and leave_type_count > 0,
        "payroll": has_policy and has_regime,
        "expenses": has_expense_cats,
        "performance": has_performance,
    }
    steps = []
    for m in MODULES:
        done = module_done.get(m["id"], False)
        # Setup lives INSIDE each module's own configuration wizard — the
        # checklist deep-links there instead of a separate setup page.
        module_link = {
            "company": "/payroll/setup",
            "attendance": "/attendance?tab=configuration",
            "leave": "/leaves?tab=configuration",
            "payroll": "/payroll/setup",
            "expenses": "/expenses?tab=config",
            "performance": "/performance?tab=configuration",
        }.get(m["id"], "/dashboard")
        steps.append({
            "id": m["id"],
            "title": m["title"],
            "why": m.get("help", ""),
            "hint": "",
            "action": f"Configure {m['title']}",
            "link": module_link,
            "done": done,
        })
    completed = sum(1 for s in steps if s["done"])
    next_step = next((s for s in steps if not s["done"]), None)

    companies = [
        {"id": c.id, "name": c.name}
        for c in db.query(Company).filter(
            Company.organization_id == org_id,
            Company.deleted_at.is_(None),
        ).order_by(Company.name).all()
    ]
    company_scope = None
    if company_id is not None:
        company_scope = next((c for c in companies if c["id"] == company_id), None)

    return {
        "steps": steps,
        "modules": module_done,
        "completed": completed,
        "total": len(steps),
        "complete": completed == len(steps),
        "nextStep": next_step,
        "counts": {
            "employees": emp_q.count(),
            "leaveTypes": leave_type_count,
            "payrolls": pay_q.count(),
        },
        "organization": {
            "id": org.id,
            "name": org.name,
            "country": getattr(org, "country", None),
            "currency": getattr(org, "default_currency", None),
        } if org else None,
        "companies": companies,
        "companyScope": company_scope,
        "companyId": company_id,
    }


class ModuleAnswers(BaseModel):
    answers: Dict[str, Any] = {}
    companyId: Optional[int] = None


def _field_defaults(q: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if q.get("type") == "fields":
        for f in q.get("fields", []):
            out[f["id"]] = f.get("default")
    elif "default" in q:
        out[q["id"]] = q["default"]
    return out


def _merged_answers(module: Dict[str, Any], answers: Dict[str, Any]) -> Dict[str, Any]:
    """Module defaults + caller answers. Accepts BOTH shapes:
      nested: {"structure": {"pay_frequency": "daily"}}   (the FE wizard)
      flat:   {"pay_frequency": "daily"}                  (API convenience)
    """
    merged: Dict[str, Any] = {}
    for q in module.get("questions", []):
        merged.update(_field_defaults(q))
        if q.get("type") == "fields":
            sub = answers.get(q["id"])
            if isinstance(sub, dict):
                merged.update(sub)
            for f in q.get("fields", []):
                if f["id"] in answers:
                    merged[f["id"]] = answers[f["id"]]
        elif q["id"] in answers:
            merged[q["id"]] = answers[q["id"]]
    return merged


def _apply_company(db: Session, org: Organization, a: Dict[str, Any], cid: Optional[int]) -> List[str]:
    applied: List[str] = []
    org_id = org.id
    country = str(a.get("country") or "india")
    currency = str(a.get("currency") or "INR")
    fy_month = 4 if str(a.get("fy_start") or "april") == "april" else 1
    state = str(a.get("state") or "").upper()

    org.country = country if country != "other" else (getattr(org, "country", None) or "Other")
    org.default_currency = currency
    settings = dict(getattr(org, "settings", None) or {})
    payroll_cfg = dict(settings.get("payroll") or {})
    payroll_cfg["fyStartMonth"] = fy_month
    payroll_cfg["payrollFrequency"] = "monthly"
    settings["payroll"] = payroll_cfg
    settings["registered_state"] = state
    org.settings = settings
    applied.append(f"Company profile ({currency}, FY from {'April' if fy_month == 4 else 'January'}, state {state or '—'})")

    # StatutorySetting — explicit answers upsert over defaults
    q = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == org_id,
        StatutorySetting.status == "active",
    )
    q = _scope_q(q, StatutorySetting, cid)
    setting = q.first()
    fields = {
        "pf_applicable": bool(a.get("pf_applicable", True)),
        "pf_employee_rate": float(a.get("pf_employee_rate", 12.0)),
        "pf_employer_rate": float(a.get("pf_employer_rate", 12.0)),
        "pf_wage_ceiling": float(a.get("pf_wage_ceiling", 15000.0)),
        "pf_max_monthly": round(float(a.get("pf_wage_ceiling", 15000.0)) * float(a.get("pf_employee_rate", 12.0)) / 100.0, 2),
        "pf_min_basic_for_exclusion": float(a.get("pf_min_basic_for_exclusion", 15000.0)),
        "pf_edli_rate": float(a.get("pf_edli_rate", 0.5)),
        "pf_edli_max_monthly": float(a.get("pf_edli_max_monthly", 75.0)),
        "pf_admin_rate": float(a.get("pf_admin_rate", 0.5)),
        "pf_admin_min_monthly": float(a.get("pf_admin_min_monthly", 75.0)),
        "eps_employer_rate": float(a.get("eps_employer_rate", 8.33)),
        "eps_wage_ceiling": float(a.get("eps_wage_ceiling", 15000.0)),
        "esi_applicable": bool(a.get("esi_applicable", True)),
        "esi_employee_rate": float(a.get("esi_employee_rate", 0.75)),
        "esi_employer_rate": float(a.get("esi_employer_rate", 3.25)),
        "esi_gross_ceiling": float(a.get("esi_gross_ceiling", 21000.0)),
        "esi_disabled_ceiling": float(a.get("esi_disabled_ceiling", 25000.0)),
        "pt_applicable": bool(a.get("pt_applicable", True)),
        "pt_monthly_amount": float(a.get("pt_monthly_amount", 200.0)),
        "pt_min_gross": float(a.get("pt_min_gross", 10000.0)),
        "lwf_applicable": bool(a.get("lwf_applicable", False)),
        "lwf_employee_rate": float(a.get("lwf_employee_rate", 0.0)),
        "lwf_employer_rate": float(a.get("lwf_employer_rate", 0.0)),
        "gratuity_applicable": bool(a.get("gratuity_applicable", True)),
        "bonus_applicable": bool(a.get("bonus_applicable", False)),
    }
    if setting is None:
        setting = StatutorySetting(organization_id=org_id, company_id=cid, status="active", **fields)
        db.add(setting)
    else:
        for k, v in fields.items():
            setattr(setting, k, v)
    applied.append("Statutory rates (PF / ESI / PT / gratuity / bonus)")

    # Tax regime + standard slabs
    reg_q = db.query(TaxRegime).filter(
        TaxRegime.organization_id == org_id,
        TaxRegime.is_active.is_(True),
    )
    reg_q = _scope_q(reg_q, TaxRegime, cid)
    regime = reg_q.first()
    year = datetime.utcnow().year
    reg_fields = {
        "name": "New Regime (Standard)",
        "regime_type": "new",
        "is_default": True,
        "financial_year": f"{year}-{str((year + 1) % 100).zfill(2)}",
        "standard_deduction": float(a.get("std_deduction", 75000.0)),
        "rebate_threshold": float(a.get("rebate_threshold", 700000.0)),
        "rebate_amount": 0.0,
        "cess_rate": float(a.get("cess_rate", 4.0)),
    }
    if regime is None:
        regime = TaxRegime(organization_id=org_id, company_id=cid, is_active=True, **reg_fields)
        db.add(regime)
        db.flush()
        for i, (lo, hi, rate) in enumerate((
            (0.0, 400000.0, 0.0), (400000.0, 800000.0, 5.0),
            (800000.0, 1200000.0, 10.0), (1200000.0, 1600000.0, 15.0),
            (1600000.0, 2000000.0, 20.0), (2000000.0, 2400000.0, 25.0),
            (2400000.0, None, 30.0),
        )):
            db.add(TaxSlab(tax_regime_id=regime.id, from_amount=lo, to_amount=hi,
                           rate=rate, sort_order=i))
    else:
        for k, v in reg_fields.items():
            setattr(regime, k, v)
    applied.append("Income tax regime + slabs (TDS)")
    return applied


def _apply_attendance(db: Session, org: Organization, a: Dict[str, Any], cid: Optional[int]) -> List[str]:
    org_id = org.id
    wk = "1,2,3,4,5" if str(a.get("workweek", "mon_fri")) == "mon_fri" else "1,2,3,4,5,6"
    wk_days = 5 if wk == "1,2,3,4,5" else 6
    late_to_absent = a.get("late_to_absent", "off")
    fields = {
        "name": "Default Attendance Policy",
        "working_days": wk,
        "working_days_per_week": wk_days,
        "check_in_time": str(a.get("check_in_time") or "09:00"),
        "check_out_time": str(a.get("check_out_time") or "18:00"),
        "break_hours": float(a.get("break_hours", 1.0)),
        "min_hours_for_full_day": float(a.get("min_hours_for_full_day", 8.0)),
        "late_mark_threshold_minutes": int(float(a.get("late_grace_minutes", 15))),
        "overtime_threshold_hours": float(a.get("overtime_threshold_hours", 9.0)),
        "overtime_rate": float(a.get("overtime_rate", 1.5)),
        "max_overtime_hours_per_month": (float(a["max_overtime_hours_per_month"])
                                         if float(a.get("max_overtime_hours_per_month") or 0) > 0 else None),
        "half_day_threshold_hours": float(a.get("half_day_threshold_hours", 4.0)),
        "half_day_as_full_paid": bool(a.get("half_day_as_full_paid", True)),
        "late_to_absent_count": (int(late_to_absent) if str(late_to_absent) in ("3", "5") else None),
        "missing_checkout_rule": str(a.get("missing_checkout_rule") or "half_day"),
        "paid_leave_as_present": bool(a.get("paid_leave_as_present", True)),
        "holiday_as_present": bool(a.get("holiday_as_present", True)),
        "wfh_allowed": bool(a.get("wfh_allowed", False)),
        "geofence_enabled": bool(a.get("geofence_enabled", False)),
        "geofence_radius": float(a.get("geofence_radius", 100)),
        "selfie_checkin_enabled": bool(a.get("selfie_checkin_enabled", False)),
        "comp_off_enabled": bool(a.get("comp_off_enabled", False)),
        "max_comp_off_balance": int(float(a.get("max_comp_off_balance", 5))),
        "status": "active",
    }
    q = db.query(AttendancePolicy).filter(AttendancePolicy.organization_id == org_id)
    q = _scope_q(q, AttendancePolicy, cid)
    policy = q.first()
    if policy is None:
        db.add(AttendancePolicy(organization_id=org_id, company_id=cid, **fields))
    else:
        for k, v in fields.items():
            setattr(policy, k, v)
    # Mirror the org-level attendance settings the Settings page reads
    settings = dict(getattr(org, "settings", None) or {})
    settings["attendance"] = {
        **(settings.get("attendance") or {}),
        "checkInTime": fields["check_in_time"],
        "checkOutTime": fields["check_out_time"],
        "lateGraceMinutes": fields["late_mark_threshold_minutes"],
        "enableGeofence": fields["geofence_enabled"],
        "geoFenceRadius": int(fields["geofence_radius"]),
        "enableSelfie": fields["selfie_checkin_enabled"],
        "enableOvertime": float(a.get("overtime_threshold_hours", 9.0)) > 0,
        "workDays": wk,
    }
    org.settings = settings
    ot = "off" if float(a.get("overtime_threshold_hours", 9.0)) <= 0 else f"{fields['overtime_rate']}× after {fields['overtime_threshold_hours']}h"
    return [
        f"Schedule ({fields['check_in_time']}–{fields['check_out_time']}, {wk_days}-day week)",
        f"Overtime ({ot})",
        f"Day rules (half-day < {fields['half_day_threshold_hours']}h, late grace {fields['late_mark_threshold_minutes']}m)",
        "Work mode & verification" if (fields["geofence_enabled"] or fields["wfh_allowed"]
                                        or fields["comp_off_enabled"] or fields["selfie_checkin_enabled"])
        else "Work mode defaults",
    ]


_LEAVE_TYPE_SPECS = {
    "casual": ("Casual Leave", 7), "sick": ("Sick Leave", 7),
    "earned": ("Earned Leave", 15), "maternity": ("Maternity Leave", 182),
    "comp_off": ("Comp Off", 5),
}


def _apply_leave(db: Session, org: Organization, a: Dict[str, Any], cid: Optional[int]) -> List[str]:
    org_id = org.id
    applied: List[str] = []
    created, updated = [], []
    body_rows = []
    for key, (name, default_days) in _LEAVE_TYPE_SPECS.items():
        enabled = bool(a.get(f"{key}_enabled", key in ("casual", "sick", "earned")))
        if not enabled:
            continue
        days = int(float(a.get(f"{key}_days", default_days) or default_days))
        encashable = bool(a.get("earned_encashable", True)) if key == "earned" else False
        existing = db.query(LeaveType).filter(
            LeaveType.organization_id == org_id,
            LeaveType.code == key,
        ).first()
        if existing is None:
            db.add(LeaveType(
                organization_id=org_id, company_id=None, name=name, code=key,
                days_allowed=days, is_paid=True, is_encashable=encashable,
                status="active",
            ))
            created.append(name)
        else:
            existing.days_allowed = days
            existing.is_encashable = encashable
            updated.append(name)
        body_rows.append({
            "code": key, "name": name, "days": days, "paid": True,
            "encashable": encashable, "active": True,
        })
    if created:
        applied.append(f"Leave types created: {', '.join(created)}")
    if updated:
        applied.append(f"Leave quotas updated: {', '.join(updated)}")

    method = str(a.get("accrual_method") or "frontloaded")
    carry_expiry = str(a.get("carry_forward_expiry") or "year_end")
    max_cap = int(float(a.get("max_balance_cap") or 0))
    carry_max = int(float(a.get("carry_forward_max_days") or 0))
    tpl_fields = {
        "name": "Standard Leave Policy",
        "status": "active",
        "accrual_method": method,
        "accrual_day": int(float(a.get("accrual_day", 1) or 1)),
        "probation_accrual_rate": float(a.get("probation_accrual_rate", 0.5)),
        "max_balance_cap": max_cap if max_cap > 0 else None,
        "lapse_unused": bool(a.get("lapse_unused", False)),
        "carry_forward_enabled": bool(a.get("carry_forward_enabled", False)),
        "carry_forward_max_days": carry_max if carry_max > 0 else None,
        "carry_forward_expiry": carry_expiry,
        "carry_forward_use_it_or_lose_it": bool(a.get("carry_forward_use_it_or_lose_it", False)),
        "encashment_enabled": bool(a.get("encashment_enabled", False)),
        "encashment_min_balance": int(float(a.get("encashment_min_balance") or 0)),
        "encashment_rate": float(a.get("encashment_rate", 1) or 1),
        "encashment_taxable": bool(a.get("encashment_taxable", False)),
        "enable_half_day": bool(a.get("enable_half_day", True)),
        "min_leave_for_half_day": int(float(a.get("min_leave_for_half_day", 1) or 1)),
        "advance_notice_days": int(float(a.get("advance_notice_days", 1) or 1)),
        "max_consecutive_days": int(float(a.get("max_consecutive_days") or 0)),
        "holiday_optional_limit": int(float(a.get("holiday_optional_limit") or 0)),
        "effective_from": datetime.utcnow().date(),
        "body": {"leaveTypes": body_rows},
    }
    q = db.query(LeaveTemplate).filter(
        LeaveTemplate.organization_id == org_id,
        LeaveTemplate.deleted_at.is_(None),
        LeaveTemplate.status == "active",
    )
    q = _scope_q(q, LeaveTemplate, cid)
    tpl = q.first()
    if tpl is None:
        db.add(LeaveTemplate(organization_id=org_id, company_id=cid, **tpl_fields))
    else:
        for k, v in tpl_fields.items():
            setattr(tpl, k, v)
    applied.append(
        f"Leave policy template ({method} accrual"
        f"{', carry-forward' if tpl_fields['carry_forward_enabled'] else ''}"
        f"{', encashment' if tpl_fields['encashment_enabled'] else ''})"
    )
    settings = dict(getattr(org, "settings", None) or {})
    leave_cfg = dict(settings.get("leave") or {})
    leave_cfg.update({
        "annualLeave": int(float(a.get("earned_days", 15) or 15)),
        "sickLeave": int(float(a.get("sick_days", 7) or 7)),
        "personalLeave": int(float(a.get("casual_days", 7) or 7)),
        "carryForward": tpl_fields["carry_forward_enabled"],
        "maxCarryForwardDays": carry_max,
        "enableHalfDay": tpl_fields["enable_half_day"],
        "enableMultiLevelApproval": int(float(a.get("approval_levels", 1) or 1)) > 1,
        "approvalLevels": int(float(a.get("approval_levels", 1) or 1)),
    })
    settings["leave"] = leave_cfg
    org.settings = settings
    return applied


def _apply_payroll(db: Session, org: Organization, a: Dict[str, Any], cid: Optional[int]) -> List[str]:
    org_id = org.id
    applied: List[str] = []
    freq = str(a.get("pay_frequency") or "monthly")
    div_choice = str(a.get("daily_divisor") or ("26" if freq in ("daily", "mixed") else "30"))
    divisor = 26.0 if div_choice == "26" else 30.0  # "working" keeps 30 in policy; proration rule handles actuals
    pol_fields = {
        "name": "Default Payroll Policy",
        "status": "active",
        "pro_ration_method": str(a.get("pro_ration_method") or "paid_days"),
        "rounding_method": str(a.get("rounding_method") or "nearest"),
        "decimal_places": int(float(a.get("decimal_places", 2) or 2)),
        "round_net_salary": True,
        "default_currency": getattr(org, "default_currency", None) or "INR",
        "daily_rate_divisor": divisor,
        "fy_start_month": 4 if str(a.get("fy_start") or "april") == "april" else 1,
        "include_gratuity": bool(a.get("gratuity_applicable", True)),
        "gratuity_rate": float(a.get("gratuity_rate", 4.81)),
    }
    q = db.query(PayrollPolicy).filter(PayrollPolicy.organization_id == org_id, PayrollPolicy.status == "active")
    q = _scope_q(q, PayrollPolicy, cid)
    policy = q.first()
    if policy is None:
        db.add(PayrollPolicy(organization_id=org_id, company_id=cid, **pol_fields))
    else:
        for k, v in pol_fields.items():
            setattr(policy, k, v)
    applied.append(
        f"Payroll policy ({int(divisor)}-day month, {pol_fields['rounding_method']} rounding, "
        f"prorate by {pol_fields['pro_ration_method']})"
    )

    # Merge benefits + TDS knobs into StatutorySetting
    stat_q = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == org_id, StatutorySetting.status == "active")
    stat_q = _scope_q(stat_q, StatutorySetting, cid)
    setting = stat_q.first()
    benefit_fields = {
        "gratuity_eligible_years": float(a.get("gratuity_eligible_years", 5.0)),
        "gratuity_days_per_year": float(a.get("gratuity_days_per_year", 15.0)),
        "gratuity_rate": float(a.get("gratuity_rate", 4.81)),
        "gratuity_tax_exempt_ceiling": float(a.get("gratuity_tax_exempt_ceiling", 2000000.0)),
        "bonus_min_rate": float(a.get("bonus_min_rate", 8.33)),
        "bonus_max_rate": float(a.get("bonus_max_rate", 20.0)),
        "bonus_eligible_ceiling": float(a.get("bonus_eligible_ceiling", 21000.0)),
        "bonus_wage_ceiling": float(a.get("bonus_wage_ceiling", 7000.0)),
        "gratuity_applicable": bool(a.get("gratuity_applicable", True)),
        "bonus_applicable": bool(a.get("bonus_applicable", False)),
    }
    if setting is None:
        setting = StatutorySetting(organization_id=org_id, company_id=cid, status="active", **benefit_fields)
        db.add(setting)
    else:
        for k, v in benefit_fields.items():
            setattr(setting, k, v)
    applied.append("Gratuity & bonus benefit parameters")

    # TDS regime knobs
    reg_q = db.query(TaxRegime).filter(
        TaxRegime.organization_id == org_id, TaxRegime.is_active.is_(True))
    reg_q = _scope_q(reg_q, TaxRegime, cid)
    regime = reg_q.first()
    if regime is not None:
        regime.standard_deduction = float(a.get("std_deduction", 75000.0))
        regime.rebate_threshold = float(a.get("rebate_threshold", 700000.0))
        regime.cess_rate = float(a.get("cess_rate", 4.0))
    else:
        year = datetime.utcnow().year
        regime = TaxRegime(
            organization_id=org_id, company_id=cid, name="New Regime (Standard)",
            regime_type="new", is_active=True, is_default=True,
            financial_year=f"{year}-{str((year + 1) % 100).zfill(2)}",
            standard_deduction=float(a.get("std_deduction", 75000.0)),
            rebate_threshold=float(a.get("rebate_threshold", 700000.0)),
            cess_rate=float(a.get("cess_rate", 4.0)),
        )
        db.add(regime)
        db.flush()
        for i, (lo, hi, rate) in enumerate((
            (0.0, 400000.0, 0.0), (400000.0, 800000.0, 5.0),
            (800000.0, 1200000.0, 10.0), (1200000.0, 1600000.0, 15.0),
            (1600000.0, 2000000.0, 20.0), (2000000.0, 2400000.0, 25.0),
            (2400000.0, None, 30.0),
        )):
            db.add(TaxSlab(tax_regime_id=regime.id, from_amount=lo, to_amount=hi,
                           rate=rate, sort_order=i))
    applied.append("TDS configuration")

    settings = dict(getattr(org, "settings", None) or {})
    payroll_cfg = dict(settings.get("payroll") or {})
    payroll_cfg.update({
        "payrollFrequency": freq,
        "payrollDay": int(float(a.get("payroll_day", 1) or 1)),
        "enablePf": bool(a.get("pf_applicable", True)),
        "pfPercentage": float(a.get("pf_employee_rate", 12.0)),
        "enableEsi": bool(a.get("esi_applicable", True)),
        "esiPercentage": float(a.get("esi_employee_rate", 0.75)),
        "enableTaxDeduction": bool(a.get("tds_enabled", True)),
        "currency": getattr(org, "default_currency", None) or "INR",
    })
    settings["payroll"] = payroll_cfg
    org.settings = settings
    return applied


def _apply_expenses(db: Session, org: Organization, a: Dict[str, Any], cid: Optional[int]) -> List[str]:
    applied: List[str] = []
    selected = a.get("categories") or []
    cat = db.query(LookupCategory).filter(
        LookupCategory.code == "EXPENSE_CATEGORY",
        LookupCategory.deleted_at.is_(None),
    ).first()
    if cat is None:
        cat = LookupCategory(
            code="EXPENSE_CATEGORY", name="Expense Category",
            description="Categories employees pick when filing expense claims",
            page_group="expense", is_active=True, is_system=True,
        )
        db.add(cat)
        db.flush()
    existing = {
        (v.code or "").lower()
        for v in db.query(LookupValue).filter(
            LookupValue.category_id == cat.id,
            LookupValue.deleted_at.is_(None),
        ).all()
    }
    created = []
    for key in selected:
        if key in existing:
            continue
        db.add(LookupValue(
            category_id=cat.id, code=key, name=key.replace("_", " ").title(),
            is_active=True, sort_order=len(created),
        ))
        created.append(key)
    if created:
        applied.append(f"Expense categories added: {', '.join(c.replace('_', ' ').title() for c in created)}")
    elif selected:
        applied.append("Expense categories already in place")
    settings = dict(getattr(org, "settings", None) or {})
    settings["expense"] = {
        **(settings.get("expense") or {}),
        "requireReceipt": bool(a.get("require_receipt", True)),
        "dualApproval": bool(a.get("dual_approval", False)),
        "categories": list(selected),
    }
    org.settings = settings
    applied.append(
        f"Expense workflow (receipt {'required' if a.get('require_receipt', True) else 'optional'}, "
        f"{'dual' if a.get('dual_approval', False) else 'single'} approval)"
    )
    return applied


def _apply_performance(db: Session, org: Organization, a: Dict[str, Any], cid: Optional[int]) -> List[str]:
    settings = dict(getattr(org, "settings", None) or {})
    settings["performance"] = {
        **(settings.get("performance") or {}),
        "reviewCycle": str(a.get("cycle") or "quarterly"),
        "enableSelfReview": bool(a.get("enable_self_review", True)),
        "enable360Feedback": bool(a.get("enable_360_feedback", False)),
        "enableGoalTracking": bool(a.get("enable_goal_tracking", True)),
    }
    org.settings = settings
    return [
        f"Review cycle ({settings['performance']['reviewCycle']})",
        "Review workflow features",
    ]


_MODULE_APPLIERS = {
    "company": _apply_company,
    "attendance": _apply_attendance,
    "leave": _apply_leave,
    "payroll": _apply_payroll,
    "expenses": _apply_expenses,
    "performance": _apply_performance,
}


# ══════════════════════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════════════════════

@router.get("/api/setup/status")
def setup_status(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require(current_user)
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    return compute_setup_status(db, org_id, company_id=companyId)


@router.get("/api/setup/modules")
def setup_modules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The comprehensive module interview — real configuration fields per module."""
    _require(current_user)
    return {"modules": MODULES}


@router.get("/api/setup/questions")
def setup_questions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Back-compat alias — the module set is the interview now."""
    _require(current_user)
    return {"questions": MODULES}


@router.post("/api/setup/modules/{module_id}")
def apply_module(
    module_id: str,
    payload: ModuleAnswers,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply one module's answers — upserts, company-scoped, idempotent."""
    _require(current_user)
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    module = next((m for m in MODULES if m["id"] == module_id), None)
    if module is None:
        raise HTTPException(status_code=404, detail=f"Unknown setup module: {module_id}")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    _get_org_company(db, org_id, payload.companyId)

    answers = _merged_answers(module, payload.answers or {})
    applier = _MODULE_APPLIERS.get(module_id)
    try:
        applied = applier(db, org, answers, payload.companyId) if applier else []
        db.commit()

        settings = dict(getattr(org, "settings", None) or {})
        raw_guided = settings.get("setup")
        guided = dict(raw_guided) if isinstance(raw_guided, dict) else {}
        scope_key = f"company_{payload.companyId}" if payload.companyId is not None else "org"
        scope_entry = guided.get(scope_key)
        if not isinstance(scope_entry, dict):
            scope_entry = {}
        scope_entry[module_id] = {
            "appliedAt": datetime.utcnow().isoformat(),
            "answers": answers,
        }
        scope_entry["guidedConfigured"] = True
        guided[scope_key] = scope_entry
        settings["setup"] = guided
        org.settings = settings
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Setup module '{module_id}' failed: {exc}")

    return {
        "module": module_id,
        "applied": applied,
        "companyId": payload.companyId,
        "status": compute_setup_status(db, org_id, company_id=payload.companyId),
    }


@router.post("/api/setup/concierge")
def setup_concierge_legacy(
    answers: ModuleAnswers,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Legacy all-in-one apply — runs every module with defaults + overrides."""
    _require(current_user)
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    _get_org_company(db, org_id, answers.companyId)
    all_applied: List[str] = []
    for module in MODULES:
        merged = _merged_answers(module, answers.answers or {})
        applier = _MODULE_APPLIERS.get(module["id"])
        if applier:
            all_applied.extend(applier(db, org, merged, answers.companyId))
    db.commit()
    return {
        "applied": all_applied,
        "skipped": [],
        "companyId": answers.companyId,
        "status": compute_setup_status(db, org_id, company_id=answers.companyId),
    }
