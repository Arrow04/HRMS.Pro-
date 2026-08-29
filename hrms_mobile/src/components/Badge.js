import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../theme';

const STATUS_STYLES = {
  active: { bg: colors.successBg, text: colors.success, border: colors.success + '30' },
  inactive: { bg: colors.dangerBg, text: colors.danger, border: colors.danger + '30' },
  pending: { bg: colors.warningBg, text: colors.warning, border: colors.warning + '30' },
  approved: { bg: colors.successBg, text: colors.success, border: colors.success + '30' },
  rejected: { bg: colors.dangerBg, text: colors.danger, border: colors.danger + '30' },
  present: { bg: colors.successBg, text: colors.success, border: colors.success + '30' },
  absent: { bg: colors.dangerBg, text: colors.danger, border: colors.danger + '30' },
  late: { bg: colors.warningBg, text: colors.warning, border: colors.warning + '30' },
  half_day: { bg: colors.infoBg, text: colors.info, border: colors.info + '30' },
  on_leave: { bg: colors.warningBg, text: colors.warning, border: colors.warning + '30' },
  holiday: { bg: colors.infoBg, text: colors.info, border: colors.info + '30' },
  weekend: { bg: colors.surfaceSecondary, text: colors.textSecondary, border: colors.border },
  draft: { bg: colors.surfaceSecondary, text: colors.textSecondary, border: colors.border },
  processed: { bg: colors.infoBg, text: colors.info, border: colors.info + '30' },
  paid: { bg: colors.successBg, text: colors.success, border: colors.success + '30' },
  submitted: { bg: colors.infoBg, text: colors.info, border: colors.info + '30' },
  new: { bg: colors.infoBg, text: colors.info, border: colors.info + '30' },
};

export function Badge({ status, label, size = 'md', style }) {
  const s = STATUS_STYLES[status?.toLowerCase()] || STATUS_STYLES.pending;
  const text = label || (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <View style={[
      styles.badge,
      size === 'sm' && styles.badgeSm,
      size === 'lg' && styles.badgeLg,
      { backgroundColor: s.bg, borderColor: s.border },
      style,
    ]}>
      <Text style={[
        styles.text,
        size === 'sm' && styles.textSm,
        { color: s.text },
      ]}>
        {text}
      </Text>
    </View>
  );
}

export function DotBadge({ color, size = 8 }) {
  return <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color || colors.success }]} />;
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeLg: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  textSm: {
    fontSize: 10,
  },
  dot: {},
});
