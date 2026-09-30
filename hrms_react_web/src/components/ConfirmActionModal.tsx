import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Ban, Trash2 } from 'lucide-react';
import { DEMO_NO_GUARDS } from '../config/demo';

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  /** "Are you sure?" body - e.g. "You are about to deactivate Reyansh Upadhyay." */
  message: string;
  /** Consequence warning box text */
  consequence: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'success' = green (activate/approve), 'warning' = amber (deactivate/reject), 'danger' = red (delete), 'info' = blue */
  variant?: 'default' | 'danger' | 'success' | 'warning';
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIG: Record<string, { head: string; body: string; icon: React.ReactNode; btn: string }> = {
  danger: { head: 'bg-red-50 border-red-100', body: 'bg-red-50 text-red-700 border-red-200', icon: <Trash2 className="w-5 h-5" />, btn: 'bg-[#DC2626] hover:bg-red-700' },
  success: { head: 'bg-emerald-50 border-emerald-100', body: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-5 h-5" />, btn: 'bg-[#10B981] hover:bg-[#059669]' },
  warning: { head: 'bg-amber-50 border-amber-100', body: 'bg-amber-50 text-amber-800 border-amber-200', icon: <Ban className="w-5 h-5" />, btn: 'bg-[#F59E0B] hover:bg-[#D97706]' },
  info: { head: 'bg-cyan-50 border-cyan-100', body: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: <AlertTriangle className="w-5 h-5" />, btn: 'bg-[#0891B2] hover:bg-[#0E7490]' },
  purple: { head: 'bg-purple-50 border-purple-100', body: 'bg-purple-50 text-purple-700 border-purple-200', icon: <CheckCircle2 className="w-5 h-5" />, btn: 'bg-[#7C3AED] hover:bg-[#6D28D9]' },
  default: { head: 'bg-blue-50 border-blue-100', body: 'bg-amber-50 text-amber-800 border-amber-200', icon: <AlertTriangle className="w-5 h-5" />, btn: 'bg-[#1C64F2] hover:bg-[#1E40AF]' },
};

const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  title,
  message,
  consequence,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isPending = false,
  onConfirm,
  onCancel,
}) => {
  // Demo mode: skip the dialog entirely — confirm the moment it opens.
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  });
  const firedRef = useRef(false);
  useEffect(() => {
    if (DEMO_NO_GUARDS && isOpen && !firedRef.current && !isPending) {
      firedRef.current = true;
      confirmRef.current();
    }
    if (!isOpen) firedRef.current = false;
  }, [isOpen, isPending]);
  if (DEMO_NO_GUARDS) return null;
  if (!isOpen) return null;
  const c = CONFIG[variant] || CONFIG.default;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className={`px-6 py-4 border-b ${c.head}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.head.split(' ')[0]} ${c.head.includes('red') ? 'text-red-600' : c.head.includes('emerald') ? 'text-emerald-600' : c.head.includes('amber') ? 'text-amber-600' : 'text-blue-600'}`}>
              {c.icon}
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
          <div className={`p-3 rounded-xl text-sm border ${c.body}`}>
            <span className="font-semibold">Consequence: </span>{consequence}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={isPending} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={isPending} className={`px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${c.btn}`}>
            {isPending ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmActionModal;
