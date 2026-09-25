"""Pydantic request/response models for the HRMS API."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    email: str
    fullName: Optional[str] = None
    organizationId: Optional[int] = None
    isLockedToDevice: Optional[bool] = False
    deviceId: Optional[str] = None


class PermissionBase(BaseModel):
    module: str = "dashboard"
    admin: Optional[bool] = False
    manager: Optional[bool] = False
    employee: Optional[bool] = False


class ThemeSettings(BaseModel):
    primaryColor: Optional[str] = "#6366f1"
    isDarkMode: Optional[bool] = False
    glassIntensity: Optional[float] = 0.1
    fontFamily: Optional[str] = "Inter"


class EmployeeBase(BaseModel):
    employeeCode: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    designationId: Optional[int] = None
    departmentId: Optional[int] = None
    organizationId: Optional[int] = None
    companyIds: Optional[List[int]] = None
    branchIds: Optional[List[int]] = None
    salaryTemplateId: Optional[int] = None
    role: Optional[str] = "employee"
    status: Optional[str] = "active"
    currentAddress: Optional[str] = None
    permanentAddress: Optional[str] = None
    dateOfBirth: Optional[str] = None
    gender: Optional[str] = None
    isPersonWithDisability: Optional[bool] = False
    emergencyContact: Optional[str] = None
    emergencyPhone: Optional[str] = None
    voterId: Optional[str] = None
    aadharNumber: Optional[str] = None
    panNumber: Optional[str] = None
    drivingLicense: Optional[str] = None
    passportNumber: Optional[str] = None
    bankName: Optional[str] = None
    bankAccountNumber: Optional[str] = None
    ifscCode: Optional[str] = None
    familyInfo: Optional[List[Dict[str, Any]]] = None
    educationDetails: Optional[List[Dict[str, Any]]] = None
    resumeUrl: Optional[str] = None
    idProofUrl: Optional[str] = None
    photoUrl: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    tempPassword: Optional[str] = None


class EmployeeResponse(EmployeeBase):
    id: int
    joinDate: Optional[str] = None
    userId: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class OrganizationBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    status: Optional[str] = "active"


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationResponse(OrganizationBase):
    id: int
    createdAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AuditLogBase(BaseModel):
    userId: Optional[int] = None
    userName: Optional[str] = None
    action: str
    entityType: Optional[str] = None
    entityId: Optional[str] = None
    changes: Optional[str] = None
    ipAddress: Optional[str] = None


class AuditLogResponse(AuditLogBase):
    id: int
    createdAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CompanyBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    registrationNumber: Optional[str] = None
    taxId: Optional[str] = None
    industry: Optional[str] = None
    companySize: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    logo: Optional[str] = None
    country: Optional[str] = None  # Payroll & tax document jurisdiction (defaults to org country)
    organizationId: Optional[int] = None
    status: Optional[str] = "active"


class CompanyCreate(CompanyBase):
    pass


class CompanyResponse(CompanyBase):
    id: int
    createdAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class PayrollStatusUpdate(BaseModel):
    status: str


class GeneralSettingsUpdate(BaseModel):
    companyName: Optional[str] = None
    registrationNumber: Optional[str] = None
    taxId: Optional[str] = None
    industry: Optional[str] = None
    companySize: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    dateFormat: Optional[str] = None
    timeFormat: Optional[str] = None
    currency: Optional[str] = None
    country: Optional[str] = None
    financialYear: Optional[str] = None
    geoFence: Optional[bool] = None
    selfService: Optional[bool] = None
    docUploads: Optional[bool] = None
    multiCompany: Optional[bool] = None
    autoEmails: Optional[bool] = None


class AttendanceSettingsUpdate(BaseModel):
    checkInTime: Optional[str] = None
    checkOutTime: Optional[str] = None
    lateGraceMinutes: Optional[int] = None
    enableGeofence: Optional[bool] = None
    enableSelfie: Optional[bool] = None
    enableOvertime: Optional[bool] = None
    geoFenceRadius: Optional[int] = None
    workDays: Optional[Union[List[int], str]] = None


class LeavePolicyUpdate(BaseModel):
    annualLeave: Optional[int] = None
    sickLeave: Optional[int] = None
    personalLeave: Optional[int] = None
    carryForward: Optional[bool] = None
    maxCarryForwardDays: Optional[int] = None
    enableHalfDay: Optional[bool] = None
    enableMultiLevelApproval: Optional[bool] = None
    approvalLevels: Optional[int] = None


class PayrollSettingsUpdate(BaseModel):
    payrollFrequency: Optional[str] = None
    currency: Optional[str] = None
    enablePf: Optional[bool] = None
    pfPercentage: Optional[float] = None
    enableEsi: Optional[bool] = None
    esiPercentage: Optional[float] = None
    enableTaxDeduction: Optional[bool] = None
    payrollDay: Optional[int] = None


class PerformanceSettingsUpdate(BaseModel):
    reviewCycle: Optional[str] = None
    enable360Feedback: Optional[bool] = None
    enableSelfReview: Optional[bool] = None
    enableGoalTracking: Optional[bool] = None


class NotificationSettingsUpdate(BaseModel):
    emailEnabled: Optional[bool] = None
    smsEnabled: Optional[bool] = None
    pushEnabled: Optional[bool] = None
    leaveReminders: Optional[bool] = None
    payrollAlerts: Optional[bool] = None
    birthdayWishes: Optional[bool] = None


class SecuritySettingsUpdate(BaseModel):
    twoFactorEnabled: Optional[bool] = None
    sessionTimeout: Optional[int] = None
    passwordPolicy: Optional[str] = None
    deviceVerification: Optional[bool] = None


class IntegrationSettingsUpdate(BaseModel):
    slackEnabled: Optional[bool] = None
    googleCalendar: Optional[bool] = None
    zapierEnabled: Optional[bool] = None
    apiAccess: Optional[bool] = None


class OnboardingStepUpdate(BaseModel):
    stepId: str


class InitiateExitRequest(BaseModel):
    exitType: Optional[str] = "resigned"
    exitDate: Optional[str] = None
    lastWorkingDay: Optional[str] = None
    reason: Optional[str] = None
    noticePeriodServed: Optional[str] = "no"


class ExitRecordCreate(BaseModel):
    employeeId: int
    exitType: str = "resigned"
    exitDate: str
    lastWorkingDay: Optional[str] = None
    reason: Optional[str] = None
    noticePeriodServed: Optional[str] = "no"
    companyId: Optional[int] = None
    branchId: Optional[int] = None
    departmentId: Optional[int] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    remarks: Optional[str] = None


class ExitRecordUpdate(BaseModel):
    exitType: Optional[str] = None
    exitDate: Optional[str] = None
    lastWorkingDay: Optional[str] = None
    reason: Optional[str] = None
    noticePeriodServed: Optional[str] = None
    companyId: Optional[int] = None
    branchId: Optional[int] = None
    departmentId: Optional[int] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    remarks: Optional[str] = None
    approvalStatus: Optional[str] = None


class FnfCalculationRequest(BaseModel):
    employeeId: Optional[int] = None
    monthlySalary: Optional[float] = None
    gratuityDays: Optional[float] = None        # days per year used for gratuity (default 15)
    gratuityEligibleYears: Optional[float] = None  # min years of service for gratuity (default 5)
    leaveBalance: Optional[float] = None        # encashable leave days
    noticeDays: Optional[float] = None          # notice period deduction days
    noticeRatePerDay: Optional[float] = None    # rate for notice deduction (default monthly/30)
    otherEarnings: Optional[float] = None
    otherDeductions: Optional[float] = None


class DepartmentBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    managerId: Optional[int] = None
    status: Optional[str] = "active"


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentResponse(DepartmentBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class LeaveBase(BaseModel):
    employeeId: int
    leaveTypeId: int
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    departmentId: Optional[int] = None
    startDate: str
    endDate: str
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    reason: Optional[str] = None
    purpose: Optional[str] = None
    description: Optional[str] = None
    attachmentUrl: Optional[str] = None
    approverId: Optional[int] = None
    isHalfDay: Optional[bool] = False
    isPaid: Optional[bool] = True
    isPrivilege: Optional[bool] = False
    emergencyContact: Optional[str] = None
    workHandoverTo: Optional[str] = None
    currentApprovalLevel: Optional[int] = 1
    totalApprovalLevels: Optional[int] = 1
    level1ApproverId: Optional[int] = None
    level2ApproverId: Optional[int] = None
    level3ApproverId: Optional[int] = None
    mobileRequestId: Optional[str] = None
    requestSource: Optional[str] = "web"


class LeaveCreate(LeaveBase):
    pass


class LeaveResponse(LeaveBase):
    id: int
    status: Optional[str] = "pending"
    approvedAt: Optional[str] = None
    level1ApprovedAt: Optional[str] = None
    level2ApprovedAt: Optional[str] = None
    level3ApprovedAt: Optional[str] = None
    rejectionReason: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class LeaveApprovalAction(BaseModel):
    action: str  # approve / reject
    level: Optional[int] = 1
    comments: Optional[str] = None


class AttendanceBase(BaseModel):
    employeeId: int
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    departmentId: Optional[int] = None
    shiftId: Optional[int] = None
    checkIn: Optional[str] = None
    checkOut: Optional[str] = None
    status: Optional[str] = "present"
    workHours: Optional[float] = None
    overtimeHours: Optional[float] = None
    breakHours: Optional[float] = None
    isLate: Optional[bool] = False
    lateMinutes: Optional[int] = 0
    isEarlyDeparture: Optional[bool] = False
    notes: Optional[str] = None
    checkInLatitude: Optional[float] = None
    checkInLongitude: Optional[float] = None
    checkOutLatitude: Optional[float] = None
    checkOutLongitude: Optional[float] = None
    checkInLocationName: Optional[str] = None
    checkOutLocationName: Optional[str] = None
    isWithinGeofence: Optional[bool] = True
    checkInSelfieUrl: Optional[str] = None
    checkOutSelfieUrl: Optional[str] = None
    deviceId: Optional[str] = None
    deviceType: Optional[str] = None
    ipAddress: Optional[str] = None
    isWorkFromHome: Optional[bool] = False
    isManualEntry: Optional[bool] = False
    approvedBy: Optional[int] = None
    syncStatus: Optional[str] = "synced"
    offlineCreatedAt: Optional[str] = None
    offlineDeviceId: Optional[str] = None


class AttendanceCreate(AttendanceBase):
    pass


class AttendanceResponse(AttendanceBase):
    id: int
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class ClockInRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    locationName: Optional[str] = None
    selfieData: Optional[str] = None
    deviceId: Optional[str] = None
    deviceType: Optional[str] = "web"
    offlineMode: Optional[bool] = False
    shiftId: Optional[int] = None
    notes: Optional[str] = None
    clientRequestId: Optional[str] = None


class ClockOutRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    locationName: Optional[str] = None
    selfieData: Optional[str] = None
    deviceId: Optional[str] = None
    deviceType: Optional[str] = "web"
    offlineMode: Optional[bool] = False
    notes: Optional[str] = None
    clientRequestId: Optional[str] = None


class ManualAttendanceCreate(BaseModel):
    employeeId: int
    checkIn: str
    checkOut: Optional[str] = None
    date: Optional[str] = None
    shiftId: Optional[int] = None
    notes: Optional[str] = None
    reason: Optional[str] = None
    status: Optional[str] = "present"
    isManualEntry: Optional[bool] = True
    workHours: Optional[float] = None
    scheduledHours: Optional[float] = 8
    breakHours: Optional[float] = 0
    companyId: Optional[int] = None
    branchId: Optional[int] = None
    departmentId: Optional[int] = None
    isLate: Optional[bool] = False
    lateMinutes: Optional[int] = 0
    isEarlyDeparture: Optional[bool] = False
    earlyDepartureMinutes: Optional[int] = 0
    location: Optional[str] = None
    checkInLocationName: Optional[str] = None
    checkOutLocationName: Optional[str] = None
    checkInLatitude: Optional[float] = None
    checkInLongitude: Optional[float] = None
    checkOutLatitude: Optional[float] = None
    checkOutLongitude: Optional[float] = None
    isWithinGeofence: Optional[bool] = True
    deviceType: Optional[str] = None
    overtimeHours: Optional[float] = None


class AttendanceSyncRequest(BaseModel):
    attendanceRecords: List[Dict[str, Any]]


class ConflictResolutionRequest(BaseModel):
    attendanceId: int
    resolutionAction: str  # keep_local / keep_server / merge
    resolutionNotes: Optional[str] = None


class BulkMarkRequest(BaseModel):
    records: List[Dict[str, Any]]
    status: str


class BulkDeleteRequest(BaseModel):
    records: List[Dict[str, Any]]


class BranchTransferCreate(BaseModel):
    employeeId: int
    fromBranchId: int
    toBranchId: int
    reason: Optional[str] = None
    effectiveDate: str


class BranchBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geofenceRadius: Optional[float] = 100
    companyId: Optional[int] = None
    organizationId: Optional[int] = None
    status: Optional[str] = "active"


class BranchCreate(BranchBase):
    pass


class BranchResponse(BranchBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class DesignationBase(BaseModel):
    name: str
    code: Optional[str] = None
    title: Optional[str] = None
    grade: Optional[str] = None
    description: Optional[str] = None
    minSalary: Optional[float] = None
    maxSalary: Optional[float] = None
    companyId: Optional[int] = None
    organizationId: Optional[int] = None
    status: Optional[str] = "active"


class DesignationCreate(DesignationBase):
    pass


class DesignationResponse(DesignationBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class LeaveTypeBase(BaseModel):
    name: str
    code: Optional[str] = None
    daysAllowed: int = 12
    carryForward: Optional[bool] = False
    carryForwardLimit: Optional[int] = 0
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    status: Optional[str] = "active"
    isPaid: Optional[bool] = True
    isEncashable: Optional[bool] = False
    color: Optional[str] = "#1C64F2"


class LeaveTypeCreate(LeaveTypeBase):
    pass


class LeaveTypeUpdate(BaseModel):
    """Partial update — every field optional (toggles and configure-only edits)."""
    name: Optional[str] = None
    code: Optional[str] = None
    daysAllowed: Optional[int] = None
    carryForward: Optional[bool] = None
    carryForwardLimit: Optional[int] = None
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    status: Optional[str] = None
    isPaid: Optional[bool] = None
    isEncashable: Optional[bool] = None
    color: Optional[str] = None


class LeaveTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    companyId: Optional[int] = None
    status: Optional[str] = "active"
    body: Optional[Dict[str, Any]] = None
    effectiveFrom: Optional[str] = None
    accrual_method: Optional[str] = "monthly"
    accrual_day: Optional[int] = 1
    probation_accrual_rate: Optional[float] = 0.5
    max_balance_cap: Optional[int] = None
    lapse_unused: Optional[bool] = False
    carry_forward_enabled: Optional[bool] = False
    carry_forward_max_days: Optional[int] = None
    carry_forward_expiry: Optional[str] = "year_end"
    carry_forward_use_it_or_lose_it: Optional[bool] = False
    encashment_enabled: Optional[bool] = False
    encashment_min_balance: Optional[int] = None
    encashment_rate: Optional[float] = None
    encashment_taxable: Optional[bool] = False
    holiday_optional_limit: Optional[int] = None
    holiday_auto_apply_national: Optional[bool] = False
    enable_half_day: Optional[bool] = False
    min_leave_for_half_day: Optional[int] = None
    advance_notice_days: Optional[int] = None
    max_consecutive_days: Optional[int] = None


class LeaveTemplateCreate(LeaveTemplateBase):
    pass


class LeaveTemplateUpdate(BaseModel):
    """Partial update — versioned edits handled by the endpoint."""
    name: Optional[str] = None
    description: Optional[str] = None
    companyId: Optional[int] = None
    status: Optional[str] = None
    body: Optional[Dict[str, Any]] = None
    effectiveFrom: Optional[str] = None
    accrual_method: Optional[str] = None
    accrual_day: Optional[int] = None
    probation_accrual_rate: Optional[float] = None
    max_balance_cap: Optional[int] = None
    lapse_unused: Optional[bool] = None
    carry_forward_enabled: Optional[bool] = None
    carry_forward_max_days: Optional[int] = None
    carry_forward_expiry: Optional[str] = None
    carry_forward_use_it_or_lose_it: Optional[bool] = None
    encashment_enabled: Optional[bool] = None
    encashment_min_balance: Optional[int] = None
    encashment_rate: Optional[float] = None
    encashment_taxable: Optional[bool] = None
    holiday_optional_limit: Optional[int] = None
    holiday_auto_apply_national: Optional[bool] = None
    enable_half_day: Optional[bool] = None
    min_leave_for_half_day: Optional[int] = None
    advance_notice_days: Optional[int] = None
    max_consecutive_days: Optional[int] = None


class LeaveTypeResponse(LeaveTypeBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class PayrollCalculateRequest(BaseModel):
    employeeId: int
    month: int
    year: int


class PayrollCalculateResponse(BaseModel):
    employeeId: int
    employeeName: Optional[str] = None
    month: int
    year: int
    basicSalary: float = 0
    hra: float = 0
    da: float = 0
    conveyance: float = 0
    medical: float = 0
    specialAllowance: float = 0
    grossSalary: float = 0
    overtimePay: float = 0
    bonus: float = 0
    totalEarnings: float = 0
    pfDeduction: float = 0
    esiDeduction: float = 0
    professionalTax: float = 0
    tdsDeduction: float = 0
    totalDeductions: float = 0
    netSalary: float = 0
    workingDays: int = 0
    presentDays: int = 0
    absentDays: int = 0
    paidDays: int = 0
    daysInMonth: int = 0


class PayrollBase(BaseModel):
    employeeId: int
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    departmentId: Optional[int] = None
    month: int
    year: int
    basicSalary: Optional[float] = 0
    hra: Optional[float] = 0
    da: Optional[float] = 0
    conveyance: Optional[float] = 0
    medical: Optional[float] = 0
    specialAllowance: Optional[float] = 0
    grossSalary: Optional[float] = 0
    overtimePay: Optional[float] = 0
    bonus: Optional[float] = 0
    commission: Optional[float] = 0
    incentive: Optional[float] = 0
    otherEarnings: Optional[float] = 0
    totalEarnings: Optional[float] = 0
    pfDeduction: Optional[float] = 0
    esiDeduction: Optional[float] = 0
    professionalTax: Optional[float] = 0
    tdsDeduction: Optional[float] = 0
    gratuity: Optional[float] = 0
    loanDeduction: Optional[float] = 0
    advanceDeduction: Optional[float] = 0
    otherDeductions: Optional[float] = 0
    totalDeductions: Optional[float] = 0
    netSalary: Optional[float] = 0
    workingDays: Optional[int] = 0
    presentDays: Optional[int] = 0
    absentDays: Optional[int] = 0
    paidDays: Optional[int] = 0
    unpaidDays: Optional[int] = 0
    leaveDays: Optional[int] = 0
    status: Optional[str] = "draft"
    paymentMethod: Optional[str] = None
    notes: Optional[str] = None
    remarks: Optional[str] = None
    bankAccount: Optional[str] = None
    ifscCode: Optional[str] = None
    transactionId: Optional[str] = None
    utrNumber: Optional[str] = None
    checkNumber: Optional[str] = None
    checkDate: Optional[str] = None
    pfEmployerContribution: Optional[float] = 0
    esiEmployerContribution: Optional[float] = 0
    lwfDeduction: Optional[float] = 0
    lwfEmployerContribution: Optional[float] = 0
    incomeTax: Optional[float] = 0
    surcharge: Optional[float] = 0
    cess: Optional[float] = 0


class PayrollCreate(PayrollBase):
    pass


class PayrollResponse(PayrollBase):
    id: int
    processedBy: Optional[int] = None
    processedAt: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SalaryTemplateBase(BaseModel):
    name: str
    basicPercent: float = 50
    hraPercent: float = 20
    specialAllowancePercent: float = 15
    otherAllowancePercent: float = 15
    organizationId: Optional[int] = None
    status: Optional[str] = "active"


class SalaryTemplateCreate(SalaryTemplateBase):
    pass


class SalaryTemplateUpdate(BaseModel):
    name: Optional[str] = None
    basicPercent: Optional[float] = None
    hraPercent: Optional[float] = None
    specialAllowancePercent: Optional[float] = None
    otherAllowancePercent: Optional[float] = None
    organizationId: Optional[int] = None
    status: Optional[str] = None


class SalaryTemplateResponse(SalaryTemplateBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class ShiftBase(BaseModel):
    name: str
    startTime: str = "09:00"
    endTime: str = "18:00"
    organizationId: Optional[int] = None
    status: Optional[str] = "active"


class ShiftCreate(ShiftBase):
    pass


class ShiftResponse(ShiftBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class DutyRosterBase(BaseModel):
    employeeId: int
    shiftId: int
    date: str
    organizationId: Optional[int] = None
    status: Optional[str] = "active"


class DutyRosterCreate(DutyRosterBase):
    pass


class DutyRosterResponse(DutyRosterBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class JobOpeningBase(BaseModel):
    title: str
    jobCode: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    location: Optional[str] = None
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    departmentId: Optional[int] = None
    branchId: Optional[int] = None
    employmentType: Optional[str] = "full_time"
    salaryMin: Optional[float] = None
    salaryMax: Optional[float] = None
    experienceRequired: Optional[str] = None
    educationRequired: Optional[str] = None
    skillsRequired: Optional[str] = None
    benefits: Optional[str] = None
    vacancyCount: Optional[int] = 1
    expiryDate: Optional[str] = None
    postDate: Optional[str] = None
    status: Optional[str] = "open"


class JobOpeningCreate(JobOpeningBase):
    pass


class JobOpeningResponse(JobOpeningBase):
    id: int
    publishedDate: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CandidateBase(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    fullName: Optional[str] = None
    email: str
    phone: Optional[str] = None
    jobOpeningId: Optional[int] = None
    jobId: Optional[int] = None
    companyId: Optional[int] = None
    branchId: Optional[int] = None
    departmentId: Optional[int] = None
    candidateStatus: Optional[str] = "applied"
    status: Optional[str] = "applied"
    source: Optional[str] = "direct"
    currentCompany: Optional[str] = None
    currentPosition: Optional[str] = None
    currentSalary: Optional[float] = None
    expectedSalary: Optional[float] = None
    noticePeriod: Optional[str] = None
    experienceYears: Optional[float] = None
    education: Optional[str] = None
    skills: Optional[str] = None
    linkedinUrl: Optional[str] = None
    portfolioUrl: Optional[str] = None
    notes: Optional[str] = None
    resumeUrl: Optional[str] = None


class CandidateCreate(CandidateBase):
    pass


class CandidateResponse(CandidateBase):
    id: int
    appliedDate: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class PerformanceReviewBase(BaseModel):
    employeeId: int
    reviewerId: Optional[int] = None
    reviewerName: Optional[str] = None
    reviewPeriod: str
    reviewYear: int
    reviewCycle: Optional[str] = None
    reviewDate: Optional[str] = None
    companyId: Optional[int] = None
    branchId: Optional[int] = None
    departmentId: Optional[int] = None
    overallScore: Optional[float] = None
    productivityScore: Optional[int] = None
    qualityScore: Optional[int] = None
    communicationScore: Optional[int] = None
    teamworkScore: Optional[int] = None
    leadershipScore: Optional[int] = None
    initiativeScore: Optional[int] = None
    punctualityScore: Optional[int] = None
    problemSolvingScore: Optional[int] = None
    collaborationScore: Optional[int] = None
    adaptabilityScore: Optional[int] = None
    creativityScore: Optional[int] = None
    attendanceScore: Optional[int] = None
    goalsSet: Optional[str] = None
    goalsAchieved: Optional[str] = None
    strengths: Optional[str] = None
    areasForImprovement: Optional[str] = None
    developmentPlan: Optional[str] = None
    achievements: Optional[str] = None
    keyProjects: Optional[str] = None
    trainingNeeds: Optional[str] = None
    reviewerPosition: Optional[str] = None
    promotionEligible: Optional[bool] = False
    salaryRecommendation: Optional[str] = None
    salaryPercentage: Optional[float] = None
    nextReviewDate: Optional[str] = None
    reviewerComments: Optional[str] = None
    employeeComments: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "draft"


class PerformanceReviewCreate(PerformanceReviewBase):
    pass


class PerformanceReviewResponse(PerformanceReviewBase):
    id: int
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class GoalBase(BaseModel):
    employeeId: int
    title: str
    description: Optional[str] = None
    goalType: Optional[str] = "OKR"
    category: Optional[str] = None
    objective: Optional[str] = None
    keyResults: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    targetValue: Optional[float] = None
    currentValue: Optional[float] = 0
    progress: Optional[int] = 0
    status: Optional[str] = "active"
    priority: Optional[str] = "medium"
    weight: Optional[float] = 1.0
    alignedWith: Optional[str] = None
    metricType: Optional[str] = None
    unit: Optional[str] = None
    comments: Optional[str] = None
    notes: Optional[str] = None


class GoalCreate(GoalBase):
    pass


class GoalResponse(GoalBase):
    id: int
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class FeedbackBase(BaseModel):
    employeeId: int
    reviewerId: Optional[int] = None
    feedbackType: str  # peer, manager, self, subordinate, client
    feedbackCycle: Optional[str] = None
    feedbackPeriod: Optional[str] = None
    feedbackYear: Optional[int] = None
    relationshipType: Optional[str] = None
    collaborationDuration: Optional[str] = None
    communicationRating: Optional[int] = None
    teamworkRating: Optional[int] = None
    leadershipRating: Optional[int] = None
    problemSolvingRating: Optional[int] = None
    reliabilityRating: Optional[int] = None
    adaptabilityRating: Optional[int] = None
    overallRating: Optional[int] = None
    strengths: Optional[str] = None
    areasForImprovement: Optional[str] = None
    specificExamples: Optional[str] = None
    recommendations: Optional[str] = None
    whatEmployeeDoesWell: Optional[str] = None
    whatEmployeeCouldImprove: Optional[str] = None
    collaborationFeedback: Optional[str] = None
    additionalComments: Optional[str] = None
    isAnonymous: Optional[bool] = False
    notes: Optional[str] = None
    status: Optional[str] = "submitted"


class FeedbackCreate(FeedbackBase):
    pass


class FeedbackResponse(FeedbackBase):
    id: int
    submittedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class ExpenseBase(BaseModel):
    employeeId: int
    category: str
    description: Optional[str] = None
    amount: float
    currency: Optional[str] = "INR"
    expenseDate: str
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    departmentId: Optional[int] = None
    vendor: Optional[str] = None
    invoiceNumber: Optional[str] = None
    taxAmount: Optional[float] = 0
    paymentMethod: Optional[str] = "cash"
    notes: Optional[str] = None
    receiptUrl: Optional[str] = None
    status: Optional[str] = "pending"
    billable: Optional[bool] = False


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseResponse(ExpenseBase):
    id: int
    approvedBy: Optional[int] = None
    approvedAt: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class InterviewBase(BaseModel):
    candidateId: int
    jobOpeningId: Optional[int] = None
    jobId: Optional[int] = None
    companyId: Optional[int] = None
    interviewType: Optional[str] = "in_person"
    interviewRound: Optional[int] = 1
    scheduledAt: str
    durationMinutes: Optional[int] = 60
    interviewerId: Optional[int] = None
    location: Optional[str] = None
    meetingLink: Optional[str] = None
    feedback: Optional[str] = None
    rating: Optional[float] = None
    technicalScore: Optional[int] = None
    communicationScore: Optional[int] = None
    overallScore: Optional[int] = None
    interviewerNotes: Optional[str] = None
    nextSteps: Optional[str] = None
    status: Optional[str] = "scheduled"


class InterviewCreate(InterviewBase):
    pass


class InterviewResponse(InterviewBase):
    id: int
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class HolidayBase(BaseModel):
    name: str
    date: str
    description: Optional[str] = None
    type: Optional[str] = "public"
    organizationId: Optional[int] = None
    companyId: Optional[int] = None
    year: Optional[int] = None
    isRecurring: Optional[bool] = False
    isPaid: Optional[bool] = True
    isWorkingDay: Optional[bool] = False
    region: Optional[str] = None
    category: Optional[str] = "general"
    notes: Optional[str] = None


class HolidayCreate(HolidayBase):
    pass


class HolidayResponse(HolidayBase):
    id: int
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AssetBase(BaseModel):
    employeeId: Optional[int] = None
    assetType: str = "laptop"
    assetName: str
    serialNumber: str
    status: str = "available"
    purchaseDate: Optional[str] = None
    issueDate: Optional[str] = None
    value: float = 0
    purchaseValue: Optional[float] = None
    usefulLifeYears: Optional[float] = None
    depreciationRate: Optional[float] = None
    salvageValue: Optional[float] = None
    notes: Optional[str] = None
    organizationId: Optional[int] = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    employeeId: Optional[int] = None
    assetType: Optional[str] = None
    assetName: Optional[str] = None
    serialNumber: Optional[str] = None
    status: Optional[str] = None
    purchaseDate: Optional[str] = None
    issueDate: Optional[str] = None
    value: Optional[float] = None
    purchaseValue: Optional[float] = None
    usefulLifeYears: Optional[float] = None
    depreciationRate: Optional[float] = None
    salvageValue: Optional[float] = None
    notes: Optional[str] = None


class AssetResponse(AssetBase):
    id: int
    employeeName: Optional[str] = None
    employeeCode: Optional[str] = None
    createdAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class LeaveBalanceResponse(BaseModel):
    id: int
    employeeId: int
    employeeName: Optional[str] = None
    year: int
    leaveTypeId: int
    leaveTypeName: Optional[str] = None
    totalDays: int
    usedDays: int
    remainingDays: int
    model_config = ConfigDict(from_attributes=True)


class LeaveBalanceUpdate(BaseModel):
    totalDays: Optional[int] = None
    usedDays: Optional[int] = None
    remainingDays: Optional[int] = None


class NotificationCreate(BaseModel):
    userId: int
    title: str
    body: Optional[str] = None
    type: str = "system"
    referenceId: Optional[str] = None
    data: Optional[dict] = None


class NotificationResponse(BaseModel):
    id: int
    userId: int
    title: str
    body: Optional[str] = None
    type: str
    referenceId: Optional[str] = None
    isRead: bool
    readAt: Optional[str] = None
    createdAt: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class BonusCreate(BaseModel):
    employeeId: int
    month: int
    year: int
    amount: float
    reason: Optional[str] = None


class BonusResponse(BaseModel):
    id: int
    employeeId: int
    employeeName: Optional[str] = None
    month: int
    year: int
    amount: float
    reason: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

