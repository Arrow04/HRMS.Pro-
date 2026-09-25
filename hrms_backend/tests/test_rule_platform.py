"""Rule platform tests: DSL safety, versioned rules, publish workflow,
resolution traces, simulation, notifications, and the mandate's
future-proofing tests (law changes must never require engine code changes).
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

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from database import Base, get_db, engine as app_engine
from main import app
from services.rule_dsl import (
    MissingInputError,
    RuleExpressionError,
    evaluate_expression,
    validate_expression,
)
from services.rule_platform import (
    evaluate_definition,
    find_rule_conflicts,
    resolve_with_trace,
    validate_definition,
)


# ────────────────────────────────────────────────────────────────────────────
# DSL
# ────────────────────────────────────────────────────────────────────────────

class TestRuleDSL:
    def test_arithmetic_and_functions(self):
        ctx = {"PF_WAGES": 50000, "RATE": 12, "MAX_MONTHLY": 1800}
        assert evaluate_expression("MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)", ctx) == 1800
        assert evaluate_expression("MAX(PF_WAGES, 100)", ctx) == 50000
        assert evaluate_expression("ROUND(PF_WAGES / 30, 2)", ctx) == 1666.67
        assert evaluate_expression("ABS(0 - 5)", ctx) == 5

    def test_comparisons_conditionals(self):
        ctx = {"GROSS_WAGES": 17850, "CEILING": 21000, "STATE": "KA"}
        assert evaluate_expression("IF(GROSS_WAGES <= CEILING, 1, 0)", ctx) == 1
        assert evaluate_expression("1 if STATE = 'KA' else 2", ctx) == 1
        assert evaluate_expression("GROSS_WAGES > CEILING and STATE = 'KA'", ctx) is False
        assert evaluate_expression("not (GROSS_WAGES > CEILING)", ctx) is True

    def test_rejects_arbitrary_code(self):
        evil = [
            "__import__('os').system('echo pwned')",
            "(1).__class__",
            "open('x')",
            "lambda: 1",
            "[x for x in (1, 2)]",
            "exec('print(1)')",
            "PF_WAGES.__add__(1)",
        ]
        for expr in evil:
            with pytest.raises(RuleExpressionError):
                evaluate_expression(expr, {"PF_WAGES": 1})

    def test_missing_input_is_explicit(self):
        with pytest.raises(MissingInputError) as exc:
            evaluate_expression("PF_WAGES + DA", {"PF_WAGES": 1})
        assert exc.value.name == "DA"

    def test_validate_expression_catches_syntax(self):
        with pytest.raises(RuleExpressionError):
            validate_expression("MIN(1,")
        validate_expression("MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)")


# ────────────────────────────────────────────────────────────────────────────
# Definition kinds
# ────────────────────────────────────────────────────────────────────────────

class TestDefinitions:
    def test_param_and_formula(self):
        assert evaluate_definition({"kind": "param", "value": 12}) == 12
        val = evaluate_definition(
            {"kind": "formula", "expr": "MIN(W * R / 100, CAP)",
             "params": {"R": 12, "CAP": 1800}},
            {"W": 50000},
        )
        assert val == 1800

    def test_slab_modes(self):
        slab_fixed = {"kind": "slab", "basis": "GROSS", "mode": "fixed", "slabs": [
            {"from": 0, "to": 15000, "fixed": 0},
            {"from": 15000, "to": None, "fixed": 200},
        ]}
        assert evaluate_definition(slab_fixed, {"GROSS": 10000}) == 0
        assert evaluate_definition(slab_fixed, {"GROSS": 25000}) == 200

        slab_pct = {"kind": "slab", "basis": "GROSS", "mode": "percent_of_basis", "slabs": [
            {"from": 0, "to": 21000, "rate": 8.33},
            {"from": 21000, "to": None, "rate": 0},
        ]}
        assert abs(evaluate_definition(slab_pct, {"GROSS": 17850}) - 1486.9) < 0.02

        slab_marginal = {"kind": "slab", "basis": "GROSS", "mode": "marginal", "slabs": [
            {"from": 0, "to": 400000, "rate": 0},
            {"from": 400000, "to": 800000, "rate": 5},
        ]}
        # 600k: 200k falls in the 5% band
        assert abs(evaluate_definition(slab_marginal, {"GROSS": 600000}) - 10000) < 0.01

    def test_conditional_and_composite(self):
        d = {"kind": "conditional", "if": "STATE = 'KA'",
             "then": {"kind": "param", "value": 200},
             "else": {"kind": "param", "value": 0}}
        assert evaluate_definition(d, {"STATE": "KA"}) == 200
        assert evaluate_definition(d, {"STATE": "MH"}) == 0

        comp = {"kind": "composite", "outputs": {
            "employee": {"kind": "formula", "expr": "W * 0.12", "params": {}},
            "employer": {"kind": "formula", "expr": "W * 0.12", "params": {}},
        }}
        out = evaluate_definition(comp, {"W": 10000})
        assert out["employee"] == 1200 and out["employer"] == 1200

    def test_invalid_definitions_rejected(self):
        with pytest.raises(RuleExpressionError):
            validate_definition({"kind": "nonsense"})
        with pytest.raises(RuleExpressionError):
            validate_definition({"kind": "formula", "expr": "__import__('os')"})
        with pytest.raises(RuleExpressionError):
            validate_definition({"kind": "slab", "basis": "X", "slabs": []})


# ────────────────────────────────────────────────────────────────────────────
# API: versioning, publish, conflicts, trace, simulate, notifications
# ────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def api():
    Base.metadata.create_all(bind=app_engine)
    # Re-runnable: clear rule-platform rows created by previous runs of this file.
    _s = sessionmaker(bind=app_engine)()
    try:
        from models import GovernmentNotification, Organization, StatutoryRule, User
        from core.auth import get_password_hash
        if not _s.query(Organization).filter(Organization.code == "TEST").first():
            _s.add(Organization(name="Test Organization", code="TEST", status="active"))
            _s.commit()
        if not _s.query(User).filter(User.email == "admin@hrms.com").first():
            org = _s.query(Organization).filter(Organization.code == "TEST").first()
            _s.add(User(email="admin@hrms.com", full_name="Test Admin", role="admin",
                        is_active=True, organization_id=org.id,
                        password_hash=get_password_hash("admin123")))
            _s.commit()
        _s.query(StatutoryRule).filter(
            StatutoryRule.rule_type.in_([
                "pf_contribution", "esi_contribution", "professional_tax", "tax_slab",
                "wage_test_rule",
            ])
        ).delete(synchronize_session=False)
        _s.query(GovernmentNotification).filter(
            GovernmentNotification.notification_number == "G.S.R. 525(E)"
        ).delete(synchronize_session=False)
        _s.commit()
    finally:
        _s.close()
    client = TestClient(app)

    def override():
        s = sessionmaker(bind=app_engine)()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    r = client.post("/api/auth/login", json={"email": "admin@hrms.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    yield client, {"Authorization": f"Bearer {token}"}
    app.dependency_overrides.clear()
    # Self-cleaning: never leave rule rows behind for other test files.
    _s = sessionmaker(bind=app_engine)()
    try:
        from models import GovernmentNotification, StatutoryRule
        _s.query(StatutoryRule).filter(
            StatutoryRule.rule_type.in_([
                "pf_contribution", "esi_contribution", "professional_tax", "tax_slab",
            ])
        ).delete(synchronize_session=False)
        _s.query(GovernmentNotification).filter(
            GovernmentNotification.notification_number == "G.S.R. 525(E)"
        ).delete(synchronize_session=False)
        _s.commit()
    finally:
        _s.close()


def _mk_rule_payload(**over):
    p = {
        "rule_type": "pf_contribution",
        "country": "India",
        "effective_from": "2026-01-01",
        "definition": {"kind": "formula",
                       "expr": "MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)",
                       "params": {"RATE": 12.0, "MAX_MONTHLY": 1800.0}},
        "status": "active",
    }
    p.update(over)
    return p


class TestRuleWorkflow:
    def test_create_and_resolve_rule(self, api):
        client, h = api
        r = client.post("/api/payroll/rules", json=_mk_rule_payload(), headers=h)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["version"] == 1 and body["status"] == "active"

        t = client.get("/api/payroll/rules/trace", params={
            "ruleType": "pf_contribution", "asOf": "2026-03-01"}, headers=h)
        assert t.status_code == 200, t.text
        chosen = t.json()["chosen"]
        assert chosen is not None
        assert chosen["definition"]["params"]["RATE"] == 12.0

    def test_versioning_uses_historical_rules(self, api):
        """Mandate test 1/2: a rate change is a new rule version, no code change,
        and past periods keep resolving the old version."""
        client, h = api
        # v2 effective 2026-07-01 supersedes v1
        r = client.post("/api/payroll/rules", json=_mk_rule_payload(
            effective_from="2026-07-01",
            definition={"kind": "formula",
                        "expr": "MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)",
                        "params": {"RATE": 13.0, "MAX_MONTHLY": 1950.0}},
        ), headers=h)
        assert r.status_code == 201, r.text
        assert r.json()["version"] == 2

        past = client.get("/api/payroll/rules/trace", params={
            "ruleType": "pf_contribution", "asOf": "2026-03-01"}, headers=h).json()
        future = client.get("/api/payroll/rules/trace", params={
            "ruleType": "pf_contribution", "asOf": "2026-08-01"}, headers=h).json()
        assert past["chosen"]["definition"]["params"]["RATE"] == 12.0
        assert future["chosen"]["definition"]["params"]["RATE"] == 13.0

    def test_history_is_never_overwritten(self, api):
        client, h = api
        rows = client.get("/api/payroll/rules", params={"ruleType": "pf_contribution"}, headers=h).json()
        v1 = next(r for r in rows if r["version"] == 1)
        # v1 is preserved with its original definition; only end-dated
        assert v1["definition"]["params"]["RATE"] == 12.0
        assert v1["status"] == "superseded"
        assert v1["effectiveTo"] is not None

    def test_conflicting_overlap_rejected(self, api):
        client, h = api
        r = client.post("/api/payroll/rules", json=_mk_rule_payload(
            rule_type="esi_contribution",
            effective_from="2026-01-01",
            supersede_existing=False,
            definition={"kind": "param", "value": 0.75},
        ), headers=h)
        assert r.status_code == 201, r.text
        clash = client.post("/api/payroll/rules", json=_mk_rule_payload(
            rule_type="esi_contribution",
            effective_from="2026-03-01",
            supersede_existing=False,
            definition={"kind": "param", "value": 0.85},
        ), headers=h)
        assert clash.status_code == 409, clash.text

    def test_trace_explains_candidates(self, api):
        client, h = api
        t = client.get("/api/payroll/rules/trace", params={
            "ruleType": "pf_contribution", "asOf": "2026-08-01"}, headers=h).json()
        assert t["trace"], "trace must list considered candidates"
        assert any(x["reason"].startswith("chosen") for x in t["trace"])

    def test_simulate_reports_impact(self, api):
        client, h = api
        r = client.post("/api/payroll/rules/simulate", json={
            "rule_type": "pf_contribution",
            "proposed_definition": {"kind": "formula",
                                    "expr": "MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)",
                                    "params": {"RATE": 14.0, "MAX_MONTHLY": 2100.0}},
            "as_of": "2026-08-01",
            "context": {"PF_WAGES": 15000},
        }, headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["current"]["result"]["ok"] is True
        assert body["proposed"]["result"]["ok"] is True
        assert body["impact"]["delta"] == body["proposed"]["result"]["value"] - body["current"]["result"]["value"]

    def test_missing_capability_is_surfaced_not_silent(self, api):
        client, h = api
        r = client.post("/api/payroll/rules/simulate", json={
            "rule_type": "pf_contribution",
            "proposed_definition": {"kind": "formula", "expr": "MISSING_WAGE * 0.12"},
            "as_of": "2026-08-01",
            "context": {},
        }, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["proposed"]["result"]["ok"] is False
        assert "missing_input" in r.json()["proposed"]["result"]["error"]

    def test_state_rule_wins_over_central(self, api):
        """Mandate test 4: state rule change = new state-rule version only."""
        client, h = api
        r = client.post("/api/payroll/rules", json=_mk_rule_payload(
            rule_type="professional_tax", state_code="KA",
            effective_from="2026-01-01",
            definition={"kind": "slab", "basis": "GROSS", "mode": "fixed", "slabs": [
                {"from": 0, "to": 15000, "fixed": 0},
                {"from": 15000, "to": None, "fixed": 200}]},
        ), headers=h)
        assert r.status_code == 201, r.text
        t = client.get("/api/payroll/rules/trace", params={
            "ruleType": "professional_tax", "asOf": "2026-02-01", "stateCode": "KA"}, headers=h).json()
        assert t["chosen"]["stateCode"] == "KA"

    def test_new_regime_is_configuration_only(self, api):
        """Mandate test 6: a new tax regime is data, not engine code."""
        client, h = api
        regime = {"kind": "slab", "basis": "TAXABLE", "mode": "marginal", "slabs": [
            {"from": 0, "to": 400000, "rate": 0},
            {"from": 400000, "to": 800000, "rate": 5},
            {"from": 800000, "to": 1200000, "rate": 10},
        ]}
        r = client.post("/api/payroll/rules", json=_mk_rule_payload(
            rule_type="tax_slab", rule_subtype="new_regime_2026",
            effective_from="2026-04-01", definition=regime,
        ), headers=h)
        assert r.status_code == 201, r.text
        tax = evaluate_definition(regime, {"TAXABLE": 1000000})
        # 400k @0 + 400k @5% + 200k @10% = 40000
        assert abs(tax - 40000) < 0.01


class TestNotifications:
    def test_notification_workflow(self, api):
        client, h = api
        r = client.post("/api/payroll/notifications", json={
            "authority": "EPFO",
            "notification_number": "G.S.R. 525(E)",
            "title": "EPF contribution rate revision",
            "effective_date": "2026-07-01",
            "affected_rules": ["pf_contribution"],
        }, headers=h)
        assert r.status_code == 201, r.text
        nid = r.json()["id"]
        assert r.json()["status"] == "draft"

        for st in ("review", "approved", "published"):
            u = client.post(f"/api/payroll/notifications/{nid}/status",
                            json={"status": st}, headers=h)
            assert u.status_code == 200, u.text
            assert u.json()["status"] == st

        rows = client.get("/api/payroll/notifications", params={"status": "published"}, headers=h).json()
        assert any(n["id"] == nid for n in rows)


class TestFutureProofing:
    """Mandate section 60 — automated."""

    def test_new_threshold_is_a_parameter_only(self):
        d = {"kind": "formula", "expr": "IF(GROSS <= THRESHOLD, 0, FIXED)",
             "params": {"THRESHOLD": 15000, "FIXED": 200}}
        assert evaluate_definition(d, {"GROSS": 10000}) == 0
        # raising the threshold is pure data
        d["params"]["THRESHOLD"] = 18000
        assert evaluate_definition(d, {"GROSS": 17000}) == 0

    def test_zero_attendance_and_leap_dates_are_data_driven(self):
        d = {"kind": "formula", "expr": "ROUND(BASE / DIVISOR * PAID_DAYS, 2)",
             "params": {"DIVISOR": 30}}
        assert evaluate_definition(d, {"BASE": 30000, "PAID_DAYS": 0}) == 0
        assert evaluate_definition(d, {"BASE": 30000, "PAID_DAYS": 29}) == 29000
