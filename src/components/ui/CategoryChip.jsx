import { StyleSheet } from 'react-native';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import AppText from './AppText';
import { colors, radii, spacing } from '../../theme/tokens';

export default function CategoryChip({
  label,
  icon,
  active = false,
  onPress,
  style,
}) {
  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      scaleTo={0.95}
      style={[styles.chip, active && styles.chipActive, style]}
    >
      {icon ? (
        <AppIcon
          name={icon}
          size={17}
          color={active ? colors.inverse : colors.primary}
        />
      ) : null}
      <AppText
        variant="label"
        color={active ? colors.inverse : colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
});
