import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Loader2, X, Building2, SlidersHorizontal,
  ShieldCheck, Landmark, Clock, MapPin, CheckCircle2, ChevronDown, ChevronUp,
  FileText, Save, CalendarDays, TrendingUp, MinusCircle, Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import api from '../services/api';
import { getCurrencySymbol, getAppCurrency } from '../services/currencyService';
import * as ptApi from '../services/payrollTemplateApi';
import { getStatePT, getStateLWF } from '../services/payrollConfigApi';
import type {
  PayrollTemplate, PayrollTemplateComponent, PayrollTemplatePayload,
  PayrollTemplateStatutory, PayrollTemplateTaxRegime, TaxSlabInput,
} from '../services/payrollTemplateApi';

interface ApiErrorLike { response?: { data?: { detail?: string } } }
function errMsg(err: unknown, fallback: string) {
  return (err as ApiErrorLike | null)?.response?.data?.detail || fallback;
}

const STATES = [
  'andhra_pradesh', 'arunachal_pradesh', 'assam', 'bihar', 'chhattisgarh', 'delhi',
  'goa', 'gujarat', 'haryana', 'himachal_pradesh', 'jammu_and_kashmir', 'jharkhand',
  'karnataka', 'kerala', 'ladakh', 'madhya_pradesh', 'maharashtra', 'manipur',
  'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim',
  'tamil_nadu', 'telangana', 'tripura', 'uttar_pradesh', 'uttarakhand', 'west_bengal',
  'chandigarh', 'puducherry', 'other',
];

const PAY_CYCLES = ['daily', 'weekly', 'monthly', 'yearly'];

// Form 16 (Part B) heads — where each component sits in the salary computation.
const TAX_CATEGORIES: Record<string, { value: string; label: string; help: string }[]> = {
  earning: [
    { value: 'salary_17_1', label: 'Salary u/s 17(1)', help: 'Basic, DA, Special Allowance, Overtime, Bonus — taxed as salary.' },
    { value: 'exempt_10', label: 'Exempt allowance u/s 10', help: 'HRA u/s 10(13A), LTA u/s 10(5), Children Education/Hostel, Uniform, Transport — exempt to the extent of actuals.' },
    { value: 'perquisite_17_2', label: 'Perquisite u/s 17(2)', help: 'Non-cash or subsidized benefits (company car, accommodation, gym, ESOPs) at taxable value.' },
    { value: 'profit_17_3', label: 'Profit in lieu u/s 17(3)', help: 'Severance pay, termination compensation, or payments before joining / after resignation.' },
  ],
  deduction: [
    { value: 'exempt_10', label: 'Exempt allowance u/s 10', help: 'HRA u/s 10(13A), LTA u/s 10(5), etc. — excluded from gross before tax.' },
    { value: 'chapter_vi_a', label: 'Chapter VI-A u/s 80', help: 'EPF, ELSS, insurance u/s 80C, health u/s 80D, NPS u/s 80CCD(1) — subtracted from adjusted income.' },
    { value: 'professional_tax_16', label: 'Professional Tax u/s 16(iii)', help: 'State-level tax withheld from salary (up to ₹2,500/year).' },
    { value: 'post_tax_statutory', label: 'Post-tax statutory (ESIC)', help: 'ESIC employee contribution 0.75% of gross (while under the ceiling) - deducted from net pay. Note: employee EPF is deductible u/s 80C (Chapter VI-A), not post-tax.' },
    { value: 'post_tax_other', label: 'Other post-tax deduction', help: 'LOP, notice recovery, loan/advance recovery, asset damage, insurance premium, canteen/transport — deducted from net pay.' },
    { value: 'tds_192', label: 'TDS u/s 192', help: 'Income tax withheld on salary under section 192.' },
  ],
  employer_contribution: [
    { value: 'employer_epf', label: 'EPF u/s 80CCD(2)', help: 'Employer 12% of basic — 3.67% EPF + 8.33% EPS. Deductible in both regimes.' },
    { value: 'employer_esic', label: 'ESIC (employer)', help: 'Employer ESIC 3.25% of gross salary, if eligible.' },
    { value: 'employer_gratuity', label: 'Gratuity', help: 'Employer deposit into gratuity fund (4.81% of basic).' },
    { value: 'employer_nps', label: 'NPS corporate', help: 'Employer NPS contribution u/s 80CCD(2) — up to 10% of basic.' },
    { value: 'employer_gmc', label: 'Group Medical / GPA', help: 'Employer-paid group medical cover (GMC) or personal accident (GPA) premium per employee.' },
  ],
};

function defaultTaxCategory(type: string): string {
  if (type === 'earning') return 'salary_17_1';
  if (type === 'deduction') return 'post_tax_statutory';
  return 'employer_epf';
}

// ── Defaults ──

function defaultPolicy() {
  return {
    name: '', pro_ration_method: 'paid_days', rounding_method: 'nearest',
    decimal_places: 2, round_net_salary: true, include_gratuity: false,
    gratuity_rate: null, default_currency: '', allow_negative_net: false,
    daily_rate_divisor: 30, monthly_divisor_for_weekly: 4.33,
  };
}

function defaultComponents(): PayrollTemplateComponent[] {
  const base = { max_cap: null as number | null, min_cap: null as number | null, is_tax_exempt: false, tax_exempt_limit: null as number | null };
  return [
    // -- Earnings (standard Indian salary structure) --
    { ...base, name: 'Basic', display_name: 'Basic Salary', component_type: 'earning', calculation_type: 'percentage', calculation_base: 'gross', calculation_value: null, priority: 1, is_taxable: true, apply_pro_ration: true, tax_category: 'salary_17_1' },
    { ...base, name: 'DA', display_name: 'Dearness Allowance', component_type: 'earning', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: null, priority: 2, is_taxable: true, apply_pro_ration: true, tax_category: 'salary_17_1' },
    { ...base, name: 'HRA', display_name: 'House Rent Allowance', component_type: 'earning', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: null, priority: 3, is_taxable: true, apply_pro_ration: true, tax_category: 'exempt_10' },
    { ...base, name: 'Conveyance', display_name: 'Conveyance Allowance', component_type: 'earning', calculation_type: 'fixed', calculation_value: null, priority: 4, is_taxable: true, apply_pro_ration: true, tax_category: 'exempt_10' },
    { ...base, name: 'Medical', display_name: 'Medical Allowance', component_type: 'earning', calculation_type: 'fixed', calculation_value: null, priority: 5, is_taxable: true, apply_pro_ration: true, tax_category: 'exempt_10' },
    { ...base, name: 'Education', display_name: 'Education Allowance', component_type: 'earning', calculation_type: 'fixed', calculation_value: null, priority: 6, is_taxable: true, apply_pro_ration: true, tax_category: 'exempt_10' },
    { ...base, name: 'Special Allowance', display_name: 'Special Allowance', component_type: 'earning', calculation_type: 'percentage', calculation_base: 'gross', calculation_value: null, priority: 7, is_taxable: true, apply_pro_ration: true, tax_category: 'salary_17_1' },
    { ...base, name: 'Performance Bonus', display_name: 'Performance Bonus / Incentive', component_type: 'earning', calculation_type: 'fixed', calculation_value: null, priority: 13, is_taxable: true, apply_pro_ration: false, tax_category: 'salary_17_1' },
    { ...base, name: 'Overtime', display_name: 'Overtime Pay', component_type: 'earning', calculation_type: 'formula', formula: '', calculation_value: null, priority: 14, is_taxable: true, apply_pro_ration: false, tax_category: 'salary_17_1' },
    { ...base, name: 'Arrears', display_name: 'Salary Arrears', component_type: 'earning', calculation_type: 'fixed', calculation_value: null, priority: 15, is_taxable: true, apply_pro_ration: false, tax_category: 'salary_17_1' },

    // -- Deductions (statutory) --
    { ...base, name: 'PF', display_name: 'Provident Fund (u/s 80C)', component_type: 'deduction', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: null, priority: 20, is_statutory: true, is_taxable: false, apply_pro_ration: true, tax_category: 'chapter_vi_a' },
    { ...base, name: 'Employee NPS', display_name: 'Employee NPS (u/s 80CCD(1))', component_type: 'deduction', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: null, priority: 24, is_statutory: true, is_taxable: false, apply_pro_ration: true, tax_category: 'chapter_vi_a' },
    { ...base, name: 'ESI', display_name: 'Employees State Insurance', component_type: 'deduction', calculation_type: 'percentage', calculation_base: 'gross', calculation_value: null, priority: 21, is_statutory: true, is_taxable: false, apply_pro_ration: true, tax_category: 'post_tax_statutory' },
    { ...base, name: 'Professional Tax', display_name: 'Professional Tax', component_type: 'deduction', calculation_type: 'fixed', calculation_value: null, priority: 22, is_statutory: true, is_taxable: false, apply_pro_ration: true, tax_category: 'professional_tax_16' },
    { ...base, name: 'Income Tax', display_name: 'Income Tax (TDS)', component_type: 'deduction', calculation_type: 'formula', formula: '', calculation_value: null, priority: 23, is_statutory: true, is_taxable: false, apply_pro_ration: true, tax_category: 'tds_192' },

    // -- Deductions (other) --
    { ...base, name: 'LOP', display_name: 'Loss of Pay', component_type: 'deduction', calculation_type: 'fixed', calculation_value: null, priority: 24, is_statutory: false, is_taxable: false, apply_pro_ration: false, tax_category: 'post_tax_other' },
    { ...base, name: 'Loan Recovery', display_name: 'Loan / Advance Recovery', component_type: 'deduction', calculation_type: 'fixed', calculation_value: null, priority: 25, is_statutory: false, is_taxable: false, apply_pro_ration: false, tax_category: 'post_tax_other' },
    { ...base, name: 'Other Deduction', display_name: 'Other Deduction', component_type: 'deduction', calculation_type: 'fixed', calculation_value: null, priority: 26, is_statutory: false, is_taxable: false, apply_pro_ration: false, tax_category: 'post_tax_other' },

    // -- Employer contributions --
    { ...base, name: 'Employer PF', display_name: 'Employer PF Contribution', component_type: 'employer_contribution', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: null, priority: 30, is_statutory: true, is_taxable: false, apply_pro_ration: true, tax_category: 'employer_epf' },
    { ...base, name: 'Employer ESI', display_name: 'Employer ESI Contribution', component_type: 'employer_contribution', calculation_type: 'percentage', calculation_base: 'gross', calculation_value: null, priority: 31, is_statutory: true, is_taxable: false, apply_pro_ration: true, tax_category: 'employer_esic' },
    { ...base, name: 'Employer NPS', display_name: 'Employer NPS (u/s 80CCD(2))', component_type: 'employer_contribution', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: null, priority: 32, is_statutory: false, is_taxable: false, apply_pro_ration: true, tax_category: 'employer_nps' },
    { ...base, name: 'Employer Gratuity', display_name: 'Employer Gratuity', component_type: 'employer_contribution', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: null, priority: 33, is_statutory: false, is_taxable: false, apply_pro_ration: true, tax_category: 'employer_gratuity' },
  ];
}

function defaultStatutory(): PayrollTemplateStatutory {
  return {
    pf_applicable: false, pf_employee_rate: null, pf_employer_rate: null,
    pf_wage_ceiling: null, pf_max_monthly: null, pf_min_basic_for_exclusion: null,
    pf_edli_rate: null, pf_edli_max_monthly: null,
    pf_admin_rate: null, pf_admin_min_monthly: null,
    eps_wage_ceiling: null,
    esi_applicable: false, esi_employee_rate: null, esi_employer_rate: null,
    esi_gross_ceiling: null, esi_disabled_ceiling: null,
    pt_applicable: false, pt_monthly_amount: null, pt_min_gross: null,
    lwf_applicable: false, lwf_employee_rate: null, lwf_employer_rate: null,
    gratuity_applicable: false, gratuity_rate: null,
    gratuity_eligible_years: null, gratuity_days_per_year: null, gratuity_tax_exempt_ceiling: null,
    bonus_applicable: false, bonus_min_rate: null, bonus_max_rate: null, bonus_wage_ceiling: null,
  };
}

function defaultTax(): PayrollTemplateTaxRegime {
  return {
    name: '', regime_type: 'new', is_active: true, is_default: false,
    financial_year: '',
    standard_deduction: null, rebate_threshold: null, rebate_amount: null,
    cess_rate: null, surcharge_config: [],
    slabs: [],
    section_80c_cap: null, section_80d_cap: null, section_80d_senior_cap: null,
    section_80ccd_1b_cap: null, section_24_home_loan_cap: null, section_80c_old_cap: null,
    hra_metro_pct: null, hra_non_metro_pct: null, hra_rent_threshold_pct: null,
    basic_pct_of_gross: null,
  };
}

function defaultAttendance() {
  return {
    name: 'Standard Attendance', working_days_per_week: 5, working_days: '1,2,3,4,5',
    half_day_as_full_paid: true, paid_leave_as_present: true, holiday_as_present: true,
    overtime_threshold_hours: 8, overtime_rate: 1.5, late_mark_threshold_minutes: 15,
    half_day_threshold_hours: 4,
    late_to_absent_count: null, early_to_absent_count: null, missing_checkout_rule: 'half_day',
  };
}

interface WizardState {
  name: string;
  description: string;
  companyId: number | null;
  country: string;
  registeredState: string;
  payrollPolicy: Record<string, any>;
  components: PayrollTemplateComponent[];
  statutory: PayrollTemplateStatutory;
  taxRegime: PayrollTemplateTaxRegime;
  attendancePolicy: Record<string, any>;
  attendancePolicyId: number | null;
  attendanceLinked: boolean;
  leaveTemplateId: number | null;
  payCycle: string;
  payDay: number | null;
  autoPayslip: boolean;
  emailPayslip: boolean;
  status: string;
}

function blankWizard(): WizardState {
  return {
    name: '', description: '', companyId: null, country: 'India', registeredState: '',
    payrollPolicy: defaultPolicy(), components: defaultComponents(),
    statutory: defaultStatutory(), taxRegime: defaultTax(),
    attendancePolicy: defaultAttendance(),
    attendancePolicyId: null,
    attendanceLinked: false,
    leaveTemplateId: null,
    payCycle: 'monthly', payDay: null, autoPayslip: false, emailPayslip: false,
    status: 'active',
  };
}

function fromTemplate(t: PayrollTemplate): WizardState {
  return {
    name: t.name || '',
    description: t.description || '',
    companyId: t.company_id,
    country: t.country || 'India',
    registeredState: t.registered_state || '',
    payrollPolicy: { ...defaultPolicy(), ...(t.payroll_policy || {}) },
    components: (t.components && t.components.length ? t.components : defaultComponents()).map(c => ({ ...c })),
    statutory: { ...defaultStatutory(), ...(t.statutory || {}) },
    taxRegime: {
      ...defaultTax(),
      ...(t.tax_regime || {}),
      slabs: (t.tax_regime?.slabs?.length ? t.tax_regime.slabs : defaultTax().slabs).map(s => ({ ...s })),
    },
    attendancePolicy: { ...defaultAttendance(), ...(t.attendance_policy || {}) },
    attendancePolicyId: t.attendance_policy_id ?? null,
    attendanceLinked: !!(t.attendance_policy_id ?? t.attendance_policy),
    leaveTemplateId: (t as any).leave_template_id ?? null,
    payCycle: t.pay_cycle || 'monthly',
    payDay: t.pay_day ?? null,
    autoPayslip: !!t.auto_payslip,
    emailPayslip: !!t.email_payslip,
    status: t.status || 'active',
  };
}

function toPayload(w: WizardState): PayrollTemplatePayload {
  return {
    name: w.name, description: w.description || undefined,
    companyId: w.companyId, country: w.country || 'India',
    registeredState: w.registeredState || undefined,
    payrollPolicy: w.payrollPolicy as any,
    components: w.components,
    statutory: w.statutory,
    taxRegime: w.taxRegime,
    attendancePolicy: w.attendancePolicy as any,
    attendancePolicyId: w.attendancePolicyId,
    leaveTemplateId: w.leaveTemplateId,
    payCycle: w.payCycle,
    payDay: w.payDay,
    autoPayslip: w.autoPayslip,
    emailPayslip: w.emailPayslip,
    status: w.status,
  };
}

// ── Small field components ──

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">{label}</label>
      {children}
      {help && <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]";

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputCls} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}

function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return <input type="number" step="any" className={inputCls} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)} />;
}

function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange(!checked)}
        title={help}
        className={`relative w-12 h-7 rounded-full transition-all duration-300 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#1C64F2]/40 focus-visible:ring-offset-2 cursor-pointer group ${
          checked
            ? 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-[0_2px_8px_-1px_rgba(37,99,235,0.5)]'
            : 'bg-gradient-to-r from-[#EF4444] to-[#DC2626] shadow-[0_2px_8px_-1px_rgba(220,38,38,0.5)] hover:brightness-95'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ease-out ${
            checked ? 'translate-x-5 group-active:scale-95' : 'group-active:scale-90'
          }`}
        />
      </button>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--text-secondary)] leading-tight">{label}</span>
        {help && <span className="text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</span>}
      </div>
    </div>
  );
}

function WizardSectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-[var(--background)] hover:bg-[var(--hover-bg)]">
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--primary-blue)]" />
          <span className="font-medium text-sm text-[var(--text-primary)]">{title}</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

function ComponentCard({ c, i, setComp, removeComp, onAdd, heading, rank, groupCount, onPriority }: {
  c: PayrollTemplateComponent;
  i: number;
  setComp: (i: number, patch: Partial<PayrollTemplateComponent>) => void;
  removeComp: (i: number) => void;
  onAdd: () => void;
  heading: string;
  rank: number;
  groupCount: number;
  onPriority: (p: number) => void;
}) {
  return (
    <div className="border border-[var(--border-color)] rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-color)]">
        <span className="w-6 h-6 rounded-full bg-[var(--background)] border border-[var(--border-color)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">
          {heading.split(' ')[heading.split(' ').length - 1]}
        </span>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{heading}</span>
      </div>
      {/* Row 1 — identity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
        <Field label="Name" help="Text — internal name, e.g. Basic, HRA, PF.">
          <TextInput value={c.name} onChange={v => setComp(i, { name: v })} placeholder="e.g. Basic" />
        </Field>
        <Field label="Display name" help="Text — label printed on the payslip.">
          <TextInput value={c.display_name || ''} onChange={v => setComp(i, { display_name: v })} placeholder="e.g. Basic Salary" />
        </Field>
        <Field label="Type" help="Earning = added, Deduction = subtracted, Employer contribution = cost to company.">
          <SearchableSelect value={c.component_type} onChange={v => setComp(i, { component_type: String(v) as any })} placeholder="Select Type" options={[
            { id: 'earning', name: 'Earning' },
            { id: 'deduction', name: 'Deduction' },
            { id: 'employer_contribution', name: 'Employer contribution' },
          ]} showAllOption={false} />
        </Field>
        <Field label="Calc type" help="Percentage, Fixed (flat) or Formula.">
          <SearchableSelect value={c.calculation_type} onChange={v => setComp(i, { calculation_type: String(v) as any })} placeholder="Select Calc type" options={[
            { id: 'percentage', name: 'Percentage' },
            { id: 'fixed', name: 'Fixed' },
            { id: 'formula', name: 'Formula' },
          ]} showAllOption={false} />
        </Field>
      </div>

      {/* Row 2 — calculation */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
        {c.calculation_type === 'percentage' ? (
          <Field label="Base" help="What the percentage applies to: Basic, Gross or Net.">
            <SearchableSelect value={c.calculation_base || 'basic'} onChange={v => setComp(i, { calculation_base: String(v) as any })} placeholder="Select Base" options={[
              { id: 'basic', name: 'Basic' },
              { id: 'gross', name: 'Gross' },
              { id: 'net', name: 'Net' },
            ]} showAllOption={false} />
          </Field>
        ) : c.calculation_type === 'formula' ? (
          <Field label="Formula" help="Text — use 'tax' for income-tax (TDS).">
            <TextInput value={c.formula || ''} onChange={v => setComp(i, { formula: v })} placeholder="e.g. tax" />
          </Field>
        ) : (
          <Field label="Amount" help="Number — flat amount for fixed-type components.">
            <NumInput value={c.calculation_value} onChange={v => setComp(i, { calculation_value: v })} />
          </Field>
        )}
        {c.calculation_type !== 'formula' && (
          <Field label="Value" help="Number — the % or amount.">
            <NumInput value={c.calculation_value} onChange={v => setComp(i, { calculation_value: v })} />
          </Field>
        )}
        <Field label={`Max cap (${getCurrencySymbol(getAppCurrency())})`} help="Number — upper limit of the value. Blank = no cap.">
          <NumInput value={c.max_cap ?? null} onChange={v => setComp(i, { max_cap: v })} />
        </Field>
        <Field label={`Min cap (${getCurrencySymbol(getAppCurrency())})`} help="Number — lower limit of the value. Blank = no floor.">
          <NumInput value={c.min_cap ?? null} onChange={v => setComp(i, { min_cap: v })} />
        </Field>
      </div>

      {/* Row 3 — Form 16 head, priority, exempt limit, remove */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
        <Field label="Tax head (Form 16)" help={TAX_CATEGORIES[c.component_type]?.find(o => o.value === (c.tax_category || defaultTaxCategory(c.component_type)))?.help || 'Where this component sits in Form 16 Part B.'}>
          <SearchableSelect value={c.tax_category || defaultTaxCategory(c.component_type)} onChange={v => setComp(i, { tax_category: String(v) })} placeholder="Select Tax head" options={(TAX_CATEGORIES[c.component_type] || []).map(opt => ({ id: opt.value, name: opt.label }))} showAllOption={false} />
        </Field>
        <Field label="Priority (calc order)" help="Select the calc order — lower runs first. Priorities are auto-assigned.">
          <SearchableSelect value={rank} onChange={v => onPriority(Number(v))} placeholder="Select Priority" options={Array.from({ length: Math.max(groupCount, 1) }, (_, n) => ({ id: n + 1, name: String(n + 1) }))} showAllOption={false} />
        </Field>
        {c.is_tax_exempt && (
          <Field label={`Tax exempt limit (${getCurrencySymbol(getAppCurrency())})`} help="Number — amount exempt up to this ceiling.">
            <NumInput value={c.tax_exempt_limit ?? null} onChange={v => setComp(i, { tax_exempt_limit: v })} />
          </Field>
        )}
      </div>

      {/* Row 4 — toggles */}
      <div className="flex flex-wrap gap-x-8 gap-y-3 items-start border-t border-[var(--border-color)] pt-3">
        <Toggle label="Taxable" help="On = counts towards taxable income." checked={!!c.is_taxable} onChange={v => setComp(i, { is_taxable: v })} />
        <Toggle label="Statutory" help="On = legally mandated (PF, ESI, PT, TDS)." checked={!!c.is_statutory} onChange={v => setComp(i, { is_statutory: v })} />
        <Toggle label="Pro-rate" help="On = value pro-rated for partial months." checked={!!c.apply_pro_ration} onChange={v => setComp(i, { apply_pro_ration: v })} />
        <Toggle label="Active" help="Off = kept but not used on payslips." checked={!!c.is_active} onChange={v => setComp(i, { is_active: v })} />
        <Toggle label="Tax exempt" help="On = fully excluded from taxable income." checked={!!c.is_tax_exempt} onChange={v => setComp(i, { is_tax_exempt: v })} />
      </div>

      {/* Bottom bar — add row + delete */}
      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--primary-blue)] hover:bg-blue-50 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add New Component
        </button>
        <button onClick={() => removeComp(i)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Delete This Component
        </button>
      </div>
    </div>
  );
}

function ComponentSection(props: {
  type: 'earning' | 'deduction' | 'employer_contribution';
  title: string;
  icon: LucideIcon;
  tint: string;
  desc: string;
  empty: string;
  heading: string;
  components: PayrollTemplateComponent[];
  setComp: (i: number, patch: Partial<PayrollTemplateComponent>) => void;
  removeComp: (i: number) => void;
  addComp: (type: 'earning' | 'deduction' | 'employer_contribution') => void;
  addAfter: (i: number, type: 'earning' | 'deduction' | 'employer_contribution') => void;
  setPriority: (i: number, p: number) => void;
}) {
  const { type, title, icon: Icon, tint, desc, empty, heading, components, setComp, removeComp, addComp, addAfter, setPriority } = props;
  const items = components.map((c, idx) => ({ c, idx })).filter(x => x.c.component_type === type);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)] border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${tint}`} />
          <span className="font-medium text-sm text-[var(--text-primary)]">{title}</span>
          <span className="text-xs text-[var(--text-tertiary)]">({items.length})</span>
        </div>
        <button onClick={() => addComp(type)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
          <Plus className="w-4 h-4" /> Add {heading}
        </button>
      </div>
      <p className="px-4 py-2 text-[11px] text-[var(--text-tertiary)] border-b border-[var(--border-color)] bg-white">{desc}</p>
      <div className="p-3 space-y-2 bg-white">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--text-disabled)] text-center py-6">{empty}</p>
        ) : (
          items.map(({ c, idx }, n) => (
            <ComponentCard key={idx} c={c} i={idx} setComp={setComp} removeComp={removeComp} onAdd={() => addAfter(idx, type)} heading={`${heading} ${n + 1}`} rank={n + 1} groupCount={items.length} onPriority={p => setPriority(idx, p)} />
          ))
        )}
      </div>
    </div>
  );
}

function Form16Flow({ components }: { components: PayrollTemplateComponent[] }) {
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-[var(--background)] border-b border-[var(--border-color)]">
        <Landmark className="w-4 h-4 text-amber-600" />
        <span className="font-medium text-sm text-[var(--text-primary)]">Form 16 (Part B) computation flow</span>
        <span className="text-xs text-[var(--text-tertiary)]">— how your components flow into taxable income</span>
      </div>
      <div className="p-4 space-y-2 text-xs">
        {[
          { step: '1', label: 'Gross Salary', detail: 'Salary u/s 17(1) + Perquisites u/s 17(2) + Profits in lieu u/s 17(3)', count: components.filter(c => c.component_type === 'earning').length },
          { step: '2', label: 'Exemptions u/s 10', detail: 'Exempt allowances — HRA u/s 10(13A), LTA u/s 10(5), etc.', count: components.filter(c => c.tax_category === 'exempt_10').length },
          { step: '3', label: 'Net Salary', detail: 'Gross Salary − Exemptions', count: null },
          { step: '4', label: 'Deductions u/s 16', detail: 'Standard Deduction u/s 16(ia) + Professional Tax u/s 16(iii)', count: components.filter(c => c.tax_category === 'professional_tax_16').length },
          { step: '5', label: 'Adjusted Income', detail: 'Net Salary − Deductions u/s 16 = Income under head Salaries', count: null },
          { step: '6', label: 'Chapter VI-A u/s 80', detail: '80C (EPF, ELSS, insurance), 80D, 80CCD(1) NPS — subtracted next', count: components.filter(c => c.tax_category === 'chapter_vi_a').length },
          { step: '7', label: 'Taxable Income', detail: 'Slab tax + surcharge + cess (Regime/Slabs/Surcharge tabs)', count: null },
          { step: '8', label: 'TDS & post-tax deductions', detail: 'TDS u/s 192 plus ESIC, loan/advance recovery and other post-tax items, then Net Pay', count: components.filter(c => ['post_tax_statutory', 'post_tax_other', 'tds_192'].includes(c.tax_category || '')).length },
        ].map(row => (
          <div key={row.step} className="flex items-center gap-3">
            <span className="w-5 h-5 rounded-full bg-[var(--background)] border border-[var(--border-color)] flex items-center justify-center text-[10px] font-semibold text-[var(--text-secondary)] shrink-0">{row.step}</span>
            <span className="w-44 font-medium text-[var(--text-primary)] shrink-0">{row.label}</span>
            <span className="flex-1 text-[var(--text-tertiary)]">{row.detail}</span>
            {row.count != null && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-[var(--primary-blue)] font-medium shrink-0">{row.count} component{row.count === 1 ? '' : 's'}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Leave types (paid vs unpaid) — company-scoped, shown here so attendance stays in sync with payroll ──

// ── Component ──

export default function PayrollConfiguration({ standalone = false }: { standalone?: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [companyFilter, setCompanyFilter] = useState<number | 'all'>('all');
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [wizardTab, setWizardTab] = useState('overview');

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['payroll-templates', companyFilter],
    queryFn: () => ptApi.getPayrollTemplates(companyFilter === 'all' ? undefined : Number(companyFilter)),
  });

  const saveMutation = useMutation({
    mutationFn: (w: { id: number | null; state: WizardState }) =>
      w.id ? ptApi.updatePayrollTemplate(w.id, toPayload(w.state)) : ptApi.createPayrollTemplate(toPayload(w.state)),
    onSuccess: (res) => {
      toast.success(res.message || 'Template saved');
      queryClient.invalidateQueries({ queryKey: ['payroll-templates'] });
      setWizard(null);
      setEditingId(null);
      setWizardTab('overview');
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to save template')),
  });

  const deleteMutation = useMutation({
    mutationFn: ptApi.deletePayrollTemplate,
    onSuccess: (res) => {
      toast.success(res.message || 'Template deleted');
      queryClient.invalidateQueries({ queryKey: ['payroll-templates'] });
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to delete template')),
  });

  const openCreate = () => {
    setEditingId(null);
    setWizardTab('overview');
    setWizard({ ...blankWizard(), companyId: companyFilter === 'all' ? null : companyFilter });
  };

  const openEdit = (t: PayrollTemplate) => {
    setEditingId(t.id);
    setWizardTab('overview');
    setWizard(fromTemplate(t));
  };

  const setW = (patch: Partial<WizardState>) => setWizard(prev => (prev ? { ...prev, ...patch } : prev));
  const setNested = (key: 'payrollPolicy' | 'attendancePolicy' | 'statutory', field: string, value: any) =>
    setWizard(prev => (prev ? { ...prev, [key]: { ...(prev[key] as any), [field]: value } } : prev));

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c: any) => [c.id, c.name]));
    return (id: number | null) => (id == null ? 'All Companies' : m.get(id) || '—');
  }, [companies]);

  const filtered = templates;
  const totalEmployees = filtered.reduce((s: number, t: any) => s + (t.employee_count || 0), 0);

  return (
    <div className={standalone ? 'p-6 space-y-6' : 'space-y-6'}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <SlidersHorizontal className="w-6 h-6 text-[var(--primary-blue)]" /> Configure Payroll
          </h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Company-wise payroll templates. Each template bundles policy, components, statutory,
            tax regimes, attendance and state compliance. Pick a template on the employee form, then just
            press <b>Run Payroll</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Create Template
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatBox label="Templates" value={filtered.length} icon={FileText} />
        <StatBox label="Employees on templates" value={totalEmployees} icon={Building2} />
        <StatBox label="Companies covered" value={new Set(filtered.map((t: any) => t.company_id)).size} icon={MapPin} />
        <StatBox label="Active" value={filtered.filter((t: any) => t.status === 'active').length} icon={CheckCircle2} />
      </div>

      <div className="flex items-center gap-3">
        <div className="w-64">
          <SearchableSelect value={companyFilter} onChange={setCompanyFilter}
            options={[{ id: 'all', name: 'All Companies' }, ...companies.map((c: any) => ({ id: c.id, name: c.name }))]}
            placeholder="Filter by company" />
        </div>
      </div>

      {isLoading ? (
        null
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t: any) => (
            <div key={t.id} className="bg-white rounded-2xl border border-[var(--border-color)] p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-[var(--primary-blue)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{t.name}</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">{companyName(t.company_id)}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.status}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 line-clamp-2">{t.description || 'No description'}</p>
              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <Meta label="Policy" value={t.policy_name || '—'} />
                <Meta label="Attendance" value={t.attendance_name || '—'} />
                <Meta label="Tax regime" value={t.tax_regime_name || '—'} />
                <Meta label="Components" value={String(t.component_count ?? 0)} />
                <Meta label="Employees" value={String(t.employee_count ?? 0)} />
                <Meta label="State" value={t.registered_state || '—'} />
                <Meta label="Pay cycle" value={t.pay_cycle || 'monthly'} />
                <Meta label="Pay day" value={t.pay_day ? `Day ${t.pay_day}` : 'Last day'} />
              </div>
              <div className="mt-auto flex gap-2">
                <button onClick={() => openEdit(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => {
                  if (confirm(`Delete template "${t.name}"? Employees using it will fall back to their own settings.`)) {
                    deleteMutation.mutate(t.id);
                  }
                }}
                  className="flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <p className="text-sm text-[var(--text-tertiary)] bg-blue-50 border border-blue-100 rounded-lg p-3">
          No company templates yet — click <b>Create Template</b> above to build one for a company.
        </p>
      )}

      {wizard && (
        <WizardModal
          state={wizard}
          tab={wizardTab}
          setTab={setWizardTab}
          setState={setW}
          setNested={setNested}
          companies={companies}
          editingId={editingId}
          saving={saveMutation.isPending}
          onSave={() => {
            if (!wizard.attendancePolicyId) { toast.error('Select an Attendance Template first (Attendance & Leave tab)'); setWizardTab('attendance'); return; }
            if (!wizard.leaveTemplateId) { toast.error('Select a Leave Template first (Attendance & Leave tab)'); setWizardTab('attendance'); return; }
            saveMutation.mutate({ id: editingId, state: wizard });
          }}
          onClose={() => { setWizard(null); setEditingId(null); }}
          userOrgName={(user as any)?.organizationName || 'Your Organization'}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-[var(--primary-blue)]" />
      </div>
      <div>
        <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
        <div className="text-xs text-[var(--text-tertiary)]">{label}</div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
      <div className="font-medium text-[var(--text-primary)] truncate">{value}</div>
    </div>
  );
}

// ── Wizard Modal ──

const WIZARD_TABS = [
  { id: 'overview', label: 'Overview', icon: Building2, color: 'text-blue-600' },
  { id: 'policy', label: 'Payroll Policy', icon: SlidersHorizontal, color: 'text-violet-600' },
  { id: 'statutory', label: 'Statutory Settings', icon: ShieldCheck, color: 'text-emerald-600' },
  { id: 'tax', label: 'Tax Regimes', icon: Landmark, color: 'text-amber-600' },
  { id: 'attendance', label: 'Attendance & Leave', icon: Clock, color: 'text-rose-600' },
  { id: 'compliance', label: 'State Compliance', icon: MapPin, color: 'text-indigo-600' },
  { id: 'earning', label: 'Earning Components', icon: TrendingUp, color: 'text-cyan-600' },
  { id: 'deduction', label: 'Deduction Components', icon: MinusCircle, color: 'text-rose-600' },
  { id: 'employer', label: 'Employer Contribution', icon: Wallet, color: 'text-emerald-600' },
];

const WIZARD_HELP: Record<string, string> = {
  overview: 'Name, company and jurisdiction for this template.',
  policy: 'Pay cycle, pay day, auto-payslip and pro-ration & rounding rules.',
  statutory: 'PF, ESI, Professional Tax, LWF and Gratuity settings.',
  tax: 'Income tax regime and slabs used for TDS.',
  attendance: 'Work schedule and attendance-to-payroll mapping.',
  compliance: 'Registered state drives auto-calculated PT and LWF.',
  earning: 'Earnings added to gross pay — Basic, HRA, Conveyance, Special Allowance, etc.',
  deduction: 'Deductions subtracted from gross pay — PF, ESI, Professional Tax, TDS, etc.',
  employer: 'Employer contributions paid on top of salary — PF employer share, ESI, gratuity.',
};

function WizardModal(props: {
  state: WizardState;
  tab: string;
  setTab: (t: string) => void;
  setState: (patch: Partial<WizardState>) => void;
  setNested: (key: 'payrollPolicy' | 'attendancePolicy' | 'statutory', field: string, value: any) => void;
  companies: any[];
  editingId: number | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  userOrgName: string;
}) {
  const { state: w, tab, setTab, setState, setNested, companies, editingId, saving, onSave, onClose } = props;
  const accent = '#1C64F2';
  const { country: orgCountry } = useAppConfig();

  const [ptDetail, setPtDetail] = useState<any>(null);
  const [lwfDetail, setLwfDetail] = useState<any>(null);
  useEffect(() => {
    let active = true;
    if (!w.registeredState) { setPtDetail(null); setLwfDetail(null); return; }
    getStatePT(w.registeredState).then(d => { if (active) setPtDetail(d); }).catch(() => { if (active) setPtDetail(null); });
    getStateLWF(w.registeredState).then(d => { if (active) setLwfDetail(d); }).catch(() => { if (active) setLwfDetail(null); });
    return () => { active = false; };
  }, [w.registeredState]);

  const done = [
    !!(w.name.trim() && w.companyId != null),
    true,
    true,
    (w.taxRegime.slabs || []).length > 0,
    true,
    !!w.registeredState,
    w.components.some(c => c.component_type === 'earning'),
    w.components.some(c => c.component_type === 'deduction'),
    w.components.some(c => c.component_type === 'employer_contribution'),
  ].filter(Boolean).length;
  const progress = Math.min(100, Math.round((done / WIZARD_TABS.length) * 100));

  const setComp = (i: number, patch: Partial<PayrollTemplateComponent>) => {
    const next = w.components.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    setState({ components: next });
  };
  const setComponents = (next: PayrollTemplateComponent[]) => {
    setState({ components: next.map((c, idx) => ({ ...c, priority: idx + 1 })) });
  };
  const addComp = (type: 'earning' | 'deduction' | 'employer_contribution' = 'earning') => setComponents([...w.components, { name: '', display_name: '', component_type: type, calculation_type: 'fixed', calculation_value: null, max_cap: null, min_cap: null, priority: w.components.length + 1, is_taxable: true, is_tax_exempt: false, tax_exempt_limit: null, apply_pro_ration: true, tax_category: defaultTaxCategory(type) }]);
  const removeComp = (i: number) => setComponents(w.components.filter((_, idx) => idx !== i));
  const addAfter = (i: number, type: 'earning' | 'deduction' | 'employer_contribution') => {
    const next = [...w.components];
    next.splice(i + 1, 0, { name: '', display_name: '', component_type: type, calculation_type: 'fixed', calculation_value: null, max_cap: null, min_cap: null, priority: w.components.length + 1, is_taxable: true, is_tax_exempt: false, tax_exempt_limit: null, apply_pro_ration: true, tax_category: defaultTaxCategory(type) });
    setComponents(next);
  };
  const moveComp = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= w.components.length) return;
    if (w.components[j].component_type !== w.components[i].component_type) return;
    const next = [...w.components];
    [next[i], next[j]] = [next[j], next[i]];
    setComponents(next);
  };
  const setPriority = (i: number, p: number) => {
    const arr = w.components;
    const type = arr[i].component_type;
    const group: PayrollTemplateComponent[] = [];
    const groupIdxs: number[] = [];
    arr.forEach((c, idx) => { if (c.component_type === type) { group.push(c); groupIdxs.push(idx); } });
    if (p < 1 || p > group.length) return;
    const curPos = groupIdxs.indexOf(i);
    const [item] = group.splice(curPos, 1);
    group.splice(p - 1, 0, item);
    const out = [...arr];
    group.forEach((c, gi) => { out[groupIdxs[gi]] = c; });
    setComponents(out);
  };

  const setSlab = (i: number, patch: Partial<TaxSlabInput>) => {
    const next = (w.taxRegime.slabs || []).map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setState({ taxRegime: { ...w.taxRegime, slabs: next } });
  };
  const addSlab = () => setState({ taxRegime: { ...w.taxRegime, slabs: [...(w.taxRegime.slabs || []), { from_amount: 0, to_amount: null, rate: 0, sort_order: (w.taxRegime.slabs?.length || 0) + 1 }] } });
  const removeSlab = (i: number) => setState({ taxRegime: { ...w.taxRegime, slabs: (w.taxRegime.slabs || []).filter((_, idx) => idx !== i) } });

  const surcharges: { from: number; rate: number }[] = (w.taxRegime.surcharge_config || []) as { from: number; rate: number }[];
  const setSurcharge = (i: number, patch: Partial<{ from: number; rate: number }>) => {
    const next = surcharges.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setState({ taxRegime: { ...w.taxRegime, surcharge_config: next } });
  };
  const addSurcharge = () => setState({ taxRegime: { ...w.taxRegime, surcharge_config: [...surcharges, { from: 5000000, rate: 10 }] } });
  const removeSurcharge = (i: number) => setState({ taxRegime: { ...w.taxRegime, surcharge_config: surcharges.filter((_, idx) => idx !== i) } });

  // Linkable attendance + leave templates for the wizard's company.
  // Picking one auto-applies its rules; the embedded fields below turn into a
  // read-only preview while linked (shared templates are never overwritten).
  const { data: attTemplates = [] } = useQuery({
    queryKey: ['payroll-wizard-attendance', w.companyId],
    queryFn: async () => {
      const params = w.companyId ? { companyId: w.companyId } : {};
      const r = await api.get('/payroll-config/attendance-policies', { params });
      return (r.data || []).filter((p: any) => p.status !== 'inactive');
    },
    staleTime: 60 * 1000,
  });
  const { data: leaveTemplates = [] } = useQuery({
    queryKey: ['payroll-wizard-leave', w.companyId],
    queryFn: async () => {
      const params = w.companyId ? { companyId: w.companyId } : {};
      const r = await api.get('/api/leave-templates', { params });
      return r.data || [];
    },
    staleTime: 60 * 1000,
  });
  const linkAttendance = (id: number | null) => {
    if (!id) { setState({ attendanceLinked: false, attendancePolicyId: null }); return; }
    const t = (attTemplates as any[]).find((p: any) => Number(p.id) === Number(id));
    if (!t) return;
    setState({
      attendanceLinked: true,
      attendancePolicyId: t.id,
      attendancePolicy: {
        ...defaultAttendance(),
        name: t.name, working_days_per_week: t.working_days_per_week, working_days: t.working_days,
        half_day_as_full_paid: t.half_day_as_full_paid, paid_leave_as_present: t.paid_leave_as_present,
        holiday_as_present: t.holiday_as_present, overtime_threshold_hours: t.overtime_threshold_hours,
        overtime_rate: t.overtime_rate, late_mark_threshold_minutes: t.late_mark_threshold_minutes,
        half_day_threshold_hours: t.half_day_threshold_hours,
        late_to_absent_count: t.late_to_absent_count ?? null,
        early_to_absent_count: t.early_to_absent_count ?? null,
        missing_checkout_rule: t.missing_checkout_rule || 'half_day',
      },
    });
  };
  const linkedLeave = (leaveTemplates as any[]).find((t: any) => Number(t.id) === Number(w.leaveTemplateId));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {editingId ? 'Edit Payroll Template' : 'Create Payroll Template'}
              </h2>
              <p className="text-xs text-[#64748B]">Configure everything once, reuse everywhere.</p>
            </div>
          </div>
          <button onClick={onClose} title="Close" className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Progress bar */}
        <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }} />
            </div>
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: accent }}>{progress}% complete</span>
          </div>
          <p className="text-[11px] text-[#B45309] mt-1.5">
            Navigate through sections to fill in template details. Fields marked with <span className="font-semibold text-[#DC2626]">*</span>
            are mandatory. Click Save at the bottom to create the template.
          </p>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
            <div className="py-2 px-3">
              <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
              <nav className="space-y-0.5">
                {WIZARD_TABS.map((t) => {
                  const active = t.id === tab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                        active
                          ? 'bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] text-[#1C64F2] shadow-sm'
                          : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                        active ? `${t.color}` : 'bg-white border border-[var(--border-color)]'
                      }`}
                        style={active ? { background: `${accent}14`, boxShadow: `0 2px 6px ${accent}22` } : undefined}>
                        <t.icon className={`w-4 h-4 transition-all duration-300 ${active ? t.color : 'text-[#64748B]'}`} />
                      </span>
                      <span className={`flex-1 truncate transition-colors duration-300 ${active ? 'font-semibold text-[#1C64F2]' : 'font-medium'}`}>{t.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div key={tab} className="section-fade-in">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}14` }}>
                  {(() => { const t = WIZARD_TABS.find(x => x.id === tab); const Icon = t?.icon || Building2; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZARD_TABS.find(x => x.id === tab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[tab] || ''}</p>
                </div>
              </div>
              <div className="space-y-4">
                {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Template name" help="Text — e.g. 'IT Staff - India'. Shown on the employee form and payroll page.">
                  <TextInput value={w.name} onChange={v => setState({ name: v })} placeholder="e.g. IT Staff - India" />
                </Field>
                <Field label="Country" help="Set globally in Settings → General. Used for statutory applicability.">
                  <div className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg bg-gray-50 text-sm text-[var(--text-primary)] select-none cursor-not-allowed">{orgCountry || w.country || 'India'}</div>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Registered state (state compliance / PT / LWF)" help="Select a state — drives auto-calculated Professional Tax (PT) and Labour Welfare Fund (LWF) slabs.">
                  <SearchableSelect value={w.registeredState || ''} onChange={v => setState({ registeredState: String(v) })} placeholder="Select State" options={STATES.map(s => ({ id: s, name: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))} showAllOption={false} clearable />
                </Field>
                <Field label="Company" help="Select the legal entity this template pays. 'All Companies (Org-wide)' applies everywhere.">
                  <SearchableSelect value={w.companyId ?? 'all'} onChange={v => setState({ companyId: v === 'all' ? null : Number(v) })} placeholder="Select Company" options={companies.map((c: any) => ({ id: c.id, name: c.name }))} allOption="All Companies (Org-wide)" />
                </Field>
              </div>
              <Field label="Description" help="Optional — note what this template is for (e.g. 'IT staff — India', 'Field sales — North zone').">
                <textarea className={inputCls} rows={3} value={w.description} onChange={e => setState({ description: e.target.value })} placeholder="What is this template for?" />
              </Field>
              <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pt-1">
                <Toggle label="Active" help="Off = template is kept but not offered on the employee form." checked={w.status !== 'inactive'} onChange={v => setState({ status: v ? 'active' : 'inactive' })} />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] bg-blue-50 border border-blue-100 rounded-lg p-3">
                <b>Tip:</b> after saving, go to an employee's Salary tab, select this template, and press
                <b> Run Payroll</b> on the Payroll page to pay every employee in that company.
              </p>
            </div>
          )}

          {tab === 'policy' && (
            <div className="space-y-4">
              <WizardSectionCard title="Pay run" icon={CalendarDays}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Pay cycle" help="How often payroll runs: daily, weekly, monthly or yearly.">
                    <SearchableSelect value={w.payCycle || 'monthly'} onChange={v => setState({ payCycle: String(v) })} placeholder="Select Pay cycle" options={PAY_CYCLES.map(c => ({ id: c, name: c[0].toUpperCase() + c.slice(1) }))} showAllOption={false} />
                  </Field>
                  <Field label="Pay day (blank = last day of month)" help="Number (1-31) — the day salary is disbursed. Blank = last day of the month.">
                    <NumInput value={w.payDay} onChange={v => setState({ payDay: v })} placeholder="Last day" />
                  </Field>
                  <div className="flex flex-wrap items-start gap-x-8 gap-y-3 col-span-2 pt-6">
                    <Toggle label="Auto-generate payslips" help="On = payslips are created automatically at the start of each cycle." checked={!!w.autoPayslip} onChange={v => setState({ autoPayslip: v })} />
                    <Toggle label="Email payslips to employees" help="On = generated payslips are emailed to employees." checked={!!w.emailPayslip} onChange={v => setState({ emailPayslip: v })} />
                  </div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="General" icon={SlidersHorizontal}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Policy name" help="Text — internal label for this pay policy."><TextInput value={w.payrollPolicy.name || ''} onChange={v => setNested('payrollPolicy', 'name', v)} /></Field>
                  <Field label="Currency" help="Text — ISO 4217 code, e.g. INR or USD. Used on payslip amounts."><TextInput value={w.payrollPolicy.default_currency || 'INR'} onChange={v => setNested('payrollPolicy', 'default_currency', v)} /></Field>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Pro-ration & Rounding" icon={SlidersHorizontal}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  <Field label="Daily rate divisor" help="Divides monthly salary to get the daily rate (30 calendar days, or 26 working days).">
                    <NumInput value={w.payrollPolicy.daily_rate_divisor} onChange={v => setNested('payrollPolicy', 'daily_rate_divisor', v)} placeholder="30" />
                  </Field>
                  <Field label="Weekly to monthly divisor" help="Converts a weekly rate to monthly (52 weeks / 12 months = 4.33).">
                    <NumInput value={w.payrollPolicy.monthly_divisor_for_weekly} onChange={v => setNested('payrollPolicy', 'monthly_divisor_for_weekly', v)} placeholder="4.33" />
                  </Field>
                  <Field label="Pro-ration method" help="How salary is split for partial months: paid days, calendar days, working days or none.">
                    <SearchableSelect value={w.payrollPolicy.pro_ration_method || 'paid_days'} onChange={v => setNested('payrollPolicy', 'pro_ration_method', String(v))} placeholder="Select Pro-ration method" options={[
                      { id: 'paid_days', name: 'Paid days' },
                      { id: 'calendar_days', name: 'Calendar days' },
                      { id: 'working_days', name: 'Working days' },
                      { id: 'none', name: 'No pro-ration' },
                    ]} showAllOption={false} />
                  </Field>
                  <Field label="Rounding method" help="How payslip values are rounded: nearest, floor, ceil or truncate.">
                    <SearchableSelect value={w.payrollPolicy.rounding_method || 'nearest'} onChange={v => setNested('payrollPolicy', 'rounding_method', String(v))} placeholder="Select Rounding method" options={[
                      { id: 'nearest', name: 'Nearest' },
                      { id: 'floor', name: 'Floor' },
                      { id: 'ceil', name: 'Ceil' },
                      { id: 'truncate', name: 'Truncate' },
                    ]} showAllOption={false} />
                  </Field>
                  <Field label="Decimal places" help="Number (0-4) — digits kept after rounding."><NumInput value={w.payrollPolicy.decimal_places ?? 2} onChange={v => setNested('payrollPolicy', 'decimal_places', v ?? 2)} /></Field>
                  <div className="flex flex-wrap items-start gap-x-8 gap-y-3 col-span-3 pt-6">
                    <Toggle label="Round net salary" help="On = round the final net pay; Off = keep exact decimals." checked={!!w.payrollPolicy.round_net_salary} onChange={v => setNested('payrollPolicy', 'round_net_salary', v)} />
                    <Toggle label="Allow negative net" help="On = net pay may go below zero (e.g. over-deductions)." checked={!!w.payrollPolicy.allow_negative_net} onChange={v => setNested('payrollPolicy', 'allow_negative_net', v)} />
                  </div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Gratuity" icon={SlidersHorizontal}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Gratuity rate (%)" help="Number — % of basic wage."><NumInput value={w.payrollPolicy.gratuity_rate} onChange={v => setNested('payrollPolicy', 'gratuity_rate', v)} /></Field>
                  <div className="pt-6"><Toggle label="Include gratuity" help="On = reserve a gratuity liability on each payslip." checked={!!w.payrollPolicy.include_gratuity} onChange={v => setNested('payrollPolicy', 'include_gratuity', v)} /></div>
                </div>
              </WizardSectionCard>
            </div>
          )}

          {tab === 'earning' && (
            <div className="space-y-4">
              <Form16Flow components={w.components} />
              <ComponentSection type="earning" title="Earnings" icon={TrendingUp} tint="text-blue-600" desc="Added to gross pay — e.g. Basic, HRA, Conveyance, Special Allowance." empty='No earnings yet. Click "Add Earning" above.' heading="Earning" components={w.components} setComp={setComp} removeComp={removeComp} addComp={addComp} addAfter={addAfter} setPriority={setPriority} />
            </div>
          )}

          {tab === 'deduction' && (
            <div className="space-y-4">
              <Form16Flow components={w.components} />
              <ComponentSection type="deduction" title="Deductions" icon={MinusCircle} tint="text-rose-600" desc="Subtracted from gross pay — e.g. PF, ESI, Professional Tax, TDS." empty='No deductions yet. Click "Add Deduction" above.' heading="Deduction" components={w.components} setComp={setComp} removeComp={removeComp} addComp={addComp} addAfter={addAfter} setPriority={setPriority} />
            </div>
          )}

          {tab === 'employer' && (
            <div className="space-y-4">
              <Form16Flow components={w.components} />
              <ComponentSection type="employer_contribution" title="Employer Contributions" icon={Wallet} tint="text-emerald-600" desc="Paid by the employer on top of salary (PF employer share, gratuity reserve)." empty="No employer contributions yet." heading="Employer Contribution" components={w.components} setComp={setComp} removeComp={removeComp} addComp={addComp} addAfter={addAfter} setPriority={setPriority} />
            </div>
          )}

          {tab === 'statutory' && (
            <div className="space-y-4">
              <WizardSectionCard title="Provident Fund (PF)" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Employee rate (%)" help="Number — % of basic deducted from employee."><NumInput value={w.statutory.pf_employee_rate} onChange={v => setNested('statutory', 'pf_employee_rate', v)} /></Field>
                  <Field label="Employer rate (%)" help="Number — employer PF contribution %."><NumInput value={w.statutory.pf_employer_rate} onChange={v => setNested('statutory', 'pf_employer_rate', v)} /></Field>
                  <Field label="PF wage ceiling" help="Number — EPF/EPS computed on min(Basic+DA, this)."><NumInput value={w.statutory.pf_wage_ceiling} onChange={v => setNested('statutory', 'pf_wage_ceiling', v)} /></Field>
                  <Field label="EPS wage ceiling" help="Number — pension (EPS) capped at this wage."><NumInput value={w.statutory.eps_wage_ceiling} onChange={v => setNested('statutory', 'eps_wage_ceiling', v)} /></Field>
                  <Field label="Max monthly" help="Number — PF capped at this amount per month."><NumInput value={w.statutory.pf_max_monthly} onChange={v => setNested('statutory', 'pf_max_monthly', v)} /></Field>
                  <Field label="Min basic for exclusion" help="Number — employees above this basic can opt out of PF."><NumInput value={w.statutory.pf_min_basic_for_exclusion} onChange={v => setNested('statutory', 'pf_min_basic_for_exclusion', v)} /></Field>
                  <Field label="EDLI rate (%)" help="Number — EDLI insurance on top of PF."><NumInput value={w.statutory.pf_edli_rate} onChange={v => setNested('statutory', 'pf_edli_rate', v)} /></Field>
                  <Field label="EDLI max" help="Number — EDLI capped at this amount per month."><NumInput value={w.statutory.pf_edli_max_monthly} onChange={v => setNested('statutory', 'pf_edli_max_monthly', v)} /></Field>
                  <Field label="Admin charges (%)" help="Number — EPF admin charges."><NumInput value={w.statutory.pf_admin_rate} onChange={v => setNested('statutory', 'pf_admin_rate', v)} /></Field>
                  <Field label="Admin min" help="Number — admin charges minimum per month."><NumInput value={w.statutory.pf_admin_min_monthly} onChange={v => setNested('statutory', 'pf_admin_min_monthly', v)} /></Field>
                  <div className="pt-6"><Toggle label="PF applicable" help="On = deduct Provident Fund from pay." checked={!!w.statutory.pf_applicable} onChange={v => setNested('statutory', 'pf_applicable', v)} /></div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="ESI" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Employee rate (%)" help="Number — % of gross deducted."><NumInput value={w.statutory.esi_employee_rate} onChange={v => setNested('statutory', 'esi_employee_rate', v)} /></Field>
                  <Field label="Employer rate (%)" help="Number — employer ESI %."><NumInput value={w.statutory.esi_employer_rate} onChange={v => setNested('statutory', 'esi_employer_rate', v)} /></Field>
                  <Field label="Gross ceiling" help="Number — ESI applies only below this monthly gross."><NumInput value={w.statutory.esi_gross_ceiling} onChange={v => setNested('statutory', 'esi_gross_ceiling', v)} /></Field>
                  <Field label="Disabled ceiling" help="Number — higher ceiling for persons with disabilities."><NumInput value={w.statutory.esi_disabled_ceiling} onChange={v => setNested('statutory', 'esi_disabled_ceiling', v)} /></Field>
                  <div className="pt-6"><Toggle label="ESI applicable" help="On = deduct Employees' State Insurance." checked={!!w.statutory.esi_applicable} onChange={v => setNested('statutory', 'esi_applicable', v)} /></div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Professional Tax" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Flat amount" help="Number — fixed monthly PT. State slabs may override."><NumInput value={w.statutory.pt_monthly_amount} onChange={v => setNested('statutory', 'pt_monthly_amount', v)} /></Field>
                  <Field label="Min gross" help="Number — PT deducted only above this gross."><NumInput value={w.statutory.pt_min_gross} onChange={v => setNested('statutory', 'pt_min_gross', v)} /></Field>
                  <div className="pt-6"><Toggle label="PT applicable" help="On = deduct Professional Tax." checked={!!w.statutory.pt_applicable} onChange={v => setNested('statutory', 'pt_applicable', v)} /></div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Labour Welfare Fund (LWF)" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Employee rate (%)" help="Number — employee LWF contribution %."><NumInput value={w.statutory.lwf_employee_rate} onChange={v => setNested('statutory', 'lwf_employee_rate', v)} /></Field>
                  <Field label="Employer rate (%)" help="Number — employer LWF contribution %."><NumInput value={w.statutory.lwf_employer_rate} onChange={v => setNested('statutory', 'lwf_employer_rate', v)} /></Field>
                  <div className="pt-6"><Toggle label="LWF applicable" help="On = deduct Labour Welfare Fund." checked={!!w.statutory.lwf_applicable} onChange={v => setNested('statutory', 'lwf_applicable', v)} /></div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Gratuity" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Rate (%)" help="Number — % of basic wage."><NumInput value={w.statutory.gratuity_rate} onChange={v => setNested('statutory', 'gratuity_rate', v)} /></Field>
                  <Field label="Eligibility years" help="Number — years of service for gratuity."><NumInput value={w.statutory.gratuity_eligible_years} onChange={v => setNested('statutory', 'gratuity_eligible_years', v)} /></Field>
                  <Field label="Days per year" help="Number — gratuity days credited per year."><NumInput value={w.statutory.gratuity_days_per_year} onChange={v => setNested('statutory', 'gratuity_days_per_year', v)} /></Field>
                  <Field label="Tax-exempt ceiling" help="Number — gratuity tax exemption limit."><NumInput value={w.statutory.gratuity_tax_exempt_ceiling} onChange={v => setNested('statutory', 'gratuity_tax_exempt_ceiling', v)} /></Field>
                  <div className="pt-6"><Toggle label="Gratuity applicable" help="On = reserve a gratuity liability." checked={!!w.statutory.gratuity_applicable} onChange={v => setNested('statutory', 'gratuity_applicable', v)} /></div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Statutory Bonus (Payment of Bonus Act)" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Minimum rate (%)" help="Number — minimum bonus % of wages."><NumInput value={w.statutory.bonus_min_rate} onChange={v => setNested('statutory', 'bonus_min_rate', v)} /></Field>
                  <Field label="Maximum rate (%)" help="Number — maximum bonus % of wages."><NumInput value={w.statutory.bonus_max_rate} onChange={v => setNested('statutory', 'bonus_max_rate', v)} /></Field>
                  <Field label="Wage ceiling" help="Number — bonus applies only below this monthly wage."><NumInput value={w.statutory.bonus_wage_ceiling} onChange={v => setNested('statutory', 'bonus_wage_ceiling', v)} /></Field>
                  <div className="pt-6"><Toggle label="Bonus applicable" help="On = pay statutory bonus (min rate) to eligible employees." checked={!!w.statutory.bonus_applicable} onChange={v => setNested('statutory', 'bonus_applicable', v)} /></div>
                </div>
              </WizardSectionCard>
            </div>
          )}

          {tab === 'tax' && (
            <div className="space-y-4">
              <div className="text-xs text-[var(--text-tertiary)] bg-amber-50 border border-amber-200 rounded-lg p-3">
                <b>New Regime</b> (default) — lower slabs, ₹75,000 standard deduction, no 80C/80D/HRA exemptions.
                <b> Old Regime</b> — higher slabs but allows 80C, 80D, HRA &amp; LTA exemptions. Choose per employee via their
                Investment Declaration; this tab defines the slab set used for TDS.
              </div>
              <WizardSectionCard title="Regime" icon={Landmark}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Regime name" help="Text — e.g. 'New Regime' or 'Old Regime'."><TextInput value={w.taxRegime.name || ''} onChange={v => setState({ taxRegime: { ...w.taxRegime, name: v } })} /></Field>
                  <Field label="Type" help="New, Old or Custom regime — changes slab and deduction rules.">
                    <SearchableSelect value={w.taxRegime.regime_type || 'new'} onChange={v => setState({ taxRegime: { ...w.taxRegime, regime_type: String(v) } })} placeholder="Select Type" options={[
                      { id: 'new', name: 'New regime' },
                      { id: 'old', name: 'Old regime' },
                      { id: 'custom', name: 'Custom' },
                    ]} showAllOption={false} />
                  </Field>
                  <Field label="Financial year" help="Text — e.g. '2026-27'. Used for the TDS period."><TextInput value={w.taxRegime.financial_year || ''} onChange={v => setState({ taxRegime: { ...w.taxRegime, financial_year: v } })} /></Field>
                  <Field label="Standard deduction" help="Number — flat deduction from taxable income."><NumInput value={w.taxRegime.standard_deduction} onChange={v => setState({ taxRegime: { ...w.taxRegime, standard_deduction: v } })} /></Field>
                  <Field label="Rebate threshold" help="Number — income up to this is fully rebated."><NumInput value={w.taxRegime.rebate_threshold} onChange={v => setState({ taxRegime: { ...w.taxRegime, rebate_threshold: v } })} /></Field>
                  <Field label="Rebate amount" help="Number — maximum tax rebated under §87A."><NumInput value={w.taxRegime.rebate_amount} onChange={v => setState({ taxRegime: { ...w.taxRegime, rebate_amount: v } })} /></Field>
                  <Field label="Cess rate (%)" help="Number — health & education cess on tax."><NumInput value={w.taxRegime.cess_rate} onChange={v => setState({ taxRegime: { ...w.taxRegime, cess_rate: v } })} /></Field>
                  <div className="flex flex-wrap items-start gap-x-8 gap-y-3 col-span-2 pt-6">
                    <Toggle label="Active" help="On = regime can be selected/used. Off = hidden from selection." checked={!!w.taxRegime.is_active} onChange={v => setState({ taxRegime: { ...w.taxRegime, is_active: v } })} />
                    <Toggle label="Default regime" help="On = fallback regime when no other is chosen." checked={!!w.taxRegime.is_default} onChange={v => setState({ taxRegime: { ...w.taxRegime, is_default: v } })} />
                  </div>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Exemptions & HRA caps" icon={Landmark}>
                <p className="text-xs text-[var(--text-tertiary)] mb-3">Old-regime Chapter VI-A caps and House Rent Allowance exemption rules (section 10(13A)).</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  <Field label="80C cap" help="Max deduction for life insurance, ELSS, PF, tuition fees etc."><NumInput value={w.taxRegime.section_80c_cap} onChange={v => setState({ taxRegime: { ...w.taxRegime, section_80c_cap: v } })} placeholder="150000" /></Field>
                  <Field label="80C cap (old regime)" help="Legacy 80C cap if it differs from the standard cap."><NumInput value={w.taxRegime.section_80c_old_cap} onChange={v => setState({ taxRegime: { ...w.taxRegime, section_80c_old_cap: v } })} placeholder="150000" /></Field>
                  <Field label="80D cap" help="Health insurance premium - self & family."><NumInput value={w.taxRegime.section_80d_cap} onChange={v => setState({ taxRegime: { ...w.taxRegime, section_80d_cap: v } })} placeholder="50000" /></Field>
                  <Field label="80D cap (senior citizen)" help="Health insurance premium - senior citizens."><NumInput value={w.taxRegime.section_80d_senior_cap} onChange={v => setState({ taxRegime: { ...w.taxRegime, section_80d_senior_cap: v } })} placeholder="100000" /></Field>
                  <Field label="80CCD(1B) NPS cap" help="Additional NPS deduction over and above 80C."><NumInput value={w.taxRegime.section_80ccd_1b_cap} onChange={v => setState({ taxRegime: { ...w.taxRegime, section_80ccd_1b_cap: v } })} placeholder="50000" /></Field>
                  <Field label="Home loan interest cap (u/s 24)" help="Max interest deduction on self-occupied property."><NumInput value={w.taxRegime.section_24_home_loan_cap} onChange={v => setState({ taxRegime: { ...w.taxRegime, section_24_home_loan_cap: v } })} placeholder="200000" /></Field>
                  <Field label="HRA exemption - metro (%)" help="Delhi, Mumbai, Kolkata, Chennai - % of basic eligible for exemption."><NumInput value={w.taxRegime.hra_metro_pct} onChange={v => setState({ taxRegime: { ...w.taxRegime, hra_metro_pct: v } })} placeholder="50" /></Field>
                  <Field label="HRA exemption - non-metro (%)" help="% of basic eligible for exemption outside metro cities."><NumInput value={w.taxRegime.hra_non_metro_pct} onChange={v => setState({ taxRegime: { ...w.taxRegime, hra_non_metro_pct: v } })} placeholder="40" /></Field>
                  <Field label="Rent threshold (% of basic)" help="Exemption = rent paid minus this % of salary."><NumInput value={w.taxRegime.hra_rent_threshold_pct} onChange={v => setState({ taxRegime: { ...w.taxRegime, hra_rent_threshold_pct: v } })} placeholder="10" /></Field>
                  <Field label="Assumed basic (% of gross)" help="Used for HRA auto-calculation when basic is not separately available."><NumInput value={w.taxRegime.basic_pct_of_gross} onChange={v => setState({ taxRegime: { ...w.taxRegime, basic_pct_of_gross: v } })} placeholder="50" /></Field>
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Slabs" icon={Landmark}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-[var(--text-tertiary)]">Income tax slabs (to = blank means "and above").</p>
                  <button onClick={addSlab} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
                    <Plus className="w-4 h-4" /> Add slab
                  </button>
                </div>
                <div className="space-y-2">
                  {(w.taxRegime.slabs || []).map((s, i) => (
                    <div key={i} className="border border-[var(--border-color)] rounded-xl p-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                        <Field label={`From (${getCurrencySymbol(getAppCurrency())})`} help="Number — slab lower bound, inclusive."><NumInput value={s.from_amount ?? 0} onChange={v => setSlab(i, { from_amount: v ?? 0 })} /></Field>
                        <Field label={`To (${getCurrencySymbol(getAppCurrency())}, blank = ∞)`} help="Number — slab upper bound. Blank means 'and above'."><NumInput value={s.to_amount ?? null} onChange={v => setSlab(i, { to_amount: v })} /></Field>
                        <Field label="Rate (%)" help="Number — tax percentage for this slab."><NumInput value={s.rate ?? 0} onChange={v => setSlab(i, { rate: v ?? 0 })} /></Field>
                      </div>
                      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                        <button onClick={addSlab} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--primary-blue)] hover:bg-blue-50 transition-colors">
                          <Plus className="w-3.5 h-3.5" /> Add New Slab
                        </button>
                        <button onClick={() => removeSlab(i)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /> Delete This Slab
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </WizardSectionCard>
              <WizardSectionCard title="Surcharge" icon={Landmark}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Extra % added on tax for high incomes (applies above ₹50 lakh). Uses the highest threshold the income crosses.
                  </p>
                  <button onClick={addSurcharge} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
                    <Plus className="w-4 h-4" /> Add surcharge slab
                  </button>
                </div>
                {surcharges.length === 0 ? (
                  <p className="text-sm text-[var(--text-disabled)] text-center py-6">No surcharge slabs — tax is charged at the base rate only.</p>
                ) : (
                  <div className="space-y-2">
                    {surcharges.map((s, i) => (
                    <div key={i} className="border border-[var(--border-color)] rounded-xl p-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                        <Field label={`From (${getCurrencySymbol(getAppCurrency())})`} help="Number — taxable income threshold where this rate starts, e.g. 5000000."><NumInput value={s.from ?? 0} onChange={v => setSurcharge(i, { from: v ?? 0 })} /></Field>
                        <Field label="Rate (%)" help={`Number — surcharge % on the tax amount, e.g. 10 for ${getCurrencySymbol(getAppCurrency())}50L-1Cr.`}><NumInput value={s.rate ?? 0} onChange={v => setSurcharge(i, { rate: v ?? 0 })} /></Field>
                      </div>
                      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                        <button onClick={addSurcharge} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--primary-blue)] hover:bg-blue-50 transition-colors">
                          <Plus className="w-3.5 h-3.5" /> Add New Surcharge
                        </button>
                        <button onClick={() => removeSurcharge(i)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /> Delete This Surcharge
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                )}
              </WizardSectionCard>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="space-y-4">
              <div className="text-xs text-[var(--text-tertiary)] bg-rose-50 border border-rose-200 rounded-lg p-3 leading-relaxed">
                <b>How attendance flows into salary:</b> the linked templates above drive everything —
                Present / Late / Work-from-home = full paid day · Absent = unpaid · Half-day = full or 50% per the attendance template ·
                Holiday = paid or unpaid per the attendance template · Leave = paid or unpaid per its type from the linked leave template ·
                Week-offs are excluded from pay entirely. Unpaid days cut salary as <b>(Monthly Gross ÷ days in month) × unpaid days</b>.
                To change any rule, edit the source template in Attendance / Leave → Configuration.
              </div>
              <WizardSectionCard title="Linked templates" icon={Building2}>
                <p className="text-[11px] text-[var(--text-tertiary)]">Pick the company templates once — their rules auto-apply here and to every employee on this payroll template. Shared templates stay read-only below; edit them in Attendance / Leave → Configuration.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Attendance Template *" help="Required — workweek, mapping, overtime and thresholds load from the template.">
                    <SearchableSelect
                      value={w.attendancePolicyId ?? ''}
                      onChange={(v) => linkAttendance(v === '' ? null : Number(v))}
                      options={(attTemplates as any[]).map((p: any) => ({ id: p.id, name: `${p.name}${p.is_shared_template ? '' : ' (custom)'}` }))}
                      placeholder={w.companyId ? 'Select attendance template (required)' : 'Select a company first'}
                      showAllOption={false} clearable />
                  </Field>
                  <Field label="Leave Template *" help="Required — yearly quotas for employees on this payroll template without their own pin.">
                    <SearchableSelect
                      value={w.leaveTemplateId ?? ''}
                      onChange={(v) => setState({ leaveTemplateId: v === '' ? null : Number(v) })}
                      options={(leaveTemplates as any[]).map((t: any) => ({ id: t.id, name: t.name }))}
                      placeholder={w.companyId ? 'Select leave template (required)' : 'Select a company first'}
                      showAllOption={false} clearable />
                  </Field>
                </div>
                {w.attendanceLinked && (
                  <p className="text-[11px] text-[var(--primary-blue)] bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                    Rules below are a read-only preview of the linked template — edit them in Attendance → Configuration.
                    <button type="button" onClick={() => linkAttendance(null)} className="ml-2 underline font-medium">Clear selection</button>
                  </p>
                )}
                {linkedLeave && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {((linkedLeave as any).body?.leaveTypes || []).filter((r: any) => r.active !== false).map((r: any) => (
                      <span key={r.code || r.name} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {r.name}: {r.days}d{r.paid === false ? ' (unpaid)' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </WizardSectionCard>
              {w.attendancePolicyId ? (
                <WizardSectionCard title="Linked attendance rules" icon={Clock}>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Read-only summary of the linked template — edit it in Attendance → Configuration.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {[
                      { label: 'Workweek', value: (() => { const days = String(w.attendancePolicy.working_days || '').split(',').map((s: string) => s.trim()).filter(Boolean); const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return days.length ? `${days.length} days (${days.map((d: string) => names[Number(d)] || d).join(', ')})` : '—'; })() },
                      { label: 'Half day', value: w.attendancePolicy.half_day_as_full_paid ? 'Full paid' : 'Half paid' },
                      { label: 'Paid leave', value: w.attendancePolicy.paid_leave_as_present ? 'As present' : 'Unpaid absence' },
                      { label: 'Holiday', value: w.attendancePolicy.holiday_as_present ? 'Paid' : 'Unpaid' },
                      { label: 'Overtime', value: `${w.attendancePolicy.overtime_threshold_hours ?? 8}h × ${w.attendancePolicy.overtime_rate ?? 1.5}` },
                      { label: 'Late after', value: `${w.attendancePolicy.late_mark_threshold_minutes ?? 15} min` },
                      { label: 'Half-day below', value: `${w.attendancePolicy.half_day_threshold_hours ?? 4}h` },
                      { label: 'Missing checkout', value: String(w.attendancePolicy.missing_checkout_rule || 'half_day').replace(/_/g, ' ') },
                      { label: 'Lates to absent', value: w.attendancePolicy.late_to_absent_count ? `every ${w.attendancePolicy.late_to_absent_count}` : 'not set' },
                      { label: 'Early exits to absent', value: w.attendancePolicy.early_to_absent_count ? `every ${w.attendancePolicy.early_to_absent_count}` : 'not set' },
                    ].map((m) => (
                      <div key={m.label} className="bg-[var(--background)] rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{m.label}</div>
                        <div className="font-medium text-[var(--text-primary)]">{m.value}</div>
                      </div>
                    ))}
                  </div>
                </WizardSectionCard>
              ) : (
                <div className="text-center py-8 text-[var(--text-tertiary)] border border-dashed border-[var(--border-color)] rounded-xl">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No attendance template linked</p>
                  <p className="text-xs mt-1">Pick one above — its workweek, mapping and thresholds will apply to payroll.</p>
                </div>
              )}
            </div>
          )}

          {tab === 'compliance' && (
            <div className="space-y-4">
              <WizardSectionCard title="Jurisdiction" icon={MapPin}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Country" help="Set globally in Settings → General.">
                    <div className="w-full px-3 py-2.5 border border-[var(--border-color)] rounded-lg bg-gray-50 text-sm text-[var(--text-primary)] select-none cursor-not-allowed">{orgCountry || w.country || 'India'}</div>
                  </Field>
                  <Field label="Registered state" help="Select a state — drives auto-calculated PT and LWF slabs.">
                    <SearchableSelect value={w.registeredState || ''} onChange={v => setState({ registeredState: String(v) })} placeholder="Select State" options={STATES.map(s => ({ id: s, name: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))} showAllOption={false} clearable />
                  </Field>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3">
                  Professional Tax and Labour Welfare Fund are auto-calculated from the registered state's
                  statutory slabs — no manual slab entry needed.
                </p>
              </WizardSectionCard>

              {w.registeredState && ptDetail && (
                <WizardSectionCard title={`Professional Tax — ${ptDetail.state_name || w.registeredState.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`} icon={MapPin}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-tertiary)]">
                          <th className="pb-2 font-medium pr-4">Gross From</th>
                          <th className="pb-2 font-medium pr-4">Gross To</th>
                          <th className="pb-2 font-medium pr-4">PT Amount</th>
                          <th className="pb-2 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ptDetail.slabs || []).map((slab: any, i: number) => (
                          <tr key={i} className="border-b border-[#F1F5F9]">
                            <td className="py-2 pr-4 text-[var(--text-secondary)]">{getCurrencySymbol(getAppCurrency())}{slab.from_gross?.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-[var(--text-secondary)]">{slab.to_gross != null ? `${getCurrencySymbol(getAppCurrency())}${slab.to_gross?.toLocaleString()}` : '∞'}</td>
                            <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{getCurrencySymbol(getAppCurrency())}{slab.amount}</td>
                            <td className="py-2 text-xs text-[var(--text-tertiary)]">{slab.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-2">Annual max: {getCurrencySymbol(getAppCurrency())}{ptDetail.annual_max?.toLocaleString()} &middot; {ptDetail.notes}</p>
                </WizardSectionCard>
              )}

              {w.registeredState && lwfDetail?.applicable && (
                <WizardSectionCard title={`Labour Welfare Fund — ${lwfDetail.state_name || w.registeredState.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`} icon={MapPin}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <Field label="Employee contribution" help="Employee LWF rate for this state."><span className="block text-[var(--text-primary)] font-medium">{getCurrencySymbol(getAppCurrency())}{lwfDetail.employee_contribution}/{lwfDetail.frequency === 'half_yearly' ? 'half-yearly' : 'month'}</span></Field>
                    <Field label="Employer contribution" help="Employer LWF rate for this state."><span className="block text-[var(--text-primary)] font-medium">{getCurrencySymbol(getAppCurrency())}{lwfDetail.employer_contribution}/{lwfDetail.frequency === 'half_yearly' ? 'half-yearly' : 'month'}</span></Field>
                    <Field label="Wage ceiling" help="LWF applies only below this monthly wage."><span className="block text-[var(--text-primary)] font-medium">{getCurrencySymbol(getAppCurrency())}{lwfDetail.max_wage_for_applicability?.toLocaleString()}</span></Field>
                  </div>
                </WizardSectionCard>
              )}

              {w.registeredState && !ptDetail && !lwfDetail?.applicable && (
                <WizardSectionCard title="State compliance" icon={MapPin}>
                  <p className="text-sm text-[var(--text-disabled)] text-center py-6">No PT/LWF compliance data available for this state.</p>
                </WizardSectionCard>
              )}
            </div>
          )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {w.components.length} components</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {(w.taxRegime.slabs || []).length} tax slabs</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {w.registeredState || 'no state'}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
            <button onClick={onSave} disabled={saving || !w.name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
