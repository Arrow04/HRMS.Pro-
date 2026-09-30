import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Bell, LogOut, Settings,
  ChevronDown, Menu, Users, Clock, CalendarCheck, DollarSign,
  Briefcase, Building2, FileText, LayoutDashboard, CheckCheck,
  Plus, FileDown, TrendingUp, CreditCard,
  ShieldAlert, Monitor, Palmtree, Database, CornerDownLeft
} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatAppDateTime } from '../services/appSettingsService';
import type { Notification } from '../types';

const ALL_PAGES = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Company', path: '/company', icon: Building2, module: 'company' },
  { label: 'Recruitment', path: '/recruitment', icon: Briefcase, module: 'recruitment' },
  { label: 'Employees', path: '/employees', icon: Users, module: 'employees' },
  { label: 'Attendance', path: '/attendance', icon: Clock, module: 'attendance' },
  { label: 'Leaves', path: '/leaves', icon: CalendarCheck, module: 'leaves' },
  { label: 'Holidays', path: '/holidays', icon: Palmtree, module: 'holidays' },
  { label: 'Expenses', path: '/expenses', icon: CreditCard, module: 'expenses' },
  { label: 'Assets', path: '/assets', icon: Monitor, module: 'assets' },
  { label: 'Performance', path: '/performance', icon: TrendingUp, module: 'performance' },
  { label: 'Payroll', path: '/payroll', icon: DollarSign, module: 'payroll' },
  { label: 'Exits', path: '/exit-management', icon: LogOut, module: 'exit' },
  { label: 'Anomalies', path: '/anomalies', icon: ShieldAlert, module: 'anomalies' },
  { label: 'Reports', path: '/reports', icon: FileText, module: 'reports' },
  { label: 'Master Data', path: '/master-data', icon: Database, module: 'master_data' },
  { label: 'Settings', path: '/settings', icon: Settings, module: 'settings' },
];

const NOTIF_TYPE_STYLE: Record<string, { icon: React.ElementType; cls: string; route: string }> = {
  leave: { icon: CalendarCheck, cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', route: '/leaves' },
  expense: { icon: CreditCard, cls: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400', route: '/expenses' },
  payroll: { icon: FileDown, cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', route: '/payroll' },
  attendance: { icon: Clock, cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', route: '/attendance' },
  performance: { icon: TrendingUp, cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', route: '/performance' },
  asset: { icon: Monitor, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', route: '/assets' },
  recruitment: { icon: Briefcase, cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400', route: '/recruitment' },
  exit: { icon: LogOut, cls: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400', route: '/exit-management' },
};

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  keywords?: string;
  action: () => void;
}

interface AppHeaderProps {
  onToggleSidebar?: () => void;
}

export default function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { user, logout, canAccessModule } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setSearchQuery('');
        setActiveIndex(0);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setShowUserMenu(false);
        setShowNotifications(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const closePalette = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setActiveIndex(0);
  };

  const { data: companies = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['companies-header'],
    queryFn: () => api.get('/companies').then(r => r.data?.items || r.data?.data || r.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const runCommand = (cmd: CommandItem) => {
    closePalette();
    cmd.action();
  };

  const openAddRoute = (path: string) => {
    closePalette();
    navigate(path);
  };

  const buildCommands = (): { section: string; items: CommandItem[] }[] => {
    if (!user) return [];
    const elevated = ['admin', 'superadmin', 'hr_admin', 'hr_manager', 'hr_executive'];
    const hasAccess = (module: string) => {
      if (elevated.includes(user.role)) return true;
      if (user.role === 'employee' && (!user.allowedModules || user.allowedModules.length === 0)) return true;
      return canAccessModule(module);
    };

    const pages = ALL_PAGES.filter(p => hasAccess(p.module)).map(p => ({
      id: `page-${p.path}`,
      label: p.label,
      hint: 'Go to page',
      icon: p.icon,
      keywords: `page ${p.label.toLowerCase()} navigate go`,
      action: () => navigate(p.path),
    }));

    const actions: CommandItem[] = [
      { id: 'add-employee', label: 'Add Employee', hint: 'Create a new employee', icon: Plus, keywords: 'new hire employee create add', action: () => openAddRoute('/employees') },
      { id: 'add-company', label: 'Add Company / Branch / Dept', hint: 'Company structure', icon: Building2, keywords: 'company branch department designation add new create', action: () => openAddRoute('/company') },
      { id: 'apply-leave', label: 'Apply for Leave', hint: 'New leave request', icon: CalendarCheck, keywords: 'leave request apply new', action: () => openAddRoute('/leaves') },
      { id: 'add-expense', label: 'Submit Expense', hint: 'New expense claim', icon: CreditCard, keywords: 'expense claim submit add', action: () => openAddRoute('/expenses') },
      { id: 'add-holiday', label: 'Add Holiday', hint: 'Company holiday', icon: Palmtree, keywords: 'holiday add new', action: () => openAddRoute('/holidays') },
      { id: 'export-employees', label: 'Export Employees', hint: 'Go to Employees page', icon: FileDown, keywords: 'export csv download employees', action: () => navigate('/employees') },
      { id: 'go-settings', label: 'Open Settings', hint: 'App configuration', icon: Settings, keywords: 'settings config preferences', action: () => navigate('/settings') },
    ];

    return [
      { section: 'Pages', items: pages },
      { section: 'Quick Actions', items: actions },
    ];
  };

  const commands = buildCommands();

  // Reset highlighted command when the query or palette visibility changes
  const [prevSearchKey, setPrevSearchKey] = useState<[string, boolean]>([searchQuery, searchOpen]);
  if (prevSearchKey[0] !== searchQuery || prevSearchKey[1] !== searchOpen) {
    setPrevSearchKey([searchQuery, searchOpen]);
    setActiveIndex(0);
  }

  const filteredCommands = commands
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        !searchQuery.trim() || `${item.label} ${item.keywords || ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ),
    }))
    .filter(group => group.items.length > 0);

  const flatFiltered = filteredCommands.flatMap(g => g.items);

  const scrollActiveIntoView = () => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  };

  useEffect(() => { scrollActiveIntoView(); }, [activeIndex]);

  const queryClient = useQueryClient();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data),
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count || 0;

  const { data: notifications = [], isLoading: notifLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications', { params: { limit: 20 } }).then(r => r.data || []),
    enabled: showNotifications,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  return (
    <header
      className="h-16 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        backgroundColor: 'var(--header-bg)',
        borderColor: 'var(--header-border)',
      }}
    >
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-xl transition-colors lg:hidden"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Company Selector (auto-locks when the server scopes you to one company) */}
        <div className="relative hidden sm:block" title={companies.length === 1 ? `Locked to ${companies[0].name} by your access scope` : 'Switch company view'}>
          <SearchableSelect
            value={companies.length === 1 ? companies[0].id : (localStorage.getItem('selectedCompanyId') || 'all')}
            onChange={(val) => {
              if (companies.length === 1) return;
              localStorage.setItem('selectedCompanyId', val.toString());
              window.location.reload();
            }}
            options={(companies || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
            placeholder="All Companies"
            allOption="All Companies"
            className="w-48"
            disabled={companies.length === 1}
          />
        </div>

        {/* Global Search */}
        <div ref={searchRef} className="relative">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border transition-all min-w-[200px] sm:min-w-[240px]"
            style={{
              color: 'var(--text-tertiary)',
              backgroundColor: 'var(--surface-secondary)',
              borderColor: 'var(--border-color)',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--scrollbar-thumb)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            <Search className="w-4 h-4" />
            <span>Search anything...</span>
            <kbd className="ml-auto px-1.5 py-0.5 text-xs rounded font-mono" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-tertiary)' }}>Ctrl+K</kbd>
          </button>

          {searchOpen && (
            <div className="absolute top-full mt-2 left-0 w-[480px] rounded-2xl shadow-elevated z-50 overflow-hidden animate-scale-in border"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3 p-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <Search className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flatFiltered.length - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
                    else if (e.key === 'Enter') { e.preventDefault(); const item = flatFiltered[activeIndex]; if (item) runCommand(item); }
                  }}
                  placeholder="Search pages, actions..."
                  className="flex-1 text-sm bg-transparent border-none outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                <kbd className="px-2 py-0.5 text-xs rounded font-mono" style={{ backgroundColor: 'var(--hover-bg)', color: 'var(--text-tertiary)' }}>ESC</kbd>
              </div>
              <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
                {filteredCommands.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>No results for "{searchQuery}"</p>
                ) : (
                  filteredCommands.map(group => (
                    <div key={group.section} className="mb-1">
                      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{group.section}</p>
                      {group.items.map(item => {
                        const idx = flatFiltered.indexOf(item);
                        return (
                          <button
                            key={item.id}
                            data-index={idx}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => runCommand(item)}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors"
                            style={{
                              backgroundColor: idx === activeIndex ? 'var(--active-blue-bg)' : 'transparent',
                              color: idx === activeIndex ? 'var(--sidebar-active-text)' : 'var(--text-body)',
                            }}
                          >
                            <item.icon className="w-4 h-4 shrink-0" style={{ color: idx === activeIndex ? 'var(--sidebar-active-text)' : 'var(--text-tertiary)' }} />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.hint && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{item.hint}</span>}
                            {idx === activeIndex && <CornerDownLeft className="w-3.5 h-3.5" style={{ color: 'var(--sidebar-active-text)' }} />}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-4 px-4 py-2 border-t text-[10px]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}>
                <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> select</span>
                <span className="flex items-center gap-1"><span className="font-mono">↑↓</span> navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1 rounded" style={{ backgroundColor: 'var(--border-color)' }}>esc</kbd> close</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl transition-colors relative"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-pulse-soft">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl shadow-elevated z-50 max-h-96 flex flex-col border animate-scale-in"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</h3>
                {notifications.length > 0 && (
                  <button onClick={() => markAllRead.mutate()} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 dark:text-blue-400 dark:hover:text-blue-300">
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {notifLoading ? (
                  null
                ) : notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No notifications</div>
                ) : (
                  notifications.map((n: Notification) => {
                    const ntype = n.type || 'system';
                    const style = NOTIF_TYPE_STYLE[ntype] || { icon: Bell, cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400', route: '' };
                    const TypeIcon = style.icon;
                    return (
                      <div key={n.id}
                        className={`flex items-start gap-3 px-4 py-3 border-b cursor-pointer transition-colors ${!n.isRead ? 'opacity-100' : 'opacity-80'}`}
                        style={{
                          borderColor: 'var(--border-light)',
                          backgroundColor: !n.isRead ? 'var(--active-blue-bg)' : 'transparent',
                        }}
                        onMouseEnter={e => { if (n.isRead) e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
                        onMouseLeave={e => { if (n.isRead) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        onClick={() => {
                          if (!n.isRead) markRead.mutate(n.id);
                          if (style.route) { navigate(style.route); setShowNotifications(false); }
                        }}>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.cls}`}>
                          <TypeIcon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                          {n.body && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{n.body}</p>}
                          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            {n.createdAt ? formatAppDateTime(n.createdAt) : ''}
                          </p>
                        </div>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0 animate-pulse-soft" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl transition-colors"
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
              {(user?.fullName || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{user?.fullName || 'User'}</p>
              <p className="text-xs capitalize" style={{ color: 'var(--text-tertiary)' }}>{user?.role || 'Admin'}</p>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-elevated z-50 py-2 border animate-scale-in"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user?.fullName}</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</p>
                <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                  {user?.role || 'admin'}
                </span>
              </div>
              <button
                onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
                style={{ color: 'var(--text-body)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Settings className="w-4 h-4" /> Settings
              </button>
              <div className="border-t mt-1 pt-1" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  onClick={() => { logout(); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition-colors dark:text-red-400"
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--status-inactive-bg)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
