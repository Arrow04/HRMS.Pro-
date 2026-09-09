import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, Search } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { PageHeader, LoadingState } from '../components/ui/states';

interface ScamAlert {
  id: number;
  title: string;
  description: string;
  company_name?: string;
  created_at: string;
}

export default function Safety() {
  const [alerts, setAlerts] = useState<ScamAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [check, setCheck] = useState({ email: '', phone: '', company_name: '' });
  const [result, setResult] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<{ alerts: ScamAlert[] }>('/public/scam-alerts');
        if (!cancelled) setAlerts(res.alerts || []);
      } catch {
        if (!cancelled) setAlerts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setResult('');
    try {
      const res = await apiPost<{ is_blacklisted: boolean }>('/public/check-blacklist', {
        email: check.email || undefined,
        phone: check.phone || undefined,
        company_name: check.company_name || undefined,
      });
      setResult(res.is_blacklisted ? '⚠️ Match found on our blacklist — do not proceed. Report it below.' : '✓ No blacklist match. Still verify before paying or sharing OTP.');
    } catch (err: any) {
      setResult(err?.message || 'Check failed, try again.');
    } finally {
      setChecking(false);
    }
  };

  const input = 'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Safety Center" subtitle="Verify before you trust — every job, every company" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-600" /> Blacklist check
          </h2>
          <p className="text-sm text-gray-600 mt-1">Check an email, phone or company name before you engage.</p>
          <form onSubmit={runCheck} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <input className={input} placeholder="Email" value={check.email} onChange={(e) => setCheck({ ...check, email: e.target.value })} />
            <input className={input} placeholder="Phone" value={check.phone} onChange={(e) => setCheck({ ...check, phone: e.target.value })} />
            <input className={input} placeholder="Company" value={check.company_name} onChange={(e) => setCheck({ ...check, company_name: e.target.value })} />
          </form>
          <button onClick={runCheck} disabled={checking} className="mt-4 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {checking ? 'Checking…' : 'Run check'}
          </button>
          {result && <p className="text-sm mt-3 font-medium text-gray-900">{result}</p>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="bg-indigo-950 text-white rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="font-bold">Get verified — both sides.</p>
              <p className="text-sm text-indigo-200">Candidates verify identity, companies verify business. Proof beats promises.</p>
            </div>
            <Link to="/verify" className="shrink-0 bg-white text-indigo-900 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-50 text-center">
              Open Verification Center
            </Link>
          </div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-600" /> Golden rules
          </h2>
          <ul className="text-sm text-gray-700 mt-3 space-y-2 list-disc pl-5">
            <li>Never pay to apply, join, or unlock an offer.</li>
            <li>Never share OTP, bank PIN, or UPI collect approvals.</li>
            <li>Verify the company domain email and website before interviews.</li>
            <li>Report anything suspicious — our team reviews within 24 hours.</li>
          </ul>
          <Link to="/report" className="inline-block mt-4 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
            Report a scam
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" /> Live scam alerts
          </h2>
          {loading ? (
            <LoadingState label="Loading alerts…" />
          ) : alerts.length === 0 ? (
            <p className="text-sm text-gray-600 mt-3">No active alerts. Stay vigilant.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {alerts.map((a) => (
                <div key={a.id} className="border border-red-100 bg-red-50/50 rounded-lg p-4">
                  <p className="font-semibold text-gray-900 text-sm">{a.title}</p>
                  <p className="text-sm text-gray-700 mt-1">{a.description}</p>
                  {a.company_name && <p className="text-xs text-gray-500 mt-1">Flagged: {a.company_name}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
