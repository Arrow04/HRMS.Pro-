import React from 'react';

/** Consistent help text shown below form fields and in info panels. */
export default function HelpText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mt-1 text-[11px] leading-snug text-[var(--text-tertiary)] min-h-[16px] ${className}`}>
      {children}
    </p>
  );
}
