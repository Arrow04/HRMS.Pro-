import { useState } from 'react';
import {
  Play, ClipboardCheck, Wallet, FileDown, HelpCircle, ArrowRight,
  ChevronDown, BookOpen, GraduationCap, Receipt, Landmark, Calculator,
  ShieldCheck, MessageCircle, CalendarDays, ListChecks, FolderCheck,
} from 'lucide-react';

/**
 * PayrollJourney - the Learning Hub.
 *
 * A complete, self-contained course that teaches any HR professional how
 * payroll works END TO END - the process, the law (India), the calendar,
 * the controls and the answers employees expect. Written as general
 * payroll knowledge: the app is only mentioned once, at the very end.
 */

// ────────────────────────────────────────────────────────────────────────────
// Building blocks
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
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
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
    <div className="rounded-xl border border-[var(--border-color)] overflow-x-auto">
      <table className="w-full text-xs min-w-[560px]">
        <thead>
          <tr className="bg-[var(--background)] text-[var(--text-tertiary)]">
            {head.map(h => (
              <th key={h} className="px-3 py-2 text-left font-medium whitespace-normal break-words">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border-color)] last:border-0 align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 text-[var(--text-secondary)] whitespace-normal break-words ${j === 0 ? 'font-medium text-[var(--text-primary)]' : ''}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Learning Hub
// ────────────────────────────────────────────────────────────────────────────

const JOURNEY_STEPS = [
  {
    id: 'setup', title: '1. Configure',
    what: 'Payroll policy, salary components, tax regime and statutory settings are defined once for the organization.',
    icon: Settings, tab: 'config',
  },
  {
    id: 'run', title: '2. Process',
    what: 'Attendance, leave, overtime, bonuses and revisions flow in; the engine computes every salary.',
    icon: Play, tab: 'run',
  },
  {
    id: 'review', title: '3. Review & approve',
    what: 'HR and finance verify the numbers; approvals lock the payroll so nothing changes silently.',
    icon: ClipboardCheck, tab: 'review',
  },
  {
    id: 'pay', title: '4. Disburse',
    what: 'Bank payment files go out; payments are tracked and reconciled.',
    icon: Wallet, tab: 'compliance',
  },
  {
    id: 'file', title: '5. File & report',
    what: 'PF/ESI/PT returns are filed, TDS deposited, payslips issued, records archived.',
    icon: FileDown, tab: 'compliance',
  },
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
      {/* Hero */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-gradient-to-r from-[#1C64F2]/10 via-[#4F46E5]/5 to-transparent p-6">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-5 h-5 text-[var(--primary-blue)]" />
          <h2 className="text-base font-bold text-[var(--text-primary)]">Payroll Learning Hub</h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          Everything about payroll - end to end. How the process works, how salaries are built,
          what Indian law requires, when things are due, how corrections happen, and how to answer
          any employee's question. Learn it once here; use it every month.
        </p>
      </div>

      {/* 1. What is payroll */}
      <Section icon={BookOpen} title="1. What payroll really is" subtitle="One monthly process, five stages, zero surprises" defaultOpen>
        <P>
          Payroll is the monthly business process that turns <b>attendance and contracts into money,
          taxes and statutory filings</b>. It is not just "salary calculation" - it is a controlled
          pipeline with legal obligations at every stage.
        </P>
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
                <div className="grid grid-cols-[2rem_1fr_1.25rem] items-center gap-2 mb-2 h-10">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isActive ? 'bg-[var(--primary-blue)] text-white' : 'bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {/* Uniform centered row: every card's title sits on the same line */}
                  <div className="text-xs font-semibold text-[var(--text-primary)] leading-5 flex items-center h-full">
                    {step.title}
                  </div>
                  {idx < JOURNEY_STEPS.length - 1 ? (
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] hidden md:block mx-auto" />
                  ) : (
                    <div className="hidden md:block" />
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{step.what}</p>
              </button>
            );
          })}
        </div>
        <P>
          <b>The golden rule of payroll:</b> once a month is processed and paid, its numbers are
          <b> immutable</b>. Mistakes are fixed through <i>adjustments in later months</i>, never by
          editing history. That is what keeps payslips, audits and filings trustworthy.
        </P>
      </Section>

      {/* 2. The payroll calendar */}
      <Section icon={CalendarDays} title="2. The payroll calendar & compliance due dates" subtitle="What is due, when - the dates every payroll HR must know">
        <P>
          A typical month runs on a cycle: <b>cut-off → process → approve → pay → file</b>. Missing a
          statutory due date attracts interest and damages, so this calendar is the backbone of the job.
        </P>
        <MiniTable
          head={['Obligation', 'Due date', 'Notes']}
          rows={[
            ['Salary payment', 'As per policy (usually last working day)', 'Contractual; delayed salary can attract claims under the Payment of Wages Act'],
            ['PF / EPS / EDLI remittance', '15th of the following month', 'Wages for the month; electronic challan (ECR) filed on the EPFO portal'],
            ['ESI contribution', '15th of the following month', 'Half-yearly return follows the contribution periods'],
            ['TDS deposit', '7th of the following month', 'Tax deducted from salaries must reach the government'],
            ['Professional Tax', 'Per state (often monthly, ~20th-22nd)', 'e.g. Karnataka & Maharashtra monthly; some states half-yearly'],
            ['Quarterly TDS return (24Q)', '31 Jul / 31 Oct / 31 Jan / 31 May', 'Quarterly statement of salary TDS'],
            ['Form 16 to employees', '15 June (for the prior FY)', 'Part B from employer; Part A downloaded from TRACES'],
            ['Gratuity payment', 'Within 30 days of it becoming due', 'On exit/retirement for eligible employees (5+ years)'],
          ]}
        />
        <div className="flex items-start gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-4">
          <ListChecks className="w-4 h-4 text-[var(--primary-blue)] mt-0.5 shrink-0" />
          <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
            <b className="text-[var(--text-primary)]">Month-end HR checklist:</b> freeze attendance →
            validate leave & LOP → capture revisions/arrears/loans → run payroll → review variances
            against last month → obtain approvals → release bank file → file PF/ESI/PT → deposit TDS →
            publish payslips → archive the payroll register.
          </div>
        </div>
      </Section>

      {/* 3. Salary structure */}
      <Section icon={Calculator} title="3. How a salary is built" subtitle="CTC → Gross → Deductions → Net, with a worked example">
        <Bullets
          items={[
            <><b>CTC (Cost to Company)</b> - the annual employer spend, including employer PF/ESI and
            gratuity accrual. What the offer letter shows.</>,
            <><b>Gross salary</b> - monthly earnings before deductions (basic + allowances + variable pay).</>,
            <><b>Net pay</b> - what reaches the bank after deductions.</>,
            <><b>Basic + DA</b> - the foundation for PF, gratuity and leave encashment. Commonly 40-50%
            of CTC, but every company configures its own structure.</>,
          ]}
        />
        <MiniTable
          head={['Line', 'What it is', 'Example / month']}
          rows={[
            ['Basic Salary', 'Core pay; PF, gratuity and encashment are calculated on it.', '₹50,000'],
            ['DA', 'Dearness Allowance - cost-of-living pay, common in government/PSU structures.', '₹0'],
            ['HRA', 'House rent allowance; partially tax-exempt when rent is actually paid (50% of basic in metros).', '₹25,000'],
            ['Conveyance / Medical / Special', 'Company-configured allowances, each with its own tax treatment.', '₹2,850'],
            ['Overtime / Bonus / Incentive', 'Variable earnings for the period.', '₹0'],
            ['Gross earnings', 'Total earned before deductions.', '₹77,850'],
            ['(-) EPF', 'Employee provident fund (12% of PF wages).', '-₹1,800'],
            ['(-) Professional Tax', 'State tax on employment.', '-₹200'],
            ['(-) TDS', 'Income tax for the month.', '-₹2,500'],
            ['= Net pay', 'Take-home salary.', '₹73,350'],
          ]}
        />
        <P>
          <b>Pro-ration:</b> joiners and leavers are paid only for days employed. Every earning is
          multiplied by <i>paid days ÷ working days</i>, and statutory contributions follow the
          reduced <i>earned</i> wages.
        </P>
      </Section>

      {/* 4. Attendance & leave */}
      <Section icon={Play} title="4. Attendance and leave drive pay" subtitle="The inputs that decide how much anyone earns">
        <Bullets
          items={[
            <><b>Pay factor</b> = paid days ÷ working days. Present, paid leave and holidays count as
            paid; unpaid leave (LOP) does not.</>,
            <><b>Half days</b> typically count as half a paid day; many policies auto-detect a half day
            when worked hours fall below a threshold.</>,
            <><b>LOP (loss of pay)</b> reduces gross for the month - and reduces PF/ESI wages, because
            those are charged on earned wages.</>,
            <><b>Overtime</b> pays hours × rate × multiplier (commonly 1.5× on normal days, 2× on
            holidays/weekly offs - per the Factories Act / state shops & establishments rules).</>,
            <><b>Weekly-off and holiday rules:</b> a holiday falling on a weekly off must never inflate
            paid days - otherwise it hides an absence.</>,
            <><b>Zero attendance, zero pay</b> - the engine never silently pays a month with no
            attendance and no approved leave.</>,
          ]}
        />
      </Section>

      {/* 5. Statutory compliance */}
      <Section icon={Landmark} title="5. Indian statutory compliance (2026 schemes)" subtitle="EPF/EPS/EDLI, ESI, Professional Tax, LWF, Bonus, Gratuity - the real rates">
        <P>
          Under the <b>Code on Social Security, 2020</b>, the EPF, EPS and EDLI Schemes, 2026 govern
          provident fund, pension and insurance. The numbers every payroll HR must know:
        </P>
        <MiniTable
          head={['Scheme', 'Employee pays', 'Employer pays', 'Key rules']}
          rows={[
            ['EPF + EPS + EDLI', '12% of PF wages', '12% (8.33% to pension + 3.67% to PF) + 0.5% EDLI + 0.5% admin charges → in practice ~13% of PF wages', 'PF wage ceiling ₹15,000/month by default; contributions on higher wages are voluntary. EPS higher-pension opt-ins pay 9.49%.'],
            ['ESI', '0.75% of gross', '3.25% of gross', 'Applies only while monthly gross ≤ ₹21,000'],
            ['Professional Tax', 'State slab (e.g. ₹200/month)', '—', 'Deducted monthly; every state has its own slab table and due date'],
            ['LWF', 'Small state contribution', 'Matching contribution', 'State-specific, often half-yearly'],
            ['Statutory Bonus', '—', '8.33% - 20% of bonus wages', 'Payment of Bonus Act: payable when salary ≤ ₹21,000/month; may be spread monthly'],
            ['Gratuity', '—', 'Accrued; paid at exit', '15/26 × last basic+DA × years of service; 5 years of service (over 240 days counts as a year); tax-free up to ₹20 lakh'],
          ]}
        />
        <P>
          <b>Why employer cost is "13%":</b> the headline employer rate is 12% (split 8.33% pension +
          3.67% provident fund), but the employer also pays <b>0.5% EDLI insurance</b> and{' '}
          <b>0.5% EPF administrative charges</b> - so budget ~13% of PF wages. With PF wages capped at
          ₹15,000, that is about ₹1,950 per employee per month at the ceiling.
        </P>
        <P>
          <b>Why caps matter:</b> contributions apply to <i>PF wages</i> (usually basic+DA), not the
          full salary - often capped at ₹15,000. An employee earning ₹50,000 may still have PF of just
          ₹1,800 (12% × ₹15,000). Employees can contribute voluntarily above the ceiling (no employer
          match required unless offered).
        </P>
      </Section>

      {/* 6. TDS */}
      <Section icon={Calculator} title="6. Income tax (TDS) on salary" subtitle="Regimes, declarations, and why TDS changes during the year">
        <Bullets
          items={[
            <><b>Two regimes:</b> the <b>New regime</b> (default; lower slabs, almost no deductions) and
            the <b>Old regime</b> (higher slabs; allows 80C/80D/NPS/HRA exemptions). Employees may opt
            out of the new regime each year.</>,
            <><b>Standard deduction</b> (₹75,000 new regime / ₹50,000 old regime) reduces salary income
            automatically.</>,
            <><b>Declarations & proofs:</b> employees declare investments (80C ₹1.5L, 80D, NPS ₹50k
            extra under 80CCD(1B), home loan interest, HRA rent) at the start of the year; HR verifies
            proofs around Jan-Feb. Unverified declarations can be excluded - which raises TDS in the
            final months.</>,
            <><b>Monthly TDS</b> = projected annual tax minus tax already deducted (YTD), divided by
            remaining months. Bonuses and revisions raise the projection mid-year.</>,
            <><b>Filing:</b> deposit TDS by the 7th of the next month; file Form 24Q quarterly; issue
            Form 16 by 15 June. Employees with zero TDS receive a Salary Certificate instead.</>,
          ]}
        />
      </Section>

      {/* 7. Lifecycle & controls */}
      <Section icon={ShieldCheck} title="7. Payroll lifecycle and internal controls" subtitle="How serious payroll teams keep errors out">
        <P>
          Payroll moves through <b>Draft → Calculated → Validation → Pending Approval → Approved →
          Locked → Processed → Paid</b>. Maker-checker (preparer ≠ approver) is the standard control;
          approvals are logged with who, when and why.
        </P>
        <Bullets
          items={[
            <><b>Validation before approval:</b> missing salary, missing bank details, negative net,
            excessive deductions (e.g. over 60% of gross), duplicate payroll for the same period, and
            minimum-wage shortfalls must be flagged before money moves.</>,
            <><b>Variance review:</b> compare this month with last month per employee; unexpected
            spikes usually mean data errors, not salary changes.</>,
            <><b>Immutability:</b> locked payroll cannot be edited. Corrections use arrears or
            reversal - preserving the audit trail that auditors and courts expect.</>,
            <><b>Minimum wages:</b> payable wages must meet the state/zone/skill minimums under the
            Code on Wages - the system should warn, never silently underpay.</>,
          ]}
        />
      </Section>

      {/* 8. Revisions & arrears */}
      <Section icon={Receipt} title="8. Revisions, arrears and retroactive changes" subtitle="When the past has to be recalculated">
        <Bullets
          items={[
            <><b>Salary revisions</b> (increments, promotions) take effect from a date. Months already
            processed get an <b>arrear</b>: difference between the revised and original pay, paid in a
            later month - with the correct tax and statutory impact.</>,
            <><b>Government notifications with back dates</b> are the classic trap: a rate change
            notified in August but effective from April. The correct process is to identify affected
            months, recompute them under the new rule, compute arrears/recovery, book adjustments and
            keep the original payroll untouched.</>,
            <><b>Recovery</b> is the mirror of arrears - negative adjustments recovered from later
            salaries, always with employee communication.</>,
          ]}
        />
      </Section>

      {/* 9. F&F */}
      <Section icon={FolderCheck} title="9. Full & Final settlement (F&F)" subtitle="Everything owed and deducted when someone exits">
        <Bullets
          items={[
            <><b>Payables:</b> salary until the last working day (pro-rated), leave encashment,
            statutory bonus (pro-rata), gratuity (if eligible), pending reimbursements, notice pay
            (when the employer waives notice).</>,
            <><b>Deductions:</b> notice-period shortfall (when the employee leaves without serving
            notice), outstanding loans/advances, bond/notice recovery, tax on taxable components.</>,
            <><b>Gratuity:</b> 15/26 × last drawn basic+DA × completed years of service, payable
            within 30 days of it becoming due.</>,
            <><b>Timeline best practice:</b> complete F&F within the state-mandated or policy window
            (commonly 7-45 days after the last working day) and issue the full statement.</>,
          ]}
        />
      </Section>

      {/* 10. Answering employees */}
      <Section icon={MessageCircle} title="10. Answering employee salary questions" subtitle="The 10-second answer to 'why is my salary X?'">
        <P>
          The best payroll teams answer every question with <b>evidence, not estimates</b>. For any
          payslip line you should be able to show: the wage base it applied to, the rule (rate/cap/
          slab) that applied, and the exact inputs (paid days, gross, declarations).
        </P>
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-4 text-xs text-[var(--text-secondary)] leading-relaxed">
          <b>Worked answer:</b> "Your PF is ₹1,800 because PF is 12% of <i>PF wages</i> - your basic
          (₹50,000) is capped at the ₹15,000 wage ceiling, and 12% of ₹15,000 = ₹1,800. Your employer
          also pays ~13% on the same wages (pension + insurance + admin charges)."
        </div>
        <P>
          Keep a rule-version history: when a rate changes mid-year, employees' old months must still
          be explainable with the rules that were in force then.
        </P>
      </Section>

      {/* 11. FAQ */}
      <Section icon={HelpCircle} title="11. The HR payroll FAQ" subtitle="The questions you will actually be asked">
        <div className="space-y-3">
          {[
            ['An employee joined on the 16th. What do we pay?',
             'Half a month. Every earning is pro-rated by days employed ÷ working days, and PF/ESI apply to the reduced earned wages.'],
            ['An employee took 3 days LOP. What changes?',
             'Paid days drop by 3, so gross reduces proportionally. PF/ESI reduce too (charged on earned wages); Professional Tax usually stays a flat monthly amount.'],
            ['Someone resigned mid-month with pending leave.',
             'Full & Final settlement covers final salary until the last working day, leave encashment, and gratuity if 5+ years - minus loans and any notice shortfall.'],
            ['The government revised PF rates. Do we change code?',
             'No. A new rule version is published with the effective date. Future months use it automatically; past months keep the old rules and remain explainable.'],
            ['Salary was revised mid-year. What about months already paid?',
             'The revision applies from its effective date. The difference for processed months is paid as arrears in the next cycle, with tax and statutory adjustments.'],
            ['Why did TDS increase this month?',
             'TDS follows projected annual income minus what is already deducted. A bonus, a revision, or exhausted exemptions raises the projection - check the TDS inputs for that month.'],
            ['An employee says their PF is wrong.',
             'Show them the wage base and cap. The usual explanation: PF applies to basic/DA (often capped at ₹15,000), not to gross salary.'],
            ['Can we edit a processed payroll?',
             'No - processed payroll is immutable by design. Corrections run through arrears adjustments or reversal so the audit trail stays intact.'],
            ['What is the employer\'s real PF cost?',
             'About 13% of PF wages: 12% (8.33% pension + 3.67% PF) plus 0.5% EDLI insurance and 0.5% administration charges.'],
          ].map(([q, a]) => (
            <div key={q} className="rounded-xl border border-[var(--border-color)] p-4">
              <div className="text-xs font-semibold text-[var(--text-primary)] mb-1.5">{q}</div>
              <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{a}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 12. Glossary */}
      <Section icon={BookOpen} title="12. Glossary" subtitle="Every payroll term in one place">
        <MiniTable
          head={['Term', 'Meaning']}
          rows={[
            ['CTC', 'Cost to Company - total annual employer spend, including employer PF/ESI/gratuity.'],
            ['Gross salary', 'Total earnings for the month before deductions.'],
            ['Net pay', 'Amount paid to the bank after all deductions.'],
            ['Basic + DA', 'The base on which PF, gratuity and encashment are calculated.'],
            ['HRA', 'House Rent Allowance - partially exempt from tax when rent is actually paid.'],
            ['PF wages', 'The wage base PF applies to (usually basic+DA, often capped at ₹15,000).'],
            ['ESI wages', 'The wage base for ESI (usually gross, while under the ceiling).'],
            ['Bonus wages', 'The wage base for statutory bonus (usually gross, capped at ₹21,000).'],
            ['TDS', 'Tax Deducted at Source - monthly income tax withheld from salary.'],
            ['LOP', 'Loss of Pay - unpaid leave; reduces paid days and pay.'],
            ['Pro-ration', 'Scaling pay for partial months (joiners and leavers).'],
            ['Arrears', 'Pay owed for past months (revision or rule change), paid later.'],
            ['Recovery', 'Negative arrears - amount recovered from a later salary.'],
            ['F&F', 'Full & Final settlement - everything owed/deducted at exit.'],
            ['Form 16', 'Annual TDS certificate (Part B from employer, Part A from TRACES).'],
            ['ECR', 'EPF Electronic Challan cum Return - the monthly EPFO filing.'],
            ['Gratuity', 'Exit benefit after 5+ years: 15/26 × last basic+DA × years.'],
            ['EDLI', 'Deposit-linked insurance for employees (0.5% employer).'],
            ['Employer cost', 'Net pay + employer contributions (PF/ESI/gratuity) - the true cost.'],
          ]}
        />
      </Section>

      {/* 13. In this app */}
      <Section icon={GraduationCap} title="13. Putting it to work in this HRMS" subtitle="Where each part of this knowledge lives in the product">
        <Bullets
          items={[
            <><b>Configuration</b> tab - salary components, tax regime, PF/ESI/PT settings.</>,
            <><b>Run Payroll</b> tab - process the month; pro-ration, overtime and TDS are automatic.</>,
            <><b>Review & Approve</b> tab - validate and lock payroll (maker-checker).</>,
            <><b>Bonuses & Loans</b> tab - variable pay and advances.</>,
            <><b>Compliance & Rules</b> tab - statutory rules and their versions, arrears/retro,
            payment batches and bank files, government filings (EPF ECR, ESI, PT), accounting, and{' '}
            <b>Explain</b> - enter a payroll ID to see the rule, version, formula and inputs behind
            every figure.</>,
          ]}
        />
      </Section>
    </div>
  );
}
