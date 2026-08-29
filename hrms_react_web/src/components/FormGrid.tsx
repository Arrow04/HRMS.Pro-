import React from 'react';

interface FormGridProps {
  children: React.ReactNode;
  className?: string;
}

/** 4-column modal form grid — 4 cols from md (768px) so full-width drawers use 4 fields per row. */
export const formGridClass = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4';

const FormGrid: React.FC<FormGridProps> = ({ children, className = '' }) => (
  <div className={[formGridClass, className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

export default FormGrid;
