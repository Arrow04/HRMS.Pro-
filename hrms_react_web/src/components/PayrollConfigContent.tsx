import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2, SlidersHorizontal, Binary, ShieldCheck, Landmark,
  Clock, MapPin, CheckCircle2, XCircle, Plus, Pencil, Trash2,
  Loader2, ChevronDown, ChevronUp, X, Edit2, Info, Building,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { useMasterData } from '../hooks/useMasterData';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/payrollConfigApi';
import { fetchPayrollSettings, savePayrollSettings } from '../services/settingsService';
import type {
  PayrollPolicy, PayrollComponent, StatutorySetting,
  TaxRegime, TaxSlab, AttendancePolicy,
} from '../services/payrollConfigApi';

interface ApiErrorLike {
  response?: { data?: { detail?: string } };
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  return (err as ApiErrorLike | null)?.response?.data?.detail || fallback;
}

interface ApiMessage {
  message?: string;
}

interface PTResultSlab {
  from_gross?: number;
  to_gross?: number;
  amount: number;
  description?: string;
}

interface PTResult {
  monthly_pt: number;
  annual_pt: number;
  state_name: string;
  slabs_applied: PTResultSlab[];
}

interface PTDetail {
  state_name: string;
  slabs: PTResultSlab[];
  annual_max?: number;
  notes?: string;
}

interface LWFDetail {
  applicable: boolean;
  state_name: string;
  employee_contribution: number;
  employer_contribution: number;
  frequency: string;
  max_wage_for_applicability?: number;
}

const TABS = [
  { id: 'templates', label: 'Industry Templates', icon: Building2, color: 'text-blue-600' },
  { id: 'policy', label: 'Payroll Policy', icon: SlidersHorizontal, color: 'text-violet-600' },
  { id: 'components', label: 'Components', icon: Binary, color: 'text-cyan-600' },
  { id: 'statutory', label: 'Statutory', icon: ShieldCheck, color: 'text-emerald-600' },
  { id: 'tax', label: 'Tax Regimes', icon: Landmark, color: 'text-amber-600' },
  { id: 'attendance', label: 'Attendance', icon: Clock, color: 'text-rose-600' },
  { id: 'compliance', label: 'State Compliance', icon: MapPin, color: 'text-indigo-600' },
];

export default function PayrollConfigContent() {
  const [activeTab, setActiveTab] = useState('templates');
  const queryClient = useQueryClient();

  return (
    <div className="flex-1 flex min-h-0">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
        <div className="py-2 px-3">
          <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
          <nav className="space-y-0.5">
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                    active
                      ? 'bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] text-[#1C64F2] shadow-sm'
                      : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                    active ? `${tab.color}` : 'bg-white border border-[var(--border-color)]'
                  }`}
                    style={active ? { background: `${accent}14`, boxShadow: `0 2px 6px ${accent}22` } : undefined}>
                    <tab.icon className={`w-4 h-4 transition-all duration-300 ${active ? tab.color : 'text-[#64748B]'}`} />
                  </span>
                  <span className={`flex-1 truncate transition-colors duration-300 ${active ? 'font-semibold text-[#1C64F2]' : 'font-medium'}`}>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div key={activeTab} className="section-fade-in">
          <div className="mb-5">
            <h3 className="text-base font-bold text-[#0F172A] leading-tight">{TABS.find(x => x.id === activeTab)?.label || ''}</h3>
            <p className="text-xs text-[#64748B]">{WIZARD_HELP[activeTab] || ''}</p>
          </div>
          <div className="space-y-6">
            {activeTab === 'templates' && <IndustryTemplatesSection />}
            {activeTab === 'policy' && <PayrollPolicySection />}
            {activeTab === 'components' && <ComponentsSection />}
            {activeTab === 'statutory' && <StatutorySection />}
            {activeTab === 'tax' && <TaxRegimesSection />}
            {activeTab === 'attendance' && <AttendancePolicySection />}
            {activeTab === 'compliance' && <StateComplianceSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

const accent = '#1C64F2';

const WIZARD_HELP: Record<string, string> = {
  templates: 'Apply a pre-configured industry template or manage policies, components and statutory defaults.',
  policy: 'Pro-ration, rounding and currency rules for payslips across the organization.',
  components: 'Earnings and deductions available on every payslip.',
  statutory: 'PF, ESI, Professional Tax, LWF and Gratuity defaults.',
  tax: 'Income tax regimes and slabs used for TDS.',
  attendance: 'Work schedule and attendance-to-payroll mapping.',
  compliance: 'Registered state drives auto-calculated PT and LWF.',
};

// ── Industry Templates ──

function IndustryTemplatesSection() {
  const { data: industries, isLoading } = useQuery({ queryKey: ['industries'], queryFn: api.getIndustries });
  const { data: policies, isLoading: policiesLoading } = useQuery({ queryKey: ['payroll-policies'], queryFn: api.getPayrollPolicies });
  const queryClient = useQueryClient();
  const isConfigured = !policiesLoading && !!policies && policies.length > 0;

  const applyMutation = useMutation({
    mutationFn: api.applyIndustryTemplate,
    onSuccess: (data: ApiMessage) => {
      toast.success(data?.message || 'Template applied successfully');
      queryClient.invalidateQueries({ queryKey: ['industries'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-policies'] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Failed to apply template')),
  });

  const reapplyMutation = useMutation({
    mutationFn: api.reapplyIndustryTemplate,
    onSuccess: (data: ApiMessage) => {
      toast.success(data?.message || 'Template reapplied successfully');
      queryClient.invalidateQueries({ queryKey: ['industries'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-policies'] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Failed to reapply template')),
  });

  const busy = applyMutation.isPending || reapplyMutation.isPending;
  const busyCode = applyMutation.isPending ? applyMutation.variables : reapplyMutation.variables;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">One-Click Industry Setup</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          Apply a pre-configured payroll template for your industry. This creates policies, components, and statutory defaults.
        </p>
        {isConfigured && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mt-3">
            A template is already applied. Click <b>Reapply</b> to replace the current configuration with a template below.
          </p>
        )}
      </div>
      {isLoading ? (
        null
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(industries || []).map(ind => (
            <div key={ind.code} className="border border-[var(--border-color)] rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">{ind.name}</h3>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{ind.code.toUpperCase()}</p>
                </div>
                <span className="text-[10px] font-medium text-[var(--primary-blue)] bg-blue-50 px-2 py-0.5 rounded-full">
                  {ind.typical_headcount_range || ind.headcount_range || ''}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-3">{ind.description}</p>
              <p className="text-xs text-[var(--text-disabled)] mb-4">{Array.isArray(ind.recommended_for) ? ind.recommended_for.join(', ') : ind.recommended_for}</p>
              <button onClick={() => isConfigured ? reapplyMutation.mutate(ind.code) : applyMutation.mutate(ind.code)}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {busy && busyCode === ind.code ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {isConfigured ? 'Reapplying...' : 'Applying...'}</>
                ) : isConfigured ? 'Reapply Template' : 'Apply Template'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Payroll Policy ──

function PayrollPolicySection() {
  const queryClient = useQueryClient();
  const { data: roundingMethodOptions = [] } = useMasterData('ROUNDING_METHOD');
const { data: workingDaysOptions = [] } = useMasterData('WORKING_DAYS_PER_WEEK');
  const { data: proRationOptions = [] } = useMasterData('PAYROLL_PRO_RATA');
  const { data: computeModeOptions = [] } = useMasterData('PAYROLL_COMPUTE_MODE');
  const { data: policies, isLoading } = useQuery({ queryKey: ['payroll-policies'], queryFn: api.getPayrollPolicies });
  const [editing, setEditing] = useState<PayrollPolicy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PayrollPolicy>({
    name: '', pro_ration_method: 'paid_days', rounding_method: 'nearest',
    decimal_places: 2, round_net_salary: true, include_gratuity: false,
    gratuity_rate: 4.81, default_currency: 'INR', allow_negative_net: false,
  });

  const createMutation = useMutation({
    mutationFn: api.createPayrollPolicy,
    onSuccess: () => { toast.success('Policy created'); queryClient.invalidateQueries({ queryKey: ['payroll-policies'] }); setShowForm(false); resetForm(); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const updateMutation = useMutation({
    mutationFn: (d: PayrollPolicy) => api.updatePayrollPolicy(d.id!, d),
    onSuccess: () => { toast.success('Policy updated'); queryClient.invalidateQueries({ queryKey: ['payroll-policies'] }); setEditing(null); setShowForm(false); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deletePayrollPolicy,
    onSuccess: () => { toast.success('Policy deleted'); queryClient.invalidateQueries({ queryKey: ['payroll-policies'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const resetForm = () => setForm({
    name: '', pro_ration_method: 'paid_days', rounding_method: 'nearest',
    decimal_places: 2, round_net_salary: true, include_gratuity: false,
    gratuity_rate: 4.81, default_currency: 'INR', allow_negative_net: false,
  });

  const openEdit = (p: PayrollPolicy) => { setForm({ ...p }); setEditing(p); setShowForm(true); };

  const save = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (editing) updateMutation.mutate(form);
    else createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Payroll Policies</h2>
        <button onClick={() => { setEditing(null); resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Policy
        </button>
      </div>

      {showForm && (
        <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-4 bg-[var(--background)]">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Policy Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] focus:border-transparent outline-none" />
              <HelpText>A friendly name so you can identify this policy (e.g. "Standard India Monthly").</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Pro-ration Method</label>
              <select value={form.pro_ration_method} onChange={e => setForm({ ...form, pro_ration_method: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none">
                {proRationOptions.map((opt: { code: string; name: string }) => (
                  <option key={opt.code} value={opt.code}>{opt.name}</option>
                ))}
              </select>
              <HelpText>How a partial month is paid — e.g. by paid days worked, by calendar days, or no pro-ration (full pay).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Rounding Method</label>
              <select value={form.rounding_method} onChange={e => setForm({ ...form, rounding_method: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none">
                {roundingMethodOptions.map((opt: { code: string; name: string }) => (
                  <option key={opt.code} value={opt.code}>{opt.name}</option>
                ))}
              </select>
              <HelpText>How amounts are rounded (nearest / up / down) before they appear on the payslip.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Decimal Places</label>
              <input type="number" value={form.decimal_places} onChange={e => setForm({ ...form, decimal_places: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
              <HelpText>Number of decimals used for payroll amounts (usually 2).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Currency</label>
              <input value={form.default_currency} onChange={e => setForm({ ...form, default_currency: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
              <HelpText>ISO currency code for this policy (INR, USD, AED, GBP, etc.).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Gratuity Rate (%)</label>
              <input type="number" step="0.01" value={form.gratuity_rate} onChange={e => setForm({ ...form, gratuity_rate: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
              <HelpText>Monthly gratuity provision as % of basic — 4.81% equals the statutory 15 days per year.</HelpText>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.round_net_salary} onChange={e => setForm({ ...form, round_net_salary: e.target.checked })} className="rounded" />
              Round Net Salary
              <span className="text-[11px] text-[var(--text-tertiary)]">(round the final take-home to whole rupees)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.include_gratuity} onChange={e => setForm({ ...form, include_gratuity: e.target.checked })} className="rounded" />
              Include Gratuity
              <span className="text-[11px] text-[var(--text-tertiary)]">(add monthly gratuity provision to this policy's payslips)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.allow_negative_net} onChange={e => setForm({ ...form, allow_negative_net: e.target.checked })} className="rounded" />
              Allow Negative Net
              <span className="text-[11px] text-[var(--text-tertiary)]">(allow deductions to exceed earnings — normally disabled)</span>
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }}
              className="px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        null
      ) : (
        <div className="space-y-3">
          {(policies || []).length === 0 && !showForm && (
            <p className="text-sm text-[var(--text-disabled)] text-center py-8">No policies yet. Create one to get started.</p>
          )}
          {(policies || []).map(p => (
            <div key={p.id} className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-xl hover:bg-[var(--background)]">
              <div>
                <h4 className="font-medium text-[var(--text-primary)]">{p.name}</h4>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {p.pro_ration_method} &middot; {p.rounding_method} &middot; {p.decimal_places} decimals &middot; {p.default_currency}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(p)} className="p-2 text-[var(--text-tertiary)] hover:text-[var(--primary-blue)] hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => { if (confirm('Delete this policy?')) deleteMutation.mutate(p.id!); }} className="p-2 text-[var(--text-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Components ──

function ComponentsSection() {
  const queryClient = useQueryClient();
  const { data: componentTypeOptions = [] } = useMasterData('PAYROLL_COMPONENT_TYPE');
  const { data: calculationTypeOptions = [] } = useMasterData('PAYROLL_CALCULATION_TYPE');
  const { data: calculationBaseOptions = [] } = useMasterData('PAYROLL_COMPONENT_BASIS');
  const { data: policies } = useQuery({ queryKey: ['payroll-policies'], queryFn: api.getPayrollPolicies });
  const [selectedPolicy, setSelectedPolicy] = useState<number | undefined>();
  const { data: components, isLoading } = useQuery({
    queryKey: ['payroll-components', selectedPolicy],
    queryFn: () => api.getPayrollComponents(selectedPolicy),
    enabled: true,
  });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PayrollComponent | null>(null);
  const [form, setForm] = useState<PayrollComponent>({
    name: '', component_type: 'earning', calculation_type: 'percentage',
    calculation_base: 'basic', calculation_value: 0, apply_pro_ration: true,
    is_active: true, is_taxable: true, priority: 0,
  });

  const createMutation = useMutation({
    mutationFn: api.createPayrollComponent,
    onSuccess: () => { toast.success('Component created'); queryClient.invalidateQueries({ queryKey: ['payroll-components'] }); setShowForm(false); setEditing(null); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PayrollComponent }) => api.updatePayrollComponent(id, data),
    onSuccess: () => { toast.success('Component updated'); queryClient.invalidateQueries({ queryKey: ['payroll-components'] }); setShowForm(false); setEditing(null); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deletePayrollComponent,
    onSuccess: () => { toast.success('Component deleted'); queryClient.invalidateQueries({ queryKey: ['payroll-components'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const save = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (editing?.id) updateMutation.mutate({ id: editing.id, data: { ...form, payroll_policy_id: selectedPolicy } });
    else createMutation.mutate({ ...form, payroll_policy_id: selectedPolicy });
  };

  const openEdit = (c: PayrollComponent) => {
    setEditing(c);
    setForm({ ...c, payroll_policy_id: selectedPolicy });
    setShowForm(true);
  };

  const TYPE_COLORS: Record<string, string> = {
    earning: 'text-green-600 bg-green-50',
    deduction: 'text-red-600 bg-red-50',
    employer_contribution: 'text-purple-600 bg-purple-50',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Payroll Components</h2>
        <div className="flex gap-3 items-center">
          <SearchableSelect value={selectedPolicy === undefined ? 'all' : selectedPolicy} onChange={val => setSelectedPolicy(val === 'all' ? undefined : Number(val))}
            options={(policies || []).filter(p => p.id !== undefined).map(p => ({ id: p.id as number, name: p.name }))}
            placeholder="All Policies" allOption="All Policies" className="w-48" />
          <button onClick={() => { setEditing(null); setForm({ name: '', component_type: 'earning', calculation_type: 'percentage', calculation_base: 'basic', calculation_value: 0, apply_pro_ration: true, is_active: true, is_taxable: true, priority: 0 }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Component
          </button>
        </div>
      </div>

      {showForm && (
        <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-4 bg-[var(--background)]">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Short internal name, e.g. "HRA".</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Display Name</label>
              <input value={form.display_name || ''} onChange={e => setForm({ ...form, display_name: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Label shown on the payslip, e.g. "House Rent Allowance".</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Type</label>
              <select value={form.component_type} onChange={e => setForm({ ...form, component_type: e.target.value as PayrollComponent['component_type'] })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                {componentTypeOptions.map((opt: { code: string; name: string }) => (
                  <option key={opt.code} value={opt.code}>{opt.name}</option>
                ))}
              </select>
              <HelpText>Earning = added to pay. Deduction = subtracted from pay. Employer contribution = paid by company, shown separately.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Calculation Type</label>
              <select value={form.calculation_type} onChange={e => setForm({ ...form, calculation_type: e.target.value as PayrollComponent['calculation_type'] })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                {calculationTypeOptions.map((opt: { code: string; name: string }) => (
                  <option key={opt.code} value={opt.code}>{opt.name}</option>
                ))}
              </select>
              <HelpText>Percentage = % of the base. Fixed = a flat amount each month.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Calculation Base</label>
              <select value={form.calculation_base || 'basic'} onChange={e => setForm({ ...form, calculation_base: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                {calculationBaseOptions.map((opt: { code: string; name: string }) => (
                  <option key={opt.code} value={opt.code}>{opt.name}</option>
                ))}
              </select>
              <HelpText>The salary component the % is calculated on (usually Basic).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Value</label>
              <input type="number" step="0.01" value={form.calculation_value} onChange={e => setForm({ ...form, calculation_value: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>The % (e.g. 40) or fixed amount (e.g. 5000) for this component.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Max Cap</label>
              <input type="number" step="0.01" value={form.max_cap ?? ''} onChange={e => setForm({ ...form, max_cap: e.target.value ? +e.target.value : undefined })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Optional upper limit in ₹ the amount cannot exceed.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Min Cap</label>
              <input type="number" step="0.01" value={form.min_cap ?? ''} onChange={e => setForm({ ...form, min_cap: e.target.value ? +e.target.value : undefined })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Optional lower limit in ₹ the amount will not go below.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Priority</label>
              <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Order of calculation. Lower numbers are computed first.</HelpText>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.apply_pro_ration} onChange={e => setForm({ ...form, apply_pro_ration: e.target.checked })} className="rounded" />
              Apply Pro-ration
              <span className="text-[11px] text-[var(--text-tertiary)]">(reduce this amount for partial months / unpaid leave)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.is_taxable} onChange={e => setForm({ ...form, is_taxable: e.target.checked })} className="rounded" />
              Taxable
              <span className="text-[11px] text-[var(--text-tertiary)]">(counted when calculating income tax)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
              Active
              <span className="text-[11px] text-[var(--text-tertiary)]">(inactive components are not used in payroll)</span>
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editing ? 'Update Component' : 'Add Component'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        null
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-tertiary)] uppercase">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Calculation</th>
                <th className="pb-3 font-medium">Value</th>
                <th className="pb-3 font-medium">Cap</th>
                <th className="pb-3 font-medium">Priority</th>
                <th className="pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(components || []).length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-[var(--text-disabled)]">No components configured.</td></tr>
              )}
              {(components || []).map(c => (
                <tr key={c.id} className="border-b border-[#F1F5F9]">
                  <td className="py-3 font-medium text-[var(--text-primary)]">{c.name}</td>
                  <td className="py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[c.component_type] || 'text-gray-600 bg-gray-50'}`}>{c.component_type}</span></td>
                  <td className="py-3 text-[var(--text-secondary)]">{c.calculation_type}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{c.calculation_value}{c.calculation_type === 'percentage' ? '%' : ''}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{c.max_cap ? `₹${c.max_cap}` : '-'}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{c.priority}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--primary-blue)] rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Delete this component?')) deleteMutation.mutate(c.id!); }} className="p-1.5 text-[var(--text-disabled)] hover:text-red-600 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Statutory ──

function StatutorySection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: settings, isLoading } = useQuery({ queryKey: ['statutory-settings'], queryFn: api.getStatutorySettings });
  const { data: presets = [] } = useQuery({ queryKey: ['statutory-presets'], queryFn: api.getStatutoryPresets });
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  // Resolve the current organization robustly: stored user object -> /auth/me -> /organizations/{id}
  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => { try { const r = await api.get('/auth/me'); return r.data || null; } catch { return null; } },
    staleTime: 10 * 60 * 1000,
  });
  const orgId = user?.organizationId ?? me?.organizationId ?? null;
  const { data: orgInfo } = useQuery({
    queryKey: ['org-info', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      try { const r = await api.get(`/organizations/${orgId}`); return r.data || null; } catch { return null; }
    },
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
  });
  const orgName = (user?.organizationName || orgInfo?.name || orgInfo?.organizationName || orgInfo?.legal_name || me?.organizationName || 'Your Organization') as string;
  const { data: payrollSettings } = useQuery({ queryKey: ['settings-payroll'], queryFn: fetchPayrollSettings });
  const [form, setForm] = useState<StatutorySetting>({});
  const [loaded, setLoaded] = useState(false);
  const [presetScope, setPresetScope] = useState<'org' | 'company'>('org');
  const [presetCompany, setPresetCompany] = useState('');
  const [exemptions, setExemptions] = useState<Record<string, number>>({});
  const [exemptionsLoaded, setExemptionsLoaded] = useState(false);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxLoaded, setFxLoaded] = useState(false);

  const mutation = useMutation({
    mutationFn: api.upsertStatutorySettings,
    onSuccess: () => { toast.success('Statutory settings saved'); queryClient.invalidateQueries({ queryKey: ['statutory-settings'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const presetMut = useMutation({
    mutationFn: api.applyStatutoryPreset,
    onSuccess: (d: ApiMessage) => { toast.success(d.message || 'Country preset applied'); queryClient.invalidateQueries({ queryKey: ['statutory-settings'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed to apply preset')),
  });

  const exemptionsMut = useMutation({
    mutationFn: () => savePayrollSettings({ tax_exemptions: exemptions }),
    onSuccess: () => { toast.success('Old-regime exemptions saved'); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const fxMut = useMutation({
    mutationFn: () => savePayrollSettings({ currency_rates: fxRates }),
    onSuccess: () => { toast.success('FX rates saved'); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  if (!loaded && settings) {
    setForm(settings);
    setLoaded(true);
  }
  if (!exemptionsLoaded && payrollSettings?.tax_exemptions) {
    setExemptions(payrollSettings.tax_exemptions);
    setExemptionsLoaded(true);
  }
  if (!fxLoaded && payrollSettings?.currency_rates) {
    setFxRates(payrollSettings.currency_rates);
    setFxLoaded(true);
  }

  const set = (key: keyof StatutorySetting, val: boolean | number) => setForm({ ...form, [key]: val });
  const setEx = (key: string, val: number) => setExemptions({ ...exemptions, [key]: val });
  const setFx = (key: string, val: number) => setFxRates({ ...fxRates, [key]: val });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Statutory Settings</h2>
        <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 shrink-0" />
        <p>
          Settings here apply to <b>{orgName}</b> (your organization) unless you pick a <b>company</b> first.
          Companies (e.g. a UAE office under an Indian HQ) can run their own country's rules — choose the company,
          then choose the country preset to scope it to that office only.
        </p>
      </div>

      <SectionCard title="Country Preset (one-click defaults)" icon={Landmark}>
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-tertiary)]">
            One-click load of a country's statutory defaults (PF / ESI / PT / LWF / gratuity).
            Choose where to apply it first — your <b>organization</b> or a specific <b>company</b>.
          </p>

          {/* Scope selector: Organization vs Company */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPresetScope('org')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                presetScope === 'org'
                  ? 'border-[var(--primary-blue)] bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]'
                  : 'border-[var(--border-color)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span className="flex flex-col items-start leading-tight">
                <span className="font-semibold">{orgName}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-80">Organization</span>
              </span>
              {presetScope === 'org' && <CheckCircle2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setPresetScope('company')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                presetScope === 'company'
                  ? 'border-[var(--primary-blue)] bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]'
                  : 'border-[var(--border-color)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              <Landmark className="w-4 h-4" />
              <span className="flex flex-col items-start leading-tight">
                <span className="font-semibold">Company</span>
                <span className="text-[10px] uppercase tracking-wide opacity-80">One legal entity / office</span>
              </span>
              {presetScope === 'company' && <CheckCircle2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Company picker (only when Company scope is active) */}
          {presetScope === 'company' && (
            <div className="flex flex-col gap-1 max-w-md">
              <label className="text-[11px] font-medium text-[var(--text-tertiary)]">Company (this overrides the organization for this entity only)</label>
              <select
                className="px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white"
                value={presetCompany}
                onChange={(e) => setPresetCompany(e.target.value)}
                aria-label="Select company to apply the country preset to"
              >
                <option value="">Select company…</option>
                {(companies || []).map((c: { id: number; name: string; country?: string }) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.country ? ` — ${c.country}` : ''}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-[var(--text-tertiary)]">Other companies keep their own jurisdiction — perfect for a UAE office under an Indian HQ.</span>
            </div>
          )}

          {/* Country picker */}
          <div className="flex flex-col gap-1 max-w-md">
            <label className="text-[11px] font-medium text-[var(--text-tertiary)]">Country</label>
            <select
              className="px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-white"
              onChange={(e) => {
                const code = e.target.value;
                if (!code) return;
                if (presetScope === 'company' && !presetCompany) {
                  toast.error('Select a company first — or switch scope to Organization');
                  return;
                }
                presetMut.mutate([code, presetScope === 'company' ? { companyId: Number(presetCompany) } : undefined] as never);
              }}
              value="">
              <option value="">Select country…</option>
              {presets.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {presetScope === 'company'
                ? `Applies the selected country's defaults to the chosen company only.`
                : `Applies the selected country's defaults to ${orgName} (all employees).`}
            </span>
          </div>
        </div>
      </SectionCard>

      {isLoading ? (
        null
      ) : (
        <div className="space-y-8">
          <SectionCard title="Provident Fund (PF)" icon={ShieldCheck}>
            <div className="grid gap-4 md:grid-cols-4">
              <ToggleField label="Applicable" checked={form.pf_applicable ?? true} onChange={v => set('pf_applicable', v)} help="Turn PF deduction on/off for this scope. Off disables PF for all employees here." />
              <NumField label="Employee Rate (%)" value={form.pf_employee_rate ?? 12} onChange={v => set('pf_employee_rate', v)} suffix="%" help="% of basic salary deducted from the employee's pay (India default 12%)." />
              <NumField label="Employer Rate (%)" value={form.pf_employer_rate ?? 12} onChange={v => set('pf_employer_rate', v)} suffix="%" help="% of basic salary the company contributes (shown on the payslip)." />
              <NumField label="Max Monthly (₹)" value={form.pf_max_monthly ?? 1800} onChange={v => set('pf_max_monthly', v)} suffix="₹" help="Caps the employee's monthly PF contribution. ₹1,800 is the standard ceiling." />
              <NumField label="Min Basic for Exclusion (₹)" value={form.pf_min_basic_for_exclusion ?? 15000} onChange={v => set('pf_min_basic_for_exclusion', v)} suffix="₹" help="Employees whose basic salary exceeds this are excluded from mandatory PF (₹15,000 standard)." />
            </div>
          </SectionCard>

          <SectionCard title="Employee State Insurance (ESI)" icon={ShieldCheck}>
            <div className="grid gap-4 md:grid-cols-4">
              <ToggleField label="Applicable" checked={form.esi_applicable ?? true} onChange={v => set('esi_applicable', v)} help="Turn ESI deduction on/off for this scope." />
              <NumField label="Employee Rate (%)" value={form.esi_employee_rate ?? 0.75} onChange={v => set('esi_employee_rate', v)} suffix="%" help="% of gross deducted from the employee (India default 0.75%)." />
              <NumField label="Employer Rate (%)" value={form.esi_employer_rate ?? 3.25} onChange={v => set('esi_employer_rate', v)} suffix="%" help="% of gross the company contributes (India default 3.25%)." />
              <NumField label="Gross Ceiling (₹)" value={form.esi_gross_ceiling ?? 21000} onChange={v => set('esi_gross_ceiling', v)} suffix="₹" help="ESI applies only while monthly gross is at or below this ceiling (₹21,000 standard)." />
            </div>
          </SectionCard>

          <SectionCard title="Professional Tax (PT)" icon={ShieldCheck}>
            <div className="grid gap-4 md:grid-cols-3">
              <ToggleField label="Applicable" checked={form.pt_applicable ?? true} onChange={v => set('pt_applicable', v)} help="Turn professional tax on/off. When a registered state is set, the state's exact slab is auto-applied." />
              <NumField label="Monthly Amount (₹)" value={form.pt_monthly_amount ?? 200} onChange={v => set('pt_monthly_amount', v)} suffix="₹" help="Flat PT per month when no state slab is configured (fallback amount)." />
              <NumField label="Min Gross for PT (₹)" value={form.pt_min_gross ?? 10000} onChange={v => set('pt_min_gross', v)} suffix="₹" help="PT starts only when monthly gross is above this amount." />
            </div>
          </SectionCard>

          <SectionCard title="Labour Welfare Fund (LWF)" icon={ShieldCheck}>
            <div className="grid gap-4 md:grid-cols-3">
              <ToggleField label="Applicable" checked={form.lwf_applicable ?? false} onChange={v => set('lwf_applicable', v)} help="Turn LWF on/off. Auto-calculated from the registered state when configured." />
              <NumField label="Employee Rate (%)" value={form.lwf_employee_rate ?? 0} onChange={v => set('lwf_employee_rate', v)} suffix="%" help="% of basic deducted from the employee (fallback when no state slab exists)." />
              <NumField label="Employer Rate (%)" value={form.lwf_employer_rate ?? 0} onChange={v => set('lwf_employer_rate', v)} suffix="%" help="% of basic the company contributes." />
            </div>
          </SectionCard>

          <SectionCard title="Gratuity" icon={ShieldCheck}>
            <div className="grid gap-4 md:grid-cols-2">
              <ToggleField label="Applicable" checked={form.gratuity_applicable ?? false} onChange={v => set('gratuity_applicable', v)} help="Turn monthly gratuity provision on/off. Paid on exit after 5 years of service." />
              <NumField label="Rate (%)" value={form.gratuity_rate ?? 4.81} onChange={v => set('gratuity_rate', v)} suffix="%" help="4.81% = 15 days wages per year of service (statutory formula)." />
            </div>
          </SectionCard>

          <SectionCard title="Old-Regime Tax Exemptions (annual ₹)" icon={Landmark}>
            <p className="mb-3 text-xs text-[var(--text-tertiary)]">
              Annual amounts the employee can claim to reduce taxable income. Only used for employees on the old tax regime.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <NumField label="80C (PF/ELSS/LIC etc.)" value={exemptions['80c'] ?? 0} onChange={v => setEx('80c', v)} suffix="₹" help="Investments in PF, ELSS, LIC, PPF etc. Capped at ₹1.5L/year." />
              <NumField label="80D (Health insurance)" value={exemptions['80d'] ?? 0} onChange={v => setEx('80d', v)} suffix="₹" help="Medical insurance premiums. Capped at ₹50K/year (₹25K for self)." />
              <NumField label="HRA exemption" value={exemptions.hra ?? 0} onChange={v => setEx('hra', v)} suffix="₹" help="House rent allowance exemption (least of three statutory limits)." />
              <NumField label="LTA exemption" value={exemptions.lta ?? 0} onChange={v => setEx('lta', v)} suffix="₹" help="Leave travel allowance — typically 2 trips in 4 years." />
              <NumField label="NPS (80CCD)" value={exemptions.nps ?? 0} onChange={v => setEx('nps', v)} suffix="₹" help="National Pension Scheme contribution. Extra ₹50K above the 80C limit." />
              <NumField label="Home loan interest" value={exemptions.home_loan ?? 0} onChange={v => setEx('home_loan', v)} suffix="₹" help="Interest paid on a home loan for a self-occupied property. Capped at ₹2L." />
            </div>
            <div className="mt-4">
              <button onClick={() => exemptionsMut.mutate()} disabled={exemptionsMut.isPending}
                className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {exemptionsMut.isPending ? 'Saving…' : 'Save Exemptions'}
              </button>
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">Applied to employees on the old tax regime. 80C is capped at ₹1.5L, 80D at ₹50K.</p>
            </div>
          </SectionCard>

          <SectionCard title="Multi-Currency Reporting (FX rates)" icon={Landmark}>
            <p className="mb-3 text-xs text-[var(--text-tertiary)]">
              Value of 1 unit of your base currency in the target currency. Used to convert payroll summary totals.
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              {['USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'].map((code) => (
                <NumField key={code} label={code} value={fxRates[code] ?? 0} onChange={v => setFx(code, v)} help={`Amount of ${code} you get for 1 unit of base currency (e.g. 0.012 for INR→USD).`} />
              ))}
            </div>
            <div className="mt-4">
              <button onClick={() => fxMut.mutate()} disabled={fxMut.isPending}
                className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {fxMut.isPending ? 'Saving…' : 'Save FX Rates'}
              </button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">{children}</p>;
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3 bg-[var(--background)] hover:bg-[var(--hover-bg)]">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--primary-blue)]" />
          <span className="font-medium text-[var(--text-primary)] text-sm">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

function ToggleField({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded" />
        {label}
      </label>
      {help && <p className="mt-1 ml-5 text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</p>}
    </div>
  );
}

function NumField({ label, value, onChange, help, suffix }: { label: string; value: number; onChange: (v: number) => void; help?: string; suffix?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">{label}</label>
      <div className="relative">
        <input type="number" step="0.01" value={value} onChange={e => onChange(+e.target.value)}
          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
          aria-label={label} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-tertiary)]">{suffix}</span>}
      </div>
      {help && <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</p>}
    </div>
  );
}

// ── Tax Regimes ──

function TaxRegimesSection() {
  const queryClient = useQueryClient();
  const { data: regimeTypeOptions = [] } = useMasterData('TAX_REGIME_TYPE');
  const { data: regimes, isLoading } = useQuery({ queryKey: ['tax-regimes'], queryFn: api.getTaxRegimes });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxRegime | null>(null);
  const [form, setForm] = useState<TaxRegime>({
    name: '', regime_type: 'new', financial_year: '2025-26',
    standard_deduction: 50000, rebate_threshold: 700000,
    rebate_amount: 0, cess_rate: 4,
    surcharge_config: [],
  });
  const [slabForm, setSlabForm] = useState<TaxSlab>({ from_amount: 0, rate: 0 });
  const [regimeSlabs, setRegimeSlabs] = useState<{ [key: number]: boolean }>({});

  const resetForm = () => {
    setForm({
      name: '', regime_type: 'new', financial_year: '2025-26',
      standard_deduction: 50000, rebate_threshold: 700000,
      rebate_amount: 0, cess_rate: 4,
      surcharge_config: [],
    });
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: (d: TaxRegime) => d.id ? api.updateTaxRegime(d.id, d) : api.createTaxRegime(d),
    onSuccess: () => {
      toast.success(editing ? 'Tax regime updated' : 'Tax regime created');
      queryClient.invalidateQueries({ queryKey: ['tax-regimes'] });
      setShowForm(false); resetForm();
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteTaxRegime,
    onSuccess: () => { toast.success('Regime deleted'); queryClient.invalidateQueries({ queryKey: ['tax-regimes'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const addSlabMutation = useMutation({
    mutationFn: (d: { regimeId: number; slab: TaxSlab }) => api.addTaxSlab(d.regimeId, d.slab),
    onSuccess: () => { toast.success('Slab added'); queryClient.invalidateQueries({ queryKey: ['tax-regimes'] }); setSlabForm({ from_amount: 0, rate: 0 }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const delSlabMutation = useMutation({
    mutationFn: api.deleteTaxSlab,
    onSuccess: () => { toast.success('Slab deleted'); queryClient.invalidateQueries({ queryKey: ['tax-regimes'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const surchargeList = Array.isArray(form.surcharge_config) ? form.surcharge_config as Array<{ from?: number; rate?: number }> : [];

  const setSurcharge = (list: Array<{ from?: number; rate?: number }>) => setForm({ ...form, surcharge_config: list });
  const updateSurchargeRow = (idx: number, field: 'from' | 'rate', val: number) => {
    const next = surchargeList.map((s, i) => i === idx ? { ...s, [field]: val } : s);
    setSurcharge(next);
  };

  const openEdit = (r: TaxRegime) => {
    setForm({ ...r, surcharge_config: Array.isArray(r.surcharge_config) ? r.surcharge_config : [] });
    setEditing(r); setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Tax Regimes</h2>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Regime
        </button>
      </div>

      {showForm && (
        <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-4 bg-[var(--background)]">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Regime Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>e.g. "New Regime FY 2025-26".</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Type</label>
              <select value={form.regime_type} onChange={e => setForm({ ...form, regime_type: e.target.value as TaxRegime['regime_type'] })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                {regimeTypeOptions.map((opt: { code: string; name: string }) => (
                  <option key={opt.code} value={opt.code}>{opt.name}</option>
                ))}
              </select>
              <HelpText>New regime = lower rates, few exemptions. Old regime = higher rates, many exemptions.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Financial Year</label>
              <input value={form.financial_year} onChange={e => setForm({ ...form, financial_year: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Indian FY format, e.g. "2025-26".</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Standard Deduction (₹)</label>
              <input type="number" value={form.standard_deduction} onChange={e => setForm({ ...form, standard_deduction: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Flat annual deduction from taxable income (₹50,000 standard).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Rebate Threshold (₹)</label>
              <input type="number" value={form.rebate_threshold} onChange={e => setForm({ ...form, rebate_threshold: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Income up to this amount pays no tax (₹7,00,000 new regime).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Rebate Amount (₹)</label>
              <input type="number" value={form.rebate_amount} onChange={e => setForm({ ...form, rebate_amount: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Tax waived for incomes at/below the threshold (usually ₹25,000).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Cess Rate (%)</label>
              <input type="number" step="0.1" value={form.cess_rate} onChange={e => setForm({ ...form, cess_rate: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Health & education cess on the tax amount (4% standard).</HelpText>
            </div>
            <div className="md:col-span-3 flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input type="checkbox" checked={!!form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} className="rounded" />
                Set as default regime (applied to employees without an explicit regime)
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-[var(--text-tertiary)]">Surcharge Slabs (income ≥ threshold)</label>
              <button type="button" onClick={() => setSurcharge([...surchargeList, { from: 0, rate: 0 }])}
                className="text-xs font-medium text-[var(--primary-blue)] hover:underline">+ Add Surcharge Slab</button>
            </div>
            {surchargeList.length === 0 && (
              <p className="text-xs text-[var(--text-disabled)]">No surcharge — leave empty to skip.</p>
            )}
            <div className="space-y-2">
              {surchargeList.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="number" placeholder="Income from (₹)" value={s.from ?? ''} onChange={e => updateSurchargeRow(idx, 'from', +e.target.value)}
                    className="flex-1 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
                  <input type="number" step="0.1" placeholder="Rate (%)" value={s.rate ?? ''} onChange={e => updateSurchargeRow(idx, 'rate', +e.target.value)}
                    className="w-32 px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
                  <button type="button" onClick={() => setSurcharge(surchargeList.filter((_, i) => i !== idx))}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Remove slab">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}
              className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving...' : editing ? 'Update Regime' : 'Create Regime'}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        null
      ) : (
        <div className="space-y-4">
          {(regimes || []).length === 0 && <p className="text-sm text-[var(--text-disabled)] text-center py-8">No tax regimes configured.</p>}
          {(regimes || []).map(r => (
            <div key={r.id} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-[var(--background)]">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-[var(--text-primary)]">{r.name}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-[var(--primary-blue)]">{r.regime_type}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{r.financial_year}</span>
                  {r.is_default && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">Default</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(r)}
                    className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--primary-blue)] rounded" title="Edit regime"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => { if (confirm('Delete this regime?')) deleteMutation.mutate(r.id!); }}
                    className="p-1.5 text-[var(--text-disabled)] hover:text-red-600 rounded" title="Delete regime"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="p-5">
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Tax Slabs</h4>
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-tertiary)]">
                      <th className="pb-2 font-medium">From (₹)</th>
                      <th className="pb-2 font-medium">To (₹)</th>
                      <th className="pb-2 font-medium">Rate (%)</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(r.slabs || []).map((s, sIdx) => (
                      <tr key={s.id ?? `slab-${r.id}-${sIdx}`} className="border-b border-[#F1F5F9]">
                        <td className="py-2 text-[var(--text-secondary)]">{s.from_amount?.toLocaleString()}</td>
                        <td className="py-2 text-[var(--text-secondary)]">{s.to_amount ? s.to_amount?.toLocaleString() : '∞'}</td>
                        <td className="py-2 text-[var(--text-secondary)]">{s.rate}%</td>
                        <td className="py-2">
                          <button onClick={() => { if (confirm('Delete slab?')) delSlabMutation.mutate(s.id!); }}
                            className="p-1 text-[var(--text-disabled)] hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">From</label>
                    <input type="number" value={slabForm.from_amount} onChange={e => setSlabForm({ ...slabForm, from_amount: +e.target.value })}
                      className="w-24 px-2 py-1.5 border border-[var(--border-color)] rounded text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">To (blank=∞)</label>
                    <input type="number" value={slabForm.to_amount ?? ''} onChange={e => setSlabForm({ ...slabForm, to_amount: e.target.value ? +e.target.value : undefined })}
                      className="w-24 px-2 py-1.5 border border-[var(--border-color)] rounded text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[var(--text-tertiary)] mb-1">Rate %</label>
                    <input type="number" step="0.1" value={slabForm.rate} onChange={e => setSlabForm({ ...slabForm, rate: +e.target.value })}
                      className="w-20 px-2 py-1.5 border border-[var(--border-color)] rounded text-sm outline-none" />
                  </div>
                  <button onClick={() => addSlabMutation.mutate({ regimeId: r.id!, slab: slabForm })}
                    disabled={addSlabMutation.isPending}
                    className="px-3 py-1.5 bg-[var(--primary-blue)] text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                    Add Slab
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Attendance Policy ──

function AttendancePolicySection() {
  const queryClient = useQueryClient();
  const { data: workingDaysOptions = [] } = useMasterData('WORKING_DAYS_PER_WEEK');
  const { data: policies, isLoading } = useQuery({ queryKey: ['attendance-policies'], queryFn: api.getAttendancePolicies });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AttendancePolicy | null>(null);
  const [form, setForm] = useState<AttendancePolicy>({
    name: '', working_days_per_week: 6, working_days: '1,2,3,4,5,6', half_day_as_full_paid: true,
    paid_leave_as_present: true, holiday_as_present: true,
    overtime_threshold_hours: 8, overtime_rate: 1.5,
    late_mark_threshold_minutes: 15, half_day_threshold_hours: 4,
  });

  const createMutation = useMutation({
    mutationFn: api.createAttendancePolicy,
    onSuccess: () => { toast.success('Policy created'); queryClient.invalidateQueries({ queryKey: ['attendance-policies'] }); setShowForm(false); resetForm(); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const updateMutation = useMutation({
    mutationFn: (d: AttendancePolicy) => api.updateAttendancePolicy(d.id!, d),
    onSuccess: () => { toast.success('Policy updated'); queryClient.invalidateQueries({ queryKey: ['attendance-policies'] }); setEditing(null); setShowForm(false); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteAttendancePolicy,
    onSuccess: () => { toast.success('Policy deleted'); queryClient.invalidateQueries({ queryKey: ['attendance-policies'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed')),
  });

  const resetForm = () => setForm({
    name: '', working_days_per_week: 6, working_days: '1,2,3,4,5,6', half_day_as_full_paid: true,
    paid_leave_as_present: true, holiday_as_present: true,
    overtime_threshold_hours: 8, overtime_rate: 1.5,
    late_mark_threshold_minutes: 15, half_day_threshold_hours: 4,
  });

  const openEdit = (p: AttendancePolicy) => { setForm({ ...p }); setEditing(p); setShowForm(true); };

  const save = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (editing) updateMutation.mutate(form);
    else createMutation.mutate(form);
  };

  const WEEKDAYS = [
    { day: 0, label: 'Sun' }, { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' },
    { day: 3, label: 'Wed' }, { day: 4, label: 'Thu' }, { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' },
  ];
  const workingDaysSet = new Set((form.working_days || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number));

  const toggleWorkingDay = (day: number) => {
    const next = new Set(workingDaysSet);
    if (next.has(day)) next.delete(day); else next.add(day);
    const days = WEEKDAYS.filter((w) => next.has(w.day)).map((w) => w.day);
    setForm({ ...form, working_days: days.join(','), working_days_per_week: days.length });
  };

  const setWorkingDaysPerWeek = (n: number) => {
    const order = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
    const days = order.slice(0, Math.min(7, Math.max(0, n)));
    setForm({ ...form, working_days_per_week: n, working_days: days.join(',') });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Attendance Policies</h2>
        <button onClick={() => { setEditing(null); resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Policy
        </button>
      </div>

      {showForm && (
        <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-4 bg-[var(--background)]">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Policy Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>A name for this attendance rule (e.g. "Standard 5-day").</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Working Days/Week</label>
              <select value={workingDaysSet.size || ''} onChange={e => setWorkingDaysPerWeek(+e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                <option value="">Select</option>
                {(workingDaysOptions || []).map((opt: any) => (
                  <option key={opt.code || opt.value} value={+(opt.code ?? opt.value)}>{(opt.name || opt.label)}</option>
                ))}
              </select>
              <HelpText>How many days per week count as working (6 = Mon–Sat).</HelpText>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-2">
                Working Days <span className="font-normal text-[var(--text-disabled)]">(tap to toggle; e.g. include Sun for 7-day / works-every-day schedules)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((w) => {
                  const active = workingDaysSet.has(w.day);
                  return (
                    <button
                      key={w.day}
                      type="button"
                      onClick={() => toggleWorkingDay(w.day)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                        active
                          ? 'border-[var(--primary-blue)] bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]'
                          : 'border-[var(--border-color)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <HelpText>Weekends you mark OFF are excluded from pay-day counts (a holiday on a weekend is not deducted).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Late Mark Threshold (min)</label>
              <input type="number" value={form.late_mark_threshold_minutes} onChange={e => setForm({ ...form, late_mark_threshold_minutes: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Arrival later than this many minutes counts as a late mark.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Half-day Threshold (hrs)</label>
              <input type="number" step="0.5" value={form.half_day_threshold_hours} onChange={e => setForm({ ...form, half_day_threshold_hours: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Hours worked below this counts as a half day (partial pay).</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">OT Threshold (hrs)</label>
              <input type="number" step="0.5" value={form.overtime_threshold_hours} onChange={e => setForm({ ...form, overtime_threshold_hours: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Hours beyond this per day count as overtime.</HelpText>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">OT Rate (×)</label>
              <input type="number" step="0.1" value={form.overtime_rate} onChange={e => setForm({ ...form, overtime_rate: +e.target.value })}
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <HelpText>Multiplier for overtime hours (1.5 = time-and-a-half).</HelpText>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.half_day_as_full_paid} onChange={e => setForm({ ...form, half_day_as_full_paid: e.target.checked })} className="rounded" />
              Half-day as Full Paid
              <span className="text-[11px] text-[var(--text-tertiary)]">(pay the full day even if only half is worked)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.paid_leave_as_present} onChange={e => setForm({ ...form, paid_leave_as_present: e.target.checked })} className="rounded" />
              Paid Leave as Present
              <span className="text-[11px] text-[var(--text-tertiary)]">(approved paid leave = a paid day)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.holiday_as_present} onChange={e => setForm({ ...form, holiday_as_present: e.target.checked })} className="rounded" />
              Holiday as Present
              <span className="text-[11px] text-[var(--text-tertiary)]">(holidays on a working day are paid)</span>
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        null
      ) : (
        <div className="space-y-3">
          {(policies || []).length === 0 && !showForm && (
            <p className="text-sm text-[var(--text-disabled)] text-center py-8">No attendance policies yet.</p>
          )}
          {(policies || []).map(p => (
            <div key={p.id} className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-xl hover:bg-[var(--background)]">
              <div>
                <h4 className="font-medium text-[var(--text-primary)]">{p.name}</h4>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {p.working_days_per_week} days/wk ({['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].filter((_, i) => (p.working_days || '').split(',').map(s => s.trim()).filter(Boolean).includes(String(i))).join(', ') || '—'}) &middot; Late after {p.late_mark_threshold_minutes}min &middot; OT at {p.overtime_rate}× after {p.overtime_threshold_hours}h
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(p)} className="p-2 text-[var(--text-tertiary)] hover:text-[var(--primary-blue)] hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => { if (confirm('Delete this policy?')) deleteMutation.mutate(p.id!); }} className="p-2 text-[var(--text-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── State Compliance ──

function StateComplianceSection() {
  const { data: states, isLoading: statesLoading } = useQuery({ queryKey: ['compliance-states'], queryFn: api.getComplianceStates });
  const [selectedState, setSelectedState] = useState('');
  const [ptResult, setPtResult] = useState<PTResult | null>(null);
  const [lwfResult, setLwfResult] = useState<{ employee_contribution: number; employer_contribution: number; frequency: string } | null>(null);
  const [salary, setSalary] = useState(25000);
  const [stateDetail, setStateDetail] = useState<{ pt?: PTDetail | null; lwf?: LWFDetail | null }>({});

  const setStateMutation = useMutation({
    mutationFn: api.setOrgState,
    onSuccess: (data: ApiMessage) => toast.success(data?.message || 'State updated'),
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Failed to set state')),
  });

  const loadStateDetail = async (code: string) => {
    if (!code) return;
    try {
      const [pt, lwf] = await Promise.all([
        api.getStatePT(code).catch(() => null),
        api.getStateLWF(code).catch(() => null),
      ]);
      setStateDetail({ pt, lwf });
    } catch { /* ignore */ }
  };

  const doCalculate = async () => {
    if (!selectedState) { toast.error('Select a state first'); return; }
    const stateCode = states?.find(s => s.state_name === selectedState)?.code || selectedState;
    try {
      const pt = await api.calculatePT(salary, stateCode);
      setPtResult(pt);
      const lwf = await api.calculateLWF(salary, stateCode);
      setLwfResult(lwf);
    } catch (e: unknown) {
      toast.error(getApiErrorMessage(e, 'Calculation failed'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">State Compliance</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          Set your organization's registered state for automatic PT and LWF calculation during payroll runs.
        </p>
      </div>

      <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-4">
        <h3 className="font-medium text-[var(--text-primary)] text-sm">Set Organization State</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Registered State</label>
            <select value={selectedState} onChange={e => { setSelectedState(e.target.value); loadStateDetail(e.target.value); }}
              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
              <option value="">-- Select State --</option>
              {(states || []).map(s => (
                <option key={s.code} value={s.state_name}>{s.state_name} {s.has_pt ? '(PT)' : ''} {s.has_lwf ? '(LWF)' : ''}</option>
              ))}
            </select>
            <HelpText>Your registered office state. PT and LWF are calculated from this during payroll.</HelpText>
          </div>
          <button onClick={() => setStateMutation.mutate(selectedState)} disabled={!selectedState || setStateMutation.isPending}
            className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {setStateMutation.isPending ? 'Saving...' : 'Set State'}
          </button>
        </div>
      </div>

      {stateDetail.pt && (
        <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-3">
          <h3 className="font-medium text-[var(--text-primary)] text-sm">{stateDetail.pt.state_name} — Professional Tax Slabs</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-tertiary)]">
                <th className="pb-2 font-medium">Gross From</th>
                <th className="pb-2 font-medium">Gross To</th>
                <th className="pb-2 font-medium">PT Amount</th>
                <th className="pb-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {(stateDetail.pt.slabs || []).map((slab: PTResultSlab, i: number) => (
                <tr key={i} className="border-b border-[#F1F5F9]">
                  <td className="py-2 text-[var(--text-secondary)]">₹{slab.from_gross?.toLocaleString()}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{slab.to_gross ? `₹${slab.to_gross?.toLocaleString()}` : '∞'}</td>
                  <td className="py-2 font-medium text-[var(--text-primary)]">₹{slab.amount}</td>
                  <td className="py-2 text-xs text-[var(--text-tertiary)]">{slab.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[var(--text-tertiary)]">Annual max: ₹{stateDetail.pt.annual_max?.toLocaleString()} &middot; {stateDetail.pt.notes}</p>
        </div>
      )}

      {stateDetail.lwf?.applicable && (
        <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-2">
          <h3 className="font-medium text-[var(--text-primary)] text-sm">{stateDetail.lwf.state_name} — Labour Welfare Fund</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-[var(--text-tertiary)]">Employee:</span> <span className="font-medium">₹{stateDetail.lwf.employee_contribution}/{stateDetail.lwf.frequency === 'half_yearly' ? 'half-yearly' : 'month'}</span></div>
            <div><span className="text-[var(--text-tertiary)]">Employer:</span> <span className="font-medium">₹{stateDetail.lwf.employer_contribution}/{stateDetail.lwf.frequency === 'half_yearly' ? 'half-yearly' : 'month'}</span></div>
            <div><span className="text-[var(--text-tertiary)]">Wage ceiling:</span> <span className="font-medium">₹{stateDetail.lwf.max_wage_for_applicability?.toLocaleString()}</span></div>
          </div>
        </div>
      )}

      <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-4">
        <h3 className="font-medium text-[var(--text-primary)] text-sm">PT/LWF Calculator</h3>
        <p className="text-xs text-[var(--text-tertiary)]">See what PT and LWF would be for a given salary in the selected state.</p>
        <div className="flex gap-3 items-end">
          <div className="w-48">
            <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Monthly Gross Salary (₹)</label>
            <input type="number" value={salary} onChange={e => setSalary(+e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]" />
            <HelpText>Enter an employee's monthly gross to preview their PT and LWF.</HelpText>
          </div>
          <button onClick={doCalculate}
            className="px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Calculate
          </button>
        </div>

        {ptResult && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="bg-[var(--background)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-tertiary)]">Monthly PT</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">₹{ptResult.monthly_pt}</p>
            </div>
            <div className="bg-[var(--background)] rounded-lg p-3">
              <p className="text-xs text-[var(--text-tertiary)]">Annual PT</p>
              <p className="text-xl font-bold text-[var(--text-primary)]">₹{ptResult.annual_pt}</p>
            </div>
            {lwfResult && (
              <>
                <div className="bg-[var(--background)] rounded-lg p-3">
                  <p className="text-xs text-[var(--text-tertiary)]">LWF Employee</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">₹{lwfResult.employee_contribution}</p>
                </div>
                <div className="bg-[var(--background)] rounded-lg p-3">
                  <p className="text-xs text-[var(--text-tertiary)]">LWF Employer</p>
                  <p className="text-xl font-bold text-[var(--text-primary)]">₹{lwfResult.employer_contribution}</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

