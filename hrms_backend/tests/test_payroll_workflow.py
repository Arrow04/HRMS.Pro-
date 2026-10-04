"""Workflow + payslip tests for payroll."""

from datetime import datetime

from models import Employee, Organization, Payroll
from services.payslip_service import get_payslip_data


def _make_org_and_emp(db_session, admin_org_id=None):
    if admin_org_id:
        org = db_session.query(Organization).filter(Organization.id == admin_org_id).first()
        if not org:
            org = Organization(name="WF Org", code="WFORG", country="India")
            db_session.add(org)
            db_session.flush()
    else:
        org = Organization(name="WF Org", code="WFORG", country="India")
        db_session.add(org)
        db_session.flush()
    emp = Employee(
        first_name="Wf", last_name="User", email="wf@example.com",
        employee_code="WF001", designation="Engineer",
        organization_id=org.id, base_salary=600000, status="active",
        join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return org, emp


def test_payroll_workflow_strict_transitions(client, db_session, admin_token):
    """bulk-status enforces draft -> pending_approval -> approved -> processed -> paid.

    Maker-checker: the user who submitted (advanced) to pending_approval
    CANNOT approve — a second user must.
    """
    from core.auth import get_password_hash
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _make_org_and_emp(db_session, admin.organization_id)
    checker = User(
        email="wf.checker@mc.example.com",
        password_hash=get_password_hash("check123"),
        full_name="WF Checker", role="finance",
        organization_id=org.id, is_active=True,
    )
    db_session.add(checker)
    db_session.flush()
    p = Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                gross_salary=50000, net_salary=40000, status="draft")
    db_session.add(p)
    db_session.flush()

    checker_token = client.post("/api/auth/login", json={
        "email": checker.email, "password": "check123",
    }).json().get("token", "")

    def action(ids, act, token=None):
        return client.post("/api/payroll/bulk-status",
                           json={"payrollIds": ids, "action": act},
                           headers={"Authorization": f"Bearer {token or admin_token}"}).json()

    # draft -> process is not allowed (must be approved first)
    r = action([p.id], "process")
    assert r.get("count", 0) == 0
    assert p.id in r.get("skipped", [])

    # draft -> advance -> pending_approval (admin becomes the maker)
    r = action([p.id], "advance")
    assert r.get("count", 0) == 1
    db_session.refresh(p)
    assert p.status == "pending_approval"
    assert p.submitted_by == admin.id

    # maker cannot approve their own submission
    r = action([p.id], "approve")
    assert r.get("count", 0) == 0
    assert p.id in r.get("makerCheckerBlocked", [])
    db_session.refresh(p)
    assert p.status == "pending_approval"

    # pending_approval -> approve (second user)
    r = action([p.id], "approve", token=checker_token)
    assert r.get("count", 0) == 1
    db_session.refresh(p)
    assert p.status == "approved"
    assert p.approved_by == checker.id

    # approved -> process
    r = action([p.id], "process")
    assert r.get("count", 0) == 1
    db_session.refresh(p)
    assert p.status == "processed"

    # processed -> mark_paid
    r = action([p.id], "mark_paid")
    assert r.get("count", 0) == 1
    db_session.refresh(p)
    assert p.status == "paid"

    # paid cannot advance further
    r = action([p.id], "advance")
    assert r.get("count", 0) == 0
    assert p.id in r.get("skipped", [])


def test_payslip_data_structure(client, db_session):
    """Payslip data includes payroll, employee and organization sections."""
    org, emp = _make_org_and_emp(db_session)
    p = Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                gross_salary=50000, total_earnings=50000, net_salary=40000,
                total_deductions=10000, basic_salary=30000, hra=12000,
                status="processed")
    db_session.add(p)
    db_session.flush()

    data = get_payslip_data(db_session, p.id)
    assert "payroll" in data
    assert "employee" in data
    assert "organization" in data
    assert data["organization"].get("country") == "India"
    assert data["payroll"]["net_salary"] == 40000
