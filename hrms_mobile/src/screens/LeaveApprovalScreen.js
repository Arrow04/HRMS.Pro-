import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useAuth } from '../context/AuthContext';
import { radii, spacing, shadows } from '../theme';
import { Card, Badge, EmptyState, SkeletonCard, GradientButton, Avatar, Divider } from '../components/UI';
import { StatBox, TabPill } from '../components/Charts';
import { AdminModalShell, scrollViewTopBarProps, useScrollTopBar, bannerShellStyle } from '../components/AdminScreenKit';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: '#4F46E5', paddingTop: 16, paddingBottom: spacing.xxl, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(129,140,248,0.2)', bottom: -10, left: 30 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  body: { padding: spacing.xl },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.input, padding: 12, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  addBtn: { backgroundColor: colors.primary, borderRadius: radii.button, paddingHorizontal: 16, justifyContent: 'center', shadowColor: '#1C64F2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 4, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  approveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.successSurface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.successBorder },
  approveBtnText: { fontSize: 16, color: colors.success, fontWeight: '700' },
  rejectBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center' },
  rejectBtnText: { fontSize: 16, color: '#FFF', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xxl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 20, color: colors.textTertiary, padding: 4 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginLeft: 2 },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.input, padding: 12, marginBottom: 14, fontSize: 14, color: colors.text },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  typeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeBtnText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  typeBtnTextActive: { color: '#FFF' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '500', color: colors.text, textAlign: 'right', marginLeft: 16 } });
const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'all', label: 'All Requests' },
  { key: 'my', label: 'My Leaves' },
];

const LeaveApprovalScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const { user } = useAuth();
  const isAdmin = ['admin', 'superadmin', 'hr_admin', 'hr_manager'].includes(user?.role);
  const [tab, setTab] = useState(isAdmin ? 'pending' : 'my');
  const [leaves, setLeaves] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [applyType, setApplyType] = useState('');
  const [applyStart, setApplyStart] = useState('');
  const [applyEnd, setApplyEnd] = useState('');
  const [applyReason, setApplyReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [lRes, tRes] = await Promise.allSettled([
        api.get('/leaves', { params: { status: 'all' } }),
        api.get('/master-data/leave-types'),
      ]);
      if (lRes.status === 'fulfilled') {
        const d = lRes.value.data;
        setLeaves(d?.data || d?.items || (Array.isArray(d) ? d : []));
      }
      if (tRes.status === 'fulfilled') {
        const d = tRes.value.data;
        setLeaveTypes(d?.data || d?.items || (Array.isArray(d) ? d : []));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

  const handleApply = async () => {
    if (!applyType || !applyStart || !applyEnd) { Alert.alert('Error', 'Type, start and end dates required.'); return; }
    setSubmitting(true);
    try {
      await api.post('/leaves', {
        leave_type: applyType, start_date: applyStart, end_date: applyEnd, reason: applyReason.trim() });
      Alert.alert('Success', 'Leave request submitted.');
      setShowApply(false); setApplyType(''); setApplyStart(''); setApplyEnd(''); setApplyReason('');
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSubmitting(false); }
  };

  const handleApprove = (leave) => {
    Alert.alert('Approve', `Approve leave for ${leave.employee_name || 'employee'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try { await api.put(`/leaves/${leave.id}/approve`); fetchData(); } catch (e) { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const openReject = (leave) => { setRejectingId(leave.id); setRejectReason(''); setShowRejectModal(true); };

  const handleReject = async () => {
    if (!rejectReason.trim()) { Alert.alert('Error', 'Rejection reason required.'); return; }
    setSubmitting(true);
    try {
      await api.put(`/leaves/${rejectingId}/reject`, { reason: rejectReason.trim() });
      Alert.alert('Success', 'Leave rejected.');
      setShowRejectModal(false); fetchData();
    } catch (e) { Alert.alert('Error', 'Failed.'); }
    finally { setSubmitting(false); }
  };

  const handleCancel = (leave) => {
    Alert.alert('Cancel', 'Cancel this leave request?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        try { await api.put(`/leaves/${leave.id}/cancel`); fetchData(); } catch (e) { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const filteredLeaves = leaves.filter(l => {
    const q = search.toLowerCase();
    const typeName = typeof l.leave_type === 'object' ? l.leave_type?.name : l.leave_type;
    const matchSearch = !q || (l.employee_name || '').toLowerCase().includes(q) || (typeName || l.leaveTypeName || '').toLowerCase().includes(q) || (l.reason || '').toLowerCase().includes(q);
    if (tab === 'pending') return matchSearch && l.status === 'pending';
    if (tab === 'my') return matchSearch && (l.employee_id === user?.employeeId || l.employee_id === user?.id);
    return matchSearch;
  });

  const pendingCount = leaves.filter(l => l.status === 'pending').length;
  const approvedCount = leaves.filter(l => l.status === 'approved').length;
  const myLeaves = leaves.filter(l => l.employee_id === user?.employeeId || l.employee_id === user?.id);

  const getDays = (s, e) => {
    if (!s || !e) return 0;
    const diff = (new Date(e) - new Date(s)) / (1000 * 60 * 60 * 24) + 1;
    return Math.max(1, Math.round(diff));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} {...scrollViewTopBarProps(scrollTopBar)} refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
        <View style={styles.heroOrb1} /><View style={styles.heroOrb2} />
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Leave Management</Text>
          <Text style={styles.heroSub}>Apply, approve & track leaves</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.statRow}>
          <StatBox icon="⏳" value={pendingCount} label="Pending" color={colors.warning} />
          <StatBox icon="✅" value={approvedCount} label="Approved" color={colors.success} />
          <StatBox icon="📝" value={myLeaves.length} label="My Leaves" color={colors.primary} />
          <StatBox icon="🏖️" value={leaveTypes.length} label="Types" color={colors.info} />
        </View>

        <TabPill tabs={TABS} active={tab} onChange={t => { setTab(t); setSearch(''); }} />

        <View style={styles.searchRow}>
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="🔍  Search leaves..." placeholderTextColor={colors.textTertiary} />
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowApply(true)}><Text style={styles.addBtnText}>+ Apply</Text></TouchableOpacity>
        </View>

        {loading ? <SkeletonCard /> : filteredLeaves.length === 0 ? (
          <EmptyState icon="🏖️" title="No leaves" message={tab === 'pending' ? 'No pending requests.' : tab === 'my' ? 'No leave requests yet.' : 'No leaves found.'} />
        ) : (
          filteredLeaves.map((l, i) => (
            <TouchableOpacity key={l.id || i} onPress={() => setDetailItem(l)} activeOpacity={0.7}>
              <Card>
                <View style={styles.itemRow}>
                  <Avatar firstName={l.employee_name?.split(' ')[0]} lastName={l.employee_name?.split(' ').slice(1).join(' ')} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{l.employee_name || `EMP-${l.employee_id}`}</Text>
                    <Text style={styles.itemSub}>{typeof l.leave_type === 'object' ? l.leave_type?.name : l.leave_type || l.leaveTypeName || 'Leave'} • {getDays(l.start_date, l.end_date)} day{getDays(l.start_date, l.end_date) > 1 ? 's' : ''}</Text>
                    <Text style={styles.itemSub}>{l.start_date} → {l.end_date}</Text>
                    {l.reason && <Text style={styles.itemDesc} numberOfLines={2}>{l.reason}</Text>}
                    <View style={styles.badgeRow}>
                      <Badge status={l.status === 'approved' ? 'approved' : l.status === 'rejected' ? 'rejected' : l.status === 'cancelled' ? 'inactive' : 'pending'} label={l.status} size="sm" />
                    </View>
                  </View>
                  {isAdmin && l.status === 'pending' && (
                    <View style={{ gap: spacing.xs }}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(l)}><Text style={styles.approveBtnText}>✓</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => openReject(l)}><Text style={styles.rejectBtnText}>✕</Text></TouchableOpacity>
                    </View>
                  )}
                  {!isAdmin && l.status === 'pending' && (
                    <TouchableOpacity onPress={() => handleCancel(l)}>
                      <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </View>

      <AdminModalShell visible={showApply} onClose={() => setShowApply(false)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply for Leave</Text>
              <TouchableOpacity onPress={() => setShowApply(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Leave Type *</Text>
            <View style={styles.typeRow}>
              {(leaveTypes.length > 0 ? leaveTypes : [{ name: 'Annual' }, { name: 'Sick' }, { name: 'Personal' }, { name: 'Maternity' }]).map(t => (
                <TouchableOpacity key={t.name || t.id} style={[styles.typeBtn, applyType === (t.name || t.id) && styles.typeBtnActive]} onPress={() => setApplyType(t.name || t.id)}>
                  <Text style={[styles.typeBtnText, applyType === (t.name || t.id) && styles.typeBtnTextActive]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Start Date *</Text>
            <TextInput style={styles.input} value={applyStart} onChangeText={setApplyStart} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
            <Text style={styles.inputLabel}>End Date *</Text>
            <TextInput style={styles.input} value={applyEnd} onChangeText={setApplyEnd} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
            <Text style={styles.inputLabel}>Reason</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={applyReason} onChangeText={setApplyReason} placeholder="Reason for leave" placeholderTextColor={colors.textTertiary} multiline />
            <GradientButton title="Submit Request" onPress={handleApply} loading={submitting} />
      </AdminModalShell>

      <AdminModalShell visible={showRejectModal} onClose={() => setShowRejectModal(false)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Leave</Text>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Reason for Rejection *</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={rejectReason} onChangeText={setRejectReason} placeholder="Why is this leave being rejected?" placeholderTextColor={colors.textTertiary} multiline />
            <GradientButton title="Reject Leave" variant="danger" onPress={handleReject} loading={submitting} />
      </AdminModalShell>

      <AdminModalShell visible={!!detailItem} onClose={() => setDetailItem(null)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Leave Details</Text>
              <TouchableOpacity onPress={() => setDetailItem(null)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {detailItem && (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Employee</Text>
                  <Text style={styles.detailValue}>{detailItem.employee_name || `#${detailItem.employee_id}`}</Text>
                </View>
                <Divider />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>{typeof detailItem.leave_type === 'object' ? detailItem.leave_type?.name : detailItem.leave_type || detailItem.leaveTypeName || 'Leave'}</Text>
                </View>
                <Divider />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={styles.detailValue}>{detailItem.start_date} → {detailItem.end_date} ({getDays(detailItem.start_date, detailItem.end_date)}d)</Text>
                </View>
                <Divider />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                   <Badge status={detailItem.status} label={detailItem.status} style={{ alignSelf: 'flex-start' }} />
                </View>
                {detailItem.reason && (
                  <>
                    <Divider />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Reason</Text>
                      <Text style={[styles.detailValue, { flex: 1 }]}>{detailItem.reason}</Text>
                    </View>
                  </>
                )}
                {isAdmin && detailItem.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
                    <GradientButton title="Approve" onPress={() => { handleApprove(detailItem); setDetailItem(null); }} style={{ flex: 1 }} />
                    <GradientButton title="Reject" variant="danger" onPress={() => { setDetailItem(null); openReject(detailItem); }} style={{ flex: 1 }} />
                  </View>
                )}
              </>
            )}
      </AdminModalShell>
      </ScrollView>
    </View>
  );
};


export default LeaveApprovalScreen;
