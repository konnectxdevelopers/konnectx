import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../auth/AuthProvider';
import {
  AppButton,
  AppIcon,
  AppText,
  Badge,
  InlineAlert,
  LoadingState,
} from '../../components/ui';
import { colors, radii, shadows, spacing } from '../../theme/tokens';
import {
  getEmployerApplicationsRequest,
  getMyJobsRequest,
} from '../../services/marketplace/marketplaceService';
import {
  DashboardAccountTypeSwitcher,
  DashboardDetail,
  DashboardGreeting,
  DashboardLayout,
  DashboardModuleCard,
  DashboardProfileCard,
  DashboardProfileStatus,
  DashboardSection,
} from './DashboardUi';
import { dashboardAssets } from './dashboardAssets';

const tabs = [
  { key: 'dashboard', label: 'Talent', icon: 'view-dashboard-outline', activeIcon: 'view-dashboard' },
  { key: 'jobs', label: 'Jobs', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { key: 'applicants', label: 'Applicants', icon: 'account-multiple-outline', activeIcon: 'account-multiple' },
  { key: 'shortlisted', label: 'Shortlisted', icon: 'star-outline', activeIcon: 'star' },
  { key: 'profile', label: 'Profile', icon: 'account-outline', activeIcon: 'account' },
];

function profileList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function HiringDashboardScreen({
  dashboard,
  refreshing,
  onRefresh,
  error,
}) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { session } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(null);
  const { profile, user, profileCompletion, verificationStatus } = dashboard;
  const isOrganization = profile.hiringAs === 'organization';
  const profileName = isOrganization
    ? profile.companyName || user.name
    : profile.fullName || user.name;
  const profileAsset = isOrganization ? profile.companyLogo : profile.profilePhoto;
  const categories = profileList(profile.hiringCategories);
  const locations = profileList(profile.hiringLocations);
  const editProfile = () => router.push('/role-profile/hiring');
  const loadHiringData = useCallback(async () => {
    if (!session?.token) return;
    try {
      const [jobResponse, applicationResponse] = await Promise.all([
        getMyJobsRequest(session, { role: 'hiring' }),
        getEmployerApplicationsRequest(session, { role: 'hiring' }),
      ]);
      setJobs(jobResponse.items || []);
      setApplications(applicationResponse.items || []);
      setJobsError(null);
    } catch (requestError) {
      setJobsError(requestError?.message || 'Could not load hiring activity.');
    } finally {
      setJobsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    Promise.all([
      getMyJobsRequest(session, { role: 'hiring' }),
      getEmployerApplicationsRequest(session, { role: 'hiring' }),
    ])
      .then(([jobResponse, applicationResponse]) => {
        if (!active) return;
        setJobs(jobResponse.items || []);
        setApplications(applicationResponse.items || []);
        setJobsError(null);
      })
      .catch((requestError) => {
        if (active) setJobsError(requestError?.message || 'Could not load hiring activity.');
      })
      .finally(() => {
        if (active) setJobsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const refreshHiringDashboard = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      await onRefresh?.();
    } finally {
      await loadHiringData();
    }
  }, [loadHiringData, onRefresh]);

  const publishedJobs = jobs.filter((job) => job.status === 'published');
  const shortlistedApplications = applications.filter((application) => application.status === 'shortlisted');

  const renderHiringHero = () => (
    <View style={styles.heroWrap}>
      <ImageBackground
        source={dashboardAssets.hiring}
        style={styles.heroImage}
        imageStyle={styles.heroRadius}
      >
        <LinearGradient
          colors={['rgba(11, 59, 46, 0.3)', 'rgba(7, 42, 32, 0.92)']}
          style={styles.heroGradient}
        >
          <View style={styles.heroTop}>
            <Badge
              label={isOrganization ? 'Organization' : 'Individual Recruiter'}
              variant="neutral"
            />
          </View>
          <View style={styles.heroBottom}>
            <AppText variant="h2" color={colors.inverse}>
              Build your dream team
            </AppText>
            <AppText variant="body" color="rgba(255,255,255,0.85)">
              Post roles, review verified talent, and schedule interviews.
            </AppText>
            <View style={styles.heroCta}>
              <AppButton
                icon="plus"
                title="Manage Jobs"
                onPress={() => router.push('/manage-jobs?role=hiring')}
                size="sm"
                variant="cta"
              />
              <AppButton
                icon="account-multiple-outline"
                title="Applicants"
                onPress={() => router.push('/employer-applications?role=hiring')}
                size="sm"
                variant="secondary"
              />
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );

  const renderPipelineStats = () => (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <AppIcon name="briefcase-outline" size={20} color={colors.primary} />
        <AppText variant="h2" color={colors.text}>
          {publishedJobs.length}
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          Active Jobs
        </AppText>
      </View>
      <View style={styles.statCard}>
        <AppIcon name="account-multiple-outline" size={20} color={colors.info} />
        <AppText variant="h2" color={colors.text}>
          {applications.length}
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          Applicants
        </AppText>
      </View>
      <View style={styles.statCard}>
        <AppIcon name="star-outline" size={20} color={colors.cta} />
        <AppText variant="h2" color={colors.text}>
          {shortlistedApplications.length}
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          Shortlisted
        </AppText>
      </View>
    </View>
  );

  const renderDashboard = () => (
    <View style={styles.stack}>
      <DashboardGreeting
        location={locations[0] || 'Set hiring location'}
        name={profileName}
        onAction={() => setActiveTab('profile')}
        onLocationPress={editProfile}
        profileAsset={profileAsset}
        subtitle="TALENT & RECRUITMENT"
      />

      {renderHiringHero()}
      {renderPipelineStats()}

      <DashboardSection
        actionLabel="Edit"
        onAction={editProfile}
        subtitle="Roles & regions you recruit for"
        title="Hiring Focus"
      >
        {categories.length || locations.length ? (
          <View style={styles.focusCard}>
            {categories.length ? (
              <View style={styles.pillGroup}>
                {categories.map((cat, i) => (
                  <View key={`cat-${i}`} style={styles.pill}>
                    <AppText variant="caption" color={colors.primary}>
                      {cat}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
            {locations.length ? (
              <View style={styles.locationRow}>
                <AppIcon name="map-marker-outline" size={16} color={colors.muted} />
                <AppText variant="body" color={colors.textSecondary}>
                  {locations.join(' · ')}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : (
          <DashboardModuleCard
            actionLabel="Set Preferences"
            icon="tune-variant"
            onAction={editProfile}
            subtitle="Configure your target job categories and locations."
            title="No hiring preferences set"
          />
        )}
      </DashboardSection>

      <DashboardSection
        actionLabel="View applicants"
        onAction={() => setActiveTab('applicants')}
        title="Recent Applications"
      >
        {jobsLoading ? <LoadingState message="Loading recruitment activity..." /> : null}
        {jobsError ? <InlineAlert message={jobsError} variant="error" /> : null}
        {!jobsLoading && !jobsError && !applications.length ? (
          <DashboardModuleCard
            actionLabel="Post a Job"
            icon="account-search-outline"
            onAction={() => setActiveTab('jobs')}
            subtitle="Applications to your published jobs will appear here."
            title="No applications yet"
          />
        ) : null}
        {!jobsLoading && applications.slice(0, 3).map((application) => (
          <View key={application.id} style={styles.applicationCard}>
            <View style={styles.applicationCopy}>
              <AppText variant="label" color={colors.text}>{application.applicantName}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {application.jobTitle} · {application.status}
              </AppText>
            </View>
          </View>
        ))}
      </DashboardSection>
    </View>
  );

  const renderJobs = () => (
    <View style={styles.stack}>
      <View style={styles.marketplaceActions}>
        <AppButton
          icon="view-list-outline"
          onPress={() => router.push('/my-listings?role=hiring')}
          size="sm"
          title="My Listings"
        />
        <AppButton
          icon="plus"
          onPress={() => router.push('/manage-jobs?role=hiring')}
          size="sm"
          title="Post a job"
          variant="secondary"
        />
        <AppButton
          onPress={() => router.push('/manage-projects?role=hiring')}
          size="sm"
          title="Post a freelance project"
          variant="outline"
        />
      </View>
      <DashboardSection
        actionLabel="Manage all"
        onAction={() => router.push('/manage-jobs?role=hiring')}
        subtitle="Your employer job posts and their current status"
        title="Job Listings"
      >
        {jobsLoading ? <LoadingState message="Loading your jobs..." /> : null}
        {jobsError ? <InlineAlert message={jobsError} variant="error" /> : null}
        {!jobsLoading && !jobsError && !jobs.length ? (
          <DashboardModuleCard
            actionLabel="Post a Job"
            icon="briefcase-plus-outline"
            onAction={() => router.push('/manage-jobs?role=hiring')}
            subtitle="Create a vacancy and manage it through the recruitment workflow."
            title="No job posts yet"
          />
        ) : null}
        {!jobsLoading && jobs.slice(0, 4).map((job) => (
          <View key={job.id} style={styles.applicationCard}>
            <View style={styles.applicationCopy}>
              <AppText variant="label" color={colors.text}>{job.title}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {[job.location, `${job.applicationCount || 0} applicants`].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <Badge label={job.status.replace('_', ' ')} variant={job.status === 'published' ? 'success' : 'neutral'} />
          </View>
        ))}
      </DashboardSection>
    </View>
  );

  const renderApplicants = () => (
    <View style={styles.stack}>
      <DashboardSection
        actionLabel="Manage applicants"
        onAction={() => router.push('/employer-applications?role=hiring')}
        subtitle="Applications for jobs owned by your hiring profile"
        title="Applicants"
      >
        {jobsLoading ? <LoadingState message="Loading applicants..." /> : null}
        {jobsError ? <InlineAlert message={jobsError} variant="error" /> : null}
        {!jobsLoading && !jobsError && !applications.length ? (
          <DashboardModuleCard
            icon="account-multiple-outline"
            subtitle="Applicant details will appear when candidates apply."
            title="No applicants yet"
          />
        ) : null}
        {!jobsLoading && applications.slice(0, 4).map((application) => (
          <View key={application.id} style={styles.applicationCard}>
            <View style={styles.applicationCopy}>
              <AppText variant="label" color={colors.text}>{application.applicantName}</AppText>
              <AppText variant="caption" color={colors.muted}>{application.jobTitle}</AppText>
            </View>
            <Badge label={application.status} variant="neutral" />
          </View>
        ))}
      </DashboardSection>
    </View>
  );

  const renderShortlisted = () => (
    <View style={styles.stack}>
      <DashboardSection subtitle="Candidates marked as shortlisted" title="Shortlisted">
        {!jobsLoading && !shortlistedApplications.length ? (
          <DashboardModuleCard
            icon="star-outline"
            subtitle="Shortlisted candidates will appear here."
            title="No shortlisted candidates"
          />
        ) : null}
        {shortlistedApplications.map((application) => (
          <View key={application.id} style={styles.applicationCard}>
            <View style={styles.applicationCopy}>
              <AppText variant="label" color={colors.text}>{application.applicantName}</AppText>
              <AppText variant="caption" color={colors.muted}>{application.jobTitle}</AppText>
            </View>
            <Badge label="Shortlisted" variant="success" />
          </View>
        ))}
      </DashboardSection>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.stack}>
      <DashboardProfileCard
        asset={profileAsset}
        badge={isOrganization ? 'Organization' : 'Recruiter'}
        name={profileName}
        onEdit={editProfile}
        subtitle={locations.join(', ') || user.email}
      />
      <DashboardProfileStatus
        completion={profileCompletion}
        onEdit={editProfile}
        verificationStatus={verificationStatus}
      />
      <DashboardSection title="Hiring Details">
        <View style={styles.detailsCard}>
          <DashboardDetail label="Account Type" value={isOrganization ? 'Organization' : 'Individual'} />
          <DashboardDetail label="Categories" value={categories.join(', ')} />
          <DashboardDetail label="Locations" value={locations.join(', ')} />
          <DashboardDetail label="Email" value={user.email} />
        </View>
      </DashboardSection>
      <DashboardAccountTypeSwitcher currentRole="hiring" />
    </View>
  );

  const tabContent = {
    dashboard: renderDashboard,
    jobs: renderJobs,
    applicants: renderApplicants,
    shortlisted: renderShortlisted,
    profile: renderProfile,
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      error={error || jobsError}
      onRefresh={refreshHiringDashboard}
      onTabChange={setActiveTab}
      refreshing={refreshing}
      roleTitle="Hiring"
      tabs={tabs}
    >
      {(tabContent[activeTab] || renderDashboard)()}
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  marketplaceActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  applicationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  applicationCopy: {
    flex: 1,
    gap: 2,
  },
  heroWrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  heroImage: {
    width: '100%',
    height: 204,
  },
  heroRadius: {
    borderRadius: radii.xl,
  },
  heroGradient: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  heroTop: {
    alignSelf: 'flex-start',
  },
  heroBottom: {
    gap: 6,
  },
  heroCta: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  focusCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pillGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
});
