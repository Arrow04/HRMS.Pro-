import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Badge, EmptyState } from '../components/UI';
import {
  useAdminStyles,
  AdminHeader,
  AdminStatRow,
  AdminTabPills,
  AdminSearchBar,
  AdminListCard,
  AdminCrudSheet,
  AdminFieldLabel,
  AdminInput,
  AdminPillGrid,
  AdminDateRow,
  AdminDetailRows,
  scrollViewTopBarProps,
  useScrollTopBar } from '../components/AdminScreenKit';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const emptyForm = {
  leaveTypeId: null,
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  reason: '' };

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const statusColor = (status) => {
  if (status === 'approved') return '#10B981';
  if (status === 'rejected') return '#DC2626';
  return '#F59E0B';
};

const LeaveRequestScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const { user } = useAuth();

  const employeeId = user?.employeeId ?? user?.employee_id;

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const isModalOpen = !!selectedItem || isCreating;

  const fetchData = useCallback(async () => {
    try {
      const params = employeeId ? { employeeId } : {};
      const [typesRes, leavesRes] = await Promise.allSettled([
        api.get('/leave-types'),
        api.get('/leaves', { params }),
      ]);
      if (typesRes.status === 'fulfilled') {
        const d = typesRes.value.data;
        setLeaveTypes(d?.data || d?.items || (Array.isArray(d) ? d : []));
      }
      if (leavesRes.status === 'fulfilled') {
        const d = leavesRes.value.data;
        setLeaves(d?.data || d?.items || (Array.isArray(d) ? d : []));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const closeModal = () => {
    setSelectedItem(null);
    setIsCreating(false);
    setForm({ ...emptyForm });
  };

  const openCreate = () => {
    setSelectedItem(null);
    setForm({ ...emptyForm });
    setIsCreating(true);
  };

  const openDetail = (leave) => {
    setSelectedItem(leave);
    setIsCreating(false);
  };

  const handleSubmit = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.reason.trim()) {
      Alert.alert('Missing fields', 'Select leave type, dates, and enter a reason.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/leaves', {
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        reason: form.reason.trim() });
      Alert.alert('Submitted', 'Your leave request has been sent for approval.');
      closeModal();
      fetchData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const typeOptions = leaveTypes.map((lt) => ({
    value: lt.id,
    label: lt.name || lt.code || 'Leave' }));

  const pendingCount = leaves.filter((l) => l.status === 'pending').length;
  const approvedCount = leaves.filter((l) => l.status === 'approved').length;
  const rejectedCount = leaves.filter((l) => l.status === 'rejected').length;

  const filteredLeaves = leaves.filter((leave) => {
    if (statusTab !== 'all' && leave.status !== statusTab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const typeName = (leave.leaveTypeName || leave.type || '').toLowerCase();
    const reason = (leave.reason || '').toLowerCase();
    return typeName.includes(q) || reason.includes(q) || (leave.startDate || '').includes(q);
  });

  const leaveTitle = (leave) => leave.leaveTypeName || leave.type || 'Leave';
  const dateRange = (leave) => {
    const start = formatDate(leave.startDate);
    const end = formatDate(leave.endDate);
    return end && end !== start ? `${start} → ${end}` : start;
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
          title="Leave"
          subtitle="Apply and track your time off"
          onAdd={openCreate}
          showBack={navigation?.canGoBack?.() ?? false}
        />

        <View style={adminStyles.body}>
          {leaveTypes.length > 0 && (
            <>
              <Text style={adminStyles.sectionLabel}>Leave balance</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 4, marginBottom: 12 }}
              >
                {leaveTypes.map((lt) => (
                  <View
                    key={lt.id}
                    style={{
                      minWidth: 108,
                      backgroundColor: colors.surface,
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: colors.borderLight,
                      alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>
                      {lt.balance ?? lt.totalDays ?? 0}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginTop: 4, textAlign: 'center' }} numberOfLines={2}>
                      {lt.name || lt.code}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          <AdminStatRow
            stats={[
              { val: leaves.length, label: 'Total', color: '#2563EB', bg: '#DBEAFE' },
              { val: pendingCount, label: 'Pending', color: '#D97706', bg: '#FEF3C7' },
              { val: approvedCount, label: 'Approved', color: '#10B981', bg: '#DCFCE7' },
              { val: rejectedCount, label: 'Rejected', color: '#DC2626', bg: '#FEE2E2' },
            ]}
          />

          <AdminTabPills tabs={STATUS_TABS} active={statusTab} onChange={setStatusTab} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search leave requests..." />

          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : filteredLeaves.length === 0 ? (
            <EmptyState icon="📅" title="No leave requests" message="Tap + to apply for leave." />
          ) : (
            filteredLeaves.map((leave) => (
              <AdminListCard key={leave.id} onPress={() => openDetail(leave)}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: colors.primarySurface,
                    alignItems: 'center',
                    justifyContent: 'center' }}
                >
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={adminStyles.listTitle}>{leaveTitle(leave)}</Text>
                  <Text style={adminStyles.listSub}>{dateRange(leave)}</Text>
                  {leave.reason ? (
                    <Text style={adminStyles.listSub} numberOfLines={1}>{leave.reason}</Text>
                  ) : null}
                </View>
                <Badge status={leave.status} size="sm" />
              </AdminListCard>
            ))
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle="Leave Request"
        createTitle="Apply for Leave"
        onClose={closeModal}
        isEditing={isCreating}
        isCreating={isCreating}
        onSave={handleSubmit}
        saving={submitting}
        saveLabel="Submit Request"
        showEdit={false}
        showDelete={false}
        viewContent={selectedItem && (
          <AdminDetailRows
            rows={[
              { label: 'Leave type', value: leaveTitle(selectedItem), valueStyle: { textTransform: 'none' } },
              { label: 'Start date', value: formatDate(selectedItem.startDate), valueStyle: { textTransform: 'none' } },
              { label: 'End date', value: formatDate(selectedItem.endDate || selectedItem.startDate), valueStyle: { textTransform: 'none' } },
              { label: 'Status', value: selectedItem.status, valueStyle: { color: statusColor(selectedItem.status) } },
              { label: 'Reason', value: selectedItem.reason || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
            ]}
          />
        )}
      >
        <AdminFieldLabel>Leave type *</AdminFieldLabel>
        <AdminPillGrid
          options={typeOptions}
          value={form.leaveTypeId}
          onChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}
        />
        <AdminFieldLabel>Start date *</AdminFieldLabel>
        <AdminDateRow value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} />
        <AdminFieldLabel>End date</AdminFieldLabel>
        <AdminDateRow value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
        <AdminFieldLabel>Reason *</AdminFieldLabel>
        <AdminInput
          value={form.reason}
          onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
          placeholder="Reason for leave"
          multiline
          style={{ height: 88, textAlignVertical: 'top' }}
        />
      </AdminCrudSheet>
    </View>
  );
};

export default LeaveRequestScreen;

