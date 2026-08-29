import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { radii } from '../theme';
import { Badge, EmptyState } from '../components/UI';
import { TrendLine } from '../components/Charts';
import { downloadAndShareFile } from '../utils/fileExport';
import {
  useAdminStyles,
  AdminHeader,
  AdminStatRow,
  AdminDetailSheet,
  AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const formatCompact = (value) => {
  const n = Number(value || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return formatCurrency(n);
};

const payslipMonthIndex = (item) => {
  const d = new Date(item.payDate || item.periodStart || item.createdAt);
  return Number.isNaN(d.getTime()) ? 0 : d.getMonth();
};

const PayslipScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const { user } = useAuth();

  const employeeId = user?.employeeId ?? user?.employee_id;

  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [downloadingId, setDownloadingId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchData = useCallback(async () => {
    if (!employeeId) {
      setPayslips([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await api.get(`/payroll/employee/${employeeId}`, { params: { year: selectedYear } });
      setPayslips(res.data?.data || res.data?.items || (Array.isArray(res.data) ? res.data : []));
    } catch (e) {
      console.error(e);
      setPayslips([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId, selectedYear]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const downloadPayslip = async (item) => {
    if (!item?.id) return;
    setDownloadingId(item.id);
    try {
      const month = payslipMonthIndex(item) + 1;
      const filename = `payslip_${month}_${item.year || selectedYear}.pdf`;
      await downloadAndShareFile(`/payroll/${item.id}/pdf`, filename, 'application/pdf');
    } catch {
      Alert.alert('Download failed', 'Could not download payslip PDF. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const monthlyData = useMemo(() => MONTHS.map((m, i) => {
    const recs = payslips.filter((p) => payslipMonthIndex(p) === i);
    return { month: m, net: recs.reduce((s, p) => s + (p.netSalary || p.net || 0), 0) };
  }), [payslips]);

  const totalGross = payslips.reduce((s, p) => s + (p.grossSalary || p.gross || 0), 0);
  const totalDeductions = payslips.reduce((s, p) => s + (p.totalDeductions || p.deductions || 0), 0);
  const totalNet = payslips.reduce((s, p) => s + (p.netSalary || p.net || 0), 0);
  const avgNet = payslips.length ? Math.round(totalNet / payslips.length) : 0;

  const sortedPayslips = [...payslips].sort(
    (a, b) => payslipMonthIndex(b) - payslipMonthIndex(a),
  );

  const periodLabel = (item) => {
    const idx = payslipMonthIndex(item);
    return `${MONTHS_FULL[idx]} ${selectedYear}`;
  };

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader
          navigation={navigation}
          title="Payslips"
          subtitle="Salary statements & downloads"
          showBack={navigation?.canGoBack?.() ?? false}
        />

        <View style={adminStyles.body}>
          <View style={adminStyles.datePickerRow}>
            <TouchableOpacity onPress={() => setSelectedYear((y) => y - 1)} style={adminStyles.iconBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={adminStyles.dateText}>{selectedYear}</Text>
            <TouchableOpacity
              onPress={() => setSelectedYear((y) => Math.min(y + 1, new Date().getFullYear()))}
              style={adminStyles.iconBtn}
              disabled={selectedYear >= new Date().getFullYear()}
            >
              <Ionicons name="chevron-forward" size={20} color={selectedYear >= new Date().getFullYear() ? colors.textTertiary : colors.text} />
            </TouchableOpacity>
          </View>

          {!employeeId ? (
            <EmptyState icon="👤" title="No employee profile" message="Your account is not linked to an employee record." />
          ) : loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : payslips.length === 0 ? (
            <EmptyState icon="💳" title="No payslips" message={`No salary statements for ${selectedYear}.`} />
          ) : (
            <>
              <LinearGradient
                colors={['#059669', '#10B981', '#34D399']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: radii.xl,
                  padding: 20,
                  marginBottom: 16,
                  overflow: 'hidden' }}
              >
                <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.1)', top: -30, right: -20 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  Year-to-date net pay
                </Text>
                <Text style={{ fontSize: 32, fontWeight: '800', color: '#FFF', marginTop: 8, letterSpacing: -0.5 }}>
                  {formatCurrency(totalNet)}
                </Text>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 6, fontWeight: '500' }}>
                  {payslips.length} payslip{payslips.length === 1 ? '' : 's'} · Avg {formatCurrency(avgNet)}/month
                </Text>
              </LinearGradient>

              <AdminStatRow
                stats={[
                  { val: formatCompact(totalGross), label: 'Gross YTD', color: '#2563EB', bg: '#DBEAFE' },
                  { val: formatCompact(totalDeductions), label: 'Deductions', color: '#DC2626', bg: '#FEE2E2' },
                  { val: formatCompact(totalNet), label: 'Net YTD', color: '#059669', bg: '#DCFCE7' },
                  { val: payslips.length, label: 'Payslips', color: '#7C3AED', bg: '#EDE9FE' },
                ]}
              />

              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radii.lg,
                  padding: 16,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: colors.borderLight }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Net Pay Trend</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{selectedYear} monthly breakdown</Text>
                  </View>
                  <Ionicons name="trending-up" size={20} color={colors.success} />
                </View>
                <TrendLine
                  data={monthlyData.map((m) => m.net)}
                  labels={monthlyData.map((m) => m.month)}
                  height={150}
                  color="#10B981"
                  bare
                  showXLabels={false}
                />
              </View>

              <Text style={adminStyles.sectionLabel}>Statements</Text>
              {sortedPayslips.map((item) => {
                const monthIdx = payslipMonthIndex(item);
                const net = item.netSalary || item.net || 0;
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.88}
                    onPress={() => setSelectedItem(item)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.surface,
                      borderRadius: radii.lg,
                      padding: 14,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: colors.borderLight }}
                  >
                    <LinearGradient
                      colors={['#059669', '#10B981']}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFF' }}>{MONTHS[monthIdx]}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={adminStyles.listTitle}>{periodLabel(item)}</Text>
                      <Text style={adminStyles.listSub}>Net {formatCurrency(net)}</Text>
                      <Text style={adminStyles.listSub}>
                        Gross {formatCurrency(item.grossSalary || item.gross || 0)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Badge status={item.status || 'paid'} size="sm" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminDetailSheet
        visible={!!selectedItem}
        title={selectedItem ? periodLabel(selectedItem) : 'Payslip'}
        onClose={() => setSelectedItem(null)}
      >
        {selectedItem && (
          <>
            <LinearGradient
              colors={['#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ borderRadius: radii.lg, padding: 16, marginBottom: 16 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>NET PAY</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFF', marginTop: 4 }}>
                {formatCurrency(selectedItem.netSalary || selectedItem.net || 0)}
              </Text>
            </LinearGradient>

            <AdminDetailRows
              rows={[
                { label: 'Status', value: selectedItem.status || 'paid', valueStyle: { color: '#059669' } },
                { label: 'Basic salary', value: formatCurrency(selectedItem.basicSalary || selectedItem.basic || 0), valueStyle: { textTransform: 'none' } },
                { label: 'HRA', value: formatCurrency(selectedItem.hra || 0), valueStyle: { textTransform: 'none' } },
                { label: 'Gross pay', value: formatCurrency(selectedItem.grossSalary || selectedItem.gross || 0), valueStyle: { textTransform: 'none' } },
                {
                  label: 'Deductions',
                  value: formatCurrency(selectedItem.totalDeductions || selectedItem.deductions || 0),
                  valueStyle: { color: '#DC2626', textTransform: 'none' } },
                { label: 'Net pay', value: formatCurrency(selectedItem.netSalary || selectedItem.net || 0), valueStyle: { color: '#059669', textTransform: 'none' } },
              ]}
            />

            <TouchableOpacity
              style={[adminStyles.saveBtn, downloadingId === selectedItem.id && { opacity: 0.6 }]}
              onPress={() => downloadPayslip(selectedItem)}
              disabled={downloadingId === selectedItem.id}
            >
              {downloadingId === selectedItem.id ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Ionicons name="download-outline" size={20} color="#FFF" />
              )}
              <Text style={adminStyles.saveBtnText}>
                {downloadingId === selectedItem.id ? 'Downloading…' : 'Download PDF'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </AdminDetailSheet>
    </View>
  );
};

export default PayslipScreen;
