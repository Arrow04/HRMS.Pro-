import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Save, X, Check, Undo2, Clock, CalendarDays, CalendarRange, CalendarClock, CheckSquare, Pencil, TrendingUp, CalendarPlus, LayoutGrid, Download } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import toast from 'react-hot-toast';
import SearchableSelect from './SearchableSelect';
import ConfirmActionModal from './ConfirmActionModal';
import type { Employee } from '../types';
import { personDisplayName } from '../utils/employeeNameUtils';

interface AttendanceStatusOption {
  code: string;
  name: string;
}

interface CalendarEmployee extends Employee {
  first_name?: string;
  last_name?: string;
  employee_code?: string;
  code?: string;
}

interface CalendarDay {
  id?: number;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  type?: string;
  name?: string;
  isManualEntry?: boolean;
  isEarlyDeparture?: boolean;
}

interface ApiErrorResponse {
  response?: { data?: { detail?: string } };
  message?: string;
}

interface DayUpdate {
  dateStr: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
}

interface AuditLogEntry {
  id: number;
  attendanceId?: number | null;
  employeeId?: number | null;
  date?: string | null;
  action: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  changedFields?: string[] | null;
  actionBy?: number | null;
  actorName?: string;
  reason?: string | null;
  createdAt?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  employee: CalendarEmployee | null;
  attendanceStatusOptions?: AttendanceStatusOption[];
}

type ViewMode = 'month' | 'week' | 'day';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const DEFAULT_STATUS_OPTIONS: AttendanceStatusOption[] = [
  { code: 'present', name: 'Present' },
  { code: 'absent', name: 'Absent' },
  { code: 'late', name: 'Late' },
  { code: 'half_day', name: 'Half Day' },
  { code: 'on_leave', name: 'On Leave' },
  { code: 'work_from_home', name: 'Work From Home' },
];

function pickColor(code: string, hue: number) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = code.charCodeAt(i) + ((hash << 5) - hash);
  const sat = 40 + (Math.abs(hash) % 25);       // 40-65
  const litDot = 40 + (Math.abs(hash >> 4) % 20); // 40-60
  const litBg = 90 + (Math.abs(hash >> 6) % 8);   // 90-98
  const litBd = 75 + (Math.abs(hash >> 2) % 15);  // 75-90
  return {
    dot: `hsl(${hue} ${sat}% ${litDot}%)`,
    bg: `hsl(${hue} ${sat - 10}% ${litBg}%)`,
    bd: `hsl(${hue} ${sat - 5}% ${litBd}%)`,
  };
}
const BASE_HUES: [string[], number][] = [
  [['present', 'double', 'extra'], 142],
  [['absent', 'missing'], 0],
  [['late'], 38],
  [['half'], 270],
  [['leave', 'off_day'], 210],
  [['wfh', 'home', 'remote'], 187],
  [['duty', 'tour', 'travel'], 24],
  [['holiday'], 217],
];
function statusColors(code: string) {
  const c = code.toLowerCase();
  if (c.includes('off') || c.includes('weekend') || c.includes('rest') || c === 'week_off') {
    return { dot: 'hsl(220 20% 42%)', bg: 'hsl(220 25% 93%)', bd: 'hsl(220 20% 78%)' };
  }
  for (const [keywords, hue] of BASE_HUES) if (keywords.some(k => c.includes(k))) return pickColor(c, hue);
  let hash = 0;
  for (let i = 0; i < c.length; i++) hash = c.charCodeAt(i) + ((hash << 5) - hash);
  return pickColor(c, ((hash * 0.6180339887) % 1 + 1) * 180);
}
function statusDisplayName(code: string, options?: AttendanceStatusOption[]) {
  if (!code) return '';
  const opt = options?.find((o: AttendanceStatusOption) => o.code === code);
  const map: Record<string, string> = {
    present:'Present', absent:'Absent', late:'Late', half_day:'Half Day', on_leave:'On Leave',
    work_from_home:'WFH', holiday:'Holiday', casual:'Casual Leave', sick:'Sick Leave',
    week_off:'Week Off', casual_leave:'Casual Leave', sick_leave:'Sick Leave',
    vacation:'Vacation', personal:'Personal', maternity:'Maternity', paternity:'Paternity',
  };
  const name = opt?.name || map[code] || code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  // Leave types must read as leave: "Personal" -> "Personal Leave" (skip if already suffixed)
  const c = code.toLowerCase();
  if ((LEAVE_CODES.has(c) || c.includes('leave')) && !/leave/i.test(name)) return `${name} Leave`;
  return name;
}

function formatTime(v?: string) {
  if (!v) return '';
  const t = v.includes('T') ? (v.split('T')[1] || '') : v;
  const p = t.split(':');
  if (p.length < 2) return v;
  const h = parseInt(p[0], 10);
  const m = parseInt(p[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return v;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

function toTimeInput(v?: string) {
  if (!v) return '';
  const t = v.includes('T') ? (v.split('T')[1] || '') : v;
  const p = t.split(':');
  if (p.length < 2) return '';
  return `${String(parseInt(p[0], 10)).padStart(2, '0')}:${String(p[1]).slice(0, 2)}`;
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function toMinutes(t?: string) {
  if (!t) return 0;
  const p = t.includes('T') ? (t.split('T')[1] || '') : t;
  const parts = p.split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const LEAVE_CODES = new Set(['on_leave', 'leave', 'casual', 'sick', 'casual_leave', 'sick_leave', 'vacation', 'personal', 'maternity', 'paternity', 'half_leave']);
const OFF_CODES = new Set(['off_day', 'week_off', 'weekend', 'holiday', 'none', '']);
const ABSENT_CODES = new Set(['absent', 'missing']);

function isLeaveStatus(s: string) {
  if (!s) return false;
  return LEAVE_CODES.has(s) || s.includes('leave');
}

function isAttendedStatus(s: string) {
  if (!s) return false;
  if (isLeaveStatus(s)) return false;
  if (OFF_CODES.has(s)) return false;
  if (ABSENT_CODES.has(s)) return false;
  if (s.includes('off') || s.includes('absent') || s.includes('missing') || s.includes('holiday')) return false;
  return true;
}

const EmployeeCalendarEditor = ({ isOpen, onClose, employee, attendanceStatusOptions }: Props) => {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>('month');
  const [focusDate, setFocusDate] = useState<Date>(() => new Date());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('present');
  const [multiSelect, setMultiSelect] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('present');
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const dragRef = useRef<{ start: string; end: string } | null>(null);

  useEffect(() => { if (isOpen) { setSelectedDates([]); setEditingDay(null); setHoverDay(null); dragRef.current = null; } }, [isOpen]);

  const navigate = (dir: number) => {
    setFocusDate(d => {
      const nd = new Date(d);
      if (view === 'month') nd.setMonth(nd.getMonth() + dir);
      else if (view === 'week') nd.setDate(nd.getDate() + dir * 7);
      else nd.setDate(nd.getDate() + dir);
      return nd;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'Escape') { setEditingDay(null); setShowJump(false); }
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', onKey);
    const onUp = () => { dragRef.current = null; setDragStart(null); };
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isOpen, view, navigate]);

  const employeeId = employee?.id;
  const month = focusDate.getMonth();
  const year = focusDate.getFullYear();

  // Employee-wise attendance finalize (soft flag) for the focused month/year.
  const { data: finalizeStatus } = useQuery({
    queryKey: ['attendance-status', employeeId, year, month],
    queryFn: async () => {
      if (!employeeId) return null;
      const r = await api.get('/payroll/attendance-status', { params: { month: month + 1, year, employeeId } });
      return r.data || null;
    },
    enabled: !!employeeId,
  });
  const finalizeEmployeeMutation = useMutation({
    mutationFn: (reopen: boolean) => api.post(reopen ? '/payroll/reopen-attendance' : '/payroll/finalize-attendance', { month: month + 1, year, employeeId }),
    onSuccess: () => {
      toast.success(finalizeStatus?.finalized ? 'Attendance reopened' : 'Attendance finalized');
      setShowFinalizeConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['attendance-status'] });
    },
    onError: () => toast.error('Failed to update finalize status'),
  });
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  const weekStart = useMemo(() => {
    const d = new Date(focusDate);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }, [focusDate]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
  [weekStart]);

  const monthsToFetch = useMemo(() => {
    const months: { year: number; month: number }[] = [];
    const seen = new Set<string>();
    const dates = view === 'month'
      ? [new Date(year, month, 15)]
      : view === 'week' ? weekDays : [focusDate];
    dates.forEach(d => {
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (!seen.has(k)) { seen.add(k); months.push({ year: d.getFullYear(), month: d.getMonth() }); }
    });
    // Always include the focused month so monthly aggregates stay complete in any view.
    const focusKey = `${year}-${month}`;
    if (!seen.has(focusKey)) months.push({ year, month });
    return months;
  }, [view, year, month, weekDays, focusDate]);

  const { data: calendar, isLoading } = useQuery({
    queryKey: ['employee-calendar', employeeId, monthsToFetch.map(m => `${m.year}-${m.month}`).join('|')],
    queryFn: async () => {
      if (!employeeId) return { days: {}, workdays: null };
      const results = await Promise.all(
        monthsToFetch.map(m => api.get(`/attendance/employee/${employeeId}/calendar`, {
          params: { month: m.month + 1, year: m.year },
        }))
      );
      const merged: Record<string, CalendarDay> = {};
      results.forEach(r => Object.assign(merged, (r.data as { days?: Record<string, CalendarDay>; calendar?: Record<string, CalendarDay> })?.days || (r.data as any)?.calendar || {}));
      const first = results[0]?.data as { workdays?: number[] } | undefined;
      return { days: merged, workdays: first?.workdays || null };
    },
    enabled: isOpen && !!employeeId,
  });

  const days: Record<string, CalendarDay> = calendar?.days || {};
  const employeeWorkdays: number[] = calendar?.workdays || [0, 1, 2, 3, 4, 5, 6];
  const workdaySet = useMemo(() => new Set(employeeWorkdays.map(Number)), [employeeWorkdays]);
  const isConfiguredWorkday = (d: Date) => workdaySet.has(d.getDay());
  const statusOptions = attendanceStatusOptions?.length ? attendanceStatusOptions : DEFAULT_STATUS_OPTIONS;

  const todayStr = fmtDate(new Date());
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    const presentTimes: string[] = [];
    const checkOutTimes: string[] = [];
    const dateList = view === 'month'
      ? Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
      : view === 'week' ? weekDays : [focusDate];
    let weekdays = 0;
    let holidays = 0;
    let attended = 0;
    let earlyDepartures = 0;
    dateList.forEach(d => {
      const ds = fmtDate(d);
      const rec = days[ds];
      if (rec?.type === 'holiday') {
        holidays++;
        return;
      }
      if (rec) {
        const s = (rec.status || '').toLowerCase();
        if (s) counts[s] = (counts[s] || 0) + 1;
        if (isAttendedStatus(s)) attended++;
        if (rec.isEarlyDeparture) earlyDepartures++;
        if (s === 'present' && rec.checkIn) presentTimes.push(rec.checkIn);
        if (rec.checkOut) checkOutTimes.push(rec.checkOut);
      }
      if (workdaySet.has(d.getDay())) weekdays++;
    });
    return { counts, holidays, attended, earlyDepartures, total: dateList.filter(d => days[fmtDate(d)]).length, weekdays, presentTimes, checkOutTimes };
  }, [view, days, month, year, daysInMonth, weekDays, focusDate, workdaySet]);

  const presentDays = stats.counts['present'] || 0;
  const absentDays = stats.counts['absent'] || 0;
  const onLeaveDays = Object.keys(stats.counts)
    .filter(k => isLeaveStatus(k))
    .reduce((acc, k) => acc + (stats.counts[k] || 0), 0);
  // Per-type leave breakdown for the legend (casual, sick, earned, ...), non-zero only
  const leaveBreakdown = useMemo(
    () => Object.keys(stats.counts)
      .filter(k => isLeaveStatus(k) && (stats.counts[k] || 0) > 0)
      .sort((a, b) => (stats.counts[b] || 0) - (stats.counts[a] || 0)),
    [stats.counts]
  );
  const recordedDays = stats.total;

  const pieData = useMemo(() => {
    const c = stats.counts;
    const rows: { name: string; value: number; color: string }[] = [];
    Object.keys(c).forEach(code => {
      const v = c[code];
      if (!v) return;
      rows.push({ name: statusDisplayName(code, attendanceStatusOptions), value: v, color: statusColors(code).dot });
    });
    if (stats.holidays > 0) rows.push({ name: 'Holiday', value: stats.holidays, color: statusColors('holiday').dot });
    return rows.sort((a, b) => b.value - a.value);
  }, [stats.counts, stats.holidays, attendanceStatusOptions]);

  const weeklyData = useMemo(() => {
    type Row = Record<string, string | number> & { name: string };
    const codeFor = (d: Date): string => {
      const rec = days[fmtDate(d)];
      if (rec?.type === 'holiday') return 'holiday';
      const s = (rec?.status || '').toLowerCase();
      return s || 'none';
    };
    const addTo = (row: Row, code: string) => {
      row[code] = ((row[code] as number) || 0) + 1;
    };

    if (view === 'week') {
      const row: Row = { name: `Week ${getWeekNumber(weekDays[0])}` };
      weekDays.forEach(d => addTo(row, codeFor(d)));
      return [row];
    }

    if (view === 'day') {
      const row: Row = { name: DAY_SHORT[focusDate.getDay()] };
      addTo(row, codeFor(focusDate));
      return [row];
    }

    const weeks: Row[] = [];
    for (let r = 0; r < 6; r++) {
      const firstDayNum = r * 7 - firstDay + 1;
      if (firstDayNum < 1 || firstDayNum > daysInMonth) continue;
      const row: Row = { name: `W${getWeekNumber(new Date(year, month, firstDayNum))}` };
      for (let i = 0; i < 7; i++) {
        const day = firstDayNum + i;
        if (day < 1 || day > daysInMonth) continue;
        addTo(row, codeFor(new Date(year, month, day)));
      }
      weeks.push(row);
    }
    return weeks;
  }, [days, view, month, year, daysInMonth, weekDays, focusDate, firstDay]);

  const weeklyStatuses = useMemo(() => {
    const seen = new Set<string>();
    weeklyData.forEach(row => Object.keys(row).forEach(k => { if (k !== 'name') seen.add(k); }));
    return [...seen].sort((a, b) => {
      const sumA = weeklyData.reduce((acc, row) => acc + ((row[a] as number) || 0), 0);
      const sumB = weeklyData.reduce((acc, row) => acc + ((row[b] as number) || 0), 0);
      return sumB - sumA;
    });
  }, [weeklyData]);

  const formatAvgTime = (times: string[]): string | null => {
    if (!times.length) return null;
    const mins = times.map(t => {
      const p = t.split(':');
      return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
    });
    const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    const h = Math.floor(avg / 60);
    const m = avg % 60;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
  };

  const avgCheckIn = formatAvgTime(stats.presentTimes);
  const avgCheckOut = formatAvgTime(stats.checkOutTimes);

  const attendedDays = stats.attended;

  const attendanceRate = stats.weekdays > 0
    ? Math.round((attendedDays / stats.weekdays) * 100)
    : 0;

  const workHours = useMemo(() => {
    const dateList = view === 'month'
      ? Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
      : view === 'week' ? weekDays : [focusDate];
    const durations: number[] = [];
    dateList.forEach(d => {
      const rec = days[fmtDate(d)];
      if (rec && isAttendedStatus((rec.status || '').toLowerCase()) && rec.checkIn && rec.checkOut) {
        const diff = toMinutes(rec.checkOut) - toMinutes(rec.checkIn);
        if (diff > 0) durations.push(diff);
      }
    });
    const total = durations.reduce((a, b) => a + b, 0);
    return {
      total,
      avg: durations.length ? Math.round(total / durations.length) : 0,
      days: durations.length,
    };
  }, [view, days, year, month, daysInMonth, weekDays, focusDate]);

  const { data: yearData } = useQuery({
    queryKey: ['employee-year', employeeId, year],
    queryFn: async () => {
      if (!employeeId) return { months: {} };
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, m) => api.get(`/attendance/employee/${employeeId}/calendar`, {
          params: { month: m + 1, year },
        }))
      );
      const months: Record<number, Record<string, CalendarDay>> = {};
      results.forEach((r, m) => {
        months[m] = (r.data as { days?: Record<string, CalendarDay>; calendar?: Record<string, CalendarDay> })?.days || (r.data as any)?.calendar || {};
      });
      return { months };
    },
    enabled: isOpen && !!employeeId && showStats,
  });

  const yearMonths = yearData?.months || {};

  const yearPresentByMonth = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const dmap = yearMonths[m] || {};
      let present = 0;
      Object.values(dmap).forEach(d => { if ((d.status || '').toLowerCase() === 'present') present++; });
      return { name: MONTHS[m], present };
    });
  }, [yearMonths]);

  const { data: auditLogs } = useQuery({
    queryKey: ['attendance-logs', employeeId, editingDay],
    queryFn: async () => {
      if (!employeeId || !editingDay) return [];
      const { data } = await api.get('/attendance/logs', { params: { employeeId, date: editingDay, limit: 20 } });
      return Array.isArray(data) ? data as AuditLogEntry[] : [];
    },
    enabled: isOpen && !!employeeId && !!editingDay,
  });

  const saveAllMutation = useMutation({
    mutationFn: async ({ updates }: { updates: DayUpdate[] }) => {
      const results = [];
      for (const u of updates) {
        const existing = days[u.dateStr];
        const payload: Record<string, unknown> = {
          employeeId,
          date: u.dateStr,
          status: u.status,
          checkIn: u.checkIn ?? existing?.checkIn ?? '',
          checkOut: u.checkOut ?? existing?.checkOut ?? '',
        };
        if (existing?.id) {
          results.push(api.put(`/attendance/${existing.id}`, payload));
        } else {
          results.push(api.post('/attendance/manual', payload));
        }
      }
      await Promise.all(results);
    },
    onSuccess: () => {
      toast.success('Changes saved');
      queryClient.invalidateQueries({ queryKey: ['employee-calendar', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-logs', employeeId] });
      setSelectedDates([]);
      setEditingDay(null);
    },
    onError: (err: unknown) => {
      const errObj = err as ApiErrorResponse;
      const msg = errObj?.response?.data?.detail || errObj?.message || 'Failed to save some records';
      toast.error(msg);
      // Error logged
    },
  });

  const openEditor = (dateStr: string) => {
    const d = days[dateStr];
    setEditStatus(d?.status || 'present');
    setEditCheckIn(toTimeInput(d?.checkIn) || '');
    setEditCheckOut(toTimeInput(d?.checkOut) || '');
    setEditingDay(dateStr);
  };

  const handleDayClick = (dateStr: string) => {
    if (multiSelect) {
      setSelectedDates(prev => prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]);
    } else {
      openEditor(dateStr);
    }
  };

  const handleDayMouseDown = (dateStr: string) => {
    if (!multiSelect) return;
    dragRef.current = { start: dateStr, end: dateStr };
    setDragStart(dateStr);
  };

  const handleDayMouseEnter = (dateStr: string) => {
    if (!dragRef.current) return;
    dragRef.current.end = dateStr;
    setDragStart(dragRef.current.start);
    const { start, end } = dragRef.current;
    const s = new Date(start + 'T00:00:00').getTime();
    const e = new Date(end + 'T00:00:00').getTime();
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    const range: string[] = [];
    for (let t = lo; t <= hi; t += 86400000) {
      const d = new Date(t);
      if (d.getMonth() === month && d.getFullYear() === year) range.push(fmtDate(d));
    }
    setSelectedDates(range);
  };

  const clearDrag = () => { dragRef.current = null; setDragStart(null); };

  const exportPDF = () => {
    if (!employee) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Attendance Calendar - ${personDisplayName(employee)}`, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${MONTHS[month]} ${year} Â· Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, 14, 25);
    const rows: (string | number)[][] = [];
    const header = ['Date', 'Day', 'Status', 'Check-in', 'Check-out', 'Hours'];
    Array.from({ length: daysInMonth }, (_, i) => {
      const dt = new Date(year, month, i + 1);
      const dateStr = fmtDate(dt);
      const d = days[dateStr];
      const status = d?.type === 'holiday' ? 'Holiday' : (statusDisplayName(d?.status || '', attendanceStatusOptions) || (d ? '' : 'No record'));
      const hours = d?.checkIn && d?.checkOut ? formatDuration(toMinutes(d.checkOut) - toMinutes(d.checkIn)) : '';
      rows.push([
        `${MONTHS[month]} ${i + 1}, ${year}`,
        DAY_NAMES[dt.getDay()],
        status,
        d?.checkIn ? formatTime(d.checkIn) : '',
        d?.checkOut ? formatTime(d.checkOut) : '',
        hours,
      ]);
    });
    autoTable(doc, { startY: 32, head: [header], body: rows, theme: 'grid', styles: { fontSize: 8 } });
    doc.save(`attendance-${employee.firstName || employee.first_name || 'employee'}-${MONTHS[month]}-${year}.pdf`);
  };

  const handleQuickApply = (status: string) => {
    const updates = selectedDates.map(dateStr => ({ dateStr, status }));
    if (updates.length === 0) return;
    saveAllMutation.mutate({ updates });
  };

  const handleClearSelection = () => setSelectedDates([]);

  const handleSaveAll = () => {
    const updates = selectedDates.map(dateStr => ({ dateStr, status: bulkStatus }));
    if (updates.length === 0) { toast.error('No dates selected'); return; }
    saveAllMutation.mutate({ updates });
  };

  const jumpToday = () => setFocusDate(new Date());

  const editingInfo = editingDay ? (() => {
    const dt = new Date(editingDay + 'T00:00:00');
    return {
      label: `${DAY_NAMES[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`,
      isWeekend: !isConfiguredWorkday(dt),
    };
  })() : null;

  if (!isOpen || !employee) return null;

  const viewLabel = view === 'month'
    ? `${MONTHS[month]} ${year}`
    : view === 'week'
      ? `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} â€“ ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${year}`
      : `${DAY_NAMES[focusDate.getDay()]}, ${MONTHS[month]} ${focusDate.getDate()}, ${year}`;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" onClick={onClose} />
      <div className="fixed inset-0 flex flex-col bg-white">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--border-color)] flex justify-between items-center bg-gradient-to-r from-[#F8FAFC] to-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Attendance Calendar</h2>
              <p className="text-sm text-[var(--text-tertiary)]">
                {personDisplayName(employee)} ({employee.employeeCode || employee.employee_code || employee.code || `#${employee.id}`})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center bg-gray-100 rounded-xl p-1">
              {([
                { id: 'month' as ViewMode, label: 'Month', Icon: CalendarDays },
                { id: 'week' as ViewMode, label: 'Week', Icon: CalendarRange },
                { id: 'day' as ViewMode, label: 'Day', Icon: CalendarClock },
              ]).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { setView(id); setSelectedDates([]); setEditingDay(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    view === id ? 'bg-white text-[var(--primary-blue)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFinalizeConfirm(true)}
              disabled={finalizeEmployeeMutation.isPending}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                finalizeStatus?.finalized
                  ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                  : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
              }`}
              title={finalizeStatus?.finalized ? 'Attendance finalized â€” click to reopen' : "Finalize this employee's attendance for the month"}
            >
              {finalizeEmployeeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : finalizeStatus?.finalized ? <Undo2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
              {finalizeStatus?.finalized ? 'Finalized' : 'Finalize'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[var(--hover-bg)] rounded-xl transition-colors ml-1" title="Close">
              <X className="w-5 h-5 text-[var(--text-tertiary)]" />
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="px-5 py-2.5 border-b border-[var(--border-color)] bg-[var(--background)] flex-shrink-0 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-white rounded-xl transition-colors" title="Previous">
              <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
            <button onClick={jumpToday} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--primary-blue)] hover:bg-white transition-colors">
              Today
            </button>
            <button onClick={() => navigate(1)} className="p-2 hover:bg-white rounded-xl transition-colors" title="Next">
              <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
            <span className="ml-1 text-sm font-semibold text-[var(--text-primary)]">{viewLabel}</span>
            <button
              onClick={() => setShowJump(v => !v)}
              className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border bg-white text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--primary-blue)]"
              title="Jump to a specific month"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Jump
            </button>
            <button
              onClick={() => setMultiSelect(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                multiSelect
                  ? 'bg-[var(--primary-blue)] text-white border-[var(--primary-blue)]'
                  : 'bg-white text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--primary-blue)]'
              }`}
              title={multiSelect ? 'Click days to bulk-select. Turn off to edit a single day.' : 'Turn on to bulk-select multiple days'}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {multiSelect ? 'Bulk On' : 'Bulk'}
            </button>
          </div>
          {showJump && (
            <div className="relative">
              <div className="absolute top-full left-0 mt-2 z-20 bg-white rounded-2xl shadow-xl border border-[var(--border-color)] p-4 w-64">
                <div className="flex items-center gap-2 mb-3">
                  <LayoutGrid className="w-4 h-4 text-[var(--primary-blue)]" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Jump to month</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTHS.map((m, i) => (
                    <button
                      key={m}
                      onClick={() => { setFocusDate(d => new Date(year, i, d.getDate())); setShowJump(false); }}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${i === month ? 'bg-[var(--primary-blue)] text-white' : 'hover:bg-[var(--background)]'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 gap-2">
                  <button onClick={() => setFocusDate(d => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()))} className="px-2 py-1 rounded-lg text-xs text-[var(--text-tertiary)] hover:bg-[var(--background)] transition-colors">
                    â€¹ {year - 1}
                  </button>
                  <span className="text-sm font-bold text-[var(--text-primary)]">{year}</span>
                  <button onClick={() => setFocusDate(d => new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()))} className="px-2 py-1 rounded-lg text-xs text-[var(--text-tertiary)] hover:bg-[var(--background)] transition-colors">
                    {year + 1} â€º
                  </button>
                </div>
                <button onClick={() => { jumpToday(); setShowJump(false); }} className="mt-3 w-full px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--primary-blue)]/10 text-[var(--primary-blue)] hover:bg-[var(--primary-blue)]/20 transition-colors">
                  Back to today
                </button>
              </div>
            </div>
          )}
          <div className="flex-1" />
          {view === 'month' && multiSelect && (
            <>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={selectedDates.length === daysInMonth} onChange={e => setSelectedDates(e.target.checked ? Array.from({ length: daysInMonth }, (_, i) => fmtDate(new Date(year, month, i + 1))) : [])} className="rounded border-gray-300 text-[var(--primary-blue)] focus:ring-[var(--primary-blue)]" />
                <span className="text-xs font-medium text-[var(--text-tertiary)]">All</span>
              </label>
              {selectedDates.length > 0 && (
                <button onClick={handleClearSelection} className="flex items-center gap-1 text-xs font-medium text-[var(--text-tertiary)] hover:text-[#C81E1E] transition-colors">
                  <Undo2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
              <span className="text-sm font-medium text-[var(--text-tertiary)]">
                {selectedDates.length} selected
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-[var(--text-primary)] whitespace-nowrap">Mark as:</label>
                <div className="w-40">
                  <SearchableSelect
                    value={bulkStatus}
                    onChange={(v) => { if (v !== 'all') setBulkStatus(v as string); }}
                    options={statusOptions.map((opt: AttendanceStatusOption) => ({ id: opt.code, name: opt.name }))}
                    allOption="All"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveAll}
                disabled={selectedDates.length === 0 || saveAllMutation.isPending}
                className="px-4 py-2 bg-[var(--primary-blue)] text-white font-medium rounded-xl hover:bg-[#1E40AF] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#1C64F2]/20"
              >
                {saveAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </>
          )}
          {view === 'month' && !multiSelect && (
            <span className="text-xs text-[var(--text-tertiary)] hidden md:inline">Click a day to edit Â· use Bulk to apply to many</span>
          )}
          <button
            onClick={exportPDF}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] transition-colors flex items-center gap-1.5"
            title="Download this month as PDF"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>

        {/* Calendar Area - fills remaining height */}
        <div className="flex-1 min-h-0 flex px-5 pb-4 gap-4">
          <div className="flex-1 min-h-0 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
            </div>
          ) : (
            <>
              {/* Summary strip: status row + stats row */}
              <div className="py-2 flex-shrink-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('present').dot }} />
                    Present {presentDays}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('absent').dot }} />
                    Absent {absentDays}
                  </span>
                  {leaveBreakdown.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('on_leave').dot }} />
                      On Leave 0
                    </span>
                  ) : leaveBreakdown.map((code) => (
                    <span key={code} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors(code).dot }} />
                      {statusDisplayName(code, attendanceStatusOptions)} {stats.counts[code]}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('holiday').dot }} />
                    Holidays {stats.holidays}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('week_off').dot }} />
                    Week Off {stats.counts['week_off'] || 0}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('late').dot }} />
                    Late {stats.counts['late'] || 0}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-orange-50 text-orange-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('early_departure').dot }} />
                    Early Departure {stats.earlyDepartures}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('work_from_home').dot }} />
                    WFH {(stats.counts['work_from_home'] || 0) + (stats.counts['wfh'] || 0)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors('half_day').dot }} />
                    Half Day {stats.counts['half_day'] || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Recorded {recordedDays}/{daysInMonth} days
                  </span>
                  {avgCheckIn && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                      <Clock className="w-3 h-3" />
                      Avg check-in {avgCheckIn}
                    </span>
                  )}
                  {avgCheckOut && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700">
                      <Clock className="w-3 h-3" />
                      Avg check-out {avgCheckOut}
                    </span>
                  )}
                  {workHours.days > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-50 text-teal-700">
                      <Clock className="w-3 h-3" />
                      Avg working {formatDuration(workHours.avg)}
                    </span>
                  )}
                </div>
              </div>

              {/* Month view */}
              {view === 'month' && (
                <>
                  <div className="flex gap-3 mb-1 flex-shrink-0">
                    <div className="flex-1 grid grid-cols-7 gap-3 text-center text-xs font-semibold uppercase tracking-wider">
                      {DAY_SHORT.map((d, idx) => (
                        <div key={d} className={[0, 6].includes(idx) ? 'text-gray-400' : 'text-[var(--text-tertiary)]'}>{d}</div>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 flex gap-3">
                    <div className="flex-1 min-h-0 grid grid-cols-7 grid-rows-[repeat(6,minmax(92px,1fr))] gap-3 overflow-y-auto">
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`e-${i}`} className="rounded-xl bg-transparent" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dt = new Date(year, month, day);
                      const dateStr = fmtDate(dt);
                      const dayData = days[dateStr];
                      const isToday = dateStr === todayStr;
                      const isSelected = selectedDates.includes(dateStr);
                      const isWeekend = !isConfiguredWorkday(dt);
                      const isHoliday = dayData?.type === 'holiday';
                      const status = dayData?.status?.toLowerCase() || '';
                      const colors = status ? statusColors(status) : null;

                      return (
                        <button
                          key={dateStr}
                          onMouseDown={() => handleDayMouseDown(dateStr)}
                          onMouseEnter={() => handleDayMouseEnter(dateStr)}
                          onMouseMove={(e) => { setHoverDay(dateStr); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                          onMouseLeave={() => { if (!dragRef.current) { setHoverDay(null); setHoverPos(null); } }}
                          onClick={() => handleDayClick(dateStr)}
                          className={`relative min-h-[92px] overflow-hidden rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all cursor-pointer border select-none ${
                            isSelected
                              ? 'ring-2 ring-[var(--primary-blue)] border-[var(--primary-blue)] bg-blue-50 scale-[1.03] z-10 shadow-md'
                              : isHoliday
                                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                : isWeekend && !dayData
                                  ? 'bg-gray-50 text-gray-400 border-gray-100 hover:border-gray-300'
                                  : dayData
                                    ? 'hover:shadow-md'
                                    : 'bg-[var(--background)] border-[var(--border-color)] hover:border-[var(--primary-blue)] hover:shadow-sm'
                          } ${isToday && !isSelected ? 'ring-2 ring-offset-1 ring-[#14B8A6]' : ''}`}
                          style={dayData && !isSelected && !isHoliday && colors && (isAttendedStatus(status) || OFF_CODES.has(status) || !isWeekend) ? { backgroundColor: colors.bg, borderColor: colors.bd } : undefined}
                        >
                          {isSelected && (
                            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--primary-blue)] text-white flex items-center justify-center">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                          <span className={`text-sm truncate max-w-full px-1 ${isToday && !isSelected ? 'text-[var(--primary-blue)] font-bold' : ''} ${isWeekend && !dayData && !isSelected ? 'text-gray-300' : ''}`}>
                            {day} {FULL_MONTHS[month]}
                          </span>
                          {!isSelected && colors && (
                            <div className="w-2 h-2 rounded-full mt-0.5" style={{ backgroundColor: colors.dot }} />
                          )}
                          {!isSelected && isHoliday && (
                            <span className="text-[10px] leading-tight font-semibold text-blue-700 bg-blue-50 px-1.5 py-px rounded mt-0.5">
                              Holiday
                            </span>
                          )}
                          {!isSelected && (
                            <span className="text-[11px] leading-tight mt-0.5 opacity-70 text-center px-1 truncate max-w-full">
                              {isHoliday ? dayData.name : (statusDisplayName(status, attendanceStatusOptions) || (isWeekend && !dayData ? 'Weekend' : ''))}
                            </span>
                          )}
                          {!isSelected && dayData?.status?.toLowerCase() === 'present' && (
                            <span className="text-[11px] leading-tight font-semibold text-emerald-700 truncate max-w-full px-1">
                              In: {dayData.checkIn ? formatTime(dayData.checkIn) : 'â€¢'}{dayData.checkOut ? ` Â· Out: ${formatTime(dayData.checkOut)}` : ''}
                            </span>
                          )}
                          {!isSelected && dayData?.checkIn && !dayData?.checkOut && (
                            <span className="text-[10px] leading-tight font-semibold text-red-600 bg-red-50 px-1.5 py-px rounded mt-0.5">
                              No checkout
                            </span>
                          )}
                          {!isSelected && dayData?.isManualEntry && (
                            <span className="text-[10px] leading-tight font-semibold text-orange-600 bg-orange-50 px-1.5 py-px rounded mt-0.5">
                              Manual
                            </span>
                          )}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                </>
              )}

              {/* Week view */}
              {view === 'week' && (
                <div className="flex-1 min-h-0 grid grid-cols-7 gap-2 pb-1">
                  {weekDays.map((d, idx) => {
                    const dateStr = fmtDate(d);
                    const dayData = days[dateStr];
                    const isToday = dateStr === todayStr;
                    const isWeekend = !isConfiguredWorkday(d);
                    const isHoliday = dayData?.type === 'holiday';
                    const status = dayData?.status?.toLowerCase() || '';
                    const colors = status ? statusColors(status) : null;
                    const isSameMonth = d.getMonth() === month;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => openEditor(dateStr)}
                        className={`relative min-h-0 overflow-hidden rounded-2xl border flex flex-col items-center justify-start p-2 transition-all cursor-pointer ${
                          isHoliday
                            ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                            : isWeekend && !dayData
                              ? 'bg-gray-50 border-gray-100 hover:border-gray-300'
                              : dayData
                                ? 'hover:shadow-md'
                                : 'bg-[var(--background)] border-[var(--border-color)] hover:border-[var(--primary-blue)]'
                        } ${isToday ? 'ring-2 ring-[#14B8A6] ring-offset-1' : ''}`}
                        style={dayData && !isHoliday && colors && (isAttendedStatus(status) || OFF_CODES.has(status) || !isWeekend) ? { backgroundColor: colors.bg, borderColor: colors.bd } : undefined}
                      >
                        <div className={`w-full flex items-center justify-between text-xs font-semibold ${isWeekend && !dayData ? 'text-gray-400' : 'text-[var(--text-tertiary)]'} ${isSameMonth ? '' : 'opacity-50'}`}>
                          <span>{DAY_SHORT[idx]}</span>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-[#14B8A6] text-white' : ''}`}>{d.getDate()}</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 w-full">
                          {isHoliday ? (
                            <>
                              <span className="text-[10px] leading-tight font-semibold text-blue-700 bg-blue-50 px-1.5 py-px rounded">
                                Holiday
                              </span>
                              <span className="text-[11px] font-semibold text-blue-700 text-center leading-tight px-1">{dayData.name}</span>
                            </>
                          ) : status ? (
                            <>
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors!.dot }} />
                              <span className="text-xs font-semibold" style={{ color: colors!.dot }}>{statusDisplayName(status, attendanceStatusOptions)}</span>
                              {status === 'present' && (
                                <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(dayData.checkIn) || 'â€“'} â†’ {formatTime(dayData.checkOut) || 'â€“'}
                                </span>
                              )}
                              {dayData.isManualEntry && (
                                <span className="text-[10px] leading-tight font-semibold text-orange-600 bg-orange-50 px-1.5 py-px rounded">
                                  Manual
                                </span>
                              )}
                              {dayData.checkIn && !dayData.checkOut && (
                                <span className="text-[10px] leading-tight font-semibold text-red-600 bg-red-50 px-1.5 py-px rounded">
                                  No checkout
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-[var(--text-tertiary)] opacity-60">
                              {isWeekend ? 'Weekend' : 'No record'}
                            </span>
                          )}
                          {!isHoliday && status && (
                            <span className="text-[10px] text-[var(--text-tertiary)] opacity-70">Click to edit</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Day view */}
              {view === 'day' && (() => {
                const dateStr = fmtDate(focusDate);
                const dayData = days[dateStr];
                const isToday = dateStr === todayStr;
                const isWeekend = !isConfiguredWorkday(focusDate);
                const isHoliday = dayData?.type === 'holiday';
                const status = dayData?.status?.toLowerCase() || '';
                const colors = status ? statusColors(status) : null;
                return (
                  <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto">
                    <div className="w-full max-w-xl bg-[var(--background)] rounded-2xl border border-[var(--border-color)] p-6 my-4">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-lg font-bold text-[var(--text-primary)]">
                            {DAY_NAMES[focusDate.getDay()]}, {MONTHS[month]} {focusDate.getDate()}
                          </h3>
                          <p className="text-sm text-[var(--text-tertiary)]">
                            {year}{isToday ? ' Â· Today' : ''}{isWeekend ? ' Â· Weekend' : ''}{isHoliday ? ` Â· ${dayData.name}` : ''}
                          </p>
                        </div>
                        {isHoliday ? (
                          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700">Holiday</span>
                        ) : status ? (
                          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{ backgroundColor: colors!.bg, color: colors!.dot }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors!.dot }} />
                            {statusDisplayName(status, attendanceStatusOptions)}
                          </span>
                        ) : (
                          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500">No record</span>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Status</label>
                          <SearchableSelect
                            value={editStatus}
                            onChange={(v) => { if (v !== 'all') setEditStatus(v as string); }}
                            options={statusOptions.map((opt: AttendanceStatusOption) => ({ id: opt.code, name: opt.name }))}
                            allOption="Select status"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Check-in</label>
                            <input
                              type="time"
                              value={editCheckIn}
                              onChange={e => setEditCheckIn(e.target.value)}
                              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Check-out</label>
                            <input
                              type="time"
                              value={editCheckOut}
                              onChange={e => setEditCheckOut(e.target.value)}
                              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => saveAllMutation.mutate({ updates: [{ dateStr, status: editStatus, checkIn: editCheckIn, checkOut: editCheckOut }] })}
                          disabled={saveAllMutation.isPending}
                          className="w-full px-4 py-2.5 bg-[var(--primary-blue)] text-white font-semibold rounded-xl hover:bg-[#1E40AF] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#1C64F2]/20"
                        >
                          {saveAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Day
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
          </div>

          {/* Analytics panel */}
          {showStats && (
            <div className="w-80 flex-shrink-0 min-h-0 overflow-y-auto border-l border-[var(--border-color)] pl-4 py-2">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[var(--primary-blue)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Analytics Â· {viewLabel}</h3>
              </div>

              <div className="bg-[var(--background)] rounded-2xl border border-[var(--border-color)] p-4 mb-3">
                <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Attendance split</p>
                {pieData.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)] py-6 text-center">No recorded days</p>
                ) : (
                  <>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={3}>
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <ChartTooltip formatter={(v, n) => [`${v ?? 0} day${(v ?? 0) !== 1 ? 's' : ''}`, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1">
                      {pieData.map(r => (
                        <div key={r.name} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="text-[var(--text-secondary)]">{r.name}</span>
                          <span className="ml-auto font-semibold text-[var(--text-primary)]">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {weeklyData.length > 0 && (
                <div className="bg-[var(--background)] rounded-2xl border border-[var(--border-color)] p-4 mb-3">
                  <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Weekly breakdown</p>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                        <Tooltip />
                        {weeklyStatuses.map(code => (
                          <Bar key={code} dataKey={code} name={statusDisplayName(code, attendanceStatusOptions)} stackId="a" fill={statusColors(code).dot} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {weeklyStatuses.map(code => (
                      <span key={code} className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--text-secondary)]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors(code).dot }} />
                        {statusDisplayName(code, attendanceStatusOptions)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 rounded-2xl p-3">
                  <p className="text-xs font-medium text-emerald-700">Attended days</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{attendedDays}</p>
                  <p className="text-[10px] text-emerald-600/70 mt-1">
                    {presentDays} present Â· {(stats.counts['late'] || 0)} late Â· {(stats.counts['half_day'] || 0)} half day{(stats.counts['work_from_home'] || stats.counts['wfh'] || 0) ? ` Â· ${(stats.counts['work_from_home'] || 0) + (stats.counts['wfh'] || 0)} wfh` : ''}
                  </p>
                </div>
                <div className="bg-red-50 rounded-2xl p-3">
                  <p className="text-xs font-medium text-red-700">Absent days</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{absentDays}</p>
                </div>
                <div className="bg-purple-50 rounded-2xl p-3">
                  <p className="text-xs font-medium text-purple-700">On leave</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">{onLeaveDays}</p>
                </div>
                <div className="bg-slate-100 rounded-2xl p-3">
                  <p className="text-xs font-medium text-slate-600">Week off</p>
                  <p className="text-2xl font-bold text-slate-700 mt-1">{stats.counts['week_off'] || 0}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3">
                  <p className="text-xs font-medium text-slate-600">Avg check-in</p>
                  <p className="text-2xl font-bold text-slate-700 mt-1">{avgCheckIn || 'â€“'}</p>
                </div>
                <div className="bg-indigo-50 rounded-2xl p-3">
                  <p className="text-xs font-medium text-indigo-700">Total hours Â· {view === 'month' ? 'month' : view === 'week' ? 'week' : 'day'}</p>
                  <p className="text-2xl font-bold text-indigo-700 mt-1">{formatDuration(workHours.total)}</p>
                </div>
                <div className="bg-blue-50 rounded-2xl p-3 col-span-2">
                  <p className="text-xs font-medium text-blue-700">Attendance rate</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-2xl font-bold text-blue-700">{attendanceRate}%</p>
                    <p className="text-[11px] text-blue-600/80">{attendedDays}/{stats.weekdays} workdays</p>
                    <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${attendanceRate}%` }} />
                    </div>
                  </div>
                </div>
                <div className="bg-orange-50 rounded-2xl p-3">
                  <p className="text-xs font-medium text-orange-700">Avg / day Â· {view === 'month' ? 'month' : view === 'week' ? 'week' : 'day'}</p>
                  <p className="text-2xl font-bold text-orange-700 mt-1">{formatDuration(workHours.avg)}</p>
                </div>
                <div className="bg-amber-50 rounded-2xl p-3">
                  <p className="text-xs font-medium text-amber-700">Avg check-out</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{avgCheckOut || 'â€“'}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mt-3">
                <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">Year at a glance Â· {year}</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearPresentByMonth} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={20} />
                      <Tooltip formatter={(v) => [`${v ?? 0} present days`]} />
                      <Bar dataKey="present" name="Present" fill={statusColors('present').dot} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Day editor popover */}
        {editingDay && editingInfo && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setEditingDay(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
              <button onClick={() => setEditingDay(null)} className="absolute top-4 right-4 p-1.5 hover:bg-[var(--hover-bg)] rounded-lg transition-colors">
                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <Pencil className="w-4 h-4 text-[var(--primary-blue)]" />
                <h3 className="text-lg font-bold text-[var(--text-primary)]">{editingInfo.label}</h3>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mb-5">
                {editingInfo.isWeekend ? 'Weekend Â· ' : ''}Set status and work hours for this day
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Status</label>
                  <SearchableSelect
                    value={editStatus}
                    onChange={(v) => { if (v !== 'all') setEditStatus(v as string); }}
                    options={statusOptions.map((opt: AttendanceStatusOption) => ({ id: opt.code, name: opt.name }))}
                    allOption="Select status"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Check-in</label>
                    <input
                      type="time"
                      value={editCheckIn}
                      onChange={e => setEditCheckIn(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Check-out</label>
                    <input
                      type="time"
                      value={editCheckOut}
                      onChange={e => setEditCheckOut(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                    />
                  </div>
                </div>
                <button
                  onClick={() => saveAllMutation.mutate({ updates: [{ dateStr: editingDay, status: editStatus, checkIn: editCheckIn, checkOut: editCheckOut }] })}
                  disabled={saveAllMutation.isPending}
                  className="w-full px-4 py-2.5 bg-[var(--primary-blue)] text-white font-semibold rounded-xl hover:bg-[#1E40AF] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#1C64F2]/20"
                >
                  {saveAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Day
                </button>

                {auditLogs && auditLogs.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-[var(--border-color)]">
                    <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Override history</p>
                    <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2.5 bg-[var(--background)] rounded-xl p-2.5">
                          <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${log.action === 'updated' ? 'bg-amber-500' : log.action === 'created' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)]">
                              {log.actorName || 'System'}
                              <span className="ml-1.5 font-medium text-[var(--text-tertiary)]">
                                {log.action === 'updated' ? 'updated' : log.action === 'created' ? 'created record' : log.action}
                              </span>
                            </p>
                            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                              {log.changedFields?.length ? log.changedFields.map(f => f.replace(/_/g, ' ')).join(', ') : 'fields'}
                              {log.newValues?.status ? ` â†’ ${statusDisplayName(String(log.newValues.status), attendanceStatusOptions)}` : ''}
                            </p>
                            <p className="text-[11px] text-[var(--text-tertiary)]/70 mt-0.5">
                              {log.createdAt ? new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                              {log.reason ? ` Â· ${log.reason}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hover preview tooltip */}
        {hoverDay && hoverPos && days[hoverDay] && (() => {
          const d = days[hoverDay];
          const isHoliday = d.type === 'holiday';
          const s = (d.status || '').toLowerCase();
          const colors = s ? statusColors(s) : null;
          const hours = d.checkIn && d.checkOut ? formatDuration(toMinutes(d.checkOut) - toMinutes(d.checkIn)) : '';
          const x = Math.min(hoverPos.x + 16, window.innerWidth - 260);
          const y = Math.min(hoverPos.y + 12, window.innerHeight - 200);
          return (
            <div className="fixed z-[70] pointer-events-none w-60 bg-white rounded-2xl shadow-2xl border border-[var(--border-color)] p-4" style={{ left: x, top: y }}>
              <p className="text-sm font-bold text-[var(--text-primary)] mb-1">
                {DAY_NAMES[new Date(hoverDay + 'T00:00:00').getDay()]}, {MONTHS[new Date(hoverDay + 'T00:00:00').getMonth()]} {new Date(hoverDay + 'T00:00:00').getDate()}
              </p>
              {isHoliday ? (
                <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Holiday Â· {d.name}
                </p>
              ) : s ? (
                <>
                  <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: colors!.dot }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors!.dot }} />
                    {statusDisplayName(s, attendanceStatusOptions)}
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-[var(--text-tertiary)]">
                    {d.checkIn && (
                      <p className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> In {formatTime(d.checkIn)}</p>
                    )}
                    {d.checkOut && (
                      <p className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Out {formatTime(d.checkOut)}</p>
                    )}
                    {hours && (
                      <p className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> {hours} worked</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--text-tertiary)]">No record for this day</p>
              )}
            </div>
          );
        })()}
      </div>

      <ConfirmActionModal
        isOpen={showFinalizeConfirm}
        onCancel={() => setShowFinalizeConfirm(false)}
        onConfirm={() => finalizeEmployeeMutation.mutate(!!finalizeStatus?.finalized)}
        variant="warning"
        title={finalizeStatus?.finalized ? 'Reopen Attendance' : 'Finalize Attendance'}
        confirmLabel={finalizeStatus?.finalized ? 'Yes, Reopen' : 'Yes, Finalize'}
        message={`You are about to ${finalizeStatus?.finalized ? 'reopen' : 'finalize'} this employee's attendance for ${MONTHS[month]} ${year}.`}
        consequence="This will impact the employee's payroll for this period â€” salary is calculated from the finalized attendance, leave & holiday records."
        isPending={finalizeEmployeeMutation.isPending}
      />
    </div>
  );
};

export default EmployeeCalendarEditor;
