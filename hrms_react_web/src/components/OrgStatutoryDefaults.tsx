import { useState, useEffect } from 'react';
import { Save, Pencil, Trash2, Loader2, ShieldCheck, Landmark, Info, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getCurrencySymbol, getAppCurrency } from '../services/currencyService';
import { getStatutorySettings, upsertStatutorySettings, applyStatutoryPreset, type StatutorySetting } from '../services/payrollConfigApi';

const INDIA_DEFAULTS: StatutorySetting = {
  pf_applicable: true, pf_employee_rate: 12, pf_employer_rate: 3.67,
  pf_wage_ceiling: 15000, pf_max_monthly: 1800, pf_min_basic_for_exclusion: 15000,
  pf_edli_rate: 0.5, pf_edli_max_monthly: 75,
  pf_admin_rate: 0.5, pf_admin_min_monthly: 75,
  eps_wage_ceiling: 15000, eps_employer_rate: 8.33,
  nps_employee_rate: null, nps_employer_rate: null,
  esi_applicable: true, esi_employee_rate: 0.75, esi_employer_rate: 3.25,
  esi_gross_ceiling: 21000, esi_disabled_ceiling: 25000,
  pt_applicable: true, pt_monthly_amount: 200, pt_min_gross: 10000,
  lwf_applicable: false, lwf_employee_rate: 0, lwf_employer_rate: 0,
  gratuity_applicable: true, gratuity_rate: 4.81,
  gratuity_eligible_years: 5, gratuity_days_per_year: 15, gratuity_tax_exempt_ceiling: 2000000,
  bonus_applicable: true, bonus_min_rate: 8.33, bonus_max_rate: 20, bonus_eligible_ceiling: 21000, bonus_wage_ceiling: 7000,
};

const EMPTY: StatutorySetting = {
  pf_applicable: null, pf_employee_rate: null, pf_employer_rate: null,
  pf_wage_ceiling: null, pf_max_monthly: null, pf_min_basic_for_exclusion: null,
  pf_edli_rate: null, pf_edli_max_monthly: null,
  pf_admin_rate: null, pf_admin_min_monthly: null,
  eps_wage_ceiling: null, eps_employer_rate: null,
  nps_employee_rate: null, nps_employer_rate: null,
  esi_applicable: null, esi_employee_rate: null, esi_employer_rate: null,
  esi_gross_ceiling: null, esi_disabled_ceiling: null,
  pt_applicable: null, pt_monthly_amount: null, pt_min_gross: null,
  lwf_applicable: null, lwf_employee_rate: null, lwf_employer_rate: null,
  gratuity_applicable: null, gratuity_rate: null,
  gratuity_eligible_years: null, gratuity_days_per_year: null, gratuity_tax_exempt_ceiling: null,
  bonus_applicable: null, bonus_min_rate: null, bonus_max_rate: null, bonus_eligible_ceiling: null, bonus_wage_ceiling: null,
};

type Tab = 'employee' | 'employer';
type Unit = '%' | 'money' | 'num';

const FIELD_UNITS: Record<string, Unit> = {
  pf_employee_rate: '%', pf_employer_rate: '%', pf_wage_ceiling: 'money', pf_max_monthly: 'money',
  pf_min_basic_for_exclusion: 'money', pf_edli_rate: '%', pf_edli_max_monthly: 'money',
  pf_admin_rate: '%', pf_admin_min_monthly: 'money', eps_wage_ceiling: 'money', eps_employer_rate: '%',
  nps_employee_rate: '%', nps_employer_rate: '%',
  esi_employee_rate: '%', esi_employer_rate: '%', esi_gross_ceiling: 'money', esi_disabled_ceiling: 'money',
  pt_monthly_amount: 'money', pt_min_gross: 'money',
  lwf_employee_rate: 'money', lwf_employer_rate: 'money',
  gratuity_rate: '%', gratuity_eligible_years: 'num', gratuity_days_per_year: 'num', gratuity_tax_exempt_ceiling: 'money',
  bonus_min_rate: '%', bonus_max_rate: '%', bonus_eligible_ceiling: 'money', bonus_wage_ceiling: 'money',
};

const fmtVal = (key: string, v: number | null | undefined) => {
  if (v == null) return '—';
  const unit = FIELD_UNITS[key];
  if (unit === '%') return `${v}%`;
  if (unit === 'money') return `${getCurrencySymbol(getAppCurrency())}${Number(v).toLocaleString()}`;
  return String(v);
};
const appLabel = (v: boolean | null | undefined) => v === null ? 'Inherit' : v ? 'On' : 'Off';

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseResponse(raw: Record<string, unknown>): StatutorySetting {
  return {
    pf_applicable: (raw.pf_applicable as boolean | null) ?? null,
    pf_employee_rate: numOrNull(raw.pf_employee_rate),
    pf_employer_rate: numOrNull(raw.pf_employer_rate),
    pf_wage_ceiling: numOrNull(raw.pf_wage_ceiling),
    pf_max_monthly: numOrNull(raw.pf_max_monthly),
    pf_min_basic_for_exclusion: numOrNull(raw.pf_min_basic_for_exclusion),
    pf_edli_rate: numOrNull(raw.pf_edli_rate),
    pf_edli_max_monthly: numOrNull(raw.pf_edli_max_monthly),
    pf_admin_rate: numOrNull(raw.pf_admin_rate),
    pf_admin_min_monthly: numOrNull(raw.pf_admin_min_monthly),
    eps_wage_ceiling: numOrNull(raw.eps_wage_ceiling),
    eps_employer_rate: numOrNull(raw.eps_employer_rate),
    nps_employee_rate: numOrNull(raw.nps_employee_rate),
    nps_employer_rate: numOrNull(raw.nps_employer_rate),
    esi_applicable: (raw.esi_applicable as boolean | null) ?? null,
    esi_employee_rate: numOrNull(raw.esi_employee_rate),
    esi_employer_rate: numOrNull(raw.esi_employer_rate),
    esi_gross_ceiling: numOrNull(raw.esi_gross_ceiling),
    esi_disabled_ceiling: numOrNull(raw.esi_disabled_ceiling),
    pt_applicable: (raw.pt_applicable as boolean | null) ?? null,
    pt_monthly_amount: numOrNull(raw.pt_monthly_amount),
    pt_min_gross: numOrNull(raw.pt_min_gross),
    lwf_applicable: (raw.lwf_applicable as boolean | null) ?? null,
    lwf_employee_rate: numOrNull(raw.lwf_employee_rate),
    lwf_employer_rate: numOrNull(raw.lwf_employer_rate),
    gratuity_applicable: (raw.gratuity_applicable as boolean | null) ?? null,
    gratuity_rate: numOrNull(raw.gratuity_rate),
    gratuity_eligible_years: numOrNull(raw.gratuity_eligible_years),
    gratuity_days_per_year: numOrNull(raw.gratuity_days_per_year),
    gratuity_tax_exempt_ceiling: numOrNull(raw.gratuity_tax_exempt_ceiling),
    bonus_applicable: (raw.bonus_applicable as boolean | null) ?? null,
    bonus_min_rate: numOrNull(raw.bonus_min_rate),
    bonus_max_rate: numOrNull(raw.bonus_max_rate),
    bonus_wage_ceiling: numOrNull(raw.bonus_wage_ceiling),
    bonus_eligible_ceiling: numOrNull(raw.bonus_eligible_ceiling),
  };
}

function NumInput({ value, onChange, suffix }: { value: number | null | undefined; onChange: (v: number | null) => void; suffix?: string }) {
  return (
    <div className="relative">
      <input type="number" min={0} value={value ?? ''} onChange={e => { const v = e.target.value; onChange(v === '' ? null : Number.isFinite(+v) ? +v : null); }} className="w-full px-3 py-2 text-sm border border-[var(--border-color)] rounded-lg bg-[var(--background)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]/30" />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">{suffix}</span>}
    </div>
  );
}

function FieldRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-[var(--text-primary)]">{label}</label>
      {help && <p className="text-xs text-[var(--text-tertiary)]">{help}</p>}
      {children}
    </div>
  );
}

function ViewVal({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs text-[var(--text-tertiary)]">{label}</span>
      {help && <p className="text-[10px] text-[var(--text-disabled)]">{help}</p>}
      <span className="block text-sm font-medium text-[var(--text-primary)]">{children}</span>
    </div>
  );
}

function EditField({ fieldKey, label, help, value, onChange }: { fieldKey: string; label: string; help: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  const unit = FIELD_UNITS[fieldKey];
  const suffix = unit === '%' ? '%' : unit === 'money' ? getCurrencySymbol(getAppCurrency()) : undefined;
  return (
    <FieldRow label={label} help={`${help} ${suffix ? `(${suffix})` : ''}`}><NumInput value={value} onChange={onChange} suffix={suffix} /></FieldRow>
  );
}

const UNIT_LABELS: Record<Unit, string> = { '%': 'Percentage', 'money': 'Fixed amount', 'num': 'Count' };

function ViewField({ fieldKey, label, help, value }: { fieldKey: string; label: string; help: string; value: number | null | undefined }) {
  const unit = FIELD_UNITS[fieldKey];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--hover-bg)] text-[var(--text-secondary)]">{unit === '%' ? '%' : unit === 'money' ? getCurrencySymbol(getAppCurrency()) : 'count'}</span>
      </div>
      <p className="text-[11px] text-[var(--text-disabled)]">{help}</p>
      <span className="block text-sm font-medium text-[var(--text-primary)]">{fmtVal(fieldKey, value)}</span>
    </div>
  );
}

function ApplicableToggle({ label, checked, onChange, disabled }: { label: string; checked: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean }) {
  const val = checked === null ? 'inherit' : checked ? 'on' : 'off';
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
      <div className="flex rounded-lg border border-[var(--border-color)] overflow-hidden text-xs">
        {(['inherit', 'on', 'off'] as const).map(opt => (
          <button key={opt} disabled={disabled} onClick={() => onChange(opt === 'inherit' ? null : opt === 'on')} className={`px-3 py-1.5 text-xs font-bold transition-colors ${val === opt ? (opt === 'off' ? 'bg-red-500 text-white' : opt === 'on' ? 'bg-emerald-500 text-white' : 'bg-[var(--primary-blue)] text-white') : 'bg-[var(--background)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'}`}>
            {opt === 'inherit' ? 'Inherit' : opt === 'on' ? 'On' : 'Off'}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--border-color)] rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--primary-blue)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function OrgStatutoryDefaults() {
  const [s, setS] = useState<StatutorySetting>(EMPTY);
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('employee');

  const load = () => {
    getStatutorySettings().then(raw => {
      if (raw && typeof raw === 'object' && 'pf_applicable' in raw) {
        setS(parseResponse(raw as Record<string, unknown>));
        setHasExisting(true);
      } else {
        setS(EMPTY);
        setHasExisting(false);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (patch: Partial<StatutorySetting>) => setS(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertStatutorySettings(s);
      toast.success('Org defaults saved');
      setEditing(false);
      load();
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete all org statutory defaults? Templates will fall back to platform defaults.')) return;
    try {
      await api.delete('/payroll-config/statutory-settings');
      toast.success('Org defaults deleted');
      setS(EMPTY);
      setHasExisting(false);
      setEditing(false);
    } catch { toast.error('Failed to delete'); }
  };

  const handleApplyIndia = async () => {
    try {
      await applyStatutoryPreset('india');
      setS(INDIA_DEFAULTS);
      setHasExisting(true);
      setEditing(false);
      toast.success('Defaults applied');
    } catch { toast.error('Failed to apply preset'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--primary-blue)]" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-800">Organisation Statutory Defaults</p>
          <p className="text-xs text-blue-600 mt-1">Org-wide defaults for all company templates. Templates set to "Inherit" use these values.</p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleApplyIndia} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"><CheckCircle2 className="w-4 h-4" /> Apply Defaults</button>
            {hasExisting && <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[var(--primary-blue)] text-white rounded-lg hover:opacity-90"><Pencil className="w-4 h-4" /> Edit</button>}
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { setEditing(false); load(); }} className="px-3 py-1.5 text-xs font-medium border border-[var(--border-color)] rounded-lg hover:bg-[var(--hover-bg)]">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--primary-blue)] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
            </button>
          </div>
        )}
      </div>

      {!hasExisting && !editing && (
        <div className="text-center py-12 border border-dashed border-[var(--border-color)] rounded-xl">
          <p className="text-sm text-[var(--text-tertiary)]">No org defaults configured yet.</p>
          <p className="text-xs text-[var(--text-disabled)] mt-1">Click "Apply Defaults" to start, or "Edit" to configure manually.</p>
          <button onClick={() => setEditing(true)} className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--primary-blue)] text-white rounded-lg hover:opacity-90">Create Defaults</button>
        </div>
      )}

      {(hasExisting || editing) && (
        <>
          <div className="flex gap-2 border-b border-[var(--border-color)] pb-0">
            {(['employee', 'employer'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-[var(--primary-blue)] text-[var(--primary-blue)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                {t === 'employee' ? 'Employee' : 'Employer'}
              </button>
            ))}
          </div>

          {tab === 'employee' && (
            <div className="space-y-6">
              <Card title="Provident Fund (PF)" icon={ShieldCheck}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Employee contribution to EPF — deducted from basic wages each month.</p>
                    <ApplicableToggle label="PF applicable" checked={s.pf_applicable} onChange={v => set({ pf_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Employee rate" help="% of basic deducted from employee each month."><NumInput value={s.pf_employee_rate} onChange={v => set({ pf_employee_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="PF wage ceiling" help="Maximum basic+DA on which EPF is computed."><NumInput value={s.pf_wage_ceiling} onChange={v => set({ pf_wage_ceiling: v })} /></FieldRow>
                      <FieldRow label="Max monthly" help="Maximum PF amount deducted per month (cap)."><NumInput value={s.pf_max_monthly} onChange={v => set({ pf_max_monthly: v })} /></FieldRow>
                      <FieldRow label="Min basic for exclusion" help="Employees whose basic exceeds this can opt out of PF."><NumInput value={s.pf_min_basic_for_exclusion} onChange={v => set({ pf_min_basic_for_exclusion: v })} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="PF applicable">{appLabel(s.pf_applicable)}</ViewVal>
                    <ViewVal label="Employee rate">{fmtVal('pf_employee_rate', s.pf_employee_rate)}</ViewVal>
                    <ViewVal label="PF wage ceiling">{fmtVal('pf_wage_ceiling', s.pf_wage_ceiling)}</ViewVal>
                    <ViewVal label="Max monthly">{fmtVal('pf_max_monthly', s.pf_max_monthly)}</ViewVal>
                    <ViewVal label="Min basic for exclusion">{fmtVal('pf_min_basic_for_exclusion', s.pf_min_basic_for_exclusion)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="ESI" icon={ShieldCheck}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Employees' State Insurance — medical and cash benefit scheme for employees earning below the ceiling.</p>
                    <ApplicableToggle label="ESI applicable" checked={s.esi_applicable} onChange={v => set({ esi_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Employee rate" help="% of gross salary deducted from employee."><NumInput value={s.esi_employee_rate} onChange={v => set({ esi_employee_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="Gross ceiling" help="ESI applies only when monthly gross is below this amount."><NumInput value={s.esi_gross_ceiling} onChange={v => set({ esi_gross_ceiling: v })} /></FieldRow>
                      <FieldRow label="Disabled ceiling" help="Higher ceiling for employees with benchmark disabilities."><NumInput value={s.esi_disabled_ceiling} onChange={v => set({ esi_disabled_ceiling: v })} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="ESI applicable">{appLabel(s.esi_applicable)}</ViewVal>
                    <ViewVal label="Employee rate">{fmtVal('esi_employee_rate', s.esi_employee_rate)}</ViewVal>
                    <ViewVal label="Gross ceiling">{fmtVal('esi_gross_ceiling', s.esi_gross_ceiling)}</ViewVal>
                    <ViewVal label="Disabled ceiling">{fmtVal('esi_disabled_ceiling', s.esi_disabled_ceiling)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="Professional Tax" icon={ShieldCheck}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">State-level tax deducted from salary — amount varies by state.</p>
                    <ApplicableToggle label="PT applicable" checked={s.pt_applicable} onChange={v => set({ pt_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Flat amount" help="Fixed monthly PT deducted (state slabs override when present)."><NumInput value={s.pt_monthly_amount} onChange={v => set({ pt_monthly_amount: v })} /></FieldRow>
                      <FieldRow label="Min gross" help="PT is only deducted when monthly gross exceeds this amount."><NumInput value={s.pt_min_gross} onChange={v => set({ pt_min_gross: v })} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="PT applicable">{appLabel(s.pt_applicable)}</ViewVal>
                    <ViewVal label="Flat amount">{fmtVal('pt_monthly_amount', s.pt_monthly_amount)}</ViewVal>
                    <ViewVal label="Min gross">{fmtVal('pt_min_gross', s.pt_min_gross)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="Labour Welfare Fund (LWF)" icon={ShieldCheck}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Small employee contribution in states that levy LWF.</p>
                    <ApplicableToggle label="LWF applicable" checked={s.lwf_applicable} onChange={v => set({ lwf_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Employee rate" help="Fixed amount deducted as employee LWF contribution."><NumInput value={s.lwf_employee_rate} onChange={v => set({ lwf_employee_rate: v })} suffix={getCurrencySymbol(getAppCurrency())} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="LWF applicable">{appLabel(s.lwf_applicable)}</ViewVal>
                    <ViewVal label="Employee rate">{fmtVal('lwf_employee_rate', s.lwf_employee_rate)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="NPS — Employee" icon={ShieldCheck}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">National Pension System — voluntary contribution by employee under section 80CCD(1).</p>
                    <ApplicableToggle label="NPS applicable" checked={s.pf_applicable} onChange={v => set({ pf_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Employee rate" help="% of basic contributed to NPS by employee each month."><NumInput value={s.nps_employee_rate} onChange={v => set({ nps_employee_rate: v })} suffix="%" /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="NPS applicable">{appLabel(s.pf_applicable)}</ViewVal>
                    <ViewVal label="Employee rate">{fmtVal('nps_employee_rate', s.nps_employee_rate)}</ViewVal>
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === 'employer' && (
            <div className="space-y-6">
              <Card title="Employer PF & Pension" icon={Landmark}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Employer's share of PF — split into EPF, EPS pension, EDLI insurance and admin charges.</p>
                    <ApplicableToggle label="PF applicable" checked={s.pf_applicable} onChange={v => set({ pf_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="EPF rate" help="% of basic contributed to EPF by employer."><NumInput value={s.pf_employer_rate} onChange={v => set({ pf_employer_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="EPS rate" help="% of basic contributed to EPS pension fund by employer."><NumInput value={s.eps_employer_rate} onChange={v => set({ eps_employer_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="EPS wage ceiling" help="Basic+DA cap on which EPS pension is computed."><NumInput value={s.eps_wage_ceiling} onChange={v => set({ eps_wage_ceiling: v })} /></FieldRow>
                      <FieldRow label="EDLI rate" help="% of basic for Employees' Deposit Linked Insurance."><NumInput value={s.pf_edli_rate} onChange={v => set({ pf_edli_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="EDLI max" help="Maximum EDLI insurance amount per month."><NumInput value={s.pf_edli_max_monthly} onChange={v => set({ pf_edli_max_monthly: v })} /></FieldRow>
                      <FieldRow label="Admin charges" help="% of basic for EPF administrative charges."><NumInput value={s.pf_admin_rate} onChange={v => set({ pf_admin_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="Admin min" help="Minimum admin charges per month."><NumInput value={s.pf_admin_min_monthly} onChange={v => set({ pf_admin_min_monthly: v })} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="PF applicable">{appLabel(s.pf_applicable)}</ViewVal>
                    <ViewVal label="EPF rate">{fmtVal('pf_employer_rate', s.pf_employer_rate)}</ViewVal>
                    <ViewVal label="EPS rate">{fmtVal('eps_employer_rate', s.eps_employer_rate)}</ViewVal>
                    <ViewVal label="EPS wage ceiling">{fmtVal('eps_wage_ceiling', s.eps_wage_ceiling)}</ViewVal>
                    <ViewVal label="EDLI rate">{fmtVal('pf_edli_rate', s.pf_edli_rate)}</ViewVal>
                    <ViewVal label="EDLI max">{fmtVal('pf_edli_max_monthly', s.pf_edli_max_monthly)}</ViewVal>
                    <ViewVal label="Admin charges">{fmtVal('pf_admin_rate', s.pf_admin_rate)}</ViewVal>
                    <ViewVal label="Admin min">{fmtVal('pf_admin_min_monthly', s.pf_admin_min_monthly)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="ESI — Employer" icon={Landmark}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Employer's share of ESI — matched contribution from the organisation.</p>
                    <ApplicableToggle label="ESI applicable" checked={s.esi_applicable} onChange={v => set({ esi_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Employer rate" help="% of gross salary contributed by employer."><NumInput value={s.esi_employer_rate} onChange={v => set({ esi_employer_rate: v })} suffix="%" /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="ESI applicable">{appLabel(s.esi_applicable)}</ViewVal>
                    <ViewVal label="Employer rate">{fmtVal('esi_employer_rate', s.esi_employer_rate)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="LWF — Employer" icon={Landmark}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Employer's contribution to LWF in states that levy it.</p>
                    <ApplicableToggle label="LWF applicable" checked={s.lwf_applicable} onChange={v => set({ lwf_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Employer rate" help="Fixed amount contributed by employer as LWF."><NumInput value={s.lwf_employer_rate} onChange={v => set({ lwf_employer_rate: v })} suffix={getCurrencySymbol(getAppCurrency())} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="LWF applicable">{appLabel(s.lwf_applicable)}</ViewVal>
                    <ViewVal label="Employer rate">{fmtVal('lwf_employer_rate', s.lwf_employer_rate)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="NPS — Employer" icon={Landmark}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Employer NPS contribution under section 80CCD(2).</p>
                    <ApplicableToggle label="NPS applicable" checked={s.pf_applicable} onChange={v => set({ pf_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Employer rate" help="% of basic contributed by employer to employee's NPS account."><NumInput value={s.nps_employer_rate} onChange={v => set({ nps_employer_rate: v })} suffix="%" /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="NPS applicable">{appLabel(s.pf_applicable)}</ViewVal>
                    <ViewVal label="Employer rate">{fmtVal('nps_employer_rate', s.nps_employer_rate)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="Gratuity" icon={Landmark}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Employer-funded retirement benefit — accrued per year of service.</p>
                    <ApplicableToggle label="Gratuity applicable" checked={s.gratuity_applicable} onChange={v => set({ gratuity_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Rate" help="% of basic wage accrued per year of service."><NumInput value={s.gratuity_rate} onChange={v => set({ gratuity_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="Eligibility years" help="Minimum years of service before gratuity is payable."><NumInput value={s.gratuity_eligible_years} onChange={v => set({ gratuity_eligible_years: v })} /></FieldRow>
                      <FieldRow label="Days per year" help="Gratuity days credited per year of service."><NumInput value={s.gratuity_days_per_year} onChange={v => set({ gratuity_days_per_year: v })} /></FieldRow>
                      <FieldRow label="Tax-exempt ceiling" help="Maximum gratuity amount exempt from tax."><NumInput value={s.gratuity_tax_exempt_ceiling} onChange={v => set({ gratuity_tax_exempt_ceiling: v })} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="Gratuity applicable">{appLabel(s.gratuity_applicable)}</ViewVal>
                    <ViewVal label="Rate">{fmtVal('gratuity_rate', s.gratuity_rate)}</ViewVal>
                    <ViewVal label="Eligibility years">{fmtVal('gratuity_eligible_years', s.gratuity_eligible_years)}</ViewVal>
                    <ViewVal label="Days per year">{fmtVal('gratuity_days_per_year', s.gratuity_days_per_year)}</ViewVal>
                    <ViewVal label="Tax-exempt ceiling">{fmtVal('gratuity_tax_exempt_ceiling', s.gratuity_tax_exempt_ceiling)}</ViewVal>
                  </div>
                )}
              </Card>

              <Card title="Statutory Bonus" icon={Landmark}>
                {editing ? (
                  <>
                    <p className="text-xs text-[var(--text-tertiary)]">Payment of Bonus Act — employees earning up to the eligibility ceiling qualify; payout is computed on wages capped at the calculation cap.</p>
                    <ApplicableToggle label="Bonus applicable" checked={s.bonus_applicable} onChange={v => set({ bonus_applicable: v })} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <FieldRow label="Minimum rate" help="% of wages paid as statutory minimum bonus."><NumInput value={s.bonus_min_rate} onChange={v => set({ bonus_min_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="Maximum rate" help="% of wages — maximum bonus the employer can pay."><NumInput value={s.bonus_max_rate} onChange={v => set({ bonus_max_rate: v })} suffix="%" /></FieldRow>
                      <FieldRow label="Eligibility ceiling" help="Employees earning above this monthly wage are not eligible."><NumInput value={s.bonus_eligible_ceiling} onChange={v => set({ bonus_eligible_ceiling: v })} /></FieldRow>
                      <FieldRow label="Calculation cap" help="Bonus is computed on wages capped at this monthly amount."><NumInput value={s.bonus_wage_ceiling} onChange={v => set({ bonus_wage_ceiling: v })} /></FieldRow>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ViewVal label="Bonus applicable">{appLabel(s.bonus_applicable)}</ViewVal>
                    <ViewVal label="Minimum rate">{fmtVal('bonus_min_rate', s.bonus_min_rate)}</ViewVal>
                    <ViewVal label="Maximum rate">{fmtVal('bonus_max_rate', s.bonus_max_rate)}</ViewVal>
                    <ViewVal label="Eligibility ceiling">{fmtVal('bonus_eligible_ceiling', s.bonus_eligible_ceiling)}</ViewVal>
                    <ViewVal label="Calculation cap">{fmtVal('bonus_wage_ceiling', s.bonus_wage_ceiling)}</ViewVal>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
