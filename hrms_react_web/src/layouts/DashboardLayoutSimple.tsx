import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2, Users, CalendarCheck, Clock, FileText,
  Settings, LogOut, Building, Briefcase, Palmtree,
  FileBarChart, CreditCard, TrendingUp,
  Menu
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';


const SIDEBAR_LINKS = [
  { path: '/dashboard', label: 'Dashboard', icon: Building2 },
  { path: '/company', label: 'Company', icon: Building },
  { path: '/employees', label: 'Employees', icon: Users },
  { path: '/recruitment', label: 'Recruitment', icon: Briefcase },
  { path: '/holidays', label: 'Holidays', icon: Palmtree },
  { path: '/attendance', label: 'Attendance', icon: Clock },
  { path: '/leaves', label: 'Leave Management', icon: CalendarCheck },
  { path: '/payroll', label: 'Payroll & Salary', icon: FileText },
  { path: '/expenses', label: 'Expenses', icon: CreditCard },
  { path: '/performance', label: 'Performance', icon: TrendingUp },
  { path: '/reports', label: 'Reports', icon: FileBarChart },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const ROUTE_TO_MODULE: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/company': 'company',
  '/employees': 'employees',
  '/recruitment': 'recruitment',
  '/holidays': 'holidays',
  '/attendance': 'attendance',
  '/leaves': 'leaves',
  '/payroll': 'payroll',
  '/expenses': 'expenses',
  '/performance': 'performance',
  '/reports': 'reports',
  '/settings': 'settings',
};

const DashboardLayoutSimple = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user, isLoading, isAuthenticated, canAccessModule, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isLoading && !isAuthenticated && location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [isLoading, isAuthenticated, location.pathname, navigate]);

  // Redirect employees to the self-service portal
  useEffect(() => {
    if (!isLoading && user?.role === 'employee') {
      navigate('/me', { replace: true });
    }
  }, [isLoading, user, navigate]);

  const handleLogout = useCallback(() => {
    setIsLoggingOut(true);
    logout();
    navigate('/login', { replace: true });
    setTimeout(() => setIsLoggingOut(false), 500);
  }, [logout, navigate]);

  // Show logo while auth state is being resolved
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

  // Filter sidebar links based on user permissions and role
  const filteredLinks = useMemo(() => {
    if (!user) return [];

    return SIDEBAR_LINKS.filter((link) => {
      // Admin/Superadmin/HR roles see all modules
      if (['admin', 'superadmin', 'hr_admin', 'hr_manager', 'hr_executive'].includes(user.role)) {
        return true;
      }

      // Employee roles: filter by module permissions
      const module = ROUTE_TO_MODULE[link.path];
      return module ? canAccessModule(module) : false;
    });
  }, [user, canAccessModule, hasRole]);

  const currentLabel =
    SIDEBAR_LINKS.find((l) => l.path === location.pathname)?.label || 'Dashboard';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <img src="/hrms_logo1.png" alt="HRMS.Pro!" className="w-9 h-9 object-contain" />
            </div>
            {sidebarOpen && <span className="font-bold text-lg animate-brand-text">HRMS.Pro!</span>}
          </div>
        </div>

        <nav className="p-4 space-y-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full p-2 hover:bg-gray-100 rounded-lg flex items-center gap-3 text-gray-600"
          >
            <Menu className="w-5 h-5" />
            {sidebarOpen && <span>Collapse</span>}
          </button>

          {filteredLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                `flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <link.icon className="w-5 h-5" />
              {sidebarOpen && (
                <span className="text-sm font-medium">{link.label}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">{currentLabel}</h1>

          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {user.fullName || user.email}
              </span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {isLoggingOut ? 'Logging out...' : 'Logout'}
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default DashboardLayoutSimple;