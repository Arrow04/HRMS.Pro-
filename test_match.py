import requests
import json

r = requests.post("http://localhost:8000/api/auth/login", json={"email": "admin@hrms.com", "password": "admin123"}, timeout=5)
token = r.json().get("token")
user = r.json().get("user", {})
emp_id = user.get("employeeId")
h = {"Authorization": f"Bearer {token}"}

print(f"user.employeeId = {emp_id}")
print(f"user.id = {user.get('id')}")

# Get today's attendance
from datetime import datetime
today = datetime.now().strftime("%Y-%m-%d")
r2 = requests.get("http://localhost:8000/api/attendance", params={"startDate": today, "endDate": today}, headers=h, timeout=10)
data = r2.json()
records = data if isinstance(data, list) else data.get("data", [])

print(f"\nTotal records: {len(records)}")
if records:
    rec = records[0]
    print(f"First record keys: {list(rec.keys())}")
    print(f"employee_id = {rec.get('employee_id')}")
    print(f"check_in = {rec.get('check_in')}")
    print(f"check_out = {rec.get('check_out')}")
    print(f"status = {rec.get('status')}")
    print(f"\nMatching: employee_id={rec.get('employee_id')} == user.employeeId={emp_id} -> {rec.get('employee_id') == emp_id}")
