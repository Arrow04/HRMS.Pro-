"""End-to-end feature checks: payroll templates (with the full field set),
holidays, attendance and leaves - the flows HR uses daily.

Everything here goes through the HTTP API exactly like the UI does.
"""
import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_test",
)
os.environ["ALLOW_SQLITE_FALLBACK"] = "false"
os.environ["RUN_SCHEMA_SYNC"] = "false"
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine, get_db
from main import app


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from sqlalchemy import text
        from models import (Attendance, AttendanceAuditLog, Employee, Holiday, LeaveBalance, LeaveType,
                            Organization, PayrollTemplate, User)
        # Side-effect rows (audit logs, balances, assets) reference our fixtures;
        # disable FK checks for this cleanup only.
        s.execute(text('SET session_replication_role = replica'))
        org_ids = [r[0] for r in s.query(Organization.id).filter(
            Organization.code.in_(["E2E"])).all()]
        if org_ids:
            emp_ids = [r[0] for r in s.query(Employee.id).filter(Employee.organization_id.in_(org_ids)).all()]
            if emp_ids:
                s.query(LeaveBalance).filter(LeaveBalance.employee_id.in_(emp_ids)).delete(synchronize_session=False)
            if emp_ids:
                s.query(AttendanceAuditLog).filter(AttendanceAuditLog.employee_id.in_(emp_ids)).delete(synchronize_session=False)
            for t in (Attendance, LeaveType, Holiday, PayrollTemplate, Employee):
                s.query(t).filter(t.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(User).filter(User.email == "e2e.admin@t.com").delete(synchronize_session=False)
        s.execute(text("SET session_replication_role = DEFAULT"))
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def api():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        from core.auth import get_password_hash
        from models import Organization, User
        org = s.query(Organization).filter(Organization.code == "E2E").first()
        if not org:
            org = Organization(name="E2E Org", code="E2E", status="active",
                               registered_state="Karnataka")
            s.add(org)
            s.commit()
            s.refresh(org)
        user = s.query(User).filter(User.email == "e2e.admin@t.com").first()
        if not user:
            user = User(email="e2e.admin@t.com", full_name="E2E Admin", role="admin",
                        is_active=True, organization_id=org.id,
                        password_hash=get_password_hash("E2e123!"))
            s.add(user)
            s.commit()
            s.refresh(user)
    finally:
        s.close()

    client = TestClient(app)

    def override():
        sess = sessionmaker(bind=app_engine)()
        try:
            yield sess
        finally:
            sess.close()

    app.dependency_overrides[get_db] = override
    r = client.post("/api/auth/login", json={"email": "e2e.admin@t.com", "password": "E2e123!"})
    assert r.status_code == 200, r.text
    yield client, {"Authorization": f"Bearer {r.json()['token']}"}
    app.dependency_overrides.clear()


class TestPayrollTemplateRoundTrip:
    def test_full_field_set_persists(self, api):
        """Every wizard field - policy divisors, tax caps, HRA rules,
        attendance conversions - must survive create + read."""
        client, h = api
        payload = {
            "name": "E2E Full Template",
            "companyId": None,
            "country": "India",
            "registeredState": "Karnataka",
            "payrollPolicy": {
                "name": "E2E Policy", "pro_ration_method": "paid_days",
                "rounding_method": "nearest", "decimal_places": 2,
                "round_net_salary": True, "include_gratuity": True,
                "gratuity_rate": 4.81, "allow_negative_net": False,
                "daily_rate_divisor": 26, "monthly_divisor_for_weekly": 4.33,
            },
            "attendancePolicy": {
                "name": "E2E Attendance", "working_days_per_week": 6,
                "working_days": "1,2,3,4,5,6", "half_day_as_full_paid": False,
                "paid_leave_as_present": True, "holiday_as_present": True,
                "overtime_threshold_hours": 8, "overtime_rate": 2.0,
                "late_mark_threshold_minutes": 20, "half_day_threshold_hours": 4,
                "late_to_absent_count": 3, "early_to_absent_count": 3,
                "missing_checkout_rule": "half_day",
            },
            "taxRegime": {
                "name": "E2E Old Regime", "regime_type": "old", "financial_year": "2026-27",
                "standard_deduction": 50000, "rebate_threshold": 500000,
                "rebate_amount": 12500, "cess_rate": 4.0,
                "section_80c_cap": 150000, "section_80d_cap": 50000,
                "section_80d_senior_cap": 100000, "section_80ccd_1b_cap": 50000,
                "section_24_home_loan_cap": 200000, "section_80c_old_cap": 150000,
                "hra_metro_pct": 50, "hra_non_metro_pct": 40,
                "hra_rent_threshold_pct": 10, "basic_pct_of_gross": 50,
                "slabs": [{"from_amount": 0, "to_amount": 400000, "rate": 0},
                          {"from_amount": 400000, "to_amount": None, "rate": 20}],
            },
            "statutory": {
                "pf_applicable": True, "pf_employee_rate": 12.0, "pf_employer_rate": 12.0,
                "pf_wage_ceiling": 15000, "pf_max_monthly": 1800,
                "esi_applicable": True, "esi_employee_rate": 0.75, "esi_employer_rate": 3.25,
                "esi_gross_ceiling": 21000,
                "pt_applicable": True, "pt_monthly_amount": 200,
                "gratuity_applicable": True, "gratuity_days_per_year": 15,
            },
            "components": [
                {"name": "Basic", "display_name": "Basic Salary", "component_type": "earning",
                 "calculation_type": "percentage", "calculation_base": "gross",
                 "calculation_value": 50, "priority": 1, "is_taxable": True,
                 "apply_pro_ration": True, "tax_category": "salary_17_1"},
            ],
            "payCycle": "monthly",
            "payDay": 1,
            "autoPayslip": True,
            "emailPayslip": False,
            "status": "active",
        }
        created = client.post("/api/payroll-templates", json=payload, headers=h)
        assert created.status_code in (200, 201), created.text
        body = created.json()
        tid = (body.get("template") or body).get("id")
        assert tid

        fetched = client.get(f"/api/payroll-templates/{tid}", headers=h)
        assert fetched.status_code == 200, fetched.text
        t = fetched.json()

        # policy divisors
        assert float(t["payroll_policy"]["daily_rate_divisor"]) == 26
        assert float(t["payroll_policy"]["monthly_divisor_for_weekly"]) == 4.33
        # tax caps + HRA rules
        tax = t["tax_regime"]
        assert float(tax["section_80c_cap"]) == 150000
        assert float(tax["section_80ccd_1b_cap"]) == 50000
        assert float(tax["hra_metro_pct"]) == 50
        assert float(tax["hra_rent_threshold_pct"]) == 10
        # attendance conversions
        att = t["attendance_policy"]
        assert att["missing_checkout_rule"] == "half_day"
        assert int(att["late_to_absent_count"]) == 3
        assert int(att["early_to_absent_count"]) == 3
        # statutory + pay run
        assert float(t["statutory"]["pf_employee_rate"]) == 12.0
        assert t["pay_cycle"] == "monthly"
        assert int(t["pay_day"]) == 1
        assert t["auto_payslip"] is True
        assert len(t["components"]) >= 1

    def test_create_company_scope(self, api):
        """Template lists are org-scoped."""
        client, h = api
        rows = client.get("/api/payroll-templates", headers=h)
        assert rows.status_code == 200
        names = [r.get("name") for r in rows.json()]
        assert "E2E Full Template" in names


class TestHolidays:
    def test_create_and_list(self, api):
        client, h = api
        r = client.post("/api/holidays", json={
            "name": "E2E Test Holiday", "date": "2026-11-14", "type": "public",
        }, headers=h)
        assert r.status_code == 200, r.text
        assert r.json().get("organizationId") or r.json().get("organization_id")

        lst = client.get("/api/holidays", headers=h)
        assert lst.status_code == 200
        assert "E2E Test Holiday" in lst.text

    def test_update_and_delete(self, api):
        client, h = api
        lst = client.get("/api/holidays", headers=h).json()
        rows = lst if isinstance(lst, list) else lst.get("data", [])
        target = next((x for x in rows if x.get("name") == "E2E Test Holiday"), None)
        assert target
        upd = client.put(f"/api/holidays/{target['id']}", json={
            "name": "E2E Holiday Renamed", "date": "2026-11-14",
        }, headers=h)
        assert upd.status_code == 200, upd.text
        d = client.delete(f"/api/holidays/{target['id']}", headers=h)
        assert d.status_code == 200


class TestAttendanceAndLeaves:
    def test_leave_type_create_is_org_scoped(self, api):
        client, h = api
        r = client.post("/api/leave-types", json={
            "name": "E2E Casual Leave", "code": f"e2e_cl_{int(datetime.utcnow().timestamp())}",
            "daysAllowed": 12,
        }, headers=h)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("organizationId") or body.get("organization_id")

        lst = client.get("/api/leave-types", headers=h)
        assert lst.status_code == 200
        assert "E2E Casual Leave" in lst.text

    def test_attendance_manual_entry(self, api):
        client, h = api
        # need an employee to punch
        emp = client.post("/api/employees", json={
            "firstName": "E2E", "lastName": "Worker",
            "email": f"e2e.worker.{int(datetime.utcnow().timestamp())}@t.com",
            "status": "active",
        }, headers=h)
        assert emp.status_code in (200, 201), emp.text
        emp_id = emp.json().get("id") or emp.json().get("employeeId")

        mark = client.post("/api/attendance/manual", json={
            "employeeId": emp_id,
            "date": "2026-10-01",
            "status": "present",
            "checkIn": "09:00",
            "checkOut": "18:00",
        }, headers=h)
        assert mark.status_code in (200, 201), mark.text

        lst = client.get("/api/attendance", params={
            "startDate": "2026-10-01", "endDate": "2026-10-01",
        }, headers=h)
        assert lst.status_code == 200
        assert str(emp_id) in lst.text
