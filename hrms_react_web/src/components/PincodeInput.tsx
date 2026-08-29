import { formInputClass } from './FormField';

interface PincodeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

const PincodeInput: React.FC<PincodeInputProps> = ({
  value,
  onChange,
  className = formInputClass,
  placeholder = '6-digit pincode',
  disabled = false,
}) => (
  <input
    type="text"
    inputMode="numeric"
    maxLength={6}
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
    className={className}
    placeholder={placeholder}
  />
);

export default PincodeInput;
