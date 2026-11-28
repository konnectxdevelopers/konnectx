import { StyleSheet, View } from 'react-native';
import AppPressable from './AppPressable';
import AppText from './AppText';
import AppIcon from './AppIcon';
import { colors, spacing } from '../../theme/tokens';

/**
 * Section wrapper with an optional eyebrow, title, description and a text
 * action. Gives every screen the same vertical rhythm and hierarchy.
 */
export default function AppSection({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
  style,
  headerStyle,
  contentStyle,
}) {
  const hasHeader = eyebrow || title || subtitle || actionLabel;

  return (
    <View style={[styles.section, style]}>
      {hasHeader ? (
        <View style={[styles.header, headerStyle]}>
          <View style={styles.copy}>
            {eyebrow ? (
              <AppText variant="overline" color={colors.cta} style={styles.eyebrow}>
                {eyebrow}
              </AppText>
            ) : null}
            {title ? (
              <AppText variant="subtitle" color={colors.text}>
                {title}
              </AppText>
            ) : null}
            {subtitle ? (
              <AppText variant="footnote" color={colors.muted} style={styles.subtitle}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {actionLabel ? (
            <AppPressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onAction}
              style={styles.action}
            >
              <AppText variant="label" color={colors.primary}>
                {actionLabel}
              </AppText>
              <AppIcon name="chevron-right" size={18} color={colors.primary} />
            </AppPressable>
          ) : null}
        </View>
      ) : null}
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    marginBottom: 2,
  },
  subtitle: {
    marginTop: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 2,
  },
});
