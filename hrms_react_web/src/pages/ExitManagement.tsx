import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  DoorOpen, Calculator, ClipboardCheck, User,
  CheckCircle, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Download, FileText, Loader2, Search, Archive,
  Plus, Edit2, Trash2, X, Users, TrendingUp, Upload, Sparkles, LogOut, Info, Save
} from 'lucide-react';

import api from '../services/api';
import { formatAppDate } from '../services/appSettingsService';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import BulkDeleteModal from '../components/BulkDeleteModal';
import SearchableSelect from '../components/SearchableSelect';
import DatePicker from '../components/DatePicker';
import DateRangePicker from '../components/DateRangePicker';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { normalizePickerEmployee, formatEmployeeLabel } from '../utils/employeePickerUtils';
import ConfirmActionModal from '../components/ConfirmActionModal';
import { runAutomation } from '../services/aiAutomation';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import type { Employee, Company, Department, Branch, OnboardingTask } from '../types';

interface ExitRecord {
  id: number;
  employeeId?: number | string;
  employeeName?: string;
  email?: string;
  employeeCode?: string;
  designation?: string;
  companyId?: number;
  companyName?: string;
  branchId?: number;
  branchName?: string;
  departmentId?: number;
  departmentName?: string;
  exitType?: string;
  exitDate?: string;
  lastWorkingDay?: string;
  reason?: string;
  noticePeriodServed?: string;
  fnfStatus?: string;
  fnfCompletedAt?: string;
  clearanceStatus?: string;
  clearanceCompletedAt?: string;
  approvalStatus?: string;
  monthlySalary?: number;
  base_salary?: number;
}

interface FnfResult {
  exitId?: number;
  employeeName?: string;
  yearsOfService?: number;
  monthlySalary?: number;
  leaveBalance?: number;
  gratuity?: number;
  leaveEncashment?: number;
  noticeDeduction?: number;
  otherEarnings?: number;
  otherDeductions?: number;
  salaryUntilLastWorkingDay?: number;
  expenseReimbursement?: number;
  totalEarnings?: number;
  totalDeductions?: number;
  netSettlement?: number;
  fnfStatus?: string;
  finalMonthAttendance?: {
    month?: number;
    year?: number;
    workingDays?: number;
    presentDays?: number;
    leaveDays?: number;
    holidayDays?: number;
    paidDays?: number;
    unpaidDays?: number;
    prorationFactor?: number;
  };
}

const apiErrorMessage = (err: unknown) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;

const TABS = [
  { id: 'exits', label: 'Exits', icon: DoorOpen },
  { id: 'fnf', label: 'F&F Settlement', icon: Calculator },
  { id: 'clearance', label: 'Clearance', icon: ClipboardCheck },
];

const INITIAL_FORM = { employeeId: '', companyId: '', branchId: '', departmentId: '', exitType: 'resigned', exitDate: '', lastWorkingDay: '', reason: '', description: '', notes: '', remarks: '', noticePeriodServed: 'no' };

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-color)]">
          <h3 className="text-xl font-bold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export default function ExitManagement() {
  const queryClient = useQueryClient();
  const { data: exitTypeOptions = [] } = useMasterData('EXIT_TYPE');
  const { data: fnfStatusOptions = [] } = useMasterData('FNF_STATUS');
  const { data: noticePeriodOptions = [] } = useMasterData('NOTICE_PERIOD_SERVED');
  const [activeTab, setActiveTab] = useState('exits');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCompanyId, setFilterCompanyId] = useState('all');
  const [filterDepartmentId, setFilterDepartmentId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editingItem, setEditingItem] = useState<ExitRecord | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [selectedExit, setSelectedExit] = useState<ExitRecord | null>(null);
const [fnfResult, setFnfResult] = useState<FnfResult | null>(null);
const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
const [showFnfModal, setShowFnfModal] = useState(false);
const [showFnfForm, setShowFnfForm] = useState(false);
const [fnfForm, setFnfForm] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [archiveConfirmTarget, setArchiveConfirmTarget] = useState<ExitRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ExitRecord | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ items: ExitRecord[] } | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [clearanceItems, setClearanceItems] = useState<{ item: string; department?: string; description?: string }[]>([]);
  const [viewClearanceId, setViewClearanceId] = useState<number | null>(null);
  const [clearanceFormData, setClearanceFormData] = useState<Record<string, string>>({});

  // Support deep-link: ?employeeId=<id> opens the Initiate Exit modal pre-filled
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const empId = searchParams.get('employeeId');
    if (empId) {
      setEditingItem(null);
      setFormData({ ...INITIAL_FORM, employeeId: empId });
      setShowModal(true);
      // clear the param so it doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, setEditingItem, setFormData, setShowModal]);

  const { data: pickerEmployees = [] } = useEmployeePicker({ status: 'inactive' });
  const employees = pickerEmployees.map(normalizePickerEmployee) as Employee[];

  const { data: companiesList = [] } = useQuery<Company[]>({
    queryKey: ['companies-dropdown'],
    queryFn: () => api.get('/companies').then(r => r.data?.items || r.data?.data || r.data || []),
  });

const { data: departmentsList = [] } = useQuery<Department[]>({
    queryKey: ['departments-dropdown'],
    queryFn: () => api.get('/departments').then(r => r.data?.items || r.data?.data || r.data || []),
  });

  const { data: branchesList = [] } = useQuery<Branch[]>({
    queryKey: ['branches-dropdown'],
    queryFn: () => api.get('/branches').then(r => r.data?.items || r.data?.data || r.data || []),
  });

  const filteredDepartments = useMemo(() => {
    if (filterCompanyId === 'all') return departmentsList;
    return departmentsList.filter((d: Department) => d.companyId === Number(filterCompanyId) || (d as Department & { company_id?: number }).company_id === Number(filterCompanyId));
  }, [departmentsList, filterCompanyId]);

  const { data: exitRecords = [], isLoading, isFetching } = useQuery<ExitRecord[]>({
    queryKey: ['exit-records'],
    queryFn: () => api.get('/exit-records').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/exit-records', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      toast.success('Exit record created');
      closeModal();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.put(`/exit-records/${id}`, data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      toast.success('Exit record updated');
      closeModal();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/exit-records/${id}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      toast.success('Exit record deleted');
      setShowDeleteConfirm(false);
      setDeletingId(null);
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to delete'),
  });

  const calculateFnf = useMutation({
    mutationFn: ({ exitId, values }: { exitId: number; values: Record<string, unknown> }) =>
      api.post(`/exit-records/${exitId}/calculate-fnf`, values).then(r => r.data),
    onSuccess: (data) => {
      setFnfResult(data);
      setShowFnfForm(false);
      setShowFnfModal(true);
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Calculation failed'),
  });

  const openFnfForm = async (rec: ExitRecord) => {
    setSelectedExit(rec);
    setFnfForm({
      monthlySalary: String(rec.monthlySalary ?? rec.base_salary ?? ''),
      leaveBalance: '',
      noticeDays: '',
      otherEarnings: '0',
      otherDeductions: '0',
    });
    setShowFnfForm(true);
    // Auto-fetch employee data to pre-fill form
    try {
      const resp = await api.get(`/employees/${rec.employeeId}`);
      const emp = resp.data;
      if (emp) {
        setFnfForm(prev => ({
          ...prev,
          monthlySalary: prev.monthlySalary || String(emp.base_salary ? Math.round(emp.base_salary / 12) : ''),
          leaveBalance: prev.leaveBalance || String(emp.leaveBalance ?? ''),
        }));
      }
    } catch { /* ignore - form will show empty fields */ }
  };

  const submitFnfForm = () => {
    if (!selectedExit) return;
    const num = (v: string | undefined) => (v && v !== '' ? Number(v) : undefined);
    calculateFnf.mutate({
      exitId: selectedExit.id as number,
      values: {
        monthlySalary: num(fnfForm.monthlySalary),
        leaveBalance: num(fnfForm.leaveBalance),
        noticeDays: num(fnfForm.noticeDays),
        otherEarnings: num(fnfForm.otherEarnings),
        otherDeductions: num(fnfForm.otherDeductions),
      },
    });
  };

  const markClearance = useMutation({
    mutationFn: (exitId: number) => api.post(`/exit-records/${exitId}/mark-clearance-complete`).then(r => r.data),
    onSuccess: () => {
      toast.success('Clearance marked complete');
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to mark clearance'),
  });

  const saveClearanceMutation = useMutation({
    mutationFn: ({ exitId, data }: { exitId: number; data: Record<string, string> }) =>
      api.put(`/exit-records/${exitId}`, { clearanceData: data }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      toast.success('Clearance data saved');
      setViewClearanceId(null);
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to save'),
  });

  // Load clearance checklist once
  useEffect(() => {
    api.get('/exit/clearance-checklist').then(r => {
      const d = r.data;
      setClearanceItems(Array.isArray(d) ? d : d?.items || []);
    }).catch(() => {});
  }, []);

  // Reset checked items when switching selected exit
  useEffect(() => { setCheckedItems(new Set()); }, [selectedExit?.id]);

  const bulkUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/exit-records/bulk-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
    },
    onSuccess: (data: { created?: number; skipped?: number; errors?: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      toast.success(`Upload complete: ${data?.created || 0} created, ${data?.skipped || 0} skipped`);

      setShowBulkUpload(false);
      setUploadFile(null);
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Bulk upload failed'),
  });

  const completeFnf = useMutation({
    mutationFn: (exitId: number) => api.post(`/exit-records/${exitId}/complete-fnf`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      queryClient.refetchQueries({ queryKey: ['exit-records'] });
      toast.success('FnF completed successfully');
      setShowFnfModal(false);
      setFnfResult(null);
      setSelectedExit(null);
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed'),
  });

  const approveExitMutation = useMutation({
    mutationFn: (exitId: number) => api.put(`/exit-records/${exitId}`, { approvalStatus: 'approved' }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      toast.success('Exit approved');
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to approve'),
  });

  const rejectExitMutation = useMutation({
    mutationFn: (exitId: number) => api.put(`/exit-records/${exitId}`, { approvalStatus: 'rejected' }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      toast.success('Exit rejected');
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to reject'),
  });

  const archiveExit = useMutation({
    mutationFn: (exitId: number) => api.post(`/exit-records/${exitId}/archive`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      queryClient.invalidateQueries({ queryKey: ['archived-employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employeeStats'] });
      toast.success('Employee archived successfully');
      setArchiveConfirmTarget(null);
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err) || 'Failed to archive'),
  });

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
      setEditingItem(null);
      setFormData(INITIAL_FORM);
    }, 300);
  };

const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      ...formData,
      employeeId: Number(formData.employeeId) || undefined,
      companyId: formData.companyId ? Number(formData.companyId) : undefined,
      branchId: formData.branchId ? Number(formData.branchId) : undefined,
      departmentId: formData.departmentId ? Number(formData.departmentId) : undefined,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (rec: ExitRecord) => {
    setEditingItem(rec);
    setFormData({
employeeId: String(rec.employeeId),
      companyId: rec.companyId ? String(rec.companyId) : '',
      branchId: rec.branchId ? String(rec.branchId) : '',
      departmentId: rec.departmentId ? String(rec.departmentId) : '',
      exitType: rec.exitType || '',
      exitDate: rec.exitDate ? rec.exitDate.split('T')[0] : '',
      lastWorkingDay: rec.lastWorkingDay ? rec.lastWorkingDay.split('T')[0] : '',
      reason: rec.reason || '',
      description: (rec as ExitRecord & { description?: string }).description || '',
      notes: (rec as ExitRecord & { notes?: string }).notes || '',
      remarks: (rec as ExitRecord & { remarks?: string }).remarks || '',
      noticePeriodServed: rec.noticePeriodServed || 'no',
    });
    setShowModal(true);
  };

  const handleRestoreExit = async (rec: ExitRecord) => {
    setRestoreTarget(rec);
  };

  const performRestoreExit = async (rec: ExitRecord) => {
    try {
      // Try to restore from archive if exists
      if (rec.employeeId) {
        try {
          await api.patch(`/employees/${rec.employeeId}/restore`);
        } catch {
          // If archive record doesn't exist, just update employee status directly
          await api.patch(`/employees/${rec.employeeId}`, { status: 'inactive' });
        }
      }
      // Delete the exit record
      await api.delete(`/exit-records/${rec.id}`);
      toast.success(`${rec.employeeName} revived to inactive employees`);
      queryClient.invalidateQueries({ queryKey: ['exit-records'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      toast.error(error?.response?.data?.detail || 'Failed to revive employee');
    }
  };

  const handleDelete = (id: number) => {
    setDeletingId(id);
    setShowDeleteConfirm(true);
  };

  const handleFnfAction = (rec: ExitRecord) => {
    setSelectedExit(rec);
    calculateFnf.mutate({ exitId: rec.id as number, values: {} });
  };

  const stats = useMemo(() => {
    const total = exitRecords.length;
    const completed = exitRecords.filter((r: ExitRecord) => r.fnfStatus === 'completed').length;
    const inProgress = exitRecords.filter((r: ExitRecord) => r.fnfStatus === 'in_progress').length;
    const pending = exitRecords.filter((r: ExitRecord) => r.fnfStatus === 'pending').length;
    const clearancePending = exitRecords.filter((r: ExitRecord) => r.clearanceStatus !== 'completed').length;
    return { total, completed, inProgress, pending, clearancePending };
  }, [exitRecords]);

const statCards = [
    { label: 'Total Exits', value: stats.total, icon: TrendingUp, iconBg: 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5', iconColor: 'text-[var(--primary-blue)]', onClick: () => setActiveTab('exits') },
    { label: 'Pending FnF', value: stats.pending, icon: AlertTriangle, iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5', iconColor: 'text-[#D97706]', onClick: () => setActiveTab('fnf') },
    { label: 'FnF In Progress', value: stats.inProgress, icon: Calculator, iconBg: 'bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5', iconColor: 'text-[#7C3AED]', onClick: () => setActiveTab('fnf') },
    { label: 'FnF Completed', value: stats.completed, icon: CheckCircle, iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5', iconColor: 'text-[#059669]', onClick: () => setActiveTab('fnf') },
    { label: 'Clearance Pending', value: stats.clearancePending, icon: ClipboardCheck, iconBg: 'bg-gradient-to-br from-[#EF4444]/20 via-[#F87171]/10 to-[#FCA5A5]/5', iconColor: 'text-[#DC2626]', onClick: () => setActiveTab('clearance') },
  ];

  const hasActiveFilters = filterCompanyId !== 'all' || filterDepartmentId !== 'all' || filterType !== 'all' || filterStatus !== 'all' || !!startDate || !!endDate || !!search;

  const clearFilters = () => {
    setSearch('');
    setFilterCompanyId('all');
    setFilterDepartmentId('all');
    setFilterType('all');
    setFilterStatus('all');
    setStartDate('');
    setEndDate('');
  };

  const filteredRecords = useMemo(() => {
    return exitRecords.filter((r: ExitRecord) => {
      const matchSearch = !search ||
        r.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
        r.email?.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || r.exitType === filterType;
      const matchStatus = filterStatus === 'all' || r.fnfStatus === filterStatus;
      const matchCompany = filterCompanyId === 'all' || r.companyId === Number(filterCompanyId);
      const matchDept = filterDepartmentId === 'all' || r.departmentId === Number(filterDepartmentId);
      let matchDate = true;
      if (startDate && endDate && r.exitDate) {
        const exitDate = r.exitDate.split('T')[0];
        matchDate = exitDate >= startDate && exitDate <= endDate;
      }
      return matchSearch && matchType && matchStatus && matchCompany && matchDept && matchDate;
    });
  }, [exitRecords, search, filterType, filterStatus, filterCompanyId, filterDepartmentId, startDate, endDate]);

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (exitRecords.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [exitRecords, hasLoaded]);

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
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">

        {/* HEADER */}
        <PageHero
          title="Exit Management"
          subtitle="Track employee exits, full & final settlement, and clearance"
          icon={LogOut}
          accent="rose"
          breadcrumbs={['HRMS.Pro!', 'Exits']}
          actions={
            activeTab === 'exits' ? (
              <>
                <button onClick={async () => {
                  toast.loading('AI analyzing exits...', { id: 'ai-ext' });
                  try { await runAutomation('exit_analyze', {}); toast.success('AI analysis done', { id: 'ai-ext' }); }
                  catch { toast.error('AI unavailable', { id: 'ai-ext' }); }
                }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
                  title="AI Automation">
                  <Sparkles className="w-4 h-4" /> AI
                </button>
                <ExportButton
                  rows={filteredRecords}
                  filename="exit_records"
                  label="Export"
                />
                <button onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                  <Upload className="w-4 h-4" /> Upload
                </button>
                <button onClick={() => { setEditingItem(null); setFormData(INITIAL_FORM); setShowModal(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]">
                  <Plus className="w-4 h-4" /> Add Exit Record
                </button>
              </>
            ) : activeTab === 'clearance' ? (
              <>
                <ExportButton
                  rows={exitRecords}
                  filename="clearance_records"
                  label="Export"
                />
                <button onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                  <Upload className="w-4 h-4" /> Upload
                </button>
                <button onClick={() => { setEditingItem(null); setFormData(INITIAL_FORM); setShowModal(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]">
                  <Plus className="w-4 h-4" /> Add Exit Record
                </button>
              </>
            ) : activeTab === 'fnf' ? (
              <>
                <ExportButton
                  rows={exitRecords}
                  filename="fnf_records"
                  label="Export"
                />
                <button onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                  <Upload className="w-4 h-4" /> Upload
                </button>
                <button onClick={() => { setEditingItem(null); setFormData(INITIAL_FORM); setShowModal(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]">
                  <Plus className="w-4 h-4" /> Add Exit Record
                </button>
              </>
            ) : undefined
          }
        />

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((stat, i) => (
            <div key={stat.label} className="transition-all duration-300" style={{ transitionDelay: `${i * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} iconBg={stat.iconBg} iconColor={stat.iconColor} onClick={stat.onClick} />
            </div>
          ))}
        </div>

        {/* TABS - Pill Style */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedExit(null); setFnfResult(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[var(--primary-blue)] text-white shadow-md shadow-[#1C64F2]/20'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]'
                }`}>
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* === EXITS TAB === */}
        {activeTab === 'exits' && (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border-color)] space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={filterCompanyId === 'all' ? 'all' : filterCompanyId}
                  onChange={(val) => setFilterCompanyId(val.toString())}
                  options={companiesList.map((c: Company) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterDepartmentId === 'all' ? 'all' : filterDepartmentId}
                  onChange={(val) => setFilterDepartmentId(val.toString())}
                  options={filteredDepartments.map((d: Department) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect value={filterType === 'all' ? 'all' : filterType} onChange={val => setFilterType(val.toString())}
                  options={exitTypeOptions.map((opt: { code: string; name: string }) => ({ id: opt.code, name: opt.name }))}
                  placeholder="All Exit Types" allOption="All Exit Types" className="w-44" />
                <SearchableSelect value={filterStatus === 'all' ? 'all' : filterStatus} onChange={val => setFilterStatus(val.toString())}
                  options={fnfStatusOptions.map((opt: { code: string; name: string }) => ({ id: opt.code, name: opt.name }))}
                  placeholder="All FnF Status" allOption="All FnF Status" className="w-44" />
                <DateRangePicker startDate={startDate} endDate={endDate} onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
                {hasActiveFilters && (
                  <button onClick={clearFilters}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters">
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
            <DataTable
              data={filteredRecords}
              rowKey={(rec: ExitRecord) => rec.id}
              logEntityType="exit_record"
              logFor={(rec: ExitRecord) => ({ id: rec.id, label: rec.employeeName || `Exit #${rec.id}` })}
              searchable
              searchKeys={(rec: ExitRecord) => `${rec.employeeName} ${rec.email || ''} ${rec.exitType || ''}`}
              searchPlaceholder="Search exit records..."
              emptyMessage="No exit records found"
              onEdit={(rec) => handleEdit(rec)}
              onDelete={(items) => { items.forEach((r) => handleDelete(r.id)); }}
              bulkActions={[
                {
                  label: 'Approve',
                  icon: CheckCircle2,
                  variant: 'success',
                  onAction: (items) => { items.forEach((r) => approveExitMutation.mutate(r.id)); },
                },
                {
                  label: 'Reject',
                  icon: XCircle,
                  variant: 'amber',
                  onAction: (items) => { items.forEach((r) => rejectExitMutation.mutate(r.id)); },
                },
                {
                  label: 'Revive',
                  icon: RotateCcw,
                  variant: 'default' as const,
                  className: 'bg-[#475569] text-white hover:bg-[#334155]',
                  onAction: (items) => { items.forEach((r) => handleRestoreExit(r)); },
                },
              ]}
              onDelete={(items) => setBulkDeleteTarget({ items })}
              columns={[
                {
                  key: 'employeeName', header: 'Employee', sortable: true,
                  render: (rec: ExitRecord) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-sm font-medium text-[#0F172A]">{rec.employeeName}</span>
                          {rec.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{rec.employeeCode}</span>}
                        </div>
                        <p className="text-xs text-[#64748B] truncate">{rec.email}</p>
                      </div>
                    </div>
                  ),
                  sortValue: (rec: ExitRecord) => rec.employeeName,
                },
                { key: 'companyName', header: 'Company', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.companyName || '-'}</span> },
                { key: 'branchName', header: 'Branch', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.branchName || '-'}</span> },
                { key: 'departmentName', header: 'Department', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.departmentName || '-'}</span> },
                {
                  key: 'exitType', header: 'Exit Type', sortable: true,
                  render: (rec: ExitRecord) => {
                    const t = (rec.exitType || '').toLowerCase();
                    const cls = t === 'resigned' ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' : t === 'terminated' ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]' : t === 'retired' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : t === 'absconded' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.exitType}</span>;
                  },
                  sortValue: (rec: ExitRecord) => rec.exitType,
                },
                { key: 'exitDate', header: 'Exit Date', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.exitDate ? formatAppDate(rec.exitDate) : '-'}</span> },
                { key: 'lastWorkingDay', header: 'Last Working Day', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.lastWorkingDay ? formatAppDate(rec.lastWorkingDay) : '-'}</span> },
                {
                  key: 'approvalStatus', header: 'Approval', sortable: true,
                  render: (rec: ExitRecord) => {
                    const s = (rec.approvalStatus || 'pending').toLowerCase();
                    const cls = s === 'approved' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'rejected' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.approvalStatus === 'approved' ? 'Approved' : rec.approvalStatus === 'rejected' ? 'Rejected' : 'Pending'}</span>;
                  },
                  sortValue: (rec: ExitRecord) => rec.approvalStatus || '',
                },
                {
                  key: 'fnfStatus', header: 'FnF Status', sortable: true,
                  render: (rec: ExitRecord) => {
                    const s = (rec.fnfStatus || 'pending').toLowerCase();
                    const cls = s === 'completed' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'in_progress' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.fnfStatus === 'in_progress' ? 'In Progress' : rec.fnfStatus || 'Pending'}</span>;
                  },
                  sortValue: (rec: ExitRecord) => rec.fnfStatus,
                },
                {
                  key: 'clearanceStatus', header: 'Clearance', sortable: true,
                  render: (rec: ExitRecord) => {
                    const s = (rec.clearanceStatus || 'pending').toLowerCase();
                    const cls = s === 'completed' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'in_progress' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.clearanceStatus === 'completed' ? 'Completed' : rec.clearanceStatus === 'in_progress' ? 'In Progress' : 'Pending'}</span>;
                  },
                  sortValue: (rec: ExitRecord) => rec.clearanceStatus,
                },
              ]}
              actions={(rec: ExitRecord) => (
                <div className="flex items-center justify-end gap-1.5">
                  {rec.approvalStatus !== 'approved' && rec.fnfStatus !== 'completed' && (
                    <button onClick={() => approveExitMutation.mutate(rec.id)} disabled={approveExitMutation.isPending}
                      className="p-2 text-[#10B981] hover:bg-[#10B981]/10 rounded-lg transition-colors" title="Approve exit">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  {rec.approvalStatus !== 'rejected' && rec.fnfStatus !== 'completed' && (
                    <button onClick={() => rejectExitMutation.mutate(rec.id)} disabled={rejectExitMutation.isPending}
                      className="p-2 text-[#D97706] hover:bg-[#D97706]/10 rounded-lg transition-colors" title="Reject exit">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  {rec.fnfStatus === 'completed' && rec.clearanceStatus === 'completed' ? (
                    <button onClick={() => setArchiveConfirmTarget(rec)} disabled={archiveExit.isPending}
                      className="p-2 text-[#059669] hover:bg-[#059669]/10 rounded-lg transition-colors" title="Archive employee">
                      <Archive className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={() => handleRestoreExit(rec)}
                      className="p-2 text-[#475569] hover:bg-[#475569]/10 rounded-lg transition-colors" title="Revive employee to inactive">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleEdit(rec)}
                    className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(rec.id)}
                    className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              />
          </div>
        )}

        {/* === F&F TAB === */}
        {activeTab === 'fnf' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
              <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Full & Final Settlement</h2>
                <span className="text-xs text-[#94A3B8]">Click "Calculate" on a record to run its FnF settlement</span>
              </div>
              <DataTable
                data={exitRecords}
                rowKey={(rec: ExitRecord) => rec.id}
                logEntityType="exit_record"
                logFor={(rec: ExitRecord) => ({ id: rec.id, label: rec.employeeName || `Exit #${rec.id}` })}
                searchable
                searchKeys={(rec: ExitRecord) => `${rec.employeeName || ''} ${rec.companyName || ''} ${rec.departmentName || ''} ${rec.exitType || ''}`}
                searchPlaceholder="Search FnF records..."
                emptyMessage="No exit records for FnF"
                onEdit={(rec) => handleEdit(rec)}
                onDelete={(items) => { items.forEach((r) => handleDelete(r.id)); }}
                bulkActions={[
                  {
                    label: 'Calculate FnF',
                    icon: Calculator,
                    variant: 'success',
                    onAction: (items) => { items.forEach((r) => { setSelectedExit(r); calculateFnf.mutate({ exitId: r.id as number, values: {} }); }); },
                  },
                  {
                    label: 'View',
                    icon: FileText,
                    variant: 'amber',
                    onAction: (items) => { if (items.length === 1) { setSelectedExit(items[0]); calculateFnf.mutate({ exitId: items[0].id as number, values: {} }); } },
                  },
                  {
                    label: 'PDF',
                    icon: Download,
                    variant: 'default' as const,
                    className: 'bg-[#475569] text-white hover:bg-[#334155]',
                    onAction: (items) => { items.forEach((r) => { window.open(`/api/exit-records/${r.id}/fnf/pdf`, '_blank'); }); },
                  },
                ]}
                columns={[
                  {
                    key: 'employeeName', header: 'Employee', sortable: true,
                    render: (rec: ExitRecord) => (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-sm font-medium text-[#0F172A]">{rec.employeeName}</span>
                            {rec.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{rec.employeeCode}</span>}
                          </div>
                          <p className="text-xs text-[#64748B] truncate">{rec.email}</p>
                        </div>
                      </div>
                    ),
                    sortValue: (rec: ExitRecord) => rec.employeeName || '',
                  },
                  { key: 'companyName', header: 'Company', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.companyName || '-'}</span> },
                  { key: 'branchName', header: 'Branch', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.branchName || '-'}</span> },
                  { key: 'departmentName', header: 'Department', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.departmentName || '-'}</span> },
                  {
                    key: 'exitType', header: 'Exit Type', sortable: true,
                    render: (rec: ExitRecord) => {
                      const t = (rec.exitType || '').toLowerCase();
                      const cls = t === 'resigned' ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' : t === 'terminated' ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]' : t === 'retired' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : t === 'absconded' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                      return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.exitType}</span>;
                    },
                    sortValue: (rec: ExitRecord) => rec.exitType || '',
                  },
                  { key: 'lastWorkingDay', header: 'Last Working Day', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.lastWorkingDay ? formatAppDate(rec.lastWorkingDay) : '-'}</span> },
                  {
                    key: 'fnfStatus', header: 'FnF Status', sortable: true,
                    render: (rec: ExitRecord) => {
                      const s = (rec.fnfStatus || 'pending').toLowerCase();
                      const cls = s === 'completed' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'in_progress' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                      return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.fnfStatus === 'in_progress' ? 'In Progress' : (rec.fnfStatus || 'Pending')}</span>;
                    },
                    sortValue: (rec: ExitRecord) => rec.fnfStatus || '',
                  },
                  {
                    key: 'fnfCompletedAt', header: 'FnF Settled', sortable: true,
                    render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.fnfCompletedAt ? formatAppDate(rec.fnfCompletedAt) : '-'}</span>,
                    sortValue: (rec: ExitRecord) => rec.fnfCompletedAt || '',
                  },
                  {
                    key: 'clearanceStatus', header: 'Clearance', sortable: true,
                    render: (rec: ExitRecord) => {
                      const s = (rec.clearanceStatus || 'pending').toLowerCase();
                      const cls = s === 'completed' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'in_progress' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                      return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.clearanceStatus === 'completed' ? 'Completed' : rec.clearanceStatus === 'in_progress' ? 'In Progress' : 'Pending'}</span>;
                    },
                    sortValue: (rec: ExitRecord) => rec.clearanceStatus || '',
                  },
                ]}
                actions={(rec: ExitRecord) => (
                  <div className="flex items-center justify-end gap-1.5">
                    {rec.fnfStatus !== 'completed' && (
                      <button
                        onClick={() => openFnfForm(rec)}
                        disabled={calculateFnf.isPending}
                        className="p-2 text-[#10B981] hover:bg-[#10B981]/10 rounded-lg transition-colors"
                        title="Calculate FnF"
                      >
                        <Calculator className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedExit(rec); setFnfResult(null); calculateFnf.mutate({ exitId: rec.id as number, values: {} }); }}
                      disabled={calculateFnf.isPending}
                      className="p-2 text-[#D97706] hover:bg-[#D97706]/10 rounded-lg transition-colors"
                      title="View FnF"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    {rec.fnfStatus !== 'completed' && (
                      <a
                        href={`/api/exit-records/${rec.id}/fnf/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-[#475569] hover:bg-[#475569]/10 rounded-lg transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => handleEdit(rec)}
                      className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(rec.id)}
                      className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              />
            </div>

            {/* FnF Result modal - Full Page */}
            {fnfResult && (
              <div className="fixed inset-0 z-50 flex">
                <div className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`} onClick={() => setFnfResult(null)} />
                <div className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#059669] to-[#059669bb] flex items-center justify-center text-white shadow-sm">
                          <Calculator className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-[#0F172A] leading-tight">FnF Settlement</h2>
                          <p className="text-xs text-[#64748B]">{fnfResult.employeeName || selectedExit?.employeeName}{selectedExit?.departmentName ? ` — ${selectedExit.departmentName}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => selectedExit && completeFnf.mutate(selectedExit.id)}
                          disabled={completeFnf.isPending}
                          className="flex items-center gap-2 px-5 py-2.5 bg-[#059669] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10"
                        >
                          {completeFnf.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          {completeFnf.isPending ? 'Saving...' : 'Confirm & Complete FnF'}
                        </button>
                        {selectedExit && (
                          <a
                            href={`/api/exit-records/${selectedExit.id}/fnf/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-colors"
                          >
                            <Download className="w-4 h-4" /> PDF
                          </a>
                        )}
                        <button onClick={() => setFnfResult(null)} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                      <p className="text-[11px] text-[#B45309]">
                        <Info className="w-3.5 h-3.5 inline mr-1" />
                        Review the FnF settlement details below. Click Confirm to complete the settlement.
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Employee Info */}
                        <div className="bg-[#F8FAFC] rounded-xl p-5 border border-[#E2E8F0]">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                              {(selectedExit?.employeeName || 'E').split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-semibold text-[#0F172A]">{fnfResult.employeeName || selectedExit?.employeeName}</p>
                              <p className="text-xs text-[#94A3B8]">{selectedExit?.companyName || ''}{selectedExit?.departmentName ? ` — ${selectedExit.departmentName}` : ''}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Years of Service</span>
                              <span className="font-semibold text-[var(--text-primary)]">{fnfResult.yearsOfService} yrs</span></div>
                            <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Monthly Salary</span>
                              <span className="font-semibold text-[var(--text-primary)]">{fnfResult.monthlySalary?.toLocaleString()}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Leave Balance</span>
                              <span className="font-semibold text-[var(--text-primary)]">{fnfResult.leaveBalance ?? '-'} days</span></div>
                          </div>
                        </div>

                        {/* Earnings */}
                        <div className="bg-[#F0FDF4] rounded-xl p-5 border border-green-100">
                          <p className="text-xs font-semibold text-[#059669] uppercase mb-3">Earnings</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Salary till Last Working Day</span>
                              <span className="font-semibold text-[var(--text-primary)]">{fnfResult.salaryUntilLastWorkingDay?.toLocaleString()}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Gratuity</span>
                              <span className="font-semibold text-[var(--text-primary)]">{fnfResult.gratuity?.toLocaleString()}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Leave Encashment</span>
                              <span className="font-semibold text-[var(--text-primary)]">{fnfResult.leaveEncashment?.toLocaleString()}</span></div>
                            {fnfResult.expenseReimbursement ? (
                              <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Expense Reimbursement</span>
                                <span className="font-semibold text-[var(--text-primary)]">{fnfResult.expenseReimbursement?.toLocaleString()}</span></div>
                            ) : null}
                            {fnfResult.otherEarnings ? (
                              <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Other Earnings</span>
                                <span className="font-semibold text-[var(--text-primary)]">{fnfResult.otherEarnings?.toLocaleString()}</span></div>
                            ) : null}
                            <div className="flex justify-between text-sm font-medium border-t border-green-200 pt-2"><span className="text-[#059669]">Total Earnings</span>
                              <span className="font-semibold text-[var(--text-primary)]">{fnfResult.totalEarnings?.toLocaleString()}</span></div>
                          </div>
                        </div>

                        {/* Final Month Attendance */}
                        {fnfResult.finalMonthAttendance && Object.keys(fnfResult.finalMonthAttendance).length > 0 ? (
                          <div className="bg-[#EFF6FF] rounded-xl p-5 border border-blue-100">
                            <p className="text-xs font-semibold text-[#1C64F2] uppercase mb-3">Final Month Attendance</p>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs"><span className="text-[#94A3B8]">Present</span>
                                <span className="font-semibold text-[var(--text-primary)]">{fnfResult.finalMonthAttendance.presentDays} days</span></div>
                              <div className="flex justify-between text-xs"><span className="text-[#94A3B8]">Paid / Working</span>
                                <span className="font-semibold text-[var(--text-primary)]">{fnfResult.finalMonthAttendance.paidDays} / {fnfResult.finalMonthAttendance.workingDays} days</span></div>
                              <div className="flex justify-between text-xs"><span className="text-[#94A3B8]">Unpaid / Leave / Holiday</span>
                                <span className="font-semibold text-[var(--text-primary)]">{fnfResult.finalMonthAttendance.unpaidDays} / {fnfResult.finalMonthAttendance.leaveDays} / {fnfResult.finalMonthAttendance.holidayDays} days</span></div>
                              <div className="flex justify-between text-xs"><span className="text-[#94A3B8]">Proration Factor</span>
                                <span className="font-semibold text-[var(--text-primary)]">{Math.round((fnfResult.finalMonthAttendance.prorationFactor || 0) * 100)}%</span></div>
                            </div>
                          </div>
                        ) : null}

                        {/* Deductions */}
                        <div className="bg-[#FEF2F2] rounded-xl p-5 border border-red-100">
                          <p className="text-xs font-semibold text-[#DC2626] uppercase mb-3">Deductions</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Notice Deduction</span>
                              <span className="font-semibold text-[var(--danger-red)]">- {fnfResult.noticeDeduction?.toLocaleString()}</span></div>
                            {fnfResult.otherDeductions ? (
                              <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Other Deductions</span>
                                <span className="font-semibold text-[var(--danger-red)]">- {fnfResult.otherDeductions?.toLocaleString()}</span></div>
                            ) : null}
                            <div className="flex justify-between text-sm font-medium border-t border-red-200 pt-2"><span className="text-[#DC2626]">Total Deductions</span>
                              <span className="font-semibold text-[var(--danger-red)]">{fnfResult.totalDeductions?.toLocaleString()}</span></div>
                          </div>
                        </div>

                        {/* Net Settlement */}
                        <div className="lg:col-span-2 bg-gradient-to-r from-[#EFF6FF] to-[#F0FDF4] rounded-xl p-6 border border-[#BFDBFE]">
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-semibold text-[var(--text-primary)]">Net Settlement</span>
                            <span className="text-2xl font-bold text-[var(--primary-blue)]">{fnfResult.netSettlement?.toLocaleString()}</span>
                          </div>
                          <div className="mt-3 pt-3 border-t border-[#BFDBFE] flex items-center justify-between gap-4">
                            <span className="text-sm text-[#64748B]">Settlement Date</span>
                            <DatePicker
                              value={settlementDate}
                              onChange={(val) => setSettlementDate(val)}
                              className="w-40"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FnF Calculation Form modal - Full Page */}
        {showFnfForm && selectedExit && (
          <div className="fixed inset-0 z-50 flex">
            <div className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`} onClick={() => setShowFnfForm(false)} />
            <div className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#8B5CF6bb] flex items-center justify-center text-white shadow-sm">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] leading-tight">Calculate FnF Settlement</h2>
                      <p className="text-xs text-[#64748B]">{selectedExit.employeeName}{selectedExit.departmentName ? ` — ${selectedExit.departmentName}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowFnfForm(false)} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                    <button onClick={submitFnfForm} disabled={calculateFnf.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10">
                      {calculateFnf.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                      {calculateFnf.isPending ? 'Saving...' : 'Calculate'}
                    </button>
                    <button onClick={() => setShowFnfForm(false)} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                  <p className="text-[11px] text-[#B45309]">
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    Gratuity is auto-calculated (15 days wage per year, after 5 years of service). Leave balance defaults to the employee's remaining leave.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">Monthly Salary</label>
                      <input type="number" value={fnfForm.monthlySalary || ''} onChange={(e) => setFnfForm({ ...fnfForm, monthlySalary: e.target.value })}
                        placeholder="e.g. 60000" className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
                      <p className="mt-1 text-xs text-gray-400">Employee's monthly base salary</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">Leave Balance (days)</label>
                      <input type="number" value={fnfForm.leaveBalance || ''} onChange={(e) => setFnfForm({ ...fnfForm, leaveBalance: e.target.value })}
                        placeholder="e.g. 12" className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
                      <p className="mt-1 text-xs text-gray-400">Unused leave days payable</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">Notice Deduction (days)</label>
                      <input type="number" value={fnfForm.noticeDays || ''} onChange={(e) => setFnfForm({ ...fnfForm, noticeDays: e.target.value })}
                        placeholder="e.g. 0" className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
                      <p className="mt-1 text-xs text-gray-400">Deduction for unserved notice</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">Other Earnings</label>
                      <input type="number" value={fnfForm.otherEarnings || '0'} onChange={(e) => setFnfForm({ ...fnfForm, otherEarnings: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
                      <p className="mt-1 text-xs text-gray-400">Any additional earnings</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#0F172A] mb-1">Other Deductions</label>
                      <input type="number" value={fnfForm.otherDeductions || '0'} onChange={(e) => setFnfForm({ ...fnfForm, otherDeductions: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none" />
                      <p className="mt-1 text-xs text-gray-400">Any additional deductions</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === CLEARANCE TAB === */}
        {activeTab === 'clearance' && (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Clearance</h2>
              <span className="text-xs text-[#94A3B8]">Click "Manage" on a record to run its clearance checklist &amp; documents</span>
            </div>
            <DataTable
              data={exitRecords}
              rowKey={(rec: ExitRecord) => rec.id}
              logEntityType="exit_record"
              logFor={(rec: ExitRecord) => ({ id: rec.id, label: rec.employeeName || `Exit #${rec.id}` })}
              searchable
              searchKeys={(rec: ExitRecord) => `${rec.employeeName || ''} ${rec.companyName || ''} ${rec.departmentName || ''} ${rec.exitType || ''}`}
              searchPlaceholder="Search clearance records..."
              emptyMessage="No exit records for clearance"
              columns={[
                {
                  key: 'employeeName', header: 'Employee', sortable: true,
                  render: (rec: ExitRecord) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-sm font-medium text-[#0F172A]">{rec.employeeName}</span>
                          {rec.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{rec.employeeCode}</span>}
                        </div>
                        <p className="text-xs text-[#64748B] truncate">{rec.email}</p>
                      </div>
                    </div>
                  ),
                  sortValue: (rec: ExitRecord) => rec.employeeName || '',
                },
                { key: 'companyName', header: 'Company', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.companyName || '-'}</span> },
                { key: 'branchName', header: 'Branch', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.branchName || '-'}</span> },
                { key: 'departmentName', header: 'Department', render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.departmentName || '-'}</span> },
                { key: 'exitType', header: 'Exit Type', sortable: true,
                  render: (rec: ExitRecord) => {
                    const t = (rec.exitType || '').toLowerCase();
                    const cls = t === 'resigned' ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' : t === 'terminated' ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]' : t === 'retired' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : t === 'absconded' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.exitType}</span>;
                  },
                  sortValue: (rec: ExitRecord) => rec.exitType || '',
                },
                {
                  key: 'fnfStatus', header: 'FnF Status', sortable: true,
                  render: (rec: ExitRecord) => {
                    const s = (rec.fnfStatus || 'pending').toLowerCase();
                    const cls = s === 'completed' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'in_progress' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.fnfStatus === 'in_progress' ? 'In Progress' : rec.fnfStatus || 'Pending'}</span>;
                  },
                  sortValue: (rec: ExitRecord) => rec.fnfStatus || '',
                },
                {
                  key: 'clearanceStatus', header: 'Clearance', sortable: true,
                  render: (rec: ExitRecord) => {
                    const s = (rec.clearanceStatus || 'pending').toLowerCase();
                    const cls = s === 'completed' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'in_progress' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{rec.clearanceStatus === 'completed' ? 'Completed' : rec.clearanceStatus === 'in_progress' ? 'In Progress' : 'Pending'}</span>;
                  },
                  sortValue: (rec: ExitRecord) => rec.clearanceStatus || '',
                },
                {
                  key: 'clearanceCompletedAt', header: 'Clearance Date', sortable: true,
                  render: (rec: ExitRecord) => <span className="text-sm text-[#64748B]">{rec.clearanceCompletedAt ? formatAppDate(rec.clearanceCompletedAt) : '-'}</span>,
                  sortValue: (rec: ExitRecord) => rec.clearanceCompletedAt || '',
                },
              ]}
              actions={(rec: ExitRecord) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => { setSelectedExit(rec); setCheckedItems(new Set()); }}
                    className="p-2 text-[#059669] hover:bg-[#059669]/10 rounded-lg transition-colors"
                    title="Manage clearance"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setViewClearanceId(rec.id);
                      setClearanceFormData({
                        employeeName: rec.employeeName || '',
                        employeeCode: rec.employeeCode || '',
                        email: rec.email || '',
                        companyName: rec.companyName || '',
                        departmentName: rec.departmentName || '',
                        exitType: rec.exitType || '',
                        exitDate: rec.exitDate || '',
                        lastWorkingDay: rec.lastWorkingDay || '',
                      });
                    }}
                    className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"
                    title="View clearance details"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem('token');
                        const resp = await fetch(`/api/exit-records/${rec.id}/clearance/pdf`, {
                          headers: { Authorization: `Bearer ${token}` }
                        });
                        if (!resp.ok) throw new Error('Download failed');
                        const blob = await resp.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `clearance_${rec.employeeName || rec.id}.pdf`;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(url);
                        toast.success('PDF downloaded');
                      } catch { toast.error('Failed to download PDF'); }
                    }}
                    className="p-2 text-[#475569] hover:bg-[#475569]/10 rounded-lg transition-colors"
                    title="Download clearance PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEdit(rec)}
                    className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(rec.id)}
                    className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            />
          </div>
        )}

        {/* Clearance Management Modal - Full Page */}
        {activeTab === 'clearance' && selectedExit && (
          <div className="fixed inset-0 z-50 flex">
            <div className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`} onClick={() => setSelectedExit(null)} />
            <div className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#10B981bb] flex items-center justify-center text-white shadow-sm">
                      <ClipboardCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] leading-tight">Clearance — {selectedExit.employeeName}</h2>
                      <p className="text-xs text-[#64748B]">{[selectedExit.companyName, selectedExit.branchName, selectedExit.departmentName].filter(Boolean).join(' — ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedExit(null)} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                    <button onClick={() => setSelectedExit(null)} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                  <p className="text-[11px] text-[#B45309]">
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    Mark all clearance items as complete. Once all items are checked, you can confirm clearance.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-semibold text-[#0F172A] mb-3">Checklist</h4>
                      <div className="space-y-3">
                        {clearanceItems.length === 0 ? (
                          <p className="text-sm text-[#64748B]">Loading checklist...</p>
                        ) : (
                          Object.entries(
                            clearanceItems.reduce((acc: Record<string, typeof clearanceItems>, it) => {
                              const dept = it.department || 'General';
                              (acc[dept] = acc[dept] || []).push(it);
                              return acc;
                            }, {})
                          ).map(([dept, items]) => (
                            <div key={dept} className="border border-[var(--border-color)] rounded-lg p-3">
                              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{dept}</h3>
                              <div className="space-y-1.5">
                                {items.map((item) => (
                                  <label key={item.item} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                                    <input
                                      type="checkbox"
                                      className="rounded accent-[#1C64F2]"
                                      checked={checkedItems.has(item.item)}
                                      onChange={() => {
                                        const next = new Set(checkedItems);
                                        if (next.has(item.item)) next.delete(item.item);
                                        else next.add(item.item);
                                        setCheckedItems(next);
                                      }}
                                    />
                                    <span>{item.item}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <button
                          onClick={() => setCheckedItems(new Set(clearanceItems.map((i) => i.item)))}
                          className="flex-1 px-4 py-2.5 bg-[#059669] text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
                        >
                          Mark All Clear
                        </button>
                        <button
                          onClick={() => setCheckedItems(new Set())}
                          className="px-4 py-2.5 border border-[var(--border-color)] text-[#64748B] rounded-xl text-sm font-medium hover:bg-[#F8FAFC] transition-colors"
                        >
                          Reset
                        </button>
                      </div>
                      {checkedItems.size > 0 && checkedItems.size === clearanceItems.length && selectedExit.clearanceStatus !== 'completed' && (
                        <button
                          onClick={() => markClearance.mutate(selectedExit.id)}
                          disabled={markClearance.isPending}
                          className="mt-3 w-full px-4 py-2.5 bg-[#1C64F2] text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
                        >
                          {markClearance.isPending ? 'Saving...' : 'Confirm Clearance Complete'}
                        </button>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[#0F172A] mb-3">Documents</h4>
                      <div className="space-y-3">
                        {[
                          { name: 'Experience Letter', icon: FileText, type: 'experience-letter' },
                          { name: 'Relieving Letter', icon: FileText, type: 'relieving-letter' },
                          { name: 'Full & Final Settlement', icon: FileText, type: 'fnf' },
                          { name: 'Form 16 (TDS)', icon: FileText, type: 'form16' },
                        ].map(doc => (
                          <div key={doc.name} className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg">
                            <div className="flex items-center gap-2">
                              <doc.icon className="w-4 h-4 text-[var(--primary-blue)]" />
                              <span className="text-sm text-[var(--text-secondary)]">{doc.name}</span>
                            </div>
                            <a
                              href={`/api/exit-records/${selectedExit.id}/document/${doc.type}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white bg-[#1C64F2] hover:bg-blue-700 transition-colors"
                            >
                              <Download className="w-3 h-3" /> Generate
                            </a>
                          </div>
                        ))}
                      </div>
                      {selectedExit.clearanceStatus === 'completed' && (
                        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> Clearance complete for this exit record.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

{/* CLEARANCE VIEW/EDIT MODAL */}
        {viewClearanceId && (
          <div className="fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => setViewClearanceId(null)} />
            <div className="fixed inset-0 bg-white shadow-2xl">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#10B981bb] flex items-center justify-center text-white shadow-sm">
                      <ClipboardCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] leading-tight">Clearance Details</h2>
                      <p className="text-xs text-[#64748B]">{clearanceFormData.employeeName || 'Employee'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveClearanceMutation.mutate({ exitId: viewClearanceId, data: clearanceFormData })}
                      disabled={saveClearanceMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10">
                      {saveClearanceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {saveClearanceMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={async () => {
                      try {
                        const token = localStorage.getItem('token');
                        const resp = await fetch(`/api/exit-records/${viewClearanceId}/clearance/pdf`, {
                          headers: { Authorization: `Bearer ${token}` }
                        });
                        if (!resp.ok) throw new Error('Failed');
                        const blob = await resp.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `clearance_${clearanceFormData.employeeName || viewClearanceId}.pdf`;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(url);
                        toast.success('PDF downloaded');
                      } catch { toast.error('Failed to download PDF'); }
                    }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-[#475569] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-colors">
                      <Download className="w-4 h-4" /> PDF
                    </button>
                    <button onClick={() => setViewClearanceId(null)} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                  <p className="text-[11px] text-[#B45309]">
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    Review and update the clearance details. Click Save to save changes, then download the PDF.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(clearanceFormData).map(([key, value]) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-[#0F172A] mb-1">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setClearanceFormData(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

{/* ADD/EDIT MODAL */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
              onClick={closeModal}
            />
            <div className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${isClosing ? 'opacity-0' : 'opacity-100'}`}>
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#EF4444] to-[#EF4444bb] flex items-center justify-center text-white shadow-sm">
                      <LogOut className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                        {editingItem ? 'Edit Exit Record' : 'Add Exit Record'}
                      </h2>
                      <p className="text-xs text-[#64748B]">Fill in the exit record details below and click Save to confirm.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      form="exit-form"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
                    >
                      {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingItem ? 'Update' : 'Create'}
                    </button>
                    <button
                      onClick={closeModal}
                      className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                  <p className="text-[11px] text-[#B45309]">
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    Fill in the exit record details below and click Save to confirm.
                  </p>
                </div>

                <form id="exit-form" onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                      {/* Employee Info (auto-filled) */}
                      {editingItem && (
                        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
                              <User className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[#0F172A]">{editingItem.employeeName}</p>
                              <p className="text-xs text-[#64748B]">{editingItem.departmentName || ''}{editingItem.companyName ? ` · ${editingItem.companyName}` : ''}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <section>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                          <span className="w-1.5 h-4 rounded-full bg-[#F59E0B]" /> Exit Details
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          {!editingItem && (
                            <div>
                              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Employee <span className="text-xs font-normal text-[var(--text-disabled)]">(Inactive employees only)</span></label>
                              <SearchableSelect
                                value={formData.employeeId}
                                onChange={(val) => setFormData(f => ({ ...f, employeeId: val.toString() }))}
                                options={employees.map((emp: Employee) => {
                                  const companyName = (emp as unknown as { company?: { name?: string } }).company?.name
                                    || (emp as unknown as { companyName?: string }).companyName || '';
                                  const deptName = (emp as unknown as { department?: { name?: string } }).department?.name
                                    || (emp as unknown as { departmentName?: string }).departmentName || '';
                                  return {
                                    id: String(emp.id),
                                    name: `${formatEmployeeLabel(emp)}${companyName || deptName ? ` · ${[companyName, deptName].filter(Boolean).join(' · ')}` : ''}`,
                                  };
                                })}
                                placeholder="Search inactive employees..."
                                className="w-full"
                              />
                              <p className="mt-1 text-xs text-gray-400">Select the employee being exited</p>
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Exit Type</label>
                            <select value={formData.exitType} onChange={e => setFormData(f => ({ ...f, exitType: e.target.value }))}
                              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none text-[var(--text-primary)]">
                              {exitTypeOptions.map((opt: { code: string; name: string }) => (
                                <option key={opt.code} value={opt.code}>{opt.name}</option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-400">Type of exit · resigned, terminated, etc.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Exit Date</label>
                            <DatePicker value={formData.exitDate} onChange={(val) => setFormData(f => ({ ...f, exitDate: val }))} required />
                            <p className="mt-1 text-xs text-gray-400">Date the exit took effect</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Last Working Day</label>
                            <DatePicker value={formData.lastWorkingDay} onChange={(val) => setFormData(f => ({ ...f, lastWorkingDay: val }))} />
                            <p className="mt-1 text-xs text-gray-400">Employee's final working day</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Notice Period Served</label>
                            <select value={formData.noticePeriodServed} onChange={e => setFormData(f => ({ ...f, noticePeriodServed: e.target.value }))}
                              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none text-[var(--text-primary)]">
                              {noticePeriodOptions.map((opt: { code: string; name: string }) => (
                                <option key={opt.code} value={opt.code}>{opt.name}</option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-400">Whether the notice period was served</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Exit Reason</label>
                            <textarea value={formData.reason} onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))} rows={3}
                              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none text-[var(--text-primary)] resize-none" />
                            <p className="mt-1 text-xs text-gray-400">Reason for the exit</p>
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                          <span className="w-1.5 h-4 rounded-full bg-[#10B981]" /> Additional Details
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Description</label>
                            <textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} rows={3}
                              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none text-[var(--text-primary)] resize-none" />
                            <p className="mt-1 text-xs text-gray-400">Additional description of the exit</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Notes</label>
                            <textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} rows={3}
                              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none text-[var(--text-primary)] resize-none" />
                            <p className="mt-1 text-xs text-gray-400">Internal notes about the exit</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Remarks</label>
                            <textarea value={formData.remarks} onChange={e => setFormData(f => ({ ...f, remarks: e.target.value }))} rows={3}
                              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none text-[var(--text-primary)] resize-none" />
                            <p className="mt-1 text-xs text-gray-400">Any additional remarks</p>
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* DELETE CONFIRM */}
        <Modal isOpen={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeletingId(null); }} title="Confirm Delete">
          <p className="text-sm text-[var(--text-secondary)] mb-4">Are you sure you want to delete this exit record? This will also remove the associated archived record.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowDeleteConfirm(false); setDeletingId(null); }}
              className="px-4 py-2 border border-[var(--border-color)] rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[#F1F5F9]">Cancel</button>
            <button onClick={() => deletingId && deleteMutation.mutate(deletingId)} disabled={deleteMutation.isPending}
              className="px-6 py-2 bg-[var(--danger-red)] text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>

        {/* ARCHIVE CONFIRM */}
        <Modal isOpen={!!archiveConfirmTarget} onClose={() => { if (!archiveExit.isPending) setArchiveConfirmTarget(null); }} title="Archive Employee">
          <div className="p-2">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                <Archive className="w-8 h-8 text-[#0D9488]" />
              </div>
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">Are you sure?</h3>
              <p className="text-[#64748B] mb-6">
                FnF settlement and clearance are both complete for{' '}
                <span className="font-semibold text-[#0F172A]">{archiveConfirmTarget?.employeeName}</span>.
                Archiving will move this record to the <b>Archive</b> section on the Employees page. You can
                restore the employee later from there.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => setArchiveConfirmTarget(null)} disabled={archiveExit.isPending}
                  className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors">
                  Cancel
                </button>
                <button onClick={() => archiveConfirmTarget && archiveExit.mutate(archiveConfirmTarget.id)} disabled={archiveExit.isPending}
                  className="flex-1 px-4 py-2.5 bg-[#0D9488] text-white font-medium rounded-xl hover:bg-[#0F766E] transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  {archiveExit.isPending ? (
                    <>
                      null
                      Archiving...
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" />
                      Yes, Archive
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Bulk Upload Modal */}
        <Modal isOpen={showBulkUpload} onClose={() => { setShowBulkUpload(false); setUploadFile(null); }} title="Bulk Upload Exit Records">
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <strong>Instructions:</strong>
              <br />1. Upload a CSV with columns: <code className="font-mono">employee_code</code> or <code className="font-mono">email</code>, <code className="font-mono">exit_type</code>, <code className="font-mono">exit_date</code>, <code className="font-mono">last_working_day</code>, <code className="font-mono">reason</code>
              <br />2. Each row must match an existing employee by code or email
              <br />3. Exit records are created with pending FnF and clearance status
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Upload CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-[var(--primary-blue)] focus:border-transparent outline-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowBulkUpload(false); setUploadFile(null); }}
                className="flex-1 px-4 py-2.5 border border-[var(--border-color)] text-[var(--text-secondary)] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors">
                Cancel
              </button>
              <button onClick={() => uploadFile && bulkUploadMutation.mutate(uploadFile)} disabled={!uploadFile || bulkUploadMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[var(--primary-blue)] text-white font-medium rounded-xl hover:bg-[#1E40AF] transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {bulkUploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {bulkUploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </Modal>

        <BulkDeleteModal
          isOpen={!!bulkDeleteTarget}
          onClose={() => setBulkDeleteTarget(null)}
          onConfirm={() => {
            if (!bulkDeleteTarget) return;
            bulkDeleteTarget.items.forEach((r) => handleDelete(r.id));
            setBulkDeleteTarget(null);
          }}
          count={bulkDeleteTarget?.items.length ?? 0}
          entityType="exit record"
          consequences={['Exit records will be permanently removed', 'Clearance and FnF tracking will be lost']}
          isDeleting={deleteMutation.isPending}
        />
        <ConfirmActionModal
          isOpen={!!restoreTarget}
          title="Revive Employee"
          message={`Revive ${restoreTarget?.employeeName || ''} back to Inactive Employees?`}
          consequence="The exit record will be deleted and the employee will be restored to inactive status. You can reactivate them from the Employee Management page."
          confirmLabel="Revive"
          variant="success"
          onConfirm={async () => {
            if (restoreTarget) {
              await performRestoreExit(restoreTarget);
              setRestoreTarget(null);
            }
          }}
          onCancel={() => setRestoreTarget(null)}
        />
      </div>
    </div>
  );
}


