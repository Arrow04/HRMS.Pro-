"""Scale the HRMS database to ~1M total rows for stress testing.

Adds historical attendance (~1M rows) and payroll history (~120K rows)
across the 10,000 existing employees.

Usage:
    set DATABASE_URL=postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev
    venv\Scripts\python.exe seed_million.py
"""
import os
import sys
import random
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

from models import Base, Employee, Attendance, Payroll, Organization, Company, Department

random.seed(11)


def main():
    db = SessionLocal()
    try:
        org = db.query(Organization).filter_by(code="ACME").first()
        if not org:
            print("Organization ACME not found.")
            return
        companies = db.query(Company).filter(Company.organization_id == org.id).all()
        departments = db.query(Department).filter(Department.organization_id == org.id).all()
        today = date.today()

        employees = db.query(Employee).filter(Employee.deleted_at.is_(None)).all()
        print(f"Employees: {len(employees)}")

        # ── 1. Attendance history: ~100 working days per employee (past 140 calendar days) ──
        # Current attendance ~138K. Target ~1M → need ~86 days each on average.
        print("\n=== Building attendance history (~1M rows) ===")
        att_count = 0
        BATCH = 20000
        att_batch = []
        # Determine how many additional days each employee needs
        existing_dates = {}
        # Do a quick check: how many attendance rows exist per employee currently (avg ~14)
        for emp in employees:
            base = emp.id % 3  # stagger start so data spreads across the year
            # 120 working days (~170 calendar days) from the past
            for d_off in range(1, 171):
                ad = today - timedelta(days=d_off + base)
                if ad.weekday() >= 5:  # skip weekends
                    continue
                st = random.choices(
                    ["present", "present", "present", "present", "late", "half_day", "absent", "work_from_home"],
                    weights=[40, 25, 15, 8, 5, 3, 2, 2], k=1
                )[0]
                check_hour = 9 if st != "late" else random.randint(9, 11)
                att_batch.append(Attendance(
                    employee_id=emp.id,
                    organization_id=emp.organization_id or org.id,
                    company_id=emp.company_id or (companies[emp.id % len(companies)].id if companies else None),
                    department_id=emp.department_id or (departments[emp.id % len(departments)].id if departments else None),
                    date=datetime.combine(ad, datetime.min.time()),
                    check_in=datetime.combine(ad, datetime.min.time().replace(hour=check_hour, minute=random.randint(0, 59))),
                    check_out=datetime.combine(ad, datetime.min.time().replace(hour=18, minute=random.randint(0, 40))),
                    status=st,
                    work_hours=8.0 if st in ("present", "late", "work_from_home") else 4.0,
                    scheduled_hours=8.0,
                    is_late=(st == "late"),
                    is_work_from_home=(st == "work_from_home"),
                    device_type=random.choice(["web", "mobile", "biometric"]),
                    ip_address=f"192.168.{emp.id % 255}.{d_off % 250}",
                    sync_status="synced",
                    is_within_geofence=True,
                ))
                att_count += 1
                if len(att_batch) >= BATCH:
                    db.bulk_save_objects(att_batch)
                    db.commit()
                    print(f"  attendance so far: {att_count}")
                    att_batch = []
        if att_batch:
            db.bulk_save_objects(att_batch)
            db.commit()
        print(f"  Total attendance added: {att_count}")

        # ── 2. Payroll history: 12 months per employee (~120K rows) ──
        print("\n=== Building payroll history (~120K rows) ===")
        pay_batch = []
        pay_count = 0
        existing_pay = set(
            (r[0], r[1], r[2]) for r in db.execute(
                text("SELECT employee_id, month, year FROM payrolls")
            ).fetchall()
        )
        for emp in employees:
            for m_off in range(1, 13):
                m = today.month - m_off
                y = today.year
                if m <= 0:
                    m += 12
                    y -= 1
                if (emp.id, m, y) in existing_pay:
                    continue
                monthly = (emp.base_salary or 480000) / 12
                basic = monthly * 0.5
                hra = monthly * 0.2
                gross = basic + hra + 1600 + 1250 + monthly * 0.15
                pf = min(basic * 0.12, 1800)
                pt = 200
                tds = gross * 0.05
                ded = pf + pt + tds
                pay_batch.append(Payroll(
                    employee_id=emp.id, month=m, year=y,
                    company_id=emp.company_id,
                    organization_id=emp.organization_id or org.id,
                    department_id=emp.department_id,
                    basic_salary=basic, hra=hra, conveyance=1600, medical=1250,
                    special_allowance=monthly * 0.15, gross_salary=gross, total_earnings=gross,
                    pf_deduction=pf, professional_tax=pt, tds_deduction=tds,
                    total_deductions=ded, net_salary=gross - ded,
                    working_days=26, present_days=random.randint(20, 26), paid_days=26,
                    status=random.choice(["draft", "processed", "paid", "paid", "approved"]),
                    payment_method="bank_transfer",
                ))
                pay_count += 1
                if len(pay_batch) >= BATCH:
                    db.bulk_save_objects(pay_batch)
                    db.commit()
                    print(f"  payroll so far: {pay_count}")
                    pay_batch = []
        if pay_batch:
            db.bulk_save_objects(pay_batch)
            db.commit()
        print(f"  Total payroll added: {pay_count}")

        print("\n=== FINAL COUNTS ===")
        for t in ["employees", "attendances", "payrolls", "leave_applications", "leave_balances", "expenses", "users"]:
            try:
                n = db.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
                print(f"  {t}: {n}")
            except Exception as e:
                print(f"  {t}: ERROR {e}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
