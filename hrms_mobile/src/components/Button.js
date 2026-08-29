import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radii, spacing, shadows } from '../theme';

export function GradientButton({ title, onPress, loading, disabled, variant = 'primary', icon, style }) {
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? colors.primary : colors.surfaceSecondary;
  const textColor = isPrimary ? '#FFF' : colors.text;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: bg },
        isPrimary && shadows.colored(colors.primary, 0.3),
        disabled && { opacity: 0.6 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>
          {icon ? `${icon}  ` : ''}{title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function IconButton({ icon, onPress, color, backgroundColor, size = 40, style }) {
  return (
    <TouchableOpacity
      style={[
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: backgroundColor || colors.surfaceSecondary },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={{ fontSize: size * 0.45, color: color || colors.text }}>{icon}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  iconButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
