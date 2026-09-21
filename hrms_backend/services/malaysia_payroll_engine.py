"""
Malaysia Payroll Calculation Engine
Implements EPF (KWSP), SOCSO (PERKESO), EIS (SIP), PCB (LHDN), and HRDF calculations
Compliant with 2024-2026 Malaysian payroll regulations
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Optional


class MaritalStatus(Enum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"


class Gender(Enum):
    MALE = "male"
    FEMALE = "female"


class Nationality(Enum):
    MALAYSIAN = "malaysian"
    PR = "pr"
    FOREIGNER = "foreigner"


@dataclass
class EPFResult:
    employee_contribution: Decimal
    employer_contribution: Decimal
    account_1: Decimal
    account_2: Decimal
    total_contribution: Decimal
    employee_rate: Decimal
    employer_rate: Decimal


@dataclass
class SOCSOResult:
    employee_contribution: Decimal
    employer_contribution: Decimal
    total_contribution: Decimal
    employment_injury_coverage: Decimal
    invalidity_pension_coverage: Decimal
    confinement_benefit: Decimal


@dataclass
class EISResult:
    employee_contribution: Decimal
    employer_contribution: Decimal
    total_contribution: Decimal


@dataclass
class PCBResult:
    annual_tax: Decimal
    monthly_pcb: Decimal
    chargeable_income: Decimal
    effective_rate: Decimal
    breakdown: list = field(default_factory=list)


@dataclass
class HRDFResult:
    hrdf_amount: Decimal
    is_eligible: bool
    rate: Decimal
    employee_count: int


@dataclass
class EAFormData:
    employee_name: str
    employee_id: str
    ic_number: str
    tax_year: int
    total_remuneration: Decimal
    epf_contribution: Decimal
    socso_contribution: Decimal
    eis_contribution: Decimal
    pcb_deduction: Decimal
    employer_epf_contribution: Decimal
    employer_socso_contribution: Decimal
    employer_eis_contribution: Decimal


class Currency(Enum):
    MYR = "MYR"
    USD = "USD"
    SGD = "SGD"


EXCHANGE_RATES = {
    Currency.MYR: Decimal("1.0"),
    Currency.USD: Decimal("0.215"),
    Currency.SGD: Decimal("0.29"),
}


class MalaysiaPayrollEngine:
    EPF_EMPLOYEE_RATE = Decimal("0.11")
    EPF_EMPLOYER_RATE_HIGH_WAGES = Decimal("0.12")
    EPF_EMPLOYER_RATE_LOW_WAGES = Decimal("0.13")
    EPF_EMPLOYER_RATE_SENIOR = Decimal("0.045")
    EPF_LOW_WAGES_THRESHOLD = Decimal("5000")
    EPF_HIGH_WAGES_THRESHOLD = Decimal("10000")
    EPF_ACCOUNT_1_RATIO = Decimal("0.75")
    EPF_ACCOUNT_2_RATIO = Decimal("0.25")
    EPF_LIFE_INSURANCE_LIMIT = Decimal("7000")
    EPF_ANNUAL_RELIEF = Decimal("4000")

    SOCSO_RATES = [
        (Decimal("5000"), Decimal("0.005"), Decimal("0.0175")),
        (Decimal("10000"), Decimal("0.005"), Decimal("0.0175")),
    ]
    SOCSO_EMPLOYMENT_INJURY_COVERAGE = Decimal("0.85")
    SOCSO_INVALIDITY_PENSION_COVERAGE = Decimal("0.50")
    SOCSO_CONFINEMENT_BENEFIT = Decimal("200")

    EIS_EMPLOYEE_RATE = Decimal("0.002")
    EIS_EMPLOYER_RATE = Decimal("0.002")
    EIS_MAX_BENEFIT_RATE = Decimal("0.80")
    EIS_MAX_MONTHS = 6

    MINIMUM_WAGE = Decimal("1500")

    OVERTIME_NORMAL = Decimal("1.5")
    OVERTIME_REST_DAY = Decimal("2.0")
    OVERTIME_PUBLIC_HOLIDAY = Decimal("3.0")

    ANNUAL_LEAVE = {
        "1-2_years": 8,
        "2-5_years": 12,
        "5+_years": 16,
    }

    SICK_LEAVE = {
        "1-2_years": 14,
        "2-5_years": 18,
        "5+_years": 22,
    }

    PUBLIC_HOLIDAYS = 12

    HRDF_RATE = Decimal("0.01")
    HRDF_MIN_MALAYSIAN_EMPLOYEES = 10

    TAX_BRACKETS_2024 = [
        (Decimal("5000"), Decimal("0.00")),
        (Decimal("20000"), Decimal("0.01")),
        (Decimal("35000"), Decimal("0.03")),
        (Decimal("50000"), Decimal("0.08")),
        (Decimal("70000"), Decimal("0.13")),
        (Decimal("100000"), Decimal("0.21")),
        (Decimal("150000"), Decimal("0.24")),
        (Decimal("250000"), Decimal("0.245")),
        (Decimal("400000"), Decimal("0.25")),
        (Decimal("600000"), Decimal("0.26")),
        (Decimal("1000000"), Decimal("0.28")),
        (Decimal("2000000"), Decimal("0.30")),
    ]

    CUKAI_MAKLUMAT_RATE = Decimal("0.02")
    LIFESTYLE_DEDUCTION = Decimal("2500")

    def _to_decimal(self, value) -> Decimal:
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))

    def _round_to_cents(self, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def _convert_currency(
        self, amount: Decimal, from_currency: Currency, to_currency: Currency
    ) -> Decimal:
        if from_currency == to_currency:
            return amount
        amount_in_myr = amount / EXCHANGE_RATES[from_currency]
        return amount_in_myr * EXCHANGE_RATES[to_currency]

    def _get_epf_employer_rate(
        self, monthly_wages: Decimal, age: int
    ) -> Decimal:
        if age > 60:
            return self.EPF_EMPLOYER_RATE_SENIOR
        if monthly_wages <= self.EPF_LOW_WAGES_THRESHOLD:
            return self.EPF_EMPLOYER_RATE_LOW_WAGES
        return self.EPF_EMPLOYER_RATE_HIGH_WAGES

    def _get_socso_rates(
        self, monthly_wages: Decimal
    ) -> tuple[Decimal, Decimal]:
        employee_rate = Decimal("0")
        employer_rate = Decimal("0")
        for threshold, e_rate, er_rate in self.SOCSO_RATES:
            if monthly_wages <= threshold:
                employee_rate = e_rate
                employer_rate = er_rate
                break
        return employee_rate, employer_rate

    def _calculate_tax(
        self, chargeable_income: Decimal
    ) -> tuple[Decimal, list]:
        tax = Decimal("0")
        breakdown = []
        previous_limit = Decimal("0")

        for bracket_limit, rate in self.TAX_BRACKETS_2024:
            taxable_in_bracket = min(chargeable_income, bracket_limit) - previous_limit
            if taxable_in_bracket > 0:
                bracket_tax = taxable_in_bracket * rate
                tax += bracket_tax
                breakdown.append(
                    {
                        "range": f"RM{previous_limit + 1:,.0f} - RM{bracket_limit:,.0f}",
                        "rate": f"{rate * 100}%",
                        "taxable": self._round_to_cents(taxable_in_bracket),
                        "tax": self._round_to_cents(bracket_tax),
                    }
                )
            previous_limit = bracket_limit

        if chargeable_income > self.TAX_BRACKETS_2024[-1][0]:
            excess = chargeable_income - self.TAX_BRACKETS_2024[-1][0]
            excess_tax = excess * Decimal("0.02")
            tax += excess_tax
            breakdown.append(
                {
                    "range": f"RM{self.TAX_BRACKETS_2024[-1][0] + 1:,.0f}+",
                    "rate": "2% (excess)",
                    "taxable": self._round_to_cents(excess),
                    "tax": self._round_to_cents(excess_tax),
                }
            )

        return self._round_to_cents(tax), breakdown

    def calculate_epf(
        self,
        basic: float | Decimal,
        is_malaysian: bool = True,
        age: int = 30,
        opt_zero_rate: bool = False,
    ) -> EPFResult:
        """
        Calculate EPF (KWSP) contributions for employees and employers.

        Args:
            basic: Monthly basic wages
            is_malaysian: True for Malaysian/PR, False for foreign employees
            age: Employee age in years
            opt_zero_rate: True if employee opted for 0% (only for wages > RM10,000)

        Returns:
            EPFResult with contribution details
        """
        basic = self._to_decimal(basic)

        if not is_malaysian:
            employee_contribution = Decimal("0")
            employee_rate = Decimal("0")
            employer_contribution = self._round_to_cents(
                basic * self.EPF_EMPLOYER_RATE_LOW_WAGES
            )
            employer_rate = self.EPF_EMPLOYER_RATE_LOW_WAGES
        else:
            if opt_zero_rate and basic > self.EPF_HIGH_WAGES_THRESHOLD:
                employee_contribution = Decimal("0")
                employee_rate = Decimal("0")
            else:
                employee_rate = self.EPF_EMPLOYEE_RATE
                employee_contribution = self._round_to_cents(
                    basic * self.EPF_EMPLOYEE_RATE
                )

            employer_rate = self._get_epf_employer_rate(basic, age)
            employer_contribution = self._round_to_cents(basic * employer_rate)

        account_1 = self._round_to_cents(
            employee_contribution * self.EPF_ACCOUNT_1_RATIO
        )
        account_2 = self._round_to_cents(
            employee_contribution * self.EPF_ACCOUNT_2_RATIO
        )

        total_contribution = employee_contribution + employer_contribution

        return EPFResult(
            employee_contribution=employee_contribution,
            employer_contribution=employer_contribution,
            account_1=account_1,
            account_2=account_2,
            total_contribution=total_contribution,
            employee_rate=employee_rate,
            employer_rate=employer_rate,
        )

    def calculate_socso(
        self, basic_monthly: float | Decimal
    ) -> SOCSOResult:
        """
        Calculate SOCSO (PERKESO) contributions.

        Args:
            basic_monthly: Monthly basic wages

        Returns:
            SOCSOResult with contribution details
        """
        basic_monthly = self._to_decimal(basic_monthly)

        employee_rate, employer_rate = self._get_socso_rates(basic_monthly)
        employee_contribution = self._round_to_cents(
            basic_monthly * employee_rate
        )
        employer_contribution = self._round_to_cents(
            basic_monthly * employer_rate
        )

        total_contribution = employee_contribution + employer_contribution

        employment_injury_coverage = self._round_to_cents(
            basic_monthly * self.SOCSO_EMPLOYMENT_INJURY_COVERAGE
        )
        invalidity_pension_coverage = self._round_to_cents(
            basic_monthly * self.SOCSO_INVALIDITY_PENSION_COVERAGE
        )

        return SOCSOResult(
            employee_contribution=employee_contribution,
            employer_contribution=employer_contribution,
            total_contribution=total_contribution,
            employment_injury_coverage=employment_injury_coverage,
            invalidity_pension_coverage=invalidity_pension_coverage,
            confinement_benefit=self.SOCSO_CONFINEMENT_BENEFIT,
        )

    def calculate_eis(
        self, basic_monthly: float | Decimal
    ) -> EISResult:
        """
        Calculate EIS (SIP) contributions.

        Args:
            basic_monthly: Monthly basic wages

        Returns:
            EISResult with contribution details
        """
        basic_monthly = self._to_decimal(basic_monthly)

        employee_contribution = self._round_to_cents(
            basic_monthly * self.EIS_EMPLOYEE_RATE
        )
        employer_contribution = self._round_to_cents(
            basic_monthly * self.EIS_EMPLOYER_RATE
        )

        total_contribution = employee_contribution + employer_contribution

        return EISResult(
            employee_contribution=employee_contribution,
            employer_contribution=employer_contribution,
            total_contribution=total_contribution,
        )

    def calculate_pcb(
        self,
        annual_income: float | Decimal,
        epf_paid: float | Decimal,
        marital_status: str = "single",
        children: int = 0,
    ) -> PCBResult:
        """
        Calculate PCB (Potongan Cukai Bulanan) - Monthly Tax Deduction.

        Args:
            annual_income: Total annual income
            epf_paid: Total EPF paid by employee in the year
            marital_status: 'single', 'married', or 'divorced'
            children: Number of children (for married)

        Returns:
            PCBResult with tax calculation details
        """
        annual_income = self._to_decimal(annual_income)
        epf_paid = self._to_decimal(epf_paid)

        epf_relief = min(epf_paid, self.EPF_ANNUAL_RELIEF)

        chargeable_income = annual_income - epf_relief - self.LIFESTYLE_DEDUCTION

        if chargeable_income < 0:
            chargeable_income = Decimal("0")

        annual_tax, breakdown = self._calculate_tax(chargeable_income)

        annual_tax_with_cukai = annual_tax * (1 + self.CUKAI_MAKLUMAT_RATE)
        annual_tax_with_cukai = self._round_to_cents(annual_tax_with_cukai)

        monthly_pcb = self._round_to_cents(annual_tax_with_cukai / 12)

        effective_rate = (
            (annual_tax_with_cukai / annual_income * 100)
            if annual_income > 0
            else Decimal("0")
        )

        return PCBResult(
            annual_tax=annual_tax_with_cukai,
            monthly_pcb=monthly_pcb,
            chargeable_income=chargeable_income,
            effective_rate=self._round_to_cents(effective_rate),
            breakdown=breakdown,
        )

    def calculate_hrdf(
        self, total_payroll_malaysian: float | Decimal, employee_count: int
    ) -> HRDFResult:
        """
        Calculate HRDF (HRD Corp) levy.

        Args:
            total_payroll_malaysian: Total payroll for Malaysian employees
            employee_count: Number of Malaysian employees

        Returns:
            HRDFResult with levy details
        """
        total_payroll_malaysian = self._to_decimal(total_payroll_malaysian)

        is_eligible = employee_count >= self.HRDF_MIN_MALAYSIAN_EMPLOYEES
        rate = self.HRDF_RATE if is_eligible else Decimal("0")

        hrdf_amount = self._round_to_cents(total_payroll_malaysian * rate)

        return HRDFResult(
            hrdf_amount=hrdf_amount,
            is_eligible=is_eligible,
            rate=rate,
            employee_count=employee_count,
        )

    def calculate_ea_form(
        self,
        payroll_data: dict,
        tax_year: int,
    ) -> EAFormData:
        """
        Generate EA Form data for annual tax reporting.

        Args:
            payroll_data: Dictionary with monthly payroll data
                - employee_name: str
                - employee_id: str
                - ic_number: str
                - monthly_remunerations: list of Decimal
                - epf_employee_paid: list of Decimal
                - epf_employer_paid: list of Decimal
                - socso_employee_paid: list of Decimal
                - socso_employer_paid: list of Decimal
                - eis_employee_paid: list of Decimal
                - eis_employer_paid: list of Decimal
                - pcb_deductions: list of Decimal
            tax_year: Tax year (e.g. 2024)

        Returns:
            EAFormData with annual summary
        """
        monthly_remunerations = payroll_data.get("monthly_remunerations", [])
        epf_employee_paid = payroll_data.get("epf_employee_paid", [])
        epf_employer_paid = payroll_data.get("epf_employer_paid", [])
        socso_employee_paid = payroll_data.get("socso_employee_paid", [])
        socso_employer_paid = payroll_data.get("socso_employer_paid", [])
        eis_employee_paid = payroll_data.get("eis_employee_paid", [])
        eis_employer_paid = payroll_data.get("eis_employer_paid", [])
        pcb_deductions = payroll_data.get("pcb_deductions", [])

        total_remuneration = self._round_to_cents(
            sum(self._to_decimal(x) for x in monthly_remunerations)
        )
        epf_contribution = self._round_to_cents(
            sum(self._to_decimal(x) for x in epf_employee_paid)
        )
        socso_contribution = self._round_to_cents(
            sum(self._to_decimal(x) for x in socso_employee_paid)
        )
        eis_contribution = self._round_to_cents(
            sum(self._to_decimal(x) for x in eis_employee_paid)
        )
        pcb_deduction = self._round_to_cents(
            sum(self._to_decimal(x) for x in pcb_deductions)
        )
        employer_epf = self._round_to_cents(
            sum(self._to_decimal(x) for x in epf_employer_paid)
        )
        employer_socso = self._round_to_cents(
            sum(self._to_decimal(x) for x in socso_employer_paid)
        )
        employer_eis = self._round_to_cents(
            sum(self._to_decimal(x) for x in eis_employer_paid)
        )

        return EAFormData(
            employee_name=payroll_data.get("employee_name", ""),
            employee_id=payroll_data.get("employee_id", ""),
            ic_number=payroll_data.get("ic_number", ""),
            tax_year=tax_year,
            total_remuneration=total_remuneration,
            epf_contribution=epf_contribution,
            socso_contribution=socso_contribution,
            eis_contribution=eis_contribution,
            pcb_deduction=pcb_deduction,
            employer_epf_contribution=employer_epf,
            employer_socso_contribution=employer_socso,
            employer_eis_contribution=employer_eis,
        )

    def calculate_overtime(
        self,
        hourly_rate: float | Decimal,
        hours_worked: float | Decimal,
        day_type: str = "normal",
    ) -> Decimal:
        """
        Calculate overtime pay.

        Args:
            hourly_rate: Employee hourly rate
            hours_worked: Number of overtime hours
            day_type: 'normal', 'rest_day', or 'public_holiday'

        Returns:
            Overtime pay amount
        """
        hourly_rate = self._to_decimal(hourly_rate)
        hours_worked = self._to_decimal(hours_worked)

        multipliers = {
            "normal": self.OVERTIME_NORMAL,
            "rest_day": self.OVERTIME_REST_DAY,
            "public_holiday": self.OVERTIME_PUBLIC_HOLIDAY,
        }

        multiplier = multipliers.get(day_type, self.OVERTIME_NORMAL)
        overtime_pay = self._round_to_cents(hourly_rate * hours_worked * multiplier)

        return overtime_pay

    def get_annual_leave_days(self, years_of_service: int) -> int:
        if years_of_service < 2:
            return self.ANNUAL_LEAVE["1-2_years"]
        elif years_of_service < 5:
            return self.ANNUAL_LEAVE["2-5_years"]
        return self.ANNUAL_LEAVE["5+_years"]

    def get_sick_leave_days(self, years_of_service: int) -> int:
        if years_of_service < 2:
            return self.SICK_LEAVE["1-2_years"]
        elif years_of_service < 5:
            return self.SICK_LEAVE["2-5_years"]
        return self.SICK_LEAVE["5+_years"]

    def calculate_full_payroll(
        self,
        basic: float | Decimal,
        allowance: float | Decimal = 0,
        epf_opt_zero: bool = False,
        marital_status: str = "single",
        children: int = 0,
        currency: Currency = Currency.MYR,
    ) -> dict:
        """
        Calculate complete Malaysia payroll for an employee.

        Returns:
            Dictionary with all payroll components
        """
        basic = self._to_decimal(basic)
        allowance = self._to_decimal(allowance)
        total_gross = basic + allowance

        epf_result = self.calculate_epf(basic, epf_opt_zero=epf_opt_zero)
        socso_result = self.calculate_socso(basic)
        eis_result = self.calculate_eis(basic)

        annual_gross = total_gross * 12
        pcb_result = self.calculate_pcb(
            annual_gross, epf_result.employee_contribution * 12, marital_status, children
        )

        total_employee_deductions = (
            epf_result.employee_contribution
            + socso_result.employee_contribution
            + eis_result.employee_contribution
            + pcb_result.monthly_pcb
        )

        total_employer_cost = (
            epf_result.employer_contribution
            + socso_result.employer_contribution
            + eis_result.employer_contribution
        )

        net_salary = total_gross - total_employee_deductions

        result = {
            "basic": basic,
            "allowance": allowance,
            "total_gross": total_gross,
            "currency": currency.value,
            "epf": {
                "employee": epf_result.employee_contribution,
                "employer": epf_result.employer_contribution,
                "account_1": epf_result.account_1,
                "account_2": epf_result.account_2,
                "employee_rate": epf_result.employee_rate,
                "employer_rate": epf_result.employer_rate,
            },
            "socso": {
                "employee": socso_result.employee_contribution,
                "employer": socso_result.employer_contribution,
                "employment_injury_coverage": socso_result.employment_injury_coverage,
                "invalidity_pension_coverage": socso_result.invalidity_pension_coverage,
            },
            "eis": {
                "employee": eis_result.employee_contribution,
                "employer": eis_result.employer_contribution,
            },
            "pcb": {
                "monthly": pcb_result.monthly_pcb,
                "annual": pcb_result.annual_tax,
                "chargeable_income": pcb_result.chargeable_income,
                "effective_rate": pcb_result.effective_rate,
                "breakdown": pcb_result.breakdown,
            },
            "total_employee_deductions": total_employee_deductions,
            "total_employer_cost": total_employer_cost,
            "net_salary": net_salary,
        }

        if currency != Currency.MYR:
            result["converted_gross"] = self._convert_currency(
                total_gross, Currency.MYR, currency
            )
            result["converted_net"] = self._convert_currency(
                net_salary, Currency.MYR, currency
            )

        return result


if __name__ == "__main__":
    engine = MalaysiaPayrollEngine()
    payroll = engine.calculate_full_payroll(
        basic=5000, allowance=1000, marital_status="single"
    )
    for key, value in payroll.items():
        print(f"{key}: {value}")
