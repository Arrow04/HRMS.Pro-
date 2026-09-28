import api from './api';

// ── Company-wise Payroll Templates ──

export interface PayrollTemplatePolicy {
  name?: string;
  pro_ration_method?: string;
  rounding_method?: string;
  decimal_places?: number;
  round_net_salary?: boolean;
  include_gratuity?: boolean;
  gratuity_rate?: number;
  default_currency?: string;
  allow_negative_net?: boolean;
}

export interface PayrollTemplateComponent {
  name: string;
  display_name?: string;
  component_type: string;
  calculation_type: string;
  calculation_base?: string;
  calculation_value: number;
  formula?: string | null;
  max_cap?: number | null;
  min_cap?: number | null;
  is_statutory?: boolean;
  is_taxable?: boolean;
  is_tax_exempt?: boolean;
  tax_exempt_limit?: number | null;
  apply_pro_ration?: boolean;
  is_active?: boolean;
  priority?: number;
  tax_category?: string;
  taxability?: string | null;
  pf_applicable?: boolean | null;
  esi_applicable?: boolean | null;
  pt_applicable?: boolean | null;
  lwf_applicable?: boolean | null;
  gratuity_applicable?: boolean | null;
  bonus_applicable?: boolean | null;
  nps_applicable?: boolean | null;
  tiered_config?: { from: number; to?: number | null; rate: number }[] | null;
  shift_differential_config?: Record<string, number> | null;
  input_variables?: string[] | null;
  depends_on?: (string | number)[] | null;
}

export interface TaxSlabInput {
  from_amount: number;
  to_amount?: number | null;
  rate: number;
  sort_order?: number;
}

export interface PayrollTemplateTaxRegime {
  name?: string;
  regime_type?: string;
  is_active?: boolean;
  is_default?: boolean;
  financial_year?: string;
  standard_deduction?: number;
  rebate_threshold?: number;
  rebate_amount?: number;
  cess_rate?: number;
  surcharge_config?: unknown[];
  slabs?: TaxSlabInput[];
  // Exemption caps (old regime) & HRA exemption rules
  section_80c_cap?: number;
  section_80d_cap?: number;
  section_80d_senior_cap?: number;
  section_80ccd_1b_cap?: number;
  section_24_home_loan_cap?: number;
  section_80c_old_cap?: number;
  hra_metro_pct?: number;
  hra_non_metro_pct?: number;
  hra_rent_threshold_pct?: number;
  basic_pct_of_gross?: number;
}

export interface PayrollTemplateAttendance {
  name?: string;
  working_days_per_week?: number;
  working_days?: string;
  half_day_as_full_paid?: boolean;
  paid_leave_as_present?: boolean;
  holiday_as_present?: boolean;
  overtime_threshold_hours?: number;
  overtime_rate?: number;
  late_to_absent_count?: number;
  early_to_absent_count?: number;
  missing_checkout_rule?: string;
  late_mark_threshold_minutes?: number;
  half_day_threshold_hours?: number;
}

export interface PayrollTemplateStatutory {
  pf_applicable?: boolean | null;
  pf_employee_rate?: number;
  pf_employer_rate?: number;
  pf_wage_ceiling?: number;
  pf_max_monthly?: number;
  pf_min_basic_for_exclusion?: number;
  pf_edli_rate?: number;
  pf_edli_max_monthly?: number;
  pf_admin_rate?: number;
  pf_admin_min_monthly?: number;
  eps_wage_ceiling?: number;
  eps_employer_rate?: number;
  esi_applicable?: boolean | null;
  esi_employee_rate?: number;
  esi_employer_rate?: number;
  esi_gross_ceiling?: number;
  esi_disabled_ceiling?: number;
  pt_applicable?: boolean | null;
  pt_monthly_amount?: number;
  pt_min_gross?: number;
  lwf_applicable?: boolean | null;
  lwf_employee_rate?: number;
  lwf_employer_rate?: number;
  gratuity_applicable?: boolean | null;
  gratuity_rate?: number;
  gratuity_eligible_years?: number;
  gratuity_days_per_year?: number;
  gratuity_tax_exempt_ceiling?: number;
  bonus_applicable?: boolean | null;
  bonus_min_rate?: number;
  bonus_max_rate?: number;
  bonus_eligible_ceiling?: number;
  bonus_wage_ceiling?: number;
  nps_employee_rate?: number;
  nps_employer_rate?: number;
}

export interface PayrollTemplate {
  id: number;
  name: string;
  description?: string | null;
  company_id: number | null;
  company_name?: string | null;
  country: string;
  registered_state: string;
  status: string;
  payroll_policy_id?: number | null;
  attendance_policy_id?: number | null;
  tax_regime_id?: number | null;
  leave_template_id?: number | null;
  pay_cycle?: string;
  pay_day?: number | null;
  auto_payslip?: boolean;
  email_payslip?: boolean;
  policy_name?: string | null;
  attendance_name?: string | null;
  leave_template_name?: string | null;
  tax_regime_name?: string | null;
  component_count?: number;
  employee_count?: number;
  effective_from?: string;
  created_at?: string;
  updated_at?: string;
  payroll_policy?: PayrollTemplatePolicy | null;
  attendance_policy?: PayrollTemplateAttendance | null;
  tax_regime?: PayrollTemplateTaxRegime | null;
  components?: PayrollTemplateComponent[];
  statutory?: PayrollTemplateStatutory;
}

export interface PayrollTemplatePayload {
  name: string;
  description?: string;
  companyId: number | null;
  country?: string;
  registeredState?: string;
  status?: string;
  payrollPolicy?: PayrollTemplatePolicy;
  components?: PayrollTemplateComponent[];
  statutory?: PayrollTemplateStatutory;
  taxRegime?: PayrollTemplateTaxRegime;
  attendancePolicy?: PayrollTemplateAttendance;
  attendancePolicyId?: number | null;
  leaveTemplateId?: number | null;
  payCycle?: string;
  payDay?: number | null;
  autoPayslip?: boolean;
  emailPayslip?: boolean;
  effectiveFrom?: string;
}

export const getPayrollTemplates = (companyId?: number) =>
  api.get<PayrollTemplate[]>('/payroll-templates', { params: companyId ? { companyId } : {} }).then(r => r.data);

export const getPayrollTemplate = (id: number) =>
  api.get<PayrollTemplate>(`/payroll-templates/${id}`).then(r => r.data);

export const createPayrollTemplate = (payload: PayrollTemplatePayload) =>
  api.post<{ message: string; template: PayrollTemplate }>('/payroll-templates', payload).then(r => r.data);

export const updatePayrollTemplate = (id: number, payload: PayrollTemplatePayload) =>
  api.put<{ message: string; template: PayrollTemplate }>(`/payroll-templates/${id}`, payload).then(r => r.data);

export const deletePayrollTemplate = (id: number) =>
  api.delete(`/payroll-templates/${id}`).then(r => r.data);

export const resetTemplateStatutory = (id: number) =>
  api.post<{ message: string; template: PayrollTemplate }>(`/payroll-templates/${id}/reset-statutory`).then(r => r.data);

export const snapshotFromOrg = () =>
  api.post<{ message: string; template: PayrollTemplate }>('/payroll-templates/from-org').then(r => r.data);
