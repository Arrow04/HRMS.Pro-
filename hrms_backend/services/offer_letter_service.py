"""
Onboarding Management
Creates onboarding tasks for new employees.
"""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models import OnboardingTask


def create_onboarding_tasks(db: Session, employee_id: int, org_id: int) -> list:
    """Create default onboarding tasks for a new employee."""
    tasks_data = [
        {"title": "IT Setup — Laptop & Software", "department": "IT", "description": "Configure laptop, email, and required software", "due_days": 0},
        {"title": "IT Setup — Access & Permissions", "department": "IT", "description": "Grant system access, VPN, email groups", "due_days": 1},
        {"title": "HR — Document Verification", "department": "HR", "description": "Verify original documents (Aadhaar, PAN, degree certificates)", "due_days": 3},
        {"title": "HR — Bank Account Setup", "department": "HR", "description": "Set up salary bank account and verify IFSC", "due_days": 5},
        {"title": "HR — PF & ESI Enrollment", "department": "HR", "description": "Enroll employee in PF and ESI schemes", "due_days": 5},
        {"title": "Finance — Salary Structure Setup", "department": "Finance", "description": "Configure salary components in payroll system", "due_days": 3},
        {"title": "Admin — ID Card & Access Card", "department": "Admin", "description": "Issue employee ID card and access card", "due_days": 2},
        {"title": "Admin — Workspace Allocation", "department": "Admin", "description": "Assign desk/workspace and necessary furniture", "due_days": 0},
        {"title": "Manager — Team Introduction", "department": "Manager", "description": "Introduce to team, assign buddy/mentor", "due_days": 0},
        {"title": "Manager — Training Plan", "department": "Manager", "description": "Create 30-60-90 day training and onboarding plan", "due_days": 2},
    ]

    tasks = []
    for td in tasks_data:
        task = OnboardingTask(
            employee_id=employee_id,
            title=td["title"],
            description=td["description"],
            department=td["department"],
            status="pending",
            due_date=datetime.utcnow() + timedelta(days=td["due_days"]),
        )
        db.add(task)
        tasks.append(task)

    db.commit()
    for t in tasks:
        db.refresh(t)

    return tasks
