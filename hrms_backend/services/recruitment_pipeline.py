"""Recruitment pipeline automation — status transitions → actions."""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models import (
    Candidate, Employee, Interview, JobOpening, OnboardingTask, Organization, User,
)

logger = logging.getLogger(__name__)

# ── Pipeline Status Machine ──
# Each status transition can trigger actions

PIPELINE = {
    "applied": {
        "next": ["shortlisted", "rejected"],
        "actions": [],
    },
    "shortlisted": {
        "next": ["interviewed", "rejected"],
        "actions": ["send_screening_email"],
    },
    "interviewed": {
        "next": ["offered", "rejected", "shortlisted"],
        "actions": ["send_feedback_email"],
    },
    "offered": {
        "next": ["hired", "rejected", "interviewed"],
        "actions": ["send_offer_letter", "schedule_onboarding"],
    },
    "hired": {
        "next": [],
        "actions": ["create_employee", "generate_onboarding_tasks", "send_welcome_email"],
    },
    "rejected": {
        "next": [],
        "actions": ["send_rejection_email"],
    },
}


def transition_candidate_status(
    db: Session,
    candidate: Candidate,
    new_status: str,
    current_user_id: Optional[int] = None,
) -> dict:
    """Transition a candidate through the pipeline with auto-actions."""
    old_status = candidate.candidate_status
    if old_status == new_status:
        return {"status": "no_change", "message": "Already at this status"}

    valid_next = PIPELINE.get(old_status, {}).get("next", [])
    if new_status not in valid_next:
        return {
            "status": "error",
            "message": f"Cannot transition from '{old_status}' to '{new_status}'. Valid: {valid_next}",
        }

    candidate.candidate_status = new_status
    if new_status == "hired":
        candidate.hired_date = datetime.utcnow()
    db.flush()

    actions_taken = []

    # Auto-create employee when hired
    if new_status == "hired":
        result = _create_employee_from_candidate(db, candidate)
        if result["status"] == "success":
            actions_taken.append("employee_created")
            _generate_onboarding_tasks(db, result["employee_id"])
            actions_taken.append("onboarding_tasks_generated")
            _assign_default_policies(db, result["employee_id"], candidate.organization_id)
            actions_taken.append("policies_assigned")

    db.commit()

    return {
        "status": "success",
        "candidate_id": candidate.id,
        "old_status": old_status,
        "new_status": new_status,
        "actions_taken": actions_taken,
    }


def _create_employee_from_candidate(db: Session, candidate: Candidate) -> dict:
    """Auto-create an Employee record when a candidate is hired."""
    existing = db.query(Employee).filter(Employee.email == candidate.email).first()
    if existing:
        return {"status": "skipped", "reason": "Employee already exists with this email"}

    name_parts = (candidate.full_name or "").strip().split(maxsplit=1)
    first_name = name_parts[0] if name_parts else candidate.full_name
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    org_id = candidate.company_id or 1

    emp = Employee(
        first_name=first_name,
        last_name=last_name,
        email=candidate.email,
        phone=candidate.phone,
        employee_code=f"EMP-{candidate.id:04d}",
        organization_id=org_id,
        status="new",
        onboarding_step="pending",
        onboarding_progress=[],
        base_salary=candidate.expected_salary or 0,
        designation=candidate.current_position or "",
    )
    db.add(emp)
    db.flush()

    logger.info(f"Auto-created employee {emp.id} from candidate {candidate.id}")
    return {"status": "success", "employee_id": emp.id}


def _generate_onboarding_tasks(db: Session, employee_id: int):
    """Generate standard onboarding tasks for a new employee."""
    tasks = [
        OnboardingTask(employee_id=employee_id, title="Collect Aadhaar & PAN copies", department="HR", status="pending"),
        OnboardingTask(employee_id=employee_id, title="Open/Update Salary Bank Account", department="Finance", status="pending"),
        OnboardingTask(employee_id=employee_id, title="Generate UAN for EPF", department="Finance", status="pending"),
        OnboardingTask(employee_id=employee_id, title="Register for ESIC (if applicable)", department="Finance", status="pending"),
        OnboardingTask(employee_id=employee_id, title="Provision IT Assets (Laptop/Phone)", department="IT", status="pending"),
        OnboardingTask(employee_id=employee_id, title="Create Email & System Access", department="IT", status="pending"),
    ]
    db.add_all(tasks)


def _assign_default_policies(db: Session, employee_id: int, org_id: int):
    """Assign default payroll/attendance/tax policies from org defaults."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        return
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        return
    if org.default_payroll_policy_id:
        emp.payroll_policy_id = org.default_payroll_policy_id
    if org.default_attendance_policy_id:
        emp.attendance_policy_id = org.default_attendance_policy_id
    if org.default_tax_regime_id:
        emp.tax_regime_id = org.default_tax_regime_id
