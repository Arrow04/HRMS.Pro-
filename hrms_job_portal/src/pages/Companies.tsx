import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import type { PortalCompanySummary } from '../lib/types';
import CompanyCard from '../components/cards/CompanyCard';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui/states';

const Companies = () => {
  const [companies, setCompanies] = useState<PortalCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const load = async (search?: string) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ limit: '50' });
      if (search?.trim()) q.set('search', search.trim());
      const data = await apiGet<{ companies: PortalCompanySummary[] }>(`/public/companies?${q.toString()}`);
      setCompanies(data.companies || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load companies');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(filter), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Companies" subtitle="Verified employers on Jobs.Pro!" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFilter(e.target.value);
            }}
            placeholder="Search companies..."
            className="w-full md:max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2 w-fit">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
            Verified only
          </label>
        </div>
        <div className="py-6">
          {loading ? (
            <LoadingState label="Loading companies..." />
          ) : error ? (
            <ErrorState message={error} onRetry={() => load(query)} />
          ) : companies.length === 0 ? (
            <EmptyState title="No companies found" hint="Try a different search" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companies
                .filter((c) => !verifiedOnly || c.is_verified)
                .map((company) => (
                  <CompanyCard key={company.id} company={company} />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Companies;
