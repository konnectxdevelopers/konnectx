import { useMemo } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppCard,
  AppHeader,
  AppIcon,
  AppSection,
  AppText,
  CategoryCard,
  Divider,
  ListRow,
} from '../../components/ui';
import { useLocale } from '../../i18n/LocaleProvider';
import { roleOptions } from '../roles/roles';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const roleVisuals = {
  customer: { tone: 'mint' },
  professional: { tone: 'coral' },
  business: { tone: 'blue' },
  hiring: { tone: 'amber' },
};

const featureIcons = ['magnify', 'tools', 'swap-horizontal'];

export default function HomeScreen() {
  const { t } = useLocale();
  const responsive = useResponsive();

  const roles = useMemo(
    () =>
      roleOptions.map((role) => ({
        ...role,
        title: t(`roles.${role.slug}.title`),
        description: t(`roles.${role.slug}.description`),
      })),
    [t]
  );

  const features = t('home.features');

  const renderRoleRow = (row, rowIndex) => (
    <View key={`row-${rowIndex}`} style={styles.gridRow}>
      {row.map((role) => (
        <CategoryCard
          key={role.slug}
          description={role.description}
          icon={role.icon}
          label={role.title}
          onPress={() => router.push(`/${role.slug}`)}
          style={styles.gridCard}
          tone={roleVisuals[role.slug]?.tone || 'mint'}
        />
      ))}
      {row.length === 1 && responsive.columns === 2 ? <View style={styles.gridFiller} /> : null}
    </View>
  );

  const rows = [];
  for (let index = 0; index < roles.length; index += responsive.columns) {
    rows.push(roles.slice(index, index + responsive.columns));
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: responsive.horizontalPadding,
            paddingBottom: spacing.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        overScrollMode="never"
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          left={
            <View style={styles.brandLockup}>
              <View style={styles.brandMark}>
                <Image
                  accessibilityLabel="KonnectX logo"
                  resizeMode="contain"
                  source={require('../../../assets/logo.png')}
                  style={styles.brandLogo}
                />
              </View>
              <View>
                <AppText variant="subtitle" color={colors.primary} style={styles.brandName}>
                  KonnectX
                </AppText>
                <AppText variant="overline" color={colors.muted} style={styles.brandCaption}>
                  {t('home.accountTypeCaption')}
                </AppText>
              </View>
            </View>
          }
          style={styles.header}
          transparent
        />

        <AppCard style={styles.hero} variant="brand">
          <View style={styles.heroOrbLarge} />
          <View style={styles.heroOrbSmall} />
          <View style={styles.heroEyebrow}>
            <View style={styles.heroDot} />
            <AppText variant="overline" color="#CFE0D9">
              {t('home.heroEyebrow')}
            </AppText>
          </View>
          <AppText variant="h2" color={colors.inverse} style={styles.heroTitle}>
            {t('home.heroTitle')}
          </AppText>
          <AppText variant="footnote" color="#CFE0D9" style={styles.heroSubtitle}>
            {t('home.heroSubtitle')}
          </AppText>

          <View style={styles.heroFooter}>
            <AppText variant="caption" color="#E4F0EB">
              {t('home.heroFootnote')}
            </AppText>
            <View style={styles.heroPill}>
              <AppText variant="overline" color="#E4F0EB">
                {t('home.paths', { count: '04' })}
              </AppText>
            </View>
          </View>
        </AppCard>

        <AppSection
          contentStyle={styles.sectionContent}
          subtitle={t('home.sectionSubtitle')}
          title={t('home.sectionTitle')}
        >
          <View style={styles.grid}>{rows.map(renderRoleRow)}</View>
        </AppSection>

        <AppSection subtitle={t('home.whySubtitle')} title={t('home.whyTitle')}>
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
        </AppSection>

        <View style={styles.trustRow}>
          <View style={styles.trustIcon}>
            <AppIcon name="shield-check-outline" size={17} color={colors.success} />
          </View>
          <AppText variant="caption" color={colors.muted} style={styles.trustText}>
            {t('home.heroFootnote')}
          </AppText>
          <View style={styles.trustDots}>
            {[0, 1, 2].map((index) => (
              <View key={index} style={[styles.trustDot, index > 0 && styles.trustDotOverlap]} />
            ))}
          </View>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
    paddingTop: spacing.xs,
    gap: spacing.xl,
  },
  header: {
    paddingHorizontal: 0,
    paddingVertical: 0,
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
  brandLogo: {
    width: 30,
    height: 30,
  },
  brandName: {
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  brandCaption: {
    marginTop: 1,
    letterSpacing: 1.1,
  },
  hero: {
    marginTop: -spacing.xs,
    padding: spacing.xl,
    borderRadius: radii.xxl,
    overflow: 'hidden',
  },
  heroOrbLarge: {
    position: 'absolute',
    top: -80,
    right: -58,
    width: 210,
    height: 210,
    borderRadius: 110,
    backgroundColor: '#15503E',
  },
  heroOrbSmall: {
    position: 'absolute',
    right: 34,
    bottom: 90,
    width: 54,
    height: 54,
    borderWidth: 1,
    borderColor: '#3C7561',
    borderRadius: 27,
  },
  heroEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.cta,
  },
  heroTitle: {
    maxWidth: 320,
    letterSpacing: -0.7,
  },
  heroSubtitle: {
    maxWidth: 320,
    marginTop: spacing.sm,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2E6653',
  },
  heroPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: '#15503E',
  },
  sectionContent: {
    gap: spacing.sm,
  },
  grid: {
    gap: spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gridCard: {
    flex: 1,
  },
  gridFiller: {
    flex: 1,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  trustIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.successSoft,
  },
  trustText: {
    flex: 1,
  },
  trustDots: {
    flexDirection: 'row',
  },
  trustDot: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.background,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
  },
  trustDotOverlap: {
    marginLeft: -8,
    backgroundColor: colors.ctaMuted,
  },
});
