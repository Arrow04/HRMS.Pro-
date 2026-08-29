def test_list_holidays(client, admin_token):
    resp = client.get(
        "/api/holidays",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


def test_export_holidays(client, admin_token):
    resp = client.get(
        "/api/holidays/export",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404)
