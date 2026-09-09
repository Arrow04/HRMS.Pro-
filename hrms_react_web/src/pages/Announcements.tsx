import { useState, useEffect, useMemo } from 'react';
import {
  Megaphone, Plus, Search, X, Edit2, Trash2, Download, Upload,
  Info, Filter, Calendar, FileText, Users
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

type AnnouncementRow = {
  id: number;
  title: string;
  body: string;
  type?: string;
  category?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
  isRead?: boolean;
};

const ANNOUNCEMENT_TABS = [
  { id: 'all', label: 'All', icon: FileText },
  { id: 'notice', label: 'Notices', icon: Megaphone },
  { id: 'announcement', label: 'Announcements', icon: Calendar },
];

const Announcements = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<AnnouncementRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null);

  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'announcement',
    category: 'General',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: announcements = [], isLoading, isFetching } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      try {
        const response = await api.get('/announcements');
        return response.data || [];
      } catch (error) { throw error; }
    },
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post('/announcements', payload),
    onSuccess: () => {
      toast.success('Announcement created successfully');
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowModal(false);
      resetForm();
    },
    onError: () => toast.error('Failed to create announcement'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.put(`/announcements/${id}`, payload),
    onSuccess: () => {
      toast.success('Announcement updated successfully');
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowModal(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error('Failed to update announcement'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      toast.success('Announcement deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete announcement'),
  });

  const resetForm = () => {
    setForm({ title: '', body: '', type: 'announcement', category: 'General' });
    setEditingItem(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item: AnnouncementRow) => {
    setEditingItem(item);
    setForm({
      title: item.title || '',
      body: item.body || '',
      type: item.type || 'announcement',
      category: item.category || 'General',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      type: form.type,
      category: form.category,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredData = useMemo(() => {
    let items = announcements as AnnouncementRow[];
    if (activeTab !== 'all') {
      items = items.filter((item) => item.type === activeTab);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.body.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [announcements, activeTab, searchTerm]);

  const columns: DataTableColumn<AnnouncementRow>[] = useMemo(() => [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${row.type === 'notice' ? 'bg-pink-500' : 'bg-blue-500'}`} />
          <span className="font-medium text-[var(--text-primary)]">{row.title}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (row) => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
          {row.category || 'General'}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (row) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${row.type === 'notice' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>
          {row.type || 'announcement'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
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
          <Tooltip id={`edit-announcement-${row.id}`} content="Edit">
            <button
              onClick={() => openEdit(row)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip id={`delete-announcement-${row.id}`} content="Delete">
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
    const total = announcements.length;
    const notices = announcements.filter((a) => a.type === 'notice').length;
    const general = announcements.filter((a) => a.type !== 'notice').length;
    return [
      { label: 'Total', value: total, color: '#6366F1', bg: '#EEF2FF', icon: FileText },
      { label: 'Notices', value: notices, color: '#EC4899', bg: '#FDF2F8', icon: Megaphone },
      { label: 'Announcements', value: general, color: '#3B82F6', bg: '#EFF6FF', icon: Calendar },
    ];
  }, [announcements]);

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        title="Announcements & Notices"
        subtitle="Manage company announcements and notices"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-md shadow-black/10"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                placeholder="Search announcements..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
              />
            </div>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {ANNOUNCEMENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
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
          emptyMessage="No announcements found"
          isLoading={isLoading || isFetching}
        />
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); resetForm(); }}
        title={editingItem ? 'Edit Announcement' : 'New Announcement'}
        width="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={formInputClass}
              placeholder="Enter announcement title"
            />
          </FormField>
          <FormField label="Body" required>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className={formTextareaClass}
              rows={4}
              placeholder="Enter announcement content"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={formInputClass}
              >
                <option value="announcement">Announcement</option>
                <option value="notice">Notice</option>
              </select>
            </FormField>
            <FormField label="Category">
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={formInputClass}
                placeholder="General"
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
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.title || 'this announcement'}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
};

export default Announcements;
