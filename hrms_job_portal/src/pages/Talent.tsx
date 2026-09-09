import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet } from '../lib/api';
import type { PortalMember, ProfileType } from '../lib/types';
import MemberCard from '../components/cards/MemberCard';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui/states';

const PAGE_SIZE = 20;
const TYPE_OPTS: Array<{ v: string; l: string }> = [
  { v: '', l: 'Everyone' },
  { v: 'fresher', l: 'Freshers' },
  { v: 'experienced', l: 'Experienced' },
  { v: 'freelancer', l: 'Freelancers' },
];

export default function Talent() {
  const [members, setMembers] = useState<PortalMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('search') || '');
  const [city, setCity] = useState(searchParams.get('city') || '');
  const [ptype, setPtype] = useState<ProfileType | ''>((searchParams.get('type') as ProfileType) || '');
  const page = Math.max(0, Number(searchParams.get('page') || 0));

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      q.set('limit', String(PAGE_SIZE));
      q.set('offset', String(page * PAGE_SIZE));
      if (searchParams.get('search')) q.set('search', searchParams.get('search')!);
      if (searchParams.get('city')) q.set('city', searchParams.get('city')!);
      if (searchParams.get('type')) q.set('profile_type', searchParams.get('type')!);
      const data = await apiGet<{ profiles: PortalMember[]; total: number }>(`/public/profiles?${q.toString()}`);
      setMembers(data.profiles || []);
      setTotal(data.total ?? (data.profiles || []).length);
    } catch (e: any) {
      setError(e?.message || 'Failed to load talent');
      setMembers([]);
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
    if (city.trim()) next.set('city', city.trim());
    if (ptype) next.set('type', ptype);
    next.set('page', '0');
    setSearchParams(next);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Community Talent" subtitle="Freshers, professionals and freelancers ready to hire" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={applyFilters} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Name, headline, or skill"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={ptype}
            onChange={(e) => setPtype(e.target.value as ProfileType | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {TYPE_OPTS.map((o) => (
              <option key={o.l} value={o.v}>{o.l}</option>
            ))}
          </select>
          <button type="submit" className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">
            Search
          </button>
        </form>

        <p className="text-sm text-gray-500 mt-4">
          {loading ? 'Searching…' : `${total} member${total !== 1 ? 's' : ''}`}
        </p>

        <div className="py-6">
          {loading ? (
            <LoadingState label="Loading talent..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : members.length === 0 ? (
            <EmptyState title="No profiles found" hint="Try a different search — or publish your own profile" />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {members.map((m) => (
                  <MemberCard key={m.id} member={m} />
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
