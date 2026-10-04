"""Setup status regressions — per-module readiness, company-scoped."""

from datetime import datetime

from core.auth import get_password_hash
from models import Employee, Organization, User


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


class TestSetupStatus:
    def test_status_reports_all_modules(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = client.get("/api/setup/status",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        ids = [s["id"] for s in body["steps"]]
        assert ids == ["company", "attendance", "leave", "payroll", "expenses", "performance"]
        assert body["total"] == 6
        assert body["organization"]["id"] == org.id
        assert set(body["modules"].keys()) == {
            "company", "attendance", "leave", "payroll", "expenses", "performance"}

    def test_non_admin_forbidden(self, db_session, client):
        org = _admin_org(db_session)
        emp_user = User(
            email="setup.employee2@x.com",
            password_hash=get_password_hash("emp123"),
            full_name="Setup Emp", role="employee",
            organization_id=org.id, is_active=True,
        )
        db_session.add(emp_user)
        db_session.flush()
        login = client.post("/api/auth/login", json={
            "email": "setup.employee2@x.com", "password": "emp123"})
        token = login.json().get("token", "")
        resp = client.get("/api/setup/status",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_counts_reflect_real_data(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        db_session.add(Employee(
            first_name="Ready", last_name="User", email="ready.user2@setup.com",
            employee_code="SET002", organization_id=org.id,
            base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
        ))
        db_session.flush()
        resp = client.get("/api/setup/status",
                          headers={"Authorization": f"Bearer {admin_token}"})
        body = resp.json()
        assert body["counts"]["employees"] >= 1
