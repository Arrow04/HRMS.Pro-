import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Loader2, X, CalendarDays, SlidersHorizontal,
  ChevronDown, ChevronUp, FileText, Save, CheckCircle2, Building2,
  MapPin, Clock, Wallet, Download, Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import SectionCard from './SectionCard';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface ApiErrorLike { response?: { data?: { detail?: string } } }
function errMsg(err: unknown, fallback: string) {
  return (err as ApiErrorLike | null)?.response?.data?.detail || fallback;
}

const LEAVE_CATEGORIES = [
  { id: 'paid', name: 'Paid' },
  { id: 'unpaid', name: 'Unpaid' },
  { id: 'restricted', name: 'Restricted' },
  { id: 'paternity', name: 'Paternity' },
];

const APPLICABLE_TO = [
  { id: 'all', name: 'All Employees' },
  { id: 'department', name: 'By Department' },
  { id: 'designation', name: 'By Designation' },
  { id: 'grade', name: 'By Grade' },
];

const ACCRUAL_METHODS = [
  { id: 'monthly', name: 'Monthly' },
  { id: 'yearly', name: 'Yearly (Front-loaded)' },
  { id: 'quarterly', name: 'Quarterly' },
  { id: 'front-loaded', name: 'Front-loaded (Annual)' },
];

const LAPSE_OPTIONS = [
  { id: 'dec-31', name: 'December 31' },
  { id: 'mar-31', name: 'March 31' },
  { id: 'custom', name: 'Custom Date' },
];

const CF_EXPIRY_OPTIONS = [
  { id: 'quarter', name: 'End of Quarter' },
  { id: 'half-year', name: 'End of Half-Year' },
  { id: 'year', name: 'End of Year' },
  { id: 'none', name: 'No Expiry' },
];

const ENCASHMENT_FREQUENCY = [
  { id: 'annual', name: 'Annual' },
  { id: 'exit-only', name: 'At Exit Only' },
  { id: 'both', name: 'Both' },
];

const HOLIDAY_TYPES = [
  { id: 'national', name: 'National' },
  { id: 'optional', name: 'Optional' },
  { id: 'restricted', name: 'Restricted' },
];

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Chandigarh', 'Puducherry',
];

interface LeaveType {
  id?: number;
  name: string;
  code: string;
  days_per_year: number;
  category: string;
  active: boolean;
}

interface LeavePolicyLeaveType {
  leave_type_id: number;
  leave_type_name: string;
  custom_days: number | null;
  carry_forward: boolean;
  encashment_eligible: boolean;
}

interface LeavePolicy {
  id?: number;
  name: string;
  description: string;
  applicable_to: string;
  leave_types: LeavePolicyLeaveType[];
}

interface AccrualRule {
  accrual_method: string;
  accrual_day: number;
  probation_accrual: boolean;
  probation_accrual_rate: number;
  max_balance_cap: number | null;
  lapse_unused: boolean;
  lapse_date: string;
}

interface CarryForward {
  enabled: boolean;
  max_days: number;
  expiry: string;
  applicable_leave_types: number[];
  use_it_or_lose_it: boolean;
}

interface EncashmentRule {
  enabled: boolean;
  min_balance_required: number;
  encashment_rate: number;
  applicable_leave_types: number[];
  tax_on_encashment: boolean;
  frequency: string;
}

interface Holiday {
  id?: number;
  name: string;
  date: string;
  type: string;
  applicable_states: string[];
}

interface HolidayCalendar {
  holidays: Holiday[];
  optional_holiday_limit: number;
  auto_apply_national: boolean;
}

interface WizardState {
  leaveTypes: LeaveType[];
  leavePolicies: LeavePolicy[];
  accrualRule: AccrualRule;
  carryForward: CarryForward;
  encashmentRule: EncashmentRule;
  holidayCalendar: HolidayCalendar;
}

function defaultLeaveTypes(): LeaveType[] {
  return [
    { name: 'Casual Leave', code: 'CL', days_per_year: 12, category: 'paid', active: true },
    { name: 'Sick Leave', code: 'SL', days_per_year: 6, category: 'paid', active: true },
    { name: 'Earned Leave', code: 'EL', days_per_year: 15, category: 'paid', active: true },
    { name: 'Maternity Leave', code: 'ML', days_per_year: 182, category: 'paid', active: true },
    { name: 'Paternity Leave', code: 'PT', days_per_year: 5, category: 'paternity', active: true },
    { name: 'Comp Off', code: 'CO', days_per_year: 0, category: 'paid', active: true },
    { name: 'LWP', code: 'LWP', days_per_year: 0, category: 'unpaid', active: true },
  ];
}

function defaultAccrual(): AccrualRule {
  return {
    accrual_method: 'monthly',
    accrual_day: 1,
    probation_accrual: true,
    probation_accrual_rate: 50,
    max_balance_cap: 30,
    lapse_unused: true,
    lapse_date: 'dec-31',
  };
}

function defaultCarryForward(): CarryForward {
  return {
    enabled: true,
    max_days: 10,
    expiry: 'quarter',
    applicable_leave_types: [],
    use_it_or_lose_it: true,
  };
}

function defaultEncashment(): EncashmentRule {
  return {
    enabled: false,
    min_balance_required: 10,
    encashment_rate: 0,
    applicable_leave_types: [],
    tax_on_encashment: false,
    frequency: 'annual',
  };
}

function defaultHolidayCalendar(): HolidayCalendar {
  return {
    holidays: [
      { name: 'Republic Day', date: '2026-01-26', type: 'national', applicable_states: [] },
      { name: 'Independence Day', date: '2026-08-15', type: 'national', applicable_states: [] },
      { name: 'Gandhi Jayanti', date: '2026-10-02', type: 'national', applicable_states: [] },
      { name: 'Christmas', date: '2026-12-25', type: 'national', applicable_states: [] },
    ],
    optional_holiday_limit: 2,
    auto_apply_national: true,
  };
}

function blankWizard(): WizardState {
  return {
    leaveTypes: defaultLeaveTypes(),
    leavePolicies: [],
    accrualRule: defaultAccrual(),
    carryForward: defaultCarryForward(),
    encashmentRule: defaultEncashment(),
    holidayCalendar: defaultHolidayCalendar(),
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

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" className={inputCls} value={value} onChange={e => onChange(e.target.value)} />;
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

function MultiStateSelect({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const toggle = (state: string) => {
    if (values.includes(state)) onChange(values.filter(s => s !== state));
    else onChange([...values, state]);
  };
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={`${inputCls} text-left flex items-center justify-between`}>
        <span className="truncate text-sm">{values.length ? `${values.length} state(s) selected` : 'All states'}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-[var(--border-color)] rounded-lg shadow-lg">
          {STATES.map(s => (
            <label key={s} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover-bg)] cursor-pointer">
              <input type="checkbox" checked={values.includes(s)} onChange={() => toggle(s)} className="rounded" />
              <span className="text-xs text-[var(--text-secondary)]">{s}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Leave Types Tab ──

function LeaveTypesTab({ types, onChange }: { types: LeaveType[]; onChange: (t: LeaveType[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<LeaveType>({ name: '', code: '', days_per_year: 0, category: 'paid', active: true });

  const startAdd = () => {
    setEditing(-1);
    setForm({ name: '', code: '', days_per_year: 0, category: 'paid', active: true });
  };
  const startEdit = (i: number) => { setEditing(i); setForm({ ...types[i] }); };
  const cancel = () => { setEditing(null); };
  const save = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.code.trim()) { toast.error('Code is required'); return; }
    const next = [...types];
    if (editing === -1) next.push({ ...form });
    else next[editing] = { ...form };
    onChange(next);
    setEditing(null);
    toast.success(editing === -1 ? 'Leave type added' : 'Leave type updated');
  };
  const remove = (i: number) => {
    onChange(types.filter((_, idx) => idx !== i));
    toast.success('Leave type removed');
  };

  return (
    <div className="space-y-4">
      <WizardSectionCard title="Leave Types" icon={CalendarDays}>
        <p className="text-xs text-[var(--text-tertiary)]">
          Define all leave types available in your organization. Each type has a code, annual allocation, and category.
        </p>
        {editing !== null && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Leave Name" help="Display name shown to employees.">
                <TextInput value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="e.g. Casual Leave" />
              </Field>
              <Field label="Code" help="Short code, e.g. CL, SL, EL.">
                <TextInput value={form.code} onChange={v => setForm({ ...form, code: v })} placeholder="e.g. CL" />
              </Field>
              <Field label="Days per Year" help="Annual allocation. 0 for unlimited or earned.">
                <NumInput value={form.days_per_year} onChange={v => setForm({ ...form, days_per_year: v ?? 0 })} />
              </Field>
              <Field label="Category" help="Paid, Unpaid, Restricted, or Paternity.">
                <SearchableSelect value={form.category} onChange={v => setForm({ ...form, category: String(v) })} placeholder="Select" options={LEAVE_CATEGORIES} showAllOption={false} />
              </Field>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Toggle label="Active" checked={form.active} onChange={v => setForm({ ...form, active: v })} />
              <div className="flex-1" />
              <button onClick={cancel} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={save} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">Save</button>
            </div>
          </div>
        )}
        <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--background)]">
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Code</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Days/Year</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Category</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Status</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((lt, i) => (
                <tr key={i} className="border-b border-[#F1F5F9] hover:bg-[var(--hover-bg)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{lt.name}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{lt.code}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{lt.days_per_year}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      lt.category === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                      lt.category === 'unpaid' ? 'bg-rose-50 text-rose-600' :
                      lt.category === 'restricted' ? 'bg-amber-50 text-amber-600' :
                      'bg-blue-50 text-blue-600'
                    }`}>{lt.category}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${lt.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {lt.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(i)} className="p-1.5 rounded-lg hover:bg-blue-50 text-[var(--primary-blue)]"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {types.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--text-disabled)]">No leave types configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {editing === null && (
          <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--primary-blue)] hover:bg-blue-50 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Leave Type
          </button>
        )}
      </WizardSectionCard>
    </div>
  );
}

// ── Leave Policies Tab ──

function LeavePoliciesTab({ policies, leaveTypes, onChange }: { policies: LeavePolicy[]; leaveTypes: LeaveType[]; onChange: (p: LeavePolicy[]) => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<LeavePolicy>({ name: '', description: '', applicable_to: 'all', leave_types: [] });

  const startAdd = () => {
    setEditing(-1);
    setForm({ name: '', description: '', applicable_to: 'all', leave_types: leaveTypes.map(lt => ({ leave_type_id: 0, leave_type_name: lt.name, custom_days: lt.days_per_year, carry_forward: false, encashment_eligible: false })) });
  };
  const startEdit = (i: number) => { setEditing(i); setForm({ ...policies[i] }); };
  const cancel = () => { setEditing(null); };
  const save = () => {
    if (!form.name.trim()) { toast.error('Policy name is required'); return; }
    const next = [...policies];
    if (editing === -1) next.push({ ...form });
    else next[editing] = { ...form };
    onChange(next);
    setEditing(null);
    toast.success(editing === -1 ? 'Policy created' : 'Policy updated');
  };
  const remove = (i: number) => {
    onChange(policies.filter((_, idx) => idx !== i));
    toast.success('Policy deleted');
  };

  const setPolicyLT = (pi: number, lti: number, patch: Partial<LeavePolicyLeaveType>) => {
    const next = [...form.leave_types];
    next[lti] = { ...next[lti], ...patch };
    setForm({ ...form, leave_types: next });
  };

  return (
    <div className="space-y-4">
      <WizardSectionCard title="Leave Policies" icon={FileText}>
        <p className="text-xs text-[var(--text-tertiary)]">
          Create policy templates that assign leave types to employee groups. Each policy defines which leaves are available, custom days, and rules.
        </p>
        {editing !== null && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Policy Name" help="Internal label for this policy.">
                <TextInput value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="e.g. Full-Time India" />
              </Field>
              <Field label="Applicable To" help="Who this policy applies to.">
                <SearchableSelect value={form.applicable_to} onChange={v => setForm({ ...form, applicable_to: String(v) })} placeholder="Select" options={APPLICABLE_TO} showAllOption={false} />
              </Field>
            </div>
            <Field label="Description" help="Optional description for this policy.">
              <textarea className={inputCls} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe this policy..." />
            </Field>
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--text-tertiary)]">Leave Type Assignments</p>
              {form.leave_types.map((lt, lti) => (
                <div key={lti} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-center bg-white rounded-lg border border-[var(--border-color)] p-2">
                  <span className="text-sm font-medium text-[var(--text-primary)] col-span-2 md:col-span-1">{lt.leave_type_name}</span>
                  <Field label="Days">
                    <NumInput value={lt.custom_days} onChange={v => setPolicyLT(0, lti, { custom_days: v })} />
                  </Field>
                  <Toggle label="Carry Forward" checked={lt.carry_forward} onChange={v => setPolicyLT(0, lti, { carry_forward: v })} />
                  <Toggle label="Encashable" checked={lt.encashment_eligible} onChange={v => setPolicyLT(0, lti, { encashment_eligible: v })} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1" />
              <button onClick={cancel} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={save} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">Save Policy</button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {policies.map((p, i) => (
            <div key={i} className="border border-[var(--border-color)] rounded-xl overflow-hidden">
              <button onClick={() => setExpanded(expanded === i ? null : i)} className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-[var(--hover-bg)]">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{p.applicable_to}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{p.leave_types.length} leave type(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); startEdit(i); }} className="p-1.5 rounded-lg hover:bg-blue-50 text-[var(--primary-blue)]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={e => { e.stopPropagation(); remove(i); }} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  {expanded === i ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
                </div>
              </button>
              {expanded === i && (
                <div className="px-4 pb-3 space-y-2">
                  {p.description && <p className="text-xs text-[var(--text-tertiary)]">{p.description}</p>}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {p.leave_types.map((lt, j) => (
                      <div key={j} className="bg-[var(--background)] rounded-lg px-3 py-2 text-xs">
                        <span className="font-medium text-[var(--text-primary)]">{lt.leave_type_name}</span>
                        <span className="text-[var(--text-tertiary)]"> — {lt.custom_days ?? '—'} days</span>
                        {lt.carry_forward && <span className="ml-1 text-emerald-600">CF</span>}
                        {lt.encashment_eligible && <span className="ml-1 text-amber-600">EN</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {policies.length === 0 && (
            <p className="text-sm text-[var(--text-disabled)] text-center py-6">No policies created yet</p>
          )}
        </div>
        {editing === null && (
          <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--primary-blue)] hover:bg-blue-50 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Create Policy
          </button>
        )}
      </WizardSectionCard>
    </div>
  );
}

// ── Accrual Rules Tab ──

function AccrualRulesTab({ rule, onChange }: { rule: AccrualRule; onChange: (r: AccrualRule) => void }) {
  const set = (patch: Partial<AccrualRule>) => onChange({ ...rule, ...patch });

  return (
    <div className="space-y-4">
      <WizardSectionCard title="Accrual Method" icon={Clock}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Accrual method" help="How leave balance accrues: monthly, yearly, quarterly, or front-loaded.">
            <SearchableSelect value={rule.accrual_method} onChange={v => set({ accrual_method: String(v) })} placeholder="Select method" options={ACCRUAL_METHODS} showAllOption={false} />
          </Field>
          <Field label="Accrual day" help="Day of month (1-28) when leave is credited.">
            <NumInput value={rule.accrual_day} onChange={v => set({ accrual_day: v ?? 1 })} />
          </Field>
        </div>
      </WizardSectionCard>
      <WizardSectionCard title="Probation Rules" icon={SlidersHorizontal}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle label="Accrue during probation" help="Whether probation employees earn leave balance." checked={rule.probation_accrual} onChange={v => set({ probation_accrual: v })} />
          <Field label="Probation accrual rate (%)" help="Percentage of full accrual during probation period.">
            <NumInput value={rule.probation_accrual_rate} onChange={v => set({ probation_accrual_rate: v ?? 50 })} />
          </Field>
        </div>
      </WizardSectionCard>
      <WizardSectionCard title="Balance & Lapse" icon={Wallet}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Maximum balance cap" help="Maximum leave balance an employee can accumulate. Blank = no cap.">
            <NumInput value={rule.max_balance_cap} onChange={v => set({ max_balance_cap: v })} placeholder="No cap" />
          </Field>
          <div className="space-y-3">
            <Toggle label="Lapse unused leaves" help="Whether unused leaves expire at year end." checked={rule.lapse_unused} onChange={v => set({ lapse_unused: v })} />
            {rule.lapse_unused && (
              <Field label="Lapse date" help="When unused leaves lapse.">
                <SearchableSelect value={rule.lapse_date} onChange={v => set({ lapse_date: String(v) })} placeholder="Select" options={LAPSE_OPTIONS} showAllOption={false} />
              </Field>
            )}
          </div>
        </div>
      </WizardSectionCard>
    </div>
  );
}

// ── Carry Forward Tab ──

function CarryForwardTab({ rule, leaveTypes, onChange }: { rule: CarryForward; leaveTypes: LeaveType[]; onChange: (r: CarryForward) => void }) {
  const set = (patch: Partial<CarryForward>) => onChange({ ...rule, ...patch });

  const toggleLT = (id: number) => {
    const current = rule.applicable_leave_types;
    if (current.includes(id)) set({ applicable_leave_types: current.filter(x => x !== id) });
    else set({ applicable_leave_types: [...current, id] });
  };

  return (
    <div className="space-y-4">
      <WizardSectionCard title="Carry Forward Settings" icon={CalendarDays}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle label="Enable carry forward" help="Allow employees to carry unused leaves to next year." checked={rule.enabled} onChange={v => set({ enabled: v })} />
          <Field label="Maximum carry forward days" help="Max days that can be carried forward per year.">
            <NumInput value={rule.max_days} onChange={v => set({ max_days: v ?? 0 })} />
          </Field>
          <Field label="Carry forward expiry" help="When carried-forward leaves expire if unused.">
            <SearchableSelect value={rule.expiry} onChange={v => set({ expiry: String(v) })} placeholder="Select" options={CF_EXPIRY_OPTIONS} showAllOption={false} />
          </Field>
          <Toggle label="Use-it-or-lose-it" help="Carried-forward leaves must be used before fresh allocation." checked={rule.use_it_or_lose_it} onChange={v => set({ use_it_or_lose_it: v })} />
        </div>
      </WizardSectionCard>
      {rule.enabled && (
        <WizardSectionCard title="Applicable Leave Types" icon={CalendarDays}>
          <p className="text-xs text-[var(--text-tertiary)]">Select which leave types can be carried forward.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {leaveTypes.filter(lt => lt.active).map(lt => (
              <label key={lt.id ?? lt.code} className="flex items-center gap-2 bg-[var(--background)] rounded-lg px-3 py-2 cursor-pointer hover:bg-[var(--hover-bg)]">
                <input type="checkbox" checked={rule.applicable_leave_types.includes(lt.id ?? -1)} onChange={() => toggleLT(lt.id ?? -1)} className="rounded" />
                <span className="text-sm text-[var(--text-secondary)]">{lt.name} ({lt.code})</span>
              </label>
            ))}
          </div>
        </WizardSectionCard>
      )}
    </div>
  );
}

// ── Encashment Rules Tab ──

function EncashmentRulesTab({ rule, leaveTypes, onChange }: { rule: EncashmentRule; leaveTypes: LeaveType[]; onChange: (r: EncashmentRule) => void }) {
  const set = (patch: Partial<EncashmentRule>) => onChange({ ...rule, ...patch });

  const toggleLT = (id: number) => {
    const current = rule.applicable_leave_types;
    if (current.includes(id)) set({ applicable_leave_types: current.filter(x => x !== id) });
    else set({ applicable_leave_types: [...current, id] });
  };

  return (
    <div className="space-y-4">
      <WizardSectionCard title="Encashment Settings" icon={Wallet}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle label="Enable encashment" help="Allow employees to encash unused leaves." checked={rule.enabled} onChange={v => set({ enabled: v })} />
          <Field label="Minimum balance required" help="Minimum balance to retain before encashing.">
            <NumInput value={rule.min_balance_required} onChange={v => set({ min_balance_required: v ?? 0 })} />
          </Field>
          <Field label="Encashment rate (days/year)" help="How many days can be encashed annually.">
            <NumInput value={rule.encashment_rate} onChange={v => set({ encashment_rate: v ?? 0 })} />
          </Field>
          <Field label="Frequency" help="When encashment is processed.">
            <SearchableSelect value={rule.frequency} onChange={v => set({ frequency: String(v) })} placeholder="Select" options={ENCASHMENT_FREQUENCY} showAllOption={false} />
          </Field>
          <Toggle label="Tax on encashment" help="Whether encashment amount is taxable." checked={rule.tax_on_encashment} onChange={v => set({ tax_on_encashment: v })} />
        </div>
      </WizardSectionCard>
      {rule.enabled && (
        <WizardSectionCard title="Applicable Leave Types" icon={Wallet}>
          <p className="text-xs text-[var(--text-tertiary)]">Select which leave types can be encashed.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {leaveTypes.filter(lt => lt.active).map(lt => (
              <label key={lt.id ?? lt.code} className="flex items-center gap-2 bg-[var(--background)] rounded-lg px-3 py-2 cursor-pointer hover:bg-[var(--hover-bg)]">
                <input type="checkbox" checked={rule.applicable_leave_types.includes(lt.id ?? -1)} onChange={() => toggleLT(lt.id ?? -1)} className="rounded" />
                <span className="text-sm text-[var(--text-secondary)]">{lt.name} ({lt.code})</span>
              </label>
            ))}
          </div>
        </WizardSectionCard>
      )}
    </div>
  );
}

// ── Holiday Calendar Tab ──

function HolidayCalendarTab({ calendar, onChange }: { calendar: HolidayCalendar; onChange: (c: HolidayCalendar) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Holiday>({ name: '', date: '', type: 'national', applicable_states: [] });

  const setHolidays = (h: Holiday[]) => onChange({ ...calendar, holidays: h });
  const startAdd = () => { setEditing(-1); setForm({ name: '', date: '', type: 'national', applicable_states: [] }); };
  const startEdit = (i: number) => { setEditing(i); setForm({ ...calendar.holidays[i] }); };
  const cancel = () => setEditing(null);
  const save = () => {
    if (!form.name.trim()) { toast.error('Holiday name is required'); return; }
    if (!form.date) { toast.error('Date is required'); return; }
    const next = [...calendar.holidays];
    if (editing === -1) next.push({ ...form });
    else next[editing] = { ...form };
    setHolidays(next);
    setEditing(null);
    toast.success(editing === -1 ? 'Holiday added' : 'Holiday updated');
  };
  const remove = (i: number) => {
    setHolidays(calendar.holidays.filter((_, idx) => idx !== i));
    toast.success('Holiday removed');
  };

  return (
    <div className="space-y-4">
      <WizardSectionCard title="Holiday Calendar" icon={Calendar}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Optional holiday limit" help="Max optional holidays an employee can choose per year.">
            <NumInput value={calendar.optional_holiday_limit} onChange={v => onChange({ ...calendar, optional_holiday_limit: v ?? 0 })} />
          </Field>
          <Toggle label="Auto-apply national holidays" help="Automatically apply national holidays to all employees." checked={calendar.auto_apply_national} onChange={v => onChange({ ...calendar, auto_apply_national: v })} />
        </div>
      </WizardSectionCard>
      <WizardSectionCard title="Holiday List" icon={CalendarDays}>
        <p className="text-xs text-[var(--text-tertiary)]">
          Define company holidays. National holidays apply to all; optional holidays let employees choose.
        </p>
        {editing !== null && (
          <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Holiday Name" help="Name of the holiday.">
                <TextInput value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="e.g. Republic Day" />
              </Field>
              <Field label="Date" help="Date of the holiday.">
                <DateInput value={form.date} onChange={v => setForm({ ...form, date: v })} />
              </Field>
              <Field label="Type" help="National, Optional, or Restricted.">
                <SearchableSelect value={form.type} onChange={v => setForm({ ...form, type: String(v) })} placeholder="Select" options={HOLIDAY_TYPES} showAllOption={false} />
              </Field>
            </div>
            {form.type !== 'national' && (
              <Field label="Applicable States" help="Leave blank for all states.">
                <MultiStateSelect values={form.applicable_states} onChange={v => setForm({ ...form, applicable_states: v })} />
              </Field>
            )}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1" />
              <button onClick={cancel} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={save} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">Save</button>
            </div>
          </div>
        )}
        <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--background)]">
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Date</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Type</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">States</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-tertiary)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {calendar.holidays.map((h, i) => (
                <tr key={i} className="border-b border-[#F1F5F9] hover:bg-[var(--hover-bg)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{h.name}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{h.date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      h.type === 'national' ? 'bg-blue-50 text-blue-600' :
                      h.type === 'optional' ? 'bg-amber-50 text-amber-600' :
                      'bg-purple-50 text-purple-600'
                    }`}>{h.type}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--text-tertiary)]">{h.applicable_states.length ? h.applicable_states.join(', ') : 'All'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(i)} className="p-1.5 rounded-lg hover:bg-blue-50 text-[var(--primary-blue)]"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {calendar.holidays.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text-disabled)]">No holidays configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3">
          {editing === null && (
            <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--primary-blue)] hover:bg-blue-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Holiday
            </button>
          )}
          <button onClick={() => toast.success('Import feature coming soon')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors">
            <Download className="w-3.5 h-3.5" /> Import Holidays
          </button>
        </div>
      </WizardSectionCard>
    </div>
  );
}

// ── Wizard Tabs Config ──

const WIZARD_TABS = [
  { id: 'leaveTypes', label: 'Leave Types', icon: CalendarDays, color: 'text-blue-600' },
  { id: 'policies', label: 'Leave Policies', icon: FileText, color: 'text-violet-600' },
  { id: 'accrual', label: 'Accrual Rules', icon: Clock, color: 'text-emerald-600' },
  { id: 'carryForward', label: 'Carry Forward', icon: Calendar, color: 'text-amber-600' },
  { id: 'encashment', label: 'Encashment Rules', icon: Wallet, color: 'text-rose-600' },
  { id: 'holidays', label: 'Holiday Calendar', icon: CalendarDays, color: 'text-indigo-600' },
];

const WIZARD_HELP: Record<string, string> = {
  leaveTypes: 'Define leave types available in your organization — name, code, allocation, and category.',
  policies: 'Create policy templates that assign leave types to employee groups with custom rules.',
  accrual: 'Configure how leave balance accrues — method, timing, probation rules, and lapse settings.',
  carryForward: 'Allow employees to carry unused leaves to the next year with expiry and usage rules.',
  encashment: 'Enable employees to encash unused leaves with tax and eligibility settings.',
  holidays: 'Manage company holiday calendar — national, optional, and restricted holidays.',
};

// ── Main Component ──

export default function LeaveConfig({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [wizardTab, setWizardTab] = useState('leaveTypes');
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: savedConfigs = [], isLoading } = useQuery({
    queryKey: ['leave-configs'],
    queryFn: async () => {
      try {
        const r = await api.get('/settings/configs/leave');
        return r.data || [];
      } catch { return []; }
    },
    enabled: open,
  });

  const { data: leaveTypesFromServer = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: async () => {
      try {
        const r = await api.get('/leave-types');
        return r.data || [];
      } catch { return []; }
    },
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, state }: { id: number | null; state: WizardState }) =>
      id ? api.put(`/settings/configs/leave/${id}`, state) : api.post('/settings/configs/leave', state),
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || 'Leave configuration saved');
      queryClient.invalidateQueries({ queryKey: ['leave-configs'] });
      setWizard(null);
      setEditingId(null);
      setWizardTab('leaveTypes');
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Failed to save leave configuration')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/configs/leave/${id}`),
    onSuccess: () => {
      toast.success('Configuration deleted');
      queryClient.invalidateQueries({ queryKey: ['leave-configs'] });
    },
    onError: (err: unknown) => toast.error(errMsg(err, 'Failed to delete')),
  });

  const openCreate = () => {
    setEditingId(null);
    setWizardTab('leaveTypes');
    setWizard(blankWizard());
  };

  const openEdit = (config: any) => {
    setEditingId(config.id);
    setWizardTab('leaveTypes');
    setWizard({
      leaveTypes: config.leave_types || defaultLeaveTypes(),
      leavePolicies: config.leave_policies || [],
      accrualRule: { ...defaultAccrual(), ...(config.accrual_rule || {}) },
      carryForward: { ...defaultCarryForward(), ...(config.carry_forward || {}) },
      encashmentRule: { ...defaultEncashment(), ...(config.encashment_rule || {}) },
      holidayCalendar: { ...defaultHolidayCalendar(), ...(config.holiday_calendar || {}) },
    });
  };

  const setWizardState = (patch: Partial<WizardState>) => setWizard(prev => prev ? { ...prev, ...patch } : prev);

  const totalLeaveDays = useMemo(() => {
    return (wizard?.leaveTypes || []).reduce((sum, lt) => sum + (lt.days_per_year || 0), 0);
  }, [wizard?.leaveTypes]);

  const activeHolidays = wizard?.holidayCalendar.holidays.length || 0;
  const activePolicies = wizard?.leavePolicies.length || 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br from-[#1C64F2] to-[#1C64F2bb]">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {editingId ? 'Edit Leave Configuration' : 'Configure Leave Management'}
              </h2>
              <p className="text-xs text-[#64748B]">Leave types, policies, accrual, carry-forward and holidays.</p>
            </div>
          </div>
          <button onClick={onClose} title="Close" className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
            <div className="py-2 px-3">
              <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
              <nav className="space-y-0.5">
                {WIZARD_TABS.map((t) => {
                  const active = t.id === wizardTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWizardTab(t.id)}
                      className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                        active
                          ? 'bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] text-[#1C64F2] shadow-sm'
                          : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                        active ? `${t.color}` : 'bg-white border border-[var(--border-color)]'
                      }`}
                        style={active ? { background: '#1C64F214', boxShadow: '0 2px 6px #1C64F222' } : undefined}>
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
            <div key={wizardTab} className="section-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#1C64F214' }}>
                  {(() => { const t = WIZARD_TABS.find(x => x.id === wizardTab); const Icon = t?.icon || CalendarDays; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZARD_TABS.find(x => x.id === wizardTab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[wizardTab] || ''}</p>
                </div>
              </div>
              <div className="space-y-4">
                {!wizard && (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                      <StatBox label="Leave Types" value={savedConfigs.reduce((s: number, c: any) => s + (c.leave_types?.length || 0), 0)} icon={CalendarDays} />
                      <StatBox label="Policies" value={savedConfigs.reduce((s: number, c: any) => s + (c.leave_policies?.length || 0), 0)} icon={FileText} />
                      <StatBox label="Holidays" value={savedConfigs.reduce((s: number, c: any) => s + (c.holiday_calendar?.holidays?.length || 0), 0)} icon={Calendar} />
                      <StatBox label="Configurations" value={savedConfigs.length} icon={CheckCircle2} />
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-tertiary)]">
                        {savedConfigs.length ? `${savedConfigs.length} configuration(s) saved` : 'No configurations saved yet'}
                      </p>
                      <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">
                        <Plus className="w-4 h-4" /> Create Configuration
                      </button>
                    </div>

                    {savedConfigs.map((config: any) => (
                      <div key={config.id} className="bg-white rounded-2xl border border-[var(--border-color)] p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                              <CalendarDays className="w-4 h-4 text-[var(--primary-blue)]" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-[var(--text-primary)]">{config.name || `Configuration #${config.id}`}</h3>
                              <p className="text-xs text-[var(--text-tertiary)]">Created {config.created_at ? new Date(config.created_at).toLocaleDateString() : '—'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-4">
                          <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                            <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Types</div>
                            <div className="font-medium text-[var(--text-primary)]">{config.leave_types?.length || 0}</div>
                          </div>
                          <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                            <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Policies</div>
                            <div className="font-medium text-[var(--text-primary)]">{config.leave_policies?.length || 0}</div>
                          </div>
                          <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                            <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Holidays</div>
                            <div className="font-medium text-[var(--text-primary)]">{config.holiday_calendar?.holidays?.length || 0}</div>
                          </div>
                          <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                            <div className="text-[10px] uppercase text-[var(--text-tertiary)]">Accrual</div>
                            <div className="font-medium text-[var(--text-primary)]">{config.accrual_rule?.accrual_method || '—'}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(config)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => { if (confirm('Delete this configuration?')) deleteMutation.mutate(config.id); }} className="flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {wizard && wizardTab === 'leaveTypes' && (
                  <LeaveTypesTab types={wizard.leaveTypes} onChange={t => setWizardState({ leaveTypes: t })} />
                )}
                {wizard && wizardTab === 'policies' && (
                  <LeavePoliciesTab policies={wizard.leavePolicies} leaveTypes={wizard.leaveTypes} onChange={p => setWizardState({ leavePolicies: p })} />
                )}
                {wizard && wizardTab === 'accrual' && (
                  <AccrualRulesTab rule={wizard.accrualRule} onChange={r => setWizardState({ accrualRule: r })} />
                )}
                {wizard && wizardTab === 'carryForward' && (
                  <CarryForwardTab rule={wizard.carryForward} leaveTypes={wizard.leaveTypes} onChange={r => setWizardState({ carryForward: r })} />
                )}
                {wizard && wizardTab === 'encashment' && (
                  <EncashmentRulesTab rule={wizard.encashmentRule} leaveTypes={wizard.leaveTypes} onChange={r => setWizardState({ encashmentRule: r })} />
                )}
                {wizard && wizardTab === 'holidays' && (
                  <HolidayCalendarTab calendar={wizard.holidayCalendar} onChange={c => setWizardState({ holidayCalendar: c })} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {wizard && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
            <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {wizard.leaveTypes.length} leave types</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {wizard.leavePolicies.length} policies</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {wizard.holidayCalendar.holidays.length} holidays</span>
              <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-blue-500" /> {totalLeaveDays} total days/yr</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setWizard(null); setEditingId(null); }} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={() => {
                if (!wizard.leaveTypes.length) { toast.error('Add at least one leave type'); return; }
                saveMutation.mutate({ id: editingId, state: wizard });
              }} disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Save Changes' : 'Create Configuration'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
