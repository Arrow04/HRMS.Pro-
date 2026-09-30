import { useState } from 'react';
import type { LeaveApplication, LeaveBalance, Company, Department, Branch } from '../types';
import {
  Plus, CheckCircle2, XCircle, RotateCcw, Clock, CalendarDays, CalendarCheck, Edit2, Trash2, X,
  Calendar, Filter, User, Download, Upload, Loader2, Info, CreditCard, Sparkles, Settings, RefreshCw, Award
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import LeaveTemplateManager from '../components/LeaveTemplateManager';
import toast from 'react-hot-toast';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { normalizePickerEmployee, formatEmployeeLabel } from '../utils/employeePickerUtils';
import { formatAppDate } from '../services/appSettingsService';
import { runAutomation } from '../services/aiAutomation';
import Tooltip from '../components/Tooltip';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ConfirmActionModal from '../components/ConfirmActionModal';
import ToggleSwitch from '../components/ToggleSwitch';
import DateRangePicker from '../components/DateRangePicker';
import SearchableSelect from '../components/SearchableSelect';
import EmployeeScopedCascade from '../components/EmployeeScopedCascade';
import FormGrid from '../components/FormGrid';
import FormField, { formInputClass, formTextareaClass } from '../components/FormField';
import DocumentUpload from '../components/DocumentUpload';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import BulkDeleteModal from '../components/BulkDeleteModal';
import { getLeaveStatusBadge, getAttendanceStatusBadge, capitalizeStatus } from '../utils/statusUtils';
import DatePicker from '../components/DatePicker';
import TimePicker from '../components/TimePicker';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import QueryErrorState from '../components/QueryErrorState';

const TABS = [
  { id: 'requests', label: 'Leave Requests', icon: CalendarDays },
  { id: 'types', label: 'Leave Types', icon: Calendar },
  { id: 'balance', label: 'Balance', icon: Clock },
  { id: 'configuration', label: 'Configuration', icon: Settings },
];

interface MasterDataItem {
  id: number;
  code?: string;
  name: string;
  value?: string;
  label?: string;
  is_active?: boolean;
}

interface LeaveTypeRow {
  id: number;
  name: string;
  code?: string;
  days_allowed?: number;
  company_id?: number | null;
  organization_id?: number;
  status?: string;
  is_paid?: boolean;
  is_encashable?: boolean;
  color?: string;
}

type LeaveRow = LeaveApplication & {
  leaveType?: string;
  branchId?: number;
  email?: string;
  companyName?: string;
  branchName?: string;
  departmentName?: string;
};

type BalanceRow = LeaveBalance & {
  employeeName?: string;
  employeeCode?: string;
  email?: string;
};

type BalanceRowWithScope = BalanceRow & {
  company_id?: number | string | null;
  branch_id?: number | string | null;
  department_id?: number | string | null;
};

interface ApprovalHistoryEntry {
  id: number;
  action: string;
  approverName?: string;
  approvalLevel?: number;
  newStatus?: string;
  comments?: string;
  createdAt?: string;
}

const LeaveManagement = () => {
  const queryClient = useQueryClient();
const [activeTab, setActiveTab] = useState('requests');
const [searchTerm, setSearchTerm] = useState('');
const [leaveTypeStatusFilter, setLeaveTypeStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
const [leaveTypeCompanyFilter, setLeaveTypeCompanyFilter] = useState<string>('all');
const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(false);
const [editingLeaveTypeId, setEditingLeaveTypeId] = useState<number | null>(null);
const [leaveTypeForm, setLeaveTypeForm] = useState({ name: '', code: '', days_allowed: 12, company_id: '' as string, is_paid: true, is_encashable: false, color: '#1C64F2' });

  const [initBalanceState, setInitBalanceState] = useState<{ employeeId: string; loading: boolean }>({ employeeId: '', loading: false });
  const [showInitBalanceConfirm, setShowInitBalanceConfirm] = useState(false);

  const initBalanceForAll = () => {
    setShowInitBalanceConfirm(true);
  };
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [newLeave, setNewLeave] = useState({
    employeeId: '',
    leaveTypeId: '',
    organizationId: '',
    companyId: '',
    branchId: '',
    departmentId: '',
    startDate: '',
    endDate: '',
    totalDays: 0,
    startTime: '',
    endTime: '',
    reason: '',
    purpose: '',
    description: '',
    attachmentUrl: '',
    approverId: '',
    rejectionReason: '',
    comments: '',
    balanceDeducted: 0,
    carryForwardUsed: 0,
    compensatoryOffUsed: 0,
    emergencyContact: '',
    emergencyPhone: '',
    workHandoverTo: '',
    handoverNotes: '',
    isHalfDay: false,
    isPaid: true,
    isPrivilege: false,
    rescheduledFrom: '',
    rescheduledTo: '',
    rescheduleReason: ''
  });
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number, name: string } | null>(null);
  const [editingLeave, setEditingLeave] = useState<LeaveRow | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ items: LeaveRow[] } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'approve' | 'reject'; items: LeaveRow[] } | null>(null);
  const [deleteLeaveTypeTarget, setDeleteLeaveTypeTarget] = useState<LeaveTypeRow | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [historyLeaveId, setHistoryLeaveId] = useState<number | null>(null);

  const { data: approvalHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['leave-history', historyLeaveId],
    queryFn: async () => {
      if (!historyLeaveId) return [];
      try { const r = await api.get(`/leaves/${historyLeaveId}/history`); return r.data || []; } catch { return []; }
    },
    enabled: !!historyLeaveId && showHistoryModal,
  });

  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterCompany] = useState<string>('all');
  const [filterBranch] = useState<string>('all');
  const [filterDepartment] = useState<string>('all');

  const { data: balances = [], isLoading: balanceLoading } = useQuery<BalanceRowWithScope[]>({
    queryKey: ['leave-balances', filterYear],
    queryFn: async () => {
      try { const r = await api.get('/leave-balances', { params: { year: filterYear || undefined, limit: 500, page: 1 } }); return r.data?.data ?? r.data ?? []; } catch { return []; }
    },
  });
  const filteredBalances = balances.filter((b) => {
    if (filterCompany !== 'all' && String(b.company_id) !== String(filterCompany)) return false;
    if (filterBranch !== 'all' && String(b.branch_id) !== String(filterBranch)) return false;
    if (filterDepartment !== 'all' && String(b.department_id) !== String(filterDepartment)) return false;
    return true;
  });

    const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { const r = await api.get('/companies'); return r.data || []; },
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

  
  const { data: pickerEmployees = [] } = useEmployeePicker({ status: 'active' });
  const employees = pickerEmployees.map(normalizePickerEmployee);

  const { data: leaves = [], isLoading: loadingLeaves, isFetching, isError: leavesError, refetch: refetchLeaves } = useQuery({
    queryKey: ['leaves', includeInactive],
    queryFn: async () => {
      const response = await api.get('/leaves', { params: { includeInactive } });
      return response.data || [];
    },
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'requests',
  });

  const { data: leaveTypes = [], isError: leaveTypesError, refetch: refetchLeaveTypes } = useQuery<LeaveTypeRow[]>({
    queryKey: ['leave-types', leaveTypeCompanyFilter],
    queryFn: async () => {
      const params = leaveTypeCompanyFilter !== 'all' ? { companyId: Number(leaveTypeCompanyFilter) } : {};
      const r = await api.get('/leave-types', { params });
      return r.data || [];
    },
  });
  const { data: leavePurposes = [] } = useMasterData('LEAVE_PURPOSE');
  const { data: leaveStatusOptions = [] } = useMasterData('LEAVE_STATUS');

  const filteredLeaveTypes = leaveTypes.filter((type: LeaveTypeRow) => {
    const matchesStatus = leaveTypeStatusFilter === 'all'
      ? true
      : leaveTypeStatusFilter === 'active'
        ? type.status !== 'inactive'
        : type.status === 'inactive';
    return matchesStatus;
  });

  const { data: stats = { pending: 0, approved: 0, rejected: 0, total: 0, approvedToday: 0, rejectedToday: 0, totalMonth: 0 } } = useQuery({
    queryKey: ['leave-stats'],
    queryFn: async () => {
      const response = await api.get('/leaves/stats');
      return response.data || { pending: 0, approved: 0, rejected: 0, total: 0, approvedToday: 0, rejectedToday: 0, totalMonth: 0 };
    },
    staleTime: 60 * 1000,
  });

  const applyMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const fd = new FormData();
      if (payload.employeeId) fd.append('employeeId', String(payload.employeeId));
      if (payload.leaveTypeId) fd.append('leaveTypeId', String(payload.leaveTypeId));
      if (payload.startDate) fd.append('startDate', String(payload.startDate));
      if (payload.endDate) fd.append('endDate', String(payload.endDate));
      if (payload.reason) fd.append('reason', String(payload.reason));
      if (payload.description) fd.append('description', String(payload.description));
      if (payload.isHalfDay) fd.append('isHalfDay', 'true');
      if (payload.attachment) fd.append('attachment', payload.attachment as Blob);
      return api.post('/leaves', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      toast.success('Leave application submitted');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setShowApplyModal(false);
      setNewLeave({
        employeeId: '',
        leaveTypeId: '',
        organizationId: '',
        companyId: '',
        branchId: '',
        departmentId: '',
        startDate: '',
        endDate: '',
        totalDays: 0,
        startTime: '',
        endTime: '',
        reason: '',
        purpose: '',
        description: '',
        attachmentUrl: '',
        approverId: '',
        rejectionReason: '',
        comments: '',
        balanceDeducted: 0,
        carryForwardUsed: 0,
        compensatoryOffUsed: 0,
        emergencyContact: '',
        emergencyPhone: '',
        workHandoverTo: '',
        handoverNotes: '',
        isHalfDay: false,
        isPaid: true,
        isPrivilege: false,
        rescheduledFrom: '',
        rescheduledTo: '',
        rescheduleReason: ''
      });
    },
    onError: () => toast.error('Failed to apply for leave')
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => api.put(`/leaves/${id}/approve`),
    onSuccess: () => {
      toast.success('Leave updated successfully');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setShowApplyModal(false);
    },
    onError: () => toast.error('Failed to update leave')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/leaves/${id}`),
    onSuccess: () => {
      toast.success('Leave deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: () => toast.error('Failed to delete leave'),
    onSettled: () => setDeleteTarget(null)
  });

  const updateLeaveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => api.put(`/leaves/${id}`, payload),
    onSuccess: () => {
      toast.success('Leave updated successfully');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setEditingLeave(null);
      setShowApplyModal(false);
    },
    onError: () => toast.error('Failed to update leave'),
  });

  
  const handleDelete = (id: number, name: string) => {
    setDeleteTarget({ id, name });
  };

  const handleEditLeave = (leave: LeaveRow) => {
    setEditingLeave(leave);
    setNewLeave({
      employeeId: leave.employeeId ? String(leave.employeeId) : '',
      leaveTypeId: leave.leaveTypeId ? String(leave.leaveTypeId) : '',
      organizationId: leave.organizationId ? String(leave.organizationId) : '',
      companyId: leave.companyId ? String(leave.companyId) : '',
      branchId: leave.branchId ? String(leave.branchId) : '',
      departmentId: leave.departmentId ? String(leave.departmentId) : '',
      startDate: leave.startDate ? String(leave.startDate).slice(0, 10) : '',
      endDate: leave.endDate ? String(leave.endDate).slice(0, 10) : '',
      totalDays: leave.totalDays || 0,
      startTime: '',
      endTime: '',
      reason: leave.reason || '',
      purpose: '',
      description: '',
      attachmentUrl: '',
      approverId: leave.approverId ? String(leave.approverId) : '',
      rejectionReason: leave.rejectionReason || '',
      comments: '',
      balanceDeducted: 0,
      carryForwardUsed: 0,
      compensatoryOffUsed: 0,
      emergencyContact: '',
      emergencyPhone: '',
      workHandoverTo: '',
      handoverNotes: '',
      isHalfDay: leave.isHalfDay || false,
      isPaid: leave.isPaid ?? true,
      isPrivilege: leave.isPrivilege || false,
      rescheduledFrom: '',
      rescheduledTo: '',
      rescheduleReason: ''
    });
    setShowApplyModal(true);
  };

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => api.put(`/leaves/${id}/reject`),
    onSuccess: () => {
      toast.success('Leave rejected');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: () => toast.error('Failed to reject leave')
  });

  const handleToggleLeaveTypeStatus = async (type: LeaveTypeRow) => {
    try {
      const newStatus = type.status === 'inactive' ? 'active' : 'inactive';
      await api.put(`/leave-types/${type.id}`, { status: newStatus });
      toast.success(`Leave type ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(`Failed to toggle status: ${err.response?.data?.detail || err.message}`);
    }
  };

  const saveLeaveTypeMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingLeaveTypeId ? api.put(`/leave-types/${editingLeaveTypeId}`, payload) : api.post('/leave-types', payload),
    onSuccess: () => {
      toast.success('Leave type saved');
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      setShowLeaveTypeModal(false);
      setEditingLeaveTypeId(null);
    },
    onError: () => toast.error('Failed to save leave type'),
  });

  const toggleLeaveTypeMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) => api.put(`/leave-types/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leave-types'] }),
    onError: () => toast.error('Failed to update leave type'),
  });

  const deleteLeaveTypeMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/leave-types/${id}`),
    onSuccess: () => { toast.success('Leave type deactivated'); queryClient.invalidateQueries({ queryKey: ['leave-types'] }); setDeleteTarget(null); },
    onError: () => { toast.error('Failed to delete leave type'); setDeleteTarget(null); },
  });

  const openAddLeaveType = () => {
    setEditingLeaveTypeId(null);
    setLeaveTypeForm({ name: '', code: '', days_allowed: 12, company_id: leaveTypeCompanyFilter === 'all' ? '' : leaveTypeCompanyFilter, is_paid: true, is_encashable: false, color: '#1C64F2' });
    setShowLeaveTypeModal(true);
  };

  const openEditLeaveType = (type: LeaveTypeRow) => {
    setEditingLeaveTypeId(type.id);
    setLeaveTypeForm({ name: type.name, code: type.code || '', days_allowed: type.days_allowed ?? 12, company_id: type.company_id != null ? String(type.company_id) : '', is_paid: type.is_paid !== false, is_encashable: !!type.is_encashable, color: type.color || '#1C64F2' });
    setShowLeaveTypeModal(true);
  };

  const submitLeaveType = () => {
    saveLeaveTypeMutation.mutate({
      name: leaveTypeForm.name.trim(),
      code: leaveTypeForm.code || leaveTypeForm.name.toLowerCase().replace(/\s+/g, '_'),
      daysAllowed: Number(leaveTypeForm.days_allowed) || 0,
      companyId: leaveTypeForm.company_id ? Number(leaveTypeForm.company_id) : null,
      isPaid: leaveTypeForm.is_paid,
      isEncashable: leaveTypeForm.is_encashable,
      color: leaveTypeForm.color,
    });
  };

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/leaves/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: (data: { data?: { created?: number; updated?: number } }) => {
      toast.success(`Bulk upload completed: ${data.data?.created || 0} created, ${data.data?.updated || 0} updated`);
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setShowBulkUpload(false);
      setUploadFile(null);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Bulk upload failed: ${err.response?.data?.message || err.message}`);
    }
  });

  // Download template function
  const downloadTemplate = async () => {
    try {
      const response = await api.get('/leaves/template', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'leave_bulk_upload_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowApplyModal(false);
      setEditingLeave(null);
      setIsClosing(false);
      setNewLeave({
        employeeId: '',
        leaveTypeId: '',
        organizationId: '',
        companyId: '',
        branchId: '',
        departmentId: '',
        startDate: '',
        endDate: '',
        totalDays: 0,
        startTime: '',
        endTime: '',
        reason: '',
        purpose: '',
        description: '',
        attachmentUrl: '',
        approverId: '',
        rejectionReason: '',
        comments: '',
        balanceDeducted: 0,
        carryForwardUsed: 0,
        compensatoryOffUsed: 0,
        emergencyContact: '',
        emergencyPhone: '',
        workHandoverTo: '',
        handoverNotes: '',
        isHalfDay: false,
        isPaid: true,
        isPrivilege: false,
        rescheduledFrom: '',
        rescheduledTo: '',
        rescheduleReason: ''
      });
    }, 300);
  };

  const renderLeaveForm = () => {
    const Field = FormField;
    const calcLeaveDays = (s: string, e: string) => {
      if (!s || !e) return 0;
      const start = new Date(s), end = new Date(e);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
      return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    };
    return (
      <>
        <EmployeeScopedCascade
          companies={companies}
          companyId={newLeave.companyId ? String(newLeave.companyId) : ''}
          branchId={newLeave.branchId ? String(newLeave.branchId) : ''}
          departmentId={newLeave.departmentId ? String(newLeave.departmentId) : ''}
          employeeId={newLeave.employeeId ? String(newLeave.employeeId) : ''}
          onScopeChange={(patch) => setNewLeave((prev) => ({ ...prev, ...patch }))}
          onCompanyChange={(val) => setNewLeave((prev) => ({ ...prev, companyId: val }))}
          onBranchChange={(val) => setNewLeave((prev) => ({ ...prev, branchId: val }))}
          onDepartmentChange={(val) => setNewLeave((prev) => ({ ...prev, departmentId: val }))}
          onEmployeeChange={(val) => setNewLeave((prev) => ({ ...prev, employeeId: val }))}
        />

        <FormGrid className="mt-4">
          <Field label="Start Date" required help="First day of leave">
            <DatePicker value={newLeave.startDate} onChange={(val) => setNewLeave({ ...newLeave, startDate: val, totalDays: calcLeaveDays(val, newLeave.endDate) })} />
          </Field>
          <Field label="End Date" required help="Last day of leave (leave blank if one-day leave)">
            <DatePicker value={newLeave.endDate} onChange={(val) => setNewLeave({ ...newLeave, endDate: val, totalDays: calcLeaveDays(newLeave.startDate, val) })} />
          </Field>

          {/* Leave Start Time / Leave End Time / Leave Type */}
          <Field label="Leave Start Time" help="Leave start time (half-day only)">
            <TimePicker value={newLeave.startTime} onChange={(val) => setNewLeave({ ...newLeave, startTime: val })} />
          </Field>
          <Field label="Leave End Time" help="Leave end time (half-day only)">
            <TimePicker value={newLeave.endTime} onChange={(val) => setNewLeave({ ...newLeave, endTime: val })} />
          </Field>
          <Field label="Leave Type" required help="Leave type, e.g. Sick or Casual">
            <select className={formInputClass} value={newLeave.leaveTypeId} onChange={e => setNewLeave({ ...newLeave, leaveTypeId: e.target.value })}>
              <option value="">Select Type</option>
              {leaveTypes.map((t: MasterDataItem) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>

          {/* Total Days / Leave Purpose / Work Handover To */}
          <Field label="Total Days" help="Auto-calculated leave days">
            <input type="number" readOnly className={`${formInputClass} bg-[var(--background)] font-semibold`} value={newLeave.totalDays} />
          </Field>
          <Field label="Leave Purpose" help="Purpose of the leave">
            <select className={formInputClass} value={newLeave.purpose} onChange={e => setNewLeave({ ...newLeave, purpose: e.target.value })}>
              <option value="">Select Purpose</option>
              {leavePurposes.map((opt: MasterDataItem) => (
                <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
              ))}
            </select>
          </Field>
          <Field label="Work Handover To" help="Colleague handling work during leave">
            <select className={formInputClass} value={newLeave.workHandoverTo} onChange={e => setNewLeave({ ...newLeave, workHandoverTo: e.target.value })}>
              <option value="">Select Colleague</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {formatEmployeeLabel(emp) || emp.email}
                </option>
              ))}
            </select>
          </Field>

          {/* Handover Notes / Emergency Contact Name / Emergency Contact Number */}
          <Field label="Handover Notes" help="Tasks and responsibilities to hand over">
            <textarea className={formTextareaClass} value={newLeave.handoverNotes} onChange={e => setNewLeave({ ...newLeave, handoverNotes: e.target.value })} placeholder="Tasks and responsibilities to hand over..." />
          </Field>
          <Field label="Emergency Contact Name" help="Emergency contact person name">
            <input className={formInputClass} value={newLeave.emergencyContact} onChange={e => setNewLeave({ ...newLeave, emergencyContact: e.target.value })} placeholder="Contact person name" />
          </Field>
          <Field label="Emergency Contact Number" help="Emergency contact phone number">
            <input className={formInputClass} value={newLeave.emergencyPhone} onChange={e => setNewLeave({ ...newLeave, emergencyPhone: e.target.value })} placeholder="Contact phone number" />
          </Field>

          {/* Upload / Description / Reason */}
          <Field label="Upload Document" help="Medical certificate or other documents">
            <DocumentUpload
              label="Upload Document"
              docType="LEAVE"
              employeeId={newLeave.employeeId ? Number(newLeave.employeeId) : undefined}
              existingUrl={newLeave.attachmentUrl || undefined}
              onFileChange={() => {}}
              onUploaded={(url) => setNewLeave({ ...newLeave, attachmentUrl: url })}
              onDelete={() => setNewLeave({ ...newLeave, attachmentUrl: '' })}
              hideLabel
              compact
              className="w-full"
            />
          </Field>
          <Field label="Description" help="Additional details about the leave">
            <textarea className={formTextareaClass} value={newLeave.description} onChange={e => setNewLeave({ ...newLeave, description: e.target.value })} placeholder="Additional details..." />
          </Field>
          <Field label="Reason" required help="Reason for the leave request">
            <textarea className={formTextareaClass} value={newLeave.reason} onChange={e => setNewLeave({ ...newLeave, reason: e.target.value })} placeholder="Enter reason for leave..." />
          </Field>
        </FormGrid>

        {/* Section: Advanced */}
        <section>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-[#1C64F2]" /> Advanced
          </h3>
          <FormGrid>
            <Field label="Half Day Leave" help="Enable for half-day leave">
              <div className={`${formInputClass} flex items-center justify-end bg-white`}>
                <ToggleSwitch checked={newLeave.isHalfDay} onChange={(v) => setNewLeave({ ...newLeave, isHalfDay: v })} helpText={newLeave.isHalfDay ? 'Half day leave enabled' : 'Click to enable half day leave'} />
              </div>
            </Field>
            <Field label="Paid Leave" help="Enable paid leave">
              <div className={`${formInputClass} flex items-center justify-end bg-white`}>
                <ToggleSwitch checked={newLeave.isPaid} onChange={(v) => setNewLeave({ ...newLeave, isPaid: v })} helpText={newLeave.isPaid ? 'Paid leave enabled' : 'Click to enable paid leave'} />
              </div>
            </Field>
            <Field label="Privilege Leave" help="Enable privilege leave">
              <div className={`${formInputClass} flex items-center justify-end bg-white`}>
                <ToggleSwitch checked={newLeave.isPrivilege} onChange={(v) => setNewLeave({ ...newLeave, isPrivilege: v })} helpText={newLeave.isPrivilege ? 'Privilege leave enabled' : 'Click to enable privilege leave'} />
              </div>
            </Field>
            <Field label="Balance Deducted" help="Days deducted from leave balance">
              <input type="number" className={formInputClass} value={newLeave.balanceDeducted} onChange={e => setNewLeave({ ...newLeave, balanceDeducted: parseInt(e.target.value) })} />
            </Field>
            <Field label="Carry Forward Used" help="Carry-forward days used">
              <input type="number" className={formInputClass} value={newLeave.carryForwardUsed} onChange={e => setNewLeave({ ...newLeave, carryForwardUsed: parseInt(e.target.value) })} />
            </Field>
            <Field label="Compensatory Off Used" help="Comp-off days used">
              <input type="number" className={formInputClass} value={newLeave.compensatoryOffUsed} onChange={e => setNewLeave({ ...newLeave, compensatoryOffUsed: parseInt(e.target.value) })} />
            </Field>
            <Field label="Rescheduled From" help="Original leave start date">
              <DatePicker value={newLeave.rescheduledFrom} onChange={(val) => setNewLeave({ ...newLeave, rescheduledFrom: val })} />
            </Field>
            <Field label="Rescheduled To" help="Rescheduled leave end date">
              <DatePicker value={newLeave.rescheduledTo} onChange={(val) => setNewLeave({ ...newLeave, rescheduledTo: val })} />
            </Field>
            <Field label="Reschedule Reason" help="Reason for rescheduling the leave">
              <input className={formInputClass} value={newLeave.rescheduleReason} onChange={e => setNewLeave({ ...newLeave, rescheduleReason: e.target.value })} placeholder="Reason for rescheduling..." />
            </Field>
          </FormGrid>
        </section>
      </>
    );
  };

  const filteredLeaves = leaves.filter((l: LeaveRow) => {
    const searchMatch = l.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) || l.leaveType?.toLowerCase().includes(searchTerm.toLowerCase());
    const companyMatch = companyFilter === 'all' || l.companyId === parseInt(companyFilter);
    const branchMatch = branchFilter === 'all' || l.branchId === parseInt(branchFilter);
    const deptMatch = departmentFilter === 'all' || l.departmentId === parseInt(departmentFilter);
    const statusMatch = statusFilter === 'all' || l.status?.toLowerCase() === statusFilter.toLowerCase();
    let dateMatch = true;
    if (startDate && endDate) {
       const lDate = new Date(l.startDate);
       const sDate = new Date(startDate);
       const eDate = new Date(endDate);
       dateMatch = lDate >= sDate && lDate <= eDate;
    } else if (startDate) {
       dateMatch = new Date(l.startDate) >= new Date(startDate);
    }
    return searchMatch && companyMatch && branchMatch && deptMatch && statusMatch && dateMatch;
  });


  const hasActiveFilters = companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all' || startDate !== '' || endDate !== '' || searchTerm !== '';

  const statCards = [
    { label: 'Leave Applied', value: stats.total, icon: Calendar, color: 'purple', tooltip: 'Total leave applications', trend: stats.total > 0 ? 5 : 0, onClick: () => { setActiveTab('requests'); setStatusFilter('all'); } },
    { label: 'Approval Pending', value: stats.pending, icon: Clock, color: 'orange', tooltip: 'Leave requests awaiting approval', trend: stats.pending > 0 ? -stats.pending : 0, onClick: () => { setActiveTab('requests'); setStatusFilter('pending'); } },
    { label: 'Approved', value: stats.approved, icon: CheckCircle2, color: 'green', tooltip: 'Approved leave requests', trend: stats.approved > 0 ? 12 : 0, onClick: () => { setActiveTab('requests'); setStatusFilter('approved'); } },
    { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'red', tooltip: 'Rejected leave requests', trend: stats.rejected > 0 ? -3 : 0, onClick: () => { setActiveTab('requests'); setStatusFilter('rejected'); } },
  ];

  const [hasLoaded, setHasLoaded] = useState(false);
  if (!hasLoaded && leaves.length > 0) setHasLoaded(true);

  const isInitialLeaveLoading = !hasLoaded && isFetching;
  if (isInitialLeaveLoading) {
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
          title="Leave Management"
          subtitle="Manage requests, types, balances"
          icon={CalendarCheck}
          accent="emerald"
          breadcrumbs={['HRMS.Pro!', 'Leaves']}
          actions={
            activeTab === 'requests' ? (
              <>
                <button
                  onClick={async () => {
                    toast.loading('AI analyzing...', { id: 'ai-leave' });
                    try {
                      await runAutomation('leave_suggest', { tab: activeTab });
                      toast.success('AI analysis complete', { id: 'ai-leave' });
                    } catch { toast.error('AI failed', { id: 'ai-leave' }); }
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
                  title="AI Automation"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">AI</span>
                </button>
                <ExportButton
                  rows={activeTab === 'requests' ? filteredLeaves : activeTab === 'types' ? filteredLeaveTypes : []}
                  filename="leaves_export"
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
                  onClick={() => setShowApplyModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Apply Leave</span>
                </button>
              </>
            ) : undefined
          }
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <div key={index} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} color={stat.color} tooltip={stat.tooltip} trend={stat.trend} onClick={stat.onClick} />
            </div>
          ))}
        </div>
                  
        {/* TABS - Pill Style like Company Page */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'requests' | 'types' | 'balances')}
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

        {activeTab === 'requests' && (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* Filter Row */}
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
                  options={(leaveStatusOptions || []).map((opt: MasterDataItem) => ({ id: opt.code || '', name: opt.name || '' }))}
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
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-white text-sm cursor-pointer hover:bg-[#F8FAFC] transition-colors" title="Show leaves for deactivated/terminated employees too">
                  <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
                    className="w-4 h-4 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-[#1C64F2]" />
                  <span className="text-xs text-[#64748B]">Include deactivated</span>
                </label>
              </div>
            </div>
            
            <div className="bg-white overflow-hidden">
            {leavesError ? (
              <QueryErrorState message="Failed to load leave requests" onRetry={refetchLeaves} />
            ) : loadingLeaves ? (
              <div className="animate-page-enter"><PageSkeleton /></div>
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  data={filteredLeaves}
                  rowKey={(leave: LeaveRow) => leave.id}
                  searchable
                  searchKeys={(leave: LeaveRow) => `${leave.employeeName} ${leave.leaveType} ${leave.reason || ''} ${leave.status || ''}`}
                  searchPlaceholder="Search leave requests..."
                  emptyMessage="No leave requests found" persistKey="leaves-requests"
                  logEntityType="leave"
                  logFor={(leave: LeaveRow) => ({ id: leave.id, label: `${leave.employeeName} — ${leave.leaveType}` })}
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
                      icon: XCircle,
                      variant: 'danger',
                      onAction: (items) => {
                        setConfirmTarget({ type: 'reject', items });
                      },
                    },
                  ]}
                  onDelete={(items) => setBulkDeleteTarget({ items: items as LeaveRow[] })}
                  onEdit={(leave) => handleEditLeave(leave as LeaveRow)}
                  columns={[
                    {
                      key: 'employeeName', header: 'Employee', sortable: true,
                      render: (leave: LeaveRow) => (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-semibold text-[#0F172A] text-sm">{leave.employeeName}</span>
                              {leave.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{leave.employeeCode}</span>}
                            </div>
                            <div className="text-xs text-[#64748B] truncate max-w-[220px]">{leave.email || ''}</div>
                          </div>
                        </div>
                      ),
                      sortValue: (leave: LeaveRow) => leave.employeeName,
                    },
                    { key: 'companyName', header: 'Company', render: (leave: LeaveRow) => <span className="text-sm text-[#64748B]">{leave.companyName || '-'}</span> },
                    { key: 'branchName', header: 'Branch', render: (leave: LeaveRow) => <span className="text-sm text-[#64748B]">{leave.branchName || '-'}</span> },
                    { key: 'departmentName', header: 'Department', render: (leave: LeaveRow) => <span className="text-sm text-[#64748B]">{leave.departmentName || '-'}</span> },
                    { key: 'leaveType', header: 'Leave Type', sortable: true, render: (leave: LeaveRow) => (
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getAttendanceStatusBadge(leave.leaveType || '')}`}>{capitalizeStatus(leave.leaveType ?? '')}</span>
                        {leave.isPrivilege && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 border border-violet-200">
                            <Award className="w-3 h-3" /> Privilege
                          </span>
                        )}
                      </div>
                    ), sortValue: (leave: LeaveRow) => leave.leaveType },
                    { key: 'period', header: 'Period', render: (leave: LeaveRow) => <span className="text-sm text-[#64748B]">{formatAppDate(leave.startDate)} to {formatAppDate(leave.endDate)}</span> },
                    { key: 'totalDays', header: 'Days', sortable: true, render: (leave: LeaveRow) => <span className="text-sm font-medium text-[#0F172A]">{leave.totalDays}</span>, sortValue: (leave: LeaveRow) => leave.totalDays },
                    {
                      key: 'status', header: 'Leave Status', sortable: true,
                      render: (leave: LeaveRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getLeaveStatusBadge(leave.status || '')}`}>{capitalizeStatus(leave.status)}</span>,
                      sortValue: (leave: LeaveRow) => leave.status,
                    },
                    { key: 'reason', header: 'Reason', render: (leave: LeaveRow) => <span className="text-sm text-[#64748B] truncate max-w-xs block">{leave.reason || '-'}</span> },
                  ]}
                  actions={(leave: LeaveRow) => (
                    <div className="flex items-center justify-end gap-1.5">
                      {leave.status?.toLowerCase() === 'pending' && (
                        <>
                          <Tooltip id={`btn-approve-leave-${leave.id}`} content="Approve">
                            <button onClick={() => approveMutation.mutate(leave.id)} className="p-2 text-[#10B981] hover:bg-[#10B981]/10 rounded-lg transition-colors" title="Approve"><CheckCircle2 className="w-4 h-4" /></button>
                          </Tooltip>
                          <Tooltip id={`btn-reject-leave-${leave.id}`} content="Reject">
                            <button onClick={() => rejectMutation.mutate(leave.id)} className="p-2 text-[#F59E0B] hover:bg-[#F59E0B]/10 rounded-lg transition-colors" title="Reject"><XCircle className="w-4 h-4" /></button>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip id={`btn-edit-leave-${leave.id}`} content="Edit">
                        <button onClick={() => setEditingLeave(leave)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                      </Tooltip>
                      <Tooltip id={`btn-delete-leave-${leave.id}`} content="Delete">
                        <button onClick={() => handleDelete(leave.id, leave.employeeName || `Leave #${leave.id}`)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </Tooltip>
                      <Tooltip id={`btn-history-leave-${leave.id}`} content="Approval History">
                        <button onClick={() => { setHistoryLeaveId(leave.id); setShowHistoryModal(true); }} className="p-2 text-[#64748B] hover:bg-[#F1F5F9] rounded-lg transition-colors" title="Approval History"><Clock className="w-4 h-4" /></button>
                      </Tooltip>
                    </div>
                  )}
                />
              </div>
            )}
            </div>
          </div>
        )}

        {/* LEAVE TYPES TABLE */}
        {activeTab === 'types' && (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* FILTERS */}
            <div className="flex flex-col md:flex-row gap-4 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <SearchableSelect
                value={leaveTypeCompanyFilter === 'all' ? 'all' : Number(leaveTypeCompanyFilter)}
                onChange={(val) => setLeaveTypeCompanyFilter(val === 'all' ? 'all' : String(val))}
                options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                placeholder="All Companies"
                allOption="All Companies"
                className="w-48"
              />
              <div className="flex items-center gap-3">
                <button onClick={() => setLeaveTypeStatusFilter(prev => prev === 'all' ? 'active' : prev === 'active' ? 'inactive' : 'all')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#E2E8F0] transition-colors">
                  <Filter className="w-4 h-4" />
                  {leaveTypeStatusFilter === 'all' ? 'Filter' : leaveTypeStatusFilter === 'active' ? 'Active only' : 'Inactive only'}
                </button>
                <button onClick={openAddLeaveType}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-blue)] text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
                  <Plus className="w-4 h-4" /> Add Leave Type
                </button>
              </div>
            </div>
            <div className="bg-white overflow-hidden">
              {leaveTypesError ? (
                <QueryErrorState message="Failed to load leave types" onRetry={refetchLeaveTypes} />
              ) : (
              <div className="overflow-x-auto">
              <DataTable
                data={filteredLeaveTypes}
                rowKey={(type: LeaveTypeRow) => type.id}
                searchable
                searchKeys={(type: LeaveTypeRow) => `${type.name} ${type.code || ''}`}
                searchPlaceholder="Search leave types..."
                logEntityType="leave_type"
                logFor={(type: LeaveTypeRow) => ({ id: type.id, label: type.name })}
                emptyMessage={leaveTypes.length === 0 ? 'No leave types configured' : 'No leave types match the current filter'}
                columns={[
                  {
                    key: 'name', header: 'Type Name', sortable: true,
                    render: (type: LeaveTypeRow) => (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 text-white" />
                        </div>
                        <div className="font-semibold text-[#0F172A] text-sm">{type.name}</div>
                      </div>
                    ),
                    sortValue: (type: LeaveTypeRow) => type.name,
                  },
                  { key: 'code', header: 'Code', render: (type: LeaveTypeRow) => <span className="text-sm text-[#64748B]">{type.code}</span> },
                  { key: 'days', header: 'Days/Yr', render: (type: LeaveTypeRow) => <span className="text-sm text-[#64748B]">{type.days_allowed ?? 0}</span> },
                  { key: 'company', header: 'Company', render: (type: LeaveTypeRow) => <span className="text-sm text-[#64748B]">{type.company_id != null ? (companies.find((c: { id: number; name: string }) => c.id === type.company_id)?.name || type.company_id) : 'All (default)'}</span> },
                  {
                    key: 'paid', header: 'Paid', align: 'center',
                    render: (type: LeaveTypeRow) => (
                      <ToggleSwitch checked={type.is_paid !== false} onChange={() => toggleLeaveTypeMutation.mutate({ id: type.id, patch: { isPaid: type.is_paid === false } })} />
                    ),
                  },
                  {
                    key: 'encashable', header: 'Encashable', align: 'center',
                    render: (type: LeaveTypeRow) => (
                      <ToggleSwitch checked={!!type.is_encashable} onChange={() => toggleLeaveTypeMutation.mutate({ id: type.id, patch: { isEncashable: !type.is_encashable } })} />
                    ),
                  },
                  {
                    key: 'status', header: 'Status', align: 'center',
                    render: (type: LeaveTypeRow) => (
                      <ToggleSwitch checked={type.status !== 'inactive'} onChange={() => handleToggleLeaveTypeStatus(type)} />
                    ),
                  },
                ]}
                actions={(type: LeaveTypeRow) => (
                  <div className="flex items-center justify-end gap-1.5">
                    <Tooltip id={`edit-leave-${type.id}`} content="Edit Leave Type">
                      <button onClick={() => openEditLeaveType(type)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                    </Tooltip>
                    <Tooltip id={`delete-leave-${type.id}`} content="Delete Leave Type">
                      <button onClick={() => setDeleteLeaveTypeTarget(type)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </Tooltip>
                  </div>
                )}
              />
              </div>
              )}
            </div>
          </div>
        )}

        {/* BALANCE TAB PLACEHOLDER */}
        {activeTab === 'balance' && (
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex flex-col md:flex-row gap-4 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <SearchableSelect
                value={filterYear === '' ? 'all' : filterYear}
                onChange={(val) => setFilterYear(val === 'all' ? '' : val.toString())}
                options={[2024, 2025, 2026, 2027].map(y => ({ id: String(y), name: String(y) }))}
                placeholder="All Years"
                allOption="All Years"
                className="w-36"
              />
              <button
                onClick={initBalanceForAll}
                disabled={initBalanceState.loading}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#059669] text-white rounded-xl text-sm font-medium hover:bg-[#047857] transition-colors disabled:opacity-50"
                title="Initialize balances from scoped leave configuration"
              >
                {initBalanceState.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Initialize Balances
              </button>
            </div>
            {balanceLoading ? (
              null
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  data={filteredBalances}
                  rowKey={(b: BalanceRow) => b.id}
                  searchable
                  searchKeys={(b: BalanceRow) => `${b.employeeName} ${b.employeeCode || ''}`}
                  searchPlaceholder="Search by employee name or code..."
                  logEntityType="leave"
                  logFor={(b: BalanceRow) => ({ id: b.id, label: b.employeeName })}
                  emptyMessage="No leave balances found"
                  columns={[
                    { key: 'employeeName', header: 'Employee', sortable: true,
                      render: (b: BalanceRow) => (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-sm font-medium text-[#0F172A]">{b.employeeName}</span>
                              {b.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{b.employeeCode}</span>}
                            </div>
                            <div className="text-xs text-[#64748B] truncate max-w-[220px]">{b.email || ''}</div>
                          </div>
                        </div>
                      ),
                      sortValue: (b: BalanceRow) => b.employeeName },
                    { key: 'year', header: 'Year', sortable: true, render: (b: BalanceRow) => <span className="text-sm text-[#64748B]">{b.year}</span>, sortValue: (b: BalanceRow) => b.year },
                    { key: 'leaveTypeName', header: 'Leave Type', render: (b: BalanceRow) => <span className="text-sm text-[#0F172A]">{b.leaveTypeName}</span> },
                    { key: 'totalDays', header: 'Total', align: 'right', render: (b: BalanceRow) => <span className="text-sm text-[#0F172A]">{b.totalDays}</span> },
                    { key: 'usedDays', header: 'Used', align: 'right', render: (b: BalanceRow) => <span className="text-sm text-[#D97706]">{b.usedDays}</span> },
                    { key: 'remainingDays', header: 'Remaining', align: 'right', render: (b: BalanceRow) => <span className="text-sm font-semibold text-[#059669]">{b.remainingDays}</span> },
                  ]}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'configuration' && (
          <div className="animate-in fade-in duration-300">
            <LeaveTemplateManager />
          </div>
        )}
      </div>

      {/* Full Page Drawer Modal */}
      {showApplyModal && (
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
              {/* Form Wrapper */}
              <form onSubmit={(e) => { e.preventDefault(); if (editingLeave) { updateLeaveMutation.mutate({ id: editingLeave.id, payload: newLeave }); } else { applyMutation.mutate(newLeave); } }} className="flex flex-col flex-1 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#1C64F2bb] flex items-center justify-center text-white shadow-sm">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A] leading-tight">{editingLeave ? 'Edit Leave' : 'Apply for Leave'}</h2>
                      <p className="text-xs text-[#64748B]">Manage leave request details</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleCloseDrawer} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                    <button type="submit" disabled={applyMutation.isPending || updateLeaveMutation.isPending} className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2">
                      {(applyMutation.isPending || updateLeaveMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                      {(applyMutation.isPending || updateLeaveMutation.isPending) ? 'Saving...' : (editingLeave ? 'Update Leave' : 'Submit Leave')}
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
                    Fill in the leave details below and click Submit Leave to save.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <div className="space-y-6">
                    {renderLeaveForm()}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      <Modal
        isOpen={showBulkUpload}
        onClose={() => { setShowBulkUpload(false); setUploadFile(null); }}
        title="Bulk Upload Leave Requests"
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
              <strong>Required columns:</strong> employee_id, leave_type, start_date, end_date, reason
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
                <Loader2 className="w-5 h-5 animate-spin" />
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

      {/* Add / Edit Leave Type Modal */}
      {showLeaveTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowLeaveTypeModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-[#0F172A]">{editingLeaveTypeId ? 'Edit Leave Type' : 'Add Leave Type'}</h3>
              <button onClick={() => setShowLeaveTypeModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input value={leaveTypeForm.name} onChange={e => setLeaveTypeForm({ ...leaveTypeForm, name: e.target.value })}
                  placeholder="e.g. Casual Leave" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Code</label>
                  <input value={leaveTypeForm.code} onChange={e => setLeaveTypeForm({ ...leaveTypeForm, code: e.target.value })}
                    placeholder="casual" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Days / Year</label>
                  <input type="number" value={leaveTypeForm.days_allowed} onChange={e => setLeaveTypeForm({ ...leaveTypeForm, days_allowed: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                <SearchableSelect
                  value={leaveTypeForm.company_id === '' ? 'all' : Number(leaveTypeForm.company_id)}
                  onChange={(val) => setLeaveTypeForm({ ...leaveTypeForm, company_id: val === 'all' ? '' : String(val) })}
                  options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies (default)"
                  allOption="All Companies (default)"
                />
              </div>
              <div className="flex items-center gap-8 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <ToggleSwitch checked={leaveTypeForm.is_paid} onChange={(v) => setLeaveTypeForm({ ...leaveTypeForm, is_paid: v })} onColor="bg-emerald-500" />
                  <span className="text-sm text-[#0F172A]">Paid leave</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <ToggleSwitch checked={leaveTypeForm.is_encashable} onChange={(v) => setLeaveTypeForm({ ...leaveTypeForm, is_encashable: v })} onColor="bg-[#1C64F2]" offColor="bg-gray-300" />
                  <span className="text-sm text-[#0F172A]">Encashable</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
              <button onClick={() => setShowLeaveTypeModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={submitLeaveType} disabled={saveLeaveTypeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1C64F2] text-white hover:bg-blue-700 disabled:opacity-50">
                {saveLeaveTypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editingLeaveTypeId ? 'Save Changes' : 'Add Leave Type'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.name || 'this leave'}
        isDeleting={deleteMutation.isPending}
      />

      <ConfirmActionModal
        isOpen={!!confirmTarget}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) {
            if (confirmTarget.type === 'approve') {
              confirmTarget.items.forEach((l: LeaveRow) => approveMutation.mutate(l.id));
            } else {
              confirmTarget.items.forEach((l: LeaveRow) => rejectMutation.mutate(l.id));
            }
            setConfirmTarget(null);
          }
        }}
        variant={confirmTarget?.type === 'approve' ? 'success' : 'warning'}
        title={confirmTarget?.type === 'approve' ? 'Approve Leave' : 'Reject Leave'}
        confirmLabel={confirmTarget?.type === 'approve' ? 'Approve' : 'Reject'}
        message={
          confirmTarget
            ? confirmTarget.items.length === 1
              ? `You are about to ${confirmTarget.type} the leave for ${confirmTarget.items[0].employeeName}.`
              : `You are about to ${confirmTarget.type} ${confirmTarget.items.length} selected leave requests.`
            : ''
        }
        consequence={
          confirmTarget?.type === 'approve'
            ? "The leave will be marked as approved and the employee's leave balance will be reduced."
            : 'The leave request will be marked as rejected and will not affect the employee\'s leave balance.'
        }
      />

      {/* Approval History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowHistoryModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Approval History</h3>
              <button onClick={() => setShowHistoryModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {historyLoading ? (
                <div className="flex justify-center py-8">null</div>
              ) : approvalHistory.length === 0 ? (
                <EmptyState icon={Clock} title="No approval history found" description="Approval history will appear here once actions are taken" />
              ) : (
                <div className="space-y-3">
                  {approvalHistory.map((h: ApprovalHistoryEntry) => (
                    <div key={h.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                        h.action === 'approved' ? 'bg-green-500' : h.action === 'rejected' ? 'bg-red-500' : 'bg-yellow-500'
                      }`}>
                        {h.action === 'approved' ? '?' : h.action === 'rejected' ? '?' : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{h.approverName || `Approver #${h.approvalLevel}`}</p>
                        <p className="text-xs text-gray-500">Action: {h.action} {h.newStatus ? `? ${h.newStatus}` : ''}</p>
                        {h.comments && <p className="text-xs text-gray-600 mt-1 italic">"{h.comments}"</p>}
                        <p className="text-[10px] text-gray-400 mt-1">{h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">Lvl {h.approvalLevel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <BulkDeleteModal
        isOpen={!!bulkDeleteTarget}
        onClose={() => setBulkDeleteTarget(null)}
        onConfirm={() => {
          if (!bulkDeleteTarget) return;
          bulkDeleteTarget.items.forEach((l) => deleteMutation.mutate(l.id));
          setBulkDeleteTarget(null);
        }}
        count={bulkDeleteTarget?.items.length ?? 0}
        entityType="leave request"
        consequences={['Leave records will be permanently removed', 'Leave balance adjustments may be affected']}
        isDeleting={deleteMutation.isPending}
      />
      <ConfirmActionModal
        isOpen={showInitBalanceConfirm}
        title="Initialize Leave Balances"
        message="Initialize leave balances for all employees from their scoped leave configuration?"
        consequence="This will overwrite existing leave balances for all employees based on their assigned leave policies. Any manually adjusted balances may be reset."
        confirmLabel="Initialize"
        variant={'info' as unknown as 'default'}
        isPending={initBalanceState.loading}
        onConfirm={() => {
          setShowInitBalanceConfirm(false);
          setInitBalanceState((p) => ({ ...p, loading: true }));
          api.post('/leave-balances/init-all')
            .then(() => { toast.success('Balances initialized for all employees'); queryClient.invalidateQueries({ queryKey: ['leave-balances'] }); })
            .catch(() => toast.error('Failed to initialize balances'))
            .finally(() => setInitBalanceState((p) => ({ ...p, loading: false })));
        }}
        onCancel={() => setShowInitBalanceConfirm(false)}
      />
      <ConfirmDeleteModal
        isOpen={deleteLeaveTypeTarget !== null}
        onConfirm={() => {
          if (deleteLeaveTypeTarget) {
            deleteLeaveTypeMutation.mutate(deleteLeaveTypeTarget.id);
          }
        }}
        onClose={() => setDeleteLeaveTypeTarget(null)}
        itemName={deleteLeaveTypeTarget?.name}
        isDeleting={deleteLeaveTypeMutation.isPending}
      />
    </div>
  );
};

export default LeaveManagement;


