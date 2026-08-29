import csv
import os

def sql_val(v):
    if v is None or v == '' or v == 'NULL':
        return 'NULL'
    v = str(v).replace("'", "''")
    return f"'{v}'"

def sql_int(v):
    if v is None or v == '' or v == 'NULL':
        return 'NULL'
    try:
        return str(int(v))
    except:
        return 'NULL'

def sql_float(v):
    if v is None or v == '' or v == 'NULL':
        return 'NULL'
    try:
        return str(float(v))
    except:
        return 'NULL'

def sql_date(v):
    if v is None or v == '' or v == 'NULL':
        return 'NULL'
    return f"'{v}'"

lines = []
lines.append('-- HRMS Data Import Script')
lines.append('-- Generated from client CSV data')
lines.append('')

# ============================================
# 1. EMPLOYEES
# ============================================
lines.append('-- ============================================')
lines.append('-- EMPLOYEES')
lines.append('-- ============================================')

emp_count = 0
emp_id_map = {}  # csv_id -> db_id

with open('employee_list.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader, start=1):
        csv_id = row.get('tle_employee_id', '')
        first_name = row.get('tle_employee_fname', '').strip()
        last_name = row.get('tle_employee_lname', '').strip()
        if not first_name:
            continue
        
        email = row.get('tle_email', '').strip() or row.get('tle_employee_uname', '').strip() or f'employee{i}@hrms.pro'
        employee_code = row.get('tle_employee_code', '').strip() or f'EMP-{i}'
        gender = row.get('tle_gender', '').strip() or None
        company_id = sql_int(row.get('tle_comp_id'))
        branch_id = sql_int(row.get('tle_branch_id', '').split(',')[0].strip() if row.get('tle_branch_id') else None)
        base_salary = sql_float(row.get('tle_employee_gross_salary_amount'))
        department_id = sql_int(row.get('tle_department_id'))
        designation_id = sql_int(row.get('tle_designation_id'))
        dob = sql_date(row.get('tle_birth_date'))
        join_date = sql_date(row.get('tle_join_date'))
        father_name = f"{row.get('tle_father_fname', '')} {row.get('tle_father_lname', '')}".strip() or None
        mother_name = f"{row.get('tle_monther_fname', '')} {row.get('tle_monther_lname', '')}".strip() or None
        if mother_name == '- ' or mother_name == '-':
            mother_name = None
        if father_name == '- ' or father_name == '-':
            father_name = None
            
        address = row.get('tle_res_address1', '').strip() or row.get('tle_per_address1', '').strip() or None
        permanent_address = row.get('tle_per_address1', '').strip() or None
        phone = row.get('tle_mobile_number', '').strip() or row.get('tle_res_mobile_no', '').strip() or None
        emergency_phone = row.get('tle_emergency_number', '').strip() or None
        bank_name = row.get('tle_bank_name', '').strip() or None
        bank_account = row.get('tle_bank_account', '').strip() or None
        ifsc = row.get('tle_bank_ifsc_code', '').strip() or None
        blood_group = row.get('tle_bloodgroup', '').strip() or None
        aadhar = row.get('tle_aadhar_no', '').strip() or None
        pan = row.get('tle_pan_no', '').strip() or None
        user_role = row.get('tle_user_role', '').strip() or 'employee'
        tle_status = row.get('tle_status', '').strip()
        is_active = row.get('tle_is_active', '').strip()
        
        status = 'active'
        if tle_status == 'OFF' or is_active == '0':
            status = 'inactive'
        elif tle_status == 'ON' and is_active == '1':
            status = 'active'
        
        org_id = 1  # default org
        
        sql = f"""INSERT INTO employees (first_name, last_name, email, employee_code, gender, company_id, branch_id, base_salary, department_id, designation_id, date_of_birth, join_date, father_name, mother_name, address, permanent_address, phone, emergency_phone, bank_name, bank_account_number, ifsc_code, blood_group, aadhar_number, pan_number, user_role, status, organization_id, created_at, updated_at) VALUES ({sql_val(first_name)}, {sql_val(last_name)}, {sql_val(email)}, {sql_val(employee_code)}, {sql_val(gender)}, {company_id}, {branch_id}, {base_salary}, {department_id}, {designation_id}, {dob}, {join_date}, {sql_val(father_name)}, {sql_val(mother_name)}, {sql_val(address)}, {sql_val(permanent_address)}, {sql_val(phone)}, {sql_val(emergency_phone)}, {sql_val(bank_name)}, {sql_val(bank_account)}, {sql_val(ifsc)}, {sql_val(blood_group)}, {sql_val(aadhar)}, {sql_val(pan)}, {sql_val(user_role)}, {sql_val(status)}, {org_id}, NOW(), NOW()) ON CONFLICT (email) DO NOTHING RETURNING id;"""
        
        lines.append(sql)
        emp_count += 1

lines.append('')
lines.append(f'-- Total employees inserted: {emp_count}')
lines.append('')

# ============================================
# 2. ATTENDANCE
# ============================================
lines.append('-- ============================================')
lines.append('-- ATTENDANCE')
lines.append('-- ============================================')

att_count = 0

with open('employee_attendance_data.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        csv_emp_id = row.get('att_FK_employee_id', '').strip()
        if not csv_emp_id:
            continue
        
        date_val = row.get('att_date', '').strip()
        check_in = row.get('att_punch_in_datetime', '').strip()
        check_out = row.get('att_punch_out_datetime', '').strip()
        check_in_lat = sql_float(row.get('att_punch_in_latitude'))
        check_in_lng = sql_float(row.get('att_punch_in_longitude'))
        check_in_loc = row.get('att_punch_in_full_location_address', '').strip() or None
        check_out_lat = sql_float(row.get('att_punch_out_latitude'))
        check_out_lng = sql_float(row.get('att_punch_out_longitude'))
        check_out_loc = row.get('att_punch_out_full_location_address', '').strip() or None
        late_minutes = sql_int(row.get('att_late_in_minutes'))
        work_hours = sql_float(row.get('att_working_hours'))
        att_status = row.get('att_status', '').strip() or 'present'
        notes = row.get('att_note', '').strip() or None
        company_id = sql_int(row.get('att_FK_company_id'))
        branch_id = sql_int(row.get('att_FK_branch_id'))
        
        # Map status
        status_map = {
            'Present': 'present',
            'Absent': 'absent',
            'Late': 'late',
            'Half Day': 'half_day',
            'Week Off': 'absent',
            'Double Present': 'present',
            'On Leave': 'on_leave',
        }
        status = status_map.get(att_status, 'present')
        
        # Format dates for SQL
        check_in_sql = sql_date(check_in) if check_in and check_in != 'NULL' else 'NULL'
        check_out_sql = sql_date(check_out) if check_out and check_out != 'NULL' else 'NULL'
        date_sql = sql_date(date_val) if date_val else 'NULL'
        
        is_late_val = 0
        try:
            is_late_val = int(late_minutes) if late_minutes and late_minutes != 'NULL' else 0
        except:
            is_late_val = 0
        is_late = 'TRUE' if is_late_val > 0 else 'FALSE'
        
        sql = f"""INSERT INTO attendances (employee_id, organization_id, company_id, branch_id, date, check_in, check_out, status, work_hours, is_late, late_minutes, check_in_latitude, check_in_longitude, check_in_location_name, check_out_latitude, check_out_longitude, check_out_location_name, notes, created_at, updated_at) VALUES ({csv_emp_id}, 1, {company_id}, {branch_id}, {date_sql}, {check_in_sql}, {check_out_sql}, {sql_val(status)}, {work_hours}, {is_late}, {late_minutes or 0}, {check_in_lat}, {check_in_lng}, {sql_val(check_in_loc)}, {check_out_lat}, {check_out_lng}, {sql_val(check_out_loc)}, {sql_val(notes)}, NOW(), NOW());"""
        
        lines.append(sql)
        att_count += 1

lines.append('')
lines.append(f'-- Total attendance records inserted: {att_count}')
lines.append('')

# Write to file
output_path = 'import_data.sql'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f'Generated {output_path}')
print(f'Employees: {emp_count}')
print(f'Attendance records: {att_count}')
print(f'File size: {os.path.getsize(output_path) / 1024 / 1024:.1f} MB')
