import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Badge, EmptyState } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminDateRow, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const createLocalStyles = (colors) => ({
  assignBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  assignBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' } });
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'maintenance', label: 'Maintenance' },
];

const emptyForm = { name: '', type: '', tag: '', value: '', purchaseDate: '', empId: '' };

const AssetScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
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
      name: a.name || '',
      type: a.type || '',
      tag: a.tag || '',
      value: String(a.value || ''),
      purchaseDate: a.purchase_date ? new Date(a.purchase_date).toISOString().split('T')[0] : '',
      empId: String(a.assigned_to || '') });
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Error', 'Name required.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), type: form.type.trim(), tag: form.tag.trim(),
        value: parseFloat(form.value) || 0,
        purchase_date: form.purchaseDate || undefined,
        assigned_to: parseInt(form.empId) || undefined };
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
    Alert.alert('Delete', `Delete "${selectedItem.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/assets/${selectedItem.id}`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleAssign = () => {
    if (!selectedItem) return;
    if (selectedItem.assigned_to) {
      Alert.alert('Unassign', `Unassign "${selectedItem.name}"?`, [
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

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (a.name || '').toLowerCase().includes(q) || (a.tag || '').toLowerCase().includes(q) || (a.type || '').toLowerCase().includes(q);
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
        <AdminHeader navigation={navigation} title="Assets" subtitle="Track and manage assets" onAdd={openCreate} />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: assets.length, label: 'Total', color: '#2563EB', bg: '#DBEAFE' },
            { val: assets.filter((a) => (a.status || 'available') === 'available').length, label: 'Available', color: '#10B981', bg: '#DCFCE7' },
            { val: assets.filter((a) => a.assigned_to).length, label: 'Assigned', color: '#D97706', bg: '#FEF3C7' },
            { val: assets.filter((a) => (a.status || '') === 'maintenance').length, label: 'Maintenance', color: '#DC2626', bg: '#FEE2E2' },
          ]} />
          <AdminTabPills tabs={TABS} active={statusFilter} onChange={setStatusFilter} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search assets..." />
          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : filtered.length === 0 ? (
            <EmptyState icon="💻" title="No assets" message="Add your first asset." />
          ) : (
            filtered.map((a) => (
              <AdminListCard key={a.id} onPress={() => openDetail(a)}>
                <View style={{ flex: 1 }}>
                  <Text style={adminStyles.listTitle}>{a.name}</Text>
                  <Text style={adminStyles.listSub}>{a.type || 'N/A'} • Tag: {a.tag || 'N/A'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Badge status={a.assigned_to ? 'pending' : 'active'} label={a.assigned_to ? 'Assigned' : a.status || 'available'} size="sm" />
                  </View>
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
        onStartEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        saveLabel={isCreating ? 'Add Asset' : 'Update Asset'}
        footerContent={selectedItem && !isEditing && !isCreating ? (
          <TouchableOpacity style={localStyles.assignBtn} onPress={handleAssign}>
            <Text style={localStyles.assignBtnText}>{selectedItem.assigned_to ? 'Unassign Asset' : 'Assign Asset'}</Text>
          </TouchableOpacity>
        ) : null}
        viewContent={selectedItem && (
          <AdminDetailRows rows={[
            { label: 'Name', value: selectedItem.name, valueStyle: { textTransform: 'none' } },
            { label: 'Type', value: selectedItem.type || 'N/A', valueStyle: { textTransform: 'none' } },
            { label: 'Tag', value: selectedItem.tag || 'N/A', valueStyle: { textTransform: 'none' } },
            { label: 'Value', value: selectedItem.value ? parseFloat(selectedItem.value).toLocaleString() : '—', valueStyle: { textTransform: 'none' } },
            { label: 'Status', value: selectedItem.assigned_to ? 'Assigned' : selectedItem.status || 'available' },
            { label: 'Assignee', value: selectedItem.assigned_to_name || (selectedItem.assigned_to ? `#${selectedItem.assigned_to}` : '—'), valueStyle: { textTransform: 'none' } },
          ]} />
        )}
      >
        <AdminFieldLabel>Name *</AdminFieldLabel>
        <AdminInput value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Asset name" />
        <AdminFieldLabel>Type</AdminFieldLabel>
        <AdminInput value={form.type} onChangeText={(v) => setForm((f) => ({ ...f, type: v }))} placeholder="Laptop, Phone, etc." />
        <AdminFieldLabel>Tag</AdminFieldLabel>
        <AdminInput value={form.tag} onChangeText={(v) => setForm((f) => ({ ...f, tag: v }))} placeholder="Asset tag" />
        <AdminFieldLabel>Value</AdminFieldLabel>
        <AdminInput value={form.value} onChangeText={(v) => setForm((f) => ({ ...f, value: v }))} placeholder="Purchase value" keyboardType="decimal-pad" />
        <AdminFieldLabel>Purchase Date</AdminFieldLabel>
        <AdminDateRow value={form.purchaseDate} onChange={(v) => setForm((f) => ({ ...f, purchaseDate: v }))} label="Select purchase date" />
        <AdminFieldLabel>Assign To (Employee ID)</AdminFieldLabel>
        <AdminInput value={form.empId} onChangeText={(v) => setForm((f) => ({ ...f, empId: v }))} placeholder="Employee ID" keyboardType="number-pad" />
      </AdminCrudSheet>
    </View>
  );
};


export default AssetScreen;
