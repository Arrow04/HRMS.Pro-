import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { PageHeader } from '../components/ui/states';

export default function Report() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    reporter_name: '',
    reporter_email: '',
    reportable_type: params.get('type') || 'job',
    reportable_id: Number(params.get('id') || 0),
    reason: 'suspected_fraud',
    description: '',
    evidence_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.reporter_name.trim() || !form.reporter_email.includes('@') || !form.description.trim()) {
      setError('Name, valid email and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/public/reports', {
        ...form,
        reporter_name: form.reporter_name.trim(),
        reporter_email: form.reporter_email.trim(),
        reportable_id: Number(form.reportable_id) || 0,
        reason: form.reason.trim(),
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const input = 'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500';

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900">Report received</h1>
          <p className="text-gray-600 mt-2 text-sm">Our trust team reviews every report within 24 hours. Thank you for keeping Jobs.Pro! safe.</p>
          <button onClick={() => navigate('/safety')} className="mt-6 text-indigo-600 font-medium hover:text-indigo-700">
            Back to Safety Center
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Report a scam" subtitle="Reports are reviewed within 24 hours" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
              <input className={input} value={form.reporter_name} onChange={(e) => setForm({ ...form, reporter_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your email *</label>
              <input type="email" className={input} value={form.reporter_email} onChange={(e) => setForm({ ...form, reporter_email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select className={input} value={form.reportable_type} onChange={(e) => setForm({ ...form, reportable_type: e.target.value })}>
                <option value="job">Job</option>
                <option value="company">Company</option>
                <option value="user">User</option>
                <option value="gig">Gig</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference ID</label>
              <input type="number" className={input} value={form.reportable_id} onChange={(e) => setForm({ ...form, reportable_id: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <select className={input} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                <option value="suspected_fraud">Suspected fraud</option>
                <option value="asks_for_money">Asks for money</option>
                <option value="fake_company">Fake company</option>
                <option value="wrong_candidate">Fraudulent candidate</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What happened? *</label>
            <textarea rows={5} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Evidence URL (optional)</label>
            <input type="url" className={input} placeholder="https://…" value={form.evidence_url} onChange={(e) => setForm({ ...form, evidence_url: e.target.value })} />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </form>
      </div>
    </div>
  );
}
