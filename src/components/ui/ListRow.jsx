import { StyleSheet, View } from 'react-native';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import AppText from './AppText';
import { colors, radii, spacing } from '../../theme/tokens';

export default function ListRow({
  icon,
  title,
  description,
  right,
  onPress,
  tone = 'mint',
  chevron = false,
  style,
}) {
  const surface = tone === 'coral' ? colors.ctaSoft : colors.primarySoft;
  const ink = tone === 'coral' ? colors.cta : colors.primary;
  const Wrapper = onPress ? AppPressable : View;

  return (
    <Wrapper
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={[styles.row, style]}
    >
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: surface }]}>
          <AppIcon name={icon} size={20} color={ink} />
        </View>
      ) : null}
      <View style={styles.copy}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" color={colors.muted} numberOfLines={2}>
            {description}
          </AppText>
        ) : null}
      </View>
      {right}
      {chevron ? (
        <AppIcon name="chevron-right" size={20} color={colors.subtle} />
      ) : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
});
