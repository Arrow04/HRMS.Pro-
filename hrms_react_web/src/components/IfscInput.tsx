import React, { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import useIfscValidation from '../hooks/useIfscValidation';

interface IfscInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onValidated?: (bank: string, branch: string) => void;
  disabled?: boolean;
}

const IfscInput: React.FC<IfscInputProps> = ({
  value,
  onChange,
  placeholder = 'HDFC0001234',
  className = '',
  inputClassName = '',
  onValidated,
  disabled,
}) => {
  const { status, validateDebounced } = useIfscValidation();
  const [showStatus, setShowStatus] = useState(false);

  const handleChange = (v: string) => {
    onChange(v);
    validateDebounced(v);
    setShowStatus(true);
  };

  const resolvedCls = status.ok
    ? '!border-emerald-500 !ring-2 !ring-emerald-500/30'
    : status.error
      ? '!border-red-400'
      : '';

  return (
    <div className={className}>
      <div className="relative flex items-stretch">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setShowStatus(false)}
          onFocus={() => setShowStatus(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={`flex-1 ${inputClassName || 'w-full px-3 py-2 border rounded-lg focus:outline-none'} ${resolvedCls} ${status.checking ? 'pr-9' : status.ok || status.error ? 'pr-9' : ''}`}
        />
        {status.checking && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            null
          </span>
        )}
        {!status.checking && status.ok && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />}
        {!status.checking && status.error && <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500 pointer-events-none" />}
      </div>
      {showStatus && status.ok && (
        <p className="mt-1 text-xs text-emerald-600">
          {status.bank}{status.branch ? ` · ${status.branch}` : ''}
        </p>
      )}
      {showStatus && status.error && (
        <p className="mt-1 text-xs text-red-500">{status.error}</p>
      )}
    </div>
  );
};

export default IfscInput;
