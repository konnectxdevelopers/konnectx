import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppIcon,
  AppInput,
  AppModal,
  AppPressable,
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  SearchBar,
  useToast,
} from '../components/ui';
import ProductCard, { formatProductPrice } from '../features/marketplace/ProductCard';
import {
  adjustProductInventoryRequest,
  createProductRequest,
  getBusinessShopRequest,
  getMarketplaceCategoryTreeRequest,
  getMyProductDetailRequest,
  getMyProductsRequest,
  getProductCategorySchemaRequest,
  getProductInventoryHistoryRequest,
  transitionProductStatusRequest,
  updateProductRequest,
} from '../services/marketplace/marketplaceService';
import {
  deletePendingUploadRequest,
  uploadListingMediaRequest,
} from '../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../theme/tokens';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'paused', label: 'Paused' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'archived', label: 'Archived' },
];

const CONDITIONS = [
  { key: 'new', label: 'New' },
  { key: 'open_box', label: 'Open Box' },
  { key: 'refurbished', label: 'Refurbished' },
  { key: 'used', label: 'Used' },
];

const EMPTY_FORM = {
  id: null,
  status: 'draft',
  name: '',
  sku: '',
  shortDescription: '',
  description: '',
  categoryId: '',
  subcategoryId: '',
  shopLocationId: '',
  brand: '',
  price: '',
  compareAtPrice: '',
  currency: 'INR',
  productCondition: 'new',
  stockQuantity: '0',
  deliveryInfo: '',
  deliveryEnabled: true,
  pickupEnabled: false,
  returnPolicy: '',
  warrantyInfo: '',
  isActive: true,
  attributes: {},
  variants: [],
  media: [],
};

function statusVariant(status) {
  if (status === 'published') return 'success';
  if (status === 'pending_review') return 'warning';
  if (status === 'rejected') return 'danger';
  if (status === 'paused') return 'info';
  return 'neutral';
}

export default function ManageProductsScreen() {
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [countsByStatus, setCountsByStatus] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');

  const [categoryTree, setCategoryTree] = useState([]);
  const [shopLocations, setShopLocations] = useState([]);
  const [shopDefaults, setShopDefaults] = useState(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [schema, setSchema] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [newVariantDraft, setNewVariantDraft] = useState({ sku: '', price: '', stockQuantity: '0', attributes: {} });

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState(null);
  const [stockVariantId, setStockVariantId] = useState('');
  const [stockMode, setStockMode] = useState('set');
  const [stockInput, setStockInput] = useState('0');
  const [stockReason, setStockReason] = useState('Inventory count updated');
  const [stockSaving, setStockSaving] = useState(false);
  const [stockHistory, setStockHistory] = useState([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);

  const productCategories = useMemo(() => {
    const shoppingRoot = categoryTree.find(
      (node) => node.listingType === 'product' || node.slug === 'shopping-products'
    );
    if (shoppingRoot?.children?.length) return shoppingRoot.children;
    return categoryTree.filter((node) => node.listingType === 'product');
  }, [categoryTree]);

  const activeCategoryObj = useMemo(
    () => productCategories.find((c) => c.id === form.categoryId) || null,
    [form.categoryId, productCategories]
  );

  const loadProducts = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyProductsRequest(session, {
        status: activeTab === 'all' ? undefined : activeTab,
        q: searchText.trim() || undefined,
      });
      setProducts(res.items || []);
      setCountsByStatus(res.countsByStatus || {});
    } catch (err) {
      setError(err?.message || 'Could not load your products.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchText, session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    Promise.all([
      getMarketplaceCategoryTreeRequest('product').catch(() => ({ tree: [] })),
      getBusinessShopRequest(session).catch(() => ({ locations: [], shop: null })),
    ]).then(([treeRes, shopRes]) => {
      if (!active) return;
      setCategoryTree(treeRes.tree || []);
      setShopLocations((shopRes.locations || []).filter((l) => l.isActive));
      setShopDefaults(shopRes.shop || null);
    });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    getMyProductsRequest(session, {
      status: activeTab === 'all' ? undefined : activeTab,
      q: searchText.trim() || undefined,
    })
      .then((res) => {
        if (!active) return;
        setProducts(res.items || []);
        setCountsByStatus(res.countsByStatus || {});
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load your products.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, searchText, session]);

  useEffect(() => {
    if (!editorOpen || !form.categoryId) return undefined;
    let active = true;
    getProductCategorySchemaRequest(form.categoryId, form.subcategoryId || undefined)
      .then((res) => {
        if (active) setSchema(res.schema || null);
      })
      .catch(() => {
        if (active) setSchema(null);
      });
    return () => {
      active = false;
    };
  }, [editorOpen, form.categoryId, form.subcategoryId]);

  const openCreateEditor = () => {
    const firstCat = productCategories[0]?.id || '';
    setForm({
      ...EMPTY_FORM,
      categoryId: firstCat,
      shopLocationId: shopLocations.find((l) => l.isPrimary)?.id || '',
      returnPolicy: shopDefaults?.returnPolicyDefault || '',
      warrantyInfo: shopDefaults?.warrantyDefault || '',
      deliveryEnabled: shopDefaults?.deliveryEnabled !== false,
      pickupEnabled: Boolean(shopDefaults?.pickupEnabled),
    });
    setNewVariantDraft({ sku: '', price: '', stockQuantity: '0', attributes: {} });
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEditEditor = async (item) => {
    setEditorError(null);
    try {
      const detail = await getMyProductDetailRequest(session, item.id);
      const p = detail.product || item;
      setForm({
        id: p.id,
        status: p.status || 'draft',
        name: p.name || '',
        sku: p.sku || '',
        shortDescription: p.shortDescription || '',
        description: p.description || '',
        categoryId: p.categoryId || '',
        subcategoryId: p.subcategoryId || '',
        shopLocationId: p.shopLocationId || '',
        brand: p.brand || p.attributes?.brand || '',
        price: p.price !== undefined && p.price !== null ? String(p.price) : '',
        compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : '',
        currency: p.currency || 'INR',
        productCondition: p.productCondition || 'new',
        stockQuantity: String(p.stockQuantity || 0),
        deliveryInfo: p.deliveryInfo || '',
        deliveryEnabled: p.deliveryOptions?.deliveryEnabled !== false,
        pickupEnabled: Boolean(p.deliveryOptions?.pickupEnabled),
        returnPolicy: p.returnPolicy || '',
        warrantyInfo: p.warrantyInfo || '',
        isActive: p.isActive !== false,
        attributes: p.attributes || {},
        variants: (p.variants || []).map((v) => ({
          id: v.id,
          sku: v.sku || '',
          price: v.price !== undefined && v.price !== null ? String(v.price) : '',
          compareAtPrice: v.compareAtPrice ? String(v.compareAtPrice) : '',
          stockQuantity: String(v.stockQuantity || 0),
          version: Number(v.version || 0),
          attributes: v.attributes || {},
          isActive: v.isActive !== false,
        })),
        media: (p.media || []).map((m) => ({
          mediaAssetId: m.mediaAssetId,
          mediaRole: m.mediaRole || 'image',
          isCover: Boolean(m.isCover),
          altText: m.altText || '',
          previewUri: m.url,
          isExisting: true,
        })),
      });
      setSchema(detail.schema || null);
      setNewVariantDraft({ sku: '', price: '', stockQuantity: '0', attributes: {} });
      setEditorOpen(true);
    } catch (err) {
      showToast(err?.message || 'Could not load product details.', 'error');
    }
  };

  const handlePickProductMedia = async (mediaType) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setEditorError('Allow media library permission to upload product photos or video.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaType === 'image' ? ['images'] : ['videos'],
        allowsEditing: mediaType === 'image',
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      setUploadingMedia(true);
      setEditorError(null);
      const uploaded = await uploadListingMediaRequest(session, 'business', picked.assets[0], mediaType);
      setForm((prev) => ({
        ...prev,
        media: [
          ...prev.media,
          {
            mediaAssetId: uploaded.id,
            mediaRole: mediaType,
            isCover: mediaType === 'image' && prev.media.every((m) => m.mediaRole !== 'image'),
            altText: prev.name || 'Product media',
            previewUri: picked.assets[0].uri,
            isExisting: false,
          },
        ],
      }));
    } catch (err) {
      setEditorError(err?.message || 'Could not upload media.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleRemoveMedia = async (item) => {
    setForm((prev) => ({
      ...prev,
      media: prev.media.filter((m) => m.mediaAssetId !== item.mediaAssetId),
    }));
    if (!item.isExisting) {
      deletePendingUploadRequest(session, item.mediaAssetId).catch(() => {});
    }
  };

  const handleSetCover = (mediaAssetId) => {
    setForm((prev) => ({
      ...prev,
      media: prev.media.map((m) => ({
        ...m,
        isCover: m.mediaAssetId === mediaAssetId && m.mediaRole === 'image',
      })),
    }));
  };

  const handleAddVariant = () => {
    const variantKeys = schema?.variantAttributeKeys || [];
    const cleanedAttrs = {};
    for (const key of variantKeys) {
      const val = String(newVariantDraft.attributes?.[key] || '').trim();
      if (val) cleanedAttrs[key] = val;
    }
    if (!Object.keys(cleanedAttrs).length && !newVariantDraft.sku.trim()) {
      setEditorError('Fill at least one variant option (e.g. size/color) or SKU before adding a variant.');
      return;
    }
    const qty = Number(newVariantDraft.stockQuantity || 0);
    if (!Number.isInteger(qty) || qty < 0) {
      setEditorError('Variant stock quantity must be a non-negative whole number.');
      return;
    }
    setEditorError(null);
    setForm((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          id: null,
          sku: newVariantDraft.sku.trim(),
          price: newVariantDraft.price.trim() || prev.price,
          stockQuantity: String(qty),
          attributes: cleanedAttrs,
          isActive: true,
        },
      ],
    }));
    setNewVariantDraft({ sku: '', price: '', stockQuantity: '0', attributes: {} });
  };

  const buildSubmissionPayload = (action) => ({
    action,
    name: form.name.trim(),
    sku: form.sku.trim() || null,
    shortDescription: form.shortDescription.trim() || null,
    description: form.description.trim(),
    categoryId: form.categoryId || null,
    subcategoryId: form.subcategoryId || null,
    shopLocationId: form.shopLocationId || null,
    brand: form.brand.trim() || form.attributes?.brand || null,
    price: form.price.trim() ? Number(form.price) : (action === 'save_draft' ? 0 : null),
    compareAtPrice: form.compareAtPrice.trim() ? Number(form.compareAtPrice) : null,
    currency: form.currency || 'INR',
    productCondition: schema?.supportsCondition ? form.productCondition : null,
    stockQuantity: Number(form.stockQuantity || 0),
    deliveryInfo: form.deliveryInfo.trim() || null,
    deliveryOptions: {
      deliveryEnabled: form.deliveryEnabled,
      pickupEnabled: form.pickupEnabled,
      deliveryInfo: form.deliveryInfo.trim() || null,
    },
    returnPolicy: schema?.supportsReturnPolicy === false ? null : (form.returnPolicy.trim() || null),
    warrantyInfo: schema?.supportsWarranty ? (form.warrantyInfo.trim() || null) : null,
    isActive: form.isActive,
    attributes: {
      ...form.attributes,
      ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
    },
    variants: schema?.supportsVariants === false
      ? []
      : form.variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          ...(v.id ? { version: Number(v.version || 0) } : {}),
          sku: v.sku?.trim() || null,
          price: v.price ? Number(v.price) : (form.price ? Number(form.price) : null),
          stockQuantity: Number(v.stockQuantity || 0),
          attributes: v.attributes || {},
          isActive: v.isActive !== false,
        })),
    media: form.media.map((m) => ({
      mediaAssetId: m.mediaAssetId,
      isCover: Boolean(m.isCover),
      altText: m.altText || form.name.trim() || null,
    })),
  });

  const handleSaveProduct = async (action) => {
    if (!form.name.trim()) {
      setEditorError('Product name is required.');
      return;
    }
    if (action !== 'save_draft') {
      if (!form.categoryId) {
        setEditorError('Select a product category before publishing.');
        return;
      }
      if (!form.price.trim() || !Number.isFinite(Number(form.price)) || Number(form.price) <= 0) {
        setEditorError('Enter a valid selling price greater than 0.');
        return;
      }
      if (!form.description.trim()) {
        setEditorError('Detailed description is required before publishing.');
        return;
      }
    }

    setEditorSaving(true);
    setEditorError(null);
    try {
      const payload = buildSubmissionPayload(action);
      if (form.id) {
        await updateProductRequest(session, form.id, payload);
      } else {
        await createProductRequest(session, payload);
      }
      setEditorOpen(false);
      showToast(
        action === 'save_draft'
          ? 'Product draft saved.'
          : 'Product saved & published to your catalogue.',
        'success'
      );
      await loadProducts();
    } catch (err) {
      setEditorError(err?.message || 'Could not save this product.');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleTransition = (product, action, label) => {
    const run = async () => {
      try {
        await transitionProductStatusRequest(session, product.id, action);
        showToast(`Product ${label.toLowerCase()}.`, 'success');
        await loadProducts();
      } catch (err) {
        showToast(err?.message || `Could not ${label.toLowerCase()} product.`, 'error');
      }
    };

    if (action === 'archive') {
      Alert.alert(
        'Archive product',
        `Archive "${product.name}"? Archived products are removed from public discovery.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Archive', style: 'destructive', onPress: run },
        ]
      );
      return;
    }
    run();
  };

  const openStockModal = async (product) => {
    setStockTarget(product);
    const activeVars = (product.variants || []).filter((v) => v.isActive !== false);
    const firstVarId = activeVars[0]?.id || '';
    setStockVariantId(firstVarId);
    setStockMode('set');
    setStockInput(String(firstVarId ? activeVars[0].stockQuantity : product.stockQuantity || 0));
    setStockReason('Inventory count updated');
    setStockModalOpen(true);
    try {
      const hist = await getProductInventoryHistoryRequest(session, product.id);
      setStockHistory(hist.history || []);
    } catch {
      setStockHistory([]);
    }
  };

  const handleAdjustStock = async () => {
    if (!stockTarget) return;
    const num = Number(stockInput);
    if (!Number.isInteger(num)) {
      Alert.alert('Invalid number', 'Enter a whole number for stock adjustment.');
      return;
    }
    if (stockMode === 'set' && num < 0) {
      Alert.alert('Negative stock forbidden', 'Stock quantity cannot be negative.');
      return;
    }
    setStockSaving(true);
    try {
      await adjustProductInventoryRequest(session, stockTarget.id, {
        ...(stockVariantId ? { variantId: stockVariantId } : {}),
        mode: stockMode,
        ...(stockMode === 'delta' ? { delta: num } : { newQuantity: num }),
        reason: stockReason.trim() || 'Inventory update',
      });
      setStockModalOpen(false);
      showToast('Inventory updated transactionally.', 'success');
      await loadProducts();
    } catch (err) {
      Alert.alert('Stock adjustment blocked', err?.message || 'Could not update stock.');
    } finally {
      setStockSaving(false);
    }
  };

  const openCustomerPreview = (sourceProduct) => {
    setPreviewProduct(sourceProduct);
    setPreviewOpen(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle="Catalogue, variants & stock"
        title="Product Catalogue"
        rightAction={{
          icon: 'store-cog-outline',
          onPress: () => router.push('/business-shop'),
        }}
      />

      <View style={styles.topControls}>
        <SearchBar
          onChangeText={setSearchText}
          onSubmit={loadProducts}
          placeholder="Search products, SKU, brand..."
          value={searchText}
        />
        <ScrollView contentContainerStyle={styles.tabRail} horizontal showsHorizontalScrollIndicator={false}>
          {STATUS_TABS.map((tab) => {
            const active = activeTab === tab.key;
            const count = countsByStatus[tab.key];
            return (
              <AppPressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabPill, active && styles.tabPillActive]}
              >
                <AppText variant="caption" color={active ? colors.inverse : colors.textSecondary}>
                  {tab.label}
                  {typeof count === 'number' ? ` (${count})` : ''}
                </AppText>
              </AppPressable>
            );
          })}
        </ScrollView>
        <View style={styles.topBtnRow}>
          <AppButton
            containerStyle={styles.flexBtn}
            icon="plus"
            onPress={openCreateEditor}
            size="sm"
            title="Add Product"
          />
          <AppButton
            containerStyle={styles.flexBtn}
            icon="storefront-outline"
            onPress={() => router.push('/business-shop')}
            size="sm"
            title="Shop Settings"
            variant="secondary"
          />
        </View>
      </View>

      {loading ? (
        <LoadingState message="Loading product catalogue..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadProducts} />
      ) : !products.length ? (
        <EmptyState
          actionLabel="Add your first product"
          icon="package-variant-plus"
          message="Create products with category attributes, B2 photos, stock quantities, and variants."
          onAction={openCreateEditor}
          title="No products in this view"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {products.map((product) => (
            <View key={product.id} style={styles.productCard}>
              <View style={styles.rowTop}>
                {product.coverImage ? (
                  <Image source={{ uri: product.coverImage }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <AppIcon name="shopping-outline" size={24} color={colors.muted} />
                  </View>
                )}
                <View style={styles.itemMeta}>
                  <View style={styles.badgeRow}>
                    <Badge label={product.status.replace('_', ' ')} variant={statusVariant(product.status)} />
                    <Badge
                      label={
                        product.stockStatus === 'out_of_stock'
                          ? 'Out of stock'
                          : `${product.stockQuantity} in stock`
                      }
                      variant={
                        product.stockStatus === 'out_of_stock'
                          ? 'danger'
                          : product.stockStatus === 'low_stock'
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                  </View>
                  <AppText variant="h4" color={colors.text} numberOfLines={2}>
                    {product.name}
                  </AppText>
                  <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                    {[product.categoryName, product.brand, product.sku ? `SKU: ${product.sku}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                  <View style={styles.priceLine}>
                    <AppText variant="label" color={colors.primary}>
                      {formatProductPrice(product.price, product.currency)}
                    </AppText>
                    {product.variants?.length ? (
                      <AppText variant="caption" color={colors.muted}>
                        · {product.variants.length} variants
                      </AppText>
                    ) : null}
                  </View>
                </View>
              </View>

              {product.status === 'rejected' && product.moderationReason ? (
                <InlineAlert message={`Rejection reason: ${product.moderationReason}`} variant="error" />
              ) : null}

              <View style={styles.cardActions}>
                <AppButton onPress={() => openEditEditor(product)} size="sm" title="Edit" variant="outline" />
                <AppButton onPress={() => openStockModal(product)} size="sm" title="Stock" variant="secondary" />
                <AppButton onPress={() => openCustomerPreview(product)} size="sm" title="Preview" variant="ghost" />
                {product.status === 'draft' || product.status === 'rejected' ? (
                  <AppButton
                    onPress={() => handleTransition(product, 'publish', 'Published')}
                    size="sm"
                    title="Publish"
                  />
                ) : null}
                {product.status === 'published' ? (
                  <AppButton
                    onPress={() => handleTransition(product, 'pause', 'Paused')}
                    size="sm"
                    title="Pause"
                    variant="outline"
                  />
                ) : null}
                {product.status === 'paused' ? (
                  <AppButton
                    onPress={() => handleTransition(product, 'resume', 'Republished')}
                    size="sm"
                    title="Resume"
                  />
                ) : null}
                {product.status !== 'archived' ? (
                  <AppButton
                    onPress={() => handleTransition(product, 'archive', 'Archived')}
                    size="sm"
                    title="Archive"
                    variant="ghost"
                  />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Create / Edit Product Modal */}
      <AppModal
        onClose={() => setEditorOpen(false)}
        title={form.id ? 'Edit Product' : 'Create Product'}
        visible={editorOpen}
      >
        <ScrollView contentContainerStyle={styles.modalStack} showsVerticalScrollIndicator={false}>
          {editorError ? <InlineAlert message={editorError} variant="error" /> : null}

          <AppText variant="label" color={colors.text}>Category *</AppText>
          <ScrollView contentContainerStyle={styles.chipRail} horizontal showsHorizontalScrollIndicator={false}>
            {productCategories.map((cat) => {
              const selected = form.categoryId === cat.id;
              return (
                <AppPressable
                  key={cat.id}
                  onPress={() => setForm((p) => ({ ...p, categoryId: cat.id, subcategoryId: '', attributes: {} }))}
                  style={[styles.tabPill, selected && styles.tabPillActive]}
                >
                  <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                    {cat.name}
                  </AppText>
                </AppPressable>
              );
            })}
          </ScrollView>

          {activeCategoryObj?.children?.length ? (
            <>
              <AppText variant="label" color={colors.text}>Subcategory</AppText>
              <ScrollView contentContainerStyle={styles.chipRail} horizontal showsHorizontalScrollIndicator={false}>
                {activeCategoryObj.children.map((sub) => {
                  const selected = form.subcategoryId === sub.id;
                  return (
                    <AppPressable
                      key={sub.id}
                      onPress={() => setForm((p) => ({ ...p, subcategoryId: sub.id }))}
                      style={[styles.tabPill, selected && styles.tabPillActive]}
                    >
                      <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                        {sub.name}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <AppInput
            label="Product Name *"
            onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
            placeholder="e.g. Organic Cotton Crewneck Tee"
            value={form.name}
          />
          <View style={styles.twoCol}>
            <AppInput
              containerStyle={styles.flexBtn}
              label="SKU"
              onChangeText={(v) => setForm((p) => ({ ...p, sku: v }))}
              placeholder="Optional SKU"
              value={form.sku}
            />
            <AppInput
              containerStyle={styles.flexBtn}
              label="Brand"
              onChangeText={(v) => setForm((p) => ({ ...p, brand: v }))}
              placeholder="Brand name"
              value={form.brand}
            />
          </View>

          <AppInput
            label="Short Summary"
            onChangeText={(v) => setForm((p) => ({ ...p, shortDescription: v }))}
            placeholder="1-line highlight shown in search"
            value={form.shortDescription}
          />
          <AppInput
            label="Detailed Description *"
            multiline
            onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
            placeholder="Describe materials, specs, features, and what is included..."
            value={form.description}
          />

          <View style={styles.twoCol}>
            <AppInput
              containerStyle={styles.flexBtn}
              keyboardType="decimal-pad"
              label="Selling Price (INR) *"
              onChangeText={(v) => setForm((p) => ({ ...p, price: v }))}
              value={form.price}
            />
            {schema?.supportsCompareAtPrice !== false ? (
              <AppInput
                containerStyle={styles.flexBtn}
                keyboardType="decimal-pad"
                label="Compare-at Price"
                onChangeText={(v) => setForm((p) => ({ ...p, compareAtPrice: v }))}
                placeholder="MRP"
                value={form.compareAtPrice}
              />
            ) : null}
          </View>

          {!form.variants.length ? (
            <AppInput
              keyboardType="number-pad"
              label="Stock Quantity"
              onChangeText={(v) => setForm((p) => ({ ...p, stockQuantity: v }))}
              value={form.stockQuantity}
            />
          ) : (
            <InlineAlert
              message={`Total stock (${form.variants.reduce((sum, v) => sum + Number(v.stockQuantity || 0), 0)}) is automatically summed from your active variants.`}
              variant="info"
            />
          )}

          {schema?.supportsCondition ? (
            <>
              <AppText variant="label" color={colors.text}>Condition</AppText>
              <View style={styles.chipWrap}>
                {CONDITIONS.map((cond) => {
                  const selected = form.productCondition === cond.key;
                  return (
                    <AppPressable
                      key={cond.key}
                      onPress={() => setForm((p) => ({ ...p, productCondition: cond.key }))}
                      style={[styles.tabPill, selected && styles.tabPillActive]}
                    >
                      <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                        {cond.label}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Category-Driven Attributes */}
          {schema?.attributes?.filter((attr) => attr.key !== 'brand' && !attr.variant).length ? (
            <View style={styles.subCard}>
              <AppText variant="label" color={colors.text}>Category Specifications</AppText>
              {schema.attributes
                .filter((attr) => attr.key !== 'brand' && !attr.variant)
                .map((attr) => (
                  <View key={attr.key} style={styles.attrRow}>
                    {attr.type === 'select' && Array.isArray(attr.options) && attr.options.length ? (
                      <>
                        <AppText variant="caption" color={colors.textSecondary}>{attr.label}</AppText>
                        <ScrollView contentContainerStyle={styles.chipRail} horizontal showsHorizontalScrollIndicator={false}>
                          {attr.options.map((opt) => {
                            const selected = form.attributes?.[attr.key] === opt;
                            return (
                              <AppPressable
                                key={opt}
                                onPress={() => setForm((p) => ({
                                  ...p,
                                  attributes: { ...p.attributes, [attr.key]: opt },
                                }))}
                                style={[styles.tabPill, selected && styles.tabPillActive]}
                              >
                                <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                                  {opt}
                                </AppText>
                              </AppPressable>
                            );
                          })}
                        </ScrollView>
                      </>
                    ) : (
                      <AppInput
                        label={attr.label}
                        onChangeText={(v) => setForm((p) => ({
                          ...p,
                          attributes: { ...p.attributes, [attr.key]: v },
                        }))}
                        value={String(form.attributes?.[attr.key] || '')}
                      />
                    )}
                  </View>
                ))}
            </View>
          ) : null}

          {/* Category-Driven Variants */}
          {schema?.supportsVariants !== false ? (
            <View style={styles.subCard}>
              <AppText variant="label" color={colors.text}>Product Variants</AppText>
              <AppText variant="caption" color={colors.muted}>
                Variant options for this category: {(schema?.variantAttributeKeys || ['option']).join(', ')}
              </AppText>
              {form.variants.map((v, idx) => (
                <View key={v.id || `var-${idx}`} style={styles.variantItem}>
                  <View style={styles.variantInfo}>
                    <AppText variant="label" color={colors.text}>
                      {Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(' · ') || v.sku}
                    </AppText>
                    <AppText variant="caption" color={colors.muted}>
                      Price: {v.price || form.price || 0} · Stock: {v.stockQuantity} {v.sku ? `· SKU ${v.sku}` : ''}
                    </AppText>
                  </View>
                  <AppButton
                    onPress={() => setForm((p) => ({
                      ...p,
                      variants: p.variants.filter((_, i) => i !== idx),
                    }))}
                    size="sm"
                    title="Remove"
                    variant="ghost"
                  />
                </View>
              ))}

              <View style={styles.variantAdder}>
                {(schema?.variantAttributeKeys || ['option']).map((key) => {
                  const ruleDef = (schema?.attributes || []).find((a) => a.key === key);
                  return (
                    <AppInput
                      key={key}
                      label={ruleDef?.label || key}
                      onChangeText={(val) => setNewVariantDraft((prev) => ({
                        ...prev,
                        attributes: { ...prev.attributes, [key]: val },
                      }))}
                      placeholder={ruleDef?.options?.length ? `e.g. ${ruleDef.options.slice(0, 3).join(', ')}` : `Enter ${key}`}
                      value={newVariantDraft.attributes?.[key] || ''}
                    />
                  );
                })}
                <View style={styles.twoCol}>
                  <AppInput
                    containerStyle={styles.flexBtn}
                    keyboardType="decimal-pad"
                    label="Variant Price"
                    onChangeText={(val) => setNewVariantDraft((p) => ({ ...p, price: val }))}
                    placeholder={form.price || 'Price'}
                    value={newVariantDraft.price}
                  />
                  <AppInput
                    containerStyle={styles.flexBtn}
                    keyboardType="number-pad"
                    label="Variant Stock"
                    onChangeText={(val) => setNewVariantDraft((p) => ({ ...p, stockQuantity: val }))}
                    value={newVariantDraft.stockQuantity}
                  />
                </View>
                <AppInput
                  label="Variant SKU"
                  onChangeText={(val) => setNewVariantDraft((p) => ({ ...p, sku: val }))}
                  value={newVariantDraft.sku}
                />
                <AppButton icon="plus" onPress={handleAddVariant} size="sm" title="Add Variant" variant="secondary" />
              </View>
            </View>
          ) : null}

          {/* Media Upload via Backblaze B2 */}
          <View style={styles.subCard}>
            <AppText variant="label" color={colors.text}>Images & Optional Video (Backblaze B2)</AppText>
            <View style={styles.twoCol}>
              <AppButton
                containerStyle={styles.flexBtn}
                disabled={uploadingMedia}
                icon="image-plus"
                onPress={() => handlePickProductMedia('image')}
                size="sm"
                title={uploadingMedia ? 'Uploading...' : 'Add Image'}
                variant="secondary"
              />
              <AppButton
                containerStyle={styles.flexBtn}
                disabled={uploadingMedia}
                icon="video-plus"
                onPress={() => handlePickProductMedia('video')}
                size="sm"
                title="Add Video"
                variant="outline"
              />
            </View>
            {form.media.map((m) => (
              <View key={m.mediaAssetId} style={styles.mediaRow}>
                {m.previewUri && m.mediaRole !== 'video' ? (
                  <Image source={{ uri: m.previewUri }} style={styles.mediaThumb} />
                ) : (
                  <View style={styles.mediaThumb}><AppIcon name="video-outline" size={20} color={colors.primary} /></View>
                )}
                <View style={styles.variantInfo}>
                  <AppText variant="caption" color={colors.text}>
                    {m.mediaRole === 'video' ? 'Product Video' : m.isCover ? 'Cover Image' : 'Product Image'}
                  </AppText>
                </View>
                {m.mediaRole !== 'video' && !m.isCover ? (
                  <AppButton onPress={() => handleSetCover(m.mediaAssetId)} size="sm" title="Set Cover" variant="ghost" />
                ) : null}
                <AppButton onPress={() => handleRemoveMedia(m)} size="sm" title="Remove" variant="ghost" />
              </View>
            ))}
          </View>

          {shopLocations.length > 0 ? (
            <>
              <AppText variant="label" color={colors.text}>Shop Branch / Location</AppText>
              <ScrollView contentContainerStyle={styles.chipRail} horizontal showsHorizontalScrollIndicator={false}>
                {shopLocations.map((loc) => {
                  const selected = form.shopLocationId === loc.id;
                  return (
                    <AppPressable
                      key={loc.id}
                      onPress={() => setForm((p) => ({ ...p, shopLocationId: loc.id }))}
                      style={[styles.tabPill, selected && styles.tabPillActive]}
                    >
                      <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                        {loc.label} ({loc.city})
                      </AppText>
                    </AppPressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <AppInput
            label="Delivery & Shipping Information"
            onChangeText={(v) => setForm((p) => ({ ...p, deliveryInfo: v }))}
            placeholder="Ships within 24 hours · Free local pickup"
            value={form.deliveryInfo}
          />
          <View style={styles.switchRow}>
            <AppText variant="label" color={colors.text}>Shipping / Delivery Available</AppText>
            <Switch onValueChange={(v) => setForm((p) => ({ ...p, deliveryEnabled: v }))} value={form.deliveryEnabled} />
          </View>
          <View style={styles.switchRow}>
            <AppText variant="label" color={colors.text}>Store Pickup Available</AppText>
            <Switch onValueChange={(v) => setForm((p) => ({ ...p, pickupEnabled: v }))} value={form.pickupEnabled} />
          </View>
          {schema?.supportsReturnPolicy !== false ? (
            <AppInput
              label="Return Policy"
              multiline
              onChangeText={(v) => setForm((p) => ({ ...p, returnPolicy: v }))}
              value={form.returnPolicy}
            />
          ) : null}
          {schema?.supportsWarranty ? (
            <AppInput
              label="Warranty Information"
              multiline
              onChangeText={(v) => setForm((p) => ({ ...p, warrantyInfo: v }))}
              value={form.warrantyInfo}
            />
          ) : null}

          <View style={styles.editorFooter}>
            <AppButton
              containerStyle={styles.flexBtn}
              disabled={editorSaving}
              onPress={() => handleSaveProduct('save_draft')}
              title="Save Draft"
              variant="outline"
            />
            <AppButton
              containerStyle={styles.flexBtn}
              disabled={editorSaving}
              onPress={() => openCustomerPreview({
                ...form,
                price: Number(form.price || 0),
                compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
                stockQuantity: form.variants.length
                  ? form.variants.reduce((sum, v) => sum + Number(v.stockQuantity || 0), 0)
                  : Number(form.stockQuantity || 0),
                coverImage: form.media.find((m) => m.isCover)?.previewUri || form.media[0]?.previewUri || null,
                categoryName: activeCategoryObj?.name || 'Product',
                shop: shopDefaults,
              })}
              title="Preview"
              variant="secondary"
            />
          </View>
          <AppButton
            loading={editorSaving}
            onPress={() => handleSaveProduct('publish')}
            title="Publish Product"
          />
        </ScrollView>
      </AppModal>

      {/* Stock Adjustment Modal */}
      <AppModal onClose={() => setStockModalOpen(false)} title="Adjust Inventory" visible={stockModalOpen}>
        <ScrollView contentContainerStyle={styles.modalStack}>
          {stockTarget ? (
            <>
              <AppText variant="h4" color={colors.text}>{stockTarget.name}</AppText>
              {(stockTarget.variants || []).length > 0 ? (
                <>
                  <AppText variant="label" color={colors.text}>Select Variant</AppText>
                  <ScrollView contentContainerStyle={styles.chipRail} horizontal showsHorizontalScrollIndicator={false}>
                    {stockTarget.variants.map((v) => {
                      const selected = stockVariantId === v.id;
                      const label = Object.values(v.attributes || {}).join(' / ') || v.sku || 'Variant';
                      return (
                        <AppPressable
                          key={v.id}
                          onPress={() => {
                            setStockVariantId(v.id);
                            if (stockMode === 'set') setStockInput(String(v.stockQuantity || 0));
                          }}
                          style={[styles.tabPill, selected && styles.tabPillActive]}
                        >
                          <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                            {label} ({v.stockQuantity})
                          </AppText>
                        </AppPressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              <View style={styles.twoCol}>
                <AppButton
                  containerStyle={styles.flexBtn}
                  onPress={() => setStockMode('set')}
                  size="sm"
                  title="Set Exact Qty"
                  variant={stockMode === 'set' ? 'primary' : 'outline'}
                />
                <AppButton
                  containerStyle={styles.flexBtn}
                  onPress={() => setStockMode('delta')}
                  size="sm"
                  title="Add / Subtract (+/-)"
                  variant={stockMode === 'delta' ? 'primary' : 'outline'}
                />
              </View>

              <AppInput
                keyboardType="numbers-and-punctuation"
                label={stockMode === 'set' ? 'New Stock Quantity' : 'Change Amount (e.g. +5 or -2)'}
                onChangeText={setStockInput}
                value={stockInput}
              />
              <AppInput
                label="Adjustment Reason"
                onChangeText={setStockReason}
                value={stockReason}
              />
              <AppButton loading={stockSaving} onPress={handleAdjustStock} title="Save Stock Adjustment" />

              {stockHistory.length > 0 ? (
                <View style={styles.historyBox}>
                  <AppText variant="label" color={colors.text}>Recent Inventory Audit Log</AppText>
                  {stockHistory.slice(0, 8).map((entry) => (
                    <View key={entry.id} style={styles.historyRow}>
                      <AppText variant="caption" color={colors.textSecondary} style={styles.variantInfo}>
                        {entry.reason}
                      </AppText>
                      <AppText variant="caption" color={colors.primary}>
                        {entry.previousQuantity} → {entry.newQuantity} ({entry.delta >= 0 ? `+${entry.delta}` : entry.delta})
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </AppModal>

      {/* Customer Preview Modal */}
      <AppModal onClose={() => setPreviewOpen(false)} title="Customer Preview" visible={previewOpen}>
        {previewProduct ? (
          <View style={styles.modalStack}>
            <ProductCard product={previewProduct} onPress={() => {}} />
            <InlineAlert
              message="This is how your product appears in Customer Shopping & Products."
              variant="info"
            />
          </View>
        ) : null}
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topControls: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  tabRail: { gap: spacing.xs, paddingVertical: 2 },
  chipRail: { gap: spacing.xs, paddingVertical: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tabPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  topBtnRow: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  listContent: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  productCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTop: { flexDirection: 'row', gap: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMeta: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  modalStack: { gap: spacing.sm, paddingBottom: spacing.lg },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  subCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  attrRow: { gap: 4 },
  variantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: spacing.xs,
  },
  variantInfo: { flex: 1 },
  variantAdder: { gap: spacing.xs, marginTop: spacing.xs },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 4 },
  mediaThumb: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  editorFooter: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  historyBox: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
