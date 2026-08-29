import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Badge, EmptyState, Avatar, Divider } from '../components/UI';
import { useApiData, normalizeResponse } from '../hooks/useApiData';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminMonthRow, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const createLocalStyles = (colors) => ({
  payAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailName: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.dangerSurface, alignItems: 'center', borderWidth: 1, borderColor: colors.danger + '30' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  approveBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.successSurface, alignItems: 'center', borderWidth: 1, borderColor: colors.success + '30' },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: colors.success },
  voidBtn: { backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  voidBtnText: { fontSize: 14, fontWeight: '700', color: '#DC2626' } });
const TABS = [
  { key: 'run', label: 'Run Payroll' },
  { key: 'review', label: 'Review' },
  { key: 'history', label: 'History' },
];

const REVIEW_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
];

const PayrollScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [tab, setTab] = useState('run');
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [submitting, setSubmitting] = useState(false);
  const [reviewFilter, setReviewFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);

  const isModalOpen = !!selectedItem;

  const { data: payrollRecords, loading, refreshing, refresh } = useApiData(
    async () => {
      const res = await api.get('/payroll', { params: { month: selectedMonth } });
      return normalizeResponse(res);
    },
    [selectedMonth]
  );

  useEffect(() => { refresh(); }, [selectedMonth]);

  const closeModal = () => setSelectedItem(null);

  const handleRunPayroll = async () => {
    Alert.alert('Run Payroll', `Generate payroll for ${selectedMonth}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Run', onPress: async () => {
        setSubmitting(true);
        try {
          await api.post('/payroll/run', { month: selectedMonth });
          Alert.alert('Success', 'Payroll generated successfully.');
          refresh();
        } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
        finally { setSubmitting(false); }
      }},
    ]);
  };

  const handleApprove = () => {
    if (!selectedItem) return;
    Alert.alert('Approve', `Approve payroll for ${selectedItem.employee_name || 'employee'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try { await api.put(`/payroll/${selectedItem.id}/status`, { status: 'approved' }); closeModal(); refresh(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleReject = () => {
    if (!selectedItem) return;
    Alert.alert('Reject', `Reject payroll for ${selectedItem.employee_name || 'employee'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        try { await api.put(`/payroll/${selectedItem.id}/status`, { status: 'cancelled' }); closeModal(); refresh(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleVoid = () => {
    if (!selectedItem) return;
    Alert.alert('Void', `Void payroll for ${selectedItem.employee_name || 'employee'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Void', style: 'destructive', onPress: async () => {
        try { await api.put(`/payroll/${selectedItem.id}/void`); closeModal(); refresh(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const records = payrollRecords || [];
  const filteredPayroll = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.employee_name || '').toLowerCase().includes(q) || (r.status || '').toLowerCase().includes(q);
  });

  const reviewRecords = filteredPayroll.filter((r) => reviewFilter === 'all' || r.status === reviewFilter);
  const currentData = tab === 'review' ? reviewRecords : filteredPayroll;

  const totalEarnings = records.reduce((s, r) => s + (parseFloat(r.basic_salary || r.gross_pay || 0) || 0), 0);
  const totalDeductions = records.reduce((s, r) => s + (parseFloat(r.total_deductions || 0) || 0), 0);
  const pendingCount = records.filter((r) => r.status === 'pending_approval').length;

  const deptName = (r) => (typeof r.department === 'object' ? r.department?.name : r.department) || 'N/A';
  const desigName = (r) => (typeof r.designation === 'object' ? r.designation?.name : r.designation) || 'N/A';

  const renderFooter = () => {
    if (!selectedItem) return null;
    if (tab === 'review' && selectedItem.status === 'pending_approval') {
      return (
        <View style={localStyles.modalActions}>
          <TouchableOpacity style={localStyles.rejectBtn} onPress={handleReject}>
            <Text style={localStyles.rejectBtnText}>✕ Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={localStyles.approveBtn} onPress={handleApprove}>
            <Text style={localStyles.approveBtnText}>✓ Approve</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (tab === 'history' && selectedItem.status !== 'void' && selectedItem.status !== 'paid') {
      return (
        <TouchableOpacity style={localStyles.voidBtn} onPress={handleVoid}>
          <Text style={localStyles.voidBtnText}>Void Payroll</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Payroll" subtitle="Process and manage payroll" showBack />
        <View style={adminStyles.body}>
          <AdminMonthRow value={selectedMonth} onChange={setSelectedMonth} />
          <AdminStatRow stats={[
            { val: `${(totalEarnings / 1000).toFixed(0)}K`, label: 'Earnings', color: '#2563EB', bg: '#DBEAFE' },
            { val: `${(totalDeductions / 1000).toFixed(0)}K`, label: 'Deductions', color: '#DC2626', bg: '#FEE2E2' },
            { val: pendingCount, label: 'Pending', color: '#D97706', bg: '#FEF3C7' },
            { val: records.filter((r) => r.status === 'paid').length, label: 'Paid', color: '#10B981', bg: '#DCFCE7' },
          ]} />
          <AdminTabPills tabs={TABS} active={tab} onChange={(t) => { setTab(t); closeModal(); }} />

          {tab === 'run' && (
            <TouchableOpacity
              style={[adminStyles.saveBtn, submitting && { opacity: 0.6 }, { marginBottom: 16 }]}
              onPress={handleRunPayroll}
              disabled={submitting}
            >
              <Ionicons name="flash" size={20} color="#FFF" />
              <Text style={adminStyles.saveBtnText}>{submitting ? 'Running...' : 'Run Payroll'}</Text>
            </TouchableOpacity>
          )}

          {tab === 'review' && <AdminTabPills tabs={REVIEW_FILTERS} active={reviewFilter} onChange={setReviewFilter} />}
          {(tab === 'history' || tab === 'review') && (
            <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search payroll..." />
          )}

          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : currentData.length === 0 ? (
            <EmptyState icon="📊" title="No payroll records" message={`Run payroll for ${selectedMonth}.`} />
          ) : (
            currentData.map((r) => (
              <AdminListCard key={r.id} onPress={() => setSelectedItem(r)}>
                <Avatar firstName={r.employee_name?.split(' ')[0]} lastName={r.employee_name?.split(' ').slice(1).join(' ')} size={40} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={adminStyles.listTitle}>{r.employee_name || `EMP-${r.employee_id}`}</Text>
                  <Text style={adminStyles.listSub}>{deptName(r)} • {desigName(r)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={localStyles.payAmount}>{parseFloat(r.basic_salary || r.gross_pay || 0).toLocaleString()}</Text>
                  <Badge status={r.status === 'paid' ? 'paid' : r.status === 'pending_approval' ? 'pending' : 'approved'} label={r.status} size="sm" />
                </View>
              </AdminListCard>
            ))
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle="Payroll Detail"
        onClose={closeModal}
        showEdit={false}
        showDelete={false}
        footerContent={renderFooter()}
        viewContent={selectedItem && (
          <>
            <View style={localStyles.detailRow}>
              <Avatar firstName={selectedItem.employee_name?.split(' ')[0]} lastName={selectedItem.employee_name?.split(' ').slice(1).join(' ')} size={48} />
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={localStyles.detailName}>{selectedItem.employee_name || `EMP-${selectedItem.employee_id}`}</Text>
                <Text style={adminStyles.listSub}>{deptName(selectedItem)} • {desigName(selectedItem)}</Text>
              </View>
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <AdminDetailRows rows={[
              { label: 'Month', value: selectedItem.month || selectedMonth, valueStyle: { textTransform: 'none' } },
              { label: 'Basic', value: parseFloat(selectedItem.basic_salary || 0).toLocaleString(), valueStyle: { textTransform: 'none' } },
              { label: 'Gross', value: parseFloat(selectedItem.gross_pay || selectedItem.basic_salary || 0).toLocaleString(), valueStyle: { textTransform: 'none' } },
              { label: 'Deductions', value: parseFloat(selectedItem.total_deductions || 0).toLocaleString(), valueStyle: { textTransform: 'none' } },
              { label: 'Net Pay', value: parseFloat(selectedItem.net_pay || selectedItem.basic_salary || 0).toLocaleString(), valueStyle: { textTransform: 'none' } },
              { label: 'Status', value: selectedItem.status },
            ]} />
          </>
        )}
      />
    </View>
  );
};


export default PayrollScreen;
