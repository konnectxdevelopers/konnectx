import { StyleSheet, View } from 'react-native';
import { AppIcon, AppPressable, AppText, Avatar, Badge } from '../../components/ui';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

export default function BusinessCard({ business, onPress }) {
  const locationText = [business.city, business.state].filter(Boolean).join(', ');
  const cats = Array.isArray(business.categories) ? business.categories.slice(0, 2) : [];

  return (
    <AppPressable onPress={onPress} scaleTo={0.985} style={styles.card}>
      <View style={styles.topRow}>
        <Avatar name={business.name} size={46} />
        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <AppText variant="h4" color={colors.text} numberOfLines={1} style={styles.nameText}>
              {business.name}
            </AppText>
            {business.verified ? (
              <AppIcon name="check-decagram" size={16} color={colors.primary} />
            ) : null}
          </View>
          <AppText variant="caption" color={colors.primary} numberOfLines={1}>
            {business.industry || 'Business & Shop'}
          </AppText>
          {business.description ? (
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
              {business.description}
            </AppText>
          ) : null}
        </View>
      </View>

      {cats.length > 0 ? (
        <View style={styles.catRow}>
          {cats.map((c) => <Badge key={c.id || c.name} label={c.name} variant="neutral" />)}
        </View>
      ) : null}

      <View style={styles.footer}>
        <AppText variant="caption" color={colors.muted} numberOfLines={1}>
          {locationText || 'Marketplace Business'}
        </AppText>
        <AppIcon name="chevron-right" size={18} color={colors.subtle} />
      </View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  topRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  meta: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameText: { flexShrink: 1 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.xs,
    marginTop: 2,
  },
});

