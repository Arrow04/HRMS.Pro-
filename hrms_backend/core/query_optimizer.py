"""
Database query optimization utilities
Provides helpers for eager loading, query optimization, and N+1 prevention
"""
from sqlalchemy.orm import Query, joinedload, subqueryload, selectinload
from sqlalchemy import func, exists
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class QueryOptimizer:
    """Optimizes database queries to prevent N+1 problems"""
    
    @staticmethod
    def eager_load_employee_relations(query: Query) -> Query:
        """Eager load common employee relations"""
        from models import Employee
        return query.options(
            joinedload(Employee.user),
            joinedload(Employee.organization),
            joinedload(Employee.company),
            joinedload(Employee.department),
            joinedload(Employee.designation),
            selectinload(Employee.branch_assignments),
            selectinload(Employee.department_assignments),
        )
    
    @staticmethod
    def eager_load_attendance_relations(query: Query) -> Query:
        """Eager load common attendance relations"""
        from models import Attendance
        return query.options(
            joinedload(Attendance.employee).joinedload(Employee.user),
            joinedload(Attendance.organization),
            joinedload(Attendance.company),
        )
    
    @staticmethod
    def eager_load_leave_relations(query: Query) -> Query:
        """Eager load common leave relations"""
        from models import LeaveApplication
        return query.options(
            joinedload(LeaveApplication.employee).joinedload(Employee.user),
            joinedload(LeaveApplication.organization),
            joinedload(LeaveApprovalHistory.approver),
        )
    
    @staticmethod
    def eager_load_payroll_relations(query: Query) -> Query:
        """Eager load common payroll relations"""
        from models import Payroll
        return query.options(
            joinedload(Payroll.employee).joinedload(Employee.user),
            joinedload(Payroll.organization),
            joinedload(Payroll.company),
        )
    
    @staticmethod
    def eager_load_expense_relations(query: Query) -> Query:
        """Eager load common expense relations"""
        from models import Expense
        return query.options(
            joinedload(Expense.employee).joinedload(Employee.user),
            joinedload(Expense.organization),
            joinedload(Expense.company),
        )


def optimize_employee_query(query: Query) -> Query:
    """Optimize employee queries with eager loading"""
    return QueryOptimizer.eager_load_employee_relations(query)


def optimize_attendance_query(query: Query) -> Query:
    """Optimize attendance queries with eager loading"""
    return QueryOptimizer.eager_load_attendance_relations(query)


def optimize_leave_query(query: Query) -> Query:
    """Optimize leave queries with eager loading"""
    return QueryOptimizer.eager_load_leave_relations(query)


def optimize_payroll_query(query: Query) -> Query:
    """Optimize payroll queries with eager loading"""
    return QueryOptimizer.eager_load_payroll_relations(query)


def optimize_expense_query(query: Query) -> Query:
    """Optimize expense queries with eager loading"""
    return QueryOptimizer.eager_load_expense_relations(query)


class QueryCounter:
    """Track and log query counts for N+1 detection"""
    
    def __init__(self):
        self.count = 0
        self.queries: List[str] = []
    
    def log_query(self, query_str: str):
        """Log a query for analysis"""
        self.count += 1
        self.queries.append(query_str)
    
    def check_n_plus_1(self, expected_max: int = 10):
        """Check if N+1 problem detected"""
        if self.count > expected_max:
            logger.warning(f"Possible N+1 query detected: {self.count} queries executed")
            return True
        return False
    
    def reset(self):
        self.count = 0
        self.queries = []


# Import models for eager loading
from models import Employee, Attendance, LeaveApplication, LeaveApprovalHistory, Payroll, Expense
