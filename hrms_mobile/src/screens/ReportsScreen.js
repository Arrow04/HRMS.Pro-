import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { EmptyState } from '../components/UI';
import { downloadAndShareFile, rowsToCsv, shareTextAsCsv } from '../utils/fileExport';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminListCard, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const { width: SCREEN_W } = Dimensions.get('window');
const createLocalStyles = (colors) => ({
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  barLabel: { fontSize: 12, color: colors.textSecondary, width: 80 },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { fontSize: 12, fontWeight: '600', color: colors.text, width: 30, textAlign: 'right' },
  emptyText: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', padding: 20 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryItem: { width: HALF_W, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.primary },
  summaryLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 4, textAlign: 'center' },
  exportRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  exportSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1.5, borderColor: colors.primary },
  exportSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.primary } });
const HALF_W = (SCREEN_W - 40 * 2 - 8) / 2;

const REPORT_TABS = [
  { key: 'export-hub', label: 'Export Hub' },
  { key: 'schedule', label: 'Schedule Report' },
  { key: 'logs', label: 'Execution Logs' },
  { key: 'ai', label: 'AI Insights' },
];

const REPORT_DESCS = {
  'company-info': 'Complete company directory',
  'branch-info': 'All branches across companies',
  'department-info': 'Department hierarchy and details',
  'designation-info': 'Job titles and designations',
  'employee-info': 'Complete employee directory',
  'branch-employee': 'Employees grouped by branch',
  'dept-employee': 'Employees grouped by department',
  'onboarded': 'Successfully onboarded employees',
  'onboarding-pending': 'Employees with pending onboarding',
  'offboarded': 'Successfully offboarded employees',
  'offboarding-pending': 'Employees with pending offboarding',
  'all-candidate': 'Interview scheduling - day, month, year wise',
  'interviewed-candidate': 'Candidates who have been interviewed',
  'shortlisted-candidate': 'Candidates who have been shortlisted',
  'rejected-candidate': 'Candidates who have been rejected',
  'attendance-report': 'Day wise, month wise, year wise attendance',
  'late-arrival': 'Employees who arrived late',
  'early-departure': 'Employees who left early',
  'overtime': 'Employees overtime hours and details',
  'transfer-report': 'Employee transfer history and status',
  'shift-report': 'Employee duty shift assignments',
  'roster-report': 'Complete duty roster schedule',
  'performance-report': 'Employee performance metrics and ratings',
  'leave-report': 'Day, month, year wise leave records',
  'holiday-report': 'Month and year wise holiday calendar',
  'payroll-report': 'Company wise daily, weekly, monthly, yearly payroll',
  'expense-report': 'Company wise daily, weekly, monthly, yearly expenses',
  'appraisal-report': 'Employee appraisal and rating details',
};

const EXPORT_REPORT_MAP = {
  overview: 'employees',
  attendance: 'attendance',
  leave: 'leaves',
  payroll: 'payroll',
  expense: 'expenses',
  performance: 'employees' };

function mapDashboardToReportData(summary) {
  if (!summary) return null;

  const employees = summary.employees || {};
  const attendance = summary.attendance || {};
  const leaves = summary.leaves || {};
  const expenses = summary.expenses || {};
  const trend = summary.monthlyTrend || [];
  const totalPayroll = trend.reduce((s, t) => s + (t.payroll || 0), 0);
  const avgAttendance = trend.length
    ? Math.round(trend.reduce((s, t) => s + (t.attendance || 0), 0) / trend.length)
    : 0;

  const deptDist = summary.departmentDistribution || {};
  const deptBreakdown = Object.entries(deptDist).map(([name, count]) => {
    const total = employees.total || 1;
    return { dept: name, name, count, pct: Math.round((count / total) * 100) };
  });

  return {
    stats: {
      total_employees: employees.total || 0,
      new_hires: employees.newHires || 0,
      exits: employees.attritions || 0,
      retention_rate: employees.total
        ? Math.round(((employees.total - (employees.attritions || 0)) / employees.total) * 100)
        : 0,
      avg_attendance: avgAttendance,
      total_payroll: totalPayroll,
      pending_leaves: leaves.pending || 0 },
    attendance: {
      avg_present: avgAttendance,
      absent: 0,
      on_leave: attendance.onLeaveToday || 0,
      late_today: attendance.lateToday || 0 },
    leaves: {
      pending: leaves.pending || 0,
      approved: leaves.thisMonth || 0,
      rejected: 0,
      avg_days: 0 },
    payroll: {
      total_paid: totalPayroll,
      deductions: 0,
      net_pay: totalPayroll,
      avg_salary: employees.total ? totalPayroll / employees.total : 0 },
    expenses: {
      total: expenses.monthTotal || 0,
      travel: 0,
      office: 0,
      other: expenses.monthTotal || 0 },
    performance: {
      avg_rating: summary.averagePerformanceRating || 0,
      goals_met: 0,
      reviews: summary.reviewsThisMonth || 0,
      feedback_rate: 0 },
    departmentBreakdown: deptBreakdown,
    monthlyTrend: trend };
}

const ReportsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [selectedReport, setSelectedReport] = useState('export-hub');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportMeta, setReportMeta] = useState({ totalReports: 0, activeSchedules: 0, inactiveSchedules: 0, exportsToday: 0 });

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/summary');
      setReportData(mapDashboardToReportData(res.data));
    } catch (e) { console.error(e); }
    try {
      const asArray = (d) => Array.isArray(d) ? d : (d?.data || d?.items || d?.reports || []);
      const [liveRes, schedRes, histRes] = await Promise.allSettled([
        api.get('/reports/live'),
        api.get('/reports/schedules'),
        api.get('/reports/export-history'),
      ]);
      const liveReports = liveRes.status === 'fulfilled' ? asArray(liveRes.value.data) : [];
      const schedules = schedRes.status === 'fulfilled' ? asArray(schedRes.value.data) : [];
      const history = histRes.status === 'fulfilled' ? asArray(histRes.value.data) : [];
      setReportMeta({
        totalReports: liveReports.length,
        activeSchedules: schedules.filter((r) => r.enabled !== false).length,
        inactiveSchedules: schedules.filter((r) => r.enabled === false).length,
        exportsToday: history.length,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const stats = reportData?.stats || {};
  const attendanceData = reportData?.attendance || {};
  const leaveData = reportData?.leaves || {};
  const payrollData = reportData?.payroll || {};
  const deptBreakdown = reportData?.departmentBreakdown || [];

  const matchesReportQuery = (label) => {
    const q = reportSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return String(label || '').toLowerCase().includes(q);
  };

  const buildSummaryRows = () => {
    const rows = [
      { metric: 'Total Employees', value: stats.total_employees || 0 },
      { metric: 'New Hires', value: stats.new_hires || 0 },
      { metric: 'Exits', value: stats.exits || 0 },
      { metric: 'Retention Rate', value: `${stats.retention_rate || 0}%` },
      { metric: 'Avg Attendance', value: stats.avg_attendance || 0 },
      { metric: 'Total Payroll', value: stats.total_payroll || 0 },
      { metric: 'Pending Leaves', value: stats.pending_leaves || 0 },
    ];
    deptBreakdown.forEach((d) => {
      rows.push({ metric: `Dept: ${d.dept || d.name}`, value: d.count || 0 });
    });
    return rows;
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const reportKey = EXPORT_REPORT_MAP[selectedReport] || 'employees';
      const csvEndpoints = {
        attendance: '/reports/attendance',
        leaves: '/reports/leaves',
        payroll: '/reports/payroll',
        expenses: '/reports/expenses',
        employees: '/reports/export-hub?report=employees&format=csv' };

      if (selectedReport === 'overview' || selectedReport === 'performance') {
        await shareTextAsCsv(rowsToCsv(buildSummaryRows()), `${selectedReport}_report`);
      } else if (csvEndpoints[reportKey]?.startsWith('/reports/') && !csvEndpoints[reportKey].includes('export-hub')) {
        await downloadAndShareFile(csvEndpoints[reportKey], `${reportKey}_report.csv`, 'text/csv');
      } else {
        await downloadAndShareFile(`/reports/export-hub?report=${reportKey}&format=csv`, `${reportKey}_report.csv`, 'text/csv');
      }
    } catch {
      Alert.alert('Export', 'CSV export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const reportKey = EXPORT_REPORT_MAP[selectedReport] || 'employees';
      if (selectedReport === 'overview' || selectedReport === 'performance') {
        await downloadAndShareFile('/reports/live-export?format=pdf', 'overview_report.pdf', 'application/pdf');
      } else if (['attendance', 'leaves', 'payroll', 'expenses'].includes(reportKey)) {
        await downloadAndShareFile(`/reports/export-hub?report=${reportKey}&format=pdf`, `${reportKey}_report.pdf`, 'application/pdf');
      } else {
        await downloadAndShareFile('/reports/live-export?format=pdf', 'report.pdf', 'application/pdf');
      }
    } catch {
      Alert.alert('Export', 'PDF export failed.');
    } finally {
      setExporting(false);
    }
  };

  const SummaryGrid = ({ items }) => (
    <View style={localStyles.summaryGrid}>
      {items.map((item, i) => (
        <View key={i} style={localStyles.summaryItem}>
          <Text style={localStyles.summaryValue}>{item.value}</Text>
          <Text style={localStyles.summaryLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );

  const renderReportContent = () => {
    if (loading) {
      return <View>{[1, 2].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>;
    }

    switch (selectedReport) {
      case 'export-hub':
        return (
          <>
            {/* Search Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16, gap: 8 }}>
              <Ionicons name="search-outline" size={16} color={colors.textTertiary} />
              <TextInput
                value={reportSearchQuery}
                onChangeText={setReportSearchQuery}
                placeholder="Search reports..."
                placeholderTextColor={colors.textTertiary}
                style={{ flex: 1, fontSize: 14, color: colors.text }}
              />
              {reportSearchQuery ? (
                <TouchableOpacity onPress={() => setReportSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={colors.danger || '#DC2626'} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Company Data Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#EFF6FF' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C64F2' }}>Company Data Reports</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'company-info', label: 'Company Information', icon: 'business-outline', color: '#3B82F6' },
                  { key: 'branch-info', label: 'Branch Information', icon: 'git-branch-outline', color: '#3B82F6' },
                  { key: 'department-info', label: 'Department Information', icon: 'people-outline', color: '#3B82F6' },
                  { key: 'designation-info', label: 'Designation Information', icon: 'briefcase-outline', color: '#3B82F6' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Employee Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#EEF2FF' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#4F46E5' }}>Employee Reports</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'employee-info', label: 'Employee Information', icon: 'people-outline', color: '#4F46E5' },
                  { key: 'branch-employee', label: 'Branch Wise Employees', icon: 'git-branch-outline', color: '#4F46E5' },
                  { key: 'dept-employee', label: 'Department Wise Employees', icon: 'briefcase-outline', color: '#4F46E5' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Onboarding/Offboarding Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#ECFDF5' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#059669' }}>Onboarding & Offboarding</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'onboarded', label: 'Onboarded Employees', icon: 'checkmark-circle-outline', color: '#059669' },
                  { key: 'onboarding-pending', label: 'Onboarding Pending', icon: 'time-outline', color: '#059669' },
                  { key: 'offboarded', label: 'Offboarded Employees', icon: 'close-circle-outline', color: '#059669' },
                  { key: 'offboarding-pending', label: 'Offboarding Pending', icon: 'alert-circle-outline', color: '#059669' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Candidate Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#F5F3FF' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#8B5CF6' }}>Candidate Reports</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'all-candidate', label: 'All Candidate Report', icon: 'people-outline', color: '#8B5CF6' },
                  { key: 'interviewed-candidate', label: 'Interviewed Candidate Report', icon: 'checkmark-circle-outline', color: '#8B5CF6' },
                  { key: 'shortlisted-candidate', label: 'Shortlisted Candidate Report', icon: 'star-outline', color: '#8B5CF6' },
                  { key: 'rejected-candidate', label: 'Rejected Candidate Report', icon: 'close-circle-outline', color: '#8B5CF6' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Attendance Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#FFF7ED' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#D97706' }}>Attendance Reports</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'attendance-report', label: 'Attendance Report', icon: 'finger-print-outline', color: '#D97706' },
                  { key: 'late-arrival', label: 'Late Arrival Report', icon: 'time-outline', color: '#D97706' },
                  { key: 'early-departure', label: 'Early Departure Report', icon: 'log-out-outline', color: '#D97706' },
                  { key: 'overtime', label: 'Overtime Report', icon: 'trending-up-outline', color: '#D97706' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#FFF7ED', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* HR Operations Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#F0FDFA' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0D9488' }}>HR Operations Reports</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'transfer-report', label: 'Employee Transfer Report', icon: 'swap-horizontal-outline', color: '#0D9488' },
                  { key: 'shift-report', label: 'Duty Shift Report', icon: 'time-outline', color: '#0D9488' },
                  { key: 'roster-report', label: 'Duty Roster Report', icon: 'calendar-outline', color: '#0D9488' },
                  { key: 'performance-report', label: 'Employee Performance Report', icon: 'trophy-outline', color: '#0D9488' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#CCFBF1', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Leave Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#FEF3C7' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E' }}>Leave Reports</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'leave-report', label: 'Leave Report', icon: 'calendar-outline', color: '#92400E' },
                  { key: 'holiday-report', label: 'Holiday Report', icon: 'calendar-clear-outline', color: '#92400E' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Payroll & Expense Reports */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#FDF2F8' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#BE185D' }}>Financial Reports</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'space-between' }}>
                {[
                  { key: 'payroll-report', label: 'Payroll Report', icon: 'wallet-outline', color: '#BE185D' },
                  { key: 'expense-report', label: 'Expense Report', icon: 'receipt-outline', color: '#BE185D' },
                  { key: 'appraisal-report', label: 'Appraisal Report', icon: 'star-outline', color: '#BE185D' },
                ].filter((item) => matchesReportQuery(item.label)).map((item) => (
                  <TouchableOpacity key={item.key} style={{ width: '48%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#FDF2F8', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }} numberOfLines={2}>{REPORT_DESCS[item.key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: item.color }}>Click to download</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        );
      case 'schedule':
        return (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Schedule Report</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>Configure automatic report generation and delivery.</Text>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface }}>
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>Create Schedule</Text>
            </TouchableOpacity>
          </View>
        );
      case 'logs':
        return (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Execution Logs</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>View history of generated reports.</Text>
            <EmptyState icon="📋" title="No logs yet" message="Report generation history will appear here." />
          </View>
        );
      case 'ai':
        return (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>AI Insights</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>AI-powered analytics and recommendations.</Text>
            <EmptyState icon="🧠" title="Coming soon" message="AI insights will be available soon." />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Reports" subtitle="Analytics and insights" showBack />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: reportMeta.totalReports, label: 'Total Reports', color: '#2563EB', bg: '#DBEAFE' },
            { val: reportMeta.activeSchedules, label: 'Active Schedule', color: '#10B981', bg: '#DCFCE7' },
            { val: reportMeta.inactiveSchedules, label: 'Inactive Schedule', color: '#7C3AED', bg: '#EDE9FE' },
            { val: reportMeta.exportsToday, label: 'Exports Today', color: '#D97706', bg: '#FEF3C7' },
          ]} />

          <AdminTabPills tabs={REPORT_TABS} active={selectedReport} onChange={setSelectedReport} />

          {renderReportContent()}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

    </View>
  );
};


export default ReportsScreen;
