import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
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
  heroOrb2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(99,102,241,0.2)', bottom: -10, left: 20 },
  heroContent: { paddingHorizontal: spacing.xl },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  body: { padding: spacing.xl, gap: 12, marginTop: -12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  searchInput: {
    flex: 1, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySurface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  avatarText: { fontSize: 16, fontWeight: '800', color: colors.primary },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  reporteeCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight, marginLeft: 28, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reporteeAvatar: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySurface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  reporteeName: { fontSize: 14, fontWeight: '600', color: colors.text },
  reporteeMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  skeleton: {
    height: 68, borderRadius: radii.xl, backgroundColor: colors.shimmer, marginBottom: 12, opacity: 0.6 },
});

const TeamDirectoryScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [orgData, setOrgData] = useState([]);
  const [expandedManagers, setExpandedManagers] = useState({});

  const fetchOrgStructure = useCallback(async () => {
    try {
      const res = await api.get('/employees/org-structure');
      const data = res.data;
      setOrgData(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setOrgData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchOrgStructure(); }, [fetchOrgStructure]);

  const toggleManager = (managerId) => {
    setExpandedManagers((prev) => ({ ...prev, [managerId]: !prev[managerId] }));
  };

  const matchesQuery = (item, q) => {
    if (!q) return true;
    const searchStr = `${item.name || ''} ${item.email || ''} ${item.department || ''} ${item.designation || ''}`.toLowerCase();
    return searchStr.includes(q.toLowerCase());
  };

  const filterTree = (nodes, q) => {
    if (!q) return nodes;
    return nodes.reduce((acc, node) => {
      const nodeMatches = matchesQuery(node, q);
      const filteredReports = filterTree(node.directReports || [], q);
      if (nodeMatches || filteredReports.length > 0) {
        acc.push({ ...node, directReports: filteredReports });
      }
      return acc;
    }, []);
  };

  const filteredOrg = filterTree(orgData, query);

  const renderNode = (node, level = 0) => {
    const hasReports = node.directReports && node.directReports.length > 0;
    const isExpanded = expandedManagers[node.id];
    const initials = node.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <View key={node.id}>
        <TouchableOpacity
          onPress={() => hasReports && toggleManager(node.id)}
          activeOpacity={hasReports ? 0.7 : 1}
        >
          <Card style={[styles.card, { marginLeft: level * 20 }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{node.name}</Text>
              <Text style={styles.meta}>
                {node.designation || ''} {node.department ? `• ${node.department}` : ''}
              </Text>
            </View>
            {hasReports && (
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textTertiary}
              />
            )}
          </Card>
        </TouchableOpacity>

        {isExpanded && hasReports && (
          <View>
            {node.directReports.map((child) => renderNode(child, level + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrgStructure(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.heroOrb1} />
          <View style={styles.heroOrb2} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Team Directory</Text>
            <Text style={styles.heroSub}>Org chart and reporting hierarchy</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, email, or department"
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={setQuery}
            />
            <TouchableOpacity style={{ padding: 10, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="search" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <>
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
            </>
          ) : filteredOrg.length === 0 ? (
            <EmptyState title="No org structure found" subtitle="Reporting managers are not configured yet." icon="people-outline" />
          ) : (
            filteredOrg.map((node) => renderNode(node, 0))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default TeamDirectoryScreen;
