import { StyleSheet, View } from 'react-native';
import { AppIcon, AppPressable, AppText, Badge } from '../../components/ui';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

function formatSalary(job) {
  if (!job || job.salaryUndisclosed) return 'Salary undisclosed';
  const cur = job.currency === 'INR' ? '₹' : `${job.currency || 'INR'} `;
  if (job.salaryMin && job.salaryMax) {
    return `${cur}${Number(job.salaryMin).toLocaleString('en-IN')} - ${cur}${Number(job.salaryMax).toLocaleString('en-IN')}`;
  }
  if (job.salaryMin) return `From ${cur}${Number(job.salaryMin).toLocaleString('en-IN')}`;
  if (job.salaryMax) return `Up to ${cur}${Number(job.salaryMax).toLocaleString('en-IN')}`;
  return 'Salary undisclosed';
}

export default function JobCard({ job, onPress }) {
  return (
    <AppPressable onPress={onPress} scaleTo={0.985} style={styles.card}>
      <View style={styles.badgeRow}>
        <Badge label={job.employmentType || 'full-time'} variant="neutral" />
        <Badge label={job.workMode || 'on-site'} variant="info" />
        {job.categoryName ? <Badge label={job.categoryName} variant="neutral" /> : null}
      </View>
      <AppText variant="h4" color={colors.text} numberOfLines={2}>
        {job.title}
      </AppText>
      <AppText variant="label" color={colors.primary} numberOfLines={1}>
        {job.employerName || 'Employer'}
      </AppText>
      <AppText variant="body" color={colors.text} style={styles.salary}>
        {formatSalary(job)}
      </AppText>
      <View style={styles.footer}>
        <AppText variant="caption" color={colors.muted} numberOfLines={1}>
          {[job.location || 'Location flexible', job.experienceMin !== null && job.experienceMin !== undefined ? `${job.experienceMin}+ yrs exp` : null]
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
  salary: { fontWeight: '600' },
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

