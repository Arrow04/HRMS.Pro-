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
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm, marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  cardMeta: { fontSize: 12, color: colors.textTertiary, marginBottom: 8 },
  cardBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  badge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderLight, marginBottom: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  skeleton: {
    height: 90, borderRadius: radii.xl, backgroundColor: colors.shimmer, marginBottom: 12, opacity: 0.6 },
});

const AnnouncementsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await api.get('/announcements');
      const data = res.data;
      setItems(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAnnouncements(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Notices</Text>
            <Text style={styles.heroSub}>Company updates and announcements</Text>
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
            <EmptyState title="No notices yet" subtitle="Check back later for updates." icon="megaphone-outline" />
          ) : (
            items.map((item, idx) => (
              <Card key={item.id || idx} style={styles.card}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.category || 'Notice'}</Text>
                </View>
                <Text style={styles.cardTitle}>{item.title || 'Notice'}</Text>
                <Text style={styles.cardMeta}>{item.date || item.created_at || ''}</Text>
                <Text style={styles.cardBody} numberOfLines={3}>{item.description || item.body || ''}</Text>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default AnnouncementsScreen;
