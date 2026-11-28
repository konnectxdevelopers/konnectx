import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export function Skeleton({ width = '100%', height = 16, radius = radii.sm, style }) {
  const [pulse] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 720,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 720,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: radius,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

export function SkeletonText({ lines = 2, width = '100%', gap = spacing.sm }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={index === 0 ? 14 : 12}
          width={index === lines - 1 ? '68%' : width}
        />
      ))}
    </View>
  );
}

export function SkeletonCard({ style }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <Skeleton width={46} height={46} radius={radii.md} />
        <View style={styles.grow}>
          <Skeleton height={14} width="62%" />
          <Skeleton height={11} width="86%" style={{ marginTop: spacing.sm }} />
        </View>
      </View>
      <Skeleton height={12} width="94%" style={{ marginTop: spacing.lg }} />
      <Skeleton height={12} width="72%" style={{ marginTop: spacing.sm }} />
    </View>
  );
}

export default Skeleton;

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceMuted,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  grow: {
    flex: 1,
  },
});
