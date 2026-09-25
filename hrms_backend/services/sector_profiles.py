"""Sector profiles as DATA (mandate sections 26-29).

The mandate is explicit: Government / PSU / private / contract payroll must
NOT be separate engines. They are ONE payroll core + profiles that supply the
pay parameters. This module is pure configuration + composition:

    profile  ->  wage composition  ->  calculate_base_wages (ONE engine)

Government: 7th-CPC style pay matrix (level x index -> basic), DA%, HRA%
PSU:       grade scales, DA, allowances
Private:   CTC / gross composition (the standard path)
Contract:  contractor metadata + daily/piece wage methods

Everything here is data: an org (or the central library) publishes a
'sector_profile' rule to change any parameter - never code.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from services.rule_platform import evaluate_definition, resolve_with_trace
from services.wage_engine import calculate_base_wages

__all__ = [
    "PAY_MATRIX",
    "SECTOR_PROFILES",
    "resolve_sector_profile",
    "compose_sector_wages",
    "government_basic_pay",
]

# 7th-CPC pay matrix (levels 1-10): (min, max) basic pay bands. Index steps
# are linear across 40 cells - real deployments override via 'sector_profile'
# rules with their own notified matrices.
PAY_MATRIX: Dict[int, Dict[str, float]] = {
    1: {"min": 18000, "max": 56900},
    2: {"min": 19900, "max": 63200},
    3: {"min": 21700, "max": 69100},
    4: {"min": 25500, "max": 81100},
    5: {"min": 29200, "max": 92300},
    6: {"min": 35400, "max": 112400},
    7: {"min": 44900, "max": 142400},
    8: {"min": 47600, "max": 151100},
    9: {"min": 53100, "max": 167800},
    10: {"min": 56100, "max": 177500},
}
_MATRIX_INDEX_CELLS = 40


def government_basic_pay(level: int, index: int) -> float:
    """Basic pay from the pay matrix (level + index), as data."""
    band = PAY_MATRIX.get(int(level))
    if band is None:
        raise ValueError(f"Unknown pay level {level} - add it to PAY_MATRIX or publish a sector_profile rule")
    idx = max(1, min(int(index), _MATRIX_INDEX_CELLS))
    step = (band["max"] - band["min"]) / (_MATRIX_INDEX_CELLS - 1)
    return round(band["min"] + step * (idx - 1), 2)


SECTOR_PROFILES: Dict[str, Dict[str, Any]] = {
    "GOVERNMENT": {
        "code": "GOVERNMENT",
        "label": "Government (pay matrix)",
        "wage_method": "month_salary",
        "pay_source": "matrix",           # basic from PAY_MATRIX level/index
        "da_pct": 50.0,                   # Dearness Allowance % of basic (rule knob)
        "hra_pct": {"X": 30.0, "Y": 20.0, "Z": 10.0},   # city category
        "allowances": ["ta", "da", "hra"],
        "retirement": ["NPS", "gratuity"],
    },
    "PSU": {
        "code": "PSU",
        "label": "PSU (grade scales)",
        "wage_method": "month_salary",
        "pay_source": "scale",            # basic from grade scale
        "da_pct": 40.0,
        "hra_pct": {"X": 27.0, "Y": 18.0, "Z": 9.0},
        "allowances": ["performance_pay", "allowances"],
        "retirement": ["EPF", "gratuity", "superannuation"],
    },
    "PRIVATE": {
        "code": "PRIVATE",
        "label": "Private sector (CTC)",
        "wage_method": "month_salary",
        "pay_source": "ctc",
        "allowances": ["basic", "hra", "special_allowance"],
        "retirement": ["EPF", "ESI", "gratuity"],
    },
    "CONTRACT": {
        "code": "CONTRACT",
        "label": "Contract labour",
        "wage_method": "rate_days",
        "pay_source": "rate",
        "contractor_fields": ["contractor", "principal_employer", "contract_rate", "contract_period"],
        "retirement": ["EPF", "ESI"],
    },
}


def resolve_sector_profile(
    code: str,
    db: Optional[Session] = None,
    organization_id: Optional[int] = None,
    as_of: Optional[date] = None,
) -> Dict[str, Any]:
    """Sector profile + any published 'sector_profile' rule override."""
    key = (code or "").strip().upper()
    base = SECTOR_PROFILES.get(key)
    if base is None:
        raise ValueError(f"Unknown sector profile '{code}'")
    profile = dict(base)
    if db is not None and organization_id is not None:
        try:
            res = resolve_with_trace(
                db, "sector_profile", as_of or date.today(), country="",
                organization_id=organization_id, rule_subtype=key,
            )
            override = ((res.get("chosen") or {}).get("definition") or {}).get("value")
            if isinstance(override, dict):
                profile.update(override)
        except Exception:
            pass
    return profile


def compose_sector_wages(profile: Dict[str, Any], facts: Dict[str, Any]) -> Dict[str, Any]:
    """Compose the wage context for a sector - then ONE engine computes pay.

    facts (per sector):
      GOVERNMENT: pay_level, matrix_index, city_category (X|Y|Z)
      PSU:        basic (grade scale), city_category
      PRIVATE:    monthly_salary (CTC split lives in salary components)
      CONTRACT:   daily_rate, days / rate_per_unit, units

    Returns {"earnings", "detail", "components"} where components feeds the
    standard payroll composition (basic, da, hra...).
    """
    source = profile.get("pay_source")
    components: Dict[str, float] = {}
    method = profile.get("wage_method")

    if source == "matrix":
        basic = government_basic_pay(int(facts["pay_level"]), int(facts.get("matrix_index", 1)))
        da = round(basic * float(profile.get("da_pct", 0) or 0) / 100.0, 2)
        city = str(facts.get("city_category", "Z")).upper()
        hra = round(basic * float((profile.get("hra_pct") or {}).get(city, 10.0)) / 100.0, 2)
        components = {"basic": basic, "da": da, "hra": hra}
        out = calculate_base_wages({"wage_method": "month_salary"},
                                   {"monthly_salary": basic + da + hra})
    elif source == "scale":
        basic = float(facts.get("basic", 0) or 0)
        da = round(basic * float(profile.get("da_pct", 0) or 0) / 100.0, 2)
        city = str(facts.get("city_category", "Z")).upper()
        hra = round(basic * float((profile.get("hra_pct") or {}).get(city, 9.0)) / 100.0, 2)
        components = {"basic": basic, "da": da, "hra": hra}
        out = calculate_base_wages({"wage_method": "month_salary"},
                                   {"monthly_salary": basic + da + hra})
    elif source == "rate":
        out = calculate_base_wages(profile, facts)
        components = {"wages": out["earnings"]}
    else:  # ctc
        out = calculate_base_wages(profile, facts)
        components = {"monthly_salary": out["earnings"]}

    return {
        "profile": profile["code"],
        "wage_method": method,
        "components": components,
        "earnings": out["earnings"],
        "detail": out["detail"],
    }
