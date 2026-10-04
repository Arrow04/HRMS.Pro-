"""Company-scoped statutory rule resolution — Phase 2c regression.

The rule engine always supported company_id, but the payroll calculation
path never passed it: a company-level override could never win over the
org/country rule. Also guards the state-match fix (an org rule created for
state TN must not apply to an employee in KA).
"""
import calendar
from datetime import date, datetime

from models import Attendance, Company, Employee, Organization, StatutoryRule, StatutorySetting
from services.payroll_service import calculate_payroll
from services.statutory_rule_engine import StatutoryRuleEngine


PF_RULE = {
    "rate": 10.0, "wage_ceiling": 15000.0, "max_monthly": 1800.0,
    "eps_rate": 0.0, "edli_rate": 0.0, "edli_max": 0.0,
    "admin_rate": 0.0, "admin_min": 0.0, "eps_wage_ceiling": 15000.0,
}
PF_RULE_COMPANY = dict(PF_RULE, rate=12.0)


def _attendance(db_session, emp, month=6, year=2026):
    dim = calendar.monthrange(year, month)[1]
    for day in range(1, dim + 1):
        db_session.add(Attendance(
            employee_id=emp.id, organization_id=emp.organization_id,
            date=datetime(year, month, day), status="present", work_hours=8.0,
        ))
    db_session.flush()


def _setup(db_session, code, with_company=True):
    org = Organization(name=f"Rule CoScope {code}", code=code, country="India")
    db_session.add(org)
    db_session.flush()
    company = None
    if with_company:
        company = Company(name=f"CoScope {code}", code=f"C{code}", organization_id=org.id)
        db_session.add(company)
        db_session.flush()
    s = StatutorySetting(
        pf_applicable=False, esi_applicable=False, pt_applicable=False,
        lwf_applicable=False, gratuity_applicable=False, bonus_applicable=False,
    )
    s.organization_id = org.id
    s.status = "active"
    db_session.add(s)
    db_session.flush()
    emp = Employee(
        first_name="Rule", last_name="Scope", email=f"{code.lower()}@example.com",
        employee_code=code, organization_id=org.id,
        company_id=company.id if company else None,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return org, company, emp


def _pf_rule(db_session, org, definition, company_id=None, state_code=None):
    db_session.add(StatutoryRule(
        rule_type="pf_contribution", country="India", state_code=state_code,
        organization_id=org.id, company_id=company_id,
        effective_from=date(2026, 1, 1), status="active", version=1,
        definition=definition,
    ))
    db_session.flush()


def _pt_rule(db_session, org, amount, company_id=None):
    db_session.add(StatutoryRule(
        rule_type="professional_tax", country="India", state_code=None,
        organization_id=org.id, company_id=company_id,
        effective_from=date(2026, 1, 1), status="active", version=1,
        definition={"slabs": [{"from_gross": 0, "to_gross": None, "amount": amount}]},
    ))
    db_session.flush()


class TestCompanyRulePrecedence:
    def test_company_rule_outranks_org_rule(self, db_session):
        org, company, _ = _setup(db_session, "RCO01")
        _pf_rule(db_session, org, PF_RULE)
        _pf_rule(db_session, org, PF_RULE_COMPANY, company_id=company.id)

        engine = StatutoryRuleEngine(db_session)
        as_of = date(2026, 6, 1)
        with_co = engine.calculate_pf(50000, as_of, "India", None, org.id, company_id=company.id)
        assert with_co["pf_employee"] == 1800.0, "12% of 15000 capped at 1800 expected"

        no_co = engine.calculate_pf(50000, as_of, "India", None, org.id)
        assert no_co["pf_employee"] == 1500.0, "org 10% rule must apply without company context"

    def test_country_rule_survives_org_company_absent(self, db_session):
        org, _, _ = _setup(db_session, "RCO02", with_company=False)
        _pf_rule(db_session, org, PF_RULE)  # org-scoped only
        engine = StatutoryRuleEngine(db_session)
        res = engine.calculate_pf(50000, date(2026, 6, 1), "India", None, org.id, company_id=999999)
        assert res["pf_employee"] == 1500.0, "unknown company falls back to the org rule"


class TestStateGuard:
    def test_org_rule_for_other_state_not_applied(self, db_session):
        """An org rule pinned to TN must not beat a country rule for KA."""
        org, _, _ = _setup(db_session, "RCO03", with_company=False)
        db_session.add(StatutoryRule(
            rule_type="professional_tax", country="India", state_code="TN",
            organization_id=org.id, effective_from=date(2026, 1, 1),
            status="active", version=1,
            definition={"slabs": [{"from_gross": 0, "to_gross": None, "amount": 333}]},
        ))
        db_session.add(StatutoryRule(
            rule_type="professional_tax", country="India", state_code="KA",
            organization_id=None, effective_from=date(2026, 1, 1),
            status="active", version=1,
            definition={"slabs": [{"from_gross": 0, "to_gross": None, "amount": 111}]},
        ))
        db_session.flush()

        engine = StatutoryRuleEngine(db_session)
        rule = engine.resolve("professional_tax", date(2026, 6, 1), "India", "KA", org.id)
        assert rule is not None
        assert rule["slabs"][0]["amount"] == 111, "TN org rule leaked into KA resolution"


class TestPayrollCompanyScope:
    def test_payroll_uses_company_scoped_pt_rule(self, db_session):
        org, company, emp = _setup(db_session, "RCO04")
        _pt_rule(db_session, org, 222)
        _pt_rule(db_session, org, 111, company_id=company.id)

        out = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
        assert out["professional_tax"] == 111, (
            f"company PT rule must win, got {out['professional_tax']}"
        )

    def test_payroll_uses_org_pt_rule_when_employee_has_no_company(self, db_session):
        org, _, emp = _setup(db_session, "RCO05", with_company=False)
        _pt_rule(db_session, org, 222)

        out = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
        assert out["professional_tax"] == 222


class TestRuleTestEndpoint:
    def test_test_endpoint_resolves_company_rule(self, db_session, client, admin_token):
        # The endpoint pins callers to their own org — use the seeded admin's org.
        from models import User
        import os
        admin = db_session.query(User).filter(
            User.email == os.getenv("ADMIN_EMAIL", "admin@hrms.com")
        ).first()
        org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
        company = Company(name="EP CoScope", code="EPRCO06", organization_id=org.id)
        db_session.add(company)
        db_session.flush()
        _pf_rule(db_session, org, PF_RULE)
        _pf_rule(db_session, org, PF_RULE_COMPANY, company_id=company.id)

        resp = client.post(
            "/api/statutory-rules/test",
            json={
                "rule_type": "pf_contribution",
                "as_of": "2026-06-01",
                "country": "India",
                "organization_id": org.id,
                "company_id": company.id,
                "basic": 50000,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["rule_found"] is True
        assert body["pf_calculation"]["pf_employee"] == 1800.0
