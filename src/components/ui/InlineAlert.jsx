import { StyleSheet, View } from 'react-native';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { colors, radii, spacing } from '../../theme/tokens';

const variants = {
  error: {
    icon: 'alert-circle-outline',
    color: colors.danger,
    surface: colors.dangerSoft,
    border: '#FBD5D5',
  },
  info: {
    icon: 'information-outline',
    color: colors.info,
    surface: colors.infoSoft,
    border: '#D7E5FD',
  },
  success: {
    icon: 'check-circle-outline',
    color: colors.success,
    surface: colors.successSoft,
    border: '#CDEBDD',
  },
  warning: {
    icon: 'alert-outline',
    color: colors.warning,
    surface: colors.warningSoft,
    border: '#FBE7C4',
  },
};

export default function InlineAlert({
  variant = 'info',
  title,
  message,
  action,
  style,
}) {
  const tone = variants[variant] || variants.info;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.alert,
        { backgroundColor: tone.surface, borderColor: tone.border },
        style,
      ]}
    >
      <AppIcon name={tone.icon} size={19} color={tone.color} />
      <View style={styles.copy}>
        {title ? (
          <AppText variant="label" color={tone.color}>
            {title}
          </AppText>
        ) : null}
        {message ? (
          <AppText variant="caption" color={colors.textSecondary} style={styles.message}>
            {message}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  message: {
    lineHeight: 18,
  },
});
