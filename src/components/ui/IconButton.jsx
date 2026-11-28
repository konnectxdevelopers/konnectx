import { StyleSheet } from 'react-native';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import { colors, radii, shadows } from '../../theme/tokens';

const variants = {
  plain: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
    iconColor: colors.text,
  },
  soft: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
    iconColor: colors.primary,
  },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    iconColor: colors.text,
  },
  brand: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    iconColor: colors.inverse,
  },
  cta: {
    backgroundColor: colors.cta,
    borderColor: colors.cta,
    iconColor: colors.inverse,
  },
  ghost: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMuted,
    iconColor: colors.textSecondary,
  },
};

const sizes = {
  sm: { box: 36, icon: 18, radius: radii.sm },
  md: { box: 44, icon: 21, radius: radii.md },
  lg: { box: 52, icon: 24, radius: radii.lg },
};

export default function IconButton({
  icon,
  onPress,
  variant = 'soft',
  size = 'md',
  iconColor,
  badge,
  accessibilityLabel,
  style,
  disabled = false,
  ...props
}) {
  const tone = variants[variant] || variants.soft;
  const sizeToken = sizes[size] || sizes.md;

  return (
    <AppPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.button,
        {
          width: sizeToken.box,
          height: sizeToken.box,
          borderRadius: sizeToken.radius,
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
        variant === 'surface' && shadows.soft,
        style,
      ]}
      {...props}
    >
      <AppIcon name={icon} size={sizeToken.icon} color={iconColor || tone.iconColor} />
      {badge ? <AppIcon name="circle" size={9} color={colors.cta} style={styles.badge} /> : null}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    position: 'absolute',
    top: 9,
    right: 9,
  },
});
