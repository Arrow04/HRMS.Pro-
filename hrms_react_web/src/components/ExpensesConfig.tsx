import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, Wallet, Receipt,
  ChevronDown, ChevronUp, FileText,
  ShieldCheck, CreditCard, Bell, Send,
  Building2, CheckCircle2, Edit2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import DatePicker from './DatePicker';
import ToggleSwitch from './ToggleSwitch';
import api from '../services/api';
import { getCurrencySymbol, getAppCurrency } from '../services/currencyService';

interface ApiErrorLike { response?: { data?: { detail?: string } } }
function errMsg(err: unknown, fallback: string) {
  return (err as ApiErrorLike | null)?.response?.data?.detail || fallback;
}

const inputCls = "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1C64F2] bg-white text-[var(--text-primary)]";

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
  return <input className={inputCls} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />;
}

function NumInput({ value, onChange, placeholder, disabled }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; disabled?: boolean }) {
  return <input type="number" step="any" className={inputCls} value={value ?? ''} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value === '' ? null : +e.target.value)} />;
}

function Toggle({ label, checked, onChange, help, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string; disabled?: boolean }) {
  return (
    <Field label={label} help={help}>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} helpText={help} align="left" />
    </Field>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-[var(--background)] hover:bg-[var(--hover-bg)]">
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--primary-blue)]" />
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
  return [];
}

function defaultApprovalWorkflow(): ApprovalWorkflow {
  return {
    approval_levels: 1,
    level1_approver: '',
    level2_approver: '',
    level3_approver: '',
    auto_approve_threshold: null,
    self_approval_allowed: false,
    finance_notification: false,
    escalation_days: null,
    rejection_reason_mandatory: false,
  };
}

function defaultSpendingLimits(): SpendingLimits {
  return {
    global_monthly_limit: null,
    global_quarterly_limit: null,
    global_annual_limit: null,
    grade_limits: [],
    department_overrides: [],
    alert_threshold_percentage: null,
    block_over_limit: false,
  };
}

function defaultReimbursementTax(): ReimbursementTax {
  return {
    reimbursement_method: '',
    reimbursement_frequency: '',
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
    submission_deadline_days: null,
    late_submission_policy: '',
    duplicate_detection: false,
    duplicate_detection_tolerance_days: null,
    receipt_upload_mandatory: false,
    receipt_formats_allowed: [],
    max_receipt_size_mb: null,
    bulk_upload_enabled: false,
    csv_template_columns: '',
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
  auto_approve_threshold: number | null;
  self_approval_allowed: boolean;
  finance_notification: boolean;
  escalation_days: number | null;
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
  global_monthly_limit: number | null;
  global_quarterly_limit: number | null;
  global_annual_limit: number | null;
  grade_limits: GradeLimit[];
  department_overrides: DepartmentOverride[];
  alert_threshold_percentage: number | null;
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
  submission_deadline_days: number | null;
  late_submission_policy: string;
  duplicate_detection: boolean;
  duplicate_detection_tolerance_days: number | null;
  receipt_upload_mandatory: boolean;
  receipt_formats_allowed: string[];
  max_receipt_size_mb: number | null;
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

interface NamedEntity {
  id: number;
  name: string;
}

interface ExpenseConfigPreview extends ExpensesConfigState {
  name?: string;
  description?: string;
}

interface ExpenseConfigRecord extends ExpenseConfigPreview {
  id: number;
  status?: string;
  company_id?: number | null;
  data?: ExpenseConfigPreview;
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

interface WizardState extends ExpensesConfigState {
  name: string;
  companyId: number | null;
  description: string;
  status: string;
  effectiveFrom: string;
}

function blankWizard(): WizardState {
  return {
    ...blankState(),
    name: '',
    companyId: null,
    description: '',
    status: 'active',
    effectiveFrom: '',
  };
}

// ── Wizard tabs ──

const WIZARD_TABS = [
  { id: 'overview', label: 'Overview', icon: Building2, color: 'text-blue-600' },
  { id: 'categories', label: 'Expense Categories', icon: Receipt, color: 'text-purple-600' },
  { id: 'approval', label: 'Approval Workflow', icon: ShieldCheck, color: 'text-emerald-600' },
  { id: 'limits', label: 'Spending Limits', icon: Wallet, color: 'text-blue-600' },
  { id: 'reimbursement', label: 'Reimbursement & Tax', icon: CreditCard, color: 'text-amber-600' },
  { id: 'submission', label: 'Submission Rules', icon: FileText, color: 'text-rose-600' },
  { id: 'notifications', label: 'Notifications & Reports', icon: Bell, color: 'text-indigo-600' },
];

const WIZARD_HELP: Record<string, string> = {
  overview: 'Name, company and effective date for this configuration.',
  categories: 'Define expense categories with limits, receipt rules and GL codes.',
  approval: 'How many approval levels route expense claims before payout.',
  limits: 'Global, grade-wise and department spending caps with alerts.',
  reimbursement: 'Payout method, tax treatment and currency conversion rules.',
  submission: 'Deadlines, duplicate detection, receipt and bulk-upload rules.',
  notifications: 'Email alerts, export defaults and record retention.',
};

// ── Tab content: Expense Categories ──

function CategoriesTab({
  categories,
  setCategories,
  readOnly,
}: {
  categories: ExpenseCategory[];
  setCategories: (c: ExpenseCategory[]) => void;
  readOnly?: boolean;
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
      <div className="text-xs text-[var(--text-tertiary)] bg-blue-50 border border-blue-200 rounded-lg p-3">
        <b>Create your expense categories:</b> Add categories like Travel, Meals, Lodging, etc. Each category can have its own spending limits, receipt requirements, and GL codes for accounting.
      </div>
      <SectionCard title="Expense Categories" icon={Receipt}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-[var(--text-tertiary)]">{categories.length} categor{categories.length === 1 ? 'y' : 'ies'} configured</p>
          {!readOnly && (
            <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
              <Plus className="w-4 h-4" /> Add Category
            </button>
          )}
        </div>

        {editingIdx !== null && draft && (
          <div className="border border-blue-200 rounded-xl p-4 space-y-4 bg-blue-50/30 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Category name" help="Display name for this expense category.">
                <TextInput value={draft.name} onChange={v => setDraft({ ...draft, name: v })} placeholder="e.g. Travel" disabled={readOnly} />
              </Field>
              <Field label="Code" help="Short code for the category (e.g. TRV, ML).">
                <TextInput value={draft.code} onChange={v => setDraft({ ...draft, code: v })} placeholder="e.g. TRV" disabled={readOnly} />
              </Field>
              <Field label="GL Code" help="General ledger code for accounting.">
                <TextInput value={draft.gl_code} onChange={v => setDraft({ ...draft, gl_code: v })} placeholder="e.g. 6100" disabled={readOnly} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Description" help="Brief description of what this category covers.">
                <TextInput value={draft.description} onChange={v => setDraft({ ...draft, description: v })} placeholder="What is this category for?" disabled={readOnly} />
              </Field>
              <Field label="Default currency" help="ISO 4217 code, e.g. INR or USD.">
                <TextInput value={draft.default_currency} onChange={v => setDraft({ ...draft, default_currency: v })} placeholder="INR" disabled={readOnly} />
              </Field>
              <Field label="Spending limit (per claim)" help="Maximum amount per single expense claim in this category.">
                <NumInput value={draft.spending_limit} onChange={v => setDraft({ ...draft, spending_limit: v ?? 0 })} placeholder="0 = no limit" disabled={readOnly} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Monthly cap per employee" help="Maximum total monthly claims allowed per employee in this category.">
                <NumInput value={draft.monthly_cap} onChange={v => setDraft({ ...draft, monthly_cap: v ?? 0 })} placeholder="0 = no cap" disabled={readOnly} />
              </Field>
              <Field label="Auto-attach receipt threshold" help="Receipts auto-required above this amount.">
                <NumInput value={draft.auto_attach_receipt_threshold} onChange={v => setDraft({ ...draft, auto_attach_receipt_threshold: v ?? 0 })} placeholder="0 = always require" disabled={readOnly} />
              </Field>
              <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pt-6">
                <Toggle label="Receipt required" checked={draft.receipt_required} onChange={v => setDraft({ ...draft, receipt_required: v })} disabled={readOnly} />
                <Toggle label="Manager approval" help="Whether expenses in this category need manager approval" checked={draft.requires_manager_approval} onChange={v => setDraft({ ...draft, requires_manager_approval: v })} disabled={readOnly} />
                <Toggle label="Active" checked={draft.active} onChange={v => setDraft({ ...draft, active: v })} disabled={readOnly} />
              </div>
            </div>
            {!readOnly && (
              <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                <button onClick={() => { setDraft(null); setEditingIdx(null); }} className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
                <button onClick={saveDraft} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1C64F2] text-white hover:bg-blue-700">
                  {editingIdx === -1 ? 'Add Category' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-[var(--text-disabled)] text-center py-6">No categories configured — click "Add Category" above.</p>
          )}
          {categories.map((cat, i) => (
            <div key={i} className="border border-[var(--border-color)] rounded-xl p-3 flex items-center justify-between gap-3 hover:bg-[var(--hover-bg)] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[10px] font-bold text-[var(--primary-blue)] shrink-0">
                  {cat.code || '?'}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{cat.name}</span>
                    {!cat.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">inactive</span>}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] truncate max-w-md">
                    {cat.description || 'No description'} · GL: {cat.gl_code || '—'} · Limit: {getCurrencySymbol(getAppCurrency())}{cat.spending_limit.toLocaleString()}/claim · Cap: {getCurrencySymbol(getAppCurrency())}{cat.monthly_cap.toLocaleString()}/mo
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {cat.receipt_required && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Receipt</span>}
                {cat.requires_manager_approval && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">Approval</span>}
                {!readOnly && (
                  <>
                    <button onClick={() => startEdit(i)} className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"><Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" /></button>
                    <button onClick={() => { if (confirm(`Delete category "${cat.name}"?`)) removeCategory(i); }} className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab content: Approval Workflow ──

function ApprovalTab({
  workflow,
  setWorkflow,
  readOnly,
}: {
  workflow: ApprovalWorkflow;
  setWorkflow: (w: ApprovalWorkflow) => void;
  readOnly?: boolean;
}) {
  const set = (patch: Partial<ApprovalWorkflow>) => setWorkflow({ ...workflow, ...patch });
  const levels = workflow.approval_levels;

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-emerald-50 border border-emerald-200 rounded-lg p-3">
        <b>Approval workflow:</b> Configure how many levels of approval are needed before an expense is processed. Each level can route to a different role (manager, department head, finance, or specific employee).
      </div>
      <SectionCard title="Approval Levels" icon={ShieldCheck}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Approval levels" help="Number of approval steps for expense claims.">
            <SearchableSelect value={levels} onChange={v => set({ approval_levels: Number(v) })} placeholder="Select Levels" options={[
              { id: 1, name: 'Single level' },
              { id: 2, name: 'Two levels' },
              { id: 3, name: 'Three levels' },
            ]} showAllOption={false} disabled={readOnly} />
          </Field>
          <Field label="Auto-approve below threshold" help="Expenses below this amount are auto-approved.">
            <NumInput value={workflow.auto_approve_threshold} onChange={v => set({ auto_approve_threshold: v ?? 0 })} placeholder="0 = no auto-approve" disabled={readOnly} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Approver Configuration" icon={ShieldCheck}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Level 1 approver" help="First approver for all expense claims.">
              <SearchableSelect value={workflow.level1_approver} onChange={v => set({ level1_approver: String(v) })} placeholder="Select Level 1" options={[
                { id: 'reporting-manager', name: 'Reporting Manager' },
                { id: 'department-head', name: 'Department Head' },
                { id: 'specific-employee', name: 'Specific Employee' },
              ]} showAllOption={false} disabled={readOnly} />
            </Field>
            {levels >= 2 && (
              <Field label="Level 2 approver" help="Second approver if Level 1 approves.">
                <SearchableSelect value={workflow.level2_approver} onChange={v => set({ level2_approver: String(v) })} placeholder="Select Level 2" options={[
                  { id: 'department-head', name: 'Department Head' },
                  { id: 'finance', name: 'Finance' },
                  { id: 'specific-employee', name: 'Specific Employee' },
                ]} showAllOption={false} disabled={readOnly} />
              </Field>
            )}
            {levels >= 3 && (
              <Field label="Level 3 approver" help="Final approver for high-value claims.">
                <SearchableSelect value={workflow.level3_approver} onChange={v => set({ level3_approver: String(v) })} placeholder="Select Level 3" options={[
                  { id: 'finance', name: 'Finance' },
                  { id: 'ceo', name: 'CEO' },
                  { id: 'specific-employee', name: 'Specific Employee' },
                ]} showAllOption={false} disabled={readOnly} />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pt-2">
            <Toggle label="Self-approval allowed" help="Allow employees to approve their own expenses (for owners/executives)" checked={workflow.self_approval_allowed} onChange={v => set({ self_approval_allowed: v })} disabled={readOnly} />
            <Toggle label="Finance notification on submission" help="Send notification to finance when any expense is submitted" checked={workflow.finance_notification} onChange={v => set({ finance_notification: v })} disabled={readOnly} />
            <Toggle label="Rejection reason mandatory" help="Require a reason when rejecting an expense" checked={workflow.rejection_reason_mandatory} onChange={v => set({ rejection_reason_mandatory: v })} disabled={readOnly} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Escalation" icon={Bell}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Escalation after days" help="Auto-escalate if not actioned within N days.">
            <NumInput value={workflow.escalation_days} onChange={v => set({ escalation_days: v ?? 5 })} placeholder="5" disabled={readOnly} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab content: Spending Limits ──

function SpendingLimitsTab({
  limits,
  setLimits,
  departments,
  readOnly,
}: {
  limits: SpendingLimits;
  setLimits: (l: SpendingLimits) => void;
  departments: NamedEntity[];
  readOnly?: boolean;
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
    const m = new Map(departments.map(d => [d.id, d.name]));
    return (id: number | null) => (id == null ? '—' : m.get(id) || '—');
  }, [departments]);

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-blue-50 border border-blue-200 rounded-lg p-3">
        <b>Spending limits:</b> Control how much each employee can claim per month. Set global limits, grade-wise limits, or department-specific overrides. Alerts and block rules prevent overspending.
      </div>

      <SectionCard title="Global Limits" icon={Wallet}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Global monthly limit" help="Maximum total expense claims per employee per month (0 = unlimited).">
            <NumInput value={limits.global_monthly_limit} onChange={v => set({ global_monthly_limit: v ?? 0 })} placeholder="0 = unlimited" disabled={readOnly} />
          </Field>
          <Field label="Global quarterly limit" help="Maximum total claims per employee per quarter.">
            <NumInput value={limits.global_quarterly_limit} onChange={v => set({ global_quarterly_limit: v ?? 0 })} placeholder="0 = unlimited" disabled={readOnly} />
          </Field>
          <Field label="Global annual limit" help="Maximum total claims per employee per year.">
            <NumInput value={limits.global_annual_limit} onChange={v => set({ global_annual_limit: v ?? 0 })} placeholder="0 = unlimited" disabled={readOnly} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Grade-wise Limits" icon={Wallet}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-[var(--text-tertiary)]">{limits.grade_limits.length} grade limit{limits.grade_limits.length === 1 ? '' : 's'} configured</p>
          {!readOnly && (
            <button onClick={startAddGrade} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
              <Plus className="w-4 h-4" /> Add Grade Limit
            </button>
          )}
        </div>
        {editingGradeIdx !== null && gradeDraft && (
          <div className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/30 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Grade / Designation" help="Text — e.g. Manager, Senior Engineer, Director.">
                <TextInput value={gradeDraft.grade} onChange={v => setGradeDraft({ ...gradeDraft, grade: v })} placeholder="e.g. Manager" disabled={readOnly} />
              </Field>
              <Field label="Monthly limit" help="Maximum claim amount per month for this grade.">
                <NumInput value={gradeDraft.monthly_limit} onChange={v => setGradeDraft({ ...gradeDraft, monthly_limit: v ?? 0 })} disabled={readOnly} />
              </Field>
              <div className="pt-6">
                <Toggle label="Additional approval" help="Requires extra approval beyond standard workflow" checked={gradeDraft.requires_additional_approval} onChange={v => setGradeDraft({ ...gradeDraft, requires_additional_approval: v })} disabled={readOnly} />
              </div>
            </div>
            {!readOnly && (
              <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                <button onClick={() => { setGradeDraft(null); setEditingGradeIdx(null); }} className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
                <button onClick={saveGrade} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1C64F2] text-white hover:bg-blue-700">
                  {editingGradeIdx === -1 ? 'Add Grade' : 'Save Changes'}
                </button>
              </div>
            )}
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
                <span className="text-[11px] text-[var(--text-tertiary)] ml-2">{getCurrencySymbol(getAppCurrency())}{gl.monthly_limit.toLocaleString()}/mo</span>
                {gl.requires_additional_approval && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 ml-2">Extra approval</span>}
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEditGrade(i)} className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"><Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" /></button>
                  <button onClick={() => removeGrade(i)} className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Department Overrides" icon={Wallet}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-[var(--text-tertiary)]">{limits.department_overrides.length} department override{limits.department_overrides.length === 1 ? '' : 's'}</p>
          {!readOnly && (
            <button onClick={startAddDept} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100">
              <Plus className="w-4 h-4" /> Add Department Override
            </button>
          )}
        </div>
        {editingDeptIdx !== null && deptDraft && (
          <div className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/30 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Department" help="Select the department to override.">
                <SearchableSelect value={deptDraft.department_id ?? 'all'} onChange={v => setDeptDraft({ ...deptDraft, department_id: v === 'all' ? null : Number(v) })} placeholder="Select Department" options={departments.map(d => ({ id: d.id, name: d.name }))} showAllOption={false} disabled={readOnly} />
              </Field>
              <Field label="Monthly limit" help="Maximum claim amount per month for this department.">
                <NumInput value={deptDraft.monthly_limit} onChange={v => setDeptDraft({ ...deptDraft, monthly_limit: v ?? 0 })} disabled={readOnly} />
              </Field>
            </div>
            {!readOnly && (
              <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                <button onClick={() => { setDeptDraft(null); setEditingDeptIdx(null); }} className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Cancel</button>
                <button onClick={saveDept} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1C64F2] text-white hover:bg-blue-700">
                  {editingDeptIdx === -1 ? 'Add Override' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          {limits.department_overrides.map((d, i) => (
            <div key={i} className="border border-[var(--border-color)] rounded-xl p-3 flex items-center justify-between gap-3 hover:bg-[var(--hover-bg)]">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{deptNameMap(d.department_id)}</span>
                <span className="text-[11px] text-[var(--text-tertiary)] ml-2">{getCurrencySymbol(getAppCurrency())}{d.monthly_limit.toLocaleString()}/mo</span>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEditDept(i)} className="p-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--hover-bg)]"><Pencil className="w-3.5 h-3.5 text-[var(--text-secondary)]" /></button>
                  <button onClick={() => removeDept(i)} className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Enforcement" icon={Wallet}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Alert threshold %" help="Send alert when employee reaches this % of monthly limit (1–100).">
            <NumInput value={limits.alert_threshold_percentage} onChange={v => set({ alert_threshold_percentage: v ?? 80 })} placeholder="80" disabled={readOnly} />
          </Field>
          <div className="pt-6">
            <Toggle label="Block over-limit submissions" help="Prevent employees from submitting expenses exceeding their limit" checked={limits.block_over_limit} onChange={v => set({ block_over_limit: v })} disabled={readOnly} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab content: Reimbursement & Tax ──

function ReimbursementTab({
  rt,
  setRt,
  readOnly,
}: {
  rt: ReimbursementTax;
  setRt: (r: ReimbursementTax) => void;
  readOnly?: boolean;
}) {
  const set = (patch: Partial<ReimbursementTax>) => setRt({ ...rt, ...patch });

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-amber-50 border border-amber-200 rounded-lg p-3">
        <b>Reimbursement &amp; Tax:</b> Configure how approved expenses are paid out, whether they are subject to tax, and how foreign currencies are handled.
      </div>

      <SectionCard title="Reimbursement" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Reimbursement method" help="How approved expenses are paid out.">
            <SearchableSelect value={rt.reimbursement_method} onChange={v => set({ reimbursement_method: String(v) })} placeholder="Select Method" options={[
              { id: 'salary-credit', name: 'Salary Credit' },
              { id: 'bank-transfer', name: 'Bank Transfer' },
              { id: 'petty-cash', name: 'Petty Cash' },
            ]} showAllOption={false} disabled={readOnly} />
          </Field>
          <Field label="Reimbursement frequency" help="When reimbursements are processed.">
            <SearchableSelect value={rt.reimbursement_frequency} onChange={v => set({ reimbursement_frequency: String(v) })} placeholder="Select Frequency" options={[
              { id: 'per-claim', name: 'Per Claim (immediate)' },
              { id: 'monthly-batch', name: 'Monthly Batch' },
              { id: 'bi-weekly', name: 'Bi-weekly' },
            ]} showAllOption={false} disabled={readOnly} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Tax on Reimbursements" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Tax deduction on reimbursement" help="Whether reimbursement amount is subject to tax" checked={rt.tax_deduction_enabled} onChange={v => set({ tax_deduction_enabled: v })} disabled={readOnly} />
          </div>
          {rt.tax_deduction_enabled && (
            <Field label="Tax percentage" help="Tax rate applicable on reimbursements.">
              <NumInput value={rt.tax_percentage} onChange={v => set({ tax_percentage: v ?? 0 })} placeholder="e.g. 10" disabled={readOnly} />
            </Field>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Advance Recovery" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Advance recovery enabled" help="Allow recovery of salary advances from expense reimbursements" checked={rt.advance_recovery_enabled} onChange={v => set({ advance_recovery_enabled: v })} disabled={readOnly} />
          </div>
          {rt.advance_recovery_enabled && (
            <Field label="Advance recovery limit (%)" help="Maximum % of reimbursement that can be deducted for advance recovery.">
              <NumInput value={rt.advance_recovery_limit} onChange={v => set({ advance_recovery_limit: v ?? 0 })} placeholder="e.g. 50" disabled={readOnly} />
            </Field>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Currency Conversion" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Currency conversion enabled" help="Allow expenses in foreign currencies with auto-conversion" checked={rt.currency_conversion_enabled} onChange={v => set({ currency_conversion_enabled: v })} disabled={readOnly} />
          </div>
          {rt.currency_conversion_enabled && (
            <Field label="Exchange rate source" help="How foreign exchange rates are determined.">
              <SearchableSelect value={rt.exchange_rate_source} onChange={v => set({ exchange_rate_source: String(v) })} placeholder="Select Source" options={[
                { id: 'manual', name: 'Manual' },
                { id: 'api-fixed', name: 'API (Fixed Rate)' },
                { id: 'api-live', name: 'API (Live Rate)' },
              ]} showAllOption={false} disabled={readOnly} />
            </Field>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab content: Submission Rules ──

function SubmissionTab({
  rules,
  setRules,
  readOnly,
}: {
  rules: SubmissionRules;
  setRules: (r: SubmissionRules) => void;
  readOnly?: boolean;
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

      <SectionCard title="Deadlines & Late Policy" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Submission deadline (days)" help="Employees must submit expenses within N days of the expense date.">
            <NumInput value={rules.submission_deadline_days} onChange={v => set({ submission_deadline_days: v ?? 30 })} placeholder="30" disabled={readOnly} />
          </Field>
          <Field label="Late submission policy" help="How late submissions are handled.">
            <SearchableSelect value={rules.late_submission_policy} onChange={v => set({ late_submission_policy: String(v) })} placeholder="Select Policy" options={[
              { id: 'allow-with-reason', name: 'Allow with Reason' },
              { id: 'block', name: 'Block' },
              { id: 'requires-escalation', name: 'Requires Escalation' },
            ]} showAllOption={false} disabled={readOnly} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Duplicate Detection" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Duplicate detection" help="Auto-detect and flag similar expense claims (same amount + date)" checked={rules.duplicate_detection} onChange={v => set({ duplicate_detection: v })} disabled={readOnly} />
          </div>
          {rules.duplicate_detection && (
            <Field label="Tolerance (days)" help="Days window for duplicate checking.">
              <NumInput value={rules.duplicate_detection_tolerance_days} onChange={v => set({ duplicate_detection_tolerance_days: v ?? 3 })} placeholder="3" disabled={readOnly} />
            </Field>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Receipt Requirements" icon={FileText}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="pt-0">
              <Toggle label="Receipt upload mandatory" help="Require receipt upload for every expense" checked={rules.receipt_upload_mandatory} onChange={v => set({ receipt_upload_mandatory: v })} disabled={readOnly} />
            </div>
            <Field label="Max receipt size (MB)" help="Maximum file size for receipt uploads.">
              <NumInput value={rules.max_receipt_size_mb} onChange={v => set({ max_receipt_size_mb: v ?? 5 })} placeholder="5" disabled={readOnly} />
            </Field>
          </div>
          <Field label="Accepted receipt formats" help="Accepted receipt file formats.">
            <div className="flex items-center gap-4">
              {['jpg', 'png', 'pdf'].map(fmt => (
                <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={rules.receipt_formats_allowed.includes(fmt)} onChange={() => toggleFormat(fmt)} disabled={readOnly}
                    className="w-4 h-4 rounded border-[var(--border-color)] text-[#1C64F2] focus:ring-[#1C64F2]" />
                  <span className="text-sm text-[var(--text-secondary)] uppercase">{fmt}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Bulk Upload & Auto-categorize" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="pt-0">
            <Toggle label="Bulk upload enabled" help="Allow employees to bulk upload expenses via CSV" checked={rules.bulk_upload_enabled} onChange={v => set({ bulk_upload_enabled: v })} disabled={readOnly} />
          </div>
          <div className="pt-0">
            <Toggle label="Auto-categorize from description" help="Use keyword matching to auto-fill category from expense description" checked={rules.auto_categorize} onChange={v => set({ auto_categorize: v })} disabled={readOnly} />
          </div>
        </div>
        <Field label="CSV template columns" help="Columns available in the CSV upload template (read-only).">
          <TextInput value={rules.csv_template_columns} onChange={() => {}} disabled placeholder="date,amount,description,category,receipt" />
        </Field>
      </SectionCard>
    </div>
  );
}

// ── Tab content: Notifications & Reports ──

function NotificationsTab({
  notifications,
  setNotifications,
  readOnly,
}: {
  notifications: NotificationsSettings;
  setNotifications: (n: NotificationsSettings) => void;
  readOnly?: boolean;
}) {
  const set = (patch: Partial<NotificationsSettings>) => setNotifications({ ...notifications, ...patch });

  return (
    <div className="space-y-4">
      <div className="text-xs text-[var(--text-tertiary)] bg-indigo-50 border border-indigo-200 rounded-lg p-3">
        <b>Notifications &amp; Reports:</b> Configure email notifications for submission, approval, and rejection events. Set default export format and record retention period.
      </div>

      <SectionCard title="Email Notifications" icon={Bell}>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <Toggle label="Email on submission" help="Notify approver when expense is submitted" checked={notifications.email_on_submission} onChange={v => set({ email_on_submission: v })} disabled={readOnly} />
          <Toggle label="Email on approval" help="Notify employee when expense is approved" checked={notifications.email_on_approval} onChange={v => set({ email_on_approval: v })} disabled={readOnly} />
          <Toggle label="Email on rejection" help="Notify employee when expense is rejected" checked={notifications.email_on_rejection} onChange={v => set({ email_on_rejection: v })} disabled={readOnly} />
          <Toggle label="Monthly expense digest" help="Send monthly summary of expenses to employees" checked={notifications.monthly_digest} onChange={v => set({ monthly_digest: v })} disabled={readOnly} />
          <Toggle label="Manager weekly summary" help="Send weekly pending approvals summary to managers" checked={notifications.manager_weekly_summary} onChange={v => set({ manager_weekly_summary: v })} disabled={readOnly} />
        </div>
      </SectionCard>

      <SectionCard title="Export & Reports" icon={Send}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Export format" help="Default format for expense reports.">
            <SearchableSelect value={notifications.export_format} onChange={v => set({ export_format: String(v) })} placeholder="Select Format" options={[
              { id: 'csv', name: 'CSV' },
              { id: 'excel', name: 'Excel' },
              { id: 'pdf', name: 'PDF' },
            ]} showAllOption={false} disabled={readOnly} />
          </Field>
          <div className="pt-0">
            <Toggle label="Include receipts in export" help="Attach receipt copies in export files" checked={notifications.include_receipts_in_export} onChange={v => set({ include_receipts_in_export: v })} disabled={readOnly} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Record Retention" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Retention period (months)" help="How long to keep expense records before archival.">
            <NumInput value={notifications.retention_period_months} onChange={v => set({ retention_period_months: v ?? 36 })} placeholder="36" disabled={readOnly} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Main Component ──

export default function ExpensesConfig() {
  const queryClient = useQueryClient();

  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [wizTab, setWizTab] = useState('overview');

  const { data: companies = [] } = useQuery<NamedEntity[]>({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get<NamedEntity[]>('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: departments = [] } = useQuery<NamedEntity[]>({
    queryKey: ['departments'],
    queryFn: async () => { try { const r = await api.get<NamedEntity[]>('/departments'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: configsList = [], isLoading: configLoading } = useQuery<ExpenseConfigRecord[]>({
    queryKey: ['expenses-configs', companyFilter],
    queryFn: async () => {
      try {
        const params = companyFilter === 'all' ? {} : { companyId: Number(companyFilter) };
        const r = await api.get<ExpenseConfigRecord | ExpenseConfigRecord[]>('/settings/configs/expenses', { params });
        return Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []);
      } catch { return []; }
    },
  });

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name] as const));
    return (id: number | null | undefined) => (id == null ? 'All Companies' : m.get(id) || '—');
  }, [companies]);

  const saveMutation = useMutation({
    mutationFn: (w: { id: number | null; state: WizardState }) => {
      const payload = {
        name: w.state.name.trim(),
        description: w.state.description.trim(),
        status: w.state.status,
        effective_from: w.state.effectiveFrom || null,
        expense_categories: w.state.expense_categories,
        approval_workflow: w.state.approval_workflow,
        spending_limits: w.state.spending_limits,
        reimbursement_tax: w.state.reimbursement_tax,
        submission_rules: w.state.submission_rules,
        notifications: w.state.notifications,
      };
      return w.id
        ? api.put(`/settings/configs/expenses/${w.id}`, payload, { params: w.state.companyId ? { companyId: w.state.companyId } : {} })
        : api.post('/settings/configs/expenses', payload, { params: w.state.companyId ? { companyId: w.state.companyId } : {} });
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Expenses configuration saved');
      queryClient.invalidateQueries({ queryKey: ['expenses-configs'] });
      setWizard(null); setEditingId(null); setWizTab('overview');
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to save configuration')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/configs/expenses/${id}`),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Configuration deleted');
      queryClient.invalidateQueries({ queryKey: ['expenses-configs'] });
    },
    onError: (err) => toast.error(errMsg(err, 'Failed to delete configuration')),
  });

  const fromRecord = (cfg: ExpenseConfigRecord): WizardState => {
    const d = (cfg.data || cfg) as ExpenseConfigPreview;
    return {
      name: d.name || cfg.name || '',
      companyId: cfg.company_id ?? null,
      description: d.description || cfg.description || '',
      status: cfg.status || 'active',
      effectiveFrom: '',
      expense_categories: d.expense_categories || [],
      approval_workflow: d.approval_workflow || defaultApprovalWorkflow(),
      spending_limits: d.spending_limits || defaultSpendingLimits(),
      reimbursement_tax: d.reimbursement_tax || defaultReimbursementTax(),
      submission_rules: d.submission_rules || defaultSubmissionRules(),
      notifications: d.notifications || defaultNotifications(),
    };
  };

  const openCreate = () => {
    setEditingId(null); setReadOnly(false); setWizTab('overview');
    const w = blankWizard();
    w.companyId = companyFilter === 'all' ? null : Number(companyFilter);
    setWizard(w);
  };
  const openEdit = (cfg: ExpenseConfigRecord) => { setEditingId(cfg.id); setReadOnly(false); setWizTab('overview'); setWizard(fromRecord(cfg)); };
  const openView = (cfg: ExpenseConfigRecord) => { openEdit(cfg); setReadOnly(true); };

  const submit = () => {
    if (!wizard) return;
    if (!wizard.name.trim()) { toast.error('Configuration name is required'); return; }
    if (!wizard.companyId) { toast.error('Pick the company this configuration belongs to'); return; }
    saveMutation.mutate({ id: editingId, state: wizard });
  };

  if (!wizard) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-[var(--primary-blue)]" />
              </span>
              Configure Expenses
            </h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Company-wise expense configurations. Each configuration sets categories, approval workflows,
              spending limits, reimbursement rules and submission policies.
            </p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Create Configuration
          </button>
        </div>

        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Configurations', value: configsList.length, icon: FileText },
            { label: 'Companies covered', value: new Set(configsList.map((c) => c.company_id)).size, icon: Building2 },
            { label: 'Active', value: configsList.filter((c) => (c.status || 'active') === 'active').length, icon: CheckCircle2 },
            { label: 'Expense categories', value: configsList.reduce((n, c) => n + ((c.data || c).expense_categories || []).length, 0), icon: Receipt },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-color)] p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-amber-600" />
              </div>
              <div><div className="text-lg font-bold text-[var(--text-primary)]">{s.value}</div>
              <div className="text-xs text-[var(--text-tertiary)]">{s.label}</div></div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="w-64">
            <SearchableSelect value={companyFilter} onChange={(v) => setCompanyFilter(String(v))}
              options={[{ id: 'all', name: 'All Companies' }, ...companies.map((c) => ({ id: c.id, name: c.name }))]}
              placeholder="Filter by company" />
          </div>
        </div>

        {configLoading ? null : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {configsList.map((cfg) => {
              const d = cfg.data || cfg;
              return (
                <div key={cfg.id} className="bg-white rounded-2xl border border-[var(--border-color)] p-5 hover:shadow-md transition-shadow flex flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Wallet className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--text-primary)]">{d.name || cfg.name || 'Unnamed Config'}</h3>
                        <p className="text-xs text-[var(--text-tertiary)]">{companyName(cfg.company_id)}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${(cfg.status || 'active') === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {cfg.status || 'active'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-3">{d.description || cfg.description || 'No description'}</p>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)] mb-4">
                    <span>{(d.expense_categories || []).length} categories</span>
                    <span>{(d.approval_workflow?.approval_levels || 1)}-level approval</span>
                    {(d.spending_limits?.global_monthly_limit ?? 0) > 0 && <span>Monthly limit: {d.spending_limits.global_monthly_limit}</span>}
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <button onClick={() => openView(cfg)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                      <FileText className="w-3.5 h-3.5" /> View
                    </button>
                    <button onClick={() => openEdit(cfg)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] hover:bg-gray-50">
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => { if (confirm(`Delete configuration "${d.name || cfg.name || 'this config'}"?`)) deleteMutation.mutate(cfg.id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {configsList.length === 0 && !configLoading && (
          <div className="text-center py-12 text-[var(--text-tertiary)]">No expense configurations yet — create the first one for a company.</div>
        )}
      </div>
    );
  }

  return (
    <ExpensesWizardModal
      wizard={wizard} setWizard={setWizard} wizTab={wizTab} setWizTab={setWizTab}
      companies={companies} departments={departments} editingId={editingId} readOnly={readOnly}
      saving={saveMutation.isPending} onSubmit={submit}
      onClose={() => { setWizard(null); setEditingId(null); setWizTab('overview'); }}
    />
  );
}

function ExpensesWizardModal(props: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState | null>>;
  wizTab: string;
  setWizTab: (t: string) => void;
  companies: NamedEntity[];
  departments: NamedEntity[];
  editingId: number | null;
  readOnly: boolean;
  saving: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { wizard, setWizard, wizTab, setWizTab, companies, departments, editingId, readOnly, saving, onSubmit, onClose } = props;
  const accent = '#1C64F2';

  const setNested = <K extends keyof ExpensesConfigState>(key: K, patch: Partial<ExpensesConfigState[K]>) => {
    setWizard(prev => (prev ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  };
  const setArray = <K extends keyof ExpensesConfigState>(key: K, arr: ExpensesConfigState[K]) => {
    setWizard(prev => (prev ? { ...prev, [key]: arr } : prev));
  };

  const done = [
    !!(wizard.name.trim() && wizard.companyId != null),
    wizard.expense_categories.length > 0,
    true,
    true,
    true,
    true,
    true,
  ].filter(Boolean).length;
  const progress = Math.min(100, Math.round((done / WIZARD_TABS.length) * 100));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                {readOnly ? 'Expenses Configuration' : editingId ? 'Edit Expenses Configuration' : 'Create Expenses Configuration'}
              </h2>
              <p className="text-xs text-[#64748B]">Configure everything once, reuse everywhere.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] hover:bg-[var(--hover-bg)]">Close</button>
            {!readOnly && (
              <button onClick={onSubmit} disabled={saving || !wizard.name.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--primary-blue)] text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Configuration'}
              </button>
            )}
          </div>
        </header>

        {/* Progress bar */}
        <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }} />
            </div>
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: accent }}>{progress}% complete</span>
          </div>
          <p className="text-[11px] text-[#B45309] mt-1.5">
            Navigate through sections to fill in configuration details. Fields marked with <span className="font-semibold text-[#DC2626]">*</span>
            are mandatory. Click Save in the header to {editingId ? 'update' : 'create'} the configuration.
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
                  const active = t.id === wizTab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWizTab(t.id)}
                      className={`w-full flex items-center gap-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-out group ${
                        active
                          ? 'bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFC] text-[#1C64F2] shadow-sm'
                          : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 ease-out ${
                        active ? `${t.color}` : 'bg-white border border-[var(--border-color)]'
                      }`}
                        style={active ? { background: `${accent}14`, boxShadow: `0 2px 6px ${accent}22` } : undefined}>
                        <t.icon className={`w-4 h-4 transition-all duration-300 ${active ? t.color : 'text-[#64748B]'}`} />
                      </span>
                      <span className={`flex-1 truncate transition-colors duration-300 ${active ? 'font-semibold text-[#1C64F2]' : 'font-medium'}`}>{t.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div key={wizTab} className="section-fade-in">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}14` }}>
                  {(() => { const t = WIZARD_TABS.find(x => x.id === wizTab); const Icon = t?.icon || Building2; return <Icon className={`w-5 h-5 ${t?.color || ''}`} />; })()}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#0F172A] leading-tight">{WIZARD_TABS.find(x => x.id === wizTab)?.label || ''}</h3>
                  <p className="text-xs text-[#64748B]">{WIZARD_HELP[wizTab] || ''}</p>
                </div>
              </div>
              <div className="space-y-4">
                {wizTab === 'overview' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <Field label="Configuration Name *" help="A friendly name so you can identify this configuration (e.g. Standard Policy — Acme).">
                      <input className={inputCls} disabled={readOnly} value={wizard.name} placeholder="Standard Expenses Policy" onChange={(e) => setWizard({ ...wizard, name: e.target.value })} />
                    </Field>
                    <Field label="Company *" help="Only this company's expense settings are affected by this configuration.">
                      <SearchableSelect value={wizard.companyId ?? ''} onChange={(v) => setWizard({ ...wizard, companyId: v === '' ? null : Number(v) })}
                        options={companies.map((c) => ({ id: c.id, name: c.name }))} placeholder="Select company" disabled={readOnly} />
                    </Field>
                    <Field label="Effective From" help="Rules apply from this date. Expense claims before this date keep the old rules.">
                      <DatePicker value={wizard.effectiveFrom} onChange={(val) => setWizard({ ...wizard, effectiveFrom: val })} />
                    </Field>
                    <Field label="Description" help="Who this configuration is for (sites, staff categories, cost centres).">
                      <input className={inputCls} disabled={readOnly} value={wizard.description} placeholder="All full-time employees" onChange={(e) => setWizard({ ...wizard, description: e.target.value })} />
                    </Field>
                    <Field label="Status" help="Inactive configurations stay visible for history but aren't applied to new expense claims.">
                      <ToggleSwitch checked={wizard.status === 'active'} onChange={(v) => setWizard({ ...wizard, status: v ? 'active' : 'inactive' })} disabled={readOnly} align="left" />
                    </Field>
                  </div>
                )}
                {wizTab === 'categories' && (
                  <CategoriesTab categories={wizard.expense_categories} setCategories={(c) => setArray('expense_categories', c)} readOnly={readOnly} />
                )}
                {wizTab === 'approval' && (
                  <ApprovalTab workflow={wizard.approval_workflow} setWorkflow={(w) => setNested('approval_workflow', w)} readOnly={readOnly} />
                )}
                {wizTab === 'limits' && (
                  <SpendingLimitsTab limits={wizard.spending_limits} setLimits={(l) => setNested('spending_limits', l)} departments={departments} readOnly={readOnly} />
                )}
                {wizTab === 'reimbursement' && (
                  <ReimbursementTab rt={wizard.reimbursement_tax} setRt={(r) => setNested('reimbursement_tax', r)} readOnly={readOnly} />
                )}
                {wizTab === 'submission' && (
                  <SubmissionTab rules={wizard.submission_rules} setRules={(r) => setNested('submission_rules', r)} readOnly={readOnly} />
                )}
                {wizTab === 'notifications' && (
                  <NotificationsTab notifications={wizard.notifications} setNotifications={(n) => setNested('notifications', n)} readOnly={readOnly} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}