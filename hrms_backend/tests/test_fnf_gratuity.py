"""Gratuity settlement & F&F tests (mandate sections 23, 35)."""
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
from datetime import date, datetime

import pytest
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine
from services.gratuity_engine import (
    calculate_gratuity_settlement,
    record_gratuity,
    service_years_act,
)


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import (Attendance, Employee, ExitRecord, GratuityCalculation,
                            Organization, StatutoryRule)
        org_ids = [r[0] for r in s.query(Organization.id).filter(
            Organization.code.in_(["FNF"])).all()]
        if org_ids:
            emp_ids = [r[0] for r in s.query(Employee.id).filter(
                Employee.organization_id.in_(org_ids)).all()]
            s.query(GratuityCalculation).filter(
                GratuityCalculation.organization_id.in_(org_ids)).delete(synchronize_session=False)
            if emp_ids:
                s.query(ExitRecord).filter(
                    ExitRecord.employee_id.in_(emp_ids)).delete(synchronize_session=False)
                s.query(Attendance).filter(
                    Attendance.employee_id.in_(emp_ids)).delete(synchronize_session=False)
            s.query(Employee).filter(Employee.organization_id.in_(org_ids)).delete(synchronize_session=False)
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_type == "gratuity").delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        from models import Employee, Organization
        org = s.query(Organization).filter(Organization.code == "FNF").first()
        if not org:
            org = Organization(name="FNF Org", code="FNF", status="active")
            s.add(org)
            s.commit()
            s.refresh(org)
        emp = s.query(Employee).filter(Employee.employee_code == "FNF-1").first()
        if not emp:
            emp = Employee(first_name="Fin", last_name="Al", email="fnf.emp@t.com",
                           employee_code="FNF-1", organization_id=org.id,
                           base_salary=240000, status="active",
                           join_date=datetime(2019, 1, 1),
                           notice_period_served="yes",
                           bank_account_number="987654321")
            s.add(emp)
            s.commit()
            s.refresh(emp)
        yield {"org": org, "emp": emp, "session": s}
    finally:
        s.close()


class TestServiceYears:
    def test_act_240_day_rule(self):
        # Exactly 5 years
        assert service_years_act(date(2020, 1, 1), date(2025, 1, 1)) == 5.0
        # 4 years + 300 days -> 5 (part year over 240 days counts)
        assert service_years_act(date(2020, 1, 1), date(2024, 11, 26)) == 5.0
        # 4 years + 100 days -> 4
        assert service_years_act(date(2020, 1, 1), date(2024, 4, 10)) == 4.0


class TestGratuitySettlement:
    def test_not_eligible_below_five_years(self, env):
        s = env["session"]
        emp = env["emp"]
        old_join = emp.join_date
        try:
            emp.join_date = datetime(2023, 6, 1)
            s.flush()
            out = calculate_gratuity_settlement(s, emp, as_of=date(2026, 6, 1))
            assert out["eligible"] is False
            assert out["amount"] == 0
        finally:
            emp.join_date = old_join
            s.commit()

    def test_fifteen_day_rule_amount(self, env):
        s = env["session"]
        emp = env["emp"]
        out = calculate_gratuity_settlement(
            s, emp, as_of=date(2026, 6, 1),
            wage_basic=20000.0,   # monthly basic
        )
        assert out["eligible"] is True
        # default rule: 15/26 * (basic+da) * years
        years = out["service_years"]
        expected = round((15 * 20000.0 * years) / 26, 2)
        assert abs(out["amount"] - expected) < 0.02

    def test_rule_change_is_configuration_only(self, env):
        s = env["session"]
        from models import StatutoryRule
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_type == "gratuity").delete(synchronize_session=False)
        s.add(StatutoryRule(
            rule_type="gratuity", country="India", organization_id=env["org"].id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={"kind": "composite", "outputs": {
                "min_years": {"kind": "param", "value": 5.0},
                "days_per_year": {"kind": "param", "value": 20.0},   # changed
                "divisor": {"kind": "param", "value": 26.0},
                "wage_basis": {"kind": "param", "value": "BASIC_DA"},
                "tax_exempt_ceiling": {"kind": "param", "value": 2000000.0},
            }},
        ))
        s.commit()
        out = calculate_gratuity_settlement(
            s, env["emp"], as_of=date(2026, 6, 1), wage_basic=20000.0)
        years = out["service_years"]
        expected = round((20 * 20000.0 * years) / 26, 2)   # 20-day rule
        assert abs(out["amount"] - expected) < 0.02
        assert out["days_per_year"] == 20.0

    def test_settlement_is_recorded(self, env):
        s = env["session"]
        from models import GratuityCalculation
        out = calculate_gratuity_settlement(
            s, env["emp"], as_of=date(2026, 6, 1), wage_basic=20000.0)
        row = record_gratuity(s, env["emp"], out, status="settled",
                              settlement_ref="fnf:test")
        assert row.id is not None and row.status == "settled"
        assert row.amount == out["amount"]
        assert row.service_years == out["service_years"]


class TestFullAndFinal:
    def test_fnf_composition(self, env):
        s = env["session"]
        from models import Attendance, ExitRecord
        from services.exit_management_service import calculate_full_final_settlement
        emp = env["emp"]
        emp.date_of_leaving = datetime(2026, 6, 30)
        emp.notice_period_served = "no"
        org = env["org"]
        org.settings = {"payroll": {"noticePeriodDays": 30}}
        s.commit()
        if not s.query(ExitRecord).filter(ExitRecord.employee_id == emp.id).first():
            s.add(ExitRecord(employee_id=emp.id, organization_id=emp.organization_id,
                             exit_type="resigned",
                             exit_date=datetime(2026, 6, 30),
                             last_working_day=datetime(2026, 6, 30),
                             notice_period_served="no"))
            s.commit()
        dim = calendar.monthrange(2026, 6)[1]
        for d in range(1, dim + 1):
            s.add(Attendance(employee_id=emp.id, organization_id=emp.organization_id,
                             date=datetime(2026, 6, d), status="present",
                             is_manual_entry=True))
        s.commit()

        fnf = calculate_full_final_settlement(s, emp.id)
        # composition covers the mandate list
        for key in ("salary_until_last_working_day", "leave_encashment", "gratuity",
                    "statutory_bonus", "notice_pay_in_lieu", "expense_reimbursement"):
            assert key in fnf["payables"]
        assert "notice_period_shortfall" in fnf["deductions"]
        assert fnf["gratuity_eligible"] is True
        assert fnf["payables"]["gratuity"] > 0
        # notice NOT served -> recovery, no payout
        assert fnf["deductions"]["notice_period_shortfall"] > 0
        assert fnf["payables"]["notice_pay_in_lieu"] == 0
        assert fnf["net_settlement"] == round(
            fnf["total_payables"] - fnf["total_deductions"], 2)

    def test_notice_payout_on_employer_termination(self, env):
        s = env["session"]
        from services.exit_management_service import calculate_full_final_settlement
        emp = env["emp"]
        fnf = calculate_full_final_settlement(s, emp.id, notice_in_lieu=True)
        assert fnf["payables"]["notice_pay_in_lieu"] > 0
        assert fnf["deductions"]["notice_period_shortfall"] == 0
