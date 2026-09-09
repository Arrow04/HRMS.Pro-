import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { PageHeader } from '../components/ui/states';

export default function PostJob() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    responsibilities: '',
    requirements: '',
    benefits: '',
    company_id: '',
    role: '',
    employment_type: 'full_time',
    work_mode: 'on_site',
    experience_min: '0',
    location: '',
    city: '',
    state: '',
    skills: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.description.trim() || !form.company_id || !form.role.trim() || !form.location.trim() || !form.city.trim() || !form.state.trim()) {
      setError('Title, description, company ID, role, location, city and state are required.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/public/jobs/post', {
        title: form.title.trim(),
        description: form.description.trim(),
        responsibilities: form.responsibilities || undefined,
        requirements: form.requirements || undefined,
        benefits: form.benefits || undefined,
        company_id: Number(form.company_id),
        role: form.role.trim(),
        employment_type: form.employment_type,
        work_mode: form.work_mode,
        experience_min: Number(form.experience_min) || 0,
        skills_required: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        location: form.location.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
      });
      navigate('/jobs');
    } catch (err: any) {
      setError(err?.message || 'Failed to post job');
    } finally {
      setSubmitting(false);
    }
  };

  const input = 'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Post a Job" subtitle="Free posting — every job passes verification before going live" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job title *</label>
            <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea rows={5} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company ID *</label>
              <input type="number" className={input} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <input className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select className={input} value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
              <select className={input} value={form.work_mode} onChange={(e) => setForm({ ...form, work_mode: e.target.value })}>
                <option value="on_site">On site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min exp (yrs)</label>
              <input type="number" min={0} className={input} value={form.experience_min} onChange={(e) => setForm({ ...form, experience_min: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills (comma separated)</label>
            <input className={input} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input className={input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
              <input className={input} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50">
            {submitting ? 'Posting…' : 'Post job for verification'}
          </button>
        </form>
      </div>
    </div>
  );
}
