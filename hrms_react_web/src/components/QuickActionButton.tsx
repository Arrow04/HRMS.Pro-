import React from 'react';

interface QuickActionButtonProps {
  icon: React.ElementType;
  label: string;
  description: string;
  accent: 'indigo' | 'emerald' | 'cyan' | 'rose' | 'orange' | 'violet' | 'teal' | 'pink' | 'amber' | 'lime' | 'slate' | 'gray' | 'blue';
  onClick: () => void;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({ icon: Icon, label, description, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left w-full transition-all duration-200 ease-smooth border"
      style={{
        backgroundColor: 'transparent',
        borderColor: '#CBD5E1',
        color: 'var(--sidebar-text)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
        e.currentTarget.style.color = 'var(--text-primary)';
        e.currentTarget.style.borderColor = '#94A3B8';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = 'var(--sidebar-text)';
        e.currentTarget.style.borderColor = '#CBD5E1';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Icon className="w-5 h-5 shrink-0 transition-colors duration-200" style={{ color: 'inherit' }} />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate whitespace-nowrap" style={{ color: 'inherit' }}>{label}</p>
        <p className="text-xs truncate whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      </div>
    </button>
  );
};

export default QuickActionButton;
