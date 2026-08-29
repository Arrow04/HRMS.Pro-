interface StatusToggleProps {
  isActive: boolean;
  onChange: (active: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const StatusToggle = ({ isActive, onChange, size = 'md', disabled = false }: StatusToggleProps) => {
  const sizeClasses = {
    sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' },
    md: { track: 'w-12 h-6', thumb: 'w-5 h-5', translate: 'translate-x-6' },
    lg: { track: 'w-16 h-8', thumb: 'w-7 h-7', translate: 'translate-x-8' }
  };

  const { track, thumb, translate } = sizeClasses[size];

  const handleClick = () => {
    if (!disabled) {
      onChange(!isActive);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none ${
        isActive ? 'bg-green-500' : 'bg-red-500'
      } ${track} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
    >
      <span
        className={`inline-block bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
          isActive ? translate : 'translate-x-1'
        } ${thumb}`}
      />
      <span className={`absolute ${size === 'sm' ? 'text-[8px]' : size === 'md' ? 'text-[10px]' : 'text-xs'} font-black uppercase tracking-wider ${
        isActive ? 'left-1.5 text-white' : 'right-1.5 text-white'
      }`}>
        {isActive ? (size === 'sm' ? '' : 'ON') : (size === 'sm' ? '' : 'OFF')}
      </span>
    </button>
  );
};

export default StatusToggle;
