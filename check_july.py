import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()
r = c.execute(sqlalchemy.text("SELECT date, check_in, status FROM attendances WHERE employee_id = 1568 AND date >= '2025-07-01' AND date < '2025-08-01' ORDER BY date"))
rows = r.fetchall()
print(f"July 2025 records for Tirna: {len(rows)}")
for row in rows[:5]:
    print(f"  {row}")
c.close()
