import { StyleSheet, View } from 'react-native';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { colors, radii, spacing } from '../../theme/tokens';

const tones = {
  primary: { backgroundColor: colors.primarySoft, color: colors.primary },
  cta: { backgroundColor: colors.ctaSoft, color: colors.ctaInk },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  info: { backgroundColor: colors.infoSoft, color: colors.info },
  neutral: { backgroundColor: colors.surfaceMuted, color: colors.muted },
  dark: { backgroundColor: colors.primary, color: colors.inverse },
  outline: { backgroundColor: colors.transparent, color: colors.textSecondary },
  gold: { backgroundColor: '#FBF3E3', color: '#8A6A2F' },
};

/**
 * Status pill. Supports both `tone` (canonical) and `variant` (used by older
 * screens) so every existing status badge renders with the intended colour.
 */
export default function Badge({
  label,
  tone,
  variant,
  icon,
  dot = false,
  size = 'md',
  style,
  textStyle,
}) {
  const key = tone || variant || 'primary';
  const palette = tones[key] || tones.primary;
  const compact = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        key === 'outline' && styles.outline,
        { backgroundColor: palette.backgroundColor },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: palette.color }]} /> : null}
      {icon ? <AppIcon name={icon} size={compact ? 11 : 12} color={palette.color} /> : null}
      <AppText
        variant="caption"
        numberOfLines={1}
        style={[styles.label, compact && styles.labelCompact, { color: palette.color }, textStyle]}
      >
        {String(label ?? '').replace(/_/g, ' ')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeCompact: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  outline: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  labelCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
