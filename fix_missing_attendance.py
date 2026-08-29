import csv
import sqlalchemy
from datetime import datetime

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

# Build mapping: old_csv_numeric_id -> new_db_id
print("Building mapping from CSV...")
old_to_new = {}
with open('employee_list.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        csv_num_id = row.get('tle_employee_id', '').strip()
        emp_code = row.get('tle_employee_code', '').strip()
        if not csv_num_id or not emp_code:
            continue
        r = c.execute(sqlalchemy.text("SELECT id FROM employees WHERE employee_code = :code"), {'code': emp_code})
        db_row = r.fetchone()
        if db_row:
            old_to_new[int(csv_num_id)] = db_row[0]
print(f"Mapped {len(old_to_new)} employee IDs")

# Find which old IDs have attendance in CSV but no attendance in DB
print("\nChecking which employees need attendance import...")
need_import = {}  # db_id -> [csv_rows]

with open('employee_attendance_data.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        csv_emp_id = int(row.get('att_FK_employee_id', 0))
        if csv_emp_id not in old_to_new:
            continue
        db_id = old_to_new[csv_emp_id]
        # Check if this employee already has attendance
        if db_id not in need_import:
            r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM attendances WHERE employee_id = :id"), {'id': db_id})
            if r.scalar() == 0:
                need_import[db_id] = []
            else:
                need_import[db_id] = None  # already has data
        if need_import.get(db_id) is not None:
            need_import[db_id].append(row)

# Filter to only those that need import
to_import = {k: v for k, v in need_import.items() if v is not None}
print(f"Employees needing attendance import: {len(to_import)}")

total_imported = 0
for db_id, records in to_import.items():
    batch = []
    for row in records:
        date_val = row.get('att_date', '').strip()
        check_in_str = row.get('att_punch_in_datetime', '').strip()
        check_out_str = row.get('att_punch_out_datetime', '').strip()
        
        def parse_dt(s):
            if not s or s == 'NULL' or s == '': return None
            try: return datetime.strptime(s[:19], '%Y-%m-%d %H:%M:%S')
            except:
                try: return datetime.strptime(s[:10], '%Y-%m-%d')
                except: return None
        
        def parse_date(s):
            if not s or s == 'NULL' or s == '': return None
            try: return datetime.strptime(s[:10], '%Y-%m-%d')
            except: return None
        
        status_map = {'Present': 'present', 'Absent': 'absent', 'Late': 'late', 'Half Day': 'half_day', 'Week Off': 'absent', 'Double Present': 'present', 'On Leave': 'on_leave'}
        status = status_map.get(row.get('att_status', '').strip(), 'present')
        
        late_mins = 0
        try: late_mins = int(float(row.get('att_late_in_minutes', 0) or 0))
        except: pass
        
        work_hrs = 0
        try: work_hrs = float(row.get('att_working_hours', 0) or 0)
        except: pass
        
        batch.append({
            'employee_id': db_id, 'organization_id': 1,
            'company_id': int(row.get('att_FK_company_id', 0) or 0) or None,
            'date': parse_date(date_val), 'check_in': parse_dt(check_in_str), 'check_out': parse_dt(check_out_str),
            'status': status, 'work_hours': work_hrs, 'is_late': late_mins > 0, 'late_minutes': late_mins,
            'notes': row.get('att_note', '').strip() or None,
            'created_at': datetime.now(), 'updated_at': datetime.now(),
        })
    
    if batch:
        try:
            c.execute(sqlalchemy.text("""
                INSERT INTO attendances (employee_id, organization_id, company_id, date, check_in, check_out, status, work_hours, is_late, late_minutes, notes, created_at, updated_at)
                VALUES (:employee_id, :organization_id, :company_id, :date, :check_in, :check_out, :status, :work_hours, :is_late, :late_minutes, :notes, :created_at, :updated_at)
            """), batch)
            c.commit()
            total_imported += len(batch)
        except Exception as ex:
            c.rollback()
            print(f"  Error for employee {db_id}: {ex}")

print(f"\nTotal attendance records imported: {total_imported}")

# Verify Tirna
r = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM attendances WHERE employee_id = 1568"))
print(f"Tirna (id=1568) attendance: {r.scalar()}")

# Verify a few others
r = c.execute(sqlalchemy.text("SELECT e.first_name, e.last_name, e.employee_code, COUNT(a.id) as att_count FROM employees e LEFT JOIN attendances a ON e.id = a.employee_id GROUP BY e.id, e.first_name, e.last_name, e.employee_code HAVING COUNT(a.id) = 0 LIMIT 10"))
print("\nEmployees still with 0 attendance:")
for row in r:
    print(f"  {row[0]} {row[1]} ({row[2]})")

c.close()
