import { useEffect } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppCard,
  AppText,
  Badge,
  Divider,
  ListRow,
} from '../../components/ui';
import { nextRouteForUser, useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const benefits = [
  { icon: 'account-switch-outline', tone: 'mint' },
  { icon: 'briefcase-outline', tone: 'coral' },
  { icon: 'shield-check-outline', tone: 'mint' },
];

export default function WelcomeScreen() {
  const { t } = useLocale();
  const responsive = useResponsive();
  const { session } = useAuth();
  const compactLayout = responsive.height < 760;

  useEffect(() => {
    if (!session) {
      router.prefetch('/login');
      router.prefetch('/signup');
    }
  }, [session]);

  const start = () => {
    if (session) {
      router.replace(nextRouteForUser(session.user));
      return;
    }
    router.push('/signup');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        alwaysBounceVertical={false}
        automaticallyAdjustContentInsets={false}
        bounces={false}
        contentContainerStyle={[
          styles.content,
          compactLayout && styles.contentCompact,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        contentInsetAdjustmentBehavior="never"
        overScrollMode="never"
        scrollEnabled={false}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <Image
                accessibilityLabel="KonnectX logo"
                resizeMode="contain"
                source={require('../../../assets/logo.png')}
                style={styles.logo}
              />
            </View>
            <View>
              <AppText variant="subtitle" color={colors.primary} style={styles.brandName}>
                KonnectX
              </AppText>
              <AppText variant="overline" color={colors.muted}>
                {t('home.brandCaption')}
              </AppText>
            </View>
          </View>
          <AppText
            accessibilityRole="button"
            onPress={() => router.push('/language')}
            variant="label"
            color={colors.primary}
          >
            {t('flow.welcome.language')}
          </AppText>
        </View>

        <AppCard padding={compactLayout ? 'md' : 'lg'} style={styles.hero} variant="brand">
          <View style={styles.heroOrb} />
          <View style={styles.heroOrbSmall} />
          <Badge label={t('home.heroEyebrow')} style={styles.heroBadge} tone="cta" />
          <AppText
            variant={compactLayout ? 'h2' : 'h1'}
            color={colors.inverse}
            style={[styles.heroTitle, compactLayout && styles.heroTitleCompact]}
          >
            {t('flow.welcome.title')}
          </AppText>
          <AppText
            variant="body"
            color="#CFE0D9"
            style={[styles.heroSubtitle, compactLayout && styles.heroSubtitleCompact]}
          >
            {t('flow.welcome.subtitle')}
          </AppText>

          <View style={[styles.heroFooter, compactLayout && styles.heroFooterCompact]}>
            <View style={styles.avatars}>
              {[colors.primaryMuted, colors.ctaMuted, '#BFD8E8'].map((tone, index) => (
                <View
                  key={tone}
                  style={[
                    styles.avatarDot,
                    { backgroundColor: tone, marginLeft: index > 0 ? -9 : 0 },
                  ]}
                />
              ))}
            </View>
            <AppText variant="caption" color="#CFE0D9" style={styles.heroFootnote}>
              {t('home.heroFootnote')}
            </AppText>
          </View>
        </AppCard>

        <AppCard padding="none" variant="outlined">
          {benefits.map((benefit, index) => (
            <View key={benefit.icon}>
              <ListRow
                description={t(`flow.welcome.benefits.${index + 1}.description`)}
                icon={benefit.icon}
                title={t(`flow.welcome.benefits.${index + 1}.title`)}
                tone={benefit.tone}
              />
              {index < benefits.length - 1 ? <Divider inset={spacing.lg} /> : null}
            </View>
          ))}
        </AppCard>

        <View style={styles.actions}>
          <AppButton
            fullWidth
            iconRight="arrow-right"
            onPress={start}
            scaleTo={1}
            size="lg"
            title={session ? t('flow.welcome.continue') : t('flow.welcome.getStarted')}
            variant="cta"
          />
          {!session ? (
            <AppButton
              fullWidth
              onPress={() => router.push('/login')}
              scaleTo={1}
              title={t('flow.welcome.haveAccount')}
              variant="outline"
            />
          ) : null}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  contentCompact: {
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  logo: {
    width: 30,
    height: 30,
  },
  brandName: {
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hero: {
    overflow: 'hidden',
    borderRadius: radii.xxl,
  },
  heroOrb: {
    position: 'absolute',
    top: -90,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#15503E',
  },
  heroOrbSmall: {
    position: 'absolute',
    right: 40,
    bottom: 70,
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: '#3C7561',
    borderRadius: 26,
  },
  heroBadge: {
    alignSelf: 'flex-start',
  },
  heroTitle: {
    marginTop: spacing.lg,
    maxWidth: 320,
    letterSpacing: -0.8,
  },
  heroTitleCompact: {
    marginTop: spacing.md,
  },
  heroSubtitle: {
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  heroSubtitleCompact: {
    marginTop: spacing.xs,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2E6653',
  },
  heroFooterCompact: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  avatars: {
    flexDirection: 'row',
  },
  avatarDot: {
    width: 26,
    height: 26,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 13,
  },
  heroFootnote: {
    flex: 1,
  },
  actions: {
    gap: spacing.sm,
  },
});
