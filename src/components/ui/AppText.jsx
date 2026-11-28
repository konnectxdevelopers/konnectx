import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '../../theme/tokens';

/**
 * Typographic primitive. Every piece of text in the app flows through this
 * component so scale, colour and rhythm stay consistent across screens.
 */
export default function AppText({
  variant = 'body',
  color = colors.text,
  align,
  weight,
  size,
  style,
  children,
  ...props
}) {
  const token = typography.variants[variant] || typography.variants.body;

  return (
    <Text
      {...props}
      style={[
        styles.base,
        token,
        { color },
        align && { textAlign: align },
        weight && { fontWeight: weight },
        size && { fontSize: size },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: typography.fontFamily,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
