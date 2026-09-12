import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { Card, EmptyState } from '../components/UI';
import { radii, spacing, shadows } from '../theme';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';

const TYPE_COLORS = {
  leave: '#4F46E5',
  attendance: '#3B82F6',
  expense: '#F59E0B',
  payroll: '#059669',
  system: '#6366F1',
  announcement: '#EC4899',
};

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg, overflow: 'visible' },
  hero: {
    backgroundColor: colors.dark, paddingTop: spacing.xl, paddingBottom: spacing.xxl,
    borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(79,70,229,0.2)', bottom: -10, left: 20 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl, gap: 12, marginTop: -12 },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm, marginBottom: spacing.sm,
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderLight },
  content: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  bodyText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  meta: { fontSize: 11, color: colors.textTertiary, marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#14B8A6', marginTop: 6 },
  skeleton: {
    height: 90, borderRadius: radii.xl, backgroundColor: colors.shimmer, marginBottom: 12, opacity: 0.6 },
});

const NotificationsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, unreadRes] = await Promise.allSettled([
        api.get('/api/notifications', { params: { limit: 100 } }),
        api.get('/api/notifications/unread-count'),
      ]);
      if (notifRes.status === 'fulfilled') {
        const data = notifRes.value.data;
        setItems(Array.isArray(data) ? data : data?.items || data?.data || []);
      }
      if (unreadRes.status === 'fulfilled') {
        const count = unreadRes.value.data?.count || 0;
        setUnreadCount(count);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const sendTestNotification = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'HRMS Pro Test',
        body: 'Push notifications are working! You will receive leave, expense, and payroll updates here.',
        data: { screen: 'Dashboard' },
      },
      trigger: null,
    });
  };

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id) => {
    try {
      await api.put(`/api/notifications/${id}/read`);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const formatDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Notifications</Text>
            <Text style={styles.heroSub}>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <TouchableOpacity
            onPress={sendTestNotification}
            style={{ backgroundColor: '#14B8A6', padding: 12, borderRadius: 12, marginBottom: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Send Test Notification</Text>
          </TouchableOpacity>

          {loading ? (
            <>
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
            </>
          ) : items.length === 0 ? (
            <EmptyState title="No notifications" subtitle="You’re all caught up." icon="notifications-outline" />
          ) : (
            items.map((item) => {
              const type = item.type || 'system';
              const iconMap = {
                leave: 'calendar-outline',
                attendance: 'time-outline',
                expense: 'wallet-outline',
                payroll: 'card-outline',
                system: 'settings-outline',
                announcement: 'megaphone-outline',
              };
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (!item.isRead) markRead(item.id);
                  }}
                >
                  <Card style={[styles.card, !item.isRead ? { borderColor: '#14B8A6' } : null]}>
                    <View style={styles.iconWrap}>
                      <Ionicons name={iconMap[type] || 'notifications-outline'} size={20} color={TYPE_COLORS[type] || colors.textSecondary} />
                    </View>
                    <View style={styles.content}>
                      <Text style={styles.title}>{item.title || 'Notification'}</Text>
                      <Text style={styles.bodyText} numberOfLines={3}>{item.body || ''}</Text>
                      <Text style={styles.meta}>{formatDate(item.createdAt)}</Text>
                    </View>
                    {!item.isRead ? <View style={styles.unreadDot} /> : null}
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default NotificationsScreen;
