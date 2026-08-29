import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii, spacing, shadows } from '../theme';
import { Card, Badge, EmptyState, GradientButton, Avatar, Divider } from '../components/UI';
import { StatBox, TabPill } from '../components/Charts';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.dark, paddingTop: 56, paddingBottom: spacing.xxl, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -10, left: 30 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl },
  searchRow: { marginBottom: spacing.md },
  searchInput: { backgroundColor: colors.surface, borderRadius: radii.input, padding: 12, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginLeft: 2 },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radii.input, padding: 12, marginBottom: 14, fontSize: 14, color: colors.text },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  switchLabel: { fontSize: 14, fontWeight: '500', color: colors.text } });
const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'General' },
  { key: 'notifications', label: 'Alerts' },
];


const SettingsScreen = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSms, setNotifSms] = useState(false);
  const [notifPush, setNotifPush] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.allSettled([
        api.get('/settings/users'),
        api.get('/settings/general'),
      ]);
      if (uRes.status === 'fulfilled') { const d = uRes.value.data; setUsers(d?.data || d?.items || (Array.isArray(d) ? d : [])); }
      if (sRes.status === 'fulfilled') {
        const d = sRes.value.data;
        const settings = d?.data || d?.items || (Array.isArray(d) ? d[0] : null);
        if (settings) {
          setCompanyName(settings.company_name || '');
          setCompanyEmail(settings.company_email || '');
          setCompanyPhone(settings.company_phone || '');
          setCompanyAddress(settings.company_address || '');
          setNotifEmail(settings.notify_email !== false);
          setNotifSms(settings.notify_sms === true);
          setNotifPush(settings.notify_push !== false);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

  const handleSaveGeneral = async () => {
    try {
      await api.put('/settings/general', {
        company_name: companyName, company_email: companyEmail,
        company_phone: companyPhone, company_address: companyAddress });
      Alert.alert('Success', 'Settings saved.');
    } catch (e) { Alert.alert('Error', 'Failed.'); }
  };

  const handleSaveNotifs = async () => {
    try {
      await api.put('/settings/notifications', {
        notify_email: notifEmail, notify_sms: notifSms, notify_push: notifPush });
      Alert.alert('Success', 'Notification settings saved.');
    } catch (e) { Alert.alert('Error', 'Failed.'); }
  };

  const handleUpdateRole = (u, role) => {
    Alert.alert('Update Role', `Set ${u.username || u.email} to "${role}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Update', onPress: async () => {
        try { await api.put(`/settings/users/${u.id}`, { role }); fetchData(); } catch (e) { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const handleToggleStatus = (u) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    Alert.alert('Toggle Status', `Set ${u.username || u.email} to "${newStatus}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: async () => {
        try { await api.put(`/settings/users/${u.id}`, { status: newStatus }); fetchData(); } catch (e) { Alert.alert('Error', 'Failed.'); }
      }},
    ]);
  };

  const filteredUsers = users.filter(u => !search || (u.username || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <ScrollView style={styles.container} refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroOrb1} /><View style={styles.heroOrb2} />
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Settings</Text>
          <Text style={styles.heroSub}>Manage users and configuration</Text>
        </View>
      </View>
      <View style={styles.body}>
        <TabPill tabs={TABS} active={tab} onChange={t => { setTab(t); setSearch(''); }} />

        {tab === 'users' && (
          <>
            <View style={styles.searchRow}>
              <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="🔍  Search users..." placeholderTextColor={colors.textTertiary} />
            </View>
            {loading ? <SkeletonBlock /> : filteredUsers.length === 0 ? (
              <EmptyState icon="👥" title="No users" message="No users found." />
            ) : (
              filteredUsers.map((u, i) => (
                <Card key={u.id || i}>
                  <View style={styles.itemRow}>
                    <Avatar firstName={u.username?.split(' ')[0] || u.email?.split('@')[0]} lastName={u.username?.split(' ').slice(1).join('')} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{u.username || u.email}</Text>
                      <Text style={styles.itemSub}>{u.email} • {u.role || 'user'}</Text>
                      <View style={styles.badgeRow}>
                        <Badge status={u.status === 'active' ? 'active' : 'inactive'} label={u.status || 'active'} size="sm" />
                        {u.last_login && <Text style={{ fontSize: 10, color: colors.textTertiary, marginLeft: 4 }}>Last: {new Date(u.last_login).toLocaleDateString()}</Text>}
                      </View>
                    </View>
                    <View style={{ gap: spacing.xs }}>
                      <TouchableOpacity onPress={() => handleUpdateRole(u, u.role === 'admin' ? 'user' : 'admin')}>
                        <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>{u.role === 'admin' ? 'Demote' : 'Promote'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleToggleStatus(u)}>
                        <Text style={{ fontSize: 11, color: u.status === 'active' ? colors.danger : colors.success, fontWeight: '600' }}>{u.status === 'active' ? 'Deactivate' : 'Activate'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {tab === 'settings' && (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Company Information</Text>
              <Divider style={{ marginBottom: spacing.md }} />
              <Text style={styles.inputLabel}>Company Name</Text>
              <TextInput style={styles.input} value={companyName} onChangeText={setCompanyName} placeholder="Company name" placeholderTextColor={colors.textTertiary} />
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput style={styles.input} value={companyEmail} onChangeText={setCompanyEmail} placeholder="Company email" placeholderTextColor={colors.textTertiary} keyboardType="email-address" />
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput style={styles.input} value={companyPhone} onChangeText={setCompanyPhone} placeholder="Phone" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
              <Text style={styles.inputLabel}>Address</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={companyAddress} onChangeText={setCompanyAddress} placeholder="Address" placeholderTextColor={colors.textTertiary} multiline />
              <GradientButton title="Save Settings" onPress={handleSaveGeneral} />
            </Card>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <Card>
              <Text style={styles.sectionTitle}>Notification Preferences</Text>
              <Divider style={{ marginBottom: spacing.md }} />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Email Notifications</Text>
                <Switch value={notifEmail} onValueChange={setNotifEmail} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notifEmail ? '#FFF' : '#F5F5F5'} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>SMS Notifications</Text>
                <Switch value={notifSms} onValueChange={setNotifSms} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notifSms ? '#FFF' : '#F5F5F5'} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Push Notifications</Text>
                <Switch value={notifPush} onValueChange={setNotifPush} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notifPush ? '#FFF' : '#F5F5F5'} />
              </View>
              <GradientButton title="Save Preferences" onPress={handleSaveNotifs} style={{ marginTop: spacing.md }} />
            </Card>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const SkeletonBlock = () => {
  const { colors } = useTheme();
  return <View style={{ height: 80, backgroundColor: colors.shimmer, borderRadius: 16, marginBottom: 12, opacity: 0.6 }} />;
};

export default SettingsScreen;
