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

export default function CategoryCard({
  icon,
  label,
  description,
  meta,
  tone = 'mint',
  active = false,
  onPress,
  style,
}) {
  const palette = tones[tone] || tones.mint;

  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      scaleTo={0.975}
      style={[
        styles.card,
        active && styles.cardActive,
        style,
      ]}
    >
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: palette.surface }]}>
          <AppIcon name={icon} size={22} color={palette.ink} />
        </View>
        <View style={styles.arrow}>
          <AppIcon name="arrow-top-right" size={15} color={colors.subtle} />
        </View>
      </View>
      <View style={styles.copy}>
        <AppText variant="bodyStrong" color={colors.text} numberOfLines={1}>
          {label}
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
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 132,
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  cardActive: {
    borderColor: colors.primary,
    ...shadows.card,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  arrow: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  copy: {
    gap: 3,
    marginTop: spacing.sm,
  },
  meta: {
    marginTop: 2,
  },
});
