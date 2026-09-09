import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import type { PortalGig } from '../lib/types';
import { GIG_CATEGORIES } from '../lib/types';
import GigCard from '../components/cards/GigCard';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui/states';

const PAGE_SIZE = 20;

export default function Gigs() {
  const [gigs, setGigs] = useState<PortalGig[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('search') || '');
  const [cat, setCat] = useState(searchParams.get('category') || '');
  const [btype, setBtype] = useState(searchParams.get('budget_type') || '');
  const [remote, setRemote] = useState(searchParams.get('remote') === '1');
  const page = Math.max(0, Number(searchParams.get('page') || 0));

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      q.set('limit', String(PAGE_SIZE));
      q.set('offset', String(page * PAGE_SIZE));
      if (searchParams.get('search')) q.set('search', searchParams.get('search')!);
      if (searchParams.get('category')) q.set('category', searchParams.get('category')!);
      if (searchParams.get('budget_type')) q.set('budget_type', searchParams.get('budget_type')!);
      if (searchParams.get('remote') === '1') q.set('is_remote', 'true');
      const data = await apiGet<{ gigs: PortalGig[]; total: number }>(`/public/gigs?${q.toString()}`);
      setGigs(data.gigs || []);
      setTotal(data.total ?? (data.gigs || []).length);
    } catch (e: any) {
      setError(e?.message || 'Failed to load gigs');
      setGigs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (keyword.trim()) next.set('search', keyword.trim());
    if (cat) next.set('category', cat);
    if (btype) next.set('budget_type', btype);
    if (remote) next.set('remote', '1');
    next.set('page', '0');
    setSearchParams(next);
  };

  const clear = () => {
    setKeyword('');
    setCat('');
    setBtype('');
    setRemote(false);
    setSearchParams(new URLSearchParams());
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sel = 'border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Freelance Gigs" subtitle="Fixed-price and hourly work from verified clients" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={apply} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Skill, keyword, or title"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={sel}>
            <option value="">All categories</option>
            {GIG_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <select value={btype} onChange={(e) => setBtype(e.target.value)} className={sel}>
            <option value="">Fixed + hourly</option>
            <option value="fixed">Fixed price</option>
            <option value="hourly">Hourly</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 px-1">
            <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} /> Remote
          </label>
          <button type="submit" className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">
            Search
          </button>
          <button type="button" onClick={clear} className="text-sm text-gray-600 hover:text-gray-900">
            Clear
          </button>
        </form>

        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">{loading ? 'Searching…' : `${total} gig${total !== 1 ? 's' : ''}`}</p>
          <Link to="/post-gig" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            + Post a gig
          </Link>
        </div>

        <div className="py-6">
          {loading ? (
            <LoadingState label="Loading gigs..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : gigs.length === 0 ? (
            <EmptyState title="No gigs found" hint="Try different keywords — or post the first gig" />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {gigs.map((g) => (
                  <GigCard key={g.id} gig={g} />
                ))}
              </div>
              <div className="flex items-center justify-between mt-8">
                <button
                  disabled={page === 0}
                  onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page - 1)); return n; })}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40 bg-white"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
                <button
                  disabled={page + 1 >= totalPages}
                  onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page + 1)); return n; })}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-40 bg-white"
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
}
