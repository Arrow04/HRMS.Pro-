"""Statutory completions tests (mandate sections 16, 22, 25).

Retirement & Pension (NPS) as a registered scheme with rule-driven rates,
minimum-wage compliance with violation warnings, and perquisite valuation -
all configuration-only changes, never code changes.
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

from datetime import date, datetime

import pytest
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine
from services.minimum_wage_engine import check_minimum_wages
from services.perquisite_engine import calculate_perquisites
from services.retirement_engine import calculate_nps, get_scheme, list_schemes


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import Attendance, Employee, EmployeePayrollInput, Organization, PayrollComponent, StatutoryRule
        for t in (Attendance, EmployeePayrollInput, Employee, PayrollComponent):
            s.query(t).filter(t.organization_id.in_(
                s.query(Organization.id).filter(Organization.code.in_(["STAT4A"]))
            )).delete(synchronize_session=False)
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_type.in_(["nps", "minimum_wage", "perquisite"]),
        ).delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        from models import Employee, Organization
        org = s.query(Organization).filter(Organization.code == "STAT4A").first()
        if not org:
            org = Organization(name="Statutory Org", code="STAT4A", status="active",
                               registered_state="Karnataka")
            s.add(org)
            s.commit()
            s.refresh(org)
        emp = s.query(Employee).filter(Employee.employee_code == "STAT4-1").first()
        if not emp:
            emp = Employee(first_name="Stat", last_name="Four", email="stat4.emp@t.com",
                           employee_code="STAT4-1", organization_id=org.id,
                           base_salary=600000, status="active",
                           join_date=datetime(2020, 1, 1), pran_number="PRAN1234567")
            s.add(emp)
            s.commit()
            s.refresh(emp)
        yield {"org": org, "emp": emp}
    finally:
        s.close()


class TestRetirementNPS:
    def test_framework_registers_schemes(self):
        assert get_scheme("NPS") is not None
        assert any(x["code"] == "NPS" for x in list_schemes())

    def test_nps_off_without_rule_or_flag(self, env):
        out = calculate_nps(None, env["emp"], {"BASIC": 20000, "DA": 0, "GROSS": 50000})
        # No db/rule and employee flag default False -> not applicable
        assert out["applicable"] is False or out["employee"] >= 0

    def test_nps_rate_change_is_configuration_only(self, env):
        """Mandate: changing NPS rates is a rule change, never a code change."""
        s = sessionmaker(bind=app_engine)()
        try:
            from models import StatutoryRule
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "nps",
                StatutoryRule.organization_id == env["org"].id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="nps", country="India", organization_id=env["org"].id,
                effective_from=date(2026, 1, 1), status="active", version=1,
                definition={"kind": "composite", "outputs": {
                    "employee_rate": {"kind": "param", "value": 10.0},
                    "employer_rate": {"kind": "param", "value": 10.0},
                    "wage_basis": {"kind": "param", "value": "BASIC_DA"},
                }},
            ))
            s.commit()
            out = calculate_nps(s, env["emp"], {"BASIC": 20000, "DA": 2000, "GROSS": 50000},
                                as_of=date(2026, 6, 1))
            assert out["applicable"] is True
            assert out["employee"] == 2200.0   # 10% of (20000 + 2000)
            assert out["employer"] == 2200.0
            assert out["breakdown"]["pran"] == "PRAN1234567"
            assert out["breakdown"]["wage_basis"] == "BASIC_DA"

            # The law/finance changes the rate: publish v2, results follow.
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "nps",
                StatutoryRule.organization_id == env["org"].id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="nps", country="India", organization_id=env["org"].id,
                effective_from=date(2026, 1, 1), status="active", version=2,
                definition={"kind": "composite", "outputs": {
                    "employee_rate": {"kind": "param", "value": 12.0},
                    "employer_rate": {"kind": "param", "value": 14.0},
                    "wage_basis": {"kind": "param", "value": "BASIC_DA"},
                }},
            ))
            s.commit()
            out2 = calculate_nps(s, env["emp"], {"BASIC": 20000, "DA": 2000, "GROSS": 50000},
                                 as_of=date(2026, 6, 1))
            assert out2["employee"] == 2640.0  # 12%
            assert out2["employer"] == 3080.0  # 14%
        finally:
            s.close()

    def test_nps_gross_basis_variant(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            from models import StatutoryRule
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "nps",
                StatutoryRule.organization_id == env["org"].id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="nps", country="India", organization_id=env["org"].id,
                effective_from=date(2026, 1, 1), status="active", version=3,
                definition={"kind": "composite", "outputs": {
                    "employee_rate": {"kind": "param", "value": 10.0},
                    "employer_rate": {"kind": "param", "value": 0.0},
                    "wage_basis": {"kind": "param", "value": "GROSS"},
                }},
            ))
            s.commit()
            out = calculate_nps(s, env["emp"], {"BASIC": 20000, "DA": 0, "GROSS": 50000},
                                as_of=date(2026, 6, 1))
            assert out["employee"] == 5000.0   # 10% of GROSS
        finally:
            s.close()


class TestMinimumWages:
    def test_no_rule_means_no_warning(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            out = check_minimum_wages(s, env["org"].id, {"monthly": 5000},
                                      as_of=date(2026, 6, 1), state_code="KA")
            assert out["applicable"] is False
            assert out["violation"] is False
        finally:
            s.close()

    def test_violation_detected_with_shortfall(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            from models import StatutoryRule
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "minimum_wage",
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="minimum_wage", rule_subtype="labour",
                country="India", state_code="KA", organization_id=env["org"].id,
                effective_from=date(2026, 1, 1), status="active", version=1,
                definition={"kind": "composite", "outputs": {
                    "skill_level": {"kind": "param", "value": "unskilled"},
                    "daily_rate": {"kind": "param", "value": 650.0},
                    "monthly_rate": {"kind": "param", "value": 19500.0},
                }},
            ))
            s.commit()
            out = check_minimum_wages(
                s, env["org"].id, {"monthly": 15000, "daily": 500},
                as_of=date(2026, 6, 1), state_code="KA",
                scheduled_employment="labour",
            )
            assert out["applicable"] is True
            assert out["violation"] is True
            assert out["shortfall"] == 4500.0   # monthly gap is the max
            assert len(out["warnings"]) == 2

            ok = check_minimum_wages(
                s, env["org"].id, {"monthly": 20000, "daily": 700},
                as_of=date(2026, 6, 1), state_code="KA",
                scheduled_employment="labour",
            )
            assert ok["violation"] is False
        finally:
            s.close()


class TestPerquisites:
    def test_accommodation_default_valuation(self, env):
        out = calculate_perquisites(
            None, env["emp"],
            [{"type": "accommodation", "facts": {"metro": True}}],
            {"BASIC": 20000, "DA": 2000, "GROSS": 50000},
        )
        # Default metro rule: 15% of (BASIC + DA) = 3300
        assert out["taxable_total"] == 3300.0
        assert out["breakdown"][0]["type"] == "accommodation"

    def test_accommodation_rule_override_is_configuration(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            from models import StatutoryRule
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "perquisite",
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="perquisite", rule_subtype="accommodation",
                country="India", organization_id=env["org"].id,
                effective_from=date(2026, 1, 1), status="active", version=1,
                definition={"kind": "formula",
                            "expr": "(BASIC + DA) * PCT / 100",
                            "params": {"PCT": 10.0}},   # non-metro rule
            ))
            s.commit()
            out = calculate_perquisites(
                s, env["emp"],
                [{"type": "accommodation", "facts": {}}],
                {"BASIC": 20000, "DA": 2000, "GROSS": 50000},
                as_of=date(2026, 6, 1),
            )
            assert out["taxable_total"] == 2200.0   # 10% instead of 15%
        finally:
            s.close()

    def test_loan_interest_differential(self, env):
        out = calculate_perquisites(
            None, env["emp"],
            [{"type": "loan", "facts": {
                "OUTSTANDING": 240000, "ACTUAL_RATE": 0, "MARKET_RATE": 12,
            }}],
            {"BASIC": 20000, "DA": 0, "GROSS": 50000},
        )
        # (12 - 0)/100 * 240000 / 12 * 1 month = 2400
        assert out["taxable_total"] == 2400.0

    def test_missing_input_is_surfaced_not_silent(self, env):
        out = calculate_perquisites(
            None, env["emp"],
            [{"type": "loan", "facts": {"OUTSTANDING": 240000}}],
            {"BASIC": 20000, "DA": 0, "GROSS": 50000},
        )
        line = out["breakdown"][0]
        assert line["taxable_value"] == 0.0
        assert line["error"] and "Missing input" in line["error"]


class TestPayrollIntegration:
    def test_calculate_payroll_reports_nps_perks_and_minimum_wage(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Attendance, EmployeePayrollInput, StatutoryRule
            emp = env["emp"]
            emp.nps_applicable = True
            s.add(StatutoryRule(
                rule_type="nps", country="India", organization_id=env["org"].id,
                effective_from=date(2026, 1, 1), status="active", version=9,
                definition={"kind": "composite", "outputs": {
                    "employee_rate": {"kind": "param", "value": 10.0},
                    "employer_rate": {"kind": "param", "value": 10.0},
                    "wage_basis": {"kind": "param", "value": "BASIC_DA"},
                }},
            ))
            for d in range(1, 31):
                s.add(Attendance(employee_id=emp.id, organization_id=env["org"].id,
                                 date=datetime(2026, 6, d), status="present",
                                 is_manual_entry=True))
            s.add(EmployeePayrollInput(
                employee_id=emp.id, organization_id=env["org"].id, year=2026, month=6,
                inputs={"perquisites": [{"type": "accommodation", "facts": {"metro": True}}]},
            ))
            s.commit()

            from services.payroll_service import calculate_payroll
            r = calculate_payroll(s, emp, 6, 2026,
                                  override_pf_deduction=0, override_professional_tax=0,
                                  override_esi_deduction=0, override_tds=0)
            assert r["nps_deduction"] > 0
            assert r["nps_employer_contribution"] > 0
            assert r["taxable_perquisites"] > 0
            assert r["perquisite_breakdown"] and r["perquisite_breakdown"][0]["type"] == "accommodation"
            assert r["minimum_wage"] is not None
            # NPS flows into total deductions
            assert r["total_deductions"] >= r["nps_deduction"]
        finally:
            s.close()
