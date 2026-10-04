"""Proration rule knob + cost-centre GL + compliance dashboard regressions.

Locks in:
  - 26/30-day proration is CONFIGURATION: published 'proration' rule >
    PayrollPolicy.daily_rate_divisor > 30 (wired through F&F, validation,
    min-wage and the daily rate conversion)
  - Employee.cost_center tags every GL journal line on payroll payment
  - GET /api/compliance/dashboard: filings at risk, payroll status counts,
    statutory constants in force, pending F&F, register catalogue
"""

from datetime import datetime

from models import Employee, JournalEntry, JournalLine, Organization, Payroll, PayrollPolicy, StatutoryRule, User
from services.payroll_service import resolve_proration_divisor


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _employee(db_session, org_id, code, **kw):
    defaults = dict(
        first_name="Dash", last_name="Board",
        email=f"{code.lower()}@dash.example.com", employee_code=code,
        designation="Engineer", organization_id=org_id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    defaults.update(kw)
    emp = Employee(**defaults)
    db_session.add(emp)
    db_session.flush()
    return emp


def _proration_rule(db_session, org_id, divisor, company_id=None):
    # rule_platform resolves with country="" — proration is org config, not
    # jurisdictional statute (same convention as employment_profile rules).
    db_session.add(StatutoryRule(
        rule_type="proration", country="", state_code=None,
        organization_id=org_id, company_id=company_id,
        effective_from=datetime(2020, 1, 1).date(), status="active", version=1,
        definition={"divisor": divisor},
    ))
    db_session.flush()


class TestProrationRuleKnob:
    def test_published_rule_beats_policy(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "PR001")
        policy = PayrollPolicy(organization_id=org.id, name="PR Policy",
                               status="active", daily_rate_divisor=30.0)
        db_session.add(policy)
        db_session.flush()
        emp.payroll_policy_id = policy.id
        db_session.flush()
        _proration_rule(db_session, org.id, 26)
        assert resolve_proration_divisor(db_session, emp, pay_policy=policy) == 26.0

    def test_policy_used_without_rule(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "PR002")
        policy = PayrollPolicy(organization_id=org.id, name="PR Policy 2",
                               status="active", daily_rate_divisor=26.0)
        db_session.add(policy)
        db_session.flush()
        assert resolve_proration_divisor(db_session, emp, pay_policy=policy) == 26.0

    def test_default_thirty(self, db_session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "PR003")
        assert resolve_proration_divisor(db_session, emp) == 30.0

    def test_daily_conversion_uses_rule(self, db_session):
        from services.payroll_service import monthly_from_rate
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "PR004", pay_frequency="daily",
                        base_salary=1000.0)
        _proration_rule(db_session, org.id, 26)
        out = monthly_from_rate(1000.0, "daily", db=db_session, employee=emp)
        assert out == 26000.0, f"1000/day x 26-day rule divisor, got {out}"


class TestCostCentreGl:
    def test_journal_lines_carry_employee_cost_center(self, db_session, client, admin_token):
        from core.auth import get_password_hash
        org = _admin_org(db_session)
        checker = User(
            email="cc.checker@dash.example.com",
            password_hash=get_password_hash("check123"),
            full_name="CC Checker", role="finance",
            organization_id=org.id, is_active=True,
        )
        db_session.add(checker)
        db_session.flush()
        emp = _employee(db_session, org.id, "CC001", cost_center="CC-ENGINEERING")
        pr = Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                     basic_salary=30000, gross_salary=50000, total_earnings=50000,
                     net_salary=40000, total_deductions=10000,
                     pf_deduction=6000, professional_tax=200, tds_deduction=3800,
                     status="draft")
        db_session.add(pr)
        db_session.flush()

        def bulk(act, token):
            return client.post(
                "/api/payroll/bulk-status",
                json={"payrollIds": [pr.id], "action": act},
                headers={"Authorization": f"Bearer {token}"},
            )

        # draft -> approved (no submission recorded: legacy single-step OK)
        assert bulk("approve", admin_token).status_code == 200
        assert bulk("process", admin_token).status_code == 200
        r = bulk("mark_paid", admin_token)
        assert r.status_code == 200, r.text

        entry = db_session.query(JournalEntry).filter(
            JournalEntry.reference_type == "payroll",
            JournalEntry.reference_id == pr.id,
        ).first()
        assert entry is not None, "mark_paid must post the payroll journal"
        lines = db_session.query(JournalLine).filter(
            JournalLine.journal_entry_id == entry.id).all()
        assert lines, "journal must have lines"
        for ln in lines:
            assert ln.cost_center == "CC-ENGINEERING", (
                f"line {ln.id} cost_center={ln.cost_center}"
            )
        total_dr = round(sum(l.debit or 0 for l in lines), 2)
        total_cr = round(sum(l.credit or 0 for l in lines), 2)
        assert total_dr == total_cr, "journal must balance"


class TestComplianceDashboard:
    def test_dashboard_shape_and_counts(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "DB001")
        for i, status in enumerate(("draft", "draft", "paid"), start=1):
            db_session.add(Payroll(
                employee_id=emp.id, organization_id=org.id,
                month=6, year=2026, gross_salary=50000, net_salary=40000,
                total_earnings=50000, status=status,
            ))
        db_session.flush()

        resp = client.get(
            "/api/compliance/dashboard",
            params={"month": 6, "year": 2026},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["period"]["month"] == 6
        assert body["payroll"]["total"] == 3
        assert body["payroll"]["byStatus"].get("draft") == 2
        assert body["payroll"]["byStatus"].get("paid") == 1
        assert "pf_wage_ceiling" in body["statutory"]
        assert "EPF_ECR" in body["registers"]
        assert "GRATUITY_REGISTER" in body["registers"]
        filings = body["filings"]
        for key in ("dueSoon", "overdue", "filed", "upcoming", "atRisk"):
            assert key in filings
