import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BellOff } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { PortalJobSummary, PortalApplication } from '../lib/types';
import { loadLocalProfile, loadSavedJobs, loadAlertEmail, saveAlertEmail } from '../lib/profile';
import JobCard from '../components/cards/JobCard';
import { PageHeader, LoadingState } from '../components/ui/states';

interface AlertItem {
  id: number;
  search?: string;
  location?: string;
  remote_only: boolean;
  created_at?: string;
}

interface AlertMatch {
  id: number;
  title: string;
  company?: { name: string } | null;
  location: string;
  employment_type: string;
}

export default function Saved() {
  const [savedJobs, setSavedJobs] = useState<PortalJobSummary[]>([]);
  const [applications, setApplications] = useState<PortalApplication[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [matches, setMatches] = useState<Record<number, AlertMatch[]>>({});
  const [alertEmail, setAlertEmail] = useState(loadAlertEmail());
  const [loading, setLoading] = useState(true);

  const loadAlerts = async (email: string) => {
    if (!email.includes('@')) return;
    try {
      const res = await apiGet<{ alerts: AlertItem[] }>(`/public/alerts?email=${encodeURIComponent(email)}`);
      setAlerts(res.alerts || []);
      const m: Record<number, AlertMatch[]> = {};
      for (const a of (res.alerts || []).slice(0, 5)) {
        try {
          const r = await apiGet<{ jobs: AlertMatch[] }>(
            `/public/alerts/${a.id}/matches?email=${encodeURIComponent(email)}&limit=3`
          );
          m[a.id] = r.jobs || [];
        } catch {
          m[a.id] = [];
        }
      }
      setMatches(m);
    } catch {
      setAlerts([]);
    }
  };

  const removeAlert = async (id: number) => {
    try {
      await fetch(
        `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/public/alerts/${id}?email=${encodeURIComponent(alertEmail)}`,
        { method: 'DELETE' }
      );
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = loadSavedJobs();
        const jobs: PortalJobSummary[] = [];
        for (const id of ids.slice(0, 20)) {
          try {
            const j = await apiGet<PortalJobSummary>(`/public/jobs/${id}`);
            jobs.push(j);
          } catch {
            // drop dead ids silently
          }
        }
        const profile = loadLocalProfile();
        let apps: PortalApplication[] = [];
        if (profile?.id) {
          try {
            const res = await apiGet<{ applications: PortalApplication[] }>(
              `/public/applications/my?user_id=${profile.id}`
            );
            apps = res.applications || [];
          } catch {
            apps = [];
          }
        }
        if (!cancelled) {
          setSavedJobs(jobs);
          setApplications(apps);
          const email = loadAlertEmail();
          if (email) loadAlerts(email);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Saved & Applications" subtitle="Everything you’ve bookmarked and applied to" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <LoadingState label="Loading…" />
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-4">My Applications ({applications.length})</h2>
            {applications.length === 0 ? (
              <p className="text-gray-600 text-sm mb-10">
                No applications yet. <Link to="/jobs" className="text-indigo-600 font-medium">Browse jobs</Link>
              </p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl divide-y mb-10">
                {applications.map((a) => (
                  <div key={a.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900">{a.job.title}</p>
                      <p className="text-sm text-gray-600">
                        {a.job.company} • {a.job.location}
                      </p>
                    </div>
                    <span className="text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <h2 className="text-xl font-bold text-gray-900 mb-4">Job Alerts</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-10">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="Your alert email"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => {
                    saveAlertEmail(alertEmail.trim());
                    loadAlerts(alertEmail.trim());
                  }}
                  className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700"
                >
                  Load my alerts
                </button>
              </div>
              {alerts.length === 0 ? (
                <p className="text-sm text-gray-500 mt-3">
                  No alerts yet. Search on the <Link to="/jobs" className="text-indigo-600 font-medium">Jobs page</Link> and hit “Alert me”.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {alerts.map((a) => (
                    <div key={a.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {[a.search || 'All jobs', a.location, a.remote_only ? 'Remote' : ''].filter(Boolean).join(' • ')}
                        </p>
                        <button onClick={() => removeAlert(a.id)} className="text-gray-400 hover:text-red-600" title="Remove alert">
                          <BellOff className="w-4 h-4" />
                        </button>
                      </div>
                      {(matches[a.id] || []).length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {(matches[a.id] || []).map((m) => (
                            <li key={m.id} className="text-sm">
                              <Link to={`/jobs/${m.id}`} className="text-indigo-600 hover:text-indigo-700 font-medium">
                                {m.title}
                              </Link>
                              <span className="text-gray-500"> — {m.company?.name} • {m.location}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">No matches yet — we’ll highlight them here.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-4">Saved Jobs ({savedJobs.length})</h2>
            {savedJobs.length === 0 ? (
              <p className="text-gray-600 text-sm">
                Nothing saved yet. Tap ☆ Save on any job to keep it here.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
