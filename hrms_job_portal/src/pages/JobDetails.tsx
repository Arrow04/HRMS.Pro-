import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin, Building2, ChevronRight } from 'lucide-react';
import ShareMenu from '../components/ui/ShareMenu';
import { usePageMeta, useJsonLd } from '../lib/seo';
import { apiGet, formatDate, prettify } from '../lib/api';
import type { PortalJobDetail } from '../lib/types';
import TrustChip, { companyTrustState } from '../components/trust/TrustChip';
import ReportButton from '../components/trust/ReportButton';
import { LoadingState, ErrorState } from '../components/ui/states';
import { loadSavedJobs, toggleSavedJob } from '../lib/profile';

const JobDetails = () => {
  const { id } = useParams();
  const [job, setJob] = useState<PortalJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();

  usePageMeta({
    title: job ? `${job.title} at ${job.company.name}` : 'Job details',
    description: job ? `${job.title} — ${job.company.name}, ${job.location}. Apply free on Jobs.Pro!` : undefined,
  });
  useJsonLd(
    job
      ? {
          '@context': 'https://schema.org',
          '@type': 'JobPosting',
          title: job.title,
          description: job.description?.slice(0, 500),
          employmentType: job.employment_type,
          jobLocationType: job.is_remote ? 'TELECOMMUTE' : undefined,
          address: {
            '@type': 'PostalAddress',
            addressLocality: job.city,
            addressRegion: job.state,
            addressCountry: job.country || 'IN',
          },
          hiringOrganization: { '@type': 'Organization', name: job.company.name },
          datePosted: job.published_at,
          validThrough: job.application_deadline,
        }
      : null
  );

  const daysLeft = (() => {
    if (!job?.application_deadline) return null;
    const ms = new Date(job.application_deadline).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.ceil(ms / 86400000);
  })();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<PortalJobDetail>(`/public/jobs/${id}`);
      setJob(data);
      setSaved(loadSavedJobs().includes(data.id));
    } catch (e: any) {
      setError(e?.message || 'Failed to load job');
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingState label="Loading job details..." />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorState message={error || 'Job not found'} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button onClick={() => navigate('/jobs')} className="text-indigo-600 hover:text-indigo-700 mb-4 flex items-center gap-1 text-sm font-medium">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to jobs
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 14 && (
                  <span className="text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full">
                    {daysLeft === 0 ? 'Closes today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left to apply`}
                  </span>
                )}
                {job.is_urgent && (
                  <span className="text-xs font-bold bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                    Urgently hiring
                  </span>
                )}
                {job.is_remote && (
                  <span className="text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                    Remote friendly
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mt-2">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-gray-600 text-sm">
                <span className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  <Link to={`/companies/${job.company.id}`} className="text-indigo-600 hover:text-indigo-700 font-medium">
                    {job.company.name}
                  </Link>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {job.location}
                </span>
                <TrustChip state={companyTrustState(job.company.is_verified)} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <ShareMenu title={job.title} text={`${job.company.name} • ${job.location}`} />
              <ReportButton kind="job" id={job.id} />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={() => navigate(`/jobs/${job.id}/apply`)}
              className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.99]"
            >
              Apply Now — free, never pay to apply
            </button>
            <button
              onClick={() => setSaved(toggleSavedJob(job.id).includes(job.id))}
              className="px-6 py-3.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              {saved ? '★ Saved' : '☆ Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(job.salary_min || job.salary_max) && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
            <p className="text-sm text-indigo-900">
              <span className="font-semibold">Salary:</span> ₹{(job.salary_min || 0).toLocaleString()}
              {job.salary_max ? ` – ₹${job.salary_max.toLocaleString()}` : '+'}
              {job.application_deadline ? ` • Apply by ${formatDate(job.application_deadline)}` : ''}
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
            <Building2 className="w-7 h-7 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Hiring company</p>
            <Link to={`/companies/${job.company.id}`} className="font-bold text-gray-900 hover:text-indigo-600">
              {job.company.name}
            </Link>
            <p className="text-sm text-gray-500">
              {[job.company.industry, job.company.city].filter(Boolean).join(' • ') || 'Verified employer'}
            </p>
          </div>
          <TrustChip state={companyTrustState(job.company.is_verified)} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Job Description</h2>
          <p className="text-gray-700 whitespace-pre-line">{job.description}</p>
        </div>

        {job.responsibilities && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Responsibilities</h2>
            <p className="text-gray-700 whitespace-pre-line">{job.responsibilities}</p>
          </div>
        )}

        {job.requirements && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Requirements</h2>
            <p className="text-gray-700 whitespace-pre-line">{job.requirements}</p>
          </div>
        )}

        {job.benefits && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Benefits</h2>
            <p className="text-gray-700 whitespace-pre-line">{job.benefits}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Job Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Employment Type</p>
              <p className="font-medium text-gray-900">{prettify(job.employment_type)}</p>
            </div>
            {job.work_mode && (
              <div>
                <p className="text-gray-500">Work Mode</p>
                <p className="font-medium text-gray-900">{prettify(job.work_mode)}</p>
              </div>
            )}
            {job.experience_min != null && (
              <div>
                <p className="text-gray-500">Experience</p>
                <p className="font-medium text-gray-900">
                  {job.experience_min}+ years{job.experience_max ? ` (up to ${job.experience_max})` : ''}
                </p>
              </div>
            )}
            <div>
              <p className="text-gray-500">Published</p>
              <p className="font-medium text-gray-900">{formatDate(job.published_at)}</p>
            </div>
          </div>
          {(job.skills_required?.length || 0) > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">Skills Required</p>
              <div className="flex flex-wrap gap-2">
                {job.skills_required!.map((skill, idx) => (
                  <span key={idx} className="bg-indigo-50 text-indigo-700 text-xs px-3 py-1 rounded-full font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="rounded-2xl bg-indigo-950 text-white p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-bold text-lg">Ready when you are</p>
            <p className="text-sm text-indigo-200">Free forever. Genuine employers never ask for money.</p>
          </div>
          <button
            onClick={() => navigate(`/jobs/${job.id}/apply`)}
            className="bg-white text-indigo-950 px-6 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors shrink-0"
          >
            Apply Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobDetails;
