import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface PageHeroProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  accent?: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'indigo' | 'purple' | 'slate';
  breadcrumbs?: string[];
  actions?: React.ReactNode;
}

const ACCENTS: Record<string, { icon: string; bar: string; chip: string }> = {
  blue: { icon: 'bg-blue-500/20 text-blue-200 border-blue-300/30', bar: 'from-blue-400 to-indigo-400', chip: 'bg-blue-400/20 text-blue-100' },
  violet: { icon: 'bg-violet-500/20 text-violet-200 border-violet-300/30', bar: 'from-violet-400 to-purple-400', chip: 'bg-violet-400/20 text-violet-100' },
  emerald: { icon: 'bg-emerald-500/20 text-emerald-200 border-emerald-300/30', bar: 'from-emerald-400 to-teal-400', chip: 'bg-emerald-400/20 text-emerald-100' },
  amber: { icon: 'bg-amber-500/20 text-amber-200 border-amber-300/30', bar: 'from-amber-400 to-orange-400', chip: 'bg-amber-400/20 text-amber-100' },
  rose: { icon: 'bg-rose-500/20 text-rose-200 border-rose-300/30', bar: 'from-rose-400 to-pink-400', chip: 'bg-rose-400/20 text-rose-100' },
  cyan: { icon: 'bg-cyan-500/20 text-cyan-200 border-cyan-300/30', bar: 'from-cyan-400 to-sky-400', chip: 'bg-cyan-400/20 text-cyan-100' },
  indigo: { icon: 'bg-indigo-500/20 text-indigo-200 border-indigo-300/30', bar: 'from-indigo-400 to-blue-400', chip: 'bg-indigo-400/20 text-indigo-100' },
  purple: { icon: 'bg-purple-500/20 text-purple-200 border-purple-300/30', bar: 'from-purple-400 to-fuchsia-400', chip: 'bg-purple-400/20 text-purple-100' },
  slate: { icon: 'bg-slate-500/20 text-slate-200 border-slate-300/30', bar: 'from-slate-400 to-slate-500', chip: 'bg-slate-400/20 text-slate-100' },
};

const PageHero: React.FC<PageHeroProps> = ({ title, subtitle, icon: Icon, accent = 'blue', breadcrumbs = [], actions }) => {
  const a = ACCENTS[accent] || ACCENTS.blue;
  return (
    <div className="premium-hero animate-slide-up mb-6">
      {/* Decorative floating orbs */}
      <div className={`absolute top-0 right-0 w-40 h-40 rounded-full bg-gradient-to-br ${a.bar} opacity-20 blur-3xl -translate-y-1/2 translate-x-1/4 animate-float`} />
      <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full bg-gradient-to-br from-white/10 to-white/5 opacity-30 blur-2xl" />

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs mb-3 text-blue-200/80">
          <Home className="w-3.5 h-3.5" />
          {breadcrumbs.map((c, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="w-3 h-3 text-blue-300/50" />
              <span className={i === breadcrumbs.length - 1 ? 'text-white font-semibold' : 'text-blue-200/70'}>{c}</span>
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          {Icon && (
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-lg shadow-black/20 ${a.icon}`}>
              <Icon className="w-6 h-6" />
            </div>
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-blue-100/80 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
};

export default PageHero;
