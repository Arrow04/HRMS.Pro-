import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search, MapPin, Globe, Building2, ShieldCheck, AlertTriangle, ChevronRight,
  FileCheck, Send, BadgeCheck, Rocket, X, Briefcase, Check, BookOpen,
} from 'lucide-react';
import { apiGet } from '../lib/api';
import type { PortalJobSummary, PortalCompanySummary, PortalMember } from '../lib/types';
import JobCard from '../components/cards/JobCard';
import CompanyCard from '../components/cards/CompanyCard';
import MemberCard from '../components/cards/MemberCard';
import SafetyBanner from '../components/trust/SafetyBanner';
import { SkeletonCards } from '../components/ui/states';

interface PortalStats {
  total_jobs: number;
  total_companies: number;
  total_applications: number;
  total_job_seekers: number;
}

const POPULAR = ['Remote', 'Fresher', 'Delivery', 'Tailoring', 'Driver', 'Teacher'];

const STEPS = [
  {
    icon: Search,
    title: 'Discover verified work',
    text: 'Every listing passes fraud, duplication and blacklist checks before it goes live.',
  },
  {
    icon: Send,
    title: 'Apply in one tap',
    text: 'Your profile travels with you. Free forever — paying to apply is a red flag.',
  },
  {
    icon: BadgeCheck,
    title: 'Get hired with proof',
    text: 'Track every application status and join only verified employers.',
  },
];

const Home = () => {
  const [jobs, setJobs] = useState<PortalJobSummary[]>([]);
  const [companies, setCompanies] = useState<PortalCompanySummary[]>([]);
  const [members, setMembers] = useState<PortalMember[]>([]);
  const [stats, setStats] = useState<PortalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [gigEmail, setGigEmail] = useState('');
  const [gigNotified, setGigNotified] = useState(false);
  const whatRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        whatRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [jobsRes, companiesRes, membersRes, statsRes] = await Promise.all([
          apiGet<{ jobs: PortalJobSummary[] }>('/public/jobs?limit=6'),
          apiGet<{ companies: PortalCompanySummary[] }>('/public/companies?limit=4'),
          apiGet<{ profiles: PortalMember[] }>('/public/profiles?limit=4').catch(() => ({ profiles: [] })),
          apiGet<PortalStats>('/public/stats').catch(() => null),
        ]);
        if (!cancelled) {
          setJobs(jobsRes.jobs || []);
          setCompanies(companiesRes.companies || []);
          setMembers(membersRes.profiles || []);
          if (statsRes) setStats(statsRes);
        }
      } catch {
        if (!cancelled) {
          setJobs([]);
          setCompanies([]);
          setMembers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/jobs?search=${encodeURIComponent(search)}&location=${encodeURIComponent(location)}`);
  };

  return (
    <div className="bg-white">
      <section className="relative overflow-hidden bg-indigo-950 text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, #818cf8 0, transparent 35%), radial-gradient(circle at 85% 15%, #22d3ee 0, transparent 30%), radial-gradient(circle at 60% 90%, #4f46e5 0, transparent 40%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 md:pt-12 pb-14 md:pb-16 grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
          <div>
          <p className="rise text-indigo-300 font-semibold text-sm tracking-widest uppercase">
            Jobs.Pro! community portal
          </p>
          <h1 className="rise-1 text-4xl md:text-5xl xl:text-6xl font-extrabold mt-3 tracking-tight leading-tight">
            Work you can trust.
            <br />
            <span className="text-indigo-300">Hiring you can verify.</span>
          </h1>
          <p className="rise-2 text-lg md:text-xl text-indigo-100 mt-4 max-w-xl">
            One home for job seekers, employers and freelancers — verified listings, transparent
            companies, and a community built on trust.
          </p>
          <form
            onSubmit={handleSearch}
            className="rise-3 mt-8 rounded-2xl md:rounded-[20px] bg-white p-2 shadow-2xl shadow-indigo-950/30 ring-1 ring-white/40 flex flex-col md:flex-row md:items-stretch gap-1"
          >
            <label className="flex flex-1 items-center gap-3 pl-3 pr-2 py-2 rounded-xl hover:bg-gray-50 focus-within:bg-indigo-50/50 transition-colors cursor-text">
              <span className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center shrink-0">
                <Briefcase className="w-[18px] h-[18px]" strokeWidth={2.25} />
              </span>
              <span className="flex-1 min-w-0 py-0.5">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 leading-tight">What</span>
                <input
                  ref={whatRef}
                  type="text"
                  placeholder="Job title, skill, or company"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full outline-none text-gray-900 text-base font-medium bg-transparent placeholder:text-gray-400 placeholder:font-normal"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </span>
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                  className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center shrink-0 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <div className="hidden md:block w-px self-stretch my-2 bg-gray-200" />
            <label className="flex flex-1 items-center gap-3 pl-3 pr-2 py-2 rounded-xl hover:bg-gray-50 focus-within:bg-indigo-50/50 transition-colors cursor-text">
              <span className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center shrink-0">
                <MapPin className="w-[18px] h-[18px]" strokeWidth={2.25} />
              </span>
              <span className="flex-1 min-w-0 py-0.5">
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 leading-tight">Where</span>
                <input
                  type="text"
                  placeholder="City, state, or “Remote”"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full outline-none text-gray-900 text-base font-medium bg-transparent placeholder:text-gray-400 placeholder:font-normal"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </span>
              {location && (
                <button
                  type="button"
                  aria-label="Clear location"
                  onClick={() => setLocation('')}
                  className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center shrink-0 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <button
              type="submit"
              aria-label="Search jobs"
              title="Search jobs"
              className="flex items-center justify-center w-12 h-12 md:w-[52px] md:h-[52px] rounded-xl md:rounded-full bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 shrink-0 self-center m-0.5"
            >
              <Search className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </form>
          <p className="text-indigo-200/70 text-xs mt-2 hidden md:block">Tip: press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 font-mono">/</kbd> to jump to search</p>
          <div className="flex flex-wrap items-center gap-2 mt-4 text-sm">
            <span className="text-indigo-200">Popular:</span>
            {POPULAR.map((p) => (
              <button
                key={p}
                onClick={() => navigate(`/jobs?search=${encodeURIComponent(p)}`)}
                className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-indigo-50 hover:bg-white/20 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
          </div>
          <div className="rise-2 rounded-3xl bg-white/[0.08] border border-white/15 p-5 md:p-6 shadow-2xl shadow-indigo-950/40">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Live community pulse</p>
            {stats ? (
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[
                  { v: stats.total_jobs, l: 'Open jobs' },
                  { v: stats.total_companies, l: 'Verified companies' },
                  { v: stats.total_applications, l: 'Applications' },
                  { v: stats.total_job_seekers, l: 'Members' },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl bg-white/10 border border-white/10 px-4 py-4 hover:bg-white/[0.14] transition-colors">
                    <p className="text-2xl md:text-3xl font-extrabold tabular-nums">{s.v.toLocaleString()}</p>
                    <p className="text-indigo-200 text-sm mt-0.5">{s.l}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                {['Verified employers only', 'Free forever for seekers', 'Reports reviewed in 24h'].map((t) => (
                  <div key={t} className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3.5 flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-300 shrink-0" />
                    <span className="text-indigo-50 font-medium">{t}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => navigate('/jobs')}
              className="mt-4 w-full rounded-xl bg-white text-indigo-950 font-bold py-3 hover:bg-indigo-50 transition-colors"
            >
              Explore open roles →
            </button>
          </div>
        </div>
      </section>

      <SafetyBanner />

      <section className="py-14 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-indigo-600 font-bold text-sm tracking-widest uppercase">How Jobs.Pro! works</p>
          <h2 className="text-3xl font-extrabold text-gray-900 mt-2 tracking-tight">
            Safer than a job board. Warmer than a network.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
                    <s.icon className="w-5 h-5" />
                  </span>
                  <span className="text-xs font-bold text-gray-400">STEP {i + 1}</span>
                </div>
                <h3 className="font-bold text-gray-900 mt-4">{s.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-indigo-600 font-bold text-sm tracking-widest uppercase">For job seekers</p>
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Everything to get hired, in one place</h2>
            </div>
          </div>
          <p className="text-gray-600 mb-8 max-w-2xl">Build once, apply everywhere — with verification and tracking built in.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {[
              { icon: FileCheck, t: 'Build my profile', d: 'Fresher, experienced or freelancer — guided in minutes.', to: '/profile' },
              { icon: Send, t: 'Track applications', d: 'Every apply, saved job and status in one view.', to: '/saved' },
              { icon: Search, t: 'Get job alerts', d: 'Save any search and never miss a new opening.', to: '/jobs' },
              { icon: ShieldCheck, t: 'Safety Center', d: 'Blacklist checks, scam alerts and reporting.', to: '/safety' },
              { icon: BookOpen, t: 'Community guides', d: 'Career advice and safety playbooks.', to: '/blogs' },
            ].map((c) => (
              <button
                key={c.t}
                onClick={() => navigate(c.to)}
                className="text-left rounded-2xl border border-gray-200 bg-gray-50/60 p-6 hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-200 transition-all group"
              >
                <span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25 group-hover:scale-105 transition-transform">
                  <c.icon className="w-5 h-5" />
                </span>
                <p className="font-bold text-gray-900 mt-4">{c.t}</p>
                <p className="text-sm text-gray-600 mt-1">{c.d}</p>
                <p className="text-sm font-semibold text-indigo-600 mt-3">Open →</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-indigo-950 text-white relative overflow-hidden border-t border-white/10">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 10% 20%, #818cf8 0, transparent 35%), radial-gradient(circle at 90% 80%, #22d3ee 0, transparent 30%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-indigo-300 font-bold text-sm tracking-widest uppercase flex items-center gap-2">
              <Rocket className="w-4 h-4" /> For freelancers
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold mt-2 tracking-tight">
              Your skills, your rates, your terms.
            </h2>
            <p className="text-indigo-100 mt-3 max-w-lg">
              List services with your own rates and availability, get discovered by verified clients,
              and grow on reviews — no bidding wars, no pay-to-play.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {['Service listings with starting rates', 'Hourly bands + availability badges', 'Verified-client only enquiries'].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="text-indigo-50">{t}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 mt-6">
              <button onClick={() => navigate('/profile')} className="bg-white text-indigo-950 px-6 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors">
                Create freelancer profile
              </button>
              <button onClick={() => navigate('/jobs?remote=1')} className="border border-white/30 text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/10 transition-colors">
                Find remote-friendly work
              </button>
              <button onClick={() => navigate('/blogs')} className="text-indigo-200 px-2 py-3 text-sm font-semibold hover:text-white transition-colors">
                Freelancer guides →
              </button>
            </div>
          </div>
          <div className="rounded-3xl bg-white/[0.08] border border-white/15 p-6 md:p-8">
            <p className="font-bold text-lg">Gigs marketplace — launching soon</p>
            <p className="text-sm text-indigo-200 mt-1">
              Fixed-price gigs, proposals and contracts are next on our roadmap. Leave your email and we’ll invite you first.
            </p>
            {gigNotified ? (
              <p className="mt-4 text-sm font-semibold text-emerald-300 bg-emerald-400/10 border border-emerald-300/20 rounded-xl px-4 py-3">
                You’re on the list — watch your inbox. ✓
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!gigEmail.includes('@')) return;
                  try {
                    const raw = localStorage.getItem('jobspro_gig_notify') || '[]';
                    const list = JSON.parse(raw);
                    if (!list.includes(gigEmail.trim().toLowerCase())) {
                      list.push(gigEmail.trim().toLowerCase());
                      localStorage.setItem('jobspro_gig_notify', JSON.stringify(list));
                    }
                  } catch { /* ignore */ }
                  setGigNotified(true);
                }}
                className="mt-4 flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="email"
                  required
                  value={gigEmail}
                  onChange={(e) => setGigEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                />
                <button type="submit" className="bg-emerald-400 text-emerald-950 font-bold px-5 py-3 rounded-xl text-sm hover:bg-emerald-300 transition-colors">
                  Notify me
                </button>
              </form>
            )}
            <p className="text-xs text-indigo-300/70 mt-3">No spam, one invite email. Unsubscribe anytime.</p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-violet-50/60 border-t border-violet-100 cv-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <p className="text-violet-700 font-bold text-sm tracking-widest uppercase">Community talent</p>
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Fresh profiles, ready to hire</h2>
            </div>
            <Link to="/talent" className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-semibold text-sm">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {loading ? (
            <SkeletonCards count={4} />
          ) : members.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-600">
              No public profiles yet. <Link to="/profile" className="text-indigo-600 font-semibold">Publish the first one</Link>.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {members.map((m) => (
                <MemberCard key={m.id} member={m} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-indigo-50/60 border-t border-indigo-100 cv-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <p className="text-indigo-600 font-bold text-sm tracking-widest uppercase">Fresh this week</p>
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Latest Jobs</h2>
            </div>
            <Link to="/jobs" className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-semibold text-sm">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {loading ? (
            <SkeletonCards count={6} />
          ) : jobs.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-600">
              No open jobs right now. Employers — <Link to="/post-job" className="text-indigo-600 font-semibold">post the first one free</Link>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-emerald-50/60 border-t border-emerald-100 cv-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <p className="text-emerald-700 font-bold text-sm tracking-widest uppercase">Hiring now</p>
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Featured Companies</h2>
            </div>
            <Link to="/companies" className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-semibold text-sm">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {loading ? (
            <SkeletonCards count={4} />
          ) : companies.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-600">
              No companies yet. <Link to="/register/company" className="text-indigo-600 font-semibold">Register yours free</Link>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {companies.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-8 bg-amber-50/70 border-y border-amber-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Globe, t: 'Free for everyone', d: 'Seekers, employers and freelancers — no paywalls to start.' },
              { icon: Building2, t: 'Verified employers', d: 'Contact + domain checks before any job goes live.' },
              { icon: ShieldCheck, t: 'Safety-first community', d: 'Scam alerts, blacklist checks and 24hr report reviews.' },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-3">
                <f.icon className="w-8 h-8 text-amber-600 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">{f.t}</p>
                  <p className="text-sm text-gray-600">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-indigo-950 text-white p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center gap-8 overflow-hidden relative">
            <div
              aria-hidden
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 90% 20%, #818cf8 0, transparent 35%), radial-gradient(circle at 10% 90%, #22d3ee 0, transparent 30%)',
              }}
            />
            <div className="relative flex-1">
              <p className="text-indigo-300 font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                <Rocket className="w-4 h-4" /> For employers
              </p>
              <h2 className="text-3xl md:text-4xl font-extrabold mt-2 tracking-tight">
                Hire people you’ve already verified.
              </h2>
              <p className="text-indigo-100 mt-3 max-w-xl">
                Register free, post in minutes, and meet candidates with OTP-verified profiles. Our
                trust team screens every listing so your brand stays clean.
              </p>
            </div>
            <div className="relative flex flex-col sm:flex-row gap-3">
              <Link to="/register/company" className="bg-white text-indigo-900 px-6 py-3 rounded-xl font-semibold hover:bg-indigo-50 text-center">
                Register company
              </Link>
              <Link to="/post-job" className="border border-white/30 text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/10 text-center">
                Post a job
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-red-50/60 border-t border-red-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-10 h-10 text-red-600 flex-shrink-0" />
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Stay safe from job scams</h2>
              <p className="text-gray-700 mt-2 max-w-3xl">
                Never pay to apply. Never share OTP, bank PIN, or deposits. Report suspicious jobs —
                our team reviews every report within 24 hours.
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                <Link to="/safety" className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-semibold">
                  Safety Center
                </Link>
                <Link to="/report" className="border border-red-600 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 text-sm font-semibold">
                  Report suspicious job
                </Link>
                <Link to="/blogs" className="text-red-700 px-4 py-2 text-sm font-semibold hover:underline">
                  Read safety guides →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Build once, apply everywhere</h2>
              <p className="text-sm text-gray-600">One profile, one resume link, tracked applications.</p>
            </div>
          </div>
          <div className="md:ml-auto flex gap-3">
            <Link to="/profile" className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700">
              Complete my profile
            </Link>
            <Link to="/saved" className="border border-gray-300 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Track applications
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
