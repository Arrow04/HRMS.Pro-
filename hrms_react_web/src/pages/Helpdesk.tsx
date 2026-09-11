import { useState, useEffect, useMemo } from 'react';
import {
  Headset, Plus, Search, Eye, Edit2, Trash2,
  MessageSquare, CheckCircle2, Clock, PauseCircle, AlertTriangle, XCircle
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
import ExportButton from '../components/ExportButton';

type TicketRow = {
  id: number;
  ticket_no?: string;
  subject: string;
  description?: string;
  category?: 'it' | 'hr' | 'facility' | 'admin' | 'general' | string;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | string;
  status?: 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | string;
  employeeId?: number;
  employeeName?: string;
  assignedTo?: number | null;
  assignedToName?: string | null;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const TICKET_TABS = [
  { id: 'all', label: 'All', icon: MessageSquare },
  { id: 'open', label: 'Open', icon: AlertTriangle },
  { id: 'in_progress', label: 'In Progress', icon: Clock },
  { id: 'on_hold', label: 'On Hold', icon: PauseCircle },
  { id: 'resolved', label: 'Resolved', icon: CheckCircle2 },
  { id: 'closed', label: 'Closed', icon: XCircle },
];

const STATUS_COLORS: Record<string, string> = {
  open: '#DC2626',
  in_progress: '#F59E0B',
  on_hold: '#8B5CF6',
  resolved: '#10B981',
  closed: '#64748B',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#64748B',
  medium: '#3B82F6',
  high: '#F59E0B',
  urgent: '#DC2626',
};

const CATEGORIES = ['general', 'it', 'hr', 'facility', 'admin'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];

const CLOSED_STATUSES = ['resolved', 'closed'];
const OPEN_STATUSES = ['open', 'in_progress', 'on_hold'];

const ageInDays = (from?: string | null, to?: string | null): number | null => {
  if (!from) return null;
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
};

const slaLimitDays = (priority?: string): number => {
  if (priority === 'urgent') return 1;
  if (priority === 'high') return 3;
  return 7;
};

const formatStatus = (status?: string): string =>
  (status || 'open').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const Helpdesk = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<TicketRow | null>(null);
  const [detailItem, setDetailItem] = useState<TicketRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TicketRow | null>(null);

  const [form, setForm] = useState({
    subject: '',
    description: '',
    category: 'general',
    priority: 'medium',
    status: 'open',
    resolution_notes: '',
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['helpdesk-tickets'],
    queryFn: async (): Promise<TicketRow[]> => {
      const response = await api.get('/helpdesk/tickets');
      const payload = response.data;
      if (Array.isArray(payload)) return payload as TicketRow[];
      if (payload && Array.isArray(payload.data)) return payload.data as TicketRow[];
      if (payload && Array.isArray(payload.items)) return payload.items as TicketRow[];
      return [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets'] });

  const getErrorMessage = (err: unknown, fallback: string): string => {
    const msg = (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;
    if (typeof msg?.detail === 'string') return msg.detail;
    if (typeof msg?.message === 'string') return msg.message;
    return fallback;
  };

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post('/helpdesk/tickets', payload),
    onSuccess: (res) => {
      const ticketNo = (res.data as { ticket_no?: string } | undefined)?.ticket_no;
      toast.success(ticketNo ? `Ticket ${ticketNo} raised successfully` : 'Ticket raised successfully');
      invalidate();
      setShowModal(false);
      resetForm();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to raise ticket')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.put(`/helpdesk/tickets/${id}`, payload),
    onSuccess: () => {
      toast.success('Ticket updated successfully');
      invalidate();
      setShowModal(false);
      setEditingItem(null);
      resetForm();
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, 'Failed to update ticket')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/helpdesk/tickets/${id}`),
    onSuccess: () => {
      toast.success('Ticket deleted successfully');
      invalidate();
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete ticket'),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.put(`/helpdesk/tickets/${id}`, { status }))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} of ${ids.length} tickets failed to update`);
      return ids.length;
    },
    onSuccess: (count, { status }) => {
      toast.success(`${count} ticket${count !== 1 ? 's' : ''} marked as ${formatStatus(status)}`);
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Bulk update failed'),
  });

  const resetForm = () => {
    setForm({ subject: '', description: '', category: 'general', priority: 'medium', status: 'open', resolution_notes: '' });
    setEditingItem(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item: TicketRow) => {
    setEditingItem(item);
    setForm({
      subject: item.subject || '',
      description: item.description || '',
      category: item.category || 'general',
      priority: item.priority || 'medium',
      status: item.status || 'open',
      resolution_notes: item.resolutionNotes || '',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    const payload: Record<string, unknown> = {
      subject: form.subject.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
    };
    if (editingItem) {
      payload.status = form.status;
      if (form.resolution_notes.trim()) payload.resolution_notes = form.resolution_notes.trim();
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isResolving = editingItem !== null && CLOSED_STATUSES.includes(form.status);

  const filteredData = useMemo(() => {
    let items = tickets as TicketRow[];
    if (activeTab !== 'all') {
      items = items.filter((item) => item.status === activeTab);
    }
    if (categoryFilter !== 'all') {
      items = items.filter((item) => (item.category || 'general') === categoryFilter);
    }
    if (priorityFilter !== 'all') {
      items = items.filter((item) => (item.priority || 'medium') === priorityFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.subject.toLowerCase().includes(q) ||
          (item.ticket_no || '').toLowerCase().includes(q) ||
          (item.employeeName || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [tickets, activeTab, categoryFilter, priorityFilter, searchTerm]);

  const stats = useMemo(() => {
    const list = tickets as TicketRow[];
    const isActive = (t: TicketRow) => OPEN_STATUSES.includes(t.status || 'open');
    const open = list.filter((t) => t.status === 'open').length;
    const urgent = list.filter(
      (t) => (t.priority || '') === 'urgent' && !CLOSED_STATUSES.includes(t.status || 'open')
    ).length;
    const overdue = list.filter((t) => {
      if (!isActive(t)) return false;
      const age = ageInDays(t.createdAt);
      return age !== null && age > 3;
    }).length;
    const resolved = list.filter((t) => t.status === 'resolved').length;
    return [
      { label: 'Total Tickets', value: list.length, iconBg: 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5', iconColor: 'text-[var(--primary-blue)]', icon: Headset, tab: 'all' },
      { label: 'Open', value: open, iconBg: 'bg-gradient-to-br from-[#DC2626]/20 via-[#F87171]/10 to-[#FCA5A5]/5', iconColor: 'text-[#DC2626]', icon: MessageSquare, tab: 'open' },
      { label: 'Urgent', value: urgent, iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5', iconColor: 'text-[#D97706]', icon: AlertTriangle, tab: 'all' },
      { label: 'Overdue (3d+)', value: overdue, iconBg: 'bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5', iconColor: 'text-[#7C3AED]', icon: Clock, tab: 'all' },
      { label: 'Resolved', value: resolved, iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5', iconColor: 'text-[#059669]', icon: CheckCircle2, tab: 'resolved' },
    ];
  }, [tickets]);

  const columns: DataTableColumn<TicketRow>[] = useMemo(() => [
    {
      key: 'subject',
      header: 'Ticket',
      sortable: true,
      sortValue: (row) => row.ticket_no || row.subject,
      render: (row) => (
        <button type="button" onClick={() => setDetailItem(row)} className="flex items-center gap-2 text-left min-w-0 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
            <Headset className="w-4 h-4 text-white" />
          </div>
          <span className="min-w-0">
            <span className="font-semibold text-[var(--text-primary)] text-sm block truncate group-hover:text-[var(--primary-blue)]">
              {row.subject}
            </span>
            <span className="text-xs text-gray-400">{row.ticket_no || `#${row.id}`}</span>
          </span>
        </button>
      ),
    },
    {
      key: 'employeeName',
      header: 'Raised By',
      sortable: true,
      sortValue: (row) => row.employeeName || '',
      render: (row) => (
        <span className="text-sm text-[#64748B]">{row.employeeName || '-'}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      sortValue: (row) => row.category || 'general',
      render: (row) => (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize">
          {row.category || 'general'}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      sortValue: (row) => row.priority || 'medium',
      render: (row) => {
        const priority = row.priority || 'medium';
        return (
          <span
            className="px-2.5 py-1 text-xs font-semibold rounded-full capitalize"
            style={{
              backgroundColor: `${PRIORITY_COLORS[priority] || '#64748B'}15`,
              color: PRIORITY_COLORS[priority] || '#64748B',
            }}
          >
            {priority}
          </span>
        );
      },
    },
    {
      key: 'assignedToName',
      header: 'Assignee',
      sortable: true,
      sortValue: (row) => row.assignedToName || '',
      render: (row) => (
        row.assignedToName
          ? <span className="text-sm text-[var(--text-primary)]">{row.assignedToName}</span>
          : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Unassigned</span>
      ),
    },
    {
      key: 'age',
      header: 'Age / SLA',
      sortable: true,
      sortValue: (row) => ageInDays(row.createdAt) ?? -1,
      render: (row) => {
        const closed = CLOSED_STATUSES.includes(row.status || 'open');
        const age = closed
          ? ageInDays(row.createdAt, row.resolvedAt || row.updatedAt)
          : ageInDays(row.createdAt);
        if (age === null) return <span className="text-sm text-gray-400">-</span>;
        const limit = slaLimitDays(row.priority);
        const breached = !closed && age > limit;
        return (
          <span className="inline-flex flex-col">
            <span className={`text-sm font-semibold ${breached ? 'text-[#DC2626]' : closed ? 'text-[#64748B]' : 'text-[var(--text-primary)]'}`}>
              {age}d{closed ? ' to close' : ' open'}
            </span>
            {!closed && (
              <span className={`text-[11px] ${breached ? 'text-[#DC2626] font-medium' : 'text-gray-400'}`}>
                {breached ? `SLA breached (>${limit}d)` : `SLA ${limit}d`}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (row) => row.status || 'open',
      render: (row) => {
        const status = row.status || 'open';
        return (
          <span
            className="px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap"
            style={{
              backgroundColor: `${STATUS_COLORS[status] || '#64748B'}15`,
              color: STATUS_COLORS[status] || '#64748B',
            }}
          >
            {formatStatus(status)}
          </span>
        );
      },
    },
  ], []);

  if (!mounted) return <PageSkeleton />;

  const hasActiveFilters = categoryFilter !== 'all' || priorityFilter !== 'all' || searchTerm.trim() !== '';

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHero
        title="Helpdesk"
        subtitle="IT, HR and facility support tickets in one queue"
        icon={Headset}
        accent="cyan"
        breadcrumbs={['Home', 'Helpdesk']}
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl font-semibold text-sm shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" />
            Raise Ticket
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <div key={stat.label} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 60}ms` }}>
            <StatsCard
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              iconBg={stat.iconBg}
              iconColor={stat.iconColor}
              isLoading={isLoading}
              onClick={() => setActiveTab(stat.tab)}
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm">
        <div className="p-4 border-b border-[var(--border-color)] space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by subject, ticket no. or employee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                aria-label="Filter by priority"
              >
                <option value="all">All Priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
              <ExportButton rows={filteredData} filename="helpdesk_tickets.csv" variant="toolbar" />
            </div>
          </div>
          <div className="flex rounded-xl border border-gray-200 overflow-x-auto w-fit max-w-full">
            {TICKET_TABS.map((tab) => (
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

        <div className="bg-white overflow-hidden">
          <div className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : (
            <DataTable
              columns={columns}
              data={filteredData}
              rowKey={(row) => row.id}
              searchable={false}
              emptyMessage={hasActiveFilters ? 'No tickets match your filters' : 'No tickets found'}
              persistKey="helpdesk"
              exportFilename="helpdesk_tickets.csv"
              logEntityType="helpdesk_ticket"
              logFor={(row) => ({ id: row.id, label: row.ticket_no || row.subject })}
              onRowClick={(row) => setDetailItem(row)}
              bulkActions={[
                {
                  label: 'Mark Resolved',
                  icon: CheckCircle2,
                  variant: 'success',
                  disabled: (selected) => selected.length === 0 || bulkStatusMutation.isPending,
                  onAction: (selected) => bulkStatusMutation.mutate({
                    ids: selected.map((t) => t.id),
                    status: 'resolved',
                  }),
                },
                {
                  label: 'Close',
                  icon: XCircle,
                  variant: 'ghost',
                  disabled: (selected) => selected.length === 0 || bulkStatusMutation.isPending,
                  onAction: (selected) => bulkStatusMutation.mutate({
                    ids: selected.map((t) => t.id),
                    status: 'closed',
                  }),
                },
              ]}
              actions={(row) => (
                <div className="flex items-center justify-end gap-1.5">
                  <Tooltip id={`btn-view-ticket-${row.id}`} content="View details">
                    <button
                      onClick={() => setDetailItem(row)}
                      className="p-2 text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip id={`btn-edit-ticket-${row.id}`} content="Edit">
                    <button
                      onClick={() => openEdit(row)}
                      className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip id={`btn-delete-ticket-${row.id}`} content="Delete">
                    <button
                      onClick={() => setDeleteTarget(row)}
                      className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"
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
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingItem ? `Edit ${editingItem.ticket_no || 'Ticket'}` : 'Raise Ticket'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Subject" required>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={formInputClass}
              placeholder="e.g. Laptop not booting"
            />
          </FormField>
          <FormField label="Description" required>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={formTextareaClass}
              rows={4}
              placeholder="Describe the issue in detail"
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Category">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={formInputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c.toUpperCase()}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Priority">
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={formInputClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </FormField>
          </div>
          {editingItem && (
            <FormField label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={formInputClass}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{formatStatus(s)}</option>
                ))}
              </select>
            </FormField>
          )}
          {editingItem && !isResolving && (
            <FormField label="Resolution Notes" help="Optional — filled when the ticket is resolved">
              <input
                type="text"
                value={form.resolution_notes}
                onChange={(e) => setForm({ ...form, resolution_notes: e.target.value })}
                className={formInputClass}
                placeholder="How was it resolved?"
              />
            </FormField>
          )}
          {isResolving && (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
              <FormField label="Resolution Notes" required help="Describe how this ticket was resolved">
                <textarea
                  value={form.resolution_notes}
                  onChange={(e) => setForm({ ...form, resolution_notes: e.target.value })}
                  className={formTextareaClass}
                  rows={4}
                  placeholder="e.g. Replaced faulty SSD and restored user data from backup"
                />
              </FormField>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowModal(false); resetForm(); }}
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
        title={detailItem ? `${detailItem.ticket_no || `Ticket #${detailItem.id}`} — ${detailItem.subject}` : 'Ticket Details'}
        size="lg"
      >
        {detailItem && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="px-2.5 py-1 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: `${STATUS_COLORS[detailItem.status || 'open'] || '#64748B'}15`,
                  color: STATUS_COLORS[detailItem.status || 'open'] || '#64748B',
                }}
              >
                {formatStatus(detailItem.status)}
              </span>
              <span
                className="px-2.5 py-1 text-xs font-semibold rounded-full capitalize"
                style={{
                  backgroundColor: `${PRIORITY_COLORS[detailItem.priority || 'medium'] || '#64748B'}15`,
                  color: PRIORITY_COLORS[detailItem.priority || 'medium'] || '#64748B',
                }}
              >
                {(detailItem.priority || 'medium')} priority
              </span>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize">
                {detailItem.category || 'general'}
              </span>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Description</p>
              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap bg-gray-50 rounded-xl p-4 border border-gray-100">
                {detailItem.description || 'No description provided.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Raised By</p>
                <p className="text-[var(--text-primary)] font-medium">{detailItem.employeeName || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Assignee</p>
                <p className="text-[var(--text-primary)] font-medium">{detailItem.assignedToName || 'Unassigned'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Timeline</p>
              <div className="space-y-2 border-l-2 border-gray-100 pl-4">
                <div className="text-sm">
                  <span className="font-medium text-[var(--text-primary)]">Raised</span>
                  <span className="text-gray-500"> — {detailItem.createdAt ? formatAppDate(detailItem.createdAt) : '-'}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-[var(--text-primary)]">Last updated</span>
                  <span className="text-gray-500"> — {detailItem.updatedAt ? formatAppDate(detailItem.updatedAt) : '-'}</span>
                </div>
                {detailItem.resolvedAt && (
                  <div className="text-sm">
                    <span className="font-medium text-emerald-600">Resolved</span>
                    <span className="text-gray-500"> — {formatAppDate(detailItem.resolvedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {detailItem.resolutionNotes && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">Resolution Notes</p>
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{detailItem.resolutionNotes}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { const t = detailItem; setDetailItem(null); openEdit(t); }}
                className="px-4 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Edit Ticket
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.ticket_no || deleteTarget?.subject || 'this ticket'}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
};

export default Helpdesk;
