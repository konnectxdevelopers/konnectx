import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppIcon, AppPressable, AppText, Badge } from '../../components/ui';
import { colors, radii, shadows, spacing } from '../../theme/tokens';
import { dashboardArtworkForCategory } from '../profile/dashboardAssets';

const pricingLabels = {
  fixed: 'Fixed price',
  hourly: 'Hourly',
  per_visit: 'Per visit',
  per_day: 'Per day',
  negotiable: 'Negotiable',
  starting_from: 'Starting from',
  quote_required: 'Quote required',
};

function priceLabel(service) {
  if (service.price === null || service.price === undefined) {
    if (service.pricingType === 'quote_required') return 'Quote required';
    return service.pricingType === 'negotiable' ? 'Negotiable' : 'Contact for price';
  }
  const amount = `${service.currency || ''} ${service.price}`.trim();
  return service.pricingType === 'starting_from'
    ? `${pricingLabels.starting_from} ${amount}`
    : `${amount}${
        pricingLabels[service.pricingType] ? ` · ${pricingLabels[service.pricingType]}` : ''
      }`;
}

export default function ServiceListingCard({ service, onPress, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = service.media?.find((item) => item.mediaType === 'image' && item.url);
  const location = service.locations?.[0];
  const serviceArea = location
    ? [location.area, location.city].filter(Boolean).join(', ')
    : service.deliveryMethod === 'online' || service.deliveryMethod === 'remote'
      ? 'Online'
      : null;
  const providerName = service.businessName || service.providerName || 'Service provider';
  const fallback = dashboardArtworkForCategory(service.categoryName || service.title);

  return (
    <AppPressable
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.985}
      style={[styles.card, compact && styles.compact]}
    >
      <View style={[styles.mediaWrap, compact && styles.compactMediaWrap]}>
        {image?.url && !imageFailed ? (
          <Image
            accessibilityLabel={service.title}
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: image.url }}
            style={styles.image}
          />
        ) : (
          <Image
            accessibilityLabel={service.title}
            resizeMode="cover"
            source={fallback}
            style={styles.image}
          />
        )}
        <View style={styles.badgeOverlay}>
          <Badge
            label={service.providerRole === 'business' ? 'Business' : 'Professional'}
            size="sm"
            tone="dark"
          />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText numberOfLines={compact ? 2 : 1} style={styles.title} variant="h4">
            {service.title}
          </AppText>
          {service.providerVerified ? (
            <AppIcon color={colors.success} name="check-decagram" size={16} />
          ) : null}
        </View>
        <AppText color={colors.muted} numberOfLines={1} variant="caption">
          {providerName}
        </AppText>
        {!compact && service.shortDescription ? (
          <AppText color={colors.textSecondary} numberOfLines={2} variant="caption">
            {service.shortDescription}
          </AppText>
        ) : null}
        <View style={styles.footer}>
          <AppText color={colors.primary} numberOfLines={1} style={styles.price} variant="label">
            {priceLabel(service)}
          </AppText>
          <View style={styles.meta}>
            {serviceArea ? (
              <>
                <AppIcon color={colors.muted} name="map-marker-outline" size={13} />
                <AppText color={colors.muted} numberOfLines={1} style={styles.metaText} variant="micro">
                  {serviceArea}
                </AppText>
              </>
            ) : null}
            {service.reviewCount > 0 && service.ratingAvg !== null ? (
              <>
                <AppIcon color={colors.star} name="star" size={13} />
                <AppText color={colors.textSecondary} variant="micro">
                  {service.ratingAvg} ({service.reviewCount})
                </AppText>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    ...shadows.sm,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  mediaWrap: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceAlt,
  },
  compactMediaWrap: {
    width: 116,
    aspectRatio: undefined,
    minHeight: 154,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badgeOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  body: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
  footer: {
    gap: 4,
    marginTop: 'auto',
    paddingTop: spacing.xs,
  },
  price: {
    flexShrink: 1,
  },
  meta: {
    minHeight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  metaText: {
    flexShrink: 1,
  },
});
