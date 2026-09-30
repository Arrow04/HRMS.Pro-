import { useState, useEffect } from 'react';
import { Receipt, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMyEmployee, getExpenseCategories, getMyExpenses, submitExpense } from '../../services/employeeSelfService';
import { formatAppDate } from '../../services/appSettingsService';
import { getAppCurrency, getCurrencySymbol } from '../../services/currencyService';

const EmployeeExpenses = () => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Record<string, unknown>[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: '', amount: '', expenseDate: '', description: '', vendor: '' });
  const symbol = getCurrencySymbol(getAppCurrency());

  const refresh = (eid: number) => getMyExpenses(eid).then(setExpenses);

  useEffect(() => {
    getMyEmployee().then((e) => { if (e) { setEmployeeId(e.id); refresh(e.id); } });
    getExpenseCategories().then(setCategories);
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await submitExpense({
        employeeId,
        category: form.category,
        amount: parseFloat(form.amount),
        expenseDate: form.expenseDate,
        description: form.description,
        vendor: form.vendor,
        currency: getAppCurrency(),
        requestSource: 'mobile_pwa',
      });
      toast.success('Expense submitted');
      setShowForm(false);
      setForm({ category: '', amount: '', expenseDate: '', description: '', vendor: '' });
      if (employeeId) refresh(employeeId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to submit expense');
    } finally { setSaving(false); }
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { approved: 'bg-emerald-50 text-emerald-600', reimbursed: 'bg-blue-50 text-blue-600', rejected: 'bg-red-50 text-red-600', pending: 'bg-amber-50 text-amber-600' };
    return map[s] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-5">
      <button onClick={() => setShowForm(!showForm)} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-amber-600 text-white rounded-2xl font-semibold hover:bg-amber-700 transition-colors">
        <Plus className="w-5 h-5" /> {showForm ? 'Cancel' : 'Submit Expense'}
      </button>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
                <option value="">Select</option>
                {categories.map((c, i) => (
                  <option key={i} value={String(c.code || c.value || '')}>{String(c.name || c.label || c.code || '')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Amount ({symbol})</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Date</label>
            <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" placeholder="What was this for?" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor (optional)</label>
            <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
          </div>
          <button onClick={handleSubmit} disabled={saving} className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-60">
            {saving ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-3">My Expenses</p>
        {expenses.length === 0 ? (
          <p className="text-sm text-slate-400">No expenses submitted yet</p>
        ) : (
          <div className="space-y-2">
            {expenses.map((e, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center"><Receipt className="w-4 h-4 text-amber-600" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 capitalize">{String(e.category)}</p>
                    <p className="text-xs text-slate-400">{formatAppDate(e.expenseDate as string)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{symbol}{Number(e.amount || 0).toLocaleString()}</p>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(String(e.status || 'pending'))}`}>{String(e.status || 'pending')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeExpenses;
