"""Marginal relief: 87A rebate cliff (new regime) + surcharge thresholds.

CBDT rules encoded here:
- 87A rebate wipes slab tax out at/below the threshold; just above it (new
  regime only) tax is capped at the excess over the threshold.
- Surcharge uses the highest threshold crossed, capped at (slab tax at that
  threshold + excess over it) — both regimes.
"""
from datetime import datetime

from models import Employee, Organization, TaxRegime, TaxSlab
from services.compliance_engine import apply_tax_relief, calculate_income_tax
from services.payroll_service import _compute_cumulative_tds, _get_annual_tax


def _new_regime(**overrides):
    regime = TaxRegime(
        name="New Regime", regime_type="new",
        standard_deduction=75000, rebate_threshold=1200000,
        rebate_amount=60000, cess_rate=4.0,
    )
    regime.slabs = [
        TaxSlab(from_amount=0, to_amount=400000, rate=0),
        TaxSlab(from_amount=400000, to_amount=800000, rate=5),
        TaxSlab(from_amount=800000, to_amount=1200000, rate=10),
        TaxSlab(from_amount=1200000, to_amount=1600000, rate=15),
        TaxSlab(from_amount=1600000, to_amount=2000000, rate=20),
        TaxSlab(from_amount=2000000, to_amount=2400000, rate=25),
        TaxSlab(from_amount=2400000, to_amount=None, rate=30),
    ]
    for k, v in overrides.items():
        setattr(regime, k, v)
    return regime


def _old_regime():
    regime = TaxRegime(
        name="Old Regime", regime_type="old",
        standard_deduction=50000, rebate_threshold=500000,
        rebate_amount=12500, cess_rate=4.0,
    )
    regime.slabs = [
        TaxSlab(from_amount=0, to_amount=250000, rate=0),
        TaxSlab(from_amount=250000, to_amount=500000, rate=5),
        TaxSlab(from_amount=500000, to_amount=1000000, rate=20),
        TaxSlab(from_amount=1000000, to_amount=None, rate=30),
    ]
    return regime


class TestRebateMarginalRelief:
    def test_at_threshold_zero_tax(self):
        regime = _new_regime()
        r = calculate_income_tax(1200000 + 75000, regime, regime.slabs)
        assert r["taxable_income"] == 1200000.0
        assert r["tax"] == 0.0
        assert r["total_tax"] == 0.0

    def test_just_above_threshold_capped_at_excess(self):
        # Taxable 12.1L: slab tax 61,500 would apply without relief; the
        # Finance Act caps it at the 10,000 excess. Cess 4% -> 10,400.
        regime = _new_regime()
        r = calculate_income_tax(1210000 + 75000, regime, regime.slabs)
        assert r["tax"] == 10000.0
        assert r["cess"] == 400.0
        assert r["total_tax"] == 10400.0

    def test_well_above_threshold_full_slab_tax(self):
        # Taxable 13.75L: slab 86,250 < excess 175,000 -> relief phases out.
        regime = _new_regime()
        r = calculate_income_tax(1375000 + 75000, regime, regime.slabs)
        assert r["tax"] == 86250.0
        assert r["total_tax"] == 89700.0

    def test_old_regime_has_no_rebate_relief(self):
        # Taxable 5.1L: slab 14,500 stands (no marginal relief in old regime).
        regime = _old_regime()
        r = calculate_income_tax(510000 + 50000, regime, regime.slabs)
        assert r["tax"] == 14500.0
        assert r["total_tax"] == 15080.0

    def test_get_annual_tax_matches_engine(self):
        regime = _new_regime()
        assert _get_annual_tax(1210000, regime) == 10400.0
        assert _get_annual_tax(1200000, regime) == 0.0


class TestSurchargeMarginalRelief:
    def test_surcharge_capped_at_threshold_base_plus_excess(self):
        # Taxable 51L: slab 11,10,000 + 10% surcharge = 12,21,000 without
        # relief; capped at (slab at 50L = 10,80,000 + 1,00,000 excess).
        regime = _new_regime(surcharge_config=[{"from": 5000000, "rate": 10}])
        r = calculate_income_tax(5100000 + 75000, regime, regime.slabs)
        assert r["tax"] == 1110000.0
        assert r["surcharge"] == 70000.0
        assert r["total_tax"] == 1227200.0

    def test_highest_threshold_wins_regardless_of_order(self):
        # Unsorted config; 60L crosses 50L only -> 10% rate, no relief binds.
        regime = _new_regime(surcharge_config=[
            {"from": 10000000, "rate": 15},
            {"from": 5000000, "rate": 10},
        ])
        r = calculate_income_tax(6000000 + 75000, regime, regime.slabs)
        assert r["surcharge"] == 138000.0

    def test_helper_skips_malformed_entries(self):
        tax, rebate, surcharge = apply_tax_relief(
            100000.0, 6000000.0, [],
            rebate_threshold=1200000, rebate_amount=60000,
            regime_type="new",
            surcharge_slabs=[{"from": 5000000, "rate": 10}, {"bogus": 1}, None],
        )
        assert surcharge == 10000.0
        assert tax == 100000.0
        assert rebate == 0.0


class TestMonthlyTdsPath:
    def test_cumulative_tds_applies_rebate_relief(self, db_session):
        # June = month 3 of FY: YTD holds the current month, so projection
        # covers 10 months. monthly 128,500 -> projected 12.85L, taxable
        # 12.1L -> annual tax 10,400 after relief -> YTD share 2,600.
        org = Organization(name="TDS Relief Org", code="TDSREL")
        db_session.add(org)
        db_session.flush()
        regime = _new_regime()
        regime.organization_id = org.id
        regime.slabs = []
        db_session.add(regime)
        db_session.flush()
        for f, t, r in ((0, 400000, 0), (400000, 800000, 5), (800000, 1200000, 10),
                        (1200000, 1600000, 15), (1600000, 2000000, 20),
                        (2000000, 2400000, 25), (2400000, None, 30)):
            regime.slabs.append(TaxSlab(from_amount=f, to_amount=t, rate=r))
        db_session.flush()
        emp = Employee(
            first_name="Relief", last_name="Tester", email="relief.tester@example.com",
            employee_code="REL001", organization_id=org.id, base_salary=600000,
            status="active", join_date=datetime(2020, 1, 1),
        )
        db_session.add(emp)
        db_session.flush()
        from services.payroll_service import _compute_cumulative_tds
        out = _compute_cumulative_tds(
            db_session, emp, 2026, 6, 1285000 / 10, 0, 0, regime, "nearest", 2,
        )
        assert out["base_tax"] == 10000.0
        assert out["tds"] == 2600.0
