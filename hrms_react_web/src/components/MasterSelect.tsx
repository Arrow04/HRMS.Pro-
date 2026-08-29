import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, Globe, Clock, CalendarDays, CalendarRange, Tag } from 'lucide-react';

export interface MasterSelectOption {
  code: string;
  name: string;
}

interface MasterSelectProps {
  value: string;
  onChange: (code: string) => void;
  options: MasterSelectOption[];
  /** optional icon shown in the trigger + options (defaults to a generic Tag) */
  icon?: React.ElementType;
  /** optional subtitle rendered under the main label in the trigger */
  subtitle?: string;
  placeholder?: string;
}

// Split "America/Los_Angeles (PST)" into label + detail
const splitLabel = (name: string, code: string) => {
  const paren = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (paren) {
    return { label: paren[1].trim(), detail: paren[2].trim() };
  }
  // fallback: use name, detail = code if different
  return { label: name, detail: code && code !== name ? code : '' };
};

const MasterSelect = ({ value, onChange, options, icon: Icon = Tag, subtitle, placeholder = 'Select...' }: MasterSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 10);
  }, [isOpen]);

  const computePos = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    const top = rect.bottom + 6;
    const menuH = Math.min(300, 260);
    const bottom = top + menuH;
    const finalTop = bottom > window.innerHeight ? Math.max(8, rect.top - menuH - 6) : top;
    return { top: finalTop, left: rect.left, width: rect.width };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => { const p = computePos(); if (p) setMenuPos(p); };
    const onResize = () => { const p = computePos(); if (p) setMenuPos(p); };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, computePos]);

  const parsed = options.map((o) => ({ code: o.code, ...splitLabel(o.name, o.code) }));
  const current = parsed.find((p) => p.code === value) || parsed[0] || { code: value, label: value, detail: '' };

  const filtered = parsed.filter((p) =>
    !search || p.code.toLowerCase().includes(search.toLowerCase()) || p.label.toLowerCase().includes(search.toLowerCase()) || p.detail.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) setMenuPos(computePos());
      return !prev;
    });
  }, [computePos]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm text-[#0F172A] hover:border-[#1C64F2] transition-colors"
      >
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] flex items-center justify-center text-[#1C64F2] shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 text-left min-w-0">
          <span className="block font-semibold text-[#0F172A] truncate">{current.label || placeholder}</span>
          <span className="block text-xs text-[#94A3B8] truncate">{current.detail || subtitle || ''}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[#94A3B8] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, zIndex: 9999 }}
          className="bg-white border border-[#E2E8F0] rounded-xl shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-[#F1F5F9] bg-white">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
              <Search className="w-3.5 h-3.5 text-[#94A3B8]" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-[#0F172A] placeholder-[#94A3B8]"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[#94A3B8]">No options found</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => { onChange(p.code); setIsOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                    p.code === current.code ? 'bg-[#EFF6FF]' : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] flex items-center justify-center text-[#1C64F2] shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-[#0F172A] truncate">{p.label}</span>
                    {p.detail && <span className="block text-xs text-[#94A3B8] truncate">{p.detail}</span>}
                  </span>
                  {p.code === current.code && <Check className="w-4 h-4 text-[#1C64F2] shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MasterSelect;
