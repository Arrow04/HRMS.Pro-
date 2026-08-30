import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform, Animated } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getTimezone, fmtTime, todayISO, daysAgoISO } from '../utils/timezone';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { Avatar } from '../components/UI';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { TrendLine, AreaBar } from '../components/Charts';
import { scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { radii, spacing, shadows } from '../theme';

const { width: W } = Dimensions.get('window');
const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.bg, overflow: 'visible' },
  hero: {
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden' },
  heroOrb1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.07)', top: -50, right: -60 },
  heroOrb2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)', bottom: 0, left: -30 },
  heroContent: { paddingHorizontal: PAD },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  heroName: { fontSize: 26, fontWeight: '800', color: '#FFF', marginTop: 2, letterSpacing: -0.4 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  rolePill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  rolePillText: { fontSize: 10, fontWeight: '700', color: '#FFF', textTransform: 'capitalize' },
  heroDate: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  heroStats: {
    flexDirection: 'row',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 8 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  heroStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: '600' },
  heroStatDiv: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  bento: { padding: PAD, gap: GAP, marginTop: -8 },
  bentoRow: { flexDirection: 'row', gap: GAP },
  bentoRowStretch: { alignItems: 'stretch' },
  halfCard: { width: HALF, minHeight: 220 },
  bentoTouchableStretch: { alignSelf: 'stretch' },
  bentoCardStretch: { flex: 1 },
  bentoInnerStretch: { flex: 1, justifyContent: 'space-between' },
  halfCardBody: { flex: 1 },
  holidayList: { flex: 1, justifyContent: 'center', gap: 2 },
  bentoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'visible',
    ...shadows.sm },
  bentoTall: { minHeight: 200 },
  bentoGradient: { overflow: 'hidden' },
  bentoInner: { zIndex: 1 },
  bcShine: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.08)', top: -20, right: -20, zIndex: 0 },
  sectionHead: { marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  sectionSub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  quickScroll: { gap: 10, paddingBottom: 4, paddingHorizontal: 4 },
  quickScrollerWrap: { position: 'relative', marginBottom: 4 },
  quickScrollFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    zIndex: 1,
  },
  quickScrollFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 48,
    zIndex: 1,
  },
  quickScrollHintRight: {
    position: 'absolute',
    right: 2,
    top: '50%',
    marginTop: -15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...shadows.sm,
  },
  quickScrollHintLeft: {
    position: 'absolute',
    left: 2,
    top: '50%',
    marginTop: -15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...shadows.sm,
  },
  quickCard: {
    width: 80,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8 },
  quickLabel: { fontSize: 10, fontWeight: '600', color: colors.text, textAlign: 'center' },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  kpiIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  kpiSub: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  kpiValue: { fontSize: 26, fontWeight: '800', color: '#FFF', letterSpacing: -0.5, marginTop: 4 },
  kpiLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 4, fontWeight: '600' },
  miniKpiVal: { fontSize: 22, fontWeight: '800', color: '#FFF', marginTop: 6 },
  miniKpiLabel: { fontSize: 11, color: 'rgba(255,255,255,0.9)', marginTop: 4, fontWeight: '600' },
  recruitList: { marginTop: 4 },
  recruitSectionLbl: {
    fontSize: 11, fontWeight: '700', color: colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 6 },
  recruitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  recruitIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recruitRowBody: { flex: 1 },
  recruitLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  recruitSub: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  recruitCount: { fontSize: 15, fontWeight: '800', color: colors.text, minWidth: 28, textAlign: 'right' },
  anomalySevDot: { width: 8, height: 8, borderRadius: 4 },
  newHireBox: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 },
  newHireVal: { fontSize: 36, fontWeight: '800', color: colors.primary },
  newHireLbl: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  newHireMeta: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, padding: 12 },
  newHireMetaItem: { flex: 1, alignItems: 'center' },
  newHireMetaVal: { fontSize: 16, fontWeight: '800', color: colors.text },
  newHireMetaLbl: { fontSize: 10, color: colors.textTertiary, marginTop: 2, fontWeight: '600' },
  splitList: { marginTop: 12, gap: 10 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitDot: { width: 10, height: 10, borderRadius: 5 },
  splitLabel: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  splitVal: { fontSize: 14, fontWeight: '800', color: colors.text, minWidth: 24, textAlign: 'right' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  chartHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  stripTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 10 },
  stripRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border },
  stripChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, flexShrink: 1 },
  emptyMini: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 6 },
  emptyMiniText: { fontSize: 12, color: colors.textTertiary },
  emptyChart: { height: 120, alignItems: 'center', justifyContent: 'center' },
  expBadge: { backgroundColor: colors.warningSurface, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 4 },
  expBadgeText: { fontSize: 11, fontWeight: '700', color: colors.warningText },
  recruitDiv: { width: 1, backgroundColor: colors.border, marginVertical: 2 },
  holidayMini: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  holidayDate: {
    width: 36, height: 40, borderRadius: 10, backgroundColor: colors.primarySurface,
    alignItems: 'center', justifyContent: 'center' },
  holidayDay: { fontSize: 16, fontWeight: '800', color: colors.primary },
  holidayMon: { fontSize: 9, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  holidayName: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.text },
  assistantCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    marginBottom: 4,
    ...shadows.colored('#14B8A6', 0.28) },
  assistantInner: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  assistantIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)' },
  assistantBody: { flex: 1 },
  assistantTitle: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: -0.2 },
  assistantSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3, fontWeight: '500' },
  assistantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 4 },
  assistantBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' },
  assistantBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  assistantChevron: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center' },
  fab: { position: 'absolute', right: 20, alignItems: 'center', zIndex: 10 },
  fabBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#14B8A6',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.colored('#14B8A6', 0.4) },
  fabLabel: { fontSize: 10, fontWeight: '700', color: '#14B8A6', marginTop: 4 } });
const PAD = 20;
const GAP = 12;
const HALF = (W - PAD * 2 - GAP) / 2;
const CHART_FULL = W - PAD * 2 - 24;
const CHART_HALF = HALF - 24;

const RECRUIT_STAGES = [
  { key: 'applied', label: 'Applied', icon: 'document-text-outline', color: '#3B82F6' },
  { key: 'shortlisted', label: 'Shortlisted', icon: 'filter-outline', color: '#6366F1' },
  { key: 'interviewed', label: 'Interviewed', icon: 'videocam-outline', color: '#7C3AED' },
  { key: 'offered', label: 'Offered', icon: 'mail-outline', color: '#F59E0B' },
  { key: 'hired', label: 'Hired', icon: 'checkmark-circle-outline', color: '#10B981' },
  { key: 'rejected', label: 'Rejected', icon: 'close-circle-outline', color: '#DC2626' },
];

const ATTENDANCE_ROWS = [
  { key: 'present', label: 'Present', icon: 'checkmark-circle-outline', color: '#10B981' },
  { key: 'late', label: 'Late', icon: 'time-outline', color: '#F59E0B' },
  { key: 'onLeave', label: 'On Leave', icon: 'sunny-outline', color: '#3B82F6' },
  { key: 'absent', label: 'Absent', icon: 'close-circle-outline', color: '#DC2626' },
  { key: 'earlyDepartures', label: 'Early Out', icon: 'exit-outline', color: '#7C3AED' },
];

const ADMIN_QUICK_ACTIONS = [
  { icon: 'people', label: 'Employees', screen: 'Employees', color: '#6366F1' },
  { icon: 'finger-print', label: 'Attendance', screen: 'AdminAttendance', color: '#3B82F6' },
  { icon: 'calendar', label: 'Leaves', screen: 'AdminLeaves', color: '#4F46E5' },
  { icon: 'checkmark-circle', label: 'Approvals', screen: 'Approvals', color: '#10B981' },
  { icon: 'wallet', label: 'Payroll', screen: 'PayrollAdmin', color: '#059669' },
  { icon: 'receipt', label: 'Expenses', screen: 'Expenses', color: '#F59E0B' },
  { icon: 'briefcase', label: 'Hiring', screen: 'Recruitment', color: '#7C3AED' },
  { icon: 'bar-chart', label: 'Reports', screen: 'Reports', color: '#0D9488' },
  { icon: 'documents-outline', label: 'Documents', screen: 'Documents', color: '#F59E0B' },
];

const EMPLOYEE_QUICK_ACTIONS = [
  { icon: 'finger-print', label: 'Clock In', screen: 'Attendance', color: '#059669' },
  { icon: 'calendar', label: 'Leaves', screen: 'Leaves', color: '#4F46E5' },
  { icon: 'receipt', label: 'Expenses', screen: 'Expenses', color: '#F59E0B' },
  { icon: 'card', label: 'Payslips', screen: 'Payslips', color: '#059669' },
  { icon: 'time', label: 'History', screen: 'AttendanceHistory', color: '#3B82F6' },
  { icon: 'calendar-clear', label: 'Holidays', screen: 'Holidays', color: '#0D9488' },
  { icon: 'star', label: 'Performance', screen: 'MyPerformance', color: '#8B5CF6' },
  { icon: 'laptop', label: 'Assets', screen: 'Assets', color: '#0D9488' },
  { icon: 'document-text', label: 'Policies', screen: 'Policies', color: '#1C64F2' },
  { icon: 'settings', label: 'Settings', screen: 'Settings', color: '#6366F1' },
  { icon: 'documents-outline', label: 'Documents', screen: 'Documents', color: '#F59E0B' },
  { icon: 'person', label: 'Profile', screen: 'Profile', color: '#8B5CF6' },
];


const ANOMALY_TYPE_META = {
  buddy_punching: { label: 'Buddy Punch', icon: 'people-outline', color: '#DC2626' },
  payroll_drift: { label: 'Payroll Drift', icon: 'cash-outline', color: '#10B981' },
  overtime_anomaly: { label: 'Overtime', icon: 'time-outline', color: '#7C3AED' },
  duplicate_bank: { label: 'Duplicate Bank', icon: 'copy-outline', color: '#DC2626' },
  duplicate_payment: { label: 'Duplicate Pay', icon: 'wallet-outline', color: '#F59E0B' },
  attendance_discrepancy: { label: 'Attendance', icon: 'finger-print-outline', color: '#3B82F6' },
  attendance: { label: 'Attendance', icon: 'finger-print-outline', color: '#3B82F6' },
  payroll: { label: 'Payroll', icon: 'cash-outline', color: '#10B981' },
  leave: { label: 'Leave', icon: 'calendar-outline', color: '#8B5CF6' },
  expense: { label: 'Expense', icon: 'wallet-outline', color: '#F59E0B' },
  login: { label: 'Login', icon: 'log-in-outline', color: '#EC4899' } };

const anomalyTypeMeta = (type) => ANOMALY_TYPE_META[type] || {
  label: (type || 'Alert').replace(/_/g, ' '),
  icon: 'alert-circle-outline',
  color: '#DC2626' };

const AnomalyList = ({ items, onPress }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!items?.length) {
    return (
      <View style={styles.emptyMini}>
        <Ionicons name="shield-checkmark-outline" size={28} color={colors.textTertiary} />
        <Text style={styles.emptyMiniText}>No open anomalies</Text>
      </View>
    );
  }
  return (
    <View style={styles.recruitList}>
      {items.map((a, i) => {
        const meta = anomalyTypeMeta(a.anomaly_type || a.anomalyType);
        const sev = (a.severity || 'medium').toLowerCase();
        const sevColor = sev === 'critical' || sev === 'high' ? '#DC2626' : sev === 'medium' ? '#D97706' : '#2563EB';
        return (
          <TouchableOpacity key={a.id || i} style={styles.recruitRow} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.recruitIcon, { backgroundColor: meta.color + '18' }]}>
              <Ionicons name={meta.icon} size={16} color={meta.color} />
            </View>
            <View style={styles.recruitRowBody}>
              <Text style={styles.recruitLabel} numberOfLines={1}>{a.title || 'Anomaly Alert'}</Text>
              <Text style={styles.recruitSub} numberOfLines={1}>{meta.label} · {sev}</Text>
            </View>
            <View style={[styles.anomalySevDot, { backgroundColor: sevColor }]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const BentoCard = ({ children, style, onPress, gradient, tall, stretch }) => {
  const styles = useThemedStyles(createStyles);
  const shellStyle = [
    styles.bentoCard,
    tall && styles.bentoTall,
    stretch && styles.bentoCardStretch,
    !stretch && style,
  ];
  const inner = gradient ? (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[shellStyle, styles.bentoGradient, stretch ? null : style]}
    >
      <View style={styles.bcShine} pointerEvents="none" />
      <View style={[styles.bentoInner, stretch && styles.bentoInnerStretch]}>{children}</View>
    </LinearGradient>
  ) : (
    <View style={[shellStyle, stretch ? null : style]}>
      {stretch ? <View style={styles.bentoInnerStretch}>{children}</View> : children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onPress}
        style={stretch ? [styles.bentoTouchableStretch, style] : style}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
};

const AttendanceList = ({ stats, onPress }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const rows = ATTENDANCE_ROWS.map((row) => ({
    ...row,
    count: stats?.[row.key] ?? 0 }));

  return (
    <View style={styles.recruitList}>
      <Text style={styles.recruitSectionLbl}>Today</Text>
      {rows.map((row) => (
        <TouchableOpacity key={row.key} style={styles.recruitRow} onPress={onPress} activeOpacity={0.7}>
          <View style={[styles.recruitIcon, { backgroundColor: row.color + '18' }]}>
            <Ionicons name={row.icon} size={16} color={row.color} />
          </View>
          <Text style={styles.recruitLabel}>{row.label}</Text>
          <Text style={styles.recruitCount}>{row.count}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const RecruitmentList = ({ pipeline, interviews, onPress }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const today = new Date().toISOString().split('T')[0];
  const todayInterviews = (interviews || []).filter((iv) => {
    const d = (iv.date || iv.scheduled_at || iv.scheduledAt || '').slice(0, 10);
    return d === today;
  });

  const rows = RECRUIT_STAGES.map((s) => ({
    ...s,
    count: pipeline?.[s.key] || 0 }));

  return (
    <View style={styles.recruitList}>
      {todayInterviews.length > 0 && (
        <>
          <Text style={styles.recruitSectionLbl}>Today</Text>
          {todayInterviews.slice(0, 3).map((iv, i) => (
            <TouchableOpacity key={iv.id || i} style={styles.recruitRow} onPress={onPress} activeOpacity={0.7}>
              <View style={[styles.recruitIcon, { backgroundColor: '#7C3AED18' }]}>
                <Ionicons name="videocam" size={16} color="#7C3AED" />
              </View>
              <View style={styles.recruitRowBody}>
                <Text style={styles.recruitLabel} numberOfLines={1}>
                  {iv.candidate_name || iv.candidateName || iv.title || 'Interview'}
                </Text>
                <Text style={styles.recruitSub} numberOfLines={1}>
                  {iv.job_title || iv.jobTitle || iv.type || 'Scheduled'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </>
      )}
      <Text style={styles.recruitSectionLbl}>Pipeline</Text>
      {rows.map((row) => (
        <TouchableOpacity key={row.key} style={styles.recruitRow} onPress={onPress} activeOpacity={0.7}>
          <View style={[styles.recruitIcon, { backgroundColor: row.color + '18' }]}>
            <Ionicons name={row.icon} size={16} color={row.color} />
          </View>
          <Text style={styles.recruitLabel}>{row.label}</Text>
          <Text style={styles.recruitCount}>{row.count}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const KpiCard = ({ icon, value, label, gradient, sub, onPress }) => {
  const styles = useThemedStyles(createStyles);
  return (
  <BentoCard gradient={gradient} style={{ width: HALF }} onPress={onPress}>
    <View style={styles.kpiTop}>
      <View style={styles.kpiIconWrap}>
        <Ionicons name={icon} size={18} color="#FFF" />
      </View>
      {sub ? <Text style={styles.kpiSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
    <Text style={styles.kpiValue}>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </BentoCard>
  );
};

const QuickActionsScroller = ({ actions, onNavigate }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollRef = useRef(null);
  const layoutWidth = useRef(0);
  const contentWidth = useRef(0);
  const scrollX = useRef(0);
  const [showLeftHint, setShowLeftHint] = useState(false);
  const [showRightHint, setShowRightHint] = useState(false);

  const SCROLL_STEP = 172;

  const updateScrollHints = useCallback(() => {
    const maxScroll = Math.max(0, contentWidth.current - layoutWidth.current);
    const canScroll = maxScroll > 12;
    setShowLeftHint(canScroll && scrollX.current > 12);
    setShowRightHint(canScroll && scrollX.current < maxScroll - 12);
  }, []);

  const scrollBy = useCallback((delta) => {
    const maxScroll = Math.max(0, contentWidth.current - layoutWidth.current);
    const nextX = Math.max(0, Math.min(maxScroll, scrollX.current + delta));
    scrollRef.current?.scrollTo({ x: nextX, animated: true });
    scrollX.current = nextX;
    updateScrollHints();
  }, [updateScrollHints]);

  return (
    <View style={styles.quickScrollerWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickScroll}
        scrollEventThrottle={16}
        onLayout={(e) => {
          layoutWidth.current = e.nativeEvent.layout.width;
          updateScrollHints();
        }}
        onContentSizeChange={(w) => {
          contentWidth.current = w;
          updateScrollHints();
        }}
        onScroll={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
          updateScrollHints();
        }}
      >
        {actions.map((a) => (
          <TouchableOpacity
            key={a.screen}
            style={styles.quickCard}
            onPress={() => onNavigate(a.screen)}
            activeOpacity={0.8}
          >
            <LinearGradient colors={[a.color, a.color + 'CC']} style={styles.quickIcon}>
              <Ionicons name={a.icon} size={22} color="#FFF" />
            </LinearGradient>
            <Text style={styles.quickLabel} numberOfLines={1}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {showLeftHint ? (
        <>
          <LinearGradient
            colors={[colors.bg, `${colors.bg}DD`, `${colors.bg}00`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.quickScrollFadeLeft}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={styles.quickScrollHintLeft}
            onPress={() => scrollBy(-SCROLL_STEP)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Scroll quick actions left"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
          </TouchableOpacity>
        </>
      ) : null}
      {showRightHint ? (
        <>
          <LinearGradient
            colors={[`${colors.bg}00`, `${colors.bg}DD`, colors.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.quickScrollFadeRight}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={styles.quickScrollHintRight}
            onPress={() => scrollBy(SCROLL_STEP)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Scroll quick actions right"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
};

const AdminDashboard = ({ navigation, summary, pipeline, interviews, anomalyStats, recentAnomalies, loading }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const emp = summary?.employees || {};
  const att = summary?.attendance || {};
  const leaves = summary?.leaves || {};
  const expenses = summary?.expenses || {};
  const recruitment = summary?.recruitment || {};
  const trend = summary?.monthlyTrend || [];
  const trend6 = trend.slice(-6);
  const trendLabels = trend6.map((t) => {
    if (t.label) return t.label;
    if (t.month && t.year) {
      return new Date(t.year, t.month - 1, 1).toLocaleString('en', { month: 'short' });
    }
    return '';
  });
  const attTrend = trend6.map((t) => t.attendance || 0);
  const payTrend = trend6.map((t) => Math.round((t.payroll || 0) / 1000));
  const expTrend = trend6.map((t) => Math.round((t.expenses || 0) / 1000));

  const totalStaff = emp.total || 0;
  const presentToday = att.presentToday || 0;
  const onLeaveToday = att.onLeaveToday || 0;
  const lateToday = att.lateToday || 0;
  const activeStaff = emp.active || totalStaff;
  const absentToday = Math.max(0, activeStaff - presentToday - onLeaveToday);
  const attendanceRate = activeStaff > 0 ? Math.round((presentToday / activeStaff) * 100) : 0;
  const attendanceStats = {
    present: presentToday,
    late: lateToday,
    onLeave: onLeaveToday,
    absent: absentToday,
    earlyDepartures: att.earlyDepartures || 0 };

  const deptEntries = Object.entries(summary?.departmentDistribution || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const deptChartLabels = deptEntries.map(([name]) => {
    const trimmed = name.trim();
    if (trimmed.length <= 8) return trimmed;
    return `${trimmed.slice(0, 7)}…`;
  });
  const deptChartData = deptEntries.map(([, count]) => count);

  const pendingTotal = (leaves.pending || 0) + (expenses.pending || 0);
  const openAnomalies = anomalyStats?.open_alerts || 0;
  const holidays = summary?.upcomingHolidays || [];
  const avgPerf = Math.round(summary?.averagePerformanceRating || 0);

  return (
    <>
      {/* Quick actions */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Text style={styles.sectionSub}>Swipe left or right for more</Text>
      </View>
      <QuickActionsScroller actions={ADMIN_QUICK_ACTIONS} onNavigate={(screen) => navigation.navigate(screen)} />

      {/* KPI row */}
      <View style={styles.bentoRow}>
        <KpiCard
          icon="people"
          value={loading ? '—' : totalStaff}
          label="Total Staff"
          gradient={['#1C64F2', '#4F46E5']}
          sub={`${emp.active || 0} active`}
          onPress={() => navigation.navigate('Employees')}
        />
        <KpiCard
          icon="checkmark-circle"
          value={loading ? '—' : presentToday}
          label="Present Today"
          gradient={['#059669', '#10B981']}
          sub={`${attendanceRate}% rate`}
          onPress={() => navigation.navigate('AdminAttendance')}
        />
      </View>

      {/* Pending strip */}
      {(pendingTotal > 0 || recruitment.interviewsScheduled > 0) && (
        <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('Approvals')}>
          <Text style={styles.stripTitle}>Needs Attention</Text>
          <View style={styles.stripRow}>
            {leaves.pending > 0 && (
              <TouchableOpacity style={styles.stripChip} onPress={() => navigation.navigate('AdminLeaves')}>
                <Ionicons name="calendar-outline" size={16} color="#D97706" />
                <Text style={styles.stripChipText}>{leaves.pending} leave requests</Text>
              </TouchableOpacity>
            )}
            {expenses.pending > 0 && (
              <TouchableOpacity style={styles.stripChip} onPress={() => navigation.navigate('Expenses')}>
                <Ionicons name="receipt-outline" size={16} color="#DC2626" />
                <Text style={styles.stripChipText}>{expenses.pending} expenses</Text>
              </TouchableOpacity>
            )}
            {recruitment.interviewsScheduled > 0 && (
              <TouchableOpacity style={styles.stripChip} onPress={() => navigation.navigate('Recruitment')}>
                <Ionicons name="videocam-outline" size={16} color="#7C3AED" />
                <Text style={styles.stripChipText}>{recruitment.interviewsScheduled} interviews today</Text>
              </TouchableOpacity>
            )}
          </View>
        </BentoCard>
      )}

      {/* Pending + Performance */}
      <View style={styles.bentoRow}>
        <BentoCard gradient={['#D97706', '#F59E0B']} style={{ width: HALF }} onPress={() => navigation.navigate('AdminLeaves')}>
          <Ionicons name="hourglass-outline" size={20} color="rgba(255,255,255,0.95)" />
          <Text style={styles.miniKpiVal}>{leaves.pending || 0}</Text>
          <Text style={styles.miniKpiLabel}>Pending Leaves</Text>
        </BentoCard>
        <BentoCard gradient={['#7C3AED', '#A78BFA']} style={{ width: HALF }} onPress={() => navigation.navigate('Performance')}>
          <Ionicons name="star" size={20} color="rgba(255,255,255,0.95)" />
          <Text style={styles.miniKpiVal}>{avgPerf || '—'}</Text>
          <Text style={styles.miniKpiLabel}>Avg Performance</Text>
        </BentoCard>
      </View>

      {/* Attendance trend - full width */}
      <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('AdminAttendance')}>
        <View style={styles.chartHead}>
          <View>
            <Text style={styles.cardTitle}>Attendance Trend</Text>
            <Text style={styles.cardSub}>Last 6 months</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
        {trend6.length > 0 ? (
          <TrendLine
            data={attTrend}
            labels={trendLabels}
            width={CHART_FULL}
            height={140}
            color={colors.primary}
            bare
            showXLabels={false}
          />
        ) : (
          <View style={styles.emptyChart}><Text style={styles.emptyMiniText}>No trend data</Text></View>
        )}
      </BentoCard>

      {/* Payroll trend - full width */}
      <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('PayrollAdmin')}>
        <View style={styles.chartHead}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.cardTitle}>Payroll Trend</Text>
            <Text style={styles.cardSub}>Net pay (₹ thousands) · Last 6 months</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
        {trend6.length > 0 ? (
          <TrendLine
            data={payTrend}
            labels={trendLabels}
            width={CHART_FULL}
            height={140}
            color="#059669"
            bare
            showXLabels={false}
          />
        ) : (
          <View style={styles.emptyChart}><Text style={styles.emptyMiniText}>No payroll data</Text></View>
        )}
      </BentoCard>

      {/* Expenses trend */}
      <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('Expenses')}>
        <View style={styles.chartHead}>
          <View>
            <Text style={styles.cardTitle}>Expenses</Text>
            <Text style={styles.cardSub}>
              ₹{(expenses.monthTotal || 0).toLocaleString()} this month
            </Text>
          </View>
          <View style={styles.chartHeadRight}>
            <View style={styles.expBadge}>
              <Text style={styles.expBadgeText}>{expenses.pending || 0} pending</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>
        </View>
        {trend6.length > 0 && (
          <TrendLine
            data={expTrend}
            labels={trendLabels}
            width={CHART_FULL}
            height={130}
            color="#F59E0B"
            bare
            showXLabels={false}
          />
        )}
      </BentoCard>

      <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('AdminAttendance')}>
        <View style={styles.chartHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Attendance</Text>
            <Text style={styles.cardSub}>
              {presentToday} present · {attendanceRate}% rate · {activeStaff} active staff
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
        <AttendanceList
          stats={attendanceStats}
          onPress={() => navigation.navigate('AdminAttendance')}
        />
      </BentoCard>

      {/* Departments */}
      <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('Company')}>
        <View style={styles.chartHead}>
          <View>
            <Text style={styles.cardTitle}>Departments</Text>
            <Text style={styles.cardSub}>Headcount by department</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
        {deptEntries.length === 0 ? (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyMiniText}>No departments</Text>
          </View>
        ) : (
          <AreaBar
            data={deptChartData}
            labels={deptChartLabels}
            width={CHART_FULL}
            height={170}
            bare
          />
        )}
      </BentoCard>

      {/* Recruitment list */}
      <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('Recruitment')}>
        <View style={styles.chartHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Recruitment</Text>
            <Text style={styles.cardSub}>
              {recruitment.interviewsScheduled || 0} interviews today · {pipeline?.total || 0} candidates
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
        <RecruitmentList
          pipeline={pipeline}
          interviews={interviews}
          onPress={() => navigation.navigate('Recruitment')}
        />
      </BentoCard>

      {/* Holidays + new hires */}
      <View style={[styles.bentoRow, styles.bentoRowStretch]}>
        <BentoCard style={styles.halfCard} tall stretch onPress={() => navigation.navigate('Holidays')}>
          <View>
            <Text style={styles.cardTitle}>Holidays</Text>
            <Text style={styles.cardSub}>Upcoming</Text>
          </View>
          <View style={styles.holidayList}>
            {holidays.length === 0 ? (
              <View style={styles.emptyMini}>
                <Ionicons name="calendar-outline" size={24} color={colors.textTertiary} />
                <Text style={styles.emptyMiniText}>None scheduled</Text>
              </View>
            ) : (
              holidays.slice(0, 3).map((h, i) => {
                const d = new Date(h.date);
                return (
                  <View key={i} style={styles.holidayMini}>
                    <View style={styles.holidayDate}>
                      <Text style={styles.holidayDay}>{d.getDate()}</Text>
                      <Text style={styles.holidayMon}>{d.toLocaleString('en', { month: 'short' })}</Text>
                    </View>
                    <Text style={styles.holidayName} numberOfLines={1}>{h.name}</Text>
                  </View>
                );
              })
            )}
          </View>
        </BentoCard>

        <BentoCard style={styles.halfCard} tall stretch onPress={() => navigation.navigate('Recruitment')}>
          <View>
            <Text style={styles.cardTitle}>New Hires</Text>
            <Text style={styles.cardSub}>This month</Text>
          </View>
          <View style={styles.newHireBox}>
            <Text style={styles.newHireVal}>{emp.newHires || 0}</Text>
            <Text style={styles.newHireLbl}>employees joined</Text>
          </View>
          <View style={styles.newHireMeta}>
            <View style={styles.newHireMetaItem}>
              <Text style={styles.newHireMetaVal}>{recruitment.jobOffered || 0}</Text>
              <Text style={styles.newHireMetaLbl}>Offers out</Text>
            </View>
            <View style={styles.recruitDiv} />
            <View style={styles.newHireMetaItem}>
              <Text style={styles.newHireMetaVal}>{pipeline?.hired || 0}</Text>
              <Text style={styles.newHireMetaLbl}>Hired</Text>
            </View>
          </View>
        </BentoCard>
      </View>

      {/* Anomalies */}
      <BentoCard style={{ width: '100%' }} onPress={() => navigation.navigate('AdminAnomalies')}>
        <View style={styles.chartHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Anomalies</Text>
            <Text style={styles.cardSub}>
              {loading ? 'Loading…' : `${openAnomalies} open alert${openAnomalies === 1 ? '' : 's'}`}
            </Text>
          </View>
          <View style={styles.chartHeadRight}>
            {openAnomalies > 0 && (
              <View style={[styles.expBadge, { backgroundColor: colors.dangerSurface }]}>
                <Text style={[styles.expBadgeText, { color: colors.danger }]}>{openAnomalies}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>
        </View>
        <AnomalyList
          items={recentAnomalies}
          onPress={() => navigation.navigate('AdminAnomalies')}
        />
      </BentoCard>
    </>
  );
};

const EmployeeDashboard = ({ navigation, present, late, absent, onLeave, attendance, leaves, expenses, performance, payroll, holidays, leaveBalances, onChatPress }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const todayRecord = attendance.find((r) => {
    const d = String(r.date || r.attendance_date || '').slice(0, 10);
    return d === todayISO();
  });
  const todayCheckIn = todayRecord?.check_in || todayRecord?.checkIn;
  const todayCheckOut = todayRecord?.check_out || todayRecord?.checkOut;
  let todayWorkHours = todayRecord?.work_hours || todayRecord?.workHours;
  if ((!todayWorkHours || todayWorkHours === 0) && todayCheckIn) {
    const end = todayCheckOut ? new Date(todayCheckOut) : new Date();
    const ms = end.getTime() - new Date(todayCheckIn).getTime();
    if (ms > 0) todayWorkHours = (ms / 3600000);
  }

  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;
  const pendingExpenses = expenses.filter((e) => e.status === 'pending').length;
  const approvedLeaves = leaves.filter((l) => l.status === 'approved').length;

  const latestPayroll = Array.isArray(payroll) && payroll.length > 0 ? payroll[0] : null;
  const latestPerf = Array.isArray(performance) && performance.length > 0 ? performance[0] : null;

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const attendanceByMonth = React.useMemo(() => {
    const counts = {};
    attendance.forEach((r) => {
      const d = new Date(r.date || r.attendance_date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!counts[key]) counts[key] = { present: 0, total: 0 };
      counts[key].total += 1;
      if (r.status === 'present' || r.status === 'late') counts[key].present += 1;
    });
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      result.push({ label: monthNames[d.getMonth()], value: counts[key]?.present || 0 });
    }
    return result;
  }, [attendance]);

  const expensesByMonth = React.useMemo(() => {
    const totals = {};
    expenses.forEach((e) => {
      const d = new Date(e.date || e.expense_date || e.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      totals[key] = (totals[key] || 0) + (parseFloat(e.amount) || 0);
    });
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      result.push({ label: monthNames[d.getMonth()], value: Math.round(totals[key] || 0) });
    }
    return result;
  }, [expenses]);

  const salaryByMonth = React.useMemo(() => {
    const salaries = {};
    const payrollArr = Array.isArray(payroll) ? payroll : [];
    payrollArr.forEach((p) => {
      const m = (p.month || p.payroll_month || 0) - 1;
      const y = p.year || p.payroll_year || new Date().getFullYear();
      const key = `${y}-${m}`;
      salaries[key] = parseFloat(p.net_salary || p.netSalary || 0);
    });
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      result.push({ label: monthNames[d.getMonth()], value: Math.round(salaries[key] || 0) });
    }
    return result;
  }, [payroll]);

  return (
  <>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <Text style={styles.sectionSub}>Swipe left or right for more</Text>
    </View>
    <QuickActionsScroller actions={EMPLOYEE_QUICK_ACTIONS} onNavigate={(screen) => navigation.navigate(screen)} />

    <View style={styles.bentoRow}>
      <BentoCard gradient={['#7C3AED', '#A78BFA']} style={{ width: HALF }} onPress={() => navigation.navigate('Leaves')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.9)" />
          <Text style={styles.kpiLabel}>Pending</Text>
        </View>
        <Text style={styles.kpiValue}>{pendingLeaves}</Text>
        <Text style={styles.kpiLabel}>Leave Requests</Text>
      </BentoCard>
      <BentoCard gradient={['#F59E0B', '#FBBF24']} style={{ width: HALF }} onPress={() => navigation.navigate('Expenses')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="receipt-outline" size={18} color="rgba(255,255,255,0.9)" />
          <Text style={styles.kpiLabel}>Pending</Text>
        </View>
        <Text style={styles.kpiValue}>{pendingExpenses}</Text>
        <Text style={styles.kpiLabel}>Expense Claims</Text>
      </BentoCard>
    </View>

    <BentoCard onPress={() => navigation.navigate('Attendance')}>
      <View style={styles.chartHead}>
        <View>
          <Text style={styles.cardTitle}>Today's Attendance</Text>
          <Text style={styles.cardSub}>{todayRecord?.status === 'present' ? 'Present' : todayRecord?.status === 'late' ? 'Late' : todayRecord?.status || 'No record yet'}</Text>
        </View>
      </View>
      <View style={styles.splitList}>
        <View style={styles.splitRow}>
          <View style={[styles.splitDot, { backgroundColor: todayCheckIn ? '#10B981' : '#9CA3AF' }]} />
          <Text style={styles.splitLabel}>Check In</Text>
          <Text style={styles.splitVal}>{fmtTime(todayCheckIn)}</Text>
        </View>
        <View style={styles.splitRow}>
          <View style={[styles.splitDot, { backgroundColor: todayCheckOut ? '#3B82F6' : '#9CA3AF' }]} />
          <Text style={styles.splitLabel}>Check Out</Text>
          <Text style={styles.splitVal}>{todayCheckOut ? fmtTime(todayCheckOut) : '—'}</Text>
        </View>
        <View style={styles.splitRow}>
          <View style={[styles.splitDot, { backgroundColor: '#8B5CF6' }]} />
          <Text style={styles.splitLabel}>Work Hours</Text>
          <Text style={styles.splitVal}>{todayWorkHours ? `${Math.floor(todayWorkHours)}h ${Math.floor((todayWorkHours - Math.floor(todayWorkHours)) * 60)}m` : '—'}</Text>
        </View>
      </View>
    </BentoCard>

    {latestPayroll && (
      <BentoCard onPress={() => navigation.navigate('Payslips')}>
        <View style={styles.chartHead}>
          <View>
            <Text style={styles.cardTitle}>Latest Payslip</Text>
            <Text style={styles.cardSub}>{latestPayroll.month}/{latestPayroll.year} · {latestPayroll.status}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
        <View style={styles.splitList}>
          <View style={styles.splitRow}>
            <View style={[styles.splitDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.splitLabel}>Net Salary</Text>
            <Text style={styles.splitVal}>₹{Number(latestPayroll.net_salary || latestPayroll.netSalary || 0).toLocaleString()}</Text>
          </View>
          <View style={styles.splitRow}>
            <View style={[styles.splitDot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.splitLabel}>Earned</Text>
            <Text style={styles.splitVal}>₹{Number(latestPayroll.earned || latestPayroll.gross_salary || latestPayroll.grossSalary || 0).toLocaleString()}</Text>
          </View>
        </View>
      </BentoCard>
    )}

    {latestPerf && (
      <BentoCard onPress={() => navigation.navigate('MyPerformance')}>
        <View style={styles.chartHead}>
          <View>
            <Text style={styles.cardTitle}>Performance</Text>
            <Text style={styles.cardSub}>{latestPerf.review_period || latestPerf.reviewPeriod || 'Latest Review'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
        <View style={styles.splitList}>
          <View style={styles.splitRow}>
            <View style={[styles.splitDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.splitLabel}>Rating</Text>
            <Text style={styles.splitVal}>{latestPerf.rating || latestPerf.overall_rating || '—'}</Text>
          </View>
          {latestPerf.goal_completion !== undefined && (
            <View style={styles.splitRow}>
              <View style={[styles.splitDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.splitLabel}>Goal Completion</Text>
              <Text style={styles.splitVal}>{latestPerf.goal_completion}%</Text>
            </View>
          )}
        </View>
      </BentoCard>
    )}

    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>Your Trends</Text>
      <Text style={styles.sectionSub}>Last 6 months overview</Text>
    </View>

    <BentoCard onPress={() => navigation.navigate('AttendanceHistory')}>
      <View style={styles.chartHead}>
        <View>
          <Text style={styles.cardTitle}>Attendance</Text>
          <Text style={styles.cardSub}>Days present per month</Text>
        </View>
      </View>
      <TrendLine
        data={attendanceByMonth.map((d) => d.value)}
        labels={attendanceByMonth.map((d) => d.label)}
        color="#10B981"
        height={180}
        bare
        showXLabels
      />
    </BentoCard>

    <BentoCard onPress={() => navigation.navigate('Expenses')}>
      <View style={styles.chartHead}>
        <View>
          <Text style={styles.cardTitle}>Expenses</Text>
          <Text style={styles.cardSub}>Amount submitted per month</Text>
        </View>
      </View>
      <TrendLine
        data={expensesByMonth.map((d) => d.value)}
        labels={expensesByMonth.map((d) => d.label)}
        color="#F59E0B"
        height={180}
        bare
        showXLabels
      />
    </BentoCard>

    <BentoCard onPress={() => navigation.navigate('Payslips')}>
      <View style={styles.chartHead}>
        <View>
          <Text style={styles.cardTitle}>Salary</Text>
          <Text style={styles.cardSub}>Net salary received per month</Text>
        </View>
      </View>
      <TrendLine
        data={salaryByMonth.map((d) => d.value)}
        labels={salaryByMonth.map((d) => d.label)}
        color="#4F46E5"
        height={180}
        bare
        showXLabels
      />
    </BentoCard>

    <BentoCard onPress={() => navigation.navigate('Leaves', { initialTab: 'balance' })}>
      <View style={styles.chartHead}>
        <View>
          <Text style={styles.cardTitle}>Leave Balance</Text>
          <Text style={styles.cardSub}>{leaveBalances.length > 0 ? 'Available leaves' : 'No records'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
      <View style={styles.splitList}>
        {(leaveBalances.length > 0 ? leaveBalances.slice(0, 4) : []).length === 0 ? (
          <View style={[styles.splitRow, { paddingVertical: 4 }]}>
            <View style={[styles.splitDot, { backgroundColor: '#9CA3AF' }]} />
            <Text style={styles.splitLabel}>No leave types</Text>
            <Text style={styles.splitVal}>0 / 0</Text>
          </View>
        ) : (
          leaveBalances.slice(0, 4).map((lb, i) => (
            <View key={lb.id || i} style={[styles.splitRow, i < Math.min(leaveBalances.length, 4) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingBottom: 8, marginBottom: 4 }]}>
              <View style={[styles.splitDot, { backgroundColor: (lb.remainingDays ?? 0) > 0 ? '#10B981' : '#9CA3AF' }]} />
              <Text style={styles.splitLabel} numberOfLines={1}>{lb.leaveTypeName || 'Leave'}</Text>
              <Text style={styles.splitVal}>{lb.remainingDays ?? 0} / {lb.totalDays ?? 0}</Text>
            </View>
          ))
        )}
      </View>
    </BentoCard>

    {(() => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const upcoming = (Array.isArray(holidays) ? holidays : [])
        .filter((h) => new Date(h.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 3);
      return (
        <BentoCard onPress={() => navigation.navigate('Holidays')}>
          <View style={styles.chartHead}>
            <View>
              <Text style={styles.cardTitle}>Upcoming Holidays</Text>
              <Text style={styles.cardSub}>{upcoming.length > 0 ? `Next ${upcoming.length} holiday${upcoming.length > 1 ? 's' : ''}` : 'No upcoming holidays'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>
          {upcoming.length > 0 ? upcoming.map((h, i) => {
            const hd = new Date(h.date);
            return (
              <View key={h.id || i} style={[styles.splitRow, i < upcoming.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingBottom: 8, marginBottom: 4 }]}>
                <View style={[styles.splitDot, { backgroundColor: '#4F46E5' }]} />
                <Text style={styles.splitLabel} numberOfLines={1}>{h.name || h.title}</Text>
                <Text style={styles.splitVal}>{hd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: getTimezone() })}</Text>
              </View>
            );
          }) : (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Ionicons name="calendar-outline" size={28} color={colors.textTertiary} />
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>No holidays scheduled yet</Text>
            </View>
          )}
        </BentoCard>
      );
    })()}
  </>
  );
};

const DashboardScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [summary, setSummary] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [anomalyStats, setAnomalyStats] = useState(null);
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const scrollTopBar = useScrollTopBar();

  const isAdmin = ['admin', 'superadmin', 'hr_admin', 'hr_manager'].includes(user?.role);

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endStr = todayISO();

      if (isAdmin) {
        const [summaryRes, pipelineRes, interviewsRes, anomalyStatsRes, anomaliesRes] = await Promise.allSettled([
          api.get('/dashboard/summary', { params: { months: 6 } }),
          api.get('/recruitment/pipeline-stats'),
          api.get('/recruitment/interviews'),
          api.get('/anomalies/stats'),
          api.get('/anomalies', { params: { status: 'open', limit: 5 } }),
        ]);
        if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data || null);
        if (pipelineRes.status === 'fulfilled') setPipeline(pipelineRes.value.data || null);
        if (interviewsRes.status === 'fulfilled') {
          const raw = interviewsRes.value.data?.data || interviewsRes.value.data || [];
          setInterviews(Array.isArray(raw) ? raw : []);
        }
        if (anomalyStatsRes.status === 'fulfilled') setAnomalyStats(anomalyStatsRes.value.data || null);
        if (anomaliesRes.status === 'fulfilled') {
          const raw = anomaliesRes.value.data?.data || anomaliesRes.value.data || [];
          setRecentAnomalies(Array.isArray(raw) ? raw : []);
        }
      } else {
        const empId = user?.employeeId ?? user?.employee_id;
        const [attRes, leaveRes, expRes, perfRes, payrollRes, holidayRes, balanceRes] = await Promise.allSettled([
          api.get('/attendance', { params: { employeeId: empId, startDate: daysAgoISO(180), endDate: endStr } }),
          api.get('/leaves', { params: { status: 'all' } }),
          api.get('/expenses', { params: { employeeId: empId } }),
          empId ? api.get(`/employees/${empId}/performance-history`) : Promise.resolve(null),
          empId ? api.get(`/payroll/employee/${empId}`) : Promise.resolve(null),
          api.get('/holidays', { params: { year: now.getFullYear() } }),
          api.get('/leave-balances', { params: { employeeId: empId, year: now.getFullYear() } }),
        ]);
        if (attRes.status === 'fulfilled') setAttendance(attRes.value.data?.data || attRes.value.data || []);
        if (leaveRes.status === 'fulfilled') setLeaves(leaveRes.value.data?.data || leaveRes.value.data || []);
        if (expRes.status === 'fulfilled') setExpenses(expRes.value.data?.data || expRes.value.data || []);
        if (perfRes.status === 'fulfilled' && perfRes.value) setPerformance(perfRes.value.data?.data || perfRes.value.data || []);
        if (payrollRes.status === 'fulfilled' && payrollRes.value) setPayroll(payrollRes.value.data?.data || payrollRes.value.data || []);
        if (holidayRes.status === 'fulfilled') setHolidays(holidayRes.value.data?.data || holidayRes.value.data || []);
        if (balanceRes.status === 'fulfilled') setLeaveBalances(balanceRes.value.data?.data || balanceRes.value.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, user?.employeeId, user?.employee_id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  const present = attendance.filter((r) => r.status === 'present').length;
  const late = attendance.filter((r) => r.status === 'late').length;
  const absent = attendance.filter((r) => r.status === 'absent').length;
  const onLeave = leaves.filter((l) => l.status === 'approved').length;

  const now = new Date();
  const totalWorkHours = attendance.reduce((sum, r) => sum + (parseFloat(r.work_hours || r.workHours) || 0), 0);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weeklyHours = attendance
    .filter((r) => new Date(r.date || r.attendance_date) >= weekStart)
    .reduce((sum, r) => sum + (parseFloat(r.work_hours || r.workHours) || 0), 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyHours = attendance
    .filter((r) => new Date(r.date || r.attendance_date) >= monthStart)
    .reduce((sum, r) => sum + (parseFloat(r.work_hours || r.workHours) || 0), 0);

  const days30Ago = new Date(now);
  days30Ago.setDate(now.getDate() - 30);
  const last30 = attendance.filter((r) => new Date(r.date || r.attendance_date) >= days30Ago);
  const avgDailyHours = last30.length > 0 ? totalWorkHours / last30.length : 0;

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const handleChatPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    navigation.navigate('Chat');
  };

  return (
    <View style={styles.container}>
    <ScrollView
      {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 72 })}
      refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#1C64F2', '#4F46E5', '#6366F1']} style={[styles.hero, bannerShellStyle(scrollTopBar)]}>
        <View style={styles.heroOrb1} />
        <View style={styles.heroOrb2} />
        <View style={styles.heroContent}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroGreeting}>{greeting},</Text>
              <Text style={styles.heroName} numberOfLines={2}>{user?.fullName || 'Employee'}</Text>
              <View style={styles.heroMeta}>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{(user?.role || 'employee').replace(/_/g, ' ')}</Text>
                </View>
                <Text style={styles.heroDate}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: getTimezone() })}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')} activeOpacity={0.85}>
              <Avatar
                firstName={user?.fullName?.split(' ')[0]}
                lastName={user?.fullName?.split(' ')[1]}
                size={56}
                premium
                status="online"
              />
            </TouchableOpacity>
          </View>
          {isAdmin && summary && (
            <View style={styles.heroStats}>
              <TouchableOpacity style={styles.heroStat} onPress={() => navigation.navigate('Employees')} activeOpacity={0.8}>
                <Text style={styles.heroStatVal}>{summary.employees?.active || 0}</Text>
                <Text style={styles.heroStatLbl}>Active</Text>
              </TouchableOpacity>
              <View style={styles.heroStatDiv} />
              <TouchableOpacity style={styles.heroStat} onPress={() => navigation.navigate('AdminAttendance')} activeOpacity={0.8}>
                <Text style={styles.heroStatVal}>{summary.attendance?.presentToday || 0}</Text>
                <Text style={styles.heroStatLbl}>Present</Text>
              </TouchableOpacity>
              <View style={styles.heroStatDiv} />
              <TouchableOpacity style={styles.heroStat} onPress={() => navigation.navigate('Approvals')} activeOpacity={0.8}>
                <Text style={styles.heroStatVal}>{(summary.leaves?.pending || 0) + (summary.expenses?.pending || 0)}</Text>
                <Text style={styles.heroStatLbl}>Pending</Text>
              </TouchableOpacity>
            </View>
          )}
          {!isAdmin && (
            <View style={styles.heroStats}>
              <TouchableOpacity style={styles.heroStat} onPress={() => navigation.navigate('Attendance')} activeOpacity={0.8}>
                <Text style={styles.heroStatVal}>{weeklyHours.toFixed(1)}h</Text>
                <Text style={styles.heroStatLbl}>This Week</Text>
              </TouchableOpacity>
              <View style={styles.heroStatDiv} />
              <TouchableOpacity style={styles.heroStat} onPress={() => navigation.navigate('Attendance')} activeOpacity={0.8}>
                <Text style={styles.heroStatVal}>{monthlyHours.toFixed(1)}h</Text>
                <Text style={styles.heroStatLbl}>This Month</Text>
              </TouchableOpacity>
              <View style={styles.heroStatDiv} />
              <TouchableOpacity style={styles.heroStat} onPress={() => navigation.navigate('Attendance')} activeOpacity={0.8}>
                <Text style={styles.heroStatVal}>{avgDailyHours.toFixed(1)}h</Text>
                <Text style={styles.heroStatLbl}>Avg Daily</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </LinearGradient>

      <View style={styles.bento}>
        {isAdmin ? (
          <AdminDashboard
            navigation={navigation}
            summary={summary}
            pipeline={pipeline}
            interviews={interviews}
            anomalyStats={anomalyStats}
            recentAnomalies={recentAnomalies}
            loading={loading}
          />
        ) : (
          <EmployeeDashboard navigation={navigation} present={present} late={late} absent={absent} onLeave={onLeave} attendance={attendance} leaves={leaves} expenses={expenses} performance={performance} payroll={payroll} holidays={holidays} leaveBalances={leaveBalances} onChatPress={handleChatPress} />
        )}
      </View>
    </ScrollView>

    <Animated.View style={[styles.fab, { bottom: TAB_BAR_CLEARANCE + 8, transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity style={styles.fabBtn} onPress={handleChatPress} activeOpacity={0.85}>
        <Ionicons name="sparkles" size={26} color="#FFF" />
      </TouchableOpacity>
      <Text style={styles.fabLabel}>HR Assistant!</Text>
    </Animated.View>
    </View>
  );
};

export default DashboardScreen;
