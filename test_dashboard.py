import requests

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
token = r.json().get('token')
user = r.json().get('user', {})
h = {'Authorization': f'Bearer {token}'}
print(f"User role: {user.get('role')}, org_id: {user.get('organization_id')}")

r2 = requests.get('http://localhost:8000/api/dashboard/summary', headers=h, timeout=15)
print(f"\nDashboard status: {r2.status_code}")
data = r2.json()
print(f"Keys: {list(data.keys())}")
print(f"totalEmployees: {data.get('totalEmployees', 'MISSING')}")
print(f"activeEmployees: {data.get('activeEmployees', 'MISSING')}")
