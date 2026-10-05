import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2, Sparkles,
  ListChecks, MessageCircleQuestion, Building2, Clock,
  CalendarDays, Wallet, Receipt, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHero from '../components/PageHero';
import ToggleSwitch from '../components/ToggleSwitch';
import api from '../services/api';

// ── Types ──────────────────────────────────────────────────────────────────
interface FieldDef {
  id: string; type: 'toggle' | 'number' | 'time' | 'choice';
  label: string; default?: unknown; showIf?: string;
  options?: { value: string; label: string; hint?: string }[];
}
interface Question {
  id: string; type: 'choice' | 'multi' | 'fields';
  title: string; help?: string; default?: unknown;
  options?: { value: string; label: string; hint?: string }[];
  fields?: FieldDef[];
}
interface Module {
  id: string; title: string; help?: string; questions: Question[];
}
interface SetupStep {
  id: string; title: string; why: string; hint: string;
  action: string; link: string; done: boolean;
}
interface SetupStatus {
  steps: SetupStep[];
  modules?: Record<string, boolean>;
  completed: number; total: number; complete: boolean;
  nextStep: SetupStep | null;
  counts: { employees: number; leaveTypes: number; payrolls: number };
  organization: { id: number; name: string; country: string | null; currency: string | null } | null;
  companies?: { id: number; name: string }[];
  companyScope?: { id: number; name: string } | null;
  companyId?: number | null;
}
type ModuleAnswers = Record<string, Record<string, unknown>>;

const MODULE_ICONS: Record<string, typeof Building2> = {
  company: Building2, attendance: Clock, leave: CalendarDays,
  payroll: Wallet, expenses: Receipt, performance: TrendingUp,
};

function defaultForQuestion(q: Question): unknown {
  if (q.type === 'fields') {
    const init: Record<string, unknown> = {};
    (q.fields || []).forEach((f) => { init[f.id] = f.default; });
    return init;
  }
  return q.default;
}

function moduleDefaultAnswers(m: Module): Record<string, unknown> {
  const init: Record<string, unknown> = {};
  m.questions.forEach((q) => { init[q.id] = defaultForQuestion(q); });
  return init;
}

/**
 * Comprehensive module-based setup. Each section maps 1:1 to the real
 * configuration surface of that module (attendance rules, leave accrual,
 * statutory rates, payroll conventions, expense workflow, performance
 * cycle) — the same fields the module's own settings page edits.
 */
export default function SetupWizard() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [mode, setMode] = useState<'guided' | 'manual'>('guided');
  const [answers, setAnswers] = useState<ModuleAnswers>({});
  const [activeModule, setActiveModule] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedLog, setAppliedLog] = useState<Record<string, string[]>>({});
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const [ms, st, cos] = await Promise.all([
        api.get('/setup/modules'),
        api.get('/setup/status', { params: companyId != null ? { companyId } : {} }),
        api.get('/companies').catch(() => ({ data: [] })),
      ]);
      const mods = (ms.data as { modules: Module[] }).modules || [];
      setModules(mods);
      setStatus(st.data as SetupStatus);
      const cosData = (Array.isArray(cos.data) ? cos.data : []) as { id: number; name: string }[];
      setCompanies(cosData);
      setCompanyId((prev) => {
        if (prev != null) return prev;
        return cosData.length > 0 ? cosData[0].id : null;
      });
      setAnswers((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const init: ModuleAnswers = {};
        mods.forEach((m) => { init[m.id] = moduleDefaultAnswers(m); });
        return init;
      });
    } catch {
      setError(true);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const mod = modules[activeModule];
  const q = mod?.questions?.[activeQuestion];
  const modAnswers = (mod && answers[mod.id]) || {};

  const setField = (questionId: string, fieldId: string, value: unknown) => {
    if (!mod) return;
    setAnswers((prev) => {
      const cur = { ...((prev[mod.id] as Record<string, unknown>) || {}) };
      const sub = { ...((cur[questionId] as Record<string, unknown>) || {}) };
      sub[fieldId] = value;
      cur[questionId] = sub;
      return { ...prev, [mod.id]: cur };
    });
  };

  const setTopLevel = (questionId: string, value: unknown) => {
    if (!mod) return;
    setAnswers((prev) => ({
      ...prev,
      [mod.id]: { ...((prev[mod.id] as Record<string, unknown>) || {}), [questionId]: value },
    }));
  };

  const toggleMulti = (questionId: string, value: string) => {
    if (!mod) return;
    setAnswers((prev) => {
      const cur = { ...((prev[mod.id] as Record<string, unknown>) || {}) };
      const arr = Array.isArray(cur[questionId]) ? (cur[questionId] as string[]) : [];
      cur[questionId] = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [mod.id]: cur };
    });
  };

  const applyModule = async (moduleId: string, thenNext = true) => {
    setApplying(moduleId);
    setBusy(true);
    try {
      const res = await api.post(`/setup/modules/${moduleId}`, {
        answers: answers[moduleId] || {},
        companyId,
      });
      const applied = (res.data.applied || []) as string[];
      setAppliedLog((prev) => ({ ...prev, [moduleId]: applied }));
      setStatus(res.data.status as SetupStatus);
      toast.success(`${modules.find((m) => m.id === moduleId)?.title ?? moduleId} configured`);
      if (thenNext) {
        const nextIdx = activeModule + 1;
        if (nextIdx < modules.length) {
          setActiveModule(nextIdx);
          setActiveQuestion(0);
        }
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Could not apply this module');
    } finally {
      setApplying(null);
      setBusy(false);
    }
  };

  const pct = useMemo(() => {
    if (!modules.length) return 0;
    const done = modules.filter((m) => status?.modules?.[m.id]).length;
    return Math.round((done / modules.length) * 100);
  }, [modules, status]);

  const isModuleDone = (m: Module) => Boolean(status?.modules?.[m.id]);

  // ── All-set screen ──────────────────────────────────────────────────────
  if (status?.complete && mode === 'guided' && activeModule >= modules.length) {
    return (
      <div className="relative z-10 animate-page-enter max-w-3xl mx-auto text-center py-16">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Every module configured 🎉</h1>
        <p className="text-[var(--text-tertiary)] mb-8">
          Attendance, leave, payroll, statutory, expenses and performance are set up
          {companies.length > 0 ? ` for ${companies.find((c) => c.id === companyId)?.name ?? 'this company'}` : ''}.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
        >
          Open dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10 animate-page-enter max-w-6xl mx-auto">
      <PageHero
        title={
          mode === 'guided'
            ? 'Set up your HRMS — module by module'
            : 'Set up step by step'
        }
        subtitle={
          mode === 'guided'
            ? 'Each section configures a real module: attendance rules, leave policy, statutory rates, payroll conventions, expenses and performance.'
            : `${status ? status.completed : 0} of ${status ? status.total : 6} modules configured.`
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
                <ListChecks className="w-4 h-4 inline mr-1.5" /> Quick checklist
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
            The backend didn't answer — restart it:{' '}
            <code className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-xs">
              cd hrms_backend &amp;&amp; python main.py
            </code>
            , then refresh.
          </p>
        </div>
      )}

      {/* This interview is the OPTIONAL guided path — the primary setup
          experience is each module's own configuration wizard, reached from
          the dashboard checklist. */}
      {mode === 'guided' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl p-3 mb-4 text-sm flex flex-wrap items-center gap-2">
          <span>
            Prefer to configure where you'll actually work? Open any module from the
            sidebar — Attendance, Leaves, Payroll — and use its <strong>Configuration</strong> tab.
          </span>
          <button
            onClick={() => navigate('/dashboard')}
            className="underline font-medium shrink-0"
          >
            Back to dashboard
          </button>
        </div>
      )}

      {/* Company scope */}
      {companies.length > 0 && mode === 'guided' && (
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--text-tertiary)]">Configuring:</span>
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
            Each company (legal entity) gets its own attendance, payroll &amp; statutory configuration.
          </span>
        </div>
      )}

      {/* ═══════════ GUIDED: MODULE WIZARD ═══════════ */}
      {mode === 'guided' && modules.length > 0 && activeModule < modules.length && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Module rail */}
          <aside className="lg:w-64 shrink-0 space-y-1.5">
            {modules.map((m, idx) => {
              const Icon = MODULE_ICONS[m.id] || Circle;
              const done = isModuleDone(m);
              const active = idx === activeModule;
              return (
                <button
                  key={m.id}
                  onClick={() => { setActiveModule(idx); setActiveQuestion(0); }}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-[#1C64F2] bg-blue-50/60 shadow-sm'
                      : done
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-[var(--border-color)] bg-white hover:border-slate-300'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    done ? 'bg-emerald-100 text-emerald-600' : active ? 'bg-[#1C64F2] text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text-primary)] truncate">{m.title}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      {done ? 'Configured' : `${m.questions.length} step${m.questions.length > 1 ? 's' : ''}`}
                    </span>
                  </span>
                </button>
              );
            })}
            <div className="pt-2 px-1">
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] mb-1">
                <span>Overall</span><span>{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </aside>

          {/* Question panel */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-[var(--border-color)] p-6">
            {mod && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {mod.title} · Step {activeQuestion + 1} of {mod.questions.length}
                  </span>
                  {isModuleDone(mod) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Configured</span>
                  )}
                </div>
                {mod.help && <p className="text-xs text-[var(--text-tertiary)] mb-4">{mod.help}</p>}

                {q && (
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{q.title}</h2>
                    {q.help && <p className="text-sm text-[var(--text-tertiary)] mb-4">{q.help}</p>}

                    {/* choice */}
                    {q.type === 'choice' && (
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {(q.options || []).map((opt) => {
                          const selected = modAnswers[q.id] === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setTopLevel(q.id, opt.value)}
                              className={`text-left px-4 py-3 rounded-xl border transition-all ${
                                selected ? 'border-[#1C64F2] bg-blue-50/60 shadow-sm' : 'border-[var(--border-color)] hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {selected ? <CheckCircle2 className="w-4.5 h-4.5 text-[#1C64F2]" /> : <Circle className="w-4.5 h-4.5 text-slate-300" />}
                                <span className="font-medium text-sm text-[var(--text-primary)]">{opt.label}</span>
                              </div>
                              {opt.hint && <p className="text-xs text-[var(--text-tertiary)] mt-0.5 ml-6">{opt.hint}</p>}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* multi */}
                    {q.type === 'multi' && (
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {(q.options || []).map((opt) => {
                          const arr = Array.isArray(modAnswers[q.id]) ? (modAnswers[q.id] as string[]) : [];
                          const selected = arr.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleMulti(q.id, opt.value)}
                              className={`text-left px-4 py-3 rounded-xl border transition-all ${
                                selected ? 'border-[#1C64F2] bg-blue-50/60 shadow-sm' : 'border-[var(--border-color)] hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {selected ? <CheckCircle2 className="w-4.5 h-4.5 text-[#1C64F2]" /> : <Circle className="w-4.5 h-4.5 text-slate-300" />}
                                <span className="font-medium text-sm text-[var(--text-primary)]">{opt.label}</span>
                              </div>
                              {opt.hint && <p className="text-xs text-[var(--text-tertiary)] mt-0.5 ml-6">{opt.hint}</p>}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* fields form */}
                    {q.type === 'fields' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(q.fields || []).map((f) => {
                          const sub = (modAnswers[q.id] as Record<string, unknown>) || {};
                          if (f.showIf && !sub[f.showIf]) return null;
                          const val = sub[f.id];
                          return (
                            <div key={f.id} className={`px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--background)]/40 ${f.type === 'toggle' ? 'sm:col-span-2' : ''}`}>
                              <label className="flex items-center justify-between gap-3">
                                <span className="text-sm text-[var(--text-primary)]">{f.label}</span>
                                {f.type === 'toggle' ? (
                                  <ToggleSwitch
                                    checked={Boolean(val)}
                                    onChange={(v) => setField(q.id, f.id, v)}
                                    helpText={f.label}
                                  />
                                ) : f.type === 'choice' ? (
                                  <select
                                    value={String(val ?? '')}
                                    onChange={(e) => setField(q.id, f.id, e.target.value)}
                                    className="px-2 py-1.5 rounded-lg border border-[var(--border-color)] text-sm bg-white text-[var(--text-primary)]"
                                  >
                                    {(f.options || []).map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={f.type === 'time' ? 'time' : 'number'}
                                    value={val === undefined || val === null ? '' : String(val)}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (f.type === 'number') {
                                        setField(q.id, f.id, raw === '' ? 0 : Number(raw));
                                      } else {
                                        setField(q.id, f.id, raw);
                                      }
                                    }}
                                    className="w-28 px-2 py-1.5 rounded-lg border border-[var(--border-color)] text-sm bg-white text-[var(--text-primary)] text-right"
                                  />
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* nav */}
                    <div className="flex items-center justify-between mt-6">
                      <button
                        onClick={() => {
                          if (activeQuestion > 0) setActiveQuestion((i) => i - 1);
                          else if (activeModule > 0) { setActiveModule((i) => i - 1); setActiveQuestion(0); }
                        }}
                        disabled={activeModule === 0 && activeQuestion === 0}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--background)] disabled:opacity-40"
                      >
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                      <div className="flex items-center gap-2">
                        {activeQuestion < mod.questions.length - 1 ? (
                          <button
                            onClick={() => setActiveQuestion((i) => i + 1)}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
                          >
                            Next <ArrowRight className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => applyModule(mod.id, false)}
                              disabled={busy}
                              className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-primary)] border border-[#1C64F2]/40 hover:bg-blue-50 disabled:opacity-60"
                            >
                              Save this module
                            </button>
                            <button
                              onClick={() => applyModule(mod.id, true)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md disabled:opacity-60"
                            >
                              {applying === mod.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                              {activeModule < modules.length - 1 ? 'Apply & continue' : 'Finish setup'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* applied log */}
                    {appliedLog[mod.id] && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                        <div className="text-xs font-medium text-emerald-800 mb-1">Configured in {mod.title}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {appliedLog[mod.id].map((item) => (
                            <span key={item} className="px-2 py-0.5 rounded-md text-xs bg-white text-emerald-800 border border-emerald-200">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ MANUAL CHECKLIST ═══════════ */}
      {mode === 'manual' && (
        <div className="space-y-3">
          {(status?.steps ?? []).map((step, idx) => (
            <div
              key={step.id}
              className={`bg-white rounded-2xl border p-5 ${
                step.done ? 'border-emerald-200 bg-emerald-50/40'
                  : status?.nextStep?.id === step.id ? 'border-[#1C64F2] shadow-md shadow-[#1C64F2]/10'
                    : 'border-[var(--border-color)]'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5">
                  {step.done ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    : <span className="flex w-6 h-6 items-center justify-center rounded-full bg-[#1C64F2] text-white text-xs font-bold">{idx + 1}</span>}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[var(--text-primary)]">{step.title}</h3>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">{step.why}</p>
                  {!step.done && (
                    <button
                      onClick={() => {
                        const idx2 = modules.findIndex((m) => m.id === step.id);
                        setMode('guided');
                        if (idx2 >= 0) { setActiveModule(idx2); setActiveQuestion(0); }
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md"
                    >
                      {step.action} <ArrowRight className="w-4 h-4" />
                    </button>
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
