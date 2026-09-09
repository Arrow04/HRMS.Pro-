import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin, ChevronRight, Users } from 'lucide-react';
import { apiGet, apiPost, formatDate, prettify } from '../lib/api';
import type { PortalGig } from '../lib/types';
import { loadLocalProfile } from '../lib/profile';
import ReportButton from '../components/trust/ReportButton';
import ShareMenu from '../components/ui/ShareMenu';
import { LoadingState, ErrorState } from '../components/ui/states';
import { usePageMeta } from '../lib/seo';
import { gigBudget } from '../components/cards/GigCard';

export default function GigDetail() {
  const { id } = useParams();
  const [gig, setGig] = useState<PortalGig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cover, setCover] = useState('');
  const [bid, setBid] = useState('');
  const [days, setDays] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const [sendErr, setSendErr] = useState('');
  const navigate = useNavigate();
  const profile = loadLocalProfile();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<PortalGig>(`/public/gigs/${id}`);
      setGig(data);
    } catch (e: any) {
      setError(e?.message || 'Gig not found');
      setGig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  usePageMeta({
    title: gig ? `${gig.title} — freelance gig` : 'Gig details',
    description: gig ? `${gig.title} — ${gigBudget(gig)}. Propose free on Jobs.Pro!` : undefined,
  });

  const propose = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendErr('');
    setSentMsg('');
    if (!cover.trim() || !bid) {
      setSendErr('Cover note and your bid are required.');
      return;
    }
    setSending(true);
    try {
      await apiPost('/public/proposals', {
        gig_id: Number(id),
        freelancer_id: profile?.id,
        freelancer_name: profile?.full_name,
        cover_letter: cover.trim(),
        bid_amount: Number(bid),
        delivery_days: days ? Number(days) : undefined,
      });
      setSentMsg('Proposal sent. The client reviews in My Work → proposals.');
      setCover('');
      setBid('');
      setDays('');
    } catch (err: any) {
      setSendErr(err?.message || 'Failed to send proposal');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingState label="Loading gig..." />
      </div>
    );
  }

  if (error || !gig) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorState message={error || 'Gig not found'} onRetry={load} />
      </div>
    );
  }

  const closed = gig.status !== 'open';
  const inputCls = 'w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button onClick={() => navigate('/gigs')} className="text-indigo-600 hover:text-indigo-700 mb-4 flex items-center gap-1 text-sm font-medium">
            <ChevronRight className="w-4 h-4 rotate-180" /> All gigs
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-2 py-1 rounded">
                  {gig.category}
                </span>
                {closed ? (
                  <span className="text-xs font-bold bg-gray-200 text-gray-600 px-2 py-1 rounded-full">{prettify(gig.status)}</span>
                ) : (
                  <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">Open for proposals</span>
                )}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mt-2">{gig.title}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-gray-600 text-sm">
                <span>by {gig.client_name || 'Verified client'}</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{gig.location || 'Remote'}</span>
                <span className="flex items-center gap-1"><Users className="w-4 h-4" />{gig.proposal_count} proposals</span>
              </div>
              <p className="text-2xl font-extrabold text-gray-900 mt-3">{gigBudget(gig)}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <ShareMenu title={gig.title} text={gigBudget(gig)} />
              <ReportButton kind="gig" id={gig.id} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3">About this gig</h2>
          <p className="text-gray-700 whitespace-pre-line">{gig.description}</p>
          {gig.deliverables && (
            <>
              <h3 className="font-bold text-gray-900 mt-5 mb-2">Deliverables</h3>
              <p className="text-gray-700 whitespace-pre-line text-sm">{gig.deliverables}</p>
            </>
          )}
          {(gig.skills_required?.length || 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {gig.skills_required.map((s, i) => (
                <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">{s}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">Posted {formatDate(gig.published_at)}{gig.delivery_days ? ` · Expected in ~${gig.delivery_days} days` : ''}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Send a proposal</h2>
          <p className="text-sm text-gray-500 mb-4">Free. Clients see your profile with every proposal.</p>
          {closed ? (
            <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">This gig is {gig.status} — proposals are closed.</p>
          ) : (
            <form onSubmit={propose} className="space-y-4">
              {sendErr && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{sendErr}</div>}
              {sentMsg && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">{sentMsg}</div>}
              {!profile?.id && (
                <p className="text-sm text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  Tip: <Link to="/profile" className="underline font-semibold">complete your freelancer profile</Link> — it attaches automatically.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cover note *</label>
                <textarea rows={4} required className={inputCls} placeholder="Why you, timeline, relevant work…" value={cover} onChange={(e) => setCover(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your bid (₹) *</label>
                  <input type="number" required min={1} className={inputCls} value={bid} onChange={(e) => setBid(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery (days)</label>
                  <input type="number" min={1} className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
                </div>
              </div>
              <button type="submit" disabled={sending} className="w-full bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 font-semibold disabled:opacity-50">
                {sending ? 'Sending…' : 'Send proposal'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
