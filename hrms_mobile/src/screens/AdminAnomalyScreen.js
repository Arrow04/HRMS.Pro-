import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getTimezone, todayISO, dateToISO } from '../utils/timezone';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { radii, spacing, shadows } from '../theme';
import { EmptyState, GradientButton } from '../components/UI';
import { AdminModalShell, scrollViewTopBarProps, useScrollTopBar, bannerShellStyle } from '../components/AdminScreenKit';

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  headerBg: { backgroundColor: colors.primary, paddingTop: 16, paddingBottom: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  bgOrb: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  scanBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  body: { padding: 20 },
  datePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radii.lg, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight },
  dateText: { fontSize: 16, fontWeight: '700', color: colors.text },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statItem: { flex: 1, borderRadius: radii.md, padding: 8, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  tabRow: { gap: 6, marginBottom: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.full, backgroundColor: colors.surfaceSecondary },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#FFF' },
  typeRow: { gap: 6, marginBottom: 12 },
  typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: 'transparent' },
  typeChipActive: { backgroundColor: colors.primary + '15', borderColor: colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  typeChipTextActive: { color: colors.primary },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.lg, paddingHorizontal: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
  anomCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  anomIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  anomTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  anomDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  anomBadges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.full },
  badgeText: { fontSize: 10, fontWeight: '700' },
  anomActions: { gap: 6, marginLeft: 8 },
  resolveBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  dismissBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#94A3B8', justifyContent: 'center', alignItems: 'center' },
  skeleton: { height: 80, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary, opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalClose: { fontSize: 20, color: colors.textSecondary, fontWeight: '700' },
  detailTypeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  detailTypeIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  detailTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  detailType: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  detailDescBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: 14, marginBottom: 12 },
  detailDesc: { fontSize: 14, color: colors.text, lineHeight: 20 },
  detailMeta: { gap: 4 },
  detailMetaText: { fontSize: 12, color: colors.textSecondary },
  dismissAnomTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderLight, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 8 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#DC2626', borderRadius: radii.lg, paddingVertical: 14, marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  evidenceBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: 14, maxHeight: 300 },
  evidenceRow: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: 8 },
  evidenceKey: { fontSize: 11, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  evidenceVal: { fontSize: 13, color: colors.text, lineHeight: 18 } });
const TYPE_CONFIG = {
  attendance: { icon: 'finger-print-outline', label: 'Attendance', color: '#3B82F6' },
  payroll: { icon: 'cash-outline', label: 'Payroll', color: '#10B981' },
  leave: { icon: 'calendar-outline', label: 'Leave', color: '#8B5CF6' },
  expense: { icon: 'wallet-outline', label: 'Expense', color: '#F59E0B' },
  login: { icon: 'log-in-outline', label: 'Login', color: '#EC4899' },
  overtime_anomaly: { icon: 'time-outline', label: 'OT Anomaly', color: '#7C3AED' },
  duplicate_bank: { icon: 'copy-outline', label: 'Duplicate', color: '#DC2626' } };

const SEVERITY_CONFIG = {
  low: { label: 'Low', bg: '#DBEAFE', color: '#2563EB' },
  medium: { label: 'Medium', bg: '#FEF3C7', color: '#D97706' },
  high: { label: 'High', bg: '#FEE2E2', color: '#DC2626' },
  critical: { label: 'Critical', bg: '#FEE2E2', color: '#B91C1C' } };

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'dismissed', label: 'Dismissed' },
];

const AdminAnomalyScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollTopBar = useScrollTopBar();
  const [anomalies, setAnomalies] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, resolved: 0, by_type: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [dismissModal, setDismissModal] = useState(null);
  const [dismissReason, setDismissReason] = useState('');
  const [evidenceModal, setEvidenceModal] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [anomRes, statsRes] = await Promise.allSettled([
        api.get('/anomalies'),
        api.get('/anomalies/stats'),
      ]);
      if (anomRes.status === 'fulfilled') setAnomalies(anomRes.value.data?.data || anomRes.value.data || []);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data || { total: 0, open: 0, resolved: 0, by_type: {} });
    } catch (e) {
      // Anomaly fetch failed
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

  const handleResolve = async (id) => {
    try { await api.put(`/anomalies/${id}/resolve`); fetchData(); Alert.alert('Success', 'Anomaly resolved.'); } catch (e) { Alert.alert('Error', 'Failed.'); }
  };

  const handleDismiss = async (id, reason) => {
    try { await api.put(`/anomalies/${id}/dismiss`, { reason: reason || '' }); fetchData(); Alert.alert('Success', 'Anomaly dismissed.'); } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed.'); }
  };

  const handleScan = async () => {
    setScanning(true);
    try { await api.post('/anomalies/scan'); fetchData(); Alert.alert('Done', 'Scan complete. New anomalies may have been detected.'); } catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Scan failed.'); }
    finally { setScanning(false); }
  };

  const filtered = anomalies.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || (a.title || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q) || (a.anomaly_type || '').toLowerCase().includes(q);
    const matchStatus = statusTab === 'all' || a.status === statusTab;
    const matchType = !typeFilter || a.anomaly_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const openCount = anomalies.filter(a => a.status === 'open').length;
  const resolvedCount = anomalies.filter(a => a.status === 'resolved').length;
  const dismissedCount = anomalies.filter(a => a.status === 'dismissed').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} {...scrollViewTopBarProps(scrollTopBar)} refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
      <View style={[styles.headerBg, bannerShellStyle(scrollTopBar)]}>
        <View style={styles.bgOrb} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Anomalies</Text>
            <Text style={styles.headerSub}>Detect and resolve issues</Text>
          </View>
          <TouchableOpacity onPress={handleScan} style={styles.scanBtn} disabled={scanning}>
            <Ionicons name={scanning ? 'hourglass' : 'refresh'} size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <TouchableOpacity style={styles.datePickerRow} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.dateText}>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: getTimezone() })}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker value={new Date(selectedDate + 'T00:00:00')} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(_, date) => { setShowDatePicker(false); if (date) setSelectedDate(dateToISO(date)); }} />
        )}

        {/* Stats */}
        <View style={styles.statRow}>
          {[
            { val: openCount, label: 'Open', color: '#D97706', bg: '#FEF3C7' },
            { val: resolvedCount, label: 'Resolved', color: '#10B981', bg: '#DCFCE7' },
            { val: dismissedCount, label: 'Dismissed', color: '#94A3B8', bg: '#F1F5F9' },
          ].map((s, i) => (
            <View key={i} style={[styles.statItem, { backgroundColor: s.bg }]}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Status Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {STATUS_TABS.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tab, statusTab === t.key && styles.tabActive]} onPress={() => setStatusTab(t.key)} activeOpacity={0.7}>
              <Text style={[styles.tabText, statusTab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Type Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          <TouchableOpacity style={[styles.typeChip, !typeFilter && styles.typeChipActive]} onPress={() => setTypeFilter('')} activeOpacity={0.7}>
            <Text style={[styles.typeChipText, !typeFilter && styles.typeChipTextActive]}>All Types</Text>
          </TouchableOpacity>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <TouchableOpacity key={key} style={[styles.typeChip, typeFilter === key && { backgroundColor: cfg.color + '20', borderColor: cfg.color }]}
              onPress={() => setTypeFilter(typeFilter === key ? '' : key)} activeOpacity={0.7}>
              <Ionicons name={cfg.icon} size={12} color={cfg.color} style={{ marginRight: 4 }} />
              <Text style={[styles.typeChipText, typeFilter === key && { color: cfg.color }]}>{cfg.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search anomalies..." placeholderTextColor="#94A3B8" />
        </View>

        {/* Anomaly List */}
        {loading ? (
          <View style={{ gap: 8 }}>{[1, 2, 3, 4, 5].map(i => <View key={i} style={styles.skeleton} />)}</View>
        ) : filtered.length === 0 ? (
          <EmptyState icon="✅" title="No anomalies" message="No anomaly alerts found." />
        ) : (
          filtered.map((a, i) => {
            const typeCfg = TYPE_CONFIG[a.anomaly_type] || { icon: 'alert-outline', label: a.anomaly_type, color: '#94A3B8' };
            const sevCfg = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.medium;
            return (
              <TouchableOpacity key={a.id || i} style={styles.anomCard} onPress={() => setDetailItem(a)} activeOpacity={0.7}>
                <View style={[styles.anomIcon, { backgroundColor: typeCfg.color + '15' }]}>
                  <Ionicons name={typeCfg.icon} size={20} color={typeCfg.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.anomTitle} numberOfLines={1}>{a.title || 'Anomaly Alert'}</Text>
                  <Text style={styles.anomDesc} numberOfLines={2}>{a.description || a.anomaly_type}</Text>
                  <View style={styles.anomBadges}>
                    <View style={[styles.badge, { backgroundColor: typeCfg.color + '15' }]}>
                      <Text style={[styles.badgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: sevCfg.bg }]}>
                      <Text style={[styles.badgeText, { color: sevCfg.color }]}>{sevCfg.label}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: a.status === 'open' ? '#FEF3C7' : a.status === 'resolved' ? '#DCFCE7' : '#F1F5F9' }]}>
                      <Text style={[styles.badgeText, { color: a.status === 'open' ? '#D97706' : a.status === 'resolved' ? '#10B981' : '#94A3B8' }]}>
                        {(a.status || 'open').charAt(0).toUpperCase() + (a.status || 'open').slice(1)}
                      </Text>
                    </View>
                  </View>
                </View>
                {a.status === 'open' && (
                  <View style={styles.anomActions}>
                    <TouchableOpacity style={styles.resolveBtn} onPress={() => handleResolve(a.id)}>
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dismissBtn} onPress={() => setDismissModal(a)}>
                      <Ionicons name="close" size={16} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </View>

      {/* Detail Modal */}
      <AdminModalShell visible={!!detailItem} onClose={() => setDetailItem(null)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Anomaly Detail</Text>
              <TouchableOpacity onPress={() => setDetailItem(null)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {detailItem && (
              <>
                {(() => {
                  const typeCfg = TYPE_CONFIG[detailItem.anomaly_type] || { icon: 'alert-outline', label: detailItem.anomaly_type, color: '#94A3B8' };
                  const sevCfg = SEVERITY_CONFIG[detailItem.severity] || SEVERITY_CONFIG.medium;
                  return (
                    <>
                      <View style={styles.detailTypeRow}>
                        <View style={[styles.detailTypeIcon, { backgroundColor: typeCfg.color + '15' }]}>
                          <Ionicons name={typeCfg.icon} size={28} color={typeCfg.color} />
                        </View>
                        <View style={{ marginLeft: 14 }}>
                          <Text style={styles.detailTitle}>{detailItem.title || 'Anomaly'}</Text>
                          <Text style={styles.detailType}>{typeCfg.label} • {sevCfg.label} Severity</Text>
                        </View>
                      </View>
                      <View style={styles.detailDescBox}>
                        <Text style={styles.detailDesc}>{detailItem.description || 'No description provided.'}</Text>
                      </View>
                      <View style={styles.detailMeta}>
                        <Text style={styles.detailMetaText}>Created: {detailItem.created_at ? new Date(detailItem.created_at).toLocaleDateString('en-US', { timeZone: getTimezone() }) : 'N/A'}</Text>
                        <Text style={styles.detailMetaText}>Status: {(detailItem.status || 'open').charAt(0).toUpperCase() + (detailItem.status || 'open').slice(1)}</Text>
                      </View>
                      {detailItem.status === 'open' && (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                          <GradientButton title="Resolve" onPress={() => { handleResolve(detailItem.id); setDetailItem(null); }} style={{ flex: 1 }} />
                          <GradientButton title="Dismiss" variant="danger" onPress={() => { setDetailItem(null); setDismissModal(detailItem); }} style={{ flex: 1 }} />
                        </View>
                      )}
                      {detailItem.evidence_data && (
                        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 8 }} onPress={() => { setDetailItem(null); setEvidenceModal(detailItem); }}>
                          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>View Evidence</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  );
                })()}
              </>
            )}
      </AdminModalShell>

      {/* Dismiss Reason Modal */}
      <AdminModalShell visible={!!dismissModal} onClose={() => { setDismissModal(null); setDismissReason(''); }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dismiss Anomaly</Text>
              <TouchableOpacity onPress={() => { setDismissModal(null); setDismissReason(''); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {dismissModal && (
              <>
                <Text style={styles.dismissAnomTitle}>{dismissModal.title || 'Anomaly Alert'}</Text>
                <Text style={styles.fieldLabel}>Reason for dismissal (optional)</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={dismissReason} onChangeText={setDismissReason}
                  placeholder="Why is this being dismissed?" placeholderTextColor="#94A3B8" multiline />
                <TouchableOpacity style={styles.saveBtn} onPress={() => { handleDismiss(dismissModal.id, dismissReason); setDismissModal(null); setDismissReason(''); }}>
                  <Ionicons name="close-circle" size={20} color="#FFF" />
                  <Text style={styles.saveBtnText}>Dismiss Alert</Text>
                </TouchableOpacity>
              </>
            )}
      </AdminModalShell>

      {/* Evidence Viewer Modal */}
      <AdminModalShell visible={!!evidenceModal} onClose={() => setEvidenceModal(null)}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Evidence</Text>
              <TouchableOpacity onPress={() => setEvidenceModal(null)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {evidenceModal && (
              <>
                <Text style={styles.dismissAnomTitle}>{evidenceModal.title || 'Anomaly Evidence'}</Text>
                <View style={styles.evidenceBox}>
                  {typeof evidenceModal.evidence_data === 'object' ? (
                    Object.entries(evidenceModal.evidence_data).map(([key, val]) => (
                      <View key={key} style={styles.evidenceRow}>
                        <Text style={styles.evidenceKey}>{key.replace(/_/g, ' ')}</Text>
                        <Text style={styles.evidenceVal}>{typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.evidenceVal}>{String(evidenceModal.evidence_data)}</Text>
                  )}
                </View>
              </>
            )}
      </AdminModalShell>
      </ScrollView>
    </View>
  );
};


export default AdminAnomalyScreen;
