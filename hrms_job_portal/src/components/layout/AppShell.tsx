import { Link, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X, ShieldCheck, Bookmark, User } from 'lucide-react';

const NAV = [
  { to: '/jobs', label: 'Find Jobs' },
  { to: '/companies', label: 'Companies' },
  { to: '/blogs', label: 'Community' },
  { to: '/safety', label: 'Safety', danger: true },
];

const FOOT_COLS: Array<{ title: string; links: Array<{ to: string; label: string }> }> = [
  {
    title: 'Job Seekers',
    links: [
      { to: '/jobs', label: 'Browse jobs' },
      { to: '/saved', label: 'Saved & applications' },
      { to: '/profile', label: 'My profile' },
    ],
  },
  {
    title: 'Employers',
    links: [
      { to: '/register/company', label: 'Register company' },
      { to: '/post-job', label: 'Post a job' },
      { to: '/companies', label: 'All companies' },
    ],
  },
  {
    title: 'Trust & Safety',
    links: [
      { to: '/verify', label: 'Verification Center' },
      { to: '/safety', label: 'Safety Center' },
      { to: '/report', label: 'Report a scam' },
      { to: '/blogs', label: 'Community guides' },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-indigo-950 text-indigo-100 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center sm:justify-between gap-2">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            100% free · Every employer verified · Never pay to apply
          </p>
          <div className="hidden sm:flex items-center gap-4">
            <Link to="/saved" className="flex items-center gap-1 hover:text-white">
              <Bookmark className="w-3.5 h-3.5" /> Saved
            </Link>
            <Link to="/profile" className="flex items-center gap-1 hover:text-white">
              <User className="w-3.5 h-3.5" /> Profile
            </Link>
          </div>
        </div>
      </div>

      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center gap-2">
                <img src="/logo.png" alt="Jobs.Pro!" className="w-9 h-9 rounded-xl object-contain" />
                <span className="text-xl font-extrabold tracking-tight text-gray-900">
                  Jobs<span className="text-indigo-600">.Pro!</span>
                </span>
              </Link>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `text-sm ${
                      n.danger
                        ? 'text-red-600 hover:text-red-700 font-medium'
                        : 'text-gray-600 hover:text-gray-900'
                    } ${isActive ? 'font-semibold text-gray-900' : ''}`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <Link to="/profile" className="text-sm text-gray-600 hover:text-gray-900">
                Join Free
              </Link>
              <Link
                to="/post-job"
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm shadow-indigo-600/20"
              >
                Post a Job
              </Link>
            </nav>
            <div className="md:hidden flex items-center">
              <button onClick={() => setOpen(!open)} className="text-gray-600 p-2" aria-label="Menu">
                {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
        {open && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-4 py-3 space-y-1">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-gray-700 font-medium"
                >
                  {n.label}
                </Link>
              ))}
              <Link to="/saved" onClick={() => setOpen(false)} className="block py-2 text-gray-700">
                Saved & Applications
              </Link>
              <Link to="/profile" onClick={() => setOpen(false)} className="block py-2 text-gray-700">
                Join Free / Profile
              </Link>
              <Link to="/post-job" onClick={() => setOpen(false)} className="block py-2 text-indigo-600 font-semibold">
                Post a Job
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-slate-50 text-gray-700 pt-12 pb-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <img src="/logo.png" alt="Jobs.Pro!" className="w-9 h-9 rounded-lg object-contain" />
                <span className="text-lg font-extrabold text-gray-900">
                  Jobs<span className="text-indigo-600">.Pro!</span>
                </span>
              </div>
              <p className="text-gray-600 text-sm max-w-sm">
                One trusted community portal for job seekers, employers and freelancers. Verified
                jobs, transparent companies, and a safety-first community.
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Scam reports reviewed within 24 hours
              </p>
            </div>
            {FOOT_COLS.map((col) => (
              <div key={col.title}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  {col.title}
                </h3>
                <ul className="space-y-2 text-sm">
                  {col.links.map((l) => (
                    <li key={l.to + l.label}>
                      <Link to={l.to} className="text-gray-600 hover:text-indigo-600">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Jobs.Pro! All rights reserved.</p>
            <p className="text-gray-400 text-xs">Made for India’s workforce · Free forever for seekers</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
