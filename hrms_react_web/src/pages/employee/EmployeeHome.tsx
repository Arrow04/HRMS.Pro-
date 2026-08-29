import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CalendarDays, Receipt, FileText, TrendingUp, Sun, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee, getMyAttendanceToday, getMyLeaveBalances, getUpcomingHolidays } from '../../services/employeeSelfService';
import { formatAppDate } from '../../services/appSettingsService';

const EmployeeHome = () => {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [today, setToday] = useState<Record<string, unknown> | null>(null);
  const [balances, setBalances] = useState<Record<string, unknown>[]>([]);
  const [holidays, setHolidays] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    getMyEmployee().then((e) => {
      if (e) {
        setEmployeeId(e.id);
        getMyAttendanceToday(e.id).then((rows: Record<string, unknown>[]) => {
          const active = rows.find((r) => r.status === 'present' && !r.checkOut);
          setToday(active || (rows[0] || null));
        });
        getMyLeaveBalances(e.id).then(setBalances);
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
  ];

  return (
    <div className="space-y-5">
      {/* Today status */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-2">Today</p>
        {today ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-800">Checked in {today.check_in || today.checkIn ? formatAppDate((today.check_in || today.checkIn) as string) : ''}</p>
              <p className="text-sm text-slate-500">{(today.status as string || 'present').replace('_', ' ')}</p>
            </div>
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600">{(today.check_out || today.checkOut) ? 'Checked out' : 'Working'}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No check-in yet today. Go to Attendance to check in.</p>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase mb-2">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-3 gap-3">
            {balances.slice(0, 6).map((b, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-800">{String(b.remainingDays ?? b.remaining_days ?? b.balance ?? '-')}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{String(b.leaveTypeName || b.leave_type_name || b.code || '-')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

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
