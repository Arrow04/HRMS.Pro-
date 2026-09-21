"""
Employee Schemas - Pydantic models for request/response validation
Follows Data Transfer Object (DTO) pattern
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum


class EmployeeStatus(str, Enum):
    """Employee status enumeration"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ONBOARDING = "onboarding"
    OFFBOARDING = "offboarding"
    SUSPENDED = "suspended"


class EmploymentType(str, Enum):
    """Employment type enumeration"""
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERN = "intern"


# ==================== EMPLOYEE SCHEMAS ====================

class EmployeeBase(BaseModel):
    """Base employee fields"""
    full_name: str = Field(..., min_length=1, max_length=255)
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: str = Field(..., pattern=r'^\S+@\S+\.\S+$')
    employee_code: str = Field(..., min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=50)
    date_of_birth: Optional[date] = None
    gender: Optional[str] = Field(None, max_length=20)
    is_person_with_disability: Optional[bool] = False
    address: Optional[str] = Field(None, max_length=500)
    emergency_contact: Optional[str] = Field(None, max_length=100)
    emergency_phone: Optional[str] = Field(None, max_length=50)
    date_of_leaving: Optional[date] = None
    termination_type: Optional[str] = Field(None, max_length=50)
    notice_period_served: Optional[str] = Field(None, max_length=20)
    handover_completed: Optional[str] = Field(None, max_length=20)
    full_final_settlement: Optional[str] = Field(None, max_length=50)
    
    # Identity and Compliance fields (Indian context)
    voter_id: Optional[str] = Field(None, max_length=100)
    aadhar_number: Optional[str] = Field(None, max_length=100)
    pan_number: Optional[str] = Field(None, max_length=100)
    driving_license: Optional[str] = Field(None, max_length=100)
    passport_number: Optional[str] = Field(None, max_length=100)
    pf_number: Optional[str] = Field(None, max_length=100)
    pf_uan: Optional[str] = Field(None, max_length=100)
    esic_number: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=255)
    bank_account_number: Optional[str] = Field(None, max_length=100)
    ifsc_code: Optional[str] = Field(None, max_length=50)
    
    # Academic fields
    education_level: Optional[str] = Field(None, max_length=100)
    institution: Optional[str] = Field(None, max_length=255)
    degree: Optional[str] = Field(None, max_length=255)
    field_of_study: Optional[str] = Field(None, max_length=255)
    graduation_year: Optional[str] = Field(None, max_length=10)
    grade: Optional[str] = Field(None, max_length=50)
    certification: Optional[str] = Field(None, max_length=255)
    certification_org: Optional[str] = Field(None, max_length=255)
    certification_date: Optional[date] = None
    certification_expiry: Optional[date] = None
    skills: Optional[str] = Field(None, max_length=2000)
    language1: Optional[str] = Field(None, max_length=100)
    language2: Optional[str] = Field(None, max_length=100)
    language3: Optional[str] = Field(None, max_length=100)


class EmployeeCreate(EmployeeBase):
    """Schema for creating employee"""
    company_id: int
    branch_id: int
    department_id: int
    designation_id: Optional[int] = None
    manager_id: Optional[int] = None
    join_date: date = Field(default_factory=date.today)
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    employment_type: str = "full_time"
    status: EmployeeStatus = EmployeeStatus.ACTIVE


class EmployeeUpdate(BaseModel):
    """Schema for updating employee"""
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, pattern=r'^\S+@\S+\.\S+$')
    phone: Optional[str] = Field(None, max_length=50)
    company_id: Optional[int] = None
    branch_id: Optional[int] = None
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    manager_id: Optional[int] = None
    status: Optional[EmployeeStatus] = None
    employment_type: Optional[str] = None
    address: Optional[str] = Field(None, max_length=500)
    
    # Academic fields
    education_level: Optional[str] = Field(None, max_length=100)
    institution: Optional[str] = Field(None, max_length=255)
    degree: Optional[str] = Field(None, max_length=255)
    field_of_study: Optional[str] = Field(None, max_length=255)
    graduation_year: Optional[str] = Field(None, max_length=10)
    grade: Optional[str] = Field(None, max_length=50)
    certification: Optional[str] = Field(None, max_length=255)
    certification_org: Optional[str] = Field(None, max_length=255)
    certification_date: Optional[date] = None
    certification_expiry: Optional[date] = None
    skills: Optional[str] = Field(None, max_length=2000)
    language1: Optional[str] = Field(None, max_length=100)
    language2: Optional[str] = Field(None, max_length=100)
    language3: Optional[str] = Field(None, max_length=100)


class EmployeeInDB(EmployeeBase):
    """Schema for employee as stored in DB"""
    id: int
    company_id: Optional[int] = None
    branch_id: Optional[int] = None
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    manager_id: Optional[int] = None
    join_date: date
    status: str
    employment_type: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmployeeResponse(EmployeeInDB):
    """Full employee response with relations"""
    company_name: Optional[str] = None
    branch_name: Optional[str] = None
    department_name: Optional[str] = None
    designation_title: Optional[str] = None
    manager_name: Optional[str] = None


# ==================== TRANSFER SCHEMAS ====================

class TransferType(str, Enum):
    """Transfer type enumeration"""
    TEMPORARY = "temporary"
    PERMANENT = "permanent"


class TransferStatus(str, Enum):
    """Transfer status enumeration"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class EmployeeTransferBase(BaseModel):
    """Base transfer fields"""
    employee_id: int
    from_branch_id: int
    from_department_id: Optional[int] = None
    to_branch_id: int
    to_department_id: Optional[int] = None
    type: TransferType
    start_date: date
    end_date: Optional[date] = None
    reason: str = Field(..., min_length=1)


class EmployeeTransferCreate(EmployeeTransferBase):
    """Schema for creating transfer"""
    pass


class EmployeeTransferUpdate(BaseModel):
    """Schema for updating transfer"""
    status: Optional[TransferStatus] = None
    notes: Optional[str] = None


class EmployeeTransferInDB(EmployeeTransferBase):
    """Transfer as stored in DB"""
    id: int
    status: str
    requested_by: Optional[int] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmployeeTransferResponse(EmployeeTransferInDB):
    """Full transfer response with names"""
    employee_name: str
    from_branch_name: str
    from_department_name: Optional[str] = None
    to_branch_name: str
    to_department_name: Optional[str] = None
    requested_by_name: Optional[str] = None
    approved_by_name: Optional[str] = None


# ==================== ASSIGNMENT SCHEMAS ====================

class AssignmentStatus(str, Enum):
    """Assignment status enumeration"""
    ACTIVE = "active"
    INACTIVE = "inactive"


class BranchAssignmentBase(BaseModel):
    """Base branch assignment fields"""
    employee_id: int
    branch_id: int
    is_primary: bool = False
    start_date: date = Field(default_factory=date.today)
    status: AssignmentStatus = AssignmentStatus.ACTIVE


class BranchAssignmentCreate(BranchAssignmentBase):
    """Schema for creating branch assignment"""
    pass


class BranchAssignmentUpdate(BaseModel):
    """Schema for updating branch assignment"""
    is_primary: Optional[bool] = None
    end_date: Optional[date] = None
    status: Optional[AssignmentStatus] = None


class BranchAssignmentInDB(BranchAssignmentBase):
    """Branch assignment as stored in DB"""
    id: int
    end_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BranchAssignmentResponse(BranchAssignmentInDB):
    """Full branch assignment response"""
    employee_name: str
    branch_name: str


class DepartmentAssignmentBase(BaseModel):
    """Base department assignment fields"""
    employee_id: int
    department_id: int
    is_primary: bool = False
    start_date: date = Field(default_factory=date.today)
    status: AssignmentStatus = AssignmentStatus.ACTIVE


class DepartmentAssignmentCreate(DepartmentAssignmentBase):
    """Schema for creating department assignment"""
    pass


class DepartmentAssignmentUpdate(DepartmentAssignmentBase):
    """Schema for updating department assignment"""
    is_primary: Optional[bool] = None
    end_date: Optional[date] = None
    status: Optional[AssignmentStatus] = None


class DepartmentAssignmentInDB(DepartmentAssignmentBase):
    """Department assignment as stored in DB"""
    id: int
    end_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepartmentAssignmentResponse(DepartmentAssignmentInDB):
    """Full department assignment response"""
    employee_name: str
    department_name: str


# ==================== SEARCH & FILTER SCHEMAS ====================

class EmployeeSearchFilters(BaseModel):
    """Filters for employee search"""
    company_id: Optional[int] = None
    branch_id: Optional[int] = None
    department_id: Optional[int] = None
    status: Optional[EmployeeStatus] = None
    employment_type: Optional[str] = None
    search: Optional[str] = None


class EmployeeListResponse(BaseModel):
    """Paginated employee list response"""
    total: int
    items: List[EmployeeResponse]
    page: int
    page_size: int


# ==================== LIFECYCLE EVENT SCHEMAS ====================

class LifecycleEventType(str, Enum):
    """Lifecycle event types"""
    JOINED = "joined"
    TRANSFER = "transfer"
    PROMOTION = "promotion"
    TERMINATION = "termination"
    RESIGNATION = "resignation"
    SUSPENSION = "suspension"
    REACTIVATION = "reactivation"


class EmployeeLifecycleEventBase(BaseModel):
    """Base lifecycle event fields"""
    employee_id: int
    event_type: LifecycleEventType
    event_date: date
    description: Optional[str] = None
    from_value: Optional[str] = None
    to_value: Optional[str] = None


class EmployeeLifecycleEventCreate(EmployeeLifecycleEventBase):
    """Schema for creating lifecycle event"""
    pass


class EmployeeLifecycleEventInDB(EmployeeLifecycleEventBase):
    """Lifecycle event as stored in DB"""
    id: int
    metadata: Optional[dict] = None
    recorded_by: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EmployeeLifecycleEventResponse(EmployeeLifecycleEventInDB):
    """Full lifecycle event response"""
    employee_name: str
    recorded_by_name: Optional[str] = None
