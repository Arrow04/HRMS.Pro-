def test_health_check(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"


def test_login_returns_token(client):
    resp = client.post("/api/auth/login", json={
        "email": "admin@hrms.com",
        "password": "admin123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "user" in data


def test_login_invalid_credentials(client):
    resp = client.post("/api/auth/login", json={
        "email": "admin@hrms.com",
        "password": "wrong-password",
    })
    assert resp.status_code in (401, 403)


def test_get_me_requires_auth(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_get_me_with_token(client, admin_token):
    resp = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "email" in data


def test_test_endpoint(client):
    resp = client.get("/test")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
