"""Company isolation spoof tests (strict mode).

Proves a company-restricted HR user cannot read another company's data via
query params, headers, or direct ids — and that admins remain unaffected.
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

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from database import Base, get_db, engine as app_engine
from main import app


@pytest.fixture(scope="module")
def seed():
    if app_engine.url.database != "hrms_test":
        pytest.skip("hrms_test database not configured")
    Base.metadata.create_all(bind=app_engine)
    Session = sessionmaker(bind=app_engine)
    db = Session()
    try:
        from core.auth import get_password_hash
        from models import User, Organization, Company, Employee

        org = db.query(Organization).filter(Organization.code == "SCTEST").first()
        if not org:
            org = Organization(name="Scope Test Org", code="SCTEST", status="active")
            db.add(org)
            db.commit()
            db.refresh(org)

        def company(name):
            c = db.query(Company).filter(Company.name == name, Company.organization_id == org.id).first()
            if not c:
                c = Company(name=name, organization_id=org.id, status="active")
                db.add(c)
                db.commit()
                db.refresh(c)
            return c

        co_a = company("ScopeCo A")
        co_b = company("ScopeCo B")

        def user(email, role):
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(email=email, full_name=email.split("@")[0], role=role,
                         organization_id=org.id, password_hash=get_password_hash("Test1234!"),
                         is_active=True)
                db.add(u)
                db.commit()
                db.refresh(u)
            return u

        admin = user("scope_admin@t.com", "admin")
        hr_a = user("scope_hr_a@t.com", "hr_manager")

        def emp(code, company, usr):
            e = db.query(Employee).filter(Employee.employee_code == code).first()
            if not e:
                e = Employee(employee_code=code, first_name=code, email=f"{code}@t.com",
                             organization_id=org.id, company_id=company.id, user_id=usr.id,
                             status="active")
                db.add(e)
                db.commit()
                db.refresh(e)
            else:
                e.company_id = company.id
                e.user_id = usr.id
                e.organization_id = org.id
                e.status = "active"
                db.commit()
            return e

        emp_a = emp("SCOPE-A1", co_a, hr_a)
        emp_b = emp("SCOPE-B1", co_b, admin)
        yield {"org": org, "co_a": co_a, "co_b": co_b, "admin": admin, "hr_a": hr_a,
               "emp_a": emp_a, "emp_b": emp_b}
    finally:
        db.close()


def _client():
    return TestClient(app)


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "Test1234!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json().get('token') or r.json().get('access_token')}"}


def test_login_shape(seed):
    client = _client()
    r = client.post("/api/auth/login", json={"email": "scope_hr_a@t.com", "password": "Test1234!"})
    assert r.status_code == 200, r.text
    assert "token" in r.json() or "access_token" in r.json()


def test_list_forced_to_own_company(seed):
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get("/api/employees", params={"limit": 100}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    rows = body.get("data", body if isinstance(body, list) else [])
    co_a = seed["co_a"].id
    assert len(rows) > 0
    for row in rows:
        cid = row.get("companyId", row.get("company_id"))
        assert cid in (co_a, None), f"leaked row from company {cid}"


def test_explicit_other_company_rejected(seed):
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get("/api/employees", params={"companyId": seed["co_b"].id}, headers=h)
    assert r.status_code == 403, r.text


def test_header_spoof_rejected(seed):
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    h["X-Company-Id"] = str(seed["co_b"].id)
    r = client.get("/api/employees", params={"limit": 5}, headers=h)
    assert r.status_code == 403, r.text


def test_detail_other_company_rejected(seed):
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get(f"/api/employees/{seed['emp_b'].id}", headers=h)
    assert r.status_code in (403, 404), r.text


def test_detail_own_company_allowed(seed):
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get(f"/api/employees/{seed['emp_a'].id}", headers=h)
    assert r.status_code == 200, r.text


def test_cross_company_colleague_hidden(seed):
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get("/api/employees", params={"limit": 100}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    rows = body.get("data", body if isinstance(body, list) else [])
    ids = {row.get("id") for row in rows}
    assert seed["emp_b"].id not in ids
    assert seed["emp_a"].id in ids


def test_admin_unaffected(seed):
    client = _client()
    h = _login(client, "scope_admin@t.com")
    r = client.get("/api/employees", params={"companyId": seed["co_b"].id, "limit": 100}, headers=h)
    assert r.status_code == 200, r.text
    rows = (r.json().get("data") or [])
    assert any((row.get("companyId", row.get("company_id")) == seed["co_b"].id) for row in rows)


def test_companies_list_scoped(seed):
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get("/api/companies", headers=h)
    assert r.status_code == 200, r.text
    rows = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    ids = {row.get("id") for row in rows}
    assert ids == {seed["co_a"].id}, ids


def _seed_holiday_announcement(seed):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    eng = create_engine(__import__("os").environ["DATABASE_URL"])
    S = sessionmaker(bind=eng)
    db = S()
    try:
        from models import Holiday, Notification
        from datetime import date
        org_id = seed["org"].id
        co_a, co_b = seed["co_a"].id, seed["co_b"].id
        if not db.query(Holiday).filter(Holiday.name == "Scope Global Day").first():
            db.add(Holiday(name="Scope Global Day", date=date(2026, 5, 1), organization_id=org_id,
                           company_id=None, year=2026))
        if not db.query(Holiday).filter(Holiday.name == "Scope A Day").first():
            db.add(Holiday(name="Scope A Day", date=date(2026, 5, 2), organization_id=org_id,
                           company_id=co_a, year=2026))
        if not db.query(Holiday).filter(Holiday.name == "Scope B Day").first():
            db.add(Holiday(name="Scope B Day", date=date(2026, 5, 3), organization_id=org_id,
                           company_id=co_b, year=2026))
        if not db.query(Notification).filter(Notification.title == "Scope Global Note").first():
            db.add(Notification(title="Scope Global Note", body="all", type="announcement",
                                user_id=seed["admin"].id, organization_id=org_id, company_id=None))
        if not db.query(Notification).filter(Notification.title == "Scope B Note").first():
            db.add(Notification(title="Scope B Note", body="b", type="announcement",
                                user_id=seed["admin"].id, organization_id=org_id, company_id=co_b))
        db.commit()
    finally:
        db.close()


def test_org_wide_holiday_hidden(seed):
    _seed_holiday_announcement(seed)
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get("/api/holidays", params={"year": 2026}, headers=h)
    assert r.status_code == 200, r.text
    names = {row.get("name") for row in (r.json() if isinstance(r.json(), list) else r.json().get("data", []))}
    assert "Scope A Day" in names
    assert "Scope B Day" not in names
    assert "Scope Global Day" not in names, names


def test_org_wide_announcement_hidden(seed):
    _seed_holiday_announcement(seed)
    client = _client()
    h = _login(client, "scope_hr_a@t.com")
    r = client.get("/api/announcements", headers=h)
    assert r.status_code == 200, r.text
    titles = {row.get("title") for row in (r.json() if isinstance(r.json(), list) else r.json().get("data", []))}
    assert "Scope B Note" not in titles
    assert "Scope Global Note" not in titles, titles
