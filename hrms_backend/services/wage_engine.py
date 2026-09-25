"""Wage Engine: employment profiles, wage methods, and named wage bases.

The mandate: one payroll core where daily workers, hourly workers, piece-rate
workers and monthly salaried employees are all the SAME engine with different
profiles - and every statutory calculation names the wage base it applies to,
resolved through rules (never hard-coded).

Three concerns live here:

1. EMPLOYMENT PROFILES - how wages are earned (DATA, not code paths):
   MONTHLY | DAILY | HOURLY | WEEKLY | BIWEEKLY | SEMI_MONTHLY | PIECE_RATE |
   COMMISSION | CONTRACT | TEMPORARY | PART_TIME | FULL_TIME | APPRENTICE |
   TRAINEE | CONSULTANT | GOVERNMENT | PSU | EXECUTIVE | CUSTOM

   Organizations override any profile by publishing an
   'employment_profile' rule (StatutoryRule, rule_subtype=profile code) -
   configuration only, no engine change.

2. WAGE METHODS - the generic calculators:
   month_salary | rate_days | rate_hours | units_rate | composite
   Unknown methods raise an explicit capability error (never silent).

3. NAMED WAGE BASES - statutory modules declare WHICH base they tax:
   BASIC, DA, WAGES, GROSS_WAGES, STATUTORY_WAGES, PF_WAGES, ESI_WAGES,
   BONUS_WAGES, GRATUITY_WAGES, OT_WAGES, TAXABLE_SALARY, TAXABLE_BENEFITS

   Each base resolves through a 'wage_definition' rule (rule_subtype=base
   code) with a built-in default definition as fallback. Defaults are still
   rule-shaped data - organizations override them with published rules.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Tuple

from services.rule_dsl import MissingInputError, RuleExpressionError
from services.rule_platform import evaluate_definition

__all__ = [
    "WAGE_METHODS",
    "WAGE_BASES",
    "EMPLOYMENT_PROFILES",
    "resolve_employment_profile",
    "calculate_base_wages",
    "resolve_wage_bases",
]


class UnknownWageMethodError(RuleExpressionError):
    """A profile requested a wage method the engine cannot compute.

    Mandate section 60 test 7: identify the missing capability instead of
    silently producing an incorrect payroll.
    """


WAGE_METHODS = ("month_salary", "rate_days", "rate_hours", "units_rate", "composite")

# Named wage bases statutory modules may reference.
WAGE_BASES = (
    "BASIC", "DA", "WAGES", "GROSS_WAGES", "STATUTORY_WAGES",
    "PF_WAGES", "ESI_WAGES", "BONUS_WAGES", "GRATUITY_WAGES",
    "OT_WAGES", "TAXABLE_SALARY", "TAXABLE_BENEFITS",
)

# ────────────────────────────────────────────────────────────────────────────
# 1. Employment profiles (data)
# ────────────────────────────────────────────────────────────────────────────

def _profile(code: str, label: str, wage_method: str, **extra) -> Dict[str, Any]:
    p = {
        "code": code,
        "label": label,
        "wage_method": wage_method,
        # How a "day" is counted for pro-ration / eligibility:
        # calendar | working | actual | scheduled | paid | divisor
        "day_basis": "actual",
        # Hourly workers: which hour classes earn which multipliers.
        "hour_multipliers": {"normal": 1.0, "overtime": 1.5, "night": 1.25,
                             "holiday": 2.0, "weekend": 2.0},
        # Piece-rate workers: minimum guarantee when enabled.
        "minimum_guarantee_per_day": None,
        # Default statutory-eligibility profile hint (rules decide for real).
        "statutory_hint": "standard",
    }
    p.update(extra)
    return p


EMPLOYMENT_PROFILES: Dict[str, Dict[str, Any]] = {
    "MONTHLY": _profile("MONTHLY", "Monthly salaried", "month_salary"),
    "DAILY": _profile("DAILY", "Daily wage worker", "rate_days", day_basis="actual"),
    "HOURLY": _profile("HOURLY", "Hourly worker", "rate_hours", day_basis="actual"),
    "WEEKLY": _profile("WEEKLY", "Weekly paid", "month_salary", day_basis="working"),
    "BIWEEKLY": _profile("BIWEEKLY", "Bi-weekly paid", "month_salary", day_basis="working"),
    "SEMI_MONTHLY": _profile("SEMI_MONTHLY", "Semi-monthly paid", "month_salary", day_basis="working"),
    "PIECE_RATE": _profile("PIECE_RATE", "Piece-rate worker", "units_rate"),
    "COMMISSION": _profile("COMMISSION", "Commission-based", "composite",
                           statutory_hint="standard"),
    "CONTRACT": _profile("CONTRACT", "Contract worker", "rate_days",
                         statutory_hint="contractor"),
    "TEMPORARY": _profile("TEMPORARY", "Temporary employee", "rate_days"),
    "PART_TIME": _profile("PART_TIME", "Part-time employee", "rate_hours"),
    "FULL_TIME": _profile("FULL_TIME", "Full-time employee", "month_salary"),
    "APPRENTICE": _profile("APPRENTICE", "Apprentice/trainee", "month_salary",
                           statutory_hint="apprentice"),
    "TRAINEE": _profile("TRAINEE", "Trainee", "month_salary", statutory_hint="apprentice"),
    "CONSULTANT": _profile("CONSULTANT", "Consultant", "composite", statutory_hint="none"),
    "GOVERNMENT": _profile("GOVERNMENT", "Government employee", "month_salary",
                           day_basis="calendar", statutory_hint="government"),
    "PSU": _profile("PSU", "PSU employee", "month_salary", statutory_hint="psu"),
    "EXECUTIVE": _profile("EXECUTIVE", "Executive", "month_salary", statutory_hint="standard"),
    "CUSTOM": _profile("CUSTOM", "Custom", "composite"),
}


def resolve_employment_profile(
    code: str,
    db=None,
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
    as_of=None,
) -> Dict[str, Any]:
    """Built-in profile merged with any published org override rule.

    The override is an ordinary versioned rule:
      rule_type='employment_profile', rule_subtype=code,
      definition={"kind": "param", "value": {"wage_method": "rate_days", ...}}
    """
    key = (code or "").strip().upper()
    base = EMPLOYMENT_PROFILES.get(key)
    if base is None:
        raise UnknownWageMethodError(
            f"Unknown employment profile '{code}' — add it to EMPLOYMENT_PROFILES "
            f"or publish an 'employment_profile' rule for it"
        )
    profile = dict(base)
    if db is not None and organization_id is not None:
        from datetime import date as _date
        from services.rule_platform import resolve_with_trace
        resolved = resolve_with_trace(
            db, "employment_profile", as_of or _date.today(), country="",
            organization_id=organization_id, company_id=company_id,
            rule_subtype=key,
        )
        override = ((resolved.get("chosen") or {}).get("definition") or {}).get("value")
        if isinstance(override, dict):
            profile.update(override)
    if profile.get("wage_method") not in WAGE_METHODS:
        raise UnknownWageMethodError(
            f"Employment profile '{key}' requests unknown wage method "
            f"'{profile.get('wage_method')}' — the engine refuses to guess"
        )
    return profile


# ────────────────────────────────────────────────────────────────────────────
# 2. Wage methods (generic calculators)
# ────────────────────────────────────────────────────────────────────────────

def calculate_base_wages(
    profile: Mapping[str, Any],
    inputs: Mapping[str, Any],
) -> Dict[str, Any]:
    """Compute base earnings for any employment profile.

    inputs (all optional depending on the method):
      monthly_salary        - monthly amount (month_salary)
      daily_rate, days      - rate and eligible days (rate_days);
                              days may be float (half days)
      hourly_rate, hours    - rate and paid hours (rate_hours)
      hours_by_class        - {"normal": 168, "overtime": 8, "night": 16, ...}
      units, rate_per_unit  - production (units_rate)
      production_slabs      - [{"from": 0, "to": 40, "rate": 10}, ...]
      minimum_guarantee     - floor for the period (units_rate / rate_days)
      factor                - pro-ration factor (default 1.0)
      expression, context   - composite method (DSL over the context)

    Returns {"earnings": float, "detail": {...explainability...}}.
    """
    method = (profile or {}).get("wage_method")
    factor = float(inputs.get("factor", 1.0) or 1.0)
    detail: Dict[str, Any] = {"wage_method": method, "factor": factor}

    if method == "month_salary":
        monthly = float(inputs.get("monthly_salary", 0) or 0)
        earnings = round(monthly * factor, 2)
        detail.update({"monthly_salary": monthly})
        return {"earnings": earnings, "detail": detail}

    if method == "rate_days":
        rate = float(inputs.get("daily_rate", 0) or 0)
        days = float(inputs.get("days", 0) or 0)
        earnings = round(rate * days * factor, 2)
        detail.update({"daily_rate": rate, "days": days})
        floor = inputs.get("minimum_guarantee")
        if floor is not None and earnings < float(floor):
            earnings = round(float(floor), 2)
            detail["minimum_guarantee_applied"] = True
        return {"earnings": earnings, "detail": detail}

    if method == "rate_hours":
        rate = float(inputs.get("hourly_rate", 0) or 0)
        multipliers = dict(profile.get("hour_multipliers") or {})
        classes = inputs.get("hours_by_class")
        if classes:
            total = 0.0
            per_class = {}
            for cls, hrs in classes.items():
                mult = float(multipliers.get(cls, 1.0) or 1.0)
                amt = round(rate * float(hrs or 0) * mult, 2)
                per_class[cls] = {"hours": float(hrs or 0), "multiplier": mult, "amount": amt}
                total += amt
            detail["hours_by_class"] = per_class
            return {"earnings": round(total, 2), "detail": detail}
        hours = float(inputs.get("hours", 0) or 0)
        earnings = round(rate * hours * factor, 2)
        detail.update({"hourly_rate": rate, "hours": hours})
        return {"earnings": earnings, "detail": detail}

    if method == "units_rate":
        units = float(inputs.get("units", 0) or 0)
        rate = float(inputs.get("rate_per_unit", 0) or 0)
        slabs = inputs.get("production_slabs")
        if slabs:
            # Progressive production slabs (in units): each band pays its rate
            # on the units that fall inside it.
            total = 0.0
            remaining = units
            band_prev = 0.0
            slab_detail = []
            for s in sorted(slabs, key=lambda s: float(s.get("from", 0) or 0)):
                lo = float(s.get("from", 0) or 0)
                hi = s.get("to")
                hi = float("inf") if hi is None else float(hi)
                band = max(0.0, min(units, hi) - max(band_prev, lo))
                if band > 0:
                    amt = round(band * float(s.get("rate", rate) or 0), 2)
                    total += amt
                    slab_detail.append({"units": band, "rate": float(s.get("rate", rate) or 0), "amount": amt})
                band_prev = lo
            detail["production_slabs"] = slab_detail
            earnings = round(total, 2)
        else:
            earnings = round(units * rate * factor, 2)
        detail.update({"units": units, "rate_per_unit": rate})
        floor = inputs.get("minimum_guarantee")
        if floor is not None and earnings < float(floor):
            earnings = round(float(floor), 2)
            detail["minimum_guarantee_applied"] = True
        return {"earnings": earnings, "detail": detail}

    if method == "composite":
        expr = inputs.get("expression") or profile.get("expression")
        if not expr:
            raise RuleExpressionError("composite wage method requires an 'expression'")
        value = evaluate_expression_safe(expr, dict(inputs.get("context") or {}))
        detail["expression"] = expr
        return {"earnings": round(float(value or 0), 2), "detail": detail}

    raise UnknownWageMethodError(
        f"Unknown wage method '{method}' — the engine refuses to guess a calculation"
    )


def evaluate_expression_safe(expr: str, context: Dict[str, Any]):
    from services.rule_dsl import evaluate_expression
    return evaluate_expression(expr, context)


# ────────────────────────────────────────────────────────────────────────────
# 3. Named wage bases (rule-driven, defaults are rule-shaped data)
# ────────────────────────────────────────────────────────────────────────────

# Built-in DEFAULT definitions. Organizations override any base by publishing a
# 'wage_definition' rule (rule_subtype=base code). Nothing in the engine is
# hard-coded: these are simply the initial configuration rows shipped in code.
DEFAULT_WAGE_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "BASIC": {"kind": "param", "value": None},  # pass-through of the computed basic
    "DA": {"kind": "param", "value": None},
    "WAGES": {"kind": "formula", "expr": "BASIC + DA"},
    "GROSS_WAGES": {"kind": "param", "value": None},  # pass-through of gross
    "STATUTORY_WAGES": {"kind": "formula", "expr": "BASIC + DA"},
    "PF_WAGES": {"kind": "formula", "expr": "MIN(BASIC + DA, PF_WAGE_CEILING)",
                 "params": {"PF_WAGE_CEILING": 15000.0}},
    "ESI_WAGES": {"kind": "formula", "expr": "GROSS_WAGES"},
    "BONUS_WAGES": {"kind": "formula", "expr": "MIN(GROSS_WAGES, BONUS_WAGE_CEILING)",
                    "params": {"BONUS_WAGE_CEILING": 21000.0}},
    "GRATUITY_WAGES": {"kind": "formula", "expr": "BASIC + DA"},
    "OT_WAGES": {"kind": "formula", "expr": "BASIC + DA"},
    "TAXABLE_SALARY": {"kind": "formula", "expr": "GROSS_WAGES"},
    "TAXABLE_BENEFITS": {"kind": "param", "value": 0.0},
}


def resolve_wage_bases(
    totals: Mapping[str, Any],
    db=None,
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
    as_of=None,
    bases: Tuple[str, ...] = WAGE_BASES,
) -> Dict[str, Any]:
    """Compute named wage bases from a component-total context.

    totals binds at least: BASIC, DA, GROSS_WAGES (and anything custom rules
    reference). Each base resolves through the 'wage_definition' rule of the
    same name when published, else the built-in default definition.

    Returns {"bases": {...}, "resolved_from": {base: "rule"|"default"}} so
    payslip explainability can name the source of every figure.
    """
    ctx: Dict[str, Any] = {
        "BASIC": float(totals.get("BASIC") or 0),
        "DA": float(totals.get("DA") or 0),
        "GROSS_WAGES": float(totals.get("GROSS_WAGES") or 0),
    }
    for key, val in totals.items():
        ctx.setdefault(key, val)

    out: Dict[str, Any] = {}
    source: Dict[str, str] = {}
    for base in bases:
        definition = None
        origin = "default"
        if db is not None and organization_id is not None:
            from datetime import date as _date
            from services.rule_platform import resolve_with_trace
            resolved = resolve_with_trace(
                db, "wage_definition", as_of or _date.today(), country="",
                organization_id=organization_id, company_id=company_id,
                rule_subtype=base,
            )
            chosen = (resolved.get("chosen") or {}).get("definition")
            if chosen:
                definition, origin = chosen, "rule"
        if definition is None:
            definition = DEFAULT_WAGE_DEFINITIONS.get(base)
            origin = "default"
        if definition is None:
            raise MissingInputError(base)
        value = evaluate_definition(definition, ctx)
        if value is None:
            # pass-through bases (BASIC/DA/GROSS) fall back to the raw total
            value = ctx.get(base, 0)
        out[base] = value
        source[base] = origin
    return {"bases": out, "resolved_from": source}
