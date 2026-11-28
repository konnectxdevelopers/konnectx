import { StyleSheet, View } from 'react-native';
import AppButton from './AppButton';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { colors, radii, spacing } from '../../theme/tokens';

/**
 * Consistent empty state for lists, dashboards and detail screens.
 *
 * Supports both the canonical props (`title`, `description`, `action`) and the
 * legacy props (`message`, `actionLabel`, `onAction`) that older dashboard
 * screens pass in.
 */
export default function EmptyState({
  icon = 'compass-outline',
  title,
  description,
  message,
  action,
  actionLabel,
  onAction,
  actionIcon,
  compact = false,
  style,
}) {
  const body = description || message;
  const renderedAction =
    action ||
    (actionLabel ? (
      <AppButton
        fullWidth
        icon={actionIcon}
        onPress={onAction}
        size="sm"
        title={actionLabel}
        variant="secondary"
      />
    ) : null);

  return (
    <View style={[styles.container, compact && styles.compact, style]}>
      <View style={styles.iconHalo}>
        <View style={styles.iconWrap}>
          <AppIcon name={icon} size={compact ? 24 : 28} color={colors.primary} />
        </View>
      </View>
      <AppText variant={compact ? 'bodyStrong' : 'subtitle'} align="center">
        {title || 'Nothing here yet'}
      </AppText>
      {body ? (
        <AppText
          variant="footnote"
          color={colors.muted}
          align="center"
          style={styles.description}
        >
          {body}
        </AppText>
      ) : null}
      {renderedAction ? <View style={styles.action}>{renderedAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  compact: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconHalo: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 84,
    height: 84,
    marginBottom: spacing.md,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
  },
  iconWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    backgroundColor: colors.surface,
  },
  description: {
    maxWidth: 290,
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    maxWidth: 320,
    width: '100%',
  },
});
