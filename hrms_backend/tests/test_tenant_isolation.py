"""Cross-organization (tenant) isolation tests.

Two tenants (Org A / Org B) plus a superadmin and a NULL-org user. Proves:
  * tenant admins cannot create/update/read another org's employees,
    users, or departments (payload org ids are ignored or rejected),
  * superadmin holiday creation requires an explicit valid org,
  * NULL-org accounts authenticate but are blocked by get_current_user,
  * impersonation codes are single-use and redeem into the right tenant,
  * passcodes are stored hashed and verify through /login-passkey,
  * /api/users never leaks the superadmin or passcode fields.
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
        from models import Company, Department, Employee, Holiday, Organization, User

        def org(code, name):
            o = db.query(Organization).filter(Organization.code == code).first()
            if not o:
                o = Organization(name=name, code=code, status="active")
                db.add(o)
                db.commit()
                db.refresh(o)
            return o

        org_a = org("ISOA", "Isolation Org A")
        org_b = org("ISOB", "Isolation Org B")

        def company(name, o):
            c = db.query(Company).filter(Company.name == name).first()
            if not c:
                c = Company(name=name, organization_id=o.id, status="active")
                db.add(c)
                db.commit()
                db.refresh(c)
            return c

        co_a = company("IsoCoA", org_a)
        co_b = company("IsoCoB", org_b)

        def user(email, role, o, password="IsoTest123!"):
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    email=email,
                    full_name=email.split("@")[0],
                    role=role,
                    organization_id=o.id if o else None,
                    password_hash=get_password_hash(password),
                    is_active=True,
                )
                db.add(u)
                db.commit()
                db.refresh(u)
            return u

        admin_a = user("iso_admin_a@t.com", "admin", org_a)
        admin_b = user("iso_admin_b@t.com", "admin", org_b)
        superadmin = user("iso_super@t.com", "superadmin", org_a)
        null_org = user("iso_null@t.com", "employee", None)

        def emp(code, o, co, usr, email):
            e = db.query(Employee).filter(Employee.employee_code == code).first()
            if not e:
                e = Employee(
                    employee_code=code,
                    first_name=code,
                    email=email,
                    organization_id=o.id,
                    company_id=co.id,
                    user_id=usr.id,
                    status="active",
                )
                db.add(e)
                db.commit()
                db.refresh(e)
            return e

        emp_a = emp("ISO-EA", org_a, co_a, admin_a, "iso_emp_a@iso.test")
        emp_b = emp("ISO-EB", org_b, co_b, admin_b, "iso_emp_b@iso.test")

        dept_b = (
            db.query(Department)
            .filter(Department.name == "IsoDeptB", Department.organization_id == org_b.id)
            .first()
        )
        if not dept_b:
            dept_b = Department(
                name="IsoDeptB", organization_id=org_b.id, company_id=co_b.id
            )
            db.add(dept_b)
            db.commit()
            db.refresh(dept_b)

        if not db.query(Holiday).filter(Holiday.name == "Iso Holiday B").first():
            db.add(
                Holiday(
                    name="Iso Holiday B",
                    date="2026-12-27",
                    organization_id=org_b.id,
                    company_id=None,
                    type="public",
                )
            )
            db.commit()

        yield {
            "org_a": org_a,
            "org_b": org_b,
            "co_a": co_a,
            "co_b": co_b,
            "admin_a": admin_a,
            "admin_b": admin_b,
            "superadmin": superadmin,
            "null_org": null_org,
            "emp_a": emp_a,
            "emp_b": emp_b,
            "dept_b": dept_b,
        }
    finally:
        db.close()


def _client():
    return TestClient(app)


def _login(client, email, password="IsoTest123!"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _db():
    return sessionmaker(bind=app_engine)()


# ---------------------------------------------------------------- employees


def test_employee_create_ignores_payload_org_of_other_tenant(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    email = "iso_new_emp1@iso.test"
    r = client.post(
        "/api/employees",
        headers=h,
        json={
            "firstName": "Cross",
            "lastName": "Org",
            "email": email,
            "status": "active",
            "organizationId": seed["org_b"].id,
        },
    )
    assert r.status_code in (200, 201), r.text
    db = _db()
    try:
        from models import Employee, User

        emp = db.query(Employee).filter(Employee.email == email).first()
        usr = db.query(User).filter(User.email == email).first()
        assert emp is not None
        assert int(emp.organization_id) == int(seed["org_a"].id)
        assert usr is not None and int(usr.organization_id) == int(seed["org_a"].id)
    finally:
        db.close()


def test_employee_update_cannot_move_across_orgs(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.put(
        f"/api/employees/{seed['emp_b'].id}",
        headers=h,
        json={"organizationId": seed["org_a"].id},
    )
    assert r.status_code in (403, 404), r.text
    db = _db()
    try:
        from models import Employee

        emp = db.query(Employee).filter(Employee.id == seed["emp_b"].id).first()
        assert int(emp.organization_id) == int(seed["org_b"].id)
    finally:
        db.close()


def test_employee_list_scoped_to_own_org(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.get("/api/employees", params={"limit": 200}, headers=h)
    assert r.status_code == 200, r.text
    assert "iso_emp_b@iso.test" not in r.text


def test_cross_org_manager_rejected(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.post(
        "/api/employees",
        headers=h,
        json={
            "firstName": "Mgr",
            "lastName": "Test",
            "email": "iso_new_emp2@iso.test",
            "status": "active",
            "reportingManagerId": seed["emp_b"].id,
        },
    )
    assert r.status_code == 400, r.text


def test_cross_org_department_rejected(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.post(
        "/api/employees",
        headers=h,
        json={
            "firstName": "Dept",
            "lastName": "Test",
            "email": "iso_new_emp3@iso.test",
            "status": "active",
            "departmentId": seed["dept_b"].id,
        },
    )
    assert r.status_code == 400, r.text


# ---------------------------------------------------------------- holidays


def test_holiday_superadmin_requires_explicit_org(seed):
    client = _client()
    h = _login(client, "iso_super@t.com")
    r = client.post(
        "/api/holidays",
        headers=h,
        json={"name": "No Org Holiday", "date": "2026-12-28"},
    )
    assert r.status_code == 400, r.text
    r = client.post(
        "/api/holidays",
        headers=h,
        json={
            "name": "Super Org B Holiday",
            "date": "2026-12-28",
            "organizationId": seed["org_b"].id,
        },
    )
    assert r.status_code == 200, r.text
    db = _db()
    try:
        from models import Holiday

        hol = db.query(Holiday).filter(Holiday.name == "Super Org B Holiday").first()
        assert hol is not None and int(hol.organization_id) == int(seed["org_b"].id)
    finally:
        db.close()


def test_holiday_forced_to_own_org_for_tenant_admin(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.post(
        "/api/holidays",
        headers=h,
        json={
            "name": "Tenant Forced Holiday",
            "date": "2026-12-29",
            "organizationId": seed["org_b"].id,
        },
    )
    assert r.status_code == 200, r.text
    db = _db()
    try:
        from models import Holiday

        hol = db.query(Holiday).filter(Holiday.name == "Tenant Forced Holiday").first()
        assert hol is not None and int(hol.organization_id) == int(seed["org_a"].id)
    finally:
        db.close()


def test_holiday_list_scoped_to_own_org(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.get("/api/holidays", headers=h)
    assert r.status_code == 200, r.text
    assert "Iso Holiday B" not in r.text


# ------------------------------------------------------------------- users


def test_users_list_hides_superadmin_other_org_and_passcode(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.get("/api/users", headers=h)
    assert r.status_code == 200, r.text
    assert "iso_super@t.com" not in r.text
    assert "iso_admin_b@t.com" not in r.text
    rows = r.json()
    assert isinstance(rows, list) and rows
    for row in rows:
        assert "passcode" not in row
        assert "password_hash" not in row
        assert row.get("organizationId") in (None, seed["org_a"].id)


def test_user_create_ignores_payload_org_of_other_tenant(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    r = client.post(
        "/api/users",
        headers=h,
        json={
            "email": "iso_created_user@iso.test",
            "password": "Created123!",
            "role": "employee",
            "organizationId": seed["org_b"].id,
        },
    )
    assert r.status_code in (200, 201), r.text
    db = _db()
    try:
        from models import User

        usr = db.query(User).filter(User.email == "iso_created_user@iso.test").first()
        assert usr is not None and int(usr.organization_id) == int(seed["org_a"].id)
    finally:
        db.close()


# --------------------------------------------------------------- auth gates


def test_null_org_user_blocked_from_api(seed):
    client = _client()
    r = client.post(
        "/api/auth/login",
        json={"email": "iso_null@t.com", "password": "IsoTest123!"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 403, me.text


def test_impersonation_code_single_use_and_tenant_scoped(seed):
    client = _client()
    sh = _login(client, "iso_super@t.com")
    r = client.post(
        f"/api/superadmin/tenants/{seed['org_b'].id}/impersonate", headers=sh
    )
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    assert code

    x = client.post("/api/auth/impersonate-exchange", json={"code": code})
    assert x.status_code == 200, x.text
    token = x.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body.get("role") == "admin"
    assert int(body.get("organizationId")) == int(seed["org_b"].id)

    again = client.post("/api/auth/impersonate-exchange", json={"code": code})
    assert again.status_code == 401, again.text


def test_impersonation_rejects_unknown_code(seed):
    client = _client()
    r = client.post(
        "/api/auth/impersonate-exchange", json={"code": "not-a-real-code"}
    )
    assert r.status_code == 401, r.text


# ----------------------------------------------------------------- passkey


def test_passkey_stored_hashed_and_verifies(seed):
    client = _client()
    h = _login(client, "iso_admin_a@t.com")
    email = "iso_passkey@iso.test"
    r = client.post(
        "/api/users",
        headers=h,
        json={
            "email": email,
            "password": "PassTest123!",
            "role": "employee",
            "passcode": "Ab12345",
        },
    )
    assert r.status_code in (200, 201), r.text
    assert "passcode" not in r.json()

    db = _db()
    try:
        from models import User

        usr = db.query(User).filter(User.email == email).first()
        assert usr is not None and usr.passcode and usr.passcode.startswith("$")
    finally:
        db.close()

    ok = client.post(
        "/api/auth/login-passkey",
        json={"identifier": email, "passcode": "Ab12345"},
    )
    assert ok.status_code == 200, ok.text
    assert "token" in ok.json()

    bad = client.post(
        "/api/auth/login-passkey",
        json={"identifier": email, "passcode": "wrong!!"},
    )
    assert bad.status_code == 401, bad.text
