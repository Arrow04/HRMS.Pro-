import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Building2, FileText, Edit2, Trash2, X, CheckCircle2, Users, MapPin,
  CalendarDays, PiggyBank, RefreshCw, ChevronUp, ChevronDown, Info,
  Clock, CalendarOff, Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '../services/api';
import SearchableSelect from './SearchableSelect';
import ToggleSwitch from './ToggleSwitch';

/* ---------- tiny form primitives (same look as payroll configuration) ---------- */
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

/* ---------- types ---------- */
interface TypeRow { leave_type_id: number | null; code: string; name: string; days: number; paid: boolean; encashable: boolean; active: boolean; }
interface WizardState {
  name: string; companyId: number | null; description: string; status: string; effectiveFrom: string;
  rows: TypeRow[];
  accrual_method: string; accrual_day: number | null; probation_accrual_rate: number | null; max_balance_cap: number | null; lapse_unused: boolean;
  carry_forward_enabled: boolean; carry_forward_max_days: number | null; carry_forward_expiry: string; carry_forward_use_it_or_lose_it: boolean;
  encashment_enabled: boolean; encashment_min_balance: number | null; encashment_rate: number | null; encashment_taxable: boolean;
  holiday_optional_limit: number | null; holiday_auto_apply_national: boolean;
  enable_half_day: boolean; min_leave_for_half_day: number | null; advance_notice_days: number | null; max_consecutive_days: number | null;
}
const blankWizard = (): WizardState => ({
  name: '', companyId: null, description: '', status: 'active', effectiveFrom: '',
  rows: [],
  accrual_method: '', accrual_day: null, probation_accrual_rate: null, max_balance_cap: null, lapse_unused: false,
  carry_forward_enabled: false, carry_forward_max_days: null, carry_forward_expiry: 'year_end', carry_forward_use_it_or_lose_it: false,
  encashment_enabled: false, encashment_min_balance: null, encashment_rate: null, encashment_taxable: false,
  holiday_optional_limit: null, holiday_auto_apply_national: false,
  enable_half_day: false, min_leave_for_half_day: null, advance_notice_days: null, max_consecutive_days: null,
});
const WIZ_TABS = [
  { id: 'overview', label: 'Overview', icon: Building2, color: 'text-blue-600' },
  { id: 'types', label: 'Type Quotas', icon: CalendarDays, color: 'text-emerald-600' },
  { id: 'accrual', label: 'Accrual & Carry', icon: RefreshCw, color: 'text-violet-600' },
  { id: 'encashment', label: 'Encashment', icon: PiggyBank, color: 'text-amber-600' },
  { id: 'holidays', label: 'Holidays', icon: CalendarOff, color: 'text-rose-600' },
  { id: 'rules', label: 'Application Rules', icon: Shield, color: 'text-cyan-600' },
];

const WIZARD_HELP: Record<string, string> = {
  overview: 'Name, company and effective date for this template.',
  types: 'Company quotas per leave type — override the org defaults for this company.',
  accrual: 'How leave accrues month by month and what carries forward.',
  encashment: 'Unused leave paid out on exit (FnF settlement).',
  holidays: 'Optional holiday limit and national holiday auto-apply.',
  rules: 'Half-day, advance notice, consecutive leave limits.',
};

export default function LeaveTemplateManager() {
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
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types-all'],
    queryFn: async () => { try { const r = await api.get('/leave-types'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['leave-templates', companyFilter],
    queryFn: async () => {
      const params = companyFilter === 'all' ? {} : { companyId: Number(companyFilter) };
      const r = await api.get('/api/leave-templates', { params });
      return r.data || [];
    },
  });

  const activeTypes = useMemo(
    () => (leaveTypes as any[]).filter((t) => t.status !== 'inactive'),
    [leaveTypes]
  );
  const companyName = useMemo(() => {
    const m = new Map((companies as any[]).map((c: any) => [c.id, c.name]));
    return (id: number | null) => (id == null ? 'All Companies' : m.get(id) || '—');
  }, [companies]);

  const saveMutation = useMutation({
    mutationFn: (w: { id: number | null; state: WizardState }) => {
      const payload = {
        name: w.state.name.trim(),
        description: w.state.description.trim(),
        companyId: w.state.companyId,
        status: w.state.status,
        effectiveFrom: w.state.effectiveFrom || null,
        body: {
          leaveTypes: w.state.rows.map((r) => ({
            leave_type_id: r.leave_type_id, code: r.code, name: r.name,
            days: Number(r.days) || 0, paid: r.paid, encashable: r.encashable, active: r.active,
          })),
        },
        accrual_method: w.state.accrual_method || null,
        accrual_day: w.state.accrual_day,
        probation_accrual_rate: w.state.probation_accrual_rate,
        max_balance_cap: w.state.max_balance_cap,
        lapse_unused: w.state.lapse_unused,
        carry_forward_enabled: w.state.carry_forward_enabled,
        carry_forward_max_days: w.state.carry_forward_max_days,
        carry_forward_expiry: w.state.carry_forward_expiry,
        carry_forward_use_it_or_lose_it: w.state.carry_forward_use_it_or_lose_it,
        encashment_enabled: w.state.encashment_enabled,
        encashment_min_balance: w.state.encashment_min_balance,
        encashment_rate: w.state.encashment_rate,
        encashment_taxable: w.state.encashment_taxable,
        holiday_optional_limit: w.state.holiday_optional_limit,
        holiday_auto_apply_national: w.state.holiday_auto_apply_national,
        enable_half_day: w.state.enable_half_day,
        min_leave_for_half_day: w.state.min_leave_for_half_day,
        advance_notice_days: w.state.advance_notice_days,
        max_consecutive_days: w.state.max_consecutive_days,
      };
      return w.id ? api.put(`/api/leave-templates/${w.id}`, payload) : api.post('/api/leave-templates', payload);
    },
    onSuccess: () => {
      toast.success('Leave template saved');
      queryClient.invalidateQueries({ queryKey: ['leave-templates'] });
      setWizard(null); setEditingId(null); setWizTab('overview');
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save template'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/leave-templates/${id}`),
    onSuccess: () => { toast.success('Template deleted'); queryClient.invalidateQueries({ queryKey: ['leave-templates'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to delete template'),
  });

  const rowsFromTypes = (body?: any): TypeRow[] => {
    const saved = new Map(((body?.leaveTypes) || []).map((r: any) => [r.leave_type_id ?? r.code, r]));
    return activeTypes.map((t: any) => {
      const s = saved.get(t.id) || saved.get(t.code);
      return {
        leave_type_id: t.id, code: t.code || '', name: t.name,
        days: Number(s?.days ?? 12), paid: s?.paid !== false,
        encashable: !!s?.encashable, active: s?.active !== false,
      };
    });
  };
  const openCreate = () => {
    setEditingId(null); setReadOnly(false); setWizTab('overview');
    const w = blankWizard();
    w.companyId = companyFilter === 'all' ? null : Number(companyFilter);
    w.rows = rowsFromTypes();
    setWizard(w);
  };
  const openEdit = (t: any) => {
    setEditingId(t.id); setReadOnly(false); setWizTab('overview');
    const b = t.body || {};
    setWizard({
      name: t.name, companyId: t.company_id ?? null, description: t.description || '',
      status: t.status || 'active', effectiveFrom: (t.effective_from || '').slice(0, 10),
      rows: rowsFromTypes(b),
      accrual_method: t.accrual_method || '',
      accrual_day: t.accrual_day ?? null,
      probation_accrual_rate: t.probation_accrual_rate ?? null,
      max_balance_cap: t.max_balance_cap ?? null,
      lapse_unused: !!t.lapse_unused,
      carry_forward_enabled: !!t.carry_forward_enabled,
      carry_forward_max_days: t.carry_forward_max_days ?? null,
      carry_forward_expiry: t.carry_forward_expiry || 'year_end',
      carry_forward_use_it_or_lose_it: !!t.carry_forward_use_it_or_lose_it,
      encashment_enabled: !!t.encashment_enabled,
      encashment_min_balance: t.encashment_min_balance ?? null,
      encashment_rate: t.encashment_rate ?? null,
      encashment_taxable: !!t.encashment_taxable,
      holiday_optional_limit: t.holiday_optional_limit ?? null,
      holiday_auto_apply_national: !!t.holiday_auto_apply_national,
      enable_half_day: !!t.enable_half_day,
      min_leave_for_half_day: t.min_leave_for_half_day ?? null,
      advance_notice_days: t.advance_notice_days ?? null,
      max_consecutive_days: t.max_consecutive_days ?? null,
    });
  };
  const openView = (t: any) => { openEdit(t); setReadOnly(true); };
  const setRow = (i: number, patch: Partial<TypeRow>) =>
    setWizard((prev) => (prev ? { ...prev, rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : prev));
  const submit = () => {
    if (!wizard) return;
    if (!wizard.name.trim()) { toast.error('Template name is required'); return; }
    if (!wizard.companyId) { toast.error('Pick the company this template belongs to'); return; }
    saveMutation.mutate({ id: editingId, state: wizard });
  };

  const totalEmployees = (templates as any[]).reduce((s: number, t: any) => s + (t.employee_count || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Configure Leave</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Company-wise leave templates. Each template sets per-type quotas plus accrual, carry-forward and
            encashment rules. Pick a template on the employee form — balances resolve from it instantly, no bulk jobs.
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
          { label: 'Employees on templates', value: totalEmployees, icon: Users },
          { label: 'Companies covered', value: new Set((templates as any[]).map((t: any) => t.company_id)).size, icon: MapPin },
          { label: 'Active', value: (templates as any[]).filter((t: any) => t.status === 'active').length, icon: CheckCircle2 },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-color)] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <s.icon className="w-4 h-4 text-[var(--primary-blue)]" />
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
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">{t.name}</h3>
                    <p className="text-xs text-[var(--text-tertiary)]">{companyName(t.company_id)} · v{t.version || 1}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                  {t.status}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.description || 'No description'}</p>
              <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)] mb-4">
                <span>{t.type_count ?? 0} leave types</span>
                <span>{t.employee_count ?? 0} employees</span>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button onClick={() => openView(t)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                  <FileText className="w-3.5 h-3.5" /> View
                </button>
                <button onClick={() => openEdit(t)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteMutation.mutate(t.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(templates as any[]).length === 0 && !isLoading && (
        <div className="text-center py-12 text-[var(--text-tertiary)]">No leave templates yet — create the first one for a company.</div>
      )}

      {/* ---------- wizard (full page, like payroll template) ---------- */}
      {wizard && (
        <LeaveWizardModal
          wizard={wizard} setWizard={setWizard} wizTab={wizTab} setWizTab={setWizTab}
          companies={companies as any[]} editingId={editingId} readOnly={readOnly}
          saving={saveMutation.isPending} onSubmit={submit} setRow={setRow}
        />
      )}
    </div>
  );

  function setW<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setWizard((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
}

function LeaveWizardModal(props: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState | null>>;
  wizTab: string;
  setWizTab: (t: string) => void;
  companies: any[];
  editingId: number | null;
  readOnly: boolean;
  saving: boolean;
  onSubmit: () => void;
  setRow: (i: number, patch: Partial<TypeRow>) => void;
}) {
  const { wizard, setWizard, wizTab, setWizTab, companies, editingId, readOnly, saving, onSubmit, setRow } = props;
  const accent = '#1C64F2';
  const setW = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setWizard((prev) => (prev ? { ...prev, [key]: value } : prev));

  const done = [
    !!(wizard.name.trim() && wizard.companyId != null),
    wizard.rows.length > 0,
    true,
    true,
  ].filter(Boolean).length;
  const progress = Math.min(100, Math.round((done / WIZ_TABS.length) * 100));
  const activeTypes = wizard.rows.filter((r) => r.active).length;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={() => setWizard(null)} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {readOnly ? 'Leave Template' : editingId ? 'Edit Leave Template' : 'Create Leave Template'}
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
                    <Field label="Template Name" help="A friendly name so you can identify this template (e.g. Standard India 2026 — Acme).">
                      <input className={inputCls} disabled={readOnly} value={wizard.name} placeholder="Standard India 2026 — Acme" onChange={(e) => setW('name', e.target.value)} />
                    </Field>
                    <Field label="Company *" help="Only employees of this company can pick this template. One company can have several templates (e.g. staff vs workers).">
                      <SearchableSelect value={wizard.companyId ?? ''} onChange={(v) => setW('companyId', v === '' ? null : Number(v))}
                        options={(companies as any[]).map((c: any) => ({ id: c.id, name: c.name }))} placeholder="Select company" disabled={readOnly} />
                    </Field>
                    <Field label="Effective From" help="Quotas apply from this date. Editing quotas later creates a new version — history is never rewritten.">
                      <input type="date" className={inputCls} disabled={readOnly} value={wizard.effectiveFrom} onChange={(e) => setW('effectiveFrom', e.target.value)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Description" help="What this template is for and who should get it.">
                      <input className={inputCls} disabled={readOnly} value={wizard.description} placeholder="Default policy for all full-time staff" onChange={(e) => setW('description', e.target.value)} />
                    </Field>
                    <Field label="Status" help="Inactive templates stay visible for history but can't be picked for new employees.">
                      <SearchableSelect value={wizard.status} onChange={(v) => setW('status', String(v))}
                        options={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]} disabled={readOnly} />
                    </Field>
                  </div>
                </>
              )}
              {wizTab === 'types' && (
                <SectionCard title="Per-type quotas" icon={CalendarDays}>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Company override of the org defaults (Leave page → Leave Types). Only numbers set here win for employees on this template — type names come from Master Data and can't be changed here. Switch a type off to grant zero for this company.</p>
                  <div className="space-y-2">
                    {wizard.rows.map((r, i) => (
                      <div key={r.leave_type_id ?? r.code} className="grid grid-cols-12 gap-2 items-center border border-[var(--border-color)] rounded-lg px-3 py-2">
                        <div className="col-span-4 min-w-0">
                          <div className="text-sm font-medium truncate">{r.name}</div>
                          <div className="text-[11px] text-[var(--text-tertiary)]">{r.code}</div>
                        </div>
                        <div className="col-span-2">
                          <input type="number" min={0} disabled={readOnly} value={r.days} onFocus={(e) => e.target.select()}
                            onChange={(e) => setRow(i, { days: Number(e.target.value) })}
                            className={inputCls} title="Days per year" />
                        </div>
                        <label className="col-span-2 flex items-center gap-1.5 text-xs">
                          <ToggleSwitch checked={r.paid} onChange={(v) => setRow(i, { paid: v })} disabled={readOnly} align="left" /> Paid
                        </label>
                        <label className="col-span-2 flex items-center gap-1.5 text-xs">
                          <ToggleSwitch checked={r.encashable} onChange={(v) => setRow(i, { encashable: v })} disabled={readOnly} align="left" /> En-cash
                        </label>
                        <label className="col-span-2 flex items-center gap-1.5 text-xs">
                          <ToggleSwitch checked={r.active} onChange={(v) => setRow(i, { active: v })} disabled={readOnly} align="left" /> Active
                        </label>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
              {wizTab === 'accrual' && (
                <>
                  <SectionCard title="Accrual" icon={RefreshCw}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="Method" help="Monthly = quota drips in each month. Lump sum = full quota on Jan 1 (or join date).">
                        <SearchableSelect value={wizard.accrual_method} onChange={(v) => setW('accrual_method', String(v))}
                          options={[{ id: 'monthly', name: 'Monthly' }, { id: 'lump', name: 'Lump sum' }, { id: 'quarterly', name: 'Quarterly' }, { id: 'yearly', name: 'Yearly' }]} disabled={readOnly} />
                      </Field>
                      <Field label="Accrual day" help="Day of month when leave is credited (1-28).">
                        <input type="number" min={1} max={28} disabled={readOnly} className={inputCls} value={wizard.accrual_day ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => setW('accrual_day', e.target.value === '' ? null : Number(e.target.value))} />
                      </Field>
                      <Field label="Probation rate %" help="% of quota a probationer accrues (blank = same as confirmed).">
                        <input type="number" min={0} max={100} disabled={readOnly} className={inputCls} value={wizard.probation_accrual_rate ?? ''} placeholder="Same as confirmed" onFocus={(e) => e.target.select()} onChange={(e) => setW('probation_accrual_rate', e.target.value === '' ? null : Number(e.target.value))} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Max balance cap" help="Balance never grows past this, no matter the quota.">
                        <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.max_balance_cap ?? ''} placeholder="No cap" onFocus={(e) => e.target.select()} onChange={(e) => setW('max_balance_cap', e.target.value === '' ? null : Number(e.target.value))} />
                      </Field>
                      <Field label="Lapse unused" help="Expire unused leave days at year end instead of carrying forward.">
                        <ToggleSwitch checked={wizard.lapse_unused} onChange={(v) => setW('lapse_unused', v)} disabled={readOnly} align="left" />
                      </Field>
                    </div>
                  </SectionCard>
                  <SectionCard title="Carry forward" icon={RefreshCw}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Enabled" help="Unused days roll into next year. Off = use-it-or-lose-it.">
                        <ToggleSwitch checked={wizard.carry_forward_enabled} onChange={(v) => setW('carry_forward_enabled', v)} disabled={readOnly} align="left" />
                      </Field>
                      <Field label="Max days" help="At most this many unused days carry over.">
                        <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.carry_forward_max_days ?? ''} placeholder="No limit" onFocus={(e) => e.target.select()} onChange={(e) => setW('carry_forward_max_days', e.target.value === '' ? null : Number(e.target.value))} />
                      </Field>
                      <Field label="Expiry" help="Carried days must be used within this window.">
                        <SearchableSelect value={wizard.carry_forward_expiry} onChange={(v) => setW('carry_forward_expiry', String(v))}
                          options={[{ id: 'year_end', name: 'Year end' }, { id: 'quarter', name: 'Quarter' }, { id: 'half-year', name: 'Half year' }, { id: 'never', name: 'Never' }]} disabled={readOnly} />
                      </Field>
                      <Field label="Use it or lose it" help="Carried days expire if not used by the expiry date.">
                        <ToggleSwitch checked={wizard.carry_forward_use_it_or_lose_it} onChange={(v) => setW('carry_forward_use_it_or_lose_it', v)} disabled={readOnly} align="left" />
                      </Field>
                    </div>
                  </SectionCard>
                </>
              )}
              {wizTab === 'encashment' && (
                <SectionCard title="Encashment (paid out on exit)" icon={PiggyBank}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Enabled" help="Unused encashable days are paid in FnF settlement.">
                      <ToggleSwitch checked={wizard.encashment_enabled} onChange={(v) => setW('encashment_enabled', v)} disabled={readOnly} align="left" />
                    </Field>
                    <Field label="Min balance required" help="Encashment only if remaining balance is at least this.">
                      <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.encashment_min_balance ?? ''} placeholder="No minimum" onFocus={(e) => e.target.select()} onChange={(e) => setW('encashment_min_balance', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>
                    <Field label="Encashment rate" help="Fraction of daily salary paid (0.83 = 83%). Blank = full daily rate.">
                      <input type="number" min={0} max={1} step="0.01" disabled={readOnly} className={inputCls} value={wizard.encashment_rate ?? ''} placeholder="Full rate" onFocus={(e) => e.target.select()} onChange={(e) => setW('encashment_rate', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>
                    <Field label="Taxable" help="Whether the encashed amount attracts income tax in payroll.">
                      <ToggleSwitch checked={wizard.encashment_taxable} onChange={(v) => setW('encashment_taxable', v)} disabled={readOnly} align="left" />
                    </Field>
                  </div>
                </SectionCard>
              )}
              {wizTab === 'holidays' && (
                <SectionCard title="Holiday Rules" icon={CalendarOff}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Optional holiday limit" help="Max optional holidays an employee can choose per year. Blank = no optional holidays.">
                      <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.holiday_optional_limit ?? ''} placeholder="No optional holidays" onFocus={(e) => e.target.select()} onChange={(e) => setW('holiday_optional_limit', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>
                    <Field label="Auto-apply national holidays" help="Automatically mark national holidays as paid days off.">
                      <ToggleSwitch checked={wizard.holiday_auto_apply_national} onChange={(v) => setW('holiday_auto_apply_national', v)} disabled={readOnly} align="left" />
                    </Field>
                  </div>
                </SectionCard>
              )}
              {wizTab === 'rules' && (
                <SectionCard title="Application Rules" icon={Shield}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Enable half-day leave" help="Allow employees to apply for half-day leaves.">
                      <ToggleSwitch checked={wizard.enable_half_day} onChange={(v) => setW('enable_half_day', v)} disabled={readOnly} align="left" />
                    </Field>
                    <Field label="Min days for half-day" help="Minimum consecutive leave days required before half-day is allowed.">
                      <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.min_leave_for_half_day ?? ''} placeholder="No minimum" onFocus={(e) => e.target.select()} onChange={(e) => setW('min_leave_for_half_day', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>
                    <Field label="Advance notice (days)" help="Leave must be applied at least this many days in advance.">
                      <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.advance_notice_days ?? ''} placeholder="No advance notice" onFocus={(e) => e.target.select()} onChange={(e) => setW('advance_notice_days', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>
                    <Field label="Max consecutive days" help="Maximum consecutive leave days allowed in one application.">
                      <input type="number" min={0} disabled={readOnly} className={inputCls} value={wizard.max_consecutive_days ?? ''} placeholder="No limit" onFocus={(e) => e.target.select()} onChange={(e) => setW('max_consecutive_days', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>
                  </div>
                </SectionCard>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {wizard.rows.length} leave types</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {activeTypes} active</span>
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

