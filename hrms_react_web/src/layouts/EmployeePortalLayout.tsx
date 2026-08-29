import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Clock, CalendarDays, Receipt, FileText, User, LogOut,
  Sparkles, TrendingUp, Globe, Bell, CheckCheck, Loader2, CheckCircle2, XCircle, CreditCard, CalendarCheck, FileDown, Calculator, Landmark,
} from 'lucide-react';
import { formatAppDateLong, formatAppDateTime } from '../services/appSettingsService';
import api from '../services/api';
import type { Notification } from '../types';

const NAV = [
  { to: '/me', label: 'Home', icon: LayoutDashboard },
  { to: '/me/attendance', label: 'Attendance', icon: Clock },
  { to: '/me/leaves', label: 'Leave', icon: CalendarDays },
  { to: '/me/expenses', label: 'Expenses', icon: Receipt },
  { to: '/me/payslips', label: 'Salary', icon: FileText },
  { to: '/me/performance', label: 'Performance', icon: TrendingUp },
  { to: '/me/tax-declarations', label: 'Tax', icon: Landmark },
  { to: '/me/profile', label: 'Profile', icon: User },
];

const TYPE_STYLE: Record<string, { icon: React.ElementType; cls: string }> = {
  leave: { icon: CalendarCheck, cls: 'bg-[#EFF6FF] text-[#1C64F2]' },
  expense: { icon: CreditCard, cls: 'bg-[#F5F3FF] text-[#7C3AED]' },
  payroll: { icon: FileDown, cls: 'bg-[#ECFDF5] text-[#059669]' },
  attendance: { icon: Clock, cls: 'bg-[#FFF7ED] text-[#D97706]' },
  performance: { icon: TrendingUp, cls: 'bg-[#ECFDF5] text-[#059669]' },
};

const EmployeePortalLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
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
    enabled: showNotifs,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
      if ((e.target as HTMLElement).closest('button')) return;
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = (user?.fullName || user?.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const TypeIcon = (type: string) => TYPE_STYLE[type]?.icon || Bell;

  return (
    <div className="min-h-screen bg-[#F1F5F9] max-w-lg mx-auto shadow-2xl relative flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1C64F2] to-[#1E40AF] text-white px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center font-bold">
              {initials}
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">{user?.fullName || user?.email?.split('@')[0]}</p>
              <p className="text-xs text-blue-100 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Employee Self-Service</p>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <div ref={notifRef} className="relative">
              <button onClick={() => setShowNotifs(!showNotifs)} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors relative">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div className="absolute right-0 top-11 w-72 bg-white rounded-xl shadow-xl border border-slate-100 max-h-96 flex flex-col z-30 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                    {notifications.length > 0 && (
                      <button onClick={() => markAllRead.mutate()} className="text-xs text-[#1C64F2] flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {notifLoading ? (
                      null
                    ) : notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-400">No notifications</div>
                    ) : (
                      notifications.map((n: Notification) => {
                        const ntype = n.type || 'system';
                        const Icon = TypeIcon(ntype);
                        const style = TYPE_STYLE[ntype] || { icon: Bell, cls: 'bg-slate-100 text-slate-500' };
                        return (
                          <div key={n.id} className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer ${!n.isRead ? 'bg-[#F0F7FF]' : 'hover:bg-slate-50'}`}
                            onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}>
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.cls}`}>
                              <Icon className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">{n.title}</p>
                              {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                              <p className="text-[10px] text-slate-400 mt-1">
                                {n.createdAt ? formatAppDateTime(n.createdAt) : ''}
                              </p>
                            </div>
                            {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#1C64F2] mt-1.5 shrink-0" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setMenuOpen(!menuOpen)} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-30">
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-blue-100 mt-3 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> {formatAppDateLong(new Date())}
        </p>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-4 pb-28">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-20 bg-white border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.05)]">
        <div className="grid grid-cols-7">
          {NAV.map((item) => {
            const active = location.pathname === item.to;
            return (
              <NavLink key={item.to} to={item.to} className="flex flex-col items-center gap-0.5 py-2.5">
                <item.icon className={`w-5 h-5 ${active ? 'text-[#1C64F2]' : 'text-[#94A3B8]'}`} />
                <span className={`text-[10px] font-medium ${active ? 'text-[#1C64F2]' : 'text-[#94A3B8]'}`}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default EmployeePortalLayout;
