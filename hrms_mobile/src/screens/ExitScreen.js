import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Badge, EmptyState, Avatar } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminPillGrid, AdminDateRow,
  AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const createLocalStyles = (colors) => ({
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  detailName: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#DC2626', alignItems: 'center' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  approveBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.successSurface, alignItems: 'center', borderWidth: 1, borderColor: colors.success + '30' },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: colors.success },
  signBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  signBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' } });
const TABS = [
  { key: 'exits', label: 'Exit Requests' },
  { key: 'clearance', label: 'Clearance' },
];

const EXIT_TYPES = [
  { value: 'resignation', label: 'Resignation' },
  { value: 'termination', label: 'Termination' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'other', label: 'Other' },
];

const emptyForm = { employeeId: '', reason: '', type: 'resignation', noticeDate: '', lastDate: '' };

const ExitScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [tab, setTab] = useState('exits');
  const [exits, setExits] = useState([]);
  const [clearances, setClearances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isModalOpen = !!selectedItem || isCreating;

  const fetchData = useCallback(async () => {
    try {
      const [eRes, cRes] = await Promise.allSettled([api.get('/exits'), api.get('/exits/clearance')]);
      const pick = (res) => {
        if (res.status !== 'fulfilled') return [];
        const d = res.value.data;
        return d?.data || d?.items || (Array.isArray(d) ? d : []);
      };
      setExits(pick(eRes));
      setClearances(pick(cRes));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const closeModal = () => {
    setSelectedItem(null);
    setIsEditing(false);
    setIsCreating(false);
    setForm(emptyForm);
  };

  const openCreate = () => {
    if (tab !== 'exits') return;
    setSelectedItem(null);
    setForm(emptyForm);
    setIsCreating(true);
    setIsEditing(true);
  };

  const openDetail = (item) => {
    setSelectedItem(item);
    if (tab === 'exits') {
      setForm({
        employeeId: String(item.employee_id || ''),
        reason: item.reason || '',
        type: item.exit_type || 'resignation',
        noticeDate: item.notice_date || '',
        lastDate: item.last_working_date || '' });
    }
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.employeeId) { Alert.alert('Error', 'Employee ID required.'); return; }
    setSaving(true);
    try {
      const payload = {
        employee_id: parseInt(form.employeeId),
        reason: form.reason.trim(),
        exit_type: form.type,
        notice_date: form.noticeDate || undefined,
        last_working_date: form.lastDate || undefined };
      if (isCreating) await api.post('/exits', payload);
      else await api.put(`/exits/${selectedItem.id}`, payload);
      Alert.alert('Success', isCreating ? 'Exit request created.' : 'Exit request updated.');
      closeModal();
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedItem || tab !== 'exits') return;
    Alert.alert('Delete', 'Delete this exit request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/exits/${selectedItem.id}`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleApprove = () => {
    if (!selectedItem) return;
    Alert.alert('Approve', 'Approve this exit request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try { await api.put(`/exits/${selectedItem.id}/approve`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleReject = () => {
    if (!selectedItem) return;
    Alert.alert('Reject', 'Reject this exit request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        try { await api.put(`/exits/${selectedItem.id}/reject`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleClearanceSign = () => {
    if (!selectedItem) return;
    const dept = typeof selectedItem.department === 'object' ? selectedItem.department?.name : selectedItem.department || 'department';
    Alert.alert('Sign Clearance', `Sign off clearance for ${dept}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Off', onPress: async () => {
        try { await api.put(`/exits/clearance/${selectedItem.id}/sign`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const filteredExits = exits.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.employee_name || '').toLowerCase().includes(q) || (e.reason || '').toLowerCase().includes(q);
  });

  const filteredClearance = clearances.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const dept = typeof c.department === 'object' ? c.department?.name : c.department || '';
    return (c.employee_name || '').toLowerCase().includes(q) || dept.toLowerCase().includes(q);
  });

  const renderViewContent = () => {
    if (!selectedItem) return null;
    if (tab === 'exits') {
      return (
        <>
          <View style={localStyles.detailRow}>
            <Avatar firstName={selectedItem.employee_name?.split(' ')[0]} lastName={selectedItem.employee_name?.split(' ').slice(1).join(' ')} size={48} />
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={localStyles.detailName}>{selectedItem.employee_name || `EMP-${selectedItem.employee_id}`}</Text>
            </View>
          </View>
          <AdminDetailRows rows={[
            { label: 'Type', value: selectedItem.exit_type || 'Resignation' },
            { label: 'Status', value: selectedItem.status || 'pending' },
            { label: 'Last Day', value: selectedItem.last_working_date || 'TBD', valueStyle: { textTransform: 'none' } },
            { label: 'Notice Date', value: selectedItem.notice_date || '—', valueStyle: { textTransform: 'none' } },
            { label: 'Reason', value: selectedItem.reason || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
          ]} />
        </>
      );
    }
    return (
      <AdminDetailRows rows={[
        { label: 'Employee', value: selectedItem.employee_name || `EMP-${selectedItem.employee_id}`, valueStyle: { textTransform: 'none' } },
        { label: 'Department', value: typeof selectedItem.department === 'object' ? selectedItem.department?.name : selectedItem.department || 'N/A', valueStyle: { textTransform: 'none' } },
        { label: 'Status', value: selectedItem.signed_off ? 'Signed Off' : 'Pending' },
      ]} />
    );
  };

  const renderFooter = () => {
    if (!selectedItem || isEditing || isCreating) return null;
    if (tab === 'exits' && selectedItem.status === 'pending') {
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
    if (tab === 'clearance' && !selectedItem.signed_off) {
      return (
        <TouchableOpacity style={localStyles.signBtn} onPress={handleClearanceSign}>
          <Text style={localStyles.signBtnText}>Sign Clearance</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Exit Management" subtitle="Manage employee exits & clearance" onAdd={tab === 'exits' ? openCreate : undefined} />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: exits.length, label: 'Total', color: '#2563EB', bg: '#DBEAFE' },
            { val: exits.filter((e) => e.status === 'pending').length, label: 'Pending', color: '#D97706', bg: '#FEF3C7' },
            { val: exits.filter((e) => e.status === 'approved').length, label: 'Approved', color: '#10B981', bg: '#DCFCE7' },
            { val: clearances.length, label: 'Clearance', color: '#4F46E5', bg: '#EEF2FF' },
          ]} />
          <AdminTabPills tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); closeModal(); }} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search exits..." />
          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : (
            <>
              {tab === 'exits' && (filteredExits.length === 0 ? (
                <EmptyState icon="🚪" title="No exit requests" message="Exit requests will appear here." />
              ) : filteredExits.map((e) => (
                <AdminListCard key={e.id} onPress={() => openDetail(e)}>
                  <Avatar firstName={e.employee_name?.split(' ')[0]} lastName={e.employee_name?.split(' ').slice(1).join(' ')} size={44} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listTitle}>{e.employee_name || `EMP-${e.employee_id}`}</Text>
                    <Text style={adminStyles.listSub}>{e.exit_type || 'Resignation'} • {e.last_working_date ? `Last day: ${e.last_working_date}` : 'TBD'}</Text>
                    <View style={{ marginTop: 6 }}>
                      <Badge status={e.status === 'approved' ? 'approved' : e.status === 'rejected' ? 'rejected' : 'pending'} label={e.status || 'pending'} size="sm" />
                    </View>
                  </View>
                </AdminListCard>
              )))}
              {tab === 'clearance' && (filteredClearance.length === 0 ? (
                <EmptyState icon="📋" title="No clearance records" message="Clearance items will appear here." />
              ) : filteredClearance.map((c) => (
                <AdminListCard key={c.id} onPress={() => openDetail(c)}>
                  <View style={{ flex: 1 }}>
                    <Text style={adminStyles.listTitle}>{c.employee_name || `EMP-${c.employee_id}`}</Text>
                    <Text style={adminStyles.listSub}>{typeof c.department === 'object' ? c.department?.name : c.department || 'N/A'}</Text>
                    <View style={{ marginTop: 6 }}>
                      <Badge status={c.signed_off ? 'completed' : 'pending'} label={c.signed_off ? 'Signed Off' : 'Pending'} size="sm" />
                    </View>
                  </View>
                </AdminListCard>
              )))}
            </>
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle={tab === 'exits' ? 'Exit Request Detail' : 'Clearance Detail'}
        createTitle="Exit Request"
        editTitle="Edit Exit Request"
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={tab === 'exits' ? () => setIsEditing(true) : undefined}
        onSave={tab === 'exits' ? handleSave : undefined}
        onDelete={tab === 'exits' ? handleDelete : undefined}
        saving={saving}
        saveLabel={isCreating ? 'Submit Request' : 'Update Request'}
        showEdit={tab === 'exits' && selectedItem?.status === 'pending'}
        showDelete={tab === 'exits'}
        footerContent={renderFooter()}
        viewContent={renderViewContent()}
      >
        <AdminFieldLabel>Employee ID *</AdminFieldLabel>
        <AdminInput value={form.employeeId} onChangeText={(v) => setForm((f) => ({ ...f, employeeId: v }))} placeholder="Employee ID" keyboardType="number-pad" />
        <AdminFieldLabel>Type</AdminFieldLabel>
        <AdminPillGrid options={EXIT_TYPES} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />
        <AdminFieldLabel>Reason</AdminFieldLabel>
        <AdminInput value={form.reason} onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))} placeholder="Reason for exit" multiline style={{ height: 80, textAlignVertical: 'top' }} />
        <AdminFieldLabel>Notice Date</AdminFieldLabel>
        <AdminDateRow value={form.noticeDate} onChange={(v) => setForm((f) => ({ ...f, noticeDate: v }))} label="Select notice date" />
        <AdminFieldLabel>Last Working Date</AdminFieldLabel>
        <AdminDateRow value={form.lastDate} onChange={(v) => setForm((f) => ({ ...f, lastDate: v }))} label="Select last working date" />
      </AdminCrudSheet>
    </View>
  );
};


export default ExitScreen;
