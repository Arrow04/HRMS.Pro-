import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { radii, shadows } from '../theme';

const SIZES = {
  sm: { outer: 44, inner: 34, icon: 18, label: 10, ring: 3 },
  md: { outer: 64, inner: 50, icon: 26, label: 11, ring: 3.5 },
  lg: { outer: 88, inner: 68, icon: 34, label: 13, ring: 4 },
};

export function HrmsLogoLoader({ size = 'md', showLabel = false, light = false, style }) {
  const { colors, isDark } = useTheme();
  const dims = SIZES[size] || SIZES.md;

  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.85, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    spinLoop.start();
    pulseLoop.start();
    glowLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
      glowLoop.stop();
    };
  }, [spin, pulse, glow]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Animated.View
          style={[
            styles.ringHost,
            {
              width: dims.outer,
              height: dims.outer,
              borderRadius: dims.outer / 2.8,
              opacity: glow,
            },
          ]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
            <LinearGradient
              colors={['#1C64F2', '#6366F1', '#A78BFA', '#1C64F2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.ring,
                {
                  width: dims.outer,
                  height: dims.outer,
                  borderRadius: dims.outer / 2.8,
                  padding: dims.ring,
                },
              ]}
            >
              <View
                style={[
                  styles.inner,
                  {
                    width: dims.inner,
                    height: dims.inner,
                    borderRadius: dims.inner / 2.8,
                    backgroundColor: isDark ? colors.surface : '#FFFFFF',
                  },
                ]}
              >
                <LinearGradient
                  colors={isDark ? ['#1E3A8A', '#4F46E5'] : ['#EFF6FF', '#EEF2FF']}
                  style={[styles.iconBadge, { width: dims.inner - 10, height: dims.inner - 10, borderRadius: (dims.inner - 10) / 3 }]}
                >
                  <Ionicons name="business" size={dims.icon} color={colors.primary} />
                </LinearGradient>
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {showLabel && (
        <Text style={[styles.label, { fontSize: dims.label, color: light ? 'rgba(255,255,255,0.82)' : colors.textSecondary }]}>
          HRMS<Text style={{ color: light ? '#C7D2FE' : colors.primary, fontWeight: '800' }}>.Pro</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ringHost: {
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  ring: { alignItems: 'center', justifyContent: 'center' },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
  },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 10, fontWeight: '700', letterSpacing: 0.3 },
});
