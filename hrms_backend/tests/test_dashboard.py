def test_dashboard_stats(client, admin_token):
    resp = client.get(
        "/api/dashboard/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "totalEmployees" in data
    assert isinstance(data["totalEmployees"], int)


def test_dashboard_recent_activities(client, admin_token):
    resp = client.get(
        "/api/dashboard/recent-activities",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404)
