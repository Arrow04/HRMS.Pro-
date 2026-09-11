import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRightLeft, Calendar, Loader2, CheckCircle2, XCircle, Info, Building2, Search, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatAppDate } from '../services/appSettingsService';
import api from '../services/api';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { normalizePickerEmployee, formatEmployeeLabel } from '../utils/employeePickerUtils';
import { personDisplayName } from '../utils/employeeNameUtils';
import { useMasterData } from '../hooks/useMasterData';
import DateRangePicker from '../components/DateRangePicker';
import DatePicker from '../components/DatePicker';
import SearchableSelect from '../components/SearchableSelect';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import ConfirmActionModal from '../components/ConfirmActionModal';
import type { Company, Department, Branch, Designation } from '../types';

interface TransfersSectionProps {
  companiesList?: Company[];
  branchesList?: Branch[];
  departmentsList?: Department[];
  designations?: Designation[];
  showModal: boolean;
  setShowModal: (show: boolean) => void;
}

interface TransferFormData {
  type: string;
  start_date: string;
  employee_id?: string;
  from_company_id?: number | string;
  from_branch_id?: number | string;
  from_department_id?: number | string | null;
  from_designation_id?: number | string | null;
  fromDesignationName?: string;
  to_company_id?: number | string;
  to_branch_id?: number | string;
  to_branch_ids?: number[];
  to_department_id?: number | string | null;
  to_designation_id?: number | string | null;
  end_date?: string;
  reason?: string;
  company_id?: number;
  transfer_company_id?: number;
  selectedEmployeeBranches?: Array<{ id: number; name?: string }>;
}

interface EmployeeOption {
  id: number;
  employee_code?: string;
  employeeCode?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  branch_id?: number;
  branchId?: number;
  branch_ids?: number[];
  branchIds?: number[];
  branches?: Array<{ id: number; name?: string }>;
  department_id?: number;
  departmentId?: number;
  company_id?: number;
  companyId?: number;
  company?: { id: number; name?: string };
  designation?: string;
  designation_id?: number;
  designationId?: number;
}

interface TransferRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  from_company_id?: number;
  from_company_name?: string;
  from_branch_id?: number;
  from_branch_ids?: number[];
  from_branch_name: string;
  from_branch_names?: string[];
  from_department_id?: number;
  from_department_name?: string;
  from_designation_id?: number;
  from_designation_name?: string;
  to_company_id?: number;
  to_company_name?: string;
  to_branch_id?: number;
  to_branch_ids?: number[];
  to_branch_name: string;
  to_branch_names?: string[];
  to_department_id?: number;
  to_department_name?: string;
  type: string;
  status: string;
  start_date: string;
  end_date?: string;
  reason?: string;
}

interface TransferTypeOption {
  code: string;
  name: string;
}

interface ApiErrorResponse {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

interface BranchMultiSelectProps {
  branches: Array<{ id: number; name?: string }>;
  selected: number[];
  onChange: (ids: number[]) => void;
}

const CompactBranches: React.FC<{ names: string[]; color?: string }> = ({ names, color = 'text-[#0F172A]' }) => {
  if (names.length === 0) return <span className={`text-sm ${color}`}>-</span>;
  const extra = names.length - 3;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${color} max-w-[220px]`} title={names.join(', ')}>
      <span className="truncate">{names.slice(0, 3).join(', ')}</span>
      {extra > 0 && <span className="shrink-0 text-xs font-semibold text-[#1C64F2] bg-[#EFF6FF] px-1.5 py-0.5 rounded-md whitespace-nowrap">+{extra}</span>}
    </span>
  );
};

const BranchMultiSelect: React.FC<BranchMultiSelectProps> = ({ branches, selected, onChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const filtered = branches.filter((b) => !searchTerm || (b.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  return (
    <div className="border border-[#E2E8F0] rounded-lg bg-white overflow-hidden">
      <div className="px-2.5 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search branches..."
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(branches.map((b) => b.id))}
            className="flex-1 px-2.5 py-1.5 text-xs font-medium text-[#1C64F2] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded-md transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex-1 px-2.5 py-1.5 text-xs font-medium text-[#C81E1E] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-md transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="max-h-40 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 p-2">No branches available</p>
        )}
        {filtered.map((branch) => {
          const isChecked = selected.includes(branch.id);
          return (
            <label key={branch.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${isChecked ? 'bg-[#EFF6FF] text-[#1C64F2] font-medium' : 'hover:bg-[#F8FAFC] text-[#334155]'}`}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, branch.id]
                    : selected.filter((id) => id !== branch.id);
                  onChange(next);
                }}
                className="w-4 h-4 rounded border-[#CBD5E1] text-[#1C64F2] focus:ring-[#1C64F2]/30"
              />
              <span className="truncate">{branch.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

const TransfersSection = ({ companiesList, branchesList, departmentsList, designations, showModal, setShowModal }: TransfersSectionProps) => {
  const queryClient = useQueryClient();
  const [filterCompany, setFilterCompany] = useState<number | 'all'>('all');
  const [filterBranch, setFilterBranch] = useState<number | 'all'>('all');
  const [filterDepartment, setFilterDepartment] = useState<number | 'all'>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [bulkDeleteTransferTarget, setBulkDeleteTransferTarget] = useState<TransferRecord[] | null>(null);
  const [singleDeleteTransferTarget, setSingleDeleteTransferTarget] = useState<TransferRecord | null>(null);
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const { data: transferTypeOptions = [] } = useMasterData('TRANSFER_TYPE');
  const [formData, setFormData] = useState<TransferFormData>({
    type: 'permanent',
    start_date: new Date().toISOString().split('T')[0],
  });
  const [editingTransferId, setEditingTransferId] = useState<number | null>(null);

  // Reset the form every time the modal opens so stale data never carries over
  // (skipped when opening in edit mode — the prefill is applied instead)
  useEffect(() => {
    if (showModal && !editingTransferId) {
      setFormData({ type: 'permanent', start_date: new Date().toISOString().split('T')[0] });
    }
  }, [showModal]);

  const { data: pickerEmployees = [], isLoading: loadingEmployees } = useEmployeePicker({ status: 'active' });
  const employees = pickerEmployees.map(normalizePickerEmployee) as EmployeeOption[];

  const { data: transfers = [], isLoading: loadingTransfers } = useQuery<TransferRecord[]>({
    queryKey: ['transfers'],
    queryFn: async () => {
      const response = await api.get('/employees/transfers');
      return response.data || [];
    }
  });

  const { data: allBranches = [] } = useQuery<Branch[]>({
    queryKey: ['transfers-all-branches'],
    queryFn: async () => {
      const response = await api.get('/branches');
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: allDepartments = [] } = useQuery<Department[]>({
    queryKey: ['transfers-all-departments'],
    queryFn: async () => {
      const response = await api.get('/departments');
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: allDesignations = [] } = useQuery<Designation[]>({
    queryKey: ['transfers-all-designations'],
    queryFn: async () => {
      const response = await api.get('/designations');
      return response.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: TransferFormData) => {
      const payload = {
        employee_id: parseInt(String(data.employee_id)),
        from_company_id: data.from_company_id ? parseInt(String(data.from_company_id)) : null,
        from_branch_id: parseInt(String(data.from_branch_id)),
        from_branch_ids: (data.selectedEmployeeBranches || []).length > 0 ? (data.selectedEmployeeBranches || []).map((b) => b.id) : [parseInt(String(data.from_branch_id))],
        from_department_id: data.from_department_id ? parseInt(String(data.from_department_id)) : null,
        from_designation_id: data.from_designation_id ? parseInt(String(data.from_designation_id)) : null,
        to_company_id: data.to_company_id ? parseInt(String(data.to_company_id)) : null,
        to_branch_ids: data.to_branch_ids && data.to_branch_ids.length > 0 ? data.to_branch_ids : (data.to_branch_id ? [parseInt(String(data.to_branch_id))] : []),
        to_department_id: data.to_department_id ? parseInt(String(data.to_department_id)) : null,
        to_designation_id: data.to_designation_id ? parseInt(String(data.to_designation_id)) : null,
        type: data.type,
        start_date: data.start_date,
        end_date: data.type === 'temporary' ? data.end_date : null,
        reason: data.reason || 'Requested via Employee Management'
      };
      const response = await api.post('/employees/transfers', payload);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Transfer initiated successfully');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      setShowModal(false);
      setFormData({ type: 'permanent', start_date: new Date().toISOString().split('T')[0] });
    },
    onError: (error: unknown) => {
      const apiError = error as ApiErrorResponse;
      toast.error(apiError?.response?.data?.detail || 'Failed to initiate transfer');
    }
  });

  const updateTransferMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: TransferFormData }) => {
      const payload = {
        from_company_id: data.from_company_id ? parseInt(String(data.from_company_id)) : null,
        from_branch_id: parseInt(String(data.from_branch_id)),
        from_department_id: data.from_department_id ? parseInt(String(data.from_department_id)) : null,
        from_designation_id: data.from_designation_id ? parseInt(String(data.from_designation_id)) : null,
        to_company_id: data.to_company_id ? parseInt(String(data.to_company_id)) : null,
        to_branch_ids: data.to_branch_ids && data.to_branch_ids.length > 0 ? data.to_branch_ids : (data.to_branch_id ? [parseInt(String(data.to_branch_id))] : []),
        to_department_id: data.to_department_id ? parseInt(String(data.to_department_id)) : null,
        to_designation_id: data.to_designation_id ? parseInt(String(data.to_designation_id)) : null,
        type: data.type,
        start_date: data.start_date,
        end_date: data.type === 'temporary' ? data.end_date : null,
        reason: data.reason || 'Requested via Employee Management'
      };
      const response = await api.put(`/employees/transfers/${id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Transfer updated successfully');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      setShowModal(false);
      setEditingTransferId(null);
      setFormData({ type: 'permanent', start_date: new Date().toISOString().split('T')[0] });
    },
    onError: (error: unknown) => {
      const apiError = error as ApiErrorResponse;
      toast.error(apiError?.response?.data?.detail || 'Failed to update transfer');
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      // Route to the dedicated endpoints so the proper business logic runs
      // (approve/reject/complete each handle the branch movements).
      const action = status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : status === 'completed' ? 'complete' : status;
      const response = await api.put(`/employees/transfers/${id}/${action}`);
      return response.data;
    },
    onSuccess: (data, variables) => {
      toast.success(`Transfer ${variables.status} successfully`);
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      if (variables.status === 'completed' || variables.status === 'reverted') {
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
    },
    onError: (error: unknown) => {
      const apiError = error as ApiErrorResponse;
      toast.error(apiError?.response?.data?.detail || 'Failed to update transfer');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/employees/transfers/${id}`);
    },
    onSuccess: () => {
      toast.success('Transfer deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
    onError: (error: unknown) => {
      const apiError = error as ApiErrorResponse;
      toast.error(apiError?.response?.data?.detail || 'Failed to delete transfer');
    }
  });

  const revertMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.put(`/employees/transfers/${id}/revert`);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Temporary transfer reverted — employee returned to original branch');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error: unknown) => {
      const apiError = error as ApiErrorResponse;
      toast.error(apiError?.response?.data?.detail || 'Failed to revert transfer');
    }
  });

  const handleEmployeeSelect = (empId: string) => {
    const employee = employees.find((e: EmployeeOption) => e.id === parseInt(empId));
    if (employee) {
      // An employee may belong to multiple branches — capture all of them
      const branchIds = employee.branch_ids ?? employee.branchIds ?? [];
      const branchObjs = (employee.branches || []).length > 0
        ? employee.branches
        : branchIds.map((id: number) => ({ id, name: allBranches?.find((b: Branch) => b.id === id)?.name }));
      const primaryBranch = branchObjs.length > 0 ? branchObjs[0].id : (employee.branch_id ?? employee.branchId ?? undefined);
      setFormData({
        ...formData,
        employee_id: empId,
        from_company_id: employee.company?.id ?? employee.company_id ?? employee.companyId,
        from_branch_id: primaryBranch,
        from_department_id: employee.department_id ?? employee.departmentId,
        from_designation_id: employee.designation_id ?? employee.designationId,
        fromDesignationName: employee.designation || (designations || []).find((d: Designation) => String(d.id) === String(employee.designation_id ?? employee.designationId))?.title || '',
        company_id: employee.company_id ?? employee.companyId,
        selectedEmployeeBranches: branchObjs
      });
    }
  };

  const handleEditTransfer = (t: TransferRecord) => {
    const emp = employees.find((e: EmployeeOption) => e.id === t.employee_id);
    const branchObjs = (t.from_branch_ids || (t.from_branch_id ? [t.from_branch_id] : []))
      .map((id) => ({ id, name: allBranches?.find((b: Branch) => b.id === id)?.name || '' }));
    setFormData({
      type: t.type || 'permanent',
      start_date: t.start_date ? t.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
      end_date: t.end_date ? t.end_date.split('T')[0] : undefined,
      reason: t.reason || '',
      employee_id: String(t.employee_id),
      from_company_id: t.from_company_id,
      from_branch_id: t.from_branch_id,
      from_department_id: t.from_department_id,
      from_designation_id: t.from_designation_id,
      fromDesignationName: t.from_designation_name || '',
      to_company_id: t.to_company_id,
      to_branch_id: t.to_branch_id,
      to_branch_ids: t.to_branch_ids || [],
      to_department_id: t.to_department_id,
      to_designation_id: t.to_designation_id,
      company_id: t.from_company_id,
      transfer_company_id: t.from_company_id,
      selectedEmployeeBranches: branchObjs,
    });
    setEditingTransferId(t.id);
    setShowModal(true);
  };

  const handleSubmitTransfer = () => {
    if (editingTransferId) {
      updateTransferMutation.mutate({ id: editingTransferId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredTransfers = transfers.filter((t: TransferRecord) => {
    const matchCompany = filterCompany === 'all' || String(t.to_company_id ?? t.from_company_id ?? '') === String(filterCompany);
    const matchBranch = filterBranch === 'all' || (t.to_branch_ids || []).includes(Number(filterBranch)) || String(t.to_branch_id ?? '') === String(filterBranch) || String(t.from_branch_id ?? '') === String(filterBranch);
    const matchDepartment = filterDepartment === 'all' || String(t.to_department_id ?? t.from_department_id ?? '') === String(filterDepartment);
    const matchType = filterType === 'all' || String(t.type) === filterType;
    const matchStatus = filterStatus === 'all' || String(t.status) === filterStatus;
    const tDate = t.start_date ? t.start_date.split('T')[0] : '';
    const matchDate = (!filterStartDate && !filterEndDate)
      || (filterStartDate && filterEndDate && tDate >= filterStartDate && tDate <= filterEndDate)
      || (filterStartDate && !filterEndDate && tDate >= filterStartDate)
      || (!filterStartDate && filterEndDate && tDate <= filterEndDate);
    return matchCompany && matchBranch && matchDepartment && matchType && matchStatus && matchDate;
  });

  const columns: DataTableColumn<TransferRecord>[] = [
    {
      key: 'employee',
      header: 'Employee',
      sortable: true,
      sortValue: (t) => t.employee_name,
      render: (t) => (
        <>
          <p className="text-sm font-medium text-[#0F172A]">{t.employee_name}</p>
          <p className="text-xs text-[#64748B]">ID: {t.employee_id}</p>
        </>
      ),
    },
    {
      key: 'from',
      header: 'From',
      render: (t) => (
        <>
          {t.from_company_name && <p className="text-xs font-medium text-[#475569]">{t.from_company_name}</p>}
          <CompactBranches names={t.from_branch_names || (t.from_branch_name ? [t.from_branch_name] : [])} color="text-[#0F172A]" />
          <p className="text-xs text-[#64748B]">{t.from_designation_name || ''} {t.from_department_name ? `${t.from_designation_name ? '·' : ''} ${t.from_department_name}` : ''}</p>
        </>
      ),
    },
    {
      key: 'to',
      header: 'To',
      render: (t) => (
        <>
          {t.to_company_name && <p className="text-xs font-medium text-[#1C64F2]">{t.to_company_name}</p>}
          <CompactBranches names={t.to_branch_names || (t.to_branch_name ? [t.to_branch_name] : [])} color="text-[#1C64F2]" />
          <p className="text-xs text-[#64748B]">{t.to_department_name || '-'}</p>
        </>
      ),
    },
    {
      key: 'type',
      header: 'Type & Date',
      sortable: true,
      sortValue: (t) => t.start_date,
      render: (t) => {
        const typeLabel = transferTypeOptions.find((o: TransferTypeOption) => o.code === t.type)?.name || t.type || 'Permanent';
        const isPermanent = t.type === 'permanent';
        return (
          <>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPermanent ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
              {typeLabel}
            </span>
            <p className="text-xs text-[#64748B] mt-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatAppDate(t.start_date)}
            </p>
          </>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (t) => t.status,
      render: (t) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          t.status === 'approved' ? 'bg-[#10B981]/10 text-[#10B981]' :
          t.status === 'completed' ? 'bg-[#3B82F6]/10 text-[#3B82F6]' :
          t.status === 'reverted' ? 'bg-[#8B5CF6]/10 text-[#8B5CF6]' :
          t.status === 'rejected' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
          'bg-[#F59E0B]/10 text-[#F59E0B]'
        }`}>
          {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
        </span>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden flex flex-col h-full">
      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            value={filterCompany === 'all' ? 'all' : filterCompany}
            onChange={(val) => { setFilterCompany(val === 'all' ? 'all' : Number(val)); setFilterBranch('all'); setFilterDepartment('all'); }}
            options={(companiesList || []).map((c: Company) => ({ id: c.id, name: c.name }))}
            placeholder="All Companies"
            allOption="All Companies"
            className="w-40"
          />
          <SearchableSelect
            value={filterBranch === 'all' ? 'all' : filterBranch}
            onChange={(val) => setFilterBranch(val === 'all' ? 'all' : Number(val))}
            options={(branchesList || []).filter((b: Branch) => filterCompany === 'all' || (b as { companyId?: number }).companyId === filterCompany).map((b: Branch) => ({ id: b.id, name: b.name }))}
            placeholder="All Branches"
            allOption="All Branches"
            className="w-40"
          />
          <SearchableSelect
            value={filterDepartment === 'all' ? 'all' : filterDepartment}
            onChange={(val) => setFilterDepartment(val === 'all' ? 'all' : Number(val))}
            options={(departmentsList || []).filter((d: Department) => filterCompany === 'all' || (d as { companyId?: number }).companyId === filterCompany).map((d: Department) => ({ id: d.id, name: d.name }))}
            placeholder="All Departments"
            allOption="All Departments"
            className="w-40"
          />
          <SearchableSelect
            value={filterType}
            onChange={(val) => setFilterType(val === 'all' ? 'all' : String(val))}
            options={(transferTypeOptions as Array<{ code: string; name: string }>).map((opt) => ({ id: opt.code, name: opt.name }))}
            placeholder="All Transfer Types"
            allOption="All Transfer Types"
            className="w-44"
          />
          <SearchableSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val === 'all' ? 'all' : String(val))}
            options={[
              { id: 'pending', name: 'Pending' },
              { id: 'approved', name: 'Approved' },
              { id: 'completed', name: 'Completed' },
              { id: 'rejected', name: 'Rejected' },
              { id: 'reverted', name: 'Reverted' },
            ]}
            placeholder="All Status"
            allOption="All Status"
            className="w-36"
          />
          <DateRangePicker
            startDate={filterStartDate}
            endDate={filterEndDate}
            onDateChange={(start, end) => { setFilterStartDate(start); setFilterEndDate(end); }}
            placeholder="Filter by Date"
          />
          {(filterCompany !== 'all' || filterBranch !== 'all' || filterDepartment !== 'all' || filterType !== 'all' || filterStatus !== 'all' || filterStartDate || filterEndDate) && (
            <button
              onClick={() => { setFilterCompany('all'); setFilterBranch('all'); setFilterDepartment('all'); setFilterType('all'); setFilterStatus('all'); setFilterStartDate(''); setFilterEndDate(''); }}
              className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors"
              title="Clear Filters"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white overflow-hidden">
        {loadingTransfers ? (
          null
        ) : (
          <DataTable
            data={filteredTransfers}
            columns={columns}
            rowKey={(t) => t.id}
            searchable
            searchKeys={(t) => `${t.employee_name || ''} ${t.from_branch_name || ''} ${t.to_branch_name || ''} ${t.from_company_name || ''} ${t.to_company_name || ''}`}
            searchPlaceholder="Search transfers..."
            emptyMessage="No transfer records found"
            persistKey="transfers"
            selectable
            onEdit={(t) => handleEditTransfer(t)}
            logEntityType="employee_transfer"
            logFor={(t) => ({ id: t.id, label: `${t.employee_name} transfer` })}
            bulkActions={[
              {
                label: 'Approve',
                icon: CheckCircle2,
                variant: 'success',
                onAction: (items) => {
                  items.forEach((t) => updateStatusMutation.mutate({ id: t.id, status: 'approved' }));
                },
              },
              {
                label: 'Reject',
                icon: XCircle,
                variant: 'danger',
                onAction: (items) => {
                  items.forEach((t) => updateStatusMutation.mutate({ id: t.id, status: 'rejected' }));
                },
              },
              {
                label: 'Complete',
                icon: CheckCircle2,
                variant: 'primary',
                onAction: (items) => {
                  items.forEach((t) => updateStatusMutation.mutate({ id: t.id, status: 'completed' }));
                },
              },
              {
                label: 'Revert',
                icon: RotateCcw,
                variant: 'amber',
                onAction: (items) => {
                  items.forEach((t) => revertMutation.mutate(t.id));
                },
              },
              {
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
                onAction: (items) => {
                  setBulkDeleteTransferTarget(items);
                },
              },
            ]}
            actions={(t) => (
              <div className="flex items-center justify-end gap-2">
                {t.status === 'pending' && (
                  <>
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'approved' })}
                      className="px-2.5 py-1.5 text-xs font-medium bg-[#10B981] text-white rounded-md hover:bg-[#059669] transition-colors flex items-center gap-1"
                      title="Approve Transfer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'rejected' })}
                      className="px-2.5 py-1.5 text-xs font-medium bg-[#F59E0B] text-white rounded-md hover:bg-[#D97706] transition-colors flex items-center gap-1"
                      title="Reject Transfer"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                )}
                {t.status === 'approved' && (
                  <button
                    onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'completed' })}
                    className="px-2.5 py-1.5 text-xs font-medium bg-[#10B981] text-white rounded-md hover:bg-[#059669] transition-colors flex items-center gap-1"
                  >
                    Complete
                  </button>
                )}
                {t.status === 'completed' && (
                  <button
                    onClick={() => revertMutation.mutate(t.id)}
                    className="px-2.5 py-1.5 text-xs font-medium bg-[#64748B] text-white rounded-md hover:bg-[#475569] transition-colors flex items-center gap-1"
                    title="Return employee to original branch"
                  >
                    Revert
                  </button>
                )}
                <button
                  onClick={() => handleEditTransfer(t)}
                  className="p-1.5 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"
                  title="Edit Transfer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setSingleDeleteTransferTarget(t);
                  }}
                  className="p-1.5 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"
                  title="Delete Transfer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          />
        )}
      </div>

      {/* Initiation Modal — full-page like the Add Employee modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowModal(false); setEditingTransferId(null); }} />
          <div className="fixed inset-0 bg-white shadow-2xl">
            <div className="h-full flex flex-col">
              {/* Header */}
              <header className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-white">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #1C64F2, #1C64F2bb)' }}>
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">{editingTransferId ? 'Edit Employee Transfer' : 'Initiate Employee Transfer'}</h2>
                    <p className="text-xs text-[#64748B]">Change the employee's company, designation, department and branches</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowModal(false); setEditingTransferId(null); }}
                  title="Close"
                  className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </header>

              {/* Body */}
              <form
                id="transfer-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmitTransfer();
                }}
                className="flex-1 overflow-y-auto px-6 py-5"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#334155]">Company *</label>
                    <SearchableSelect
                      value={formData.transfer_company_id ? String(formData.transfer_company_id) : ''}
                      onChange={(val) => {
                        const companyId = val === 'all' ? undefined : Number(val);
                        setFormData({ ...formData, transfer_company_id: companyId, employee_id: undefined, from_company_id: undefined, from_branch_id: undefined, from_department_id: undefined, from_designation_id: undefined, fromDesignationName: undefined, selectedEmployeeBranches: [] });
                      }}
                      options={(companiesList || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                      placeholder="Select Company..."
                      showAllOption={false}
                      clearable
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400">Select the employee's company to load their employees.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#334155]">Select Employee *</label>
                    {formData.transfer_company_id ? (
                      <SearchableSelect
                        value={formData.employee_id || ''}
                        onChange={(val) => handleEmployeeSelect(val.toString())}
                        options={[...employees]
                          .filter((emp: EmployeeOption) => (emp.company?.id ?? emp.company_id ?? emp.companyId) === formData.transfer_company_id)
                          .sort((a: EmployeeOption, b: EmployeeOption) => personDisplayName(a).localeCompare(personDisplayName(b)))
                          .map((emp: EmployeeOption) => ({
                            id: String(emp.id),
                            name: `${emp.employee_code || emp.employeeCode || `EMP-${String(emp.id).padStart(4, '0')}`} - ${personDisplayName(emp)}`.trim(),
                          }))}
                        placeholder="Search & select employee..."
                        className="w-full"
                      />
                    ) : (
                      <input
                        type="text"
                        disabled
                        placeholder="Select a company first"
                        className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-sm text-gray-400"
                      />
                    )}
                    <p className="mt-1 text-xs text-gray-400">Select a company first to see its employees.</p>
                  </div>

                  <div className="space-y-4 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                    <h4 className="text-sm font-semibold text-[#0F172A] flex items-center gap-1">
                      <Info className="w-4 h-4 text-[#64748B]" /> Current Assignment
                    </h4>
                    <p className="text-[11px] text-[#64748B] -mt-1">This shows the employee's current details and cannot be changed.</p>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#64748B]">Company</label>
                      <input
                        type="text"
                        disabled
                        value={companiesList?.find((c: Company) => c.id === formData.from_company_id)?.name || ''}
                        className="w-full px-3 py-2 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-500"
                      />
                      <p className="mt-1 text-xs text-gray-400">The company the employee currently belongs to.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#64748B]">Designation</label>
                      <input
                        type="text"
                        disabled
                        value={formData.fromDesignationName || ''}
                        className="w-full px-3 py-2 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-500"
                      />
                      <p className="mt-1 text-xs text-gray-400">The employee's current job title.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#64748B]">Department</label>
                      <input
                        type="text"
                        disabled
                        value={allDepartments?.find((d: Department) => d.id === formData.from_department_id)?.name || ''}
                        className="w-full px-3 py-2 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-500"
                      />
                      <p className="mt-1 text-xs text-gray-400">The employee's current department.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#64748B]">Branches</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(formData.selectedEmployeeBranches || []).map((b: { id: number; name?: string }) => (
                          <span key={b.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#EFF6FF] text-[#1C64F2] text-xs font-medium rounded-md">
                            {b.name || `Branch ${b.id}`}
                          </span>
                        ))}
                        {(formData.selectedEmployeeBranches || []).length === 0 && (
                          <span className="text-xs text-gray-400">No branch selected</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">All branches the employee is currently assigned to.</p>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <h4 className="text-sm font-semibold text-[#1C64F2]">New Target Assignment</h4>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#334155]">Company *</label>
                      <SearchableSelect
                        value={formData.to_company_id || ''}
                        onChange={(val) => setFormData({ ...formData, to_company_id: val === 'all' ? undefined : Number(val), to_department_id: undefined, to_designation_id: undefined, to_branch_ids: [], to_branch_id: undefined })}
                        options={(companiesList || []).map((company: Company) => ({ id: company.id, name: company.name }))}
                        placeholder="Select Company..."
                        showAllOption={false}
                        clearable
                        className="w-full"
                      />
                      <p className="mt-1 text-xs text-gray-400">Choose the company the employee is moving to.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#334155]">Department</label>
                      {formData.to_company_id ? (
                        <SearchableSelect
                          value={formData.to_department_id || ''}
                          onChange={(val) => setFormData({ ...formData, to_department_id: val === 'all' ? undefined : Number(val) })}
                          options={(allDepartments || []).filter((d: Department) => (d as { companyId?: number }).companyId === Number(formData.to_company_id)).map((dept: Department) => ({ id: dept.id, name: dept.name }))}
                          placeholder="Select Department..."
                          showAllOption={false}
                          clearable
                          className="w-full"
                        />
                      ) : (
                        <input
                          type="text"
                          disabled
                          placeholder="Select a company first"
                          className="w-full px-3 py-2 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-400"
                        />
                      )}
                      <p className="mt-1 text-xs text-gray-400">The department the employee will join in the new company.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#334155]">Designation</label>
                      {formData.to_company_id ? (
                        <SearchableSelect
                          value={formData.to_designation_id || ''}
                          onChange={(val) => setFormData({ ...formData, to_designation_id: val === 'all' ? undefined : Number(val) })}
                          options={(allDesignations || []).filter((des: Designation) => (des as { companyId?: number }).companyId === Number(formData.to_company_id)).map((des: Designation) => ({ id: des.id, name: des.title }))}
                          placeholder="Select Designation..."
                          showAllOption={false}
                          clearable
                          className="w-full"
                        />
                      ) : (
                        <input
                          type="text"
                          disabled
                          placeholder="Select a company first"
                          className="w-full px-3 py-2 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-400"
                        />
                      )}
                      <p className="mt-1 text-xs text-gray-400">The job title the employee will hold in the new company.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#334155]">Branches *</label>
                      {formData.to_company_id ? (
                        <BranchMultiSelect
                          branches={(allBranches || []).filter((b: Branch) => (b as { companyId?: number }).companyId === Number(formData.to_company_id))}
                          selected={(formData.to_branch_ids || [])}
                          onChange={(ids) => setFormData({ ...formData, to_branch_ids: ids, to_branch_id: ids.length > 0 ? ids[0] : undefined })}
                        />
                      ) : (
                        <input
                          type="text"
                          disabled
                          placeholder="Select a company first"
                          className="w-full px-3 py-2 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-400"
                        />
                      )}
                      <p className="mt-1 text-xs text-gray-400">Select one or more branches to transfer the employee to.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#334155]">Transfer Type *</label>
                    <SearchableSelect
                      value={formData.type}
                      onChange={(val) => setFormData({ ...formData, type: val === 'all' ? 'permanent' : String(val) })}
                      options={transferTypeOptions.map((opt: TransferTypeOption) => ({ id: opt.code, name: opt.name }))}
                      placeholder="Select transfer type..."
                      showAllOption={false}
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-400">Permanent moves the employee for good; temporary keeps the original branch and can be reverted later.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[#334155]">Start Date *</label>
                    <DatePicker value={formData.start_date} onChange={(val) => setFormData({...formData, start_date: val})} required />
                    <p className="mt-1 text-xs text-gray-400">The date the transfer takes effect.</p>
                  </div>

                  {formData.type === 'temporary' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-[#334155]">End Date *</label>
                      <DatePicker value={formData.end_date ?? ''} onChange={(val) => setFormData({...formData, end_date: val})} />
                      <p className="mt-1 text-xs text-gray-400">The date the temporary transfer ends and the employee returns to their original branch.</p>
                    </div>
                  )}

                  <div className={`space-y-1.5 ${formData.type === 'temporary' ? '' : 'lg:col-span-2'}`}>
                    <label className="text-sm font-medium text-[#334155]">Reason for Transfer *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Relocation, Project Assignment"
                      value={formData.reason || ''}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                    />
                    <p className="mt-1 text-xs text-gray-400">A short explanation of why this transfer is being initiated.</p>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0] bg-white">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingTransferId(null); }}
                  className="px-6 py-2.5 text-sm font-medium text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="transfer-form"
                  disabled={createMutation.isPending || updateTransferMutation.isPending}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-[#1C64F2] hover:bg-[#1C64F2]/90 rounded-xl transition-colors flex items-center gap-2 shadow-sm shadow-[#1C64F2]/20 disabled:opacity-50"
                >
                  {(createMutation.isPending || updateTransferMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingTransferId ? 'Update Transfer' : 'Submit Transfer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmActionModal
        isOpen={!!bulkDeleteTransferTarget}
        title={`Delete ${bulkDeleteTransferTarget?.length || 0} Transfer(s)?`}
        message={`You are about to delete ${bulkDeleteTransferTarget?.length || 0} selected transfer(s).`}
        consequence="This action cannot be undone. Transfer records will be permanently removed."
        confirmLabel="Delete Transfers"
        variant="danger"
        onConfirm={() => {
          if (bulkDeleteTransferTarget) {
            bulkDeleteTransferTarget.forEach((t) => deleteMutation.mutate(t.id));
            setBulkDeleteTransferTarget(null);
          }
        }}
        onCancel={() => setBulkDeleteTransferTarget(null)}
      />
      <ConfirmActionModal
        isOpen={!!singleDeleteTransferTarget}
        title={`Delete Transfer for ${singleDeleteTransferTarget?.employee_name || ''}?`}
        message={`You are about to delete the transfer record for ${singleDeleteTransferTarget?.employee_name || ''}.`}
        consequence="This action cannot be undone. The transfer record will be permanently removed."
        confirmLabel="Delete Transfer"
        variant="danger"
        onConfirm={() => {
          if (singleDeleteTransferTarget) {
            deleteMutation.mutate(singleDeleteTransferTarget.id);
            setSingleDeleteTransferTarget(null);
          }
        }}
        onCancel={() => setSingleDeleteTransferTarget(null)}
      />
    </div>
  );
};

export default TransfersSection;
