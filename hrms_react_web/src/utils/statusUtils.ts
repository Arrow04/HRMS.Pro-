/** Capitalize first letter of a status string for display */
export function capitalizeStatus(status: string): string {
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Returns Tailwind class string for status badges */
export function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-[var(--success-green)]/10 text-[var(--success-green)] border border-[var(--success-green)]/20',
    approved: 'bg-[var(--success-green)]/10 text-[var(--success-green)] border border-[var(--success-green)]/20',
    completed: 'bg-[var(--success-green)]/10 text-[var(--success-green)] border border-[var(--success-green)]/20',
    processed: 'bg-[var(--primary-blue)]/10 text-[var(--primary-blue)] border border-[var(--primary-blue)]/20',
    disbursed: 'bg-[var(--primary-blue)]/10 text-[var(--primary-blue)] border border-[var(--primary-blue)]/20',
    pending: 'bg-[var(--warning-amber)]/10 text-[var(--warning-amber)] border border-[var(--warning-amber)]/20',
    revised: 'bg-[var(--warning-amber)]/10 text-[var(--warning-amber)] border border-[var(--warning-amber)]/20',
    submitted: 'bg-purple-100 text-purple-700 border border-purple-200',
    draft: 'bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)] border border-[var(--text-tertiary)]/20',
    drafted: 'bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)] border border-[var(--text-tertiary)]/20',
    inactive: 'bg-[var(--danger-red)]/10 text-[var(--danger-red)] border border-[var(--danger-red)]/20',
    rejected: 'bg-[var(--danger-red)]/10 text-[var(--danger-red)] border border-[var(--danger-red)]/20',
    new: 'bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20',
    onboarding: 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20',
  };
  return map[status.toLowerCase()] || 'bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)] border border-[var(--text-tertiary)]/20';
}

/** Returns inline badge color styles for dynamic rendering */
export function getStatusBadgeStyle(status: string): { bg: string; text: string; border: string } {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    active: { bg: 'rgba(5,122,85,0.1)', text: 'var(--success-green)', border: 'rgba(5,122,85,0.2)' },
    approved: { bg: 'rgba(5,122,85,0.1)', text: 'var(--success-green)', border: 'rgba(5,122,85,0.2)' },
    completed: { bg: 'rgba(5,122,85,0.1)', text: 'var(--success-green)', border: 'rgba(5,122,85,0.2)' },
    processed: { bg: 'rgba(28,100,242,0.1)', text: 'var(--primary-blue)', border: 'rgba(28,100,242,0.2)' },
    pending: { bg: 'rgba(217,119,6,0.1)', text: 'var(--warning-amber)', border: 'rgba(217,119,6,0.2)' },
    submitted: { bg: 'rgba(28,100,242,0.1)', text: 'var(--primary-blue)', border: 'rgba(28,100,242,0.2)' },
    draft: { bg: 'rgba(100,116,139,0.1)', text: 'var(--text-tertiary)', border: 'rgba(100,116,139,0.2)' },
    inactive: { bg: 'rgba(200,30,30,0.1)', text: 'var(--danger-red)', border: 'rgba(200,30,30,0.2)' },
    rejected: { bg: 'rgba(200,30,30,0.1)', text: 'var(--danger-red)', border: 'rgba(200,30,30,0.2)' },
    new: { bg: 'rgba(20,184,166,0.1)', text: 'var(--accent-teal)', border: 'rgba(20,184,166,0.2)' },
    onboarding: { bg: 'rgba(126,34,206,0.1)', text: 'var(--accent-purple)', border: 'rgba(126,34,206,0.2)' },
  };
  return map[status.toLowerCase()] || { bg: 'rgba(100,116,139,0.1)', text: 'var(--text-tertiary)', border: 'rgba(100,116,139,0.2)' };
}

/** Deterministic hash so a given status always maps to the same color */
function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Palette of distinct color schemes (badge + modal chip + ring) */
const ATTENDANCE_PALETTE: { badge: string; chip: string; ring: string }[] = [
  { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', chip: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-500/30 border-emerald-500' },
  { badge: 'bg-red-50 text-red-700 border-red-200', chip: 'bg-red-50 text-red-600', ring: 'ring-red-500/30 border-red-500' },
  { badge: 'bg-amber-50 text-amber-700 border-amber-200', chip: 'bg-amber-50 text-amber-600', ring: 'ring-amber-500/30 border-amber-500' },
  { badge: 'bg-blue-50 text-blue-700 border-blue-200', chip: 'bg-blue-50 text-blue-600', ring: 'ring-blue-500/30 border-blue-500' },
  { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', chip: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-500/30 border-indigo-500' },
  { badge: 'bg-purple-50 text-purple-700 border-purple-200', chip: 'bg-purple-50 text-purple-600', ring: 'ring-purple-500/30 border-purple-500' },
  { badge: 'bg-orange-50 text-orange-700 border-orange-200', chip: 'bg-orange-50 text-orange-600', ring: 'ring-orange-500/30 border-orange-500' },
  { badge: 'bg-sky-50 text-sky-700 border-sky-200', chip: 'bg-sky-50 text-sky-600', ring: 'ring-sky-500/30 border-sky-500' },
  { badge: 'bg-teal-50 text-teal-700 border-teal-200', chip: 'bg-teal-50 text-teal-600', ring: 'ring-teal-500/30 border-teal-500' },
  { badge: 'bg-rose-50 text-rose-700 border-rose-200', chip: 'bg-rose-50 text-rose-600', ring: 'ring-rose-500/30 border-rose-500' },
  { badge: 'bg-pink-50 text-pink-700 border-pink-200', chip: 'bg-pink-50 text-pink-600', ring: 'ring-pink-500/30 border-pink-500' },
  { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', chip: 'bg-cyan-50 text-cyan-600', ring: 'ring-cyan-500/30 border-cyan-500' },
  { badge: 'bg-lime-50 text-lime-700 border-lime-200', chip: 'bg-lime-50 text-lime-600', ring: 'ring-lime-500/30 border-lime-500' },
  { badge: 'bg-violet-50 text-violet-700 border-violet-200', chip: 'bg-violet-50 text-violet-600', ring: 'ring-violet-500/30 border-violet-500' },
  { badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', chip: 'bg-fuchsia-50 text-fuchsia-600', ring: 'ring-fuchsia-500/30 border-fuchsia-500' },
  { badge: 'bg-slate-100 text-slate-600 border-slate-200', chip: 'bg-slate-100 text-slate-600', ring: 'ring-slate-500/30 border-slate-500' },
];

/** Curated colors for well-known attendance statuses (name or code) */
const ATTENDANCE_CURATED: Record<string, number> = {
  present: 0, active: 0, approved: 0, completed: 0,
  absent: 1, rejected: 1,
  half_day: 2, halfday: 2, pending: 2,
  on_leave: 3, leave: 3, onleave: 3, submitted: 3,
  work_from_home: 4, wfh: 4, remote: 4,
  holiday: 5, on_holiday: 5, onholiday: 5,
  late: 6, early_departure: 6, early: 6,
  sick_leave: 7, sickleave: 7,
  vacation: 8, on_vacation: 8,
  personal: 9, personal_leave: 9,
  maternity: 10,
  paternity: 11,
  weekend: 15, unmarked: 15, off: 15,
  overtime: 12, overtime_work: 12,
};

/** Returns a stable, distinct color for any attendance status (dynamic for unknown values) */
export function getAttendanceStatusColor(status: string): { badge: string; chip: string; ring: string } {
  const norm = (status || '').toLowerCase().trim().replace(/[\s_]+/g, '_');
  const curatedIdx = ATTENDANCE_CURATED[norm];
  if (curatedIdx !== undefined) return ATTENDANCE_PALETTE[curatedIdx];
  const dyn = hashCode(status) % ATTENDANCE_PALETTE.length;
  return ATTENDANCE_PALETTE[dyn];
}

/** Distinct color scheme for every attendance status (dynamic for unknown values) */
export function getAttendanceStatusBadge(status: string): string {
  return getAttendanceStatusColor(status).badge;
}

/** Curated colors for well-known leave statuses */
const LEAVE_CURATED: Record<string, number> = {
  approved: 0, active: 0, completed: 0, processed: 0,
  rejected: 1, declined: 1,
  pending: 2, half_day: 2,
  submitted: 3, on_leave: 3, onleave: 3,
  in_progress: 6, taken: 6,
  cancelled: 15, cancel: 15, closed: 15, draft: 15, withdrawn: 15,
};

/** Returns a stable, distinct color for any leave status (dynamic for unknown values) */
export function getLeaveStatusColor(status: string): { badge: string; chip: string; ring: string } {
  const norm = (status || '').toLowerCase().trim().replace(/[\s_]+/g, '_');
  const curatedIdx = LEAVE_CURATED[norm];
  if (curatedIdx !== undefined) return ATTENDANCE_PALETTE[curatedIdx];
  const dyn = hashCode(status) % ATTENDANCE_PALETTE.length;
  return ATTENDANCE_PALETTE[dyn];
}

/** Distinct color scheme for every leave status (dynamic for unknown values) */
export function getLeaveStatusBadge(status: string): string {
  return getLeaveStatusColor(status).badge;
}
