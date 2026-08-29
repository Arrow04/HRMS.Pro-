"""
Employee Service - contains business logic
Follows Service Layer Pattern
Implements Single Responsibility Principle - each service handles one domain
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models import (
    Employee, EmployeeTransfer, EmployeeBranchAssignment, 
    EmployeeDepartmentAssignment, EmployeeLifecycleEvent,
    Branch, Department, User
)
from repositories.employee_repository import (
    EmployeeRepository, EmployeeTransferRepository, EmployeeAssignmentRepository
)


class EmployeeService:
    """
    Employee business logic service
    Handles all employee-related operations
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.employee_repo = EmployeeRepository(db)
        self.transfer_repo = EmployeeTransferRepository(db)
        self.assignment_repo = EmployeeAssignmentRepository(db)
    
    def create_employee(self, data: Dict[str, Any], current_user: User) -> Employee:
        """
        Create new employee with business rules:
        - Check for duplicate email
        - Check for duplicate employee code
        - Create lifecycle event
        """
        # Validation
        if self.employee_repo.get_by_email(data.get('email')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee with this email already exists"
            )
        
        if self.employee_repo.get_by_employee_code(data.get('employee_code')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee code already exists"
            )
        
        # Create employee
        employee = Employee(**data)
        employee = self.employee_repo.create(employee)
        
        # Create lifecycle event
        self._create_lifecycle_event(
            employee_id=employee.id,
            event_type='joined',
            description=f"Employee joined: {employee.full_name}",
            recorded_by=current_user.id
        )
        
        return employee
    
    def update_employee(self, employee_id: int, data: Dict[str, Any], current_user: User) -> Employee:
        """
        Update employee with validation and lifecycle tracking
        """
        employee = self.employee_repo.get_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # Check for changes that need lifecycle events
        if data.get('status') and data['status'] != employee.status:
            self._handle_status_change(employee, data['status'], current_user.id)
        
        # Update employee
        employee = self.employee_repo.update(employee, data)
        return employee
    
    def delete_employee(self, employee_id: int) -> bool:
        """
        Soft delete or hard delete employee
        Currently implements hard delete with checks
        """
        employee = self.employee_repo.get_by_id(employee_id)
        if not employee:
            return False
        
        # Check for dependencies (transfers, assignments, etc.)
        transfers = self.transfer_repo.get_by_employee(employee_id)
        if transfers:
            # Archive or handle transfers before deletion
            pass
        
        return self.employee_repo.delete(employee_id)
    
    def search_employees(self, query: str, filters: Optional[Dict] = None) -> List[Employee]:
        """
        Search employees with optional filters
        """
        if query:
            return self.employee_repo.search_employees(query)
        
        # Apply filters if provided
        if filters:
            if filters.get('company_id'):
                return self.employee_repo.get_by_company(filters['company_id'])
            if filters.get('branch_id'):
                return self.employee_repo.get_by_branch(filters['branch_id'])
            if filters.get('department_id'):
                return self.employee_repo.get_by_department(filters['department_id'])
            if filters.get('status'):
                return self.db.query(Employee).filter(Employee.status == filters['status']).all()
        
        return self.employee_repo.get_all()


class EmployeeTransferService:
    """
    Employee transfer business logic
    Handles temporary and permanent transfers
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.transfer_repo = EmployeeTransferRepository(db)
        self.employee_repo = EmployeeRepository(db)
    
    def create_transfer(self, data: Dict[str, Any], current_user: User) -> EmployeeTransfer:
        """
        Create transfer request with business rules:
        - Check employee exists
        - Check branches are different
        - Check no active transfer exists
        """
        # Validate employee
        employee = self.employee_repo.get_by_id(data.get('employee_id'))
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # Validate branches are different
        if data.get('from_branch_id') == data.get('to_branch_id'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source and destination branches must be different"
            )
        
        # Check for active transfers
        active_transfers = self.transfer_repo.get_active_transfers(data.get('employee_id'))
        if active_transfers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee has an active transfer request"
            )
        
        # Create transfer
        transfer = EmployeeTransfer(
            employee_id=data.get('employee_id'),
            from_branch_id=data.get('from_branch_id'),
            from_department_id=data.get('from_department_id'),
            to_branch_id=data.get('to_branch_id'),
            to_department_id=data.get('to_department_id'),
            type=data.get('type'),
            start_date=datetime.fromisoformat(data.get('start_date')),
            end_date=datetime.fromisoformat(data.get('end_date')) if data.get('end_date') else None,
            reason=data.get('reason'),
            status='pending',
            requested_by=current_user.id
        )
        
        transfer = self.transfer_repo.create(transfer)
        
        # Create lifecycle event
        lifecycle_event = EmployeeLifecycleEvent(
            employee_id=transfer.employee_id,
            event_type='transfer',
            event_date=datetime.utcnow(),
            description=f"Transfer requested: {transfer.type}",
            from_value=str(transfer.from_branch_id),
            to_value=str(transfer.to_branch_id),
            recorded_by=current_user.id
        )
        self.db.add(lifecycle_event)
        self.db.commit()
        
        return transfer
    
    def approve_transfer(self, transfer_id: int, current_user: User) -> EmployeeTransfer:
        """
        Approve transfer request
        """
        transfer = self.transfer_repo.get_by_id(transfer_id)
        if not transfer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transfer not found"
            )
        
        if transfer.status != 'pending':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve transfer with status: {transfer.status}"
            )
        
        transfer.status = 'approved'
        transfer.approved_by = current_user.id
        transfer.approved_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(transfer)
        
        return transfer
    
    def complete_transfer(self, transfer_id: int, current_user: User) -> EmployeeTransfer:
        """
        Complete transfer - actually move employee to new branch/department
        """
        transfer = self.transfer_repo.get_by_id(transfer_id)
        if not transfer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transfer not found"
            )
        
        if transfer.status != 'approved':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transfer must be approved before completion"
            )
        
        # Move employee
        employee = self.employee_repo.get_by_id(transfer.employee_id)
        if employee:
            employee.branch_id = transfer.to_branch_id
            if transfer.to_department_id:
                employee.department_id = transfer.to_department_id
        
        transfer.status = 'completed'
        self.db.commit()
        self.db.refresh(transfer)
        
        return transfer
    
    def reject_transfer(self, transfer_id: int, reason: str, current_user: User) -> EmployeeTransfer:
        """
        Reject transfer request
        """
        transfer = self.transfer_repo.get_by_id(transfer_id)
        if not transfer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transfer not found"
            )
        
        if transfer.status != 'pending':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only reject pending transfers"
            )
        
        transfer.status = 'rejected'
        transfer.notes = reason
        
        self.db.commit()
        self.db.refresh(transfer)
        
        return transfer


class EmployeeAssignmentService:
    """
    Handle multi-assignment logic for branches and departments
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.assignment_repo = EmployeeAssignmentRepository(db)
        self.employee_repo = EmployeeRepository(db)
    
    def assign_branch(self, employee_id: int, branch_id: int, is_primary: bool, 
                      current_user: User) -> EmployeeBranchAssignment:
        """
        Assign employee to branch
        If primary, update employee's main branch
        """
        employee = self.employee_repo.get_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # If primary, clear other primaries first
        if is_primary:
            self.assignment_repo.clear_primary_branches(employee_id)
            # Update employee's main branch
            employee.branch_id = branch_id
            self.db.commit()
        
        # Create assignment
        assignment = EmployeeBranchAssignment(
            employee_id=employee_id,
            branch_id=branch_id,
            is_primary=is_primary,
            status='active'
        )
        
        self.db.add(assignment)
        self.db.commit()
        self.db.refresh(assignment)
        
        return assignment
    
    def assign_department(self, employee_id: int, department_id: int, is_primary: bool,
                          current_user: User) -> EmployeeDepartmentAssignment:
        """
        Assign employee to department
        If primary, update employee's main department
        """
        employee = self.employee_repo.get_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found"
            )
        
        # If primary, clear other primaries
        if is_primary:
            self.assignment_repo.clear_primary_departments(employee_id)
            # Update employee's main department
            employee.department_id = department_id
            self.db.commit()
        
        # Create assignment
        assignment = EmployeeDepartmentAssignment(
            employee_id=employee_id,
            department_id=department_id,
            is_primary=is_primary,
            status='active'
        )
        
        self.db.add(assignment)
        self.db.commit()
        self.db.refresh(assignment)
        
        return assignment
    
    def get_employee_assignments(self, employee_id: int) -> Dict[str, List[Any]]:
        """
        Get all assignments for an employee
        """
        branches = self.assignment_repo.get_branch_assignments(employee_id)
        departments = self.assignment_repo.get_department_assignments(employee_id)
        
        return {
            'branches': branches,
            'departments': departments
        }
    
    def _create_lifecycle_event(self, employee_id: int, event_type: str, 
                                description: str, recorded_by: int):
        """Helper to create lifecycle events"""
        event = EmployeeLifecycleEvent(
            employee_id=employee_id,
            event_type=event_type,
            event_date=datetime.utcnow(),
            description=description,
            recorded_by=recorded_by
        )
        self.db.add(event)
        self.db.commit()
