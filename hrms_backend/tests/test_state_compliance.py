"""Tests for state compliance — PT, LWF, and state key resolution."""

import uuid
from datetime import date, timedelta

import pytest
from data.state_compliance import (
    calculate_lwf,
    calculate_pt,
    get_all_state_codes,
    get_lwf_for_state,
    get_lwf_state_codes,
    get_pt_for_state,
    resolve_state_key,
)
from models import Company, Organization, StateLWFConfig, StatePTSlab
from services.compliance_engine import (
    _active_rows_for_scope,
    calculate_lwf as engine_lwf,
    calculate_professional_tax as engine_pt,
)

TODAY = date.today()
FUTURE = TODAY + timedelta(days=30)


class TestResolveStateKey:
    def test_two_letter_code(self):
        assert resolve_state_key("KA") == "karnataka"
        assert resolve_state_key("TN") == "tamil_nadu"
        assert resolve_state_key("MH") == "maharashtra"

    def test_full_name(self):
        assert resolve_state_key("Karnataka") == "karnataka"
        assert resolve_state_key("Tamil Nadu") == "tamil_nadu"
        assert resolve_state_key("Madhya Pradesh") == "madhya_pradesh"

    def test_lowercase_snake(self):
        assert resolve_state_key("karnataka") == "karnataka"
        assert resolve_state_key("tamil_nadu") == "tamil_nadu"

    def test_lowercase_case_insensitive(self):
        assert resolve_state_key("kerala") == "kerala"
        assert resolve_state_key("KERALA") == "kerala"

    def test_invalid_state(self):
        assert resolve_state_key("xyz") is None
        assert resolve_state_key("") is None

    def test_empty_or_none(self):
        assert resolve_state_key("") is None


class TestCalculatePT:
    def test_karnataka_below_threshold(self):
        assert calculate_pt(10000, "KA") == 0.0

    def test_karnataka_first_slab(self):
        assert calculate_pt(16000, "KA") == 150.0

    def test_karnataka_top_slab(self):
        assert calculate_pt(25000, "KA") == 200.0

    def test_maharashtra_below_threshold(self):
        assert calculate_pt(5000, "MH") == 0.0

    def test_maharashtra_mid_slab(self):
        assert calculate_pt(8000, "MH") == 175.0

    def test_maharashtra_top_slab(self):
        assert calculate_pt(15000, "MH") == 300.0

    def test_kerala_very_low(self):
        assert calculate_pt(1000, "KL") == 0.0

    def test_kerala_high(self):
        assert calculate_pt(30000, "KL") == 200.0

    def test_tamil_nadu_top_slab(self):
        assert calculate_pt(100000, "TN") == 315.0

    def test_tamil_nadu_mid_slab(self):
        assert calculate_pt(35000, "TN") == 160.0

    def test_telangana_flat_rate(self):
        assert calculate_pt(50000, "TS") == 200.0

    def test_default_for_unlisted_state(self):
        assert calculate_pt(10000, "OTHER") == 0.0
        assert calculate_pt(25000, "OTHER") == 200.0

    def test_exact_boundary(self):
        assert calculate_pt(14999.99, "KA") == 0.0
        assert calculate_pt(15000, "KA") == 150.0

    def test_zero_salary(self):
        assert calculate_pt(0, "KA") == 0.0

    def test_full_name_as_state_code(self):
        assert calculate_pt(25000, "Karnataka") == 200.0
        assert calculate_pt(25000, "Tamil Nadu") == 110.0


class TestCalculateLWF:
    def test_karnataka_below_threshold(self):
        result = calculate_lwf(10000, "KA")
        assert result["applicable"] is True
        assert result["employee"] == 20.0
        assert result["employer"] == 40.0

    def test_karnataka_above_threshold(self):
        result = calculate_lwf(20000, "KA")
        assert result["applicable"] is False
        assert result["employee"] == 0.0

    def test_tamil_nadu_half_yearly(self):
        result = calculate_lwf(10000, "TN")
        assert result["applicable"] is True
        assert result["employee"] == 20.0
        assert result["frequency"] == "half_yearly"

    def test_maharashtra_higher_ceiling(self):
        result = calculate_lwf(25000, "MH")
        assert result["applicable"] is True
        assert result["employee"] == 12.0

    def test_maharashtra_above_ceiling(self):
        result = calculate_lwf(35000, "MH")
        assert result["applicable"] is False

    def test_state_without_lwf(self):
        result = calculate_lwf(10000, "BI")
        assert result["applicable"] is False
        assert result["employee"] == 0.0

    def test_full_name_lwf(self):
        result = calculate_lwf(10000, "Karnataka")
        assert result["applicable"] is True

    def test_zero_salary_lwf(self):
        result = calculate_lwf(0, "KA")
        assert result["applicable"] is True

    def test_multiple_states_have_lwf(self):
        states_with_lwf = get_lwf_state_codes()
        assert "karnataka" in states_with_lwf
        assert "maharashtra" in states_with_lwf
        assert "tamil_nadu" in states_with_lwf
        assert len(states_with_lwf) >= 15


class TestGetFunctions:
    def test_get_pt_for_state(self):
        config = get_pt_for_state("KA")
        assert config is not None
        assert config["code"] == "KA"
        assert len(config["slabs"]) >= 2

    def test_get_pt_for_state_invalid(self):
        assert get_pt_for_state("ZZ") is None

    def test_get_lwf_for_state(self):
        config = get_lwf_for_state("KA")
        assert config is not None
        assert config["applicable"] is True

    def test_get_lwf_for_state_invalid(self):
        assert get_lwf_for_state("ZZ") is None

    def test_get_all_state_codes(self):
        codes = get_all_state_codes()
        assert "karnataka" in codes
        assert "maharashtra" in codes
        assert "tamil_nadu" in codes
        assert len(codes) >= 20


# ── Scope precedence + versioned CRUD (DB-backed) ─────────────────────────

def _test_org(db) -> Organization:
    return db.query(Organization).filter(Organization.code == "TEST").first()


def _mk_pt(db, amount, eff_from, org_id=None, company_id=None, state="karnataka",
           frm=0.0, to=None, eff_to=None):
    row = StatePTSlab(
        state_code=state, state_name="Karnataka",
        organization_id=org_id, company_id=company_id,
        from_gross=frm, to_gross=to, amount=amount, description="",
        effective_from=eff_from, effective_to=eff_to, source="custom",
    )
    db.add(row)
    db.commit()
    return row


def _mk_company(db, org_id) -> Company:
    c = Company(
        name="Acme India Pvt Ltd",
        code=f"T{uuid.uuid4().hex[:8]}",
        organization_id=org_id,
        status="active",
    )
    db.add(c)
    db.commit()
    return c


def _h(token) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestScopePrecedence:
    """Company > org > platform > static, tiers all-or-nothing."""

    def test_platform_default_when_no_org_or_company_rows(self, db_session):
        _mk_pt(db_session, 50, TODAY, org_id=None, company_id=None)
        org = _test_org(db_session)
        rows, scope = _active_rows_for_scope(
            db_session, StatePTSlab, "karnataka", TODAY, org.id, None
        )
        assert scope == "platform"
        amounts = [r.amount for r in rows]
        assert 50 in amounts, "explicit platform row served when no org rows"

    def test_org_overrides_platform(self, db_session):
        org = _test_org(db_session)
        _mk_pt(db_session, 10, TODAY, org_id=None, company_id=None)
        _mk_pt(db_session, 20, TODAY, org_id=org.id, company_id=None)
        rows, scope = _active_rows_for_scope(
            db_session, StatePTSlab, "karnataka", TODAY, org.id, None
        )
        assert scope == "organization"
        assert [r.amount for r in rows] == [20]

    def test_company_overrides_org(self, db_session):
        org = _test_org(db_session)
        comp = _mk_company(db_session, org.id)
        _mk_pt(db_session, 20, TODAY, org_id=org.id, company_id=None)
        _mk_pt(db_session, 30, TODAY, org_id=org.id, company_id=comp.id)
        rows, scope = _active_rows_for_scope(
            db_session, StatePTSlab, "karnataka", TODAY, org.id, comp.id
        )
        assert scope == "company"
        assert [r.amount for r in rows] == [30]

    def test_missing_company_tier_falls_back_to_org(self, db_session):
        org = _test_org(db_session)
        comp = _mk_company(db_session, org.id)
        _mk_pt(db_session, 20, TODAY, org_id=org.id, company_id=None)
        rows, scope = _active_rows_for_scope(
            db_session, StatePTSlab, "karnataka", TODAY, org.id, comp.id
        )
        assert scope == "organization"
        assert [r.amount for r in rows] == [20]

    def test_company_rows_for_other_company_not_used(self, db_session):
        org = _test_org(db_session)
        comp_a = _mk_company(db_session, org.id)
        comp_b = _mk_company(db_session, org.id)
        _mk_pt(db_session, 30, TODAY, org_id=org.id, company_id=comp_a.id)
        rows, scope = _active_rows_for_scope(
            db_session, StatePTSlab, "karnataka", TODAY, org.id, comp_b.id
        )
        assert scope != "company"
        assert 30 not in [r.amount for r in (rows or [])]

    def test_engine_uses_org_scope_end_to_end(self, db_session):
        org = _test_org(db_session)
        _mk_pt(db_session, 999, TODAY, org_id=org.id, company_id=None)
        result = engine_pt(
            50000, "karnataka", db=db_session, as_of=TODAY, organization_id=org.id
        )
        assert result["amount"] == 999
        assert result["source"] == "db"

    def test_engine_static_fallback_without_scope(self, db_session):
        result = engine_pt(25000, "karnataka", db=db_session, as_of=TODAY)
        assert result["source"] in ("static", "db")
        assert result["amount"] == 200.0, "matches static WA top slab either way"


class TestComplianceAPI:
    """Versioned PUT/GET/DELETE for org+company scoped PT & LWF."""

    def test_get_pt_requires_auth(self, client):
        resp = client.get("/api/payroll-config/compliance/karnataka/pt")
        assert resp.status_code == 401

    def test_get_pt_static_fallback(self, client, admin_token):
        resp = client.get(
            "/api/payroll-config/compliance/karnataka/pt", headers=_h(admin_token)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] in ("static", "db")
        assert body["scope"] in ("static", "platform")
        assert body["slabs"]
        assert body["history"] == []

    def test_put_org_slabs_then_get(self, client, admin_token):
        put = client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "slabs": [
                    {"from_gross": 0, "to_gross": 20000, "amount": 110},
                    {"from_gross": 20000, "to_gross": None, "amount": 200},
                ],
            },
        )
        assert put.status_code == 200, put.text
        assert put.json()["scope"] == "organization"

        body = client.get(
            "/api/payroll-config/compliance/karnataka/pt", headers=_h(admin_token)
        ).json()
        assert body["source"] == "db"
        assert body["scope"] == "organization"
        assert [s["amount"] for s in body["slabs"]] == [110, 200]
        assert body["history"] == []

    def test_version_on_change_keeps_history_and_retro(
        self, client, admin_token, db_session
    ):
        org = _test_org(db_session)
        client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "slabs": [{"from_gross": 0, "to_gross": None, "amount": 100}],
            },
        )
        client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": FUTURE.isoformat(),
                "slabs": [{"from_gross": 0, "to_gross": None, "amount": 250}],
            },
        )

        body = client.get(
            "/api/payroll-config/compliance/karnataka/pt", headers=_h(admin_token)
        ).json()
        assert [s["amount"] for s in body["slabs"]] == [100], "today still runs on v1"
        hist = body["history"]
        assert len(hist) == 1, "v2 preserved in history"
        assert hist[0]["amount"] == 250
        assert hist[0]["effective_from"] == FUTURE.isoformat()

        assert engine_pt(
            15000, "karnataka", db=db_session, as_of=TODAY, organization_id=org.id
        )["amount"] == 100
        assert engine_pt(
            15000, "karnataka", db=db_session, as_of=FUTURE, organization_id=org.id
        )["amount"] == 250

        v1 = (
            db_session.query(StatePTSlab)
            .filter(
                StatePTSlab.organization_id == org.id,
                StatePTSlab.effective_from == TODAY,
            )
            .one()
        )
        assert v1.effective_to == FUTURE - timedelta(days=1), "v1 closed day before v2"

    def test_company_put_does_not_affect_org_view(
        self, client, admin_token, db_session
    ):
        org = _test_org(db_session)
        comp = _mk_company(db_session, org.id)
        client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "slabs": [{"from_gross": 0, "to_gross": None, "amount": 100}],
            },
        )
        put = client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "companyId": comp.id,
                "slabs": [{"from_gross": 0, "to_gross": None, "amount": 300}],
            },
        )
        assert put.status_code == 200, put.text
        assert put.json()["scope"] == "company"

        base = client.get(
            "/api/payroll-config/compliance/karnataka/pt", headers=_h(admin_token)
        ).json()
        assert base["scope"] == "organization"
        assert [s["amount"] for s in base["slabs"]] == [100]

        scoped = client.get(
            f"/api/payroll-config/compliance/karnataka/pt?companyId={comp.id}",
            headers=_h(admin_token),
        ).json()
        assert scoped["scope"] == "company"
        assert [s["amount"] for s in scoped["slabs"]] == [300]

    def test_put_rejects_overlapping_slabs(self, client, admin_token):
        resp = client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "slabs": [
                    {"from_gross": 0, "to_gross": 10000, "amount": 100},
                    {"from_gross": 5000, "to_gross": 20000, "amount": 200},
                ],
            },
        )
        assert resp.status_code == 400
        assert "overlap" in resp.json()["detail"]

    def test_put_rejects_non_terminal_open_ended_slab(self, client, admin_token):
        resp = client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "slabs": [
                    {"from_gross": 0, "to_gross": None, "amount": 100},
                    {"from_gross": 10000, "to_gross": None, "amount": 200},
                ],
            },
        )
        assert resp.status_code == 400
        assert "open-ended" in resp.json()["detail"]

    def test_put_rejects_foreign_company(self, client, admin_token, db_session):
        other_org = Organization(
            name="Other Org", code=f"O{uuid.uuid4().hex[:6]}", status="active",
            default_currency="INR", timezone="Asia/Kolkata",
        )
        db_session.add(other_org)
        db_session.commit()
        foreign = _mk_company(db_session, other_org.id)
        resp = client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "companyId": foreign.id,
                "slabs": [{"from_gross": 0, "to_gross": None, "amount": 100}],
            },
        )
        assert resp.status_code == 404

    def test_delete_rejects_active_row_allows_closed(
        self, client, admin_token, db_session
    ):
        org = _test_org(db_session)
        client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "slabs": [{"from_gross": 0, "to_gross": None, "amount": 100}],
            },
        )
        active = (
            db_session.query(StatePTSlab)
            .filter(StatePTSlab.organization_id == org.id, StatePTSlab.effective_from == TODAY)
            .one()
        )
        resp = client.delete(
            f"/api/payroll-config/compliance/pt/{active.id}", headers=_h(admin_token)
        )
        assert resp.status_code == 400
        assert "in force" in resp.json()["detail"]

        closed = _mk_pt(
            db_session, 50, TODAY - timedelta(days=100),
            org_id=org.id, eff_to=TODAY - timedelta(days=1),
        )
        resp = client.delete(
            f"/api/payroll-config/compliance/pt/{closed.id}", headers=_h(admin_token)
        )
        assert resp.status_code == 200, resp.text
        assert (
            db_session.query(StatePTSlab).filter(StatePTSlab.id == closed.id).first()
            is None
        )

    def test_calculate_pt_uses_org_override(self, client, admin_token):
        client.put(
            "/api/payroll-config/compliance/karnataka/pt",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "slabs": [{"from_gross": 0, "to_gross": None, "amount": 999}],
            },
        )
        resp = client.post(
            "/api/payroll-config/compliance/calculate-pt",
            headers=_h(admin_token),
            json={"gross_salary": 50000, "state_code": "karnataka"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["monthly_pt"] == 999
        assert body["source"] == "db"
        assert body["slabs_applied"][0]["amount"] == 999

    def test_lwf_put_get_and_calculate(self, client, admin_token):
        put = client.put(
            "/api/payroll-config/compliance/karnataka/lwf",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "applicable": True,
                "employee_contribution": 25,
                "employer_contribution": 50,
                "frequency": "monthly",
            },
        )
        assert put.status_code == 200, put.text
        assert put.json()["scope"] == "organization"

        body = client.get(
            "/api/payroll-config/compliance/karnataka/lwf", headers=_h(admin_token)
        ).json()
        assert body["source"] == "db"
        assert body["scope"] == "organization"
        assert body["employee_contribution"] == 25
        assert body["history"] == []

        calc = client.post(
            "/api/payroll-config/compliance/calculate-lwf",
            headers=_h(admin_token),
            json={"gross_salary": 10000, "state_code": "karnataka"},
        ).json()
        assert calc["employee_contribution"] == 25
        assert calc["employer_contribution"] == 50
        assert calc["source"] == "db"

    def test_lwf_yearly_frequency_accepted_and_monthly_preview(
        self, client, admin_token, db_session
    ):
        org = _test_org(db_session)
        put = client.put(
            "/api/payroll-config/compliance/karnataka/lwf",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "applicable": True,
                "employee_contribution": 2400,
                "employer_contribution": 4800,
                "frequency": "yearly",
            },
        )
        assert put.status_code == 200, put.text

        calc = client.post(
            "/api/payroll-config/compliance/calculate-lwf",
            headers=_h(admin_token),
            json={"gross_salary": 10000, "state_code": "karnataka"},
        ).json()
        assert calc["frequency"] == "yearly"
        assert calc["employee_contribution"] == 200.0, "yearly ÷12 for monthly preview"
        assert calc["employer_contribution"] == 400.0

        direct = engine_lwf(
            10000, "karnataka", db=db_session, as_of=TODAY, organization_id=org.id
        )
        assert direct["employee"] == 200.0
        assert direct["employer"] == 400.0

    def test_lwf_rejects_unknown_frequency(self, client, admin_token):
        resp = client.put(
            "/api/payroll-config/compliance/karnataka/lwf",
            headers=_h(admin_token),
            json={
                "effective_from": TODAY.isoformat(),
                "applicable": True,
                "employee_contribution": 10,
                "employer_contribution": 20,
                "frequency": "weekly",
            },
        )
        assert resp.status_code == 400
        assert "frequency" in resp.json()["detail"]
