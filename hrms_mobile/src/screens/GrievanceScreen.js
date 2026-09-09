import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
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

const STATUS_COLORS = {
  Open: '#3B82F6',
  'In Progress': '#F59E0B',
  Resolved: '#10B981',
  Closed: '#64748B',
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
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  statusPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderLight },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { fontSize: 12, color: colors.textTertiary, marginBottom: 6 },
  cardBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#14B8A6',
    justifyContent: 'center', alignItems: 'center', ...shadows.colored('#14B8A6', 0.35) },
  skeleton: {
    height: 100, borderRadius: radii.xl, backgroundColor: colors.shimmer, marginBottom: 12, opacity: 0.6 },
});

const GrievanceScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchGrievances = useCallback(async () => {
    try {
      const res = await api.get('/grievances');
      const data = res.data;
      setItems(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchGrievances(); }, [fetchGrievances]);

  const handleRaise = async () => {
    if (!subject.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Please enter subject and description.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/grievances', { subject: subject.trim(), description: description.trim() });
      setSubject('');
      setDescription('');
      fetchGrievances();
      Alert.alert('Submitted', 'Your grievance has been raised.');
    } catch {
      Alert.alert('Error', 'Could not submit grievance.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGrievances(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Grievances</Text>
            <Text style={styles.heroSub}>Track and raise workplace issues</Text>
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
            <EmptyState title="No grievances" subtitle="You have not raised any grievances yet." icon="alert-circle-outline" />
          ) : (
            items.map((item) => {
              const status = item.status || 'Open';
              const statusColor = STATUS_COLORS[status] || colors.textSecondary;
              return (
                <Card key={item.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{item.subject || 'Grievance'}</Text>
                    <View style={styles.statusPill}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>{item.created_at || ''}</Text>
                  <Text style={styles.cardBody} numberOfLines={3}>{item.description || ''}</Text>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => {}} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
};

export default GrievanceScreen;
