import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { radii, shadows } from '../theme';
import { Avatar } from '../components/UI';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';

const { width: W } = Dimensions.get('window');
const GRID_ITEM = (W - 40 - 16 * 2) / 3;

const MY_HR_ITEMS = [
  { icon: 'calendar-outline', label: 'Leave', screen: 'Leaves', color: '#4F46E5' },
  { icon: 'time-outline', label: 'History', screen: 'AttendanceHistory', color: '#3B82F6' },
  { icon: 'card-outline', label: 'Payslips', screen: 'Payslips', color: '#059669' },
  { icon: 'wallet-outline', label: 'Expenses', screen: 'Expenses', color: '#F59E0B' },
  { icon: 'calendar-clear-outline', label: 'Holidays', screen: 'Holidays', color: '#0D9488' },
  { icon: 'star-outline', label: 'Performance', screen: 'MyPerformance', color: '#8B5CF6' },
];

const ADMIN_ITEMS = [
  { icon: 'people-outline', label: 'Employees', screen: 'Employees', color: '#6366F1' },
  { icon: 'finger-print-outline', label: 'Attendance', screen: 'AdminAttendance', color: '#3B82F6' },
  { icon: 'calendar-outline', label: 'Leaves', screen: 'AdminLeaves', color: '#4F46E5' },
  { icon: 'checkmark-done-outline', label: 'Approvals', screen: 'Approvals', color: '#10B981' },
  { icon: 'alert-circle-outline', label: 'Anomalies', screen: 'AdminAnomalies', color: '#DC2626' },
  { icon: 'wallet-outline', label: 'Expenses', screen: 'Expenses', color: '#F59E0B' },
  { icon: 'business-outline', label: 'Organization', screen: 'Company', color: '#1C64F2' },
  { icon: 'calendar-outline', label: 'Holidays', screen: 'Holidays', color: '#4F46E5' },
  { icon: 'cash-outline', label: 'Payroll', screen: 'PayrollAdmin', color: '#059669' },
  { icon: 'document-text-outline', label: 'Recruitment', screen: 'Recruitment', color: '#7C3AED' },
  { icon: 'star-outline', label: 'Performance', screen: 'Performance', color: '#F59E0B' },
  { icon: 'laptop-outline', label: 'Assets', screen: 'Assets', color: '#0D9488' },
  { icon: 'exit-outline', label: 'Exit Mgmt', screen: 'ExitMgmt', color: '#DC2626' },
  { icon: 'bar-chart-outline', label: 'Reports', screen: 'Reports', color: '#4F46E5' },
  { icon: 'settings-outline', label: 'Settings', screen: 'Settings', color: '#334155' },
];

function MenuGrid({ items, navigation, colors, isDark }) {
  return (
    <View style={styles.menuGrid}>
      {items.map((item, i) => (
        <TouchableOpacity
          key={`${item.screen}-${i}`}
          style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate(item.screen)}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: item.color + (isDark ? '22' : '12') }]}>
            <Ionicons name={item.icon} size={24} color={item.color} />
          </View>
          <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const MoreScreen = ({ navigation }) => {
  const { user, fetchPermissions } = useAuth();
  const { colors, isDark } = useTheme();
  const themed = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const isAdmin = ['admin', 'superadmin', 'hr_admin', 'hr_manager'].includes(user?.role);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const scrollTopBar = useScrollTopBar();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const roleLabel = (user?.role || 'employee').replace(/_/g, ' ');

  const loadMenuData = useCallback(async () => {
    try {
      await fetchPermissions?.();
      if (isAdmin) {
        const res = await api.get('/dashboard/summary');
        const summary = res.data || {};
        setPendingCount((summary.leaves?.pending || 0) + (summary.expenses?.pending || 0));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPermissions, isAdmin]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMenuData();
  }, [loadMenuData]);

  useEffect(() => {
    if (isAdmin) loadMenuData();
  }, [isAdmin, loadMenuData]);

  const handleChatPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    navigation.navigate('Chat');
  };

  return (
    <View style={themed.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#1C64F2', '#4F46E5', '#6366F1']} style={[themed.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={themed.heroOrb1} />
          <View style={themed.heroOrb2} />
          <View style={themed.heroContent}>
            <Text style={themed.heroTitle}>Menu</Text>
            <Text style={themed.heroSub}>Quick access to all modules</Text>

            <TouchableOpacity
              style={themed.profileCard}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.88}
            >
              <View style={themed.profileInner}>
                <View style={themed.avatarHalo}>
                  <Avatar
                    firstName={user?.fullName?.split(' ')[0]}
                    lastName={user?.fullName?.split(' ').slice(1).join(' ')}
                    size={64}
                    premium
                    status="online"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={themed.profileName} numberOfLines={1}>{user?.fullName || user?.email}</Text>
                  <View style={themed.roleRow}>
                    {isAdmin && <Ionicons name="shield-checkmark" size={12} color="#C7D2FE" />}
                    <Text style={themed.profileRole}>{roleLabel.toUpperCase()}</Text>
                    {isAdmin && pendingCount > 0 ? (
                      <View style={themed.pendingPill}>
                        <Text style={themed.pendingPillText}>{pendingCount} pending</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={themed.profileEmail} numberOfLines={1}>{user?.email}</Text>
                </View>
                <View style={themed.profileChevron}>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={themed.body}>
          <View style={themed.section}>
            <Text style={[themed.sectionTitle, { color: colors.textTertiary }]}>My HR</Text>
            <MenuGrid items={MY_HR_ITEMS} navigation={navigation} colors={colors} isDark={isDark} />
          </View>

          {isAdmin && (
            <View style={themed.section}>
              <Text style={[themed.sectionTitle, { color: colors.textTertiary }]}>Admin</Text>
              <MenuGrid items={ADMIN_ITEMS} navigation={navigation} colors={colors} isDark={isDark} />
            </View>
          )}

          <Text style={[themed.footer, { color: colors.textTertiary }]}>HRMS.Pro! v1.0.0</Text>
        </View>
      </ScrollView>

      <Animated.View style={[themed.fab, { bottom: TAB_BAR_CLEARANCE + 8, transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity style={themed.fabBtn} onPress={handleChatPress} activeOpacity={0.85}>
          <Ionicons name="chatbubble-ellipses" size={26} color="#FFF" />
        </TouchableOpacity>
        <Text style={themed.fabLabel}>Chat</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  menuItem: {
    width: GRID_ITEM,
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    ...shadows.card },
  menuIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  menuLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' } });

const createStyles = (colors, isDark) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, overflow: 'visible' },
  scroll: { flex: 1 },
  hero: {
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(79,70,229,0.15)', bottom: -10, left: 30 },
  heroContent: { paddingHorizontal: 20 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  profileCard: {
    marginTop: 18,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)' },
  profileInner: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatarHalo: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)' },
  profileName: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: -0.2 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  profileRole: { fontSize: 10, fontWeight: '800', color: '#C7D2FE', letterSpacing: 0.6 },
  profileEmail: { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 3 },
  profileChevron: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center' },
  pendingPill: {
    backgroundColor: 'rgba(254,226,226,0.95)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full },
  pendingPillText: { fontSize: 9, fontWeight: '800', color: '#DC2626' },
  body: { padding: 20, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  footer: { textAlign: 'center', fontSize: 11, marginTop: 24 },
  fab: { position: 'absolute', right: 20, alignItems: 'center' },
  fabBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#14B8A6',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.colored('#14B8A6', 0.4) },
  fabLabel: { fontSize: 10, fontWeight: '700', color: '#14B8A6', marginTop: 4 } });

export default MoreScreen;
