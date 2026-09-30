import { useState, useEffect, useCallback } from 'react';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { normalizePickerEmployee, formatEmployeeLabel } from '../utils/employeePickerUtils';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import {
  Plus, Coins, CheckCircle2, XCircle, RotateCcw, Clock, X,
  BookOpen, ClipboardCheck,
  Download, Upload, Users, Calendar, Wallet, FileText, Info, Loader2, Award, Play, Settings, Sparkles,
  Edit3, Edit2, Trash2, HandCoins, Mail, Send, Landmark, Lock, Unlock, Ban, Scale, GraduationCap
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';
import { runAutomation } from '../services/aiAutomation';
import { getCurrencySymbol, formatCurrency, getAppCurrency } from '../services/currencyService';
import DateRangePicker from '../components/DateRangePicker';
import DatePicker from '../components/DatePicker';
import SearchableSelect from '../components/SearchableSelect';
import EmployeeScopedCascade from '../components/EmployeeScopedCascade';
import EmployeeSelectWithFilters from '../components/EmployeeSelectWithFilters';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import IfscInput from '../components/IfscInput';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { getStatusBadgeClass, capitalizeStatus } from '../utils/statusUtils';
import PayrollConfiguration from '../components/PayrollConfiguration';
import PayrollConsole from './PayrollConsole';
import PayrollJourney from '../components/PayrollJourney';
import ConfirmActionModal from '../components/ConfirmActionModal';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import FormGrid, { formGridClass } from '../components/FormGrid';
import FormField, { formInputClass, formReadonlyClass } from '../components/FormField';
import type { EmployeePickerItem } from '../services/employeeListService';
import type { Payroll } from '../types';
import { formatAppDateTime } from '../services/appSettingsService';

const monthName = (m?: number) => (m ? new Date(2000, (m - 1) % 12, 1).toLocaleString('en-US', { month: 'long' }) : '');
const monthLabel = (m?: number, y?: number) => (m && y ? `${monthName(m)} ${y}` : `${m ?? ''} ${y ?? ''}`);

const GROSS_COMPONENTS: [string, string][] = [
  ['basicSalary', 'Basic'],
  ['hra', 'HRA'],
  ['da', 'DA'],
  ['conveyance', 'Conveyance'],
  ['medical', 'Medical'],
  ['specialAllowance', 'Special Allowance'],
  ['overtimePay', 'Overtime'],
  ['bonus', 'Bonus'],
  ['commission', 'Commission'],
  ['incentive', 'Incentive'],
  ['otherEarnings', 'Other Earnings'],
];

const DEDUCTION_COMPONENTS: [string, string][] = [
  ['pfDeduction', 'PF'],
  ['esiDeduction', 'ESI'],
  ['professionalTax', 'Prof. Tax'],
  ['lwfDeduction', 'LWF'],
  ['tdsDeduction', 'TDS'],
  ['loanDeduction', 'Loan'],
  ['advanceDeduction', 'Advance'],
  ['otherDeductions', 'Other Ded.'],
];

const RUN_STATUSES = ['draft', 'drafted', 'pending_approval', 'revised', 'approved', 'submitted'];
const SUBMITTED_STATUSES = ['submitted', 'processed', 'disbursed', 'paid', 'cancelled', 'locked'];

const SNAKE_FIELDS: Record<string, string> = {
  basicSalary: 'basic_salary',
  hra: 'hra',
  da: 'da',
  conveyance: 'conveyance',
  medical: 'medical',
  specialAllowance: 'special_allowance',
  grossSalary: 'gross_salary',
  overtimePay: 'overtime_pay',
  bonus: 'bonus',
  commission: 'commission',
  incentive: 'incentive',
  otherEarnings: 'other_earnings',
  totalEarnings: 'total_earnings',
  pfDeduction: 'pf_deduction',
  esiDeduction: 'esi_deduction',
  professionalTax: 'professional_tax',
  gratuity: 'gratuity',
  tdsDeduction: 'tds_deduction',
  incomeTax: 'income_tax',
  surcharge: 'surcharge',
  cess: 'cess',
  loanDeduction: 'loan_deduction',
  advanceDeduction: 'advance_deduction',
  otherDeductions: 'other_deductions',
  totalDeductions: 'total_deductions',
  netSalary: 'net_salary',
  workingDays: 'working_days',
  presentDays: 'present_days',
  absentDays: 'absent_days',
  paidDays: 'paid_days',
  unpaidDays: 'unpaid_days',
  leaveDays: 'leave_days',
  paymentMethod: 'payment_method',
  notes: 'notes',
  remarks: 'remarks',
};

const computePayrollTotals = <T extends Record<string, unknown>>(rec: T): T => {
  const n = (x: unknown) => Number(x) || 0;
  const r = (x: number) => Math.round(x * 100) / 100;
  const paidDays = Math.max(0, n(rec.workingDays) - n(rec.absentDays) - n(rec.leaveDays));
  const totalEarnings = r(n(rec.basicSalary) + n(rec.hra) + n(rec.da) + n(rec.conveyance) + n(rec.medical) + n(rec.specialAllowance) + n(rec.overtimePay) + n(rec.bonus) + n(rec.commission) + n(rec.incentive) + n(rec.otherEarnings));
  const totalDeductions = r(n(rec.pfDeduction) + n(rec.esiDeduction) + n(rec.professionalTax) + n(rec.tdsDeduction) + n(rec.loanDeduction) + n(rec.advanceDeduction) + n(rec.otherDeductions));
  const netSalary = r(totalEarnings - totalDeductions);
  return { ...rec, paidDays, totalEarnings, totalDeductions, netSalary };
};

// Stable module-level components so the drawer's inputs do not remount (and lose
// focus / reset scroll) on every keystroke.
const payrollGridClass = `${formGridClass} [&>div]:flex [&>div]:flex-col [&_input:not([type=checkbox])]:h-[42px] [&_select]:h-[42px] [&_textarea]:h-[42px] [&>div>div>button]:h-[42px] [&>div>div>button]:min-h-[42px] [&>div>div>button]:py-0`;

/** Run payroll scope filters — 5 fields in one row on md+ */
const runScopeGridClass = `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 [&>div]:flex [&>div]:flex-col [&_input:not([type=checkbox])]:h-[42px] [&>div>div>button]:h-[42px] [&>div>div>button]:min-h-[42px] [&>div>div>button]:py-0`;

const PayrollLoading = () => (
  <div className="flex justify-center py-16">
    <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-blue)]" />
  </div>
);

const FormSectionTitle = ({ title }: { title: string }) => (
  <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
    <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> {title}
  </h3>
);

const TABS = [
  { id: 'run', label: 'Run Payroll', icon: Play },
  { id: 'pay_items', label: 'Payroll Adjustments', icon: HandCoins },
  { id: 'review', label: 'Review & Approve', icon: ClipboardCheck },
  { id: 'payslips', label: 'Payslips', icon: Wallet },
  { id: 'compliance', label: 'Compliance & Rules', icon: Scale },
  { id: 'config', label: 'Configuration', icon: Settings },
  { id: 'guide', label: 'Learning Hub', icon: GraduationCap },
];

// Form tabs for Payroll modal
interface BonusForm {
  employeeId: string;
  month: number;
  year: number;
  amount: number;
  reason: string;
  type: 'bonus' | 'incentive' | 'commission' | 'deduction';
}

interface BonusRecord {
  id?: number;
  employeeId?: number;
  employeeName?: string;
  employeeCode?: string;
  email?: string;
  month?: number;
  year?: number;
  amount: number;
  reason?: string;
  type?: string;
  companyId?: number;
  branchId?: number;
  departmentId?: number;
  companyName?: string;
  branchName?: string;
  departmentName?: string;
}

interface PayslipRecord extends Payroll {
  deductions?: number;
  netPay?: number;
  email?: string;
  branchId?: number;
  company_id?: number;
  branch_id?: number;
  department_id?: number;
  date?: string;
  paymentDate?: string;
  updatedAt?: string;
  companyName?: string;
  branchName?: string;
  departmentName?: string;
  commission?: number;
  incentive?: number;
  otherEarnings?: number;
  lwfDeduction?: number;
  loanDeduction?: number;
  advanceDeduction?: number;
  otherDeductions?: number;
  gratuity?: number;
  pfEmployerContribution?: number;
  esiEmployerContribution?: number;
  lwfEmployerContribution?: number;
  incomeTax?: number;
  surcharge?: number;
  cess?: number;
  remarks?: string;
  halfDays?: number;
  holidayDays?: number;
  weekOffDays?: number;
}

interface PayslipPreview {
  payroll?: {
    id?: number;
    month?: number;
    month_name?: string;
    year?: number;
    basic_salary?: number;
    hra?: number;
    da?: number;
    conveyance?: number;
    medical?: number;
    special_allowance?: number;
    overtime_pay?: number;
    bonus?: number;
    commission?: number;
    incentive?: number;
    other_earnings?: number;
    gross_salary?: number;
    pf_deduction?: number;
    esi_deduction?: number;
    professional_tax?: number;
    lwf_deduction?: number;
    gratuity?: number;
    tds_deduction?: number;
    loan_deduction?: number;
    advance_deduction?: number;
    other_deductions?: number;
    total_deductions?: number;
    pf_employer_contribution?: number;
    esi_employer_contribution?: number;
    lwf_employer_contribution?: number;
    net_salary?: number;
    working_days?: number;
    present_days?: number;
    absent_days?: number;
    paid_days?: number;
    unpaid_days?: number;
    leave_days?: number;
    component_breakdown?: Array<{ name?: string; display_name?: string; type?: string; value?: number }>;
  };
  employee?: {
    name?: string;
    employee_code?: string;
    designation?: string;
    department?: string;
    pan_number?: string;
    bank_account_number?: string;
    ifsc_code?: string;
    pf_uan?: string;
  };
  organization?: {
    legal_name?: string;
    name?: string;
    address?: string;
    registered_city?: string;
    registered_state?: string;
    pan_no?: string;
    gst_no?: string;
    default_currency?: string;
  };
}

const Payroll = ({ initialTab = 'run' }: { initialTab?: string }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [, setMounted] = useState(false);
  const [currency, setCurrency] = useState(getAppCurrency());
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingPayrollId, setEditingPayrollId] = useState<number | null>(null);
  const [editingEmployeeName, setEditingEmployeeName] = useState('');

  // Bonuses state
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusForm, setBonusForm] = useState<BonusForm>({ employeeId: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), amount: 0, reason: '', type: 'bonus' });
  // When set, the modal edits an existing ad-hoc earning (replace, never add).
  const [editingBonus, setEditingBonus] = useState<{ id: number; type?: string } | null>(null);
  const [bonusYearFilter, setBonusYearFilter] = useState(new Date().getFullYear());
  const [bonusMonthFilter, setBonusMonthFilter] = useState<number | 'all'>(new Date().getMonth() + 1);
  const [bonusTypeFilter, setBonusTypeFilter] = useState<string | number>('all');
  const [bonusCompanyFilter, setBonusCompanyFilter] = useState('all');
  const [bonusBranchFilter, setBonusBranchFilter] = useState('all');
  const [bonusDeptFilter, setBonusDeptFilter] = useState('all');

  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChangesWarning(isDirty, 'You have unsaved payroll changes. Leave anyway?');

  // Payslip preview modal
  const [payslipPreview, setPayslipPreview] = useState<PayslipPreview | null>(null);
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [loadingPayslip, setLoadingPayslip] = useState(false);

  // Payroll run state
  const [runMonth, setRunMonth] = useState(new Date().getMonth() + 1);
  const [runYear, setRunYear] = useState(new Date().getFullYear());
  const [runCompanyId, setRunCompanyId] = useState<string>('all');
  const [runBranchId, setRunBranchId] = useState<string>('all');
  const [runDepartmentId, setRunDepartmentId] = useState<string>('all');
  const [runResult, setRunResult] = useState<{ message?: string; generated?: { name: string }[]; skipped?: { name: string; reason?: string }[]; emailed?: { name: string }[]; emailSkipped?: { name: string; reason?: string }[] } | null>(null);
  const [showRunHelp, setShowRunHelp] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [reportCurrency] = useState('');
  const [payrollConfirm, setPayrollConfirm] = useState<{ p: PayslipRecord; action: string } | { p: null; action: 'bulk-submit' | 'bulk-approve' | 'bulk-process'; ids: number[]; count: number; month: number; year: number } | null>(null);

  // Review tab filter state
  const [reviewCompanyId, setReviewCompanyId] = useState('all');
  const [reviewBranchId, setReviewBranchId] = useState('all');
  const [reviewDeptId, setReviewDeptId] = useState('all');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [reviewMonth, setReviewMonth] = useState<number | 'all'>('all');
  const [reviewYear, setReviewYear] = useState<number | 'all'>('all');

const { data: paymentMethodOptions = [] } = useMasterData('PAYMENT_METHOD');
const { data: monthOptions = [] } = useMasterData('PAYROLL_MONTH');
const { data: payrollStatusOptions = [] } = useMasterData('PAYROLL_STATUS');
  const queryClient = useQueryClient();
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/payroll/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Bulk upload completed: ${data?.created || 0} created, ${data?.updated || 0} updated`);
      setShowBulkUpload(false);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Bulk upload failed: ${err.response?.data?.message || err.message}`);
    },
  });
  const [calculatingServer, setCalculatingServer] = useState(false);
  const [calcMeta, setCalcMeta] = useState<{
    workingDays: number; presentDays: number; absentDays: number; halfDays: number; holidayDays: number;
    leaveDays: number; unpaidDays: number; overtimeHours: number;
    expenseReimbursement: number; expenseCount: number; leaveEncashment: number; arrears: number;
  } | null>(null);
  const [newPayroll, setNewPayroll] = useState({
    employeeId: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    organizationId: '',
    companyId: '',
    branchId: '',
    departmentId: '',
    basicSalary: 0,
    hra: 0,
    da: 0,
    conveyance: 0,
    medical: 0,
    specialAllowance: 0,
    grossSalary: 0,
    overtimePay: 0,
    bonus: 0,
    commission: 0,
    incentive: 0,
    otherEarnings: 0,
    totalEarnings: 0,
    pfDeduction: 0,
    pfEmployerContribution: 0,
    esiDeduction: 0,
    esiEmployerContribution: 0,
    professionalTax: 0,
    gratuity: 0,
    tdsDeduction: 0,
    incomeTax: 0,
    surcharge: 0,
    cess: 0,
    loanDeduction: 0,
    advanceDeduction: 0,
    otherDeductions: 0,
    totalDeductions: 0,
    netSalary: 0,
    workingDays: 0,
    presentDays: 0,
    absentDays: 0,
    paidDays: 0,
    unpaidDays: 0,
    leaveDays: 0,
    halfDays: 0,
    holidayDays: 0,
    weekOffDays: 0,
    paymentMethod: '',
    bankAccount: '',
    ifscCode: '',
    transactionId: '',
    utrNumber: '',
    checkNumber: '',
    checkDate: '',
    notes: '',
    remarks: ''
  });

  const runServerCalc = useCallback(async () => {
    if (!newPayroll.employeeId) { toast.error('Select an employee first'); return; }
    setCalculatingServer(true);
    try {
      const r = await api.get('/payroll/calculate', { params: { employeeId: Number(newPayroll.employeeId), month: newPayroll.month, year: newPayroll.year } });
      const c = r.data || {};
      const num = (v: unknown) => Number(v) || 0;
      setCalcMeta({
        workingDays: num(c.working_days), presentDays: num(c.present_days), absentDays: num(c.absent_days),
        halfDays: num(c.half_days), holidayDays: num(c.holiday_days),
        leaveDays: num(c.leave_days), unpaidDays: num(c.unpaid_days), overtimeHours: num(c.overtime_hours),
        expenseReimbursement: num(c.expense_reimbursement), expenseCount: Array.isArray(c.expense_items) ? c.expense_items.length : 0,
        leaveEncashment: num(c.leave_encashment), arrears: num(c.arrears),
      });
      setNewPayroll((prev) => ({
        ...prev,
        basicSalary: num(c.basic_salary), hra: num(c.hra), da: num(c.da),
        conveyance: num(c.conveyance), medical: num(c.medical), specialAllowance: num(c.special_allowance),
        grossSalary: num(c.gross_salary), overtimePay: num(c.overtime_pay), bonus: num(c.bonus),
        commission: num(c.commission), incentive: num(c.incentive), otherEarnings: num(c.other_earnings),
        totalEarnings: num(c.total_earnings),
        pfDeduction: num(c.pf_deduction), pfEmployerContribution: num(c.pf_employer_contribution),
        esiDeduction: num(c.esi_deduction), esiEmployerContribution: num(c.esi_employer_contribution),
        professionalTax: num(c.professional_tax), gratuity: num(c.gratuity),
        tdsDeduction: num(c.tds_deduction), incomeTax: num(c.income_tax),
        surcharge: num(c.surcharge), cess: num(c.cess),
        loanDeduction: num(c.loan_deduction), advanceDeduction: num(c.advance_deduction),
        otherDeductions: num(c.other_deductions), totalDeductions: num(c.total_deductions),
        netSalary: num(c.net_salary),
        workingDays: num(c.working_days), presentDays: num(c.present_days),
        absentDays: num(c.absent_days), paidDays: num(c.paid_days),
        unpaidDays: num(c.unpaid_days), leaveDays: num(c.leave_days),
      }));
      toast.success('Calculated from attendance & policy');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Calculation failed');
    } finally { setCalculatingServer(false); }
  }, [newPayroll.employeeId, newPayroll.month, newPayroll.year]);

  // Auto-calculate from the server whenever employee + period is chosen in the
  // Process Payroll drawer, so amounts always reflect attendance, leave and
  // approved expenses. Manual "Calculate" button still available for re-runs.
  useEffect(() => {
    if (!showModal || editingPayrollId !== null || !newPayroll.employeeId || !newPayroll.month || !newPayroll.year) return;
    const t = setTimeout(() => { runServerCalc(); }, 350);
    return () => clearTimeout(t);
  }, [showModal, editingPayrollId, newPayroll.employeeId, newPayroll.month, newPayroll.year, runServerCalc]);

  useEffect(() => {
    setMounted(true);
    // Set currency to INR
    setCurrency('INR');
  }, []);

  const currencySymbol = getCurrencySymbol(currency);

  const downloadPayslipPdf = async (p: Partial<Payroll>) => {
    try {
      const response = await api.get(`/payroll/${p.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip_${p.employeeCode || p.id}_${p.month}_${p.year}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download payslip');
    }
  };

  const emailPayslipPdf = async (p: Partial<Payroll>) => {
    try {
      const r = await api.post(`/payroll/${p.id}/email`);
      toast.success(r.data?.message || 'Payslip emailed');
    } catch {
      toast.error('Failed to email payslip (employee may have no email on file)');
    }
  };

  const currentFinancialYear = () => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Apr -> new FY
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  };

  const downloadForm16 = async (p: Partial<Payroll>) => {
    const fy = prompt('Financial year (e.g. 2025-26):', currentFinancialYear());
    if (!fy) return;
    try {
      const response = await api.get(`/payroll/form16/${p.employeeId}`, {
        params: { financial_year: fy.trim() },
        responseType: 'blob',
      });
      const docType = (response.headers as Record<string, string>)['x-document-type'] || 'form16';
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      const name = docType === 'salary-certificate' ? 'salary_certificate' : 'form16';
      a.href = url;
      a.download = `${name}_${p.employeeCode || p.employeeId}_${fy.trim()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      if (docType === 'salary-certificate') {
        toast('No TDS was deducted in this FY, so Form 16 is not applicable — a Salary/Service Certificate was generated instead.');
      } else {
        toast.success('Form 16 (Part B) downloaded. Part A must be issued from TRACES.');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Failed to generate Form 16');
    }
  };

  const emailForm16 = async (p: Partial<Payroll>) => {
    const fy = prompt('Financial year (e.g. 2025-26):', currentFinancialYear());
    if (!fy) return;
    try {
      const r = await api.get(`/payroll/form16/${p.employeeId}`, { params: { financial_year: fy.trim(), email: '1' } });
      const msg = r.data?.message || '';
      toast.success(msg.includes('Salary') ? msg + ' (Form 16 is not applicable when no TDS was deducted)' : msg);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Failed to email Form 16');
    }
  };

  const bulkDownloadForm16 = async () => {
    const fy = prompt('Financial year for bulk Form 16 (Part B) export (e.g. 2025-26):', currentFinancialYear());
    if (!fy) return;
    try {
      const response = await api.get(`/payroll/form16/bulk`, {
        params: { financial_year: fy.trim() },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `form16_bulk_${fy.trim()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Form 16 (Part B) bulk export downloaded. Check the manifest for skipped employees.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Failed to export Form 16 in bulk');
    }
  };

  const bulkEmailPayslips = async () => {
    const ids = filteredPayslips
      .filter((p: PayslipRecord) => p.id != null)
      .map((p: PayslipRecord) => p.id);
    if (!ids.length) { toast.error('No payslips in the current view to email'); return; }
    setIsRunning(true);
    try {
      const r = await api.post('/payroll/bulk-email', { payrollIds: ids });
      const body = r.data || {};
      toast.success(body.message || 'Bulk email sent');
      if ((body.skipped || []).length > 0) {
        toast(`Skipped ${body.skipped.length}: employees without an email on file`, { icon: '⚠️' });
      }
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Failed to bulk-email payslips');
    } finally { setIsRunning(false); }
  };

  const [, setRunProgress] = useState<{ runId: number; status: string; total: number; processed: number; generated: number; skipped: number; emailed: number } | null>(null);
  const [progressTimer, setProgressTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const { data: payrollRuns = [] } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const r = await api.get('/payroll/runs');
    return (r.data || []) as Array<{
      runId: number; status: string; month: number; year: number;
      total: number; processed: number; generated: number; skipped: number;
      emailed: number; notified: number; approved: number; rerun: number; error?: string | null;
      createdAt?: string; finishedAt?: string | null; requestedBy?: string;
      submittedBy?: string; submittedAt?: string | null;
      approvedBy?: string; approvedAt?: string | null;
      rerunBy?: string; rerunAt?: string | null;
    }>;
    },
    refetchInterval: 3000,
  });

  const stopProgressPolling = useCallback(() => {
    if (progressTimer) { clearInterval(progressTimer); setProgressTimer(null); }
  }, [progressTimer]);

  const startProgressPolling = (runId: number) => {
    stopProgressPolling();
    const t = setInterval(async () => {
      try {
        const r = await api.get(`/payroll/runs/${runId}`);
        const d = r.data;
        setRunProgress({
          runId: d.runId, status: d.status, total: d.total || 0,
          processed: d.processed || 0, generated: d.generated || 0,
          skipped: d.skipped || 0, emailed: d.emailed || 0,
        });
        if (d.status === 'completed' || d.status === 'failed') {
          clearInterval(t); setProgressTimer(null);
          setIsRunning(false);
          queryClient.invalidateQueries({ queryKey: ['payslips'] });
          queryClient.invalidateQueries({ queryKey: ['payroll-stats'] });
          if (d.status === 'completed') {
            const em = d.emailed || 0;
            toast.success(d.generated ? `Payroll run complete — ${d.generated} generated, ${d.skipped || 0} skipped${em ? `, ${em} emailed` : ''}` : 'Payroll run complete (nothing new to generate)');
          } else {
            toast.error(d.error || 'Payroll run failed');
          }
        }
      } catch {
        clearInterval(t); setProgressTimer(null); setIsRunning(false);
      }
    }, 2000);
    setProgressTimer(t);
  };

  const runPayrollAll = async () => {
    setIsRunning(true); setRunResult(null); setRunProgress(null);
    try {
      const params: Record<string, unknown> = { month: runMonth, year: runYear, email: false };
      if (runCompanyId !== 'all') params.companyId = Number(runCompanyId);
      if (runBranchId !== 'all') params.branchId = Number(runBranchId);
      if (runDepartmentId !== 'all') params.departmentId = Number(runDepartmentId);
      const r = await api.post('/payroll/generate-all', null, { params });
      const d = r.data || {};
      if (d.runId) {
        toast.success('Payroll run queued — processing in the background');
        startProgressPolling(Number(d.runId));
      } else {
        setRunResult(d);
        setIsRunning(false);
        toast.success(d.message || 'Payroll generated');
        queryClient.invalidateQueries({ queryKey: ['payslips'] });
        queryClient.invalidateQueries({ queryKey: ['payroll-stats'] });
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Failed to run payroll');
      setIsRunning(false);
    }
  };

  useEffect(() => {
    return () => stopProgressPolling();
  }, [stopProgressPolling]);

  const openPayslipPreview = async (p: Partial<Payroll>) => {
    if (!p.id) { toast.error('Invalid payslip data'); return; }
    setLoadingPayslip(true);
    setShowPayslipModal(true);
    try {
      const response = await api.get(`/payroll/${p.id}/payslip`);
      setPayslipPreview(response.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err?.response?.data?.detail || err?.message || 'Failed to load payslip data');
      setShowPayslipModal(false);
    } finally {
      setLoadingPayslip(false);
    }
  };

  const ACTION_LABELS: Record<string, string> = {
    pending_approval: 'Submit for Approval',
    approve: 'Approve',
    process: 'Process (Disburse)',
    mark_paid: 'Mark as Paid',
    lock: 'Lock Payroll Period',
    reopen: 'Reopen Payroll Period',
    cancel: 'Cancel Payroll',
  };

  const confirmPayrollAction = (p: PayslipRecord, action: string) => {
    setPayrollConfirm({ p, action });
  };

  const processAllForPeriod = () => {
    const month = runMonth;
    const year = runYear;
    const rows = payslips.filter((p: PayslipRecord) => p.month === month && p.year === year && p.status === 'draft');
    if (rows.length === 0) { toast('No draft payrolls to process for this period'); return; }
    setPayrollConfirm({ p: null, action: 'bulk-submit', ids: rows.map((p: PayslipRecord) => p.id), count: rows.length, month, year });
  };

  const approveAllForPeriod = () => {
    const month = runMonth;
    const year = runYear;
    const rows = payslips.filter((p: PayslipRecord) => p.month === month && p.year === year && (p.status === 'draft' || p.status === 'pending_approval'));
    if (rows.length === 0) { toast('No payrolls awaiting approval for this period'); return; }
    setPayrollConfirm({ p: null, action: 'bulk-approve', ids: rows.map((p: PayslipRecord) => p.id), count: rows.length, month, year });
  };

  const submitAllForPeriod = () => {
    const month = runMonth;
    const year = runYear;
    const rows = payslips.filter((p: PayslipRecord) => p.month === month && p.year === year && p.status === 'approved');
    if (rows.length === 0) { toast('No approved payrolls to submit for this period'); return; }
    setPayrollConfirm({ p: null, action: 'bulk-process', ids: rows.map((p: PayslipRecord) => p.id), count: rows.length, month, year });
  };

  const { data: payslips = [], isLoading, isFetching } = useQuery({
    queryKey: ['payslips', runMonth, runYear, runCompanyId, runBranchId, runDepartmentId, reviewMonth, reviewYear, reviewCompanyId, reviewBranchId, reviewDeptId],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      const months = new Set([runMonth, reviewMonth]);
      const years = new Set([runYear, reviewYear]);
      const companies = new Set([runCompanyId, reviewCompanyId].filter(c => c !== 'all'));
      const branches = new Set([runBranchId, reviewBranchId].filter(b => b !== 'all'));
      const depts = new Set([runDepartmentId, reviewDeptId].filter(d => d !== 'all'));

      if (months.size === 1) params.month = [...months][0];
      if (years.size === 1) params.year = [...years][0];
      if (companies.size === 1) params.companyId = Number([...companies][0]);
      if (branches.size === 1) params.branchId = Number([...branches][0]);
      if (depts.size === 1) params.departmentId = Number([...depts][0]);

      const response = await api.get('/payroll', { params });
      const body = response.data;
      return body?.data ?? (Array.isArray(body) ? body : []);
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Converted payroll summary (multi-currency reporting)
  useQuery({
    queryKey: ['payroll-summary', runMonth, runYear, reportCurrency],
    queryFn: async () => {
      const params: Record<string, unknown> = { month: runMonth, year: runYear };
      if (reportCurrency) params.currency = reportCurrency;
      const response = await api.get('/payroll/summary', { params });
      return response.data || null;
    },
  });

  // Attendance/leave/holiday review summary for the selected period + company.
  useQuery({
    queryKey: ['attendance-review', runMonth, runYear, runCompanyId],
    queryFn: async () => {
      const params: Record<string, unknown> = { month: runMonth, year: runYear };
      if (runCompanyId !== 'all') params.companyId = Number(runCompanyId);
      const r = await api.get('/payroll/attendance-review', { params });
      return r.data || null;
    },
  });

  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showRerunConfirm, setShowRerunConfirm] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [payItemsSub, setPayItemsSub] = useState<'bonuses' | 'deductions' | 'loans'>('bonuses');
  const [pendingRunAction, setPendingRunAction] = useState<'submit' | 'approve' | 'process' | null>(null);

  const finalizeMutation = useMutation({
    mutationFn: () => api.post('/payroll/finalize-attendance', { month: runMonth, year: runYear, companyId: runCompanyId === 'all' ? null : Number(runCompanyId) }),
    onSuccess: () => { toast.success('Payroll period finalized'); setShowFinalizeConfirm(false); queryClient.invalidateQueries({ queryKey: ['attendance-review'] }); },
    onError: () => toast.error('Failed to finalize period'),
  });

  // Payroll status transitions: approve / process / mark_paid
  const payrollStatusMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: number[]; action: string }) => {
      const res = await api.post('/payroll/bulk-status', { payrollIds: ids, action });
      return res.data;
    },
    onSuccess: (data: { message?: string }) => {
      toast.success(data?.message || 'Payroll updated');
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-summary'] });
    },
    onError: () => toast.error('Failed to update payroll status'),
    onSettled: () => setPendingRunAction(null),
  });

  // Re-run payroll: wipe the selected month's payroll and regenerate it fresh.
  const rerunMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { month: runMonth, year: runYear };
      if (runCompanyId !== 'all') payload.companyId = Number(runCompanyId);
      if (runBranchId !== 'all') payload.branchId = Number(runBranchId);
      if (runDepartmentId !== 'all') payload.departmentId = Number(runDepartmentId);
      const r = await api.post('/payroll/reset', payload);
      return r.data;
    },
    onSuccess: () => {
      setShowRerunConfirm(false);
      toast.success('Payroll wiped — regenerating fresh payslips');
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-summary'] });
      runPayrollAll();
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Failed to re-run payroll');
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { month: runMonth, year: runYear };
      if (runCompanyId !== 'all') payload.companyId = Number(runCompanyId);
      if (runBranchId !== 'all') payload.branchId = Number(runBranchId);
      if (runDepartmentId !== 'all') payload.departmentId = Number(runDepartmentId);
      const r = await api.post('/payroll/void', payload);
      return r.data;
    },
    onSuccess: () => {
      setShowVoidConfirm(false);
      toast.success('Payroll voided — records permanently deleted');
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-summary'] });
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail || 'Failed to void payroll');
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: async (runId: number) => api.delete(`/payroll/runs/${runId}`),
    onSuccess: () => {
      toast.success('Payroll run deleted');
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: () => toast.error('Failed to delete payroll run'),
  });

  // Companies / Branches / Departments for filters
    const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => { try { const r = await api.get('/branches'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: pickerEmployees = [] } = useEmployeePicker({ status: 'active' });
  const employees = pickerEmployees.map(normalizePickerEmployee);

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { try { const r = await api.get('/departments'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const { data: bonuses = [], refetch: refetchBonuses } = useQuery({
    queryKey: ['bonuses', bonusYearFilter],
    queryFn: async () => {
      try { const r = await api.get('/bonuses', { params: { year: bonusYearFilter } }); return r.data || []; } catch { return []; }
    },
  });

  const deleteBonusMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type?: string }) => { const r = await api.delete(`/bonuses/${id}`, { params: { type: type || 'bonus' } }); return r.data; },
    onSuccess: () => { toast.success('Bonus deleted'); refetchBonuses(); },
    onError: (err: unknown) => { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to delete bonus'); },
  });

  const filteredBonuses = bonuses.filter((b: BonusRecord) => {
    const matchCompany = bonusCompanyFilter === 'all' || b.companyId?.toString() === bonusCompanyFilter;
    const matchBranch = bonusBranchFilter === 'all' || b.branchId?.toString() === bonusBranchFilter;
    const matchDept = bonusDeptFilter === 'all' || b.departmentId?.toString() === bonusDeptFilter;
    return matchCompany && matchBranch && matchDept;
  });

  const createBonusMutation = useMutation({
    mutationFn: async (data: BonusForm) => { const r = await api.post('/bonuses', data); return r.data; },
    onSuccess: () => { toast.success('Bonus recorded'); refetchBonuses(); setShowBonusForm(false); setEditingBonus(null); },
    onError: (err: unknown) => { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to record bonus'); },
  });

  const { data: preDeductionData, refetch: refetchPreDeductions } = useQuery({
    queryKey: ['pre-deductions', runMonth, runYear, runCompanyId],
    queryFn: async () => {
      try {
        const r = await api.get('/payroll/pre-deductions', {
          params: { month: runMonth, year: runYear, ...(runCompanyId !== 'all' ? { companyId: Number(runCompanyId) } : {}) },
        });
        return r.data || { items: [], total: 0 };
      } catch { return { items: [], total: 0 }; }
    },
  });
  interface PreDeductionRow { id: number; employeeId: number; employeeName?: string; employeeCode?: string; amount: number; reason?: string }
  const preDeductions: PreDeductionRow[] = (preDeductionData as { items?: PreDeductionRow[] } | undefined)?.items || [];

  const savePreDeductionMutation = useMutation({
    mutationFn: async (data: BonusForm) => {
      const r = await api.post('/payroll/pre-deductions', {
        month: data.month, year: data.year,
        items: [{ employeeId: Number(data.employeeId), amount: Number(data.amount), reason: data.reason }],
      });
      return r.data;
    },
    onSuccess: () => { toast.success('Pre-run deduction queued — it will be applied at preview/generate'); refetchPreDeductions(); setShowBonusForm(false); setEditingBonus(null); },
    onError: (err: unknown) => { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to save deduction'); },
  });

  const deletePreDeductionMutation = useMutation({
    mutationFn: async (id: number) => { const r = await api.delete(`/payroll/pre-deductions/${id}`); return r.data; },
    onSuccess: () => { toast.success('Deduction removed'); refetchPreDeductions(); },
    onError: (err: unknown) => { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to remove deduction'); },
  });

  // Editing an existing entry REPLACES it (remove old, record new) — never
  // re-adds, which would silently double the payout.
  const saveBonus = async () => {
    if (!bonusForm.employeeId) { toast.error('Select an employee'); return; }
    if (!(bonusForm.amount > 0)) { toast.error('Enter an amount greater than zero'); return; }
    if (bonusForm.type === 'deduction') {
      if (editingBonus) {
        try { await api.delete(`/payroll/pre-deductions/${editingBonus.id}`); }
        catch (err) { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to update deduction'); return; }
      }
      savePreDeductionMutation.mutate(bonusForm);
      return;
    }
    if (editingBonus) {
      try {
        await api.delete(`/bonuses/${editingBonus.id}`, { params: { type: editingBonus.type || bonusForm.type || 'bonus' } });
      } catch (err) {
        const e = err as { response?: { data?: { detail?: string } } };
        toast.error(e.response?.data?.detail || 'Failed to update bonus');
        return;
      }
    }
    createBonusMutation.mutate(bonusForm);
  };

  const createPayrollMutation = useMutation({
    mutationFn: async (data: typeof newPayroll) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v === '' || v === null || v === undefined) continue;
        clean[k] = v;
      }
      const r = await api.post('/payroll', clean);
      return r.data;
    },
    onSuccess: () => {
      setIsDirty(false);
      toast.success('Payroll created');
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      handleCloseDrawer();
    },
    onError: (err: unknown) => { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to create payroll'); },
  });

  const updatePayrollMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const r = await api.put(`/payroll/${id}`, data);
      return r.data;
    },
    onSuccess: () => {
      setIsDirty(false);
      toast.success('Payroll updated');
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-summary'] });
      handleCloseDrawer();
    },
    onError: (err: unknown) => { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to update payroll'); },
  });

  const recalcTaxMutation = useMutation({
    mutationFn: async (data: { employeeId: number; month: number; year: number; totalEarnings: number; pfDeduction: number; professionalTax: number }) => {
      const r = await api.post('/payroll/recalculate', data);
      return r.data;
    },
    onSuccess: (res: { tds?: number; incomeTax?: number; surcharge?: number; cess?: number }) => {
      setNewPayroll((prev) => computePayrollTotals({
        ...prev,
        tdsDeduction: Number(res.tds) || 0,
        incomeTax: Number(res.incomeTax) || 0,
        surcharge: Number(res.surcharge) || 0,
        cess: Number(res.cess) || 0,
      }));
      toast.success('TDS recalculated');
    },
    onError: (err: unknown) => { const e = err as { response?: { data?: { detail?: string } } }; toast.error(e.response?.data?.detail || 'Failed to recalculate tax'); },
  });

  const recalcTax = () => {
    if (!newPayroll.employeeId || !newPayroll.month || !newPayroll.year) return;
    const totals = computePayrollTotals(newPayroll);
    recalcTaxMutation.mutate({
      employeeId: Number(newPayroll.employeeId),
      month: Number(newPayroll.month),
      year: Number(newPayroll.year),
      totalEarnings: Number(totals.totalEarnings) || 0,
      pfDeduction: Number(newPayroll.pfDeduction) || 0,
      professionalTax: Number(newPayroll.professionalTax) || 0,
    });
  };

  const openPayrollEdit = (p: PayslipRecord) => {
    setEditingPayrollId(p.id);
    setEditingEmployeeName(p.employeeName || '');
    setNewPayroll({
      employeeId: String(p.employeeId || ''),
      month: p.month || new Date().getMonth() + 1,
      year: p.year || new Date().getFullYear(),
      organizationId: String(p.organizationId || ''),
      companyId: p.companyId ? String(p.companyId) : '',
      branchId: '',
      departmentId: p.departmentId ? String(p.departmentId) : '',
      basicSalary: p.basicSalary || 0,
      hra: p.hra || 0,
      da: p.da || 0,
      conveyance: p.conveyance || 0,
      medical: p.medical || 0,
      specialAllowance: p.specialAllowance || 0,
      grossSalary: p.grossSalary || 0,
      overtimePay: p.overtimePay || 0,
      bonus: p.bonus || 0,
      commission: p.commission || 0,
      incentive: p.incentive || 0,
      otherEarnings: p.otherEarnings || 0,
      totalEarnings: p.totalEarnings || 0,
      pfDeduction: p.pfDeduction || 0,
      pfEmployerContribution: p.pfEmployerContribution || 0,
      esiDeduction: p.esiDeduction || 0,
      esiEmployerContribution: p.esiEmployerContribution || 0,
      professionalTax: p.professionalTax || 0,
      gratuity: p.gratuity || 0,
      tdsDeduction: p.tdsDeduction || 0,
      incomeTax: p.incomeTax || 0,
      surcharge: p.surcharge || 0,
      cess: p.cess || 0,
      loanDeduction: p.loanDeduction || 0,
      advanceDeduction: p.advanceDeduction || 0,
      otherDeductions: p.otherDeductions || 0,
      totalDeductions: p.totalDeductions || 0,
      netSalary: p.netSalary || 0,
      workingDays: p.workingDays || 0,
      presentDays: p.presentDays || 0,
      absentDays: p.absentDays || 0,
      paidDays: p.paidDays || 0,
      unpaidDays: p.unpaidDays || 0,
      leaveDays: p.leaveDays || 0,
      halfDays: p.halfDays || 0,
      holidayDays: p.holidayDays || 0,
      weekOffDays: p.weekOffDays || 0,
      paymentMethod: p.paymentMethod || '',
      bankAccount: '',
      ifscCode: '',
      transactionId: '',
      utrNumber: '',
      checkNumber: '',
      checkDate: '',
      notes: p.notes || '',
      remarks: p.remarks || '',
    });
    setIsClosing(false);
    setShowModal(true);
  };

  const handleSubmitPayroll = () => {
    if (editingPayrollId) {
      const payload: Record<string, unknown> = {};
      for (const [camel, snake] of Object.entries(SNAKE_FIELDS)) {
        const v = (newPayroll as unknown as Record<string, unknown>)[camel];
        if (v !== '' && v !== null && v !== undefined) payload[snake] = v;
      }
      updatePayrollMutation.mutate({ id: editingPayrollId, data: payload });
    } else {
      createPayrollMutation.mutate(newPayroll);
    }
  };

  const { data: stats = { totalPayroll: 0, employeesPaid: 0, pending: 0, avgSalary: 0 } } = useQuery({
    queryKey: ['payroll-stats'],
    queryFn: async () => {
      const response = await api.get('/payroll/stats');
      return response.data || { totalPayroll: 0, employeesPaid: 0, pending: 0, avgSalary: 0 };
    },
  });

  const filteredPayslips = payslips.filter((p: PayslipRecord) => {
    if (!SUBMITTED_STATUSES.includes(p.status)) return false;
    const matchSearch = !searchTerm ||
      p.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCompany = companyFilter === 'all' || p.companyId?.toString() === companyFilter;
    const matchBranch = branchFilter === 'all' || p.branchId?.toString() === branchFilter;
    const matchDept = departmentFilter === 'all' || p.departmentId?.toString() === departmentFilter;
    const matchStatus = statusFilter === 'all' || p.status?.toLowerCase() === statusFilter.toLowerCase();
    
    const pDate = p.date || p.createdAt || p.paymentDate || p.updatedAt;
    const matchStart = !startDate || (pDate && pDate.substring(0, 10) >= startDate);
    const matchEnd = !endDate || (pDate && pDate.substring(0, 10) <= endDate);

    return matchSearch && matchCompany && matchBranch && matchDept && matchStatus && matchStart && matchEnd;
  });

  const toNum = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const statCards = [
    { label: 'Total Payroll (Rs.)', value: toNum(stats.totalPayroll), icon: Wallet, iconBg: 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5', iconColor: 'text-[var(--primary-blue)]', tooltip: 'Total payroll processed this period', trend: 8, onClick: () => setActiveTab('payslips') },
    { label: 'Employees Paid', value: toNum(stats.employeesPaid), icon: Users, iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5', iconColor: 'text-[#059669]', tooltip: 'Employees who received salary this period', trend: 5, onClick: () => setActiveTab('payslips') },
    { label: 'Pending', value: toNum(stats.pending), icon: Clock, iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5', iconColor: 'text-[#D97706]', tooltip: 'Payroll records awaiting processing', trend: stats.pending > 0 ? -3 : 0, onClick: () => setActiveTab('payslips') },
    { label: 'Avg Salary (Rs.)', value: toNum(stats.avgSalary), icon: Coins, iconBg: 'bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5', iconColor: 'text-[#7C3AED]', tooltip: 'Average salary across processed employees', trend: 3, onClick: () => setActiveTab('payslips') },
  ];

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setEditingPayrollId(null);
    setEditingEmployeeName('');
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
      setNewPayroll({
        employeeId: '',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        organizationId: '',
        companyId: '',
        branchId: '',
        departmentId: '',
        basicSalary: 0,
        hra: 0,
        da: 0,
        conveyance: 0,
        medical: 0,
        specialAllowance: 0,
        grossSalary: 0,
        overtimePay: 0,
        bonus: 0,
        commission: 0,
        incentive: 0,
        otherEarnings: 0,
        totalEarnings: 0,
        pfDeduction: 0,
        pfEmployerContribution: 0,
        esiDeduction: 0,
        esiEmployerContribution: 0,
        professionalTax: 0,
        gratuity: 0,
        tdsDeduction: 0,
        incomeTax: 0,
        surcharge: 0,
        cess: 0,
        loanDeduction: 0,
        advanceDeduction: 0,
        otherDeductions: 0,
        totalDeductions: 0,
        netSalary: 0,
        workingDays: 0,
        presentDays: 0,
        absentDays: 0,
        paidDays: 0,
        unpaidDays: 0,
        leaveDays: 0,
        halfDays: 0,
        holidayDays: 0,
        weekOffDays: 0,
        paymentMethod: '',
        bankAccount: '',
        ifscCode: '',
        transactionId: '',
        utrNumber: '',
        checkNumber: '',
        checkDate: '',
        notes: '',
        remarks: ''
      });
    }, 300);
  };

  const renderPayrollForm = () => {
    const inputCls = formInputClass;
    const readOnlyCls = `${formReadonlyClass} font-semibold`;
    const Field = FormField;
    const SectionTitle = FormSectionTitle;
    const applyPayrollCalc = (rec: typeof newPayroll): typeof newPayroll => computePayrollTotals(rec);
    return (
      <div className="space-y-5">
        <section>
          <SectionTitle title="Employee & Period" />
          {editingPayrollId !== null ? (
            <div className={payrollGridClass}>
              <Field label="Employee">
                <div className={`${formReadonlyClass} flex items-center text-sm font-medium`}>{editingEmployeeName || '—'}</div>
              </Field>
              <Field label="Period">
                <div className={`${formReadonlyClass} flex items-center text-sm font-medium`}>{monthLabel(newPayroll.month, newPayroll.year)}</div>
              </Field>
            </div>
          ) : (
            <>
              <EmployeeScopedCascade
                companies={companies}
                companyId={newPayroll.companyId ? String(newPayroll.companyId) : ''}
                branchId={newPayroll.branchId ? String(newPayroll.branchId) : ''}
                departmentId={newPayroll.departmentId ? String(newPayroll.departmentId) : ''}
                employeeId={newPayroll.employeeId ? String(newPayroll.employeeId) : ''}
                onScopeChange={(patch) => setNewPayroll((prev) => ({ ...prev, ...patch }))}
                onCompanyChange={(val) => setNewPayroll((prev) => ({ ...prev, companyId: val }))}
                onBranchChange={(val) => setNewPayroll((prev) => ({ ...prev, branchId: val }))}
                onDepartmentChange={(val) => setNewPayroll((prev) => ({ ...prev, departmentId: val }))}
                onEmployeeChange={(val) => setNewPayroll((prev) => ({ ...prev, employeeId: val }))}
                extra={
                  <>
                    <Field label="Month" required help="1-12 for the payroll month">
                      <select className={inputCls} value={newPayroll.month} onChange={e => setNewPayroll({ ...newPayroll, month: parseInt(e.target.value) })}>
                        {monthOptions.map((opt: { value?: string; label?: string; code?: string; name?: string }) => <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>)}
                      </select>
                    </Field>
                    <Field label="Year" required help="Payroll year, e.g. 2026">
                      <input type="number" className={inputCls} value={newPayroll.year} onChange={e => setNewPayroll({ ...newPayroll, year: parseInt(e.target.value) })} />
                    </Field>
                  </>
                }
              />
              <div className="flex items-center justify-end mt-3">
                <button
                  type="button"
                  onClick={runServerCalc}
                  disabled={calculatingServer}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#10B981] text-white rounded-lg text-sm font-medium hover:bg-[#059669] disabled:opacity-50 transition-colors"
                  title="Calculate amounts from attendance and the configured payroll policies"
                >
                  {calculatingServer ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {calculatingServer ? 'Calculating...' : 'Calculate from attendance & policy'}
                </button>
              </div>
            </>
          )}
          <div className={`${payrollGridClass} mt-4`}>
            <Field label="Working Days" help="Working days in the month">
              <input type="number" className={inputCls} value={newPayroll.workingDays} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, workingDays: parseInt(e.target.value) }))} />
            </Field>
            <Field label="Present Days" help="Days the employee was present">
              <input type="number" className={inputCls} value={newPayroll.presentDays} onChange={e => setNewPayroll({ ...newPayroll, presentDays: parseInt(e.target.value) })} />
            </Field>
            <Field label="Absent Days" help="Days the employee was absent">
              <input type="number" className={inputCls} value={newPayroll.absentDays} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, absentDays: parseInt(e.target.value) }))} />
            </Field>
            <Field label="Leave Days" help="Leave days taken by employee">
              <input type="number" className={inputCls} value={newPayroll.leaveDays} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, leaveDays: parseInt(e.target.value) }))} />
            </Field>
            <Field label="Week Off" help="Weekly off days (from attendance)">
              <input type="number" readOnly className={readOnlyCls} value={newPayroll.weekOffDays} />
            </Field>
            <Field label="Holidays" help="Paid/public holidays (from attendance)">
              <input type="number" readOnly className={readOnlyCls} value={newPayroll.holidayDays} />
            </Field>
            <Field label="Half Days" help="Half days (from attendance)">
              <input type="number" readOnly className={readOnlyCls} value={newPayroll.halfDays} />
            </Field>
            <Field label="Unpaid Days" help="Absent + unpaid leave">
              <input type="number" readOnly className={readOnlyCls} value={newPayroll.unpaidDays} />
            </Field>
            <Field label="Paid Days" help="Auto-calculated (working - absent - leave)" >
              <input type="number" readOnly className={readOnlyCls} value={newPayroll.paidDays} />
            </Field>
          </div>
          {calcMeta && (
            <div className={`${payrollGridClass} mt-4`}>
              <div className="rounded-lg border border-[var(--border-color)] p-3">
                <p className="text-xs font-medium text-[var(--text-tertiary)] flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Attendance</p>
                <div className="mt-2 space-y-1 text-sm text-[var(--text-primary)]">
                  <div className="flex justify-between"><span>Present</span><span className="font-medium">{calcMeta.presentDays} days</span></div>
                  <div className="flex justify-between"><span>Absent</span><span className="font-medium">{calcMeta.absentDays} days</span></div>
                  <div className="flex justify-between"><span>Half day</span><span className="font-medium">{calcMeta.halfDays} days</span></div>
                  <div className="flex justify-between"><span>Holiday</span><span className="font-medium">{calcMeta.holidayDays} days</span></div>
                  <div className="flex justify-between"><span>Overtime</span><span className="font-medium">{calcMeta.overtimeHours} hrs</span></div>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] p-3">
                <p className="text-xs font-medium text-[var(--text-tertiary)] flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Leave</p>
                <div className="mt-2 space-y-1 text-sm text-[var(--text-primary)]">
                  <div className="flex justify-between"><span>Leave days</span><span className="font-medium">{calcMeta.leaveDays} days</span></div>
                  <div className="flex justify-between"><span>Unpaid days</span><span className="font-medium">{calcMeta.unpaidDays} days</span></div>
                  <div className="flex justify-between"><span>Encashment</span><span className="font-medium">{currencySymbol}{formatCurrency(calcMeta.leaveEncashment)}</span></div>
                  <div className="flex justify-between"><span>Arrears</span><span className="font-medium">{currencySymbol}{formatCurrency(calcMeta.arrears)}</span></div>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] p-3">
                <p className="text-xs font-medium text-[var(--text-tertiary)] flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Approved Expenses</p>
                <div className="mt-2 space-y-1 text-sm text-[var(--text-primary)]">
                  <div className="flex justify-between"><span>Reimbursed</span><span className="font-medium">{currencySymbol}{formatCurrency(calcMeta.expenseReimbursement)}</span></div>
                  <div className="flex justify-between"><span>Items</span><span className="font-medium">{calcMeta.expenseCount}</span></div>
                  <p className="text-xs text-[var(--text-tertiary)] pt-1">Approved/reimbursed expenses dated in this period are added to earnings automatically.</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionTitle title="Earnings" />
          <div className={`${payrollGridClass} mt-3`}>
            <Field label="Basic Salary" help="Gross basic salary in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.basicSalary} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, basicSalary: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="House Rent Allowance" help="HRA in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.hra} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, hra: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Dearness Allowance" help="DA in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.da} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, da: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Conveyance Allowance" help="Conveyance allowance in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.conveyance} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, conveyance: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Medical Allowance" help="Medical allowance in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.medical} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, medical: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Special Allowance" help="Special allowance in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.specialAllowance} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, specialAllowance: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Overtime Pay" help="Overtime earnings in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.overtimePay} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, overtimePay: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Bonus" help="Bonus amount in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.bonus} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, bonus: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Commission" help="Commission earnings in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.commission} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, commission: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Incentive" help="Incentive earnings in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.incentive} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, incentive: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Other Earnings" help="Any other earnings in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.otherEarnings} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, otherEarnings: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Total Earnings" help="Auto-calculated total earnings">
              <input type="number" step="0.01" readOnly className={`${readOnlyCls} text-[#047857]`} value={newPayroll.totalEarnings} />
            </Field>
          </div>
          {editingPayrollId !== null && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
              <p className="text-xs text-amber-800">Changed taxable earnings? Recalculate TDS so the deduction &amp; net pay stay correct.</p>
              <button
                type="button"
                onClick={recalcTax}
                disabled={recalcTaxMutation.isPending}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {recalcTaxMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {recalcTaxMutation.isPending ? 'Recalculating…' : 'Recalculate TDS'}
              </button>
            </div>
          )}
        </section>

        <section>
          <SectionTitle title="Deductions" />
          <div className={`${payrollGridClass} mt-3`}>
            <Field label="Provident Fund Deduction" help="PF deduction in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.pfDeduction} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, pfDeduction: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Employer PF Contribution" help="Employer PF contribution in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.pfEmployerContribution} onChange={e => setNewPayroll({ ...newPayroll, pfEmployerContribution: parseFloat(e.target.value) })} />
            </Field>
            <Field label="ESI Deduction" help="ESI deduction in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.esiDeduction} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, esiDeduction: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="ESI Employer Contribution" help="Employer ESI contribution in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.esiEmployerContribution} onChange={e => setNewPayroll({ ...newPayroll, esiEmployerContribution: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Professional Tax" help="Professional tax deduction in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.professionalTax} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, professionalTax: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Gratuity" help="Gratuity deduction in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.gratuity} onChange={e => setNewPayroll({ ...newPayroll, gratuity: parseFloat(e.target.value) })} />
            </Field>
            <Field label="TDS Deduction" help="TDS / income tax in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.tdsDeduction} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, tdsDeduction: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Income Tax" help="Income tax deduction in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.incomeTax} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, incomeTax: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Tax Surcharge" help="Tax surcharge amount in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.surcharge} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, surcharge: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Cess" help="Cess deduction in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.cess} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, cess: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Loan Installment Deduction" help="Loan installment in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.loanDeduction} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, loanDeduction: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Advance Deduction" help="Advance deduction in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.advanceDeduction} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, advanceDeduction: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Other Deductions" help="Any other deductions in INR">
              <input type="number" step="0.01" className={inputCls} value={newPayroll.otherDeductions} onChange={e => setNewPayroll(applyPayrollCalc({ ...newPayroll, otherDeductions: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Total Deductions" help="Auto-calculated total deductions">
              <input type="number" step="0.01" readOnly className={`${readOnlyCls} text-[#DC2626]`} value={newPayroll.totalDeductions} />
            </Field>
            <Field label="Net Pay" help="Auto-calculated take-home pay">
              <input type="number" step="0.01" readOnly className={`${readOnlyCls} text-[#1C64F2] text-base font-bold`} value={newPayroll.netSalary} />
            </Field>
          </div>
        </section>

        <section>
          <SectionTitle title="Payment Details" />
          <div className={`${payrollGridClass} mt-3`}>
            <Field label="Payment Mode" help="How salary is paid, e.g. bank transfer">
              <select className={inputCls} value={newPayroll.paymentMethod} onChange={e => setNewPayroll({ ...newPayroll, paymentMethod: e.target.value })}>
                <option value="">Select Method</option>
                {paymentMethodOptions.map((opt: { value?: string; label?: string; code?: string; name?: string }) => (
                  <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                ))}
              </select>
            </Field>
            <Field label="Bank Account No" help="Employee bank account number">
              <input className={inputCls} value={newPayroll.bankAccount} onChange={e => setNewPayroll({ ...newPayroll, bankAccount: e.target.value })} />
            </Field>
            <Field label="IFSC Code" help="11-char IFSC code, e.g. SBIN0001234">
              <IfscInput value={newPayroll.ifscCode} onChange={v => setNewPayroll({ ...newPayroll, ifscCode: v })} inputClassName={inputCls} className="w-full" />
            </Field>
            <Field label="Transaction ID" help="Transaction reference ID">
              <input className={inputCls} value={newPayroll.transactionId} onChange={e => setNewPayroll({ ...newPayroll, transactionId: e.target.value })} />
            </Field>
            <Field label="UTR Reference Number" help="Bank UTR reference number">
              <input className={inputCls} value={newPayroll.utrNumber} onChange={e => setNewPayroll({ ...newPayroll, utrNumber: e.target.value })} />
            </Field>
            <Field label="Cheque Number" help="Cheque number if paying by cheque">
              <input className={inputCls} value={newPayroll.checkNumber} onChange={e => setNewPayroll({ ...newPayroll, checkNumber: e.target.value })} />
            </Field>
            <Field label="Payment Date" help="Date the cheque was issued">
              <DatePicker value={newPayroll.checkDate} onChange={(val) => setNewPayroll({ ...newPayroll, checkDate: val })} />
            </Field>
            <Field label="Notes" help="Optional notes about this payroll">
              <input className={inputCls} value={newPayroll.notes} onChange={e => setNewPayroll({ ...newPayroll, notes: e.target.value })} placeholder="Additional notes..." />
            </Field>
            <Field label="Remarks" help="Internal remarks, not shown on payslip">
              <input className={inputCls} value={newPayroll.remarks} onChange={e => setNewPayroll({ ...newPayroll, remarks: e.target.value })} placeholder="Internal remarks..." />
            </Field>
          </div>
        </section>
      </div>
    );
  };

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (payslips.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [payslips, hasLoaded]);

  if (!hasLoaded && isFetching) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header Section */}
        <PageHero
          title="Payroll Management"
          subtitle="Manage salaries, payslips, processing"
          icon={Coins}
          accent="amber"
          breadcrumbs={['HRMS.Pro!', 'Payroll']}
          actions={
            <>
              <button
                onClick={async () => {
                  toast.loading('AI analyzing...', { id: 'ai-pay' });
                  try {
                    await runAutomation('payroll_reconcile', { tab: activeTab });
                    toast.success('AI analysis complete', { id: 'ai-pay' });
                  } catch { toast.error('AI failed', { id: 'ai-pay' }); }
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
                title="AI Automation"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">AI</span>
              </button>
              <ExportButton
                rows={(activeTab === 'payslips' ? filteredPayslips : activeTab === 'bonuses' ? filteredBonuses : []) as unknown[]}
                filename="payroll_export"
                label="Export"
              />
              <button
                onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <button
                onClick={() => {
                  setIsClosing(false);
                  setShowModal(true);
                  setNewPayroll({
                    employeeId: '',
                    month: new Date().getMonth() + 1,
                    year: new Date().getFullYear(),
                    organizationId: '',
                    companyId: '',
                    branchId: '',
                    departmentId: '',
                    basicSalary: 0,
                    hra: 0,
                    da: 0,
                    conveyance: 0,
                    medical: 0,
                    specialAllowance: 0,
                    grossSalary: 0,
                    overtimePay: 0,
                    bonus: 0,
                    commission: 0,
                    incentive: 0,
                    otherEarnings: 0,
                    totalEarnings: 0,
                    pfDeduction: 0,
                    pfEmployerContribution: 0,
                    esiDeduction: 0,
                    esiEmployerContribution: 0,
                    professionalTax: 0,
                    gratuity: 0,
                    tdsDeduction: 0,
                    incomeTax: 0,
                    surcharge: 0,
                    cess: 0,
                    loanDeduction: 0,
                    advanceDeduction: 0,
                    otherDeductions: 0,
                    totalDeductions: 0,
                    netSalary: 0,
                    workingDays: 0,
                    presentDays: 0,
                    absentDays: 0,
                    paidDays: 0,
                    unpaidDays: 0,
                    leaveDays: 0,
                    halfDays: 0,
                    holidayDays: 0,
                    weekOffDays: 0,
                    paymentMethod: '',
                    bankAccount: '',
                    ifscCode: '',
                    transactionId: '',
                    utrNumber: '',
                    checkNumber: '',
                    checkDate: '',
                    notes: '',
                    remarks: ''
                  });
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Payroll</span>
              </button>
            </>
          }
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat, index) => (
            <div key={index} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} iconBg={stat.iconBg} iconColor={stat.iconColor} tooltip={stat.tooltip} trend={stat.trend} onClick={stat.onClick} />
            </div>
          ))}
        </div>

        {/* TABS - Pill Style like Company Page */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[var(--primary-blue)] text-white shadow-md shadow-[#1C64F2]/20'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {runResult && (
          <div className="mb-6 bg-white rounded-2xl border border-[var(--border-color)] p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--text-primary)]">{runResult.message}</p>
              <button onClick={() => setRunResult(null)} className="text-xs text-[var(--primary-blue)] hover:underline">Dismiss</button>
            </div>
            {runResult.generated && runResult.generated.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#059669] mb-1">Generated ({runResult.generated.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {runResult.generated.slice(0, 20).map((g: { name: string }, i: number) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">{g.name}</span>
                  ))}
                  {runResult.generated.length > 20 && <span className="text-[11px] text-[var(--text-tertiary)]">+{runResult.generated.length - 20} more</span>}
                </div>
              </div>
            )}
            {runResult.skipped && runResult.skipped.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#A16207] mb-1">Skipped ({runResult.skipped.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {runResult.skipped.slice(0, 10).map((s: { name: string; reason?: string }, i: number) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700" title={s.reason}>{s.name}</span>
                  ))}
                  {runResult.skipped.length > 10 && <span className="text-[11px] text-[var(--text-tertiary)]">+{runResult.skipped.length - 10} more</span>}
                </div>
              </div>
            )}
            {runResult.emailed && runResult.emailed.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#1d4ed8] mb-1">Emailed ({runResult.emailed.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {runResult.emailed.slice(0, 20).map((g: { name: string }, i: number) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{g.name}</span>
                  ))}
                </div>
              </div>
            )}
            {runResult.emailSkipped && runResult.emailSkipped.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#B45309] mb-1">Not emailed ({runResult.emailSkipped.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {runResult.emailSkipped.slice(0, 10).map((s: { name: string; reason?: string }, i: number) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700" title={s.reason}>{s.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Run Payroll Section */}
        {activeTab === 'run' && (
        <div className="animate-in fade-in duration-300">
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-5 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2]/20 to-[#3B82F6]/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-[var(--primary-blue)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)] text-sm">Run Payroll</h3>
                <p className="text-xs text-[var(--text-tertiary)]">Generate payroll for active employees using your configured policies</p>
              </div>
            </div>
            <button onClick={() => setShowRunHelp(!showRunHelp)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--primary-blue)] bg-blue-50 rounded-lg hover:bg-blue-100">
              <Info className="w-3.5 h-3.5" /> {showRunHelp ? 'Hide guide' : 'How to run payroll'}
            </button>
          </div>

          {showRunHelp && (
            <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#3B82F6] flex items-center justify-center text-white shadow-sm">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0F172A] text-base">Complete Payroll Guide</h3>
                  <p className="text-xs text-[#64748B]">Step-by-step: configure → adjust → run → review → pay</p>
                </div>
              </div>

              {/* Step 1: Configuration */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1C64F2] text-white text-xs font-bold flex items-center justify-center">1</span>
                  Configure (one-time setup)
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Go to the <b>Configuration</b> tab and set up your payroll rules before running anything:</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li><b>Overview</b> — Set the company name, FY start month, and currency.</li>
                    <li><b>Policy</b> — Pro-ration method (how partial months are paid), rounding rules, decimal places.</li>
                    <li><b>Statutory</b> — EPF, ESI, Professional Tax, LWF, Gratuity, Bonus rates and ceilings. Employee share vs Employer share. All values inherit from org defaults — override per template only when needed.</li>
                    <li><b>Tax</b> — Income tax regime (New / Old), slabs, surcharge, cess, HRA rules, 80C/80D caps.</li>
                    <li><b>Compliance</b> — State-wise PT and LWF slabs (versioned, with history). jurisdiction scoping (platform → org → company).</li>
                    <li><b>Components</b> — Salary structure (Basic, HRA, DA, Conveyance, Medical, Special, etc.) with percentage or fixed amounts, priority ordering, taxability, and statutory applicability flags.</li>
                  </ul>
                </div>
              </div>

              {/* Step 2: Assign templates to employees */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1C64F2] text-white text-xs font-bold flex items-center justify-center">2</span>
                  Assign payroll templates to employees
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Go to <b>Employees → Edit → Salary</b> and set:</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li><b>Payroll Template</b> — Choose the template that defines the salary structure, statutory, tax, attendance and policy for this employee.</li>
                    <li><b>Base Salary</b> — Annual CTC. The engine auto-splits it into monthly Basic, HRA, DA, etc. using the template's component percentages.</li>
                    <li><b>Salary Currency</b> — If the employee is paid in a different currency, enter the ISO code (e.g. USD) and the exchange rate (policy currency per 1 unit of employee currency).</li>
                    <li><b>Manual salary mode</b> — Advanced: override individual component amounts (Basic, HRA, etc.) directly. Use when the auto-split doesn't match your needs.</li>
                  </ul>
                </div>
              </div>

              {/* Step 3: Pre-run adjustments */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1C64F2] text-white text-xs font-bold flex items-center justify-center">3</span>
                  Pre-run adjustments (before generating)
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Go to the <b>Payroll Adjustments</b> tab and use the sub-tabs:</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li><b>Bonuses &amp; Incentives</b> — Record one-time bonuses, incentives or commissions. The engine merges them into the payslip at generation time (additive to regular salary).</li>
                    <li><b>Pre-run Deductions</b> — Queue one-time recoveries (canteen, advance, fine). The engine adds them to <i>Other Deductions</i> automatically — no manual entry during the run.</li>
                    <li><b>Loans &amp; Advances</b> — Create salary advances or employee loans. The engine auto-deducts the monthly EMI every payroll run until the balance is zero. Tracks outstanding balance and remaining months.</li>
                  </ul>
                  <p className="text-[#64748B] italic">All adjustments are visible in Preview before you generate, so you can verify before committing.</p>
                </div>
              </div>

              {/* Step 4: Generate */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#F59E0B] text-white text-xs font-bold flex items-center justify-center">4</span>
                  Generate payroll
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Select <b>Company</b>, <b>Branch</b>, <b>Department</b> (leave "All" to run everyone), and the <b>Month/Year</b>.</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li>Click <b>Generate Payroll</b> — creates <b>draft</b> payslips. No email is sent yet.</li>
                    <li>Each payslip shows: gross salary, PF, ESI, PT, LWF, income tax, bonus, loan recovery, other deductions, and net pay.</li>
                    <li>Pre-run adjustments (bonuses, deductions, loans) are automatically included.</li>
                    <li>TDS is calculated cumulatively across the financial year (87A rebate and marginal relief are applied automatically).</li>
                  </ul>
                </div>
              </div>

              {/* Step 5: Review */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#10B981] text-white text-xs font-bold flex items-center justify-center">5</span>
                  Review &amp; edit payslips
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Go to <b>Review &amp; Approve</b> tab. Click any employee row to open the <b>Edit Payroll Record</b> drawer:</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li>Edit earnings, deductions, loan, advance, other deductions, notes.</li>
                    <li>Server recalculates total deductions and net pay instantly — no drift.</li>
                    <li>Click the <b>Explain</b> icon to see why each figure is what it is (rate, version, formula, inputs).</li>
                    <li>Use the <b>Payslip Explainer</b> (Compliance &amp; Rules tab) for a detailed breakdown of any payslip.</li>
                  </ul>
                </div>
              </div>

              {/* Step 6: Process → Approve → Submit */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#8B5CF6] text-white text-xs font-bold flex items-center justify-center">6</span>
                  Process → Approve → Submit
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Status lifecycle — each step is a one-way gate:</p>
                  <div className="flex flex-wrap items-center gap-1.5 my-2 text-[12px] font-medium">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Draft</span>
                    <span className="text-[#94A3B8]">→</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Pending Approval</span>
                    <span className="text-[#94A3B8]">→</span>
                    <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">Approved</span>
                    <span className="text-[#94A3B8]">→</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Processed</span>
                    <span className="text-[#94A3B8]">→</span>
                    <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">Paid</span>
                  </div>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li><b>Process Payroll</b> — moves drafts to <i>Pending Approval</i>.</li>
                    <li><b>Approve Payroll</b> — moves to <i>Approved</i> (final review done).</li>
                    <li><b>Submit Payroll</b> — moves to <i>Processed</i> and appears in the <b>Payslips</b> tab for email, bank file, and marking as paid.</li>
                  </ul>
                </div>
              </div>

              {/* Step 7: Payslips */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#6366F1] text-white text-xs font-bold flex items-center justify-center">7</span>
                  Deliver payslips
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Go to the <b>Payslips</b> tab:</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li><b>Email All</b> — sends payslip PDFs to every employee in the current view.</li>
                    <li>Click any row to open the <b>Payslip Drawer</b> — full breakdown, print, or email individually.</li>
                    <li>Mark payrolls as <i>Paid</i> once the bank transfer is done.</li>
                    <li><b>Bulk Export (ZIP)</b> — downloads Form 16 (Part B) PDFs for all eligible employees (year-end tax certificates).</li>
                  </ul>
                </div>
              </div>

              {/* Re-run / Void */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#DC2626] text-white text-xs font-bold flex items-center justify-center">8</span>
                  Fixing mistakes
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li><b>Re-run Payroll</b> — deletes the selected month's payslips and regenerates fresh drafts. Use after changing salaries, templates, adjustments, or attendance. The database stays clean — no orphan rows.</li>
                    <li><b>Void Payroll</b> — permanently deletes without regenerating. Use when you need to cancel a run entirely.</li>
                    <li>Both are logged in the <b>Run History</b> table below with who did it and when.</li>
                  </ul>
                </div>
              </div>

              {/* Compliance & Rules */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#0EA5E9] text-white text-xs font-bold flex items-center justify-center">9</span>
                  Compliance &amp; Rules (advanced)
                </h4>
                <div className="ml-8 text-[13px] text-[#334155] leading-relaxed space-y-1">
                  <p>Go to the <b>Compliance &amp; Rules</b> tab for:</p>
                  <ul className="list-disc ml-5 space-y-0.5">
                    <li><b>Statutory Rules</b> — publish dated rules (e.g. "PF rate changes to 12.5% from Jul 2026") — the engine applies them automatically based on the effective date.</li>
                    <li><b>Compliance Calendar</b> — track filing due dates for EPF, ESI, PT, LWF (mark as filed when done).</li>
                    <li><b>Tax Planner</b> — per-employee tax comparison (New vs Old regime) based on actual declarations.</li>
                    <li><b>Arrears &amp; Retro</b> — simulate and apply retroactive salary changes (the engine splits arrears across past months and adjusts TDS).</li>
                    <li><b>Bank Payments</b> — create payment batches, download bank files, reconcile.</li>
                    <li><b>Statutory Filings</b> — download EPF ECR, ESI, PT filing-ready files.</li>
                    <li><b>Accounting</b> — post payroll journal entries to your GL, view/reverse journals.</li>
                    <li><b>Payslip Explainer</b> — pick any employee + month → see exactly why each figure is what it is (rule, version, formula, inputs).</li>
                  </ul>
                </div>
              </div>

              <div className="pt-2 border-t border-blue-200">
                <p className="text-[13px] text-[#64748B]">
                  <b>Tip:</b> Preview and Simulate (on the Configuration tab) let you see the effect of changes <i>before</i> generating. The payslip preview (click any employee row) uses the exact same engine as generation — numbers always match.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className={runScopeGridClass}>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Company (legal entity / country)</span>
                <SearchableSelect
                  value={runCompanyId === 'all' ? 'all' : Number(runCompanyId)}
                  onChange={(val) => setRunCompanyId(val.toString())}
                  options={(companies || []).map((c: { id: number; name: string; country?: string }) => ({ id: c.id, name: c.country ? `${c.name} (${c.country})` : c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-full"
                />
                <span className="text-[11px] text-[var(--text-tertiary)]">Restrict to a single company, or run all.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Branch (location)</span>
                <SearchableSelect
                  value={runBranchId === 'all' ? 'all' : Number(runBranchId)}
                  onChange={(val) => setRunBranchId(val.toString())}
                  options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-full"
                />
                <span className="text-[11px] text-[var(--text-tertiary)]">Restrict to a single branch, or run all.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Department</span>
                <SearchableSelect
                  value={runDepartmentId === 'all' ? 'all' : Number(runDepartmentId)}
                  onChange={(val) => setRunDepartmentId(val.toString())}
                  options={(departments || []).map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-full"
                />
                <span className="text-[11px] text-[var(--text-tertiary)]">Restrict to a single department, or run all.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Year</span>
                <input type="number" value={runYear} onChange={e => { const v = e.target.value; if (v.length <= 4) setRunYear(+v); }} aria-label="Year" min="1000" max="9999"
                  className={formInputClass} />
                <span className="text-[11px] text-[var(--text-tertiary)]">The year you are paying salaries for.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Month</span>
                <SearchableSelect
                  value={runMonth}
                  onChange={(val) => setRunMonth(Number(val))}
                  options={monthOptions.map((opt: { value?: string; label?: string; code?: string; name?: string }, idx: number) => ({ id: idx + 1, name: opt.label || opt.name || String(idx + 1) }))}
                  placeholder="Select month"
                  showAllOption={false}
                  preserveOrder
                  className="w-full"
                  disabled={!runYear || runYear < 1000}
                />
                <span className="text-[11px] text-[var(--text-tertiary)]">{runYear && runYear >= 1000 ? 'The month you are paying salaries for.' : 'Please enter year first then select month'}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Actions</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <button onClick={() => setShowGenerateConfirm(true)} disabled={isRunning}
                      className="w-full h-[42px] flex items-center justify-center gap-2 px-3 text-white rounded-xl text-sm font-semibold transition-colors duration-200 disabled:opacity-50 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                      title="Queue draft payslip generation for the selected company/branch and period">
                      {isRunning ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Processing...</> : <><Play className="w-4 h-4 shrink-0" /> Generate Payroll</>}
                    </button>
                    <span className="text-[11px] text-[var(--text-tertiary)] leading-snug">Creates drafted payslips.</span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <button onClick={processAllForPeriod} disabled={pendingRunAction !== null}
                      className="w-full h-[42px] flex items-center justify-center gap-2 px-3 text-white rounded-xl text-sm font-semibold transition-colors duration-200 disabled:opacity-50 bg-gradient-to-r from-[#1C64F2] to-[#3B82F6] hover:from-[#1E40AF] hover:to-[#2563EB]"
                      title="Submit all draft payrolls for processing (draft → pending approval)">
                      {pendingRunAction === 'submit' ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Processing...</> : <><Clock className="w-4 h-4 shrink-0" /> Process Payroll</>}
                    </button>
                    <span className="text-[11px] text-[var(--text-tertiary)] leading-snug">Submits drafts for revision.</span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <button onClick={approveAllForPeriod} disabled={pendingRunAction !== null}
                      className="w-full h-[42px] flex items-center justify-center gap-2 px-3 text-white rounded-xl text-sm font-semibold transition-colors duration-200 disabled:opacity-50 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
                      title="Approve all pending-approval payrolls (pending approval → approved)">
                      {pendingRunAction === 'approve' ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Processing...</> : <><CheckCircle2 className="w-4 h-4 shrink-0" /> Approve Payroll</>}
                    </button>
                    <span className="text-[11px] text-[var(--text-tertiary)] leading-snug">Marks revised payslips as approved.</span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <button onClick={submitAllForPeriod} disabled={pendingRunAction !== null}
                      className="w-full h-[42px] flex items-center justify-center gap-2 px-3 text-white rounded-xl text-sm font-semibold transition-colors duration-200 disabled:opacity-50 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                      title="Move all approved payrolls to the Payslips tab for further action (approved → processed)">
                      {pendingRunAction === 'process' ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Submitting...</> : <><Send className="w-4 h-4 shrink-0" /> Submit Payroll</>}
                    </button>
                    <span className="text-[11px] text-[var(--text-tertiary)] leading-snug">Moves approved payslips to the Payslips tab.</span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <button onClick={() => setShowVoidConfirm(true)} disabled={isRunning || pendingRunAction !== null || voidMutation.isPending}
                      className="w-full h-[42px] flex items-center justify-center gap-2 px-3 text-white rounded-xl text-sm font-semibold transition-colors duration-200 disabled:opacity-50 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                      title="Permanently delete this month's payroll without regenerating">
                      {voidMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Voiding...</> : <><Ban className="w-4 h-4 shrink-0" /> Void Payroll</>}
                    </button>
                    <span className="text-[11px] text-[var(--text-tertiary)] leading-snug">Permanently deletes all payslips for this period.</span>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <button onClick={() => setShowRerunConfirm(true)} disabled={isRunning || pendingRunAction !== null || rerunMutation.isPending}
                      className="w-full h-[42px] flex items-center justify-center gap-2 px-3 text-white rounded-xl text-sm font-semibold transition-colors duration-200 disabled:opacity-50 bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700"
                      title="Wipe this month's payroll and regenerate it from scratch">
                      {rerunMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Re-running...</> : <><RotateCcw className="w-4 h-4 shrink-0" /> Re-run Payroll</>}
                    </button>
                    <span className="text-[11px] text-[var(--text-tertiary)] leading-snug">Deletes and regenerates fresh payslips.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        {/* Run History */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[#F8FAFC]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Run History</h2>
          </div>
          {payrollRuns.length === 0 ? (
            <div className="px-6 py-10 text-center">
  <EmptyState icon={Clock} title="No payroll runs yet" description="Queue one above to get started" />
</div>
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                data={payrollRuns}
                rowKey={(r) => r.runId}
                searchable
                searchKeys={(r) => `${r.runId} ${r.month} ${r.year} ${r.status}`}
                searchPlaceholder="Search runs..."
                emptyMessage="No payroll runs"
                logEntityType="payroll"
                logFor={(r) => ({ id: r.runId, label: `Payroll Run — ${monthLabel(r.month, r.year)}` })}
                actions={(r) => (
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => deleteRunMutation.mutate(r.runId)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete run"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
                columns={[
                  {
                    key: 'requestedBy', header: 'Generated By', sortable: true,
                    render: (r) => (
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(r.requestedBy || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#0F172A]">{r.requestedBy || '—'}</span>
                      </div>
                    ),
                    sortValue: (r) => r.requestedBy || '',
                  },
                  {
                    key: 'submittedBy', header: 'Processed By', sortable: true,
                    render: (r) => r.submittedBy ? (
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {r.submittedBy.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#0F172A]">{r.submittedBy}</span>
                      </div>
                    ) : <span className="text-sm text-[#94A3B8]">—</span>,
                    sortValue: (r) => r.submittedBy || '',
                  },
                  {
                    key: 'approvedBy', header: 'Approved By', sortable: true,
                    render: (r) => r.approvedBy ? (
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#F59E0B] to-[#D97706] flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {r.approvedBy.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#0F172A]">{r.approvedBy}</span>
                      </div>
                    ) : <span className="text-sm text-[#94A3B8]">—</span>,
                    sortValue: (r) => r.approvedBy || '',
                  },
                  {
                    key: 'rerunBy', header: 'Re-run By', sortable: true,
                    render: (r) => r.rerunBy ? (
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#EF4444] to-[#DC2626] flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {r.rerunBy.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#0F172A]">{r.rerunBy}</span>
                      </div>
                    ) : <span className="text-sm text-[#94A3B8]">—</span>,
                    sortValue: (r) => r.rerunBy || '',
                  },
                  { key: 'period', header: 'Period', render: (r) => <span className="text-sm text-[#64748B]">{monthLabel(r.month, r.year)}</span> },
                  {
                    key: 'status', header: 'Status', sortable: true,
                    render: (r) => {
                      const s = r.status || '';
                      if (s === 'running') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700"><Loader2 className="w-3 h-3 animate-spin" />Running</span>;
                      if (s === 'failed') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">Failed</span>;
                      if (s === 'queued') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Queued</span>;
                      const stage = r.rerunBy ? 'Re-run' : r.approvedBy ? 'Approved' : r.submittedBy ? 'Submitted' : r.status === 'disbursed' ? 'Disbursed' : r.status === 'paid' ? 'Paid' : r.status === 'drafted' ? 'Drafted' : r.status === 'revised' ? 'Revised' : 'Generated';
                      const stageCls = stage === 'Re-run' ? 'bg-red-50 text-red-700' : stage === 'Approved' ? 'bg-green-50 text-green-700' : stage === 'Submitted' ? 'bg-violet-50 text-violet-700' : stage === 'Disbursed' ? 'bg-cyan-50 text-cyan-700' : stage === 'Paid' ? 'bg-green-50 text-green-700' : stage === 'Drafted' ? 'bg-slate-50 text-slate-700' : stage === 'Revised' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700';
                      return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${stageCls}`}>{stage}</span>;
                    },
                    sortValue: (r) => (r.rerunBy ? 4 : r.approvedBy ? 3 : r.submittedBy ? 2 : 1),
                  },
                  {
                    key: 'progress', header: 'Progress', sortable: true,
                    render: (r) => {
                      const pct = r.total > 0 ? Math.round((r.processed / r.total) * 100) : 0;
                      return (
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <div className="flex-1 w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${r.status === 'failed' ? 'bg-red-400' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-xs text-[#64748B] whitespace-nowrap">{r.processed}/{r.total}</span>
                        </div>
                      );
                    },
                    sortValue: (r) => (r.total > 0 ? r.processed / r.total : 0),
                  },
                  { key: 'generated', header: 'Generated', align: 'right', render: (r) => <span className="text-sm font-medium text-[#059669]">{r.generated}</span> },
                  { key: 'skipped', header: 'Skipped', align: 'right', render: (r) => <span className="text-sm text-[#A16207]">{r.skipped}</span> },
                  { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="text-sm text-[#1C64F2]">{r.total}</span> },
                  { key: 'approved', header: 'Approved', align: 'right', render: (r) => <span className="text-sm font-medium text-[#059669]">{r.approved}</span> },
                  { key: 'rerun', header: 'Re-runs', align: 'right', render: (r) => <span className="text-sm font-medium text-[#DC2626]">{r.rerun}</span> },
                  {
                    key: 'created', header: 'Started', sortable: true,
                    render: (r) => <span className="text-xs text-[#94A3B8]">{r.createdAt ? formatAppDateTime(r.createdAt) : '-'}</span>,
                    sortValue: (r) => (r.createdAt ? new Date(r.createdAt).getTime() : 0),
                  },
                ]}
              />
            </div>
          )}
        </div>
        </div>
        )}

        {activeTab === 'review' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <SearchableSelect
                value={reviewCompanyId === 'all' ? 'all' : Number(reviewCompanyId)}
                onChange={(val) => setReviewCompanyId(val.toString())}
                options={(companies || []).map((c: { id: number; name: string; country?: string }) => ({ id: c.id, name: c.country ? `${c.name} (${c.country})` : c.name }))}
                placeholder="All Companies"
                allOption="All Companies"
                className="w-40"
              />
              <SearchableSelect
                value={reviewBranchId === 'all' ? 'all' : Number(reviewBranchId)}
                onChange={(val) => setReviewBranchId(val.toString())}
                options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                placeholder="All Branches"
                allOption="All Branches"
                className="w-40"
              />
              <SearchableSelect
                value={reviewDeptId === 'all' ? 'all' : Number(reviewDeptId)}
                onChange={(val) => setReviewDeptId(val.toString())}
                options={(departments || []).map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                placeholder="All Departments"
                allOption="All Departments"
                className="w-40"
              />
              <SearchableSelect
                value={reviewStatus}
                onChange={(val) => setReviewStatus(val.toString())}
                options={[
                  { id: 'all', name: 'All Status' },
                  { id: 'draft', name: 'Draft' },
                  { id: 'pending_approval', name: 'Pending Approval' },
                  { id: 'approved', name: 'Approved' },
                  { id: 'submitted', name: 'Submitted' },
                  { id: 'processed', name: 'Processed' },
                  { id: 'paid', name: 'Paid' },
                ]}
                placeholder="All Status"
                className="w-40"
              />
              <input type="number" value={reviewYear === 'all' ? '' : reviewYear} onChange={e => { const v = e.target.value; setReviewYear(v.length <= 4 && v ? Number(v) : 'all'); }} placeholder="Year" aria-label="Year" min="1000" max="9999"
                className="w-28 px-3 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              <SearchableSelect
                value={reviewMonth}
                onChange={(val) => setReviewMonth(val === 'all' ? 'all' : Number(val))}
                options={[{ id: 'all', name: 'All Months' }, ...monthOptions.map((opt: { value?: string; label?: string; code?: string; name?: string }, idx: number) => ({ id: idx + 1, name: opt.label || opt.name || String(idx + 1) }))]}
                placeholder={reviewYear === 'all' ? 'Select year first' : 'All Months'}
                className="w-40"
                disabled={reviewYear === 'all' || reviewYear < 1000}
              />
              {Boolean(reviewCompanyId !== 'all' || reviewBranchId !== 'all' || reviewDeptId !== 'all' || reviewMonth !== 'all' || reviewYear !== 'all' || reviewStatus !== 'all') && (
                <button
                  onClick={() => { setReviewCompanyId('all'); setReviewBranchId('all'); setReviewDeptId('all'); setReviewMonth('all'); setReviewYear('all'); setReviewStatus('all'); }}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                >
                  <RotateCcw className="w-4 h-4" /> Clear
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
                {isLoading ? (
                  <PayrollLoading />
                ) : (
                  <DataTable
                    data={(payslips as PayslipRecord[]).filter((p) => {
                      if (!RUN_STATUSES.includes(p.status)) return false;
                      if (reviewCompanyId !== 'all' && String(p.companyId || p.company_id) !== reviewCompanyId) return false;
                      if (reviewBranchId !== 'all' && String(p.branchId || p.branch_id) !== reviewBranchId) return false;
                      if (reviewDeptId !== 'all' && String(p.departmentId || p.department_id) !== reviewDeptId) return false;
                      if (reviewMonth !== 'all' && p.month !== reviewMonth) return false;
                      if (reviewYear !== 'all' && p.year !== reviewYear) return false;
                      if (reviewStatus !== 'all' && p.status !== reviewStatus) return false;
                      return true;
                    })}
                    rowKey={(p: PayslipRecord) => p.id}
                    searchable
                    searchKeys={(p: PayslipRecord) => `${p.employeeName} ${p.employeeCode} ${p.companyName} ${p.branchName} ${p.departmentName} ${p.month} ${p.year} ${p.status}`}
                    searchPlaceholder="Search by employee, company, branch, department..."
                    emptyMessage="No payslips in progress for this period yet. Click Generate Payroll in the Run Payroll tab."
                    logEntityType="payroll"
                    logFor={(p: PayslipRecord) => ({ id: p.id, label: `${p.employeeName} — ${monthLabel(p.month, p.year)}` })}
                    persistKey="run-review"
                    defaultDensity="compact"
                    onEdit={(p) => openPayrollEdit(p as PayslipRecord)}
                    columns={[
                      {
                        key: 'employeeName', header: 'Employee', sortable: true, width: '220px',
                        render: (p: PayslipRecord) => (
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="font-semibold text-[#0F172A] text-sm truncate">{p.employeeName}</span>
                                {p.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{p.employeeCode}</span>}
                              </div>
                              <div className="text-xs text-[#64748B] truncate max-w-[220px]">{p.email || ''}</div>
                            </div>
                          </div>
                        ),
                        sortValue: (p: PayslipRecord) => p.employeeName,
                      },
                      { key: 'companyName', header: 'Company', render: (p: PayslipRecord) => <span className="text-sm text-[#64748B]">{p.companyName || '—'}</span> },
                      { key: 'branchName', header: 'Branch', render: (p: PayslipRecord) => <span className="text-sm text-[#64748B]">{p.branchName || '—'}</span> },
                      { key: 'departmentName', header: 'Department', render: (p: PayslipRecord) => <span className="text-sm text-[#64748B]">{p.departmentName || '—'}</span> },
                      { key: 'period', header: 'Period', render: (p: PayslipRecord) => <span className="text-sm text-[#64748B]">{monthLabel(p.month, p.year)}</span> },
                      ...GROSS_COMPONENTS.map(([key, label]) => ({
                        key, header: label, align: 'right' as const,
                        render: (p: PayslipRecord) => <span className="text-sm text-[#1C64F2]">{formatCurrency(Number((p as unknown as Record<string, unknown>)[key]) || 0, currency)}</span>,
                        sortValue: (p: PayslipRecord) => Number((p as unknown as Record<string, unknown>)[key]) || 0,
                      })),
                      { key: 'grossSalary', header: 'Gross Total', align: 'right', sortable: true, render: (p: PayslipRecord) => <span className="text-sm font-semibold text-[#1C64F2]">{formatCurrency(p.grossSalary || 0, currency)}</span>, sortValue: (p: PayslipRecord) => p.grossSalary || 0 },
                      ...DEDUCTION_COMPONENTS.map(([key, label]) => ({
                        key, header: label, align: 'right' as const,
                        render: (p: PayslipRecord) => <span className="text-sm text-[#DC2626]">{formatCurrency(Number((p as unknown as Record<string, unknown>)[key]) || 0, currency)}</span>,
                        sortValue: (p: PayslipRecord) => Number((p as unknown as Record<string, unknown>)[key]) || 0,
                      })),
                      { key: 'totalDeductions', header: 'Deduction Total', align: 'right', render: (p: PayslipRecord) => <span className="text-sm font-semibold text-[#DC2626]">{formatCurrency(p.totalDeductions || 0, currency)}</span> },
                      { key: 'netPay', header: 'Net Pay', align: 'right', sortable: true, render: (p: PayslipRecord) => <span className="text-sm font-semibold text-[#059669]">{formatCurrency(p.netPay || 0, currency)}</span>, sortValue: (p: PayslipRecord) => p.netPay || 0 },
                      { key: 'status', header: 'Status', align: 'center', render: (p: PayslipRecord) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(p.status || '')}`}>{capitalizeStatus(p.status)}</span> },
                    ]}
                    actions={(p: PayslipRecord) => (
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openPayslipPreview(p)} className="p-2 text-[#059669] hover:bg-[#059669]/10 rounded-lg transition-colors" title="View Payslip"><FileText className="w-4 h-4" /></button>
                        {(p.status === 'draft' || p.status === 'pending_approval') && (
                          <button onClick={() => openPayrollEdit(p)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit Payslip"><Edit2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    )}
                  />
                )}
              </div>
          </div>
        )}

        {activeTab === 'payslips' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="px-6 pt-4 pb-0">
              {/* Form 16 / TRACES guidance */}
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold">Form 16 (India):</span> the <b>Form 16</b> / <b>Send</b> buttons issue the employer's
                  <b> Part B computation</b>. Part A — the TDS certificate with the TRACES certificate number — is only valid when issued
                  from <b>traces.gov.in</b> after the employer files <b>Form 24Q</b> using a <b>registered TAN</b>.
                  If no TDS was deducted in the year, a <b>Salary/Service Certificate</b> is issued instead (Form 16 is not applicable under Section 203).
                  Set the organization's <b>TAN</b> &amp; <b>PAN</b> under Settings → Organization for the system to pre-fill them.
                </div>
                <button
                  onClick={bulkDownloadForm16}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 transition-colors"
                  title="Download a ZIP of Form 16 (Part B) PDFs for every eligible employee of the year"
                >
                  <Download className="w-3.5 h-3.5" /> Bulk Export (ZIP)
                </button>
              </div>
            </div>
            {/* Filter Row */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={companyFilter === 'all' ? 'all' : Number(companyFilter)}
                  onChange={(val) => setCompanyFilter(val.toString())}
                  options={(companies || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={branchFilter === 'all' ? 'all' : Number(branchFilter)}
                  onChange={(val) => setBranchFilter(val.toString())}
                  options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={departmentFilter === 'all' ? 'all' : Number(departmentFilter)}
                  onChange={(val) => setDepartmentFilter(val.toString())}
                  options={(departments || []).map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect
                  value={statusFilter === 'all' ? 'all' : statusFilter}
                  onChange={(val) => setStatusFilter(val.toString())}
                  options={(payrollStatusOptions || []).map((opt: { code?: string; value?: string; id?: string | number; name?: string; label?: string }) => ({ id: opt.code || opt.value || opt.id, name: opt.name || opt.label }))}
                  placeholder="All Status"
                  allOption="All Status"
                  className="w-40"
                />
                <DateRangePicker 
                  startDate={startDate} 
                  endDate={endDate} 
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
                  placeholder="Select Date"
                />
                {Boolean(searchTerm || companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setCompanyFilter('all');
                      setBranchFilter('all');
                      setDepartmentFilter('all');
                      setStatusFilter('all');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={bulkEmailPayslips}
                  disabled={isRunning}
                  className="h-[42px] flex items-center gap-2 px-4 border border-blue-600 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
                  title="Email the payslip PDF to every employee in the current view">
                  <Mail className="w-4 h-4" /> {isRunning ? 'Sending...' : 'Email All'}
                </button>
              </div>
            </div>
            <div className="bg-white overflow-hidden">
            {isLoading ? (
              <PayrollLoading />
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  data={filteredPayslips}
                  rowKey={(p: PayslipRecord) => p.id}
                  searchable
                  searchKeys={(p: PayslipRecord) => `${p.employeeName} ${p.employeeCode} ${p.month} ${p.year} ${p.status || ''}`}
                  searchPlaceholder="Search payslips..."
                  emptyMessage="No payslips found for this period"
                  logEntityType="payroll"
                  logFor={(p: PayslipRecord) => ({ id: p.id, label: `${p.employeeName} — ${monthLabel(p.month, p.year)}` })}
                  onEdit={(p) => openPayrollEdit(p as PayslipRecord)}
                  columns={[
                    {
                      key: 'employeeName', header: 'Employee', sortable: true,
                      render: (p: PayslipRecord) => (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-semibold text-[#0F172A] text-sm">{p.employeeName}</span>
                              {p.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{p.employeeCode}</span>}
                            </div>
                            <div className="text-xs text-[#64748B] truncate max-w-[220px]">{p.email || ''}</div>
                          </div>
                        </div>
                      ),
                      sortValue: (p: PayslipRecord) => p.employeeName,
                    },
                    { key: 'period', header: 'Period', render: (p: PayslipRecord) => <span className="text-sm text-[#64748B]">{monthLabel(p.month, p.year)}</span> },
                    { key: 'grossSalary', header: 'Gross Salary', sortable: true, align: 'right', render: (p: PayslipRecord) => <span className="text-sm text-[#64748B]">{formatCurrency(p.grossSalary || 0, currency)}</span>, sortValue: (p: PayslipRecord) => p.grossSalary || 0 },
                    { key: 'deductions', header: 'Deductions', align: 'right', render: (p: PayslipRecord) => <span className="text-sm text-[#DC2626]">{formatCurrency(p.deductions || 0, currency)}</span> },
                    { key: 'netPay', header: 'Net Pay', sortable: true, align: 'right', render: (p: PayslipRecord) => <span className="text-sm font-semibold text-[#059669]">{formatCurrency(p.netPay || 0, currency)}</span>, sortValue: (p: PayslipRecord) => p.netPay || 0 },
                    {
                      key: 'status', header: 'Payroll Status', align: 'center', sortable: true,
                      render: (p: PayslipRecord) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(p.status || '')}`}>{capitalizeStatus(p.status)}</span>,
                      sortValue: (p: PayslipRecord) => p.status,
                    },
                  ]}
                  actions={(p: PayslipRecord) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openPayslipPreview(p)} className="p-2 text-[#059669] hover:bg-[#059669]/10 rounded-lg transition-colors" title="View Payslip"><FileText className="w-4 h-4" /></button>
                      <button onClick={() => downloadPayslipPdf(p)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Download Payslip PDF"><Download className="w-4 h-4" /></button>
                      <button onClick={() => emailPayslipPdf(p)} className="p-2 text-[#7C3AED] hover:bg-[#7C3AED]/10 rounded-lg transition-colors" title="Email Payslip to Employee"><Mail className="w-4 h-4" /></button>
                      <button onClick={() => downloadForm16(p)} className="p-2 text-[#B45309] hover:bg-[#B45309]/10 rounded-lg transition-colors" title="Download Form 16 (India annual TDS certificate)"><Landmark className="w-4 h-4" /></button>
                      <button onClick={() => emailForm16(p)} className="p-2 text-[#B45309] hover:bg-[#B45309]/10 rounded-lg transition-colors" title="Email Form 16 to Employee"><Send className="w-4 h-4" /></button>
                      {p.status === 'draft' && (
                        <button onClick={() => confirmPayrollAction(p, 'pending_approval')}
                          className="p-2 text-[#F59E0B] hover:bg-[#F59E0B]/10 rounded-lg transition-colors" title="Submit for Approval">
                          <Clock className="w-4 h-4" />
                        </button>
                      )}
                      {(p.status === 'draft' || p.status === 'pending_approval') && (
                        <button onClick={() => confirmPayrollAction(p, 'approve')}
                          className="p-2 text-[#10B981] hover:bg-[#10B981]/10 rounded-lg transition-colors" title="Approve">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {(p.status === 'approved' || p.status === 'pending_approval') && (
                        <button onClick={() => confirmPayrollAction(p, 'process')}
                          className="p-2 text-[#7C3AED] hover:bg-[#7C3AED]/10 rounded-lg transition-colors" title="Process (Disburse)">
                          <Wallet className="w-4 h-4" />
                        </button>
                      )}
                      {(p.status === 'processed' || p.status === 'approved') && (
                        <button onClick={() => confirmPayrollAction(p, 'mark_paid')}
                          className="p-2 text-[#059669] hover:bg-[#059669]/10 rounded-lg transition-colors" title="Mark as Paid">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {p.status === 'paid' && (
                        <button onClick={() => confirmPayrollAction(p, 'lock')}
                          className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Lock Payroll Period (close)">
                          <Lock className="w-4 h-4" />
                        </button>
                      )}
                      {p.status === 'locked' && (
                        <button onClick={() => confirmPayrollAction(p, 'reopen')}
                          className="p-2 text-[#F59E0B] hover:bg-[#F59E0B]/10 rounded-lg transition-colors" title="Reopen Payroll Period (maker-checker: different user required)">
                          <Unlock className="w-4 h-4" />
                        </button>
                      )}
                      {(p.status !== 'cancelled' && p.status !== 'paid' && p.status !== 'locked') && (
                        <button onClick={() => confirmPayrollAction(p, 'cancel')}
                          className="p-2 text-[#F59E0B] hover:bg-[#F59E0B]/10 rounded-lg transition-colors" title="Cancel">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                />
              </div>
            )}
            </div>
          </div>
        )}

        {/* CONFIG TAB */}
        {activeTab === 'config' && (
          <div className="animate-in fade-in duration-300 space-y-6">
            <PayrollConfiguration />
          </div>
        )}

        {/* BONUSES TAB */}
        {activeTab === 'pay_items' && (
          <div className="border-b border-[var(--border-color)] mb-5">
            <div className="flex items-center gap-1 -mb-px overflow-x-auto">
              {([
                ['bonuses', 'Bonuses & Incentives'],
                ['deductions', 'Pre-run Deductions'],
                ['loans', 'Loans & Advances'],
              ] as const).map(([id, label]) => (
                <button key={id} onClick={() => setPayItemsSub(id)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    payItemsSub === id
                      ? 'border-[var(--primary-blue)] text-[var(--primary-blue)]'
                      : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'pay_items' && payItemsSub === 'bonuses' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-gradient-to-r from-[#F8FAFC] to-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white shadow-sm">
                  <Award className="w-4 h-4" />
                </div>
                <div>
<h3 className="text-sm font-bold text-[#0F172A]">Bonuses & Incentives</h3>
<p className="text-xs text-[#94A3B8] mt-0.5">One-off bonuses, incentives &amp; commissions — merged into that month's payslip</p>
                </div>
              </div>
              <button onClick={() => { setShowBonusForm(true); setEditingBonus(null); setBonusForm({ employeeId: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), amount: 0, reason: '', type: 'bonus' }); }}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /> Add Payment
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-4 px-6 py-4 border-b border-[var(--border-color)]">
              <SearchableSelect
                value={bonusCompanyFilter === 'all' ? 'all' : Number(bonusCompanyFilter)}
                onChange={(val) => setBonusCompanyFilter(val.toString())}
                options={(companies || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                placeholder="All Companies"
                allOption="All Companies"
                className="w-40"
              />
              <SearchableSelect
                value={bonusBranchFilter === 'all' ? 'all' : Number(bonusBranchFilter)}
                onChange={(val) => setBonusBranchFilter(val.toString())}
                options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                placeholder="All Branches"
                allOption="All Branches"
                className="w-40"
              />
              <SearchableSelect
                value={bonusDeptFilter === 'all' ? 'all' : Number(bonusDeptFilter)}
                onChange={(val) => setBonusDeptFilter(val.toString())}
                options={(departments || []).map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                placeholder="All Departments"
                allOption="All Departments"
                className="w-40"
              />
              <SearchableSelect value={bonusTypeFilter} onChange={(val) => setBonusTypeFilter(val)}
                options={[{ id: 'bonus', name: 'Bonus' }, { id: 'incentive', name: 'Incentive' }, { id: 'commission', name: 'Commission' }]}
                placeholder="All Types" allOption="All Types" className="w-36" />
              <SearchableSelect value={bonusMonthFilter} onChange={(val) => setBonusMonthFilter(val === 'all' ? 'all' : Number(val))}
                options={Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: new Date(2026, i).toLocaleString('en', { month: 'short' }) }))}
                placeholder="All Months" allOption="All Months" className="w-36" />
              <SearchableSelect value={bonusYearFilter} onChange={(val) => setBonusYearFilter(val === 'all' ? new Date().getFullYear() : Number(val))}
                options={[2024, 2025, 2026, 2027].map(y => ({ id: y, name: String(y) }))}
                placeholder="Select Year" allOption="Select Year" className="w-36" />
            </div>
            <div className="overflow-x-auto">
              <DataTable
                data={filteredBonuses}
                rowKey={(b: BonusRecord, i) => b.id ?? i}
                searchable
                searchKeys={(b: BonusRecord) => `${b.employeeName}`}
                searchPlaceholder="Search by employee name..."
                logEntityType="payroll"
                logFor={(b: BonusRecord) => ({ id: b.id ?? `${b.employeeName}-${b.month}/${b.year}`, label: b.employeeName })}
                emptyMessage="No bonuses or incentives recorded yet"
                onDelete={(rows) => {
                  rows.forEach((r) => { if (r.id) deleteBonusMutation.mutate({ id: r.id, type: (r as BonusRecord).type }); });
                }}
                columns={[
                  { key: 'employeeName', header: 'Employee', sortable: true, render: (b: BonusRecord) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-semibold text-[#0F172A] text-sm">{b.employeeName}</span>
                          {b.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{b.employeeCode}</span>}
                        </div>
                        <div className="text-xs text-[#64748B] truncate max-w-[220px]">{b.email || ''}</div>
                      </div>
                    </div>
                  ), sortValue: (b: BonusRecord) => b.employeeName },
                  { key: 'period', header: 'Period', align: 'center', render: (b: BonusRecord) => <span className="text-sm text-[#64748B]">{monthLabel(b.month, b.year)}</span> },
                  { key: 'type', header: 'Type', align: 'center', render: (b: BonusRecord) => (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 capitalize">{b.type || 'bonus'}</span>
                  ), sortValue: (b: BonusRecord) => b.type || 'bonus' },
                  { key: 'amount', header: 'Amount', sortable: true, align: 'right', render: (b: BonusRecord) => <span className="text-sm font-semibold text-[#059669]">{formatCurrency(b.amount, currency)}</span>, sortValue: (b: BonusRecord) => b.amount },
                  { key: 'reason', header: 'Reason', render: (b: BonusRecord) => <span className="text-sm text-[#64748B]">{b.reason || '-'}</span> },
                ]}
                actions={(b: BonusRecord) => (
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => { setEditingBonus({ id: b.id!, type: b.type }); setBonusForm({ employeeId: String(b.employeeId ?? ''), month: b.month || 1, year: b.year || new Date().getFullYear(), amount: b.amount, reason: b.reason || '', type: (b.type as BonusForm['type']) || 'bonus' }); setShowBonusForm(true); }} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit Bonus"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => { if (b.id) deleteBonusMutation.mutate({ id: b.id, type: b.type }); }} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete Bonus"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              />
            </div>
          </div>
        )}

        {activeTab === 'pay_items' && payItemsSub === 'deductions' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-gradient-to-r from-[#F8FAFC] to-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#DC2626] to-[#B91C1C] flex items-center justify-center text-white shadow-sm">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Pre-run Deductions</h3>
                  <p className="text-xs text-[#94A3B8] mt-0.5">One-time recoveries (canteen, advance, fine) &mdash; the payroll engine adds them to Other Deductions at preview &amp; generate</p>
                </div>
              </div>
              <button onClick={() => { setEditingBonus(null); setBonusForm({ employeeId: '', month: runMonth, year: runYear, amount: 0, reason: '', type: 'deduction' }); setShowBonusForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-[#DC2626] text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors">
                <Plus className="w-4 h-4" /> Add Deduction
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-4 px-6 py-4 border-b border-[var(--border-color)]">
              <SearchableSelect
                value={bonusCompanyFilter === 'all' ? 'all' : Number(bonusCompanyFilter)}
                onChange={(val) => setBonusCompanyFilter(val.toString())}
                options={(companies || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                placeholder="All Companies"
                allOption="All Companies"
                className="w-40"
              />
              <SearchableSelect
                value={bonusBranchFilter === 'all' ? 'all' : Number(bonusBranchFilter)}
                onChange={(val) => setBonusBranchFilter(val.toString())}
                options={(branches || []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                placeholder="All Branches"
                allOption="All Branches"
                className="w-40"
              />
              <SearchableSelect
                value={bonusDeptFilter === 'all' ? 'all' : Number(bonusDeptFilter)}
                onChange={(val) => setBonusDeptFilter(val.toString())}
                options={(departments || []).map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                placeholder="All Departments"
                allOption="All Departments"
                className="w-40"
              />
              <SearchableSelect value="deduction" onChange={() => {}}
                options={[{ id: 'deduction', name: 'Deduction' }]}
                placeholder="Type" className="w-36" />
              <SearchableSelect value={bonusMonthFilter} onChange={(val) => setBonusMonthFilter(val === 'all' ? 'all' : Number(val))}
                options={Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: new Date(2026, i).toLocaleString('en', { month: 'short' }) }))}
                placeholder="All Months" allOption="All Months" className="w-36" />
              <SearchableSelect value={bonusYearFilter} onChange={(val) => setBonusYearFilter(val === 'all' ? new Date().getFullYear() : Number(val))}
                options={[2024, 2025, 2026, 2027].map(y => ({ id: y, name: String(y) }))}
                placeholder="Select Year" allOption="Select Year" className="w-36" />
            </div>
            <div className="overflow-x-auto">
              <DataTable
                data={preDeductions}
                rowKey={(row: PreDeductionRow) => row.id}
                searchable
                searchKeys={(row: PreDeductionRow) => `${row.employeeName || ''} ${row.employeeCode || ''} ${row.reason || ''}`}
                searchPlaceholder="Search by employee name or reason..."
                emptyMessage="No pre-run deductions recorded yet"
                columns={[
                  { key: 'employeeName', header: 'Employee', sortable: true, render: (row: PreDeductionRow) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-semibold text-[#0F172A] text-sm">{row.employeeName}</span>
                          {row.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{row.employeeCode}</span>}
                        </div>
                      </div>
                    </div>
                  ), sortValue: (row: PreDeductionRow) => row.employeeName || '' },
                  { key: 'period', header: 'Period', align: 'center', render: () => <span className="text-sm text-[#64748B]">{monthLabel(runMonth, runYear)}</span> },
                  { key: 'type', header: 'Type', align: 'center', render: () => (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700">Deduction</span>
                  ) },
                  { key: 'amount', header: 'Amount', sortable: true, align: 'right', render: (row: PreDeductionRow) => <span className="text-sm font-semibold text-[#DC2626]">-{formatCurrency(row.amount, currency)}</span>, sortValue: (row: PreDeductionRow) => row.amount },
                  { key: 'reason', header: 'Reason', render: (row: PreDeductionRow) => <span className="text-sm text-[#64748B]">{row.reason || '-'}</span> },
                ]}
                actions={(row: PreDeductionRow) => (
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => { setEditingBonus({ id: row.id, type: 'deduction' }); setBonusForm({ employeeId: String(row.employeeId), month: runMonth, year: runYear, amount: row.amount, reason: row.reason || '', type: 'deduction' }); setShowBonusForm(true); }} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => deletePreDeductionMutation.mutate(row.id)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Remove"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              />
            </div>
          </div>
        )}

        {activeTab === 'pay_items' && payItemsSub === 'loans' && <div className="animate-in fade-in duration-300"><LoansAndAdvancesPanel employees={employees} currency={currency} companies={companies} branches={branches} departments={departments} /></div>}

        {activeTab === 'compliance' && <div className="animate-in fade-in duration-300"><PayrollConsole /></div>}
        {activeTab === 'guide' && <div className="animate-in fade-in duration-300"><PayrollJourney activeTab={activeTab} onNavigate={(t) => setActiveTab(t)} /></div>}

      {/* Full Page Drawer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            onClick={handleCloseDrawer}
          />
          <div
            className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${
              isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#7C3AEDbb] flex items-center justify-center text-white shadow-sm">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">{editingPayrollId ? 'Edit Payroll' : 'Process Payroll'}</h2>
                    <p className="text-xs text-[#64748B]">Manage payroll processing details</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleCloseDrawer} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                  <button type="button" onClick={handleSubmitPayroll} disabled={createPayrollMutation.isPending || updatePayrollMutation.isPending} className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2">
                    {(createPayrollMutation.isPending || updatePayrollMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                    {(createPayrollMutation.isPending || updatePayrollMutation.isPending) ? 'Saving...' : (editingPayrollId ? 'Save Changes' : 'Submit Payroll')}
                  </button>
                  <button type="button" onClick={handleCloseDrawer} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Help Text */}
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  {editingPayrollId ? 'Adjust the components below and click Save Changes. Net pay recalculates automatically.' : 'Fill in the payroll details below and click Submit Payroll to save.'}
                </p>
              </div>

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {renderPayrollForm()}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* -- PAYSLIP PREVIEW MODAL -- */}
      {showPayslipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPayslipModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[90vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
            {loadingPayslip ? (
              <PayrollLoading />
            ) : payslipPreview ? (
              <>
                {/* Modal Header */}
                <div className="sticky top-0 bg-white border-b border-[var(--border-color)] px-6 py-4 flex items-center justify-between z-10">
                  <div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">Payslip</h2>
                    <p className="text-sm text-[var(--text-tertiary)]">{payslipPreview.payroll?.month_name} {payslipPreview.payroll?.year} &middot; #{String(payslipPreview.payroll?.id).padStart(6, '0')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => downloadPayslipPdf({ id: payslipPreview.payroll?.id, employeeCode: payslipPreview.employee?.employee_code, month: payslipPreview.payroll?.month, year: payslipPreview.payroll?.year })} className="px-3 py-1.5 text-sm font-medium bg-[var(--primary-blue)] text-white rounded-lg hover:bg-[#1E40AF] transition-colors flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> PDF</button>
                    <button onClick={() => setShowPayslipModal(false)} className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                </div>

                <div className="px-6 py-4 space-y-5">
                  {/* Organization */}
                  <div className="text-center border-b border-[var(--border-color)] pb-3">
                    <h3 className="text-base font-bold text-[var(--text-primary)]">{payslipPreview.organization?.legal_name || payslipPreview.organization?.name}</h3>
                    {(payslipPreview.organization?.address || payslipPreview.organization?.registered_city) && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {[payslipPreview.organization?.address, payslipPreview.organization?.registered_city, payslipPreview.organization?.registered_state].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {(payslipPreview.organization?.pan_no || payslipPreview.organization?.gst_no) && (
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {payslipPreview.organization?.pan_no ? `PAN: ${payslipPreview.organization.pan_no}` : ''}{payslipPreview.organization?.pan_no && payslipPreview.organization?.gst_no ? '  |  ' : ''}{payslipPreview.organization?.gst_no ? `GST: ${payslipPreview.organization.gst_no}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Employee Details */}
                  <div className="bg-[var(--background)] rounded-xl p-4 border border-[var(--border-color)]">
                    <h4 className="text-xs font-semibold text-[var(--primary-blue)] uppercase tracking-wider mb-2">Employee Details</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      {[
                        ['Name', payslipPreview.employee?.name],
                        ['Code', payslipPreview.employee?.employee_code],
                        ['Designation', payslipPreview.employee?.designation],
                        ['Department', payslipPreview.employee?.department],
                        ['PAN', payslipPreview.employee?.pan_number],
                        ['Bank A/c', payslipPreview.employee?.bank_account_number],
                        ['IFSC', payslipPreview.employee?.ifsc_code],
                        ['UAN', payslipPreview.employee?.pf_uan],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex justify-between">
                          <span className="text-[var(--text-tertiary)]">{label}</span>
                          <span className="font-medium text-[var(--text-primary)]">{value || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Earnings Table */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--primary-blue)] uppercase tracking-wider mb-2">Earnings</h4>
                    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                      {[
                        ['Basic Salary', payslipPreview.payroll?.basic_salary],
                        ['House Rent Allowance', payslipPreview.payroll?.hra],
                        ['Dearness Allowance', payslipPreview.payroll?.da],
                        ['Conveyance Allowance', payslipPreview.payroll?.conveyance],
                        ['Medical Allowance', payslipPreview.payroll?.medical],
                        ['Special Allowance', payslipPreview.payroll?.special_allowance],
                        ['Overtime Pay', payslipPreview.payroll?.overtime_pay],
                        ['Bonus', payslipPreview.payroll?.bonus],
                        ['Commission', payslipPreview.payroll?.commission],
                        ['Incentive', payslipPreview.payroll?.incentive],
                        ...((payslipPreview.payroll?.component_breakdown || [])
                          .filter((c: { type?: string; value?: number }) => c.type === 'earnings')
                          .map((c: { display_name?: string; name?: string; value?: number }) => [c.display_name || c.name || 'Earning', c.value || 0] as [string, number])),
                        ['Other Earnings', payslipPreview.payroll?.other_earnings],
                      ].filter(([, v]) => v).map(([label, value], i) => (
                        <div key={String(label)} className={`flex justify-between px-4 py-2 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--background)]'}`}>
                          <span className="text-[var(--text-primary)]">{label}</span>
                          <span className="font-medium text-[var(--success-green)]">{Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-4 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-bold">
                        <span>Gross Earnings</span>
                        <span>{Number(payslipPreview.payroll?.gross_salary || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions Table */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--primary-blue)] uppercase tracking-wider mb-2">Deductions</h4>
                    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                      {[
                        ['Provident Fund', payslipPreview.payroll?.pf_deduction],
                        ['ESI Contribution', payslipPreview.payroll?.esi_deduction],
                        ['Professional Tax', payslipPreview.payroll?.professional_tax],
                        ['LWF Deduction', payslipPreview.payroll?.lwf_deduction],
                        ['Gratuity', payslipPreview.payroll?.gratuity],
                        ['TDS / Income Tax', payslipPreview.payroll?.tds_deduction],
                        ['Loan Deduction', payslipPreview.payroll?.loan_deduction],
                        ['Advance Deduction', payslipPreview.payroll?.advance_deduction],
                        ...((payslipPreview.payroll?.component_breakdown || [])
                          .filter((c: { type?: string; value?: number }) => c.type === 'deduction')
                          .map((c: { display_name?: string; name?: string; value?: number }) => [c.display_name || c.name || 'Deduction', c.value || 0] as [string, number])),
                        ['Other Deductions', payslipPreview.payroll?.other_deductions],
                      ].filter(([, v]) => v).map(([label, value], i) => (
                        <div key={String(label)} className={`flex justify-between px-4 py-2 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--background)]'}`}>
                          <span className="text-[var(--text-primary)]">{label}</span>
                          <span className="font-medium text-[var(--danger-red)]">{Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-4 py-2.5 bg-[#C81E1E] text-white text-sm font-bold">
                        <span>Total Deductions</span>
                        <span>{Number(payslipPreview.payroll?.total_deductions || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Employer Contributions */}
                  {([payslipPreview.payroll?.pf_employer_contribution, payslipPreview.payroll?.esi_employer_contribution, payslipPreview.payroll?.lwf_employer_contribution].some(v => v)) && (
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--success-green)] uppercase tracking-wider mb-2">Employer Contributions</h4>
                      <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
                        {[
                          ['PF Employer', payslipPreview.payroll?.pf_employer_contribution],
                          ['ESI Employer', payslipPreview.payroll?.esi_employer_contribution],
                          ['LWF Employer', payslipPreview.payroll?.lwf_employer_contribution],
                        ].filter(([, v]) => v).map(([label, value], i) => (
                          <div key={String(label)} className={`flex justify-between px-4 py-2 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--background)]'}`}>
                            <span className="text-[var(--text-primary)]">{label}</span>
                            <span className="font-medium text-[var(--success-green)]">{Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Net Pay */}
                  <div className="bg-[var(--primary-blue)] rounded-xl px-6 py-4 text-white text-center">
                    <p className="text-sm opacity-80">Net Pay (Take Home)</p>
                    <p className="text-3xl font-bold mt-1">{Number(payslipPreview.payroll?.net_salary || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>

                  {/* Attendance Summary */}
                  <div className="bg-[var(--background)] rounded-xl p-4 border border-[var(--border-color)]">
                    <h4 className="text-xs font-semibold text-[var(--primary-blue)] uppercase tracking-wider mb-2">Attendance Summary</h4>
                    <div className="grid grid-cols-6 gap-4 text-center">
                      {[
                        ['Working', payslipPreview.payroll?.working_days],
                        ['Present', payslipPreview.payroll?.present_days],
                        ['Absent', payslipPreview.payroll?.absent_days],
                        ['Paid', payslipPreview.payroll?.paid_days],
                        ['Unpaid', payslipPreview.payroll?.unpaid_days],
                        ['Leave', payslipPreview.payroll?.leave_days],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{value || 0}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="text-center border-t border-[var(--border-color)] pt-3">
                    <p className="text-xs text-[var(--text-disabled)]">This is a computer-generated payslip and does not require a physical signature.</p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* BONUS FORM MODAL */}
      {showBonusForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center">
              <h2 className="text-lg font-semibold">{editingBonus ? 'Edit Payment' : bonusForm.type === 'deduction' ? 'Queue Pre-run Deduction' : 'Record Bonus / Incentive'}</h2>
              <button onClick={() => setShowBonusForm(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <FormGrid className={payrollGridClass}>
                <FormField label="Type" help="What this one-off payment is">
                  <SearchableSelect
                    value={bonusForm.type}
                    onChange={(v) => setBonusForm({ ...bonusForm, type: v as BonusForm['type'] })}
                    options={[
                      { id: 'bonus', name: 'Bonus' },
                      { id: 'incentive', name: 'Incentive' },
                      { id: 'commission', name: 'Commission' },
                      { id: 'deduction', name: 'Other Deduction (pre-run)' },
                    ]}
                    placeholder="Select Type"
                    showAllOption={false}
                    className="w-full"
                  />
                </FormField>
                <FormField label="Employee" help="Employee receiving the payment">
                  <EmployeeSelectWithFilters
                    status="active"
                    companies={companies}
                    value={bonusForm.employeeId || 'all'}
                    onChange={(id: string | number | 'all') => setBonusForm({...bonusForm, employeeId: String(id)})}
                  />
                </FormField>
                <FormField label="Month" help="Month the bonus applies to">
                  <SearchableSelect
                    value={bonusForm.month}
                    onChange={(v) => setBonusForm({...bonusForm, month: Number(v)})}
                    options={Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: new Date(0, i).toLocaleString('en', { month: 'long' }) }))}
                    placeholder="Select Month"
                    showAllOption={false}
                    className="w-full"
                  />
                </FormField>
                <FormField label="Year" help="Year the bonus applies to">
                  <input type="number" value={bonusForm.year} onChange={e => setBonusForm({...bonusForm, year: parseInt(e.target.value) || 2026})}
                    className={formInputClass} />
                </FormField>
                <FormField label="Amount" help="Amount in INR — added to this month's take-home pay">
                  <input type="number" step="0.01" value={bonusForm.amount} onChange={e => setBonusForm({...bonusForm, amount: parseFloat(e.target.value) || 0})}
                    className={formInputClass} />
                </FormField>
                <FormField label="Reason" help="Reason for this payment (kept for audit)">
                  <input type="text" value={bonusForm.reason} onChange={e => setBonusForm({...bonusForm, reason: e.target.value})}
                    className={formInputClass} />
                </FormField>
              </FormGrid>
              <button onClick={saveBonus}
                className="w-full h-[42px] bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
                {editingBonus ? 'Save Changes' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      {showBulkUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Bulk Upload Payroll</h2>
              <button onClick={() => setShowBulkUpload(false)} className="p-2 hover:bg-[var(--background)] rounded-lg"><X className="w-5 h-5 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Instructions:</strong><br />
                  1. Download the template first<br />
                  2. Fill in your data in the CSV file<br />
                  3. Upload the filled CSV file<br />
                  <strong>Required columns:</strong> employeeId, month, year, basicSalary, hra, da, conveyance, medical, specialAllowance, overtimePay, bonus, pfDeduction, esiDeduction, professionalTax, tdsDeduction, status<br />
                </p>
                <button
                  onClick={() => {
                    const csv = 'employeeId,month,year,basicSalary,hra,da,conveyance,medical,specialAllowance,overtimePay,bonus,pfDeduction,esiDeduction,professionalTax,tdsDeduction,status\n1,1,2026,25000,12000,0,2000,1500,3000,0,0,1800,0,200,1000,draft\n';
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'payroll_template.csv';
                    a.click(); URL.revokeObjectURL(url);
                  }}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBulkUpload(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => uploadFile && bulkUploadMutation.mutate(uploadFile)}
                  disabled={!uploadFile || bulkUploadMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {bulkUploadMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Upload'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmActionModal
        isOpen={!!payrollConfirm}
        onCancel={() => setPayrollConfirm(null)}
        onConfirm={() => {
          if (payrollConfirm) {
            if (payrollConfirm.p === null) {
              const cfg =
                payrollConfirm.action === 'bulk-submit' ? { statusAction: 'pending_approval', pending: 'submit' as const } :
                payrollConfirm.action === 'bulk-approve' ? { statusAction: 'approve', pending: 'approve' as const } :
                { statusAction: 'process', pending: 'process' as const };
              setPendingRunAction(cfg.pending);
              payrollStatusMutation.mutate({ ids: payrollConfirm.ids, action: cfg.statusAction });
            } else {
              payrollStatusMutation.mutate({ ids: [payrollConfirm.p.id], action: payrollConfirm.action });
            }
            setPayrollConfirm(null);
          }
        }}
        variant={
          (payrollConfirm && payrollConfirm.p === null
            ? (payrollConfirm.action === 'bulk-submit' ? 'default' : payrollConfirm.action === 'bulk-approve' ? 'success' : 'purple')
            : (payrollConfirm?.action === 'cancel' ? 'warning' : 'success')) as 'default' | 'danger' | 'success' | 'warning'
        }
        title={
          payrollConfirm && payrollConfirm.p === null
            ? (payrollConfirm.action === 'bulk-submit' ? 'Submit for Processing' : payrollConfirm.action === 'bulk-approve' ? 'Approve Payroll' : 'Submit Payroll')
            : (ACTION_LABELS[payrollConfirm?.action || ''] || 'Update Payroll')
        }
        confirmLabel={
          payrollConfirm && payrollConfirm.p === null
            ? (payrollConfirm.action === 'bulk-submit' ? 'Submit All' : payrollConfirm.action === 'bulk-approve' ? 'Approve All' : 'Submit to Payslips')
            : (ACTION_LABELS[payrollConfirm?.action || ''] || 'Confirm')
        }
        message={
          payrollConfirm && payrollConfirm.p === null
            ? (payrollConfirm.action === 'bulk-submit'
              ? `You are about to submit ${payrollConfirm.count} payroll record(s) for ${monthLabel(payrollConfirm.month, payrollConfirm.year)} for processing (draft → pending approval).`
              : payrollConfirm.action === 'bulk-approve'
                ? `You are about to approve ${payrollConfirm.count} payroll record(s) for ${monthLabel(payrollConfirm.month, payrollConfirm.year)} (pending approval → approved).`
                : `You are about to submit ${payrollConfirm.count} payroll record(s) for ${monthLabel(payrollConfirm.month, payrollConfirm.year)} to the Payslips tab for further action (approved → processed).`)
            : (payrollConfirm?.p
              ? `You are about to ${(ACTION_LABELS[payrollConfirm.action] || payrollConfirm.action).toLowerCase()} ${payrollConfirm.p.employeeName || 'this employee'}'s payslip for ${monthLabel(payrollConfirm.p.month, payrollConfirm.p.year)}.`
              : '')
        }
        consequence={
          payrollConfirm && payrollConfirm.p === null
            ? (payrollConfirm.action === 'bulk-submit'
              ? 'Each draft record moves to Pending Approval. Records not in draft status are skipped.'
              : payrollConfirm.action === 'bulk-approve'
                ? 'Each record moves to Approved. Records not in draft or pending approval are skipped.'
                : 'Each approved record moves to Processed and appears in the Payslips tab. Records not in approved status are skipped.')
            : (payrollConfirm?.action === 'cancel'
              ? "The payslip will be cancelled and its status will be updated to 'Cancelled'."
              : (payrollConfirm?.action === 'lock'
                ? "The payroll period will be LOCKED. No further edits or regenerations are allowed until it is reopened. Locking posts the accounting journal if not already posted."
                : (payrollConfirm?.action === 'reopen'
                  ? "The payroll period will be REOPENED. Per maker-checker policy, the user who locked it cannot reopen it — a different user must confirm."
                  : "The payslip status will be updated to reflect the selected action.")))
        }
      />

      <ConfirmActionModal
        isOpen={showFinalizeConfirm}
        onCancel={() => setShowFinalizeConfirm(false)}
        onConfirm={() => finalizeMutation.mutate()}
        variant="warning"
        title="Finalize Attendance"
        confirmLabel="Yes, Finalize"
        message={`You are about to finalize the attendance, leave & holiday records for ${runCompanyId === 'all' ? 'all companies' : 'the selected company'} for ${monthLabel(runMonth, runYear)}.`}
        consequence="Employee payroll for this period will be calculated from the finalized records. This marks the period as reviewed — you can still reopen it later if corrections are needed."
        isPending={finalizeMutation.isPending}
      />

      <ConfirmActionModal
        isOpen={showGenerateConfirm}
        onCancel={() => setShowGenerateConfirm(false)}
        onConfirm={() => { setShowGenerateConfirm(false); runPayrollAll(); }}
        variant="warning"
        title="Generate Payroll"
        confirmLabel="Yes, Generate"
        message={`You are about to generate draft payslips for ${runCompanyId === 'all' ? 'all companies' : 'the selected company'} for ${monthLabel(runMonth, runYear)}.`}
        consequence="This creates draft payslips only — no emails are sent. The payslips will be stored in the Payslips tab for your review. Review them, then use Process Payroll to submit and Approve Payroll to approve."
        isPending={isRunning}
      />
      <ConfirmActionModal
        isOpen={showVoidConfirm}
        onCancel={() => setShowVoidConfirm(false)}
        onConfirm={() => voidMutation.mutate()}
        variant="danger"
        title="Void Payroll"
        confirmLabel="Yes, Void Payroll"
        message={`You are about to permanently delete ALL payroll data for ${runCompanyId === 'all' ? 'all companies' : 'the selected company'} for ${monthLabel(runMonth, runYear)}.`}
        consequence="Every payslip for this period (draft, approved, processed or paid) will be permanently deleted. This cannot be undone. Use this to clean up a mistaken run."
        isPending={voidMutation.isPending}
      />

      <ConfirmActionModal
        isOpen={showRerunConfirm}
        onCancel={() => setShowRerunConfirm(false)}
        onConfirm={() => rerunMutation.mutate()}
        variant={'info' as unknown as 'default'}
        title="Re-run Payroll"
        confirmLabel="Yes, Regenerate"
        message={`You are about to wipe ALL payroll data for ${runCompanyId === 'all' ? 'all companies' : 'the selected company'} for ${monthLabel(runMonth, runYear)} and regenerate it from scratch.`}
        consequence="Every payslip for this period (draft, approved, processed or paid) will be permanently deleted and recreated. Use this only after you have corrected the mismatch in salary, attendance or components."
        isPending={rerunMutation.isPending}
      />
    </div>
  );
};


export default Payroll;

interface LoanRow {
  id: number;
  employeeId?: number;
  employeeName?: string;
  loanType: string;
  principalAmount: number;
  monthlyDeduction: number;
  remainingMonths: number;
  startMonth: number;
  startYear: number;
  status: string;
}

function LoansAndAdvancesPanel({ employees, currency, companies, branches, departments }: { employees: EmployeePickerItem[]; currency: string; companies?: Array<{ id: number; name: string }>; branches?: Array<{ id: number; name: string }>; departments?: Array<{ id: number; name: string }> }) {
  const queryClient = useQueryClient();
  const [empId] = useState<number | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [formEmployeeId, setFormEmployeeId] = useState<number | ''>('');
  const [form, setForm] = useState({
    loanType: 'loan', principalAmount: 0, monthlyDeduction: 0, totalMonths: 12,
    startMonth: new Date().getMonth() + 1, startYear: new Date().getFullYear(), notes: '',
  });
  const [loanCompanyFilter, setLoanCompanyFilter] = useState<string | number>('all');
  const [loanBranchFilter, setLoanBranchFilter] = useState<string | number>('all');
  const [loanDeptFilter, setLoanDeptFilter] = useState<string | number>('all');
  const [loanStatusFilter, setLoanStatusFilter] = useState<string | number>('all');
  const [loanMonthFilter, setLoanMonthFilter] = useState<number | 'all'>(new Date().getMonth() + 1);
  const [loanYearFilter, setLoanYearFilter] = useState(new Date().getFullYear());

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['salary-loans', empId],
    queryFn: async () => {
      const params: Record<string, unknown> = {};
      if (empId) params.employeeId = empId;
      const r = await api.get('/payroll/loans', { params });
      return r.data || [];
    },
  });

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/payroll/loans', payload),
    onSuccess: () => { toast.success('Loan/advance created'); queryClient.invalidateQueries({ queryKey: ['salary-loans'] }); setShowForm(false); },
    onError: (e: unknown) => { const err = e as { response?: { data?: { detail?: string } } }; toast.error(err.response?.data?.detail || 'Failed'); },
  });

  const closeMut = useMutation({
    mutationFn: (id: number) => api.post(`/payroll/loans/${id}/close`),
    onSuccess: () => { toast.success('Loan closed'); queryClient.invalidateQueries({ queryKey: ['salary-loans'] }); },
    onError: () => toast.error('Failed to close loan'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/payroll/loans/${id}`),
    onSuccess: () => { toast.success('Loan deleted'); queryClient.invalidateQueries({ queryKey: ['salary-loans'] }); },
    onError: () => toast.error('Failed to delete loan'),
  });

  const columns: DataTableColumn<LoanRow>[] = [
    ...(empId === '' ? [{
      key: 'employeeName', header: 'Employee', sortable: true,
      render: (l: LoanRow) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-[#0F172A] text-sm">{l.employeeName || `#${l.employeeId}`}</span>
          </div>
        </div>
      ),
      sortValue: (l: LoanRow) => l.employeeName || '',
    }] : []),
    {
      key: 'loanType', header: 'Type', sortable: true,
      render: (l: LoanRow) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${l.loanType === 'loan' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
          {l.loanType === 'loan' ? 'Loan' : 'Advance'}
        </span>
      ),
      sortValue: (l: LoanRow) => l.loanType,
    },
    {
      key: 'principalAmount', header: 'Principal', sortable: true, align: 'right',
      render: (l: LoanRow) => <span className="text-sm font-medium text-[#0F172A]">{formatCurrency(l.principalAmount, currency)}</span>,
      sortValue: (l: LoanRow) => l.principalAmount,
    },
    {
      key: 'monthlyDeduction', header: 'Monthly Deduction', sortable: true, align: 'right',
      render: (l: LoanRow) => <span className="text-sm font-semibold text-[#DC2626]">-{formatCurrency(l.monthlyDeduction, currency)}/mo</span>,
      sortValue: (l: LoanRow) => l.monthlyDeduction,
    },
    {
      key: 'remainingMonths', header: 'Months Left', sortable: true, align: 'center',
      render: (l: LoanRow) => <span className="text-sm text-[#64748B]">{l.remainingMonths}</span>,
      sortValue: (l: LoanRow) => l.remainingMonths,
    },
    {
      key: 'start', header: 'Start', sortable: true, align: 'center',
      render: (l: LoanRow) => <span className="text-sm text-[#64748B]">{l.startMonth}/{l.startYear}</span>,
      sortValue: (l: LoanRow) => `${l.startYear}-${String(l.startMonth).padStart(2, '0')}`,
    },
    {
      key: 'status', header: 'Status', sortable: true, align: 'center',
      render: (l: LoanRow) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${l.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {capitalizeStatus(l.status)}
        </span>
      ),
      sortValue: (l: LoanRow) => l.status,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)] bg-gradient-to-r from-[#F8FAFC] to-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] flex items-center justify-center text-white shadow-sm">
            <HandCoins className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">Loans & Advances</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Salary advances and employee loans &mdash; auto-deducted each month via amortization</p>
          </div>
        </div>
        <button onClick={() => { setFormEmployeeId(empId === '' ? '' : empId); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Loan / Advance
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-4 px-6 py-4 border-b border-[var(--border-color)]">
        <SearchableSelect
          value={loanCompanyFilter}
          onChange={(val) => setLoanCompanyFilter(val)}
          options={(companies || []).map((c) => ({ id: c.id, name: c.name }))}
          placeholder="All Companies"
          allOption="All Companies"
          className="w-40"
        />
        <SearchableSelect
          value={loanBranchFilter}
          onChange={(val) => setLoanBranchFilter(val)}
          options={(branches || []).map((b) => ({ id: b.id, name: b.name }))}
          placeholder="All Branches"
          allOption="All Branches"
          className="w-40"
        />
        <SearchableSelect
          value={loanDeptFilter}
          onChange={(val) => setLoanDeptFilter(val)}
          options={(departments || []).map((d) => ({ id: d.id, name: d.name }))}
          placeholder="All Departments"
          allOption="All Departments"
          className="w-40"
        />
        <SearchableSelect
          value={loanStatusFilter}
          onChange={(val) => setLoanStatusFilter(val)}
          options={[{ id: 'active', name: 'Active' }, { id: 'closed', name: 'Closed' }]}
          placeholder="All Status"
          allOption="All Status"
          className="w-36"
        />
        <SearchableSelect value={loanMonthFilter} onChange={(val) => setLoanMonthFilter(val === 'all' ? 'all' : Number(val))}
          options={Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: new Date(2026, i).toLocaleString('en', { month: 'short' }) }))}
          placeholder="All Months" allOption="All Months" className="w-36" />
        <SearchableSelect value={loanYearFilter} onChange={(val) => setLoanYearFilter(val === 'all' ? new Date().getFullYear() : Number(val))}
          options={[2024, 2025, 2026, 2027].map(y => ({ id: y, name: String(y) }))}
          placeholder="Select Year" allOption="Select Year" className="w-36" />
      </div>

      {isLoading ? (
        <PayrollLoading />
      ) : (
        <DataTable
          data={loans}
          columns={columns}
          rowKey={(l: LoanRow) => l.id}
          searchable
          searchKeys={(l: LoanRow) => `${l.employeeName || ''} ${l.loanType || ''} ${l.status || ''}`}
          searchPlaceholder="Search loans..."
          emptyMessage={empId === '' ? 'No loans or advances yet.' : 'No loans or advances for this employee.'}
          logEntityType="loan"
          logFor={(l: LoanRow) => ({ id: l.id, label: `${l.loanType} loan` })}
          bulkActions={[
            {
              label: 'Delete',
              icon: Trash2,
              variant: 'danger',
              onAction: (items) => {
                items.forEach((l: LoanRow) => deleteMut.mutate(l.id));
              },
            },
          ]}
          actions={(l: LoanRow) => (
            <div className="flex items-center justify-end gap-1.5">
              {l.status === 'active' && (
                <button onClick={() => closeMut.mutate(l.id)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Close loan">
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => deleteMut.mutate(l.id)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl">
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center">
              <h3 className="font-semibold text-[var(--text-primary)]">Add Loan / Advance</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-50 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5">
              <FormGrid className={payrollGridClass}>
              {formEmployeeId === '' && (
                <div className="col-span-full">
                  <FormField label="Employee" help="Employee receiving the loan or advance">
                    <SearchableSelect
                      value={formEmployeeId}
                      onChange={(v) => setFormEmployeeId(v === '' ? '' : Number(v))}
                      options={employees.map((e) => ({ id: e.id, name: formatEmployeeLabel(e) }))}
                      placeholder="Select employee"
                      showAllOption={false}
                      className="w-full"
                    />
                  </FormField>
                </div>
              )}
              <FormField label="Type" help="Loan or salary advance">
                <select value={form.loanType} onChange={e => setForm({ ...form, loanType: e.target.value })} className={formInputClass}>
                  <option value="loan">Loan</option>
                  <option value="advance">Advance</option>
                </select>
              </FormField>
              <FormField label="Principal Amount" help="Total loan or advance amount">
                <input type="number" value={form.principalAmount} onChange={e => setForm({ ...form, principalAmount: +e.target.value })} className={formInputClass} />
              </FormField>
              <FormField label="Monthly Deduction" help="Amount deducted each payroll month">
                <input type="number" value={form.monthlyDeduction} onChange={e => setForm({ ...form, monthlyDeduction: +e.target.value })} className={formInputClass} />
              </FormField>
              <FormField label="Total Months" help="Repayment duration in months">
                <input type="number" value={form.totalMonths} onChange={e => setForm({ ...form, totalMonths: +e.target.value })} className={formInputClass} />
              </FormField>
              <FormField label="Start Month" help="First deduction month (1–12)">
                <input type="number" min={1} max={12} value={form.startMonth} onChange={e => setForm({ ...form, startMonth: +e.target.value })} className={formInputClass} />
              </FormField>
              <FormField label="Start Year" help="First deduction year">
                <input type="number" value={form.startYear} onChange={e => setForm({ ...form, startYear: +e.target.value })} className={formInputClass} />
              </FormField>
              <FormField label="Notes" help="Optional notes about this loan">
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={formInputClass} />
              </FormField>
              </FormGrid>
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button onClick={() => { const targetEmp = formEmployeeId === '' ? null : formEmployeeId; if (!targetEmp) { toast.error('Select an employee'); return; } createMut.mutate({ ...form, employeeId: targetEmp }); }} disabled={createMut.isPending}
                className="flex-1 h-[42px] bg-[var(--primary-blue)] text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {createMut.isPending ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 h-[42px] border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




