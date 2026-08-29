import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Check all months for Tirna
r = c.execute(sqlalchemy.text("""
    SELECT EXTRACT(YEAR FROM date) as yr, EXTRACT(MONTH FROM date) as mn, COUNT(*) 
    FROM attendances WHERE employee_id = 1568 
    GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date) 
    ORDER BY yr, mn
"""))
print("Tirna attendance by month:")
for row in r:
    print(f"  {int(row[0])}-{int(row[1]):02d}: {row[2]} records")

# Check July 2026 specifically
r2 = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM attendances WHERE employee_id = 1568 AND date >= '2026-07-01' AND date < '2026-08-01'"))
print(f"\nJuly 2026: {r2.scalar()} records")

c.close()
