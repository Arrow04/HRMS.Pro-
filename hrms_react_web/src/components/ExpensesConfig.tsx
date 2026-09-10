import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Loader2, X, Wallet, Receipt,
  CheckCircle2, ChevronDown, ChevronUp, FileText, Save,
  Settings, ShieldCheck, CreditCard, Bell, Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface ExpensesConfigProps {
  open: boolean;
  onClose: () => void;
}

interface ApiErrorLike { response?: { data?: { detail?: string } } }
function errMsg(err: unknown, fallback: string) {
  return (err as ApiErrorLike | null)?.response?.data?.detail || fallback;
}

const inputCls = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]";
const inputClsDisabled = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-gray-50 text-[var(--text-tertiary)] cursor-not-allowed";

// ── Small field components (same pattern as PayrollConfiguration) ──

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">{label}</label>
      {children}
      {help && <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return <input className={disabled ? inputClsDisabled : inputCls} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />;
}

function NumInput({ value, onChange, placeholder, disabled }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; disabled?: boolean }) {
  return <input type="number" step="any" className={disabled ? inputClsDisabled : inputCls} value={value ?? ''} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)} />;
}

function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange(!checked)}
        title={help}
        className={`relative w-12 h-7 rounded-full transition-all duration-300 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 focus-visible:ring-offset-2 cursor-pointer group ${
          checked
            ? 'bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] shadow-[0_2px_8px_-1px_rgba(124,58,237,0.5)]'
            : 'bg-gradient-to-r from-[#EF4444] to-[#DC2626] shadow-[0_2px_8px_-1px_rgba(220,38,38,0.5)] hover:brightness-95'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ease-out ${
            checked ? 'translate-x-5 group-active:scale-95' : 'group-active:scale-90'
          }`}
        />
      </button>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--text-secondary)] leading-tight">{label}</span>
        {help && <span className="text-[11px] leading-snug text-[var(--text-tertiary)]">{help}</span>}
      </div>
    </div>
  );
}

function WizardSectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-[var(--background)] hover:bg-[var(--hover-bg)]">
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#7C3AED]" />
          <span className="font-medium text-sm text-[var(--text-primary)]">{title}</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// ── Defaults ──

function defaultExpenseCategories(): ExpenseCategory[] {
  return [
    { id: null, name: 'Travel', code: 'TRV', description: 'Air, rail, cab, and ride-sharing fares', gl_code: '6100', default_currency: 'INR', receipt_required: true, active: true, spending_limit: 50000, monthly_cap: 100000, requires_manager_approval: true, auto_attach_receipt_threshold: 500 },
    { id: null, name: 'Meals', code: 'ML', description: 'Client meals and team dining', gl_code: '6101', default_currency: 'INR', receipt_required: true, active: true, spending_limit: 5000, monthly_cap: 15000, requires_manager_approval: false, auto_attach_receipt_threshold: 1000 },
    { id: null, name: 'Lodging', code: 'LDG', description: 'Hotel and stay expenses', gl_code: '6102', default_currency: 'INR', receipt_required: true, active: true, spending_limit: 10000, monthly_cap: 50000, requires_manager_approval: true, auto_attach_receipt_threshold: 2000 },
    { id: null, name: 'Local Conveyance', code: 'LCV', description: 'Auto, taxi, bus, and metro', gl_code: '6103', default_currency: 'INR', receipt_required: false, active: true, spending_limit: 2000, monthly_cap: 5000, requires_manager_approval: false, auto_attach_receipt_threshold: 500 },
    { id: null, name: 'Communication', code: 'COM', description: 'Phone and internet reimbursements', gl_code: '6104', default_currency: 'INR', receipt_required: false, active: true, spending_limit: 1500, monthly_cap: 1500, requires_manager_approval: false, auto_attach_receipt_threshold: 0 },
    { id: null, name: 'Office Supplies', code: 'OFF', description: 'Stationery, peripherals, and consumables', gl_code: '6105', default_currency: 'INR', receipt_required: true, active: true, spending_limit: 10000, monthly_cap: 20000, requires_manager_approval: true, auto_attach_receipt_threshold: 2000 },
    { id: null, name: 'Training', code: 'TRN', description: 'Courses, workshops, and certifications', gl_code: '6106', default_currency: 'INR', receipt_required: true, active: true, spending_limit: 200000, monthly_cap: 200000, requires_manager_approval: true, auto_attach_receipt_threshold: 5000 },
    { id: null, name: 'Health & Wellness', code: 'HLW', description: 'Medical, gym, and wellness reimbursements', gl_code: '6107', default_currency: 'INR', receipt_required: true, active: true, spending_limit: 15000, monthly_cap: 15000, requires_manager_approval: false, auto_attach_receipt_threshold: 1000 },
    { id: null, name: 'Other', code: 'OTH', description: 'Miscellaneous expenses', gl_code: '6199', default_currency: 'INR', receipt_required: false, active: true, spending_limit: 10000, monthly_cap: 20000, requires_manager_approval: true, auto_attach_receipt_threshold: 2000 },
  ];
}

function defaultApprovalWorkflow(): ApprovalWorkflow {
  return {
    approval_levels: 2,
    level1_approver: 'reporting-manager',
    level2_approver: 'department-head',
    level3_approver: 'finance',
    auto_approve_threshold: 500,
    self_approval_allowed: false,
    finance_notification: true,
    escalation_days: 5,
    rejection_reason_mandatory: true,
  };
}

function defaultSpendingLimits(): SpendingLimits {
  return {
    global_monthly_limit: 0,
    global_quarterly_limit: 0,
    global_annual_limit: 0,
    grade_limits: [],
    department_overrides: [],
    alert_threshold_percentage: 80,
    block_over_limit: false,
  };
}

function defaultReimbursementTax(): ReimbursementTax {
  return {
    reimbursement_method: 'salary-credit',
    reimbursement_frequency: 'per-claim',
    tax_deduction_enabled: false,
    tax_percentage: 0,
    advance_recovery_enabled: false,
    advance_recovery_limit: 0,
    currency_conversion_enabled: false,
    exchange_rate_source: 'manual',
  };
}

function defaultSubmissionRules(): SubmissionRules {
  return {
    submission_deadline_days: 30,
    late_submission_policy: 'allow-with-reason',
    duplicate_detection: true,
    duplicate_detection_tolerance_days: 3,
    receipt_upload_mandatory: false,
    receipt_formats_allowed: ['jpg', 'png', 'pdf'],
    max_receipt_size_mb: 5,
    bulk_upload_enabled: false,
    csv_template_columns: 'date,amount,description,category,receipt',
    auto_categorize: false,
  };
}

function defaultNotifications(): NotificationsSettings {
  return {
    email_on_submission: true,
    email_on_approval: true,
    email_on_rejection: true,
    monthly_digest: true,
    manager_weekly_summary: true,
    export_format: 'csv',
    include_receipts_in_export: false,
    retention_period_months: 36,
  };
}

// ── Types ──

interface ExpenseCategory {
  id: number | null;
  name: string;
  code: string;
  description: string;
  gl_code: string;
  default_currency: string;
  receipt_required: boolean;
  active: boolean;
  spending_limit: number;
  monthly_cap: number;
  requires_manager_approval: boolean;
  auto_attach_receipt_threshold: number;
}

interface ApprovalWorkflow {
  approval_levels: number;
  level1_approver: string;
  level2_approver: string;
  level3_approver: string;
  auto_approve_threshold: number;
  self_approval_allowed: boolean;
  finance_notification: boolean;
  escalation_days: number;
  rejection_reason_mandatory: boolean;
}

interface GradeLimit {
  grade: string;
  monthly_limit: number;
  requires_additional_approval: boolean;
}

interface DepartmentOverride {
  department_id: number | null;
  monthly_limit: number;
}

interface SpendingLimits {
  global_monthly_limit: number;
  global_quarterly_limit: number;
  global_annual_limit: number;
  grade_limits: GradeLimit[];
  department_overrides: DepartmentOverride[];
  alert_threshold_percentage: number;
  block_over_limit: boolean;
}

interface ReimbursementTax {
  reimbursement_method: string;
  reimbursement_frequency: string;
  tax_deduction_enabled: boolean;
  tax_percentage: number;
  advance_recovery_enabled: boolean;
  advance_recovery_limit: number;
  currency_conversion_enabled: boolean;
  exchange_rate_source: string;
}

interface SubmissionRules {
  submission_deadline_days: number;
  late_submission_policy: string;
  duplicate_detection: boolean;
  duplicate_detection_tolerance_days: number;
  receipt_upload_mandatory: boolean;
  receipt_formats_allowed: string[];
  max_receipt_size_mb: number;
  bulk_upload_enabled: boolean;
  csv_template_columns: string;
  auto_categorize: boolean;
}

interface NotificationsSettings {
  email_on_submission: boolean;
  email_on_approval: boolean;
  email_on_rejection: boolean;
  monthly_digest: boolean;
  manager_weekly_summary: boolean;
  export_format: string;
  include_receipts_in_export: boolean;
  retention_period_months: number;
}

interface ExpensesConfigState {
  expense_categories: ExpenseCategory[];
  approval_workflow: ApprovalWorkflow;
  spending_limits: SpendingLimits;
  reimbursement_tax: ReimbursementTax;
  submission_rules: SubmissionRules;
  notifications: NotificationsSettings;
}

function blankState(): ExpensesConfigState {
  return {
    expense_categories: defaultExpenseCategories(),
    approval_workflow: defaultApprovalWorkflow(),
    spending_limits: defaultSpendingLimits(),
    reimbursement_tax: defaultReimbursementTax(),
    submission_rules: defaultSubmissionRules(),
    notifications: defaultNotifications(),
  };
}

// ── Wizard tabs ──

const WIZARD_TABS = [
  { id: 'categories', label: 'Expense Categories', icon: Receipt, color: 'text-purple-600' },
  { id: 'approval', label: 'Approval Workflow', icon: ShieldCheck, color: 'text-emerald-600' },
  { id: 'limits', label: 'Spending Limits', icon: Wallet, color: 'text-blue-600' },
  { id: 'reimbursement', label: 'Reimbursement & Tax', icon: CreditCard, color: 'text-amber-600' },
  { id: 'submission', label: 'Submission Rules', icon: FileText, color: 'text-rose-600' },
  { id: 'notifications', label: 'Notifications & Reports', icon: Bell, color: 'text-indigo-600' },
];

const WIZARD_HELP: Record<string, string> = {
  categories: 'Define expense categories, spending limits, receipt rules, and GL codes for accounting.',
  approval: 'Configure multi-level approval workflow, auto-approve thresholds, and escalation rules.',
  limits: 'Set global and grade-wise spending limits, alerts, and enforcement rules.',
  reimbursement: 'Define how approved expenses are paid out, tax rules, and currency conversion.',
  submission: 'Control submission deadlines, duplicate detection, receipt requirements, and bulk upload.',
  notifications: 'Email notifications, report formats, and record retention policies.',
};

// ── Stat Box ──

function StatBox({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-[#7C3AED]" />
      </div>
      <div>
        <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
        <div className="text-xs text-[var(--text-tertiary)]">{label}</div>
      </div>
    </div>
  );
}

// ── Tab content: Expense Categories ──

function CategoriesTab({
  categories,
  setCategories,
}: {
  categories: ExpenseCategory[];
  setCategories: (c: ExpenseCategory[]) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<ExpenseCategory | null>(null);

  const startAdd = () => {
    const newCat: ExpenseCategory = {
      id: null, name: '', code: '', description: '', gl_code: '',
      default_currency: 'INR', receipt_required: true, active: true,
      spending_limit: 0, monthly_cap: 0, requires_manager_approval: true,
      auto_attach_receipt_threshold: 0,
    };
    setDraft(newCat);
    setEditingIdx(-1);
  };

  const startEdit = (i: number) => {
    setDraft({ ...categories[i] });
    setEditingIdx(i);
  };

  const saveDraft = () => {
    if (!draft || !draft.name.trim()) { toast.error('Category name is required'); return; }
    if (!draft.code.trim()) { toast.error('Category code is required'); return; }
    const next = editingIdx === -1
      ? [...categories, draft]
      : categories.map((c, idx) => (idx === editingIdx ? draft : c));
    setCategories(next);
    setDraft(null);
    setEditingIdx(null);
  };

  const removeCategory = (i: number) => {
    setCategories(categories.filter((_, idx) => idx !== i));
    if (editingIdx === i) { setDraft(null); setEditingIdx(null); }
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-purple-50 border border-purple-200 rounded-lg p-3">
        <b>Predefined categories:</b> Travel, Meals, Lodging, Local Conveyance, Communication, Office Supplies, Training, Health &amp; Wellness, Other. Add or modify categories below. Each category maps to a GL code for accounting integration.
      </div>
      <WizardSectionCard title="Expense Categories" icon={Receipt}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-[var(--text-tertiary)]">{categories.length} categor{categories.length === 1 ? 'y' : 'ies'} configured</p>
          <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 text-[#7C3AED] hover:bg-purple-100">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>

        {editingIdx !== null && draft && (
          <div className="border border-purple-200 rounded-xl p-4 space-y-4 bg-purple-50/30 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Category name" help="Display name for this expense category.">
                <TextInput value={draft.name} onChange={v => setDraft({ ...draft, name: v })} placeholder="e.g. Travel" />
              </Field>
              <Field label="Code" help="Short code for the category (e.g. TRV, ML).">
                <TextInput value={draft.code} onChange={v => setDraft({ ...draft, code: v })} placeholder="e.g. TRV" />
              </Field>
              <Field label="GL Code" help="General ledger code for accounting.">
                <TextInput value={draft.gl_code} onChange={v => setDraft({ ...draft, gl_code: v })} placeholder="e.g. 6100" />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Description" help="Brief description of what this category covers.">
                <TextInput value={draft.description} onChange={v => setDraft({ ...draft, description: v })} placeholder="What is this category for?" />
              </Field>
              <Field label="Default currency" help="ISO 4217 code, e.g. INR or USD.">
                <TextInput value={draft.default_currency} onChange={v => setDraft({ ...draft, default_currency: v })} placeholder="INR" />
              </Field>
              <Field label="Spending limit (per claim)" help="Maximum amount per single expense claim in this category.">
                <NumInput value={draft.spending_limit} onChange={v => setDraft({ ...draft, spending_limit: v ?? 0 })} placeholder="0 = no limit" />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Monthly cap per employee" help="Maximum total monthly claims allowed per employee in this category.">
                <NumInput value={draft.monthly_cap} onChange={v => setDraft({ ...draft, monthly_cap: v ?? 0 })} placeholder="0 = no cap" />
              </Field>
              <Field label="Auto-attach receipt threshold" help="Receipts auto-required above this amount.">
                <NumInput value={draft.auto_attach_receipt_threshold} onChange={v => setDraft({ ...draft, auto_attach_receipt_threshold: v ?? 0 })} placeholder="0 = always require" />
              </Field>
              <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pt-6">
                <Toggle label="Receipt required" checked={draft.receipt_required} onChange={v => setDraft({ ...draft, receipt_required: v })} />
                <Toggle label="Manager approval" help="Whether expenses in this category need manager approval" checked={draft.requires_manager_approval} onChange={v => setDraft({ ...draft, requires_manager_approval: v })} />
                <Toggle label="Active" checked={draft.active} onChange={v => setDraft({ ...draft, active: v })} />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
              <button onClick={() => { setDraft(null); setEditingIdx(null); }} className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={saveDraft} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#7C3AED] text-white hover:bg-purple-700">
                <Save className="w-4 h-4" /> {editingIdx === -1 ? 'Add Category' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-[var(--text-disabled)] text-center py-6">No categories configured — click "Add Category" above.</p>
          )}
          {categories.map((cat, i) => (
            <div key={i} className="border border-[var(--border-color)] rounded-xl p-3 flex items-center justify-between gap-3 hover:bg-[var(--hover-bg)] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-[10px] font-bold text-[#7C3AED] shrink-0">
                  {cat.code || '?'}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{cat.name}</span>
                    {!cat.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">inactive</span>}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] truncate max-w-md">
                    {cat.description || 'No description'} · GL: {cat.gl_code || '—'} · Limit: ₹{cat.spending_limit.toLocaleString()}/claim · Cap: ₹{cat.monthly_cap.toLocaleString()}/mo
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {cat.receipt_required && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Receipt</span>}
                {cat.requires_manager_approval && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Approval</span>}
                <button onClick={() => startEdit(i)} className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"><Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" /></button>
                <button onClick={() => { if (confirm(`Delete category "${cat.name}"?`)) removeCategory(i); }} className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </WizardSectionCard>
    </div>
  );
}

// ── Tab content: Approval Workflow ──

function ApprovalTab({
  workflow,
  setWorkflow,
}: {
  workflow: ApprovalWorkflow;
  setWorkflow: (w: ApprovalWorkflow) => void;
}) {
  const set = (patch: Partial<ApprovalWorkflow>) => setWorkflow({ ...workflow, ...patch });
  const levels = workflow.approval_levels;

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <b>Approval workflow:</b> Configure how many levels of approval are needed before an expense is processed. Each level can route to a different role (manager, department head, finance, or specific employee).
      </div>
      <WizardSectionCard title="Approval Levels" icon={ShieldCheck}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Approval levels" help="Number of approval steps for expense claims.">
            <SearchableSelect value={levels} onChange={v => set({ approval_levels: Number(v) })} placeholder="Select Levels" options={[
              { id: 1, name: 'Single level' },
              { id: 2, name: 'Two levels' },
              { id: 3, name: 'Three levels' },
            ]} showAllOption={false} />
          </Field>
          <Field label="Auto-approve below threshold" help="Expenses below this amount are auto-approved.">
            <NumInput value={workflow.auto_approve_threshold} onChange={v => set({ auto_approve_threshold: v ?? 0 })} placeholder="0 = no auto-approve" />
          </Field>
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Approver Configuration" icon={ShieldCheck}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Level 1 approver" help="First approver for all expense claims.">
              <SearchableSelect value={workflow.level1_approver} onChange={v => set({ level1_approver: String(v) })} placeholder="Select Level 1" options={[
                { id: 'reporting-manager', name: 'Reporting Manager' },
                { id: 'department-head', name: 'Department Head' },
                { id: 'specific-employee', name: 'Specific Employee' },
              ]} showAllOption={false} />
            </Field>
            {levels >= 2 && (
              <Field label="Level 2 approver" help="Second approver if Level 1 approves.">
                <SearchableSelect value={workflow.level2_approver} onChange={v => set({ level2_approver: String(v) })} placeholder="Select Level 2" options={[
                  { id: 'department-head', name: 'Department Head' },
                  { id: 'finance', name: 'Finance' },
                  { id: 'specific-employee', name: 'Specific Employee' },
                ]} showAllOption={false} />
              </Field>
            )}
            {levels >= 3 && (
              <Field label="Level 3 approver" help="Final approver for high-value claims.">
                <SearchableSelect value={workflow.level3_approver} onChange={v => set({ level3_approver: String(v) })} placeholder="Select Level 3" options={[
                  { id: 'finance', name: 'Finance' },
                  { id: 'ceo', name: 'CEO' },
                  { id: 'specific-employee', name: 'Specific Employee' },
                ]} showAllOption={false} />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pt-2">
            <Toggle label="Self-approval allowed" help="Allow employees to approve their own expenses (for owners/executives)" checked={workflow.self_approval_allowed} onChange={v => set({ self_approval_allowed: v })} />
            <Toggle label="Finance notification on submission" help="Send notification to finance when any expense is submitted" checked={workflow.finance_notification} onChange={v => set({ finance_notification: v })} />
            <Toggle label="Rejection reason mandatory" help="Require a reason when rejecting an expense" checked={workflow.rejection_reason_mandatory} onChange={v => set({ rejection_reason_mandatory: v })} />
          </div>
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Escalation" icon={Bell}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Escalation after days" help="Auto-escalate if not actioned within N days.">
            <NumInput value={workflow.escalation_days} onChange={v => set({ escalation_days: v ?? 5 })} placeholder="5" />
          </Field>
        </div>
      </WizardSectionCard>
    </div>
  );
}

// ── Tab content: Spending Limits ──

function SpendingLimitsTab({
  limits,
  setLimits,
  departments,
}: {
  limits: SpendingLimits;
  setLimits: (l: SpendingLimits) => void;
  departments: any[];
}) {
  const set = (patch: Partial<SpendingLimits>) => setLimits({ ...limits, ...patch });
  const [editingGradeIdx, setEditingGradeIdx] = useState<number | null>(null);
  const [gradeDraft, setGradeDraft] = useState<GradeLimit | null>(null);
  const [editingDeptIdx, setEditingDeptIdx] = useState<number | null>(null);
  const [deptDraft, setDeptDraft] = useState<DepartmentOverride | null>(null);

  const startAddGrade = () => {
    setGradeDraft({ grade: '', monthly_limit: 0, requires_additional_approval: false });
    setEditingGradeIdx(-1);
  };
  const startEditGrade = (i: number) => {
    setGradeDraft({ ...limits.grade_limits[i] });
    setEditingGradeIdx(i);
  };
  const saveGrade = () => {
    if (!gradeDraft || !gradeDraft.grade.trim()) { toast.error('Grade name is required'); return; }
    const next = editingGradeIdx === -1
      ? [...limits.grade_limits, gradeDraft]
      : limits.grade_limits.map((g, idx) => (idx === editingGradeIdx ? gradeDraft : g));
    set({ grade_limits: next });
    setGradeDraft(null);
    setEditingGradeIdx(null);
  };
  const removeGrade = (i: number) => set({ grade_limits: limits.grade_limits.filter((_, idx) => idx !== i) });

  const startAddDept = () => {
    setDeptDraft({ department_id: null, monthly_limit: 0 });
    setEditingDeptIdx(-1);
  };
  const startEditDept = (i: number) => {
    setDeptDraft({ ...limits.department_overrides[i] });
    setEditingDeptIdx(i);
  };
  const saveDept = () => {
    if (!deptDraft || deptDraft.department_id == null) { toast.error('Department is required'); return; }
    const next = editingDeptIdx === -1
      ? [...limits.department_overrides, deptDraft]
      : limits.department_overrides.map((d, idx) => (idx === editingDeptIdx ? deptDraft : d));
    set({ department_overrides: next });
    setDeptDraft(null);
    setEditingDeptIdx(null);
  };
  const removeDept = (i: number) => set({ department_overrides: limits.department_overrides.filter((_, idx) => idx !== i) });

  const deptNameMap = useMemo(() => {
    const m = new Map(departments.map((d: any) => [d.id, d.name]));
    return (id: number | null) => (id == null ? '—' : m.get(id) || '—');
  }, [departments]);

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-blue-50 border border-blue-200 rounded-lg p-3">
        <b>Spending limits:</b> Control how much each employee can claim per month. Set global limits, grade-wise limits, or department-specific overrides. Alerts and block rules prevent overspending.
      </div>

      <WizardSectionCard title="Global Limits" icon={Wallet}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Global monthly limit" help="Maximum total expense claims per employee per month (0 = unlimited).">
            <NumInput value={limits.global_monthly_limit} onChange={v => set({ global_monthly_limit: v ?? 0 })} placeholder="0 = unlimited" />
          </Field>
          <Field label="Global quarterly limit" help="Maximum total claims per employee per quarter.">
            <NumInput value={limits.global_quarterly_limit} onChange={v => set({ global_quarterly_limit: v ?? 0 })} placeholder="0 = unlimited" />
          </Field>
          <Field label="Global annual limit" help="Maximum total claims per employee per year.">
            <NumInput value={limits.global_annual_limit} onChange={v => set({ global_annual_limit: v ?? 0 })} placeholder="0 = unlimited" />
          </Field>
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Grade-wise Limits" icon={Wallet}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-[var(--text-tertiary)]">{limits.grade_limits.length} grade limit{limits.grade_limits.length === 1 ? '' : 's'} configured</p>
          <button onClick={startAddGrade} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
            <Plus className="w-4 h-4" /> Add Grade Limit
          </button>
        </div>
        {editingGradeIdx !== null && gradeDraft && (
          <div className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/30 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Grade / Designation" help="Text — e.g. Manager, Senior Engineer, Director.">
                <TextInput value={gradeDraft.grade} onChange={v => setGradeDraft({ ...gradeDraft, grade: v })} placeholder="e.g. Manager" />
              </Field>
              <Field label="Monthly limit" help="Maximum claim amount per month for this grade.">
                <NumInput value={gradeDraft.monthly_limit} onChange={v => setGradeDraft({ ...gradeDraft, monthly_limit: v ?? 0 })} />
              </Field>
              <div className="pt-6">
                <Toggle label="Additional approval" help="Requires extra approval beyond standard workflow" checked={gradeDraft.requires_additional_approval} onChange={v => setGradeDraft({ ...gradeDraft, requires_additional_approval: v })} />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
              <button onClick={() => { setGradeDraft(null); setEditingGradeIdx(null); }} className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={saveGrade} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#7C3AED] text-white hover:bg-purple-700">
                <Save className="w-4 h-4" /> {editingGradeIdx === -1 ? 'Add Grade' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
        {limits.grade_limits.length === 0 && !gradeDraft && (
          <p className="text-sm text-[var(--text-disabled)] text-center py-4">No grade-wise limits — all employees use the global limit.</p>
        )}
        <div className="space-y-2">
          {limits.grade_limits.map((gl, i) => (
            <div key={i} className="border border-[var(--border-color)] rounded-xl p-3 flex items-center justify-between gap-3 hover:bg-[var(--hover-bg)]">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{gl.grade}</span>
                <span className="text-[11px] text-[var(--text-tertiary)] ml-2">₹{gl.monthly_limit.toLocaleString()}/mo</span>
                {gl.requires_additional_approval && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 ml-2">Extra approval</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEditGrade(i)} className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"><Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" /></button>
                <button onClick={() => removeGrade(i)} className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Department Overrides" icon={Wallet}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-[var(--text-tertiary)]">{limits.department_overrides.length} department override{limits.department_overrides.length === 1 ? '' : 's'}</p>
          <button onClick={startAddDept} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
            <Plus className="w-4 h-4" /> Add Department Override
          </button>
        </div>
        {editingDeptIdx !== null && deptDraft && (
          <div className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/30 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Department" help="Select the department to override.">
                <SearchableSelect value={deptDraft.department_id ?? 'all'} onChange={v => setDeptDraft({ ...deptDraft, department_id: v === 'all' ? null : Number(v) })} placeholder="Select Department" options={departments.map((d: any) => ({ id: d.id, name: d.name }))} showAllOption={false} />
              </Field>
              <Field label="Monthly limit" help="Maximum claim amount per month for this department.">
                <NumInput value={deptDraft.monthly_limit} onChange={v => setDeptDraft({ ...deptDraft, monthly_limit: v ?? 0 })} />
              </Field>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
              <button onClick={() => { setDeptDraft(null); setEditingDeptIdx(null); }} className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
              <button onClick={saveDept} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#7C3AED] text-white hover:bg-purple-700">
                <Save className="w-4 h-4" /> {editingDeptIdx === -1 ? 'Add Override' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {limits.department_overrides.map((d, i) => (
            <div key={i} className="border border-[var(--border-color)] rounded-xl p-3 flex items-center justify-between gap-3 hover:bg-[var(--hover-bg)]">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{deptNameMap(d.department_id)}</span>
                <span className="text-[11px] text-[var(--text-tertiary)] ml-2">₹{d.monthly_limit.toLocaleString()}/mo</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEditDept(i)} className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"><Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" /></button>
                <button onClick={() => removeDept(i)} className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Enforcement" icon={Wallet}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Alert threshold %" help="Send alert when employee reaches this % of monthly limit (1–100).">
            <NumInput value={limits.alert_threshold_percentage} onChange={v => set({ alert_threshold_percentage: v ?? 80 })} placeholder="80" />
          </Field>
          <div className="pt-6">
            <Toggle label="Block over-limit submissions" help="Prevent employees from submitting expenses exceeding their limit" checked={limits.block_over_limit} onChange={v => set({ block_over_limit: v })} />
          </div>
        </div>
      </WizardSectionCard>
    </div>
  );
}

// ── Tab content: Reimbursement & Tax ──

function ReimbursementTab({
  rt,
  setRt,
}: {
  rt: ReimbursementTax;
  setRt: (r: ReimbursementTax) => void;
}) {
  const set = (patch: Partial<ReimbursementTax>) => setRt({ ...rt, ...patch });

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-amber-50 border border-amber-200 rounded-lg p-3">
        <b>Reimbursement &amp; Tax:</b> Configure how approved expenses are paid out, whether they are subject to tax, and how foreign currencies are handled.
      </div>

      <WizardSectionCard title="Reimbursement" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Reimbursement method" help="How approved expenses are paid out.">
            <SearchableSelect value={rt.reimbursement_method} onChange={v => set({ reimbursement_method: String(v) })} placeholder="Select Method" options={[
              { id: 'salary-credit', name: 'Salary Credit' },
              { id: 'bank-transfer', name: 'Bank Transfer' },
              { id: 'petty-cash', name: 'Petty Cash' },
            ]} showAllOption={false} />
          </Field>
          <Field label="Reimbursement frequency" help="When reimbursements are processed.">
            <SearchableSelect value={rt.reimbursement_frequency} onChange={v => set({ reimbursement_frequency: String(v) })} placeholder="Select Frequency" options={[
              { id: 'per-claim', name: 'Per Claim (immediate)' },
              { id: 'monthly-batch', name: 'Monthly Batch' },
              { id: 'bi-weekly', name: 'Bi-weekly' },
            ]} showAllOption={false} />
          </Field>
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Tax on Reimbursements" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Tax deduction on reimbursement" help="Whether reimbursement amount is subject to tax" checked={rt.tax_deduction_enabled} onChange={v => set({ tax_deduction_enabled: v })} />
          </div>
          {rt.tax_deduction_enabled && (
            <Field label="Tax percentage" help="Tax rate applicable on reimbursements.">
              <NumInput value={rt.tax_percentage} onChange={v => set({ tax_percentage: v ?? 0 })} placeholder="e.g. 10" />
            </Field>
          )}
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Advance Recovery" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Advance recovery enabled" help="Allow recovery of salary advances from expense reimbursements" checked={rt.advance_recovery_enabled} onChange={v => set({ advance_recovery_enabled: v })} />
          </div>
          {rt.advance_recovery_enabled && (
            <Field label="Advance recovery limit (%)" help="Maximum % of reimbursement that can be deducted for advance recovery.">
              <NumInput value={rt.advance_recovery_limit} onChange={v => set({ advance_recovery_limit: v ?? 0 })} placeholder="e.g. 50" />
            </Field>
          )}
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Currency Conversion" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Currency conversion enabled" help="Allow expenses in foreign currencies with auto-conversion" checked={rt.currency_conversion_enabled} onChange={v => set({ currency_conversion_enabled: v })} />
          </div>
          {rt.currency_conversion_enabled && (
            <Field label="Exchange rate source" help="How foreign exchange rates are determined.">
              <SearchableSelect value={rt.exchange_rate_source} onChange={v => set({ exchange_rate_source: String(v) })} placeholder="Select Source" options={[
                { id: 'manual', name: 'Manual' },
                { id: 'api-fixed', name: 'API (Fixed Rate)' },
                { id: 'api-live', name: 'API (Live Rate)' },
              ]} showAllOption={false} />
            </Field>
          )}
        </div>
      </WizardSectionCard>
    </div>
  );
}

// ── Tab content: Submission Rules ──

function SubmissionTab({
  rules,
  setRules,
}: {
  rules: SubmissionRules;
  setRules: (r: SubmissionRules) => void;
}) {
  const set = (patch: Partial<SubmissionRules>) => setRules({ ...rules, ...patch });

  const toggleFormat = (fmt: string) => {
    const current = rules.receipt_formats_allowed;
    const next = current.includes(fmt)
      ? current.filter(f => f !== fmt)
      : [...current, fmt];
    set({ receipt_formats_allowed: next });
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-rose-50 border border-rose-200 rounded-lg p-3">
        <b>Submission rules:</b> Control deadlines, duplicate detection, receipt requirements, and bulk upload capabilities for expense submissions.
      </div>

      <WizardSectionCard title="Deadlines & Late Policy" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Submission deadline (days)" help="Employees must submit expenses within N days of the expense date.">
            <NumInput value={rules.submission_deadline_days} onChange={v => set({ submission_deadline_days: v ?? 30 })} placeholder="30" />
          </Field>
          <Field label="Late submission policy" help="How late submissions are handled.">
            <SearchableSelect value={rules.late_submission_policy} onChange={v => set({ late_submission_policy: String(v) })} placeholder="Select Policy" options={[
              { id: 'allow-with-reason', name: 'Allow with Reason' },
              { id: 'block', name: 'Block' },
              { id: 'requires-escalation', name: 'Requires Escalation' },
            ]} showAllOption={false} />
          </Field>
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Duplicate Detection" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Duplicate detection" help="Auto-detect and flag similar expense claims (same amount + date)" checked={rules.duplicate_detection} onChange={v => set({ duplicate_detection: v })} />
          </div>
          {rules.duplicate_detection && (
            <Field label="Tolerance (days)" help="Days window for duplicate checking.">
              <NumInput value={rules.duplicate_detection_tolerance_days} onChange={v => set({ duplicate_detection_tolerance_days: v ?? 3 })} placeholder="3" />
            </Field>
          )}
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Receipt Requirements" icon={FileText}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="pt-0">
              <Toggle label="Receipt upload mandatory" help="Require receipt upload for every expense" checked={rules.receipt_upload_mandatory} onChange={v => set({ receipt_upload_mandatory: v })} />
            </div>
            <Field label="Max receipt size (MB)" help="Maximum file size for receipt uploads.">
              <NumInput value={rules.max_receipt_size_mb} onChange={v => set({ max_receipt_size_mb: v ?? 5 })} placeholder="5" />
            </Field>
          </div>
          <Field label="Accepted receipt formats" help="Accepted receipt file formats.">
            <div className="flex items-center gap-4">
              {['jpg', 'png', 'pdf'].map(fmt => (
                <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={rules.receipt_formats_allowed.includes(fmt)} onChange={() => toggleFormat(fmt)}
                    className="w-4 h-4 rounded border-[var(--border-color)] text-[#7C3AED] focus:ring-[#7C3AED]" />
                  <span className="text-sm text-[var(--text-secondary)] uppercase">{fmt}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Bulk Upload & Auto-categorize" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Bulk upload enabled" help="Allow employees to bulk upload expenses via CSV" checked={rules.bulk_upload_enabled} onChange={v => set({ bulk_upload_enabled: v })} />
          </div>
          <div className="pt-0">
            <Toggle label="Auto-categorize from description" help="Use keyword matching to auto-fill category from expense description" checked={rules.auto_categorize} onChange={v => set({ auto_categorize: v })} />
          </div>
        </div>
        <Field label="CSV template columns" help="Columns available in the CSV upload template (read-only).">
          <TextInput value={rules.csv_template_columns} onChange={() => {}} disabled placeholder="date,amount,description,category,receipt" />
        </Field>
      </WizardSectionCard>
    </div>
  );
}

// ── Tab content: Notifications & Reports ──

function NotificationsTab({
  notifications,
  setNotifications,
}: {
  notifications: NotificationsSettings;
  setNotifications: (n: NotificationsSettings) => void;
}) {
  const set = (patch: Partial<NotificationsSettings>) => setNotifications({ ...notifications, ...patch });

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-indigo-50 border border-indigo-200 rounded-lg p-3">
        <b>Notifications &amp; Reports:</b> Configure email notifications for submission, approval, and rejection events. Set default export format and record retention period.
      </div>

      <WizardSectionCard title="Email Notifications" icon={Bell}>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <Toggle label="Email on submission" help="Notify approver when expense is submitted" checked={notifications.email_on_submission} onChange={v => set({ email_on_submission: v })} />
          <Toggle label="Email on approval" help="Notify employee when expense is approved" checked={notifications.email_on_approval} onChange={v => set({ email_on_approval: v })} />
          <Toggle label="Email on rejection" help="Notify employee when expense is rejected" checked={notifications.email_on_rejection} onChange={v => set({ email_on_rejection: v })} />
          <Toggle label="Monthly expense digest" help="Send monthly summary of expenses to employees" checked={notifications.monthly_digest} onChange={v => set({ monthly_digest: v })} />
          <Toggle label="Manager weekly summary" help="Send weekly pending approvals summary to managers" checked={notifications.manager_weekly_summary} onChange={v => set({ manager_weekly_summary: v })} />
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Export & Reports" icon={Send}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Export format" help="Default format for expense reports.">
            <SearchableSelect value={notifications.export_format} onChange={v => set({ export_format: String(v) })} placeholder="Select Format" options={[
              { id: 'csv', name: 'CSV' },
              { id: 'excel', name: 'Excel' },
              { id: 'pdf', name: 'PDF' },
            ]} showAllOption={false} />
          </Field>
          <div className="pt-0">
            <Toggle label="Include receipts in export" help="Attach receipt copies in export files" checked={notifications.include_receipts_in_export} onChange={v => set({ include_receipts_in_export: v })} />
          </div>
        </div>
      </WizardSectionCard>

      <WizardSectionCard title="Record Retention" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Retention period (months)" help="How long to keep expense records before archival.">
            <NumInput value={notifications.retention_period_months} onChange={v => set({ retention_period_months: v ?? 36 })} placeholder="36" />
          </Field>
        </div>
      </WizardSectionCard>
    </div>
  );
}

// ── Main Component ──

export default function ExpensesConfig({ open, onClose }: ExpensesConfigProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [wizardTab, setWizardTab] = useState('categories');
  const [state, setState] = useState<ExpensesConfigState>(blankState());
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { try { const r = await api.get('/departments'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: existingConfig, isLoading: configLoading } = useQuery({
    queryKey: ['expenses-config'],
    queryFn: async () => {
      try {
        const r = await api.get('/settings/configs/expenses');
        return r.data || null;
      } catch { return null; }
    },
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { id: number | null; data: ExpensesConfigState }) =>
      payload.id
        ? api.put(`/settings/configs/expenses/${payload.id}`, payload.data)
        : api.post('/settings/configs/expenses', payload.data),
    onSuccess: (res: any) => {
      toast.success(res.data?.message || 'Expenses configuration saved');
      queryClient.invalidateQueries({ queryKey: ['expenses-config'] });
      onClose();
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to save configuration')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/configs/expenses/${id}`),
    onSuccess: (res: any) => {
      toast.success(res.data?.message || 'Configuration deleted');
      queryClient.invalidateQueries({ queryKey: ['expenses-config'] });
      setEditingId(null);
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to delete configuration')),
  });

  const setNested = (key: keyof ExpensesConfigState, patch: any) => {
    setState(prev => ({ ...prev, [key]: { ...(prev[key] as any), ...patch } }));
  };

  const setArray = (key: keyof ExpensesConfigState, arr: any) => {
    setState(prev => ({ ...prev, [key]: arr }));
  };

  const handleSave = () => {
    saveMutation.mutate({ id: editingId, data: state });
  };

  const handleDelete = () => {
    if (editingId && confirm('Delete this expenses configuration?')) {
      deleteMutation.mutate(editingId);
    }
  };

  if (!open) return null;

  const progress = Math.min(100, Math.round(
    (WIZARD_TABS.filter(t => {
      if (t.id === 'categories') return state.expense_categories.length > 0;
      if (t.id === 'approval') return state.approval_workflow.approval_levels > 0;
      if (t.id === 'limits') return true;
      if (t.id === 'reimbursement') return true;
      if (t.id === 'submission') return state.submission_rules.submission_deadline_days > 0;
      if (t.id === 'notifications') return true;
      return false;
    }).length / WIZARD_TABS.length) * 100
  ));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}>
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {editingId ? 'Edit Expenses Configuration' : 'Expenses Configuration'}
              </h2>
              <p className="text-xs text-[#64748B]">Configure expense categories, approvals, limits, and rules.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editingId && (
              <button onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
            <button onClick={onClose} title="Close" className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Progress bar */}
        <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #7C3AED88, #7C3AED)' }} />
            </div>
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: '#7C3AED' }}>{progress}% complete</span>
          </div>
          <p className="text-[11px] text-[#B45309] mt-1.5">
            Navigate through sections to configure expense rules. Fields marked with <span className="font-semibold text-[#DC2626]">*</span>
            are mandatory. Click Save to apply changes.
          </p>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 border-r border-[var(--border-color)] bg-[#F8FAFC] overflow-y-auto">
            <div className="py-2 px-3">
              <p className="pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">Sections</p>
              <nav className="space-y-0.5">
                {WIZARD_TABS.map((t) => {
                  const active = t.id === wizardTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWizardTab(t.id)}
                      className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                        active
                          ? 'bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] text-[#7C3AED] shadow-sm'
                          : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                        active ? `${t.color}` : 'bg-white border border-[var(--border-color)]'
                      }`}
                        style={active ? { background: '#7C3AED14', boxShadow: '0 2px 6px #7C3AED22' } : undefined}>
                        <t.icon className={`w-4 h-4 transition-all duration-300 ${active ? t.color : 'text-[#64748B]'}`} />
                      </span>
                      <span className={`flex-1 truncate transition-colors duration-300 ${active ? 'font-semibold text-[#7C3AED]' : 'font-medium'}`}>{t.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div key={wizardTab} className="section-fade-in">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#7C3AED14' }}>
                  {(() => { const t = WIZARD_TABS.find(x => x.id === wizardTab); const Icon = t?.icon || Receipt; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZARD_TABS.find(x => x.id === wizardTab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[wizardTab] || ''}</p>
                </div>
              </div>

              <div className="space-y-4">
                {wizardTab === 'categories' && (
                  <CategoriesTab
                    categories={state.expense_categories}
                    setCategories={(c) => setArray('expense_categories', c)}
                  />
                )}

                {wizardTab === 'approval' && (
                  <ApprovalTab
                    workflow={state.approval_workflow}
                    setWorkflow={(w) => setNested('approval_workflow', w)}
                  />
                )}

                {wizardTab === 'limits' && (
                  <SpendingLimitsTab
                    limits={state.spending_limits}
                    setLimits={(l) => setNested('spending_limits', l)}
                    departments={departments}
                  />
                )}

                {wizardTab === 'reimbursement' && (
                  <ReimbursementTab
                    rt={state.reimbursement_tax}
                    setRt={(r) => setNested('reimbursement_tax', r)}
                  />
                )}

                {wizardTab === 'submission' && (
                  <SubmissionTab
                    rules={state.submission_rules}
                    setRules={(r) => setNested('submission_rules', r)}
                  />
                )}

                {wizardTab === 'notifications' && (
                  <NotificationsTab
                    notifications={state.notifications}
                    setNotifications={(n) => setNested('notifications', n)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--background)]">
          <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {state.expense_categories.length} categories</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {state.approval_workflow.approval_levels}-level approval</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {state.spending_limits.grade_limits.length} grade limits</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {state.spending_limits.department_overrides.length} dept overrides</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
            <button onClick={handleSave} disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-[#7C3AED] text-white hover:bg-purple-700 disabled:opacity-50">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
