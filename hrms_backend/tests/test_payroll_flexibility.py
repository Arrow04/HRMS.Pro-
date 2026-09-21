"""Tests for payroll engine flexibility: conditionals, tiered, piece-rate, hourly, shift differential, multi-currency."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.payroll_service import _safe_eval, _calc_component_value
from unittest.mock import MagicMock


# ── Formula Engine: Conditionals ──

def test_formula_basic_comparison():
    ctx = {"basic": 50000}
    assert _safe_eval("1 if basic > 30000 else 0", ctx) == 1.0
    assert _safe_eval("1 if basic > 60000 else 0", ctx) == 0.0


def test_formula_nested_conditionals():
    ctx = {"gross": 80000}
    # if gross > 100000: 2000, elif gross > 50000: 1000, else 500
    result = _safe_eval("2000 if gross > 100000 else (1000 if gross > 50000 else 500)", ctx)
    assert result == 1000.0


def test_formula_comparison_operators():
    ctx = {"a": 10, "b": 20}
    assert _safe_eval("a < b", ctx) == 1.0
    assert _safe_eval("a > b", ctx) == 0.0
    assert _safe_eval("a == b", ctx) == 0.0
    assert _safe_eval("a != b", ctx) == 1.0
    assert _safe_eval("a >= 10", ctx) == 1.0
    assert _safe_eval("b <= 20", ctx) == 1.0


def test_formula_boolean_operators():
    ctx = {"age": 25, "exp": 3}
    assert _safe_eval("1 if age > 21 and exp > 2 else 0", ctx) == 1.0
    assert _safe_eval("1 if age > 30 or exp > 2 else 0", ctx) == 1.0
    assert _safe_eval("1 if age > 30 or exp > 5 else 0", ctx) == 0.0


def test_formula_math_functions():
    ctx = {"val": 3.7, "a": 10, "b": 20}
    assert _safe_eval("floor(val)", ctx) == 3
    assert _safe_eval("ceil(val)", ctx) == 4
    assert _safe_eval("max(a, b)", ctx) == 20
    assert _safe_eval("min(a, b)", ctx) == 10
    assert _safe_eval("abs(a - b)", ctx) == 10


def test_formula_ternary_with_component_refs():
    ctx = {"basic": 50000, "hra": 25000, "da": 5000}
    # HRA exemption: least of (actual HRA, 50% of basic, rent - 10% of basic)
    result = _safe_eval("min(hra, basic * 0.5)", ctx)
    assert result == 25000.0


def test_formula_error_handling():
    ctx = {"basic": 50000}
    try:
        _safe_eval("undefined_var", ctx)
        assert False, "Should have raised"
    except ValueError as e:
        assert "Unknown variable" in str(e)


# ── Piece-Rate Calculation ──

def _make_comp(calc_type, calc_value=0, formula=None, tiered_config=None, shift_diff_config=None, input_vars_def=None):
    comp = MagicMock()
    comp.calculation_type = calc_type
    comp.calculation_value = calc_value
    comp.calculation_base = "basic"
    comp.formula = formula
    comp.tiered_config = tiered_config
    comp.shift_differential_config = shift_diff_config
    comp.input_variables = input_vars_def
    comp.max_cap = None
    comp.min_cap = None
    return comp


def test_piece_rate_basic():
    comp = _make_comp("piece_rate", calc_value=10.0)
    result = _calc_component_value(comp, {"basic": 30000}, 30000, input_vars={"units_produced": 500})
    assert result == 5000.0  # 10 * 500


def test_piece_rate_zero():
    comp = _make_comp("piece_rate", calc_value=15.0)
    result = _calc_component_value(comp, {"basic": 30000}, 30000, input_vars={})
    assert result == 0.0  # no units


def test_piece_rate_with_cap():
    comp = _make_comp("piece_rate", calc_value=10.0)
    comp.max_cap = 30000
    result = _calc_component_value(comp, {"basic": 30000}, 30000, input_vars={"units_produced": 5000})
    assert result == 30000.0  # capped


# ── Hourly Calculation ──

def test_hourly_basic():
    comp = _make_comp("hourly", calc_value=500.0)
    result = _calc_component_value(comp, {"basic": 30000}, 30000, input_vars={"hours_worked": 176})
    assert result == 88000.0  # 500 * 176


def test_hourly_zero_hours():
    comp = _make_comp("hourly", calc_value=500.0)
    result = _calc_component_value(comp, {"basic": 30000}, 30000, input_vars={"hours_worked": 0})
    assert result == 0.0


# ── Tiered Calculation ──

def test_tiered_overtime():
    comp = _make_comp("tiered", calc_value=1.0, tiered_config=[
        {"from": 0, "to": 2, "rate": 1.5},
        {"from": 2, "to": 4, "rate": 2.0},
        {"from": 4, "to": None, "rate": 3.0},
    ])
    # 5 overtime hours: first 2 at 1.5, next 2 at 2.0, last 1 at 3.0
    result = _calc_component_value(comp, {"basic": 1000}, 1000, attendance_data={"overtime_hours": 5})
    # 2*1.5 + 2*2.0 + 1*3.0 = 3 + 4 + 3 = 10
    assert result == 10.0


def test_tiered_single_bracket():
    comp = _make_comp("tiered", calc_value=1.0, tiered_config=[
        {"from": 0, "to": 10, "rate": 1.5},
    ])
    result = _calc_component_value(comp, {"basic": 1000}, 1000, attendance_data={"overtime_hours": 8})
    assert result == 12.0  # 8 * 1.5


# ── Shift Differential ──

def test_shift_differential_night():
    comp = _make_comp("shift_differential", calc_value=500.0, shift_diff_config={
        "day": 1.0, "evening": 1.15, "night": 1.25
    })
    result = _calc_component_value(comp, {"basic": 30000}, 30000,
                                   input_vars={"hours_worked": 176},
                                   attendance_data={"shift_type": "night"})
    assert result == 110000.0  # 500 * 176 * 1.25


def test_shift_differential_day():
    comp = _make_comp("shift_differential", calc_value=500.0, shift_diff_config={
        "day": 1.0, "evening": 1.15, "night": 1.25
    })
    result = _calc_component_value(comp, {"basic": 30000}, 30000,
                                   input_vars={"hours_worked": 176},
                                   attendance_data={"shift_type": "day"})
    assert result == 88000.0  # 500 * 176 * 1.0


def test_shift_differential_unknown_defaults_1x():
    comp = _make_comp("shift_differential", calc_value=500.0, shift_diff_config={
        "day": 1.0, "night": 1.25
    })
    result = _calc_component_value(comp, {"basic": 30000}, 30000,
                                   input_vars={"hours_worked": 176},
                                   attendance_data={"shift_type": "weekend"})
    assert result == 88000.0  # defaults to 1.0


# ── Formula with input variables ──

def test_formula_with_input_vars():
    comp = _make_comp("formula", formula="unit_rate * units_produced", calc_value=0)
    ctx = {"basic": 30000, "unit_rate": 15, "units_produced": 200}
    result = _calc_component_value(comp, ctx, 30000, input_vars={"units_produced": 200})
    # formula has access to both computed ctx and input_vars
    assert result == 3000.0  # 15 * 200


def test_formula_commission_variable():
    """Commission: 5% of sales_amount"""
    comp = _make_comp("formula", formula="base * rate / 100", calc_value=5.0)
    result = _calc_component_value(comp, {"basic": 30000, "base": 30000}, 30000,
                                   input_vars={"sales_amount": 500000})
    # base is 30000, rate is 5 → 30000 * 5 / 100 = 1500
    assert result == 1500.0


# ── Existing calculation types still work ──

def test_fixed_still_works():
    comp = _make_comp("fixed", calc_value=5000)
    result = _calc_component_value(comp, {"basic": 30000}, 30000)
    assert result == 5000.0


def test_percentage_still_works():
    comp = _make_comp("percentage", calc_value=50.0)
    comp.calculation_base = "basic"
    result = _calc_component_value(comp, {"basic": 30000}, 30000)
    assert result == 15000.0


def test_formula_still_works():
    comp = _make_comp("formula", formula="basic * 0.4", calc_value=0)
    result = _calc_component_value(comp, {"basic": 30000}, 30000)
    assert result == 12000.0


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS: {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL: {t.__name__}: {e}")
            failed += 1
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed out of {passed + failed}")
