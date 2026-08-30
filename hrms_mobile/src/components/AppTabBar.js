import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { layout } from '../theme';

const TABS = [
  { name: 'Dashboard', label: 'Dashboard', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'Attendance', label: 'Attendance', icon: 'finger-print-outline', iconActive: 'finger-print' },
  { name: 'Menu', label: 'Menu', icon: 'grid-outline', iconActive: 'grid' },
];

export const TAB_BAR_CLEARANCE = layout.tabBarClearance;

export default function AppTabBar({ state, navigation, position }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 4);
  const fallbackIndex = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    if (!position) {
      Animated.spring(fallbackIndex, {
        toValue: state.index,
        useNativeDriver: true,
        speed: 22,
        bounciness: 0,
      }).start();
    }
  }, [state.index, position, fallbackIndex]);

  const slideIndex = position || fallbackIndex;

  const onPress = (route, isFocused) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      navigation.navigate(route.name);
    }
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPad }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder }]}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name) || TABS[index];
          const isFocused = state.index === index;

          const focusAmount = slideIndex.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });

          const iconScale = slideIndex.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [0.94, 1.06, 0.94],
            extrapolate: 'clamp',
          });

          const labelOpacity = slideIndex.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [0.55, 1, 0.55],
            extrapolate: 'clamp',
          });

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabSlot}
              onPress={() => onPress(route, isFocused)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={isFocused ? { selected: true } : {}}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tabIndicator,
                  {
                    backgroundColor: colors.primarySurface,
                    opacity: focusAmount,
                  },
                ]}
              />
              <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
                <Ionicons
                  name={isFocused ? tab.iconActive : tab.icon}
                  size={24}
                  color={isFocused ? colors.primary : colors.textSecondary}
                />
              </Animated.View>
              <Animated.Text
                style={[
                  styles.label,
                  { color: isFocused ? colors.primary : colors.textSecondary, opacity: labelOpacity },
                  isFocused && styles.labelActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {tab.label}
              </Animated.Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    elevation: 24,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
      default: {
        boxShadow: '0 -2px 16px rgba(15, 23, 42, 0.08)',
      },
    }),
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    position: 'relative',
    minHeight: 48,
  },
  tabIndicator: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 4,
    bottom: 4,
    borderRadius: 14,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 14,
    zIndex: 1,
  },
  labelActive: {
    fontWeight: '700',
  },
});
