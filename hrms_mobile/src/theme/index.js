import { Dimensions, Platform } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

export const typography = {
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 20, fontWeight: '700' },
  h4: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  bodySmall: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 11, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  button: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
};

const shared = {
  primary: '#1C64F2',
  primaryLight: '#3B82F6',
  primaryDark: '#1D4ED8',
  accent: '#4F46E5',
  accentLight: '#818CF8',
  success: '#10B981',
  successLight: '#34D399',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  danger: '#DC2626',
  dangerLight: '#F87171',
  info: '#3B82F6',
  infoLight: '#60A5FA',
  teal: '#0D9488',
  purple: '#7C3AED',
  chart: ['#1C64F2', '#4F46E5', '#7C3AED', '#EC4899', '#10B981', '#F59E0B', '#DC2626', '#0D9488', '#3B82F6', '#8B5CF6'],
  gradient: {
    primary: ['#1C64F2', '#4F46E5'],
    hero: ['#1E3A8A', '#4F46E5', '#7C3AED'],
    success: ['#059669', '#10B981'],
    warning: ['#D97706', '#F59E0B'],
    danger: ['#DC2626', '#EF4444'],
    dark: ['#1E293B', '#334155'],
  },
};

export const lightColors = {
  ...shared,
  primarySurface: '#EFF6FF',
  accentSurface: '#EEF2FF',
  successSurface: '#ECFDF5',
  successText: '#047857',
  successBorder: '#A7F3D0',
  warningSurface: '#FFFBEB',
  warningText: '#B45309',
  warningBorder: '#FDE68A',
  dangerSurface: '#FEF2F2',
  dangerText: '#B91C1C',
  dangerBorder: '#FECACA',
  infoSurface: '#EFF6FF',
  infoText: '#1D4ED8',
  infoBorder: '#BFDBFE',
  tealSurface: '#F0FDFA',
  purpleSurface: '#F5F3FF',
  bg: '#F1F5F9',
  bgGradient: 'linear-gradient(180deg, #EEF2F7 0%, #F6F8FB 30%, #F1F5F9 100%)',
  surface: '#FFFFFF',
  surfaceSecondary: '#F8FAFC',
  surfaceHover: '#F1F5F9',
  surfaceZebra: '#FAFBFD',
  text: '#0F172A',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',
  textLink: '#1C64F2',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  divider: '#F1F5F9',
  hoverBg: '#EFF6FF',
  overlay: 'rgba(15, 23, 42, 0.5)',
  shimmer: '#E2E8F0',
  dark: '#1E293B',
  background: '#F1F5F9',
  successBg: '#ECFDF5',
  dangerBg: '#FEF2F2',
  warningBg: '#FFFBEB',
  infoBg: '#EFF6FF',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  cardShadow: '#0F172A',
  heroText: '#FFFFFF',
  heroTextMuted: 'rgba(255,255,255,0.75)',
};

export const darkColors = {
  ...shared,
  primarySurface: '#1E3A5F',
  accentSurface: '#312E81',
  successSurface: '#064E3B',
  successText: '#6EE7B7',
  successBorder: '#065F46',
  warningSurface: '#78350F',
  warningText: '#FCD34D',
  warningBorder: '#92400E',
  dangerSurface: '#7F1D1D',
  dangerText: '#FCA5A5',
  dangerBorder: '#991B1B',
  infoSurface: '#1E3A5F',
  infoText: '#93C5FD',
  infoBorder: '#1D4ED8',
  tealSurface: '#134E4A',
  purpleSurface: '#4C1D95',
  bg: '#0B1220',
  bgGradient: 'linear-gradient(180deg, #0B1220 0%, #0F172A 100%)',
  surface: '#1E293B',
  surfaceSecondary: '#334155',
  surfaceHover: '#475569',
  surfaceZebra: '#1A2332',
  text: '#F8FAFC',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textTertiary: '#B0BEC9',
  textInverse: '#0F172A',
  textLink: '#60A5FA',
  border: '#334155',
  borderLight: '#293548',
  divider: '#334155',
  hoverBg: '#1E3A5F',
  overlay: 'rgba(0, 0, 0, 0.65)',
  shimmer: '#334155',
  dark: '#0F172A',
  background: '#0B1220',
  successBg: '#064E3B',
  dangerBg: '#7F1D1D',
  warningBg: '#78350F',
  infoBg: '#1E3A5F',
  tabBar: '#1E293B',
  tabBarBorder: '#334155',
  cardShadow: '#000000',
  heroText: '#FFFFFF',
  heroTextMuted: 'rgba(255,255,255,0.7)',
};

export const getThemeColors = (isDark) => (isDark ? darkColors : lightColors);

const STAT_CHIP_LIGHT_BG = {
  '#DBEAFE': 'info',
  '#DCFCE7': 'success',
  '#FEF3C7': 'warning',
  '#FEE2E2': 'danger',
  '#EEF2FF': 'accent',
  '#F1F5F9': 'muted',
  '#ECFDF5': 'success',
};

const STAT_CHIP_LIGHT_FG = {
  '#2563EB': 'info',
  '#10B981': 'success',
  '#059669': 'success',
  '#16A34A': 'success',
  '#D97706': 'warning',
  '#DC2626': 'danger',
  '#4F46E5': 'accent',
  '#6366F1': 'accent',
  '#64748B': 'muted',
  '#94A3B8': 'muted',
};

const statChipTokens = (colors, kind) => {
  switch (kind) {
    case 'info':
      return { bg: colors.infoSurface, color: colors.infoText, labelColor: colors.infoText };
    case 'success':
      return { bg: colors.successSurface, color: colors.successText, labelColor: colors.successText };
    case 'warning':
      return { bg: colors.warningSurface, color: colors.warningText, labelColor: colors.warningText };
    case 'danger':
      return { bg: colors.dangerSurface, color: colors.dangerText, labelColor: colors.dangerText };
    case 'accent':
      return { bg: colors.accentSurface, color: colors.accentLight, labelColor: colors.accentLight };
    default:
      return {
        bg: colors.surfaceSecondary,
        color: colors.text,
        labelColor: colors.textSecondary,
      };
  }
};

/** Map light-mode stat chip colors to readable dark-mode surfaces. */
export function resolveStatChip(stat, colors, isDark) {
  if (!isDark) {
    return {
      bg: stat.bg || colors.surfaceSecondary,
      color: stat.color || colors.primary,
      labelColor: colors.textSecondary,
    };
  }

  const byBg = STAT_CHIP_LIGHT_BG[(stat.bg || '').toUpperCase()];
  if (byBg) return statChipTokens(colors, byBg);

  const byColor = STAT_CHIP_LIGHT_FG[(stat.color || '').toUpperCase()];
  if (byColor) return statChipTokens(colors, byColor);

  return {
    bg: colors.surfaceSecondary,
    color: stat.color || colors.primary,
    labelColor: colors.textSecondary,
  };
}

/** @deprecated Prefer useTheme().colors — kept for gradual migration */
export const colors = lightColors;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
  card: 16,
  button: 12,
  input: 8,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 48,
};

export const shadows = {
  card: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    android: { elevation: 2 },
  }),
  cardHover: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
    android: { elevation: 4 },
  }),
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
    android: { elevation: 2 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
    android: { elevation: 4 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16 },
    android: { elevation: 8 },
  }),
  colored: (c, o = 0.25) => Platform.select({
    ios: { shadowColor: c, shadowOffset: { width: 0, height: 4 }, shadowOpacity: o, shadowRadius: 12 },
    android: { elevation: 6 },
  }),
  xl: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24 },
    android: { elevation: 12 },
  }),
};

export const gradients = {
  primary: colors.gradient.primary,
  hero: colors.gradient.hero,
  success: colors.gradient.success,
  warning: colors.gradient.warning,
  danger: colors.gradient.danger,
  dark: colors.gradient.dark,
};

export const layout = {
  padding: spacing.xl,
  screenW: W,
  screenH: H,
  isSmall: W < 375,
  tabBarClearance: 88,
};
