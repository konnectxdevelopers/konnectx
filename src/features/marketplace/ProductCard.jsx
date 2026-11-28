import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon, AppPressable, AppText, Badge } from '../../components/ui';
import { colors, gradients, radii, shadows, spacing } from '../../theme/tokens';

function stockLabel(product) {
  const status =
    product.stockStatus ||
    (Number(product.stockQuantity || 0) > 0 ? 'in_stock' : 'out_of_stock');
  if (status === 'out_of_stock') return { label: 'Out of stock', tone: 'danger' };
  if (status === 'low_stock')
    return { label: `Only ${product.stockQuantity} left`, tone: 'warning' };
  return { label: 'In stock', tone: 'success' };
}

export function formatProductPrice(price, currency = 'INR') {
  const amount = Number(price || 0);
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${amount.toLocaleString('en-IN')}`;
}

export default function ProductCard({ product, onPress, horizontal = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const stock = stockLabel(product);
  const activeVariants = (product.variants || []).filter((v) => v.isActive !== false);
  const shopName =
    product.shop?.storeDisplayName ||
    product.shop?.businessName ||
    product.sellerName ||
    'Business shop';
  const locationText = [product.shop?.city, product.shop?.state].filter(Boolean).join(', ');
  const imageUri = !imageFailed && (product.coverImage || product.images?.[0] || null);

  return (
    <AppPressable
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.985}
      style={[styles.card, horizontal && styles.cardHorizontal]}
    >
      <View style={[styles.mediaWrap, horizontal && styles.mediaHorizontal]}>
        {imageUri ? (
          <Image
            accessibilityLabel={product.name}
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: imageUri }}
            style={styles.image}
          />
        ) : (
          <LinearGradient colors={gradients.imagePlaceholder} style={styles.placeholder}>
            <AppIcon color={colors.primary} name="shopping-outline" size={30} />
          </LinearGradient>
        )}
        {product.discountPercent > 0 ? (
          <View style={styles.discountBadge}>
            <AppText color={colors.inverse} variant="micro">
              {`${product.discountPercent}% OFF`}
            </AppText>
          </View>
        ) : null}
        <View style={styles.stockBadge}>
          <Badge label={stock.label} size="sm" tone={stock.tone} />
        </View>
      </View>

      <View style={[styles.body, horizontal && styles.bodyHorizontal]}>
        <AppText color={colors.primary} numberOfLines={1} style={styles.categoryText} variant="micro">
          {[product.brand, product.subcategoryName || product.categoryName]
            .filter(Boolean)
            .join(' · ') || 'Product'}
        </AppText>

        <AppText numberOfLines={2} variant="h4">
          {product.name}
        </AppText>

        {product.shortDescription && !horizontal ? (
          <AppText color={colors.textSecondary} numberOfLines={2} variant="caption">
            {product.shortDescription}
          </AppText>
        ) : null}

        <View style={styles.priceRow}>
          <AppText style={styles.price} variant="h3">
            {formatProductPrice(product.price, product.currency)}
          </AppText>
          {product.compareAtPrice && product.compareAtPrice > product.price ? (
            <AppText color={colors.muted} style={styles.strikePrice} variant="caption">
              {formatProductPrice(product.compareAtPrice, product.currency)}
            </AppText>
          ) : null}
        </View>

        {activeVariants.length > 0 ? (
          <View style={styles.variantPillRow}>
            <AppIcon color={colors.muted} name="shape-outline" size={13} />
            <AppText color={colors.muted} numberOfLines={1} variant="micro">
              {activeVariants.length} {activeVariants.length === 1 ? 'variant' : 'variants'}
            </AppText>
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <View style={styles.shopCopy}>
            <AppIcon
              color={
                product.shop?.verificationStatus === 'verified' ? colors.primary : colors.muted
              }
              name={
                product.shop?.verificationStatus === 'verified'
                  ? 'check-decagram'
                  : 'storefront-outline'
              }
              size={14}
            />
            <AppText color={colors.textSecondary} numberOfLines={1} style={styles.shopText} variant="caption">
              {shopName}
              {locationText ? ` · ${locationText}` : ''}
            </AppText>
          </View>
          <AppIcon color={colors.subtle} name="chevron-right" size={17} />
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
  cardHorizontal: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  mediaWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceAlt,
  },
  mediaHorizontal: {
    width: 128,
    aspectRatio: undefined,
    minHeight: 168,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  stockBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  bodyHorizontal: {
    flex: 1,
    justifyContent: 'center',
  },
  categoryText: {
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  price: {
    letterSpacing: -0.4,
  },
  strikePrice: {
    textDecorationLine: 'line-through',
  },
  variantPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  shopCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shopText: {
    flexShrink: 1,
  },
});
