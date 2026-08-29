"""
State-wise Compliance Engine
=============================
Auto-updating Professional Tax slabs, Labour Welfare Fund rates,
and minimum wage references for all Indian states and union territories.

This is our competitive moat against Keka and greytHR — they require
manual updates for state-level compliance changes. We automate it.

PT = Professional Tax (monthly deduction ceiling varies by state)
LWF = Labour Welfare Fund (half-yearly, state-specific rates)
"""

from typing import Any, Dict, List, Optional

# ── Professional Tax Slabs (by state, 2025-26) ──

PROFESSIONAL_TAX: Dict[str, Dict[str, Any]] = {
    "andhra_pradesh": {
        "state_name": "Andhra Pradesh",
        "code": "AP",
        "slabs": [
            {"from_gross": 0, "to_gross": 15000, "amount": 0, "description": "No PT"},
            {"from_gross": 15000, "to_gross": None, "amount": 200, "description": "Above ₹15,000/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month for gross > ₹15,000",
    },
    "bihar": {
        "state_name": "Bihar",
        "code": "BR",
        "slabs": [
            {"from_gross": 0, "to_gross": 25000, "amount": 0, "description": "No PT"},
            {"from_gross": 25000, "to_gross": 41667, "amount": 83, "description": "₹83/month"},
            {"from_gross": 41667, "to_gross": 83333, "amount": 167, "description": "₹167/month"},
            {"from_gross": 83333, "to_gross": None, "amount": 208, "description": "₹208/month"},
        ],
        "annual_max": 2500,
        "notes": "Bihar has slab-based PT",
    },
    "karnataka": {
        "state_name": "Karnataka",
        "code": "KA",
        "slabs": [
            {"from_gross": 0, "to_gross": 15000, "amount": 0, "description": "No PT"},
            {"from_gross": 15000, "to_gross": 20000, "amount": 150, "description": "₹150/month"},
            {"from_gross": 20000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Karnataka PT — 2 slabs above ₹15,000",
    },
    "kerala": {
        "state_name": "Kerala",
        "code": "KL",
        "slabs": [
            {"from_gross": 0, "to_gross": 1999, "amount": 0, "description": "No PT"},
            {"from_gross": 2000, "to_gross": 2999, "amount": 15, "description": "₹15/month"},
            {"from_gross": 3000, "to_gross": 4999, "amount": 30, "description": "₹30/month"},
            {"from_gross": 5000, "to_gross": 7499, "amount": 50, "description": "₹50/month"},
            {"from_gross": 7500, "to_gross": 9999, "amount": 75, "description": "₹75/month"},
            {"from_gross": 10000, "to_gross": 12499, "amount": 100, "description": "₹100/month"},
            {"from_gross": 12500, "to_gross": 16666, "amount": 125, "description": "₹125/month"},
            {"from_gross": 16667, "to_gross": 20833, "amount": 150, "description": "₹150/month"},
            {"from_gross": 20834, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Kerala has the most granular PT slabs in India",
    },
    "madhya_pradesh": {
        "state_name": "Madhya Pradesh",
        "code": "MP",
        "slabs": [
            {"from_gross": 0, "to_gross": 21750, "amount": 0, "description": "No PT"},
            {"from_gross": 21750, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above threshold",
    },
    "maharashtra": {
        "state_name": "Maharashtra",
        "code": "MH",
        "slabs": [
            {"from_gross": 0, "to_gross": 7500, "amount": 0, "description": "No PT"},
            {"from_gross": 7500, "to_gross": 10000, "amount": 175, "description": "₹175/month"},
            {"from_gross": 10000, "to_gross": None, "amount": 300, "description": "₹300/month"},
        ],
        "annual_max": 3600,
        "notes": "Highest PT in India — ₹300/month for gross > ₹10,000. Common in Mumbai/Pune.",
    },
    "odisha": {
        "state_name": "Odisha",
        "code": "OD",
        "slabs": [
            {"from_gross": 0, "to_gross": 12000, "amount": 0, "description": "No PT"},
            {"from_gross": 12000, "to_gross": 15999, "amount": 100, "description": "₹100/month"},
            {"from_gross": 16000, "to_gross": 24999, "amount": 150, "description": "₹150/month"},
            {"from_gross": 25000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Slab-based PT in Odisha",
    },
    "tamil_nadu": {
        "state_name": "Tamil Nadu",
        "code": "TN",
        "slabs": [
            {"from_gross": 0, "to_gross": 21000, "amount": 0, "description": "No PT"},
            {"from_gross": 21000, "to_gross": 30000, "amount": 110, "description": "₹110/month"},
            {"from_gross": 30001, "to_gross": 45000, "amount": 160, "description": "₹160/month"},
            {"from_gross": 45001, "to_gross": 60000, "amount": 210, "description": "₹210/month"},
            {"from_gross": 60001, "to_gross": 75000, "amount": 265, "description": "₹265/month"},
            {"from_gross": 75001, "to_gross": None, "amount": 315, "description": "₹315/month — women ₹140"},
        ],
        "annual_max": 3780,
        "notes": "Highest PT in India for men (₹315). Lower rate for women (₹140 at top slab).",
    },
    "telangana": {
        "state_name": "Telangana",
        "code": "TS",
        "slabs": [
            {"from_gross": 0, "to_gross": 15000, "amount": 0, "description": "No PT"},
            {"from_gross": 15000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Same as Andhra Pradesh — flat ₹200/month",
    },
    "west_bengal": {
        "state_name": "West Bengal",
        "code": "WB",
        "slabs": [
            {"from_gross": 0, "to_gross": 15000, "amount": 0, "description": "No PT"},
            {"from_gross": 15000, "to_gross": 25000, "amount": 110, "description": "₹110/month"},
            {"from_gross": 25001, "to_gross": 40000, "amount": 130, "description": "₹130/month"},
            {"from_gross": 40001, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "West Bengal has slab-based PT",
    },
    "assam": {
        "state_name": "Assam",
        "code": "AS",
        "slabs": [
            {"from_gross": 0, "to_gross": 10000, "amount": 0, "description": "No PT"},
            {"from_gross": 10000, "to_gross": 15000, "amount": 60, "description": "₹60/month"},
            {"from_gross": 15001, "to_gross": 25000, "amount": 90, "description": "₹90/month"},
            {"from_gross": 25001, "to_gross": None, "amount": 120, "description": "₹120/month"},
        ],
        "annual_max": 1440,
        "notes": "Lower PT rates in Assam",
    },
    "gujarat": {
        "state_name": "Gujarat",
        "code": "GJ",
        "slabs": [
            {"from_gross": 0, "to_gross": 12000, "amount": 0, "description": "No PT"},
            {"from_gross": 12000, "to_gross": 19999, "amount": 150, "description": "₹150/month"},
            {"from_gross": 20000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Gujarat PT — ₹200/month at top slab",
    },
    "punjab": {
        "state_name": "Punjab",
        "code": "PB",
        "slabs": [
            {"from_gross": 0, "to_gross": 21750, "amount": 0, "description": "No PT"},
            {"from_gross": 21750, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above ₹21,750",
    },
    "rajasthan": {
        "state_name": "Rajasthan",
        "code": "RJ",
        "slabs": [
            {"from_gross": 0, "to_gross": 26125, "amount": 0, "description": "No PT"},
            {"from_gross": 26125, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above threshold",
    },
    "uttar_pradesh": {
        "state_name": "Uttar Pradesh",
        "code": "UP",
        "slabs": [
            {"from_gross": 0, "to_gross": 25000, "amount": 0, "description": "No PT"},
            {"from_gross": 25000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above ₹25,000",
    },
    "delhi": {
        "state_name": "Delhi",
        "code": "DL",
        "slabs": [
            {"from_gross": 0, "to_gross": 25000, "amount": 0, "description": "No PT"},
            {"from_gross": 25000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Delhi — ₹200/month above ₹25,000",
    },
    "haryana": {
        "state_name": "Haryana",
        "code": "HR",
        "slabs": [
            {"from_gross": 0, "to_gross": 25000, "amount": 0, "description": "No PT"},
            {"from_gross": 25000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Haryana — ₹200/month above ₹25,000",
    },
    "chhattisgarh": {
        "state_name": "Chhattisgarh",
        "code": "CG",
        "slabs": [
            {"from_gross": 0, "to_gross": 21750, "amount": 0, "description": "No PT"},
            {"from_gross": 21750, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above threshold",
    },
    "jharkhand": {
        "state_name": "Jharkhand",
        "code": "JH",
        "slabs": [
            {"from_gross": 0, "to_gross": 21120, "amount": 0, "description": "No PT"},
            {"from_gross": 21120, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above threshold",
    },
    "himachal_pradesh": {
        "state_name": "Himachal Pradesh",
        "code": "HP",
        "slabs": [
            {"from_gross": 0, "to_gross": 25000, "amount": 0, "description": "No PT"},
            {"from_gross": 25000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above ₹25,000",
    },
    "uttarakhand": {
        "state_name": "Uttarakhand",
        "code": "UK",
        "slabs": [
            {"from_gross": 0, "to_gross": 25000, "amount": 0, "description": "No PT"},
            {"from_gross": 25000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Flat ₹200/month above ₹25,000",
    },
    "goa": {
        "state_name": "Goa",
        "code": "GA",
        "slabs": [
            {"from_gross": 0, "to_gross": 15000, "amount": 0, "description": "No PT"},
            {"from_gross": 15000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Goa — ₹200/month above ₹15,000",
    },
    "chandigarh": {
        "state_name": "Chandigarh",
        "code": "CH",
        "slabs": [
            {"from_gross": 0, "to_gross": 21750, "amount": 0, "description": "No PT"},
            {"from_gross": 21750, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Same as Punjab pattern",
    },
    "pondicherry": {
        "state_name": "Puducherry",
        "code": "PY",
        "slabs": [
            {"from_gross": 0, "to_gross": 15000, "amount": 0, "description": "No PT"},
            {"from_gross": 15000, "to_gross": None, "amount": 200, "description": "₹200/month"},
        ],
        "annual_max": 2400,
        "notes": "Same as Tamil Nadu pattern but simplified",
    },
    "other": {
        "state_name": "Other UTs & States",
        "code": "OTHER",
        "slabs": [
            {"from_gross": 0, "to_gross": 15000, "amount": 0, "description": "No PT"},
            {"from_gross": 15000, "to_gross": None, "amount": 200, "description": "₹200/month (default)"},
        ],
        "annual_max": 2400,
        "notes": "Default for states without specific PT rules — ₹200/month",
    },
}


# ── Labour Welfare Fund (LWF) Rates (by state, 2025-26) ──

LWF: Dict[str, Dict[str, Any]] = {
    "andhra_pradesh": {
        "state_name": "Andhra Pradesh",
        "code": "AP",
        "applicable": True,
        "employee_contribution": 12.0,
        "employer_contribution": 24.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "AP LWF: Employee ₹12/mo, Employer ₹24/mo",
    },
    "karnataka": {
        "state_name": "Karnataka",
        "code": "KA",
        "applicable": True,
        "employee_contribution": 20.0,
        "employer_contribution": 40.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Karnataka LWF: Employee ₹20/mo, Employer ₹40/mo",
    },
    "kerala": {
        "state_name": "Kerala",
        "code": "KL",
        "applicable": True,
        "employee_contribution": 30.0,
        "employer_contribution": 60.0,
        "frequency": "half_yearly",
        "max_wage_for_applicability": 15000,
        "notes": "Kerala LWF: Employee ₹30, Employer ₹60 (half-yearly)",
    },
    "tamil_nadu": {
        "state_name": "Tamil Nadu",
        "code": "TN",
        "applicable": True,
        "employee_contribution": 20.0,
        "employer_contribution": 40.0,
        "frequency": "half_yearly",
        "max_wage_for_applicability": 15000,
        "notes": "TN LWF: Employee ₹20, Employer ₹40 (half-yearly)",
    },
    "maharashtra": {
        "state_name": "Maharashtra",
        "code": "MH",
        "applicable": True,
        "employee_contribution": 12.0,
        "employer_contribution": 24.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 30000,
        "notes": "Maharashtra LWF: Employee ₹12/mo, Employer ₹24/mo. Higher wage ceiling.",
    },
    "gujarat": {
        "state_name": "Gujarat",
        "code": "GJ",
        "applicable": True,
        "employee_contribution": 12.0,
        "employer_contribution": 24.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Gujarat LWF: Employee ₹12/mo, Employer ₹24/mo",
    },
    "punjab": {
        "state_name": "Punjab",
        "code": "PB",
        "applicable": True,
        "employee_contribution": 25.0,
        "employer_contribution": 50.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Punjab LWF: Employee ₹25/mo, Employer ₹50/mo",
    },
    "haryana": {
        "state_name": "Haryana",
        "code": "HR",
        "applicable": True,
        "employee_contribution": 12.0,
        "employer_contribution": 24.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Haryana LWF: Employee ₹12/mo, Employer ₹24/mo",
    },
    "rajasthan": {
        "state_name": "Rajasthan",
        "code": "RJ",
        "applicable": True,
        "employee_contribution": 15.0,
        "employer_contribution": 30.0,
        "frequency": "half_yearly",
        "max_wage_for_applicability": 15000,
        "notes": "Rajasthan LWF: Employee ₹15, Employer ₹30 (half-yearly)",
    },
    "delhi": {
        "state_name": "Delhi",
        "code": "DL",
        "applicable": True,
        "employee_contribution": 12.0,
        "employer_contribution": 24.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Delhi LWF: Employee ₹12/mo, Employer ₹24/mo",
    },
    "chandigarh": {
        "state_name": "Chandigarh",
        "code": "CH",
        "applicable": True,
        "employee_contribution": 12.0,
        "employer_contribution": 24.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Chandigarh LWF: Same as Delhi pattern",
    },
    "uttar_pradesh": {
        "state_name": "Uttar Pradesh",
        "code": "UP",
        "applicable": True,
        "employee_contribution": 6.0,
        "employer_contribution": 12.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "UP LWF: Employee ₹6/mo, Employer ₹12/mo (lowest rates)",
    },
    "uttarakhand": {
        "state_name": "Uttarakhand",
        "code": "UK",
        "applicable": True,
        "employee_contribution": 6.0,
        "employer_contribution": 12.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Uttarakhand LWF: Same as UP pattern",
    },
    "west_bengal": {
        "state_name": "West Bengal",
        "code": "WB",
        "applicable": True,
        "employee_contribution": 4.0,
        "employer_contribution": 8.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 25000,
        "notes": "WB LWF: Employee ₹4/mo, Employer ₹8/mo. Very low rates, higher wage ceiling.",
    },
    "jharkhand": {
        "state_name": "Jharkhand",
        "code": "JH",
        "applicable": True,
        "employee_contribution": 6.0,
        "employer_contribution": 12.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Jharkhand LWF: Employee ₹6/mo, Employer ₹12/mo",
    },
    "madhya_pradesh": {
        "state_name": "Madhya Pradesh",
        "code": "MP",
        "applicable": True,
        "employee_contribution": 10.0,
        "employer_contribution": 20.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "MP LWF: Employee ₹10/mo, Employer ₹20/mo",
    },
    "chhattisgarh": {
        "state_name": "Chhattisgarh",
        "code": "CG",
        "applicable": True,
        "employee_contribution": 10.0,
        "employer_contribution": 20.0,
        "frequency": "monthly",
        "max_wage_for_applicability": 15000,
        "notes": "Chhattisgarh LWF: Same as MP pattern",
    },
}


# ── Helpers ──

def get_pt_for_state(state_code: str) -> Optional[Dict[str, Any]]:
    """Get Professional Tax configuration for a state by code."""
    key = resolve_state_key(state_code)
    return PROFESSIONAL_TAX.get(key) if key else None


def get_lwf_for_state(state_code: str) -> Optional[Dict[str, Any]]:
    """Get Labour Welfare Fund configuration for a state by code."""
    key = resolve_state_key(state_code)
    return LWF.get(key) if key else None


def calculate_pt(gross_salary: float, state_code: str = "other") -> float:
    """Calculate monthly Professional Tax for a given gross salary and state."""
    key = resolve_state_key(state_code) or "other"
    pt_config = PROFESSIONAL_TAX.get(key, PROFESSIONAL_TAX["other"])
    for slab in pt_config["slabs"]:
        upper = slab["to_gross"] if slab["to_gross"] is not None else float("inf")
        if slab["from_gross"] <= gross_salary < upper:
            return float(slab["amount"])
    return 0.0


def calculate_lwf(gross_salary: float, state_code: str) -> Dict[str, float]:
    """Calculate monthly LWF employee and employer contributions."""
    key = resolve_state_key(state_code)
    lwf_config = LWF.get(key) if key else None
    if not lwf_config or not lwf_config["applicable"]:
        return {"employee": 0.0, "employer": 0.0, "applicable": False}

    if gross_salary > lwf_config["max_wage_for_applicability"]:
        return {"employee": 0.0, "employer": 0.0, "applicable": False}

    return {
        "employee": float(lwf_config["employee_contribution"]),
        "employer": float(lwf_config["employer_contribution"]),
        "applicable": True,
        "frequency": lwf_config["frequency"],
    }


def resolve_state_key(input_key: str) -> Optional[str]:
    """Resolve a state name/code to the internal snake_case key.

    Accepts: 'KA', 'karnataka', 'Karnataka', 'Tamil Nadu', 'TN', etc.
    Returns: 'karnataka', 'tamil_nadu', etc. or None if not found.
    """
    normalized = input_key.strip().lower().replace(" ", "_")
    if not normalized:
        return None

    # Direct match on internal key
    if normalized in PROFESSIONAL_TAX:
        return normalized

    # Match on two-letter code
    for key, data in PROFESSIONAL_TAX.items():
        if data.get("code", "").lower() == normalized:
            return key
        # Match on state name
        if data.get("state_name", "").lower().replace(" ", "_") == normalized:
            return key

    # Partial match — try contains
    for key, data in PROFESSIONAL_TAX.items():
        code = data.get("code", "").lower()
        name = data.get("state_name", "").lower().replace(" ", "_")
        if normalized in code or normalized in name or code in normalized or name in normalized:
            return key
    return None


def get_all_state_codes() -> List[str]:
    return list(PROFESSIONAL_TAX.keys())


def get_lwf_state_codes() -> List[str]:
    return list(LWF.keys())


# Default PT for states not explicitly listed
DEFAULT_PT_AMOUNT = 200.0
DEFAULT_PT_THRESHOLD = 15000.0
