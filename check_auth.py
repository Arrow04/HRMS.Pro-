import requests

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
data = r.json()
print("Login response keys:", list(data.keys()))
user = data.get('user', {})
print("User object:", {k: v for k, v in user.items() if k in ['id', 'email', 'role', 'fullName', 'employeeId', 'organization_id']})
