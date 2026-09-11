import React from 'react';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  accent?: string;
  children?: React.ReactNode;
  height?: number;
  delay?: number;
}

const ACCENTS: Record<string, { icon: string; bar: string; glow: string; headerBg: string; borderHover: string }> = {
  blue:    { icon: 'text-blue-600 bg-blue-50 border-blue-100',    bar: 'from-blue-500 to-blue-400',    glow: 'from-blue-500/10',    headerBg: 'from-blue-50/60 to-transparent',  borderHover: 'hover:border-blue-300/50' },
  emerald: { icon: 'text-emerald-600 bg-emerald-50 border-emerald-100', bar: 'from-emerald-500 to-emerald-400', glow: 'from-emerald-500/10', headerBg: 'from-emerald-50/60 to-transparent', borderHover: 'hover:border-emerald-300/50' },
  amber:   { icon: 'text-amber-600 bg-amber-50 border-amber-100', bar: 'from-amber-500 to-amber-400',   glow: 'from-amber-500/10',   headerBg: 'from-amber-50/60 to-transparent',   borderHover: 'hover:border-amber-300/50' },
  rose:    { icon: 'text-rose-600 bg-rose-50 border-rose-100',    bar: 'from-rose-500 to-rose-400',    glow: 'from-rose-500/10',    headerBg: 'from-rose-50/60 to-transparent',    borderHover: 'hover:border-rose-300/50' },
  violet:  { icon: 'text-violet-600 bg-violet-50 border-violet-100', bar: 'from-violet-500 to-violet-400', glow: 'from-violet-500/10', headerBg: 'from-violet-50/60 to-transparent',  borderHover: 'hover:border-violet-300/50' },
  indigo:  { icon: 'text-indigo-600 bg-indigo-50 border-indigo-100', bar: 'from-indigo-500 to-indigo-400', glow: 'from-indigo-500/10', headerBg: 'from-indigo-50/60 to-transparent',  borderHover: 'hover:border-indigo-300/50' },
  teal:    { icon: 'text-teal-600 bg-teal-50 border-teal-100',    bar: 'from-teal-500 to-teal-400',    glow: 'from-teal-500/10',    headerBg: 'from-teal-50/60 to-transparent',    borderHover: 'hover:border-teal-300/50' },
  cyan:    { icon: 'text-cyan-600 bg-cyan-50 border-cyan-100',    bar: 'from-cyan-500 to-cyan-400',    glow: 'from-cyan-500/10',    headerBg: 'from-cyan-50/60 to-transparent',    borderHover: 'hover:border-cyan-300/50' },
  pink:    { icon: 'text-pink-600 bg-pink-50 border-pink-100',    bar: 'from-pink-500 to-pink-400',    glow: 'from-pink-500/10',    headerBg: 'from-pink-50/60 to-transparent',    borderHover: 'hover:border-pink-300/50' },
  purple:  { icon: 'text-purple-600 bg-purple-50 border-purple-100', bar: 'from-purple-500 to-purple-400', glow: 'from-purple-500/10', headerBg: 'from-purple-50/60 to-transparent',  borderHover: 'hover:border-purple-300/50' },
  slate:   { icon: 'text-slate-600 bg-slate-50 border-slate-100',  bar: 'from-slate-500 to-slate-400',  glow: 'from-slate-500/10',  headerBg: 'from-slate-50/60 to-transparent',   borderHover: 'hover:border-slate-300/50' },
  orange:  { icon: 'text-orange-600 bg-orange-50 border-orange-100', bar: 'from-orange-500 to-orange-400', glow: 'from-orange-500/10', headerBg: 'from-orange-50/60 to-transparent',  borderHover: 'hover:border-orange-300/50' },
};

// Single source of truth: accent -> series hex colour, used by ChartCard visuals
// AND by charts so the plotted series always matches the card's accent.
export const ACCENT_COLORS: Record<string, string> = {
  blue: '#3B82F6',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  violet: '#8B5CF6',
  indigo: '#6366F1',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  pink: '#EC4899',
  purple: '#A855F7',
  slate: '#64748B',
  orange: '#F97316',
};

const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, icon: Icon, accent = 'blue', children, height, delay = 0 }) => {
  const a = ACCENTS[accent] || ACCENTS.blue;
  return (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-2xl border border-white/60 backdrop-blur-xl bg-white/70 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.1),0_16px_48px_-12px_rgba(0,0,0,0.12)] hover:border-white/80 hover:-translate-y-0.5 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top accent gradient bar — thicker, more vibrant */}
      <div className={`h-[3px] w-full bg-gradient-to-r ${a.bar}`} />

      {/* Soft corner glow — larger, more diffuse */}
      <div className={`absolute -top-24 -right-24 w-56 h-56 rounded-full bg-gradient-to-br ${a.glow} to-transparent blur-3xl pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity duration-500`} />

      {/* Subtle background gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${a.headerBg} opacity-40 pointer-events-none`} />

      <div className="p-5 relative flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {Icon && (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${a.icon} shadow-sm group-hover:scale-105 transition-transform duration-300`}>
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[#0F172A] leading-tight truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate font-medium">{subtitle}</p>}
          </div>
        </div>

        {/* Chart area */}
        <div className="min-w-0 w-full flex-1" style={height ? { height } : { minHeight: 280 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default ChartCard;
