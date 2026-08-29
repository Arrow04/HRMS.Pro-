import requests

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
token = r.json().get('token')
h = {'Authorization': f'Bearer {token}'}

for emp_id in [1568, 896, 1437]:
    r2 = requests.get(f'http://localhost:8000/api/attendance/employee/{emp_id}/calendar', params={'month': 7, 'year': 2026}, headers=h, timeout=10)
    data = r2.json()
    cal = data.get('calendar', {})
    detail = data.get('detail', '')
    print(f'Employee {emp_id}: status={r2.status_code}, days={len(cal)}, error={detail}')
    if cal:
        for k in sorted(cal.keys())[:3]:
            print(f'  {k}: status={cal[k].get("status")}')
