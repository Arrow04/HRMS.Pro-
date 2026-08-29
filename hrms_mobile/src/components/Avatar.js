import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, typography } from '../theme';

const AVATAR_COLORS = [
  ['#6366F1', '#818CF8'],
  ['#8B5CF6', '#A78BFA'],
  ['#EC4899', '#F472B6'],
  ['#10B981', '#34D399'],
  ['#F59E0B', '#FBBF24'],
  ['#EF4444', '#F87171'],
  ['#3B82F6', '#60A5FA'],
  ['#14B8A6', '#2DD4BF'],
];

function getInitials(firstName, lastName) {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return f + l || '?';
}

function getColor(name) {
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Avatar({ firstName, lastName, size = 48, imageUrl, style }) {
  const name = `${firstName || ''}${lastName || ''}`;
  const [bg1, bg2] = getColor(name);
  const initials = getInitials(firstName, lastName);
  const fontSize = size * 0.38;

  if (imageUrl) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, style]}>
        <Text style={{ fontSize }}>{initials}</Text>
      </View>
    );
  }

  return (
    <View style={[
      styles.container,
      { width: size, height: size, borderRadius: size / 2 },
      { backgroundColor: bg1 },
      style,
    ]}>
      <Text style={[styles.initials, { fontSize, color: '#FFF' }]}>
        {initials}
      </Text>
    </View>
  );
}

export function AvatarGroup({ employees, max = 3, size = 32 }) {
  const shown = employees.slice(0, max);
  const remaining = employees.length - max;

  return (
    <View style={styles.group}>
      {shown.map((emp, i) => (
        <View key={emp.id || i} style={[styles.groupItem, { marginLeft: i > 0 ? -8 : 0, zIndex: max - i }]}>
          <Avatar firstName={emp.firstName} lastName={emp.lastName} size={size} />
        </View>
      ))}
      {remaining > 0 && (
        <View style={[styles.groupItem, styles.groupMore, { marginLeft: -8, width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.groupMoreText, { fontSize: size * 0.35 }]}>+{remaining}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontWeight: '700',
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupItem: {
    borderWidth: 2,
    borderColor: '#FFF',
  },
  groupMore: {
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupMoreText: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
