import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Building2, MapPin, Layers, X, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import SearchableSelect from './SearchableSelect';
import SectionCard from './SectionCard';
import ToggleSwitch from './ToggleSwitch';
import ConfirmActionModal from './ConfirmActionModal';
import api from '../services/api';
import { useMasterData } from '../hooks/useMasterData';

interface ScopedConfigField {
  key: string;
  label: string;
  type?: 'number' | 'text' | 'time' | 'select' | 'toggle';
  options?: { value: string; label: string }[];
  /** master-data category code to source the select options from (takes precedence over `options`) */
  categoryCode?: string;
  colSpan?: boolean;
}

interface ScopeOption {
  id: number;
  name: string;
}

interface ScopedConfigManagerProps {
  domain: 'attendance' | 'leave' | 'payroll' | 'performance';
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  fields: ScopedConfigField[];
  /** optional render override for a specific field value in list */
  summary?: (config: Record<string, unknown>) => string;
  /** when true (attendance domain), also upsert the payroll AttendancePolicy so working days feed salary */
  syncAttendancePolicy?: boolean;
  /** when true (leave domain), also upsert company-scoped leave types (days/carry-forward/encashable) */
  syncLeavePolicy?: boolean;
}

const DEFAULT_SCOPE: Record<string, unknown> = { id: -1, name: 'All Companies' };

const ScopedConfigManager = ({ domain, title, subtitle, icon, fields, summary, syncAttendancePolicy, syncLeavePolicy }: ScopedConfigManagerProps) => {
  const [configs, setConfigs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<ScopeOption[]>([]);
  const [branches, setBranches] = useState<ScopeOption[]>([]);
  const [departments, setDepartments] = useState<ScopeOption[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>({ companyId: '', branchId: '', departmentId: '' });
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [filteredBranches, setFilteredBranches] = useState<ScopeOption[]>([]);
  const [filteredDepts, setFilteredDepts] = useState<ScopeOption[]>([]);

  // Fetch master-data options for fields that declare a categoryCode
  const categoryCodes = Array.from(new Set(fields.filter((f) => f.categoryCode).map((f) => f.categoryCode as string)));
  const masterQueries = categoryCodes.map((code) => useMasterData(code));
  const masterOptionsByCode: Record<string, { value: string; label: string }[]> = {};
  categoryCodes.forEach((code, idx) => {
    masterOptionsByCode[code] = (masterQueries[idx].data || []).map((o: { code: string; name: string }) => ({ value: o.code, label: o.name }));
  });

  const resolveOptions = (f: ScopedConfigField): { value: string; label: string }[] =>
    f.categoryCode ? (masterOptionsByCode[f.categoryCode] || []) : (f.options || []);

  const loadConfigs = useCallback(() => {
    api_get(`/settings/configs/${domain}`)
      .then((data) => setConfigs(Array.isArray(data) ? data : []))
      .catch(() => toast.error(`Failed to load ${title.toLowerCase()}`))
      .finally(() => setLoading(false));
  }, [domain, title]);

  useEffect(() => {
    loadConfigs();
    Promise.all([api_get('/companies'), api_get('/branches'), api_get('/departments')])
      .then(([c, b, d]) => {
        setCompanies(Array.isArray(c) ? c : []);
        setBranches(Array.isArray(b) ? b : []);
        setDepartments(Array.isArray(d) ? d : []);
      })
      .catch(() => {});
  }, [loadConfigs]);

  // scope the modal reference data
  useEffect(() => {
    const compId = String(form.companyId || '');
    setFilteredBranches(compId ? branches.filter((b) => String((b as { companyId?: number }).companyId) === compId) : branches);
    setFilteredDepts(compId ? departments.filter((d) => String((d as { companyId?: number }).companyId) === compId) : departments);
  }, [form.companyId, branches, departments]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ companyId: '', branchId: '', departmentId: '' });
    fields.forEach((f) => { if (f.type !== 'toggle') setForm((p) => ({ ...p, [f.key]: '' })); else setForm((p) => ({ ...p, [f.key]: true })); });
    setShowModal(true);
  };

  const openEdit = (c: Record<string, unknown>) => {
    setEditingId(c.id as number);
    setForm({ ...c });
    setShowModal(true);
  };

  const syncPayrollAttendancePolicy = () => {
    const companyId = form.companyId === '' || form.companyId === 'all' ? null : Number(form.companyId);
    const body = {
      name: `Attendance - ${companyId == null ? 'All Companies' : 'Company ' + companyId}`,
      working_days_per_week: Number(form.workingDaysPerWeek ?? 6),
      half_day_as_full_paid: !!form.halfDayAsFullPaid,
      paid_leave_as_present: !!form.paidLeaveAsPresent,
      holiday_as_present: !!form.holidayAsPresent,
      overtime_threshold_hours: Number(form.overtimeThresholdHours ?? 8),
      overtime_rate: Number(form.overtimeRate ?? 1.5),
      late_mark_threshold_minutes: Number(form.lateMarkThresholdMinutes ?? 15),
      half_day_threshold_hours: Number(form.halfDayThresholdHours ?? 4),
      company_id: companyId,
    };
    return api_get(`/attendance-policies${companyId != null ? `?companyId=${companyId}` : ''}`).then((policies) => {
      const existing = (policies || []).find((p: { company_id?: number | null; id: number }) => (p.company_id ?? null) === (companyId ?? null));
      if (existing) return api_req('put', `/attendance-policies/${existing.id}`, body);
      return api_req('post', '/attendance-policies', body);
    });
  };

  const syncLeavePolicyConfig = () => {
    const companyId = form.companyId === '' || form.companyId === 'all' ? null : Number(form.companyId);
    const mapping = [
      { key: 'casual', codes: ['casual', 'casual_leave', 'cl'] },
      { key: 'sick', codes: ['sick', 'sick_leave', 'sl', 'medical'] },
      { key: 'earned', codes: ['earned', 'earned_leave', 'privilege', 'privilege_leave', 'el', 'annual'] },
      { key: 'maternity', codes: ['maternity', 'maternity_leave', 'ml'] },
    ];
    return api_get(`/leave-types${companyId != null ? `?companyId=${companyId}` : ''}`).then((types) => {
      const list = (types || []) as Array<{ id: number; name: string; code?: string; days_allowed?: number; is_encashable?: boolean }>;
      const promises = mapping.map(({ key, codes }) => {
        const raw = form[key];
        if (raw === '' || raw === undefined || raw === null) return Promise.resolve();
        const days = Number(raw) || 0;
        const existing = list.find((t) => codes.includes((t.code || '').toLowerCase()));
        const body = {
          name: existing?.name || `${key.charAt(0).toUpperCase()}${key.slice(1)} Leave`,
          code: existing?.code || key,
          daysAllowed: days,
          carryForward: !!form.carryForward,
          isEncashable: key === 'earned' ? !!form.encashment : (existing?.is_encashable ?? false),
          companyId,
        };
        if (existing) return api_req('put', `/leave-types/${existing.id}`, body);
        return api_req('post', '/leave-types', body);
      });
      return Promise.all(promises).then(() => undefined);
    });
  };

  const saveConfig = () => {
    setSaving(true);
    const payload: Record<string, unknown> = {
      companyId: form.companyId === '' || form.companyId === 'all' ? null : Number(form.companyId),
      branchId: form.branchId === '' || form.branchId === 'all' ? null : Number(form.branchId),
      departmentId: form.departmentId === '' || form.departmentId === 'all' ? null : Number(form.departmentId),
    };
    fields.forEach((f) => { if (f.key in form) payload[f.key] = form[f.key]; });

    const url = editingId ? `/settings/configs/${domain}/${editingId}` : `/settings/configs/${domain}`;
    const method = editingId ? 'put' : 'post';
    api_req(method, url, payload)
      .then(() => (syncAttendancePolicy ? syncPayrollAttendancePolicy() : Promise.resolve()))
      .then(() => (syncLeavePolicy ? syncLeavePolicyConfig() : Promise.resolve()))
      .then(() => {
        toast.success(editingId ? `${title} updated` : `${title} added`);
        setShowModal(false);
        loadConfigs();
      })
      .catch(() => toast.error(`Failed to save ${title.toLowerCase()}`))
      .finally(() => setSaving(false));
  };

  const deleteConfig = (id: number) => {
    setDeleteTargetId(id);
  };

  const scopeLabel = (c: Record<string, unknown>) => {
    const comp = companies.find((x) => x.id === c.companyId);
    const branch = branches.find((x) => x.id === c.branchId);
    const dept = departments.find((x) => x.id === c.departmentId);
    const parts = [comp?.name || (c.companyId == null ? 'All Companies' : `#${c.companyId}`)];
    if (c.branchId != null) parts.push(branch?.name || `#${c.branchId}`);
    if (c.departmentId != null) parts.push(dept?.name || `#${c.departmentId}`);
    return parts.join(' · ');
  };

  const renderField = (f: ScopedConfigField) => {
    const value = form[f.key] as string | boolean | undefined;
    if (f.type === 'toggle') {
      return (
        <div key={f.key} className="flex items-center justify-between py-2.5">
          <span className="text-sm font-medium text-[var(--text-primary)]">{f.label}</span>
          <ToggleSwitch checked={!!value} onChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))} onColor="bg-[var(--primary-blue)]" offColor="bg-[#CBD5E1]" />
        </div>
      );
    }
    if (f.type === 'select') {
      const opts = resolveOptions(f);
      return (
        <div key={f.key}>
          <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">{f.label}</label>
          <select
            value={String(value ?? '')}
            onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
            className="w-full px-3.5 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-white text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1C64F2] transition-all"
          >
            <option value="">Select...</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div key={f.key}>
        <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">{f.label}</label>
        <input
          type={f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
          className="w-full px-3.5 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-white text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1C64F2] transition-all"
        />
      </div>
    );
  };

  return (
    <>
    <SectionCard
      title={title}
      subtitle={subtitle}
      icon={icon}
      action={
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-xl text-sm font-medium hover:bg-[#1E40AF] transition-colors">
          <Plus className="w-4 h-4" /> Add
        </button>
      }
    >
      {loading ? (
        null
      ) : configs.length === 0 ? (
        <div className="text-center py-10 text-sm text-[#94A3B8]">
          No {title.toLowerCase()} yet. Click "Add" to create one for a company, branch or department.
        </div>
      ) : (
        <div className="divide-y divide-[#F1F5F9]">
          {configs.map((c) => (
            <div key={String(c.id)} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center text-[var(--primary-blue)] shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{String(c.name || `${title} ${c.id}`)}</p>
                  <p className="text-xs text-[#94A3B8] flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" /> {scopeLabel(c)}
                  </p>
                  {summary && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{summary(c)}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => openEdit(c)} className="p-2 text-[var(--primary-blue)] hover:bg-[#EFF6FF] rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteConfig(Number(c.id))} className="p-2 text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
            <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{editingId ? `Edit ${title}` : `Add ${title}`}</h2>
                <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>
              </div>
              <button onClick={() => setShowModal(false)} title="Close" className="p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-6xl mx-auto space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Where does this apply?</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">Company</label>
                      <SearchableSelect
                        value={form.companyId === null || form.companyId === '' ? 'all' : Number(form.companyId)}
                        onChange={(val) => setForm((p) => ({ ...p, companyId: val === 'all' ? '' : val.toString(), branchId: '', departmentId: '' }))}
                        options={companies.map((c) => ({ id: c.id, name: c.name }))}
                        placeholder="All Companies" allOption="All Companies"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">Branch</label>
                      <SearchableSelect
                        value={form.branchId === null || form.branchId === '' ? 'all' : Number(form.branchId)}
                        onChange={(val) => setForm((p) => ({ ...p, branchId: val === 'all' ? '' : val.toString() }))}
                        options={filteredBranches.map((b) => ({ id: b.id, name: b.name }))}
                        placeholder="All Branches" allOption="All Branches"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">Department</label>
                      <SearchableSelect
                        value={form.departmentId === null || form.departmentId === '' ? 'all' : Number(form.departmentId)}
                        onChange={(val) => setForm((p) => ({ ...p, departmentId: val === 'all' ? '' : val.toString() }))}
                        options={filteredDepts.map((d) => ({ id: d.id, name: d.name }))}
                        placeholder="All Departments" allOption="All Departments"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Rules</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div>
                      <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">Config name</label>
                      <input value={String(form.name ?? '')} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder={`e.g. ${title} - Head Office`}
                        className="w-full px-3.5 py-2.5 border border-[var(--border-color)] rounded-xl text-sm bg-white text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1C64F2] transition-all" />
                    </div>
                    {fields.filter((f) => f.key !== 'name').map((f) => renderField(f))}
                  </div>
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-5 py-2.5 border border-[var(--border-color)] text-[var(--text-tertiary)] rounded-xl text-sm font-semibold hover:bg-white transition-colors">Cancel</button>
              <button type="button" onClick={saveConfig} disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r bg-[var(--primary-blue)] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Update' : 'Add'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </SectionCard>
    <ConfirmActionModal
      isOpen={deleteTargetId !== null}
      title={`Delete ${title}?`}
      message={`Are you sure you want to delete this ${title.toLowerCase()} configuration?`}
      consequence="This action cannot be undone. The configuration and all its settings will be permanently removed."
      confirmLabel="Delete"
      variant="danger"
      onConfirm={() => {
        if (deleteTargetId !== null) {
          api_req('delete', `/settings/configs/${domain}/${deleteTargetId}`)
            .then(() => { toast.success(`${title} deleted`); loadConfigs(); })
            .catch(() => toast.error(`Failed to delete ${title.toLowerCase()}`));
          setDeleteTargetId(null);
        }
      }}
      onCancel={() => setDeleteTargetId(null)}
    />
    </>
  );
};

function api_get(url: string) {
  return api.get(url).then((r) => r.data);
}
function api_req(method: string, url: string, body?: unknown) {
  return api({ method, url, data: body }).then((r) => r.data);
}

export default ScopedConfigManager;
