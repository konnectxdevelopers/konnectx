import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import AppIcon from './AppIcon';
import AppPressable from './AppPressable';
import { colors, radii, shadows, spacing, typography } from '../../theme/tokens';

const SearchBar = forwardRef(function SearchBar(
  {
    value = '',
    onChangeText,
    placeholder = 'Search',
    onSubmit,
    onClear,
    onFilterPress,
    filterActive = false,
    autoFocus = false,
    style,
    inputStyle,
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const hasValue = typeof value === 'string' && value.length > 0;

  return (
    <View
      style={[
        styles.container,
        focused && styles.containerFocused,
        style,
      ]}
    >
      <AppIcon
        name="magnify"
        size={22}
        color={focused ? colors.primary : colors.muted}
      />
      <TextInput
        ref={ref}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        cursorColor={colors.primary}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        returnKeyType="search"
        selectionColor={colors.primaryMuted}
        style={[styles.input, inputStyle]}
        value={value}
      />
      {hasValue ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            onChangeText?.('');
            onClear?.();
          }}
          style={styles.clear}
        >
          <AppIcon name="close" size={14} color={colors.muted} />
        </Pressable>
      ) : null}
      {onFilterPress ? (
        <AppPressable
          accessibilityLabel="Filters"
          accessibilityRole="button"
          onPress={onFilterPress}
          scaleTo={0.94}
          style={[styles.filter, filterActive && styles.filterActive]}
        >
          <AppIcon
            name="tune-variant"
            size={19}
            color={filterActive ? colors.inverse : colors.primary}
          />
        </AppPressable>
      ) : null}
    </View>
  );
});

export default SearchBar;

const styles = StyleSheet.create({
  container: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  containerFocused: {
    borderColor: colors.primary,
    ...shadows.card,
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
  clear: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  filter: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  filterActive: {
    backgroundColor: colors.primary,
  },
});
