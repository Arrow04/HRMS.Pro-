import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../theme';

function ShimmerBlock({ width, height, borderRadius }) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const opacity = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View style={{
      width, height, borderRadius: borderRadius || radii.sm,
      backgroundColor: colors.shimmer,
      opacity,
    }} />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ShimmerBlock width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <ShimmerBlock width="60%" height={14} borderRadius={4} />
          <ShimmerBlock width="40%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      </View>
      <ShimmerBlock width="100%" height={12} borderRadius={4} />
      <ShimmerBlock width="80%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
    </View>
  );
}

export function SkeletonList({ count = 5, style }) {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.listItem}>
          <ShimmerBlock width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <ShimmerBlock width="70%" height={14} borderRadius={4} />
            <ShimmerBlock width="50%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
          <ShimmerBlock width={60} height={24} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonStats() {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statItem}>
        <ShimmerBlock width={44} height={44} borderRadius={12} />
        <ShimmerBlock width="60%" height={20} borderRadius={4} style={{ marginTop: 8 }} />
        <ShimmerBlock width="80%" height={10} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
      <View style={styles.statItem}>
        <ShimmerBlock width={44} height={44} borderRadius={12} />
        <ShimmerBlock width="60%" height={20} borderRadius={4} style={{ marginTop: 8 }} />
        <ShimmerBlock width="80%" height={10} borderRadius={4} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xs,
  },
});
