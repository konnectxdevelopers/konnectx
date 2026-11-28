import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppIcon, AppPressable, AppText, Badge } from '../../components/ui';
import ProductCard, { formatProductPrice } from './ProductCard';
import ServiceListingCard from './ServiceListingCard';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const SECTION_TYPES = {
  service: 'services',
  services: 'services',
  product: 'products',
  products: 'products',
  professional: 'professionals',
  professional_profile: 'professionals',
  professionals: 'professionals',
  job: 'jobs',
  jobs: 'jobs',
  project: 'projects',
  freelance_project: 'projects',
  projects: 'projects',
  business: 'businesses',
  business_profile: 'businesses',
  businesses: 'businesses',
};

const SECTION_ICONS = {
  services: 'wrench-outline',
  products: 'shopping-outline',
  professionals: 'account-tie-outline',
  jobs: 'briefcase-outline',
  projects: 'rocket-launch-outline',
  businesses: 'storefront-outline',
};

const SECTION_LABELS = {
  services: 'Service',
  products: 'Product',
  professionals: 'Professional',
  jobs: 'Job',
  projects: 'Project',
  businesses: 'Business',
};

function firstImage(item) {
  if (typeof item.coverImage === 'string') return item.coverImage;
  if (item.coverImage?.url) return item.coverImage.url;
  if (item.coverImage?.previewUri) return item.coverImage.previewUri;
  if (item.profileImageUrl) return item.profileImageUrl;
  const media = (item.media || []).find((entry) => entry.mediaType === 'image' && (entry.url || entry.previewUri));
  return media?.url || media?.previewUri || item.images?.[0] || null;
}

function locationLabel(item, details) {
  const location = item.location || details.location;
  if (typeof location === 'string') return location;
  if (location && typeof location === 'object') {
    return [location.area, location.city, location.state, location.country].filter(Boolean).join(', ');
  }
  return [item.city || details.city, item.state || details.state].filter(Boolean).join(', ');
}

function salaryLabel(item, details) {
  if (item.salaryUndisclosed || details.salaryUndisclosed) return 'Salary undisclosed';
  const min = item.salaryMin ?? details.salaryMin;
  const max = item.salaryMax ?? details.salaryMax;
  const currency = item.currency || details.currency || 'INR';
  if (min != null && max != null) return `${currency} ${Number(min).toLocaleString()}–${Number(max).toLocaleString()}`;
  if (min != null) return `From ${currency} ${Number(min).toLocaleString()}`;
  if (max != null) return `Up to ${currency} ${Number(max).toLocaleString()}`;
  return null;
}

function budgetLabel(item, details) {
  const currency = item.currency || details.currency || 'INR';
  const min = item.budgetMin ?? details.budgetMin;
  const max = item.budgetMax ?? details.budgetMax;
  const budget = item.budget ?? details.budget;
  if (min != null && max != null) return `${currency} ${Number(min).toLocaleString()}–${Number(max).toLocaleString()}`;
  if (budget != null) return `${currency} ${Number(budget).toLocaleString()}`;
  return item.budgetType === 'negotiable' || details.budgetType === 'negotiable'
    ? 'Negotiable budget'
    : 'Budget not disclosed';
}

function itemMetadata(section, item, details) {
  if (section === 'jobs') {
    return [
      item.employmentType || details.employmentType,
      item.workMode || details.workMode,
      item.experienceRequired || details.experienceRequired,
      locationLabel(item, details),
    ].filter(Boolean);
  }
  if (section === 'projects') {
    return [
      item.budgetType || details.budgetType,
      item.deadline || details.deadline ? `Deadline ${String(item.deadline || details.deadline).slice(0, 10)}` : null,
      item.workMode || details.workMode,
      locationLabel(item, details),
    ].filter(Boolean);
  }
  if (section === 'professionals') {
    return [
      item.category || details.primaryCategory || details.category,
      item.experienceYears != null || details.experienceYears != null
        ? `${item.experienceYears ?? details.experienceYears} years' experience`
        : null,
      locationLabel(item, details),
    ].filter(Boolean);
  }
  return [
    item.industry || details.industry || item.categoryName,
    locationLabel(item, details),
  ].filter(Boolean);
}

export default function MarketplaceListingCard({ item, type, onPress, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const section = SECTION_TYPES[type || item.listingType] || 'businesses';
  const details = item.details || {};

  if (section === 'services' && !compact) {
    const service = item.listingType
      ? {
        ...item,
        id: item.entityId || item.id,
        title: item.title,
        shortDescription: item.shortSummary || item.description,
        providerName: item.owner?.displayName,
        businessName: item.owner?.businessName,
        providerRole: item.owner?.role,
        providerVerified: item.owner?.verified,
        media: item.media,
        price: details.price,
        pricingType: details.pricingType,
        currency: details.currency,
        locations: details.locations,
        ratingAvg: details.ratingAvg,
        reviewCount: details.reviewCount,
      }
      : item;
    return <ServiceListingCard compact={compact} onPress={onPress} service={service} />;
  }
  if (section === 'products' && !compact) {
    const product = item.listingType
      ? {
        ...item,
        ...details,
        id: item.entityId || item.id,
        name: item.title,
        coverImage: firstImage(item),
        variants: Array.isArray(details.variants) ? details.variants : [],
      }
      : item;
    return <ProductCard horizontal={compact} onPress={onPress} product={product} />;
  }

  const imageUri = firstImage(item);
  const title = item.title || item.name || item.fullName || item.owner?.displayName || 'Marketplace listing';
  const ownerName = item.owner?.businessName || item.owner?.displayName ||
    item.employerName || item.clientName || item.businessName || item.sellerName || null;
  const metadata = itemMetadata(section, item, details);
  const rawSkills = item.skills || item.requiredSkills || details.skills || details.requiredSkills || [];
  const skills = Array.isArray(rawSkills) ? rawSkills : [];
  const summary = item.shortSummary || item.description || item.shortDescription || details.description;
  const price = section === 'jobs'
    ? salaryLabel(item, details)
    : section === 'projects'
      ? budgetLabel(item, details)
      : section === 'products'
        ? formatProductPrice(item.price ?? details.price, item.currency || details.currency)
        : section === 'services'
          ? details.price == null
            ? details.pricingType === 'quote_required' ? 'Quote required' : 'Contact for price'
            : `${details.currency || 'INR'} ${Number(details.price).toLocaleString()}`
          : null;
  const compactMetadata = metadata.slice(0, 2).join(' · ');
  const ownerText = typeof ownerName === 'string' ? ownerName.trim() : '';
  const distinctOwnerName = ownerText && ownerText.toLowerCase() !== String(title).trim().toLowerCase()
    ? ownerText
    : null;
  const compactSubtitle = distinctOwnerName || compactMetadata || `${SECTION_LABELS[section]} profile`;

  if (compact) {
    return (
      <AppPressable
        accessibilityRole="button"
        onPress={onPress}
        scaleTo={0.99}
        style={[styles.card, styles.compactCard]}
      >
        <View style={[styles.media, styles.compactMedia]}>
          {imageUri && !imageFailed ? (
            <Image
              accessibilityLabel={`${title} image`}
              onError={() => setImageFailed(true)}
              resizeMode="contain"
              source={{ uri: imageUri }}
              style={styles.image}
            />
          ) : (
            <View style={styles.placeholder}>
              <AppIcon color={colors.primary} name={SECTION_ICONS[section]} size={28} />
            </View>
          )}
        </View>
        <View style={[styles.body, styles.compactBody]}>
          <View style={styles.compactHeading}>
            <Badge label={SECTION_LABELS[section]} size="sm" tone="neutral" />
            <AppIcon color={colors.subtle} name="chevron-right" size={18} />
          </View>
          <AppText numberOfLines={2} variant="h4">{title}</AppText>
          <AppText color={colors.textSecondary} numberOfLines={1} variant="caption">
            {compactSubtitle}
          </AppText>
          {price ? <AppText color={colors.primary} numberOfLines={1} variant="label">{price}</AppText> : null}
        </View>
      </AppPressable>
    );
  }

  return (
    <AppPressable
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.99}
      style={[styles.card, compact && styles.compactCard]}
    >
      <View style={[styles.media, compact && styles.compactMedia]}>
        {imageUri && !imageFailed ? (
          <Image
            accessibilityLabel={`${title} image`}
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: imageUri }}
            style={styles.image}
          />
        ) : (
          <View style={styles.placeholder}>
            <AppIcon color={colors.primary} name={SECTION_ICONS[section]} size={28} />
          </View>
        )}
      </View>
      <View style={styles.body}>
        {section === 'jobs' || section === 'projects' ? (
          <View style={styles.badges}>
            {metadata.slice(0, 2).map((value) => <Badge key={value} label={value} variant="neutral" />)}
          </View>
        ) : null}
        <AppText numberOfLines={2} variant="subtitle">{title}</AppText>
        {ownerName ? (
          <AppText color={colors.primary} numberOfLines={1} variant="caption">{ownerName}</AppText>
        ) : null}
        {summary ? (
          <AppText color={colors.textSecondary} numberOfLines={2} variant="caption">{summary}</AppText>
        ) : null}
        {metadata.length ? (
          <AppText color={colors.muted} numberOfLines={2} variant="micro">{metadata.join(' · ')}</AppText>
        ) : null}
        {price ? <AppText color={colors.primary} variant="label">{price}</AppText> : null}
        {skills.length ? (
          <View style={styles.badges}>
            {skills.slice(0, 3).map((skill) => <Badge key={skill} label={skill} variant="neutral" />)}
          </View>
        ) : null}
      </View>
      <AppIcon color={colors.subtle} name="chevron-right" size={18} />
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  compactCard: {
    padding: 0,
    width: '100%',
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
    overflow: 'hidden',
  },
  media: {
    position: 'relative',
    width: 88,
    height: 92,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  compactMedia: {
    width: 116,
    height: 132,
    borderRadius: 0,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  compactBody: {
    padding: spacing.sm,
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  compactHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
});
