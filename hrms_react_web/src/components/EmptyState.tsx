import React from 'react';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#94A3B8]" />
      </div>
      <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
      {description && <p className="text-sm text-[#94A3B8] mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};

export default EmptyState;
