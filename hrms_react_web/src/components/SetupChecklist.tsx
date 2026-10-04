import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ListChecks } from 'lucide-react';
import api from '../services/api';

interface Step { id: string; title: string; done: boolean }
interface Status {
  steps: Step[];
  completed: number;
  total: number;
  complete: boolean;
  nextStep: { id: string; title: string; action: string; link: string } | null;
}

/**
 * Home-screen setup checklist. Renders ONLY while setup is incomplete, so a
 * configured org never sees onboarding noise — and a new org always knows
 * exactly what to do next.
 */
export default function SetupChecklist() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/setup/status')
      .then((res) => { if (!cancelled) setStatus(res.data as Status); })
      .catch(() => { /* non-admin or offline — stay silent */ });
    return () => { cancelled = true; };
  }, []);

  if (!status || status.complete) return null;

  const next = status.nextStep;
  return (
    <div className="mb-6 bg-gradient-to-r from-[#1C64F2]/10 via-[#4F46E5]/10 to-transparent border border-[#1C64F2]/30 rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1C64F2] text-white flex items-center justify-center shrink-0">
            <ListChecks className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-[var(--text-primary)]">
                Finish setting up your HRMS
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 text-[#1C64F2] font-medium">
                {status.completed}/{status.total} done
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {status.steps.map((s) => (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border ${
                    s.done
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white/60 text-slate-500 border-slate-200'
                  }`}
                >
                  {s.done && <CheckCircle2 className="w-3 h-3" />}
                  {s.title}
                </span>
              ))}
            </div>
            {next && (
              <p className="text-sm text-[var(--text-tertiary)] mt-1.5">
                Next: <span className="font-medium text-[var(--text-primary)]">{next.title}</span>
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] shadow-md shrink-0"
        >
          {next ? next.action : 'Open setup'} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
