import sqlalchemy
from datetime import datetime, timedelta

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Fix old UTC records to local time (IST = UTC+5:30)
IST_OFFSET = timedelta(hours=5, minutes=30)

r = c.execute(sqlalchemy.text("SELECT id, check_in, check_out FROM attendances WHERE employee_id = 1723 AND date >= '2026-08-28'"))
for row in r:
    att_id, check_in, check_out = row
    if check_in:
        new_ci = check_in + IST_OFFSET
        new_co = check_out + IST_OFFSET if check_out else None
        c.execute(sqlalchemy.text("UPDATE attendances SET check_in = :ci, check_out = :co WHERE id = :id"), 
                  {'ci': new_ci, 'co': new_co, 'id': att_id})
        print(f"Fixed att_id={att_id}: check_in {check_in} -> {new_ci}")

c.commit()
print("Done fixing times")
c.close()
