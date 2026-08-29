import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()
r = c.execute(sqlalchemy.text("SELECT id, employee_id, check_in, check_out, status FROM attendances WHERE employee_id = 1723 AND date >= '2026-08-28'"))
rows = r.fetchall()
print(f"Records for emp_id=1723 today: {len(rows)}")
for row in rows:
    print(f"  id={row[0]}, emp={row[1]}, in={row[2]}, out={row[3]}, status={row[4]}")

# Also check what employee_id the records have
r2 = c.execute(sqlalchemy.text("SELECT DISTINCT employee_id FROM attendances WHERE date >= '2026-08-28'"))
print(f"\nDistinct employee_ids today: {[x[0] for x in r2.fetchall()]}")
c.close()
