import React, { createContext, useState, useContext, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { colors } from '../theme';

export const ThemeContext = createContext({
  colors,
  isDark: false,
  toggleTheme: () => {},
  theme: 'light',
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [theme, setTheme] = useState(systemScheme === 'dark' ? 'dark' : 'light');
  const [isDark, setIsDark] = useState(systemScheme === 'dark');

  useEffect(() => {
    setTheme(systemScheme === 'dark' ? 'dark' : 'light');
    setIsDark(systemScheme === 'dark');
  }, [systemScheme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    setIsDark((prev) => !prev);
  };

  const contextValue = {
    colors: theme === 'dark'
      ? {
          ...colors,
          bg: '#0F172A',
          surface: '#1E293B',
          text: '#F8FAFC',
          textSecondary: '#CBD5E1',
          textTertiary: '#64748B',
          border: '#334155',
          tabBar: '#1E293B',
          tabBarBorder: '#334155',
        }
      : colors,
    isDark,
    toggleTheme,
    theme,
  };

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}