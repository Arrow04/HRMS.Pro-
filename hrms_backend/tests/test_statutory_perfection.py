"""Statutory perfection: dead fields wired, bonus ceilings split, ESI low-wage rule."""
from datetime import datetime, date

from models import Employee, Organization, StatutorySetting
from routers.payroll_templates import STATUTORY_KEYS, _clean_statutory
from services.compliance_engine import (
    apply_tax_relief,
    calculate_bonus,
    calculate_esi,
    calculate_pf,
    esi_employee_exempt,
)
from services.payroll_service import _apply_statutory_overlay
from services.retirement_engine import calculate_nps


class TestTemplateKeysPersist:
    def test_new_keys_survive_clean(self):
        raw = {
            "pf_employee_rate": 12.0,
            "eps_employer_rate": 5.0,
            "nps_employee_rate": 10.0,
            "nps_employer_rate": 12.0,
            "bonus_eligible_ceiling": 21000.0,
            "bonus_wage_ceiling": 7000.0,
            "unknown_key": 1,
        }
        out = _clean_statutory(raw)
        assert out["eps_employer_rate"] == 5.0
        assert out["nps_employee_rate"] == 10.0
        assert out["nps_employer_rate"] == 12.0
        assert out["bonus_eligible_ceiling"] == 21000.0
        assert "unknown_key" not in out

    def test_overlay_applies_new_keys_and_null_inherits(self):
        base = StatutorySetting(
            organization_id=1, eps_employer_rate=8.33,
            nps_employee_rate=10.0, bonus_eligible_ceiling=21000.0,
        )
        _apply_statutory_overlay(base, {"eps_employer_rate": 5.0, "nps_employee_rate": None})
        assert base.eps_employer_rate == 5.0
        assert base.nps_employee_rate == 10.0  # null = inherit


class TestEpsRatePreference:
    def _setting(self, **kw):
        args = dict(
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=3.67,
            pf_wage_ceiling=15000.0, pf_max_monthly=1800.0,
            pf_min_basic_for_exclusion=15000.0, pf_edli_rate=0.5,
            pf_edli_max_monthly=75.0, pf_admin_rate=0.5, pf_admin_min_monthly=75.0,
            eps_wage_ceiling=15000.0,
        )
        args.update(kw)
        return StatutorySetting(**args)

    def test_new_field_wins_over_legacy(self):
        out = calculate_pf(20000.0, self._setting(eps_rate=8.33, eps_employer_rate=5.0))
        assert out["eps"] == 750.0

    def test_legacy_field_still_works(self):
        out = calculate_pf(20000.0, self._setting(eps_rate=8.33))
        assert out["eps"] == 1249.5


class TestNpsFallback:
    def test_statutory_rates_used_without_published_rule(self, db_session):
        org = Organization(name="NPS Fallback Org", code="NPSFB")
        db_session.add(org)
        db_session.flush()
        db_session.add(StatutorySetting(
            organization_id=org.id, status="active",
            nps_employee_rate=10.0, nps_employer_rate=12.0,
        ))
        emp = Employee(
            first_name="Nps", last_name="User", email="nps.fb@example.com",
            employee_code="NPS001", organization_id=org.id,
            base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
            nps_applicable=True,
        )
        db_session.add(emp)
        db_session.flush()
        out = calculate_nps(db_session, emp, {"BASIC": 50000.0, "DA": 0.0, "GROSS": 60000.0}, as_of=date(2026, 6, 1))
        assert out["applicable"] is True
        assert out["employee"] == 5000.0
        assert out["employer"] == 6000.0

    def test_flag_off_stays_off(self, db_session):
        org = Organization(name="NPS Off Org", code="NPSOFF")
        db_session.add(org)
        db_session.flush()
        db_session.add(StatutorySetting(
            organization_id=org.id, status="active",
            nps_employee_rate=10.0, nps_employer_rate=12.0,
        ))
        emp = Employee(
            first_name="Nps", last_name="Off", email="nps.off@example.com",
            employee_code="NPS002", organization_id=org.id,
            base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
            nps_applicable=False,
        )
        db_session.add(emp)
        db_session.flush()
        out = calculate_nps(db_session, emp, {"BASIC": 50000.0, "DA": 0.0, "GROSS": 60000.0}, as_of=date(2026, 6, 1))
        assert out["applicable"] is False
        assert out["employee"] == 0.0


class TestEsiLowWageExemption:
    def _setting(self):
        return StatutorySetting(
            esi_applicable=True, esi_employee_rate=0.75, esi_employer_rate=3.25,
            esi_gross_ceiling=21000.0, esi_disabled_ceiling=25000.0,
        )

    def test_below_176_exempts_employee_share(self):
        assert esi_employee_exempt(4000.0) is True
        out = calculate_esi(4000.0, self._setting())
        assert out["employee"] == 0.0
        assert out["employer"] == 130.0

    def test_above_176_normal_rates(self):
        assert esi_employee_exempt(21000.0) is False
        out = calculate_esi(21000.0, self._setting())
        assert out["employee"] == 157.5
        assert out["employer"] == 682.5


class TestBonusCeilings:
    def test_earner_above_calc_cap_uses_cap(self):
        out = calculate_bonus(20000.0, 12)
        assert out["eligible"] is True
        assert out["minimum"] == 6997.2  # 7000 x 8.33%

    def test_earner_above_eligibility_gets_nothing(self):
        out = calculate_bonus(25000.0, 12)
        assert out["eligible"] is False
        assert out["minimum"] == 0.0

    def test_defaults_match_the_act(self):
        out = calculate_bonus(6000.0, 12)
        assert out["minimum"] == 5997.6
        assert out["maximum"] == 14400.0
