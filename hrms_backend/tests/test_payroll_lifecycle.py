"""Payroll lifecycle, approvals, validation & simulator tests (mandate 44-47)."""
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
from services.payroll_lifecycle import can_transition, transition_payroll
from services.payroll_simulator import simulate_changes
from services.payroll_validation import validate_finalization


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import (Attendance, AuditLog, Employee, Organization, Payroll,
                            PayrollAdjustment, PayrollApproval, PayrollResultLine,
                            StatutorySetting)
        org_ids = [r[0] for r in s.query(Organization.id).filter(
            Organization.code.in_(["LIFEC"])).all()]
        if org_ids:
            s.query(PayrollResultLine).filter(
                PayrollResultLine.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(PayrollApproval).filter(
                PayrollApproval.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(PayrollAdjustment).filter(
                PayrollAdjustment.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(Payroll).filter(Payroll.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(AuditLog).filter(AuditLog.organization_id.in_(org_ids),
                                     AuditLog.module == "payroll").delete(synchronize_session=False)
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
        from core.auth import get_password_hash
        from models import Employee, Organization, Payroll, User

        org = s.query(Organization).filter(Organization.code == "LIFEC").first()
        if not org:
            org = Organization(name="Lifecycle Org", code="LIFEC", status="active")
            s.add(org)
            s.commit()
            s.refresh(org)
        user = s.query(User).filter(User.email == "lifec.admin@t.com").first()
        if not user:
            user = User(email="lifec.admin@t.com", full_name="Lifecycle Admin", role="admin",
                        is_active=True, organization_id=org.id,
                        password_hash=get_password_hash("Life123!"))
            s.add(user)
            s.commit()
            s.refresh(user)
        emp = s.query(Employee).filter(Employee.employee_code == "LIFEC-1").first()
        if not emp:
            emp = Employee(first_name="Li", last_name="Fec", email="lifec.emp@t.com",
                           employee_code="LIFEC-1", organization_id=org.id,
                           base_salary=120000, status="active",
                           join_date=datetime(2020, 1, 1),
                           bank_account_number="1234567890")
            s.add(emp)
            s.commit()
            s.refresh(emp)
        yield {"org": org, "user": user, "emp": emp, "session": s}
    finally:
        s.close()


def _draft_payroll(s, emp, month=8, year=2026):
    from models import Attendance, Payroll
    from services.payroll_service import generate_payroll_record
    dim = calendar.monthrange(year, month)[1]
    for d in range(1, dim + 1):
        s.add(Attendance(employee_id=emp.id, organization_id=emp.organization_id,
                         date=datetime(year, month, d), status="present",
                         is_manual_entry=True))
    s.commit()
    p = generate_payroll_record(s, emp, month, year,
                                override_esi_deduction=0, override_professional_tax=0,
                                override_tds=0)
    return p


class TestLifecycle:
    def test_legal_chain(self, env):
        s = env["session"]
        p = _draft_payroll(s, env["emp"], 8, 2026)
        chain = ["calculated", "validation", "pending_approval", "approved", "locked", "processed", "paid"]
        for status in chain:
            result = transition_payroll(s, p, status, user=env["user"])
            assert result["ok"], result
            assert p.status == status

    def test_illegal_transitions_rejected(self, env):
        s = env["session"]
        p = _draft_payroll(s, env["emp"], 9, 2026)
        with pytest.raises(ValueError):
            transition_payroll(s, p, "paid", user=env["user"])   # draft -> paid is illegal
        assert not can_transition("draft", "paid")
        assert can_transition("processed", "reversed")

    def test_finalized_payroll_is_immutable(self, env):
        s = env["session"]
        p = _draft_payroll_stat(s, env["emp"], 10, 2026)
        original_net = p.net_salary
        with pytest.raises(ValueError):
            transition_payroll(s, p, "calculated", user=env["user"])  # locked -> calculated forbidden
        s.expire_all()
        from models import Payroll
        stored = s.query(Payroll).filter(Payroll.id == p.id).first()
        assert stored.net_salary == original_net

    def test_transitions_write_audit(self, env):
        s = env["session"]
        from models import AuditLog
        rows = s.query(AuditLog).filter(
            AuditLog.organization_id == env["org"].id,
            AuditLog.action.like("payroll_status:%"),
        ).count()
        assert rows >= 7


def _draft_payroll_stat(s, emp, month, year):
    p = _draft_payroll(s, emp, month, year)
    p.status = "locked"
    s.commit()
    return p


class TestValidation:
    def test_excessive_deductions_block(self, env):
        s = env["session"]
        p = _draft_payroll(s, env["emp"], 11, 2026)
        p.gross_salary = 10000
        p.total_deductions = 9000      # 90% -> hard error
        s.commit()
        report = validate_finalization(s, [p])
        assert report["valid"] is False
        assert any(e["type"] == "excessive_deductions" for e in report["errors"])

        result = transition_payroll(s, p, "pending_approval", user=env["user"])
        assert result["ok"] is False
        assert result["validation"]["valid"] is False

    def test_negative_net_is_an_error(self, env):
        s = env["session"]
        p = _draft_payroll(s, env["emp"], 12, 2026)
        p.net_salary = -500
        s.commit()
        report = validate_finalization(s, [p])
        assert any(e["type"] == "negative_net" for e in report["errors"])

    def test_missing_bank_is_a_warning_not_a_block(self, env):
        s = env["session"]
        p = _draft_payroll(s, env["emp"], 7, 2026)
        p.bank_account = None
        p.gross_salary = 50000
        p.total_deductions = 100
        p.net_salary = 49900
        s.commit()
        report = validate_finalization(s, [p])
        assert report["valid"] is True
        assert any(w["type"] == "missing_bank" for w in report["warnings"])


class TestApprovals:
    def test_two_step_chain(self, env):
        s = env["session"]
        from models import PayrollApproval
        p = _draft_payroll(s, env["emp"], 6, 2026)
        steps = [{"name": "HR Manager", "role": "hr_manager"},
                 {"name": "Finance", "role": "finance"}]
        rows = []
        for idx, step in enumerate(steps, start=1):
            row = PayrollApproval(
                organization_id=env["org"].id, payroll_id=p.id,
                step_order=idx, step_name=step["name"], role=step["role"],
            )
            s.add(row)
            rows.append(row)
        s.commit()
        r = transition_payroll(s, p, "pending_approval", user=env["user"])
        assert r["ok"]

        rows[0].decision = "approved"
        s.commit()
        assert p.status == "pending_approval"   # one step pending -> not approved yet

        rows[1].decision = "approved"
        s.commit()
        r2 = transition_payroll(s, p, "approved", user=env["user"])
        assert r2["ok"] and p.status == "approved"


class TestSimulator:
    def test_salary_increase_never_persists(self, env):
        s = env["session"]
        from models import Payroll
        before = s.query(Payroll).filter(
            Payroll.employee_id == env["emp"].id).count()
        out = simulate_changes(s, env["emp"], 8, 2026, {"salary_increase_pct": 10})
        assert out["delta"]["net_salary"] > 0
        assert out["delta"]["basic_salary"] > 0
        assert "no payroll record" in out["note"]
        after = s.query(Payroll).filter(
            Payroll.employee_id == env["emp"].id).count()
        assert after == before

    def test_bonus_scenario(self, env):
        s = env["session"]
        out = simulate_changes(s, env["emp"], 8, 2026, {"bonus": 100000})
        assert out["delta"]["bonus"] == 100000
        assert out["current"]["bonus"] != 100000
