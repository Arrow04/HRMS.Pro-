import { useState } from 'react';
import {
  Settings, Play, ClipboardCheck, Wallet, FileDown, HelpCircle, ArrowRight,
  ChevronDown, BookOpen, GraduationCap, Receipt, Landmark, Calculator,
  ShieldCheck, MessageCircle,
} from 'lucide-react';

/**
 * PayrollJourney - the complete "how payroll works" training guide.
 *
 * Written to TEACH a new HR professional Indian payroll from first
 * principles: the monthly journey, how a salary is built, what statutory
 * deductions are, how TDS works, how corrections happen, and how to answer
 * any employee's "why is my salary X?" question.
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. The monthly journey
// ────────────────────────────────────────────────────────────────────────────

interface JourneyStep {
  id: string;
  title: string;
  what: string;
  why: string;
  icon: typeof Settings;
  tab: string;
}

const JOURNEY_STEPS: JourneyStep[] = [
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
    what: 'The engine computes every salary: attendance, overtime, bonuses, leave, PF/ESI/PT and income tax (TDS).',
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

// ────────────────────────────────────────────────────────────────────────────
// Reusable accordion + sections
// ────────────────────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[var(--background)] transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-[var(--primary-blue)]/10 text-[var(--primary-blue)] flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{subtitle}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4">{children}</div>}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{children}</p>;
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)] leading-relaxed">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary-blue)] mt-1.5 shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[var(--background)] text-[var(--text-tertiary)]">
            {head.map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border-color)] last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 text-[var(--text-secondary)] ${j === 0 ? 'font-medium text-[var(--text-primary)]' : ''}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// The guide
// ────────────────────────────────────────────────────────────────────────────

export default function PayrollJourney({
  activeTab,
  onNavigate,
}: {
  activeTab: string;
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-gradient-to-r from-[#1C64F2]/10 via-[#4F46E5]/5 to-transparent p-5">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-5 h-5 text-[var(--primary-blue)]" />
          <h2 className="text-base font-bold text-[var(--text-primary)]">Payroll, explained</h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          Everything a new HR needs to understand how salaries are calculated, what the law
          requires, and how to answer any employee's questions. Start with the journey below,
          then dive into any topic. Click a step to jump straight to where it happens.
        </p>
      </div>

      {/* 1. Journey */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">The monthly journey</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">Five steps, every month, in this order.</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {JOURNEY_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = step.tab === activeTab;
            return (
              <button
                key={step.id}
                onClick={() => onNavigate(step.tab)}
                className={`text-left rounded-xl border p-4 transition-all ${
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

      {/* 2. How a salary is built */}
      <Section icon={Calculator} title="How a salary is built" subtitle="CTC → Gross → Deductions → Net pay, with a worked example" defaultOpen>
        <P>
          <b>CTC (Cost to Company)</b> is the annual amount the company spends on an employee,
          including employer contributions. <b>Gross salary</b> is what the employee earns each
          month before deductions. <b>Net pay</b> is what reaches the bank.
        </P>
        <MiniTable
          head={['Component', 'What it is', 'Example']}
          rows={[
            ['Basic Salary', 'The core of pay; PF, gratuity and encashment are calculated on it. Commonly 40-50% of CTC.', '₹50,000'],
            ['DA (Dearness Allowance)', 'Cost-of-living allowance (common in government/PSU pay).', '₹0'],
            ['HRA', 'House rent allowance; partially tax-exempt when rent is actually paid (typically 50% of basic in metros).', '₹25,000'],
            ['Conveyance / Medical / Special', 'Allowances configured by the company.', '₹1,600 + ₹1,250'],
            ['Overtime / Bonus / Incentive', 'Variable pay for the month.', '₹0'],
            ['Gross earnings', 'Sum of everything earned.', '₹77,850'],
            ['(-) PF', 'Provident Fund - see statutory section.', '₹1,800'],
            ['(-) Professional Tax', 'State tax on employment.', '₹200'],
            ['(-) TDS', 'Income tax for the month.', '₹2,500'],
            ['= Net pay', 'What the employee receives.', '₹73,350'],
          ]}
        />
        <P>
          <b>Pro-ration:</b> employees joining or leaving mid-month are paid only for the days
          worked. If someone joins on the 16th of a 30-day month, every earning is multiplied by
          15/30 - and statutory deductions follow the reduced wages.
        </P>
      </Section>

      {/* 3. Attendance drives pay */}
      <Section icon={Play} title="Attendance drives pay" subtitle="Present days, half days, leave and how they change the payslip">
        <Bullets
          items={[
            <>Pay = salary × <b>paid days ÷ working days</b> (the pro-ration factor). Present days, paid
            leave and holidays count as paid; unpaid leave (LOP) does not.</>,
            <><b>Half days</b> count as half a paid day (configurable). A day shorter than the policy's
            half-day threshold hours is auto-detected.</>,
            <><b>Leave without pay (LOP)</b> reduces that month's salary - and reduces the PF/ESI wages
            accordingly, because those are charged on earned wages.</>,
            <><b>Overtime</b> pays extra: hours × rate × multiplier (e.g. 1.5× on normal days, 2× on
            holidays - configurable per policy).</>,
            <><b>Holidays on weekly offs</b> never inflate paid days - they can't hide an absence.</>,
            <>An employee with <b>zero attendance</b> and no approved leave gets zero pay for the month -
            the system never silently pays a full month.</>,
          ]}
        />
      </Section>

      {/* 4. Statutory deductions */}
      <Section icon={Landmark} title="Statutory deductions (India)" subtitle="PF, ESI, Professional Tax, LWF, Bonus and Gratuity - what the law requires">
        <MiniTable
          head={['Scheme', 'Employee pays', 'Employer pays', 'Key rules']}
          rows={[
            ['EPF (Provident Fund)', '12% of PF wages', '12% (8.33% to pension + rest to PF)', 'PF wages capped at ₹15,000/month by default; EPF/EPS/EDLI all under the EPF Act'],
            ['ESI', '0.75% of gross', '3.25% of gross', 'Applies only while monthly gross ≤ ₹21,000'],
            ['Professional Tax', 'State slab (e.g. ₹200/month)', '—', 'Deducted monthly; every state has its own slab table'],
            ['LWF (Labour Welfare Fund)', 'Small state contribution', 'Matching contribution', 'State-specific, often half-yearly'],
            ['Statutory Bonus', '—', '8.33% - 20% of bonus wages', 'Payable when salary ≤ ₹21,000/month; can be spread monthly'],
            ['Gratuity', '—', 'Accrued, paid at exit', '15/26 × last basic+DA × years of service; eligible after 5 years (>240 days counts as a year)'],
          ]}
        />
        <P>
          <b>Why caps matter:</b> PF is calculated on <i>PF wages</i>, not the full salary. If PF
          wages are capped at ₹15,000, an employee earning ₹50,000 still has PF of ₹1,800
          (12% × ₹15,000). These caps and rates are <b>versioned rules</b> - when the government
          revises them, a new rule version applies from its effective date and history stays intact.
        </P>
      </Section>

      {/* 5. Income tax / TDS */}
      <Section icon={Calculator} title="Income tax (TDS) made simple" subtitle="Regimes, declarations, and why TDS changes during the year">
        <Bullets
          items={[
            <><b>Tax regime:</b> employees choose the <b>New regime</b> (lower slabs, almost no
            deductions) or the <b>Old regime</b> (higher slabs, allows 80C/80D/NPS/HRA exemptions).
            The choice is configuration - both are computed by the same engine.</>,
            <><b>Standard deduction</b> (₹50,000 old regime / ₹75,000 new regime) is subtracted
            automatically.</>,
            <><b>Investment declarations</b> (80C, 80D, NPS, home loan, HRA rent proof) reduce taxable
            income in the old regime. HR verifies proofs; unverified declarations can be excluded.</>,
            <><b>Monthly TDS = annual tax ÷ remaining months</b>, adjusted for tax already deducted
            (YTD) and previous-employer income. This is why TDS rises in later months if salary
            components change.</>,
            <><b>Form 16</b> is the annual TDS certificate (Part B is generated here; Part A comes
            from TRACES after the employer files Form 24Q). Employees with zero TDS get a Salary
            Certificate instead.</>,
          ]}
        />
      </Section>

      {/* 6. Lifecycle & corrections */}
      <Section icon={ShieldCheck} title="Payroll lifecycle & corrections" subtitle="Why payroll is locked, and how mistakes get fixed">
        <P>
          Payroll moves through: <b>Draft → Calculated → Validation → Pending Approval → Approved →
          Locked → Processed → Paid</b>. Once locked, the numbers are <b>immutable</b> - this is what
          makes the audit trail trustworthy.
        </P>
        <P>
          <b>Fixing mistakes:</b> never edit a processed month. Instead:
        </P>
        <Bullets
          items={[
            <><b>Arrears / recovery</b> - the difference is booked as an adjustment in a later month
            (positive = arrears payable, negative = recovery).</>,
            <><b>Retro rule changes</b> - if the government notifies a change in August effective from
            April, the system identifies the affected months, recomputes them, and creates the
            arrears automatically. The original payrolls stay untouched.</>,
            <><b>Reversal</b> - a wrongly processed month can be reversed with a compensating entry.</>,
          ]}
        />
      </Section>

      {/* 7. Payments & filings */}
      <Section icon={Receipt} title="Payments & government filings" subtitle="Getting money out and staying compliant">
        <Bullets
          items={[
            <><b>Payment batches:</b> collect all net pays for a period into one batch, generate the
            bank file (columns configurable per bank), then mark each payment paid or failed. The
            system reconciles books vs bank and flags missing, duplicate or mismatched amounts.</>,
            <><b>EPF ECR:</b> the monthly Electronic Challan cum Return (pipe-delimited file) is
            generated from the same payroll numbers and uploaded to the EPFO portal.</>,
            <><b>ESI return</b> and <b>Professional Tax statement</b> are generated the same way.</>,
            <><b>Accounting:</b> salary expense, employer contributions and the payables (salary,
            TDS, PF, ESI) post as journal entries for your accounting system.</>,
          ]}
        />
      </Section>

      {/* 8. Answering employees */}
      <Section icon={MessageCircle} title="Answering 'why is my salary X?'" subtitle="The Explain feature - your 10-second answer to any salary question">
        <P>
          Go to <b>Compliance &amp; Rules → Explain</b>, enter the payroll ID, and the system shows
          every figure with the exact reason: which rule applied, its version, the formula and the
          input values. Example:
        </P>
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-4 text-xs text-[var(--text-secondary)] leading-relaxed">
          <b>PF ₹1,800</b> ← rule #12 v7 (G.S.R. 999(E)), formula{' '}
          <code className="px-1 rounded bg-[var(--card-bg)]">MIN(PF_WAGES × 12%, cap)</code>,
          inputs {'{'}BASIC: 50,000, paid_days: 30, wage_basis: PF_WAGES{'}'}
        </div>
        <P>
          Because explanations are stored with each payroll, even after a rule changes you can still
          show an employee why last month's number was what it was.
        </P>
      </Section>

      {/* 9. FAQ */}
      <Section icon={HelpCircle} title="HR's payroll FAQ" subtitle="The questions you will actually be asked">
        <div className="space-y-3">
          {[
            ['An employee joined on the 16th. What do we pay?',
             'Half a month. Every earning is pro-rated by days employed ÷ working days, and PF/ESI apply to the reduced earned wages. Just run payroll - the engine handles the pro-ration from their join date.'],
            ['An employee took 3 days LOP. What changes?',
             'Their paid days drop by 3, so gross pay reduces proportionally. PF/ESI reduce too (they are charged on earned wages); Professional Tax usually stays a flat monthly amount.'],
            ['Someone resigned mid-month with 10 leave days pending.',
             'Use Full & Final settlement (Exit Management): final salary until the last working day + leave encashment + gratuity (if 5+ years) - minus any loans or notice-period shortfall.'],
            ['The government revised PF rates. Do we change code?',
             'No. Publish a new PF rule version with the effective date. Future months use it automatically; past months keep the old rules and their payslips stay explainable.'],
            ['Salary was revised mid-year. What about past months?',
             'The revision takes effect from its date. If you want the difference for months already processed, run a retro adjustment - the system computes arrears per month and books them as adjustments.'],
            ['Why did TDS increase this month?',
             'TDS is recomputed monthly on projected annual income minus what is already deducted. A bonus, a revised salary or exhausted exemptions raises the projection - ask Explain for the exact inputs.'],
            ['Employee says their PF is wrong.',
             'Open Explain for that payroll. It shows the PF wage basis and cap used. Common explanation: PF is on basic (or PF wages capped at ₹15,000), not on the full salary.'],
            ['Can we edit a processed payroll?',
             'No - processed payroll is immutable by design. Corrections go through arrears adjustments or reversal, which keeps the audit trail intact.'],
          ].map(([q, a]) => (
            <div key={q} className="rounded-xl border border-[var(--border-color)] p-4">
              <div className="text-xs font-semibold text-[var(--text-primary)] mb-1.5">{q}</div>
              <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{a}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 10. Glossary */}
      <Section icon={BookOpen} title="Glossary" subtitle="Every payroll term in one place">
        <MiniTable
          head={['Term', 'Meaning']}
          rows={[
            ['CTC', 'Cost to Company - total annual employer spend, including employer PF/ESI/gratuity.'],
            ['Gross salary', 'Total earnings for the month before deductions.'],
            ['Net pay', 'Amount paid to the bank after all deductions.'],
            ['Basic + DA', 'The base on which PF, gratuity and encashment are calculated.'],
            ['HRA', 'House Rent Allowance - partially exempt from tax when rent is paid.'],
            ['PF wages', 'The wage base PF applies to (usually basic+DA, often capped).'],
            ['ESI wages', 'The wage base for ESI (usually gross, while under the ceiling).'],
            ['Bonus wages', 'The wage base for statutory bonus (usually gross, capped).'],
            ['TDS', 'Tax Deducted at Source - the monthly income tax withheld.'],
            ['LOP', 'Loss of Pay - unpaid leave; reduces paid days and pay.'],
            ['Pro-ration', 'Scaling pay for partial months (joiners/leavers).'],
            ['Arrears', 'Pay owed for past months (revision or rule change), paid in a later month.'],
            ['Recovery', 'Negative arrears - amount recovered from a later salary.'],
            ['F&F', 'Full & Final settlement - everything owed/deducted when an employee exits.'],
            ['Form 16', 'Annual TDS certificate (Part B from employer, Part A from TRACES).'],
            ['ECR', 'EPF Electronic Challan cum Return - the monthly EPFO filing.'],
            ['Gratuity', 'Exit benefit after 5+ years: 15/26 × last basic+DA × years.'],
            ['Employer cost', 'Net pay + employer contributions (PF/ESI/gratuity) - the true cost.'],
          ]}
        />
      </Section>

      {/* 11. Key concepts strip (quick reference) */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Six things to remember</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {[
            ['Gross earnings', 'Everything earned: basic, allowances, overtime and bonus - before any deduction.'],
            ['Statutory deductions', 'PF, ESI, Professional Tax and LWF - contributions the law requires.'],
            ['TDS', 'Income tax deducted at source, computed from the tax regime and declarations.'],
            ['Net pay', 'What lands in the bank: gross earnings minus all deductions.'],
            ['Employer cost', "The company's true cost: net pay + employer PF/ESI/gratuity."],
            ['Rules, not hard-coding', 'Every rate and slab is versioned data - history always stays correct.'],
          ].map(([term, meaning]) => (
            <div key={term} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary-blue)] mt-1.5 shrink-0" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <span className="font-semibold text-[var(--text-primary)]">{term}</span> — {meaning}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
