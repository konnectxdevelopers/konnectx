import { StyleSheet, View } from 'react-native';
import { AppIcon, AppPressable, AppText, Avatar, Badge } from '../../components/ui';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

export default function ProfessionalCard({ professional, onPress }) {
  const locationText = [professional.city, professional.state].filter(Boolean).join(', ');
  const skills = Array.isArray(professional.skills) ? professional.skills.slice(0, 3) : [];

  return (
    <AppPressable onPress={onPress} scaleTo={0.985} style={styles.card}>
      <View style={styles.topRow}>
        <Avatar name={professional.name} size={48} />
        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <AppText variant="h4" color={colors.text} numberOfLines={1} style={styles.nameText}>
              {professional.name}
            </AppText>
            {professional.verified ? (
              <AppIcon name="check-decagram" size={16} color={colors.primary} />
            ) : null}
          </View>
          <AppText variant="caption" color={colors.primary} numberOfLines={1}>
            {professional.category || 'Professional'}
            {professional.experienceYears ? ` · ${professional.experienceYears} yrs exp` : ''}
          </AppText>
          {professional.headline ? (
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
              {professional.headline}
            </AppText>
          ) : null}
        </View>
      </View>

      {skills.length > 0 ? (
        <View style={styles.skillRow}>
          {skills.map((skill) => (
            <Badge key={skill} label={skill} variant="neutral" />
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <AppText variant="caption" color={colors.muted} numberOfLines={1}>
          {locationText || 'Available remotely'}
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
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
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

