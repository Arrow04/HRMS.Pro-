import { useCallback, useEffect, useState } from 'react';
import {
  Scale, FileDown, Wallet, Receipt, HelpCircle, Upload, CheckCircle2, AlertTriangle, BookOpen,
  Plus, X, Loader2, CalendarDays, Calculator,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AccountingPanel from '../components/AccountingPanel';
import SearchableSelect from '../components/SearchableSelect';
import api from '../services/api';
import type { PayrollRule, ExplainPayload } from '../services/payrollEngineService';
import {
  listPayrollRules, publishPayrollRule, getRuleTrace,
  listArrears, applyArrears, simulateRetro,
  listPaymentBatches, createPaymentBatch, downloadBatchFile,
  listReports, downloadFiling,
  getPayrollExplain,
} from '../services/payrollEngineService';

type Tab = 'rules' | 'calendar' | 'planner' | 'arrears' | 'payments' | 'filings' | 'accounting' | 'explain';

const TABS: { id: Tab; label: string; icon: typeof Scale }[] = [
  { id: 'rules', label: 'Statutory Rules', icon: Scale },
  { id: 'calendar', label: 'Compliance Calendar', icon: CalendarDays },
  { id: 'planner', label: 'Tax Planner', icon: Calculator },
  { id: 'arrears', label: 'Arrears & Retro', icon: Receipt },
  { id: 'payments', label: 'Bank Payments', icon: Wallet },
  { id: 'filings', label: 'Statutory Filings', icon: FileDown },
  { id: 'accounting', label: 'Accounting', icon: BookOpen },
  { id: 'explain', label: 'Payslip Explainer', icon: HelpCircle },
];

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Effective-dated statutory rule presets. Keys match the engine's rule
// definitions (statutory_rule_engine / seed_indian_statutory_rules).
const RULE_PRESETS: Record<string, {
  label: string;
  fields: { key: string; label: string; help?: string }[];
  prefill: Record<string, number>;
}> = {
  pf_contribution: {
    label: 'PF contribution',
    fields: [
      { key: 'rate', label: 'Employee rate %', help: 'e.g. 12' },
      { key: 'wage_ceiling', label: 'PF wage ceiling', help: 'e.g. 25000 - PF computed on min(Basic+DA, this)' },
      { key: 'max_monthly', label: 'Max monthly (cap)', help: 'e.g. 3000 = 12% of 25000' },
      { key: 'eps_rate', label: 'EPS rate %' },
      { key: 'eps_wage_ceiling', label: 'EPS wage ceiling' },
      { key: 'edli_rate', label: 'EDLI rate %' },
      { key: 'edli_max', label: 'EDLI max' },
      { key: 'admin_rate', label: 'Admin charges %' },
      { key: 'admin_min', label: 'Admin min' },
    ],
    prefill: { rate: 12, wage_ceiling: 15000, max_monthly: 1800, eps_rate: 8.33, eps_wage_ceiling: 15000, edli_rate: 0.5, edli_max: 75, admin_rate: 0.5, admin_min: 75 },
  },
  esi_contribution: {
    label: 'ESI contribution',
    fields: [
      { key: 'employee_rate', label: 'Employee rate %', help: 'e.g. 0.75' },
      { key: 'employer_rate', label: 'Employer rate %', help: 'e.g. 3.25' },
      { key: 'gross_ceiling', label: 'Gross ceiling', help: 'e.g. 25000 - ESI applies below this' },
    ],
    prefill: { employee_rate: 0.75, employer_rate: 3.25, gross_ceiling: 21000 },
  },
};

interface RuleFormState {
  ruleType: string;
  stateCode: string;
  effectiveFrom: string;
  effectiveTo: string;
  notificationNumber: string;
  notes: string;
  values: Record<string, number>;
  customJson: string;
}

function blankRuleForm(): RuleFormState {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  return {
    ruleType: 'pf_contribution',
    stateCode: '',
    effectiveFrom: iso,
    effectiveTo: '',
    notificationNumber: '',
    notes: '',
    values: { ...(RULE_PRESETS.pf_contribution.prefill) },
    customJson: '{\n  \n}',
  };
}

export default function PayrollConsole() {
  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [arrears, setArrears] = useState<Array<Record<string, unknown>>>([]);
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);
  const [reports, setReports] = useState<Array<{ code: string; name: string; authority?: string }>>([]);
  const [explainEmpId, setExplainEmpId] = useState('');
  const [explainMonth, setExplainMonth] = useState(new Date().getMonth() + 1);
  const [explainYear, setExplainYear] = useState(new Date().getFullYear());
  const [explainEmployees, setExplainEmployees] = useState<Array<Record<string, unknown>>>([]);
  const [explain, setExplain] = useState<ExplainPayload | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Filing calendar: what we owe, to whom, by when, and is it done.
  interface CalendarItem {
    code: string; name: string; authority: string; periodLabel: string;
    periodKey: string; dueDate: string; status: 'filed' | 'overdue' | 'due_soon' | 'upcoming';
    amount: number; filedByName?: string | null; notes?: string | null;
  }
  const [calendar, setCalendar] = useState<{ items: CalendarItem[]; counts: Record<string, number> } | null>(null);
  const [calendarFilter, setCalendarFilter] = useState<'open' | 'all' | 'filed'>('open');
  const markFiled = async (item: CalendarItem) => {
    try {
      await api.post('/payroll/compliance-calendar/file', {
        code: item.code, periodKey: item.periodKey, notes: item.notes || '',
      });
      toast.success(`${item.name} (${item.periodLabel}) marked as filed`);
      const res = await api.get('/payroll/compliance-calendar');
      setCalendar(res.data);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to mark as filed');
    }
  };
  const unmarkFiled = async (item: CalendarItem) => {
    try {
      await api.delete('/payroll/compliance-calendar/file', { params: { periodKey: item.periodKey } });
      toast.success('Filed mark removed');
      const res = await api.get('/payroll/compliance-calendar');
      setCalendar(res.data);
    } catch {
      toast.error('Failed to remove filed mark');
    }
  };

  // Take-home / tax optimizer: old vs new regime with savings tips.
  const [plannerEmpId, setPlannerEmpId] = useState('');
  const [plannerEmployees, setPlannerEmployees] = useState<Array<Record<string, unknown>>>([]);
  const [plannerInputs, setPlannerInputs] = useState({
    rentPaidMonthly: '', metro: true, section80c: '', section80d: '',
    nps80ccd1b: '', homeLoanInterest: '', otherIncome: '',
  });
  const [plannerResult, setPlannerResult] = useState<Record<string, unknown> | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  useEffect(() => {
    if (tab !== 'planner' || plannerEmployees.length) return;
    api.get('/employees', { params: { limit: 200, view: 'summary', status: 'active' } })
      .then((res) => {
        const list = (res.data as any)?.data || (res.data as any)?.items || res.data || [];
        setPlannerEmployees(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    if (tab !== 'explain' || explainEmployees.length) return;
    api.get('/employees', { params: { limit: 200, view: 'summary', status: 'active' } })
      .then((res) => {
        const list = (res.data as any)?.data || (res.data as any)?.items || res.data || [];
        setExplainEmployees(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const runPlanner = async () => {
    if (!plannerEmpId) { toast.error('Pick an employee first'); return; }
    setPlannerLoading(true);
    try {
      const num = (v: string) => (v === '' ? undefined : Number(v));
      const res = await api.post('/payroll/tax-planner', {
        employeeId: Number(plannerEmpId),
        rentPaidMonthly: num(plannerInputs.rentPaidMonthly),
        metro: plannerInputs.metro,
        section80c: num(plannerInputs.section80c),
        section80d: num(plannerInputs.section80d),
        nps80ccd1b: num(plannerInputs.nps80ccd1b),
        homeLoanInterest: num(plannerInputs.homeLoanInterest),
        otherIncome: num(plannerInputs.otherIncome),
      });
      setPlannerResult(res.data as Record<string, unknown>);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Planning failed');
    } finally {
      setPlannerLoading(false);
    }
  };

  // New effective-dated statutory rule (e.g. "PF ceiling 25,000 from April").
  const [ruleForm, setRuleForm] = useState<RuleFormState | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);
  const submitRule = async () => {
    if (!ruleForm) return;
    if (!ruleForm.effectiveFrom) { toast.error('Effective from date is required'); return; }
    let definition: Record<string, unknown>;
    if (ruleForm.ruleType in RULE_PRESETS) {
      definition = { ...ruleForm.values };
    } else {
      try {
        definition = JSON.parse(ruleForm.customJson || '{}');
      } catch {
        toast.error('Definition is not valid JSON');
        return;
      }
    }
    setRuleSaving(true);
    try {
      await api.post('/statutory-rules/', {
        rule_type: ruleForm.ruleType,
        country: 'India',
        state_code: ruleForm.stateCode || null,
        effective_from: ruleForm.effectiveFrom,
        effective_to: ruleForm.effectiveTo || null,
        definition,
        notification_number: ruleForm.notificationNumber || null,
        notes: ruleForm.notes || null,
        status: 'active',
      });
      toast.success('Statutory rule created — runs pick it up from the effective date');
      setRuleForm(null);
      load();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Failed to create rule');
    } finally {
      setRuleSaving(false);
    }
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (tab === 'rules') setRules(await listPayrollRules());
      if (tab === 'calendar') {
        const res = await api.get('/payroll/compliance-calendar');
        setCalendar(res.data);
      }
      if (tab === 'arrears') setArrears(await listArrears());
      if (tab === 'payments') setBatches(await listPaymentBatches());
      if (tab === 'filings') setReports(await listReports());
    } catch {
      toast.error('Failed to load payroll data');
    } finally {
      setBusy(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const showTrace = async (rule: PayrollRule) => {
    try {
      const t = await getRuleTrace({
        ruleType: rule.ruleType,
        asOf: rule.effectiveFrom,
        ...(rule.stateCode ? { stateCode: rule.stateCode } : {}),
      });
      setTrace(t as unknown as Record<string, unknown>);
    } catch {
      toast.error('Could not resolve rule trace');
    }
  };

  const publish = async (rule: PayrollRule) => {
    try {
      await publishPayrollRule(rule.id);
      toast.success(`Rule v${rule.version} published`);
      load();
    } catch {
      toast.error('Publish failed (check for conflicting rules)');
    }
  };

  const runRetro = async () => {
    const effectiveFrom = window.prompt('Retroactive rule effective from (YYYY-MM-DD):');
    if (!effectiveFrom) return;
    try {
      const sim = await simulateRetro({ effective_from: effectiveFrom });
      const totals = (sim as { totals?: { payrolls_affected?: number; net_delta?: number } }).totals ?? {};
      const ok = window.confirm(
        `${totals.payrolls_affected ?? 0} payroll(s) affected, net delta ${fmt(totals.net_delta)}. Create adjustments?`,
      );
      if (ok) {
        await (await import('../services/payrollEngineService')).createArrears({
          effective_from: effectiveFrom,
          source: 'retro_rule',
          reason: `Retro change effective ${effectiveFrom}`,
        });
        toast.success('Arrears adjustments created (originals preserved)');
        load();
      }
    } catch {
      toast.error('Retro simulation failed');
    }
  };

  const download = async (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Compliance &amp; Rules</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Statutory rules, arrears, payments, government filings and explainability.
            The law changes; the rules change; the engine does not.
          </p>
        </div>
        {tab === 'rules' && (
          <button onClick={() => setRuleForm(blankRuleForm())}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md">
            <Plus className="w-4 h-4 inline mr-1.5" /> New dated rule
          </button>
        )}
      {tab === 'arrears' && (
          <button onClick={runRetro}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md">
            <Upload className="w-4 h-4 inline mr-1.5" /> Retro rule change
          </button>
        )}
        {tab === 'payments' && (
          <button
            onClick={async () => {
              const month = Number(window.prompt('Payroll month (1-12):', '8'));
              const year = Number(window.prompt('Year:', '2026'));
              if (!month || !year) return;
              try {
                await createPaymentBatch({ month, year });
                toast.success('Payment batch created');
                load();
              } catch {
                toast.error('No finalized payrolls for that period');
              }
            }}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md">
            <Wallet className="w-4 h-4 inline mr-1.5" /> New batch
          </button>
        )}
      </div>

      <div className="border-b border-[var(--border-color)]">
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === id
                  ? 'border-[var(--primary-blue)] text-[var(--primary-blue)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'calendar' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {([
              ['overdue', 'Overdue', 'bg-red-50 text-red-700 border-red-200'],
              ['due_soon', 'Due in 7 days', 'bg-amber-50 text-amber-700 border-amber-200'],
              ['filed', 'Filed', 'bg-green-50 text-green-700 border-green-200'],
              ['upcoming', 'Upcoming', 'bg-slate-50 text-slate-600 border-slate-200'],
            ] as const).map(([key, label, cls]) => (
              <div key={key} className={`px-3 py-2 rounded-xl border ${cls}`}>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-lg font-bold leading-tight">{calendar?.counts?.[key] ?? 0}</p>
              </div>
            ))}
            <div className="flex gap-2 ml-auto">
              {([['open', 'Open'], ['all', 'All'], ['filed', 'Filed']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setCalendarFilter(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${calendarFilter === id ? 'bg-[#1C64F2] text-white border-[#1C64F2]' : 'border-[var(--border-color)] text-[#64748B] hover:bg-[var(--hover-bg)]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3">Filing</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(calendar?.items || [])
                  .filter(i => calendarFilter === 'all'
                    || (calendarFilter === 'filed' ? i.status === 'filed' : i.status !== 'filed'))
                  .map(i => {
                    const pill =
                      i.status === 'overdue' ? 'bg-red-100 text-red-700'
                        : i.status === 'due_soon' ? 'bg-amber-100 text-amber-700'
                        : i.status === 'filed' ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600';
                    return (
                      <tr key={i.periodKey} className="border-b border-[var(--border-color)] last:border-0">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pill}`}>
                            {i.status === 'due_soon' ? 'Due soon' : i.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`font-medium ${i.status === 'overdue' ? 'text-red-600' : 'text-[var(--text-primary)]'}`}>
                            {new Date(i.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--text-primary)]">{i.name}</div>
                          <div className="text-[11px] text-[var(--text-tertiary)]">{i.authority}</div>
                        </td>
                        <td className="px-4 py-3">{i.periodLabel}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                          {i.amount > 0 ? fmt(i.amount) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {i.status === 'filed' ? (
                              <>
                                <span className="text-[11px] text-green-700">
                                  ✓ {i.filedByName || 'filed'}
                                </span>
                                <button onClick={() => unmarkFiled(i)} className="text-[var(--text-tertiary)] text-xs font-medium hover:underline">
                                  Undo
                                </button>
                              </>
                            ) : (
                              <button onClick={() => markFiled(i)}
                                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700">
                                Mark filed
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {!calendar?.items?.length && !busy && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                    No filing obligations found.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            Due dates are configurable per org (<b>settings.payroll.filing_due_dates</b>) and are reminders, not legal advice — verify against the latest gazette notifications.
          </p>
        </div>
      )}

      {tab === 'rules' && (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Effective</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-[var(--border-color)] last:border-0">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                    {r.ruleType}{r.ruleSubtype ? ` / ${r.ruleSubtype}` : ''}
                  </td>
                  <td className="px-4 py-3">{r.stateCode || r.country}{r.organizationId ? ' · org' : ' · central'}</td>
                  <td className="px-4 py-3">{r.effectiveFrom}{r.effectiveTo ? ` → ${r.effectiveTo}` : ''}</td>
                  <td className="px-4 py-3">v{r.version}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      r.status === 'active' ? 'bg-green-100 text-green-700'
                        : r.status === 'draft' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => showTrace(r)} className="text-[var(--primary-blue)] text-xs font-medium">Trace</button>
                    {r.status === 'draft' && (
                      <button onClick={() => publish(r)} className="text-green-600 text-xs font-medium">Publish</button>
                    )}
                  </td>
                </tr>
              ))}
              {!rules.length && !busy && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                  No rules yet. Published statutory rules drive every calculation.
                </td></tr>
              )}
            </tbody>
          </table>
          {trace && (
            <div className="p-4 border-t border-[var(--border-color)] bg-[var(--background)] text-xs">
              <div className="font-semibold mb-1 text-[var(--text-primary)]">Resolution trace</div>
              <pre className="whitespace-pre-wrap text-[var(--text-secondary)]">
                {JSON.stringify(trace, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === 'planner' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Take-home &amp; tax optimizer</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Compares the old regime (with exemptions) against the new regime using your configured slabs,
              and suggests how to save more. Salary figures auto-fill from the employee's structure and declarations.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Employee</label>
                <select
                  value={plannerEmpId}
                  onChange={(e) => setPlannerEmpId(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                  <option value="">Select employee…</option>
                  {plannerEmployees.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}{e.employeeCode ? ` · ${e.employeeCode}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {([
                ['rentPaidMonthly', 'Monthly rent paid'],
                ['section80c', '80C investments'],
                ['section80d', '80D insurance'],
                ['nps80ccd1b', 'NPS 80CCD(1B)'],
                ['homeLoanInterest', 'Home loan interest'],
                ['otherIncome', 'Other income'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">{label}</label>
                  <input
                    type="number"
                    value={(plannerInputs as any)[key]}
                    onChange={(e) => setPlannerInputs({ ...plannerInputs, [key]: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">City type</label>
                <select
                  value={plannerInputs.metro ? 'metro' : 'non-metro'}
                  onChange={(e) => setPlannerInputs({ ...plannerInputs, metro: e.target.value === 'metro' })}
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                  <option value="metro">Metro (50% HRA)</option>
                  <option value="non-metro">Non-metro (40% HRA)</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={runPlanner}
                disabled={plannerLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md disabled:opacity-50">
                {plannerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                Compare &amp; optimize
              </button>
            </div>
          </div>

          {plannerResult && (
            <div className="space-y-4">
              {(() => {
                const r = plannerResult as any;
                const oldR = r.oldRegime;
                const newR = r.newRegime;
                const better = r.recommendation?.regime === 'old' ? oldR : newR;
                return (
                  <>
                    <div className={`rounded-2xl border p-4 ${r.recommendation?.regime === 'old' ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <p className="text-sm font-semibold text-[#0F172A]">
                        {r.recommendation?.regime === 'old' ? 'Old regime' : 'New regime'} is better for this employee
                        {' — saves '}
                        {fmt(r.recommendation?.savings)} / year in tax.
                      </p>
                      <p className="text-xs text-[#64748B] mt-1">
                        Income after tax: {fmt(better?.incomeAfterTax)} · marginal slab rate {r.marginalRate}%
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[oldR, newR].map((reg: any, idx: number) => {
                        const isBetter = (idx === 0) === (r.recommendation?.regime === 'old');
                        return (
                          <div key={idx} className={`rounded-2xl border p-4 ${isBetter ? 'border-[#1C64F2] bg-blue-50/40' : 'border-[var(--border-color)] bg-[var(--card-bg)]'}`}>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-[var(--text-primary)]">{reg.label}</h4>
                              {isBetter && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1C64F2] text-white">Recommended</span>}
                            </div>
                            <dl className="space-y-1.5 text-sm">
                              <div className="flex justify-between"><dt className="text-[#64748B]">Gross income</dt><dd className="font-medium">{fmt(reg.gross)}</dd></div>
                              <div className="flex justify-between"><dt className="text-[#64748B]">Total deductions</dt><dd className="font-medium text-[#059669]">− {fmt(reg.totalDeductions)}</dd></div>
                              {reg.deductions && (
                                <div className="pl-3 space-y-1 text-xs text-[#64748B]">
                                  <div className="flex justify-between"><dt>80C</dt><dd>{fmt(reg.deductions.section80c)}</dd></div>
                                  <div className="flex justify-between"><dt>80D</dt><dd>{fmt(reg.deductions.section80d)}</dd></div>
                                  <div className="flex justify-between"><dt>NPS 80CCD(1B)</dt><dd>{fmt(reg.deductions.nps80ccd1b)}</dd></div>
                                  <div className="flex justify-between"><dt>Home loan (Sec 24)</dt><dd>{fmt(reg.deductions.homeLoanInterest)}</dd></div>
                                  <div className="flex justify-between"><dt>HRA exemption</dt><dd>{fmt(reg.deductions.hraExemption)}</dd></div>
                                </div>
                              )}
                              <div className="flex justify-between border-t border-[var(--border-color)] pt-1.5"><dt className="text-[#64748B]">Taxable income</dt><dd className="font-medium">{fmt(reg.taxableIncome)}</dd></div>
                              <div className="flex justify-between"><dt className="text-[#64748B]">Total tax (incl. cess)</dt><dd className="font-semibold text-[#DC2626]">{fmt(reg.totalTax)}</dd></div>
                              <div className="flex justify-between"><dt className="text-[#64748B]">Income after tax</dt><dd className="font-bold text-[#059669]">{fmt(reg.incomeAfterTax)}</dd></div>
                            </dl>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">HRA exemption (Sec 10(13A))</h4>
                      <p className="text-xs text-[#64748B] mb-2">
                        Least of: actual HRA {fmt(r.hraExemption.actualHra)} · {r.hraExemption.pct}% of basic {fmt(r.hraExemption.pctOfBasic)} ·
                        rent − {r.hraExemption.rentThresholdPct}% of basic {fmt(r.hraExemption.rentMinusThreshold)}
                      </p>
                      <p className="text-lg font-bold text-[#0F172A]">Exempt: {fmt(r.hraExemption.amount)}</p>
                    </div>

                    {!!(r.tips || []).length && (
                      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">How to save more</h4>
                        <ul className="space-y-2">
                          {(r.tips || []).map((t: any, i: number) => (
                            <li key={i} className="flex items-start justify-between gap-4 text-sm">
                              <div>
                                <p className="font-medium text-[var(--text-primary)]">{t.title}</p>
                                <p className="text-xs text-[#64748B]">{t.detail}</p>
                              </div>
                              {t.saving > 0 && <span className="text-sm font-semibold text-[#059669] whitespace-nowrap">save {fmt(t.saving)}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {tab === 'arrears' && (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {arrears.map(a => (
                <tr key={String(a.id)} className="border-b border-[var(--border-color)] last:border-0">
                  <td className="px-4 py-3">#{String(a.employeeId)}</td>
                  <td className="px-4 py-3">{(a.period as { fromYear?: number })?.fromYear}-{String((a.period as { fromMonth?: number })?.fromMonth).padStart(2, '0')}</td>
                  <td className="px-4 py-3">{String(a.source)}</td>
                  <td className="px-4 py-3 font-medium">{fmt(a.amount as number)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      a.kind === 'arrears' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {String(a.kind)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{String(a.status)}</td>
                  <td className="px-4 py-3">
                    {a.status !== 'applied' && (
                      <button
                        onClick={async () => {
                          const month = Number(window.prompt('Book into month (1-12):', '9'));
                          const year = Number(window.prompt('Year:', '2026'));
                          if (!month || !year) return;
                          await applyArrears(a.id as number, month, year);
                          toast.success('Adjustment booked (originals preserved)');
                          load();
                        }}
                        className="text-[var(--primary-blue)] text-xs font-medium">Apply</button>
                    )}
                  </td>
                </tr>
              ))}
              {!arrears.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                  No arrears. Retro rule changes appear here as adjustments.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Employees</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={String(b.id)} className="border-b border-[var(--border-color)] last:border-0">
                  <td className="px-4 py-3 font-medium">{String(b.batchRef)}</td>
                  <td className="px-4 py-3">{String(b.year)}-{String(b.month).padStart(2, '0')}</td>
                  <td className="px-4 py-3">{String(b.employeeCount)}</td>
                  <td className="px-4 py-3">{fmt(b.totalAmount as number)}</td>
                  <td className="px-4 py-3">{String(b.status)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        const blob = await downloadBatchFile(b.id as number);
                        download(blob as Blob, `${String(b.batchRef)}.csv`);
                      }}
                      className="text-[var(--primary-blue)] text-xs font-medium flex items-center gap-1">
                      <FileDown className="w-3.5 h-3.5" /> Bank file
                    </button>
                  </td>
                </tr>
              ))}
              {!batches.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-tertiary)]">
                  No payment batches yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'filings' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reports.map(r => (
            <div key={r.code} className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
              <div className="flex items-center gap-2 mb-1">
                <FileDown className="w-4 h-4 text-[var(--primary-blue)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">{r.name}</h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4">{r.authority || 'Statutory authority'}</p>
              <button
                onClick={async () => {
                  const month = Number(window.prompt('Month (1-12):', '8'));
                  const year = Number(window.prompt('Year:', '2026'));
                  const establishmentCode = window.prompt('Establishment code (optional):', '') || '';
                  if (!month || !year) return;
                  const blob = await downloadFiling(r.code, month, year, establishmentCode);
                  download(blob as Blob, `${r.code}_${year}${String(month).padStart(2, '0')}.txt`);
                  toast.success(`${r.code} filing generated`);
                }}
                className="w-full px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5]">
                Generate filing
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'accounting' && (
        <div className="animate-in fade-in duration-300"><AccountingPanel /></div>
      )}

      {tab === 'explain' && (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex-1 min-w-[200px] max-w-xs">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Employee</label>
              <SearchableSelect
                value={explainEmpId}
                onChange={v => setExplainEmpId(v)}
                options={explainEmployees.map((e: any) => ({
                  id: String(e.id ?? e.employeeId ?? ''),
                  name: `${e.firstName || e.first_name || ''} ${e.lastName || e.last_name || ''}`.trim() + (e.employeeCode ? ` (${e.employeeCode})` : ''),
                }))}
                placeholder="Select employee"
                showAllOption={false}
                className="w-full h-[42px]"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Month</label>
              <SearchableSelect
                value={String(explainMonth)}
                onChange={v => setExplainMonth(Number(v))}
                options={Array.from({ length: 12 }, (_, i) => ({
                  id: String(i + 1),
                  name: new Date(2026, i).toLocaleString('en', { month: 'long' }),
                }))}
                placeholder="Month"
                showAllOption={false}
                className="w-full h-[42px]"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Year</label>
              <SearchableSelect
                value={String(explainYear)}
                onChange={v => setExplainYear(Number(v))}
                options={[2024, 2025, 2026, 2027].map(y => ({ id: String(y), name: String(y) }))}
                placeholder="Year"
                showAllOption={false}
                className="w-full h-[42px]"
              />
            </div>
            <button
              onClick={async () => {
                if (!explainEmpId) { toast.error('Select an employee'); return; }
                setExplainLoading(true);
                try {
                  const r = await api.get('/payroll', {
                    params: { employeeId: Number(explainEmpId), month: explainMonth, year: explainYear, limit: 1 },
                  });
                  const rows = Array.isArray(r.data) ? r.data : (r.data?.data || []);
                  if (!rows.length) { toast.error('No payroll found for this employee/period'); setExplain(null); setExplainLoading(false); return; }
                  setExplain(await getPayrollExplain(rows[0].id));
                } catch {
                  toast.error('Payroll not found or not visible to you');
                }
                setExplainLoading(false);
              }}
              className="h-[42px] px-5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] whitespace-nowrap">
              {explainLoading ? 'Loading...' : 'Explain'}
            </button>
            <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline pb-2">
              Every figure shows its rule, version, formula and inputs.
            </span>
          </div>

          {explain && (
            <div className="space-y-4">
              <div className="text-sm text-[var(--text-secondary)]">
                Payroll #{explain.payrollId} · {explain.period.year}-{String(explain.period.month).padStart(2, '0')} ·
                Net <span className="font-semibold text-[var(--text-primary)]">{fmt(explain.context.netSalary)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                    <th className="px-3 py-2">Figure</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Why</th>
                    <th className="px-3 py-2">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {explain.lines.map((l, i) => (
                    <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium text-[var(--text-primary)]">{l.label}</span>
                        <span className="ml-2 text-xs text-[var(--text-tertiary)]">{l.side}</span>
                      </td>
                      <td className="px-3 py-2 font-medium">{fmt(l.amount)}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                        {l.formula}
                        {l.wageBasis && <span className="ml-1 text-[var(--text-tertiary)]">({l.wageBasis})</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {l.ruleId
                          ? <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> #{l.ruleId} v{l.ruleVersion}</span>
                          : <span className="text-[var(--text-tertiary)] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {l.source}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* New effective-dated statutory rule */}
      {ruleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setRuleForm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--border-color)] flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#0F172A]">New dated statutory rule</h3>
                <p className="text-xs text-[#64748B] mt-0.5 max-w-lg">
                  e.g. “PF wage ceiling ₹25,000 from April” — payroll runs use this rule from the effective date.
                  For months already paid, run <b>Arrears → Retro rule change</b> to settle the difference.
                </p>
              </div>
              <button onClick={() => setRuleForm(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4 overflow-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Rule type</label>
                  <select
                    value={ruleForm.ruleType}
                    onChange={(e) => {
                      const t = e.target.value;
                      setRuleForm({
                        ...ruleForm,
                        ruleType: t,
                        values: { ...(RULE_PRESETS[t]?.prefill || {}) },
                      });
                    }}
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                    <option value="pf_contribution">PF contribution</option>
                    <option value="esi_contribution">ESI contribution</option>
                    <option value="pf_exclusion">PF exclusion</option>
                    <option value="professional_tax">Professional tax</option>
                    <option value="bonus">Statutory bonus</option>
                    <option value="custom">Custom (JSON)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">State code (optional)</label>
                  <input
                    value={ruleForm.stateCode}
                    onChange={(e) => setRuleForm({ ...ruleForm, stateCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. KA, MH — blank = all India"
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Effective from</label>
                  <input
                    type="date"
                    value={ruleForm.effectiveFrom}
                    onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Effective to (optional)</label>
                  <input
                    type="date"
                    value={ruleForm.effectiveTo}
                    onChange={(e) => setRuleForm({ ...ruleForm, effectiveTo: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
              </div>

              {ruleForm.ruleType in RULE_PRESETS ? (
                <div>
                  <p className="text-xs font-semibold text-[#0F172A] mb-2">{RULE_PRESETS[ruleForm.ruleType].label} parameters</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {RULE_PRESETS[ruleForm.ruleType].fields.map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">{f.label}</label>
                        <input
                          type="number" step="any"
                          value={ruleForm.values[f.key] ?? ''}
                          onChange={(e) => setRuleForm({
                            ...ruleForm,
                            values: { ...ruleForm.values, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) },
                          })}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                        />
                        {f.help && <p className="mt-0.5 text-[10px] text-[#94A3B8] leading-snug">{f.help}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Definition (JSON)</label>
                  <textarea
                    value={ruleForm.customJson}
                    onChange={(e) => setRuleForm({ ...ruleForm, customJson: e.target.value })}
                    rows={8}
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Notification number (optional)</label>
                  <input
                    value={ruleForm.notificationNumber}
                    onChange={(e) => setRuleForm({ ...ruleForm, notificationNumber: e.target.value })}
                    placeholder="e.g. GSR 123(E)"
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Notes (optional)</label>
                  <input
                    value={ruleForm.notes}
                    onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-[var(--border-color)] flex items-center justify-end gap-2">
              <button onClick={() => setRuleForm(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button
                onClick={submitRule}
                disabled={ruleSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                {ruleSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
