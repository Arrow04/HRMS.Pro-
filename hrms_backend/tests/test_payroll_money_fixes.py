"""Money-accuracy regressions: template truth, statutory single-source, bonuses.

Locks in the payroll correctness fixes:
  - % of Basic components use the computed Basic (preview == payslip)
  - unmarked stored salary splits are a display cache, never authority
  - manual entry mode / salary revisions remain sanctioned overrides
  - statutory PF/ESI/PT/LWF are never double-counted with template components
  - employer_contribution rows never reduce employee net pay
  - hand-set PF overrides the employee share only (employer follows statutory)
  - bonuses / incentives recorded via the API always reach net pay
  - pending-ad-hoc rows merge into the generated payslip (never dropped)
"""

from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from models import (
    Attendance,
    Employee,
    Organization,
    Payroll,
    PayrollComponent,
    PayrollPolicy,
    PayrollTemplate,
    StatutorySetting,
)
from services.payroll_service import (
    calculate_payroll,
    generate_payroll_record,
    is_pending_adhoc_row,
    recompute_payroll_totals,
)


# ---------------------------------------------------------------- helpers ---

@pytest.fixture
def org(db_session: Session) -> Organization:
    org = Organization(name="Money Fixes Org", code="MONEYFIX")
    db_session.add(org)
    db_session.flush()
    return org


@pytest.fixture
def employee(org: Organization, db_session: Session) -> Employee:
    emp = Employee(
        first_name="Money", last_name="Tester",
        email="money.tester@example.com", employee_code="MF001",
        designation="Engineer", organization_id=org.id,
        base_salary=600000,  # annual CTC -> monthly basic 50000
        status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


@pytest.fixture
def full_attendance(employee: Employee, db_session: Session):
    import calendar
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
        organization_id=org.id, name="MF Policy",
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


def _admin_org_id(db_session: Session) -> int:
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return admin.organization_id


def _emp_in_admin_org(db_session: Session, code: str = "PV001") -> Employee:
    org_id = _admin_org_id(db_session)
    emp = Employee(
        first_name="Preview", last_name="Tester",
        email=f"preview.{code.lower()}@example.com", employee_code=code,
        designation="Engineer", organization_id=org_id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _mk_template(db_session: Session, org_id: int) -> PayrollTemplate:
    """Basic 50% of base, HRA 40% of Basic, Conveyance/Medical fixed."""
    pp = PayrollPolicy(
        organization_id=org_id, name="Preview Policy",
        rounding_method="nearest", decimal_places=2, status="active",
    )
    db_session.add(pp)
    db_session.flush()
    for kw in (
        dict(name="Basic", display_name="Basic", component_type="earning",
             calculation_type="percentage", calculation_base="basic",
             calculation_value=50.0, priority=0),
        dict(name="HRA", display_name="HRA", component_type="earning",
             calculation_type="percentage", calculation_base="basic",
             calculation_value=40.0, priority=1),
        dict(name="Conveyance", display_name="Conveyance", component_type="earning",
             calculation_type="fixed", calculation_value=1500.0, priority=2),
        dict(name="Medical", display_name="Medical", component_type="earning",
             calculation_type="fixed", calculation_value=1500.0, priority=3),
    ):
        db_session.add(PayrollComponent(
            organization_id=org_id, payroll_policy_id=pp.id,
            is_active=True, status="active", **kw,
        ))
    db_session.flush()
    tpl = PayrollTemplate(
        organization_id=org_id, name="Preview Template",
        payroll_policy_id=pp.id, status="active", country="India",
    )
    db_session.add(tpl)
    db_session.flush()
    return tpl


# --------------------------------------------- component base semantics ---

class TestComponentBases:
    def test_hra_percent_uses_computed_basic(self, org, employee, payroll_policy,
                                             db_session, full_attendance):
        """HRA = 40% of *computed* Basic (50% of base), not of the raw base.

        Preview (salary tab split) and payslip must agree on this.
        """
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 calculation_type="percentage", calculation_base="basic",
                 calculation_value=50.0, priority=0)
        _mk_comp(db_session, org, payroll_policy, name="HRA", display_name="HRA",
                 calculation_type="percentage", calculation_base="basic",
                 calculation_value=40.0, priority=1)
        employee.payroll_policy_id = payroll_policy.id
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026,
                              override_tds=0, override_pf_deduction=0,
                              override_professional_tax=0, override_esi_deduction=0)
        assert r["basic_salary"] == 25000.0
        assert r["hra"] == 10000.0  # 40% of 25000, NOT 40% of 50000


# ---------------------------------------------------- template is truth ---

class TestTemplateTruth:
    def test_unmarked_stored_split_is_display_cache(self, org, employee, payroll_policy,
                                                    db_session, full_attendance):
        """Stored split values without _entry_mode never shadow the policy."""
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 calculation_type="percentage", calculation_base="basic",
                 calculation_value=100.0, priority=0)
        _mk_comp(db_session, org, payroll_policy, name="HRA", display_name="HRA",
                 calculation_type="percentage", calculation_base="basic",
                 calculation_value=40.0, priority=1)
        employee.payroll_policy_id = payroll_policy.id
        employee.salary_components = {"basic": 12345, "hra": 6789}
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026,
                              override_tds=0, override_pf_deduction=0,
                              override_professional_tax=0, override_esi_deduction=0)
        assert r["basic_salary"] == 50000.0  # policy truth, not 12345
        assert r["hra"] == 20000.0

    def test_manual_mode_stored_components_win(self, org, employee, payroll_policy,
                                               db_session, full_attendance):
        """_entry_mode=manual is a sanctioned override and is honoured."""
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 calculation_type="percentage", calculation_base="basic",
                 calculation_value=100.0, priority=0)
        employee.payroll_policy_id = payroll_policy.id
        employee.salary_components = {
            "basic": 30000, "hra": 12000, "_entry_mode": "manual",
        }
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026,
                              override_tds=0, override_pf_deduction=0,
                              override_professional_tax=0, override_esi_deduction=0)
        assert r["basic_salary"] == 30000.0
        assert r["hra"] == 12000.0


# ------------------------------------------------ statutory single-source ---

class TestStatutorySingleSource:
    def test_pf_component_not_double_counted(self, org, employee, payroll_policy,
                                             db_session, full_attendance):
        """A template 'PF' deduction component is never added on top of the
        statutory PF — the statutory block owns the amount."""
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 calculation_type="fixed", calculation_value=50000.0, priority=0)
        _mk_comp(db_session, org, payroll_policy, name="PF", display_name="PF",
                 component_type="deduction", calculation_type="fixed",
                 calculation_value=600.0, priority=1)
        employee.payroll_policy_id = payroll_policy.id
        db_session.add(StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_min_basic_for_exclusion=10_000_000.0,
            esi_applicable=False, pt_applicable=False, lwf_applicable=False,
        ))
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026, override_tds=0)
        assert r["pf_deduction"] == 1800.0
        expected = round(
            r["pf_deduction"] + r["esi_deduction"] + r["professional_tax"]
            + r["lwf_deduction"] + r["tds_deduction"] + r["nps_deduction"]
            + r["loan_deduction"] + r["advance_deduction"] + r["other_deductions"], 2,
        )
        assert r["total_deductions"] == expected  # 600 never added on top

    def test_pf_component_kept_when_statutory_off(self, org, employee, payroll_policy,
                                                  db_session, full_attendance):
        """With statutory PF off, the template PF component still deducts once."""
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 calculation_type="fixed", calculation_value=50000.0, priority=0)
        _mk_comp(db_session, org, payroll_policy, name="PF", display_name="PF",
                 component_type="deduction", calculation_type="fixed",
                 calculation_value=600.0, priority=1)
        employee.payroll_policy_id = payroll_policy.id
        db_session.add(StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=False, esi_applicable=False,
            pt_applicable=False, lwf_applicable=False,
        ))
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026, override_tds=0)
        assert r["pf_deduction"] == 0.0
        # The template PF component is counted exactly once (600) on top of any
        # other statutory deductions that may apply (e.g. state PT).
        other = round(
            r["pf_deduction"] + r["esi_deduction"] + r["professional_tax"]
            + r["lwf_deduction"] + r["tds_deduction"] + r["nps_deduction"]
            + r["loan_deduction"] + r["advance_deduction"] + r["other_deductions"], 2,
        )
        assert r["total_deductions"] == round(other + 600.0, 2)

    def test_employer_contribution_never_reduces_net(self, org, employee, payroll_policy,
                                                     db_session, full_attendance):
        """employer_contribution rows are employer cost — not employee
        deductions — and must never touch total_deductions or net pay."""
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 calculation_type="fixed", calculation_value=50000.0, priority=0)
        _mk_comp(db_session, org, payroll_policy, name="Employer PF", display_name="Employer PF",
                 component_type="employer_contribution", calculation_type="fixed",
                 calculation_value=700.0, priority=1)
        employee.payroll_policy_id = payroll_policy.id
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026,
                              override_tds=0, override_pf_deduction=0,
                              override_professional_tax=0, override_esi_deduction=0)
        assert r["total_deductions"] == 0.0
        assert r["net_salary"] == r["total_earnings"]
        assert r["gross_salary"] == 50000.0  # excluded from gross too

    def test_custom_pf_overrides_employee_share_only(self, org, employee,
                                                     db_session, full_attendance):
        """Hand-set PF (manual mode) overrides the employee deduction only;
        the employer contribution keeps following the statutory split."""
        employee.salary_components = {
            "basic": 30000, "hra": 0, "_entry_mode": "manual", "pf": 500,
        }
        db_session.add(StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_min_basic_for_exclusion=10_000_000.0,
            esi_applicable=False, pt_applicable=False, lwf_applicable=False,
        ))
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026,
                              override_tds=0, override_professional_tax=0,
                              override_esi_deduction=0)
        assert r["pf_deduction"] == 500.0        # sanctioned hand-set wins
        assert r["pf_employer_contribution"] == 1800.0  # statutory 12% capped


# ------------------------------------------------- bonuses and incentives ---

class TestAdhocEarnings:
    def _emp_in_admin_org(self, db_session: Session) -> Employee:
        from models import User
        admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
        org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
        emp = Employee(
            first_name="Adhoc", last_name="Tester",
            email="adhoc.tester@example.com", employee_code="AD001",
            designation="Engineer", organization_id=org.id,
            base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
        )
        db_session.add(emp)
        db_session.flush()
        return emp

    def _mk_payroll(self, db_session: Session, emp: Employee) -> Payroll:
        p = Payroll(
            employee_id=emp.id, organization_id=emp.organization_id,
            month=6, year=2026, status="draft",
            basic_salary=50000, gross_salary=50000,
            total_earnings=50000, total_deductions=5000, net_salary=45000,
            working_days=30, paid_days=30,
        )
        db_session.add(p)
        db_session.flush()
        return p

    def test_bonus_reaches_net_pay(self, client, db_session, admin_token):
        """Adding a bonus to an existing payslip recomputes net pay."""
        emp = self._emp_in_admin_org(db_session)
        p = self._mk_payroll(db_session, emp)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/bonuses", json={
            "employeeId": emp.id, "month": 6, "year": 2026,
            "amount": 5000, "reason": "Q2 incentive", "type": "bonus",
        }, headers=h)
        assert r.status_code == 200
        db_session.refresh(p)
        assert p.bonus == 5000
        assert p.total_earnings == 55000
        assert p.net_salary == 50000  # 55000 - 5000

    def test_incentive_type_routed_to_incentive_column(self, client, db_session, admin_token):
        """type=incentive lands in the incentive column and is listed."""
        emp = self._emp_in_admin_org(db_session)
        p = self._mk_payroll(db_session, emp)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/bonuses", json={
            "employeeId": emp.id, "month": 6, "year": 2026,
            "amount": 3000, "reason": "Spot incentive", "type": "incentive",
        }, headers=h)
        assert r.status_code == 200
        db_session.refresh(p)
        assert p.incentive == 3000
        assert (p.bonus or 0) == 0
        rows = client.get("/api/bonuses?month=6&year=2026", headers=h).json()
        mine = [x for x in rows if x["employeeId"] == emp.id]
        assert any(x["type"] == "incentive" and x["amount"] == 3000 for x in mine)

    def test_pending_bonus_merges_into_generated_payslip(self, client, db_session, admin_token):
        """Bonus recorded BEFORE the run is merged into the generated payslip,
        and the pending stub is retired — never dropped, never duplicated."""
        emp = self._emp_in_admin_org(db_session)
        import calendar
        dim = calendar.monthrange(2026, 6)[1]
        for day in range(1, dim + 1):
            db_session.add(Attendance(
                employee_id=emp.id, organization_id=emp.organization_id,
                date=datetime(2026, 6, day), status="present",
                work_hours=8.0, overtime_hours=0, is_manual_entry=True,
            ))
        db_session.flush()
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/bonuses", json={
            "employeeId": emp.id, "month": 6, "year": 2026,
            "amount": 5000, "reason": "Pre-run bonus", "type": "bonus",
        }, headers=h)
        assert r.status_code == 200
        stub = db_session.query(Payroll).filter(
            Payroll.employee_id == emp.id, Payroll.month == 6,
            Payroll.year == 2026, Payroll.deleted_at.is_(None),
        ).first()
        assert stub is not None and is_pending_adhoc_row(stub)
        assert stub.net_salary == 5000  # pending amount is visible immediately

        g = client.post(f"/api/payroll/generate?employeeId={emp.id}&month=6&year=2026", headers=h)
        assert g.status_code == 200

        rows = db_session.query(Payroll).filter(
            Payroll.employee_id == emp.id, Payroll.month == 6,
            Payroll.year == 2026, Payroll.deleted_at.is_(None),
        ).all()
        assert len(rows) == 1
        payslip = rows[0]
        assert not is_pending_adhoc_row(payslip)
        assert payslip.bonus == 5000  # merged, not dropped
        assert payslip.net_salary == round(payslip.total_earnings - payslip.total_deductions, 2)
        assert payslip.net_salary > 5000  # salary + bonus

    def test_delete_bonus_removes_pending_stub(self, client, db_session, admin_token):
        emp = self._emp_in_admin_org(db_session)
        h = {"Authorization": f"Bearer {admin_token}"}
        client.post("/api/bonuses", json={
            "employeeId": emp.id, "month": 6, "year": 2026,
            "amount": 2500, "reason": "Oops", "type": "bonus",
        }, headers=h)
        stub = db_session.query(Payroll).filter(
            Payroll.employee_id == emp.id, Payroll.deleted_at.is_(None),
        ).first()
        assert stub is not None
        r = client.delete(f"/api/bonuses/{stub.id}?type=bonus", headers=h)
        assert r.status_code == 200
        db_session.refresh(stub)
        assert stub.deleted_at is not None  # empty pending stub is gone

    def test_delete_bonus_zeroes_real_payslip_bonus(self, client, db_session, admin_token):
        emp = self._emp_in_admin_org(db_session)
        p = self._mk_payroll(db_session, emp)
        h = {"Authorization": f"Bearer {admin_token}"}
        client.post("/api/bonuses", json={
            "employeeId": emp.id, "month": 6, "year": 2026,
            "amount": 5000, "reason": "Q2", "type": "bonus",
        }, headers=h)
        r = client.delete(f"/api/bonuses/{p.id}?type=bonus", headers=h)
        assert r.status_code == 200
        db_session.refresh(p)
        assert (p.bonus or 0) == 0
        assert p.deleted_at is None  # real payslip survives
        assert p.net_salary == 45000  # recomputed back

    def test_generate_blocks_duplicate(self, client, db_session, admin_token):
        emp = self._emp_in_admin_org(db_session)
        h = {"Authorization": f"Bearer {admin_token}"}
        first = client.post(f"/api/payroll/generate?employeeId={emp.id}&month=6&year=2026", headers=h)
        second = client.post(f"/api/payroll/generate?employeeId={emp.id}&month=6&year=2026", headers=h)
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json().get("skipped") is True
        count = db_session.query(Payroll).filter(
            Payroll.employee_id == emp.id, Payroll.month == 6,
            Payroll.year == 2026, Payroll.deleted_at.is_(None),
        ).count()
        assert count == 1


# --------------------------------------------------------- totals helper ---

class TestRecomputeTotals:
    def test_recompute_matches_engine_formula(self, db_session: Session):
        p = Payroll(
            employee_id=1, organization_id=1, month=6, year=2026, status="draft",
            gross_salary=50000, overtime_pay=100, bonus=5000, commission=200,
            incentive=300, other_earnings=400, total_deductions=6000,
            net_salary=0, total_earnings=0,
        )
        recompute_payroll_totals(p)
        assert p.total_earnings == 56000
        assert p.net_salary == 50000

    def test_recompute_floors_negative_net(self, db_session: Session):
        p = Payroll(
            employee_id=1, organization_id=1, month=6, year=2026, status="draft",
            gross_salary=1000, total_deductions=5000,
        )
        recompute_payroll_totals(p)
        assert p.net_salary == 0.0


# ------------------------------------------------------- preview calculator ---

class TestPayrollPreview:
    """POST /api/payroll/preview — the single calculator behind the Salary tab.

    Preview must be computed by the payroll engine itself so it can never drift
    from the payslip.
    """

    def test_preview_matches_engine_for_saved_employee(self, client, db_session, admin_token):
        """Preview == calculate_payroll for the same employee (parity lock)."""
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        emp = _emp_in_admin_org(db_session)
        emp.payroll_template_id = tpl.id
        db_session.flush()
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/preview", json={
            "employeeId": emp.id, "month": 6, "year": 2026,
        }, headers=h)
        assert r.status_code == 200
        prev = r.json()
        ref = calculate_payroll(db_session, emp, 6, 2026, assume_full_attendance=True)
        for key in (
            "basic_salary", "hra", "da", "conveyance", "medical",
            "special_allowance", "other_allowance", "gross_salary",
            "total_earnings", "pf_deduction", "esi_deduction",
            "professional_tax", "total_deductions", "net_salary",
        ):
            assert prev[key] == ref[key], f"preview drifted from engine on {key}"

    def test_preview_draft_split_follows_template(self, client, db_session, admin_token):
        """Unsaved draft: the template computes the split (5000/2000/1500/1500)."""
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/preview", json={
            "baseSalary": 10000, "payFrequency": "monthly",
            "payrollTemplateId": tpl.id, "salaryMode": "monthly",
            "month": 6, "year": 2026,
        }, headers=h)
        assert r.status_code == 200
        prev = r.json()
        assert prev["basic_salary"] == 5000.0   # 50% of base
        assert prev["hra"] == 2000.0            # 40% of computed Basic
        assert prev["conveyance"] == 1500.0
        assert prev["medical"] == 1500.0
        assert prev["gross_salary"] == 10000.0
        assert prev["preview"] is True

    def test_preview_manual_mode_honours_components(self, client, db_session, admin_token):
        """Manual entry mode is a sanctioned override: the given split wins."""
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/preview", json={
            "baseSalary": 10000, "payrollTemplateId": tpl.id,
            "salaryMode": "manual",
            "salaryComponents": {"basic": 30000, "hra": 12000, "pf": 500},
            "month": 6, "year": 2026,
        }, headers=h)
        assert r.status_code == 200
        prev = r.json()
        assert prev["basic_salary"] == 30000.0
        assert prev["hra"] == 12000.0
        assert prev["pf_deduction"] == 500.0

    def test_preview_auto_ignores_stored_split(self, client, db_session, admin_token):
        """Auto mode never lets a stored split shadow the template."""
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/preview", json={
            "baseSalary": 10000, "payFrequency": "monthly",
            "payrollTemplateId": tpl.id, "salaryMode": "monthly",
            "salaryComponents": {"basic": 99999, "hra": 11111},
            "month": 6, "year": 2026,
        }, headers=h)
        assert r.status_code == 200
        prev = r.json()
        assert prev["basic_salary"] == 5000.0  # template truth, not 99999
        assert prev["hra"] == 2000.0

    def test_preview_rejects_foreign_template(self, client, db_session, admin_token):
        org_id = _admin_org_id(db_session)
        foreign_org = Organization(name="Foreign Org", code="FOREIGN1")
        db_session.add(foreign_org)
        db_session.flush()
        pp = PayrollPolicy(organization_id=foreign_org.id, name="Foreign PP",
                           rounding_method="nearest", decimal_places=2, status="active")
        db_session.add(pp)
        db_session.flush()
        tpl = PayrollTemplate(organization_id=foreign_org.id, name="Foreign Tpl",
                              payroll_policy_id=pp.id, status="active")
        db_session.add(tpl)
        db_session.flush()
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/preview", json={
            "baseSalary": 10000, "payrollTemplateId": tpl.id,
            "month": 6, "year": 2026,
        }, headers=h)
        assert r.status_code == 404


# ------------------------------------------------------------ dry-run diff ---

class TestSimulate:
    """POST /api/payroll/simulate — impact of a proposed config before saving."""

    def _setup(self, db_session: Session):
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        emp = _emp_in_admin_org(db_session, code="SM001")
        emp.payroll_template_id = tpl.id
        db_session.flush()
        return org_id, tpl, emp

    def test_simulate_detects_pf_ceiling_change(self, client, db_session, admin_token):
        """₹25,000 ceiling / ₹3,000 cap impact shows up as a per-employee delta."""
        org_id, tpl, emp = self._setup(db_session)
        db_session.add(StatutorySetting(
            organization_id=org_id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_wage_ceiling=15000.0,
            pf_min_basic_for_exclusion=10_000_000.0,
            esi_applicable=False, pt_applicable=False, lwf_applicable=False,
        ))
        db_session.flush()
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/simulate-impact", json={
            "month": 6, "year": 2026, "employeeIds": [emp.id],
            "payrollTemplateId": tpl.id,
            "proposed": {"statutory": {"pf_wage_ceiling": 25000.0, "pf_max_monthly": 3000.0}},
        }, headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["totalEmployees"] == 1
        assert body["affected"] == 1
        row = body["rows"][0]
        # basic 50000: current PF = min(50000*12%, 1800) = 1800
        assert row["current"]["pf"] == 1800.0
        # proposed PF = min(50000*12%, 3000) = 3000
        assert row["proposed"]["pf"] == 3000.0
        assert row["delta"]["pf"] == 1200.0
        assert row["delta"]["net"] == -1200.0
        assert "pf" in row["changed"] and "net" in row["changed"]
        assert body["deltaNet"] == -1200.0

    def test_simulate_component_change(self, client, db_session, admin_token):
        org_id, tpl, emp = self._setup(db_session)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/simulate-impact", json={
            "month": 6, "year": 2026, "employeeIds": [emp.id],
            "payrollTemplateId": tpl.id,
            "proposed": {"components": [
                {"name": "Basic", "component_type": "earning", "calculation_type": "percentage",
                 "calculation_base": "basic", "calculation_value": 60.0, "priority": 0},
                {"name": "HRA", "component_type": "earning", "calculation_type": "percentage",
                 "calculation_base": "basic", "calculation_value": 40.0, "priority": 1},
            ]},
        }, headers=h)
        assert r.status_code == 200
        row = r.json()["rows"][0]
        assert row["current"]["basic"] == 25000.0   # current template 50% of 50000
        assert row["proposed"]["basic"] == 30000.0  # 60% of 50000
        assert row["proposed"]["hra"] == 12000.0    # 40% of computed basic

    def test_simulate_same_config_is_noop(self, client, db_session, admin_token):
        org_id, tpl, emp = self._setup(db_session)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/simulate-impact", json={
            "month": 6, "year": 2026, "employeeIds": [emp.id],
            "proposed": {"components": [
                {"name": "Basic", "component_type": "earning", "calculation_type": "percentage",
                 "calculation_base": "basic", "calculation_value": 50.0, "priority": 0},
                {"name": "HRA", "component_type": "earning", "calculation_type": "percentage",
                 "calculation_base": "basic", "calculation_value": 40.0, "priority": 1},
                {"name": "Conveyance", "component_type": "earning", "calculation_type": "fixed",
                 "calculation_value": 1500.0, "priority": 2},
                {"name": "Medical", "component_type": "earning", "calculation_type": "fixed",
                 "calculation_value": 1500.0, "priority": 3},
            ]},
        }, headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["affected"] == 0
        assert body["deltaNet"] == 0.0


def test_template_overrides_never_write_back_to_org_settings(org, employee, payroll_policy,
                                                             db_session, full_attendance):
    """Regression: computing payroll with a template that overrides statutory
    must NEVER mutate the persisted org-level StatutorySetting (a commit would
    silently corrupt pay for every other employee)."""
    db_session.add(StatutorySetting(
        organization_id=org.id, status="active",
        pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
        pf_max_monthly=1800.0, pf_min_basic_for_exclusion=10_000_000.0,
        esi_applicable=False, pt_applicable=False, lwf_applicable=False,
    ))
    db_session.flush()
    tpl = PayrollTemplate(
        organization_id=org.id, name="Override Tpl",
        payroll_policy_id=payroll_policy.id, status="active",
        statutory={"pf_wage_ceiling": 25000.0, "pf_max_monthly": 3000.0},
    )
    db_session.add(tpl)
    db_session.flush()
    employee.payroll_template_id = tpl.id
    db_session.flush()
    r = calculate_payroll(db_session, employee, 6, 2026,
                          assume_full_attendance=True, override_tds=0)
    # The override DID apply to the calculation (basic 50000 -> PF 3000)...
    assert r["pf_deduction"] == 3000.0
    # ...but the org row must survive untouched through a commit.
    db_session.commit()
    row = db_session.query(StatutorySetting).filter(
        StatutorySetting.organization_id == org.id,
    ).first()
    assert row.pf_max_monthly == 1800.0


class TestBulkAssign:
    """POST /api/payroll-templates/{id}/assign — one action, N employees."""

    def test_bulk_assign_sets_template(self, client, db_session, admin_token):
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        e1 = _emp_in_admin_org(db_session, code="BA001")
        e2 = _emp_in_admin_org(db_session, code="BA002")
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post(f"/api/payroll-templates/{tpl.id}/assign",
                        json={"employeeIds": [e1.id, e2.id]}, headers=h)
        assert r.status_code == 200
        assert r.json()["assigned"] == 2
        db_session.refresh(e1)
        db_session.refresh(e2)
        assert e1.payroll_template_id == tpl.id
        assert e2.payroll_template_id == tpl.id

    def test_assign_rejects_foreign_employee(self, client, db_session, admin_token, employee):
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post(f"/api/payroll-templates/{tpl.id}/assign",
                        json={"employeeIds": [employee.id]}, headers=h)
        assert r.status_code == 403
        db_session.refresh(employee)
        assert employee.payroll_template_id is None

    def test_assign_requires_ids(self, client, db_session, admin_token):
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post(f"/api/payroll-templates/{tpl.id}/assign",
                        json={"employeeIds": []}, headers=h)
        assert r.status_code == 400


def test_dated_pf_rule_applies_from_effective_date(client, db_session, admin_token):
    """'PF ceiling 25,000 from April': runs before the date use the old rules,
    runs from the date use the dated rule - effective dating works end to end."""
    from models import User
    org_id = _admin_org_id(db_session)
    org = db_session.query(Organization).filter(Organization.id == org_id).first()
    org.country = "India"
    db_session.flush()
    db_session.add(StatutorySetting(
        organization_id=org_id, status="active",
        pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
        pf_max_monthly=1800.0, pf_wage_ceiling=15000.0,
        pf_min_basic_for_exclusion=10_000_000.0,
        esi_applicable=False, pt_applicable=False, lwf_applicable=False,
    ))
    db_session.flush()
    emp = _emp_in_admin_org(db_session, code="ED001")  # monthly basic 50000

    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/statutory-rules/", json={
        "rule_type": "pf_contribution",
        "country": "India",
        "effective_from": "2026-04-01",
        "definition": {
            "rate": 12.0, "wage_ceiling": 25000.0, "max_monthly": 3000.0,
            "eps_rate": 8.33, "eps_wage_ceiling": 25000.0,
            "edli_rate": 0.5, "edli_max": 75.0,
            "admin_rate": 0.5, "admin_min": 75.0,
        },
        "status": "active",
    }, headers=h)
    assert r.status_code in (200, 201)

    # March: rule not yet effective -> legacy statutory (ceiling 15000, cap 1800)
    m3 = calculate_payroll(db_session, emp, 3, 2026,
                           assume_full_attendance=True, override_tds=0)
    assert m3["pf_deduction"] == 1800.0

    # April: dated rule applies -> min(50000, 25000) * 12% capped at 3000
    m4 = calculate_payroll(db_session, emp, 4, 2026,
                           assume_full_attendance=True, override_tds=0)
    assert m4["pf_deduction"] == 3000.0


class TestBaseCoverage:
    """The salary structure must fully allocate the monthly base.

    Regression: Basic 50% + HRA 40% of Basic + Conveyance/Medical 1500 on a
    20,000 base used to show gross 17,000 - the 3,000 balance was silently
    dropped. The balance belongs to Special Allowance (the standard CTC
    balancing figure), so gross always equals the base.
    """

    def test_preview_gross_equals_base(self, client, db_session, admin_token):
        org_id = _admin_org_id(db_session)
        tpl = _mk_template(db_session, org_id)  # 50% / 40% of basic / 1500 / 1500
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.post("/api/payroll/preview", json={
            "baseSalary": 20000, "payFrequency": "monthly",
            "payrollTemplateId": tpl.id, "salaryMode": "monthly",
            "month": 6, "year": 2026,
        }, headers=h)
        assert r.status_code == 200
        p = r.json()
        assert p["basic_salary"] == 10000.0
        assert p["hra"] == 4000.0
        assert p["conveyance"] == 1500.0
        assert p["medical"] == 1500.0
        assert p["special_allowance"] == 3000.0  # the balance
        assert p["gross_salary"] == 20000.0      # exactly the base

    def test_run_pays_full_base(self, org, employee, payroll_policy, db_session, full_attendance):
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 component_type="earning", calculation_type="percentage",
                 calculation_base="basic", calculation_value=50.0, priority=0)
        _mk_comp(db_session, org, payroll_policy, name="HRA", display_name="HRA",
                 component_type="earning", calculation_type="percentage",
                 calculation_base="basic", calculation_value=40.0, priority=1)
        _mk_comp(db_session, org, payroll_policy, name="Conveyance", display_name="Conveyance",
                 component_type="earning", calculation_type="fixed",
                 calculation_value=1500.0, priority=2)
        _mk_comp(db_session, org, payroll_policy, name="Medical", display_name="Medical",
                 component_type="earning", calculation_type="fixed",
                 calculation_value=1500.0, priority=3)
        employee.payroll_policy_id = payroll_policy.id
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026,
                              assume_full_attendance=True, override_tds=0)
        # monthly base = 600000/12 = 50000 -> 25000 + 10000 + 1500 + 1500 = 38000
        assert r["basic_salary"] == 25000.0
        assert r["special_allowance"] == 12000.0  # balance
        assert r["gross_salary"] == 50000.0       # never less than the base

    def test_exact_coverage_gets_no_balance(self, org, employee, payroll_policy,
                                            db_session, full_attendance):
        _mk_comp(db_session, org, payroll_policy, name="Basic", display_name="Basic",
                 component_type="earning", calculation_type="percentage",
                 calculation_base="basic", calculation_value=100.0, priority=0)
        employee.payroll_policy_id = payroll_policy.id
        db_session.flush()
        r = calculate_payroll(db_session, employee, 6, 2026,
                              assume_full_attendance=True, override_tds=0)
        assert r["special_allowance"] == 0.0
        assert r["other_allowance"] == 0.0
        assert r["gross_salary"] == 50000.0
