import requests

r = requests.post('http://localhost:8000/api/auth/login', json={'email': 'admin@hrms.com', 'password': 'admin123'}, timeout=5)
token = r.json().get('token')
h = {'Authorization': f'Bearer {token}'}

# Test multiple employees
for emp_id in [1568, 896, 1437]:
    r2 = requests.get(f'http://localhost:8000/api/attendance/employee/{emp_id}/calendar', params={'month': 7, 'year': 2026}, headers=h, timeout=10)
    data = r2.json()
    cal = data.get('calendar', {})
    print(f'Employee {emp_id}: status={r2.status_code}, calendar_days={len(cal)}')
    if cal:
        for k in list(cal.keys())[:2]:
            print(f'  {k}: {cal[k]}')
    elif 'detail' in data:
        print(f'  Error: {data["detail"]}')
