"""Scale ALL remaining HRMS tables to 100K+ rows for reliability testing.

Targets the tables still small after seed_million:
  expenses, leave_applications, candidates, interviews, performance_reviews,
  goals, feedback, notifications, assets, job_openings, duty_rosters,
  employee_lifecycle_events, audit_logs, activity_logs, anomalies.

Usage:
    set DATABASE_URL=postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev
    venv\Scripts\python.exe seed_every_table.py
"""
import os
import sys
import random
import uuid
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

import types
from sqlalchemy.orm import declarative_base
fake_db = types.ModuleType("database")
fake_db.Base = declarative_base()
fake_db.engine = engine
fake_db.SessionLocal = SessionLocal
fake_db.get_db = lambda: None
sys.modules["database"] = fake_db

from models import (
    Base, Organization, Company, Department, Employee, User, LeaveType,
    LeaveApplication, LeaveApprovalHistory, LeaveBalance, Expense, Candidate,
    Interview, PerformanceReview, Goal, Feedback, Notification, Asset,
    JobOpening, DutyRoster, EmployeeLifecycleEvent, AuditLog, ActivityLog,
    AnomalyAlert, OnboardingTask, Shift, Branch, Designation,
)

random.seed(21)
TARGET = 100000


def main():
    db = SessionLocal()
    try:
        org = db.query(Organization).filter_by(code="ACME").first()
        if not org:
            print("Organization ACME not found."); return
        companies = db.query(Company).filter(Company.organization_id == org.id).all()
        departments = db.query(Department).filter(Department.organization_id == org.id).all()
        leave_types = db.query(LeaveType).filter(LeaveType.organization_id == org.id).all()
        shifts = db.query(Shift).filter(Shift.organization_id == org.id).all()
        employees = db.query(Employee).filter(Employee.deleted_at.is_(None)).all()
        users = db.query(User).filter(User.deleted_at.is_(None)).all()
        today = date.today()

        print(f"employees={len(employees)} users={len(users)}")
        e_cycle = lambda i: employees[i % len(employees)]
        c_cycle = lambda i: companies[i % len(companies)]
        d_cycle = lambda i: departments[i % len(departments)]
        BATCH = 20000

        def flush(batch):
            db.bulk_save_objects(batch)
            db.commit()

        # ── Organization structure: 20+ companies, 500+ branches/depts/designations ──
        print("\n=== Organization structure ===")
        # Companies
        comp_count = db.execute(text("SELECT count(*) FROM companies")).scalar()
        print(f"Companies: {comp_count} -> 25")
        new_companies = []
        for i in range(comp_count, 25):
            new_companies.append(Company(
                name=f"Acme Entity {i + 1}", code=f"ENT{i + 1:03d}",
                organization_id=org.id, industry="Technology",
                company_size="100-500", status="active",
                address=f"Building {i + 1}, Business Park",
                email=f"info@entity{i + 1}.com", phone=f"+1-555-0{i:03d}",
            ))
        if new_companies:
            db.add_all(new_companies); db.commit()
        companies = db.query(Company).filter(Company.organization_id == org.id).all()
        print(f"  Companies now: {len(companies)}")

        # Branches
        br_count = db.execute(text("SELECT count(*) FROM branches")).scalar()
        print(f"Branches: {br_count} -> 520")
        batch = []
        cities = ["Bengaluru","Mumbai","Delhi","Hyderabad","Pune","Chennai","Kolkata","Ahmedabad","Noida","Gurgaon",
                  "Jaipur","Lucknow","Indore","Bhopal","Nagpur","Surat","Vadodara","Coimbatore","Kochi","Visakhapatnam"]
        for i in range(br_count, 520):
            batch.append(Branch(
                name=f"{cities[i % len(cities)]} Branch {i + 1}", code=f"BR{i + 1:04d}",
                organization_id=org.id, company_id=companies[i % len(companies)].id,
                location=cities[i % len(cities)], status="active",
                geofence_radius=100.0, latitude=12.9 + (i * 0.01) % 20, longitude=77.5 + (i * 0.01) % 20,
            ))
            if len(batch) >= 200: flush(batch); batch = []
        if batch: flush(batch)
        branches = db.query(Branch).filter(Branch.organization_id == org.id).all()
        print(f"  Branches now: {len(branches)}")

        # Departments
        dep_count = db.execute(text("SELECT count(*) FROM departments")).scalar()
        print(f"Departments: {dep_count} -> 520")
        batch = []
        dept_names = ["Engineering","Product","Sales","Marketing","Human Resources","Finance","Operations",
                      "Customer Success","Design","Data Science","Quality Assurance","IT Support","Legal",
                      "Procurement","Admin","Research","Training","Compliance","Audit","Public Relations",
                      "Logistics","Manufacturing","Retail","Insurance","Banking"]
        for i in range(dep_count, 520):
            batch.append(Department(
                name=f"{dept_names[i % len(dept_names)]} {i + 1}", code=f"DPT{i + 1:04d}",
                organization_id=org.id, company_id=companies[i % len(companies)].id,
                status="active", description=f"{dept_names[i % len(dept_names)]} dept",
            ))
            if len(batch) >= 200: flush(batch); batch = []
        if batch: flush(batch)
        departments = db.query(Department).filter(Department.organization_id == org.id).all()
        print(f"  Departments now: {len(departments)}")

        # Designations
        des_count = db.execute(text("SELECT count(*) FROM designations")).scalar()
        print(f"Designations: {des_count} -> 520")
        batch = []
        titles = ["Software Engineer","Senior Software Engineer","Tech Lead","Principal Engineer",
                  "Engineering Manager","Product Manager","Sales Executive","Sales Manager",
                  "Marketing Executive","Marketing Manager","HR Executive","HR Manager",
                  "Finance Executive","Finance Manager","Operations Executive","Operations Manager",
                  "Data Analyst","Data Scientist","QA Engineer","DevOps Engineer"]
        grades = ["Junior","Senior","Lead","Manager","Principal","Executive"]
        for i in range(des_count, 520):
            batch.append(Designation(
                title=f"{titles[i % len(titles)]} {i + 1}", code=f"DSG{i + 1:04d}",
                grade=grades[i % len(grades)],
                organization_id=org.id, company_id=companies[i % len(companies)].id,
                status="active", min_salary=400000 + i * 1000, max_salary=800000 + i * 2000,
            ))
            if len(batch) >= 200: flush(batch); batch = []
        if batch: flush(batch)
        designations = db.query(Designation).filter(Designation.organization_id == org.id).all()
        print(f"  Designations now: {len(designations)}")

        # ── Expenses → 100K ──
        cur = db.execute(text("SELECT count(*) FROM expenses")).scalar()
        print(f"\nExpenses: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            batch.append(Expense(
                employee_id=emp.id,
                category=random.choice(["travel","food","accommodation","office","fuel","training","software","client"]),
                amount=random.choice([500,1500,2500,5000,8000,12000,20000,45000]),
                currency="INR",
                description=f"Expense {i}",
                expense_date=today - timedelta(days=random.randint(0, 360)),
                status=random.choice(["pending","approved","approved","rejected","reimbursed"]),
                organization_id=emp.organization_id or org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                vendor=f"Vendor {i % 50}", location="Bengaluru",
                payment_method="card", billable=(i % 3 == 0),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Leave Applications → 100K ──
        cur = db.execute(text("SELECT count(*) FROM leave_applications")).scalar()
        print(f"Leave applications: {cur} -> {TARGET}")
        batch = []
        statuses = ["pending","approved","rejected","approved","cancelled","approved"]
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            lt = leave_types[i % len(leave_types)]
            start = today - timedelta(days=random.randint(0, 330))
            end = start + timedelta(days=random.randint(0, 3))
            status = statuses[i % len(statuses)]
            la = LeaveApplication(
                employee_id=emp.id, leave_type_id=lt.id,
                organization_id=emp.organization_id or org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                start_date=datetime.combine(start, datetime.min.time()),
                end_date=datetime.combine(end, datetime.min.time()),
                total_days=max(1, (end - start).days),
                reason="Leave request", purpose=random.choice(["medical","personal","family","vacation","emergency"]),
                status=status, is_paid=True, is_half_day=(i % 9 == 0),
                balance_deducted=max(1, (end - start).days), request_source="web",
            )
            batch.append(la)
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Job Openings → 100K ──
        cur = db.execute(text("SELECT count(*) FROM job_openings")).scalar()
        print(f"Job openings: {cur} -> {TARGET}")
        batch = []
        titles = ["Software Engineer","Senior Software Engineer","Product Manager","Data Scientist",
                  "Sales Executive","Marketing Manager","HR Executive","Finance Analyst",
                  "UI/UX Designer","QA Engineer","DevOps Engineer","Customer Success Manager"]
        for i in range(TARGET - cur):
            batch.append(JobOpening(
                title=titles[i % len(titles)],
                description="Join our growing team", requirements="Relevant experience",
                location=random.choice(["Bengaluru","Mumbai","Delhi","Hyderabad","Pune","Remote"]),
                organization_id=org.id, company_id=c_cycle(i).id,
                department_id=d_cycle(i).id,
                employment_type=random.choice(["full-time","full-time","contract","internship"]),
                salary_min=500000, salary_max=2000000,
                experience_required=f"{i % 8}-{i % 8 + 3} years",
                skills_required="Python, SQL, Communication", vacancy_count=(i % 4) + 1,
                expiry_date=datetime(today.year + 1, today.month, today.day),
                published_date=datetime.utcnow() - timedelta(days=i % 365),
                status=random.choice(["open","open","open","closed","on_hold","filled"]),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Candidates → 100K ──
        cur = db.execute(text("SELECT count(*) FROM candidates")).scalar()
        print(f"Candidates: {cur} -> {TARGET}")
        batch = []
        job_ids = [r[0] for r in db.execute(text("SELECT id FROM job_openings LIMIT 500")).fetchall()] or [1]
        cstatuses = ["applied","applied","shortlisted","interviewed","offered","selected","rejected","hired"]
        for i in range(TARGET - cur):
            batch.append(Candidate(
                full_name=f"Candidate {i} {uuid.uuid4().hex[:4]}",
                email=f"cand.bulk{i}@mail.com",
                phone=f"+91-9{800000000 + i % 100000000:09d}",
                job_opening_id=job_ids[i % len(job_ids)],
                company_id=c_cycle(i).id,
                candidate_status=cstatuses[i % len(cstatuses)],
                source=random.choice(["linkedin","naukri","indeed","referral","direct"]),
                current_company=random.choice(["TCS","Infosys","Wipro","Accenture"]),
                current_position=titles[i % len(titles)],
                current_salary=random.choice([400000,600000,900000,1200000]),
                expected_salary=random.choice([600000,900000,1200000,1800000]),
                notice_period=random.choice(["immediate","30 days","60 days","90 days"]),
                experience_years=random.randint(0, 12),
                education=random.choice(["B.Tech","M.Tech","MBA","B.Com"]),
                skills="Python, SQL",
                applied_date=datetime.utcnow() - timedelta(days=random.randint(0, 360)),
                notes="Bulk candidate",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Interviews → 100K ──
        cur = db.execute(text("SELECT count(*) FROM interviews")).scalar()
        print(f"Interviews: {cur} -> {TARGET}")
        batch = []
        cand_ids = [r[0] for r in db.execute(text("SELECT id FROM candidates LIMIT 2000")).fetchall()] or [1]
        admin_id = users[0].id if users else None
        for i in range(TARGET - cur):
            batch.append(Interview(
                candidate_id=cand_ids[i % len(cand_ids)],
                interviewer_id=admin_id,
                job_opening_id=job_ids[i % len(job_ids)],
                interview_type=random.choice(["technical","hr","behavioral","panel","final"]),
                interview_round=(i % 3) + 1,
                date=datetime.utcnow() + timedelta(days=random.randint(-120, 30)),
                duration_minutes=random.choice([30,45,60,90]),
                location=random.choice(["Bengaluru Office","Virtual"]),
                meeting_link="https://meet.example.com/x",
                status=random.choice(["scheduled","completed","completed","cancelled"]),
                feedback=random.choice(["Excellent","Good","Average"]),
                rating=random.randint(2,5), technical_score=random.randint(4,10),
                communication_score=random.randint(4,10), overall_score=random.randint(4,10),
                interviewer_notes="OK", next_steps="Final round",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Performance Reviews → 100K ──
        cur = db.execute(text("SELECT count(*) FROM performance_reviews")).scalar()
        print(f"Performance reviews: {cur} -> {TARGET}")
        batch = []
        periods = ["Q1","Q2","Q3","Q4","Annual"]
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            scores = [random.randint(2, 5) for _ in range(8)]
            avg = round(sum(scores) / 8, 2)
            batch.append(PerformanceReview(
                employee_id=emp.id, reviewer_id=admin_id,
                review_period=periods[i % len(periods)], review_year=today.year,
                review_date=datetime.utcnow() - timedelta(days=random.randint(0, 300)),
                organization_id=emp.organization_id or org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                productivity_score=scores[0], quality_score=scores[1], communication_score=scores[2],
                teamwork_score=scores[3], leadership_score=scores[4], initiative_score=scores[5],
                punctuality_score=scores[6], problem_solving_score=scores[7],
                overall_score=avg, rating="Good" if avg >= 3.5 else "Satisfactory",
                reviewer_position="Manager", review_cycle="quarterly",
                status=random.choice(["draft","submitted","completed","acknowledged"]),
                reviewer_comments="OK",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Goals → 100K ──
        cur = db.execute(text("SELECT count(*) FROM goals")).scalar()
        print(f"Goals: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            batch.append(Goal(
                employee_id=emp.id,
                organization_id=emp.organization_id or org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                title=random.choice(["Complete Project X","Improve sales","Learn new tech","Reduce bugs"]),
                description="Quarterly goal", goal_type=random.choice(["OKR","KPI","Milestone"]),
                category=random.choice(["performance","learning","project"]),
                start_date=datetime.utcnow() - timedelta(days=30),
                target_date=datetime.utcnow() + timedelta(days=60),
                progress=random.randint(0, 100),
                status=random.choice(["active","active","completed","on_hold"]),
                priority=random.choice(["high","medium","low"]), weight=1.0,
                metric_type="percentage", target_value=100,
                current_value=random.randint(0, 100), unit="%",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Feedback → 100K ──
        cur = db.execute(text("SELECT count(*) FROM feedback")).scalar()
        print(f"Feedback: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            batch.append(Feedback(
                employee_id=emp.id, reviewer_id=admin_id,
                organization_id=emp.organization_id or org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                feedback_type=random.choice(["peer","manager","self","subordinate"]),
                feedback_cycle="quarterly", feedback_period=periods[i % len(periods)],
                feedback_year=today.year, relationship_type="peer",
                communication_rating=random.randint(2,5), teamwork_rating=random.randint(2,5),
                leadership_rating=random.randint(2,5), problem_solving_rating=random.randint(2,5),
                reliability_rating=random.randint(2,5), adaptability_rating=random.randint(2,5),
                overall_rating=random.randint(2,5),
                strengths="Good", areas_for_improvement="None",
                status=random.choice(["draft","submitted","acknowledged"]),
                is_anonymous=(i % 5 == 0),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Notifications → 100K ──
        cur = db.execute(text("SELECT count(*) FROM notifications")).scalar()
        print(f"Notifications: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            u = users[i % len(users)]
            batch.append(Notification(
                user_id=u.id,
                title=random.choice(["Leave Approved","Expense Reimbursed","Payslip Ready","Interview Scheduled"]),
                body="You have a notification", type=random.choice(["leave","expense","payroll","system"]),
                reference_id=str(i), is_read=(i % 3 != 0),
                created_at=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Assets → 100K ──
        cur = db.execute(text("SELECT count(*) FROM assets")).scalar()
        print(f"Assets: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            batch.append(Asset(
                employee_id=emp.id,
                asset_type=random.choice(["laptop","mobile","desktop","monitor","docking_station"]),
                asset_name=random.choice(["Dell Latitude","HP EliteBook","MacBook Pro","iPhone 15","ThinkPad"]),
                serial_number=f"BULK-{i:06d}-{uuid.uuid4().hex[:4]}",
                status=random.choice(["assigned","assigned","available","maintenance"]),
                purchase_date=today - timedelta(days=random.randint(30, 500)),
                issue_date=today - timedelta(days=random.randint(0, 300)),
                value=random.choice([60000,75000,90000,120000]),
                purchase_value=random.choice([60000,75000,90000,120000]),
                useful_life_years=3, depreciation_rate=33.33, salvage_value=10000,
                organization_id=org.id, notes="Bulk asset",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Duty Rosters → 100K ──
        cur = db.execute(text("SELECT count(*) FROM duty_rosters")).scalar()
        print(f"Duty rosters: {cur} -> {TARGET}")
        batch = []
        shift_ids = [r[0] for r in db.execute(text("SELECT id FROM shifts")).fetchall()] or [1]
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            batch.append(DutyRoster(
                employee_id=emp.id, shift_id=shift_ids[i % len(shift_ids)],
                week_start_date=datetime.utcnow() - timedelta(days=7 * (i % 4)),
                day_of_week=i % 7,
                status=random.choice(["scheduled","scheduled","completed","leave"]),
                assigned_by_id=admin_id, notes="Roster",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Employee Lifecycle Events → 100K ──
        cur = db.execute(text("SELECT count(*) FROM employee_lifecycle_events")).scalar()
        print(f"Lifecycle events: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            batch.append(EmployeeLifecycleEvent(
                employee_id=emp.id,
                event_type=random.choice(["joined","transfer","promotion","resignation"]),
                event_date=datetime.utcnow() - timedelta(days=random.randint(0, 360)),
                description="Event", from_value="Old", to_value="New", recorded_by=admin_id,
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Activity Logs → 100K ──
        cur = db.execute(text("SELECT count(*) FROM activity_logs")).scalar()
        print(f"Activity logs: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            u = users[i % len(users)]
            batch.append(ActivityLog(
                user_id=u.id,
                module=random.choice(["Company","Employee","Leave","Recruitment","Payroll","Expenses"]),
                action=random.choice(["create","edit","delete","toggle_active"]),
                entity_type=random.choice(["company","employee","leave","job"]),
                entity_id=str(i), entity_name=f"Entity {i}",
                old_value="old", new_value="new", ip_address="10.0.0.1",
                device_info="Chrome", user_agent="Mozilla/5.0",
                created_at=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Anomaly Alerts → 100K ──
        cur = db.execute(text("SELECT count(*) FROM anomaly_alerts")).scalar()
        print(f"Anomaly alerts: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e_cycle(i)
            batch.append(AnomalyAlert(
                organization_id=org.id,
                anomaly_type=random.choice(["buddy_punching","payroll_drift","overtime_anomaly","attendance_discrepancy"]),
                severity=random.choice(["low","medium","high","critical"]),
                title="Anomaly detected", description="System detected an anomaly",
                employee_ids=[emp.id], related_entity_type="attendance",
                evidence_data={"note": "bulk"}, status=random.choice(["open","open","dismissed","resolved"]),
                created_at=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        print("\n=== FINAL COUNTS ===")
        for t in ["expenses","leave_applications","job_openings","candidates","interviews",
                  "performance_reviews","goals","feedback","notifications","assets","duty_rosters",
                  "employee_lifecycle_events","activity_logs","anomaly_alerts"]:
            n = db.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
            print(f"  {t}: {n}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
