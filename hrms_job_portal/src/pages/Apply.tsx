import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { apiPost } from '../lib/api';
import { loadLocalProfile } from '../lib/profile';
import UploadField from '../components/ui/UploadField';

const Apply = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const profile = loadLocalProfile();
  const [form, setForm] = useState({
    cover_letter: '',
    resume_url: profile?.resume_url || '',
    expected_salary: '',
    notice_period: '',
    current_company: '',
    current_designation: '',
    experience_years: profile ? String(profile.experience_years || '') : '',
  });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!agreed) {
      setError('Please confirm you will never pay to apply.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/public/applications', {
        job_id: Number(id),
        applicant_id: profile?.id,
        cover_letter: form.cover_letter || undefined,
        resume_url: form.resume_url || undefined,
        expected_salary: form.expected_salary ? Number(form.expected_salary) : undefined,
        notice_period: form.notice_period || undefined,
        current_company: form.current_company || undefined,
        current_designation: form.current_designation || undefined,
        experience_years: form.experience_years ? Number(form.experience_years) : undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-green-600 text-3xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
          <p className="text-gray-600 mb-6">
            The employer will review your application. Track it under Saved & Applications.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/jobs')} className="text-indigo-600 hover:text-indigo-700 font-medium">
              Browse more jobs
            </button>
            <button onClick={() => navigate('/saved')} className="text-indigo-600 hover:text-indigo-700 font-medium">
              View saved
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button onClick={() => navigate(`/jobs/${id}`)} className="text-indigo-600 hover:text-indigo-700 mb-4 text-sm font-medium">
            ← Back to job
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Apply for Job</h1>
          <p className="text-gray-600 mt-1">Free forever. Legitimate employers never ask for payment.</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!profile && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 text-sm text-indigo-900">
            Tip: <button onClick={() => navigate('/profile')} className="underline font-medium">complete your profile</button> once —
            we’ll reuse your details on every application.
          </div>
        )}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cover Letter *</label>
            <textarea
              required
              rows={5}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Why are you a good fit?"
              value={form.cover_letter}
              onChange={(e) => setForm({ ...form, cover_letter: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Resume URL</label>
            <input
              type="url"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="https://…/resume.pdf"
              value={form.resume_url}
              onChange={(e) => setForm({ ...form, resume_url: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UploadField label="Resume" kind="resume" accept=".pdf,.doc,.docx,.txt" maxMB={5} value={form.resume_url} onChange={(u) => setForm({ ...form, resume_url: u })} hint="PDF/DOC/TXT · max 5 MB — or paste a link below" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Resume link <span className="text-gray-400 font-normal">(if not uploading)</span></label>
            <input
              type="url"
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://…/resume.pdf"
              value={form.resume_url}
              onChange={(e) => setForm({ ...form, resume_url: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Expected Salary (₹)</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                value={form.expected_salary}
                onChange={(e) => setForm({ ...form, expected_salary: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Years of Experience</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                value={form.experience_years}
                onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notice Period</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm"
              placeholder="e.g. 30 days"
              value={form.notice_period}
              onChange={(e) => setForm({ ...form, notice_period: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Company</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                value={form.current_company}
                onChange={(e) => setForm({ ...form, current_company: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Designation</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm"
                value={form.current_designation}
                onChange={(e) => setForm({ ...form, current_designation: e.target.value })}
              />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <label className="text-sm text-yellow-900 flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
              I understand Jobs.Pro! is free and I will never pay, share OTP/bank PIN, or pay a deposit to apply.
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Apply;
