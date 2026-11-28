import { useEffect, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { colors, motion, radii, shadows, spacing } from '../../theme/tokens';

/**
 * Animated bottom sheet. The parent keeps `visible` true until the slide-out
 * animation finishes, so dismissal feels smooth on Android.
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  children,
  scrollable = false,
  style,
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const hiddenOffset = Math.max(560, height * 0.75);
  const [translateY] = useState(() => new Animated.Value(hiddenOffset));

  useEffect(() => {
    if (!visible) {
      return;
    }

    translateY.setValue(hiddenOffset);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      ...motion.spring,
    }).start();
  }, [hiddenOffset, translateY, visible]);

  const closeSheet = () => {
    Animated.timing(translateY, {
      toValue: hiddenOffset,
      duration: motion.base,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onClose?.();
      }
    });
  };

  const Content = scrollable ? ScrollView : View;
  const contentProps = scrollable
    ? { contentContainerStyle: styles.scroll, showsVerticalScrollIndicator: false }
    : {};

  return (
    <Modal
      animationType="fade"
      onRequestClose={closeSheet}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          accessibilityLabel="Close sheet"
          accessibilityRole="button"
          onPress={closeSheet}
          style={styles.backdrop}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateY }],
            },
            style,
          ]}
        >
          <View style={styles.handle} />
          {title || icon ? (
            <View style={styles.header}>
              {icon ? (
                <View style={styles.iconWrap}>
                  <AppIcon name={icon} size={22} color={colors.primary} />
                </View>
              ) : null}
              <View style={styles.copy}>
                {title ? <AppText variant="subtitle">{title}</AppText> : null}
                {subtitle ? (
                  <AppText variant="caption" color={colors.muted}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={10}
                onPress={closeSheet}
                style={styles.close}
              >
                <AppIcon name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
          <Content {...contentProps}>{children}</Content>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '90%',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  handle: {
    width: 40,
    height: 4,
    alignSelf: 'center',
    marginBottom: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  close: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  scroll: {
    paddingBottom: spacing.lg,
  },
});
