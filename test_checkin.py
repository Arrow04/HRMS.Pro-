import requests
import json

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
token = r.json().get('token')
h = {'Authorization': f'Bearer {token}'}

# Test check-in
print("--- Testing Check-in ---")
r2 = requests.post('http://localhost:8000/api/attendance/checkin', json={'date': '2026-08-28', 'latitude': 22.5726, 'longitude': 88.3639}, headers=h, timeout=10)
print(f"Status: {r2.status_code}")
print(f"Response: {r2.text[:500]}")

# Test fetching today
print("\n--- Today's Attendance ---")
r3 = requests.get('http://localhost:8000/api/attendance', params={'startDate': '2026-08-28', 'endDate': '2026-08-28'}, headers=h, timeout=10)
data = r3.json()
if isinstance(data, list):
    print(f"Records: {len(data)}")
    for rec in data[:3]:
        print(f"  emp={rec.get('employee_name','?')}, check_in={rec.get('check_in')}, check_out={rec.get('check_out')}, status={rec.get('status')}")
else:
    print(f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'not dict'}")
    print(f"Data: {json.dumps(data, indent=2)[:300]}")
