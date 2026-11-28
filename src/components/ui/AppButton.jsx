import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import AppText from './AppText';
import { colors, radii, shadows, spacing, typography } from '../../theme/tokens';

const variants = {
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    textColor: colors.inverse,
    iconColor: colors.inverse,
    ripple: 'rgba(255,255,255,0.18)',
    shadow: shadows.brand,
  },
  cta: {
    backgroundColor: colors.cta,
    borderColor: colors.cta,
    textColor: colors.inverse,
    iconColor: colors.inverse,
    ripple: 'rgba(255,255,255,0.22)',
    shadow: shadows.cta,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
    textColor: colors.primary,
    iconColor: colors.primary,
    ripple: 'rgba(11,59,46,0.10)',
    shadow: shadows.none,
  },
  soft: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMuted,
    textColor: colors.textSecondary,
    iconColor: colors.textSecondary,
    ripple: 'rgba(17,24,39,0.06)',
    shadow: shadows.none,
  },
  outline: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    textColor: colors.text,
    iconColor: colors.text,
    ripple: 'rgba(17,24,39,0.06)',
    shadow: shadows.none,
  },
  white: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    textColor: colors.primary,
    iconColor: colors.primary,
    ripple: 'rgba(11,59,46,0.10)',
    shadow: shadows.card,
  },
  ghost: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
    textColor: colors.primary,
    iconColor: colors.primary,
    ripple: 'rgba(11,59,46,0.08)',
    shadow: shadows.none,
  },
  link: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
    textColor: colors.primary,
    iconColor: colors.primary,
    ripple: 'rgba(11,59,46,0.06)',
    shadow: shadows.none,
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
    textColor: colors.danger,
    iconColor: colors.danger,
    ripple: 'rgba(220,38,38,0.08)',
    shadow: shadows.none,
  },
};

const sizes = {
  sm: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.footnote,
    icon: 16,
    radius: radii.sm,
    gap: spacing.xs,
  },
  md: {
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.body,
    icon: 18,
    radius: radii.md,
    gap: spacing.sm,
  },
  lg: {
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    fontSize: typography.sizes.bodyLg,
    icon: 20,
    radius: radii.lg,
    gap: spacing.sm,
  },
};

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  iconColor,
  loading = false,
  uploadingMedia = false,
  disabled = false,
  fullWidth = false,
  containerStyle,
  style,
  textStyle,
  ...props
}) {
  const tone = variants[variant] || variants.primary;
  const sizeToken = sizes[size] || sizes.md;
  const busy = loading || uploadingMedia;
  const unavailable = disabled || busy;
  const tint = iconColor || tone.iconColor;

  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy }}
      android_ripple={{ color: tone.ripple }}
      disabled={unavailable}
      onPress={onPress}
      style={[
        styles.button,
        {
          minHeight: sizeToken.minHeight,
          paddingHorizontal: sizeToken.paddingHorizontal,
          borderRadius: sizeToken.radius,
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
        variant !== 'link' && variant !== 'ghost' && tone.shadow,
        fullWidth && styles.fullWidth,
        containerStyle,
        style,
      ]}
      {...props}
    >
      <View style={[styles.content, { gap: sizeToken.gap }]}>
        {busy ? (
          <ActivityIndicator color={tone.textColor} size="small" />
        ) : icon ? (
          <AppIcon name={icon} size={sizeToken.icon} color={tint} />
        ) : null}
        {title ? (
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.84}
            numberOfLines={1}
            style={[
              styles.label,
              { color: tone.textColor, fontSize: sizeToken.fontSize },
              textStyle,
            ]}
            variant="label"
          >
            {title}
          </AppText>
        ) : null}
        {!busy && iconRight ? (
          <AppIcon name={iconRight} size={sizeToken.icon} color={tint} />
        ) : null}
      </View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  label: {
    fontWeight: typography.weights.bold,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
});
