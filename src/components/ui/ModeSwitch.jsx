import { StyleSheet, View } from 'react-native';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import AppText from './AppText';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

/**
 * Segmented control that switches the marketplace between hiring and
 * offering. Options stay visible but are disabled when the account does not
 * have the capability yet, which makes the "add this later" path discoverable.
 */
export default function ModeSwitch({
  value = 'hiring',
  onChange,
  hiringLabel,
  offeringLabel,
  canHire = true,
  canOffer = true,
  style,
}) {
  const options = [
    { key: 'hiring', label: hiringLabel, icon: 'account-search-outline', enabled: canHire },
    { key: 'offering', label: offeringLabel, icon: 'briefcase-outline', enabled: canOffer },
  ];

  return (
    <View style={[styles.wrap, style]}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <AppPressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: !option.enabled }}
            disabled={!option.enabled}
            onPress={() => onChange?.(option.key)}
            scaleTo={0.98}
            style={[
              styles.option,
              active && styles.optionActive,
              !option.enabled && styles.optionDisabled,
            ]}
          >
            <AppIcon
              name={option.enabled ? option.icon : 'lock-outline'}
              size={16}
              color={active ? colors.inverse : colors.muted}
            />
            <AppText
              variant="label"
              color={active ? colors.inverse : colors.textSecondary}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </AppPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  option: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  optionActive: {
    backgroundColor: colors.primary,
  },
  optionDisabled: {
    opacity: 0.55,
  },
});
