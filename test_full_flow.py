import requests
from datetime import datetime

BASE = "http://localhost:8000"
r = requests.post(f"{BASE}/api/auth/login", json={"email": "admin@hrms.com", "password": "admin123"}, timeout=5)
token = r.json().get("token")
emp_id = r.json().get("user", {}).get("employeeId")
h = {"Authorization": f"Bearer {token}"}
lat, lng = 22.5726, 88.3639

print(f"Employee: {emp_id}")

# Run 5 cycles of check-in + check-out
for cycle in range(1, 6):
    print(f"\n--- Cycle {cycle} ---")

    r = requests.post(f"{BASE}/api/attendance/checkin", json={"date": datetime.now().strftime("%Y-%m-%d"), "latitude": lat, "longitude": lng}, headers=h, timeout=10)
    d = r.json()
    if r.status_code == 200:
        print(f"  IN   {str(d.get('check_in',''))[:19]}  status={d.get('status')}")
    else:
        print(f"  IN   FAIL: {d.get('detail','')}")

    r = requests.post(f"{BASE}/api/attendance/checkout", json={"latitude": lat, "longitude": lng}, headers=h, timeout=10)
    d = r.json()
    if r.status_code == 200:
        print(f"  OUT  {str(d.get('check_out',''))[:19]}  hours={d.get('work_hours')}")
    else:
        print(f"  OUT  FAIL: {d.get('detail','')}")

# Final summary
print("\n--- SUMMARY ---")
today = datetime.now().strftime("%Y-%m-%d")
r = requests.get(f"{BASE}/api/attendance", params={"startDate": today, "endDate": today}, headers=h, timeout=10)
data = r.json()
records = data if isinstance(data, list) else data.get("data", [])
my = [x for x in records if x.get("employee_id") == emp_id]
print(f"Total records today: {len(my)}")
for rec in my:
    ci = str(rec.get("check_in", ""))[:19]
    co = str(rec.get("check_out", "None"))[:19] if rec.get("check_out") else "None"
    print(f"  IN={ci}  OUT={co}  hours={rec.get('work_hours',0)}  status={rec.get('status')}")
