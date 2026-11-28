import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppIcon,
  AppInput,
  AppModal,
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  useToast,
} from '../components/ui';
import {
  createShopLocationRequest,
  deleteShopLocationRequest,
  getBusinessShopRequest,
  updateBusinessShopRequest,
  updateShopLocationRequest,
} from '../services/marketplace/marketplaceService';
import { uploadBusinessShopMediaRequest } from '../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../theme/tokens';

const EMPTY_LOCATION = {
  id: null,
  label: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  pinCode: '',
  phone: '',
  operatingHours: '09:00 AM - 08:00 PM',
  pickupEnabled: true,
  deliveryEnabled: true,
  isPrimary: false,
  isActive: true,
};

export default function BusinessShopScreen() {
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(null);
  const [error, setError] = useState(null);
  const [shopStats, setShopStats] = useState(null);
  const [locations, setLocations] = useState([]);

  const [form, setForm] = useState({
    businessName: '',
    logoMediaId: null,
    logoUrl: null,
    logoPreviewUri: null,
    coverMediaId: null,
    coverUrl: null,
    coverPreviewUri: null,
    storeDisplayName: '',
    storeCategory: '',
    description: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    pinCode: '',
    businessEmail: '',
    businessPhone: '',
    website: '',
    operatingHours: '',
    pickupEnabled: true,
    deliveryEnabled: true,
    shippingNotes: '',
    returnPolicyDefault: '',
    warrantyDefault: '',
    publicVisibility: true,
  });

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION);

  const applyShopData = useCallback((data) => {
    const s = data?.shop || {};
    setForm({
      businessName: s.businessName || '',
      logoMediaId: s.logoMediaId || null,
      logoUrl: s.logoUrl || null,
      logoPreviewUri: null,
      coverMediaId: s.coverMediaId || null,
      coverUrl: s.coverUrl || null,
      coverPreviewUri: null,
      storeDisplayName: s.storeDisplayName || s.businessName || '',
      storeCategory: s.storeCategory || '',
      description: s.description || '',
      address: s.address || '',
      city: s.city || '',
      state: s.state || '',
      country: s.country || 'India',
      pinCode: s.pinCode || '',
      businessEmail: s.businessEmail || '',
      businessPhone: s.businessPhone || '',
      website: s.website || '',
      operatingHours: s.operatingHours || '',
      pickupEnabled: s.pickupEnabled !== false,
      deliveryEnabled: s.deliveryEnabled !== false,
      shippingNotes: s.shippingNotes || '',
      returnPolicyDefault: s.returnPolicyDefault || '',
      warrantyDefault: s.warrantyDefault || '',
      publicVisibility: s.publicVisibility !== false,
    });
    setLocations(data?.locations || []);
    setShopStats(data?.productStats || null);
  }, []);

  const loadShop = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getBusinessShopRequest(session);
      applyShopData(data);
    } catch (err) {
      setError(err?.message || 'Could not load business shop profile.');
    } finally {
      setLoading(false);
    }
  }, [applyShopData, session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    getBusinessShopRequest(session)
      .then((data) => {
        if (!active) return;
        applyShopData(data);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load business shop profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyShopData, session]);

  const handleSaveShop = async () => {
    if (!form.storeDisplayName.trim()) {
      setError('Store display name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { logoUrl, logoPreviewUri, coverUrl, coverPreviewUri, ...shopPayload } = form;
      const updated = await updateBusinessShopRequest(session, shopPayload);
      applyShopData(updated);
      setForm((previous) => ({
        ...previous,
        logoPreviewUri: updated?.shop?.logoUrl ? null : logoPreviewUri,
        coverPreviewUri: updated?.shop?.coverUrl ? null : coverPreviewUri,
      }));
      showToast('Shop profile updated.', 'success');
    } catch (err) {
      setError(err?.message || 'Could not save shop settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickShopImage = async (mediaType) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo library access to upload a store image.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: mediaType === 'logo' ? [1, 1] : [16, 9],
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      setUploadingMedia(mediaType);
      setError(null);
      const uploaded = await uploadBusinessShopMediaRequest(session, picked.assets[0], mediaType);
      setForm((previous) => ({
        ...previous,
        ...(mediaType === 'logo'
          ? { logoMediaId: uploaded.id, logoPreviewUri: picked.assets[0].uri }
          : { coverMediaId: uploaded.id, coverPreviewUri: picked.assets[0].uri }),
      }));
    } catch (err) {
      setError(err?.message || 'Could not upload the store image.');
    } finally {
      setUploadingMedia(null);
    }
  };

  const openNewLocation = () => {
    setLocationForm({
      ...EMPTY_LOCATION,
      city: form.city || '',
      state: form.state || '',
      country: form.country || 'India',
      isPrimary: locations.length === 0,
    });
    setLocationModalOpen(true);
  };

  const openEditLocation = (loc) => {
    setLocationForm({
      id: loc.id,
      label: loc.label || '',
      address: loc.address || '',
      city: loc.city || '',
      state: loc.state || '',
      country: loc.country || 'India',
      pinCode: loc.pinCode || '',
      phone: loc.phone || '',
      operatingHours: loc.operatingHours || '',
      pickupEnabled: loc.pickupEnabled !== false,
      deliveryEnabled: loc.deliveryEnabled !== false,
      isPrimary: Boolean(loc.isPrimary),
      isActive: loc.isActive !== false,
    });
    setLocationModalOpen(true);
  };

  const handleSaveLocation = async () => {
    if (!locationForm.label.trim() || !locationForm.address.trim() || !locationForm.city.trim()) {
      Alert.alert('Missing details', 'Location label, street address, and city are required.');
      return;
    }
    setLocationSaving(true);
    try {
      const response = locationForm.id
        ? await updateShopLocationRequest(session, locationForm.id, locationForm)
        : await createShopLocationRequest(session, locationForm);
      setLocations(response.locations || []);
      setLocationModalOpen(false);
      showToast(locationForm.id ? 'Branch location updated.' : 'Shop location added.', 'success');
    } catch (err) {
      Alert.alert('Could not save location', err?.message || 'Please check your location fields.');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleDeleteLocation = (loc) => {
    Alert.alert(
      'Remove shop location',
      `Delete "${loc.label}"? Products linked to it will remain in your catalogue without a branch link.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteShopLocationRequest(session, loc.id);
              setLocations(res.locations || []);
              showToast('Shop location removed.', 'success');
            } catch (err) {
              Alert.alert('Error', err?.message || 'Could not remove location.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle="Store identity, fulfilment & locations"
        title="Shop & Storefront"
        rightAction={{
          icon: 'package-variant-closed',
          onPress: () => router.push('/manage-products'),
        }}
      />

      {loading ? (
        <LoadingState message="Loading your shop profile..." />
      ) : error && !form.businessName && !form.storeDisplayName ? (
        <ErrorState message={error} onRetry={loadShop} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {error ? <InlineAlert message={error} variant="error" /> : null}

          {shopStats ? (
            <View style={styles.statsCard}>
              <View style={styles.statsHeader}>
                <AppText variant="h4" color={colors.text}>
                  Product Catalogue Overview
                </AppText>
                <AppButton
                  onPress={() => router.push('/manage-products')}
                  size="sm"
                  title="Manage Products"
                />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <AppText variant="h3" color={colors.primary}>{shopStats.published}</AppText>
                  <AppText variant="caption" color={colors.muted}>Published</AppText>
                </View>
                <View style={styles.statBox}>
                  <AppText variant="h3" color={colors.text}>{shopStats.draft}</AppText>
                  <AppText variant="caption" color={colors.muted}>Drafts</AppText>
                </View>
                <View style={styles.statBox}>
                  <AppText variant="h3" color={colors.warning || colors.text}>{shopStats.lowStock}</AppText>
                  <AppText variant="caption" color={colors.muted}>Low Stock</AppText>
                </View>
                <View style={styles.statBox}>
                  <AppText variant="h3" color={colors.danger || colors.text}>{shopStats.outOfStock}</AppText>
                  <AppText variant="caption" color={colors.muted}>Out of Stock</AppText>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <AppText variant="h4" color={colors.text}>Store Profile</AppText>
            <AppText variant="label" color={colors.text}>Storefront images</AppText>
            <View style={styles.storeCover}>
              {form.coverPreviewUri || form.coverUrl ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: form.coverPreviewUri || form.coverUrl }}
                  style={styles.coverImage}
                />
              ) : (
                <View style={[styles.coverImage, styles.imagePlaceholder]}>
                  <AppIcon color={colors.muted} name="image-outline" size={24} />
                  <AppText variant="caption" color={colors.muted}>No cover image</AppText>
                </View>
              )}
              <AppButton
                loading={uploadingMedia === 'cover'}
                onPress={() => handlePickShopImage('cover')}
                size="sm"
                title="Upload Cover"
                variant="outline"
              />
            </View>
            <View style={styles.logoRow}>
              {form.logoPreviewUri || form.logoUrl ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: form.logoPreviewUri || form.logoUrl }}
                  style={styles.logoImage}
                />
              ) : (
                <View style={[styles.logoImage, styles.imagePlaceholder]}>
                  <AppIcon color={colors.muted} name="storefront-outline" size={22} />
                </View>
              )}
              <View style={styles.logoCopy}>
                <AppText variant="caption" color={colors.muted}>
                  Use your business logo to help customers recognize your shop.
                </AppText>
                <AppButton
                  loading={uploadingMedia === 'logo'}
                  onPress={() => handlePickShopImage('logo')}
                  size="sm"
                  title="Upload Logo"
                  variant="outline"
                />
              </View>
            </View>
            <AppInput
              label="Store Display Name"
              onChangeText={(v) => setForm((p) => ({ ...p, storeDisplayName: v }))}
              placeholder="e.g. Urban Threads Flagship Store"
              value={form.storeDisplayName}
            />
            <AppInput
              label="Store Category / Specialty"
              onChangeText={(v) => setForm((p) => ({ ...p, storeCategory: v }))}
              placeholder="e.g. Fashion & Apparel, Electronics"
              value={form.storeCategory}
            />
            <AppInput
              label="Shop Description"
              multiline
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              placeholder="Tell customers about your store and products..."
              value={form.description}
            />
            <AppInput
              label="Operating Hours"
              onChangeText={(v) => setForm((p) => ({ ...p, operatingHours: v }))}
              placeholder="Mon-Sat 10:00 AM - 08:30 PM"
              value={form.operatingHours}
            />

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText variant="label" color={colors.text}>Public Storefront Visibility</AppText>
                <AppText variant="caption" color={colors.muted}>
                  Turn off to temporarily hide your shop and products from public discovery.
                </AppText>
              </View>
              <Switch
                onValueChange={(v) => setForm((p) => ({ ...p, publicVisibility: v }))}
                value={form.publicVisibility}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText variant="label" color={colors.text}>In-Store Pickup Available</AppText>
                <AppText variant="caption" color={colors.muted}>
                  Allow customers to enquire for local store pickup.
                </AppText>
              </View>
              <Switch
                onValueChange={(v) => setForm((p) => ({ ...p, pickupEnabled: v }))}
                value={form.pickupEnabled}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText variant="label" color={colors.text}>Local Delivery / Shipping</AppText>
                <AppText variant="caption" color={colors.muted}>
                  Offer courier shipping or local drop-off.
                </AppText>
              </View>
              <Switch
                onValueChange={(v) => setForm((p) => ({ ...p, deliveryEnabled: v }))}
                value={form.deliveryEnabled}
              />
            </View>
          </View>

          <View style={styles.card}>
            <AppText variant="h4" color={colors.text}>Contact & Primary Address</AppText>
            <AppInput
              label="Primary Address"
              onChangeText={(v) => setForm((p) => ({ ...p, address: v }))}
              placeholder="Building, street, landmark"
              value={form.address}
            />
            <View style={styles.twoCol}>
              <AppInput
                containerStyle={styles.flexField}
                label="City"
                onChangeText={(v) => setForm((p) => ({ ...p, city: v }))}
                value={form.city}
              />
              <AppInput
                containerStyle={styles.flexField}
                label="State"
                onChangeText={(v) => setForm((p) => ({ ...p, state: v }))}
                value={form.state}
              />
            </View>
            <View style={styles.twoCol}>
              <AppInput
                containerStyle={styles.flexField}
                label="PIN / Postal Code"
                onChangeText={(v) => setForm((p) => ({ ...p, pinCode: v }))}
                value={form.pinCode}
              />
              <AppInput
                containerStyle={styles.flexField}
                keyboardType="phone-pad"
                label="Shop Phone"
                onChangeText={(v) => setForm((p) => ({ ...p, businessPhone: v }))}
                value={form.businessPhone}
              />
            </View>
            <AppInput
              keyboardType="email-address"
              label="Shop Contact Email"
              onChangeText={(v) => setForm((p) => ({ ...p, businessEmail: v }))}
              value={form.businessEmail}
            />
            <AppInput
              label="Default Delivery / Shipping Notes"
              multiline
              onChangeText={(v) => setForm((p) => ({ ...p, shippingNotes: v }))}
              placeholder="Dispatch timeframes, local pickup instructions..."
              value={form.shippingNotes}
            />
            <AppInput
              label="Default Return Policy"
              multiline
              onChangeText={(v) => setForm((p) => ({ ...p, returnPolicyDefault: v }))}
              placeholder="e.g. 7-day exchange on unworn items with original tags"
              value={form.returnPolicyDefault}
            />
            <AppInput
              label="Default Warranty Info"
              multiline
              onChangeText={(v) => setForm((p) => ({ ...p, warrantyDefault: v }))}
              placeholder="e.g. 1-year brand warranty where applicable"
              value={form.warrantyDefault}
            />
            <AppButton loading={saving} onPress={handleSaveShop} title="Save Shop Settings" />
          </View>

          <View style={styles.card}>
            <View style={styles.statsHeader}>
              <AppText variant="h4" color={colors.text}>Shop Locations & Branches</AppText>
              <AppButton icon="plus" onPress={openNewLocation} size="sm" title="Add Location" variant="secondary" />
            </View>
            {!locations.length ? (
              <EmptyState
                icon="map-marker-plus-outline"
                message="Add one or more storefront/warehouse branches for pickup and local product availability."
                title="No extra branch locations"
              />
            ) : (
              locations.map((loc) => (
                <View key={loc.id} style={styles.locationCard}>
                  <View style={styles.locationHead}>
                    <View style={styles.locationTitleWrap}>
                      <AppIcon name="map-marker-outline" size={18} color={colors.primary} />
                      <AppText variant="label" color={colors.text}>{loc.label}</AppText>
                    </View>
                    <View style={styles.badgeRow}>
                      {loc.isPrimary ? <Badge label="Primary" variant="success" /> : null}
                      {!loc.isActive ? <Badge label="Inactive" variant="neutral" /> : null}
                    </View>
                  </View>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {[loc.address, loc.city, loc.state, loc.pinCode].filter(Boolean).join(', ')}
                  </AppText>
                  {loc.operatingHours ? (
                    <AppText variant="caption" color={colors.muted}>Hours: {loc.operatingHours}</AppText>
                  ) : null}
                  <View style={styles.badgeRow}>
                    {loc.pickupEnabled ? <Badge label="Pickup" variant="neutral" /> : null}
                    {loc.deliveryEnabled ? <Badge label="Delivery" variant="neutral" /> : null}
                  </View>
                  <View style={styles.locationActions}>
                    <AppButton onPress={() => openEditLocation(loc)} size="sm" title="Edit" variant="outline" />
                    <AppButton onPress={() => handleDeleteLocation(loc)} size="sm" title="Delete" variant="ghost" />
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <AppModal
        onClose={() => setLocationModalOpen(false)}
        title={locationForm.id ? 'Edit Shop Location' : 'Add Shop Location'}
        visible={locationModalOpen}
      >
        <ScrollView contentContainerStyle={styles.modalStack}>
          <AppInput
            label="Branch Label *"
            onChangeText={(v) => setLocationForm((p) => ({ ...p, label: v }))}
            placeholder="e.g. Indiranagar Flagship"
            value={locationForm.label}
          />
          <AppInput
            label="Street Address *"
            onChangeText={(v) => setLocationForm((p) => ({ ...p, address: v }))}
            value={locationForm.address}
          />
          <View style={styles.twoCol}>
            <AppInput
              containerStyle={styles.flexField}
              label="City *"
              onChangeText={(v) => setLocationForm((p) => ({ ...p, city: v }))}
              value={locationForm.city}
            />
            <AppInput
              containerStyle={styles.flexField}
              label="State"
              onChangeText={(v) => setLocationForm((p) => ({ ...p, state: v }))}
              value={locationForm.state}
            />
          </View>
          <View style={styles.twoCol}>
            <AppInput
              containerStyle={styles.flexField}
              label="PIN Code"
              onChangeText={(v) => setLocationForm((p) => ({ ...p, pinCode: v }))}
              value={locationForm.pinCode}
            />
            <AppInput
              containerStyle={styles.flexField}
              keyboardType="phone-pad"
              label="Phone"
              onChangeText={(v) => setLocationForm((p) => ({ ...p, phone: v }))}
              value={locationForm.phone}
            />
          </View>
          <AppInput
            label="Operating Hours"
            onChangeText={(v) => setLocationForm((p) => ({ ...p, operatingHours: v }))}
            value={locationForm.operatingHours}
          />
          <View style={styles.switchRow}>
            <AppText variant="label" color={colors.text}>Primary Location</AppText>
            <Switch
              onValueChange={(v) => setLocationForm((p) => ({ ...p, isPrimary: v }))}
              value={locationForm.isPrimary}
            />
          </View>
          <View style={styles.switchRow}>
            <AppText variant="label" color={colors.text}>Store Pickup Enabled</AppText>
            <Switch
              onValueChange={(v) => setLocationForm((p) => ({ ...p, pickupEnabled: v }))}
              value={locationForm.pickupEnabled}
            />
          </View>
          <View style={styles.switchRow}>
            <AppText variant="label" color={colors.text}>Local Delivery Enabled</AppText>
            <Switch
              onValueChange={(v) => setLocationForm((p) => ({ ...p, deliveryEnabled: v }))}
              value={locationForm.deliveryEnabled}
            />
          </View>
          <AppButton loading={locationSaving} onPress={handleSaveLocation} title="Save Location" />
        </ScrollView>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  storeCover: { gap: spacing.xs },
  coverImage: {
    width: '100%',
    height: 150,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoImage: {
    width: 76,
    height: 76,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  logoCopy: { flex: 1, gap: spacing.xs },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  switchCopy: { flex: 1, gap: 2 },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  flexField: { flex: 1 },
  locationCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 6,
  },
  locationHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  locationActions: { flexDirection: 'row', gap: spacing.xs, marginTop: 4 },
  modalStack: { gap: spacing.sm, paddingBottom: spacing.md },
});
