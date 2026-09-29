"""Tests for statutory rule config model and engine integration."""
import pytest
from models import StatutoryRuleConfig
from routers.statutory_rule_config import _row_to_dict
from datetime import date


class TestStatutoryRuleConfig:
    def test_row_to_dict(self):
        r = StatutoryRuleConfig(
            id=1, category='pf', rule_key='pf_wage_ceiling',
            label='PF Wage Ceiling', standard_value='₹25,000/month',
            current_value=25000.0, unit='money',
            notification_ref='S.O. 5109(E) dated 17 Sep 2026',
            legal_basis='Section 15 COSS 2020', effective_date=date(2026, 9, 17),
            description='Test description', status='active',
        )
        d = _row_to_dict(r)
        assert d['rule_key'] == 'pf_wage_ceiling'
        assert d['standard_value'] == '₹25,000/month'
        assert d['current_value'] == 25000.0
        assert d['effective_date'] == '2026-09-17'

    def test_engine_uses_dynamic_ceiling(self, db_session):
        """Verify that the engine uses the setting's value, not a hardcoded one."""
        from models import StatutorySetting
        setting = StatutorySetting(
            organization_id=1, status='active',
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=3.67,
            pf_wage_ceiling=25000.0, pf_max_monthly=3000.0,
        )
        from services.compliance_engine import calculate_pf
        result = calculate_pf(30000.0, setting)
        # With ceiling 25000: PF = 12% of 25000 = 3000 (capped at max_monthly)
        assert result['employee'] == 3000.0

    def test_engine_uses_old_ceiling(self, db_session):
        """Verify backward compatibility with old ₹15,000 ceiling."""
        from models import StatutorySetting
        setting = StatutorySetting(
            organization_id=1, status='active',
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=3.67,
            pf_wage_ceiling=15000.0, pf_max_monthly=1800.0,
        )
        from services.compliance_engine import calculate_pf
        result = calculate_pf(20000.0, setting)
        assert result['employee'] == 1800.0  # 12% of 15000 = 1800

    def test_seed_file_has_all_rules(self):
        """Verify the seed file covers all statutory fields."""
        from seed_statutory_rules import RULES
        keys = [r['rule_key'] for r in RULES]
        required = [
            'pf_employee_rate', 'pf_employer_rate', 'pf_wage_ceiling', 'pf_max_monthly',
            'eps_employer_rate', 'eps_wage_ceiling', 'pf_edli_rate', 'pf_edli_max_monthly',
            'pf_admin_rate', 'pf_admin_min_monthly', 'esi_employee_rate', 'esi_employer_rate',
            'esi_gross_ceiling', 'esi_disabled_ceiling', 'pt_monthly_amount', 'pt_min_gross',
            'lwf_employee_rate', 'lwf_employer_rate', 'nps_employee_rate', 'nps_employer_rate',
            'gratuity_rate', 'gratuity_eligible_years', 'gratuity_days_per_year',
            'gratuity_tax_exempt_ceiling', 'bonus_min_rate', 'bonus_max_rate',
            'bonus_eligible_ceiling', 'bonus_wage_ceiling',
            'esi_low_wage_daily_avg', 'esi_wage_days_divisor', 'basic_salary_fallback_pct',
        ]
        for k in required:
            assert k in keys, f"Missing rule_key: {k}"

    def test_engine_reads_esi_low_wage_from_config(self, db_session):
        """Engine reads ESI low-wage threshold from config, not hardcoded."""
        from models import StatutoryRuleConfig
        db_session.add(StatutoryRuleConfig(
            category='esi', rule_key='esi_low_wage_daily_avg',
            label='ESI Low-Wage Daily Avg', standard_value='₹176/day',
            current_value=176.0, unit='money', status='active',
        ))
        db_session.add(StatutoryRuleConfig(
            category='esi', rule_key='esi_wage_days_divisor',
            label='ESI Wage Days Divisor', standard_value='26',
            current_value=26.0, unit='num', status='active',
        ))
        db_session.flush()
        from services.compliance_engine import esi_employee_exempt
        # ₹176 × 26 = ₹4,576/month → monthly_gross ≤ 4576 is exempt
        assert esi_employee_exempt(4576.0, db_session) is True
        assert esi_employee_exempt(4577.0, db_session) is False
