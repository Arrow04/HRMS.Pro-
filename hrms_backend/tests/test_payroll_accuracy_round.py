"""Payroll accuracy round: disabled ESI ceiling, 176 rule in all paths,
LWF flat-unit fallbacks, PF wage-ceiling cap, ESI period continuation."""
import calendar
from datetime import datetime

from models import Attendance, Employee, Organization, Payroll, StatutorySetting
from services.compliance_engine import (
    calculate_esi,
    calculate_lwf,
    calculate_pf,
    esi_covered_earlier,
    esi_employee_exempt,
    esi_period_months,
)
from services.payroll_service import (
    _apply_state_compliance,
    calculate_payroll,
)


def _attendance(db_session, emp, month=6, year=2026):
    dim = calendar.monthrange(year, month)[1]
    for day in range(1, dim + 1):
        db_session.add(Attendance(
            employee_id=emp.id, organization_id=emp.organization_id,
            date=datetime(year, month, day), status="present", work_hours=8.0,
        ))
    db_session.flush()


def _setting(**kw):
    args = dict(
        esi_applicable=True, esi_employee_rate=0.75, esi_employer_rate=3.25,
        esi_gross_ceiling=21000.0, esi_disabled_ceiling=25000.0,
        lwf_applicable=True, lwf_employee_rate=25.0, lwf_employer_rate=50.0,
        pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=3.67,
        pf_wage_ceiling=15000.0, pf_max_monthly=1800.0,
        pf_min_basic_for_exclusion=15000.0,
        pt_applicable=False,
    )
    args.update(kw)
    return StatutorySetting(**args)


def _emp(db_session, org, code, **kw):
    args = dict(
        first_name="Acc", last_name="Tester", email=f"{code.lower()}@example.com",
        employee_code=code, organization_id=org.id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
        is_person_with_disability=False,
    )
    args.update(kw)
    emp = Employee(**args)
    db_session.add(emp)
    db_session.flush()
    return emp


class TestEsiDisabledCeiling:
    def test_unit_uses_disabled_ceiling(self):
        out = calculate_esi(23000.0, _setting(), is_disabled=True)
        assert out["employee"] == 172.5
        assert out["employer"] == 747.5

    def test_unit_general_ceiling_still_blocks(self):
        out = calculate_esi(23000.0, _setting())
        assert out == {"employee": 0, "employer": 0}

    def test_payroll_path_covers_disabled_employee(self, db_session):
        org = Organization(name="ESI Dis Org", code="ESIDIS")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        # Same pay, one disabled one not: gross lands between 21000 and 25000
        # so only the disabled employee is covered.
        dis = _emp(db_session, org, "ESID01", base_salary=170000,
                   is_person_with_disability=True)
        _attendance(db_session, dis)
        gen = _emp(db_session, org, "ESID01G", base_salary=170000,
                   is_person_with_disability=False)
        _attendance(db_session, gen)
        kw = dict(override_pf_deduction=0, override_professional_tax=0,
                  override_esi_deduction=None, override_tds=0)
        out_dis = calculate_payroll(db_session, dis, 6, 2026, **kw)
        out_gen = calculate_payroll(db_session, gen, 6, 2026, **kw)
        assert 21000.0 < out_dis["gross_salary"] <= 25000.0
        assert out_dis["esi_deduction"] == round(out_dis["gross_salary"] * 0.75 / 100, 2)
        assert out_gen["esi_deduction"] == 0.0

    def test_payroll_path_blocks_above_disabled_ceiling(self, db_session):
        org = Organization(name="ESI Dis Org 2", code="ESIDIS2")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        emp = _emp(db_session, org, "ESID02", base_salary=312000,
                   is_person_with_disability=True)
        _attendance(db_session, emp)
        out = calculate_payroll(
            db_session, emp, 6, 2026,
            override_pf_deduction=0, override_professional_tax=0,
            override_esi_deduction=None, override_tds=0,
        )
        # monthly gross 26000 > 25000 disabled ceiling
        assert out["esi_deduction"] == 0.0


class TestLwfFallbackUnits:
    def test_no_state_returns_flat_amounts(self, db_session):
        org = Organization(name="LWF Flat Org", code="LWFFLT", country="India")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        emp = _emp(db_session, org, "LWFF01", base_salary=600000)
        out = _apply_state_compliance(
            s, emp, 50000.0, 25000.0, country="India",
            db=db_session, as_of=None, template=None,
        )
        # Flat configured amounts — never basic x rate%.
        assert out["lwf_employee"] == 25.0
        assert out["lwf_employer"] == 50.0

    def test_non_india_returns_flat_amounts(self, db_session):
        org = Organization(name="LWF Intl Org", code="LWFGLO", country="UAE")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        emp = _emp(db_session, org, "LWFG01", base_salary=600000)
        out = _apply_state_compliance(
            s, emp, 50000.0, 25000.0, country="UAE",
            db=db_session, as_of=None, template=None,
        )
        assert out["lwf_employee"] == 25.0
        assert out["lwf_employer"] == 50.0

    def test_payroll_deduction_uses_flat_amount_not_percent(self, db_session):
        """Regression: no-state LWF must be the flat ₹ amount, never basic x rate%."""
        org = Organization(name="LWF E2E Org", code="LWFE2E", country="India")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        emp = _emp(db_session, org, "LWFE01", base_salary=600000)
        _attendance(db_session, emp)
        out = calculate_payroll(
            db_session, emp, 6, 2026,
            override_pf_deduction=0, override_professional_tax=0,
            override_esi_deduction=0, override_tds=0,
        )
        # Flat configured employee amount (25), NOT 25% of a ₹50,000 basic.
        assert out["lwf_deduction"] == 25.0


class TestPfWageCeilingCap:
    def test_legacy_path_caps_by_wage_ceiling_not_exclusion(self):
        s = _setting(pf_wage_ceiling=15000.0, pf_min_basic_for_exclusion=100000.0)
        out = calculate_pf(50000.0, s)
        # 12% of the 15000 ceiling = 1800, not 12% of 50000
        assert out["employee"] == 1800.0
        assert out["employer"] == 550.5


class TestEsiPeriodContinuation:
    def test_period_windows(self):
        assert esi_period_months(2026, 6) == [(2026, 4), (2026, 5)]
        assert esi_period_months(2026, 4) == []
        assert esi_period_months(2026, 10) == []
        assert esi_period_months(2026, 12) == [(2026, 10), (2026, 11)]
        assert esi_period_months(2027, 2) == [
            (2026, 10), (2026, 11), (2026, 12), (2027, 1),
        ]

    def test_unit_keep_covered_above_ceiling(self):
        s = _setting()
        assert calculate_esi(23000.0, s) == {"employee": 0, "employer": 0}
        out = calculate_esi(23000.0, s, keep_covered=True)
        assert out["employee"] == 172.5
        assert out["employer"] == 747.5

    def test_covered_earlier_query(self, db_session):
        org = Organization(name="ESI Cont Org", code="ESICNT")
        db_session.add(org)
        db_session.flush()
        emp = _emp(db_session, org, "ESIC00", base_salary=170000)
        db_session.add(Payroll(
            employee_id=emp.id, organization_id=org.id,
            month=6, year=2026, esi_deduction=150.0,
            esi_employer_contribution=650.0,
        ))
        db_session.flush()
        assert esi_covered_earlier(db_session, emp.id, 2026, 7) is True
        # Outside the window (Jan row not in Apr-Sep period) -> False
        assert esi_covered_earlier(db_session, emp.id, 2026, 4) is False
        # New period from Oct: June row is in the PREVIOUS period -> False
        assert esi_covered_earlier(db_session, emp.id, 2026, 10) is False

    def test_payroll_path_continues_in_period(self, db_session):
        org = Organization(name="ESI Cont Org 2", code="ESICNT2")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        # Gross lands above 21000, so ESI only applies via continuation.
        emp = _emp(db_session, org, "ESIC01", base_salary=170000)
        _attendance(db_session, emp, month=7, year=2026)
        db_session.add(Payroll(
            employee_id=emp.id, organization_id=org.id,
            month=6, year=2026, esi_deduction=150.0,
            esi_employer_contribution=650.0,
        ))
        db_session.flush()
        kw = dict(override_pf_deduction=0, override_professional_tax=0,
                  override_esi_deduction=None, override_tds=0)
        out = calculate_payroll(db_session, emp, 7, 2026, **kw)
        assert out["gross_salary"] > 21000.0
        assert out["esi_deduction"] == round(out["gross_salary"] * 0.75 / 100, 2)
        assert out["esi_employer_contribution"] == round(
            out["gross_salary"] * 3.25 / 100, 2)

    def test_payroll_path_stops_at_period_end(self, db_session):
        org = Organization(name="ESI Cont Org 3", code="ESICNT3")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        emp = _emp(db_session, org, "ESIC02", base_salary=170000)
        _attendance(db_session, emp, month=10, year=2026)
        # Covered in the Apr-Sep period...
        db_session.add(Payroll(
            employee_id=emp.id, organization_id=org.id,
            month=6, year=2026, esi_deduction=150.0,
            esi_employer_contribution=650.0,
        ))
        db_session.flush()
        kw = dict(override_pf_deduction=0, override_professional_tax=0,
                  override_esi_deduction=None, override_tds=0)
        # ...but Oct starts a new period and gross is above the ceiling.
        out = calculate_payroll(db_session, emp, 10, 2026, **kw)
        assert out["gross_salary"] > 21000.0
        assert out["esi_deduction"] == 0.0
        assert out["esi_employer_contribution"] == 0.0


class TestPreRunDeductionEngine:
    """The engine adds queued pre-deductions to other_deductions in the SAME
    computation used by preview/generate, and never touches TDS."""

    def _org_emp(self, db_session, code):
        org = Organization(name=f"PreDed Org {code}", code=f"PD{code}")
        db_session.add(org)
        db_session.flush()
        s = _setting()
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()
        emp = _emp(db_session, org, f"PD{code}E", base_salary=600000)
        _attendance(db_session, emp)
        return org, emp

    def test_engine_adds_and_keeps_tds(self, db_session):
        from models import PayrollPreDeduction
        kw = dict(override_pf_deduction=0, override_professional_tax=0,
                  override_esi_deduction=None, override_tds=1234.0)
        org, emp = self._org_emp(db_session, "X1")
        base = calculate_payroll(db_session, emp, 6, 2026, **kw)
        db_session.add(PayrollPreDeduction(
            employee_id=emp.id, organization_id=org.id,
            month=6, year=2026, amount=1300.0, reason="canteen"))
        db_session.add(PayrollPreDeduction(
            employee_id=emp.id, organization_id=org.id,
            month=6, year=2026, amount=200.0, reason="fine"))
        db_session.flush()
        out = calculate_payroll(db_session, emp, 6, 2026, **kw)
        assert out["other_deductions"] == 1500.0
        assert out["total_deductions"] == round(base["total_deductions"] + 1500.0, 2)
        assert out["net_salary"] == round(base["net_salary"] - 1500.0, 2)
        assert out["tds_deduction"] == base["tds_deduction"]
        assert out["pre_deductions"] == [
            {"amount": 1300.0, "reason": "canteen"},
            {"amount": 200.0, "reason": "fine"},
        ] or {p["amount"] for p in out["pre_deductions"]} == {1300.0, 200.0}
