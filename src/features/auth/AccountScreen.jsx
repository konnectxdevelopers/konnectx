import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Image,
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
  KeyboardAwareScrollView,
  IconButton,
  InlineAlert,
  useToast,
} from '../../components/ui';
import { nextRouteForUser, useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import { roleOptions } from '../roles/roles';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values, isSignup) {
  const errors = {};

  if (isSignup && values.name.trim().length < 2) {
    errors.name = 'flow.auth.errors.name';
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'flow.auth.errors.email';
  }
  if (isSignup && values.phone.trim()) {
    const digits = values.phone.replace(/\D/g, '');
    if (
      !/^\+?[0-9\s().-]{7,32}$/.test(values.phone.trim()) ||
      digits.length < 7 ||
      digits.length > 15
    ) {
      errors.phone = 'flow.auth.errors.phone';
    }
  }
  if (values.password.length < 8) {
    errors.password = 'flow.auth.errors.password';
  }

  return errors;
}

const errorKeys = {
  invalid_credentials: 'flow.auth.errors.invalidCredentials',
  email_taken: 'flow.auth.errors.emailTaken',
  network: 'flow.auth.errors.network',
  account_not_found: 'flow.auth.errors.accountNotFound',
  unexpected_response: 'flow.auth.errors.unexpected',
};

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AccountScreen({ mode }) {
  if (mode !== 'signup' && mode !== 'login') {
    throw new Error('AccountScreen requires a signup or login mode.');
  }

  const isSignup = mode === 'signup';
  const params = useLocalSearchParams();
  const roleSlug = firstParam(params.role) || '';
  const selectedRole = roleOptions.find((role) => role.slug === roleSlug);
  const { t } = useLocale();
  const { showToast } = useToast();
  const responsive = useResponsive();
  const { session, signUp, signIn } = useAuth();

  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) {
      router.replace(nextRouteForUser(session.user));
    }
  }, [session]);

  const update = (key) => (value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  const switchMode = () => {
    router.replace(isSignup ? '/login' : '/signup');
  };

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    const nextErrors = validate(values, isSignup);
    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        const result = await signUp({
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim() || null,
          password: values.password,
          ...(selectedRole ? { selectedRole: roleSlug } : {}),
        });

        if (result.session) {
          router.replace(nextRouteForUser(result.session.user));
          return;
        }

        showToast({
          title: t('flow.auth.emailSentTitle'),
          message: t('flow.auth.emailVerificationSent'),
          variant: 'success',
        });
        router.push({
          pathname: '/verify-otp',
          params: {
            email: result.pendingEmail,
            afterSignup: 'true',
          },
        });
        return;
      }

      const nextSession = await signIn({
        email: values.email.trim(),
        password: values.password,
      });
      router.replace(nextRouteForUser(nextSession.user));
    } catch (error) {
      if (error.code === 'email_unverified') {
        showToast({
          title: t('flow.auth.emailSentTitle'),
          message: t('flow.auth.emailVerificationSent'),
          variant: 'success',
        });
        router.push({
          pathname: '/verify-otp',
          params: {
            email: values.email.trim(),
          },
        });
        return;
      }
      setFormError(t(errorKeys[error.code] || 'flow.auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    const email = values.email.trim();
    router.push(email ? { pathname: '/reset-password', params: { email } } : '/reset-password');
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
            { paddingHorizontal: responsive.horizontalPadding, paddingBottom: 50 },
          ]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <View style={styles.backRow}>
              <IconButton
                accessibilityLabel={t('common.back')}
                icon="arrow-left"
                onPress={() => router.replace('/welcome')}
                size="sm"
                variant="surface"
              />
              <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                {t('flow.welcome.back')}
              </AppText>
            </View>
            <View style={styles.brand}>
              <Image
                accessibilityLabel="KonnectX"
                resizeMode="contain"
                source={require('../../../assets/logo.png')}
                style={styles.logo}
              />
              <AppText variant="bodyStrong" color={colors.primary} style={styles.brandName}>
                KonnectX
              </AppText>
            </View>
          </View>

          <View style={styles.heading}>
            <View style={styles.headingIcon}>
              <AppIcon
                name={isSignup ? 'account-plus-outline' : 'account-outline'}
                size={26}
                color={colors.primary}
              />
            </View>
            <AppText variant="h1" align="center">
              {t(isSignup ? 'auth.signupTitle' : 'auth.loginTitle')}
            </AppText>
            <AppText
              variant="body"
              color={colors.muted}
              align="center"
              style={styles.subtitle}
            >
              {isSignup && selectedRole
                ? t('auth.signupRoleSubtitle', {
                    role: t(`roles.${roleSlug}.title`),
                  })
                : t(isSignup ? 'auth.signupSubtitle' : 'auth.loginSubtitle')}
            </AppText>
          </View>

          <AppCard padding="lg" style={styles.formCard}>
            <View style={styles.fields}>
              {isSignup ? (
                <AppInput
                  autoCapitalize="words"
                  autoComplete="name"
                  error={errors.name ? t(errors.name) : undefined}
                  icon="account-outline"
                  label={t('auth.fullNameLabel')}
                  onChangeText={update('name')}
                  placeholder={t('auth.fullNamePlaceholder')}
                  inputStyle={styles.autofillWhite}
                  reserveFooterSpace={Boolean(errors.name)}
                  returnKeyType="next"
                  value={values.name}
                />
              ) : null}
              <AppInput
                autoCapitalize="none"
                autoComplete="email"
                error={errors.email ? t(errors.email) : undefined}
                icon="email-outline"
                keyboardType="email-address"
                label={t('auth.emailLabel')}
                onChangeText={update('email')}
                placeholder={t('auth.emailPlaceholder')}
                inputStyle={styles.autofillWhite}
                reserveFooterSpace={Boolean(errors.email)}
                returnKeyType="next"
                onSubmitEditing={() => {}}
                value={values.email}
              />
              {isSignup ? (
                <AppInput
                  autoComplete="tel"
                  error={errors.phone ? t(errors.phone) : undefined}
                  icon="phone-outline"
                  keyboardType="phone-pad"
                  label={t('flow.auth.phoneOptionalLabel')}
                  onChangeText={update('phone')}
                  placeholder={t('flow.auth.phoneOptionalPlaceholder')}
                  inputStyle={styles.autofillWhite}
                  reserveFooterSpace={Boolean(errors.phone)}
                  returnKeyType="next"
                  onSubmitEditing={() => {}}
                  value={values.phone}
                />
              ) : null}
              <AppInput
                autoCapitalize="none"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                error={errors.password ? t(errors.password) : undefined}
                helper={isSignup ? t('flow.auth.passwordHint') : undefined}
                icon="lock-outline"
                label={t('auth.passwordLabel')}
                onChangeText={update('password')}
                onSubmitEditing={handleSubmit}
                placeholder={t('auth.passwordPlaceholder')}
                inputStyle={styles.autofillWhite}
                reserveFooterSpace={Boolean(errors.password)}
                returnKeyType="done"
                secureTextEntry
                value={values.password}
              />
            </View>

            {!isSignup ? (
              <AppText
                accessibilityRole="link"
                onPress={handleForgotPassword}
                variant="caption"
                color={colors.primary}
                style={styles.forgotPassword}
              >
                {t('auth.forgotPassword')}
              </AppText>
            ) : null}

            {formError ? (
              <InlineAlert message={formError} style={styles.notice} variant="error" />
            ) : null}

            <AppButton
              fullWidth
              iconRight="arrow-right"
              loading={submitting}
              onPress={handleSubmit}
              size="lg"
              style={styles.submitButton}
              title={t(isSignup ? 'home.createAccount' : 'auth.signIn')}
              variant="cta"
            />

            <View style={styles.switchRow}>
              <AppText variant="caption" color={colors.muted}>
                {t(isSignup ? 'auth.alreadyHaveAccountPrompt' : 'auth.noAccountPrompt')}
              </AppText>
              <AppText
                accessibilityRole="link"
                onPress={switchMode}
                variant="caption"
                color={colors.primary}
                style={styles.switchLink}
              >
                {t(isSignup ? 'auth.signInLink' : 'auth.createAccountLink')}
              </AppText>
            </View>
          </AppCard>

          <View style={styles.trustRow}>
            <AppIcon name="shield-lock-outline" size={16} color={colors.muted} />
            <AppText variant="caption" color={colors.subtle}>
              {t('flow.auth.otpNotice')}
            </AppText>
          </View>
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
    gap: spacing.sm,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  logo: {
    width: 30,
    height: 24,
  },
  brandName: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heading: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  headingIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
  },
  subtitle: {
    maxWidth: 310,
    marginTop: spacing.xs,
  },
  formCard: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  fields: {
    gap: spacing.xxs,
  },
  autofillWhite: {
    backgroundColor: colors.surface,
    ...Platform.select({
      web: {
        boxShadow: `0 0 0 1000px ${colors.surface} inset`,
      },
    }),
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    paddingVertical: spacing.xxs,
    fontWeight: '700',
  },
  notice: {
    marginTop: spacing.md,
  },
  submitButton: {
    marginTop: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    marginTop: spacing.lg,
  },
  switchLink: {
    fontWeight: '700',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: 'auto',
    paddingTop: spacing.xl,
  },
});
