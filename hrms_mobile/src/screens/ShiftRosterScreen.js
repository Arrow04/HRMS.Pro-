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

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHIFT_COLORS = {
  Morning: '#3B82F6',
  General: '#10B981',
  Night: '#6366F1',
  WeekOff: '#94A3B8',
};

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg, overflow: 'visible' },
  hero: {
    backgroundColor: colors.dark, paddingTop: spacing.xl, paddingBottom: spacing.xxl,
    borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -40, right: -40 },
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(99,102,241,0.2)', bottom: -10, left: 20 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl, gap: 12, marginTop: -12 },
  weekRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  weekPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  weekPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekPillText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  weekPillTextActive: { color: '#FFF' },
  rosterRow: {
    backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rosterName: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  shiftPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderLight },
  shiftText: { fontSize: 11, fontWeight: '700' },
  skeleton: {
    height: 56, borderRadius: radii.xl, backgroundColor: colors.shimmer, marginBottom: 12, opacity: 0.6 },
});

const ShiftRosterScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roster, setRoster] = useState([]);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().slice(0, 10);
  });

  const fetchRoster = useCallback(async () => {
    try {
      const res = await api.get('/roster/weekly', { params: { week_start: weekStart } });
      const data = res.data;
      setRoster(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch {
      setRoster([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weekStart]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  const weekLabel = (start) => {
    if (!start) return '';
    const d = new Date(start);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRoster(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Shift & Roster</Text>
            <Text style={styles.heroSub}>Weekly schedule overview</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.weekRow}>
            <TouchableOpacity style={styles.weekPill} onPress={prevWeek} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={[styles.weekPill, { flex: 1, alignItems: 'center' }]}>
              <Text style={[styles.weekPillText, { color: colors.text }]}>{weekLabel(weekStart)}</Text>
            </View>
            <TouchableOpacity style={styles.weekPill} onPress={nextWeek} activeOpacity={0.7}>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <>
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
            </>
          ) : roster.length === 0 ? (
            <EmptyState title="No roster found" subtitle="There is no shift data for this week." icon="calendar-number-outline" />
          ) : (
            roster.map((row) => {
              const shift = row.shift || row.shift_type || 'General';
              const shiftColor = SHIFT_COLORS[shift] || colors.textSecondary;
              const label = row.employee_name || row.employee?.full_name || row.name || 'Employee';
              return (
                <Card key={row.id || `${row.employee_id}-${row.date}-${shift}`} style={styles.rosterRow}>
                  <Text style={styles.rosterName}>{label}</Text>
                  <View style={styles.shiftPill}>
                    <Text style={[styles.shiftText, { color: shiftColor }]}>{shift}</Text>
                  </View>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default ShiftRosterScreen;
