import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2, Sparkles,
  ExternalLink, ListChecks, MessageCircleQuestion,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHero from '../components/PageHero';
import api from '../services/api';

// ── Status (manual checklist) types ────────────────────────────────────────
interface SetupStep {
  id: string; title: string; why: string; hint: string;
  action: string; link: string; done: boolean;
}
interface SetupStatus {
  steps: SetupStep[];
  completed: number; total: number; complete: boolean;
  nextStep: SetupStep | null;
  counts: { employees: number; leaveTypes: number; payrolls: number };
  organization: { id: number; name: string; country: string | null; currency: string | null } | null;
  companies?: { id: number; name: string }[];
  companyScope?: { id: number; name: string } | null;
  companyId?: number | null;
}

// ── Concierge interview types ──────────────────────────────────────────────
interface QuestionOption { value: string; label: string; hint?: string }
interface SetupQuestion {
  id: string; title: string; help?: string;
  type: 'choice' | 'multi';
  default: string | string[];
  options: QuestionOption[];
}
type Answers = Record<string, string | string[]>;

/**
 * First-run setup. Default mode is the guided interview ("answer a few
 * questions, we configure it for you"); the manual 6-step checklist stays
 * available as a fallback for people who want to configure piece by piece.
 */
export default function SetupWizard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [questions, setQuestions] = useState<SetupQuestion[]>([]);
  const [mode, setMode] = useState<'guided' | 'manual'>('guided');
  const [answers, setAnswers] = useState<Answers>({});
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<'interview' | 'review' | 'applying' | 'done'>('interview');
  const [applyResult, setApplyResult] = useState<{ applied: string[]; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // Multi-company architecture: an Organization holds Companies (legal
  // entities). Setup is always scoped to one company at a time.
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setError(false);
      const [s, q, cos] = await Promise.all([
        api.get('/setup/status', { params: companyId != null ? { companyId } : {} }),
        api.get('/setup/questions'),
        api.get('/companies').catch(() => ({ data: [] })),
      ]);
      setStatus(s.data as SetupStatus);
      const qs = (q.data as { questions: SetupQuestion[] }).questions || [];
      setQuestions(qs);
      const cosData = (Array.isArray(cos.data) ? cos.data : []) as { id: number; name: string }[];
      setCompanies(cosData);
      setCompanyId((prev) => {
        if (prev != null) return prev;
        return cosData.length > 0 ? cosData[0].id : null;
      });
      setAnswers((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const init: Answers = {};
        qs.forEach((qq) => { init[qq.id] = qq.default; });
        return init;
      });
    } catch {
      setError(true);
    }
  }, [companyId]);

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
          name: 'New Regime (Standard)', regime_type: 'new', is_active: true, is_default: true,
          financial_year: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
          standard_deduction: 75000, rebate_threshold: 700000, rebate_amount: 0, cess_rate: 4,
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
          name: 'Default Payroll Policy', pro_ration_method: 'paid_days',
          rounding_method: 'nearest', decimal_places: 2, round_net_salary: true,
          default_currency: 'INR', daily_rate_divisor: 30, fy_start_month: 4,
        });
        toast.success('Payroll policy created');
      } else if (stepId === 'leave_types') {
        const types = [
          { name: 'Casual Leave', code: 'casual', days_allowed: 7, is_paid: true },
          { name: 'Sick Leave', code: 'sick', days_allowed: 7, is_paid: true },
          { name: 'Earned Leave', code: 'earned', days_allowed: 15, is_paid: true },
        ];
        for (const t of types) { try { await api.post('/leave-types', t); } catch { /* exists */ } }
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

  const selectOption = (q: SetupQuestion, value: string) => {
    setAnswers((prev) => {
      if (q.type === 'multi') {
        const cur = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
        const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
        return { ...prev, [q.id]: next };
      }
      return { ...prev, [q.id]: value };
    });
  };

  const buildPayload = (cid: number | null) => ({
    country: String(answers.country ?? 'india'),
    workweek: String(answers.workweek ?? 'mon_fri'),
    work_hours: String(answers.work_hours ?? '9-6'),
    pay_type: String(answers.pay_type ?? 'monthly'),
    leaves: Array.isArray(answers.leaves) ? answers.leaves : [],
    statutory: String(answers.statutory ?? 'yes'),
    companyId: cid,
  });

  const applyConcierge = async (targetCompanyId?: number | null) => {
    const cid = targetCompanyId !== undefined ? targetCompanyId : companyId;
    setPhase('applying');
    setBusy(true);
    try {
      const res = await api.post('/setup/concierge', buildPayload(cid));
      setApplyResult({ applied: res.data.applied || [], skipped: res.data.skipped || [] });
      setStatus(res.data.status as SetupStatus);
      setPhase('done');
      toast.success('Your HRMS is configured');
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Setup failed — try again');
      setPhase('review');
    } finally {
      setBusy(false);
    }
  };

  const applyAllCompanies = async () => {
    setPhase('applying');
    setBusy(true);
    let allApplied: string[] = [];
    let allSkipped: string[] = [];
    try {
      for (const co of companies) {
        const res = await api.post('/setup/concierge', buildPayload(co.id));
        allApplied = [...allApplied, ...((res.data.applied || []) as string[]).map((x) => `${co.name}: ${x}`)];
        allSkipped = [...allSkipped, ...((res.data.skipped || []) as string[])];
      }
      setApplyResult({ applied: allApplied, skipped: allSkipped });
      if (companyId != null) {
        const s = await api.get('/setup/status', { params: { companyId } });
        setStatus(s.data as SetupStatus);
      }
      setPhase('done');
      toast.success(`Configured ${companies.length} companies`);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Setup failed — try again');
      setPhase('review');
    } finally {
      setBusy(false);
    }
  };

  const currentQ = questions[qIndex];
  const pct = useMemo(() => {
    if (phase === 'done') return 100;
    if (phase === 'review' || phase === 'applying') return 100;
    if (!questions.length) return 0;
    return Math.round((qIndex / questions.length) * 100);
  }, [phase, qIndex, questions.length]);

  const optionLabel = (q: SetupQuestion, value: string) =>
    q.options.find((o) => o.value === value)?.label ?? value;

  // ── Completed org → all-set screen ───────────────────────────────────────
  if (status?.complete && phase !== 'done' && mode === 'guided') {
    return (
      <div className="relative z-10 animate-page-enter max-w-3xl mx-auto text-center py-16">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">You're all set 🎉</h1>
        <p className="text-[var(--text-tertiary)] mb-8">
          This workspace is already configured — statutory, payroll, leave and employees are in place.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
        >
          Open dashboard
        </button>
        <p className="mt-4 text-xs text-[var(--text-tertiary)]">
          Want to re-run setup or change something?{' '}
          <button className="underline" onClick={() => setMode('manual')}>Open the manual checklist</button>
        </p>
      </div>
    );
  }

  return (
    <div className="relative z-10 animate-page-enter max-w-4xl mx-auto">
      <PageHero
        title={
          phase === 'done' ? 'Done — your HRMS is configured'
            : mode === 'guided' ? 'Answer a few questions. We\'ll set it up.'
              : 'Set up step by step'
        }
        subtitle={
          phase === 'done'
            ? 'Everything below was configured from your answers. Review it any time in Settings.'
            : mode === 'guided'
              ? 'Two minutes of questions → attendance, payroll, tax and leave configured for your company.'
              : `${status ? status.completed : 0} of ${status ? status.total : 6} steps done — about 5 minutes from a working payroll.`
        }
        icon={mode === 'guided' ? MessageCircleQuestion : Sparkles}
        accent="blue"
        breadcrumbs={['Setup']}
        actions={
          <>
            {mode === 'guided' ? (
              <button
                onClick={() => setMode('manual')}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] bg-white/80 border border-[var(--border-color)] hover:bg-white"
              >
                <ListChecks className="w-4 h-4 inline mr-1.5" /> Configure manually
              </button>
            ) : (
              <button
                onClick={() => setMode('guided')}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] bg-white/80 border border-[var(--border-color)] hover:bg-white"
              >
                <MessageCircleQuestion className="w-4 h-4 inline mr-1.5" /> Guided setup
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
            >
              Dashboard
            </button>
          </>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-6 text-sm">
          <p className="font-medium mb-1">Couldn't load setup.</p>
          <p>
            The backend didn't answer — if you just pulled new code, restart it:{' '}
            <code className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-xs">
              cd hrms_backend &amp;&amp; python main.py
            </code>
            , then refresh this page.
          </p>
        </div>
      )}

      {/* ═══════════ GUIDED INTERVIEW ═══════════ */}
      {mode === 'guided' && phase !== 'done' && (
        <>
        {/* Company scope — an org holds multiple companies (legal entities);
            every answer configures the SELECTED company only. */}
        {companies.length > 0 && (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-[var(--text-tertiary)]">Setting up:</span>
            <select
              value={companyId ?? ''}
              onChange={(e) => setCompanyId(e.target.value === '' ? null : Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] bg-white"
            >
              {companies.map((co) => (
                <option key={co.id} value={co.id}>{co.name}</option>
              ))}
            </select>
            <span className="text-xs text-[var(--text-tertiary)]">
              Each company gets its own statutory, attendance &amp; payroll configuration.
            </span>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
          {/* progress */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {phase === 'review' ? 'Review your answers'
                : phase === 'applying' ? 'Configuring your HRMS…'
                  : `Question ${qIndex + 1} of ${questions.length}`}
            </span>
            <span className="text-sm text-[var(--text-tertiary)]">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-6">
            <div className="h-full rounded-full bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>

          {phase === 'interview' && currentQ && (
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">{currentQ.title}</h2>
              {currentQ.help && <p className="text-sm text-[var(--text-tertiary)] mb-5">{currentQ.help}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {currentQ.options.map((opt) => {
                  const selected = currentQ.type === 'multi'
                    ? Array.isArray(answers[currentQ.id]) && (answers[currentQ.id] as string[]).includes(opt.value)
                    : answers[currentQ.id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => selectOption(currentQ, opt.value)}
                      className={`text-left px-4 py-4 rounded-xl border transition-all ${
                        selected
                          ? 'border-[#1C64F2] bg-blue-50/60 shadow-sm'
                          : 'border-[var(--border-color)] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {selected
                          ? <CheckCircle2 className="w-5 h-5 text-[#1C64F2] shrink-0" />
                          : <Circle className="w-5 h-5 text-slate-300 shrink-0" />}
                        <span className="font-medium text-[var(--text-primary)]">{opt.label}</span>
                      </div>
                      {opt.hint && <p className="text-xs text-[var(--text-tertiary)] mt-1 ml-7">{opt.hint}</p>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setQIndex((i) => Math.max(0, i - 1))}
                  disabled={qIndex === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--background)] disabled:opacity-40"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => {
                    if (qIndex < questions.length - 1) setQIndex((i) => i + 1);
                    else setPhase('review');
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
                >
                  {qIndex < questions.length - 1 ? 'Next' : 'Review answers'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {phase === 'review' && (
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Here's what we'll set up</h2>
              <p className="text-sm text-[var(--text-tertiary)] mb-2">
                Based on your answers. Nothing is overwritten — we only fill what's missing.
              </p>
              {companies.length > 0 && (
                <p className="text-sm font-medium text-[#1C64F2] mb-4">
                  Target company: {companies.find((c) => c.id === companyId)?.name ?? '—'}
                </p>
              )}
              <div className="divide-y divide-[var(--border-color)] rounded-xl border border-[var(--border-color)] mb-6">
                {questions.map((qq) => {
                  const val = answers[qq.id];
                  const shown = Array.isArray(val)
                    ? val.map((v) => optionLabel(qq, v)).join(', ')
                    : optionLabel(qq, String(val ?? ''));
                  return (
                    <div key={qq.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-[var(--text-tertiary)]">{qq.title}</span>
                      <span className="text-sm font-medium text-[var(--text-primary)] text-right">{shown}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => { setPhase('interview'); setQIndex(questions.length - 1); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--background)]"
                >
                  <ArrowLeft className="w-4 h-4" /> Change answers
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  {companies.length > 1 && (
                    <button
                      onClick={applyAllCompanies}
                      disabled={busy}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[#1C64F2]/40 hover:bg-blue-50 disabled:opacity-60"
                    >
                      Apply to all {companies.length} companies
                    </button>
                  )}
                  <button
                    onClick={() => applyConcierge()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {companies.length > 0
                      ? `Set up ${companies.find((c) => c.id === companyId)?.name ?? 'company'}`
                      : 'Set up my HRMS'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'applying' && (
            <div className="py-10 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-[#1C64F2] mx-auto mb-3" />
              <p className="text-[var(--text-primary)] font-medium">Configuring attendance, payroll, tax &amp; leave…</p>
            </div>
          )}
        </div>
        </>
      )}

      {/* ═══════════ DONE ═══════════ */}
      {mode === 'guided' && phase === 'done' && (
        <div className="bg-white rounded-2xl border border-emerald-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Your HRMS is configured</h2>
              <p className="text-sm text-[var(--text-tertiary)]">
                {status ? `${status.completed} of ${status.total} setup checks passing` : ''}
              </p>
            </div>
          </div>
          {(applyResult?.applied?.length ?? 0) > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Configured</div>
              <div className="flex flex-wrap gap-2">
                {applyResult!.applied.map((item) => (
                  <span key={item} className="px-3 py-1.5 rounded-lg text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(applyResult?.skipped?.length ?? 0) > 0 && (
            <div className="mb-6">
              <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Already in place (kept as-is)</div>
              <div className="flex flex-wrap gap-2">
                {applyResult!.skipped.map((item) => (
                  <span key={item} className="px-3 py-1.5 rounded-lg text-sm bg-slate-50 text-slate-600 border border-slate-200">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
            >
              Open dashboard
            </button>
            <button
              onClick={() => navigate('/employees')}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--background)]"
            >
              Add employees <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ MANUAL CHECKLIST ═══════════ */}
      {mode === 'manual' && (
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
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Done</span>
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
                            I've added employees — check again
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
      )}
    </div>
  );
}
