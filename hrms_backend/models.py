from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, Time, Float, Text, ForeignKey, JSON, Table, UniqueConstraint, DECIMAL, Index
from sqlalchemy.orm import relationship
from datetime import datetime, date
from database import Base
import enum

# Role Enum for RBAC
class Role(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    hr_admin = "hr_admin"
    hr_manager = "hr_manager"
    hr_executive = "hr_executive"
    employee = "employee"

class SuperAdminRoleEnum(str, enum.Enum):
    superadmin = "superadmin"
    auditor = "auditor"
    tenant_manager = "tenant_manager"
    compliance_officer = "compliance_officer"

# HRMS Modules List
MODULES_LIST = [
    "dashboard", "company", "employees", "attendance", "holidays", 
    "recruitment", "leaves", "payroll", "expenses", "performance", 
    "reports", "master_data", "settings", "assets", "exit", "anomalies",
    "superadmin_console"
]

# Association table for many-to-many relationship between Employees and Branches
employee_branches = Table(
    'employee_branches',
    Base.metadata,
    Column('employee_id', Integer, ForeignKey('employees.id'), primary_key=True),
    Column('branch_id', Integer, ForeignKey('branches.id'), primary_key=True)
)

# Association table for many-to-many relationship between Employees and Companies
employee_companies = Table(
    'employee_companies',
    Base.metadata,
    Column('employee_id', Integer, ForeignKey('employees.id'), primary_key=True),
    Column('company_id', Integer, ForeignKey('companies.id'), primary_key=True)
)

class User(Base):
    """User model for authentication"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    phone = Column(String(20), unique=True, nullable=True)
    passcode = Column(String(10), nullable=True)
    role = Column(String(50), default='employee', index=True)  # admin, manager, employee
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    is_active = Column(Boolean, default=True, index=True)
    date_joined = Column(Date, nullable=True)
    join_time = Column(Time, nullable=True)
    is_locked_to_device = Column(Boolean, default=False)
    device_id = Column(String(255), nullable=True)
    allow_multi_device = Column(Boolean, default=True)  # Permission to login from multiple devices (default: true)
    last_login = Column(DateTime)
    theme_settings = Column(JSON, default=lambda: {"fontFamily": "Inter"})
    token_version = Column(Integer, default=0)
    
    # OTP and verification fields
    otp = Column(String(6), nullable=True)
    otp_expiry = Column(DateTime, nullable=True)
    reset_token = Column(String(64), nullable=True)
    reset_token_expiry = Column(DateTime, nullable=True)
    email_verified = Column(Boolean, default=False)
    phone_verified = Column(Boolean, default=False)
    email_verification_token = Column(String(255), nullable=True)
    email_verification_expiry = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    # employee = relationship('Employee', back_populates='user', uselist=False, primaryjoin='User.id==Employee.user_id')
    organization = relationship('Organization', backref='users')
    
    def __repr__(self):
        return f'<User {self.email}>'


class Organization(Base):
    """Organization model"""
    __tablename__ = 'organizations'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True)
    description = Column(Text)
    address = Column(Text)
    phone = Column(String(50))
    email = Column(String(255), index=True)
    website = Column(String(255))
    logo_url = Column(String(500))
    status = Column(String(50), default='active', index=True)  # active, inactive
    
    # New Organization Details
    domain = Column(String(255), unique=True, index=True)
    industry = Column(String(100))
    company_size = Column(String(50))
    
    # Compliance & Security
    legal_name = Column(String(255))
    gst_no = Column(String(50))
    pan_no = Column(String(50))
    tan_no = Column(String(50))
    registration_no = Column(String(100))
    tin_no = Column(String(50))
    data_retention_policy = Column(String(50), default='1 yr')
    audit_logging_enabled = Column(Boolean, default=True)
    device_verification_enabled = Column(Boolean, default=False)
    
    # Configuration
    default_currency = Column(String(10), default='INR')
    timezone = Column(String(50), default='Asia/Kolkata')
    date_format = Column(String(20), default='YYYY-MM-DD')
    language_preference = Column(String(20), default='en')
    country = Column(String(50), default='India')  # Payroll & tax document country (India, USA, UK, UAE, etc.)
    
    # Location & Compliance
    registered_state = Column(String(100), nullable=True)  # For state-specific PT/LWF
    registered_city = Column(String(100), nullable=True)
    
    # Default Payroll Configuration (optional FKs to org-level policies)
    default_payroll_policy_id = Column(Integer, ForeignKey('payroll_policies.id'), nullable=True)
    default_attendance_policy_id = Column(Integer, ForeignKey('attendance_policies.id'), nullable=True)
    default_tax_regime_id = Column(Integer, ForeignKey('tax_regimes.id'), nullable=True)

    # Persisted settings blob (attendance, leave, payroll, performance, security, integrations, notifications)
    settings = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    companies = relationship('Company', backref='organization', lazy=True)
    departments = relationship('Department', backref='organization', lazy=True)
    employees = relationship('Employee', backref='organization', lazy=True)
    subscription = relationship('Subscription', back_populates='organization', uselist=False)
    
    def __repr__(self):
        return f'<Organization {self.name}>'


class Company(Base):
    """Company model (Legal Entity within an Organization)"""
    __tablename__ = 'companies'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True)
    description = Column(Text)
    registration_number = Column(String(100))
    tax_id = Column(String(100))
    cin = Column(String(100))
    industry = Column(String(100))
    company_size = Column(String(100))
    pan_no = Column(String(50))
    tan_no = Column(String(50))
    gst_no = Column(String(50))
    address = Column(Text)
    state = Column(String(100))
    pincode = Column(String(10))
    website = Column(String(255))
    email = Column(String(255), index=True)
    phone = Column(String(50))
    logo = Column(String(500))
    country = Column(String(50), nullable=True)  # Payroll & tax document country (defaults to org country)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    branches = relationship('Branch', backref='company', lazy=True)
    departments = relationship('Department', backref='company', lazy=True)
    employees = relationship('Employee', secondary=employee_companies, back_populates='companies')
    
    def __repr__(self):
        return f'<Company {self.name}>'


class Department(Base):
    """Department model"""
    __tablename__ = 'departments'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    description = Column(Text)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    manager_id = Column(Integer, ForeignKey('employees.id'), nullable=True, index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    employees = relationship('Employee', lazy=True, foreign_keys='Employee.department_id')
    
    def __repr__(self):
        return f'<Department {self.name}>'


class DeviceBinding(Base):
    """Device binding model for tracking user devices"""
    __tablename__ = 'device_bindings'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    device_fingerprint = Column(String(255), nullable=False, unique=True)
    device_name = Column(String(255))  # e.g., "John's iPhone", "Office Laptop"
    device_type = Column(String(50))  # mobile, desktop, tablet
    user_agent = Column(Text)
    ip_address = Column(String(50))
    is_active = Column(Boolean, default=True, index=True)
    last_used = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship('User', backref='device_bindings')
    
    def __repr__(self):
        return f'<DeviceBinding {self.device_name or self.device_fingerprint}>'


class TerminationType(Base):
    """Termination Type model - Master data for employee offboarding"""
    __tablename__ = 'termination_types'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)  # e.g., Resigned, Terminated, Absconded, Retired
    code = Column(String(50), unique=True, nullable=False)  # e.g., resigned, terminated
    description = Column(Text)
    requires_notice_period = Column(Boolean, default=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    def __repr__(self):
        return f'<TerminationType {self.name}>'


class Employee(Base):
    """Employee model"""
    __tablename__ = 'employees'
    __table_args__ = (
        # Composite indexes for tenant-scoped queries at scale
        Index('idx_emp_org_status', 'organization_id', 'status'),
        Index('idx_emp_org_deleted', 'organization_id', 'deleted_at'),
        Index('idx_emp_company_status', 'company_id', 'status'),
        Index('idx_emp_org_id', 'organization_id', 'id'),
        Index('idx_emp_department_status', 'department_id', 'status'),
    )
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), unique=True, index=True)
    full_name = Column(String(255), index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100))
    email = Column(String(255), nullable=False, index=True)
    employee_code = Column(String(50), unique=True)
    designation = Column(String(255))
    designation_id = Column(Integer, ForeignKey('designations.id'), nullable=True, index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), nullable=True, index=True)
    reporting_manager_id = Column(Integer, ForeignKey('employees.id'), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    # Identity details
    voter_id = Column(String(100))
    aadhar_number = Column(String(100))
    pan_number = Column(String(100))
    driving_license = Column(String(100))
    passport_number = Column(String(100))
    birth_certificate_number = Column(String(100))
    
    # Academic details
    education_level = Column(String(100))
    institution = Column(String(255))
    degree = Column(String(255))
    field_of_study = Column(String(255))
    graduation_year = Column(String(10))
    grade = Column(String(50))
    certification = Column(String(255))
    certification_org = Column(String(255))
    certification_date = Column(DateTime)
    certification_expiry = Column(DateTime)
    skills = Column(Text)
    language1 = Column(String(100))
    language2 = Column(String(100))
    language3 = Column(String(100))
    languages = Column(JSON, default=list)  # Dynamic list of languages: [{name, proficiency, read, write, speak}]
    
    # Personal details
    date_of_birth = Column(DateTime)
    gender = Column(String(20))
    blood_group = Column(String(10))  # A+, B+, O+, AB+, A-, B-, O-, AB-
    marital_status = Column(String(20))  # single, married, divorced, widowed
    phone = Column(String(50))
    address = Column(String(500))
    current_address = Column(String(500))
    permanent_address = Column(String(500))
    landmark = Column(String(255))  # Optional landmark for address location
    permanent_landmark = Column(String(255))  # Optional landmark for permanent address
    current_state = Column(String(100))
    current_pincode = Column(String(10))
    permanent_state = Column(String(100))
    permanent_pincode = Column(String(10))
    emergency_contact = Column(String(100))
    emergency_phone = Column(String(50))
    
    # Benefits
    pf_number = Column(String(100))
    pf_uan = Column(String(100))
    esic_number = Column(String(100))
    mediclaim_number = Column(String(100))
    mediclaim_provider = Column(String(200))
    life_insurance_number = Column(String(100))
    life_insurance_provider = Column(String(200))
    
    # Family info
    father_name = Column(String(255))
    mother_name = Column(String(255))
    sibling_name = Column(String(255))
    spouse_name = Column(String(255))
    spouse_phone = Column(String(50))
    number_of_children = Column(Integer, default=0)
    nominee_name = Column(String(255))
    nominee_relationship = Column(String(100))
    
    # Family info (JSON) - for additional family details
    family_info = Column(JSON, default=list)
    
    # Education details (JSON)
    education_details = Column(JSON, default=list)

    # Certifications (JSON) - multiple certifications: [{name, organization, issueDate, expiryDate, grade, url}]
    certifications = Column(JSON, default=list)

    # Experience details (JSON) - multiple previous organizations
    experience_details = Column(JSON, default=list)

    # Achievements details (JSON) - multiple achievements
    achievements_details = Column(JSON, default=list)

    # Activities details (JSON) - multiple extra-curricular activities
    activities_details = Column(JSON, default=list)

    # Skills list (JSON) - multiple skills with proficiency
    skills_list = Column(JSON, default=list)
    
    # Employment details
    join_date = Column(DateTime, default=datetime.utcnow)
    termination_date = Column(DateTime)
    date_of_leaving = Column(DateTime)  # Last working day
    termination_type = Column(String(50))  # resigned, terminated, absconded, retired
    notice_period_served = Column(String(20))  # yes, no, partial
    handover_completed = Column(String(20), default='no')  # yes, no
    full_final_settlement = Column(String(50), default='pending')  # pending, completed, in_progress
    status = Column(String(50), default='active', index=True)  # active, on_leave, terminated
    employment_type = Column(String(50), default='full_time')  # full_time, part_time, contract
    
    # Salary details
    base_salary = Column(Float, default=0)
    salary_components = Column(JSON, default=dict)
    salary_template_id = Column(Integer, ForeignKey('salary_templates.id'), nullable=True, index=True)

    # Company whose salary policy / payroll templates apply to this employee
    # (independent of the org-level company_id; used to scope payroll templates)
    salary_company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    
    # Per-employee policy overrides (nullable — falls back to org defaults)
    payroll_policy_id = Column(Integer, ForeignKey('payroll_policies.id'), nullable=True, index=True)
    attendance_policy_id = Column(Integer, ForeignKey('attendance_policies.id'), nullable=True, index=True)
    tax_regime_id = Column(Integer, ForeignKey('tax_regimes.id'), nullable=True, index=True)

    # Company-wise payroll template (bundles policy + components + statutory +
    # tax regime + attendance + state compliance). Set from the employee form.
    payroll_template_id = Column(Integer, ForeignKey('payroll_templates.id'), nullable=True, index=True)

    # Geofence: when enabled, check-in/out requires being within the branch geofence;
    # when disabled, the employee can check in/out from anywhere.
    geofence_enabled = Column(Boolean, default=False)
    
    # Bank details
    bank_name = Column(String(255))
    bank_account_number = Column(String(100))
    ifsc_code = Column(String(50))
    account_holder_name = Column(String(255))
    bank_accounts = Column(JSON, default=list)  # [{bankName, bankAccountNumber, ifscCode, accountHolderName, isPrimary}]
    
    # Documents
    resume_url = Column(String(500))
    id_proof_url = Column(String(500))
    photo_url = Column(String(500))
    # Individual identity document URLs: {aadhar, pan, voter, drivingLicense, passport}
    id_documents = Column(JSON, default=dict)
    
    # Login fields
    user_role = Column(String(50), default='employee')  # employee, hr_admin, hr_manager, manager
    login_id = Column(String(100), unique=True)  # Short alphanumeric login ID
    login_email = Column(String(255))  # Optional email for login/recovery
    
    custom_fields = Column(JSON, default=dict)  # Tenant-customizable fields
    
    # Onboarding tracking — stores completed step IDs as JSON array
    onboarding_step = Column(String(50), default="pending")  # pending, in_progress, completed
    onboarding_progress = Column(JSON, default=list)  # Array of completed step IDs
    
    # Device security fields (optional for device-binding security)
    device_name = Column(String(255), nullable=True)  # Device name / model
    device_type = Column(String(50), nullable=True)  # mobile_phone, tablet, laptop, desktop, other
    device_ip_address = Column(String(50), nullable=True)  # IP address for device verification
    device_mac_address = Column(String(50), nullable=True)  # MAC address for device binding
    device_serial_number = Column(String(100), nullable=True)  # Serial/IMEI for device authentication
    device_assigned_date = Column(DateTime)  # Optional - Date when device was registered
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    # user = relationship('User', back_populates='employee', uselist=False, primaryjoin='Employee.user_id==User.id')
    leaves = relationship('LeaveApplication', foreign_keys='LeaveApplication.employee_id', back_populates='employee', lazy=True)
    attendances = relationship('Attendance', back_populates='employee', lazy=True)
    expenses = relationship('Expense', back_populates='employee', lazy=True)
    payrolls = relationship('Payroll', back_populates='employee', lazy=True)
    salary_revisions = relationship('SalaryRevision', back_populates='employee', lazy=True)
    salary_loans = relationship('SalaryLoan', back_populates='employee', lazy=True)
    branches = relationship('Branch', secondary=employee_branches, back_populates='employees')
    companies = relationship('Company', secondary=employee_companies, back_populates='employees')
    department = relationship('Department', foreign_keys='[Employee.department_id]', overlaps='employees')
    designation_obj = relationship('Designation', foreign_keys='[Employee.designation_id]')
    company = relationship('Company', foreign_keys='[Employee.company_id]', lazy=True)
    reporting_manager = relationship('Employee', remote_side='Employee.id', foreign_keys='[Employee.reporting_manager_id]', backref='direct_reports', lazy=True)
    rosters = relationship('DutyRoster', back_populates='employee', lazy=True)
    
    def __repr__(self):
        label = self.full_name or f"{self.first_name} {self.last_name}".strip()
        return f'<Employee {label}>'


class LeaveBalance(Base):
    """Leave balance model"""
    __tablename__ = 'leave_balances'
    
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), index=True)
    year = Column(Integer, nullable=False)
    leave_type_id = Column(Integer, ForeignKey('leave_types.id'), nullable=False, index=True)
    total_days = Column(Integer, default=0)
    used_days = Column(Integer, default=0)
    remaining_days = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    employee = relationship('Employee', backref='leave_balances')
    
    def __repr__(self):
        return f'<LeaveBalance {self.employee_id}>'


class LeaveApplication(Base):
    """Leave application model"""
    __tablename__ = 'leave_applications'
    __table_args__ = (
        # Composite indexes for leave queries at scale
        Index('idx_leave_org_status', 'organization_id', 'status'),
        Index('idx_leave_emp_start', 'employee_id', 'start_date'),
        Index('idx_leave_org_start', 'organization_id', 'start_date'),
        Index('idx_leave_org_emp_status', 'organization_id', 'employee_id', 'status'),
    )

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey('leave_types.id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)

    # Leave period
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    total_days = Column(Integer, nullable=False)
    start_time = Column(DateTime)  # For half-day or hourly leaves
    end_time = Column(DateTime)

    # Leave details
    reason = Column(Text)
    purpose = Column(String(255))  # medical, personal, family, emergency, etc.
    description = Column(Text)
    attachment_url = Column(String(500))  # Medical certificate, etc.

    # Multi-level approval workflow
    status = Column(String(50), default='pending', index=True)  # pending, manager_approved, hr_approved, approved, rejected, cancelled, on_hold
    current_approval_level = Column(Integer, default=1)  # 1=manager, 2=hr, 3=director
    total_approval_levels = Column(Integer, default=2)
    
    # Level 1 Approval (Manager)
    level1_approver_id = Column(Integer, ForeignKey('users.id'), index=True)
    level1_approved_at = Column(DateTime)
    level1_comments = Column(Text)
    
    # Level 2 Approval (HR)
    level2_approver_id = Column(Integer, ForeignKey('users.id'), index=True)
    level2_approved_at = Column(DateTime)
    level2_comments = Column(Text)
    
    # Level 3 Approval (Director/Finance - optional)
    level3_approver_id = Column(Integer, ForeignKey('users.id'), index=True)
    level3_approved_at = Column(DateTime)
    level3_comments = Column(Text)
    
    # Final approval
    approver_id = Column(Integer, ForeignKey('users.id'), index=True)
    approved_at = Column(DateTime)
    rejection_reason = Column(Text)
    rejection_level = Column(Integer)  # At which level was rejected
    comments = Column(Text)

    # Leave balance impact
    balance_deducted = Column(Integer, default=0)
    carry_forward_used = Column(Integer, default=0)
    compensatory_off_used = Column(Integer, default=0)

    # Contact during leave
    emergency_contact = Column(String(255))
    emergency_phone = Column(String(20))
    work_handover_to = Column(Integer, ForeignKey('employees.id'), index=True)
    handover_notes = Column(Text)

    # Additional context
    is_half_day = Column(Boolean, default=False)
    is_paid = Column(Boolean, default=True)
    is_privilege = Column(Boolean, default=False)
    is_encashable = Column(Boolean, default=False)
    encashment_amount = Column(Float, default=0)

    # Rescheduling
    rescheduled_from = Column(DateTime)
    rescheduled_to = Column(DateTime)
    reschedule_reason = Column(Text)

    # Mobile/External integration
    mobile_request_id = Column(String(100))  # ID from mobile app
    request_source = Column(String(50), default='web')  # web, mobile, api
    ip_address = Column(String(50))
    user_agent = Column(String(500))

    # System fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    employee = relationship('Employee', foreign_keys=[employee_id], back_populates='leaves')
    approver = relationship('User', foreign_keys=[approver_id], backref='approved_leaves')
    level1_approver = relationship('User', foreign_keys=[level1_approver_id], backref='level1_approved_leaves')
    level2_approver = relationship('User', foreign_keys=[level2_approver_id], backref='level2_approved_leaves')
    level3_approver = relationship('User', foreign_keys=[level3_approver_id], backref='level3_approved_leaves')
    handover_to_employee = relationship('Employee', foreign_keys=[work_handover_to], backref='handover_received')

    def __repr__(self):
        return f'<LeaveApplication {self.id}>'


class LeaveApprovalHistory(Base):
    """Leave approval history/audit trail model"""
    __tablename__ = 'leave_approval_history'

    id = Column(Integer, primary_key=True)
    leave_application_id = Column(Integer, ForeignKey('leave_applications.id'), nullable=False, index=True)
    approver_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    approval_level = Column(Integer, nullable=False)  # 1, 2, 3
    action = Column(String(50), nullable=False, index=True)  # approved, rejected, forwarded, on_hold
    previous_status = Column(String(50))
    new_status = Column(String(50))
    comments = Column(Text)
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    leave_application = relationship('LeaveApplication', backref='approval_history')
    approver = relationship('User', backref='leave_approvals')

    def __repr__(self):
        return f'<LeaveApprovalHistory {self.id}>'


class Attendance(Base):
    """Attendance model"""
    __tablename__ = 'attendances'
    __table_args__ = (
        # Composite indexes for time-series queries at scale
        Index('idx_att_org_date', 'organization_id', 'date'),
        Index('idx_att_emp_date', 'employee_id', 'date'),
        Index('idx_att_company_date', 'company_id', 'date'),
        Index('idx_att_org_emp_date', 'organization_id', 'employee_id', 'date'),
        Index('idx_att_org_status_date', 'organization_id', 'status', 'date'),
    )

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)
    shift_id = Column(Integer, ForeignKey('shifts.id'), index=True)

    # Date and time
    date = Column(DateTime, nullable=False)
    check_in = Column(DateTime)
    check_out = Column(DateTime)
    status = Column(String(50), default='present', index=True)  # present, absent, late, half_day, on_leave, work_from_home

    # Work hours calculation
    work_hours = Column(Float, default=0)
    scheduled_hours = Column(Float, default=8)
    overtime_hours = Column(Float, default=0)
    break_hours = Column(Float, default=0)

    # Late arrival / Early departure
    is_late = Column(Boolean, default=False)
    late_minutes = Column(Integer, default=0)
    is_early_departure = Column(Boolean, default=False)
    early_departure_minutes = Column(Integer, default=0)

    # Notes and comments
    notes = Column(Text)
    comments = Column(Text)
    reason = Column(String(255))  # For absence or late arrival

    # Location
    location = Column(String(255))
    check_in_location_name = Column(String(255))
    check_out_location_name = Column(String(255))

    # Geofence data
    check_in_latitude = Column(Float)
    check_in_longitude = Column(Float)
    check_out_latitude = Column(Float)
    check_out_longitude = Column(Float)
    geofence_id = Column(Integer)
    is_within_geofence = Column(Boolean, default=True)

    # Selfie data
    check_in_selfie_url = Column(String(500))
    check_out_selfie_url = Column(String(500))
    selfie_verified = Column(Boolean, default=False)

    # Device information
    device_id = Column(String(100))
    device_type = Column(String(50))  # mobile, web, biometric, kiosk
    ip_address = Column(String(50))
    user_agent = Column(String(500))

    # Work from home
    is_work_from_home = Column(Boolean, default=False)
    wfh_approval_id = Column(Integer)
    wfh_location = Column(String(255))

    # Approval workflow
    is_manual_entry = Column(Boolean, default=False)
    approved_by = Column(Integer, ForeignKey('users.id'), index=True)
    approved_at = Column(DateTime)
    approval_comments = Column(Text)

    # Leave integration
    leave_application_id = Column(Integer, ForeignKey('leave_applications.id'), index=True)
    is_on_leave = Column(Boolean, default=False)

    # Holiday integration
    is_holiday = Column(Boolean, default=False)
    holiday_id = Column(Integer)

    # Offline sync support (mobile)
    sync_status = Column(String(50), default='synced')  # synced, pending, conflict, failed
    sync_attempt_count = Column(Integer, default=0)
    last_sync_attempt = Column(DateTime)
    sync_error_message = Column(Text)
    offline_created_at = Column(DateTime)  # Timestamp when created offline
    offline_device_id = Column(String(100))  # Device that created the record offline

    # Conflict resolution
    conflict_resolution_status = Column(String(50))  # none, auto_resolved, manual_review, resolved
    conflict_resolved_by = Column(Integer, ForeignKey('users.id'), index=True)
    conflict_resolved_at = Column(DateTime)
    conflict_reason = Column(Text)

    # System fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    employee = relationship('Employee', back_populates='attendances')
    shift = relationship('Shift', backref='attendances')
    approver = relationship('User', foreign_keys=[approved_by], backref='approved_attendances')
    leave_application = relationship('LeaveApplication', backref='attendances')
    conflict_resolver = relationship('User', foreign_keys=[conflict_resolved_by], backref='resolved_conflicts')

    def __repr__(self):
        return f'<Attendance {self.employee_id} {self.date}>'


class AttendanceAuditLog(Base):
    """Comprehensive audit log for attendance changes"""
    __tablename__ = 'attendance_audit_logs'

    id = Column(Integer, primary_key=True)
    attendance_id = Column(Integer, ForeignKey('attendances.id'), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)  # created, updated, deleted, check_in, check_out, status_changed, synced, conflict_resolved
    previous_values = Column(JSON)  # Store previous state as JSON
    new_values = Column(JSON)  # Store new state as JSON
    changed_fields = Column(JSON)  # List of fields that changed
    action_by = Column(Integer, ForeignKey('users.id'), index=True)  # User who performed the action
    action_source = Column(String(50))  # web, mobile, api, system, sync
    device_id = Column(String(100))
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    reason = Column(Text)  # Reason for the change
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    attendance = relationship('Attendance', backref='audit_logs')
    employee = relationship('Employee', backref='attendance_audit_logs')
    actor = relationship('User', backref='attendance_audit_actions')

    def __repr__(self):
        return f'<AttendanceAuditLog {self.id}>'


class AttendanceCorrectionRequest(Base):
    """Attendance correction request model for employee -> admin approval workflow"""
    __tablename__ = 'attendance_correction_requests'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    attendance_id = Column(Integer, ForeignKey('attendances.id'), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)

    # Requested values
    request_date = Column(DateTime, nullable=False)
    requested_check_in = Column(DateTime)
    requested_check_out = Column(DateTime)
    requested_status = Column(String(50))
    requested_work_hours = Column(Float)
    reason = Column(Text, nullable=False)

    # Review fields
    status = Column(String(50), default='pending', index=True)  # pending, approved, rejected
    reviewed_by = Column(Integer, ForeignKey('users.id'), index=True)
    reviewed_at = Column(DateTime)
    review_comments = Column(Text)

    # Created attendance after approval
    created_attendance_id = Column(Integer, ForeignKey('attendances.id'), nullable=True, index=True)

    # System fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    # Relationships
    employee = relationship('Employee', backref='attendance_correction_requests')
    reviewer = relationship('User', backref='reviewed_attendance_corrections')
    original_attendance = relationship('Attendance', foreign_keys=[attendance_id], backref='correction_requests')
    created_attendance = relationship('Attendance', foreign_keys=[created_attendance_id])

    def __repr__(self):
        return f'<AttendanceCorrectionRequest {self.id} emp={self.employee_id} status={self.status}>'


class Expense(Base):
    """Expense claim model"""
    __tablename__ = 'expenses'
    __table_args__ = (
        # Composite indexes for expense queries at scale
        Index('idx_exp_org_status_date', 'organization_id', 'status', 'expense_date'),
        Index('idx_exp_emp_date', 'employee_id', 'expense_date'),
        Index('idx_exp_org_date', 'organization_id', 'expense_date'),
    )

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    category = Column(String(100), nullable=False)  # travel, food, accommodation, office, other
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default='INR')
    description = Column(Text)
    expense_date = Column(Date, nullable=False)
    receipt_url = Column(String(500))
    status = Column(String(50), default='pending', index=True)  # pending, approved, rejected, reimbursed
    approver_id = Column(Integer, ForeignKey('users.id'), index=True)
    approved_at = Column(DateTime)
    reimbursed_at = Column(DateTime)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)
    project_id = Column(Integer, nullable=True)  # TODO: Add foreign key to projects table when implemented
    location = Column(String(255))  # where the expense was incurred
    vendor = Column(String(255))  # vendor name
    invoice_number = Column(String(100))  # invoice/receipt number
    tax_amount = Column(Float, default=0)
    tax_inclusive = Column(Boolean, default=False)
    payment_method = Column(String(50))  # cash, card, transfer, etc.
    billable = Column(Boolean, default=False)  # can be billed to client
    client_id = Column(Integer, nullable=True)  # TODO: Add foreign key to clients table when implemented
    justification = Column(Text)  # detailed justification
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    employee = relationship('Employee', back_populates='expenses')
    approver = relationship('User', backref='approved_expenses')
    
    def __repr__(self):
        return f'<Expense {self.id}>'


class Payroll(Base):
    """Payroll model"""
    __tablename__ = 'payrolls'
    __table_args__ = (
        # Composite indexes for monthly payroll runs at scale
        Index('idx_pay_org_period', 'organization_id', 'year', 'month'),
        Index('idx_pay_emp_period', 'employee_id', 'year', 'month'),
        Index('idx_pay_company_period', 'company_id', 'year', 'month'),
        Index('idx_pay_org_status_period', 'organization_id', 'status', 'year', 'month'),
    )

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    month = Column(Integer, nullable=False)  # 1-12
    year = Column(Integer, nullable=False)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)

    # Basic Earnings
    basic_salary = Column(Float, default=0)
    hra = Column(Float, default=0)  # House Rent Allowance
    da = Column(Float, default=0)  # Dearness Allowance
    conveyance = Column(Float, default=0)
    medical = Column(Float, default=0)
    special_allowance = Column(Float, default=0)
    gross_salary = Column(Float, default=0)

    # Additional Earnings
    overtime_pay = Column(Float, default=0)
    bonus = Column(Float, default=0)
    commission = Column(Float, default=0)
    incentive = Column(Float, default=0)
    other_earnings = Column(Float, default=0)
    total_earnings = Column(Float, default=0)

    # Statutory Deductions
    pf_deduction = Column(Float, default=0)  # Provident Fund
    pf_employer_contribution = Column(Float, default=0)
    pf_edli_contribution = Column(Float, default=0)  # EPF EDLI insurance (employer)
    pf_admin_contribution = Column(Float, default=0)  # EPF admin charges (employer)
    esi_deduction = Column(Float, default=0)  # Employee State Insurance
    esi_employer_contribution = Column(Float, default=0)
    professional_tax = Column(Float, default=0)
    lwf_deduction = Column(Float, default=0)  # Labour Welfare Fund (employee)
    lwf_employer_contribution = Column(Float, default=0)  # LWF employer contribution
    gratuity = Column(Float, default=0)
    payroll_policy_id = Column(Integer, ForeignKey('payroll_policies.id'), nullable=True, index=True)
    component_breakdown = Column(JSON, nullable=True)

    # Tax Deductions
    tds_deduction = Column(Float, default=0)  # Tax Deducted at Source
    income_tax = Column(Float, default=0)
    surcharge = Column(Float, default=0)
    cess = Column(Float, default=0)

    # Other Deductions
    loan_deduction = Column(Float, default=0)
    advance_deduction = Column(Float, default=0)
    other_deductions = Column(Float, default=0)
    total_deductions = Column(Float, default=0)

    # Net Pay
    net_salary = Column(Float, default=0)

    # Working Days
    working_days = Column(Integer, default=0)
    present_days = Column(Integer, default=0)
    absent_days = Column(Integer, default=0)
    paid_days = Column(Integer, default=0)
    unpaid_days = Column(Integer, default=0)
    leave_days = Column(Integer, default=0)
    half_days = Column(Integer, default=0)
    holiday_days = Column(Integer, default=0)
    week_off_days = Column(Integer, default=0)

    # Payment Details
    status = Column(String(50), default='draft', index=True)  # draft, pending_approval, approved, processed, paid, cancelled, locked
    paid_at = Column(DateTime)
    payment_method = Column(String(50))  # bank_transfer, cash, check
    bank_account = Column(String(50))
    ifsc_code = Column(String(20))
    transaction_id = Column(String(255))
    utr_number = Column(String(50))
    check_number = Column(String(50))
    check_date = Column(DateTime)

    # Approval
    approved_by = Column(Integer, ForeignKey('users.id'), index=True)
    approved_at = Column(DateTime)
    processed_by = Column(Integer, ForeignKey('users.id'), index=True)
    processed_at = Column(DateTime)

    # Lock / reopen (period close + maker-checker reopen)
    locked_by = Column(Integer, ForeignKey('users.id'), index=True)
    locked_at = Column(DateTime)
    reopened_by = Column(Integer, ForeignKey('users.id'), index=True)
    reopened_at = Column(DateTime)

    # Resolved jurisdiction snapshot (country/state in force for this pay period).
    # Populated by the engine so payslips/audit always reflect the statutory
    # jurisdiction that applied — even if the org/company later changes.
    country = Column(String(50), nullable=True)
    registered_state = Column(String(100), nullable=True)

    # Notes
    notes = Column(Text)
    remarks = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    employee = relationship('Employee', back_populates='payrolls')
    approver = relationship('User', foreign_keys=[approved_by], backref='approved_payrolls')
    processor = relationship('User', foreign_keys=[processed_by], backref='processed_payrolls')

    def __repr__(self):
        return f'<Payroll {self.employee_id} {self.month}/{self.year}>'


class PayrollPeriodLock(Base):
    """Soft-finalize marker for a payroll period (company or employee + month + year).

    HR reviews attendance/leave/holiday for the period, then finalizes it. The
    flag is soft — it does not hard-block edits, it only marks the period as
    reviewed so the Run Payroll flow can warn before any late corrections.
    Can be scoped to a company (company_id set, employee_id NULL) or to a single
    employee (employee_id set) for a per-employee double-check.
    """
    __tablename__ = 'payroll_period_locks'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)  # NULL = org-wide
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=True, index=True)  # NULL = company/org scope
    month = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    finalized_by = Column(Integer, ForeignKey('users.id'), index=True)
    finalized_at = Column(DateTime)
    reopened_by = Column(Integer, ForeignKey('users.id'), index=True)
    reopened_at = Column(DateTime)
    status = Column(String(20), default='finalized', index=True)  # finalized, reopened
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<PayrollPeriodLock {self.organization_id} c{self.company_id} e{self.employee_id} {self.month}/{self.year} {self.status}>'


class PayrollRun(Base):
    """Tracks a bulk payroll generation run (background job).

    Allows large runs (100k+ employees) to execute in the background without
    blocking the HTTP request. The frontend polls the run's status/progress.
    """
    __tablename__ = 'payroll_runs'
    __table_args__ = (
        Index('idx_prun_org_status', 'organization_id', 'status'),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    branch_id = Column(Integer, nullable=True, index=True)
    department_id = Column(Integer, nullable=True, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    email = Column(Boolean, default=False)
    status = Column(String(20), default='queued', index=True)  # queued | running | completed | failed
    total = Column(Integer, default=0)
    processed = Column(Integer, default=0)
    generated = Column(Integer, default=0)
    skipped = Column(Integer, default=0)
    emailed = Column(Integer, default=0)
    notified = Column(Integer, default=0)
    approved = Column(Integer, default=0)
    rerun = Column(Integer, default=0)
    error = Column(Text, nullable=True)
    requested_by = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    submitted_by = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    submitted_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    approved_at = Column(DateTime, nullable=True)
    rerun_by = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    rerun_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f'<PayrollRun {self.id} {self.month}/{self.year} {self.status}>'


class SalaryRevision(Base):
    """Effective-dated salary revisions (annual CTC) for an employee.

    Payroll resolves the base_salary in effect for a given month so historical
    payslips don't drift after a raise/revision.
    """
    __tablename__ = 'salary_revisions'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    effective_from = Column(Date, nullable=False, index=True)
    base_salary = Column(Float, default=0)  # annual CTC in effect from effective_from
    salary_components = Column(JSON, nullable=True)
    salary_template_id = Column(Integer, ForeignKey('salary_templates.id'), index=True)
    reason = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employee = relationship('Employee', back_populates='salary_revisions')

    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)

    def __repr__(self):
        return f'<SalaryRevision emp:{self.employee_id} from:{self.effective_from} ctc:{self.base_salary}>'


class SalaryLoan(Base):
    """Employee loan / advance that auto-deducts a fixed monthly EMI from payroll."""
    __tablename__ = 'salary_loans'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    loan_type = Column(String(20), default='loan')  # loan | advance
    principal_amount = Column(Float, default=0)
    monthly_deduction = Column(Float, default=0)
    total_months = Column(Integer, default=0)
    remaining_months = Column(Integer, default=0)
    start_month = Column(Integer, default=1)
    start_year = Column(Integer, default=2000)
    interest_rate = Column(Float, default=0.0)  # informational
    status = Column(String(20), default='active', index=True)  # active | closed | cancelled
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    employee = relationship('Employee', back_populates='salary_loans')

    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)

    def __repr__(self):
        return f'<SalaryLoan emp:{self.employee_id} {self.loan_type} ₹{self.principal_amount}>'


class Holiday(Base):
    """Holiday model"""
    __tablename__ = 'holidays'

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    date = Column(DateTime, nullable=False)
    description = Column(Text)
    type = Column(String(50), default='public', index=True)  # public, company, optional
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    year = Column(Integer, default=lambda: datetime.utcnow().year)
    is_recurring = Column(Boolean, default=False)
    recurring_pattern = Column(String(50))  # yearly, monthly, weekly
    is_paid = Column(Boolean, default=True)
    duration_days = Column(Integer, default=1)
    location = Column(String(255))  # specific location if applicable
    region = Column(String(100))  # regional holiday
    category = Column(String(100))  # religious, national, cultural, etc.
    notification_days_before = Column(Integer, default=7)
    is_working_day = Column(Boolean, default=False)
    alternative_date = Column(DateTime)  # if holiday falls on weekend
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    organization = relationship('Organization', backref='holidays')
    company = relationship('Company', backref='holidays')

    def __repr__(self):
        return f'<Holiday {self.name}>'


class AuditLog(Base):
    """Audit log model"""
    __tablename__ = 'audit_logs'
    __table_args__ = (
        # Composite indexes for audit log queries at scale
        Index('idx_audit_org_created', 'organization_id', 'created_at'),
        Index('idx_audit_user_created', 'user_id', 'created_at'),
        Index('idx_audit_module_created', 'module', 'created_at'),
    )
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    user_name = Column(String(255))
    action = Column(String(100), nullable=False, index=True)  # create, update, delete, login, logout
    module = Column(String(100), index=True)
    entity_type = Column(String(100), index=True)  # employee, leave, expense, etc.
    entity_id = Column(String(100))
    changes = Column(JSON)
    old_values = Column(JSON)
    new_values = Column(JSON)
    ip_address = Column(String(100))
    user_agent = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Compliance & Integrity (Hash Chain)
    previous_hash = Column(String(255))
    signature = Column(String(255))
    
    # Relationships
    user = relationship('User', backref='audit_logs')
    organization = relationship('Organization', backref='audit_logs')
    
    def __repr__(self):
        return f'<AuditLog {self.action}>'


class Branch(Base):
    """Branch model"""
    __tablename__ = 'branches'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50))
    description = Column(Text)
    location = Column(String(255))
    state = Column(String(100))
    pincode = Column(String(10))
    latitude = Column(Float)
    longitude = Column(Float)
    geofence_radius = Column(Float, default=100.0)  # In meters
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    organization = relationship('Organization', backref='branches')
    employees = relationship('Employee', secondary=employee_branches, back_populates='branches')
    
    def __repr__(self):
        return f'<Branch {self.name}>'


class Designation(Base):
    """Designation model"""
    __tablename__ = 'designations'
    
    id = Column(Integer, primary_key=True)
    code = Column(String(50))
    title = Column(String(255), nullable=False)
    grade = Column(String(100))  # Junior, Senior, Lead, Manager
    description = Column(Text)
    min_salary = Column(Float)
    max_salary = Column(Float)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    organization = relationship('Organization', backref='designations')
    employees = relationship('Employee', foreign_keys='[Employee.designation_id]', overlaps='designation_obj')
    
    def __repr__(self):
        return f'<Designation {self.title}>'


class Notification(Base):
    """Notification model"""
    __tablename__ = 'notifications'
    __table_args__ = (
        # Composite index for per-user notification queries at scale
        Index('idx_notif_user_created', 'user_id', 'created_at'),
        Index('idx_notif_user_read', 'user_id', 'is_read'),
    )
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text)
    type = Column(String(100), index=True)  # leave, expense, payroll, system
    reference_id = Column(String(100))
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    data = Column(JSON)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship('User', backref='notifications')
    def __repr__(self):
        return f'<Notification {self.title}>'


class Asset(Base):
    """Asset/inventory tracking model"""
    __tablename__ = 'assets'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), index=True)
    asset_type = Column(String(50), nullable=False)
    asset_name = Column(String(255), nullable=False)
    serial_number = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default='available', index=True)
    purchase_date = Column(Date)
    issue_date = Column(Date)
    value = Column(Float, default=0)
    purchase_value = Column(Float, default=0)
    useful_life_years = Column(Float, default=0)
    depreciation_rate = Column(Float, default=0)
    salvage_value = Column(Float, default=0)
    notes = Column(Text)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    employee = relationship('Employee', backref='assets')
    organization = relationship('Organization', backref='assets')

    def __repr__(self):
        return f'<Asset {self.asset_name} ({self.serial_number})>'


class LeaveType(Base):
    """Leave type master model"""
    __tablename__ = 'leave_types'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), unique=True)
    days_allowed = Column(Integer, default=0)
    carry_forward = Column(Boolean, default=False)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)  # None = org-wide default
    status = Column(String(50), default='active', index=True)
    # Payroll integration: paid leave types (Casual/Sick/Earned/Maternity…) keep
    # salary flowing; unpaid (LOP) reduces paid days. Encashable leave types are
    # eligible for leave-encashment settlement at exit.
    is_paid = Column(Boolean, default=True)
    is_encashable = Column(Boolean, default=False)
    color = Column(String(20), default='#1C64F2')
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<LeaveType {self.name}>'

class SalaryTemplate(Base):
    """Salary template master model"""
    __tablename__ = 'salary_templates'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    basic_percent = Column(Float, default=0)
    hra_percent = Column(Float, default=0)
    special_allowance_percent = Column(Float, default=0)
    other_allowance_percent = Column(Float, default=0)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<SalaryTemplate {self.name}>'

# ---------------------------------------------------------------------------
# Multi-Tenant Customizable Payroll Configuration Models
# ---------------------------------------------------------------------------

class PayrollPolicy(Base):
    """Organization-level payroll policy — defines how payroll is calculated."""
    __tablename__ = 'payroll_policies'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    name = Column(String(200), nullable=False, default='Default Payroll Policy')

    # Pro-ration settings
    pro_ration_method = Column(String(50), default='paid_days')  # paid_days, calendar_days, working_days
    rounding_method = Column(String(20), default='nearest')  # nearest, floor, ceil, truncate
    decimal_places = Column(Integer, default=2)
    round_net_salary = Column(Boolean, default=True)

    # Gratuity
    include_gratuity = Column(Boolean, default=False)
    gratuity_rate = Column(Float, default=4.81)

    # Currency & misc
    default_currency = Column(String(10), default='INR')
    allow_negative_net = Column(Boolean, default=False)

    status = Column(String(20), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship('Organization', foreign_keys=[organization_id], backref='payroll_policies')

    def __repr__(self):
        return f'<PayrollPolicy {self.name} (org:{self.organization_id})>'


class PayrollComponent(Base):
    """Customizable earnings/deductions components per organization.

    Each component defines one line item in a payslip — e.g. Basic, HRA,
    Night Shift Allowance, PF, ESI, Professional Tax, etc.
    """
    __tablename__ = 'payroll_components'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    payroll_policy_id = Column(Integer, ForeignKey('payroll_policies.id'), nullable=True, index=True)

    name = Column(String(200), nullable=False)
    display_name = Column(String(200))
    component_type = Column(String(50), nullable=False)  # earning, deduction, employer_contribution

    # Calculation strategy
    calculation_type = Column(String(50), nullable=False)  # percentage, fixed, formula
    calculation_base = Column(String(200), nullable=True)  # basic, gross, net, or component name reference
    calculation_value = Column(Float, default=0)  # percentage or fixed amount
    formula = Column(Text, nullable=True)  # for formula-type calculations

    # Form 16 (Part B) head — categorizes where this component sits in the
    # salary computation hierarchy (income tax computation u/s 192).
    # earnings:   salary_17_1, perquisite_17_2, profit_17_3
    # deductions: exempt_10 (allowances u/s 10), chapter_vi_a (u/s 80C/80D/80CCD(1)),
    #             professional_tax_16 (u/s 16(iii)), post_tax_statutory (EPF/ESIC),
    #             tds_192
    # employer:   employer_epf (u/s 80CCD(2)), employer_esic, employer_gratuity, employer_nps
    tax_category = Column(String(50), nullable=True)

    # Caps & limits
    max_cap = Column(Float, nullable=True)
    min_cap = Column(Float, nullable=True)

    # Tax treatment
    is_statutory = Column(Boolean, default=False)
    is_taxable = Column(Boolean, default=True)
    is_tax_exempt = Column(Boolean, default=False)
    tax_exempt_limit = Column(Float, nullable=True)

    # Application rules
    apply_pro_ration = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)  # system components cannot be deleted
    priority = Column(Integer, default=0)  # calculation order (lower = earlier)
    depends_on = Column(JSON, nullable=True)  # list of component IDs this depends on

    status = Column(String(20), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship('Organization', backref='payroll_components')
    policy = relationship('PayrollPolicy', backref='components')

    def __repr__(self):
        return f'<PayrollComponent {self.name} ({self.component_type})>'


class StatutorySetting(Base):
    """Per-organization statutory compliance settings (PF, ESI, PT, LWF, Gratuity)."""
    __tablename__ = 'statutory_settings'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, unique=True, index=True)

    # PF
    pf_applicable = Column(Boolean, default=True)
    pf_employee_rate = Column(Float, default=12.0)
    pf_employer_rate = Column(Float, default=12.0)
    pf_wage_ceiling = Column(Float, default=15000.0)  # statutory wage ceiling for EPF/EPS
    pf_max_monthly = Column(Float, default=1800.0)
    pf_min_basic_for_exclusion = Column(Float, default=15000.0)

    # EPF employer outflows over and above the 12% PF: EDLI (insurance) + admin charges.
    pf_edli_rate = Column(Float, default=0.5)
    pf_edli_max_monthly = Column(Float, default=75.0)
    pf_admin_rate = Column(Float, default=0.5)
    pf_admin_min_monthly = Column(Float, default=75.0)
    eps_wage_ceiling = Column(Float, default=15000.0)  # EPS (pension) capped at 8.33% of this ceiling

    # ESI
    esi_applicable = Column(Boolean, default=True)
    esi_employee_rate = Column(Float, default=0.75)
    esi_employer_rate = Column(Float, default=3.25)
    esi_gross_ceiling = Column(Float, default=21000.0)
    esi_disabled_ceiling = Column(Float, default=25000.0)  # higher ceiling for persons with disabilities

    # Professional Tax
    pt_applicable = Column(Boolean, default=True)
    pt_monthly_amount = Column(Float, default=200.0)
    pt_min_gross = Column(Float, default=10000.0)

    # Labour Welfare Fund
    lwf_applicable = Column(Boolean, default=False)
    lwf_employee_rate = Column(Float, default=0.0)
    lwf_employer_rate = Column(Float, default=0.0)

    # Gratuity (Payment of Gratuity Act, 1972)
    gratuity_applicable = Column(Boolean, default=False)
    gratuity_rate = Column(Float, default=4.81)
    gratuity_eligible_years = Column(Float, default=5.0)
    gratuity_days_per_year = Column(Float, default=15.0)
    gratuity_tax_exempt_ceiling = Column(Float, default=2000000.0)

    # Statutory Bonus (Payment of Bonus Act, 1965)
    bonus_applicable = Column(Boolean, default=False)
    bonus_min_rate = Column(Float, default=8.33)
    bonus_max_rate = Column(Float, default=20.0)
    bonus_wage_ceiling = Column(Float, default=21000.0)

    status = Column(String(20), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship('Organization', backref='statutory_settings')

    def __repr__(self):
        return f'<StatutorySetting org:{self.organization_id}>'


class TaxRegime(Base):
    """Per-organization tax regime with custom slabs.

    Supports multiple regimes per org (e.g., New Regime, Old Regime, Custom).
    """
    __tablename__ = 'tax_regimes'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    regime_type = Column(String(20), default='new')  # new, old, custom
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    financial_year = Column(String(20), default='2025-26')

    # Deductions & rebates
    standard_deduction = Column(Float, default=50000.0)
    rebate_threshold = Column(Float, default=700000.0)
    rebate_amount = Column(Float, default=0.0)

    # Cess & surcharge
    cess_rate = Column(Float, default=4.0)
    surcharge_config = Column(JSON, nullable=True)  # e.g. [{"from": 5000000, "rate": 10}, ...]

    status = Column(String(20), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship('Organization', foreign_keys=[organization_id], backref='tax_regimes')
    slabs = relationship('TaxSlab', back_populates='tax_regime', cascade='all, delete-orphan',
                         order_by='TaxSlab.from_amount')

    def __repr__(self):
        return f'<TaxRegime {self.name} ({self.financial_year})>'


class TaxSlab(Base):
    """Individual tax slab within a TaxRegime."""
    __tablename__ = 'tax_slabs'

    id = Column(Integer, primary_key=True)
    tax_regime_id = Column(Integer, ForeignKey('tax_regimes.id'), nullable=False, index=True)
    from_amount = Column(Float, nullable=False)
    to_amount = Column(Float, nullable=True)  # NULL = infinite
    rate = Column(Float, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    tax_regime = relationship('TaxRegime', back_populates='slabs')


class InvestmentDeclaration(Base):
    """Per-employee annual investment/income declarations for cumulative TDS.

    One active row per (employee, financial_year). Used by the TDS engine to
    compute year-to-date tax accurately (80C/80D/HRA/LTA/NPS/home-loan, other
    income, previous-employer income & TDS so an FY switch is seamless).
    """
    __tablename__ = 'investment_declarations'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    financial_year = Column(String(20), nullable=False, index=True, default='2025-26')
    tax_regime_id = Column(Integer, ForeignKey('tax_regimes.id'), nullable=True, index=True)

    # Investment declarations (annual amounts)
    deduction_80c = Column(Float, default=0)       # capped at 150000 in old regime
    deduction_80d = Column(Float, default=0)       # capped at 50000 in old regime
    hra_exemption = Column(Float, default=0)
    lta_exemption = Column(Float, default=0)
    nps_deduction = Column(Float, default=0)       # capped at 50000 (80CCD(1B))
    home_loan_interest = Column(Float, default=0)  # capped at 200000 in old regime

    # Other income & previous employer (for cumulative carryforward)
    other_income = Column(Float, default=0)           # interest, rent, etc. (annual)
    previous_employer_income = Column(Float, default=0)
    previous_employer_tds = Column(Float, default=0)

    # Standard deduction can be opted out (notional) if desired
    opt_out_standard_deduction = Column(Boolean, default=False)

    status = Column(String(20), default='draft', index=True)  # draft, submitted, approved, rejected
    declaration_date = Column(Date, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    employee = relationship('Employee', backref='investment_declarations')

    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)

    def __repr__(self):
        return f'<InvestmentDeclaration emp:{self.employee_id} FY:{self.financial_year} {self.status}>'

    def __repr__(self):
        return f'<TaxSlab {self.from_amount}-{self.to_amount or "inf"} @ {self.rate}%>'


class StatePTSlab(Base):
    """Effective-dated Professional Tax slab per Indian state.

    Rows are seeded from data/state_compliance.py and can be overridden per
    state/period without code changes. Fallback to the static table occurs
    whenever no row applies for the requested period.
    """
    __tablename__ = 'state_pt_slabs'

    id = Column(Integer, primary_key=True)
    state_code = Column(String(50), nullable=False, index=True)   # internal snake_case key, e.g. 'karnataka'
    state_name = Column(String(100), nullable=False, default='')
    from_gross = Column(Float, nullable=False, default=0.0)
    to_gross = Column(Float, nullable=True)  # NULL = infinite
    amount = Column(Float, nullable=False, default=0.0)
    description = Column(String(255), default='')
    annual_max = Column(Float, nullable=True)
    effective_from = Column(Date, nullable=False, default=date(2000, 1, 1))
    effective_to = Column(Date, nullable=True)  # NULL = still in force
    source = Column(String(50), default='system')  # 'system' | 'custom'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<StatePTSlab {self.state_code} {self.from_gross}-{self.to_gross or "inf"} = {self.amount}>'


class StateLWFConfig(Base):
    """Effective-dated Labour Welfare Fund configuration per Indian state."""
    __tablename__ = 'state_lwf_configs'

    id = Column(Integer, primary_key=True)
    state_code = Column(String(50), nullable=False, index=True)
    state_name = Column(String(100), nullable=False, default='')
    applicable = Column(Boolean, default=True)
    employee_contribution = Column(Float, nullable=False, default=0.0)
    employer_contribution = Column(Float, nullable=False, default=0.0)
    frequency = Column(String(20), default='monthly')  # 'monthly' | 'half_yearly'
    max_wage_for_applicability = Column(Float, nullable=True)
    effective_from = Column(Date, nullable=False, default=date(2000, 1, 1))
    effective_to = Column(Date, nullable=True)
    source = Column(String(50), default='system')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<StateLWFConfig {self.state_code} e={self.employee_contribution} er={self.employer_contribution}>'


class AttendancePolicy(Base):
    """Per-organization attendance policy — controls how attendance maps to payroll."""
    __tablename__ = 'attendance_policies'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)  # None = org-wide default
    name = Column(String(200), default='Default Attendance Policy')

    # Work schedule
    working_days_per_week = Column(Integer, default=6)  # 5 or 6
    working_days = Column(String(20), default='1,2,3,4,5,6')  # Org default workweek: comma-separated 0=Sun, 1=Mon, etc. (Sunday off)

    # Attendance-to-payroll mapping
    half_day_as_full_paid = Column(Boolean, default=True)
    paid_leave_as_present = Column(Boolean, default=True)
    holiday_as_present = Column(Boolean, default=True)

    # Overtime
    overtime_threshold_hours = Column(Float, default=8.0)
    overtime_rate = Column(Float, default=1.5)

    # Late / half-day thresholds
    late_mark_threshold_minutes = Column(Integer, default=15)
    half_day_threshold_hours = Column(Float, default=4.0)

    status = Column(String(20), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship('Organization', foreign_keys=[organization_id], backref='attendance_policies')

    def __repr__(self):
        return f'<AttendancePolicy {self.name}>'


class PayrollTemplate(Base):
    """Company-wise payroll template bundling every payroll decision into one
    reusable package.

    A template owns its own PayrollPolicy, AttendancePolicy, TaxRegime (+ slabs)
    and PayrollComponents (attached to its policy). Statutory values live in the
    `statutory` JSON column because StatutorySetting is unique per organization;
    the template's overrides are layered on top of the org-level StatutorySetting
    during payroll calculation. `country` + `registered_state` drive the payroll
    jurisdiction (state compliance / PT / LWF).

    Created from the "Configure Payroll" flow and selected on the employee form,
    so the payroll page just needs: pick company/branch -> Run Payroll.
    """
    __tablename__ = 'payroll_templates'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)  # None = org-wide
    name = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(20), default='active', index=True)

    # Jurisdiction / state compliance
    country = Column(String(50), default='India')
    registered_state = Column(String(100), default='')

    # Bundled configuration (owned by this template)
    payroll_policy_id = Column(Integer, ForeignKey('payroll_policies.id'), nullable=True, index=True)
    attendance_policy_id = Column(Integer, ForeignKey('attendance_policies.id'), nullable=True, index=True)
    tax_regime_id = Column(Integer, ForeignKey('tax_regimes.id'), nullable=True, index=True)

    # Statutory overrides layered on top of the org StatutorySetting.
    # Keys mirror StatutorySetting column names (snake_case).
    statutory = Column(JSON, default=dict)

    # Pay run metadata (previously stored as org-level payroll settings)
    pay_cycle = Column(String(20), default='monthly')
    pay_day = Column(Integer, nullable=True)  # 1..31 or None (e.g. "last-day")
    auto_payslip = Column(Boolean, default=False)
    email_payslip = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    organization = relationship('Organization', backref='payroll_templates')
    company = relationship('Company', backref='payroll_templates')
    payroll_policy = relationship('PayrollPolicy', foreign_keys=[payroll_policy_id])
    attendance_policy = relationship('AttendancePolicy', foreign_keys=[attendance_policy_id])
    tax_regime = relationship('TaxRegime', foreign_keys=[tax_regime_id])

    def __repr__(self):
        return f'<PayrollTemplate {self.name} (org:{self.organization_id})>'


class Shift(Base):
    """Shift master model for Duty Roster"""
    __tablename__ = 'shifts'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    shift_type = Column(String(20), default='morning')  # morning, evening, night, general
    start_time = Column(String(5), nullable=False)  # HH:MM format (e.g., "09:00")
    end_time = Column(String(5), nullable=False)  # HH:MM format (e.g., "17:00")
    grace_minutes = Column(Integer, default=15)  # Late arrival grace period
    break_duration = Column(Integer, default=60)  # Break duration in minutes
    working_days = Column(String(20), default='1,2,3,4,5,6')  # Comma-separated: 0=Sun, 1=Mon, etc. (Sunday off)
    color = Column(String(7), default='#3B82F6')  # Hex color for UI (e.g., morning=blue, evening=orange, night=purple)
    description = Column(Text)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    organization = relationship('Organization', backref='shifts')
    company = relationship('Company', backref='shifts')
    branch = relationship('Branch', backref='shifts')
    department = relationship('Department', backref='shifts')

    def __repr__(self):
        return f'<Shift {self.name} ({self.shift_type})>'

class DutyRoster(Base):
    """Duty roster model - weekly shift assignment for employees"""
    __tablename__ = 'duty_rosters'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey('shifts.id'), nullable=False, index=True)

    # Week-based assignment (optional specific date override)
    week_start_date = Column(DateTime, nullable=False)  # Monday of the week
    specific_date = Column(DateTime, nullable=True)  # For specific day override

    # Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    day_of_week = Column(Integer, nullable=False)

    # Status: scheduled, completed, absent, leave, holiday
    status = Column(String(50), default='scheduled', index=True)
    notes = Column(Text)

    assigned_by_id = Column(Integer, ForeignKey('users.id'), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    shift = relationship('Shift', backref='rosters')
    assigned_by = relationship('User', backref='assigned_rosters')
    employee = relationship('Employee', back_populates='rosters')

    def __repr__(self):
        return f'<DutyRoster emp:{self.employee_id} shift:{self.shift_id}>'

class JobOpening(Base):
    """Job opening model"""
    __tablename__ = 'job_openings'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    job_code = Column(String(50), unique=True, index=True)
    description = Column(Text)
    requirements = Column(Text)
    location = Column(String(255))
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), nullable=True, index=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True, index=True)
    employment_type = Column(String(50), default='full-time')  # full-time, part-time, contract, internship
    salary_min = Column(Integer)
    salary_max = Column(Integer)
    experience_required = Column(String(100))  # e.g., "2-3 years"
    education_required = Column(String(255))
    skills_required = Column(Text)  # comma-separated skills
    benefits = Column(Text)
    vacancy_count = Column(Integer, default=1)
    expiry_date = Column(DateTime)
    published_date = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default='open', index=True)  # open, closed, on_hold, filled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    def __repr__(self):
        return f'<JobOpening {self.title}>'

class Candidate(Base):
    """Candidate model"""
    __tablename__ = 'candidates'
    
    id = Column(Integer, primary_key=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(50))
    resume_url = Column(String(500))
    job_opening_id = Column(Integer, ForeignKey('job_openings.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True, index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), nullable=True, index=True)
    candidate_status = Column(String(50), default='applied', index=True)  # applied, invited, shortlisted, not_arrived, rejected, offered, hired
    source = Column(String(100))  # linkedin, indeed, referral, direct, etc.
    current_company = Column(String(255))
    current_position = Column(String(255))
    current_salary = Column(Integer)
    expected_salary = Column(Integer)
    notice_period = Column(String(50))  # e.g., "30 days", "immediate"
    experience_years = Column(Integer)
    education = Column(String(255))
    skills = Column(Text)  # comma-separated skills
    linkedin_url = Column(String(500))
    portfolio_url = Column(String(500))
    notes = Column(Text)
    applied_date = Column(DateTime, default=datetime.utcnow)
    hired_date = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)  # When the candidate was rejected
    rejection_reason = Column(Text)  # Reason for rejection
    selection_reason = Column(Text)  # Reason for selection / offer
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=True, index=True)  # Link to Employee once onboarded
    custom_fields = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    job_opening = relationship('JobOpening', backref='candidates')
    employee = relationship('Employee', foreign_keys=[employee_id])
    
    def __repr__(self):
        return f'<Candidate {self.full_name}>'

class Interview(Base):
    """Interview model"""
    __tablename__ = 'interviews'
    
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'), nullable=False, index=True)
    interviewer_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    job_opening_id = Column(Integer, ForeignKey('job_openings.id'), nullable=True, index=True)
    interview_type = Column(String(50), default='technical')  # technical, hr, behavioral, panel, final
    interview_round = Column(Integer, default=1)
    date = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer)
    location = Column(String(255))  # physical location or meeting link
    meeting_link = Column(String(500))
    status = Column(String(50), default='scheduled', index=True)  # scheduled, completed, cancelled, rescheduled
    feedback = Column(Text)
    rating = Column(Integer)  # 1-5
    technical_score = Column(Integer)  # 1-10
    communication_score = Column(Integer)  # 1-10
    overall_score = Column(Integer)  # 1-10
    interviewer_notes = Column(Text)
    next_steps = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    candidate = relationship('Candidate', backref='interviews')
    interviewer = relationship('User', backref='conducted_interviews')
    
    def __repr__(self):
        return f'<Interview {self.candidate_id} {self.interviewer_id}>'


class PerformanceReview(Base):
    """Performance review model for employee performance tracking"""
    __tablename__ = 'performance_reviews'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    review_period = Column(String(50))  # Q1, Q2, Q3, Q4, Annual
    review_year = Column(Integer, nullable=False)
    review_date = Column(DateTime, default=datetime.utcnow)

    # Organization context
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)

    # Performance Metrics (1-5 scale)
    productivity_score = Column(Integer, default=0)  # 1-5
    quality_score = Column(Integer, default=0)  # 1-5
    communication_score = Column(Integer, default=0)  # 1-5
    teamwork_score = Column(Integer, default=0)  # 1-5
    leadership_score = Column(Integer, default=0)  # 1-5
    initiative_score = Column(Integer, default=0)  # 1-5
    punctuality_score = Column(Integer, default=0)  # 1-5
    problem_solving_score = Column(Integer, default=0)  # 1-5
    collaboration_score = Column(Integer, default=0)  # 1-5
    adaptability_score = Column(Integer, default=0)  # 1-5
    creativity_score = Column(Integer, default=0)  # 1-5
    attendance_score = Column(Integer, default=0)  # 1-5

    # Overall Calculations
    overall_score = Column(Float, default=0)  # Average of all scores
    rating = Column(String(50))  # Excellent, Good, Satisfactory, Needs Improvement, Poor

    # Goals & Achievements
    goals_set = Column(Text)
    goals_achieved = Column(Text)
    strengths = Column(Text)
    areas_for_improvement = Column(Text)
    development_plan = Column(Text)
    achievements = Column(Text)
    key_projects = Column(Text)
    training_needs = Column(Text)

    # Reviewer context
    reviewer_name = Column(String(255))
    reviewer_position = Column(String(100))
    review_cycle = Column(String(50))  # monthly, quarterly, semi-annual, annual

    # Recommendations
    promotion_eligible = Column(Boolean, default=False)
    salary_recommendation = Column(String(50))  # increase, decrease, no_change
    salary_percentage = Column(Float)  # percentage for salary change

    # Next review
    next_review_date = Column(DateTime)

    # Comments
    reviewer_comments = Column(Text)
    employee_comments = Column(Text)
    notes = Column(Text)

    # Status
    status = Column(String(50), default='draft', index=True)  # draft, submitted, acknowledged, completed
    submitted_at = Column(DateTime)
    acknowledged_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    employee = relationship('Employee', backref='performance_reviews')
    reviewer = relationship('User', backref='conducted_reviews')

    def __repr__(self):
        return f'<PerformanceReview {self.employee_id} {self.review_period} {self.review_year}>'


class Goal(Base):
    """Goal and OKR model for employee goal tracking"""
    __tablename__ = 'goals'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)

    title = Column(String(255), nullable=False)
    description = Column(Text)
    goal_type = Column(String(50))  # OKR, KPI, Milestone, Development
    category = Column(String(100))  # performance, learning, project, personal

    # OKR specific
    objective = Column(Text)
    key_results = Column(Text)  # JSON string for multiple key results

    # Timeline
    start_date = Column(DateTime)
    target_date = Column(DateTime, nullable=False)
    completion_date = Column(DateTime)

    # Progress
    progress = Column(Integer, default=0)  # 0-100 percentage
    status = Column(String(50), default='active', index=True)  # active, completed, cancelled, on_hold

    # Priority and weight
    priority = Column(String(50))  # high, medium, low
    weight = Column(Float, default=1.0)  # Weight for overall goal calculation

    # Alignment
    aligned_with = Column(String(255))  # Team or company goal alignment
    parent_goal_id = Column(Integer, ForeignKey('goals.id'), index=True)

    # Metrics
    metric_type = Column(String(50))  # percentage, number, boolean, milestone
    target_value = Column(Float)
    current_value = Column(Float)
    unit = Column(String(50))  # %, $, count, etc.

    # Review
    review_frequency = Column(String(50))  # weekly, monthly, quarterly
    last_review_date = Column(DateTime)
    next_review_date = Column(DateTime)

    # Comments
    comments = Column(Text)
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    # Relationships
    employee = relationship('Employee', backref='goals')
    parent_goal = relationship('Goal', remote_side=[id], backref='sub_goals')

    def __repr__(self):
        return f'<Goal {self.id} {self.title}>'


class Feedback(Base):
    """360 Feedback model for employee feedback collection"""
    __tablename__ = 'feedback'

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), index=True)

    feedback_type = Column(String(50))  # peer, manager, self, subordinate, client
    feedback_cycle = Column(String(50))  # quarterly, semi-annual, annual
    feedback_period = Column(String(50))  # Q1, Q2, Q3, Q4, Annual
    feedback_year = Column(Integer, nullable=False)

    # Relationship context
    relationship_type = Column(String(100))  # direct_report, peer, manager, etc.
    collaboration_duration = Column(String(50))  # months, years

    # Competency ratings (1-5 scale)
    communication_rating = Column(Integer, default=0)
    teamwork_rating = Column(Integer, default=0)
    leadership_rating = Column(Integer, default=0)
    problem_solving_rating = Column(Integer, default=0)
    reliability_rating = Column(Integer, default=0)
    adaptability_rating = Column(Integer, default=0)
    overall_rating = Column(Integer, default=0)

    # Feedback content
    strengths = Column(Text)
    areas_for_improvement = Column(Text)
    specific_examples = Column(Text)
    recommendations = Column(Text)

    # Questions
    what_employee_does_well = Column(Text)
    what_employee_could_improve = Column(Text)
    collaboration_feedback = Column(Text)
    additional_comments = Column(Text)

    # Status
    status = Column(String(50), default='draft', index=True)  # draft, submitted, acknowledged
    submitted_at = Column(DateTime)
    acknowledged_at = Column(DateTime)

    # Anonymity
    is_anonymous = Column(Boolean, default=False)

    # Comments
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    # Relationships
    employee = relationship('Employee', backref='feedback_received')
    reviewer = relationship('User', backref='feedback_given')

    def __repr__(self):
        return f'<Feedback {self.id} {self.employee_id} {self.reviewer_id}>'


class ModulePermission(Base):
    """Module-level permissions for users - granular access control"""
    __tablename__ = 'module_permissions'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    module = Column(String(50), nullable=False, index=True)  # dashboard, employees, attendance, leave, payroll, expenses, holidays, performance, recruitment, company, settings
    level = Column(String(20), default='none', index=True)  # none, view, edit, full
    can_read = Column(Boolean, default=False)
    can_write = Column(Boolean, default=False)
    can_delete = Column(Boolean, default=False)
    menu_visible = Column(Boolean, default=True)  # show/hide module in sidebar menus
    granted_by = Column(Integer, ForeignKey('users.id'), index=True)  # who assigned this permission
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    user = relationship('User', foreign_keys=[user_id], backref='module_permissions')
    granter = relationship('User', foreign_keys=[granted_by])
    
    __table_args__ = (
        UniqueConstraint('user_id', 'module', name='unique_user_module_permission'),
    )
    
    def __repr__(self):
        return f'<ModulePermission {self.user_id}:{self.module} R:{self.can_read} W:{self.can_write}>'


# Master Data Lookup Models
class LookupCategory(Base):
    """Categories for lookup values (e.g., employment_type, gender, etc.)"""
    __tablename__ = "lookup_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255))
    page_group = Column(String(50), default='general')  # Page grouping: employee, company, leave, attendance, holiday, expense
    icon = Column(String(50), nullable=True)  # Icon name for UI
    is_active = Column(Boolean, default=True, index=True)
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationship
    values = relationship("LookupValue", back_populates="category", cascade="all, delete-orphan")

class LookupValue(Base):
    """Lookup values for each category (e.g., full_time, part_time under employment_type)"""
    __tablename__ = "lookup_values"
    
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("lookup_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255))
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, index=True)
    is_default = Column(Boolean, default=False)
    # Additional fields for grade salary ranges
    min_salary = Column(DECIMAL(10, 2), nullable=True)
    max_salary = Column(DECIMAL(10, 2), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Audit fields
    created_by = Column(String(255), nullable=True)
    created_by_email = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    updated_by_email = Column(String(255), nullable=True)
    deleted_by = Column(String(255), nullable=True)
    deleted_by_email = Column(String(255), nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    is_deleted = Column(Boolean, default=False)
    
    # Relationship
    category = relationship("LookupCategory", back_populates="values")
    
    def __repr__(self):
        return f'<LookupValue {self.code} - {self.name}>'

class Lookup(Base):
    """Tab-based lookup model for core master management"""
    __tablename__ = "lookup"
    
    id = Column(Integer, primary_key=True, index=True)
    tab_category = Column(String(50), nullable=False)  # personal, identity, academic, etc.
    field_name = Column(String(50), nullable=False)    # gender, blood_group, etc.
    key = Column(String(50), nullable=False)
    value = Column(String(100), nullable=False)
    description = Column(Text)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Add unique constraint
    __table_args__ = (
        UniqueConstraint('tab_category', 'field_name', 'key', name='uq_lookup_tab_field_key'),
    )
    
    def __repr__(self):
        return f'<Lookup {self.tab_category}.{self.field_name}.{self.key}: {self.value}>'


class EmployeeTransfer(Base):
    """Employee transfer model - track temporary and permanent transfers between branches/departments"""
    __tablename__ = 'employee_transfers'
    
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    
    # From location
    from_company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    from_branch_id = Column(Integer, ForeignKey('branches.id'), nullable=False, index=True)
    from_branch_ids = Column(JSON, nullable=True)  # All branches held before the transfer
    from_department_id = Column(Integer, ForeignKey('departments.id'), nullable=True, index=True)
    from_designation_id = Column(Integer, ForeignKey('designations.id'), nullable=True, index=True)
    
    # To location
    to_company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    to_branch_id = Column(Integer, ForeignKey('branches.id'), nullable=False, index=True)
    to_branch_ids = Column(JSON, nullable=True)  # Multiple target branches for a single transfer
    to_department_id = Column(Integer, ForeignKey('departments.id'), nullable=True, index=True)
    to_designation_id = Column(Integer, ForeignKey('designations.id'), nullable=True, index=True)
    
    # Transfer details
    type = Column(String(20), nullable=False, index=True)  # temporary, permanent
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)  # Only for temporary transfers
    reason = Column(Text)
    
    # Status tracking
    status = Column(String(20), default='pending', index=True)  # pending, approved, rejected, completed, cancelled
    
    # Approval tracking
    requested_by = Column(Integer, ForeignKey('users.id'), index=True)
    approved_by = Column(Integer, ForeignKey('users.id'), index=True)
    approved_at = Column(DateTime)
    
    # Notes
    notes = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    employee = relationship('Employee', backref='transfers')
    from_company = relationship('Company', foreign_keys=[from_company_id])
    to_company = relationship('Company', foreign_keys=[to_company_id])
    from_branch = relationship('Branch', foreign_keys=[from_branch_id])
    to_branch = relationship('Branch', foreign_keys=[to_branch_id])
    from_department = relationship('Department', foreign_keys=[from_department_id])
    to_department = relationship('Department', foreign_keys=[to_department_id])
    requester = relationship('User', foreign_keys=[requested_by])
    approver = relationship('User', foreign_keys=[approved_by])
    
    def __repr__(self):
        return f'<EmployeeTransfer {self.employee_id}: {self.from_branch_id} -> {self.to_branch_id}>'


class EmployeeBranchAssignment(Base):
    """Employee branch assignment - supports multiple branch assignments per employee"""
    __tablename__ = 'employee_branch_assignments'
    
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=False, index=True)
    
    is_primary = Column(Boolean, default=False)  # Primary/default branch
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    status = Column(String(20), default='active', index=True)  # active, inactive
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    employee = relationship('Employee', backref='branch_assignments')
    branch = relationship('Branch')
    
    __table_args__ = (
        UniqueConstraint('employee_id', 'branch_id', 'status', name='unique_active_branch_assignment'),
    )
    
    def __repr__(self):
        return f'<EmployeeBranchAssignment {self.employee_id}: {self.branch_id} (Primary: {self.is_primary})>'


class EmployeeDepartmentAssignment(Base):
    """Employee department assignment - supports multiple department assignments per employee"""
    __tablename__ = 'employee_department_assignments'
    
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), nullable=False, index=True)
    
    is_primary = Column(Boolean, default=False)  # Primary/default department
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    status = Column(String(20), default='active', index=True)  # active, inactive
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    employee = relationship('Employee', backref='department_assignments')
    department = relationship('Department')
    
    __table_args__ = (
        UniqueConstraint('employee_id', 'department_id', 'status', name='unique_active_department_assignment'),
    )
    
    def __repr__(self):
        return f'<EmployeeDepartmentAssignment {self.employee_id}: {self.department_id} (Primary: {self.is_primary})>'


class EmployeeLifecycleEvent(Base):
    """Track employee lifecycle events - onboarding, transfers, promotions, termination, etc."""
    __tablename__ = 'employee_lifecycle_events'
    
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    
    event_type = Column(String(50), nullable=False)  # joined, transfer, promotion, termination, resignation, suspension, reactivation
    event_date = Column(DateTime, nullable=False)
    description = Column(Text)
    
    # For tracking changes (e.g., branch transfer, promotion)
    from_value = Column(String(255))  # Previous value (e.g., old branch name, old designation)
    to_value = Column(String(255))   # New value (e.g., new branch name, new designation)
    
    # Additional metadata (JSON for flexibility)
    event_metadata = Column(JSON, nullable=True)
    
    # Who recorded this event
    recorded_by = Column(Integer, ForeignKey('users.id'), index=True)
    
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    employee = relationship('Employee', backref='lifecycle_events')
    recorder = relationship('User')
    
    def __repr__(self):
        return f'<EmployeeLifecycleEvent {self.employee_id}: {self.event_type} on {self.event_date}>'


class DeviceLog(Base):
    """Track all devices used for login - for security and audit purposes"""
    __tablename__ = 'device_logs'
    
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    
    # Device information (what we can capture)
    ip_address = Column(String(50))  # IP address from request
    user_agent = Column(String(500))  # Browser/OS info
    device_type = Column(String(50))  # Detected from user agent
    device_fingerprint = Column(String(255))  # Browser fingerprint hash
    
    # For manual/admin registered devices
    mac_address = Column(String(50), nullable=True)  # If available from network
    serial_number = Column(String(100), nullable=True)  # If registered by admin
    
    # Status
    is_authorized = Column(Boolean, default=False)  # Whitelisted device
    is_blocked = Column(Boolean, default=False)  # Blacklisted device
    login_status = Column(String(50), default='success')  # success, failed, blocked
    
    # Location info (from IP)
    location_country = Column(String(100))
    location_city = Column(String(100))
    
    login_time = Column(DateTime, default=datetime.utcnow)
    logout_time = Column(DateTime)
    
    # Relationships
    employee = relationship('Employee', backref='device_logs')
    user = relationship('User', backref='device_logs')
    
    def __repr__(self):
        return f'<DeviceLog {self.employee_id}: {self.device_type} from {self.ip_address}>'


# ═══════════════════════════════════════════════════════════════════════════════
# ENTERPRISE DYNAMIC PERMISSION SYSTEM (DB-DRIVEN)
# ═══════════════════════════════════════════════════════════════════════════════

class PermissionModule(Base):
    """Dynamic modules - enterprise can add/remove modules without code changes"""
    __tablename__ = 'permission_modules'
    
    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # dashboard, employees, etc.
    name = Column(String(100), nullable=False)
    description = Column(Text)
    icon = Column(String(50))  # Lucide icon name
    category = Column(String(50), default='general')  # hr, admin, finance, etc.
    sort_order = Column(Integer, default=0)
    
    # Module properties
    is_active = Column(Boolean, default=True, index=True)
    is_system = Column(Boolean, default=False)  # Cannot be deleted if system
    requires_assignment = Column(Boolean, default=True)  # Must be explicitly assigned
    
    # UI routing info
    route_path = Column(String(100))  # /dashboard, /employees
    parent_module_id = Column(Integer, ForeignKey('permission_modules.id'), nullable=True, index=True)
    
    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    created_by = Column(Integer, ForeignKey('users.id'), index=True)
    
    # Relationships
    parent = relationship('PermissionModule', remote_side=[id], backref='submodules')
    role_permissions = relationship('RolePermissionMatrix', back_populates='module', cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<PermissionModule {self.code}: {self.name}>'


class PermissionAction(Base):
    """Dynamic actions - enterprise can define custom actions beyond read/write/delete"""
    __tablename__ = 'permission_actions'
    
    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # read, write, delete, approve, export, etc.
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # Action properties
    is_active = Column(Boolean, default=True, index=True)
    is_system = Column(Boolean, default=False)  # Cannot be deleted if system
    requires_approval = Column(Boolean, default=False)  # Action requires higher approval
    
    # UI display
    icon = Column(String(50))
    color = Column(String(20))  # For UI badges
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<PermissionAction {self.code}: {self.name}>'


class SystemRole(Base):
    """Dynamic roles - enterprise can create custom roles without code changes"""
    __tablename__ = 'system_roles'
    
    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # admin, hr_manager, custom_role
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # Role hierarchy (for inheritance)
    level = Column(Integer, default=1)  # 1=employee, 5=manager, 10=admin, 99=superadmin
    parent_role_id = Column(Integer, ForeignKey('system_roles.id'), nullable=True, index=True)
    
    # Role properties
    is_active = Column(Boolean, default=True, index=True)
    is_system = Column(Boolean, default=False)  # Cannot be deleted if system
    is_default_for_new_users = Column(Boolean, default=False)  # Auto-assign to new users
    
    # Mobile/Web access
    can_access_web = Column(Boolean, default=True)
    can_access_mobile = Column(Boolean, default=True)
    
    # UI display
    icon = Column(String(50))
    color = Column(String(20))  # Badge color
    
    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    created_by = Column(Integer, ForeignKey('users.id'), index=True)
    
    # Relationships
    parent = relationship('SystemRole', remote_side=[id], backref='child_roles')
    permissions = relationship('RolePermissionMatrix', back_populates='role', cascade='all, delete-orphan')
    users = relationship('UserRoleAssignment', back_populates='role')
    
    def __repr__(self):
        return f'<SystemRole {self.code}: {self.name}>'


class RolePermissionMatrix(Base):
    """Permission matrix - defines what each role can do per module (replaces hardcoded DEFAULT_PERMISSIONS)"""
    __tablename__ = 'role_permission_matrix'
    
    id = Column(Integer, primary_key=True)
    role_id = Column(Integer, ForeignKey('system_roles.id'), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey('permission_modules.id'), nullable=False, index=True)
    action_id = Column(Integer, ForeignKey('permission_actions.id'), nullable=False, index=True)
    
    # Permission value
    is_allowed = Column(Boolean, default=False)
    
    # Conditions (JSON for flexibility)
    conditions = Column(JSON, nullable=True)  # e.g., {"own_records_only": true, "department_scope": true}
    
    # Override inheritance
    is_override = Column(Boolean, default=False)  # Overrides parent role
    
    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    updated_by = Column(Integer, ForeignKey('users.id'), index=True)
    
    # Relationships
    role = relationship('SystemRole', back_populates='permissions')
    module = relationship('PermissionModule', back_populates='role_permissions')
    action = relationship('PermissionAction')
    
    __table_args__ = (
        UniqueConstraint('role_id', 'module_id', 'action_id', name='unique_role_module_action'),
    )
    
    def __repr__(self):
        return f'<RolePermissionMatrix {self.role.code}:{self.module.code}:{self.action.code}={self.is_allowed}>'


class UserRoleAssignment(Base):
    """User-Role assignments - users can have multiple roles"""
    __tablename__ = 'user_role_assignments'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    role_id = Column(Integer, ForeignKey('system_roles.id'), nullable=False, index=True)
    
    # Assignment scope (for multi-tenant/departmental access)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    department_id = Column(Integer, ForeignKey('departments.id'), nullable=True, index=True)
    
    # Assignment properties
    is_primary = Column(Boolean, default=False)  # Primary role for UI
    is_active = Column(Boolean, default=True, index=True)
    valid_from = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)  # For temporary assignments
    
    # Audit
    assigned_by = Column(Integer, ForeignKey('users.id'), index=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship('User', foreign_keys=[user_id], backref='role_assignments')
    role = relationship('SystemRole', back_populates='users')
    organization = relationship('Organization')
    department = relationship('Department')
    assigner = relationship('User', foreign_keys=[assigned_by])
    
    __table_args__ = (
        UniqueConstraint('user_id', 'role_id', 'organization_id', 'department_id', name='unique_user_role_scope'),
    )
    
    def __repr__(self):
        return f'<UserRoleAssignment {self.user_id}:{self.role.code}>'


class UserPermissionOverride(Base):
    """User-specific permission overrides - for special cases beyond role-based permissions"""
    __tablename__ = 'user_permission_overrides'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey('permission_modules.id'), nullable=False, index=True)
    action_id = Column(Integer, ForeignKey('permission_actions.id'), nullable=False, index=True)
    
    # Override type
    override_type = Column(String(20), nullable=False)  # 'grant' or 'deny'
    is_active = Column(Boolean, default=True, index=True)
    
    # Scope (for limited access)
    scope_organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    scope_department_id = Column(Integer, ForeignKey('departments.id'), nullable=True, index=True)
    
    # Reason/justification
    reason = Column(Text)
    expires_at = Column(DateTime, nullable=True)  # Temporary overrides
    
    # Audit
    created_by = Column(Integer, ForeignKey('users.id'), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    # Relationships
    user = relationship('User', foreign_keys=[user_id], backref='permission_overrides')
    module = relationship('PermissionModule')
    action = relationship('PermissionAction')
    
    __table_args__ = (
        UniqueConstraint('user_id', 'module_id', 'action_id', name='unique_user_permission_override'),
    )
    
    def __repr__(self):
        return f'<UserPermissionOverride {self.user_id}:{self.module_id}:{self.action_id}={self.override_type}>'


class PermissionAuditLog(Base):
    """Audit trail for all permission changes"""
    __tablename__ = 'permission_audit_logs'
    
    id = Column(Integer, primary_key=True)
    
    # What changed
    action = Column(String(50), nullable=False, index=True)  # created, updated, deleted, granted, revoked
    entity_type = Column(String(50), nullable=False, index=True)  # role, module, permission, user_role
    entity_id = Column(Integer, nullable=False)
    
    # Change details
    previous_value = Column(JSON)
    new_value = Column(JSON)
    
    # Who made the change
    performed_by = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    performed_at = Column(DateTime, default=datetime.utcnow)
    
    # Context
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    
    # Relationships
    performer = relationship('User', foreign_keys=[performed_by])
    
    def __repr__(self):
        return f'<PermissionAuditLog {self.action}:{self.entity_type} by {self.performed_by}>'


# ═══════════════════════════════════════════════════════════════════════════════
# SUPERADMIN SAAS MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class Plan(Base):
    """Subscription plans (free, pro, enterprise)"""
    __tablename__ = "plans"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # free, pro, enterprise
    display_name = Column(String(100), nullable=False)
    price_monthly = Column(Float, default=0.0)
    price_yearly = Column(Float, default=0.0)
    price_per_user_monthly = Column(Float, default=0.0)  # per-employee monthly rate
    price_per_user_yearly = Column(Float, default=0.0)   # per-employee yearly rate
    max_employees = Column(Integer, default=10)
    features = Column(JSON, default=list)  # List of feature flags
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Subscription(Base):
    """Tenant subscription tracking"""
    __tablename__ = "subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False, index=True)
    status = Column(String(20), default="trial", index=True)  # active, trial, expired, suspended
    billing_cycle = Column(String(20), default="monthly")  # monthly, yearly
    next_billing_date = Column(DateTime)
    trial_ends_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    organization = relationship("Organization", back_populates="subscription")
    plan = relationship("Plan")


class FeatureFlag(Base):
    """Feature flags per tenant or global"""
    __tablename__ = "feature_flags"
    
    id = Column(Integer, primary_key=True, index=True)
    flag = Column(String(50), nullable=False)  # payroll_module, recruitment_module, etc.
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)  # NULL = global
    enabled = Column(Boolean, default=True)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp
    
    organization = relationship("Organization")


class Payment(Base):
    """Tenant subscription payments"""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True)
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default="INR")
    billing_cycle = Column(String(20), default="monthly")  # monthly, yearly
    method = Column(String(50), default="card")  # card, upi, netbanking, bank_transfer, cash
    status = Column(String(20), default="completed", index=True)  # completed, pending, failed, refunded
    transaction_id = Column(String(100), index=True)
    payment_date = Column(DateTime, default=datetime.utcnow)
    receipt_url = Column(String(500))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", backref="payments")
    plan = relationship("Plan")


class Invoice(Base):
    """Tenant invoices generated from payments"""
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True, index=True)
    plan_name = Column(String(100))
    billing_cycle = Column(String(20), default="monthly")
    subtotal = Column(Float, default=0.0)
    tax_percent = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    tax_label = Column(String(20), default="GST")
    total = Column(Float, default=0.0)
    currency = Column(String(10), default="INR")
    status = Column(String(20), default="paid", index=True)  # paid, pending, void
    issued_date = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime)
    paid_date = Column(DateTime)
    billing_address = Column(Text)
    notes = Column(Text)
    pdf_path = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", backref="invoices")
    payment = relationship("Payment")


class SystemHealthLog(Base):
    """System health monitoring logs"""
    __tablename__ = "system_health_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    service = Column(String(50), nullable=False)  # database, redis, api
    status = Column(String(20), nullable=False, index=True)  # healthy, degraded, down
    latency_ms = Column(Integer)
    error_message = Column(Text)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    query_time_ms = Column(Float, nullable=True)  # Query sampling performance tracking
    query_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SuperAdminPermission(Base):
    """SuperAdmin RBAC scoping"""
    __tablename__ = "superadmin_permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(50), default="auditor") # superadmin, auditor, tenant_manager, compliance_officer
    can_manage_tenants = Column(Boolean, default=False)
    can_manage_system_config = Column(Boolean, default=False)
    can_view_audit_logs = Column(Boolean, default=False)
    can_manage_billing = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User")

class GlobalSettings(Base):
    """Global system configuration and security policies"""
    __tablename__ = "global_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    default_currency = Column(String(10), default='USD')
    default_timezone = Column(String(50), default='UTC')
    default_date_format = Column(String(20), default='YYYY-MM-DD')
    password_complexity_regex = Column(String(255), default='^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d]{8,}$')
    account_lockout_threshold = Column(Integer, default=5)
    mfa_enforced = Column(Boolean, default=False)
    billing_config = Column(JSON, default=dict)  # Gateway keys, currency, tax, trial days, invoice settings
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ReportSchedule(Base):
    """Report scheduling model"""
    __tablename__ = "report_schedules"
    
    id = Column(String(36), primary_key=True)  # UUID
    report_name = Column(String(255), nullable=False)
    frequency = Column(String(50), nullable=False)  # Daily, Weekly, Monthly, Quarterly, Yearly
    run_time = Column(Time, nullable=False)
    day_of_week = Column(String(20))  # Monday, Tuesday, etc.
    day_of_month = Column(String(20))  # 1st, 15th, Last Day
    recipients = Column(String(500), nullable=False)  # Email addresses
    format = Column(String(20), default="PDF")  # PDF, CSV, Excel
    email_subject = Column(String(255))
    include_body = Column(Boolean, default=False)
    next_run = Column(DateTime, nullable=False)
    enabled = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    creator = relationship("User")
    execution_logs = relationship("ReportExecutionLog", back_populates="schedule", cascade="all, delete-orphan")


class ReportExecutionLog(Base):
    """Report execution log model"""
    __tablename__ = "report_execution_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(String(36), ForeignKey("report_schedules.id"), nullable=True, index=True)
    report_name = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, index=True)  # success, failed, in_progress
    format = Column(String(20))  # PDF, CSV, Excel
    file_path = Column(String(500))  # Path to generated file
    error_message = Column(Text)
    execution_time = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Relationships
    schedule = relationship("ReportSchedule", back_populates="execution_logs")
    user = relationship("User")


class ActivityLog(Base):
    """Activity log model for tracking user actions across all modules"""
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    module = Column(String(50), nullable=False, index=True)  # Company, Employee, Leave, Recruitment, MasterData, Attendance, Payroll, Expenses, Settings, Reports
    action = Column(String(50), nullable=False, index=True)  # create, edit, delete, toggle_active, toggle_inactive
    entity_type = Column(String(100), index=True)  # company, branch, department, designation, employee, leave_type, job, etc.
    entity_id = Column(String(100))  # ID of the affected entity
    entity_name = Column(String(255))  # Name of the affected entity for display
    old_value = Column(Text)  # Previous value for edit actions
    new_value = Column(Text)  # New value for edit actions
    ip_address = Column(String(50))
    mac_address = Column(String(50))
    device_info = Column(String(255))  # Browser, OS, etc.
    user_agent = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User")

class OnboardingTask(Base):
    """Model for tracking automated onboarding tasks"""
    __tablename__ = "onboarding_tasks"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    department = Column(String(100))  # e.g., 'IT', 'HR', 'Finance'
    status = Column(String(50), default='pending')  # pending, in_progress, completed
    due_date = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)

    # Relationships
    employee = relationship("Employee")


class CustomFieldDefinition(Base):
    """Tenant-customizable field definitions — add/edit/remove fields per org without schema migration."""
    __tablename__ = "custom_field_definitions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True)  # employee, candidate, job_opening, etc.
    field_name = Column(String(100), nullable=False)
    field_type = Column(String(50), nullable=False)  # text, number, boolean, date, dropdown, email, phone, url, textarea
    label = Column(String(255), nullable=False)
    placeholder = Column(String(500), default="")
    is_required = Column(Boolean, default=False)
    default_value = Column(String(500), default="")
    options = Column(JSON, default=list)  # For dropdown type
    validation_rules = Column(JSON, default=dict)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    organization = relationship("Organization")


class ScheduledReport(Base):
    """Scheduled report delivery configuration."""
    __tablename__ = "scheduled_reports"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    report_type = Column(String(50), nullable=False)  # payroll_summary, attendance_report, headcount_report, etc.
    frequency = Column(String(20), nullable=False)  # daily, weekly, monthly, quarterly, yearly
    recipients = Column(JSON, nullable=False)  # List of email addresses
    format = Column(String(10), default="csv")  # csv, json, pdf
    params = Column(JSON, default=dict)  # Additional parameters (month, year, department_id, etc.)
    is_active = Column(Boolean, default=True)
    last_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization")


class AnomalyAlert(Base):
    """AI-detected anomalies in attendance, payroll, and compliance.

    This is our competitive moat — Keka, greytHR, and Darwinbox do not
    offer built-in anomaly detection. We detect buddy punching, payroll
    drift, overtime anomalies, duplicate payments, and more.
    """
    __tablename__ = "anomaly_alerts"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)

    # Classification
    anomaly_type = Column(String(50), nullable=False, index=True)
    # buddy_punching, payroll_drift, overtime_anomaly, duplicate_bank, duplicate_payment, attendance_discrepancy
    severity = Column(String(20), nullable=False, default="medium")  # low, medium, high, critical

    # Human-readable
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Affected entities (JSON arrays of employee IDs)
    employee_ids = Column(JSON, nullable=True)
    related_entity_type = Column(String(50), nullable=True)  # payroll, attendance, employee
    related_entity_id = Column(Integer, nullable=True)

    # Evidence / metadata (JSON)
    evidence_data = Column(JSON, nullable=True)

    # Status
    status = Column(String(20), nullable=False, default="open", index=True)  # open, dismissed, resolved
    dismissed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    dismissed_at = Column(DateTime, nullable=True)
    dismissed_reason = Column(String(255), nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization")
    dismisser = relationship("User", foreign_keys=[dismissed_by])


class ExitRecord(Base):
    """Tracks employee exit lifecycle — separation, clearance, FnF."""
    __tablename__ = "exit_records"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)

    # Exit details
    exit_type = Column(String(50), nullable=False)  # resigned, terminated, retired, absconded
    exit_date = Column(DateTime, nullable=False)
    last_working_day = Column(DateTime, nullable=True)
    reason = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    notice_period_served = Column(String(20), default="no")  # yes, no, partial
    handover_completed = Column(String(20), default="no")

    # FnF status
    fnf_status = Column(String(50), default="pending")  # pending, in_progress, completed
    fnf_completed_at = Column(DateTime, nullable=True)
    clearance_status = Column(String(50), default="pending")  # pending, in_progress, completed
    clearance_completed_at = Column(DateTime, nullable=True)
    approval_status = Column(String(50), default="pending")  # pending, approved, rejected

    # FnF settlement snapshot (persisted so PDF/audit always match the calculation)
    fnf_amount = Column(Float, nullable=True)
    fnf_details = Column(JSON, nullable=True)

    # Archive
    archived_at = Column(DateTime, nullable=True)  # Set when the record is archived

    # Metadata
    initiated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)  # Soft delete timestamp

    # Relationships
    employee = relationship("Employee")
    initiator = relationship("User", foreign_keys=[initiated_by])


class ArchivedEmployee(Base):
    """Stores employee records that have completed the full lifecycle (exit → FnF → archive)."""
    __tablename__ = "archived_employees"

    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(Integer, nullable=False, index=True)  # Original employee ID
    exit_record_id = Column(Integer, ForeignKey("exit_records.id"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)

    # Personal
    full_name = Column(String(255))
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100))
    email = Column(String(255), nullable=False, index=True)
    employee_code = Column(String(50))
    phone = Column(String(50))
    gender = Column(String(20))
    date_of_birth = Column(DateTime)
    blood_group = Column(String(10))
    marital_status = Column(String(20))
    address = Column(String(500))

    # Employment
    designation = Column(String(255))
    employment_type = Column(String(50))
    join_date = Column(DateTime)
    exit_type = Column(String(50))
    exit_date = Column(DateTime)
    last_working_day = Column(DateTime)

    # Identity documents
    aadhar_number = Column(String(100))
    pan_number = Column(String(100))
    pf_number = Column(String(100))
    pf_uan = Column(String(100))
    esic_number = Column(String(100))
    bank_name = Column(String(255))
    bank_account_number = Column(String(100))
    ifsc_code = Column(String(50))

    # Archive metadata
    archive_date = Column(DateTime, default=datetime.utcnow)
    archived_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    fnf_settled_date = Column(DateTime, nullable=True)
    archive_reason = Column(String(255), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    exit_record = relationship("ExitRecord")


class GLAccount(Base):
    """Chart of accounts per organization (Indian standard: expenses, liabilities,
    assets, equity). Used to post payroll & F&F accounting journals."""
    __tablename__ = 'gl_accounts'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    code = Column(String(30), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    account_type = Column(String(40), nullable=False)  # asset, liability, expense, income, equity
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    __table_args__ = (
        UniqueConstraint('organization_id', 'code', name='uq_gl_account_org_code'),
    )


class JournalEntry(Base):
    """Accounting journal header (double-entry posting)."""
    __tablename__ = 'journal_entries'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    entry_type = Column(String(40), nullable=False)  # payroll, fnf, manual, expense, loan
    reference_type = Column(String(40), nullable=True)  # payroll, exit_record, ...
    reference_id = Column(Integer, nullable=True)
    reference_no = Column(String(80), nullable=True)
    description = Column(String(500))
    status = Column(String(20), default="posted")  # draft, posted, reversed
    reversed_at = Column(DateTime, nullable=True)
    reversed_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lines = relationship('JournalLine', back_populates='entry',
                         cascade='all, delete-orphan', order_by='JournalLine.id')


class JournalLine(Base):
    """Single debit/credit leg of a journal entry."""
    __tablename__ = 'journal_lines'

    id = Column(Integer, primary_key=True)
    journal_entry_id = Column(Integer, ForeignKey('journal_entries.id'), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey('gl_accounts.id'), nullable=False, index=True)
    debit = Column(Float, default=0)
    credit = Column(Float, default=0)
    narration = Column(String(500))

    entry = relationship('JournalEntry', back_populates='lines')
    account = relationship('GLAccount')


class CompanyPolicy(Base):
    """HR policies that admins can CRUD. Employees see them as read-only."""
    __tablename__ = 'company_policies'

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)

    key = Column(String(50), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    icon = Column(String(50), default='document-text-outline')
    color = Column(String(20), default='#3B82F6')
    description = Column(Text, default='')
    bullets = Column(JSON, default=list)
    sort_order = Column(Integer, default=0)
    status = Column(String(20), default='active', index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)


class AIAuditLog(Base):
    """Audit log for HRMS AI operations"""
    __tablename__ = 'ai_audit_logs'

    id = Column(String(36), primary_key=True)
    event_type = Column(String(50), nullable=False, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    severity = Column(String(20), default='info', index=True)
    message = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)
    conversation_id = Column(String(255), nullable=True, index=True)
    action_id = Column(String(255), nullable=True, index=True)
    provider = Column(String(100), nullable=True)
    latency_ms = Column(Integer, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    meta_data = Column(JSON, nullable=True)

    __table_args__ = (
        Index('idx_ai_audit_user_ts', 'user_id', 'timestamp'),
        Index('idx_ai_audit_org_ts', 'organization_id', 'timestamp'),
        Index('idx_ai_audit_event_ts', 'event_type', 'timestamp'),
    )


class AIEscalation(Base):
    """AI escalation records"""
    __tablename__ = 'ai_escalations'

    id = Column(String(36), primary_key=True)
    conversation_id = Column(String(255), nullable=False, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    reason = Column(String(100), nullable=False, index=True)
    priority = Column(String(20), nullable=False, index=True)
    status = Column(String(50), default='pending', index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)
    assigned_to = Column(String(255), nullable=True, index=True)
    assigned_to_role = Column(String(100), nullable=True)
    sla_deadline = Column(DateTime, nullable=True, index=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution = Column(Text, nullable=True)
    resolved_by = Column(String(255), nullable=True)
    meta_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_ai_esc_org_status', 'organization_id', 'status'),
        Index('idx_ai_esc_priority_status', 'priority', 'status'),
    )


class JobPortalCompany(Base):
    """Public company profile on the job portal"""
    __tablename__ = 'job_portal_companies'

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, index=True)
    description = Column(Text)
    logo_url = Column(String(500))
    cover_image_url = Column(String(500))
    website = Column(String(255))
    industry = Column(String(100), index=True)
    company_size = Column(String(50))
    headquarters = Column(String(255))
    founded_year = Column(Integer)
    email = Column(String(255), index=True)
    phone = Column(String(50))
    address = Column(Text)
    city = Column(String(100), index=True)
    state = Column(String(100))
    country = Column(String(100), default='India', index=True)
    pincode = Column(String(10))
    gstin = Column(String(20))
    pan = Column(String(20))
    social_links = Column(JSON, default=dict)
    is_verified = Column(Boolean, default=False, index=True)
    is_featured = Column(Boolean, default=False, index=True)
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalCompany {self.name}>'


class JobPortalUser(Base):
    """Extended user profile for job portal"""
    __tablename__ = 'job_portal_users'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone = Column(String(50), nullable=True, index=True)
    full_name = Column(String(255), nullable=False, index=True)
    profile_picture = Column(String(500))
    headline = Column(String(255))
    summary = Column(Text)
    current_designation = Column(String(255))
    current_company = Column(String(255))
    location = Column(String(255), index=True)
    city = Column(String(100), index=True)
    state = Column(String(100))
    country = Column(String(100), default='India', index=True)
    pincode = Column(String(10))
    date_of_birth = Column(Date)
    gender = Column(String(20))
    marital_status = Column(String(20))
    nationality = Column(String(100))
    languages = Column(JSON, default=list)
    social_links = Column(JSON, default=dict)
    resume_url = Column(String(500))
    portfolio_url = Column(String(500))
    linkedin_url = Column(String(500))
    github_url = Column(String(500))
    expected_salary_min = Column(Integer)
    expected_salary_max = Column(Integer)
    current_salary = Column(Integer)
    notice_period = Column(String(50))
    employment_type_preference = Column(String(100))
    remote_preference = Column(String(50))
    skills = Column(JSON, default=list)
    experience_years = Column(Integer, default=0)
    profile_type = Column(String(20), default='experienced', index=True)
    hourly_rate_min = Column(Integer)
    hourly_rate_max = Column(Integer)
    availability = Column(String(100))
    services = Column(JSON, default=list)
    education = Column(JSON, default=list)
    work_experience = Column(JSON, default=list)
    certifications = Column(JSON, default=list)
    projects = Column(JSON, default=list)
    achievements = Column(JSON, default=list)
    references = Column(JSON, default=list)
    is_open_to_opportunities = Column(Boolean, default=True, index=True)
    is_verified = Column(Boolean, default=False, index=True)
    is_featured = Column(Boolean, default=False, index=True)
    profile_visibility = Column(String(20), default='public')
    status = Column(String(50), default='active', index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalUser {self.full_name}>'


class JobPortalJob(Base):
    """Public job posting on the job portal"""
    __tablename__ = 'job_portal_jobs'

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, index=True)
    description = Column(Text, nullable=False)
    responsibilities = Column(Text)
    requirements = Column(Text)
    benefits = Column(Text)
    company_id = Column(Integer, ForeignKey('job_portal_companies.id'), nullable=False, index=True)
    posted_by = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    department = Column(String(100), index=True)
    role = Column(String(100), index=True)
    employment_type = Column(String(50), default='full_time', index=True)
    work_mode = Column(String(50), default='on_site', index=True)
    experience_min = Column(Integer, default=0)
    experience_max = Column(Integer)
    salary_min = Column(Integer)
    salary_max = Column(Integer)
    salary_currency = Column(String(10), default='INR')
    salary_display = Column(String(50), default='range')
    education_required = Column(String(255))
    skills_required = Column(JSON, default=list)
    languages_required = Column(JSON, default=list)
    certifications_required = Column(JSON, default=list)
    location = Column(String(255), index=True)
    city = Column(String(100), index=True)
    state = Column(String(100), index=True)
    country = Column(String(100), default='India', index=True)
    pincode = Column(String(10))
    remote_friendly = Column(Boolean, default=False, index=True)
    hybrid_friendly = Column(Boolean, default=False)
    flexible_hours = Column(Boolean, default=False)
    travel_required = Column(Boolean, default=False)
    vacancy_count = Column(Integer, default=1)
    application_count = Column(Integer, default=0, index=True)
    view_count = Column(Integer, default=0)
    save_count = Column(Integer, default=0)
    is_featured = Column(Boolean, default=False, index=True)
    is_urgent = Column(Boolean, default=False, index=True)
    is_remote = Column(Boolean, default=False, index=True)
    is_walkin = Column(Boolean, default=False)
    walkin_date = Column(Date)
    walkin_time = Column(String(50))
    walkin_venue = Column(String(255))
    application_deadline = Column(DateTime, index=True)
    published_at = Column(DateTime, default=datetime.utcnow, index=True)
    expiry_date = Column(DateTime, index=True)
    status = Column(String(50), default='open', index=True)
    meta_title = Column(String(255))
    meta_description = Column(Text)
    tags = Column(JSON, default=list)
    custom_fields = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    company = relationship('JobPortalCompany', backref='jobs')

    def __repr__(self):
        return f'<JobPortalJob {self.title}>'


class JobPortalApplication(Base):
    """Job application from job seeker"""
    __tablename__ = 'job_portal_applications'

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey('job_portal_jobs.id'), nullable=False, index=True)
    applicant_id = Column(Integer, ForeignKey('job_portal_users.id'), nullable=True, index=True)
    cover_letter = Column(Text)
    resume_url = Column(String(500))
    expected_salary = Column(Integer)
    notice_period = Column(String(50))
    current_company = Column(String(255))
    current_designation = Column(String(255))
    experience_years = Column(Integer)
    status = Column(String(50), default='applied', index=True)
    is_shortlisted = Column(Boolean, default=False, index=True)
    is_rejected = Column(Boolean, default=False, index=True)
    is_hired = Column(Boolean, default=False, index=True)
    applied_at = Column(DateTime, default=datetime.utcnow, index=True)
    shortlisted_at = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    hired_at = Column(DateTime, nullable=True)
    notes = Column(Text)
    rating = Column(Integer)
    feedback = Column(Text)
    custom_fields = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    job = relationship('JobPortalJob', backref='applications')
    applicant = relationship('JobPortalUser', backref='applications')

    def __repr__(self):
        return f'<JobPortalApplication {self.id}>'


class JobPortalInterview(Base):
    """Interview scheduled for a job application"""
    __tablename__ = 'job_portal_interviews'

    id = Column(Integer, primary_key=True)
    application_id = Column(Integer, ForeignKey('job_portal_applications.id'), nullable=False, index=True)
    interviewer_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    interview_type = Column(String(50), default='video', index=True)
    interview_round = Column(Integer, default=1)
    scheduled_at = Column(DateTime, nullable=False, index=True)
    duration_minutes = Column(Integer, default=60)
    location = Column(String(255))
    meeting_link = Column(String(500))
    status = Column(String(50), default='scheduled', index=True)
    feedback = Column(Text)
    rating = Column(Integer)
    technical_score = Column(Integer)
    communication_score = Column(Integer)
    overall_score = Column(Integer)
    interviewer_notes = Column(Text)
    next_steps = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    application = relationship('JobPortalApplication', backref='interviews')

    def __repr__(self):
        return f'<JobPortalInterview {self.id}>'


class JobPortalBlog(Base):
    """Community blog posts"""
    __tablename__ = 'job_portal_blogs'

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, index=True)
    content = Column(Text, nullable=False)
    excerpt = Column(Text)
    featured_image = Column(String(500))
    author_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    author_name = Column(String(255))
    category = Column(String(100), index=True)
    tags = Column(JSON, default=list)
    view_count = Column(Integer, default=0)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    is_published = Column(Boolean, default=False, index=True)
    is_featured = Column(Boolean, default=False, index=True)
    published_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalBlog {self.title}>'


class JobPortalComment(Base):
    """Comments on blogs and jobs"""
    __tablename__ = 'job_portal_comments'

    id = Column(Integer, primary_key=True)
    commentable_type = Column(String(50), nullable=False, index=True)
    commentable_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    user_name = Column(String(255))
    user_email = Column(String(255))
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey('job_portal_comments.id'), nullable=True, index=True)
    is_approved = Column(Boolean, default=True, index=True)
    like_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalComment {self.id}>'


class JobPortalSavedJob(Base):
    """Saved/bookmarked jobs by users"""
    __tablename__ = 'job_portal_saved_jobs'

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey('job_portal_jobs.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index('idx_saved_job_user_job', 'user_id', 'job_id', unique=True),
    )

    def __repr__(self):
        return f'<JobPortalSavedJob {self.id}>'


class JobPortalSkill(Base):
    """Skills catalog for job seekers"""
    __tablename__ = 'job_portal_skills'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    category = Column(String(100), index=True)
    description = Column(Text)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<JobPortalSkill {self.name}>'


class JobPortalNotification(Base):
    """Notifications for job portal users"""
    __tablename__ = 'job_portal_notifications'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    type = Column(String(50), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text)
    data = Column(JSON, default=dict)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f'<JobPortalNotification {self.id}>'


class JobPortalReport(Base):
    """Reports for jobs, companies, users, or comments"""
    __tablename__ = 'job_portal_reports'

    id = Column(Integer, primary_key=True)
    reporter_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    reporter_name = Column(String(255))
    reporter_email = Column(String(255))
    reportable_type = Column(String(50), nullable=False, index=True)
    reportable_id = Column(Integer, nullable=False, index=True)
    reason = Column(String(100), nullable=False, index=True)
    description = Column(Text)
    evidence_url = Column(String(500))
    status = Column(String(50), default='pending', index=True)
    reviewed_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    resolution = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalReport {self.id}>'


class JobPortalVerification(Base):
    """User/company verification records"""
    __tablename__ = 'job_portal_verifications'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey('job_portal_companies.id'), nullable=True, index=True)
    verification_type = Column(String(50), nullable=False, index=True)
    status = Column(String(50), default='pending', index=True)
    document_type = Column(String(100))
    document_url = Column(String(500))
    document_number = Column(String(100))
    verified_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    notes = Column(Text)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<JobPortalVerification {self.id}>'


class JobPortalScamAlert(Base):
    """Public scam warnings"""
    __tablename__ = 'job_portal_scam_alerts'

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=False)
    alert_type = Column(String(50), nullable=False, index=True)
    company_name = Column(String(255), nullable=True, index=True)
    website = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(50), nullable=True, index=True)
    reported_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    is_verified = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalScamAlert {self.id}>'


class JobPortalBlacklist(Base):
    """Blacklisted entities"""
    __tablename__ = 'job_portal_blacklist'

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(Integer, nullable=False, index=True)
    entity_name = Column(String(255), nullable=False)
    entity_email = Column(String(255), nullable=True, index=True)
    entity_phone = Column(String(50), nullable=True, index=True)
    reason = Column(String(255), nullable=False)
    description = Column(Text)
    blacklisted_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    is_permanent = Column(Boolean, default=False, index=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalBlacklist {self.id}>'

class JobPortalAlert(Base):
    """Saved-search job alerts for seekers (email-based, no login required)"""
    __tablename__ = 'job_portal_alerts'

    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False, index=True)
    search = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    remote_only = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, index=True)
    last_checked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f'<JobPortalAlert {self.email} {self.search}>'

class JobPortalGig(Base):
    """Fixed-price or hourly gig posted by a client"""
    __tablename__ = 'job_portal_gigs'

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, index=True)
    description = Column(Text, nullable=False)
    deliverables = Column(Text)
    category = Column(String(100), index=True)
    skills_required = Column(JSON, default=list)
    budget_min = Column(Integer)
    budget_max = Column(Integer)
    budget_type = Column(String(20), default='fixed', index=True)
    delivery_days = Column(Integer)
    client_id = Column(Integer, ForeignKey('job_portal_users.id'), nullable=True, index=True)
    client_name = Column(String(255))
    location = Column(String(255))
    is_remote = Column(Boolean, default=True, index=True)
    status = Column(String(50), default='open', index=True)
    is_featured = Column(Boolean, default=False, index=True)
    view_count = Column(Integer, default=0)
    proposal_count = Column(Integer, default=0)
    published_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<JobPortalGig {self.title}>'


class JobPortalProposal(Base):
    """Freelancer proposal on a gig"""
    __tablename__ = 'job_portal_proposals'

    id = Column(Integer, primary_key=True)
    gig_id = Column(Integer, ForeignKey('job_portal_gigs.id'), nullable=False, index=True)
    freelancer_id = Column(Integer, ForeignKey('job_portal_users.id'), nullable=True, index=True)
    freelancer_name = Column(String(255))
    cover_letter = Column(Text, nullable=False)
    bid_amount = Column(Integer, nullable=False)
    delivery_days = Column(Integer)
    status = Column(String(50), default='pending', index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    gig = relationship('JobPortalGig', backref='proposals')

    def __repr__(self):
        return f'<JobPortalProposal {self.id}>'


class JobPortalContract(Base):
    """Active work contract between client and freelancer"""
    __tablename__ = 'job_portal_contracts'

    id = Column(Integer, primary_key=True)
    gig_id = Column(Integer, ForeignKey('job_portal_gigs.id'), nullable=False, index=True)
    proposal_id = Column(Integer, ForeignKey('job_portal_proposals.id'), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey('job_portal_users.id'), nullable=True, index=True)
    freelancer_id = Column(Integer, ForeignKey('job_portal_users.id'), nullable=True, index=True)
    freelancer_name = Column(String(255))
    agreed_amount = Column(Integer, nullable=False)
    status = Column(String(50), default='active', index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    gig = relationship('JobPortalGig', backref='contracts')

    def __repr__(self):
        return f'<JobPortalContract {self.id}>'


class JobPortalMilestone(Base):
    """Payment/delivery milestone inside a contract"""
    __tablename__ = 'job_portal_milestones'

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey('job_portal_contracts.id'), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    amount = Column(Integer, nullable=False)
    status = Column(String(50), default='pending', index=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contract = relationship('JobPortalContract', backref='milestones')

    def __repr__(self):
        return f'<JobPortalMilestone {self.id}>'


class JobPortalReview(Base):
    """One-sided review after a contract completes"""
    __tablename__ = 'job_portal_reviews'

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey('job_portal_contracts.id'), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey('job_portal_users.id'), nullable=True, index=True)
    reviewee_id = Column(Integer, ForeignKey('job_portal_users.id'), nullable=True, index=True)
    reviewee_name = Column(String(255))
    rating = Column(Integer, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    contract = relationship('JobPortalContract', backref='reviews')

    def __repr__(self):
        return f'<JobPortalReview {self.id}>'

class SupportTicket(Base):
    """Helpdesk ticket for IT / HR / facility requests"""
    __tablename__ = 'support_tickets'

    id = Column(Integer, primary_key=True)
    ticket_no = Column(String(50), unique=True, index=True)
    subject = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(50), default='general', index=True)
    priority = Column(String(20), default='medium', index=True)
    status = Column(String(50), default='open', index=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=True, index=True)
    assigned_to = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    resolution_notes = Column(Text)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<SupportTicket {self.ticket_no}>'

class Grievance(Base):
    """Employee grievance record"""
    __tablename__ = 'grievances'

    id = Column(Integer, primary_key=True)
    subject = Column(String(255), nullable=False)
    description = Column(Text)
    type = Column(String(100), default='grievance', index=True)
    status = Column(String(50), default='open', index=True)
    employee_id = Column(Integer, ForeignKey('employees.id'), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    resolution_notes = Column(Text)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    def __repr__(self):
        return f'<Grievance {self.id} {self.status}>'
