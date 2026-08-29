import csv
import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Build mapping: old_csv_employee_id -> new_db_employee_id using employee_code
print("Building employee ID mapping from CSV...")

old_to_new = {}
with open('employee_list.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        csv_id = row.get('tle_employee_id', '').strip()
        emp_code = row.get('tle_employee_code', '').strip()
        first = row.get('tle_employee_fname', '').strip()
        last = row.get('tle_employee_lname', '').strip()
        if not csv_id or not emp_code:
            continue
        # Find employee in DB by code
        r = c.execute(sqlalchemy.text("SELECT id FROM employees WHERE employee_code = :code"), {'code': emp_code})
        db_row = r.fetchone()
        if db_row:
            old_to_new[int(csv_id)] = db_row[0]

print(f"Mapped {len(old_to_new)} employee IDs")

# Check how many attendance records use old IDs that don't match
r = c.execute(sqlalchemy.text("""
    SELECT a.employee_id, COUNT(*) 
    FROM attendances a 
    LEFT JOIN employees e ON a.employee_id = e.id 
    WHERE e.id IS NULL 
    GROUP BY a.employee_id
    LIMIT 20
"""))
orphaned = r.fetchall()
print(f"\nOrphaned attendance records (employee_id not in employees table):")
for row in orphaned:
    new_id = old_to_new.get(row[0], 'NOT FOUND')
    print(f"  old_id={row[0]}, count={row[1]}, new_id={new_id}")

# Update orphaned records
total_updated = 0
for old_id, count in orphaned:
    new_id = old_to_new.get(old_id)
    if new_id and new_id != 'NOT FOUND':
        c.execute(sqlalchemy.text("UPDATE attendances SET employee_id = :new_id WHERE employee_id = :old_id"), {'new_id': new_id, 'old_id': old_id})
        total_updated += count
        print(f"  Updated {count} records: {old_id} -> {new_id}")

c.commit()
print(f"\nTotal records updated: {total_updated}")

# Verify Tirna now has attendance
r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM attendances WHERE employee_id = 1568"))
print(f"Tirna (id=1568) attendance records: {r.scalar()}")

# Show sample
r = c.execute(sqlalchemy.text("SELECT date, check_in, check_out, status FROM attendances WHERE employee_id = 1568 ORDER BY date LIMIT 5"))
print("\nTirna's July 2025 sample:")
for row in r:
    print(f"  {row}")

c.close()
