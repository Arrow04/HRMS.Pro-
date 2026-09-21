import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  helpText?: string;
  onColor?: string;
  offColor?: string;
  align?: 'left' | 'center';
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ 
  checked, 
  onChange, 
  disabled = false,
  helpText,
  onColor = 'bg-green-500',
  offColor = 'bg-red-500',
  align = 'center',
}) => {
  return (
    <div className={`flex flex-col gap-1 ${align === 'left' ? 'items-start' : 'items-center'}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) {
            onChange(!checked);
          }
        }}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? onColor : offColor
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        title={helpText || (checked ? 'Click to deactivate' : 'Click to activate')}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export default ToggleSwitch;
