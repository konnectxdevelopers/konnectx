import { forwardRef, useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import AppIcon from './AppIcon';
import AppText from './AppText';
import { useKeyboardNavigation } from './KeyboardAwareScrollView';
import { colors, radii, spacing, typography } from '../../theme/tokens';

const AppInput = forwardRef(function AppInput(
  {
    label,
    error,
    helper,
    icon,
    rightIcon,
    onRightIconPress,
    reserveFooterSpace = false,
    secureTextEntry = false,
    multiline = false,
    containerStyle,
    style,
    inputStyle,
    onFocus,
    onBlur,
    maxLength,
    value,
    onSubmitEditing,
    ...textInputProps
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef(null);
  const keyboardNavigation = useKeyboardNavigation();
  const isSecure = secureTextEntry && !revealed;
  const hasFooterContent = Boolean(
    error || (maxLength && typeof value === 'string')
  );
  const setInputRef = useCallback(
    (node) => {
      if (inputRef.current && inputRef.current !== node) {
        keyboardNavigation?.unregisterInput(inputRef.current);
      }
      inputRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
      if (node) {
        keyboardNavigation?.registerInput(node);
      }
    },
    [keyboardNavigation, ref]
  );
  const handleSubmitEditing = (event) => {
    if (
      textInputProps.returnKeyType === 'next' &&
      keyboardNavigation?.focusNextInput(inputRef.current)
    ) {
      return;
    }
    onSubmitEditing?.(event);
  };
  const submitBehavior =
    textInputProps.submitBehavior ||
    (Platform.OS !== 'web' && textInputProps.returnKeyType === 'next'
      ? 'submit'
      : undefined);

  return (
    <View style={[style, containerStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <AppText variant="label" color={colors.textSecondary}>
            {label}
          </AppText>
          {helper ? (
            <AppText variant="caption" color={colors.subtle}>
              {helper}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          focused && styles.fieldFocused,
          error && styles.fieldError,
        ]}
      >
        {icon ? (
          <AppIcon
            name={icon}
            size={20}
            color={focused ? colors.primary : colors.subtle}
          />
        ) : null}

        <TextInput
          ref={setInputRef}
          accessibilityLabel={label || textInputProps.placeholder}
          cursorColor={colors.primary}
          maxLength={maxLength}
          multiline={multiline}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            keyboardNavigation?.scrollToInput(inputRef.current);
            onFocus?.(event);
          }}
          onSubmitEditing={handleSubmitEditing}
          placeholderTextColor={colors.subtle}
          selectionColor={colors.primaryMuted}
          secureTextEntry={isSecure}
          submitBehavior={submitBehavior}
          style={[styles.input, multiline && styles.inputMultiline, inputStyle]}
          value={value}
          {...textInputProps}
        />

        {secureTextEntry ? (
          <Pressable
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setRevealed((current) => !current)}
          >
            <AppIcon
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        ) : rightIcon ? (
          <Pressable
            accessibilityRole={onRightIconPress ? 'button' : undefined}
            disabled={!onRightIconPress}
            hitSlop={10}
            onPress={onRightIconPress}
          >
            <AppIcon name={rightIcon} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {reserveFooterSpace || hasFooterContent ? (
        <View style={styles.footer}>
          {error ? (
            <AppText variant="caption" color={colors.danger} style={styles.message}>
              {error}
            </AppText>
          ) : (
            <View />
          )}
          {maxLength && typeof value === 'string' ? (
            <AppText variant="caption" color={colors.subtle}>
              {value.length}/{maxLength}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

AppInput.displayName = 'AppInput';

export default AppInput;

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  fieldMultiline: {
    minHeight: 108,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  fieldFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 0,
    color: colors.text,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    includeFontPadding: false,
  },
  inputMultiline: {
    minHeight: 84,
    paddingTop: 2,
    textAlignVertical: 'top',
  },
  footer: {
    minHeight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
  message: {
    flex: 1,
  },
});
