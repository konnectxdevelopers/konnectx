import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
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
  InlineAlert,
  LoadingState,
  useToast,
} from '../components/ui';
import ListingPreviewContent from '../features/marketplace/ListingPreviewContent';
import {
  attachListingMediaRequest,
  createListingRequest,
  deleteListingMediaRequest,
  getCategoriesRequest,
  getListingCapabilitiesRequest,
  getMarketplaceCategoryTreeRequest,
  getMyListingDetailRequest,
  pauseListingRequest,
  previewListingPayloadRequest,
  publishListingRequest,
  reorderListingMediaRequest,
  resumeListingRequest,
  saveListingDraftRequest,
  submitListingForReviewRequest,
  updateListingRequest,
} from '../services/marketplace/marketplaceService';
import {
  deletePendingUploadRequest,
  uploadListingMediaRequest,
} from '../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../theme/tokens';

const TYPE_OPTIONS = [
  { key: 'service', label: 'Service' },
  { key: 'product', label: 'Product' },
  { key: 'job', label: 'Job' },
  { key: 'freelance_project', label: 'Freelance Project' },
  { key: 'professional_profile', label: 'Professional Profile' },
  { key: 'business_profile', label: 'Business Profile' },
];

const INITIAL_FORM = {
  title: '',
  shortSummary: '',
  description: '',
  categoryId: '',
  subcategoryId: '',
  visibility: 'public',
  city: '',
  state: '',
  country: '',
  currency: 'INR',
  // service
  deliveryMethod: 'customer_location',
  pricingType: 'fixed',
  price: '',
  durationValue: '',
  durationUnit: 'hours',
  tags: '',
  // product
  stockQuantity: '1',
  deliveryInfo: '',
  // job
  employmentType: 'full-time',
  workMode: 'on-site',
  salaryMin: '',
  salaryMax: '',
  experienceRequired: '',
  educationRequired: '',
  skills: '',
  deadline: '',
  // freelance_project
  budget: '',
  deliverables: '',
  // profile
  industry: '',
  hiringEnabled: false,
};

function toSectionKey(listingType) {
  if (listingType === 'freelance_project') return 'project';
  if (listingType === 'professional_profile') return 'professional';
  if (listingType === 'business_profile') return 'business';
  return listingType;
}

function hydrateFormFromListing(listing) {
  const d = listing?.details || {};
  const loc = listing?.location || {};
  return {
    ...INITIAL_FORM,
    title: listing.title || '',
    shortSummary: listing.shortSummary || '',
    description: listing.description || '',
    categoryId: listing.categoryId || '',
    subcategoryId: listing.subcategoryId || '',
    visibility: listing.visibility || 'public',
    city: loc.city || d.city || d.location || '',
    state: loc.state || d.state || '',
    country: loc.country || d.country || '',
    currency: d.currency || 'INR',
    deliveryMethod: d.deliveryMethod || 'customer_location',
    pricingType: d.pricingType || 'fixed',
    price: d.price !== null && d.price !== undefined ? String(d.price) : '',
    durationValue: d.durationValue !== null && d.durationValue !== undefined ? String(d.durationValue) : '',
    durationUnit: d.durationUnit || 'hours',
    tags: Array.isArray(d.tags) ? d.tags.join(', ') : '',
    stockQuantity: d.stockQuantity !== undefined ? String(d.stockQuantity) : '1',
    deliveryInfo: d.deliveryInfo || '',
    employmentType: d.employmentType || 'full-time',
    workMode: d.workMode || 'on-site',
    salaryMin: d.salaryMin !== null && d.salaryMin !== undefined ? String(d.salaryMin) : '',
    salaryMax: d.salaryMax !== null && d.salaryMax !== undefined ? String(d.salaryMax) : '',
    experienceRequired: d.experienceRequired || '',
    educationRequired: d.educationRequired || '',
    skills: Array.isArray(d.skills || d.requiredSkills) ? (d.skills || d.requiredSkills).join(', ') : '',
    deadline: d.deadline ? String(d.deadline).slice(0, 10) : '',
    budget: d.budget !== null && d.budget !== undefined ? String(d.budget) : '',
    deliverables: d.deliverables || '',
    industry: d.industry || '',
    hiringEnabled: Boolean(d.hiringEnabled),
  };
}

export default function ListingEditorScreen() {
  const params = useLocalSearchParams();
  const editId = Array.isArray(params.id) ? params.id[0] : params.id;
  const paramRole = Array.isArray(params.role) ? params.role[0] : params.role;
  const paramType = Array.isArray(params.type) ? params.type[0] : params.type;
  const { session } = useAuth();
  const toast = useToast();

  const [capabilities, setCapabilities] = useState(null);
  const [listingType, setListingType] = useState(paramType || '');
  const [existingListing, setExistingListing] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [attachedMedia, setAttachedMedia] = useState([]);
  const [pendingMedia, setPendingMedia] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState(null);
  const [categoryError, setCategoryError] = useState(null);

  const loadInitial = useCallback(async () => {
    if (!session?.token) {
      setError('Sign in to create or edit listings.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cap = await getListingCapabilitiesRequest(session);
      setCapabilities(cap);
      if (editId) {
        const detail = await getMyListingDetailRequest(session, editId);
        const item = detail.listing;
        setExistingListing(item);
        setListingType(item.listingType);
        setForm(hydrateFormFromListing(item));
        setAttachedMedia(item.media || []);
      } else {
        const defaultType = (paramType && cap.allowedListingTypes?.includes(paramType))
          ? paramType
          : cap.allowedListingTypes?.[0] || '';
        setListingType(defaultType);
      }
    } catch (loadError) {
      setError(loadError?.message || 'Could not load listing editor.');
    } finally {
      setLoading(false);
    }
  }, [editId, paramType, session]);

  useEffect(() => {
    Promise.resolve().then(() => loadInitial());
  }, [loadInitial]);

  useEffect(() => {
    if (!listingType) return;
    let active = true;
    const loadCats = async () => {
      try {
        let nextCategories = [];
        if (listingType === 'service') {
          const res = await getCategoriesRequest();
          nextCategories = res.categories || [];
        } else {
          const section = toSectionKey(listingType);
          const res = await getMarketplaceCategoryTreeRequest(section);
          const root = (res.categories || []).find((c) => c.listingType === section);
          nextCategories = root?.children || [];
        }
        if (active) {
          setCategories(nextCategories);
          setCategoryError(null);
        }
      } catch (loadError) {
        if (active) {
          setCategories([]);
          setCategoryError(loadError?.message || 'Could not load listing categories. Try again.');
        }
      }
    };
    loadCats();
    return () => { active = false; };
  }, [listingType]);

  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === form.categoryId),
    [categories, form.categoryId]
  );
  const subcategories = selectedCategory?.subcategories || selectedCategory?.children || [];

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const uploadRoleForType = useMemo(() => {
    if (existingListing?.owner?.role) return existingListing.owner.role;
    if (paramRole && capabilities?.roles?.includes(paramRole)) return paramRole;
    if (listingType === 'product' || listingType === 'business_profile') return 'business';
    if (listingType === 'professional_profile') return 'professional';
    if (listingType === 'freelance_project') return 'hiring';
    if (listingType === 'job') return capabilities?.roles?.includes('hiring') ? 'hiring' : 'business';
    return capabilities?.roles?.includes('professional') ? 'professional' : 'business';
  }, [capabilities, existingListing, listingType, paramRole]);

  const buildPayload = () => {
    const base = {
      listingType,
      ownerRole: uploadRoleForType,
      title: form.title.trim(),
      shortSummary: form.shortSummary.trim() || null,
      description: form.description.trim(),
      categoryId: form.categoryId || null,
      subcategoryId: form.subcategoryId || null,
      visibility: form.visibility,
      currency: form.currency.trim().toUpperCase() || 'INR',
      location: (form.city || form.state || form.country) ? {
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        workMode: form.workMode || null,
      } : null,
    };

    if (listingType === 'service') {
      return {
        ...base,
        deliveryMethod: form.deliveryMethod,
        pricingType: form.pricingType,
        price: form.price.trim() || null,
        durationValue: form.durationValue.trim() || null,
        durationUnit: form.durationValue.trim() ? form.durationUnit : null,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        locations: form.city.trim() ? [{ city: form.city.trim(), state: form.state.trim() || null, country: form.country.trim() || null }] : [],
      };
    }
    if (listingType === 'product') {
      return {
        ...base,
        price: form.price.trim() || null,
        stockQuantity: form.stockQuantity.trim() || '0',
        deliveryInfo: form.deliveryInfo.trim() || null,
      };
    }
    if (listingType === 'job') {
      return {
        ...base,
        employmentType: form.employmentType,
        workMode: form.workMode,
        location: form.city.trim() || null,
        salaryMin: form.salaryMin.trim() || null,
        salaryMax: form.salaryMax.trim() || null,
        experienceRequired: form.experienceRequired.trim() || null,
        educationRequired: form.educationRequired.trim() || null,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        deadline: form.deadline.trim() || null,
      };
    }
    if (listingType === 'freelance_project') {
      return {
        ...base,
        budget: form.budget.trim() || null,
        deliverables: form.deliverables.trim() || null,
        workMode: form.workMode,
        location: form.city.trim() || null,
        requiredSkills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        deadline: form.deadline.trim() || null,
      };
    }
    return {
      ...base,
      industry: form.industry.trim() || null,
      hiringEnabled: form.hiringEnabled,
    };
  };

  const handlePickMedia = async (mediaType) => {
    try {
      setError(null);
      let assetSource = null;
      if (mediaType === 'document') {
        const doc = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
          copyToCacheDirectory: true,
        });
        if (doc.canceled || !doc.assets?.[0]) return;
        assetSource = doc.assets[0];
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError('Allow photo library access to upload media.');
          return;
        }
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: mediaType === 'image' ? ['images'] : ['videos'],
          allowsEditing: mediaType === 'image',
          quality: 0.85,
        });
        if (picked.canceled || !picked.assets?.[0]) return;
        assetSource = picked.assets[0];
      }

      setUploadingMedia(true);
      const uploaded = await uploadListingMediaRequest(session, uploadRoleForType, assetSource, mediaType);
      const item = {
        mediaAssetId: uploaded.id,
        mediaType,
        isCover: mediaType === 'image' && attachedMedia.length === 0 && pendingMedia.length === 0,
        altText: '',
        visibility: mediaType === 'document' ? 'private' : 'public',
        previewUri: assetSource.uri,
        mimeType: uploaded.contentType,
        fileSize: uploaded.byteSize,
      };

      if (existingListing?.id) {
        const res = await attachListingMediaRequest(session, existingListing.id, item);
        setAttachedMedia(res.listing?.media || [...attachedMedia, res.media]);
      } else {
        setPendingMedia((prev) => [...prev, item]);
      }
    } catch (uploadError) {
      setError(uploadError?.message || 'Could not upload media.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const removePendingMedia = async (item) => {
    try {
      await deletePendingUploadRequest(session, item.mediaAssetId);
    } catch {
      // Non-fatal; orphan cleanup also handles expired pending assets
    }
    setPendingMedia((prev) => prev.filter((m) => m.mediaAssetId !== item.mediaAssetId));
  };

  const removeAttachedMedia = (media) => {
    Alert.alert('Remove media?', 'This will remove the file from this listing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListingMediaRequest(session, existingListing.id, media.id);
            setAttachedMedia((prev) => prev.filter((m) => m.id !== media.id));
          } catch (mediaError) {
            setError(mediaError?.message || 'Could not remove media.');
          }
        },
      },
    ]);
  };

  const setCoverAttached = async (media) => {
    try {
      const res = await reorderListingMediaRequest(session, existingListing.id, { coverMediaId: media.id });
      setAttachedMedia(res.media || []);
    } catch (err) {
      setError(err?.message || 'Could not set cover image.');
    }
  };

  const moveAttachedMedia = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= attachedMedia.length) return;
    const next = [...attachedMedia];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setAttachedMedia(next);
    try {
      const res = await reorderListingMediaRequest(session, existingListing.id, {
        order: next.map((m) => m.id),
      });
      setAttachedMedia(res.media || next);
    } catch (err) {
      setError(err?.message || 'Could not reorder media.');
    }
  };

  const handlePreview = async () => {
    setError(null);
    try {
      const payload = buildPayload();
      const response = await previewListingPayloadRequest(session, {
        ...payload,
        id: existingListing?.id,
        media: [...attachedMedia, ...pendingMedia],
      });
      setPreviewData(response.preview);
    } catch (previewError) {
      setError(previewError?.message || 'Could not generate preview.');
    }
  };

  const handleSave = async (actionMode) => {
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      let saved;
      if (actionMode === 'draft') {
        const res = await saveListingDraftRequest(session, {
          ...payload,
          ...(existingListing ? {} : { media: pendingMedia }),
        }, existingListing?.id || null);
        saved = res.listing;
      } else if (existingListing?.id) {
        const updated = await updateListingRequest(session, existingListing.id, payload);
        saved = updated.listing;
        if (actionMode === 'submit_review') {
          const rev = await submitListingForReviewRequest(session, saved.id);
          saved = rev.listing;
        } else if (actionMode === 'publish') {
          const pub = await publishListingRequest(session, saved.id);
          saved = pub.listing;
        }
      } else {
        const targetStatus = actionMode === 'submit_review' ? 'pending_review' : 'published';
        const res = await createListingRequest(session, {
          ...payload,
          status: targetStatus,
          media: pendingMedia,
        });
        saved = res.listing;
      }

      if (!existingListing && pendingMedia.length) {
        setPendingMedia([]);
      }
      setExistingListing(saved);
      setAttachedMedia(saved.media || []);
      toast?.show?.(
        actionMode === 'draft'
          ? 'Draft saved.'
          : actionMode === 'submit_review'
            ? 'Submitted for review.'
            : 'Listing published.',
        { variant: 'success' }
      );
      router.replace('/my-listings');
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this listing.');
    } finally {
      setSaving(false);
    }
  };

  const requireReviewTypes = capabilities?.moderationPolicy?.requireReviewTypes || [];
  const mustReview = requireReviewTypes.includes('all') || requireReviewTypes.includes(listingType);
  const allowedTypes = capabilities?.allowedListingTypes || [];

  if (loading) return <LoadingState message="Loading listing editor..." />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        right={<AppButton onPress={handlePreview} size="sm" title="Preview" variant="outline" />}
        showBack
        title={existingListing ? 'Edit Listing' : 'Create Listing'}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <InlineAlert message={error} variant="error" /> : null}
        {categoryError ? <InlineAlert message={categoryError} variant="error" /> : null}

        {!existingListing && allowedTypes.length ? (
          <View style={styles.section}>
            <AppText variant="label" color={colors.textSecondary}>Listing Type</AppText>
            <View style={styles.chips}>
              {TYPE_OPTIONS.filter((opt) => allowedTypes.includes(opt.key)).map((opt) => (
                <AppPressable
                  key={opt.key}
                  onPress={() => {
                    setListingType(opt.key);
                    setForm((prev) => ({ ...prev, categoryId: '', subcategoryId: '' }));
                  }}
                  style={[styles.chip, listingType === opt.key && styles.chipActive]}
                >
                  <AppText variant="caption" color={listingType === opt.key ? colors.inverse : colors.textSecondary}>
                    {opt.label}
                  </AppText>
                </AppPressable>
              ))}
            </View>
          </View>
        ) : existingListing ? (
          <View style={styles.badgeRow}>
            <Badge label={TYPE_OPTIONS.find((t) => t.key === listingType)?.label || listingType} variant="neutral" />
            <Badge label={existingListing.status.replace('_', ' ')} variant="info" />
          </View>
        ) : null}

        {categories.length ? (
          <View style={styles.section}>
            <AppText variant="label" color={colors.textSecondary}>Category</AppText>
            <View style={styles.chips}>
              {categories.map((cat) => (
                <AppPressable
                  key={cat.id}
                  onPress={() => setForm((prev) => ({ ...prev, categoryId: cat.id, subcategoryId: '' }))}
                  style={[styles.chip, form.categoryId === cat.id && styles.chipActive]}
                >
                  <AppText variant="caption" color={form.categoryId === cat.id ? colors.inverse : colors.textSecondary}>
                    {cat.name}
                  </AppText>
                </AppPressable>
              ))}
            </View>
            {subcategories.length ? (
              <>
                <AppText variant="label" color={colors.textSecondary}>Subcategory</AppText>
                <View style={styles.chips}>
                  {subcategories.map((sub) => (
                    <AppPressable
                      key={sub.id}
                      onPress={() => setField('subcategoryId', sub.id)}
                      style={[styles.chip, form.subcategoryId === sub.id && styles.chipActive]}
                    >
                      <AppText variant="caption" color={form.subcategoryId === sub.id ? colors.inverse : colors.textSecondary}>
                        {sub.name}
                      </AppText>
                    </AppPressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <AppInput label="Title" maxLength={180} onChangeText={(v) => setField('title', v)} value={form.title} />
        <AppInput label="Short summary" maxLength={500} onChangeText={(v) => setField('shortSummary', v)} value={form.shortSummary} />
        <AppInput label="Description" maxLength={10000} multiline onChangeText={(v) => setField('description', v)} value={form.description} />

        {listingType === 'service' ? (
          <>
            <OptionRow
              label="Pricing model"
              onChange={(v) => setField('pricingType', v)}
              options={['fixed', 'hourly', 'per_day', 'starting_from', 'negotiable']}
              value={form.pricingType}
            />
            {form.pricingType !== 'negotiable' ? (
              <AppInput keyboardType="decimal-pad" label="Price" onChangeText={(v) => setField('price', v)} value={form.price} />
            ) : null}
            <OptionRow
              label="Delivery method"
              onChange={(v) => setField('deliveryMethod', v)}
              options={['customer_location', 'provider_location', 'online', 'remote', 'hybrid']}
              value={form.deliveryMethod}
            />
            <AppInput label="Tags (comma-separated)" onChangeText={(v) => setField('tags', v)} value={form.tags} />
          </>
        ) : listingType === 'product' ? (
          <>
            <View style={styles.row}>
              <AppInput keyboardType="decimal-pad" label="Price" onChangeText={(v) => setField('price', v)} value={form.price} />
              <AppInput keyboardType="number-pad" label="Stock quantity" onChangeText={(v) => setField('stockQuantity', v)} value={form.stockQuantity} />
            </View>
            <AppInput label="Delivery info" onChangeText={(v) => setField('deliveryInfo', v)} value={form.deliveryInfo} />
          </>
        ) : listingType === 'job' ? (
          <>
            <OptionRow
              label="Employment type"
              onChange={(v) => setField('employmentType', v)}
              options={['full-time', 'part-time', 'contract', 'temporary', 'internship']}
              value={form.employmentType}
            />
            <OptionRow
              label="Work mode"
              onChange={(v) => setField('workMode', v)}
              options={['on-site', 'remote', 'hybrid']}
              value={form.workMode}
            />
            <View style={styles.row}>
              <AppInput keyboardType="decimal-pad" label="Salary min" onChangeText={(v) => setField('salaryMin', v)} value={form.salaryMin} />
              <AppInput keyboardType="decimal-pad" label="Salary max" onChangeText={(v) => setField('salaryMax', v)} value={form.salaryMax} />
            </View>
            <AppInput label="Skills (comma-separated)" onChangeText={(v) => setField('skills', v)} value={form.skills} />
            <AppInput label="Deadline (YYYY-MM-DD)" onChangeText={(v) => setField('deadline', v)} value={form.deadline} />
          </>
        ) : listingType === 'freelance_project' ? (
          <>
            <AppInput keyboardType="decimal-pad" label="Budget" onChangeText={(v) => setField('budget', v)} value={form.budget} />
            <OptionRow
              label="Work mode"
              onChange={(v) => setField('workMode', v)}
              options={['remote', 'on-site', 'hybrid']}
              value={form.workMode}
            />
            <AppInput label="Required skills (comma-separated)" onChangeText={(v) => setField('skills', v)} value={form.skills} />
            <AppInput label="Deliverables" multiline onChangeText={(v) => setField('deliverables', v)} value={form.deliverables} />
            <AppInput label="Deadline (YYYY-MM-DD)" onChangeText={(v) => setField('deadline', v)} value={form.deadline} />
          </>
        ) : null}

        <View style={styles.row}>
          <AppInput label="City / Location" onChangeText={(v) => setField('city', v)} value={form.city} />
          <AppInput label="State" onChangeText={(v) => setField('state', v)} value={form.state} />
        </View>

        <OptionRow
          label="Visibility"
          onChange={(v) => setField('visibility', v)}
          options={['public', 'unlisted', 'private']}
          value={form.visibility}
        />

        <View style={styles.section}>
          <AppText variant="label" color={colors.textSecondary}>Media & Attachments</AppText>
          <View style={styles.chips}>
            <AppButton disabled={uploadingMedia} icon="image-plus" onPress={() => handlePickMedia('image')} size="sm" title="Add image" variant="secondary" />
            <AppButton disabled={uploadingMedia} icon="video-plus-outline" onPress={() => handlePickMedia('video')} size="sm" title="Add video" variant="outline" />
            <AppButton disabled={uploadingMedia} icon="file-plus-outline" onPress={() => handlePickMedia('document')} size="sm" title="Private doc" variant="outline" />
          </View>

          {attachedMedia.map((media, index) => (
            <View key={media.id} style={styles.mediaRow}>
              {media.mediaType === 'image' && media.url ? (
                <Image source={{ uri: media.url }} style={styles.mediaThumb} />
              ) : (
                <AppIcon name={media.mediaType === 'video' ? 'video-outline' : 'file-lock-outline'} size={24} color={colors.primary} />
              )}
              <View style={styles.flex}>
                <AppText variant="caption" color={colors.text}>
                  {media.mediaType} · {media.visibility}{media.isCover ? ' · Cover' : ''}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {media.mimeType} · {media.fileSize ? `${Math.round(media.fileSize / 1024)} KB` : ''}
                </AppText>
              </View>
              {media.mediaType === 'image' && !media.isCover && media.visibility === 'public' ? (
                <AppButton onPress={() => setCoverAttached(media)} size="sm" title="Cover" variant="ghost" />
              ) : null}
              <AppButton onPress={() => moveAttachedMedia(index, -1)} size="sm" title="↑" variant="ghost" />
              <AppButton onPress={() => moveAttachedMedia(index, 1)} size="sm" title="↓" variant="ghost" />
              <AppButton onPress={() => removeAttachedMedia(media)} size="sm" title="Remove" variant="ghost" />
            </View>
          ))}

          {pendingMedia.map((item, index) => (
            <View key={item.mediaAssetId} style={styles.mediaRow}>
              {item.mediaType === 'image' && item.previewUri ? (
                <Image source={{ uri: item.previewUri }} style={styles.mediaThumb} />
              ) : (
                <AppIcon name="file-outline" size={24} color={colors.primary} />
              )}
              <View style={styles.flex}>
                <AppInput
                  label="Alt text"
                  onChangeText={(textVal) => setPendingMedia((prev) => prev.map((m, i) => i === index ? { ...m, altText: textVal } : m))}
                  placeholder="Describe this image"
                  value={item.altText}
                />
              </View>
              <AppButton onPress={() => removePendingMedia(item)} size="sm" title="Remove" variant="ghost" />
            </View>
          ))}
        </View>

        <View style={styles.actionBar}>
          <AppButton
            disabled={saving}
            loading={saving}
            onPress={() => handleSave('draft')}
            style={styles.flex}
            title="Save draft"
            variant="secondary"
          />
          {mustReview ? (
            <AppButton
              disabled={saving}
              loading={saving}
              onPress={() => handleSave('submit_review')}
              style={styles.flex}
              title="Submit for review"
              variant="cta"
            />
          ) : (
            <AppButton
              disabled={saving}
              loading={saving}
              onPress={() => handleSave('publish')}
              style={styles.flex}
              title={existingListing?.status === 'published' ? 'Save changes' : 'Publish'}
              variant="cta"
            />
          )}
        </View>

        {existingListing && existingListing.status === 'published' ? (
          <AppButton
            disabled={saving}
            onPress={async () => {
              await pauseListingRequest(session, existingListing.id);
              router.replace('/my-listings');
            }}
            title="Pause listing"
            variant="outline"
          />
        ) : existingListing && existingListing.status === 'paused' ? (
          <AppButton
            disabled={saving}
            onPress={async () => {
              await resumeListingRequest(session, existingListing.id);
              router.replace('/my-listings');
            }}
            title="Resume listing"
            variant="outline"
          />
        ) : null}
      </ScrollView>

      <AppModal
        actions={<AppButton onPress={() => setPreviewData(null)} title="Back to editing" variant="secondary" />}
        onClose={() => setPreviewData(null)}
        title="Customer Preview"
        visible={Boolean(previewData)}
      >
        <ScrollView style={styles.modalScroll}>
          <ListingPreviewContent isPreview listing={previewData} />
        </ScrollView>
      </AppModal>
    </SafeAreaView>
  );
}

function OptionRow({ label, options, value, onChange }) {
  return (
    <View style={styles.section}>
      <AppText variant="label" color={colors.textSecondary}>{label}</AppText>
      <View style={styles.chips}>
        {options.map((opt) => (
          <AppPressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, value === opt && styles.chipActive]}
          >
            <AppText variant="caption" color={value === opt ? colors.inverse : colors.textSecondary}>
              {opt.replace(/_/g, ' ')}
            </AppText>
          </AppPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  section: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  row: { flexDirection: 'row', gap: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: spacing.xs },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  mediaThumb: { width: 48, height: 48, borderRadius: radii.sm },
  actionBar: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalScroll: { maxHeight: 460 },
});
