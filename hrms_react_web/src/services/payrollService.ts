import type { Company, Employee, Payroll } from '../types';
import api from './api';

export interface PayrollItem {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  month: number;
  year: number;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netPay: number;
  status: 'pending' | 'processed' | 'paid';
  paymentDate?: string;
  createdAt: string;
  updatedAt: string;
  components?: PayrollComponent[];
}

export interface PayrollComponent {
  type: string;
  label: string;
  amount: number;
  isDeduction: boolean;
}

export interface PayrollSummary {
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNetPay: number;
  processedCount: number;
  pendingCount: number;
  paidCount: number;
}

export const getPayroll = async (month?: number, year?: number, organizationId?: number): Promise<PayrollItem[]> => {
  const params: Record<string, unknown> = {};
  if (month) params.month = month;
  if (year) params.year = year;
  if (organizationId) params.organizationId = organizationId;
  const response = await api.get<PayrollItem[]>('/payroll', { params });
  return response.data;
};

export const getPayrollSummary = async (month?: number, year?: number): Promise<PayrollSummary> => {
  const params: Record<string, unknown> = {};
  if (month) params.month = month;
  if (year) params.year = year;
  const response = await api.get<PayrollSummary>('/payroll/summary', { params });
  return response.data;
};

export const processPayroll = async (month: number, year: number): Promise<PayrollItem[]> => {
  const response = await api.post<PayrollItem[]>('/payroll/process', { month, year });
  return response.data;
};

export const getEmployeePayroll = async (employeeId: number, month?: number, year?: number): Promise<PayrollItem[]> => {
  const params: Record<string, unknown> = {};
  if (month) params.month = month;
  if (year) params.year = year;
  const response = await api.get<PayrollItem[]>(`/payroll/employee/${employeeId}`, { params });
  return response.data;
};

export const updatePayrollStatus = async (payrollId: number, status: string): Promise<PayrollItem> => {
  const response = await api.put<PayrollItem>(`/payroll/${payrollId}/status`, { status });
  return response.data;
};

export interface PayslipData {
  payroll: Payroll;
  employee: Employee;
  organization: Record<string, unknown>;
  company: Company;
}

export const getPayslipData = async (payrollId: number): Promise<PayslipData> => {
  const response = await api.get<PayslipData>(`/payroll/${payrollId}/payslip`);
  return response.data;
};

export const downloadPayslipPdf = async (payrollId: number, filename: string) => {
  const response = await api.get(`/payroll/${payrollId}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};