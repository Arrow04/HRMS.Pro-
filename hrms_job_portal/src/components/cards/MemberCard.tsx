import { useNavigate } from 'react-router-dom';
import { MapPin, BadgeCheck, ShieldQuestion } from 'lucide-react';
import type { PortalMember } from '../../lib/types';
import { absoluteUrl } from '../../lib/api';

const TYPE_LABEL: Record<string, string> = {
  fresher: 'Fresher',
  experienced: 'Experienced',
  freelancer: 'Freelancer',
};

export default function MemberCard({ member }: { member: PortalMember }) {
  const navigate = useNavigate();
  const initials = member.full_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      onClick={() => navigate(`/talent/${member.id}`)}
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer text-center"
    >
      <div className="relative w-16 h-16 mx-auto">
        {member.profile_picture ? (
          <img src={absoluteUrl(member.profile_picture)} alt={member.full_name} loading="lazy" decoding="async" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-xl flex items-center justify-center">
            {initials}
          </div>
        )}
        {member.is_verified ? (
          <span title="Verified profile" className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
            <BadgeCheck className="w-3.5 h-3.5 text-white" />
          </span>
        ) : (
          <span title="Not verified yet" className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-gray-400 border-2 border-white flex items-center justify-center">
            <ShieldQuestion className="w-3.5 h-3.5 text-white" />
          </span>
        )}
      </div>
      <h3 className="font-bold text-gray-900 mt-3">
        {member.full_name}
      </h3>
      <p className="text-sm text-indigo-600 font-medium">{member.headline || TYPE_LABEL[member.profile_type] || 'Member'}</p>
      {(member.city || member.state) && (
        <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" /> {[member.city, member.state].filter(Boolean).join(', ')}
        </p>
      )}
      {(member.skills?.length || 0) > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {member.skills.slice(0, 3).map((s, i) => (
            <span key={i} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {s}
            </span>
          ))}
        </div>
      )}
      <span className="inline-block mt-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
        {TYPE_LABEL[member.profile_type] || member.profile_type} · {member.experience_years}+ yrs
      </span>
    </div>
  );
}
