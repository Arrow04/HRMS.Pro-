import requests
import json

login_url = "http://localhost:8000/api/auth/login"
login_data = {"email": "admin@hrms.com", "password": "admin123"}

try:
    login_resp = requests.post(login_url, json=login_data, timeout=5)
    token = login_resp.json().get("token")
    user = login_resp.json().get("user", {})
    print(f"User: {user.get('fullName', 'unknown')}, role: {user.get('role', 'unknown')}, id: {user.get('id', 'unknown')}")
except Exception as e:
    print(f"Cannot connect: {e}")
    exit(1)

headers = {"Authorization": f"Bearer {token}"}

# Check permissions
resp = requests.get("http://localhost:8000/api/my-permissions", headers=headers, timeout=5)
print(f"\nPermissions status: {resp.status_code}")
data = resp.json()
if isinstance(data, dict):
    modules = data.get("modules", data)
    if isinstance(modules, dict):
        att_perms = modules.get("attendance", {})
        print(f"Attendance permissions: {att_perms}")
    else:
        print(f"Permissions: {str(data)[:300]}")

# Try calendar with the user's own employee ID
emp_id = user.get("id")
print(f"\nTrying calendar with user_id={emp_id}...")
resp2 = requests.get(f"http://localhost:8000/api/attendance/employee/{emp_id}/calendar", params={"month": 7, "year": 2026}, headers=headers, timeout=5)
print(f"Status: {resp2.status_code}")
if resp2.status_code == 200:
    data2 = resp2.json()
    cal = data2.get("calendar", {})
    print(f"Calendar days: {len(cal)}")
else:
    print(f"Error: {resp2.json()}")
