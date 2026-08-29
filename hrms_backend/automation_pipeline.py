import json
import logging
from datetime import datetime, date
from sqlalchemy.orm import Session
from models import Attendance, Employee, LeaveApplication, Holiday, Payroll, Expense
from database_enterprise import redis_client

logger = logging.getLogger(__name__)

def capture_attendance_hook(employee_id: int, organization_id: int, punch_type: str, metadata: dict, db: Session):
    """
    Step 1: Attendance Capture Hook
    Triggered when an employee punches in/out.
    Caches the real-time punch in Redis, and queues a sync to PostgreSQL.
    """
    today_str = date.today().isoformat()
    redis_key = f"punch:{organization_id}:{employee_id}:{today_str}"
    
    # Store real-time punch in Redis
    punch_data = {
        "time": datetime.now().isoformat(),
        "type": punch_type, # 'in' or 'out'
        "metadata": metadata # location, device_id, photo
    }
    
    # In a real enterprise app, we would push this to a Redis Stream or List
    # For now, we store the latest punch state
    redis_client.hset(redis_key, mapping={"latest_punch": json.dumps(punch_data)})
    
    # Immediately sync to Postgres for permanence
    attendance_record = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date == date.today()
    ).first()
    
    if not attendance_record:
        attendance_record = Attendance(
            employee_id=employee_id,
            organization_id=organization_id,
            date=date.today(),
            status="Present"
        )
        db.add(attendance_record)
    
    if punch_type == "in" and not attendance_record.check_in_time:
        attendance_record.check_in_time = datetime.now().strftime("%H:%M:%S")
    elif punch_type == "out":
        attendance_record.check_out_time = datetime.now().strftime("%H:%M:%S")
        
    db.commit()
    return attendance_record

def process_leave_and_holidays(organization_id: int, target_date: date, db: Session):
    """
    Step 2: Leave & Holiday Integration
    Auto-populates attendance records for approved leaves and holidays.
    """
    # Find all approved leaves covering this date
    leaves = db.query(LeaveApplication).filter(
        LeaveApplication.organization_id == organization_id,
        LeaveApplication.status == "approved",
        LeaveApplication.start_date <= target_date,
        LeaveApplication.end_date >= target_date
    ).all()
    
    # Find holiday
    holiday = db.query(Holiday).filter(
        Holiday.organization_id == organization_id,
        Holiday.date == target_date
    ).first()

    for leave in leaves:
        # Auto-create attendance record as 'On Leave'
        record = db.query(Attendance).filter(
            Attendance.employee_id == leave.employee_id,
            Attendance.date == target_date
        ).first()
        if not record:
            record = Attendance(
                employee_id=leave.employee_id,
                organization_id=organization_id,
                date=target_date,
                status="On Leave",
                remarks=f"Leave Type: {leave.leave_type_id}"
            )
            db.add(record)
            
    if holiday:
        # Auto-create records for all employees on holiday
        employees = db.query(Employee).filter(Employee.organization_id == organization_id).all()
        for emp in employees:
            record = db.query(Attendance).filter(
                Attendance.employee_id == emp.id,
                Attendance.date == target_date
            ).first()
            if not record:
                record = Attendance(
                    employee_id=emp.id,
                    organization_id=organization_id,
                    date=target_date,
                    status="Holiday",
                    remarks=holiday.name
                )
                db.add(record)
    
    db.commit()

def calculate_payroll(employee_id: int, organization_id: int, month: int, year: int, db: Session, is_sandbox: bool = False):
    """
    Step 3 & 4: Payroll Engine
    Calculates basic, allowances, deductions based on attendance and leaves.
    If is_sandbox is True, it rolls back the transaction.
    """
    # 1. Fetch Working Days from Attendance
    attendances = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.organization_id == organization_id
        # Note: Need proper date filtering for month/year here
    ).all()
    
    days_present = sum(1 for a in attendances if a.status == "Present")
    days_leave = sum(1 for a in attendances if a.status == "On Leave")
    days_holiday = sum(1 for a in attendances if a.status == "Holiday")
    
    total_paid_days = days_present + days_leave + days_holiday
    
    # 2. Fetch Expenses
    expenses = db.query(Expense).filter(
        Expense.employee_id == employee_id,
        Expense.status == "approved"
    ).all()
    reimbursements = sum(float(e.amount) for e in expenses)
    
    # 3. Calculate salary components
    basic_salary = 50000.0 # Mock base salary, should come from SalaryTemplate
    pf_deduction = basic_salary * 0.12 # 12% PF
    net_salary = basic_salary + reimbursements - pf_deduction
    
    payroll = Payroll(
        employee_id=employee_id,
        organization_id=organization_id,
        period=f"{year}-{month:02d}",
        basic_salary=basic_salary,
        allowances=reimbursements,
        deductions=pf_deduction,
        net_salary=net_salary,
        status="draft" if is_sandbox else "finalized"
    )
    
    db.add(payroll)
    
    if is_sandbox:
        db.rollback() # PERFECT PREVIEW without saving!
        return {"preview": True, "payroll": payroll}
    else:
        db.commit()
        # Step 5: Compliance Hook
        # Once finalized, trigger PDF generation and compliance export here
        return {"preview": False, "payroll": payroll}

# Step 5: Scheduled Jobs
from apscheduler.schedulers.background import BackgroundScheduler
scheduler = BackgroundScheduler()

def end_of_month_payroll_cron():
    """Scheduled to run on the last day of the month to auto-generate draft payrolls"""
    logger.info("Executing End-of-Month Payroll Cron")
    # Loop over all active organizations, generate draft payrolls.
    pass

scheduler.add_job(end_of_month_payroll_cron, 'cron', day='last')
