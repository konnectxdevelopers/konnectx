import { Image, StyleSheet, View } from 'react-native';
import AppPressable from './AppPressable';
import AppText from './AppText';
import { colors } from '../../theme/tokens';

const sizes = {
  sm: 34,
  md: 44,
  lg: 56,
  xl: 76,
};

const fontSizes = {
  sm: 13,
  md: 16,
  lg: 20,
  xl: 26,
};

function initialsOf(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function Avatar({
  source,
  name = '',
  size = 'md',
  tone = 'primary',
  ring = false,
  onPress,
  accessibilityLabel,
  style,
}) {
  const dimension = sizes[size] || sizes.md;
  const backgroundColor = tone === 'cta' ? colors.ctaSoft : colors.primarySoft;
  const color = tone === 'cta' ? colors.cta : colors.primary;
  const Wrapper = onPress ? AppPressable : View;

  return (
    <Wrapper
      accessibilityLabel={accessibilityLabel || name || 'Profile'}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={[
        styles.wrap,
        { width: dimension, height: dimension, borderRadius: dimension / 2, backgroundColor },
        ring && styles.ring,
        style,
      ]}
    >
      {source ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={name || 'Avatar'}
          source={source}
          style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
        />
      ) : (
        <AppText
          style={{
            color,
            fontSize: fontSizes[size] || fontSizes.md,
            fontWeight: '700',
            letterSpacing: -0.2,
          }}
        >
          {initialsOf(name) || 'K'}
        </AppText>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
