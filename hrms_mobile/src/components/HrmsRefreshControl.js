import React from 'react';
import { RefreshControl, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function HrmsRefreshControl({ refreshing, onRefresh, ...props }) {
  const { colors } = useTheme();

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={Platform.OS === 'android' ? [colors.primary, colors.accent] : undefined}
      progressBackgroundColor={colors.surface}
      {...props}
    />
  );
}
