import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform, StyleSheet, View } from 'react-native';
import { AppButton, AppIcon, AppText } from '../../components/ui';
import { colors, spacing } from '../../theme/tokens';

export default function AssetPicker({
  value,
  accept,
  label,
  onChange,
  onError,
}) {
  const pick = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await DocumentPicker.getDocumentAsync({
          type: accept,
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (!result.canceled && result.assets?.[0]) {
          onChange(result.assets[0]);
        }
        return;
      }

      const result = await File.pickFileAsync({ mimeTypes: accept });
      if (!result.canceled) {
        const file = result.result;
        onChange({
          uri: file.uri,
          name: file.name,
          size: file.size,
          mimeType: file.type || accept,
        });
      }
    } catch (error) {
      console.warn('Unable to select the requested file.', error);
      onError?.('The selected file could not be opened.');
    }
  };

  const fileName = value?.name || value?.fileName;

  return (
    <View style={styles.wrap}>
      <View style={styles.fileInfo}>
        <AppIcon
          name={fileName ? 'file-check-outline' : 'file-upload-outline'}
          size={20}
          color={fileName ? colors.primary : colors.muted}
        />
        <AppText color={fileName ? colors.text : colors.muted} variant="caption">
          {fileName || 'Optional file upload'}
        </AppText>
      </View>
      <View style={styles.actions}>
        <AppButton
          onPress={pick}
          size="sm"
          title={label}
          variant="outline"
        />
        {value ? (
          <AppButton
            onPress={() => onChange(null)}
            size="sm"
            title="Remove"
            variant="ghost"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
