"""Phase 1.6: PII/financial fields must be masked on employee detail endpoints."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient


def _make_org_emp_user(db, org, code, email, **emp_kw):
    from models import Employee
    emp = Employee(
        first_name="T", last_name="User", full_name="T User",
        email=email, employee_code=code,
        organization_id=org.id, status="active",
        join_date=datetime(2020, 1, 1), **emp_kw,
    )
    db.add(emp)
    db.flush()
    return emp


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _setup(db):
    """Admin org with a target employee + a plain staff user linked to one."""
    from core.auth import get_password_hash
    from models import Organization, User

    admin = db.query(User).filter(User.email == "admin@hrms.com").first()
    org = db.query(Organization).filter(Organization.id == admin.organization_id).first()

    target = _make_org_emp_user(
        db, org, "PII001", "target@example.com",
        pan_number="ABCDE1234F", aadhar_number="123456789012",
        bank_account_number="987654321", bank_name="HDFC",
        ifsc_code="HDFC0001234", base_salary=600000, pay_rate=3000,
        esic_number="ESIC123", pf_number="PF123",
    )
    staff = User(
        email="staff-pii@example.com", full_name="Staff PII",
        role="employee", organization_id=org.id,
        password_hash=get_password_hash("pw123"), is_active=True,
    )
    db.add(staff)
    db.flush()
    staff_emp = _make_org_emp_user(
        db, org, "PII002", "staff-pii@example.com",
        pan_number="STAFF9999S", bank_account_number="111222333",
        base_salary=200000,
    )
    staff_emp.user_id = staff.id
    db.flush()
    return org, target, staff, staff_emp


def test_detail_masks_pii_for_employee_role(client, db_session, admin_token):
    org, target, staff, staff_emp = _setup(db_session)
    token = _login(client, "staff-pii@example.com", "pw123")

    # Another employee's record → masked
    r = client.get(f"/api/employees/{target.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["panNumber"] is None
    assert body["aadharNumber"] is None
    assert body["bankAccountNumber"] is None
    assert body["ifscCode"] is None
    assert body["baseSalary"] in (None, 0)
    assert body["esicNumber"] is None
    assert body["pfNumber"] is None
    assert body["payRate"] is None

    # Own record → unmasked (self-service profile keeps working)
    r = client.get(f"/api/employees/{staff_emp.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["panNumber"] == "STAFF9999S"
    assert body["bankAccountNumber"] == "111222333"
    assert body["baseSalary"] == 200000


def test_detail_unmasked_for_admin(client, db_session, admin_token):
    org, target, staff, staff_emp = _setup(db_session)
    r = client.get(f"/api/employees/{target.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["panNumber"] == "ABCDE1234F"
    assert body["bankAccountNumber"] == "987654321"
    assert body["baseSalary"] == 600000
    assert body["esicNumber"] == "ESIC123"


def test_detail_cross_org_returns_404(client, db_session, admin_token):
    from models import Organization
    org, target, staff, staff_emp = _setup(db_session)
    other_org = Organization(name="Other PII Org", code="PIIORG2", country="India")
    db_session.add(other_org)
    db_session.flush()
    foreign = _make_org_emp_user(
        db_session, other_org, "PII900", "foreign@example.com",
        pan_number="FOREIGN99P", base_salary=999999,
    )
    token = _login(client, "staff-pii@example.com", "pw123")
    r = client.get(f"/api/employees/{foreign.id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404


def test_export_csv_forbidden_for_employee_role(client, db_session, admin_token):
    org, target, staff, staff_emp = _setup(db_session)
    token = _login(client, "staff-pii@example.com", "pw123")
    r = client.post("/api/employees/export-csv", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    # Admin can still export
    r = client.post("/api/employees/export-csv", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


def test_history_export_forbidden_for_employee_role(client, db_session, admin_token):
    org, target, staff, staff_emp = _setup(db_session)
    token = _login(client, "staff-pii@example.com", "pw123")
    r = client.get(
        f"/api/employees/{target.id}/history/export",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
    r = client.get(
        f"/api/employees/{target.id}/history/export",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200


def test_employee_controller_masks_and_scopes(client, db_session, admin_token):
    org, target, staff, staff_emp = _setup(db_session)
    token = _login(client, "staff-pii@example.com", "pw123")

    # Same org, unprivileged → masked
    r = client.get(
        f"/api/employee-controller/{target.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pan_number"] is None
    assert body["bank_account_number"] is None

    # Admin → unmasked
    r = client.get(
        f"/api/employee-controller/{target.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["pan_number"] == "ABCDE1234F"

    # Own record → unmasked
    r = client.get(
        f"/api/employee-controller/{staff_emp.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["pan_number"] == "STAFF9999S"

    # Cross-org → 404
    from models import Organization
    other_org = Organization(name="Other Ctrl Org", code="CTRLORG2", country="India")
    db_session.add(other_org)
    db_session.flush()
    foreign = _make_org_emp_user(
        db_session, other_org, "CTRL900", "foreign-ctrl@example.com",
        pan_number="FOREIGN99P",
    )
    r = client.get(
        f"/api/employee-controller/{foreign.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404
    # Also 404 for admin of another org? admin is superadmin-like here (role=admin,
    # org scoped) — admin of org1 must not see org2's employee either.
    r = client.get(
        f"/api/employee-controller/{foreign.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


def test_employee_controller_delete_requires_permission(client, db_session, admin_token):
    org, target, staff, staff_emp = _setup(db_session)
    token = _login(client, "staff-pii@example.com", "pw123")
    # Unprivileged staff cannot delete via controller
    r = client.delete(
        f"/api/employee-controller/{target.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
    # Record still exists
    db_session.expire_all()
    from models import Employee
    assert db_session.query(Employee).filter(Employee.id == target.id).first() is not None
