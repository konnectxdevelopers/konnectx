import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import AppText from './AppText';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

export const TAB_BAR_SPACE = 104;

export default function AppTabBar({
  items = [],
  activeKey,
  onChange,
  style,
  variant = 'light',
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isBrand = variant === 'brand';
  const compact = items.length >= 5 || width < 360;

  return (
    <View
      style={[
        styles.container,
        isBrand && styles.containerBrand,
        compact && styles.containerCompact,
        { bottom: Math.max(insets.bottom, spacing.sm) + spacing.xs },
        style,
      ]}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <AppPressable
            key={item.key}
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              onChange?.(item.key);
              item.onPress?.();
            }}
            scaleTo={0.92}
            style={styles.item}
          >
            <View
              style={[
                styles.iconWrap,
                compact && styles.iconWrapCompact,
                isBrand && styles.iconWrapBrand,
                active && styles.iconWrapActive,
                active && isBrand && styles.iconWrapActiveBrand,
              ]}
            >
              <AppIcon
                color={
                  active
                    ? isBrand
                      ? colors.inverse
                      : colors.primary
                    : isBrand
                      ? '#AFC4BA'
                      : colors.subtle
                }
                name={active ? item.activeIcon || item.icon : item.icon}
                size={compact ? 21 : 22}
              />
              {item.badge ? <View style={[styles.badge, isBrand && styles.badgeBrand]} /> : null}
            </View>
            <AppText
              adjustsFontSizeToFit
              color={
                active
                  ? isBrand
                    ? colors.inverse
                    : colors.primary
                  : isBrand
                    ? '#AFC4BA'
                    : colors.subtle
              }
              minimumFontScale={0.75}
              numberOfLines={1}
              style={[styles.label, compact && styles.labelCompact]}
              variant="caption"
            >
              {item.label}
            </AppText>
          </AppPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxs,
    paddingVertical: 6,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    ...shadows.floating,
  },
  containerCompact: {
    minHeight: 60,
    paddingVertical: 4,
  },
  containerBrand: {
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: colors.primaryDark,
    ...shadows.brand,
  },
  item: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 1,
    borderRadius: radii.lg,
  },
  iconWrap: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  iconWrapCompact: {
    width: 38,
    height: 28,
  },
  iconWrapActive: {
    backgroundColor: colors.primarySoft,
  },
  iconWrapBrand: {
    backgroundColor: 'transparent',
  },
  iconWrapActiveBrand: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  label: {
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 14,
  },
  labelCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.cta,
  },
  badgeBrand: {
    backgroundColor: colors.cta,
  },
});
