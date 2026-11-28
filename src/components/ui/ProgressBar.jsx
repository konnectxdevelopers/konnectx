import { StyleSheet, View } from 'react-native';
import AppText from './AppText';
import { colors, spacing } from '../../theme/tokens';

const tones = {
  primary: colors.primary,
  cta: colors.cta,
  success: colors.success,
  muted: colors.muted,
};

/**
 * Determinate progress bar used by the profile completion tracker and the
 * setup wizard. Accepts both `value` (0–100) and the older `progress` (0–1)
 * prop, plus `color` / `trackColor` overrides used on dark hero cards.
 */
export default function ProgressBar({
  value,
  progress,
  tone = 'primary',
  height = 8,
  label,
  color,
  trackColor,
  style,
  trackStyle,
}) {
  const raw = value !== undefined ? Number(value) : Number(progress || 0) * 100;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
  const fillColor = color || tones[tone] || tones.primary;

  return (
    <View style={style}>
      {label ? (
        <View style={styles.labelRow}>
          <AppText variant="caption" color={colors.muted}>
            {label}
          </AppText>
          <AppText variant="caption" color={colors.text} weight="700">
            {`${Math.round(clamped)}%`}
          </AppText>
        </View>
      ) : null}
      <View
        accessibilityLabel={label}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
        style={[
          styles.track,
          { height, borderRadius: height / 2, backgroundColor: trackColor || colors.surfaceMuted },
          trackStyle,
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${clamped}%`,
              borderRadius: height / 2,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
});
