import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
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
import { formatProductPrice } from '../../features/marketplace/ProductCard';
import {
  getFavoritesRequest,
  getPublicProductDetailRequest,
  removeFavoriteRequest,
  saveFavoriteRequest,
  sendEnquiryRequest,
} from '../../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../../theme/tokens';

function variantDisplayLabel(variant) {
  const entries = Object.entries(variant?.attributes || {}).filter(([, val]) => Boolean(val));
  if (entries.length) {
    return entries.map(([, val]) => String(val)).join(' · ');
  }
  return variant?.sku || 'Option';
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [enquirySaving, setEnquirySaving] = useState(false);
  const [enquiryError, setEnquiryError] = useState(null);

  const loadProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getPublicProductDetailRequest(String(id));
      setDetail(response);
      const activeVars = (response.product?.variants || []).filter((v) => v.isActive !== false);
      setSelectedVariantId(activeVars[0]?.id || null);
      setSelectedMediaIndex(0);
    } catch (err) {
      setError(err?.message || 'Could not load this product.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    getPublicProductDetailRequest(String(id))
      .then((response) => {
        if (!active) return;
        setDetail(response);
        const activeVars = (response.product?.variants || []).filter((v) => v.isActive !== false);
        setSelectedVariantId(activeVars[0]?.id || null);
        setSelectedMediaIndex(0);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load this product.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;
    if (!session?.token || !id) return undefined;
    getFavoritesRequest(session)
      .then((res) => {
        if (!active) return;
        const saved = (res.favorites || []).some(
          (fav) => fav.type === 'product' && fav.id === String(id)
        );
        setIsSaved(saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, session]);

  const product = detail?.product || null;
  const shopLocation = detail?.shopLocation || null;
  const activeVariants = useMemo(
    () => (product?.variants || []).filter((v) => v.isActive !== false),
    [product]
  );
  const selectedVariant = useMemo(
    () => activeVariants.find((v) => v.id === selectedVariantId) || null,
    [activeVariants, selectedVariantId]
  );

  const effectivePrice = selectedVariant?.price ?? product?.price ?? 0;
  const effectiveCompareAt = selectedVariant?.compareAtPrice ?? product?.compareAtPrice ?? null;
  const effectiveStockQty = selectedVariant ? selectedVariant.stockQuantity : (product?.stockQuantity || 0);
  const effectiveStockStatus = effectiveStockQty <= 0
    ? 'out_of_stock'
    : effectiveStockQty <= 5
      ? 'low_stock'
      : 'in_stock';

  const mediaList = useMemo(() => product?.media || [], [product]);
  const activeMedia = mediaList[selectedMediaIndex] || mediaList[0] || null;

  const toggleSave = async () => {
    if (!session?.token) {
      showToast('Sign in to save products to your favorites.', 'info');
      return;
    }
    try {
      if (isSaved) {
        await removeFavoriteRequest(session, 'product', product.id);
        setIsSaved(false);
        showToast('Removed from saved items.', 'success');
      } else {
        await saveFavoriteRequest(session, 'product', product.id);
        setIsSaved(true);
        showToast('Saved to favorites.', 'success');
      }
    } catch (err) {
      showToast(err?.message || 'Could not update saved state.', 'error');
    }
  };

  const openEnquiry = () => {
    if (!session?.token) {
      showToast('Sign in as a customer to contact this shop.', 'info');
      return;
    }
    const variantSuffix = selectedVariant ? ` (Variant: ${variantDisplayLabel(selectedVariant)})` : '';
    setEnquiryMessage(`Hi, I am interested in "${product?.name || 'this product'}"${variantSuffix}. Is it currently available?`);
    setEnquiryError(null);
    setEnquiryOpen(true);
  };

  const submitEnquiry = async () => {
    if (!enquiryMessage.trim()) {
      setEnquiryError('Please write a message for the shop.');
      return;
    }
    setEnquirySaving(true);
    setEnquiryError(null);
    try {
      await sendEnquiryRequest(session, 'product', product.id, enquiryMessage.trim());
      setEnquiryOpen(false);
      showToast('Enquiry sent to the shop.', 'success');
    } catch (err) {
      setEnquiryError(err?.message || 'Could not send enquiry.');
    } finally {
      setEnquirySaving(false);
    }
  };

  const specEntries = (() => {
    const attributes = product?.attributes;
    if (!attributes) return [];
    const schemaLabels = new Map(
      (detail?.schema?.attributes || []).map((attr) => [attr.key, attr.label])
    );
    return Object.entries(attributes)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => ({
        key,
        label: schemaLabels.get(key) || key.replace(/_/g, ' '),
        value: String(value),
      }));
  })();

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        title={product?.name || 'Product Details'}
        subtitle={product?.shop?.storeDisplayName || product?.shop?.businessName || 'Marketplace Product'}
        rightAction={product ? {
          icon: isSaved ? 'heart' : 'heart-outline',
          onPress: toggleSave,
        } : undefined}
      />

      {loading ? (
        <LoadingState message="Loading product details..." />
      ) : error || !product ? (
        <ErrorState message={error || 'Product was not found.'} onRetry={loadProduct} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.galleryCard}>
            {activeMedia?.url ? (
              <Image source={{ uri: activeMedia.url }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroPlaceholder}>
                <AppIcon name="shopping-outline" size={44} color={colors.muted} />
              </View>
            )}
            {mediaList.length > 1 ? (
              <ScrollView contentContainerStyle={styles.thumbRail} horizontal showsHorizontalScrollIndicator={false}>
                {mediaList.map((m, index) => (
                  <AppPressable
                    key={m.id || m.mediaAssetId}
                    onPress={() => setSelectedMediaIndex(index)}
                    style={[styles.thumbWrap, selectedMediaIndex === index && styles.thumbWrapActive]}
                  >
                    {m.url && m.mediaRole !== 'video' ? (
                      <Image source={{ uri: m.url }} style={styles.thumbImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.thumbVideo}>
                        <AppIcon name="play-circle-outline" size={22} color={colors.primary} />
                      </View>
                    )}
                  </AppPressable>
                ))}
              </ScrollView>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.badgeRow}>
              {product.categoryName ? <Badge label={product.categoryName} variant="neutral" /> : null}
              {product.subcategoryName ? <Badge label={product.subcategoryName} variant="neutral" /> : null}
              {product.productCondition ? (
                <Badge label={product.productCondition.replace('_', ' ')} variant="info" />
              ) : null}
            </View>

            <AppText variant="h2" color={colors.text}>{product.name}</AppText>
            {product.brand ? (
              <AppText variant="label" color={colors.primary}>Brand: {product.brand}</AppText>
            ) : null}
            {product.shortDescription ? (
              <AppText variant="body" color={colors.textSecondary}>{product.shortDescription}</AppText>
            ) : null}

            <View style={styles.priceRow}>
              <AppText variant="h2" color={colors.text}>
                {formatProductPrice(effectivePrice, product.currency)}
              </AppText>
              {effectiveCompareAt && effectiveCompareAt > effectivePrice ? (
                <>
                  <AppText variant="h4" color={colors.muted} style={styles.strike}>
                    {formatProductPrice(effectiveCompareAt, product.currency)}
                  </AppText>
                  <Badge
                    label={`${Math.round(((effectiveCompareAt - effectivePrice) / effectiveCompareAt) * 100)}% OFF`}
                    variant="success"
                  />
                </>
              ) : null}
            </View>

            <View style={styles.stockRow}>
              <Badge
                label={
                  effectiveStockStatus === 'out_of_stock'
                    ? 'Out of stock'
                    : effectiveStockStatus === 'low_stock'
                      ? `Low stock (${effectiveStockQty} available)`
                      : `In stock (${effectiveStockQty} available)`
                }
                variant={
                  effectiveStockStatus === 'out_of_stock'
                    ? 'danger'
                    : effectiveStockStatus === 'low_stock'
                      ? 'warning'
                      : 'success'
                }
              />
              {selectedVariant?.sku || product.sku ? (
                <AppText variant="caption" color={colors.muted}>
                  SKU: {selectedVariant?.sku || product.sku}
                </AppText>
              ) : null}
            </View>

            {activeVariants.length > 0 ? (
              <View style={styles.variantSection}>
                <AppText variant="label" color={colors.text}>Select Variant</AppText>
                <View style={styles.variantGrid}>
                  {activeVariants.map((variant) => {
                    const selected = variant.id === selectedVariant?.id;
                    return (
                      <AppPressable
                        key={variant.id}
                        onPress={() => setSelectedVariantId(variant.id)}
                        style={[styles.variantChip, selected && styles.variantChipActive]}
                      >
                        <AppText
                          variant="label"
                          color={selected ? colors.inverse : colors.text}
                        >
                          {variantDisplayLabel(variant)}
                        </AppText>
                        <AppText
                          variant="caption"
                          color={selected ? 'rgba(255,255,255,0.85)' : colors.muted}
                        >
                          {formatProductPrice(variant.price ?? product.price, product.currency)} · {variant.stockQuantity > 0 ? `${variant.stockQuantity} left` : 'Out'}
                        </AppText>
                      </AppPressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <AppText variant="h4" color={colors.text}>Product Details</AppText>
            <AppText variant="body" color={colors.textSecondary}>{product.description}</AppText>

            {specEntries.length > 0 ? (
              <View style={styles.specBox}>
                {specEntries.map((spec) => (
                  <View key={spec.key} style={styles.specRow}>
                    <AppText variant="caption" color={colors.muted} style={styles.specLabel}>
                      {spec.label}
                    </AppText>
                    <AppText variant="label" color={colors.text} style={styles.specValue}>
                      {spec.value}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <AppText variant="h4" color={colors.text}>Fulfilment & Store Policies</AppText>
            {product.deliveryInfo ? (
              <AppText variant="body" color={colors.textSecondary}>{product.deliveryInfo}</AppText>
            ) : null}
            <View style={styles.badgeRow}>
              {product.deliveryOptions?.deliveryEnabled !== false ? (
                <Badge label="Delivery / Shipping available" variant="neutral" />
              ) : null}
              {product.deliveryOptions?.pickupEnabled ? (
                <Badge label="Local Store Pickup" variant="success" />
              ) : null}
            </View>
            {product.returnPolicy ? (
              <View style={styles.policyItem}>
                <AppText variant="label" color={colors.text}>Return Policy</AppText>
                <AppText variant="caption" color={colors.textSecondary}>{product.returnPolicy}</AppText>
              </View>
            ) : null}
            {product.warrantyInfo ? (
              <View style={styles.policyItem}>
                <AppText variant="label" color={colors.text}>Warranty</AppText>
                <AppText variant="caption" color={colors.textSecondary}>{product.warrantyInfo}</AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.shopHead}>
              <View style={styles.shopIdentity}>
                <AppIcon
                  name={product.shop?.verificationStatus === 'verified' ? 'check-decagram' : 'storefront-outline'}
                  size={22}
                  color={colors.primary}
                />
                <View style={styles.shopCopy}>
                  <AppText variant="h4" color={colors.text}>
                    {product.shop?.storeDisplayName || product.shop?.businessName || product.sellerName || 'Business Shop'}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {[shopLocation?.label, shopLocation?.city || product.shop?.city, product.shop?.state].filter(Boolean).join(' · ') || 'Marketplace Seller'}
                  </AppText>
                </View>
              </View>
              <AppButton
                onPress={() => router.push({ pathname: '/listing/[id]', params: { id: product.sellerUserId } })}
                size="sm"
                title="Shop Profile"
                variant="outline"
              />
            </View>
            {shopLocation?.operatingHours ? (
              <AppText variant="caption" color={colors.textSecondary}>
                Hours: {shopLocation.operatingHours}
              </AppText>
            ) : null}
          </View>

          <InlineAlert
            message={detail?.futureCapabilities?.note || 'Online cart, checkout, payment, and order tracking are planned for a future phase. Save items or message the seller directly via enquiry.'}
            variant="info"
          />

          <View style={styles.ctaRow}>
            <AppButton
              containerStyle={styles.ctaBtn}
              icon={isSaved ? 'heart' : 'heart-outline'}
              onPress={toggleSave}
              title={isSaved ? 'Saved' : 'Save Item'}
              variant={isSaved ? 'secondary' : 'outline'}
            />
            <AppButton
              containerStyle={styles.ctaBtn}
              icon="message-text-outline"
              onPress={openEnquiry}
              title="Enquire with Shop"
            />
          </View>
        </ScrollView>
      )}

      <AppModal onClose={() => setEnquiryOpen(false)} title="Send Product Enquiry" visible={enquiryOpen}>
        <View style={styles.modalStack}>
          {enquiryError ? <InlineAlert message={enquiryError} variant="error" /> : null}
          <AppInput
            label="Your Message"
            multiline
            onChangeText={setEnquiryMessage}
            value={enquiryMessage}
          />
          <AppButton loading={enquirySaving} onPress={submitEnquiry} title="Send Enquiry" />
        </View>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  galleryCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: 240, backgroundColor: colors.surfaceAlt },
  heroPlaceholder: { height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  thumbRail: { padding: spacing.sm, gap: spacing.xs },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbWrapActive: { borderColor: colors.primary },
  thumbImg: { width: '100%', height: '100%' },
  thumbVideo: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: 4 },
  strike: { textDecorationLine: 'line-through' },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  variantSection: { marginTop: spacing.sm, gap: spacing.xs },
  variantGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  variantChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  variantChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  specBox: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs, gap: 6 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  specLabel: { flex: 1, textTransform: 'capitalize' },
  specValue: { flex: 1, textAlign: 'right' },
  policyItem: { marginTop: 4, gap: 2 },
  shopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  shopIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shopCopy: { flex: 1 },
  ctaRow: { flexDirection: 'row', gap: spacing.sm },
  ctaBtn: { flex: 1 },
  modalStack: { gap: spacing.sm },
});
