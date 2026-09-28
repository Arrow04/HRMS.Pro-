"""Tax planner: HRA exemption (least-of-three), old vs new regime, tips."""

from datetime import datetime

from models import Employee, Organization, TaxRegime, TaxSlab, User
from services.tax_planner import plan_tax, _hra_exemption


def _mk_regimes(db_session, org_id):
    old = TaxRegime(
        organization_id=org_id, name="Old Regime", regime_type="old", status="active",
        standard_deduction=50000, rebate_threshold=0, rebate_amount=0, cess_rate=4.0,
        section_80c_old_cap=150000, section_80d_cap=50000, section_80ccd_1b_cap=50000,
        section_24_home_loan_cap=200000, hra_metro_pct=50, hra_non_metro_pct=40,
        hra_rent_threshold_pct=10,
    )
    new = TaxRegime(
        organization_id=org_id, name="New Regime", regime_type="new", status="active",
        standard_deduction=75000, rebate_threshold=700000, rebate_amount=60000, cess_rate=4.0,
    )
    db_session.add_all([old, new])
    db_session.flush()
    for f, t, r in ((0, 250000, 0), (250000, 500000, 5), (500000, 1000000, 20), (1000000, None, 30)):
        db_session.add(TaxSlab(tax_regime_id=old.id, from_amount=f, to_amount=t, rate=r))
    for f, t, r in ((0, 400000, 0), (400000, 800000, 5), (800000, 1200000, 10),
                    (1200000, 1600000, 15), (1600000, 2000000, 20), (2000000, 2400000, 25),
                    (2400000, None, 30)):
        db_session.add(TaxSlab(tax_regime_id=new.id, from_amount=f, to_amount=t, rate=r))
    db_session.flush()
    return old, new


class TestHraExemption:
    def test_least_of_three_wins(self, db_session):
        org = Organization(name="TP Org 1", code="TPORG1")
        db_session.add(org)
        db_session.flush()
        old, _ = _mk_regimes(db_session, org.id)
        # basic 6L, HRA 2.4L, rent 20k/mo metro:
        # (a) 240000 (b) 50% basic = 300000 (c) 240000 rent - 60000 = 180000 -> least = 180000
        h = _hra_exemption(old, annual_basic=600000, annual_hra=240000,
                           rent_paid_monthly=20000, metro=True)
        assert h["amount"] == 180000.0

    def test_non_metro_uses_forty_pct(self, db_session):
        org = Organization(name="TP Org 2", code="TPORG2")
        db_session.add(org)
        db_session.flush()
        old, _ = _mk_regimes(db_session, org.id)
        # (b) 40% basic = 240000 vs actual 300000 vs rent 360000-60000=300000 -> 240000
        h = _hra_exemption(old, annual_basic=600000, annual_hra=300000,
                           rent_paid_monthly=30000, metro=False)
        assert h["amount"] == 240000.0

    def test_no_rent_means_no_exemption(self, db_session):
        org = Organization(name="TP Org 3", code="TPORG3")
        db_session.add(org)
        db_session.flush()
        old, _ = _mk_regimes(db_session, org.id)
        h = _hra_exemption(old, annual_basic=600000, annual_hra=240000,
                           rent_paid_monthly=0, metro=True)
        assert h["amount"] == 0.0


class TestPlanTax:
    def _org(self, db_session, code):
        org = Organization(name=f"Plan {code}", code=code)
        db_session.add(org)
        db_session.flush()
        return org

    def test_old_regime_wins_with_full_exemptions(self, db_session):
        org = self._org(db_session, "PLANOLD")
        _mk_regimes(db_session, org.id)
        r = plan_tax(
            db_session, org.id,
            annual_gross=1200000, annual_basic=600000, annual_hra=240000,
            rent_paid_monthly=20000, metro=True,
            section_80c=150000, section_80d=25000,
            nps_80ccd_1b=50000, home_loan_interest=200000,
        )
        # old taxable = 12L - (50k + 1.5L + 25k + 50k + 2L + 1.8L HRA) = 545000
        assert r["oldRegime"]["taxableIncome"] == 545000.0
        # tax = 250k*5% + 45k*20% = 12500 + 9000 = 21500, +4% cess = 22360
        assert abs(r["oldRegime"]["totalTax"] - 22360.0) < 1
        # new taxable = 12L - 75k = 1125000 -> 20000 + 32500 = 52500 + 4% = 54600
        assert abs(r["newRegime"]["totalTax"] - 54600.0) < 1
        assert r["recommendation"]["regime"] == "old"
        assert abs(r["recommendation"]["savings"] - 32240.0) < 1

    def test_new_regime_wins_without_exemptions(self, db_session):
        org = self._org(db_session, "PLANNEW")
        _mk_regimes(db_session, org.id)
        r = plan_tax(
            db_session, org.id,
            annual_gross=2400000, annual_basic=1200000, annual_hra=480000,
        )
        assert r["recommendation"]["regime"] == "new"
        # new taxable = 2325000 -> 281250 + 4% cess = 292500
        assert abs(r["newRegime"]["totalTax"] - 292500.0) < 1
        # old taxable = 2350000 -> 517500 + 4% cess = 538200
        assert abs(r["oldRegime"]["totalTax"] - 538200.0) < 1
        assert r["newRegime"]["incomeAfterTax"] > r["oldRegime"]["incomeAfterTax"]

    def test_rebate_zeroes_small_income_in_new_regime(self, db_session):
        org = self._org(db_session, "PLANREB")
        _mk_regimes(db_session, org.id)
        r = plan_tax(
            db_session, org.id,
            annual_gross=750000, annual_basic=375000, annual_hra=150000,
        )
        # new taxable = 675000 <= 700000 rebate threshold -> tax 0
        assert r["newRegime"]["totalTax"] == 0.0

    def test_tips_cover_unused_80c(self, db_session):
        org = self._org(db_session, "PLANTIP")
        _mk_regimes(db_session, org.id)
        r = plan_tax(
            db_session, org.id,
            annual_gross=1200000, annual_basic=600000, annual_hra=240000,
            rent_paid_monthly=20000, metro=True, section_80c=0,
        )
        titles = [t["title"] for t in r["tips"]]
        assert "Invest more under 80C" in titles
        tip = next(t for t in r["tips"] if t["title"] == "Invest more under 80C")
        assert tip["saving"] > 0

    def test_caps_are_respected(self, db_session):
        org = self._org(db_session, "PLANCAP")
        _mk_regimes(db_session, org.id)
        r = plan_tax(
            db_session, org.id,
            annual_gross=2400000, annual_basic=1200000, annual_hra=480000,
            rent_paid_monthly=40000, metro=True,
            section_80c=999999, section_80d=999999,
            nps_80ccd_1b=999999, home_loan_interest=999999,
        )
        d = r["oldRegime"]["deductions"]
        assert d["section80c"] == 150000.0   # capped
        assert d["section80d"] == 50000.0    # capped
        assert d["nps80ccd1b"] == 50000.0    # capped
        assert d["homeLoanInterest"] == 200000.0  # capped


def test_planner_endpoint_prefills_from_employee(client, db_session, admin_token):
    from datetime import date as _date
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org_id = admin.organization_id
    org = db_session.query(Organization).filter(Organization.id == org_id).first()
    org.country = "India"
    _mk_regimes(db_session, org_id)
    emp = Employee(
        first_name="Planner", last_name="Tester", email="planner.tester@example.com",
        employee_code="TPL001", organization_id=org_id,
        base_salary=1200000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/payroll/tax-planner", json={"employeeId": emp.id, "month": 6, "year": 2026}, headers=h)
    assert r.status_code == 200
    body = r.json()
    # annual basic = monthly 100000 * 12
    assert body["inputs"]["annualBasic"] == 1200000.0
    assert body["oldRegime"]["totalTax"] >= 0
    assert body["recommendation"]["regime"] in ("old", "new")
    assert isinstance(body["tips"], list)
