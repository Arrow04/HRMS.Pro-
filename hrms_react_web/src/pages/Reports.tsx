import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard, Brain, Activity, Clock, Download, FileText, Users, Calendar,
  TrendingUp, AlertTriangle, CheckCircle, Info, X, ChevronDown, RefreshCw,
  Settings, Filter, FileSpreadsheet, FileCode, FileArchive, Mail, Bell,
  MapPin, Clock3, UserCheck, UserX, Coins, Building2, MoreVertical,
  Play, Pause, Trash2, Edit2, Plus, Search, ChevronRight, Wifi, WifiOff,
  Loader2, CheckCircle2, XCircle, AlertCircle, ArrowDownRight, Building,
  BarChart3, FileBarChart, PieChart, Star, History
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler, BarElement } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import api from '../services/api';
import toast from 'react-hot-toast';
import { getCurrencySymbol, formatCurrency, getAppCurrency } from '../services/currencyService';
import { useMasterData } from '../hooks/useMasterData';
import DatePicker from '../components/DatePicker';
import TimePicker from '../components/TimePicker';
import AiInsightsPanel from '../components/AiInsightsPanel';
import PageHero from '../components/PageHero';
import DataTable from '../components/DataTable';
import StatsCard from '../components/StatsCard';
import EmptyState from '../components/EmptyState';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import type { Employee, Attendance, Payroll, LeaveApplication, Expense, Holiday, Department, Company } from '../types';


ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler, BarElement);

// =============================================================================
// TYPES
// =============================================================================

interface ReportInfo {
  name: string;
  desc: string;
  icon: React.ElementType;
}

interface ScheduleEntry {
  id: string;
  name: string;
  frequency: string;
  recipients?: string[];
  format?: string | string[];
  enabled: boolean;
  nextRun?: string;
}

interface ActivityLogEntry {
  id: string | number;
  action?: string;
  entity_name?: string;
  user_name?: string;
  module?: string;
  created_at?: string;
  user_id?: string | number;
  entity_type?: string;
  entity_id?: string | number;
  ip_address?: string;
  user_agent?: string;
  device_info?: string;
}

interface MasterDataOption {
  value?: string;
  code?: string;
  label?: string;
  name?: string;
}

interface TrendDataPoint {
  label: string;
  attendance?: number;
  payroll?: number;
  approved?: number;
  pending?: number;
  rejected?: number;
  expenses?: number;
  performance?: number;
  hired?: number;
}

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'teal';
  onClick?: () => void;
}

interface AlertCardProps {
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  onDismiss?: () => void;
  onAction?: () => void;
  actionLabel?: string;
}

// =============================================================================
// COLOR CONSTANTS
// =============================================================================

const COLORS = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-500/20', icon: 'text-blue-600', gradient: 'bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-blue-300/5' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-500/20', icon: 'text-emerald-600', gradient: 'bg-gradient-to-br from-emerald-500/20 via-emerald-400/10 to-emerald-300/5' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-500/20', icon: 'text-orange-600', gradient: 'bg-gradient-to-br from-orange-500/20 via-orange-400/10 to-orange-300/5' },
  purple: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-500/20', icon: 'text-violet-600', gradient: 'bg-gradient-to-br from-violet-500/20 via-violet-400/10 to-violet-300/5' },
  red: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-500/20', icon: 'text-rose-600', gradient: 'bg-gradient-to-br from-rose-500/20 via-rose-400/10 to-rose-300/5' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-500/20', icon: 'text-teal-600', gradient: 'bg-gradient-to-br from-teal-500/20 via-teal-400/10 to-teal-300/5' },
};

// =============================================================================
// COMPONENTS
// =============================================================================

const KPICard = ({ label, value, trend, icon: Icon, color, onClick }: KPICardProps) => {
  const c = COLORS[color];
  return (
    <div onClick={onClick} className={`group relative overflow-hidden rounded-2xl p-5 ${c.gradient} hover:shadow-xl hover:scale-[1.02] transition-all duration-300 border border-white/20 cursor-pointer`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-50" />
      <div className="relative flex items-start justify-between">
        <div className={`w-12 h-12 rounded-xl bg-white shadow-lg flex items-center justify-center ${c.icon}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-white/60 backdrop-blur-sm text-emerald-600">{trend}</span>}
      </div>
      <div className="relative mt-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-[28px] font-bold text-[var(--text-primary)] leading-tight tracking-tight mt-1">{value}</p>
      </div>
    </div>
  );
};

const AlertCard = ({ type, title, message, onDismiss, onAction, actionLabel }: AlertCardProps) => {
  const styles = {
    danger: { bg: 'bg-[#FEF2F2]', border: 'border-[#C81E1E]/20', icon: AlertTriangle, iconColor: 'text-[var(--danger-red)]' },
    warning: { bg: 'bg-[#FEFCE8]', border: 'border-[#A16207]/20', icon: AlertCircle, iconColor: 'text-[#A16207]' },
    info: { bg: 'bg-[#EBF5FF]', border: 'border-[#1C64F2]/20', icon: Info, iconColor: 'text-[var(--primary-blue)]' },
    success: { bg: 'bg-[#F0FDF4]', border: 'border-[#057A55]/20', icon: CheckCircle, iconColor: 'text-[var(--success-green)]' },
  }[type];
  const Icon = styles.icon;
  
  return (
    <div className={`rounded-xl p-4 border ${styles.bg} ${styles.border} flex items-start gap-3`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.iconColor}`} />
      <div className="flex-1">
        <p className="font-medium text-[var(--text-primary)] text-sm">{title}</p>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">{message}</p>
        {actionLabel && (
          <button onClick={onAction} className="mt-2 text-sm font-medium text-[var(--primary-blue)] hover:underline">{actionLabel}</button>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="p-1 hover:bg-black/5 rounded transition-colors"><X className="w-4 h-4 text-[var(--text-tertiary)]" /></button>
      )}
    </div>
  );
};

const StatusPill = ({ status }: { status: 'Ready' | 'Review' | 'Scheduled' | 'Generating' | 'Pending' | 'Active' | 'Paused' | 'Completed' }) => {
  const styles = {
    Ready: 'bg-[#F0FDF4] text-[var(--success-green)] border-[#057A55]/20',
    Review: 'bg-[#FEFCE8] text-[#A16207] border-[#A16207]/20',
    Scheduled: 'bg-[#EBF5FF] text-[var(--primary-blue)] border-[#1C64F2]/20',
    Generating: 'bg-[#F3E8FF] text-[#7E22CE] border-[#7E22CE]/20',
    Pending: 'bg-[var(--background)] text-[var(--text-tertiary)] border-[var(--border-color)]',
    Active: 'bg-[#F0FDF4] text-[var(--success-green)] border-[#057A55]/20',
    Paused: 'bg-[#FEF2F2] text-[var(--danger-red)] border-[#C81E1E]/20',
    Completed: 'bg-[#F0FDF4] text-[var(--success-green)] border-[#057A55]/20',
  }[status];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles} flex items-center gap-1`}>
      {status === 'Generating' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status}
    </span>
  );
};

const ExportButtons = ({ onCSV, onPDF, onExcel, size = 'sm' }: { onCSV: () => void; onPDF: () => void; onExcel?: () => void; size?: 'sm' | 'md' }) => {
  const btnClass = size === 'sm' 
    ? 'p-1.5 hover:bg-[var(--background)] rounded-lg transition-colors' 
    : 'px-3 py-1.5 text-sm font-medium hover:bg-[var(--background)] rounded-lg transition-colors flex items-center gap-1';
  return (
    <div className="flex items-center gap-1">
      <button onClick={onCSV} className={`${btnClass} text-[var(--success-green)]`} title="Export CSV">
        {size === 'md' ? <><FileSpreadsheet className="w-4 h-4" /> CSV</> : <FileSpreadsheet className="w-4 h-4" />}
      </button>
      {onExcel && (
        <button onClick={onExcel} className={`${btnClass} text-[var(--primary-blue)]`} title="Export Excel">
          {size === 'md' ? <><FileCode className="w-4 h-4" /> Excel</> : <FileCode className="w-4 h-4" />}
        </button>
      )}
      <button onClick={onPDF} className={`${btnClass} text-[var(--danger-red)]`} title="Export PDF">
        {size === 'md' ? <><FileText className="w-4 h-4" /> PDF</> : <FileText className="w-4 h-4" />}
      </button>
    </div>
  );
};

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-[var(--primary-blue)]' : 'bg-[#E2E8F0]'}`}
  >
    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

// =============================================================================
// CHART CONFIGS
// =============================================================================

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0F172A', padding: 12, cornerRadius: 8 } },
  scales: { x: { grid: { display: false }, ticks: { color: '#64748B', font: { size: 11 } } }, y: { grid: { color: '#E2E8F0' }, ticks: { color: '#64748B', font: { size: 11 } } } },
  elements: { line: { tension: 0.4 }, point: { radius: 4, hoverRadius: 6 } },
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0F172A', padding: 12, cornerRadius: 8 } },
  cutout: '70%',
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================


// Helper function to parse User Agent
const parseUserAgent = (ua: string | undefined) => {
  if (!ua) return 'Unknown Device';
  
  let os = 'Unknown OS';
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.2')) os = 'Windows 8';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([0-9_]+)/);
    os = match ? 'macOS ' + match[1].replace(/_/g, '.') : 'macOS';
  } else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  let browser = 'Unknown Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera';

  return `${os} — ${browser}`;
};

const Reports = () => {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('export-hub');
  const [selectedLogModule, setSelectedLogModule] = useState('All');
  const [lastSynced, setLastSynced] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [exportDateRange, setExportDateRange] = useState({ start: '', end: '' });
  const [exportFormat, setExportFormat] = useState('all');
  const [currency, setCurrency] = useState(getAppCurrency());
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showLogExportModal, setShowLogExportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportInfo | null>(null);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  const { data: modulesOptions = [] } = useMasterData('MODULES');
  const { data: auditModuleOptions = [] } = useMasterData('AUDIT_MODULE');
  const { data: frequencyOptions = [] } = useMasterData('REPORT_FREQUENCY');
  const { data: dayOptions = [] } = useMasterData('DAY_OF_WEEK');
  const { data: scheduleStatusOptions = [] } = useMasterData('SCHEDULE_STATUS');

  // Pay day is governed by the PAY_DAY master category.
  const { data: payDayOptions = [] } = useMasterData('PAY_DAY');
    
  const [showAiInsights, setShowAiInsights] = useState(false);
    
  const [searchQuery, setSearchQuery] = useState('');
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [showReportDropdown, setShowReportDropdown] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    report: '',
    frequency: 'daily',
    runTime: '',
    dayOfWeek: 'Monday',
    dayOfMonth: '1st',
    email: '',
    format: ['PDF'],
    subject: 'Scheduled Report',
    includeBody: false,
    status: 'Active'
  });
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setMounted(true);
    // Set currency to INR
    setCurrency('INR');
  }, []);

  const currencySymbol = getCurrencySymbol(currency);

  // Auto-refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [queryClient]);

  // =============================================================================
  // DATA QUERIES
  // =============================================================================

  const { data: overviewData } = useQuery({
    queryKey: ['reports-overview'],
    queryFn: async () => {
      try {
        const response = await api.get(`/reports/overview/timeseries?year=${new Date().getFullYear()}`);
        return response.data;
      } catch (error) { throw error; }
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: liveData } = useQuery({
    queryKey: ['reports-live'],
    queryFn: async () => {
      try {
        const response = await api.get('/reports/live');
        return response.data;
      } catch (error) { throw error; }
    },
    refetchInterval: 60 * 1000,
  });

  const { data: scheduledReports } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: async () => {
      try {
        const response = await api.get('/reports/schedules');
        return response.data;
      } catch (error) { throw error; }
    },
  });

  const exportLogs = (format: 'csv' | 'excel' | 'pdf') => {
    if (!executionLogs || executionLogs.length === 0) {
      toast.error('No logs to export');
      return;
    }
    
    const filteredLogs = executionLogs.filter((log: ActivityLogEntry) => {
      const matchesSearch = log.action?.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
        log.entity_name?.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
        log.user_name?.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
        log.module?.toLowerCase().includes(scheduleSearchQuery.toLowerCase());
        
      let matchesDate = true;
      if (exportDateRange.start && exportDateRange.end && log.created_at) {
        const logDate = new Date(log.created_at);
        const start = new Date(exportDateRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(exportDateRange.end);
        end.setHours(23, 59, 59, 999);
        matchesDate = logDate >= start && logDate <= end;
      }
      return matchesSearch && matchesDate;
    });

    if (filteredLogs.length === 0) {
      toast.error('No logs match the selected date range and search criteria');
      return;
    }
const exportData = filteredLogs.map((log: ActivityLogEntry) => ({
      'Date/Time': log.created_at ? new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A',
      'User': log.user_name,
      'Module': log.module,
      'Action': log.action,
      'Entity Type': log.entity_type,
      'Entity Name': log.entity_name || `ID: ${log.entity_id}`,
      'IP Address': log.ip_address || 'N/A',
      'Device/User Agent': parseUserAgent(log.user_agent) + ` (${log.user_agent})`
    }));

    if (format === 'csv') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Execution_Logs_${selectedLogModule}.csv`;
      link.click();
    } else if (format === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');
      XLSX.writeFile(workbook, `Execution_Logs_${selectedLogModule}.xlsx`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text(`Execution Logs - ${selectedLogModule} Module`, 14, 15);
      autoTable(doc, {
        head: [['Date', 'User', 'Module/Action', 'Entity', 'IP Address']],
        body: filteredLogs.map((log: ActivityLogEntry) => [
          log.created_at ? new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A',
          log.user_name,
          `${log.module} / ${log.action}`,
          log.entity_name || `ID: ${log.entity_id}`,
          log.ip_address || 'N/A'
        ]),
        startY: 20,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [28, 100, 242] }
      });
      doc.save(`Execution_Logs_${selectedLogModule}.pdf`);
    }
  };

  const { data: executionLogs } = useQuery({
    queryKey: ['activity-logs', selectedLogModule],
    queryFn: async () => {
      try {
        const url = selectedLogModule === 'All' 
          ? '/api/activity-logs' 
          : `/api/activity-logs?module=${selectedLogModule}`;
        const response = await api.get(url);
        return response.data;
      } catch (error) { throw error; }
    },
  });

  const { data: exportHistory = [] } = useQuery({
    queryKey: ['reports-export-history'],
    queryFn: async () => {
      try {
        const response = await api.get('/reports/export-history');
        return response.data || [];
      } catch { return []; }
    },
  });

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      try {
        const response = await api.get('/companies');
        const data = response.data || [];
        return data.filter((item: Company & { is_active?: boolean }) => item.status !== 'inactive' && item.is_active !== false);
      } catch (error) { throw error; }
    },
  });

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleRefresh = () => {
    setIsSyncing(true);
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reports-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-live'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-export-history'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
    ])
      .then(() => { setLastSynced(new Date()); toast.success('Reports refreshed'); })
      .catch(() => toast.error('Failed to refresh reports'))
      .finally(() => setIsSyncing(false));
  };

  const handleGenerateAll = () => {
    setGeneratingAll(true);
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reports-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-live'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-export-history'] }),
    ])
      .then(() => { setLastSynced(new Date()); toast.success('All reports refreshed'); })
      .catch(() => toast.error('Failed to refresh reports'))
      .finally(() => setGeneratingAll(false));
  };

  const handleExportLiveReport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const params: Record<string, unknown> = { format };
      
      const response = await api.get('/reports/live-export', { 
        params,
        responseType: 'blob'
      });
      
      const ext = format === 'pdf' ? 'pdf' : 'csv';
      const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `live_report_${new Date().toISOString().split('T')[0]}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      toast.success(`${format.toUpperCase()} report exported successfully`);
    } catch (error) {
      toast.error(`Failed to export ${format} report`);
    }
  };

  const handleExportReport = async (reportId: string, format: 'csv' | 'excel' | 'pdf') => {
    try {
      const response = await api.get(`/reports/${reportId}/export`, { 
        params: { format },
        responseType: 'blob'
      });
      
      const ext = format === 'pdf' ? 'pdf' : 'csv';
      const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${reportId}_${new Date().toISOString().split('T')[0]}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      toast.success(`${format.toUpperCase()} report exported successfully`);
    } catch (error) {
      toast.error(`Failed to export ${format} report`);
    }
  };

  const handleExportHubReport = async (reportName: string, format: 'csv' | 'excel' | 'pdf') => {
    try {
      const params: Record<string, unknown> = { 
        report: reportName,
        format: format === 'excel' ? 'csv' : format
      };
      
      const response = await api.get('/reports/export-hub', { 
        params,
        responseType: 'blob'
      });
      
      const ext = format === 'pdf' ? 'pdf' : 'csv';
      const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      toast.success(`${format.toUpperCase()} report exported successfully`);
    } catch (error) {
      toast.error(`Failed to export ${format} report`);
    }
  };

  // Export handlers for different report types
  const handleExportEmployeeReport = async () => {
    try {
      const response = await api.get('/reports/employees', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'employee_report.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Employee report exported successfully');
    } catch (error) {
      toast.error('Failed to export employee report');
    }
  };

  const handleExportAttendanceReport = async () => {
    try {
      const params: Record<string, unknown> = { month: reportMonth, year: reportYear };
      const response = await api.get('/reports/attendance', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_report_${reportMonth}_${reportYear}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Attendance report exported successfully');
    } catch (error) {
      toast.error('Failed to export attendance report');
    }
  };

  const handleExportPayrollReport = async () => {
    try {
      const params: Record<string, unknown> = { month: reportMonth, year: reportYear };
      const response = await api.get('/reports/payroll', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payroll_report_${reportMonth}_${reportYear}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Payroll report exported successfully');
    } catch (error) {
      toast.error('Failed to export payroll report');
    }
  };

  const handleExportLeaveReport = async () => {
    try {
      const params: Record<string, unknown> = { month: reportMonth, year: reportYear };
      const response = await api.get('/reports/leaves', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leave_report_${reportMonth}_${reportYear}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Leave report exported successfully');
    } catch (error) {
      toast.error('Failed to export leave report');
    }
  };

  const handleExportExpenseReport = async () => {
    try {
      const params: Record<string, unknown> = { month: reportMonth, year: reportYear };
      const response = await api.get('/reports/expenses', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `expense_report_${reportMonth}_${reportYear}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Expense report exported successfully');
    } catch (error) {
      toast.error('Failed to export expense report');
    }
  };

  const handleExportHolidayReport = async () => {
    try {
      const response = await api.get('/reports/holidays', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'holiday_report.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Holiday report exported successfully');
    } catch (error) {
      toast.error('Failed to export holiday report');
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let response;
      if (editingScheduleId) {
        // Update existing schedule
        response = await api.put(`/reports/schedules/${editingScheduleId}`, scheduleForm);
        toast.success('Schedule updated successfully');
      } else {
        // Create new schedule
        response = await api.post('/reports/schedule', scheduleForm);
        toast.success('Schedule created successfully');
      }
      setShowCreateSchedule(false);
      setEditingScheduleId(null);
      setScheduleForm({
        report: '',
        frequency: 'daily',
        runTime: '',
        dayOfWeek: 'Monday',
        dayOfMonth: '1st',
        email: '',
        format: ['PDF'],
        subject: 'Scheduled Report',
        includeBody: false,
        status: 'Active'
      });
      setReportSearchQuery('');
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
    } catch (error) {
      // Error logged
      toast.error('Failed to save schedule');
    }
  };

  const handleEditSchedule = (report: ScheduleEntry) => {
    setEditingScheduleId(report.id);
    setScheduleForm({
      report: report.name,
      frequency: report.frequency,
      runTime: '',
      dayOfWeek: 'Monday',
      dayOfMonth: '1st',
      email: report.recipients?.[0] || '',
      format: Array.isArray(report.format) ? report.format : [report.format].filter((f): f is string => f !== undefined),
      subject: 'Scheduled Report',
      includeBody: false,
      status: report.enabled ? 'Active' : 'Inactive'
    });
    setReportSearchQuery(report.name);
    setShowCreateSchedule(true);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await api.delete(`/reports/schedules/${scheduleId}`);
      toast.success('Schedule deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
    } catch (error) {
      // Error logged
      toast.error('Failed to delete schedule');
    }
  };

  const handleRunSchedule = async (scheduleId: string) => {
    try {
      const response = await api.post(`/reports/schedules/${scheduleId}/run`);
      toast.success(`Schedule "${response.data.report}" triggered successfully`);
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
    } catch (error) {
      // Error logged
      toast.error('Failed to run schedule');
    }
  };

  const handleToggleSchedule = async (scheduleId: string, currentStatus: boolean) => {
    try {
      const response = await api.patch(`/reports/schedules/${scheduleId}/toggle`);
      toast.success(`Schedule ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
    } catch (error: unknown) {
      // Error logged
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(`Failed to toggle schedule: ${err.response?.data?.detail || err.message}`);
    }
  };

  const formatSyncTime = (date: Date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours.toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    return `at ${hoursStr}:${minutes}:${seconds} ${ampm} on ${day}-${month}-${year}`;
  };

  // =============================================================================
  // CHART DATA
  // =============================================================================

  const lineChartData = {
    labels: overviewData?.attendanceTrendData?.map((d: TrendDataPoint) => d.label) || [],
    datasets: [{
      label: 'Attendance %',
      data: overviewData?.attendanceTrendData?.map((d: TrendDataPoint) => d.attendance) || [],
      borderColor: '#1C64F2',
      backgroundColor: 'rgba(28, 100, 242, 0.1)',
      fill: true,
      pointBackgroundColor: '#1C64F2',
    }],
  };

  const overtimeTrendsData = {
    labels: overviewData?.payrollTrendData?.map((d: TrendDataPoint) => d.label) || [],
    datasets: [{
      label: 'Payroll / Overtime (Value)',
      data: overviewData?.payrollTrendData?.map((d: TrendDataPoint) => d.payroll) || [],
      borderColor: '#8B5CF6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      fill: true,
      pointBackgroundColor: '#8B5CF6',
    }],
  };

  const leaveBalanceData = {
    labels: ['Approved', 'Pending', 'Rejected'],
    datasets: [{
      label: 'Leave Status',
      data: overviewData?.leaveTrendData 
        ? [
            overviewData.leaveTrendData.reduce((acc: number, curr: TrendDataPoint) => acc + (curr.approved || 0), 0),
            overviewData.leaveTrendData.reduce((acc: number, curr: TrendDataPoint) => acc + (curr.pending || 0), 0),
            overviewData.leaveTrendData.reduce((acc: number, curr: TrendDataPoint) => acc + (curr.rejected || 0), 0)
          ]
        : [],
      backgroundColor: ['#1C64F2', '#F59E0B', '#EF4444'],
      borderWidth: 0,
    }],
  };

  const expenseTrendsData = {
    labels: overviewData?.expensesTrendData?.map((d: TrendDataPoint) => d.label) || [],
    datasets: [{
      label: 'Expenses',
      data: overviewData?.expensesTrendData?.map((d: TrendDataPoint) => d.expenses) || [],
      borderColor: '#EF4444',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      fill: true,
      pointBackgroundColor: '#EF4444',
    }],
  };

  const performanceRatingData = {
    labels: overviewData?.performanceTrendData?.map((d: TrendDataPoint) => d.label) || [],
    datasets: [{
      data: overviewData?.performanceTrendData?.map((d: TrendDataPoint) => d.performance) || [],
      backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F43F5E', '#84CC16', '#06B6D4', '#6366F1', '#D946EF', '#EAB308'],
      borderWidth: 0,
    }],
  };

  const recruitmentTrendsData = {
    labels: overviewData?.recruitmentTrendData?.map((d: TrendDataPoint) => d.label) || [],
    datasets: [{
      label: 'New Hires',
      data: overviewData?.recruitmentTrendData?.map((d: TrendDataPoint) => d.hired) || [],
      borderColor: '#0D9488',
      backgroundColor: 'rgba(13, 148, 136, 0.1)',
      fill: true,
      pointBackgroundColor: '#0D9488',
    }],
  };

  // =============================================================================
  // SECTIONS CONFIG
  // =============================================================================

  const SECTIONS = [
    { id: 'export-hub', label: 'Export Hub', icon: Download },
    { id: 'scheduler', label: 'Schedule Report', icon: Clock },
    { id: 'report-log', label: 'Execution Logs', icon: History },
    { id: 'ai-insights', label: 'AI Insights', icon: Brain },
  ];

  if (!mounted) {
    return <PageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] animate-page-enter">
      {/* Header Section */}
      <div className="w-full mx-auto space-y-6">
        <PageHero
          title="Reports & Analytics"
          subtitle="View and export comprehensive reports for your organization"
          icon={FileBarChart}
          accent="indigo"
          breadcrumbs={['HRMS.Pro!', 'Reports']}
          actions={
            <>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isSyncing ? 'bg-white/10 text-amber-100 border border-amber-200/30' : 'bg-white/10 text-emerald-100 border border-emerald-200/30'}`}>
                {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isSyncing ? 'Syncing...' : `Last sync: ${formatSyncTime(lastSynced)}`}
              </div>
              <button onClick={handleRefresh} disabled={isSyncing} className="flex items-center gap-2 px-4 py-2.5 bg-white text-[var(--primary-blue)] text-sm font-semibold rounded-xl shadow-lg shadow-black/20 transition-transform hover:scale-[1.02] disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard 
            icon={FileBarChart} 
            label="Total Reports" 
            value={liveData?.reports?.length || 0} 
            trend={12} 
            iconBg="bg-gradient-to-br from-[#1C64F2]/20 via-[#3B82F6]/10 to-[#60A5FA]/5" 
            iconColor="text-[var(--primary-blue)]" 
            onClick={() => setActiveSection('export-hub')}
          />
          <StatsCard 
            icon={Activity} 
            label="Active Schedule" 
            value={scheduledReports?.filter((r: ScheduleEntry) => r.enabled !== false).length || 0} 
            trend={8} 
            iconBg="bg-gradient-to-br from-[#10B981]/20 via-[#34D399]/10 to-[#6EE7B7]/5" 
            iconColor="text-[#059669]" 
            onClick={() => setActiveSection('scheduler')}
          />
          <StatsCard 
            icon={Clock} 
            label="Inactive Schedule" 
            value={scheduledReports?.filter((r: ScheduleEntry) => r.enabled === false).length || 0} 
            trend={-5} 
            iconBg="bg-gradient-to-br from-[#8B5CF6]/20 via-[#A78BFA]/10 to-[#C4B5FD]/5" 
            iconColor="text-[#7C3AED]" 
            onClick={() => setActiveSection('scheduler')}
          />
          <StatsCard 
            icon={Download} 
            label="Exports Today" 
            value={exportHistory?.length || 0} 
            trend={-2} 
            iconBg="bg-gradient-to-br from-[#F59E0B]/20 via-[#FBBF24]/10 to-[#FCD34D]/5" 
            iconColor="text-[#D97706]" 
            onClick={() => setActiveSection('report-log')}
          />
        </div>

        {/* Tabs - Pill Style like Company Page */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${
                    activeSection === section.id
                      ? 'bg-[var(--primary-blue)] text-white shadow-md'
                      : 'bg-[var(--background)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-[var(--border-color)] p-6">

        {/* SCHEDULER SECTION */}
          {activeSection === 'scheduler' && (
            <div className="space-y-6">
              {/* Scheduled Reports List */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--text-primary)]">Active Scheduled Reports</h3>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search schedules..."
                        value={scheduleSearchQuery}
                        onChange={(e) => setScheduleSearchQuery(e.target.value)}
                        className="w-64 px-3 py-2 pl-9 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                      />
                      <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-3 top-1/2 -translate-y-1/2" />
                      {scheduleSearchQuery && (
                        <button
                          onClick={() => setScheduleSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--background)] rounded-full transition-colors"
                        >
                          <X className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowCreateSchedule(true);
                        setEditingScheduleId(null);
                        setReportSearchQuery('');
                        setShowReportDropdown(false);
                        setScheduleForm({
                          report: '',
                          frequency: 'daily',
                          runTime: '',
                          dayOfWeek: 'Monday',
                          dayOfMonth: '1st',
                          email: '',
                          format: ['PDF'],
                          subject: 'Scheduled Report',
                          includeBody: false,
                          status: 'Active'
                        });
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-[var(--primary-blue)]/90"
                    >
                      <Plus className="w-4 h-4" />
                      Create New Schedule
                    </button>
                  </div>
                </div>
                <DataTable
                  data={(scheduledReports || []).filter((report: ScheduleEntry) =>
                    report.name.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
                    report.frequency.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
                    (report.recipients?.join(', ') || '').toLowerCase().includes(scheduleSearchQuery.toLowerCase())
                  )}
                  rowKey={(report: ScheduleEntry) => report.id}
                  logEntityType="report"
                  logFor={(report: ScheduleEntry) => ({ id: report.id, label: report.name })}
                  emptyMessage="No scheduled reports found"
                  columns={[
                    { key: 'name', header: 'Report Name', sortable: true, render: (report: ScheduleEntry) => <span className="font-medium text-[#0F172A]">{report.name}</span>, sortValue: (report: ScheduleEntry) => report.name },
                    { key: 'frequency', header: 'Frequency', render: (report: ScheduleEntry) => <span className="text-sm text-[#64748B]">{report.frequency}</span> },
                    { key: 'recipients', header: 'Recipients', render: (report: ScheduleEntry) => <span className="text-sm text-[#64748B]">{report.recipients?.join(', ') || '-'}</span> },
                    { key: 'nextRun', header: 'Next Run', render: (report: ScheduleEntry) => <span className="text-sm text-[#64748B]">{report.nextRun}</span> },
                    { key: 'format', header: 'Format', render: (report: ScheduleEntry) => <span className="text-sm text-[#64748B]">{Array.isArray(report.format) ? report.format.join(', ') : report.format}</span> },
                    {
                      key: 'enabled', header: 'Schedule Status', align: 'center',
                      render: (report: ScheduleEntry) => (
                        <button onClick={(e) => { e.stopPropagation(); handleToggleSchedule(report.id, report.enabled); }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${report.enabled ? 'bg-green-500' : 'bg-red-500'}`}
                          title={report.enabled ? 'Click to inactive' : 'Click to active'}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${report.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      ),
                    },
                  ]}
                  actions={(report: ScheduleEntry) => (
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => handleEditSchedule(report)} className="p-2 hover:bg-blue-50 rounded-lg text-blue-500" title="Edit"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleRunSchedule(report.id)} className="p-2 hover:bg-green-50 rounded-lg text-green-500" title="Run Now"><Play className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteSchedule(report.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                />
              </div>

              {/* Create Schedule Form - Modal */}
              {showCreateSchedule && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between p-6 border-b border-gray-100">
                      <h3 className="text-xl font-bold text-gray-800">
                        {editingScheduleId ? 'Edit Schedule' : 'Create New Schedule'}
                      </h3>
                      <button 
                        onClick={() => {
                          setShowCreateSchedule(false);
                          setEditingScheduleId(null);
                          setReportSearchQuery('');
                          setScheduleForm({
                            report: '',
                            frequency: 'daily',
                            runTime: '',
                            dayOfWeek: 'Monday',
                            dayOfMonth: '1st',
                            email: '',
                            format: ['PDF'],
                            subject: 'Scheduled Report',
                            includeBody: false,
                            status: 'Active'
                          });
                        }} 
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                      >
                        <X className="w-5 h-5 text-red-500" />
                      </button>
                    </div>
                    <form onSubmit={handleSaveSchedule} className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Report</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search report..."
                            value={reportSearchQuery}
                            onChange={(e) => {
                              setReportSearchQuery(e.target.value);
                              setShowReportDropdown(true);
                            }}
                            onFocus={() => setShowReportDropdown(true)}
                            className="w-full px-3 py-2 pr-10 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                          />
                          {reportSearchQuery && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReportSearchQuery('');
                                setScheduleForm({ ...scheduleForm, report: '' });
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--background)] rounded-full transition-colors z-20"
                            >
                              <X className="w-4 h-4 text-red-500" />
                            </button>
                          )}
                          {showReportDropdown && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-[var(--border-color)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Company Data Reports</div>
                              {['Company Information Report', 'Branch Information Report', 'Department Information Report', 'Designation Information Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Employee Reports</div>
                              {['Employee Information Report', 'Branch Wise Employee Report', 'Department Wise Employee Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Employee Lifecycle Reports</div>
                              {['Onboarded Employee Report', 'Onboarding Pending Report', 'Offboarded Employee Report', 'Offboarded Pending Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Candidate Reports</div>
                              {['All Candidate Report', 'Interviewed Candidate Report', 'Shortlisted Candidate Report', 'Rejected Candidate Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Attendance Reports</div>
                              {['Attendance Report', 'Late Arrival Report', 'Early Departure Report', 'Overtime Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">HR Operations Reports</div>
                              {['Employee Transfer Report', 'Duty Shift Report', 'Duty Roster Report', 'Employee Performance Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Leave and Holiday Reports</div>
                              {['Leave Report', 'Holiday Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[var(--text-tertiary)] uppercase">Financial Reports</div>
                              {['Payroll Report', 'Expenses Report', 'Appraisal Report'].filter(report =>
                                report.toLowerCase().includes(reportSearchQuery.toLowerCase())
                              ).map((report) => (
                                <div
                                  key={report}
                                  className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                                  onClick={() => {
                                    setReportSearchQuery(report);
                                    setScheduleForm({ ...scheduleForm, report });
                                    setShowReportDropdown(false);
                                  }}
                                >
                                  {report}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">Select the report to schedule</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Frequency</label>
                          <select 
                              value={scheduleForm.frequency}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
                              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm"
                            >
                              {frequencyOptions.map((opt: MasterDataOption) => (
                                <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-400">How often the report runs</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Run Time</label>
                          <TimePicker value={scheduleForm.runTime} onChange={(val) => setScheduleForm({ ...scheduleForm, runTime: val })} />
                          <p className="mt-1 text-xs text-gray-400">Time of day the report is generated</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Day of Week</label>
                          <select 
                              value={scheduleForm.dayOfWeek}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: e.target.value })}
                              disabled={scheduleForm.frequency === 'daily' || scheduleForm.frequency === 'monthly'}
                              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              {dayOptions.map((opt: MasterDataOption) => (
                                <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-400">Day the weekly report runs</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Day of Month</label>
                          <select 
                              value={scheduleForm.dayOfMonth}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfMonth: e.target.value })}
                              disabled={scheduleForm.frequency === 'daily' || scheduleForm.frequency === 'weekly'}
                              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              {payDayOptions.map((opt: MasterDataOption) => (
                                <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-400">Day the monthly report runs</p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Send To (Email)</label>
                        <input 
                          type="email" 
                          placeholder="email@company.com" 
                          value={scheduleForm.email}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, email: e.target.value })}
                          className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" 
                        />
                        <p className="mt-1 text-xs text-gray-400">Email address(es) to deliver the report</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Format</label>
                          <div className="flex flex-wrap gap-3">
                            {['PDF', 'CSV', 'Excel'].map((fmt) => (
                              <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={scheduleForm.format.includes(fmt)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setScheduleForm({
                                        ...scheduleForm,
                                        format: [...scheduleForm.format, fmt]
                                      });
                                    } else {
                                      setScheduleForm({
                                        ...scheduleForm,
                                        format: scheduleForm.format.filter((f: string) => f !== fmt)
                                      });
                                    }
                                  }}
                                  className="rounded border-[var(--border-color)] text-[var(--primary-blue)] focus:ring-2 focus:ring-[#1C64F2]"
                                />
                                <span className="text-sm text-[var(--text-tertiary)]">{fmt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Schedule Status</label>
                          <select 
                              value={scheduleForm.status}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, status: e.target.value })}
                              className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm"
                            >
                              {scheduleStatusOptions.map((opt: { code: string; name: string }) => (
                                <option key={opt.code} value={opt.code}>{opt.name}</option>
                              ))}
                            </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Email Subject</label>
                          <input 
                            type="text" 
                            placeholder="Scheduled Report" 
                            value={scheduleForm.subject}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, subject: e.target.value })}
                            className="w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm" 
                          />
                          <p className="mt-1 text-xs text-gray-400">Subject line of the email</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="includeBody" 
                          checked={scheduleForm.includeBody}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, includeBody: e.target.checked })}
                          className="rounded border-[var(--border-color)]" 
                        />
                        <label htmlFor="includeBody" className="text-sm text-[var(--text-tertiary)]">Include report body in email</label>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button 
                          type="submit" 
                          className="flex-1 px-4 py-2 bg-[var(--primary-blue)] text-white rounded-lg text-sm font-medium hover:bg-[var(--primary-blue)]/90"
                        >
                          Save Schedule
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setShowCreateSchedule(false)}
                          className="px-4 py-2 border border-[var(--border-color)] text-[var(--text-tertiary)] rounded-lg text-sm font-medium hover:bg-[var(--background)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TODO: Extract to components/ActivityLogPanel.tsx — 132 lines, depends on selectedLogModule/scheduleSearchQuery/executionLogs/exportLogs/showLogExportModal/exportDateRange/exportFormat */}
          {/* REPORT LOG SECTION */}
          {activeSection === 'report-log' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-4">
                  <h3 className="font-semibold text-[var(--text-primary)]">System Activity & Execution Logs</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-2">
                      <label className="text-sm font-medium text-[var(--text-tertiary)]">Module:</label>
                      <select 
                        value={selectedLogModule}
                        onChange={(e) => setSelectedLogModule(e.target.value)}
                        className="px-3 py-1.5 border border-[var(--border-color)] rounded-lg text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                      >
                        <option value="All">All Modules</option>
                        {auditModuleOptions.map((opt: MasterDataOption) => (
                          <option key={(opt.value || opt.code)} value={(opt.value || opt.code)}>{(opt.label || opt.name)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 mr-2">
                      <button onClick={() => setShowLogExportModal(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[var(--primary-blue)] border border-[#1C64F2] rounded-lg hover:bg-[#1E40AF] transition-all">
                        <Download className="w-4 h-4" /> Export Report
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search logs..."
                        value={scheduleSearchQuery}
                        onChange={(e) => setScheduleSearchQuery(e.target.value)}
                        className="w-64 px-3 py-2 pl-9 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                      />
                      <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <DataTable
                    data={(executionLogs || []).filter((log: ActivityLogEntry) =>
                      log.action?.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
                      log.entity_name?.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
                      log.user_name?.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
                      log.module?.toLowerCase().includes(scheduleSearchQuery.toLowerCase())
                    )}
                    rowKey={(log: ActivityLogEntry) => log.id}
                    logEntityType="report_execution"
                    logFor={(log: ActivityLogEntry) => ({ id: log.id, label: log.entity_name || `#${log.id}` })}
                    emptyMessage={`No activity logs found for ${selectedLogModule === 'All' ? 'all modules' : selectedLogModule}`}
                    columns={[
                      { key: 'created_at', header: 'Time / Date', render: (log: ActivityLogEntry) => <span className="text-sm text-[#0F172A] whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}</span> },
                      {
                        key: 'user_name', header: 'User', sortable: true,
                        render: (log: ActivityLogEntry) => (
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-[#EBF5FF] text-[#1C64F2] flex items-center justify-center font-bold text-xs shrink-0">{log.user_name?.charAt(0) || '?'}</div>
                            <div>
                              <p className="text-sm font-medium text-[#0F172A]">{log.user_name}</p>
                              <p className="text-xs text-[#94A3B8]">ID: {log.user_id}</p>
                            </div>
                          </div>
                        ),
                        sortValue: (log: ActivityLogEntry) => log.user_name,
                      },
                      {
                        key: 'module', header: 'Module & Action',
                        render: (log: ActivityLogEntry) => (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded uppercase bg-[#F1F5F9] text-[#475569] tracking-wider border border-[#CBD5E1]">{log.module}</span>
                            <span className={`status-badge ${(log.action || '').toLowerCase()}`}>{log.action}</span>
                          </div>
                        ),
                      },
                      {
                        key: 'entity_type', header: 'Entity Affected',
                        render: (log: ActivityLogEntry) => (
                          <div>
                            <p className="text-sm font-medium text-[#0F172A]">{log.entity_type}</p>
                            <p className="text-xs text-[#94A3B8] truncate max-w-[200px]" title={log.entity_name}>{log.entity_name || `ID: ${log.entity_id}`}</p>
                          </div>
                        ),
                      },
                      {
                        key: 'ip_address', header: 'Device & Network',
                        render: (log: ActivityLogEntry) => (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center text-xs text-[#64748B]"><Wifi className="w-3 h-3 mr-1" /> IP: {log.ip_address || 'N/A'}</div>
                            <div className="flex items-center text-[11px] text-[#94A3B8] truncate max-w-[250px]" title={log.user_agent}>{log.device_info ? `${log.device_info} - ${log.user_agent || 'Unknown Device'}` : log.user_agent || 'Unknown Device'}</div>
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          {/* EXPORT HUB SECTION */}
          {activeSection === 'export-hub' && (
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-10 py-3 bg-white border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2] focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--background)] rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>

              {/* Company Data Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-blue-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">Company Data Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'Company Information Report', desc: 'Complete company directory', icon: Building2 },
                    { name: 'Branch Information Report', desc: 'All branches across companies', icon: MapPin },
                    { name: 'Department Information Report', desc: 'Department hierarchy and details', icon: Users },
                    { name: 'Designation Information Report', desc: 'Job titles and designations', icon: FileText },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#1C64F2]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[var(--primary-blue)] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Employee Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-indigo-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">Employee Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'Employee Information Report', desc: 'Complete employee directory', icon: Users },
                    { name: 'Branch Wise Employee Report', desc: 'Employees grouped by branch', icon: MapPin },
                    { name: 'Department Wise Employee Report', desc: 'Employees grouped by department', icon: Users },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#6366F1]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[#6366F1] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Employee Lifecycle Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-green-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">Employee Lifecycle Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'Onboarded Employee Report', desc: 'Successfully onboarded employees', icon: UserCheck },
                    { name: 'Onboarding Pending Report', desc: 'Employees with pending onboarding', icon: Clock },
                    { name: 'Offboarded Employee Report', desc: 'Successfully offboarded employees', icon: UserX },
                    { name: 'Offboarded Pending Report', desc: 'Employees with pending offboarding', icon: AlertTriangle },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#10B981]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[#10B981] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Candidate Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-purple-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">Candidate Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'All Candidate Report', desc: 'Interview scheduling - day, month, year wise', icon: Users },
                    { name: 'Interviewed Candidate Report', desc: 'Candidates who have been interviewed', icon: UserCheck },
                    { name: 'Shortlisted Candidate Report', desc: 'Candidates who have been shortlisted', icon: CheckCircle },
                    { name: 'Rejected Candidate Report', desc: 'Candidates who have been rejected', icon: XCircle },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#8B5CF6]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[#8B5CF6] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Attendance Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-orange-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">Attendance Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'Attendance Report', desc: 'Day wise, month wise, year wise attendance', icon: Clock3 },
                    { name: 'Late Arrival Report', desc: 'Employees who arrived late', icon: Clock },
                    { name: 'Early Departure Report', desc: 'Employees who left early', icon: ArrowDownRight },
                    { name: 'Overtime Report', desc: 'Employees overtime hours and details', icon: TrendingUp },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#F59E0B]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[#F59E0B] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* HR Operations Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-teal-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">HR Operations Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'Employee Transfer Report', desc: 'Employee transfer history and status', icon: ArrowDownRight },
                    { name: 'Duty Shift Report', desc: 'Employee duty shift assignments', icon: Clock },
                    { name: 'Duty Roster Report', desc: 'Complete duty roster schedule', icon: Calendar },
                    { name: 'Employee Performance Report', desc: 'Employee performance metrics and ratings', icon: TrendingUp },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#14B8A6]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[#14B8A6] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Leave and Holiday Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-yellow-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">Leave and Holiday Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'Leave Report', desc: 'Day, month, year wise leave records', icon: Calendar },
                    { name: 'Holiday Report', desc: 'Month and year wise holiday calendar', icon: Calendar },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#EAB308]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[#EAB308] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Financial Reports */}
              <div className="bg-white rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-red-50">
                  <h3 className="font-semibold text-[var(--text-primary)]">Financial Reports</h3>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: 'Payroll Report', desc: 'Company wise daily, weekly, monthly, yearly payroll', icon: Coins },
                    { name: 'Expenses Report', desc: 'Company wise daily, weekly, monthly, yearly expenses', icon: FileSpreadsheet },
                    { name: 'Appraisal Report', desc: 'Employee appraisal and rating details', icon: Star },
                  ].filter(report => 
                    report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    report.desc.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((report, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedReport(report);
                        setExportDateRange({ start: '', end: '' });
                        setExportFormat('csv');
                        setSelectedCompany('');
                        setCompanySearchQuery('');
                        setShowCompanyDropdown(false);
                        setShowExportModal(true);
                      }}
                      className="p-4 border border-[var(--border-color)] rounded-xl hover:shadow-md hover:border-[#EF4444]/30 transition-all bg-[var(--background)] cursor-pointer text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                          <report.icon className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)] text-sm">{report.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">{report.desc}</p>
                        </div>
                        <div className="text-xs text-[#EF4444] font-medium">Click to download</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

                    {/* Log Export Modal */}
          {showLogExportModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                  <h3 className="text-xl font-bold text-gray-800">Export Execution Logs</h3>
                  <button onClick={() => setShowLogExportModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-red-500" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {/* Date Range */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Date Range
                      <span className="text-[var(--text-tertiary)] font-normal ml-1">(Optional - leave empty for all data)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[var(--text-tertiary)] mb-1">Start Date</label>
                        <DatePicker value={exportDateRange.start} onChange={(val) => setExportDateRange({ ...exportDateRange, start: val })} />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-tertiary)] mb-1">End Date</label>
                        <DatePicker value={exportDateRange.end} onChange={(val) => setExportDateRange({ ...exportDateRange, end: val })} />
                      </div>
                    </div>
                  </div>

                  {/* File Format */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">File Format</label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setExportFormat('csv')}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          exportFormat === 'csv'
                            ? 'border-[#057A55] bg-[#F0FDF4] text-[var(--success-green)]'
                            : 'border-[var(--border-color)] hover:border-[#057A55]/50 text-[var(--text-tertiary)]'
                        }`}
                      >
                        <FileSpreadsheet className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">CSV</span>
                      </button>
                      <button
                        onClick={() => setExportFormat('excel')}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          exportFormat === 'excel'
                            ? 'border-[#1C64F2] bg-[#EBF5FF] text-[var(--primary-blue)]'
                            : 'border-[var(--border-color)] hover:border-[#1C64F2]/50 text-[var(--text-tertiary)]'
                        }`}
                      >
                        <FileCode className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">Excel</span>
                      </button>
                      <button
                        onClick={() => setExportFormat('pdf')}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          exportFormat === 'pdf'
                            ? 'border-[#C81E1E] bg-[#FEF2F2] text-[var(--danger-red)]'
                            : 'border-[var(--border-color)] hover:border-[#C81E1E]/50 text-[var(--text-tertiary)]'
                        }`}
                      >
                        <FileText className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">PDF</span>
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      exportLogs(exportFormat as 'csv' | 'excel' | 'pdf');
                      setShowLogExportModal(false);
                      toast.success(`Execution logs downloaded successfully as ${exportFormat.toUpperCase()}`);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--primary-blue)] text-white font-medium rounded-xl hover:bg-[#1E40AF] transition-all"
                  >
                    <Download className="w-5 h-5" /> Download Logs
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TODO: Extract to components/ExportReportModal.tsx — shares company/dateRange/format state with parent */}
          {/* Export Modal */}
          {showExportModal && selectedReport && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                  <h3 className="text-xl font-bold text-gray-800">Download Report</h3>
                  <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-red-500" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {/* Report Info */}
                  <div className="flex items-center gap-4 p-4 bg-[var(--background)] rounded-xl">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                      <selectedReport.icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{selectedReport.name}</p>
                      <p className="text-sm text-[var(--text-tertiary)]">{selectedReport.desc}</p>
                    </div>
                  </div>

                  {/* Company Selection */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Company
                      <span className="text-[var(--text-tertiary)] font-normal ml-1">(Optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search company..."
                        value={companySearchQuery}
                        onChange={(e) => {
                          setCompanySearchQuery(e.target.value);
                          setShowCompanyDropdown(true);
                        }}
                        onFocus={() => setShowCompanyDropdown(true)}
                        className="w-full px-3 py-2 pr-10 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1C64F2]"
                      />
                      {selectedCompany && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCompanySearchQuery('');
                            setSelectedCompany('');
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--background)] rounded-full transition-colors z-20"
                        >
                          <X className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                      {showCompanyDropdown && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-[var(--border-color)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          <div
                            className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm text-[var(--text-tertiary)]"
                            onClick={() => {
                              setCompanySearchQuery('');
                              setSelectedCompany('');
                              setShowCompanyDropdown(false);
                            }}
                          >
                            All Companies
                          </div>
                          {companies?.filter((company: Company) =>
                            company.name.toLowerCase().includes(companySearchQuery.toLowerCase())
                          ).map((company: Company) => (
                            <div
                              key={company.id}
                              className="px-3 py-2 hover:bg-[var(--background)] cursor-pointer text-sm"
                              onClick={() => {
                                setCompanySearchQuery(company.name);
                                setSelectedCompany(String(company.id));
                                setShowCompanyDropdown(false);
                              }}
                            >
                              {company.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      <Info className="w-3 h-3 inline mr-1" />
                      Select a specific company or do nothing to export all data.
                    </p>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Date Range
                      <span className="text-[var(--text-tertiary)] font-normal ml-1">(Optional - leave empty for all data)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[var(--text-tertiary)] mb-1">Start Date</label>
                        <DatePicker value={exportDateRange.start} onChange={(val) => setExportDateRange({ ...exportDateRange, start: val })} />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--text-tertiary)] mb-1">End Date</label>
                        <DatePicker value={exportDateRange.end} onChange={(val) => setExportDateRange({ ...exportDateRange, end: val })} />
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      <Info className="w-3 h-3 inline mr-1" />
                      Select a date range to filter data. Leave blank to export all available data.
                    </p>
                  </div>

                  {/* File Format */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">File Format</label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setExportFormat('csv')}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          exportFormat === 'csv'
                            ? 'border-[#057A55] bg-[#F0FDF4] text-[var(--success-green)]'
                            : 'border-[var(--border-color)] hover:border-[#057A55]/50 text-[var(--text-tertiary)]'
                        }`}
                      >
                        <FileSpreadsheet className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">CSV</span>
                      </button>
                      <button
                        onClick={() => setExportFormat('excel')}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          exportFormat === 'excel'
                            ? 'border-[#1C64F2] bg-[#EBF5FF] text-[var(--primary-blue)]'
                            : 'border-[var(--border-color)] hover:border-[#1C64F2]/50 text-[var(--text-tertiary)]'
                        }`}
                      >
                        <FileCode className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">Excel</span>
                      </button>
                      <button
                        onClick={() => setExportFormat('pdf')}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          exportFormat === 'pdf'
                            ? 'border-[#C81E1E] bg-[#FEF2F2] text-[var(--danger-red)]'
                            : 'border-[var(--border-color)] hover:border-[#C81E1E]/50 text-[var(--text-tertiary)]'
                        }`}
                      >
                        <FileText className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">PDF</span>
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      <Info className="w-3 h-3 inline mr-1" />
                      CSV is best for data analysis, Excel for spreadsheets, PDF for printing.
                    </p>
                  </div>

                  {/* Download Button */}
                  <button
                    onClick={async () => {
                      setIsExporting(true);
                      try {
                        await handleExportHubReport(selectedReport.name, exportFormat as 'csv' | 'excel' | 'pdf');
                        toast.success(`${selectedReport.name} downloaded successfully as ${exportFormat.toUpperCase()}`);
                        setShowExportModal(false);
                      } catch (error) {
                        toast.error(`Failed to download ${selectedReport.name}. Please try again.`);
                      } finally {
                        setIsExporting(false);
                      }
                    }}
                    disabled={isExporting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--primary-blue)] text-white font-medium rounded-xl hover:bg-[#1E40AF] transition-all disabled:opacity-50"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download Report
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'ai-insights' && <AiInsightsPanel overviewData={overviewData} />}
        </div>
      </div>
    </div>
  );
};

export default Reports;



