"""
UK PAYE Payroll Calculation Engine
===================================
Calculates Income Tax (PAYE), National Insurance, Auto-Enrolment Pension,
Student Loan Repayments, Statutory Payments, and generates HMRC RTI submissions
for UK-based employees.

Tax Bands (England/Wales/NI 2024-25):
  - Personal Allowance: £0 - £12,570  → 0%
  - Basic Rate: £12,570 - £50,270     → 20%
  - Higher Rate: £50,270 - £125,140   → 40%
  - Additional Rate: £125,140+         → 45%

Scottish Tax Bands (2024-25):
  - Starter Rate:    £0 - £2,162       → 19%
  - Basic Rate:      £2,162 - £13,118  → 20%
  - Intermediate Rate: £13,118 - £24,000 → 21%
  - Higher Rate:     £24,000 - £43,662 → 42%
  - Advanced Rate:   £43,662 - £75,000 → 45%
  - Top Rate:        £75,000+          → 48%

National Insurance (Class 1, 2024-25):
  Employee: 0% ≤£12,570 | 8% £12,570-£50,270 | 2% >£50,270
  Employer: 0% ≤£9,100  | 13.8% >£9,100

Auto-Enrolment Pension (2024-25):
  Qualifying earnings: £6,240 - £50,270
  Minimum: 3% employer + 5% employee = 8% total

Statutory Payments (2024-25):
  SSP:  £116.75/week (up to 28 weeks)
  SMP:  90% AWE first 6 weeks, then £184.03/week (33 weeks)
  SPP:  £184.03/week (2 weeks)
  SAP:  Same as SMP
  ShPP: £184.03/week
  Redundancy: Weekly pay × years (max £643/week, max 20 years)
"""
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── PAYE Income Tax Bands (England/Wales/NI 2024-25) ──────────────────────

PAYE_BANDS_2024 = [
    (12_570, 0.00),    # Personal Allowance: 0%
    (50_270, 0.20),    # Basic Rate: 20%
    (125_140, 0.40),   # Higher Rate: 40%
    (float("inf"), 0.45),  # Additional Rate: 45%
]

# ── Scottish Tax Bands (2024-25) ──────────────────────────────────────────

SCOTTISH_BANDS_2024 = [
    (2_162, 0.19),     # Starter Rate: 19%
    (13_118, 0.20),    # Basic Rate: 20%
    (24_000, 0.21),    # Intermediate Rate: 21%
    (43_662, 0.42),    # Higher Rate: 42%
    (75_000, 0.45),    # Advanced Rate: 45%
    (float("inf"), 0.48),  # Top Rate: 48%
]

# ── National Insurance (Class 1, 2024-25) ─────────────────────────────────

NI_EMPLOYEE_BANDS = [
    (12_570, 0.00),    # Below primary threshold: 0%
    (50_270, 0.08),    # Main rate: 8%
    (float("inf"), 0.02),  # Upper rate: 2%
]

NI_EMPLOYER_BANDS = [
    (9_100, 0.00),     # Below secondary threshold: 0%
    (float("inf"), 0.138),  # Above secondary threshold: 13.8%
]

# ── Auto-Enrolment Pension (2024-25) ─────────────────────────────────────

PENSION_QUALIFYING_LOWER = 6_240    # Annual lower threshold
PENSION_QUALIFYING_UPPER = 50_270   # Annual upper threshold
PENSION_EMPLOYEE_MIN = 0.05         # 5% minimum employee contribution
PENSION_EMPLOYER_MIN = 0.03         # 3% minimum employer contribution
PENSION_TOTAL_MIN = 0.08            # 8% total minimum

# ── Statutory Payment Rates (2024-25) ────────────────────────────────────

SSP_RATE_WEEKLY = 116.75
SSP_MAX_WEEKS = 28

SMP_RATE_WEEKLY = 184.03
SMP_INITIAL_WEEKS = 6               # First 6 weeks at 90% AWE
SMP_REMAINING_WEEKS = 33            # Then 33 weeks at flat rate

SPP_RATE_WEEKLY = 184.03
SPP_WEEKS = 2

SAP_RATE_WEEKLY = 184.03
SAP_INITIAL_WEEKS = 6
SAP_REMAINING_WEEKS = 33

SHPP_RATE_WEEKLY = 184.03

REDUNDANCY_WEEKLY_MAX = 643.0
REDUNDANCY_MAX_YEARS = 20

# ── Student Loan Thresholds (2024-25) ────────────────────────────────────

STUDENT_LOAN_PLANS = {
    "plan_1": {"threshold": 24_990, "rate": 0.09},
    "plan_2": {"threshold": 27_295, "rate": 0.09},
}

# ── Multi-currency exchange rates (approximate) ───────────────────────────
EXCHANGE_RATES = {
    "GBP": 1.0,
    "USD": 1.27,
    "EUR": 1.17,
    "INR": 108.5,
    "SGD": 1.72,
    "AUD": 1.94,
    "CAD": 1.72,
    "JPY": 188.5,
    "CHF": 1.13,
}


class UKPayrollEngine:
    """UK PAYE Payroll Calculation Engine.

    Calculates Income Tax (PAYE), National Insurance contributions (employee
    & employer), Auto-Enrolment workplace pension, Student Loan repayments,
    and statutory payments (SSP/SMP/SPP/SAP/ShPP). Supports Scottish tax
    bands, multi-currency conversions, and HMRC RTI submission generation
    (FPS/EPS), P45, P60, and P11D data.
    """

    def __init__(self, default_currency: str = "GBP"):
        self.default_currency = default_currency.upper()
        if self.default_currency not in EXCHANGE_RATES:
            raise ValueError(
                f"Unsupported currency: {self.default_currency}. "
                f"Supported: {', '.join(EXCHANGE_RATES.keys())}"
            )

    # ── Currency helpers ───────────────────────────────────────────────────

    def _convert_to_gbp(self, amount: float, from_currency: str) -> float:
        """Convert an amount from a given currency to GBP."""
        from_currency = from_currency.upper()
        if from_currency == "GBP":
            return amount
        if from_currency not in EXCHANGE_RATES:
            raise ValueError(f"Unsupported currency: {from_currency}")
        return round(amount / EXCHANGE_RATES[from_currency], 2)

    def _convert_from_gbp(self, amount_gbp: float, to_currency: str) -> float:
        """Convert an amount from GBP to a target currency."""
        to_currency = to_currency.upper()
        if to_currency == "GBP":
            return amount_gbp
        if to_currency not in EXCHANGE_RATES:
            raise ValueError(f"Unsupported currency: {to_currency}")
        return round(amount_gbp * EXCHANGE_RATES[to_currency], 2)

    # ── Band-based calculation helper ──────────────────────────────────────

    @staticmethod
    def _calculate_from_bands(annual_amount: float, bands: list) -> float:
        """Calculate tax/NI from a list of (upper_limit, rate) bands.

        Bands are cumulative. Each band applies to the slice of income between
        the previous band's upper limit and this band's upper limit.
        """
        total = 0.0
        prev_limit = 0.0
        for upper_limit, rate in bands:
            if annual_amount <= prev_limit:
                break
            taxable_in_band = min(annual_amount, upper_limit) - prev_limit
            total += taxable_in_band * rate
            prev_limit = upper_limit
        return round(total, 2)

    # ── PAYE Income Tax ───────────────────────────────────────────────────

    def calculate_paye(
        self,
        taxable_income: float,
        is_scottish: bool = False,
    ) -> Dict[str, Any]:
        """Calculate UK PAYE Income Tax.

        Args:
            taxable_income: Annual taxable income after Personal Allowance
                            deduction. If the caller passes gross income,
            is_scottish: Whether Scottish rates apply

        Returns:
            Dictionary with:
                - income_tax: Total PAYE tax for the year
                - effective_rate: Effective tax rate
                - band_breakdown: Per-band breakdown
                - is_scottish: Whether Scottish rates were used
                - personal_allowance: Personal Allowance applied
                - taxable_income: Income after Personal Allowance
        """
        bands = SCOTTISH_BANDS_2024 if is_scottish else PAYE_BANDS_2024

        # For England/Wales/NI: Personal Allowance is £12,570
        # For Scotland: Personal Allowance is included in the first band
        if is_scottish:
            # Scottish bands start from £0 — no separate Personal Allowance
            annual_tax = self._calculate_from_bands(taxable_income, bands)
            personal_allowance = 0.0
            effective_taxable = taxable_income
        else:
            # Standard UK: Personal Allowance of £12,570
            personal_allowance = min(12_570.0, taxable_income)
            effective_taxable = max(0.0, taxable_income - personal_allowance)
            annual_tax = self._calculate_from_bands(effective_taxable, PAYE_BANDS_2024)

        effective_rate = round(annual_tax / taxable_income, 4) if taxable_income > 0 else 0.0

        # Build band breakdown
        band_breakdown = []
        prev_limit = 0.0
        bands_to_use = bands if is_scottish else PAYE_BANDS_2024
        for upper_limit, rate in bands_to_use:
            if is_scottish:
                band_start = prev_limit
                band_taxable = min(taxable_income, upper_limit) - prev_limit
            else:
                band_start = prev_limit
                band_taxable = min(effective_taxable, upper_limit) - prev_limit

            band_tax = max(0.0, band_taxable * rate)
            if band_taxable > 0:
                band_breakdown.append({
                    "band_name": _band_label(prev_limit, upper_limit, is_scottish),
                    "from": prev_limit,
                    "to": upper_limit if upper_limit != float("inf") else None,
                    "rate": rate,
                    "taxable_amount": round(max(0, band_taxable), 2),
                    "tax": round(band_tax, 2),
                })
            prev_limit = upper_limit

        return {
            "income_tax": round(annual_tax, 2),
            "monthly_tax": round(annual_tax / 12, 2),
            "weekly_tax": round(annual_tax / 52, 2),
            "effective_rate": effective_rate,
            "personal_allowance": personal_allowance,
            "taxable_income": round(effective_taxable if not is_scottish else taxable_income, 2),
            "is_scottish": is_scottish,
            "band_breakdown": band_breakdown,
        }

    # ── Employee National Insurance ────────────────────────────────────────

    def calculate_ni(
        self,
        employee_earnings: float,
    ) -> Dict[str, Any]:
        """Calculate Employee National Insurance (Class 1, 2024-25).

        Args:
            employee_earnings: Annual gross earnings

        Returns:
            Dictionary with:
                - ni_contribution: Total employee NI for the year
                - effective_rate: Effective NI rate
                - band_breakdown: Per-band breakdown
        """
        annual_ni = self._calculate_from_bands(employee_earnings, NI_EMPLOYEE_BANDS)

        effective_rate = round(annual_ni / employee_earnings, 4) if employee_earnings > 0 else 0.0

        # Build band breakdown
        band_breakdown = []
        prev_limit = 0.0
        for upper_limit, rate in NI_EMPLOYEE_BANDS:
            band_taxable = min(employee_earnings, upper_limit) - prev_limit
            band_ni = max(0.0, band_taxable * rate)
            if band_taxable > 0:
                band_breakdown.append({
                    "band_name": _ni_band_label(prev_limit, upper_limit),
                    "from": prev_limit,
                    "to": upper_limit if upper_limit != float("inf") else None,
                    "rate": rate,
                    "earnings_in_band": round(max(0, band_taxable), 2),
                    "ni_in_band": round(band_ni, 2),
                })
            prev_limit = upper_limit

        return {
            "ni_contribution": round(annual_ni, 2),
            "monthly_ni": round(annual_ni / 12, 2),
            "weekly_ni": round(annual_ni / 52, 2),
            "effective_rate": effective_rate,
            "band_breakdown": band_breakdown,
        }

    # ── Employer National Insurance ────────────────────────────────────────

    def calculate_employer_ni(
        self,
        employer_earnings: float,
    ) -> Dict[str, Any]:
        """Calculate Employer National Insurance (Class 1, 2024-25).

        Args:
            employer_earnings: Annual gross earnings subject to employer NI

        Returns:
            Dictionary with:
                - employer_ni: Total employer NI for the year
                - effective_rate: Effective employer NI rate
                - band_breakdown: Per-band breakdown
        """
        annual_ni = self._calculate_from_bands(employer_earnings, NI_EMPLOYER_BANDS)

        effective_rate = round(annual_ni / employer_earnings, 4) if employer_earnings > 0 else 0.0

        band_breakdown = []
        prev_limit = 0.0
        for upper_limit, rate in NI_EMPLOYER_BANDS:
            band_taxable = min(employer_earnings, upper_limit) - prev_limit
            band_ni = max(0.0, band_taxable * rate)
            if band_taxable > 0:
                band_breakdown.append({
                    "band_name": f"£{prev_limit:,.0f}+"
                    if upper_limit == float("inf")
                    else f"£{prev_limit:,.0f} - £{upper_limit:,.0f}",
                    "from": prev_limit,
                    "to": upper_limit if upper_limit != float("inf") else None,
                    "rate": rate,
                    "earnings_in_band": round(max(0, band_taxable), 2),
                    "ni_in_band": round(band_ni, 2),
                })
            prev_limit = upper_limit

        return {
            "employer_ni": round(annual_ni, 2),
            "monthly_employer_ni": round(annual_ni / 12, 2),
            "effective_rate": effective_rate,
            "band_breakdown": band_breakdown,
        }

    # ── Auto-Enrolment Workplace Pension ───────────────────────────────────

    def calculate_pension(
        self,
        qualifying_earnings: float,
        employee_rate: float = 0.05,
        employer_rate: float = 0.03,
    ) -> Dict[str, Any]:
        """Calculate Auto-Enrolment Workplace Pension contributions.

        Uses banded qualifying earnings (£6,240 - £50,270 for 2024-25).
        The default rates meet the minimum requirements (3% employer + 5% employee).

        Args:
            qualifying_earnings: Annual gross earnings for pension calculation
            employee_rate: Employee contribution rate (default 5%)
            employer_rate: Employer contribution rate (default 3%)

        Returns:
            Dictionary with:
                - employee_contribution: Employee pension deduction
                - employer_contribution: Employer pension contribution
                - total_contribution: Combined total
                - qualifying_earnings_used: Banded earnings used
                - employee_rate: Employee rate applied
                - employer_rate: Employer rate applied
                - meets_minimum: Whether minimum contribution requirement is met
        """
        # Apply qualifying earnings band
        banded_earnings = max(
            0.0,
            min(qualifying_earnings, PENSION_QUALIFYING_UPPER) - PENSION_QUALIFYING_LOWER,
        )
        banded_earnings = max(0.0, banded_earnings)

        employee_contribution = round(banded_earnings * employee_rate, 2)
        employer_contribution = round(banded_earnings * employer_rate, 2)
        total_contribution = round(employee_contribution + employer_contribution, 2)

        # Check if minimum contribution is met (8% of banded earnings)
        total_rate = employee_rate + employer_rate
        meets_minimum = total_rate >= PENSION_TOTAL_MIN

        return {
            "employee_contribution": employee_contribution,
            "employer_contribution": employer_contribution,
            "total_contribution": total_contribution,
            "qualifying_earnings_used": round(banded_earnings, 2),
            "employee_rate": employee_rate,
            "employer_rate": employer_rate,
            "total_rate": total_rate,
            "meets_minimum": meets_minimum,
            "qualifying_lower": PENSION_QUALIFYING_LOWER,
            "qualifying_upper": PENSION_QUALIFYING_UPPER,
        }

    # ── Student Loan Repayment ────────────────────────────────────────────

    def calculate_student_loan(
        self,
        gross: float,
        plan: str = "plan_2",
    ) -> Dict[str, Any]:
        """Calculate Student Loan Repayment.

        Supports Plan 1 and Plan 2 (2024-25 thresholds).

        Args:
            gross: Annual gross pay
            plan: Student loan plan ('plan_1' or 'plan_2')

        Returns:
            Dictionary with:
                - annual_repayment: Total annual repayment
                - monthly_repayment: Monthly deduction
                - threshold: Plan threshold used
                - rate: Repayment rate used
                - plan: Plan name
        """
        plan_key = plan.lower().replace("-", "_")
        if plan_key not in STUDENT_LOAN_PLANS:
            raise ValueError(
                f"Unknown student loan plan: {plan}. "
                f"Supported: {', '.join(STUDENT_LOAN_PLANS.keys())}"
            )

        plan_config = STUDENT_LOAN_PLANS[plan_key]
        threshold = plan_config["threshold"]
        rate = plan_config["rate"]

        if gross <= threshold:
            annual_repayment = 0.0
        else:
            annual_repayment = round((gross - threshold) * rate, 2)

        return {
            "annual_repayment": annual_repayment,
            "monthly_repayment": round(annual_repayment / 12, 2),
            "weekly_repayment": round(annual_repayment / 52, 2),
            "threshold": threshold,
            "rate": rate,
            "plan": plan_key,
        }

    # ── Statutory Sick Pay (SSP) ──────────────────────────────────────────

    def calculate_ssp(
        self,
        weekly_earnings: float,
        sick_weeks: int,
    ) -> Dict[str, Any]:
        """Calculate Statutory Sick Pay.

        SSP is £116.75/week (2024-25) for up to 28 weeks.
        Employee must earn at least the Lower Earnings Limit.

        Args:
            weekly_earnings: Employee's average weekly earnings
            sick_weeks: Number of weeks of sickness

        Returns:
            Dictionary with:
                - total_ssp: Total SSP payable
                - weekly_rate: SSP weekly rate
                - weeks_paid: Number of weeks paid
                - max_weeks: Maximum SSP weeks
                - eligible: Whether employee qualifies
        """
        eligible = weekly_earnings >= SSP_RATE_WEEKLY and sick_weeks > 0
        weeks_paid = min(max(0, sick_weeks), SSP_MAX_WEEKS) if eligible else 0
        total_ssp = round(weeks_paid * SSP_RATE_WEEKLY, 2)

        return {
            "total_ssp": total_ssp,
            "weekly_rate": SSP_RATE_WEEKLY,
            "weeks_paid": weeks_paid,
            "max_weeks": SSP_MAX_WEEKS,
            "eligible": eligible,
        }

    # ── Statutory Maternity Pay (SMP) ─────────────────────────────────────

    def calculate_smp(
        self,
        average_weekly_earnings: float,
        maternity_weeks: int = 39,
    ) -> Dict[str, Any]:
        """Calculate Statutory Maternity Pay.

        - First 6 weeks: 90% of average weekly earnings (no upper limit)
        - Remaining 33 weeks: £184.03/week (or 90% AWE if lower)

        Args:
            average_weekly_earnings: Employee's AWE for 8 weeks before qualifying week
            maternity_weeks: Total weeks of SMP claimed (max 39)

        Returns:
            Dictionary with:
                - total_smp: Total SMP payable
                - initial_weeks_pay: Pay for first 6 weeks
                - remaining_weeks_pay: Pay for remaining weeks
                - initial_weeks: Number of initial weeks
                - remaining_weeks: Number of remaining weeks
                - initial_weekly_rate: Weekly rate during initial period
                - remaining_weekly_rate: Weekly rate during remaining period
                - eligible: Whether employee qualifies
        """
        eligible = average_weekly_earnings > 0 and maternity_weeks > 0
        if not eligible:
            return {
                "total_smp": 0.0,
                "initial_weeks_pay": 0.0,
                "remaining_weeks_pay": 0.0,
                "initial_weeks": 0,
                "remaining_weeks": 0,
                "initial_weekly_rate": 0.0,
                "remaining_weekly_rate": 0.0,
                "eligible": False,
            }

        initial_weeks = min(SMP_INITIAL_WEEKS, maternity_weeks)
        initial_rate = round(average_weekly_earnings * 0.90, 2)
        initial_weeks_pay = round(initial_weeks * initial_rate, 2)

        remaining_weeks = max(0, maternity_weeks - initial_weeks)
        remaining_rate = min(SMP_RATE_WEEKLY, average_weekly_earnings)
        remaining_weeks_pay = round(remaining_weeks * remaining_rate, 2)

        total_smp = round(initial_weeks_pay + remaining_weeks_pay, 2)

        return {
            "total_smp": total_smp,
            "initial_weeks_pay": initial_weeks_pay,
            "remaining_weeks_pay": remaining_weeks_pay,
            "initial_weeks": initial_weeks,
            "remaining_weeks": remaining_weeks,
            "initial_weekly_rate": initial_rate,
            "remaining_weekly_rate": remaining_rate,
            "eligible": True,
        }

    # ── Statutory Paternity Pay (SPP) ─────────────────────────────────────

    def calculate_spp(
        self,
        average_weekly_earnings: float,
        paternity_weeks: int = 2,
    ) -> Dict[str, Any]:
        """Calculate Statutory Paternity Pay.

        SPP is £184.03/week (or 90% AWE if lower) for up to 2 weeks.

        Args:
            average_weekly_earnings: Employee's AWE
            paternity_weeks: Number of weeks claimed (max 2)

        Returns:
            Dictionary with:
                - total_spp: Total SPP payable
                - weekly_rate: Weekly rate applied
                - weeks_paid: Weeks paid
                - eligible: Whether employee qualifies
        """
        eligible = average_weekly_earnings > 0 and paternity_weeks > 0
        weeks_paid = min(max(0, paternity_weeks), SPP_WEEKS) if eligible else 0
        weekly_rate = min(SPP_RATE_WEEKLY, average_weekly_earnings) if eligible else 0.0
        total_spp = round(weeks_paid * weekly_rate, 2)

        return {
            "total_spp": total_spp,
            "weekly_rate": weekly_rate,
            "weeks_paid": weeks_paid,
            "eligible": eligible,
        }

    # ── Statutory Adoption Pay (SAP) ──────────────────────────────────────

    def calculate_sap(
        self,
        average_weekly_earnings: float,
        adoption_weeks: int = 39,
    ) -> Dict[str, Any]:
        """Calculate Statutory Adoption Pay.

        Same structure as SMP: 90% AWE for 6 weeks, then flat rate for 33 weeks.

        Args:
            average_weekly_earnings: Employee's AWE
            adoption_weeks: Total weeks of SAP claimed (max 39)

        Returns:
            Dictionary with:
                - total_sap: Total SAP payable
                - initial_weeks_pay: Pay for first 6 weeks
                - remaining_weeks_pay: Pay for remaining weeks
                - eligible: Whether employee qualifies
        """
        eligible = average_weekly_earnings > 0 and adoption_weeks > 0
        if not eligible:
            return {
                "total_sap": 0.0,
                "initial_weeks_pay": 0.0,
                "remaining_weeks_pay": 0.0,
                "eligible": False,
            }

        initial_weeks = min(SAP_INITIAL_WEEKS, adoption_weeks)
        initial_rate = round(average_weekly_earnings * 0.90, 2)
        initial_weeks_pay = round(initial_weeks * initial_rate, 2)

        remaining_weeks = max(0, adoption_weeks - initial_weeks)
        remaining_rate = min(SAP_RATE_WEEKLY, average_weekly_earnings)
        remaining_weeks_pay = round(remaining_weeks * remaining_rate, 2)

        total_sap = round(initial_weeks_pay + remaining_weeks_pay, 2)

        return {
            "total_sap": total_sap,
            "initial_weeks_pay": initial_weeks_pay,
            "remaining_weeks_pay": remaining_weeks_pay,
            "initial_weeks": initial_weeks,
            "remaining_weeks": remaining_weeks,
            "eligible": True,
        }

    # ── Statutory Shared Parental Pay (ShPP) ──────────────────────────────

    def calculate_shpp(
        self,
        average_weekly_earnings: float,
        shared_weeks: int,
    ) -> Dict[str, Any]:
        """Calculate Statutory Shared Parental Pay.

        ShPP is £184.03/week (or 90% AWE if lower) for up to 39 weeks
        shared between parents.

        Args:
            average_weekly_earnings: Employee's AWE
            shared_weeks: Number of weeks claimed

        Returns:
            Dictionary with:
                - total_shpp: Total ShPP payable
                - weekly_rate: Weekly rate applied
                - weeks_paid: Weeks paid
                - eligible: Whether employee qualifies
        """
        eligible = average_weekly_earnings > 0 and shared_weeks > 0
        weeks_paid = max(0, shared_weeks) if eligible else 0
        weekly_rate = min(SHPP_RATE_WEEKLY, average_weekly_earnings) if eligible else 0.0
        total_shpp = round(weeks_paid * weekly_rate, 2)

        return {
            "total_shpp": total_shpp,
            "weekly_rate": weekly_rate,
            "weeks_paid": weeks_paid,
            "eligible": eligible,
        }

    # ── Statutory Redundancy Pay ──────────────────────────────────────────

    def calculate_redundancy_pay(
        self,
        weekly_pay: float,
        years_of_service: int,
        age_at_dismissal: int,
    ) -> Dict[str, Any]:
        """Calculate Statutory Redundancy Pay.

        - Under 22: 0.5 week's pay per year
        - 22-40: 1 week's pay per year
        - 41+: 1.5 weeks' pay per year
        - Maximum weekly pay: £643
        - Maximum years: 20

        Args:
            weekly_pay: Employee's gross weekly pay
            years_of_service: Complete years of service
            age_at_dismissal: Employee's age at dismissal

        Returns:
            Dictionary with:
                - redundancy_pay: Total statutory redundancy pay
                - weekly_pay_capped: Weekly pay used (capped)
                - years_used: Years of service used (capped)
                - multiplier: Multiplier based on age
        """
        capped_weekly = min(weekly_pay, REDUNDANCY_WEEKLY_MAX)
        capped_years = min(years_of_service, REDUNDANCY_MAX_YEARS)

        if age_at_dismissal < 22:
            multiplier = 0.5
        elif age_at_dismissal <= 40:
            multiplier = 1.0
        else:
            multiplier = 1.5

        total = round(capped_weekly * capped_years * multiplier, 2)

        return {
            "redundancy_pay": total,
            "weekly_pay_capped": capped_weekly,
            "years_used": capped_years,
            "multiplier": multiplier,
            "age_at_dismissal": age_at_dismissal,
        }

    # ── Full Payroll Calculation ───────────────────────────────────────────

    def calculate_full_payroll(
        self,
        gross_salary: float,
        is_scottish: bool = False,
        student_loan_plan: Optional[str] = None,
        employee_pension_rate: float = 0.05,
        employer_pension_rate: float = 0.03,
        currency: Optional[str] = None,
        benefits_in_kind: float = 0.0,
    ) -> Dict[str, Any]:
        """Calculate complete UK monthly payroll with all statutory deductions.

        Args:
            gross_salary: Annual gross salary
            is_scottish: Whether Scottish tax rates apply
            student_loan_plan: Student loan plan ('plan_1', 'plan_2', or None)
            employee_pension_rate: Employee pension contribution rate
            employer_pension_rate: Employer pension contribution rate
            currency: Input/output currency (default GBP)
            benefits_in_kind: Annual value of benefits in kind (taxed via P11D)

        Returns:
            Complete payroll breakdown with all deductions and net pay
        """
        input_currency = (currency or self.default_currency).upper()

        # Convert to GBP if needed
        if input_currency != "GBP":
            annual_gbp = self._convert_to_gbp(gross_salary, input_currency)
        else:
            annual_gbp = gross_salary

        # 1. Income Tax (PAYE)
        paye = self.calculate_paye(annual_gbp, is_scottish)

        # 2. Employee NI
        employee_ni = self.calculate_ni(annual_gbp)

        # 3. Employer NI
        employer_ni = self.calculate_employer_ni(annual_gbp)

        # 4. Pension
        pension = self.calculate_pension(
            annual_gbp, employee_pension_rate, employer_pension_rate
        )

        # 5. Student Loan (optional)
        student_loan = None
        if student_loan_plan:
            student_loan = self.calculate_student_loan(annual_gbp, student_loan_plan)

        # Annual totals
        annual_tax = paye["income_tax"]
        annual_ni = employee_ni["ni_contribution"]
        annual_pension = pension["employee_contribution"]
        annual_student_loan = student_loan["annual_repayment"] if student_loan else 0.0
        annual_bik = benefits_in_kind

        total_annual_deductions = round(
            annual_tax + annual_ni + annual_pension + annual_student_loan, 2
        )
        annual_net = round(annual_gbp - total_annual_deductions, 2)

        # Employer costs
        annual_employer_ni = employer_ni["employer_ni"]
        annual_employer_pension = pension["employer_contribution"]
        total_employer_cost = round(
            annual_gbp + annual_employer_ni + annual_employer_pension, 2
        )

        # Monthly/weekly breakdown
        result = {
            "gross_salary": round(annual_gbp, 2),
            "monthly_gross": round(annual_gbp / 12, 2),
            "weekly_gross": round(annual_gbp / 52, 2),
            "currency": input_currency if input_currency != "GBP" else self.default_currency,
            "is_scottish": is_scottish,
            "deductions": {
                "income_tax": {
                    "annual": annual_tax,
                    "monthly": round(annual_tax / 12, 2),
                    "weekly": round(annual_tax / 52, 2),
                },
                "employee_ni": {
                    "annual": annual_ni,
                    "monthly": round(annual_ni / 12, 2),
                    "weekly": round(annual_ni / 52, 2),
                },
                "pension": {
                    "annual": annual_pension,
                    "monthly": round(annual_pension / 12, 2),
                    "weekly": round(annual_pension / 52, 2),
                },
                "student_loan": {
                    "annual": annual_student_loan,
                    "monthly": round(annual_student_loan / 12, 2),
                    "weekly": round(annual_student_loan / 52, 2),
                    "plan": student_loan_plan,
                } if student_loan else None,
                "benefits_in_kind": {
                    "annual": round(annual_bik, 2),
                    "monthly": round(annual_bik / 12, 2),
                },
            },
            "total_annual_deductions": total_annual_deductions,
            "total_monthly_deductions": round(total_annual_deductions / 12, 2),
            "net_pay": {
                "annual": annual_net,
                "monthly": round(annual_net / 12, 2),
                "weekly": round(annual_net / 52, 2),
            },
            "employer_costs": {
                "employer_ni": {
                    "annual": annual_employer_ni,
                    "monthly": round(annual_employer_ni / 12, 2),
                },
                "employer_pension": {
                    "annual": annual_employer_pension,
                    "monthly": round(annual_employer_pension / 12, 2),
                },
                "total_employer_cost": total_employer_cost,
                "monthly_employer_cost": round(total_employer_cost / 12, 2),
            },
            "paye": paye,
            "employee_ni": employee_ni,
            "employer_ni": employer_ni,
            "pension": pension,
            "student_loan": student_loan,
        }

        # Convert results to target currency if needed
        if input_currency != "GBP":
            result = self._convert_result_to_currency(result, input_currency)
            result["currency"] = input_currency

        return result

    def _convert_result_to_currency(
        self, result: dict, to_currency: str
    ) -> dict:
        """Recursively convert all monetary values in a result dict to target currency."""
        currency_fields = {
            "gross_salary", "monthly_gross", "weekly_gross",
            "total_annual_deductions", "total_monthly_deductions",
        }
        nested_deduction_fields = {
            "income_tax", "employee_ni", "pension", "student_loan", "benefits_in_kind",
        }
        net_fields = {"annual", "monthly", "weekly"}

        for field in currency_fields:
            if field in result:
                result[field] = self._convert_from_gbp(result[field], to_currency)

        if "deductions" in result:
            for ded_key, ded_val in result["deductions"].items():
                if ded_val is None:
                    continue
                if isinstance(ded_val, dict):
                    for k, v in ded_val.items():
                        if k not in ("plan",) and isinstance(v, (int, float)):
                            ded_val[k] = self._convert_from_gbp(v, to_currency)

        if "net_pay" in result:
            for k, v in result["net_pay"].items():
                if isinstance(v, (int, float)):
                    result["net_pay"][k] = self._convert_from_gbp(v, to_currency)

        if "employer_costs" in result:
            ec = result["employer_costs"]
            for sub_key in ("employer_ni", "employer_pension"):
                if sub_key in ec and isinstance(ec[sub_key], dict):
                    for k, v in ec[sub_key].items():
                        if isinstance(v, (int, float)):
                            ec[sub_key][k] = self._convert_from_gbp(v, to_currency)
            for k in ("total_employer_cost", "monthly_employer_cost"):
                if k in ec and isinstance(ec[k], (int, float)):
                    ec[k] = self._convert_from_gbp(ec[k], to_currency)

        return result

    # ── HMRC RTI: Full Payment Submission (FPS) ───────────────────────────

    def generate_fps_data(
        self,
        payroll_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate Full Payment Submission (FPS) data for HMRC RTI.

        FPS must be submitted on or before each payday. Contains employee
        pay, tax, NI, and other deductions for the pay period.

        Args:
            payroll_data: Dictionary with required keys:
                - employer_paye_reference: e.g. "123/AB456"
                - employer_name: Company name
                - employer_address: Company address
                - employee_nino: National Insurance number
                - employee_surname: Employee surname
                - employee_forename: Employee first name
                - employee_tax_code: e.g. "1257L"
                - pay_frequency: "W" (weekly), "M" (monthly), "F" (fortnightly), "E" (irregular)
                - tax_year: e.g. "202425"
                - pay_period: Pay period identifier
                - gross_pay: Gross pay for this period
                - income_tax: PAYE tax deducted
                - employee_ni: Employee NI deducted
                - employer_ni: Employer NI liability
                - statutory_smp/spp/sap/shpp: Statutory pay amounts
                - student_loan: Student loan deduction
                - pension_contribution: Employee pension deduction
                - net_pay: Net pay to employee
                - hours_worked: Normal hours worked
                - employee_postcode: Employee postcode

        Returns:
            HMRC FPS submission data structure
        """
        required_fields = [
            "employer_paye_reference", "employee_nino", "employee_surname",
            "employee_forename", "tax_year", "pay_frequency",
        ]
        missing = [f for f in required_fields if f not in payroll_data]
        if missing:
            raise ValueError(f"Missing required FPS fields: {', '.join(missing)}")

        fps = {
            "header": {
                "message_type": "FPS",
                "employer_paye_reference": payroll_data["employer_paye_reference"],
                "employer_name": payroll_data.get("employer_name", ""),
                "employer_address": payroll_data.get("employer_address", ""),
                "tax_year": payroll_data["tax_year"],
                "pay_frequency": payroll_data.get("pay_frequency", "M"),
                "payment_date": payroll_data.get("payment_date", datetime.now().strftime("%Y-%m-%d")),
            },
            "employee": {
                "nino": payroll_data["employee_nino"],
                "surname": payroll_data["employee_surname"],
                "forename": payroll_data["employee_forename"],
                "tax_code": payroll_data.get("employee_tax_code", ""),
                "date_of_birth": payroll_data.get("employee_dob", ""),
                "postcode": payroll_data.get("employee_postcode", ""),
                "gender": payroll_data.get("employee_gender", ""),
            },
            "payment": {
                "pay_id": payroll_data.get("pay_period", ""),
                "gross_pay": payroll_data.get("gross_pay", 0.0),
                "net_pay": payroll_data.get("net_pay", 0.0),
                "hours_worked": payroll_data.get("hours_worked", 0.0),
            },
            "deductions": {
                "income_tax": payroll_data.get("income_tax", 0.0),
                "employee_ni": payroll_data.get("employee_ni", 0.0),
                "student_loan": payroll_data.get("student_loan", 0.0),
                "pension_contribution": payroll_data.get("pension_contribution", 0.0),
            },
            "employer_ni_liability": payroll_data.get("employer_ni", 0.0),
            "statutory_pay": {
                "smp": payroll_data.get("statutory_smp", 0.0),
                "spp": payroll_data.get("statutory_spp", 0.0),
                "sap": payroll_data.get("statutory_sap", 0.0),
                "shpp": payroll_data.get("statutory_shpp", 0.0),
                "ssp": payroll_data.get("statutory_ssp", 0.0),
            },
            "benefits_in_kind": payroll_data.get("benefits_in_kind", 0.0),
            "additional_fields": {
                "late_reporting_reason": payroll_data.get("late_reporting_reason", ""),
                "accountancy_software": payroll_data.get("accountancy_software", ""),
            },
        }

        return fps

    # ── HMRC RTI: Employer Payment Summary (EPS) ──────────────────────────

    def generate_eps_data(
        self,
        payroll_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate Employer Payment Summary (EPS) data for HMRC RTI.

        EPS is submitted monthly to report PAYE/NI to pay to HMRC,
        including statutory pay recoveries and employment allowance.

        Args:
            payroll_data: Dictionary with:
                - employer_paye_reference
                - tax_year
                - month_number: 1-12 for the tax month
                - paye_tax_due: Total PAYE tax to pay
                - employee_ni_due: Total employee NI to pay
                - employer_ni_due: Total employer NI to pay
                - statutory_smp/spp/sap/shpp/ssp_recovered: Statutory pay recovered
                - employment_allowance_claimed: Employment allowance
                - apprenticeship_levy: Levy amount

        Returns:
            HMRC EPS submission data structure
        """
        eps = {
            "header": {
                "message_type": "EPS",
                "employer_paye_reference": payroll_data.get("employer_paye_reference", ""),
                "tax_year": payroll_data.get("tax_year", ""),
                "month_number": payroll_data.get("month_number", 1),
                "submission_date": datetime.now().strftime("%Y-%m-%d"),
            },
            "payment_summary": {
                "paye_tax_due": payroll_data.get("paye_tax_due", 0.0),
                "employee_ni_due": payroll_data.get("employee_ni_due", 0.0),
                "employer_ni_due": payroll_data.get("employer_ni_due", 0.0),
            },
            "statutory_recovery": {
                "smp_recovered": payroll_data.get("statutory_smp_recovered", 0.0),
                "spp_recovered": payroll_data.get("statutory_spp_recovered", 0.0),
                "sap_recovered": payroll_data.get("statutory_sap_recovered", 0.0),
                "shpp_recovered": payroll_data.get("statutory_shpp_recovered", 0.0),
                "ssp_recovered": payroll_data.get("statutory_ssp_recovered", 0.0),
                "cis_deductions": payroll_data.get("cis_deductions", 0.0),
            },
            "employment_allowance": {
                "claiming": payroll_data.get("employment_allowance_claimed", False),
                "amount": payroll_data.get("employment_allowance_amount", 0.0),
            },
            "apprenticeship_levy": payroll_data.get("apprenticeship_levy", 0.0),
        }

        return eps

    # ── P45 Data Generation ───────────────────────────────────────────────

    def generate_p45_data(
        self,
        employee: Dict[str, Any],
        leaving_date: str,
        tax_ytd: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate P45 data for an employee leaving employment.

        P45 must be provided to the employee on their last day of employment.
        It contains cumulative tax and NI information for the tax year to date.

        Args:
            employee: Employee details:
                - nino: National Insurance number
                - surname: Employee surname
                - forename: Employee first name
                - address: Employee address
                - tax_code: Current tax code
                - date_of_birth: Date of birth
                - gender: Gender
            leaving_date: Date of leaving (YYYY-MM-DD)
            tax_ytd: Tax year to date totals:
                - gross_pay: Total gross pay
                - income_tax: Total income tax deducted
                - employee_ni: Total employee NI deducted
                - tax_code: Tax code at leaving
                - pay_frequency: Pay frequency

        Returns:
            P45 data structure for Part 1 (HMRC) and Parts 2/3 (employee)
        """
        return {
            "form_type": "P45",
            "part_1": {
                "employer_paye_reference": employee.get("employer_paye_reference", ""),
                "leaving_date": leaving_date,
                "nino": employee.get("nino", ""),
                "surname": employee.get("surname", ""),
                "forename": employee.get("forename", ""),
                "tax_code": tax_ytd.get("tax_code", ""),
                "date_of_birth": employee.get("date_of_birth", ""),
                "gender": employee.get("gender", ""),
            },
            "part_2_and_3": {
                "gross_pay_ytd": tax_ytd.get("gross_pay", 0.0),
                "income_tax_ytd": tax_ytd.get("income_tax", 0.0),
                "employee_ni_ytd": tax_ytd.get("employee_ni", 0.0),
                "tax_code": tax_ytd.get("tax_code", ""),
                "pay_frequency": tax_ytd.get("pay_frequency", "M"),
            },
            "notes": (
                "Part 1 is submitted to HMRC. "
                "Parts 2 and 3 are given to the employee. "
                "The employee must give Part 2 to their new employer."
            ),
        }

    # ── P60 Data Generation ───────────────────────────────────────────────

    def generate_p60_data(
        self,
        employee: Dict[str, Any],
        tax_year: str,
        tax_ytd: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate P60 end-of-year certificate.

        P60 must be provided to each employee by 31 May after the tax year ends.
        It shows total pay and deductions for the tax year (6 April to 5 April).

        Args:
            employee: Employee details (nino, surname, forename, tax_code, etc.)
            tax_year: Tax year label, e.g. "2024-25"
            tax_ytd: Year-to-date totals:
                - gross_pay
                - income_tax
                - employee_ni
                - pension_contribution
                - student_loan
                - statutory_smp/spp/sap/shpp
                - benefits_in_kind
                - tax_code
                - pay_frequency

        Returns:
            P60 data structure
        """
        total_deductions = round(
            tax_ytd.get("income_tax", 0.0)
            + tax_ytd.get("employee_ni", 0.0)
            + tax_ytd.get("pension_contribution", 0.0)
            + tax_ytd.get("student_loan", 0.0),
            2,
        )
        net_pay = round(tax_ytd.get("gross_pay", 0.0) - total_deductions, 2)

        return {
            "form_type": "P60",
            "tax_year": tax_year,
            "employer": {
                "paye_reference": employee.get("employer_paye_reference", ""),
                "name": employee.get("employer_name", ""),
                "address": employee.get("employer_address", ""),
            },
            "employee": {
                "nino": employee.get("nino", ""),
                "surname": employee.get("surname", ""),
                "forename": employee.get("forename", ""),
                "address": employee.get("address", ""),
                "tax_code": tax_ytd.get("tax_code", ""),
                "date_of_birth": employee.get("date_of_birth", ""),
            },
            "earnings": {
                "gross_pay": tax_ytd.get("gross_pay", 0.0),
                "benefits_in_kind": tax_ytd.get("benefits_in_kind", 0.0),
                "total_earnings": round(
                    tax_ytd.get("gross_pay", 0.0) + tax_ytd.get("benefits_in_kind", 0.0), 2
                ),
            },
            "deductions": {
                "income_tax": tax_ytd.get("income_tax", 0.0),
                "employee_ni": tax_ytd.get("employee_ni", 0.0),
                "pension_contribution": tax_ytd.get("pension_contribution", 0.0),
                "student_loan": tax_ytd.get("student_loan", 0.0),
                "total_deductions": total_deductions,
            },
            "statutory_pay": {
                "smp": tax_ytd.get("statutory_smp", 0.0),
                "spp": tax_ytd.get("statutory_spp", 0.0),
                "sap": tax_ytd.get("statutory_sap", 0.0),
                "shpp": tax_ytd.get("statutory_shpp", 0.0),
                "ssp": tax_ytd.get("statutory_ssp", 0.0),
            },
            "net_pay": net_pay,
            "pay_frequency": tax_ytd.get("pay_frequency", "M"),
            "submission_deadline": "31 May",
        }

    # ── P11D Data Generation (Benefits in Kind) ──────────────────────────

    def generate_p11d_data(
        self,
        employee: Dict[str, Any],
        benefits: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Generate P11D benefits in kind declaration.

        P11D must be submitted to HMRC by 6 July after the tax year.
        It reports benefits provided to employees that are not tax-free.

        Args:
            employee: Employee details
            benefits: List of benefit entries, each with:
                - benefit_type: e.g. "company_car", "private_medical", "accommodation"
                - cash_equivalent: Cash equivalent value
                - description: Description of benefit
                - available_from: Date benefit first available
                - available_to: Date benefit ceased

        Returns:
            P11D data structure
        """
        total_bik = sum(float(b.get("cash_equivalent", 0.0)) for b in benefits)

        return {
            "form_type": "P11D",
            "employee": {
                "nino": employee.get("nino", ""),
                "surname": employee.get("surname", ""),
                "forename": employee.get("forename", ""),
                "tax_code": employee.get("tax_code", ""),
            },
            "employer": {
                "paye_reference": employee.get("employer_paye_reference", ""),
                "name": employee.get("employer_name", ""),
            },
            "benefits": benefits,
            "total_benefits_in_kind": round(total_bik, 2),
            "submission_deadline": "6 July",
            "notes": (
                "P11D is submitted to HMRC and a copy given to the employee. "
                "Benefits are taxed via the PAYE code adjustment or self-assessment."
            ),
        }

    # ── Trivial Benefits ──────────────────────────────────────────────────

    def calculate_trivial_benefits(
        self,
        benefits: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Calculate trivial benefits for tax-free exemption.

        Trivial benefits up to £50 per occurrence are tax-free, provided they
        are not cash, not a reward for performance, and not in the employment
        contract. Annual cap: £300 for directors.

        Args:
            benefits: List of benefit entries, each with:
                - amount: Value of benefit
                - is_cash: Whether benefit is cash (cash is NOT eligible)
                - is_director: Whether employee is a director

        Returns:
            Dictionary with:
                - total_exempt: Total tax-free trivial benefits
                - total_taxable: Total taxable benefits
                - benefit_count: Number of qualifying benefits
        """
        total_exempt = 0.0
        total_taxable = 0.0
        qualifying = 0

        director_cap = 300.0
        director_total = 0.0

        for benefit in benefits:
            amount = float(benefit.get("amount", 0.0))
            is_cash = benefit.get("is_cash", False)
            is_director = benefit.get("is_director", False)

            if is_cash or amount > 50.0:
                total_taxable += amount
                continue

            if is_director:
                if director_total + amount > director_cap:
                    total_taxable += amount
                    continue
                director_total += amount

            total_exempt += amount
            qualifying += 1

        return {
            "total_exempt": round(total_exempt, 2),
            "total_taxable": round(total_taxable, 2),
            "qualifying_count": qualifying,
            "director_cap": director_cap,
            "director_total_used": round(director_total, 2),
        }

    # ── Trivial Benefits Calculation from Items ───────────────────────────

    def check_trivial_benefit_eligibility(
        self,
        amount: float,
        is_cash: bool = False,
    ) -> Dict[str, Any]:
        """Check if a single benefit qualifies as a trivial benefit.

        Rules:
        - Must not be cash
        - Must not exceed £50 per occurrence
        - Must not be a reward for performance or part of the employment contract

        Args:
            amount: Value of the benefit
            is_cash: Whether the benefit is cash

        Returns:
            Dictionary with eligibility status
        """
        if is_cash:
            return {
                "eligible": False,
                "reason": "Cash benefits do not qualify as trivial benefits",
                "amount": amount,
            }
        if amount > 50.0:
            return {
                "eligible": False,
                "reason": f"Amount £{amount:.2f} exceeds £50 trivial benefits limit",
                "amount": amount,
            }
        return {
            "eligible": True,
            "reason": "Qualifies as a trivial benefit",
            "amount": amount,
        }

    # ── Rates Summary ─────────────────────────────────────────────────────

    def get_rates_summary(self) -> Dict[str, Any]:
        """Return a summary of all UK payroll rates for 2024-25."""
        return {
            "tax_year": "2024-25",
            "paye_bands_england_wales_ni": [
                {"band": "Personal Allowance", "from": 0, "to": 12_570, "rate": "0%"},
                {"band": "Basic Rate", "from": 12_570, "to": 50_270, "rate": "20%"},
                {"band": "Higher Rate", "from": 50_270, "to": 125_140, "rate": "40%"},
                {"band": "Additional Rate", "from": 125_140, "to": None, "rate": "45%"},
            ],
            "paye_bands_scotland": [
                {"band": "Starter Rate", "from": 0, "to": 2_162, "rate": "19%"},
                {"band": "Basic Rate", "from": 2_162, "to": 13_118, "rate": "20%"},
                {"band": "Intermediate Rate", "from": 13_118, "to": 24_000, "rate": "21%"},
                {"band": "Higher Rate", "from": 24_000, "to": 43_662, "rate": "42%"},
                {"band": "Advanced Rate", "from": 43_662, "to": 75_000, "rate": "45%"},
                {"band": "Top Rate", "from": 75_000, "to": None, "rate": "48%"},
            ],
            "national_insurance": {
                "employee": [
                    {"band": "Below primary threshold", "from": 0, "to": 12_570, "rate": "0%"},
                    {"band": "Main rate", "from": 12_570, "to": 50_270, "rate": "8%"},
                    {"band": "Upper rate", "from": 50_270, "to": None, "rate": "2%"},
                ],
                "employer": [
                    {"band": "Below secondary threshold", "from": 0, "to": 9_100, "rate": "0%"},
                    {"band": "Above secondary threshold", "from": 9_100, "to": None, "rate": "13.8%"},
                ],
            },
            "pension": {
                "qualifying_lower": PENSION_QUALIFYING_LOWER,
                "qualifying_upper": PENSION_QUALIFYING_UPPER,
                "minimum_employee": "5%",
                "minimum_employer": "3%",
                "minimum_total": "8%",
            },
            "student_loans": {
                "plan_1": {"threshold": 24_990, "rate": "9%"},
                "plan_2": {"threshold": 27_295, "rate": "9%"},
            },
            "statutory_payments": {
                "ssp": {"weekly_rate": SSP_RATE_WEEKLY, "max_weeks": SSP_MAX_WEEKS},
                "smp": {"weekly_rate": SMP_RATE_WEEKLY, "initial_weeks": SMP_INITIAL_WEEKS, "remaining_weeks": SMP_REMAINING_WEEKS},
                "spp": {"weekly_rate": SPP_RATE_WEEKLY, "weeks": SPP_WEEKS},
                "sap": {"weekly_rate": SAP_RATE_WEEKLY, "initial_weeks": SAP_INITIAL_WEEKS, "remaining_weeks": SAP_REMAINING_WEEKS},
                "shpp": {"weekly_rate": SHPP_RATE_WEEKLY},
                "redundancy": {"weekly_max": REDUNDANCY_WEEKLY_MAX, "max_years": REDUNDANCY_MAX_YEARS},
            },
            "trivial_benefits": {
                "limit_per_occurrence": 50.0,
                "annual_director_cap": 300.0,
                "cash_not_eligible": True,
            },
            "hmrc_rti": {
                "fps": "Full Payment Submission - on or before each payday",
                "eps": "Employer Payment Summary - monthly",
                "p45": "Given on leaving employment",
                "p60": "Annual summary - by 31 May",
                "p11d": "Benefits in kind declaration - by 6 July",
            },
            "supported_currencies": list(EXCHANGE_RATES.keys()),
        }


# ── Label helpers ──────────────────────────────────────────────────────────

def _band_label(from_amount: float, to_amount: float, is_scottish: bool = False) -> str:
    """Human-readable label for a tax band."""
    if to_amount == float("inf"):
        return f"£{from_amount:,.0f}+"
    if from_amount == 0 and not is_scottish:
        return f"Personal Allowance (£0 - £{to_amount:,.0f})"
    if from_amount == 0 and is_scottish:
        return f"Starter Rate (£0 - £{to_amount:,.0f})"
    return f"£{from_amount:,.0f} - £{to_amount:,.0f}"


def _ni_band_label(from_amount: float, to_amount: float) -> str:
    """Human-readable label for an NI band."""
    if to_amount == float("inf"):
        return f"£{from_amount:,.0f}+"
    return f"£{from_amount:,.0f} - £{to_amount:,.0f}"
