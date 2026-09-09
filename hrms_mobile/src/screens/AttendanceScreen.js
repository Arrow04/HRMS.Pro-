import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert, Platform, Modal, Linking, TextInput } from 'react-native';
import { HrmsRefreshControl } from '../components/HrmsRefreshControl';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { prepareSelfieForUpload, newPunchRequestId } from '../utils/selfieCapture';
import { radii, spacing, shadows, resolveStatChip } from '../theme';
import { TAB_BAR_CLEARANCE } from '../components/AppTabBar';
import { AdminMonthRow, scrollViewTopBarProps, bannerShellStyle } from '../components/AdminScreenKit';
import { useScrollTopBar } from '../hooks/useScrollTopBar';
import { useTimezone } from '../context/TimezoneContext';
import { fmtTimeSec, fmtTime, fmtWeekday, fmtDateCompact, fmtDateShort, todayZone, nowZone, getTimezone, todayISO, daysAgoISO, monthStartISO, monthEndISO, currentMonthISO, dateToMonthISO } from '../utils/timezone';

const PAD = 20;
const RECENT_RECORDS_LIMIT = 5;

const createStyles = (colors, isDark) => ({
  container: { flex: 1, backgroundColor: colors.bg, overflow: 'visible' },
  headerBg: {
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden' },
  bgOrb1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.08)', top: -50, right: -50 },
  bgOrb2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(79,70,229,0.2)', bottom: -20, left: 20 },
  bgOrb3: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.05)', top: 40, left: 100 },
  headerContent: { paddingHorizontal: PAD },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', letterSpacing: -0.4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: '500' },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 },
  headerBadgeDot: { width: 8, height: 8, borderRadius: 4 },
  headerBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 },
  headerRateCard: {
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerRateTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRateTitle: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  headerRateSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2, fontWeight: '600' },
  headerRatePct: { fontSize: 24, fontWeight: '800', color: '#A7F3D0', letterSpacing: -0.5 },
  headerRateBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  headerRateBarFill: { height: 8, borderRadius: 4 },
  body: { padding: PAD, gap: 14, marginTop: -12 },
  noEmpCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#BFDBFE',
    ...shadows.md },
  noEmpIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16 },
  noEmpTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  noEmpSub: { fontSize: 13, color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  clockCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E8F0',
    ...shadows.md },
  clockWrap: { alignItems: 'center' },
  clockTime: { fontSize: 42, fontWeight: '800', color: colors.text, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  clockDate: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontWeight: '500' },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderLight },
  periodText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  openSessionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    backgroundColor: colors.warningSurface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    width: '100%' },
  openSessionText: { flex: 1, fontSize: 12, color: colors.warningText, lineHeight: 18, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm },
  statCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statVal: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, marginTop: 2 },
  punchCardOuter: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E8F0',
    ...shadows.md },
  punchCardInner: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 20,
    overflow: 'hidden' },
  timeClockHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  timeClockEyebrow: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 1.2 },
  timeClockTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.3 },
  timeClockSub: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: '500' },
  timeClockStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.borderLight },
  timeClockDisplay: {
    alignItems: 'center',
    paddingVertical: 18,
    marginBottom: 16,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight },
  timeClockLiveTime: { fontSize: 40, fontWeight: '800', color: colors.text, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  timeClockLiveDate: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontWeight: '600' },
  timeClockSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 16,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden' },
  timeClockSessionBox: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  timeClockSessionLabel: { fontSize: 10, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  timeClockSessionValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 6, fontVariant: ['tabular-nums'] },
  timeClockSessionValueMuted: { color: colors.textTertiary },
  timeClockDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.borderLight },
  timeClockVerifyRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  timeClockActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: radii.lg,
    paddingVertical: 16,
    overflow: 'hidden' },
  timeClockActionText: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  timeClockActionSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.82)', marginTop: 2 },
  punchAccent: { height: 4, width: '100%', marginBottom: 16, borderRadius: 2 },
  punchTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  punchTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  punchIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)' },
  punchTopTitle: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  punchTopSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  punchStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1 },
  punchStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  miniClock: { alignItems: 'flex-end' },
  miniClockTime: { fontSize: 20, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  miniClockDate: { fontSize: 10, color: colors.textTertiary, fontWeight: '600', marginTop: 2 },
  verifyRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  verifyChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1 },
  verifyChipReady: { backgroundColor: isDark ? '#064E3B33' : '#ECFDF5', borderColor: isDark ? '#065F46' : '#A7F3D0' },
  verifyChipPending: { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight },
  verifyChipText: { fontSize: 11, fontWeight: '700' },
  punchWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: 8, width: 220, height: 220, alignSelf: 'center' },
  punchRing: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 2 },
  punchRing2: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 1 },
  punchRing3: { position: 'absolute', width: 168, height: 168, borderRadius: 84, borderWidth: 1, borderStyle: 'dashed' },
  punchBtnOuter: {
    width: 156,
    height: 156,
    borderRadius: 78,
    padding: 4,
    backgroundColor: isDark ? colors.surfaceSecondary : '#FFF',
    ...shadows.colored('#1C64F2', 0.3) },
  punchBtn: {
    flex: 1,
    borderRadius: 74,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden' },
  punchBtnShine: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: 8,
    right: 8 },
  punchBtnText: { fontSize: 14, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 },
  punchHint: { fontSize: 11, color: colors.textTertiary, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  sessionTimeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight },
  sessionNode: { flex: 1, alignItems: 'center' },
  sessionDot: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8 },
  sessionNodeLabel: { fontSize: 10, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  sessionNodeTime: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  sessionTrack: { flex: 1.2, alignItems: 'center', paddingTop: 18, minWidth: 60 },
  sessionTrackLine: { height: 3, width: '100%', backgroundColor: colors.borderLight, borderRadius: 2, overflow: 'hidden' },
  sessionTrackFill: { height: 3, borderRadius: 2 },
  sessionDurationPill: {
    marginTop: 10,
    backgroundColor: colors.primarySurface,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#BFDBFE' },
  sessionDurationText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  recordsGroup: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    ...shadows.sm },
  recordsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight },
  recordRowLast: { borderBottomWidth: 0 },
  recordDateCompact: { width: 42, alignItems: 'center', paddingTop: 2 },
  recordDayNum: { fontSize: 16, fontWeight: '800', color: colors.text, lineHeight: 20 },
  recordDayLbl: { fontSize: 9, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', marginTop: 1 },
  recordMid: { flex: 1, minWidth: 0, justifyContent: 'center' },
  recordTimeLine: { fontSize: 12, fontWeight: '600', color: colors.text },
  recordMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  recordDot: { width: 6, height: 6, borderRadius: 3 },
  recordStatus: { fontSize: 10, fontWeight: '700', color: colors.textTertiary, textTransform: 'capitalize' },
  recordHoursCompact: { fontSize: 12, fontWeight: '800', color: colors.text, minWidth: 36, textAlign: 'right', paddingTop: 4 },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm },
  recordDateBox: {
    width: 48,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center' },
  recordDate: { fontSize: 18, fontWeight: '800', color: colors.primary },
  recordDay: { fontSize: 9, color: colors.primary, fontWeight: '800', textTransform: 'uppercase' },
  recordCenter: { flex: 1, marginLeft: 12 },
  recordTimes: { fontSize: 12, color: colors.textSecondary, marginTop: 6, fontWeight: '500' },
  recordHours: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.md,
    overflow: 'hidden' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.full },
  statusBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize', letterSpacing: 0.3 },
  skeleton: { height: 44, borderRadius: radii.md, backgroundColor: colors.surfaceSecondary, opacity: 0.6, marginBottom: 6 },
  emptyCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderLight },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12 },
  emptyText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.xl,
    padding: 16,
    gap: 14,
    overflow: 'hidden',
    ...shadows.sm },
  historyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)' },
  historyTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  historySub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '500' },
  cameraModal: { flex: 1, backgroundColor: '#000' },
  cameraTopBar: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
  cameraTitleWrap: { alignItems: 'center' },
  cameraTitle: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  cameraSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '500' },
  cameraFaceGuide: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  faceRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: 'rgba(20,184,166,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.colored('#14B8A6', 0.4),
  },
  faceCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderStyle: 'dashed',
  },
  faceGuideText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 20, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 },
  cameraBottomBar: { alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  cameraCancelBtn: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: radii.full,
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.55)',
  },
  cameraCancelText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  captureBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#14B8A6',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.colored('#14B8A6', 0.5),
  },
  captureBtnInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#14B8A6' },
  correctionModal: { flex: 1, backgroundColor: colors.bg },
  correctionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md },
  correctionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, flex: 1, marginRight: 12 },
  correctionBody: { padding: spacing.xl, gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#14B8A6', borderRadius: radii.lg, paddingVertical: 14, marginTop: 8 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});

const getMyEmployeeId = (user) => user?.employeeId ?? user?.employee_id ?? null;

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normRecord = (r) => {
  if (!r) return r;
  return {
    ...r,
    checkIn: r.checkIn || r.check_in,
    checkOut: r.checkOut || r.check_out,
    workHours: r.workHours || r.work_hours };
};

const formatDuration = (start, end, { live = false } = {}) => {
  const ms = Math.max(0, new Date(end) - new Date(start));
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (live) {
    const pad = (n) => String(n).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
  }
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
};

function TimeClockDisplay() {
  const styles = useThemedStyles((c, d) => createStyles(c, d));
  const [time, setTime] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <View style={styles.timeClockDisplay}>
      <Text style={styles.timeClockLiveTime}>
        {fmtTimeSec(time)}
      </Text>
      <Text style={styles.timeClockLiveDate}>
        {fmtWeekday(time)}, {fmtDateCompact(time)}
      </Text>
    </View>
  );
}

const STAT_CONFIG = [
  { key: 'present', label: 'Present', icon: 'checkmark-circle', color: '#10B981', bg: '#DCFCE7' },
  { key: 'late', label: 'Late', icon: 'time', color: '#D97706', bg: '#FEF3C7' },
  { key: 'absent', label: 'Absent', icon: 'close-circle', color: '#DC2626', bg: '#FEE2E2' },
  { key: 'leave', label: 'Leave', icon: 'sunny', color: '#2563EB', bg: '#DBEAFE' },
];

function LiveClock() {
  const styles = useThemedStyles((c, d) => createStyles(c, d));
  const { isDark } = useTheme();
  const [time, setTime] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  const h = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(time), 10);
  const period = h < 12
    ? { icon: 'partly-sunny-outline', label: 'Morning' }
    : h < 17
      ? { icon: 'sunny-outline', label: 'Afternoon' }
      : { icon: 'moon-outline', label: 'Evening' };

  return (
    <View style={styles.clockWrap}>
      <Text style={styles.clockTime}>
        {fmtTimeSec(time)}
      </Text>
      <Text style={styles.clockDate}>
        {fmtWeekday(time)}, {fmtDateCompact(time)}
      </Text>
      <View style={styles.periodPill}>
        <Ionicons name={period.icon} size={14} color={isDark ? '#94A3B8' : '#64748B'} />
        <Text style={styles.periodText}>{period.label}</Text>
      </View>
    </View>
  );
}

const statusStyle = (status, colors, isDark) => {
  const presets = {
    present: { bg: '#DCFCE7', color: '#16A34A' },
    late: { bg: '#FEF3C7', color: '#D97706' },
    absent: { bg: '#FEE2E2', color: '#DC2626' },
    on_leave: { bg: '#DBEAFE', color: '#2563EB' },
    leave: { bg: '#DBEAFE', color: '#2563EB' },
    default: { bg: '#F1F5F9', color: '#64748B' } };
  const key = status === 'on_leave' || status === 'leave' ? 'on_leave' : (status || 'default');
  const preset = presets[key] || presets.default;
  return resolveStatChip(preset, colors, isDark);
};

const AttendanceScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles((c) => createStyles(c, isDark));
  const [todayRecord, setTodayRecord] = useState(null);
  const [todaySessionCount, setTodaySessionCount] = useState(0);
  const [openSession, setOpenSession] = useState(null);
  const [monthRecords, setMonthRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationErr, setLocationErr] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [geofenceInfo, setGeofenceInfo] = useState(null);
  const [distanceFromBranch, setDistanceFromBranch] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthISO());
  const [showCamera, setShowCamera] = useState(false);
  const [pendingPunchType, setPendingPunchType] = useState(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ date: todayISO(), checkIn: '09:00', checkOut: '18:00', reason: '' });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const punchRingOpacity = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0] });
  const [tick, setTick] = useState(new Date());
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const scrollTopBar = useScrollTopBar();

  const myEmployeeId = getMyEmployeeId(user);
  const isCurrentMonth = selectedMonth === currentMonthISO();

  const fetchData = useCallback(async () => {
    if (!myEmployeeId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const now = new Date();
      const today = todayISO();
      const [year, month] = selectedMonth.split('-').map(Number);
      const startStr = monthStartISO(year, month);
      const lastDay = new Date(year, month, 0).getDate();
      const endStr = monthEndISO(year, month);

      const [attTodayRes, attMonthRes, attRecentRes] = await Promise.all([
        api.get('/attendance', { params: { employeeId: myEmployeeId, startDate: today, endDate: today } }),
        api.get('/attendance', { params: { employeeId: myEmployeeId, startDate: startStr, endDate: endStr } }),
        api.get('/attendance', {
          params: {
            employeeId: myEmployeeId,
            startDate: daysAgoISO(30),
            endDate: today } }),
      ]);

      const todayRecs = (attTodayRes.data?.data || attTodayRes.data || []).map(normRecord);
      setTodaySessionCount(todayRecs.length);
      setTodayRecord(todayRecs[0] || null);

      const recentRecs = (attRecentRes.data?.data || attRecentRes.data || []).map(normRecord);
      const open = recentRecs.find((r) => r.checkIn && !r.checkOut)
        || todayRecs.find((r) => r.checkIn && !r.checkOut)
        || null;
      setOpenSession(open);

      const monthRecs = (attMonthRes.data?.data || attMonthRes.data || []).map(normRecord);
      setMonthRecords(monthRecs);

      try {
        const geoRes = await api.get('/attendance/geofence-info');
        setGeofenceInfo(geoRes.data);
      } catch {}
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [myEmployeeId, selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const refreshLocation = useCallback(async (requestIfNeeded = true) => {
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setLocationErr('Turn on device location (GPS) to punch.');
        setLocation(null);
        setGpsAccuracy(null);
        return null;
      }

      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' && requestIfNeeded) {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        setLocationErr('Location permission is required for attendance.');
        setLocation(null);
        setGpsAccuracy(null);
        return null;
      }

      // Always get a FRESH high-accuracy fix for geofence precision.
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const acc = loc.coords.accuracy ?? null;
      setGpsAccuracy(acc);
      setLocation(loc.coords);
      setLocationErr(null);

      if (geofenceInfo?.branch?.latitude && geofenceInfo?.branch?.longitude) {
        const dist = haversineDistance(loc.coords.latitude, loc.coords.longitude, geofenceInfo.branch.latitude, geofenceInfo.branch.longitude);
        setDistanceFromBranch(Math.round(dist));
      }

      return loc.coords;
    } catch {
      setLocationErr('Could not get GPS fix. Move outdoors or tap GPS to retry.');
      setGpsAccuracy(null);
      return location;
    }
  }, [location, geofenceInfo]);

  useFocusEffect(
    useCallback(() => {
      refreshLocation(false);
    }, [refreshLocation]),
  );

  const punchRecord = (openSession?.checkIn && !openSession?.checkOut)
    ? openSession
    : (isAdmin && !openSession ? null : todayRecord);
  const isCheckedIn = !!(openSession?.checkIn && !openSession?.checkOut);
  const hasCompletedToday = !!(todayRecord?.checkIn && todayRecord?.checkOut);
  const isCompleted = !isAdmin && !isCheckedIn && hasCompletedToday;
  const todayStr = todayISO();
  const openFromPriorDay = openSession && (openSession.date?.slice?.(0, 10) || openSession.date) !== todayStr;

  useEffect(() => {
    if (!isCheckedIn || isCompleted) return undefined;
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, [isCheckedIn, isCompleted]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshLocation(true);
    fetchData();
  }, [fetchData, refreshLocation]);

  const present = monthRecords.filter((r) => r.status === 'present' || (r.checkIn && r.status !== 'late' && r.status !== 'absent' && r.status !== 'on_leave' && r.status !== 'leave')).length;
  const late = monthRecords.filter((r) => r.status === 'late').length;
  const absent = monthRecords.filter((r) => r.status === 'absent').length;
  const onLeave = monthRecords.filter((r) => r.status === 'on_leave' || r.status === 'leave' || r.is_on_leave).length;
  const statValues = { present, late, absent, leave: onLeave };
  const attendanceRate = (present + late + absent) > 0 ? Math.round((present / (present + late + absent)) * 100) : 0;

  const statusColor = isCompleted ? '#3B82F6' : isCheckedIn ? '#10B981' : '#94A3B8';
  const statusBg = isCompleted ? '#DBEAFE' : isCheckedIn ? '#DCFCE7' : colors.surfaceSecondary;
  const statusLabel = isCompleted
    ? 'Shift Completed'
    : isCheckedIn
      ? 'On Duty'
      : isAdmin && todaySessionCount > 0
        ? `Ready for Session ${todaySessionCount + 1}`
        : 'Ready to Clock In';

  const actionGradient = isCompleted
    ? ['#94A3B8', '#64748B']
    : isCheckedIn
      ? ['#DC2626', '#B91C1C']
      : ['#1C64F2', '#4F46E5'];

  const sessionDuration = punchRecord?.checkIn
    ? formatDuration(
      punchRecord.checkIn,
      punchRecord.checkOut || (isCheckedIn ? tick : null) || punchRecord.checkIn,
      { live: isCheckedIn && !punchRecord?.checkOut },
    )
    : null;
  const clockInTime = punchRecord?.checkIn
    ? fmtTime(punchRecord.checkIn)
    : '—';
  const clockOutTime = punchRecord?.checkOut
    ? fmtTime(punchRecord.checkOut)
    : '—';

  const openCameraForPunch = async (type) => {
    if (!permission?.granted) {
      const { status } = await requestPermission();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required for selfie attendance.');
        return;
      }
    }
    setPendingPunchType(type);
    setShowCamera(true);
  };

  const confirmPunch = (type) => {
    const isOut = type === 'out';
    Alert.alert(
      isOut ? 'Confirm Clock Out?' : 'Confirm Clock In?',
      isOut
        ? 'You are about to end your work session. A selfie will be required to complete clock out.'
        : 'You are about to start your work session. A selfie will be required to complete clock in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isOut ? 'Yes, Clock Out' : 'Yes, Clock In',
          style: isOut ? 'destructive' : 'default',
          onPress: () => openCameraForPunch(type),
        },
      ],
    );
  };

  const captureSelfie = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.35,
          base64: false,
          exif: false,
          skipProcessing: true,
          shutterSound: false,
        });
        setShowCamera(false);
        const base64 = await prepareSelfieForUpload(photo.uri);
        setTimeout(() => submitPunch(pendingPunchType, base64), 300);
      } catch {
        setShowCamera(false);
        Alert.alert('Error', 'Failed to capture selfie.');
      }
    }
  };

  const closeCamera = () => {
    setShowCamera(false);
    setPendingPunchType(null);
  };

  const openCorrectionModal = () => {
    setCorrectionForm({ date: todayISO(), checkIn: '09:00', checkOut: '18:00', reason: '' });
    setShowCorrectionModal(true);
  };

  const closeCorrectionModal = () => {
    setShowCorrectionModal(false);
    setSubmittingCorrection(false);
  };

  const handleCorrectionSubmit = async () => {
    if (!correctionForm.date || !correctionForm.reason.trim()) {
      Alert.alert('Missing fields', 'Please select a date and enter a reason.');
      return;
    }
    setSubmittingCorrection(true);
    try {
      await api.post('/api/attendance/correction-requests', {
        requestDate: correctionForm.date,
        requestedCheckIn: correctionForm.checkIn ? `${correctionForm.date}T${correctionForm.checkIn}:00` : null,
        requestedCheckOut: correctionForm.checkOut ? `${correctionForm.date}T${correctionForm.checkOut}:00` : null,
        requestedStatus: 'present',
        reason: correctionForm.reason.trim(),
      });
      Alert.alert('Submitted', 'Your attendance correction request has been submitted for approval.');
      closeCorrectionModal();
      fetchData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to submit correction request.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const submitPunch = async (type, selfieBase64) => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    setChecking(true);
    try {
      const coords = await refreshLocation(true);
      const activeCoords = coords || location;

      if (!activeCoords?.latitude || !activeCoords?.longitude) {
        Alert.alert(
          'Location Required',
          'GPS location is mandatory for clock in/out. Please enable location services and try again.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Retry GPS', onPress: () => refreshLocation(true) },
            { text: 'OK', style: 'cancel' },
          ],
        );
        setChecking(false);
        return;
      }

      const payload = {
        date: todayISO(),
        clientRequestId: newPunchRequestId(),
        latitude: activeCoords.latitude,
        longitude: activeCoords.longitude,
        locationName: 'Mobile GPS',
        ...(gpsAccuracy != null ? { gpsAccuracy } : {}),
        ...(selfieBase64 ? { selfieData: `data:image/jpeg;base64,${selfieBase64}` } : {}) };

      if (type === 'in' && geofenceInfo?.geoFenceEnabled && geofenceInfo?.branch?.latitude && geofenceInfo?.branch?.longitude) {
        const dist = haversineDistance(activeCoords.latitude, activeCoords.longitude, geofenceInfo.branch.latitude, geofenceInfo.branch.longitude);
        const radius = geofenceInfo.branch.geofenceRadius || 100;
        if (dist > radius) {
          Alert.alert(
            'Outside Geofence',
            `You are ${Math.round(dist)}m from your branch (${geofenceInfo.branch.name}). Please move within ${radius}m to clock in.`,
            [
              { text: 'Retry GPS', onPress: () => refreshLocation(true) },
              { text: 'OK', style: 'cancel' },
            ],
          );
          setChecking(false);
          return;
        }
      }
      const res = await api.post(type === 'in' ? '/attendance/checkin' : '/attendance/checkout', payload);
      if (res.data) {
        const normalized = normRecord(res.data);
        if (normalized.checkOut) {
          setOpenSession(null);
        } else {
          setOpenSession(normalized);
          setTodayRecord(normalized);
        }
      }
      await fetchData();
    } catch (e) {
      const detail = e.response?.data?.detail || e.message || '';
      if (type === 'in' && /already checked in/i.test(detail)) {
        await fetchData();
        Alert.alert(
          'Open session found',
          'You have an unfinished check-in. Please check out first, then you can check in again.',
        );
      } else if (/location.*required|location is required|geo-fence|away from your branch/i.test(detail)) {
        Alert.alert(
          'Location issue',
          String(detail),
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Retry GPS', onPress: () => refreshLocation(true) },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } else if (/no active check-in/i.test(detail)) {
        await fetchData();
        Alert.alert('Check-out failed', 'No active check-in found. Pull to refresh and try again.');
      } else {
        Alert.alert(type === 'out' ? 'Check-out failed' : 'Check-in failed', String(detail || 'Failed.'));
      }
    }
    finally { setChecking(false); setPendingPunchType(null); }
  };

  const sortedMonthRecords = [...monthRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
  const rateMonthLabel = isCurrentMonth
    ? 'This month'
    : new Date(`${selectedMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: getTimezone() });

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollViewTopBarProps(scrollTopBar, { paddingBottom: TAB_BAR_CLEARANCE + 16 })}
        refreshControl={<HrmsRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#1C64F2', '#4F46E5', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.headerBg, bannerShellStyle(scrollTopBar)]}>
          <View style={styles.bgOrb1} />
          <View style={styles.bgOrb2} />
          <View style={styles.bgOrb3} />
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.headerTitle}>Attendance</Text>
                <Text style={styles.headerSub}>{user?.fullName || user?.name || 'Time & attendance'}</Text>
              </View>
              <View style={styles.headerBadge}>
                <View style={[styles.headerBadgeDot, { backgroundColor: statusColor }]} />
                <Text style={styles.headerBadgeText}>
                  {isCheckedIn ? 'ON DUTY' : isCompleted ? 'DONE' : isAdmin && todaySessionCount > 0 ? `${todaySessionCount}×` : 'OFF DUTY'}
                </Text>
              </View>
            </View>
            {myEmployeeId ? (
              <View style={styles.headerRateCard}>
                <View style={styles.headerRateTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="trending-up" size={18} color="#A7F3D0" />
                    <View>
                      <Text style={styles.headerRateTitle}>Attendance Rate</Text>
                      <Text style={styles.headerRateSub}>{rateMonthLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.headerRatePct}>{attendanceRate}%</Text>
                </View>
                <View style={styles.headerRateBar}>
                  <LinearGradient
                    colors={['#34D399', '#A7F3D0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.headerRateBarFill, { width: `${attendanceRate}%` }]}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {!myEmployeeId ? (
            <View style={styles.noEmpCard}>
              <View style={styles.noEmpIcon}>
                <Ionicons name="person-outline" size={28} color={colors.primary} />
              </View>
              <Text style={styles.noEmpTitle}>No employee profile linked</Text>
              <Text style={styles.noEmpSub}>Your account is not linked to an employee record. Contact HR to get set up.</Text>
            </View>
          ) : (
            <>
              <View style={styles.punchCardOuter}>
                <View style={styles.punchCardInner}>
                  <View style={styles.timeClockHeader}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={styles.timeClockEyebrow}>TIME CLOCK</Text>
                      <Text style={styles.timeClockTitle}>Mark Attendance</Text>
                      <Text style={styles.timeClockSub}>
                        {isAdmin ? 'Admin mode — multiple sessions allowed' : 'Photo and location verified'}
                      </Text>
                    </View>
                    <View style={[styles.timeClockStatusBadge, { backgroundColor: statusBg, borderColor: statusColor + '35' }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.punchStatusText, { color: statusColor }]}>{statusLabel.toUpperCase()}</Text>
                    </View>
                  </View>

                  <TimeClockDisplay />

                  {openFromPriorDay && (
                    <View style={[styles.openSessionBanner, { marginBottom: 14 }]}>
                      <Ionicons name="alert-circle" size={18} color="#B45309" />
                      <Text style={styles.openSessionText}>
                        Open session from {new Date(openSession.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: getTimezone() })} — clock out to close it.
                      </Text>
                    </View>
                  )}

                  <View style={styles.timeClockVerifyRow}>
                    <View style={[styles.verifyChip, styles.verifyChipReady]}>
                      <Ionicons name="camera-outline" size={14} color={colors.primary} />
                      <Text style={[styles.verifyChipText, { color: colors.primary }]}>Photo</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.verifyChip, location ? styles.verifyChipReady : styles.verifyChipPending]}
                      onPress={() => refreshLocation(true)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="location-outline" size={14} color={location ? '#10B981' : '#D97706'} />
                      <Text style={[styles.verifyChipText, { color: location ? '#10B981' : colors.textSecondary }]}>
                        {location
                          ? (distanceFromBranch != null && geofenceInfo?.geoFenceEnabled
                              ? `${distanceFromBranch}m away`
                              : 'Location ready')
                          : 'Enable location'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {geofenceInfo?.geoFenceEnabled && location && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4, paddingHorizontal: 4 }}>
                      <Ionicons name="shield-checkmark-outline" size={13} color={distanceFromBranch != null && distanceFromBranch <= (geofenceInfo?.branch?.geofenceRadius || 100) ? '#10B981' : '#EF4444'} />
                      <Text style={{ fontSize: 11, color: distanceFromBranch != null && distanceFromBranch <= (geofenceInfo?.branch?.geofenceRadius || 100) ? '#10B981' : '#EF4444', fontWeight: '500' }}>
                        {distanceFromBranch != null
                          ? (distanceFromBranch <= (geofenceInfo?.branch?.geofenceRadius || 100)
                              ? `Within geofence (${distanceFromBranch}m)`
                              : `Outside geofence (${distanceFromBranch}m) — move closer`)
                          : 'Locating...'}
                      </Text>
                      {gpsAccuracy != null && (
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginLeft: 'auto' }}>
                          ±{Math.round(gpsAccuracy)}m
                        </Text>
                      )}
                    </View>
                  )}

                  {!geofenceInfo?.geoFenceEnabled && location && gpsAccuracy != null && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginBottom: 4, paddingHorizontal: 4 }}>
                      <Ionicons name="information-circle-outline" size={12} color="#94A3B8" />
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>GPS accuracy: ±{Math.round(gpsAccuracy)}m</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => confirmPunch(isCheckedIn ? 'out' : 'in')}
                    disabled={!!isCompleted || !!checking || !location}
                    activeOpacity={0.9}
                  >
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                      <LinearGradient
                        colors={actionGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.timeClockActionBtn, (checking || isCompleted || !location) && { opacity: 0.85 }]}
                      >
                        <Ionicons
                          name={isCompleted ? 'checkmark-circle' : isCheckedIn ? 'log-out-outline' : 'log-in-outline'}
                          size={22}
                          color="#FFF"
                        />
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.timeClockActionText}>
                            {checking ? 'Processing…' : isCompleted ? 'Shift Completed' : !location ? 'Enable GPS' : isCheckedIn ? 'Clock Out' : 'Clock In'}
                          </Text>
                          {!checking && !isCompleted && (
                            <Text style={styles.timeClockActionSub}>
                              {isCheckedIn ? 'End your work session' : !location ? 'Location is required to punch' : 'Start your work session'}
                            </Text>
                          )}
                        </View>
                      </LinearGradient>
                    </Animated.View>
                  </TouchableOpacity>

                  <Text style={styles.punchHint}>
                    {isCompleted
                      ? 'You have completed attendance for today.'
                      : isAdmin && todaySessionCount > 0 && !isCheckedIn
                        ? `${todaySessionCount} session${todaySessionCount === 1 ? '' : 's'} recorded today`
                        : 'A selfie and GPS location will be captured when you clock in or out'}
                  </Text>

                  <View style={styles.timeClockSessionRow}>
                    <View style={styles.timeClockSessionBox}>
                      <Text style={styles.timeClockSessionLabel}>Clock In</Text>
                      <Text style={[styles.timeClockSessionValue, !punchRecord?.checkIn && styles.timeClockSessionValueMuted]}>
                        {clockInTime}
                      </Text>
                    </View>
                    <View style={styles.timeClockDivider} />
                    <View style={styles.timeClockSessionBox}>
                      <Text style={styles.timeClockSessionLabel}>Clock Out</Text>
                      <Text style={[styles.timeClockSessionValue, !punchRecord?.checkOut && styles.timeClockSessionValueMuted]}>
                        {clockOutTime}
                      </Text>
                    </View>
                    <View style={styles.timeClockDivider} />
                    <View style={styles.timeClockSessionBox}>
                      <Text style={styles.timeClockSessionLabel}>
                        {isCheckedIn && !punchRecord?.checkOut ? 'Live Duration' : 'Duration'}
                      </Text>
                      <Text style={[
                        styles.timeClockSessionValue,
                        !sessionDuration && styles.timeClockSessionValueMuted,
                        isCheckedIn && !punchRecord?.checkOut && { color: '#10B981' },
                      ]}
                      >
                        {sessionDuration || '—'}
                      </Text>
                    </View>
                  </View>

                  {locationErr && (
                    <View style={[styles.openSessionBanner, { marginTop: 14, marginBottom: 0 }]}>
                      <Ionicons name="location-outline" size={16} color="#B45309" />
                      <Text style={styles.openSessionText}>{locationErr}</Text>
                    </View>
                  )}
                </View>
              </View>

              <AdminMonthRow value={selectedMonth} onChange={setSelectedMonth} />

              <Text style={styles.sectionLabel}>
                {isCurrentMonth ? 'This Month' : 'Selected Month'}
              </Text>
              <View style={styles.statRow}>
                {STAT_CONFIG.map((s) => {
                  const chip = resolveStatChip(s, colors, isDark);
                  return (
                    <View key={s.key} style={styles.statCard}>
                      <View style={styles.statCardTop}>
                        <View style={[styles.statIcon, { backgroundColor: chip.bg }]}>
                          <Ionicons name={s.icon} size={16} color={chip.color} />
                        </View>
                      </View>
                      <Text style={[styles.statVal, { color: chip.color }]}>{statValues[s.key]}</Text>
                      <Text style={[styles.statLabel, { color: chip.labelColor }]}>{s.label}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.recordsHead}>
                <Text style={styles.sectionLabel}>Recent Records</Text>
                {sortedMonthRecords.length > RECENT_RECORDS_LIMIT && (
                  <TouchableOpacity style={styles.seeAllBtn} onPress={() => navigation.navigate('AttendanceHistory')}>
                    <Text style={styles.seeAllText}>See all {sortedMonthRecords.length}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
              {loading ? (
                <View style={styles.recordsGroup}>
                  {[1, 2, 3].map((i) => <View key={i} style={[styles.skeleton, { margin: 8 }]} />)}
                </View>
              ) : sortedMonthRecords.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="calendar-outline" size={22} color={colors.textTertiary} />
                  </View>
                  <Text style={styles.emptyText}>No records this month.</Text>
                </View>
              ) : (
                <View style={styles.recordsGroup}>
                  {sortedMonthRecords.slice(0, RECENT_RECORDS_LIMIT).map((item, idx, arr) => {
                    const st = statusStyle(item.status, colors, isDark);
                    const isLast = idx === arr.length - 1;
                    const inTime = item.checkIn
                      ? new Date(item.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: getTimezone() })
                      : '—';
                    const outTime = item.checkOut
                      ? new Date(item.checkOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: getTimezone() })
                      : '—';
                    return (
                      <View key={item.id || item.date} style={[styles.recordRow, isLast && styles.recordRowLast]}>
                        <View style={styles.recordDateCompact}>
                          <Text style={styles.recordDayNum}>{item.date ? parseInt(String(item.date).slice(8, 10), 10) || '—' : '—'}</Text>
                          <Text style={styles.recordDayLbl}>
                            {item.date ? fmtWeekday(item.date) : ''}
                          </Text>
                        </View>
                        <View style={styles.recordMid}>
                          <Text style={styles.recordTimeLine} numberOfLines={1}>{inTime} → {outTime}</Text>
                          <View style={styles.recordMeta}>
                            <View style={[styles.recordDot, { backgroundColor: item.checkIn && !item.checkOut ? '#DC2626' : st.color }]} />
                            <Text style={[styles.recordStatus, item.checkIn && !item.checkOut && { color: '#DC2626' }]}>{item.checkIn && !item.checkOut ? 'No checkout' : (item.status || 'n/a').replace('_', ' ')}</Text>
                          </View>
                        </View>
                        <Text style={styles.recordHoursCompact}>
                          {item.workHours ? `${Number(item.workHours).toFixed(1)}h` : '—'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity onPress={() => navigation.navigate('AttendanceHistory')} activeOpacity={0.88}>
                <LinearGradient colors={['#1C64F2', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.historyCard}>
                  <View style={styles.historyIcon}>
                    <Ionicons name="calendar" size={24} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>Full History</Text>
                    <Text style={styles.historySub}>Browse all past months & details</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.8)" />
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={openCorrectionModal} activeOpacity={0.88}>
                <LinearGradient colors={['#F59E0B', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.historyCard, { marginTop: 10 }]}>
                  <View style={styles.historyIcon}>
                    <Ionicons name="construct" size={24} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>Request Correction</Text>
                    <Text style={styles.historySub}>Fix attendance for a past date</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.8)" />
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={showCamera} animationType="slide" onRequestClose={closeCamera}>
        <View style={styles.cameraModal}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="front"
            enabled={showCamera}
            animateShutter={false}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'transparent', 'rgba(0,0,0,0.85)']}
            style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
          >
            <View style={styles.cameraTopBar}>
              <View style={styles.cameraTitleWrap}>
                <Text style={styles.cameraTitle}>
                  {pendingPunchType === 'in' ? 'Check In Verification' : 'Check Out Verification'}
                </Text>
                <Text style={styles.cameraSub}>Place your face inside the circle</Text>
              </View>
            </View>
            <View style={styles.cameraFaceGuide}>
              <View style={styles.faceRing}>
                <View style={styles.faceCircle} />
              </View>
              <Text style={styles.faceGuideText}>Center your face in the circle, then tap capture</Text>
            </View>
            <View style={styles.cameraBottomBar}>
              <TouchableOpacity onPress={captureSelfie} style={styles.captureBtn} activeOpacity={0.85}>
                <View style={styles.captureBtnInner} />
              </TouchableOpacity>
              <TouchableOpacity onPress={closeCamera} style={styles.cameraCancelBtn} activeOpacity={0.75}>
                <Text style={styles.cameraCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      <Modal visible={showCorrectionModal} animationType="slide" onRequestClose={closeCorrectionModal}>
        <View style={styles.correctionModal}>
          <View style={styles.correctionHeader}>
            <Text style={styles.correctionTitle}>Request Attendance Correction</Text>
            <TouchableOpacity onPress={closeCorrectionModal} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.correctionBody}>
            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              style={styles.input}
              value={correctionForm.date}
              onChangeText={(text) => setCorrectionForm((f) => ({ ...f, date: text }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.fieldLabel}>Check In</Text>
            <TextInput
              style={styles.input}
              value={correctionForm.checkIn}
              onChangeText={(text) => setCorrectionForm((f) => ({ ...f, checkIn: text }))}
              placeholder="HH:MM"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.fieldLabel}>Check Out</Text>
            <TextInput
              style={styles.input}
              value={correctionForm.checkOut}
              onChangeText={(text) => setCorrectionForm((f) => ({ ...f, checkOut: text }))}
              placeholder="HH:MM"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.fieldLabel}>Reason</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={correctionForm.reason}
              onChangeText={(text) => setCorrectionForm((f) => ({ ...f, reason: text }))}
              placeholder="Why is this correction needed?"
              placeholderTextColor={colors.textTertiary}
              multiline
            />

            <TouchableOpacity
              style={[styles.submitBtn, submittingCorrection && { opacity: 0.7 }]}
              onPress={handleCorrectionSubmit}
              disabled={submittingCorrection}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>{submittingCorrection ? 'Submitting…' : 'Submit Correction'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ position: 'absolute', right: 20, bottom: TAB_BAR_CLEARANCE + 8, alignItems: 'center' }}>
        <TouchableOpacity onPress={() => navigation.navigate('Chat')} activeOpacity={0.85} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#14B8A6', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#14B8A6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 }}>
          <Ionicons name="sparkles" size={26} color="#FFF" />
        </TouchableOpacity>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#14B8A6', marginTop: 4 }}>HR Assistant!</Text>
      </View>
    </View>
  );
};

export default AttendanceScreen;
