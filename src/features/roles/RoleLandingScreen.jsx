import { useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppIcon,
  AppText,
  BottomSheet,
  Divider,
  InlineAlert,
  ListRow,
} from '../../components/ui';
import { nextRouteForUser, useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const roleColors = {
  customer: { surface: colors.primarySoft, ink: colors.primary },
  professional: { surface: colors.ctaSoft, ink: colors.cta },
  business: { surface: colors.infoSoft, ink: colors.info },
  hiring: { surface: colors.warningSoft, ink: colors.warning },
};

const featureIcons = ['shield-check-outline', 'account-group-outline', 'swap-horizontal'];

export default function RoleLandingScreen({ role }) {
  if (!role) {
    throw new Error('RoleLandingScreen requires a valid role.');
  }

  const { t } = useLocale();
  const responsive = useResponsive();
  const { session, selectRole } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [actionError, setActionError] = useState(null);
  const title = t(`roles.${role.slug}.title`);
  const description = t(`roles.${role.slug}.description`);
  const palette = roleColors[role.slug] || roleColors.customer;
  const features = t(`roles.${role.slug}.features`);
  const hasRole = session?.user?.selectedRole === role.slug;

  const enterRole = async () => {
    if (!session) {
      setSheetOpen(true);
      return;
    }

    setContinuing(true);
    setActionError(null);
    try {
      const selectedSession = await selectRole(role.slug);
      router.replace(nextRouteForUser(selectedSession.user));
    } catch (error) {
      setActionError(error.message || t('flow.auth.errors.generic'));
    } finally {
      setContinuing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <AppHeader
        onBack={() => router.replace('/home')}
        right={
          <AppText
            accessibilityRole="button"
            onPress={() => router.replace('/home')}
            variant="label"
            color={colors.primary}
          >
            {t('home.allRoles')}
          </AppText>
        }
        showBack
        style={styles.header}
        title={title}
      />

      <ScrollView
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <AppCard padding="lg" variant="brand" style={styles.hero}>
          <View style={styles.heroOrb} />
          <View style={styles.heroIntro}>
            <View style={[styles.heroIcon, { backgroundColor: palette.surface }]}>
              <AppIcon name={role.icon} size={32} color={palette.ink} />
            </View>
            <View style={styles.heroCopy}>
              <AppText variant="h2" color={colors.inverse} style={styles.title}>
                {title}
              </AppText>
              <AppText variant="footnote" color="#CFE0D9" style={styles.description}>
                {description}
              </AppText>
            </View>
          </View>
        </AppCard>

        <View style={styles.section}>
          <AppText variant="subtitle">{t('roles.whatYouCanDo')}</AppText>
          <AppCard padding="none" variant="outlined">
            {features.map((feature, index) => (
              <View key={feature.title}>
                <ListRow
                  description={feature.description}
                  icon={featureIcons[index]}
                  title={feature.title}
                  tone={index === 1 ? 'coral' : 'mint'}
                />
                {index < features.length - 1 ? <Divider inset={spacing.lg} /> : null}
              </View>
            ))}
          </AppCard>
        </View>

        <View style={styles.actions}>
          {actionError ? <InlineAlert message={actionError} variant="error" /> : null}
          <AppButton
            fullWidth
            iconRight="arrow-right"
            loading={continuing}
            onPress={enterRole}
            size="lg"
            title={
              session
                ? t(hasRole ? 'flow.roles.continue' : 'flow.roles.enable')
                : t('roles.signupForRole', { role: title })
            }
            variant="cta"
          />
          <AppButton
            fullWidth
            onPress={() => router.replace('/home')}
            title={t('home.backToHome')}
            variant="outline"
          />
        </View>
      </ScrollView>

      <BottomSheet
        icon={role.icon}
        onClose={() => setSheetOpen(false)}
        scrollable
        subtitle={description}
        title={title}
        visible={sheetOpen}
      >
        <View style={styles.sheetBody}>
          <View style={styles.sheetActions}>
            <AppButton
              fullWidth
              onPress={() => {
                setSheetOpen(false);
                router.push({
                  pathname: '/signup',
                  params: { role: role.slug },
                });
              }}
              title={t('roles.signupForRole', { role: title })}
              variant="cta"
            />
            <AppButton
              fullWidth
              onPress={() => {
                setSheetOpen(false);
                router.push('/login');
              }}
              title={t('auth.signIn')}
              variant="outline"
            />
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  hero: {
    gap: spacing.xs,
    borderRadius: radii.xxl,
    overflow: 'hidden',
  },
  heroOrb: {
    position: 'absolute',
    top: -70,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#15503E',
  },
  heroIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    ...shadows.soft,
  },
  heroIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    letterSpacing: -0.5,
  },
  description: {
    flexShrink: 1,
  },
  section: {
    gap: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
  sheetBody: {
    gap: spacing.lg,
  },
  sheetActions: {
    gap: spacing.sm,
  },
});
