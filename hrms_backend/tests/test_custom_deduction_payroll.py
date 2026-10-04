"""Custom statutory deduction engine — end-to-end payroll regression.

Regression for the UnboundLocalError (``basic=basic_salary``) that was
swallowed by a bare ``except``: admin-defined custom deductions always
came back as 0 while still being summed into total_deductions.
"""
import calendar
from datetime import datetime, date

from models import Attendance, Employee, Organization, StatutoryRule, StatutorySetting
from services.payroll_service import calculate_payroll


def _attendance(db_session, emp, month=6, year=2026):
    dim = calendar.monthrange(year, month)[1]
    for day in range(1, dim + 1):
        db_session.add(Attendance(
            employee_id=emp.id, organization_id=emp.organization_id,
            date=datetime(year, month, day), status="present", work_hours=8.0,
        ))
    db_session.flush()


def _setup(db_session, code):
    org = Organization(name=f"Custom Ded Org {code}", code=code, country="India")
    db_session.add(org)
    db_session.flush()
    s = StatutorySetting(
        pf_applicable=False, esi_applicable=False, pt_applicable=False,
        lwf_applicable=False, gratuity_applicable=False,
    )
    s.organization_id = org.id
    s.status = "active"
    db_session.add(s)
    db_session.flush()
    emp = Employee(
        first_name="Custom", last_name="Ded", email=f"{code.lower()}@example.com",
        employee_code=code, organization_id=org.id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    _attendance(db_session, emp)
    return org, emp


class TestCustomDeductionInPayroll:
    def test_percent_of_gross_reaches_deductions(self, db_session):
        """A 2% of gross custom rule must actually deduct in payroll."""
        org, emp = _setup(db_session, "CDED01")
        db_session.add(StatutoryRule(
            rule_type="custom_deduction", rule_subtype="employee_tax",
            country="India", organization_id=org.id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={"code": "employee_tax", "label": "Employee Tax",
                        "kind": "percent_of_gross", "rate": 2.0},
        ))
        db_session.flush()

        out = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)

        gross = out["gross_salary"]
        assert out["custom_deduction_total"] > 0, "custom deduction was silently zero"
        assert abs(out["custom_deduction_total"] - round(gross * 0.02, 2)) < 0.5
        labels = [d["label"] for d in out["custom_deductions"]]
        assert "Employee Tax" in labels
        assert out["custom_deduction_total"] <= out["total_deductions"]

    def test_fixed_amount_with_cap(self, db_session):
        """Fixed kind + max_amount cap respected."""
        org, emp = _setup(db_session, "CDED02")
        db_session.add(StatutoryRule(
            rule_type="custom_deduction", rule_subtype="fixed_capped",
            country="India", organization_id=org.id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={"code": "recovery", "label": "Recovery",
                        "kind": "fixed_amount", "amount": 500.0,
                        "max_amount": 300.0},
        ))
        db_session.flush()

        out = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
        assert out["custom_deduction_total"] == 300.0

    def test_future_rule_not_applied_to_past_period(self, db_session):
        """Effective dating: a rule from 2027 must not hit June 2026 payroll."""
        org, emp = _setup(db_session, "CDED03")
        db_session.add(StatutoryRule(
            rule_type="custom_deduction", rule_subtype="future_only",
            country="India", organization_id=org.id,
            effective_from=date(2027, 4, 1), status="active", version=1,
            definition={"code": "future_tax", "label": "Future Tax",
                        "kind": "fixed_amount", "amount": 999.0},
        ))
        db_session.flush()

        out = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
        assert out["custom_deduction_total"] == 0.0

    def test_ineligible_org_gets_zero_not_error(self, db_session):
        """No rules configured → clean zero (not an exception path)."""
        _setup(db_session, "CDED04")
        emp = db_session.query(Employee).filter(
            Employee.employee_code == "CDED04"
        ).first()
        out = calculate_payroll(db_session, emp, 6, 2026, override_tds=0)
        assert out["custom_deduction_total"] == 0.0
        assert out["custom_deductions"] == []
