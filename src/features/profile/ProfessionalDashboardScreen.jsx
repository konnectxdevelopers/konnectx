import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import {
  AppButton,
  AppIcon,
  AppText,
  Badge,
  ProgressBar,
} from '../../components/ui';
import { colors, radii, shadows, spacing } from '../../theme/tokens';
import useProviderServices from '../marketplace/useProviderServices';
import {
  DashboardAccountTypeSwitcher,
  DashboardDetail,
  DashboardGreeting,
  DashboardLayout,
  DashboardModuleCard,
  DashboardProfileCard,
  DashboardProfileImage,
  DashboardProfileStatus,
  DashboardSection,
} from './DashboardUi';
import { dashboardArtworkForCategory } from './dashboardAssets';

const tabs = [
  { key: 'home', label: 'Studio', icon: 'home-outline', activeIcon: 'home' },
  { key: 'services', label: 'Services', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar-month-outline', activeIcon: 'calendar-month' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet-outline', activeIcon: 'wallet' },
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

export default function ProfessionalDashboardScreen({
  dashboard,
  refreshing,
  onRefresh,
  error,
}) {
  const [activeTab, setActiveTab] = useState('home');
  const { session } = useAuth();
  const {
    services: marketplaceServices,
    error: servicesError,
    loading: servicesLoading,
    refresh: refreshServices,
  } = useProviderServices(session, 'professional');
  const { profile, user, profileCompletion, verificationStatus } = dashboard;
  const profileName = profile.fullName || user.name;
  const availability = profileList(profile.availableDays).join(', ');
  const editProfile = () => router.push('/role-profile/professional');
  const manageServices = () => router.push('/manage-services?role=professional');
  const firstPricedService = marketplaceServices.find((service) => service.price !== null);
  const completionPercent = Math.max(0, Math.min(100, Number(profileCompletion?.percentage) || 0));
  const startingPrice = firstPricedService
    ? `${firstPricedService.currency} ${firstPricedService.price}`
    : marketplaceServices.length
      ? 'Negotiable'
      : 'Not set';
  const refreshDashboard = useCallback(async () => {
    try {
      await onRefresh?.();
    } finally {
      refreshServices();
    }
  }, [onRefresh, refreshServices]);

  const renderIdentityBanner = () => (
    <View style={styles.studioCard}>
      <View style={styles.studioTop}>
        <DashboardProfileImage asset={profile.profilePhoto} name={profileName} size={60} />
        <View style={styles.studioInfo}>
          <View style={styles.studioNameRow}>
            <AppText variant="subtitle" color={colors.inverse} numberOfLines={1}>
              {profileName}
            </AppText>
            {verificationStatus === 'verified' ? (
              <Badge label="Verified" variant="success" />
            ) : null}
          </View>
          <AppText variant="body" color="rgba(255,255,255,0.8)" numberOfLines={1}>
            {profile.primaryCategory || 'Independent Professional'}
          </AppText>
          <View style={styles.availabilityPill}>
            <View style={styles.availabilityDot} />
            <AppText variant="caption" color={colors.inverse}>
              {availability || 'Set your availability'}
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.completionWrap}>
        <View style={styles.completionHeader}>
          <AppText variant="caption" color="rgba(255,255,255,0.75)">
            Profile Strength
          </AppText>
          <AppText variant="caption" color={colors.inverse}>
            {completionPercent}%
          </AppText>
        </View>
        <ProgressBar
          color={colors.cta}
          progress={completionPercent / 100}
          trackColor="rgba(255,255,255,0.18)"
        />
      </View>
    </View>
  );

  const renderMetrics = () => (
    <View style={styles.metricsRow}>
      <View style={styles.metricTile}>
        <AppIcon name="briefcase-outline" size={20} color={colors.primary} />
        <AppText variant="h2" color={colors.text}>
          {servicesLoading ? '—' : marketplaceServices.length}
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          Active Services
        </AppText>
      </View>
      <View style={styles.metricTile}>
        <AppIcon name="cash-multiple" size={20} color={colors.success} />
        <AppText variant="subtitle" color={colors.text} numberOfLines={1}>
          {startingPrice}
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          Starting Rate
        </AppText>
      </View>
    </View>
  );

  const renderHome = () => (
    <View style={styles.stack}>
      <DashboardGreeting
        location={profile.city || 'Add your city'}
        name={profileName}
        onAction={() => setActiveTab('profile')}
        onLocationPress={editProfile}
        profileAsset={profile.profilePhoto}
        subtitle="CREATOR WORKSPACE"
      />

      {renderIdentityBanner()}
      {renderMetrics()}
      <View style={styles.marketplaceActions}>
        <AppButton
          icon="view-list-outline"
          onPress={() => router.push('/my-listings?role=professional')}
          size="sm"
          title="My Listings"
        />
        <AppButton
          icon="briefcase-plus-outline"
          onPress={() => router.push('/marketplace-manage?type=portfolio&role=professional')}
          size="sm"
          title="Manage portfolio & skills"
          variant="outline"
        />
        <AppButton
          icon="rocket-launch-outline"
          onPress={() => router.push('/project/discover')}
          size="sm"
          title="Browse freelance projects"
          variant="secondary"
        />
      </View>

      <DashboardSection
        actionLabel="Manage"
        onAction={() => setActiveTab('services')}
        subtitle="What clients can book"
        title="Active Services"
      >
        {servicesLoading ? (
          <DashboardModuleCard icon="briefcase-outline" title="Loading services" subtitle="Fetching your published listings." />
        ) : marketplaceServices.length ? (
          <View style={styles.serviceList}>
        {marketplaceServices.slice(0, 4).map((service) => {
            const image = service.media?.find((item) => item.mediaType === 'image' && item.url);
            return (
              <View key={service.id} style={styles.serviceRow}>
                <Image
                  source={image?.url
                    ? { uri: image.url }
                    : dashboardArtworkForCategory(service.categoryName || service.title)}
                  style={styles.serviceThumb}
                  resizeMode="cover"
                />
                <View style={styles.serviceBody}>
                  <AppText variant="label" color={colors.text} numberOfLines={1}>
                    {service.title}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {service.categoryName || 'Service'} · {service.price === null
                      ? 'Negotiable'
                      : `${service.currency} ${service.price}`}
                  </AppText>
                </View>
                <AppIcon name="chevron-right" size={20} color={colors.subtle} />
              </View>
            );
        })}
          </View>
        ) : (
          <DashboardModuleCard
            actionLabel="Add Services"
            icon="plus-circle-outline"
        onAction={manageServices}
        subtitle="Publish a service listing for customers to discover."
            title="No services listed yet"
          />
        )}
      </DashboardSection>

      <DashboardSection
        actionLabel="View enquiries"
        onAction={() => router.push('/marketplace-enquiries?view=received')}
        title="Booking Requests"
      >
        <DashboardModuleCard
          actionLabel="Update Availability"
          icon="calendar-clock-outline"
          onAction={editProfile}
          subtitle="Incoming client requests and confirmed appointments will appear here."
          title="No pending requests"
        />
      </DashboardSection>
    </View>
  );

  const renderServices = () => (
    <View style={styles.stack}>
      <DashboardSection
        actionLabel="Edit"
        onAction={editProfile}
        subtitle="Your published offerings"
        title="My Services"
      >
        {servicesLoading ? (
          <DashboardModuleCard icon="briefcase-outline" title="Loading services" subtitle="Fetching your published listings." />
        ) : marketplaceServices.length ? (
          <View style={styles.serviceList}>
            {marketplaceServices.map((service) => {
              const image = service.media?.find((item) => item.mediaType === 'image' && item.url);
              return (
                <View key={service.id} style={styles.serviceRow}>
                  <Image
                    source={image?.url
                      ? { uri: image.url }
                      : dashboardArtworkForCategory(service.categoryName || service.title)}
                    style={styles.serviceThumb}
                    resizeMode="cover"
                  />
                  <View style={styles.serviceBody}>
                    <AppText variant="label" color={colors.text}>{service.title}</AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {service.price === null ? 'Negotiable' : `${service.currency} ${service.price}`}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <DashboardModuleCard
            actionLabel="Add Services"
            icon="briefcase-plus-outline"
            onAction={manageServices}
            subtitle="Create a listing in My Services to reach customers."
            title="No services yet"
          />
        )}
      </DashboardSection>
      {servicesError ? <DashboardModuleCard icon="alert-circle-outline" title="Services unavailable" subtitle={servicesError} /> : null}
      <AppButton title="Manage & publish services" onPress={manageServices} variant="primary" />
    </View>
  );

  const renderBookings = () => (
    <View style={styles.stack}>
      <DashboardSection subtitle="Client schedule" title="Bookings">
        <DashboardModuleCard
          actionLabel="Set Availability"
          icon="calendar-month-outline"
          onAction={editProfile}
          subtitle="Your upcoming client sessions will be organized here."
          title="No bookings scheduled"
        />
      </DashboardSection>
    </View>
  );

  const renderEarnings = () => (
    <View style={styles.stack}>
      <DashboardSection subtitle="Payouts & completed jobs" title="Earnings Overview">
        <DashboardModuleCard
          icon="wallet-outline"
          subtitle="Real earnings and payout history will appear here once you complete bookings."
          title="No earnings recorded yet"
        />
      </DashboardSection>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.stack}>
      <DashboardProfileCard
        asset={profile.profilePhoto}
        badge="Professional"
        name={profileName}
        onEdit={editProfile}
        subtitle={profile.primaryCategory || user.email}
      />
      <DashboardProfileStatus
        completion={profileCompletion}
        onEdit={editProfile}
        verificationStatus={verificationStatus}
      />
      <DashboardSection title="Professional Details">
        <View style={styles.detailsCard}>
          <DashboardDetail label="Category" value={profile.primaryCategory} />
          <DashboardDetail label="Experience" value={profile.experienceYears ? `${profile.experienceYears} years` : null} />
          <DashboardDetail label="Starting Rate" value={startingPrice} />
          <DashboardDetail label="Availability" value={availability} />
          <DashboardDetail label="City" value={profile.city} />
        </View>
      </DashboardSection>
      <DashboardAccountTypeSwitcher currentRole="professional" />
    </View>
  );

  const tabContent = {
    home: renderHome,
    services: renderServices,
    bookings: renderBookings,
    earnings: renderEarnings,
    profile: renderProfile,
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      error={error || servicesError}
      onRefresh={refreshDashboard}
      onTabChange={setActiveTab}
      refreshing={refreshing}
      roleTitle="Professional"
      tabs={tabs}
    >
      {(tabContent[activeTab] || renderHome)()}
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
    gap: spacing.sm,
    alignItems: 'center',
  },
  studioCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.brand,
  },
  studioTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  studioInfo: {
    flex: 1,
    gap: 4,
  },
  studioNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  availabilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ctaLime,
  },
  completionWrap: {
    gap: 6,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  serviceList: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  serviceThumb: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  serviceBody: {
    flex: 1,
    gap: 2,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
});
