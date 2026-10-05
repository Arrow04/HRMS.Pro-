"""HRMS Analyst regressions — the AI must answer from live org data."""

from datetime import date, datetime
from types import SimpleNamespace

from models import (
    Attendance, Employee, LeaveBalance, LeaveType, Organization, Payroll,
    StatutorySetting, User,
)
from hrms_ai.analyst import get_analyst


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _ctx(org, employee_id=None, role="admin"):
    return SimpleNamespace(organization_id=org.id, employee_id=employee_id, role=role)


def _employee(db_session, org, code="AI001", **kw):
    defaults = dict(
        first_name="Anita", last_name="Sharma",
        email=f"{code.lower()}@ai.example.com", employee_code=code,
        designation="Analyst", organization_id=org.id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    defaults.update(kw)
    emp = Employee(**defaults)
    db_session.add(emp)
    db_session.flush()
    return emp


def _payroll(db_session, org, emp, month=6, year=2026, **kw):
    defaults = dict(
        employee_id=emp.id, organization_id=org.id, month=month, year=year,
        basic_salary=30000, gross_salary=55000, total_earnings=55000,
        pf_deduction=1800, esi_deduction=0, professional_tax=200,
        tds_deduction=2500, net_salary=50500, status="paid",
    )
    defaults.update(kw)
    row = Payroll(**defaults)
    db_session.add(row)
    db_session.flush()
    return row


class TestAnalystPayroll:
    def test_named_employee_payroll_answer(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org)
        _payroll(db_session, org, emp, month=6, year=2026)
        out = get_analyst().answer(
            "What is Anita Sharma's salary for June 2026?", _ctx(org), db_session)
        assert out is not None
        assert "Anita Sharma" in out["text"]
        assert "Net pay" in out["text"]
        assert "50,500" in out["text"] or "50500" in out["text"].replace(",", "")
        assert "PF deduction" in out["text"]
        assert out["confidence"] >= 0.75

    def test_my_payroll_uses_authenticated_employee(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="AI002", first_name="Ravi", last_name="Kumar")
        _payroll(db_session, org, emp)
        out = get_analyst().answer(
            "show my payroll for june", _ctx(org, employee_id=emp.id), db_session)
        assert out is not None
        assert "Ravi Kumar" in out["text"]
        assert "Net pay" in out["text"]

    def test_org_level_payroll_summary(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="AI003")
        _payroll(db_session, org, emp, gross_salary=60000, net_salary=55000,
                 pf_deduction=1800, tds_deduction=3000)
        out = get_analyst().answer(
            "payroll summary for june 2026", _ctx(org), db_session)
        assert out is not None
        assert "payslips" in out["text"]
        assert "Total net payable" in out["text"]

    def test_missing_period_says_generate_first(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="AI004")
        out = get_analyst().answer(
            "Anita payroll for March 2026", _ctx(org), db_session)
        assert out is not None
        assert "No payroll record" in out["text"]


class TestAnalystLeaveCompliance:
    def test_leave_balance_answer(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="AI005")
        lt = LeaveType(name="Casual", code="casual_ai", organization_id=org.id,
                       days_allowed=7, is_paid=True)
        db_session.add(lt)
        db_session.flush()
        db_session.add(LeaveBalance(
            employee_id=emp.id, leave_type_id=lt.id, year=2026,
            total_days=7, used_days=2, remaining_days=5,
        ))
        db_session.flush()
        out = get_analyst().answer(
            "how many casual leave days are left for Anita?", _ctx(org), db_session)
        assert out is not None
        assert "5" in out["text"]
        assert "Casual" in out["text"]

    def test_compliance_answer_counts(self, db_session):
        org = _admin_org(db_session)
        out = get_analyst().answer(
            "what is our compliance status?", _ctx(org), db_session)
        assert out is not None
        assert "overdue" in out["text"].lower()

    def test_attendance_answer(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org, code="AI006")
        for day in (1, 2, 3):
            db_session.add(Attendance(
                employee_id=emp.id, organization_id=org.id,
                date=date(2026, 6, day), status="present", work_hours=8.0,
            ))
        db_session.add(Attendance(
            employee_id=emp.id, organization_id=org.id,
            date=date(2026, 6, 4), status="absent", work_hours=0.0,
        ))
        db_session.flush()
        out = get_analyst().answer(
            "attendance summary for Anita in June 2026", _ctx(org), db_session)
        assert out is not None
        assert "Present: 3" in out["text"]
        assert "Absent: 1" in out["text"]


class TestAnalystKnowledge:
    def test_how_to_run_payroll(self, db_session):
        org = _admin_org(db_session)
        out = get_analyst().answer(
            "how do I run payroll for the month?", _ctx(org), db_session)
        assert out is not None
        assert "Run payroll" in out["text"]
        assert "maker-checker" in out["text"].lower() or "different user" in out["text"].lower()

    def test_statutory_facts(self, db_session):
        org = _admin_org(db_session)
        db_session.add(StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_wage_ceiling=15000.0,
            esi_applicable=True, esi_employee_rate=0.75,
        ))
        db_session.flush()
        out = get_analyst().answer(
            "what is the PF wage ceiling?", _ctx(org), db_session)
        assert out is not None
        assert "15,000" in out["text"] or "15000" in out["text"]

    def test_org_overview(self, db_session):
        org = _admin_org(db_session)
        _employee(db_session, org, code="AI007")
        out = get_analyst().answer(
            "how many employees do we have?", _ctx(org), db_session)
        assert out is not None
        assert "Active employees" in out["text"]

    def test_gibberish_returns_none(self, db_session):
        org = _admin_org(db_session)
        out = get_analyst().answer(
            "quantum flux capacitor recalibration", _ctx(org), db_session)
        assert out is None


class TestEnginePriority:
    def test_how_to_beats_action_pipeline(self, db_session):
        """'how do I run payroll' must return the how-to guide, not a
        'no payroll records' action message (engine priority: analyst first)."""
        import asyncio
        from hrms_ai.engine import HRMSAIEngine
        from hrms_ai.schemas import AIChatRequest

        org = _admin_org(db_session)
        engine = HRMSAIEngine()
        req = AIChatRequest(
            user_id="1",
            message="how do i run payroll",
            context={"organization_id": org.id, "employee_id": None, "role": "admin"},
        )
        result = asyncio.run(engine.chat(req, db_session=db_session))
        assert "Run payroll" in result.response, result.response
        assert "maker-checker" in result.response.lower() or "different user" in result.response.lower()
        assert result.confidence >= 0.75
