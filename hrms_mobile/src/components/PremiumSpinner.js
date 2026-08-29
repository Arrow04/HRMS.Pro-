import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const SIZES = {
  sm: { outer: 26, stroke: 2.5 },
  md: { outer: 38, stroke: 3 },
  lg: { outer: 52, stroke: 3.5 },
};

export function PremiumSpinner({ size = 'md', light = false, style }) {
  const { colors } = useTheme();
  const dims = SIZES[size] || SIZES.md;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
      ]),
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const trackColor = light ? 'rgba(255,255,255,0.18)' : colors.borderLight;
  const primary = light ? '#FFFFFF' : colors.primary;
  const accent = light ? '#C7D2FE' : colors.accent;

  return (
    <View style={[styles.wrap, { width: dims.outer, height: dims.outer }, style]}>
      <Animated.View style={[styles.glow, { opacity: pulse, borderRadius: dims.outer / 2 }]}>
        <View
          style={[
            styles.glowInner,
            {
              width: dims.outer,
              height: dims.outer,
              borderRadius: dims.outer / 2,
              backgroundColor: light ? 'rgba(255,255,255,0.08)' : colors.primarySurface,
            },
          ]}
        />
      </Animated.View>
      <View
        style={[
          styles.track,
          {
            width: dims.outer,
            height: dims.outer,
            borderRadius: dims.outer / 2,
            borderWidth: dims.stroke,
            borderColor: trackColor,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.arcHost,
          {
            width: dims.outer,
            height: dims.outer,
            transform: [{ rotate }],
          },
        ]}
      >
        <View
          style={[
            styles.arc,
            {
              width: dims.outer,
              height: dims.outer,
              borderRadius: dims.outer / 2,
              borderWidth: dims.stroke,
              borderColor: 'transparent',
              borderTopColor: primary,
              borderRightColor: accent,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowInner: {
    ...Platform.select({
      ios: {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  track: {
    position: 'absolute',
  },
  arcHost: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arc: {},
});
