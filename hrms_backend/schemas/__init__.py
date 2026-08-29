"""
Schema Layer - Data Transfer Objects
Following DTO Pattern with Pydantic
"""

from .employee_schemas import (
    # Employee schemas
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeInDB,
    EmployeeStatus,
    EmploymentType,
    
    # Transfer schemas
    EmployeeTransferCreate,
    EmployeeTransferUpdate,
    EmployeeTransferResponse,
    TransferType,
    TransferStatus,
    
    # Assignment schemas
    BranchAssignmentCreate,
    BranchAssignmentUpdate,
    BranchAssignmentResponse,
    DepartmentAssignmentCreate,
    DepartmentAssignmentUpdate,
    DepartmentAssignmentResponse,
    AssignmentStatus,
    
    # Search schemas
    EmployeeSearchFilters,
    EmployeeListResponse,
    
    # Lifecycle schemas
    LifecycleEventType,
    EmployeeLifecycleEventCreate,
    EmployeeLifecycleEventResponse,
)

__all__ = [
    'EmployeeCreate',
    'EmployeeUpdate',
    'EmployeeResponse',
    'EmployeeInDB',
    'EmployeeStatus',
    'EmploymentType',
    'EmployeeTransferCreate',
    'EmployeeTransferUpdate',
    'EmployeeTransferResponse',
    'TransferType',
    'TransferStatus',
    'BranchAssignmentCreate',
    'BranchAssignmentUpdate',
    'BranchAssignmentResponse',
    'DepartmentAssignmentCreate',
    'DepartmentAssignmentUpdate',
    'DepartmentAssignmentResponse',
    'AssignmentStatus',
    'EmployeeSearchFilters',
    'EmployeeListResponse',
    'LifecycleEventType',
    'EmployeeLifecycleEventCreate',
    'EmployeeLifecycleEventResponse',
]
