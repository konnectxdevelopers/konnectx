import { useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppIcon,
  AppPressable,
  AppText,
  InlineAlert,
} from '../../components/ui';
import { useLocale } from '../../i18n/LocaleProvider';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';
import { supportedLanguages } from '../../i18n/translations';

export default function LanguageSelectionScreen() {
  const { language, setLanguage, t, loadError } = useLocale();
  const responsive = useResponsive();
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const languageNames = t('language.names');

  const selectLanguage = async (nextLanguage) => {
    if (saving) {
      return;
    }

    setSelectedLanguage(nextLanguage);
    setError(null);
    setSaving(true);
    try {
      await setLanguage(nextLanguage);
    } catch {
      setSelectedLanguage(language);
      setError(t('language.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const continueToHome = async () => {
    if (saving) {
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await setLanguage(selectedLanguage);
      router.replace('/welcome');
    } catch {
      setError(t('language.saveError'));
    } finally {
      setSaving(false);
    }
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
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <Image
                accessibilityLabel="KonnectX logo"
                resizeMode="contain"
                source={require('../../../assets/logo.png')}
                style={styles.brandLogo}
              />
            </View>
            <AppText variant="subtitle" color={colors.primary} style={styles.brand}>
              KonnectX
            </AppText>
          </View>
          <View style={styles.stepPill}>
            <AppIcon name="translate" size={14} color={colors.primary} />
            <AppText variant="caption" color={colors.primary} style={styles.stepText}>
              {selectedLanguage.toUpperCase()}
            </AppText>
          </View>
        </View>

        <View style={styles.heading}>
          <View style={styles.headingIcon}>
            <AppIcon name="translate" size={25} color={colors.primary} />
          </View>
          <AppText variant="h1" align="center" style={styles.title}>
            {t('language.title')}
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={styles.subtitle}>
            {t('language.subtitle')}
          </AppText>
        </View>

        <View style={styles.languageList}>
          {supportedLanguages.map((option) => {
            const selected = selectedLanguage === option;
            return (
              <AppPressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: saving }}
                disabled={saving}
                onPress={() => selectLanguage(option)}
                scaleTo={0.985}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <View style={[styles.languageCode, selected && styles.languageCodeSelected]}>
                  <AppText
                    variant="caption"
                    color={selected ? colors.inverse : colors.primary}
                    style={styles.languageCodeText}
                  >
                    {option.toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.languageCopy}>
                  <AppText variant="bodyStrong" color={colors.text}>
                    {languageNames[option]}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {t(`language.continueIn.${option}`)}
                  </AppText>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? (
                    <AppIcon name="check" size={14} color={colors.inverse} />
                  ) : null}
                </View>
              </AppPressable>
            );
          })}
        </View>

        <View style={styles.notice}>
          <View style={styles.noticeIcon}>
            <AppIcon name="shield-check-outline" size={19} color={colors.inverse} />
          </View>
          <AppText variant="caption" color="#D8E7E1" style={styles.noticeText}>
            {t('language.notice')}
          </AppText>
        </View>

        {loadError ? (
          <InlineAlert message={t(loadError)} style={styles.alert} variant="warning" />
        ) : null}
        {error ? <InlineAlert message={error} style={styles.alert} variant="error" /> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingHorizontal: responsive.horizontalPadding }]}>
        <AppButton
          fullWidth
          iconRight="arrow-right"
          loading={saving}
          onPress={continueToHome}
          size="lg"
          title={t('common.continue')}
          variant="cta"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandMark: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  brandLogo: {
    width: 27,
    height: 27,
  },
  brand: {
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  stepText: {
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heading: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headingIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
  },
  title: {
    maxWidth: 320,
  },
  subtitle: {
    maxWidth: 310,
    marginTop: spacing.xs,
  },
  languageList: {
    gap: spacing.sm,
  },
  option: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  languageCode: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  languageCodeSelected: {
    backgroundColor: colors.primary,
  },
  languageCodeText: {
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  languageCopy: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  noticeIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: '#15503E',
  },
  noticeText: {
    flex: 1,
    lineHeight: 18,
  },
  alert: {
    marginTop: spacing.md,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
});
