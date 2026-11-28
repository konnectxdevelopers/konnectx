import { useState } from 'react';
import { Animated, Platform, Pressable } from 'react-native';
import { motion } from '../../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with a subtle spring scale — the tactile feel used by premium
 * marketplace apps. Falls back gracefully when disabled.
 */
export default function AppPressable({
  children,
  onPress,
  onPressIn,
  onPressOut,
  disabled = false,
  scaleTo = 0.97,
  style,
  ...props
}) {
  const [scale] = useState(() => new Animated.Value(1));

  const animateTo = (toValue) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: Platform.OS !== 'web',
      ...motion.spring,
    }).start();
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={(event) => {
        if (!disabled) {
          animateTo(scaleTo);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!disabled) {
          animateTo(1);
        }
        onPressOut?.(event);
      }}
      style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.55 }]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}
