export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  employeeId?: number;
  employeeCode?: string;
  role: string;
  organizationId?: number;
  departmentId?: number;
  designation?: string;
  department?: string;
  phone?: string;
  avatar?: string;
  status: string;
  joiningDate?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  nationality?: string;
  profileImage?: string;
  address?: { street?: string; city?: string; state?: string; pincode?: string; country?: string };
  emergencyContact?: { name?: string; phone?: string; relation?: string };
  bankDetails?: { accountNumber?: string; bankName?: string; ifscCode?: string; upiId?: string };
  taxInfo?: { panNumber?: string; taxRegime?: string; taxSlab?: string };
  onboardingStep?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeSummary {
  id: number; employeeId: number; fullName: string; designation?: string; department?: string; email: string; phone?: string; status: string; avatar?: string;
}

export interface AttendanceRecord {
  id: number; employeeId: number; date: string; checkIn?: string; checkOut?: string; status: string; workHours?: number; isWorkFromHome?: boolean; isLate?: boolean; syncStatus?: string; locationName?: string;
}

export interface Expense {
  id: number; employeeId: number; category: string; amount: number; description: string; expenseDate: string; status: string; currency?: string; receiptUrl?: string; justification?: string; approvedAt?: string; approvedBy?: number;
}

export interface Notification {
  id: string; title: string; body: string; status: 'unread' | 'read'; category?: string; createdAt: string; user?: number;
}

export interface Goal {
  id: number; employeeId: number; title: string; description: string; status: string; priority: string; category: string; progress: number; startDate: string; targetDate: string; createdAt: string;
}

export interface Shift {
  id: number; name: string; code: string; shiftType: string; startTime: string; endTime: string; graceMinutes: number; breakDuration: number; color: string;
}

export interface RosterAssignment {
  id: number; employeeId: number; shiftId: number; date: string; status: string; employeeName?: string; shiftName?: string;
}
