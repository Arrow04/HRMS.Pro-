import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { getTimezone } from '../utils/timezone';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii, spacing, shadows } from '../theme';
import { Card, Badge, EmptyState, GradientButton, Avatar, Divider } from '../components/UI';
import { StatBox, TabPill } from '../components/Charts';
import { Ionicons } from '@expo/vector-icons';
import { scrollViewTopBarProps, useScrollTopBar, bannerShellStyle } from '../components/AdminScreenKit';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.dark, paddingTop: spacing.xl, paddingBottom: spacing.xxl, borderRadius: 32, overflow: 'hidden' },
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


const SettingsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const scrollTopBar = useScrollTopBar();
  const isAdmin = ['admin', 'superadmin', 'hr_admin', 'hr_manager'].includes(user?.role);
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
  const [notifAttendance, setNotifAttendance] = useState(true);

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

  const filteredUsers = isAdmin ? users : users.filter(u => u.id === user?.id || u.email === user?.email);

  return (
    <ScrollView {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 16 })} style={styles.container} refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
        <View style={styles.heroOrb1} /><View style={styles.heroOrb2} />
        <View style={[styles.heroContent, { flexDirection: 'row', alignItems: 'center' }]}>
          {navigation?.canGoBack?.() && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name="chevron-back" size={22} color="#FFF" />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.heroTitle}>Settings</Text>
            <Text style={styles.heroSub}>Manage users and configuration</Text>
          </View>
        </View>
      </View>
      <View style={styles.body}>
        <TabPill tabs={TABS} active={tab} onChange={t => { setTab(t); setSearch(''); }} />

        {tab === 'users' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 12, marginTop: 2, marginBottom: 14 }}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
              <Text style={{ fontSize: 12, color: colors.textTertiary, flex: 1 }}>Only administrators can manage users.</Text>
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
                        {u.last_login && <Text style={{ fontSize: 10, color: colors.textTertiary, marginLeft: 4 }}>Last: {new Date(u.last_login).toLocaleDateString('en-US', { timeZone: getTimezone() })}</Text>}
                      </View>
                      {isAdmin && u.id !== user?.id && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity
                            onPress={() => handleToggleStatus(u)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: u.status === 'active' ? colors.dangerSurface : colors.successSurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                          >
                            <Ionicons name={u.status === 'active' ? 'pause-circle-outline' : 'checkmark-circle-outline'} size={14} color={u.status === 'active' ? colors.danger : colors.success} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: u.status === 'active' ? colors.danger : colors.success }}>{u.status === 'active' ? 'Deactivate' : 'Activate'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleUpdateRole(u, u.role === 'admin' ? 'hr_manager' : 'admin')}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                          >
                            <Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>{u.role === 'admin' ? 'Make HR Mgr' : 'Make Admin'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {tab === 'settings' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 12, marginTop: 2, marginBottom: 14 }}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
                <Text style={{ fontSize: 12, color: colors.textTertiary, flex: 1 }}>Only administrators can manage company settings.</Text>
            </View>
            <Card>
              <Text style={styles.sectionTitle}>Company Information</Text>
              <Divider style={{ marginBottom: spacing.md }} />
              <Text style={styles.inputLabel}>Company Name</Text>
              <TextInput style={styles.input} value={companyName} onChangeText={setCompanyName} editable={isAdmin} placeholder="Company name" placeholderTextColor={colors.textTertiary} />
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput style={styles.input} value={companyEmail} onChangeText={setCompanyEmail} editable={isAdmin} placeholder="Company email" placeholderTextColor={colors.textTertiary} keyboardType="email-address" />
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput style={styles.input} value={companyPhone} onChangeText={setCompanyPhone} editable={isAdmin} placeholder="Phone" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
              <Text style={styles.inputLabel}>Address</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={companyAddress} onChangeText={setCompanyAddress} editable={isAdmin} placeholder="Address" placeholderTextColor={colors.textTertiary} multiline />
              {isAdmin && <GradientButton title="Save Settings" onPress={handleSaveGeneral} />}
            </Card>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 12, marginTop: 2, marginBottom: 14 }}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
                <Text style={{ fontSize: 12, color: colors.textTertiary, flex: 1 }}>Only administrators can manage notification preferences.</Text>
            </View>
            <Card>
              <Text style={styles.sectionTitle}>Notification Preferences</Text>
              <Divider style={{ marginBottom: spacing.md }} />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Email Notifications</Text>
                <Switch value={notifEmail} disabled={!isAdmin} onValueChange={setNotifEmail} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notifEmail ? '#FFF' : '#F5F5F5'} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>SMS Notifications</Text>
                <Switch value={notifSms} disabled={!isAdmin} onValueChange={setNotifSms} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notifSms ? '#FFF' : '#F5F5F5'} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Push Notifications</Text>
                <Switch value={notifPush} disabled={!isAdmin} onValueChange={setNotifPush} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notifPush ? '#FFF' : '#F5F5F5'} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Attendance Reminder</Text>
                <Switch value={notifAttendance} disabled={!isAdmin} onValueChange={setNotifAttendance} trackColor={{ false: colors.border, true: colors.primaryLight }} thumbColor={notifAttendance ? '#FFF' : '#F5F5F5'} />
              </View>
              {isAdmin && <GradientButton title="Save Preferences" onPress={handleSaveNotifs} style={{ marginTop: spacing.md }} />}
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
