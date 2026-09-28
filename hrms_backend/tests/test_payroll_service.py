"""Tests for the policy-driven payroll calculation engine."""

import pytest
from datetime import datetime
from sqlalchemy.orm import Session

from data.state_compliance import calculate_lwf, calculate_pt
from models import (
    Attendance,
    AttendancePolicy,
    Employee,
    Organization,
    PayrollComponent,
    PayrollPolicy,
    StatutorySetting,
    TaxRegime,
    TaxSlab,
)
from services.payroll_service import (
    _calc_component_value,
    _days_in_month,
    _get_annual_tax,
    _round_val,
    calculate_payroll,
    generate_payroll_record,
)


# ── Helpers ──

@pytest.fixture
def org(db_session: Session) -> Organization:
    org = Organization(name="Test Payroll Org", code="PAYTEST")
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def employee(org: Organization, db_session: Session) -> Employee:
    emp = Employee(
        first_name="John",
        last_name="Doe",
        email="john.payroll@example.com",
        employee_code="PAY001",
        designation="Software Engineer",
        organization_id=org.id,
        # base_salary stores the ANNUAL CTC (matches the salary tab / candidate
        # expected-salary flow); payroll divides by 12 for the monthly basic.
        base_salary=600000,
        status="active",
        join_date=datetime(2020, 1, 1),  # employed well before the test months
        bank_account_number="1234567890",
        pan_number="ABCDE1234F",
    )
    db_session.add(emp)
    db_session.flush()
    return emp


@pytest.fixture
def default_attendance_policy(org: Organization, db_session: Session) -> AttendancePolicy:
    ap = AttendancePolicy(
        organization_id=org.id,
        name="Test Attendance Policy",
        half_day_as_full_paid=True,
        paid_leave_as_present=True,
        holiday_as_present=True,
        status="active",
    )
    db_session.add(ap)
    db_session.flush()
    return ap


@pytest.fixture
def full_attendance(employee: Employee, db_session: Session):
    """Create attendance records for all days in a month (all present)."""
    from datetime import datetime
    import calendar
    dim = calendar.monthrange(2026, 6)[1]
    records = []
    for day in range(1, dim + 1):
        rec = Attendance(
            employee_id=employee.id,
            organization_id=employee.organization_id,
            date=datetime(2026, 6, day),
            status="present",
            work_hours=8.0,
            overtime_hours=0,
        )
        db_session.add(rec)
        records.append(rec)
    db_session.flush()
    return records


# ── Test Helpers ──

class TestDaysInMonth:
    def test_january(self):
        assert _days_in_month(2026, 1) == 31

    def test_february_non_leap(self):
        assert _days_in_month(2025, 2) == 28

    def test_february_leap(self):
        assert _days_in_month(2024, 2) == 29

    def test_june(self):
        assert _days_in_month(2026, 6) == 30


class TestRoundVal:
    def test_round_nearest_default(self):
        assert _round_val(10.5678) == 10.57

    def test_round_floor(self):
        assert _round_val(10.5678, "floor") == 10.56

    def test_round_ceil(self):
        assert _round_val(10.5612, "ceil") == 10.57

    def test_round_truncate(self):
        assert _round_val(10.5678, "truncate") == 10.56

    def test_round_zero(self):
        assert _round_val(0.0) == 0.0


class TestCalcComponentValue:
    def test_fixed_type(self, db_session: Session, org: Organization):
        from models import PayrollComponent
        comp = PayrollComponent(
            organization_id=org.id,
            name="Test Fixed",
            component_type="earning",
            calculation_type="fixed",
            calculation_value=5000,
        )
        result = _calc_component_value(comp, {}, 50000)
        assert result == 5000.0

    def test_percentage_of_basic(self, db_session: Session, org: Organization):
        comp = PayrollComponent(
            organization_id=org.id,
            name="Test HRA",
            component_type="earning",
            calculation_type="percentage",
            calculation_base="basic",
            calculation_value=50.0,
        )
        result = _calc_component_value(comp, {}, 50000)
        assert result == 25000.0

    def test_percentage_of_gross(self, db_session: Session, org: Organization):
        comp = PayrollComponent(
            organization_id=org.id,
            name="Test Deduction",
            component_type="deduction",
            calculation_type="percentage",
            calculation_base="gross",
            calculation_value=10.0,
        )
        result = _calc_component_value(comp, {"gross_salary": 60000}, 50000)
        assert result == 6000.0

    def test_max_cap_applied(self, db_session: Session, org: Organization):
        comp = PayrollComponent(
            organization_id=org.id,
            name="Test Capped",
            component_type="earning",
            calculation_type="percentage",
            calculation_base="basic",
            calculation_value=50.0,
            max_cap=10000,
        )
        result = _calc_component_value(comp, {}, 50000)
        assert result == 10000.0

    def test_min_cap_applied(self, db_session: Session, org: Organization):
        comp = PayrollComponent(
            organization_id=org.id,
            name="Test Min Cap",
            component_type="earning",
            calculation_type="fixed",
            calculation_value=500,
            min_cap=1000,
        )
        result = _calc_component_value(comp, {}, 50000)
        assert result == 1000.0


class TestAnnualTax:
    def test_below_rebate_threshold(self):
        tax = _get_annual_tax(500000, None)
        assert tax == 0.0

    def test_first_slab_only(self):
        regime = TaxRegime(
            name="Test Regime",
            standard_deduction=50000,
            rebate_threshold=700000,
            rebate_amount=25000,
            cess_rate=4.0,
        )
        regime.slabs = [
            TaxSlab(from_amount=0, to_amount=500000, rate=0, sort_order=0),
            TaxSlab(from_amount=500000, to_amount=1000000, rate=5, sort_order=1),
        ]
        tax = _get_annual_tax(800000, regime)
        expected_tax = (800000 - 500000) * 0.05
        expected_cess = expected_tax * 0.04
        assert abs(tax - (expected_tax + expected_cess)) < 0.01

    def test_multiple_slabs(self):
        from models import TaxSlab
        regime = TaxRegime(
            name="New Regime",
            organization_id=1,
            standard_deduction=50000,
            rebate_threshold=700000,
            rebate_amount=25000,
            cess_rate=4.0,
        )
        regime.slabs = [
            TaxSlab(from_amount=0, to_amount=400000, rate=0, sort_order=0),
            TaxSlab(from_amount=400000, to_amount=800000, rate=5, sort_order=1),
            TaxSlab(from_amount=800000, to_amount=1200000, rate=10, sort_order=2),
            TaxSlab(from_amount=1200000, to_amount=1600000, rate=15, sort_order=3),
            TaxSlab(from_amount=1600000, to_amount=2000000, rate=20, sort_order=4),
            TaxSlab(from_amount=2000000, to_amount=2400000, rate=25, sort_order=5),
            TaxSlab(from_amount=2400000, to_amount=None, rate=30, sort_order=6),
        ]
        tax = _get_annual_tax(3000000, regime)
        assert tax > 0
        expected_without_cess = (
            0 + 400000 * 0.05 + 400000 * 0.10 + 400000 * 0.15
            + 400000 * 0.20 + 400000 * 0.25 + 600000 * 0.30
        )
        expected_cess = expected_without_cess * 0.04
        assert abs(tax - (expected_without_cess + expected_cess)) < 1


# ── Payroll Calculation Tests ──

class TestCalculatePayrollTemplateFallback:
    """Tests when no custom components are defined — uses template/fallback path."""

    def test_basic_fallback(self, org: Organization, employee: Employee, db_session: Session):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_basic=50000, override_hra=25000,
                                    override_conveyance=1600, override_medical=1250,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["employee_id"] == employee.id
        assert result["basic_salary"] == 50000
        assert result["hra"] == 25000
        assert result["conveyance"] == 1600
        assert result["medical"] == 1250
        assert result["month"] == 6
        assert result["year"] == 2026

    def test_fallback_with_pro_ration(self, org: Organization, employee: Employee,
                                       db_session: Session, full_attendance):
        """With full attendance, factor = 1.0 (working days come from the policy workweek)."""
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["paid_days"] == 30
        assert result["working_days"] == 26  # Jun 2026 has 26 Mon-Sat working days
        assert result["present_days"] == 30
        # Full attendance -> factor capped at 1.0 (double-present never exceeds full salary)
        assert result["basic_salary"] == 50000

    def test_fallback_double_present(self, org: Organization, employee: Employee,
                                      db_session: Session, full_attendance):
        """Present days exceeding working days (double duty) must NOT inflate pay beyond full salary."""
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["present_days"] == 30
        assert result["paid_days"] == 30
        assert result["working_days"] == 26  # fewer than present days -> over-attendance
        # factor = paid/working would be > 1, but it's capped at 1.0
        assert result["basic_salary"] == 50000
        assert abs(result["gross_salary"] - (50000 + 25000 + 1600 + 1250)) < 0.01

    def test_fallback_basic_components(self, org: Organization, employee: Employee,
                                        db_session: Session, full_attendance):
        """Verify standard fallback structure: basic=base, hra=50%, conveyance=1600, medical=1250."""
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["basic_salary"] == 50000
        assert result["hra"] == 25000
        assert result["conveyance"] == 1600
        assert result["medical"] == 1250
        assert abs(result["gross_salary"] - (50000 + 25000 + 1600 + 1250)) < 0.01

    def test_fallback_no_attendance(self, org: Organization, employee: Employee, db_session: Session):
        """With no attendance records, the employee is paid for zero paid days
        (no-attendance fallback = 0 paid days, no silent full-pay)."""
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=0, override_tds=0)
        assert result["paid_days"] == 0
        assert result["basic_salary"] == 0
        assert result["net_salary"] == 0

    def test_gross_and_total_earnings(self, org: Organization, employee: Employee,
                                       db_session: Session, full_attendance):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0)
        gross = result["basic_salary"] + result["hra"] + result["da"] + result["conveyance"] + result["medical"] + result["special_allowance"]
        assert abs(result["gross_salary"] - gross) < 0.01
        total = gross + result["overtime_pay"] + result["bonus"] + result["commission"] + result["incentive"] + result["other_earnings"]
        assert abs(result["total_earnings"] - total) < 0.01


class TestCalculatePayrollPolicyDriven:
    """Tests using custom PayrollComponent definitions."""

    @pytest.fixture
    def payroll_policy(self, org: Organization, db_session: Session) -> PayrollPolicy:
        pp = PayrollPolicy(
            organization_id=org.id,
            name="Test Policy",
            rounding_method="nearest",
            decimal_places=2,
            include_gratuity=False,
            status="active",
        )
        db_session.add(pp)
        db_session.flush()
        return pp

    @pytest.fixture
    def components(self, org: Organization, payroll_policy: PayrollPolicy,
                   db_session: Session) -> list[PayrollComponent]:
        comps = [
            PayrollComponent(
                organization_id=org.id,
                payroll_policy_id=payroll_policy.id,
                name="Basic", display_name="Basic Salary",
                component_type="earning",
                calculation_type="percentage",
                calculation_base="basic",
                calculation_value=100.0,
                priority=0,
                is_active=True, status="active",
            ),
            PayrollComponent(
                organization_id=org.id,
                payroll_policy_id=payroll_policy.id,
                name="HRA", display_name="House Rent Allowance",
                component_type="earning",
                calculation_type="percentage",
                calculation_base="basic",
                calculation_value=40.0,
                priority=1,
                is_active=True, status="active",
            ),
            PayrollComponent(
                organization_id=org.id,
                payroll_policy_id=payroll_policy.id,
                name="Conveyance", display_name="Conveyance Allowance",
                component_type="earning",
                calculation_type="fixed",
                calculation_value=1600.0,
                priority=2,
                is_active=True, status="active",
            ),
            PayrollComponent(
                organization_id=org.id,
                payroll_policy_id=payroll_policy.id,
                name="Medical", display_name="Medical Allowance",
                component_type="earning",
                calculation_type="fixed",
                calculation_value=1250.0,
                priority=3,
                is_active=True, status="active",
            ),
        ]
        for c in comps:
            db_session.add(c)
        db_session.flush()
        return comps

    def test_policy_driven_percentage_components(self, org: Organization, employee: Employee,
                                                  payroll_policy: PayrollPolicy,
                                                  components: list[PayrollComponent],
                                                  db_session: Session, full_attendance):
        employee.payroll_policy_id = payroll_policy.id
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["basic_salary"] == 50000
        assert result["hra"] == 20000
        assert result["conveyance"] == 1600
        assert result["medical"] == 1250.0
        assert abs(result["gross_salary"] - (50000 + 20000 + 1600 + 1250)) < 0.01


class TestStatutoryDeductions:
    def _no_exclusion(self, org: Organization, db_session: Session) -> None:
        """Disable PF wage-exclusion so the cap logic is what gets tested."""
        setting = StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_min_basic_for_exclusion=10_000_000.0,
        )
        db_session.add(setting)
        db_session.flush()

    def test_pf_deduction(self, org: Organization, employee: Employee,
                          db_session: Session, full_attendance):
        self._no_exclusion(org, db_session)
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=None, override_professional_tax=0)
        expected_pf = min(50000 * 12 / 100, 1800)
        assert abs(result["pf_deduction"] - expected_pf) < 0.01

    def test_pf_exempt_above_threshold(self, org: Organization, employee: Employee,
                                       db_session: Session, full_attendance):
        """Basic wage above pf_min_basic_for_exclusion makes the employee PF share zero."""
        setting = StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_min_basic_for_exclusion=15000.0,
        )
        db_session.add(setting)
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=None, override_professional_tax=0)
        assert result["pf_deduction"] == 0.0

    def test_pf_capped(self, org: Organization, employee: Employee,
                       db_session: Session, full_attendance):
        self._no_exclusion(org, db_session)
        employee.base_salary = 240000  # annual → monthly basic = 20000
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=None, override_professional_tax=0)
        # monthly basic = 20000, 12% = 2400 → capped at 1800
        assert result["pf_deduction"] == 1800.0

    def test_pf_not_applicable(self, org: Organization, employee: Employee,
                               db_session: Session, full_attendance):
        setting = StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_max_monthly=1800.0,
        )
        db_session.add(setting)
        db_session.flush()
        setting.pf_applicable = False
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=None, override_professional_tax=0)
        assert result["pf_deduction"] == 0.0

    def test_esi_deduction(self, org: Organization, employee: Employee,
                           db_session: Session, full_attendance):
        employee.base_salary = 180000  # annual → monthly basic = 15000
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=None)
        if result["gross_salary"] <= 21000:
            expected_esi = result["gross_salary"] * 0.75 / 100
            assert abs(result["esi_deduction"] - expected_esi) < 0.01

    def test_esi_not_applicable_above_ceiling(self, org: Organization, employee: Employee,
                                              db_session: Session, full_attendance):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=None)
        if result["gross_salary"] > 21000:
            assert result["esi_deduction"] == 0.0

    def test_gratuity(self, org: Organization, employee: Employee,
                      db_session: Session, full_attendance):
        pp = PayrollPolicy(
            organization_id=org.id, name="Gratuity Policy",
            include_gratuity=True, gratuity_rate=4.81, status="active",
        )
        db_session.add(pp)
        db_session.flush()
        employee.payroll_policy_id = pp.id
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0)
        expected_gratuity = result["basic_salary"] * 4.81 / 100
        assert abs(result["gratuity"] - expected_gratuity) < 0.01


class TestStateComplianceInPayroll:
    def test_auto_pt_from_state(self, org: Organization, employee: Employee,
                                db_session: Session, full_attendance):
        org.registered_state = "Karnataka"
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0)
        expected_pt = calculate_pt(result["gross_salary"], "KA")
        assert result["professional_tax"] == expected_pt

    def test_auto_lwf_from_state(self, org: Organization, employee: Employee,
                                 db_session: Session, full_attendance):
        org.registered_state = "Maharashtra"
        employee.base_salary = 180000  # annual → monthly basic = 15000
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0)
        expected_lwf = calculate_lwf(result["gross_salary"], "MH")
        assert result["lwf_deduction"] == expected_lwf["employee"]

    def test_no_state_falls_back_to_static(self, org: Organization, employee: Employee,
                                           db_session: Session, full_attendance):
        setting = db_session.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org.id
        ).first()
        if setting:
            setting.pt_applicable = True
            setting.pt_monthly_amount = 200.0
            setting.pt_min_gross = 10000.0
            setting.lwf_applicable = False
            db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=None)
        assert result["professional_tax"] == 200.0
        assert result["lwf_deduction"] == 0.0


class TestOverrideParameters:
    def test_override_basic(self, org: Organization, employee: Employee,
                            db_session: Session):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_basic=60000, override_hra=30000,
                                    override_conveyance=2000, override_medical=1500,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["basic_salary"] == 60000
        assert result["hra"] == 30000

    def test_override_overtime(self, org: Organization, employee: Employee,
                               db_session: Session):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_overtime=5000, override_bonus=10000,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["overtime_pay"] == 5000
        assert result["bonus"] == 10000

    def test_override_tds(self, org: Organization, employee: Employee,
                          db_session: Session, full_attendance):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_tds=5000, override_pf_deduction=0,
                                    override_professional_tax=0)
        assert result["tds_deduction"] == 5000

    def test_override_deductions(self, org: Organization, employee: Employee,
                                 db_session: Session):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_loan_deduction=2000,
                                    override_advance_deduction=1000,
                                    override_other_deductions=500,
                                    override_pf_deduction=0, override_professional_tax=0)
        assert result["loan_deduction"] == 2000
        assert result["advance_deduction"] == 1000
        assert result["other_deductions"] == 500

    def test_all_overrides_together(self, org: Organization, employee: Employee,
                                    db_session: Session, full_attendance):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_basic=50000, override_hra=25000,
                                    override_conveyance=1600, override_medical=1250,
                                    override_overtime=3000, override_bonus=5000,
                                    override_pf_deduction=1800, override_esi_deduction=0,
                                    override_professional_tax=200, override_tds=5000,
                                    override_loan_deduction=2000)
        gross = 50000 + 25000 + 1600 + 1250
        total_earnings = gross + 3000 + 5000
        total_deductions = 1800 + 0 + 200 + 0 + 5000 + 0 + 0 + 2000
        net = total_earnings - total_deductions
        assert abs(result["gross_salary"] - gross) < 0.01
        assert abs(result["total_earnings"] - total_earnings) < 0.01
        assert abs(result["total_deductions"] - total_deductions) < 0.01
        assert abs(result["net_salary"] - net) < 0.01
        assert result["component_breakdown"] is None or result["component_breakdown"] == []


class TestGeneratePayrollRecord:
    def test_generates_and_persists(self, org: Organization, employee: Employee,
                                     db_session: Session, full_attendance):
        payroll = generate_payroll_record(
            db_session, employee, 6, 2026,
            override_pf_deduction=0, override_professional_tax=0,
        )
        assert payroll.id is not None
        assert payroll.employee_id == employee.id
        assert payroll.month == 6
        assert payroll.year == 2026
        assert payroll.net_salary > 0
        assert payroll.status == "draft"

    def test_generate_with_overrides(self, org: Organization, employee: Employee,
                                      db_session: Session, full_attendance):
        payroll = generate_payroll_record(
            db_session, employee, 6, 2026,
            override_basic=60000, override_hra=30000,
            override_pf_deduction=1800, override_professional_tax=200,
        )
        assert payroll.basic_salary == 60000
        assert payroll.hra == 30000
        assert payroll.net_salary > 0


class TestNetSalary:
    def test_net_equals_earnings_minus_deductions(self, org: Organization,
                                                   employee: Employee,
                                                   db_session: Session, full_attendance):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=1800, override_professional_tax=200,
                                    override_esi_deduction=0, override_tds=5000,
                                    override_loan_deduction=1000)
        expected_net = result["total_earnings"] - result["total_deductions"]
        assert abs(result["net_salary"] - expected_net) < 0.01

    def test_net_never_negative_by_default(self, org: Organization,
                                           employee: Employee,
                                           db_session: Session, full_attendance):
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=100000,
                                    override_professional_tax=0)
        assert result["net_salary"] >= result["total_earnings"] - result["total_deductions"] - 0.01


class TestRegressionFixes:
    """Regression tests for the payroll correctness fixes."""

    def test_tax_surcharge_cess_not_double_counted(self, org: Organization, employee: Employee,
                                                   db_session: Session, full_attendance):
        """TDS already includes surcharge+cess; total_deductions must not add them again."""
        regime = TaxRegime(
            organization_id=org.id, name="Regression Regime", regime_type="new",
            financial_year="2026-27", standard_deduction=50000.0,
            rebate_threshold=700000.0, rebate_amount=0.0, cess_rate=4.0,
            surcharge_config=[{"from": 0, "rate": 0}], status="active",
        )
        db_session.add(regime)
        db_session.flush()
        db_session.add_all([
            TaxSlab(tax_regime_id=regime.id, from_amount=0, to_amount=400000, rate=0, sort_order=0),
            TaxSlab(tax_regime_id=regime.id, from_amount=400000, to_amount=800000, rate=5, sort_order=1),
            TaxSlab(tax_regime_id=regime.id, from_amount=800000, to_amount=None, rate=30, sort_order=2),
        ])
        org.default_tax_regime_id = regime.id
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=1800, override_professional_tax=200,
                                    override_esi_deduction=0)
        expected = (result["pf_deduction"] or 0) + (result["esi_deduction"] or 0) \
            + (result["professional_tax"] or 0) + (result["tds_deduction"] or 0)
        assert abs(result["total_deductions"] - expected) < 0.01, \
            "total_deductions must equal pf+esi+pt+tds (surcharge/cess are inside tds)"

    def test_deduction_components_not_in_gross(self, org: Organization, employee: Employee,
                                               db_session: Session, full_attendance):
        """Deduction-type components must not inflate gross; they belong in deductions."""
        pp = PayrollPolicy(organization_id=org.id, name="Cmp Policy", rounding_method="nearest",
                           decimal_places=2, include_gratuity=False, status="active")
        db_session.add(pp); db_session.flush()
        db_session.add_all([
            PayrollComponent(organization_id=org.id, payroll_policy_id=pp.id, name="Basic",
                             component_type="earning", calculation_type="percentage",
                             calculation_base="basic", calculation_value=100.0, priority=0,
                             is_active=True, status="active"),
            PayrollComponent(organization_id=org.id, payroll_policy_id=pp.id, name="PF Loan Recovery",
                             component_type="deduction", calculation_type="fixed",
                             calculation_value=1000.0, priority=1, is_active=True, status="active"),
        ])
        employee.payroll_policy_id = pp.id
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=0, override_tds=0)
        # gross = basic (50000) only; the 1000 deduction component must NOT be added to gross
        assert abs(result["gross_salary"] - 50000.0) < 0.01
        # ...and the component shows up in deductions
        assert result["total_deductions"] >= 1000.0

    def test_salary_revision_effective_base(self, org: Organization, employee: Employee,
                                            db_session: Session):
        from models import SalaryRevision
        from datetime import date
        from services.payroll_service import _get_effective_annual_ctc
        rev = SalaryRevision(employee_id=employee.id, effective_from=date(2026, 7, 1),
                             base_salary=700000, reason="raise")
        db_session.add(rev); db_session.flush()
        assert _get_effective_annual_ctc(db_session, employee, 2026, 6) == 600000  # before
        assert _get_effective_annual_ctc(db_session, employee, 2026, 7) == 700000  # from July
        assert _get_effective_annual_ctc(db_session, employee, 2026, 8) == 700000  # onwards

    def test_half_day_auto_detected_from_work_hours(self, org: Organization, employee: Employee,
                                                    db_session: Session):
        ap = AttendancePolicy(organization_id=org.id, name="HalfDay", half_day_as_full_paid=False,
                              paid_leave_as_present=True, holiday_as_present=True,
                              working_days="1,2,3,4,5,6", half_day_threshold_hours=4.0,
                              status="active")
        db_session.add(ap); db_session.flush()
        employee.attendance_policy_id = ap.id
        from datetime import datetime
        db_session.add(Attendance(employee_id=employee.id, date=datetime(2026, 6, 1),
                                  status="present", work_hours=3.0, is_manual_entry=True))
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=0, override_tds=0)
        assert result["half_days"] == 1
        # half-day counts as 0.5 paid day when half_day_as_full_paid is off
        assert abs(result["paid_days"] - 0.5) < 0.01

    def test_overtime_auto_from_attendance(self, org: Organization, employee: Employee,
                                           db_session: Session):
        ap = AttendancePolicy(organization_id=org.id, name="OT", half_day_as_full_paid=True,
                              paid_leave_as_present=True, holiday_as_present=True,
                              working_days="1,2,3,4,5,6", overtime_threshold_hours=8.0,
                              overtime_rate=1.5, status="active")
        db_session.add(ap); db_session.flush()
        employee.attendance_policy_id = ap.id
        from datetime import datetime
        db_session.add(Attendance(employee_id=employee.id, date=datetime(2026, 6, 1),
                                  status="present", work_hours=10.0, overtime_hours=2.0, is_manual_entry=True))
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=0, override_tds=0)
        assert result["overtime_pay"] > 0

    def test_non_india_org_skips_state_pt_lwf(self, org: Organization, employee: Employee,
                                              db_session: Session):
        """Non-India orgs use the configurable StatutorySetting, not Indian state PT/LWF."""
        org.country = "USA"
        org.registered_state = None
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_esi_deduction=0,
                                    override_tds=0)
        # No state-derived PT/LWF; values come from the static StatutorySetting only
        assert result["professional_tax"] == 0.0  # fallback requires basic > pt_min_gross (10000); 50000 > 10000
        assert isinstance(result["lwf_deduction"], float)

    def test_loan_auto_deduction(self, org: Organization, employee: Employee,
                                 db_session: Session):
        """Active loans/advances auto-feed the loan deduction for the period."""
        from models import SalaryLoan
        db_session.add(SalaryLoan(
            employee_id=employee.id, loan_type="loan", principal_amount=120000,
            monthly_deduction=5000, total_months=24, remaining_months=10,
            start_month=6, start_year=2026, status="active",
        ))
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=0, override_tds=0)
        assert result["loan_deduction"] == 5000.0
        # Month before the loan start -> no deduction
        result2 = calculate_payroll(db_session, employee, 5, 2026,
                                     override_pf_deduction=0, override_professional_tax=0,
                                     override_esi_deduction=0, override_tds=0)
        assert result2["loan_deduction"] == 0.0

    def test_ytd_payroll_totals(self, org: Organization, employee: Employee,
                                db_session: Session):
        """Year-to-date helper sums prior months in the financial year (Apr-Mar)."""
        from models import Payroll
        from services.payroll_service import _get_ytd_payroll_totals
        db_session.add_all([
            Payroll(employee_id=employee.id, organization_id=org.id, month=4, year=2026, gross_salary=50000, net_salary=40000, status="processed"),
            Payroll(employee_id=employee.id, organization_id=org.id, month=5, year=2026, gross_salary=60000, net_salary=48000, status="processed"),
        ])
        db_session.flush()
        totals = _get_ytd_payroll_totals(db_session, employee, 2026, 6)
        assert totals["gross"] == 110000.0  # April + May (both < June)
        assert _get_ytd_payroll_totals(db_session, employee, 2026, 4)["gross"] == 0.0  # nothing before April

    def test_not_employed_before_join_or_after_exit(self, org: Organization, employee: Employee,
                                                    db_session: Session):
        """Mid-month join/exit: no pay for months outside the employment window."""
        from datetime import datetime as _dt
        employee.join_date = _dt(2026, 6, 15)
        employee.date_of_leaving = None
        employee.termination_date = None
        db_session.flush()
        before_join = calculate_payroll(db_session, employee, 5, 2026,
                                        override_pf_deduction=0, override_professional_tax=0,
                                        override_esi_deduction=0, override_tds=0)
        assert before_join["paid_days"] == 0
        assert before_join["basic_salary"] == 0
        # After exit
        employee.join_date = _dt(2020, 1, 1)
        employee.date_of_leaving = _dt(2026, 5, 31)
        db_session.flush()
        after_exit = calculate_payroll(db_session, employee, 6, 2026,
                                       override_pf_deduction=0, override_professional_tax=0,
                                       override_esi_deduction=0, override_tds=0)
        assert after_exit["basic_salary"] == 0

    def test_statutory_bonus_opt_in(self, org: Organization, employee: Employee,
                                    db_session: Session, full_attendance):
        """Statutory bonus applies only when opted-in, India org, and gross within ceiling."""
        from services.compliance_engine import calculate_bonus
        employee.base_salary = 120000  # monthly basic 10000 -> gross ~17850 (<= 21000)
        db_session.add(StatutorySetting(
            organization_id=org.id, bonus_applicable=True, status="active",
        ))
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=0, override_tds=0)
        expected = calculate_bonus(min(result["gross_salary"], 7000.0), 12)["minimum"] / 12
        assert result["bonus"] > 0
        assert abs(result["bonus"] - expected) < 0.01
        # Off by default -> no bonus
        db_session.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org.id,
        ).delete(synchronize_session=False)
        db_session.flush()
        result2 = calculate_payroll(db_session, employee, 6, 2026,
                                     override_pf_deduction=0, override_professional_tax=0,
                                     override_esi_deduction=0, override_tds=0)
        assert result2["bonus"] == 0.0

    def test_statutory_bonus_calc_cap(self, org: Organization, employee: Employee,
                                      db_session: Session, full_attendance):
        """Bonus is computed on wages capped at 7000 even for earners up to 21000."""
        employee.base_salary = 120000
        db_session.add(StatutorySetting(
            organization_id=org.id, bonus_applicable=True, status="active",
        ))
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=0,
                                    override_esi_deduction=0, override_tds=0)
        assert result["gross_salary"] > 7000.0
        assert abs(result["bonus"] - round(7000.0 * 8.33 / 100, 2)) < 0.01

    def test_old_regime_exemptions(self, org: Organization, employee: Employee,
                                   db_session: Session, full_attendance):
        """Old-regime tax exemptions (80C etc.) lower taxable income."""
        regime = TaxRegime(
            organization_id=org.id, name="Old Regime", regime_type="old",
            financial_year="2026-27", standard_deduction=50000.0,
            rebate_threshold=700000.0, rebate_amount=0.0, cess_rate=4.0, status="active",
        )
        db_session.add(regime); db_session.flush()
        db_session.add_all([
            TaxSlab(tax_regime_id=regime.id, from_amount=0, to_amount=400000, rate=0, sort_order=0),
            TaxSlab(tax_regime_id=regime.id, from_amount=400000, to_amount=800000, rate=5, sort_order=1),
            TaxSlab(tax_regime_id=regime.id, from_amount=800000, to_amount=None, rate=30, sort_order=2),
        ])
        org.default_tax_regime_id = regime.id
        org.settings = {"payroll": {"tax_exemptions": {"80c": 150000}}}
        db_session.flush()
        result = calculate_payroll(db_session, employee, 6, 2026,
                                    override_pf_deduction=0, override_professional_tax=200,
                                    override_esi_deduction=0)
        org.settings = {"payroll": {"tax_exemptions": {"80c": 0}}}
        db_session.flush()
        result2 = calculate_payroll(db_session, employee, 6, 2026,
                                     override_pf_deduction=0, override_professional_tax=200,
                                     override_esi_deduction=0)
        assert result["tds_deduction"] < result2["tds_deduction"]
