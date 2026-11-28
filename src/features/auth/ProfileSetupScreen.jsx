import { useEffect, useMemo, useState } from 'react';
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
  CategoryChip,
  ChoiceCard,
  IconButton,
  InlineAlert,
  KeyboardAwareScrollView,
  ListRow,
  ProgressBar,
  SearchBar,
  StepIndicator,
} from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import { rolesBySlug } from '../roles/roles';
import PhotoPicker from '../profile/PhotoPicker';
import {
  computeCompletion,
  locationOptions,
  serviceCategories,
  skillOptions,
} from '../profile/profileData';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, spacing } from '../../theme/tokens';

const STEP_KEYS = ['basics', 'skills', 'services', 'location', 'review'];

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ProfileSetupScreen() {
  const params = useLocalSearchParams();
  const requestedRole = firstParam(params.role);
  const roleSlug = rolesBySlug[requestedRole] ? requestedRole : null;
  const { t } = useLocale();
  const responsive = useResponsive();
  const { session, updateProfile } = useAuth();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => ({
    name: session?.user?.name || '',
    avatarUri: session?.user?.profile?.avatarUri || null,
    headline: session?.user?.profile?.headline || '',
    bio: session?.user?.profile?.bio || '',
    phone: session?.user?.profile?.phone || '',
    businessName: session?.user?.profile?.businessName || '',
    skills: session?.user?.profile?.skills || [],
    categories: session?.user?.profile?.categories || [],
    location: session?.user?.profile?.location || null,
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [skillQuery, setSkillQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');

  useEffect(() => {
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!session.user.capabilities || session.user.capabilities.length === 0) {
      router.replace('/home');
    }
  }, [session]);

  const completion = useMemo(() => computeCompletion({ profile: draft }), [draft]);

  const stepLabels = STEP_KEYS.map((key) => t(`flow.setup.steps.${key}`));

  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase();
    if (!query) {
      return skillOptions;
    }
    return skillOptions.filter((skill) => skill.toLowerCase().includes(query));
  }, [skillQuery]);

  const filteredLocations = useMemo(() => {
    const query = locationQuery.trim().toLowerCase();
    if (!query) {
      return locationOptions;
    }
    return locationOptions.filter(
      (location) =>
        location.label.toLowerCase().includes(query) ||
        location.region.toLowerCase().includes(query)
    );
  }, [locationQuery]);

  const updateField = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const toggleInList = (key, value) => {
    setDraft((current) => {
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(value)
          ? list.filter((item) => item !== value)
          : [...list, value],
      };
    });
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validateStep = () => {
    const next = {};

    if (step === 0) {
      if (draft.name.trim().length < 2) {
        next.name = t('flow.auth.errors.name');
      }
      if (draft.headline.trim().length < 5) {
        next.headline = t('flow.setup.headlineError');
      }
    }

    if (step === 1 && draft.skills.length === 0) {
      next.skills = t('flow.setup.skillError');
    }

    if (step === 2 && draft.categories.length === 0) {
      next.categories = t('flow.setup.categoryError');
    }

    if (step === 3 && !draft.location) {
      next.location = t('flow.setup.locationError');
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validateStep()) {
      return;
    }
    setStep((current) => Math.min(current + 1, STEP_KEYS.length - 1));
  };

  const goBack = () => {
    if (step === 0) {
      router.replace(roleSlug ? `/${roleSlug}` : '/home');
      return;
    }
    setStep((current) => Math.max(current - 1, 0));
  };

  const finish = async () => {
    if (saving) {
      return;
    }
    if (!validateStep()) {
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        name: draft.name.trim(),
        profile: {
          displayName: draft.name.trim(),
          avatarUri: draft.avatarUri,
          headline: draft.headline.trim(),
          bio: draft.bio.trim(),
          phone: draft.phone.trim(),
          businessName: draft.businessName.trim(),
          skills: draft.skills,
          categories: draft.categories,
          location: draft.location,
        },
      });
      router.replace('/profile');
    } catch (error) {
      setErrors((current) => ({
        ...current,
        save: error.message || t('flow.auth.errors.generic'),
      }));
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return <View style={styles.safeArea} />;
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
            { paddingHorizontal: responsive.horizontalPadding, paddingBottom: 50 },
          ]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <IconButton
              accessibilityLabel={t('common.back')}
              icon="arrow-left"
              onPress={goBack}
              size="sm"
              variant="surface"
            />
            <AppText variant="overline" color={colors.muted}>
              {t('flow.setup.step', { current: step + 1, total: STEP_KEYS.length })}
            </AppText>
            <IconButton
              accessibilityLabel={t('flow.setup.close')}
              icon="close"
              onPress={() => router.replace('/profile')}
              size="sm"
              variant="ghost"
            />
          </View>

          <StepIndicator activeIndex={step} steps={STEP_KEYS.map((key) => ({ key, label: stepLabels[STEP_KEYS.indexOf(key)] }))} />

          <View style={styles.heading}>
            <AppText variant="h1">
              {step === 0 && roleSlug
                ? t('flow.setup.roleTitle', {
                    role: t(`roles.${roleSlug}.title`),
                  })
                : t(`flow.setup.titles.${STEP_KEYS[step]}`)}
            </AppText>
            <AppText variant="body" color={colors.muted} style={styles.subtitle}>
              {t(`flow.setup.subtitles.${STEP_KEYS[step]}`)}
            </AppText>
          </View>

          {step === 0 ? (
            <View style={styles.section}>
              <AppCard padding="lg" style={styles.card} variant="outlined">
                <PhotoPicker
                  name={draft.name}
                  onChange={(uri) => updateField('avatarUri', uri)}
                  onError={(message) => setErrors((current) => ({ ...current, photo: message }))}
                  uri={draft.avatarUri}
                />
                {errors.photo ? (
                  <InlineAlert message={errors.photo} style={styles.inlineAlert} variant="warning" />
                ) : null}
              </AppCard>

              <AppInput
                autoCapitalize="words"
                error={errors.name}
                icon="account-outline"
                label={t('flow.setup.nameLabel')}
                onChangeText={(value) => updateField('name', value)}
                placeholder={t('flow.setup.namePlaceholder')}
                reserveFooterSpace={Boolean(errors.name)}
                returnKeyType="next"
                onSubmitEditing={() => {}}
                value={draft.name}
              />
              <AppInput
                error={errors.headline}
                icon="badge-account-outline"
                label={t('flow.setup.headlineLabel')}
                maxLength={60}
                onChangeText={(value) => updateField('headline', value)}
                placeholder={t('flow.setup.headlinePlaceholder')}
                reserveFooterSpace={Boolean(errors.headline)}
                returnKeyType="next"
                onSubmitEditing={() => {}}
                value={draft.headline}
              />
              <AppInput
                icon="information-outline"
                label={t('flow.setup.bioLabel')}
                maxLength={240}
                multiline
                onChangeText={(value) => updateField('bio', value)}
                placeholder={t('flow.setup.bioPlaceholder')}
                reserveFooterSpace={false}
                style={styles.bioInput}
                value={draft.bio}
              />
              <AppInput
                icon="phone-outline"
                keyboardType="phone-pad"
                label={t('flow.setup.phoneLabel')}
                onChangeText={(value) => updateField('phone', value)}
                placeholder={t('flow.setup.phonePlaceholder')}
                reserveFooterSpace={false}
                returnKeyType="next"
                onSubmitEditing={() => {}}
                value={draft.phone}
              />
              {session.user.capabilities?.includes('business') ? (
                <AppInput
                  icon="store-outline"
                  label={t('flow.setup.businessLabel')}
                  onChangeText={(value) => updateField('businessName', value)}
                  placeholder={t('flow.setup.businessPlaceholder')}
                  reserveFooterSpace={false}
                  value={draft.businessName}
                />
              ) : null}
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.section}>
              <SearchBar
                onChangeText={setSkillQuery}
                placeholder={t('flow.setup.searchSkills')}
                value={skillQuery}
              />
              <AppText variant="caption" color={colors.muted}>
                {t('flow.setup.selectedCount', { count: draft.skills.length })}
              </AppText>
              <View style={styles.chipGrid}>
                {filteredSkills.map((skill) => (
                  <CategoryChip
                    key={skill}
                    active={draft.skills.includes(skill)}
                    label={skill}
                    onPress={() => toggleInList('skills', skill)}
                  />
                ))}
              </View>
              {filteredSkills.length === 0 ? (
                <InlineAlert message={t('flow.setup.noSkills')} variant="info" />
              ) : null}
              {errors.skills ? <InlineAlert message={errors.skills} variant="error" /> : null}
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.section}>
              <AppText variant="caption" color={colors.muted}>
                {t('flow.setup.selectedCount', { count: draft.categories.length })}
              </AppText>
              <View style={styles.list}>
                {serviceCategories.map((category) => (
                  <ChoiceCard
                    key={category.id}
                    compact
                    icon={category.icon}
                    onPress={() => toggleInList('categories', category.id)}
                    selected={draft.categories.includes(category.id)}
                    title={category.label}
                    tone="mint"
                  />
                ))}
              </View>
              {errors.categories ? (
                <InlineAlert message={errors.categories} variant="error" />
              ) : null}
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.section}>
              <SearchBar
                onChangeText={setLocationQuery}
                placeholder={t('flow.setup.searchLocations')}
                value={locationQuery}
              />
              <View style={styles.list}>
                {filteredLocations.map((location) => (
                  <ChoiceCard
                    key={location.id}
                    compact
                    description={location.region}
                    icon="map-marker-outline"
                    onPress={() => updateField('location', location)}
                    selected={draft.location?.id === location.id}
                    title={location.label}
                    tone="blue"
                  />
                ))}
              </View>
              {filteredLocations.length === 0 ? (
                <InlineAlert message={t('flow.setup.noLocations')} variant="info" />
              ) : null}
              {errors.location ? (
                <InlineAlert message={errors.location} variant="error" />
              ) : null}
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.section}>
              <AppCard padding="lg" style={styles.completionCard} variant="brand">
                <View style={styles.completionHeader}>
                  <View style={styles.completionIcon}>
                    <AppIcon name="account-check-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.completionCopy}>
                    <AppText variant="overline" color="#CFE0D9">
                      {t('flow.completion.label')}
                    </AppText>
                    <AppText variant="title" color={colors.inverse}>
                      {`${completion.percent}%`}
                    </AppText>
                  </View>
                </View>
                <ProgressBar
                  label={t('flow.completion.progress')}
                  style={styles.completionBar}
                  tone="cta"
                  value={completion.percent}
                />
              </AppCard>

              <AppCard padding="none" variant="outlined">
                {completion.steps.map((item, index) => (
                  <View key={item.key}>
                    <ListRow
                      icon={item.done ? 'check-circle' : 'circle-outline'}
                      right={
                        <AppIcon
                          name={item.done ? 'check' : 'chevron-right'}
                          size={18}
                          color={item.done ? colors.success : colors.subtle}
                        />
                      }
                      title={t(item.labelKey)}
                      tone={item.done ? 'mint' : 'coral'}
                    />
                    {index < completion.steps.length - 1 ? (
                      <View style={styles.rowDivider} />
                    ) : null}
                  </View>
                ))}
              </AppCard>

              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <AppText variant="caption" color={colors.muted}>
                    {t('flow.setup.reviewSkills')}
                  </AppText>
                  <AppText variant="caption" color={colors.text} weight="700">
                    {String(draft.skills.length)}
                  </AppText>
                </View>
                <View style={styles.summaryRow}>
                  <AppText variant="caption" color={colors.muted}>
                    {t('flow.setup.reviewServices')}
                  </AppText>
                  <AppText variant="caption" color={colors.text} weight="700">
                    {String(draft.categories.length)}
                  </AppText>
                </View>
                <View style={styles.summaryRow}>
                  <AppText variant="caption" color={colors.muted}>
                    {t('flow.setup.reviewLocation')}
                  </AppText>
                  <AppText variant="caption" color={colors.text} weight="700">
                    {draft.location?.label || t('flow.setup.notSet')}
                  </AppText>
                </View>
              </View>

              <InlineAlert
                message={t('flow.setup.finishHint')}
                title={t('flow.setup.finishTitle')}
                variant="info"
              />

              {errors.save ? <InlineAlert message={errors.save} variant="error" /> : null}
            </View>
          ) : null}

          <View style={styles.actions}>
            {step > 0 ? (
              <AppButton
                onPress={goBack}
                style={styles.backButton}
                title={t('common.back')}
                variant="outline"
              />
            ) : null}
            <AppButton
              fullWidth={step === 0}
              iconRight={step === STEP_KEYS.length - 1 ? 'check' : 'arrow-right'}
              loading={saving}
              onPress={step === STEP_KEYS.length - 1 ? finish : goNext}
              size="lg"
              style={step > 0 ? styles.nextButton : undefined}
              title={
                step === STEP_KEYS.length - 1
                  ? t('flow.setup.finish')
                  : t('common.continue')
              }
              variant="cta"
            />
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    gap: spacing.xs,
  },
  subtitle: {
    maxWidth: 380,
  },
  section: {
    gap: spacing.md,
  },
  card: {
    borderRadius: radii.xl,
  },
  inlineAlert: {
    marginTop: spacing.sm,
  },
  bioInput: {
    minHeight: 104,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  completionCard: {
    borderRadius: radii.xl,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  completionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  completionCopy: {
    flex: 1,
    gap: 1,
  },
  completionBar: {
    marginTop: spacing.lg,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
    backgroundColor: colors.divider,
  },
  summary: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backButton: {
    flex: 1,
  },
  nextButton: {
    flex: 2,
  },
});
