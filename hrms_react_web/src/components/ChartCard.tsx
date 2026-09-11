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

const ACCENTS: Record<string, { icon: string; iconBg: string; bar: string; glow: string; ring: string }> = {
  blue:    { icon: 'text-blue-600',    iconBg: 'bg-gradient-to-br from-blue-50 to-blue-100/80 border-blue-200/60',    bar: 'from-blue-500 via-blue-400 to-blue-300',    glow: 'from-blue-500/8',    ring: 'ring-blue-500/20' },
  emerald: { icon: 'text-emerald-600', iconBg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 border-emerald-200/60', bar: 'from-emerald-500 via-emerald-400 to-emerald-300', glow: 'from-emerald-500/8', ring: 'ring-emerald-500/20' },
  amber:   { icon: 'text-amber-600',   iconBg: 'bg-gradient-to-br from-amber-50 to-amber-100/80 border-amber-200/60',   bar: 'from-amber-500 via-amber-400 to-amber-300',   glow: 'from-amber-500/8',   ring: 'ring-amber-500/20' },
  rose:    { icon: 'text-rose-600',    iconBg: 'bg-gradient-to-br from-rose-50 to-rose-100/80 border-rose-200/60',    bar: 'from-rose-500 via-rose-400 to-rose-300',    glow: 'from-rose-500/8',    ring: 'ring-rose-500/20' },
  violet:  { icon: 'text-violet-600',  iconBg: 'bg-gradient-to-br from-violet-50 to-violet-100/80 border-violet-200/60',  bar: 'from-violet-500 via-violet-400 to-violet-300',  glow: 'from-violet-500/8',  ring: 'ring-violet-500/20' },
  indigo:  { icon: 'text-indigo-600',  iconBg: 'bg-gradient-to-br from-indigo-50 to-indigo-100/80 border-indigo-200/60',  bar: 'from-indigo-500 via-indigo-400 to-indigo-300',  glow: 'from-indigo-500/8',  ring: 'ring-indigo-500/20' },
  teal:    { icon: 'text-teal-600',    iconBg: 'bg-gradient-to-br from-teal-50 to-teal-100/80 border-teal-200/60',    bar: 'from-teal-500 via-teal-400 to-teal-300',    glow: 'from-teal-500/8',    ring: 'ring-teal-500/20' },
  cyan:    { icon: 'text-cyan-600',    iconBg: 'bg-gradient-to-br from-cyan-50 to-cyan-100/80 border-cyan-200/60',    bar: 'from-cyan-500 via-cyan-400 to-cyan-300',    glow: 'from-cyan-500/8',    ring: 'ring-cyan-500/20' },
  pink:    { icon: 'text-pink-600',    iconBg: 'bg-gradient-to-br from-pink-50 to-pink-100/80 border-pink-200/60',    bar: 'from-pink-500 via-pink-400 to-pink-300',    glow: 'from-pink-500/8',    ring: 'ring-pink-500/20' },
  purple:  { icon: 'text-purple-600',  iconBg: 'bg-gradient-to-br from-purple-50 to-purple-100/80 border-purple-200/60',  bar: 'from-purple-500 via-purple-400 to-purple-300',  glow: 'from-purple-500/8',  ring: 'ring-purple-500/20' },
  slate:   { icon: 'text-slate-600',   iconBg: 'bg-gradient-to-br from-slate-50 to-slate-100/80 border-slate-200/60',   bar: 'from-slate-500 via-slate-400 to-slate-300',   glow: 'from-slate-500/8',   ring: 'ring-slate-500/20' },
  orange:  { icon: 'text-orange-600',  iconBg: 'bg-gradient-to-br from-orange-50 to-orange-100/80 border-orange-200/60',  bar: 'from-orange-500 via-orange-400 to-orange-300',  glow: 'from-orange-500/8',  ring: 'ring-orange-500/20' },
};

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
      className={`group relative min-w-0 rounded-[20px] border border-gray-200/60 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_16px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.04)] hover:border-gray-300/60 hover:-translate-y-[2px] transition-all duration-500 ease-out animate-in fade-in slide-in-from-bottom-4 overflow-hidden`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top gradient accent bar */}
      <div className={`h-[3px] w-full bg-gradient-to-r ${a.bar} opacity-90`} />

      {/* Background decorative elements */}
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br opacity-[0.04] pointer-events-none transition-opacity duration-700 group-hover:opacity-[0.08]" style={{ backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))` }}>
        <div className={`w-full h-full rounded-full bg-gradient-to-br ${a.glow} to-transparent`} />
      </div>
      <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-gradient-to-tr opacity-[0.03] pointer-events-none">
        <div className={`w-full h-full rounded-full bg-gradient-to-tr ${a.glow} to-transparent`} />
      </div>

      {/* Content */}
      <div className="p-5 pb-4 relative">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {Icon && (
            <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center border ${a.iconBg} shadow-sm ring-1 ${a.ring} group-hover:scale-105 group-hover:shadow-md transition-all duration-300`}>
              <Icon className={`w-[18px] h-[18px] ${a.icon}`} />
            </div>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-[14px] font-bold text-gray-900 leading-snug truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5 truncate font-medium">{subtitle}</p>}
          </div>
        </div>

        {/* Chart area */}
        <div className="min-w-0 w-full" style={height ? { height } : { minHeight: 260 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default ChartCard;
