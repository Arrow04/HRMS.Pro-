import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Building2, FileText, Edit2, Trash2, X, CheckCircle2, Users, MapPin,
  CalendarDays, Clock, CalendarClock, CalendarCheck, Zap, Navigation, ChevronUp, ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '../services/api';
import SearchableSelect from './SearchableSelect';
import ToggleSwitch from './ToggleSwitch';
import { useAuth } from '../context/AuthContext';
import { useMasterData } from '../hooks/useMasterData';

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">{label}</label>
      {children}
      {help && <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</p>}
    </div>
  );
}
const inputCls = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2] bg-white text-[var(--text-primary)]";
function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-[var(--background)] hover:bg-[var(--hover-bg)]">
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

const DAYS = [
  { id: 0, name: 'Sunday' }, { id: 1, name: 'Monday' }, { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' }, { id: 4, name: 'Thursday' }, { id: 5, name: 'Friday' }, { id: 6, name: 'Saturday' },
];
interface WizardState {
  name: string; companyId: number | null; description: string; status: string; effectiveFrom: string;
  workingDays: number[]; shiftId: number | null; halfDayAsFullPaid: boolean; paidLeaveAsPresent: boolean; holidayAsPresent: boolean;
  lateMarkThresholdMinutes: number | null; halfDayThresholdHours: number | null;
  overtimeThresholdHours: number | null; overtimeRate: number | null;
  wfhAllowed: boolean; geofenceEnabled: boolean; geofenceRadius: number | null;
  lateToAbsentCount: number | null; earlyToAbsentCount: number | null; missingCheckoutRule: string;
  checkInTime: string; checkOutTime: string; breakHours: number | null;
  compOffEnabled: boolean; maxCompOffBalance: number | null;
  maxOvertimeHoursPerMonth: number | null;
  selfieCheckinEnabled: boolean;
  ipRestrictionEnabled: boolean; allowedIpRanges: string[];
  wifiCheckinEnabled: boolean; allowedSsids: string[];
  autoApproveIfNoMark: boolean; minHoursForFullDay: number | null;
  shiftBasedPayroll: boolean;
}
const blankWizard = (): WizardState => ({
  name: '', companyId: null, description: '', status: 'active', effectiveFrom: '',
  workingDays: [], shiftId: null, halfDayAsFullPaid: false, paidLeaveAsPresent: false, holidayAsPresent: false,
  lateMarkThresholdMinutes: null, halfDayThresholdHours: null,
  overtimeThresholdHours: null, overtimeRate: null,
  wfhAllowed: false, geofenceEnabled: false, geofenceRadius: null,
  lateToAbsentCount: null, earlyToAbsentCount: null, missingCheckoutRule: 'half_day',
  checkInTime: '', checkOutTime: '', breakHours: null,
  compOffEnabled: false, maxCompOffBalance: null,
  maxOvertimeHoursPerMonth: null,
  selfieCheckinEnabled: false,
  ipRestrictionEnabled: false, allowedIpRanges: [],
  wifiCheckinEnabled: false, allowedSsids: [],
  autoApproveIfNoMark: false, minHoursForFullDay: null,
  shiftBasedPayroll: false,
});
const WIZ_TABS = [
  { id: 'overview', label: 'Overview', icon: Building2, color: 'text-blue-600' },
  { id: 'workweek', label: 'Workweek', icon: CalendarDays, color: 'text-emerald-600' },
  { id: 'shift', label: 'Shift', icon: CalendarClock, color: 'text-cyan-600' },
  { id: 'status', label: 'Status Rules', icon: CalendarCheck, color: 'text-teal-600' },
  { id: 'timings', label: 'Timings & Rules', icon: Clock, color: 'text-violet-600' },
  { id: 'overtime', label: 'Overtime', icon: Zap, color: 'text-amber-600' },
  { id: 'compoff', label: 'Comp-off', icon: CalendarClock, color: 'text-pink-600' },
  { id: 'verification', label: 'Verification', icon: Users, color: 'text-rose-600' },
  { id: 'autorules', label: 'Auto Rules', icon: CheckCircle2, color: 'text-indigo-600' },
  { id: 'geo', label: 'Geo-fence', icon: Navigation, color: 'text-rose-600' },
];

const WIZARD_HELP: Record<string, string> = {
  overview: 'Name, company and effective date for this template.',
  workweek: 'Which days people work — the rest are unpaid week-offs.',
  shift: 'Default shift for employees on this template — timings, grace and breaks.',
  status: 'What each attendance status is worth in pay, plus late/early conversion rules.',
  timings: 'Pay mapping, late thresholds and work-from-home.',
  overtime: 'Daily threshold and rate multiplier for overtime pay.',
  geo: 'Branch fence for check-in/out punches.',
};
const BASE = '/api/payroll-config/attendance-policies';

export default function AttendanceTemplateManager() {
  const queryClient = useQueryClient();
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [wizTab, setWizTab] = useState('overview');

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['attendance-templates', companyFilter],
    queryFn: async () => {
      const params = companyFilter === 'all' ? {} : { companyId: Number(companyFilter) };
      const r = await api.get(BASE, { params });
      return r.data || [];
    },
  });
  const companyName = useMemo(() => {
    const m = new Map((companies as any[]).map((c: any) => [c.id, c.name]));
    return (id: number | null) => (id == null ? 'All Companies' : m.get(id) || '—');
  }, [companies]);
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts-for-template', companyFilter],
    queryFn: async () => {
      const params = companyFilter === 'all' ? { status: 'active' } : { status: 'active', company_id: Number(companyFilter) };
      const r = await api.get('/shifts', { params });
      return r.data?.data || r.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: (w: { id: number | null; state: WizardState }) => {
      const payload = {
        name: w.state.name.trim(),
        description: w.state.description.trim(),
        company_id: w.state.companyId,
        status: w.state.status,
        effective_from: w.state.effectiveFrom || null,
        working_days: [...w.state.workingDays].sort((a, b) => a - b).join(','),
        working_days_per_week: w.state.workingDays.length,
        half_day_as_full_paid: w.state.halfDayAsFullPaid,
        paid_leave_as_present: w.state.paidLeaveAsPresent,
        holiday_as_present: w.state.holidayAsPresent,
        late_mark_threshold_minutes: w.state.lateMarkThresholdMinutes,
        half_day_threshold_hours: w.state.halfDayThresholdHours,
        overtime_threshold_hours: w.state.overtimeThresholdHours,
        overtime_rate: w.state.overtimeRate,
        wfh_allowed: w.state.wfhAllowed,
        geofence_enabled: w.state.geofenceEnabled,
        geofence_radius: w.state.geofenceRadius,
        shift_id: w.state.shiftId,
        late_to_absent_count: w.state.lateToAbsentCount,
        early_to_absent_count: w.state.earlyToAbsentCount,
        missing_checkout_rule: w.state.missingCheckoutRule || null,
        check_in_time: w.state.checkInTime || null,
        check_out_time: w.state.checkOutTime || null,
        break_hours: w.state.breakHours,
        comp_off_enabled: w.state.compOffEnabled,
        max_comp_off_balance: w.state.maxCompOffBalance,
        max_overtime_hours_per_month: w.state.maxOvertimeHoursPerMonth,
        selfie_checkin_enabled: w.state.selfieCheckinEnabled,
        ip_restriction_enabled: w.state.ipRestrictionEnabled,
        allowed_ip_ranges: w.state.allowedIpRanges.length ? w.state.allowedIpRanges : null,
        wifi_checkin_enabled: w.state.wifiCheckinEnabled,
        allowed_ssids: w.state.allowedSsids.length ? w.state.allowedSsids : null,
        auto_approve_if_no_mark: w.state.autoApproveIfNoMark,
        min_hours_for_full_day: w.state.minHoursForFullDay,
        shift_based_payroll: w.state.shiftBasedPayroll,
      };
      return w.id ? api.put(`${BASE}/${w.id}`, payload) : api.post(BASE, payload);
    },
    onSuccess: () => {
      toast.success('Attendance template saved');
      queryClient.invalidateQueries({ queryKey: ['attendance-templates'] });
      setWizard(null); setEditingId(null); setWizTab('overview');
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save template'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`${BASE}/${id}`),
    onSuccess: () => { toast.success('Template deactivated'); queryClient.invalidateQueries({ queryKey: ['attendance-templates'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to delete template'),
  });

  const parseDays = (s: any): number[] => String(s || '1,2,3,4,5,6').split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
  const openCreate = () => {
    setEditingId(null); setReadOnly(false); setWizTab('overview');
    const w = blankWizard();
    w.companyId = companyFilter === 'all' ? null : Number(companyFilter);
    setWizard(w);
  };
  const fromTemplate = (t: any): WizardState => ({
    name: t.name, companyId: t.company_id ?? null, description: t.description || '',
    status: t.status || 'active', effectiveFrom: (t.effective_from || '').slice(0, 10),
    workingDays: parseDays(t.working_days),
    shiftId: t.shift_id ?? null,
    halfDayAsFullPaid: !!t.half_day_as_full_paid,
    paidLeaveAsPresent: !!t.paid_leave_as_present,
    holidayAsPresent: !!t.holiday_as_present,
    lateMarkThresholdMinutes: t.late_mark_threshold_minutes ?? null,
    halfDayThresholdHours: t.half_day_threshold_hours ?? null,
    overtimeThresholdHours: t.overtime_threshold_hours ?? null,
    overtimeRate: t.overtime_rate ?? null,
    wfhAllowed: !!t.wfh_allowed, geofenceEnabled: !!t.geofence_enabled,
    geofenceRadius: t.geofence_radius ?? null,
    lateToAbsentCount: t.late_to_absent_count ?? null,
    earlyToAbsentCount: t.early_to_absent_count ?? null,
    missingCheckoutRule: t.missing_checkout_rule || 'half_day',
    checkInTime: t.check_in_time || '',
    checkOutTime: t.check_out_time || '',
    breakHours: t.break_hours ?? null,
    compOffEnabled: !!t.comp_off_enabled,
    maxCompOffBalance: t.max_comp_off_balance ?? null,
    maxOvertimeHoursPerMonth: t.max_overtime_hours_per_month ?? null,
    selfieCheckinEnabled: !!t.selfie_checkin_enabled,
    ipRestrictionEnabled: !!t.ip_restriction_enabled,
    allowedIpRanges: Array.isArray(t.allowed_ip_ranges) ? t.allowed_ip_ranges : [],
    wifiCheckinEnabled: !!t.wifi_checkin_enabled,
    allowedSsids: Array.isArray(t.allowed_ssids) ? t.allowed_ssids : [],
    autoApproveIfNoMark: !!t.auto_approve_if_no_mark,
    minHoursForFullDay: t.min_hours_for_full_day ?? null,
    shiftBasedPayroll: !!t.shift_based_payroll,
  });
  const openEdit = (t: any) => { setEditingId(t.id); setReadOnly(false); setWizTab('overview'); setWizard(fromTemplate(t)); };
  const openView = (t: any) => { openEdit(t); setReadOnly(true); };
  const toggleDay = (d: number) =>
    setWizard((prev) => (prev ? { ...prev, workingDays: prev.workingDays.includes(d) ? prev.workingDays.filter((x) => x !== d) : [...prev.workingDays, d] } : prev));
  const submit = () => {
    if (!wizard) return;
    if (!wizard.name.trim()) { toast.error('Template name is required'); return; }
    if (!wizard.companyId) { toast.error('Pick the company this template belongs to'); return; }
    if (wizard.workingDays.length === 0) { toast.error('Select at least one working day'); return; }
    saveMutation.mutate({ id: editingId, state: wizard });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Configure Attendance</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Company-wise attendance templates. Each template sets the workweek, timing rules, overtime and
            geo-fencing. Pick a template on the employee form — payroll divides by these days.
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Create Template
        </button>
      </div>

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Templates', value: (templates as any[]).length, icon: FileText },
          { label: 'Companies covered', value: new Set((templates as any[]).map((t: any) => t.company_id)).size, icon: MapPin },
          { label: 'Active', value: (templates as any[]).filter((t: any) => t.status === 'active').length, icon: CheckCircle2 },
          { label: 'With geo-fence', value: (templates as any[]).filter((t: any) => t.geofence_enabled).length, icon: Navigation },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-color)] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <s.icon className="w-4 h-4 text-amber-600" />
            </div>
            <div><div className="text-lg font-bold text-[var(--text-primary)]">{s.value}</div>
            <div className="text-xs text-[var(--text-tertiary)]">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="w-64">
          <SearchableSelect value={companyFilter} onChange={(v) => setCompanyFilter(String(v))}
            options={[{ id: 'all', name: 'All Companies' }, ...(companies as any[]).map((c: any) => ({ id: c.id, name: c.name }))]}
            placeholder="Filter by company" />
        </div>
      </div>

      {isLoading ? null : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(templates as any[]).map((t: any) => (
            <div key={t.id} className="bg-white rounded-2xl border border-[var(--border-color)] p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{t.name}</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">{companyName(t.company_id)}{t.version ? ` · v${t.version}` : ''}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.status}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.description || 'No description'}</p>
              <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)] mb-4">
                <span>{parseDays(t.working_days).length} days/week</span>
                <span>{t.wfh_allowed ? 'WFH allowed' : 'No WFH'}</span>
                <span>{t.geofence_enabled ? 'Geo-fenced' : 'No geo-fence'}</span>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button onClick={() => openView(t)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                  <FileText className="w-3.5 h-3.5" /> View
                </button>
                <button onClick={() => openEdit(t)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => { if (confirm(`Deactivate template "${t.name}"?`)) deleteMutation.mutate(t.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(templates as any[]).length === 0 && !isLoading && (
        <div className="text-center py-12 text-[var(--text-tertiary)]">No attendance templates yet — create the first one for a company.</div>
      )}

      {/* ---------- wizard (full page, like payroll template) ---------- */}
      {wizard && (
        <AttendanceWizardModal
          wizard={wizard} setWizard={setWizard} wizTab={wizTab} setWizTab={setWizTab}
          companies={companies as any[]} shifts={shifts as any[]} editingId={editingId} readOnly={readOnly}
          saving={saveMutation.isPending} onSubmit={submit}
        />
      )}
    </div>
  );
}

function AttendanceWizardModal(props: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState | null>>;
  wizTab: string;
  setWizTab: (t: string) => void;
  companies: any[];
  shifts: any[];
  editingId: number | null;
  readOnly: boolean;
  saving: boolean;
  onSubmit: () => void;
}) {
  const { wizard, setWizard, wizTab, setWizTab, companies, shifts, editingId, readOnly, saving, onSubmit } = props;
  const accent = '#1C64F2';
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: statusMaster = [] } = useMasterData('ATTENDANCE_STATUS');
  const missingCheckoutOptions = (statusMaster as any[]).length > 0
    ? (statusMaster as any[]).filter((o: any) => o.is_active !== false).map((o: any) => ({ id: o.code, name: o.name }))
    : [{ id: 'half_day', name: 'Half Day' }, { id: 'absent', name: 'Absent' }];
  const toggleDay = (d: number) =>
    setWizard((prev) => (prev ? { ...prev, workingDays: prev.workingDays.includes(d) ? prev.workingDays.filter((x) => x !== d) : [...prev.workingDays, d] } : prev));

  const done = [
    !!(wizard.name.trim() && wizard.companyId != null),
    wizard.workingDays.length > 0,
    true,
    true,
    true,
    true,
    true,
  ].filter(Boolean).length;
  const progress = Math.min(100, Math.round((done / WIZ_TABS.length) * 100));
  const selectedShift = (shifts as any[]).find((s: any) => s.id === wizard.shiftId);

  /* ---- inline shift configure (create / edit / deactivate) ---- */
  interface ShiftFormState { id: number | null; name: string; code: string; shift_type: string; start_time: string; end_time: string; grace_minutes: number | null; break_duration: number | null; workingDays: number[]; description: string; }
  const blankShiftForm = (): ShiftFormState => ({
    id: null, name: '', code: '', shift_type: 'morning', start_time: '09:00', end_time: '18:00',
    grace_minutes: 15, break_duration: 60, workingDays: [...wizard.workingDays], description: '',
  });
  const [shiftForm, setShiftForm] = useState<ShiftFormState | null>(null);
  const [savingShift, setSavingShift] = useState(false);
  const toggleShiftDay = (d: number) =>
    setShiftForm((prev) => (prev ? { ...prev, workingDays: prev.workingDays.includes(d) ? prev.workingDays.filter((x) => x !== d) : [...prev.workingDays, d] } : prev));
  const openEditShift = (s: any) => setShiftForm({
    id: s.id, name: s.name || '', code: s.code || '', shift_type: s.shift_type || s.shiftType || 'morning',
    start_time: (s.start_time || s.startTime || '09:00').slice(0, 5), end_time: (s.end_time || s.endTime || '18:00').slice(0, 5),
    grace_minutes: s.grace_minutes ?? s.graceMinutes ?? 15, break_duration: s.break_duration ?? s.breakDuration ?? 60,
    workingDays: String(s.working_days ?? s.workingDays ?? '1,2,3,4,5,6').split(',').map((x: string) => Number(x.trim())).filter((x: number) => !Number.isNaN(x)),
    description: s.description || '',
  });
  const saveShiftMutation = useMutation({
    mutationFn: async (f: ShiftFormState) => {
      if (!f.name.trim()) throw new Error('Shift name is required');
      if (!f.code.trim()) throw new Error('Shift code is required');
      const orgId = (user as any)?.organizationId
        ?? (companies as any[]).find((c: any) => c.id === wizard.companyId)?.organization_id
        ?? (companies as any[]).find((c: any) => c.id === wizard.companyId)?.organizationId;
      if (!orgId) throw new Error('Organization not resolved — re-login and retry');
      const payload = {
        name: f.name.trim(), code: f.code.trim().toUpperCase(), shift_type: f.shift_type,
        start_time: f.start_time || '09:00', end_time: f.end_time || '18:00',
        grace_minutes: Number(f.grace_minutes) || 0, break_duration: Number(f.break_duration) || 0,
        working_days: [...f.workingDays].sort((a, b) => a - b).join(','),
        color: '#3B82F6', description: f.description.trim(),
        organization_id: orgId, company_id: wizard.companyId, status: 'active',
      };
      const res = f.id ? await api.put(`/shifts/${f.id}`, payload) : await api.post('/shifts/', payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      toast.success(shiftForm?.id ? 'Shift updated' : 'Shift created');
      const id = data?.id || shiftForm?.id;
      if (id) setWizard({ ...wizard, shiftId: Number(id) });
      setShiftForm(null);
      queryClient.invalidateQueries({ queryKey: ['shifts-for-template'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e?.message || 'Failed to save shift'),
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={() => setWizard(null)} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {readOnly ? 'Attendance Template' : editingId ? 'Edit Attendance Template' : 'Create Attendance Template'}
              </h2>
              <p className="text-xs text-[#64748B]">Configure everything once, reuse everywhere.</p>
            </div>
          </div>
          <button onClick={() => setWizard(null)} title="Close" className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
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
            are mandatory. Click Save at the bottom to {editingId ? 'update' : 'create'} the template.
          </p>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
            <div className="py-2 px-3">
              <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
              <nav className="space-y-0.5">
                {WIZ_TABS.map((t) => {
                  const active = t.id === wizTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWizTab(t.id)}
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
            <div key={wizTab} className="section-fade-in">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}14` }}>
                  {(() => { const t = WIZ_TABS.find(x => x.id === wizTab); const Icon = t?.icon || Building2; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZ_TABS.find(x => x.id === wizTab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[wizTab] || ''}</p>
                </div>
              </div>
              <div className="space-y-4">
              {wizTab === 'overview' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Template Name" help="A friendly name so you can identify this template (e.g. Factory 6-day — Acme).">
                      <input className={inputCls} disabled={readOnly} value={wizard.name} placeholder="Factory 6-day — Acme" onChange={(e) => setWizard({ ...wizard, name: e.target.value })} />
                    </Field>
                    <Field label="Company *" help="Only employees of this company can pick this template.">
                      <SearchableSelect value={wizard.companyId ?? ''} onChange={(v) => setWizard({ ...wizard, companyId: v === '' ? null : Number(v) })}
                        options={(companies as any[]).map((c: any) => ({ id: c.id, name: c.name }))} placeholder="Select company" disabled={readOnly} />
                    </Field>
                    <Field label="Effective From" help="Rules apply from this date. Payroll for earlier months keeps the old rules.">
                      <input type="date" className={inputCls} disabled={readOnly} value={wizard.effectiveFrom} onChange={(e) => setWizard({ ...wizard, effectiveFrom: e.target.value })} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Description" help="Who this template is for (shifts, sites, staff categories).">
                      <input className={inputCls} disabled={readOnly} value={wizard.description} placeholder="All factory floor staff" onChange={(e) => setWizard({ ...wizard, description: e.target.value })} />
                    </Field>
                    <Field label="Status" help="Inactive templates stay visible for history but can't be picked for new employees.">
                      <SearchableSelect value={wizard.status} onChange={(v) => setWizard({ ...wizard, status: String(v) })}
                        options={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]} disabled={readOnly} />
                    </Field>
                  </div>
                </>
              )}
              {wizTab === 'workweek' && (
                <SectionCard title="Working days" icon={CalendarDays}>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Tick the days people work. Unpicked days are week-offs — unpaid and excluded when payroll divides salary. Sunday off = Mon–Sat.</p>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((d) => (
                      <button key={d.id} type="button" disabled={readOnly}
                        onClick={() => toggleDay(d.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${wizard.workingDays.includes(d.id) ? 'bg-[#1C64F2] text-white border-[#1C64F2]' : 'border-[var(--border-color)] text-[var(--text-tertiary)] hover:border-[#1C64F2]'}`}>
                        {d.name.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </SectionCard>
              )}
              {wizTab === 'shift' && (
                <>
                <SectionCard title="Default shift" icon={CalendarClock}>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Links one shift master (managed in Attendance → Duty Shift) as this template's company default — its start/end, grace and break flow into attendance evaluation. Roster assignments can still override per employee.</p>
                  <Field label="Shift" help="Shifts are managed on the Attendance page (Duty Shift tab). Only active shifts of this company are listed.">
                    <SearchableSelect value={wizard.shiftId ?? ''} onChange={(v) => setWizard({ ...wizard, shiftId: v === '' ? null : Number(v) })}
                      options={(shifts as any[]).map((s: any) => ({ id: s.id, name: `${s.name} (${s.start_time || s.startTime || '?'} – ${s.end_time || s.endTime || '?'})` }))}
                      placeholder="Select shift (optional)" showAllOption={false} clearable disabled={readOnly} />
                  </Field>
                  {selectedShift && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {[
                        { label: 'Timings', value: `${selectedShift.start_time || selectedShift.startTime || '—'} – ${selectedShift.end_time || selectedShift.endTime || '—'}` },
                        { label: 'Type', value: selectedShift.shift_type || selectedShift.shiftType || '—' },
                        { label: 'Grace', value: `${selectedShift.grace_minutes ?? selectedShift.graceMinutes ?? 0} min` },
                        { label: 'Break', value: `${selectedShift.break_duration ?? selectedShift.breakDuration ?? 0} min` },
                      ].map((m) => (
                        <div key={m.label} className="bg-[var(--background)] rounded-lg px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{m.label}</div>
                          <div className="font-medium text-[var(--text-primary)]">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
                <SectionCard title="Configure shifts" icon={CalendarClock}>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Create and edit this company's shifts right here — new shifts appear in the picker above instantly.</p>
                  <div className="space-y-2">
                    {(shifts as any[]).map((s: any) => (
                      <div key={s.id} className="flex items-center gap-3 border border-[var(--border-color)] rounded-lg px-3 py-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || '#3B82F6' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{s.name}</div>
                          <div className="text-[11px] text-[var(--text-tertiary)]">{(s.start_time || s.startTime || '?').slice(0, 5)} – {(s.end_time || s.endTime || '?').slice(0, 5)} · {s.code}</div>
                        </div>
                        <button type="button" onClick={() => openEditShift(s)} disabled={readOnly}
                          className="p-1.5 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors disabled:opacity-40" title="Edit shift">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button type="button" disabled={readOnly}
                          onClick={async () => {
                            if (!confirm(`Deactivate shift "${s.name}"?`)) return;
                            try { await api.delete(`/shifts/${s.id}`); toast.success('Shift deactivated'); queryClient.invalidateQueries({ queryKey: ['shifts-for-template'] }); }
                            catch (e: any) { toast.error(e?.response?.data?.detail || 'Failed'); }
                          }}
                          className="p-1.5 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors disabled:opacity-40" title="Deactivate shift">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {(shifts as any[]).length === 0 && (
                      <p className="text-xs text-[var(--text-tertiary)]">No shifts for this company yet — add the first one below.</p>
                    )}
                  </div>
                  {!readOnly && !shiftForm && (
                    <button type="button" onClick={() => setShiftForm(blankShiftForm())}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-[var(--border-color)] text-[var(--primary-blue)] hover:border-[var(--primary-blue)] transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add Shift
                    </button>
                  )}
                  {shiftForm && (
                    <div className="border border-[var(--primary-blue)]/30 rounded-xl p-4 space-y-3 bg-blue-50/30">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Field label="Shift Name *" help="e.g. Morning, Night, General.">
                          <input className={inputCls} value={shiftForm.name} placeholder="Morning" onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} />
                        </Field>
                        <Field label="Code *" help="Short unique code, e.g. MOR, NGT.">
                          <input className={inputCls} value={shiftForm.code} placeholder="MOR" onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value.toUpperCase() })} />
                        </Field>
                        <Field label="Type" help="Shift pattern category.">
                          <SearchableSelect value={shiftForm.shift_type} onChange={(v) => setShiftForm({ ...shiftForm, shift_type: String(v) })}
                            options={[{ id: 'morning', name: 'Morning' }, { id: 'evening', name: 'Evening' }, { id: 'night', name: 'Night' }, { id: 'general', name: 'General' }]}
                            showAllOption={false} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="Start *" help="Shift start (24h).">
                          <input type="time" className={inputCls} value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} />
                        </Field>
                        <Field label="End *" help="Shift end (24h).">
                          <input type="time" className={inputCls} value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} />
                        </Field>
                        <Field label="Grace (min)" help="Late flag after start + this.">
                          <input type="number" min={0} className={inputCls} value={shiftForm.grace_minutes ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setShiftForm({ ...shiftForm, grace_minutes: Number(e.target.value) })} />
                        </Field>
                        <Field label="Break (min)" help="Unpaid break duration.">
                          <input type="number" min={0} className={inputCls} value={shiftForm.break_duration ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setShiftForm({ ...shiftForm, break_duration: Number(e.target.value) })} />
                        </Field>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Working days</label>
                        <div className="flex flex-wrap gap-2">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                            <button key={d} type="button" onClick={() => toggleShiftDay(i)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${shiftForm.workingDays.includes(i) ? 'bg-[#1C64F2] text-white border-[#1C64F2]' : 'border-[var(--border-color)] text-[var(--text-tertiary)] hover:border-[#1C64F2]'}`}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShiftForm(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">Cancel</button>
                        <button type="button" onClick={() => { setSavingShift(true); saveShiftMutation.mutate(shiftForm, { onSettled: () => setSavingShift(false) }); }} disabled={savingShift}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1C64F2] text-white hover:bg-blue-700 disabled:opacity-50">
                          {savingShift ? 'Saving...' : shiftForm.id ? 'Save Shift' : 'Add Shift'}
                        </button>
                      </div>
                    </div>
                  )}
                </SectionCard>
                </>
              )}
              {wizTab === 'status' && (
                <>
                  <SectionCard title="Status → pay mapping" icon={CalendarCheck}>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Statuses themselves come from Master Data → Attendance Status. This table sets what each one is worth in pay — live preview derived from this template's toggles. This is exactly how payroll counts each day.</p>
                    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[var(--text-tertiary)] bg-[var(--background)]">
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium text-right">Paid days</th>
                            <th className="px-3 py-2 font-medium">Counts as</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { s: 'Present', p: '1.0', c: 'Present' },
                            { s: 'Late', p: '1.0', c: `Present + late flag (after ${wizard.lateMarkThresholdMinutes ?? 15} min)` },
                            { s: 'Early Departure', p: '1.0', c: 'Present + early flag' },
                            { s: 'Overtime', p: '1.0', c: 'Present + OT hours × rate' },
                            { s: 'Half Day', p: wizard.halfDayAsFullPaid ? '1.0' : '0.5', c: wizard.halfDayAsFullPaid ? 'Full paid day' : 'Half paid day' },
                            { s: 'Paid Leave', p: wizard.paidLeaveAsPresent ? '1.0' : '0', c: wizard.paidLeaveAsPresent ? 'Present' : 'Unpaid absence' },
                            { s: 'Unpaid / LOP', p: '0', c: 'Unpaid leave' },
                            { s: 'Holiday', p: wizard.holidayAsPresent ? '1.0' : '0', c: wizard.holidayAsPresent ? 'Present' : 'Unpaid' },
                            { s: 'Week Off', p: '—', c: 'Excluded from pay' },
                            { s: 'WFH', p: wizard.wfhAllowed ? '1.0' : '—', c: wizard.wfhAllowed ? 'Present' : 'Not applicable' },
                            { s: 'Absent', p: '0', c: 'Absent (unpaid)' },
                            { s: 'No checkout', ...(() => { const r = (wizard.missingCheckoutRule || 'half_day').toLowerCase().replace(/[^a-z]/g, '');
                              if (r === 'absent') return { p: '0', c: 'Absent' };
                              if (r === 'halfday' || r === 'half') return { p: wizard.halfDayAsFullPaid ? '1.0' : '0.5', c: 'Half day' };
                              if (r.includes('weekoff') || r.includes('weekend')) return { p: '—', c: 'Excluded' };
                              if (r.includes('leave')) return { p: 'Paid?', c: 'Leave (paid/unpaid per type)' };
                              if (r.includes('late')) return { p: '1.0', c: 'Present + late flag' };
                              if (r.includes('early')) return { p: '1.0', c: 'Present + early flag' };
                              if (r.includes('present') || r.includes('wfh') || r.includes('home') || r.includes('overtime')) return { p: '1.0', c: 'Present' };
                              return { p: wizard.halfDayAsFullPaid ? '1.0' : '0.5', c: 'Half day' }; })() },
                          ].map((r) => (
                            <tr key={r.s} className="border-t border-[var(--border-color)]">
                              <td className="px-3 py-1.5 font-medium text-[var(--text-primary)]">{r.s}</td>
                              <td className="px-3 py-1.5 text-right text-[var(--text-secondary)]">{r.p}</td>
                              <td className="px-3 py-1.5 text-[var(--text-tertiary)]">{r.c}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                  <SectionCard title="Conversion rules" icon={CalendarCheck}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="Lates = 1 absent after" help="Every N late marks convert to one absent day in payroll. Blank = rule off.">
                        <input type="number" min={1} disabled={readOnly} className={inputCls} value={wizard.lateToAbsentCount ?? ''} placeholder="e.g. 3" onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, lateToAbsentCount: e.target.value === '' ? null : Number(e.target.value) })} />
                      </Field>
                      <Field label="Early departures = 1 absent after" help="Every N early departures convert to one absent day. Blank = rule off.">
                        <input type="number" min={1} disabled={readOnly} className={inputCls} value={wizard.earlyToAbsentCount ?? ''} placeholder="e.g. 3" onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, earlyToAbsentCount: Number(e.target.value) })} />
                      </Field>
                      <Field label="Missing checkout counts as" help="A day with check-in but no check-out takes this status — payroll counts it accordingly.">
                        <SearchableSelect value={wizard.missingCheckoutRule} onChange={(v) => setWizard({ ...wizard, missingCheckoutRule: String(v) })}
                          options={missingCheckoutOptions} showAllOption={false} disabled={readOnly} />
                      </Field>
                    </div>
                  </SectionCard>
                </>
              )}
              {wizTab === 'timings' && (
                <>
                  <SectionCard title="Pay mapping" icon={Clock}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="Half day as full paid" help="A half-day counts as a full paid day. Off = it counts as half (0.5).">
                        <ToggleSwitch checked={wizard.halfDayAsFullPaid} onChange={(v) => setWizard({ ...wizard, halfDayAsFullPaid: v })} disabled={readOnly} align="left" />
                      </Field>
                      <Field label="Paid leave as present" help="Approved paid leave counts toward paid days. Off = leave days are unpaid absence for payroll.">
                        <ToggleSwitch checked={wizard.paidLeaveAsPresent} onChange={(v) => setWizard({ ...wizard, paidLeaveAsPresent: v })} disabled={readOnly} align="left" />
                      </Field>
                      <Field label="Holiday as present" help="Holidays count as paid days. Off = holidays are unpaid.">
                        <ToggleSwitch checked={wizard.holidayAsPresent} onChange={(v) => setWizard({ ...wizard, holidayAsPresent: v })} disabled={readOnly} align="left" />
                      </Field>
                    </div>
                  </SectionCard>
                  <SectionCard title="Late & half-day thresholds" icon={Clock}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Late after (minutes)" help="Check-in later than shift start + this is flagged Late.">
                        <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.lateMarkThresholdMinutes ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, lateMarkThresholdMinutes: Number(e.target.value) })} />
                      </Field>
                      <Field label="Half day below (hours)" help="Worked less than this counts as a half day.">
                        <input type="number" min={0} step="any" disabled={readOnly} className={inputCls} value={wizard.halfDayThresholdHours ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, halfDayThresholdHours: Number(e.target.value) })} />
                      </Field>
                    </div>
                    <Field label="WFH allowed" help="Employees on this template may log work-from-home days, counted as present.">
                      <ToggleSwitch checked={wizard.wfhAllowed} onChange={(v) => setWizard({ ...wizard, wfhAllowed: v })} disabled={readOnly} align="left" />
                    </Field>
                  </SectionCard>
                  <SectionCard title="Work Hours" icon={Clock}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="Check-in time" help="Expected check-in time (e.g. 09:00). Blank = no default.">
                        <input type="time" disabled={readOnly} className={inputCls} value={wizard.checkInTime} onChange={(e) => setWizard({ ...wizard, checkInTime: e.target.value })} />
                      </Field>
                      <Field label="Check-out time" help="Expected check-out time (e.g. 18:00). Blank = no default.">
                        <input type="time" disabled={readOnly} className={inputCls} value={wizard.checkOutTime} onChange={(e) => setWizard({ ...wizard, checkOutTime: e.target.value })} />
                      </Field>
                      <Field label="Break hours" help="Unpaid break deducted from daily hours.">
                        <input type="number" min={0} step="any" disabled={readOnly} className={inputCls} value={wizard.breakHours ?? ''} placeholder="No break" onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, breakHours: e.target.value === '' ? null : Number(e.target.value) })} />
                      </Field>
                    </div>
                  </SectionCard>
                </>
              )}
              {wizTab === 'overtime' && (
                <SectionCard title="Overtime" icon={Zap}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Threshold (hours/day)" help="Work beyond this per day counts as overtime.">
                      <input type="number" min={0} step="any" disabled={readOnly} className={inputCls} value={wizard.overtimeThresholdHours ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, overtimeThresholdHours: Number(e.target.value) })} />
                    </Field>
                    <Field label="Rate multiplier" help="Overtime pay = hourly rate × this (1.5 = time-and-a-half).">
                      <input type="number" min={0} step="any" disabled={readOnly} className={inputCls} value={wizard.overtimeRate ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, overtimeRate: Number(e.target.value) })} />
                    </Field>
                  </div>
                  <Field label="Max OT hours/month" help="Cap on monthly overtime. Blank = no limit.">
                    <input type="number" min={0} step="any" disabled={readOnly} className={inputCls} value={wizard.maxOvertimeHoursPerMonth ?? ''} placeholder="No limit" onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, maxOvertimeHoursPerMonth: e.target.value === '' ? null : Number(e.target.value) })} />
                  </Field>
                </SectionCard>
              )}
              {wizTab === 'compoff' && (
                <SectionCard title="Compensatory Off" icon={CalendarClock}>
                  <Field label="Comp-off enabled" help="Employees can earn compensatory leave for overtime / weekend / holiday work.">
                    <ToggleSwitch checked={wizard.compOffEnabled} onChange={(v) => setWizard({ ...wizard, compOffEnabled: v })} disabled={readOnly} align="left" />
                  </Field>
                  <Field label="Max comp-off balance" help="Maximum comp-off days an employee can carry.">
                    <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.maxCompOffBalance ?? ''} placeholder="No limit" onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, maxCompOffBalance: e.target.value === '' ? null : Number(e.target.value) })} />
                  </Field>
                </SectionCard>
              )}
              {wizTab === 'verification' && (
                <SectionCard title="Check-in Verification" icon={Users}>
                  <Field label="Selfie check-in" help="Require a selfie photo when punching in/out.">
                    <ToggleSwitch checked={wizard.selfieCheckinEnabled} onChange={(v) => setWizard({ ...wizard, selfieCheckinEnabled: v })} disabled={readOnly} align="left" />
                  </Field>
                  <Field label="IP restriction" help="Limit punch-in to approved office IP addresses only.">
                    <ToggleSwitch checked={wizard.ipRestrictionEnabled} onChange={(v) => setWizard({ ...wizard, ipRestrictionEnabled: v })} disabled={readOnly} align="left" />
                  </Field>
                  {wizard.ipRestrictionEnabled && (
                    <Field label="Allowed IP ranges" help="One per line. Example: 192.168.1.0/24">
                      <textarea disabled={readOnly} className={inputCls} rows={3} value={wizard.allowedIpRanges.join('\n')} placeholder={"192.168.1.0/24\n10.0.0.0/8"} onChange={(e) => setWizard({ ...wizard, allowedIpRanges: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
                    </Field>
                  )}
                  <Field label="WiFi check-in" help="Limit punch-in to approved office WiFi networks (by SSID).">
                    <ToggleSwitch checked={wizard.wifiCheckinEnabled} onChange={(v) => setWizard({ ...wizard, wifiCheckinEnabled: v })} disabled={readOnly} align="left" />
                  </Field>
                  {wizard.wifiCheckinEnabled && (
                    <Field label="Allowed WiFi SSIDs" help="One per line.">
                      <textarea disabled={readOnly} className={inputCls} rows={3} value={wizard.allowedSsids.join('\n')} placeholder={"Office-5G\nOffice-2G"} onChange={(e) => setWizard({ ...wizard, allowedSsids: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
                    </Field>
                  )}
                </SectionCard>
              )}
              {wizTab === 'autorules' && (
                <SectionCard title="Automatic Rules" icon={CheckCircle2}>
                  <Field label="Auto-approve if no mark" help="Mark attendance as present automatically if employee forgets to punch in.">
                    <ToggleSwitch checked={wizard.autoApproveIfNoMark} onChange={(v) => setWizard({ ...wizard, autoApproveIfNoMark: v })} disabled={readOnly} align="left" />
                  </Field>
                  <Field label="Min hours for full day" help="Minimum hours worked to qualify for a full-day mark.">
                    <input type="number" min={0} step="any" disabled={readOnly} className={inputCls} value={wizard.minHoursForFullDay ?? ''} placeholder="No limit" onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, minHoursForFullDay: e.target.value === '' ? null : Number(e.target.value) })} />
                  </Field>
                  <Field label="Shift-based payroll" help="Calculate pay per-shift rates instead of daily flat.">
                    <ToggleSwitch checked={wizard.shiftBasedPayroll} onChange={(v) => setWizard({ ...wizard, shiftBasedPayroll: v })} disabled={readOnly} align="left" />
                  </Field>
                </SectionCard>
              )}
              {wizTab === 'geo' && (
                <SectionCard title="Geo-fencing" icon={Navigation}>
                  <Field label="Enabled" help="Check-in/out must happen inside the branch fence. Off = punch from anywhere.">
                    <ToggleSwitch checked={wizard.geofenceEnabled} onChange={(v) => setWizard({ ...wizard, geofenceEnabled: v })} disabled={readOnly} align="left" />
                  </Field>
                  <Field label="Radius (metres)" help="Minimum 50m — phone GPS drifts, tighter fences always fail.">
                    <input type="number" min={50} disabled={readOnly} className={inputCls} value={wizard.geofenceRadius ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setWizard({ ...wizard, geofenceRadius: Number(e.target.value) })} />
                  </Field>
                </SectionCard>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {wizard.workingDays.length} days/week</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {selectedShift ? selectedShift.name : 'No shift'}</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {wizard.wfhAllowed ? 'WFH allowed' : 'No WFH'}</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {wizard.geofenceEnabled ? 'Geo-fenced' : 'No geo-fence'}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setWizard(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Close</button>
            {!readOnly && (
              <button onClick={onSubmit} disabled={saving || !wizard.name.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Template'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
