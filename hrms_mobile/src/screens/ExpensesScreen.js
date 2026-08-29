import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Avatar, Badge, EmptyState, Divider } from '../components/UI';
import { useApiData, normalizeResponse } from '../hooks/useApiData';
import { useIsAdmin } from '../hooks/useIsAdmin';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminPillGrid, AdminDateRow,
  AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const createLocalStyles = (colors) => ({
  amount: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailName: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.dangerSurface, alignItems: 'center', borderWidth: 1, borderColor: colors.danger + '30' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  approveBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.successSurface, alignItems: 'center', borderWidth: 1, borderColor: colors.success + '30' },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: colors.success } });
const CATEGORIES = [
  { value: 'travel', label: '✈️ Travel' },
  { value: 'food', label: '🍔 Food' },
  { value: 'office', label: '🏢 Office' },
  { value: 'transport', label: '🚗 Transport' },
  { value: 'medical', label: '🏥 Medical' },
  { value: 'other', label: '📦 Other' },
];

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const catLabel = (key) => CATEGORIES.find((c) => c.value === key)?.label || key || 'General';
const emptyForm = { amount: '', category: '', description: '', date: new Date().toISOString().split('T')[0] };

const ExpensesScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const localStyles = useThemedStyles(createLocalStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const isAdmin = useIsAdmin();

  const isModalOpen = !!selectedItem || isCreating;

  const { data: expenses, loading, refreshing, refresh } = useApiData(
    async () => {
      const res = await api.get('/expenses');
      return normalizeResponse(res);
    },
    []
  );

  const closeModal = () => {
    setSelectedItem(null);
    setIsEditing(false);
    setIsCreating(false);
    setForm({ ...emptyForm, date: filterDate });
  };

  const openCreate = () => {
    setSelectedItem(null);
    setForm({ ...emptyForm, date: filterDate });
    setIsCreating(true);
    setIsEditing(true);
  };

  const openDetail = (exp) => {
    setSelectedItem(exp);
    setForm({
      amount: String(exp.amount || ''),
      category: exp.category || '',
      description: exp.description || '',
      date: exp.date ? new Date(exp.date).toISOString().split('T')[0] : filterDate });
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.amount || !form.category) { Alert.alert('Missing', 'Enter amount and select category.'); return; }
    setSaving(true);
    try {
      const payload = { amount: parseFloat(form.amount), category: form.category, description: form.description, date: form.date };
      if (isCreating) await api.post('/expenses', payload);
      else await api.put(`/expenses/${selectedItem.id}`, payload);
      Alert.alert('Success', isCreating ? 'Expense submitted!' : 'Expense updated.');
      closeModal();
      refresh();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleApprove = () => {
    if (!selectedItem) return;
    Alert.alert('Approve', `Approve expense of ₹${Number(selectedItem.amount).toLocaleString()}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: async () => {
        try { await api.post(`/expenses/${selectedItem.id}/approve`); Alert.alert('Done', 'Expense approved.'); closeModal(); refresh(); }
        catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
      }},
    ]);
  };

  const handleReject = () => {
    if (!selectedItem) return;
    Alert.alert('Reject', `Reject expense of ₹${Number(selectedItem.amount).toLocaleString()}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        try { await api.post(`/expenses/${selectedItem.id}/reject`); Alert.alert('Done', 'Expense rejected.'); closeModal(); refresh(); }
        catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
      }},
    ]);
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    Alert.alert('Delete', 'Delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/expenses/${selectedItem.id}`); closeModal(); refresh(); }
        catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
      }},
    ]);
  };

  const list = expenses || [];
  const totalAmount = list.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const empName = (e) => e.employee_name || e.employeeName || `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Employee';

  const filteredExpenses = list.filter((e) => {
    if (statusTab !== 'all' && e.status !== statusTab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return empName(e).toLowerCase().includes(q) || catLabel(e.category).toLowerCase().includes(q);
  });

  const statusColor = (s) => (s === 'approved' ? '#10B981' : s === 'rejected' ? '#DC2626' : '#F59E0B');

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Expenses" subtitle="Track and manage expenses" onAdd={openCreate} />
        <View style={adminStyles.body}>
          <AdminDateRow value={filterDate} onChange={setFilterDate} />
          <AdminStatRow stats={[
            { val: `${(totalAmount / 1000).toFixed(0)}K`, label: 'Total', color: '#2563EB', bg: '#DBEAFE' },
            { val: list.filter((e) => e.status === 'pending').length, label: 'Pending', color: '#D97706', bg: '#FEF3C7' },
            { val: list.filter((e) => e.status === 'approved').length, label: 'Approved', color: '#10B981', bg: '#DCFCE7' },
            { val: list.filter((e) => e.status === 'rejected').length, label: 'Rejected', color: '#DC2626', bg: '#FEE2E2' },
          ]} />
          <AdminTabPills tabs={STATUS_TABS} active={statusTab} onChange={setStatusTab} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search expenses..." />
          {loading ? (
            <View>{[1, 2, 3].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : filteredExpenses.length === 0 ? (
            <EmptyState icon="📊" title="No expenses" message="Submit your first expense." />
          ) : (
            filteredExpenses.map((exp) => (
              <AdminListCard key={exp.id} onPress={() => openDetail(exp)}>
                <Avatar firstName={empName(exp).split(' ')[0]} lastName={empName(exp).split(' ').slice(1).join(' ')} size={42} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={adminStyles.listTitle}>{empName(exp)}</Text>
                  <Text style={adminStyles.listSub}>{catLabel(exp.category)}</Text>
                  <Text style={adminStyles.listSub}>
                    {exp.date ? new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={localStyles.amount}>₹{Number(exp.amount).toLocaleString()}</Text>
                  <Badge status={exp.status} size="sm" />
                </View>
              </AdminListCard>
            ))
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle="Expense Detail"
        createTitle="Submit Expense"
        editTitle="Edit Expense"
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        saveLabel={isCreating ? 'Submit Expense' : 'Update Expense'}
        showEdit={selectedItem?.status === 'pending' || isCreating}
        footerContent={selectedItem && !isEditing && !isCreating && isAdmin && selectedItem.status === 'pending' ? (
          <View style={localStyles.modalActions}>
            <TouchableOpacity style={localStyles.rejectBtn} onPress={handleReject}>
              <Text style={localStyles.rejectBtnText}>✕ Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={localStyles.approveBtn} onPress={handleApprove}>
              <Text style={localStyles.approveBtnText}>✓ Approve</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        viewContent={selectedItem && (
          <>
            <View style={localStyles.detailRow}>
              <Avatar firstName={empName(selectedItem).split(' ')[0]} lastName={empName(selectedItem).split(' ').slice(1).join(' ')} size={48} />
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={localStyles.detailName}>{empName(selectedItem)}</Text>
                <Text style={adminStyles.listSub}>{catLabel(selectedItem.category)}</Text>
              </View>
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <AdminDetailRows rows={[
              { label: 'Amount', value: `₹${Number(selectedItem.amount).toLocaleString()}`, valueStyle: { textTransform: 'none' } },
              { label: 'Date', value: selectedItem.date ? new Date(selectedItem.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—', valueStyle: { textTransform: 'none' } },
              { label: 'Category', value: catLabel(selectedItem.category), valueStyle: { textTransform: 'none' } },
              { label: 'Status', value: selectedItem.status, valueStyle: { color: statusColor(selectedItem.status) } },
              { label: 'Description', value: selectedItem.description || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
            ]} />
          </>
        )}
      >
        <AdminFieldLabel>Amount *</AdminFieldLabel>
        <AdminInput value={form.amount} onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="0.00" keyboardType="decimal-pad" />
        <AdminFieldLabel>Category *</AdminFieldLabel>
        <AdminPillGrid options={CATEGORIES} value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
        <AdminFieldLabel>Date</AdminFieldLabel>
        <AdminDateRow value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        <AdminFieldLabel>Description</AdminFieldLabel>
        <AdminInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Optional..." multiline style={{ height: 60, textAlignVertical: 'top' }} />
      </AdminCrudSheet>
    </View>
  );
};


export default ExpensesScreen;
