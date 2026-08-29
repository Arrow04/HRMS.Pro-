"""
Employee Repository - handles all employee data access
Follows Repository Pattern for data abstraction
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from models import Employee, EmployeeTransfer, EmployeeBranchAssignment, EmployeeDepartmentAssignment
from repositories.base_repository import BaseRepository


class EmployeeRepository(BaseRepository[Employee]):
    """
    Employee-specific data access operations
    Extends base repository with employee-specific queries
    """
    
    def __init__(self, db: Session):
        super().__init__(Employee, db)
    
    def get_by_email(self, email: str) -> Optional[Employee]:
        """Get employee by email"""
        return self.db.query(Employee).filter(Employee.email == email).first()
    
    def get_by_employee_code(self, code: str) -> Optional[Employee]:
        """Get employee by employee code"""
        return self.db.query(Employee).filter(Employee.employee_code == code).first()
    
    def get_active_employees(self, skip: int = 0, limit: int = 100) -> List[Employee]:
        """Get only active employees"""
        return self.db.query(Employee).filter(Employee.status == 'active').offset(skip).limit(limit).all()
    
    def get_with_relations(self, employee_id: int) -> Optional[Employee]:
        """Get employee with all related data"""
        return self.db.query(Employee).options(
            joinedload(Employee.branch),
            joinedload(Employee.department),
            joinedload(Employee.company),
            joinedload(Employee.designation_obj)
        ).filter(Employee.id == employee_id).first()
    
    def search_employees(self, query: str) -> List[Employee]:
        """Search by name, email, or code"""
        search = f"%{query}%"
        return self.db.query(Employee).filter(
            or_(
                Employee.first_name.ilike(search),
                Employee.last_name.ilike(search),
                Employee.email.ilike(search),
                Employee.employee_code.ilike(search)
            )
        ).all()
    
    def get_by_company(self, company_id: int) -> List[Employee]:
        """Get employees by company"""
        return self.db.query(Employee).filter(Employee.company_id == company_id).all()
    
    def get_by_branch(self, branch_id: int) -> List[Employee]:
        """Get employees by branch"""
        return self.db.query(Employee).filter(Employee.branch_id == branch_id).all()
    
    def get_by_department(self, department_id: int) -> List[Employee]:
        """Get employees by department"""
        return self.db.query(Employee).filter(Employee.department_id == department_id).all()


class EmployeeTransferRepository(BaseRepository[EmployeeTransfer]):
    """
    Employee Transfer repository
    Handles transfer requests and approvals
    """
    
    def __init__(self, db: Session):
        super().__init__(EmployeeTransfer, db)
    
    def get_by_employee(self, employee_id: int) -> List[EmployeeTransfer]:
        """Get all transfers for an employee"""
        return self.db.query(EmployeeTransfer).filter(
            EmployeeTransfer.employee_id == employee_id
        ).order_by(EmployeeTransfer.created_at.desc()).all()
    
    def get_pending_transfers(self) -> List[EmployeeTransfer]:
        """Get all pending transfer requests"""
        return self.db.query(EmployeeTransfer).filter(
            EmployeeTransfer.status == 'pending'
        ).all()
    
    def get_active_transfers(self, employee_id: int) -> List[EmployeeTransfer]:
        """Get active (non-completed) transfers"""
        return self.db.query(EmployeeTransfer).filter(
            and_(
                EmployeeTransfer.employee_id == employee_id,
                EmployeeTransfer.status.in_(['pending', 'approved'])
            )
        ).all()


class EmployeeAssignmentRepository:
    """
    Handles branch and department assignments
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_branch_assignments(self, employee_id: int) -> List[EmployeeBranchAssignment]:
        """Get all branch assignments for employee"""
        return self.db.query(EmployeeBranchAssignment).filter(
            EmployeeBranchAssignment.employee_id == employee_id
        ).all()
    
    def get_department_assignments(self, employee_id: int) -> List[EmployeeDepartmentAssignment]:
        """Get all department assignments for employee"""
        return self.db.query(EmployeeDepartmentAssignment).filter(
            EmployeeDepartmentAssignment.employee_id == employee_id
        ).all()
    
    def get_primary_branch(self, employee_id: int) -> Optional[EmployeeBranchAssignment]:
        """Get primary branch assignment"""
        return self.db.query(EmployeeBranchAssignment).filter(
            and_(
                EmployeeBranchAssignment.employee_id == employee_id,
                EmployeeBranchAssignment.is_primary == True,
                EmployeeBranchAssignment.status == 'active'
            )
        ).first()
    
    def get_primary_department(self, employee_id: int) -> Optional[EmployeeDepartmentAssignment]:
        """Get primary department assignment"""
        return self.db.query(EmployeeDepartmentAssignment).filter(
            and_(
                EmployeeDepartmentAssignment.employee_id == employee_id,
                EmployeeDepartmentAssignment.is_primary == True,
                EmployeeDepartmentAssignment.status == 'active'
            )
        ).first()
    
    def clear_primary_branches(self, employee_id: int):
        """Clear primary flag from all branch assignments"""
        assignments = self.db.query(EmployeeBranchAssignment).filter(
            and_(
                EmployeeBranchAssignment.employee_id == employee_id,
                EmployeeBranchAssignment.is_primary == True
            )
        ).all()
        for assignment in assignments:
            assignment.is_primary = False
        self.db.commit()
    
    def clear_primary_departments(self, employee_id: int):
        """Clear primary flag from all department assignments"""
        assignments = self.db.query(EmployeeDepartmentAssignment).filter(
            and_(
                EmployeeDepartmentAssignment.employee_id == employee_id,
                EmployeeDepartmentAssignment.is_primary == True
            )
        ).all()
        for assignment in assignments:
            assignment.is_primary = False
        self.db.commit()
