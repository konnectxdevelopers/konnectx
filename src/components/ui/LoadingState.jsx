import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AppText from './AppText';
import { SkeletonCard } from './Skeleton';
import { colors, spacing } from '../../theme/tokens';

export default function LoadingState({ message = 'Loading...', skeleton = false, style }) {
  if (skeleton) {
    return (
      <View style={[styles.skeleton, style]}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <View accessibilityRole="progressbar" style={[styles.container, style]}>
      <View style={styles.mark}>
        <ActivityIndicator color={colors.primary} size="small" />
      </View>
      <AppText variant="footnote" color={colors.muted}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  mark: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
  },
  skeleton: {
    gap: spacing.md,
    padding: spacing.lg,
  },
});
