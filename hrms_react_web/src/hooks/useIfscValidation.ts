import { useState, useCallback, useRef } from 'react';
import api from '../services/api';

export interface IfscLookup {
  checking: boolean;
  ok: boolean;
  bank?: string;
  branch?: string;
  error?: string;
}

export function useIfscValidation() {
  const [status, setStatus] = useState<IfscLookup>({ checking: false, ok: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validate = useCallback(async (code: string): Promise<IfscLookup | null> => {
    const trimmed = (code || '').trim().toUpperCase();
    if (trimmed.length < 4) {
      setStatus({ checking: false, ok: false });
      return null;
    }
    setStatus({ checking: true, ok: false });
    try {
      const res = await api.get(`/billing/ifsc/${encodeURIComponent(trimmed)}`);
      const d = res.data;
      if (d.valid) {
        const st: IfscLookup = { checking: false, ok: true, bank: d.bank || '', branch: d.branch || '' };
        setStatus(st);
        return st;
      }
      const st: IfscLookup = { checking: false, ok: false, error: d.error || 'IFSC not found' };
      setStatus(st);
      return st;
    } catch {
      const st: IfscLookup = { checking: false, ok: false, error: 'Validation failed' };
      setStatus(st);
      return st;
    }
  }, []);

  // Debounced validator for onChange handlers
  const validateDebounced = useCallback((code: string) => {
    if (timer.current) clearTimeout(timer.current);
    const trimmed = (code || '').trim().toUpperCase();
    if (trimmed.length < 4) {
      setStatus({ checking: false, ok: false });
      return;
    }
    setStatus({ checking: true, ok: false });
    timer.current = setTimeout(() => {
      validate(trimmed).catch(() => {});
    }, 500);
  }, [validate]);

  const reset = useCallback(() => setStatus({ checking: false, ok: false }), []);

  return { status, validate, validateDebounced, reset };
}

export default useIfscValidation;
