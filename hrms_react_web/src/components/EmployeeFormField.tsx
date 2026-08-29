import React from 'react';
import FormField, { FORM_CONTROL_HEIGHT } from './FormField';

interface EmployeeFormFieldProps {
  label: React.ReactNode;
  help?: string;
  error?: React.ReactNode;
  /** Textareas / uploads — allow taller content but keep minimum row height */
  multiline?: boolean;
  children: React.ReactNode;
}

/** Standard field cell for EmployeeFormModal — 4-col grid, uniform 42px controls */
const EmployeeFormField: React.FC<EmployeeFormFieldProps> = ({
  label,
  help,
  error,
  multiline = false,
  children,
}) => (
  <div className="flex flex-col">
    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{label}</label>
    <div
      className={
        multiline
          ? 'min-h-[42px] flex items-stretch w-full'
          : `${FORM_CONTROL_HEIGHT} flex items-stretch w-full [&>*]:h-full`
      }
    >
      {children}
    </div>
    {error}
    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">{help || '\u00A0'}</p>
  </div>
);

export default EmployeeFormField;
