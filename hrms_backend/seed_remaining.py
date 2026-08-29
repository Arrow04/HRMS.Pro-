"""Scale the remaining small HRMS tables to 100K+ rows each.

Targets tables still small after seed_every_table.py:
  employee_transfers, device_bindings, device_logs, leave_approval_history,
  audit_logs, onboarding_tasks, archived_employees, exit_records,
  custom_field_definitions, holidays, shifts, tax_slabs, tax_regimes,
  attendance_policies, payroll_policies, payroll_components, salary_templates,
  leave_types, feature_flags, scheduled_reports, report_schedules,
  report_execution_logs, system_health_logs, global_settings, statutory_settings.

Usage:
    set DATABASE_URL=postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev
    venv\Scripts\python.exe seed_remaining.py
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
    Base, Organization, Company, Department, Designation, Employee, User, LeaveType,
    LeaveApplication, LeaveApprovalHistory, Holiday, Shift, DutyRoster, Asset,
    OnboardingTask, AnomalyAlert, ExitRecord, ArchivedEmployee, DeviceBinding,
    DeviceLog, EmployeeLifecycleEvent, AuditLog, ActivityLog, FeatureFlag,
    SystemHealthLog, GlobalSettings, ReportSchedule, ReportExecutionLog,
    ScheduledReport, CustomFieldDefinition, EmployeeTransfer, TaxRegime, TaxSlab,
    AttendancePolicy, PayrollPolicy, PayrollComponent, SalaryTemplate,
    StatutorySetting, Branch,
)

random.seed(33)
TARGET = 100000


def main():
    db = SessionLocal()
    try:
        org = db.query(Organization).filter_by(code="ACME").first()
        if not org:
            print("Organization ACME not found."); return
        companies = db.query(Company).filter(Company.organization_id == org.id).all()
        departments = db.query(Department).filter(Department.organization_id == org.id).all()
        branches = db.query(Branch).filter(Branch.organization_id == org.id).all()
        designations = db.query(Designation).filter(Designation.organization_id == org.id).all()
        leave_types = db.query(LeaveType).filter(LeaveType.organization_id == org.id).all()
        shifts = db.query(Shift).filter(Shift.organization_id == org.id).all()
        employees = db.query(Employee).filter(Employee.deleted_at.is_(None)).all()
        users = db.query(User).filter(User.deleted_at.is_(None)).all()
        today = date.today()
        admin_id = users[0].id if users else None

        e = lambda i: employees[i % len(employees)]
        c = lambda i: companies[i % len(companies)]
        d = lambda i: departments[i % len(departments)]
        u = lambda i: users[i % len(users)]
        BATCH = 20000

        def flush(batch):
            db.bulk_save_objects(batch)
            db.commit()

        # ── Employee Transfers → 100K ──
        cur = db.execute(text("SELECT count(*) FROM employee_transfers")).scalar()
        print(f"Employee transfers: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e(i)
            batch.append(EmployeeTransfer(
                employee_id=emp.id,
                from_branch_id=branches[i % len(branches)].id,
                to_branch_id=branches[(i + 1) % len(branches)].id,
                from_company_id=emp.company_id, to_company_id=c(i).id,
                from_department_id=emp.department_id, to_department_id=d(i).id,
                type=random.choice(["temporary", "permanent"]),
                start_date=datetime.utcnow() - timedelta(days=i % 360),
                end_date=datetime.utcnow() + timedelta(days=30) if i % 2 == 0 else None,
                reason="Transfer", status=random.choice(["approved","pending","completed"]),
                requested_by=admin_id, approved_by=admin_id, approved_at=datetime.utcnow(),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Device Bindings → 100K ──
        cur = db.execute(text("SELECT count(*) FROM device_bindings")).scalar()
        print(f"Device bindings: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            usr = u(i)
            batch.append(DeviceBinding(
                user_id=usr.id, device_fingerprint=f"fp-{uuid.uuid4().hex}",
                device_name=f"{usr.full_name}'s Device", device_type=random.choice(["mobile","desktop","tablet"]),
                ip_address=f"10.0.{i % 255}.{i % 250}",
                is_active=(i % 5 != 0), last_used=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Device Logs → 100K ──
        cur = db.execute(text("SELECT count(*) FROM device_logs")).scalar()
        print(f"Device logs: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e(i)
            batch.append(DeviceLog(
                employee_id=emp.id, user_id=emp.user_id or admin_id,
                ip_address=f"10.0.{i % 255}.{i % 250}",
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                device_type=random.choice(["mobile","desktop","tablet"]),
                device_fingerprint=f"fp-{uuid.uuid4().hex}",
                mac_address=f"00:1B:44:{i % 255:02X}:{i % 99:02X}:{i % 77:02X}",
                serial_number=f"SER{i}", is_authorized=(i % 5 != 0), is_blocked=(i % 17 == 0),
                login_status=random.choice(["success","success","failed","blocked"]),
                location_country="India", location_city="Bengaluru",
                login_time=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Leave Approval History → 100K ──
        cur = db.execute(text("SELECT count(*) FROM leave_approval_history")).scalar()
        print(f"Leave approval history: {cur} -> {TARGET}")
        batch = []
        leave_ids = [r[0] for r in db.execute(text("SELECT id FROM leave_applications LIMIT 5000")).fetchall()] or [1]
        for i in range(TARGET - cur):
            batch.append(LeaveApprovalHistory(
                leave_application_id=leave_ids[i % len(leave_ids)],
                approver_id=admin_id, approval_level=(i % 3) + 1,
                action=random.choice(["approved","rejected","forwarded","on_hold"]),
                previous_status="pending", new_status=random.choice(["approved","rejected","pending"]),
                comments="OK", ip_address="10.0.0.1",
                created_at=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Audit Logs → 100K ──
        cur = db.execute(text("SELECT count(*) FROM audit_logs")).scalar()
        print(f"Audit logs: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            usr = u(i)
            batch.append(AuditLog(
                user_id=usr.id, organization_id=org.id, user_name=usr.full_name,
                action=random.choice(["create","update","delete","login"]),
                module=random.choice(["employee","leave","payroll","attendance","expense"]),
                entity_type=random.choice(["employee","leave","payroll","expense"]),
                entity_id=str(i), changes={"seeded": True}, ip_address="10.0.0.1",
                user_agent="Mozilla/5.0", created_at=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Onboarding Tasks → 100K ──
        cur = db.execute(text("SELECT count(*) FROM onboarding_tasks")).scalar()
        print(f"Onboarding tasks: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e(i)
            batch.append(OnboardingTask(
                employee_id=emp.id,
                title=random.choice(["Collect Aadhaar & PAN","Open bank account","Generate UAN","Register ESIC","Provision IT assets"]),
                description="Onboarding task", department=random.choice(["HR","Finance","IT"]),
                status=random.choice(["pending","in_progress","completed"]),
                due_date=datetime.utcnow() + timedelta(days=7),
                completed_at=datetime.utcnow() if i % 3 == 0 else None,
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Exit Records → 100K ──
        cur = db.execute(text("SELECT count(*) FROM exit_records")).scalar()
        print(f"Exit records: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e(i)
            exd = today - timedelta(days=random.randint(10, 360))
            batch.append(ExitRecord(
                employee_id=emp.id, organization_id=org.id,
                exit_type=random.choice(["resigned","resigned","terminated","retired","absconded"]),
                exit_date=datetime.combine(exd, datetime.min.time()),
                last_working_day=datetime.combine(exd + timedelta(days=15), datetime.min.time()),
                reason="Personal reasons", notice_period_served=random.choice(["yes","no","partial"]),
                handover_completed=random.choice(["yes","no"]),
                fnf_status=random.choice(["pending","in_progress","completed"]),
                clearance_status=random.choice(["pending","in_progress","completed"]),
                initiated_by=admin_id, created_at=datetime.utcnow() - timedelta(hours=i % 7200),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Archived Employees → 100K ──
        cur = db.execute(text("SELECT count(*) FROM archived_employees")).scalar()
        print(f"Archived employees: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            emp = e(i)
            exd = today - timedelta(days=random.randint(10, 360))
            batch.append(ArchivedEmployee(
                original_id=emp.id, organization_id=org.id,
                company_id=emp.company_id, department_id=emp.department_id,
                first_name=emp.first_name, last_name=emp.last_name,
                email=f"arch.{i}@hrms.com", employee_code=emp.employee_code,
                phone=emp.phone, gender=emp.gender,
                designation=emp.designation, employment_type=emp.employment_type,
                join_date=emp.join_date, exit_type="resigned",
                exit_date=datetime.combine(exd, datetime.min.time()),
                last_working_day=datetime.combine(exd + timedelta(days=15), datetime.min.time()),
                bank_name="HDFC", bank_account_number=str(random.randint(10000000000, 99999999999)),
                archive_date=datetime.utcnow() - timedelta(hours=i % 7200),
                archived_by=admin_id, fnf_settled_date=datetime.utcnow(),
                archive_reason="Lifecycle complete",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Custom Field Definitions → 100K ──
        cur = db.execute(text("SELECT count(*) FROM custom_field_definitions")).scalar()
        print(f"Custom field definitions: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(CustomFieldDefinition(
                organization_id=org.id, entity_type=random.choice(["employee","candidate","job_opening"]),
                field_name=f"custom_{i}", field_type=random.choice(["text","number","boolean","date","dropdown"]),
                label=f"Custom Field {i}", placeholder="Enter value",
                is_required=(i % 3 == 0), options=["A","B"] if i % 5 == 0 else [],
                display_order=i % 100, is_active=True,
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Holidays → 100K ──
        cur = db.execute(text("SELECT count(*) FROM holidays")).scalar()
        print(f"Holidays: {cur} -> {TARGET}")
        batch = []
        names = ["Republic Day","Holi","Good Friday","Independence Day","Gandhi Jayanti","Diwali","Christmas","New Year","Eid","Pongal"]
        for i in range(TARGET - cur):
            batch.append(Holiday(
                name=f"{names[i % len(names)]} {i}", date=datetime(today.year, (i % 12) + 1, (i % 27) + 1),
                type=random.choice(["public","public","company","optional"]),
                organization_id=org.id, company_id=c(i).id, year=today.year,
                is_paid=True, duration_days=1, is_recurring=(i % 3 == 0),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Shifts → 100K ──
        cur = db.execute(text("SELECT count(*) FROM shifts")).scalar()
        print(f"Shifts: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(Shift(
                name=f"Shift {i}", code=f"SH{i:06d}",
                shift_type=random.choice(["morning","evening","night","general"]),
                start_time=f"{random.randint(0,6):02d}:00", end_time=f"{random.randint(14,22):02d}:00",
                grace_minutes=15, break_duration=60, working_days="1,2,3,4,5,6",
                color="#3B82F6", description="Shift",
                organization_id=org.id, company_id=c(i).id,
                branch_id=branches[i % len(branches)].id, department_id=d(i).id,
                status="active",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Tax Regimes + Slabs → 100K ──
        cur = db.execute(text("SELECT count(*) FROM tax_regimes")).scalar()
        print(f"Tax regimes: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(TaxRegime(
                organization_id=org.id, name=f"Regime {i}",
                regime_type=random.choice(["new","old","custom"]),
                is_active=True, is_default=False, financial_year="2025-26",
                standard_deduction=50000, rebate_threshold=700000, rebate_amount=25000,
                cess_rate=4.0, status="active",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)
        # Tax slabs (a few per regime)
        regime_ids = [r[0] for r in db.execute(text("SELECT id FROM tax_regimes")).fetchall()]
        cur = db.execute(text("SELECT count(*) FROM tax_slabs")).scalar()
        print(f"Tax slabs: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(TaxSlab(
                tax_regime_id=regime_ids[i % len(regime_ids)],
                from_amount=(i % 10) * 200000, to_amount=((i % 10) + 1) * 200000 if i % 10 != 9 else None,
                rate=(i % 30), sort_order=i % 10,
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Attendance Policies → 100K ──
        cur = db.execute(text("SELECT count(*) FROM attendance_policies")).scalar()
        print(f"Attendance policies: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(AttendancePolicy(
                organization_id=org.id, name=f"Att Policy {i}",
                working_days_per_week=6, working_days="1,2,3,4,5,6",
                half_day_as_full_paid=True, paid_leave_as_present=True, holiday_as_present=True,
                overtime_threshold_hours=8, overtime_rate=1.5,
                late_mark_threshold_minutes=15, status="active",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Payroll Policies → 100K ──
        cur = db.execute(text("SELECT count(*) FROM payroll_policies")).scalar()
        print(f"Payroll policies: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(PayrollPolicy(
                organization_id=org.id, name=f"Pay Policy {i}",
                pro_ration_method="paid_days", rounding_method="nearest",
                decimal_places=2, round_net_salary=True,
                include_gratuity=(i % 3 == 0), gratuity_rate=4.81,
                default_currency="INR", allow_negative_net=False, status="active",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Payroll Components → 100K ──
        cur = db.execute(text("SELECT count(*) FROM payroll_components")).scalar()
        print(f"Payroll components: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(PayrollComponent(
                organization_id=org.id, name=f"Component {i}", display_name=f"Comp {i}",
                component_type=random.choice(["earning","deduction","employer_contribution"]),
                calculation_type=random.choice(["percentage","fixed","formula"]),
                calculation_base=random.choice(["basic","gross","net"]),
                calculation_value=random.randint(1, 50),
                is_statutory=(i % 7 == 0), is_taxable=(i % 3 != 0),
                apply_pro_ration=True, is_active=True, is_system=False, priority=i % 20,
                status="active",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Salary Templates → 100K ──
        cur = db.execute(text("SELECT count(*) FROM salary_templates")).scalar()
        print(f"Salary templates: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(SalaryTemplate(
                name=f"Template {i}", basic_percent=50, hra_percent=20,
                special_allowance_percent=15, other_allowance_percent=5,
                organization_id=org.id, status="active",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Leave Types → 100K ──
        cur = db.execute(text("SELECT count(*) FROM leave_types")).scalar()
        print(f"Leave types: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(LeaveType(
                name=f"Leave Type {i}", code=f"LT{i:06d}",
                days_allowed=random.randint(5, 30), carry_forward=(i % 3 == 0),
                organization_id=org.id, status="active",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Feature Flags → 100K ──
        cur = db.execute(text("SELECT count(*) FROM feature_flags")).scalar()
        print(f"Feature flags: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(FeatureFlag(
                flag=f"flag_{i}", organization_id=org.id, enabled=(i % 5 != 0),
                description=f"Flag {i}",
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Scheduled Reports → 100K ──
        cur = db.execute(text("SELECT count(*) FROM scheduled_reports")).scalar()
        print(f"Scheduled reports: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(ScheduledReport(
                organization_id=org.id, name=f"Scheduled Report {i}",
                report_type=random.choice(["payroll_summary","attendance_report","headcount_report"]),
                frequency=random.choice(["daily","weekly","monthly","quarterly"]),
                recipients=["admin@hrms.com"], format=random.choice(["csv","pdf"]),
                params={"month": 6, "year": 2026}, is_active=True,
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Report Schedules → 100K ──
        cur = db.execute(text("SELECT count(*) FROM report_schedules")).scalar()
        print(f"Report schedules: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            sid = str(uuid.uuid4())
            batch.append(ReportSchedule(
                id=sid, report_name=f"Report Schedule {i}",
                frequency=random.choice(["Daily","Weekly","Monthly","Quarterly"]),
                run_time=datetime.strptime("09:00", "%H:%M").time(),
                day_of_week="Monday", day_of_month="1st",
                recipients="admin@hrms.com", format=random.choice(["PDF","CSV","Excel"]),
                email_subject="Report", include_body=False,
                next_run=datetime.utcnow() + timedelta(days=1),
                enabled=(i % 4 != 0), created_by=admin_id,
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── Report Execution Logs → 100K ──
        cur = db.execute(text("SELECT count(*) FROM report_execution_logs")).scalar()
        print(f"Report execution logs: {cur} -> {TARGET}")
        batch = []
        sched_ids = [r[0] for r in db.execute(text("SELECT id FROM report_schedules LIMIT 5000")).fetchall()] or ["x"]
        for i in range(TARGET - cur):
            batch.append(ReportExecutionLog(
                schedule_id=sched_ids[i % len(sched_ids)],
                report_name=f"Executed Report {i}",
                status=random.choice(["success","failed","in_progress"]),
                format=random.choice(["PDF","CSV","Excel"]),
                execution_time=datetime.utcnow() - timedelta(hours=i % 7200),
                created_by=admin_id,
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        # ── System Health Logs → 100K ──
        cur = db.execute(text("SELECT count(*) FROM system_health_logs")).scalar()
        print(f"System health logs: {cur} -> {TARGET}")
        batch = []
        for i in range(TARGET - cur):
            batch.append(SystemHealthLog(
                service=random.choice(["database","redis","api"]),
                status=random.choice(["healthy","healthy","healthy","degraded"]),
                latency_ms=random.randint(5, 200), organization_id=org.id,
                created_at=datetime.utcnow() - timedelta(minutes=i),
            ))
            if len(batch) >= BATCH: flush(batch); batch = []
        if batch: flush(batch)

        print("\n=== FINAL COUNTS ===")
        for t in ["employee_transfers","device_bindings","device_logs","leave_approval_history",
                  "audit_logs","onboarding_tasks","exit_records","archived_employees",
                  "custom_field_definitions","holidays","shifts","tax_regimes","tax_slabs",
                  "attendance_policies","payroll_policies","payroll_components","salary_templates",
                  "leave_types","feature_flags","scheduled_reports","report_schedules",
                  "report_execution_logs","system_health_logs"]:
            n = db.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
            print(f"  {t}: {n}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
