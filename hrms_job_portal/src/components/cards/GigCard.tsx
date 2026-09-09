import { useNavigate } from 'react-router-dom';
import { MapPin, Users } from 'lucide-react';
import type { PortalGig } from '../../lib/types';
import { formatDate } from '../../lib/api';

export function gigBudget(g: PortalGig) {
  if (g.budget_min || g.budget_max) {
    const range = g.budget_max
      ? `₹${(g.budget_min || 0).toLocaleString()} – ₹${g.budget_max.toLocaleString()}`
      : `₹${(g.budget_min || 0).toLocaleString()}+`;
    return `${range}${g.budget_type === 'hourly' ? ' /hr' : ' fixed'}`;
  }
  return 'Budget open';
}

export default function GigCard({ gig }: { gig: PortalGig }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/gigs/${gig.id}`)}
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold uppercase tracking-wider text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
          {gig.category}
        </span>
        {gig.is_remote && (
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Remote</span>
        )}
      </div>
      <h3 className="text-lg font-bold text-gray-900 mt-2 line-clamp-1">{gig.title}</h3>
      <p className="text-sm text-gray-600 mt-1 clamp-2">{gig.description}</p>
      <p className="text-base font-extrabold text-gray-900 mt-3">{gigBudget(gig)}</p>
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" /> {gig.location || 'Remote'}
        </span>
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> {gig.proposal_count} proposal{gig.proposal_count !== 1 ? 's' : ''}
        </span>
        <span>{formatDate(gig.published_at)}</span>
      </div>
    </div>
  );
}
