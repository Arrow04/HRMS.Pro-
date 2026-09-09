import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { loadAlertEmail, saveAlertEmail } from '../lib/profile';
import type { PortalJobSummary } from '../lib/types';
import JobCard from '../components/cards/JobCard';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui/states';

const PAGE_SIZE = 20;

const Jobs = () => {
  const [jobs, setJobs] = useState<PortalJobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('search') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [remoteOnly, setRemoteOnly] = useState(searchParams.get('remote') === '1');
  const [alertEmail, setAlertEmail] = useState(loadAlertEmail());
  const [alertMsg, setAlertMsg] = useState('');
  const [alertBusy, setAlertBusy] = useState(false);
  const page = Math.max(0, Number(searchParams.get('page') || 0));

  const createAlert = async () => {
    setAlertMsg('');
    if (!alertEmail.includes('@')) {
      setAlertMsg('Enter a valid email to create the alert.');
      return;
    }
    setAlertBusy(true);
    try {
      const res = await apiPost<{ message: string }>('/public/alerts', {
        email: alertEmail.trim(),
        search: searchParams.get('search') || undefined,
        location: searchParams.get('location') || undefined,
        remote_only: searchParams.get('remote') === '1',
      });
      saveAlertEmail(alertEmail.trim());
      setAlertMsg(res.message || 'Alert created.');
    } catch (e: any) {
      setAlertMsg(e?.message || 'Failed to create alert');
    } finally {
      setAlertBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      q.set('limit', String(PAGE_SIZE));
      q.set('offset', String(page * PAGE_SIZE));
      const s = searchParams.get('search');
      const l = searchParams.get('location');
      if (s) q.set('search', s);
      if (l) q.set('location', l);
      if (searchParams.get('remote') === '1') q.set('is_remote', 'true');
      const data = await apiGet<{ jobs: PortalJobSummary[]; total: number }>(`/public/jobs?${q.toString()}`);
      setJobs(data.jobs || []);
      setTotal(data.total ?? (data.jobs || []).length);
    } catch (e: any) {
      setError(e?.message || 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (keyword.trim()) next.set('search', keyword.trim());
    if (location.trim()) next.set('location', location.trim());
    if (remoteOnly) next.set('remote', '1');
    next.set('page', '0');
    setSearchParams(next);
  };

  const clearFilters = () => {
    setKeyword('');
    setLocation('');
    setRemoteOnly(false);
    setSearchParams(new URLSearchParams());
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Browse Jobs" subtitle="Verified openings from the Jobs.Pro! community" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={applyFilters} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Job title, keyword, or company"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 px-1">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            Remote only
          </label>
          <button type="submit" className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">
            Search
          </button>
          <button type="button" onClick={clearFilters} className="text-sm text-gray-600 hover:text-gray-900">
            Clear
          </button>
        </form>

        <div className="flex flex-col md:flex-row md:items-center gap-3 mt-4">
          <p className="text-sm text-gray-500">
            {loading ? 'Searching…' : `${total} result${total !== 1 ? 's' : ''}`}
          </p>
          <div className="md:ml-auto flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <input
              type="email"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
              placeholder="Email for job alerts"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white flex-1 md:w-56"
            />
            <button
              onClick={createAlert}
              disabled={alertBusy}
              className="inline-flex items-center justify-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-50"
            >
              <Bell className="w-4 h-4" /> {alertBusy ? 'Saving…' : 'Alert me'}
            </button>
          </div>
        </div>
        {alertMsg && <p className="text-sm text-gray-700 mt-2">{alertMsg}</p>}

        <div className="py-6">
          {loading ? (
            <LoadingState label="Loading jobs..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : jobs.length === 0 ? (
            <EmptyState title="No jobs found" hint="Try adjusting your search criteria" />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
              <div className="flex items-center justify-between mt-8">
                <button
                  disabled={page === 0}
                  onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page - 1)); return n; })}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  disabled={page + 1 >= totalPages}
                  onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page + 1)); return n; })}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Jobs;
