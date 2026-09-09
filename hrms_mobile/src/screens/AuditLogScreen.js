import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { Card, EmptyState } from '../components/UI';
import { radii, spacing, shadows } from '../theme';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ACTION_COLORS = {
  create: '#10B981',
  update: '#F59E0B',
  delete: '#DC2626',
  login: '#3B82F6',
  logout: '#6366F1',
};

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg, overflow: 'visible' },
  hero: {
    backgroundColor: colors.dark, paddingTop: spacing.xl, paddingBottom: spacing.xxl,
    borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(239,68,68,0.15)', bottom: -10, left: 20 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl, gap: 12, marginTop: -12 },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm, marginBottom: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  actionPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderLight },
  actionText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  cardMeta: { fontSize: 12, color: colors.textTertiary, marginBottom: 4 },
  cardBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  skeleton: {
    height: 100, borderRadius: radii.xl, backgroundColor: colors.shimmer, marginBottom: 12, opacity: 0.6 },
});

const AuditLogScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);

  const isAdmin = ['admin', 'superadmin', 'hr_admin', 'hr_manager'].includes(user?.role);

  const fetchLogs = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await api.get('/audit-logs', { params: { limit: 100 } });
      const data = res.data;
      setItems(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Audit Log</Text>
            <Text style={styles.heroSub}>Restricted to admins</Text>
          </View>
        </View>
        <View style={styles.body}>
          <EmptyState title="Access restricted" subtitle="You do not have permission to view audit logs." icon="lock-closed-outline" />
        </View>
      </View>
    );
  }

  const formatDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLogs(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Audit Log</Text>
            <Text style={styles.heroSub}>Track changes and admin activity</Text>
          </View>
        </View>

        <View style={styles.body}>
          {loading ? (
            <>
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
            </>
          ) : items.length === 0 ? (
            <EmptyState title="No audit logs" subtitle="Activity will appear here." icon="document-lock-outline" />
          ) : (
            items.map((log) => {
              const action = (log.action || 'update').toLowerCase();
              const actionColor = ACTION_COLORS[action] || colors.textSecondary;
              const title = log.module || log.entity_type || 'Activity';
              const subtitle = [log.user_name, log.ip_address, formatDate(log.created_at)].filter(Boolean).join('  •  ');
              return (
                <Card key={log.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{title}</Text>
                    <View style={styles.actionPill}>
                      <Text style={[styles.actionText, { color: actionColor }]}>{action}</Text>
                    </View>
                  </View>
                  {subtitle ? <Text style={styles.cardMeta}>{subtitle}</Text> : null}
                  {log.new_values ? <Text style={styles.cardBody} numberOfLines={3}>{JSON.stringify(log.new_values)}</Text> : null}
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default AuditLogScreen;
