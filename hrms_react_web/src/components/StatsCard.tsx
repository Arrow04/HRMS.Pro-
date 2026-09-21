import { useEffect, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

interface StatsCardProps {
  icon: React.ElementType;
  label: React.ReactNode;
  value: number | string;
  trend?: number | string;
  tooltip?: string;
  isLoading?: boolean;
  /** Use `color` for built-in palette, or `iconBg`+`iconColor` for custom */
  color?: string;
  iconBg?: string;
  iconColor?: string;
  delay?: number;
  /** animate the number counting up when it first appears */
  animate?: boolean;
  /** optional click handler — makes the card interactive */
  onClick?: () => void;
}

const COLOR_MAP: Record<string, { bg: string; text: string; icon: string; gradient: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'text-blue-600', gradient: 'bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-blue-300/5' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'text-emerald-600', gradient: 'bg-gradient-to-br from-emerald-500/20 via-emerald-400/10 to-emerald-300/5' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', icon: 'text-orange-600', gradient: 'bg-gradient-to-br from-orange-500/20 via-orange-400/10 to-orange-300/5' },
  purple: { bg: 'bg-violet-100', text: 'text-violet-700', icon: 'text-violet-600', gradient: 'bg-gradient-to-br from-violet-500/20 via-violet-400/10 to-violet-300/5' },
  red: { bg: 'bg-rose-100', text: 'text-rose-700', icon: 'text-rose-600', gradient: 'bg-gradient-to-br from-rose-500/20 via-rose-400/10 to-rose-300/5' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', icon: 'text-teal-600', gradient: 'bg-gradient-to-br from-teal-500/20 via-teal-400/10 to-teal-300/5' },
};

const useCountUp = (target: number, active: boolean, duration = 700) => {
  const [display, setDisplay] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (!active) { setDisplay(target); return; }
    const start = prevTarget.current;
    const delta = target - start;
    if (delta === 0) return;
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + delta * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else prevTarget.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);

  return display;
};

const StatsCard = ({ icon: Icon, label, value, trend, tooltip, isLoading, color, iconBg, iconColor, delay = 0, animate = true, onClick }: StatsCardProps) => {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  const displayValue = useCountUp(numericValue, animate && !isLoading && typeof value === 'number', 800);

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-2xl p-4 border border-gray-200 bg-white shadow-sm min-h-[120px]">
        <div className="flex items-start justify-between gap-2">
          <div className="w-11 h-11 rounded-xl skeleton-shimmer shrink-0" />
          <div className="w-14 h-5 rounded-full skeleton-shimmer" />
        </div>
        <div className="mt-3">
          <div className="w-20 h-3 rounded-full skeleton-shimmer mb-2" />
          <div className="w-16 h-7 rounded-lg skeleton-shimmer" />
        </div>
      </div>
    );
  }

  const palette = color ? COLOR_MAP[color] : undefined;
  const bgClass = iconBg || palette?.gradient || 'bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-blue-300/5';
  const iconClass = iconColor || palette?.icon || 'text-blue-600';
  const trendIsDown = typeof trend === 'number' && trend < 0;
  const trendColor = trendIsDown ? 'text-red-600' : 'text-emerald-600';

  const cardClass = `group relative overflow-hidden rounded-2xl p-4 hover:shadow-md transition-all duration-300 border border-white/40 backdrop-blur-md bg-white/80 shadow-sm min-w-0 ${onClick ? 'cursor-pointer hover:border-[#1C64F2]/40 hover:-translate-y-0.5' : ''}`;

  const inner = (
    <>
      <div className={`absolute inset-0 ${bgClass} opacity-100`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className={`w-11 h-11 rounded-xl bg-white/80 backdrop-blur-sm shadow-sm border border-white/50 flex items-center justify-center shrink-0 ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/80 backdrop-blur-sm shrink-0 ${trendColor}`}>
            <TrendingUp className={`w-3 h-3 ${Number(trend) < 0 ? 'rotate-180' : ''}`} />
            {Math.abs(Number(trend))}%
          </span>
        )}
      </div>
      <div className="relative z-10 mt-3 min-w-0">
        <p className="text-[13px] font-medium text-[#475569] truncate inline-flex items-center gap-1">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </p>
        <p className="text-2xl font-bold text-[#0F172A] leading-tight tracking-tight mt-0.5">
          {typeof value === 'number' ? displayValue.toLocaleString() : value}
        </p>
      </div>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={`${cardClass} text-left w-full`} style={{ animationDelay: `${delay}ms` }}>
      {inner}
    </button>
  ) : (
    <div className={cardClass} style={{ animationDelay: `${delay}ms` }}>
      {inner}
    </div>
  );
};

export default StatsCard;
