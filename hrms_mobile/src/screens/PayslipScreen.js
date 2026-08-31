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
  if (Number.isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Kolkata' }).formatToParts(d);
  return parseInt(parts.find(p => p.type === 'month').value, 10) - 1;
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
  const [detailTab, setDetailTab] = useState('earnings');

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
    return { month: m, net: recs.reduce((s, p) => s + (p.netSalary || 0), 0) };
  }), [payslips]);

  const totalGross = payslips.reduce((s, p) => s + (p.grossSalary || 0), 0);
  const totalDeductions = payslips.reduce((s, p) => s + (p.totalDeductions || 0), 0);
  const totalNet = payslips.reduce((s, p) => s + (p.netSalary || 0), 0);
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
          <View style={[adminStyles.datePickerRow, { gap: 24 }]}>
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
                  paddingTop: 16,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingBottom: 4,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: colors.borderLight,
                  overflow: 'visible' }}
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
                      height={180}
                      color="#10B981"
                      bare
                    />
                  </View>

              <Text style={adminStyles.sectionLabel}>Statements</Text>
              {MONTHS_FULL.map((month, i) => {
                const rec = sortedPayslips.find((p) => payslipMonthIndex(p) === i);
                const hasData = !!rec;
                const net = hasData ? (rec.netSalary || 0) : 0;
                const gross = hasData ? (rec.grossSalary || 0) : 0;
                return (
                  <TouchableOpacity
                    key={month}
                    activeOpacity={hasData ? 0.88 : 1}
                    onPress={() => hasData && setSelectedItem(rec)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.surface,
                      borderRadius: radii.lg,
                      padding: 14,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: colors.borderLight,
                      opacity: hasData ? 1 : 0.5 }}
                  >
                    <LinearGradient
                      colors={hasData ? ['#059669', '#10B981'] : ['#9CA3AF', '#D1D5DB']}
                      style={{
                        width: 60,
                        height: 56,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF', textTransform: 'uppercase', textAlign: 'center' }}>{MONTHS_FULL[i]}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={adminStyles.listTitle}>{month} {selectedYear}</Text>
                      <Text style={adminStyles.listSub}>Net {formatCurrency(net)}</Text>
                      <Text style={adminStyles.listSub}>Gross {formatCurrency(gross)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      {hasData ? (
                        <>
                          <Badge status={rec.status || 'paid'} size="sm" />
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => downloadPayslip(rec)}
                            disabled={downloadingId === rec.id}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySurface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
                          >
                            {downloadingId === rec.id ? (
                              <ActivityIndicator size={10} color={colors.primary} />
                            ) : (
                              <Ionicons name="download-outline" size={12} color={colors.primary} />
                            )}
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>
                              {downloadingId === rec.id ? '...' : 'PDF'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>₹0</Text>
                      )}
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
        onClose={() => { setSelectedItem(null); setDetailTab('earnings'); }}
      >
        {selectedItem && (
          <>
            <LinearGradient
              colors={['#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ borderRadius: radii.lg, padding: 16, marginBottom: 12 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>NET PAY</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFF', marginTop: 4 }}>
                {formatCurrency(selectedItem.netSalary || 0)}
              </Text>
            </LinearGradient>

            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
              {[
                { key: 'earnings', label: 'Earnings', color: '#059669' },
                { key: 'deductions', label: 'Deductions', color: '#DC2626' },
                { key: 'takehome', label: 'Take Home', color: '#2563EB' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setDetailTab(t.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: detailTab === t.key ? t.color : colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: detailTab === t.key ? t.color : colors.borderLight,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: detailTab === t.key ? '#FFF' : colors.textTertiary }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {detailTab === 'earnings' && (
              <View style={{ gap: 10 }}>
                {[
                  { label: 'Basic salary', val: selectedItem.basicSalary || selectedItem.basic },
                  { label: 'HRA', val: selectedItem.hra },
                  { label: 'Conveyance', val: selectedItem.conveyance || selectedItem.conveyanceAllowance },
                  { label: 'Medical', val: selectedItem.medical || selectedItem.medicalAllowance },
                  { label: 'Special allowance', val: selectedItem.specialAllowance || selectedItem.special },
                  { label: 'Other allowances', val: selectedItem.otherAllowances || selectedItem.allowances },
                  { label: 'Overtime', val: selectedItem.overtime || selectedItem.overtimePay },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: (row.val ?? 0) > 0 ? colors.text : colors.textTertiary }}>
                      {(row.val ?? 0) > 0 ? formatCurrency(row.val) : '—'}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 2, borderTopColor: '#059669' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>Total Earnings</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#059669' }}>
                    {formatCurrency((selectedItem.basicSalary || 0) + (selectedItem.hra || 0) + (selectedItem.conveyance || 0) + (selectedItem.medical || 0) + (selectedItem.specialAllowance || 0) + (selectedItem.otherAllowances || 0) + (selectedItem.overtime || 0) || selectedItem.grossSalary || 0)}
                  </Text>
                </View>
              </View>
            )}

            {detailTab === 'deductions' && (
              <View style={{ gap: 10 }}>
                {[
                  { label: 'PF', val: selectedItem.pf || selectedItem.providentFund },
                  { label: 'ESI', val: selectedItem.esi },
                  { label: 'Professional tax', val: selectedItem.professionalTax || selectedItem.pt },
                  { label: 'Income tax (TDS)', val: selectedItem.tds || selectedItem.incomeTax },
                  { label: 'Loan deduction', val: selectedItem.loanDeduction || selectedItem.loan },
                  { label: 'Other deductions', val: selectedItem.otherDeductions || selectedItem.deductionsOther },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: (row.val ?? 0) > 0 ? '#FFF' : colors.textTertiary }}>
                      {(row.val ?? 0) > 0 ? formatCurrency(row.val) : '—'}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 2, borderTopColor: '#DC2626' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>Total Deductions</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#DC2626' }}>
                    {formatCurrency((selectedItem.pf || 0) + (selectedItem.esi || 0) + (selectedItem.professionalTax || 0) + (selectedItem.tds || 0) + (selectedItem.loanDeduction || 0) + (selectedItem.otherDeductions || 0) || selectedItem.totalDeductions || 0)}
                  </Text>
                </View>
              </View>
            )}

            {detailTab === 'takehome' && (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                  <Text style={{ fontSize: 13, color: '#059669' }}>Total earnings</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: (selectedItem.grossSalary || 0) > 0 ? '#059669' : colors.textTertiary }}>
                    {(selectedItem.grossSalary || 0) > 0 ? formatCurrency(selectedItem.grossSalary || 0) : '—'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                  <Text style={{ fontSize: 13, color: '#DC2626' }}>Total deductions</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: (selectedItem.totalDeductions || 0) > 0 ? '#DC2626' : colors.textTertiary }}>
                    {(selectedItem.totalDeductions || 0) > 0 ? formatCurrency(selectedItem.totalDeductions || 0) : '—'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 2, borderTopColor: '#2563EB' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>Take Home</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#2563EB' }}>
                    {formatCurrency(selectedItem.netSalary || 0)}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[adminStyles.saveBtn, { marginTop: 16 }, downloadingId === selectedItem.id && { opacity: 0.6 }]}
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
