import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { Badge } from '../components/UI';
import { useTheme } from '../context/ThemeContext';
import { EmptyState } from '../components/UI';
import {
  useAdminStyles, AdminHeader, AdminStatRow, AdminTabPills, AdminSearchBar,
  AdminListCard, AdminFieldLabel, AdminInput, AdminCrudSheet, AdminDetailRows, AdminModalShell, scrollViewTopBarProps, useScrollTopBar } from '../components/AdminScreenKit';

const TABS = [
  { key: 'companies', label: 'Companies' },
  { key: 'branches', label: 'Branches' },
  { key: 'departments', label: 'Departments' },
  { key: 'designations', label: 'Designations' },
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
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const STATUS_OPTIONS = [
    { label: 'All Status', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ];
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const isModalOpen = !!selectedItem || isCreating;
  const entityLabel = tab === 'companies' ? 'company' : tab === 'branches' ? 'branch' : tab === 'departments' ? 'department' : 'designation';
  const EntityLabel = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);

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

  const selectedCompanyName = companyFilter ? (companies.find((c) => String(c.id) === companyFilter)?.name || 'Select company') : 'All Companies';
  const companyOptions = companies.filter((c) => !companySearch.trim() || (c.name || '').toLowerCase().includes(companySearch.trim().toLowerCase()));
  const data = { companies, branches, departments, designations }[tab] || [];
  const itemCompanyId = (d) => d.companyId ?? d.company_id ?? d.company?.id;
  const filtered = data.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (d.name || '').toLowerCase().includes(q) || (d.code || '').toLowerCase().includes(q) || (d.title || '').toLowerCase().includes(q);
    const matchCompany = tab === 'companies' || !companyFilter || String(itemCompanyId(d) ?? '') === companyFilter;
    const rawActive = d.isActive ?? d.is_active;
    const statusVal = typeof rawActive === 'boolean' ? (rawActive ? 'active' : 'inactive') : (d.status || '').toLowerCase();
    const matchStatus = !statusFilter || statusVal === statusFilter;
    return matchSearch && matchCompany && matchStatus;
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
          <AdminTabPills tabs={TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); setCompanyFilter(''); setStatusFilter(''); closeModal(); }} />
          <AdminSearchBar value={search} onChangeText={setSearch} placeholder={`Search ${tab}...`} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(tab !== 'companies' && companies.length > 0) && (
              <TouchableOpacity
                style={[adminStyles.searchRow, { flex: 1 }]}
                onPress={() => { setCompanySearch(''); setCompanyDropdownOpen(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="business" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
                <Text style={[adminStyles.searchInput, { paddingVertical: 0, color: companyFilter ? colors.text : colors.textTertiary }]} numberOfLines={1}>
                  {selectedCompanyName}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[adminStyles.searchRow, { flex: 1 }]}
              onPress={() => setStatusDropdownOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="pricetag" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
              <Text style={[adminStyles.searchInput, { paddingVertical: 0, color: statusFilter ? colors.text : colors.textTertiary }]} numberOfLines={1}>
                {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || 'All Status'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
              <AdminModalShell visible={companyDropdownOpen} onClose={() => setCompanyDropdownOpen(false)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Select Company</Text>
                  <TouchableOpacity onPress={() => setCompanyDropdownOpen(false)}>
                    <Ionicons name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={adminStyles.searchRow}>
                  <Ionicons name="search" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={adminStyles.searchInput}
                    value={companySearch}
                    onChangeText={setCompanySearch}
                    placeholder="Search company..."
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={{ maxHeight: 320 }}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
                      onPress={() => { setCompanyFilter(''); setCompanyDropdownOpen(false); }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: companyFilter === '' ? '700' : '400', color: colors.text }}>All Companies</Text>
                      {companyFilter === '' && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                    </TouchableOpacity>
                    {companyOptions.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
                        onPress={() => { setCompanyFilter(String(c.id)); setCompanyDropdownOpen(false); }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: companyFilter === String(c.id) ? '700' : '400', color: colors.text }}>{c.name}</Text>
                        {companyFilter === String(c.id) && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </AdminModalShell>
          <AdminModalShell visible={statusDropdownOpen} onClose={() => setStatusDropdownOpen(false)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Select Status</Text>
              <TouchableOpacity onPress={() => setStatusDropdownOpen(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ maxHeight: 320 }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {STATUS_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.value || 'all'}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}
                    onPress={() => { setStatusFilter(o.value); setStatusDropdownOpen(false); }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: statusFilter === o.value ? '700' : '400', color: colors.text }}>{o.label}</Text>
                    {statusFilter === o.value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </AdminModalShell>
          {loading ? (
            <View>{[1, 2, 3, 4].map((i) => <View key={i} style={adminStyles.skeleton} />)}</View>
          ) : filtered.length === 0 ? (
            <EmptyState icon="🏢" title={`No ${tab}`} message={`Add your first ${entityLabel}.`} />
          ) : (
            filtered.map((item) => (
              <AdminListCard key={item.id} onPress={() => openDetail(item)}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[adminStyles.listTitle, { flex: 1 }]}>{item.name || item.title}</Text>
                    {item.status ? <Badge status={item.status} size="sm" /> : null}
                  </View>
                  {item.code ? <Text style={adminStyles.listSub}>Code: {item.code}</Text> : null}
                  {(tab === 'companies') ? <Text style={adminStyles.listSub}>✉️ Email: {item.email || 'None'}</Text> : (item.email ? <Text style={adminStyles.listSub}>{item.email}</Text> : null)}
                  {(tab === 'companies') ? <Text style={adminStyles.listSub}>📞 Phone: {item.phone || 'None'}</Text> : (item.phone ? <Text style={adminStyles.listSub}>{item.phone}</Text> : null)}
                  {(item.location && tab !== 'branches') ? <Text style={adminStyles.listSub}>📍 {item.location}</Text> : null}
                  {(tab !== 'companies') ? <Text style={adminStyles.listSub}>🏢 Company: {companies.find((c) => String(c.id) === String(item.companyId ?? item.company_id))?.name || item.companyName || item.company_name || 'None'}</Text> : null}
                  {(tab === 'companies') ? <Text style={adminStyles.listSub}>🏠 Address: {item.address || 'None'}</Text> : (tab === 'branches') ? <Text style={adminStyles.listSub}>🏠 Address: {item.address || item.location || 'None'}</Text> : (item.address ? <Text style={adminStyles.listSub}>🏠 {item.address}</Text> : null)}
                  {(item.latitude || item.longitude) ? <Text style={adminStyles.listSub}>Lat: {item.latitude || '—'}, Long: {item.longitude || '—'}</Text> : null}
                  {(item.managerName || item.manager_name) ? <Text style={adminStyles.listSub}>👤 Department Head - {item.managerName || item.manager_name}</Text> : (tab === 'departments' ? <Text style={adminStyles.listSub}>👤 Department Head - None</Text> : null)}
                  {(item.grade || tab === 'designations') ? <Text style={adminStyles.listSub}>🎖️ Grade: {item.grade || 'None'}</Text> : null}
                  {(tab === 'companies') ? <Text style={adminStyles.listSub}>🧾 GST: {item.taxId || item.gstNo || item.gst || 'None'}</Text> : ((item.taxId || item.gstNo || item.gst) ? <Text style={adminStyles.listSub}>🧾 GST: {item.taxId || item.gstNo || item.gst}</Text> : null)}
                </View>
              </AdminListCard>
            ))
          )}
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <AdminCrudSheet
        visible={isModalOpen}
        detailTitle={`${EntityLabel} Detail`}
        createTitle={`Add ${EntityLabel}`}
        editTitle={`Edit ${EntityLabel}`}
        onClose={closeModal}
        onCancelEdit={() => setIsEditing(false)}
        isEditing={isEditing}
        isCreating={isCreating}
        onStartEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onDelete={handleDelete}
        saving={saving}
        saveLabel={isCreating ? `Create ${EntityLabel}` : `Update ${EntityLabel}`}
        viewContent={selectedItem && (
          <AdminDetailRows rows={[
            { label: 'Name', value: selectedItem.name || selectedItem.title, valueStyle: { textTransform: 'none' } },
            { label: 'Status', value: selectedItem.status || '—', valueStyle: { textTransform: 'none' } },
            { label: 'Code', value: selectedItem.code || '—', valueStyle: { textTransform: 'none' } },
            ...(tab !== 'companies' ? [{ label: 'Company', value: companies.find((c) => String(c.id) === String(selectedItem.companyId ?? selectedItem.company_id))?.name || selectedItem.companyName || selectedItem.company_name || '—', valueStyle: { textTransform: 'none' } }] : []),
            ...(tab === 'companies' || selectedItem.email ? [{ label: 'Email', value: selectedItem.email || '—', valueStyle: { textTransform: 'none' } }] : []),
            ...(tab === 'companies' || selectedItem.phone ? [{ label: 'Phone', value: selectedItem.phone || '—', valueStyle: { textTransform: 'none' } }] : []),
            ...(selectedItem.location ? [{ label: 'Location', value: selectedItem.location, valueStyle: { textTransform: 'none' } }] : []),
            ...(tab === 'departments' || selectedItem.managerName || selectedItem.manager_name ? [{ label: 'Department Head', value: selectedItem.managerName || selectedItem.manager_name || '—', valueStyle: { textTransform: 'none' } }] : []),
            ...(tab === 'designations' || selectedItem.grade ? [{ label: 'Grade', value: selectedItem.grade || '—', valueStyle: { textTransform: 'none' } }] : []),
            ...(tab === 'companies' || tab === 'branches' || selectedItem.address ? [{ label: 'Address', value: selectedItem.address || '—', valueStyle: { textTransform: 'none' } }] : []),
            ...((tab === 'branches' || (tab !== 'companies' && (selectedItem.latitude || selectedItem.longitude))) ? [{ label: 'Latitude', value: selectedItem.latitude != null && selectedItem.latitude !== '' ? String(selectedItem.latitude) : '—', valueStyle: { textTransform: 'none' } }, { label: 'Longitude', value: selectedItem.longitude != null && selectedItem.longitude !== '' ? String(selectedItem.longitude) : '—', valueStyle: { textTransform: 'none' } }] : []),
            ...(tab === 'companies' || selectedItem.taxId || selectedItem.gstNo || selectedItem.gst ? [{ label: 'GST', value: selectedItem.taxId || selectedItem.gstNo || selectedItem.gst || '—', valueStyle: { textTransform: 'none' } }] : []),
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
