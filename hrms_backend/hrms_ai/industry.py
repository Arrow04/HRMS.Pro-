"""
HRMS AI Industry Templates
Pre-configured settings for different industries
"""
from typing import Dict, Any, List, Optional
from enum import Enum


class IndustryType(str, Enum):
    TECHNOLOGY = "technology"
    HEALTHCARE = "healthcare"
    MANUFACTURING = "manufacturing"
    RETAIL = "retail"
    FINANCE = "finance"
    EDUCATION = "education"
    GOVERNMENT = "government"
    LOGISTICS = "logistics"
    HOSPITALITY = "hospitality"
    CONSULTING = "consulting"
    CONSTRUCTION = "construction"
    NONPROFIT = "nonprofit"
    OTHER = "other"


class CountryCompliance(str, Enum):
    INDIA = "India"
    USA = "USA"
    UK = "UK"
    UAE = "UAE"
    SINGAPORE = "Singapore"
    AUSTRALIA = "Australia"
    CANADA = "Canada"
    GERMANY = "Germany"
    OTHER = "other"


# Industry-specific leave policies
INDUSTRY_LEAVE_POLICIES: Dict[str, Dict[str, Any]] = {
    IndustryType.TECHNOLOGY.value: {
        "annual_leave": 20,
        "sick_leave": 10,
        "casual_leave": 5,
        "maternity_leave": 26,
        "paternity_leave": 14,
        "special_leaves": ["Sabbatical", "Conference", "Learning"],
        "sabbatical_eligible_after_years": 3,
        "unlimited_pto": False,
    },
    IndustryType.HEALTHCARE.value: {
        "annual_leave": 15,
        "sick_leave": 10,
        "casual_leave": 5,
        "maternity_leave": 180,
        "paternity_leave": 15,
        "special_leaves": ["On-call Compensation", "CME Leave", "Night Shift Allowance"],
        "shift_allowance": True,
        "on_call_allowance": True,
    },
    IndustryType.MANUFACTURING.value: {
        "annual_leave": 15,
        "sick_leave": 7,
        "casual_leave": 5,
        "maternity_leave": 26,
        "paternity_leave": 3,
        "special_leaves": ["Compensatory Off", "Overtime Rest"],
        "overtime_eligible": True,
        "shift_allowance": True,
    },
    IndustryType.RETAIL.value: {
        "annual_leave": 15,
        "sick_leave": 5,
        "casual_leave": 5,
        "maternity_leave": 90,
        "paternity_leave": 5,
        "special_leaves": ["Peak Season Leave", "Store Transfer"],
        "flexible_hours": True,
        "sunday_working": True,
    },
    IndustryType.FINANCE.value: {
        "annual_leave": 20,
        "sick_leave": 10,
        "casual_leave": 5,
        "maternity_leave": 26,
        "paternity_leave": 14,
        "special_leaves": ["Exam Leave", "Professional Development"],
        "variable_compensation": True,
    },
    IndustryType.EDUCATION.value: {
        "annual_leave": 20,
        "sick_leave": 10,
        "casual_leave": 5,
        "maternity_leave": 180,
        "paternity_leave": 15,
        "special_leaves": ["Academic Leave", "Research Leave", "Summer Break"],
        "semester_based": True,
    },
    IndustryType.GOVERNMENT.value: {
        "annual_leave": 20,
        "sick_leave": 10,
        "casual_leave": 5,
        "maternity_leave": 180,
        "paternity_leave": 15,
        "special_leaves": ["Election Duty", "Training", "Study Leave"],
        "pay_scale_based": True,
    },
    IndustryType.LOGISTICS.value: {
        "annual_leave": 15,
        "sick_leave": 7,
        "casual_leave": 5,
        "maternity_leave": 90,
        "paternity_leave": 5,
        "special_leaves": ["Travel Rest", "Route Change"],
        "overtime_eligible": True,
    },
    IndustryType.HOSPITALITY.value: {
        "annual_leave": 15,
        "sick_leave": 5,
        "casual_leave": 5,
        "maternity_leave": 90,
        "paternity_leave": 5,
        "special_leaves": ["Seasonal Leave", "Event Leave"],
        "flexible_hours": True,
        "sunday_working": True,
    },
    IndustryType.CONSULTING.value: {
        "annual_leave": 20,
        "sick_leave": 10,
        "casual_leave": 5,
        "maternity_leave": 26,
        "paternity_leave": 14,
        "special_leaves": ["Billable Hour Buffer", "Client Visit"],
        "travel_policy": True,
    },
    IndustryType.CONSTRUCTION.value: {
        "annual_leave": 15,
        "sick_leave": 7,
        "casual_leave": 5,
        "maternity_leave": 90,
        "paternity_leave": 5,
        "special_leaves": ["Weather Leave", "Site Transfer"],
        "overtime_eligible": True,
        "safety_training_required": True,
    },
    IndustryType.NONPROFIT.value: {
        "annual_leave": 18,
        "sick_leave": 10,
        "casual_leave": 5,
        "maternity_leave": 26,
        "paternity_leave": 14,
        "special_leaves": ["Volunteer Day", "Fundraising Event"],
        "flexible_hours": True,
    },
}


# Industry-specific attendance policies
INDUSTRY_ATTENDANCE_POLICIES: Dict[str, Dict[str, Any]] = {
    IndustryType.TECHNOLOGY.value: {
        "work_hours": "flexible",
        "core_hours": "10:00-16:00",
        "min_hours_per_day": 8,
        "remote_allowed": True,
        "max_remote_days": 3,
        "late_threshold_minutes": 15,
        "half_day_after_hours": 4,
    },
    IndustryType.HEALTHCARE.value: {
        "work_hours": "shift_based",
        "shifts": ["morning", "evening", "night"],
        "shift_hours": 8,
        "on_call_hours": 12,
        "late_threshold_minutes": 0,
        "overtime_eligible": True,
    },
    IndustryType.MANUFACTURING.value: {
        "work_hours": "fixed",
        "shift_hours": 8,
        "shifts": ["A", "B", "C"],
        "overtime_eligible": True,
        "late_threshold_minutes": 10,
    },
    IndustryType.RETAIL.value: {
        "work_hours": "flexible",
        "min_hours_per_day": 8,
        "sunday_working": True,
        "flexible_hours": True,
        "late_threshold_minutes": 10,
    },
    IndustryType.FINANCE.value: {
        "work_hours": "fixed",
        "core_hours": "09:30-17:30",
        "late_threshold_minutes": 15,
        "remote_allowed": True,
        "max_remote_days": 2,
    },
    IndustryType.EDUCATION.value: {
        "work_hours": "academic",
        "teaching_hours": 6,
        "office_hours": 2,
        "late_threshold_minutes": 15,
    },
    IndustryType.GOVERNMENT.value: {
        "work_hours": "fixed",
        "work_days": "Monday-Friday",
        "late_threshold_minutes": 15,
        "flexitime_eligible": True,
    },
    IndustryType.LOGISTICS.value: {
        "work_hours": "shift_based",
        "shifts": ["morning", "evening", "night"],
        "overtime_eligible": True,
        "late_threshold_minutes": 0,
    },
    IndustryType.HOSPITALITY.value: {
        "work_hours": "flexible",
        "min_hours_per_day": 8,
        "sunday_working": True,
        "holiday_working": True,
        "late_threshold_minutes": 15,
    },
    IndustryType.CONSULTING.value: {
        "work_hours": "flexible",
        "core_hours": "10:00-16:00",
        "min_hours_per_day": 8,
        "remote_allowed": True,
        "max_remote_days": 3,
        "billable_target": 7.5,
    },
    IndustryType.CONSTRUCTION.value: {
        "work_hours": "site_based",
        "shift_hours": 9,
        "overtime_eligible": True,
        "late_threshold_minutes": 0,
        "weather_affected": True,
    },
    IndustryType.NONPROFIT.value: {
        "work_hours": "flexible",
        "core_hours": "10:00-16:00",
        "min_hours_per_day": 8,
        "remote_allowed": True,
        "max_remote_days": 2,
    },
}


# Industry-specific payroll components
INDUSTRY_PAYROLL_COMPONENTS: Dict[str, List[str]] = {
    IndustryType.TECHNOLOGY.value: ["Basic", "HRA", "LTA", "Special Allowance", "Stock Options", "ESOP", "Performance Bonus", "Internet Allowance"],
    IndustryType.HEALTHCARE.value: ["Basic", "HRA", "Medical Allowance", "Shift Allowance", "Night Allowance", "On-call Allowance", "Performance Bonus"],
    IndustryType.MANUFACTURING.value: ["Basic", "HRA", "Overtime", "Shift Allowance", "Incentive", "Attendance Bonus", "Production Bonus"],
    IndustryType.RETAIL.value: ["Basic", "HRA", "Sales Commission", "Store Allowance", "Overtime", "Attendance Bonus"],
    IndustryType.FINANCE.value: ["Basic", "HRA", "LTA", "Special Allowance", "Performance Bonus", "Variable Pay", "Insurance"],
    IndustryType.EDUCATION.value: ["Basic", "HRA", "LTA", "Research Allowance", "Conference Allowance", "Performance Bonus"],
    IndustryType.GOVERNMENT.value: ["Basic", "DA", "HRA", "TA", "LTA", "Special Allowance"],
    IndustryType.LOGISTICS.value: ["Basic", "HRA", "Overtime", "Travel Allowance", "Fuel Allowance", "Per Diem"],
    IndustryType.HOSPITALITY.value: ["Basic", "HRA", "Tips", "Service Charge", "Overtime", "Meal Allowance"],
    IndustryType.CONSULTING.value: ["Basic", "HRA", "LTA", "Travel Allowance", "Per Diem", "Performance Bonus", "Billable Bonus"],
    IndustryType.CONSTRUCTION.value: ["Basic", "HRA", "Overtime", "Site Allowance", "Safety Bonus", "Tool Allowance"],
    IndustryType.NONPROFIT.value: ["Basic", "HRA", "LTA", "Flexible Benefits", "Volunteer Leave"],
}


# Country-specific statutory settings
COUNTRY_STATUTORY_SETTINGS: Dict[str, Dict[str, Any]] = {
    CountryCompliance.INDIA.value: {
        "pf": {"employee_contribution": 12, "employer_contribution": 12, "admin_charge": 0.5, "max_salary": 15000},
        "esi": {"employee_contribution": 0.75, "employer_contribution": 3.25, "max_salary": 21000},
        "pt": {"applicable": True, "varies_by_state": True},
        "tds": {"applicable": True, "regime": "new"},
        "gratuity": {"applicable": True, "formula": "15/26 * years * basic"},
        "bonus": {"applicable": True, "act": "Payment of Bonus Act"},
        "currency": "INR",
        "currency_symbol": "₹",
        "tax_year": "April-March",
        "minimum_wages": True,
    },
    CountryCompliance.USA.value: {
        "federal_tax": {"applicable": True},
        "state_tax": {"applicable": True, "varies_by_state": True},
        "fica": {"social_security": 6.2, "medicare": 1.45},
        "fica_employer": {"social_security": 6.2, "medicare": 1.45, "futa": 0.6, "suta": "varies"},
        "401k": {"applicable": True, "employee_deferral_limit": 23000},
        "flsa": {"overtime_eligible": True, "overtime_rate": 1.5},
        "fmla": {"applicable": True, "weeks": 12},
        "currency": "USD",
        "currency_symbol": "$",
        "tax_year": "January-December",
    },
    CountryCompliance.UK.value: {
        "paye": {"applicable": True},
        "national_insurance": {"employee_ni": 12, "employer_ni": 13.8},
        "minimum_wage": {"applicable": True, "living_wage": True},
        "holiday_entitlement": {"full_time": 28, "includes_bank_holidays": False},
        "auto_enrolment": {"applicable": True, "minimum_employer": 3},
        "sick_pay": {"statutory": True, "weeks": 28},
        "currency": "GBP",
        "currency_symbol": "£",
        "tax_year": "April-April",
    },
    CountryCompliance.UAE.value: {
        "wps": {"applicable": True},
        "end_of_service": {"applicable": True, "formula": "21 days per year for first 5 years, 30 days thereafter"},
        "gratuity": {"applicable": True},
        "uae_pension": {"applicable": True, "for_gcc_nationals": True},
        "overtime": {"rate": 1.25, "weekend_rate": 1.5},
        "annual_leave": {"minimum_days": 30},
        "currency": "AED",
        "currency_symbol": "د.إ",
    },
    CountryCompliance.SINGAPORE.value: {
        "cpf": {"employee_contribution": 20, "employer_contribution": 17, "max_salary": 6000},
        "ir8a": {"applicable": True},
        "maternity_protection": {"applicable": True, "weeks": 16},
        "child_benefit": {"applicable": True},
        "currency": "SGD",
        "currency_symbol": "S$",
    },
    CountryCompliance.AUSTRALIA.value: {
        "super_guarantee": {"applicable": True, "rate": 11},
        "payg": {"applicable": True},
        "fair_work": {"applicable": True},
        "annual_leave": {"full_time": 20, "loading": 17.5},
        "long_service_leave": {"applicable": True, "varies_by_state": True},
        "workers_comp": {"applicable": True, "varies_by_state": True},
        "currency": "AUD",
        "currency_symbol": "A$",
    },
    CountryCompliance.CANADA.value: {
        "cpp": {"applicable": True, "employee": 5.95, "employer": 5.95},
        "ei": {"applicable": True, "employee": 1.66, "employer": 1.4},
        "minimum_wage": {"varies_by_province": True},
        "vacation": {"minimum_weeks": 2, "vacation_pay": 4},
        "statutory_holidays": {"varies_by_province": True},
        "currency": "CAD",
        "currency_symbol": "C$",
    },
    CountryCompliance.GERMANY.value: {
        "social_security": {"pension": 18.6, "health": 14.6, "unemployment": 2.6, "care": 3.4},
        "tax_class": {"applicable": True, "classes": ["I", "II", "III", "IV", "V", "VI"]},
        "holiday_entitlement": {"minimum_days": 20, "varies_by_state": True},
        "maternity_protection": {"applicable": True},
        "working_time_act": {"max_hours_per_week": 48, "rest_periods": True},
        "currency": "EUR",
        "currency_symbol": "€",
    },
}


def get_industry_template(industry: str) -> Optional[Dict[str, Any]]:
    """Get industry-specific template"""
    industry_key = industry.lower().replace(" ", "_").replace("-", "_")
    
    # Direct match
    for key, template in INDUSTRY_LEAVE_POLICIES.items():
        if key.lower() == industry_key:
            return {
                "leave_policies": template,
                "attendance_policies": INDUSTRY_ATTENDANCE_POLICIES.get(key, {}),
                "payroll_components": INDUSTRY_PAYROLL_COMPONENTS.get(key, []),
            }
    
    # Fuzzy mapping
    industry_mapping = {
        "tech": "technology",
        "it": "technology",
        "software": "technology",
        "medical": "healthcare",
        "hospital": "healthcare",
        "pharma": "healthcare",
        "factory": "manufacturing",
        "production": "manufacturing",
        "shop": "retail",
        "store": "retail",
        "ecommerce": "retail",
        "bank": "finance",
        "insurance": "finance",
        "fintech": "finance",
        "school": "education",
        "university": "education",
        "college": "education",
        "public": "government",
        "municipal": "government",
        "federal": "government",
        "transport": "logistics",
        "supply_chain": "logistics",
        "warehouse": "logistics",
        "hotel": "hospitality",
        "restaurant": "hospitality",
        "travel": "hospitality",
        "advisory": "consulting",
        "professional_services": "consulting",
        "builder": "construction",
        "real_estate": "construction",
        "foundation": "nonprofit",
        "ngo": "nonprofit",
        "charity": "nonprofit",
        "non_profit": "nonprofit",
    }
    
    mapped = industry_mapping.get(industry_key)
    if mapped:
        return {
            "leave_policies": INDUSTRY_LEAVE_POLICIES.get(mapped, {}),
            "attendance_policies": INDUSTRY_ATTENDANCE_POLICIES.get(mapped, {}),
            "payroll_components": INDUSTRY_PAYROLL_COMPONENTS.get(mapped, []),
        }
    
    return None


def get_country_compliance(country: str) -> Optional[Dict[str, Any]]:
    """Get country-specific compliance settings"""
    for key, settings in COUNTRY_STATUTORY_SETTINGS.items():
        if key.lower() == country.lower():
            return settings
    return None


def get_leave_policy_for_industry(industry: str) -> Dict[str, Any]:
    """Get leave policy for an industry"""
    template = get_industry_template(industry)
    if template:
        return template.get("leave_policies", {})
    return INDUSTRY_LEAVE_POLICIES.get(IndustryType.OTHER.value, {})


def get_attendance_policy_for_industry(industry: str) -> Dict[str, Any]:
    """Get attendance policy for an industry"""
    template = get_industry_template(industry)
    if template:
        return template.get("attendance_policies", {})
    return {}


def get_payroll_components_for_industry(industry: str) -> List[str]:
    """Get payroll components for an industry"""
    template = get_industry_template(industry)
    if template:
        return template.get("payroll_components", [])
    return []
