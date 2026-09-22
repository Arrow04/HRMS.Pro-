import { useState, useEffect } from 'react';
import {
  Palmtree, Plus, Search, Upload, Download, Calendar, Building2,
  Filter, Edit2, Trash2, X, RotateCcw, TrendingUp, CloudCog, CheckCircle2, Sun, Loader2, Info, Clock, MapPin, Award
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatAppDate } from '../services/appSettingsService';
import { useMasterData } from '../hooks/useMasterData';
import { useAuth } from '../context/AuthContext';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import BulkDeleteModal from '../components/BulkDeleteModal';
import DatePicker from '../components/DatePicker';
import DateRangePicker from '../components/DateRangePicker';
import SearchableSelect from '../components/SearchableSelect';
import StatsCard from '../components/StatsCard';
import PageHero from '../components/PageHero';
import ExportButton from '../components/ExportButton';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useUndoDelete } from '../hooks/useUndoDelete';
import Tooltip from '../components/Tooltip';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import { formTextareaClass } from '../components/FormField';
import type { Holiday as HolidayType, Company, Department, Branch } from '../types';

type SelectOption = { value: string; code?: string; label: string; name?: string };

type HolidayRow = HolidayType & {
  company_id?: number;
  branch_id?: number;
  department_id?: number;
  company?: { id: number; name: string };
  recurringPattern?: string;
  region?: string;
  category?: string;
  durationDays?: number;
  notificationDaysBefore?: number;
  alternativeDate?: string;
  isWorkingDay?: boolean;
};

// Form tabs for Holiday modal
const HOLIDAY_FORM_TABS = [
  { id: 'basic', label: 'Basic Info', icon: Info },
  { id: 'details', label: 'Holiday Details', icon: Calendar },
  { id: 'advanced', label: 'Advanced', icon: Award },
];

const Holidays = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all | upcoming | past | recurring
  const [companyFilter, setCompanyFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayRow | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [formTab, setFormTab] = useState('basic');
  const [isClosing, setIsClosing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | null>(null);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<{ items: HolidayRow[] } | null>(null);
  
  // All backend fields for Holiday model
  const [newHoliday, setNewHoliday] = useState({
    name: '',
    date: '',
    type: 'public',
    description: '',
    organizationId: '',
    companyId: '',
    year: '',
    isRecurring: false,
    recurringPattern: '',
    isPaid: true,
    durationDays: 1,
    location: '',
    region: '',
    category: '',
    notificationDaysBefore: 7,
    isWorkingDay: false,
    alternativeDate: '',
    notes: ''
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Queries
  const { data: holidays = [], isLoading: loadingHolidays, isFetching } = useQuery({
    queryKey: ['holidays'],
    queryFn: async () => {
      try {
        const response = await api.get('/holidays');
        return response.data || [];
      } catch (error) { throw error; }
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => { try { const r = await api.get('/companies'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => { try { const r = await api.get('/branches'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { try { const r = await api.get('/departments'); return r.data || []; } catch { return []; } },
    staleTime: 5 * 60 * 1000,
  });

  const getCompanyName = (id?: number) => companies.find((c: Company) => c.id === id)?.name || '-';
  const getBranchName = (id?: number) => branches.find((b: Branch) => b.id === id)?.name || '-';
  const getDeptName = (id?: number) => departments.find((d: Department) => d.id === id)?.name || '-';

  // Master data for holiday type
  const { data: holidayTypeOptions = [] } = useMasterData('HOLIDAY_TYPE');
  const { data: isPaidHolidayOptions = [] } = useMasterData('IS_PAID_HOLIDAY');
  const { data: isRecurringOptions = [] } = useMasterData('IS_RECURRING');
  const { data: recurringPatternOptions = [] } = useMasterData('RECURRING_PATTERN');
  const { data: isWorkingDayOptions = [] } = useMasterData('IS_WORKING_DAY');

  // Mutations
  const addMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.post('/holidays', payload),
    onSuccess: () => {
      toast.success('Holiday added successfully');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsAddModalOpen(false);
      setNewHoliday({ name: '', date: '', type: 'public', description: '', organizationId: '', companyId: '', year: '', isRecurring: false, recurringPattern: '', isPaid: true, durationDays: 1, location: '', region: '', category: '', notificationDaysBefore: 7, isWorkingDay: false, alternativeDate: '', notes: '' });
      setEditingHoliday(null);
    },
    onError: () => toast.error('Failed to add holiday')
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => api.put(`/holidays/${id}`, payload),
    onSuccess: () => {
      toast.success('Holiday updated successfully');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsAddModalOpen(false);
      setEditingHoliday(null);
      setNewHoliday({
        name: '', date: '', type: 'public', description: '', organizationId: '', companyId: '', year: new Date().getFullYear().toString(),
        isRecurring: false, recurringPattern: '', isPaid: true, durationDays: 1, location: '', region: '', category: '',
        notificationDaysBefore: 7, isWorkingDay: false, alternativeDate: '', notes: ''
      });
    },
    onError: () => toast.error('Failed to update holiday')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/holidays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: () => toast.error('Failed to delete holiday'),
    onSettled: () => setDeleteTarget(null)
  });

  const syncAttendanceMutation = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) =>
      api.post(`/holidays/sync-attendance`, null, { params: { month, year } }),
    onSuccess: (data: { data?: { message?: string; count?: number } }) => {
      toast.success(data.data?.message || 'Holidays synced to attendance');
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: () => toast.error('Failed to sync holidays to attendance'),
  });

  const restoreHoliday = async (h: HolidayRow) => {
    const payload = {
      name: h.name,
      date: h.date,
      type: h.type,
      description: h.description,
      organizationId: h.organizationId,
      companyId: h.company_id ?? h.companyId,
      year: h.year || new Date(h.date).getFullYear().toString(),
      isRecurring: h.isRecurring,
      recurringPattern: h.recurringPattern,
      isPaid: h.isPaid,
      durationDays: h.durationDays ?? 1,
      location: h.location,
      region: h.region,
      category: h.category,
      notificationDaysBefore: h.notificationDaysBefore ?? 7,
      isWorkingDay: h.isWorkingDay,
      alternativeDate: h.alternativeDate,
      notes: h.notes,
    };
    return api.post('/holidays', payload);
  };

  const { deleteWithUndo } = useUndoDelete<HolidayRow>({
    entityName: 'Holiday',
    onDelete: (h) => deleteMutation.mutateAsync(h.id),
    onRestore: restoreHoliday,
    onDeleteDone: () => queryClient.invalidateQueries({ queryKey: ['holidays'] }),
    onRestoreDone: () => queryClient.invalidateQueries({ queryKey: ['holidays'] }),
  });

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
      mutationFn: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const companyId = companyFilter !== 'all' ? companyFilter : 1;
        const currentYear = new Date().getFullYear().toString();
        return api.post(`/holidays/import?companyId=${companyId}&year=${currentYear}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      },
    onSuccess: (data: { data?: { created?: number; updated?: number } }) => {
      toast.success(`Bulk upload completed: ${data.data?.created || 0} created, ${data.data?.updated || 0} updated`);
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setShowBulkUpload(false);
      setUploadFile(null);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(`Bulk upload failed: ${err.response?.data?.message || err.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...newHoliday,
      companyId: newHoliday.companyId === 'all' || !newHoliday.companyId ? undefined : parseInt(newHoliday.companyId),
      organizationId: user?.organizationId || 1
    };
    if (editingHoliday) {
      updateMutation.mutate({ id: editingHoliday.id, payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const handleEdit = (holiday: HolidayRow) => {
    setEditingHoliday(holiday);
    setNewHoliday({
      name: holiday.name || '',
      date: holiday.date || '',
      type: holiday.type || 'public',
      description: holiday.description || '',
      companyId: holiday.companyId?.toString() || '',
      organizationId: holiday.organizationId?.toString() || user?.organizationId?.toString() || '1',
      year: holiday.year?.toString() || new Date().getFullYear().toString(),
      isRecurring: holiday.isRecurring || false,
      recurringPattern: holiday.recurringPattern || '',
      isPaid: holiday.isPaid !== undefined ? holiday.isPaid : true,
      durationDays: holiday.durationDays || 1,
      location: holiday.location || '',
      region: holiday.region || '',
      category: holiday.category || '',
      notificationDaysBefore: holiday.notificationDaysBefore || 7,
      isWorkingDay: holiday.isWorkingDay || false,
      alternativeDate: holiday.alternativeDate || '',
      notes: holiday.notes || ''
    });
    setFormTab('basic');
    setIsClosing(false);
    setIsAddModalOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsAddModalOpen(false);
      setIsClosing(false);
      setNewHoliday({ name: '', date: '', type: 'public', description: '', organizationId: '', companyId: '', year: '', isRecurring: false, recurringPattern: '', isPaid: true, durationDays: 1, location: '', region: '', category: '', notificationDaysBefore: 7, isWorkingDay: false, alternativeDate: '', notes: '' });
      setEditingHoliday(null);
      setFormTab('basic');
    }, 300);
  };

  const handleDelete = (h: HolidayRow) => {
    setDeleteTarget(h);
  };

  const getTypeBadgeClass = (type: string) => {
    const classes: Record<string, string> = {
      public: 'bg-[#EBF5FF] text-[var(--primary-blue)] border border-[#1C64F2]/20',
      company: 'bg-[#F0FDF4] text-[var(--success-green)] border border-[#057A55]/20',
      optional: 'bg-[#FFF7ED] text-[#C2410C] border border-[#C2410C]/20',
    };
    return classes[type] || classes.public;
  };

  const filteredHolidays = holidays.filter((h: HolidayRow) => {
    const searchMatch = !searchTerm || h.name?.toLowerCase().includes(searchTerm.toLowerCase()) || h.type?.toLowerCase().includes(searchTerm.toLowerCase());
    const companyMatch = companyFilter === 'all' || h.company_id?.toString() === companyFilter;
    const branchMatch = branchFilter === 'all' || h.branch_id?.toString() === branchFilter;
    const deptMatch = departmentFilter === 'all' || h.department_id?.toString() === departmentFilter;
    const typeMatch = typeFilter === 'all' || h.type?.toLowerCase() === typeFilter.toLowerCase();

    const hDate = h.date;
    const today = new Date().toISOString().substring(0, 10);
    let tabMatch = true;
    if (activeTab === 'upcoming') tabMatch = !!(hDate && hDate.substring(0, 10) >= today);
    else if (activeTab === 'past') tabMatch = !!(hDate && hDate.substring(0, 10) < today);
    else if (activeTab === 'recurring') tabMatch = !!h.isRecurring;

    const matchStart = !startDate || (hDate && hDate.substring(0, 10) >= startDate);
    const matchEnd = !endDate || (hDate && hDate.substring(0, 10) <= endDate);

    return searchMatch && companyMatch && branchMatch && deptMatch && typeMatch && tabMatch && matchStart && matchEnd;
  });

  const renderHolidayForm = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Holiday Name *</label>
          <input className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.name} onChange={e => setNewHoliday({ ...newHoliday, name: e.target.value })} placeholder="e.g. Christmas" />
          <p className="mt-1 text-xs text-gray-400">Name of the holiday, e.g. Christmas</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Date *</label>
          <DatePicker value={newHoliday.date} onChange={(val) => setNewHoliday({ ...newHoliday, date: val })} required />
          <p className="mt-1 text-xs text-gray-400">Holiday date (dd-mm-yyyy)</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Type</label>
          <select className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.type} onChange={e => setNewHoliday({ ...newHoliday, type: e.target.value })}>
            {holidayTypeOptions.map((opt: SelectOption) => (
              <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">Type: public, company, or optional</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Company (Optional)</label>
          <select className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.companyId} onChange={e => setNewHoliday({ ...newHoliday, companyId: e.target.value })}>
            <option value="">All Companies</option>
            {companies.map((comp: Company) => <option key={comp.id} value={comp.id}>{comp.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">Company this holiday applies to</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Duration (Days)</label>
          <input type="number" className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.durationDays} onChange={e => setNewHoliday({ ...newHoliday, durationDays: parseInt(e.target.value) })} />
          <p className="mt-1 text-xs text-gray-400">Number of days the holiday lasts</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Is Paid Holiday</label>
          <select className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.isPaid ? 'true' : 'false'} onChange={e => setNewHoliday({ ...newHoliday, isPaid: e.target.value === 'true' })}>
            {isPaidHolidayOptions.map((opt: SelectOption) => (
              <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">Whether holiday is paid or unpaid</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Location</label>
          <input className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.location} onChange={e => setNewHoliday({ ...newHoliday, location: e.target.value })} placeholder="e.g. All locations" />
          <p className="mt-1 text-xs text-gray-400">Where the holiday applies</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Region</label>
          <input className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.region} onChange={e => setNewHoliday({ ...newHoliday, region: e.target.value })} placeholder="e.g. North America" />
          <p className="mt-1 text-xs text-gray-400">Region or country for the holiday</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Category</label>
          <input className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.category} onChange={e => setNewHoliday({ ...newHoliday, category: e.target.value })} placeholder="e.g. Religious, National, Cultural" />
          <p className="mt-1 text-xs text-gray-400">Category, e.g. Religious, National, Cultural</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Alternative Date (if falls on weekend)</label>
          <DatePicker value={newHoliday.alternativeDate} onChange={(val) => setNewHoliday({ ...newHoliday, alternativeDate: val })} />
          <p className="mt-1 text-xs text-gray-400">Date if holiday falls on weekend</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Is Recurring</label>
          <select className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.isRecurring ? 'true' : 'false'} onChange={e => setNewHoliday({ ...newHoliday, isRecurring: e.target.value === 'true' })}>
            {isRecurringOptions.map((opt: SelectOption) => (
              <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">Whether holiday repeats every year</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Recurring Pattern</label>
          <select className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.recurringPattern} onChange={e => setNewHoliday({ ...newHoliday, recurringPattern: e.target.value })} disabled={!newHoliday.isRecurring}>
            <option value="">Select pattern</option>
            {recurringPatternOptions.map((opt: SelectOption) => (
              <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">Pattern for the recurring holiday</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Notification Days Before</label>
          <input type="number" className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.notificationDaysBefore} onChange={e => setNewHoliday({ ...newHoliday, notificationDaysBefore: parseInt(e.target.value) })} placeholder="e.g. 7" />
          <p className="mt-1 text-xs text-gray-400">Days before holiday to notify</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Is Working Day</label>
          <select className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1C64F2]" value={newHoliday.isWorkingDay ? 'true' : 'false'} onChange={e => setNewHoliday({ ...newHoliday, isWorkingDay: e.target.value === 'true' })}>
            {isWorkingDayOptions.map((opt: SelectOption) => (
              <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">Whether it is a working day</p>
        </div>
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Description</label>
          <textarea className={formTextareaClass} value={newHoliday.description} onChange={e => setNewHoliday({ ...newHoliday, description: e.target.value })} placeholder="Optional description..." />
          <p className="mt-1 text-xs text-gray-400">Optional details about the holiday</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Notes</label>
          <textarea className={formTextareaClass} value={newHoliday.notes} onChange={e => setNewHoliday({ ...newHoliday, notes: e.target.value })} placeholder="Additional notes..." />
          <p className="mt-1 text-xs text-gray-400">Additional notes about the holiday</p>
        </div>
      </div>
    );
  };

  const statCards = [
    { label: 'Total Holidays', value: holidays.length, icon: Sun, tooltip: 'Total holidays in the system', trend: holidays.length > 0 ? 5 : 0, iconBg: 'bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5', iconColor: 'text-[#D97706]', onClick: () => { setActiveTab('all'); setTypeFilter('all'); } },
    { label: 'Public Holidays', value: holidays.filter((h: HolidayRow) => h.type === 'public').length, icon: Sun, tooltip: 'Number of public holidays', trend: 0, iconBg: 'bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5', iconColor: 'text-[var(--primary-blue)]', onClick: () => { setActiveTab('all'); setTypeFilter('public'); } },
    { label: 'Company Holidays', value: holidays.filter((h: HolidayRow) => h.type === 'company').length, icon: Building2, tooltip: 'Company-specific holidays', trend: 0, iconBg: 'bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5', iconColor: 'text-[#059669]', onClick: () => { setActiveTab('all'); setTypeFilter('company'); } },
    { label: 'This Month', value: holidays.filter((h: HolidayRow) => new Date(h.date).getMonth() === new Date().getMonth()).length, icon: Calendar, tooltip: 'Holidays this month', trend: 2, iconBg: 'bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5', iconColor: 'text-[#7C3AED]', onClick: () => { setActiveTab('upcoming'); setTypeFilter('all'); } },
  ];

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (holidays.length > 0 && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [holidays, hasLoaded]);

  const isInitialHolidayLoading = !hasLoaded && isFetching;
  if (isInitialHolidayLoading) {
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
          title="Holiday Management"
          subtitle="Manage company holidays and celebrations"
          icon={Palmtree}
          accent="amber"
          breadcrumbs={['HRMS.Pro!', 'Holidays']}
          actions={
            <>
              <ExportButton
                rows={filteredHolidays}
                filename="holidays_export"
                label="Export"
              />
              <button
                onClick={() => setShowBulkUpload(true)} title="Upload .csv file"
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              <button
                onClick={() => {
                  setEditingHoliday(null);
                  setNewHoliday({
                    name: '',
                    date: '',
                    type: 'public',
                    description: '',
                    organizationId: '',
                    companyId: '',
                    year: new Date().getFullYear().toString(),
                    isRecurring: false,
                    recurringPattern: '',
                    isPaid: true,
                    durationDays: 1,
                    location: '',
                    region: '',
                    category: '',
                    notificationDaysBefore: 7,
                    isWorkingDay: false,
                    alternativeDate: '',
                    notes: ''
                  });
                  setIsAddModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] rounded-xl font-semibold text-sm shadow-lg shadow-black/20 transition-transform hover:scale-[1.02]"
              >
                <Plus className="w-4 h-4" />
                Add Holiday
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  syncAttendanceMutation.mutate({ month: now.getMonth() + 1, year: now.getFullYear() });
                }}
                disabled={syncAttendanceMutation.isPending}
                title="Create attendance records (Holiday status) for this month's holidays"
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#0D9488] rounded-xl font-semibold text-sm shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] disabled:opacity-50"
              >
                {syncAttendanceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                Sync to Attendance
              </button>
            </>
          }
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <div key={index} className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <StatsCard icon={stat.icon} label={stat.label} value={stat.value} iconBg={stat.iconBg} iconColor={stat.iconColor} tooltip={stat.tooltip} trend={stat.trend} onClick={stat.onClick} />
            </div>
          ))}
        </div>

        {/* TABS - Pill Style */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'All Holidays', icon: Calendar },
              { id: 'upcoming', label: 'Upcoming', icon: TrendingUp },
              { id: 'past', label: 'Past', icon: Clock },
              { id: 'recurring', label: 'Recurring', icon: Sun },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

        {/* HOLIDAYS TABLE */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] overflow-hidden">
          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-[var(--border-color)] bg-white">
            <div className="flex flex-wrap items-center gap-3">
                <SearchableSelect
                  value={companyFilter === 'all' ? 'all' : Number(companyFilter)}
                  onChange={(val) => setCompanyFilter(val.toString())}
                  options={(companies || []).map((c: Company) => ({ id: c.id, name: c.name }))}
                  placeholder="All Companies"
                  allOption="All Companies"
                  className="w-40"
                />
                <SearchableSelect
                  value={branchFilter === 'all' ? 'all' : Number(branchFilter)}
                  onChange={(val) => setBranchFilter(val.toString())}
                  options={(branches || []).map((b: Branch) => ({ id: b.id, name: b.name }))}
                  placeholder="All Branches"
                  allOption="All Branches"
                  className="w-40"
                />
                <SearchableSelect
                  value={departmentFilter === 'all' ? 'all' : Number(departmentFilter)}
                  onChange={(val) => setDepartmentFilter(val.toString())}
                  options={(departments || []).map((d: Department) => ({ id: d.id, name: d.name }))}
                  placeholder="All Departments"
                  allOption="All Departments"
                  className="w-40"
                />
                <SearchableSelect
                  value={typeFilter === 'all' ? 'all' : typeFilter}
                  onChange={(val) => setTypeFilter(val.toString())}
                  options={(holidayTypeOptions || []).map((t: SelectOption) => ({ id: t.code || t.value || '', name: t.name || t.label || '' }))}
                  placeholder="All Types"
                  allOption="All Types"
                  className="w-40"
                />

                <DateRangePicker 
                  startDate={startDate} 
                  endDate={endDate} 
                  onDateChange={(start, end) => { setStartDate(start); setEndDate(end); }} 
                  placeholder="Select Date"
                />
                
                {Boolean(searchTerm || companyFilter !== 'all' || branchFilter !== 'all' || departmentFilter !== 'all' || typeFilter !== 'all' || startDate || endDate) && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setCompanyFilter('all');
                      setBranchFilter('all');
                      setDepartmentFilter('all');
                      setTypeFilter('all');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="p-2.5 text-[#C81E1E] bg-[#C81E1E]/10 hover:bg-[#C81E1E]/20 rounded-lg transition-colors" title="Clear Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
            </div>
          </div>
          <div className="bg-white overflow-hidden">
            <div className="overflow-x-auto">
            {loadingHolidays ? (
            <div className="animate-page-enter"><PageSkeleton /></div>
          ) : (
            <DataTable
              data={filteredHolidays}
              rowKey={(h: HolidayRow) => h.id}
              searchable
              searchKeys={(h: HolidayRow) => `${h.name} ${h.type} ${h.description || ''} ${getCompanyName(h.company_id)} ${getBranchName(h.branch_id)} ${getDeptName(h.department_id)}`}
              searchPlaceholder="Search holidays..."
              emptyMessage="No holidays found matching your filters" persistKey="holidays"
              logEntityType="holiday"
              logFor={(h: HolidayRow) => ({ id: h.id, label: h.name })}
              onEdit={(h) => handleEdit(h)}
              onDelete={(items) => setBulkDeleteTarget({ items: items as HolidayRow[] })}
              columns={[
                {
                  key: 'name', header: 'Holiday', sortable: true,
                  render: (h: HolidayRow) => (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <Palmtree className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-[#0F172A] text-sm">{h.name}</div>
                      </div>
                    </div>
                  ),
                  sortValue: (h: HolidayRow) => h.name,
                },
                {
                  key: 'date', header: 'Date', sortable: true,
                  render: (h: HolidayRow) => (
                    <div className="flex items-center gap-1.5 text-sm text-[#64748B]">
                      <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                      {formatAppDate(h.date)}
                    </div>
                  ),
                  sortValue: (h: HolidayRow) => h.date as string,
                },
                {
                  key: 'durationDays', header: 'Duration', sortable: true,
                  render: (h: HolidayRow) => (
                    <span className="text-sm font-medium text-[#0F172A]">{h.durationDays || 1} day{(h.durationDays || 1) !== 1 ? 's' : ''}</span>
                  ),
                  sortValue: (h: HolidayRow) => h.durationDays || 1,
                },
                {
                  key: 'type', header: 'Type',
                  render: (h: HolidayRow) => (
                    <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${getTypeBadgeClass(h.type)}`}>
                      {h.type}
                    </span>
                  ),
                },
                { key: 'description', header: 'Description', render: (h: HolidayRow) => <span className="text-sm text-[#64748B]">{h.description || '-'}</span> },
                { key: 'companyName', header: 'Company', sortable: true, render: (h: HolidayRow) => <span className="text-sm text-[#64748B]">{getCompanyName(h.company_id)}</span>, sortValue: (h: HolidayRow) => getCompanyName(h.company_id) },
                { key: 'branchName', header: 'Branch', sortable: true, render: (h: HolidayRow) => <span className="text-sm text-[#64748B]">{getBranchName(h.branch_id)}</span>, sortValue: (h: HolidayRow) => getBranchName(h.branch_id) },
                { key: 'departmentName', header: 'Department', sortable: true, render: (h: HolidayRow) => <span className="text-sm text-[#64748B]">{getDeptName(h.department_id)}</span>, sortValue: (h: HolidayRow) => getDeptName(h.department_id) },
              ]}
              actions={(h: HolidayRow) => (
                <div className="flex items-center justify-end gap-1.5">
                  <Tooltip id={`btn-edit-holiday-${h.id}`} content="Edit">
                    <button onClick={() => handleEdit(h)} className="p-2 text-[#1C64F2] hover:bg-[#1C64F2]/10 rounded-lg transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  </Tooltip>
                  <Tooltip id={`btn-delete-holiday-${h.id}`} content="Delete">
                    <button onClick={() => handleDelete(h)} className="p-2 text-[#DC2626] hover:bg-[#DC2626]/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </Tooltip>
                </div>
              )}
            />
          )}
          </div>
          </div>
        </div>
      </div>

      {/* Full Page Drawer Modal */}
      {isAddModalOpen && (
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
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#7C3AEDbb] flex items-center justify-center text-white shadow-sm">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#0F172A] leading-tight">
                      {editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      {editingHoliday ? 'Update holiday details below' : 'Fill in the holiday details below'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={addMutation.isPending || updateMutation.isPending}
                    className="px-5 py-2.5 bg-[var(--primary-blue)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 shadow-md shadow-black/10 flex items-center gap-2"
                  >
                    {(addMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {(addMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingHoliday ? 'Update' : 'Create')}
                  </button>
                  <button
                    onClick={handleCloseDrawer}
                    className="p-2 rounded-lg text-[#64748B] hover:bg-gray-100 hover:text-[#C81E1E] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Help Text */}
              <div className="px-6 py-2.5 bg-[#F8FAFC] border-b border-[var(--border-color)]">
                <p className="text-[11px] text-[#B45309]">
                  <Info className="w-3.5 h-3.5 inline mr-1" />
                  Fill in the holiday details below and click Create/Update to save.
                </p>
              </div>

              {/* Form Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <form id="holidayForm" onSubmit={handleSubmit} className="space-y-4">
                  {renderHolidayForm()}
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      <Modal
        isOpen={showBulkUpload}
        onClose={() => { setShowBulkUpload(false); setUploadFile(null); }}
        title="Bulk Upload Holidays"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Instructions:</strong>
              <br />1. Download the template first
              <br />2. Fill in your data in the CSV file
              <br />3. Upload the filled CSV file
              <br />4. Existing items will be updated, new items will be created
              <br />
              <strong>Required columns:</strong> name, date, type, description
            </p>
          </div>
          <button
            onClick={() => {
              const csv = 'name,date,type,description\nNew Year,2026-01-01,public,New Year Holiday\n';
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'holiday_template.csv';
              a.click(); URL.revokeObjectURL(url);
            }}
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
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowBulkUpload(false); setUploadFile(null); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => uploadFile && bulkUploadMutation.mutate(uploadFile)}
              disabled={!uploadFile || bulkUploadMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {bulkUploadMutation.isPending ? (
                null
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
                onConfirm={() => deleteTarget && deleteWithUndo(deleteTarget)}
                itemName={deleteTarget?.name || 'this holiday'}
        isDeleting={deleteMutation.isPending}
      />

      {/* Bulk Delete Holidays Modal */}
      <BulkDeleteModal
        isOpen={!!bulkDeleteTarget}
        onClose={() => setBulkDeleteTarget(null)}
        onConfirm={() => {
          if (!bulkDeleteTarget) return;
          bulkDeleteTarget.items.forEach((h) => deleteWithUndo(h));
          setBulkDeleteTarget(null);
        }}
        count={bulkDeleteTarget?.items.length ?? 0}
        entityType="holiday"
        consequences={['Holiday records will be removed from all employee calendars']}
      />
    </div>
  );
};

export default Holidays;


