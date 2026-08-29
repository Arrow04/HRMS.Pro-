import { useState, useEffect } from 'react';
import { TrendingUp, Star, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee, getMyReviews, submitSelfReview } from '../../services/employeeSelfService';

const SCORES = ['technicalSkills', 'communication', 'teamwork', 'leadership', 'punctuality', 'problemSolving'];
const SCORE_LABELS: Record<string, string> = {
  technicalSkills: 'Technical Skills', communication: 'Communication', teamwork: 'Teamwork',
  leadership: 'Leadership', punctuality: 'Punctuality', problemSolving: 'Problem Solving',
};

const EmployeePerformance = () => {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({
    reviewPeriod: 'Half Yearly', reviewYear: new Date().getFullYear(),
    technicalSkills: 3, communication: 3, teamwork: 3, leadership: 3, punctuality: 3, problemSolving: 3,
    achievements: '', areasForImprovement: '',
  });

  useEffect(() => {
    getMyEmployee().then((e) => { if (e) { setEmployeeId(e.id); getMyReviews(e.id).then(setReviews); } });
  }, []);

  const handleSubmit = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      await submitSelfReview({ ...form, employeeId, reviewerId: user?.id, requestSource: 'mobile_pwa' });
      toast.success('Self-appraisal submitted');
      setShowForm(false);
      getMyReviews(employeeId).then(setReviews);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to submit');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <button onClick={() => setShowForm(!showForm)} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-violet-600 text-white rounded-2xl font-semibold hover:bg-violet-700 transition-colors">
        <Plus className="w-5 h-5" /> {showForm ? 'Cancel' : 'Self Appraisal'}
      </button>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Period</label>
              <input value={String(form.reviewPeriod)} onChange={(e) => setForm({ ...form, reviewPeriod: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Year</label>
              <input type="number" value={Number(form.reviewYear)} onChange={(e) => setForm({ ...form, reviewYear: Number(e.target.value) })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
            </div>
          </div>
          {SCORES.map((s) => (
            <div key={s} className="flex items-center justify-between">
              <span className="text-sm text-slate-600">{SCORE_LABELS[s]}</span>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map((n) => (
                  <button key={n} type="button" onClick={() => setForm({ ...form, [s]: n })}>
                    <Star className={`w-5 h-5 ${Number(form[s]) >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Achievements</label>
            <textarea value={String(form.achievements)} onChange={(e) => setForm({ ...form, achievements: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Areas for improvement</label>
            <textarea value={String(form.areasForImprovement)} onChange={(e) => setForm({ ...form, areasForImprovement: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
          </div>
          <button onClick={handleSubmit} disabled={saving} className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-60">
            {saving ? 'Submitting...' : 'Submit Appraisal'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-3">My Reviews</p>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-400">No reviews yet</p>
        ) : (
          <div className="space-y-2">
            {reviews.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-violet-600" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{String(r.reviewPeriod || 'Review')} {String(r.reviewYear || '')}</p>
                    <p className="text-xs text-slate-400 capitalize">{String(r.status || 'draft')}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-800">{r.overallScore != null ? `${Number(r.overallScore).toFixed(1)} / 5` : '-'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeePerformance;
