import { Settings, Play, ClipboardCheck, Wallet, FileDown, HelpCircle, ArrowRight } from 'lucide-react';

/**
 * PayrollJourney - the "how payroll works" guide for everyone.
 *
 * A visual, plain-English walkthrough of the monthly payroll process. Each
 * step says WHAT happens and WHY, and takes the user straight to the tab
 * that does it. New users learn the flow; experts jump where they need to be.
 */

export interface JourneyStep {
  id: string;
  title: string;
  what: string;
  why: string;
  icon: typeof Settings;
  tab: string;
}

export const JOURNEY_STEPS: JourneyStep[] = [
  {
    id: 'setup',
    title: '1. Set up once',
    what: 'Define salary components (Basic, HRA…), tax regime and statutory settings like PF, ESI and Professional Tax.',
    why: 'Configuration is the law of your payroll. When the government changes a rule, only the rule changes - never the engine.',
    icon: Settings,
    tab: 'config',
  },
  {
    id: 'run',
    title: '2. Run payroll',
    what: 'The engine computes every salary for the month: attendance, overtime, bonuses, leave, PF/ESI/PT and income tax (TDS).',
    why: 'One deterministic calculation for everyone - a daily worker, a manager and a director all go through the same engine.',
    icon: Play,
    tab: 'run',
  },
  {
    id: 'review',
    title: '3. Review & approve',
    what: 'Check the numbers before any money moves. Filter by company, branch or department and approve.',
    why: 'Finalised payroll is locked and immutable - corrections happen through arrears, never silent edits.',
    icon: ClipboardCheck,
    tab: 'review',
  },
  {
    id: 'pay',
    title: '4. Pay salaries',
    what: 'Generate bank payment files, send the payouts and mark what was paid or failed.',
    why: 'Every rupee is reconciled against the books - missing, duplicate or mismatched payments are detected automatically.',
    icon: Wallet,
    tab: 'compliance',
  },
  {
    id: 'file',
    title: '5. File statutory returns',
    what: 'Download the EPF ECR, ESI return and Professional Tax statement in the exact government file formats.',
    why: 'Compliance without spreadsheet gymnastics - the filings are generated from the same payroll numbers.',
    icon: FileDown,
    tab: 'compliance',
  },
];

const CONCEPTS: { term: string; meaning: string }[] = [
  { term: 'Gross earnings', meaning: 'Everything earned: basic, allowances, overtime and bonus - before any deduction.' },
  { term: 'Statutory deductions', meaning: 'PF, ESI, Professional Tax and LWF - contributions the law requires.' },
  { term: 'TDS', meaning: 'Income tax deducted at source, computed from your tax regime and investment declarations.' },
  { term: 'Net pay', meaning: 'What lands in the bank: gross earnings minus all deductions.' },
  { term: 'Employer cost', meaning: 'The company\'s true cost: net pay + employer PF/ESI/gratuity contributions.' },
  { term: 'Rules, not hard-coding', meaning: 'Every rate and slab is versioned data. Past months always keep the rules that were in force then.' },
];

export default function PayrollJourney({
  activeTab,
  onNavigate,
}: {
  activeTab: string;
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* The journey: what happens, in order */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle className="w-4 h-4 text-[var(--primary-blue)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">How payroll works</h3>
          <span className="text-xs text-[var(--text-tertiary)]">— click any step to go there</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
          {JOURNEY_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = step.tab === activeTab;
            return (
              <button
                key={step.id}
                onClick={() => onNavigate(step.tab)}
                className={`text-left rounded-xl border p-4 transition-all group ${
                  isActive
                    ? 'border-[var(--primary-blue)] bg-blue-50/60 shadow-md'
                    : 'border-[var(--border-color)] bg-[var(--background)] hover:border-[var(--primary-blue)]/50 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isActive ? 'bg-[var(--primary-blue)] text-white' : 'bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{step.title}</div>
                  {idx < JOURNEY_STEPS.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] hidden md:block ml-auto" />
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{step.what}</p>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mt-2 italic">{step.why}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Key concepts in plain English */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Key concepts, in plain English</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {CONCEPTS.map(c => (
            <div key={c.term} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary-blue)] mt-1.5 shrink-0" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <span className="font-semibold text-[var(--text-primary)]">{c.term}</span> — {c.meaning}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)] mt-4">
          Wondering why a number is what it is? Open <span className="font-semibold">Compliance &amp; Rules → Explain</span>,
          enter a payroll ID and every figure shows its rule, version, formula and inputs.
        </p>
      </div>
    </div>
  );
}
