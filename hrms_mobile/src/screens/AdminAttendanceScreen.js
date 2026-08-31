import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch, Platform } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getTimezone, todayISO, dateToISO, fmtTime } from '../utils/timezone';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii, spacing, shadows } from '../theme';
import { Avatar, Badge, Divider, EmptyState } from '../components/UI';
import { AdminModalShell, scrollViewTopBarProps, useScrollTopBar, bannerShellStyle } from '../components/AdminScreenKit';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  headerBg: { backgroundColor: colors.primary, paddingTop: 16, paddingBottom: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  bgOrb: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  closeBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
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
  empCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  empName: { fontSize: 14, fontWeight: '700', color: colors.text },
  empDept: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  timeText: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  skeleton: { height: 70, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary, opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailName: { fontSize: 16, fontWeight: '700', color: colors.text },
  detailDept: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  detailField: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  detailValue: { fontSize: 14, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.full, borderWidth: 1.5, borderColor: colors.borderLight },
  statusBtnText: { fontSize: 12, fontWeight: '700', color: colors.text },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  empSelectItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.md, marginBottom: 4, backgroundColor: colors.surfaceSecondary },
  empSelectActive: { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary },
  empSelectName: { fontSize: 13, fontWeight: '600', color: colors.text },
  editingEmpBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary + '10', borderRadius: radii.md, padding: 12, marginBottom: 8 },
  editingEmpText: { fontSize: 14, fontWeight: '600', color: colors.primary } });
const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'late', label: 'Late' },
  { key: 'leave', label: 'On Leave' },
  { key: 'no_checkout', label: 'No Checkout' },
];

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present', color: '#10B981' },
  { value: 'absent', label: 'Absent', color: '#DC2626' },
  { value: 'late', label: 'Late', color: '#F59E0B' },
  { value: 'half_day', label: 'Half Day', color: '#8B5CF6' },
  { value: 'on_leave', label: 'On Leave', color: '#2563EB' },
  { value: 'wfh', label: 'WFH', color: '#0891B2' },
];

const emptyForm = {
  employeeId: null,
  status: 'present',
  checkIn: '09:00',
  checkOut: '',
  notes: '',
  reason: '',
  isLate: false,
  lateMinutes: 0,
  isEarlyDeparture: false,
  earlyDepartureMinutes: 0 };

const AdminAttendanceScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCheckInPicker, setShowCheckInPicker] = useState(false);
  const [showCheckOutPicker, setShowCheckOutPicker] = useState(false);

  const isModalOpen = !!selectedItem || isCreating;

  const fetchData = useCallback(async () => {
    try {
      const [attRes, empRes] = await Promise.allSettled([
        api.get('/attendance', { params: { startDate: selectedDate, endDate: selectedDate } }),
        api.get('/employees', { params: { status: 'active' } }),
      ]);
      if (attRes.status === 'fulfilled') {
        const raw = attRes.value.data?.data || attRes.value.data || [];
        setRecords(Array.isArray(raw) ? raw.map(r => ({
          ...r,
          checkIn: r.checkIn || r.check_in,
          checkOut: r.checkOut || r.check_out,
          workHours: r.workHours || r.work_hours,
          employeeName: r.employeeName || r.employee_name || '' })) : []);
      }
      if (empRes.status === 'fulfilled') {
        const raw = empRes.value.data?.data || empRes.value.data?.items || [];
        setEmployees(Array.isArray(raw) ? raw : []);
      }
    } catch (e) {}
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedDate]);

  useEffect(() => { setLoading(true); fetchData(); }, [selectedDate]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

  const empName = (e) => e.fullName || `${e.firstName || e.first_name || ''} ${e.lastName || e.last_name || ''}`.trim() || `EMP-${e.id}`;

  const enriched = employees.map(emp => {
    const rec = records.find(r => r.employee_id === emp.id);
    return { ...emp, attendance: rec };
  });

  const filtered = enriched.filter(e => {
    const q = search.toLowerCase();
    const name = empName(e).toLowerCase();
    const dept = typeof e.department === 'object' ? e.department?.name : e.department || '';
    const matchSearch = !q || name.includes(q) || dept.toLowerCase().includes(q);
    if (statusTab === 'all') return matchSearch;
    if (statusTab === 'present') return matchSearch && e.attendance?.status === 'present';
    if (statusTab === 'absent') return matchSearch && !(e.attendance?.check_in || e.attendance?.checkIn);
    if (statusTab === 'late') return matchSearch && e.attendance?.status === 'late';
    if (statusTab === 'leave') return matchSearch && (e.attendance?.status === 'on_leave' || e.attendance?.status === 'leave');
    if (statusTab === 'no_checkout') return matchSearch && !!(e.attendance?.check_in || e.attendance?.checkIn) && !(e.attendance?.check_out || e.attendance?.checkOut);
    return matchSearch;
  });

  const presentCount = enriched.filter(e => e.attendance?.status === 'present').length;
  const absentCount = enriched.filter(e => !(e.attendance?.check_in || e.attendance?.checkIn)).length;
  const lateCount = enriched.filter(e => e.attendance?.status === 'late').length;
  const leaveCount = enriched.filter(e => e.attendance?.status === 'on_leave' || e.attendance?.status === 'leave').length;
  const noCheckoutCount = enriched.filter(e => !!(e.attendance?.check_in || e.attendance?.checkIn) && !(e.attendance?.check_out || e.attendance?.checkOut)).length;

  const openDetail = (emp) => {
    const att = emp.attendance || {};
    const ci = att.check_in || att.checkIn || '';
    const co = att.check_out || att.checkOut || '';
    const status = ci ? (att.status || 'present') : 'absent';
    setSelectedItem({ ...emp, resolvedStatus: status });
    setForm({
      employeeId: emp.id,
      status: att.status || 'present',
      checkIn: ci ? fmtTime(ci).replace(/ [AP]M$/, '').trim() : '09:00',
      checkOut: co ? fmtTime(co).replace(/ [AP]M$/, '').trim() : '',
      notes: att.notes || '',
      reason: att.reason || '',
      isLate: att.is_late || false,
      lateMinutes: att.late_minutes || 0,
      isEarlyDeparture: att.is_early_departure || false,
      earlyDepartureMinutes: att.early_departure_minutes || 0,
      attendanceId: att.id || null });
    setIsEditing(false);
    setIsCreating(false);
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setIsCreating(true);
    setIsEditing(true);
    setSelectedItem(null);
    setEmpSearch('');
  };

  const closeModal = () => {
    setSelectedItem(null);
    setIsEditing(false);
    setIsCreating(false);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!isCreating && !form.employeeId) { Alert.alert('Required', 'Please select an employee.'); return; }
    if (isCreating && !form.employeeId) { Alert.alert('Required', 'Please select an employee.'); return; }
    setSaving(true);
    try {
      const payload = {
        employeeId: form.employeeId,
        date: selectedDate,
        status: form.status,
        checkIn: form.checkIn || null,
        checkOut: form.checkOut || null,
        notes: form.notes || null,
        reason: form.reason || null,
        isLate: form.isLate,
        lateMinutes: form.lateMinutes || 0,
        isEarlyDeparture: form.isEarlyDeparture,
        earlyDepartureMinutes: form.earlyDepartureMinutes || 0 };
      if (!isCreating && form.attendanceId) {
        await api.put(`/attendance/${form.attendanceId}`, payload);
        Alert.alert('Updated', 'Attendance record updated.');
      } else {
        await api.post('/attendance/manual', payload);
        Alert.alert('Created', 'Attendance record created.');
      }
      closeModal();
      fetchData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to save.');
    } finally { setSaving(false); }
  };

  const handleDelete = (item) => {
    const att = item.attendance;
    if (!att?.id) { Alert.alert('Info', 'No attendance record to delete.'); return; }
    Alert.alert('Delete', `Delete attendance for ${empName(item)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/attendance/${att.id}`);
          Alert.alert('Deleted', 'Record deleted.');
          closeModal();
          fetchData();
        } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
      }},
    ]);
  };

  const handleQuickStatus = async (item, newStatus) => {
    const att = item.attendance;
    if (!att?.id) {
      try {
        await api.post('/attendance/manual', { employeeId: item.id, date: selectedDate, status: newStatus, checkIn: '09:00' });
        Alert.alert('Done', `Marked as ${newStatus}.`);
        closeModal();
        fetchData();
      } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
      return;
    }
    try {
      await api.put(`/attendance/${att.id}`, { status: newStatus });
      Alert.alert('Done', `Status changed to ${newStatus}.`);
      closeModal();
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
  };

  const filteredEmpDropdown = employees.filter(e => {
    const q = empSearch.toLowerCase();
    return !q || empName(e).toLowerCase().includes(q);
  });

  const modalTitle = isCreating ? 'Manual Entry' : isEditing ? 'Edit Attendance' : 'Attendance Detail';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={styles.container} {...scrollViewTopBarProps(scrollTopBar)} refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        <View style={[styles.headerBg, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.bgOrb} />
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Attendance</Text>
              <Text style={styles.headerSub}>Manage employee attendance</Text>
            </View>
            <TouchableOpacity onPress={openCreate} style={styles.addBtn}>
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
              { val: presentCount, label: 'Present', color: '#10B981', bg: '#DCFCE7' },
              { val: lateCount, label: 'Late', color: '#D97706', bg: '#FEF3C7' },
              { val: absentCount, label: 'Absent', color: '#DC2626', bg: '#FEE2E2' },
              { val: leaveCount, label: 'Leave', color: '#2563EB', bg: '#DBEAFE' },
            ].map((s, i) => (
              <View key={i} style={[styles.statItem, { backgroundColor: s.bg }]}>
                <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
            {STATUS_TABS.map(t => (
              <TouchableOpacity key={t.key} style={[styles.tab, statusTab === t.key && styles.tabActive]} onPress={() => setStatusTab(t.key)} activeOpacity={0.7}>
                <Text style={[styles.tabText, statusTab === t.key && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search employees..." placeholderTextColor="#94A3B8" />
          </View>

          {loading ? (
            <View style={{ gap: 8 }}>{[1, 2, 3, 4, 5].map(i => <View key={i} style={styles.skeleton} />)}</View>
          ) : filtered.length === 0 ? (
            <EmptyState icon="📅" title="No records" message="No attendance records for this date." />
          ) : (
            filtered.map((emp, i) => {
              const att = emp.attendance || {};
              const ci = att.check_in || att.checkIn;
              const status = ci ? (att.status || 'present') : 'absent';
              const statusColor = status === 'present' ? '#10B981' : status === 'late' ? '#F59E0B' : status === 'on_leave' ? '#2563EB' : '#DC2626';
              const name = empName(emp);
              return (
                <TouchableOpacity key={emp.id || i} style={styles.empCard} onPress={() => openDetail(emp)} activeOpacity={0.7}>
                  <Avatar firstName={emp.firstName || emp.first_name} lastName={emp.lastName || emp.last_name} size={42} status={ci ? 'online' : 'offline'} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.empName}>{name}</Text>
                    <Text style={styles.empDept}>{typeof emp.department === 'object' ? emp.department?.name : emp.department || 'N/A'} {emp.designation ? `• ${typeof emp.designation === 'object' ? emp.designation?.name : emp.designation}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                    {ci && <Text style={styles.timeText}>{new Date(ci).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: getTimezone() })}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      {/* Single Modal */}
      <AdminModalShell visible={isModalOpen} onClose={closeModal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeModal} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              {selectedItem && !isEditing && (
                <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.closeBtn}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
              {(isEditing || isCreating) && !isCreating && (
                <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              )}
              {isCreating && <View style={{ width: 36 }} />}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              {/* VIEW MODE */}
              {!isEditing && selectedItem && (
                <>
                  <View style={styles.detailRow}>
                    <Avatar firstName={selectedItem.firstName || selectedItem.first_name} lastName={selectedItem.lastName || selectedItem.last_name} size={48} />
                    <View style={{ marginLeft: 14, flex: 1 }}>
                      <Text style={styles.detailName}>{empName(selectedItem)}</Text>
                      <Text style={styles.detailDept}>{typeof selectedItem.department === 'object' ? selectedItem.department?.name : selectedItem.department || 'N/A'}</Text>
                    </View>
                  </View>
                  <Divider style={{ marginVertical: 12 }} />

                  {[
                    { label: 'Date', value: selectedDate },
                    { label: 'Status', value: selectedItem.resolvedStatus },
                    { label: 'Check In', value: (selectedItem.attendance?.check_in || selectedItem.attendance?.checkIn) ? new Date(selectedItem.attendance.check_in || selectedItem.attendance.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: getTimezone() }) : '—' },
                    { label: 'Check Out', value: (selectedItem.attendance?.check_out || selectedItem.attendance?.checkOut) ? new Date(selectedItem.attendance.check_out || selectedItem.attendance.checkOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: getTimezone() }) : '—' },
                    { label: 'Work Hours', value: (selectedItem.attendance?.work_hours || selectedItem.attendance?.workHours) ? `${(selectedItem.attendance.work_hours || selectedItem.attendance.workHours).toFixed(1)}h` : '—' },
                    { label: 'Notes', value: selectedItem.attendance?.notes || '—' },
                  ].map((row, i) => (
                    <View key={i} style={styles.detailField}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={[styles.detailValue, row.label === 'Status' && { color: selectedItem.resolvedStatus === 'present' ? '#10B981' : selectedItem.resolvedStatus === 'late' ? '#F59E0B' : '#DC2626' }]}>{row.value}</Text>
                    </View>
                  ))}

                  <Divider style={{ marginVertical: 12 }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Quick Status</Text>
                  <View style={styles.statusGrid}>
                    {STATUS_OPTIONS.map(s => (
                      <TouchableOpacity key={s.value} style={[styles.statusBtn, { borderColor: s.color }, selectedItem.resolvedStatus === s.value && { backgroundColor: s.color }]} onPress={() => handleQuickStatus(selectedItem, s.value)}>
                        <Text style={[styles.statusBtnText, selectedItem.resolvedStatus === s.value && { color: '#FFF' }]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleDelete(selectedItem)}>
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* EDIT / CREATE MODE */}
              {(isEditing || isCreating) && (
                <>
                  {isCreating && (
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
                  {isEditing && !isCreating && selectedItem && (
                    <View style={styles.editingEmpBanner}>
                      <Ionicons name="person" size={16} color={colors.primary} />
                      <Text style={styles.editingEmpText}>{empName(selectedItem)}</Text>
                    </View>
                  )}

                  <Text style={styles.fieldLabel}>Status</Text>
                  <View style={styles.statusGrid}>
                    {STATUS_OPTIONS.map(s => (
                      <TouchableOpacity key={s.value} style={[styles.statusBtn, { borderColor: s.color }, form.status === s.value && { backgroundColor: s.color }]} onPress={() => setForm(f => ({ ...f, status: s.value }))}>
                        <Text style={[styles.statusBtnText, form.status === s.value && { color: '#FFF' }]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>Check In Time</Text>
                  <TouchableOpacity style={styles.input} onPress={() => setShowCheckInPicker(true)} activeOpacity={0.7}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: form.checkIn ? colors.text : '#94A3B8' }}>{form.checkIn || 'Select time'}</Text>
                      <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                  {showCheckInPicker && (
                    <DateTimePicker value={(() => { const [h, m] = (form.checkIn || '09:00').split(':').map(Number); const d = new Date(); d.setHours(h, m, 0); return d; })()} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, date) => { setShowCheckInPicker(Platform.OS === 'ios'); if (date) setForm(f => ({ ...f, checkIn: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` })); }} />
                  )}

                  <Text style={styles.fieldLabel}>Check Out Time</Text>
                  <TouchableOpacity style={styles.input} onPress={() => setShowCheckOutPicker(true)} activeOpacity={0.7}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: form.checkOut ? colors.text : '#94A3B8' }}>{form.checkOut || 'Select time'}</Text>
                      <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                  {showCheckOutPicker && (
                    <DateTimePicker value={(() => { const [h, m] = (form.checkOut || '17:00').split(':').map(Number); const d = new Date(); d.setHours(h, m, 0); return d; })()} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, date) => { setShowCheckOutPicker(Platform.OS === 'ios'); if (date) setForm(f => ({ ...f, checkOut: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` })); }} />
                  )}

                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder="Optional notes..." placeholderTextColor="#94A3B8" multiline />

                  <Text style={styles.fieldLabel}>Reason</Text>
                  <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={form.reason} onChangeText={v => setForm(f => ({ ...f, reason: v }))} placeholder="Reason for manual entry..." placeholderTextColor="#94A3B8" multiline />

                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Late Arrival</Text>
                    <Switch value={form.isLate} onValueChange={v => setForm(f => ({ ...f, isLate: v }))} trackColor={{ true: '#F59E0B', false: '#E2E8F0' }} />
                  </View>
                  {form.isLate && (
                    <>
                      <Text style={styles.fieldLabel}>Late Minutes</Text>
                      <TextInput style={styles.input} value={String(form.lateMinutes)} onChangeText={v => setForm(f => ({ ...f, lateMinutes: parseInt(v) || 0 }))} keyboardType="numeric" placeholder="0" placeholderTextColor="#94A3B8" />
                    </>
                  )}
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Early Departure</Text>
                    <Switch value={form.isEarlyDeparture} onValueChange={v => setForm(f => ({ ...f, isEarlyDeparture: v }))} trackColor={{ true: '#8B5CF6', false: '#E2E8F0' }} />
                  </View>

                  <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.saveBtnText}>{saving ? 'Saving...' : isCreating ? 'Create Record' : 'Update Record'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
      </AdminModalShell>
    </View>
  );
};


export default AdminAttendanceScreen;
