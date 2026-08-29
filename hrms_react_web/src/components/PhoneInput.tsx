import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Phone } from 'lucide-react';

interface CountryCode {
  name: string;
  code: string;       // ISO2 e.g. "IN"
  dial: string;       // e.g. "+91"
}

// Static list of country calling codes (ISO2 + dial). No external API needed,
// fully offline, always available. Source: ITU E.164 + CLDR common names.
const COUNTRIES: CountryCode[] = [
  { name: 'India', code: 'IN', dial: '+91' },
  { name: 'United States', code: 'US', dial: '+1' },
  { name: 'United Kingdom', code: 'GB', dial: '+44' },
  { name: 'Canada', code: 'CA', dial: '+1' },
  { name: 'Australia', code: 'AU', dial: '+61' },
  { name: 'Germany', code: 'DE', dial: '+49' },
  { name: 'France', code: 'FR', dial: '+33' },
  { name: 'Singapore', code: 'SG', dial: '+65' },
  { name: 'United Arab Emirates', code: 'AE', dial: '+971' },
  { name: 'Saudi Arabia', code: 'SA', dial: '+966' },
  { name: 'Qatar', code: 'QA', dial: '+974' },
  { name: 'Kuwait', code: 'KW', dial: '+965' },
  { name: 'Bahrain', code: 'BH', dial: '+973' },
  { name: 'Oman', code: 'OM', dial: '+968' },
  { name: 'Nepal', code: 'NP', dial: '+977' },
  { name: 'Bangladesh', code: 'BD', dial: '+880' },
  { name: 'Sri Lanka', code: 'LK', dial: '+94' },
  { name: 'Pakistan', code: 'PK', dial: '+92' },
  { name: 'Afghanistan', code: 'AF', dial: '+93' },
  { name: 'Bhutan', code: 'BT', dial: '+975' },
  { name: 'Maldives', code: 'MV', dial: '+960' },
  { name: 'China', code: 'CN', dial: '+86' },
  { name: 'Japan', code: 'JP', dial: '+81' },
  { name: 'South Korea', code: 'KR', dial: '+82' },
  { name: 'Malaysia', code: 'MY', dial: '+60' },
  { name: 'Indonesia', code: 'ID', dial: '+62' },
  { name: 'Thailand', code: 'TH', dial: '+66' },
  { name: 'Vietnam', code: 'VN', dial: '+84' },
  { name: 'Philippines', code: 'PH', dial: '+63' },
  { name: 'Hong Kong', code: 'HK', dial: '+852' },
  { name: 'Taiwan', code: 'TW', dial: '+886' },
  { name: 'Brazil', code: 'BR', dial: '+55' },
  { name: 'Mexico', code: 'MX', dial: '+52' },
  { name: 'Argentina', code: 'AR', dial: '+54' },
  { name: 'Netherlands', code: 'NL', dial: '+31' },
  { name: 'Switzerland', code: 'CH', dial: '+41' },
  { name: 'Sweden', code: 'SE', dial: '+46' },
  { name: 'Norway', code: 'NO', dial: '+47' },
  { name: 'Denmark', code: 'DK', dial: '+45' },
  { name: 'Belgium', code: 'BE', dial: '+32' },
  { name: 'Ireland', code: 'IE', dial: '+353' },
  { name: 'Italy', code: 'IT', dial: '+39' },
  { name: 'Spain', code: 'ES', dial: '+34' },
  { name: 'Portugal', code: 'PT', dial: '+351' },
  { name: 'Poland', code: 'PL', dial: '+48' },
  { name: 'Russia', code: 'RU', dial: '+7' },
  { name: 'Turkey', code: 'TR', dial: '+90' },
  { name: 'Egypt', code: 'EG', dial: '+20' },
  { name: 'South Africa', code: 'ZA', dial: '+27' },
  { name: 'Kenya', code: 'KE', dial: '+254' },
  { name: 'Nigeria', code: 'NG', dial: '+234' },
  { name: 'New Zealand', code: 'NZ', dial: '+64' },
].sort((a, b) => a.name.localeCompare(b.name));

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;              // receives full number incl. dial code
  onDialChange?: (dial: string) => void;
  defaultDial?: string;
  placeholder?: string;
  inputClassName?: string;
  disabled?: boolean;
  onBlur?: () => void;
  'data-tooltip-id'?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  onDialChange,
  defaultDial = '+91',
  placeholder = 'Phone number',
  inputClassName = '',
  disabled,
  onBlur,
  ...rest
}) => {
  const [dial, setDial] = useState(defaultDial);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const stripDial = (raw: string) => (raw || '').replace(/^\+\d{1,4}\s?/, '');

  // If a default dial is provided/changes after mount (e.g. app country loads
  // async), adopt it — but only when the user hasn't picked one yet.
  useEffect(() => {
    if (defaultDial) {
      setDial((prev) => {
        const local = stripDial(value).replace(/[^\d]/g, '');
        return local ? prev : defaultDial;
      });
    }
  }, [defaultDial, value, stripDial]);

  const selected = COUNTRIES.find((c) => c.dial === dial) || { name: 'Select', code: '', dial };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const choose = (c: CountryCode) => {
    setDial(c.dial);
    setOpen(false);
    setSearch('');
    onDialChange?.(c.dial);
    // Keep any existing local number the user typed, but switch to the new dial.
    const local = localDisplay.slice(0, LOCAL_MAX[c.dial] ?? 15);
    onChange(local ? `${c.dial} ${local}` : '');
  };

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dial.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  // Max length of the LOCAL (dial-free) number per country code.
  // E.164 subscriber numbers: India + most countries = 10 digits.
  const LOCAL_MAX: Record<string, number> = {
    '+91': 10, '+880': 10, '+92': 10, '+977': 10, '+94': 10, '+975': 10, '+960': 10,
    '+65': 8, '+971': 9, '+966': 9, '+974': 8, '+965': 8, '+973': 8, '+968': 8,
    '+1': 10, '+44': 10, '+61': 9, '+49': 11, '+33': 9, '+86': 11, '+81': 10,
  };
  const localMax = LOCAL_MAX[dial] ?? 15;

  const localDisplay = stripDial(value).replace(/[^\d]/g, '');

  const handleInput = (raw: string) => {
    const local = raw.replace(/[^\d]/g, '');
    onChange(`${dial}${local ? ' ' + local.slice(0, localMax) : ''}`);
  };

  return (
    <div className="relative flex" ref={dropdownRef} {...rest}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1 px-3 py-2 border border-r-0 border-[var(--border-color)] rounded-l-lg bg-white text-sm text-[var(--text-primary)] hover:bg-gray-50 focus:outline-none focus:ring-2 whitespace-nowrap disabled:opacity-50"
      >
        <Phone className="w-4 h-4 text-gray-400" />
        <span className="font-medium">{dial}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>
      <input
        type="tel"
        value={localDisplay}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputClassName || 'w-full px-3 py-2 border border-[var(--border-color)] rounded-r-lg focus:outline-none focus:ring-2'} disabled:opacity-50`}
      />

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code..."
              className="w-full py-1.5 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code + c.dial}
                type="button"
                onClick={() => choose(c)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                  c.dial === dial ? 'bg-blue-50 text-blue-700 font-medium' : 'text-[var(--text-primary)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-5 h-3.5 rounded-sm bg-gray-100 border border-gray-200 inline-block overflow-hidden text-[8px] leading-3 text-center font-bold">
                    {c.code}
                  </span>
                  {c.name}
                </span>
                <span className="text-gray-400 font-medium">{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-6">No country found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneInput;
