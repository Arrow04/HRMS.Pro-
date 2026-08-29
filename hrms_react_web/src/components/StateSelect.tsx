import SearchableSelect from './SearchableSelect';
import { INDIAN_STATE_OPTIONS } from '../constants/indianStates';

interface StateSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const StateSelect: React.FC<StateSelectProps> = ({
  value,
  onChange,
  placeholder = 'Select State',
  className = 'w-full',
  disabled = false,
}) => (
  <SearchableSelect
    value={value}
    onChange={(v) => onChange(v === '' ? '' : String(v))}
    options={INDIAN_STATE_OPTIONS}
    placeholder={placeholder}
    showAllOption={false}
    clearable
    className={className}
    disabled={disabled}
  />
);

export default StateSelect;
