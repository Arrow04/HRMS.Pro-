import requests

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
token = r.json().get('token')
h = {'Authorization': f'Bearer {token}'}

r2 = requests.get('http://localhost:8000/api/dashboard/summary', headers=h, timeout=15)
print(f"Status: {r2.status_code}")
print(f"Response: {r2.text[:500]}")
