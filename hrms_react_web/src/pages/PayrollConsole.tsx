import { useCallback, useEffect, useState } from 'react';
import {
  Scale, FileDown, Wallet, Receipt, HelpCircle, Upload, CheckCircle2, AlertTriangle, BookOpen,
  Plus, X, Loader2, CalendarDays, Calculator,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AccountingPanel from '../components/AccountingPanel';
import ConfirmActionModal from '../components/ConfirmActionModal';
import DatePicker from '../components/DatePicker';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import ToggleSwitch from '../components/ToggleSwitch';
import api from '../services/api';
import { getCurrencySymbol, getAppCurrency } from '../services/currencyService';
import { getAppCountry } from '../services/appSettingsService';
import { getRuleCatalog } from '../services/statutoryRuleConfigApi';
import type { RuleCatalogType } from '../services/statutoryRuleConfigApi';
import type { PayrollRule, ExplainPayload } from '../services/payrollEngineService';
import {
  listPayrollRules, publishPayrollRule, getRuleTrace,
  listArrears, applyArrears, simulateRetro, createArrears,
  listPaymentBatches, createPaymentBatch, downloadBatchFile,
  listReports, downloadFiling,
  getPayrollExplain,
} from '../services/payrollEngineService';

type Tab = 'rules' | 'calendar' | 'planner' | 'arrears' | 'payments' | 'filings' | 'accounting' | 'explain';

// Employee summary as returned by /employees?view=summary (snake + camel).
interface EmployeeSummary {
  id?: number | string;
  employeeId?: number | string;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  employeeCode?: string;
}

// Tax planner response (old vs new regime comparison + savings tips).
interface PlannerDeductions {
  section80c?: number;
  section80d?: number;
  nps80ccd1b?: number;
  homeLoanInterest?: number;
  hraExemption?: number;
}
interface PlannerRegime {
  label?: string;
  gross?: number;
  totalDeductions?: number;
  deductions?: PlannerDeductions;
  taxableIncome?: number;
  totalTax?: number;
  incomeAfterTax?: number;
}
interface PlannerTip {
  title?: string;
  detail?: string;
  saving?: number;
}
interface PlannerResult {
  oldRegime?: PlannerRegime;
  newRegime?: PlannerRegime;
  recommendation?: { regime?: 'old' | 'new'; savings?: number };
  marginalRate?: number;
  hraExemption?: {
    actualHra?: number;
    pct?: number;
    pctOfBasic?: number;
    rentThresholdPct?: number;
    rentMinusThreshold?: number;
    amount?: number;
  };
  tips?: PlannerTip[];
}

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
  n == null ? '—' : `${getCurrencySymbol(getAppCurrency())}${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Calendar helpers — derived from today, never literal years/months.
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(Date.UTC(2000, i, 1))));
const yearOptions = (back = 2, forward = 1) => {
  const y = new Date().getFullYear();
  return Array.from({ length: back + forward + 1 }, (_, i) => y - back + i);
};
const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`;
};

// Catalog-driven field values: defaults come from statutory_rule_configs
// (backend /catalog), so law changes are config edits — not code changes.
function valuesForType(types: RuleCatalogType[], ruleType: string): Record<string, number | boolean> {
  const rt = types.find(t => t.value === ruleType);
  const vals: Record<string, number | boolean> = {};
  (rt?.fields || []).forEach(f => {
    vals[f.key] = f.default != null ? (f.default as number | boolean) : (f.kind === 'bool' ? false : 0);
  });
  return vals;
}

interface RuleFormState {
  ruleType: string;
  stateCode: string;
  effectiveFrom: string;
  effectiveTo: string;
  notificationNumber: string;
  notes: string;
  values: Record<string, number | boolean>;
  customJson: string;
}

function blankRuleForm(types: RuleCatalogType[]): RuleFormState | null {
  if (!types.length) return null;
  const first = types[0];
  return {
    ruleType: first.value,
    stateCode: '',
    effectiveFrom: todayIso(),
    effectiveTo: '',
    notificationNumber: '',
    notes: '',
    values: valuesForType(types, first.value),
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
  const [explainEmployees, setExplainEmployees] = useState<EmployeeSummary[]>([]);
  const [explain, setExplain] = useState<ExplainPayload | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Rule-builder catalog: rule types + fields, values from statutory_rule_configs.
  const [ruleCatalog, setRuleCatalog] = useState<RuleCatalogType[] | null>(null);
  useEffect(() => {
    getRuleCatalog().then(res => setRuleCatalog(res.ruleTypes)).catch(() => undefined);
  }, []);

  // Arrears employee names (instead of raw IDs).
  const [arrearsEmployees, setArrearsEmployees] = useState<EmployeeSummary[]>([]);
  useEffect(() => {
    if (tab !== 'arrears' || arrearsEmployees.length) return;
    api.get('/employees', { params: { limit: 200, view: 'summary', status: 'active' } })
      .then((res) => {
        const payload = res.data as { data?: EmployeeSummary[]; items?: EmployeeSummary[] } | EmployeeSummary[];
        const list = Array.isArray(payload) ? payload : (payload.data || payload.items || []);
        setArrearsEmployees(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const employeeLabel = (id: unknown) => {
    const emp = arrearsEmployees.find(e => Number(e.id ?? e.employeeId) === Number(id));
    if (!emp) return `#${String(id)}`;
    const name = `${emp.firstName || emp.first_name || ''} ${emp.lastName || emp.last_name || ''}`.trim();
    return name ? `${name}${emp.employeeCode ? ` (${emp.employeeCode})` : ''}` : `#${String(id)}`;
  };

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
  const [plannerEmployees, setPlannerEmployees] = useState<EmployeeSummary[]>([]);
  const [plannerInputs, setPlannerInputs] = useState({
    rentPaidMonthly: '', metro: true, section80c: '', section80d: '',
    nps80ccd1b: '', homeLoanInterest: '', otherIncome: '',
  });
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  // HRA exemption percentages from statutory config (not hardcoded 50/40).
  const [hraPcts, setHraPcts] = useState<{ metro: number | null; nonMetro: number | null }>({ metro: null, nonMetro: null });
  useEffect(() => {
    if (tab !== 'planner' || hraPcts.metro != null || hraPcts.nonMetro != null) return;
    api.get('/statutory-rules', { params: { category: 'tax' } })
      .then((res) => {
        const rows = (Array.isArray(res.data) ? res.data : []) as Array<{ rule_key?: string; current_value?: number | null }>;
        const metro = rows.find(r => r.rule_key === 'hra_metro_pct');
        const nonMetro = rows.find(r => r.rule_key === 'hra_non_metro_pct');
        setHraPcts({ metro: metro?.current_value ?? null, nonMetro: nonMetro?.current_value ?? null });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    if (tab !== 'planner' || plannerEmployees.length) return;
    api.get('/employees', { params: { limit: 200, view: 'summary', status: 'active' } })
      .then((res) => {
        const payload = res.data as { data?: EmployeeSummary[]; items?: EmployeeSummary[] } | EmployeeSummary[];
        const list = Array.isArray(payload) ? payload : (payload.data || payload.items || []);
        setPlannerEmployees(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    if (tab !== 'explain' || explainEmployees.length) return;
    api.get('/employees', { params: { limit: 200, view: 'summary', status: 'active' } })
      .then((res) => {
        const payload = res.data as { data?: EmployeeSummary[]; items?: EmployeeSummary[] } | EmployeeSummary[];
        const list = Array.isArray(payload) ? payload : (payload.data || payload.items || []);
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
      setPlannerResult(res.data as PlannerResult);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Planning failed');
    } finally {
      setPlannerLoading(false);
    }
  };

  // New effective-dated statutory rule. Type/fields/defaults come from the
  // backend catalog (statutory_rule_configs), never hardcoded values.
  const [ruleForm, setRuleForm] = useState<RuleFormState | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);
  const openRuleForm = async () => {
    let types = ruleCatalog;
    if (!types) {
      try {
        const res = await getRuleCatalog();
        types = res.ruleTypes;
        setRuleCatalog(types);
      } catch {
        toast.error('Could not load the rule catalog');
        return;
      }
    }
    const form = blankRuleForm(types);
    if (!form) { toast.error('No rule types available'); return; }
    setRuleForm(form);
  };
  const submitRule = async () => {
    if (!ruleForm) return;
    if (!ruleForm.effectiveFrom) { toast.error('Effective from date is required'); return; }
    const activeType = (ruleCatalog || []).find(t => t.value === ruleForm.ruleType);
    let definition: Record<string, unknown>;
    if (activeType && !activeType.isJson) {
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
        country: getAppCountry(),
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
      if (tab === 'rules') setRules(await listPayrollRules({ country: getAppCountry() }));
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
        country: getAppCountry(),
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

  // ── Retro rule change (two-step modal: preview, then create) ────────
  const [retroOpen, setRetroOpen] = useState(false);
  const [retroDate, setRetroDate] = useState('');
  const [retroSim, setRetroSim] = useState<{ payrollsAffected: number; netDelta: number | null } | null>(null);
  const [retroBusy, setRetroBusy] = useState<'sim' | 'create' | null>(null);
  const openRetro = () => {
    setRetroDate(todayIso());
    setRetroSim(null);
    setRetroOpen(true);
  };
  const previewRetro = async () => {
    if (!retroDate) { toast.error('Pick an effective date'); return; }
    setRetroBusy('sim');
    try {
      const sim = await simulateRetro({ effective_from: retroDate });
      const totals = (sim as { totals?: { payrolls_affected?: number; net_delta?: number } }).totals ?? {};
      setRetroSim({ payrollsAffected: totals.payrolls_affected ?? 0, netDelta: totals.net_delta ?? null });
    } catch {
      toast.error('Retro simulation failed');
    } finally {
      setRetroBusy(null);
    }
  };
  const createRetro = async () => {
    setRetroBusy('create');
    try {
      await createArrears({
        effective_from: retroDate,
        source: 'retro_rule',
        reason: `Retro change effective ${retroDate}`,
      });
      toast.success('Arrears adjustments created (originals preserved)');
      setRetroOpen(false);
      load();
    } catch {
      toast.error('Could not create retro adjustments');
    } finally {
      setRetroBusy(null);
    }
  };

  // ── Period picker modal: batch / apply-arrears / filing ─────────────
  type PeriodDialog = { kind: 'batch' } | { kind: 'apply'; arrear: Record<string, unknown> } | { kind: 'filing'; code: string };
  const [periodDlg, setPeriodDlg] = useState<PeriodDialog | null>(null);
  const [pdMonth, setPdMonth] = useState(1);
  const [pdYear, setPdYear] = useState(new Date().getFullYear());
  const [pdEst, setPdEst] = useState('');
  const [pdBusy, setPdBusy] = useState(false);
  const openPeriodDlg = (dlg: PeriodDialog) => {
    const now = new Date();
    setPdMonth(now.getMonth() + 1);
    setPdYear(now.getFullYear());
    setPdEst('');
    setPeriodDlg(dlg);
  };
  const confirmPeriodDlg = async () => {
    if (!periodDlg) return;
    if (!pdMonth || !pdYear) { toast.error('Pick a month and year'); return; }
    setPdBusy(true);
    try {
      if (periodDlg.kind === 'batch') {
        await createPaymentBatch({ month: pdMonth, year: pdYear });
        toast.success('Payment batch created');
        setPeriodDlg(null);
        load();
      } else if (periodDlg.kind === 'apply') {
        await applyArrears(periodDlg.arrear.id as number, pdMonth, pdYear);
        toast.success('Adjustment booked (originals preserved)');
        setPeriodDlg(null);
        load();
      } else {
        const blob = await downloadFiling(periodDlg.code, pdMonth, pdYear, pdEst.trim());
        download(blob as Blob, `${periodDlg.code}_${pdYear}${String(pdMonth).padStart(2, '0')}.txt`);
        toast.success(`${periodDlg.code} filing generated`);
        setPeriodDlg(null);
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      const fallback = periodDlg.kind === 'batch' ? 'No finalized payrolls for that period'
        : periodDlg.kind === 'apply' ? 'Could not book the adjustment' : 'Filing generation failed';
      toast.error(typeof d === 'string' ? d : fallback);
    } finally {
      setPdBusy(false);
    }
  };

  // ── Rule supersede / delete (no browser dialogs) ────────────────────
  const [supersedeRule, setSupersedeRule] = useState<PayrollRule | null>(null);
  const [supersedeDate, setSupersedeDate] = useState('');
  const [deleteRule, setDeleteRule] = useState<PayrollRule | null>(null);
  const [ruleActionBusy, setRuleActionBusy] = useState(false);
  const confirmSupersede = async () => {
    if (!supersedeRule || !supersedeDate) return;
    setRuleActionBusy(true);
    try {
      await api.post(`/statutory-rules/supersede/${supersedeRule.id}`, null, {
        params: { new_effective_to: supersedeDate },
      });
      toast.success(`Rule superseded from ${supersedeDate}`);
      setSupersedeRule(null);
      load();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Supersede failed');
    } finally {
      setRuleActionBusy(false);
    }
  };
  const confirmDeleteRule = async () => {
    if (!deleteRule) return;
    setRuleActionBusy(true);
    try {
      await api.delete(`/statutory-rules/${deleteRule.id}`);
      toast.success('Rule deleted');
      setDeleteRule(null);
      load();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Delete failed');
    } finally {
      setRuleActionBusy(false);
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
          <button onClick={openRuleForm}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md">
            <Plus className="w-4 h-4 inline mr-1.5" /> New dated rule
          </button>
        )}
      {tab === 'arrears' && (
          <button onClick={openRetro}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md">
            <Upload className="w-4 h-4 inline mr-1.5" /> Retro rule change
          </button>
        )}
        {tab === 'payments' && (
          <button
            onClick={() => openPeriodDlg({ kind: 'batch' })}
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
        <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 text-xs text-[var(--text-secondary)] space-y-1.5">
          <p><b className="text-[var(--text-primary)]">Effective-dated rules.</b> Each rule applies from its effective date until it is superseded — publishing never rewrites history. Prefills in the rule builder come from your organization's statutory configuration (Configuration → Statutory defaults), so when the law changes you update the config, not the code.</p>
          <p><b className="text-[var(--text-primary)]">Actions.</b> <b>Trace</b> shows which rule wins for a date and why. <b>Supersede</b> sets an end date (the engine stops choosing it after that day). <b>Delete</b> is a soft delete for mistakes — past payroll runs keep their history. Government references on each field come from the latest gazette notifications recorded in the config.</p>
        </div>
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
                    {r.status === 'active' && (
                      <button
                        onClick={() => { setSupersedeRule(r); setSupersedeDate(new Date().toISOString().slice(0, 10)); }}
                        className="text-amber-600 text-xs font-medium">
                        Supersede
                      </button>
                    )}
                    <button onClick={() => setDeleteRule(r)} className="text-red-600 text-xs font-medium">Delete</button>
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
                  {plannerEmployees.map((e) => (
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
                    value={plannerInputs[key]}
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
                  <option value="metro">Metro{hraPcts.metro != null ? ` (${hraPcts.metro}% HRA)` : ''}</option>
                  <option value="non-metro">Non-metro{hraPcts.nonMetro != null ? ` (${hraPcts.nonMetro}% HRA)` : ''}</option>
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
                const r = plannerResult;
                const oldR = r.oldRegime ?? {};
                const newR = r.newRegime ?? {};
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
                        Income after tax: {fmt(better?.incomeAfterTax)} · marginal slab rate {r.marginalRate ?? '—'}%
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[oldR, newR].map((reg, idx) => {
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
                        Least of: actual HRA {fmt(r.hraExemption?.actualHra)} · {r.hraExemption?.pct ?? '—'}% of basic {fmt(r.hraExemption?.pctOfBasic)} ·
                        rent − {r.hraExemption?.rentThresholdPct ?? '—'}% of basic {fmt(r.hraExemption?.rentMinusThreshold)}
                      </p>
                      <p className="text-lg font-bold text-[#0F172A]">Exempt: {fmt(r.hraExemption?.amount)}</p>
                    </div>

                    {!!(r.tips ?? []).length && (
                      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">How to save more</h4>
                        <ul className="space-y-2">
                          {(r.tips ?? []).map((t, i) => (
                            <li key={i} className="flex items-start justify-between gap-4 text-sm">
                              <div>
                                <p className="font-medium text-[var(--text-primary)]">{t.title}</p>
                                <p className="text-xs text-[#64748B]">{t.detail}</p>
                              </div>
                              {(t.saving ?? 0) > 0 && <span className="text-sm font-semibold text-[#059669] whitespace-nowrap">save {fmt(t.saving)}</span>}
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
                  <td className="px-4 py-3">{employeeLabel(a.employeeId)}</td>
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
                        onClick={() => openPeriodDlg({ kind: 'apply', arrear: a })}
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
                onClick={() => openPeriodDlg({ kind: 'filing', code: r.code })}
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
                onChange={v => setExplainEmpId(String(v))}
                options={explainEmployees.map((e) => ({
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
                options={MONTH_NAMES.map((m, i) => ({ id: String(i + 1), name: m }))}
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
                options={yearOptions().map(y => ({ id: String(y), name: String(y) }))}
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
      {ruleForm && (() => {
        const activeType = (ruleCatalog || []).find(t => t.value === ruleForm.ruleType);
        const structured = activeType && !activeType.isJson;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setRuleForm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--border-color)] flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#0F172A]">New dated statutory rule</h3>
                <p className="text-xs text-[#64748B] mt-0.5 max-w-lg">
                  e.g. a changed wage ceiling or rate effective from a future date — payroll runs use this rule from the effective date.
                  For months already paid, run <b>Arrears → Retro rule change</b> to settle the difference.
                  Field defaults and references come from your statutory configuration.
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
                        values: valuesForType(ruleCatalog || [], t),
                      });
                    }}
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                    {(ruleCatalog || []).map(rt => (
                      <option key={rt.value} value={rt.value}>{rt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">State code (optional)</label>
                  <input
                    value={ruleForm.stateCode}
                    onChange={(e) => setRuleForm({ ...ruleForm, stateCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. KA, MH — blank = country-wide"
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Effective from</label>
                  <DatePicker
                    value={ruleForm.effectiveFrom}
                    onChange={(v) => setRuleForm({ ...ruleForm, effectiveFrom: v })}
                    required
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Effective to (optional)</label>
                  <DatePicker
                    value={ruleForm.effectiveTo}
                    onChange={(v) => setRuleForm({ ...ruleForm, effectiveTo: v })}
                    className="w-full"
                  />
                </div>
              </div>

              {structured ? (
                <div>
                  <p className="text-xs font-semibold text-[#0F172A] mb-2">{activeType!.label} parameters</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {activeType!.fields.map(f => {
                      const unitSuffix = f.unit === '%' ? ' (%)'
                        : f.unit === 'money' ? ` (${getCurrencySymbol(getAppCurrency())})` : '';
                      return (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">{f.label}{unitSuffix}</label>
                        {f.kind === 'bool' ? (
                          <div className="py-1">
                            <ToggleSwitch
                              checked={Boolean(ruleForm.values[f.key])}
                              onChange={v => setRuleForm({ ...ruleForm, values: { ...ruleForm.values, [f.key]: v } })}
                              align="left"
                            />
                          </div>
                        ) : (() => {
                          const rawVal = ruleForm.values[f.key];
                          return (
                          <input
                            type="number" step="any"
                            value={typeof rawVal === 'number' ? rawVal : ''}
                            onChange={(e) => setRuleForm({
                              ...ruleForm,
                              values: { ...ruleForm.values, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) },
                            })}
                            className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                          />
                          );
                        })()}
                        {(f.help || f.notificationRef) && (
                          <p className="mt-0.5 text-[10px] text-[#94A3B8] leading-snug">
                            {f.help}
                            {f.notificationRef && (
                              <span className="block font-medium text-[#64748B]">{f.notificationRef}</span>
                            )}
                          </p>
                        )}
                      </div>
                      );
                    })}
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
                  <p className="mt-0.5 text-[10px] text-[#94A3B8]">
                    {activeType ? `${activeType.label}: enter the definition exactly as the rule engine expects.` : 'Unknown rule type — enter the raw definition.'}
                  </p>
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
        );
      })()}

      {/* Retro rule change: preview impact, then create adjustments */}
      {retroOpen && (
        <Modal isOpen onClose={() => setRetroOpen(false)} title="Retro rule change" size="md">
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Applies the latest rule changes to payrolls already processed. Originals are preserved —
              adjustments appear under Arrears for review before the next run.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Effective from</label>
              <DatePicker
                value={retroDate}
                onChange={(v) => { setRetroDate(v); setRetroSim(null); }}
                required
                className="w-full"
              />
            </div>
            {retroSim && (
              <div className={`rounded-xl border p-3 text-sm ${retroSim.payrollsAffected > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="font-medium text-[#0F172A]">
                  {retroSim.payrollsAffected} payroll(s) affected · net delta {fmt(retroSim.netDelta)}
                </p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Creating adjustments does not change past payslips — the difference books into the period you choose when applying.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setRetroOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">
                Cancel
              </button>
              {!retroSim ? (
                <button
                  onClick={previewRetro}
                  disabled={retroBusy === 'sim'}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                  {retroBusy === 'sim' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Preview impact
                </button>
              ) : (
                <button
                  onClick={createRetro}
                  disabled={retroBusy === 'create'}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                  {retroBusy === 'create' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create adjustments
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Period picker: payment batch / apply arrears / generate filing */}
      {periodDlg && (
        <Modal
          isOpen
          onClose={() => setPeriodDlg(null)}
          title={
            periodDlg.kind === 'batch' ? 'New payment batch'
              : periodDlg.kind === 'apply' ? 'Apply adjustment'
              : 'Generate filing'
          }
          size="sm">
          <div className="space-y-4">
            {periodDlg.kind === 'apply' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Book <b>{employeeLabel(periodDlg.arrear.employeeId)}</b> · {fmt(periodDlg.arrear.amount as number)} ·
                {' '}{String(periodDlg.arrear.source)} into the chosen period. Originals stay untouched.
              </p>
            )}
            {periodDlg.kind === 'batch' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Creates a bank payment batch for all finalized payrolls in the period.
              </p>
            )}
            {periodDlg.kind === 'filing' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Generates the <b>{periodDlg.code}</b> government return file for the chosen period.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Month</label>
                <select
                  value={pdMonth}
                  onChange={(e) => setPdMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Year</label>
                <select
                  value={pdYear}
                  onChange={(e) => setPdYear(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]">
                  {yearOptions().map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            {periodDlg.kind === 'filing' && (
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1">Establishment code (optional)</label>
                <input
                  value={pdEst}
                  onChange={(e) => setPdEst(e.target.value)}
                  placeholder="From your registration with the authority"
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2]"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPeriodDlg(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">
                Cancel
              </button>
              <button
                onClick={confirmPeriodDlg}
                disabled={pdBusy}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                {pdBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {periodDlg.kind === 'filing' ? 'Generate' : 'Confirm'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Supersede a rule (set its end date) */}
      {supersedeRule && (
        <Modal isOpen onClose={() => setSupersedeRule(null)} title="Supersede rule" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              <b>{supersedeRule.ruleType}</b> · v{supersedeRule.version} · effective from {supersedeRule.effectiveFrom}.
              After the end date below, the engine stops choosing this rule and resolves the next applicable one.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1">Ends on</label>
              <DatePicker value={supersedeDate} onChange={setSupersedeDate} required className="w-full" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSupersedeRule(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">
                Cancel
              </button>
              <button
                onClick={confirmSupersede}
                disabled={ruleActionBusy || !supersedeDate}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                {ruleActionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Supersede
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Soft-delete a rule */}
      <ConfirmActionModal
        isOpen={!!deleteRule}
        title="Delete rule"
        message={deleteRule ? `Delete rule #${deleteRule.id} (${deleteRule.ruleType}, v${deleteRule.version})?` : ''}
        consequence="The rule is soft-deleted and stops resolving for future runs. Past payroll history keeps its rule references."
        variant="danger"
        isPending={ruleActionBusy}
        confirmLabel="Delete rule"
        onConfirm={confirmDeleteRule}
        onCancel={() => setDeleteRule(null)}
      />
    </div>
  );
}
