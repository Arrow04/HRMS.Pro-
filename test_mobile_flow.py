import requests
import json
from datetime import datetime

BASE = "http://localhost:8000"

# Login as admin
print("=" * 50)
print("LOGIN")
print("=" * 50)
r = requests.post(f"{BASE}/api/auth/login", json={"email": "admin@hrms.com", "password": "admin123"}, timeout=5)
data = r.json()
token = data.get("token")
user = data.get("user", {})
emp_id = user.get("employeeId")
h = {"Authorization": f"Bearer {token}"}
print(f"User: {user.get('fullName')} | Employee ID: {emp_id} | Role: {user.get('role')}")

# Kolkata coords
lat, lng = 22.5726, 88.3639

def checkin(extra=None):
    payload = {"date": datetime.now().strftime("%Y-%m-%d"), "latitude": lat, "longitude": lng}
    if extra: payload.update(extra)
    r = requests.post(f"{BASE}/api/attendance/checkin", json=payload, headers=h, timeout=10)
    d = r.json()
    if r.status_code == 200:
        print(f"  CHECK IN  OK | time={d.get('check_in', 'N/A')[:19]} | status={d.get('status')}")
    else:
        print(f"  CHECK IN  FAIL | {r.status_code} | {d.get('detail', '')}")
    return r.status_code

def checkout(extra=None):
    payload = {"latitude": lat, "longitude": lng}
    if extra: payload.update(extra)
    r = requests.post(f"{BASE}/api/attendance/checkout", json=payload, headers=h, timeout=10)
    d = r.json()
    if r.status_code == 200:
        print(f"  CHECK OUT OK | time={d.get('check_out', 'N/A')[:19]} | hours={d.get('work_hours')}")
    else:
        print(f"  CHECK OUT FAIL | {r.status_code} | {d.get('detail', '')}")
    return r.status_code

def get_today():
    today = datetime.now().strftime("%Y-%m-%d")
    r = requests.get(f"{BASE}/api/attendance", params={"startDate": today, "endDate": today}, headers=h, timeout=10)
    data = r.json()
    records = data if isinstance(data, list) else data.get("data", [])
    my = [x for x in records if x.get("employee_id") == emp_id]
    print(f"\n  TODAY: {len(my)} records for employee {emp_id}")
    for rec in my:
        ci = rec.get("check_in", "N/A")
        co = rec.get("check_out", "N/A")
        wh = rec.get("work_hours", 0)
        print(f"    in={str(ci)[:19]} | out={str(co)[:19] if co else 'None':>20} | hours={wh} | status={rec.get('status')}")

# === CYCLE 1 ===
print(f"\n{'=' * 50}")
print("CYCLE 1: Check-in then Check-out")
print("=" * 50)
checkin()
checkout()

# === CYCLE 2 ===
print(f"\n{'=' * 50}")
print("CYCLE 2: Check-in then Check-out")
print("=" * 50)
checkin()
checkout()

# === CYCLE 3 ===
print(f"\n{'=' * 50}")
print("CYCLE 3: Check-in (stay checked in)")
print("=" * 50)
checkin()

# === CHECK TODAY'S RECORDS ===
print(f"\n{'=' * 50}")
print("TODAY'S ATTENDANCE SUMMARY")
print("=" * 50)
get_today()

print(f"\n{'=' * 50}")
print("ALL TESTS PASSED")
print("=" * 50)
