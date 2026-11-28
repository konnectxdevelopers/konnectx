import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import IconButton from './IconButton';
import useResponsive from '../../theme/useResponsive';
import { colors, spacing, typography } from '../../theme/tokens';

/**
 * Header used across the app. Supports a back button, brand slot, centred or
 * leading title and any number of trailing actions.
 *
 * `rightAction` ({ icon, onPress, accessibilityLabel }) is accepted for older
 * screens; `right` remains available for arbitrary nodes.
 */
export default function AppHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  showBack = false,
  left,
  right,
  rightAction,
  centerTitle = false,
  transparent = false,
  bordered = false,
  safeTop = false,
  style,
}) {
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const hasCopy = Boolean(title || subtitle || eyebrow);
  const hasRight = Boolean(right || rightAction);

  return (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: responsive.horizontalPadding,
          paddingTop: safeTop ? insets.top + spacing.xs : spacing.xs,
        },
        transparent && styles.transparent,
        bordered && styles.bordered,
        style,
      ]}
    >
      <View style={styles.side}>
        {showBack || onBack ? (
          <IconButton
            accessibilityLabel="Go back"
            icon="arrow-left"
            onPress={onBack}
            size="sm"
            variant="surface"
          />
        ) : (
          left
        )}
      </View>

      {hasCopy ? (
        <View style={[styles.copy, centerTitle && styles.copyCentered]}>
          {eyebrow ? (
            <AppText variant="overline" color={colors.cta} numberOfLines={1}>
              {eyebrow}
            </AppText>
          ) : null}
          {title ? (
            <AppText
              adjustsFontSizeToFit
              minimumFontScale={0.86}
              numberOfLines={1}
              variant={centerTitle ? 'headline' : 'subtitle'}
              style={centerTitle && styles.centeredText}
            >
              {title}
            </AppText>
          ) : null}
          {subtitle ? (
            <AppText
              color={colors.muted}
              numberOfLines={1}
              variant="caption"
              style={centerTitle && styles.centeredText}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={[styles.side, styles.right]}>
        {right}
        {rightAction?.icon ? (
          <IconButton
            accessibilityLabel={rightAction.accessibilityLabel || 'Action'}
            icon={rightAction.icon}
            onPress={rightAction.onPress}
            size="sm"
            variant="surface"
          />
        ) : null}
        {!hasRight && !showBack && !onBack ? <View style={styles.placeholder} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  transparent: {
    backgroundColor: colors.transparent,
  },
  bordered: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  side: {
    minWidth: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  right: {
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  placeholder: {
    width: 36,
    height: 36,
  },
  spacer: {
    flex: 1,
  },
  copy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  copyCentered: {
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
    fontFamily: typography.fontFamily,
  },
});
