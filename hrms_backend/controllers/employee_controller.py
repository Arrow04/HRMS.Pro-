"""
Employee Controller - handles HTTP requests and responses
Follows Controller pattern - thin layer between API and Service
Implements Dependency Inversion Principle - depends on abstractions
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db, get_read_db
from core.scale import MAX_LIST_LIMIT
from models import User
from routers.auth import get_current_user

# Services
from services.employee_service import EmployeeService, EmployeeTransferService, EmployeeAssignmentService

# Schemas
from schemas.employee_schemas import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    EmployeeTransferCreate, EmployeeTransferUpdate, EmployeeTransferResponse,
    BranchAssignmentCreate, BranchAssignmentUpdate, BranchAssignmentResponse,
    DepartmentAssignmentCreate, DepartmentAssignmentUpdate, DepartmentAssignmentResponse,
    EmployeeSearchFilters
)

# Create router
router = APIRouter(tags=["employees"])


# ==================== EMPLOYEE CONTROLLERS ====================

@router.get("/", response_model=List[EmployeeResponse])
def get_employees(
    filters: EmployeeSearchFilters = Depends(),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=MAX_LIST_LIMIT),
    db: Session = Depends(get_read_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all employees with optional filters
    """
    service = EmployeeService(db)
    
    # Apply filters
    if filters.search:
        employees = service.search_employees(filters.search, filters.dict(exclude={'search'}))
    else:
        employees = service.search_employees("", filters.dict(exclude_unset=True))
    
    return employees[skip:skip + limit]


# ==================== TRANSFER CONTROLLERS ====================

@router.get("/transfers", response_model=List[EmployeeTransferResponse])
def get_transfers(
    employee_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all transfers with optional filters
    """
    from repositories.employee_repository import EmployeeTransferRepository
    
    repo = EmployeeTransferRepository(db)
    
    if employee_id:
        transfers = repo.get_by_employee(employee_id)
    else:
        transfers = repo.get_all()
    
    if status:
        transfers = [t for t in transfers if t.status == status]
    
    return transfers


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get single employee by ID
    """
    service = EmployeeService(db)
    employee = service.employee_repo.get_with_relations(employee_id)
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    
    return employee


@router.post("/", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create new employee
    """
    service = EmployeeService(db)
    employee = service.create_employee(data.dict(), current_user)
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: int,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update employee
    """
    service = EmployeeService(db)
    employee = service.update_employee(employee_id, data.dict(exclude_unset=True), current_user)
    return employee


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete employee
    """
    service = EmployeeService(db)
    deleted = service.delete_employee(employee_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    
    return {"message": "Employee deleted successfully"}


@router.post("/transfers", response_model=EmployeeTransferResponse, status_code=status.HTTP_201_CREATED)
def create_transfer(
    data: EmployeeTransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create employee transfer request
    """
    service = EmployeeTransferService(db)
    transfer = service.create_transfer(data.dict(), current_user)
    return transfer


@router.get("/transfers/{transfer_id}", response_model=EmployeeTransferResponse)
def get_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get single transfer by ID
    """
    from repositories.employee_repository import EmployeeTransferRepository
    
    repo = EmployeeTransferRepository(db)
    transfer = repo.get_by_id(transfer_id)
    
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transfer not found"
        )
    
    return transfer


@router.put("/transfers/{transfer_id}/approve", response_model=EmployeeTransferResponse)
def approve_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Approve transfer request
    """
    service = EmployeeTransferService(db)
    transfer = service.approve_transfer(transfer_id, current_user)
    return transfer


@router.put("/transfers/{transfer_id}/complete", response_model=EmployeeTransferResponse)
def complete_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Complete transfer and move employee
    """
    service = EmployeeTransferService(db)
    transfer = service.complete_transfer(transfer_id, current_user)
    return transfer


@router.put("/transfers/{transfer_id}/reject", response_model=EmployeeTransferResponse)
def reject_transfer(
    transfer_id: int,
    reason: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Reject transfer request
    """
    service = EmployeeTransferService(db)
    transfer = service.reject_transfer(transfer_id, reason, current_user)
    return transfer


@router.delete("/transfers/{transfer_id}")
def delete_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete transfer request (only if pending)
    """
    from repositories.employee_repository import EmployeeTransferRepository
    
    repo = EmployeeTransferRepository(db)
    transfer = repo.get_by_id(transfer_id)
    
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transfer not found"
        )
    
    if transfer.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only delete pending transfers"
        )
    
    repo.delete(transfer_id)
    
    return {"message": "Transfer deleted successfully"}


# ==================== ASSIGNMENT CONTROLLERS ====================

@router.get("/assignments/branches", response_model=List[BranchAssignmentResponse])
def get_branch_assignments(
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get branch assignments
    """
    service = EmployeeAssignmentService(db)
    
    if employee_id:
        assignments = service.assignment_repo.get_branch_assignments(employee_id)
    else:
        from repositories.employee_repository import EmployeeAssignmentRepository
        from models import EmployeeBranchAssignment
        
        repo = EmployeeAssignmentRepository(db)
        # Get all via base repo
        from repositories.base_repository import BaseRepository
        base_repo = BaseRepository(EmployeeBranchAssignment, db)
        assignments = base_repo.get_all()
    
    return assignments


@router.post("/assignments/branches", response_model=BranchAssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_branch_assignment(
    data: BranchAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Assign employee to branch
    """
    service = EmployeeAssignmentService(db)
    assignment = service.assign_branch(
        data.employee_id,
        data.branch_id,
        data.is_primary,
        current_user
    )
    return assignment


@router.put("/assignments/branches/{assignment_id}", response_model=BranchAssignmentResponse)
def update_branch_assignment(
    assignment_id: int,
    data: BranchAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update branch assignment
    """
    from repositories.employee_repository import EmployeeAssignmentRepository
    
    repo = EmployeeAssignmentRepository(db)
    assignment = repo.get_primary_branch(assignment_id)  # Use any method to check existence
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Update logic here
    if data.is_primary is not None:
        assignment.is_primary = data.is_primary
    if data.status:
        assignment.status = data.status
    if data.end_date:
        assignment.end_date = data.end_date
    
    db.commit()
    db.refresh(assignment)
    
    return assignment


@router.get("/assignments/departments", response_model=List[DepartmentAssignmentResponse])
def get_department_assignments(
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get department assignments
    """
    service = EmployeeAssignmentService(db)
    
    if employee_id:
        assignments = service.assignment_repo.get_department_assignments(employee_id)
    else:
        from models import EmployeeDepartmentAssignment
        from repositories.base_repository import BaseRepository
        
        repo = BaseRepository(EmployeeDepartmentAssignment, db)
        assignments = repo.get_all()
    
    return assignments


@router.post("/assignments/departments", response_model=DepartmentAssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_department_assignment(
    data: DepartmentAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Assign employee to department
    """
    service = EmployeeAssignmentService(db)
    assignment = service.assign_department(
        data.employee_id,
        data.department_id,
        data.is_primary,
        current_user
    )
    return assignment


@router.get("/assignments/employee/{employee_id}")
def get_employee_assignments(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all assignments for an employee
    """
    service = EmployeeAssignmentService(db)
    assignments = service.get_employee_assignments(employee_id)
    return assignments
