"""Phase 2d — dead config wiring regressions.

Locks in the two Phase 2d wirings:
  2d-1  PayrollComponent tax flags (is_tax_exempt / taxability /
        tax_exempt_limit) feed the TDS base — the component is still
        earned (gross/net earnings unchanged) but its exempt share is
        removed before the cumulative TDS projection.
  2d-2  EmployeeVoluntaryPF declarations (EPF Scheme 2026 §12) feed the
        PF block on BOTH the rule-engine path and the legacy
        StatutorySetting path, employer matching included, and payslip
        breakdown rows are emitted for the voluntary shares.
"""

import calendar
from datetime import date, datetime

import pytest
from sqlalchemy.orm import Session

from models import (
    Attendance,
    Employee,
    EmployeePayrollInput,
    EmployeeVoluntaryPF,
    LeaveBalance,
    LeaveTemplate,
    LeaveType,
    Organization,
    PayrollComponent,
    PayrollPolicy,
    PayrollTemplate,
    StatutoryRule,
    StatutorySetting,
    TaxRegime,
    TaxSlab,
)
from services.exit_management_service import _leave_encashment
from services.payroll_service import calculate_payroll
from utils.leave_balance_utils import quota_for_employee


# ---------------------------------------------------------------- helpers ---

@pytest.fixture
def org(db_session: Session) -> Organization:
    org = Organization(name="DeadConfig Org", code="DEADCFG", country="India")
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def employee(org: Organization, db_session: Session) -> Employee:
    emp = Employee(
        first_name="Dead", last_name="Config",
        email="dead.config@example.com", employee_code="DC001",
        designation="Engineer", organization_id=org.id,
        base_salary=600000,  # annual -> monthly basic 50000
        status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


@pytest.fixture
def full_attendance(employee: Employee, db_session: Session):
    dim = calendar.monthrange(2026, 6)[1]
    for day in range(1, dim + 1):
        db_session.add(Attendance(
            employee_id=employee.id, organization_id=employee.organization_id,
            date=datetime(2026, 6, day), status="present",
            work_hours=8.0, overtime_hours=0,
        ))
    db_session.flush()


@pytest.fixture
def payroll_policy(org: Organization, db_session: Session) -> PayrollPolicy:
    pp = PayrollPolicy(
        organization_id=org.id, name="DeadConfig Policy",
        rounding_method="nearest", decimal_places=2,
        include_gratuity=False, status="active",
    )
    db_session.add(pp)
    db_session.flush()
    return pp


def _mk_comp(db_session: Session, org: Organization, policy: PayrollPolicy, **kw) -> PayrollComponent:
    defaults = dict(
        organization_id=org.id, payroll_policy_id=policy.id,
        component_type="earning", calculation_type="fixed",
        calculation_value=0.0, priority=0,
        is_active=True, status="active",
    )
    defaults.update(kw)
    comp = PayrollComponent(**defaults)
    db_session.add(comp)
    db_session.flush()
    return comp


def _attach_basic(db_session, org, payroll_policy, employee, value=50000.0):
    _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
             component_type="earning", calculation_type="fixed",
             calculation_value=value, priority=0)
    employee.payroll_policy_id = payroll_policy.id
    db_session.flush()


def _all_statutory_off(db_session, org, **pf_kw):
    setting_kw = dict(
        organization_id=org.id, status="active",
        pf_applicable=False, esi_applicable=False, pt_applicable=False,
        lwf_applicable=False, gratuity_applicable=False, bonus_applicable=False,
    )
    setting_kw.update(pf_kw)
    db_session.add(StatutorySetting(**setting_kw))
    db_session.flush()


def _regime(db_session, org) -> TaxRegime:
    regime = TaxRegime(
        organization_id=org.id, name="DC Regime", regime_type="new",
        is_active=True, is_default=True,
        standard_deduction=50000.0, rebate_threshold=700000.0,
        rebate_amount=0.0, cess_rate=4.0,
    )
    db_session.add(regime)
    db_session.flush()
    for i, (lo, hi, rate) in enumerate((
        (0.0, 250000.0, 0.0),
        (250000.0, 500000.0, 5.0),
        (500000.0, 1000000.0, 20.0),
        (1000000.0, None, 30.0),
    )):
        db_session.add(TaxSlab(
            tax_regime_id=regime.id, from_amount=lo, to_amount=hi,
            rate=rate, sort_order=i,
        ))
    db_session.flush()
    return regime


def _pf_rule(db_session, org, definition):
    db_session.add(StatutoryRule(
        rule_type="pf_contribution", country="India", state_code=None,
        organization_id=org.id, company_id=None,
        effective_from=date(2026, 1, 1), status="active", version=1,
        definition=definition,
    ))
    db_session.flush()


def _vpf_row(db_session, employee, org, **kw):
    defaults = dict(
        employee_id=employee.id, organization_id=org.id,
        voluntary_amount=0.0, employer_matching=False,
        effective_from=date(2026, 1, 1), status="active",
    )
    defaults.update(kw)
    row = EmployeeVoluntaryPF(**defaults)
    db_session.add(row)
    db_session.flush()
    return row


def _breakdown_row(result, name):
    for cd in result.get("component_breakdown") or []:
        if cd.get("name") == name:
            return cd
    return None


# ── 2d-1: component tax flags → TDS base ───────────────────────────────────

class TestComponentTaxFlagsTds:
    def test_exempt_component_lowers_tds_and_keeps_earnings(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        food = _mk_comp(db_session, org, payroll_policy,
                        name="Food Coupons", display_name="Food Coupons",
                        calculation_type="fixed", calculation_value=5000.0,
                        priority=1, is_tax_exempt=False)
        _regime(db_session, org)
        _all_statutory_off(db_session, org)

        run_taxable = calculate_payroll(db_session, employee, 6, 2026)
        assert run_taxable["tds_deduction"] > 0, "TDS must be > 0 for a ₹6L employee"

        food.is_tax_exempt = True
        db_session.flush()
        run_exempt = calculate_payroll(db_session, employee, 6, 2026)

        assert run_exempt["tds_deduction"] < run_taxable["tds_deduction"]
        # The exempt flag is a TAX treatment only — earnings are unchanged.
        assert run_exempt["gross_salary"] == run_taxable["gross_salary"]
        assert run_exempt["total_earnings"] == run_taxable["total_earnings"]
        # Net moves exactly by the TDS delta (no other deduction touched).
        # Lower TDS (exempt run) → higher net by the same amount.
        assert run_exempt["net_salary"] - run_taxable["net_salary"] == pytest.approx(
            run_taxable["tds_deduction"] - run_exempt["tds_deduction"], abs=0.02)

    def test_tax_exempt_limit_caps_partial_exemption(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        food = _mk_comp(db_session, org, payroll_policy,
                        name="Food Coupons", display_name="Food Coupons",
                        calculation_type="fixed", calculation_value=5000.0,
                        priority=1, is_tax_exempt=False)
        _regime(db_session, org)
        _all_statutory_off(db_session, org)

        tds_taxable = calculate_payroll(db_session, employee, 6, 2026)["tds_deduction"]

        food.is_tax_exempt = True
        food.tax_exempt_limit = 2000.0
        db_session.flush()
        tds_partial = calculate_payroll(db_session, employee, 6, 2026)["tds_deduction"]

        food.tax_exempt_limit = None
        db_session.flush()
        tds_full = calculate_payroll(db_session, employee, 6, 2026)["tds_deduction"]

        assert tds_full < tds_partial < tds_taxable

    def test_taxability_non_taxable_equals_full_exempt(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        food = _mk_comp(db_session, org, payroll_policy,
                        name="Food Coupons", display_name="Food Coupons",
                        calculation_type="fixed", calculation_value=5000.0,
                        priority=1, is_tax_exempt=False)
        _regime(db_session, org)
        _all_statutory_off(db_session, org)

        food.is_tax_exempt = True
        db_session.flush()
        tds_full_exempt = calculate_payroll(db_session, employee, 6, 2026)["tds_deduction"]

        food.is_tax_exempt = False
        food.taxability = "non_taxable"
        db_session.flush()
        tds_non_taxable = calculate_payroll(db_session, employee, 6, 2026)["tds_deduction"]

        assert tds_non_taxable == pytest.approx(tds_full_exempt, abs=0.01)


# ── 2d-2: EmployeeVoluntaryPF → PF block ───────────────────────────────────

class TestVoluntaryPfRuleEnginePath:
    """Engine path: a published pf_contribution rule + a live VPF declaration."""

    RULE = {
        "rate": 12.0, "wage_ceiling": 25000.0, "max_monthly": 3000.0,
        "eps_rate": 0.0, "edli_rate": 0.0, "edli_max": 0.0,
        "admin_rate": 0.0, "admin_min": 0.0, "eps_wage_ceiling": 25000.0,
    }

    def test_vpf_amount_added_on_both_shares(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        _all_statutory_off(db_session, org)
        _pf_rule(db_session, org, self.RULE)
        _vpf_row(db_session, employee, org,
                 voluntary_amount=1000.0, employer_matching=True)

        out = calculate_payroll(db_session, employee, 6, 2026,
                                override_tds=0, override_professional_tax=0)

        # statutory: 12% x min(50000, 25000) = 3000, capped at max_monthly 3000
        assert out["pf_deduction"] == 4000.0, f"3000 statutory + 1000 VPF, got {out['pf_deduction']}"
        assert out["pf_employer_contribution"] == 4000.0, (
            f"3000 statutory + 1000 matching, got {out['pf_employer_contribution']}"
        )
        ee = _breakdown_row(out, "Voluntary PF (Employee)")
        er = _breakdown_row(out, "Voluntary PF (Employer)")
        assert ee is not None and ee["value"] == 1000.0
        assert er is not None and er["value"] == 1000.0

    def test_without_vpf_declaration_pf_unchanged(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        _all_statutory_off(db_session, org)
        _pf_rule(db_session, org, self.RULE)

        out = calculate_payroll(db_session, employee, 6, 2026,
                                override_tds=0, override_professional_tax=0)

        assert out["pf_deduction"] == 3000.0
        assert out["pf_employer_contribution"] == 3000.0
        assert _breakdown_row(out, "Voluntary PF (Employee)") is None

    def test_stopped_declaration_is_ignored(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        _all_statutory_off(db_session, org)
        _pf_rule(db_session, org, self.RULE)
        _vpf_row(db_session, employee, org,
                 voluntary_amount=1000.0, employer_matching=True,
                 stopped_by_employee=True)

        out = calculate_payroll(db_session, employee, 6, 2026,
                                override_tds=0, override_professional_tax=0)

        assert out["pf_deduction"] == 3000.0
        assert out["pf_employer_contribution"] == 3000.0

    def test_rate_declaration_tops_up_statutory_share(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        _all_statutory_off(db_session, org)
        # max_monthly widened so the 17% target (8500) isn't truncated at the
        # 3000 statutory cap before the top-up is computed.
        _pf_rule(db_session, org, dict(self.RULE, max_monthly=99999.0))
        _vpf_row(db_session, employee, org,
                 voluntary_rate=17.0, employer_matching=True)

        out = calculate_payroll(db_session, employee, 6, 2026,
                                override_tds=0, override_professional_tax=0)

        # statutory 12% x min(50000, 25000) = 3000; vol target 17% x 50000
        # = 8500, top-up = 8500 - 3000 = 5500 → total 8500, matching 5500.
        assert out["pf_deduction"] == 8500.0, f"got {out['pf_deduction']}"
        assert out["pf_employer_contribution"] == 8500.0, (
            f"3000 statutory + 5500 matching, got {out['pf_employer_contribution']}"
        )


class TestVoluntaryPfLegacyPath:
    """Legacy path: StatutorySetting only (no published rule) + VPF declaration."""

    def test_vpf_amount_added_on_legacy_path(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        _all_statutory_off(
            db_session, org,
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_wage_ceiling=15000.0, pf_max_monthly=1800.0,
            pf_min_basic_for_exclusion=10_000_000.0,
        )
        _vpf_row(db_session, employee, org,
                 voluntary_amount=700.0, employer_matching=True)

        out = calculate_payroll(db_session, employee, 6, 2026,
                                override_tds=0, override_professional_tax=0)

        # statutory legacy: 12% x min(50000, 15000) = 1800 (capped) + 700 VPF
        assert out["pf_deduction"] == 2500.0, f"got {out['pf_deduction']}"
        assert out["pf_employer_contribution"] == 2500.0, (
            f"1800 statutory + 700 matching, got {out['pf_employer_contribution']}"
        )
        ee = _breakdown_row(out, "Voluntary PF (Employee)")
        assert ee is not None and ee["value"] == 700.0

    def test_legacy_without_vpf_unchanged(
            self, org, employee, payroll_policy, db_session, full_attendance):
        _attach_basic(db_session, org, payroll_policy, employee)
        _all_statutory_off(
            db_session, org,
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_wage_ceiling=15000.0, pf_max_monthly=1800.0,
            pf_min_basic_for_exclusion=10_000_000.0,
        )

        out = calculate_payroll(db_session, employee, 6, 2026,
                                override_tds=0, override_professional_tax=0)

        assert out["pf_deduction"] == 1800.0
        assert out["pf_employer_contribution"] == 1800.0


# ── 2d-3: wage engine profile wiring (non-month_salary only) ───────────────

class TestWageEngineWiring:
    def test_daily_inputs_override_rate_conversion(
            self, org, employee, payroll_policy, db_session, full_attendance):
        employee.pay_frequency = "daily"
        employee.base_salary = 750.0  # daily rate; legacy monthly = 750*30
        db_session.add(EmployeePayrollInput(
            organization_id=org.id, employee_id=employee.id,
            year=2026, month=6, inputs={"daily_rate": 800.0, "days": 26},
        ))
        db_session.flush()

        out = calculate_payroll(db_session, employee, 6, 2026, override_tds=0)

        # wage engine (rate_days): 800 x 26 = 20800, not 750x30=22500
        assert out["basic_salary"] == 20800.0, f"got {out['basic_salary']}"

    def test_daily_without_inputs_keeps_legacy_conversion(
            self, org, employee, payroll_policy, db_session, full_attendance):
        employee.pay_frequency = "daily"
        employee.base_salary = 750.0
        db_session.flush()

        out = calculate_payroll(db_session, employee, 6, 2026, override_tds=0)

        assert out["basic_salary"] == 22500.0, f"got {out['basic_salary']}"

    def test_monthly_employee_ignores_wage_inputs(
            self, org, employee, payroll_policy, db_session, full_attendance):
        # default employee: monthly, base 600000 -> 50000; declared inputs
        # must NOT hijack a month_salary profile.
        db_session.add(EmployeePayrollInput(
            organization_id=org.id, employee_id=employee.id,
            year=2026, month=6, inputs={"daily_rate": 999.0, "days": 30},
        ))
        db_session.flush()

        out = calculate_payroll(db_session, employee, 6, 2026, override_tds=0)

        assert out["basic_salary"] == 50000.0, f"got {out['basic_salary']}"


# ── 2d-4: leave template accrual/encash flags ───────────────────────────────

def _mk_leave_type(db_session, org, code, name="Leave", **kw):
    kw.setdefault("is_paid", True)
    lt = LeaveType(name=name, code=code, organization_id=org.id, **kw)
    db_session.add(lt)
    db_session.flush()
    return lt


def _mk_leave_template(db_session, org, body, **kw):
    kw.setdefault("status", "active")
    kw.setdefault("effective_from", date(2026, 1, 1))
    tpl = LeaveTemplate(organization_id=org.id, name=kw.pop("name", "LT"), body=body, **kw)
    db_session.add(tpl)
    db_session.flush()
    return tpl


class TestLeaveTemplateMaxBalanceCap:
    def test_pinned_template_cap_limits_quota(
            self, org, employee, db_session):
        leave_type = _mk_leave_type(db_session, org, "ANNUAL_DC", "Annual Leave DC")
        tpl = _mk_leave_template(
            db_session, org,
            {"leaveTypes": [{"code": "ANNUAL_DC", "days": 15, "paid": True}]},
            max_balance_cap=10,
        )
        employee.leave_template_id = tpl.id
        db_session.flush()

        assert quota_for_employee(db_session, employee, leave_type) == 10

    def test_pinned_template_without_cap_keeps_full_quota(
            self, org, employee, db_session):
        leave_type = _mk_leave_type(db_session, org, "SICK_DC", "Sick Leave DC")
        tpl = _mk_leave_template(
            db_session, org,
            {"leaveTypes": [{"code": "SICK_DC", "days": 12, "paid": True}]},
            max_balance_cap=None,
        )
        employee.leave_template_id = tpl.id
        db_session.flush()

        assert quota_for_employee(db_session, employee, leave_type) == 12

    def test_payroll_template_linked_cap_limits_quota(
            self, org, employee, db_session):
        leave_type = _mk_leave_type(db_session, org, "CASUAL_DC", "Casual Leave DC")
        tpl = _mk_leave_template(
            db_session, org,
            {"leaveTypes": [{"code": "CASUAL_DC", "days": 8, "paid": True}]},
            max_balance_cap=5, name="Linked LT",
        )
        pt = PayrollTemplate(
            organization_id=org.id, name="PT for cap", status="active",
            leave_template_id=tpl.id,
        )
        db_session.add(pt)
        db_session.flush()
        employee.payroll_template_id = pt.id
        db_session.flush()

        assert quota_for_employee(db_session, employee, leave_type) == 5


class TestLeaveTemplateEncashmentKnobs:
    def _setup(self, org, employee, db_session, **tpl_kw):
        leave_type = _mk_leave_type(
            db_session, org, "annual_enc_dc", "Encash Annual Leave",
            is_encashable=True,
        )
        body = {"leaveTypes": [{"code": "annual_enc_dc", "days": 12, "paid": True,
                                "encashable": True}]}
        tpl = _mk_leave_template(db_session, org, body, name="Encash LT", **tpl_kw)
        employee.leave_template_id = tpl.id
        employee.date_of_leaving = datetime(2026, 6, 30)
        db_session.add(LeaveBalance(
            employee_id=employee.id, year=2026, leave_type_id=leave_type.id,
            total_days=12, used_days=6, remaining_days=6,
        ))
        db_session.flush()
        return leave_type, tpl

    def test_enabled_template_with_min_balance_blocks_low_balance(
            self, org, employee, db_session):
        self._setup(org, employee, db_session,
                    encashment_enabled=True, encashment_min_balance=10)
        assert _leave_encashment(db_session, employee, 60000.0) == 0.0

    def test_enabled_template_rate_multiplies_legacy_amount(
            self, org, employee, db_session):
        self._setup(org, employee, db_session,
                    encashment_enabled=True, encashment_min_balance=0,
                    encashment_rate=0.5)
        # legacy amount = (60000/30) * 6 days = 12000; rate 0.5 → 6000
        assert _leave_encashment(db_session, employee, 60000.0) == 6000.0

    def test_disabled_template_keeps_legacy_org_behaviour(
            self, org, employee, db_session):
        self._setup(org, employee, db_session,
                    encashment_enabled=False, encashment_min_balance=10)
        # flag False (column default) must NOT gate — legacy org-settings
        # formula still applies: (60000/30) * 6 = 12000
        assert _leave_encashment(db_session, employee, 60000.0) == 12000.0
