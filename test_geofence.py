import requests

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
token = r.json().get('token')
h = {'Authorization': f'Bearer {token}'}

# First check out if already checked in
print("--- Checking out first ---")
r_co = requests.post('http://localhost:8000/api/attendance/checkout', json={}, headers=h, timeout=10)
print(f"Checkout: {r_co.status_code} - {r_co.text[:200]}")

# Test check-in with Kolkata coordinates (geofence test)
print("\n--- Check-in with Kolkata coords (22.5726, 88.3639) ---")
r_ci = requests.post('http://localhost:8000/api/attendance/checkin', json={'date': '2026-08-28', 'latitude': 22.5726, 'longitude': 88.3639}, headers=h, timeout=10)
print(f"Check-in: {r_ci.status_code} - {r_ci.text[:300]}")

# Test check-in with wrong location (should fail if geofence is on)
print("\n--- Check-in with Delhi coords (28.6139, 77.2090) ---")
r_ci2 = requests.post('http://localhost:8000/api/attendance/checkin', json={'date': '2026-08-28', 'latitude': 28.6139, 'longitude': 77.2090}, headers=h, timeout=10)
print(f"Check-in: {r_ci2.status_code} - {r_ci2.text[:300]}")
