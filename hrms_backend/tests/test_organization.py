def test_list_companies(client, admin_token):
    resp = client.get(
        "/api/companies",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        data = resp.json()
        assert isinstance(data, (list, dict))


def test_list_departments(client, admin_token):
    resp = client.get(
        "/api/departments",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404)


def test_my_permissions(client, admin_token):
    resp = client.get(
        "/api/my-permissions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "role" in data
    assert "modules" in data
