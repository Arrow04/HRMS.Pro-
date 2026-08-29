def test_list_employees(client, admin_token):
    resp = client.get(
        "/api/employees",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))
    if isinstance(data, dict):
        assert "data" in data or "employees" in data


def test_get_employee_count(client, admin_token):
    resp = client.get(
        "/api/employees/count",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "count" in data or isinstance(data, (int, dict))


def test_create_employee(client, admin_token):
    import time
    unique = str(time.time()).replace(".", "")
    resp = client.post(
        "/api/employees",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "firstName": "Test",
            "lastName": "User",
            "email": f"test{unique}@example.com",
            "status": "active",
        },
    )
    assert resp.status_code in (200, 201, 409)
    if resp.status_code in (200, 201):
        data = resp.json()
        assert "id" in data or "employeeId" in data
