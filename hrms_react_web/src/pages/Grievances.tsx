import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, Plus, Search, X, Edit2, Trash2, Download, Upload,
  Info, Filter, MessageSquare, CheckCircle2, XCircle, Clock, Users
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
import Tooltip from '../components/Tooltip';

type GrievanceRow = {
  id: number;
  subject: string;
  description: string;
  status?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
  employeeName?: string;
};

const GRIEVANCE_TABS = [
  { id: 'all', label: 'All', icon: MessageSquare },
  { id: 'open', label: 'Open', icon: AlertTriangle },
  { id: 'in_progress', label: 'In Progress', icon: Clock },
  { id: 'resolved', label: 'Resolved', icon: CheckCircle2 },
  { id: 'closed', label: 'Closed', icon: XCircle },
];

const STATUS_COLORS: Record<string, string> = {
  open: '#DC2626',
  'in_progress': '#F59E0B',
  resolved: '#10B981',
  closed: '#64748B',
};

const Grievances = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<GrievanceRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GrievanceRow | null>(null);

  const [form, setForm] = useState({
    subject: '',
    description: '',
    status: 'open',
    type: 'grievance',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: grievances = [], isLoading, isFetching } = useQuery({
    queryKey: ['grievances'],
    queryFn: async () => {
      try {
        const response = await api.get('/grievances');
        return response.data || [];
      } catch (error) { throw error; }
    },
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post('/grievances', payload),
    onSuccess: () => {
      toast.success('Grievance submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      setShowModal(false);
      resetForm();
    },
    onError: () => toast.error('Failed to submit grievance'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.put(`/grievances/${id}`, payload),
    onSuccess: () => {
      toast.success('Grievance updated successfully');
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      setShowModal(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error('Failed to update grievance'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/grievances/${id}`),
    onSuccess: () => {
      toast.success('Grievance deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete grievance'),
  });

  const resetForm = () => {
    setForm({ subject: '', description: '', status: 'open', type: 'grievance' });
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
      status: item.status || 'open',
      type: item.type || 'grievance',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    const payload = {
      subject: form.subject.trim(),
      description: form.description.trim(),
      status: form.status,
      type: form.type,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredData = useMemo(() => {
    let items = grievances as GrievanceRow[];
    if (activeTab !== 'all') {
      items = items.filter((item) => item.status === activeTab);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.subject.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          (item.employeeName || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [grievances, activeTab, searchTerm]);

  const columns: DataTableColumn<GrievanceRow>[] = useMemo(() => [
    {
      key: 'subject',
      header: 'Subject',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[row.status || 'open'] || '#64748B' }} />
          <span className="font-medium text-[var(--text-primary)]">{row.subject}</span>
        </div>
      ),
    },
    {
      key: 'employeeName',
      header: 'Employee',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-[var(--text-secondary)]">{row.employeeName || '-'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => {
        const status = row.status || 'open';
        return (
          <span
            className="px-2.5 py-1 text-xs font-medium rounded-full"
            style={{
              backgroundColor: `${STATUS_COLORS[status] || '#64748B'}15`,
              color: STATUS_COLORS[status] || '#64748B',
            }}
          >
            {status.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      key: 'date',
      header: 'Submitted',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-[var(--text-secondary)]">
          {row.createdAt ? formatAppDate(row.createdAt) : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Tooltip id={`edit-grievance-${row.id}`} content="Edit">
            <button
              onClick={() => openEdit(row)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip id={`delete-grievance-${row.id}`} content="Delete">
            <button
              onClick={() => setDeleteTarget(row)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#C81E1E] hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      ),
    },
  ], []);

  const stats = useMemo(() => {
    const total = grievances.length;
    const open = grievances.filter((g) => g.status === 'open').length;
    const inProgress = grievances.filter((g) => g.status === 'in_progress').length;
    const resolved = grievances.filter((g) => g.status === 'resolved').length;
    return [
      { label: 'Total', value: total, color: '#6366F1', bg: '#EEF2FF', icon: MessageSquare },
      { label: 'Open', value: open, color: '#DC2626', bg: '#FEF2F2', icon: AlertTriangle },
      { label: 'In Progress', value: inProgress, color: '#F59E0B', bg: '#FFFBEB', icon: Clock },
      { label: 'Resolved', value: resolved, color: '#10B981', bg: '#ECFDF5', icon: CheckCircle2 },
    ];
  }, [grievances]);

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        title="Grievances"
        subtitle="Track and manage employee grievances"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-md shadow-black/10"
          >
            <Plus className="w-4 h-4" />
            New Grievance
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatsCard
            key={stat.label}
            title={stat.label}
            value={stat.value}
            icon={stat.icon}
            color={stat.color}
            bg={stat.bg}
          />
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm">
        <div className="p-4 border-b border-[var(--border-color)]">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search grievances..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
              />
            </div>
            <div className="flex rounded-xl border border-gray-200 overflow-x-auto">
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

        <DataTable
          columns={columns}
          data={filteredData}
          rowKey={(row) => row.id}
          searchable={false}
          emptyMessage="No grievances found"
          isLoading={isLoading || isFetching}
        />
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); resetForm(); }}
        title={editingItem ? 'Edit Grievance' : 'New Grievance'}
        width="lg"
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
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={formInputClass}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </FormField>
            <FormField label="Type">
              <input
                type="text"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={formInputClass}
                placeholder="Grievance"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditingItem(null); resetForm(); }}
              className="px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
            >
              {(createMutation.isPending || updateMutation.isPending) && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editingItem ? 'Update' : 'Submit'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.subject || 'this grievance'}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
};

export default Grievances;
