import React from 'react';
import {
  View, Text, StyleSheet, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

export const STICKY_BAR_TITLE = 'HRMS.Pro!';
export const STICKY_BAR_BODY_HEIGHT = 34;
export const BANNER_HORIZONTAL_INSET = 12;
export const BANNER_TOP_INSET = 12;

export function bannerShellStyle(scrollTopBar) {
  const barClearance = scrollTopBar?.contentOffset ?? 0;
  return {
    marginHorizontal: BANNER_HORIZONTAL_INSET,
    marginTop: barClearance + BANNER_TOP_INSET,
  };
}

export function getStickyBarContentOffset(insets) {
  return insets.top + STICKY_BAR_BODY_HEIGHT;
}

/** Inner spacing for banner content below the in-flow sticky bar. */
export function bannerUnderBarStyle(_scrollTopBar, extra = 16) {
  return { paddingTop: extra };
}

export function ScrollTopBar({
  rightAction,
  barStyle,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      pointerEvents="auto"
      collapsable={false}
      style={[
        styles.wrap,
        {
          paddingTop: insets.top,
          backgroundColor: colors.surface,
          borderBottomColor: colors.borderLight,
        },
        barStyle,
      ]}
    >
      <View style={styles.bar}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {STICKY_BAR_TITLE}
          </Text>
          {rightAction ? <View style={styles.rightSlot}>{rightAction}</View> : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {
        boxShadow: '0px 2px 8px rgba(15, 23, 42, 0.08)',
      },
    }),
  },
  bar: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    paddingTop: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rightSlot: { position: 'absolute', right: 0 },
  title: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
});
