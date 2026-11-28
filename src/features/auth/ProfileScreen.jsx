import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppCard,
  AppIcon,
  AppText,
  Avatar,
  Badge,
  BottomSheet,
  Divider,
  IconButton,
  ListRow,
  ProgressBar,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import { getRoleProfileCompletion } from '../profile/roleProfileDefinitions';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

export default function ProfileScreen() {
  const { t } = useLocale();
  const responsive = useResponsive();
  const { showToast } = useToast();
  const {
    session,
    user,
    signOut,
  } = useAuth();

  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!session.user.capabilities || session.user.capabilities.length === 0) {
      router.replace('/home');
    }
  }, [session]);

  const selectedRole = user.selectedRole || user.profile?.registration?.selectedRole;
  const roleProfile = user.profile?.roleProfiles?.[selectedRole]?.data || {};
  const roleRecord = (user.roles || []).find((item) =>
    typeof item === 'string' ? item === selectedRole : item.role === selectedRole
  );
  const roleCompletion = selectedRole
    ? getRoleProfileCompletion(selectedRole, roleProfile)
    : { percentage: 0 };
  const completionPercentage =
    roleRecord?.profileCompletionPercentage ?? roleCompletion.percentage;
  const profileStatus =
    roleRecord?.profileCompletionStatus || user.profile?.roleProfiles?.[selectedRole]?.status;
  const verificationStatus =
    roleRecord?.verificationStatus || user.profile?.roleProfiles?.[selectedRole]?.verificationStatus;
  const roleProfileRoute = selectedRole ? `/role-profile/${selectedRole}` : '/home';

  if (!session || !user) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.signedOut}>
          <View style={styles.signedOutIcon}>
            <AppIcon name="account-circle-outline" size={34} color={colors.primary} />
          </View>
          <AppText variant="h1" align="center">
            {t('flow.profile.signedOutTitle')}
          </AppText>
          <AppText variant="body" color={colors.muted} align="center">
            {t('flow.profile.signedOutSubtitle')}
          </AppText>
          <View style={styles.signedOutActions}>
            <AppButton
              fullWidth
              onPress={() => router.push('/login')}
              size="lg"
              title={t('auth.signIn')}
              variant="cta"
            />
            <AppButton
              fullWidth
              onPress={() => router.push('/signup')}
              title={t('home.createAccount')}
              variant="outline"
            />
            <AppButton
              fullWidth
              onPress={() => router.replace('/home')}
              title={t('home.backToHome')}
              variant="ghost"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const performSignOut = async () => {
    setConfirmOpen(false);
    await signOut();
    router.replace('/welcome');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScrollView
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        contentInsetAdjustmentBehavior="never"
        overScrollMode="never"
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <IconButton
            accessibilityLabel={t('home.backToHome')}
            icon="arrow-left"
            onPress={() => router.replace('/home')}
            size="sm"
            variant="surface"
          />
          <AppText variant="overline" color={colors.muted}>
            {t('home.accountTab')}
          </AppText>
          <IconButton
            accessibilityLabel={t('flow.profile.settings')}
            icon="cog-outline"
            onPress={() =>
              showToast({
                title: t('flow.profile.settings'),
                message: t('home.comingSoon'),
                variant: 'info',
              })
            }
            size="sm"
            variant="ghost"
          />
        </View>

        <AppCard style={styles.hero} variant="brand">
          <View style={styles.heroOrb} />
          <View style={styles.heroTop}>
            <Avatar
              name={user.name}
              ring
              size="lg"
              source={user.profile?.avatarUri ? { uri: user.profile.avatarUri } : undefined}
            />
            <View style={styles.heroIdentity}>
              <AppText variant="subtitle" color={colors.inverse} numberOfLines={1}>
                {user.name}
              </AppText>
              <AppText variant="caption" color="#CFE0D9" numberOfLines={1}>
                {user.email}
              </AppText>
            </View>
            <Badge
              label={user.emailVerified ? t('flow.profile.verified') : t('flow.profile.unverified')}
              tone={user.emailVerified ? 'success' : 'warning'}
            />
          </View>

          {user.profile?.headline ? (
            <AppText variant="body" color="#E4F0EB" style={styles.heroHeadline}>
              {user.profile.headline}
            </AppText>
          ) : null}

          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}>
              <AppIcon name="map-marker-outline" size={15} color="#CFE0D9" />
              <AppText variant="caption" color="#CFE0D9">
                {user.profile?.location?.label || t('flow.profile.noLocation')}
              </AppText>
            </View>
            <View style={styles.heroMetaItem}>
              <AppIcon name="briefcase-outline" size={15} color="#CFE0D9" />
              <AppText variant="caption" color="#CFE0D9">
                {selectedRole ? t(`roles.${selectedRole}.title`) : t('flow.profile.accountTypes')}
              </AppText>
            </View>
          </View>

          <AppButton
            fullWidth
            icon="account-edit-outline"
            onPress={() => router.push(roleProfileRoute)}
            style={styles.editButton}
            title={t('flow.profile.edit')}
            variant="cta"
          />
        </AppCard>

        <AppCard padding="lg" style={styles.card} variant="outlined">
          <View style={styles.completionHeader}>
            <View style={styles.sectionCopy}>
              <AppText variant="subtitle">{t('flow.completion.title')}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {t('flow.completion.subtitle')}
              </AppText>
            </View>
            <AppText variant="title" color={colors.primary}>
              {`${completionPercentage}%`}
            </AppText>
          </View>
          <ProgressBar style={styles.progress} value={completionPercentage} />
          <AppText variant="caption" color={colors.muted}>
            {verificationStatus === 'pending'
              ? 'Your profile is pending verification.'
              : profileStatus === 'complete'
                ? 'Your required profile details are complete.'
                : 'Complete and save the required profile details to continue.'}
          </AppText>
          {profileStatus !== 'complete' ? (
            <AppButton
              fullWidth
              iconRight="arrow-right"
              onPress={() => router.push(roleProfileRoute)}
              size="sm"
              style={styles.completionAction}
              title={t('flow.completion.finish')}
              variant="secondary"
            />
          ) : null}
        </AppCard>

        <AppCard padding="lg" style={styles.card} variant="outlined">
          <AppText variant="subtitle">{t('flow.profile.accountTypes')}</AppText>
          <AppText variant="caption" color={colors.muted}>
            Choose Customer, Professional, Business, or Hiring. Your saved profiles stay on this account.
          </AppText>
          <AppButton
            fullWidth
            onPress={() => router.replace('/home')}
            style={styles.completionAction}
            title="Select account type"
            variant="outline"
          />
        </AppCard>

        <AppCard padding="none" variant="outlined">
          <ListRow
            chevron
            description={t('flow.profile.bookingsHint')}
            icon="calendar-check-outline"
            onPress={() =>
              showToast({ title: t('home.bookingsTab'), message: t('home.comingSoon'), variant: 'info' })
            }
            title={t('flow.profile.bookings')}
          />
          <Divider inset={spacing.lg} />
          <ListRow
            chevron
            description={t('flow.profile.helpHint')}
            icon="lifebuoy"
            onPress={() =>
              showToast({ title: t('flow.profile.help'), message: t('home.comingSoon'), variant: 'info' })
            }
            title={t('flow.profile.help')}
          />
        </AppCard>

        <AppButton
          fullWidth
          icon="logout"
          onPress={() => setConfirmOpen(true)}
          size="lg"
          title={t('flow.profile.signOut')}
          variant="danger"
        />

        <AppText variant="caption" color={colors.subtle} align="center">
          {t('flow.profile.synced')}
        </AppText>
      </ScrollView>

      <BottomSheet
        icon="logout"
        onClose={() => setConfirmOpen(false)}
        subtitle={t('flow.profile.signOutHint')}
        title={t('flow.profile.signOut')}
        visible={confirmOpen}
      >
        <View style={styles.sheetActions}>
          <AppButton
            fullWidth
            onPress={performSignOut}
            size="lg"
            title={t('flow.profile.signOutConfirm')}
            variant="danger"
          />
          <AppButton
            fullWidth
            onPress={() => setConfirmOpen(false)}
            title={t('common.cancel')}
            variant="outline"
          />
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
  scroll: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signedOut: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  signedOutIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
  },
  signedOutActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  hero: {
    overflow: 'hidden',
    borderRadius: radii.xxl,
    ...shadows.brand,
  },
  heroOrb: {
    position: 'absolute',
    top: -80,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#15503E',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIdentity: {
    flex: 1,
    gap: 1,
  },
  heroHeadline: {
    marginTop: spacing.md,
  },
  heroMeta: {
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2E6653',
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editButton: {
    marginTop: spacing.lg,
  },
  card: {
    borderRadius: radii.xl,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  sectionCopy: {
    flex: 1,
    gap: 1,
  },
  progress: {
    marginTop: spacing.md,
  },
  checklist: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkLabel: {
    flex: 1,
  },
  completionAction: {
    marginTop: spacing.md,
  },
  modeSubtitle: {
    marginTop: 2,
  },
  modeSwitch: {
    marginTop: spacing.md,
  },
  modeHint: {
    marginTop: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  typeList: {
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  capabilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  sheetActions: {
    gap: spacing.sm,
  },
});
