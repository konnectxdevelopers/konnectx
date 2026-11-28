import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AppHeader,
  AppIcon,
  AppInput,
  AppText,
  CategoryChip,
  ChoiceCard,
  KeyboardAwareScrollView,
  InlineAlert,
  ProgressBar,
  StepIndicator,
} from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { rolesBySlug } from '../roles/roles';
import {
  createInitialRoleProfile,
  getRoleProfileCompletion,
  getRoleSteps,
  profileFieldComplete,
} from './roleProfileDefinitions';
import {
  getMediaUrlRequest,
  getRoleProfileRequest,
  saveRoleProfileRequest,
} from '../../services/profiles/roleProfileService';
import PhotoPicker from './PhotoPicker';
import AssetPicker from './AssetPicker';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, spacing } from '../../theme/tokens';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function displayValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (value && typeof value === 'object') {
    return value.name || (value.previewUri ? 'Image selected' : 'File selected');
  }
  return String(value);
}

function ChoiceField({ field, value, error, onChange }) {
  return (
    <View style={styles.fieldGroup}>
      <AppText variant="label" color={colors.textSecondary}>
        {field.label}{field.required ? ' *' : ''}
      </AppText>
      <View style={styles.choiceList}>
        {field.options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          return (
            <ChoiceCard
              key={optionValue}
              compact
              onPress={() => onChange(optionValue)}
              selected={value === optionValue}
              title={optionLabel}
              tone="mint"
            />
          );
        })}
      </View>
      {error ? <InlineAlert message={error} variant="error" /> : null}
    </View>
  );
}

function MultiField({ field, value = [], error, onToggle }) {
  return (
    <View style={styles.fieldGroup}>
      <AppText variant="label" color={colors.textSecondary}>
        {field.label}{field.required ? ' *' : ''}
      </AppText>
      <View style={styles.chipGrid}>
        {field.options.map((option) => (
          <CategoryChip
            key={option}
            active={value.includes(option)}
            label={option}
            onPress={() => onToggle(option)}
          />
        ))}
      </View>
      {error ? <InlineAlert message={error} variant="error" /> : null}
    </View>
  );
}

function ProfileField({
  field,
  value,
  error,
  name,
  onChange,
  onError,
  onContinue,
  isLastStep,
  autoFocus,
  inputRef,
  onFocus,
}) {
  const visibleError =
    profileFieldComplete(value) && error?.endsWith(' is required.') ? undefined : error;

  if (field.type === 'select') {
    return (
      <ChoiceField
        error={visibleError}
        field={field}
        onChange={onChange}
        value={value}
      />
    );
  }
  if (field.type === 'multi') {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <MultiField
        error={visibleError}
        field={field}
        onToggle={(item) =>
          onChange(
            selectedValues.includes(item)
              ? selectedValues.filter((entry) => entry !== item)
              : [...selectedValues, item]
          )
        }
        value={selectedValues}
      />
    );
  }
  if (field.type === 'photo') {
    const photoUri = typeof value === 'string' ? value : value?.previewUri || value?.uri || null;
    return (
      <View style={styles.fieldGroup}>
        <AppText variant="label" color={colors.textSecondary}>
          {field.label}{field.required ? ' *' : ''}
        </AppText>
        <AppCard padding="md" variant="outlined">
          <PhotoPicker
            name={name}
            onChange={onChange}
            onError={onError}
            uri={photoUri}
          />
        </AppCard>
        {visibleError ? <InlineAlert message={visibleError} variant="error" /> : null}
      </View>
    );
  }
  if (field.type === 'file') {
    return (
      <View style={styles.fieldGroup}>
        <AppText variant="label" color={colors.textSecondary}>
          {field.label}{field.required ? ' *' : ''}
        </AppText>
        <AppCard padding="md" variant="outlined">
          <AssetPicker
            accept={field.accept}
            label={field.uploadLabel || 'Choose file'}
            onChange={onChange}
            onError={onError}
            value={value}
          />
        </AppCard>
        {visibleError ? <InlineAlert message={visibleError} variant="error" /> : null}
      </View>
    );
  }

  const keyboardType = {
    email: 'email-address',
    phone: 'phone-pad',
    number: 'decimal-pad',
    url: 'url',
  }[field.type] || (field.keyboardType === 'numeric' ? 'number-pad' : 'default');
  return (
    <AppInput
      ref={inputRef}
      autoCapitalize={field.type === 'email' || field.type === 'url' ? 'none' : 'sentences'}
      error={visibleError}
      keyboardType={keyboardType}
      label={`${field.label}${field.required ? ' *' : ''}`}
      multiline={field.type === 'textarea'}
      autoFocus={autoFocus}
      onChangeText={onChange}
      onFocus={onFocus}
      onSubmitEditing={
        field.type === 'textarea' || !onContinue
          ? undefined
          : () => onContinue()
      }
      placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
      reserveFooterSpace={Boolean(visibleError)}
      returnKeyType={
        field.type === 'textarea' ? undefined : isLastStep ? 'done' : 'next'
      }
      value={value == null ? '' : String(value)}
    />
  );
}

export default function RoleProfileSetupScreen() {
  const params = useLocalSearchParams();
  const role = firstParam(params.role);
  const roleInfo = rolesBySlug[role];
  const responsive = useResponsive();
  const { session, ready, selectRole, refreshUser } = useAuth();
  const sessionRef = useRef(session);
  const actionsRef = useRef({ selectRole, refreshUser });

  const [draft, setDraft] = useState(() => createInitialRoleProfile(role, session?.user));
  const draftRef = useRef(draft);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoFocusFieldKey, setAutoFocusFieldKey] = useState(null);
  const draftSaveQueueRef = useRef(Promise.resolve());
  const inputRefsRef = useRef({});

  const steps = useMemo(
    () => {
      const roleSteps = getRoleSteps(role, draft);
      const sections = roleSteps.filter(
        (section) => section.key !== 'review' && section.fields.length > 0
      );
      const reviewStep = roleSteps.find((section) => section.key === 'review') || {
        key: 'review',
        title: 'Review and complete',
        fields: [],
      };
      if (
        role === 'professional' ||
        (role === 'hiring' && (!draft.hiringAs || draft.hiringAs === 'organization'))
      ) {
        return [
          ...sections.map((section) => ({ ...section, sections: [section] })),
          reviewStep,
        ];
      }
      return [
        {
          key: 'profile',
          title: 'Profile details',
          fields: sections.flatMap((section) => section.fields),
          sections,
        },
        reviewStep,
      ];
    },
    [role, draft]
  );
  const step = steps[stepIndex] || steps[0];
  const completion = useMemo(
    () => getRoleProfileCompletion(role, draft),
    [role, draft]
  );

  const replaceDraft = useCallback((nextDraft) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    actionsRef.current = { selectRole, refreshUser };
  }, [refreshUser, selectRole, session]);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      if (!ready) {
        return;
      }
      if (!sessionRef.current || !roleInfo) {
        if (active) {
          setLoading(false);
          router.replace(sessionRef.current ? '/home' : '/welcome');
        }
        return;
      }

      setLoading(true);
      setFormError(null);
      try {
        let currentSession = sessionRef.current;
        if (currentSession.user.selectedRole !== role) {
          currentSession = await actionsRef.current.selectRole(role);
        }
        const record = await getRoleProfileRequest(currentSession, role);
        const loadedProfile = {
          ...createInitialRoleProfile(role, currentSession.user),
          ...(record.profile || {}),
        };
        if (role === 'customer') {
          delete loadedProfile.preferredCategories;
        }
        const mediaFields = [
          'profilePhoto',
          'businessLogo',
          'coverImage',
          'companyLogo',
          'projectImage',
        ];
        for (const key of mediaFields) {
          const asset = loadedProfile[key];
          if (asset?.id && !asset.previewUri) {
            try {
              loadedProfile[key] = {
                ...asset,
                previewUri: await getMediaUrlRequest(currentSession, asset.id),
              };
            } catch (error) {
              console.warn(`Unable to load the saved ${key}.`, error);
            }
          }
        }
        if (active) {
          replaceDraft(loadedProfile);
        }
      } catch (error) {
        if (active) {
          setFormError(error.message || 'Unable to load your saved profile.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [ready, replaceDraft, role, roleInfo]);

  useEffect(() => {
    if (ready && !session) {
      router.replace('/login');
    }
  }, [ready, session]);

  useEffect(() => {
    if (autoFocusFieldKey) {
      inputRefsRef.current[autoFocusFieldKey]?.focus();
    }
  }, [autoFocusFieldKey, stepIndex]);

  const updateField = (key, value) => {
    replaceDraft({ ...draftRef.current, [key]: value });
    setErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
    setFormError(null);
  };

  const validateStep = (profile = draftRef.current) => {
    const nextErrors = {};
    for (const field of step?.fields || []) {
      if (field.required && !profileFieldComplete(profile[field.key])) {
        nextErrors[field.key] = `${field.label} is required.`;
      } else if (
        field.type === 'email' &&
        profileFieldComplete(profile[field.key]) &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(profile[field.key]).trim())
      ) {
        nextErrors[field.key] = 'Enter a valid email address.';
      } else if (
        field.type === 'phone' &&
        profileFieldComplete(profile[field.key]) &&
        (!/^\+?[0-9\s().-]{7,32}$/.test(String(profile[field.key]).trim()) ||
          String(profile[field.key]).replace(/\D/g, '').length < 7 ||
          String(profile[field.key]).replace(/\D/g, '').length > 15)
      ) {
        nextErrors[field.key] = 'Enter a valid phone number.';
      }
    }
    setErrors(nextErrors);
    const firstInvalidField = step?.fields.find((field) => nextErrors[field.key]);
    if (firstInvalidField) {
      setFormError(`${firstInvalidField.label}: ${nextErrors[firstInvalidField.key]}`);
      setAutoFocusFieldKey(firstInvalidField.key);
      inputRefsRef.current[firstInvalidField.key]?.focus();
      return false;
    }
    return true;
  };

  const saveDraft = async (submit = false, profile = draftRef.current) => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      throw new Error('Sign in to save your profile.');
    }
    return saveRoleProfileRequest(currentSession, role, profile, { submit });
  };

  const queueDraftSave = (profile) => {
    const save = draftSaveQueueRef.current.then(() => saveDraft(false, profile));
    draftSaveQueueRef.current = save.catch(() => {});
    save
      .then((saved) => {
        if (saved.profile) {
          const currentProfile = draftRef.current;
          const nextProfile = { ...currentProfile };
          let changed = false;
          for (const [key, value] of Object.entries(profile)) {
            if (currentProfile[key] === value && saved.profile[key] !== value) {
              nextProfile[key] = saved.profile[key];
              changed = true;
            }
          }
          if (changed) {
            replaceDraft(nextProfile);
          }
        }
        setFormError((current) =>
          current?.startsWith('Your latest changes could not be saved online.')
            ? null
            : current
        );
      })
      .catch((error) => {
        setFormError(
          `Your latest changes could not be saved online. ${
            error.message || 'Try again before leaving this profile.'
          }`
        );
      });
  };

  const continueStep = (profile = draftRef.current, { focusNext = false } = {}) => {
    if (saving) {
      return;
    }
    if (!validateStep(profile)) {
      return;
    }
    setFormError(null);
    queueDraftSave(profile);
    const nextStepIndex = Math.min(stepIndex + 1, steps.length - 1);
    setStepIndex(nextStepIndex);
    const nextField = steps[nextStepIndex]?.fields?.[0];
    const nextFieldAcceptsKeyboardFocus = [
      'text',
      'number',
      'textarea',
      'email',
      'phone',
      'url',
    ].includes(nextField?.type);
    setAutoFocusFieldKey(
      focusNext && nextFieldAcceptsKeyboardFocus
        ? nextField.key
        : null
    );
  };

  const saveForLater = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await draftSaveQueueRef.current;
      await saveDraft(false, draftRef.current);
      router.replace('/home');
    } catch (error) {
      setFormError(error.message || 'Your changes could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const finishProfile = async (profile = draftRef.current) => {
    if (saving || !validateStep(profile)) {
      return;
    }
    const currentCompletion = getRoleProfileCompletion(role, profile);
    if (!currentCompletion.complete) {
      const missingField = currentCompletion.missing[0];
      if (missingField) {
        const missingStep = steps.findIndex((item) =>
          item.fields.some((field) => field.key === missingField)
        );
        if (missingStep >= 0) {
          setStepIndex(missingStep);
        }
        setAutoFocusFieldKey(missingField);
      }
      setFormError('Complete the required fields before submitting your profile.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await draftSaveQueueRef.current;
      const saved = await saveDraft(true, draftRef.current);
      if (saved.status !== 'complete') {
        throw new Error('The server did not mark this profile as complete.');
      }
      await actionsRef.current.refreshUser();
      router.replace(`/dashboard/${role}`);
    } catch (error) {
      const missing = error.details?.missing || [];
      const firstMissing = missing[0];
      if (firstMissing) {
        const missingStep = steps.findIndex((item) =>
          item.fields.some((field) => field.key === firstMissing)
        );
        if (missingStep >= 0) {
          setStepIndex(missingStep);
        }
        setAutoFocusFieldKey(firstMissing);
      }
      setFormError(error.message || 'Your profile could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (stepIndex === 0) {
      router.replace('/home');
      return;
    }
    setStepIndex((current) => current - 1);
    setFormError(null);
  };

  const updateProfileField = (field, value) => updateField(field.key, value);

  if (!ready || !roleInfo || !session) {
    return <View style={styles.safeArea} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View
          style={[
            styles.topContent,
            { paddingHorizontal: responsive.horizontalPadding },
          ]}
        >
          <AppHeader
            onBack={goBack}
            right={
              <AppText
                accessibilityRole="button"
                color={colors.primary}
                onPress={saveForLater}
                variant="label"
              >
                Save for later
              </AppText>
            }
            showBack
            title={role === 'hiring' && draft.hiringAs === 'organization'
              ? 'Agency profile'
              : `${roleInfo.title} profile`}
          />
          {!loading ? (
            <View style={styles.progressWrap}>
              <StepIndicator
                activeIndex={stepIndex}
                steps={steps.map((item) => ({ key: item.key, label: item.title }))}
              />
              <ProgressBar
                label="Profile completion"
                value={completion.percentage}
              />
            </View>
          ) : null}
        </View>
        <KeyboardAwareScrollView
          key={`${role}-${step?.key}-${
            role === 'hiring' ? draft.hiringAs || 'unselected' : 'profile'
          }`}
          alwaysBounceVertical={false}
          bounces={false}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: responsive.horizontalPadding, paddingBottom: 50 },
          ]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loading}>
              <AppIcon name="progress-clock" size={28} color={colors.primary} />
              <AppText color={colors.muted} variant="body">
                Loading your saved profile…
              </AppText>
            </View>
          ) : (
            <>
              <View style={styles.heading}>
                <AppText variant="h1">{step?.title}</AppText>
                <AppText color={colors.muted} variant="body">
                  {stepIndex === steps.length - 1
                    ? 'Review your saved details before completing this profile.'
                    : 'Complete the fields below. Use Next on your keyboard to move between inputs; the form scrolls as you go. Fields marked with * are required.'}
                </AppText>
              </View>

              <AppCard padding="lg" style={styles.formCard} variant="outlined">
                {step?.key === 'review' ? (
                  <View style={styles.reviewList}>
                    {(steps || [])
                      .filter((item) => item.key !== 'review')
                      .flatMap((item) =>
                        item.fields
                          .filter((field) => profileFieldComplete(draft[field.key]))
                          .map((field) => ({ ...field, value: draft[field.key] }))
                      )
                      .map((field) => (
                        <View key={field.key} style={styles.reviewRow}>
                          <AppText color={colors.muted} variant="caption">
                            {field.label}
                          </AppText>
                          <AppText variant="body">
                            {displayValue(field.value)}
                          </AppText>
                        </View>
                      ))}
                    <View style={styles.reviewRow}>
                      <AppText color={colors.muted} variant="caption">
                        Verification
                      </AppText>
                      <AppText variant="body">
                        {completion.complete ? 'Required details complete' : 'More information required'}
                      </AppText>
                    </View>
                  </View>
                ) : (
                  <View style={styles.fields}>
                    {step?.sections?.map((section) => (
                      <View key={section.key} style={styles.fieldSection}>
                        <AppText color={colors.text} variant="label" weight="700">
                          {section.title}
                        </AppText>
                        {section.fields.map((field) => (
                          <ProfileField
                            key={field.key}
                            error={errors[field.key]}
                            field={field}
                            isLastStep={stepIndex === steps.length - 1}
                            autoFocus={autoFocusFieldKey === field.key}
                            inputRef={(input) => {
                              if (input) {
                                inputRefsRef.current[field.key] = input;
                              } else {
                                delete inputRefsRef.current[field.key];
                              }
                            }}
                            name={draft.fullName || session.user.name}
                            onChange={(value) => updateProfileField(field, value)}
                            onContinue={
                              field.key === step.fields[step.fields.length - 1]?.key
                                ? () => continueStep()
                                : undefined
                            }
                            onFocus={() => {
                              if (autoFocusFieldKey === field.key) {
                                setAutoFocusFieldKey(null);
                              }
                            }}
                            onError={(message) =>
                              setErrors((current) => ({ ...current, [field.key]: message }))
                            }
                            value={draft[field.key]}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </AppCard>

            </>
          )}
        </KeyboardAwareScrollView>
        {!loading ? (
          <View style={[styles.footer, { paddingHorizontal: responsive.horizontalPadding }]}>
            {formError ? <InlineAlert message={formError} variant="error" /> : null}
            <AppButton
              fullWidth
              iconRight={stepIndex === steps.length - 1 ? 'check' : 'arrow-right'}
              loading={saving}
              onPress={
                stepIndex === steps.length - 1
                  ? () => finishProfile()
                  : () => continueStep()
              }
              scaleTo={1}
              size="lg"
              title={stepIndex === steps.length - 1 ? 'Complete profile' : 'Continue'}
              variant="cta"
            />
          </View>
        ) : null}
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
  scroll: {
    flex: 1,
  },
  topContent: {
    gap: spacing.lg,
    paddingTop: spacing.xs,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  progressWrap: {
    gap: spacing.md,
  },
  heading: {
    gap: spacing.xs,
  },
  formCard: {
    borderRadius: radii.xl,
  },
  fields: {
    gap: spacing.md,
  },
  fieldSection: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  choiceList: {
    gap: spacing.xs,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  reviewList: {
    gap: spacing.md,
  },
  reviewRow: {
    gap: spacing.xxs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
});
