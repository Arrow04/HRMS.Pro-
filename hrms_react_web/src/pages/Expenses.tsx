import { useState, useEffect, type ReactNode } from 'react';
import {
  Plus, Receipt, CheckCircle2, XCircle, RotateCcw, Clock, Search, CloudCog, X,
  TrendingUp, Filter, Wallet, FileText, Download, Coins, Upload, Loader2, Info, MapPin, CreditCard, Award, Settings, Tags, ListChecks, User
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { normalizePickerEmployee, toEmployeeSelectOptions } from '../utils/employeePickerUtils';
import toast from 'react-hot-toast';
import { getCurrencySymbol, formatCurrency, getAppCurrency } from '../services/currencyService';
import DateRangePicker from '../components/DateRangePicker';
import DatePicker from '../components/DatePicker';
import SearchableSelect from '../components/SearchableSelect';
import FormField, { formInputClass, formTextareaClass } from '../components/FormField';
import FormGrid from '../components/FormGrid';
import EmployeeScopedCascade from '../components/EmployeeScopedCascade';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatsCard from '../components/StatsCard';
import { getStatusBadgeClass, capitalizeStatus } from '../utils/statusUtils';
import { formatAppDate } from '../services/appSettingsService';
import Tooltip from '../components/Tooltip';
import ConfirmActionModal from '../components/ConfirmActionModal';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import type { Expense, Employee, Company, Department, Branch } from '../types';

type MasterDataOption = {
  value?: string;
  code?: string;
  label?: string;
  name?: string;
};

type ExpenseRow = Expense & {
  company_id?: number;
  branch_id?: number;
  department_id?: number;
  date?: string;
  employeeCode?: string;
  email?: string;
};

/** Coerces API amounts (number or numeric string) to a plain number so stat cards animate. */
const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Top-level page tabs
const EXPENSE_TABS = [
  { id: 'records', label: 'Expense Records', icon: CreditCard },
  { id: 'approved', label: 'Approved', icon: CheckCircle2 },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
  { id: 'config', label: 'Configuration', icon: Settings },
];

const Expenses = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('records');
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'approve' | 'reject'; items: ExpenseRow[] } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState(getAppCurrency());
  const [isClosing, setIsClosing] = useState(false);
  // All backend fields for Expense model
  const [newExpense, setNewExpense] = useState({
    employeeId: '',
    category: '',
    amount: '',
    description: '',
    date: '',
    expenseDate: '',
    currency: 'INR',
    receipt: null as File | null,
    organizationId: '',
    companyId: '',
    branchId: '',
    departmentId: '',
    projectId: '',
    location: '',
    vendor: '',
    invoiceNumber: '',
    taxAmount: 0,
    taxInclusive: false,
    paymentMethod: '',
    billable: false,
    clientId: '',
    justification: '',
    notes: ''
  });

  useEffect(() => {
    setMounted(true);
    // Set currency to INR
    setCurrency('INR');
  }, []);

  const currencySymbol = getCurrencySymbol(currency);

  const [includeInactive, setIncludeInactive] = useState(false);

  const { data: expenses = [], isLoading, isFetching } = useQuery({
    queryKey: ['expenses', includeInactive],
    queryFn: async () => {
      try {
        const response = await api.get('/expenses', { params: { includeInactive } });
        return response.data || [];
      } catch (error) { throw error; }
    },
    staleTime: 2 * 60 * 1000,
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
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { try { const r = await api.get('/departments'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const getCompanyName = (id?: number) => companies.find((c: Company) => c.id === id)?.name || '-';
  const getBranchName = (id?: number) => branches.find((b: Branch) => b.id === id)?.name || '-';
  const getDeptName = (id?: number) => departments.find((d: Department) => d.id === id)?.name || '-';

  const { data: stats = { total: 0, totalAmount: 0, pending: 0, pendingAmount: 0, approved: 0, approvedAmount: 0, thisMonth: 0, thisMonthAmount: 0 } } = useQuery({
    queryKey: ['expense-stats', includeInactive],
    queryFn: async () => {
      try {
        const response = await api.get('/expenses/stats', { params: { includeInactive } });
        return response.data || { total: 0, totalAmount: 0, pending: 0, pendingAmount: 0, approved: 0, approvedAmount: 0, thisMonth: 0, thisMonthAmount: 0 };
      } catch (error) { throw error; }
    },
  });

  // Master data for expense categories
  
  const { data: pickerEmployees = [] } = useEmployeePicker({ status: 'active' });
  const employees = pickerEmployees.map(normalizePickerEmployee);

  const { data: expenseCategoryOptions = [] } = useMasterData('EXPENSE_CATEGORY');
  
  const { data: paymentMethodOptions = [] } = useMasterData('EXPENSE_PAYMENT_METHOD');
  const { data: isBillableOptions = [] } = useMasterData('IS_BILLABLE');
  const { data: expenseStatusOptions = [] } = useMasterData('EXPENSE_STATUS');

  const submitMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const formData = new FormData();
      Object.keys(payload).forEach(key => formData.append(key, payload[key] as string | Blob));
      return api.post('/expenses', formData);
    },
    onSuccess: () => {
      toast.success('Expense submitted');
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setShowModal(false);
      setNewExpense({ employeeId: '', category: '', amount: '', description: '', date: '', expenseDate: '', currency: 'INR', receipt: null, organizationId: '', companyId: '', branchId: '', departmentId: '', projectId: '', location: '', vendor: '', invoiceNumber: '', taxAmount: 0, taxInclusive: false, paymentMethod: '', billable: false, clientId: '', justification: '', notes: '' });
    },
    onError: () => toast.error('Failed to submit expense')
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => api.put(`/expenses/${id}/approve`),
    onSuccess: () => { toast.success('Expense approved'); queryClient.invalidateQueries({ queryKey: ['expenses'] }); },
    onError: () => toast.error('Failed to approve')
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => api.put(`/expenses/${id}/reject`),
    onSuccess: () => { toast.success('Expense rejected'); queryClient.invalidateQueries({ queryKey: ['expenses'] }); },
    onError: () => toast.error('Failed to reject')
  });

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/expenses/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: (data: { data?: { created?: number; updated?: number } }) => {
      toast.success(`Bulk upload completed: ${data.data?.created || 0} created, ${data.data?.updated || 0} updated`);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setShowBulkUpload(false);
      setUploadFile(null);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Bulk upload failed: ${err.response?.data?.message || err.message}`);
    }
  });

  // Export expenses data
  // Download template function
  const downloadTemplate = async () => {
    try {
      const response = await api.get('/expenses/template', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'expense_bulk_upload_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  
  const employeeOptions = toEmployeeSelectOptions(pickerEmployees);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...newExpense,
      expenseDate: newExpense.date,
      employeeId: Number(newExpense.employeeId),
    };
    submitMutation.mutate(payload);
  };

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
      setNewExpense({ employeeId: '', category: '', amount: '', description: '', date: '', expenseDate: '', currency: 'INR', receipt: null, organizationId: '', companyId: '', branchId: '', departmentId: '', projectId: '', location: '', vendor: '', invoiceNumber: '', taxAmount: 0, taxInclusive: false, paymentMethod: '', billable: false, clientId: '', justification: '', notes: '' });
    }, 300);
  };

  const renderExpenseForm = () => {
    const Field = FormField;
    const SectionTitle = ({ title }: { title: string }) => (
      <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
        <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> {title}
      </h3>
    );
    return (
      <>
        <section>
          <SectionTitle title="Employee & Dates" />
          <EmployeeScopedCascade
            companies={companies as unknown as Array<Record<string, any>>}
            companyId={newExpense.companyId ? String(newExpense.companyId) : ''}
            branchId={newExpense.branchId ? String(newExpense.branchId) : ''}
            departmentId={newExpense.departmentId ? String(newExpense.departmentId) : ''}
            employeeId={newExpense.employeeId ? String(newExpense.employeeId) : ''}
            onScopeChange={(patch) => setNewExpense((prev) => ({ ...prev, ...patch }))}
            onCompanyChange={(val) => setNewExpense((prev) => ({ ...prev, companyId: val }))}
            onBranchChange={(val) => setNewExpense((prev) => ({ ...prev, branchId: val }))}
            onDepartmentChange={(val) => setNewExpense((prev) => ({ ...prev, departmentId: val }))}
            onEmployeeChange={(val) => setNewExpense((prev) => ({ ...prev, employeeId: val }))}
            extra={
              <>
                <Field label="Category" required help="Expense category, e.g. Travel">
                  <select className={formInputClass} value={newExpense.category} onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}>
                    <option value="">Select Category</option>
                    {expenseCategoryOptions.map((opt: MasterDataOption) => (
                      <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Date" required help="Date of the expense">
                  <DatePicker value={newExpense.date || newExpense.expenseDate} onChange={(val) => setNewExpense({ ...newExpense, date: val, expenseDate: val })} />
                </Field>
              </>
            }
          />
        </section>

        <section>
          <SectionTitle title="Amount & Payment" />
          <FormGrid className="mt-3">
            <Field label={`Amount (${currencySymbol})`} required help="Expense amount in INR">
              <input type="number" step="0.01" className={formInputClass} value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} />
            </Field>
            <Field label="Payment Mode" help="How the expense was paid">
              <select className={formInputClass} value={newExpense.paymentMethod} onChange={e => setNewExpense({ ...newExpense, paymentMethod: e.target.value })}>
                <option value="">Select method</option>
                {paymentMethodOptions.map((opt: MasterDataOption) => (
                  <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                ))}
              </select>
            </Field>
            <Field label="Taxable Amount" help="Tax portion of the amount">
              <input type="number" step="0.01" className={formInputClass} value={newExpense.taxAmount} onChange={e => setNewExpense({ ...newExpense, taxAmount: parseFloat(e.target.value) })} />
            </Field>
          </FormGrid>
        </section>

        <section>
          <SectionTitle title="Details" />
          <FormGrid className="mt-3">
            <Field label="Purpose" required help="Describe the purpose of the expense">
              <textarea className={formTextareaClass} value={newExpense.description} onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} />
            </Field>
            <Field label="Notes" help="Additional notes for the expense">
              <textarea className={formTextareaClass} value={newExpense.notes} onChange={e => setNewExpense({ ...newExpense, notes: e.target.value })} placeholder="Additional notes..." />
            </Field>
            <Field label="Remarks" help="Justification for the expense">
              <textarea className={formTextareaClass} value={newExpense.justification} onChange={e => setNewExpense({ ...newExpense, justification: e.target.value })} placeholder="Justification for this expense..." />
            </Field>
          </FormGrid>
        </section>

        <section>
          <SectionTitle title="Additional Details" />
          <FormGrid className="mt-3">
            <Field label="Location" help="Where the expense occurred">
              <input className={formInputClass} value={newExpense.location} onChange={e => setNewExpense({ ...newExpense, location: e.target.value })} placeholder="e.g. New York office" />
            </Field>
            <Field label="Vendor" help="Vendor or merchant name">
              <input className={formInputClass} value={newExpense.vendor} onChange={e => setNewExpense({ ...newExpense, vendor: e.target.value })} placeholder="e.g. Uber, Amazon" />
            </Field>
            <Field label="Invoice Number" help="Invoice or receipt number">
              <input className={formInputClass} value={newExpense.invoiceNumber} onChange={e => setNewExpense({ ...newExpense, invoiceNumber: e.target.value })} placeholder="e.g. INV-12345" />
            </Field>
            <Field label="Tax Inclusive" help="Whether amount includes tax">
              <select className={formInputClass} value={newExpense.taxInclusive ? 'true' : 'false'} onChange={e => setNewExpense({ ...newExpense, taxInclusive: e.target.value === 'true' })}>
                {isBillableOptions.map((opt: MasterDataOption) => (
                  <option key={(opt.value || opt.code)} value={(opt.value || opt.code) === 'yes' ? 'true' : 'false'}>{(opt.label || opt.name)}</option>
                ))}
              </select>
            </Field>
            <Field label="Billable to Client" help="Whether billable to a client">
              <select className={formInputClass} value={newExpense.billable ? 'true' : 'false'} onChange={e => setNewExpense({ ...newExpense, billable: e.target.value === 'true' })}>
                {isBillableOptions.map((opt: MasterDataOption) => (
                  <option key={(opt.value || opt.code)} value={(opt.value || opt.code) === 'yes' ? 'true' : 'false'}>{(opt.label || opt.name)}</option>
                ))}
              </select>
            </Field>
            <Field label="Client ID" help="Client ID to bill the expense">
              <input type="number" className={formInputClass} value={newExpense.clientId} onChange={e => setNewExpense({ ...newExpense, clientId: e.target.value })} placeholder="Client ID" />
            </Field>
          </FormGrid>
        </section>
      </>
    );
  };

  const filteredExpenses = expenses.filter((e: ExpenseRow) => {
    const matchSearch = !searchTerm ||
      e.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCompany = companyFilter === 'all' || e.company_id?.toString() === companyFilter;
    const matchBranch = branchFilter === 'all' || e.branch_id?.toString() === branchFilter;
    const matchDept = departmentFilter === 'all' || e.department_id?.toString() === departmentFilter;
    // Records tab shows in-flight claims (pending / in_progress / submitted), not terminal states
    const eStatus = (e.status || '').toLowerCase();
    const matchStatus = statusFilter === 'all'
      ? (eStatus !== 'approved' && eStatus !== 'rejected' && eStatus !== 'paid')
      : eStatus === statusFilter.toLowerCase();
    
    const expDate = e.date || e.expenseDate;
    const matchStart = !startDate || (expDate && expDate >= startDate);
    const matchEnd = !endDate || (expDate && expDate <= endDate);

    return matchSearch && matchCompany && matchBranch && matchDept && matchStatus && matchStart && matchEnd;
  });

  const approvedExpenses = expenses.filter((e: ExpenseRow) => (e.status || '').toLowerCase() === 'approved');
  const rejectedExpenses = expenses.filter((e: ExpenseRow) => (e.status || '').toLowerCase() === 'rejected');

  const hasActiveFilters = Boolean(searchTerm || companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all' || startDate !== '' || endDate !== '');

  const statCards = [
    { label: 'Total (Rs.)', value: num(stats.totalAmount ?? stats.total), icon: CreditCard, color: 'blue', onClick: () => { setActiveTab('records'); setStatusFilter('all'); } },
    { label: 'Pending (Rs.)', value: num(stats.pendingAmount), icon: Clock, color: 'orange', onClick: () => { setActiveTab('records'); setStatusFilter('pending'); } },
    { label: 'Approved (Rs.)', value: num(stats.approvedAmount), icon: CheckCircle2, color: 'green', onClick: () => { setActiveTab('approved'); setStatusFilter('all'); } },
    { label: 'This Month (Rs.)', value: num(stats.thisMonthAmount), icon: Wallet, color: 'purple', onClick: () => { setActiveTab('records'); setStatusFilter('all'); } },
  ];

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (expenses.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [expenses, hasLoaded]);

  const isInitialExpenseLoading = !hasLoaded && isFetching;
  if (isInitialExpenseLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">
        {/* Header Section */}
        <PageHero
          title="Expense Management"
          subtitle="Track and manage employee expense claims"
          icon={CreditCard}
          accent="rose"
          breadcrumbs={['HRMS.Pro!', 'Expenses']}
          actions={
            <>
              <ExportButton
                rows={filteredExpenses}
                filename="expenses_export"
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
                  setNewExpense({
                    employeeId: '', category: '', amount: '', description: '', date: '', expenseDate: '', currency: 'INR', receipt: null, organizationId: '', companyId: '', branchId: '', departmentId: '', projectId: '', location: '', vendor: '', invoiceNumber: '', taxAmount: 0, taxInclusive: false, paymentMethod: '', billable: false, clientId: '', justification: '', notes: ''
                  });
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl font-semibold text-sm shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Submit Expense</span>
              </button>
            </>
          }
        />

          {/* Stats Grid (always visible above tabs) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {statCards.map((stat, index) => (
              <div key={index} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
                <StatsCard icon={stat.icon} label={stat.label} value={stat.value} color={stat.color} onClick={stat.onClick} />
              </div>
            ))}
          </div>

          {/* TABS - Pill Style */}
          <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              {EXPENSE_TABS.map((tab) => (
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

          {activeTab === 'records' && (
          <div className="space-y-6">
          {/* TABLE */}
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* FILTERS */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={companyFilter === 'all' ? 'all' : Number(companyFilter)}
                  onChange={(val) => setCompanyFilter(val.toString())}
                  options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={branchFilter === 'all' ? 'all' : Number(branchFilter)}
                  onChange={(val) => setBranchFilter(val.toString())}
                  options={(branches || []).map((b: Branch) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={departmentFilter === 'all' ? 'all' : Number(departmentFilter)}
                  onChange={(val) => setDepartmentFilter(val.toString())}
                  options={(departments || []).map((d: Department) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect
                  value={statusFilter === 'all' ? 'all' : statusFilter}
                  onChange={(val) => setStatusFilter(val.toString())}
                  options={(expenseStatusOptions || []).map((opt: MasterDataOption) => ({ id: opt.code || opt.value || '', name: opt.name || opt.label || opt.code || '' }))}
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
                {hasActiveFilters && (
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
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-white text-sm cursor-pointer hover:bg-[#F8FAFC] transition-colors" title="Show expenses for deactivated/terminated employees too">
                  <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
                    className="w-4 h-4 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-[#1C64F2]" />
                  <span className="text-xs text-[#64748B]">Include deactivated</span>
                </label>
              </div>
            </div>
          <div className="bg-white overflow-hidden">
          {isLoading ? (
            <div className="animate-page-enter"><PageSkeleton /></div>
          ) : (
            <DataTable
              data={filteredExpenses}
              rowKey={(exp: ExpenseRow) => exp.id}
              searchable
              searchKeys={(exp: ExpenseRow) => `${exp.employeeName} ${exp.category} ${exp.description || ''} ${exp.status || ''} ${getCompanyName(exp.company_id)} ${getBranchName(exp.branch_id)} ${getDeptName(exp.department_id)}`}
              searchPlaceholder="Search expenses..."
              emptyMessage="No expense claims found" persistKey="expenses"
              logEntityType="expense"
              logFor={(exp: ExpenseRow) => ({ id: exp.id, label: exp.description || `Expense #${exp.id}` })}
              bulkActions={[
                {
                  label: 'Approve',
                  icon: CheckCircle2,
                  variant: 'success',
                  onAction: (items) => {
                    setConfirmTarget({ type: 'approve', items });
                  },
                },
                {
                  label: 'Reject',
                  icon: XCircle, RotateCcw,
                  variant: 'danger',
                  onAction: (items) => {
                    setConfirmTarget({ type: 'reject', items });
                  },
                },
              ]}
              columns={[
                {
                  key: 'employeeName', header: 'Employee', sortable: true,
                  render: (exp: ExpenseRow) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-semibold text-[#0F172A] text-sm">{exp.employeeName}</span>
                          {exp.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{exp.employeeCode}</span>}
                        </div>
                        <div className="text-xs text-[#64748B] truncate max-w-[220px]">{exp.email || ''}</div>
                      </div>
                    </div>
                  ),
                  sortValue: (exp: ExpenseRow) => exp.employeeName,
                },
                { key: 'companyName', header: 'Company', sortable: true, render: (exp: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getCompanyName(exp.company_id)}</span>, sortValue: (exp: ExpenseRow) => getCompanyName(exp.company_id) },
                { key: 'branchName', header: 'Branch', sortable: true, render: (exp: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getBranchName(exp.branch_id)}</span>, sortValue: (exp: ExpenseRow) => getBranchName(exp.branch_id) },
                { key: 'departmentName', header: 'Department', sortable: true, render: (exp: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getDeptName(exp.department_id)}</span>, sortValue: (exp: ExpenseRow) => getDeptName(exp.department_id) },
                { key: 'createdAt', header: 'Submitted', sortable: true, render: (exp: ExpenseRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{formatAppDate(exp.createdAt)}</span>, sortValue: (exp: ExpenseRow) => exp.createdAt || '' },
                { key: 'category', header: 'Category', sortable: true, render: (exp: ExpenseRow) => <span className="text-sm text-[#64748B] capitalize">{exp.category}</span>, sortValue: (exp: ExpenseRow) => exp.category },
                { key: 'description', header: 'Description', render: (exp: ExpenseRow) => <span className="text-sm text-[#64748B] truncate max-w-xs block">{exp.description}</span> },
                { key: 'amount', header: 'Amount', sortable: true, align: 'right', render: (exp: ExpenseRow) => <span className="text-sm font-semibold text-[#0F172A]">{formatCurrency(exp.amount || 0, currency)}</span>, sortValue: (exp: ExpenseRow) => exp.amount || 0 },
                {
                  key: 'status', header: 'Expense Status', align: 'center',
                  render: (exp: ExpenseRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(exp.status || '')}`}>{capitalizeStatus(exp.status)}</span>,
                },
              ]}
              actions={(exp: ExpenseRow) => (
                exp.status?.toLowerCase() === 'pending' ? (
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => approveMutation.mutate(exp.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#10B981] text-white rounded-lg text-xs font-semibold hover:bg-[#059669] transition-colors" title="Approve expense">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => rejectMutation.mutate(exp.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F59E0B] text-white rounded-lg text-xs font-semibold hover:bg-[#D97706] transition-colors" title="Reject expense">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                ) : undefined
              )}
            />
            )}
          </div>
        </div>
      </div>
          )}

          {/* APPROVED TAB */}
          {activeTab === 'approved' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
                      <CheckCircle2 className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Approved Expenses</h3>
                      <p className="text-xs text-[#94A3B8]">Expense claims that have been approved</p>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    {approvedExpenses.length} approved
                  </span>
                </div>
                <DataTable
                  data={approvedExpenses}
                  rowKey={(e: ExpenseRow) => e.id}
                  logEntityType="expense"
                  logFor={(e: ExpenseRow) => ({ id: e.id, label: e.description || `Expense #${e.id}` })}
                  searchable
                  searchKeys={(e: ExpenseRow) => `${e.employeeName || ''} ${e.category || ''} ${e.description || ''} ${getCompanyName(e.company_id)} ${getBranchName(e.branch_id)} ${getDeptName(e.department_id)}`}
                  searchPlaceholder="Search approved expenses..."
                  emptyMessage="No approved expenses"
                  columns={[
                    {
                      key: 'employeeName', header: 'Employee', sortable: true,
                      render: (e: ExpenseRow) => (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                            {(e.employeeName || 'E')[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-medium text-[#0F172A] text-sm">{e.employeeName}</span>
                              {e.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{e.employeeCode}</span>}
                            </div>
                            <div className="text-xs text-[#64748B] truncate max-w-[220px]">{e.email || ''}</div>
                          </div>
                        </div>
                      ),
                      sortValue: (e: ExpenseRow) => e.employeeName,
                    },
                    { key: 'companyName', header: 'Company', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getCompanyName(e.company_id)}</span>, sortValue: (e: ExpenseRow) => getCompanyName(e.company_id) },
                    { key: 'branchName', header: 'Branch', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getBranchName(e.branch_id)}</span>, sortValue: (e: ExpenseRow) => getBranchName(e.branch_id) },
                    { key: 'departmentName', header: 'Department', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getDeptName(e.department_id)}</span>, sortValue: (e: ExpenseRow) => getDeptName(e.department_id) },
                    { key: 'createdAt', header: 'Submitted', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{formatAppDate(e.createdAt)}</span>, sortValue: (e: ExpenseRow) => e.createdAt || '' },
                    { key: 'category', header: 'Category', render: (e: ExpenseRow) => <span className="text-sm text-[#64748B] capitalize">{e.category}</span> },
                    { key: 'description', header: 'Description', render: (e: ExpenseRow) => <span className="text-sm text-[#64748B] truncate max-w-xs block">{e.description}</span> },
                    { key: 'amount', header: 'Amount', align: 'right', render: (e: ExpenseRow) => <span className="text-sm font-semibold text-[#0F172A]">{formatCurrency(e.amount || 0, currency)}</span> },
                    { key: 'date', header: 'Date', render: (e: ExpenseRow) => <span className="text-sm text-[#64748B]">{e.date || e.expenseDate ? String(e.date || e.expenseDate).split('T')[0] : '-'}</span> },
                    { key: 'status', header: 'Status', render: (e: ExpenseRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(e.status || '')}`}>{capitalizeStatus(e.status)}</span> },
                  ]}
                />
              </div>
            </div>
          )}

          {/* REJECTED TAB */}
          {activeTab === 'rejected' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-sm">
                      <XCircle className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Rejected Expenses</h3>
                      <p className="text-xs text-[#94A3B8]">Expense claims that have been rejected</p>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold">
                    {rejectedExpenses.length} rejected
                  </span>
                </div>
                <DataTable
                  data={rejectedExpenses}
                  rowKey={(e: ExpenseRow) => e.id}
                  logEntityType="expense"
                  logFor={(e: ExpenseRow) => ({ id: e.id, label: e.description || `Expense #${e.id}` })}
                  searchable
                  searchKeys={(e: ExpenseRow) => `${e.employeeName || ''} ${e.category || ''} ${e.description || ''} ${getCompanyName(e.company_id)} ${getBranchName(e.branch_id)} ${getDeptName(e.department_id)}`}
                  searchPlaceholder="Search rejected expenses..."
                  emptyMessage="No rejected expenses"
                  columns={[
                    {
                      key: 'employeeName', header: 'Employee', sortable: true,
                      render: (e: ExpenseRow) => (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-red-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                            {(e.employeeName || 'E')[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-medium text-[#0F172A] text-sm">{e.employeeName}</span>
                              {e.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{e.employeeCode}</span>}
                            </div>
                            <div className="text-xs text-[#64748B] truncate max-w-[220px]">{e.email || ''}</div>
                          </div>
                        </div>
                      ),
                      sortValue: (e: ExpenseRow) => e.employeeName,
                    },
                    { key: 'companyName', header: 'Company', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getCompanyName(e.company_id)}</span>, sortValue: (e: ExpenseRow) => getCompanyName(e.company_id) },
                    { key: 'branchName', header: 'Branch', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getBranchName(e.branch_id)}</span>, sortValue: (e: ExpenseRow) => getBranchName(e.branch_id) },
                    { key: 'departmentName', header: 'Department', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#0F172A]">{getDeptName(e.department_id)}</span>, sortValue: (e: ExpenseRow) => getDeptName(e.department_id) },
                    { key: 'createdAt', header: 'Submitted', sortable: true, render: (e: ExpenseRow) => <span className="text-sm text-[#64748B] whitespace-nowrap">{formatAppDate(e.createdAt)}</span>, sortValue: (e: ExpenseRow) => e.createdAt || '' },
                    { key: 'category', header: 'Category', render: (e: ExpenseRow) => <span className="text-sm text-[#64748B] capitalize">{e.category}</span> },
                    { key: 'description', header: 'Description', render: (e: ExpenseRow) => <span className="text-sm text-[#64748B] truncate max-w-xs block">{e.description}</span> },
                    { key: 'amount', header: 'Amount', align: 'right', render: (e: ExpenseRow) => <span className="text-sm font-semibold text-[#0F172A]">{formatCurrency(e.amount || 0, currency)}</span> },
                    { key: 'date', header: 'Date', render: (e: ExpenseRow) => <span className="text-sm text-[#64748B]">{e.date || e.expenseDate ? String(e.date || e.expenseDate).split('T')[0] : '-'}</span> },
                    { key: 'status', header: 'Status', render: (e: ExpenseRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(e.status || '')}`}>{capitalizeStatus(e.status)}</span> },
                  ]}
                />
              </div>
            </div>
          )}

          {/* CONFIGURATION TAB */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              {/* Expense Categories */}
              <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] flex items-center justify-center text-white shadow-sm">
                      <Tags className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Expense Categories</h3>
                      <p className="text-xs text-[#94A3B8]">Manage the values from the Master Data page (Settings ? Master Data ? EXPENSE_CATEGORY)</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {expenseCategoryOptions.length === 0 ? (
                    <p className="text-sm text-[#94A3B8] text-center py-8">No expense categories configured. Add them in Settings ? Master Data ? EXPENSE_CATEGORY.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {expenseCategoryOptions.map((cat: MasterDataOption) => (
                        <div key={String(cat.code || cat.value || cat.name || cat.label)} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-color)] bg-[#F8FAFC]">
                          <span className="w-9 h-9 rounded-lg bg-white border border-[var(--border-color)] flex items-center justify-center text-[#7C3AED]">
                            <Tags className="w-4 h-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-[#0F172A]">{cat.name || cat.label || cat.code}</p>
                            <p className="text-xs text-[#94A3B8]">{cat.code}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#1C64F2] flex items-center justify-center text-white shadow-sm">
                      <CreditCard className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-[#0F172A]">Payment Methods</h4>
                      <p className="text-xs text-[#94A3B8]">Manage the values from the Master Data page (EXPENSE_PAYMENT_METHOD)</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {paymentMethodOptions.length === 0 ? (
                      <p className="text-xs text-[#94A3B8]">No payment methods configured</p>
                    ) : (
                      paymentMethodOptions.map((opt: MasterDataOption) => (
                        <div key={String(opt.code || opt.value)} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)]">
                          <span className="text-sm text-[#0F172A]">{opt.name || opt.label || opt.code}</span>
                          <span className="text-xs text-[#94A3B8]">{opt.code}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white shadow-sm">
                      <Clock className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-[#0F172A]">Expense Statuses</h4>
                      <p className="text-xs text-[#94A3B8]">Manage the values from the Master Data page (EXPENSE_STATUS)</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {expenseStatusOptions.length === 0 ? (
                      <p className="text-xs text-[#94A3B8]">No statuses configured</p>
                    ) : (
                      expenseStatusOptions.map((opt: MasterDataOption) => (
                        <div key={String(opt.code || opt.value)} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)]">
                          <span className="text-sm text-[#0F172A]">{opt.name || opt.label || opt.code}</span>
                          <span className={`status-badge ${(String(opt.code || '')).toLowerCase()}`}>{opt.code}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] flex items-center justify-center text-white shadow-sm">
                      <Settings className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-[#0F172A]">Reimbursable</h4>
                      <p className="text-xs text-[#94A3B8]">Manage the values from the Master Data page (IS_BILLABLE)</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {isBillableOptions.length === 0 ? (
                      <p className="text-xs text-[#94A3B8]">No billable options configured</p>
                    ) : (
                      isBillableOptions.map((opt: MasterDataOption) => (
                        <div key={String(opt.code || opt.value)} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)]">
                          <span className="text-sm text-[#0F172A]">{opt.name || opt.label || opt.code}</span>
                          <span className="text-xs text-[#94A3B8]">{opt.code}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-4">Manage these options in Settings ? Master Data.</p>
                </div>
              </div>
            </div>
          )}

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
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#10B981bb] flex items-center justify-center text-white shadow-sm">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">Submit Expense</h2>
                    <p className="text-xs text-[#64748B]">Fill in the expense details below</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="expense-form"
                    disabled={submitMutation.isPending}
                    className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
                  >
                    {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitMutation.isPending ? 'Saving...' : 'Submit Expense'}
                  </button>
                  <Tooltip id="btn-close-expense" content="Close">
                    <button
                      onClick={handleCloseDrawer}
                      className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Help Text */}
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-4 h-4 inline mr-1" />
                  Fill in the expense details below and click Submit Expense to save.
                </p>
              </div>

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
                  {renderExpenseForm()}
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      <Modal
        isOpen={showBulkUpload}
        onClose={() => { setShowBulkUpload(false); setUploadFile(null); }}
        title="Bulk Upload Expenses"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Instructions:</strong>
              <br />1. Download the template first
              <br />2. Fill in your data in the CSV file
              <br />3. Upload the filled CSV file
              <br />4. Existing items will be updated, new items will be created
              <br />
              <strong>Required columns:</strong> employee_id, category, amount, description, date
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl hover:bg-[#059669] transition-all duration-200"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowBulkUpload(false); setUploadFile(null); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => uploadFile && bulkUploadMutation.mutate(uploadFile)}
              disabled={!uploadFile || bulkUploadMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {bulkUploadMutation.isPending ? (
                null
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmActionModal
        isOpen={!!confirmTarget}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) {
            if (confirmTarget.type === 'approve') {
              confirmTarget.items.forEach((e: ExpenseRow) => approveMutation.mutate(e.id));
            } else {
              confirmTarget.items.forEach((e: ExpenseRow) => rejectMutation.mutate(e.id));
            }
            setConfirmTarget(null);
          }
        }}
        variant={confirmTarget?.type === 'approve' ? 'success' : 'warning'}
        title={confirmTarget?.type === 'approve' ? 'Approve Expense' : 'Reject Expense'}
        confirmLabel={confirmTarget?.type === 'approve' ? 'Approve' : 'Reject'}
        message={
          confirmTarget
            ? confirmTarget.items.length === 1
              ? `You are about to ${confirmTarget.type} the expense for ${confirmTarget.items[0].employeeName}.`
              : `You are about to ${confirmTarget.type} ${confirmTarget.items.length} selected expenses.`
            : ''
        }
        consequence={
          confirmTarget?.type === 'approve'
            ? 'The expense will be marked as approved and included in the employee\'s reimbursable total.'
            : 'The expense will be marked as rejected and will not be reimbursed.'
        }
      />
    </div>
    </div>
  );
};

export default Expenses;




