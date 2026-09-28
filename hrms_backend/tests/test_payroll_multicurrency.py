"""Multi-currency payroll: policy-currency computation with snapshots."""
import calendar
from datetime import datetime

from models import Attendance, Employee, Organization, PayrollPolicy
from services.payroll_service import calculate_payroll


def _mk_org(db_session, code):
    org = Organization(name=f"MC {code}", code=code)
    db_session.add(org)
    db_session.flush()
    return org


def _mk_policy(db_session, org_id, **kw):
    args = dict(
        organization_id=org_id, name="MC Policy",
        pro_ration_method="paid_days", rounding_method="nearest",
        decimal_places=2, round_net_salary=True,
        default_currency="INR", allow_negative_net=False,
        daily_rate_divisor=30, monthly_divisor_for_weekly=4.33,
        fy_start_month=4,
    )
    args.update(kw)
    policy = PayrollPolicy(**args)
    db_session.add(policy)
    db_session.flush()
    return policy


def _mk_employee(db_session, org, policy, code, **kw):
    args = dict(
        first_name="Mc", last_name="Tester", email=f"{code.lower()}@example.com",
        employee_code=code, organization_id=org.id,
        base_salary=1200000, status="active", join_date=datetime(2020, 1, 1),
        payroll_policy_id=policy.id,
    )
    args.update(kw)
    emp = Employee(**args)
    db_session.add(emp)
    db_session.flush()
    dim = calendar.monthrange(2026, 6)[1]
    for day in range(1, dim + 1):
        db_session.add(Attendance(
            employee_id=emp.id, organization_id=org.id,
            date=datetime(2026, 6, day), status="present", work_hours=8.0,
        ))
    db_session.flush()
    return emp


def _run(db_session, emp):
    return calculate_payroll(
        db_session, emp, 6, 2026,
        override_pf_deduction=0, override_professional_tax=0,
        override_esi_deduction=0, override_tds=0,
    )


class TestMultiCurrency:
    def test_usd_salary_converted_to_policy_currency(self, db_session):
        org = _mk_org(db_session, "MCCONV")
        policy = _mk_policy(db_session, org.id, allow_multi_currency=True)
        emp = _mk_employee(
            db_session, org, policy, "MC001",
            salary_currency="USD", currency_exchange_rate=83.5,
        )
        out = _run(db_session, emp)
        assert out["salary_currency"] == "USD"
        assert out["computation_currency"] == "INR"
        assert out["currency_exchange_rate"] == 83.5
        # USD 100k/mo base -> INR 83.5k/mo base flows into gross
        assert out["gross_salary"] > 0

    def test_conversion_matches_single_currency_run(self, db_session):
        org = _mk_org(db_session, "MCRATIO")
        policy = _mk_policy(db_session, org.id, allow_multi_currency=True)
        usd = _mk_employee(
            db_session, org, policy, "MC002",
            salary_currency="USD", currency_exchange_rate=2.0,
            base_salary=120000,
        )
        inr = _mk_employee(
            db_session, org, policy, "MC003",
            base_salary=120000,
        )
        out_usd = _run(db_session, usd)
        out_inr = _run(db_session, inr)
        # Base-derived pay scales exactly; fixed template allowances
        # correctly stay in policy currency, so gross itself is not 2x.
        assert abs(out_usd["basic_salary"] - out_inr["basic_salary"] * 2.0) < 1.0
        assert out_usd["salary_currency"] == "USD"
        assert out_usd["computation_currency"] == "INR"
        assert out_inr["salary_currency"] == "INR"
        assert out_inr["currency_exchange_rate"] is None

    def test_opted_out_policy_ignores_currency(self, db_session):
        org = _mk_org(db_session, "MCOPT")
        policy = _mk_policy(db_session, org.id, allow_multi_currency=False)
        emp = _mk_employee(
            db_session, org, policy, "MC004",
            salary_currency="USD", currency_exchange_rate=83.5,
        )
        out = _run(db_session, emp)
        assert out["currency_exchange_rate"] is None

    def test_missing_rate_never_guesses(self, db_session):
        org = _mk_org(db_session, "MCRATE")
        policy = _mk_policy(db_session, org.id, allow_multi_currency=True)
        emp = _mk_employee(
            db_session, org, policy, "MC005",
            salary_currency="USD", currency_exchange_rate=None,
        )
        out = _run(db_session, emp)
        assert out["currency_exchange_rate"] is None
        assert out["gross_salary"] > 0
