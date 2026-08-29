"""
Repository Layer - Data Access
Following Repository Pattern for database abstraction
"""

from .base_repository import BaseRepository, RepositoryFactory
from .employee_repository import (
    EmployeeRepository,
    EmployeeTransferRepository,
    EmployeeAssignmentRepository
)

__all__ = [
    'BaseRepository',
    'RepositoryFactory',
    'EmployeeRepository',
    'EmployeeTransferRepository',
    'EmployeeAssignmentRepository',
]
