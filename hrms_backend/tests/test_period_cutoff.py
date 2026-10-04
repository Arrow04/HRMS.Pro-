"""Payroll period cutoff enforcement regressions.

A finalized PayrollPeriodLock is a HARD gate on payslip generation and
regeneration — the cutoff is money movement, not a warning banner.
"""

from datetime import datetime

from models import Employee, Organization, User


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _employee(db_session, org_id, code) -> Employee:
    emp = Employee(
        first_name="Cut", last_name="Off",
        email=f"{code.lower()}@cut.example.com", employee_code=code,
        designation="Engineer", organization_id=org_id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


class TestPeriodCutoff:
    def test_org_wide_finalize_blocks_generation(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "CUT001")
        r = client.post("/api/payroll/finalize-attendance",
                        json={"month": 6, "year": 2026},
                        headers=_headers(admin_token))
        assert r.status_code == 200, r.text

        r = client.post("/api/payroll/generate",
                        params={"employeeId": emp.id, "month": 6, "year": 2026},
                        headers=_headers(admin_token))
        assert r.status_code == 409, r.text
        assert "finalized" in r.json().get("detail", "").lower()

    def test_reopen_unblocks_generation(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "CUT002")
        assert client.post("/api/payroll/finalize-attendance",
                           json={"month": 6, "year": 2026},
                           headers=_headers(admin_token)).status_code == 200
        r = client.post("/api/payroll/reopen-attendance",
                        json={"month": 6, "year": 2026},
                        headers=_headers(admin_token))
        assert r.status_code == 200, r.text
        r = client.post("/api/payroll/generate",
                        params={"employeeId": emp.id, "month": 6, "year": 2026},
                        headers=_headers(admin_token))
        assert r.status_code == 200, r.text

    def test_employee_scope_finalize_blocks_that_employee(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp_a = _employee(db_session, org.id, "CUT003A")
        emp_b = _employee(db_session, org.id, "CUT003B")
        r = client.post("/api/payroll/finalize-attendance",
                        json={"month": 6, "year": 2026, "employeeId": emp_a.id},
                        headers=_headers(admin_token))
        assert r.status_code == 200, r.text

        r = client.post("/api/payroll/generate",
                        params={"employeeId": emp_a.id, "month": 6, "year": 2026},
                        headers=_headers(admin_token))
        assert r.status_code == 409, r.text

        # A different employee in the same org is unaffected
        r = client.post("/api/payroll/generate",
                        params={"employeeId": emp_b.id, "month": 6, "year": 2026},
                        headers=_headers(admin_token))
        assert r.status_code == 200, r.text

    def test_other_month_unaffected(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "CUT004")
        assert client.post("/api/payroll/finalize-attendance",
                           json={"month": 6, "year": 2026},
                           headers=_headers(admin_token)).status_code == 200
        r = client.post("/api/payroll/generate",
                        params={"employeeId": emp.id, "month": 5, "year": 2026},
                        headers=_headers(admin_token))
        assert r.status_code == 200, r.text
