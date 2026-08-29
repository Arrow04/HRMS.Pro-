import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

r = c.execute(sqlalchemy.text("SELECT id, check_in, check_out, status FROM attendances WHERE employee_id = 1723 AND date >= '2026-08-28' ORDER BY id DESC LIMIT 5"))
rows = r.fetchall()
print("Recent records for emp 1723:")
for row in rows:
    print(f"  id={row[0]}, in={row[1]}, out={row[2]}, status={row[3]}")

c.close()
