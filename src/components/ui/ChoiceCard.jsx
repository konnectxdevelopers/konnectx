import { StyleSheet, View } from 'react-native';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import AppText from './AppText';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const tones = {
  mint: { surface: colors.primarySoft, ink: colors.primary },
  coral: { surface: colors.ctaSoft, ink: colors.cta },
  blue: { surface: colors.infoSoft, ink: colors.info },
  amber: { surface: colors.warningSoft, ink: colors.warning },
  green: { surface: colors.successSoft, ink: colors.success },
  slate: { surface: colors.surfaceMuted, ink: colors.textSecondary },
};

/**
 * Large selectable tile used for account types, skills and locations.
 * Selection is communicated with a border, a check mark and accessibility
 * state so it works for screen readers as well.
 */
export default function ChoiceCard({
  icon,
  title,
  description,
  meta,
  tone = 'mint',
  selected = false,
  onPress,
  style,
  compact = false,
  disabled = false,
}) {
  const palette = tones[tone] || tones.mint;

  return (
    <AppPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.98}
      style={[
        styles.card,
        compact && styles.cardCompact,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        style,
      ]}
    >
      {icon ? (
        <View style={[styles.iconWrap, compact && styles.iconWrapCompact, { backgroundColor: palette.surface }]}>
          <AppIcon name={icon} size={compact ? 18 : 22} color={palette.ink} />
        </View>
      ) : null}

      <View style={styles.copy}>
        <AppText variant={compact ? 'label' : 'bodyStrong'} numberOfLines={compact ? 2 : 1}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" color={colors.muted} numberOfLines={2}>
            {description}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="overline" color={palette.ink} style={styles.meta}>
            {meta}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <AppIcon name="check" size={13} color={colors.inverse} /> : null}
      </View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  cardCompact: {
    minHeight: 46,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FBFDFC',
    ...shadows.card,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  iconWrapCompact: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  meta: {
    marginTop: 2,
  },
  check: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  checkSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
});
