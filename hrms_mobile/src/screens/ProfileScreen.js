import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { radii, spacing, shadows } from '../theme';
import { Avatar } from '../components/UI';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { useScrollTopBar } from '../hooks/useScrollTopBar';

const THEME_OPTIONS = [
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
];

const ProfileScreen = () => {
  const { user, logout } = useAuth();
  const { colors, mode, setMode, isDark } = useTheme();
  const scrollTopBar = useScrollTopBar();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [showPassword, setShowPassword] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);

  const roleLabel = (user?.role || 'employee').replace(/_/g, ' ');
  const isAdmin = ['admin', 'superadmin', 'hr_admin', 'hr_manager'].includes(user?.role);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/auth/me', { fullName, phone });
      Alert.alert('Done', 'Profile updated.');
      setEditMode(false);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPass || !newPass || newPass !== confirmPass) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: currentPass, newPassword: newPass });
      Alert.alert('Done', 'Password changed.');
      setShowPassword(false);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 24 })}
      refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#1C64F2', '#4F46E5', '#6366F1']} style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
        <View style={styles.heroOrb1} />
        <View style={styles.heroOrb2} />
        <View style={styles.profileSection}>
          <View style={styles.avatarHalo}>
            <Avatar
              firstName={user?.fullName?.split(' ')[0]}
              lastName={user?.fullName?.split(' ').slice(1).join(' ')}
              size={96}
              premium
              status="online"
            />
          </View>
          <Text style={styles.profileName}>{user?.fullName || user?.email}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Ionicons name={isAdmin ? 'shield-checkmark' : 'person'} size={12} color="#FFF" />
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Active</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.quickStats}>
          <View style={styles.quickStat}>
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
            <Text style={styles.quickStatLabel}>Email</Text>
            <Text style={styles.quickStatVal} numberOfLines={1}>{user?.email || '—'}</Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="call-outline" size={18} color={colors.primary} />
            <Text style={styles.quickStatLabel}>Phone</Text>
            <Text style={styles.quickStatVal}>{user?.phone || '—'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.primarySurface }]}>
                <Ionicons name="person-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Profile Information</Text>
            </View>
            <TouchableOpacity onPress={() => setEditMode(!editMode)}>
              <Text style={styles.editBtn}>{editMode ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>
          {editMode ? (
            <>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholderTextColor={colors.textTertiary} />
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.textTertiary} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <InfoRow label="Full Name" value={user?.fullName} styles={styles} />
              <InfoRow label="Email" value={user?.email} styles={styles} />
              <InfoRow label="Phone" value={user?.phone || '—'} styles={styles} />
              <InfoRow label="Role" value={roleLabel} styles={styles} last />
            </>
          )}
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowPassword(!showPassword)}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.warningSurface }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.warning} />
              </View>
              <Text style={styles.sectionTitle}>Change Password</Text>
            </View>
            <Ionicons name={showPassword ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textTertiary} />
          </TouchableOpacity>
          {showPassword && (
            <>
              <Text style={styles.inputLabel}>Current Password</Text>
              <TextInput style={styles.input} value={currentPass} onChangeText={setCurrentPass} secureTextEntry placeholderTextColor={colors.textTertiary} />
              <Text style={styles.inputLabel}>New Password</Text>
              <TextInput style={styles.input} value={newPass} onChangeText={setNewPass} secureTextEntry placeholderTextColor={colors.textTertiary} />
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput style={styles.input} value={confirmPass} onChangeText={setConfirmPass} secureTextEntry placeholderTextColor={colors.textTertiary} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Updating...' : 'Update Password'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.purpleSurface }]}>
                <Ionicons name="color-palette-outline" size={18} color={colors.purple} />
              </View>
              <Text style={styles.sectionTitle}>Appearance</Text>
            </View>
          </View>
          <Text style={styles.themeHint}>Choose light or dark theme for the app</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.themePill, active && styles.themePillActive]}
                  onPress={() => setMode(opt.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={opt.icon} size={20} color={active ? '#FFF' : colors.textSecondary} />
                  <Text style={[styles.themePillText, active && styles.themePillTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <InfoRow label="Current theme" value={mode === 'dark' ? 'Dark' : 'Light'} styles={styles} last />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.infoSurface }]}>
                <Ionicons name="settings-outline" size={18} color={colors.info} />
              </View>
              <Text style={styles.sectionTitle}>App Settings</Text>
            </View>
          </View>
          <InfoRow label="Notifications" value="Enabled" styles={styles} />
          <InfoRow label="Version" value="1.0.0" styles={styles} last />
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: logout },
          ])}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>HRMS.Pro! v1.0.0</Text>
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
};

const InfoRow = ({ label, value, styles, last }) => (
  <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value || '—'}</Text>
  </View>
);

const createStyles = (colors, isDark) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: {
    paddingTop: 16,
    paddingBottom: spacing.xxxl + 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    alignItems: 'center' },
  heroOrb1: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -50 },
  heroOrb2: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(167,139,250,0.18)', bottom: -20, left: 10 },
  profileSection: { alignItems: 'center', paddingHorizontal: spacing.xl, zIndex: 1 },
  avatarHalo: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 10 } }) },
  profileName: { fontSize: 26, fontWeight: '800', color: '#FFF', marginTop: spacing.md, letterSpacing: -0.4, textAlign: 'center' },
  profileEmail: { fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 4 },
  badgeRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)' },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF', textTransform: 'capitalize' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34D399' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#D1FAE5' },
  body: { padding: spacing.xl, paddingTop: spacing.lg, marginTop: spacing.md },
  quickStats: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg, marginTop: spacing.sm },
  quickStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card },
  quickStatLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  quickStatVal: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  editBtn: { fontSize: 14, fontWeight: '600', color: colors.primary },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  infoLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginLeft: 2 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 14,
    fontSize: 15,
    color: colors.text },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radii.lg, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  themeHint: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  themeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  themePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border },
  themePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  themePillText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  themePillTextActive: { color: '#FFF' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerSurface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? colors.dangerBorder : colors.danger + '30',
    marginTop: spacing.sm },
  logoutText: { fontSize: 16, fontWeight: '700', color: colors.danger },
  footer: { textAlign: 'center', color: colors.textTertiary, fontSize: 12, marginTop: spacing.xl } });

export default ProfileScreen;
