"""Tests for state compliance — PT, LWF, and state key resolution."""

import pytest
from data.state_compliance import (
    calculate_lwf,
    calculate_pt,
    get_all_state_codes,
    get_lwf_for_state,
    get_lwf_state_codes,
    get_pt_for_state,
    resolve_state_key,
)


class TestResolveStateKey:
    def test_two_letter_code(self):
        assert resolve_state_key("KA") == "karnataka"
        assert resolve_state_key("TN") == "tamil_nadu"
        assert resolve_state_key("MH") == "maharashtra"

    def test_full_name(self):
        assert resolve_state_key("Karnataka") == "karnataka"
        assert resolve_state_key("Tamil Nadu") == "tamil_nadu"
        assert resolve_state_key("Madhya Pradesh") == "madhya_pradesh"

    def test_lowercase_snake(self):
        assert resolve_state_key("karnataka") == "karnataka"
        assert resolve_state_key("tamil_nadu") == "tamil_nadu"

    def test_lowercase_case_insensitive(self):
        assert resolve_state_key("kerala") == "kerala"
        assert resolve_state_key("KERALA") == "kerala"

    def test_invalid_state(self):
        assert resolve_state_key("xyz") is None
        assert resolve_state_key("") is None

    def test_empty_or_none(self):
        assert resolve_state_key("") is None


class TestCalculatePT:
    def test_karnataka_below_threshold(self):
        assert calculate_pt(10000, "KA") == 0.0

    def test_karnataka_first_slab(self):
        assert calculate_pt(16000, "KA") == 150.0

    def test_karnataka_top_slab(self):
        assert calculate_pt(25000, "KA") == 200.0

    def test_maharashtra_below_threshold(self):
        assert calculate_pt(5000, "MH") == 0.0

    def test_maharashtra_mid_slab(self):
        assert calculate_pt(8000, "MH") == 175.0

    def test_maharashtra_top_slab(self):
        assert calculate_pt(15000, "MH") == 300.0

    def test_kerala_very_low(self):
        assert calculate_pt(1000, "KL") == 0.0

    def test_kerala_high(self):
        assert calculate_pt(30000, "KL") == 200.0

    def test_tamil_nadu_top_slab(self):
        assert calculate_pt(100000, "TN") == 315.0

    def test_tamil_nadu_mid_slab(self):
        assert calculate_pt(35000, "TN") == 160.0

    def test_telangana_flat_rate(self):
        assert calculate_pt(50000, "TS") == 200.0

    def test_default_for_unlisted_state(self):
        assert calculate_pt(10000, "OTHER") == 0.0
        assert calculate_pt(25000, "OTHER") == 200.0

    def test_exact_boundary(self):
        assert calculate_pt(14999.99, "KA") == 0.0
        assert calculate_pt(15000, "KA") == 150.0

    def test_zero_salary(self):
        assert calculate_pt(0, "KA") == 0.0

    def test_full_name_as_state_code(self):
        assert calculate_pt(25000, "Karnataka") == 200.0
        assert calculate_pt(25000, "Tamil Nadu") == 110.0


class TestCalculateLWF:
    def test_karnataka_below_threshold(self):
        result = calculate_lwf(10000, "KA")
        assert result["applicable"] is True
        assert result["employee"] == 20.0
        assert result["employer"] == 40.0

    def test_karnataka_above_threshold(self):
        result = calculate_lwf(20000, "KA")
        assert result["applicable"] is False
        assert result["employee"] == 0.0

    def test_tamil_nadu_half_yearly(self):
        result = calculate_lwf(10000, "TN")
        assert result["applicable"] is True
        assert result["employee"] == 20.0
        assert result["frequency"] == "half_yearly"

    def test_maharashtra_higher_ceiling(self):
        result = calculate_lwf(25000, "MH")
        assert result["applicable"] is True
        assert result["employee"] == 12.0

    def test_maharashtra_above_ceiling(self):
        result = calculate_lwf(35000, "MH")
        assert result["applicable"] is False

    def test_state_without_lwf(self):
        result = calculate_lwf(10000, "BI")
        assert result["applicable"] is False
        assert result["employee"] == 0.0

    def test_full_name_lwf(self):
        result = calculate_lwf(10000, "Karnataka")
        assert result["applicable"] is True

    def test_zero_salary_lwf(self):
        result = calculate_lwf(0, "KA")
        assert result["applicable"] is True

    def test_multiple_states_have_lwf(self):
        states_with_lwf = get_lwf_state_codes()
        assert "karnataka" in states_with_lwf
        assert "maharashtra" in states_with_lwf
        assert "tamil_nadu" in states_with_lwf
        assert len(states_with_lwf) >= 15


class TestGetFunctions:
    def test_get_pt_for_state(self):
        config = get_pt_for_state("KA")
        assert config is not None
        assert config["code"] == "KA"
        assert len(config["slabs"]) >= 2

    def test_get_pt_for_state_invalid(self):
        assert get_pt_for_state("ZZ") is None

    def test_get_lwf_for_state(self):
        config = get_lwf_for_state("KA")
        assert config is not None
        assert config["applicable"] is True

    def test_get_lwf_for_state_invalid(self):
        assert get_lwf_for_state("ZZ") is None

    def test_get_all_state_codes(self):
        codes = get_all_state_codes()
        assert "karnataka" in codes
        assert "maharashtra" in codes
        assert "tamil_nadu" in codes
        assert len(codes) >= 20
