import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { getTimezone } from '../utils/timezone';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii } from '../theme';
import { Avatar, Badge, EmptyState } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const createLocalStyles = (colors) => ({
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  expIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  expIconLg: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  detailHero: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  detailName: { fontSize: 17, fontWeight: '800', color: colors.text },
  detailAmount: { fontSize: 20, fontWeight: '800', color: '#059669', marginTop: 4, marginBottom: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#DC2626' },
  rejectBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: '#059669' },
  approveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  payrollHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -8,
    marginBottom: 12,
    fontWeight: '500' },
  openPayrollBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  openPayrollText: { fontSize: 13, fontWeight: '600', color: colors.primary } });
const TABS = [
  { key: 'leaves', label: 'Leaves' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'attendance', label: 'Attendance' },
];

const parseList = (d) => {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  return [];
};

const empName = (item, type) => {
  if (type === 'leave') {
    if (item.employee_name) return item.employee_name;
    return `${item.employeeFirstName || ''} ${item.employeeLastName || ''}`.trim() || 'Employee';
  }
  if (type === 'payroll') {
    return item.employee_name || item.employeeName || 'Employee';
  }
  return item.employee_name || item.employeeName
    || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Employee';
};

const leaveTypeName = (l) => {
  if (typeof l.leave_type === 'object') return l.leave_type?.name;
  return l.leave_type || l.leaveTypeName || 'Leave';
};

const formatDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: getTimezone() });
  } catch {
    return String(d);
  }
};

const getLeaveDays = (start, end) => {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e - s) / 86400000) + 1);
};

const expTitle = (e) => e.title || e.description || 'Expense';

const payrollPeriod = (p) => {
  const m = p.month;
  const y = p.year;
  if (m && y) {
    return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: getTimezone() });
  }
  return '—';
};

const payrollNet = (p) => parseFloat(p.net_salary ?? p.netSalary ?? p.net_pay ?? p.netPay ?? 0) || 0;

const ApprovalsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [activeTab, setActiveTab] = useState('leaves');
  const [leaves, setLeaves] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [acting, setActing] = useState(false);

  const isModalOpen = !!selectedItem;

  const fetchData = useCallback(async () => {
    try {
      const year = new Date().getFullYear();
      const [leavesRes, expRes, payrollRes, correctionsRes] = await Promise.allSettled([
        api.get('/leaves', { params: { status: 'pending' } }),
        api.get('/expenses', { params: { status: 'pending' } }),
        api.get('/payroll', { params: { year, limit: 500 } }),
        api.get('/attendance/correction-requests', { params: { status: 'pending' } }),
      ]);
      if (leavesRes.status === 'fulfilled') {
        setLeaves(parseList(leavesRes.value.data));
      }
      if (expRes.status === 'fulfilled') {
        setExpenses(parseList(expRes.value.data));
      }
      if (payrollRes.status === 'fulfilled') {
        const pending = parseList(payrollRes.value.data).filter((p) => p.status === 'pending_approval');
        setPayroll(pending);
      }
      if (correctionsRes.status === 'fulfilled') {
        setCorrections(parseList(correctionsRes.value.data));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const closeModal = () => {
    setSelectedItem(null);
    setSelectedType(null);
  };

  const openLeave = (item) => {
    setSelectedItem(item);
    setSelectedType('leave');
  };

  const openExpense = (item) => {
    setSelectedItem(item);
    setSelectedType('expense');
  };

  const openPayroll = (item) => {
    setSelectedItem(item);
    setSelectedType('payroll');
  };

  const openCorrection = (item) => {
    setSelectedItem(item);
    setSelectedType('correction');
  };

  const handleLeaveAction = (action) => {
    if (!selectedItem) return;
    const name = empName(selectedItem, 'leave');
    Alert.alert(
      action === 'approve' ? 'Approve Leave' : 'Reject Leave',
      `${action === 'approve' ? 'Approve' : 'Reject'} leave request for ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'reject' ? 'destructive' : 'default',
              onPress: async () => {
            setActing(true);
            try {
              await api.put(`/leaves/${selectedItem.id}/${action}`);
              Alert.alert('Done', `Leave ${action}d.`);
              closeModal();
              fetchData();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.detail || 'Action failed.');
            } finally {
              setActing(false);
            }
          } },
      ],
    );
  };

  const handleExpenseAction = (action) => {
    if (!selectedItem) return;
    Alert.alert(
      action === 'approve' ? 'Approve Expense' : 'Reject Expense',
      `${action === 'approve' ? 'Approve' : 'Reject'} ₹${Number(selectedItem.amount || 0).toLocaleString()} expense?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            setActing(true);
            try {
              await api.post(`/expenses/${selectedItem.id}/${action}`);
              Alert.alert('Done', `Expense ${action}d.`);
              closeModal();
              fetchData();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.detail || 'Action failed.');
            } finally {
              setActing(false);
            }
          } },
      ],
    );
  };

  const handlePayrollAction = (action) => {
    if (!selectedItem) return;
    const name = empName(selectedItem, 'payroll');
    const amount = payrollNet(selectedItem);
    Alert.alert(
      action === 'approve' ? 'Approve Payroll' : 'Reject Payroll',
      `${action === 'approve' ? 'Approve' : 'Reject'} ₹${amount.toLocaleString()} payroll for ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            setActing(true);
            try {
              await api.put(`/payroll/${selectedItem.id}/status`, {
                status: action === 'approve' ? 'approved' : 'cancelled' });
              Alert.alert('Done', `Payroll ${action === 'approve' ? 'approved' : 'rejected'}.`);
              closeModal();
              fetchData();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.detail || 'Action failed.');
            } finally {
              setActing(false);
            }
          } },
      ],
    );
  };

  const handleCorrectionAction = (action) => {
    if (!selectedItem) return;
    Alert.alert(
      action === 'approve' ? 'Approve Correction' : 'Reject Correction',
      `${action === 'approve' ? 'Approve' : 'Reject'} attendance correction for ${selectedItem.employeeName || 'employee'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            setActing(true);
            try {
              const endpoint = action === 'approve'
                ? `/attendance/correction-requests/${selectedItem.id}/approve`
                : `/attendance/correction-requests/${selectedItem.id}/reject`;
              await api.put(endpoint, { comments: '' });
              Alert.alert('Done', `Correction ${action}d.`);
              closeModal();
              fetchData();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.detail || 'Action failed.');
            } finally {
              setActing(false);
            }
          } },
      ],
    );
  };

  const totalPending = leaves.length + expenses.length + payroll.length + corrections.length;
  const payrollTotal = payroll.reduce((s, p) => s + payrollNet(p), 0);

  const tabCounts = { leaves: leaves.length, expenses: expenses.length, payroll: payroll.length, attendance: corrections.length };
  const tabLabels = TABS.map((t) => ({
    ...t,
    label: `${t.label} (${tabCounts[t.key]})` }));

  const q = search.toLowerCase().trim();
  const filteredLeaves = leaves.filter((l) => {
    if (!q) return true;
    const name = empName(l, 'leave').toLowerCase();
    const type = leaveTypeName(l).toLowerCase();
    const reason = (l.reason || '').toLowerCase();
    return name.includes(q) || type.includes(q) || reason.includes(q);
  });

  const filteredExpenses = expenses.filter((e) => {
    if (!q) return true;
    const name = empName(e, 'expense').toLowerCase();
    const title = expTitle(e).toLowerCase();
    const cat = (e.category || '').toLowerCase();
    return name.includes(q) || title.includes(q) || cat.includes(q);
  });

  const filteredPayroll = payroll.filter((p) => {
    if (!q) return true;
    const name = empName(p, 'payroll').toLowerCase();
    const period = payrollPeriod(p).toLowerCase();
    return name.includes(q) || period.includes(q);
  });

  const filteredCorrections = corrections.filter((c) => {
    if (!q) return true;
    const name = (c.employeeName || '').toLowerCase();
    const reason = (c.reason || '').toLowerCase();
    return name.includes(q) || reason.includes(q);
  });

  const runAction = (action) => {
    if (selectedType === 'leave') handleLeaveAction(action);
    else if (selectedType === 'expense') handleExpenseAction(action);
    else if (selectedType === 'payroll') handlePayrollAction(action);
    else if (selectedType === 'correction') handleCorrectionAction(action);
  };

  const approvalFooter = (
    <View style={localStyles.modalActions}>
      <TouchableOpacity
        style={localStyles.rejectBtn}
        onPress={() => runAction('reject')}
        disabled={acting}
      >
        <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
        <Text style={localStyles.rejectBtnText}>Reject</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={localStyles.approveBtn}
        onPress={() => runAction('approve')}
        disabled={acting}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
        <Text style={localStyles.approveBtnText}>Approve</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader
          navigation={navigation}
          title="Approvals"
          subtitle="Review pending leave, expense, payroll & attendance requests"
        />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: totalPending, label: 'Total Pending', color: '#2563EB', bg: '#DBEAFE' },
            { val: leaves.length, label: 'Leaves', color: '#7C3AED', bg: '#EDE9FE' },
            { val: expenses.length, label: 'Expenses', color: '#D97706', bg: '#FEF3C7' },
            { val: corrections.length, label: 'Attendance', color: '#3B82F6', bg: '#DBEAFE' },
          ]} />
          {payrollTotal > 0 && (
            <Text style={localStyles.payrollHint}>
              Payroll queue: ₹{payrollTotal.toLocaleString()} net pay pending approval
            </Text>
          )}

          <AdminTabPills tabs={tabLabels} active={activeTab} onChange={setActiveTab} />
          <AdminSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={
              activeTab === 'leaves' ? 'Search leaves...'
                : activeTab === 'expenses' ? 'Search expenses...'
                  : 'Search payroll...'
            }
          />

          {loading ? (
            <View>{[1, 2, 3, 4].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : activeTab === 'leaves' ? (
            filteredLeaves.length === 0 ? (
              <EmptyState icon="✅" title="No pending leaves" message="All leave requests have been reviewed." />
            ) : (
              filteredLeaves.map((item) => {
                const name = empName(item, 'leave');
                const days = getLeaveDays(item.start_date || item.startDate, item.end_date || item.endDate);
                return (
                  <AdminListCard key={item.id} onPress={() => openLeave(item)}>
                    <Avatar firstName={name.split(' ')[0]} lastName={name.split(' ').slice(1).join(' ')} size={44} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={adminStyles.listTitle}>{name}</Text>
                      <Text style={adminStyles.listSub}>{leaveTypeName(item)} · {days} day{days > 1 ? 's' : ''}</Text>
                      <Text style={adminStyles.listSub}>
                        {formatDate(item.start_date || item.startDate)} → {formatDate(item.end_date || item.endDate)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Badge status="pending" size="sm" style={{ alignSelf: 'flex-start' }} />
                      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </View>
                  </AdminListCard>
                );
              })
            )
          ) : activeTab === 'expenses' ? (
            filteredExpenses.length === 0 ? (
              <EmptyState icon="✅" title="No pending expenses" message="All expense claims have been reviewed." />
            ) : (
              filteredExpenses.map((item) => {
                const name = empName(item, 'expense');
                return (
                  <AdminListCard key={item.id} onPress={() => openExpense(item)}>
                    <View style={[localStyles.expIcon, { backgroundColor: '#F59E0B18' }]}>
                      <Ionicons name="receipt-outline" size={22} color="#D97706" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={adminStyles.listTitle}>{expTitle(item)}</Text>
                      <Text style={adminStyles.listSub}>{name}</Text>
                      <Text style={adminStyles.listSub}>{item.category || 'General'} · {formatDate(item.date || item.expense_date)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={localStyles.amount}>₹{Number(item.amount || 0).toLocaleString()}</Text>
                      <Badge status={item.status || 'pending'} size="sm" />
                    </View>
                  </AdminListCard>
                );
              })
            )
          ) : activeTab === 'attendance' ? (
            filteredCorrections.length === 0 ? (
              <EmptyState icon="✅" title="No pending corrections" message="All attendance correction requests have been reviewed." />
            ) : (
              filteredCorrections.map((item) => (
                <AdminListCard key={item.id} onPress={() => openCorrection(item)}>
                  <View style={[localStyles.expIcon, { backgroundColor: '#3B82F618' }]}>
                    <Ionicons name="construct-outline" size={22} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listTitle}>{item.employeeName || 'Employee'}</Text>
                    <Text style={adminStyles.listSub}>Request date: {formatDate(item.requestDate)}</Text>
                    <Text style={adminStyles.listSub}>
                      {item.requestedCheckIn ? `In: ${new Date(item.requestedCheckIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
                      {item.requestedCheckOut ? `  Out: ${new Date(item.requestedCheckOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Badge status={item.status || 'pending'} size="sm" />
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                  </View>
                </AdminListCard>
              ))
            )
          ) : filteredPayroll.length === 0 ? (
            <EmptyState icon="✅" title="No pending payroll" message="All payroll records are approved." />
          ) : (
            filteredPayroll.map((item) => {
              const name = empName(item, 'payroll');
              return (
                <AdminListCard key={item.id} onPress={() => openPayroll(item)}>
                  <View style={[localStyles.expIcon, { backgroundColor: '#05966918' }]}>
                    <Ionicons name="cash-outline" size={22} color="#059669" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listTitle}>{name}</Text>
                    <Text style={adminStyles.listSub}>{payrollPeriod(item)}</Text>
                    <Text style={adminStyles.listSub}>
                      {(item.department_name || item.departmentName || item.department) || 'Payroll'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={localStyles.amount}>₹{payrollNet(item).toLocaleString()}</Text>
                    <Badge status="pending_approval" size="sm" />
                  </View>
                </AdminListCard>
              );
            })
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle={
          selectedType === 'leave' ? 'Leave Request'
            : selectedType === 'expense' ? 'Expense Claim'
              : selectedType === 'correction' ? 'Attendance Correction'
                : 'Payroll Approval'
        }
        onClose={closeModal}
        showEdit={false}
        showDelete={false}
        footerContent={approvalFooter}
        viewContent={selectedItem && selectedType === 'leave' ? (
          <>
            <View style={localStyles.detailHero}>
              <Avatar
                firstName={empName(selectedItem, 'leave').split(' ')[0]}
                lastName={empName(selectedItem, 'leave').split(' ').slice(1).join(' ')}
                size={52}
                premium
              />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={localStyles.detailName}>{empName(selectedItem, 'leave')}</Text>
                <Text style={adminStyles.listSub}>{leaveTypeName(selectedItem)}</Text>
                <Badge status="pending" size="sm" />
              </View>
            </View>
            <AdminDetailRows rows={[
              { label: 'From', value: formatDate(selectedItem.start_date || selectedItem.startDate) },
              { label: 'To', value: formatDate(selectedItem.end_date || selectedItem.endDate) },
              {
                label: 'Duration',
                value: `${getLeaveDays(selectedItem.start_date || selectedItem.startDate, selectedItem.end_date || selectedItem.endDate)} day(s)` },
              { label: 'Reason', value: selectedItem.reason || '—', numberOfLines: 4 },
              { label: 'Applied', value: formatDate(selectedItem.created_at || selectedItem.createdAt) },
            ]} />
          </>
        ) : selectedItem && selectedType === 'expense' ? (
          <>
            <View style={localStyles.detailHero}>
              <View style={[localStyles.expIconLg, { backgroundColor: '#F59E0B18' }]}>
                <Ionicons name="wallet-outline" size={28} color="#D97706" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={localStyles.detailName}>{expTitle(selectedItem)}</Text>
                <Text style={localStyles.detailAmount}>₹{Number(selectedItem.amount || 0).toLocaleString()}</Text>
                <Badge status={selectedItem.status || 'pending'} size="sm" />
              </View>
            </View>
            <AdminDetailRows rows={[
              { label: 'Employee', value: empName(selectedItem, 'expense') },
              { label: 'Category', value: selectedItem.category || 'General' },
              { label: 'Date', value: formatDate(selectedItem.date || selectedItem.expense_date) },
              { label: 'Description', value: selectedItem.description || '—', numberOfLines: 4 },
              { label: 'Submitted', value: formatDate(selectedItem.created_at || selectedItem.createdAt) },
            ]} />
          </>
        ) : selectedItem && selectedType === 'payroll' ? (
          <>
            <View style={localStyles.detailHero}>
              <Avatar
                firstName={empName(selectedItem, 'payroll').split(' ')[0]}
                lastName={empName(selectedItem, 'payroll').split(' ').slice(1).join(' ')}
                size={52}
                premium
              />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={localStyles.detailName}>{empName(selectedItem, 'payroll')}</Text>
                <Text style={localStyles.detailAmount}>₹{payrollNet(selectedItem).toLocaleString()}</Text>
                <Badge status="pending_approval" size="sm" />
              </View>
            </View>
            <AdminDetailRows rows={[
              { label: 'Period', value: payrollPeriod(selectedItem) },
              { label: 'Gross Pay', value: `₹${Number(selectedItem.gross_salary || selectedItem.grossSalary || 0).toLocaleString()}` },
              { label: 'Deductions', value: `₹${Number(selectedItem.total_deductions || selectedItem.totalDeductions || 0).toLocaleString()}` },
              { label: 'Net Pay', value: `₹${payrollNet(selectedItem).toLocaleString()}` },
              { label: 'Present Days', value: String(selectedItem.present_days ?? selectedItem.presentDays ?? '—') },
              { label: 'Status', value: (selectedItem.status || 'pending').replace(/_/g, ' ') },
            ]} />
            <TouchableOpacity
              style={localStyles.openPayrollBtn}
              onPress={() => { closeModal(); navigation.navigate('PayrollAdmin'); }}
            >
              <Text style={localStyles.openPayrollText}>Open Payroll module →</Text>
            </TouchableOpacity>
          </>
        ) : selectedItem && selectedType === 'correction' ? (
          <>
            <View style={localStyles.detailHero}>
              <View style={[localStyles.expIconLg, { backgroundColor: '#3B82F618' }]}>
                <Ionicons name="construct-outline" size={28} color="#3B82F6" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={localStyles.detailName}>{selectedItem.employeeName || 'Employee'}</Text>
                <Text style={adminStyles.listSub}>Attendance Correction Request</Text>
                <Badge status={selectedItem.status || 'pending'} size="sm" />
              </View>
            </View>
            <AdminDetailRows rows={[
              { label: 'Request Date', value: formatDate(selectedItem.requestDate) },
              { label: 'Requested In', value: selectedItem.requestedCheckIn ? new Date(selectedItem.requestedCheckIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—' },
              { label: 'Requested Out', value: selectedItem.requestedCheckOut ? new Date(selectedItem.requestedCheckOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—' },
              { label: 'Requested Status', value: selectedItem.requestedStatus || '—' },
              { label: 'Reason', value: selectedItem.reason || '—', numberOfLines: 4 },
              { label: 'Submitted', value: formatDate(selectedItem.createdAt) },
            ]} />
          </>
        ) : null}
      />
    </View>
  );
};


export default ApprovalsScreen;
