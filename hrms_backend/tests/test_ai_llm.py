"""Product-grade LLM brain regressions — tool-calling + graceful fallback."""
import asyncio
import os
from datetime import datetime
from types import SimpleNamespace

import pytest

from models import Employee, Organization, Payroll, User
from hrms_ai.engine import HRMSAIEngine
from hrms_ai.llm_provider import LLMResult, ProductLLMProvider
from hrms_ai.schemas import AIChatRequest
from hrms_ai.tools_schema import TOOLS, build_tool_executor
from hrms_ai.analyst import get_analyst


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _employee(db_session, org, code="LLM001"):
    emp = Employee(
        first_name="Llm", last_name="Test", email=f"{code.lower()}@llm.example.com",
        employee_code=code, organization_id=org.id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


class MockLLM:
    """Scripted LLM: runs a tool then returns a final grounded answer."""

    def __init__(self, tool_name=None, tool_args=None, final_text="",
                 fail=False, enabled=True):
        self.tool_name = tool_name
        self.tool_args = tool_args or {}
        self.final_text = final_text
        self.fail = fail
        self._enabled = enabled
        self.seen_tools = []

    @property
    def enabled(self):
        return self._enabled

    async def run_with_tools(self, messages, tools, execute_tool, system_prompt):
        if self.fail:
            raise RuntimeError("LLM endpoint down")
        self.seen_tools = [t["function"]["name"] for t in tools]
        if self.tool_name:
            execute_tool(self.tool_name, self.tool_args)
        return LLMResult(text=self.final_text, provider="llm", model="mock-1", rounds=2)


def _chat(db_session, org, message, llm, role="admin"):
    engine = HRMSAIEngine(llm_provider=llm)
    req = AIChatRequest(
        user_id="1", message=message,
        context={"organization_id": org.id, "employee_id": None, "role": role},
    )
    return asyncio.run(engine.chat(req, db_session=db_session))


class TestProviderConfig:
    def test_disabled_without_key(self, monkeypatch):
        monkeypatch.delenv("AI_LLM_API_KEY", raising=False)
        p = ProductLLMProvider()
        assert p.enabled is False

    def test_enabled_with_key(self, monkeypatch):
        monkeypatch.setenv("AI_LLM_API_KEY", "sk-test")
        monkeypatch.setenv("AI_LLM_MODEL", "gpt-4o-mini")
        p = ProductLLMProvider()
        assert p.enabled is True
        assert p.model == "gpt-4o-mini"


class TestToolSchema:
    def test_tools_are_valid_and_unique(self):
        names = [t["function"]["name"] for t in TOOLS]
        assert len(names) == len(set(names))
        for t in TOOLS:
            assert t["type"] == "function"
            assert "parameters" in t["function"]

    def test_executor_dispatches_operations(self, db_session):
        org = _admin_org(db_session)
        _employee(db_session, org, code="LLM002")
        ctx = SimpleNamespace(organization_id=org.id, employee_id=None,
                              role="admin", user_id="1")
        execute = build_tool_executor(get_analyst(), ctx, db_session)
        out = execute("run_payroll", {"month": 6, "year": 2026})
        assert "Payroll for 6/2026" in out
        assert db_session.query(Payroll).filter_by(month=6, year=2026).count() >= 1


class TestEngineWithLLM:
    def test_llm_tool_call_executes_real_payroll(self, db_session):
        org = _admin_org(db_session)
        _employee(db_session, org, code="LLM003")
        llm = MockLLM(tool_name="run_payroll", tool_args={"month": 7, "year": 2026},
                      final_text="Done — generated July 2026 payslips. Review in "
                                 "Payroll; a different user must approve.")
        result = _chat(db_session, org, "please run payroll for july 2026", llm)
        assert "July 2026" in result.response
        assert result.provider.startswith("llm")
        assert db_session.query(Payroll).filter_by(month=7, year=2026).count() >= 1
        assert "run_payroll" in llm.seen_tools

    def test_llm_failure_falls_back_to_analyst(self, db_session):
        org = _admin_org(db_session)
        llm = MockLLM(fail=True)
        result = _chat(db_session, org, "how do I run payroll?", llm)
        assert "Run payroll" in result.response, result.response
        assert result.provider == "local_hrms_ai"

    def test_disabled_llm_uses_local_brain(self, db_session):
        org = _admin_org(db_session)
        llm = MockLLM(enabled=False)
        result = _chat(db_session, org, "what is an HRMS?", llm)
        assert "Human Resource Management" in result.response

    def test_employee_role_permission_via_llm_tool(self, db_session):
        org = _admin_org(db_session)
        _employee(db_session, org, code="LLM004")
        llm = MockLLM(tool_name="run_payroll", tool_args={"month": 8, "year": 2026},
                      final_text="I could not run payroll — permission denied "
                                 "for your role.")
        result = _chat(db_session, org, "run payroll for august 2026", llm,
                       role="employee")
        assert "permission" in result.response.lower()
        assert db_session.query(Payroll).filter_by(month=8, year=2026).count() == 0
