"""Bulk-load 10,000 employees (plus users, attendance, payroll, leaves, expenses)
into the HRMS database to stress-test scale.

Usage:
    set DATABASE_URL=postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev
    venv\Scripts\python.exe seed_large.py
"""
import os
import sys
import random
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

TARGET_EMPLOYEES = 10000

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

from models import Base, User, Employee, Attendance, Payroll, LeaveApplication, LeaveBalance, LeaveType, Expense, Department, Designation, Company, Organization

random.seed(7)

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def main():
    db = SessionLocal()
    try:
        org = db.query(Organization).filter_by(code="ACME").first()
        if not org:
            print("Organization ACME not found. Run seed_full_data.py first.")
            return
        companies = db.query(Company).filter(Company.organization_id == org.id).all()
        departments = db.query(Department).filter(Department.organization_id == org.id).all()
        designations = db.query(Designation).filter(Designation.organization_id == org.id).all()
        leave_types = db.query(LeaveType).filter(LeaveType.organization_id == org.id).all()

        if not companies or not departments or not designations or not leave_types:
            print("Missing master data. Run seed_full_data.py first.")
            return

        existing = db.query(Employee).count()
        # Skip employee codes that already exist (safe re-runs)
        existing_codes = set(x[0] for x in db.execute(text("SELECT employee_code FROM employees WHERE employee_code LIKE 'EMP-%'")).fetchall() if x[0])
        to_add = TARGET_EMPLOYEES - existing
        if to_add <= 0:
            print(f"Already have {existing} employees (>= {TARGET_EMPLOYEES}). Nothing to add.")
            return

        print(f"Existing employees: {existing}. Adding {to_add} ...")

        first_names = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Ananya","Diya","Kavya","Riya",
                       "Ishaan","Rohan","Kabir","Dev","Krishna","Ayaan","Ibrahim","Dhruv","Yash","Pranav",
                       "Meera","Saanvi","Aadhya","Anika","Navya","Ira","Myra","Siya","Jiya","Anvi",
                       "Manav","Advaith","Shaurya","Reyansh","Aarush","Ved","Advik","Aayush","Atharv","Vansh",
                       "Zoya","Aarohi","Prisha","Ishita","Tara","Amara","Kiara","Alia","Ria","Naira"]
        last_names = ["Sharma","Verma","Patel","Reddy","Gupta","Singh","Kumar","Mehta","Iyer","Nair",
                      "Rao","Das","Chowdhury","Bose","Banerjee","Mukherjee","Chatterjee","Ghosh","Dutta","Sen",
                      "Bhatt","Shah","Joshi","Deshpande","Kulkarni","Pillai","Menon","Shetty","Hegde","Kamat",
                      "Malhotra","Kapoor","Chopra","Bansal","Arora","Aggarwal","Kohli","Sethi","Batra","Khanna",
                      "Saxena","Trivedi","Pandey","Tiwari","Mishra","Dubey","Tripathi","Pathak","Shukla","Upadhyay"]
        cities = ["Bengaluru","Mumbai","Delhi","Hyderabad","Pune","Chennai","Kolkata","Ahmedabad","Noida","Gurgaon"]
        blood = ["A+","B+","O+","AB+","A-","B-","O-","AB-"]
        banks = ["HDFC","SBI","ICICI","Axis","Kotak","PNB","Yes Bank","IDFC"]
        salary_pool = [480000,600000,720000,900000,1200000,1500000,1800000,2400000,3000000,4200000]
        today = date.today()

        BATCH = 500
        added = 0
        base_idx = existing  # start id offset for uniqueness

        # Pre-hash one password for all users (bcrypt is slow, reuse the hash)
        pw_hash = hash_password("Employee@123")

        for batch_start in range(0, to_add, BATCH):
            batch_end = min(batch_start + BATCH, to_add)
            users_batch = []
            emps_batch = []
            for i in range(batch_start, batch_end):
                idx = base_idx + i
                code = f"EMP-{idx + 1:05d}"
                if code in existing_codes:
                    continue
                fn = first_names[(idx * 3) % len(first_names)]
                ln = last_names[(idx * 5) % len(last_names)]
                email = f"emp{idx + 1}@hrms.com"
                dept = departments[idx % len(departments)]
                desig = designations[idx % len(designations)]
                comp = companies[idx % len(companies)]
                status = "active" if idx % 13 != 0 else "inactive"

                u = User(email=email, password_hash=pw_hash, full_name=f"{fn} {ln}",
                         role="employee", organization_id=org.id, is_active=True,
                         phone=f"+91 98{(700000000 + idx) % 1000000000:09d}" if idx % 5 else None)
                users_batch.append(u)

                emp = Employee(
                    user_id=u.id, first_name=fn, last_name=ln, email=email,
                    employee_code=code,
                    designation_id=desig.id, designation=desig.title,
                    department_id=dept.id, organization_id=org.id, company_id=comp.id,
                    status=status, onboarding_step="completed",
                    employment_type="full_time" if idx % 4 else "contract",
                    base_salary=salary_pool[idx % len(salary_pool)],
                    join_date=datetime(2020, 1, 1) + timedelta(days=(idx % 1600)),
                    gender=random.choice(["male","female","male","male","female"]),
                    blood_group=random.choice(blood),
                    marital_status=random.choice(["single","married","married","single"]),
                    phone=f"+91-98{7000000 + (idx % 9000000):07d}",
                    current_address=f"{idx % 5000} {cities[idx % len(cities)]}",
                    permanent_address=f"{idx % 5000} {cities[idx % len(cities)]}",
                    date_of_birth=datetime(1985 + (idx % 15), (idx % 12) + 1, (idx % 27) + 1),
                    aadhar_number=f"{random.randint(1000,9999)}{random.randint(1000,9999)}{random.randint(1000,9999)}",
                    pan_number=f"ABCDE{idx % 10}123F",
                    pf_number=f"PF-{random.randint(100000,999999)}",
                    bank_name=random.choice(banks),
                    bank_account_number=str(random.randint(10000000000, 99999999999)),
                    ifsc_code="HDFC0001234",
                    skills="Python, SQL, Communication",
                    language1="English", language2="Hindi",
                )
                emps_batch.append(emp)

            db.add_all(users_batch)
            db.flush()
            # link user_id into employees (already set via u.id above since u.id populated on flush)
            db.add_all(emps_batch)
            db.flush()

            # Attendance: 15 working days x employees (sampled, not full 10000x20 to keep it sane)
            att_records = []
            pay_records = []
            leave_records = []
            bal_records = []
            exp_records = []
            for emp in emps_batch:
                eidx = int(str(emp.employee_code or '').replace('EMP-', '')) - 1
                ecomp = companies[eidx % len(companies)]
                edept = departments[eidx % len(departments)]
                for d_off in range(1, 16):
                    if (eidx % 4 == 0 and d_off > 10):
                        continue
                    ad = today - timedelta(days=d_off)
                    st = random.choice(["present","present","present","late","half_day","absent","work_from_home"])
                    att_records.append(Attendance(
                        employee_id=emp.id, organization_id=org.id, company_id=ecomp.id,
                        department_id=edept.id, date=datetime.combine(ad, datetime.min.time()),
                        check_in=datetime.combine(ad, datetime.min.time().replace(hour=9, minute=random.randint(0,40))),
                        check_out=datetime.combine(ad, datetime.min.time().replace(hour=18, minute=random.randint(0,30))),
                        status=st, work_hours=8.0 if st in ("present","late","work_from_home") else 4.0,
                        scheduled_hours=8.0, is_late=(st=="late"), is_work_from_home=(st=="work_from_home"),
                        device_type=random.choice(["web","mobile","biometric"]),
                        ip_address=f"192.168.{eidx % 255}.{d_off}", sync_status="synced", is_within_geofence=True,
                    ))

                # Payroll: 3 recent months
                for m_off in (3, 2, 1):
                    m = today.month - m_off; y = today.year
                    if m <= 0: m += 12; y -= 1
                    monthly = (emp.base_salary or 480000) / 12
                    basic = monthly * 0.5; hra = monthly * 0.2; gross = basic + hra + 1600 + 1250 + monthly * 0.15
                    pf = min(basic * 0.12, 1800); pt = 200; tds = gross * 0.05
                    ded = pf + pt + tds
                    pay_records.append(Payroll(
                        employee_id=emp.id, month=m, year=y, company_id=ecomp.id,
                        organization_id=org.id, department_id=edept.id,
                        basic_salary=basic, hra=hra, conveyance=1600, medical=1250,
                        special_allowance=monthly*0.15, gross_salary=gross, total_earnings=gross,
                        pf_deduction=pf, professional_tax=pt, tds_deduction=tds,
                        total_deductions=ded, net_salary=gross - ded,
                        working_days=26, present_days=random.randint(20,26), paid_days=26,
                        status=random.choice(["draft","processed","paid","paid"]),
                        payment_method="bank_transfer",
                    ))

                # Leaves
                if eidx % 7 == 0:
                    lt = leave_types[eidx % len(leave_types)]
                    start = today - timedelta(days=random.randint(1, 60))
                    end = start + timedelta(days=random.randint(1, 2))
                    st = random.choice(["approved","pending","rejected"])
                    leave_records.append(LeaveApplication(
                        employee_id=emp.id, leave_type_id=lt.id, organization_id=org.id,
                        company_id=ecomp.id, department_id=edept.id,
                        start_date=datetime.combine(start, datetime.min.time()),
                        end_date=datetime.combine(end, datetime.min.time()),
                        total_days=(end-start).days + 1, reason="Leave", status=st,
                        is_paid=True, request_source="web",
                    ))

                # Leave balance
                for lt in leave_types[:3]:
                    bal_records.append(LeaveBalance(
                        employee_id=emp.id, year=today.year, leave_type_id=lt.id,
                        total_days=lt.days_allowed, used_days=random.randint(0, lt.days_allowed // 2),
                        remaining_days=lt.days_allowed // 2,
                    ))

                # Expense
                if eidx % 3 == 0:
                    exp_records.append(Expense(
                        employee_id=emp.id, category=random.choice(["travel","food","accommodation","office","fuel"]),
                        amount=random.choice([500,1500,2500,5000,12000]), currency="INR",
                        description="Expense claim", expense_date=today - timedelta(days=random.randint(0,90)),
                        status=random.choice(["pending","approved","reimbursed"]),
                        organization_id=org.id, company_id=ecomp.id, department_id=edept.id,
                    ))

            db.bulk_save_objects(att_records)
            db.bulk_save_objects(pay_records)
            db.bulk_save_objects(leave_records)
            db.bulk_save_objects(bal_records)
            db.bulk_save_objects(exp_records)
            db.commit()
            added += len(emps_batch)
            print(f"  Added {len(emps_batch)} employees (total {added}/{to_add})")

        print("\n=== DONE ===")
        for t in ["users","employees","attendances","payrolls","leave_applications","leave_balances","expenses"]:
            try:
                n = db.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
                print(f"  {t}: {n}")
            except Exception as e:
                print(f"  {t}: ERROR {e}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
