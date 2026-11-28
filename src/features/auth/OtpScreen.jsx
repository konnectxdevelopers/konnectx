import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppCard,
  AppIcon,
  AppText,
  KeyboardAwareScrollView,
  IconButton,
  InlineAlert,
  useKeyboardNavigation,
  useToast,
} from '../../components/ui';
import { nextRouteForUser, useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing, typography } from '../../theme/tokens';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function OtpScreen() {
  const params = useLocalSearchParams();
  const email = firstParam(params.email) || '';
  const selectedRole = firstParam(params.role) || undefined;
  const { t } = useLocale();
  const { showToast } = useToast();
  const responsive = useResponsive();
  const { verifyOtp, requestVerification } = useAuth();
  const keyboardNavigation = useKeyboardNavigation();

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputs = useRef([]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return undefined;
    }
    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const code = digits.join('');

  const focusInput = (index) => {
    if (index >= 0 && index < OTP_LENGTH) {
      inputs.current[index]?.focus();
    }
  };

  const setDigitAt = (index, value) => {
    setDigits((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setError(null);
  };

  const handleChange = (index, rawValue) => {
    const clean = rawValue.replace(/\D/g, '');

    if (!clean) {
      setDigitAt(index, '');
      return;
    }

    if (clean.length > 1) {
      const next = [...digits];
      clean
        .slice(0, OTP_LENGTH - index)
        .split('')
        .forEach((character, offset) => {
          next[index + offset] = character;
        });
      setDigits(next);
      setError(null);
      focusInput(Math.min(index + clean.length, OTP_LENGTH - 1));
      return;
    }

    setDigitAt(index, clean);
    focusInput(index + 1);
  };

  const handleKeyPress = (index, event) => {
    if (event.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1);
    }
  };

  const verify = async () => {
    if (verifying) {
      return;
    }
    if (code.length !== OTP_LENGTH) {
      setError(t('flow.otp.incomplete'));
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      const verifiedSession = await verifyOtp({ email, code, selectedRole });
      router.replace(
        firstParam(params.afterSignup) === 'true'
          ? '/home'
          : nextRouteForUser(verifiedSession.user)
      );
    } catch (verifyError) {
      if (verifyError.code === 'otp_expired') {
        setError(t('flow.otp.expired'));
      } else if (verifyError.code === 'otp_invalid') {
        setError(t('flow.otp.invalid'));
      } else if (verifyError.code === 'network') {
        setError(t('flow.auth.errors.network'));
      } else {
        setError(verifyError.message || t('flow.otp.invalid'));
      }
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (resending || secondsLeft > 0) {
      return;
    }
    setResending(true);
    setError(null);
    try {
      await requestVerification(email);
      setDigits(Array(OTP_LENGTH).fill(''));
      setSecondsLeft(RESEND_SECONDS);
      focusInput(0);
      showToast({
        title: t('flow.auth.emailSentTitle'),
        message: t('flow.auth.emailVerificationSent'),
        variant: 'success',
      });
    } catch (resendError) {
      setError(
        resendError.code === 'network'
          ? t('flow.auth.errors.network')
          : resendError.code === 'code_recently_sent'
            ? t('flow.otp.resendCooldown')
            : t('flow.otp.resendError')
      );
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.emptyWrap}>
          <AppIcon name="email-alert-outline" size={34} color={colors.muted} />
          <AppText variant="subtitle" align="center">
            {t('flow.otp.missingEmail')}
          </AppText>
          <AppButton
            onPress={() => router.replace('/signup')}
            title={t('flow.otp.backToSignup')}
            variant="cta"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <KeyboardAwareScrollView
          alwaysBounceVertical={false}
          bounces={false}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: responsive.horizontalPadding },
          ]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <IconButton
              accessibilityLabel={t('common.back')}
              icon="arrow-left"
              onPress={() => router.replace('/signup')}
              size="sm"
              variant="surface"
            />
            <AppText variant="overline" color={colors.muted}>
              {t('flow.otp.step')}
            </AppText>
          </View>

          <View style={styles.heading}>
            <View style={styles.headingIcon}>
              <AppIcon name="shield-key-outline" size={26} color={colors.primary} />
            </View>
            <AppText variant="h1" align="center">
              {t('flow.otp.title')}
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.subtitle}>
              {t('flow.otp.subtitle')}
            </AppText>
            <AppText variant="bodyStrong" color={colors.primary} align="center">
              {email}
            </AppText>
          </View>

          <AppCard padding="lg" style={styles.card}>
            <View style={styles.otpRow}>
              {digits.map((digit, index) => (
                <TextInput
                  key={`otp-${index}`}
                  ref={(node) => {
                    inputs.current[index] = node;
                  }}
                  accessibilityLabel={t('flow.otp.digitLabel', { index: index + 1 })}
                  autoFocus={index === 0}
                  caretHidden
                  keyboardType="number-pad"
                  maxLength={1}
                  onChangeText={(value) => handleChange(index, value)}
                  onKeyPress={(event) => handleKeyPress(index, event)}
                  onFocus={() => {
                    keyboardNavigation?.scrollToInput(inputs.current[index]);
                  }}
                  onSubmitEditing={verify}
                  selectTextOnFocus
                  selectionColor={colors.primaryMuted}
                  style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                  value={digit}
                />
              ))}
            </View>

            {error ? (
              <InlineAlert message={error} style={styles.alert} variant="error" />
            ) : null}

            <AppButton
              fullWidth
              iconRight="check"
              loading={verifying}
              onPress={verify}
              size="lg"
              style={styles.submit}
              title={t('flow.otp.verify')}
              variant="cta"
            />

            <View style={styles.resendRow}>
              <AppText variant="caption" color={colors.muted}>
                {t('flow.otp.didNotGet')}
              </AppText>
              <AppText
                accessibilityRole="button"
                onPress={resend}
                variant="caption"
                color={secondsLeft > 0 || resending ? colors.subtle : colors.primary}
                style={styles.resendLink}
              >
                {secondsLeft > 0
                  ? t('flow.otp.resendIn', { seconds: secondsLeft })
                  : t('flow.otp.resend')}
              </AppText>
            </View>
          </AppCard>

          <AppButton
            fullWidth
            onPress={() => router.replace('/login')}
            title={t('flow.otp.usePassword')}
            variant="ghost"
          />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  headingIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
  },
  subtitle: {
    maxWidth: 320,
  },
  card: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  otpRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  otpInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 58,
    paddingVertical: 0,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    fontSize: typography.sizes.title,
    fontWeight: '700',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  alert: {
    marginTop: spacing.md,
  },
  submit: {
    marginTop: spacing.lg,
  },
  resendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.lg,
  },
  resendLink: {
    fontWeight: '700',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
});
