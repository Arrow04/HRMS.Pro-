"""Statutory rules API — tenant isolation + published-rule immutability.

Mandates:
  * One org's rules must never be readable/writable by another org.
  * Published (active) rules are immutable in place — edits must be a new
    version + supersede, so history is never rewritten.
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

from core.auth import get_password_hash
from database import Base, engine as app_engine, get_db
from main import app
from models import Organization, StatutoryRule, User


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_subtype.in_(["iso_active", "iso_draft", "iso_b"])
        ).delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        def _org(code):
            org = s.query(Organization).filter(Organization.code == code).first()
            if not org:
                org = Organization(name=f"Iso Org {code}", code=code, status="active")
                s.add(org)
                s.flush()
            return org

        def _user(email, org, role):
            u = s.query(User).filter(User.email == email).first()
            if not u:
                u = User(email=email, full_name="Iso", role=role, is_active=True,
                         organization_id=org.id,
                         password_hash=get_password_hash("Iso123!"))
                s.add(u)
                s.flush()
            return u

        org_a = _org("ISOA")
        org_b = _org("ISOB")
        admin_a = _user("iso.a@t.com", org_a, "admin")
        admin_b = _user("iso.b@t.com", org_b, "admin")

        # Clean slate (idempotent reruns).
        s.query(StatutoryRule).filter(
            StatutoryRule.rule_subtype.in_(["iso_active", "iso_draft", "iso_b"])
        ).delete(synchronize_session=False)

        active_rule = StatutoryRule(
            rule_type="pf_contribution", rule_subtype="iso_active",
            country="India", organization_id=org_a.id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={"rate": 12.0},
        )
        draft_rule = StatutoryRule(
            rule_type="esi_contribution", rule_subtype="iso_draft",
            country="India", organization_id=org_a.id,
            effective_from=date(2026, 1, 1), status="draft", version=1,
            definition={"rate": 0.75},
        )
        rule_b = StatutoryRule(
            rule_type="pf_contribution", rule_subtype="iso_b",
            country="India", organization_id=org_b.id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={"rate": 12.0},
        )
        s.add_all([active_rule, draft_rule, rule_b])
        s.commit()
        s.refresh(active_rule)
        s.refresh(draft_rule)
        s.refresh(rule_b)
        yield {
            "org_a": org_a, "org_b": org_b,
            "admin_a": admin_a, "admin_b": admin_b,
            "active": active_rule, "draft": draft_rule, "rule_b": rule_b,
        }
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
    r = client.post("/api/auth/login", json={"email": email, "password": "Iso123!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestTenantIsolation:
    def test_list_never_leaks_other_org(self, client, env):
        h = _login(client, "iso.b@t.com")
        r = client.get("/api/statutory-rules/", params={"status": ""}, headers=h)
        assert r.status_code == 200, r.text
        ids = {row["id"] for row in r.json()}
        assert env["active"].id not in ids
        assert env["rule_b"].id in ids

    def test_explicit_other_org_id_forbidden(self, client, env):
        h = _login(client, "iso.b@t.com")
        r = client.get(
            "/api/statutory-rules/",
            params={"organization_id": env["org_a"].id, "status": ""},
            headers=h,
        )
        assert r.status_code == 403, r.text

    def test_update_other_org_rule_forbidden(self, client, env):
        h = _login(client, "iso.b@t.com")
        r = client.put(
            f"/api/statutory-rules/{env['active'].id}",
            json={"notes": "cross-tenant edit attempt"},
            headers=h,
        )
        assert r.status_code == 403, r.text

    def test_delete_other_org_rule_forbidden(self, client, env):
        h = _login(client, "iso.b@t.com")
        r = client.delete(f"/api/statutory-rules/{env['active'].id}", headers=h)
        assert r.status_code == 403, r.text

    def test_supersede_other_org_rule_forbidden(self, client, env):
        h = _login(client, "iso.b@t.com")
        r = client.post(
            f"/api/statutory-rules/supersede/{env['active'].id}",
            params={"new_effective_to": "2026-12-31"},
            headers=h,
        )
        assert r.status_code == 403, r.text

    def test_version_history_scoped(self, client, env):
        h = _login(client, "iso.b@t.com")
        r = client.get(
            "/api/statutory-rules/version-history/pf_contribution",
            params={"organization_id": env["org_a"].id},
            headers=h,
        )
        assert r.status_code == 403, r.text


class TestPublishedRuleImmutability:
    def test_active_rule_definition_immutable(self, client, env):
        h = _login(client, "iso.a@t.com")
        r = client.put(
            f"/api/statutory-rules/{env['active'].id}",
            json={"definition": {"rate": 13.0}},
            headers=h,
        )
        assert r.status_code == 409, r.text
        assert "immutable" in r.json()["detail"]
        # Row unchanged.
        s = sessionmaker(bind=app_engine)()
        try:
            row = s.query(StatutoryRule).filter(
                StatutoryRule.id == env["active"].id
            ).first()
            assert row.definition == {"rate": 12.0}
        finally:
            s.close()

    def test_active_rule_notes_edit_allowed(self, client, env):
        h = _login(client, "iso.a@t.com")
        r = client.put(
            f"/api/statutory-rules/{env['active'].id}",
            json={"notes": "clarification note"},
            headers=h,
        )
        assert r.status_code == 200, r.text

    def test_draft_rule_definition_editable(self, client, env):
        h = _login(client, "iso.a@t.com")
        r = client.put(
            f"/api/statutory-rules/{env['draft'].id}",
            json={"definition": {"rate": 1.0}},
            headers=h,
        )
        assert r.status_code == 200, r.text
        assert r.json()["definition"] == {"rate": 1.0}
