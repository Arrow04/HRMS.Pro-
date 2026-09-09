import api from './api';
import { fetchAllEmployeePickerList } from './employeeListService';
import type { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import type {
  Attendance,
  Expense,
  Holiday,
  LeaveApplication,
  Payroll,
  PerformanceReview,
} from '../types';
import type {
  ICreateTransferDTO,
  IEmployeeTransfer,
} from '../models/employee.model';

export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  fullName?: string;
  email: string;
  employeeCode: string;
  designation?: string;
  departmentId?: number;
  organizationId?: number;
  status: string;
  phone?: string;
  joinDate?: string;
}

export interface Organization {
  id: number;
  name: string;
  code: string;
}

export interface Department {
  id: number;
  name: string;
  organizationId: number;
}

export interface Branch {
  id: number;
  name: string;
  organizationId: number;
}

export interface Shift {
  id: number;
  name: string;
  code: string;
  shift_type: 'morning' | 'evening' | 'night' | 'general';
  start_time: string;
  end_time: string;
  grace_minutes: number;
  break_duration: number;
  working_days: string;
  color: string;
  description?: string;
  organizationId: number;
  status: string;
}

export interface Company {
  id: number;
  name: string;
  organizationId: number;
}

export interface Designation {
  id: number;
  title: string;
  organizationId: number;
  companyId?: number;
}

interface QueryParams {
  organizationId?: number;
  companyId?: number;
  employeeId?: number;
  month?: number;
  year?: number;
}

export interface PerformanceMetrics {
  period: string;
  daysWorked: number;
  hoursWorked: number;
  avgHoursPerDay: number;
  lateDays: number;
}

export interface PerformanceSummary {
  efficiency: string | number;
}

export interface EmployeePerformance {
  metrics: PerformanceMetrics[];
  summary: PerformanceSummary;
}

export interface BranchContext {
  weather: {
    condition: string;
    temp: string | number;
    alert: string;
  };
  currentTime: string;
  currentDate: string;
}

export interface BulkUploadResult {
  success: boolean;
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

export const getEmployees = async (organizationId?: number, companyId?: number, status?: string): Promise<Employee[]> => {
  const result = await fetchAllEmployeePickerList({
    companyId,
    status,
  });
  return result.data;
};

export const createEmployee = async (employeeData: Partial<Employee>): Promise<Employee> => {
  const response = await api.post<Employee>('/employees', employeeData);
  return response.data;
};

export const getOrganizations = async (): Promise<Organization[]> => {
  const response = await api.get<Organization[]>('/organizations');
  return response.data;
};

export const getCompanies = async (organizationId?: number): Promise<Company[]> => {
  const url = organizationId ? `/organizations/${organizationId}/companies` : '/companies'; // Note: backend might need /api/companies
  const response = await api.get<Company[]>(url);
  return response.data;
};

export const getDepartments = async (organizationId?: number, companyId?: number): Promise<Department[]> => {
  const params: QueryParams = {};
  if (organizationId) params.organizationId = organizationId;
  if (companyId) params.companyId = companyId;
  const response = await api.get<Department[]>('/departments', { params });
  return response.data;
};

export const getBranches = async (organizationId?: number, companyId?: number): Promise<Branch[]> => {
  const params: QueryParams = {};
  if (organizationId) params.organizationId = organizationId;
  if (companyId) params.companyId = companyId;
  const response = await api.get<Branch[]>('/branches', { params });
  return response.data;
};

export const getDesignations = async (organizationId?: number, companyId?: number): Promise<Designation[]> => {
  const params: QueryParams = {};
  if (organizationId) params.organizationId = organizationId;
  if (companyId) params.companyId = companyId;
  const response = await api.get<Designation[]>('/designations', { params });
  return response.data;
};

export const getEmployee = async (employeeId: number): Promise<Employee> => {
  try {
    const response = await api.get<Employee>(`/employees/${employeeId}`);
    return response.data;
  } catch (error: unknown) {
    const err = error as AxiosError;
    logger.error('getEmployee error:', err.response?.status, err.response?.data);
    throw error;
  }
};

export const updateEmployee = async (employeeId: number, employeeData: Partial<Employee>): Promise<Employee> => {
  const response = await api.put<Employee>(`/employees/${employeeId}`, employeeData);
  return response.data;
};

export const createTransfer = async (transferData: ICreateTransferDTO): Promise<IEmployeeTransfer> => {
  const response = await api.post<IEmployeeTransfer>('/employees/transfers', transferData);
  return response.data;
};

export const getShifts = async (organizationId?: number, companyId?: number): Promise<Shift[]> => {
  const params: QueryParams = {};
  if (organizationId) params.organizationId = organizationId;
  if (companyId) params.companyId = companyId;
  const response = await api.get<Shift[]>('/shifts', { params });
  return response.data;
};

export const getEmployeePerformance = async (employeeId: number, month?: number, year?: number): Promise<EmployeePerformance> => {
  const params: QueryParams = {};
  if (month) params.month = month;
  if (year) params.year = year;
  const response = await api.get<EmployeePerformance>(`/employees/${employeeId}/performance`, { params });
  return response.data;
};

export const getExpenses = async (employeeId?: number, organizationId?: number): Promise<Expense[]> => {
  const params: QueryParams = {};
  if (employeeId) params.employeeId = employeeId;
  if (organizationId) params.organizationId = organizationId;
  const response = await api.get<Expense[]>('/expenses', { params });
  return response.data;
};

export const createExpense = async (expenseData: Partial<Expense>): Promise<Expense> => {
  const response = await api.post<Expense>('/expenses', expenseData);
  return response.data;
};

export const approveExpense = async (expenseId: number, status: string): Promise<Expense> => {
  const response = await api.post<Expense>(`/expenses/${expenseId}/approve`, { action: status });
  return response.data;
};

export const getBranchContext = async (branchId: number): Promise<BranchContext> => {
  const response = await api.get<BranchContext>(`/branches/${branchId}/context`);
  return response.data;
};

export const getEmployeeAttendance = async (employeeId: number, month?: number, year?: number): Promise<Attendance[]> => {
  const params: QueryParams = {};
  if (month) params.month = month;
  if (year) params.year = year;
  const response = await api.get(`/employees/${employeeId}/attendance`, { params });
  const data = response.data;
  return data?.items || data?.data || data || [];
};

export const getEmployeeLeaves = async (employeeId: number): Promise<LeaveApplication[]> => {
  const response = await api.get<LeaveApplication[]>(`/employees/${employeeId}/leaves`);
  return response.data;
};

export const getEmployeePayroll = async (employeeId: number, year?: number): Promise<Payroll[]> => {
  const params: QueryParams = {};
  if (year) params.year = year;
  const response = await api.get<Payroll[]>(`/employees/${employeeId}/payroll`, { params });
  return response.data;
};

export const getEmployeePerformanceReviews = async (employeeId: number, year?: number): Promise<PerformanceReview[]> => {
  const params: QueryParams = { employeeId };
  if (year) params.year = year;
  const response = await api.get<PerformanceReview[]>('/performance/reviews', { params });
  return response.data;
};

export const getEmployeeExpenses = async (employeeId: number): Promise<Expense[]> => {
  const response = await api.get<Expense[]>('/expenses', { params: { employeeId } });
  return response.data;
};

export const getHolidays = async (year?: number, organizationId?: number): Promise<Holiday[]> => {
  const params: QueryParams = {};
  if (year) params.year = year;
  if (organizationId) params.organizationId = organizationId;
  const response = await api.get<Holiday[]>('/holidays', { params });
  return response.data;
};

export const bulkUploadEmployees = async (file: File, organizationId?: number, companyId?: number): Promise<BulkUploadResult> => {
  const formData = new FormData();
  formData.append('file', file);
  if (organizationId) formData.append('organizationId', organizationId.toString());
  if (companyId) formData.append('companyId', companyId.toString());
  const response = await api.post<BulkUploadResult>('/employees/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const downloadEmployeeTemplate = async (): Promise<void> => {
  const response = await api.get('/employees/template', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'employee_bulk_upload_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
