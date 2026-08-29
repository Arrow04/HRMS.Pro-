import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Check attendance org_id
r = c.execute(sqlalchemy.text("SELECT organization_id, COUNT(*) FROM attendances WHERE employee_id = 1568 GROUP BY organization_id"))
print("Tirna attendance org_ids:")
for row in r:
    print(f"  org_id={row[0]}, count={row[1]}")

# Check what org_id the employees have
r2 = c.execute(sqlalchemy.text("SELECT organization_id, COUNT(*) FROM employees GROUP BY organization_id"))
print("\nEmployee org_ids:")
for row in r2:
    print(f"  org_id={row[0]}, count={row[1]}")

# Check current user's org_id
r3 = c.execute(sqlalchemy.text("SELECT id, email, role, organization_id FROM users WHERE role IN ('admin', 'hr_admin') LIMIT 5"))
print("\nAdmin users:")
for row in r3:
    print(f"  id={row[0]}, email={row[1]}, role={row[2]}, org_id={row[3]}")

c.close()
