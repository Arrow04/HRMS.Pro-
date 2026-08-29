"""Seed comprehensive test data - dynamically adapts to existing columns"""
from database import SessionLocal, engine
from sqlalchemy import text
from core.auth import get_password_hash
from datetime import datetime, date, timedelta
import random

db = SessionLocal()

def get_columns(table):
    from sqlalchemy import inspect
    insp = inspect(engine)
    if insp.has_table(table):
        return {c["name"] for c in insp.get_columns(table)}
    return set()

def ins(table, data):
    cols = [k for k in data.keys() if k in get_columns(table)]
    if not cols:
        print(f"  SKIP {table}: no matching columns for {list(data.keys())}")
        return None
    placeholders = {c: data[c] for c in cols}
    col_list = ", ".join(cols)
    val_list = ", ".join(f":{c}" for c in cols)
    r = db.execute(text(f"INSERT INTO {table} ({col_list}) VALUES ({val_list}) RETURNING id"), placeholders)
    db.commit()
    return r.fetchone()[0]

now = datetime.utcnow()
today = date.today()

# --- ORGANIZATION ---
org = db.execute(text("SELECT id FROM organizations LIMIT 1")).first()
if org:
    org_id = org.id
else:
    org_id = ins("organizations", {
        "name": "Test Corp", "code": "TESTCORP", "status": "active",
        "legal_name": "Test Corp Pvt Ltd", "email": "corp@test.com", "phone": "9999999999"
    })
    print(f"Created org {org_id}")

# --- COMPANY ---
company = db.execute(text("SELECT id FROM companies LIMIT 1")).first()
company_id = company.id if company else ins("companies", {
    "name": "Test Company", "code": "TESTCO", "organization_id": org_id, "status": "active"
})
if not company: print(f"Created company {company_id}")

# --- BRANCH ---
branch = db.execute(text("SELECT id FROM branches LIMIT 1")).first()
branch_id = branch.id if branch else ins("branches", {
    "name": "Main Branch", "code": "MAIN", "organization_id": org_id,
    "company_id": company_id, "status": "active"
})
if not branch: print(f"Created branch {branch_id}")

# --- DEPARTMENT ---
dept = db.execute(text("SELECT id FROM departments LIMIT 1")).first()
dept_id = dept.id if dept else ins("departments", {
    "name": "Engineering", "code": "ENG", "organization_id": org_id,
    "company_id": company_id, "status": "active"
})
if not dept: print(f"Created dept {dept_id}")

# --- DESIGNATION ---
desig = db.execute(text("SELECT id FROM designations LIMIT 1")).first()
desig_id = desig.id if desig else ins("designations", {
    "name": "Software Engineer", "title": "Software Engineer", "code": "SE", "organization_id": org_id, "status": "active"
})
if not desig: print(f"Created desig {desig_id}")

# --- SHIFT ---
shift = db.execute(text("SELECT id FROM shifts LIMIT 1")).first()
shift_id = shift.id if shift else ins("shifts", {
    "name": "Day Shift", "start_time": "09:00", "end_time": "18:00",
    "organization_id": org_id, "status": "active"
})
if not shift: print(f"Created shift {shift_id}")

# --- ATTENDANCE POLICY ---
policy = db.execute(text("SELECT id FROM attendance_policies LIMIT 1")).first()
policy_id = policy.id if policy else ins("attendance_policies", {
    "name": "Standard Policy", "organization_id": org_id,
    "work_days_per_week": 5, "weekly_hours": 40, "daily_hours": 8, "is_active": True
})
if not policy: print(f"Created policy {policy_id}")

# --- EMPLOYEE ---
emp = db.execute(text("SELECT id FROM employees LIMIT 1")).first()
user = db.execute(text("SELECT id FROM users WHERE email='admin@example.com'")).first()
if not emp and user:
    emp_id = ins("employees", {
        "user_id": user.id, "first_name": "John", "last_name": "Doe",
        "email": "john.doe@test.com", "employee_code": "EMP-001",
        "organization_id": org_id, "department_id": dept_id,
        "company_id": company_id, "designation_id": desig_id,
        "status": "active", "employment_type": "permanent",
        "phone": "7777777777", "join_date": today - timedelta(days=365),
        "base_salary": 50000
    })
    print(f"Created employee {emp_id}")
    db.execute(text("UPDATE users SET organization_id=:oid WHERE id=:uid"), {"oid": org_id, "uid": user.id})
    db.commit()
elif emp:
    emp_id = emp.id
else:
    emp_id = None

# --- LEAVE TYPES ---
lt_count = db.execute(text("SELECT COUNT(*) FROM leave_types")).scalar()
if lt_count == 0:
    for name, code, days, paid in [
        ("Annual Leave", "annual", 15, True),
        ("Sick Leave", "sick", 12, True),
        ("Personal Leave", "personal", 5, False),
    ]:
        ins("leave_types", {"name": name, "code": code, "organization_id": org_id, "days_per_year": days, "is_paid": paid, "is_active": True})
    print("Created leave types")

# --- HOLIDAYS ---
hol_count = db.execute(text("SELECT COUNT(*) FROM holidays")).scalar()
if hol_count == 0:
    year = today.year
    for name, dt in [
        (f"New Year {year}", f"{year}-01-01"),
        ("Republic Day", f"{year}-01-26"),
        ("Independence Day", f"{year}-08-15"),
        ("Christmas", f"{year}-12-25"),
    ]:
        ins("holidays", {"name": name, "date": dt, "organization_id": org_id, "type": "public", "is_paid": True})
    print("Created holidays")

# --- SAMPLE ATTENDANCE ---
att_cols = get_columns("attendances")
# Derive workdays from the org's default attendance policy or first shift, neutral fallback = all 7 days.
workdays = list(range(7))
try:
    policy_row = db.execute(text(
        "SELECT p.working_days FROM attendance_policies p JOIN organizations o "
        "ON o.default_attendance_policy_id = p.id WHERE o.id = :org_id LIMIT 1"
    ), {"org_id": org_id}).first()
    if policy_row and policy_row[0]:
        workdays = sorted({int(x) for x in str(policy_row[0]).split(",") if str(x).strip().isdigit() and 0 <= int(x) <= 6})
    else:
        shift_row = db.execute(text("SELECT working_days FROM shifts WHERE organization_id = :org_id LIMIT 1"), {"org_id": org_id}).first()
        if shift_row and shift_row[0]:
            workdays = sorted({int(x) for x in str(shift_row[0]).split(",") if str(x).strip().isdigit() and 0 <= int(x) <= 6})
except Exception:
    pass

if emp_id:
    att_count = db.execute(text("SELECT COUNT(*) FROM attendances WHERE employee_id=:eid"), {"eid": emp_id}).scalar()
    if att_count == 0:
        for i in range(1, 31):
            d = today.replace(day=1) - timedelta(days=1) + timedelta(days=i)
            if d >= today:
                break
            if d.weekday() not in workdays:
                continue
            status = "present" if random.random() > 0.2 else random.choice(["absent", "late", "half_day"])
            ci = datetime(d.year, d.month, d.day, random.randint(8, 10), random.randint(0, 59)) if status == "present" else None
            co = datetime(d.year, d.month, d.day, random.randint(17, 19), random.randint(0, 59)) if ci else None
            wh = round((co - ci).total_seconds() / 3600, 2) if ci and co else 0
            att_data = {
                "employee_id": emp_id, "date": d.isoformat(), "status": status,
                "work_hours": wh, "scheduled_hours": 8, "break_hours": 1,
                "is_manual_entry": False, "sync_status": "synced",
                "organization_id": org_id, "department_id": dept_id,
            }
            if ci: att_data["check_in"] = ci
            if co: att_data["check_out"] = co
            ins("attendances", att_data)
        print("Created sample attendance records")

print("\n=== SEED COMPLETE ===")
print(f"  Login: admin@example.com / admin123")

try:
    db.close()
except Exception as exc: pass
