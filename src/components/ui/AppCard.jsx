import { StyleSheet, View } from 'react-native';
import AppPressable from './AppPressable';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const variants = {
  elevated: {
    backgroundColor: colors.surface,
    borderColor: colors.transparent,
    borderWidth: 0,
    shadow: shadows.card,
  },
  outlined: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    shadow: shadows.none,
  },
  flat: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.transparent,
    borderWidth: 0,
    shadow: shadows.none,
  },
  muted: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderWidth: 1,
    shadow: shadows.soft,
  },
  brand: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 0,
    shadow: shadows.brand,
  },
  cta: {
    backgroundColor: colors.cta,
    borderColor: colors.cta,
    borderWidth: 0,
    shadow: shadows.cta,
  },
};

const paddings = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
};

export default function AppCard({
  children,
  variant = 'elevated',
  padding = 'md',
  onPress,
  style,
  contentStyle,
  disabled = false,
  ...props
}) {
  const tone = variants[variant] || variants.elevated;
  const Wrapper = onPress ? AppPressable : View;
  const wrapperProps = onPress
    ? { accessibilityRole: 'button', disabled, onPress }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      style={[
        styles.card,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
          borderWidth: tone.borderWidth,
          padding: paddings[padding] ?? paddings.md,
        },
        tone.shadow,
        style,
      ]}
      {...props}
    >
      <View style={contentStyle}>{children}</View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
  },
});
