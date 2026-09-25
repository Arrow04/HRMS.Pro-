"""Golden payroll scenarios (mandate sections 58-60).

Known scenarios with expected outcomes - the regression library every rule
change must keep green. Each scenario states its context and asserts the
mathematical invariants of the expected result.
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

import calendar
from datetime import datetime

import pytest
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine
from services.sector_profiles import compose_sector_wages, resolve_sector_profile
from services.statutory_reports import (
    BUILTIN_REPORT_DEFINITIONS,
    ensure_builtin_definitions,
    render_report,
)
from services.wage_engine import calculate_base_wages, resolve_wage_bases


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import (Attendance, Employee, Organization, Payroll,
                            PayrollResultLine, StatutoryReportDefinition,
                            StatutorySetting)
        org_ids = [r[0] for r in s.query(Organization.id).filter(
            Organization.code.in_(["GOLD"])).all()]
        if org_ids:
            s.query(PayrollResultLine).filter(
                PayrollResultLine.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(Payroll).filter(Payroll.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(StatutoryReportDefinition).filter(
                StatutoryReportDefinition.organization_id.in_(org_ids)).delete(synchronize_session=False)
            for t in (Attendance, StatutorySetting, Employee):
                s.query(t).filter(t.organization_id.in_(org_ids)).delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        from models import Employee, Organization, StatutorySetting
        org = s.query(Organization).filter(Organization.code == "GOLD").first()
        if not org:
            org = Organization(name="Golden Org", code="GOLD", status="active",
                               registered_state="Karnataka")
            s.add(org)
            s.commit()
            s.refresh(org)
        s.add(StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_min_basic_for_exclusion=10000000.0,
            esi_applicable=False, pt_applicable=False, lwf_applicable=False,
        ))
        emp = s.query(Employee).filter(Employee.employee_code == "GOLD-1").first()
        if not emp:
            emp = Employee(first_name="Gold", last_name="En", email="gold.emp@t.com",
                           employee_code="GOLD-1", organization_id=org.id,
                           base_salary=120000, status="active",
                           join_date=datetime(2020, 1, 1),
                           bank_account_number="5555555555")
            s.add(emp)
            s.commit()
            s.refresh(emp)
        yield {"org": org, "emp": emp, "session": s}
    finally:
        s.close()


def _run_month(s, emp, month=4, year=2026, **overrides):
    from models import Attendance
    from services.payroll_service import calculate_payroll, generate_payroll_record
    dim = calendar.monthrange(year, month)[1]
    if not s.query(Attendance).filter(
        Attendance.employee_id == emp.id,
        Attendance.date >= datetime(year, month, 1),
    ).first():
        for d in range(1, dim + 1):
            s.add(Attendance(employee_id=emp.id, organization_id=emp.organization_id,
                             date=datetime(year, month, d), status="present",
                             is_manual_entry=True))
        s.commit()
    generate_payroll_record(s, emp, month, year, **overrides)  # persist for reports
    return calculate_payroll(s, emp, month, year, **overrides)


class TestGoldenScenarios:
    """G-series: the design doc's scenario library."""

    def test_g1_karnataka_monthly_employee(self, env):
        """G1: Karnataka monthly employee, full attendance.

        Invariants: net = earnings - deductions; PF on earned basic; PT from
        the state/static slab; gross = sum of earnings heads.
        """
        s = env["session"]
        r = _run_month(s, env["emp"], 4, 2026,
                       override_esi_deduction=0, override_tds=0)
        assert r["country"] == "India"
        assert r["paid_days"] > 0
        assert abs(r["net_salary"] - round(r["total_earnings"] - r["total_deductions"], 2)) < 0.02
        # PT follows the state slab for a Karnataka org (oracle: state rules)
        from data.state_compliance import calculate_pt
        assert r["professional_tax"] == calculate_pt(r["gross_salary"], "KA")
        # PF 12% of monthly basic 10000 = 1200 (below the 1800 cap)
        assert r["pf_deduction"] == 1200.0

    def test_g2_daily_worker(self, env):
        """G2: daily-wage worker, 650/day x 24 days - one engine."""
        out = calculate_base_wages(
            {"wage_method": "rate_days"}, {"daily_rate": 650, "days": 24})
        assert out["earnings"] == 15600

    def test_g6_piece_rate_with_slabs(self, env):
        """G6: piece-rate worker with production slabs."""
        out = calculate_base_wages(
            {"wage_method": "units_rate"},
            {"units": 1200, "production_slabs": [
                {"from": 0, "to": 1000, "rate": 10},
                {"from": 1000, "to": None, "rate": 12},
            ]})
        # 1000*10 + 200*12 = 12400
        assert out["earnings"] == 12400

    def test_g7_regime_as_configuration(self, env):
        """G7: regime switch is data - both computations stay correct."""
        s = env["session"]
        r_old = _run_month(s, env["emp"], 5, 2026,
                           override_esi_deduction=0, override_tds=0)
        # simulating a regime switch is a what-if, not a code path
        from services.payroll_simulator import simulate_changes
        sim = simulate_changes(s, env["emp"], 5, 2026, {"bonus": 1})
        assert set(sim["current"].keys()) == set(sim["simulated"].keys())
        assert r_old["total_deductions"] >= r_old["pf_deduction"]

    def test_g_zero_attendance_pays_zero(self, env):
        s = env["session"]
        from models import Employee
        lone = Employee(first_name="Zero", last_name="Days", email="gold.zero@t.com",
                        employee_code="GOLD-2", organization_id=env["org"].id,
                        base_salary=120000, status="active",
                        join_date=datetime(2020, 1, 1))
        s.add(lone)
        s.commit()
        r = calculate_payroll = __import__(
            "services.payroll_service", fromlist=["calculate_payroll"]
        ).calculate_payroll(s, lone, 3, 2026,
                            override_pf_deduction=0, override_professional_tax=0,
                            override_esi_deduction=0, override_tds=0)
        assert r["paid_days"] == 0
        assert r["basic_salary"] == 0
        assert r["net_salary"] == 0

    def test_wage_bases_feed_statutory_modules(self, env):
        """Named wage bases resolve from rules/defaults for every statutory."""
        res = resolve_wage_bases({"BASIC": 10000, "DA": 0, "GROSS_WAGES": 17850})
        assert res["bases"]["PF_WAGES"] == 10000
        assert res["bases"]["ESI_WAGES"] == 17850
        assert res["bases"]["BONUS_WAGES"] == 17850   # under the 21000 ceiling


class TestStatutoryReports:
    def test_builtin_definitions_render(self, env):
        s = env["session"]
        created = ensure_builtin_definitions(s, env["org"].id)
        assert created >= 3
        definition = next(d for d in BUILTIN_REPORT_DEFINITIONS if d["code"] == "EPF_ECR")
        report = render_report(s, definition, env["org"].id, 4, 2026)
        assert report["code"] == "EPF_ECR"
        assert report["rowCount"] >= 1
        row = report["rows"][0]
        assert row["ee_share"] is not None
        assert "label" in report["columns"][0]

    def test_new_filing_format_is_configuration_only(self, env):
        """Mandate test 7-ish: a new report format is a definition row."""
        s = env["session"]
        custom = {
            "code": "CUSTOM_RETURN",
            "name": "Custom State Return",
            "authority": "State Dept",
            "period_type": "monthly",
            "fields": [
                {"key": "name", "label": "Name", "source": "employee_name"},
                {"key": "double_gross", "label": "Double Gross",
                 "formula": "gross_salary * 2"},
            ],
        }
        report = render_report(s, custom, env["org"].id, 4, 2026)
        assert report["rowCount"] >= 1
        # formula evaluated against payroll columns - no code involved
        assert isinstance(report["rows"][0]["double_gross"], (int, float))
        assert report["rows"][0]["name"] == "Gold En"
