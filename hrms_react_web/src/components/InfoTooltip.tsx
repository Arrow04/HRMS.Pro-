import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/** Inline info icon with a custom floating tooltip rendered in a portal. */
export default function InfoTooltip({ text, className = '' }: { text: string; className?: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; align: 'center' | 'left' }>({ top: 0, left: 0, align: 'center' });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const showTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 200;
    const centerX = rect.left + rect.width / 2;
    let align: 'center' | 'left' = 'center';
    let left = centerX;

    if (centerX + tooltipWidth / 2 > window.innerWidth - 16) {
      align = 'left';
      left = window.innerWidth - tooltipWidth - 16;
    } else if (centerX - tooltipWidth / 2 < 16) {
      left = tooltipWidth / 2 + 16;
    }

    setPos({ top: rect.bottom + 8, left, align });
  }, []);

  const handleEnter = useCallback(() => {
    clearTimeout(hideTimeout.current);
    showTimeout.current = setTimeout(() => {
      updatePosition();
      setShow(true);
    }, 100);
  }, [updatePosition]);

  const handleLeave = useCallback(() => {
    clearTimeout(showTimeout.current);
    hideTimeout.current = setTimeout(() => {
      setShow(false);
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(showTimeout.current);
      clearTimeout(hideTimeout.current);
    };
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center ml-1 cursor-help relative ${className}`}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <Info className="w-4 h-4 text-[var(--text-tertiary)] hover:text-[var(--primary-blue)] transition-colors" />
      </span>
      {show && createPortal(
        <span
          className="fixed z-[99999] px-3 py-2 text-[11px] leading-[1.4] text-white bg-slate-800 rounded-xl shadow-xl pointer-events-none"
          style={{
            top: pos.top,
            left: pos.left,
            transform: pos.align === 'center' ? 'translateX(-50%)' : 'none',
            maxWidth: '200px',
            width: 'max-content',
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            textAlign: 'center',
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {text}
        </span>,
        document.body
      )}
    </>
  );
}
