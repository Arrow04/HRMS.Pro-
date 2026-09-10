import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Loader2, X, Building2, SlidersHorizontal,
  CheckCircle2, ChevronDown, ChevronUp, FileText, Save, Clock, MapPin,
  CalendarDays, Wifi, Globe, Upload, Download, Check, Copy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import ToggleSwitch from './ToggleSwitch';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface ApiErrorLike { response?: { data?: { detail?: string } } }
function errMsg(err: unknown, fallback: string) {
  return (err as ApiErrorLike | null)?.response?.data?.detail || fallback;
}

// ── Types ──

interface ShiftTemplate {
  id?: number;
  name: string;
  start_time: string;
  end_time: string;
  break_duration: number;
  shift_type: 'day' | 'night' | 'rotating';
}

interface AttendanceConfigData {
  id?: number;
  name: string;
  company_id: number | null;
  branch_id: number | null;
  department_id: number | null;

  working_days_per_week: number;
  working_days: string;
  work_start_time: string;
  work_end_time: string;
  grace_period_minutes: number;
  min_hours_for_full_day: number;
  half_day_cut_off_hours: number;

  shifts: ShiftTemplate[];

  late_mark_threshold_minutes: number;
  half_day_threshold_hours: number;
  overtime_threshold_hours: number;
  overtime_rate: number;
  max_overtime_hours_per_month: number;
  comp_off_enabled: boolean;
  max_comp_off_balance: number;

  geofencing_enabled: boolean;
  geofence_radius_meters: number;
  ip_restriction_enabled: boolean;
  allowed_ip_ranges: string;
  wifi_checkin_enabled: boolean;
  allowed_ssids: string;

  half_day_as_full_paid: boolean;
  paid_leave_as_present: boolean;
  holiday_as_paid: boolean;
  weekend_tracking: boolean;
  manual_override_allowed: boolean;
  auto_approve_if_no_mark: boolean;
  shift_based_payroll: boolean;
}

// ── Defaults ──

function defaultConfig(): AttendanceConfigData {
  return {
    name: 'Standard Attendance Policy',
    company_id: null,
    branch_id: null,
    department_id: null,

    working_days_per_week: 5,
    working_days: '1,2,3,4,5',
    work_start_time: '09:00',
    work_end_time: '18:00',
    grace_period_minutes: 15,
    min_hours_for_full_day: 8,
    half_day_cut_off_hours: 4,

    shifts: [],

    late_mark_threshold_minutes: 15,
    half_day_threshold_hours: 4,
    overtime_threshold_hours: 8,
    overtime_rate: 1.5,
    max_overtime_hours_per_month: 40,
    comp_off_enabled: false,
    max_comp_off_balance: 0,

    geofencing_enabled: false,
    geofence_radius_meters: 100,
    ip_restriction_enabled: false,
    allowed_ip_ranges: '',
    wifi_checkin_enabled: false,
    allowed_ssids: '',

    half_day_as_full_paid: true,
    paid_leave_as_present: true,
    holiday_as_paid: true,
    weekend_tracking: false,
    manual_override_allowed: true,
    auto_approve_if_no_mark: false,
    shift_based_payroll: false,
  };
}

function fromApi(data: any): AttendanceConfigData {
  return { ...defaultConfig(), ...data };
}

function defaultShift(): ShiftTemplate {
  return { name: '', start_time: '09:00', end_time: '18:00', break_duration: 60, shift_type: 'day' };
}

const WEEKDAY_LABELS = [
  { value: '0', label: 'Sun', full: 'Sunday' },
  { value: '1', label: 'Mon', full: 'Monday' },
  { value: '2', label: 'Tue', full: 'Tuesday' },
  { value: '3', label: 'Wed', full: 'Wednesday' },
  { value: '4', label: 'Thu', full: 'Thursday' },
  { value: '5', label: 'Fri', full: 'Friday' },
  { value: '6', label: 'Sat', full: 'Saturday' },
];

const SHIFT_TYPES = [
  { id: 'day', name: 'Day Shift' },
  { id: 'night', name: 'Night Shift' },
  { id: 'rotating', name: 'Rotating Shift' },
];

// ── Small field components (same pattern as PayrollConfiguration) ──

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">{label}</label>
      {children}
      {help && <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#F59E0B]";

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputCls} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}

function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return <input type="number" step="any" className={inputCls} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)} />;
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="time" className={inputCls} value={value} onChange={e => onChange(e.target.value)} />;
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
        className={`relative w-12 h-7 rounded-full transition-all duration-300 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/40 focus-visible:ring-offset-2 cursor-pointer group ${
          checked
            ? 'bg-gradient-to-r from-[#F59E0B] to-[#D97706] shadow-[0_2px_8px_-1px_rgba(245,158,11,0.5)]'
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
          <Icon className="w-4 h-4 text-amber-600" />
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
      <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
        <div className="text-xs text-[var(--text-tertiary)]">{label}</div>
      </div>
    </div>
  );
}

// ── Wizard tabs ──

const WIZARD_TABS = [
  { id: 'schedule', label: 'Work Schedule', icon: CalendarDays, color: 'text-amber-600' },
  { id: 'shifts', label: 'Shifts & Templates', icon: Clock, color: 'text-blue-600' },
  { id: 'thresholds', label: 'Thresholds & Overtime', icon: SlidersHorizontal, color: 'text-violet-600' },
  { id: 'geofencing', label: 'Geofencing', icon: Globe, color: 'text-emerald-600' },
  { id: 'payroll', label: 'Attendance to Payroll', icon: MapPin, color: 'text-rose-600' },
  { id: 'bulk', label: 'Bulk Settings', icon: FileText, color: 'text-indigo-600' },
];

const WIZARD_HELP: Record<string, string> = {
  schedule: 'Define working days, hours, grace period and half-day rules.',
  shifts: 'Create and manage shift templates for your organization.',
  thresholds: 'Configure late marking, half-day, overtime and compensatory off rules.',
  geofencing: 'Restrict check-in/out by location, IP or WiFi.',
  payroll: 'Map attendance statuses to payroll calculations.',
  bulk: 'Apply configuration in bulk across companies, branches or departments.',
};

// ── Component ──

export default function AttendanceConfig({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const accent = '#F59E0B';

  const [wizardTab, setWizardTab] = useState('schedule');
  const [config, setConfig] = useState<AttendanceConfigData>(defaultConfig());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingShiftIdx, setEditingShiftIdx] = useState<number | null>(null);
  const [shiftDraft, setShiftDraft] = useState<ShiftTemplate>(defaultShift());
  const [showShiftForm, setShowShiftForm] = useState(false);

  const [companyFilter, setCompanyFilter] = useState<number | 'all'>('all');
  const [bulkScope, setBulkScope] = useState<string>('company');
  const [bulkCompanyId, setBulkCompanyId] = useState<number | null>(null);
  const [bulkBranchId, setBulkBranchId] = useState<number | null>(null);
  const [bulkDepartmentId, setBulkDepartmentId] = useState<number | null>(null);

  // ── API queries ──

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', config.company_id],
    queryFn: async () => {
      try {
        const params = config.company_id ? { company_id: config.company_id } : {};
        const r = await api.get('/branches', { params });
        return r.data || [];
      } catch { return []; }
    },
    enabled: !!config.company_id,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', config.company_id],
    queryFn: async () => {
      try {
        const params = config.company_id ? { company_id: config.company_id } : {};
        const r = await api.get('/departments', { params });
        return r.data || [];
      } catch { return []; }
    },
    enabled: !!config.company_id,
  });

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['attendance-configs', companyFilter],
    queryFn: async () => {
      try {
        const params = companyFilter !== 'all' ? { company_id: companyFilter } : {};
        const r = await api.get('/settings/configs/attendance', { params });
        return r.data || [];
      } catch { return []; }
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: { id: number | null; payload: AttendanceConfigData }) =>
      data.id
        ? api.put(`/settings/configs/attendance/${data.id}`, data.payload)
        : api.post('/settings/configs/attendance', data.payload),
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || 'Attendance config saved');
      queryClient.invalidateQueries({ queryKey: ['attendance-configs'] });
      setConfig(defaultConfig());
      setEditingId(null);
      setWizardTab('schedule');
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to save attendance config')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/configs/attendance/${id}`),
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || 'Config deleted');
      queryClient.invalidateQueries({ queryKey: ['attendance-configs'] });
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to delete config')),
  });

  const bulkApplyMutation = useMutation({
    mutationFn: (payload: { config_id: number; scope: string; company_id?: number; branch_id?: number; department_id?: number }) =>
      api.post('/settings/configs/attendance/bulk-apply', payload),
    onSuccess: () => {
      toast.success('Configuration applied to all employees in scope');
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to apply configuration')),
  });

  // ── Handlers ──

  const setField = <K extends keyof AttendanceConfigData>(key: K, value: AttendanceConfigData[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setConfig(defaultConfig());
    setWizardTab('schedule');
  };

  const openEdit = (data: any) => {
    setEditingId(data.id);
    setConfig(fromApi(data));
    setWizardTab('schedule');
  };

  const handleSave = () => {
    saveMutation.mutate({ id: editingId, payload: config });
  };

  // ── Shift management ──

  const openAddShift = () => {
    setEditingShiftIdx(null);
    setShiftDraft(defaultShift());
    setShowShiftForm(true);
  };

  const openEditShift = (i: number) => {
    setEditingShiftIdx(i);
    setShiftDraft({ ...config.shifts[i] });
    setShowShiftForm(true);
  };

  const saveShift = () => {
    if (!shiftDraft.name.trim()) {
      toast.error('Shift name is required');
      return;
    }
    const shifts = [...config.shifts];
    if (editingShiftIdx !== null) {
      shifts[editingShiftIdx] = { ...shiftDraft };
    } else {
      shifts.push({ ...shiftDraft, id: Date.now() });
    }
    setField('shifts', shifts);
    setShowShiftForm(false);
    setEditingShiftIdx(null);
    setShiftDraft(defaultShift());
  };

  const removeShift = (i: number) => {
    const shifts = config.shifts.filter((_, idx) => idx !== i);
    setField('shifts', shifts);
  };

  // ── Working days toggle ──

  const toggleWeekday = (dayVal: string) => {
    const current = config.working_days.split(',').filter(Boolean);
    const next = current.includes(dayVal)
      ? current.filter(d => d !== dayVal)
      : [...current, dayVal].sort();
    setField('working_days', next.join(','));
    setField('working_days_per_week', next.length);
  };

  // ── Progress ──

  const sectionDone = [
    !!(config.name.trim()),
    config.shifts.length > 0 || true,
    true,
    true,
    true,
    true,
  ];

  const done = sectionDone.filter(Boolean).length;
  const progress = Math.min(100, Math.round((done / WIZARD_TABS.length) * 100));

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c: any) => [c.id, c.name]));
    return (id: number | null) => (id == null ? '—' : m.get(id) || '—');
  }, [companies]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {editingId ? 'Edit Attendance Configuration' : 'Create Attendance Configuration'}
              </h2>
              <p className="text-xs text-[#64748B]">Work schedules, shifts, thresholds & geofencing.</p>
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
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }}
              />
            </div>
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: accent }}>{progress}% complete</span>
          </div>
          <p className="text-[11px] text-[#B45309] mt-1.5">
            Navigate through sections to configure attendance. Fields marked with <span className="font-semibold text-[#DC2626]">*</span> are mandatory.
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
                  const active = t.id === wizardTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWizardTab(t.id)}
                      className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                        active
                          ? 'bg-gradient-to-r from-[#FFFBEB] to-[#FEF3C7] text-amber-700 shadow-sm'
                          : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                          active ? `${t.color}` : 'bg-white border border-[var(--border-color)]'
                        }`}
                        style={active ? { background: `${accent}14`, boxShadow: `0 2px 6px ${accent}22` } : undefined}
                      >
                        <t.icon className={`w-4 h-4 transition-all duration-300 ${active ? t.color : 'text-[#64748B]'}`} />
                      </span>
                      <span className={`flex-1 truncate transition-colors duration-300 ${active ? 'font-semibold text-amber-700' : 'font-medium'}`}>{t.label}</span>
                      {sectionDone[WIZARD_TABS.indexOf(t)] && (
                        <Check className="w-3.5 h-3.5 text-green-500 ml-1 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div key={wizardTab} className="section-fade-in">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${accent}14` }}
                >
                  {(() => { const t = WIZARD_TABS.find(x => x.id === wizardTab); const Icon = t?.icon || Clock; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZARD_TABS.find(x => x.id === wizardTab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[wizardTab] || ''}</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* ─── Tab 1: Work Schedule ─── */}
                {wizardTab === 'schedule' && (
                  <div className="space-y-4">
                    <WizardSectionCard title="Basic Information" icon={Building2}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Policy name *" help="Text — internal label for this attendance policy.">
                          <TextInput value={config.name} onChange={v => setField('name', v)} placeholder="e.g. Standard Attendance Policy" />
                        </Field>
                        <Field label="Company" help="Select the company this policy applies to.">
                          <SearchableSelect
                            value={config.company_id ?? 'all'}
                            onChange={v => {
                              setField('company_id', v === 'all' ? null : Number(v));
                              setField('branch_id', null);
                            }}
                            placeholder="Select Company"
                            options={companies.map((c: any) => ({ id: c.id, name: c.name }))}
                            allOption="All Companies"
                          />
                        </Field>
                        <Field label="Branch" help="Filter by branch (optional).">
                          <SearchableSelect
                            value={config.branch_id ?? 'all'}
                            onChange={v => setField('branch_id', v === 'all' ? null : Number(v))}
                            placeholder="Select Branch"
                            options={branches.map((b: any) => ({ id: b.id, name: b.name }))}
                            allOption="All Branches"
                            disabled={!config.company_id}
                          />
                        </Field>
                        <Field label="Department" help="Filter by department (optional).">
                          <SearchableSelect
                            value={config.department_id ?? 'all'}
                            onChange={v => setField('department_id', v === 'all' ? null : Number(v))}
                            placeholder="Select Department"
                            options={departments.map((d: any) => ({ id: d.id, name: d.name }))}
                            allOption="All Departments"
                            disabled={!config.company_id}
                          />
                        </Field>
                      </div>
                    </WizardSectionCard>

                    <WizardSectionCard title="Work Schedule" icon={CalendarDays}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Working days per week" help="Number — 5, 6 or 7. Select working days below.">
                          <SearchableSelect
                            value={config.working_days_per_week}
                            onChange={v => {
                              const n = Number(v);
                              setField('working_days_per_week', n);
                              const order = ['1', '2', '3', '4', '5', '6', '0'];
                              setField('working_days', order.slice(0, n).join(','));
                            }}
                            placeholder="Select"
                            options={[5, 6, 7].map(n => ({ id: n, name: `${n} days` }))}
                            showAllOption={false}
                          />
                        </Field>
                        <div />
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-2">Working days</label>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAY_LABELS.map(day => {
                              const isOn = config.working_days.split(',').includes(day.value);
                              return (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => toggleWeekday(day.value)}
                                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                                    isOn
                                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                      : 'bg-white text-[var(--text-secondary)] border-[var(--border-color)] hover:border-amber-300'
                                  }`}
                                  title={day.full}
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{config.working_days_per_week} working days selected</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                        <Field label="Work start time" help="Time — when the workday officially begins.">
                          <TimeInput value={config.work_start_time} onChange={v => setField('work_start_time', v)} />
                        </Field>
                        <Field label="Work end time" help="Time — when the workday officially ends.">
                          <TimeInput value={config.work_end_time} onChange={v => setField('work_end_time', v)} />
                        </Field>
                        <div />
                      </div>
                    </WizardSectionCard>

                    <WizardSectionCard title="Grace & Minimum Hours" icon={Clock}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Grace period (minutes)" help="Employees arriving within this window are not marked late.">
                          <NumInput value={config.grace_period_minutes} onChange={v => setField('grace_period_minutes', v ?? 0)} />
                        </Field>
                        <Field label="Minimum hours for full day" help="Minimum hours to count as present.">
                          <NumInput value={config.min_hours_for_full_day} onChange={v => setField('min_hours_for_full_day', v ?? 0)} />
                        </Field>
                        <Field label="Half-day cut-off (hours)" help="Hours threshold below which a day counts as half-day.">
                          <NumInput value={config.half_day_cut_off_hours} onChange={v => setField('half_day_cut_off_hours', v ?? 0)} />
                        </Field>
                      </div>
                    </WizardSectionCard>
                  </div>
                )}

                {/* ─── Tab 2: Shifts & Templates ─── */}
                {wizardTab === 'shifts' && (
                  <div className="space-y-4">
                    <WizardSectionCard
                      title="Shift Templates"
                      icon={Clock}
                      action={
                        <button
                          onClick={openAddShift}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
                        >
                          <Plus className="w-4 h-4" /> Add Shift Template
                        </button>
                      }
                    >
                      {config.shifts.length === 0 ? (
                        <p className="text-sm text-[var(--text-disabled)] text-center py-8">No shift templates created yet. Click "Add Shift Template" to get started.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-tertiary)]">
                                <th className="pb-2 font-medium pr-4">Name</th>
                                <th className="pb-2 font-medium pr-4">Start</th>
                                <th className="pb-2 font-medium pr-4">End</th>
                                <th className="pb-2 font-medium pr-4">Break</th>
                                <th className="pb-2 font-medium pr-4">Type</th>
                                <th className="pb-2 font-medium">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {config.shifts.map((shift, i) => (
                                <tr key={i} className="border-b border-[#F1F5F9]">
                                  <td className="py-2.5 pr-4 font-medium text-[var(--text-primary)]">{shift.name}</td>
                                  <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{shift.start_time}</td>
                                  <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{shift.end_time}</td>
                                  <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{shift.break_duration} min</td>
                                  <td className="py-2.5 pr-4">
                                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                      shift.shift_type === 'day' ? 'bg-blue-50 text-blue-600' :
                                      shift.shift_type === 'night' ? 'bg-indigo-50 text-indigo-600' :
                                      'bg-amber-50 text-amber-600'
                                    }`}>
                                      {shift.shift_type}
                                    </span>
                                  </td>
                                  <td className="py-2.5">
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => openEditShift(i)} className="p-1.5 rounded-lg text-[var(--primary-blue)] hover:bg-blue-50">
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => removeShift(i)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </WizardSectionCard>

                    {/* Inline shift form */}
                    {showShiftForm && (
                      <WizardSectionCard title={editingShiftIdx !== null ? 'Edit Shift Template' : 'Add Shift Template'} icon={Clock}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Field label="Shift name *">
                            <TextInput value={shiftDraft.name} onChange={v => setShiftDraft(p => ({ ...p, name: v }))} placeholder="e.g. Morning Shift" />
                          </Field>
                          <Field label="Shift type">
                            <SearchableSelect
                              value={shiftDraft.shift_type}
                              onChange={v => setShiftDraft(p => ({ ...p, shift_type: String(v) as any }))}
                              placeholder="Select Type"
                              options={SHIFT_TYPES}
                              showAllOption={false}
                            />
                          </Field>
                          <Field label="Start time">
                            <TimeInput value={shiftDraft.start_time} onChange={v => setShiftDraft(p => ({ ...p, start_time: v }))} />
                          </Field>
                          <Field label="End time">
                            <TimeInput value={shiftDraft.end_time} onChange={v => setShiftDraft(p => ({ ...p, end_time: v }))} />
                          </Field>
                          <Field label="Break duration (minutes)">
                            <NumInput value={shiftDraft.break_duration} onChange={v => setShiftDraft(p => ({ ...p, break_duration: v ?? 0 }))} />
                          </Field>
                        </div>
                        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-color)]">
                          <button
                            onClick={saveShift}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600"
                          >
                            <Save className="w-3.5 h-3.5" /> {editingShiftIdx !== null ? 'Update Shift' : 'Save Shift'}
                          </button>
                          <button
                            onClick={() => { setShowShiftForm(false); setEditingShiftIdx(null); }}
                            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </WizardSectionCard>
                    )}
                  </div>
                )}

                {/* ─── Tab 3: Thresholds & Overtime ─── */}
                {wizardTab === 'thresholds' && (
                  <div className="space-y-4">
                    <WizardSectionCard title="Late & Half-Day Thresholds" icon={SlidersHorizontal}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Late mark threshold (minutes)" help="Minutes after scheduled start to trigger a late mark.">
                          <NumInput value={config.late_mark_threshold_minutes} onChange={v => setField('late_mark_threshold_minutes', v ?? 0)} />
                        </Field>
                        <Field label="Half-day threshold (hours)" help="Working hours below this = half day.">
                          <NumInput value={config.half_day_threshold_hours} onChange={v => setField('half_day_threshold_hours', v ?? 0)} />
                        </Field>
                        <Field label="Minimum hours for full day" help="Minimum hours worked to count as a full day present.">
                          <NumInput value={config.min_hours_for_full_day} onChange={v => setField('min_hours_for_full_day', v ?? 0)} />
                        </Field>
                      </div>
                    </WizardSectionCard>

                    <WizardSectionCard title="Overtime Settings" icon={SlidersHorizontal}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Overtime threshold (hours)" help="Hours worked beyond this in a day trigger overtime.">
                          <NumInput value={config.overtime_threshold_hours} onChange={v => setField('overtime_threshold_hours', v ?? 0)} />
                        </Field>
                        <Field label="Overtime rate (x)" help="e.g. 1.5x means 1.5x regular hourly rate.">
                          <NumInput value={config.overtime_rate} onChange={v => setField('overtime_rate', v ?? 0)} />
                        </Field>
                        <Field label="Max overtime hours / month" help="Maximum OT hours allowed per month.">
                          <NumInput value={config.max_overtime_hours_per_month} onChange={v => setField('max_overtime_hours_per_month', v ?? 0)} />
                        </Field>
                      </div>
                    </WizardSectionCard>

                    <WizardSectionCard title="Compensatory Off" icon={CalendarDays}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Toggle
                            label="Compensatory off enabled"
                            help="Allow employees to claim compensatory off instead of OT pay."
                            checked={config.comp_off_enabled}
                            onChange={v => setField('comp_off_enabled', v)}
                          />
                        </div>
                        {config.comp_off_enabled && (
                          <Field label="Max comp-off balance (days)" help="Maximum comp-off days an employee can accumulate.">
                            <NumInput value={config.max_comp_off_balance} onChange={v => setField('max_comp_off_balance', v ?? 0)} />
                          </Field>
                        )}
                      </div>
                    </WizardSectionCard>
                  </div>
                )}

                {/* ─── Tab 4: Geofencing ─── */}
                {wizardTab === 'geofencing' && (
                  <div className="space-y-4">
                    <WizardSectionCard title="Location-based Check-in" icon={Globe}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Toggle
                            label="Geofencing enabled"
                            help="Restrict check-in/out to branch locations."
                            checked={config.geofencing_enabled}
                            onChange={v => setField('geofencing_enabled', v)}
                          />
                        </div>
                        {config.geofencing_enabled && (
                          <Field label="Geo-fence radius (meters)" help="Allowed check-in/out radius from branch location.">
                            <NumInput value={config.geofence_radius_meters} onChange={v => setField('geofence_radius_meters', v ?? 0)} />
                          </Field>
                        )}
                      </div>
                    </WizardSectionCard>

                    <WizardSectionCard title="IP Restriction" icon={MapPin}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Toggle
                            label="IP restriction enabled"
                            help="Restrict check-in to office IP ranges."
                            checked={config.ip_restriction_enabled}
                            onChange={v => setField('ip_restriction_enabled', v)}
                          />
                        </div>
                        {config.ip_restriction_enabled && (
                          <Field label="Allowed IP ranges" help="Comma-separated, e.g. 192.168.1.0/24, 10.0.0.0/8">
                            <TextInput
                              value={config.allowed_ip_ranges}
                              onChange={v => setField('allowed_ip_ranges', v)}
                              placeholder="192.168.1.0/24, 10.0.0.0/8"
                            />
                          </Field>
                        )}
                      </div>
                    </WizardSectionCard>

                    <WizardSectionCard title="WiFi-based Check-in" icon={Wifi}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Toggle
                            label="WiFi-based check-in"
                            help="Allow check-in only when connected to office WiFi."
                            checked={config.wifi_checkin_enabled}
                            onChange={v => setField('wifi_checkin_enabled', v)}
                          />
                        </div>
                        {config.wifi_checkin_enabled && (
                          <Field label="Allowed SSIDs" help="Comma-separated WiFi network names.">
                            <TextInput
                              value={config.allowed_ssids}
                              onChange={v => setField('allowed_ssids', v)}
                              placeholder="Office-WiFi, Guest-Network"
                            />
                          </Field>
                        )}
                      </div>
                    </WizardSectionCard>
                  </div>
                )}

                {/* ─── Tab 5: Attendance to Payroll ─── */}
                {wizardTab === 'payroll' && (
                  <div className="space-y-4">
                    <div className="text-xs text-[var(--text-tertiary)] bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <b>How attendance flows into salary:</b> Present / Late / Work-from-home = full paid day ·
                      Absent = unpaid · Half-day = 50% (or full if toggled below) · Holiday = paid if toggled below ·
                      Leave = paid/unpaid per its type.
                    </div>

                    <WizardSectionCard title="Attendance to Payroll Mapping" icon={MapPin}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <Toggle
                          label="Half day as full paid"
                          help="Whether half-day counts as full day pay."
                          checked={config.half_day_as_full_paid}
                          onChange={v => setField('half_day_as_full_paid', v)}
                        />
                        <Toggle
                          label="Paid leave as present"
                          help="Whether paid leaves count as present days for payroll."
                          checked={config.paid_leave_as_present}
                          onChange={v => setField('paid_leave_as_present', v)}
                        />
                        <Toggle
                          label="Holiday as paid"
                          help="Whether gazetted holidays are auto-marked as paid."
                          checked={config.holiday_as_paid}
                          onChange={v => setField('holiday_as_paid', v)}
                        />
                        <Toggle
                          label="Weekend tracking"
                          help="Track attendance on weekends (for 6-day week orgs)."
                          checked={config.weekend_tracking}
                          onChange={v => setField('weekend_tracking', v)}
                        />
                        <Toggle
                          label="Manual override allowed"
                          help="Allow managers to manually edit attendance records."
                          checked={config.manual_override_allowed}
                          onChange={v => setField('manual_override_allowed', v)}
                        />
                        <Toggle
                          label="Auto-approve if no mark"
                          help="Auto-mark as present if no check-in/out recorded (for work-from-home)."
                          checked={config.auto_approve_if_no_mark}
                          onChange={v => setField('auto_approve_if_no_mark', v)}
                        />
                        <Toggle
                          label="Shift-based payroll"
                          help="Use shift differential for payroll calculations."
                          checked={config.shift_based_payroll}
                          onChange={v => setField('shift_based_payroll', v)}
                        />
                      </div>
                    </WizardSectionCard>
                  </div>
                )}

                {/* ─── Tab 6: Bulk Settings ─── */}
                {wizardTab === 'bulk' && (
                  <div className="space-y-4">
                    <WizardSectionCard title="Bulk Update Scope" icon={FileText}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Scope" help="Select the scope to apply this configuration to.">
                          <SearchableSelect
                            value={bulkScope}
                            onChange={v => setBulkScope(String(v))}
                            placeholder="Select Scope"
                            options={[
                              { id: 'company', name: 'Entire Company' },
                              { id: 'branch', name: 'Branch' },
                              { id: 'department', name: 'Department' },
                            ]}
                            showAllOption={false}
                          />
                        </Field>
                        {bulkScope === 'company' && (
                          <Field label="Company">
                            <SearchableSelect
                              value={bulkCompanyId ?? 'all'}
                              onChange={v => setBulkCompanyId(v === 'all' ? null : Number(v))}
                              placeholder="Select Company"
                              options={companies.map((c: any) => ({ id: c.id, name: c.name }))}
                              allOption="All Companies"
                            />
                          </Field>
                        )}
                        {bulkScope === 'branch' && (
                          <Field label="Branch">
                            <SearchableSelect
                              value={bulkBranchId ?? 'all'}
                              onChange={v => setBulkBranchId(v === 'all' ? null : Number(v))}
                              placeholder="Select Branch"
                              options={branches.map((b: any) => ({ id: b.id, name: b.name }))}
                              allOption="All Branches"
                            />
                          </Field>
                        )}
                        {bulkScope === 'department' && (
                          <Field label="Department">
                            <SearchableSelect
                              value={bulkDepartmentId ?? 'all'}
                              onChange={v => setBulkDepartmentId(v === 'all' ? null : Number(v))}
                              placeholder="Select Department"
                              options={departments.map((d: any) => ({ id: d.id, name: d.name }))}
                              allOption="All Departments"
                            />
                          </Field>
                        )}
                      </div>
                      <div className="pt-4">
                        <button
                          onClick={() => {
                            if (!editingId) {
                              toast.error('Save the configuration first before applying in bulk.');
                              return;
                            }
                            bulkApplyMutation.mutate({
                              config_id: editingId,
                              scope: bulkScope,
                              ...(bulkCompanyId ? { company_id: bulkCompanyId } : {}),
                              ...(bulkBranchId ? { branch_id: bulkBranchId } : {}),
                              ...(bulkDepartmentId ? { department_id: bulkDepartmentId } : {}),
                            });
                          }}
                          disabled={bulkApplyMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {bulkApplyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                          Apply to all employees in scope
                        </button>
                      </div>
                    </WizardSectionCard>

                    <WizardSectionCard title="Import / Export" icon={FileText}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-dashed border-[var(--border-color)] rounded-xl p-6 text-center hover:border-amber-300 transition-colors">
                          <Upload className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-[var(--text-primary)]">Import Attendance Config</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">Upload a JSON or CSV file</p>
                          <button className="mt-3 px-4 py-2 rounded-lg text-sm font-medium border border-amber-300 text-amber-700 hover:bg-amber-50">
                            Choose File
                          </button>
                        </div>
                        <div className="border border-dashed border-[var(--border-color)] rounded-xl p-6 text-center hover:border-amber-300 transition-colors">
                          <Download className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-[var(--text-primary)]">Export Attendance Config</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">Download current config as JSON</p>
                          <button
                            onClick={() => {
                              const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `attendance-config-${config.name.replace(/\s+/g, '-').toLowerCase()}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                              toast.success('Config exported');
                            }}
                            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium border border-amber-300 text-amber-700 hover:bg-amber-50"
                          >
                            Download JSON
                          </button>
                        </div>
                      </div>
                    </WizardSectionCard>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" /> {config.shifts.length} shifts
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" /> {config.working_days_per_week}-day week
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" /> {config.work_start_time} – {config.work_end_time}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !config.name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Create Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Standalone list view (used outside the modal) ──

export function AttendanceConfigList({ standalone = false }: { standalone?: boolean }) {
  const queryClient = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState<number | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['attendance-configs', companyFilter],
    queryFn: async () => {
      try {
        const params = companyFilter !== 'all' ? { company_id: companyFilter } : {};
        const r = await api.get('/settings/configs/attendance', { params });
        return r.data || [];
      } catch { return []; }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/configs/attendance/${id}`),
    onSuccess: () => {
      toast.success('Config deleted');
      queryClient.invalidateQueries({ queryKey: ['attendance-configs'] });
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to delete')),
  });

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c: any) => [c.id, c.name]));
    return (id: number | null) => (id == null ? 'All Companies' : m.get(id) || '—');
  }, [companies]);

  return (
    <div className={standalone ? 'p-6 space-y-6' : 'space-y-6'}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-600" /> Attendance Configuration
          </h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Manage work schedules, shifts, thresholds, geofencing and attendance-to-payroll mapping across your organization.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600"
        >
          <Plus className="w-4 h-4" /> Create Configuration
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatBox label="Configurations" value={configs.length} icon={FileText} />
        <StatBox label="Companies covered" value={new Set(configs.map((c: any) => c.company_id).filter(Boolean)).size} icon={Building2} />
        <StatBox label="Active policies" value={configs.filter((c: any) => c.status !== 'inactive').length} icon={CheckCircle2} />
        <StatBox label="Total shifts" value={configs.reduce((s: number, c: any) => s + (c.shifts?.length || 0), 0)} icon={Clock} />
      </div>

      <div className="flex items-center gap-3">
        <div className="w-64">
          <SearchableSelect
            value={companyFilter}
            onChange={setCompanyFilter}
            options={[{ id: 'all', name: 'All Companies' }, ...companies.map((c: any) => ({ id: c.id, name: c.name }))]}
            placeholder="Filter by company"
          />
        </div>
      </div>

      {isLoading ? null : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {configs.map((cfg: any) => (
            <div key={cfg.id} className="bg-white rounded-2xl border border-[var(--border-color)] p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{cfg.name}</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">{companyName(cfg.company_id)}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Week</div>
                  <div className="font-medium text-[var(--text-primary)]">{cfg.working_days_per_week || 5} days</div>
                </div>
                <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Hours</div>
                  <div className="font-medium text-[var(--text-primary)]">{cfg.work_start_time || '09:00'} – {cfg.work_end_time || '18:00'}</div>
                </div>
                <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Grace</div>
                  <div className="font-medium text-[var(--text-primary)]">{cfg.grace_period_minutes ?? 15} min</div>
                </div>
                <div className="bg-[var(--background)] rounded-lg px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Shifts</div>
                  <div className="font-medium text-[var(--text-primary)]">{cfg.shifts?.length || 0}</div>
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete attendance config "${cfg.name}"?`)) {
                      deleteMutation.mutate(cfg.id);
                    }
                  }}
                  className="flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {configs.length === 0 && !isLoading && (
        <p className="text-sm text-[var(--text-tertiary)] bg-amber-50 border border-amber-100 rounded-lg p-3">
          No attendance configurations yet — click <b>Create Configuration</b> above to set one up.
        </p>
      )}

      <AttendanceConfig open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
