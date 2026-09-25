"""Arrears & retroactive rule engine tests (mandate sections 33-34).

The mandated scenario is the core test: a notification arrives in August,
effective April; payroll was already processed April-July. The engine must
identify affected periods, recompute, produce arrears/recovery, preserve the
original payroll, and leave an audit trail.
"""
import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_test",
)
os.environ["ALLOW_SQLITE_FALLBACK"] = "false"
os.environ["RUN_SCHEMA_SYNC"] = "false"
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

from datetime import date, datetime

import pytest
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine
from services.arrears_engine import (
    compute_revision_arrears,
    create_arrears_adjustments,
    diff_payroll,
    identify_affected_payrolls,
    simulate_retro,
)


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import (Attendance, AuditLog, Employee, EmployeePayrollInput,
                            Organization, Payroll, PayrollAdjustment,
                            PayrollResultLine, SalaryRevision, StatutoryRule, StatutorySetting)
        org_ids = [r[0] for r in s.query(Organization.id).filter(
            Organization.code.in_(["RETRO"])).all()]
        if org_ids:
            emp_ids = [r[0] for r in s.query(Employee.id).filter(
                Employee.organization_id.in_(org_ids)).all()]
            s.query(PayrollResultLine).filter(
                PayrollResultLine.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(PayrollAdjustment).filter(
                PayrollAdjustment.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(Payroll).filter(Payroll.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(AuditLog).filter(AuditLog.organization_id.in_(org_ids),
                                     AuditLog.module == "payroll").delete(synchronize_session=False)
            if emp_ids:
                s.query(SalaryRevision).filter(
                    SalaryRevision.employee_id.in_(emp_ids)).delete(synchronize_session=False)
            for t in (Attendance, EmployeePayrollInput, StatutorySetting, Employee):
                s.query(t).filter(t.organization_id.in_(org_ids)).delete(synchronize_session=False)
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_type == "pf_contribution",
            StatutoryRule.rule_subtype.like("retro%"),
        ).delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        from core.auth import get_password_hash
        from models import Employee, Organization, StatutorySetting, User

        org = s.query(Organization).filter(Organization.code == "RETRO").first()
        if not org:
            org = Organization(name="Retro Org", code="RETRO", status="active",
                               registered_state="Karnataka")
            s.add(org)
            s.commit()
            s.refresh(org)
        user = s.query(User).filter(User.email == "retro.admin@t.com").first()
        if not user:
            user = User(email="retro.admin@t.com", full_name="Retro Admin", role="admin",
                        is_active=True, organization_id=org.id,
                        password_hash=get_password_hash("Retro123!"))
            s.add(user)
            s.commit()
            s.refresh(user)
        emp = s.query(Employee).filter(Employee.employee_code == "RETRO-1").first()
        if not emp:
            # monthly basic 10000 -> PF 12% = 1200 (uncapped)
            emp = Employee(first_name="Re", last_name="Tro", email="retro.emp@t.com",
                           employee_code="RETRO-1", organization_id=org.id,
                           base_salary=120000, status="active",
                           join_date=datetime(2020, 1, 1))
            s.add(emp)
            s.commit()
            s.refresh(emp)
        s.add(StatutorySetting(
            organization_id=org.id, status="active",
            pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_min_basic_for_exclusion=10000000.0,
            esi_applicable=False, pt_applicable=False, lwf_applicable=False,
        ))
        s.commit()
        yield {"org": org, "user": user, "emp": emp}
    finally:
        s.close()


def _process_month(s, emp, month, year):
    """Generate + finalize a payroll month with full attendance."""
    from models import Attendance, Payroll
    from services.payroll_service import generate_payroll_record
    import calendar
    dim = calendar.monthrange(year, month)[1]
    for d in range(1, dim + 1):
        s.add(Attendance(employee_id=emp.id, organization_id=emp.organization_id,
                         date=datetime(year, month, d), status="present",
                         is_manual_entry=True))
    s.commit()
    payroll = generate_payroll_record(s, emp, month, year,
                                      override_esi_deduction=0,
                                      override_professional_tax=0,
                                      override_tds=0)
    payroll.status = "processed"   # finalized: corrections must use adjustments
    s.commit()
    return payroll


class TestRetroRuleChange:
    def test_mandate_scenario_notified_in_august_effective_april(self, env):
        """The full mandated workflow, asserted end to end."""
        s = sessionmaker(bind=app_engine)()
        try:
            from models import AuditLog, Payroll, PayrollAdjustment, StatutoryRule
            emp = env["emp"]

            # April payroll processed under the OLD rule (12% via settings)
            april = _process_month(s, emp, 4, 2026)
            assert april.pf_deduction == 1200.0
            original_net = april.net_salary
            original_pf = april.pf_deduction

            # August: government notification, effective April - PF becomes 13%
            # via a published rule (legacy parameter shape the rule engine reads).
            s.add(StatutoryRule(
                rule_type="pf_contribution", rule_subtype="retro_v2",
                country="India", organization_id=env["org"].id,
                effective_from=date(2026, 4, 1), status="active", version=2,
                definition={"rate": 13.0, "wage_ceiling": 15000, "max_monthly": 1800},
                notification_number="G.S.R. 0426(E)",
            ))
            s.commit()

            # 1-4: identify affected employees/periods, recompute, compare
            sim = simulate_retro(s, env["org"].id, date(2026, 4, 1))
            assert sim["totals"]["payrolls_affected"] == 1
            period = sim["periods"][0]
            assert period["payroll_id"] == april.id
            assert period["original"]["pf_deduction"] == 1200.0
            assert period["revised"]["pf_deduction"] == 1300.0
            assert period["deltas"]["pf_deduction"] == 100.0
            # more deduction -> net falls -> recovery from the employee
            assert period["net_delta"] < 0

            # 5-7: adjustment entries + audit trail
            out = create_arrears_adjustments(
                s, env["org"].id, date(2026, 4, 1),
                source="retro_rule",
                reason="PF rate revision notified August, effective April",
                rule_version_new=2, created_by=env["user"].id,
            )
            assert len(out["created"]) == 1
            adj = out["created"][0]
            assert adj["kind"] == "recovery"
            assert adj["amount"] == period["net_delta"]
            assert adj["source"] == "retro_rule"

            audits = s.query(AuditLog).filter(
                AuditLog.organization_id == env["org"].id,
                AuditLog.action == "arrears_created",
            ).all()
            assert audits, "retro application must leave an audit trail"

            # 8-10: the ORIGINAL payroll is preserved verbatim
            s.expire_all()
            stored = s.query(Payroll).filter(Payroll.id == april.id).first()
            assert stored.pf_deduction == original_pf
            assert stored.net_salary == original_net
            assert stored.status == "processed"

            row = s.query(PayrollAdjustment).filter(
                PayrollAdjustment.payroll_id == april.id).first()
            assert row is not None and row.status == "draft"
        finally:
            s.close()

    def test_identification_skips_unfinalized_payroll(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Payroll
            emp = env["emp"]
            p = _process_month(s, emp, 5, 2026)
            p.status = "draft"   # not finalized -> no arrears, just re-run
            s.commit()
            affected = identify_affected_payrolls(
                s, env["org"].id, date(2026, 4, 1), employee_id=emp.id)
            assert all(x.month != 5 for x in affected)
        finally:
            s.close()


class TestSalaryRevisionArrears:
    def test_backdated_revision_produces_arrears(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            from models import SalaryRevision
            emp = env["emp"]
            june = _process_month(s, emp, 6, 2026)
            old_net = june.net_salary

            # Backdated increment: effective June (payroll already processed)
            rev = SalaryRevision(employee_id=emp.id,
                                 effective_from=date(2026, 6, 1),
                                 base_salary=240000, reason="backdated increment")
            s.add(rev)
            s.commit()

            out = compute_revision_arrears(s, emp, rev)
            assert out["totals"]["payrolls_affected"] >= 1
            assert out["totals"]["net_delta"] > 0   # higher pay -> arrears payable

            s.expire_all()
            stored = june and s.query(type(june)).filter(type(june).id == june.id).first()
            assert stored.net_salary == old_net   # original preserved
        finally:
            s.close()


class TestAdjustmentLifecycle:
    def test_apply_creates_adjustment_payroll(self, env):
        s = sessionmaker(bind=app_engine)()
        try:
            from models import Payroll, PayrollAdjustment
            from services.arrears_engine import apply_adjustment
            adj = s.query(PayrollAdjustment).filter(
                PayrollAdjustment.organization_id == env["org"].id,
                PayrollAdjustment.status != "applied",
            ).first()
            if adj is None:
                pytest.skip("no pending adjustment in this run")
            result = apply_adjustment(s, adj, 7, 2026, applied_by=env["user"].id)
            assert result["status"] == "applied"
            assert result["appliedPayrollId"] is not None
            booked = s.query(Payroll).filter(
                Payroll.id == result["appliedPayrollId"]).first()
            assert booked is not None and booked.status == "adjusted"
        finally:
            s.close()
