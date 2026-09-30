// Shared API response types matching backend models (camelCase)

export interface User {
  id: number;
  email: string;
  fullName: string;
  phone?: string;
  role: string;
  organizationId?: number;
  isActive: boolean;
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
  employee?: Employee[];
}

export interface Employee {
  id: number;
  userId?: number;
  firstName: string;
  lastName?: string;
  fullName?: string;
  email: string;
  employeeCode?: string;
  designation?: string;
  designationId?: number;
  departmentId?: number;
  department?: { id: number; name: string };
  organizationId?: number;
  companyId?: number;
  company?: { id: number; name: string };
  branchIds?: number[];
  branches?: { id: number; name: string; code: string }[];
  branch?: { id: number; name: string };
  status: string;
  employmentType?: string;
  joinDate?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  address?: string;
  currentAddress?: string;
  permanentAddress?: string;
  permanentLandmark?: string;
  currentState?: string;
  currentPincode?: string;
  permanentState?: string;
  permanentPincode?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  deletedAt?: string | null;
  // onboard
  onboardingStep?: string;
  onboardingStatus?: string;
  onboardingProgress?: OnboardingTask[];
  // payroll
  baseSalary?: number;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  pfNumber?: string;
  pfUan?: string;
  esicNumber?: string;
  // docs
  aadharNumber?: string;
  panNumber?: string;
  voterId?: string;
  drivingLicense?: string;
  passportNumber?: string;
  photoUrl?: string;
  resumeUrl?: string;
  // education
  educationLevel?: string;
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: string;
  skills?: string;
  // family
  fatherName?: string;
  motherName?: string;
  spouseName?: string;
  nomineeName?: string;
  nomineeRelationship?: string;
  numberOfChildren?: number;
  // misc
  customFields?: Record<string, unknown>;
  landmark?: string;
  certificationDate?: string;
  certificationExpiry?: string;
  deviceAssignedDate?: string;
  userRole?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OnboardingTask {
  id?: number;
  employeeId?: number;
  taskName: string;
  status: string;
  assignedTo?: string;
  dueDate?: string;
  completedAt?: string;
  notes?: string;
}

export interface Attendance {
  id: number;
  employeeId: number;
  organizationId?: number;
  companyId?: number;
  departmentId?: number;
  shiftId?: number;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: string;
  workHours: number;
  scheduledHours: number;
  overtimeHours: number;
  breakHours: number;
  isLate: boolean;
  lateMinutes: number;
  isEarlyDeparture: boolean;
  earlyDepartureMinutes: number;
  notes?: string;
  comments?: string;
  reason?: string;
  location?: string;
  checkInLocationName?: string;
  checkOutLocationName?: string;
  isWorkFromHome: boolean;
  isManualEntry: boolean;
  isOnLeave: boolean;
  isHoliday: boolean;
  holidayId?: number;
  leaveApplicationId?: number;
  approvedBy?: number;
  approvedAt?: string;
  approvalComments?: string;
  syncStatus?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveApplication {
  id: number;
  employeeId: number;
  leaveTypeId: number;
  organizationId?: number;
  companyId?: number;
  departmentId?: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
  status: string;
  approverId?: number;
  approvedAt?: string;
  rejectionReason?: string;
  isHalfDay: boolean;
  isPaid: boolean;
  isPrivilege?: boolean;
  createdAt?: string;
  updatedAt?: string;
  employeeName?: string;
  employeeCode?: string;
  email?: string;
  leaveTypeName?: string;
}

export interface LeaveBalance {
  id: number;
  employeeId: number;
  year: number;
  leaveTypeId: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  employeeName?: string;
  employeeCode?: string;
  email?: string;
  leaveTypeName?: string;
}

export interface Payroll {
  id: number;
  employeeId: number;
  month: number;
  year: number;
  companyId?: number;
  organizationId?: number;
  departmentId?: number;
  grossSalary: number;
  netSalary: number;
  basicSalary: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  totalEarnings: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  lwfDeduction?: number;
  gratuity?: number;
  tdsDeduction: number;
  incomeTax?: number;
  surcharge?: number;
  cess?: number;
  totalDeductions: number;
  bonus: number;
  commission?: number;
  incentive?: number;
  otherEarnings?: number;
  overtimePay: number;
  status: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  paidDays: number;
  unpaidDays?: number;
  leaveDays: number;
  paymentMethod?: string;
  notes?: string;
  deductions?: number;
  netPay?: number;
  paidAt?: string;
  paymentDate?: string;
  updatedAt?: string;
  date?: string;
  createdAt?: string;
  employeeName?: string;
  employeeCode?: string;
}

export interface Expense {
  id: number;
  employeeId: number;
  category: string;
  amount: number;
  currency: string;
  description?: string;
  expenseDate: string;
  receiptUrl?: string;
  status: string;
  approverId?: number;
  approvedAt?: string;
  notes?: string;
  createdAt?: string;
  employeeName?: string;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  description?: string;
  type: string;
  organizationId?: number;
  companyId?: number;
  year?: number;
  isRecurring: boolean;
  isPaid: boolean;
  location?: string;
  notes?: string;
}

export interface Notification {
  id: number;
  userId: number;
  title: string;
  body: string;
  type?: string;
  referenceId?: string;
  isRead: boolean;
  readAt?: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface Asset {
  id: number;
  employeeId?: number;
  assetType: string;
  assetName: string;
  serialNumber: string;
  status: string;
  purchaseDate?: string;
  issueDate?: string;
  value: number;
  purchaseValue?: number;
  usefulLifeYears?: number;
  depreciationRate?: number;
  salvageValue?: number;
  notes?: string;
  organizationId?: number;
  employeeName?: string;
  employeeCode?: string;
  email?: string;
  companyName?: string;
  branchName?: string;
  departmentName?: string;
  companyId?: number;
  company_id?: number;
  departmentId?: number;
  department_id?: number;
  createdAt?: string;
}

export interface PerformanceReview {
  id: number;
  employeeId: number;
  reviewerId: number;
  reviewPeriod?: string;
  reviewYear: number;
  reviewDate?: string;
  reviewCycle?: string;
  overallScore: number;
  rating?: string;
  status: string;
  productivityScore?: number;
  qualityScore?: number;
  communicationScore?: number;
  teamworkScore?: number;
  leadershipScore?: number;
  initiativeScore?: number;
  punctualityScore?: number;
  problemSolvingScore?: number;
  collaborationScore?: number;
  adaptabilityScore?: number;
  creativityScore?: number;
  attendanceScore?: number;
  reviewerComments?: string;
  employeeComments?: string;
  goalsSet?: string;
  goalsAchieved?: string;
  strengths?: string;
  areasForImprovement?: string;
  developmentPlan?: string;
  achievements?: string;
  keyProjects?: string;
  trainingNeeds?: string;
  reviewerName?: string;
  reviewerPosition?: string;
  promotionEligible?: boolean;
  salaryRecommendation?: string;
  salaryPercentage?: number;
  nextReviewDate?: string;
  notes?: string;
  createdAt?: string;
}

export interface JobOpening {
  id: number;
  title: string;
  description?: string;
  requirements?: string;
  location?: string;
  employmentType: string;
  salaryMin?: number;
  salaryMax?: number;
  vacancyCount: number;
  status: string;
  expiryDate?: string;
  publishedDate?: string;
  createdAt?: string;
  organizationId?: number;
  companyId?: number;
  companyName?: string;
  departmentId?: number;
  departmentName?: string;
  branchId?: number;
  branchName?: string;
  experienceRequired?: string;
  educationRequired?: string;
  skillsRequired?: string;
  benefits?: string;
  updatedAt?: string;
}

export interface Candidate {
  id: number;
  fullName: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  jobOpeningId?: number;
  jobId?: number;
  jobTitle?: string;
  status: string;
  source?: string;
  currentCompany?: string;
  currentPosition?: string;
  experienceYears?: number;
  skills?: string;
  appliedDate: string;
  hiredDate?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  selectionReason?: string;
  employeeId?: number;
  onboarded?: boolean;
  companyId?: number;
  companyName?: string;
  branchId?: number;
  branchName?: string;
  departmentId?: number;
  departmentName?: string;
  currentSalary?: number;
  expectedSalary?: number;
  notes?: string;
  createdAt?: string;
}

export interface Interview {
  id: number;
  candidateId: number;
  candidateName?: string;
  interviewerId: number;
  interviewerName?: string;
  jobId?: number;
  jobTitle?: string;
  interviewType: string;
  interviewRound: number;
  date: string;
  scheduledAt?: string;
  durationMinutes?: number;
  location?: string;
  meetingLink?: string;
  status: string;
  feedback?: string;
  rating?: number;
  overallScore?: number;
  createdAt?: string;
}

export interface Shift {
  id: number;
  name: string;
  code: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  breakDuration: number;
  workingDays: string;
  color: string;
  description?: string;
  status: string;
}

export interface Company {
  id: number;
  name: string;
  code?: string;
  description?: string;
  registrationNumber?: string;
  taxId?: string;
  industry?: string;
  address?: string;
  email?: string;
  phone?: string;
  status: string;
  is_active?: boolean;
  organizationId?: number;
  createdAt?: string;
}

export interface Department {
  id: number;
  name: string;
  code?: string;
  description?: string;
  organizationId: number;
  companyId?: number;
  managerId?: number;
  status: string;
  is_active?: boolean;
}

export interface Designation {
  id: number;
  code?: string;
  title: string;
  grade?: string;
  description?: string;
  minSalary?: number;
  maxSalary?: number;
  status: string;
  is_active?: boolean;
}

export interface Branch {
  id: number;
  name: string;
  code?: string;
  description?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  is_active?: boolean;
}

export interface AuditLog {
  id: number;
  userId?: number;
  action: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  userName?: string;
}

export interface SalaryTemplate {
  id: number;
  name: string;
  basicPercent?: number;
  hraPercent?: number;
  specialAllowancePercent?: number;
  otherAllowancePercent?: number;
  organizationId?: number;
  status: string;
}

// Generic paginated response
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Generic API response wrapper
export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}
