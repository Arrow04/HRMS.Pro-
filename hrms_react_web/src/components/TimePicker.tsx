import React, { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

function to12h(t24: string): string {
  if (!t24) return '';
  const [h, m] = t24.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

function inputTo24h(hh: string, mm: string, period: string): string {
  let h = parseInt(hh, 10) || 0;
  const min = parseInt(mm, 10) || 0;
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  if (h > 23) h = 23;
  return `${String(h).padStart(2, '0')}:${String(Math.min(min, 59)).padStart(2, '0')}`;
}

const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, className = '', required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hh, setHh] = useState('');
  const [mm, setMm] = useState('');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const ref = useRef<HTMLDivElement>(null);

  // Reset internal state when opened (or when value changes while open)
  const [prevOpenValue, setPrevOpenValue] = useState({ isOpen, value });
  if (prevOpenValue.isOpen !== isOpen || prevOpenValue.value !== value) {
    setPrevOpenValue({ isOpen, value });
    if (isOpen) {
      if (value) {
        const [h, m] = value.split(':').map(Number);
        setHh(String(h === 0 ? 12 : h > 12 ? h - 12 : h).padStart(2, '0'));
        setMm(String(m).padStart(2, '0'));
        setPeriod(h < 12 ? 'AM' : 'PM');
      } else {
        setHh('09');
        setMm('00');
        setPeriod('AM');
      }
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayText = value ? to12h(value) : 'Select time';

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] hover:bg-[#F1F5F9] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1C64F2] w-full ${className}`}
      >
        <Clock className="w-4 h-4 text-[#64748B] shrink-0" />
        <span className={value ? 'text-[#0F172A]' : 'text-[#94A3B8]'}>{displayText}</span>
      </button>
      <input type="hidden" value={value} required={required} />

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden p-4">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={hh}
              onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); if (v === '' || (parseInt(v) >= 1 && parseInt(v) <= 12)) setHh(v); }}
              className="w-14 text-center px-2 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
            />
            <span className="text-lg font-semibold text-[#64748B]">:</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={mm}
              onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= 59)) setMm(v); }}
              className="w-14 text-center px-2 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
            />
            <div className="flex flex-col gap-0.5 ml-1">
              <button
                type="button"
                onClick={() => setPeriod('AM')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${period === 'AM' ? 'bg-[#1C64F2] text-white' : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'}`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setPeriod('PM')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${period === 'PM' ? 'bg-[#1C64F2] text-white' : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'}`}
              >
                PM
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                if (hh && mm) {
                  onChange(inputTo24h(hh, mm, period));
                  setIsOpen(false);
                }
              }}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[#1C64F2] rounded-xl hover:bg-[#1E40AF] transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimePicker;
