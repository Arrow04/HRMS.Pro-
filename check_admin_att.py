import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Check admin's employee record
r = c.execute(sqlalchemy.text("SELECT id, user_id, first_name, last_name, email FROM employees WHERE user_id = 1"))
emp = r.fetchone()
print(f"Admin employee: {emp}")

if emp:
    emp_id = emp[0]
    # Check today's attendance
    r2 = c.execute(sqlalchemy.text(f"SELECT id, check_in, check_out, status, date FROM attendances WHERE employee_id = {emp_id} AND date >= CURRENT_DATE ORDER BY date DESC LIMIT 5"))
    rows = r2.fetchall()
    print(f"\nToday's attendance for emp_id={emp_id}:")
    for row in rows:
        print(f"  id={row[0]}, check_in={row[1]}, check_out={row[2]}, status={row[3]}, date={row[4]}")

c.close()
