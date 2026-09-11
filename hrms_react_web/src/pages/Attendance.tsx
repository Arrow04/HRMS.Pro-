import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Attendance as AttendanceType, Employee, Shift, Holiday, LeaveApplication, AuditLog } from '../types';

// Normalize snake_case API responses to camelCase for consistent frontend access
const toCamel = (str: string) => str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const normalizeKeys = (obj: unknown): unknown => {
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), normalizeKeys(v)])
    );
  }
  return obj;
};
import {
  Sparkles, Download, Plus, MapPin, Camera, X, Save, Search, Upload,
  FileSpreadsheet, CalendarClock, Clock, TrendingUp, Users, CheckCircle, CheckCircle2, Edit2, Trash2,
  CloudCog, Calendar, Filter, Info, CreditCard, Phone, XCircle, RotateCcw, Loader2, LogOut, ArrowRightLeft,
  CalendarDays, ChevronLeft, ChevronRight, Edit, Settings, Zap, User
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import * as settingsApi from '../services/settingsService';
import ConfigPanel from '../components/ConfigPanel';
import AttendanceConfig from '../components/AttendanceConfig';
import { getCurrentUser } from '../services/authService';
import ToggleSwitch from '../components/ToggleSwitch';
import { runAutomation } from '../services/aiAutomation';
import { useMasterData } from '../hooks/useMasterData';
import { useEmployeePicker } from '../hooks/useEmployeePicker';
import EmployeeScopedCascade from '../components/EmployeeScopedCascade';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import RosterConfigModal from '../components/RosterConfigModal';
import EmployeeCalendarEditor from '../components/EmployeeCalendarEditor';
import DateRangePicker from '../components/DateRangePicker';
import DatePicker from '../components/DatePicker';
import TimePicker from '../components/TimePicker';
import SearchableSelect from '../components/SearchableSelect';
import StatsCard from '../components/StatsCard';
import DataTable from '../components/DataTable';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import { getAttendanceStatusBadge, getAttendanceStatusColor, capitalizeStatus, getStatusBadgeClass } from '../utils/statusUtils';
import ConfirmActionModal from '../components/ConfirmActionModal';
import BulkDeleteModal from '../components/BulkDeleteModal';
import Tooltip from '../components/Tooltip';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import { formatEmployeeLabel } from '../utils/employeePickerUtils';
import { personDisplayName } from '../utils/employeeNameUtils';

type TabId = 'records' | 'duty-shift' | 'duty-roster' | 'configuration';

type OptionItem = { id: number; name: string };

type MasterDataOption = {
  code: string;
  name: string;
  value?: string;
  label?: string;
};

type EmployeeRecord = Employee & {
  branchId?: number;
  company_id?: number;
  branch_id?: number;
  department_id?: number;
};

type AttendanceRow = {
  id: number | string;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  email?: string;
  department?: string | { id: number; name: string };
  companyId?: number | string;
  branchId?: number | string;
  departmentId?: number | string;
  companyName?: string;
  branchName?: string;
  departmentName?: string;
  date?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status?: string;
  workHours?: number;
  scheduledHours?: number;
  overtimeHours?: number;
  breakHours?: number;
  isLate?: boolean;
  lateMinutes?: number;
  isEarlyDeparture?: boolean;
  earlyDepartureMinutes?: number;
  shiftId?: number;
  notes?: string;
  comments?: string;
  reason?: string;
  location?: string;
  checkInLocationName?: string;
  checkOutLocationName?: string;
  checkInLatitude?: number;
  checkInLongitude?: number;
  checkOutLatitude?: number;
  checkOutLongitude?: number;
};

type ShiftRecord = {
  id: number;
  name: string;
  code: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  break_duration: number;
  working_days: string;
  color: string;
  description?: string;
  organization_id: number;
  company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  status: string;
};

type RosterEntry = {
  id: number;
  employee_id: number;
  employee_name: string;
  day_of_week: number;
  shift_name?: string;
  shift_color?: string;
  shift_start_time?: string;
  shift_end_time?: string;
};

// =============================================================================
// TABS CONFIGURATION
// =============================================================================

const TABS = [
  { id: 'records', label: 'Attendance Records', icon: FileSpreadsheet },
  { id: 'duty-shift', label: 'Duty Shift', icon: CalendarClock },
  { id: 'duty-roster', label: 'Duty Roster', icon: CalendarDays },
  { id: 'configuration', label: 'Configuration', icon: Settings },
];

// Form tabs for Attendance modal
const ATTENDANCE_FORM_TABS = [
  { id: 'basic', label: 'Basic Info', icon: Info },
  { id: 'timing', label: 'Timing', icon: Clock },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'advanced', label: 'Advanced', icon: CreditCard },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const Attendance = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('records');
  const [showAttendanceConfig, setShowAttendanceConfig] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'delete-record'; id: number } | { type: 'bulk-delete'; records: AttendanceRow[] } | { type: 'deactivate-shift'; id: number; name: string } | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ items: AttendanceRow[] } | null>(null);
  const [quickActionTarget, setQuickActionTarget] = useState<{ type: 'single'; record: AttendanceRow } | { type: 'bulk'; records: AttendanceRow[] } | null>(null);
  const [quickStatus, setQuickStatus] = useState('');
  const [quickTab, setQuickTab] = useState<'attendance' | 'leave'>('attendance');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [startDate, setStartDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingAttendanceId, setEditingAttendanceId] = useState<number | null>(null);

  // Attendance configuration
  const [attConfig, setAttConfig] = useState({
    workStart: '09:00', workEnd: '18:00', gracePeriod: '15', halfDayCutoff: '4',
    geoRadius: '100', manualOverride: true, weekendTracking: false, workingDays: '0,1,2,3,4,5,6',
  });
  const [attConfigLoading, setAttConfigLoading] = useState(false);
  const [attConfigSaving, setAttConfigSaving] = useState(false);

  useEffect(() => {
    let active = true;
    settingsApi.fetchAttendanceSettings()
      .then((s) => {
        if (!active) return;
        setAttConfig({
          workStart: s.workStart || '09:00',
          workEnd: s.workEnd || '18:00',
          gracePeriod: String(s.gracePeriod ?? '15'),
          halfDayCutoff: String(s.halfDayCutoff ?? '4'),
          geoRadius: String(s.geoRadius ?? '100'),
          manualOverride: s.manualOverride ?? true,
          weekendTracking: s.weekendTracking ?? false,
          workingDays: s.workingDays || '0,1,2,3,4,5,6',
        });
      })
      .catch(() => {})
      .finally(() => { if (active) setAttConfigLoading(false); });
    return () => { active = false; };
  }, []);

  const saveAttendanceConfig = () => {
    setAttConfigSaving(true);
    settingsApi.saveAttendanceSettings({
      ...attConfig,
      workDays: attConfig.workingDays.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n)),
    })
      .then(() => { toast.success('Attendance configuration saved'); queryClient.invalidateQueries({ queryKey: ['attendance'] }); })
      .catch(() => toast.error('Failed to save attendance configuration'))
      .finally(() => setAttConfigSaving(false));
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, statusFilter, companyFilter, branchFilter, departmentFilter]);


  const [formTab, setFormTab] = useState('basic');
  const [isClosing, setIsClosing] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Employee Calendar Drawer State
  const [showEmpCalendar, setShowEmpCalendar] = useState(false);
  const [calendarEmployeeData, setCalendarEmployeeData] = useState<Employee | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRecord | null>(null);
  const [shiftSearchTerm, setShiftSearchTerm] = useState('');
  const [rosterSearchTerm, setRosterSearchTerm] = useState('');
  const [shiftCompanyFilter, setShiftCompanyFilter] = useState('all');
  const [shiftBranchFilter, setShiftBranchFilter] = useState('all');
  const [shiftDeptFilter, setShiftDeptFilter] = useState('all');
  const [rosterCompanyFilter, setRosterCompanyFilter] = useState('all');
  const [rosterBranchFilter, setRosterBranchFilter] = useState('all');
  const [rosterDeptFilter, setRosterDeptFilter] = useState('all');
  const [shiftForm, setShiftForm] = useState({
    name: '', code: '', shift_type: 'morning', start_time: '09:00', end_time: '17:00',
    grace_minutes: 15, break_duration: 60, working_days: '1,2,3,4,5',
    color: '#3B82F6', description: '', organization_id: 0, company_id: null as number | null, branch_id: null as number | null, department_id: null as number | null, status: 'active'
  });
  const [mounted, setMounted] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [manualEntry, setManualEntry] = useState({
    employeeId: '',
    organizationId: '',
    companyId: '',
    branchId: '',
    departmentId: '',
    shiftId: '',
    attendanceType: '',
    date: new Date().toISOString().split('T')[0],
    checkIn: '',
    checkOut: '',
    status: 'Present',
    workHours: 0,
    scheduledHours: 8,
    overtimeHours: 0,
    breakHours: 0,
    isLate: false,
    lateMinutes: 0,
    isEarlyDeparture: false,
    earlyDepartureMinutes: 0,
    notes: '',
    comments: '',
    reason: '',
    location: '',
    checkInLocationName: '',
    checkOutLocationName: '',
    checkInLatitude: 0,
    checkInLongitude: 0,
    checkOutLatitude: 0,
    checkOutLongitude: 0,
    geofenceId: '',
    isWithinGeofence: true,
    checkInSelfieUrl: '',
    checkOutSelfieUrl: '',
    selfieVerified: false,
    deviceId: '',
    deviceType: 'web',
    ipAddress: '',
    userAgent: '',
    isWorkFromHome: false,
    wfhApprovalId: '',
    wfhLocation: '',
    isManualEntry: true,
    approvedBy: '',
    approvalComments: '',
    leaveApplicationId: '',
    isOnLeave: false,
    isHoliday: false,
    holidayId: ''
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // =============================================================================
  // DATA QUERIES
  // =============================================================================


  const { data: employees = [] } = useEmployeePicker({ status: 'active' });

  const employeeOptions = employees.map((emp) => ({
    id: emp.id,
    name: formatEmployeeLabel(emp),
  }));


  // Master data for attendance
  const { data: statusOpts = [] } = useMasterData('ATTENDANCE_STATUS');
  const { data: typeOpts = [] } = useMasterData('ATTENDANCE_TYPE');
  const { data: leaveTypeOpts = [] } = useMasterData('LEAVE_TYPE');
  const attendanceStatusOptions = useMemo(() => {
    const seen = new Set();
    return [...typeOpts, ...statusOpts, ...leaveTypeOpts].filter((opt: MasterDataOption) => {
      if (seen.has(opt.code)) return false;
      seen.add(opt.code);
      return true;
    });
  }, [typeOpts, statusOpts, leaveTypeOpts]);
    const { data: companies = [] } = useQuery<OptionItem[]>({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: deviceTypeOptions = [] } = useMasterData('ATTENDANCE_DEVICE_TYPE');
  const { data: shiftNameOptions = [] } = useMasterData('DUTY_SHIFT');
  const { data: shiftTypeOptions = [] } = useMasterData('SHIFT_TYPE');

  const { data: branches = [] } = useQuery<OptionItem[]>({ queryKey: ['branches', shiftForm.company_id], queryFn: async () => { const params: Record<string, unknown> = {}; if (shiftForm.company_id) params.companyId = shiftForm.company_id; const res = await api.get('/branches', { params }); return Array.isArray(res.data) ? res.data : (res.data?.items || []); } });
  const { data: departments = [] } = useQuery<OptionItem[]>({ queryKey: ['departments', shiftForm.company_id], queryFn: async () => { const params: Record<string, unknown> = {}; if (shiftForm.company_id) params.companyId = shiftForm.company_id; const res = await api.get('/departments', { params }); return Array.isArray(res.data) ? res.data : (res.data?.items || []); } });

  const { data: attendanceData, isLoading: isAttendanceLoading, isFetching } = useQuery<AttendanceType[]>({
    queryKey: ['attendance', startDate, endDate, includeInactive],
    queryFn: async () => {
      const res = await api.get('/attendance', {
        params: { startDate, endDate, includeInactive }
      });
      const body = res.data;
      const raw = Array.isArray(body) ? body : (body?.data || []);
      const normalized = normalizeKeys(raw);
      return normalized as AttendanceType[];
    }
  });

  const attendanceRecords = attendanceData || [];

  const { data: shifts = [], isLoading: loadingShifts } = useQuery<ShiftRecord[]>({
    queryKey: ['shifts'],
    queryFn: async () => {
      try {
        const response = await api.get('/shifts');
        return response.data || [];
      } catch (error) { throw error; }
    },
    enabled: activeTab === 'duty-shift' || activeTab === 'duty-roster',
    staleTime: 2 * 60 * 1000,
  });

  // Roster week state
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };
  const [rosterWeekStart, setRosterWeekStart] = useState<string>(
    getMonday(new Date()).toISOString().split('T')[0]
  );
  const { data: weeklyRoster = [], isLoading: loadingRoster, refetch: refetchRoster } = useQuery<RosterEntry[]>({
    queryKey: ['weekly-roster', rosterWeekStart],
    queryFn: async () => {
      try {
        const response = await api.get('/shifts/roster/weekly', { params: { week_start_date: rosterWeekStart } });
        return response.data || [];
      } catch (error) { return []; }
    },
    enabled: activeTab === 'duty-roster',
    staleTime: 1 * 60 * 1000,
  });

  // =============================================================================
  // MUTATIONS
  // =============================================================================

  const manualEntryMutation = useMutation({
    mutationFn: async (payload: Partial<AttendanceType>) => {
      if (editingAttendanceId) {
        return api.put(`/attendance/${editingAttendanceId}`, payload);
      }
      return api.post('/attendance/manual', payload);
    },
    onSuccess: () => {
      toast.success(editingAttendanceId ? 'Attendance updated' : 'Attendance recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setShowManualModal(false);
      setEditingAttendanceId(null);
      setManualEntry({
        employeeId: '',
        organizationId: '',
        companyId: '', branchId: '',
        departmentId: '',
        shiftId: '', attendanceType: '',
        date: new Date().toISOString().split('T')[0],
        checkIn: '',
        checkOut: '',
        status: 'Present',
        workHours: 0,
        scheduledHours: 8,
        overtimeHours: 0,
        breakHours: 0,
        isLate: false,
        lateMinutes: 0,
        isEarlyDeparture: false,
        earlyDepartureMinutes: 0,
        notes: '',
        comments: '',
        reason: '',
        location: '',
        checkInLocationName: '',
        checkOutLocationName: '',
        checkInLatitude: 0,
        checkInLongitude: 0,
        checkOutLatitude: 0,
        checkOutLongitude: 0,
        geofenceId: '',
        isWithinGeofence: true,
        checkInSelfieUrl: '',
        checkOutSelfieUrl: '',
        selfieVerified: false,
        deviceId: '',
        deviceType: 'web',
        ipAddress: '',
        userAgent: '',
        isWorkFromHome: false,
        wfhApprovalId: '',
        wfhLocation: '',
        isManualEntry: true,
        approvedBy: '',
        approvalComments: '',
        leaveApplicationId: '',
        isOnLeave: false,
        isHoliday: false,
        holidayId: ''
      });
    },
    onError: () => toast.error('Failed to record attendance')
  });

  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/attendance/bulk-upload', formData);
    },
    onSuccess: () => {
      toast.success('Bulk upload completed');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setShowBulkModal(false);
      setBulkFile(null);
    },
    onError: () => toast.error('Bulk upload failed')
  });

  const createShiftMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post('/shifts/', payload),
    onSuccess: () => {
      toast.success('Shift created successfully');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShowShiftModal(false);
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to create shift')
  });

  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => api.put(`/shifts/${id}`, payload),
    onSuccess: () => {
      toast.success('Shift updated successfully');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShowShiftModal(false);
      setEditingShift(null);
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to update shift')
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/shifts/${id}`),
    onSuccess: () => {
      toast.success('Shift deactivated');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: () => toast.error('Failed to deactivate shift')
  });

  const deleteRosterMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/shifts/roster/${id}`),
    onSuccess: () => {
      toast.success('Roster entry removed');
      queryClient.invalidateQueries({ queryKey: ['weekly-roster'] });
    },
    onError: () => toast.error('Failed to remove roster entry')
  });

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleCloseDrawer = () => {
    setIsClosing(true);
      setTimeout(() => {
      setIsClosing(false);
      setShowManualModal(false);
      setManualEntry({
        employeeId: '',
        organizationId: '',
        companyId: '', branchId: '',
        departmentId: '',
        shiftId: '', attendanceType: '',
        date: new Date().toISOString().split('T')[0],
        checkIn: '',
        checkOut: '',
        status: 'Present',
        workHours: 0,
        scheduledHours: 8,
        overtimeHours: 0,
        breakHours: 0,
        isLate: false,
        lateMinutes: 0,
        isEarlyDeparture: false,
        earlyDepartureMinutes: 0,
        notes: '',
        comments: '',
        reason: '',
        location: '',
        checkInLocationName: '',
        checkOutLocationName: '',
        checkInLatitude: 0,
        checkInLongitude: 0,
        checkOutLatitude: 0,
        checkOutLongitude: 0,
        geofenceId: '',
        isWithinGeofence: true,
        checkInSelfieUrl: '',
        checkOutSelfieUrl: '',
        selfieVerified: false,
        deviceId: '',
        deviceType: 'web',
        ipAddress: '',
        userAgent: '',
        isWorkFromHome: false,
        wfhApprovalId: '',
        wfhLocation: '',
        isManualEntry: true,
        approvedBy: '',
        approvalComments: '',
        leaveApplicationId: '',
        isOnLeave: false,
        isHoliday: false,
        holidayId: ''
      });
      setFormTab('basic');
    }, 300);
  };

  const renderAttendanceForm = () => {
    const inputCls = "w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]";
    const Field = ({ label, required, children, help }: { label: string; required?: boolean; children: React.ReactNode; help?: string }) => (
      <div className="flex flex-col">
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
        <div className="min-h-[42px] flex items-stretch w-full">{children}</div>
        <p className="mt-1 text-xs text-gray-400 min-h-[16px]">{help || ''}</p>
      </div>
    );
    const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
      <div className="flex items-center"><ToggleSwitch checked={checked} onChange={onChange} /></div>
    );
    const companiesList = Array.isArray(companies) ? companies : (companies || []);
    const scopedEmployees = employees.filter((e) => {
      if (manualEntry.companyId && String(e.companyId ?? e.company_id) !== String(manualEntry.companyId)) return false;
      if (manualEntry.branchId) {
        const branchIds = [
          ...(e.branches || []).map((b) => String((b as { id?: number }).id)),
          ...(e.branch ? [String((e.branch as { id?: number }).id)] : []),
          ...(e.branchId ? [String(e.branchId)] : []),
          ...(e.branch_id ? [String(e.branch_id)] : []),
        ];
        if (!branchIds.includes(String(manualEntry.branchId))) return false;
      }
      if (manualEntry.departmentId && String(e.departmentId ?? (e.department as { id?: number } | undefined)?.id ?? e.department_id) !== String(manualEntry.departmentId)) return false;
      return true;
    });
    const applyTimeCalc = (rec: typeof manualEntry) => {
      if (!rec.checkIn || !rec.checkOut) return rec;
      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
      };
      let diff = toMin(rec.checkOut) - toMin(rec.checkIn);
      if (diff < 0) diff += 24 * 60; // overnight shift
      const workHours = Math.round((diff / 60) * 100) / 100;
      const sched = Number(rec.scheduledHours) || 8;
      const overtime = Math.max(0, Math.round((workHours - sched) * 100) / 100);
      const breakHours = Number(rec.breakHours) || 0;
      return { ...rec, workHours, overtimeHours: overtime, breakHours };
    };
    return (
      <div className="space-y-4">
        <EmployeeScopedCascade
          companies={companiesList}
          companyId={manualEntry.companyId ? String(manualEntry.companyId) : ''}
          branchId={manualEntry.branchId ? String(manualEntry.branchId) : ''}
          departmentId={manualEntry.departmentId ? String(manualEntry.departmentId) : ''}
          employeeId={manualEntry.employeeId ? String(manualEntry.employeeId) : ''}
          onScopeChange={(patch) => setManualEntry((prev) => ({ ...prev, ...patch }))}
          onCompanyChange={(val) => setManualEntry((prev) => ({ ...prev, companyId: val }))}
          onBranchChange={(val) => setManualEntry((prev) => ({ ...prev, branchId: val }))}
          onDepartmentChange={(val) => setManualEntry((prev) => ({ ...prev, departmentId: val }))}
          onEmployeeChange={(val) => setManualEntry((prev) => ({ ...prev, employeeId: val }))}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Field label="Date" required help="Attendance date">
            <DatePicker value={manualEntry.date} onChange={(val) => setManualEntry({ ...manualEntry, date: val })} />
          </Field>
          <Field label="Status" required help="Present, absent, leave, etc.">
            <SearchableSelect
              value={manualEntry.status}
              onChange={(val) => setManualEntry({ ...manualEntry, status: String(val) })}
              options={attendanceStatusOptions.map((opt: MasterDataOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) as string }))}
              placeholder="Select Status"
              showAllOption={false}
              className="w-full"
            />
          </Field>
          <Field label="Shift Type" help="Select the duty shift">
            <SearchableSelect
              value={manualEntry.shiftId ? String(manualEntry.shiftId) : ''}
              onChange={(val) => setManualEntry({ ...manualEntry, shiftId: val === '' ? '' : String(val) })}
              options={shiftNameOptions.map((opt: MasterDataOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) as string }))}
              placeholder="Select Shift"
              showAllOption={false}
              clearable
              className="w-full"
            />
          </Field>
          <Field label="Check In Time" help="Actual check-in time">
            <TimePicker value={manualEntry.checkIn} onChange={(val) => {
              const next = { ...manualEntry, checkIn: val };
              setManualEntry(applyTimeCalc(next));
            }} />
          </Field>
          <Field label="Check Out Time" help="Actual check-out time">
            <TimePicker value={manualEntry.checkOut} onChange={(val) => {
              const next = { ...manualEntry, checkOut: val };
              setManualEntry(applyTimeCalc(next));
            }} />
          </Field>
          <Field label="Check In Location" help="Location where check-in happened">
            <input className={inputCls} value={manualEntry.checkInLocationName} onChange={e => setManualEntry({ ...manualEntry, checkInLocationName: e.target.value })} />
          </Field>
          <Field label="Check In Latitude" help="Latitude of check-in">
            <input type="number" step="0.000001" className={inputCls} value={manualEntry.checkInLatitude} onChange={e => setManualEntry({ ...manualEntry, checkInLatitude: parseFloat(e.target.value) })} />
          </Field>
          <Field label="Check In Longitude" help="Longitude of check-in">
            <input type="number" step="0.000001" className={inputCls} value={manualEntry.checkInLongitude} onChange={e => setManualEntry({ ...manualEntry, checkInLongitude: parseFloat(e.target.value) })} />
          </Field>
          <Field label="Check Out Location" help="Location where check-out happened">
            <input className={inputCls} value={manualEntry.checkOutLocationName} onChange={e => setManualEntry({ ...manualEntry, checkOutLocationName: e.target.value })} />
          </Field>
          <Field label="Check Out Latitude" help="Latitude of check-out">
            <input type="number" step="0.000001" className={inputCls} value={manualEntry.checkOutLatitude} onChange={e => setManualEntry({ ...manualEntry, checkOutLatitude: parseFloat(e.target.value) })} />
          </Field>
          <Field label="Check Out Longitude" help="Longitude of check-out">
            <input type="number" step="0.000001" className={inputCls} value={manualEntry.checkOutLongitude} onChange={e => setManualEntry({ ...manualEntry, checkOutLongitude: parseFloat(e.target.value) })} />
          </Field>
        </div>

        <div>
          <p className="text-sm font-bold text-[var(--text-primary)] mb-3">Manual Entry Details <span className="font-normal text-xs text-gray-400">(for exceptions like a stolen or non-working mobile)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Device Type" help="Device used for the entry">
              <SearchableSelect
                value={manualEntry.deviceType}
                onChange={(val) => setManualEntry({ ...manualEntry, deviceType: String(val) })}
                options={deviceTypeOptions.map((opt: MasterDataOption) => ({ id: (opt.value || opt.code) as string, name: (opt.label || opt.name) as string }))}
                placeholder="Select Device"
                showAllOption={false}
                className="w-full"
              />
            </Field>
            <Field label="Reason for Manual Entry" help="Exception scenario (e.g. mobile stolen)">
              <SearchableSelect
                value={manualEntry.reason}
                onChange={(val) => setManualEntry({ ...manualEntry, reason: String(val) })}
                options={[
                  'Mobile device stolen',
                  'Mobile device lost',
                  'Mobile app not working',
                  'App crashed / technical issue',
                  'No network / connectivity issue',
                  'Forgot to check in',
                  'Battery dead',
                  'Device replaced / new mobile',
                  'Biometric not working',
                  'Manual correction after approval',
                ].map((r) => ({ id: r, name: r }))}
                placeholder="Select reason"
                showAllOption={false}
                clearable
                className="w-full"
              />
            </Field>
            <Field label="Notes" help="Optional notes / additional detail">
              <input className={inputCls} value={manualEntry.notes} onChange={e => setManualEntry({ ...manualEntry, notes: e.target.value })} placeholder="Optional notes..." />
            </Field>
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-[var(--text-primary)] mb-3">Timing & Hours <span className="font-normal text-xs text-gray-400">(auto calculated from check-in and check-out)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Work Hours" help="Hours worked">
              <input type="number" step="0.5" className={inputCls} value={manualEntry.workHours} onChange={e => setManualEntry({ ...manualEntry, workHours: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Scheduled Hours" help="Scheduled shift hours">
              <input type="number" step="0.5" className={inputCls} value={manualEntry.scheduledHours} onChange={e => setManualEntry({ ...manualEntry, scheduledHours: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Overtime Hours" help="Extra hours beyond schedule">
              <input type="number" step="0.5" className={inputCls} value={manualEntry.overtimeHours} onChange={e => setManualEntry({ ...manualEntry, overtimeHours: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Break Hours" help="Total break time">
              <input type="number" step="0.5" className={inputCls} value={manualEntry.breakHours} onChange={e => setManualEntry({ ...manualEntry, breakHours: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Late Arrival">
              <Toggle checked={!!manualEntry.isLate} onChange={(v) => setManualEntry({ ...manualEntry, isLate: v })} />
            </Field>
            <Field label="Early Departure">
              <Toggle checked={!!manualEntry.isEarlyDeparture} onChange={(v) => setManualEntry({ ...manualEntry, isEarlyDeparture: v })} />
            </Field>
          </div>
        </div>
      </div>
    );
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    manualEntryMutation.mutate({
      employeeId: Number(manualEntry.employeeId),
      date: manualEntry.date,
      checkIn: manualEntry.checkIn,
      checkOut: manualEntry.checkOut,
      status: manualEntry.status,
      notes: manualEntry.notes,
      reason: manualEntry.reason,
      shiftId: manualEntry.shiftId ? Number(manualEntry.shiftId) : undefined,
      companyId: manualEntry.companyId ? Number(manualEntry.companyId) : undefined,
      branchId: manualEntry.branchId ? Number(manualEntry.branchId) : undefined,
      departmentId: manualEntry.departmentId ? Number(manualEntry.departmentId) : undefined,
      workHours: manualEntry.workHours || undefined,
      scheduledHours: manualEntry.scheduledHours || 8,
      overtimeHours: manualEntry.overtimeHours || 0,
      breakHours: manualEntry.breakHours || 0,
      isManualEntry: true,
      isLate: manualEntry.isLate,
      lateMinutes: manualEntry.lateMinutes,
      isEarlyDeparture: manualEntry.isEarlyDeparture,
      location: manualEntry.location,
      checkInLocationName: manualEntry.checkInLocationName,
      checkOutLocationName: manualEntry.checkOutLocationName,
      checkInLatitude: manualEntry.checkInLatitude,
      checkInLongitude: manualEntry.checkInLongitude,
      checkOutLatitude: manualEntry.checkOutLatitude,
      checkOutLongitude: manualEntry.checkOutLongitude,
      isWithinGeofence: manualEntry.isWithinGeofence,
      deviceType: manualEntry.deviceType,
    });
  };

  const handleBulkUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkFile) {
      bulkUploadMutation.mutate(bulkFile);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/attendance/template', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'attendance_bulk_upload_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const activeEmployees = useMemo<EmployeeRecord[]>(() => {
    let filtered = employees;
    if (companyFilter !== 'all') filtered = filtered.filter((e: EmployeeRecord) => (e.companyId ?? e.company_id)?.toString() === companyFilter);
    if (branchFilter !== 'all') filtered = filtered.filter((e: EmployeeRecord) => (e.branchId ?? e.branch_id)?.toString() === branchFilter);
    if (departmentFilter !== 'all') filtered = filtered.filter((e: EmployeeRecord) => (e.departmentId ?? e.department_id)?.toString() === departmentFilter);
    return filtered;
  }, [employees, companyFilter, branchFilter, departmentFilter]);

  const roster = useMemo<AttendanceRow[]>(() => {
    if (!activeEmployees || activeEmployees.length === 0) return attendanceRecords || [];
    
    if (!startDate) {
       return attendanceRecords
         .filter((r: AttendanceRow) => activeEmployees.some((emp: EmployeeRecord) => emp.id === r.employeeId))
         .map((r: AttendanceRow) => {
           const emp = activeEmployees.find((e: EmployeeRecord) => e.id === r.employeeId);
           if (emp) {
              return { ...r, employeeName: personDisplayName(emp, 'Unknown Employee'), employeeCode: emp.employeeCode || '', email: emp.email || '', companyName: emp.company?.name || '', branchName: emp.branch?.name || '', departmentName: emp.department?.name || '' };
           }
           return r;
         });
    }

    if (startDate !== endDate) {
       return attendanceRecords
         .filter((r: AttendanceRow) => {
           if (!activeEmployees.some((emp: EmployeeRecord) => emp.id === r.employeeId)) return false;
           if (r.date && r.date >= startDate && r.date <= endDate) return true;
           return false;
         })
         .map((r: AttendanceRow) => {
           const emp = activeEmployees.find((e: EmployeeRecord) => e.id === r.employeeId);
           if (emp) {
              return { ...r, employeeName: personDisplayName(emp, 'Unknown Employee'), employeeCode: emp.employeeCode || '', email: emp.email || '', companyName: emp.company?.name || '', branchName: emp.branch?.name || '', departmentName: emp.department?.name || '' };
           }
           return r;
         });
    }

    const fullRoster: AttendanceRow[] = [];
    activeEmployees.forEach((emp: EmployeeRecord) => {
      const record = attendanceRecords.find((r: AttendanceType) => r.employeeId === emp.id && r.date?.startsWith(startDate));
      if (record) {
        fullRoster.push({ ...record, employeeName: personDisplayName(emp, 'Unknown Employee'), employeeCode: emp.employeeCode || '', email: emp.email || '', companyName: emp.company?.name || '', branchName: emp.branch?.name || '', departmentName: emp.department?.name || '' });
      } else {
        fullRoster.push({
          id: `pending-${emp.id}-${startDate}`,
          employeeId: emp.id,
          employeeName: personDisplayName(emp, 'Unknown Employee'),
          employeeCode: emp.employeeCode || 'N/A',
          email: emp.email || '',
          department: emp.department || 'N/A',
          companyId: emp.companyId || '',
          branchId: emp.branchId || '',
          departmentId: emp.departmentId || '',
          companyName: emp.company?.name || '',
          branchName: emp.branch?.name || '',
          departmentName: emp.department?.name || '',
          date: startDate,
          status: 'Absent',
          workHours: 0,
          scheduledHours: 8,
          checkIn: null,
          checkOut: null,
          isLate: false,
          overtimeHours: 0
        });
      }
    });
    return fullRoster;
  }, [activeEmployees, attendanceRecords, startDate, endDate]);

  const filteredAttendance = useMemo<AttendanceRow[]>(() => {
    if (!roster) return [];
    return roster.filter((record: AttendanceRow) => {
      const matchesSearch = !searchTerm || 
        (record.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.employeeCode || '').toLowerCase().includes(searchTerm.toLowerCase());

      let matchesStatus = true;
      if (statusFilter !== 'all') {
        const recordStatus = record.status?.toLowerCase() || '';
        if (statusFilter === 'late') {
          matchesStatus = record.isLate || recordStatus === 'late';
        } else if (statusFilter === 'early') {
          matchesStatus = record.isEarlyDeparture || false;
        } else if (statusFilter === 'leave') {
          matchesStatus = recordStatus.includes('leave');
        } else {
          matchesStatus = recordStatus === statusFilter;
        }
      }

      return matchesSearch && matchesStatus;
    });
  }, [roster, searchTerm, statusFilter]);

  // =============================================================================
  // STATS
  // =============================================================================

  const totalWorkforce = activeEmployees?.length || 0;
  const presentCount = roster.filter((r: AttendanceRow) => r.status?.toLowerCase() === 'present').length || attendanceRecords.filter((r) => r.status?.toLowerCase() === 'present').length;
  const lateCount = roster.filter((r: AttendanceRow) => r.isLate || r.status?.toLowerCase() === 'late').length || attendanceRecords.filter((r) => r.isLate || r.status?.toLowerCase() === 'late').length;
  const absentCount = roster.filter((r: AttendanceRow) => r.status?.toLowerCase() === 'absent').length;
  const onLeaveCount = roster.filter((r: AttendanceRow) => r.status?.toLowerCase().includes('leave')).length || attendanceRecords.filter((r) => r.status?.toLowerCase().includes('leave')).length;
  const earlyDepartureCount = roster.filter((r: AttendanceRow) => r.isEarlyDeparture).length || attendanceRecords.filter((r) => r.isEarlyDeparture).length;

  const statCards = [
    { label: 'Total Workforce', value: totalWorkforce, icon: Users, color: 'blue', onClick: () => { setActiveTab('records'); setStatusFilter('all'); } },
    { label: 'Present Today', value: presentCount, icon: CheckCircle, trend: totalWorkforce ? Math.round((presentCount / totalWorkforce) * 100) : 0, color: 'green', onClick: () => { setActiveTab('records'); setStatusFilter('present'); } },
    { label: 'Late Arrivals', value: lateCount, icon: Clock, color: 'orange', onClick: () => { setActiveTab('records'); setStatusFilter('late'); } },
    { label: 'On Leave', value: onLeaveCount, icon: Calendar, color: 'purple', onClick: () => { setActiveTab('records'); setStatusFilter('leave'); } },
    { label: 'Early Departure', value: earlyDepartureCount, icon: LogOut, color: 'red', onClick: () => { setActiveTab('records'); setStatusFilter('early'); } },
    { label: 'Absent', value: absentCount, icon: X, color: 'red', onClick: () => { setActiveTab('records'); setStatusFilter('absent'); } },
  ];

  // =============================================================================
  // BULK ACTIONS
  // =============================================================================

  const bulkMarkMutation = useMutation({
    mutationFn: async (payload: { status: string, records: {employeeId: number, date: string}[] }) => {
      const response = await api.post('/attendance/bulk-mark', {
        records: payload.records,
        status: payload.status
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      if (data.linked_leaves > 0) {
        toast.success(`${data.message || `Marked ${data.updated + data.created} records`}`, { duration: 4000 });
      } else {
        toast.success(`Marked ${data.updated + data.created} records`);
      }
    },
    onError: (error) => {
      // Error logged
      toast.error('Failed to update attendance');
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (records: { employeeId: number; date: string }[]) => {
      const response = await api.post('/attendance/bulk-delete', { records });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setConfirmTarget(null);
      toast.success(data.message || 'Attendance records deleted');
    },
    onError: (error) => {
      // Error logged
      setConfirmTarget(null);
      toast.error('Failed to delete attendance records');
    }
  });

  // =============================================================================
  // RENDER
  // =============================================================================

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (attendanceData !== undefined && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [attendanceData, hasLoaded]);

  const isInitialAttendanceLoading = !hasLoaded && isFetching;
  if (isInitialAttendanceLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      <div className="w-full mx-auto space-y-6">
        {/* Header Section */}
        <PageHero
          title="Attendance Management"
          subtitle="Track attendance, manage shifts, timesheets"
          icon={Clock}
          accent="cyan"
          breadcrumbs={['HRMS.Pro!', 'Attendance']}
          actions={
            <>
              {activeTab === 'records' && (
                <>
                  <button
                    onClick={async () => {
                      toast.loading('AI optimizing schedule...', { id: 'ai-att' });
                      try {
                        await runAutomation('shift_schedule', { tab: activeTab });
                        toast.success('AI schedule generated', { id: 'ai-att' });
                      } catch { toast.error('AI unavailable', { id: 'ai-att' }); }
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
                    title="AI Automation"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">AI</span>
                  </button>
                  <ExportButton
                    rows={filteredAttendance}
                    filename="attendance_export"
                    label="Export"
                  />
                    <button
                    onClick={() => setShowBulkModal(true)} title="Upload .csv file"
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
                    >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Upload</span>
                    </button>
                    <button
                    onClick={() => { setShowManualModal(true); setManualEntry({ employeeId: '', organizationId: '', companyId: '', branchId: '', departmentId: '', shiftId: '', attendanceType: '', date: new Date().toISOString().split('T')[0], checkIn: '', checkOut: '', status: 'Present', workHours: 0, scheduledHours: 8, overtimeHours: 0, breakHours: 0, isLate: false, lateMinutes: 0, isEarlyDeparture: false, earlyDepartureMinutes: 0, notes: '', comments: '', reason: '', location: '', checkInLocationName: '', checkOutLocationName: '', checkInLatitude: 0, checkInLongitude: 0, checkOutLatitude: 0, checkOutLongitude: 0, geofenceId: '', isWithinGeofence: true, checkInSelfieUrl: '', checkOutSelfieUrl: '', selfieVerified: false, deviceId: '', deviceType: 'web', ipAddress: '', userAgent: '', isWorkFromHome: false, wfhApprovalId: '', wfhLocation: '', isManualEntry: true, approvedBy: '', approvalComments: '', leaveApplicationId: '', isOnLeave: false, isHoliday: false, holidayId: '' }); setFormTab('basic'); setIsClosing(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#1C64F2] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                    >
                    <Plus className="w-4 h-4" />
                    Manual Entry
                    </button>
                  </>
                  )}
                  {activeTab === 'duty-shift' && (
                  <button
                  onClick={() => {
                  setEditingShift(null);
                  setShiftForm({ name: '', code: '', shift_type: 'morning', start_time: '09:00', end_time: '17:00', grace_minutes: 15, break_duration: 60, working_days: '1,2,3,4,5', color: '#3B82F6', description: '', organization_id: 0, company_id: null, branch_id: null, department_id: null, status: 'active' });
                  setShowShiftModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#1C64F2] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                  >
                  <Plus className="w-4 h-4" />
                  Add Shift
                  </button>
                  )}
                  {activeTab === 'duty-roster' && (
                  <button
                  onClick={() => setShowRosterModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#1C64F2] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
                  >
                  <ArrowRightLeft className="w-4 h-4" />
                  Assign Roster
                  </button>
                  )}
            </>
          }
        />
                  
                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                  {statCards.map((stat, index) => (
                  <div key={stat.label} className="transition-all duration-300" style={{ transitionDelay: `${index * 100}ms` }}>
                  <StatsCard icon={stat.icon} label={stat.label} value={stat.value} color={stat.color} trend={stat.trend} onClick={stat.onClick} />
                  </div>
                  ))}
                  </div>
                  
                  {/* TABS - Pill Style like Company Page */}
                  <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
                    <div className="flex flex-wrap items-center gap-2">
                      {TABS.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as TabId)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                            activeTab === tab.id
                              ? 'bg-[var(--primary-blue)] text-white shadow-md shadow-[#1C64F2]/20'
                              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)]'
                          }`}
                        >
                          <tab.icon className="w-4 h-4" />
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

            {activeTab === 'records' && (
              <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden mb-6">
                <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
                  <div className="flex flex-wrap items-center gap-3">
                    <SearchableSelect
                      value={companyFilter === 'all' ? 'all' : companyFilter}
                      onChange={(val) => setCompanyFilter(val.toString())}
                      options={(companies || []).map((c: OptionItem) => ({ id: String(c.id), name: c.name }))}
                      placeholder="All Companies"
                      allOption="All Companies"
                      className="w-40"
                    />
                    <SearchableSelect
                      value={branchFilter === 'all' ? 'all' : branchFilter}
                      onChange={(val) => setBranchFilter(val.toString())}
                      options={(branches || []).map((b: OptionItem) => ({ id: String(b.id), name: b.name }))}
                      placeholder="All Branches"
                      allOption="All Branches"
                      className="w-40"
                    />
                    <SearchableSelect
                      value={departmentFilter === 'all' ? 'all' : departmentFilter}
                      onChange={(val) => setDepartmentFilter(val.toString())}
                      options={(departments || []).map((d: OptionItem) => ({ id: String(d.id), name: d.name }))}
                      placeholder="All Departments"
                      allOption="All Departments"
                      className="w-40"
                    />
                    <SearchableSelect
                      value={statusFilter === 'all' ? 'all' : statusFilter}
                      onChange={(val) => setStatusFilter(val.toString())}
                      options={(attendanceStatusOptions || []).map((opt: MasterDataOption) => ({ id: opt.code || opt.value || '', name: opt.name || opt.label || '' }))}
                      placeholder="All Status"
                      allOption="All Status"
                      className="w-40"
                    />
                    <DateRangePicker 
                      startDate={startDate} 
                      endDate={endDate} 
                      onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
                      placeholder="Select Date"
                    />
                    {Boolean(searchTerm || companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setCompanyFilter('all');
                          setBranchFilter('all');
                          setDepartmentFilter('all');
                          setStatusFilter('all');
                        }}
                        className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-white text-sm cursor-pointer hover:bg-[#F8FAFC] transition-colors" title="Show attendance for deactivated/terminated employees too">
                      <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
                        className="w-4 h-4 text-[var(--primary-blue)] border-gray-300 rounded focus:ring-[#1C64F2]" />
                      <span className="text-xs text-[#64748B]">Include deactivated</span>
                    </label>
                  </div>
                </div>

            {/* Table */}
            {isAttendanceLoading ? (
              <div className="animate-page-enter"><PageSkeleton /></div>
            ) : (
                <div className="overflow-x-auto">
                <DataTable
                  data={filteredAttendance}
                  rowKey={(record: AttendanceRow) => `${record.employeeId}-${record.date}`}
                  searchable
                  searchKeys={(record: AttendanceRow) => `${record.employeeName || ''} ${record.status || ''} ${record.date || ''}`}
                  searchPlaceholder="Search attendance..."
                  emptyMessage="No attendance records found"
                  logEntityType="attendance"
                  logFor={(record: AttendanceRow) => ({ id: record.id ?? `${record.employeeId}-${record.date}`, label: `${record.employeeName} — ${record.date}` })}
                  selectable
                  bulkActions={[
                    {
                      label: 'Quick Action',
                      icon: Zap,
                      variant: 'primary',
                      onAction: (rows: AttendanceRow[]) => { setQuickStatus(''); setQuickTab('attendance'); setQuickActionTarget({ type: 'bulk', records: rows }); },
                    },
                  ]}
              onDelete={(rows: AttendanceRow[]) => setBulkDeleteTarget({ items: rows })}
              onEdit={(record) => {
                setEditingAttendanceId(record.id as number);
                setManualEntry({
                  employeeId: record.employeeId?.toString() || '',
                  organizationId: '',
                  companyId: (record.companyId || '').toString(),
                  branchId: (record.branchId || '').toString(),
                  departmentId: (record.departmentId || '').toString(),
                  shiftId: (record.shiftId || '').toString(),
                  attendanceType: '',
                  date: record.date || '',
                  checkIn: record.checkIn || '',
                  checkOut: record.checkOut || '',
                  status: record.status || '',
                  workHours: record.workHours || 0,
                  scheduledHours: 8,
                  overtimeHours: record.overtimeHours || 0,
                  breakHours: record.breakHours || 0,
                  isLate: record.isLate || false,
                  lateMinutes: record.lateMinutes || 0,
                  isEarlyDeparture: record.isEarlyDeparture || false,
                  earlyDepartureMinutes: record.earlyDepartureMinutes || 0,
                  notes: record.notes || '',
                  comments: record.comments || '',
                  reason: record.reason || '',
                  location: record.location || '',
                  checkInLocationName: record.checkInLocationName || '',
                  checkOutLocationName: record.checkOutLocationName || '',
                  checkInLatitude: record.checkInLatitude || 0,
                  checkInLongitude: record.checkInLongitude || 0,
                  checkOutLatitude: record.checkOutLatitude || 0,
                  checkOutLongitude: record.checkOutLongitude || 0,
                  geofenceId: '',
                  isWithinGeofence: true,
                  checkInSelfieUrl: '',
                  checkOutSelfieUrl: '',
                  selfieVerified: false,
                  deviceId: '',
                  deviceType: 'web',
                  ipAddress: '',
                  userAgent: '',
                  isWorkFromHome: false,
                  wfhApprovalId: '',
                  wfhLocation: '',
                  isManualEntry: true,
                  approvedBy: '',
                  approvalComments: '',
                  leaveApplicationId: '',
                  isOnLeave: false,
                  isHoliday: false,
                  holidayId: ''
                });
                setShowManualModal(true);
                setFormTab('basic');
                setIsClosing(false);
              }}
                  columns={[
                    {
                      key: 'employeeName', header: 'Employee', sortable: true,
                      render: (record: AttendanceRow) => (
                        <button
                          onClick={() => {
                            const emp = employees.find((e: EmployeeRecord) => e.id === record.employeeId);
                            if (emp) { setCalendarEmployeeData(emp); setShowEmpCalendar(true); }
                          }}
                          className="flex items-center gap-3 text-left group"
                        >
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-sm font-medium text-[#1C64F2] group-hover:text-[#1E40AF] group-hover:underline transition-colors">{record.employeeName || `EMP-${record.employeeId}`}</span>
                              {record.employeeCode && <span className="inline-flex px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] text-[10px] font-medium rounded">{record.employeeCode}</span>}
                            </div>
                            <div className="text-xs text-[#64748B] truncate max-w-[220px]">{record.email || ''}</div>
                          </div>
                        </button>
                      ),
                      sortValue: (record: AttendanceRow) => record.employeeName || '',
                    },
                    { key: 'companyName', header: 'Company', render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.companyName || '-'}</span> },
                    { key: 'branchName', header: 'Branch', render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.branchName || '-'}</span> },
                    { key: 'departmentName', header: 'Department', render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.departmentName || '-'}</span> },
                    { key: 'date', header: 'Date', sortable: true, render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.date}</span>, sortValue: (record: AttendanceRow) => record.date },
                    { key: 'checkIn', header: 'Check In', render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.checkIn || '-'}</span> },
                    { key: 'checkOut', header: 'Check Out', render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.checkOut || '-'}</span> },
                    {
                      key: 'status', header: 'Status', sortable: true,
                      render: (record: AttendanceRow) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getAttendanceStatusBadge(record.status || '')}`}>{capitalizeStatus(record.status)}</span>,
                      sortValue: (record: AttendanceRow) => record.status,
                    },
                    { key: 'workHours', header: 'Work Hrs', render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.workHours ?? '-'}</span> },
                    { key: 'overtimeHours', header: 'OT', render: (record: AttendanceRow) => <span className="text-sm text-[#64748B]">{record.overtimeHours ? `${record.overtimeHours}h` : '-'}</span> },
                  ]}
                  actions={(record: AttendanceRow) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setEditingAttendanceId(record.id as number);
                          setShowManualModal(true);
                          setFormTab('basic');
                          setIsClosing(false);
                          setManualEntry({
                            employeeId: String(record.employeeId),
                            organizationId: '',
                            companyId: '', branchId: '',
                            departmentId: '',
                            shiftId: (record.shiftId || '') as string,
                            attendanceType: '',
                            date: record.date || new Date().toISOString().split('T')[0],
                            checkIn: record.checkIn || '',
                            checkOut: record.checkOut || '',
                            status: record.status || 'Present',
                            workHours: record.workHours || 0,
                            scheduledHours: record.scheduledHours || 8,
                            overtimeHours: record.overtimeHours || 0,
                            breakHours: record.breakHours || 0,
                            isLate: record.isLate || false,
                            lateMinutes: record.lateMinutes || 0,
                            isEarlyDeparture: record.isEarlyDeparture || false,
                            earlyDepartureMinutes: record.earlyDepartureMinutes || 0,
                            notes: record.notes || '',
                            comments: record.comments || '',
                            reason: record.reason || '',
                            location: record.location || '',
                            checkInLocationName: record.checkInLocationName || '',
                            checkOutLocationName: record.checkOutLocationName || '',
                            checkInLatitude: record.checkInLatitude || 0,
                            checkInLongitude: record.checkInLongitude || 0,
                            checkOutLatitude: record.checkOutLatitude || 0,
                            checkOutLongitude: record.checkOutLongitude || 0,
                            geofenceId: '',
                            isWithinGeofence: true,
                            checkInSelfieUrl: '',
                            checkOutSelfieUrl: '',
                            selfieVerified: false,
                            deviceId: '',
                            deviceType: 'web',
                            ipAddress: '',
                            userAgent: '',
                            isWorkFromHome: false,
                            wfhApprovalId: '',
                            wfhLocation: '',
                            isManualEntry: true,
                            approvedBy: '',
                            approvalComments: '',
                            leaveApplicationId: '',
                            isOnLeave: false,
                            isHoliday: false,
                            holidayId: ''
                          });
                          setShowManualModal(true);
                        }}
                        className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setQuickStatus(''); setQuickTab('attendance'); setQuickActionTarget({ type: 'single', record }); }}
                        className="p-2 text-[#7C3AED] hover:bg-[#7C3AED]/10 rounded-lg transition-colors" title="Quick Action"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmTarget({ type: 'delete-record', id: record.id })}
                        className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'duty-shift' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden mb-6">
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={shiftCompanyFilter === 'all' ? 'all' : shiftCompanyFilter}
                  onChange={(val) => setShiftCompanyFilter(val.toString())}
                  options={(companies || []).map((c: OptionItem) => ({ id: String(c.id), name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={shiftBranchFilter === 'all' ? 'all' : shiftBranchFilter}
                  onChange={(val) => setShiftBranchFilter(val.toString())}
                  options={(branches || []).map((b: OptionItem) => ({ id: String(b.id), name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={shiftDeptFilter === 'all' ? 'all' : shiftDeptFilter}
                  onChange={(val) => setShiftDeptFilter(val.toString())}
                  options={(departments || []).map((d: OptionItem) => ({ id: String(d.id), name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                {Boolean(shiftSearchTerm || shiftCompanyFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setShiftSearchTerm('');
                      setShiftCompanyFilter('all');
                    }}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            {loadingShifts ? (
              <div className="py-8 px-4">
                null
              </div>
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  data={shifts.filter((s: ShiftRecord) => {
                    const matchSearch = !shiftSearchTerm || s.name?.toLowerCase().includes(shiftSearchTerm.toLowerCase()) || s.code?.toLowerCase().includes(shiftSearchTerm.toLowerCase());
                    const matchCompany = shiftCompanyFilter === 'all' || s.company_id?.toString() === shiftCompanyFilter;
                    const matchBranch = shiftBranchFilter === 'all' || s.branch_id?.toString() === shiftBranchFilter;
                    const matchDept = shiftDeptFilter === 'all' || s.department_id?.toString() === shiftDeptFilter;
                    return matchSearch && matchCompany && matchBranch && matchDept;
                  })}
                  rowKey={(shift: ShiftRecord) => shift.id}
                  logEntityType="shift"
                  logFor={(shift: ShiftRecord) => ({ id: shift.id, label: shift.name })}
                  searchable
                  searchKeys={(shift: ShiftRecord) => `${shift.name || ''} ${shift.code || ''} ${shift.shift_type || ''}`}
                  searchPlaceholder="Search shifts..."
                  emptyMessage="No shifts found"
                  columns={[
                    {
                      key: 'name', header: 'Shift', sortable: true,
                      render: (shift: ShiftRecord) => (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="font-semibold text-[#0F172A] text-sm">{shift.name}</div>
                            <div className="text-xs text-[#94A3B8] font-mono">{shift.code}</div>
                          </div>
                        </div>
                      ),
                      sortValue: (shift: ShiftRecord) => shift.name,
                    },
                    {
                      key: 'shift_type', header: 'Type',
                      render: (shift: ShiftRecord) => {
                        const colors: Record<string, string> = { morning: 'bg-blue-100 text-blue-700', evening: 'bg-orange-100 text-orange-700', night: 'bg-purple-100 text-purple-700', general: 'bg-green-100 text-green-700' };
                        return <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${colors[shift.shift_type] || 'bg-gray-100 text-gray-600'}`}>{shift.shift_type}</span>;
                      },
                    },
                    { key: 'hours', header: 'Hours', render: (shift: ShiftRecord) => <div className="text-sm font-medium text-[#0F172A]">{shift.start_time} — {shift.end_time}</div> },
                    {
                      key: 'working_days', header: 'Working Days',
                      render: (shift: ShiftRecord) => {
                        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                        const workDays = shift.working_days?.split(',').map((d: string) => dayNames[parseInt(d.trim())] || d).join(', ');
                        return <span className="text-sm text-[#64748B]">{workDays}</span>;
                      },
                    },
                    {
                      key: 'grace', header: 'Grace / Break',
                      render: (shift: ShiftRecord) => (
                        <div>
                          <div className="text-sm text-[#64748B]">Grace: <span className="font-medium text-[#0F172A]">{shift.grace_minutes}m</span></div>
                          <div className="text-sm text-[#64748B]">Break: <span className="font-medium text-[#0F172A]">{shift.break_duration}m</span></div>
                        </div>
                      ),
                    },
                    {
                      key: 'status', header: 'Status', sortable: true,
                      render: (shift: ShiftRecord) => <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(shift.status || '')}`}>{capitalizeStatus(shift.status)}</span>,
                      sortValue: (shift: ShiftRecord) => shift.status,
                    },
                  ]}
                  actions={(shift: ShiftRecord) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <Tooltip id={`btn-edit-shift-${shift.id}`} content="Edit">
                        <button
                          onClick={() => {
                            setEditingShift(shift);
                            setShiftForm({ name: shift.name, code: shift.code, shift_type: shift.shift_type, start_time: shift.start_time, end_time: shift.end_time, grace_minutes: shift.grace_minutes, break_duration: shift.break_duration, working_days: shift.working_days, color: shift.color || '#3B82F6', description: shift.description || '', organization_id: shift.organization_id, company_id: shift.company_id, branch_id: shift.branch_id, department_id: shift.department_id, status: shift.status });
                            setShowShiftModal(true);
                          }}
                          className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip id={`btn-delete-shift-${shift.id}`} content="Deactivate">
                        <button
                          onClick={() => setConfirmTarget({ type: 'deactivate-shift', id: shift.id, name: shift.name })}
                          className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Deactivate"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        )}
        {activeTab === 'duty-roster' && (
          <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
            <div className="flex flex-col md:flex-row gap-4 px-6 py-5 border-b border-[var(--border-color)] bg-white">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  placeholder="Search by employee name..."
                  value={rosterSearchTerm}
                  onChange={(e) => setRosterSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2] transition-shadow"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={rosterCompanyFilter === 'all' ? 'all' : rosterCompanyFilter}
                  onChange={(val) => setRosterCompanyFilter(val.toString())}
                  options={(companies || []).map((c: OptionItem) => ({ id: String(c.id), name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={rosterBranchFilter === 'all' ? 'all' : rosterBranchFilter}
                  onChange={(val) => setRosterBranchFilter(val.toString())}
                  options={(branches || []).map((b: OptionItem) => ({ id: String(b.id), name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={rosterDeptFilter === 'all' ? 'all' : rosterDeptFilter}
                  onChange={(val) => setRosterDeptFilter(val.toString())}
                  options={(departments || []).map((d: OptionItem) => ({ id: String(d.id), name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                
                {Boolean(rosterSearchTerm || rosterCompanyFilter !== 'all' || rosterBranchFilter !== 'all' || rosterDeptFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setRosterSearchTerm('');
                      setRosterCompanyFilter('all');
                      setRosterBranchFilter('all');
                      setRosterDeptFilter('all');
                    }}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {loadingRoster ? (
                <div className="py-8 px-4">
                  null
                </div>
              ) : (() => {
                const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                const dayIds = [1, 2, 3, 4, 5, 6, 0];
                // group roster by employee
                const byEmployee: Record<string, RosterEntry[]> = {};
                weeklyRoster.forEach((entry: RosterEntry) => {
                  const key = `${entry.employee_id}||${entry.employee_name}`;
                  if (!byEmployee[key]) byEmployee[key] = [];
                  byEmployee[key].push(entry);
                });
                const filteredEmployees = Object.entries(byEmployee).filter(([key]) => {
                  const [empId, empName] = key.split('||');
                  const matchName = !rosterSearchTerm || empName?.toLowerCase().includes(rosterSearchTerm.toLowerCase());
                  // find corresponding employee for company/branch/dept filtering
                  const emp = employees.find((e: EmployeeRecord) => e.id?.toString() === empId);
                  const matchCompany = rosterCompanyFilter === 'all' || emp?.company_id?.toString() === rosterCompanyFilter;
                  const matchBranch = rosterBranchFilter === 'all' || emp?.branch_id?.toString() === rosterBranchFilter;
                  const matchDept = rosterDeptFilter === 'all' || emp?.department_id?.toString() === rosterDeptFilter;
                  return matchName && matchCompany && matchBranch && matchDept;
                });
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse min-w-[700px]">
                      <thead className="bg-[var(--background)] border-b border-[var(--border-color)]">
                        <tr>
                          <th className="px-5 py-3.5 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider w-48">Employee</th>
                          {dayLabels.map((d, i) => {
                            const date = new Date(rosterWeekStart);
                            date.setDate(date.getDate() + i);
                            return (
                              <th key={d} className="px-3 py-3.5 text-center text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                <div>{d}</div>
                                <div className="font-normal text-[var(--text-disabled)] mt-0.5">{date.getDate()}/{date.getMonth()+1}</div>
                              </th>
                            );
                          })}
                          <th className="px-5 py-3.5 text-right text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {filteredEmployees.map(([key, entries]) => {
                          const [, empName] = key.split('||');
                          return (
                            <tr key={key} className="hover:bg-[var(--background)] transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1C64F2] to-[#8B5CF6] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                    {(empName || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                  </div>
                                  <span className="text-sm font-medium text-[var(--text-primary)] whitespace-normal leading-tight">{empName}</span>
                                </div>
                              </td>
                              {dayIds.map((dayId) => {
                                const entry = entries.find((e: RosterEntry) => e.day_of_week === dayId);
                                return (
                                  <td key={dayId} className="px-3 py-3 text-center">
                                    {entry ? (
                                      <div
                                        className="inline-flex flex-col items-center px-2 py-1 rounded-lg text-white text-xs font-medium"
                                        style={{ backgroundColor: entry.shift_color || '#1C64F2' }}
                                      >
                                        <span>{entry.shift_name}</span>
                                        <span className="opacity-80 text-[10px]">{entry.shift_start_time}—{entry.shift_end_time}</span>
                                      </div>
                                    ) : (
                                      <span className="text-[#CBD5E1] text-xs">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-5 py-3 text-right">
                                <button
                                  onClick={() => {
                                    entries.forEach((e: RosterEntry) => deleteRosterMutation.mutate(e.id));
                                  }}
                                  className="p-1.5 text-[#F59E0B] hover:bg-[#F59E0B]/10 rounded-lg transition-colors"
                                  title="Remove all assignments for this employee this week"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredEmployees.length === 0 && (
                          <tr><td colSpan={9} className="py-16 text-center">
                            <div className="flex flex-col items-center text-[var(--text-tertiary)]">
                              <CalendarDays className="w-12 h-12 mb-4 opacity-30" />
                              <p className="font-medium">{rosterSearchTerm ? 'No employees match your search' : 'No roster assigned for this week'}</p>
                              <p className="text-sm mt-1">{rosterSearchTerm ? 'Try a different name' : 'Click "Assign Roster" to configure shifts for your team'}</p>
                            </div>
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
          </div>
        )}

        {activeTab === 'configuration' && (
          <div className="animate-in fade-in duration-300 space-y-6">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-amber-600" />
                    Attendance Configuration
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Configure work schedules, shifts, overtime rules, geofencing, and payroll integration settings.
                  </p>
                </div>
                <button
                  onClick={() => setShowAttendanceConfig(true)}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-amber-200/50 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Open Configuration
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] flex items-center justify-center text-white shadow-sm">
                    <Clock className="w-5 h-5" />
                  </span>
                  <h4 className="text-sm font-bold text-[#0F172A]">Work Schedule</h4>
                </div>
                <p className="text-xs text-[#94A3B8]">Working days, hours, grace periods</p>
              </div>
              <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white shadow-sm">
                    <Zap className="w-5 h-5" />
                  </span>
                  <h4 className="text-sm font-bold text-[#0F172A]">Shifts & Overtime</h4>
                </div>
                <p className="text-xs text-[#94A3B8]">Shift templates, OT rules, comp-off</p>
              </div>
              <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1C64F2] to-[#1C64F2] flex items-center justify-center text-white shadow-sm">
                    <MapPin className="w-5 h-5" />
                  </span>
                  <h4 className="text-sm font-bold text-[#0F172A]">Geofencing & IP</h4>
                </div>
                <p className="text-xs text-[#94A3B8]">Location, WiFi, IP restrictions</p>
              </div>
              <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] flex items-center justify-center text-white shadow-sm">
                    <TrendingUp className="w-5 h-5" />
                  </span>
                  <h4 className="text-sm font-bold text-[#0F172A]">Payroll Integration</h4>
                </div>
                <p className="text-xs text-[#94A3B8]">Half-day, weekend, manual override rules</p>
              </div>
            </div>
          </div>
        )}

        {showAttendanceConfig && (
          <AttendanceConfig open={showAttendanceConfig} onClose={() => setShowAttendanceConfig(false)} />
        )}
      </div>

      {/* Full Page Drawer Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            onClick={handleCloseDrawer}
          />
          <div
            className={`fixed inset-0 bg-white shadow-2xl transform transition-all duration-300 ease-in-out ${
              isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
          >
            <div className="h-full flex flex-col">
              <form onSubmit={(e) => { e.preventDefault(); handleManualSubmit(e); }} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#F59E0Bbb] flex items-center justify-center text-white shadow-sm">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">{editingAttendanceId ? 'Edit Attendance Record' : 'Manual Attendance Entry'}</h2>
                    <p className="text-xs text-[#64748B]">Fill in the attendance details below</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleCloseDrawer} className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                  <button type="submit" disabled={manualEntryMutation.isPending} className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2">
                    {manualEntryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Saving...
                  </button>
                  <button type="button" onClick={handleCloseDrawer} className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Help Text */}
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  Fill in the attendance details below and click Save Attendance to save.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {renderAttendanceForm()}
                </div>
              </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Bulk Upload Attendance</h2>
              <button onClick={() => setShowBulkModal(false)} className="p-2 hover:bg-[var(--background)] rounded-lg"><X className="w-5 h-5 text-[var(--text-tertiary)]" /></button>
            </div>
            <form onSubmit={handleBulkUpload} className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Instructions:</strong><br />
                  1. Download the template first<br />
                  2. Fill in your data in the CSV file<br />
                  3. Upload the filled CSV file<br />
                  <strong>Required columns:</strong> employee_id, date, check_in, check_out, status<br />
                  <strong>Status options:</strong> Present, Late, Absent, Half Day, On Leave
                </p>
              </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl hover:bg-[#059669] transition-all duration-200"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV File</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!bulkFile || bulkUploadMutation.isPending}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {bulkUploadMutation.isPending ? (
                      null
                    ) : (
                      'Upload'
                    )}
                  </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* EMPLOYEE ATTENDANCE CALENDAR MODAL */}
      <EmployeeCalendarEditor
        isOpen={showEmpCalendar}
        onClose={() => { setShowEmpCalendar(false); setCalendarEmployeeData(null); }}
        employee={calendarEmployeeData}
        attendanceStatusOptions={attendanceStatusOptions}
      />
      {/* SHIFT CREATE/EDIT MODAL */}
      {showShiftModal && (
        <div className="fixed inset-0 z-[60] flex">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" />
            <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-gradient-to-r from-[#F8FAFC] to-white">
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">{editingShift ? 'Edit Shift' : 'Create New Shift'}</h2>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">Configure shift timing, working days, and grace periods.</p>
              </div>
              <button onClick={() => { setShowShiftModal(false); setEditingShift(null); }} className="p-2 hover:bg-[var(--hover-bg)] rounded-xl transition-colors">
                <X className="w-5 h-5 text-[var(--text-tertiary)]" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingShift) {
                  updateShiftMutation.mutate({ id: editingShift.id, payload: shiftForm });
                } else {
                  const user = getCurrentUser();
                  createShiftMutation.mutate({ ...shiftForm, organization_id: (user as { organization_id?: number })?.organization_id || 1 });
                }
              }}
              className="p-6 space-y-4 overflow-y-auto max-h-[70vh]"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">Shift Name *</label>
                  <input required value={shiftForm.name} onChange={e => setShiftForm(f => ({ ...f, name: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" placeholder="e.g. Morning Shift" />
                  <p className="mt-1 text-xs text-gray-400">Display name of the shift</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">Shift Code *</label>
                  <input required value={shiftForm.code} onChange={e => setShiftForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" placeholder="e.g. MORNING" />
                  <p className="mt-1 text-xs text-gray-400">Short unique code</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">Shift Type</label>
                  <select value={shiftForm.shift_type} onChange={e => setShiftForm(f => ({ ...f, shift_type: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]">
                    {shiftTypeOptions.map((opt: MasterDataOption) => (
                      <option key={opt.code} value={opt.code}>{opt.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Regular, night, split, etc.</p>
                </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">Company</label>
                     <select value={shiftForm.company_id || ''} onChange={e => setShiftForm(f => ({ ...f, company_id: e.target.value ? parseInt(e.target.value) : null, branch_id: null, department_id: null }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]">
                      <option value="">All Companies</option>
                      {companies.map((c: OptionItem) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Company the shift applies to</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">Branch</label>
                    <select value={shiftForm.branch_id || ''} onChange={e => setShiftForm(f => ({ ...f, branch_id: e.target.value ? parseInt(e.target.value) : null }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]">
                      <option value="">All Branches</option>
                      {branches.map((b: OptionItem) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Branch (optional)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1E293B] mb-1">Department</label>
                    <select value={shiftForm.department_id || ''} onChange={e => setShiftForm(f => ({ ...f, department_id: e.target.value ? parseInt(e.target.value) : null }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]">
                      <option value="">All Departments</option>
                      {departments.map((d: OptionItem) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Department (optional)</p>
                  </div>

                
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">Start Time *</label>
                  <TimePicker value={shiftForm.start_time} onChange={(val) => setShiftForm(f => ({ ...f, start_time: val }))} required />
                  <p className="mt-1 text-xs text-gray-400">Shift start time</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">End Time *</label>
                  <TimePicker value={shiftForm.end_time} onChange={(val) => setShiftForm(f => ({ ...f, end_time: val }))} required />
                  <p className="mt-1 text-xs text-gray-400">Shift end time</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">Grace Period (minutes)</label>
                  <input type="number" min={0} max={60} value={shiftForm.grace_minutes} onChange={e => setShiftForm(f => ({ ...f, grace_minutes: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" />
                  <p className="mt-1 text-xs text-gray-400">Allowed late arrival grace (minutes)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1E293B] mb-1">Break Duration (minutes)</label>
                  <input type="number" min={0} value={shiftForm.break_duration} onChange={e => setShiftForm(f => ({ ...f, break_duration: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" />
                  <p className="mt-1 text-xs text-gray-400">Break time in minutes</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-2">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {[{id:'1',label:'Mon'},{id:'2',label:'Tue'},{id:'3',label:'Wed'},{id:'4',label:'Thu'},{id:'5',label:'Fri'},{id:'6',label:'Sat'},{id:'0',label:'Sun'}].map(day => {
                    const selected = shiftForm.working_days.split(',').includes(day.id);
                    return (
                      <button key={day.id} type="button"
                        onClick={() => {
                          const days = shiftForm.working_days ? shiftForm.working_days.split(',').filter(Boolean) : [];
                          const updated = selected ? days.filter(d => d !== day.id) : [...days, day.id];
                          setShiftForm(f => ({ ...f, working_days: updated.sort().join(',') }));
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selected ? 'bg-[var(--primary-blue)] text-white' : 'bg-[var(--hover-bg)] text-[var(--text-tertiary)] hover:bg-[#E2E8F0]'}`}
                      >{day.label}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E293B] mb-1">Description</label>
                <textarea rows={2} value={shiftForm.description} onChange={e => setShiftForm(f => ({ ...f, description: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" placeholder="Optional description..." />
                <p className="mt-1 text-xs text-gray-400">Short description of the shift</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowShiftModal(false); setEditingShift(null); }} className="px-6 py-2.5 text-sm font-medium text-[var(--text-tertiary)] bg-white border border-[var(--border-color)] hover:bg-[var(--background)] rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={createShiftMutation.isPending || updateShiftMutation.isPending} className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--primary-blue)] hover:bg-[#1E40AF] rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60">
                  {(createShiftMutation.isPending || updateShiftMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingShift ? 'Update Shift' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROSTER CONFIG MODAL */}
      <RosterConfigModal
        isOpen={showRosterModal}
        onClose={() => setShowRosterModal(false)}
        employees={employees}
        companies={companies}
        branches={branches}
        departments={departments}
        shifts={shifts}
      />

      {/* Quick Action Modal */}
      {quickActionTarget && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setQuickActionTarget(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Quick Status Action</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Update attendance status for the selected record(s)</p>
                  </div>
                </div>
                <button onClick={() => setQuickActionTarget(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition-colors" title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-600 shadow-sm">
                  <Users className="w-3.5 h-3.5 text-violet-500" />
                  {quickActionTarget.type === 'bulk'
                    ? `${quickActionTarget.records.length} record${quickActionTarget.records.length !== 1 ? 's' : ''}`
                    : '1 record'}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-600 shadow-sm">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  {quickActionTarget.type === 'bulk'
                    ? 'Bulk update'
                    : quickActionTarget.record.employeeName || `EMP-${quickActionTarget.record.employeeId}`}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {/* Tabs */}
              <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setQuickTab('attendance'); setQuickStatus(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${quickTab === 'attendance' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Clock className="w-4 h-4" />
                  Attendance
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${quickTab === 'attendance' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>{statusOpts.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setQuickTab('leave'); setQuickStatus(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${quickTab === 'leave' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <CalendarClock className="w-4 h-4" />
                  Leave
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${quickTab === 'leave' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>{leaveTypeOpts.length}</span>
                </button>
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {quickTab === 'attendance' ? 'Select Attendance Status' : 'Select Leave Type'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                {(quickTab === 'attendance' ? statusOpts : leaveTypeOpts).map((opt: MasterDataOption) => {
                  const code = (opt.code || '').toLowerCase();
                  const meta: Record<string, { chip: string; ring: string; icon: typeof CheckCircle; desc: string }> = {
                    present: { chip: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-500/30 border-emerald-500', icon: CheckCircle, desc: 'Mark employee as present' },
                    absent: { chip: 'bg-red-50 text-red-600', ring: 'ring-red-500/30 border-red-500', icon: XCircle, desc: 'Mark employee as absent' },
                    half_day: { chip: 'bg-amber-50 text-amber-600', ring: 'ring-amber-500/30 border-amber-500', icon: Clock, desc: 'Half-day attendance' },
                    late: { chip: 'bg-orange-50 text-orange-600', ring: 'ring-orange-500/30 border-orange-500', icon: Clock, desc: 'Employee arrived late' },
                    on_leave: { chip: 'bg-blue-50 text-blue-600', ring: 'ring-blue-500/30 border-blue-500', icon: CalendarClock, desc: 'Employee is on leave' },
                    work_from_home: { chip: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-500/30 border-indigo-500', icon: MapPin, desc: 'Working from home' },
                    wfh: { chip: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-500/30 border-indigo-500', icon: MapPin, desc: 'Working from home' },
                    sick_leave: { chip: 'bg-rose-50 text-rose-600', ring: 'ring-rose-500/30 border-rose-500', icon: XCircle, desc: 'On sick leave' },
                    vacation: { chip: 'bg-teal-50 text-teal-600', ring: 'ring-teal-500/30 border-teal-500', icon: CalendarDays, desc: 'On vacation' },
                    personal: { chip: 'bg-blue-50 text-blue-600', ring: 'ring-blue-500/30 border-blue-500', icon: CalendarClock, desc: 'On personal leave' },
                    maternity: { chip: 'bg-pink-50 text-pink-600', ring: 'ring-pink-500/30 border-pink-500', icon: Clock, desc: 'On maternity leave' },
                    paternity: { chip: 'bg-cyan-50 text-cyan-600', ring: 'ring-cyan-500/30 border-cyan-500', icon: Users, desc: 'On paternity leave' },
                  };
                  const m = meta[code] || { ...getAttendanceStatusColor(opt.name || code), icon: CheckCircle2, desc: 'Update attendance status' };
                  const IconComp = m.icon;
                  const isActive = quickStatus === opt.name;
                  return (
                    <button
                      key={opt.code || opt.name}
                      type="button"
                      onClick={() => setQuickStatus(opt.name)}
                      className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-150 ${
                        isActive
                          ? `${m.ring} ring-2 ring-offset-1 bg-white shadow-sm`
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${m.chip}`}>
                        <IconComp className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">{opt.name || opt.label}</span>
                        <span className="block text-xs text-gray-400 truncate">{m.desc}</span>
                      </span>
                      <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isActive ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400 leading-snug">Applying will overwrite the current status of the selected record(s).</p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setQuickActionTarget(null)} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-white transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!quickStatus) return;
                    const records = quickActionTarget.type === 'bulk' ? quickActionTarget.records : [quickActionTarget.record];
                    bulkMarkMutation.mutate({ status: quickStatus, records: records.map(r => ({ employeeId: r.employeeId, date: r.date as string })) });
                    setQuickActionTarget(null);
                  }}
                  disabled={!quickStatus || bulkMarkMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {bulkMarkMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {bulkMarkMutation.isPending ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmActionModal
        isOpen={!!confirmTarget}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) {
            if (confirmTarget.type === 'delete-record') {
              api.delete(`/attendance/${confirmTarget.id}`)
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ['attendance'] });
                  toast.success('Record deleted');
                })
                .catch(() => toast.error('Delete failed'));
            } else if (confirmTarget.type === 'bulk-delete') {
              bulkDeleteMutation.mutate(confirmTarget.records.map(r => ({ employeeId: r.employeeId, date: r.date as string })));
            } else {
              deleteShiftMutation.mutate(confirmTarget.id);
            }
            setConfirmTarget(null);
          }
        }}
        isPending={bulkDeleteMutation.isPending}
        variant={confirmTarget?.type === 'deactivate-shift' ? 'warning' : 'danger'}
        title={
          confirmTarget?.type === 'bulk-delete'
            ? 'Delete Attendance Records'
            : confirmTarget?.type === 'delete-record'
              ? 'Delete Attendance Record'
              : 'Deactivate Shift'
        }
        confirmLabel={confirmTarget?.type === 'deactivate-shift' ? 'Deactivate' : 'Delete'}
        message={
          confirmTarget?.type === 'bulk-delete'
            ? `You are about to delete ${confirmTarget.records.length} attendance record${confirmTarget.records.length !== 1 ? 's' : ''}.`
            : confirmTarget?.type === 'delete-record'
              ? 'You are about to delete this attendance record.'
              : `You are about to deactivate the shift "${confirmTarget?.name ?? ''}".`
        }
        consequence={
          confirmTarget?.type === 'deactivate-shift'
            ? 'The shift will be deactivated and will no longer be available for assignments.'
            : 'The attendance records will be permanently removed and cannot be recovered.'
        }
      />

      <BulkDeleteModal
        isOpen={!!bulkDeleteTarget}
        onClose={() => setBulkDeleteTarget(null)}
        onConfirm={() => {
          if (!bulkDeleteTarget) return;
          bulkDeleteMutation.mutate(bulkDeleteTarget.items.map(r => ({ employeeId: r.employeeId, date: r.date as string })));
          setBulkDeleteTarget(null);
        }}
        count={bulkDeleteTarget?.items.length ?? 0}
        entityType="attendance record"
        consequences={['Attendance records including check-in/out times will be lost', 'Work hours and overtime calculations will be affected']}
        isDeleting={bulkDeleteMutation.isPending}
      />

    </div>
  );
};

export default Attendance;

