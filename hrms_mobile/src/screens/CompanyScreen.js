import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { EmptyState } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminCrudSheet, AdminDetailRows, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const TABS = [
  { key: 'companies', label: 'Companies' },
  { key: 'branches', label: 'Branches' },
  { key: 'departments', label: 'Depts' },
  { key: 'designations', label: 'Desigs' },
];

const ENDPOINTS = {
  companies: '/companies',
  branches: '/branches',
  departments: '/departments',
  designations: '/designations' };

const emptyForm = { name: '', code: '', email: '', phone: '' };

const CompanyScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const adminStyles = useAdminStyles();
  const scrollTopBar = useScrollTopBar();
  const [tab, setTab] = useState('companies');
  const [companies, setCompanies] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isModalOpen = !!selectedItem || isCreating;
  const entityLabel = tab.slice(0, -1);

  const fetchData = useCallback(async () => {
    try {
      const [compRes, branchRes, deptRes, desigRes] = await Promise.allSettled([
        api.get('/companies'), api.get('/branches'), api.get('/departments'), api.get('/designations'),
      ]);
      const pick = (res) => {
        if (res.status !== 'fulfilled') return [];
        const d = res.value.data;
        return d?.data || d?.items || (Array.isArray(d) ? d : []);
      };
      setCompanies(pick(compRes));
      setBranches(pick(branchRes));
      setDepartments(pick(deptRes));
      setDesignations(pick(desigRes));
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

  const openDetail = (item) => {
    setSelectedItem(item);
    setForm({
      name: item.name || item.title || '',
      code: item.code || '',
      email: item.email || '',
      phone: item.phone || '' });
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Name is required.'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), code: form.code.trim(), email: form.email.trim(), phone: form.phone.trim() };
      if (isCreating) await api.post(ENDPOINTS[tab], payload);
      else await api.put(`${ENDPOINTS[tab]}/${selectedItem.id}`, payload);
      Alert.alert('Success', isCreating ? `${entityLabel} created.` : `${entityLabel} updated.`);
      closeModal();
      fetchData();
    } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    const name = selectedItem.name || selectedItem.title;
    Alert.alert('Delete', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`${ENDPOINTS[tab]}/${selectedItem.id}`); closeModal(); fetchData(); }
        catch { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const data = { companies, branches, departments, designations }[tab] || [];
  const filtered = data.filter((d) => {
    const q = search.toLowerCase();
    return !q || (d.name || '').toLowerCase().includes(q) || (d.code || '').toLowerCase().includes(q) || (d.title || '').toLowerCase().includes(q);
  });

  return (
    <View style={adminStyles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar)}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminHeader navigation={navigation} title="Organization" subtitle="Companies, branches, departments" onAdd={openCreate} />
        <View style={adminStyles.body}>
          <AdminStatRow stats={[
            { val: companies.length, label: 'Companies', color: '#2563EB', bg: '#DBEAFE' },
            { val: branches.length, label: 'Branches', color: '#4F46E5', bg: '#EEF2FF' },
            { val: departments.length, label: 'Departments', color: '#10B981', bg: '#DCFCE7' },
            { val: designations.length, label: 'Designations', color: '#D97706', bg: '#FEF3C7' },
          ]} />
          <AdminTabPills tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); closeModal(); }} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder={`Search ${tab}...`} />
          {loading ? (
            <View>{[1, 2, 3, 4].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : filtered.length === 0 ? (
            <EmptyState icon="🏢" title={`No ${tab}`} message={`Add your first ${entityLabel}.`} />
          ) : (
            filtered.map((item) => (
              <AdminListCard key={item.id} onPress={() => openDetail(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={adminStyles.listTitle}>{item.name || item.title}</Text>
                  {item.code ? <Text style={adminStyles.listSub}>Code: {item.code}</Text> : null}
                  {item.email ? <Text style={adminStyles.listSub}>{item.email}</Text> : null}
                  {item.location ? <Text style={adminStyles.listSub}>📍 {item.location}</Text> : null}
                </View>
              </AdminListCard>
            ))
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle={`${entityLabel} Detail`}
        createTitle={`Add ${entityLabel}`}
        editTitle={`Edit ${entityLabel}`}
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        saveLabel={isCreating ? `Create ${entityLabel}` : `Update ${entityLabel}`}
        viewContent={selectedItem && (
          <AdminDetailRows rows={[
            { label: 'Name', value: selectedItem.name || selectedItem.title, valueStyle: { textTransform: 'none' } },
            { label: 'Code', value: selectedItem.code || '—', valueStyle: { textTransform: 'none' } },
            { label: 'Email', value: selectedItem.email || '—', valueStyle: { textTransform: 'none' } },
            { label: 'Phone', value: selectedItem.phone || '—', valueStyle: { textTransform: 'none' } },
            { label: 'Location', value: selectedItem.location || '—', valueStyle: { textTransform: 'none' } },
          ]} />
        )}
      >
        <AdminFieldLabel>Name *</AdminFieldLabel>
        <AdminInput value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Name" />
        <AdminFieldLabel>Code</AdminFieldLabel>
        <AdminInput value={form.code} onChangeText={(v) => setForm((f) => ({ ...f, code: v }))} placeholder="Code" />
        <AdminFieldLabel>Email</AdminFieldLabel>
        <AdminInput value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
        <AdminFieldLabel>Phone</AdminFieldLabel>
        <AdminInput value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="Phone" keyboardType="phone-pad" />
      </AdminCrudSheet>
    </View>
  );
};

export default CompanyScreen;
