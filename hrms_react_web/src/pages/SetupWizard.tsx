import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, Circle, Loader2, Sparkles, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHero from '../components/PageHero';
import api from '../services/api';

interface SetupStep {
  id: string;
  title: string;
  why: string;
  hint: string;
  action: string;
  link: string;
  done: boolean;
}

interface SetupStatus {
  steps: SetupStep[];
  completed: number;
  total: number;
  complete: boolean;
  nextStep: SetupStep | null;
  counts: { employees: number; leaveTypes: number; payrolls: number };
  organization: { id: number; name: string; country: string | null; currency: string | null } | null;
}

/**
 * First-run setup wizard. Six plain-language steps; the backend auto-detects
 * what's already done, so users can leave and come back without losing place.
 * Heavy steps deep-link to the full page instead of duplicating forms here.
 */
export default function SetupWizard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const res = await api.get('/setup/status');
      setStatus(res.data as SetupStatus);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (stepId: string) => {
    setBusy(true);
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      if (stepId === 'statutory_settings') {
        await api.post('/payroll-config/statutory-settings/apply-country', { country: 'india' });
        toast.success('India statutory defaults applied — PF, ESI and PT are ready');
      } else if (stepId === 'tax_regime') {
        await api.post('/payroll-config/tax-regimes', {
          name: 'New Regime (Standard)',
          regime_type: 'new',
          is_active: true,
          is_default: true,
          financial_year: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
          standard_deduction: 75000,
          rebate_threshold: 700000,
          rebate_amount: 0,
          cess_rate: 4,
          slabs: [
            { from_amount: 0, to_amount: 400000, rate: 0, sort_order: 0 },
            { from_amount: 400000, to_amount: 800000, rate: 5, sort_order: 1 },
            { from_amount: 800000, to_amount: 1200000, rate: 10, sort_order: 2 },
            { from_amount: 1200000, to_amount: 1600000, rate: 15, sort_order: 3 },
            { from_amount: 1600000, to_amount: 2000000, rate: 20, sort_order: 4 },
            { from_amount: 2000000, to_amount: 2400000, rate: 25, sort_order: 5 },
            { from_amount: 2400000, to_amount: null, rate: 30, sort_order: 6 },
          ],
        });
        toast.success('Tax slabs created — TDS will now calculate automatically');
      } else if (stepId === 'payroll_policy') {
        await api.post('/payroll-config/policies', {
          name: 'Default Payroll Policy',
          pro_ration_method: 'paid_days',
          rounding_method: 'nearest',
          decimal_places: 2,
          round_net_salary: true,
          default_currency: 'INR',
          daily_rate_divisor: 30,
          fy_start_month: 4,
        });
        toast.success('Payroll policy created');
      } else if (stepId === 'leave_types') {
        const types = [
          { name: 'Casual Leave', code: 'casual', days_allowed: 7, is_paid: true },
          { name: 'Sick Leave', code: 'sick', days_allowed: 7, is_paid: true },
          { name: 'Earned Leave', code: 'earned', days_allowed: 15, is_paid: true },
        ];
        for (const t of types) {
          try { await api.post('/leave-types', t); } catch { /* already exists */ }
        }
        toast.success('Casual, Sick and Earned leave added');
      } else if (stepId === 'first_payroll') {
        await api.post('/payroll/generate-all', { month, year });
        toast.success('First payroll generated — review it in Payroll before approving');
      }
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Could not complete this step');
    } finally {
      setBusy(false);
    }
  };

  const pct = status ? Math.round((status.completed / Math.max(1, status.total)) * 100) : 0;

  return (
    <div className="relative z-10 animate-page-enter max-w-5xl mx-auto">
      <PageHero
        title={error ? 'Backend not reachable' : status?.complete ? 'You\'re all set 🎉' : 'Let\'s get you set up'}
        subtitle={
          error
            ? 'Start the backend, then refresh — the wizard connects to it for your setup status.'
            : status?.complete
              ? 'Everything essential is configured. Head to the dashboard whenever you\'re ready.'
              : status
                ? `${status.completed} of ${status.total} steps done — about 5 minutes from a working payroll.`
                : 'Loading your setup status…'
        }
        icon={Sparkles}
        accent="blue"
        breadcrumbs={['Setup']}
        actions={
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
          >
            Go to dashboard
          </button>
        }
      />

      {/* Progress */}
      {status && (
      <div className="bg-white rounded-2xl border border-[var(--border-color)] p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">Setup progress</span>
          <span className="text-sm text-[var(--text-tertiary)]">{pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {status.organization && (
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Setting up <span className="font-medium text-[var(--text-primary)]">{status.organization.name}</span>
            {status.organization.country ? ` · ${status.organization.country}` : ''}
            {status.organization.currency ? ` · ${status.organization.currency}` : ''}
          </p>
        )}
      </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-6 text-sm">
          <p className="font-medium mb-1">Couldn&apos;t load setup status.</p>
          <p>
            The backend didn&apos;t answer — if you just pulled new code, restart it:{' '}
            <code className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-xs">
              cd hrms_backend &amp;&amp; python main.py
            </code>
            , then refresh this page.
          </p>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3">
        {(status?.steps ?? []).map((step, idx) => (
          <div
            key={step.id}
            className={`bg-white rounded-2xl border p-5 transition-all ${
              step.done
                ? 'border-emerald-200 bg-emerald-50/40'
                : status?.nextStep?.id === step.id
                  ? 'border-[#1C64F2] shadow-md shadow-[#1C64F2]/10'
                  : 'border-[var(--border-color)]'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="mt-0.5">
                {step.done ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                ) : status?.nextStep?.id === step.id ? (
                  <span className="flex w-6 h-6 items-center justify-center rounded-full bg-[#1C64F2] text-white text-xs font-bold">
                    {idx + 1}
                  </span>
                ) : (
                  <Circle className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-[var(--text-primary)]">{step.title}</h3>
                  {step.done && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                      Done
                    </span>
                  )}
                  {!step.done && status?.nextStep?.id === step.id && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      Next step
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">{step.why}</p>
                {!step.done && <p className="text-xs text-[var(--text-tertiary)] mt-1 opacity-80">{step.hint}</p>}

                {!step.done && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {step.id === 'employees' ? (
                      <>
                        <button
                          onClick={() => navigate(step.link)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
                        >
                          {step.action} <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={load}
                          className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--background)]"
                        >
                          I&apos;ve added employees — check again
                        </button>
                      </>
                    ) : step.id === 'first_payroll' ? (
                      <>
                        <button
                          onClick={() => run(step.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {step.action}
                        </button>
                        <button
                          onClick={() => navigate(step.link)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--background)]"
                        >
                          Open Payroll <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => run(step.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md disabled:opacity-60"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        {step.action}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {status?.complete && (
        <div className="mt-6 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-200 rounded-2xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <h3 className="font-semibold text-[var(--text-primary)]">Setup complete</h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-1 mb-4">
            Your payroll engine is ready. Run a payroll from the Payroll page — you can review
            everything before anything is approved or paid.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
          >
            Open dashboard
          </button>
        </div>
      )}
    </div>
  );
}
