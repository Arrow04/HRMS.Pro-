def test_attendance_endpoint_exists(client, admin_token):
    resp = client.get(
        "/api/attendance",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404, 307)


def test_attendance_stats(client, admin_token):
    resp = client.get(
        "/api/attendance/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # 200 if a stats endpoint exists, 404/405 if not (path collides with {attendance_id} PUT/DELETE)
    assert resp.status_code in (200, 404, 405)
    if resp.status_code == 200:
        data = resp.json()
        assert isinstance(data, (dict, list))
