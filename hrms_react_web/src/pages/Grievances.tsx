import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Edit2, FileText, Flag,
  MessageSquare, Plus, RotateCcw, Trash2, User, XCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatAppDate } from '../services/appSettingsService';
import PageHero from '../components/PageHero';
import StatsCard from '../components/StatsCard';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import FormField, { formInputClass, formTextareaClass } from '../components/FormField';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import TableSkeleton from '../components/TableSkeleton';
import Tooltip from '../components/Tooltip';
import SearchableSelect from '../components/SearchableSelect';
import DateRangePicker from '../components/DateRangePicker';
import ExportButton from '../components/ExportButton';
import type { Company, Branch, Department } from '../types';

type GrievanceRow = {
  id: number;
  subject: string;
  description: string;
  status?: string;
  type?: string;
  priority?: string;
  employeeId?: number;
  employeeName?: string;
  companyId?: number;
  companyName?: string;
  assignedTo?: number | string;
  assignedToName?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

const GRIEVANCE_TABS = [
  { id: 'all', label: 'All', icon: MessageSquare },
  { id: 'open', label: 'Open', icon: AlertTriangle },
  { id: 'in_progress', label: 'In Progress', icon: Clock },
  { id: 'resolved', label: 'Resolved', icon: CheckCircle2 },
  { id: 'closed', label: 'Closed', icon: XCircle },
];

const TYPE_OPTIONS = [
  { value: 'grievance', label: 'Grievance' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'discrimination', label: 'Discrimination' },
  { value: 'compensation', label: 'Pay & Benefits' },
  { value: 'workload', label: 'Workload' },
  { value: 'environment', label: 'Work Environment' },
  { value: 'policy', label: 'Policy Violation' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const STATUS_COLORS: Record<string, string> = {
  open: '#DC2626',
  in_progress: '#F59E0B',
  resolved: '#10B981',
  closed: '#64748B',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#64748B',
  medium: '#1C64F2',
  high: '#F59E0B',
  urgent: '#DC2626',
};

const SLA_DAYS = 7;

const EMPTY_FORM = {
  subject: '',
  description: '',
  type: 'grievance',
  priority: 'medium',
  status: 'open',
  assignedTo: '',
  resolutionNotes: '',
};

const ticketNo = (id: number) => `#GRV-${String(id).padStart(4, '0')}`;

const daysSince = (iso?: string): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
};

const normalizedStatus = (row: GrievanceRow) => (row.status || 'open').toLowerCase();

const isUnresolved = (row: GrievanceRow) => {
  const s = normalizedStatus(row);
  return s === 'open' || s === 'in_progress';
};

const isOverdue = (row: GrievanceRow) => {
  const age = daysSince(row.createdAt);
  return isUnresolved(row) && age !== null && age > SLA_DAYS;
};

const isHighPriority = (row: GrievanceRow) => {
  const p = (row.priority || '').toLowerCase();
  return p === 'high' || p === 'urgent' || p === 'critical';
};

const pillStyle = (color: string) => ({
  backgroundColor: `${color}15`,
  color,
});

const Grievances = () => {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [filterCompanyId, setFilterCompanyId] = useState<string | number>('all');
  const [filterBranchId, setFilterBranchId] = useState<string | number>('all');
  const [filterDepartmentId, setFilterDepartmentId] = useState<string | number>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<GrievanceRow | null>(null);
  const [detailItem, setDetailItem] = useState<GrievanceRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GrievanceRow | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<GrievanceRow[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const { data: grievances = [], isLoading } = useQuery({
    queryKey: ['grievances'],
    queryFn: async (): Promise<GrievanceRow[]> => {
      const response = await api.get('/grievances');
      return Array.isArray(response.data) ? response.data : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies-dropdown'],
    queryFn: async () => {
      const res = await api.get('/companies', { params: { active_only: true } });
      return (res.data?.items || res.data || []) as Company[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['grievances'] });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post('/grievances', payload),
    onSuccess: () => {
      toast.success('Grievance submitted successfully');
      invalidate();
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error('Failed to submit grievance'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.put(`/grievances/${id}`, payload),
    onSuccess: () => {
      toast.success('Grievance updated successfully');
      invalidate();
      setShowModal(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error('Failed to update grievance'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/grievances/${id}`),
    onSuccess: () => {
      toast.success('Grievance deleted successfully');
      invalidate();
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete grievance'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => api.delete(`/grievances/${id}`)));
    },
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} grievance${ids.length === 1 ? '' : 's'} deleted successfully`);
      invalidate();
      setBulkDeleteTargets([]);
    },
    onError: () => toast.error('Failed to delete selected grievances'),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(ids.map((id) => api.put(`/grievances/${id}`, { status })));
    },
    onSuccess: (_data, { ids, status }) => {
      toast.success(`${ids.length} grievance${ids.length === 1 ? '' : 's'} marked as ${status.replace('_', ' ')}`);
      invalidate();
    },
    onError: () => toast.error('Failed to update selected grievances'),
  });

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingItem(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item: GrievanceRow) => {
    setEditingItem(item);
    setForm({
      subject: item.subject || '',
      description: item.description || '',
      type: item.type || 'grievance',
      priority: item.priority || 'medium',
      status: item.status || 'open',
      assignedTo: item.assignedToName || (item.assignedTo !== undefined ? String(item.assignedTo) : ''),
      resolutionNotes: item.resolutionNotes || '',
    });
    setDetailItem(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    if (editingItem) {
      const payload: Record<string, unknown> = {
        subject: form.subject.trim(),
        description: form.description.trim(),
        type: form.type,
        priority: form.priority,
        status: form.status,
      };
      if (form.assignedTo.trim()) payload.assigned_to = form.assignedTo.trim();
      if (form.resolutionNotes.trim()) payload.resolution_notes = form.resolutionNotes.trim();
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      createMutation.mutate({
        subject: form.subject.trim(),
        description: form.description.trim(),
        type: form.type,
        priority: form.priority,
      });
    }
  };

  const stats = useMemo(() => {
    const list = grievances as GrievanceRow[];
    return {
      total: list.length,
      open: list.filter((g) => normalizedStatus(g) === 'open').length,
      high: list.filter(isHighPriority).length,
      overdue: list.filter(isOverdue).length,
      resolved: list.filter((g) => normalizedStatus(g) === 'resolved').length,
    };
  }, [grievances]);

  const statCards = [
    {
      label: 'Total Grievances',
      value: stats.total,
      icon: MessageSquare,
      iconBg: 'bg-gradient-to-br from-[#6366F1]/20 via-[#818CF8]/10 to-[#A5B4FC]/5',
      iconColor: 'text-[#4F46E5]',
      onClick: () => {
        setActiveTab('all');
        setPriorityFilter('all');
        setOverdueOnly(false);
      },
    },
    {
      label: 'Open',
      value: stats.open,
      icon: AlertTriangle,
      iconBg: 'bg-gradient-to-br from-[#DC2626]/20 via-[#F87171]/10 to-[#FCA5A5]/5',
      iconColor: 'text-[#DC2626]',
      onClick: () => {
        setActiveTab('open');
        setPriorityFilter('all');
        setOverdueOnly(false);
      },
    },
    {
      label: 'High Priority',
      value: stats.high,
      icon: Flag,
      iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5',
      iconColor: 'text-[#D97706]',
      onClick: () => {
        setActiveTab('all');
        setPriorityFilter('high');
        setOverdueOnly(false);
      },
    },
    {
      label: 'Overdue (> 7 days)',
      value: stats.overdue,
      icon: Clock,
      iconBg: 'bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5',
      iconColor: 'text-[#7C3AED]',
      onClick: () => {
        setActiveTab('all');
        setPriorityFilter('all');
        setOverdueOnly(true);
      },
    },
    {
      label: 'Resolved',
      value: stats.resolved,
      icon: CheckCircle2,
      iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5',
      iconColor: 'text-[#059669]',
      onClick: () => {
        setActiveTab('resolved');
        setPriorityFilter('all');
        setOverdueOnly(false);
      },
    },
  ];

  const filteredData = useMemo(() => {
    let items = grievances as GrievanceRow[];
    if (activeTab !== 'all') {
      items = items.filter((item) => normalizedStatus(item) === activeTab);
    }
    if (priorityFilter === 'high') {
      items = items.filter(isHighPriority);
    } else if (priorityFilter !== 'all') {
      items = items.filter((item) => (item.priority || '').toLowerCase() === priorityFilter);
    }
    if (overdueOnly) {
      items = items.filter(isOverdue);
    }
    if (startDate || endDate) {
      items = items.filter((item) => {
        const created = item.createdAt ? item.createdAt.split('T')[0] : '';
        if (!created) return false;
        if (startDate && created < startDate) return false;
        if (endDate && created > endDate) return false;
        return true;
      });
    }
    if (filterCompanyId !== 'all') {
      items = items.filter((item) => String(item.companyId) === String(filterCompanyId));
    }
    return items;
  }, [grievances, activeTab, priorityFilter, overdueOnly, startDate, endDate, filterCompanyId]);

  const hasActiveFilters =
    priorityFilter !== 'all' || overdueOnly || activeTab !== 'all' || startDate !== '' || endDate !== '' || filterCompanyId !== 'all';

  const clearFilters = () => {
    setPriorityFilter('all');
    setOverdueOnly(false);
    setActiveTab('all');
    setStartDate('');
    setEndDate('');
    setFilterCompanyId('all');
  };

  const columns: DataTableColumn<GrievanceRow>[] = [
    {
      key: 'employeeName',
      header: 'Employee',
      sortable: true,
      sortValue: (row) => row.employeeName || '',
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-[#0F172A] truncate">{row.employeeName || '-'}</div>
            {row.assignedToName && (
              <div className="text-xs text-[#94A3B8] truncate">→ {row.assignedToName}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'ticketId',
      header: 'Ticket ID',
      sortable: true,
      sortValue: (row) => ticketNo(row.id),
      render: (row) => (
        <span className="text-sm text-[#64748B] font-mono">{ticketNo(row.id)}</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      sortable: true,
      sortValue: (row) => row.subject,
      render: (row) => (
        <button
          type="button"
          onClick={() => setDetailItem(row)}
          className="font-medium text-[var(--text-primary)] text-sm truncate hover:text-[var(--primary-blue)] transition-colors text-left"
        >
          {row.subject}
        </button>
      ),
    },
    {
      key: 'companyName',
      header: 'Company',
      sortable: true,
      sortValue: (row) => row.companyName || '',
      render: (row) => (
        <span className="text-sm text-[#64748B]">{row.companyName || '-'}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span className="text-sm text-[#64748B] truncate max-w-xs block">{row.description || '-'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Submit Date',
      sortable: true,
      sortValue: (row) => row.createdAt || '',
      render: (row) => (
        <span className="text-sm text-[#64748B] whitespace-nowrap">{row.createdAt ? formatAppDate(row.createdAt) : '-'}</span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      sortValue: (row) => row.priority || '',
      render: (row) => {
        const p = (row.priority || 'medium').toLowerCase();
        return (
          <span
            className="px-2.5 py-1 text-xs font-medium rounded-full capitalize whitespace-nowrap"
            style={pillStyle(PRIORITY_COLORS[p] || '#64748B')}
          >
            {p}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (row) => normalizedStatus(row),
      render: (row) => {
        const s = normalizedStatus(row);
        return (
          <span
            className="px-2.5 py-1 text-xs font-medium rounded-full capitalize whitespace-nowrap"
            style={pillStyle(STATUS_COLORS[s] || '#64748B')}
          >
            {s.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      key: 'age',
      header: 'Age / SLA',
      sortable: true,
      sortValue: (row) => daysSince(row.createdAt) ?? -1,
      render: (row) => {
        const age = daysSince(row.createdAt);
        if (age === null) return <span className="text-sm text-[#64748B]">-</span>;
        const breached = isOverdue(row);
        return (
          <div className="whitespace-nowrap">
            <span className={`text-sm font-semibold ${breached ? 'text-[#DC2626]' : 'text-[var(--text-primary)]'}`}>
              {age}d
            </span>
            <span className={`ml-1.5 text-[11px] font-medium ${breached ? 'text-[#DC2626]' : 'text-[#94A3B8]'}`}>
              {breached ? '· overdue' : isUnresolved(row) ? '· open' : '· closed'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortable: true,
      sortValue: (row) => row.updatedAt || '',
      render: (row) => (
        <span className="text-sm text-[#64748B] whitespace-nowrap">
          {row.updatedAt ? formatAppDate(row.updatedAt) : '-'}
        </span>
      ),
    },
  ];

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHero
        title="Grievances"
        subtitle="Track and manage employee grievances"
        icon={MessageSquare}
        accent="amber"
        breadcrumbs={['Home', 'Grievances']}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton rows={filteredData} filename="grievances_export.csv" label="Export" />
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl font-semibold text-sm shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              New Grievance
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat, i) => (
          <div key={stat.label} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 60}ms` }}>
            <StatsCard
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              iconBg={stat.iconBg}
              iconColor={stat.iconColor}
              isLoading={isLoading}
              onClick={stat.onClick}
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-color)]">
          <div className="flex flex-col lg:flex-row items-center gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SearchableSelect
                value={filterCompanyId}
                onChange={(val) => setFilterCompanyId(val)}
                options={companies.map((c) => ({ id: c.id, name: c.name }))}
                placeholder="All Companies"
                allOption="All Companies"
                className="w-44"
              />
              <SearchableSelect
                value={priorityFilter}
                onChange={(val) => setPriorityFilter(val.toString())}
                options={PRIORITY_OPTIONS.map((o) => ({ id: o.value, name: o.label }))}
                placeholder="All Priorities"
                allOption="All Priorities"
                className="w-44"
              />
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }}
                placeholder="Filter by date"
              />
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors"
                  title="Clear filters"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit max-w-full lg:ml-auto">
              {GRIEVANCE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-[var(--primary-blue)] text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden">
          <div className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
            <DataTable
              columns={columns}
              data={filteredData}
              rowKey={(row) => row.id}
              searchable
              searchKeys={(row: GrievanceRow) => `${row.subject} ${row.description || ''} ${row.employeeName || ''} ${row.assignedToName || ''} ${ticketNo(row.id)}`}
              searchPlaceholder="Search subject, description, employee, ticket no..."
              emptyMessage="No grievances found"
              persistKey="grievances"
              exportFilename="grievances_export.csv"
              logEntityType="grievance"
              logFor={(row) => ({ id: row.id, label: row.subject })}
              onRowClick={(row) => setDetailItem(row)}
              onEdit={(row) => openEdit(row)}
              onDelete={(rows) => {
                const list = rows as GrievanceRow[];
                if (list.length === 1) setDeleteTarget(list[0]);
                else if (list.length > 1) setBulkDeleteTargets(list);
              }}
              bulkActions={[
                {
                  label: 'Mark Resolved',
                  icon: CheckCircle2,
                  variant: 'success',
                  disabled: (selected) =>
                    (selected as GrievanceRow[]).every((r) => ['resolved', 'closed'].includes(normalizedStatus(r))),
                  disabledTitle: 'Selected grievances are already resolved or closed',
                  onAction: (selected) =>
                    bulkStatusMutation.mutate({
                      ids: (selected as GrievanceRow[]).map((r) => r.id),
                      status: 'resolved',
                    }),
                },
                {
                  label: 'Close',
                  icon: XCircle,
                  variant: 'ghost',
                  disabled: (selected) =>
                    (selected as GrievanceRow[]).every((r) => normalizedStatus(r) === 'closed'),
                  disabledTitle: 'Selected grievances are already closed',
                  onAction: (selected) =>
                    bulkStatusMutation.mutate({
                      ids: (selected as GrievanceRow[]).map((r) => r.id),
                      status: 'closed',
                    }),
                },
              ]}
              actions={(row) => (
                <div className="flex items-center justify-end gap-1.5">
                  <Tooltip id={`btn-view-grievance-${row.id}`} content="View details">
                    <button
                      onClick={() => setDetailItem(row)}
                      className="p-2 text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 rounded-lg transition-colors"
                      title="View details"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip id={`btn-edit-grievance-${row.id}`} content="Edit">
                    <button
                      onClick={() => openEdit(row)}
                      className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip id={`btn-delete-grievance-${row.id}`} content="Delete">
                    <button
                      onClick={() => setDeleteTarget(row)}
                      className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
              )}
            />
          )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingItem ? `Edit Grievance ${ticketNo(editingItem.id)}` : 'New Grievance'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Subject" required>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={formInputClass}
              placeholder="Enter grievance subject"
            />
          </FormField>
          <FormField label="Description" required>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={formTextareaClass}
              rows={4}
              placeholder="Describe the grievance in detail"
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={formInputClass}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Priority">
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={formInputClass}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {editingItem && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className={formInputClass}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Assigned To" help="Name or ID of the person handling this grievance">
                  <input
                    type="text"
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                    className={formInputClass}
                    placeholder="e.g. HR Manager"
                  />
                </FormField>
              </div>
              {editingItem.resolutionNotes && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                    Existing resolution notes (read-only)
                  </p>
                  <p className="text-sm text-emerald-900 whitespace-pre-wrap">{editingItem.resolutionNotes}</p>
                </div>
              )}
              <FormField label="Resolution Notes" help="How the grievance was resolved">
                <textarea
                  value={form.resolutionNotes}
                  onChange={(e) => setForm({ ...form, resolutionNotes: e.target.value })}
                  className={formTextareaClass}
                  rows={3}
                  placeholder="Enter resolution notes"
                />
              </FormField>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {editingItem ? 'Update' : 'Submit'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!detailItem}
        onClose={() => setDetailItem(null)}
        title={detailItem ? `Grievance ${ticketNo(detailItem.id)}` : 'Grievance Details'}
        size="lg"
      >
        {detailItem && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="px-2.5 py-1 text-xs font-medium rounded-full capitalize"
                style={pillStyle(STATUS_COLORS[normalizedStatus(detailItem)] || '#64748B')}
              >
                {normalizedStatus(detailItem).replace('_', ' ')}
              </span>
              <span
                className="px-2.5 py-1 text-xs font-medium rounded-full capitalize"
                style={pillStyle(PRIORITY_COLORS[(detailItem.priority || 'medium').toLowerCase()] || '#64748B')}
              >
                {(detailItem.priority || 'medium')} priority
              </span>
              {detailItem.type && (
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 capitalize">
                  {detailItem.type}
                </span>
              )}
            </div>

            <div>
              <h4 className="text-lg font-bold text-[var(--text-primary)]">{detailItem.subject}</h4>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Raised by {detailItem.employeeName || 'Unknown'}
                {detailItem.assignedToName ? ` · Assigned to ${detailItem.assignedToName}` : ' · Unassigned'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                Description
              </p>
              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                {detailItem.description || '-'}
              </p>
            </div>

            {detailItem.resolutionNotes && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">
                  Resolution notes
                </p>
                <p className="text-sm text-emerald-900 whitespace-pre-wrap">{detailItem.resolutionNotes}</p>
              </div>
            )}

            <div className="rounded-xl border border-[var(--border-color)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                Timeline
              </p>
              <div className="space-y-2.5">
                {[
                  { label: 'Created', value: detailItem.createdAt },
                  { label: 'Last updated', value: detailItem.updatedAt },
                  { label: 'Resolved', value: detailItem.resolvedAt },
                ].map((t) => (
                  <div key={t.label} className="flex items-center gap-3 text-sm">
                    <span className="w-2 h-2 rounded-full bg-[var(--primary-blue)] shrink-0" />
                    <span className="text-[var(--text-tertiary)] w-24 shrink-0">{t.label}</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {t.value ? formatAppDate(t.value) : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => openEdit(detailItem)}
                className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget ? `${ticketNo(deleteTarget.id)} — ${deleteTarget.subject}` : 'this grievance'}
        isDeleting={deleteMutation.isPending}
      />

      <ConfirmDeleteModal
        isOpen={bulkDeleteTargets.length > 0}
        onClose={() => setBulkDeleteTargets([])}
        onConfirm={() => bulkDeleteTargets.length > 0 && bulkDeleteMutation.mutate(bulkDeleteTargets.map((r) => r.id))}
        itemName={`${bulkDeleteTargets.length} grievance${bulkDeleteTargets.length === 1 ? '' : 's'}`}
        isDeleting={bulkDeleteMutation.isPending}
      />
    </div>
  );
};

export default Grievances;
