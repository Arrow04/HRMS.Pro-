import sqlalchemy
e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Simulate the API call
import calendar as cal
year, month = 2026, 7
employee_id = 1568

start = f"{year}-{month:02d}-01"
last_day = cal.monthrange(year, month)[1]
end = f"{year}-{month:02d}-{last_day}"

records = c.execute(sqlalchemy.text(
    f"SELECT date, status FROM attendances WHERE employee_id = {employee_id} AND date >= '{start}' AND date <= '{end}' ORDER BY date"
)).fetchall()

print(f"API returns: {{'calendar': {{...}}, 'month': {month}, 'year': {year}}}")
print(f"Frontend expects: r.data.days")
print(f"Backend returns: r.data.calendar")
print(f"\nSample records:")
for r in records[:5]:
    print(f"  {r[0]}: {r[1]}")

c.close()
