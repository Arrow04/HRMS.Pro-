import requests
import json

# Test the calendar endpoint directly
url = "http://localhost:8000/api/attendance/employee/1568/calendar"
params = {"month": 7, "year": 2026}

# First get a token
login_url = "http://localhost:8000/api/auth/login"
login_data = {"email": "admin@hrms.com", "password": "admin123"}

try:
    login_resp = requests.post(login_url, json=login_data, timeout=5)
    token = login_resp.json().get("token")
    if not token:
        print(f"Login failed: {login_resp.json()}")
        exit(1)
    print(f"Got token: {token[:20]}...")
except Exception as e:
    print(f"Cannot connect to backend: {e}")
    exit(1)

headers = {"Authorization": f"Bearer {token}"}

# Test calendar endpoint
resp = requests.get(url, params=params, headers=headers, timeout=10)
print(f"\nStatus: {resp.status_code}")
data = resp.json()
print(f"Response keys: {list(data.keys()) if isinstance(data, dict) else 'not a dict'}")
if isinstance(data, dict):
    if "calendar" in data:
        cal = data["calendar"]
        print(f"Calendar has {len(cal)} days")
        for k in list(cal.keys())[:5]:
            print(f"  {k}: {cal[k]}")
    elif "days" in data:
        print(f"Days has {len(data['days'])} entries")
    elif "detail" in data:
        print(f"Error: {data['detail']}")
    else:
        print(f"Full response: {json.dumps(data, indent=2)[:500]}")
