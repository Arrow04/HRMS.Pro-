import csv
import sys
import os
from sqlalchemy import create_engine, text, MetaData, inspect
from sqlalchemy.orm import sessionmaker
from datetime import datetime

os.environ['PYTHONIOENCODING'] = 'utf-8'

DATABASE_URL = "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev"

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()
meta = MetaData()
meta.reflect(bind=engine)

def safe_str(v):
    if v is None or v == '' or v == 'NULL':
        return None
    return str(v).strip()[:500]  # truncate long strings

def safe_int(v):
    if v is None or v == '' or v == 'NULL':
        return None
    try:
        return int(v)
    except:
        return None

def safe_float(v):
    if v is None or v == '' or v == 'NULL':
        return None
    try:
        return float(v)
    except:
        return None

def safe_date(v):
    if v is None or v == '' or v == 'NULL':
        return None
    try:
        return datetime.strptime(str(v).strip(), '%Y-%m-%d')
    except:
        return None

def safe_datetime(v):
    if v is None or v == '' or v == 'NULL':
        return None
    try:
        return datetime.strptime(str(v).strip()[:19], '%Y-%m-%d %H:%M:%S')
    except:
        try:
            return datetime.strptime(str(v).strip()[:10], '%Y-%m-%d')
        except:
            return None

print("=" * 60)
print("HRMS Data Import Script")
print("=" * 60)

# Step 1: Clear existing data
print("\n[1/4] Clearing existing employee and attendance data...")
try:
    # Delete audit logs first (they reference attendances)
    session.execute(text("DELETE FROM attendance_audit_logs"))
    session.execute(text("DELETE FROM attendances"))
    session.execute(text("DELETE FROM employees"))
    session.commit()
    print("  [OK] Cleared attendances, employees, and audit logs")
except Exception as e:
    session.rollback()
    print(f"  [ERR] Error clearing data: {e}")
    print("  Trying TRUNCATE with CASCADE...")
    try:
        session.execute(text("TRUNCATE attendances, employees, attendance_audit_logs RESTART IDENTITY CASCADE"))
        session.commit()
        print("  [OK] Truncated with CASCADE")
    except Exception as e2:
        print(f"  [ERR] Failed: {e2}")
        sys.exit(1)

# Step 2: Check if we need to create users for employees
print("[2/4] Importing employees...")
emp_count = 0
emp_ids = {}  # csv_id -> db_id

with open('employee_list.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader, start=1):
        csv_id = row.get('tle_employee_id', '')
        first_name = safe_str(row.get('tle_employee_fname'))
        if not first_name:
            continue
        
        last_name = safe_str(row.get('tle_employee_lname'))
        if last_name == '-':
            last_name = None
        
        email = safe_str(row.get('tle_email')) or safe_str(row.get('tle_employee_uname')) or f'emp{i}@hrms.pro'
        employee_code = safe_str(row.get('tle_employee_code')) or f'EMP-{i}'
        gender = safe_str(row.get('tle_gender'))
        company_id = safe_int(row.get('tle_comp_id'))
        
        branch_raw = safe_str(row.get('tle_branch_id'))
        branch_id = safe_int(branch_raw.split(',')[0]) if branch_raw else None
        
        base_salary = safe_float(row.get('tle_employee_gross_salary_amount'))
        
        # Store original IDs in custom_fields since parent tables are empty after TRUNCATE
        orig_dept_id = safe_int(row.get('tle_department_id'))
        orig_desig_id = safe_int(row.get('tle_designation_id'))
        
        # Check if FK values exist in parent tables
        department_id = None
        if orig_dept_id:
            dept_check = session.execute(text("SELECT 1 FROM departments WHERE id = :id"), {'id': orig_dept_id}).fetchone()
            if dept_check:
                department_id = orig_dept_id
        
        designation_id = None
        if orig_desig_id:
            desig_check = session.execute(text("SELECT 1 FROM designations WHERE id = :id"), {'id': orig_desig_id}).fetchone()
            if desig_check:
                designation_id = orig_desig_id
        dob = safe_date(row.get('tle_birth_date'))
        join_date = safe_date(row.get('tle_join_date'))
        
        father_fname = safe_str(row.get('tle_father_fname'))
        father_lname = safe_str(row.get('tle_father_lname'))
        father_name = f"{father_fname} {father_lname}".strip() if father_fname else None
        if father_name in ('- -', '- ', 'Late ', 'Late'):
            father_name = None
        
        mother_fname = safe_str(row.get('tle_monther_fname'))
        mother_lname = safe_str(row.get('tle_monther_lname'))
        mother_name = f"{mother_fname} {mother_lname}".strip() if mother_fname else None
        if mother_name in ('- -', '- ', '-'):
            mother_name = None
        
        address = safe_str(row.get('tle_res_address1')) or safe_str(row.get('tle_per_address1'))
        permanent_address = safe_str(row.get('tle_per_address1'))
        phone = safe_str(row.get('tle_mobile_number')) or safe_str(row.get('tle_res_mobile_no'))
        emergency_phone = safe_str(row.get('tle_emergency_number'))
        bank_name = safe_str(row.get('tle_bank_name'))
        bank_account = safe_str(row.get('tle_bank_account'))
        ifsc = safe_str(row.get('tle_bank_ifsc_code'))
        blood_group = safe_str(row.get('tle_bloodgroup'))
        aadhar = safe_str(row.get('tle_aadhar_no'))
        pan = safe_str(row.get('tle_pan_no'))
        user_role = safe_str(row.get('tle_user_role')) or 'employee'
        
        tle_status = safe_str(row.get('tle_status'))
        is_active = safe_str(row.get('tle_is_active'))
        status = 'active'
        if tle_status == 'OFF' or is_active == '0':
            status = 'inactive'
        
        org_id = 1
        
        # Store original department/designation IDs in custom_fields
        custom_fields = {}
        if orig_dept_id:
            custom_fields['original_department_id'] = orig_dept_id
        if orig_desig_id:
            custom_fields['original_designation_id'] = orig_desig_id
        
        import json
        custom_fields_json = json.dumps(custom_fields) if custom_fields else None
        
        try:
            result = session.execute(text("""
                INSERT INTO employees (
                    first_name, last_name, email, employee_code, gender,
                    company_id, base_salary, department_id, designation_id,
                    date_of_birth, join_date, father_name, mother_name,
                    address, permanent_address, phone, emergency_phone,
                    bank_name, bank_account_number, ifsc_code, blood_group,
                    aadhar_number, pan_number, user_role, status, organization_id,
                    custom_fields, created_at, updated_at
                ) VALUES (
                    :first_name, :last_name, :email, :employee_code, :gender,
                    :company_id, :base_salary, :department_id, :designation_id,
                    :dob, :join_date, :father_name, :mother_name,
                    :address, :permanent_address, :phone, :emergency_phone,
                    :bank_name, :bank_account, :ifsc, :blood_group,
                    :aadhar, :pan, :user_role, :status, :org_id,
                    :custom_fields, NOW(), NOW()
                ) ON CONFLICT (email) DO NOTHING
                RETURNING id
            """), {
                'first_name': first_name, 'last_name': last_name, 'email': email,
                'employee_code': employee_code, 'gender': gender,
                'company_id': company_id,
                'base_salary': base_salary, 'department_id': department_id,
                'designation_id': designation_id, 'dob': dob, 'join_date': join_date,
                'father_name': father_name, 'mother_name': mother_name,
                'address': address, 'permanent_address': permanent_address,
                'phone': phone, 'emergency_phone': emergency_phone,
                'bank_name': bank_name, 'bank_account': bank_account,
                'ifsc': ifsc, 'blood_group': blood_group,
                'aadhar': aadhar, 'pan': pan, 'user_role': user_role,
                'status': status, 'org_id': org_id,
                'custom_fields': custom_fields_json
            })
            row_result = result.fetchone()
            if row_result and row_result[0]:
                emp_ids[csv_id] = row_result[0]
            else:
                # Employee with this email already exists, get its id
                existing = session.execute(text("SELECT id FROM employees WHERE email = :email"), {'email': email}).fetchone()
                if existing:
                    emp_ids[csv_id] = existing[0]
            emp_count += 1
            if emp_count % 100 == 0:
                session.commit()
                print(f"  ... {emp_count} employees imported")
        except Exception as e:
            session.rollback()
            if 'duplicate key' in str(e):
                # Skip duplicates
                continue
            print(f"  [ERR] Error importing employee {employee_code}: {e}")
            continue

session.commit()
print(f"  [OK] Imported {emp_count} employees")
print(f"  [OK] Mapped {len(emp_ids)} employee IDs")

# Step 3: Import attendance
print("\n[3/4] Importing attendance records...")
att_count = 0
skipped = 0

with open('employee_attendance_data.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    batch = []
    
    for row in reader:
        csv_emp_id = safe_str(row.get('att_FK_employee_id'))
        if not csv_emp_id or csv_emp_id not in emp_ids:
            skipped += 1
            continue
        
        db_emp_id = emp_ids[csv_emp_id]
        date_val = safe_date(row.get('att_date'))
        check_in = safe_datetime(row.get('att_punch_in_datetime'))
        check_out = safe_datetime(row.get('att_punch_out_datetime'))
        
        check_in_lat = safe_float(row.get('att_punch_in_latitude'))
        check_in_lng = safe_float(row.get('att_punch_in_longitude'))
        check_in_loc = safe_str(row.get('att_punch_in_full_location_address'))
        check_out_lat = safe_float(row.get('att_punch_out_latitude'))
        check_out_lng = safe_float(row.get('att_punch_out_longitude'))
        check_out_loc = safe_str(row.get('att_punch_out_full_location_address'))
        late_minutes = safe_int(row.get('att_late_in_minutes')) or 0
        work_hours = safe_float(row.get('att_working_hours')) or 0
        att_status_raw = safe_str(row.get('att_status')) or 'Present'
        notes = safe_str(row.get('att_note'))
        company_id = safe_int(row.get('att_FK_company_id'))
        branch_id = safe_int(row.get('att_FK_branch_id'))
        
        status_map = {
            'Present': 'present', 'Absent': 'absent', 'Late': 'late',
            'Half Day': 'half_day', 'Week Off': 'absent',
            'Double Present': 'present', 'On Leave': 'on_leave',
        }
        status = status_map.get(att_status_raw, 'present')
        is_late = late_minutes > 0
        
        batch.append({
            'employee_id': db_emp_id, 'organization_id': 1,
            'company_id': company_id, 'branch_id': branch_id,
            'date': date_val, 'check_in': check_in, 'check_out': check_out,
            'status': status, 'work_hours': work_hours,
            'is_late': is_late, 'late_minutes': late_minutes,
            'check_in_latitude': check_in_lat, 'check_in_longitude': check_in_lng,
            'check_in_location_name': check_in_loc,
            'check_out_latitude': check_out_lat, 'check_out_longitude': check_out_lng,
            'check_out_location_name': check_out_loc,
            'notes': notes,
        })
        
        if len(batch) >= 5000:
            try:
                session.execute(text("""
                    INSERT INTO attendances (
                        employee_id, organization_id, company_id, branch_id,
                        date, check_in, check_out, status, work_hours,
                        is_late, late_minutes,
                        check_in_latitude, check_in_longitude, check_in_location_name,
                        check_out_latitude, check_out_longitude, check_out_location_name,
                        notes, created_at, updated_at
                    ) VALUES (
                        :employee_id, :organization_id, :company_id, :branch_id,
                        :date, :check_in, :check_out, :status, :work_hours,
                        :is_late, :late_minutes,
                        :check_in_latitude, :check_in_longitude, :check_in_location_name,
                        :check_out_latitude, :check_out_longitude, :check_out_location_name,
                        :notes, NOW(), NOW()
                    )
                """), batch)
                session.commit()
                att_count += len(batch)
            except:
                session.rollback()
                # Try one by one
                for record in batch:
                    try:
                        session.execute(text("""
                            INSERT INTO attendances (
                                employee_id, organization_id, company_id, branch_id,
                                date, check_in, check_out, status, work_hours,
                                is_late, late_minutes,
                                check_in_latitude, check_in_longitude, check_in_location_name,
                                check_out_latitude, check_out_longitude, check_out_location_name,
                                notes, created_at, updated_at
                            ) VALUES (
                                :employee_id, :organization_id, :company_id, :branch_id,
                                :date, :check_in, :check_out, :status, :work_hours,
                                :is_late, :late_minutes,
                                :check_in_latitude, :check_in_longitude, :check_in_location_name,
                                :check_out_latitude, :check_out_longitude, :check_out_location_name,
                                :notes, NOW(), NOW()
                            )
                        """), record)
                        session.commit()
                        att_count += 1
                    except:
                        session.rollback()
                        skipped += 1
            batch = []
            print(f"  ... {att_count} attendance records imported")
    
    if batch:
        try:
            session.execute(text("""
                INSERT INTO attendances (
                    employee_id, organization_id, company_id, branch_id,
                    date, check_in, check_out, status, work_hours,
                    is_late, late_minutes,
                    check_in_latitude, check_in_longitude, check_in_location_name,
                    check_out_latitude, check_out_longitude, check_out_location_name,
                    notes, created_at, updated_at
                ) VALUES (
                    :employee_id, :organization_id, :company_id, :branch_id,
                    :date, :check_in, :check_out, :status, :work_hours,
                    :is_late, :late_minutes,
                    :check_in_latitude, :check_in_longitude, :check_in_location_name,
                    :check_out_latitude, :check_out_longitude, :check_out_location_name,
                    :notes, NOW(), NOW()
                )
            """), batch)
            session.commit()
            att_count += len(batch)
        except Exception as e:
            session.rollback()
            # If batch fails, try one by one
            for record in batch:
                try:
                    session.execute(text("""
                        INSERT INTO attendances (
                            employee_id, organization_id, company_id, branch_id,
                            date, check_in, check_out, status, work_hours,
                            is_late, late_minutes,
                            check_in_latitude, check_in_longitude, check_in_location_name,
                            check_out_latitude, check_out_longitude, check_out_location_name,
                            notes, created_at, updated_at
                        ) VALUES (
                            :employee_id, :organization_id, :company_id, :branch_id,
                            :date, :check_in, :check_out, :status, :work_hours,
                            :is_late, :late_minutes,
                            :check_in_latitude, :check_in_longitude, :check_in_location_name,
                            :check_out_latitude, :check_out_longitude, :check_out_location_name,
                            :notes, NOW(), NOW()
                        )
                    """), record)
                    session.commit()
                    att_count += 1
                except:
                    session.rollback()
                    skipped += 1

print(f"  [OK] Imported {att_count} attendance records")
print(f"  [WARN] Skipped {skipped} records (employee ID not found)")

# Step 4: Verify
print("\n[4/4] Verifying import...")
emp_final = session.execute(text("SELECT COUNT(*) FROM employees")).scalar()
att_final = session.execute(text("SELECT COUNT(*) FROM attendances")).scalar()
print(f"  [OK] Employees in DB: {emp_final}")
print(f"  [OK] Attendance records in DB: {att_final}")

session.close()
print("\n" + "=" * 60)
print("Import complete!")
print("=" * 60)
