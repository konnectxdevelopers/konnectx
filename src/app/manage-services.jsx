import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppHeader,
  AppIcon,
  AppInput,
  AppModal,
  AppPressable,
  AppText,
  Badge,
  InlineAlert,
  LoadingState,
  useToast,
} from '../components/ui';
import { useAuth } from '../auth/AuthProvider';
import ListingPreviewContent from '../features/marketplace/ListingPreviewContent';
import {
  archiveListingRequest,
  attachServiceMediaRequest,
  deleteServiceMediaRequest,
  getCategoriesRequest,
  getListingCapabilitiesRequest,
  getMyListingsRequest,
  getMyServicesRequest,
  getSavedListingPreviewRequest,
  pauseListingRequest,
  previewListingPayloadRequest,
  publishListingRequest,
  resumeListingRequest,
  saveListingDraftRequest,
  deletePendingUploadRequest,
  submitListingForReviewRequest,
} from '../services/marketplace/marketplaceService';
import { uploadServiceMediaRequest } from '../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../theme/tokens';
import { dashboardArtworkForCategory } from '../features/profile/dashboardAssets';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'published', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
];

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const PRICING_TYPES = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'per_visit', label: 'Per visit' },
  { value: 'per_day', label: 'Per day' },
  { value: 'starting_from', label: 'Starting from' },
  { value: 'quote_required', label: 'Quote required' },
  { value: 'negotiable', label: 'Negotiable' },
];

const DELIVERY_METHODS = [
  { value: 'customer_location', label: 'At customer location' },
  { value: 'provider_location', label: 'At my location' },
  { value: 'online', label: 'Online' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Online and in person' },
];

const EMPTY_FORM = {
  title: '',
  shortDescription: '',
  description: '',
  categoryId: '',
  subcategoryId: '',
  tags: '',
  inclusions: '',
  exclusions: '',
  pricingType: 'fixed',
  price: '',
  minPrice: '',
  maxPrice: '',
  currency: 'INR',
  deliveryMethod: 'customer_location',
  durationValue: '',
  durationUnit: 'hours',
  bookingLeadTimeHours: '',
  city: '',
  state: '',
  area: '',
  radiusKm: '',
  selectedDays: [],
  startTime: '09:00',
  endTime: '17:00',
  customerRequirements: '',
  cancellationPolicy: '',
  termsAndConditions: '',
  customAttributes: {},
  packageName: '',
  packagePrice: '',
  packageDescription: '',
};

function toForm(service) {
  const firstLocation = service.locations?.[0] || {};
  const firstSlot = service.availability?.[0] || {};
  const firstPackage = service.packages?.[0] || {};
  return {
    ...EMPTY_FORM,
    title: service.title || '',
    shortDescription: service.shortDescription || '',
    description: service.description || '',
    categoryId: service.categoryId || '',
    subcategoryId: service.subcategoryId || '',
    tags: (service.tags || []).filter((t) => !t.startsWith('include:') && !t.startsWith('exclude:')).join(', '),
    inclusions: (service.inclusions || []).join(', '),
    exclusions: (service.exclusions || []).join(', '),
    pricingType: service.pricingType || 'fixed',
    price: service.price === null ? '' : String(service.price ?? ''),
    minPrice: service.minPrice === null ? '' : String(service.minPrice ?? ''),
    maxPrice: service.maxPrice === null ? '' : String(service.maxPrice ?? ''),
    currency: service.currency || 'INR',
    deliveryMethod: service.deliveryMethod || 'customer_location',
    durationValue: service.durationValue === null ? '' : String(service.durationValue ?? ''),
    durationUnit: service.durationUnit || 'hours',
    bookingLeadTimeHours: service.bookingLeadTimeHours === null || service.bookingLeadTimeHours === undefined
      ? ''
      : String(service.bookingLeadTimeHours),
    city: firstLocation.city || '',
    state: firstLocation.state || '',
    area: firstLocation.area || '',
    radiusKm: firstLocation.radiusKm ? String(firstLocation.radiusKm) : '',
    selectedDays: [...new Set((service.availability || []).map((slot) => slot.dayOfWeek))],
    startTime: firstSlot.startTime || '09:00',
    endTime: firstSlot.endTime || '17:00',
    customerRequirements: service.customerRequirements || '',
    cancellationPolicy: service.cancellationPolicy || '',
    termsAndConditions: service.termsAndConditions || '',
    customAttributes: service.customAttributes || {},
    packageName: firstPackage.name || '',
    packagePrice: firstPackage.price !== null && firstPackage.price !== undefined ? String(firstPackage.price) : '',
    packageDescription: firstPackage.description || '',
  };
}

function statusBadgeTone(status) {
  if (status === 'published') return 'success';
  if (status === 'pending_review') return 'warning';
  if (status === 'rejected') return 'danger';
  if (status === 'paused') return 'info';
  return 'neutral';
}

export default function ManageServicesScreen() {
  const { role } = useLocalSearchParams();
  const providerRole = (Array.isArray(role) ? role[0] : role) || 'professional';
  const { session } = useAuth();
  const toast = useToast();

  const [services, setServices] = useState([]);
  const [counts, setCounts] = useState({});
  const [moderationById, setModerationById] = useState({});
  const [capabilities, setCapabilities] = useState(null);
  const [activeStatus, setActiveStatus] = useState('');
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingService, setEditingService] = useState(null);
  const [pendingImages, setPendingImages] = useState([]);
  const [pendingVideo, setPendingVideo] = useState(null);
  const [previewListing, setPreviewListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.categoryId),
    [categories, form.categoryId]
  );
  const subcategories = selectedCategory?.subcategories || [];
  const categoryRules = selectedCategory?.rules || null;
  const categoryAttributes = selectedCategory?.attributes || [];

  const allowedDeliveryOptions = useMemo(() => {
    const allowed = categoryRules?.allowedDeliveryMethods;
    if (!allowed?.length) return DELIVERY_METHODS;
    return DELIVERY_METHODS.filter((opt) => allowed.includes(opt.value));
  }, [categoryRules]);

  const allowedPricingOptions = useMemo(() => {
    const allowed = categoryRules?.allowedPricingTypes;
    if (!allowed?.length) return PRICING_TYPES;
    return PRICING_TYPES.filter((opt) => allowed.includes(opt.value));
  }, [categoryRules]);

  const showLocationFields = useMemo(() => {
    if (categoryRules) {
      return categoryRules.requiresLocation ||
        categoryRules.supportsCoverageRadius ||
        ['customer_location', 'provider_location', 'hybrid'].includes(form.deliveryMethod);
    }
    return ['customer_location', 'provider_location', 'hybrid'].includes(form.deliveryMethod);
  }, [categoryRules, form.deliveryMethod]);

  const fetchData = useCallback(async () => {
    if (!session?.token || !['professional', 'business'].includes(providerRole)) {
      throw new Error('Sign in with a professional or business account to manage services.');
    }
    const [categoryResponse, serviceResponse, unifiedResponse, capResponse] = await Promise.all([
      getCategoriesRequest(),
      getMyServicesRequest(session, {
        role: providerRole,
        status: activeStatus || undefined,
        page: 1,
        limit: 50,
      }),
      getMyListingsRequest(session, { type: 'service', page: 1, limit: 50 }),
      getListingCapabilitiesRequest(session),
    ]);
    const modMap = {};
    for (const item of unifiedResponse.listings || []) {
      modMap[item.id] = item.moderation || null;
    }
    return {
      categories: categoryResponse.categories || [],
      services: serviceResponse.services || [],
      counts: serviceResponse.counts || {},
      moderationById: modMap,
      capabilities: capResponse,
    };
  }, [activeStatus, providerRole, session]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchData();
      setCategories(data.categories);
      setServices(data.services);
      setCounts(data.counts);
      setModerationById(data.moderationById);
      setCapabilities(data.capabilities);
    } catch (requestError) {
      setError(requestError?.message || 'Could not load service management data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    let active = true;
    fetchData()
      .then((data) => {
        if (active) {
          setCategories(data.categories);
          setServices(data.services);
          setCounts(data.counts);
          setModerationById(data.moderationById);
          setCapabilities(data.capabilities);
          setError(null);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || 'Could not load service management data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchData]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setCustomAttribute = (key, value) => {
    setForm((current) => ({
      ...current,
      customAttributes: { ...current.customAttributes, [key]: value },
    }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingService(null);
    setPendingImages([]);
    setPendingVideo(null);
  };

  const beginEdit = (service) => {
    setEditingService(service);
    setForm(toForm(service));
    setPendingImages([]);
    setPendingVideo(null);
    setError(null);
  };

  const pickMedia = async (type) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo library access to choose service media.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === 'image' ? ['images'] : ['videos'],
        allowsEditing: type === 'image',
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      if (type === 'image') {
        setPendingImages((current) => [...current, result.assets[0]]);
      } else {
        setPendingVideo(result.assets[0]);
      }
      setError(null);
    } catch (pickerError) {
      setError(pickerError?.message || 'Could not open the media library.');
    }
  };

  const servicePayload = (isDraft = false) => {
    const price = form.price.trim();
    const minimum = form.minPrice.trim();
    const maximum = form.maxPrice.trim();
    const priceOptional = isDraft || form.pricingType === 'negotiable' || form.pricingType === 'quote_required';
    if (!priceOptional && !price) {
      throw new Error('Enter a price or choose Negotiable / Quote required.');
    }
    if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) {
      throw new Error('Currency must be a three-letter code, such as INR.');
    }
    if ((minimum && !maximum) || (!minimum && maximum)) {
      throw new Error('Enter both minimum and maximum prices, or leave both blank.');
    }
    if (minimum && Number(minimum) > Number(maximum)) {
      throw new Error('Minimum price cannot exceed maximum price.');
    }

    const packages = form.packageName.trim()
      ? [{
        name: form.packageName.trim(),
        price: form.packagePrice.trim() ? Number(form.packagePrice.trim()) : null,
        description: form.packageDescription.trim() || null,
      }]
      : [];

    return {
      listingType: 'service',
      ownerRole: providerRole,
      providerRole,
      title: form.title.trim(),
      shortSummary: form.shortDescription.trim(),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId || null,
      subcategoryId: form.subcategoryId || null,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      inclusions: form.inclusions.split(',').map((item) => item.trim()).filter(Boolean),
      exclusions: form.exclusions.split(',').map((item) => item.trim()).filter(Boolean),
      pricingType: form.pricingType,
      price: price || null,
      minPrice: minimum || null,
      maxPrice: maximum || null,
      currency: form.currency.trim().toUpperCase(),
      deliveryMethod: form.deliveryMethod,
      durationValue: categoryRules?.supportsDuration === false ? null : form.durationValue.trim() || null,
      durationUnit: categoryRules?.supportsDuration === false || !form.durationValue.trim()
        ? null
        : form.durationUnit,
      bookingLeadTimeHours: categoryRules?.supportsBookingLeadTime === false
        ? null
        : form.bookingLeadTimeHours.trim() || null,
      locations: form.city.trim()
        ? [{
          city: form.city.trim(),
          state: form.state.trim() || null,
          area: form.area.trim() || null,
          radiusKm: categoryRules?.supportsCoverageRadius === false
            ? null
            : form.radiusKm.trim() || null,
        }]
        : [],
      availability: categoryRules?.supportsAvailability === false ? [] : form.selectedDays.map((dayOfWeek) => ({
        dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
      })),
      customerRequirements: form.customerRequirements.trim() || null,
      cancellationPolicy: form.cancellationPolicy.trim() || null,
      termsAndConditions: form.termsAndConditions.trim() || null,
      customAttributes: form.customAttributes,
      packages: categoryRules?.supportsPackages === false ? [] : packages,
    };
  };

  const requireReviewForService = useMemo(() => {
    const reqTypes = capabilities?.moderationPolicy?.requireReviewTypes || [];
    return reqTypes.includes('all') || reqTypes.includes('service');
  }, [capabilities]);

  const handleSave = async (actionMode) => {
    try {
      const isDraft = actionMode === 'draft';
      const payload = servicePayload(isDraft);
      if (!isDraft) {
        if (!payload.title || !payload.shortDescription || !payload.description || !payload.categoryId) {
          throw new Error('Add a title, short description, full description, and category.');
        }
        const locationNeeded = categoryRules
          ? categoryRules.requiresLocation
          : ['customer_location', 'provider_location', 'hybrid'].includes(payload.deliveryMethod);
        if (locationNeeded && !payload.locations.length) {
          throw new Error('Add a city or service area for this service category.');
        }
      }

      setSaving(true);
      setError(null);

      const saved = await saveListingDraftRequest(session, payload, editingService?.id);
      const serviceId = saved.listing.id;
      setEditingService((current) => current
        ? { ...current, id: serviceId, status: 'draft' }
        : { id: serviceId, status: 'draft', media: [] });

      for (const image of pendingImages) {
        const asset = await uploadServiceMediaRequest(session, providerRole, image, 'image');
        try {
          await attachServiceMediaRequest(session, serviceId, asset.id, 'image');
        } catch (attachError) {
          try {
            await deletePendingUploadRequest(session, asset.id);
          } catch (cleanupError) {
            throw new Error(
              `${attachError?.message || 'Could not attach the image.'} The uploaded file also could not be cleaned up: ${cleanupError?.message || 'cleanup failed.'}`,
              { cause: attachError }
            );
          }
          throw attachError;
        }
        setPendingImages((current) => current.filter((item) => item.uri !== image.uri));
      }
      if (pendingVideo) {
        const asset = await uploadServiceMediaRequest(session, providerRole, pendingVideo, 'video');
        try {
          await attachServiceMediaRequest(session, serviceId, asset.id, 'video');
        } catch (attachError) {
          try {
            await deletePendingUploadRequest(session, asset.id);
          } catch (cleanupError) {
            throw new Error(
              `${attachError?.message || 'Could not attach the video.'} The uploaded file also could not be cleaned up: ${cleanupError?.message || 'cleanup failed.'}`,
              { cause: attachError }
            );
          }
          throw attachError;
        }
        setPendingVideo(null);
      }

      if (!isDraft) {
        if (actionMode === 'submit_review') {
          await submitListingForReviewRequest(session, serviceId);
        } else {
          await publishListingRequest(session, serviceId);
        }
      }

      toast?.show?.(
        isDraft ? 'Draft saved.' : actionMode === 'submit_review' ? 'Submitted for review.' : 'Service saved.',
        { variant: 'success' }
      );
      resetForm();
      await loadData(true);
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this service.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewForm = async () => {
    try {
      setError(null);
      const payload = servicePayload(true);
      const res = await previewListingPayloadRequest(session, {
        ...payload,
        id: editingService?.id,
        media: [
          ...(editingService?.media || []),
          ...pendingImages.map((img, i) => ({
            id: `pending-${i}`,
            mediaType: 'image',
            previewUri: img.uri,
            isCover: i === 0 && !(editingService?.media || []).length,
          })),
        ],
      });
      setPreviewListing(res.preview);
    } catch (err) {
      setError(err?.message || 'Could not build preview.');
    }
  };

  const openSavedPreview = async (service) => {
    try {
      const res = await getSavedListingPreviewRequest(session, service.id);
      setPreviewListing(res.preview);
    } catch (err) {
      setError(err?.message || 'Could not load service preview.');
    }
  };

  const runLifecycle = async (fn, message) => {
    setError(null);
    try {
      await fn();
      toast?.show?.(message, { variant: 'success' });
      await loadData(true);
    } catch (statusError) {
      setError(statusError?.message || 'Could not update service status.');
    }
  };

  const confirmArchive = (service) => {
    Alert.alert(
      'Archive service?',
      'This service will be removed from customer discovery and can no longer be edited.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => runLifecycle(() => archiveListingRequest(session, service.id), 'Service archived.'),
        },
      ]
    );
  };

  const removeMedia = async (service, media) => {
    setError(null);
    try {
      await deleteServiceMediaRequest(session, service.id, media.id);
      await loadData(true);
    } catch (mediaError) {
      setError(mediaError?.message || 'Could not delete service media.');
    }
  };

  const renderChoiceRow = (items, selected, onSelect) => (
    <View style={styles.choices}>
      {items.map((item) => (
        <AppPressable
          key={item.value}
          onPress={() => onSelect(item.value)}
          style={[styles.choice, selected === item.value && styles.choiceSelected]}
        >
          <AppText
            variant="caption"
            color={selected === item.value ? colors.inverse : colors.textSecondary}
          >
            {item.label}
          </AppText>
        </AppPressable>
      ))}
    </View>
  );

  const renderForm = () => (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <View style={styles.flex}>
          <AppText variant="subtitle" color={colors.text}>
            {editingService ? 'Edit service' : 'Create a service'}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {providerRole === 'business'
              ? 'Linked to your Business profile'
              : 'Linked to your Professional profile'}
          </AppText>
        </View>
        <AppButton onPress={handlePreviewForm} size="sm" title="Preview" variant="outline" />
        {editingService ? (
          <AppButton onPress={resetForm} size="sm" title="Cancel" variant="ghost" />
        ) : null}
      </View>

      <AppInput
        label="Service title"
        maxLength={180}
        onChangeText={(value) => setField('title', value)}
        placeholder="e.g. Home electrical inspection"
        value={form.title}
      />
      <AppText variant="label" color={colors.textSecondary}>Main category</AppText>
      <View style={styles.choiceList}>
        {categories.map((category) => (
          <AppPressable
            key={category.id}
            onPress={() => {
              const rules = category.rules;
              setForm((current) => ({
                ...current,
                categoryId: category.id,
                subcategoryId: '',
                customAttributes: {},
                deliveryMethod: rules?.allowedDeliveryMethods?.length && !rules.allowedDeliveryMethods.includes(current.deliveryMethod)
                  ? rules.allowedDeliveryMethods[0]
                  : current.deliveryMethod,
                pricingType: rules?.allowedPricingTypes?.length && !rules.allowedPricingTypes.includes(current.pricingType)
                  ? rules.allowedPricingTypes[0]
                  : current.pricingType,
              }));
            }}
            style={[styles.categoryChoice, form.categoryId === category.id && styles.choiceSelected]}
          >
            <AppText
              variant="caption"
              color={form.categoryId === category.id ? colors.inverse : colors.textSecondary}
            >
              {category.name}
            </AppText>
          </AppPressable>
        ))}
      </View>
      {subcategories.length ? (
        <>
          <AppText variant="label" color={colors.textSecondary}>Subcategory</AppText>
          <View style={styles.choiceList}>
            {subcategories.map((subcategory) => (
              <AppPressable
                key={subcategory.id}
                onPress={() => setField('subcategoryId', subcategory.id)}
                style={[
                  styles.categoryChoice,
                  form.subcategoryId === subcategory.id && styles.choiceSelected,
                ]}
              >
                <AppText
                  variant="caption"
                  color={form.subcategoryId === subcategory.id ? colors.inverse : colors.textSecondary}
                >
                  {subcategory.name}
                </AppText>
              </AppPressable>
            ))}
          </View>
        </>
      ) : null}

      {categoryAttributes.length ? (
        <View style={styles.attrSection}>
          <AppText variant="label" color={colors.textSecondary}>
            Category specifications ({selectedCategory?.name})
          </AppText>
          {categoryAttributes.map((attr) => {
            const val = form.customAttributes?.[attr.key] ?? '';
            if (attr.type === 'select' && Array.isArray(attr.options)) {
              return (
                <View key={attr.key} style={styles.attrGroup}>
                  <AppText variant="caption" color={colors.muted}>{attr.label}</AppText>
                  <View style={styles.choices}>
                    {attr.options.map((opt) => (
                      <AppPressable
                        key={opt}
                        onPress={() => setCustomAttribute(attr.key, opt)}
                        style={[styles.choice, val === opt && styles.choiceSelected]}
                      >
                        <AppText variant="caption" color={val === opt ? colors.inverse : colors.textSecondary}>
                          {opt}
                        </AppText>
                      </AppPressable>
                    ))}
                  </View>
                </View>
              );
            }
            return (
              <AppInput
                key={attr.key}
                keyboardType={attr.type === 'number' ? 'decimal-pad' : 'default'}
                label={attr.label}
                onChangeText={(textVal) => setCustomAttribute(attr.key, textVal)}
                value={String(val)}
              />
            );
          })}
        </View>
      ) : null}

      <AppInput
        label="Short description"
        maxLength={500}
        onChangeText={(value) => setField('shortDescription', value)}
        placeholder="A clear one-line summary"
        value={form.shortDescription}
      />
      <AppInput
        label="Detailed description"
        maxLength={5000}
        multiline
        onChangeText={(value) => setField('description', value)}
        placeholder="Explain what customers receive..."
        value={form.description}
      />

      <AppText variant="label" color={colors.textSecondary}>Pricing model</AppText>
      {renderChoiceRow(allowedPricingOptions, form.pricingType, (value) => setField('pricingType', value))}
      {!['negotiable', 'quote_required'].includes(form.pricingType) ? (
        <AppInput
          keyboardType="decimal-pad"
          label={form.pricingType === 'starting_from' ? 'Starting price' : 'Price'}
          onChangeText={(value) => setField('price', value)}
          placeholder="1500"
          value={form.price}
        />
      ) : null}
      <View style={styles.priceFields}>
        <AppInput
          keyboardType="decimal-pad"
          label="Minimum price (optional)"
          onChangeText={(value) => setField('minPrice', value)}
          placeholder="Minimum"
          value={form.minPrice}
        />
        <AppInput
          keyboardType="decimal-pad"
          label="Maximum price (optional)"
          onChangeText={(value) => setField('maxPrice', value)}
          placeholder="Maximum"
          value={form.maxPrice}
        />
      </View>
      <AppInput
        autoCapitalize="characters"
        label="Currency"
        maxLength={3}
        onChangeText={(value) => setField('currency', value)}
        value={form.currency}
      />

      <AppText variant="label" color={colors.textSecondary}>Service delivery</AppText>
      {renderChoiceRow(
        allowedDeliveryOptions,
        form.deliveryMethod,
        (value) => setField('deliveryMethod', value)
      )}

      {categoryRules?.supportsDuration !== false ? (
        <View style={styles.priceFields}>
          <AppInput
            keyboardType="decimal-pad"
            label="Estimated duration"
            onChangeText={(value) => setField('durationValue', value)}
            placeholder="2"
            value={form.durationValue}
          />
          <View style={styles.durationUnits}>
            {renderChoiceRow(
              [
                { value: 'minutes', label: 'Min' },
                { value: 'hours', label: 'Hours' },
                { value: 'days', label: 'Days' },
              ],
              form.durationUnit,
              (value) => setField('durationUnit', value)
            )}
          </View>
        </View>
      ) : null}

      {categoryRules?.supportsBookingLeadTime !== false ? (
        <AppInput
          keyboardType="number-pad"
          label="Booking lead time in hours (optional)"
          onChangeText={(value) => setField('bookingLeadTimeHours', value)}
          placeholder="e.g. 24"
          value={form.bookingLeadTimeHours}
        />
      ) : null}

      {showLocationFields ? (
        <>
          <AppText variant="label" color={colors.textSecondary}>Service coverage area</AppText>
          <AppInput
            label="City"
            onChangeText={(value) => setField('city', value)}
            placeholder="City"
            value={form.city}
          />
          <View style={styles.priceFields}>
            <AppInput
              label="State"
              onChangeText={(value) => setField('state', value)}
              placeholder="State"
              value={form.state}
            />
            <AppInput
              label="Area"
              onChangeText={(value) => setField('area', value)}
              placeholder="Neighborhood"
              value={form.area}
            />
          </View>
          {categoryRules?.supportsCoverageRadius !== false ? (
            <AppInput
              keyboardType="decimal-pad"
              label="Working radius in km (optional)"
              onChangeText={(value) => setField('radiusKm', value)}
              placeholder="10"
              value={form.radiusKm}
            />
          ) : null}
        </>
      ) : null}

      {categoryRules?.supportsAvailability !== false ? (
        <>
          <AppText variant="label" color={colors.textSecondary}>Available days</AppText>
          <View style={styles.choices}>
            {DAYS.map((day) => {
              const selected = form.selectedDays.includes(day.value);
              return (
                <AppPressable
                  key={day.value}
                  onPress={() => setForm((current) => ({
                    ...current,
                    selectedDays: selected
                      ? current.selectedDays.filter((item) => item !== day.value)
                      : [...current.selectedDays, day.value].sort(),
                  }))}
                  style={[styles.dayChoice, selected && styles.choiceSelected]}
                >
                  <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                    {day.label}
                  </AppText>
                </AppPressable>
              );
            })}
          </View>
          {form.selectedDays.length ? (
            <View style={styles.priceFields}>
              <AppInput
                label="Start time (24-hour)"
                onChangeText={(value) => setField('startTime', value)}
                placeholder="09:00"
                value={form.startTime}
              />
              <AppInput
                label="End time (24-hour)"
                onChangeText={(value) => setField('endTime', value)}
                placeholder="17:00"
                value={form.endTime}
              />
            </View>
          ) : null}
        </>
      ) : null}

      <AppInput
        label="What's included (comma-separated, optional)"
        onChangeText={(value) => setField('inclusions', value)}
        placeholder="Inspection, standard tools"
        value={form.inclusions}
      />
      <AppInput
        label="Exclusions (comma-separated, optional)"
        onChangeText={(value) => setField('exclusions', value)}
        placeholder="Spare parts cost"
        value={form.exclusions}
      />
      <AppInput
        label="Service tags (comma-separated)"
        onChangeText={(value) => setField('tags', value)}
        placeholder="inspection, home repair"
        value={form.tags}
      />
      <AppInput
        label="Customer requirements (optional)"
        multiline
        onChangeText={(value) => setField('customerRequirements', value)}
        placeholder="What should customers prepare?"
        value={form.customerRequirements}
      />
      <AppInput
        label="Cancellation policy (optional)"
        multiline
        onChangeText={(value) => setField('cancellationPolicy', value)}
        placeholder="e.g. Free cancellation up to 12 hours before appointment"
        value={form.cancellationPolicy}
      />
      <AppInput
        label="Terms and conditions (optional)"
        multiline
        onChangeText={(value) => setField('termsAndConditions', value)}
        placeholder="Share relevant service terms"
        value={form.termsAndConditions}
      />

      {categoryRules?.supportsPackages !== false ? (
        <View style={styles.attrSection}>
          <AppText variant="label" color={colors.textSecondary}>Optional starter package</AppText>
          <AppInput
            label="Package name"
            onChangeText={(value) => setField('packageName', value)}
            placeholder="e.g. Standard Home Visit"
            value={form.packageName}
          />
          <AppInput
            keyboardType="decimal-pad"
            label="Package price"
            onChangeText={(value) => setField('packagePrice', value)}
            placeholder="1999"
            value={form.packagePrice}
          />
          <AppInput
            label="Package summary"
            onChangeText={(value) => setField('packageDescription', value)}
            placeholder="What this package covers"
            value={form.packageDescription}
          />
        </View>
      ) : null}

      <AppText variant="label" color={colors.textSecondary}>Photos and video</AppText>
      <View style={styles.mediaActions}>
        <AppButton
          disabled={saving}
          icon="image-plus"
          onPress={() => pickMedia('image')}
          size="sm"
          title="Add photo"
          variant="secondary"
        />
        <AppButton
          disabled={saving || Boolean(pendingVideo)}
          icon="video-plus-outline"
          onPress={() => pickMedia('video')}
          size="sm"
          title={pendingVideo ? 'Video selected' : 'Add video'}
          variant="secondary"
        />
      </View>
      {pendingImages.map((asset, index) => (
        <View key={`${asset.uri}-${index}`} style={styles.pendingMedia}>
          <Image source={{ uri: asset.uri }} style={styles.pendingImage} />
          <AppText variant="caption" color={colors.muted} numberOfLines={1} style={styles.flex}>
            {asset.fileName || 'Selected service photo'}
          </AppText>
          <AppButton
            onPress={() => setPendingImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            size="sm"
            title="Remove"
            variant="ghost"
          />
        </View>
      ))}
      {pendingVideo ? (
        <View style={styles.pendingMedia}>
          <AppIcon name="video-outline" size={20} color={colors.primary} />
          <AppText variant="caption" color={colors.muted} numberOfLines={1} style={styles.flex}>
            {pendingVideo.fileName || 'Selected demonstration video'}
          </AppText>
          <AppButton onPress={() => setPendingVideo(null)} size="sm" title="Remove" variant="ghost" />
        </View>
      ) : null}
      {editingService?.media?.length ? (
        <View style={styles.mediaGallery}>
          {editingService.media.map((media) => (
            <View key={media.id} style={styles.existingMedia}>
              {media.mediaType === 'image' && media.url ? (
                <Image source={{ uri: media.url }} style={styles.pendingImage} />
              ) : (
                <AppIcon name="video-outline" size={24} color={colors.primary} />
              )}
              <AppButton
                onPress={() => removeMedia(editingService, media)}
                size="sm"
                title="Remove"
                variant="ghost"
              />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.formButtons}>
        <AppButton
          disabled={saving}
          loading={saving}
          onPress={() => handleSave('draft')}
          style={styles.flex}
          title="Save draft"
          variant="secondary"
        />
        <AppButton
          disabled={saving}
          loading={saving}
          onPress={() => handleSave(requireReviewForService ? 'submit_review' : 'publish')}
          style={styles.flex}
          title={
            requireReviewForService
              ? 'Submit review'
              : editingService
                ? 'Save & publish'
                : 'Publish service'
          }
          variant="cta"
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        title={providerRole === 'business' ? 'Business Services' : 'My Services'}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => loadData(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
      >
        {error ? <InlineAlert message={error} variant="error" /> : null}
        {renderForm()}
        <View style={styles.listHeader}>
          <View>
            <AppText variant="subtitle" color={colors.text}>Your services</AppText>
            <AppText variant="caption" color={colors.muted}>
              {services.length} listing{services.length === 1 ? '' : 's'} shown
            </AppText>
          </View>
          <AppButton onPress={() => loadData(true)} size="sm" title="Refresh" variant="ghost" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
          {STATUS_TABS.map((tab) => {
            const count = tab.key === '' ? (counts.all ?? services.length) : (counts[tab.key] ?? 0);
            const selected = activeStatus === tab.key;
            return (
              <AppPressable
                key={tab.key || 'all'}
                onPress={() => setActiveStatus(tab.key)}
                style={[styles.choice, selected && styles.choiceSelected]}
              >
                <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                  {tab.label} ({count})
                </AppText>
              </AppPressable>
            );
          })}
        </ScrollView>

        {loading ? <LoadingState message="Loading your services..." /> : null}
        {!loading && !services.length ? (
          <View style={styles.emptyCard}>
            <AppText variant="label" color={colors.text}>
              {activeStatus ? `No ${activeStatus.replace('_', ' ')} services` : 'No services yet'}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              Create or publish a service above to make it available in Customer Services.
            </AppText>
          </View>
        ) : null}
        {services.map((service) => {
          const serviceImage = service.media?.find((item) => item.mediaType === 'image' && item.url);
          const moderation = moderationById[service.id];
          return (
            <View key={service.id} style={styles.serviceCard}>
              <Image
                source={serviceImage?.url
                  ? { uri: serviceImage.url }
                  : dashboardArtworkForCategory(service.categoryName || service.title)}
                style={styles.serviceImage}
                resizeMode="cover"
              />
              <View style={styles.serviceBody}>
                <View style={styles.serviceTitleRow}>
                  <View style={styles.flex}>
                    <AppText variant="label" color={colors.text} numberOfLines={1}>
                      {service.title}
                    </AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {service.categoryName || 'Uncategorized'} · {service.price === null
                        ? service.pricingType === 'quote_required' ? 'Quote required' : 'Negotiable'
                        : `${service.currency} ${service.price}`}
                    </AppText>
                  </View>
                  <Badge
                    label={service.status.replace('_', ' ')}
                    tone={statusBadgeTone(service.status)}
                  />
                </View>
                <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
                  {service.shortDescription}
                </AppText>
                {service.status === 'rejected' && moderation?.reason ? (
                  <InlineAlert message={`Moderation feedback: ${moderation.reason}`} variant="error" />
                ) : null}
                <View style={styles.serviceActions}>
                  {service.status !== 'archived' ? (
                    <AppButton
                      onPress={() => beginEdit(service)}
                      size="sm"
                      title="Edit"
                      variant="secondary"
                    />
                  ) : null}
                  <AppButton
                    onPress={() => openSavedPreview(service)}
                    size="sm"
                    title="Preview"
                    variant="outline"
                  />
                  {['draft', 'rejected'].includes(service.status) ? (
                    <AppButton
                      onPress={() => runLifecycle(
                        () => requireReviewForService
                          ? submitListingForReviewRequest(session, service.id)
                          : publishListingRequest(session, service.id),
                        requireReviewForService ? 'Submitted for review.' : 'Service published.'
                      )}
                      size="sm"
                      title={requireReviewForService ? 'Submit' : 'Publish'}
                    />
                  ) : null}
                  {service.status === 'published' ? (
                    <AppButton
                      onPress={() => runLifecycle(() => pauseListingRequest(session, service.id), 'Service paused.')}
                      size="sm"
                      title="Pause"
                      variant="outline"
                    />
                  ) : null}
                  {service.status === 'paused' ? (
                    <AppButton
                      onPress={() => runLifecycle(() => resumeListingRequest(session, service.id), 'Service resumed.')}
                      size="sm"
                      title="Resume"
                    />
                  ) : null}
                  {service.status === 'published' ? (
                    <AppButton
                      onPress={() => router.push(`/service/${service.id}`)}
                      size="sm"
                      title="View"
                      variant="ghost"
                    />
                  ) : null}
                  {service.status !== 'archived' ? (
                    <AppButton
                      onPress={() => confirmArchive(service)}
                      size="sm"
                      title="Archive"
                      variant="danger"
                    />
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <AppModal
        actions={<AppButton onPress={() => setPreviewListing(null)} title="Close preview" variant="secondary" />}
        onClose={() => setPreviewListing(null)}
        title="Service Preview"
        visible={Boolean(previewListing)}
      >
        <ScrollView style={styles.modalScroll}>
          <ListingPreviewContent isPreview listing={previewListing} />
        </ScrollView>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  choiceList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChoice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChoice: {
    minWidth: 42,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  attrSection: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  attrGroup: { gap: spacing.xs },
  priceFields: { flexDirection: 'row', gap: spacing.sm },
  durationUnits: { flex: 1, justifyContent: 'center' },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pendingMedia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  pendingImage: { width: 52, height: 52, borderRadius: radii.sm },
  mediaGallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  existingMedia: { alignItems: 'center', gap: spacing.xxs },
  formButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  serviceCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  serviceImage: { width: 96, minHeight: 150 },
  serviceBody: { flex: 1, padding: spacing.md, gap: spacing.sm },
  serviceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  serviceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  modalScroll: { maxHeight: 460 },
});
