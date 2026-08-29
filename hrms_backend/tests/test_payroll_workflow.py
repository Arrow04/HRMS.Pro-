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
    """bulk-status enforces draft -> pending_approval -> approved -> processed -> paid."""
    from models import User
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    org, emp = _make_org_and_emp(db_session, admin.organization_id)
    p = Payroll(employee_id=emp.id, organization_id=org.id, month=6, year=2026,
                gross_salary=50000, net_salary=40000, status="draft")
    db_session.add(p)
    db_session.flush()

    def action(ids, act):
        return client.post("/api/payroll/bulk-status",
                           json={"payrollIds": ids, "action": act},
                           headers={"Authorization": f"Bearer {admin_token}"}).json()

    # draft -> process is not allowed (must be approved first)
    r = action([p.id], "process")
    assert r.get("count", 0) == 0
    assert p.id in r.get("skipped", [])

    # draft -> advance -> pending_approval
    r = action([p.id], "advance")
    assert r.get("count", 0) == 1
    db_session.refresh(p)
    assert p.status == "pending_approval"

    # pending_approval -> approve
    r = action([p.id], "approve")
    assert r.get("count", 0) == 1
    db_session.refresh(p)
    assert p.status == "approved"

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
