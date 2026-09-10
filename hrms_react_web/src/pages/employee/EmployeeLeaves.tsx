import { useState, useEffect } from 'react';
import { CalendarDays, Plus, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee, getLeaveTypes, getMyLeaveBalances, getMyLeaves, applyLeave } from '../../services/employeeSelfService';
import { formatAppDate } from '../../services/appSettingsService';

const EmployeeLeaves = () => {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [types, setTypes] = useState<Record<string, unknown>[]>([]);
  const [balances, setBalances] = useState<Record<string, unknown>[]>([]);
  const [leaves, setLeaves] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });

  const refresh = (eid: number) => {
    getMyLeaveBalances(eid).then(setBalances);
    getMyLeaves(eid).then(setLeaves);
  };

  useEffect(() => {
    getMyEmployee().then((e) => { if (e) { setEmployeeId(e.id); refresh(e.id); } });
    getLeaveTypes().then(setTypes);
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await applyLeave({
        employeeId,
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        requestSource: 'mobile_pwa',
      });
      toast.success('Leave applied');
      setShowForm(false);
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      if (employeeId) refresh(employeeId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to apply leave');
    } finally { setSaving(false); }
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { approved: 'bg-emerald-50 text-emerald-600', rejected: 'bg-red-50 text-red-600', pending: 'bg-amber-50 text-amber-600' };
    return map[s] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-5">
      {/* Balances */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-3">Leave Balance</p>
        {balances.length === 0 ? (
          <p className="text-sm text-slate-400">No balance available</p>
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

      {/* Apply button */}
      <button onClick={() => setShowForm(!showForm)} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-emerald-600 text-white rounded-2xl font-semibold hover:bg-emerald-700 transition-colors">
        <Plus className="w-5 h-5" /> {showForm ? 'Cancel' : 'Apply for Leave'}
      </button>

      {/* Apply form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Leave Type</label>
            <select value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
              <option value="">Select type</option>
              {types.map((t) => (
                <option key={String(t.id)} value={String(t.id)}>{String(t.name)} ({String(t.code)})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">From</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">To</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" placeholder="Optional reason" />
          </div>
          <button onClick={handleSubmit} disabled={saving} className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-60">
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      )}

      {/* My leaves */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-3">My Leave Requests</p>
        {leaves.length === 0 ? (
          <p className="text-sm text-slate-400">No leave requests yet</p>
        ) : (
          <div className="space-y-2">
            {leaves.map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center"><CalendarDays className="w-4 h-4 text-blue-600" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{String(l.leaveType || l.leaveTypeName || l.leave_type_name || 'Leave')}</p>
                    <p className="text-xs text-slate-400">{formatAppDate(l.startDate as string)} → {formatAppDate(l.endDate as string)}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(String(l.status || 'pending'))}`}>{String(l.status || 'pending')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeLeaves;
