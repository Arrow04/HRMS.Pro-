import api from './api';

// ── Payroll Policies ──

export interface PayrollPolicy {
  id?: number;
  name: string;
  pro_ration_method?: string;
  rounding_method?: string;
  decimal_places?: number;
  round_net_salary?: boolean;
  include_gratuity?: boolean;
  gratuity_rate?: number;
  default_currency?: string;
  allow_negative_net?: boolean;
  status?: string;
}

export const getPayrollPolicies = (companyId?: number) =>
  api.get<PayrollPolicy[]>('/payroll-config/policies', { params: companyId ? { companyId } : {} }).then(r => r.data);

export const createPayrollPolicy = (data: PayrollPolicy, companyId?: number) =>
  api.post<PayrollPolicy>('/payroll-config/policies', data, { params: companyId ? { companyId } : {} }).then(r => r.data);

export const updatePayrollPolicy = (id: number, data: PayrollPolicy) =>
  api.put<PayrollPolicy>(`/payroll-config/policies/${id}`, data).then(r => r.data);

export const deletePayrollPolicy = (id: number) =>
  api.delete(`/payroll-config/policies/${id}`).then(r => r.data);

// ── Payroll Components ──

export interface PayrollComponent {
  id?: number;
  name: string;
  display_name?: string;
  component_type: 'earning' | 'deduction' | 'employer_contribution';
  calculation_type: 'percentage' | 'fixed' | 'formula';
  calculation_base?: string;
  calculation_value?: number;
  formula?: string;
  max_cap?: number;
  min_cap?: number;
  is_statutory?: boolean;
  is_taxable?: boolean;
  is_tax_exempt?: boolean;
  apply_pro_ration?: boolean;
  is_active?: boolean;
  priority?: number;
  payroll_policy_id?: number;
}

export const getPayrollComponents = (policyId?: number, companyId?: number) => {
  const params: Record<string, unknown> = {};
  if (policyId) params.policy_id = policyId;
  if (companyId) params.companyId = companyId;
  return api.get<PayrollComponent[]>('/payroll-config/components', { params }).then(r => r.data);
};

export const createPayrollComponent = (data: PayrollComponent, companyId?: number) =>
  api.post<PayrollComponent>('/payroll-config/components', data, { params: companyId ? { companyId } : {} }).then(r => r.data);

export const updatePayrollComponent = (id: number, data: PayrollComponent) =>
  api.put<PayrollComponent>(`/payroll-config/components/${id}`, data).then(r => r.data);

export const deletePayrollComponent = (id: number) =>
  api.delete(`/payroll-config/components/${id}`).then(r => r.data);

// ── Statutory Settings ──

export interface StatutorySetting {
  pf_applicable?: boolean;
  pf_employee_rate?: number;
  pf_employer_rate?: number;
  pf_max_monthly?: number;
  pf_min_basic_for_exclusion?: number;
  esi_applicable?: boolean;
  esi_employee_rate?: number;
  esi_employer_rate?: number;
  esi_gross_ceiling?: number;
  pt_applicable?: boolean;
  pt_monthly_amount?: number;
  pt_min_gross?: number;
  lwf_applicable?: boolean;
  lwf_employee_rate?: number;
  lwf_employer_rate?: number;
  gratuity_applicable?: boolean;
  gratuity_rate?: number;
}

export const getStatutorySettings = (companyId?: number) =>
  api.get<StatutorySetting>('/payroll-config/statutory-settings', { params: companyId ? { companyId } : {} }).then(r => r.data);

export const upsertStatutorySettings = (data: StatutorySetting, companyId?: number) =>
  api.put<StatutorySetting>('/payroll-config/statutory-settings', data, { params: companyId ? { companyId } : {} }).then(r => r.data);

export interface StatutoryPreset {
  code: string;
  label: string;
  pf_applicable?: boolean;
  esi_applicable?: boolean;
}

export const getStatutoryPresets = () =>
  api.get<{ presets: StatutoryPreset[] }>('/payroll-config/statutory-settings/presets').then(r => r.data.presets);

export const applyStatutoryPreset = (country: string, scope?: { companyId?: number; branchId?: number }) =>
  api.post('/payroll-config/statutory-settings/apply-country', { country, ...scope }).then(r => r.data);

// ── Tax Regimes ──

export interface TaxSlab {
  id?: number;
  from_amount: number;
  to_amount?: number;
  rate: number;
  sort_order?: number;
}

export interface TaxRegime {
  id?: number;
  name: string;
  regime_type: 'new' | 'old' | 'custom';
  financial_year?: string;
  standard_deduction?: number;
  rebate_threshold?: number;
  rebate_amount?: number;
  cess_rate?: number;
  surcharge_config?: Record<string, unknown>;
  is_default?: boolean;
  slabs?: TaxSlab[];
}

export const getTaxRegimes = (companyId?: number) =>
  api.get<TaxRegime[]>('/payroll-config/tax-regimes', { params: companyId ? { companyId } : {} }).then(r => r.data);

export const createTaxRegime = (data: TaxRegime, companyId?: number) =>
  api.post<TaxRegime>('/payroll-config/tax-regimes', data, { params: companyId ? { companyId } : {} }).then(r => r.data);

export const updateTaxRegime = (id: number, data: TaxRegime) =>
  api.put<TaxRegime>(`/payroll-config/tax-regimes/${id}`, data).then(r => r.data);

export const deleteTaxRegime = (id: number) =>
  api.delete(`/payroll-config/tax-regimes/${id}`).then(r => r.data);

// ── Tax Slabs ──

export const getTaxSlabs = (regimeId: number) =>
  api.get<TaxSlab[]>(`/payroll-config/tax-regimes/${regimeId}/slabs`).then(r => r.data);

export const addTaxSlab = (regimeId: number, data: TaxSlab) =>
  api.post<TaxSlab>(`/payroll-config/tax-regimes/${regimeId}/slabs`, data).then(r => r.data);

export const deleteTaxSlab = (id: number) =>
  api.delete(`/payroll-config/tax-slabs/${id}`).then(r => r.data);

// ── Attendance Policies ──

export interface AttendancePolicy {
  id?: number;
  name: string;
  company_id?: number | null;
  description?: string;
  status?: string;
  effective_from?: string;
  working_days_per_week?: number;
  working_days?: string;
  half_day_as_full_paid?: boolean;
  paid_leave_as_present?: boolean;
  holiday_as_present?: boolean;
  overtime_threshold_hours?: number;
  overtime_rate?: number;
  overtime_tiers?: { from_hours: number; to_hours: number | null; rate: number }[] | null;
  shift_differential_rates?: Record<string, number> | null;
  late_mark_threshold_minutes?: number;
  half_day_threshold_hours?: number;
  wfh_allowed?: boolean;
  geofence_enabled?: boolean;
  geofence_radius?: number;
  shift_id?: number | null;
  late_to_absent_count?: number | null;
  early_to_absent_count?: number | null;
  missing_checkout_rule?: string;
  check_in_time?: string;
  check_out_time?: string;
  break_hours?: number;
  comp_off_enabled?: boolean;
  max_comp_off_balance?: number;
  max_overtime_hours_per_month?: number | null;
  selfie_checkin_enabled?: boolean;
  ip_restriction_enabled?: boolean;
  allowed_ip_ranges?: string[] | null;
  wifi_checkin_enabled?: boolean;
  allowed_ssids?: string[] | null;
  auto_approve_if_no_mark?: boolean;
  min_hours_for_full_day?: number;
  shift_based_payroll?: boolean;
}

export const getAttendancePolicies = (companyId?: number) =>
  api.get<AttendancePolicy[]>('/payroll-config/attendance-policies', { params: companyId ? { companyId } : {} }).then(r => r.data);

export const createAttendancePolicy = (data: AttendancePolicy, companyId?: number) =>
  api.post<AttendancePolicy>('/payroll-config/attendance-policies', data, { params: companyId ? { companyId } : {} }).then(r => r.data);

export const updateAttendancePolicy = (id: number, data: AttendancePolicy) =>
  api.put<AttendancePolicy>(`/payroll-config/attendance-policies/${id}`, data).then(r => r.data);

export const deleteAttendancePolicy = (id: number) =>
  api.delete(`/payroll-config/attendance-policies/${id}`).then(r => r.data);

// ── Industry Templates ──

export interface IndustryTemplate {
  code: string;
  name: string;
  description: string;
  recommended_for: string[] | string;
  typical_headcount_range?: string;
  headcount_range?: string;
}

export const getIndustries = () =>
  api.get<IndustryTemplate[]>('/payroll-config/industries').then(r => r.data);

export const applyIndustryTemplate = (code: string) =>
  api.post(`/payroll-config/industries/${code}/apply`).then(r => r.data);

export const reapplyIndustryTemplate = (code: string) =>
  api.post(`/payroll-config/industries/${code}/reapply`).then(r => r.data);

// ── State Compliance ──

export interface StateInfo {
  code: string;
  state_name: string;
  has_pt: boolean;
  has_lwf: boolean;
}

export const getComplianceStates = () =>
  api.get<StateInfo[]>('/payroll-config/compliance/states').then(r => r.data);

export const getStatePT = (stateCode: string) =>
  api.get(`/payroll-config/compliance/${stateCode}/pt`).then(r => r.data);

export const getStateLWF = (stateCode: string) =>
  api.get(`/payroll-config/compliance/${stateCode}/lwf`).then(r => r.data);

export const calculatePT = (grossSalary: number, stateCode: string) =>
  api.post('/payroll-config/compliance/calculate-pt', { gross_salary: grossSalary, state_code: stateCode }).then(r => r.data);

export const calculateLWF = (grossSalary: number, stateCode: string) =>
  api.post('/payroll-config/compliance/calculate-lwf', { gross_salary: grossSalary, state_code: stateCode }).then(r => r.data);

export const setOrgState = (state: string) =>
  api.put('/payroll-config/compliance/org-state', { state }).then(r => r.data);

// ── Leave Templates ──

export interface LeaveTemplate {
  id?: number;
  name: string;
  description?: string;
  company_id?: number | null;
  status?: string;
  body?: Record<string, any>;
  effective_from?: string;
  accrual_method?: string;
  accrual_day?: number;
  probation_accrual_rate?: number;
  max_balance_cap?: number | null;
  lapse_unused?: boolean;
  carry_forward_enabled?: boolean;
  carry_forward_max_days?: number | null;
  carry_forward_expiry?: string;
  carry_forward_use_it_or_lose_it?: boolean;
  encashment_enabled?: boolean;
  encashment_min_balance?: number | null;
  encashment_rate?: number | null;
  encashment_taxable?: boolean;
  holiday_optional_limit?: number | null;
  holiday_auto_apply_national?: boolean;
  enable_half_day?: boolean;
  min_leave_for_half_day?: number | null;
  advance_notice_days?: number | null;
  max_consecutive_days?: number | null;
}

const LEAVE_BASE = '/leave-templates';

export const getLeaveTemplates = (companyId?: number) =>
  api.get<LeaveTemplate[]>(LEAVE_BASE, { params: companyId ? { companyId } : {} }).then(r => r.data);

export const createLeaveTemplate = (data: LeaveTemplate, companyId?: number) =>
  api.post<LeaveTemplate>(LEAVE_BASE, data, { params: companyId ? { companyId } : {} }).then(r => r.data);

export const updateLeaveTemplate = (id: number, data: LeaveTemplate) =>
  api.put<LeaveTemplate>(`${LEAVE_BASE}/${id}`, data).then(r => r.data);

export const deleteLeaveTemplate = (id: number) =>
  api.delete(`${LEAVE_BASE}/${id}`).then(r => r.data);
