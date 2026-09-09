import { useNavigate } from 'react-router-dom';
import { MapPin, Briefcase, Building2 } from 'lucide-react';
import type { PortalJobSummary } from '../../lib/types';
import { formatDate, prettify } from '../../lib/api';
import TrustChip, { companyTrustState } from '../trust/TrustChip';

export default function JobCard({ job }: { job: PortalJobSummary }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/jobs/${job.id}`)}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2 className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">{job.title}</h3>
          <p className="text-sm text-gray-600">{job.company.name}</p>
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
            <MapPin className="w-4 h-4" />
            {job.location}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            <Briefcase className="w-4 h-4" />
            {prettify(job.employment_type)}
            {job.is_remote ? ' • Remote' : ''}
          </div>
        </div>
      </div>
      {(job.salary_min || job.salary_max) && (
        <p className="text-sm font-medium text-gray-900 mt-3">
          ₹{(job.salary_min || 0).toLocaleString()}
          {job.salary_max ? ` – ₹${job.salary_max.toLocaleString()}` : '+'}
        </p>
      )}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="inline-block bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded">
          {formatDate(job.published_at)}
        </span>
        <TrustChip state={companyTrustState(job.company.is_verified)} />
      </div>
    </div>
  );
}
