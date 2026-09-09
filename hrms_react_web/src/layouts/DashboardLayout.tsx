import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  BarChart3, Users, CalendarCheck, Clock, FileText,
  Settings, Building, Briefcase, Palmtree,
  FileBarChart, CreditCard, TrendingUp, Database,
  ShieldAlert, Wallet, LogOut, Monitor,
  ChevronLeft, ChevronRight, Building2, Megaphone, AlertTriangle,
  Bell
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import Chatbot from '../components/Chatbot';

const ALL_LINKS = [
  { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { path: '/company', label: 'Company', icon: Building },
  { path: '/recruitment', label: 'Recruitment', icon: Briefcase },
  { path: '/employees', label: 'Employees', icon: Users },
  { path: '/attendance', label: 'Attendance', icon: Clock },
  { path: '/leaves', label: 'Leaves', icon: CalendarCheck },
  { path: '/holidays', label: 'Holidays', icon: Palmtree },
  { path: '/expenses', label: 'Expenses', icon: CreditCard },
  { path: '/assets', label: 'Assets', icon: Monitor },
  { path: '/performance', label: 'Performance', icon: TrendingUp },
  { path: '/payroll', label: 'Payroll', icon: Wallet },
  { path: '/exit-management', label: 'Exits', icon: LogOut },
  { path: '/anomalies', label: 'Anomalies', icon: ShieldAlert },
  { path: '/reports', label: 'Reports', icon: FileBarChart },
  { path: '/announcements', label: 'Announcements', icon: Megaphone },
  { path: '/grievances', label: 'Grievances', icon: AlertTriangle },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/master-data', label: 'Master Data', icon: Database },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, isLoading, canAccessModule } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) { navigate('/login'); }
  }, [user, isLoading, navigate]);

  const location = useLocation();
  useEffect(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  }, [location.pathname]);

  const routeToModule: Record<string, string> = {
    '/dashboard': 'dashboard', '/company': 'company', '/employees': 'employees',
    '/recruitment': 'recruitment', '/holidays': 'holidays', '/attendance': 'attendance',
    '/leaves': 'leaves', '/payroll': 'payroll', '/expenses': 'expenses',
    '/performance': 'performance', '/reports': 'reports', '/master-data': 'master_data',
    '/settings': 'settings', '/exit-management': 'exit', '/assets': 'assets',
    '/anomalies': 'anomalies', '/payroll/config': 'payroll_config',
    '/announcements': 'announcements', '/grievances': 'grievances', '/notifications': 'notifications',
  };

  if (isLoading || !user) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-[9999]" style={{ background: 'var(--background-gradient)' }}>
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-20 h-20 object-contain" />
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-xl" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight animate-brand-text">HRMS.Pro!</h1>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Setting your workspace in motion...</p>
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

  const getFilteredSidebarLinks = () => {
    if (!user) return [];
    const features = user.planFeatures;
    const planAllows = (moduleId: string) => {
      if (!features || !Array.isArray(features) || features.length === 0) return true;
      if (features.includes('*') || features.includes('all')) return true;
      return features.includes(moduleId);
    };
    if (user.role === 'admin' || user.role === 'superadmin' || user.role === 'hr_admin' || user.role === 'hr_manager') {
      return ALL_LINKS;
    }
    if (user.role === 'employee' && (!user.allowedModules || user.allowedModules.length === 0)) {
      return ALL_LINKS.filter(l =>
        ['/dashboard', '/attendance', '/leaves', '/payroll', '/expenses', '/holidays', '/profile', '/settings'].includes(l.path)
        && planAllows(routeToModule[l.path])
      );
    }
    return ALL_LINKS.filter(link => {
      const module = routeToModule[link.path];
      return module && canAccessModule(module);
    });
  };

  return (
    <div className="h-screen w-full flex" style={{ background: 'var(--background)' }}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" onClick={() => setSidebarOpen(false)} />
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
        <div className="flex items-center px-4 shrink-0 overflow-hidden border-b" style={{ height: '60px', borderColor: 'var(--sidebar-border)' }}>
          <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-10 h-10 shrink-0 object-cover object-center" />
          {!sidebarCollapsed && (
            <span className="ml-3 font-bold text-xl leading-tight whitespace-nowrap animate-brand-text sidebar-label">
              HRMS.Pro!
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {getFilteredSidebarLinks().map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => `
                relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium group
                transition-all duration-200 ease-smooth
                ${isActive
                  ? ''
                  : ''}
              `}
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
              })}
              title={sidebarCollapsed ? link.label : ''}
            >
              {/* Active indicator bar */}
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-blue-500 to-indigo-500 transition-all duration-300"
                    />
                  )}
                  <link.icon
                    className="w-5 h-5 shrink-0 transition-colors duration-200"
                    style={{ color: 'inherit' }}
                  />
                  <span
                    className="whitespace-nowrap overflow-hidden sidebar-label"
                    style={{
                      opacity: sidebarCollapsed ? 0 : 1,
                      width: sidebarCollapsed ? 0 : 'auto',
                      display: 'inline-block',
                    }}
                  >
                    {link.label}
                  </span>
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
                {(user?.fullName || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {user?.fullName || 'User'}
                </p>
                <p className="text-[10px] capitalize truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {user?.role || 'Admin'}
                </p>
              </div>
            </div>
          </div>
        )}

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
        <AppHeader onToggleSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
        <Chatbot />
      </div>
    </div>
  );
};

export default DashboardLayout;
