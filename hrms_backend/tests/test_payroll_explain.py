"""Payroll explainability tests (mandate section 43).

Every payslip figure must answer "why is this amount what it is?" with its
rule, rule version, formula, inputs and effective date - and stay explainable
historically after rules change.
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
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine, get_db
from main import app
from services.payroll_explain import build_explain_lines, explain_payload, save_explain_lines


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import Payroll, PayrollResultLine, StatutoryRule
        s.query(PayrollResultLine).filter(
            PayrollResultLine.component_code.in_(["pf", "basic", "esi", "pt", "tds"])
        ).delete(synchronize_session=False)
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_type == "pf_contribution",
            StatutoryRule.rule_subtype == "explain_test",
        ).delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        from core.auth import get_password_hash
        from models import Employee, Organization, Payroll, User

        org = s.query(Organization).filter(Organization.code == "EXPL").first()
        if not org:
            org = Organization(name="Explain Org", code="EXPL", status="active")
            s.add(org)
            s.commit()
            s.refresh(org)
        user = s.query(User).filter(User.email == "expl.admin@t.com").first()
        if not user:
            user = User(email="expl.admin@t.com", full_name="Expl Admin", role="admin",
                        is_active=True, organization_id=org.id,
                        password_hash=get_password_hash("Expl123!"))
            s.add(user)
            s.commit()
            s.refresh(user)
        emp = s.query(Employee).filter(Employee.employee_code == "EXPL-1").first()
        if not emp:
            emp = Employee(first_name="Ex", last_name="Pl", email="expl.emp@t.com",
                           employee_code="EXPL-1", organization_id=org.id,
                           base_salary=600000, status="active",
                           join_date=datetime(2020, 1, 1))
            s.add(emp)
            s.commit()
            s.refresh(emp)
        payroll = s.query(Payroll).filter(
            Payroll.employee_id == emp.id, Payroll.month == 6, Payroll.year == 2026
        ).first()
        if not payroll:
            payroll = Payroll(
                employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                gross_salary=77850, basic_salary=50000, pf_deduction=1800,
                esi_deduction=0, professional_tax=200, tds_deduction=2500,
                total_deductions=4500, net_salary=73350,
                paid_days=30, working_days=26, status="draft",
            )
            s.add(payroll)
            s.commit()
            s.refresh(payroll)
        yield {"org": org, "user": user, "emp": emp, "payroll": payroll}
    finally:
        s.close()


class TestExplainLines:
    def test_lines_carry_rule_formula_and_inputs(self, env):
        result = {
            "basic_salary": 50000, "hra": 25000, "conveyance": 1600, "medical": 1250,
            "gross_salary": 77850, "pf_deduction": 1800, "esi_deduction": 0,
            "professional_tax": 200, "tds_deduction": 2500,
            "paid_days": 30, "working_days": 26, "country": "India",
            "registered_state": "Karnataka",
        }
        lines = build_explain_lines(result, as_of=date(2026, 6, 1))
        by_code = {l["component_code"]: l for l in lines}

        basic = by_code["basic"]
        assert basic["amount"] == 50000 and basic["side"] == "earning"
        assert basic["formula"] and basic["inputs"]["paid_days"] == 30

        pf = by_code["pf"]
        assert pf["wage_basis"] == "PF_WAGES"
        assert pf["formula"] and "PF_WAGES" in pf["formula"]
        assert pf["rule_type"] == "pf_contribution"
        assert pf["source"] in ("rule", "settings", "fallback")

        pt = by_code["pt"]
        assert pt["rule_type"] == "professional_tax"
        assert pt["inputs"]["country"] == "India"

        tds = by_code["tds"]
        assert tds["rule_type"] == "tax_slab"

    def test_rule_provenance_is_recorded(self, env):
        """When a rule is published, the line names the exact rule + version."""
        s = sessionmaker(bind=app_engine)()
        try:
            from models import StatutoryRule
            s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "pf_contribution",
                StatutoryRule.organization_id == env["org"].id,
            ).delete(synchronize_session=False)
            s.add(StatutoryRule(
                rule_type="pf_contribution", rule_subtype="explain_test",
                country="India", organization_id=env["org"].id,
                effective_from=date(2026, 1, 1), status="active", version=7,
                definition={"kind": "formula", "expr": "MIN(PF_WAGES * RATE / 100, CAP)",
                            "params": {"RATE": 12.0, "CAP": 1800.0}},
                notification_number="G.S.R. 999(E)",
            ))
            s.commit()
            result = {
                "basic_salary": 50000, "gross_salary": 77850, "pf_deduction": 1800,
                "paid_days": 30, "working_days": 26, "country": "India",
            }
            lines = build_explain_lines(result, db=s, employee=env["emp"], as_of=date(2026, 6, 1))
            pf = next(l for l in lines if l["component_code"] == "pf")
            assert pf["source"] == "rule"
            assert pf["rule_version"] == 7
            assert pf["rule_id"] is not None
        finally:
            s.close()

    def test_history_stays_explainable_after_rules_change(self, env):
        """Stored lines keep the rule version that produced them - even after
        the rule is superseded (mandate: historical payroll uses historical
        rules and stays explainable)."""
        s = sessionmaker(bind=app_engine)()
        try:
            result = {"basic_salary": 50000, "gross_salary": 77850, "pf_deduction": 1800,
                      "paid_days": 30, "country": "India"}
            lines = build_explain_lines(result, db=s, employee=env["emp"], as_of=date(2026, 6, 1))
            save_explain_lines(s, env["payroll"], lines)

            # The law changes: PF rule superseded by a new version
            from models import StatutoryRule
            old = s.query(StatutoryRule).filter(
                StatutoryRule.rule_type == "pf_contribution",
                StatutoryRule.organization_id == env["org"].id,
            ).first()
            if old:
                old.status = "superseded"
                old.effective_to = date(2026, 12, 31)
            s.add(StatutoryRule(
                rule_type="pf_contribution", rule_subtype="explain_test2",
                country="India", organization_id=env["org"].id,
                effective_from=date(2027, 1, 1), status="active", version=8,
                definition={"kind": "formula", "expr": "MIN(PF_WAGES * 0.13, 1950)"},
            ))
            s.commit()

            payload = explain_payload(s, env["payroll"])
            pf_line = next(l for l in payload["lines"] if l["componentCode"] == "pf")
            # The stored explanation still names the historical rule version
            assert pf_line["ruleVersion"] == 7
            assert any(r["version"] == 7 for r in payload["rulesUsed"])
        finally:
            s.close()


class TestExplainEndpoint:
    def test_explain_endpoint_and_authz(self, env):
        Base.metadata.create_all(bind=app_engine)
        client = TestClient(app)

        def override():
            sess = sessionmaker(bind=app_engine)()
            try:
                yield sess
            finally:
                sess.close()

        app.dependency_overrides[get_db] = override
        try:
            r = client.post("/api/auth/login", json={
                "email": "expl.admin@t.com", "password": "Expl123!"})
            assert r.status_code == 200, r.text
            h = {"Authorization": f"Bearer {r.json()['token']}"}

            x = client.get(f"/api/payroll/{env['payroll'].id}/explain", headers=h)
            assert x.status_code == 200, x.text
            body = x.json()
            assert body["payrollId"] == env["payroll"].id
            assert body["period"] == {"month": 6, "year": 2026}
            assert any(l["componentCode"] == "pf" for l in body["lines"])
            assert "formula" in body["lines"][0] and "inputs" in body["lines"][0]
        finally:
            app.dependency_overrides.clear()
