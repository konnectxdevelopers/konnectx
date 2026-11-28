import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppCard,
  AppIcon,
  AppInput,
  AppText,
  InlineAlert,
  KeyboardAwareScrollView,
  IconButton,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function errorMessage(error, t) {
  if (error.code === 'network') {
    return t('flow.auth.errors.network');
  }
  if (error.code === 'otp_expired') {
    return t('flow.otp.expired');
  }
  if (error.code === 'otp_invalid') {
    return t('flow.otp.invalid');
  }
  if (error.code === 'invalid_password') {
    return t('flow.auth.errors.password');
  }
  return t('flow.auth.errors.generic');
}

export default function PasswordResetScreen() {
  const params = useLocalSearchParams();
  const { t } = useLocale();
  const { showToast } = useToast();
  const responsive = useResponsive();
  const { requestPasswordReset, confirmPasswordReset } = useAuth();
  const [email, setEmail] = useState(firstParam(params.email) || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const sendCode = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setFormError(t('flow.auth.errors.email'));
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await requestPasswordReset(cleanEmail);
      setEmail(cleanEmail);
      setCodeRequested(true);
      showToast({
        title: t('flow.passwordReset.sentTitle'),
        message: t('flow.passwordReset.sentMessage'),
        variant: 'success',
      });
    } catch (error) {
      setFormError(errorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setFormError(t('flow.otp.incomplete'));
      return;
    }
    if (password.length < 8) {
      setFormError(t('flow.auth.errors.password'));
      return;
    }
    if (password !== confirmPassword) {
      setFormError(t('flow.passwordReset.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await confirmPasswordReset({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password,
      });
      showToast({
        title: t('flow.passwordReset.successTitle'),
        message: t('flow.passwordReset.successMessage'),
        variant: 'success',
      });
      router.replace('/login');
    } catch (error) {
      setFormError(errorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

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
              onPress={() => router.replace('/login')}
              size="sm"
              variant="surface"
            />
            <AppText variant="overline" color={colors.muted}>
              {t('flow.passwordReset.step')}
            </AppText>
          </View>

          <View style={styles.heading}>
            <View style={styles.headingIcon}>
              <AppIcon name="lock-reset" size={26} color={colors.primary} />
            </View>
            <AppText variant="h1" align="center">
              {t('flow.passwordReset.title')}
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.subtitle}>
              {t(codeRequested
                ? 'flow.passwordReset.codeSubtitle'
                : 'flow.passwordReset.subtitle')}
            </AppText>
          </View>

          <AppCard padding="lg" style={styles.card}>
            <View style={styles.fields}>
              <AppInput
                autoCapitalize="none"
                autoComplete="email"
                editable={!codeRequested}
                icon="email-outline"
                keyboardType="email-address"
                label={t('auth.emailLabel')}
                onChangeText={setEmail}
                placeholder={t('auth.emailPlaceholder')}
                reserveFooterSpace={false}
                value={email}
              />
              {codeRequested ? (
                <>
                  <AppInput
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    label={t('flow.passwordReset.codeLabel')}
                    maxLength={6}
                    onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                    placeholder={t('flow.passwordReset.codePlaceholder')}
                    value={code}
                  />
                  <AppInput
                    autoComplete="new-password"
                    label={t('flow.passwordReset.newPasswordLabel')}
                    onChangeText={setPassword}
                    placeholder={t('auth.passwordPlaceholder')}
                    secureTextEntry
                    value={password}
                  />
                  <AppInput
                    autoComplete="new-password"
                    label={t('flow.passwordReset.confirmPasswordLabel')}
                    onChangeText={setConfirmPassword}
                    placeholder={t('flow.passwordReset.confirmPasswordPlaceholder')}
                    secureTextEntry
                    value={confirmPassword}
                  />
                </>
              ) : null}
            </View>

            {formError ? (
              <InlineAlert message={formError} style={styles.alert} variant="error" />
            ) : null}

            <AppButton
              fullWidth
              loading={submitting}
              onPress={codeRequested ? resetPassword : sendCode}
              size="lg"
              style={styles.submit}
              title={t(codeRequested
                ? 'flow.passwordReset.submit'
                : 'flow.passwordReset.sendCode')}
              variant="cta"
            />
            {codeRequested ? (
              <AppButton
                fullWidth
                disabled={submitting}
                onPress={sendCode}
                title={t('flow.passwordReset.resendCode')}
                variant="ghost"
              />
            ) : null}
          </AppCard>
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
  fields: {
    gap: spacing.xs,
  },
  alert: {
    marginTop: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
});
