import { StyleSheet } from 'react-native';
import { spacing, radii, shadows } from '../theme';

export const layout = {
  tabBarClearance: 80,
};

export const bannerShellStyle = (scrollTopBar) => ({
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  borderBottomLeftRadius: 32,
  borderBottomRightRadius: 32,
  overflow: 'hidden',
  marginTop: scrollTopBar?.topBarHeight ? -(scrollTopBar.topBarHeight + 20) : -20,
  paddingTop: scrollTopBar?.topBarHeight ? scrollTopBar.topBarHeight + 20 : 20,
});

export const scrollViewTopBarProps = (scrollTopBar, contentContainerStyle = {}) => ({
  contentContainerStyle: [
    { paddingBottom: layout.tabBarClearance + 72, paddingHorizontal: spacing.lg },
    contentContainerStyle,
  ],
  scrollIndicatorInsets: { top: 0, bottom: layout.tabBarClearance + 20 },
  onScroll: (e) => {
    scrollTopBar?.onScroll?.(e);
  },
  scrollEventThrottle: 16,
});

export const commonStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  errorText: { fontSize: 16, color: '#EF4444', textAlign: 'center', marginBottom: spacing.md },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#1C64F2',
  },
  retryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});