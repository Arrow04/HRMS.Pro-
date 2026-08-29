import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  BarChart3, Users, CalendarCheck, Clock, FileText,
  Settings, Building, Briefcase, Palmtree,
  FileBarChart, CreditCard, TrendingUp, Database,
  ShieldAlert, Wallet, LogOut, Monitor,
  ChevronLeft, ChevronRight, ChevronDown, Building2
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
  };

  if (isLoading || !user) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#FAFBFE] z-[9999]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-20 h-20 object-contain" />
            <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-xl" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">HRMS<span className="text-[#6366F1]">.Pro!</span></h1>
            <p className="text-lg font-bold text-[#0F172A]">Setting your workspace in motion….</p>
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
    // Plan gating: admins/superadmins see modules included in their plan.
    const features = user.planFeatures;
    const planAllows = (moduleId: string) =>
      !features || !Array.isArray(features) || features.length === 0 || features.includes(moduleId);
    // Admin & Superadmin see every module their plan includes
    if (user.role === 'admin' || user.role === 'superadmin') {
      return ALL_LINKS.filter(l => planAllows(routeToModule[l.path]));
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
    <div className="h-screen w-full bg-[#F1F5F9] flex">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative z-50 h-screen flex flex-col bg-white border-r border-gray-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          width: sidebarCollapsed ? 68 : 240,
        }}
      >
        {/* Logo */}
        <div className="flex items-center border-b border-gray-200 px-4 shrink-0 overflow-hidden" style={{ height: '60px' }}>
          <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-10 h-10 shrink-0 object-cover object-center" />
          {!sidebarCollapsed && (
            <span className="ml-3 font-bold text-xl text-gray-800 leading-tight whitespace-nowrap animate-brand-text">
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
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium group
                ${isActive
                  ? 'bg-[#EFF6FF] text-[#1C64F2]'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'}
              `}
              title={sidebarCollapsed ? link.label : ''}
            >
              <link.icon className="w-5 h-5 shrink-0" />
              <span
                className="whitespace-nowrap overflow-hidden"
                style={{
                  opacity: sidebarCollapsed ? 0 : 1,
                  width: sidebarCollapsed ? 0 : 'auto',
                  display: 'inline-block',
                }}
              >
                {link.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Collapse Toggle */}
        <div className="hidden lg:block p-2 border-t border-gray-200">
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <AppHeader onToggleSidebar={() => setSidebarOpen(true)} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
        <Chatbot />
      </div>
    </div>
  );
};

export default DashboardLayout;
