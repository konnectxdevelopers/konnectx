import { StyleSheet, View } from 'react-native';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { colors } from '../../theme/tokens';

export default function Rating({ value = 4.9, count, size = 13, compact = false }) {
  return (
    <View style={styles.row} accessibilityLabel={`Rated ${value} out of 5`}>
      <AppIcon name="star" size={size} color={colors.star} />
      <AppText
        variant="caption"
        color={colors.text}
        style={[styles.value, { fontSize: size }]}
      >
        {Number(value).toFixed(1)}
      </AppText>
      {!compact && count ? (
        <AppText variant="caption" color={colors.subtle} style={{ fontSize: size }}>
          ({count})
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  value: {
    fontWeight: '700',
  },
});
