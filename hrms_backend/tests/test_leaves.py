def test_list_leaves(client, admin_token):
    resp = client.get(
        "/api/leaves",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


def test_leaves_template(client, admin_token):
    resp = client.get(
        "/api/leaves/template",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404)
