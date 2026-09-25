import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

interface SearchableSelectProps {
  value: string | number | 'all';
  onChange: (value: string | number | 'all') => void;
  options: Array<{ id: number | string; name: string }>;
  placeholder?: string;
  allOption?: string;
  className?: string;
  variant?: 'default' | 'hero';
  showAllOption?: boolean;
  /** when true, allows clearing back to '' (for form fields) and shows an empty option */
  clearable?: boolean;
  /** when true, keeps the provided option order instead of sorting alphabetically */
  preserveOrder?: boolean;
  /** when true, the select is disabled */
  disabled?: boolean;
}

const TRIGGER_VARIANTS = {
  default: 'bg-white border border-[#E2E8F0] hover:border-[#1C64F2] text-[#0F172A]',
  hero: 'bg-white/10 backdrop-blur-md border border-white/20 hover:border-white/40 text-white',
};

const VALUE_TEXT = {
  default: 'text-[#0F172A]',
  hero: 'text-white',
};

const PLACEHOLDER_TEXT = {
  default: 'text-[#64748B]',
  hero: 'text-blue-100/80',
};

const SearchableSelect = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  allOption = 'All',
  className = '',
  variant = 'default',
  showAllOption = true,
  clearable = false,
  preserveOrder = false,
  disabled = false,
}: SearchableSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.id === value || String(opt.id) === String(value)) || (value === 'all' ? { id: 'all', name: allOption } : null);

  const allLabel = options.find(opt => opt.id === 'all')?.name || allOption;

  const filteredOptions = options
    .filter(opt => opt.id !== 'all')
    .filter(opt => opt.name.toLowerCase().includes(searchTerm.toLowerCase()));
  if (!preserveOrder) {
    filteredOptions.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  const handleSelect = (id: string | number) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    onChange(showAllOption ? 'all' : '');
    setIsOpen(false);
  };

  const computePos = useCallback(() => {
    const el = dropdownRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    // Prefer below; let the menu use up to 60% of the viewport so long
    // lists (companies, branches, etc.) stay fully visible.
    const openBelow = spaceBelow >= 100 || spaceBelow >= spaceAbove;
    const menuH = openBelow
      ? Math.max(120, Math.min(Math.round(viewportH * 0.6), spaceBelow))
      : Math.max(120, Math.min(Math.round(viewportH * 0.6), spaceAbove));
    // When opening upward, anchor the menu's BOTTOM edge to the field so the
    // menu sits flush above it - no matter how tall its content turns out to be.
    if (openBelow) {
      return { top: rect.bottom + 6, left: rect.left, width: rect.width, menuH };
    }
    return { bottom: viewportH - rect.top + 6, left: rect.left, width: rect.width, menuH };
  }, []);

  const [menuH, setMenuH] = useState(240);
  const applyPos = useCallback(() => {
    const p = computePos();
    if (p) {
      setMenuPos({ top: p.top, bottom: (p as { bottom?: number }).bottom, left: p.left, width: p.width });
      setMenuH(p.menuH);
    }
  }, [computePos]);

  // Re-position the menu if the page scrolls or resizes while open
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => applyPos();
    const onResize = () => applyPos();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, applyPos]);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => {
      if (!prev) applyPos();
      return !prev;
    });
  }, [applyPos]);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggleOpen}
        className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-left flex items-center justify-between transition-colors ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : TRIGGER_VARIANTS[variant]}`}
        disabled={disabled}
      >
        <span className={`truncate ${selectedOption ? VALUE_TEXT[variant] : PLACEHOLDER_TEXT[variant]}`}>
          {selectedOption?.name || placeholder}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {value !== 'all' && value !== '' && (showAllOption || clearable) && (
            <X
              className={`w-4 h-4 ${variant === 'hero' ? 'text-blue-200/80 hover:text-white' : 'text-[#64748B] hover:text-[#C81E1E]'}`}
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            />
          )}
          <ChevronDown className={`w-4 h-4 ${variant === 'hero' ? 'text-blue-200/70' : 'text-[#64748B]'} transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, left: menuPos.left, width: menuPos.width, maxHeight: menuH, zIndex: 9999 }}
          className="bg-white border border-[#E2E8F0] rounded-xl shadow-lg overflow-auto"
        >
          <div className="p-2 border-b border-[#E2E8F0] sticky top-0 bg-white">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="py-1">
            {showAllOption && (
              <button
                type="button"
                onClick={() => handleSelect('all')}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-[#F8FAFC] transition-colors ${
                  value === 'all' ? 'bg-[#1C64F2]/10 text-[#1C64F2]' : 'text-[#0F172A]'
                }`}
              >
                {allLabel}
              </button>
            )}
            {clearable && !showAllOption && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-[#F8FAFC] transition-colors ${
                  value === '' ? 'bg-[#1C64F2]/10 text-[#1C64F2]' : 'text-[#64748B]'
                }`}
              >
                None
              </button>
            )}
            {filteredOptions.map((option) => (
              <button
                type="button"
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-[#F8FAFC] transition-colors ${
                  value === option.id ? 'bg-[#1C64F2]/10 text-[#1C64F2]' : 'text-[#0F172A]'
                }`}
              >
                {option.name}
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-4 py-2 text-sm text-[#64748B] text-center">
                No results found
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SearchableSelect;
