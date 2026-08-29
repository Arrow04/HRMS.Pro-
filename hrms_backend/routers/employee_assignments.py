from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from database import get_db
from models import (
    EmployeeBranchAssignment, EmployeeDepartmentAssignment,
    Employee, Branch, Department, User, EmployeeLifecycleEvent
)
from routers.auth import get_current_user
from core.tenant import get_employee_in_org, org_owned

router = APIRouter(tags=["employee-assignments"])

# Pydantic Schemas
class BranchAssignmentCreate(BaseModel):
    employee_id: int
    branch_id: int
    is_primary: bool = False
    start_date: Optional[str] = None
    status: str = "active"

class DepartmentAssignmentCreate(BaseModel):
    employee_id: int
    department_id: int
    is_primary: bool = False
    start_date: Optional[str] = None
    status: str = "active"

class AssignmentUpdate(BaseModel):
    is_primary: Optional[bool] = None
    end_date: Optional[str] = None
    status: Optional[str] = None

class BranchAssignmentResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    branch_id: int
    branch_name: str
    is_primary: bool
    start_date: str
    end_date: Optional[str]
    status: str
    created_at: str

    class Config:
        from_attributes = True

class DepartmentAssignmentResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    department_id: int
    department_name: str
    is_primary: bool
    start_date: str
    end_date: Optional[str]
    status: str
    created_at: str

    class Config:
        from_attributes = True

# ==================== BRANCH ASSIGNMENTS ====================

@router.post("/branches", response_model=BranchAssignmentResponse)
def create_branch_assignment(
    assignment: BranchAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a branch assignment for an employee"""
    
    # Validate employee exists
    if current_user.role != "superadmin":
        employee = get_employee_in_org(db, Employee, assignment.employee_id, current_user.organization_id)
    else:
        employee = db.query(Employee).filter(Employee.id == assignment.employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
    
    # Validate branch exists
    branch = db.query(Branch).filter(Branch.id == assignment.branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    if current_user.role != "superadmin":
        org_owned(branch, current_user.organization_id)
    
    # If this is primary, unset any existing primary
    if assignment.is_primary:
        existing_primary = db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == assignment.employee_id,
            EmployeeBranchAssignment.is_primary == True,
            EmployeeBranchAssignment.status == 'active'
        ).first()
        
        if existing_primary:
            existing_primary.is_primary = False
    
    # Create assignment
    db_assignment = EmployeeBranchAssignment(
        employee_id=assignment.employee_id,
        branch_id=assignment.branch_id,
        is_primary=assignment.is_primary,
        start_date=datetime.fromisoformat(assignment.start_date) if assignment.start_date else datetime.utcnow(),
        status=assignment.status
    )
    
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    
    # Create lifecycle event
    lifecycle_event = EmployeeLifecycleEvent(
        employee_id=assignment.employee_id,
        event_type='transfer' if assignment.is_primary else 'assignment',
        event_date=datetime.utcnow(),
        description=f"Assigned to branch: {branch.name}" + (" (Primary)" if assignment.is_primary else ""),
        to_value=branch.name,
        recorded_by=current_user.id
    )
    db.add(lifecycle_event)
    db.commit()
    
    return _format_branch_assignment(db_assignment, db)

@router.get("/branches", response_model=List[BranchAssignmentResponse])
def get_branch_assignments(
    employee_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get branch assignments with optional filters"""
    
    query = db.query(EmployeeBranchAssignment)
    if current_user.role != "superadmin":
        query = query.join(Employee, EmployeeBranchAssignment.employee_id == Employee.id).filter(
            Employee.organization_id == current_user.organization_id
        )
    
    if employee_id:
        query = query.filter(EmployeeBranchAssignment.employee_id == employee_id)
    
    if branch_id:
        query = query.filter(EmployeeBranchAssignment.branch_id == branch_id)
    
    if status:
        query = query.filter(EmployeeBranchAssignment.status == status)
    
    assignments = query.order_by(EmployeeBranchAssignment.created_at.desc()).all()
    
    return [_format_branch_assignment(a, db) for a in assignments]

@router.put("/branches/{assignment_id}", response_model=BranchAssignmentResponse)
def update_branch_assignment(
    assignment_id: int,
    update: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a branch assignment"""
    
    assignment = db.query(EmployeeBranchAssignment).filter(EmployeeBranchAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, assignment.employee_id, current_user.organization_id)
    
    # If setting as primary, unset other primaries
    if update.is_primary:
        existing_primary = db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == assignment.employee_id,
            EmployeeBranchAssignment.id != assignment_id,
            EmployeeBranchAssignment.is_primary == True,
            EmployeeBranchAssignment.status == 'active'
        ).first()
        
        if existing_primary:
            existing_primary.is_primary = False
        
        # Also update the employee's primary branch
        employee = db.query(Employee).filter(Employee.id == assignment.employee_id).first()
        if employee:
            employee.branch_id = assignment.branch_id
    
    if update.is_primary is not None:
        assignment.is_primary = update.is_primary
    
    if update.end_date:
        assignment.end_date = datetime.fromisoformat(update.end_date)
    
    if update.status:
        assignment.status = update.status
    
    db.commit()
    db.refresh(assignment)
    
    return _format_branch_assignment(assignment, db)

@router.delete("/branches/{assignment_id}")
def delete_branch_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a branch assignment"""
    
    assignment = db.query(EmployeeBranchAssignment).filter(EmployeeBranchAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, assignment.employee_id, current_user.organization_id)
    
    db.delete(assignment)
    db.commit()
    
    return {"message": "Branch assignment deleted"}

# ==================== DEPARTMENT ASSIGNMENTS ====================

@router.post("/departments", response_model=DepartmentAssignmentResponse)
def create_department_assignment(
    assignment: DepartmentAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a department assignment for an employee"""
    
    # Validate employee exists
    if current_user.role != "superadmin":
        employee = get_employee_in_org(db, Employee, assignment.employee_id, current_user.organization_id)
    else:
        employee = db.query(Employee).filter(Employee.id == assignment.employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
    
    # Validate department exists
    department = db.query(Department).filter(Department.id == assignment.department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    if current_user.role != "superadmin":
        org_owned(department, current_user.organization_id)
    
    # If this is primary, unset any existing primary
    if assignment.is_primary:
        existing_primary = db.query(EmployeeDepartmentAssignment).filter(
            EmployeeDepartmentAssignment.employee_id == assignment.employee_id,
            EmployeeDepartmentAssignment.is_primary == True,
            EmployeeDepartmentAssignment.status == 'active'
        ).first()
        
        if existing_primary:
            existing_primary.is_primary = False
    
    # Create assignment
    db_assignment = EmployeeDepartmentAssignment(
        employee_id=assignment.employee_id,
        department_id=assignment.department_id,
        is_primary=assignment.is_primary,
        start_date=datetime.fromisoformat(assignment.start_date) if assignment.start_date else datetime.utcnow(),
        status=assignment.status
    )
    
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    
    # Create lifecycle event
    lifecycle_event = EmployeeLifecycleEvent(
        employee_id=assignment.employee_id,
        event_type='assignment',
        event_date=datetime.utcnow(),
        description=f"Assigned to department: {department.name}" + (" (Primary)" if assignment.is_primary else ""),
        to_value=department.name,
        recorded_by=current_user.id
    )
    db.add(lifecycle_event)
    db.commit()
    
    return _format_department_assignment(db_assignment, db)

@router.get("/departments", response_model=List[DepartmentAssignmentResponse])
def get_department_assignments(
    employee_id: Optional[int] = None,
    department_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get department assignments with optional filters"""
    
    query = db.query(EmployeeDepartmentAssignment)
    if current_user.role != "superadmin":
        query = query.join(Employee, EmployeeDepartmentAssignment.employee_id == Employee.id).filter(
            Employee.organization_id == current_user.organization_id
        )
    
    if employee_id:
        query = query.filter(EmployeeDepartmentAssignment.employee_id == employee_id)
    
    if department_id:
        query = query.filter(EmployeeDepartmentAssignment.department_id == department_id)
    
    if status:
        query = query.filter(EmployeeDepartmentAssignment.status == status)
    
    assignments = query.order_by(EmployeeDepartmentAssignment.created_at.desc()).all()
    
    return [_format_department_assignment(a, db) for a in assignments]

@router.put("/departments/{assignment_id}", response_model=DepartmentAssignmentResponse)
def update_department_assignment(
    assignment_id: int,
    update: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a department assignment"""
    
    assignment = db.query(EmployeeDepartmentAssignment).filter(EmployeeDepartmentAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, assignment.employee_id, current_user.organization_id)
    
    # If setting as primary, unset other primaries
    if update.is_primary:
        existing_primary = db.query(EmployeeDepartmentAssignment).filter(
            EmployeeDepartmentAssignment.employee_id == assignment.employee_id,
            EmployeeDepartmentAssignment.id != assignment_id,
            EmployeeDepartmentAssignment.is_primary == True,
            EmployeeDepartmentAssignment.status == 'active'
        ).first()
        
        if existing_primary:
            existing_primary.is_primary = False
        
        # Also update the employee's primary department
        employee = db.query(Employee).filter(Employee.id == assignment.employee_id).first()
        if employee:
            employee.department_id = assignment.department_id
    
    if update.is_primary is not None:
        assignment.is_primary = update.is_primary
    
    if update.end_date:
        assignment.end_date = datetime.fromisoformat(update.end_date)
    
    if update.status:
        assignment.status = update.status
    
    db.commit()
    db.refresh(assignment)
    
    return _format_department_assignment(assignment, db)

@router.delete("/departments/{assignment_id}")
def delete_department_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a department assignment"""
    
    assignment = db.query(EmployeeDepartmentAssignment).filter(EmployeeDepartmentAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if current_user.role != "superadmin":
        get_employee_in_org(db, Employee, assignment.employee_id, current_user.organization_id)
    
    db.delete(assignment)
    db.commit()
    
    return {"message": "Department assignment deleted"}

# Get all assignments for an employee
@router.get("/employee/{employee_id}")
def get_employee_assignments(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all branch and department assignments for an employee"""
    
    if current_user.role != "superadmin":
        employee = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
    else:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
    
    branch_assignments = db.query(EmployeeBranchAssignment).filter(
        EmployeeBranchAssignment.employee_id == employee_id
    ).all()
    
    department_assignments = db.query(EmployeeDepartmentAssignment).filter(
        EmployeeDepartmentAssignment.employee_id == employee_id
    ).all()
    
    return {
        "employee_id": employee_id,
        "employee_name": employee.full_name,
        "branches": [_format_branch_assignment(a, db) for a in branch_assignments],
        "departments": [_format_department_assignment(a, db) for a in department_assignments]
    }

# Helper functions
def _format_branch_assignment(assignment: EmployeeBranchAssignment, db: Session) -> dict:
    """Format branch assignment for API response"""
    
    employee = db.query(Employee).filter(Employee.id == assignment.employee_id).first()
    branch = db.query(Branch).filter(Branch.id == assignment.branch_id).first()
    
    return {
        "id": assignment.id,
        "employee_id": assignment.employee_id,
        "employee_name": employee.full_name if employee else "Unknown",
        "branch_id": assignment.branch_id,
        "branch_name": branch.name if branch else "Unknown",
        "is_primary": assignment.is_primary,
        "start_date": assignment.start_date.isoformat() if assignment.start_date else None,
        "end_date": assignment.end_date.isoformat() if assignment.end_date else None,
        "status": assignment.status,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None
    }

def _format_department_assignment(assignment: EmployeeDepartmentAssignment, db: Session) -> dict:
    """Format department assignment for API response"""
    
    employee = db.query(Employee).filter(Employee.id == assignment.employee_id).first()
    department = db.query(Department).filter(Department.id == assignment.department_id).first()
    
    return {
        "id": assignment.id,
        "employee_id": assignment.employee_id,
        "employee_name": employee.full_name if employee else "Unknown",
        "department_id": assignment.department_id,
        "department_name": department.name if department else "Unknown",
        "is_primary": assignment.is_primary,
        "start_date": assignment.start_date.isoformat() if assignment.start_date else None,
        "end_date": assignment.end_date.isoformat() if assignment.end_date else None,
        "status": assignment.status,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None
    }
