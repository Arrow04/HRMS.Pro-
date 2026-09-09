import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function useThemedStyles(styleFactory) {
  const { colors, isDark } = useTheme();
  return useMemo(() => StyleSheet.create(styleFactory(colors, isDark)), [colors, isDark, styleFactory]);
}