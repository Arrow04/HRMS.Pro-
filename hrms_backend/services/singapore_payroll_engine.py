"""
Singapore CPF Payroll Calculation Engine
========================================
Calculates CPF contributions, SDL, SHG, and generates IR8A data
for Singapore-based employees.

CPF Contribution Rates (2024-2026):
  - Employee rates: 20% (≤55), 13% (55-60), 10.5% (60-65), 9% (65-70), 7.5% (>70)
  - Employer rates: 17% (≤55), 14.5% (55-60), 12% (60-65), 10.5% (65-70), 9% (>70)

CPF Allocation (per dollar of contribution for employees ≤55):
  - OA (Ordinary Account): 61.67%
  - SA (Special Account): 14.33%
  - MA (Medisave Account): 24%

Wage Ceilings:
  - Ordinary Wages: SGD 6,000/month
  - Additional Wages: SGD 102,000/year

Other Statutory:
  - SDL: 0.25% of wages, min SGD 2, max SGD 11.25/month
  - Income Tax: IR8A reporting only (no withholding)
"""
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── CPF Contribution Rates ─────────────────────────────────────────────────

# CPF Employee contribution rates by age bracket (2024-2026)
CPF_EMPLOYEE_RATES = {
    (0, 55): 0.20,
    (55, 60): 0.13,
    (60, 65): 0.105,
    (65, 70): 0.09,
    (70, 999): 0.075,
}

# CPF Employer contribution rates by age bracket (2024-2026)
CPF_EMPLOYER_RATES = {
    (0, 55): 0.17,
    (55, 60): 0.145,
    (60, 65): 0.12,
    (65, 70): 0.105,
    (70, 999): 0.09,
}

# CPF Allocation breakdown for employees ≤55 (per dollar of total CPF contribution)
CPF_ALLOCATION_U55 = {
    "OA": 0.6167,  # Ordinary Account
    "SA": 0.1433,  # Special Account
    "MA": 0.24,    # Medisave Account
}

# CPF Allocation breakdown for employees 55-60
CPF_ALLOCATION_55_60 = {
    "OA": 0.4973,
    "SA": 0.1327,
    "MA": 0.37,
}

# CPF Allocation breakdown for employees 60-65
CPF_ALLOCATION_60_65 = {
    "OA": 0.4213,
    "SA": 0.0887,
    "MA": 0.49,
}

# CPF Allocation breakdown for employees 65-70
CPF_ALLOCATION_65_70 = {
    "OA": 0.3163,
    "SA": 0.0337,
    "MA": 0.65,
}

# CPF Allocation breakdown for employees >70
CPF_ALLOCATION_A70 = {
    "OA": 0.2113,
    "SA": 0.0,
    "MA": 0.7887,
}

# ── Wage Ceilings ──────────────────────────────────────────────────────────

CPF_ORDINARY_WAGES_CEILING = 6000.0  # SGD per month
CPF_ADDITIONAL_WAGES_CEILING = 102000.0  # SGD per year
CPF_MIN_CONTRIBUTION_SALARY = 50.0  # SGD - no contribution if salary < this

# ── SDL Rates ──────────────────────────────────────────────────────────────

SDL_RATE = 0.0025  # 0.25%
SDL_MIN = 2.0  # SGD per month
SDL_MAX = 11.25  # SGD per month

# ── Multi-currency exchange rates (approximate) ───────────────────────────
# These should be updated periodically from a live feed in production
EXCHANGE_RATES = {
    "SGD": 1.0,
    "USD": 1.35,
    "MYR": 3.05,
    "INR": 100.5,
    "EUR": 1.45,
    "GBP": 1.70,
    "AUD": 2.0,
    "JPY": 0.009,
    "CNY": 0.19,
    "KRW": 0.0010,
}

# ── Singapore Employment Act Entitlements ─────────────────────────────────

ANNUAL_LEAVE_ENTITLEMENT = {
    1: 7,   # 1st year
    2: 8,
    3: 9,
    4: 10,
    5: 11,
    6: 12,
    7: 13,
    8: 14,  # 8th year onwards
}

PUBLIC_HOLIDAYS_GAZETTED = 11
PUBLIC_HOLIDAYS_ADDITIONAL = 1
TOTAL_PUBLIC_HOLIDAYS = PUBLIC_HOLIDAYS_GAZETTED + PUBLIC_HOLIDAYS_ADDITIONAL

SICK_LEAVE_OUTPATIENT = 14  # days per year
SICK_LEAVE_HOSPITALIZATION = 60  # days per year

OVERTIME_RATE = 1.5  # 1.5x for hours exceeding 8/day or 44/week


class SingaporePayrollEngine:
    """Singapore CPF Payroll Calculation Engine.

    Calculates CPF contributions (employee & employer), SDL, and generates
    IR8A data for Singapore-based employees. Supports multi-currency
    conversions and full breakdown by OA/SA/MA accounts.
    """

    def __init__(self, default_currency: str = "SGD"):
        self.default_currency = default_currency.upper()
        if self.default_currency not in EXCHANGE_RATES:
            raise ValueError(
                f"Unsupported currency: {self.default_currency}. "
                f"Supported: {', '.join(EXCHANGE_RATES.keys())}"
            )

    def _get_age_bracket(self, age: int) -> tuple:
        """Return the age bracket tuple for a given age."""
        for bracket in CPF_EMPLOYEE_RATES:
            if bracket[0] <= age < bracket[1]:
                return bracket
        return (70, 999)

    def _get_employee_rate(self, age: int) -> float:
        """Return CPF employee contribution rate for the given age."""
        bracket = self._get_age_bracket(age)
        return CPF_EMPLOYEE_RATES[bracket]

    def _get_employer_rate(self, age: int) -> float:
        """Return CPF employer contribution rate for the given age."""
        bracket = self._get_age_bracket(age)
        return CPF_EMPLOYER_RATES[bracket]

    def _get_allocation(self, age: int) -> Dict[str, float]:
        """Return CPF allocation breakdown for the given age."""
        if age <= 55:
            return dict(CPF_ALLOCATION_U55)
        elif age <= 60:
            return dict(CPF_ALLOCATION_55_60)
        elif age <= 65:
            return dict(CPF_ALLOCATION_60_65)
        elif age <= 70:
            return dict(CPF_ALLOCATION_65_70)
        else:
            return dict(CPF_ALLOCATION_A70)

    def _convert_to_sgd(self, amount: float, from_currency: str) -> float:
        """Convert an amount from a given currency to SGD."""
        from_currency = from_currency.upper()
        if from_currency == "SGD":
            return amount
        if from_currency not in EXCHANGE_RATES:
            raise ValueError(f"Unsupported currency: {from_currency}")
        return round(amount / EXCHANGE_RATES[from_currency], 2)

    def _convert_from_sgd(self, amount_sgd: float, to_currency: str) -> float:
        """Convert an amount from SGD to a target currency."""
        to_currency = to_currency.upper()
        if to_currency == "SGD":
            return amount_sgd
        if to_currency not in EXCHANGE_RATES:
            raise ValueError(f"Unsupported currency: {to_currency}")
        return round(amount_sgd * EXCHANGE_RATES[to_currency], 2)

    def _cap_ordinary_wages(self, ordinary_wages: float) -> float:
        """Cap ordinary wages at the monthly CPF ceiling."""
        return min(ordinary_wages, CPF_ORDINARY_WAGES_CEILING)

    def _cap_additional_wages(
        self, additional_wages: float, ytd_additional_wages: float = 0.0
    ) -> float:
        """Cap additional wages at the annual CPF ceiling minus YTD."""
        remaining_ceiling = max(0, CPF_ADDITIONAL_WAGES_CEILING - ytd_additional_wages)
        return min(additional_wages, remaining_ceiling)

    def calculate_cpf(
        self,
        basic: float,
        age: int,
        additional_wages: float = 0.0,
        ytd_additional_wages: float = 0.0,
        currency: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Calculate CPF contributions with full OA/SA/MA breakdown.

        Args:
            basic: Monthly ordinary wages in SGD (or converted from currency)
            age: Employee age in years
            additional_wages: Bonus, overtime, etc. for this period
            ytd_additional_wages: Year-to-date additional wages already processed
            currency: Input currency code (converted to SGD if not SGD)

        Returns:
            Dictionary with:
                - employee_contribution: Total employee CPF deduction
                - employer_contribution: Total employer CPF contribution
                - total_contribution: Combined total
                - ordinary_wages: Capped ordinary wages used
                - additional_wages: Capped additional wages used
                - allocation: Breakdown by OA/SA/MA
                - employee_allocation: Employee's OA/SA/MA split
                - employer_allocation: Employer's OA/SA/MA split
                - employee_rate: Employee contribution rate percentage
                - employer_rate: Employer contribution rate percentage
                - age: Employee age used for rate lookup
        """
        # Convert to SGD if a different currency is specified
        input_currency = (currency or self.default_currency).upper()
        if input_currency != "SGD":
            basic_sgd = self._convert_to_sgd(basic, input_currency)
            additional_wages_sgd = self._convert_to_sgd(additional_wages, input_currency)
            ytd_aw_sgd = self._convert_to_sgd(ytd_additional_wages, input_currency)
        else:
            basic_sgd = basic
            additional_wages_sgd = additional_wages
            ytd_aw_sgd = ytd_additional_wages

        # No contribution if salary below minimum threshold
        if basic_sgd < CPF_MIN_CONTRIBUTION_SALARY:
            return {
                "employee_contribution": 0.0,
                "employer_contribution": 0.0,
                "total_contribution": 0.0,
                "ordinary_wages": 0.0,
                "additional_wages": 0.0,
                "allocation": {"OA": 0.0, "SA": 0.0, "MA": 0.0},
                "employee_allocation": {"OA": 0.0, "SA": 0.0, "MA": 0.0},
                "employer_allocation": {"OA": 0.0, "SA": 0.0, "MA": 0.0},
                "employee_rate": 0.0,
                "employer_rate": 0.0,
                "age": age,
                "currency": self.default_currency,
            }

        # Cap wages
        capped_ordinary = self._cap_ordinary_wages(basic_sgd)
        capped_additional = self._cap_additional_wages(additional_wages_sgd, ytd_aw_sgd)

        # Get rates for age bracket
        emp_rate = self._get_employee_rate(age)
        er_rate = self._get_employer_rate(age)
        allocation = self._get_allocation(age)

        # Calculate contributions
        employee_contribution = round(
            (capped_ordinary + capped_additional) * emp_rate, 2
        )
        employer_contribution = round(
            (capped_ordinary + capped_additional) * er_rate, 2
        )

        # Split by account allocation
        emp_alloc = {k: round(employee_contribution * v, 2) for k, v in allocation.items()}
        er_alloc = {k: round(employer_contribution * v, 2) for k, v in allocation.items()}

        # Combined allocation
        combined_alloc = {
            k: round(emp_alloc[k] + er_alloc[k], 2) for k in allocation
        }

        result = {
            "employee_contribution": employee_contribution,
            "employer_contribution": employer_contribution,
            "total_contribution": round(employee_contribution + employer_contribution, 2),
            "ordinary_wages": round(capped_ordinary, 2),
            "additional_wages": round(capped_additional, 2),
            "allocation": combined_alloc,
            "employee_allocation": emp_alloc,
            "employer_allocation": er_alloc,
            "employee_rate": emp_rate,
            "employer_rate": er_rate,
            "age": age,
            "currency": self.default_currency,
        }

        # Convert results to target currency if needed
        if input_currency != self.default_currency:
            for key in (
                "employee_contribution",
                "employer_contribution",
                "total_contribution",
                "ordinary_wages",
                "additional_wages",
            ):
                result[key] = self._convert_from_sgd(result[key], input_currency)
            for alloc_key in ("allocation", "employee_allocation", "employer_allocation"):
                result[alloc_key] = {
                    k: self._convert_from_sgd(v, input_currency)
                    for k, v in result[alloc_key].items()
                }
            result["currency"] = input_currency

        return result

    def calculate_sdl(
        self,
        total_wages: float,
        currency: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Calculate Skills Development Levy (SDL).

        SDL is 0.25% of total wages, subject to:
        - Minimum: SGD 2.00 per month
        - Maximum: SGD 11.25 per month

        Args:
            total_wages: Total ordinary + additional wages for the month
            currency: Input currency code

        Returns:
            Dictionary with:
                - sdl_amount: SDL payable
                - total_wages: Wages used for calculation
                - rate: SDL rate (0.25%)
                - min_amount: Minimum SDL
                - max_amount: Maximum SDL
                - currency: Output currency
        """
        input_currency = (currency or self.default_currency).upper()
        if input_currency != "SGD":
            wages_sgd = self._convert_to_sgd(total_wages, input_currency)
        else:
            wages_sgd = total_wages

        sdl = round(wages_sgd * SDL_RATE, 2)
        sdl = max(SDL_MIN, min(sdl, SDL_MAX))

        result = {
            "sdl_amount": sdl,
            "total_wages": round(wages_sgd, 2),
            "rate": SDL_RATE,
            "min_amount": SDL_MIN,
            "max_amount": SDL_MAX,
            "currency": "SGD",
        }

        if input_currency != "SGD":
            result["sdl_amount"] = self._convert_from_sgd(sdl, input_currency)
            result["total_wages"] = self._convert_from_sgd(wages_sgd, input_currency)
            result["currency"] = input_currency

        return result

    def calculate_annual_leave_entitlement(
        self, years_of_service: int
    ) -> Dict[str, int]:
        """Calculate annual leave entitlement based on years of service.

        Per Singapore Employment Act:
        - 1st year: 7 days
        - Increases by 1 day per year
        - Capped at 14 days by 8th year onwards

        Args:
            years_of_service: Completed years of service

        Returns:
            Dictionary with leave days and breakdown
        """
        yos = max(1, years_of_service)
        days = ANNUAL_LEAVE_ENTITLEMENT.get(yos, 14)

        return {
            "annual_leave_days": days,
            "years_of_service": yos,
            "probation_leave": 7 if yos <= 1 else days,
            "full_time_leave": days,
        }

    def calculate_overtime_pay(
        self,
        hourly_rate: float,
        overtime_hours: float,
        currency: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Calculate overtime pay at 1.5x rate.

        Per Singapore Employment Act:
        - Overtime: 1.5x hourly rate
        - Applies for hours exceeding 8/day or 44/week
        - Only for non-exempt employees (basic monthly ≤ SGD 2,600)

        Args:
            hourly_rate: Employee's hourly rate
            overtime_hours: Number of overtime hours
            currency: Input currency code

        Returns:
            Dictionary with overtime details
        """
        input_currency = (currency or self.default_currency).upper()
        if input_currency != "SGD":
            hourly_sgd = self._convert_to_sgd(hourly_rate, input_currency)
        else:
            hourly_sgd = hourly_rate

        ot_pay = round(hourly_sgd * OVERTIME_RATE * overtime_hours, 2)

        result = {
            "overtime_pay": ot_pay,
            "hourly_rate": round(hourly_sgd, 2),
            "overtime_hours": overtime_hours,
            "ot_rate": OVERTIME_RATE,
            "currency": "SGD",
        }

        if input_currency != "SGD":
            result["overtime_pay"] = self._convert_from_sgd(ot_pay, input_currency)
            result["hourly_rate"] = self._convert_from_sgd(hourly_sgd, input_currency)
            result["currency"] = input_currency

        return result

    def calculate_public_holidays(
        self, year: int, include_additional: bool = True
    ) -> Dict[str, Any]:
        """Return public holiday entitlement for a given year.

        Singapore gazettes 11 public holidays per year, plus 1 additional
        day (typically the day after National Day if it falls on a Sunday).

        Args:
            year: Calendar year
            include_additional: Whether to include the additional holiday

        Returns:
            Dictionary with holiday count and details
        """
        total = PUBLIC_HOLIDAYS_GAZETTED
        if include_additional:
            total += PUBLIC_HOLIDAYS_ADDITIONAL

        return {
            "total_holidays": total,
            "gazetted_holidays": PUBLIC_HOLIDAYS_GAZETTED,
            "additional_holiday": PUBLIC_HOLIDAYS_ADDITIONAL if include_additional else 0,
            "year": year,
        }

    def calculate_sick_leave(self) -> Dict[str, int]:
        """Return sick leave entitlement per year.

        Per Singapore Employment Act:
        - Outpatient sick leave: 14 days/year
        - Hospitalization leave: 60 days/year (inclusive of outpatient)
        - Total combined: Up to 14 days outpatient + 60 days hospitalization

        Returns:
            Dictionary with sick leave breakdown
        """
        return {
            "outpatient_days": SICK_LEAVE_OUTPATIENT,
            "hospitalization_days": SICK_LEAVE_HOSPITALIZATION,
            "total_days": SICK_LEAVE_OUTPATIENT + SICK_LEAVE_HOSPITALIZATION,
        }

    def calculate_full_month_payroll(
        self,
        basic: float,
        age: int,
        additional_wages: float = 0.0,
        ytd_additional_wages: float = 0.0,
        currency: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Calculate complete monthly payroll including CPF, SDL, and net pay.

        This is a convenience method that combines all calculations for
        a standard monthly payroll run.

        Args:
            basic: Monthly basic salary
            age: Employee age
            additional_wages: Bonus, overtime, etc.
            ytd_additional_wages: Year-to-date additional wages
            currency: Input currency code

        Returns:
            Complete payroll breakdown with all statutory deductions
        """
        input_currency = (currency or self.default_currency).upper()

        # CPF calculation
        cpf = self.calculate_cpf(
            basic, age, additional_wages, ytd_additional_wages, currency
        )

        # SDL calculation (based on total wages)
        total_wages_sgd = cpf["ordinary_wages"]
        if input_currency != "SGD":
            total_wages_sgd = self._convert_to_sgd(total_wages_sgd, input_currency)
        total_wages_sgd += cpf["additional_wages"]
        if input_currency != "SGD":
            total_wages_sgd += self._convert_to_sgd(cpf["additional_wages"], input_currency)

        sdl = self.calculate_sdl(total_wages_sgd, "SGD")

        # Convert SDL to target currency if needed
        if input_currency != "SGD":
            sdl_amount = self._convert_from_sgd(sdl["sdl_amount"], input_currency)
        else:
            sdl_amount = sdl["sdl_amount"]

        # Total deductions
        total_deductions = round(cpf["employee_contribution"] + sdl_amount, 2)

        # Net pay (employee's CPF is deducted, SDL is employer-only)
        net_pay = round(basic - cpf["employee_contribution"], 2)

        # Total employer cost
        employer_cost = round(
            basic + cpf["employer_contribution"] + sdl_amount, 2
        )

        return {
            "basic_salary": basic,
            "age": age,
            "currency": input_currency,
            "cpf": cpf,
            "sdl": sdl,
            "total_deductions": total_deductions,
            "net_pay": net_pay,
            "employer_total_cost": employer_cost,
            "statutory_summary": {
                "cpf_employee": cpf["employee_contribution"],
                "cpf_employer": cpf["employer_contribution"],
                "cpf_total": cpf["total_contribution"],
                "sdl": sdl_amount,
                "total_statutory": round(
                    cpf["total_contribution"] + sdl_amount, 2
                ),
            },
            "account_breakdown": cpf["allocation"],
        }

    def generate_ir8a_data(
        self,
        payroll_data: List[Dict[str, Any]],
        year: int,
        employee_name: str,
        employee_nric: str,
        employee_id: str,
        employer_name: str,
        employer_uen: str,
        designation: str = "",
        date_of_joining: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate IR8A data for tax filing with IRAS.

        IR8A is the Singapore equivalent of Form 16 (India).
        Employers must submit IR8A for each employee earning > SGD 22,000/year.

        Args:
            payroll_data: List of monthly payroll records for the year
                          Each dict should contain:
                            - basic: Monthly basic salary
                            - cpf_employee: Employee CPF contribution
                            - cpf_employer: Employer CPF contribution
                            - bonuses: Additional wages/bonuses
                            - overtime_pay: Overtime earnings
                            - other_allowances: Other taxable income
            year: Tax year
            employee_name: Full name of employee
            employee_nric: NRIC/FIN number
            employee_id: Employee ID
            employer_name: Company name
            employer_uen: Company UEN
            designation: Job title
            date_of_joining: Date of joining (YYYY-MM-DD)

        Returns:
            Dictionary structured for IR8A submission
        """
        total_basic = 0.0
        total_cpf_employee = 0.0
        total_cpf_employer = 0.0
        total_bonuses = 0.0
        total_overtime = 0.0
        total_other = 0.0
        total_gross = 0.0
        months_processed = 0

        for record in payroll_data:
            total_basic += float(record.get("basic", 0))
            total_cpf_employee += float(record.get("cpf_employee", 0))
            total_cpf_employer += float(record.get("cpf_employer", 0))
            total_bonuses += float(record.get("bonuses", 0))
            total_overtime += float(record.get("overtime_pay", 0))
            total_other += float(record.get("other_allowances", 0))
            total_gross += float(record.get("gross_salary", record.get("basic", 0)))
            months_processed += 1

        # Annual totals
        annual_basic = round(total_basic, 2)
        annual_cpf_employee = round(total_cpf_employee, 2)
        annual_cpf_employer = round(total_cpf_employer, 2)
        annual_bonuses = round(total_bonuses, 2)
        annual_overtime = round(total_overtime, 2)
        annual_other = round(total_other, 2)
        annual_gross = round(total_gross, 2)

        # IR8A fields
        ir8a = {
            "form_type": "IR8A",
            "tax_year": year,
            "employee": {
                "name": employee_name,
                "nric_fin": employee_nric,
                "employee_id": employee_id,
                "designation": designation,
                "date_of_joining": date_of_joining,
            },
            "employer": {
                "name": employer_name,
                "uen": employer_uen,
            },
            "income": {
                "gross_salary": annual_gross,
                "gross_salary_monthly": round(annual_gross / 12, 2) if months_processed > 0 else 0,
                "bonuses": annual_bonuses,
                "overtime_pay": annual_overtime,
                "other_allowances": annual_other,
                "total_employment_income": round(
                    annual_gross + annual_bonuses + annual_overtime + annual_other, 2
                ),
            },
            "cpf": {
                "employee_contribution": annual_cpf_employee,
                "employer_contribution": annual_cpf_employer,
                "total_contribution": round(annual_cpf_employee + annual_cpf_employer, 2),
            },
            "deductions": {
                "cpf_employee": annual_cpf_employee,
                "other_deductions": 0.0,
            },
            "compensation_received": {
                "total_compensation": round(
                    annual_gross + annual_bonuses + annual_overtime + annual_other, 2
                ),
                "gross_salary": annual_gross,
                "allowances": annual_other,
                "bonuses": annual_bonuses,
                "overtime": annual_overtime,
            },
            "months_processed": months_processed,
            "notes": {
                "withholding_tax": "Singapore does not require employer withholding for income tax. Employees file directly with IRAS.",
                "ir8a_submission": "Submit via IRAS myTax Portal by Feb 28 of the following year.",
                "form_g": "Use Form G for employees with director fees or executive income above SGD 200,000.",
            },
        }

        return ir8a

    def get_contribution_rates_summary(self) -> Dict[str, Any]:
        """Return a summary of all CPF contribution rates for display/reporting."""
        return {
            "employee_rates": {
                "≤55": {"rate": "20%", "value": 0.20},
                "55-60": {"rate": "13%", "value": 0.13},
                "60-65": {"rate": "10.5%", "value": 0.105},
                "65-70": {"rate": "9%", "value": 0.09},
                ">70": {"rate": "7.5%", "value": 0.075},
            },
            "employer_rates": {
                "≤55": {"rate": "17%", "value": 0.17},
                "55-60": {"rate": "14.5%", "value": 0.145},
                "60-65": {"rate": "12%", "value": 0.12},
                "65-70": {"rate": "10.5%", "value": 0.105},
                ">70": {"rate": "9%", "value": 0.09},
            },
            "allocation_u55": {
                "OA": {"rate": "61.67%", "value": 0.6167, "purpose": "Housing, Education, Investment"},
                "SA": {"rate": "14.33%", "value": 0.1433, "purpose": "Retirement, Investment"},
                "MA": {"rate": "24%", "value": 0.24, "purpose": "Medical"},
            },
            "wage_ceilings": {
                "ordinary_wages_monthly": CPF_ORDINARY_WAGES_CEILING,
                "additional_wages_annual": CPF_ADDITIONAL_WAGES_CEILING,
                "min_contribution_salary": CPF_MIN_CONTRIBUTION_SALARY,
            },
            "sdl": {
                "rate": f"{SDL_RATE * 100}%",
                "min": SDL_MIN,
                "max": SDL_MAX,
            },
            "supported_currencies": list(EXCHANGE_RATES.keys()),
        }
