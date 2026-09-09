import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin, ChevronRight, Mail, BadgeCheck, ShieldQuestion, Briefcase, GraduationCap, Award, FolderGit2 } from 'lucide-react';
import { apiGet, absoluteUrl, formatDate } from '../lib/api';
import type { PortalMemberDetail } from '../lib/types';
import TrustChip from '../components/trust/TrustChip';
import ReportButton from '../components/trust/ReportButton';
import { LoadingState, ErrorState } from '../components/ui/states';

function ListBlock({ title, icon: Icon, items, render }: { title: string; icon: any; items: any[]; render: (x: any, i: number) => React.ReactNode }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Icon className="w-5 h-5 text-indigo-600" /> {title}
      </h2>
      <div className="space-y-4">{items.map((x, i) => render(x, i))}</div>
    </div>
  );
}

export default function TalentDetail() {
  const { id } = useParams();
  const [member, setMember] = useState<PortalMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<PortalMemberDetail>(`/public/profile/${id}`);
      setMember(data);
    } catch (e: any) {
      setError(e?.message || 'Profile not found');
      setMember(null);
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
        <LoadingState label="Loading profile..." />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorState message={error || 'Profile not found'} onRetry={load} />
      </div>
    );
  }

  const initials = member.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-indigo-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button onClick={() => navigate('/talent')} className="text-indigo-300 hover:text-white mb-5 flex items-center gap-1 text-sm font-medium">
            <ChevronRight className="w-4 h-4 rotate-180" /> All talent
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative w-24 h-24 shrink-0">
              {member.profile_picture ? (
                <img src={absoluteUrl(member.profile_picture)} alt={member.full_name} className="w-24 h-24 rounded-2xl object-cover border-2 border-white/20" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-white/10 border border-white/15 text-3xl font-extrabold flex items-center justify-center">
                  {initials}
                </div>
              )}
              {member.is_verified ? (
                <span title="Verified profile" className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-green-500 border-2 border-indigo-950 flex items-center justify-center">
                  <BadgeCheck className="w-4 h-4 text-white" />
                </span>
              ) : (
                <span title="Not verified yet" className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-gray-400 border-2 border-indigo-950 flex items-center justify-center">
                  <ShieldQuestion className="w-4 h-4 text-white" />
                </span>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
                {member.full_name}
                {member.is_verified && <BadgeCheck className="w-6 h-6 text-emerald-300" />}
              </h1>
              <p className="text-indigo-200 mt-1">{member.headline || 'Community member'}</p>
              {(member.city || member.state) && (
                <p className="text-sm text-indigo-300 mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {[member.city, member.state, member.country].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <ReportButton kind="user" id={member.id} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {member.summary && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">About</h2>
            <p className="text-gray-700 whitespace-pre-line text-[15px]">{member.summary}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Snapshot</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <TrustChip state={member.is_verified ? 'verified' : 'unverified'} />
            <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
              {member.experience_years}+ yrs experience
            </span>
            {(member.current_designation || member.current_company) && (
              <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                {[member.current_designation, member.current_company].filter(Boolean).join(' @ ')}
              </span>
            )}
          </div>
          {(member.skills?.length || 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {member.skills.map((s, i) => (
                <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">{s}</span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            {member.resume_url && (
              <a href={absoluteUrl(member.resume_url)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5">
                View resume
              </a>
            )}
            {member.portfolio_url && (
              <a href={member.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5">
                Portfolio
              </a>
            )}
            {member.linkedin_url && (
              <a href={member.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5">
                LinkedIn
              </a>
            )}
            {member.github_url && (
              <a href={member.github_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5">
                GitHub
              </a>
            )}
          </div>
        </div>

        <ListBlock title="Work Experience" icon={Briefcase} items={member.work_experience || []} render={(w: any, i) => (
          <div key={i} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
            <p className="font-semibold text-gray-900 text-sm">{w.title}{w.company ? ` @ ${w.company}` : ''}</p>
            {(w.from || w.to) && <p className="text-xs text-gray-400">{[w.from, w.to].filter(Boolean).join(' → ')}</p>}
            {w.description && <p className="text-sm text-gray-600 mt-1">{w.description}</p>}
          </div>
        )} />

        <ListBlock title="Education" icon={GraduationCap} items={member.education || []} render={(e: any, i) => (
          <div key={i} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
            <p className="font-semibold text-gray-900 text-sm">{e.degree}{e.institute ? ` — ${e.institute}` : ''}</p>
            {(e.year || e.score) && <p className="text-xs text-gray-400">{[e.year, e.score].filter(Boolean).join(' · ')}</p>}
          </div>
        )} />

        <ListBlock title="Projects" icon={FolderGit2} items={member.projects || []} render={(p: any, i) => (
          <div key={i} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
            <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
            {p.description && <p className="text-sm text-gray-600 mt-0.5">{p.description}</p>}
            {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 font-medium">View project →</a>}
          </div>
        )} />

        <ListBlock title="Certifications" icon={Award} items={member.certifications || []} render={(c: any, i) => (
          <div key={i} className="text-sm text-gray-700 border-b border-gray-100 last:border-0 pb-2 last:pb-0">
            <span className="font-semibold text-gray-900">{c.name}</span>
            {(c.issuer || c.year) && <span className="text-gray-400"> — {[c.issuer, c.year].filter(Boolean).join(' · ')}</span>}
          </div>
        )} />

        <div className="bg-indigo-950 text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-bold">Interested in {member.full_name.split(' ')[0]}?</p>
            <p className="text-sm text-indigo-200">Reach out directly — verified contact details are shared on genuine enquiries.</p>
          </div>
          <Link to="/safety" className="text-center border border-white/30 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/10">
            Hiring safety tips
          </Link>
          <button
            onClick={() => {
              const subject = encodeURIComponent(`Opportunity for you via Jobs.Pro!`);
              const profileLink = window.location.href;
              window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(`Hi ${member.full_name},\n\nI found your profile here: ${profileLink}\n\n`)}`;
            }}
            className="inline-flex items-center justify-center gap-2 bg-white text-indigo-950 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-50"
          >
            <Mail className="w-4 h-4" /> Contact
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-4">Member since {formatDate((member as any).created_at)}. Report suspicious profiles via the Report button above.</p>
      </div>
    </div>
  );
}
