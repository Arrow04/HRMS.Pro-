"""
Statutory Rule Engine
====================
A versioned, effective-dated rule evaluation engine for Indian (and global)
payroll statutory compliance.

Design principles:
1. NO hardcoded rates in calculation code — every rate/formula lives in the DB
2. Effective dating — when EPFO changes rules, INSERT a new row; old payrolls
   keep using the old rule, new payrolls use the new rule
3. Hierarchy — country defaults < state overrides < org overrides
4. Audit trail — every rule has notification_number, gazette_url, dates
5. Formula support — rules can contain evaluatable expressions

Usage:
    engine = StatutoryRuleEngine(db)
    rule = engine.resolve('pf_contribution', date(2026, 7, 1), 'India', 'KA', org_id=21)
    pf_wages = engine.calculate_pf_wages(basic_full=50000, rule=rule)
    pf_emp = engine.calculate('pf_contribution', 'employee', basic=50000, rule=rule)
"""
from __future__ import annotations
import ast
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class StatutoryRuleEngine:
    """Resolves and evaluates statutory rules for payroll calculation."""

    def __init__(self, db: Session):
        self.db = db
        self._cache: Dict[str, Any] = {}

    def resolve(
        self,
        rule_type: str,
        as_of: date,
        country: str = '',
        state_code: Optional[str] = None,
        organization_id: Optional[int] = None,
        company_id: Optional[int] = None,
    ) -> Optional[Dict]:
        """Find the active statutory rule for the given parameters.

        Resolution order (most specific wins):
        1. Company-specific rule
        2. Org-specific rule with matching state
        3. Org-specific rule with NULL state (all-states default)
        4. Country + state rule
        5. Country-wide rule (NULL state)
        6. None (caller falls back to legacy StatutorySetting)
        """
        from models import StatutoryRule

        cache_key = f"{rule_type}:{as_of}:{country}:{state_code}:{organization_id}:{company_id}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        from sqlalchemy import func
        q = (
            self.db.query(StatutoryRule)
            .filter(
                StatutoryRule.rule_type == rule_type,
                StatutoryRule.deleted_at.is_(None),
                StatutoryRule.status.in_(['active', 'superseded']),
                func.lower(StatutoryRule.country) == func.lower(country),
                StatutoryRule.effective_from <= as_of,
                (
                    (StatutoryRule.effective_to.is_(None))
                    | (StatutoryRule.effective_to >= as_of)
                ),
            )
        )

        candidates = []

        # 1. Company-specific rules (highest priority)
        if company_id is not None:
            company_rules = q.filter(
                StatutoryRule.company_id == company_id,
            ).order_by(
                StatutoryRule.state_code.is_(None),
                StatutoryRule.effective_from.desc(),
            ).all()
            candidates.extend(company_rules)

        # 2. Org-specific rules
        if organization_id:
            org_rules = q.filter(
                StatutoryRule.organization_id == organization_id,
                StatutoryRule.company_id.is_(None),
            ).order_by(
                StatutoryRule.state_code.is_(None),
                StatutoryRule.effective_from.desc(),
            ).all()
            candidates.extend(org_rules)

        # 3. Country + state
        if state_code:
            state_rules = q.filter(
                StatutoryRule.organization_id.is_(None),
                StatutoryRule.company_id.is_(None),
                StatutoryRule.state_code == state_code,
            ).order_by(StatutoryRule.effective_from.desc()).all()
            candidates.extend(state_rules)

        # 4. Country-wide
        country_rules = q.filter(
            StatutoryRule.organization_id.is_(None),
            StatutoryRule.company_id.is_(None),
            StatutoryRule.state_code.is_(None),
        ).order_by(StatutoryRule.effective_from.desc()).all()
        candidates.extend(country_rules)

        result = None
        if candidates:
            def specificity(r):
                has_company = 0 if r.company_id else 1
                has_org = 0 if r.organization_id else 1
                has_state = 0 if r.state_code else 1
                return (has_company, has_org, has_state, -r.effective_from.toordinal(), -(getattr(r, 'version', 1) or 1))
            candidates.sort(key=specificity)
            result = candidates[0]

        if result:
            self._cache[cache_key] = result.definition
            return result.definition

        return None

    def resolve_raw(
        self,
        rule_type: str,
        as_of: date,
        country: str = '',
        state_code: Optional[str] = None,
        organization_id: Optional[int] = None,
    ) -> Optional[Any]:
        """Return the full StatutoryRule ORM object (not just definition dict)."""
        from models import StatutoryRule

        q = (
            self.db.query(StatutoryRule)
            .filter(
                StatutoryRule.rule_type == rule_type,
                StatutoryRule.deleted_at.is_(None),
                StatutoryRule.status.in_(['active', 'superseded']),
                StatutoryRule.country == country,
                StatutoryRule.effective_from <= as_of,
                (
                    (StatutoryRule.effective_to.is_(None))
                    | (StatutoryRule.effective_to >= as_of)
                ),
            )
        )

        candidates = []
        if organization_id:
            org_rules = q.filter(
                StatutoryRule.organization_id == organization_id
            ).order_by(StatutoryRule.state_code.is_(None), StatutoryRule.effective_from.desc()).all()
            candidates.extend(org_rules)
        if state_code:
            state_rules = q.filter(
                StatutoryRule.organization_id.is_(None),
                StatutoryRule.state_code == state_code,
            ).order_by(StatutoryRule.effective_from.desc()).all()
            candidates.extend(state_rules)
        country_rules = q.filter(
            StatutoryRule.organization_id.is_(None),
            StatutoryRule.state_code.is_(None),
        ).order_by(StatutoryRule.effective_from.desc()).all()
        candidates.extend(country_rules)

        if candidates:
            def specificity(r):
                return (0 if r.company_id else 1, 0 if r.organization_id else 1, 0 if r.state_code else 1, -r.effective_from.toordinal(), -(getattr(r, 'version', 1) or 1))
            candidates.sort(key=specificity)
            return candidates[0]

        return None

    def list_active_rules(
        self,
        as_of: date,
        country: str = '',
        organization_id: Optional[int] = None,
        company_id: Optional[int] = None,
    ) -> List[Dict]:
        """List all active statutory rules for a given date/country/org/company."""
        from models import StatutoryRule

        q = (
            self.db.query(StatutoryRule)
            .filter(
                StatutoryRule.deleted_at.is_(None),
                StatutoryRule.status.in_(['active', 'superseded']),
                StatutoryRule.country == country,
                StatutoryRule.effective_from <= as_of,
                (
                    (StatutoryRule.effective_to.is_(None))
                    | (StatutoryRule.effective_to >= as_of)
                ),
            )
            .order_by(StatutoryRule.rule_type, StatutoryRule.effective_from.desc())
        )
        if organization_id:
            if company_id is not None:
                # Company-specific rules take priority, then org-level, then country-wide
                q = q.filter(
                    (StatutoryRule.company_id == company_id)
                    | (StatutoryRule.company_id.is_(None) & (StatutoryRule.organization_id == organization_id))
                    | (StatutoryRule.company_id.is_(None) & StatutoryRule.organization_id.is_(None))
                )
            else:
                q = q.filter(
                    (StatutoryRule.organization_id == organization_id)
                    | (StatutoryRule.organization_id.is_(None))
                )
        else:
            q = q.filter(StatutoryRule.organization_id.is_(None))

        return [
            {
                'rule_type': r.rule_type,
                'rule_subtype': r.rule_subtype,
                'state_code': r.state_code,
                'effective_from': str(r.effective_from),
                'effective_to': str(r.effective_to) if r.effective_to else None,
                'definition': r.definition,
                'notification_number': r.notification_number,
            }
            for r in q.all()
        ]

    # ── PF Calculations ──

    def calculate_pf(
        self,
        basic_full: float,
        as_of: date,
        country: str = '',
        state_code: Optional[str] = None,
        organization_id: Optional[int] = None,
        voluntary_pf: Optional[Dict] = None,
    ) -> Dict[str, float]:
        """Calculate all PF components using the rule engine.

        Returns:
            {
                'pf_wages': float,
                'pf_employee': float,
                'pf_employer': float,
                'pf_exempt': bool,
                'eps': float,
                'edli': float,
                'admin': float,
                'voluntary_employee': float,
                'voluntary_employer': float,
            }
        """
        rule = self.resolve('pf_contribution', as_of, country, state_code, organization_id)
        exclusion_rule = self.resolve('pf_exclusion', as_of, country, state_code, organization_id)

        # No rule found — return zeros. User must configure rules for their country.
        if not rule:
            rule = {
                'rate': 0.0,
                'wage_ceiling': 0.0,
                'max_monthly': 0.0,
                'eps_rate': 0.0,
                'edli_rate': 0.0,
                'edli_max': 0.0,
                'admin_rate': 0.0,
                'admin_min': 0.0,
                'eps_wage_ceiling': 0.0,
            }
        if not exclusion_rule:
            exclusion_rule = {'enabled': False, 'wage_threshold': 0, 'exclude_both': False}

        rate = float(rule.get('rate', 0.0))
        ceiling = float(rule.get('wage_ceiling', 0.0))
        max_monthly = float(rule.get('max_monthly', 0.0))
        eps_rate = float(rule.get('eps_rate', 0.0))
        edli_rate = float(rule.get('edli_rate', 0.0))
        edli_max = float(rule.get('edli_max', 0.0))
        admin_rate = float(rule.get('admin_rate', 0.0))
        admin_min = float(rule.get('admin_min', 0.0))
        eps_ceiling = float(rule.get('eps_wage_ceiling', 15000.0))

        # Exclusion check
        pf_exempt = False
        if exclusion_rule.get('enabled', False):
            threshold = float(exclusion_rule.get('wage_threshold', 15000))
            if basic_full > threshold:
                pf_exempt = True

        # PF wages = min(basic, ceiling)
        pf_wages = min(basic_full, ceiling)

        if pf_exempt:
            pf_employee = 0.0
            pf_employer = 0.0
            eps = 0.0
            edli = 0.0
            admin = 0.0
        else:
            pf_employee = min(pf_wages * rate / 100, max_monthly)
            pf_employer = min(pf_wages * rate / 100, max_monthly)
            eps = min(pf_wages, eps_ceiling) * eps_rate / 100
            edli = min(pf_wages * edli_rate / 100, edli_max)
            admin = max(pf_wages * admin_rate / 100, admin_min)

        # Voluntary PF (EPF Scheme 2026 §12)
        vol_emp = 0.0
        vol_er = 0.0
        if voluntary_pf and not pf_exempt:
            vol_rate = float(voluntary_pf.get('voluntary_rate', 0))
            vol_amount = float(voluntary_pf.get('voluntary_amount', 0))
            if vol_amount > 0:
                vol_emp = vol_amount
            elif vol_rate > 0:
                vol_emp = min(basic_full * vol_rate / 100, max_monthly) - pf_employee
                vol_emp = max(0, vol_emp)
            if voluntary_pf.get('employer_matching'):
                vol_er = vol_emp
            elif float(voluntary_pf.get('employer_voluntary_rate', 0)) > 0:
                er_rate = float(voluntary_pf['employer_voluntary_rate'])
                vol_er = min(basic_full * er_rate / 100, max_monthly) - pf_employer
                vol_er = max(0, vol_er)

        return {
            'pf_wages': round(pf_wages, 2),
            'pf_employee': round(pf_employee, 2),
            'pf_employer': round(pf_employer, 2),
            'pf_exempt': pf_exempt,
            'eps': round(eps, 2),
            'edli': round(edli, 2),
            'admin': round(admin, 2),
            'voluntary_employee': round(vol_emp, 2),
            'voluntary_employer': round(vol_er, 2),
        }

    # ── ESI Calculations ──

    def calculate_esi(
        self,
        gross_salary: float,
        as_of: date,
        country: str = '',
        state_code: Optional[str] = None,
        organization_id: Optional[int] = None,
        is_disabled: bool = False,
        keep_covered: bool = False,
    ) -> Dict[str, float]:
        """Calculate ESI using the rule engine."""
        rule = self.resolve('esi_contribution', as_of, country, state_code, organization_id)

        if not rule:
            rule = {
                'employee_rate': 0.0,
                'employer_rate': 0.0,
                'gross_ceiling': 0.0,
                'disabled_ceiling': 0.0,
            }

        emp_rate = float(rule.get('employee_rate', 0.0))
        er_rate = float(rule.get('employer_rate', 0.0))
        ceiling = float(rule.get('disabled_ceiling' if is_disabled else 'gross_ceiling', 0.0))

        applicable = gross_salary <= ceiling or (keep_covered and ceiling > 0)

        return {
            'esi_applicable': applicable,
            'esi_employee': round(gross_salary * emp_rate / 100, 2) if applicable else 0.0,
            'esi_employer': round(gross_salary * er_rate / 100, 2) if applicable else 0.0,
            'esi_ceiling': ceiling,
        }

    # ── Professional Tax ──

    def calculate_professional_tax(
        self,
        gross_salary: float,
        as_of: date,
        country: str = '',
        state_code: Optional[str] = None,
        organization_id: Optional[int] = None,
    ) -> float:
        """Calculate professional tax using the rule engine."""
        rule = self.resolve('professional_tax', as_of, country, state_code, organization_id)

        if not rule:
            return 0.0

        slabs = rule.get('slabs', [])
        for slab in slabs:
            lower = float(slab.get('from_gross', 0))
            upper = slab.get('to_gross')
            upper_val = float(upper) if upper is not None else float('inf')
            if lower <= gross_salary < upper_val:
                return float(slab.get('amount', 0))

        return 0.0

    # ── Bonus ──

    def calculate_bonus(
        self,
        gross_salary: float,
        as_of: date,
        country: str = '',
        state_code: Optional[str] = None,
        organization_id: Optional[int] = None,
    ) -> Dict[str, float]:
        """Calculate statutory bonus using the rule engine."""
        rule = self.resolve('bonus', as_of, country, state_code, organization_id)

        if not rule:
            return {'bonus_applicable': False, 'bonus_amount': 0.0}

        applicable = bool(rule.get('applicable', False))
        min_rate = float(rule.get('min_rate', 0.0))
        wage_ceiling = float(rule.get('wage_ceiling', 0.0))

        bonus_wages = min(gross_salary, wage_ceiling)
        bonus_monthly = round(bonus_wages * min_rate / 100, 2) if applicable else 0.0

        return {
            'bonus_applicable': applicable,
            'bonus_amount': bonus_monthly,
            'bonus_wages': bonus_wages,
            'min_rate': min_rate,
        }

    # ── Tax Slabs ──

    def calculate_income_tax(
        self,
        annual_taxable: float,
        as_of: date,
        country: str = '',
        state_code: Optional[str] = None,
        organization_id: Optional[int] = None,
        regime: str = 'new',
    ) -> Dict[str, float]:
        """Calculate income tax using rule engine tax slabs."""
        rule = self.resolve('tax_slab', as_of, country, state_code, organization_id)

        if not rule or rule.get('regime') != regime:
            return {'base_tax': 0.0, 'surcharge': 0.0, 'cess': 0.0, 'total_tax': 0.0}

        slabs = rule.get('slabs', [])
        std_deduction = float(rule.get('standard_deduction', 0))
        rebate_threshold = float(rule.get('rebate_threshold', 0))
        rebate_amount = float(rule.get('rebate_amount', 0))
        cess_rate = float(rule.get('cess_rate', 0))

        # Apply slabs
        base_tax = 0.0
        prev = 0.0
        sorted_slabs = sorted(slabs, key=lambda s: float(s.get('from', 0)))
        for slab in sorted_slabs:
            lower = float(slab.get('from', 0))
            upper = slab.get('to')
            upper_val = float(upper) if upper is not None else float('inf')
            rate = float(slab.get('rate', 0))
            taxable = min(annual_taxable, upper_val) - max(prev, lower)
            if taxable > 0:
                base_tax += taxable * rate / 100
            prev = upper_val

        # Rebate with new-regime marginal relief + surcharge with marginal
        # relief (shared engine helper so rule-driven tax matches DB-driven tax).
        from services.compliance_engine import apply_tax_relief
        surcharge_slabs = rule.get('surcharge', [])
        base_tax, _rebate_given, surcharge = apply_tax_relief(
            base_tax, annual_taxable, sorted_slabs,
            rebate_threshold=rebate_threshold,
            rebate_amount=rebate_amount,
            regime_type=regime,
            surcharge_slabs=surcharge_slabs,
        )

        cess = (base_tax + surcharge) * cess_rate / 100

        return {
            'base_tax': round(base_tax, 2),
            'surcharge': round(surcharge, 2),
            'cess': round(cess, 2),
            'total_tax': round(base_tax + surcharge + cess, 2),
        }

    # ── Gratuity ──

    def calculate_gratuity(
        self,
        basic: float,
        as_of: date,
        country: str = '',
        organization_id: Optional[int] = None,
    ) -> float:
        """Calculate monthly gratuity provision using the rule engine."""
        rule = self.resolve('gratuity', as_of, country, None, organization_id)

        if not rule:
            return 0.0

        rate = float(rule.get('rate', 0.0))
        applicable = bool(rule.get('applicable', False))

        return round(basic * rate / 100, 2) if applicable else 0.0

    # ── Overtime ──

    def calculate_overtime_rate(
        self,
        basic: float,
        working_days: int,
        as_of: date,
        country: str = '',
        organization_id: Optional[int] = None,
    ) -> Dict[str, float]:
        """Calculate overtime hourly rate using the rule engine."""
        rule = self.resolve('overtime', as_of, country, None, organization_id)

        if not rule:
            return {'hourly_rate': 0.0, 'multiplier': 0.0, 'threshold_hours': 0.0}

        multiplier = float(rule.get('multiplier', 0.0))
        threshold = float(rule.get('threshold_hours', 0.0))
        hourly = (basic / working_days / threshold) if (working_days > 0 and threshold > 0) else 0.0

        return {
            'hourly_rate': round(hourly, 2),
            'multiplier': multiplier,
            'threshold_hours': threshold,
        }
