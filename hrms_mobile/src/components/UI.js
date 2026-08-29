/**
 * Themed UI primitives — all read colors from ThemeContext.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { radii, spacing, shadows } from '../theme';

function useUIStyles() {
  const { colors } = useTheme();
  return useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: radii.full,
      borderWidth: 1,
      alignSelf: 'center',
    },
    badgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxxl },
    emptyIcon: {
      width: 64, height: 64, borderRadius: 16,
      backgroundColor: colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
    },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
    emptyMsg: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
    btn: {
      paddingVertical: 12,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.button,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 4,
    },
    btnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
    sectionHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: spacing.md, paddingHorizontal: spacing.xl,
    },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    sectionAction: { fontSize: 13, fontWeight: '600', color: colors.primary },
    avatarOuter: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
    avatarOuterPremium: {
      backgroundColor: colors.surface,
      ...Platform.select({
        ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12 },
        android: { elevation: 8 },
      }),
    },
    avatarPremiumRing: {
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    avatarPremiumInner: { overflow: 'hidden' },
    avatarGradient: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    avatarInnerRing: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
    },
    avatarInitials: {
      color: '#FFF',
      fontWeight: '800',
      letterSpacing: 0.8,
      textShadowColor: 'rgba(15, 23, 42, 0.25)',
      textShadowOffset: { width: 0, height: 1 },
      zIndex: 2,
    },
    avatarShine: {
      position: 'absolute',
      top: -8,
      right: -8,
      backgroundColor: 'rgba(255,255,255,0.22)',
      zIndex: 1,
    },
    avatarShineSoft: {
      position: 'absolute',
      backgroundColor: 'rgba(255,255,255,0.1)',
      zIndex: 1,
    },
    avatarStatusWrap: { position: 'absolute', zIndex: 20, alignItems: 'center', justifyContent: 'center' },
    avatarStatusPulse: {
      position: 'absolute',
      backgroundColor: 'rgba(16, 185, 129, 0.25)',
    },
    avatarStatus: { zIndex: 21 },
  }), [colors]);
}

function badgeMap(colors, isDark) {
  return {
    active: { bg: colors.successSurface, fg: colors.successText, border: colors.successBorder },
    approved: { bg: colors.successSurface, fg: colors.successText, border: colors.successBorder },
    completed: { bg: colors.successSurface, fg: colors.successText, border: colors.successBorder },
    paid: { bg: colors.successSurface, fg: colors.successText, border: colors.successBorder },
    synced: { bg: colors.successSurface, fg: colors.successText, border: colors.successBorder },
    present: { bg: colors.successSurface, fg: colors.successText, border: colors.successBorder },
    open: { bg: colors.successSurface, fg: colors.successText, border: colors.successBorder },
    pending: { bg: colors.warningSurface, fg: colors.warningText, border: colors.warningBorder },
    pending_approval: { bg: colors.warningSurface, fg: colors.warningText, border: colors.warningBorder },
    in_progress: { bg: colors.warningSurface, fg: colors.warningText, border: colors.warningBorder },
    no_show: { bg: colors.warningSurface, fg: colors.warningText, border: colors.warningBorder },
    processed: { bg: colors.infoSurface, fg: colors.infoText, border: colors.infoBorder },
    submitted: { bg: colors.purpleSurface, fg: isDark ? colors.accentLight : colors.purple, border: colors.border },
    inactive: { bg: colors.dangerSurface, fg: colors.dangerText, border: colors.dangerBorder },
    rejected: { bg: colors.dangerSurface, fg: colors.dangerText, border: colors.dangerBorder },
    absent: { bg: colors.dangerSurface, fg: colors.dangerText, border: colors.dangerBorder },
    draft: { bg: colors.surfaceSecondary, fg: colors.textSecondary, border: colors.border },
    scheduled: { bg: colors.surfaceSecondary, fg: colors.textSecondary, border: colors.border },
    on_leave: { bg: colors.infoSurface, fg: colors.infoText, border: colors.infoBorder },
    late: { bg: colors.warningSurface, fg: colors.warningText, border: colors.warningBorder },
    half_day: { bg: colors.warningSurface, fg: colors.warningText, border: colors.warningBorder },
    new: { bg: colors.tealSurface, fg: isDark ? colors.successLight : colors.teal, border: colors.border },
    onboarding: { bg: colors.purpleSurface, fg: isDark ? colors.accentLight : colors.purple, border: colors.border },
  };
}

export function Card({ children, style, onPress, padding }) {
  const styles = useUIStyles();
  const content = <View style={[styles.card, padding !== undefined && { padding }, style]}>{children}</View>;
  if (onPress) return <TouchableOpacity activeOpacity={0.85} onPress={onPress}>{content}</TouchableOpacity>;
  return content;
}

export function Badge({ status, label, size = 'md', style }) {
  const { colors, isDark } = useTheme();
  const styles = useUIStyles();
  const s = (status || '').toLowerCase();
  const map = badgeMap(colors, isDark);
  const { bg, fg, border } = map[s] || map.pending;
  const text = label || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <View style={[styles.badge, size === 'sm' && { paddingHorizontal: 8, paddingVertical: 2 }, { backgroundColor: bg, borderColor: border }, style]}>
      <Text style={[styles.badgeText, size === 'sm' && { fontSize: 10 }, { color: fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const AVATAR_GRADIENTS = [
  ['#1C64F2', '#3B82F6'],
  ['#4F46E5', '#818CF8'],
  ['#7C3AED', '#A78BFA'],
  ['#EC4899', '#F472B6'],
  ['#10B981', '#34D399'],
  ['#F59E0B', '#FBBF24'],
  ['#DC2626', '#F87171'],
  ['#0D9488', '#2DD4BF'],
  ['#0EA5E9', '#38BDF8'],
  ['#8B5CF6', '#C4B5FD'],
];

function getAvatarGradient(name) {
  const h = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function Avatar({ firstName, lastName, size = 44, uri, status, style, onPress, premium = false }) {
  const styles = useUIStyles();
  const fullName = `${firstName || ''} ${lastName || ''}`.trim();
  const initials = ((firstName || '').charAt(0) + (lastName || '').charAt(0)).toUpperCase().slice(0, 2) || '?';
  const gradient = getAvatarGradient(fullName);
  const fontSize = size * (premium ? 0.34 : 0.36);
  const ringPad = premium ? Math.max(4, Math.round(size * 0.07)) : 0;
  const outerSize = size + ringPad * 2;
  const statusSize = premium ? Math.max(12, size * 0.22) : size >= 60 ? 14 : size >= 40 ? 12 : 10;
  const statusBorder = premium ? 3 : size >= 60 ? 3 : 2;
  const statusColor = status === 'online' ? '#10B981' : status === 'away' ? '#F59E0B' : '#94A3B8';

  const avatarFace = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
  ) : (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatarGradient, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View style={[styles.avatarInnerRing, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }]} />
      <Text style={[styles.avatarInitials, { fontSize, textShadowRadius: premium ? 6 : 2 }]}>
        {initials}
      </Text>
      <View style={[styles.avatarShine, { width: size * 0.55, height: size * 0.55, borderRadius: size * 0.28 }]} />
      <View style={[styles.avatarShineSoft, {
        width: size * 0.42,
        height: size * 0.16,
        borderRadius: size * 0.08,
        bottom: size * 0.14,
        left: size * 0.12,
      }]} />
    </LinearGradient>
  );

  const statusDot = status ? (
    <View style={[styles.avatarStatusWrap, { bottom: ringPad - 1, right: ringPad - 1 }]}>
      {status === 'online' && <View style={[styles.avatarStatusPulse, { width: statusSize + 8, height: statusSize + 8, borderRadius: (statusSize + 8) / 2 }]} />}
      <View style={[styles.avatarStatus, {
        width: statusSize,
        height: statusSize,
        borderRadius: statusSize / 2,
        borderWidth: statusBorder,
        backgroundColor: statusColor,
        borderColor: '#FFF',
      }]} />
    </View>
  ) : null;

  const content = (
    <View style={[
      styles.avatarOuter,
      premium && styles.avatarOuterPremium,
      premium && shadows.colored(gradient[0], 0.35),
      { width: outerSize, height: outerSize, borderRadius: outerSize / 2 },
      style,
    ]}>
      {premium ? (
        <View style={[styles.avatarPremiumRing, { width: outerSize, height: outerSize, borderRadius: outerSize / 2, padding: ringPad }]}>
          <View style={[styles.avatarPremiumInner, { width: size, height: size, borderRadius: size / 2 }]}>
            {avatarFace}
          </View>
        </View>
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
          {avatarFace}
        </View>
      )}
      {statusDot}
    </View>
  );

  if (onPress) return <TouchableOpacity activeOpacity={0.88} onPress={onPress}>{content}</TouchableOpacity>;
  return content;
}

export function EmptyState({ icon, title, message, action }) {
  const styles = useUIStyles();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Text style={{ fontSize: 28 }}>{icon || '📭'}</Text></View>
      <Text style={styles.emptyTitle}>{title || 'Nothing here yet'}</Text>
      {message && <Text style={styles.emptyMsg}>{message}</Text>}
      {action && <View style={{ marginTop: spacing.lg }}>{action}</View>}
    </View>
  );
}

export function SkeletonBlock({ w, h, r }) {
  const { colors } = useTheme();
  return <View style={{ width: w, height: h || 14, borderRadius: r || radii.sm, backgroundColor: colors.shimmer, opacity: 0.6 }} />;
}

export function SkeletonCard() {
  const styles = useUIStyles();
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <SkeletonBlock w={44} h={44} r={12} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <SkeletonBlock w="60%" />
          <SkeletonBlock w="40%" h={10} r={3} style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonBlock w="100%" />
      <SkeletonBlock w="80%" h={10} r={3} style={{ marginTop: 8 }} />
    </View>
  );
}

export function SkeletonList({ count = 4 }) {
  return <>{Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}</>;
}

export function GradientButton({ title, onPress, loading, disabled, variant = 'primary', icon, style }) {
  const { colors } = useTheme();
  const styles = useUIStyles();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isSecondary = variant === 'secondary';

  let gradient;
  let textColor;
  if (isPrimary) { gradient = colors.gradient.primary; textColor = '#FFF'; }
  else if (isDanger) { gradient = colors.gradient.danger; textColor = '#FFF'; }
  else if (isSecondary) { gradient = [colors.surfaceSecondary, colors.border]; textColor = colors.text; }
  else { gradient = colors.gradient.success; textColor = '#FFF'; }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[disabled && { opacity: 0.6 }, style]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.btn, isDanger && { borderWidth: 0 }, isSecondary && { borderWidth: 1, borderColor: colors.border }]}
      >
        {loading ? <ActivityIndicator color={textColor} size="small" /> : (
          <Text style={[styles.btnText, { color: textColor }]}>{icon ? `${icon}  ` : ''}{title}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function Divider({ style }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.md }, style]} />;
}

export function SectionHeader({ title, action, onAction }) {
  const styles = useUIStyles();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity>}
    </View>
  );
}
