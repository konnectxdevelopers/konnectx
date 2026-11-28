import {
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
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

export default function AppModal({
  visible = false,
  onClose,
  title,
  description,
  icon,
  iconTone = 'primary',
  children,
  actions,
  scrollable = true,
}) {
  const iconSurface = iconTone === 'cta' ? colors.ctaSoft : colors.primarySoft;
  const iconColor = iconTone === 'cta' ? colors.cta : colors.primary;
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxBodyHeight = Math.max(220, height * 0.58);

  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? { contentContainerStyle: styles.scrollBody, showsVerticalScrollIndicator: false }
    : {};

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          accessibilityLabel="Close modal"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.card,
            {
              paddingHorizontal: responsive.isSmall ? spacing.lg : spacing.xl,
              marginBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.header}>
            {icon ? (
              <View style={[styles.iconWrap, { backgroundColor: iconSurface }]}>
                <AppIcon name={icon} size={23} color={iconColor} />
              </View>
            ) : (
              <View />
            )}
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.close}
            >
              <AppIcon name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
          {title ? <AppText variant="title">{title}</AppText> : null}
          {description ? (
            <AppText variant="footnote" color={colors.muted} style={styles.description}>
              {description}
            </AppText>
          ) : null}
          {children ? (
            <Body
              {...bodyProps}
              nestedScrollEnabled
              style={[styles.bodyScroll, { maxHeight: maxBodyHeight }]}
            >
              {children}
            </Body>
          ) : null}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    paddingVertical: spacing.lg,
    borderRadius: radii.xxl,
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  header: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
  },
  close: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  description: {
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  body: {
    marginTop: spacing.lg,
  },
  bodyScroll: {
    marginTop: spacing.lg,
  },
  scrollBody: {
    paddingBottom: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});
