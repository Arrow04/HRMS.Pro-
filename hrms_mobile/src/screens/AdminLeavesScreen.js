import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii, spacing, shadows } from '../theme';
import { Avatar, Badge, Divider, EmptyState, GradientButton } from '../components/UI';
import { AdminModalShell, scrollViewTopBarProps, useScrollTopBar, bannerShellStyle } from '../components/AdminScreenKit';
import { todayISO, dateToISO, getTimezone } from '../utils/timezone';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  headerBg: { backgroundColor: colors.primary, paddingTop: 16, paddingBottom: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  bgOrb: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  addBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  body: { padding: 20 },
  datePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radii.lg, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight },
  dateText: { fontSize: 16, fontWeight: '700', color: colors.text },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statItem: { width: '48%', borderRadius: radii.md, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  tabRow: { gap: 6, marginBottom: 12 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.full, backgroundColor: colors.surfaceSecondary },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#FFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.lg, paddingHorizontal: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
  leaveCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  leaveName: { fontSize: 14, fontWeight: '700', color: colors.text },
  leaveType: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  leaveDates: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 6 },
  approveBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  rejectBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center' },
  skeleton: { height: 80, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary, opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 20, color: colors.textSecondary, fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  detailField: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  detailValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.lg },
  modalActionBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 8 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  empSelectItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.md, marginBottom: 4, backgroundColor: colors.surfaceSecondary },
  empSelectActive: { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary },
  empSelectName: { fontSize: 13, fontWeight: '600', color: colors.text },
  editingEmpBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary + '10', borderRadius: radii.md, padding: 12, marginBottom: 8 },
  editingEmpText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.full, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surfaceSecondary },
  typeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeBtnText: { fontSize: 12, fontWeight: '600', color: colors.text },
  typeBtnTextActive: { color: '#FFF' },
  historyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  historyDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  historyAction: { fontSize: 13, fontWeight: '600', color: colors.text, textTransform: 'capitalize' },
  historyDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  historyReason: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' } });
const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'applied', label: 'Applied' },
  { key: 'all', label: 'All' },
];

const LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave', 'Maternity Leave', 'Paternity Leave', 'Comp Off', 'WFH'];

const AdminLeavesScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [detailItem, setDetailItem] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ employeeId: null, leaveType: 'Casual Leave', startDate: '', endDate: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [historyModal, setHistoryModal] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [leaveRes, empRes] = await Promise.allSettled([
        api.get('/leaves', { params: { status: 'all' } }),
        api.get('/employees', { params: { status: 'active' } }),
      ]);
      if (leaveRes.status === 'fulfilled') setLeaves(leaveRes.value.data?.data || leaveRes.value.data?.items || (Array.isArray(leaveRes.value.data) ? leaveRes.value.data : []));
      if (empRes.status === 'fulfilled') {
        const raw = empRes.value.data?.data || empRes.value.data?.items || [];
        setEmployees(Array.isArray(raw) ? raw : []);
      }
    } catch (e) {
      // Admin leaves fetch failed
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

  const empName = (e) => e?.fullName || `${e?.firstName || e?.first_name || ''} ${e?.lastName || e?.last_name || ''}`.trim() || `EMP-${e?.id}`;

  const handleApprove = async (leave) => {
    Alert.alert('Approve', `Approve leave for ${leave.employee_name || empName(employees.find(e => e.id === leave.employee_id)) || 'employee'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try { await api.put(`/leaves/${leave.id}/approve`); fetchData(); setDetailItem(null); Alert.alert('Success', 'Leave approved.'); } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
      }},
    ]);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try { await api.put(`/leaves/${rejectModal.id}/reject`, { reason: rejectReason.trim() }); fetchData(); setRejectModal(null); setRejectReason(''); setDetailItem(null); Alert.alert('Success', 'Leave rejected.'); } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
  };

  const handleDelete = (leave) => {
    Alert.alert('Delete', `Delete this leave record?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/leaves/${leave.id}`); fetchData(); setDetailItem(null); Alert.alert('Deleted', 'Leave deleted.'); } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
      }},
    ]);
  };

  const openCreateForm = () => {
    const today = todayISO();
    setForm({ employeeId: null, leaveType: 'Casual Leave', startDate: today, endDate: today, reason: '' });
    setEditMode(false);
    setEmpSearch('');
    setShowForm(true);
  };

  const openEditForm = (leave) => {
    setForm({
      id: leave.id,
      employeeId: leave.employee_id,
      leaveType: getLeaveType(leave),
      startDate: leave.start_date || '',
      endDate: leave.end_date || '',
      reason: leave.reason || '' });
    setEditMode(true);
    setDetailItem(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.employeeId) { Alert.alert('Required', 'Select an employee.'); return; }
    if (!form.startDate) { Alert.alert('Required', 'Start date is required.'); return; }
    setSaving(true);
    try {
      const payload = { employeeId: form.employeeId, leaveType: form.leaveType, startDate: form.startDate, endDate: form.endDate || form.startDate, reason: form.reason };
      if (editMode && form.id) {
        await api.put(`/leaves/${form.id}`, payload);
        Alert.alert('Updated', 'Leave updated.');
      } else {
        await api.post('/leaves', payload);
        Alert.alert('Created', 'Leave created.');
      }
      setShowForm(false);
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const showHistory = async (leave) => {
    try {
      const res = await api.get(`/leaves/${leave.id}/history`);
      setHistoryData(res.data || []);
    } catch { setHistoryData([]); }
    setHistoryModal(leave);
    setDetailItem(null);
  };

  const getLeaveType = (l) => typeof l.leave_type === 'object' ? l.leave_type?.name : l.leave_type || l.leaveTypeName || 'Leave';
  const getDays = (s, e) => { if (!s) return 0; const d1 = new Date(s); const d2 = e ? new Date(e) : d1; return Math.max(1, Math.ceil((d2 - d1) / 86400000) + 1); };

  const filtered = leaves.filter(l => {
    const q = search.toLowerCase();
    const typeName = typeof l.leave_type === 'object' ? l.leave_type?.name : l.leave_type;
    const empNameStr = l.employee_name || empName(employees.find(e => e.id === l.employee_id));
    const matchSearch = !q || empNameStr.toLowerCase().includes(q) || (typeName || l.leaveTypeName || '').toLowerCase().includes(q);
    if (activeTab === 'all') return matchSearch;
    return matchSearch && l.status === activeTab;
  });

  const pendingCount = leaves.filter(l => l.status === 'pending').length;
  const approvedCount = leaves.filter(l => l.status === 'approved').length;
  const rejectedCount = leaves.filter(l => l.status === 'rejected').length;
  const appliedCount = leaves.filter(l => l.status === 'submitted' || l.status === 'applied').length;

  const filteredEmpDropdown = employees.filter(e => {
    const q = empSearch.toLowerCase();
    return !q || empName(e).toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} {...scrollViewTopBarProps(scrollTopBar)} refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
      <View style={[styles.headerBg, bannerShellStyle(scrollTopBar)]}>
        <View style={styles.bgOrb} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Leave Management</Text>
            <Text style={styles.headerSub}>Review and manage leave requests</Text>
          </View>
          <TouchableOpacity onPress={openCreateForm} style={styles.addBtn}>
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <TouchableOpacity style={styles.datePickerRow} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.dateText}>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: getTimezone() })}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker value={new Date(selectedDate + 'T00:00:00')} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(_, date) => { setShowDatePicker(false); if (date) setSelectedDate(dateToISO(date)); }} />
        )}

        <View style={styles.statRow}>
          {[
            { val: pendingCount, label: 'Pending', color: '#D97706', bg: '#FEF3C7' },
            { val: approvedCount, label: 'Approved', color: '#10B981', bg: '#DCFCE7' },
            { val: rejectedCount, label: 'Rejected', color: '#DC2626', bg: '#FEE2E2' },
            { val: appliedCount, label: 'Applied', color: '#4F46E5', bg: '#EEF2FF' },
          ].map((s, i) => (
            <View key={i} style={[styles.statItem, { backgroundColor: s.bg }]}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabActive]} onPress={() => setActiveTab(t.key)} activeOpacity={0.7}>
              <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search by employee or type..." placeholderTextColor="#94A3B8" />
        </View>

        {loading ? (
          <View style={{ gap: 8 }}>{[1, 2, 3, 4, 5].map(i => <View key={i} style={styles.skeleton} />)}</View>
        ) : filtered.length === 0 ? (
          <EmptyState icon="🏖️" title="No leave requests" message="No requests match your filter." />
        ) : (
          filtered.map((l, i) => {
            const eName = l.employee_name || empName(employees.find(e => e.id === l.employee_id));
            const eObj = employees.find(e => e.id === l.employee_id);
            return (
              <TouchableOpacity key={l.id || i} style={styles.leaveCard} onPress={() => setDetailItem(l)} activeOpacity={0.7}>
                <Avatar firstName={eObj?.firstName || eObj?.first_name} lastName={eObj?.lastName || eObj?.last_name} size={42} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.leaveName}>{eName}</Text>
                  <Text style={styles.leaveType}>{getLeaveType(l)} • {getDays(l.start_date, l.end_date)} day{getDays(l.start_date, l.end_date) > 1 ? 's' : ''}</Text>
                  <Text style={styles.leaveDates}>{l.start_date} → {l.end_date}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge status={l.status} size="sm" />
                  {l.status === 'pending' && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(l)}>
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectModal(l)}>
                        <Ionicons name="close" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </View>

      {/* Detail Modal */}
      <AdminModalShell visible={!!detailItem} onClose={() => setDetailItem(null)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Leave Details</Text>
              <TouchableOpacity onPress={() => setDetailItem(null)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {detailItem && (
              <>
                <View style={styles.detailRow}>
                  <Avatar firstName={employees.find(e => e.id === detailItem.employee_id)?.firstName} lastName={employees.find(e => e.id === detailItem.employee_id)?.lastName} size={48} />
                  <View style={{ marginLeft: 14, flex: 1 }}>
                    <Text style={styles.detailName}>{detailItem.employee_name || empName(employees.find(e => e.id === detailItem.employee_id))}</Text>
                    <Badge status={detailItem.status} label={detailItem.status} size="sm" />
                  </View>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                {[
                  { label: 'Type', value: getLeaveType(detailItem) },
                  { label: 'Duration', value: `${detailItem.start_date} → ${detailItem.end_date} (${getDays(detailItem.start_date, detailItem.end_date)}d)` },
                  { label: 'Reason', value: detailItem.reason || '—' },
                  { label: 'Applied On', value: detailItem.created_at ? new Date(detailItem.created_at).toLocaleDateString('en-US', { timeZone: getTimezone() }) : '—' },
                  { label: 'Approved By', value: detailItem.approved_by || '—' },
                ].map((row, i) => (
                  <View key={i} style={styles.detailField}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={[styles.detailValue, row.label === 'Reason' && { flex: 1 }]} numberOfLines={2}>{row.value}</Text>
                  </View>
                ))}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  {detailItem.status === 'pending' && (
                    <>
                      <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: '#10B981' }]} onPress={() => handleApprove(detailItem)}>
                        <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                        <Text style={styles.modalActionBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: '#DC2626' }]} onPress={() => { setDetailItem(null); setRejectModal(detailItem); }}>
                        <Ionicons name="close-circle" size={16} color="#FFF" />
                        <Text style={styles.modalActionBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: colors.primary }]} onPress={() => openEditForm(detailItem)}>
                    <Ionicons name="create-outline" size={16} color="#FFF" />
                    <Text style={styles.modalActionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: '#F59E0B' }]} onPress={() => showHistory(detailItem)}>
                    <Ionicons name="time-outline" size={16} color="#FFF" />
                    <Text style={styles.modalActionBtnText}>History</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: '#94A3B8' }]} onPress={() => handleDelete(detailItem)}>
                    <Ionicons name="trash-outline" size={16} color="#FFF" />
                    <Text style={styles.modalActionBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
      </AdminModalShell>

      {/* Reject Reason Modal */}
      <AdminModalShell visible={!!rejectModal} onClose={() => { setRejectModal(null); setRejectReason(''); }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Leave</Text>
              <TouchableOpacity onPress={() => { setRejectModal(null); setRejectReason(''); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Reason for rejection</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={rejectReason} onChangeText={setRejectReason}
              placeholder="Enter reason..." placeholderTextColor="#94A3B8" multiline />
            <GradientButton title="Reject Leave" variant="danger" onPress={handleReject} />
      </AdminModalShell>

      {/* Create / Edit Form Modal */}
      <AdminModalShell visible={showForm} onClose={() => setShowForm(false)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editMode ? 'Edit Leave' : 'Apply Leave'}</Text>
              <TouchableOpacity onPress={() => { setShowForm(false); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {!editMode && (
                <>
                  <Text style={styles.fieldLabel}>Employee *</Text>
                  <View style={styles.searchRow}>
                    <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
                    <TextInput style={styles.searchInput} value={empSearch} onChangeText={setEmpSearch} placeholder="Search employee..." placeholderTextColor="#94A3B8" />
                  </View>
                  <View style={{ maxHeight: 120 }}>
                    <ScrollView>
                      {filteredEmpDropdown.slice(0, 8).map(e => (
                        <TouchableOpacity key={e.id} style={[styles.empSelectItem, form.employeeId === e.id && styles.empSelectActive]} onPress={() => { setForm(f => ({ ...f, employeeId: e.id })); setEmpSearch(empName(e)); }}>
                          <Text style={styles.empSelectName}>{empName(e)}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </>
              )}
              {editMode && (
                <View style={styles.editingEmpBanner}>
                  <Ionicons name="person" size={16} color={colors.primary} />
                  <Text style={styles.editingEmpText}>{employees.find(e => e.id === form.employeeId) ? empName(employees.find(e => e.id === form.employeeId)) : `Employee #${form.employeeId}`}</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>Leave Type</Text>
              <View style={styles.typeGrid}>
                {LEAVE_TYPES.map(t => (
                  <TouchableOpacity key={t} style={[styles.typeBtn, form.leaveType === t && styles.typeBtnActive]} onPress={() => setForm(f => ({ ...f, leaveType: t }))}>
                    <Text style={[styles.typeBtnText, form.leaveType === t && styles.typeBtnTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Start Date *</Text>
              <TextInput style={styles.input} value={form.startDate} onChangeText={v => setForm(f => ({ ...f, startDate: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#94A3B8" />

              <Text style={styles.fieldLabel}>End Date</Text>
              <TextInput style={styles.input} value={form.endDate} onChangeText={v => setForm(f => ({ ...f, endDate: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#94A3B8" />

              <Text style={styles.fieldLabel}>Reason</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={form.reason} onChangeText={v => setForm(f => ({ ...f, reason: v }))} placeholder="Reason for leave..." placeholderTextColor="#94A3B8" multiline />

              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : editMode ? 'Update Leave' : 'Submit Leave'}</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
      </AdminModalShell>

      {/* History Modal */}
      <AdminModalShell visible={!!historyModal} onClose={() => setHistoryModal(null)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approval History</Text>
              <TouchableOpacity onPress={() => setHistoryModal(null)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {historyData.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', padding: 20 }}>No history available.</Text>
            ) : (
              historyData.map((h, i) => (
                <View key={i} style={styles.historyItem}>
                  <View style={[styles.historyDot, { backgroundColor: h.action === 'approved' ? '#10B981' : h.action === 'rejected' ? '#DC2626' : '#F59E0B' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyAction}>{h.action} by {h.action_by_name || `User #${h.action_by}`}</Text>
                    <Text style={styles.historyDate}>{h.created_at ? new Date(h.created_at).toLocaleString('en-US', { timeZone: getTimezone() }) : ''}</Text>
                    {h.reason && <Text style={styles.historyReason}>Reason: {h.reason}</Text>}
                  </View>
                </View>
              ))
            )}
      </AdminModalShell>
      </ScrollView>
    </View>
  );
};


export default AdminLeavesScreen;
