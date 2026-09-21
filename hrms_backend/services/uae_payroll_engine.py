"""
UAE Payroll Calculation Engine
==============================
Enterprise-grade payroll engine for UAE Labour Law compliance.

Covers:
  - No personal income tax (UAE has no income tax)
  - EOSB (End of Service Benefit) per UAE Labour Law Article 51
  - WPS (Wage Protection System) SIF file generation
  - Overtime per Article 58 (125% normal, 150% night shift 10pm-4am)
  - Annual Leave per Article 76 (30 calendar days after 1 year)
  - Sick Leave per Article 31 (90 days: 15 full, 30 half, 45 unpaid)
  - Working Hours per Article 65 (8 hrs/day, 48 hrs/week)
  - Air Ticket benefit per Article 132
  - End-of-Service Settlement (final settlement with unused leave, EOSB)
  - Multi-currency support (AED, USD, EUR, GBP, INR)

All amounts are in AED by default. Exchange rate conversion is provided
for payslip display in foreign currencies.

Country-specific statutory rules are seed-loaded as JSON-based definitions
compatible with the existing StatutoryRuleEngine.

Key Rates (2024-2026):
  - Minimum wage: AED 5,000/month (effective Feb 2025)
  - EOSB: 21 days/year (1-5 yrs), 30 days/year (5+ yrs)
  - Overtime: 125% normal wage, night shift 150%
  - Annual leave: 30 calendar days
  - Sick leave: 90 days (15 full, 30 half, 45 unpaid)

Usage:
    engine = UAEPayrollEngine(db)
    result = engine.calculate_payroll(employee, year=2026, month=3)
    eosb = engine.calculate_eosb(employee, as_of=date(2026, 3, 31))
    sif = engine.generate_wps_file(payroll_records, pay_date=date(2026, 3, 31))
"""

from __future__ import annotations

import csv
import io
import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ── Constants ──

UAE_DEFAULT_CURRENCY = "AED"
UAE_MIN_WAGE_AED = 5000.0
UAE_WORKING_HOURS_PER_DAY = 8
UAE_WORKING_DAYS_PER_WEEK = 6
UAE_MAX_WEEKLY_HOURS = 48
UAE_ANNUAL_LEAVE_DAYS = 30
UAE_SICK_LEAVE_TOTAL_DAYS = 90
UAE_SICK_LEAVE_FULL_PAY_DAYS = 15
UAE_SICK_LEAVE_HALF_PAY_DAYS = 30
UAE_OVERTIME_NORMAL_MULTIPLIER = 1.25
UAE_OVERTIME_NIGHT_MULTIPLIER = 1.50
UAE_NIGHT_SHIFT_START_HOUR = 22
UAE_NIGHT_SHIFT_END_HOUR = 4
UAE_EOSB_CAP_MONTHS = 24

# Exchange rates (approximate, for payslip conversion — not for statutory use)
EXCHANGE_RATES_TO_AED: Dict[str, float] = {
    "AED": 1.0,
    "USD": 3.6725,
    "EUR": 3.9820,
    "GBP": 4.6520,
    "INR": 0.0443,
}


def _exchange_rate_from_aed(currency: str) -> float:
    """Return the rate to convert 1 AED into the target currency."""
    c = currency.upper()
    if c == "AED":
        return 1.0
    rate_to_aed = EXCHANGE_RATES_TO_AED.get(c)
    if rate_to_aed and rate_to_aed > 0:
        return 1.0 / rate_to_aed
    return 1.0


def _round_aed(value: float, method: str = "nearest") -> float:
    """Round AED amounts — UAE convention is 2 decimal places."""
    if method == "floor":
        return math.floor(value * 100) / 100
    if method == "ceil":
        return math.ceil(value * 100) / 100
    return round(value, 2)


def _days_in_month(year: int, month: int) -> int:
    import calendar
    return calendar.monthrange(year, month)[1]


def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    return numerator / denominator if denominator > 0 else default


# ── UAE Statutory Rule Definitions (Seed Data) ──

UAE_STATUTORY_RULE_SEEDS: List[Dict[str, Any]] = [
    {
        "rule_type": "eosb",
        "country": "UAE",
        "state_code": None,
        "effective_from": "2024-01-01",
        "effective_to": None,
        "definition": {
            "description": "End of Service Benefit per UAE Labour Law Article 51",
            "less_than_1_year_days": 0,
            "1_to_5_years_days_per_year": 21,
            "above_5_years_days_per_year": 30,
            "first_5_years_days": 21,
            "cap_months": 24,
            "basic_salary_only": True,
            "working_days_per_month": 26,
        },
    },
    {
        "rule_type": "overtime",
        "country": "UAE",
        "state_code": None,
        "effective_from": "2024-01-01",
        "effective_to": None,
        "definition": {
            "description": "Overtime per UAE Labour Law Article 58",
            "normal_multiplier": 1.25,
            "night_multiplier": 1.50,
            "night_start_hour": 22,
            "night_end_hour": 4,
            "max_daily_hours": 8,
            "max_weekly_hours": 48,
        },
    },
    {
        "rule_type": "annual_leave",
        "country": "UAE",
        "state_code": None,
        "effective_from": "2024-01-01",
        "effective_to": None,
        "definition": {
            "description": "Annual Leave per UAE Labour Law Article 76",
            "min_service_months": 12,
            "leave_days_per_year": 30,
            "leave_type": "calendar_days",
            "carry_forward_allowed": True,
            "max_carry_forward_days": 0,
        },
    },
    {
        "rule_type": "sick_leave",
        "country": "UAE",
        "state_code": None,
        "effective_from": "2024-01-01",
        "effective_to": None,
        "definition": {
            "description": "Sick Leave per UAE Labour Law Article 31",
            "total_days": 90,
            "full_pay_days": 15,
            "half_pay_days": 30,
            "unpaid_days": 45,
            "min_service_days": 90,
        },
    },
    {
        "rule_type": "working_hours",
        "country": "UAE",
        "state_code": None,
        "effective_from": "2024-01-01",
        "effective_to": None,
        "definition": {
            "description": "Working Hours per UAE Labour Law Article 65",
            "max_daily_hours": 8,
            "max_weekly_hours": 48,
            "rest_period_hours": 1,
            "friday_holiday": True,
        },
    },
    {
        "rule_type": "minimum_wage",
        "country": "UAE",
        "state_code": None,
        "effective_from": "2025-02-01",
        "effective_to": None,
        "definition": {
            "description": "UAE Minimum Wage (effective Feb 2025)",
            "minimum_monthly_aed": 5000.0,
        },
    },
    {
        "rule_type": "air_ticket",
        "country": "UAE",
        "state_code": None,
        "effective_from": "2024-01-01",
        "effective_to": None,
        "definition": {
            "description": "Annual Return Ticket per UAE Labour Law Article 132",
            "employer_provided": True,
            "frequency": "annual",
            "ticket_class": "economy",
        },
    },
]


# ── Data Classes ──

@dataclass
class PayrollBreakdown:
    """Complete payroll calculation result for one employee, one month."""
    employee_id: int
    year: int
    month: int
    currency: str = UAE_DEFAULT_CURRENCY

    # Attendance
    days_in_month: int = 0
    working_days: int = 0
    paid_days: float = 0.0
    absent_days: float = 0.0
    leave_days: float = 0.0
    overtime_hours: float = 0.0

    # Earnings (AED)
    basic_salary: float = 0.0
    housing_allowance: float = 0.0
    transport_allowance: float = 0.0
    other_allowances: float = 0.0
    overtime_pay: float = 0.0
    bonus: float = 0.0
    air_ticket_provision: float = 0.0
    leave_encashment: float = 0.0
    gross_salary: float = 0.0

    # Deductions (AED)
    loan_deduction: float = 0.0
    advance_deduction: float = 0.0
    other_deductions: float = 0.0
    total_deductions: float = 0.0

    # Net
    net_salary: float = 0.0

    # Statutory provisions (employer side, not deducted from employee)
    eosb_provision: float = 0.0
    eosb_monthly_accrual: float = 0.0

    # Converted amounts (for payslip in foreign currency)
    gross_salary_converted: float = 0.0
    net_salary_converted: float = 0.0
    conversion_rate: float = 1.0

    # Metadata
    pro_ration_factor: float = 1.0
    calculated_at: Optional[str] = None
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}


@dataclass
class EOSBResult:
    """End of Service Benefit calculation result."""
    employee_id: int
    join_date: Optional[str] = None
    exit_date: Optional[str] = None
    total_service_years: float = 0.0
    total_service_days: int = 0

    # Salary components used
    last_basic_monthly: float = 0.0
    last_basic_daily: float = 0.0
    total_salary_paid: float = 0.0

    # EOSB breakdown
    eosb_amount: float = 0.0
    eosb_before_5_years: float = 0.0
    eosb_after_5_years: float = 0.0
    eosb_cap_applied: bool = False
    eosb_cap_amount: float = 0.0

    # Unused leave
    unused_leave_days: float = 0.0
    unused_leave_encashment: float = 0.0

    # Final settlement
    final_settlement: float = 0.0
    outstanding_salary: float = 0.0
    air_ticket_balance: float = 0.0

    # Converted
    currency: str = UAE_DEFAULT_CURRENCY
    conversion_rate: float = 1.0
    final_settlement_converted: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}


@dataclass
class WPSRecord:
    """Single employee record for WPS SIF file generation."""
    employee_id: str
    employee_name: str
    basic_salary: float
    total_allowances: float
    total_deductions: float
    net_pay: float
    bank_name: str
    bank_account: str
    iban: str
    employee_number: str = ""
    nationality: str = ""
    designation: str = ""
    gender: str = ""


# ── Main Engine ──

class UAEPayrollEngine:
    """UAE Payroll Calculation Engine.

    Integrates with the existing StatutoryRuleEngine for rule resolution
    and provides UAE-specific payroll logic.
    """

    def __init__(self, db: Session):
        self.db = db
        self._rule_cache: Dict[str, Any] = {}

    # ── Rule Resolution ──

    def _resolve_rule(self, rule_type: str, as_of: date) -> Optional[Dict]:
        """Resolve a UAE statutory rule, trying DB first then seed data."""
        from services.statutory_rule_engine import StatutoryRuleEngine
        engine = StatutoryRuleEngine(self.db)
        rule = engine.resolve(rule_type, as_of, country="UAE")
        if rule:
            return rule

        # Fallback to seed data
        for seed in UAE_STATUTORY_RULE_SEEDS:
            if seed["rule_type"] != rule_type:
                continue
            eff_from = date.fromisoformat(seed["effective_from"])
            eff_to = date.fromisoformat(seed["effective_to"]) if seed.get("effective_to") else None
            if eff_from <= as_of and (eff_to is None or eff_to >= as_of):
                return seed["definition"]
        return None

    # ── EOSB (End of Service Benefit) ──

    def calculate_eosb(
        self,
        employee,
        as_of: date,
        exit_date: Optional[date] = None,
    ) -> EOSBResult:
        """Calculate EOSB per UAE Labour Law Article 51.

        Rules:
          - Less than 1 year: no EOSB
          - 1 to 5 years: 21 days basic salary per year
          - More than 5 years: 30 days per year (first 5 years at 21 days)
          - Maximum cap: 2 years' total salary
        """
        result = EOSBResult(employee_id=employee.id)

        join_date = getattr(employee, "join_date", None)
        if isinstance(join_date, str):
            join_date = date.fromisoformat(join_date)
        if not join_date:
            result.warnings = ["No join date found"]
            return result

        result.join_date = str(join_date)

        exit_dt = exit_date
        if not exit_dt:
            lev = getattr(employee, "date_of_leaving", None) or getattr(employee, "termination_date", None)
            if lev:
                exit_dt = lev.date() if hasattr(lev, "date") else date.fromisoformat(str(lev)[:10])
        if not exit_dt:
            exit_dt = as_of
        result.exit_date = str(exit_dt)

        total_days = (exit_dt - join_date).days
        if total_days < 0:
            result.warnings = ["Exit date before join date"]
            return result

        result.total_service_days = total_days
        result.total_service_years = round(total_days / 365.25, 2)

        # Must have at least 1 year of service for EOSB eligibility
        if total_days < 365:
            result.eosb_amount = 0.0
            return result

        # Determine daily basic salary
        monthly_basic = float(
            getattr(employee, "base_salary", 0)
            or getattr(employee, "basic_salary", 0)
            or 0
        )
        # If base_salary is annual, convert to monthly
        pay_freq = str(getattr(employee, "pay_frequency", "annual") or "annual").lower()
        if pay_freq == "annual":
            monthly_basic = monthly_basic / 12.0
        elif pay_freq == "weekly":
            monthly_basic = monthly_basic * 52.0 / 12.0
        elif pay_freq == "daily":
            monthly_basic = monthly_basic * 30.0

        result.last_basic_monthly = round(monthly_basic, 2)
        daily_basic = _safe_div(monthly_basic, 26.0)
        result.last_basic_daily = round(daily_basic, 2)

        rule = self._resolve_rule("eosb", as_of)
        first_5_days = float(rule.get("first_5_years_days", 21)) if rule else 21
        after_5_days = float(rule.get("above_5_years_days_per_year", 30)) if rule else 30
        cap_months = int(rule.get("cap_months", 24)) if rule else 24

        years = total_days / 365.25
        full_years = int(years)

        # Calculate EOSB: first 5 years at 21 days, remainder at 30 days
        if full_years <= 5:
            eosb_days = full_years * first_5_days
        else:
            eosb_days = (5 * first_5_days) + ((full_years - 5) * after_5_days)

        # Pro-rate for partial year beyond full years
        fractional = years - full_years
        if fractional > 0:
            days_in_partial = fractional * 365.25
            if full_years < 5:
                partial_days = _safe_div(days_in_partial, 365.25) * first_5_days
            else:
                partial_days = _safe_div(days_in_partial, 365.25) * after_5_days
            eosb_days += partial_days

        eosb_amount = round(eosb_days * daily_basic, 2)

        # Track component amounts
        if full_years <= 5:
            result.eosb_before_5_years = eosb_amount
        else:
            result.eosb_before_5_years = round(5 * first_5_days * daily_basic, 2)
            result.eosb_after_5_years = round(eosb_amount - result.eosb_before_5_years, 2)

        # Apply cap: maximum 2 years' total salary
        total_salary_cap = monthly_basic * cap_months
        if eosb_amount > total_salary_cap:
            result.eosb_cap_applied = True
            result.eosb_cap_amount = round(total_salary_cap, 2)
            eosb_amount = total_salary_cap

        result.eosb_amount = round(eosb_amount, 2)
        return result

    # ── Overtime Calculation ──

    def calculate_overtime(
        self,
        employee,
        year: int,
        month: int,
        overtime_hours: float = 0.0,
        overtime_entries: Optional[List[Dict]] = None,
    ) -> Dict[str, float]:
        """Calculate overtime pay per UAE Labour Law Article 58.

        - Normal overtime: 125% of normal hourly wage
        - Night shift (10pm-4am): 150% of normal hourly wage

        Args:
            employee: Employee ORM object.
            year, month: Payroll period.
            overtime_hours: Total overtime hours (used if no entries provided).
            overtime_entries: List of dicts with 'hours' and optionally
                             'is_night_shift' (bool) or 'start_time'/'end_time'.

        Returns:
            Dict with normal_overtime_pay, night_overtime_pay, total_overtime_pay.
        """
        monthly_basic = float(
            getattr(employee, "base_salary", 0)
            or getattr(employee, "basic_salary", 0)
            or 0
        )
        pay_freq = str(getattr(employee, "pay_frequency", "annual") or "annual").lower()
        if pay_freq == "annual":
            monthly_basic = monthly_basic / 12.0

        working_days = _days_in_month(year, month)
        daily_rate = _safe_div(monthly_basic, 26.0)
        hourly_rate = _safe_div(daily_rate, UAE_WORKING_HOURS_PER_DAY)

        rule = self._resolve_rule("overtime", date(year, month, 1))
        normal_mult = float(rule.get("normal_multiplier", 1.25)) if rule else 1.25
        night_mult = float(rule.get("night_multiplier", 1.50)) if rule else 1.50

        normal_hours = 0.0
        night_hours = 0.0

        if overtime_entries:
            for entry in overtime_entries:
                hrs = float(entry.get("hours", 0))
                is_night = entry.get("is_night_shift", False)
                if not is_night and entry.get("start_time") and entry.get("end_time"):
                    is_night = self._is_night_shift(entry["start_time"], entry["end_time"])
                if is_night:
                    night_hours += hrs
                else:
                    normal_hours += hrs
        else:
            normal_hours = overtime_hours

        normal_pay = round(normal_hours * hourly_rate * normal_mult, 2)
        night_pay = round(night_hours * hourly_rate * night_mult, 2)

        return {
            "normal_overtime_hours": round(normal_hours, 2),
            "night_overtime_hours": round(night_hours, 2),
            "normal_overtime_pay": normal_pay,
            "night_overtime_pay": night_pay,
            "total_overtime_pay": round(normal_pay + night_pay, 2),
            "hourly_rate": round(hourly_rate, 2),
            "normal_multiplier": normal_mult,
            "night_multiplier": night_mult,
        }

    def _is_night_shift(self, start_time: str, end_time: str) -> bool:
        """Check if a time range falls within night shift hours (10pm-4am)."""
        try:
            def parse_time(t: str) -> Tuple[int, int]:
                parts = str(t).replace(":", ".").split(".")
                return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0

            s_h, s_m = parse_time(start_time)
            e_h, e_m = parse_time(end_time)

            # Night: 22:00 - 04:00
            start_is_night = s_h >= 22 or s_h < 4
            end_is_night = e_h >= 22 or e_h < 4
            return start_is_night or end_is_night
        except Exception:
            return False

    # ── Sick Leave Calculation ──

    def calculate_sick_leave(
        self,
        employee,
        year: int,
        month: int,
        sick_leave_days: float = 0.0,
    ) -> Dict[str, float]:
        """Calculate sick leave pay per UAE Labour Law Article 31.

        Structure:
          - First 15 days: full pay
          - Next 30 days: half pay
          - Remaining 45 days: unpaid

        Returns dict with full_pay_days, half_pay_days, unpaid_days, sick_leave_pay.
        """
        rule = self._resolve_rule("sick_leave", date(year, month, 1))
        full_pay_limit = float(rule.get("full_pay_days", 15)) if rule else 15
        half_pay_limit = float(rule.get("half_pay_days", 30)) if rule else 30

        # Cap to annual total
        sick_leave_days = min(sick_leave_days, full_pay_limit + half_pay_limit + (rule.get("unpaid_days", 45) if rule else 45))

        full_pay_days = min(sick_leave_days, full_pay_limit)
        remaining = max(0, sick_leave_days - full_pay_limit)
        half_pay_days = min(remaining, half_pay_limit)
        unpaid_days = max(0, remaining - half_pay_limit)

        monthly_basic = float(
            getattr(employee, "base_salary", 0)
            or getattr(employee, "basic_salary", 0)
            or 0
        )
        pay_freq = str(getattr(employee, "pay_frequency", "annual") or "annual").lower()
        if pay_freq == "annual":
            monthly_basic = monthly_basic / 12.0

        daily_rate = _safe_div(monthly_basic, 26.0)
        full_pay_amount = round(full_pay_days * daily_rate, 2)
        half_pay_amount = round(half_pay_days * daily_rate * 0.5, 2)

        return {
            "full_pay_days": full_pay_days,
            "half_pay_days": half_pay_days,
            "unpaid_days": unpaid_days,
            "sick_leave_pay": round(full_pay_amount + half_pay_amount, 2),
            "daily_rate": round(daily_rate, 2),
        }

    # ── Annual Leave Calculation ──

    def calculate_annual_leave(
        self,
        employee,
        year: int,
        month: int,
        unused_leave_days: float = 0.0,
    ) -> Dict[str, float]:
        """Calculate annual leave encashment per Article 76.

        30 calendar days per year after 1 year of service.
        Unused leave can be encashed on termination.
        """
        rule = self._resolve_rule("annual_leave", date(year, month, 1))
        leave_days_per_year = float(rule.get("leave_days_per_year", 30)) if rule else 30

        monthly_basic = float(
            getattr(employee, "base_salary", 0)
            or getattr(employee, "basic_salary", 0)
            or 0
        )
        pay_freq = str(getattr(employee, "pay_frequency", "annual") or "annual").lower()
        if pay_freq == "annual":
            monthly_basic = monthly_basic / 12.0

        daily_rate = _safe_div(monthly_basic, 30.0)  # Calendar days divisor
        encashment = round(unused_leave_days * daily_rate, 2)

        return {
            "annual_leave_days_entitled": leave_days_per_year,
            "unused_leave_days": unused_leave_days,
            "daily_rate": round(daily_rate, 2),
            "leave_encashment": encashment,
        }

    # ── Main Payroll Calculation ──

    def calculate_payroll(
        self,
        employee,
        year: int,
        month: int,
        *,
        # Overrides
        override_basic: Optional[float] = None,
        override_housing: Optional[float] = None,
        override_transport: Optional[float] = None,
        override_other_allowances: Optional[float] = None,
        override_overtime_hours: Optional[float] = None,
        override_bonus: Optional[float] = None,
        override_loan_deduction: Optional[float] = None,
        override_advance_deduction: Optional[float] = None,
        override_other_deductions: Optional[float] = None,
        # Attendance
        paid_days: Optional[float] = None,
        working_days: Optional[int] = None,
        overtime_hours: float = 0.0,
        overtime_entries: Optional[List[Dict]] = None,
        sick_leave_days: float = 0.0,
        # Currency
        display_currency: Optional[str] = None,
    ) -> PayrollBreakdown:
        """Calculate complete monthly payroll for a UAE employee.

        Args:
            employee: Employee ORM object with salary components.
            year, month: Payroll period.
            display_currency: Convert net/gross to this currency on payslip.

        Returns:
            PayrollBreakdown with all earnings, deductions, and net pay.
        """
        breakdown = PayrollBreakdown(employee_id=employee.id, year=year, month=month)
        breakdown.calculated_at = datetime.utcnow().isoformat()

        dim = _days_in_month(year, month)
        breakdown.days_in_month = dim

        # ── Resolve salary components ──
        salary_components = self._resolve_salary_components(employee, year, month)
        monthly_basic = salary_components.get("basic", 0.0)
        housing = salary_components.get("housing", 0.0)
        transport = salary_components.get("transport", 0.0)
        other_allowances = salary_components.get("other_allowances", 0.0)

        if override_basic is not None:
            monthly_basic = override_basic
        if override_housing is not None:
            housing = override_housing
        if override_transport is not None:
            transport = override_transport
        if override_other_allowances is not None:
            other_allowances = override_other_allowances

        breakdown.basic_salary = round(monthly_basic, 2)
        breakdown.housing_allowance = round(housing, 2)
        breakdown.transport_allowance = round(transport, 2)
        breakdown.other_allowances = round(other_allowances, 2)

        # ── Minimum wage check ──
        rule_min = self._resolve_rule("minimum_wage", date(year, month, 1))
        min_wage = float(rule_min.get("minimum_monthly_aed", 5000)) if rule_min else 5000
        if monthly_basic < min_wage:
            breakdown.warnings.append(
                f"Basic salary AED {monthly_basic:.2f} is below UAE minimum wage AED {min_wage:.2f}"
            )

        # ── Attendance & Pro-ration ──
        if working_days is None:
            working_days = self._calculate_working_days(year, month)
        breakdown.working_days = working_days

        if paid_days is not None:
            breakdown.paid_days = paid_days
            factor = _safe_div(paid_days, working_days, 1.0) if working_days > 0 else 1.0
        else:
            breakdown.paid_days = working_days
            factor = 1.0

        breakdown.pro_ration_factor = round(factor, 4)
        breakdown.overtime_hours = overtime_hours

        # ── Earnings ──
        prorated_basic = round(monthly_basic * factor, 2)
        prorated_housing = round(housing * factor, 2)
        prorated_transport = round(transport * factor, 2)
        prorated_other = round(other_allowances * factor, 2)

        breakdown.basic_salary = prorated_basic
        breakdown.housing_allowance = prorated_housing
        breakdown.transport_allowance = prorated_transport
        breakdown.other_allowances = prorated_other

        # Overtime
        ot_result = self.calculate_overtime(
            employee, year, month, overtime_hours, overtime_entries
        )
        breakdown.overtime_pay = ot_result["total_overtime_pay"]

        # Bonus (if applicable)
        if override_bonus is not None:
            breakdown.bonus = override_bonus
        else:
            breakdown.bonus = self._calculate_monthly_bonus(employee, monthly_basic, year, month)

        # Air ticket provision (monthly accrual)
        breakdown.air_ticket_provision = self._calculate_air_ticket_provision(
            employee, year, month
        )

        # Leave encashment
        breakdown.leave_encashment = 0.0

        # Gross salary
        breakdown.gross_salary = round(
            breakdown.basic_salary
            + breakdown.housing_allowance
            + breakdown.transport_allowance
            + breakdown.other_allowances
            + breakdown.overtime_pay
            + breakdown.bonus
            + breakdown.air_ticket_provision
            + breakdown.leave_encashment,
            2,
        )

        # ── Deductions ──
        breakdown.loan_deduction = override_loan_deduction if override_loan_deduction is not None else self._calculate_loan_deduction(employee, year, month)
        breakdown.advance_deduction = override_advance_deduction if override_advance_deduction is not None else 0.0
        breakdown.other_deductions = override_other_deductions if override_other_deductions is not None else 0.0

        breakdown.total_deductions = round(
            breakdown.loan_deduction
            + breakdown.advance_deduction
            + breakdown.other_deductions,
            2,
        )

        # ── Net Salary ──
        breakdown.net_salary = round(
            breakdown.gross_salary - breakdown.total_deductions, 2
        )

        # No negative net salary (UAE convention)
        if breakdown.net_salary < 0:
            breakdown.warnings.append(
                f"Net salary is negative (AED {breakdown.net_salary:.2f}). Clamping to 0."
            )
            breakdown.net_salary = 0.0

        # ── EOSB Provision (employer accrual, not deducted) ──
        eosb = self.calculate_eosb(employee, date(year, month, 1))
        breakdown.eosb_provision = eosb.eosb_amount
        breakdown.eosb_monthly_accrual = round(
            _safe_div(eosb.eosb_amount, max(1, eosb.total_service_days) * 12 / 365.25), 2
        )

        # ── Currency Conversion ──
        if display_currency and display_currency.upper() != UAE_DEFAULT_CURRENCY:
            rate = _exchange_rate_from_aed(display_currency)
            breakdown.currency = display_currency.upper()
            breakdown.conversion_rate = rate
            breakdown.gross_salary_converted = round(breakdown.gross_salary * rate, 2)
            breakdown.net_salary_converted = round(breakdown.net_salary * rate, 2)
        else:
            breakdown.currency = UAE_DEFAULT_CURRENCY
            breakdown.conversion_rate = 1.0
            breakdown.gross_salary_converted = breakdown.gross_salary
            breakdown.net_salary_converted = breakdown.net_salary

        return breakdown

    def _resolve_salary_components(
        self, employee, year: int, month: int
    ) -> Dict[str, float]:
        """Resolve the employee's salary components, considering SalaryRevision."""
        from datetime import date as _d

        # Check for SalaryRevision first
        try:
            from models import SalaryRevision
            end_of_month = _d(year, month, _days_in_month(year, month))
            rev = (
                self.db.query(SalaryRevision)
                .filter(
                    SalaryRevision.employee_id == employee.id,
                    SalaryRevision.effective_from <= end_of_month,
                )
                .order_by(SalaryRevision.effective_from.desc(), SalaryRevision.id.desc())
                .first()
            )
            if rev and rev.salary_components:
                comps = dict(rev.salary_components)
                # Convert annual amounts to monthly
                base = float(rev.base_salary or employee.base_salary or 0)
                if base > 0:
                    comps["basic"] = base / 12.0
                return comps
        except Exception:
            pass

        # Fallback to employee's own components
        comps = dict(getattr(employee, "salary_components", {}) or {})
        base = float(getattr(employee, "base_salary", 0) or 0)
        pay_freq = str(getattr(employee, "pay_frequency", "annual") or "annual").lower()

        if pay_freq == "annual":
            monthly = base / 12.0
        elif pay_freq == "weekly":
            monthly = base * 52.0 / 12.0
        elif pay_freq == "daily":
            monthly = base * 30.0
        else:
            monthly = base

        if "basic" not in comps or float(comps.get("basic", 0)) == 0:
            comps["basic"] = monthly
        if "housing" not in comps:
            comps["housing"] = monthly * 0.30
        if "transport" not in comps:
            comps["transport"] = monthly * 0.10

        return comps

    def _calculate_working_days(self, year: int, month: int) -> int:
        """Calculate working days in the month (Sun-Thu for UAE, Fri-Sat weekend)."""
        dim = _days_in_month(year, month)
        working = 0
        for d in range(1, dim + 1):
            dt = date(year, month, d)
            # UAE: Friday (4) and Saturday (5) are weekends
            if dt.weekday() not in (4, 5):
                working += 1
        return working if working > 0 else dim

    def _calculate_monthly_bonus(
        self, employee, monthly_basic: float, year: int, month: int
    ) -> float:
        """Calculate monthly bonus provision (if applicable)."""
        try:
            org_settings = (getattr(employee, "organization", None) and
                            getattr(employee.organization, "settings", None)) or {}
            payroll_cfg = org_settings.get("payroll", {}) or {}
            if not payroll_cfg.get("bonusApplicable", False):
                return 0.0
            bonus_rate = float(payroll_cfg.get("bonusRate", 8.33))
            return round(monthly_basic * bonus_rate / 100, 2)
        except Exception:
            return 0.0

    def _calculate_air_ticket_provision(
        self, employee, year: int, month: int
    ) -> float:
        """Monthly provision for annual return air ticket (Article 132)."""
        rule = self._resolve_rule("air_ticket", date(year, month, 1))
        if not rule or not rule.get("employer_provided", True):
            return 0.0

        # Provision monthly: estimated ticket cost / 12
        # Employer provides annual return ticket — estimated at AED 3,000 (economy)
        estimated_ticket = float(rule.get("estimated_cost_aed", 3000))
        return round(estimated_ticket / 12.0, 2)

    def _calculate_loan_deduction(self, employee, year: int, month: int) -> float:
        """Calculate active loan/advance deductions for the month."""
        try:
            from models import SalaryLoan
            loans = (
                self.db.query(SalaryLoan)
                .filter(
                    SalaryLoan.employee_id == employee.id,
                    SalaryLoan.status == "active",
                    SalaryLoan.remaining_months > 0,
                )
                .all()
            )
            total = 0.0
            for loan in loans:
                emi = float(loan.monthly_deduction or 0)
                principal = float(loan.principal_amount or 0)
                if emi > 0 and principal > 0:
                    remaining = principal * int(loan.remaining_months or 0) / max(1, int(loan.total_months or 1))
                    emi = min(emi, max(0.0, remaining))
                total += emi
            return round(total, 2)
        except Exception:
            return 0.0

    # ── End-of-Service Settlement ──

    def calculate_end_of_service_settlement(
        self,
        employee,
        exit_date: Optional[date] = None,
        display_currency: Optional[str] = None,
    ) -> EOSBResult:
        """Calculate complete end-of-service settlement including:
        1. Outstanding salary (last working month)
        2. EOSB (End of Service Benefit)
        3. Unused leave encashment
        4. Air ticket balance
        """
        as_of = exit_date or date.today()
        eosb = self.calculate_eosb(employee, as_of, exit_date)
        eosb.exit_date = str(as_of)

        # Outstanding salary (pro-rated last month)
        if exit_date:
            dim = _days_in_month(exit_date.year, exit_date.month)
            days_worked = exit_date.day
            monthly_basic = float(
                getattr(employee, "base_salary", 0)
                or getattr(employee, "basic_salary", 0)
                or 0
            )
            pay_freq = str(getattr(employee, "pay_frequency", "annual") or "annual").lower()
            if pay_freq == "annual":
                monthly_basic = monthly_basic / 12.0
            daily = _safe_div(monthly_basic, dim)
            eosb.outstanding_salary = round(daily * days_worked, 2)
        else:
            eosb.outstanding_salary = 0.0

        # Unused leave encashment
        try:
            from models import LeaveBalance
            year = as_of.year
            lb = self.db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == employee.id,
                LeaveBalance.year == year,
                LeaveBalance.deleted_at.is_(None),
            ).first()
            if lb:
                unused = float(lb.remaining_days or 0)
                eosb.unused_leave_days = unused
                daily_rate = _safe_div(eosb.last_basic_monthly, 30.0)
                eosb.unused_leave_encashment = round(unused * daily_rate, 2)
        except Exception:
            pass

        # Air ticket balance
        eosb.air_ticket_balance = 0.0

        # Final settlement
        eosb.final_settlement = round(
            eosb.eosb_amount
            + eosb.unused_leave_encashment
            + eosb.outstanding_salary
            + eosb.air_ticket_balance,
            2,
        )

        # Currency conversion
        if display_currency and display_currency.upper() != UAE_DEFAULT_CURRENCY:
            rate = _exchange_rate_from_aed(display_currency)
            eosb.currency = display_currency.upper()
            eosb.conversion_rate = rate
            eosb.final_settlement_converted = round(eosb.final_settlement * rate, 2)
        else:
            eosb.currency = UAE_DEFAULT_CURRENCY
            eosb.conversion_rate = 1.0
            eosb.final_settlement_converted = eosb.final_settlement

        return eosb

    # ── WPS (Wage Protection System) SIF File Generation ──

    def generate_wps_file(
        self,
        records: List[WPSRecord],
        pay_date: date,
        company_name: str = "",
        company_id: str = "",
    ) -> str:
        """Generate WPS SIF (Salary Information File) in the standard format
        required by UAE Central Bank for the Wage Protection System.

        The SIF format is a fixed-width/text file with:
        - Header record: company info, pay date, total employees, total amount
        - Detail records: per-employee salary info, bank details
        - Footer record: totals

        Returns the SIF file content as a string.
        """
        lines = []
        total_amount = sum(r.net_pay for r in records)

        # Header record (H)
        header = (
            f"H"
            f"{company_id[:10]:<10}"
            f"{company_name[:40]:<40}"
            f"{pay_date.strftime('%d%m%Y')}"
            f"{len(records):06d}"
            f"{int(total_amount * 100):015d}"
            f"{UAE_DEFAULT_CURRENCY}"
            f"{' ':<10}"
            f"{' ':<40}"
        )
        lines.append(header)

        # Detail records (E)
        for rec in records:
            detail = (
                f"E"
                f"{rec.employee_id[:20]:<20}"
                f"{rec.employee_name[:40]:<40}"
                f"{rec.nationality[:3]:<3}"
                f"{rec.employee_number[:20]:<20}"
                f"{int(rec.basic_salary * 100):013d}"
                f"{int(rec.total_allowances * 100):013d}"
                f"{int(rec.total_deductions * 100):013d}"
                f"{int(rec.net_pay * 100):013d}"
                f"{rec.bank_name[:40]:<40}"
                f"{rec.bank_account[:20]:<20}"
                f"{rec.iban[:40]:<40}"
                f"{rec.designation[:30]:<30}"
            )
            lines.append(detail)

        # Footer record (T)
        footer = (
            f"T"
            f"{len(records):06d}"
            f"{int(total_amount * 100):015d}"
            f"{' ':<60}"
        )
        lines.append(footer)

        return "\n".join(lines)

    def generate_wps_csv(
        self,
        records: List[WPSRecord],
        pay_date: date,
    ) -> str:
        """Generate WPS data in CSV format as an alternative to the SIF format."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Employee ID", "Employee Name", "Nationality", "Employee Number",
            "Basic Salary", "Total Allowances", "Total Deductions", "Net Pay",
            "Bank Name", "Bank Account", "IBAN", "Designation", "Pay Date",
        ])
        for rec in records:
            writer.writerow([
                rec.employee_id, rec.employee_name, rec.nationality,
                rec.employee_number, f"{rec.basic_salary:.2f}",
                f"{rec.total_allowances:.2f}", f"{rec.total_deductions:.2f}",
                f"{rec.net_pay:.2f}", rec.bank_name, rec.bank_account,
                rec.iban, rec.designation, pay_date.strftime("%d/%m/%Y"),
            ])
        return output.getvalue()

    # ── Batch Payroll Processing ──

    def calculate_batch_payroll(
        self,
        employees: List[Any],
        year: int,
        month: int,
        display_currency: Optional[str] = None,
    ) -> List[PayrollBreakdown]:
        """Calculate payroll for multiple employees."""
        results = []
        for emp in employees:
            try:
                result = self.calculate_payroll(
                    emp, year, month, display_currency=display_currency
                )
                results.append(result)
            except Exception as e:
                logger.error(f"Payroll calculation failed for employee {emp.id}: {e}")
                breakdown = PayrollBreakdown(
                    employee_id=emp.id, year=year, month=month
                )
                breakdown.warnings.append(f"Calculation error: {str(e)}")
                results.append(breakdown)
        return results

    # ── Payslip Generation ──

    def generate_payslip_data(
        self,
        breakdown: PayrollBreakdown,
        employee,
        display_currency: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate payslip data with multi-currency support."""
        currency = display_currency or breakdown.currency
        rate = _exchange_rate_from_aed(currency) if currency != UAE_DEFAULT_CURRENCY else 1.0

        payslip = {
            "employee_id": breakdown.employee_id,
            "employee_name": f"{getattr(employee, 'first_name', '')} {getattr(employee, 'last_name', '')}".strip(),
            "employee_number": getattr(employee, "employee_id", ""),
            "designation": getattr(employee, "designation", ""),
            "department": getattr(employee, "department_name", ""),
            "period": f"{breakdown.month:02d}/{breakdown.year}",
            "currency": currency,
            "exchange_rate_to_aed": 1.0 / rate if rate > 0 else 1.0,

            "earnings": {
                "basic_salary": {"aed": breakdown.basic_salary, "converted": round(breakdown.basic_salary * rate, 2)},
                "housing_allowance": {"aed": breakdown.housing_allowance, "converted": round(breakdown.housing_allowance * rate, 2)},
                "transport_allowance": {"aed": breakdown.transport_allowance, "converted": round(breakdown.transport_allowance * rate, 2)},
                "other_allowances": {"aed": breakdown.other_allowances, "converted": round(breakdown.other_allowances * rate, 2)},
                "overtime_pay": {"aed": breakdown.overtime_pay, "converted": round(breakdown.overtime_pay * rate, 2)},
                "bonus": {"aed": breakdown.bonus, "converted": round(breakdown.bonus * rate, 2)},
                "air_ticket_provision": {"aed": breakdown.air_ticket_provision, "converted": round(breakdown.air_ticket_provision * rate, 2)},
                "leave_encashment": {"aed": breakdown.leave_encashment, "converted": round(breakdown.leave_encashment * rate, 2)},
            },
            "gross_salary": {"aed": breakdown.gross_salary, "converted": round(breakdown.gross_salary * rate, 2)},

            "deductions": {
                "loan_deduction": {"aed": breakdown.loan_deduction, "converted": round(breakdown.loan_deduction * rate, 2)},
                "advance_deduction": {"aed": breakdown.advance_deduction, "converted": round(breakdown.advance_deduction * rate, 2)},
                "other_deductions": {"aed": breakdown.other_deductions, "converted": round(breakdown.other_deductions * rate, 2)},
            },
            "total_deductions": {"aed": breakdown.total_deductions, "converted": round(breakdown.total_deductions * rate, 2)},

            "net_salary": {"aed": breakdown.net_salary, "converted": round(breakdown.net_salary * rate, 2)},

            "attendance": {
                "days_in_month": breakdown.days_in_month,
                "working_days": breakdown.working_days,
                "paid_days": breakdown.paid_days,
                "overtime_hours": breakdown.overtime_hours,
                "pro_ration_factor": breakdown.pro_ration_factor,
            },

            "statutory": {
                "eosb_provision": breakdown.eosb_provision,
                "eosb_monthly_accrual": breakdown.eosb_monthly_accrual,
                "minimum_wage_aed": UAE_MIN_WAGE_AED,
                "no_income_tax": True,
            },

            "warnings": breakdown.warnings,
        }

        return payslip

    # ── Rule Seed Loader ──

    def seed_uae_statutory_rules(self) -> int:
        """Load UAE statutory rules into the statutory_rules table.

        Returns the number of rules inserted.
        """
        from models import StatutoryRule
        count = 0
        for seed in UAE_STATUTORY_RULE_SEEDS:
            exists = self.db.query(StatutoryRule).filter(
                StatutoryRule.rule_type == seed["rule_type"],
                StatutoryRule.country == "UAE",
                StatutoryRule.effective_from == date.fromisoformat(seed["effective_from"]),
                StatutoryRule.deleted_at.is_(None),
            ).first()
            if not exists:
                rule = StatutoryRule(
                    rule_type=seed["rule_type"],
                    country="UAE",
                    state_code=seed.get("state_code"),
                    effective_from=date.fromisoformat(seed["effective_from"]),
                    effective_to=date.fromisoformat(seed["effective_to"]) if seed.get("effective_to") else None,
                    definition=seed["definition"],
                    status="active",
                )
                self.db.add(rule)
                count += 1
        if count > 0:
            self.db.flush()
        return count
