import { StyleSheet, View } from 'react-native';
import { AppIcon, AppPressable, AppText, Badge } from '../../components/ui';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

function formatBudget(project) {
  if (!project || project.budgetType === 'negotiable') return 'Negotiable';
  const cur = project.currency === 'INR' ? '₹' : `${project.currency || 'INR'} `;
  if (project.budgetType === 'range' && project.budgetMin && project.budgetMax) {
    return `${cur}${Number(project.budgetMin).toLocaleString('en-IN')} - ${cur}${Number(project.budgetMax).toLocaleString('en-IN')}`;
  }
  if (project.budget) return `${cur}${Number(project.budget).toLocaleString('en-IN')} (${project.budgetType})`;
  return 'Negotiable';
}

export default function ProjectCard({ project, onPress }) {
  const skills = Array.isArray(project.requiredSkills) ? project.requiredSkills.slice(0, 3) : [];

  return (
    <AppPressable onPress={onPress} scaleTo={0.985} style={styles.card}>
      <View style={styles.badgeRow}>
        <Badge label={project.budgetType || 'fixed'} variant="neutral" />
        <Badge label={project.workMode || 'remote'} variant="info" />
        {project.categoryName ? <Badge label={project.categoryName} variant="neutral" /> : null}
      </View>
      <AppText variant="h4" color={colors.text} numberOfLines={2}>
        {project.title}
      </AppText>
      <AppText variant="label" color={colors.primary}>
        {formatBudget(project)}
      </AppText>
      {project.description ? (
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
          {project.description}
        </AppText>
      ) : null}
      {skills.length > 0 ? (
        <View style={styles.badgeRow}>
          {skills.map((skill) => <Badge key={skill} label={skill} variant="neutral" />)}
        </View>
      ) : null}
      <View style={styles.footer}>
        <AppText variant="caption" color={colors.muted} numberOfLines={1}>
          {[project.clientName || 'Client', project.deadline ? `Due ${String(project.deadline).slice(0, 10)}` : null]
            .filter(Boolean)
            .join(' · ')}
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
    gap: 6,
    ...shadows.sm,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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

