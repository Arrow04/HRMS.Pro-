import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, Pressable } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useAuth } from '../context/AuthContext';
import { Badge, EmptyState } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminDateRow, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';
import { dateToISO } from '../utils/timezone';

const createLocalStyles = (colors) => ({
  assignBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  assignBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' } });
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'maintenance', label: 'Maintenance' },
];

const emptyForm = { assetName: '', assetType: '', serialNumber: '', value: '', purchaseDate: '', employeeId: '' };

const AssetScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const isAdmin = useIsAdmin();
  const { user } = useAuth();
  const scrollTopBar = useScrollTopBar();
  const [statusFilter, setStatusFilter] = useState('all');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [reasonModal, setReasonModal] = useState(null);
  const [reasonText, setReasonText] = useState('');

  const isModalOpen = !!selectedItem || isCreating;

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/assets');
      const d = res.data;
      setAssets(d?.data || d?.items || (Array.isArray(d) ? d : []));
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
    setSelectedItem(null);
    setForm(emptyForm);
    setIsCreating(true);
    setIsEditing(true);
  };

  const openDetail = (a) => {
    setSelectedItem(a);
    setForm({
      assetName: a.assetName || '',
      assetType: a.assetType || '',
      serialNumber: a.serialNumber || '',
      value: String(a.value || ''),
      purchaseDate: a.purchaseDate || (a.purchase_date ? dateToISO(a.purchase_date) : ''),
      employeeId: String(a.employeeId || a.employee_id || '') });
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.assetName.trim()) { Alert.alert('Error', 'Name required.'); return; }
    setSaving(true);
    try {
      const payload = {
        assetName: form.assetName.trim(),
        assetType: form.assetType.trim() || 'laptop',
        serialNumber: form.serialNumber.trim() || `ASSET-${Date.now()}`,
        value: parseFloat(form.value) || 0,
        purchaseDate: form.purchaseDate || undefined,
        employeeId: parseInt(form.employeeId) || undefined };
      if (isCreating) await api.post('/assets', payload);
      else await api.put(`/assets/${selectedItem.id}`, payload);
      Alert.alert('Success', isCreating ? 'Asset added.' : 'Asset updated.');
      closeModal();
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    Alert.alert('Delete', `Delete "${selectedItem.assetName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/assets/${selectedItem.id}`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleMaintenance = () => {
    if (!selectedItem) return;
    setReasonText('');
    setReasonModal('maintenance');
  };

  const handleReturn = () => {
    if (!selectedItem) return;
    setReasonText('');
    setReasonModal('return');
  };

  const submitReason = async () => {
    if (!reasonText.trim()) { Alert.alert('Required', 'Please enter a reason.'); return; }
    const action = reasonModal;
    setReasonModal(null);
    try {
      if (action === 'maintenance') {
        await api.put(`/assets/${selectedItem.id}`, { status: 'maintenance', notes: reasonText.trim() });
      } else if (action === 'return') {
        await api.put(`/assets/${selectedItem.id}`, { employeeId: null, status: 'available', notes: reasonText.trim() });
      }
      closeModal();
      fetchData();
    } catch { Alert.alert('Error', 'Failed.'); }
  };

  const handleAssign = () => {
    if (!selectedItem) return;
    if (selectedItem.assigned_to) {
      Alert.alert('Unassign', `Unassign "${selectedItem.assetName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unassign', style: 'destructive', onPress: async () => {
          try { await api.put(`/assets/${selectedItem.id}`, { assigned_to: null, status: 'available' }); closeModal(); fetchData(); }
          catch { Alert.alert('Error', 'Failed.'); }
        }},
      ]);
    } else {
      setIsEditing(true);
    }
  };

  const visibleAssets = isAdmin ? assets : assets.filter((a) => {
    const empId = user?.employeeId || user?.employee_id;
    return a.employee_id === empId || a.employeeId === empId;
  });

  const filtered = visibleAssets.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (a.assetName || '').toLowerCase().includes(q) || (a.serialNumber || '').toLowerCase().includes(q) || (a.assetType || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || (a.status || 'available') === statusFilter || (statusFilter === 'assigned' && a.assigned_to);
    return matchSearch && matchStatus;
  });

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Assets" subtitle="Track and manage assets" onAdd={isAdmin ? openCreate : undefined} />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: visibleAssets.length, label: 'Total', color: '#2563EB', bg: '#DBEAFE' },
            { val: visibleAssets.filter((a) => (a.status || 'available') === 'available').length, label: 'Available', color: '#10B981', bg: '#DCFCE7' },
            { val: visibleAssets.filter((a) => a.assigned_to || a.employeeId || a.employee_id).length, label: 'Assigned', color: '#D97706', bg: '#FEF3C7' },
            { val: visibleAssets.filter((a) => (a.status || '') === 'maintenance').length, label: 'Maintenance', color: '#DC2626', bg: '#FEE2E2' },
          ]} />
          {isAdmin && <AdminTabPills tabs={TABS} active={statusFilter} onChange={setStatusFilter} />}
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search assets..." />
          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : filtered.length === 0 ? (
            <EmptyState icon="💻" title="No assets" message="Add your first asset." />
          ) : (
            filtered.map((a) => (
              <AdminListCard key={a.id} onPress={() => openDetail(a)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={adminStyles.listTitle}>{a.assetName}</Text>
                    <Text style={adminStyles.listSub}>{a.assetType || 'N/A'} • S/N: {a.serialNumber || 'N/A'}</Text>
                    <Text style={adminStyles.listSub}>Assigned to: {a.employeeName || 'Unassigned'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Badge status={a.employeeId || a.assigned_to ? 'pending' : 'active'} label={a.employeeId || a.assigned_to ? 'Assigned' : a.status || 'available'} size="sm" />
                    </View>
                  </View>
                  {a.value ? (
                    <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>₹{parseFloat(a.value).toLocaleString()}</Text>
                    </View>
                  ) : null}
                </View>
              </AdminListCard>
            ))
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle="Asset Detail"
        createTitle="Add Asset"
        editTitle="Edit Asset"
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={isAdmin ? () => setIsEditing(true) : undefined}
        onSave={isAdmin ? handleSave : undefined}
        onDelete={isAdmin ? handleDelete : undefined}
        saving={saving}
        saveLabel={isCreating ? 'Add Asset' : 'Update Asset'}
        footerContent={selectedItem && !isEditing && !isCreating ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(selectedItem.employeeId || selectedItem.assigned_to) ? (
              <TouchableOpacity style={[localStyles.assignBtn, { flex: 1 }]} onPress={handleReturn}>
                <Text style={localStyles.assignBtnText}>Return</Text>
              </TouchableOpacity>
            ) : null}
            {selectedItem.status !== 'maintenance' ? (
              <TouchableOpacity style={[localStyles.assignBtn, { flex: 1, backgroundColor: '#F59E0B' }]} onPress={handleMaintenance}>
                <Text style={localStyles.assignBtnText}>Maintenance</Text>
              </TouchableOpacity>
            ) : null}
            {isAdmin ? (
              <TouchableOpacity style={[localStyles.assignBtn, { flex: 1 }]} onPress={handleAssign}>
                <Text style={localStyles.assignBtnText}>{(selectedItem.employeeId || selectedItem.assigned_to) ? 'Unassign' : 'Assign'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        viewContent={selectedItem && (
          <AdminDetailRows rows={[
            { label: 'Name', value: selectedItem.assetName || selectedItem.name, valueStyle: { textTransform: 'none' } },
            { label: 'Type', value: selectedItem.assetType || selectedItem.type || 'N/A', valueStyle: { textTransform: 'none' } },
            { label: 'Serial #', value: selectedItem.serialNumber || selectedItem.tag || 'N/A', valueStyle: { textTransform: 'none' } },
            { label: 'Value', value: selectedItem.value ? parseFloat(selectedItem.value).toLocaleString() : '—', valueStyle: { textTransform: 'none' } },
            { label: 'Status', value: selectedItem.assigned_to ? 'Assigned' : selectedItem.status || 'available' },
            { label: 'Assignee', value: selectedItem.assigned_to_name || (selectedItem.assigned_to ? `#${selectedItem.assigned_to}` : '—'), valueStyle: { textTransform: 'none' } },
          ]} />
        )}
      >
        <AdminFieldLabel>Name *</AdminFieldLabel>
        <AdminInput value={form.assetName} onChangeText={(v) => setForm((f) => ({ ...f, assetName: v }))} placeholder="Asset name" />
        <AdminFieldLabel>Type</AdminFieldLabel>
        <AdminInput value={form.assetType} onChangeText={(v) => setForm((f) => ({ ...f, assetType: v }))} placeholder="Laptop, Phone, etc." />
        <AdminFieldLabel>Serial Number</AdminFieldLabel>
        <AdminInput value={form.serialNumber} onChangeText={(v) => setForm((f) => ({ ...f, serialNumber: v }))} placeholder="Serial number" />
        <AdminFieldLabel>Value</AdminFieldLabel>
        <AdminInput value={form.value} onChangeText={(v) => setForm((f) => ({ ...f, value: v }))} placeholder="Purchase value" keyboardType="decimal-pad" />
        <AdminFieldLabel>Purchase Date</AdminFieldLabel>
        <AdminDateRow value={form.purchaseDate} onChange={(v) => setForm((f) => ({ ...f, purchaseDate: v }))} label="Select purchase date" />
        <AdminFieldLabel>Assign To (Employee ID)</AdminFieldLabel>
        <AdminInput value={form.employeeId} onChangeText={(v) => setForm((f) => ({ ...f, employeeId: v }))} placeholder="Employee ID" keyboardType="number-pad" />
      </AdminCrudSheet>

      <Modal visible={!!reasonModal} transparent animationType="slide" onRequestClose={() => setReasonModal(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setReasonModal(null)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
              {reasonModal === 'maintenance' ? 'Maintenance Reason' : 'Return Reason'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 10 }}>
              {reasonModal === 'maintenance'
                ? `Why is "${selectedItem?.assetName}" going to maintenance?`
                : `Why are you returning "${selectedItem?.assetName}"?`}
            </Text>
            <TextInput
              value={reasonText}
              onChangeText={setReasonText}
              placeholder="Enter reason..."
              placeholderTextColor={colors.textTertiary}
              multiline
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                padding: 12, fontSize: 14, color: colors.text, minHeight: 80,
                textAlignVertical: 'top', marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setReasonModal(null)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReason}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: reasonModal === 'maintenance' ? '#F59E0B' : colors.primary }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};


export default AssetScreen;
