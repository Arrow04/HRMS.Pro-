import type { AuditLog } from '../types';
import api from './api';

// General Settings
export interface GeneralSettings {
  orgName: string;
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  currency: string;
  country: string;
  financialYear: string;
  geoFence: boolean;
  selfService: boolean;
  docUploads: boolean;
  multiCompany: boolean;
  autoEmails: boolean;
}

// Company Settings
export interface CompanySettings {
  name: string;
  legalName: string;
  industry: string;
  size: string;
  website: string;
  taxNumber: string;
}

// Attendance Settings
export interface AttendanceSettings {
  workStart: string;
  workEnd: string;
  gracePeriod: string;
  halfDayCutoff: string;
  geoRadius: string;
  manualOverride: boolean;
  weekendTracking: boolean;
  workingDays: string;
  workDays?: number[];
}

// Leave Policy
export interface LeavePolicy {
  casual: string;
  sick: string;
  earned: string;
  maternity: string;
  carryForward: boolean;
  encashment: boolean;
}

// Payroll Settings
export interface PayrollSettings {
  cycle: string;
  payDay: string;
  pfPercent: string;
  esiPercent: string;
  autoPayslip: boolean;
  emailPayslip: boolean;
}

// Performance Settings
export interface PerformanceSettings {
  reviewCycle: string;
  ratingScale: string;
  peerFeedback: boolean;
  selfAppraisal: boolean;
}

export interface NotificationEntry {
  event: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationEntry[] = [
  { event: 'Leave request submitted', inApp: true, email: true, sms: false },
  { event: 'Leave approved/rejected', inApp: true, email: true, sms: true },
  { event: 'Payroll processed', inApp: true, email: true, sms: false },
  { event: 'New employee onboarded', inApp: true, email: false, sms: false },
  { event: 'Geo-fence violation', inApp: true, email: true, sms: true },
  { event: 'Document expiry reminder', inApp: true, email: true, sms: false },
];

export const normalizeNotificationSettings = (data: unknown): NotificationEntry[] => {
  if (Array.isArray(data) && data.every((row) => row && typeof row === 'object' && 'event' in row)) {
    return data as NotificationEntry[];
  }
  return DEFAULT_NOTIFICATION_SETTINGS;
};

// Security Settings
export interface SecuritySettings {
  deviceLock: boolean;
  twoFactor: boolean;
  sessionTimeout: boolean;
  ipAllowlist: boolean;
  allowedIPs: string;
}

// Integration Settings
export interface IntegrationSettings {
  slack: boolean;
  google: boolean;
  payrollExport: boolean;
  biometric: boolean;
}

// API Functions

export const fetchGeneralSettings = async (): Promise<GeneralSettings> => {
  const response = await api.get<Partial<GeneralSettings> & { companyName?: string }>('/settings/general');
  const data = response.data;
  return {
    orgName: data.orgName || data.companyName || 'My Organisation',
    language: data.language || 'en',
    timezone: data.timezone || 'Asia/Kolkata',
    dateFormat: data.dateFormat || 'DD/MM/YYYY',
    timeFormat: data.timeFormat || 'HH:mm',
    currency: data.currency || 'INR',
    country: data.country || 'India',
    financialYear: data.financialYear || 'April',
    geoFence: data.geoFence ?? true,
    selfService: data.selfService ?? true,
    docUploads: data.docUploads ?? true,
    multiCompany: data.multiCompany ?? false,
    autoEmails: data.autoEmails ?? false,
  };
};

export const saveGeneralSettings = async (settings: GeneralSettings): Promise<void> => {
  const { orgName, ...rest } = settings;
  await api.put('/settings/general', { ...rest, companyName: orgName });
};

export const fetchCompanySettings = async (): Promise<CompanySettings> => {
  const response = await api.get<CompanySettings>('/settings/company');
  return response.data;
};

export const saveCompanySettings = async (settings: CompanySettings): Promise<void> => {
  await api.put('/settings/company', settings);
};

export const fetchAttendanceSettings = async (): Promise<AttendanceSettings> => {
  const response = await api.get<AttendanceSettings>('/settings/attendance');
  return response.data;
};

export const saveAttendanceSettings = async (settings: AttendanceSettings): Promise<void> => {
  await api.put('/settings/attendance', settings);
};

export const fetchLeavePolicy = async (): Promise<LeavePolicy> => {
  const response = await api.get<LeavePolicy>('/settings/leave-policy');
  return response.data;
};

export const saveLeavePolicy = async (policy: LeavePolicy): Promise<void> => {
  await api.put('/settings/leave-policy', policy);
};

export const fetchPayrollSettings = async (): Promise<PayrollSettings> => {
  const response = await api.get<PayrollSettings>('/settings/payroll');
  return response.data;
};

export const savePayrollSettings = async (settings: PayrollSettings): Promise<void> => {
  await api.put('/settings/payroll', settings);
};

export const fetchPerformanceSettings = async (): Promise<PerformanceSettings> => {
  const response = await api.get<PerformanceSettings>('/settings/performance');
  return response.data;
};

export const savePerformanceSettings = async (settings: PerformanceSettings): Promise<void> => {
  await api.put('/settings/performance', settings);
};

export const fetchNotifications = async (): Promise<NotificationEntry[]> => {
  const response = await api.get<NotificationEntry[]>('/settings/notifications');
  return normalizeNotificationSettings(response.data);
};

export const saveNotifications = async (notifications: NotificationEntry[]): Promise<void> => {
  await api.put('/settings/notifications', { notifications });
};

export const fetchSecuritySettings = async (): Promise<SecuritySettings> => {
  const response = await api.get<SecuritySettings>('/settings/security');
  return response.data;
};

export const saveSecuritySettings = async (settings: SecuritySettings): Promise<void> => {
  await api.put('/settings/security', settings);
};

export const fetchIntegrations = async (): Promise<IntegrationSettings> => {
  const response = await api.get<IntegrationSettings>('/settings/integrations');
  return response.data;
};

export const saveIntegrations = async (settings: IntegrationSettings): Promise<void> => {
  await api.put('/settings/integrations', settings);
};

export const fetchAuditLog = async (): Promise<AuditLog[]> => {
  const response = await api.get<AuditLog[]>('/settings/audit-log');
  return response.data;
};

export const downloadAuditLog = async (): Promise<void> => {
  const response = await api.get('/settings/audit-log/download', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'audit_log.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};