import { StyleSheet, View } from 'react-native';
import AppText from './AppText';
import { colors, spacing } from '../../theme/tokens';

export default function Divider({ vertical = false, label, inset = 0, style }) {
  if (vertical) {
    return <View style={[styles.vertical, style]} />;
  }

  if (label) {
    return (
      <View style={[styles.labelRow, { paddingHorizontal: inset }, style]}>
        <View style={styles.line} />
        <AppText variant="caption" color={colors.subtle} style={styles.label}>
          {label}
        </AppText>
        <View style={styles.line} />
      </View>
    );
  }

  return <View style={[styles.horizontal, { marginHorizontal: inset }, style]} />;
}

const styles = StyleSheet.create({
  horizontal: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  vertical: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.divider,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    letterSpacing: 0.3,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
});
