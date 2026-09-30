import React, { useState, useEffect } from 'react';
import type { Asset } from '../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Laptop, Monitor, Smartphone, Tablet, Headphones, Printer,
  Plus, User, Edit2, Edit3, Trash2, CheckCircle, XCircle, Upload, Download,
  List, X, AlertTriangle, ClipboardList, Wrench, Loader2,
  TrendingDown, Gauge, ShieldCheck, UserPlus, Wallet
} from 'lucide-react';
import api, { getErrorMessage } from '../services/api';
import { formatAppDate } from '../services/appSettingsService';
import DatePicker from '../components/DatePicker';
import DateRangePicker from '../components/DateRangePicker';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import { capitalizeStatus } from '../utils/statusUtils';
import SearchableSelect from '../components/SearchableSelect';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import BulkDeleteModal from '../components/BulkDeleteModal';
import { useUndoDelete } from '../hooks/useUndoDelete';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { normalizePickerEmployee, formatEmployeeLabel } from '../utils/employeePickerUtils';
import type { EmployeePickerItem } from '../services/employeeListService';
import { personDisplayName } from '../utils/employeeNameUtils';
import { calcDepreciation, formatCurrencyRs } from '../utils/depreciation';
import Tooltip from '../components/Tooltip';
import PageSkeleton from '../components/skeleton/PageSkeleton';

type AssetPayload = Omit<Partial<Asset>, 'employeeId'> & { employeeId?: number | null };

interface AssetFormState {
  employeeId: string;
  assetType: string;
  assetName: string;
  serialNumber: string;
  status: string;
  purchaseDate: string;
  issueDate: string;
  value: number;
  purchaseValue: number;
  usefulLifeYears: number;
  depreciationRate: number;
  salvageValue: number;
  notes: string;
}

const EMPTY_ASSET_FORM: AssetFormState = {
  employeeId: '', assetType: 'laptop', assetName: '', serialNumber: '', status: 'available',
  purchaseDate: '', issueDate: '', value: 0, purchaseValue: 0, usefulLifeYears: 5,
  depreciationRate: 20, salvageValue: 0, notes: '',
};

const ASSET_TABS = [
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'all', label: 'All Assets', icon: List },
  { id: 'available', label: 'Available Assets', icon: CheckCircle },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'scrap', label: 'Dismantled', icon: AlertTriangle },
];

const assetIcons: Record<string, React.ComponentType<{ className?: string }>> = { laptop: Laptop, desktop: Monitor, mobile: Smartphone, tablet: Tablet, headphone: Headphones, printer: Printer };

export default function AssetManagement() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('assignments');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AssetFormState>({ ...EMPTY_ASSET_FORM });
  const [assetCompanyId, setAssetCompanyId] = useState('');
  const [assetBranchId, setAssetBranchId] = useState('');
  const [assetDeptId, setAssetDeptId] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('all');
  const [filterBranchId, setFilterBranchId] = useState('all');
  const [filterDeptId, setFilterDeptId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [assignModal, setAssignModal] = useState<{ asset: Asset | null; employeeId: string; issueDate: string }>({ asset: null, employeeId: '', issueDate: '' });
  const [bulkDeleteAssets, setBulkDeleteAssets] = useState<{ items: Asset[] } | null>(null);

  const { data: assets = [], isLoading: assetLoading, isFetching } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => { try { const r = await api.get('/assets'); return r.data || []; } catch { return []; } },
  });

  const { data: pickerEmployees = [] } = useEmployeePicker({ status: 'active' });
  const employees = pickerEmployees.map(normalizePickerEmployee);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: assetTypeOptions = [] } = useMasterData('ASSET_TYPE');
  const { data: assetStatusOptions = [] } = useMasterData('ASSET_STATUS');
  useMasterData('PRIORITY');

  const { data: companiesList = [] } = useQuery({
    queryKey: ['companies-asset-form'],
    queryFn: () => api.get('/companies').then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: branchesList = [] } = useQuery({
    queryKey: ['branches-asset', assetCompanyId],
    queryFn: () => api.get('/branches', { params: assetCompanyId ? { companyId: assetCompanyId } : {} }).then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: departmentsList = [] } = useQuery({
    queryKey: ['departments-asset', assetCompanyId],
    queryFn: () => api.get('/departments', { params: assetCompanyId ? { companyId: assetCompanyId } : {} }).then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const filteredEmployees = employees?.filter((e) => {
    if (assetCompanyId && String(e.companyId || e.company_id) !== assetCompanyId) return false;
    if (assetBranchId) {
      const eBranches = e.branchId ? [e.branchId] : [];
      if (!eBranches.includes(Number(assetBranchId))) return false;
    }
    if (assetDeptId && String(e.departmentId || e.department_id) !== assetDeptId) return false;
    return true;
  }) || [];

  const createMutation = useMutation({
    mutationFn: (payload: AssetPayload) => api.post('/assets', payload),
    onSuccess: () => { toast.success('Asset created'); queryClient.invalidateQueries({ queryKey: ['assets'] }); setShowForm(false); resetForm(); },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to create asset')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssetPayload }) => api.put(`/assets/${id}`, payload),
    onSuccess: () => { toast.success('Asset updated'); queryClient.invalidateQueries({ queryKey: ['assets'] }); setShowForm(false); resetForm(); },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to update asset')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/assets/${id}`),
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to delete asset')),
  });

  const restoreAsset = async (a: Asset) => {
    const payload: AssetPayload = {
      assetType: a.assetType,
      assetName: a.assetName,
      serialNumber: a.serialNumber,
      status: a.status,
      purchaseDate: a.purchaseDate,
      issueDate: a.issueDate,
      value: a.value ?? 0,
      purchaseValue: a.purchaseValue,
      usefulLifeYears: a.usefulLifeYears,
      depreciationRate: a.depreciationRate,
      salvageValue: a.salvageValue,
      notes: a.notes,
      employeeId: a.employeeId ?? null,
    };
    return api.post('/assets', payload);
  };

  const { deleteWithUndo } = useUndoDelete<Asset>({
    entityName: 'Asset',
    onDelete: (a) => deleteMutation.mutateAsync(a.id),
    onRestore: restoreAsset,
    onDeleteDone: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
    onRestoreDone: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, employeeId, issueDate }: { id: number; employeeId: number; issueDate?: string }) => api.put(`/assets/${id}`, { employeeId, status: 'assigned', issueDate: issueDate || new Date().toISOString().split('T')[0] }),
    onSuccess: () => { toast.success('Asset assigned'); queryClient.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to assign asset')),
  });

  const returnMutation = useMutation({
    mutationFn: (id: number) => api.put(`/assets/${id}`, { employeeId: null, status: 'available' }),
    onSuccess: () => { toast.success('Asset returned'); queryClient.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to return asset')),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/assets/${id}`, { status }),
    onSuccess: () => { toast.success('Asset status updated'); queryClient.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to update asset')),
  });

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/assets/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'assets_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const matchesScope = (a: Asset) => {
    if (filterCompanyId !== 'all') {
      const emp = employees?.find((e) => e.id === a.employeeId);
      if (!emp || String(emp.companyId || emp.company_id) !== filterCompanyId) return false;
    }
    if (filterBranchId !== 'all') {
      const emp = employees?.find((e) => e.id === a.employeeId);
      if (!emp) return false;
      const eBranches = emp.branchId ? [emp.branchId] : [];
      if (!eBranches.includes(Number(filterBranchId))) return false;
    }
    if (filterDeptId !== 'all') {
      const emp = employees?.find((e) => e.id === a.employeeId);
      if (!emp || String(emp.departmentId || emp.department_id) !== filterDeptId) return false;
    }
    if (startDate || endDate) {
      const matchesPurchase = a.purchaseDate && (!startDate || a.purchaseDate >= startDate) && (!endDate || a.purchaseDate <= endDate);
      const matchesIssue = a.issueDate && (!startDate || a.issueDate >= startDate) && (!endDate || a.issueDate <= endDate);
      if (!matchesPurchase && !matchesIssue) return false;
    }
    return true;
  };

  const tableFiltered = assets.filter((a: Asset) => {
    if (search && !a.assetName?.toLowerCase().includes(search.toLowerCase()) && !a.serialNumber?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return matchesScope(a);
  });

  const assignedAssets = assets.filter((a: Asset) => a.status === 'assigned' && matchesScope(a));
  const availableAssets = assets.filter((a: Asset) => a.status === 'available' && matchesScope(a));

  const resetForm = () => {
    setForm({ ...EMPTY_ASSET_FORM });
    setAssetCompanyId(''); setAssetBranchId(''); setAssetDeptId('');
    setEditingId(null);
  };

  const openAddForm = () => { resetForm(); setShowForm(true); };

  const openEditForm = (asset: Asset) => {
    setForm({
      employeeId: asset.employeeId ? String(asset.employeeId) : '',
      assetType: asset.assetType || 'laptop',
      assetName: asset.assetName || '',
      serialNumber: asset.serialNumber || '',
      status: asset.status || 'available',
      purchaseDate: asset.purchaseDate || '',
      issueDate: asset.issueDate || '',
      value: asset.value || 0,
      purchaseValue: asset.purchaseValue || asset.value || 0,
      usefulLifeYears: asset.usefulLifeYears || 5,
      depreciationRate: asset.depreciationRate || 20,
      salvageValue: asset.salvageValue || 0,
      notes: asset.notes || '',
    });
    setEditingId(asset.id);
    setShowForm(true);
  };

  const saveAsset = () => {
    if (!form.assetName || !form.serialNumber) { toast.error('Asset name and serial number required'); return; }
    const payload: AssetPayload = {
      ...form,
      employeeId: form.employeeId ? (parseInt(form.employeeId) || null) : null,
      value: parseFloat(String(form.value)) || 0,
      purchaseValue: parseFloat(String(form.purchaseValue)) || 0,
      usefulLifeYears: parseFloat(String(form.usefulLifeYears)) || 0,
      depreciationRate: parseFloat(String(form.depreciationRate)) || 0,
      salvageValue: parseFloat(String(form.salvageValue)) || 0,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const totalBookValue = assets.reduce((s: number, a: Asset) => s + calcDepreciation(a.purchaseValue || a.value || 0, a.purchaseDate, a.usefulLifeYears, a.depreciationRate, a.salvageValue).currentValue, 0);

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (assets.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [assets, hasLoaded]);

  const isInitialAssetLoading = !hasLoaded && isFetching;
  if (isInitialAssetLoading) {
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
      <PageHero
        title="Asset Management"
        subtitle="Track assigned assets and maintain assets"
        icon={Laptop}
        accent="cyan"
        breadcrumbs={['HRMS.Pro!', 'Assets']}
        actions={
          activeTab === 'all' ? (
            <>
              <ExportButton
                rows={tableFiltered}
                filename="assets_export"
                label="Export"
              />
              <button onClick={() => setShowUploadModal(true)} title="Upload assets via CSV"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <button onClick={openAddForm}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl text-sm font-semibold shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]">
                <Plus className="w-4 h-4" /> Add Asset
              </button>
            </>
          ) : activeTab === 'assignments' ? (
            <>
              <ExportButton
                rows={assignedAssets}
                filename="assigned_assets_export"
                label="Export"
              />
              <button onClick={() => setShowUploadModal(true)} title="Upload assets via CSV"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
              <button onClick={() => setActiveTab('available')}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl text-sm font-semibold shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]">
                <Plus className="w-4 h-4" /> Assign Asset
              </button>
            </>
          ) : undefined
        }
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0ms' }}>
          <StatsCard icon={Laptop} label="Total Assets" value={assets.length} tooltip="Total assets tracked in the system" trend={assets.length > 0 ? 5 : 0} color="blue" onClick={() => setActiveTab('all')} />
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '100ms' }}>
          <StatsCard icon={User} label="Assigned" value={assignedAssets.length} tooltip="Assets currently assigned to employees" trend={assignedAssets.length > 0 ? 3 : 0} color="purple" onClick={() => setActiveTab('assignments')} />
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '200ms' }}>
          <StatsCard icon={CheckCircle} label="Available" value={availableAssets.length} tooltip="Assets available for assignment" trend={availableAssets.length > 0 ? 2 : 0} color="green" onClick={() => setActiveTab('available')} />
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '300ms' }}>
          <StatsCard icon={Wallet} label="Total Book Value (Rs.)" value={Math.round(totalBookValue)} tooltip="Total depreciated book value of all assets" trend={-2} color="orange" onClick={() => setActiveTab('analytics')} />
        </div>
      </div>

      {/* Sub-menu Tabs */}
      <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          {ASSET_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
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

      {/* ───────────── ALL ASSETS TAB ───────────── */}
      {activeTab === 'all' && (
        <>
          {/* Assets Card (filters + table in one) */}
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)]">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={filterCompanyId === 'all' ? 'all' : filterCompanyId}
                  onChange={(val) => { setFilterCompanyId(val.toString()); setFilterBranchId('all'); setFilterDeptId('all'); }}
                  options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterBranchId === 'all' ? 'all' : filterBranchId}
                  onChange={(val) => setFilterBranchId(val.toString())}
                  options={branches.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterDeptId === 'all' ? 'all' : filterDeptId}
                  onChange={(val) => setFilterDeptId(val.toString())}
                  options={departments.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterStatus}
                  onChange={(val) => setFilterStatus(val.toString())}
                  options={[
                    { id: 'available', name: 'Available' },
                    { id: 'assigned', name: 'Assigned' },
                    { id: 'maintenance', name: 'Maintenance' },
                    { id: 'retired', name: 'Dismantled' },
                  ]}
                  placeholder="All Status"
                  allOption="All Status"
                  className="w-40"
                />
                <DateRangePicker startDate={startDate} endDate={endDate}
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} placeholder="Filter by Date" />
                {(search || filterCompanyId !== 'all' || filterBranchId !== 'all' || filterDeptId !== 'all' || filterStatus !== 'all' || startDate || endDate) && (
                  <button onClick={() => { setSearch(''); setFilterCompanyId('all'); setFilterBranchId('all'); setFilterDeptId('all'); setFilterStatus('all'); setStartDate(''); setEndDate(''); }}
                    className="flex items-center gap-2 px-4 py-2.5 text-[var(--danger-red)] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl text-sm font-medium transition-colors">
                    <X className="w-4 h-4" /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Assets Table */}
            <div className="overflow-x-auto">
            {assetLoading ? <div className="animate-page-enter"><PageSkeleton /></div> : (
            <DataTable
              data={tableFiltered}
              rowKey={(a: Asset) => a.id}
              searchable
              searchKeys={(a: Asset) => `${a.assetName} ${a.assetType} ${a.serialNumber || ''} ${a.employeeName || ''} ${a.companyName || ''} ${a.branchName || ''} ${a.departmentName || ''}`}
              searchPlaceholder="Search assets by name, type, serial or employee..."
              emptyMessage="No assets found" persistKey="assets"
              logEntityType="asset"
              logFor={(a: Asset) => ({ id: a.id, label: a.assetName })}
              onEdit={(a) => openEditForm(a)}
              onDelete={(items) => setBulkDeleteAssets({ items })}
              bulkActions={[
                {
                  label: 'Send to Maintenance',
                  icon: Wrench,
                  variant: 'amber',
                  onAction: (items) => { items.forEach((a: Asset) => maintenanceMutation.mutate({ id: a.id, status: 'maintenance' })); },
                },
                {
                  label: 'Mark Available',
                  icon: CheckCircle,
                  variant: 'success',
                  onAction: (items) => { items.forEach((a: Asset) => updateMutation.mutate({ id: a.id, payload: { status: 'available' } })); },
                },
              ]}
              columns={[
                {
                  key: 'assetName', header: 'Asset', sortable: true,
                  render: (a: Asset) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                        {React.createElement(assetIcons[a.assetType] || Laptop, { className: 'w-4 h-4 text-white' })}
                      </div>
                      <span className="text-sm font-semibold text-[#0F172A]">{a.assetName}</span>
                    </div>
                  ),
                  sortValue: (a: Asset) => a.assetName,
                },
                { key: 'assetType', header: 'Type', render: (a: Asset) => <span className="text-sm text-[#64748B] capitalize">{a.assetType}</span> },
                { key: 'serialNumber', header: 'Serial No.', render: (a: Asset) => <span className="text-sm text-[#64748B] font-mono">{a.serialNumber}</span> },
                { key: 'companyName', header: 'Company', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.companyName || '-'}</span> },
                { key: 'branchName', header: 'Branch', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.branchName || '-'}</span> },
                { key: 'departmentName', header: 'Department', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.departmentName || '-'}</span> },
                {
                  key: 'status', header: 'Status', sortable: true,
                  render: (a: Asset) => {
                    const s = (a.status || '').toLowerCase();
                    const cls = s === 'assigned' ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' : s === 'available' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'maintenance' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : s === 'retired' ? 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{s === 'retired' ? 'Dismantled' : capitalizeStatus(a.status)}</span>;
                  },
                  sortValue: (a: Asset) => a.status,
                },
                { key: 'purchaseDate', header: 'Purchase Date', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.purchaseDate ? formatAppDate(a.purchaseDate) : '-'}</span> },
                { key: 'purchaseValue', header: 'Purchase Value', sortable: true, align: 'right', render: (a: Asset) => <span className="text-sm text-[#475569]">{formatCurrencyRs(a.purchaseValue || a.value || 0)}</span>, sortValue: (a: Asset) => a.purchaseValue || a.value || 0 },
                {
                  key: 'bookValue', header: 'Book Value', sortable: true, align: 'right',
                  render: (a: Asset) => {
                    const d = calcDepreciation(a.purchaseValue || a.value || 0, a.purchaseDate, a.usefulLifeYears, a.depreciationRate, a.salvageValue);
                    return <span className="text-sm font-semibold text-[#0F172A]">{formatCurrencyRs(d.currentValue)}</span>;
                  },
                  sortValue: (a: Asset) => calcDepreciation(a.purchaseValue || a.value || 0, a.purchaseDate, a.usefulLifeYears, a.depreciationRate, a.salvageValue).currentValue,
                },
                {
                  key: 'depreciation', header: 'Depreciation', align: 'right',
                  render: (a: Asset) => {
                    const d = calcDepreciation(a.purchaseValue || a.value || 0, a.purchaseDate, a.usefulLifeYears, a.depreciationRate, a.salvageValue);
                    return (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm text-[#B45309]">{formatCurrencyRs(d.accumulatedDepreciation)}</span>
                        <div className="w-20 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${d.pctDepreciated}%` }} />
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: 'health', header: 'Health', align: 'center',
                  render: (a: Asset) => {
                    const d = calcDepreciation(a.purchaseValue || a.value || 0, a.purchaseDate, a.usefulLifeYears, a.depreciationRate, a.salvageValue);
                    const health = Math.max(0, Math.round(100 - d.pctDepreciated));
                    const color = health >= 60 ? 'text-[#059669]' : health >= 30 ? 'text-[#D97706]' : 'text-[#DC2626]';
                    const bg = health >= 60 ? 'bg-[#D1FAE5]' : health >= 30 ? 'bg-[#FEF3C7]' : 'bg-[#FEE2E2]';
                    return (
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg} ${color}`}>
                          <ShieldCheck className="w-3 h-3" /> {health}%
                        </span>
                        <span className="text-[10px] text-[#94A3B8]">{d.fullyDepreciated ? 'Fully depreciated' : `${d.remainingLifeYears.toFixed(1)} yrs left`}</span>
                      </div>
                    );
                  },
                },
              ]}
              actions={(a: Asset) => (
                <div className="flex items-center justify-end gap-1.5">
                  {a.status === 'assigned' && a.employeeId && (
                    <Tooltip id={`btn-maint-asset-${a.id}`} content="Send to maintenance">
                      <button onClick={() => maintenanceMutation.mutate({ id: a.id, status: 'maintenance' })}
                        className="p-2 rounded-lg bg-[#FFFBEB] text-[#D97706] hover:bg-[#FEF3C7] transition-colors" title="Send to maintenance">
                        <Wrench className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  )}
                  {a.status === 'maintenance' && (
                    <Tooltip id={`btn-available-asset-${a.id}`} content="Mark available">
                      <button onClick={() => maintenanceMutation.mutate({ id: a.id, status: 'available' })}
                        className="p-2 rounded-lg bg-[#D1FAE5] text-[#059669] hover:bg-[#A7F3D0] transition-colors" title="Mark available">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip id={`btn-edit-asset-${a.id}`} content="Edit">
                    <button onClick={() => openEditForm(a)}
                      className="p-2 rounded-lg text-[#1C64F2] hover:bg-[#1C64F2]/10 transition-colors" title="Edit">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip id={`btn-delete-asset-${a.id}`} content="Delete">
                    <button onClick={() => deleteWithUndo(a)}
                      className="p-2 rounded-lg text-[#DC2626] hover:bg-[#DC2626]/10 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
              )}
            />
            )}
            </div>
          </div>

          {/* Add/Edit Asset Modal */}
          <Modal
            isOpen={showForm}
            onClose={() => { setShowForm(false); resetForm(); }}
            title={editingId ? 'Edit Asset' : 'Add Asset'}
            size="lg"
          >
                    <form id="assetForm" onSubmit={(e) => { e.preventDefault(); saveAsset(); }} className="space-y-6">
                      <section>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                          <span className="w-1.5 h-4 rounded-full bg-[#F59E0B]" /> Assignment & Dates
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                            <SearchableSelect
                              value={assetCompanyId || 'all'}
                              onChange={(val) => { setAssetCompanyId(val === 'all' ? '' : val.toString()); setAssetBranchId(''); setAssetDeptId(''); setForm(f => ({ ...f, employeeId: '' })); }}
                              options={companiesList.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                              placeholder="Select company"
                              allOption="Select company"
                            />
                            <p className="mt-1 text-xs text-gray-400">Company that owns the asset</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                            <SearchableSelect
                              value={assetBranchId || 'all'}
                              onChange={(val) => { setAssetBranchId(val === 'all' ? '' : val.toString()); setForm(f => ({ ...f, employeeId: '' })); }}
                              options={branchesList.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                              placeholder="Select branch"
                              allOption="Select branch"
                            />
                            <p className="mt-1 text-xs text-gray-400">Branch where asset is assigned</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                            <SearchableSelect
                              value={assetDeptId || 'all'}
                              onChange={(val) => { setAssetDeptId(val === 'all' ? '' : val.toString()); setForm(f => ({ ...f, employeeId: '' })); }}
                              options={departmentsList.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                              placeholder="Select department"
                              allOption="Select department"
                            />
                            <p className="mt-1 text-xs text-gray-400">Department for the asset</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Employee <span className="text-gray-400 font-normal">(optional — assign later from the list)</span></label>
                            <SearchableSelect
                              value={form.employeeId || 'all'}
                              onChange={(val) => setForm(f => ({ ...f, employeeId: val === 'all' ? '' : val.toString() }))}
                              options={filteredEmployees.map((e) => ({ id: e.id, name: formatEmployeeLabel(e as unknown as EmployeePickerItem) }))}
                              placeholder="Unassigned"
                              allOption="Unassigned"
                            />
                            <p className="mt-1 text-xs text-gray-400">
                              {filteredEmployees.length === 0
                                ? 'No employees match the selected company / branch / department — clear filters to see everyone.'
                                : 'Leave unassigned to add the asset to stock first.'}
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                            <DatePicker value={form.purchaseDate} onChange={(val: string) => setForm(f => ({ ...f, purchaseDate: val }))} />
                            <p className="mt-1 text-xs text-gray-400">Date asset was purchased</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Issued Date</label>
                            <DatePicker value={form.issueDate} onChange={(val: string) => setForm(f => ({ ...f, issueDate: val }))} />
                            <p className="mt-1 text-xs text-gray-400">Date asset was issued to employee</p>
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                          <span className="w-1.5 h-4 rounded-full bg-[#1C64F2]" /> Asset Identity
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name *</label>
                            <input
                              value={form.assetName}
                              onChange={e => setForm(f => ({ ...f, assetName: e.target.value }))}
                              placeholder="e.g. MacBook Pro 14&quot;"
                              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[#0F172A]"
                            />
                            <p className="mt-1 text-xs text-gray-400">Name of the asset, e.g. MacBook Pro</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number *</label>
                            <input
                              value={form.serialNumber}
                              onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))}
                              placeholder="e.g. SN-2026-0001"
                              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[#0F172A]"
                            />
                            <p className="mt-1 text-xs text-gray-400">Serial number of the asset</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type *</label>
                            <SearchableSelect
                              value={form.assetType || 'all'}
                              onChange={(val) => setForm(f => ({ ...f, assetType: val === 'all' ? '' : val.toString() }))}
                              options={(assetTypeOptions || []).map((opt: { code: string; name: string }) => ({ id: opt.code, name: opt.name }))}
                              placeholder="Select type"
                              allOption="Select type"
                            />
                            <p className="mt-1 text-xs text-gray-400">Type: laptop, desktop, mobile, etc.</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <SearchableSelect
                              value={form.status || 'all'}
                              onChange={(val) => setForm(f => ({ ...f, status: val === 'all' ? 'available' : val.toString() }))}
                              options={(assetStatusOptions || []).map((opt: { code: string; name: string }) => ({ id: opt.code, name: opt.name }))}
                              placeholder="Select status"
                              allOption="Select status"
                            />
                            <p className="mt-1 text-xs text-gray-400">Status: available, assigned, maintenance</p>
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 pt-2 border-t border-[var(--border-color)]">
                          <span className="w-1.5 h-4 rounded-full bg-[#10B981]" /> Financials & Depreciation
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Value</label>
                            <input
                              type="number" min={0}
                              value={form.purchaseValue}
                              onChange={e => { const v = parseFloat(e.target.value) || 0; setForm(f => ({ ...f, purchaseValue: v, value: v })); }}
                              placeholder="e.g. 85000"
                              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[#0F172A]"
                            />
                            <p className="mt-1 text-xs text-gray-400">Purchase price in INR</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Salvage Value</label>
                            <input
                              type="number" min={0}
                              value={form.salvageValue}
                              onChange={e => setForm(f => ({ ...f, salvageValue: parseFloat(e.target.value) || 0 }))}
                              placeholder="e.g. 5000"
                              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[#0F172A]"
                            />
                            <p className="mt-1 text-xs text-gray-400">Value at end of useful life</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Useful Life (years)</label>
                            <input
                              type="number" min={1}
                              value={form.usefulLifeYears}
                              onChange={e => { const v = parseFloat(e.target.value) || 0; setForm(f => ({ ...f, usefulLifeYears: v, depreciationRate: v > 0 ? Math.round((100 / v) * 100) / 100 : form.depreciationRate })); }}
                              placeholder="e.g. 5"
                              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[#0F172A]"
                            />
                            <p className="mt-1 text-xs text-gray-400">Expected useful life in years</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Depreciation Rate (%/yr)</label>
                            <input
                              type="number" min={0} max={100}
                              value={form.depreciationRate}
                              onChange={e => setForm(f => ({ ...f, depreciationRate: parseFloat(e.target.value) || 0 }))}
                              placeholder="e.g. 20"
                              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[#0F172A]"
                            />
                            <p className="mt-1 text-xs text-gray-400">Annual depreciation percentage</p>
                          </div>
                        </div>
                        {form.purchaseValue > 0 && (
                          <div className="rounded-xl bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 border border-indigo-100 px-4 py-3 mt-4">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-[#64748B] flex items-center gap-1.5"><TrendingDown className="w-4 h-4 text-[#4F46E5]" /> Annual depreciation</span>
                              <span className="font-bold text-[#0F172A]">{formatCurrencyRs(((form.purchaseValue - form.salvageValue) / Math.max(1, form.usefulLifeYears)))}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-1.5">
                              <span className="text-[#64748B] flex items-center gap-1.5"><Gauge className="w-4 h-4 text-[#059669]" /> Book value at purchase</span>
                              <span className="font-bold text-[#0F172A]">{formatCurrencyRs(form.purchaseValue)}</span>
                            </div>
                          </div>
                        )}
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                          <textarea
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Additional notes about this asset..."
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[#0F172A] h-20"
                          />
                        </div>
                      </section>

                      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                        <button
                          type="button"
                          onClick={() => { setShowForm(false); resetForm(); }}
                          className="px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={createMutation.isPending || updateMutation.isPending}
                          className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
                        >
                          {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                          {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                        </button>
                      </div>
                    </form>
          </Modal>
        </>
      )}

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => { setShowUploadModal(false); setUploadFile(null); }}
        title="Bulk Upload Assets"
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
              <strong>Required columns:</strong> assetName, assetType, serialNumber, status, value, purchaseValue, purchaseDate, notes, employeeCode
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
              onClick={() => { setShowUploadModal(false); setUploadFile(null); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!uploadFile) { toast.error('Please choose a CSV file first'); return; }
                setUploading(true);
                try {
                  const formData = new FormData();
                  formData.append('file', uploadFile);
                  const res = await api.post('/assets/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                  toast.success(res.data?.message || 'Assets imported successfully');
                  queryClient.invalidateQueries({ queryKey: ['assets'] });
                  setShowUploadModal(false);
                  setUploadFile(null);
                } catch (err) {
                  toast.error(getErrorMessage(err, 'Failed to import assets'));
                } finally {
                  setUploading(false);
                }
              }}
              disabled={!uploadFile || uploading}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? (
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

      {/* ───────────── ASSIGNMENTS TAB ───────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)]">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={filterCompanyId === 'all' ? 'all' : filterCompanyId}
                  onChange={(val) => { setFilterCompanyId(val.toString()); setFilterBranchId('all'); setFilterDeptId('all'); }}
                  options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterBranchId === 'all' ? 'all' : filterBranchId}
                  onChange={(val) => setFilterBranchId(val.toString())}
                  options={branches.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterDeptId === 'all' ? 'all' : filterDeptId}
                  onChange={(val) => setFilterDeptId(val.toString())}
                  options={departments.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <DateRangePicker startDate={startDate} endDate={endDate}
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
                {(filterCompanyId !== 'all' || filterBranchId !== 'all' || filterDeptId !== 'all' || startDate || endDate) && (
                  <button onClick={() => { setFilterCompanyId('all'); setFilterBranchId('all'); setFilterDeptId('all'); setStartDate(''); setEndDate(''); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#EF4444] hover:bg-red-50 rounded-lg transition-colors">
                    <X className="w-4 h-4" /> Clear
                  </button>
                )}
              </div>
            </div>
            {assignedAssets.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No assets currently assigned"
                description="Assign available assets to employees from the Assets tab"
              />
            ) : (
              <DataTable
                data={assignedAssets.filter((a: Asset) => {
                  if (filterCompanyId !== 'all' && String(a.companyId || a.company_id) !== filterCompanyId) return false;
                  if (filterDeptId !== 'all' && String(a.departmentId || a.department_id) !== filterDeptId) return false;
                  if (startDate && (!a.issueDate || a.issueDate < startDate)) return false;
                  if (endDate && (!a.issueDate || a.issueDate > endDate)) return false;
                  return true;
                })}
                rowKey={(asset: Asset) => asset.id}
                logEntityType="asset"
                logFor={(asset: Asset) => ({ id: asset.id, label: asset.assetName })}
                emptyMessage="No assets currently assigned"
                searchable
                searchKeys={(asset: Asset) => `${asset.assetName} ${asset.employeeName || ''} ${asset.serialNumber || ''} ${asset.assetType || ''} ${asset.companyName || ''} ${asset.branchName || ''} ${asset.departmentName || ''}`}
                searchPlaceholder="Search assigned assets by asset, employee or serial..."
                onEdit={(asset) => openEditForm(asset as Asset)}
                onDelete={(items) => setBulkDeleteAssets({ items: items as Asset[] })}
                bulkActions={[
                  {
                    label: 'Return',
                    icon: XCircle,
                    variant: 'success',
                    onAction: (items) => { items.forEach((a: Asset) => returnMutation.mutate(a.id)); },
                  },
                ]}
                columns={[
                  { key: 'employeeName', header: 'Employee Name', render: (asset: Asset) => asset.employeeName ? (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-medium text-[#0F172A] text-sm">{asset.employeeName}</span>
                          {asset.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{asset.employeeCode}</span>}
                        </div>
                        <div className="text-xs text-[#64748B] truncate max-w-[220px]">{asset.email || ''}</div>
                      </div>
                    </div>
                  ) : <span className="text-sm text-[#94A3B8]">Unknown</span> },
                  { key: 'companyName', header: 'Company', render: (asset: Asset) => <span className="text-sm text-[#64748B]">{asset.companyName || '-'}</span> },
                  { key: 'branchName', header: 'Branch', render: (asset: Asset) => <span className="text-sm text-[#64748B]">{asset.branchName || '-'}</span> },
                  { key: 'departmentName', header: 'Department', render: (asset: Asset) => <span className="text-sm text-[#64748B]">{asset.departmentName || '-'}</span> },
                  {
                    key: 'assetName', header: 'Asset', sortable: true,
                    render: (asset: Asset) => (
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">{asset.assetName}</p>
                        <p className="text-xs text-[#94A3B8]">{asset.serialNumber}</p>
                      </div>
                    ),
                    sortValue: (asset: Asset) => asset.assetName,
                  },
                  { key: 'issueDate', header: 'Issued Date', render: (asset: Asset) => <span className="text-sm text-[#64748B]">{asset.issueDate ? formatAppDate(asset.issueDate) : '-'}</span> },
                  { key: 'value', header: 'Value', sortable: true, render: (asset: Asset) => <span className="text-sm text-[#0F172A] font-medium">{(asset.value || 0).toLocaleString()}</span>, sortValue: (asset: Asset) => asset.value || 0 },
                ]}
                actions={(asset: Asset) => (
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => returnMutation.mutate(asset.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#D1FAE5] text-[#065F46] rounded-lg text-xs font-medium hover:bg-[#A7F3D0]">
                      <XCircle className="w-3.5 h-3.5" /> Return
                    </button>
                    <button onClick={() => openEditForm(asset)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteWithUndo(asset)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              />
            )}
          </div>
        </div>
      )}

      {/* Assign Asset Modal */}
      {assignModal.asset && (
        <Modal
          isOpen={!!assignModal.asset}
          onClose={() => setAssignModal({ asset: null, employeeId: '', issueDate: '' })}
          title={`Assign ${assignModal.asset.assetName}`}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                {React.createElement(assetIcons[assignModal.asset.assetType] || Laptop, { className: 'w-5 h-5 text-white' })}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">{assignModal.asset.assetName}</p>
                <p className="text-xs text-[#94A3B8]">{assignModal.asset.assetType} · {assignModal.asset.serialNumber}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Employee *</label>
              <SearchableSelect
                value={assignModal.employeeId || 'all'}
                onChange={(val) => setAssignModal(prev => ({ ...prev, employeeId: val === 'all' ? '' : val.toString() }))}
                options={(filteredEmployees || []).map((e) => ({ id: e.id, name: personDisplayName(e) }))}
                placeholder="Search employee..."
                allOption="Search employee..."
              />
              <p className="mt-1 text-xs text-gray-400">Employee receiving this asset</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
              <DatePicker
                value={assignModal.issueDate}
                onChange={(val: string) => setAssignModal(prev => ({ ...prev, issueDate: val }))}
              />
              <p className="mt-1 text-xs text-gray-400">Date the asset is issued</p>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setAssignModal({ asset: null, employeeId: '', issueDate: '' })}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  assignMutation.mutate({
                    id: assignModal.asset!.id,
                    employeeId: parseInt(assignModal.employeeId),
                    issueDate: assignModal.issueDate || undefined,
                  });
                  setAssignModal({ asset: null, employeeId: '', issueDate: '' });
                }}
                disabled={!assignModal.employeeId || assignMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#059669] to-[#10B981] text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {assignMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-4 h-4" /> Assign</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ───────────── AVAILABLE ASSETS TAB ───────────── */}
      {activeTab === 'available' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)]">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={filterCompanyId === 'all' ? 'all' : filterCompanyId}
                  onChange={(val) => { setFilterCompanyId(val.toString()); setFilterBranchId('all'); setFilterDeptId('all'); }}
                  options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterBranchId === 'all' ? 'all' : filterBranchId}
                  onChange={(val) => setFilterBranchId(val.toString())}
                  options={branches.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterDeptId === 'all' ? 'all' : filterDeptId}
                  onChange={(val) => setFilterDeptId(val.toString())}
                  options={departments.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <DateRangePicker startDate={startDate} endDate={endDate}
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} placeholder="Filter by Date" />
                {(filterCompanyId !== 'all' || filterBranchId !== 'all' || filterDeptId !== 'all' || startDate || endDate) && (
                  <button onClick={() => { setFilterCompanyId('all'); setFilterBranchId('all'); setFilterDeptId('all'); setStartDate(''); setEndDate(''); }}
                    className="flex items-center gap-2 px-4 py-2.5 text-[var(--danger-red)] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl text-sm font-medium transition-colors">
                    <X className="w-4 h-4" /> Clear
                  </button>
                )}
              </div>
            </div>
            <DataTable
              data={assets.filter((a: Asset) => {
                if (a.status !== 'available') return false;
                if (filterCompanyId !== 'all' && String(a.companyId || a.company_id) !== filterCompanyId) return false;
                if (filterDeptId !== 'all' && String(a.departmentId || a.department_id) !== filterDeptId) return false;
                if (startDate && (!a.issueDate || a.issueDate < startDate)) return false;
                if (endDate && (!a.issueDate || a.issueDate > endDate)) return false;
                return true;
              })}
              rowKey={(a: Asset) => a.id}
              searchable
              searchKeys={(a: Asset) => `${a.assetName} ${a.assetType} ${a.serialNumber || ''} ${a.companyName || ''} ${a.branchName || ''} ${a.departmentName || ''} ${a.status || ''}`}
              searchPlaceholder="Search by name, type, serial or employee..."
              emptyMessage="No available or maintenance assets"
              persistKey="assets-available"
              logEntityType="asset"
              logFor={(a: Asset) => ({ id: a.id, label: a.assetName })}
              onEdit={(a) => openEditForm(a as Asset)}
              onDelete={(items) => setBulkDeleteAssets({ items: items as Asset[] })}
              columns={[
                {
                  key: 'assetName', header: 'Asset', sortable: true,
                  render: (a: Asset) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                        {React.createElement(assetIcons[a.assetType] || Laptop, { className: 'w-4 h-4 text-white' })}
                      </div>
                      <span className="text-sm font-semibold text-[#0F172A]">{a.assetName}</span>
                    </div>
                  ),
                  sortValue: (a: Asset) => a.assetName,
                },
                { key: 'assetType', header: 'Type', render: (a: Asset) => <span className="text-sm text-[#64748B] capitalize">{a.assetType}</span> },
                { key: 'serialNumber', header: 'Serial No.', render: (a: Asset) => <span className="text-sm text-[#64748B] font-mono">{a.serialNumber}</span> },
                { key: 'companyName', header: 'Company', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.companyName || '-'}</span> },
                { key: 'branchName', header: 'Branch', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.branchName || '-'}</span> },
                { key: 'departmentName', header: 'Department', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.departmentName || '-'}</span> },
                {
                  key: 'status', header: 'Status', sortable: true,
                  render: (a: Asset) => {
                    const s = (a.status || '').toLowerCase();
                    const cls = s === 'available' ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : s === 'maintenance' ? 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{s === 'retired' ? 'Dismantled' : capitalizeStatus(a.status)}</span>;
                  },
                  sortValue: (a: Asset) => a.status,
                },
              ]}
              actions={(a: Asset) => (
                <div className="flex items-center justify-end gap-1.5">
                  {a.status === 'maintenance' ? (
                    <button onClick={() => updateMutation.mutate({ id: a.id, payload: { status: 'available' } })}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#D1FAE5] text-[#065F46] rounded-lg text-xs font-medium hover:bg-[#A7F3D0]">
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Available
                    </button>
                  ) : (
                    <button onClick={() => setAssignModal({ asset: a, employeeId: '', issueDate: new Date().toISOString().split('T')[0] })}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary-blue)] text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                      <UserPlus className="w-3.5 h-3.5" /> Assign
                    </button>
                  )}
                  <button onClick={() => openEditForm(a)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => deleteWithUndo(a)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {/* ───────────── MAINTENANCE TAB ───────────── */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)]">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={filterCompanyId === 'all' ? 'all' : filterCompanyId}
                  onChange={(val) => { setFilterCompanyId(val.toString()); setFilterBranchId('all'); setFilterDeptId('all'); }}
                  options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterBranchId === 'all' ? 'all' : filterBranchId}
                  onChange={(val) => setFilterBranchId(val.toString())}
                  options={branches.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterDeptId === 'all' ? 'all' : filterDeptId}
                  onChange={(val) => setFilterDeptId(val.toString())}
                  options={departments.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <DateRangePicker startDate={startDate} endDate={endDate}
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} placeholder="Filter by Date" />
                {(filterCompanyId !== 'all' || filterBranchId !== 'all' || filterDeptId !== 'all' || startDate || endDate) && (
                  <button onClick={() => { setFilterCompanyId('all'); setFilterBranchId('all'); setFilterDeptId('all'); setStartDate(''); setEndDate(''); }}
                    className="flex items-center gap-2 px-4 py-2.5 text-[var(--danger-red)] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl text-sm font-medium transition-colors">
                    <X className="w-4 h-4" /> Clear
                  </button>
                )}
              </div>
            </div>
            <DataTable
              data={assets.filter((a: Asset) => {
                if (a.status !== 'maintenance') return false;
                if (filterCompanyId !== 'all' && String(a.companyId || a.company_id) !== filterCompanyId) return false;
                if (filterDeptId !== 'all' && String(a.departmentId || a.department_id) !== filterDeptId) return false;
                if (startDate && (!a.issueDate || a.issueDate < startDate)) return false;
                if (endDate && (!a.issueDate || a.issueDate > endDate)) return false;
                return true;
              })}
              rowKey={(a: Asset) => a.id}
              searchable
              searchKeys={(a: Asset) => `${a.assetName} ${a.assetType} ${a.serialNumber || ''} ${a.companyName || ''} ${a.branchName || ''} ${a.departmentName || ''}`}
              searchPlaceholder="Search maintenance assets..."
              emptyMessage="No assets in maintenance"
              persistKey="assets-maintenance"
              logEntityType="asset"
              logFor={(a: Asset) => ({ id: a.id, label: a.assetName })}
              onEdit={(a) => openEditForm(a as Asset)}
              onDelete={(items) => setBulkDeleteAssets({ items: items as Asset[] })}
              bulkActions={[
                {
                  label: 'Mark Available',
                  icon: CheckCircle,
                  variant: 'success',
                  onAction: (items) => { items.forEach((a: Asset) => updateMutation.mutate({ id: a.id, payload: { status: 'available' } })); },
                },
                {
                  label: 'Mark Dismantled',
                  icon: AlertTriangle,
                  variant: 'amber',
                  onAction: (items) => { items.forEach((a: Asset) => updateMutation.mutate({ id: a.id, payload: { status: 'retired' } })); },
                },
              ]}
              columns={[
                {
                  key: 'assetName', header: 'Asset', sortable: true,
                  render: (a: Asset) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                        {React.createElement(assetIcons[a.assetType] || Laptop, { className: 'w-4 h-4 text-white' })}
                      </div>
                      <span className="text-sm font-semibold text-[#0F172A]">{a.assetName}</span>
                    </div>
                  ),
                  sortValue: (a: Asset) => a.assetName,
                },
                { key: 'assetType', header: 'Type', render: (a: Asset) => <span className="text-sm text-[#64748B] capitalize">{a.assetType}</span> },
                { key: 'serialNumber', header: 'Serial No.', render: (a: Asset) => <span className="text-sm text-[#64748B] font-mono">{a.serialNumber}</span> },
                { key: 'companyName', header: 'Company', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.companyName || '-'}</span> },
                { key: 'branchName', header: 'Branch', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.branchName || '-'}</span> },
                { key: 'departmentName', header: 'Department', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.departmentName || '-'}</span> },
                { key: 'value', header: 'Repairing Cost', sortable: true, align: 'right', render: (a: Asset) => <span className="text-sm font-medium text-[#0F172A]">{(a.value || 0).toLocaleString()}</span>, sortValue: (a: Asset) => a.value || 0 },
                { key: 'createdAt', header: 'Repaired Date', sortable: true, render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.createdAt ? formatAppDate(a.createdAt) : '-'}</span>, sortValue: (a: Asset) => a.createdAt || '' },
              ]}
              actions={(a: Asset) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => updateMutation.mutate({ id: a.id, payload: { status: 'available' } })}
                    className="p-2 text-[#10B981] hover:bg-[#10B981]/10 rounded-lg transition-colors" title="Mark Available">
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => updateMutation.mutate({ id: a.id, payload: { status: 'retired' } })}
                    className="p-2 text-[#D97706] hover:bg-[#D97706]/10 rounded-lg transition-colors" title="Mark Dismantled">
                    <AlertTriangle className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEditForm(a)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => deleteWithUndo(a)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {/* ───────────── SCRAP TAB ───────────── */}
      {activeTab === 'scrap' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)]">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={filterCompanyId === 'all' ? 'all' : filterCompanyId}
                  onChange={(val) => { setFilterCompanyId(val.toString()); setFilterBranchId('all'); setFilterDeptId('all'); }}
                  options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterBranchId === 'all' ? 'all' : filterBranchId}
                  onChange={(val) => setFilterBranchId(val.toString())}
                  options={branches.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={filterDeptId === 'all' ? 'all' : filterDeptId}
                  onChange={(val) => setFilterDeptId(val.toString())}
                  options={departments.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <DateRangePicker startDate={startDate} endDate={endDate}
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} placeholder="Filter by Date" />
                {(filterCompanyId !== 'all' || filterBranchId !== 'all' || filterDeptId !== 'all' || startDate || endDate) && (
                  <button onClick={() => { setFilterCompanyId('all'); setFilterBranchId('all'); setFilterDeptId('all'); setStartDate(''); setEndDate(''); }}
                    className="flex items-center gap-2 px-4 py-2.5 text-[var(--danger-red)] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl text-sm font-medium transition-colors">
                    <X className="w-4 h-4" /> Clear
                  </button>
                )}
              </div>
            </div>
            <DataTable
              data={assets.filter((a: Asset) => {
                if (a.status !== 'retired') return false;
                if (filterCompanyId !== 'all' && String(a.companyId || a.company_id) !== filterCompanyId) return false;
                if (filterDeptId !== 'all' && String(a.departmentId || a.department_id) !== filterDeptId) return false;
                if (startDate && (!a.issueDate || a.issueDate < startDate)) return false;
                if (endDate && (!a.issueDate || a.issueDate > endDate)) return false;
                return true;
              })}
              rowKey={(a: Asset) => a.id}
              searchable
              searchKeys={(a: Asset) => `${a.assetName} ${a.assetType} ${a.serialNumber || ''} ${a.companyName || ''} ${a.branchName || ''} ${a.departmentName || ''}`}
              searchPlaceholder="Search scrapped assets..."
              emptyMessage="No scrapped assets"
              persistKey="assets-scrap"
              logEntityType="asset"
              logFor={(a: Asset) => ({ id: a.id, label: a.assetName })}
              onEdit={(a) => openEditForm(a as Asset)}
              onDelete={(items) => setBulkDeleteAssets({ items: items as Asset[] })}
              bulkActions={[
                {
                  label: 'Mark Available',
                  icon: CheckCircle,
                  variant: 'success',
                  onAction: (items) => { items.forEach((a: Asset) => updateMutation.mutate({ id: a.id, payload: { status: 'available' } })); },
                },
              ]}
              columns={[
                {
                  key: 'assetName', header: 'Asset', sortable: true,
                  render: (a: Asset) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                        {React.createElement(assetIcons[a.assetType] || Laptop, { className: 'w-4 h-4 text-white' })}
                      </div>
                      <span className="text-sm font-semibold text-[#0F172A]">{a.assetName}</span>
                    </div>
                  ),
                  sortValue: (a: Asset) => a.assetName,
                },
                { key: 'assetType', header: 'Type', render: (a: Asset) => <span className="text-sm text-[#64748B] capitalize">{a.assetType}</span> },
                { key: 'serialNumber', header: 'Serial No.', render: (a: Asset) => <span className="text-sm text-[#64748B] font-mono">{a.serialNumber}</span> },
                { key: 'companyName', header: 'Company', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.companyName || '-'}</span> },
                { key: 'branchName', header: 'Branch', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.branchName || '-'}</span> },
                { key: 'departmentName', header: 'Department', render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.departmentName || '-'}</span> },
                { key: 'createdAt', header: 'Dismantled Date', sortable: true, render: (a: Asset) => <span className="text-sm text-[#64748B]">{a.createdAt ? formatAppDate(a.createdAt) : '-'}</span>, sortValue: (a: Asset) => a.createdAt || '' },
              ]}
              actions={(a: Asset) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => updateMutation.mutate({ id: a.id, payload: { status: 'available' } })}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#D1FAE5] text-[#065F46] rounded-lg text-xs font-medium hover:bg-[#A7F3D0]">
                    <CheckCircle className="w-3.5 h-3.5" /> Restore
                  </button>
                  <button onClick={() => openEditForm(a)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => deleteWithUndo(a)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            />
          </div>
        </div>
      )}

      <BulkDeleteModal
        isOpen={!!bulkDeleteAssets}
        onClose={() => setBulkDeleteAssets(null)}
        onConfirm={() => {
          if (!bulkDeleteAssets) return;
          bulkDeleteAssets.items.forEach((a: Asset) => deleteWithUndo(a));
          setBulkDeleteAssets(null);
        }}
        count={bulkDeleteAssets?.items.length ?? 0}
        entityType="asset"
        consequences={['Asset records and history will be permanently removed', 'Any depreciation tracking will be lost']}
      />
    </div>
  );
}


