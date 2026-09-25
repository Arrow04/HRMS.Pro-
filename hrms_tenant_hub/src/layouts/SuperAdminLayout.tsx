import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  Shield, Building2, CreditCard, Activity, ClipboardList, Server,
  LogOut, Menu, ChevronDown, ChevronLeft, ChevronRight, Users, Tag,
  Search, Bell, CornerDownLeft, CheckCheck, Settings
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const SIDEBAR_LINKS = [
  { path: '/superadmin', label: 'Dashboard', icon: Shield, end: true },
  { path: '/superadmin/tenants', label: 'Tenants', icon: Building2 },
  { path: '/superadmin/billing', label: 'Billing', icon: CreditCard },
  { path: '/superadmin/plans', label: 'Plans', icon: Tag },
  { path: '/superadmin/admins', label: 'Admin Users', icon: Users },
  { path: '/superadmin/health', label: 'Health', icon: Activity },
  { path: '/superadmin/audit-logs', label: 'Audit Logs', icon: ClipboardList },
  { path: '/superadmin/feature-flags', label: 'Features', icon: Server },
];

const ALL_PAGES = SIDEBAR_LINKS.map(l => ({
  label: l.label,
  path: l.path,
  icon: l.icon,
  module: l.label.toLowerCase().replace(' ', '_'),
}));

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  keywords?: string;
  action: () => void;
}

export default function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) { navigate('/login'); }
    else if (user.role !== 'superadmin') { logout(); navigate('/login'); }
  }, [user, navigate, logout]);

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

  const runCommand = (cmd: CommandItem) => {
    closePalette();
    cmd.action();
  };

  const buildCommands = (): { section: string; items: CommandItem[] }[] => {
    if (!user) return [];

    const pages = ALL_PAGES.map(p => ({
      id: `page-${p.path}`,
      label: p.label,
      hint: 'Go to page',
      icon: p.icon,
      keywords: `page ${p.label.toLowerCase()} navigate go`,
      action: () => navigate(p.path),
    }));

    const actions: CommandItem[] = [
      { id: 'add-tenant', label: 'Add Tenant', hint: 'Create new tenant', icon: Building2, keywords: 'new tenant create add register', action: () => { closePalette(); navigate('/superadmin/tenants/new'); } },
      { id: 'manage-billing', label: 'Manage Billing', hint: 'Billing overview', icon: CreditCard, keywords: 'billing payment invoice manage', action: () => { closePalette(); navigate('/superadmin/billing'); } },
      { id: 'manage-plans', label: 'Manage Plans', hint: 'Subscription plans', icon: Tag, keywords: 'plan subscription pricing manage', action: () => { closePalette(); navigate('/superadmin/plans'); } },
      { id: 'view-audit', label: 'View Audit Logs', hint: 'System audit trail', icon: ClipboardList, keywords: 'audit log trail view', action: () => { closePalette(); navigate('/superadmin/audit-logs'); } },
      { id: 'go-hrms', label: 'Switch to HRMS', hint: 'Open HRMS app', icon: Shield, keywords: 'switch hrms app go', action: () => { window.location.href = import.meta.env.VITE_HRMS_URL || 'http://localhost:5173'; } },
    ];

    return [
      { section: 'Pages', items: pages },
      { section: 'Quick Actions', items: actions },
    ];
  };

  const commands = buildCommands();
  const allItems = commands.flatMap(c => c.items);

  useEffect(() => { setActiveIndex(0); }, [searchQuery, searchOpen]);

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

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const fetchUnread = () => {
      api.get('/notifications/unread-count').then(r => setUnreadCount(r.data?.count || 0)).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = () => {
    if (showNotifications) {
      api.get('/notifications', { params: { limit: 20 } }).then(r => setNotifications(r.data || [])).catch(() => {});
    }
  };

  useEffect(() => { fetchNotifications(); }, [showNotifications]);

  const markAllRead = () => {
    api.put('/notifications/read-all').then(() => {
      setUnreadCount(0);
      fetchNotifications();
    }).catch(() => {});
  };

  const markRead = (id: number) => {
    api.put(`/notifications/${id}/read`).then(() => {
      fetchNotifications();
      setUnreadCount(c => Math.max(0, c - 1));
    }).catch(() => {});
  };

  if (!user || user.role !== 'superadmin') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-[9999]" style={{ background: 'var(--background-gradient, var(--background))' }}>
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <img src="/logo.png" alt="HRMS.Pro!" className="w-20 h-20 object-contain" />
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-xl" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight animate-brand-text">HRMS.Pro!</h1>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Loading Control Hub...</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-[bounce_1.2s_infinite]" />
              <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-[bounce_1.2s_infinite_0.15s]" />
              <span className="w-2 h-2 rounded-full bg-[#6366F1] animate-[bounce_1.2s_infinite_0.3s]" />
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#6366F1]/20 to-transparent">
          <div className="h-full w-1/3 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] rounded-full animate-[loadingBar_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex" style={{ background: 'var(--background)' }}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className="sidebar-transition fixed lg:relative z-50 h-screen flex flex-col border-r"
        style={{
          width: sidebarCollapsed ? 68 : 240,
          backgroundColor: 'var(--sidebar-bg)',
          borderColor: 'var(--sidebar-border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center px-4 border-b" style={{ height: '60px', borderColor: 'var(--sidebar-border)' }}>
          {sidebarCollapsed ? (
            <img src="/logo.png" alt="HRMS.Pro!" className="w-8 h-8 shrink-0 mx-auto" />
          ) : (
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="HRMS.Pro!" className="w-10 h-10 shrink-0 object-cover object-center" />
              <span className="font-bold text-xl leading-tight animate-brand-text sidebar-label">
                HRMS.Pro!
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {SIDEBAR_LINKS.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.end}
              className={({ isActive }) => `
                relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 ease-smooth group
                ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''}
              `}
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
              })}
              title={link.label}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-blue-500 to-indigo-500" />
                  )}
                  <link.icon className="w-5 h-5 shrink-0" />
                  {!sidebarCollapsed && <span className="sidebar-label">{link.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User Section */}
        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
            <div
              className="flex items-center gap-3 p-2.5 rounded-xl border transition-colors"
              style={{
                borderColor: 'var(--border-light)',
                backgroundColor: 'var(--surface-secondary)',
              }}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
                {(user?.fullName || 'A').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {user?.fullName || 'Admin'}
                </p>
                <p className="text-[10px] capitalize truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {user?.role || 'superadmin'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* HRMS App Link */}
        <div className="p-2 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
          <a
            href={import.meta.env.VITE_HRMS_URL || 'http://localhost:5173'}
            className={`flex items-center gap-3 p-2.5 rounded-xl text-sm font-medium transition-colors ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''}`}
            style={{ color: 'var(--sidebar-active-text)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--sidebar-active-bg)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Switch to HRMS.Pro!"
          >
            <Building2 className="w-5 h-5 shrink-0" />
            {!sidebarCollapsed && <span>Switch to HRMS.Pro!</span>}
          </a>
        </div>

        {/* Collapse Toggle */}
        <div className="hidden lg:block p-2 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg transition-all duration-200"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header
          className="h-16 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-50 border-b backdrop-blur-md"
          style={{
            backgroundColor: 'var(--header-bg)',
            borderColor: 'var(--header-border)',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl transition-colors lg:hidden"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Menu className="w-5 h-5" />
            </button>

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
                <span>Search Control Hub...</span>
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
                      <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 dark:text-blue-400 dark:hover:text-blue-300">
                        <CheckCheck className="w-3 h-3" /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No notifications</div>
                    ) : (
                      notifications.map((n: any) => (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b last:border-b-0"
                          style={{ borderColor: 'var(--border-light)' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                            <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{n.title || n.message}</p>
                            {n.message && n.title && (
                              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{n.message}</p>
                            )}
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                              {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                            </p>
                          </div>
                          {!n.is_read && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors"
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {(user?.fullName || 'A').charAt(0).toUpperCase()}
                </div>
                <span className="text-sm hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>{user.fullName || user.email}</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-elevated z-50 py-2 border animate-scale-in"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user.fullName}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
                    <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                      superadmin
                    </span>
                  </div>
                  <button
                    onClick={() => { logout(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition-colors dark:text-red-400"
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--status-inactive-bg)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
