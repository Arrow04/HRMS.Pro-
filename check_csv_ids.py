import csv

# Find Tirna's old CSV ID
with open('employee_list.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if 'tirna' in (row.get('tle_employee_fname') or '').lower() and 'banerjee' in (row.get('tle_employee_lname') or '').lower():
            print(f"Employee CSV: id={row['tle_employee_id']}, code={row.get('tle_employee_code')}, email={row.get('tle_email')}")

# Check attendance for old ID 218
print("\nAttendance CSV records for employee_id=218:")
with open('employee_attendance_data.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    count = 0
    for row in reader:
        if row.get('att_FK_employee_id') == '218':
            count += 1
            if count <= 5:
                print(f"  date={row['att_date']}, status={row['att_status']}, check_in={row.get('att_punch_in_datetime', '')}")
    print(f"  Total: {count}")

# Check what employee IDs are in attendance
print("\nUnique employee IDs in attendance CSV:")
emp_ids_in_att = set()
with open('employee_attendance_data.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        eid = row.get('att_FK_employee_id', '').strip()
        if eid:
            emp_ids_in_att.add(int(eid))
print(f"  Total unique IDs: {len(emp_ids_in_att)}")
print(f"  Sample IDs: {sorted(emp_ids_in_att)[:20]}")
