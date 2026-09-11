import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  Bell,
  BellRing,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardCheck,
  Clock,
  Edit2,
  ExternalLink,
  Eye,
  LogIn,
  LogOut,
  Megaphone,
  Palmtree,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { formatAppDate } from '../services/appSettingsService';
import PageHero from '../components/PageHero';
import StatsCard from '../components/StatsCard';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import TableSkeleton from '../components/TableSkeleton';
import Tooltip from '../components/Tooltip';
import Modal from '../components/Modal';
import ToggleSwitch from '../components/ToggleSwitch';
import BulkDeleteModal from '../components/BulkDeleteModal';
import SearchableSelect from '../components/SearchableSelect';
import DateRangePicker from '../components/DateRangePicker';
import DataTable from '../components/DataTable';
import type { DataTableColumn } from '../components/DataTable';
import type { Notification } from '../types';

type RawNotification = Notification & {
  is_read?: boolean | number;
  created_at?: string;
  user?: unknown;
};

interface NormalizedNotification {
  id: number;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'approvals', label: 'Approvals (leave + expense)' },
  { value: 'leave', label: 'Leave' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'expense', label: 'Expense' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'exit', label: 'Exit' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'notice', label: 'Notice' },
  { value: 'grievance', label: 'Grievance' },
  { value: 'system', label: 'System' },
];

const PREF_CATEGORIES = [
  { id: 'leave', label: 'Leave updates' },
  { id: 'attendance', label: 'Attendance alerts' },
  { id: 'expense', label: 'Expense updates' },
  { id: 'payroll', label: 'Payroll alerts' },
  { id: 'holiday', label: 'Holiday updates' },
  { id: 'recruitment', label: 'Recruitment updates' },
  { id: 'onboarding', label: 'Onboarding updates' },
  { id: 'exit', label: 'Exit updates' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'notice', label: 'Notices' },
  { id: 'grievance', label: 'Grievance updates' },
  { id: 'system', label: 'System notices' },
];

const PREF_STORAGE_KEY = 'notifications-muted-types';

const TYPE_META: Record<string, { icon: LucideIcon; box: string; chip: string }> = {
  leave: {
    icon: CalendarCheck,
    box: 'bg-blue-50 text-blue-600 border border-blue-100',
    chip: 'bg-[#EBF5FF] text-[var(--primary-blue)] border border-[#1C64F2]/20',
  },
  attendance: {
    icon: Clock,
    box: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    chip: 'bg-[#F0FDF4] text-[var(--success-green)] border border-[#057A55]/20',
  },
  expense: {
    icon: Wallet,
    box: 'bg-amber-50 text-amber-600 border border-amber-100',
    chip: 'bg-[#FFF7ED] text-[#C2410C] border border-[#C2410C]/20',
  },
  payroll: {
    icon: Banknote,
    box: 'bg-violet-50 text-violet-600 border border-violet-100',
    chip: 'bg-violet-50 text-violet-700 border border-violet-200',
  },
  system: {
    icon: Settings,
    box: 'bg-slate-100 text-slate-600 border border-slate-200',
    chip: 'bg-slate-100 text-slate-700 border border-slate-200',
  },
  announcement: {
    icon: Megaphone,
    box: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    chip: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  },
  notice: {
    icon: Megaphone,
    box: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    chip: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  },
  onboarding: {
    icon: LogIn,
    box: 'bg-teal-50 text-teal-600 border border-teal-100',
    chip: 'bg-teal-50 text-teal-700 border border-teal-200',
  },
  exit: {
    icon: LogOut,
    box: 'bg-red-50 text-red-600 border border-red-100',
    chip: 'bg-red-50 text-red-700 border border-red-200',
  },
  holiday: {
    icon: Palmtree,
    box: 'bg-amber-50 text-amber-600 border border-amber-100',
    chip: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  recruitment: {
    icon: Briefcase,
    box: 'bg-violet-50 text-violet-600 border border-violet-100',
    chip: 'bg-violet-50 text-violet-700 border border-violet-200',
  },
  grievance: {
    icon: AlertTriangle,
    box: 'bg-rose-50 text-rose-600 border border-rose-100',
    chip: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
};

const DEFAULT_META = {
  icon: Bell,
  box: 'bg-gray-100 text-gray-500 border border-gray-200',
  chip: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const normalizeNotification = (raw: RawNotification): NormalizedNotification => {
  const read =
    typeof raw.isRead === 'boolean' ? raw.isRead : raw.is_read === true || raw.is_read === 1;
  return {
    id: Number(raw.id),
    title: String(raw.title ?? 'Notification'),
    body: String(raw.body ?? ''),
    type: String(raw.type ?? 'system').toLowerCase(),
    isRead: read,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
  };
};

const timeAgo = (value: string): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const formatFullDate = (value: string): string => {
  if (!value) return 'Unknown date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const dayKey = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const viewTargetFor = (type: string): { path: string; label: string } | null => {
  if (type === 'leave') return { path: '/leaves', label: 'View leave' };
  if (type === 'expense') return { path: '/expenses', label: 'View expense' };
  return null;
};

const loadMutedTypes = (): string[] => {
  try {
    const saved = localStorage.getItem(PREF_STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
};

const Notifications = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  // searchTerm is handled internally by DataTable
  const [typeFilter, setTypeFilter] = useState('all');
  const [todayOnly, setTodayOnly] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [mutedTypes, setMutedTypes] = useState<string[]>(loadMutedTypes);
  const [deleteTarget, setDeleteTarget] = useState<NormalizedNotification | null>(null);
  const [bulkTarget, setBulkTarget] = useState<{ ids: number[] } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showPreferences, setShowPreferences] = useState(true);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(mutedTypes));
    } catch {
      /* storage unavailable — preferences stay in memory */
    }
  }, [mutedTypes]);

  const { data: rawNotifications = [], isLoading } = useQuery<RawNotification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications', { params: { limit: 100 } }).then((r) => r.data || []),
    staleTime: 30_000,
  });

  const notifications = useMemo(
    () => (Array.isArray(rawNotifications) ? rawNotifications : []).map(normalizeNotification),
    [rawNotifications],
  );

  const markReadMutation = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
    onError: () => toast.error('Failed to mark as read'),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast.success('All notifications marked as read');
    },
    onError: () => toast.error('Failed to mark all as read'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast.success('Notification deleted');
    },
    onError: () => toast.error('Failed to delete notification'),
    onSettled: () => setDeleteTarget(null),
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const todayKey = dayKey(new Date().toISOString());
  const todayCount = notifications.filter((n) => dayKey(n.createdAt) === todayKey).length;
  const approvalsCount = notifications.filter(
    (n) => n.type === 'leave' || n.type === 'expense',
  ).length;

  const mutedSet = useMemo(() => new Set(mutedTypes), [mutedTypes]);

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (mutedSet.has(n.type)) return false;
      if (activeTab === 'unread' && n.isRead) return false;
      if (activeTab === 'read' && !n.isRead) return false;
      if (typeFilter === 'approvals' && n.type !== 'leave' && n.type !== 'expense') return false;
      if (typeFilter !== 'all' && typeFilter !== 'approvals' && n.type !== typeFilter) return false;
      if (todayOnly && dayKey(n.createdAt) !== todayKey) return false;
      if (startDate || endDate) {
        const created = n.createdAt ? n.createdAt.split('T')[0] : '';
        if (!created) return false;
        if (startDate && created < startDate) return false;
        if (endDate && created > endDate) return false;
      }
      return true;
    });
  }, [notifications, mutedSet, activeTab, typeFilter, todayOnly, todayKey, startDate, endDate]);

  const hasActiveFilters =
    typeFilter !== 'all' || todayOnly || activeTab !== 'all' || startDate !== '' || endDate !== '';

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setRefreshing(false);
  };

  const handleRowClick = (n: NormalizedNotification) => {
    if (!n.isRead) markReadMutation.mutate(n.id);
  };

  const toggleMute = (type: string) => {
    setMutedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setTodayOnly(false);
    setActiveTab('all');
    setStartDate('');
    setEndDate('');
  };

  const handleBulkDelete = async () => {
    if (!bulkTarget || bulkTarget.ids.length === 0) return;
    setBulkDeleting(true);
    const results = await Promise.allSettled(bulkTarget.ids.map((id) => api.delete(`/notifications/${id}`)));
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    setBulkTarget(null);
    setBulkDeleting(false);
    if (failed === 0) toast.success(`${succeeded} notification${succeeded === 1 ? '' : 's'} deleted`);
    else if (succeeded === 0) toast.error('Failed to delete notifications');
    else toast.success(`${succeeded} deleted, ${failed} failed`);
  };

  const stats = [
    {
      label: 'Total',
      value: notifications.length,
      icon: Bell,
      iconBg: 'bg-gradient-to-br from-[#6366F1]/20 via-[#818CF8]/10 to-[#A5B4FC]/5',
      iconColor: 'text-[#4F46E5]',
      onClick: () => {
        setActiveTab('all');
        setTypeFilter('all');
        setTodayOnly(false);
      },
    },
    {
      label: 'Unread',
      value: unreadCount,
      icon: BellRing,
      iconBg: 'bg-gradient-to-br from-[#14B8A6]/20 via-[#2DD4BF]/10 to-[#5EEAD4]/5',
      iconColor: 'text-[#0D9488]',
      onClick: () => setActiveTab('unread'),
    },
    {
      label: 'Today',
      value: todayCount,
      icon: CalendarDays,
      iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5',
      iconColor: 'text-[#D97706]',
      onClick: () => {
        setTodayOnly((v) => !v);
        setActiveTab('all');
      },
    },
    {
      label: 'Approvals',
      value: approvalsCount,
      icon: ClipboardCheck,
      iconBg: 'bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5',
      iconColor: 'text-[#7C3AED]',
      onClick: () => {
        setTypeFilter('approvals');
        setActiveTab('all');
        setTodayOnly(false);
      },
    },
  ];

  if (!mounted) return <PageSkeleton />;

  const handleBulkDeleteSelected = (rows: NormalizedNotification[]) => {
    setBulkTarget({ ids: rows.map((n) => n.id) });
  };

  const tableColumns: DataTableColumn<NormalizedNotification>[] = [
    {
      key: 'title',
      header: 'Notification',
      width: '100%',
      render: (n) => {
        const meta = TYPE_META[n.type] || DEFAULT_META;
        const Icon = meta.icon;
        const view = viewTargetFor(n.type);
        return (
          <div
            className={`flex items-start gap-3 px-4 sm:px-5 py-3.5 transition-colors ${
              n.isRead ? 'bg-white' : 'bg-blue-50/40'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.box}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm truncate ${
                  n.isRead
                    ? 'font-medium text-[var(--text-secondary)]'
                    : 'font-semibold text-[var(--text-primary)]'
                }`}
              >
                {n.title}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-2">{n.body}</p>
              {view && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!n.isRead) markReadMutation.mutate(n.id);
                    navigate(view.path);
                  }}
                  className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-[var(--primary-blue)] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {view.label}
                </button>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Type',
      width: '120px',
      render: (n) => {
        const meta = TYPE_META[n.type] || DEFAULT_META;
        return (
          <span
            className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full capitalize ${meta.chip}`}
          >
            {n.type}
          </span>
        );
      },
    },
    {
      key: 'date',
      header: 'Date',
      width: '120px',
      sortable: true,
      sortValue: (n) => n.createdAt,
      render: (n) => (
        <Tooltip id={`notif-date-${n.id}`} content={timeAgo(n.createdAt)}>
          <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
            {formatAppDate(n.createdAt)}
          </span>
        </Tooltip>
      ),
    },
  ];

  const tableActions = (n: NormalizedNotification) => {
    const view = viewTargetFor(n.type);
    return (
      <div className="flex items-center justify-end gap-1.5">
        {view && (
          <>
            <Tooltip id={`view-notif-${n.id}`} content="View">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!n.isRead) markReadMutation.mutate(n.id);
                  navigate(view.path);
                }}
                className="p-2 text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 rounded-lg transition-colors"
                title="View"
              >
                <Eye className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip id={`edit-notif-${n.id}`} content="Edit">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!n.isRead) markReadMutation.mutate(n.id);
                  navigate(view.path);
                }}
                className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors"
                title="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </Tooltip>
          </>
        )}
        {!n.isRead && (
          <Tooltip id={`mark-read-${n.id}`} content="Mark as read">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                markReadMutation.mutate(n.id);
              }}
              className="p-2 text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 rounded-lg transition-colors"
              title="Mark as read"
            >
              <Check className="w-4 h-4" />
            </button>
          </Tooltip>
        )}
        <Tooltip id={`delete-notif-${n.id}`} content="Delete">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(n);
            }}
            className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-page-enter">
      <PageHero
        title="Notifications"
        subtitle="Stay updated with your latest alerts and messages"
        icon={Bell}
        accent="indigo"
        breadcrumbs={['Home', 'Notifications']}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing || isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold rounded-xl hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl font-semibold text-sm shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            iconBg={stat.iconBg}
            iconColor={stat.iconColor}
            isLoading={isLoading}
            delay={i * 60}
            onClick={stat.onClick}
          />
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm">
        <button
          type="button"
          onClick={() => setShowPreferences(!showPreferences)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[#0F172A]">Notification preferences</h2>
            {mutedTypes.length > 0 && (
              <span className="text-[10px] font-semibold text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full">
                {mutedTypes.length} muted
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mutedTypes.length > 0 && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setMutedTypes([]); }}
                className="text-xs font-semibold text-[var(--primary-blue)] hover:underline"
              >
                Unmute all
              </span>
            )}
            <svg
              className={`w-4 h-4 text-[#64748B] transition-transform ${showPreferences ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {showPreferences && (
          <div className="px-5 pb-5 border-t border-[var(--border-color)]">
            <div className="mt-4 mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-xs text-blue-700">
                  <p className="font-semibold mb-1">How notification preferences work</p>
                  <ul className="space-y-0.5 text-blue-600">
                    <li>• <strong>ON</strong> = You will receive notifications for this category</li>
                    <li>• <strong>OFF</strong> = Notifications for this category will be hidden</li>
                    <li>• Changes apply immediately to your notification list</li>
                    <li>• Preferences are saved on this device only</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PREF_CATEGORIES.map((c) => {
                const muted = mutedTypes.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[#F8FAFC]"
                  >
                    <span className="text-sm font-medium text-[#0F172A]">{c.label}</span>
                    <ToggleSwitch
                      checked={!muted}
                      onChange={() => toggleMute(c.id)}
                      helpText={muted ? `Muted — click to unmute ${c.label}` : `Active — click to mute ${c.label}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-color)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--border-color)] space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <SearchableSelect
                value={typeFilter}
                onChange={(val) => setTypeFilter(val.toString())}
                options={TYPE_FILTER_OPTIONS.map((o) => ({ id: o.value, name: o.label }))}
                placeholder="All types"
                allOption="All types"
                className="w-44"
              />
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }}
                placeholder="Filter by date"
              />
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {FILTER_TABS.map((tab) => (
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
              {todayOnly && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Today only
                  <button
                    type="button"
                    onClick={() => setTodayOnly(false)}
                    className="hover:text-amber-900"
                    aria-label="Clear today filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {hasActiveFilters && (
                <Tooltip id="clear-notif-filters" content="Clear all filters">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-xl transition-colors"
                    aria-label="Clear all filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#64748B] px-3 py-1 rounded-full bg-[#F1F5F9]">
              {filtered.length} notification{filtered.length === 1 ? '' : 's'}
              {mutedTypes.length > 0 && ` · ${mutedTypes.length} categor${mutedTypes.length === 1 ? 'y' : 'ies'} muted`}
            </span>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (
          <DataTable<NormalizedNotification>
            columns={tableColumns}
            data={filtered}
            rowKey={(n) => `notif-${n.id}`}
            searchable
            searchKeys={(n) => `${n.title} ${n.body} ${n.type}`}
            searchPlaceholder="Search notifications..."
            emptyMessage="No notifications found"
            actions={tableActions}
            onRowClick={(n) => handleRowClick(n)}
            selectable
            bulkActions={[
              {
                label: 'Delete selected',
                icon: Trash2,
                variant: 'danger',
                onAction: handleBulkDeleteSelected,
              },
            ]}
            exportable={false}
            persistKey="notifications-table"
            defaultDensity="comfortable"
          />
        )}
      </div>

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete notification"
        size="sm"
      >
        <p className="text-sm text-[#475569]">
          Delete <span className="font-semibold text-[#0F172A]">“{deleteTarget?.title}”</span>? This
          action cannot be undone.
        </p>
        <div className="flex gap-3 pt-5">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            disabled={deleteMutation.isPending}
            className="flex-1 px-4 py-2.5 bg-[#DC2626] text-white font-medium rounded-xl hover:bg-[#B91C1C] transition-colors text-sm disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

      <BulkDeleteModal
        isOpen={!!bulkTarget}
        onClose={() => setBulkTarget(null)}
        onConfirm={handleBulkDelete}
        count={bulkTarget?.ids.length ?? 0}
        entityType="notification"
        consequences={['Read notifications will be permanently removed from your list']}
        isDeleting={bulkDeleting}
      />
    </div>
  );
};

export default Notifications;
