import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  Megaphone, Plus, Edit2, Trash2,
  Calendar, FileText, Pin, Clock, Eye, Copy,
  LayoutGrid, List, Users, X,
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

type AnnouncementType = 'announcement' | 'notice';

type Announcement = {
  id: number;
  title: string;
  body: string;
  type: AnnouncementType;
  category?: string;
  pinned?: boolean;
  audience?: string;
  expiresAt?: string | null;
  isRead?: boolean;
  createdAt?: string;
};

type StatFilter = 'all' | 'notices' | 'pinned' | 'expiring';

type AnnouncementForm = {
  title: string;
  body: string;
  type: string;
  category: string;
  pinned: boolean;
  audience: string;
  expiresAt: string;
};

const EMPTY_FORM: AnnouncementForm = {
  title: '',
  body: '',
  type: 'announcement',
  category: 'General',
  pinned: false,
  audience: 'all',
  expiresAt: '',
};

const ANNOUNCEMENT_TABS = [
  { id: 'all', label: 'All', icon: FileText },
  { id: 'notice', label: 'Notices', icon: Megaphone },
  { id: 'announcement', label: 'Announcements', icon: Calendar },
];

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Everyone' },
  { value: 'employees', label: 'Employees' },
  { value: 'managers', label: 'Managers' },
];

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const toDateInputValue = (iso?: string | null): string => {
  if (!iso) return '';
  return iso.substring(0, 10);
};

const excerpt = (body: string, length = 140): string => {
  const text = (body || '').trim();
  if (text.length <= length) return text;
  return `${text.substring(0, length).trimEnd()}...`;
};

const isExpired = (item: Announcement): boolean => {
  if (!item.expiresAt) return false;
  return new Date(item.expiresAt).getTime() < Date.now();
};

const isExpiringSoon = (item: Announcement): boolean => {
  if (!item.expiresAt) return false;
  const diff = new Date(item.expiresAt).getTime() - Date.now();
  return diff >= 0 && diff <= EXPIRING_WINDOW_MS;
};

const audienceLabel = (audience?: string): string =>
  AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label || 'Everyone';

const getTypeBadgeClass = (type: string): string =>
  type === 'notice'
    ? 'bg-[#FDF2F8] text-[#DB2777] border border-[#EC4899]/20'
    : 'bg-[#EBF5FF] text-[var(--primary-blue)] border border-[#1C64F2]/20';

const Announcements = () => {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('all');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<Announcement[] | null>(null);
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const { data: announcements = [], isLoading, isFetching } = useQuery<Announcement[]>({
    queryKey: ['announcements'],
    queryFn: async () => {
      const response = await api.get('/announcements');
      const rows = (response.data || []) as Announcement[];
      return rows.map((row) => ({
        ...row,
        type: row.type === 'notice' ? 'notice' : 'announcement',
      }));
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
      resetForm();
    },
    onError: () => toast.error('Failed to update announcement'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => api.delete(`/announcements/${id}`)));
    },
    onSuccess: (_data, ids) => {
      toast.success(ids.length > 1 ? `${ids.length} announcements deleted` : 'Announcement deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setDeleteTargets(null);
    },
    onError: () => toast.error('Failed to delete announcement'),
  });

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingItem(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const fillFormFromItem = (item: Announcement, titleOverride?: string) => {
    setForm({
      title: titleOverride ?? item.title ?? '',
      body: item.body ?? '',
      type: item.type || 'announcement',
      category: item.category || 'General',
      pinned: !!item.pinned,
      audience: item.audience || 'all',
      expiresAt: toDateInputValue(item.expiresAt),
    });
  };

  const openEdit = (item: Announcement) => {
    setEditingItem(item);
    fillFormFromItem(item);
    setShowModal(true);
  };

  const openDuplicate = (item: Announcement) => {
    setEditingItem(null);
    fillFormFromItem(item, `${item.title} (Copy)`);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      body: form.body.trim(),
      type: form.type,
      category: form.category.trim() || 'General',
      pinned: form.pinned,
      audience: form.audience,
      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    announcements.forEach((a) => {
      if (a.category) set.add(a.category);
    });
    return Array.from(set).sort();
  }, [announcements]);

  const pinnedItems = useMemo(() => announcements.filter((a) => a.pinned), [announcements]);

  const stats = useMemo(() => {
    const total = announcements.length;
    const notices = announcements.filter((a) => a.type === 'notice').length;
    const pinned = announcements.filter((a) => a.pinned).length;
    const expiring = announcements.filter(isExpiringSoon).length;
    return [
      {
        label: 'Total',
        value: total,
        icon: FileText,
        iconBg: 'bg-gradient-to-br from-[#6366F1]/20 via-[#818CF8]/10 to-[#A5B4FC]/5',
        iconColor: 'text-[#4F46E5]',
        filter: 'all' as StatFilter,
        tab: 'all',
      },
      {
        label: 'Notices',
        value: notices,
        icon: Megaphone,
        iconBg: 'bg-gradient-to-br from-[#EC4899]/20 via-[#F472B6]/10 to-[#F9A8D4]/5',
        iconColor: 'text-[#DB2777]',
        filter: 'notices' as StatFilter,
        tab: 'notice',
      },
      {
        label: 'Pinned',
        value: pinned,
        icon: Pin,
        iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5',
        iconColor: 'text-[#D97706]',
        filter: 'pinned' as StatFilter,
        tab: 'all',
      },
      {
        label: 'Expiring Soon',
        value: expiring,
        icon: Clock,
        iconBg: 'bg-gradient-to-br from-[#EF4444]/20 via-[#F87171]/10 to-[#FCA5A5]/5',
        iconColor: 'text-[#DC2626]',
        filter: 'expiring' as StatFilter,
        tab: 'all',
      },
    ];
  }, [announcements]);

  const handleStatClick = (filter: StatFilter, tab: string) => {
    setStatFilter(filter);
    setActiveTab(tab);
  };

  const filteredData = useMemo(() => {
    let items = [...announcements];
    if (activeTab !== 'all') {
      items = items.filter((item) => item.type === activeTab);
    }
    if (statFilter === 'notices') {
      items = items.filter((item) => item.type === 'notice');
    } else if (statFilter === 'pinned') {
      items = items.filter((item) => item.pinned);
    } else if (statFilter === 'expiring') {
      items = items.filter(isExpiringSoon);
    }
    if (categoryFilter !== 'all') {
      items = items.filter((item) => (item.category || 'General') === categoryFilter);
    }
    items.sort((a, b) => {
      const pinDiff = Number(!!b.pinned) - Number(!!a.pinned);
      if (pinDiff !== 0) return pinDiff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    return items;
  }, [announcements, activeTab, statFilter, categoryFilter]);

  const exportRows = useMemo(
    () =>
      filteredData.map((a) => ({
        Title: a.title,
        Type: a.type,
        Category: a.category || 'General',
        Audience: audienceLabel(a.audience),
        Pinned: a.pinned ? 'Yes' : 'No',
        Expires: a.expiresAt ? new Date(a.expiresAt).toLocaleDateString() : 'No expiry',
        Created: a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '',
      })),
    [filteredData]
  );

  const hasActiveFilters =
    activeTab !== 'all' || statFilter !== 'all' || categoryFilter !== 'all';

  const clearFilters = () => {
    setActiveTab('all');
    setStatFilter('all');
    setCategoryFilter('all');
  };

  const renderExpiryBadge = (item: Announcement) => {
    if (!item.expiresAt) {
      return <span className="text-xs text-gray-400">No expiry</span>;
    }
    if (isExpired(item)) {
      return (
        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-50 text-red-700 border border-red-200">
          Expired
        </span>
      );
    }
    if (isExpiringSoon(item)) {
      return (
        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          Expires {formatAppDate(item.expiresAt)}
        </span>
      );
    }
    return (
      <span className="text-xs text-[var(--text-secondary)]">Expires {formatAppDate(item.expiresAt)}</span>
    );
  };

  const renderCardActions = (item: Announcement, prefix: string) => (
    <div className="flex items-center gap-1">
      <Tooltip id={`${prefix}-preview-${item.id}`} content="Preview">
        <button
          onClick={() => setPreviewItem(item)}
          className="p-1.5 rounded-lg text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip id={`${prefix}-edit-${item.id}`} content="Edit">
        <button
          onClick={() => openEdit(item)}
          className="p-1.5 rounded-lg text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 transition-colors"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip id={`${prefix}-duplicate-${item.id}`} content="Duplicate">
        <button
          onClick={() => openDuplicate(item)}
          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#059669] hover:bg-emerald-50 transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip id={`${prefix}-delete-${item.id}`} content="Delete">
        <button
          onClick={() => setDeleteTargets([item])}
          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#C81E1E] hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </Tooltip>
    </div>
  );

  const columns: DataTableColumn<Announcement>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${row.type === 'notice' ? 'bg-pink-500' : 'bg-blue-500'}`} />
          {row.pinned && <Pin className="w-3.5 h-3.5 text-[#D97706] shrink-0" />}
          <button
            onClick={() => setPreviewItem(row)}
            className="font-medium text-[var(--text-primary)] hover:text-[var(--primary-blue)] truncate text-left"
          >
            {row.title}
          </button>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      sortValue: (row) => row.category || 'General',
      render: (row) => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
          {row.category || 'General'}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortValue: (row) => row.type,
      render: (row) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${getTypeBadgeClass(row.type)}`}>
          {row.type === 'notice' ? 'Notice' : 'Announcement'}
        </span>
      ),
    },
    {
      key: 'audience',
      header: 'Audience',
      sortable: true,
      sortValue: (row) => row.audience || 'all',
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
          <Users className="w-3.5 h-3.5 text-gray-400" />
          {audienceLabel(row.audience)}
        </span>
      ),
    },
    {
      key: 'expiresAt',
      header: 'Expiry',
      sortable: true,
      sortValue: (row) => row.expiresAt || '',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          {renderExpiryBadge(row)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      sortValue: (row) => row.createdAt || '',
      render: (row) => (
        <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {row.createdAt ? formatAppDate(row.createdAt) : '-'}
        </span>
      ),
    },
  ];

  const reloading = isLoading || isFetching;
  const deleteLabel =
    deleteTargets && deleteTargets.length > 1
      ? `${deleteTargets.length} announcements`
      : deleteTargets?.[0]?.title || 'this announcement';

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHero
        title="Announcements & Notices"
        subtitle="Manage company announcements and notices"
        icon={Megaphone}
        accent="violet"
        breadcrumbs={['Home', 'Announcements']}
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl font-semibold text-sm shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </button>
        }
      />

      {pinnedItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-[#D97706]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Pinned ({pinnedItems.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pinnedItems.map((item) => (
              <div
                key={item.id}
                className="relative overflow-hidden bg-white rounded-2xl border border-[#F59E0B]/30 shadow-sm hover:shadow-md transition-shadow p-4"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#F59E0B] via-[#FBBF24] to-[#FCD34D]" />
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5 text-[#D97706] flex items-center justify-center shrink-0">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${getTypeBadgeClass(item.type)}`}>
                        {item.type === 'notice' ? 'Notice' : 'Announcement'}
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-700">
                        {item.category || 'General'}
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-bold text-[var(--text-primary)] truncate">{item.title}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2">{excerpt(item.body)}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {renderExpiryBadge(item)}
                      <button
                        onClick={() => setPreviewItem(item)}
                        className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
                      >
                        Read more
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={stat.label} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 100}ms` }}>
            <StatsCard
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              iconBg={stat.iconBg}
              iconColor={stat.iconColor}
              isLoading={isLoading}
              onClick={() => handleStatClick(stat.filter, stat.tab)}
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-color)] space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <ExportButton rows={exportRows} filename="announcements_export.csv" variant="toolbar" label="Export" />
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setViewMode('cards')}
                  title="Cards view"
                  className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-[var(--primary-blue)] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  title="Table view"
                  className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-[var(--primary-blue)] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  title="Clear filters"
                  className="p-2 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
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

        {reloading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : viewMode === 'cards' ? (
          filteredData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <Megaphone className="w-10 h-10 text-[#CBD5E1] mb-4" />
              <p className="text-sm font-semibold text-[#0F172A]">No announcements found</p>
              <p className="text-xs text-[#94A3B8] mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              {filteredData.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          item.type === 'notice'
                            ? 'bg-gradient-to-br from-[#EC4899]/20 via-[#F472B6]/10 to-[#F9A8D4]/5 text-[#DB2777]'
                            : 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5 text-[var(--primary-blue)]'
                        }`}
                      >
                        <Megaphone className="w-4 h-4" />
                      </div>
                      <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${getTypeBadgeClass(item.type)}`}>
                        {item.type === 'notice' ? 'Notice' : 'Announcement'}
                      </span>
                      {item.pinned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <Pin className="w-3 h-3" />
                          Pinned
                        </span>
                      )}
                    </div>
                    {renderCardActions(item, 'card')}
                  </div>
                  <button onClick={() => setPreviewItem(item)} className="mt-3 text-left">
                    <h3 className="font-bold text-[var(--text-primary)] hover:text-[var(--primary-blue)] line-clamp-1">
                      {item.title}
                    </h3>
                  </button>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-3 flex-1">{excerpt(item.body, 160)}</p>
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-700">
                      {item.category || 'General'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {audienceLabel(item.audience)}
                    </span>
                    <span className="ml-auto">{renderExpiryBadge(item)}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    {item.createdAt ? formatAppDate(item.createdAt) : ''}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={filteredData}
              rowKey={(row) => row.id}
              searchable
              searchKeys={(row: Announcement) => `${row.title} ${row.body} ${row.category || ''} ${row.audience || ''}`}
              searchPlaceholder="Search announcements..."
              emptyMessage="No announcements found"
              persistKey="announcements"
              exportFilename="announcements.csv"
              logEntityType="announcement"
              logFor={(row) => ({ id: row.id, label: row.title })}
              onEdit={(row) => openEdit(row)}
              onDelete={(rows) => setDeleteTargets(rows as Announcement[])}
              actions={(row) => <div className="flex items-center justify-end gap-1.5">{renderCardActions(row, 'row')}</div>}
            />
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingItem ? 'Edit Announcement' : 'New Announcement'}
        size="lg"
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
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Body <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className={`${formTextareaClass} min-h-[120px] py-3`}
              placeholder="Enter announcement content"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <FormField label="Audience">
              <select
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                className={formInputClass}
              >
                {AUDIENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Expiry Date">
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className={formInputClass}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-[var(--primary-blue)] focus:ring-[var(--primary-blue)]"
            />
            Pin this announcement to the top
          </label>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
              Live Preview
            </p>
            <div className="bg-white rounded-xl border border-[var(--border-color)] p-4">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${getTypeBadgeClass(form.type)}`}>
                  {form.type === 'notice' ? 'Notice' : 'Announcement'}
                </span>
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-700">
                  {form.category.trim() || 'General'}
                </span>
                {form.pinned && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    <Pin className="w-3 h-3" />
                    Pinned
                  </span>
                )}
              </div>
              <h4 className="mt-2 font-bold text-[var(--text-primary)]">{form.title.trim() || 'Untitled announcement'}</h4>
              <p className="mt-1 text-sm text-[var(--text-secondary)] whitespace-pre-line">
                {form.body.trim() || 'Announcement body preview will appear here...'}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {audienceLabel(form.audience)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {form.expiresAt ? `Expires ${form.expiresAt}` : 'No expiry'}
                </span>
              </div>
            </div>
          </div>

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
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.title || 'Preview'}
        size="lg"
      >
        {previewItem && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${getTypeBadgeClass(previewItem.type)}`}>
                {previewItem.type === 'notice' ? 'Notice' : 'Announcement'}
              </span>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                {previewItem.category || 'General'}
              </span>
              {previewItem.pinned && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  <Pin className="w-3 h-3" />
                  Pinned
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                <Users className="w-3.5 h-3.5" />
                {audienceLabel(previewItem.audience)}
              </span>
              <span className="ml-auto">{renderExpiryBadge(previewItem)}</span>
            </div>
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-line leading-relaxed">{previewItem.body}</p>
            <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {previewItem.createdAt ? `Published ${formatAppDate(previewItem.createdAt)}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    openDuplicate(previewItem);
                    setPreviewItem(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    openEdit(previewItem);
                    setPreviewItem(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-[var(--primary-blue)] hover:bg-blue-100 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTargets?.length}
        onClose={() => setDeleteTargets(null)}
        onConfirm={() => deleteTargets && deleteMutation.mutate(deleteTargets.map((t) => t.id))}
        itemName={deleteLabel}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
};

export default Announcements;
