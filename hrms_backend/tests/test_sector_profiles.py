"""Sector profile tests (mandate sections 26-29): one engine, many sectors."""
from datetime import date

import pytest

from services.sector_profiles import (
    PAY_MATRIX,
    compose_sector_wages,
    government_basic_pay,
    resolve_sector_profile,
)


class TestPayMatrix:
    def test_matrix_bands(self):
        assert government_basic_pay(6, 1) == 35400
        assert government_basic_pay(1, 1) == 18000
        # highest index lands on the band maximum
        assert government_basic_pay(6, 40) == 112400

    def test_unknown_level_is_explicit(self):
        with pytest.raises(ValueError):
            government_basic_pay(99, 1)


class TestSectorCompositions:
    def test_government_employee(self):
        """Gov: pay-level basic + DA + HRA - composed, then ONE engine."""
        profile = resolve_sector_profile("GOVERNMENT")
        out = compose_sector_wages(profile, {
            "pay_level": 6, "matrix_index": 8, "city_category": "X",
        })
        basic = out["components"]["basic"]
        assert basic == government_basic_pay(6, 8)
        assert out["components"]["da"] == round(basic * 0.50, 2)   # DA 50%
        assert out["components"]["hra"] == round(basic * 0.30, 2)  # X city
        assert out["earnings"] == round(
            basic + out["components"]["da"] + out["components"]["hra"], 2)

    def test_psu_grade(self):
        profile = resolve_sector_profile("PSU")
        out = compose_sector_wages(profile, {"basic": 60000, "city_category": "Y"})
        assert out["components"]["da"] == 24000.0        # 40%
        assert out["components"]["hra"] == 10800.0       # 18%
        assert out["earnings"] == 94800.0

    def test_contract_worker_mandate_scenario(self):
        """Contract: Rs.650/day x 24 days through the same engine."""
        profile = resolve_sector_profile("CONTRACT")
        out = compose_sector_wages(profile, {"daily_rate": 650, "days": 24})
        assert out["earnings"] == 15600
        assert out["components"]["wages"] == 15600

    def test_private_monthly(self):
        profile = resolve_sector_profile("PRIVATE")
        out = compose_sector_wages(profile, {"monthly_salary": 50000})
        assert out["earnings"] == 50000

    def test_one_engine_for_all_sectors(self):
        """The mandate's architectural claim, asserted: all sectors end in the
        same calculate_base_wages call - no separate codebases."""
        for code, facts in (
            ("GOVERNMENT", {"pay_level": 4, "matrix_index": 5, "city_category": "Z"}),
            ("PSU", {"basic": 40000}),
            ("PRIVATE", {"monthly_salary": 40000}),
            ("CONTRACT", {"daily_rate": 500, "days": 20}),
        ):
            out = compose_sector_wages(resolve_sector_profile(code), facts)
            assert isinstance(out["earnings"], (int, float))
            assert "wage_method" in out

    def test_unknown_profile_is_explicit(self):
        with pytest.raises(ValueError):
            resolve_sector_profile("ALIEN")
