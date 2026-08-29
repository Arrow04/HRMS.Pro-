import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Get admin user
r = c.execute(sqlalchemy.text("SELECT id, email, full_name FROM users WHERE email = 'admin@hrms.com'"))
admin = r.fetchone()
print(f"Admin user: {admin}")

if admin:
    user_id, email, full_name = admin
    # Check if employee already exists
    r2 = c.execute(sqlalchemy.text("SELECT id FROM employees WHERE user_id = :uid"), {'uid': user_id})
    if r2.fetchone():
        print("Employee already exists for admin")
    else:
        # Check by email
        r3 = c.execute(sqlalchemy.text("SELECT id FROM employees WHERE email = :email"), {'email': email})
        if r3.fetchone():
            print("Employee exists with matching email")
        else:
            # Create employee record for admin
            name_parts = (full_name or 'Admin User').split()
            first = name_parts[0] if name_parts else 'Admin'
            last = ' '.join(name_parts[1:]) if len(name_parts) > 1 else 'User'
            c.execute(sqlalchemy.text("""
                INSERT INTO employees (user_id, first_name, last_name, email, employee_code, status, organization_id, created_at, updated_at)
                VALUES (:user_id, :first, :last, :email, :code, 'active', 1, NOW(), NOW())
                RETURNING id
            """), {'user_id': user_id, 'first': first, 'last': last, 'email': email, 'code': 'ADMIN-001'})
            c.commit()
            print(f"Created employee for admin user (user_id={user_id})")

c.close()
