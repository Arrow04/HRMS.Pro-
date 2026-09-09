import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { loadLocalProfile } from '../lib/profile';
import { GIG_CATEGORIES } from '../lib/types';
import { PageHeader } from '../components/ui/states';

export default function PostGig() {
  const navigate = useNavigate();
  const profile = loadLocalProfile();
  const [form, setForm] = useState({
    title: '', description: '', deliverables: '', category: 'general',
    skills: '', budget_min: '', budget_max: '', budget_type: 'fixed',
    delivery_days: '', location: '', is_remote: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ id: number }>('/public/gigs/post', {
        title: form.title.trim(),
        description: form.description.trim(),
        deliverables: form.deliverables.trim() || undefined,
        category: form.category,
        skills_required: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        budget_min: form.budget_min ? Number(form.budget_min) : undefined,
        budget_max: form.budget_max ? Number(form.budget_max) : undefined,
        budget_type: form.budget_type,
        delivery_days: form.delivery_days ? Number(form.delivery_days) : undefined,
        client_id: profile?.id,
        client_name: profile?.full_name,
        location: form.location.trim() || undefined,
        is_remote: form.is_remote,
      });
      navigate(`/gigs/${res.id}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to post gig');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Post a gig" subtitle="Fixed-price or hourly — proposals land in My Work" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gig title *</label>
            <input className={inputCls} placeholder="e.g. Design a wedding logo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea rows={5} className={inputCls} placeholder="Scope, context, what good looks like…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deliverables <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={3} className={inputCls} placeholder="Files, formats, revisions…" value={form.deliverables} onChange={(e) => setForm({ ...form, deliverables: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {GIG_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget type</label>
              <select className={inputCls} value={form.budget_type} onChange={(e) => setForm({ ...form, budget_type: e.target.value })}>
                <option value="fixed">Fixed price</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery (days)</label>
              <input type="number" min={1} className={inputCls} value={form.delivery_days} onChange={(e) => setForm({ ...form, delivery_days: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget min (₹)</label>
              <input type="number" min={0} className={inputCls} value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget max (₹)</label>
              <input type="number" min={0} className={inputCls} value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills (comma separated)</label>
            <input className={inputCls} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input className={inputCls} placeholder="City or blank for remote" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
              <input type="checkbox" checked={form.is_remote} onChange={(e) => setForm({ ...form, is_remote: e.target.checked })} className="w-4 h-4" />
              Remote-friendly gig
            </label>
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 font-semibold disabled:opacity-50">
            {submitting ? 'Posting…' : 'Post gig'}
          </button>
        </form>
      </div>
    </div>
  );
}
