"""Seed the HRMS database with comprehensive test data — 100+ rows per table.

Run from the backend directory with the real DATABASE_URL:
    set DATABASE_URL=postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev
    venv\Scripts\python.exe seed_full_data.py

This script clears and repopulates ALL application tables with realistic data so
every module (recruitment, onboarding, attendance, leaves, payroll, expenses,
performance, exits, assets, notifications, etc.) has meaningful records to work
with.
"""
import os
import sys
import uuid
import random
import bcrypt
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

random.seed(42)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev")
ALLOW_SQLITE_FALLBACK = os.getenv("ALLOW_SQLITE_FALLBACK", "true").lower() == "true"
APP_ENV = os.getenv("APP_ENV", "development").lower()

# Ensure the app is NOT pointed at a DB named hrms_test by accident
if "hrms_test" in DATABASE_URL and os.getenv("FORCE_SEED", "0") != "1":
    raise SystemExit("Refusing to seed the test database. Set FORCE_SEED=1 to override.")

try:
    if DATABASE_URL.startswith("sqlite:///"):
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
except Exception as e:
    if ALLOW_SQLITE_FALLBACK and APP_ENV != "production":
        print(f"Warning: DB connection failed ({e}). Falling back to SQLite.")
        sqlite_path = os.path.join(os.path.dirname(__file__), "hrms_dev.db")
        engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})
    else:
        raise

SessionLocal = sessionmaker(bind=engine)

import types
from sqlalchemy.orm import declarative_base

# Fake the database module so models.py can import Base from it.
# Base must be a real declarative_base() so the association tables and
# relationships resolve against a common metadata object.
fake_db = types.ModuleType("database")
fake_db.Base = declarative_base()
fake_db.engine = engine
fake_db.SessionLocal = SessionLocal
fake_db.get_db = lambda: None
sys.modules["database"] = fake_db

from models import Base

from models import (
    User, Organization, Company, Department, Branch, Designation, Employee,
    LeaveType, LeaveBalance, LeaveApplication, LeaveApprovalHistory, Holiday,
    Shift, DutyRoster, Expense, Payroll, Attendance, AttendanceAuditLog,
    JobOpening, Candidate, Interview, PerformanceReview, Goal, Feedback,
    Notification, SalaryTemplate, PayrollPolicy, PayrollComponent,
    StatutorySetting, TaxRegime, TaxSlab, AttendancePolicy, Asset,
    OnboardingTask, AnomalyAlert, ExitRecord, ArchivedEmployee, DeviceBinding,
    DeviceLog, EmployeeLifecycleEvent, AuditLog, ActivityLog, FeatureFlag,
    SystemHealthLog, GlobalSettings, ReportSchedule, ReportExecutionLog,
    ScheduledReport, CustomFieldDefinition, EmployeeTransfer,
)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def seed_anomaly_alerts(session, org, employees, today):
    """Seed realistic anomaly alerts derived from the org's actual data.

    Every alert is generated from real employees, real bank accounts, real
    payroll amounts, and real attendance records so the Anomaly Detection
    page shows meaningful, non-placeholder content.
    """
    from collections import defaultdict
    print("\n=== Anomaly Alerts (realistic, data-derived) ===")
    active = list(employees)
    if not active:
        return

    def aname(e):
        return f"{e.first_name} {e.last_name or ''}".strip()

    now = datetime.utcnow()
    rows = []

    # 1) Buddy punching: pairs of employees at same time/location
    ip_to_emps = defaultdict(set)
    for eid, ip in session.query(Attendance.employee_id, Attendance.ip_address).filter(
        Attendance.organization_id == org.id,
        Attendance.ip_address.isnot(None),
        Attendance.ip_address != "",
    ).all():
        if ip:
            ip_to_emps[ip].add(eid)
    buddy_target = 12
    for ip, emps in ip_to_emps.items():
        if len(emps) < 2 or buddy_target <= 0:
            continue
        emp_objs = [session.get(Employee, eid) for eid in list(emps)[:3]]
        emp_objs = [e for e in emp_objs if e]
        if len(emp_objs) < 2:
            continue
        d = today - timedelta(days=random.randint(0, 6))
        pairs = [
            {"employee1": aname(emp_objs[j]), "employee2": aname(emp_objs[k]),
             "ip": ip, "overlap_minutes": random.randint(1, 2), "occurrences": random.randint(3, 9)}
            for j in range(len(emp_objs)) for k in range(j + 1, len(emp_objs))
        ]
        rows.append(AnomalyAlert(
            organization_id=org.id, anomaly_type="buddy_punching",
            severity=random.choice(["medium", "high", "critical"]),
            title=f"Possible buddy punching: {len(emp_objs)} employees at same time/location",
            description=f"{', '.join(aname(e) for e in emp_objs)} checked in within 2 minutes from nearly identical locations ({ip}) on {d.strftime('%d %b %Y')}.",
            employee_ids=[e.id for e in emp_objs], related_entity_type="attendance",
            evidence_data={"pairs": pairs, "date": d.isoformat()},
            status="open", created_at=now - timedelta(days=random.randint(0, 6)),
        ))
        buddy_target -= 1
    # Fallback pairs if the org has no shared-IP attendance
    while buddy_target > 0 and len(active) >= 2:
        emps = random.sample(active, min(random.randint(2, 3), len(active)))
        ip = f"192.168.{random.randint(1, 254)}.{random.randint(1, 254)}"
        d = today - timedelta(days=random.randint(0, 6))
        pairs = [
            {"employee1": aname(emps[j]), "employee2": aname(emps[k]),
             "ip": ip, "overlap_minutes": random.randint(1, 2), "occurrences": random.randint(3, 9)}
            for j in range(len(emps)) for k in range(j + 1, len(emps))
        ]
        rows.append(AnomalyAlert(
            organization_id=org.id, anomaly_type="buddy_punching",
            severity=random.choice(["medium", "high", "critical"]),
            title=f"Possible buddy punching: {len(emps)} employees at same time/location",
            description=f"{', '.join(aname(e) for e in emps)} checked in within 2 minutes from nearly identical locations ({ip}) on {d.strftime('%d %b %Y')}.",
            employee_ids=[e.id for e in emps], related_entity_type="attendance",
            evidence_data={"pairs": pairs, "date": d.isoformat()},
            status="open", created_at=now - timedelta(days=random.randint(0, 6)),
        ))
        buddy_target -= 1

    # 2) Payroll drift: real net salaries from payroll records
    latest_by_emp = {}
    for pr in session.query(Payroll).filter(
        Payroll.organization_id == org.id, Payroll.net_salary.isnot(None)
    ).all():
        key = pr.employee_id
        if key not in latest_by_emp or (pr.year, pr.month) > (latest_by_emp[key].year, latest_by_emp[key].month):
            latest_by_emp[key] = pr
    pr_list = list(latest_by_emp.values())
    for _ in range(10):
        if not pr_list:
            break
        pr = random.choice(pr_list)
        emp = session.get(Employee, pr.employee_id)
        if not emp:
            continue
        curr = pr.net_salary or 1
        drift = random.randint(22, 55)
        direction = "increased" if random.random() > 0.3 else "decreased"
        prev = curr / (1 + drift / 100) if direction == "increased" else curr * (1 + drift / 100)
        prev_month, prev_year = (12, pr.year - 1) if pr.month == 1 else (pr.month - 1, pr.year)
        rows.append(AnomalyAlert(
            organization_id=org.id, anomaly_type="payroll_drift",
            severity="critical" if drift > 50 else "high" if drift > 30 else "medium",
            title=f"Payroll {direction} by {drift}% - {aname(emp)}",
            description=f"{aname(emp)}'s net pay {direction} from Rs.{prev:,.0f} to Rs.{curr:,.0f} ({drift}% change) between {prev_month}/{prev_year} and {pr.month}/{pr.year}.",
            employee_ids=[emp.id], related_entity_type="payroll", related_entity_id=pr.id,
            evidence_data={
                "drift_percent": drift,
                "current_salary": round(curr),
                "median_salary": round(prev),
                "flags": [f"{drift}% {direction} vs previous month ({prev_month}/{prev_year})"],
            },
            status="open", created_at=now - timedelta(days=random.randint(0, 9)),
        ))

    # 3) Overtime anomalies
    for _ in range(10):
        emp = random.choice(active)
        total_ot = random.randint(45, 80)
        flags = []
        if total_ot > 60:
            flags.append(f"monthly OT ({total_ot}h) exceeds 60h limit")
        if random.random() > 0.5:
            flags.append(f"{random.randint(3, 6)} days with OT > 4h")
        if random.random() > 0.6:
            flags.append(f"{random.randint(5, 8)} consecutive days with OT")
        period = f"{random.randint(1, 12)}/{today.year}"
        rows.append(AnomalyAlert(
            organization_id=org.id, anomaly_type="overtime_anomaly",
            severity="critical" if total_ot > 60 else "high" if total_ot > 50 else "medium",
            title=f"OT anomaly: {aname(emp)} - {flags[0] if flags else 'excessive overtime'}",
            description=f"{aname(emp)} logged {total_ot}h of overtime in {period}. Details: {'; '.join(flags)}.",
            employee_ids=[emp.id], related_entity_type="attendance",
            evidence_data={"flags": flags, "total_ot_hours": total_ot, "period": period},
            status="open", created_at=now - timedelta(days=random.randint(0, 9)),
        ))

    # 4) Duplicate bank accounts (real account numbers)
    banked = [e for e in active if e.bank_account_number]
    for _ in range(8):
        if len(banked) < 2:
            break
        emps = random.sample(banked, min(random.randint(2, 3), len(banked)))
        acct = emps[0].bank_account_number or ""
        ifsc = "HDFC0001234"
        if emps[0].bank_accounts and isinstance(emps[0].bank_accounts, list) and emps[0].bank_accounts:
            ifsc = emps[0].bank_accounts[0].get("ifscCode") or ifsc
        masked = f"{'*' * max(len(acct) - 4, 0)}{acct[-4:]}"
        rows.append(AnomalyAlert(
            organization_id=org.id, anomaly_type="duplicate_bank",
            severity="critical" if len(emps) > 2 else "high",
            title=f"Duplicate bank account: {len(emps)} employees share account {acct[-4:]}",
            description=f"{', '.join(aname(e) for e in emps)} all share the same bank account (****{acct[-4:]}). This could indicate payroll fraud.",
            employee_ids=[e.id for e in emps], related_entity_type="employee",
            evidence_data={"accounts": [{"account_number": masked, "ifsc": ifsc, "employees": [aname(e) for e in emps]}]},
            status="open", created_at=now - timedelta(days=random.randint(0, 9)),
        ))

    # 5) Attendance discrepancies (late / absent / half-day from real records)
    irregular_ids = set(
        r[0] for r in session.query(Attendance.employee_id).filter(
            Attendance.organization_id == org.id,
            Attendance.date >= now - timedelta(days=30),
            Attendance.status.in_(["late", "absent", "half_day"]),
        ).all()
    )
    for _ in range(10):
        if not irregular_ids:
            break
        eid = random.choice(list(irregular_ids))
        emp = session.get(Employee, eid)
        if not emp:
            continue
        late_n = random.randint(2, 6)
        rows.append(AnomalyAlert(
            organization_id=org.id, anomaly_type="attendance_discrepancy",
            severity=random.choice(["medium", "high", "critical"]),
            title=f"Attendance discrepancy: {aname(emp)} - {late_n} irregular entries",
            description=f"{aname(emp)} has {late_n} late/irregular attendance entries this month not matching the assigned shift.",
            employee_ids=[emp.id], related_entity_type="attendance",
            evidence_data={"flags": [f"{late_n} late arrivals this month", "scheduled hours mismatch"], "period": f"{today.month}/{today.year}"},
            status="open", created_at=now - timedelta(days=random.randint(0, 9)),
        ))

    # Resolved / dismissed history so the page shows a realistic mix
    statuses = ["open", "open", "open", "resolved", "resolved", "dismissed"]
    for r in rows:
        r.status = random.choice(statuses)
        if r.status == "resolved":
            r.resolved_at = r.created_at + timedelta(days=random.randint(1, 4))
        elif r.status == "dismissed":
            r.dismissed_at = r.created_at + timedelta(days=random.randint(1, 4))
            r.dismissed_reason = random.choice([
                "Verified legitimate (same family member operating the terminal)",
                "Duplicate of existing alert", "Payroll correction already applied",
                "Manager confirmed the pattern was expected",
            ])

    session.add_all(rows)
    print(f"  Created {len(rows)} realistic anomaly alerts")


def clear_all(session):
    """Drop and recreate all tables in the connected database."""
    print("=== Dropping and recreating all tables ===")
    with engine.connect() as conn:
        conn.execute(text("SET session_replication_role = replica"))
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f'DROP TABLE IF EXISTS "{table.name}" CASCADE'))
        conn.execute(text("SET session_replication_role = DEFAULT"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    print("  All tables recreated.")


def seed():
    session = SessionLocal()
    try:
        clear_all(session)

        now = datetime.utcnow()
        today = date.today()

        # ── Organization ──
        print("\n=== Organization ===")
        org = Organization(
            name="Acme Corp Ltd",
            code="ACME",
            description="Leading technology solutions provider",
            address="123 Business Park, Mumbai, India",
            phone="+91-22-45678900",
            email="info@acmecorp.com",
            website="https://acmecorp.com",
            status="active",
            domain="acmecorp.com",
            industry="Technology",
            company_size="1000-5000",
            default_currency="INR",
            timezone="Asia/Kolkata",
            date_format="YYYY-MM-DD",
            country="India",
            registered_state="Karnataka",
            registered_city="Bengaluru",
        )
        session.add(org)
        session.flush()

        # ── Users (130) ──
        print("\n=== Users (130) ===")
        first_names = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Ananya", "Diya", "Kavya", "Riya",
                       "Ishaan", "Rohan", "Kabir", "Dev", "Krishna", "Ayaan", "Ibrahim", "Dhruv", "Yash", "Pranav",
                       "Meera", "Saanvi", "Aadhya", "Anika", "Navya", "Ira", "Myra", "Siya", "Jiya", "Anvi",
                       "Manav", "Advaith", "Shaurya", "Reyansh", "Aarush", "Ved", "Advik", "Aayush", "Atharv", "Vansh",
                       "Zoya", "Aarohi", "Prisha", "Ishita", "Tara", "Amara", "Kiara", "Alia", "Ria", "Naira"]
        last_names = ["Sharma", "Verma", "Patel", "Reddy", "Gupta", "Singh", "Kumar", "Mehta", "Iyer", "Nair",
                      "Rao", "Das", "Chowdhury", "Bose", "Banerjee", "Mukherjee", "Chatterjee", "Ghosh", "Dutta", "Sen",
                      "Bhatt", "Shah", "Joshi", "Deshpande", "Kulkarni", "Pillai", "Menon", "Shetty", "Hegde", "Kamat",
                      "Malhotra", "Kapoor", "Chopra", "Bansal", "Arora", "Aggarwal", "Kohli", "Sethi", "Batra", "Khanna",
                      "Saxena", "Trivedi", "Pandey", "Tiwari", "Mishra", "Dubey", "Tripathi", "Pathak", "Shukla", "Upadhyay"]

        users = {}
        admin = User(email="admin@hrms.com", password_hash=hash_password("admin123"),
                     full_name="Admin User", role="admin", organization_id=org.id, is_active=True)
        session.add(admin)
        session.flush()
        users["admin@hrms.com"] = admin

        role_cycle = ["employee"] * 90 + ["manager", "hr_executive", "hr_manager", "hr_admin", "finance", "employee"]
        for i in range(130):
            fn = first_names[i % len(first_names)]
            ln = last_names[i % len(last_names)]
            email = f"{fn.lower()}.{ln.lower()}{i}@hrms.com"
            role = role_cycle[i % len(role_cycle)]
            u = User(email=email, password_hash=hash_password("Employee@123"),
                     full_name=f"{fn} {ln}", role=role, organization_id=org.id, is_active=True,
                     phone=f"+91 98{90000000 + i * 37:08d}" if i % 7 else None)
            session.add(u)
            session.flush()
            users[email] = u
        print(f"  Created {len(users)} users")

        # ── Companies (5) ──
        print("\n=== Companies ===")
        companies = []
        for i, (name, code) in enumerate([
            ("Acme India Pvt Ltd", "ACME-IN"),
            ("Acme US Inc", "ACME-US"),
            ("Acme UK Ltd", "ACME-UK"),
            ("Acme Singapore Pte", "ACME-SG"),
            ("Acme Australia Pty", "ACME-AU"),
        ]):
            c = Company(name=name, code=code, organization_id=org.id, industry="Technology",
                        company_size="100-500" if i < 2 else "50-200", status="active",
                        address=f"{i + 10} Business District", email=f"info@{code.lower()}.com",
                        phone=f"+1-555-01{i:02d}", country="India" if i == 0 else "Other")
            session.add(c)
            session.flush()
            companies.append(c)
        print(f"  Created {len(companies)} companies")

        # ── Branches (12) ──
        print("\n=== Branches ===")
        branches = []
        for i, (name, code, loc) in enumerate([
            ("Bengaluru Office", "BLR", "Bengaluru, India"),
            ("Mumbai Office", "BOM", "Mumbai, India"),
            ("Delhi Office", "DEL", "New Delhi, India"),
            ("Hyderabad Office", "HYD", "Hyderabad, India"),
            ("Chennai Office", "MAA", "Chennai, India"),
            ("Pune Office", "PNQ", "Pune, India"),
            ("Kolkata Office", "CCU", "Kolkata, India"),
            ("Ahmedabad Office", "AMD", "Ahmedabad, India"),
            ("New York Office", "NYC", "New York, USA"),
            ("London Office", "LHR", "London, UK"),
            ("Singapore Office", "SIN", "Singapore"),
            ("Sydney Office", "SYD", "Sydney, Australia"),
        ]):
            b = Branch(name=name, code=code, organization_id=org.id,
                       company_id=companies[i % len(companies)].id,
                       location=loc, status="active", geofence_radius=100.0,
                       latitude=12.97 + (i * 0.02), longitude=77.59 + (i * 0.03))
            session.add(b)
            session.flush()
            branches.append(b)
        print(f"  Created {len(branches)} branches")

        # ── Departments (15) ──
        print("\n=== Departments ===")
        departments = []
        for i, name in enumerate(["Engineering", "Product", "Sales", "Marketing", "Human Resources",
                                  "Finance", "Operations", "Customer Success", "Design", "Data Science",
                                  "Quality Assurance", "IT Support", "Legal", "Procurement", "Admin"]):
            d = Department(name=name, code=f"DEPT{i + 1:02d}", organization_id=org.id,
                           company_id=companies[i % len(companies)].id, status="active",
                           description=f"{name} department")
            session.add(d)
            session.flush()
            departments.append(d)
        print(f"  Created {len(departments)} departments")

        # ── Designations (20) ──
        print("\n=== Designations ===")
        designations = []
        for i, (title, grade) in enumerate([
            ("Software Engineer", "Junior"), ("Senior Software Engineer", "Senior"),
            ("Tech Lead", "Lead"), ("Principal Engineer", "Principal"),
            ("Engineering Manager", "Manager"), ("Product Manager", "Manager"),
            ("Sales Executive", "Junior"), ("Sales Manager", "Manager"),
            ("Marketing Executive", "Junior"), ("Marketing Manager", "Manager"),
            ("HR Executive", "Junior"), ("HR Manager", "Manager"),
            ("Finance Executive", "Junior"), ("Finance Manager", "Manager"),
            ("Operations Executive", "Junior"), ("Operations Manager", "Manager"),
            ("Customer Success Manager", "Manager"), ("Data Analyst", "Junior"),
            ("Data Scientist", "Senior"), ("QA Engineer", "Junior"),
        ]):
            desig = Designation(title=title, code=f"DES{i + 1:03d}", grade=grade,
                                organization_id=org.id, company_id=companies[i % len(companies)].id,
                                status="active", min_salary=400000 + i * 50000, max_salary=800000 + i * 100000)
            session.add(desig)
            session.flush()
            designations.append(desig)
        print(f"  Created {len(designations)} designations")

        # ── Employees (120) ──
        print("\n=== Employees (120) ===")
        employees = []
        admin_emp = Employee(
            user_id=admin.id, first_name="Admin", last_name="User", email="admin@hrms.com",
            employee_code="EMP-0001", designation_id=designations[4].id,
            designation="Engineering Manager", department_id=departments[0].id,
            organization_id=org.id, company_id=companies[0].id, status="active",
            employment_type="full_time", base_salary=2400000, join_date=datetime(2020, 1, 15),
            gender="male", blood_group="O+", marital_status="single",
            phone="+91-9876500001", current_address="Bengaluru", permanent_address="Bengaluru",
            date_of_birth=datetime(1992, 5, 12),
        )
        session.add(admin_emp)
        session.flush()
        employees.append(admin_emp)
        admin.employee_id = admin_emp.id

        emp_emails = [e for e in users if e != "admin@hrms.com"]
        for idx, email in enumerate(emp_emails[:120]):
            u = users[email]
            d_idx = idx % len(departments)
            des_idx = idx % len(designations)
            is_active = idx % 13 != 0  # a handful of inactive/onboarding
            if idx % 11 == 0:
                status = "new"          # in onboarding pipeline
                onboarding_step = "in_progress"
            elif is_active:
                status = "active"
                onboarding_step = "completed"
            else:
                status = "inactive"
                onboarding_step = "completed"
            emp = Employee(
                user_id=u.id, first_name=u.full_name.split()[0], last_name=u.full_name.split()[-1],
                email=email, employee_code=f"EMP-{idx + 2:04d}",
                designation_id=designations[des_idx].id, designation=designations[des_idx].title,
                department_id=departments[d_idx].id, organization_id=org.id,
                company_id=companies[d_idx % len(companies)].id,
                status=status, onboarding_step=onboarding_step,
                employment_type=["full_time", "part_time", "contract"][idx % 3],
                base_salary=random.choice([480000, 600000, 720000, 900000, 1200000, 1500000, 1800000, 2400000]),
                join_date=datetime(2023, 1, 1) + timedelta(days=random.randint(0, 900)),
                gender=random.choice(["male", "female", "male", "male", "female"]),
                blood_group=random.choice(["A+", "B+", "O+", "AB+", "A-", "B-", "O-", "AB-"]),
                marital_status=random.choice(["single", "married", "married", "single"]),
                phone=f"+91-98{70000000 + idx * 123:08d}",
                current_address=f"{idx + 1} MG Road, {['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune'][d_idx % 5]}",
                permanent_address=f"{idx + 1} MG Road, {['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune'][d_idx % 5]}",
                date_of_birth=datetime(1985 + (idx % 15), (idx % 12) + 1, (idx % 27) + 1),
                aadhar_number=f"{random.randint(1111, 9999)}{random.randint(1111, 9999)}{random.randint(1111, 9999)}",
                pan_number=f"ABCDE{idx % 10}123F",
                pf_number=f"PF-{random.randint(100000, 999999)}",
                pf_uan=f"{random.randint(1000000000, 9999999999)}",
                esic_number=f"ESIC{random.randint(1000000, 9999999)}",
                father_name=f"{last_names[idx % len(last_names)]} Sr.",
                mother_name="Rekha",
                skills="Python, SQL, Communication, Leadership, React",
                language1="English", language2="Hindi",
                bank_name=random.choice(["HDFC", "SBI", "ICICI", "Axis", "Kotak"]),
                bank_account_number=str(random.randint(10000000000, 99999999999)),
                ifsc_code="HDFC0001234",
                bank_accounts=[{"bankName": "HDFC", "bankAccountNumber": str(random.randint(10000000000, 99999999999)), "ifscCode": "HDFC0001234", "isPrimary": True}],
                salary_components={"basic": "50%", "hra": "20%"},
                education_details=[{"degree": "B.Tech", "institution": "IIT", "year": str(2008 + (idx % 12)), "field": "CS"}],
                experience_details=[{"company": "Prev Corp", "designation": "Associate", "from": "2015", "to": "2018"}],
                achievements_details=[{"title": "Employee of the Month", "date": "2025-01-01"}],
                activities_details=[{"name": "Cricket", "role": "Player"}],
                skills_list=[{"name": "Python", "proficiency": "advanced"}],
                device_type=random.choice(["laptop", "mobile_phone", "tablet", "desktop"]),
                device_ip_address=f"192.168.{idx % 255}.{(idx * 3) % 255}",
                device_mac_address=f"00:1B:44:{(idx % 255):02X}:{(idx % 99):02X}:{(idx % 77):02X}",
                device_serial_number=f"SER{random.randint(100000, 999999)}",
                custom_fields={"resume_summary": "Experienced professional"},
            )
            session.add(emp)
            session.flush()
            employees.append(emp)
            u.employee_id = emp.id
        print(f"  Created {len(employees)} employees")

        # employee_branches / employee_companies mapping
        for emp in employees:
            for b in random.sample(branches, k=1):
                emp.branches.append(b)
            emp.companies.append(companies[emp.id % len(companies)])
        session.flush()

        # ── Master / Config tables ──
        print("\n=== Master data (leave types, holidays, shifts, etc.) ===")
        leave_types = []
        for lt in [
            {"name": "Annual Leave", "code": "ANNUAL", "days": 20, "carry": True},
            {"name": "Sick Leave", "code": "SICK", "days": 12, "carry": False},
            {"name": "Casual Leave", "code": "CASUAL", "days": 10, "carry": False},
            {"name": "Personal Leave", "code": "PERSONAL", "days": 6, "carry": False},
            {"name": "Maternity Leave", "code": "MATERNITY", "days": 180, "carry": False},
            {"name": "Paternity Leave", "code": "PATERNITY", "days": 15, "carry": False},
            {"name": "Bereavement Leave", "code": "BEREAVEMENT", "days": 5, "carry": False},
            {"name": "Compensatory Off", "code": "COMPOFF", "days": 10, "carry": True},
        ]:
            ltype = LeaveType(name=lt["name"], code=lt["code"], days_allowed=lt["days"],
                              carry_forward=lt["carry"], organization_id=org.id, status="active")
            session.add(ltype)
            session.flush()
            leave_types.append(ltype)

        holidays = []
        holiday_names = ["Republic Day", "Holi", "Good Friday", "Independence Day", "Gandhi Jayanti",
                         "Diwali", "Christmas", "Maha Shivaratri", "Eid-ul-Fitr", "Navratri",
                         "Dussehra", "New Year", "Raksha Bandhan", "Janmashtami", "Pongal"]
        for i in range(15):
            h = Holiday(name=holiday_names[i % len(holiday_names)],
                        date=datetime(today.year, (i % 12) + 1, (i % 27) + 1),
                        type=random.choice(["public", "public", "company", "optional"]),
                        organization_id=org.id, company_id=companies[i % len(companies)].id,
                        year=today.year, is_paid=True, duration_days=1, is_recurring=True)
            session.add(h)
            session.flush()
            holidays.append(h)

        shift_objs = []
        for s in [
            {"name": "General Shift", "code": "GEN", "type": "general", "start": "09:00", "end": "18:00", "wd": "1,2,3,4,5"},
            {"name": "Morning Shift", "code": "MORN", "type": "morning", "start": "06:00", "end": "14:00", "wd": "1,2,3,4,5,6"},
            {"name": "Night Shift", "code": "NIGHT", "type": "night", "start": "22:00", "end": "06:00", "wd": "1,2,3,4,5,6,0"},
            {"name": "Evening Shift", "code": "EVE", "type": "evening", "start": "14:00", "end": "22:00", "wd": "1,2,3,4,5,6"},
        ]:
            sh = Shift(name=s["name"], code=s["code"], shift_type=s["type"], start_time=s["start"],
                       end_time=s["end"], grace_minutes=15, break_duration=60, working_days=s["wd"],
                       organization_id=org.id, company_id=companies[0].id, branch_id=branches[0].id,
                       department_id=departments[0].id, status="active", color="#3B82F6")
            session.add(sh)
            session.flush()
            shift_objs.append(sh)

        salary_templates = []
        for i, (name, basic, hra, sa) in enumerate([
            ("Standard Template", 50, 20, 15),
            ("Executive Template", 55, 25, 10),
            ("Entry Level Template", 60, 15, 10),
            ("Contractor Template", 65, 10, 5),
        ]):
            st = SalaryTemplate(name=name, basic_percent=basic, hra_percent=hra,
                                special_allowance_percent=sa, other_allowance_percent=5,
                                organization_id=org.id, status="active")
            session.add(st)
            session.flush()
            salary_templates.append(st)

        attendance_policies = []
        for i, name in enumerate(["Default Attendance Policy", "Flexible Hours Policy", "Strict Timings Policy"]):
            ap = AttendancePolicy(organization_id=org.id, name=name, working_days_per_week=6,
                                  working_days="1,2,3,4,5,6", half_day_as_full_paid=True,
                                  paid_leave_as_present=True, holiday_as_present=True,
                                  overtime_threshold_hours=8.0, overtime_rate=1.5,
                                  late_mark_threshold_minutes=15, status="active")
            session.add(ap)
            session.flush()
            attendance_policies.append(ap)

        payroll_policies = []
        for i, name in enumerate(["Default Payroll Policy", "Executive Policy", "Monthly Policy"]):
            pp = PayrollPolicy(organization_id=org.id, name=name, pro_ration_method="paid_days",
                               rounding_method="nearest", decimal_places=2, round_net_salary=True,
                               include_gratuity=(i == 0), gratuity_rate=4.81,
                               default_currency="INR", allow_negative_net=False, status="active")
            session.add(pp)
            session.flush()
            payroll_policies.append(pp)

        payroll_components = []
        for i, (name, ctype, ctype2, base, val) in enumerate([
            ("Basic", "earning", "percentage", "basic", 100),
            ("HRA", "earning", "percentage", "basic", 40),
            ("Conveyance", "earning", "fixed", None, 1600),
            ("Medical", "earning", "fixed", None, 1250),
            ("Special Allowance", "earning", "percentage", "gross", 15),
            ("PF", "deduction", "percentage", "basic", 12),
            ("ESI", "deduction", "percentage", "gross", 0.75),
            ("Professional Tax", "deduction", "fixed", None, 200),
            ("Income Tax (TDS)", "deduction", "percentage", "gross", 5),
        ]):
            pc = PayrollComponent(organization_id=org.id, payroll_policy_id=payroll_policies[i % len(payroll_policies)].id,
                                  name=name, display_name=name, component_type=ctype,
                                  calculation_type=ctype2, calculation_base=base, calculation_value=val,
                                  is_statutory=name in ("PF", "ESI", "Professional Tax"),
                                  is_active=True, is_system=(i < 6), priority=i, status="active")
            session.add(pc)
            session.flush()
            payroll_components.append(pc)

        statutory = StatutorySetting(
            organization_id=org.id, pf_applicable=True, pf_employee_rate=12.0, pf_employer_rate=12.0,
            pf_max_monthly=1800.0, pf_min_basic_for_exclusion=15000.0,
            esi_applicable=True, esi_employee_rate=0.75, esi_employer_rate=3.25, esi_gross_ceiling=21000.0,
            pt_applicable=True, pt_monthly_amount=200.0, pt_min_gross=10000.0,
            lwf_applicable=False, lwf_employee_rate=0.0, lwf_employer_rate=0.0,
            gratuity_applicable=True, gratuity_rate=4.81, status="active")
        session.add(statutory)

        tax_regimes = []
        for i, name in enumerate(["New Regime", "Old Regime", "Custom Regime"]):
            tr = TaxRegime(organization_id=org.id, name=name, regime_type=["new", "old", "custom"][i],
                           is_active=True, is_default=(i == 0), financial_year="2025-26",
                           standard_deduction=50000, rebate_threshold=700000, rebate_amount=25000,
                           cess_rate=4.0, status="active")
            session.add(tr)
            session.flush()
            for (frm, to, rate) in [(0, 400000, 0), (400000, 800000, 5), (800000, 1200000, 10),
                                    (1200000, 1600000, 15), (1600000, 2000000, 20), (2000000, 2400000, 25),
                                    (2400000, None, 30)]:
                slab = TaxSlab(tax_regime_id=tr.id, from_amount=frm, to_amount=to, rate=rate, sort_order=len(tr.slabs))
                session.add(slab)
            tax_regimes.append(tr)

        session.flush()

        # ── Leave Balances (120+ employees × 5 types) ──
        print("\n=== Leave Balances ===")
        leave_balances = 0
        for emp in employees[:100]:
            for lt in leave_types[:5]:
                total = lt.days_allowed
                used = min(total, (emp.id * 7 + lt.id * 3) % (total + 1))
                session.add(LeaveBalance(employee_id=emp.id, year=today.year, leave_type_id=lt.id,
                                         total_days=total, used_days=used, remaining_days=total - used))
                leave_balances += 1
        print(f"  Created {leave_balances} leave balances")

        # ── Leave Applications (120) ──
        print("\n=== Leave Applications (120) ===")
        leave_statuses = ["pending", "approved", "rejected", "approved", "cancelled", "manager_approved", "approved"]
        for i in range(120):
            emp = employees[i % len(employees)]
            lt = leave_types[i % len(leave_types)]
            start = today - timedelta(days=random.randint(0, 60))
            end = start + timedelta(days=random.randint(1, 3))
            status = leave_statuses[i % len(leave_statuses)]
            la = LeaveApplication(
                employee_id=emp.id, leave_type_id=lt.id, organization_id=org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                start_date=datetime.combine(start, datetime.min.time()),
                end_date=datetime.combine(end, datetime.min.time()),
                total_days=(end - start).days + 1, reason="Leave request",
                purpose=random.choice(["medical", "personal", "family", "vacation", "emergency"]),
                status=status, is_paid=True, is_half_day=(i % 9 == 0), request_source="web",
                balance_deducted=(end - start).days + 1,
                current_approval_level=1, total_approval_levels=2,
                level1_approver_id=admin.id,
            )
            if status == "approved":
                la.level1_approved_at = datetime.utcnow()
                la.approver_id = admin.id
                la.approved_at = datetime.utcnow()
            session.add(la)
            session.flush()
            session.add(LeaveApprovalHistory(leave_application_id=la.id, approver_id=admin.id,
                                             approval_level=1, action=status if status in ("approved", "rejected") else "forwarded",
                                             previous_status="pending", new_status=status))
        print("  Created 120 leave applications")

        # ── Attendance (120 employees × 20 days ≈ 2400) ──
        print("\n=== Attendance (2400 records) ===")
        att_count = 0
        for i in range(120):
            emp = employees[i % len(employees)]
            shift = shift_objs[i % len(shift_objs)]
            workdays = [int(x) for x in str(shift.working_days).split(",") if x.strip().isdigit()]
            for day_offset in range(20, 0, -1):
                ad = today - timedelta(days=day_offset)
                if ad.weekday() not in workdays:
                    continue
                status = random.choice(["present", "present", "present", "late", "half_day", "work_from_home", "absent"])
                check_in = datetime.combine(ad, datetime.min.time().replace(hour=9, minute=random.randint(0, 40)))
                check_out = datetime.combine(ad, datetime.min.time().replace(hour=18, minute=random.randint(0, 30)))
                rec = Attendance(
                    employee_id=emp.id, organization_id=org.id, company_id=emp.company_id,
                    department_id=emp.department_id, shift_id=shift.id,
                    date=check_in, check_in=check_in, check_out=check_out,
                    status=status,
                    work_hours=8.0 if status in ("present", "late", "work_from_home") else 4.0,
                    scheduled_hours=8.0, overtime_hours=0,
                    is_late=(status == "late"), late_minutes=20 if status == "late" else 0,
                    is_early_departure=False, is_work_from_home=(status == "work_from_home"),
                    device_type=random.choice(["web", "mobile", "biometric"]),
                    ip_address=f"192.168.{i % 255}.{day_offset}",
                    sync_status="synced", is_within_geofence=True,
                )
                session.add(rec)
                att_count += 1
        print(f"  Created {att_count} attendance records")

        # ── Expenses (150) ──
        print("\n=== Expenses (150) ===")
        exp_categories = ["travel", "food", "accommodation", "office", "fuel", "training", "software", "client"]
        for i in range(150):
            emp = employees[i % len(employees)]
            exp = Expense(
                employee_id=emp.id, category=exp_categories[i % len(exp_categories)],
                amount=random.choice([500, 1500, 2500, 5000, 8000, 12000, 20000, 45000]),
                currency="INR", description=f"Expense for {exp_categories[i % len(exp_categories)]}",
                expense_date=today - timedelta(days=random.randint(0, 90)),
                status=random.choice(["pending", "approved", "approved", "rejected", "reimbursed"]),
                organization_id=org.id, company_id=emp.company_id, department_id=emp.department_id,
                vendor=f"Vendor {i % 12}", location="Bengaluru", payment_method="card",
                billable=(i % 3 == 0), tax_amount=0, tax_inclusive=False,
            )
            if exp.status in ("approved", "reimbursed"):
                exp.approver_id = admin.id
                exp.approved_at = datetime.utcnow()
            if exp.status == "reimbursed":
                exp.reimbursed_at = datetime.utcnow()
            session.add(exp)
        print("  Created 150 expenses")

        # ── Payroll (120 employees × 6 months) ──
        print("\n=== Payroll (600 records) ===")
        payroll_count = 0
        for i in range(120):
            emp = employees[i % len(employees)]
            for m_off in range(6, 0, -1):
                m = today.month - m_off
                y = today.year
                if m <= 0:
                    m += 12
                    y -= 1
                monthly = (emp.base_salary or 480000) / 12
                basic = monthly * 0.5
                hra = monthly * 0.2
                conveyance = 1600
                medical = 1250
                gross = basic + hra + conveyance + medical + monthly * 0.15
                pf = min(basic * 0.12, 1800)
                pt = 200
                tds = gross * 0.05
                deductions = pf + pt + tds
                status = random.choice(["draft", "pending_approval", "approved", "processed", "paid", "paid"])
                pr = Payroll(
                    employee_id=emp.id, month=m, year=y, company_id=emp.company_id,
                    organization_id=org.id, department_id=emp.department_id,
                    basic_salary=basic, hra=hra, conveyance=conveyance, medical=medical,
                    special_allowance=monthly * 0.15, gross_salary=gross, da=0,
                    total_earnings=gross, pf_deduction=pf, professional_tax=pt,
                    tds_deduction=tds, total_deductions=deductions, net_salary=gross - deductions,
                    working_days=26, present_days=random.randint(20, 26), absent_days=random.randint(0, 3),
                    paid_days=26, status=status, payment_method="bank_transfer",
                    approved_by=admin.id, approved_at=datetime.utcnow() if status not in ("draft", "pending_approval") else None,
                    processed_by=admin.id, processed_at=datetime.utcnow() if status in ("processed", "paid") else None,
                    paid_at=datetime.utcnow() if status == "paid" else None,
                )
                session.add(pr)
                payroll_count += 1
        print(f"  Created {payroll_count} payroll records")

        # ── Recruitment: Job Openings (40) ──
        print("\n=== Job Openings (40) ===")
        job_titles = ["Software Engineer", "Senior Software Engineer", "Product Manager", "Data Scientist",
                      "Sales Executive", "Marketing Manager", "HR Executive", "Finance Analyst",
                      "UI/UX Designer", "QA Engineer", "DevOps Engineer", "Customer Success Manager"]
        job_openings = []
        for i in range(40):
            jo = JobOpening(
                title=job_titles[i % len(job_titles)],
                description="We are looking for a talented professional to join our growing team.",
                requirements="Relevant experience and strong communication skills.",
                location=random.choice(["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Remote"]),
                organization_id=org.id, company_id=companies[i % len(companies)].id,
                department_id=departments[i % len(departments)].id,
                branch_id=branches[i % len(branches)].id,
                employment_type=random.choice(["full-time", "full-time", "contract", "internship"]),
                salary_min=500000, salary_max=2000000, experience_required=f"{i % 6}-{i % 6 + 3} years",
                skills_required="Python, SQL, Communication", vacancy_count=(i % 4) + 1,
                expiry_date=datetime(today.year + 1, today.month, today.day),
                published_date=datetime.utcnow() - timedelta(days=i),
                status=random.choice(["open", "open", "open", "closed", "on_hold", "filled"]),
            )
            session.add(jo)
            session.flush()
            job_openings.append(jo)
        print(f"  Created {len(job_openings)} job openings")

        # ── Candidates (130) ──
        print("\n=== Candidates (130) ===")
        cand_statuses = ["applied", "applied", "shortlisted", "interviewed", "offered", "selected", "rejected", "hired"]
        candidates = []
        for i in range(130):
            fn = first_names[(i + 13) % len(first_names)]
            ln = last_names[(i + 29) % len(last_names)]
            cand = Candidate(
                full_name=f"{fn} {ln}", email=f"cand.{i}.{ln.lower()}@mail.com",
                phone=f"+91-9{800000000 + i * 17:09d}",
                job_opening_id=job_openings[i % len(job_openings)].id,
                company_id=companies[i % len(companies)].id,
                candidate_status=cand_statuses[i % len(cand_statuses)],
                source=random.choice(["linkedin", "naukri", "indeed", "referral", "direct", "monster"]),
                current_company=random.choice(["TCS", "Infosys", "Wipro", "Accenture", "Amazon", "Google"]),
                current_position=job_titles[i % len(job_titles)],
                current_salary=random.choice([400000, 600000, 900000, 1200000, 1500000]),
                expected_salary=random.choice([600000, 900000, 1200000, 1800000, 2400000]),
                notice_period=random.choice(["immediate", "30 days", "60 days", "90 days"]),
                experience_years=random.randint(0, 12),
                education=random.choice(["B.Tech", "M.Tech", "MBA", "B.Com", "MCA"]),
                skills="Python, SQL, Communication",
                applied_date=datetime.utcnow() - timedelta(days=random.randint(0, 120)),
                notes="Strong candidate",
            )
            if cand.candidate_status == "rejected":
                cand.rejected_at = datetime.utcnow()
                cand.rejection_reason = "Skills mismatch"
            session.add(cand)
            session.flush()
            candidates.append(cand)
        print(f"  Created {len(candidates)} candidates")

        # ── Interviews (150) ──
        print("\n=== Interviews (150) ===")
        for i in range(150):
            cand = candidates[i % len(candidates)]
            inv = Interview(
                candidate_id=cand.id, interviewer_id=admin.id, company_id=cand.company_id,
                job_opening_id=cand.job_opening_id,
                interview_type=random.choice(["technical", "hr", "behavioral", "panel", "final"]),
                interview_round=(i % 3) + 1,
                date=datetime.utcnow() + timedelta(days=random.randint(-30, 30)),
                duration_minutes=random.choice([30, 45, 60, 90]),
                location=random.choice(["Bengaluru Office", "Virtual", "Mumbai Office"]),
                meeting_link="https://meet.example.com/xyz",
                status=random.choice(["scheduled", "completed", "completed", "cancelled", "rescheduled"]),
                feedback=random.choice(["Excellent", "Good", "Average", "Needs improvement"]),
                rating=random.randint(2, 5), technical_score=random.randint(4, 10),
                communication_score=random.randint(4, 10), overall_score=random.randint(4, 10),
                interviewer_notes="Looks promising", next_steps="Final round",
            )
            session.add(inv)
        print("  Created 150 interviews")

        # ── Performance Reviews (150) ──
        print("\n=== Performance Reviews (150) ===")
        periods = ["Q1", "Q2", "Q3", "Q4", "Annual"]
        for i in range(150):
            emp = employees[i % len(employees)]
            scores = [random.randint(2, 5) for _ in range(8)]
            avg = round(sum(scores) / len(scores), 2)
            pr = PerformanceReview(
                employee_id=emp.id, reviewer_id=admin.id,
                review_period=periods[i % len(periods)], review_year=today.year,
                review_date=datetime.utcnow() - timedelta(days=random.randint(0, 90)),
                organization_id=org.id, company_id=emp.company_id, department_id=emp.department_id,
                productivity_score=scores[0], quality_score=scores[1], communication_score=scores[2],
                teamwork_score=scores[3], leadership_score=scores[4], initiative_score=scores[5],
                punctuality_score=scores[6], problem_solving_score=scores[7],
                overall_score=avg, rating="Good" if avg >= 3.5 else "Satisfactory",
                goals_set="Complete quarterly deliverables", strengths="Strong technical skills",
                areas_for_improvement="Communication", reviewer_position="Engineering Manager",
                review_cycle="quarterly", promotion_eligible=(avg >= 4),
                salary_recommendation=random.choice(["increase", "no_change", "increase"]),
                status=random.choice(["draft", "submitted", "completed", "acknowledged"]),
                reviewer_comments="Great quarter overall", submitted_at=datetime.utcnow(),
            )
            session.add(pr)
        print("  Created 150 performance reviews")

        # ── Goals (150) ──
        print("\n=== Goals (150) ===")
        for i in range(150):
            emp = employees[i % len(employees)]
            g = Goal(
                employee_id=emp.id, organization_id=org.id, company_id=emp.company_id,
                department_id=emp.department_id,
                title=random.choice(["Complete Project X", "Improve sales by 20%", "Learn New Technology",
                                     "Reduce bugs", "Onboard new clients", "Improve customer satisfaction"]),
                description="A quarterly goal", goal_type=random.choice(["OKR", "KPI", "Milestone", "Development"]),
                category=random.choice(["performance", "learning", "project", "personal"]),
                start_date=datetime.utcnow() - timedelta(days=30),
                target_date=datetime.utcnow() + timedelta(days=60),
                progress=random.randint(0, 100), status=random.choice(["active", "active", "completed", "on_hold"]),
                priority=random.choice(["high", "medium", "low"]), weight=1.0,
                metric_type="percentage", target_value=100, current_value=random.randint(0, 100), unit="%",
            )
            session.add(g)
        print("  Created 150 goals")

        # ── Feedback (150) ──
        print("\n=== Feedback (150) ===")
        for i in range(150):
            emp = employees[i % len(employees)]
            f = Feedback(
                employee_id=emp.id, reviewer_id=admin.id, organization_id=org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                feedback_type=random.choice(["peer", "manager", "self", "subordinate"]),
                feedback_cycle="quarterly", feedback_period=periods[i % len(periods)],
                feedback_year=today.year, relationship_type="peer",
                communication_rating=random.randint(2, 5), teamwork_rating=random.randint(2, 5),
                leadership_rating=random.randint(2, 5), problem_solving_rating=random.randint(2, 5),
                reliability_rating=random.randint(2, 5), adaptability_rating=random.randint(2, 5),
                overall_rating=random.randint(2, 5), strengths="Good team player",
                areas_for_improvement="None", status=random.choice(["draft", "submitted", "acknowledged"]),
                is_anonymous=(i % 5 == 0), submitted_at=datetime.utcnow(),
            )
            session.add(f)
        print("  Created 150 feedback records")

        # ── Notifications (150) ──
        print("\n=== Notifications (150) ===")
        for i in range(150):
            u = list(users.values())[i % len(users)]
            n = Notification(
                user_id=u.id,
                title=random.choice(["Leave Approved", "Expense Reimbursed", "Payslip Ready", "Interview Scheduled",
                                     "Onboarding Task", "Goal Update", "Payroll Processed"]),
                body="You have a new notification from the HRMS system.",
                type=random.choice(["leave", "expense", "payroll", "system", "recruitment"]),
                reference_id=str(i), is_read=(i % 3 != 0), read_at=datetime.utcnow() if i % 3 != 0 else None,
                data={"itemId": i}, created_at=datetime.utcnow() - timedelta(hours=i),
            )
            session.add(n)
        print("  Created 150 notifications")

        # ── Assets (100) ──
        print("\n=== Assets (100) ===")
        for i in range(100):
            emp = employees[i % len(employees)]
            a = Asset(
                employee_id=emp.id, asset_type=random.choice(["laptop", "mobile", "desktop", "monitor", "docking_station"]),
                asset_name=random.choice(["Dell Latitude", "HP EliteBook", "MacBook Pro", "iPhone 15", "Lenovo ThinkPad"]),
                serial_number=f"ASSET-{i + 1:04d}-{uuid.uuid4().hex[:6]}",
                status=random.choice(["assigned", "assigned", "available", "maintenance", "returned"]),
                purchase_date=today - timedelta(days=random.randint(30, 500)),
                issue_date=today - timedelta(days=random.randint(0, 300)),
                value=random.choice([60000, 75000, 90000, 120000, 150000]),
                purchase_value=random.choice([60000, 75000, 90000, 120000, 150000]),
                useful_life_years=3, depreciation_rate=33.33, salvage_value=10000,
                organization_id=org.id, notes="Company asset",
            )
            session.add(a)
        print("  Created 100 assets")

        # ── Onboarding Tasks (150) ──
        print("\n=== Onboarding Tasks (150) ===")
        for i in range(150):
            emp = employees[i % len(employees)]
            t = OnboardingTask(
                employee_id=emp.id,
                title=random.choice(["Collect Aadhaar & PAN copies", "Open salary bank account",
                                     "Generate UAN for EPF", "Register for ESIC", "Provision IT assets",
                                     "Create email & system access"]),
                description="Standard onboarding task", department=random.choice(["HR", "Finance", "IT"]),
                status=random.choice(["pending", "in_progress", "completed"]),
                due_date=datetime.utcnow() + timedelta(days=7),
                completed_at=datetime.utcnow() if i % 3 == 0 else None,
            )
            session.add(t)
        print("  Created 150 onboarding tasks")

        # ── Anomaly Alerts (realistic, data-derived) ──
        seed_anomaly_alerts(session, org, employees, today)

        # ── Exit Records (40) ──
        print("\n=== Exit Records (40) ===")
        exit_records = []
        for i in range(40):
            emp = employees[(i * 3) % len(employees)]
            exit_date = today - timedelta(days=random.randint(10, 200))
            er = ExitRecord(
                employee_id=emp.id, organization_id=org.id,
                exit_type=random.choice(["resigned", "resigned", "terminated", "retired", "absconded"]),
                exit_date=datetime.combine(exit_date, datetime.min.time()),
                last_working_day=datetime.combine(exit_date + timedelta(days=15), datetime.min.time()),
                reason="Personal reasons", notice_period_served=random.choice(["yes", "no", "partial"]),
                handover_completed=random.choice(["yes", "no"]),
                fnf_status=random.choice(["pending", "in_progress", "completed"]),
                clearance_status=random.choice(["pending", "in_progress", "completed"]),
                initiated_by=admin.id, created_at=datetime.utcnow() - timedelta(days=i),
            )
            session.add(er)
            session.flush()
            exit_records.append(er)
        print(f"  Created {len(exit_records)} exit records")

        # ── Archived Employees (30) ──
        print("\n=== Archived Employees (30) ===")
        for i in range(30):
            fn = first_names[(i + 3) % len(first_names)]
            ln = last_names[(i + 7) % len(last_names)]
            ae = ArchivedEmployee(
                original_id=1000 + i, exit_record_id=exit_records[i % len(exit_records)].id,
                organization_id=org.id, company_id=companies[i % len(companies)].id,
                department_id=departments[i % len(departments)].id,
                first_name=fn, last_name=ln, email=f"archived.{i}@hrms.com",
                employee_code=f"ARCH-{i + 1:04d}", phone=f"+91-9{600000000 + i:09d}",
                gender=random.choice(["male", "female"]), designation=job_titles[i % len(job_titles)],
                employment_type="full_time", join_date=datetime(2018, 1, 1),
                exit_type="resigned", exit_date=datetime(2025, 1, 1),
                last_working_day=datetime(2025, 1, 15),
                aadhar_number=str(random.randint(100000000000, 999999999999)),
                pan_number=f"ARCH{i % 10}123F", bank_name="HDFC",
                bank_account_number=str(random.randint(10000000000, 99999999999)),
                archive_date=datetime.utcnow() - timedelta(days=i),
                archived_by=admin.id, fnf_settled_date=datetime.utcnow() - timedelta(days=i),
                archive_reason="Full lifecycle completed",
            )
            session.add(ae)
        print("  Created 30 archived employees")

        # ── Device Bindings (100) ──
        print("\n=== Device Bindings (100) ===")
        for i in range(100):
            u = list(users.values())[i % len(users)]
            db_ = DeviceBinding(
                user_id=u.id, device_fingerprint=f"fp-{uuid.uuid4().hex}",
                device_name=f"{u.full_name}'s Device", device_type=random.choice(["mobile", "desktop", "tablet"]),
                ip_address=f"10.0.{i % 255}.{i % 250}",
                is_active=True, last_used=datetime.utcnow() - timedelta(days=i),
            )
            session.add(db_)
        print("  Created 100 device bindings")

        # ── Device Logs (120) ──
        print("\n=== Device Logs (120) ===")
        for i in range(120):
            emp = employees[i % len(employees)]
            dl = DeviceLog(
                employee_id=emp.id, user_id=emp.user_id, ip_address=f"10.0.{i % 255}.{i % 250}",
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                device_type=random.choice(["mobile", "desktop", "tablet"]),
                device_fingerprint=f"fp-{uuid.uuid4().hex}",
                mac_address=f"00:1B:44:{i % 255:02X}:{i % 99:02X}:{i % 77:02X}",
                serial_number=f"SER{i}", is_authorized=(i % 5 != 0), is_blocked=(i % 17 == 0),
                login_status=random.choice(["success", "success", "failed", "blocked"]),
                location_country="India", location_city="Bengaluru",
                login_time=datetime.utcnow() - timedelta(days=i),
            )
            session.add(dl)
        print("  Created 120 device logs")

        # ── Employee Lifecycle Events (120) ──
        print("\n=== Employee Lifecycle Events (120) ===")
        for i in range(120):
            emp = employees[i % len(employees)]
            el = EmployeeLifecycleEvent(
                employee_id=emp.id,
                event_type=random.choice(["joined", "transfer", "promotion", "termination", "resignation"]),
                event_date=datetime.utcnow() - timedelta(days=random.randint(0, 300)),
                description="Lifecycle event", from_value="Old", to_value="New",
                recorded_by=admin.id,
            )
            session.add(el)
        print("  Created 120 lifecycle events")

        # ── Audit Logs (150) ──
        print("\n=== Audit Logs (150) ===")
        for i in range(150):
            u = list(users.values())[i % len(users)]
            al = AuditLog(
                user_id=u.id, organization_id=org.id, user_name=u.full_name,
                action=random.choice(["create", "update", "delete", "login"]),
                module=random.choice(["employee", "leave", "payroll", "attendance", "expense", "recruitment"]),
                entity_type=random.choice(["employee", "leave", "payroll", "expense"]),
                entity_id=str(i), changes={"seeded": True}, ip_address="10.0.0.1",
                user_agent="Mozilla/5.0", created_at=datetime.utcnow() - timedelta(days=i),
            )
            session.add(al)
        print("  Created 150 audit logs")

        # ── Activity Logs (150) ──
        print("\n=== Activity Logs (150) ===")
        for i in range(150):
            u = list(users.values())[i % len(users)]
            act = ActivityLog(
                user_id=u.id, module=random.choice(["Company", "Employee", "Leave", "Recruitment",
                                                     "MasterData", "Attendance", "Payroll", "Expenses"]),
                action=random.choice(["create", "edit", "delete", "toggle_active"]),
                entity_type=random.choice(["company", "employee", "leave", "job"]),
                entity_id=str(i), entity_name=f"Entity {i}",
                old_value="old", new_value="new", ip_address="10.0.0.1",
                device_info="Chrome", user_agent="Mozilla/5.0",
                created_at=datetime.utcnow() - timedelta(days=i),
            )
            session.add(act)
        print("  Created 150 activity logs")

        # ── Feature Flags (30) ──
        print("\n=== Feature Flags (30) ===")
        for i, flag in enumerate(["payroll_module", "recruitment_module", "attendance_module", "leave_module",
                                  "expense_module", "performance_module", "asset_module", "anomaly_detection",
                                  "self_service", "device_binding", "notifications", "reports",
                                  "bulk_upload", "cv_parser", "ocr_documents", "mobile_app", "multi_company",
                                  "tax_regimes", "state_compliance", "goal_tracking", "feedback_360",
                                  "exit_management", "archive", "custom_fields", "ai_chatbot", "bi_reports",
                                  "salary_templates", "payroll_policies", "shift_management", "duty_roster"]):
            session.add(FeatureFlag(flag=flag, organization_id=org.id, enabled=(i % 5 != 0),
                                    description=f"Feature flag: {flag}"))
        print("  Created 30 feature flags")

        # ── System Health Logs (50) ──
        print("\n=== System Health Logs (50) ===")
        for i in range(50):
            session.add(SystemHealthLog(service=random.choice(["database", "redis", "api"]),
                                        status=random.choice(["healthy", "healthy", "healthy", "degraded"]),
                                        latency_ms=random.randint(5, 200),
                                        organization_id=org.id, created_at=datetime.utcnow() - timedelta(minutes=i)))
        print("  Created 50 system health logs")

        # ── Global Settings ──
        print("\n=== Global Settings ===")
        session.add(GlobalSettings(default_currency="INR", default_timezone="Asia/Kolkata",
                                   default_date_format="YYYY-MM-DD", account_lockout_threshold=5, mfa_enforced=False))

        # ── Report Schedules (40) ──
        print("\n=== Report Schedules (40) ===")
        for i in range(40):
            sid = str(uuid.uuid4())
            rs = ReportSchedule(
                id=sid, report_name=random.choice(["Payroll Summary", "Attendance Report", "Headcount Report",
                                                    "Expense Report", "Leave Report", "Hiring Funnel"]),
                frequency=random.choice(["Daily", "Weekly", "Monthly", "Quarterly"]),
                run_time=datetime.strptime("09:00", "%H:%M").time(),
                day_of_week=random.choice(["Monday", "Friday"]),
                day_of_month="1st", recipients="admin@hrms.com",
                format=random.choice(["PDF", "CSV", "Excel"]),
                email_subject="Scheduled report", include_body=False,
                next_run=datetime.utcnow() + timedelta(days=1),
                enabled=(i % 4 != 0), created_by=admin.id,
            )
            session.add(rs)
            session.flush()
            session.add(ReportExecutionLog(schedule_id=sid, report_name=rs.report_name,
                                           status=random.choice(["success", "failed", "in_progress"]),
                                           format=rs.format, execution_time=datetime.utcnow() - timedelta(days=i),
                                           created_by=admin.id))
        print("  Created 40 report schedules + 40 execution logs")

        # ── Scheduled Reports (30) ──
        print("\n=== Scheduled Reports (30) ===")
        for i in range(30):
            session.add(ScheduledReport(
                organization_id=org.id,
                name=random.choice(["Monthly Payroll", "Quarterly Headcount", "Weekly Attendance", "Expense Summary"]),
                report_type=random.choice(["payroll_summary", "attendance_report", "headcount_report"]),
                frequency=random.choice(["daily", "weekly", "monthly", "quarterly"]),
                recipients=["admin@hrms.com"], format=random.choice(["csv", "pdf"]),
                params={"month": 6, "year": 2026}, is_active=True,
            ))
        print("  Created 30 scheduled reports")

        # ── Custom Field Definitions (30) ──
        print("\n=== Custom Field Definitions (30) ===")
        for i in range(30):
            session.add(CustomFieldDefinition(
                organization_id=org.id, entity_type=random.choice(["employee", "candidate", "job_opening"]),
                field_name=f"custom_field_{i}", field_type=random.choice(["text", "number", "boolean", "date", "dropdown"]),
                label=f"Custom Field {i}", placeholder="Enter value", is_required=(i % 3 == 0),
                default_value="", options=["A", "B", "C"] if i % 5 == 0 else [], display_order=i,
                is_active=True,
            ))
        print("  Created 30 custom field definitions")

        # ── Employee Transfers (60) ──
        print("\n=== Employee Transfers (60) ===")
        for i in range(60):
            emp = employees[i % len(employees)]
            session.add(EmployeeTransfer(
                employee_id=emp.id,
                from_branch_id=branches[i % len(branches)].id,
                to_branch_id=branches[(i + 1) % len(branches)].id,
                from_company_id=companies[i % len(companies)].id,
                to_company_id=companies[(i + 1) % len(companies)].id,
                from_department_id=departments[i % len(departments)].id,
                to_department_id=departments[(i + 1) % len(departments)].id,
                type=random.choice(["temporary", "permanent"]),
                start_date=datetime.utcnow() - timedelta(days=i),
                end_date=datetime.utcnow() + timedelta(days=30) if i % 2 == 0 else None,
                reason="Department restructuring",
                status=random.choice(["approved", "pending", "completed"]),
                requested_by=admin.id, approved_by=admin.id, approved_at=datetime.utcnow(),
            ))
        print("  Created 60 employee transfers")

        # ── Duty Rosters (150) ──
        print("\n=== Duty Rosters (150) ===")
        for i in range(150):
            emp = employees[i % len(employees)]
            session.add(DutyRoster(
                employee_id=emp.id, shift_id=shift_objs[i % len(shift_objs)].id,
                week_start_date=datetime.utcnow() - timedelta(days=7 * (i % 4)),
                day_of_week=i % 7, status=random.choice(["scheduled", "scheduled", "completed", "leave"]),
                assigned_by_id=admin.id, notes="Roster entry",
            ))
        print("  Created 150 duty rosters")

        # ── Attendance Audit Logs (150) ──
        print("\n=== Attendance Audit Logs (150) ===")
        att_ids = session.execute(text("SELECT id FROM attendances LIMIT 150")).fetchall()
        for i in range(150):
            emp = employees[i % len(employees)]
            session.add(AttendanceAuditLog(
                attendance_id=att_ids[i % len(att_ids)][0], employee_id=emp.id,
                action=random.choice(["created", "updated", "approved", "check_in", "check_out"]),
                previous_values={}, new_values={"status": "present"}, changed_fields=["status"],
                action_by=admin.id, action_source="web", ip_address="10.0.0.1",
                user_agent="Mozilla/5.0", created_at=datetime.utcnow() - timedelta(days=i),
            ))
        print("  Created 150 attendance audit logs")

        # ── Annual leave init / commit ──
        session.commit()
        print("\n\n=== SEED COMPLETE ===")

        # Report counts
        print("\n--- Table row counts ---")
        tables = ["organizations", "users", "companies", "branches", "departments", "designations",
                  "employees", "leave_types", "leave_balances", "leave_applications", "leave_approval_history",
                  "holidays", "shifts", "duty_rosters", "expenses", "payrolls", "attendances",
                  "attendance_audit_logs", "job_openings", "candidates", "interviews", "performance_reviews",
                  "goals", "feedback", "notifications", "salary_templates", "payroll_policies",
                  "payroll_components", "statutory_settings", "tax_regimes", "tax_slabs", "attendance_policies",
                  "assets", "onboarding_tasks", "anomaly_alerts", "exit_records", "archived_employees",
                  "device_bindings", "device_logs", "employee_lifecycle_events", "audit_logs", "activity_logs",
                  "feature_flags", "system_health_logs", "global_settings", "report_schedules",
                  "report_execution_logs", "scheduled_reports", "custom_field_definitions", "employee_transfers"]
        for t in tables:
            try:
                n = session.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
                print(f"  {t}: {n}")
            except Exception as e:
                print(f"  {t}: ERROR ({e})")

    except Exception as e:
        session.rollback()
        import traceback
        traceback.print_exc()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed()
