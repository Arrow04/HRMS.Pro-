import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { loadLocalProfile } from '../lib/profile';
import type { PortalGig, PortalProposal, PortalContract } from '../lib/types';
import { gigBudget } from '../components/cards/GigCard';
import { PageHeader, LoadingState } from '../components/ui/states';

type Tab = 'gigs' | 'proposals' | 'contracts';

interface GigProposal extends PortalProposal {
  cover_letter?: string;
  freelancer_name?: string;
}

export default function Work() {
  const profile = loadLocalProfile();
  const [tab, setTab] = useState<Tab>('gigs');
  const [loading, setLoading] = useState(true);
  const [gigs, setGigs] = useState<PortalGig[]>([]);
  const [proposals, setProposals] = useState<PortalProposal[]>([]);
  const [contracts, setContracts] = useState<PortalContract[]>([]);
  const [openGig, setOpenGig] = useState<number | null>(null);
  const [gigProps, setGigProps] = useState<GigProposal[]>([]);
  const [msTitle, setMsTitle] = useState<Record<number, string>>({});
  const [msAmount, setMsAmount] = useState<Record<number, string>>({});
  const [rev, setRev] = useState<Record<number, { rating: number; comment: string }>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const uid = profile?.id;

  const load = async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [g, p, c] = await Promise.all([
        apiGet<{ gigs: PortalGig[] }>(`/public/gigs/mine/list?user_id=${uid}`).catch(() => ({ gigs: [] })),
        apiGet<{ proposals: PortalProposal[] }>(`/public/proposals/mine?user_id=${uid}`).catch(() => ({ proposals: [] })),
        apiGet<{ contracts: PortalContract[] }>(`/public/contracts/mine?user_id=${uid}`).catch(() => ({ contracts: [] })),
      ]);
      setGigs(g.gigs || []);
      setProposals(p.proposals || []);
      setContracts(c.contracts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    load();
    if (openGig) viewProposals(openGig);
  };

  const viewProposals = async (gigId: number) => {
    setOpenGig(gigId);
    try {
      const res = await apiGet<{ proposals: GigProposal[] }>(`/public/gigs/${gigId}/proposals?user_id=${uid}`);
      setGigProps(res.proposals || []);
    } catch {
      setGigProps([]);
    }
  };

  const act = async (label: string, fn: () => Promise<any>, doneMsg: string) => {
    setBusy(label);
    setMsg('');
    try {
      await fn();
      setMsg(doneMsg);
      refresh();
    } catch (e: any) {
      setMsg(e?.message || 'Action failed');
    } finally {
      setBusy('');
    }
  };

  const accept = (pid: number) =>
    act(`accept-${pid}`, () => apiPost(`/public/proposals/${pid}/accept?user_id=${uid}`, {}), 'Contract started.');

  const addMilestone = (cid: number) => {
    const title = (msTitle[cid] || '').trim();
    const amount = Number(msAmount[cid]);
    if (!title || !amount) {
      setMsg('Milestone needs a title and amount.');
      return;
    }
    act(`ms-${cid}`, () => apiPost(`/public/contracts/${cid}/milestones`, { title, amount }), 'Milestone added.');
  };

  const setMilestone = (mid: number, status: string) =>
    act(`mss-${mid}`, async () => {
      const res = await fetch(
        `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/public/milestones/${mid}?status=${status}`,
        { method: 'PUT' }
      );
      if (!res.ok) throw new Error('Failed to update milestone');
    }, `Milestone ${status}.`);

  const complete = (cid: number) =>
    act(`done-${cid}`, () => apiPost(`/public/contracts/${cid}/complete`, {}), 'Contract completed — please review.');

  const review = (cid: number) => {
    const r = rev[cid];
    if (!r || !r.rating) {
      setMsg('Pick a star rating first.');
      return;
    }
    act(`rev-${cid}`, () => apiPost('/public/reviews', {
      contract_id: cid,
      reviewer_id: uid,
      rating: r.rating,
      comment: r.comment || undefined,
    }), 'Review published. Thank you.');
  };

  if (!uid) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="My Work" subtitle="Gigs, proposals and contracts" />
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-700 font-medium">Create your profile first — gigs, proposals and contracts attach to it.</p>
          <Link to="/profile" className="inline-block mt-4 bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700">
            Build my profile
          </Link>
        </div>
      </div>
    );
  }

  const tabs: Array<{ k: Tab; l: string; n: number }> = [
    { k: 'gigs', l: 'My gigs', n: gigs.length },
    { k: 'proposals', l: 'My proposals', n: proposals.length },
    { k: 'contracts', l: 'Contracts', n: contracts.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="My Work" subtitle="Post, propose, deliver, review — all in one place" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-2 mb-2">
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                tab === t.k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'
              }`}
            >
              {t.l} ({t.n})
            </button>
          ))}
        </div>
        {msg && <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-2.5 mb-4">{msg}</p>}

        {loading ? (
          <LoadingState label="Loading your work..." />
        ) : (
          <>
            {tab === 'gigs' && (
              <div className="space-y-3">
                <Link to="/post-gig" className="block text-center border-2 border-dashed border-gray-300 rounded-2xl p-5 text-sm font-semibold text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/40">
                  + Post a new gig
                </Link>
                {gigs.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No gigs posted yet.</p>}
                {gigs.map((g) => (
                  <div key={g.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Link to={`/gigs/${g.id}`} className="font-bold text-gray-900 hover:text-indigo-600">{g.title}</Link>
                        <p className="text-sm text-gray-500">{gigBudget(g)} · {g.status} · {g.proposal_count} proposals</p>
                      </div>
                      <button
                        onClick={() => (openGig === g.id ? setOpenGig(null) : viewProposals(g.id))}
                        className="shrink-0 text-sm font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5"
                      >
                        {openGig === g.id ? 'Hide' : 'Proposals'}
                      </button>
                    </div>
                    {openGig === g.id && (
                      <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                        {gigProps.length === 0 && <p className="text-sm text-gray-400">No proposals yet.</p>}
                        {gigProps.map((p) => (
                          <div key={p.id} className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-gray-900">{p.freelancer_name || 'Freelancer'} · ₹{p.bid_amount.toLocaleString()}</p>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.status === 'accepted' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'}`}>
                                {p.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{p.cover_letter}</p>
                            {p.status === 'pending' && g.status === 'open' && (
                              <button
                                onClick={() => accept(p.id)}
                                disabled={busy === `accept-${p.id}`}
                                className="mt-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-1.5 disabled:opacity-50"
                              >
                                {busy === `accept-${p.id}` ? 'Starting…' : 'Accept → start contract'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === 'proposals' && (
              <div className="space-y-3">
                {proposals.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No proposals sent yet. <Link to="/gigs" className="text-indigo-600 font-semibold">Browse gigs</Link>.</p>}
                {proposals.map((p) => (
                  <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between gap-3">
                    <div>
                      {p.gig ? (
                        <Link to={`/gigs/${p.gig.id}`} className="font-bold text-gray-900 hover:text-indigo-600">{p.gig.title}</Link>
                      ) : (
                        <p className="font-bold text-gray-900">Gig #{p.id}</p>
                      )}
                      <p className="text-sm text-gray-500">Bid ₹{p.bid_amount.toLocaleString()}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.status === 'accepted' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'}`}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'contracts' && (
              <div className="space-y-4">
                {contracts.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No contracts yet — accept a proposal to start one.</p>}
                {contracts.map((c) => (
                  <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900">{c.gig?.title || `Contract #${c.id}`}</p>
                        <p className="text-sm text-gray-500">
                          {c.freelancer_name ? `${c.freelancer_name} · ` : ''}₹{c.agreed_amount.toLocaleString()} agreed
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.status === 'completed' ? 'bg-green-100 text-green-700' : c.status === 'active' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
                        {c.status}
                      </span>
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-bold text-gray-900 mb-2">Milestones</p>
                      {(c.milestones || []).length === 0 && <p className="text-xs text-gray-400">None yet.</p>}
                      {(c.milestones || []).map((m) => (
                        <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
                          <p className="flex-1 text-sm text-gray-700">{m.title} · ₹{m.amount.toLocaleString()}</p>
                          <span className="text-xs font-bold text-gray-500">{m.status}</span>
                          {c.status === 'active' && m.status === 'pending' && (
                            <button onClick={() => setMilestone(m.id, 'funded')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Fund</button>
                          )}
                          {c.status === 'active' && m.status === 'funded' && (
                            <button onClick={() => setMilestone(m.id, 'released')} className="text-xs font-semibold text-green-600 hover:text-green-700">Release</button>
                          )}
                        </div>
                      ))}
                      {c.status === 'active' && (
                        <div className="flex gap-2 mt-2">
                          <input
                            value={msTitle[c.id] || ''}
                            onChange={(e) => setMsTitle({ ...msTitle, [c.id]: e.target.value })}
                            placeholder="Milestone title"
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            type="number"
                            value={msAmount[c.id] || ''}
                            onChange={(e) => setMsAmount({ ...msAmount, [c.id]: e.target.value })}
                            placeholder="₹"
                            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button onClick={() => addMilestone(c.id)} className="text-sm font-semibold text-white bg-gray-900 rounded-lg px-3 hover:bg-gray-700">
                            Add
                          </button>
                        </div>
                      )}
                    </div>

                    {c.status === 'active' && (
                      <button onClick={() => complete(c.id)} disabled={busy === `done-${c.id}`} className="mt-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 disabled:opacity-50">
                        {busy === `done-${c.id}` ? 'Completing…' : 'Mark complete'}
                      </button>
                    )}

                    {(c.reviews || []).length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {c.reviews.map((r) => (
                          <p key={r.id} className="text-sm text-gray-600">
                            <span className="text-amber-500 font-bold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> {r.comment}
                          </p>
                        ))}
                      </div>
                    ) : (
                      c.status === 'completed' && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button key={s} onClick={() => setRev({ ...rev, [c.id]: { rating: s, comment: rev[c.id]?.comment || '' } })}>
                                <Star className={`w-5 h-5 ${(rev[c.id]?.rating || 0) >= s ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                              </button>
                            ))}
                          </div>
                          <input
                            value={rev[c.id]?.comment || ''}
                            onChange={(e) => setRev({ ...rev, [c.id]: { rating: rev[c.id]?.rating || 0, comment: e.target.value } })}
                            placeholder="Say thanks…"
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button onClick={() => review(c.id)} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                            Post
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
