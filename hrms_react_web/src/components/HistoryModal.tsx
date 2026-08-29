import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, User, Clock, ShieldCheck, LogIn, Edit3, Trash2, Eye, Inbox, PlusCircle, PenLine } from 'lucide-react';
import Modal from './Modal';
import api from '../services/api';

interface HistoryEntry {
  id: number;
  action: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  userName?: string;
  userEmail?: string;
  changes?: Record<string, unknown>;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  createdAt?: string;
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string | number;
  entityLabel?: string;
}

const ACTION_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  create: { icon: LogIn, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Created' },
  created: { icon: LogIn, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Created' },
  update: { icon: Edit3, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Updated' },
  updated: { icon: Edit3, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Updated' },
  edit: { icon: Edit3, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Edited' },
  delete: { icon: Trash2, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Deleted' },
  deleted: { icon: Trash2, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Deleted' },
  toggle_active: { icon: ShieldCheck, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Activated' },
  toggle_inactive: { icon: ShieldCheck, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', label: 'Deactivated' },
  login: { icon: Eye, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200', label: 'Logged in' },
};

const renderValue = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  const s = String(v);
  // Hide giant base64 payloads (logos/images) — just say "uploaded"
  if (s.length > 200 && /base64/i.test(s)) return 'â¬† uploaded';
  return s;
};

/** Try to parse a Python-style dict string like "{'name': 'x', 'code': 'y'}" */
const tryParseDict = (raw: unknown): Record<string, unknown> | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    // Replace Python single quotes with JSON double quotes (best-effort)
    const jsonLike = trimmed
      .replace(/'/g, '"')
      .replace(/None/g, 'null')
      .replace(/True/g, 'true')
      .replace(/False/g, 'false');
    const parsed = JSON.parse(jsonLike);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
  } catch {
    return null;
  }
};

/** Skip huge/irrelevant diff fields (base64 blobs, ids) */
const isSkippableField = (key: string, value: unknown): boolean => {
  const s = String(value ?? '');
  if (/logo|image|photo|avatar|signature|base64|data:image/i.test(key)) return true;
  if (s.length > 200 && /base64|data:image/i.test(s)) return true;
  return false;
};

/** Build a clean {key: value} map for a log entry, merging parsed dicts + changes */
const buildEntries = (log: HistoryEntry): Record<string, unknown> => {
  const merged: Record<string, unknown> = {};

  const parseInto = (raw: unknown) => {
    const parsed = tryParseDict(raw);
    if (parsed) {
      Object.entries(parsed).forEach(([k, v]) => {
        if (!isSkippableField(k, v)) merged[k] = v;
      });
    }
  };

  // newValues/oldValues may hold the full stringified dict under "value"
  if (log.newValues) {
    if (log.newValues['value'] !== undefined) parseInto(log.newValues['value']);
    else Object.entries(log.newValues).forEach(([k, v]) => {
      if (!isSkippableField(k, v)) merged[k] = v;
    });
  }
  if (log.changes) {
    Object.entries(log.changes).forEach(([k, v]) => {
      if (!isSkippableField(k, v)) merged[k] = v;
    });
  }
  return merged;
};

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, entityType, entityId, entityLabel }) => {
  const { data: logs = [], isLoading } = useQuery<HistoryEntry[]>({
    queryKey: ['entity-history', entityType, entityId],
    queryFn: async () => {
      const res = await api.get('/entity-history', { params: { entityType, entityId: String(entityId) } });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isOpen && !!entityType && entityId !== undefined && entityId !== null && entityId !== '',
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change History">
      <div className="space-y-1 min-w-0 break-words">
        {entityLabel && (
          <p className="text-sm text-[#64748B] mb-3">
            <span className="font-semibold text-[#0F172A]">{entityLabel}</span>
            {' '}
            <span className="text-[#94A3B8]">· {entityType.replace(/_/g, ' ')} #{entityId}</span>
          </p>
        )}

        {isLoading ? (
          null
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-[#94A3B8]">
            <Inbox className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm font-medium">No change history recorded for this record</p>
          </div>
        ) : (
          <>
            {/* Creation & last-updated summary */}
            {(() => {
              const created = logs.find((l) => (l.action || '').toLowerCase().includes('creat')) || logs[logs.length - 1];
              const updated = logs[0];
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                    <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <PlusCircle className="w-3.5 h-3.5" /> Created
                    </p>
                    <p className="text-sm font-medium text-[#0F172A] flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-600" /> {created?.userName || 'System'}
                    </p>
                    <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3" /> {created?.createdAt ? new Date(created.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
                    <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <PenLine className="w-3.5 h-3.5" /> Last Updated
                    </p>
                    <p className="text-sm font-medium text-[#0F172A] flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-600" /> {updated?.userName || '—'}
                    </p>
                    <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3" /> {updated?.createdAt ? new Date(updated.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Full timeline */}
            <div className="relative pl-1">
              <div className="space-y-4">
                {logs.map((log) => {
                  const meta = ACTION_META[log.action] || { icon: History, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', label: log.action || 'Action' };
                  const Icon = meta.icon;
                  return (
                    <div key={log.id} className="flex gap-3 animate-slide-up">
                      <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 bg-white border border-[#E2E8F0] rounded-xl p-3.5 min-w-0 break-words">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]">
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-[#94A3B8] flex items-center gap-1 whitespace-nowrap">
                            <Clock className="w-3 h-3 shrink-0" />
                            {log.createdAt ? new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 text-sm">
                          <User className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                          <span className="font-medium text-[#0F172A]">{log.userName || 'System'}</span>
                          {log.userEmail && <span className="text-xs text-[#94A3B8]">({log.userEmail})</span>}
                        </div>
                        {(() => {
                          const entries = Object.entries(buildEntries(log));
                          if (entries.length === 0) return null;
                          return (
                            <div className="mt-2 space-y-1">
                              {entries.slice(0, 8).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-2 text-xs">
                                  <span className="font-medium text-[#64748B] capitalize w-28 shrink-0 truncate">{key.replace(/_/g, ' ')}:</span>
                                  <span className="text-emerald-600 font-medium break-all">{renderValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        {log.ipAddress && (
                          <p className="text-[11px] text-[#94A3B8] mt-2 flex items-center gap-1 break-all">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#CBD5E1] shrink-0" /> IP: {log.ipAddress}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default HistoryModal;
