"""
SuperAdmin Pydantic Schemas
"""
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============== PLAN SCHEMAS ==============

class PlanBase(BaseModel):
    name: str
    display_name: str
    price_monthly: float = 0.0
    price_yearly: float = 0.0
    max_employees: int = 10
    features: List[str] = []
    is_active: bool = True


class PlanCreate(PlanBase):
    pass


class PlanUpdate(PlanBase):
    pass


class PlanResponse(PlanBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============== SUBSCRIPTION SCHEMAS ==============

class SubscriptionBase(BaseModel):
    plan_id: int
    status: str = "trial"  # active, trial, expired, suspended
    billing_cycle: str = "monthly"


class SubscriptionCreate(SubscriptionBase):
    organization_id: int


class SubscriptionUpdate(BaseModel):
    plan_id: Optional[int] = None
    status: Optional[str] = None
    billing_cycle: Optional[str] = None
    next_billing_date: Optional[datetime] = None


class SubscriptionResponse(SubscriptionBase):
    id: int
    organization_id: int
    next_billing_date: Optional[datetime]
    trial_ends_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    plan: Optional[PlanResponse]
    
    class Config:
        from_attributes = True


# ============== TENANT SCHEMAS ==============

class TenantCreate(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=100)
    company_code: Optional[str] = None
    code: Optional[str] = None
    
    # Organization Details
    domain: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    
    # Admin Details
    admin_email: str = Field(..., pattern=r"^[^@]+@[^@]+\.[^@]+$")
    admin_name: str = Field(..., min_length=2, max_length=100)
    admin_phone: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)
    admin_password: Optional[str] = Field(None, min_length=8)
    
    # Compliance & Security
    logo_url: Optional[str] = None
    legal_name: Optional[str] = None
    gst_no: Optional[str] = None
    pan_no: Optional[str] = None
    tan_no: Optional[str] = None
    registration_no: Optional[str] = None
    tin_no: Optional[str] = None
    data_retention_policy: str = "1 yr"
    audit_logging_enabled: bool = True
    device_verification_enabled: bool = False
    
    # Configuration
    default_currency: str = "USD"
    timezone: str = "UTC"
    date_format: str = "YYYY-MM-DD"
    language_preference: str = "en"
    
    plan_id: Optional[int] = None
    plan: Optional[str] = None
    modules: Optional[List[str]] = None

    @field_validator('plan_id', mode='before')
    @classmethod
    def coerce_plan_id(cls, v):
        if v in (None, '', 'null'):
            return None
        return int(v)

    @field_validator('password', mode='before')
    @classmethod
    def coerce_password(cls, v):
        if v in (None, '', 'null'):
            return None
        return str(v)


class TenantUpdate(BaseModel):
    company_name: Optional[str] = None
    company_code: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    admin_name: Optional[str] = None
    admin_email: Optional[EmailStr] = None
    admin_phone: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)
    logo_url: Optional[str] = None
    legal_name: Optional[str] = None
    gst_no: Optional[str] = None
    pan_no: Optional[str] = None
    registration_no: Optional[str] = None
    tin_no: Optional[str] = None
    data_retention_policy: Optional[str] = None
    audit_logging_enabled: Optional[bool] = None
    device_verification_enabled: Optional[bool] = None
    default_currency: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    language_preference: Optional[str] = None
    plan_id: Optional[int] = None
    modules: Optional[List[str]] = None
    status: Optional[str] = None  # active, suspended, deleted


class TenantResponse(BaseModel):
    id: int
    company_name: str
    company_code: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    email: Optional[str]
    status: str
    plan_name: Optional[str]
    max_employees: int
    employee_count: int
    created_at: datetime
    last_login: Optional[datetime]
    logo_url: Optional[str] = None
    legal_name: Optional[str] = None
    gst_no: Optional[str] = None
    pan_no: Optional[str] = None
    registration_no: Optional[str] = None
    tin_no: Optional[str] = None
    data_retention_policy: Optional[str] = None
    audit_logging_enabled: Optional[bool] = None
    device_verification_enabled: Optional[bool] = None
    default_currency: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    language_preference: Optional[str] = None
    modules: Optional[List[str]] = None
    
    class Config:
        from_attributes = True


# ============== PERMISSION SCHEMAS ==============

class PermissionBase(BaseModel):
    module: str
    can_read: bool = False
    can_write: bool = False
    can_delete: bool = False


class PermissionCreate(PermissionBase):
    user_id: int


class PermissionUpdate(PermissionBase):
    pass


class PermissionResponse(PermissionBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PermissionMatrix(BaseModel):
    """Full permission matrix for a user"""
    user_id: int
    user_name: str
    user_email: str
    permissions: Dict[str, Dict[str, bool]]  # module -> {can_read, can_write, can_delete}


# ============== FEATURE FLAG SCHEMAS ==============

class FeatureFlagBase(BaseModel):
    flag: str
    enabled: bool = True
    description: Optional[str] = None


class FeatureFlagCreate(FeatureFlagBase):
    organization_id: Optional[int] = None  # NULL = global


class FeatureFlagUpdate(BaseModel):
    enabled: Optional[bool] = None
    description: Optional[str] = None


class FeatureFlagResponse(FeatureFlagBase):
    id: int
    organization_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ============== AUDIT LOG SCHEMAS ==============

class AuditLogBase(BaseModel):
    action: str
    module: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None


class AuditLogCreate(AuditLogBase):
    user_id: Optional[int] = None
    organization_id: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AuditLogResponse(AuditLogBase):
    id: int
    user_id: Optional[int]
    user_name: Optional[str]
    organization_id: Optional[int]
    organization_name: Optional[str]
    ip_address: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogFilter(BaseModel):
    user_id: Optional[int] = None
    organization_id: Optional[int] = None
    module: Optional[str] = None
    action: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


# ============== SYSTEM HEALTH SCHEMAS ==============

class SystemHealthResponse(BaseModel):
    database: Dict[str, Any]  # status: str, latency_ms: int
    redis: Optional[Dict[str, Any]]
    active_users: int
    total_tenants: int
    api_calls_today: int
    timestamp: datetime


class HealthStatus(BaseModel):
    service: str
    status: str  # healthy, degraded, down
    latency_ms: Optional[int]
    message: Optional[str]


# ============== IMPERSONATION SCHEMAS ==============

class ImpersonateRequest(BaseModel):
    user_id: int


class ImpersonateResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    message: str = "Impersonation successful"


# ============== SUPERADMIN DASHBOARD SCHEMAS ==============

class SuperAdminDashboardStats(BaseModel):
    total_tenants: int
    active_tenants: int
    suspended_tenants: int
    trial_tenants: int
    total_users: int
    active_users_today: int
    api_calls_24h: int
    revenue_this_month: float
    system_status: SystemHealthResponse
