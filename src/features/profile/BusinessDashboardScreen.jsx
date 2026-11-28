import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Image, ImageBackground, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../auth/AuthProvider';
import {
  AppButton,
  AppIcon,
  AppText,
  Badge,
} from '../../components/ui';
import {
  getEmployerApplicationsRequest,
  getMyJobsRequest,
  getMyProductsRequest,
} from '../../services/marketplace/marketplaceService';
import { colors, radii, shadows, spacing } from '../../theme/tokens';
import useProviderServices from '../marketplace/useProviderServices';
import {
  DashboardAccountTypeSwitcher,
  DashboardDetail,
  DashboardLayout,
  DashboardModuleCard,
  DashboardProfileCard,
  DashboardProfileImage,
  DashboardProfileStatus,
  DashboardSection,
} from './DashboardUi';
import { dashboardAssets, dashboardArtworkForCategory } from './dashboardAssets';

const tabs = [
  { key: 'overview', label: 'Overview', icon: 'view-dashboard-outline', activeIcon: 'view-dashboard' },
  { key: 'services', label: 'Catalog', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar-month-outline', activeIcon: 'calendar-month' },
  { key: 'team', label: 'Team', icon: 'account-group-outline', activeIcon: 'account-group' },
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

export default function BusinessDashboardScreen({
  dashboard,
  refreshing,
  onRefresh,
  error,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const { session } = useAuth();
  const [shopProducts, setShopProducts] = useState([]);
  const [businessJobs, setBusinessJobs] = useState([]);
  const [businessApplications, setBusinessApplications] = useState([]);
  const [hiringDataLoading, setHiringDataLoading] = useState(
    () => dashboard?.profile?.hiringEnabled === true || dashboard?.profile?.hiringEnabled === 'true'
  );
  const [hiringDataError, setHiringDataError] = useState(null);
  const {
    services: marketplaceServices,
    error: servicesError,
    loading: servicesLoading,
    refresh: refreshServices,
  } = useProviderServices(session, 'business');
  const { profile, user, profileCompletion, verificationStatus } = dashboard;
  const hiringEnabled = profile.hiringEnabled === true || profile.hiringEnabled === 'true';
  const businessName = profile.companyName || user.name;
  const productItems = profileList(profile.products);
  const editProfile = () => router.push('/role-profile/business');
  const manageServices = () => router.push('/manage-services?role=business');
  const manageProducts = () => router.push('/manage-products');
  const manageShop = () => router.push('/business-shop');

  const loadProducts = useCallback(async () => {
    if (!session?.token) return;
    try {
      const res = await getMyProductsRequest(session, { limit: 20 });
      setShopProducts(res.items || []);
    } catch {
      // Keep non-blocking on overview if shop fetch fails
    }
  }, [session]);

  const loadBusinessRecruitment = useCallback(async () => {
    if (!session?.token || !hiringEnabled) return;
    try {
      const [jobResponse, applicationResponse] = await Promise.all([
        getMyJobsRequest(session, { role: 'business' }),
        getEmployerApplicationsRequest(session, { role: 'business' }),
      ]);
      setBusinessJobs(jobResponse.items || []);
      setBusinessApplications(applicationResponse.items || []);
      setHiringDataError(null);
    } catch (requestError) {
      setHiringDataError(requestError?.message || 'Could not load business hiring activity.');
    } finally {
      setHiringDataLoading(false);
    }
  }, [hiringEnabled, session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    getMyProductsRequest(session, { limit: 20 })
      .then((res) => {
        if (active) setShopProducts(res.items || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!hiringEnabled || !session?.token) return undefined;
    let active = true;
    Promise.all([
      getMyJobsRequest(session, { role: 'business' }),
      getEmployerApplicationsRequest(session, { role: 'business' }),
    ])
      .then(([jobResponse, applicationResponse]) => {
        if (!active) return;
        setBusinessJobs(jobResponse.items || []);
        setBusinessApplications(applicationResponse.items || []);
        setHiringDataError(null);
      })
      .catch((requestError) => {
        if (active) setHiringDataError(requestError?.message || 'Could not load business hiring activity.');
      })
      .finally(() => {
        if (active) setHiringDataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hiringEnabled, session]);

  const refreshDashboard = useCallback(async () => {
    setHiringDataLoading(hiringEnabled);
    setHiringDataError(null);
    try {
      await onRefresh?.();
    } finally {
      refreshServices();
      loadProducts();
      loadBusinessRecruitment();
    }
  }, [hiringEnabled, loadBusinessRecruitment, loadProducts, onRefresh, refreshServices]);

  const renderBrandHeader = () => (
    <View style={styles.brandCard}>
      <ImageBackground
        source={dashboardAssets.business}
        style={styles.coverImage}
        imageStyle={styles.coverRadius}
      >
        <LinearGradient
          colors={['rgba(7, 42, 32, 0.25)', 'rgba(7, 42, 32, 0.85)']}
          style={styles.coverGradient}
        >
          {verificationStatus === 'verified' ? (
            <View style={styles.verifiedWrap}>
              <Badge label="Verified Business" variant="success" />
            </View>
          ) : null}
        </LinearGradient>
      </ImageBackground>

      <View style={styles.brandBody}>
        <View style={styles.logoWrap}>
          <DashboardProfileImage
            asset={profile.companyLogo}
            name={businessName}
            style={styles.logoImage}
          />
        </View>
        <View style={styles.brandMeta}>
          <AppText variant="h2" color={colors.text} numberOfLines={1}>
            {businessName}
          </AppText>
          <AppText variant="body" color={colors.muted} numberOfLines={1}>
            {[profile.industry, profile.city].filter(Boolean).join(' · ') || 'Business Account'}
          </AppText>
        </View>
      </View>
    </View>
  );

  const renderKpiGrid = () => (
    <View style={styles.kpiGrid}>
      <View style={styles.kpiTile}>
        <AppText variant="overline" color={colors.muted}>
          SERVICES
        </AppText>
        <AppText variant="h2" color={colors.primary}>
          {marketplaceServices.length}
        </AppText>
      </View>
      <View style={styles.kpiTile}>
        <AppText variant="overline" color={colors.muted}>
          PRODUCTS
        </AppText>
        <AppText variant="h2" color={colors.primary}>
          {shopProducts.length || productItems.length}
        </AppText>
      </View>
      <View style={styles.kpiTile}>
        <AppText variant="overline" color={colors.muted}>
          TEAM SIZE
        </AppText>
        <AppText variant="subtitle" color={colors.text} numberOfLines={1}>
          {profile.employeeCount || '—'}
        </AppText>
      </View>
      <View style={styles.kpiTile}>
        <AppText variant="overline" color={colors.muted}>
          ESTABLISHED
        </AppText>
        <AppText variant="subtitle" color={colors.text} numberOfLines={1}>
          {profile.yearEstablished || '—'}
        </AppText>
      </View>
    </View>
  );

  const renderOverview = () => (
    <View style={styles.stack}>
      {renderBrandHeader()}
      {renderKpiGrid()}
      <View style={styles.actionsRow}>
        <AppButton
          icon="storefront-outline"
          onPress={manageShop}
          size="sm"
          title="Shop Profile"
        />
        <AppButton
          icon="package-variant-closed"
          onPress={manageProducts}
          size="sm"
          title="Products"
          variant="secondary"
        />
        <AppButton
          icon="view-list-outline"
          onPress={() => router.push('/my-listings?role=business')}
          size="sm"
          title="My Listings"
          variant="outline"
        />
        {hiringEnabled ? (
          <>
            <AppButton
              icon="briefcase-outline"
              onPress={() => router.push('/manage-jobs?role=business')}
              size="sm"
              title="Jobs & Hiring"
              variant="outline"
            />
            <AppButton
              icon="rocket-launch-outline"
              onPress={() => router.push('/manage-projects?role=business')}
              size="sm"
              title="Freelance Projects"
              variant="outline"
            />
          </>
        ) : null}
      </View>

      <DashboardSection
        actionLabel="View all"
        onAction={() => setActiveTab('services')}
        subtitle="Services & products offered"
        title="Business Catalog"
      >
        {servicesLoading ? (
          <DashboardModuleCard icon="briefcase-outline" title="Loading catalog" subtitle="Fetching published business listings." />
        ) : marketplaceServices.length || shopProducts.length || productItems.length ? (
          <View style={styles.catalogList}>
            {marketplaceServices.slice(0, 2).map((service) => {
              const image = service.media?.find((item) => item.mediaType === 'image' && item.url);
              return (
                <View key={service.id} style={styles.catalogRow}>
                  <Image
                    source={image?.url
                      ? { uri: image.url }
                      : dashboardArtworkForCategory(service.categoryName || service.title)}
                    style={styles.catalogThumb}
                    resizeMode="cover"
                  />
                  <View style={styles.catalogBody}>
                    <AppText variant="label" color={colors.text} numberOfLines={1}>
                      {service.title}
                    </AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {service.categoryName || 'Service'}
                    </AppText>
                  </View>
                  <AppIcon name="chevron-right" size={20} color={colors.subtle} />
                </View>
              );
            })}
            {shopProducts.slice(0, 3).map((prod) => (
              <View key={prod.id} style={styles.catalogRow}>
                <Image
                  source={prod.coverImage
                    ? { uri: prod.coverImage }
                    : dashboardAssets.business}
                  style={styles.catalogThumb}
                  resizeMode="cover"
                />
                <View style={styles.catalogBody}>
                  <AppText variant="label" color={colors.text} numberOfLines={1}>
                    {prod.name}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {prod.categoryName || 'Product'} · {prod.stockQuantity} in stock
                  </AppText>
                </View>
                <AppButton onPress={manageProducts} size="sm" title="Manage" variant="ghost" />
              </View>
            ))}
          </View>
        ) : (
          <DashboardModuleCard
            actionLabel="Add Product"
            icon="storefront-outline"
            onAction={manageProducts}
            subtitle="Configure your shop and publish services or products to showcase to customers."
            title="Catalog is empty"
          />
        )}
      </DashboardSection>

      {hiringEnabled ? (
        <DashboardSection
          actionLabel="Manage jobs"
          onAction={() => router.push('/manage-jobs?role=business')}
          subtitle="Vacancies and applicant activity for this business"
          title="Business Jobs & Applicants"
        >
          {hiringDataLoading ? (
            <DashboardModuleCard icon="briefcase-outline" title="Loading vacancies" subtitle="Fetching business job posts and applications." />
          ) : null}
          {hiringDataError ? <DashboardModuleCard icon="alert-circle-outline" title="Hiring activity unavailable" subtitle={hiringDataError} /> : null}
          {!hiringDataLoading && !hiringDataError && !businessJobs.length ? (
            <DashboardModuleCard
              actionLabel="Post a Job"
              icon="briefcase-plus-outline"
              onAction={() => router.push('/manage-jobs?role=business')}
              subtitle="Create and manage vacancies for your business."
              title="No business jobs yet"
            />
          ) : null}
          {!hiringDataLoading && businessJobs.slice(0, 3).map((job) => (
            <View key={job.id} style={styles.catalogRow}>
              <View style={styles.catalogBody}>
                <AppText variant="label" color={colors.text} numberOfLines={1}>{job.title}</AppText>
                <AppText variant="caption" color={colors.muted}>
                  {[job.location, `${businessApplications.filter((application) => application.jobId === job.id).length} applicants`].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <Badge label={job.status.replace('_', ' ')} variant={job.status === 'published' ? 'success' : 'neutral'} />
            </View>
          ))}
          <View style={styles.actionsRow}>
            <AppButton
              containerStyle={styles.flexBtn}
              onPress={() => router.push('/manage-jobs?role=business')}
              title="Manage Jobs"
              variant="outline"
            />
            <AppButton
              containerStyle={styles.flexBtn}
              onPress={() => router.push('/employer-applications?role=business')}
              title={`Applicants (${businessApplications.length})`}
              variant="secondary"
            />
          </View>
        </DashboardSection>
      ) : null}

      <DashboardSection
        actionLabel="View enquiries"
        onAction={() => router.push('/marketplace-enquiries?view=received')}
        title="Enquiries & Bookings"
      >
        <DashboardModuleCard
          icon="inbox-outline"
          subtitle="Customer enquiries and scheduled business bookings will appear here."
          title="No active enquiries"
        />
      </DashboardSection>
    </View>
  );

  const renderServices = () => (
    <View style={styles.stack}>
      <DashboardSection
        actionLabel="Edit"
        onAction={editProfile}
        subtitle="Managed offerings"
        title="Services & Products"
      >
        {servicesLoading ? (
          <DashboardModuleCard icon="briefcase-outline" title="Loading offerings" subtitle="Fetching published business listings." />
        ) : marketplaceServices.length || shopProducts.length || productItems.length ? (
          <View style={styles.catalogList}>
            {marketplaceServices.map((service) => {
              const image = service.media?.find((item) => item.mediaType === 'image' && item.url);
              return (
                <View key={service.id} style={styles.catalogRow}>
                  <Image
                    source={image?.url
                      ? { uri: image.url }
                      : dashboardArtworkForCategory(service.categoryName || service.title)}
                    style={styles.catalogThumb}
                    resizeMode="cover"
                  />
                  <View style={styles.catalogBody}>
                    <AppText variant="label" color={colors.text}>{service.title}</AppText>
                    <AppText variant="caption" color={colors.muted}>Service · {service.status}</AppText>
                  </View>
                </View>
              );
            })}
            {shopProducts.map((prod) => (
              <View key={prod.id} style={styles.catalogRow}>
                <Image
                  source={prod.coverImage ? { uri: prod.coverImage } : dashboardAssets.business}
                  style={styles.catalogThumb}
                  resizeMode="cover"
                />
                <View style={styles.catalogBody}>
                  <AppText variant="label" color={colors.text}>{prod.name}</AppText>
                  <AppText variant="caption" color={colors.muted}>
                    Product · {prod.status} · {prod.stockQuantity} in stock
                  </AppText>
                </View>
                <AppButton onPress={manageProducts} size="sm" title="Edit" variant="ghost" />
              </View>
            ))}
            {!shopProducts.length && productItems.map((item, idx) => (
              <View key={`p-${idx}`} style={styles.catalogRow}>
                <Image
                  source={dashboardAssets.business}
                  style={styles.catalogThumb}
                  resizeMode="cover"
                />
                <View style={styles.catalogBody}>
                  <AppText variant="label" color={colors.text}>
                    {item}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    Legacy Product
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <DashboardModuleCard
            actionLabel="Add Catalog"
            icon="briefcase-plus-outline"
            onAction={manageProducts}
            subtitle="Add services or products in your business catalogue."
            title="No items yet"
          />
        )}
      </DashboardSection>
      {servicesError ? <DashboardModuleCard icon="alert-circle-outline" title="Services unavailable" subtitle={servicesError} /> : null}
      <View style={styles.actionsRow}>
        <AppButton containerStyle={styles.flexBtn} title="Manage Products" onPress={manageProducts} variant="primary" />
        <AppButton containerStyle={styles.flexBtn} title="Shop Profile" onPress={manageShop} variant="secondary" />
      </View>
      <AppButton title="Manage & publish services" onPress={manageServices} variant="outline" />
    </View>
  );

  const renderBookings = () => (
    <View style={styles.stack}>
      <DashboardSection subtitle="Scheduled appointments" title="Business Bookings">
        <DashboardModuleCard
          icon="calendar-month-outline"
          subtitle="Incoming customer bookings for your business will appear here."
          title="No bookings yet"
        />
      </DashboardSection>
    </View>
  );

  const renderTeam = () => (
    <View style={styles.stack}>
      <DashboardSection subtitle="Staff & specialists" title="Team Members">
        <DashboardModuleCard
          actionLabel="Update Team Info"
          icon="account-group-outline"
          onAction={editProfile}
          subtitle={
            profile.employeeCount
              ? `You currently list ${profile.employeeCount} team members.`
              : 'Add your team size and member details in your business profile.'
          }
          title="Team Directory"
        />
      </DashboardSection>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.stack}>
      <DashboardProfileCard
        asset={profile.companyLogo}
        badge="Business"
        name={businessName}
        onEdit={editProfile}
        subtitle={profile.industry || user.email}
      />
      <DashboardProfileStatus
        completion={profileCompletion}
        onEdit={editProfile}
        verificationStatus={verificationStatus}
      />
      <DashboardSection title="Business Details">
        <View style={styles.detailsCard}>
          <DashboardDetail label="Company Name" value={businessName} />
          <DashboardDetail label="Industry" value={profile.industry} />
          <DashboardDetail label="Established" value={profile.yearEstablished} />
          <DashboardDetail label="Team Size" value={profile.employeeCount} />
          <DashboardDetail label="City" value={profile.city} />
        </View>
      </DashboardSection>
      <DashboardAccountTypeSwitcher currentRole="business" />
    </View>
  );

  const tabContent = {
    overview: renderOverview,
    services: renderServices,
    bookings: renderBookings,
    team: renderTeam,
    profile: renderProfile,
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      error={error || servicesError}
      onRefresh={refreshDashboard}
      onTabChange={setActiveTab}
      refreshing={refreshing}
      roleTitle="Business"
      tabs={tabs}
    >
      {(tabContent[activeTab] || renderOverview)()}
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flexBtn: {
    flex: 1,
  },
  brandCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  coverImage: {
    width: '100%',
    height: 132,
  },
  coverRadius: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  coverGradient: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'flex-end',
  },
  verifiedWrap: {
    alignSelf: 'flex-end',
  },
  brandBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  logoWrap: {
    marginTop: -40,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
  },
  brandMeta: {
    gap: 2,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiTile: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  catalogList: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  catalogThumb: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  catalogBody: {
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
