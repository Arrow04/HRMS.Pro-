import { useCallback, useEffect, useState } from 'react';
import {
  Scale, FileDown, Wallet, Receipt, HelpCircle, Upload, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { PayrollRule, ExplainPayload } from '../services/payrollEngineService';
import {
  listPayrollRules, publishPayrollRule, getRuleTrace,
  listArrears, applyArrears, simulateRetro,
  listPaymentBatches, createPaymentBatch, downloadBatchFile,
  listReports, downloadFiling,
  getPayrollExplain,
} from '../services/payrollEngineService';

type Tab = 'rules' | 'arrears' | 'payments' | 'filings' | 'explain';

const TABS: { id: Tab; label: string; icon: typeof Scale }[] = [
  { id: 'rules', label: 'Rules', icon: Scale },
  { id: 'arrears', label: 'Arrears', icon: Receipt },
  { id: 'payments', label: 'Payments', icon: Wallet },
  { id: 'filings', label: 'Filings', icon: FileDown },
  { id: 'explain', label: 'Explain', icon: HelpCircle },
];

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function PayrollConsole() {
  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [arrears, setArrears] = useState<Array<Record<string, unknown>>>([]);
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);
  const [reports, setReports] = useState<Array<{ code: string; name: string; authority?: string }>>([]);
  const [explainId, setExplainId] = useState('');
  const [explain, setExplain] = useState<ExplainPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (tab === 'rules') setRules(await listPayrollRules());
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

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all ${
              tab === id
                ? 'bg-[var(--primary-blue)] text-white shadow-md'
                : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border border-[var(--border-color)]'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

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

      {tab === 'explain' && (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <input
              value={explainId}
              onChange={e => setExplainId(e.target.value)}
              placeholder="Payroll ID (e.g. 42)"
              className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-sm bg-[var(--background)] text-[var(--text-primary)] w-56"
            />
            <button
              onClick={async () => {
                if (!explainId) return;
                try {
                  setExplain(await getPayrollExplain(Number(explainId)));
                } catch {
                  toast.error('Payroll not found or not visible to you');
                }
              }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5]">
              Explain
            </button>
            <span className="text-xs text-[var(--text-tertiary)]">
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
    </div>
  );
}
