import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

r = c.execute(sqlalchemy.text("SELECT id, first_name, last_name, status, employee_code FROM employees WHERE first_name ILIKE '%tirna%'"))
emp = r.fetchone()
print(f"Tirna: id={emp[0]}, status='{emp[3]}', code={emp[4]}")

# Check what statuses exist
r2 = c.execute(sqlalchemy.text("SELECT status, COUNT(*) FROM employees GROUP BY status ORDER BY COUNT(*) DESC"))
print("\nEmployee statuses:")
for row in r2:
    print(f"  '{row[0]}': {row[1]}")

c.close()
