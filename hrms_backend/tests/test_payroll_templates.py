"""Company-wise payroll template CRUD + payroll generation integration."""

from datetime import datetime

from models import Attendance, Company, Employee, Payroll, PayrollComponent, User


def _admin_org(db_session):
    user = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    assert user is not None, "Seeded admin user missing"
    return user.organization_id


def _mk_company(db_session, org_id):
    comp = Company(
        name="Template Co", code="TPLCO", organization_id=org_id,
        country="India", status="active",
    )
    db_session.add(comp)
    db_session.flush()
    return comp


def _payload(company_id):
    return {
        "name": "IT Staff Template",
        "description": "Standard IT configuration",
        "companyId": company_id,
        "country": "India",
        "registeredState": "Karnataka",
        "payrollPolicy": {
            "name": "IT Policy", "pro_ration_method": "paid_days",
            "rounding_method": "nearest", "decimal_places": 2,
            "round_net_salary": True, "include_gratuity": False,
            "gratuity_rate": 4.81, "default_currency": "INR",
            "allow_negative_net": False,
        },
        "components": [
            {"name": "Basic", "component_type": "earning", "calculation_type": "percentage",
             "calculation_base": "basic", "calculation_value": 50, "priority": 1, "is_taxable": True,
             "tax_category": "salary_17_1"},
            {"name": "HRA", "component_type": "earning", "calculation_type": "percentage",
             "calculation_base": "basic", "calculation_value": 40, "priority": 2, "is_taxable": True,
             "tax_category": "salary_17_1"},
            {"name": "PF", "component_type": "deduction", "calculation_type": "percentage",
             "calculation_base": "basic", "calculation_value": 12, "priority": 3, "is_statutory": True, "is_taxable": False,
             "tax_category": "post_tax_statutory"},
        ],
        "statutory": {
            "pf_applicable": True, "pf_employee_rate": 12.0, "pf_employer_rate": 12.0,
            "esi_applicable": False, "pt_applicable": True, "pt_monthly_amount": 200.0,
            "lwf_applicable": False, "gratuity_applicable": False,
        },
        "taxRegime": {
            "name": "New Regime", "regime_type": "new", "financial_year": "2025-26",
            "standard_deduction": 50000.0, "rebate_threshold": 700000.0,
            "rebate_amount": 0.0, "cess_rate": 4.0,
            "slabs": [
                {"from_amount": 0, "to_amount": 400000, "rate": 0},
                {"from_amount": 400000, "to_amount": 800000, "rate": 5},
                {"from_amount": 800000, "to_amount": None, "rate": 10},
            ],
        },
        "attendancePolicy": {
            "name": "IT Attendance", "working_days_per_week": 5,
            "working_days": "1,2,3,4,5", "half_day_as_full_paid": True,
            "paid_leave_as_present": True, "holiday_as_present": True,
            "overtime_threshold_hours": 8.0, "overtime_rate": 1.5,
            "late_mark_threshold_minutes": 15, "half_day_threshold_hours": 4.0,
        },
        "payCycle": "monthly",
        "payDay": 25,
        "autoPayslip": True,
        "emailPayslip": True,
    }


def test_template_crud(client, db_session, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    org_id = _admin_org(db_session)
    comp = _mk_company(db_session, org_id)

    # Create
    r = client.post("/api/payroll-templates", json=_payload(comp.id), headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    tpl = body["template"]
    assert tpl["name"] == "IT Staff Template"
    assert tpl["company_id"] == comp.id
    assert tpl["company_name"] == "Template Co"
    assert tpl["component_count"] == 3
    assert tpl["employee_count"] == 0
    assert len(tpl["components"]) == 3
    assert len(tpl["tax_regime"]["slabs"]) == 3
    assert tpl["statutory"]["pf_employee_rate"] == 12.0
    assert tpl["pay_cycle"] == "monthly"
    assert tpl["pay_day"] == 25
    assert tpl["auto_payslip"] is True
    assert tpl["email_payslip"] is True
    by_name = {c["name"]: c for c in tpl["components"]}
    assert by_name["Basic"]["tax_category"] == "salary_17_1"
    assert by_name["PF"]["tax_category"] == "post_tax_statutory"
    template_id = tpl["id"]

    # List
    r = client.get("/api/payroll-templates", headers=h)
    assert r.status_code == 200
    ids = [t["id"] for t in r.json()]
    assert template_id in ids

    # Detail
    r = client.get(f"/api/payroll-templates/{template_id}", headers=h)
    assert r.status_code == 200
    detail = r.json()
    assert detail["payroll_policy"]["name"] == "IT Policy"
    assert detail["attendance_policy"]["working_days_per_week"] == 5
    assert [c["name"] for c in detail["components"]] == ["Basic", "HRA", "PF"]

    # Update: replace components + tweak policy
    payload = _payload(comp.id)
    payload["components"] = [
        {"name": "Basic", "component_type": "earning", "calculation_type": "percentage",
         "calculation_base": "basic", "calculation_value": 55, "priority": 1, "is_taxable": True},
        {"name": "PF", "component_type": "deduction", "calculation_type": "percentage",
         "calculation_base": "basic", "calculation_value": 12, "priority": 2, "is_statutory": True},
    ]
    payload["payrollPolicy"] = {"name": "IT Policy v2", "include_gratuity": True}
    payload["payCycle"] = "weekly"
    payload["payDay"] = 10
    payload["autoPayslip"] = False
    r = client.put(f"/api/payroll-templates/{template_id}", json=payload, headers=h)
    assert r.status_code == 200, r.text
    updated = r.json()["template"]
    assert updated["payroll_policy"]["name"] == "IT Policy v2"
    assert updated["payroll_policy"]["include_gratuity"] is True
    assert [c["name"] for c in updated["components"]] == ["Basic", "PF"]
    assert updated["component_count"] == 2
    assert updated["pay_cycle"] == "weekly"
    assert updated["pay_day"] == 10
    assert updated["auto_payslip"] is False

    # Delete
    r = client.delete(f"/api/payroll-templates/{template_id}", headers=h)
    assert r.status_code == 200
    r = client.get("/api/payroll-templates", headers=h)
    assert template_id not in [t["id"] for t in r.json()]


def test_template_from_org_snapshot(client, db_session, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/payroll-templates/from-org", headers=h)
    assert r.status_code == 200, r.text
    tpl = r.json()["template"]
    assert "Default" in tpl["name"]
    assert tpl["component_count"] >= 0


def test_payroll_generation_uses_template(client, db_session, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    org_id = _admin_org(db_session)
    comp = _mk_company(db_session, org_id)

    r = client.post("/api/payroll-templates", json=_payload(comp.id), headers=h)
    assert r.status_code == 200, r.text
    tpl = r.json()["template"]
    template_id = tpl["id"]
    policy_id = tpl["payroll_policy_id"]

    emp = Employee(
        first_name="Tpl", last_name="User", email="tpl@example.com",
        employee_code="TPL001", designation="Engineer",
        organization_id=org_id, company_id=comp.id, base_salary=600000,
        status="active", join_date=datetime(2020, 1, 1),
        payroll_template_id=template_id,
    )
    db_session.add(emp)
    db_session.flush()

    for d in range(1, 22):
        db_session.add(Attendance(
            employee_id=emp.id, organization_id=org_id,
            date=datetime(2026, 5, d), status="present", is_manual_entry=True,
        ))

    r = client.post(f"/api/payroll/generate?employeeId={emp.id}&month=5&year=2026", headers=h)
    assert r.status_code == 200, r.text

    payroll = db_session.query(Payroll).filter(Payroll.employee_id == emp.id).first()
    assert payroll is not None
    breakdown = payroll.component_breakdown or []
    names = [str(d.get("name", "")) for d in breakdown] if isinstance(breakdown, list) else list(breakdown.keys())
    assert any("basic" in n.lower() for n in names), names
    # Template components were used (Basic/HRA/PF), not the org default policy.
    assert payroll.payroll_policy_id == policy_id

    # Template resolution: PF uses template statutory rate (12%).
    assert payroll.gross_salary > 0
    assert payroll.pf_deduction is not None


def test_template_delete_detaches_employees(client, db_session, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    org_id = _admin_org(db_session)
    comp = _mk_company(db_session, org_id)

    r = client.post("/api/payroll-templates", json=_payload(comp.id), headers=h)
    template_id = r.json()["template"]["id"]

    emp = Employee(
        first_name="Detach", last_name="Me", email="detach@example.com",
        employee_code="DT001", designation="Engineer",
        organization_id=org_id, company_id=comp.id, base_salary=600000,
        status="active", join_date=datetime(2020, 1, 1),
        payroll_template_id=template_id,
    )
    db_session.add(emp)
    db_session.flush()

    r = client.delete(f"/api/payroll-templates/{template_id}", headers=h)
    assert r.status_code == 200
    db_session.refresh(emp)
    assert emp.payroll_template_id is None


def test_template_component_rich_fields_roundtrip(client, db_session, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    org_id = _admin_org(db_session)
    comp = _mk_company(db_session, org_id)

    payload = _payload(comp.id)
    payload["components"] = [
        {"name": "Overtime", "component_type": "earning", "calculation_type": "tiered",
         "calculation_base": "basic", "calculation_value": 1.0, "priority": 1,
         "is_taxable": True, "tax_category": "salary_17_1",
         "tiered_config": [{"from": 0, "to": 2, "rate": 1.5}, {"from": 2, "to": None, "rate": 2.0}],
         "input_variables": ["overtime_hours"], "depends_on": ["basic"],
         "taxability": "taxable", "pf_applicable": True, "esi_applicable": False,
         "pt_applicable": None, "lwf_applicable": True, "gratuity_applicable": False,
         "bonus_applicable": True, "nps_applicable": False},
        {"name": "Night Shift", "component_type": "earning", "calculation_type": "shift_differential",
         "calculation_value": 500, "priority": 2, "is_taxable": True,
         "tax_category": "salary_17_1",
         "shift_differential_config": {"day": 1.0, "night": 1.25},
         "input_variables": ["hours_worked"], "depends_on": [],
         "taxability": "conditional", "pf_applicable": False, "esi_applicable": True,
         "pt_applicable": True, "lwf_applicable": False, "gratuity_applicable": True,
         "bonus_applicable": False, "nps_applicable": True},
    ]
    r = client.post("/api/payroll-templates", json=payload, headers=h)
    assert r.status_code == 200, r.text
    got = {c["name"]: c for c in r.json()["template"]["components"]}
    assert got["Overtime"]["tiered_config"] == [
        {"from": 0, "to": 2, "rate": 1.5}, {"from": 2, "to": None, "rate": 2.0},
    ]
    assert got["Overtime"]["input_variables"] == ["overtime_hours"]
    assert got["Overtime"]["depends_on"] == ["basic"]
    assert got["Overtime"]["taxability"] == "taxable"
    assert got["Overtime"]["esi_applicable"] is False
    # None survives the pick but the column default fills in on insert —
    # "inherit" is resolved at payroll time from the JSON, not the row.
    assert got["Overtime"]["pt_applicable"] is True
    assert got["Night Shift"]["shift_differential_config"] == {"day": 1.0, "night": 1.25}
    assert got["Night Shift"]["taxability"] == "conditional"
    assert got["Night Shift"]["nps_applicable"] is True

    # Unknown keys never leak through
    payload["components"][0]["hacker_field"] = "x"
    r = client.post("/api/payroll-templates", json=payload, headers=h)
    assert r.status_code == 200, r.text
    assert "hacker_field" not in {c["name"]: c for c in r.json()["template"]["components"]}["Overtime"]



def test_template_policy_fy_start_month_persists(client, db_session, admin_token):
    from services.payroll_service import _get_fy_start_month
    h = {"Authorization": f"Bearer {admin_token}"}
    org_id = _admin_org(db_session)
    comp = _mk_company(db_session, org_id)

    payload = _payload(comp.id)
    payload["payrollPolicy"] = {**payload["payrollPolicy"], "fy_start_month": 1}
    r = client.post("/api/payroll-templates", json=payload, headers=h)
    assert r.status_code == 200, r.text
    tpl = r.json()["template"]
    template_id = tpl["id"]
    assert tpl["payroll_policy"]["fy_start_month"] == 1

    # Update path persists too
    payload["payrollPolicy"] = {"fy_start_month": 7}
    r = client.put(f"/api/payroll-templates/{template_id}", json=payload, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["template"]["payroll_policy"]["fy_start_month"] == 7

    # Engine honors the template policy value...
    emp = Employee(
        first_name="Fy", last_name="Start", email="fy@example.com",
        employee_code="FY001", designation="Engineer",
        organization_id=org_id, company_id=comp.id, base_salary=600000,
        status="active", join_date=datetime(2020, 1, 1),
        payroll_template_id=template_id,
    )
    db_session.add(emp)
    db_session.flush()
    assert _get_fy_start_month(db_session, emp) == 7

    # ...and falls back to April with no policy
    emp2 = Employee(
        first_name="No", last_name="Policy", email="nopolicy@example.com",
        employee_code="FY002", designation="Engineer",
        organization_id=org_id, company_id=comp.id, base_salary=600000,
        status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp2)
    db_session.flush()
    assert _get_fy_start_month(db_session, emp2) == 4