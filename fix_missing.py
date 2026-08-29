import sqlalchemy
import csv

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Find employees that share tirna@3rdlawmedia.com and weren't inserted
shared_email = 'tirna@3rdlawmedia.com'
missing = []

with open('employee_list.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        email = (row.get('tle_email') or '').strip()
        first = (row.get('tle_employee_fname') or '').strip()
        last = (row.get('tle_employee_lname') or '').strip()
        code = (row.get('tle_employee_code') or '').strip()
        
        if not first:
            continue
        
        # Check if this employee_code already exists
        r = c.execute(sqlalchemy.text("SELECT id FROM employees WHERE employee_code = :code"), {'code': code})
        if r.fetchone():
            continue
        
        # Check if this email already exists
        if email:
            r = c.execute(sqlalchemy.text("SELECT id FROM employees WHERE email = :email"), {'email': email})
            if r.fetchone():
                # Email taken, generate unique email
                email = f"{first.lower()}.{last.lower().replace(' ', '')}@hrms.pro"
        
        if not email:
            email = f"{first.lower()}.{last.lower().replace(' ', '')}@hrms.pro"
        
        missing.append({
            'first': first, 'last': last if last != '-' else None,
            'email': email, 'code': code,
            'gender': (row.get('tle_gender') or '').strip() or None,
            'company_id': int(row.get('tle_comp_id') or 0) or None,
            'salary': None,
            'phone': (row.get('tle_mobile_number') or row.get('tle_res_mobile_no') or '').strip() or None,
            'role': (row.get('tle_user_role') or 'Employee').strip(),
            'status': 'active' if row.get('tle_status') == 'ON' else 'inactive',
        })

print(f"Found {len(missing)} missing employees to insert")

for emp in missing:
    try:
        c.execute(sqlalchemy.text("""
            INSERT INTO employees (first_name, last_name, email, employee_code, gender,
                company_id, base_salary, phone, user_role, status, organization_id,
                created_at, updated_at)
            VALUES (:first, :last, :email, :code, :gender,
                :company_id, :salary, :phone, :role, :status, 1, NOW(), NOW())
            ON CONFLICT (email) DO NOTHING
            RETURNING id
        """), emp)
        c.commit()
        print(f"  Inserted: {emp['first']} {emp['last'] or ''} ({emp['code']})")
    except Exception as ex:
        c.rollback()
        print(f"  Error: {emp['first']} - {ex}")

# Verify Tirna is now in DB
r = c.execute(sqlalchemy.text("SELECT id, first_name, last_name, email, employee_code FROM employees WHERE first_name ILIKE '%tirna%'"))
print("\nTirna search results:")
for row in r:
    print(f"  {row}")

c.close()
