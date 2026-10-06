"""Custom report builder API regressions - schema + data engine."""

from datetime import datetime


def _login(client):
    r = client.post("/api/auth/login", json={"email": "admin@hrms.com", "password": "admin123"})
    return r.json().get("token", "")


def test_schema_lists_sources(client):
    token = _login(client)
    r = client.get("/api/reports/custom/schema", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    ids = {s["id"] for s in data["sources"]}
    assert {"employees", "payroll", "attendance", "leave_applications",
            "leave_balances", "expenses", "assets", "performance_reviews",
            "exit_records"} <= ids
    pay = next(s for s in data["sources"] if s["id"] == "payroll")
    assert any(f["key"] == "net_salary" for f in pay["fields"])
    assert "net_salary" in pay["numeric"]
    assert "sum" in data["aggregations"]


def test_custom_data_and_aggregation(client, db_session):
    from models import Employee, Organization, Payroll, User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org = db_session.query(Organization).filter(Organization.id == admin.organization_id).first()
    emp = Employee(
        first_name="Rpt", last_name="Builder", email="rpt.builder@x.com",
        employee_code="RPT001", organization_id=org.id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    db_session.add(Payroll(
        employee_id=emp.id, organization_id=org.id, month=6, year=2026,
        gross_salary=50000, net_salary=45000, pf_deduction=1800,
        status="paid",
    ))
    db_session.flush()
    token = _login(client)

    # filtered + projected fields
    r = client.get("/api/reports/custom/data", params={
        "dataSource": "payroll", "fields": "employee_name,net_salary",
        "month": 6, "year": 2026,
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rowCount"] >= 1
    assert {c["key"] for c in body["columns"]} == {"employee_name", "net_salary"}
    assert any(row.get("net_salary") == 45000 for row in body["rows"])

    # group-by aggregation
    r2 = client.get("/api/reports/custom/data", params={
        "dataSource": "payroll", "groupBy": "status", "aggregation": "sum",
        "aggField": "net_salary", "month": 6, "year": 2026,
    }, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["groupBy"] == "status"
    assert body2["aggregation"] == "sum"
    assert any(row.get("sum_net_salary", 0) >= 45000 for row in body2["rows"])
