import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions } from 'react-native';
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
  { key: 'overview', label: 'Overview' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'expense', label: 'Expenses' },
  { key: 'performance', label: 'Performance' },
];

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
  const [selectedReport, setSelectedReport] = useState('overview');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/summary');
      setReportData(mapDashboardToReportData(res.data));
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
      case 'overview':
        return (
          <>
            <AdminListCard style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <Text style={localStyles.chartTitle}>Department Distribution</Text>
              {deptBreakdown.length > 0 ? deptBreakdown.map((d, i) => (
                <View key={i} style={localStyles.barRow}>
                  <Text style={localStyles.barLabel}>{d.dept || d.name || d.department}</Text>
                  <View style={localStyles.barTrack}>
                    <View style={[localStyles.barFill, { width: `${d.pct || d.percentage || 0}%`, backgroundColor: colors.chart[i % colors.chart.length] }]} />
                  </View>
                  <Text style={localStyles.barValue}>{d.count || d.value || 0}</Text>
                </View>
              )) : (
                <Text style={localStyles.emptyText}>No department data available</Text>
              )}
            </AdminListCard>
            <AdminListCard style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <Text style={localStyles.chartTitle}>Monthly Summary</Text>
              <SummaryGrid items={[
                { value: stats.total_employees || 0, label: 'Total Staff' },
                { value: stats.new_hires || 0, label: 'New Hires' },
                { value: stats.exits || 0, label: 'Exits' },
                { value: `${stats.retention_rate || 0}%`, label: 'Retention' },
              ]} />
            </AdminListCard>
          </>
        );
      case 'attendance':
        return (
          <AdminListCard style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Text style={localStyles.chartTitle}>Attendance Overview</Text>
            <SummaryGrid items={[
              { value: `${attendanceData.avg_present || stats.avg_attendance || 0}%`, label: 'Avg Present' },
              { value: `${attendanceData.absent || 0}%`, label: 'Absent' },
              { value: `${attendanceData.on_leave || 0}%`, label: 'On Leave' },
              { value: attendanceData.late_today || 0, label: 'Late Today' },
            ]} />
          </AdminListCard>
        );
      case 'leave':
        return (
          <AdminListCard style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Text style={localStyles.chartTitle}>Leave Utilization</Text>
            <SummaryGrid items={[
              { value: leaveData.pending || stats.pending_leaves || 0, label: 'Pending' },
              { value: leaveData.approved || 0, label: 'Approved' },
              { value: leaveData.rejected || 0, label: 'Rejected' },
              { value: leaveData.avg_days || 0, label: 'Avg Days' },
            ]} />
          </AdminListCard>
        );
      case 'payroll':
        return (
          <AdminListCard style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Text style={localStyles.chartTitle}>Payroll Summary</Text>
            <SummaryGrid items={[
              { value: `${(payrollData.total_paid || stats.total_payroll || 0) / 1000}k`, label: 'Total Paid' },
              { value: `${(payrollData.deductions || 0) / 1000}k`, label: 'Deductions' },
              { value: `${(payrollData.net_pay || 0) / 1000}k`, label: 'Net Pay' },
              { value: `${(payrollData.avg_salary || 0) / 1000}k`, label: 'Avg Salary' },
            ]} />
          </AdminListCard>
        );
      case 'expense':
        return (
          <AdminListCard style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Text style={localStyles.chartTitle}>Expense Breakdown</Text>
            <SummaryGrid items={[
              { value: `${(reportData?.expenses?.total || 0) / 1000}k`, label: 'Total' },
              { value: `${(reportData?.expenses?.travel || 0) / 1000}k`, label: 'Travel' },
              { value: `${(reportData?.expenses?.office || 0) / 1000}k`, label: 'Office' },
              { value: `${(reportData?.expenses?.other || 0) / 1000}k`, label: 'Other' },
            ]} />
          </AdminListCard>
        );
      case 'performance':
        return (
          <AdminListCard style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Text style={localStyles.chartTitle}>Performance Analytics</Text>
            <SummaryGrid items={[
              { value: reportData?.performance?.avg_rating || 0, label: 'Avg Rating' },
              { value: `${reportData?.performance?.goals_met || 0}%`, label: 'Goals Met' },
              { value: reportData?.performance?.reviews || 0, label: 'Reviews' },
              { value: `${reportData?.performance?.feedback_rate || 0}%`, label: 'Feedback Rate' },
            ]} />
          </AdminListCard>
        );
      default:
        return <EmptyState icon="📊" title="No data" message="Report data unavailable." />;
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
            { val: stats.total_employees || 0, label: 'Employees', color: '#2563EB', bg: '#DBEAFE' },
            { val: `${stats.avg_attendance || 0}%`, label: 'Attendance', color: '#10B981', bg: '#DCFCE7' },
            { val: `${(stats.total_payroll || 0) / 1000}k`, label: 'Payroll', color: '#D97706', bg: '#FEF3C7' },
            { val: stats.pending_leaves || 0, label: 'Pending Leaves', color: '#4F46E5', bg: '#EEF2FF' },
          ]} />
          <AdminTabPills tabs={REPORT_TABS} active={selectedReport} onChange={setSelectedReport} />
          {renderReportContent()}
          {!loading && (
            <View style={localStyles.exportRow}>
              <TouchableOpacity
                style={[adminStyles.saveBtn, { flex: 1, opacity: exporting ? 0.6 : 1 }]}
                onPress={handleExportPdf}
                disabled={exporting}
              >
                <Ionicons name="download-outline" size={20} color="#FFF" />
                <Text style={adminStyles.saveBtnText}>Export PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[localStyles.exportSecondary, { flex: 1, opacity: exporting ? 0.6 : 1 }]}
                onPress={handleExportCsv}
                disabled={exporting}
              >
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={localStyles.exportSecondaryText}>Export CSV</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

    </View>
  );
};


export default ReportsScreen;
