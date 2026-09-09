import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Check, Filter, Search, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import PageHero from '../components/PageHero';
import StatsCard from '../components/StatsCard';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import type { Notification } from '../types';

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

const TYPE_ICONS: Record<string, string> = {
  leave: 'calendar-outline',
  attendance: 'time-outline',
  expense: 'wallet-outline',
  payroll: 'card-outline',
  system: 'settings-outline',
  announcement: 'megaphone-outline',
  grievance: 'alert-circle-outline',
};

const Notifications = () => {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: notifications = [], isLoading, isFetching } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications', { params: { limit: 100 } }).then(r => r.data || []),
    staleTime: 30_000,
  });

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

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const readCount = notifications.filter((n) => n.isRead).length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.isRead;
    if (activeTab === 'read') return n.isRead;
    return true;
  });

  const searchedNotifications = filteredNotifications.filter((n) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q) ||
      (n.type || '').toLowerCase().includes(q)
    );
  });

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate(id);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setRefreshing(false);
  };

  const formatDate = (value: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const columns: DataTableColumn<Notification>[] = [
    {
      key: 'title',
      header: 'Notification',
      sortable: true,
      render: (row) => (
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${row.isRead ? 'bg-transparent' : 'bg-[#14B8A6]'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${row.isRead ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
              {row.title}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-2">{row.body}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (row) => (
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize">
          {row.type || 'system'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Received',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-1">
          {!row.isRead && (
            <button
              onClick={() => handleMarkRead(row.id)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[var(--primary-blue)] hover:bg-blue-50 transition-colors"
              title="Mark as read"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const stats = [
    { label: 'Total', value: notifications.length, color: '#6366F1', bg: '#EEF2FF', icon: Bell },
    { label: 'Unread', value: unreadCount, color: '#14B8A6', bg: '#CCFBF1', icon: Bell },
    { label: 'Read', value: readCount, color: '#64748B', bg: '#F1F5F9', icon: CheckCheck },
  ];

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        title="Notifications"
        subtitle="Stay updated with your latest alerts and messages"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing || isLoading || isFetching}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--text-primary)] text-sm font-semibold rounded-xl border border-[var(--border-color)] hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md shadow-black/10"
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </button>
            )}
          </div>
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
                placeholder="Search notifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
              />
            </div>
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
          </div>
        </div>

        <DataTable
          columns={columns}
          data={searchedNotifications}
          rowKey={(row) => row.id}
          searchable={false}
          emptyMessage="No notifications found"
          isLoading={isLoading || isFetching}
        />
      </div>
    </div>
  );
};

export default Notifications;
