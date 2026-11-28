import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { colors, motion, radii, shadows, spacing } from '../../theme/tokens';

const ToastContext = createContext(null);

const tones = {
  success: { icon: 'check-circle', color: colors.success, surface: colors.successSoft },
  error: { icon: 'alert-circle', color: colors.danger, surface: colors.dangerSoft },
  info: { icon: 'information', color: colors.info, surface: colors.infoSoft },
  warning: { icon: 'alert', color: colors.warning, surface: colors.warningSoft },
};

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const [progress] = useState(() => new Animated.Value(0));
  const timer = useRef(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const hideToast = useCallback(() => {
    clearTimer();
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.fast,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setToast(null);
      }
    });
  }, [progress]);

  const showToast = useCallback(
    (payload, variant, duration = 3200) => {
      // Screens call this both ways:
      //   showToast('Saved', 'success')
      //   showToast({ title, message, variant })
      const options =
        typeof payload === 'string'
          ? {
              title: payload,
              ...(variant && typeof variant === 'object' ? variant : null),
              variant:
                (variant && typeof variant === 'object' && variant.variant) ||
                (typeof variant === 'string' ? variant : 'info'),
              duration:
                (variant && typeof variant === 'object' && variant.duration) || duration,
            }
          : {
              duration: 3200,
              ...(payload || {}),
              variant:
                (payload && payload.variant) ||
                (typeof variant === 'string' ? variant : 'info'),
            };
      clearTimer();
      setToast({
        title: options.title,
        message: options.message,
        variant: options.variant || 'info',
      });
      progress.stopAnimation();
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        ...motion.spring,
      }).start();
      timer.current = setTimeout(hideToast, options.duration || 3200);
    },
    [hideToast, progress]
  );

  useEffect(() => () => clearTimer(), []);

  const value = useMemo(
    () => ({ showToast, hideToast, show: showToast }),
    [showToast, hideToast]
  );
  const tone = tones[toast?.variant] || tones.info;

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <Animated.View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            pointerEvents="box-none"
            style={[
              styles.overlay,
              {
                top: insets.top + spacing.sm,
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.toast}>
              <View style={[styles.iconWrap, { backgroundColor: tone.surface }]}>
                <AppIcon name={tone.icon} size={20} color={tone.color} />
              </View>
              <View style={styles.copy}>
                {toast.title ? (
                  <AppText variant="label" color={colors.text} numberOfLines={2}>
                    {toast.title}
                  </AppText>
                ) : null}
                {toast.message ? (
                  <AppText variant="caption" color={colors.muted} numberOfLines={3}>
                    {toast.message}
                  </AppText>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel="Dismiss"
                accessibilityRole="button"
                hitSlop={10}
                onPress={hideToast}
              >
                <AppIcon name="close" size={17} color={colors.subtle} />
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider.');
  }
  return context;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  iconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
});
