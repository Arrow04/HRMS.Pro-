import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii } from '../theme';
import { Badge, EmptyState } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminPillGrid, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const createStyles = (colors) => ({
  dateBox: { width: 52, height: 56, borderRadius: radii.md, justifyContent: 'center', alignItems: 'center' },
  dateDay: { fontSize: 20, fontWeight: '800' },
  dateMonth: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  desc: { fontSize: 11, color: colors.textTertiary, marginTop: 4 } });
const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

const TYPE_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'optional', label: 'Optional' },
  { value: 'company', label: 'Company' },
];

const typeColor = (t) => {
  if (t === 'public') return '#2563EB';
  if (t === 'optional') return '#D97706';
  if (t === 'company') return '#10B981';
  return colors.textSecondary;
};

const emptyForm = { name: '', date: '', type: 'public', description: '' };

const HolidayScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isModalOpen = !!selectedItem || isCreating;

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/holidays');
      const d = res.data;
      setHolidays(d?.data || d?.items || (Array.isArray(d) ? d : []));
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

  const openDetail = (h) => {
    setSelectedItem(h);
    setForm({
      name: h.name || '',
      date: h.date ? new Date(h.date).toISOString().split('T')[0] : '',
      type: h.type || 'public',
      description: h.description || '' });
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.date) {
      Alert.alert('Required', 'Name and date are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), date: form.date, type: form.type, description: form.description.trim() };
      if (isCreating) await api.post('/holidays', payload);
      else await api.put(`/holidays/${selectedItem.id}`, payload);
      Alert.alert('Success', isCreating ? 'Holiday created.' : 'Holiday updated.');
      closeModal();
      fetchData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to save holiday.');
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    Alert.alert('Delete Holiday', `Delete "${selectedItem.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/holidays/${selectedItem.id}`);
          closeModal();
          fetchData();
        } catch { Alert.alert('Error', 'Failed to delete holiday.'); }
      }},
    ]);
  };

  const now = new Date();
  const filtered = holidays.filter((h) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (h.name || '').toLowerCase().includes(q);
    const isUpcoming = new Date(h.date) >= now;
    if (activeTab === 'upcoming') return matchSearch && isUpcoming;
    if (activeTab === 'past') return matchSearch && !isUpcoming;
    return matchSearch;
  });

  const upcomingCount = holidays.filter((h) => new Date(h.date) >= now).length;
  const pastCount = holidays.length - upcomingCount;

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Holidays" subtitle="Manage organization holidays" onAdd={openCreate} />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: holidays.length, label: 'Total', color: '#2563EB', bg: '#DBEAFE' },
            { val: upcomingCount, label: 'Upcoming', color: '#10B981', bg: '#DCFCE7' },
            { val: pastCount, label: 'Past', color: '#64748B', bg: '#F1F5F9' },
            { val: holidays.filter((h) => h.type === 'public').length, label: 'Public', color: '#4F46E5', bg: '#EEF2FF' },
          ]} />
          <AdminTabPills tabs={TABS} active={activeTab} onChange={setActiveTab} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder="Search holidays..." />
          {loading ? (
            <View>{[1, 2, 3, 4].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : filtered.length === 0 ? (
            <EmptyState icon="📅" title="No holidays" message="Add holidays for your organization." />
          ) : (
            filtered.map((h) => {
              const c = typeColor(h.type);
              const d = new Date(h.date);
              return (
                <AdminListCard key={h.id} onPress={() => openDetail(h)}>
                  <View style={[styles.dateBox, { backgroundColor: c + '18' }]}>
                    <Text style={[styles.dateDay, { color: c }]}>{d.getDate()}</Text>
                    <Text style={[styles.dateMonth, { color: c }]}>{d.toLocaleString('default', { month: 'short' }).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={adminStyles.listTitle}>{h.name}</Text>
                    <Text style={adminStyles.listSub}>
                      {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                    {h.description ? <Text style={styles.desc} numberOfLines={1}>{h.description}</Text> : null}
                  </View>
                  <Badge status={h.type === 'public' ? 'active' : h.type === 'optional' ? 'pending' : 'submitted'} label={h.type} size="sm" />
                </AdminListCard>
              );
            })
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle="Holiday Detail"
        createTitle="Add Holiday"
        editTitle="Edit Holiday"
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        saveLabel={isCreating ? 'Create Holiday' : 'Update Holiday'}
        viewContent={selectedItem && (
          <AdminDetailRows rows={[
            { label: 'Name', value: selectedItem.name, valueStyle: { textTransform: 'none' } },
            { label: 'Date', value: selectedItem.date ? new Date(selectedItem.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—', valueStyle: { textTransform: 'none' } },
            { label: 'Type', value: selectedItem.type },
            { label: 'Description', value: selectedItem.description || '—', valueStyle: { textTransform: 'none' }, numberOfLines: 4 },
          ]} />
        )}
      >
        <AdminFieldLabel>Name *</AdminFieldLabel>
        <AdminInput value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Holiday name" />
        <AdminFieldLabel>Date * (YYYY-MM-DD)</AdminFieldLabel>
        <AdminInput value={form.date} onChangeText={(v) => setForm((f) => ({ ...f, date: v }))} placeholder="2026-01-26" />
        <AdminFieldLabel>Type</AdminFieldLabel>
        <AdminPillGrid options={TYPE_OPTIONS} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />
        <AdminFieldLabel>Description</AdminFieldLabel>
        <AdminInput value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Optional description" multiline style={{ height: 80, textAlignVertical: 'top' }} />
      </AdminCrudSheet>
    </View>
  );
};


export default HolidayScreen;
