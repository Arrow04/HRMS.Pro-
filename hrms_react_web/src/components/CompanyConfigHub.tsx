import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, Building2, Wallet, CalendarDays, Clock, Sun, Timer, Users, CheckCircle2,
  ArrowUpRight, AlertTriangle,
} from 'lucide-react';
import api from '../services/api';

interface HubSection { count: number; items: { id: number; name: string; status: string }[]; required: boolean; }
interface HubData {
  companyId: number; companyName: string; year: number; employeeCount: number;
  sections: Record<string, HubSection>;
  readySections: number; totalSections: number; completeness: number; complete: boolean;
}

const SECTION_META: { key: string; label: string; icon: any; hint: string; goTo: string }[] = [
  { key: 'payrollTemplates', label: 'Payroll Template', icon: Wallet, hint: 'Salary structure, statutory, tax — picked on the employee form.', goTo: '/payroll' },
  { key: 'leaveTemplates', label: 'Leave Template', icon: CalendarDays, hint: 'Yearly quotas resolve from here instantly — no bulk jobs.', goTo: '/leaves' },
  { key: 'attendanceTemplates', label: 'Attendance Template', icon: Clock, hint: 'Workweek, mapping, overtime, geo-fence rules.', goTo: '/attendance' },
  { key: 'holidays', label: 'Holiday Calendar', icon: Sun, hint: 'Paid days off for the year. Flag working days explicitly.', goTo: '/holidays' },
  { key: 'shifts', label: 'Shifts', icon: Timer, hint: 'Shift masters linked as template defaults.', goTo: '/attendance' },
];

export default function CompanyConfigHub({ companyId, companyName, onClose }: { companyId: number; companyName: string; onClose: () => void }) {
  const [year] = useState(new Date().getFullYear());
  const { data, isLoading } = useQuery<HubData>({
    queryKey: ['company-config', companyId, year],
    queryFn: async () => {
      const r = await api.get(`/api/companies/${companyId}/configuration`, { params: { year } });
      return r.data;
    },
  });

  const go = (path: string) => { window.location.href = path; };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#1C64F2bb] flex items-center justify-center text-white">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] leading-tight">Configure {companyName || data?.companyName}</h2>
              <p className="text-xs text-[#64748B]">Everything this company needs to run standalone — {data?.employeeCount ?? 0} active employees.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto">
          {isLoading || !data ? (
            <p className="text-sm text-center text-[var(--text-tertiary)] py-10">Loading configuration status…</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${data.complete ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${data.completeness}%` }} />
                </div>
                <span className="text-sm font-bold whitespace-nowrap">{data.completeness}% {data.complete ? 'complete' : `(${data.readySections}/${data.totalSections})`}</span>
              </div>
              {!data.complete && (
                <div className="flex items-start gap-2 mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Missing sections fall back to org defaults or skip silently — payroll for this company is not fully standalone until 100%. Create what's missing via the links below.</span>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {SECTION_META.map((m) => {
                  const s = data.sections[m.key];
                  const ready = !!s && s.count > 0;
                  return (
                    <div key={m.key} className="border border-[var(--border-color)] rounded-xl p-4 flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ready ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                          <m.icon className={`w-4 h-4 ${ready ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">{m.label}</div>
                        <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${ready ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                          {ready ? `${s.count} set` : 'Missing'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)] mb-2">{m.hint}</p>
                      {ready && s.items.slice(0, 3).map((it) => (
                        <div key={it.id} className="text-xs text-[var(--text-secondary)] truncate">• {it.name}</div>
                      ))}
                      {ready && s.items.length > 3 && (
                        <div className="text-[11px] text-[var(--text-tertiary)]">+{s.items.length - 3} more</div>
                      )}
                      <button onClick={() => go(m.goTo)}
                        className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--primary-blue)] hover:underline self-start">
                        {ready ? 'Manage' : 'Create now'} <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                <div className="border border-[var(--border-color)] rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Users className="w-4 h-4 text-[var(--primary-blue)]" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{data.employeeCount} active employees</div>
                    <div className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Balances auto-resolve from templates
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}
