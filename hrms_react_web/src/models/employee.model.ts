/**
 * Employee Model - defines data structures (Model in MVVM)
 * Following Single Responsibility Principle - handles data structures only
 */

export type EmployeeStatus = 'active' | 'inactive' | 'onboarding' | 'offboarding' | 'suspended';
export type TransferType = 'temporary' | 'permanent';
export type TransferStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
export type AssignmentStatus = 'active' | 'inactive';

// Base interfaces
export interface IEmployee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  joinDate: string;
  exitDate?: string;
  status: EmployeeStatus;
  employmentType: string;
  
  // Relations
  companyId?: number;
  company?: { id: number; name: string };
  branchId?: number;
  branch?: { id: number; name: string };
  departmentId?: number;
  department?: { id: number; name: string };
  designationId?: number;
  designation?: { id: number; title: string };
  managerId?: number;
  manager?: { firstName: string; lastName: string };
  
  // Multi-assignment support
  branchAssignments?: IBranchAssignment[];
  departmentAssignments?: IDepartmentAssignment[];
  
  createdAt: string;
  updatedAt: string;
}

export interface IEmployeeTransfer {
  id: number;
  employeeId: number;
  employeeName?: string;
  
  // Source location
  fromBranchId: number;
  fromBranchName?: string;
  fromDepartmentId?: number;
  fromDepartmentName?: string;
  
  // Destination location
  toBranchId: number;
  toBranchName?: string;
  toDepartmentId?: number;
  toDepartmentName?: string;
  
  type: TransferType;
  startDate: string;
  endDate?: string;
  reason: string;
  status: TransferStatus;
  
  // Approval tracking
  requestedBy?: number;
  requestedByName?: string;
  approvedBy?: number;
  approvedByName?: string;
  approvedAt?: string;
  
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IBranchAssignment {
  id: number;
  employeeId: number;
  employeeName?: string;
  branchId: number;
  branchName?: string;
  isPrimary: boolean;
  startDate: string;
  endDate?: string;
  status: AssignmentStatus;
  createdAt: string;
}

export interface IDepartmentAssignment {
  id: number;
  employeeId: number;
  employeeName?: string;
  departmentId: number;
  departmentName?: string;
  isPrimary: boolean;
  startDate: string;
  endDate?: string;
  status: AssignmentStatus;
  createdAt: string;
}

export interface ILifecycleEvent {
  id: number;
  employeeId: number;
  eventType: 'joined' | 'transfer' | 'promotion' | 'termination' | 'resignation' | 'suspension' | 'reactivation';
  eventDate: string;
  description?: string;
  fromValue?: string;
  toValue?: string;
  metadata?: Record<string, unknown>;
  recordedBy?: number;
  recordedByName?: string;
  createdAt: string;
}

// Request DTOs
export interface ICreateEmployeeDTO {
  firstName: string;
  lastName?: string;
  email: string;
  employeeCode: string;
  phone?: string;
  companyId: number;
  branchId: number;
  departmentId: number;
  designationId?: number;
  managerId?: number;
  joinDate?: string;
  employmentType?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface IUpdateEmployeeDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  designationId?: number;
  managerId?: number;
  status?: EmployeeStatus;
  employmentType?: string;
  address?: string;
}

export interface ICreateTransferDTO {
  employeeId: number;
  fromBranchId: number;
  fromDepartmentId?: number;
  toBranchId: number;
  toDepartmentId?: number;
  type: TransferType;
  startDate: string;
  endDate?: string;
  reason: string;
}

export interface ICreateAssignmentDTO {
  employeeId: number;
  branchId?: number;
  departmentId?: number;
  isPrimary: boolean;
  startDate?: string;
}

// Filter types
export interface IEmployeeFilters {
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  status?: EmployeeStatus;
  employmentType?: string;
  search?: string;
}
