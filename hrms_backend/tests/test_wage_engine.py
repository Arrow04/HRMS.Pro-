"""Wage engine tests: employment profiles, wage methods (daily/hourly/
piece-rate/composite), named wage bases, and rule-driven overrides.

Includes mandate scenarios as assertions (e.g. the daily worker:
650/day x 24 eligible days) and the mandate's "unknown capability must be
identified, never guessed" behaviour.
"""
import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_test",
)
os.environ["ALLOW_SQLITE_FALLBACK"] = "false"
os.environ["RUN_SCHEMA_SYNC"] = "false"
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

from datetime import date

import pytest
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine
from services.rule_dsl import MissingInputError, RuleExpressionError
from services.wage_engine import (
    EMPLOYMENT_PROFILES,
    UnknownWageMethodError,
    calculate_base_wages,
    resolve_employment_profile,
    resolve_wage_bases,
)


def teardown_module():
    """Leave no rule rows behind: a killed run must never poison the next."""
    s = sessionmaker(bind=app_engine)()
    try:
        from models import PayrollComponent, StatutoryRule
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_type.in_(["employment_profile", "wage_definition"]),
        ).delete(synchronize_session=False)
        s.query(PayrollComponent).filter(
            PayrollComponent.name == "Uniform Allowance",
        ).delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


class TestEmploymentProfiles:
    def test_all_mandated_profiles_exist(self):
        required = {
            "MONTHLY", "DAILY", "HOURLY", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY",
            "PIECE_RATE", "COMMISSION", "CONTRACT", "TEMPORARY", "PART_TIME",
            "FULL_TIME", "APPRENTICE", "TRAINEE", "CONSULTANT", "GOVERNMENT",
            "PSU", "EXECUTIVE", "CUSTOM",
        }
        assert required <= set(EMPLOYMENT_PROFILES)

    def test_unknown_profile_is_explicit(self):
        with pytest.raises(UnknownWageMethodError):
            resolve_employment_profile("ALIEN")

    def test_org_override_is_configuration_only(self):
        """Mandate: profiles are data; orgs override via a published rule."""
        Base.metadata.create_all(bind=app_engine)
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Organization, StatutoryRule, User
            from core.auth import get_password_hash
            org = s.query(Organization).filter(Organization.code == "WAGETEST").first()
            if not org:
                org = Organization(name="Wage Test Org", code="WAGETEST", status="active")
                s.add(org)
                s.commit()
                s.refresh(org)
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "employment_profile",
                StatutoryRule.organization_id == org.id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="employment_profile", rule_subtype="DAILY",
                country="", organization_id=org.id,
                effective_from=date(2026, 1, 1), status="active", version=1,
                definition={"kind": "param", "value": {
                    "wage_method": "rate_days",
                    "minimum_guarantee_per_day": 500,
                }},
            ))
            s.commit()
            p = resolve_employment_profile("DAILY", db=s, organization_id=org.id)
            assert p["wage_method"] == "rate_days"
            assert p["minimum_guarantee_per_day"] == 500
        finally:
            s.close()

    def test_unknown_wage_method_in_override_is_refused(self):
        Base.metadata.create_all(bind=app_engine)
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Organization, StatutoryRule
            org = s.query(Organization).filter(Organization.code == "WAGETEST").first()
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "employment_profile",
                StatutoryRule.organization_id == org.id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="employment_profile", rule_subtype="DAILY",
                country="", organization_id=org.id,
                effective_from=date(2026, 1, 1), status="active", version=1,
                definition={"kind": "param", "value": {"wage_method": "astrology"}},
            ))
            s.commit()
            with pytest.raises(UnknownWageMethodError):
                resolve_employment_profile("DAILY", db=s, organization_id=org.id)
        finally:
            s.close()


class TestWageMethods:
    def test_daily_worker_mandate_scenario(self):
        """Mandate example: Rs.650/day x 24 eligible days = 15,600."""
        profile = EMPLOYMENT_PROFILES["DAILY"]
        out = calculate_base_wages(profile, {"daily_rate": 650, "days": 24})
        assert out["earnings"] == 15600
        assert out["detail"]["daily_rate"] == 650

    def test_monthly_with_pro_ration(self):
        profile = EMPLOYMENT_PROFILES["MONTHLY"]
        out = calculate_base_wages(profile, {"monthly_salary": 50000, "factor": 0.5})
        assert out["earnings"] == 25000

    def test_hourly_with_multipliers(self):
        profile = EMPLOYMENT_PROFILES["HOURLY"]
        out = calculate_base_wages(profile, {
            "hourly_rate": 200,
            "hours_by_class": {"normal": 168, "overtime": 8, "night": 16},
        })
        # 168*200*1.0 + 8*200*1.5 + 16*200*1.25 = 33600 + 2400 + 4000
        assert out["earnings"] == 40000
        assert out["detail"]["hours_by_class"]["overtime"]["multiplier"] == 1.5

    def test_piece_rate_slabs_and_minimum_guarantee(self):
        profile = EMPLOYMENT_PROFILES["PIECE_RATE"]
        out = calculate_base_wages(profile, {
            "units": 55,
            "production_slabs": [
                {"from": 0, "to": 50, "rate": 10},
                {"from": 50, "to": None, "rate": 12},
            ],
        })
        # 50*10 + 5*12 = 560
        assert out["earnings"] == 560

        out2 = calculate_base_wages(profile, {
            "units": 10, "rate_per_unit": 10, "minimum_guarantee": 300,
        })
        assert out2["earnings"] == 300
        assert out2["detail"]["minimum_guarantee_applied"] is True

    def test_composite_expression(self):
        profile = EMPLOYMENT_PROFILES["COMMISSION"]
        out = calculate_base_wages(profile, {
            "expression": "SALES * RATE / 100 + BASE",
            "context": {"SALES": 200000, "RATE": 5, "BASE": 10000},
        })
        assert out["earnings"] == 20000

    def test_unknown_method_refuses_to_guess(self):
        with pytest.raises(UnknownWageMethodError):
            calculate_base_wages({"wage_method": "vibes"}, {})


class TestWageBases:
    def test_default_bases_are_rule_shaped_data(self):
        res = resolve_wage_bases({"BASIC": 20000, "DA": 0, "GROSS_WAGES": 50000})
        b = res["bases"]
        assert b["WAGES"] == 20000            # BASIC + DA
        assert b["PF_WAGES"] == 15000         # MIN(20000, 15000 ceiling)
        assert b["ESI_WAGES"] == 50000
        assert b["BONUS_WAGES"] == 21000      # ceiling
        assert res["resolved_from"]["PF_WAGES"] == "default"

    def test_rule_override_changes_the_base_without_code(self):
        """Mandate: the wage base a statutory module uses is configuration."""
        Base.metadata.create_all(bind=app_engine)
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Organization, StatutoryRule
            org = s.query(Organization).filter(Organization.code == "WAGETEST").first()
            if not org:
                org = Organization(name="Wage Test Org", code="WAGETEST", status="active")
                s.add(org)
                s.commit()
                s.refresh(org)
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "wage_definition",
                StatutoryRule.organization_id == org.id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="wage_definition", rule_subtype="PF_WAGES",
                country="", organization_id=org.id,
                effective_from=date(2026, 1, 1), status="active", version=1,
                definition={"kind": "formula", "expr": "BASIC"},
            ))
            s.commit()
            res = resolve_wage_bases(
                {"BASIC": 20000, "DA": 2000, "GROSS_WAGES": 50000},
                db=s, organization_id=org.id,
            )
            assert res["bases"]["PF_WAGES"] == 20000   # rule: BASIC only
            assert res["resolved_from"]["PF_WAGES"] == "rule"
            assert res["resolved_from"]["ESI_WAGES"] == "default"
        finally:
            s.close()

    def test_missing_input_is_explicit(self):
        from services.rule_platform import evaluate_definition
        with pytest.raises(MissingInputError):
            evaluate_definition({"kind": "formula", "expr": "MYSTERY_WAGE * 2"}, {})


class TestRuleWiredPayrollCore:
    def test_payroll_core_picks_up_wage_definition_rules(self):
        """The payroll core's statutory wages follow published wage rules."""
        Base.metadata.create_all(bind=app_engine)
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Employee, Organization, StatutoryRule
            org = s.query(Organization).filter(Organization.code == "WAGETEST").first()
            if not org:
                org = Organization(name="Wage Test Org", code="WAGETEST", status="active")
                s.add(org)
                s.commit()
                s.refresh(org)
            emp = s.query(Employee).filter(Employee.employee_code == "WAGE-EMP").first()
            if not emp:
                emp = Employee(first_name="Wage", last_name="Tester", email="wage.tester@example.com",
                               employee_code="WAGE-EMP", organization_id=org.id,
                               base_salary=600000, status="active")
                s.add(emp)
                s.commit()
                s.refresh(emp)
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "wage_definition",
                StatutoryRule.organization_id == org.id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="wage_definition", rule_subtype="PF_WAGES",
                country="", organization_id=org.id,
                effective_from=date(2026, 1, 1), status="active", version=1,
                definition={"kind": "formula", "expr": "MIN(BASIC, 12000)"},
            ))
            s.commit()

            from services.payroll_service import _rule_wage_bases
            bases = _rule_wage_bases(s, emp, basic=20000, gross=50000, da=0, as_of=date(2026, 6, 1))
            assert bases is not None and bases["PF_WAGES"] == 12000

            # No rules -> legacy computation untouched
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "wage_definition",
                StatutoryRule.organization_id == org.id,
            ).delete(synchronize_session=False)
            s.commit()
            assert _rule_wage_bases(s, emp, basic=20000, gross=50000, da=0, as_of=date(2026, 6, 1)) is None
        finally:
            s.close()


class TestComponentApplicability:
    def test_component_flags_persist(self):
        Base.metadata.create_all(bind=app_engine)
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Organization, PayrollComponent
            org = s.query(Organization).filter(Organization.code == "WAGETEST").first()
            if not org:
                org = Organization(name="Wage Test Org", code="WAGETEST", status="active")
                s.add(org)
                s.commit()
                s.refresh(org)
            c = PayrollComponent(
                organization_id=org.id, name="Uniform Allowance",
                component_type="earning", calculation_type="fixed",
                calculation_value=1000,
                taxability="non_taxable", pf_applicable=False, esi_applicable=True,
                gratuity_applicable=False, nps_applicable=False,
                is_active=True, status="active",
            )
            s.add(c)
            s.commit()
            s.refresh(c)
            assert c.taxability == "non_taxable"
            assert c.pf_applicable is False
            assert c.esi_applicable is True
            assert c.nps_applicable is False
        finally:
            s.close()
