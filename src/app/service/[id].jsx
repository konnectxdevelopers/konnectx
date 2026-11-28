import { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppIcon,
  AppInput,
  AppModal,
  AppPressable,
  AppText,
  Badge,
  ErrorState,
  InlineAlert,
  LoadingState,
  useToast,
} from '../../components/ui';
import {
  getFavoritesRequest,
  getServiceDetailRequest,
  removeFavoriteRequest,
  saveFavoriteRequest,
  sendEnquiryRequest,
} from '../../services/marketplace/marketplaceService';
import { dashboardArtworkForCategory } from '../../features/profile/dashboardAssets';
import { colors, radii, spacing } from '../../theme/tokens';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DELIVERY_LABELS = {
  customer_location: 'At your location',
  provider_location: 'At provider location',
  online: 'Online',
  remote: 'Remote',
  hybrid: 'Online and in person',
};
const PRICING_LABELS = {
  fixed: 'Fixed price',
  hourly: 'Hourly',
  per_visit: 'Per visit',
  per_day: 'Per day',
  negotiable: 'Negotiable',
  starting_from: 'Starting from',
  quote_required: 'Quote required',
};

function formattedPrice(service) {
  if (service.price === null || service.price === undefined) {
    if (service.pricingType === 'quote_required') return 'Quote required';
    return service.pricingType === 'negotiable' ? 'Negotiable' : 'Contact provider for pricing';
  }
  const amount = `${service.currency || ''} ${service.price}`.trim();
  return service.pricingType === 'starting_from'
    ? `${PRICING_LABELS.starting_from} ${amount}`
    : `${amount}${PRICING_LABELS[service.pricingType] ? ` · ${PRICING_LABELS[service.pricingType]}` : ''}`;
}

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams();
  const serviceId = Array.isArray(id) ? id[0] : id;
  const { session } = useAuth();
  const toast = useToast();
  const [service, setService] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [loadedServiceId, setLoadedServiceId] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [sending, setSending] = useState(false);
  const loading = Boolean(serviceId && loadedServiceId !== serviceId);

  useEffect(() => {
    let active = true;
    if (!serviceId) return undefined;
    getServiceDetailRequest(serviceId)
      .then((response) => {
        if (active) {
          setService(response.service);
          setError(null);
          setLoadedServiceId(serviceId);
        }
      })
      .catch((requestError) => {
        if (active) {
          setService(null);
          setError(requestError);
          setLoadedServiceId(serviceId);
        }
      });
    return () => {
      active = false;
    };
  }, [serviceId]);

  useEffect(() => {
    if (!session?.token || !serviceId) return undefined;
    let active = true;
    getFavoritesRequest(session)
      .then((res) => {
        if (active) {
          setSaved((res.favorites || []).some((fav) => fav.type === 'service' && fav.id === serviceId));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [serviceId, session]);

  const images = useMemo(
    () => (service?.media || []).filter((item) => item.mediaType === 'image' && item.url),
    [service]
  );
  const video = service?.media?.find((item) => item.mediaType === 'video' && item.url);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader onBack={() => router.back()} showBack title="Service Details" />
        <LoadingState message="Loading service details..." />
      </SafeAreaView>
    );
  }

  if (error && !service) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader onBack={() => router.back()} showBack title="Service Details" />
        <View style={styles.stateWrap}>
          <ErrorState
            message={error?.message || (serviceId ? 'Service could not be loaded.' : 'Service ID is missing.')}
            onRetry={() => router.back()}
            retryLabel="Go Back"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader onBack={() => router.back()} showBack title="Service Details" />
        <View style={styles.stateWrap}>
          <ErrorState
            message="Service ID is missing."
            onRetry={() => router.back()}
            retryLabel="Go Back"
          />
        </View>
      </SafeAreaView>
    );
  }

  const openVideo = async () => {
    try {
      await Linking.openURL(video.url);
    } catch (openError) {
      setError(new Error('The demonstration video could not be opened.', { cause: openError }));
    }
  };

  const toggleSave = async () => {
    try {
      if (saved) {
        await removeFavoriteRequest(session, 'service', service.id);
        setSaved(false);
        toast?.show?.('Removed from saved services.');
      } else {
        await saveFavoriteRequest(session, 'service', service.id);
        setSaved(true);
        toast?.show?.('Saved to favorites.', { variant: 'success' });
      }
    } catch (err) {
      setError(err);
    }
  };

  const sendEnquiry = async () => {
    if (!enquiryMessage.trim()) return;
    setSending(true);
    try {
      await sendEnquiryRequest(session, 'service', service.id, enquiryMessage.trim());
      setEnquiryOpen(false);
      setEnquiryMessage('');
      toast?.show?.('Enquiry sent to provider.', { variant: 'success' });
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  };

  const customAttrEntries = Object.entries(service.customAttributes || {}).filter(([, val]) => val !== null && val !== undefined && val !== '');

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader onBack={() => router.back()} title="Service Details" />
      <ScrollView contentContainerStyle={styles.content}>
        <Image
          accessibilityLabel={service.title}
          source={images.length
            ? { uri: images[selectedImage]?.url || images[0].url }
            : dashboardArtworkForCategory(service.categoryName || service.title)}
          style={styles.heroImage}
          resizeMode="cover"
        />
        {images.length > 1 ? (
          <ScrollView horizontal contentContainerStyle={styles.gallery} showsHorizontalScrollIndicator={false}>
            {images.map((image, index) => (
              <AppPressable
                key={image.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedImage === index }}
                onPress={() => setSelectedImage(index)}
              >
                <Image
                  source={{ uri: image.url }}
                  style={[styles.thumbnail, selectedImage === index && styles.thumbnailSelected]}
                />
              </AppPressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.headerBlock}>
          <View style={styles.badgeRow}>
            <Badge
              label={service.providerRole === 'business' ? 'Business' : 'Professional'}
              variant="neutral"
            />
            {service.providerVerified ? <Badge label="Verified" variant="success" /> : null}
          </View>
          <AppText variant="h2" color={colors.text}>{service.title}</AppText>
          <AppText variant="body" color={colors.muted}>
            {service.providerRole === 'business'
              ? `Offered by ${service.businessName || service.providerName || 'Business provider'}`
              : `By ${service.providerName || 'Independent professional'}`}
          </AppText>
          {service.categoryName ? (
            <AppText variant="caption" color={colors.textSecondary}>
              {service.categoryName}{service.subcategoryName ? ` · ${service.subcategoryName}` : ''}
            </AppText>
          ) : null}
          <AppText variant="subtitle" color={colors.primary}>{formattedPrice(service)}</AppText>
          {service.minPrice !== null && service.maxPrice !== null ? (
            <AppText variant="caption" color={colors.muted}>
              Price range: {service.currency} {service.minPrice} – {service.maxPrice}
            </AppText>
          ) : null}
          {service.reviewCount > 0 && service.ratingAvg !== null ? (
            <View style={styles.metaRow}>
              <AppIcon name="star" size={16} color={colors.warning} />
              <AppText variant="caption" color={colors.textSecondary}>
                {service.ratingAvg} from {service.reviewCount} reviews
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" color={colors.muted}>No verified customer reviews yet</AppText>
          )}
        </View>

        <View style={styles.section}>
          <AppText variant="subtitle" color={colors.text}>About this service</AppText>
          {service.shortDescription ? (
            <AppText variant="label" color={colors.textSecondary}>{service.shortDescription}</AppText>
          ) : null}
          <AppText variant="body" color={colors.textSecondary}>{service.description}</AppText>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.metaRow}>
            <AppIcon name="handshake-outline" size={18} color={colors.primary} />
            <AppText variant="body" color={colors.textSecondary}>
              {DELIVERY_LABELS[service.deliveryMethod] || service.deliveryMethod}
            </AppText>
          </View>
          {service.durationValue ? (
            <View style={styles.metaRow}>
              <AppIcon name="clock-outline" size={18} color={colors.primary} />
              <AppText variant="body" color={colors.textSecondary}>
                Estimated duration: {service.durationValue} {service.durationUnit}
              </AppText>
            </View>
          ) : null}
          {service.bookingLeadTimeHours !== null && service.bookingLeadTimeHours !== undefined ? (
            <View style={styles.metaRow}>
              <AppIcon name="calendar-clock-outline" size={18} color={colors.primary} />
              <AppText variant="body" color={colors.textSecondary}>
                Booking lead time: {service.bookingLeadTimeHours} hour{service.bookingLeadTimeHours === 1 ? '' : 's'}
              </AppText>
            </View>
          ) : null}
          {service.locations?.length ? service.locations.map((location, index) => (
            <View key={`${location.city}-${index}`} style={styles.metaRow}>
              <AppIcon name="map-marker-outline" size={18} color={colors.primary} />
              <AppText variant="body" color={colors.textSecondary}>
                {[location.area, location.city, location.state, location.country].filter(Boolean).join(', ')}
                {location.radiusKm ? ` · within ${location.radiusKm} km` : ''}
              </AppText>
            </View>
          )) : null}
        </View>

        {customAttrEntries.length ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Service Specifications</AppText>
            {customAttrEntries.map(([key, val]) => (
              <AppText key={key} variant="body" color={colors.textSecondary}>
                {key.replace(/_/g, ' ')}: {String(val)}
              </AppText>
            ))}
          </View>
        ) : null}

        {service.packages?.length ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Packages</AppText>
            {service.packages.map((pkg, idx) => (
              <View key={`${pkg.name}-${idx}`} style={styles.subCard}>
                <AppText variant="label" color={colors.text}>
                  {pkg.name}{pkg.price !== null && pkg.price !== undefined ? ` · ${service.currency || 'INR'} ${pkg.price}` : ''}
                </AppText>
                {pkg.description ? (
                  <AppText variant="caption" color={colors.textSecondary}>{pkg.description}</AppText>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {service.availability?.length ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Availability</AppText>
            {service.availability.map((slot, index) => (
              <AppText key={`${slot.dayOfWeek}-${slot.startTime}-${index}`} variant="body" color={colors.textSecondary}>
                {DAYS[slot.dayOfWeek]} · {slot.startTime}–{slot.endTime}
              </AppText>
            ))}
          </View>
        ) : null}

        {service.tags?.length ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Specialties</AppText>
            <View style={styles.tagRow}>
              {service.tags.map((tag) => (
                <Badge key={tag} label={tag} variant="neutral" />
              ))}
            </View>
          </View>
        ) : null}

        {service.inclusions?.length ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>What&apos;s included</AppText>
            {service.inclusions.map((item, index) => (
              <AppText key={`inclusion-${index}`} variant="body" color={colors.textSecondary}>
                · {item}
              </AppText>
            ))}
          </View>
        ) : null}

        {service.exclusions?.length ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Not included</AppText>
            {service.exclusions.map((item, index) => (
              <AppText key={`exclusion-${index}`} variant="body" color={colors.muted}>
                · {item}
              </AppText>
            ))}
          </View>
        ) : null}

        {service.customerRequirements ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Before your service</AppText>
            <AppText variant="body" color={colors.textSecondary}>{service.customerRequirements}</AppText>
          </View>
        ) : null}

        {service.cancellationPolicy ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Cancellation policy</AppText>
            <AppText variant="body" color={colors.textSecondary}>{service.cancellationPolicy}</AppText>
          </View>
        ) : null}

        {service.termsAndConditions ? (
          <View style={styles.section}>
            <AppText variant="subtitle" color={colors.text}>Terms and conditions</AppText>
            <AppText variant="body" color={colors.textSecondary}>{service.termsAndConditions}</AppText>
          </View>
        ) : null}

        {video ? (
          <AppButton
            icon="play-circle-outline"
            onPress={openVideo}
            title="Open demonstration video"
            variant="secondary"
          />
        ) : null}
        {error ? <InlineAlert message={error.message} variant="error" /> : null}

        {session?.token ? (
          <View style={styles.actionRow}>
            <AppButton
              onPress={toggleSave}
              style={styles.flex}
              title={saved ? 'Saved' : 'Save'}
              variant={saved ? 'secondary' : 'outline'}
            />
            <AppButton
              onPress={() => setEnquiryOpen(true)}
              style={styles.flex}
              title="Enquire"
              variant="cta"
            />
          </View>
        ) : null}

        <View style={styles.notice}>
          <AppIcon name="information-outline" size={18} color={colors.info} />
          <AppText variant="caption" color={colors.textSecondary} style={styles.flex}>
            Direct booking scheduling will be enabled in the next phase. You can save or enquire with this provider now.
          </AppText>
        </View>
      </ScrollView>

      <AppModal
        actions={(
          <>
            <AppButton loading={sending} onPress={sendEnquiry} title="Send enquiry" />
            <AppButton onPress={() => setEnquiryOpen(false)} title="Cancel" variant="outline" />
          </>
        )}
        onClose={() => setEnquiryOpen(false)}
        title="Enquire About Service"
        visible={enquiryOpen}
      >
        <AppInput
          label="Message"
          maxLength={3000}
          multiline
          onChangeText={setEnquiryMessage}
          placeholder="Share your requirements, preferred date, or questions."
          value={enquiryMessage}
        />
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  stateWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  heroImage: { width: '100%', height: 240, borderRadius: radii.xl },
  gallery: { gap: spacing.sm },
  thumbnail: { width: 76, height: 76, borderRadius: radii.md, borderWidth: 2, borderColor: 'transparent' },
  thumbnailSelected: { borderColor: colors.primary },
  headerBlock: { gap: spacing.xs },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  section: {
    gap: spacing.xs,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subCard: {
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    gap: 2,
  },
  infoCard: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.infoSoft,
    borderRadius: radii.md,
  },
});
