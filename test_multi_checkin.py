import requests
import time

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
token = r.json().get('token')
h = {'Authorization': f'Bearer {token}'}

# Kolkata coordinates
lat, lng = 22.5726, 88.3639

print("=== Test 1: First Check-in ===")
r1 = requests.post('http://localhost:8000/api/attendance/checkin', json={'date': '2026-08-28', 'latitude': lat, 'longitude': lng}, headers=h, timeout=10)
print(f"Status: {r1.status_code} | {r1.json().get('check_in', r1.json().get('detail', ''))}")

print("\n=== Test 2: Try duplicate check-in (should fail) ===")
r2 = requests.post('http://localhost:8000/api/attendance/checkin', json={'date': '2026-08-28', 'latitude': lat, 'longitude': lng}, headers=h, timeout=10)
print(f"Status: {r2.status_code} | {r2.json().get('detail', '')}")

print("\n=== Test 3: Check-out ===")
r3 = requests.post('http://localhost:8000/api/attendance/checkout', json={'latitude': lat, 'longitude': lng}, headers=h, timeout=10)
print(f"Status: {r3.status_code} | check_out={r3.json().get('check_out', r3.json().get('detail', ''))}")

print("\n=== Test 4: Check-in again ===")
r4 = requests.post('http://localhost:8000/api/attendance/checkin', json={'date': '2026-08-28', 'latitude': lat, 'longitude': lng}, headers=h, timeout=10)
print(f"Status: {r4.status_code} | {r4.json().get('check_in', r4.json().get('detail', ''))}")

print("\n=== Test 5: Check-out again ===")
r5 = requests.post('http://localhost:8000/api/attendance/checkout', json={'latitude': lat, 'longitude': lng}, headers=h, timeout=10)
print(f"Status: {r5.status_code} | check_out={r5.json().get('check_out', r5.json().get('detail', ''))}")

print("\n=== Test 6: Final attendance for today ===")
r6 = requests.get('http://localhost:8000/api/attendance', params={'startDate': '2026-08-28', 'endDate': '2026-08-28'}, headers=h, timeout=10)
data = r6.json()
if isinstance(data, list):
    my_records = [rec for rec in data if rec.get('employee_id') == 1723]
    print(f"Admin records today: {len(my_records)}")
    for rec in my_records:
        print(f"  in={rec.get('check_in')}, out={rec.get('check_out')}, hours={rec.get('work_hours')}, status={rec.get('status')}")
