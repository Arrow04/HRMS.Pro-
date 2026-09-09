import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, MapPin, Briefcase, ChevronRight } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { PortalCompanyDetail } from '../lib/types';
import TrustChip, { companyTrustState } from '../components/trust/TrustChip';
import ReportButton from '../components/trust/ReportButton';
import { LoadingState, ErrorState } from '../components/ui/states';

const CompanyDetails = () => {
  const { id } = useParams();
  const [company, setCompany] = useState<PortalCompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<PortalCompanyDetail>(`/public/companies/${id}`);
      setCompany(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load company');
      setCompany(null);
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
        <LoadingState label="Loading company..." />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorState message={error || 'Company not found'} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button onClick={() => navigate('/companies')} className="text-indigo-600 hover:text-indigo-700 mb-4 flex items-center gap-1 text-sm font-medium">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to companies
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-5">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Building2 className="w-10 h-10 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
                <p className="text-gray-600 mt-1">
                  {company.industry || 'Various industries'} • {[company.city, company.state].filter(Boolean).join(', ') || 'India'}
                </p>
                <div className="mt-2">
                  <TrustChip state={companyTrustState(company.is_verified)} />
                </div>
              </div>
            </div>
            <ReportButton kind="company" id={company.id} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {company.description && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">About</h2>
            <p className="text-gray-700 whitespace-pre-line">{company.description}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Company Info</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {company.website && (
              <div>
                <p className="text-gray-500">Website</p>
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 font-medium break-all">
                  {company.website}
                </a>
              </div>
            )}
            {company.company_size && (
              <div>
                <p className="text-gray-500">Company Size</p>
                <p className="font-medium text-gray-900">{company.company_size}</p>
              </div>
            )}
            {company.headquarters && (
              <div>
                <p className="text-gray-500">Headquarters</p>
                <p className="font-medium text-gray-900">{company.headquarters}</p>
              </div>
            )}
            {company.founded_year && (
              <div>
                <p className="text-gray-500">Founded</p>
                <p className="font-medium text-gray-900">{company.founded_year}</p>
              </div>
            )}
            {company.phone && (
              <div>
                <p className="text-gray-500">Phone</p>
                <p className="font-medium text-gray-900">{company.phone}</p>
              </div>
            )}
            {company.email && (
              <div>
                <p className="text-gray-500">Email</p>
                <p className="font-medium text-gray-900 break-all">{company.email}</p>
              </div>
            )}
          </div>
        </div>

        {company.jobs?.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Open Positions</h2>
            <div className="space-y-3">
              {company.jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        {job.employment_type?.replace('_', ' ')}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {job.location}
                      </span>
                    </div>
                  </div>
                  {job.is_remote && (
                    <span className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded font-medium">Remote</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyDetails;
