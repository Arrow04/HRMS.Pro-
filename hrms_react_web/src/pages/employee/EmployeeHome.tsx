import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CalendarDays, Receipt, FileText, TrendingUp, Sun, ChevronRight, Wallet, CheckCircle, AlertCircle, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee, getMyAttendanceToday, getMyLeaveBalances, getMyLeaves, getMyExpenses, getMyPayroll, getUpcomingHolidays } from '../../services/employeeSelfService';
import { formatTime } from '../../utils/formatUtils';

const EmployeeHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [today, setToday] = useState<Record<string, unknown> | null>(null);
  const [balances, setBalances] = useState<Record<string, unknown>[]>([]);
  const [holidays, setHolidays] = useState<Record<string, unknown>[]>([]);
  const [recentLeaves, setRecentLeaves] = useState<Record<string, unknown>[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Record<string, unknown>[]>([]);
  const [payroll, setPayroll] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getMyEmployee().then((e) => {
      if (e) {
        setEmployeeId(e.id);
        getMyAttendanceToday(e.id).then((rows: Record<string, unknown>[]) => {
          const active = rows.find((r) => r.status === 'present' && !r.checkOut);
          setToday(active || (rows[0] || null));
        });
        getMyLeaveBalances(e.id).then(setBalances);
        getMyLeaves(e.id).then((leaves: Record<string, unknown>[]) => {
          setRecentLeaves(leaves.slice(0, 3));
        });
        getMyExpenses(e.id).then((expenses: Record<string, unknown>[]) => {
          setRecentExpenses(expenses.slice(0, 3));
        });
        getMyPayroll(e.id).then((pay: Record<string, unknown> | Record<string, unknown>[]) => {
          const arr = Array.isArray(pay) ? pay : [];
          setPayroll(arr.length > 0 ? arr[0] : null);
        });
      }
    });
    getUpcomingHolidays().then(setHolidays);
  }, []);

  const actions = [
    { label: 'Check In', desc: 'Mark attendance', icon: Clock, to: '/me/attendance', color: 'bg-blue-500' },
    { label: 'Apply Leave', desc: 'Request time off', icon: CalendarDays, to: '/me/leaves', color: 'bg-emerald-500' },
    { label: 'Submit Expense', desc: 'Claim reimbursement', icon: Receipt, to: '/me/expenses', color: 'bg-amber-500' },
    { label: 'My Payslips', desc: 'View salary slips', icon: FileText, to: '/me/payslips', color: 'bg-violet-500' },
    { label: 'Tax Declarations', desc: 'Investments for TDS', icon: FileText, to: '/me/tax-declarations', color: 'bg-amber-600' },
    { label: 'My Profile', desc: 'View personal info', icon: User, to: '/me/profile', color: 'bg-slate-500' },
  ];

  const pendingLeaves = recentLeaves.filter((l) => l.status === 'pending').length;
  const pendingExpenses = recentExpenses.filter((e) => e.status === 'pending').length;

  return (
    <div className="space-y-5">
      {/* Welcome + Today status */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white">
        <p className="text-sm font-medium text-blue-100">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'},</p>
        <p className="text-lg font-bold mt-1">{user?.fullName || 'Employee'}</p>
        {today ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="px-2 py-1 rounded-lg bg-white/20 text-xs font-medium">
              Checked in at {formatTime(today.check_in || today.checkIn as string)}
            </span>
            {(today.check_out || today.checkOut) ? (
              <span className="px-2 py-1 rounded-lg bg-emerald-500/30 text-xs font-medium">
                Checked out at {formatTime(today.check_out || today.checkOut as string)}
              </span>
            ) : (
              <span className="px-2 py-1 rounded-lg bg-white/20 text-xs font-medium animate-pulse">Working</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-blue-100 mt-2">No check-in yet today</p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => navigate('/me/leaves')} className="bg-white rounded-2xl border border-slate-100 p-4 text-left hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-slate-800">{pendingLeaves}</span>
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Pending Leaves</p>
        </button>
        <button onClick={() => navigate('/me/expenses')} className="bg-white rounded-2xl border border-slate-100 p-4 text-left hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-slate-800">{pendingExpenses}</span>
            <Receipt className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Pending Expenses</p>
        </button>
        <button onClick={() => navigate('/me/payslips')} className="bg-white rounded-2xl border border-slate-100 p-4 text-left hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-slate-800">{payroll ? '1' : '0'}</span>
            <Wallet className="w-5 h-5 text-violet-500" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Latest Payslip</p>
        </button>
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase mb-2">Quick Actions</p>
        <div className="grid grid-cols-3 gap-3">
          {actions.map((a) => (
            <button key={a.label} onClick={() => navigate(a.to)} className="bg-white rounded-2xl border border-slate-100 p-4 text-left hover:border-blue-200 hover:shadow-md transition-all">
              <div className={`w-10 h-10 ${a.color} rounded-xl flex items-center justify-center mb-3`}>
                <a.icon className="w-5 h-5 text-white" />
              </div>
              <p className="font-semibold text-sm text-slate-800">{a.label}</p>
              <p className="text-xs text-slate-400">{a.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Leave balances */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-slate-400 uppercase">Leave Balance</p>
          <button onClick={() => navigate('/me/leaves')} className="flex items-center text-xs text-blue-600 font-medium"><ChevronRight className="w-3 h-3" /> More</button>
        </div>
        {balances.length === 0 ? (
          <p className="text-sm text-slate-400">No leave balance available</p>
        ) : (
          <div className="space-y-2">
            {balances.slice(0, 5).map((b, i) => {
              const total = Number(b.totalDays ?? b.total_days ?? b.allocated ?? 0);
              const used = Number(b.usedDays ?? b.used_days ?? b.taken ?? 0);
              const remaining = Number(b.remainingDays ?? b.remaining_days ?? b.balance ?? 0);
              const pct = total > 0 ? Math.round((used / total) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-700">{String(b.leaveTypeName || b.leave_type_name || b.code || '-')}</p>
                      <p className="text-xs text-slate-400">{used}/{total} used</p>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-800 w-8 text-right">{remaining}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent leaves */}
      {recentLeaves.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-400 uppercase">Recent Leave Requests</p>
            <button onClick={() => navigate('/me/leaves')} className="flex items-center text-xs text-blue-600 font-medium"><ChevronRight className="w-3 h-3" /> View All</button>
          </div>
          <div className="space-y-2">
            {recentLeaves.map((l, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-700">{String(l.leaveTypeName || l.leave_type_name || 'Leave')}</p>
                  <p className="text-xs text-slate-400">{String(l.startDate || l.start_date || '')} - {String(l.endDate || l.end_date || '')}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(l.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : l.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}`}>{String(l.status || 'pending')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holidays */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-3">Upcoming Holidays</p>
        {holidays.length === 0 ? (
          <p className="text-sm text-slate-400">No upcoming holidays</p>
        ) : (
          <div className="space-y-2">
            {holidays.slice(0, 4).map((h, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center"><Sun className="w-4 h-4 text-amber-500" /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{String(h.name)}</p>
                  <p className="text-xs text-slate-400">{formatAppDate(h.date as string)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance link */}
      <button onClick={() => navigate('/me/performance')} className="w-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-4 text-white flex items-center gap-3 hover:opacity-95 transition-opacity">
        <TrendingUp className="w-5 h-5" />
        <div className="flex-1 text-left">
          <p className="font-semibold text-sm">My Performance</p>
          <p className="text-xs text-violet-100">View reviews & self-appraisal</p>
        </div>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default EmployeeHome;
