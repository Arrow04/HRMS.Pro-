"""Take-home & tax planner: old-vs-new regime comparison with savings tips.

Slab math reuses the payroll engine's _get_annual_tax so the plan can never
drift from what TDS actually deducts. Every cap / percentage comes from the
org's TaxRegime configuration — nothing is hard-coded law.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import TaxRegime
from services.payroll_service import _get_annual_tax


def _pick_regimes(db: Session, org_id: int) -> Dict[str, Optional[TaxRegime]]:
    rows = (
        db.query(TaxRegime)
        .filter(TaxRegime.organization_id == org_id, TaxRegime.status == "active")
        .all()
    )
    out: Dict[str, Optional[TaxRegime]] = {"old": None, "new": None}
    for r in rows:
        kind = str(getattr(r, "regime_type", "") or "").lower()
        if kind in out and out[kind] is None:
            out[kind] = r
    return out


def _cap(regime: Optional[TaxRegime], attr: str) -> float:
    return float(getattr(regime, attr, None) or 0) if regime is not None else 0.0


def _marginal_rate(regime: Optional[TaxRegime], taxable: float) -> float:
    """Slab rate that applies at this taxable income (for savings estimates)."""
    if not regime or not regime.slabs:
        return 0.0
    rate = 0.0
    prev = 0.0
    for slab in sorted(regime.slabs, key=lambda s: s.from_amount):
        upper = slab.to_amount if slab.to_amount is not None else float("inf")
        if taxable > prev:
            rate = float(slab.rate or 0)
        prev = upper
    return rate


def _hra_exemption(regime: Optional[TaxRegime], *, annual_basic: float,
                   annual_hra: float, rent_paid_monthly: float, metro: bool) -> Dict[str, Any]:
    """Sec 10(13A): least of (a) actual HRA, (b) 50%/40% of basic,
    (c) rent paid - 10% of basic. All percentages come from TaxRegime."""
    pct = _cap(regime, "hra_metro_pct" if metro else "hra_non_metro_pct") / 100.0
    threshold = _cap(regime, "hra_rent_threshold_pct") / 100.0
    actual = max(0.0, float(annual_hra or 0))
    pct_of_basic = max(0.0, float(annual_basic or 0) * pct)
    rent_annual = max(0.0, float(rent_paid_monthly or 0) * 12)
    rent_minus = rent_annual - float(annual_basic or 0) * threshold
    exemption = max(0.0, min(actual, pct_of_basic, rent_minus))
    return {
        "amount": round(exemption, 2),
        "actualHra": round(actual, 2),
        "pctOfBasic": round(pct_of_basic, 2),
        "rentMinusThreshold": round(rent_minus, 2),
        "pct": round(pct * 100, 2),
        "rentThresholdPct": round(threshold * 100, 2),
    }


def plan_tax(
    db: Session,
    org_id: int,
    *,
    annual_gross: float,
    annual_basic: float,
    annual_hra: float,
    rent_paid_monthly: float = 0.0,
    metro: bool = True,
    section_80c: float = 0.0,
    section_80d: float = 0.0,
    nps_80ccd_1b: float = 0.0,
    home_loan_interest: float = 0.0,
    other_income: float = 0.0,
) -> Dict[str, Any]:
    regimes = _pick_regimes(db, org_id)
    old_regime = regimes.get("old")
    new_regime = regimes.get("new")

    hra = _hra_exemption(
        old_regime,
        annual_basic=annual_basic,
        annual_hra=annual_hra,
        rent_paid_monthly=rent_paid_monthly,
        metro=metro,
    )

    gross = float(annual_gross or 0) + float(other_income or 0)

    # Old regime: full exemption stack (caps from TaxRegime).
    cap_80c = _cap(old_regime, "section_80c_old_cap") or _cap(old_regime, "section_80c_cap")
    cap_80d = _cap(old_regime, "section_80d_cap")
    cap_nps = _cap(old_regime, "section_80ccd_1b_cap")
    cap_home = _cap(old_regime, "section_24_home_loan_cap")
    d_80c = min(max(0.0, section_80c), cap_80c)
    d_80d = min(max(0.0, section_80d), cap_80d)
    d_nps = min(max(0.0, nps_80ccd_1b), cap_nps)
    d_home = min(max(0.0, home_loan_interest), cap_home)
    hra_exempt = hra["amount"]

    old_std = _cap(old_regime, "standard_deduction")
    old_deductions = old_std + d_80c + d_80d + d_nps + d_home + hra_exempt
    old_taxable = max(0.0, gross - old_deductions)
    old_tax = _get_annual_tax(old_taxable, old_regime) if old_regime else 0.0

    # New regime: standard deduction only (no 10(13A)/80C stack).
    new_std = _cap(new_regime, "standard_deduction")
    new_taxable = max(0.0, gross - new_std)
    new_tax = _get_annual_tax(new_taxable, new_regime) if new_regime else 0.0

    old_total = round(old_tax, 2)
    new_total = round(new_tax, 2)
    recommendation = "old" if old_total <= new_total else "new"
    savings = round(abs(new_total - old_total), 2)

    # Savings tips: headroom x marginal rate of the old regime.
    marginal = _marginal_rate(old_regime, old_taxable) / 100.0
    tips: List[Dict[str, Any]] = []

    def add_tip(title: str, detail: str, saving: float) -> None:
        if saving >= 1:
            tips.append({"title": title, "detail": detail, "saving": round(saving, 2)})

    add_tip(
        "Invest more under 80C",
        f"You have used {round(d_80c)} of the {round(cap_80c)} cap (ELSS, PPF, LIC, tuition fees).",
        (cap_80c - d_80c) * marginal,
    )
    add_tip(
        "Claim 80D health insurance",
        f"You have claimed {round(d_80d)} of the {round(cap_80d)} cap (medical insurance premium).",
        (cap_80d - d_80d) * marginal,
    )
    add_tip(
        "Add NPS 80CCD(1B)",
        f"You have claimed {round(d_nps)} of the {round(cap_nps)} extra NPS deduction.",
        (cap_nps - d_nps) * marginal,
    )
    add_tip(
        "Claim home loan interest (Sec 24)",
        f"You have claimed {round(d_home)} of the {round(cap_home)} cap on self-occupied interest.",
        (cap_home - d_home) * marginal,
    )
    if rent_paid_monthly > 0 and annual_hra > 0 and hra_exempt <= 0:
        tips.append({
            "title": "HRA exemption is zero — check rent vs basic",
            "detail": "Rent paid minus 10% of basic must be positive for any exemption. "
                      "If you pay rent, submit rent proofs to payroll.",
            "saving": 0.0,
        })
    if recommendation == "new":
        tips.append({
            "title": "The new regime is better for you",
            "detail": "Skipping the exemption stack saves tax at your income level. "
                      "Switch regime on the employee tax declaration if not already.",
            "saving": savings,
        })

    tips.sort(key=lambda t: t["saving"], reverse=True)

    return {
        "inputs": {
            "annualGross": round(annual_gross, 2),
            "annualBasic": round(annual_basic, 2),
            "annualHra": round(annual_hra, 2),
            "rentPaidMonthly": round(rent_paid_monthly, 2),
            "metro": metro,
            "section80c": round(section_80c, 2),
            "section80d": round(section_80d, 2),
            "nps80ccd1b": round(nps_80ccd_1b, 2),
            "homeLoanInterest": round(home_loan_interest, 2),
            "otherIncome": round(other_income, 2),
        },
        "hraExemption": hra,
        "oldRegime": {
            "label": "Old regime (with exemptions)",
            "gross": round(gross, 2),
            "standardDeduction": round(old_std, 2),
            "deductions": {
                "section80c": round(d_80c, 2),
                "section80d": round(d_80d, 2),
                "nps80ccd1b": round(d_nps, 2),
                "homeLoanInterest": round(d_home, 2),
                "hraExemption": round(hra_exempt, 2),
            },
            "totalDeductions": round(old_deductions, 2),
            "taxableIncome": round(old_taxable, 2),
            "totalTax": old_total,
            "incomeAfterTax": round(gross - old_total, 2),
        },
        "newRegime": {
            "label": "New regime (lower slabs, no exemptions)",
            "gross": round(gross, 2),
            "standardDeduction": round(new_std, 2),
            "totalDeductions": round(new_std, 2),
            "taxableIncome": round(new_taxable, 2),
            "totalTax": new_total,
            "incomeAfterTax": round(gross - new_total, 2),
        },
        "recommendation": {"regime": recommendation, "savings": savings},
        "marginalRate": round(marginal * 100, 2),
        "tips": tips[:6],
    }
