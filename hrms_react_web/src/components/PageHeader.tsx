import React from 'react';
import { ChevronRight, Home, TrendingUp, TrendingDown } from 'lucide-react';

interface Stat {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red';
}

interface Breadcrumb {
  label: string;
  path?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  stats?: Stat[];
  children?: React.ReactNode;
  variant?: 'default' | 'gradient' | 'ocean' | 'purple' | 'sunset' | 'minimal';
}

const bgColorMap = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-orange-50 text-orange-700',
  purple: 'bg-violet-50 text-violet-700',
  red: 'bg-rose-50 text-rose-700',
};

export const PageHeader: React.FC<PageHeaderProps> = ({ 
  title, 
  subtitle, 
  breadcrumbs = [],
  stats = [],
  children,
  variant = 'default'
}) => {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm">
          <button className="flex items-center gap-1 text-gray-400 hover:text-blue-600 transition">
            <Home className="w-4 h-4" />
          </button>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              {crumb.path ? (
                <button className="text-gray-500 hover:text-blue-600 transition font-medium">
                  {crumb.label}
                </button>
              ) : (
                <span className="text-gray-900 font-semibold">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Main Header Card */}
      <div className={`
        relative overflow-hidden rounded-xl md:rounded-2xl 
        ${variant === 'gradient'
          ? 'bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-500 text-white shadow-2xl shadow-teal-500/20'
          : variant === 'ocean'
          ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white shadow-2xl shadow-indigo-500/20'
          : variant === 'purple'
          ? 'bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white shadow-2xl shadow-purple-500/20'
          : variant === 'sunset'
          ? 'bg-gradient-to-br from-orange-400 via-rose-500 to-pink-500 text-white shadow-2xl shadow-rose-500/20'
          : variant === 'minimal'
          ? 'bg-transparent'
          : 'bg-white border border-gray-200 shadow-lg shadow-gray-200/50'
        }
        p-4 md:p-6
      `}>
        {/* Decorative Elements */}
        {variant === 'gradient' && (
          <>
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          </>
        )}
        
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Title Section */}
            <div className="flex-1">
              <h1 className={`
                text-2xl md:text-3xl font-black uppercase tracking-tight
                ${variant === 'gradient' ? 'text-white' : 'text-gray-900'}
              `}>
                {title}
              </h1>
              {subtitle && (
                <p className={`
                  mt-1 md:mt-2 text-xs md:text-sm font-medium
                  ${variant === 'gradient' ? 'text-gray-300' : 'text-gray-500'}
                `}>
                  {subtitle}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            {children && (
              <div className="flex items-center gap-3 flex-wrap">
                {children}
              </div>
            )}
          </div>

          {/* Stats Grid */}
          {stats.length > 0 && (
            <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gray-200/20">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-4">
                {stats.map((stat, index) => (
                  <div 
                    key={index} 
                    className={`
                      relative overflow-hidden rounded-lg md:rounded-xl p-2 md:p-4
                      ${variant === 'gradient' 
                        ? 'bg-white/10 backdrop-blur-sm border border-white/10' 
                        : 'bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors'}
                    `}
                  >
                    {/* Trend Indicator */}
                    {stat.trend && stat.trend !== 'neutral' && (
                      <div className={`
                        absolute top-3 right-3 flex items-center gap-1 text-xs font-bold
                        ${stat.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}
                      `}>
                        {stat.trend === 'up' ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {stat.trendValue}
                      </div>
                    )}
                    
                    <div className="flex items-start gap-2 md:gap-3">
                      {stat.icon && (
                        <div className={`
                          w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center shrink-0
                          ${stat.color ? bgColorMap[stat.color] : 'bg-gray-100 text-gray-600'}
                        `}>
                          {stat.icon}
                        </div>
                      )}
                      <div>
                        <p className={`
                          text-[10px] md:text-xs font-bold uppercase tracking-wider
                          ${variant === 'gradient' ? 'text-gray-400' : 'text-gray-500'}
                        `}>
                          {stat.label}
                        </p>
                        <p className={`
                          text-lg md:text-2xl font-black mt-0.5 md:mt-1
                          ${variant === 'gradient' ? 'text-white' : 'text-gray-900'}
                        `}>
                          {stat.value}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
