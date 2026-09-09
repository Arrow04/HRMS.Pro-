import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import type { PortalCompanySummary } from '../../lib/types';
import TrustChip, { companyTrustState } from '../trust/TrustChip';

export default function CompanyCard({ company }: { company: PortalCompanySummary }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/companies/${company.id}`)}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Building2 className="w-8 h-8 text-indigo-600" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{company.name}</h3>
          <p className="text-sm text-gray-600">{company.industry || 'Various industries'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {[company.city, company.state].filter(Boolean).join(', ') || 'India'}
          </p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-indigo-600 text-sm font-medium">
          {(company.job_count || 0)} open position{(company.job_count || 0) !== 1 ? 's' : ''}
        </span>
        <TrustChip state={companyTrustState(company.is_verified)} />
      </div>
    </div>
  );
}
