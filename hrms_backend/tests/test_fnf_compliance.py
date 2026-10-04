"""F&F compliance + statutory register regressions.

Locks in the compliance moat work:
  - TDS u/s 192 on Full & Final settlement (taxable components, exemption
    ceilings, YTD reconciliation, no-regime = 0 principle)
  - leave-encashment taxability knob (template encashment_taxable / limit)
  - gratuity exemption ceiling before TDS
  - asset recovery in F&F deductions + mark-returned
  - TDS Register + Gratuity Register report definitions (config-driven)
"""

import calendar
from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from models import (
    Asset,
    Attendance,
    Employee,
    GratuityCalculation,
    LeaveTemplate,
    Organization,
    Payroll,
    TaxRegime,
    TaxSlab,
    User,
)
from services.exit_management_service import (
    _asset_recovery,
    _fnf_tds,
    calculate_full_final_settlement,
)
from services.statutory_reports import (
    BUILTIN_REPORT_DEFINITIONS,
    ensure_builtin_definitions,
    render_report,
)


def _admin_org(db_session: Session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _regime(db_session: Session, org_id: int, **kw) -> TaxRegime:
    defaults = dict(
        organization_id=org_id, name="F&F Regime", regime_type="new",
        is_active=True, is_default=True,
        standard_deduction=50000.0, rebate_threshold=700000.0,
        rebate_amount=0.0, cess_rate=4.0,
    )
    defaults.update(kw)
    regime = TaxRegime(**defaults)
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


def _employee(db_session: Session, org_id: int, code: str, **kw) -> Employee:
    defaults = dict(
        first_name="FNF", last_name="Tester",
        email=f"{code.lower()}@fnf.example.com", employee_code=code,
        designation="Engineer", organization_id=org_id,
        base_salary=960000, status="active",
        join_date=datetime(2020, 1, 1),
        date_of_leaving=datetime(2026, 6, 30),
    )
    defaults.update(kw)
    emp = Employee(**defaults)
    db_session.add(emp)
    db_session.flush()
    return emp


def _ytd_payrolls(db_session: Session, org_id: int, employee_id: int,
                  months, gross=80000.0, pf=1800.0, pt=200.0, tds=300.0,
                  status="approved"):
    for m in months:
        db_session.add(Payroll(
            employee_id=employee_id, organization_id=org_id,
            month=m, year=2026,
            basic_salary=gross * 0.5, gross_salary=gross,
            pf_deduction=pf, professional_tax=pt, tds_deduction=tds,
            status=status,
        ))
    db_session.flush()


def _full_attendance(db_session: Session, employee: Employee, month=6, year=2026):
    dim = calendar.monthrange(year, month)[1]
    for day in range(1, dim + 1):
        db_session.add(Attendance(
            employee_id=employee.id, organization_id=employee.organization_id,
            date=datetime(year, month, day), status="present",
            work_hours=8.0,
        ))
    db_session.flush()


class TestFnfTds:
    def test_shortfall_over_ytd_withheld(self, db_session: Session):
        org = _admin_org(db_session)
        _regime(db_session, org.id)
        emp = _employee(db_session, org.id, "FNF001")
        # Apr+May approved: ytd_gross 160000, ytd_tds 600, ytd_pt 400
        _ytd_payrolls(db_session, org.id, emp.id, [4, 5])
        payables = {
            "salary_until_last_working_day": 80000.0,
            "notice_pay_in_lieu": 0.0,
            "statutory_bonus": 0.0,
            "leave_encashment": 0.0,
            "gratuity": 0.0,
        }
        out = _fnf_tds(db_session, emp, org, payables)
        # annual_gross = 160000 + 80000 = 240000; std 50000; pt 400
        # taxable = 189600 -> first slab 0% -> annual_tax 0 -> shortfall 0
        assert out["taxable_income"] == 80000.0
        assert out["amount"] == 0.0
        assert out["ytd_tds"] == 600.0

    def test_taxable_finf_income_produces_shortfall(self, db_session: Session):
        org = _admin_org(db_session)
        _regime(db_session, org.id)
        emp = _employee(db_session, org.id, "FNF002")
        _ytd_payrolls(db_session, org.id, emp.id, [4, 5, 6], tds=100.0)
        # ytd_gross 240000 + fnf 200000 salary+bonus = 440000
        # std 50000, pt 600 -> taxable 389400 -> tax = 139400*5% = 6970
        # +cess 4% = 7248.8; ytd_tds 300 -> shortfall 6948.8
        payables = {
            "salary_until_last_working_day": 120000.0,
            "notice_pay_in_lieu": 0.0,
            "statutory_bonus": 80000.0,
            "leave_encashment": 0.0,
            "gratuity": 0.0,
        }
        out = _fnf_tds(db_session, emp, org, payables)
        assert out["taxable_income"] == 200000.0
        expected_tax = ((389400.0 - 250000.0) * 0.05) * 1.04
        assert out["annual_tax"] == pytest.approx(expected_tax, abs=1.0)
        assert out["amount"] == pytest.approx(expected_tax - 300.0, abs=1.0)

    def test_gratuity_exempt_up_to_ceiling(self, db_session: Session):
        org = _admin_org(db_session)
        _regime(db_session, org.id)
        emp = _employee(db_session, org.id, "FNF003")
        payables = {
            "salary_until_last_working_day": 0.0,
            "notice_pay_in_lieu": 0.0,
            "statutory_bonus": 0.0,
            "leave_encashment": 0.0,
            "gratuity": 150000.0,  # below 2L ceiling
        }
        out = _fnf_tds(db_session, emp, org, payables)
        assert out["taxable_income"] == 0.0
        assert out["amount"] == 0.0
        assert out["breakdown"]["gratuity_exempt"] == 150000.0

    def test_gratuity_above_ceiling_is_taxable(self, db_session: Session):
        org = _admin_org(db_session)
        _regime(db_session, org.id)
        emp = _employee(db_session, org.id, "FNF004")
        payables = {
            "salary_until_last_working_day": 0.0,
            "notice_pay_in_lieu": 0.0,
            "statutory_bonus": 0.0,
            "leave_encashment": 0.0,
            "gratuity": 250000.0,  # 50000 above 2L
        }
        out = _fnf_tds(db_session, emp, org, payables)
        assert out["taxable_income"] == 50000.0
        assert out["breakdown"]["gratuity_exempt"] == 200000.0

    def test_encashment_taxable_when_template_flags_it(self, db_session: Session):
        org = _admin_org(db_session)
        _regime(db_session, org.id)
        emp = _employee(db_session, org.id, "FNF005")
        tpl = LeaveTemplate(
            organization_id=org.id, name="EncTax LT", status="active",
            body={}, encashment_taxable=True,
        )
        db_session.add(tpl)
        db_session.flush()
        emp.leave_template_id = tpl.id
        db_session.flush()
        payables = {
            "salary_until_last_working_day": 0.0,
            "notice_pay_in_lieu": 0.0,
            "statutory_bonus": 0.0,
            "leave_encashment": 400000.0,
            "gratuity": 0.0,
        }
        out = _fnf_tds(db_session, emp, org, payables)
        assert out["taxable_income"] == 400000.0  # fully taxable

    def test_encashment_exempt_up_to_limit_by_default(self, db_session: Session):
        org = _admin_org(db_session)
        _regime(db_session, org.id)
        emp = _employee(db_session, org.id, "FNF006")
        payables = {
            "salary_until_last_working_day": 0.0,
            "notice_pay_in_lieu": 0.0,
            "statutory_bonus": 0.0,
            "leave_encashment": 400000.0,  # 3L exempt, 1L taxable
            "gratuity": 0.0,
        }
        out = _fnf_tds(db_session, emp, org, payables)
        assert out["taxable_income"] == 100000.0
        assert out["breakdown"]["leave_encashment_exempt"] == 300000.0

    def test_no_regime_means_zero_tds(self, db_session: Session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "FNF007")
        payables = {
            "salary_until_last_working_day": 500000.0,
            "notice_pay_in_lieu": 0.0,
            "statutory_bonus": 0.0,
            "leave_encashment": 0.0,
            "gratuity": 0.0,
        }
        out = _fnf_tds(db_session, emp, org, payables)
        assert out["amount"] == 0.0
        assert out["reason"] == "no_tax_regime_configured"


class TestFnfIntegration:
    def test_settlement_includes_tds_and_asset_recovery(self, db_session: Session):
        org = _admin_org(db_session)
        _regime(db_session, org.id)
        emp = _employee(db_session, org.id, "FNF101", base_salary=960000)
        _full_attendance(db_session, emp, month=6, year=2026)
        _ytd_payrolls(db_session, org.id, emp.id, [4, 5], tds=100.0)
        asset = Asset(
            employee_id=emp.id, organization_id=org.id,
            asset_type="laptop", asset_name="MacBook Pro",
            serial_number="SN-FNF-101", status="assigned", value=40000.0,
        )
        db_session.add(asset)
        db_session.flush()

        out = calculate_full_final_settlement(db_session, emp.id)

        assert "tds" in out and "asset_recovery" in out
        assert out["asset_recovery"]["total"] == 40000.0
        assert out["deductions"]["asset_recovery"] == 40000.0
        assert out["deductions"]["leave_encashment_tds"] == out["tds"]["amount"]
        # Net never exceeds payables minus deductions
        assert out["net_settlement"] <= out["total_payables"] - out["total_deductions"] + 0.01
        assert out["payables"]["gratuity"] > 0, "6-year tenure must be gratuity-eligible"

    def test_recovered_assets_drop_from_recovery(self, db_session: Session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "FNF102")
        asset = Asset(
            employee_id=emp.id, organization_id=org.id,
            asset_type="phone", asset_name="iPhone",
            serial_number="SN-FNF-102", status="assigned", value=25000.0,
        )
        db_session.add(asset)
        db_session.flush()

        before = _asset_recovery(db_session, emp)
        assert before["total"] == 25000.0
        after = _asset_recovery(db_session, emp, recovered_asset_ids=[asset.id])
        assert after["total"] == 0.0
        db_session.refresh(asset)
        assert asset.status == "returned"


class TestStatutoryRegisters:
    def test_new_definitions_are_seeded(self, db_session: Session):
        org = _admin_org(db_session)
        ensure_builtin_definitions(db_session, org.id)
        from models import StatutoryReportDefinition
        codes = {
            r.code for r in db_session.query(StatutoryReportDefinition).filter(
                StatutoryReportDefinition.organization_id == org.id).all()
        }
        assert {"EPF_ECR", "ESI_RETURN", "PT_STATEMENT",
                "TDS_REGISTER", "GRATUITY_REGISTER"} <= codes

    def test_tds_register_renders_payroll_rows(self, db_session: Session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "REG001", pan_number="ABCDE1234F")
        _ytd_payrolls(db_session, org.id, emp.id, [6], tds=1234.0, status="paid")
        definition = next(d for d in BUILTIN_REPORT_DEFINITIONS
                          if d["code"] == "TDS_REGISTER")
        report = render_report(db_session, definition, org.id, 6, 2026)
        assert report["rowCount"] == 1
        row = report["rows"][0]
        assert row["tds"] == 1234.0
        assert row["gross"] == 80000.0

    def test_gratuity_register_renders_settlement_rows(self, db_session: Session):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "REG002")
        db_session.add(GratuityCalculation(
            organization_id=org.id, employee_id=emp.id,
            service_years=6.0, wage_basis="BASIC_DA", wage_basis_value=80000.0,
            days_per_year=15, divisor=26, amount=276923.08, eligible=True,
            capped=False, status="settled", settlement_ref="fnf:reg002",
        ))
        db_session.flush()
        definition = next(d for d in BUILTIN_REPORT_DEFINITIONS
                          if d["code"] == "GRATUITY_REGISTER")
        assert definition.get("source_model") == "gratuity"
        report = render_report(db_session, definition, org.id, 10, 2026)
        assert report["rowCount"] == 1
        row = report["rows"][0]
        assert row["amount"] == 276923.08
        assert row["status"] == "settled"
        assert row["service_years"] == 6.0
