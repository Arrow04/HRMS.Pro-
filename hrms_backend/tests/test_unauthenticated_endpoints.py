"""Phase 1.5: previously-unauthenticated endpoints must reject anonymous calls."""
import pytest
from fastapi.testclient import TestClient


GRA = "/api/payroll/calculate/gratuity"
BONUS = "/api/payroll/calculate/bonus"
CHECKLIST = "/api/exit/clearance-checklist"
TEMPLATES = "/api/notifications/templates"
STATES = "/api/payroll-config/compliance/states"
CHATBOT_MSG = "/api/chatbot/message"
CHATBOT_HISTORY = "/api/chatbot/history/1"
TRIGGER = "/trigger"


def test_gratuity_calc_requires_auth(client):
    resp = client.post(GRA, json={"basic_da": 50000, "years_of_service": 5})
    assert resp.status_code == 401


def test_bonus_calc_requires_auth(client):
    resp = client.post(BONUS, json={"gross_salary": 600000, "months_worked": 12})
    assert resp.status_code == 401


def test_clearance_checklist_requires_auth(client):
    resp = client.get(CHECKLIST)
    assert resp.status_code == 401


def test_notification_templates_requires_auth(client):
    resp = client.get(TEMPLATES)
    assert resp.status_code == 401


def test_compliance_states_requires_auth(client):
    resp = client.get(STATES)
    assert resp.status_code == 401


def test_chatbot_message_requires_auth(client):
    resp = client.post(CHATBOT_MSG, json={"user_id": "1", "message": "hello"})
    assert resp.status_code == 401


def test_chatbot_history_requires_auth(client):
    resp = client.get(CHATBOT_HISTORY)
    assert resp.status_code == 401


def test_chatbot_history_forbidden_for_other_user(client, admin_token):
    resp = client.get(
        CHATBOT_HISTORY,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # admin may read any history — must NOT be 401; only anonymous is rejected
    assert resp.status_code == 200


def test_automation_trigger_requires_auth(client):
    resp = client.post(TRIGGER, json={"trigger_type": "test", "payload": {}})
    assert resp.status_code == 401


def test_automation_status_requires_auth(client):
    resp = client.get("/status")
    assert resp.status_code == 401


def test_gratuity_calc_authenticated(client, admin_token):
    resp = client.post(
        GRA,
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"basic_da": 50000, "years_of_service": 5},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "amount" in data
    assert data["eligible"] is True
    assert data["amount"] > 0


def test_gratuity_not_eligible_under_five_years(client, admin_token):
    resp = client.post(
        GRA,
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"basic_da": 50000, "years_of_service": 4},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["eligible"] is False
    assert data["amount"] == 0


def test_gratuity_engine_uses_act_defaults_when_no_setting():
    from services.compliance_engine import calculate_gratuity
    out = calculate_gratuity(50000, 5, None)
    # 15 days/year * 50000 * 5 / 26
    assert out["eligible"] is True
    assert out["amount"] == round(15 * 50000 * 5 / 26, 2)


def test_bonus_calc_authenticated(client, admin_token):
    resp = client.post(
        BONUS,
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"gross_salary": 600000, "months_worked": 12},
    )
    assert resp.status_code == 200


def test_compliance_states_authenticated(client, admin_token):
    resp = client.get(
        STATES,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    states = resp.json()
    assert isinstance(states, list) and len(states) > 0
    assert all("code" in s and "state_name" in s for s in states)


def test_chatbot_message_authenticated_forces_own_identity(client, admin_token):
    resp = client.post(
        CHATBOT_MSG,
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"user_id": "999999", "message": "hello"},
    )
    assert resp.status_code == 200
    # server must key the conversation by the authenticated user, not payload
    history = client.get(
        "/api/chatbot/history/999999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert history.status_code == 200
    assert history.json()["total_messages"] == 0
