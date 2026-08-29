import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getThemeColors } from '../theme';

const THEME_KEY = 'app_theme';

const ThemeContext = createContext(null);

export function buildNavigationTheme(isDark, colors) {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') setModeState(stored);
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = async (next) => {
    setModeState(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  };

  const isDark = mode === 'dark';
  const colors = useMemo(() => getThemeColors(isDark), [isDark]);
  const navigationTheme = useMemo(() => buildNavigationTheme(isDark, colors), [isDark, colors]);

  const value = useMemo(() => ({
    mode,
    isDark,
    colors,
    navigationTheme,
    ready,
    setMode,
    toggleTheme: () => setMode(isDark ? 'light' : 'dark'),
  }), [mode, isDark, colors, navigationTheme, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    const { lightColors } = require('../theme');
    return {
      mode: 'light',
      isDark: false,
      colors: lightColors,
      navigationTheme: buildNavigationTheme(false, lightColors),
      ready: true,
      setMode: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
