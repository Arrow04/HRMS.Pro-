"""
US Payroll Calculation Engine
Enterprise HRMS - Federal, State, and FICA Tax Calculations
Supports tax years 2024-2026 with W-4 withholding methods.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class FilingStatus(Enum):
    SINGLE = "single"
    MARRIED_FILING_JOINTLY = "married_filing_jointly"
    MARRIED_FILING_SEPARATELY = "married_filing_separately"
    HEAD_OF_HOUSEHOLD = "head_of_household"
    QUALIFYING_SURVIVING_SPOUSE = "qualifying_surviving_spouse"


class PayFrequency(Enum):
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    SEMIMONTHLY = "semimonthly"
    MONTHLY = "monthly"


class W4Version(Enum):
    PRE_2020 = "pre_2020"
    POST_2020 = "post_2020"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class W4Data:
    version: W4Version = W4Version.POST_2020
    filing_status: FilingStatus = FilingStatus.SINGLE
    # Step 2 checkboxes (post-2020)
    step2a: bool = False  # Multiple jobs or spouse works
    step2b: bool = False  # Use higher withholding rates (checkbox c)
    step2c: bool = False  # Checkbox c only
    # Step 3 – Claim dependents
    dependent_amount: Decimal = Decimal("0")
    # Step 4 – Other adjustments
    other_income: Decimal = Decimal("0")
    deductions: Decimal = Decimal("0")
    extra_withholding: Decimal = Decimal("0")
    # Step 5
    exempt: bool = False

    # Pre-2020 fields
    allowances: int = 0


@dataclass
class PayrollResult:
    gross_pay: Decimal
    federal_tax: Decimal
    state_tax: Decimal
    state_name: str
    ss_employee: Decimal
    ss_employer: Decimal
    medicare_employee: Decimal
    medicare_employer: Decimal
    additional_medicare: Decimal
    futa: Decimal
    suta: Decimal
    workers_comp: Decimal
    total_deductions: Decimal = Decimal("0")
    net_pay: Decimal = Decimal("0")
    ytd_gross: Decimal = Decimal("0")
    ytd_federal: Decimal = Decimal("0")
    ytd_ss: Decimal = Decimal("0")
    ytd_medicare: Decimal = Decimal("0")
    details: Dict[str, Any] = field(default_factory=dict)

    def compute_net(self) -> None:
        self.total_deductions = (
            self.federal_tax
            + self.state_tax
            + self.ss_employee
            + self.medicare_employee
            + self.additional_medicare
        )
        self.net_pay = self.gross_pay - self.total_deductions


@dataclass
class W2Data:
    employer_ein: str
    employee_ssn: str
    employee_name: str
    employer_name: str
    employer_address: str = ""
    employee_address: str = ""
    state: str = ""
    # Box 1 – Wages, tips, other compensation
    wages: Decimal = Decimal("0")
    # Box 2 – Federal income tax withheld
    federal_tax_withheld: Decimal = Decimal("0")
    # Box 3 – Social Security wages
    social_security_wages: Decimal = Decimal("0")
    # Box 4 – Social Security tax withheld
    social_security_tax: Decimal = Decimal("0")
    # Box 5 – Medicare wages and tips
    medicare_wages: Decimal = Decimal("0")
    # Box 6 – Medicare tax withheld
    medicare_tax: Decimal = Decimal("0")
    # Box 12 – Codes
    box12: Dict[str, Decimal] = field(default_factory=dict)
    # Box 13
    statutory_employee: bool = False
    retirement_plan: bool = False
    third_party_sick_pay: bool = False
    # Box 14 – Other
    other: Dict[str, Decimal] = field(default_factory=dict)
    # Box 15-20 – State info
    state_wages: Decimal = Decimal("0")
    state_tax_withheld: Decimal = Decimal("0")
    local_wages: Decimal = Decimal("0")
    local_tax_withheld: Decimal = Decimal("0")
    locality_name: str = ""


# ---------------------------------------------------------------------------
# Currency helpers
# ---------------------------------------------------------------------------

class CurrencyConverter:
    """Simple multi-currency support for payroll display purposes."""

    RATES: Dict[str, Decimal] = {
        "USD": Decimal("1.0000"),
        "CAD": Decimal("1.3650"),
        "GBP": Decimal("0.7920"),
        "EUR": Decimal("0.9215"),
    }

    @classmethod
    def convert(cls, amount: Decimal, from_currency: str, to_currency: str) -> Decimal:
        from_currency = from_currency.upper()
        to_currency = to_currency.upper()
        if from_currency == to_currency:
            return amount
        if from_currency not in cls.RATES or to_currency not in cls.RATES:
            raise ValueError(f"Unsupported currency: {from_currency} or {to_currency}")
        usd_amount = amount / cls.RATES[from_currency]
        converted = usd_amount * cls.RATES[to_currency]
        return converted.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Tax bracket tables
# ---------------------------------------------------------------------------

# 2024 Federal Income Tax Brackets
# Key: filing_status -> list of (upper_limit, rate)
# The last bracket upper is effectively infinity.

FEDERAL_BRACKETS_2024: Dict[FilingStatus, List[Tuple[Decimal, Decimal]]] = {
    FilingStatus.SINGLE: [
        (Decimal("11600"), Decimal("0.10")),
        (Decimal("47150"), Decimal("0.12")),
        (Decimal("100525"), Decimal("0.22")),
        (Decimal("191950"), Decimal("0.24")),
        (Decimal("243725"), Decimal("0.32")),
        (Decimal("609350"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.MARRIED_FILING_JOINTLY: [
        (Decimal("23200"), Decimal("0.10")),
        (Decimal("94300"), Decimal("0.12")),
        (Decimal("201050"), Decimal("0.22")),
        (Decimal("383900"), Decimal("0.24")),
        (Decimal("487450"), Decimal("0.32")),
        (Decimal("731200"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.HEAD_OF_HOUSEHOLD: [
        (Decimal("16550"), Decimal("0.10")),
        (Decimal("63100"), Decimal("0.12")),
        (Decimal("100500"), Decimal("0.22")),
        (Decimal("191950"), Decimal("0.24")),
        (Decimal("243700"), Decimal("0.32")),
        (Decimal("609350"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.MARRIED_FILING_SEPARATELY: [
        (Decimal("11600"), Decimal("0.10")),
        (Decimal("47150"), Decimal("0.12")),
        (Decimal("100525"), Decimal("0.22")),
        (Decimal("191950"), Decimal("0.24")),
        (Decimal("243725"), Decimal("0.32")),
        (Decimal("365600"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.QUALIFYING_SURVIVING_SPOUSE: [
        (Decimal("23200"), Decimal("0.10")),
        (Decimal("94300"), Decimal("0.12")),
        (Decimal("201050"), Decimal("0.22")),
        (Decimal("383900"), Decimal("0.24")),
        (Decimal("487450"), Decimal("0.32")),
        (Decimal("731200"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
}

# 2025 Estimated Federal Brackets (inflation-adjusted estimates)
FEDERAL_BRACKETS_2025: Dict[FilingStatus, List[Tuple[Decimal, Decimal]]] = {
    FilingStatus.SINGLE: [
        (Decimal("11925"), Decimal("0.10")),
        (Decimal("48475"), Decimal("0.12")),
        (Decimal("103350"), Decimal("0.22")),
        (Decimal("197300"), Decimal("0.24")),
        (Decimal("250525"), Decimal("0.32")),
        (Decimal("626350"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.MARRIED_FILING_JOINTLY: [
        (Decimal("23850"), Decimal("0.10")),
        (Decimal("96950"), Decimal("0.12")),
        (Decimal("206700"), Decimal("0.22")),
        (Decimal("394600"), Decimal("0.24")),
        (Decimal("501050"), Decimal("0.32")),
        (Decimal("751600"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.HEAD_OF_HOUSEHOLD: [
        (Decimal("17000"), Decimal("0.10")),
        (Decimal("64850"), Decimal("0.12")),
        (Decimal("103350"), Decimal("0.22")),
        (Decimal("197300"), Decimal("0.24")),
        (Decimal("250500"), Decimal("0.32")),
        (Decimal("626350"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.MARRIED_FILING_SEPARATELY: [
        (Decimal("11925"), Decimal("0.10")),
        (Decimal("48475"), Decimal("0.12")),
        (Decimal("103350"), Decimal("0.22")),
        (Decimal("197300"), Decimal("0.24")),
        (Decimal("250525"), Decimal("0.32")),
        (Decimal("375800"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.QUALIFYING_SURVIVING_SPOUSE: [
        (Decimal("23850"), Decimal("0.10")),
        (Decimal("96950"), Decimal("0.12")),
        (Decimal("206700"), Decimal("0.22")),
        (Decimal("394600"), Decimal("0.24")),
        (Decimal("501050"), Decimal("0.32")),
        (Decimal("751600"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
}

# 2026 Estimated Federal Brackets
FEDERAL_BRACKETS_2026: Dict[FilingStatus, List[Tuple[Decimal, Decimal]]] = {
    FilingStatus.SINGLE: [
        (Decimal("12200"), Decimal("0.10")),
        (Decimal("49550"), Decimal("0.12")),
        (Decimal("105650"), Decimal("0.22")),
        (Decimal("201700"), Decimal("0.24")),
        (Decimal("256050"), Decimal("0.32")),
        (Decimal("640150"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.MARRIED_FILING_JOINTLY: [
        (Decimal("24400"), Decimal("0.10")),
        (Decimal("99100"), Decimal("0.12")),
        (Decimal("211300"), Decimal("0.22")),
        (Decimal("403400"), Decimal("0.24")),
        (Decimal("512100"), Decimal("0.32")),
        (Decimal("768300"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.HEAD_OF_HOUSEHOLD: [
        (Decimal("17400"), Decimal("0.10")),
        (Decimal("66400"), Decimal("0.12")),
        (Decimal("105650"), Decimal("0.22")),
        (Decimal("201700"), Decimal("0.24")),
        (Decimal("256050"), Decimal("0.32")),
        (Decimal("640150"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.MARRIED_FILING_SEPARATELY: [
        (Decimal("12200"), Decimal("0.10")),
        (Decimal("49550"), Decimal("0.12")),
        (Decimal("105650"), Decimal("0.22")),
        (Decimal("201700"), Decimal("0.24")),
        (Decimal("256050"), Decimal("0.32")),
        (Decimal("384150"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
    FilingStatus.QUALIFYING_SURVIVING_SPOUSE: [
        (Decimal("24400"), Decimal("0.10")),
        (Decimal("99100"), Decimal("0.12")),
        (Decimal("211300"), Decimal("0.22")),
        (Decimal("403400"), Decimal("0.24")),
        (Decimal("512100"), Decimal("0.32")),
        (Decimal("768300"), Decimal("0.35")),
        (Decimal("999999999"), Decimal("0.37")),
    ],
}


# ---------------------------------------------------------------------------
# Standard deductions by year
# ---------------------------------------------------------------------------

STANDARD_DEDUCTIONS: Dict[int, Dict[FilingStatus, Decimal]] = {
    2024: {
        FilingStatus.SINGLE: Decimal("14600"),
        FilingStatus.MARRIED_FILING_JOINTLY: Decimal("29200"),
        FilingStatus.MARRIED_FILING_SEPARATELY: Decimal("14600"),
        FilingStatus.HEAD_OF_HOUSEHOLD: Decimal("21900"),
        FilingStatus.QUALIFYING_SURVIVING_SPOUSE: Decimal("29200"),
    },
    2025: {
        FilingStatus.SINGLE: Decimal("15000"),
        FilingStatus.MARRIED_FILING_JOINTLY: Decimal("30000"),
        FilingStatus.MARRIED_FILING_SEPARATELY: Decimal("15000"),
        FilingStatus.HEAD_OF_HOUSEHOLD: Decimal("22500"),
        FilingStatus.QUALIFYING_SURVIVING_SPOUSE: Decimal("30000"),
    },
    2026: {
        FilingStatus.SINGLE: Decimal("15400"),
        FilingStatus.MARRIED_FILING_JOINTLY: Decimal("30800"),
        FilingStatus.MARRIED_FILING_SEPARATELY: Decimal("15400"),
        FilingStatus.HEAD_OF_HOUSEHOLD: Decimal("23100"),
        FilingStatus.QUALIFYING_SURVIVING_SPOUSE: Decimal("30800"),
    },
}


# ---------------------------------------------------------------------------
# FICA rates
# ---------------------------------------------------------------------------

class FICARates:
    SOCIAL_SECURITY_RATE = Decimal("0.062")
    SOCIAL_SECURITY_CAP_2024 = Decimal("168600")
    SOCIAL_SECURITY_CAP_2025 = Decimal("176100")
    SOCIAL_SECURITY_CAP_2026 = Decimal("183000")
    MEDICARE_RATE = Decimal("0.0145")
    ADDITIONAL_MEDICARE_THRESHOLD = Decimal("200000")
    ADDITIONAL_MEDICARE_RATE = Decimal("0.009")

    @classmethod
    def ss_cap(cls, year: int) -> Decimal:
        caps = {2024: cls.SOCIAL_SECURITY_CAP_2024, 2025: cls.SOCIAL_SECURITY_CAP_2025, 2026: cls.SOCIAL_SECURITY_CAP_2026}
        return caps.get(year, cls.SOCIAL_SECURITY_CAP_2024)


# ---------------------------------------------------------------------------
# FUTA / SUTA
# ---------------------------------------------------------------------------

class FUTARates:
    GROSS_RATE = Decimal("0.06")
    CREDIT_RATE = Decimal("0.054")
    NET_RATE = Decimal("0.006")
    WAGE_BASE = Decimal("7000")


class SUTARates:
    """Default SUTA rates – actual rates vary by state and employer experience rating."""
    DEFAULT_RATE = Decimal("0.027")
    WAGE_BASE: Dict[str, Decimal] = {
        "AL": Decimal("8000"), "AK": Decimal("40900"), "AZ": Decimal("8000"),
        "AR": Decimal("10000"), "CA": Decimal("7000"), "CO": Decimal("17300"),
        "CT": Decimal("16000"), "DE": Decimal("16500"), "FL": Decimal("7000"),
        "GA": Decimal("9500"), "HI": Decimal("52600"), "ID": Decimal("52700"),
        "IL": Decimal("13271"), "IN": Decimal("9500"), "IA": Decimal("38200"),
        "KS": Decimal("14000"), "KY": Decimal("11100"), "LA": Decimal("7700"),
        "ME": Decimal("12000"), "MD": Decimal("9000"), "MA": Decimal("17500"),
        "MI": Decimal("9000"), "MN": Decimal("40000"), "MS": Decimal("14000"),
        "MO": Decimal("10500"), "MT": Decimal("37900"), "NE": Decimal("9000"),
        "NV": Decimal("36400"), "NH": Decimal("9000"), "NJ": Decimal("40700"),
        "NM": Decimal("27500"), "NY": Decimal("12000"), "NC": Decimal("27600"),
        "ND": Decimal("42200"), "OH": Decimal("9000"), "OK": Decimal("24400"),
        "OR": Decimal("47500"), "PA": Decimal("10000"), "RI": Decimal("28600"),
        "SC": Decimal("10000"), "SD": Decimal("17500"), "TN": Decimal("9000"),
        "TX": Decimal("9000"), "UT": Decimal("43300"), "VT": Decimal("11700"),
        "VA": Decimal("8000"), "WA": Decimal("68700"), "WV": Decimal("12000"),
        "WI": Decimal("16400"), "WY": Decimal("30400"),
        "DC": Decimal("9000"),
    }


# ---------------------------------------------------------------------------
# State income tax – simplified approximation tables
# These are flat / marginal approximations for payroll withholding.
# In production, integrate with a tax data provider (e.g., Sovos, Avalara).
# ---------------------------------------------------------------------------

NO_STATE_INCOME_TAX = {"AK", "FL", "NV", "SD", "TX", "WA", "WY"}
NH_ONLY_INCOME = {"NH"}  # NH taxes interest/dividends only

# State tax tables – (threshold, rate) pairs for withholding estimation
# States not listed use a default approximation.
STATE_TAX_TABLES: Dict[str, Dict[str, Any]] = {
    "CA": {
        "brackets": {
            FilingStatus.SINGLE: [
                (Decimal("10412"), Decimal("0.01")),
                (Decimal("24684"), Decimal("0.02")),
                (Decimal("38959"), Decimal("0.04")),
                (Decimal("54081"), Decimal("0.06")),
                (Decimal("68350"), Decimal("0.08")),
                (Decimal("349137"), Decimal("0.093")),
                (Decimal("418961"), Decimal("0.103")),
                (Decimal("698271"), Decimal("0.113")),
                (Decimal("1000000"), Decimal("0.123")),
                (Decimal("999999999"), Decimal("0.133")),
            ],
            FilingStatus.MARRIED_FILING_JOINTLY: [
                (Decimal("20824"), Decimal("0.01")),
                (Decimal("49368"), Decimal("0.02")),
                (Decimal("77918"), Decimal("0.04")),
                (Decimal("108162"), Decimal("0.06")),
                (Decimal("136700"), Decimal("0.08")),
                (Decimal("698274"), Decimal("0.093")),
                (Decimal("837922"), Decimal("0.103")),
                (Decimal("1396542"), Decimal("0.113")),
                (Decimal("2000000"), Decimal("0.123")),
                (Decimal("999999999"), Decimal("0.133")),
            ],
            FilingStatus.HEAD_OF_HOUSEHOLD: [
                (Decimal("20813"), Decimal("0.01")),
                (Decimal("49367"), Decimal("0.02")),
                (Decimal("63642"), Decimal("0.04")),
                (Decimal("78764"), Decimal("0.06")),
                (Decimal("93033"), Decimal("0.08")),
                (Decimal("474525"), Decimal("0.093")),
                (Decimal("569555"), Decimal("0.103")),
                (Decimal("949133"), Decimal("0.113")),
                (Decimal("1000000"), Decimal("0.123")),
                (Decimal("999999999"), Decimal("0.133")),
            ],
        },
        "standard_deduction": {
            FilingStatus.SINGLE: Decimal("5540"),
            FilingStatus.MARRIED_FILING_JOINTLY: Decimal("11080"),
            FilingStatus.HEAD_OF_HOUSEHOLD: Decimal("11080"),
        },
    },
    "NY": {
        "brackets": {
            FilingStatus.SINGLE: [
                (Decimal("8500"), Decimal("0.04")),
                (Decimal("11700"), Decimal("0.045")),
                (Decimal("13900"), Decimal("0.0525")),
                (Decimal("80650"), Decimal("0.0585")),
                (Decimal("215400"), Decimal("0.0625")),
                (Decimal("1077550"), Decimal("0.0685")),
                (Decimal("5000000"), Decimal("0.0965")),
                (Decimal("25000000"), Decimal("0.103")),
                (Decimal("999999999"), Decimal("0.109")),
            ],
            FilingStatus.MARRIED_FILING_JOINTLY: [
                (Decimal("17150"), Decimal("0.04")),
                (Decimal("23600"), Decimal("0.045")),
                (Decimal("27900"), Decimal("0.0525")),
                (Decimal("161550"), Decimal("0.0585")),
                (Decimal("323200"), Decimal("0.0625")),
                (Decimal("2155350"), Decimal("0.0685")),
                (Decimal("5000000"), Decimal("0.0965")),
                (Decimal("25000000"), Decimal("0.103")),
                (Decimal("999999999"), Decimal("0.109")),
            ],
            FilingStatus.HEAD_OF_HOUSEHOLD: [
                (Decimal("12800"), Decimal("0.04")),
                (Decimal("17650"), Decimal("0.045")),
                (Decimal("20900"), Decimal("0.0525")),
                (Decimal("107650"), Decimal("0.0585")),
                (Decimal("261550"), Decimal("0.0625")),
                (Decimal("1616450"), Decimal("0.0685")),
                (Decimal("5000000"), Decimal("0.0965")),
                (Decimal("25000000"), Decimal("0.103")),
                (Decimal("999999999"), Decimal("0.109")),
            ],
        },
        "standard_deduction": {
            FilingStatus.SINGLE: Decimal("8000"),
            FilingStatus.MARRIED_FILING_JOINTLY: Decimal("16050"),
            FilingStatus.HEAD_OF_HOUSEHOLD: Decimal("11200"),
        },
    },
    "TX": {"brackets": {}, "standard_deduction": {}},  # No state income tax
    "FL": {"brackets": {}, "standard_deduction": {}},
    "WA": {"brackets": {}, "standard_deduction": {}},
    "NV": {"brackets": {}, "standard_deduction": {}},
    "AK": {"brackets": {}, "standard_deduction": {}},
    "SD": {"brackets": {}, "standard_deduction": {}},
    "WY": {"brackets": {}, "standard_deduction": {}},
}

# Simplified flat-rate states for withholding (e.g., states with ~5% flat tax)
FLAT_RATE_STATES: Dict[str, Decimal] = {
    "CO": Decimal("0.044"),
    "IL": Decimal("0.0495"),
    "IN": Decimal("0.0323"),
    "IA": Decimal("0.057"),
    "MI": Decimal("0.0425"),
    "NC": Decimal("0.0475"),
    "PA": Decimal("0.0307"),
}


# ---------------------------------------------------------------------------
# Workers' Compensation rate table (sample – varies heavily by state/industry)
# Rate is per $100 of payroll
# ---------------------------------------------------------------------------

WORKERS_COMP_RATES: Dict[str, Decimal] = {
    "CA": Decimal("2.50"),
    "NY": Decimal("3.10"),
    "TX": Decimal("1.80"),
    "FL": Decimal("1.60"),
    "IL": Decimal("2.20"),
    "PA": Decimal("1.90"),
    "OH": Decimal("1.40"),
    "GA": Decimal("1.70"),
    "NC": Decimal("1.30"),
    "MI": Decimal("2.00"),
    "DEFAULT": Decimal("1.50"),
}


# ---------------------------------------------------------------------------
# Main Engine
# ---------------------------------------------------------------------------

class USPayrollEngine:
    """
    US Payroll Calculation Engine for enterprise HRMS.

    Supports:
    - Federal income tax (percentage method, W-4 2020+ and pre-2020)
    - State income tax (7 no-tax states, progressive, and flat-rate states)
    - FICA (Social Security + Medicare + Additional Medicare)
    - FUTA / SUTA
    - Workers' Compensation estimates
    - W-2 data generation
    - Multi-currency display (USD, CAD, GBP, EUR)
    """

    def __init__(self, tax_year: int = 2024):
        if tax_year not in FEDERAL_BRACKETS_2024:
            tax_year = 2024
        self.tax_year = tax_year
        self._brackets = self._get_federal_brackets(tax_year)

    # ------------------------------------------------------------------
    # Bracket selection
    # ------------------------------------------------------------------

    @staticmethod
    def _get_federal_brackets(year: int) -> Dict[FilingStatus, List[Tuple[Decimal, Decimal]]]:
        if year >= 2026:
            return FEDERAL_BRACKETS_2026
        if year >= 2025:
            return FEDERAL_BRACKETS_2025
        return FEDERAL_BRACKETS_2024

    @staticmethod
    def _get_standard_deduction(year: int, status: FilingStatus) -> Decimal:
        year_data = STANDARD_DEDUCTIONS.get(year, STANDARD_DEDUCTIONS[2024])
        return year_data.get(status, Decimal("14600"))

    # ------------------------------------------------------------------
    # Rounding helper
    # ------------------------------------------------------------------

    @staticmethod
    def _round(amount: Decimal) -> Decimal:
        return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # ------------------------------------------------------------------
    # Federal Income Tax – Percentage Method (post-2020 W-4)
    # ------------------------------------------------------------------

    def _percentage_method_post2020(
        self,
        gross: Decimal,
        w4: W4Data,
        pay_periods: int = 26,
    ) -> Decimal:
        """
        IRS Publication 15-T, percentage method, post-2020 W-4.
        Step 1: Adjust gross pay for the pay period.
        Step 2: Account for Step 2 (higher withholding).
        Step 3: Subtract deductions.
        Step 4: Apply tax brackets.
        Step 5: Add credits / dependent amount.
        """
        status = w4.filing_status

        # Annualized gross
        annual_gross = gross * pay_periods

        # Step 1 – Adjust for filing status (annualized)
        adjusted = annual_gross

        # Step 2 – Multiple jobs / higher withholding
        if w4.step2c:
            # Use married-filing-separately brackets (higher withholding)
            status = FilingStatus.MARRIED_FILING_SEPARATELY

        # Step 3 – Deductions (annualized)
        adjusted = adjusted - w4.deductions

        # Step 4 – Other income (added to wages)
        adjusted = adjusted + w4.other_income

        # Compute taxable income after standard deduction
        std_deduction = self._get_standard_deduction(self.tax_year, status)
        taxable = max(Decimal("0"), adjusted - std_deduction)

        # Apply brackets
        annual_tax = self._compute_tax_from_brackets(taxable, status)

        # Step 4d – Dependent credit (annualized)
        annual_tax = max(Decimal("0"), annual_tax - w4.dependent_amount)

        # Per-period tax
        per_period_tax = annual_tax / pay_periods

        # Extra withholding from Step 4(c)
        per_period_tax = per_period_tax + w4.extra_withholding

        return self._round(max(Decimal("0"), per_period_tax))

    # ------------------------------------------------------------------
    # Federal Income Tax – Percentage Method (pre-2020 W-4)
    # ------------------------------------------------------------------

    def _percentage_method_pre2020(
        self,
        gross: Decimal,
        w4: W4Data,
        pay_periods: int = 26,
    ) -> Decimal:
        """
        Pre-2020 W-4: Adjusted wage amount method using allowances.
        Each allowance reduces the adjusted wage by a fixed amount per pay period.
        """
        status = w4.filing_status

        # 2024 annual allowance value: $4,300
        allowance_value = Decimal("4300")
        total_allowance_reduction = Decimal(w4.allowances) * allowance_value

        annual_gross = gross * pay_periods
        adjusted = annual_gross - total_allowance_reduction

        std_deduction = self._get_standard_deduction(self.tax_year, status)
        taxable = max(Decimal("0"), adjusted - std_deduction)

        annual_tax = self._compute_tax_from_brackets(taxable, status)
        per_period_tax = annual_tax / pay_periods

        return self._round(max(Decimal("0"), per_period_tax))

    # ------------------------------------------------------------------
    # Bracket-based tax computation
    # ------------------------------------------------------------------

    def _compute_tax_from_brackets(
        self,
        taxable_income: Decimal,
        status: FilingStatus,
    ) -> Decimal:
        """Compute tax using progressive brackets for the given filing status."""
        brackets = self._brackets.get(status, self._brackets[FilingStatus.SINGLE])
        tax = Decimal("0")
        prev_upper = Decimal("0")

        for upper, rate in brackets:
            if taxable_income <= prev_upper:
                break
            bracket_income = min(taxable_income, upper) - prev_upper
            tax += bracket_income * rate
            prev_upper = upper

        return self._round(tax)

    # ------------------------------------------------------------------
    # Public: Federal Tax
    # ------------------------------------------------------------------

    def calculate_federal_tax(
        self,
        gross: Decimal,
        filing_status: FilingStatus,
        w4_data: Optional[W4Data] = None,
        pay_periods: int = 26,
    ) -> Decimal:
        """
        Calculate federal income tax withholding.

        Parameters
        ----------
        gross : Decimal
            Gross pay for the pay period.
        filing_status : FilingStatus
            Employee filing status.
        w4_data : W4Data, optional
            W-4 form data. If None, defaults to post-2020 single.
        pay_periods : int
            Number of pay periods per year (26 for biweekly).

        Returns
        -------
        Decimal
            Federal income tax withheld for the period.
        """
        gross = Decimal(str(gross))
        if w4_data is None:
            w4_data = W4Data(filing_status=filing_status)

        if w4_data.exempt:
            return Decimal("0")

        if w4_data.version == W4Version.PRE_2020:
            return self._percentage_method_pre2020(gross, w4_data, pay_periods)

        # For post-2020, if step2c is set, we override status inside the method
        return self._percentage_method_post2020(gross, w4_data, pay_periods)

    # ------------------------------------------------------------------
    # State Income Tax
    # ------------------------------------------------------------------

    def calculate_state_tax(
        self,
        gross: Decimal,
        state: str,
        filing_status: FilingStatus,
        pay_periods: int = 26,
    ) -> Decimal:
        """
        Calculate state income tax withholding.

        Parameters
        ----------
        gross : Decimal
            Gross pay for the pay period.
        state : str
            Two-letter state code (e.g., "CA", "NY").
        filing_status : FilingStatus
            Employee filing status.
        pay_periods : int
            Number of pay periods per year.

        Returns
        -------
        Decimal
            State income tax for the pay period.
        """
        gross = Decimal(str(gross))
        state = state.upper().strip()

        # No state income tax
        if state in NO_STATE_INCOME_TAX:
            return Decimal("0")

        # NH only taxes interest/dividends – exempt from payroll withholding
        if state in NH_ONLY_INCOME:
            return Decimal("0")

        # Flat-rate states
        if state in FLAT_RATE_STATES:
            rate = FLAT_RATE_STATES[state]
            annual_tax = gross * pay_periods * rate
            std = self._get_standard_deduction(self.tax_year, filing_status)
            taxable = max(Decimal("0"), gross * pay_periods - std)
            annual_tax = taxable * rate
            return self._round(annual_tax / pay_periods)

        # Progressive states (CA, NY, etc.)
        state_data = STATE_TAX_TABLES.get(state)
        if state_data and state_data.get("brackets"):
            brackets = state_data["brackets"].get(
                filing_status,
                state_data["brackets"].get(FilingStatus.SINGLE, []),
            )
            std = state_data.get("standard_deduction", {}).get(filing_status, Decimal("0"))
            annual_gross = gross * pay_periods
            taxable = max(Decimal("0"), annual_gross - std)

            tax = Decimal("0")
            prev_upper = Decimal("0")
            for upper, rate in brackets:
                if taxable <= prev_upper:
                    break
                bracket_income = min(taxable, upper) - prev_upper
                tax += bracket_income * rate
                prev_upper = upper

            return self._round(tax / pay_periods)

        # Fallback – approximate 5% flat rate
        annual_gross = gross * pay_periods
        approx_tax = annual_gross * Decimal("0.05")
        return self._round(approx_tax / pay_periods)

    # ------------------------------------------------------------------
    # FICA Taxes
    # ------------------------------------------------------------------

    def calculate_fica(
        self,
        gross: Decimal,
        ytd_gross: Decimal = Decimal("0"),
        employee_id: str = "",
    ) -> Dict[str, Decimal]:
        """
        Calculate FICA taxes (Social Security + Medicare).

        Parameters
        ----------
        gross : Decimal
            Current period gross pay.
        ytd_gross : Decimal
            Year-to-date gross pay before this period.

        Returns
        -------
        dict
            Keys: ss_employee, ss_employer, medicare_employee,
                  medicare_employer, additional_medicare
        """
        gross = Decimal(str(gross))
        ytd_gross = Decimal(str(ytd_gross))
        ss_cap = FICARates.ss_cap(self.tax_year)

        # Social Security (employee + employer)
        ss_taxable = Decimal("0")
        if ytd_gross < ss_cap:
            ss_taxable = min(gross, ss_cap - ytd_gross)

        ss_employee = self._round(ss_taxable * FICARates.SOCIAL_SECURITY_RATE)
        ss_employer = self._round(ss_taxable * FICARates.SOCIAL_SECURITY_RATE)

        # Medicare (employee + employer – no cap)
        medicare_employee = self._round(gross * FICARates.MEDICARE_RATE)
        medicare_employer = self._round(gross * FICARates.MEDICARE_RATE)

        # Additional Medicare (employee only, over $200K threshold)
        additional_medicare = Decimal("0")
        if ytd_gross >= FICARates.ADDITIONAL_MEDICARE_THRESHOLD:
            additional_medicare = self._round(
                gross * FICARates.ADDITIONAL_MEDICARE_RATE
            )
        elif (ytd_gross + gross) > FICARates.ADDITIONAL_MEDICARE_THRESHOLD:
            excess = (ytd_gross + gross) - FICARates.ADDITIONAL_MEDICARE_THRESHOLD
            additional_medicare = self._round(excess * FICARates.ADDITIONAL_MEDICARE_RATE)

        return {
            "ss_employee": ss_employee,
            "ss_employer": ss_employer,
            "medicare_employee": medicare_employee,
            "medicare_employer": medicare_employer,
            "additional_medicare": additional_medicare,
        }

    # ------------------------------------------------------------------
    # FUTA
    # ------------------------------------------------------------------

    def calculate_futa(self, suta_wages: Decimal) -> Decimal:
        """
        Calculate Federal Unemployment Tax (FUTA).

        Parameters
        ----------
        suta_wages : Decimal
            Wages subject to SUTA (used to determine FUTA base).

        Returns
        -------
        Decimal
            FUTA tax owed by employer.
        """
        suta_wages = Decimal(str(suta_wages))
        taxable = min(suta_wages, FUTARates.WAGE_BASE)
        return self._round(taxable * FUTARates.NET_RATE)

    # ------------------------------------------------------------------
    # SUTA
    # ------------------------------------------------------------------

    def calculate_suta(
        self,
        total_wages: Decimal,
        state: str,
        employer_id: str = "",
        experience_rate: Optional[Decimal] = None,
    ) -> Decimal:
        """
        Calculate State Unemployment Tax (SUTA).

        Parameters
        ----------
        total_wages : Decimal
            Total wages paid to employee this period.
        state : str
            Two-letter state code.
        employer_id : str
            Employer identifier (used for experience rating lookup).
        experience_rate : Decimal, optional
            Employer-specific SUTA rate. If None, uses default.

        Returns
        -------
        Decimal
            SUTA tax owed by employer.
        """
        total_wages = Decimal(str(total_wages))
        state = state.upper().strip()

        wage_base = SUTARates.WAGE_BASE.get(state, Decimal("9000"))
        rate = experience_rate if experience_rate is not None else SUTARates.DEFAULT_RATE

        taxable = min(total_wages, wage_base)
        return self._round(taxable * rate)

    # ------------------------------------------------------------------
    # Workers' Compensation (estimate)
    # ------------------------------------------------------------------

    def calculate_workers_comp(
        self,
        gross: Decimal,
        state: str,
        rate_per_100: Optional[Decimal] = None,
    ) -> Decimal:
        """
        Estimate workers' compensation premium.

        Parameters
        ----------
        gross : Decimal
            Current period gross pay.
        state : str
            Two-letter state code.
        rate_per_100 : Decimal, optional
            Custom rate per $100 of payroll. If None, uses state default.

        Returns
        -------
        Decimal
            Estimated workers' comp cost for this period.
        """
        gross = Decimal(str(gross))
        state = state.upper().strip()

        if rate_per_100 is None:
            rate_per_100 = WORKERS_COMP_RATES.get(state, WORKERS_COMP_RATES["DEFAULT"])

        premium = (gross / Decimal("100")) * rate_per_100
        return self._round(premium)

    # ------------------------------------------------------------------
    # Full Payroll Calculation
    # ------------------------------------------------------------------

    def calculate_payroll(
        self,
        gross: Decimal,
        state: str,
        filing_status: FilingStatus,
        w4_data: Optional[W4Data] = None,
        pay_periods: int = 26,
        ytd_gross: Decimal = Decimal("0"),
        ytd_ss: Decimal = Decimal("0"),
        ytd_medicare: Decimal = Decimal("0"),
        ytd_federal: Decimal = Decimal("0"),
        suta_wages_ytd: Decimal = Decimal("0"),
        employer_id: str = "",
        experience_rate: Optional[Decimal] = None,
        currency: str = "USD",
    ) -> PayrollResult:
        """
        Run a complete payroll calculation for one pay period.

        Returns a fully populated PayrollResult with all tax breakdowns.
        """
        gross = Decimal(str(gross))

        # Federal income tax
        federal_tax = self.calculate_federal_tax(
            gross, filing_status, w4_data, pay_periods
        )

        # State income tax
        state_tax = self.calculate_state_tax(gross, state, filing_status, pay_periods)

        # FICA
        fica = self.calculate_fica(gross, ytd_gross, employer_id)

        # FUTA (employer only – computed on cumulative suta wages)
        cumulative_suta = suta_wages_ytd + gross
        futa = self.calculate_futa(cumulative_suta)

        # SUTA (employer only)
        suta = self.calculate_suta(gross, state, employer_id, experience_rate)

        # Workers' comp (estimate)
        workers_comp = self.calculate_workers_comp(gross, state)

        result = PayrollResult(
            gross_pay=gross,
            federal_tax=federal_tax,
            state_tax=state_tax,
            state_name=state.upper(),
            ss_employee=fica["ss_employee"],
            ss_employer=fica["ss_employer"],
            medicare_employee=fica["medicare_employee"],
            medicare_employer=fica["medicare_employer"],
            additional_medicare=fica["additional_medicare"],
            futa=futa,
            suta=suta,
            workers_comp=workers_comp,
            ytd_gross=ytd_gross + gross,
            ytd_federal=ytd_federal + federal_tax,
            ytd_ss=ytd_ss + fica["ss_employee"],
            ytd_medicare=ytd_medicare + fica["medicare_employee"] + fica["additional_medicare"],
        )
        result.compute_net()

        # Multi-currency conversion if requested
        if currency.upper() != "USD":
            convert = CurrencyConverter.convert
            result.gross_pay = convert(result.gross_pay, "USD", currency)
            result.federal_tax = convert(result.federal_tax, "USD", currency)
            result.state_tax = convert(result.state_tax, "USD", currency)
            result.ss_employee = convert(result.ss_employee, "USD", currency)
            result.ss_employer = convert(result.ss_employer, "USD", currency)
            result.medicare_employee = convert(result.medicare_employee, "USD", currency)
            result.medicare_employer = convert(result.medicare_employer, "USD", currency)
            result.additional_medicare = convert(result.additional_medicare, "USD", currency)
            result.futa = convert(result.futa, "USD", currency)
            result.suta = convert(result.suta, "USD", currency)
            result.workers_comp = convert(result.workers_comp, "USD", currency)
            result.total_deductions = convert(result.total_deductions, "USD", currency)
            result.net_pay = convert(result.net_pay, "USD", currency)
            result.details["currency"] = currency

        return result

    # ------------------------------------------------------------------
    # W-2 Data Generation
    # ------------------------------------------------------------------

    def generate_w2_data(
        self,
        payroll_data: Dict[str, Any],
    ) -> W2Data:
        """
        Generate W-2 form data from cumulative payroll records.

        Parameters
        ----------
        payroll_data : dict
            Expected keys:
                - employer_ein: str
                - employee_ssn: str
                - employee_name: str
                - employer_name: str
                - employer_address: str
                - employee_address: str
                - state: str
                - annual_wages: Decimal
                - federal_tax_withheld: Decimal
                - social_security_wages: Decimal
                - social_security_tax: Decimal
                - medicare_wages: Decimal
                - medicare_tax: Decimal
                - additional_medicare_tax: Decimal
                - state_wages: Decimal
                - state_tax_withheld: Decimal
                - box12: dict (optional)
                - box14: dict (optional)
                - statutory_employee: bool
                - retirement_plan: bool
                - third_party_sick_pay: bool

        Returns
        -------
        W2Data
            Populated W-2 data structure.
        """
        pd = payroll_data
        additional_med = pd.get("additional_medicare_tax", Decimal("0"))

        return W2Data(
            employer_ein=str(pd.get("employer_ein", "")),
            employee_ssn=str(pd.get("employee_ssn", "")),
            employee_name=str(pd.get("employee_name", "")),
            employer_name=str(pd.get("employer_name", "")),
            employer_address=str(pd.get("employer_address", "")),
            employee_address=str(pd.get("employee_address", "")),
            state=str(pd.get("state", "")),
            # Box 1 – Wages (gross minus pre-tax deductions like 401k)
            wages=pd.get("annual_wages", Decimal("0")),
            # Box 2
            federal_tax_withheld=pd.get("federal_tax_withheld", Decimal("0")),
            # Box 3 – SS wages (capped at SS limit)
            social_security_wages=min(
                pd.get("social_security_wages", pd.get("annual_wages", Decimal("0"))),
                FICARates.ss_cap(self.tax_year),
            ),
            # Box 4
            social_security_tax=pd.get("social_security_tax", Decimal("0")),
            # Box 5 – Medicare wages (no cap)
            medicare_wages=pd.get("medicare_wages", pd.get("annual_wages", Decimal("0"))),
            # Box 6
            medicare_tax=pd.get("medicare_tax", Decimal("0")) + additional_med,
            # Box 12
            box12=pd.get("box12", {}),
            # Box 13
            statutory_employee=pd.get("statutory_employee", False),
            retirement_plan=pd.get("retirement_plan", False),
            third_party_sick_pay=pd.get("third_party_sick_pay", False),
            # Box 14
            other=pd.get("box14", {}),
            # Box 15-20 – State
            state_wages=pd.get("state_wages", pd.get("annual_wages", Decimal("0"))),
            state_tax_withheld=pd.get("state_tax_withheld", Decimal("0")),
        )

    # ------------------------------------------------------------------
    # Utility: Annualize from period
    # ------------------------------------------------------------------

    def annualize(
        self,
        period_gross: Decimal,
        period_federal: Decimal,
        period_state: Decimal,
        period_ss: Decimal,
        period_medicare: Decimal,
        pay_periods: int = 26,
    ) -> Dict[str, Decimal]:
        """Project annual totals from a single pay period."""
        return {
            "annual_gross": self._round(period_gross * pay_periods),
            "annual_federal": self._round(period_federal * pay_periods),
            "annual_state": self._round(period_state * pay_periods),
            "annual_ss": self._round(period_ss * pay_periods),
            "annual_medicare": self._round(period_medicare * pay_periods),
        }

    # ------------------------------------------------------------------
    # Utility: Validate state code
    # ------------------------------------------------------------------

    @staticmethod
    def is_valid_state(state: str) -> bool:
        """Check if a state code is a valid US state/territory code."""
        valid = {
            "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
            "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
            "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
            "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
            "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
            # Territories
            "PR", "VI", "GU", "AS", "MP",
        }
        return state.upper().strip() in valid

    # ------------------------------------------------------------------
    # Utility: Get pay periods from frequency
    # ------------------------------------------------------------------

    @staticmethod
    def pay_periods_from_frequency(frequency: PayFrequency) -> int:
        mapping = {
            PayFrequency.WEEKLY: 52,
            PayFrequency.BIWEEKLY: 26,
            PayFrequency.SEMIMONTHLY: 24,
            PayFrequency.MONTHLY: 12,
        }
        return mapping.get(frequency, 26)
