import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Building2, UserCheck, ShieldCheck } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { loadLocalProfile } from '../lib/profile';
import { PageHeader } from '../components/ui/states';
import TrustChip from '../components/trust/TrustChip';

type Tab = 'me' | 'company';

interface CompanyVerify {
  company_id: number;
  company_name: string;
  is_verified: boolean;
  is_featured: boolean;
  verifications: Array<{ id: number; verification_type: string; status: string; verified_at?: string }>;
}

export default function Verify() {
  const [tab, setTab] = useState<Tab>('me');
  const profile = loadLocalProfile();

  // Verify me
  const [vtype, setVtype] = useState('identity');
  const [vMsg, setVMsg] = useState('');
  const [vErr, setVErr] = useState('');
  const [vLoading, setVLoading] = useState(false);

  // Company lookup
  const [companyId, setCompanyId] = useState('');
  const [company, setCompany] = useState<CompanyVerify | null>(null);
  const [cErr, setCErr] = useState('');
  const [cLoading, setCLoading] = useState(false);

  const requestVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVErr('');
    setVMsg('');
    if (!profile?.id) {
      setVErr('Create your profile first — we need it to attach the verification.');
      return;
    }
    setVLoading(true);
    try {
      const res = await apiPost<{ message: string }>(
        `/public/verify-user?user_id=${profile.id}&verification_type=${encodeURIComponent(vtype)}`,
        {}
      );
      setVMsg(res.message || 'Verification request submitted.');
    } catch (err: any) {
      setVErr(err?.message || 'Failed to submit verification request');
    } finally {
      setVLoading(false);
    }
  };

  const lookupCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCErr('');
    setCompany(null);
    if (!companyId) return;
    setCLoading(true);
    try {
      const res = await apiGet<CompanyVerify>(`/public/verify-company/${companyId}`);
      setCompany(res);
    } catch (err: any) {
      setCErr(err?.message || 'Company not found');
    } finally {
      setCLoading(false);
    }
  };

  const input = 'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Verification Center" subtitle="Proof, not promises — both sides verified" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-2 mb-6">
          {(
            [
              { k: 'me', label: 'Verify me', icon: UserCheck },
              { k: 'company', label: 'Verify a company', icon: Building2 },
            ] as Array<{ k: Tab; label: string; icon: any }>
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                tab === t.k
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'me' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
            <h2 className="font-extrabold text-gray-900 flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-indigo-600" /> Get your verified badge
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
              {[
                { t: 'Contact', d: 'Email + phone OTP on signup' },
                { t: 'Identity', d: 'ID + profile completeness review' },
                { t: 'Pro skills', d: 'Portfolio + client review history' },
              ].map((l) => (
                <div key={l.t} className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                  <p className="font-bold text-gray-900">{l.t}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{l.d}</p>
                </div>
              ))}
            </div>
            {!profile?.id ? (
              <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-900">
                <Link to="/profile" className="underline font-semibold">Complete your profile</Link> first —
                verification attaches to your profile ID.
              </div>
            ) : (
              <form onSubmit={requestVerify} className="mt-6 space-y-4">
                {vErr && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{vErr}</div>}
                {vMsg && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">{vMsg}</div>}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification type</label>
                  <select className={input} value={vtype} onChange={(e) => setVtype(e.target.value)}>
                    <option value="identity">Identity verification</option>
                    <option value="phone">Phone verification</option>
                    <option value="skill">Skill verification</option>
                  </select>
                </div>
                <button type="submit" disabled={vLoading} className="w-full bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 font-semibold disabled:opacity-50">
                  {vLoading ? 'Submitting…' : 'Request verification'}
                </button>
              </form>
            )}
          </div>
        )}

        {tab === 'company' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
            <h2 className="font-extrabold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-600" /> Check a company before you engage
            </h2>
            <form onSubmit={lookupCompany} className="flex gap-2 mt-4">
              <input
                type="number"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                placeholder="Company ID (shown on every company page)"
                className={input}
              />
              <button type="submit" disabled={cLoading} className="shrink-0 bg-gray-900 text-white px-5 rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-50">
                {cLoading ? '…' : 'Verify'}
              </button>
            </form>
            {cErr && <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{cErr}</div>}
            {company && (
              <div className="mt-4 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-gray-900">{company.company_name}</p>
                  <TrustChip state={company.is_verified ? 'verified' : 'unverified'} />
                </div>
                {company.verifications.length === 0 ? (
                  <p className="text-sm text-gray-500 mt-2">No completed verifications on record yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {company.verifications.map((v) => (
                      <li key={v.id} className="flex items-center justify-between border-b border-gray-100 last:border-0 pb-2">
                        <span className="text-gray-700 capitalize">{v.verification_type.replace('_', ' ')}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${v.status === 'verified' || v.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {v.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
