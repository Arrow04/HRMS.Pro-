import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  Shield, Building2, CreditCard, Activity, ClipboardList, Server,
  LogOut, Menu, ChevronDown, ChevronLeft, ChevronRight, Users, Tag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SIDEBAR_LINKS = [
  { path: '/superadmin', label: 'Dashboard', icon: Shield, color: 'bg-blue-500', textColor: 'text-blue-600', end: true },
  { path: '/superadmin/tenants', label: 'Tenants', icon: Building2, color: 'bg-blue-500', textColor: 'text-blue-600' },
  { path: '/superadmin/billing', label: 'Billing', icon: CreditCard, color: 'bg-green-500', textColor: 'text-green-600' },
  { path: '/superadmin/plans', label: 'Plans', icon: Tag, color: 'bg-purple-500', textColor: 'text-purple-600' },
  { path: '/superadmin/admins', label: 'Admin Users', icon: Users, color: 'bg-blue-500', textColor: 'text-blue-600' },
  { path: '/superadmin/health', label: 'Health', icon: Activity, color: 'bg-amber-500', textColor: 'text-amber-600' },
  { path: '/superadmin/audit-logs', label: 'Audit Logs', icon: ClipboardList, color: 'bg-indigo-500', textColor: 'text-indigo-600' },
  { path: '/superadmin/feature-flags', label: 'Features', icon: Server, color: 'bg-cyan-500', textColor: 'text-cyan-600' },
];

export default function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) { navigate('/login'); }
  }, [user, navigate]);

  if (!user) {
    return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="h-screen w-full bg-slate-50 flex text-slate-800">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative z-50 h-screen flex flex-col
        bg-white border-r border-gray-200
        transition-all duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[240px]'}
      `}>
        <div className="flex items-center border-b border-gray-200 px-4" style={{ height: '60px' }}>
          {sidebarCollapsed ? (
            <img src="/logo.png" alt="HRMS.Pro!" className="w-8 h-8 shrink-0 mx-auto animate-logo-spin" />
          ) : (
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="HRMS.Pro!" className="w-10 h-10 shrink-0 object-cover object-center animate-logo-spin" />
              <span className="font-bold text-xl text-gray-800 leading-tight animate-brand-text">
                HRMS.Pro!
              </span>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {SIDEBAR_LINKS.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.end}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group
                ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''}
                ${isActive
                  ? 'bg-[#EFF6FF] text-[#1C64F2]'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'}
              `}
              title={link.label}
            >
              <link.icon className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{link.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* HRMS App Link */}
        <div className="p-2 border-t border-gray-200">
          <a href={import.meta.env.VITE_HRMS_URL || 'http://localhost:5173'}
            className={`flex items-center gap-3 p-2.5 rounded-lg text-sm font-medium text-[#1C64F2] hover:bg-[#EFF6FF] transition-colors ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''}`}
            title="Switch to HRMS.Pro!">
            <Building2 className="w-5 h-5 shrink-0" />
            {!sidebarCollapsed && <span>Switch to HRMS.Pro!</span>}
          </a>
        </div>

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
        <header className="bg-white border-b border-gray-200 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-50 text-gray-600">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold text-gray-800">HRMS.Pro! Control Hub</h1>
          </div>
          <div className="relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50">
              <span className="text-sm text-gray-600">{user.fullName || user.email}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-2">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium">{user.fullName}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <button onClick={() => { logout(); }} className="w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 text-sm">
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
