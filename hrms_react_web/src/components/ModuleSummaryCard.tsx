import React from 'react';

interface ModuleSummaryCardProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  accent: 'blue' | 'cyan' | 'rose' | 'orange' | 'violet' | 'teal' | 'pink' | 'emerald' | 'indigo' | 'purple' | 'amber';
  stats: { label: string; value: string | number }[];
}

const ACCENT_MAP: Record<string, { gradient: string; iconBg: string; iconText: string; border: string }> = {
  cyan: { gradient: 'from-cyan-500/10 to-cyan-400/5', iconBg: 'bg-cyan-100 dark:bg-cyan-900/30', iconText: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-800' },
  rose: { gradient: 'from-rose-500/10 to-rose-400/5', iconBg: 'bg-rose-100 dark:bg-rose-900/30', iconText: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800' },
  orange: { gradient: 'from-orange-500/10 to-orange-400/5', iconBg: 'bg-orange-100 dark:bg-orange-900/30', iconText: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  violet: { gradient: 'from-violet-500/10 to-violet-400/5', iconBg: 'bg-violet-100 dark:bg-violet-900/30', iconText: 'text-violet-600 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-800' },
  teal: { gradient: 'from-teal-500/10 to-teal-400/5', iconBg: 'bg-teal-100 dark:bg-teal-900/30', iconText: 'text-teal-600 dark:text-teal-400', border: 'border-teal-200 dark:border-teal-800' },
  pink: { gradient: 'from-pink-500/10 to-pink-400/5', iconBg: 'bg-pink-100 dark:bg-pink-900/30', iconText: 'text-pink-600 dark:text-pink-400', border: 'border-pink-200 dark:border-pink-800' },
  emerald: { gradient: 'from-emerald-500/10 to-emerald-400/5', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconText: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  indigo: { gradient: 'from-indigo-500/10 to-indigo-400/5', iconBg: 'bg-indigo-100 dark:bg-indigo-900/30', iconText: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-800' },
  blue: { gradient: 'from-blue-500/10 to-blue-400/5', iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconText: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  purple: { gradient: 'from-purple-500/10 to-purple-400/5', iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconText: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  amber: { gradient: 'from-amber-500/10 to-amber-400/5', iconBg: 'bg-amber-100 dark:bg-amber-900/30', iconText: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
};

const ModuleSummaryCard: React.FC<ModuleSummaryCardProps> = ({ icon: Icon, title, subtitle, accent, stats }) => {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.blue;

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 bg-gradient-to-br ${a.gradient} ${a.border}`}
      style={{ backgroundColor: 'var(--card)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${a.iconBg} ${a.iconText}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        {stats.map((stat, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>{stat.label}</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModuleSummaryCard;
