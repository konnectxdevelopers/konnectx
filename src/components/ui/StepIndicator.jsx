import { StyleSheet, View } from 'react-native';
import AppText from './AppText';
import { colors, radii, spacing } from '../../theme/tokens';

/**
 * Segmented progress indicator for multi-step flows.
 */
export default function StepIndicator({ steps = [], activeIndex = 0, style, capped = true }) {
  return (
    <View style={style}>
      <View style={styles.track}>
        {steps.map((step, index) => (
          <View
            key={step.key || step}
            style={[
              styles.segment,
              index <= activeIndex && styles.segmentActive,
              capped && index === activeIndex && styles.segmentCurrent,
            ]}
          />
        ))}
      </View>
      {steps[activeIndex] ? (
        <View style={styles.caption}>
          <AppText variant="caption" color={colors.muted}>
            {`${activeIndex + 1} / ${steps.length}`}
          </AppText>
          <AppText variant="caption" color={colors.text} weight="700">
            {steps[activeIndex].label}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    height: 4,
    flex: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  segmentActive: {
    backgroundColor: colors.primaryMuted,
  },
  segmentCurrent: {
    backgroundColor: colors.primary,
  },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
