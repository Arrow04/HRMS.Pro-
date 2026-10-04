"""Payroll period reset/void guards — immutability mandate.

Locked/processed/paid payroll must never be destroyed by period-level
`/reset` or `/void` (409), and only payroll-admin roles may call them (403).
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

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from core.auth import get_password_hash
from database import Base, engine as app_engine, get_db
from main import app
from models import Employee, Organization, Payroll, User

# Distinct periods per test so nothing collides with other suites.
_DRAFT_MONTH = 8    # only draft rows -> reset allowed
_LOCKED_MONTH = 7   # draft + locked -> reset blocked
_PAID_MONTH = 9     # paid row -> void blocked


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        org = s.query(Organization).filter(Organization.code == "RSTG").first()
        if org:
            s.query(Payroll).filter(Payroll.organization_id == org.id).delete(
                synchronize_session=False
            )
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        org = s.query(Organization).filter(Organization.code == "RSTG").first()
        if not org:
            org = Organization(name="Reset Guard Org", code="RSTG", status="active")
            s.add(org)
            s.flush()
        admin = s.query(User).filter(User.email == "rstg.admin@t.com").first()
        if not admin:
            admin = User(
                email="rstg.admin@t.com", full_name="RSTG Admin", role="admin",
                is_active=True, organization_id=org.id,
                password_hash=get_password_hash("Rstg123!"),
            )
            s.add(admin)
        employee_user = s.query(User).filter(User.email == "rstg.emp@t.com").first()
        if not employee_user:
            employee_user = User(
                email="rstg.emp@t.com", full_name="RSTG Employee", role="employee",
                is_active=True, organization_id=org.id,
                password_hash=get_password_hash("Rstg123!"),
            )
            s.add(employee_user)
        s.flush()
        emp = s.query(Employee).filter(Employee.employee_code == "RSTG-1").first()
        if not emp:
            emp = Employee(
                first_name="Rst", last_name="Guard", email="rstg.guard@t.com",
                employee_code="RSTG-1", organization_id=org.id,
                base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
            )
            s.add(emp)
            s.flush()

        # Clean slate for this module's periods (idempotent across reruns).
        s.query(Payroll).filter(
            Payroll.organization_id == org.id,
            Payroll.month.in_([_DRAFT_MONTH, _LOCKED_MONTH, _PAID_MONTH]),
        ).delete(synchronize_session=False)

        def _row(month, year, status, **kw):
            s.add(Payroll(
                employee_id=emp.id, organization_id=org.id,
                month=month, year=year, status=status,
                gross_salary=50000, basic_salary=30000,
                total_deductions=5000, net_salary=45000,
                paid_days=30, working_days=26, **kw,
            ))

        _row(_DRAFT_MONTH, 2026, "draft")
        _row(_LOCKED_MONTH, 2026, "draft")
        _row(_LOCKED_MONTH, 2026, "locked", locked_at=datetime(2026, 7, 31))
        _row(_PAID_MONTH, 2026, "paid", paid_at=datetime(2026, 9, 30))
        s.commit()
        yield {"org": org}
    finally:
        s.close()


@pytest.fixture(scope="module")
def client(env):
    Base.metadata.create_all(bind=app_engine)
    c = TestClient(app)

    def override():
        sess = sessionmaker(bind=app_engine)()
        try:
            yield sess
        finally:
            sess.close()

    app.dependency_overrides[get_db] = override
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "Rstg123!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _payrolls(month):
    s = sessionmaker(bind=app_engine)()
    try:
        org = s.query(Organization).filter(Organization.code == "RSTG").first()
        return s.query(Payroll).filter(
            Payroll.organization_id == org.id, Payroll.month == month
        ).all()
    finally:
        s.close()


class TestResetGuard:
    def test_admin_can_reset_unfinalized_period(self, client):
        h = _login(client, "rstg.admin@t.com")
        r = client.post("/api/payroll/reset", json={
            "month": _DRAFT_MONTH, "year": 2026, "reason": "mistaken run",
        }, headers=h)
        assert r.status_code == 200, r.text
        assert _payrolls(_DRAFT_MONTH) == []

    def test_reset_blocked_when_finalized_present(self, client):
        h = _login(client, "rstg.admin@t.com")
        before = len(_payrolls(_LOCKED_MONTH))
        r = client.post("/api/payroll/reset", json={
            "month": _LOCKED_MONTH, "year": 2026,
        }, headers=h)
        assert r.status_code == 409, r.text
        assert "immutable" in r.json()["detail"]
        # Nothing was deleted — not even the draft row.
        assert len(_payrolls(_LOCKED_MONTH)) == before

    def test_void_blocked_when_paid_present(self, client):
        h = _login(client, "rstg.admin@t.com")
        before = len(_payrolls(_PAID_MONTH))
        r = client.post("/api/payroll/void", json={
            "month": _PAID_MONTH, "year": 2026,
        }, headers=h)
        assert r.status_code == 409, r.text
        assert len(_payrolls(_PAID_MONTH)) == before

    def test_non_admin_role_forbidden(self, client):
        h = _login(client, "rstg.emp@t.com")
        r = client.post("/api/payroll/reset", json={
            "month": _LOCKED_MONTH, "year": 2026,
        }, headers=h)
        assert r.status_code == 403, r.text
