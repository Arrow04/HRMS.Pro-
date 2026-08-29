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

export const getPayrollPolicies = () =>
  api.get<PayrollPolicy[]>('/payroll-config/policies').then(r => r.data);

export const createPayrollPolicy = (data: PayrollPolicy) =>
  api.post<PayrollPolicy>('/payroll-config/policies', data).then(r => r.data);

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

export const getPayrollComponents = (policyId?: number) => {
  const params: Record<string, unknown> = {};
  if (policyId) params.policy_id = policyId;
  return api.get<PayrollComponent[]>('/payroll-config/components', { params }).then(r => r.data);
};

export const createPayrollComponent = (data: PayrollComponent) =>
  api.post<PayrollComponent>('/payroll-config/components', data).then(r => r.data);

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

export const getStatutorySettings = () =>
  api.get<StatutorySetting>('/payroll-config/statutory-settings').then(r => r.data);

export const upsertStatutorySettings = (data: StatutorySetting) =>
  api.put<StatutorySetting>('/payroll-config/statutory-settings', data).then(r => r.data);

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

export const getTaxRegimes = () =>
  api.get<TaxRegime[]>('/payroll-config/tax-regimes').then(r => r.data);

export const createTaxRegime = (data: TaxRegime) =>
  api.post<TaxRegime>('/payroll-config/tax-regimes', data).then(r => r.data);

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
  working_days_per_week?: number;
  working_days?: string;
  half_day_as_full_paid?: boolean;
  paid_leave_as_present?: boolean;
  holiday_as_present?: boolean;
  overtime_threshold_hours?: number;
  overtime_rate?: number;
  late_mark_threshold_minutes?: number;
  half_day_threshold_hours?: number;
}

export const getAttendancePolicies = () =>
  api.get<AttendancePolicy[]>('/payroll-config/attendance-policies').then(r => r.data);

export const createAttendancePolicy = (data: AttendancePolicy) =>
  api.post<AttendancePolicy>('/payroll-config/attendance-policies', data).then(r => r.data);

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
