// Payroll engine platform API: rules, notifications, arrears, payments,
// filings, lifecycle and explainability (mandate phases 1-10 surface).
import api from './api';

// ── Rules ──────────────────────────────────────────────────────────────────

export interface PayrollRule {
  id: number;
  ruleType: string;
  ruleSubtype?: string | null;
  country: string;
  stateCode?: string | null;
  organizationId?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  definition: Record<string, unknown>;
  status: string;
  version: number;
  notificationNumber?: string | null;
  approvedAt?: string | null;
}

export const listPayrollRules = (params?: Record<string, string | number | undefined>) =>
  api.get<PayrollRule[]>('/api/payroll/rules', { params }).then(r => r.data);

export const createPayrollRule = (data: Partial<PayrollRule>) =>
  api.post<PayrollRule>('/api/payroll/rules', data).then(r => r.data);

export const publishPayrollRule = (id: number) =>
  api.post<PayrollRule>(`/api/payroll/rules/${id}/publish`).then(r => r.data);

export const getRuleTrace = (params: Record<string, string | number>) =>
  api.get<{ chosen: Record<string, unknown> | null; trace: Array<Record<string, unknown>> }>(
    '/api/payroll/rules/trace', { params }).then(r => r.data);

export const simulateRule = (data: Record<string, unknown>) =>
  api.post<Record<string, unknown>>('/api/payroll/rules/simulate', data).then(r => r.data);

// ── Government notifications ───────────────────────────────────────────────

export const listNotifications = (params?: { status?: string }) =>
  api.get<Array<Record<string, unknown>>>('/api/payroll/notifications', { params }).then(r => r.data);

export const createNotification = (data: Record<string, unknown>) =>
  api.post<Record<string, unknown>>('/api/payroll/notifications', data).then(r => r.data);

// ── Arrears / retro adjustments ────────────────────────────────────────────

export const simulateRetro = (data: Record<string, unknown>) =>
  api.post<Record<string, unknown>>('/api/payroll/arrears/simulate', data).then(r => r.data);

export const createArrears = (data: Record<string, unknown>) =>
  api.post<Record<string, unknown>>('/api/payroll/arrears', data).then(r => r.data);

export const listArrears = (params?: { status?: string; source?: string }) =>
  api.get<Array<Record<string, unknown>>>('/api/payroll/arrears', { params }).then(r => r.data);

export const applyArrears = (id: number, month: number, year: number) =>
  api.post<Record<string, unknown>>(`/api/payroll/arrears/${id}/apply`, { month, year }).then(r => r.data);

// ── Payments ───────────────────────────────────────────────────────────────

export const createPaymentBatch = (data: { month: number; year: number; company_id?: number }) =>
  api.post<Record<string, unknown>>('/api/payroll/payments/batches', data).then(r => r.data);

export const listPaymentBatches = () =>
  api.get<Array<Record<string, unknown>>>('/api/payroll/payments/batches').then(r => r.data);

export const downloadBatchFile = (id: number) =>
  api.get(`/api/payroll/payments/batches/${id}/file`, { responseType: 'blob' }).then(r => r.data);

// ── Filings (government returns) ───────────────────────────────────────────

export const listReports = () =>
  api.get<Array<{ code: string; name: string; authority?: string; periodType: string }>>(
    '/api/payroll/reports').then(r => r.data);

export const downloadFiling = (code: string, month: number, year: number, establishmentCode = '') =>
  api.get(`/api/payroll/reports/${code}/file`, {
    params: { month, year, establishmentCode }, responseType: 'blob',
  }).then(r => r.data);

// ── Lifecycle & approvals ──────────────────────────────────────────────────

export const changePayrollStatus = (payrollId: number, status: string, reason?: string) =>
  api.post<Record<string, unknown>>(`/api/payroll/${payrollId}/status`, { status, reason }).then(r => r.data);

export const listApprovals = (payrollId: number) =>
  api.get<Array<Record<string, unknown>>>(`/api/payroll/${payrollId}/approvals`).then(r => r.data);

export const decideApproval = (approvalId: number, decision: 'approved' | 'rejected', comment?: string) =>
  api.post<Record<string, unknown>>(`/api/payroll/approvals/${approvalId}/decide`, { decision, comment }).then(r => r.data);

// ── Explainability ("why was this amount calculated?") ─────────────────────

export interface ExplainLine {
  componentCode: string;
  label: string;
  amount: number;
  side: string;
  source: string;
  ruleId?: number | null;
  ruleVersion?: number | null;
  ruleType?: string | null;
  formula?: string | null;
  inputs: Record<string, unknown>;
  wageBasis?: string | null;
  effectiveDate?: string | null;
}

export interface ExplainPayload {
  payrollId: number;
  employeeId: number;
  period: { month: number; year: number };
  context: Record<string, number | null>;
  lines: ExplainLine[];
  rulesUsed: Array<Record<string, unknown>>;
}

export const getPayrollExplain = (payrollId: number) =>
  api.get<ExplainPayload>(`/api/payroll/${payrollId}/explain`).then(r => r.data);

// ── What-if simulator ──────────────────────────────────────────────────────

export const simulateWhatIf = (data: {
  employee_id: number; month: number; year: number; changes: Record<string, unknown>;
}) => api.post<Record<string, unknown>>('/api/payroll/simulate', data).then(r => r.data);
