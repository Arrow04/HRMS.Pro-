import React from 'react';

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

const SectionCard = ({
  title,
  subtitle,
  icon: Icon,
  iconBg = 'bg-[#EFF6FF]',
  iconColor = 'text-[#1C64F2]',
  action,
  children,
  className = '',
  noPadding = false,
}: SectionCardProps) => {
  return (
    <div className={`bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4.5 h-4.5 ${iconColor}`} style={{ width: 18, height: 18 }} />
              </div>
            )}
            <div>
              {title && <h3 className="text-sm font-bold text-[#0F172A]">{title}</h3>}
              {subtitle && <p className="text-xs text-[#94A3B8] mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </div>
  );
};

export default SectionCard;
