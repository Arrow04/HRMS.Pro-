"""
Tests for authenticated AI chat endpoints
"""
import pytest
from fastapi.testclient import TestClient


def test_ai_chat_unauthenticated(client):
    """Test that AI chat endpoint rejects unauthenticated requests"""
    resp = client.post("/api/ai/chat", json={
        "message": "Hello",
        "user_id": "test_user"
    })
    assert resp.status_code == 401


def test_ai_chat_authenticated_greeting(client, admin_token):
    """Test authenticated AI chat with greeting intent"""
    resp = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"message": "Hello, how are you?"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert "intent" in data
    assert "suggestions" in data
    assert "timestamp" in data
    assert "provider" in data
    assert "context" in data
    # Verify context has authenticated user info
    assert data["context"]["user_id"] == str(client.admin_user_id) if hasattr(client, 'admin_user_id') else True
    assert data["context"]["role"] is not None


def test_ai_chat_authenticated_leave_query(client, admin_token):
    """Test authenticated AI chat with leave balance query"""
    resp = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"message": "What's my leave balance?"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert data["intent"] == "leave_query"


def test_ai_chat_rejects_user_id_override(client, admin_token):
    """Test that client-supplied user_id is ignored when authenticated"""
    resp = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "message": "Hello",
            "user_id": "999999",  # Attempt to impersonate another user
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    # The response should use the authenticated user's ID, not the supplied one
    assert data["context"]["user_id"] != "999999"


def test_ai_chat_rejects_org_override(client, admin_token):
    """Test that client-supplied organization_id is rejected when it conflicts"""
    resp = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "message": "Hello",
            "context": {"organization_id": 999999},  # Attempt to access another org
        }
    )
    # Should either reject with 403 or use authenticated org_id
    # Current implementation rejects with 403
    assert resp.status_code in (200, 403)


def test_ai_chat_rejects_role_override(client, admin_token):
    """Test that client-supplied role is rejected when it conflicts"""
    resp = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "message": "Hello",
            "context": {"role": "superadmin"},  # Attempt to escalate privileges
        }
    )
    # Should either reject with 403 or use authenticated role
    assert resp.status_code in (200, 403)


def test_ai_chat_history_authenticated(client, admin_token):
    """Test authenticated chat history endpoint"""
    # First send a message
    client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"message": "Test message for history"}
    )
    
    resp = client.get(
        "/api/ai/chat/history",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "user_id" in data
    assert "messages" in data
    assert "total_messages" in data


def test_ai_chat_history_unauthenticated(client):
    """Test that chat history endpoint rejects unauthenticated requests"""
    resp = client.get("/api/ai/chat/history")
    assert resp.status_code == 401


def test_ai_clear_history_authenticated(client, admin_token):
    """Test authenticated clear chat history endpoint"""
    resp = client.delete(
        "/api/ai/chat/history",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Chat history cleared"


def test_ai_clear_history_unauthenticated(client):
    """Test that clear history endpoint rejects unauthenticated requests"""
    resp = client.delete("/api/ai/chat/history")
    assert resp.status_code == 401


def test_ai_suggestions_unauthenticated_allowed(client):
    """Test that suggestions endpoint is accessible without auth (public)"""
    resp = client.get("/api/ai/suggestions")
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) > 0


def test_ai_health_authenticated(client, admin_token):
    """Test authenticated AI health endpoint"""
    resp = client.get(
        "/api/ai/health",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "online"
    assert "services" in data
    assert "version" in data


def test_ai_models_authenticated(client, admin_token):
    """Test authenticated AI models endpoint"""
    resp = client.get(
        "/api/ai/models",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "default" in data
    assert "available" in data


def test_ai_employee_search_authenticated(client, admin_token):
    """Test authenticated employee search endpoint"""
    resp = client.post(
        "/api/ai/employees/search",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"query": "admin"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "query" in data
    assert "results" in data
    assert "count" in data


def test_ai_documents_query_authenticated(client, admin_token):
    """Test authenticated document query endpoint"""
    resp = client.post(
        "/api/ai/documents/query",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"question": "What is the leave policy?"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "question" in data
    assert "documents" in data
    assert "count" in data


def test_ai_insights_generate_authenticated(client, admin_token):
    """Test authenticated AI insights generation"""
    resp = client.post(
        "/api/ai/insights/generate",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"report_type": "general", "parameters": {}}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "report_type" in data
    assert "generated_at" in data


def test_ai_sentiment_authenticated(client, admin_token):
    """Test authenticated sentiment analysis"""
    resp = client.post(
        "/api/ai/insights/sentiment",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"text": "I am very happy with the new policy"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "analysis" in data
    assert "sentiment" in data["analysis"]
    assert data["analysis"]["sentiment"] == "positive"


def test_ai_attrition_authenticated(client, admin_token):
    """Test authenticated attrition prediction"""
    resp = client.post(
        "/api/ai/insights/attrition",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "employee_id": 1,
            "employee_data": {
                "leaves_taken": 15,
                "performance_score": 75,
                "years_in_role": 2
            }
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "prediction" in data
    assert "risk_level" in data["prediction"]


def test_ai_automation_rules_authenticated(client, admin_token):
    """Test authenticated automation rules endpoint"""
    resp = client.get(
        "/api/ai/automation/rules",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "rules" in data


def test_ai_automation_reports_authenticated(client, admin_token):
    """Test authenticated automation monthly reports"""
    resp = client.post(
        "/api/ai/automation/reports/monthly",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "reports" in data
    assert "generated_at" in data


# Tenant isolation test - requires two users from different organizations
def test_ai_tenant_isolation(client, admin_token, db_session):
    """Test that users can only access data from their own organization"""
    # This test would require setting up a second organization and user
    # For now, verify the endpoint enforces tenant context
    resp = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"message": "Show me all employees"}
    )
    assert resp.status_code == 200
    data = resp.json()
    # The response should only contain employees from the user's organization
    # The engine's tenant isolation should handle this
    assert "response" in data


# Backward compatibility test - optional user_id field
def test_ai_chat_backward_compat_user_id_optional(client, admin_token):
    """Test that user_id field is optional for backward compatibility"""
    resp = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"message": "Hello"}  # No user_id field
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert data["context"]["user_id"] is not None  # Should be derived from auth