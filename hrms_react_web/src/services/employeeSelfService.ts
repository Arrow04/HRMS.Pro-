// Employee self-service API helpers (mobile-first PWA portal)
import api from './api';
import { fetchEmployeePickerList } from './employeeListService';

// Resolve the current employee's profile (by their user id)
export const getMyEmployee = async () => {
  let email: string | null = null;
  try {
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      if (u.email) email = u.email;
    }
  } catch { /* ignore */ }
  if (email) {
    const byEmail = await fetchEmployeePickerList({ search: email, limit: 20 });
    return byEmail.data.find((e) => e.email === email) || null;
  }
  return null;
};

// ── Attendance ─────────────────────────────────────────────
export const checkIn = async (payload: Record<string, unknown>) =>
  (await api.post('/attendance/checkin', payload)).data;

export const checkOut = async (payload: Record<string, unknown> = {}) =>
  (await api.post('/attendance/checkout', payload)).data;

export const getMyAttendanceToday = async (employeeId: number) => {
  const res = await api.get('/attendance', { params: { employeeId, limit: 10 } });
  return res.data?.data || res.data || [];
};

export const getMyAttendanceHistory = async (employeeId: number, month?: number, year?: number) => {
  const params: Record<string, unknown> = { employeeId, limit: 100 };
  if (month) params.month = month;
  if (year) params.year = year;
  const res = await api.get('/attendance', { params });
  return res.data?.data || res.data || [];
};

// ── Leaves ─────────────────────────────────────────────────
export const getLeaveTypes = async () => {
  const res = await api.get('/leave-types');
  return res.data || [];
};

export const getMyLeaveBalances = async (employeeId: number) => {
  try {
    const res = await api.get('/leave-balances', { params: { employeeId } });
    return res.data?.data || res.data || [];
  } catch {
    return [];
  }
};

export const getMyLeaves = async (employeeId: number) => {
  const res = await api.get('/leaves', { params: { employeeId, limit: 100 } });
  return res.data?.data || res.data || [];
};

export const applyLeave = async (payload: Record<string, unknown>) =>
  (await api.post('/leaves', payload)).data;

// ── Expenses ───────────────────────────────────────────────
export const getExpenseCategories = async () => {
  try {
    const res = await api.get('/master-data/lookup/EXPENSE_CATEGORY');
    return res.data?.values || [];
  } catch {
    return [];
  }
};

export const getMyExpenses = async (employeeId: number) => {
  const res = await api.get('/expenses', { params: { employeeId, limit: 100 } });
  return res.data?.data || res.data || [];
};

export const submitExpense = async (payload: Record<string, unknown>) =>
  (await api.post('/expenses', payload)).data;

// ── Payslips ───────────────────────────────────────────────
export const getMyPayroll = async (employeeId: number) => {
  try {
    const res = await api.get(`/payroll/employee/${employeeId}`);
    return res.data?.data || res.data || [];
  } catch {
    return [];
  }
};

export const getPayslipPdfUrl = (payrollId: number) => `/api/payroll/${payrollId}/pdf`;

export const downloadPayslipPdf = async (payrollId: number) => {
  const res = await api.get(`/payroll/${payrollId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payslip_${payrollId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export const getPayslipData = async (payrollId: number) =>
  (await api.get(`/payroll/${payrollId}/payslip`)).data;

// ── Performance ────────────────────────────────────────────
export const getMyReviews = async (employeeId: number) => {
  const res = await api.get('/performance/reviews', { params: { employeeId, limit: 100 } });
  return res.data?.data || res.data || [];
};

export const submitSelfReview = async (payload: Record<string, unknown>) =>
  (await api.post('/performance/reviews', payload)).data;

// ── Holidays ───────────────────────────────────────────────
export const getUpcomingHolidays = async () => {
  const res = await api.get('/holidays');
  return res.data?.data || res.data || [];
};
