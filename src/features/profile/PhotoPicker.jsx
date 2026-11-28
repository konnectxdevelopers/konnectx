import * as ImagePicker from 'expo-image-picker';
import { StyleSheet, View } from 'react-native';
import {
  AppButton,
  AppIcon,
  AppPressable,
  AppText,
  Avatar,
} from '../../components/ui';
import { useLocale } from '../../i18n/LocaleProvider';
import { colors, radii, spacing } from '../../theme/tokens';

const PICKER_OPTIONS = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

/**
 * Profile photo UI. The picked image stays on the device: no upload happens
 * until a storage endpoint is configured, and the screen says so explicitly.
 */
export default function PhotoPicker({ uri, name, onChange, onError }) {
  const { t } = useLocale();

  const pick = async (source) => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        onError?.(t('flow.profile.photoPermission'));
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);

      if (!result.canceled && result.assets?.[0]?.uri) {
        onChange?.(result.assets[0].uri);
      }
    } catch (error) {
      console.warn('Unable to pick a profile photo.', error);
      onError?.(t('flow.profile.photoError'));
    }
  };

  return (
    <View style={styles.wrap}>
      <AppPressable
        accessibilityLabel={t('flow.profile.changePhoto')}
        accessibilityRole="button"
        onPress={() => pick('library')}
        scaleTo={0.96}
        style={styles.avatarWrap}
      >
        <Avatar
          name={name || 'KonnectX'}
          ring
          size="xl"
          source={uri ? { uri } : undefined}
        />
        <View style={styles.badge}>
          <AppIcon name="camera-outline" size={14} color={colors.inverse} />
        </View>
      </AppPressable>

      <View style={styles.copy}>
        <AppText variant="bodyStrong">{t('flow.profile.photoTitle')}</AppText>
        <AppText variant="caption" color={colors.muted} style={styles.hint}>
          {uri ? t('flow.profile.photoLocalHint') : t('flow.profile.photoHint')}
        </AppText>
        <View style={styles.actions}>
          <AppButton
            onPress={() => pick('library')}
            size="sm"
            title={t('flow.profile.uploadPhoto')}
            variant="secondary"
          />
          <AppButton
            icon="camera-outline"
            onPress={() => pick('camera')}
            size="sm"
            title={t('flow.profile.takePhoto')}
            variant="outline"
          />
          {uri ? (
            <AppButton
              onPress={() => onChange?.(null)}
              size="sm"
              title={t('flow.profile.removePhoto')}
              variant="ghost"
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarWrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  hint: {
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
