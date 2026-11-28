import { StyleSheet, View } from 'react-native';
import AppButton from './AppButton';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { colors, radii, spacing } from '../../theme/tokens';

export default function ErrorState({
  icon = 'cloud-alert-outline',
  title = 'Something went wrong',
  description,
  message,
  actionLabel,
  retryLabel,
  onRetry,
  style,
}) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <AppIcon name={icon} size={28} color={colors.danger} />
      </View>
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      <AppText
        variant="footnote"
        color={colors.muted}
        align="center"
        style={styles.description}
      >
        {description || message || 'We could not load this content. Please try again.'}
      </AppText>
      {onRetry ? (
        <AppButton
          icon="refresh"
          onPress={onRetry}
          size="sm"
          style={styles.action}
          title={actionLabel || retryLabel || 'Try again'}
          variant="outline"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderRadius: radii.round,
    backgroundColor: colors.dangerSoft,
  },
  description: {
    maxWidth: 300,
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.lg,
  },
});
