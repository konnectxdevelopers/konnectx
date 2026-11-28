import { useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, AppIcon, AppPressable, AppText, Badge } from '../../components/ui';
import { dashboardArtworkForCategory } from '../profile/dashboardAssets';
import { colors, radii, spacing } from '../../theme/tokens';

const TYPE_LABELS = {
  service: 'Service',
  product: 'Product',
  job: 'Job',
  freelance_project: 'Freelance Project',
  professional_profile: 'Professional Profile',
  business_profile: 'Business Profile',
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatPrice(listing) {
  const d = listing?.details || {};
  if (listing?.listingType === 'service') {
    if (d.price === null || d.price === undefined) {
      if (d.pricingType === 'quote_required') return 'Quote required';
      return d.pricingType === 'negotiable' ? 'Negotiable' : 'Contact provider';
    }
    const amount = `${d.currency || 'INR'} ${d.price}`.trim();
    if (d.pricingType === 'starting_from') return `Starting from ${amount}`;
    if (d.pricingType === 'per_visit') return `${amount} · Per visit`;
    if (d.pricingType === 'hourly') return `${amount} · Hourly`;
    if (d.pricingType === 'per_day') return `${amount} · Per day`;
    return amount;
  }
  if (listing?.listingType === 'product') {
    return d.price !== undefined && d.price !== null ? `${d.currency || 'INR'} ${d.price}` : null;
  }
  if (listing?.listingType === 'job') {
    if (d.salaryMin !== null && d.salaryMin !== undefined && d.salaryMax !== null && d.salaryMax !== undefined) {
      return `${d.currency || 'INR'} ${d.salaryMin} – ${d.salaryMax}`;
    }
    if (d.salaryMin !== null && d.salaryMin !== undefined) {
      return `From ${d.currency || 'INR'} ${d.salaryMin}`;
    }
    return null;
  }
  if (listing?.listingType === 'freelance_project') {
    return d.budget !== null && d.budget !== undefined ? `Budget: ${d.currency || 'INR'} ${d.budget}` : 'Open budget';
  }
  if (listing?.listingType === 'professional_profile' && d.startingPrice) {
    return `Starting from ${d.currency || 'INR'} ${d.startingPrice}`;
  }
  return null;
}

function formatLocation(listing) {
  const loc = listing?.location;
  if (!loc) return listing?.details?.location || null;
  if (typeof loc === 'string') return loc;
  return [loc.area, loc.city, loc.state, loc.country].filter(Boolean).join(', ') || null;
}

export default function ListingPreviewContent({ listing, isPreview = false }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (!listing) return null;

  const images = (listing.media || []).filter((item) => item.mediaType === 'image' && (item.url || item.previewUri));
  const videos = (listing.media || []).filter((item) => item.mediaType === 'video' && (item.url || item.previewUri));
  const attachments = (listing.media || []).filter((item) => item.mediaType === 'document' && item.visibility !== 'private' && (item.url || item.previewUri));
  const activeImage = images[selectedIndex] || images[0] || listing.coverImage || null;
  const activeImageUri = activeImage?.url || activeImage?.previewUri || null;
  const priceText = formatPrice(listing);
  const locationText = formatLocation(listing);
  const details = listing.details || {};
  const ownerName = listing.owner?.businessName || listing.owner?.displayName || 'KonnectX Member';

  return (
    <View style={styles.container}>
      {isPreview ? (
        <View style={styles.previewBanner}>
          <AppIcon name="eye-outline" size={18} color={colors.primary} />
          <AppText variant="caption" color={colors.primary} style={styles.flex}>
            Customer Preview — This is exactly how your published listing will appear.
          </AppText>
        </View>
      ) : null}

      <Image
        accessibilityLabel={activeImage?.altText || listing.title}
        resizeMode="cover"
        source={activeImageUri
          ? { uri: activeImageUri }
          : dashboardArtworkForCategory(listing.categoryName || listing.title)}
        style={styles.heroImage}
      />

      {images.length > 1 ? (
        <ScrollView horizontal contentContainerStyle={styles.gallery} showsHorizontalScrollIndicator={false}>
          {images.map((item, index) => (
            <AppPressable
              key={item.id || `${index}`}
              onPress={() => setSelectedIndex(index)}
            >
              <Image
                source={{ uri: item.url || item.previewUri }}
                style={[styles.thumb, selectedIndex === index && styles.thumbSelected]}
              />
            </AppPressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.headerBlock}>
        <View style={styles.badgeRow}>
          <Badge label={TYPE_LABELS[listing.listingType] || listing.listingType} variant="neutral" />
          {listing.owner?.verified ? <Badge label="Verified" variant="success" /> : null}
          {listing.visibility && listing.visibility !== 'public' ? (
            <Badge label={listing.visibility} variant="warning" />
          ) : null}
        </View>
        <AppText variant="h2" color={colors.text}>{listing.title}</AppText>
        <AppText variant="body" color={colors.muted}>By {ownerName}</AppText>
        {listing.categoryName ? (
          <AppText variant="caption" color={colors.textSecondary}>
            {listing.categoryName}{listing.subcategoryName ? ` · ${listing.subcategoryName}` : ''}
          </AppText>
        ) : null}
        {priceText ? (
          <AppText variant="subtitle" color={colors.primary}>{priceText}</AppText>
        ) : null}
      </View>

      {listing.shortSummary ? (
        <View style={styles.card}>
          <AppText variant="label" color={colors.text}>Summary</AppText>
          <AppText variant="body" color={colors.textSecondary}>{listing.shortSummary}</AppText>
        </View>
      ) : null}

      {listing.description ? (
        <View style={styles.card}>
          <AppText variant="subtitle" color={colors.text}>Details</AppText>
          <AppText variant="body" color={colors.textSecondary}>{listing.description}</AppText>
        </View>
      ) : null}

      <View style={styles.card}>
        <AppText variant="subtitle" color={colors.text}>Key Information</AppText>
        {locationText ? (
          <InfoRow icon="map-marker-outline" text={locationText} />
        ) : null}
        {details.workMode ? (
          <InfoRow icon="laptop" text={`Work mode: ${details.workMode}`} />
        ) : null}
        {details.employmentType ? (
          <InfoRow icon="briefcase-outline" text={`Employment: ${details.employmentType}`} />
        ) : null}
        {details.deliveryMethod ? (
          <InfoRow icon="handshake-outline" text={`Delivery: ${details.deliveryMethod.replace(/_/g, ' ')}`} />
        ) : null}
        {details.durationValue ? (
          <InfoRow icon="clock-outline" text={`Duration: ${details.durationValue} ${details.durationUnit || ''}`} />
        ) : null}
        {listing.listingType === 'product' ? (
          <InfoRow icon="package-variant" text={`Stock available: ${details.stockQuantity ?? 0}`} />
        ) : null}
        {details.deliveryInfo ? (
          <InfoRow icon="truck-delivery-outline" text={details.deliveryInfo} />
        ) : null}
        {details.deadline ? (
          <InfoRow icon="calendar-outline" text={`Deadline: ${String(details.deadline).slice(0, 10)}`} />
        ) : null}
        {details.experienceRequired ? (
          <InfoRow icon="account-star-outline" text={`Experience: ${details.experienceRequired}`} />
        ) : null}
        {details.educationRequired ? (
          <InfoRow icon="school-outline" text={`Education: ${details.educationRequired}`} />
        ) : null}
        {details.industry ? (
          <InfoRow icon="domain" text={`Industry: ${details.industry}`} />
        ) : null}
      </View>

      {(details.skills?.length || details.requiredSkills?.length || details.tags?.length) ? (
        <View style={styles.card}>
          <AppText variant="subtitle" color={colors.text}>
            {listing.listingType === 'service' ? 'Tags' : 'Skills'}
          </AppText>
          <View style={styles.badgeRow}>
            {(details.skills || details.requiredSkills || details.tags || []).map((item, idx) => (
              <Badge key={`${item}-${idx}`} label={item} variant="neutral" />
            ))}
          </View>
        </View>
      ) : null}

      {details.deliverables ? (
        <View style={styles.card}>
          <AppText variant="subtitle" color={colors.text}>Deliverables</AppText>
          <AppText variant="body" color={colors.textSecondary}>{details.deliverables}</AppText>
        </View>
      ) : null}

      {details.availability?.length ? (
        <View style={styles.card}>
          <AppText variant="subtitle" color={colors.text}>Availability</AppText>
          {details.availability.map((slot, idx) => (
            <AppText key={`${slot.dayOfWeek}-${idx}`} variant="body" color={colors.textSecondary}>
              {DAYS[slot.dayOfWeek]} · {slot.startTime}–{slot.endTime}
            </AppText>
          ))}
        </View>
      ) : null}

      {videos.map((video, idx) => (
        <AppButton
          key={video.id || `video-${idx}`}
          icon="play-circle-outline"
          onPress={() => video.url && Linking.openURL(video.url)}
          title="Open video"
          variant="secondary"
        />
      ))}

      {attachments.map((doc, idx) => (
        <AppButton
          key={doc.id || `doc-${idx}`}
          icon="file-pdf-box"
          onPress={() => doc.url && Linking.openURL(doc.url)}
          title={doc.altText || `Attachment ${idx + 1}`}
          variant="outline"
        />
      ))}
    </View>
  );
}

function InfoRow({ icon, text }) {
  return (
    <View style={styles.infoRow}>
      <AppIcon name={icon} size={18} color={colors.primary} />
      <AppText variant="body" color={colors.textSecondary} style={styles.flex}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  flex: { flex: 1 },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  heroImage: { width: '100%', height: 220, borderRadius: radii.xl, backgroundColor: colors.surfaceMuted },
  gallery: { gap: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: radii.md, borderWidth: 2, borderColor: 'transparent' },
  thumbSelected: { borderColor: colors.primary },
  headerBlock: { gap: spacing.xs },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

