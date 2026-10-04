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
from models import User, Employee
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


# ==================== TENANCY / PII HELPERS ====================

_FULL_RECORD_ROLES = (
    "admin", "superadmin", "hr_admin", "hr_manager",
    "hr_executive", "finance", "accountant",
)

_CONTROLLER_SENSITIVE_KEYS = (
    "voter_id", "aadhar_number", "pan_number", "driving_license", "passport_number",
    "pf_number", "pf_uan", "esic_number", "bank_name", "bank_account_number",
    "ifsc_code", "date_of_birth", "emergency_contact", "emergency_phone", "address",
)


def _scoped_query(db: Session, current_user: User):
    """Employees visible to this user: own org only (superadmin sees all)."""
    q = db.query(Employee)
    if current_user.role != "superadmin":
        q = q.filter(Employee.organization_id == current_user.organization_id)
    return q


def _get_scoped(db: Session, employee_id: int, current_user: User) -> Employee:
    emp = _scoped_query(db, current_user).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return emp


def _masked_response(db: Session, current_user: User, emp: Employee) -> dict:
    """Serialize the employee, blanking PII unless HR/finance role or own record."""
    data = EmployeeResponse.model_validate(emp, from_attributes=True).model_dump()
    if (current_user.role or "").lower() in _FULL_RECORD_ROLES:
        return data
    own = db.query(Employee).filter(
        Employee.user_id == current_user.id, Employee.deleted_at.is_(None)
    ).first()
    if own and own.id == emp.id:
        return data
    for k in _CONTROLLER_SENSITIVE_KEYS:
        if k in data:
            data[k] = None
    return data


def _get_scoped_transfer(db: Session, transfer_id: int, current_user: User):
    """Fetch a transfer whose employee belongs to the caller's organization."""
    from models import EmployeeTransfer
    t = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    emp = db.query(Employee).filter(Employee.id == t.employee_id).first()
    if current_user.role != "superadmin" and (not emp or emp.organization_id != current_user.organization_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    return t


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
    Get all employees with optional filters (org-scoped, PII-masked)
    """
    service = EmployeeService(db)
    
    # Apply filters
    if filters.search:
        employees = service.search_employees(filters.search, filters.dict(exclude={'search'}))
    else:
        employees = service.search_employees("", filters.dict(exclude_unset=True))

    # Tenancy: non-superadmin sees own organization only.
    if current_user.role != "superadmin":
        employees = [e for e in employees if e.organization_id == current_user.organization_id]

    page = employees[skip:skip + limit]
    if (current_user.role or "").lower() in _FULL_RECORD_ROLES:
        return page
    return [_masked_response(db, current_user, e) for e in page]


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

    # Tenancy: only transfers of employees in the caller's organization.
    if current_user.role != "superadmin":
        visible_ids = {
            e.id for e in db.query(Employee.id).filter(
                Employee.organization_id == current_user.organization_id
            ).all()
        }
        transfers = [t for t in transfers if t.employee_id in visible_ids]

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
    emp = _get_scoped(db, employee_id, current_user)
    return _masked_response(db, current_user, emp)


@router.post("/", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create new employee
    """
    from routers.employees import _require_module_action
    _require_module_action(db, current_user, "employees", "write")
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
    from routers.employees import _require_module_action
    _require_module_action(db, current_user, "employees", "write")
    _get_scoped(db, employee_id, current_user)
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
    from routers.employees import _require_module_action
    _require_module_action(db, current_user, "employees", "delete")
    _get_scoped(db, employee_id, current_user)
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
    # The moved employee must belong to the caller's organization.
    _get_scoped(db, data.employee_id, current_user)
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
    return _get_scoped_transfer(db, transfer_id, current_user)


@router.put("/transfers/{transfer_id}/approve", response_model=EmployeeTransferResponse)
def approve_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Approve transfer request
    """
    from routers.employees import _require_module_action
    _require_module_action(db, current_user, "employees", "write")
    _get_scoped_transfer(db, transfer_id, current_user)
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
    from routers.employees import _require_module_action
    _require_module_action(db, current_user, "employees", "write")
    _get_scoped_transfer(db, transfer_id, current_user)
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
    from routers.employees import _require_module_action
    _require_module_action(db, current_user, "employees", "write")
    _get_scoped_transfer(db, transfer_id, current_user)
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
    from routers.employees import _require_module_action
    from repositories.employee_repository import EmployeeTransferRepository

    _require_module_action(db, current_user, "employees", "write")
    transfer = _get_scoped_transfer(db, transfer_id, current_user)

    if transfer.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only delete pending transfers"
        )

    EmployeeTransferRepository(db).delete(transfer_id)

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
