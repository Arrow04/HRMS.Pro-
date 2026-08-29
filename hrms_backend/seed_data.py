import os
import sys
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

# Determine database URL (same logic as database.py)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///hrms_dev.db")
ALLOW_SQLITE_FALLBACK = os.getenv("ALLOW_SQLITE_FALLBACK", "true").lower() == "true"
APP_ENV = os.getenv("APP_ENV", "development").lower()

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

# Fake the database module so models.py can import Base from it
import types
fake_db = types.ModuleType("database")
fake_db.Base = declarative_base()
fake_db.engine = engine
fake_db.SessionLocal = SessionLocal
fake_db.get_db = lambda: None
sys.modules["database"] = fake_db

from models import (
    User, Organization, Company, Department, Branch, Designation, Employee,
    LeaveType, LeaveBalance, LeaveApplication, Holiday, Shift, Expense,
    Payroll, Attendance, JobOpening, Candidate, Interview, PerformanceReview,
    Goal, Notification, SalaryTemplate, ReportExecutionLog, ReportSchedule,
    DutyRoster
)

TABLES_IN_ORDER = [
    "report_execution_logs", "report_schedules", "leave_approval_history",
    "leave_balances", "leave_applications", "attendances", "expenses",
    "payrolls", "duty_rosters", "shifts", "interviews", "candidates",
    "job_openings", "performance_reviews", "goals", "feedback",
    "notifications", "salary_templates", "employee_branches",
    "employee_companies", "employees", "designations", "branches",
    "departments", "companies", "leave_types", "holidays",
    "device_bindings", "users", "organizations"
]

def seed():
    session = SessionLocal()
    try:
        print("=== Clearing existing data ===")
        for table in TABLES_IN_ORDER:
            try:
                session.execute(text(f"DELETE FROM {table}"))
                if "sqlite" in DATABASE_URL:
                    session.execute(text(f"DELETE FROM sqlite_sequence WHERE name='{table}'"))
            except Exception as e:
                print(f"  Skipping {table}: {e}")
        session.commit()

        print("\n=== Seeding Organizations ===")
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
            date_format="YYYY-MM-DD"
        )
        session.add(org)
        session.flush()
        print(f"  Organization: {org.name} (id={org.id})")

        print("\n=== Seeding Users ===")
        users_data = [
            {"email": "admin@hrms.com", "password": "admin123", "full_name": "Admin User", "role": "admin"},
            {"email": "manager@hrms.com", "password": "password123", "full_name": "Priya Sharma", "role": "hr_manager"},
            {"email": "hr@hrms.com", "password": "password123", "full_name": "Rahul Verma", "role": "hr_executive"},
            {"email": "employee1@hrms.com", "password": "password123", "full_name": "Amit Patel", "role": "employee"},
            {"email": "employee2@hrms.com", "password": "password123", "full_name": "Sneha Reddy", "role": "employee"},
            {"email": "finance@hrms.com", "password": "password123", "full_name": "Vikram Joshi", "role": "hr_admin"},
        ]
        users = {}
        for u in users_data:
            user = User(
                email=u["email"],
                password_hash=hash_password(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
                organization_id=org.id,
                is_active=True,
            )
            session.add(user)
            session.flush()
            users[u["email"]] = user
            print(f"  User: {u['email']} ({u['full_name']}) role={u['role']} id={user.id}")

        print("\n=== Seeding Companies ===")
        companies_data = [
            {"name": "Acme India Pvt Ltd", "code": "ACME-IN", "industry": "Technology", "company_size": "500-1000"},
            {"name": "Acme US Inc", "code": "ACME-US", "industry": "Technology", "company_size": "200-500"},
        ]
        companies = []
        for c in companies_data:
            comp = Company(
                name=c["name"], code=c["code"], organization_id=org.id,
                industry=c["industry"], company_size=c["company_size"],
                status="active", address="Business District",
                email=f"info@{c['code'].lower()}.com", phone="+1-555-0100"
            )
            session.add(comp)
            session.flush()
            companies.append(comp)
            print(f"  Company: {comp.name} (id={comp.id})")

        print("\n=== Seeding Branches ===")
        branches_data = [
            {"name": "Bangalore Office", "code": "BLR", "company_id": companies[0].id, "location": "Bangalore, India"},
            {"name": "Mumbai Office", "code": "BOM", "company_id": companies[0].id, "location": "Mumbai, India"},
            {"name": "New York Office", "code": "NYC", "company_id": companies[1].id, "location": "New York, USA"},
            {"name": "San Francisco Office", "code": "SFO", "company_id": companies[1].id, "location": "San Francisco, USA"},
        ]
        branches = []
        for b in branches_data:
            branch = Branch(name=b["name"], code=b["code"], company_id=b["company_id"],
                           organization_id=org.id, location=b["location"], status="active")
            session.add(branch)
            session.flush()
            branches.append(branch)
        print(f"  {len(branches)} branches created")

        print("\n=== Seeding Departments ===")
        dept_data = [
            {"name": "Engineering", "code": "ENG"},
            {"name": "Sales", "code": "SAL"},
            {"name": "Marketing", "code": "MKT"},
            {"name": "Human Resources", "code": "HR"},
            {"name": "Finance", "code": "FIN"},
        ]
        departments = []
        for d in dept_data:
            dept = Department(name=d["name"], code=d["code"], organization_id=org.id,
                             company_id=companies[0].id, status="active")
            session.add(dept)
            session.flush()
            departments.append(dept)
        print(f"  {len(departments)} departments created")

        print("\n=== Seeding Designations ===")
        desig_data = [
            {"title": "Software Engineer", "grade": "Junior", "min_salary": 600000, "max_salary": 1200000},
            {"title": "Senior Software Engineer", "grade": "Senior", "min_salary": 1200000, "max_salary": 2000000},
            {"title": "Tech Lead", "grade": "Lead", "min_salary": 2000000, "max_salary": 3500000},
            {"title": "Sales Manager", "grade": "Manager", "min_salary": 800000, "max_salary": 1500000},
            {"title": "Marketing Manager", "grade": "Manager", "min_salary": 800000, "max_salary": 1500000},
            {"title": "HR Manager", "grade": "Manager", "min_salary": 700000, "max_salary": 1400000},
            {"title": "Finance Manager", "grade": "Manager", "min_salary": 900000, "max_salary": 1800000},
        ]
        designations = []
        for d in desig_data:
            desig = Designation(title=d["title"], grade=d["grade"], organization_id=org.id,
                               company_id=companies[0].id, status="active",
                               min_salary=d["min_salary"], max_salary=d["max_salary"])
            session.add(desig)
            session.flush()
            designations.append(desig)
        print(f"  {len(designations)} designations created")

        print("\n=== Seeding Employees ===")
        emp_data = [
            {"user": users["admin@hrms.com"], "first_name": "Admin", "last_name": "User",
             "desig": designations[2], "dept": departments[0], "company": companies[0], "base": 2500000},
            {"user": users["manager@hrms.com"], "first_name": "Priya", "last_name": "Sharma",
             "desig": designations[3], "dept": departments[3], "company": companies[0], "base": 1200000},
            {"user": users["hr@hrms.com"], "first_name": "Rahul", "last_name": "Verma",
             "desig": designations[5], "dept": departments[3], "company": companies[0], "base": 1100000},
            {"user": users["employee1@hrms.com"], "first_name": "Amit", "last_name": "Patel",
             "desig": designations[0], "dept": departments[0], "company": companies[0], "base": 800000},
            {"user": users["employee2@hrms.com"], "first_name": "Sneha", "last_name": "Reddy",
             "desig": designations[1], "dept": departments[2], "company": companies[0], "base": 1500000},
            {"user": users["finance@hrms.com"], "first_name": "Vikram", "last_name": "Joshi",
             "desig": designations[6], "dept": departments[4], "company": companies[0], "base": 1300000},
        ]
        employees = []
        for em in emp_data:
            emp = Employee(
                user_id=em["user"].id,
                first_name=em["first_name"], last_name=em["last_name"],
                email=em["user"].email,
                employee_code=f"EMP{em['user'].id:03d}",
                designation_id=em["desig"].id,
                department_id=em["dept"].id,
                organization_id=org.id,
                company_id=em["company"].id,
                designation=em["desig"].title,
                status="active",
                employment_type="full_time",
                base_salary=em["base"],
                join_date=datetime(2023, 1, 1),
                phone=f"+91-98765432{em['user'].id:02d}",
            )
            session.add(emp)
            session.flush()
            employees.append(emp)
            em["user"].employee_id = emp.id
        session.flush()
        print(f"  {len(employees)} employees created")

        print("\n=== Seeding Leave Types ===")
        leave_types = [
            {"name": "Annual Leave", "code": "ANNUAL", "days": 20, "carry": True},
            {"name": "Sick Leave", "code": "SICK", "days": 12, "carry": False},
            {"name": "Personal Leave", "code": "PERSONAL", "days": 6, "carry": False},
            {"name": "Maternity Leave", "code": "MATERNITY", "days": 180, "carry": False},
            {"name": "Paternity Leave", "code": "PATERNITY", "days": 15, "carry": False},
        ]
        leave_type_objs = []
        for lt in leave_types:
            ltype = LeaveType(name=lt["name"], code=lt["code"], days_allowed=lt["days"],
                             carry_forward=lt["carry"], organization_id=org.id, status="active")
            session.add(ltype)
            session.flush()
            leave_type_objs.append(ltype)
        print(f"  {len(leave_type_objs)} leave types created")

        print("\n=== Seeding Leave Balances ===")
        for emp in employees:
            for lt in leave_type_objs[:3]:
                total = {"Annual Leave": 20, "Sick Leave": 12, "Personal Leave": 6}[lt.name]
                used = {"Annual Leave": 5, "Sick Leave": 3, "Personal Leave": 1}.get(lt.name, 0)
                bal = LeaveBalance(
                    employee_id=emp.id, year=2026, leave_type_id=lt.id,
                    total_days=total, used_days=used, remaining_days=total - used
                )
                session.add(bal)
        print("  Leave balances created")

        print("\n=== Seeding Leave Applications ===")
        today = date.today()
        leaves = [
            {"emp": employees[3], "type": leave_type_objs[0], "start": today - timedelta(days=10),
             "end": today - timedelta(days=8), "status": "approved", "reason": "Family vacation"},
            {"emp": employees[4], "type": leave_type_objs[1], "start": today - timedelta(days=5),
             "end": today - timedelta(days=4), "status": "pending", "reason": "Not feeling well"},
            {"emp": employees[1], "type": leave_type_objs[2], "start": today + timedelta(days=5),
             "end": today + timedelta(days=6), "status": "pending", "reason": "Personal work"},
            {"emp": employees[5], "type": leave_type_objs[1], "start": today - timedelta(days=20),
             "end": today - timedelta(days=19), "status": "rejected", "reason": "Medical appointment"},
        ]
        for l in leaves:
            la = LeaveApplication(
                employee_id=l["emp"].id, leave_type_id=l["type"].id,
                organization_id=org.id, company_id=companies[0].id,
                department_id=l["emp"].department_id,
                start_date=datetime.combine(l["start"], datetime.min.time()),
                end_date=datetime.combine(l["end"], datetime.min.time()),
                total_days=(l["end"] - l["start"]).days + 1,
                reason=l["reason"], status=l["status"],
                is_paid=True, request_source="web"
            )
            if l["status"] == "approved":
                la.approver_id = users["admin@hrms.com"].id
                la.approved_at = datetime.utcnow()
            session.add(la)
        print("  4 leave applications created")

        print("\n=== Seeding Holidays ===")
        holidays = [
            {"name": "Republic Day", "date": date(2026, 1, 26)},
            {"name": "Holi", "date": date(2026, 3, 14)},
            {"name": "Independence Day", "date": date(2026, 8, 15)},
            {"name": "Diwali", "date": date(2026, 10, 31)},
            {"name": "Christmas", "date": date(2026, 12, 25)},
            {"name": "Good Friday", "date": date(2026, 4, 3)},
        ]
        for h in holidays:
            hol = Holiday(
                name=h["name"], date=datetime.combine(h["date"], datetime.min.time()),
                type="public", organization_id=org.id, company_id=companies[0].id,
                year=2026, is_paid=True, duration_days=1, is_recurring=True
            )
            session.add(hol)
        print(f"  {len(holidays)} holidays created")

        print("\n=== Seeding Shifts ===")
        shifts = [
            {"name": "General Shift", "code": "GEN", "type": "general", "start": "09:00", "end": "18:00", "working_days": "1,2,3,4,5"},
            {"name": "Morning Shift", "code": "MORN", "type": "morning", "start": "06:00", "end": "14:00", "working_days": "1,2,3,4,5,6"},
            {"name": "Night Shift", "code": "NIGHT", "type": "night", "start": "22:00", "end": "06:00", "working_days": "1,2,3,4,5,6,0"},
        ]
        shift_objs = []
        for s in shifts:
            sh = Shift(
                name=s["name"], code=s["code"], shift_type=s["type"],
                start_time=s["start"], end_time=s["end"],
                grace_minutes=15, break_duration=60,
                working_days=s["working_days"],
                organization_id=org.id, company_id=companies[0].id,
                branch_id=branches[0].id, department_id=departments[0].id,
                status="active", color="#3B82F6"
            )
            session.add(sh)
            session.flush()
            shift_objs.append(sh)
        print(f"  {len(shift_objs)} shifts created")

        print("\n=== Seeding Expenses ===")
        for i, emp in enumerate(employees[:4]):
            exp = Expense(
                employee_id=emp.id, category=["travel", "food", "accommodation", "office"][i],
                amount=[15000, 2500, 45000, 8000][i],
                currency="INR",
                description=["Client visit to Delhi", "Team lunch", "Hotel booking for conference", "Stationery purchase"][i],
                expense_date=date.today() - timedelta(days=[15, 10, 7, 3][i]),
                status=["approved", "pending", "approved", "pending"][i],
                organization_id=org.id, company_id=companies[0].id,
                department_id=emp.department_id
            )
            if exp.status == "approved":
                exp.approver_id = users["manager@hrms.com"].id
                exp.approved_at = datetime.utcnow()
            session.add(exp)
        print("  4 expenses created")

        print("\n=== Seeding Payroll ===")
        for i, emp in enumerate(employees[:3]):
            gross = emp.base_salary / 12
            payroll = Payroll(
                employee_id=emp.id, month=6, year=2026,
                company_id=companies[0].id, organization_id=org.id,
                department_id=emp.department_id,
                basic_salary=gross * 0.5, hra=gross * 0.2,
                conveyance=1600, medical=1250, special_allowance=gross * 0.2,
                gross_salary=gross,
                pf_deduction=gross * 0.12, professional_tax=200,
                total_deductions=gross * 0.14,
                net_salary=gross * 0.86,
                working_days=26, present_days=24, absent_days=1, paid_days=25,
                status="processed" if i < 2 else "paid", payment_method="bank_transfer",
                notes="Regular monthly payroll",
            )
            session.add(payroll)
        print("  3 payroll records created")

        print("\n=== Seeding Attendance ===")
        seed_shift = shift_objs[0]
        seed_workdays = [int(x) for x in str(seed_shift.working_days).split(",") if x.strip().isdigit()]
        for day_offset in range(7, 0, -1):
            for emp in employees[:4]:
                att_date = date.today() - timedelta(days=day_offset)
                if att_date.weekday() not in seed_workdays:
                    continue
                att = Attendance(
                    employee_id=emp.id, organization_id=org.id,
                    company_id=companies[0].id, department_id=emp.department_id,
                    shift_id=shift_objs[0].id,
                    date=datetime.combine(att_date, datetime.min.time()),
                    check_in=datetime.combine(att_date, datetime.strptime("09:15", "%H:%M").time()),
                    check_out=datetime.combine(att_date, datetime.strptime("18:30", "%H:%M").time()),
                    status="present", work_hours=8.5, scheduled_hours=8,
                    overtime_hours=0.5, break_hours=1,
                    is_late=att_date.weekday() == 0,
                    late_minutes=15 if att_date.weekday() == 0 else 0,
                    location="Bangalore Office",
                    is_within_geofence=True, device_type="web",
                )
                session.add(att)
        print("  Attendance records created")

        print("\n=== Seeding Job Openings ===")
        jobs = [
            {"title": "Senior Software Engineer", "dept": departments[0], "emp_type": "full-time",
             "min_salary": 1800000, "max_salary": 3000000, "exp": "4-6 years", "vacancy": 2},
            {"title": "Sales Executive", "dept": departments[1], "emp_type": "full-time",
             "min_salary": 500000, "max_salary": 1000000, "exp": "1-3 years", "vacancy": 3},
            {"title": "Marketing Lead", "dept": departments[2], "emp_type": "full-time",
             "min_salary": 1200000, "max_salary": 2000000, "exp": "5-8 years", "vacancy": 1},
        ]
        for j in jobs:
            jo = JobOpening(
                title=j["title"], description=f"We are looking for a {j['title']}",
                requirements=f"Experience: {j['exp']}. Strong relevant skills required.",
                location="Bangalore", organization_id=org.id, company_id=companies[0].id,
                department_id=j["dept"].id, branch_id=branches[0].id,
                employment_type=j["emp_type"], salary_min=j["min_salary"],
                salary_max=j["max_salary"], experience_required=j["exp"],
                vacancy_count=j["vacancy"], status="open",
                skills_required="Python, JavaScript, SQL"
            )
            session.add(jo)
            session.flush()
            print(f"  Job: {jo.title}")

        print("\n=== Seeding Candidates ===")
        all_jobs = session.query(JobOpening).all()
        candidates = [
            {"name": "Arun Kumar", "email": "arun@example.com", "phone": "+91-9876543001", "job": all_jobs[0] if len(all_jobs) > 0 else None},
            {"name": "Neha Gupta", "email": "neha@example.com", "phone": "+91-9876543002", "job": all_jobs[0] if len(all_jobs) > 0 else None},
            {"name": "Ravi Shankar", "email": "ravi@example.com", "phone": "+91-9876543003", "job": all_jobs[1] if len(all_jobs) > 1 else None},
            {"name": "Pooja Mehta", "email": "pooja@example.com", "phone": "+91-9876543004", "job": all_jobs[2] if len(all_jobs) > 2 else None},
            {"name": "Suresh Iyer", "email": "suresh@example.com", "phone": "+91-9876543005", "job": all_jobs[1] if len(all_jobs) > 1 else None},
        ]
        cand_objs = []
        for c in candidates:
            cand = Candidate(
                full_name=c["name"], email=c["email"], phone=c["phone"],
                job_opening_id=c["job"].id if c["job"] else None,
                company_id=companies[0].id,
                candidate_status=["applied", "shortlisted", "interviewed", "applied", "shortlisted"][candidates.index(c)],
                source="LinkedIn", current_company="Tech Corp",
                experience_years=4, skills="Python, React, AWS",
                applied_date=datetime.utcnow() - timedelta(days=10)
            )
            session.add(cand)
            session.flush()
            cand_objs.append(cand)
        print(f"  {len(cand_objs)} candidates created")

        print("\n=== Seeding Interviews ===")
        if len(cand_objs) >= 3 and len(users) >= 1:
            for i, inv in enumerate([
                {"cand": cand_objs[1], "date": today + timedelta(days=2), "type": "technical", "round": 1},
                {"cand": cand_objs[2], "date": today + timedelta(days=3), "type": "hr", "round": 1},
                {"cand": cand_objs[3], "date": today + timedelta(days=5), "type": "technical", "round": 1},
            ]):
                interview = Interview(
                    candidate_id=inv["cand"].id,
                    interviewer_id=users["manager@hrms.com"].id,
                    company_id=companies[0].id,
                    interview_type=inv["type"], interview_round=inv["round"],
                    date=datetime.combine(inv["date"], datetime.strptime("10:00", "%H:%M").time()),
                    duration_minutes=60,
                    location="Bangalore Office - Room 301",
                    meeting_link="https://meet.google.com/abc-defg-hij",
                    status="scheduled"
                )
                session.add(interview)
        print("  Interviews created")

        print("\n=== Seeding Performance Reviews ===")
        for i, emp in enumerate(employees[:3]):
            rev = PerformanceReview(
                employee_id=emp.id, reviewer_id=users["admin@hrms.com"].id,
                review_period="H1 2026", review_year=2026,
                productivity_score=4, quality_score=4, communication_score=4,
                teamwork_score=4, leadership_score=3, initiative_score=4,
                punctuality_score=5, problem_solving_score=4, collaboration_score=4,
                adaptability_score=4, creativity_score=3, attendance_score=5,
                overall_score=[85.0, 70.0, 92.0][i],
                rating=["Good", "Satisfactory", "Excellent"][i],
                strengths=["Technical skills, teamwork", "Communication", "Leadership"][i],
                areas_for_improvement=["Mentoring", "Technical depth", "Delegation"][i],
                status="completed", review_date=datetime(2026, 6, 30),
                organization_id=org.id, company_id=companies[0].id,
                department_id=emp.department_id,
                review_cycle="semi-annual"
            )
            session.add(rev)
        print("  3 performance reviews created")

        print("\n=== Seeding Goals ===")
        for i, emp in enumerate(employees[:3]):
            goal = Goal(
                employee_id=emp.id, title=["Complete Project X", "Improve Test Coverage", "Mentor Jr Developers"][i],
                description=["Deliver the client project on time", "Achieve 90% code coverage", "Guide 2 junior devs"][i],
                goal_type="KPI", category=["performance", "development", "performance"][i],
                target_value=100, current_value=[75, 60, 50][i],
                start_date=datetime(2026, 1, 1), target_date=datetime(2026, 12, 31),
                progress=[75, 60, 50][i],
                status=["on_track", "at_risk", "on_track"][i],
                organization_id=org.id, company_id=companies[0].id,
                department_id=emp.department_id,
                priority="high", unit="%"
            )
            session.add(goal)
        print("  3 goals created")

        print("\n=== Seeding Notifications ===")
        notifications = [
            {"user": users["employee1@hrms.com"], "title": "Leave Approved",
             "body": "Your annual leave has been approved.", "type": "leave"},
            {"user": users["employee2@hrms.com"], "title": "Expense Pending",
             "body": "Your travel expense claim is pending approval.", "type": "expense"},
            {"user": users["manager@hrms.com"], "title": "Payroll Processed",
             "body": "June 2026 payroll has been processed.", "type": "payroll"},
        ]
        for n in notifications:
            notif = Notification(
                user_id=n["user"].id, title=n["title"], body=n["body"],
                type=n["type"], is_read=False
            )
            session.add(notif)
        print(f"  {len(notifications)} notifications created")

        print("\n=== Seeding Salary Templates ===")
        st1 = SalaryTemplate(
            name="Standard Template", basic_percent=50, hra_percent=20,
            special_allowance_percent=20, other_allowance_percent=10,
            organization_id=org.id, status="active"
        )
        st2 = SalaryTemplate(
            name="Executive Template", basic_percent=40, hra_percent=15,
            special_allowance_percent=30, other_allowance_percent=15,
            organization_id=org.id, status="active"
        )
        session.add(st1)
        session.add(st2)
        print("  2 salary templates created")

        print("\n=== Seeding Report Schedules & Execution Logs ===")
        import uuid
        from datetime import time as dttime
        schedule1 = ReportSchedule(
            id=str(uuid.uuid4()), report_name="Employee Overview", frequency="Monthly",
            run_time=dttime(9, 0), day_of_month="1st",
            recipients="admin@hrms.com", format="PDF",
            next_run=datetime.utcnow() + timedelta(days=7), enabled=True,
            created_by=users["admin@hrms.com"].id
        )
        schedule2 = ReportSchedule(
            id=str(uuid.uuid4()), report_name="Payroll Summary", frequency="Monthly",
            run_time=dttime(10, 0), day_of_month="5th",
            recipients="finance@hrms.com", format="CSV",
            next_run=datetime.utcnow() + timedelta(days=10), enabled=True,
            created_by=users["admin@hrms.com"].id
        )
        session.add(schedule1)
        session.add(schedule2)
        session.flush()

        log1 = ReportExecutionLog(
            schedule_id=schedule1.id, report_name="Employee Overview", status="success",
            format="PDF", execution_time=datetime.utcnow() - timedelta(hours=5),
            created_by=users["admin@hrms.com"].id
        )
        log2 = ReportExecutionLog(
            schedule_id=schedule2.id, report_name="Payroll Summary", status="success",
            format="CSV", execution_time=datetime.utcnow() - timedelta(hours=2),
            created_by=users["admin@hrms.com"].id
        )
        session.add(log1)
        session.add(log2)
        print("  2 schedules and 2 execution logs created")

        session.commit()
        print("\n=== SEED COMPLETE ===")
        print("All tables have been populated with test data successfully!")

    except Exception as e:
        session.rollback()
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        session.close()

if __name__ == "__main__":
    seed()
