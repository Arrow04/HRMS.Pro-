"""Phase 1.7: a broken component formula must surface as an error —
never be silently paid as ₹0."""
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from services.payroll_service import (
    ComponentFormulaError,
    _calc_component_value,
    calculate_payroll,
    generate_payroll_record,
)


def _make_comp(name="Broken Allowance", formula="missing_var * 2", calc_type="formula", calc_value=None):
    comp = MagicMock()
    comp.id = 999
    comp.name = name
    comp.display_name = name
    comp.component_type = "earning"
    comp.calculation_type = calc_type
    comp.calculation_value = calc_value
    comp.calculation_base = "basic"
    comp.formula = formula
    comp.tiered_config = None
    comp.shift_differential_config = None
    comp.input_variables = None
    comp.max_cap = None
    comp.min_cap = None
    comp.apply_pro_ration = False
    comp.priority = 1
    return comp


def _mk_employee(db, org_code="FORMERR"):
    from models import Employee, Organization
    org = db.query(Organization).filter(Organization.code == org_code).first()
    if not org:
        org = Organization(name="Formula Err Org", code=org_code, country="India")
        db.add(org)
        db.flush()
    emp = Employee(
        first_name="Frm", last_name="Err", full_name="Frm Err",
        email=f"{org_code.lower()}@example.com", employee_code=f"{org_code}001",
        organization_id=org.id, base_salary=600000, status="active",
        join_date=datetime(2020, 1, 1),
    )
    db.add(emp)
    db.flush()
    return org, emp


def test_calc_component_value_raises_on_broken_formula():
    comp = _make_comp(formula="missing_var * 2")
    with pytest.raises(ComponentFormulaError) as ei:
        _calc_component_value(comp, {"basic": 50000}, 50000)
    msg = str(ei.value)
    assert "Broken Allowance" in msg
    assert "missing_var" in msg


def test_calc_component_value_formula_without_rate_does_not_crash():
    # calculation_value=None must not blow up valid formulas (was float(None)).
    comp = _make_comp(name="HRA", formula="basic * 0.4", calc_value=None)
    val = _calc_component_value(comp, {"basic": 50000}, 50000)
    assert val == pytest.approx(20000.0)


def test_calculate_payroll_surfaces_formula_errors(db_session):
    org, emp = _mk_employee(db_session)
    bad = _make_comp(formula="missing_var * 2")
    out = calculate_payroll(db_session, emp, 6, 2026, override_components=[bad])
    assert out["has_formula_errors"] is True
    errs = out["formula_errors"]
    assert len(errs) == 1
    assert errs[0]["component"] == "Broken Allowance"
    assert "missing_var" in errs[0]["error"]
    assert errs[0]["formula"] == "missing_var * 2"


def test_calculate_payroll_valid_formula_has_no_errors(db_session):
    org, emp = _mk_employee(db_session)
    good = _make_comp(name="Special Allow", formula="basic * 0.1")
    out = calculate_payroll(db_session, emp, 6, 2026, override_components=[good])
    assert out["has_formula_errors"] is False
    assert out["formula_errors"] == []


def test_generate_refuses_to_persist_broken_formula(db_session):
    from models import Payroll
    org, emp = _mk_employee(db_session)
    bad = _make_comp(formula="missing_var * 2")
    before = db_session.query(Payroll).filter(
        Payroll.employee_id == emp.id, Payroll.month == 6, Payroll.year == 2026
    ).count()
    with pytest.raises(ComponentFormulaError) as ei:
        generate_payroll_record(db_session, emp, 6, 2026, override_components=[bad])
    assert "Broken Allowance" in str(ei.value)
    after = db_session.query(Payroll).filter(
        Payroll.employee_id == emp.id, Payroll.month == 6, Payroll.year == 2026
    ).count()
    assert after == before


def _attach_broken_component(db, org, emp):
    from models import PayrollComponent, PayrollPolicy
    policy = PayrollPolicy(organization_id=org.id, name="Formula Err Policy", status="active")
    db.add(policy)
    db.flush()
    comp = PayrollComponent(
        organization_id=org.id,
        payroll_policy_id=policy.id,
        name="Broken Allowance",
        component_type="earning",
        calculation_type="formula",
        formula="missing_var * 2",
        is_active=True,
        status="active",
        priority=1,
    )
    db.add(comp)
    emp.payroll_policy_id = policy.id
    db.flush()
    return policy, comp


def test_calculate_endpoint_returns_formula_errors(client, db_session, admin_token):
    from models import Organization, User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    admin_org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
    org, emp = _mk_employee(db_session)
    emp.organization_id = admin_org.id
    db_session.flush()
    _attach_broken_component(db_session, admin_org, emp)
    r = client.get(
        "/api/payroll/calculate",
        params={"employeeId": emp.id, "month": 6, "year": 2026},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_formula_errors"] is True
    assert body["formula_errors"][0]["component"] == "Broken Allowance"


def test_generate_endpoint_400_on_broken_formula(client, db_session, admin_token):
    from models import Organization, Payroll, User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    admin_org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
    org, emp = _mk_employee(db_session)
    emp.organization_id = admin_org.id
    db_session.flush()
    _attach_broken_component(db_session, admin_org, emp)
    r = client.post(
        "/api/payroll/generate",
        params={"employeeId": emp.id, "month": 6, "year": 2026},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 400, r.text
    assert "Broken Allowance" in r.json()["detail"]
    rows = db_session.query(Payroll).filter(
        Payroll.employee_id == emp.id, Payroll.month == 6, Payroll.year == 2026
    ).count()
    assert rows == 0
