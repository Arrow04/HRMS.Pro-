import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getCurrencySymbol, formatCurrency, getAppCurrency } from '../services/currencyService';
import { formatAppDate, formatAppDateLong } from '../services/appSettingsService';
import {
  Users,
  CalendarCheck,
  Clock,
  TrendingUp,
  Coins,
  Briefcase,
  AlertCircle,
  ArrowDownRight,
  Building,
  CreditCard,
  FileText,
  Palmtree,
  FileBarChart,
  Database,
  Settings,
  FileSpreadsheet,
  CheckCircle,
  Calendar,
  Coffee,
  ChevronDown,
  RefreshCw,
  LayoutDashboard,
  Activity,
  Monitor,
  LogOut,
  ShieldAlert,
  MessageSquare,
  Megaphone,
  Bell,
  Headset,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import StatsCard from '../components/StatsCard';
import SearchableSelect from '../components/SearchableSelect';
import ChartCard, { ACCENT_COLORS } from '../components/ChartCard';
import PageHero from '../components/PageHero';
import PageSkeleton from '../components/skeleton/PageSkeleton';
import ModuleSummaryCard from '../components/ModuleSummaryCard';
import QuickActionButton from '../components/QuickActionButton';
import EmptyState from '../components/EmptyState';
import type { Employee, Attendance, Holiday, LeaveApplication, Expense, Payroll } from '../types';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Compute a clean, rounded Y-axis upper bound that scales to any magnitude
// (23 -> 30, 1000 -> 1200, 100000 -> 120000) so bars are never cut off.
const chartMax = (dataMax: number) => {
  const v = dataMax || 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
  const step = magnitude < 10 ? 10 : magnitude <= 100 ? 10 : magnitude <= 1000 ? 100 : magnitude <= 10000 ? 1000 : 10000;
  return Math.ceil((v * 1.15) / step) * step;
};

// Compact number formatting for axis ticks & tooltips at scale
// (1200 -> 1.2K, 120000 -> 120K, 1200000 -> 1.2M)
const formatCompact = (value: number | string): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  if (Math.abs(n) >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

// Shared tooltip style for every chart
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(226,232,240,0.6)',
  borderRadius: '12px',
  color: '#0F172A',
  boxShadow: '0 8px 32px -4px rgba(0,0,0,0.1), 0 4px 16px -2px rgba(0,0,0,0.06)',
  backdropFilter: 'blur(12px)',
  fontSize: '12px',
  padding: '8px 12px',
};

const AXIS_STYLE = { stroke: '#CBD5E1', fontSize: 11, fontWeight: 500 as const };

interface ChartSlice {
  name: string;
  value: number;
  color: string;
}

interface MonthlyTrendItem {
  month: number;
  year: number;
  label: string;
  attendance: number;
  leaves: number;
  payroll: number;
  expenses: number;
  candidates: number;
  rating?: number;
}

interface DashboardSummary {
  employees?: {
    total: number;
    active: number;
    male: number;
    female: number;
    newHires: number;
    attritions: number;
    terminated?: number;
  };
  attendance?: {
    lateToday: number;
    earlyDepartures: number;
    presentToday: number;
    onLeaveToday?: number;
  };
  leaves?: {
    pending: number;
    thisMonth: number;
  };
  expenses?: {
    pending: number;
  };
  recruitment?: {
    interviewsScheduled?: number;
    jobOffered?: number;
  };
  departmentDistribution?: Record<string, number>;
  ageDistribution?: Record<string, number>;
  averagePerformanceRating?: number;
  reviewsThisMonth?: number;
  meta?: {
    departments: number;
    companies: number;
    branches?: number;
    designations?: number;
  };
  monthlyTrend?: MonthlyTrendItem[];
  upcomingHolidays?: Holiday[];
}

export default function Dashboard() {


  const [currency, setCurrency] = useState(getAppCurrency());
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | ''>('');
  const [trendMonths, setTrendMonths] = useState(6);
  const [analyticsTab, setAnalyticsTab] = useState<'overview' | 'trends'>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setCurrency('INR');
  }, []);




  const currencySymbol = getCurrencySymbol(currency);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['dashboardSummary', selectedCompanyId, trendMonths], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['dashboardSummary'] }),
        queryClient.invalidateQueries({ queryKey: ['recent-reports'] }),
      ]);
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  const { data: summary, isLoading: summaryLoading, isFetching } = useQuery<DashboardSummary>({
    queryKey: ['dashboardSummary', selectedCompanyId, trendMonths],
    queryFn: async () => {
      const res = await api.get('/dashboard/summary', { params: { companyId: selectedCompanyId || undefined, months: trendMonths } });
      return res.data;
    },
    refetchInterval: 60000,
  });

  const { data: recentReports = [] } = useQuery<{ report_name?: string; execution_time?: string; format?: string }[]>({
    queryKey: ['recent-reports'],
    queryFn: async () => {
      try { const res = await api.get('/reports/export-history'); return Array.isArray(res.data) ? res.data : []; } catch { return []; }
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      const data = res.data || [];
      return data.filter((item: { status?: string; is_active?: boolean }) => item.status !== 'inactive' && item.is_active !== false);
    },
    staleTime: 300000,
  });

  const stats = useMemo(() => {
    if (!summary) {
      return {
        totalEmployees: 0, filteredEmployeesCount: 0, lateArrivals: 0, earlyDepartures: 0,
        maleCount: 0, femaleCount: 0, otherGender: 0, activeEmployees: 0, terminatedEmployees: 0,
        newHiresThisPeriod: 0, attritionsThisPeriod: 0, periodLabel: '',
        onboardingPending: 0, offboardingPending: 0, presentToday: 0, absentToday: 0,
        totalInterviewScheduled: 0, jobOffered: 0, expenseApproval: 0, leaveApproval: 0,
        employeePerformance: 0, onLeaveToday: 0,
        departmentDistribution: [], ageDistribution: [], genderRatio: [], joinAttritionRatio: [],
        totalDepartments: 0, totalCompanies: 0, totalBranches: 0, totalDesignations: 0,
      };
    }

    const e = summary.employees || { total: 0, active: 0, male: 0, female: 0, newHires: 0, attritions: 0, terminated: 0 };
    const a = summary.attendance || { lateToday: 0, earlyDepartures: 0, presentToday: 0, onLeaveToday: 0 };
    const l = summary.leaves || { pending: 0, thisMonth: 0 };
    const ex = summary.expenses || { pending: 0 };
    const r = summary.recruitment || { interviewsScheduled: 0, jobOffered: 0 };

    const deptDist = Object.entries(summary.departmentDistribution || {}).map(([name, value]) => ({
      name, employees: value, value,
    }));

    const ageDist = Object.entries(summary.ageDistribution || {}).map(([name, value]) => ({
      name, value,
    }));

    const genderRatio = [
      { name: 'Male', value: e.male || 0, color: '#3B82F6' },
      { name: 'Female', value: e.female || 0, color: '#EC4899' },
      { name: 'Other', value: (e as { other?: number }).other || 0, color: '#8B5CF6' },
    ].filter((g) => g.value > 0);

    const joinAttritionRatio = [
      { name: 'New Hires', value: e.newHires || 0, color: '#10B981' },
      { name: 'Attritions', value: e.attritions || 0, color: '#EF4444' },
    ];

    return {
      totalEmployees: e.total || 0,
      filteredEmployeesCount: e.total || 0,
      lateArrivals: a.lateToday || 0,
      earlyDepartures: a.earlyDepartures || 0,
      maleCount: e.male || 0,
      femaleCount: e.female || 0,
      otherGender: 0,
      activeEmployees: e.active || 0,
      terminatedEmployees: e.terminated || 0,
      newHiresThisPeriod: e.newHires || 0,
      attritionsThisPeriod: e.attritions || 0,
      periodLabel: 'This Month',
      onboardingPending: 0,
      offboardingPending: 0,
      presentToday: a.presentToday || 0,
      absentToday: Math.max(0, (e.total || 0) - (a.presentToday || 0)),
      totalInterviewScheduled: r.interviewsScheduled || 0,
      jobOffered: r.jobOffered || 0,
      expenseApproval: ex.pending || 0,
      leaveApproval: l.pending || 0,
      employeePerformance: summary.averagePerformanceRating || 0,
      reviewsThisMonth: summary.reviewsThisMonth || 0,
      onLeaveToday: a.onLeaveToday || 0,
      departmentDistribution: deptDist,
      ageDistribution: ageDist,
      genderRatio,
      joinAttritionRatio,
      totalDepartments: summary.meta?.departments || 0,
      totalCompanies: summary.meta?.companies || 0,
      totalBranches: summary.meta?.branches || 0,
      totalDesignations: summary.meta?.designations || 0,
    };
  }, [summary]);

  // Dynamic chart data based on monthly trend from summary
  const trend = summary?.monthlyTrend || [];

  // Calendar year (Jan–Dec) label
  const yearLabel = `Jan–Dec ${new Date().getFullYear()}`;

  const attendanceTrendData = useMemo(() => trend.map((t: MonthlyTrendItem) => ({ month: t.label, attendance: t.attendance })), [trend]);
  const payrollTrendData = useMemo(() => trend.map((t: MonthlyTrendItem) => ({ month: t.label, payroll: t.payroll })), [trend]);
  const recruitmentTrendData = useMemo(() => trend.map((t: MonthlyTrendItem) => ({ month: t.label, candidates: t.candidates })), [trend]);
  const performanceTrendData = useMemo(() => trend.map((t: MonthlyTrendItem) => ({ month: t.label, rating: t.rating || 0 })), [trend]);
  const expensesTrendData = useMemo(() => trend.map((t: MonthlyTrendItem) => ({ month: t.label, expenses: t.expenses })), [trend]);
  const leaveTrendData = useMemo(() => trend.map((t: MonthlyTrendItem) => ({ month: t.label, leaves: t.leaves })), [trend]);

  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (summary && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [summary, hasLoaded]);

  if (!hasLoaded && isFetching) {
    return (
      <div className="min-h-screen bg-[var(--background)] animate-page-enter">
        <div className="w-full mx-auto space-y-6 p-6">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 animate-page-enter">
      {/* Header */}
      <PageHero
        title={`Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, Admin`}
        subtitle={formatAppDateLong(new Date())}
        icon={CalendarCheck}
        accent="blue"
        breadcrumbs={['Dashboard']}
        actions={
          <>
            <div className="relative">
              <SearchableSelect
                value={selectedCompanyId === '' ? 'all' : selectedCompanyId}
                onChange={(val) => setSelectedCompanyId(val === 'all' ? '' : Number(val))}
                options={companies.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))}
                placeholder={`All Companies (${stats.totalCompanies})`}
                allOption={`All Companies (${stats.totalCompanies})`}
                className="w-56"
                variant="hero"
              />
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-70"
              title="Refresh dashboard data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0ms' }}>
          <StatsCard
            icon={CalendarCheck}
            label="Present Today"
            value={stats.presentToday}
            isLoading={summaryLoading}
            iconBg="bg-gradient-to-br from-green-500/10 to-green-400/5"
            iconColor="text-green-600"
            onClick={() => navigate('/attendance')}
          />
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '100ms' }}>
          <StatsCard
            icon={AlertCircle}
            label="Absent Today"
            value={stats.absentToday}
            isLoading={summaryLoading}
            iconBg="bg-gradient-to-br from-red-500/10 to-red-400/5"
            iconColor="text-red-600"
            onClick={() => navigate('/attendance')}
          />
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '200ms' }}>
          <StatsCard
            icon={Coffee}
            label="On Leave Today"
            value={stats.onLeaveToday}
            isLoading={summaryLoading}
            iconBg="bg-gradient-to-br from-pink-500/10 to-pink-400/5"
            iconColor="text-pink-600"
            onClick={() => navigate('/leaves')}
          />
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '300ms' }}>
          <StatsCard
            icon={Calendar}
            label="Today's Interviews"
            value={stats.totalInterviewScheduled}
            isLoading={summaryLoading}
            iconBg="bg-gradient-to-br from-indigo-500/10 to-indigo-400/5"
            iconColor="text-indigo-600"
            onClick={() => navigate('/recruitment')}
          />
        </div>
      </div>

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button type="button" onClick={() => navigate('/employees')} className="group relative overflow-hidden rounded-2xl p-5 border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer card">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-blue-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl shadow-sm border flex items-center justify-center text-blue-600 dark:text-blue-400" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <Users className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Total Employees</p>
            <p className="text-[28px] font-bold leading-tight tracking-tight mt-1" style={{ color: 'var(--text-primary)' }}>{stats.totalEmployees}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{stats.activeEmployees} active{selectedCompanyId ? ' · ' + (companies.find((c: { id: number }) => c.id === selectedCompanyId) as { name?: string } | undefined)?.name || '' : ''}</p>
          </div>
        </button>

        <button type="button" onClick={() => navigate('/employees')} className="group relative overflow-hidden rounded-2xl p-5 border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer card">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl shadow-sm border flex items-center justify-center text-emerald-600 dark:text-emerald-400" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>New Hires · This Month</p>
            <p className="text-[28px] font-bold leading-tight tracking-tight mt-1" style={{ color: 'var(--text-primary)' }}>{stats.newHiresThisPeriod}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{stats.attritionsThisPeriod} attritions</p>
          </div>
        </button>

        <button type="button" onClick={() => navigate('/leaves')} className="group relative overflow-hidden rounded-2xl p-5 border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer card">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl shadow-sm border flex items-center justify-center text-amber-600 dark:text-amber-400" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <FileText className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Pending Approvals</p>
            <p className="text-[28px] font-bold leading-tight tracking-tight mt-1" style={{ color: 'var(--text-primary)' }}>{stats.leaveApproval + stats.expenseApproval}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{stats.leaveApproval} leaves · {stats.expenseApproval} expenses</p>
          </div>
        </button>

        <button type="button" onClick={() => navigate('/performance')} className="group relative overflow-hidden rounded-2xl p-5 border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer card">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl shadow-sm border flex items-center justify-center text-purple-600 dark:text-purple-400" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Avg Performance</p>
            <p className="text-[28px] font-bold leading-tight tracking-tight mt-1" style={{ color: 'var(--text-primary)' }}>{stats.employeePerformance ? `${stats.employeePerformance.toFixed(1)}` : 'N/A'}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>out of 5.0 · {stats.reviewsThisMonth} reviews</p>
          </div>
        </button>
      </div>

      {/* Charts Section */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-heading)' }}>Analytics</h2>
          <div className="inline-flex items-center gap-1 rounded-2xl border border-white/60 backdrop-blur-xl bg-white/70 p-1 self-start shadow-sm">
            <button
              onClick={() => setAnalyticsTab('overview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                analyticsTab === 'overview'
                  ? 'bg-gradient-to-r from-[var(--primary-blue)] to-indigo-600 text-white shadow-md shadow-blue-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setAnalyticsTab('trends')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                analyticsTab === 'trends'
                  ? 'bg-gradient-to-r from-[var(--primary-blue)] to-indigo-600 text-white shadow-md shadow-blue-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              Trends
            </button>
            <span className="hidden md:inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium text-gray-400 ml-1">
              Jan–Dec {new Date().getFullYear()}
            </span>
          </div>
        </div>
        {analyticsTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Gender Ratio Chart */}
          <ChartCard title="Gender Ratio" subtitle="Male vs Female" icon={Users} accent="indigo" delay={0}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.genderRatio}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={true}
                  label={({ name, percent, midAngle }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = 95 + 20;
                    const x = 50 + radius * Math.cos(-midAngle * RADIAN);
                    const y = 45 + radius * Math.sin(-midAngle * RADIAN);
                    return percent && percent > 0.05 ? (
                      <text x={x} y={y} fill="#475569" textAnchor={x > 50 ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    ) : null;
                  }}
                  stroke="white"
                  strokeWidth={1.5}
                >
                  {stats.genderRatio.map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs font-semibold text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Join/Attrition Ratio Chart */}
          <ChartCard title="Join/Attrition Ratio" subtitle="Hires vs exits this month" icon={TrendingUp} accent="emerald" delay={100}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.joinAttritionRatio}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={true}
                  label={({ name, percent, midAngle }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = 95 + 20;
                    const x = 50 + radius * Math.cos(-midAngle * RADIAN);
                    const y = 45 + radius * Math.sin(-midAngle * RADIAN);
                    return percent && percent > 0.05 ? (
                      <text x={x} y={y} fill="#475569" textAnchor={x > 50 ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    ) : null;
                  }}
                  stroke="white"
                  strokeWidth={1.5}
                >
                  {stats.joinAttritionRatio.map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, _name: string, props: { payload?: { name?: string } }) => [`${value}`, props.payload?.name || '']}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs font-semibold text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Department Distribution */}
          <ChartCard title="Department Distribution" subtitle="Employees by department" icon={Building} accent="violet" delay={200}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.departmentDistribution}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={1}
                  dataKey="value"
                  labelLine={true}
                  label={({ name, percent, midAngle }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = 90 + 20;
                    const x = 50 + radius * Math.cos(-midAngle * RADIAN);
                    const y = 45 + radius * Math.sin(-midAngle * RADIAN);
                    return percent && percent > 0.05 ? (
                      <text x={x} y={y} fill="#475569" textAnchor={x > 50 ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    ) : null;
                  }}
                  stroke="white"
                  strokeWidth={1.5}
                >
                  {stats.departmentDistribution.map((entry: { name: string; employees: number; value: number }, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, _name: string, props: { payload?: { name?: string } }) => [`${value} employees`, props.payload?.name || '']}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs font-semibold text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Age Distribution */}
          <ChartCard title="Age Distribution" subtitle="Workforce by age group" icon={Users} accent="purple" delay={300}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.ageDistribution} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="purpleBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="name" {...AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Bar dataKey="value" fill="url(#purpleBar)" radius={[8, 8, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Employee Status Distribution */}
          <ChartCard title="Employee Status" subtitle="Active vs inactive" icon={Users} accent="rose" delay={400}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Active', value: stats.activeEmployees, color: '#10B981' },
                    { name: 'Inactive', value: stats.terminatedEmployees, color: '#EF4444' },
                  ].filter((s) => s.value > 0)}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={true}
                  label={({ name, percent, midAngle }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = 95 + 20;
                    const x = 50 + radius * Math.cos(-midAngle * RADIAN);
                    const y = 45 + radius * Math.sin(-midAngle * RADIAN);
                    return percent && percent > 0.05 ? (
                      <text x={x} y={y} fill="#475569" textAnchor={x > 50 ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    ) : null;
                  }}
                  stroke="white"
                  strokeWidth={1.5}
                >
                  {[
                    { name: 'Active', value: stats.activeEmployees, color: '#10B981' },
                    { name: 'Inactive', value: stats.terminatedEmployees, color: '#EF4444' },
                  ].filter((s) => s.value > 0).map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, _name: string, props: { payload?: { name?: string } }) => [`${value} employees`, props.payload?.name || '']}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs font-semibold text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Organization Structure Chart */}
          <ChartCard title="Organization Structure" subtitle="Companies, branches, departments & designations" icon={Building} accent="pink" delay={500}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={[
                { name: 'Companies', value: stats.totalCompanies, color: '#8B5CF6' },
                { name: 'Branches', value: stats.totalBranches, color: '#A855F7' },
                { name: 'Departments', value: stats.totalDepartments, color: '#D946EF' },
                { name: 'Designations', value: stats.totalDesignations, color: '#EC4899' },
              ]} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="pinkBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EC4899" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#D946EF" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="name" {...AXIS_STYLE} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={44}>
                  {[
                    { name: 'Companies', value: stats.totalCompanies, color: '#8B5CF6' },
                    { name: 'Branches', value: stats.totalBranches, color: '#A855F7' },
                    { name: 'Departments', value: stats.totalDepartments, color: '#D946EF' },
                    { name: 'Designations', value: stats.totalDesignations, color: '#EC4899' },
                  ].map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        )}
        {analyticsTab === 'trends' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Performance Trend */}
          <ChartCard title="Performance Trend" subtitle={`Average rating · ${yearLabel}`} icon={TrendingUp} accent="emerald" delay={0}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={performanceTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="emeraldArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT_COLORS.emerald} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT_COLORS.emerald} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="month" {...AXIS_STYLE} interval={0} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} domain={[0, 5]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Area type="monotone" dataKey="rating" name="Rating" stroke={ACCENT_COLORS.emerald} strokeWidth={2.5} fill="url(#emeraldArea)" dot={{ fill: ACCENT_COLORS.emerald, r: 3, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', className: 'drop-shadow-md' }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Attendance Trend */}
          <ChartCard title="Attendance Trend" subtitle={`Check-ins · ${yearLabel}`} icon={Clock} accent="cyan" delay={100}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={attendanceTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="month" {...AXIS_STYLE} interval={0} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Line type="monotone" dataKey="attendance" stroke={ACCENT_COLORS.cyan} strokeWidth={2.5} dot={{ fill: ACCENT_COLORS.cyan, r: 3, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', className: 'drop-shadow-md' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Payroll Trend */}
          <ChartCard title="Payroll Trend" subtitle={`Net payout · ${yearLabel}`} icon={Coins} accent="amber" delay={200}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={payrollTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="amberArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT_COLORS.amber} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={ACCENT_COLORS.amber} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="month" {...AXIS_STYLE} interval={0} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Area type="monotone" dataKey="payroll" stroke={ACCENT_COLORS.amber} strokeWidth={2.5} fill="url(#amberArea)" dot={{ fill: ACCENT_COLORS.amber, r: 3, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', className: 'drop-shadow-md' }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Recruitment Trend */}
          <ChartCard title="Recruitment Pipeline" subtitle={`Candidates · ${yearLabel}`} icon={Briefcase} accent="violet" delay={300}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={recruitmentTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="violetBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT_COLORS.violet} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={ACCENT_COLORS.violet} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="month" {...AXIS_STYLE} interval={0} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Bar dataKey="candidates" name="Candidates" fill="url(#violetBar)" radius={[8, 8, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Expenses Trend */}
          <ChartCard title="Expenses Trend" subtitle={`Spend · ${yearLabel}`} icon={CreditCard} accent="rose" delay={400}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={expensesTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="month" {...AXIS_STYLE} interval={0} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Line type="monotone" dataKey="expenses" stroke={ACCENT_COLORS.rose} strokeWidth={2.5} dot={{ fill: ACCENT_COLORS.rose, r: 3, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', className: 'drop-shadow-md' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Leave Trend */}
          <ChartCard title="Leave Trend" subtitle={`Leave requests · ${yearLabel}`} icon={CalendarCheck} accent="emerald" delay={500}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={leaveTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="emeraldBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT_COLORS.emerald} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={ACCENT_COLORS.emerald} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8FAFC" />
                <XAxis dataKey="month" {...AXIS_STYLE} interval={0} tickLine={false} axisLine={false} />
                <YAxis {...AXIS_STYLE} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Bar dataKey="leaves" name="Leaves" fill="url(#emeraldBar)" radius={[8, 8, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <QuickActionButton icon={Building} label="Company" description="Manage organization" accent="indigo" onClick={() => navigate('/company')} />
          <QuickActionButton icon={Users} label="Employees" description={`Manage staff (${stats.totalEmployees})`} accent="emerald" onClick={() => navigate('/employees')} />
          <QuickActionButton icon={FileText} label="Letters" description="Offer & relieving letters" accent="indigo" onClick={() => navigate('/letters')} />
          <QuickActionButton icon={Clock} label="Attendance" description="Track attendance" accent="cyan" onClick={() => navigate('/attendance')} />
          <QuickActionButton icon={CalendarCheck} label="Leaves" description="Manage leave requests" accent="rose" onClick={() => navigate('/leaves')} />
          <QuickActionButton icon={Coins} label="Payroll" description="Salary management" accent="orange" onClick={() => navigate('/payroll')} />
          <QuickActionButton icon={Briefcase} label="Recruitment" description="Hiring pipeline" accent="violet" onClick={() => navigate('/recruitment')} />
          <QuickActionButton icon={TrendingUp} label="Performance" description="Employee reviews" accent="teal" onClick={() => navigate('/performance')} />
          <QuickActionButton icon={CreditCard} label="Expenses" description="Expense claims" accent="pink" onClick={() => navigate('/expenses')} />
          <QuickActionButton icon={Palmtree} label="Holidays" description="Holiday calendar" accent="amber" onClick={() => navigate('/holidays')} />
          <QuickActionButton icon={FileBarChart} label="Reports" description="Analytics & reports" accent="lime" onClick={() => navigate('/reports')} />
          <QuickActionButton icon={Database} label="Master Data" description="Master settings" accent="slate" onClick={() => navigate('/master-data')} />
          <QuickActionButton icon={Settings} label="Settings" description="System config" accent="gray" onClick={() => navigate('/settings')} />
          <QuickActionButton icon={Monitor} label="Assets" description="Asset management" accent="blue" onClick={() => navigate('/assets')} />
          <QuickActionButton icon={LogOut} label="Exit Management" description="Employee exits" accent="rose" onClick={() => navigate('/exit-management')} />
          <QuickActionButton icon={ShieldAlert} label="Anomalies" description="Detect anomalies" accent="amber" onClick={() => navigate('/anomalies')} />
          <QuickActionButton icon={MessageSquare} label="Grievances" description="Resolve complaints" accent="orange" onClick={() => navigate('/grievances')} />
          <QuickActionButton icon={Megaphone} label="Announcements" description="Company updates" accent="violet" onClick={() => navigate('/announcements')} />
          <QuickActionButton icon={Bell} label="Notifications" description="Alerts & messages" accent="blue" onClick={() => navigate('/notifications')} />
          <QuickActionButton icon={Headset} label="Helpdesk" description="IT & facility tickets" accent="cyan" onClick={() => navigate('/helpdesk')} />
        </div>
      </div>

      {/* Notifications Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Events & Holidays */}
        <div className="card card-body">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Palmtree className="w-5 h-5 text-amber-500" />
            Upcoming Events & Holidays
          </h2>
          <div className="space-y-3">
            {(summary?.upcomingHolidays || []).length > 0 ? (
              summary?.upcomingHolidays?.map((holiday: Holiday, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ease-smooth cursor-pointer" style={{ backgroundColor: 'transparent', borderColor: '#CBD5E1', color: 'var(--sidebar-text)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200" style={{ backgroundColor: 'transparent' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    <Palmtree className="w-5 h-5" style={{ color: 'inherit' }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{holiday.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatAppDate(holiday.date)}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState icon={Calendar} title="No upcoming events" description="No events scheduled for the coming days" />
            )}
          </div>
        </div>

        {/* Recent Attendance Activity */}
        <div className="card card-body">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <Clock className="w-5 h-5 text-cyan-500" />
            Recent Attendance Activity
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ease-smooth cursor-pointer" style={{ backgroundColor: 'transparent', borderColor: '#CBD5E1', color: 'var(--sidebar-text)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200" style={{ backgroundColor: 'transparent' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <CheckCircle className="w-5 h-5" style={{ color: 'inherit' }} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Today's Attendance</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                   {(stats.filteredEmployeesCount ?? 0) > 0 ? Math.round((stats.presentToday / (stats.filteredEmployeesCount || 1)) * 100) : 0}% employees present
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ease-smooth cursor-pointer" style={{ backgroundColor: 'transparent', borderColor: '#CBD5E1', color: 'var(--sidebar-text)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200" style={{ backgroundColor: 'transparent' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <AlertCircle className="w-5 h-5" style={{ color: 'inherit' }} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Late Arrivals</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stats.lateArrivals || 0} employees late today</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ease-smooth cursor-pointer" style={{ backgroundColor: 'transparent', borderColor: '#CBD5E1', color: 'var(--sidebar-text)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200" style={{ backgroundColor: 'transparent' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <ArrowDownRight className="w-5 h-5" style={{ color: 'inherit' }} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Early Departures</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stats.earlyDepartures || 0} employees left early today</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Reports */}
        <div className="card card-body">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <FileBarChart className="w-5 h-5 text-lime-500" />
            Recent Reports
          </h2>
          <div className="space-y-3">
            {recentReports.slice(0, 3).map((report, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ease-smooth cursor-pointer" style={{ backgroundColor: 'transparent', borderColor: '#CBD5E1', color: 'var(--sidebar-text)' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200" style={{ backgroundColor: 'transparent' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    <FileSpreadsheet className="w-5 h-5" style={{ color: 'inherit' }} />
                  </div>
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{report.report_name || 'Report'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {report.execution_time ? formatAppDate(report.execution_time) : ''}
                      {report.format ? ` · ${report.format.toUpperCase()}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {recentReports.length === 0 && (
              <EmptyState icon={FileBarChart} title="No recent reports" description="No reports have been generated yet" />
            )}
          </div>
        </div>
      </div>

      {/* Module Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <ModuleSummaryCard
          icon={Clock} title="Attendance" subtitle="Track employee attendance" accent="cyan"
          stats={[
            { label: 'Present Today', value: stats.presentToday || 0 },
            { label: 'On Leave', value: stats.onLeaveToday || 0 },
          ]}
        />
        <ModuleSummaryCard
          icon={CalendarCheck} title="Leaves" subtitle="Leave management" accent="rose"
          stats={[
            { label: 'Pending Requests', value: stats.leaveApproval || 0 },
            { label: 'Approved This Month', value: summary?.leaves?.thisMonth || 0 },
          ]}
        />
        <ModuleSummaryCard
          icon={Coins} title="Payroll" subtitle="Salary processing" accent="orange"
          stats={[
            { label: 'Payroll Run', value: 'Monthly' },
            { label: 'Total Payout', value: formatCurrency(trend.length > 0 ? trend[trend.length - 1]?.payroll || 0 : 0, currency) },
          ]}
        />
        <ModuleSummaryCard
          icon={Briefcase} title="Recruitment" subtitle="Hiring pipeline" accent="violet"
          stats={[
            { label: 'Interviews', value: stats.totalInterviewScheduled || 0 },
            { label: 'Offers', value: stats.jobOffered || 0 },
          ]}
        />
        <ModuleSummaryCard
          icon={TrendingUp} title="Performance" subtitle="Employee reviews" accent="teal"
          stats={[
            { label: 'Reviews This Month', value: stats.reviewsThisMonth || 0 },
            { label: 'Avg Rating', value: stats.employeePerformance ? `${stats.employeePerformance}/5.0` : 'N/A' },
          ]}
        />
        <ModuleSummaryCard
          icon={CreditCard} title="Expenses" subtitle="Expense claims" accent="pink"
          stats={[
            { label: 'Pending Claims', value: stats.expenseApproval || 0 },
            { label: 'This Month Total', value: formatCurrency(trend.length > 0 ? trend[trend.length - 1]?.expenses || 0 : 0, currency) },
          ]}
        />
      </div>
    </div>
  );
}


