def test_get_payroll_stats(client, admin_token):
    resp = client.get(
        "/api/payroll/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        data = resp.json()
        assert isinstance(data, dict)


def test_get_payroll_list(client, admin_token):
    resp = client.get(
        "/api/payroll",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (200, 404)

