import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ShieldAlert, AlertTriangle, ShieldX, Users, DollarSign, Clock,
  Loader2, RefreshCw, CheckCircle2, XCircle, Eye, Search, X,
  Fingerprint, FileWarning, Ban, ChevronDown, ChevronUp, User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AxiosError } from 'axios';
import * as api from '../services/anomalyApi';
import type { AnomalyAlert } from '../services/anomalyApi';
import { capitalizeStatus } from '../utils/statusUtils';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import { personDisplayName } from '../utils/employeeNameUtils';
import { normalizePickerEmployee } from '../utils/employeePickerUtils';
import StatsCard from '../components/StatsCard';
import SearchableSelect from '../components/SearchableSelect';
import PageHero from '../components/PageHero';
import apiClient from '../services/api';
import { formatAppDate } from '../services/appSettingsService';
import Tooltip from '../components/Tooltip';
import DateRangePicker from '../components/DateRangePicker';
import DataTable from '../components/DataTable';
import PageSkeleton from '../components/skeleton/PageSkeleton';

interface EmployeeLite {
  id: number;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  companyId?: number;
  company_id?: number;
  departmentId?: number;
  department_id?: number;
  branchId?: number;
  branch_id?: number;
  branchIds?: number[];
  branch_ids?: number[];
}

type BuddyPunchPair = {
  employee1: string;
  employee2: string;
  ip: string;
  overlap_minutes: number;
  occurrences: number;
};

type DuplicateBankAccount = {
  account_number: string;
  ifsc: string;
  employees?: string[];
};

type AnomalyEvidence = {
  pairs?: BuddyPunchPair[];
  accounts?: DuplicateBankAccount[];
  drift_percent?: number;
  current_salary?: number;
  median_salary?: number;
  flags?: string[];
  total_ot_hours?: number;
  period?: string;
  change_pct?: number;
  current_net?: number;
  previous_net?: number;
  previous_month?: number;
  previous_year?: number;
  current_month?: number;
  current_year?: number;
  total_overtime_hours?: number;
  daily_max_count?: number;
  consecutive_days?: number;
  month?: number;
  year?: number;
  account_suffix?: string;
  employee_count?: number;
  employee_names?: string[];
  group_size?: number;
  unique_employees?: number;
  time_window_minutes?: number;
  date?: string;
  avg_latitude?: number;
  avg_longitude?: number;
};

const SEVERITY_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  critical: { icon: ShieldX, color: 'text-[var(--danger-red)]', bg: 'bg-[#FEF2F2]', label: 'Critical' },
  high: { icon: AlertTriangle, color: 'text-[#D97706]', bg: 'bg-[#FFFBEB]', label: 'High' },
  medium: { icon: ShieldAlert, color: 'text-[var(--primary-blue)]', bg: 'bg-[#EFF6FF]', label: 'Medium' },
  low: { icon: Eye, color: 'text-[#94A3B8]', bg: 'bg-[#F1F5F9]', label: 'Low' },
};

const TYPE_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  buddy_punching: { icon: Fingerprint, label: 'Buddy Punching' },
  payroll_drift: { icon: DollarSign, label: 'Payroll Drift' },
  overtime_anomaly: { icon: Clock, label: 'OT Anomaly' },
  duplicate_bank: { icon: Ban, label: 'Duplicate Bank' },
  duplicate_payment: { icon: FileWarning, label: 'Duplicate Payment' },
  attendance_discrepancy: { icon: Users, label: 'Attendance Issue' },
};

const FILTER_TABS = [
  { id: '', label: 'All', icon: ShieldAlert },
  { id: 'open', label: 'Open', icon: AlertTriangle },
  { id: 'dismissed', label: 'Dismissed', icon: XCircle },
  { id: 'resolved', label: 'Resolved', icon: CheckCircle2 },
];

export default function AnomalyDetection() {
  const { data: severityOptions = [] } = useMasterData('ANOMALY_SEVERITY');
  const { data: typeOptions = [] } = useMasterData('ANOMALY_TYPE');
  const { data: statusOptions = [] } = useMasterData('ANOMALY_STATUS');
  const { data: pickerEmployees = [] } = useEmployeePicker({ status: 'active' });
  const employees = pickerEmployees.map(normalizePickerEmployee);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ detected: number; new_alerts: number; by_type: Record<string, number> } | null>(null);
  const [dismissTarget, setDismissTarget] = useState<AnomalyAlert | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [evidenceAlert, setEvidenceAlert] = useState<AnomalyAlert | null>(null);
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading, isFetching } = useQuery({
    queryKey: ['anomalies', statusFilter, typeFilter, severityFilter],
    queryFn: () => api.getAnomalies({
      status: statusFilter || undefined,
      anomaly_type: typeFilter || undefined,
      severity: severityFilter || undefined,
      limit: 200,
    }),
    refetchInterval: 30000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['anomaly-stats'],
    queryFn: api.getAnomalyStats,
    refetchInterval: 30000,
  });

  const empMap = new Map(employees.map((e) => [e.id, personDisplayName(e)]));

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-dropdown'],
    queryFn: () => apiClient.get('/companies').then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches-dropdown'],
    queryFn: () => apiClient.get('/branches').then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments-dropdown'],
    queryFn: () => apiClient.get('/departments').then(r => r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  // employee_id → company / branch / department scope
  const empScopeMap = new Map(employees.map((e: EmployeeLite) => [e.id, {
    companyId: e.company_id ?? e.companyId,
    departmentId: e.department_id ?? e.departmentId,
    branchIds: e.branchIds ?? e.branch_ids ?? (e.branch_id != null ? [e.branch_id] : (e.branchId != null ? [e.branchId] : [])),
  }]));

  const dismissMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => api.dismissAnomaly(id, reason),
    onSuccess: () => { toast.success('Alert dismissed'); setDismissTarget(null); setDismissReason(''); queryClient.invalidateQueries({ queryKey: ['anomalies'] }); queryClient.invalidateQueries({ queryKey: ['anomaly-stats'] }); },
    onError: (e: unknown) => toast.error((e as AxiosError<{ detail?: string }>)?.response?.data?.detail || 'Failed'),
  });

  const resolveMutation = useMutation({
    mutationFn: api.resolveAnomaly,
    onSuccess: () => { toast.success('Alert resolved'); queryClient.invalidateQueries({ queryKey: ['anomalies'] }); queryClient.invalidateQueries({ queryKey: ['anomaly-stats'] }); },
    onError: (e: unknown) => toast.error((e as AxiosError<{ detail?: string }>)?.response?.data?.detail || 'Failed'),
  });

  const handleScan = async () => {
    setScanning(true); setScanResult(null);
    try {
      const result = await api.runScan();
      setScanResult(result);
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
      queryClient.invalidateQueries({ queryKey: ['anomaly-stats'] });
      toast.success(`Scan complete: ${result.new_alerts} new alerts from ${result.detected} findings`);
    } catch (e: unknown) {
      toast.error((e as AxiosError<{ detail?: string }>)?.response?.data?.detail || 'Scan failed');
    } finally { setScanning(false); }
  };

  const openByType = stats?.by_type || {};
  const totalOpen = Object.values(openByType).reduce((a, b) => a + b, 0);

  const filteredAlerts = alerts.filter(a => {
    if (companyFilter || branchFilter || deptFilter) {
      const ids = a.employee_ids || [];
      const anyMatch = ids.some((id: number) => {
        const scope = empScopeMap.get(id);
        if (!scope) return false;
        if (companyFilter && String(scope.companyId) !== String(companyFilter)) return false;
        if (branchFilter && !(scope.branchIds || []).includes(Number(branchFilter))) return false;
        if (deptFilter && String(scope.departmentId) !== String(deptFilter)) return false;
        return true;
      });
      if (!anyMatch) return false;
    }
    if (startDate || endDate) {
      const d = a.created_at?.substring(0, 10);
      if (!d) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
    }
    return true;
  });

  const hasActiveFilters = statusFilter || typeFilter || severityFilter || companyFilter || branchFilter || deptFilter || startDate || endDate;

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (alerts.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [alerts, hasLoaded]);

  const isInitialAnomalyLoading = !hasLoaded && isFetching;
  if (isInitialAnomalyLoading) {
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
        {/* Header */}
        <PageHero
          title="Anomaly Detection"
          subtitle="AI-powered detection of buddy punching, payroll drift, overtime abuse, and duplicate bank accounts."
          icon={ShieldAlert}
          accent="rose"
          breadcrumbs={['HRMS.Pro!', 'Anomalies']}
          actions={
            <button onClick={handleScan} disabled={scanning}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="hidden sm:inline">{scanning ? 'Scanning...' : 'Run Scan'}</span>
            </button>
          }
        />

        {/* Scan Result Banner */}
        {scanResult && (
          <div className="bg-[#EFF6FF] border border-[var(--primary-blue)]/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--primary-blue)]/10 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-[var(--primary-blue)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Scan complete</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {scanResult.detected} findings detected, {scanResult.new_alerts} new alerts created
                  {Object.entries(scanResult.by_type).length > 0 && (
                    <> &middot; {Object.entries(scanResult.by_type).map(([t, c]) => `${t}: ${c}`).join(', ')}</>
                  )}
                </p>
              </div>
            </div>
            <button onClick={() => setScanResult(null)} className="text-xs text-[var(--primary-blue)] hover:underline">Dismiss</button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
<StatsCard icon={ShieldAlert} label="Total Open" value={totalOpen} isLoading={statsLoading} iconBg="bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5" iconColor="text-[var(--primary-blue)]" onClick={() => { setStatusFilter('open'); setTypeFilter(''); setSeverityFilter(''); }} />
          <StatsCard icon={Fingerprint} label="Buddy Punching" value={openByType['buddy_punching'] || 0} isLoading={statsLoading} iconBg="bg-gradient-to-br from-[#D97706]/20 via-[#F59E0B]/10 to-[#FBBF24]/5" iconColor="text-[#D97706]" onClick={() => { setStatusFilter('open'); setTypeFilter('buddy_punching'); setSeverityFilter(''); }} />
          <StatsCard icon={DollarSign} label="Payroll Drift" value={openByType['payroll_drift'] || 0} isLoading={statsLoading} iconBg="bg-gradient-to-br from-[#EF4444]/20 via-[#F87171]/10 to-[#FCA5A5]/5" iconColor="text-[var(--danger-red)]" onClick={() => { setStatusFilter('open'); setTypeFilter('payroll_drift'); setSeverityFilter(''); }} />
          <StatsCard icon={ShieldAlert} label="OT + Duplicate" value={(openByType['overtime_anomaly'] || 0) + (openByType['duplicate_bank'] || 0)} isLoading={statsLoading} iconBg="bg-gradient-to-br from-[#7C3AED]/20 via-[#8B5CF6]/10 to-[#A78BFA]/5" iconColor="text-[#7C3AED]" onClick={() => { setStatusFilter('open'); setTypeFilter(''); setSeverityFilter(''); }} />
        </div>

        {/* Tab Pills */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
          <div className="flex flex-col gap-3 px-6 py-4 border-b border-[var(--border-color)] bg-white">
            <div className="flex flex-wrap items-center gap-2">
              <SearchableSelect value={severityFilter === '' ? 'all' : severityFilter} onChange={val => setSeverityFilter(val === 'all' ? '' : val.toString())}
                options={severityOptions.map((t: { code: string; name: string }) => ({ id: t.code, name: t.name }))}
                placeholder="All Severities" allOption="All Severities" className="w-40" />
              <SearchableSelect value={typeFilter === '' ? 'all' : typeFilter} onChange={val => setTypeFilter(val === 'all' ? '' : val.toString())}
                options={typeOptions.map((t: { code: string; name: string }) => ({ id: t.code, name: t.name }))}
                placeholder="All Types" allOption="All Types" className="w-40" />
              <SearchableSelect value={companyFilter === '' ? 'all' : companyFilter} onChange={val => { setCompanyFilter(val === 'all' ? '' : val.toString()); setBranchFilter(''); setDeptFilter(''); }}
                options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                placeholder="All Companies" allOption="All Companies" className="w-40" />
              <SearchableSelect value={branchFilter === '' ? 'all' : branchFilter} onChange={val => setBranchFilter(val === 'all' ? '' : val.toString())}
                options={branches.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name }))}
                placeholder="All Branches" allOption="All Branches" className="w-40" />
              <SearchableSelect value={deptFilter === '' ? 'all' : deptFilter} onChange={val => setDeptFilter(val === 'all' ? '' : val.toString())}
                options={departments.map((d: { id: number; name: string }) => ({ id: d.id, name: d.name }))}
                placeholder="All Departments" allOption="All Departments" className="w-40" />
              <DateRangePicker startDate={startDate} endDate={endDate}
                onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }} placeholder="Filter by Date" />
              {hasActiveFilters && (
                <button
                  onClick={() => { setSearchTerm(''); setStatusFilter(''); setTypeFilter(''); setSeverityFilter(''); setCompanyFilter(''); setBranchFilter(''); setDeptFilter(''); setStartDate(''); setEndDate(''); }}
                  className="flex items-center gap-2 px-4 py-2.5 text-[var(--danger-red)] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl text-sm font-medium transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-1 bg-[var(--background)] rounded-lg p-1 border border-[var(--border-color)] self-start">
              {FILTER_TABS.map(tab => (
                <button key={tab.id} onClick={() => setStatusFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                    statusFilter === tab.id
                      ? 'bg-white text-[var(--text-primary)] shadow-sm border border-[var(--border-color)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="animate-page-enter"><PageSkeleton /></div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-16">
              <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-[#94A3B8]" />
              <p className="text-[var(--text-tertiary)] font-medium">No anomalies detected</p>
              <p className="text-xs text-[#94A3B8] mt-1">Run a scan to check for buddy punching, payroll drift, and more.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DataTable
              data={filteredAlerts}
              rowKey={(a: AnomalyAlert) => a.id}
              searchable
              searchKeys={(a: AnomalyAlert) => `${a.title || ''} ${a.description || ''} ${a.anomaly_type || ''} ${(a.employee_ids || []).map(id => empMap.get(id) || '').join(' ')}`}
              searchPlaceholder="Search anomalies by title, type or employee..."
              exportable
              exportFilename="anomalies"
              emptyMessage="No anomalies detected"
              persistKey="anomalies"
              bulkActions={[
                { label: 'Resolve', icon: CheckCircle2, variant: 'success', onAction: (items) => items.forEach((a: AnomalyAlert) => resolveMutation.mutate(a.id)) },
                { label: 'Dismiss', icon: XCircle, variant: 'amber', onAction: (items) => items.forEach((a: AnomalyAlert) => dismissMutation.mutate({ id: a.id })) },
              ]}
              columns={[
                {
                  key: 'employees', header: 'Employee',
                  render: (a: AnomalyAlert) => {
                    const sev = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.medium;
                    const TypeIcon = TYPE_CONFIG[a.anomaly_type]?.icon || ShieldAlert;
                    const names = (a.employee_ids || []).map((id: number) => empMap.get(id) || `#${id}`).filter(Boolean);
                    return (
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg ${sev.bg} flex items-center justify-center shrink-0`}>
                          <TypeIcon className={`w-4 h-4 ${sev.color}`} />
                        </div>
                        <span className="text-sm font-medium text-[#0F172A]">{names.join(', ') || '—'}</span>
                      </div>
                    );
                  },
                },
                {
                  key: 'title', header: 'Alert', sortable: true,
                  render: (a: AnomalyAlert) => (
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0F172A] truncate">{a.title}</p>
                      {a.description && <p className="text-xs text-[#94A3B8] truncate">{a.description}</p>}
                    </div>
                  ),
                  sortValue: (a: AnomalyAlert) => a.title,
                },
                { key: 'anomaly_type', header: 'Type', render: (a: AnomalyAlert) => <span className="text-sm text-[#64748B]">{TYPE_CONFIG[a.anomaly_type]?.label || a.anomaly_type}</span> },
                {
                  key: 'severity', header: 'Severity',
                  render: (a: AnomalyAlert) => { const s = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.medium; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.color}`}>{s.label}</span>; },
                },
                {
                  key: 'status', header: 'Status',
                  render: (a: AnomalyAlert) => <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.status === 'open' ? 'bg-[#FFFBEB] text-[#D97706]' : a.status === 'dismissed' ? 'bg-[#F1F5F9] text-[var(--text-tertiary)]' : 'bg-[#D1FAE5] text-[#059669]'}`}>{capitalizeStatus(a.status)}</span>,
                },
                { key: 'created_at', header: 'Created', sortable: true, render: (a: AnomalyAlert) => <span className="text-sm text-[#64748B] whitespace-nowrap">{formatAppDate(a.created_at)}</span>, sortValue: (a: AnomalyAlert) => a.created_at },
              ]}
              actions={(a: AnomalyAlert) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => setEvidenceAlert(a)} className="p-2 text-[#7C3AED] hover:bg-[#7C3AED]/10 rounded-lg transition-colors" title="View evidence"><Eye className="w-4 h-4" /></button>
                  {a.status === 'open' && (
                    <>
                      <button onClick={() => resolveMutation.mutate(a.id)} className="p-2 text-[#059669] hover:bg-[#D1FAE5] rounded-lg transition-colors" title="Resolve"><CheckCircle2 className="w-4 h-4" /></button>
                      <button onClick={() => setDismissTarget(a)} className="p-2 text-[var(--text-tertiary)] hover:bg-[var(--background)] rounded-lg transition-colors" title="Dismiss"><XCircle className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              )}
              />
            </div>
          )}
        </div>
      </div>

      {/* Dismiss Reason Drawer */}
      {dismissTarget && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDismissTarget(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[var(--border-color)] px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Dismiss Alert</h2>
              <button onClick={() => setDismissTarget(null)} className="p-2 hover:bg-[var(--background)] rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[var(--background)] rounded-xl p-4 space-y-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{dismissTarget.title}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{dismissTarget.description}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Reason for dismissal</label>
                <textarea value={dismissReason} onChange={e => setDismissReason(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm focus:ring-2 focus:ring-[#1C64F2] outline-none text-[var(--text-primary)]"
                  rows={4} placeholder="Optional: explain why this alert is being dismissed..." />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[var(--border-color)] px-6 py-4 flex gap-3">
              <button onClick={() => { setDismissTarget(null); setDismissReason(''); }}
                className="flex-1 px-4 py-2.5 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-xl text-sm font-medium hover:bg-[#F1F5F9] transition-colors">Cancel</button>
              <button onClick={() => dismissMutation.mutate({ id: dismissTarget.id, reason: dismissReason || undefined })}
                disabled={dismissMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[var(--primary-blue)] text-white rounded-xl text-sm font-medium hover:bg-[#1E40AF] disabled:opacity-50 transition-colors shadow-sm shadow-[#1C64F2]/20">
                {dismissMutation.isPending ? 'Dismissing...' : 'Dismiss'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Evidence Drawer */}
      {evidenceAlert && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setEvidenceAlert(null)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[var(--border-color)] px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Alert Details</h2>
                <p className="text-xs text-[var(--text-tertiary)]">{evidenceAlert.title}</p>
              </div>
              <button onClick={() => setEvidenceAlert(null)} className="p-2 hover:bg-[var(--background)] rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {evidenceAlert.description && <p className="text-sm text-[var(--text-secondary)]">{evidenceAlert.description}</p>}
              <EvidenceViewer data={evidenceAlert.evidence_data as AnomalyEvidence} type={evidenceAlert.anomaly_type} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EvidenceViewer({ data, type }: { data?: AnomalyEvidence; type: string }) {
  if (!data) return null;

  if (type === 'buddy_punching' && Array.isArray(data.pairs)) {
    return (
      <div className="space-y-2">
        {data.pairs.map((pair: BuddyPunchPair, i: number) => (
          <div key={i} className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3 text-xs">
            <p className="font-medium text-[#991B1B]">{pair.employee1} &harr; {pair.employee2}</p>
            <p className="text-[var(--text-tertiary)] mt-0.5">IP: {pair.ip} &middot; {pair.overlap_minutes}min overlap &middot; {pair.occurrences} occurrences</p>
          </div>
        ))}
      </div>
    );
  }

if (type === 'payroll_drift') {
    const drift = data.drift_percent ?? data.change_pct;
    const current = data.current_salary ?? data.current_net;
    const median = data.median_salary ?? data.previous_net;
    if (drift) {
      return (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3 text-xs space-y-1">
          <p><span className="font-medium text-[#92400E]">Drift:</span> <span className="text-[var(--text-primary)]">{drift}% from median</span></p>
          {current !== undefined && <p><span className="font-medium text-[#92400E]">Current:</span> <span className="text-[var(--text-primary)]">{Number(current).toLocaleString()}</span></p>}
          {median !== undefined && <p><span className="font-medium text-[#92400E]">Median:</span> <span className="text-[var(--text-primary)]">{Number(median).toLocaleString()}</span></p>}
          {(data.previous_month || data.current_month) && (
            <p className="text-[var(--text-tertiary)]">{data.previous_month}/{data.previous_year} → {data.current_month}/{data.current_year}</p>
          )}
        </div>
      );
    }
  }

  if (type === 'overtime_anomaly' && (data.flags || data.total_overtime_hours || data.total_ot_hours)) {
    const flags = data.flags || [];
    const total = data.total_ot_hours ?? data.total_overtime_hours;
    const period = data.period || (data.month && data.year ? `${data.month}/${data.year}` : undefined);
    return (
      <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-lg p-3 text-xs space-y-1">
        {flags.length > 0 && flags.map((f: string, i: number) => <p key={i} className="text-[#6D28D9]">&bull; {f}</p>)}
        {total !== undefined && <p className="text-[var(--text-tertiary)] mt-1">Total OT: {total}h{period ? ` in ${period}` : ''}</p>}
        {data.daily_max_count !== undefined && <p className="text-[var(--text-tertiary)]">{data.daily_max_count} days over daily limit</p>}
        {data.consecutive_days !== undefined && <p className="text-[var(--text-tertiary)]">{data.consecutive_days} consecutive days with OT</p>}
      </div>
    );
  }

  if (type === 'attendance_discrepancy' && (data.flags || data.period)) {
    return (
      <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-3 text-xs space-y-1">
        {(data.flags || []).map((f: string, i: number) => <p key={i} className="text-[#1E40AF]">&bull; {f}</p>)}
        {data.period && <p className="text-[var(--text-tertiary)] mt-1">Period: {data.period}</p>}
      </div>
    );
  }

  if (type === 'duplicate_bank' && (data.accounts || data.account_suffix)) {
    if (data.accounts) {
      return (
        <div className="space-y-2">
          {data.accounts?.map((acct: DuplicateBankAccount, i: number) => (
            <div key={i} className="bg-[#D1FAE5] border border-[#A7F3D0] rounded-lg p-3 text-xs">
              <p className="font-medium text-[#065F46]">{acct.account_number}</p>
              <p className="text-[var(--text-tertiary)]">{acct.ifsc} &middot; {acct.employees?.join(', ')}</p>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="bg-[#D1FAE5] border border-[#A7F3D0] rounded-lg p-3 text-xs">
        <p className="font-medium text-[#065F46]">Account ending …{data.account_suffix}</p>
        <p className="text-[var(--text-tertiary)]">Shared by {data.employee_count} employees: {data.employee_names?.join(', ')}</p>
      </div>
    );
  }

  if (type === 'buddy_punching' && !data.pairs) {
    return (
      <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3 text-xs space-y-1">
        {data.date && <p className="text-[var(--text-tertiary)]">Date: {data.date}</p>}
        {data.unique_employees !== undefined && <p className="text-[#991B1B]">{data.unique_employees} unique employees, {data.group_size} check-ins within {data.time_window_minutes}min</p>}
        {(data.avg_latitude !== undefined || data.avg_longitude !== undefined) && (
          <p className="text-[var(--text-tertiary)]">Location: {Number(data.avg_latitude).toFixed(4)}, {Number(data.avg_longitude).toFixed(4)}</p>
        )}
      </div>
    );
  }

  return (
    <pre className="text-xs text-[var(--text-tertiary)] bg-[var(--background)] rounded-lg p-3 overflow-x-auto max-h-48">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function AlertCard({ alert, empMap, onDismiss, onResolve }: { alert: AnomalyAlert; empMap: Map<number, string>; onDismiss: () => void; onResolve: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium;
  const type = TYPE_CONFIG[alert.anomaly_type] || { icon: ShieldAlert, label: alert.anomaly_type };
  const SevIcon = sev.icon;
  const TypeIcon = type.icon;

  const employeeNames = alert.employee_ids?.map(id => empMap.get(id) || `#${id}`).filter(Boolean) || [];

  return (
    <div className={`bg-white rounded-xl border transition-all ${
      alert.status === 'open' ? 'border-[var(--border-color)] hover:shadow-md' :
      alert.status === 'dismissed' ? 'border-[#F1F5F9] opacity-70' :
      'border-[#F1F5F9] opacity-50'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl ${sev.bg} flex items-center justify-center flex-shrink-0`}>
              <TypeIcon className={`w-5 h-5 ${sev.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-[var(--text-primary)] text-sm">{alert.title}</h3>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${sev.bg} ${sev.color}`}>{sev.label}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  alert.status === 'open' ? 'bg-[#FFFBEB] text-[#D97706]' :
                  alert.status === 'dismissed' ? 'bg-[#F1F5F9] text-[var(--text-tertiary)]' : 'bg-[#D1FAE5] text-[#059669]'
                }`}>{capitalizeStatus(alert.status)}</span>
              </div>
              {alert.description && (
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{alert.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[10px] text-[#94A3B8]">
                <span>{formatAppDate(alert.created_at)}</span>
                {employeeNames.length > 0 && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {employeeNames.join(', ')}
                  </span>
                )}
                {alert.dismissed_at && (
                  <span>Dismissed {formatAppDate(alert.dismissed_at)}{alert.dismissed_reason ? `: ${alert.dismissed_reason}` : ''}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {alert.status === 'open' && (
              <>
                <Tooltip id={`btn-resolve-anomaly-${alert.id}`} content="Resolve">
                  <button onClick={onResolve} className="p-1.5 text-[#059669] hover:bg-[#D1FAE5] rounded-lg" title="Resolve"><CheckCircle2 className="w-4 h-4" /></button>
                </Tooltip>
                <Tooltip id={`btn-dismiss-anomaly-${alert.id}`} content="Dismiss">
                  <button onClick={onDismiss} className="p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--background)] rounded-lg" title="Dismiss"><XCircle className="w-4 h-4" /></button>
                </Tooltip>
              </>
            )}
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--background)] rounded-lg">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && alert.evidence_data && (
          <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
            <EvidenceViewer data={alert.evidence_data as AnomalyEvidence} type={alert.anomaly_type} />
          </div>
        )}
      </div>
    </div>
  );
}


