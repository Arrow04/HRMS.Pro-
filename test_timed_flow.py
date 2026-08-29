import requests
import time
from datetime import datetime

BASE = "http://localhost:8000"
r = requests.post(f"{BASE}/api/auth/login", json={"email": "admin@hrms.com", "password": "admin123"}, timeout=5)
token = r.json().get("token")
emp_id = r.json().get("user", {}).get("employeeId")
h = {"Authorization": f"Bearer {token}"}
lat, lng = 22.5726, 88.3639

print(f"Employee: {emp_id}")
print(f"Waiting 3 seconds before starting...\n")
time.sleep(3)

for cycle in range(1, 4):
    print(f"=== CYCLE {cycle} ===")

    # CHECK IN
    now = datetime.now().strftime("%H:%M:%S")
    print(f"  [{now}] Tapping CHECK IN...")
    r = requests.post(f"{BASE}/api/attendance/checkin", json={"date": datetime.now().strftime("%Y-%m-%d"), "latitude": lat, "longitude": lng}, headers=h, timeout=10)
    d = r.json()
    if r.status_code == 200:
        print(f"  [{datetime.now().strftime('%H:%M:%S')}] CHECKED IN - {d.get('check_in','')[:19]}")
    else:
        print(f"  FAIL: {d.get('detail','')}")

    # Wait 10 seconds
    print(f"  Waiting 10 seconds...")
    time.sleep(10)

    # CHECK OUT
    now = datetime.now().strftime("%H:%M:%S")
    print(f"  [{now}] Tapping CHECK OUT...")
    r = requests.post(f"{BASE}/api/attendance/checkout", json={"latitude": lat, "longitude": lng}, headers=h, timeout=10)
    d = r.json()
    if r.status_code == 200:
        print(f"  [{datetime.now().strftime('%H:%M:%S')}] CHECKED OUT - {d.get('check_out','')[:19]}")
    else:
        print(f"  FAIL: {d.get('detail','')}")

    # Wait 10 seconds before next cycle
    if cycle < 3:
        print(f"  Waiting 10 seconds before next cycle...\n")
        time.sleep(10)

# Summary
print("\n=== TODAY'S RECORDS ===")
today = datetime.now().strftime("%Y-%m-%d")
r = requests.get(f"{BASE}/api/attendance", params={"startDate": today, "endDate": today}, headers=h, timeout=10)
data = r.json()
records = data if isinstance(data, list) else data.get("data", [])
my = [x for x in records if x.get("employee_id") == 1723]
print(f"Total: {len(my)} records")
for rec in my:
    ci = str(rec.get("check_in", ""))[:19]
    co = str(rec.get("check_out", ""))[:19] if rec.get("check_out") else "Still in"
    print(f"  IN={ci}  OUT={co}  hours={rec.get('work_hours',0)}")
