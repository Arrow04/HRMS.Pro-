"""AI operations + live-learning regressions.

The AI must EXECUTE org operations (run payroll, finalize attendance,
init leave balances) through the same engine the UI uses — admin-only —
and learn new employees instantly via the live index refresh hook.
"""
import asyncio
from datetime import datetime

from models import (
    Employee, LeaveBalance, Organization, Payroll, PayrollPeriodLock, User,
)
from hrms_ai.analyst import get_analyst
from hrms_ai.engine import HRMSAIEngine
from hrms_ai.knowledge import get_knowledge_base, refresh_org_ai_index
from hrms_ai.nlp import get_nlp_engine
from hrms_ai.schemas import AIChatRequest
from types import SimpleNamespace


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _ctx(org, employee_id=None, role="admin", user_id="1"):
    return SimpleNamespace(organization_id=org.id, employee_id=employee_id,
                           role=role, user_id=user_id)


def _employee(db_session, org, code="OPS001", **kw):
    defaults = dict(
        first_name="Op", last_name="Tester",
        email=f"{code.lower()}@ops.example.com", employee_code=code,
        designation="Engineer", organization_id=org.id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    defaults.update(kw)
    emp = Employee(**defaults)
    db_session.add(emp)
    db_session.flush()
    return emp


class TestCommandGuard:
    def test_run_payroll_is_a_command_not_a_query(self, db_session):
        org = _admin_org(db_session)
        out = get_analyst().answer(
            "run payroll for june 2026", _ctx(org), db_session)
        assert out is None, "commands must fall through to the action pipeline"

    def test_how_to_still_returns_guide(self, db_session):
        org = _admin_org(db_session)
        out = get_analyst().answer(
            "how do I run payroll?", _ctx(org), db_session)
        assert out is not None
        assert "Run payroll" in out["text"]


class TestNlpCommandRouting:
    def test_run_payroll_routes_to_action(self):
        nlp = get_nlp_engine()
        ctx = SimpleNamespace(organization_id=1, employee_id=None, role="admin", user_id="1")
        result = nlp.extract_action_parameters(
            "run payroll for june 2026", "payroll_query", {}, ctx)
        assert result is not None
        action, params = result
        assert action == "run_payroll"
        assert params["month"] == 6 and params["year"] == 2026

    def test_finalize_attendance_routes(self):
        nlp = get_nlp_engine()
        ctx = SimpleNamespace(organization_id=1, employee_id=None, role="admin", user_id="1")
        result = nlp.extract_action_parameters(
            "finalize attendance for june 2026", "attendance_query", {}, ctx)
        assert result is not None
        assert result[0] == "finalize_attendance"
        assert result[1]["month"] == 6

    def test_how_to_does_not_route_to_action(self):
        nlp = get_nlp_engine()
        ctx = SimpleNamespace(organization_id=1, employee_id=None, role="admin", user_id="1")
        result = nlp.extract_action_parameters(
            "how do I run payroll?", "how_to", {}, ctx)
        assert result is None


class TestAiExecutesOperations:
    def _chat(self, db_session, org, message, role="admin"):
        engine = HRMSAIEngine()
        req = AIChatRequest(
            user_id="1", message=message,
            context={"organization_id": org.id, "employee_id": None, "role": role},
        )
        return asyncio.run(engine.chat(req, db_session=db_session))

    def test_chat_run_payroll_generates_payslips(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="OPS101")
        result = self._chat(db_session, org, "run payroll for june 2026")
        assert "Payroll for 6/2026" in result.response, result.response
        row = db_session.query(Payroll).filter_by(
            employee_id=emp.id, month=6, year=2026).first()
        assert row is not None, "AI must generate a real payslip via the engine"
        assert row.submitted_by == 1

    def test_chat_finalize_attendance_creates_lock(self, db_session):
        org = _admin_org(db_session)
        result = self._chat(db_session, org, "finalize attendance for june 2026")
        assert "finalized" in result.response.lower(), result.response
        lock = db_session.query(PayrollPeriodLock).filter_by(
            organization_id=org.id, month=6, year=2026).first()
        assert lock is not None and lock.status == "finalized"

    def test_employee_role_cannot_run_payroll(self, db_session):
        org = _admin_org(db_session)
        _employee(db_session, org, code="OPS102")
        result = self._chat(db_session, org, "run payroll for june 2026", role="employee")
        assert "permission" in result.response.lower(), result.response

    def test_chat_init_leave_balances(self, db_session):
        from models import LeaveType
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="OPS103")
        # Init only creates rows for active paid leave types — seed one first
        db_session.add(LeaveType(
            organization_id=org.id, name="Casual", code="casual_ops",
            days_allowed=7, is_paid=True, status="active",
        ))
        db_session.flush()
        result = self._chat(db_session, org, "initialise leave balances for 2026")
        assert "leave balance" in result.response.lower(), result.response
        lb = db_session.query(LeaveBalance).filter_by(
            employee_id=emp.id, year=2026).first()
        assert lb is not None, "AI must create real leave balance rows"
        assert lb.total_days == 7


class TestLiveLearning:
    def test_index_refresh_makes_employee_findable(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="LIVE01",
                        first_name="Live", last_name="Learner")
        result = refresh_org_ai_index(db_session, org.id)
        assert result["employees_indexed"] >= 1

        kb = get_knowledge_base()
        hits = kb.search(str(org.id), "Live Learner", n_results=5)
        assert any("Live Learner" in (h.get("title") or "") or
                   "Live Learner" in (h.get("content") or "") for h in hits), hits

    def test_reindex_updates_not_duplicates(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="LIVE02")
        refresh_org_ai_index(db_session, org.id)
        refresh_org_ai_index(db_session, org.id)
        kb = get_knowledge_base()
        docs = kb._tenant_docs.get(str(org.id), [])
        emp_docs = [d for d in docs if d.startswith("emp_")]
        assert len(emp_docs) == len(set(emp_docs)), "deterministic ids must dedupe"

    def test_onboarding_triggers_ai_index(self, db_session):
        from services.onboarding_automation import run_onboarding_automation
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="LIVE03",
                        first_name="Hooked", last_name="Employee")
        summary = run_onboarding_automation(db_session, emp, send_email=False)
        assert "ai_index" in summary["steps"], summary["steps"]
        kb = get_knowledge_base()
        hits = kb.search(str(org.id), "Hooked Employee", n_results=5)
        assert any("Hooked Employee" in (h.get("title") or "") or
                   "Hooked Employee" in (h.get("content") or "") for h in hits), hits
