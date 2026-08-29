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
  backgroundColor: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  color: 'black',
};

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
        <StatsCard
          icon={CalendarCheck}
          label="Present Today"
          value={stats.presentToday}
          isLoading={summaryLoading}
          iconBg="bg-gradient-to-br from-green-500/10 to-green-400/5"
          iconColor="text-green-600"
          onClick={() => navigate('/attendance')}
        />
        <StatsCard
          icon={AlertCircle}
          label="Absent Today"
          value={stats.absentToday}
          isLoading={summaryLoading}
          iconBg="bg-gradient-to-br from-red-500/10 to-red-400/5"
          iconColor="text-red-600"
          onClick={() => navigate('/attendance')}
        />
        <StatsCard
          icon={Coffee}
          label="On Leave Today"
          value={stats.onLeaveToday}
          isLoading={summaryLoading}
          iconBg="bg-gradient-to-br from-pink-500/10 to-pink-400/5"
          iconColor="text-pink-600"
          onClick={() => navigate('/leaves')}
        />
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

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button type="button" onClick={() => navigate('/employees')} className="group relative overflow-hidden rounded-2xl p-5 bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-blue-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-[#E2E8F0] flex items-center justify-center text-blue-600">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium text-[#475569]">Total Employees</p>
            <p className="text-[28px] font-bold text-[#0F172A] leading-tight tracking-tight mt-1">{stats.totalEmployees}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{stats.activeEmployees} active{selectedCompanyId ? ' · ' + (companies.find((c: { id: number }) => c.id === selectedCompanyId) as { name?: string } | undefined)?.name || '' : ''}</p>
          </div>
        </button>

        <button type="button" onClick={() => navigate('/employees')} className="group relative overflow-hidden rounded-2xl p-5 bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-[#E2E8F0] flex items-center justify-center text-emerald-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium text-[#475569]">New Hires · This Month</p>
            <p className="text-[28px] font-bold text-[#0F172A] leading-tight tracking-tight mt-1">{stats.newHiresThisPeriod}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{stats.attritionsThisPeriod} attritions</p>
          </div>
        </button>

        <button type="button" onClick={() => navigate('/leaves')} className="group relative overflow-hidden rounded-2xl p-5 bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-[#E2E8F0] flex items-center justify-center text-amber-600">
              <FileText className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium text-[#475569]">Pending Approvals</p>
            <p className="text-[28px] font-bold text-[#0F172A] leading-tight tracking-tight mt-1">{stats.leaveApproval + stats.expenseApproval}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{stats.leaveApproval} leaves · {stats.expenseApproval} expenses</p>
          </div>
        </button>

        <button type="button" onClick={() => navigate('/performance')} className="group relative overflow-hidden rounded-2xl p-5 bg-white border border-[#E2E8F0] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-400/5 to-transparent opacity-100" />
          <div className="relative flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-[#E2E8F0] flex items-center justify-center text-purple-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="relative mt-4">
            <p className="text-sm font-medium text-[#475569]">Avg Performance</p>
            <p className="text-[28px] font-bold text-[#0F172A] leading-tight tracking-tight mt-1">{stats.employeePerformance ? `${stats.employeePerformance.toFixed(1)}` : 'N/A'}</p>
            <p className="text-xs text-[#94A3B8] mt-1">out of 5.0 · {stats.reviewsThisMonth} reviews</p>
          </div>
        </button>
      </div>

      {/* Charts Section */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Analytics</h2>
          <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--hover-bg)] border border-[var(--border-color)] p-1 self-start">
            <button
              onClick={() => setAnalyticsTab('overview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${analyticsTab === 'overview' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setAnalyticsTab('trends')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${analyticsTab === 'trends' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <Activity className="w-4 h-4" />
              Trends
            </button>
            <span className="hidden md:inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--hover-bg)] text-[var(--text-secondary)] border border-[var(--border-color)] ml-1">
              Jan–Dec {new Date().getFullYear()}
            </span>
          </div>
        </div>
        {analyticsTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gender Ratio Chart */}
          <ChartCard title="Gender Ratio" subtitle="Male vs Female" icon={Users} accent="indigo">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.genderRatio}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  innerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stats.genderRatio.map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Legend formatter={(value) => <span style={{ color: 'black' }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Join/Attrition Ratio Chart */}
          <ChartCard title="Join/Attrition Ratio" subtitle="Hires vs exits this month" icon={TrendingUp} accent="emerald">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.joinAttritionRatio}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="black" fontSize={12} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {stats.joinAttritionRatio.map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Department Distribution */}
          <ChartCard title="Department Distribution" subtitle="Employees by department" icon={Building} accent="violet">
            <div className="max-h-[400px] overflow-y-auto">
              <ResponsiveContainer width="100%" height={Math.max(220, stats.departmentDistribution.length * 22)}>
                <BarChart data={stats.departmentDistribution} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                  <XAxis type="number" stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                  <YAxis type="category" dataKey="name" stroke="black" fontSize={11} width={110} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                  <Bar dataKey="value" name="Employees" radius={[0, 4, 4, 0]}>
                    {stats.departmentDistribution.map((entry: { name: string; employees: number; value: number }, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Age Distribution */}
          <ChartCard title="Age Distribution" subtitle="Workforce by age group" icon={Users} accent="purple">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.ageDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="black" fontSize={12} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Bar dataKey="value" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Employee Status Distribution */}
          <ChartCard title="Employee Status" subtitle="Active vs inactive" icon={Users} accent="rose">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Active', value: stats.activeEmployees, color: '#10B981' },
                    { name: 'Inactive', value: stats.terminatedEmployees, color: '#EF4444' },
                  ].filter((s) => s.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  innerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {[
                    { name: 'Active', value: stats.activeEmployees, color: '#10B981' },
                    { name: 'Inactive', value: stats.terminatedEmployees, color: '#EF4444' },
                  ].filter((s) => s.value > 0).map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Legend formatter={(value) => <span style={{ color: 'black' }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Organization Structure Chart */}
          <ChartCard title="Organization Structure" subtitle="Companies, branches, departments & designations" icon={Building} accent="pink">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                { name: 'Companies', value: stats.totalCompanies, color: '#8B5CF6' },
                { name: 'Branches', value: stats.totalBranches, color: '#A855F7' },
                { name: 'Departments', value: stats.totalDepartments, color: '#D946EF' },
                { name: 'Designations', value: stats.totalDesignations, color: '#EC4899' },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="black" fontSize={12} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[
                    { name: 'Companies', value: stats.totalCompanies, color: '#8B5CF6' },
                    { name: 'Branches', value: stats.totalBranches, color: '#A855F7' },
                    { name: 'Departments', value: stats.totalDepartments, color: '#D946EF' },
                    { name: 'Designations', value: stats.totalDesignations, color: '#EC4899' },
                  ].map((entry: ChartSlice, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        )}
        {analyticsTab === 'trends' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Trend */}
          <ChartCard title="Performance Trend" subtitle={`Average rating · ${yearLabel}`} icon={TrendingUp} accent="emerald">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={performanceTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" stroke="black" fontSize={12} interval={0} />
                <YAxis stroke="black" fontSize={12} domain={[0, 5]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Area type="monotone" dataKey="rating" name="Rating" stroke={ACCENT_COLORS.emerald} fill={ACCENT_COLORS.emerald} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Attendance Trend */}
          <ChartCard title="Attendance Trend" subtitle={`Check-ins · ${yearLabel}`} icon={Clock} accent="cyan">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={attendanceTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" stroke="black" fontSize={12} interval={0} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Line type="monotone" dataKey="attendance" stroke={ACCENT_COLORS.cyan} strokeWidth={3} dot={{ fill: ACCENT_COLORS.cyan, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Payroll Trend */}
          <ChartCard title="Payroll Trend" subtitle={`Net payout · ${yearLabel}`} icon={Coins} accent="amber">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={payrollTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" stroke="black" fontSize={12} interval={0} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Area type="monotone" dataKey="payroll" stroke={ACCENT_COLORS.amber} fill={ACCENT_COLORS.amber} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Recruitment Trend */}
          <ChartCard title="Recruitment Pipeline" subtitle={`Candidates · ${yearLabel}`} icon={Briefcase} accent="violet">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={recruitmentTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" stroke="black" fontSize={12} interval={0} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Legend formatter={(value) => <span style={{ color: 'black' }}>{value}</span>} />
                <Bar dataKey="candidates" name="Candidates" fill={ACCENT_COLORS.violet} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Expenses Trend */}
          <ChartCard title="Expenses Trend" subtitle={`Spend · ${yearLabel}`} icon={CreditCard} accent="rose">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={expensesTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" stroke="black" fontSize={12} interval={0} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Line type="monotone" dataKey="expenses" stroke={ACCENT_COLORS.rose} strokeWidth={3} dot={{ fill: ACCENT_COLORS.rose, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Leave Trend */}
          <ChartCard title="Leave Trend" subtitle={`Leave requests · ${yearLabel}`} icon={CalendarCheck} accent="emerald">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={leaveTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" stroke="black" fontSize={12} interval={0} />
                <YAxis stroke="black" fontSize={12} allowDecimals={false} domain={[0, chartMax]} tickFormatter={formatCompact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCompact(value as number)} />
                <Legend formatter={(value) => <span style={{ color: 'black' }}>{value}</span>} />
                <Bar dataKey="leaves" name="Leaves" fill={ACCENT_COLORS.emerald} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <button onClick={() => navigate('/company')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-200 transition-colors">
              <Building className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Company</p>
              <p className="text-xs text-[var(--text-tertiary)]">Manage organization</p>
            </div>
          </button>

          <button onClick={() => navigate('/employees')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Employees</p>
              <p className="text-xs text-[var(--text-tertiary)]">Manage staff ({stats.totalEmployees})</p>
            </div>
          </button>

          <button onClick={() => navigate('/attendance')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0 group-hover:bg-cyan-200 transition-colors">
              <Clock className="w-5 h-5 text-cyan-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Attendance</p>
              <p className="text-xs text-[var(--text-tertiary)]">Track attendance</p>
            </div>
          </button>

          <button onClick={() => navigate('/leaves')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 group-hover:bg-rose-200 transition-colors">
              <CalendarCheck className="w-5 h-5 text-rose-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Leaves</p>
              <p className="text-xs text-[var(--text-tertiary)]">Manage leave requests</p>
            </div>
          </button>

          <button onClick={() => navigate('/payroll')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 group-hover:bg-orange-200 transition-colors">
              <Coins className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Payroll</p>
              <p className="text-xs text-[var(--text-tertiary)]">Salary management</p>
            </div>
          </button>

          <button onClick={() => navigate('/recruitment')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 group-hover:bg-violet-200 transition-colors">
              <Briefcase className="w-5 h-5 text-violet-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Recruitment</p>
              <p className="text-xs text-[var(--text-tertiary)]">Hiring pipeline</p>
            </div>
          </button>

          <button onClick={() => navigate('/performance')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center shrink-0 group-hover:bg-teal-200 transition-colors">
              <TrendingUp className="w-5 h-5 text-teal-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Performance</p>
              <p className="text-xs text-[var(--text-tertiary)]">Employee reviews</p>
            </div>
          </button>

          <button onClick={() => navigate('/expenses')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-pink-100 flex items-center justify-center shrink-0 group-hover:bg-pink-200 transition-colors">
              <CreditCard className="w-5 h-5 text-pink-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Expenses</p>
              <p className="text-xs text-[var(--text-tertiary)]">Expense claims</p>
            </div>
          </button>

          <button onClick={() => navigate('/holidays')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
              <Palmtree className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Holidays</p>
              <p className="text-xs text-[var(--text-tertiary)]">Holiday calendar</p>
            </div>
          </button>

          <button onClick={() => navigate('/reports')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-lime-100 flex items-center justify-center shrink-0 group-hover:bg-lime-200 transition-colors">
              <FileBarChart className="w-5 h-5 text-lime-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Reports</p>
              <p className="text-xs text-[var(--text-tertiary)]">Analytics & reports</p>
            </div>
          </button>

          <button onClick={() => navigate('/master-data')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-slate-200 transition-colors">
              <Database className="w-5 h-5 text-slate-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Master Data</p>
              <p className="text-xs text-[var(--text-tertiary)]">Master settings</p>
            </div>
          </button>

          <button onClick={() => navigate('/settings')} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-color)] hover:bg-[var(--hover-bg)] hover:shadow-md transition-all duration-200 bg-white group">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200 transition-colors">
              <Settings className="w-5 h-5 text-gray-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[var(--text-primary)] text-sm">Settings</p>
              <p className="text-xs text-[var(--text-tertiary)]">System config</p>
            </div>
          </button>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Events & Holidays */}
        <div className="bg-white rounded-xl border border-[var(--border-color)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Palmtree className="w-5 h-5 text-amber-500" />
            Upcoming Events & Holidays
          </h2>
          <div className="space-y-3">
            {(summary?.upcomingHolidays || []).length > 0 ? (
              summary?.upcomingHolidays?.map((holiday: Holiday, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Palmtree className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)] text-sm">{holiday.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{formatAppDate(holiday.date)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No upcoming events</p>
            )}
          </div>
        </div>

        {/* Recent Attendance Activity */}
        <div className="bg-white rounded-xl border border-[var(--border-color)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-500" />
            Recent Attendance Activity
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)] text-sm">Today's Attendance</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                   {(stats.filteredEmployeesCount ?? 0) > 0 ? Math.round((stats.presentToday / (stats.filteredEmployeesCount || 1)) * 100) : 0}% employees present
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)] text-sm">Late Arrivals</p>
                <p className="text-xs text-[var(--text-tertiary)]">{stats.lateArrivals || 0} employees late today</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <ArrowDownRight className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)] text-sm">Early Departures</p>
                <p className="text-xs text-[var(--text-tertiary)]">{stats.earlyDepartures || 0} employees left early today</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Reports */}
        <div className="bg-white rounded-xl border border-[var(--border-color)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-lime-500" />
            Recent Reports
          </h2>
          <div className="space-y-3">
            {recentReports.slice(0, 3).map((report, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-primary)] text-sm">{report.report_name || 'Report'}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {report.execution_time ? formatAppDate(report.execution_time) : ''}
                      {report.format ? ` · ${report.format.toUpperCase()}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {recentReports.length === 0 && (
              <p className="text-sm text-gray-500">No recent reports generated</p>
            )}
          </div>
        </div>
      </div>

      {/* Module Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Attendance Module */}
        <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-400/5 rounded-xl border border-cyan-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center">
              <Clock className="w-6 h-6 text-cyan-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Attendance</h3>
              <p className="text-sm text-gray-600">Track employee attendance</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Present Today</span>
              <span className="font-semibold text-gray-900">{stats.presentToday || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">On Leave</span>
              <span className="font-semibold text-gray-900">{stats.onLeaveToday || 0}</span>
            </div>
          </div>
        </div>

        {/* Leaves Module */}
        <div className="bg-gradient-to-br from-rose-500/10 to-rose-400/5 rounded-xl border border-rose-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center">
              <CalendarCheck className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Leaves</h3>
              <p className="text-sm text-gray-600">Leave management</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pending Requests</span>
              <span className="font-semibold text-gray-900">{stats.leaveApproval || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Approved This Month</span>
              <span className="font-semibold text-gray-900">{summary?.leaves?.thisMonth || 0}</span>
            </div>
          </div>
        </div>

        {/* Payroll Module */}
        <div className="bg-gradient-to-br from-orange-500/10 to-orange-400/5 rounded-xl border border-orange-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
              <Coins className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Payroll</h3>
              <p className="text-sm text-gray-600">Salary processing</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Payroll Run</span>
              <span className="font-semibold text-gray-900">Monthly</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Payout</span>
              <span className="font-semibold text-gray-900">{formatCurrency(trend.length > 0 ? trend[trend.length - 1]?.payroll || 0 : 0, currency)}</span>
            </div>
          </div>
        </div>

        {/* Recruitment Module */}
        <div className="bg-gradient-to-br from-violet-500/10 to-violet-400/5 rounded-xl border border-violet-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Recruitment</h3>
              <p className="text-sm text-gray-600">Hiring pipeline</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interviews</span>
              <span className="font-semibold text-gray-900">{stats.totalInterviewScheduled || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Offers</span>
              <span className="font-semibold text-gray-900">{stats.jobOffered || 0}</span>
            </div>
          </div>
        </div>

        {/* Performance Module */}
        <div className="bg-gradient-to-br from-teal-500/10 to-teal-400/5 rounded-xl border border-teal-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Performance</h3>
              <p className="text-sm text-gray-600">Employee reviews</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Reviews This Month</span>
              <span className="font-semibold text-gray-900">{stats.reviewsThisMonth || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Avg Rating</span>
              <span className="font-semibold text-gray-900">{stats.employeePerformance ? `${stats.employeePerformance}/5.0` : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Expenses Module */}
        <div className="bg-gradient-to-br from-pink-500/10 to-pink-400/5 rounded-xl border border-pink-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-pink-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Expenses</h3>
              <p className="text-sm text-gray-600">Expense claims</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pending Claims</span>
              <span className="font-semibold text-gray-900">{stats.expenseApproval || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">This Month Total</span>
              <span className="font-semibold text-gray-900">{formatCurrency(trend.length > 0 ? trend[trend.length - 1]?.expenses || 0 : 0, currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


