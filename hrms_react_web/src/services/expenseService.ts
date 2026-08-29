import api from './api';

export interface ExpenseItem {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  category: string;
  subCategory?: string;
  amount: number;
  currency: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'reimbursed';
  receiptUrl?: string;
  submittedDate: string;
  approvedDate?: string;
  reimbursedDate?: string;
  approvedBy?: number;
  approvedByName?: string;
  organizationId?: number;
  projectCode?: string;
  costCenter?: string;
}

export interface ExpenseSummary {
  totalSubmitted: number;
  totalApproved: number;
  totalRejected: number;
  totalReimbursed: number;
  pendingAmount: number;
}

export const getExpenses = async (
  employeeId?: number,
  organizationId?: number,
  status?: string,
  month?: number,
  year?: number
): Promise<ExpenseItem[]> => {
  const params: Record<string, unknown> = {};
  if (employeeId) params.employeeId = employeeId;
  if (organizationId) params.organizationId = organizationId;
  if (status) params.status = status;
  if (month) params.month = month;
  if (year) params.year = year;
  const response = await api.get<ExpenseItem[]>('/expenses', { params });
  return response.data;
};

export const getExpenseSummary = async (): Promise<ExpenseSummary> => {
  const response = await api.get<ExpenseSummary>('/expenses/summary');
  return response.data;
};

export const createExpense = async (expenseData: {
  category: string;
  subCategory?: string;
  amount: number;
  currency?: string;
  description: string;
  receiptUrl?: string;
  projectCode?: string;
  costCenter?: string;
  employeeId?: number;
}): Promise<ExpenseItem> => {
  const response = await api.post<ExpenseItem>('/expenses', expenseData);
  return response.data;
};

export const updateExpenseStatus = async (
  expenseId: number,
  status: 'approved' | 'rejected' | 'reimbursed',
  remarks?: string
): Promise<ExpenseItem> => {
  const response = await api.post<ExpenseItem>(`/expenses/${expenseId}/approve`, { action: status, remarks });
  return response.data;
};

export const bulkUploadExpenses = async (file: File, organizationId?: number): Promise<ExpenseItem[]> => {
  const formData = new FormData();
  formData.append('file', file);
  if (organizationId) formData.append('organizationId', organizationId.toString());
  const response = await api.post<ExpenseItem[]>('/expenses/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const downloadExpenseTemplate = async (): Promise<void> => {
  const response = await api.get('/expenses/template', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'expense_claim_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};