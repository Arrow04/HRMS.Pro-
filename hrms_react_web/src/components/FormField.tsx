import React, { type ReactNode } from 'react';

/** Standard single-line control height used across modal forms. */
export const FORM_CONTROL_HEIGHT = 'h-[42px]';

export const formInputClass =
  `w-full ${FORM_CONTROL_HEIGHT} px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]`;

/** Same height as inputs — scrolls if text overflows. */
export const formTextareaClass = `${formInputClass} resize-none overflow-y-auto leading-snug`;

export const formReadonlyClass = `${formInputClass} bg-[var(--background)] text-[var(--text-primary)] cursor-not-allowed select-none`;

interface FormFieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  help?: string;
  className?: string;
}

const FormField: React.FC<FormFieldProps> = ({ label, required, children, help, className = '' }) => (
  <div className={['flex flex-col', className].filter(Boolean).join(' ')}>
    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
    <div className={`${FORM_CONTROL_HEIGHT} flex items-stretch w-full [&>*]:h-full`}>{children}</div>
    <p className="mt-1 text-xs text-gray-400 min-h-[16px] leading-4">{help || '\u00A0'}</p>
  </div>
);

export default FormField;
