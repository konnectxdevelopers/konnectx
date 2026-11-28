import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppInput,
  AppPressable,
  AppText,
  InlineAlert,
  LoadingState,
} from '../components/ui';
import {
  archiveListingRequest,
  createJobRequest,
  createPortfolioItemRequest,
  createProductRequest,
  createProjectRequest,
  getBusinessCategoriesRequest,
  getMarketplaceCategoryTreeRequest,
  getMyMarketplaceListingsRequest,
  getMyPortfolioRequest,
  getMySkillsRequest,
  pauseListingRequest,
  publishListingRequest,
  saveMySkillsRequest,
  updateBusinessCategoriesRequest,
} from '../services/marketplace/marketplaceService';
import {
  uploadPortfolioMediaRequest,
  uploadProductImageRequest,
  uploadProjectAttachmentRequest,
} from '../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../theme/tokens';

const SECTION_FOR_TYPE = {
  product: 'product',
  job: 'job',
  project: 'project',
  portfolio: 'professional',
  business: 'business',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  price: '',
  stockQuantity: '',
  currency: 'INR',
  deliveryInfo: '',
  variants: '',
  employmentType: 'full-time',
  workMode: 'on-site',
  location: '',
  salaryMin: '',
  salaryMax: '',
  experienceRequired: '',
  educationRequired: '',
  deadline: '',
  skills: '',
  budget: '',
  deliverables: '',
  projectUrl: '',
};

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function MarketplaceManageScreen() {
  const params = useLocalSearchParams();
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  const role = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeType = SECTION_FOR_TYPE[type] ? type : 'product';
  const accountRole = role || (activeType === 'product' || activeType === 'business'
    ? 'business'
    : activeType === 'portfolio' ? 'professional' : 'hiring');
  const { session } = useAuth();
  const [tree, setTree] = useState([]);
  const [mainCategoryId, setMainCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [selectedBusinessCategories, setSelectedBusinessCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [productImages, setProductImages] = useState([]);
  const [projectAttachments, setProjectAttachments] = useState([]);
  const [portfolioImage, setPortfolioImage] = useState(null);
  const [listings, setListings] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [savedSkills, setSavedSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState(null);

  const section = SECTION_FOR_TYPE[activeType];
  const root = useMemo(() => tree.find((item) => item.listingType === section), [section, tree]);
  const mainCategories = root?.children || [];
  const selectedMainCategory = mainCategories.find((item) => item.id === mainCategoryId);
  const subcategories = selectedMainCategory?.children || [];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeResponse] = await Promise.all([
        getMarketplaceCategoryTreeRequest(section),
      ]);
      const categories = treeResponse.categories || [];
      setTree(categories);
      const sectionRoot = categories.find((item) => item.listingType === section);
      if (sectionRoot?.children?.length) {
        setMainCategoryId((current) =>
          sectionRoot.children.some((item) => item.id === current)
            ? current
            : sectionRoot.children[0].id
        );
      }

      if (activeType === 'business') {
        const response = await getBusinessCategoriesRequest(session);
        setSelectedBusinessCategories((response.categories || []).map((item) => item.id));
      } else if (activeType === 'portfolio') {
        const [portfolioResponse, skillResponse] = await Promise.all([
          getMyPortfolioRequest(session),
          getMySkillsRequest(session),
        ]);
        setPortfolio(portfolioResponse.portfolio || []);
        setSavedSkills(skillResponse.skills || []);
      } else {
        const response = await getMyMarketplaceListingsRequest(session, activeType);
        setListings(response.listings || []);
      }
    } catch (requestError) {
      setError(requestError?.message || 'Could not load marketplace management data.');
    } finally {
      setLoading(false);
    }
  }, [activeType, section, session]);

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, [loadData]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const pickImages = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Allow photo library access to choose product images.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]) {
        setProductImages((current) => [...current, result.assets[0]].slice(0, 8));
      }
    } catch (pickerError) {
      setError(pickerError?.message || 'Could not open the image library.');
    }
  };

  const pickPortfolioImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Allow photo library access to choose portfolio media.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]) setPortfolioImage(result.assets[0]);
    } catch (pickerError) {
      setError(pickerError?.message || 'Could not open the image library.');
    }
  };

  const pickProjectAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (!result.canceled && result.assets?.length) {
        setProjectAttachments((current) => [...current, ...result.assets].slice(0, 10));
      }
    } catch (pickerError) {
      setError(pickerError?.message || 'Could not open the document picker.');
    }
  };

  const saveBusinessCategories = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateBusinessCategoriesRequest(session, selectedBusinessCategories);
      Alert.alert('Shop categories saved', 'Your business categories have been updated.');
    } catch (saveError) {
      setError(saveError?.message || 'Could not save shop categories.');
    } finally {
      setSaving(false);
    }
  };

  const savePortfolioSkills = async () => {
    setSaving(true);
    setError(null);
    try {
      const skills = splitList(form.skills).map((skill) => ({
        skill,
        categoryId: mainCategoryId || null,
      }));
      const response = await saveMySkillsRequest(session, skills);
      setSavedSkills(response.skills || []);
      setForm((current) => ({ ...current, skills: '' }));
    } catch (saveError) {
      setError(saveError?.message || 'Could not save professional skills.');
    } finally {
      setSaving(false);
    }
  };

  const saveListing = async (status) => {
    setSaving(true);
    setError(null);
    try {
      if (activeType === 'product') {
        if (!mainCategoryId || !form.title.trim() || !form.description.trim() ||
            !form.price.trim() || !Number.isFinite(Number(form.price)) || Number(form.price) <= 0) {
          throw new Error('Choose a product category and enter a name, description, and valid price.');
        }
        const mediaAssets = await Promise.all(
          productImages.map((source) => uploadProductImageRequest(session, source))
        );
        const product = await createProductRequest(session, {
          categoryId: mainCategoryId,
          subcategoryId: subcategoryId || null,
          name: form.title.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          currency: form.currency.trim().toUpperCase() || 'INR',
          stockQuantity: Number(form.stockQuantity || 0),
          variants: form.variants.trim() ? JSON.parse(form.variants) : {},
          deliveryInfo: form.deliveryInfo.trim() || null,
          mediaAssetIds: mediaAssets.map((asset) => asset.id),
          status,
        });
        setListings((current) => [product.product, ...current]);
      } else if (activeType === 'job') {
        if (!mainCategoryId || !form.title.trim() || !form.description.trim()) {
          throw new Error('Choose a job category and enter a title and description.');
        }
        const job = await createJobRequest(session, {
          categoryId: mainCategoryId,
          title: form.title.trim(),
          description: form.description.trim(),
          employmentType: form.employmentType,
          workMode: form.workMode,
          location: form.location.trim() || null,
          salaryMin: form.salaryMin.trim() || null,
          salaryMax: form.salaryMax.trim() || null,
          experienceRequired: form.experienceRequired.trim() || null,
          educationRequired: form.educationRequired.trim() || null,
          skills: splitList(form.skills),
          deadline: form.deadline.trim() || null,
          status,
        });
        setListings((current) => [job.job, ...current]);
      } else if (activeType === 'project') {
        if (!mainCategoryId || !form.title.trim() || !form.description.trim()) {
          throw new Error('Choose a project category and enter a title and project scope.');
        }
        const attachments = await Promise.all(
          projectAttachments.map((source) => uploadProjectAttachmentRequest(session, source, accountRole))
        );
        const project = await createProjectRequest(session, {
          categoryId: mainCategoryId,
          title: form.title.trim(),
          description: form.description.trim(),
          requiredSkills: splitList(form.skills),
          budget: form.budget.trim() || null,
          deadline: form.deadline.trim() || null,
          deliverables: form.deliverables.trim() || null,
          workMode: form.workMode,
          location: form.location.trim() || null,
          attachmentAssetIds: attachments.map((asset) => asset.id),
          status,
        });
        setListings((current) => [project.project, ...current]);
      } else if (activeType === 'portfolio') {
        if (!form.title.trim()) throw new Error('Enter a portfolio project title.');
        const media = portfolioImage
          ? await uploadPortfolioMediaRequest(session, portfolioImage)
          : null;
        const item = await createPortfolioItemRequest(session, {
          categoryId: mainCategoryId || null,
          title: form.title.trim(),
          description: form.description.trim() || null,
          projectUrl: form.projectUrl.trim() || null,
          mediaAssetId: media?.id || null,
          status,
        });
        setPortfolio((current) => [item.portfolioItem, ...current]);
      }
      setForm(EMPTY_FORM);
      setProductImages([]);
      setProjectAttachments([]);
      setPortfolioImage(null);
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this listing.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item) => {
    const transition = item.status === 'published' ? pauseListingRequest : publishListingRequest;
    const status = item.status === 'published' ? 'paused' : 'published';
    setError(null);
    try {
      await transition(session, item.id);
      setListings((current) => current.map((entry) => entry.id === item.id ? { ...entry, status } : entry));
    } catch (statusError) {
      setError(statusError?.message || 'Could not update listing status.');
    }
  };

  const archiveItem = (item) => {
    const listingType = activeType === 'product' ? 'products'
      : activeType === 'job' ? 'jobs'
        : activeType === 'project' ? 'projects' : null;
    if (!listingType) return;
    Alert.alert('Archive listing?', 'It will be removed from customer discovery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveListingRequest(session, item.id);
            setListings((current) => current.filter((entry) => entry.id !== item.id));
          } catch (archiveError) {
            setError(archiveError?.message || 'Could not archive this listing.');
          }
        },
      },
    ]);
  };

  const toggleBusinessCategory = (categoryId) => {
    setSelectedBusinessCategories((current) => current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]);
  };

  const renderCategoryOptions = () => (
    <View style={styles.block}>
      <AppText variant="label" color={colors.text}>Category</AppText>
      <View style={styles.chips}>
        {mainCategories.map((item) => (
          <AppPressable
            key={item.id}
            onPress={() => {
              setMainCategoryId(item.id);
              setSubcategoryId('');
            }}
            style={[styles.chip, mainCategoryId === item.id && styles.chipActive]}
          >
            <AppText variant="caption" color={mainCategoryId === item.id ? colors.inverse : colors.textSecondary}>
              {item.name}
            </AppText>
          </AppPressable>
        ))}
      </View>
      {subcategories.length ? (
        <View style={styles.chips}>
          <AppPressable
            onPress={() => setSubcategoryId('')}
            style={[styles.chip, !subcategoryId && styles.chipActive]}
          >
            <AppText variant="caption" color={!subcategoryId ? colors.inverse : colors.textSecondary}>
              All {selectedMainCategory?.name}
            </AppText>
          </AppPressable>
          {subcategories.map((item) => (
            <AppPressable
              key={item.id}
              onPress={() => setSubcategoryId(item.id)}
              style={[styles.chip, subcategoryId === item.id && styles.chipActive]}
            >
              <AppText variant="caption" color={subcategoryId === item.id ? colors.inverse : colors.textSecondary}>
                {item.name}
              </AppText>
            </AppPressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const listingTitle = activeType === 'product' ? 'Shopping & Products'
    : activeType === 'job' ? 'Jobs & Employment'
      : activeType === 'project' ? 'Freelance Projects'
        : activeType === 'portfolio' ? 'Professional Portfolio'
          : 'Business Categories';

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle={`${accountRole[0].toUpperCase()}${accountRole.slice(1)} account`}
        title={listingTitle}
      />
      {loading ? <LoadingState message="Loading marketplace tools..." /> : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? <InlineAlert message={error} variant="error" /> : null}
          {activeType === 'business' ? (
            <>
              <AppText variant="body" color={colors.muted}>
                Select the categories customers should use to find your shop.
              </AppText>
              <View style={styles.chips}>
                {mainCategories.map((item) => {
                  const selected = selectedBusinessCategories.includes(item.id);
                  return (
                    <AppPressable
                      key={item.id}
                      onPress={() => toggleBusinessCategory(item.id)}
                      style={[styles.chip, selected && styles.chipActive]}
                    >
                      <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                        {item.name}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </View>
              <AppButton loading={saving} onPress={saveBusinessCategories} title="Save shop categories" />
              <AppButton
                onPress={() => router.push('/role-profile/business')}
                title="Edit shop profile & hours"
                variant="outline"
              />
            </>
          ) : activeType === 'portfolio' ? (
            <>
              <AppText variant="title" color={colors.text}>Skills</AppText>
              <AppInput
                label="Skills, separated by commas"
                onChangeText={(value) => setField('skills', value)}
                placeholder="React Native, UI/UX design, photography"
                value={form.skills}
              />
              {renderCategoryOptions()}
              <AppButton loading={saving} onPress={savePortfolioSkills} title="Save skills" variant="secondary" />
              {savedSkills.length ? (
                <AppText variant="caption" color={colors.muted}>
                  Current skills: {savedSkills.map((item) => item.skill).join(', ')}
                </AppText>
              ) : null}
              <AppText variant="title" color={colors.text}>Add portfolio project</AppText>
              <AppInput label="Project title" onChangeText={(value) => setField('title', value)} value={form.title} />
              <AppInput label="Description" multiline onChangeText={(value) => setField('description', value)} value={form.description} />
              <AppInput label="Project link" autoCapitalize="none" onChangeText={(value) => setField('projectUrl', value)} value={form.projectUrl} />
              <AppButton onPress={pickPortfolioImage} title={portfolioImage ? 'Change project image' : 'Add project image'} variant="outline" />
              {portfolioImage?.uri ? <Image source={{ uri: portfolioImage.uri }} style={styles.preview} /> : null}
              <PublishPicker publish={publish} setPublish={setPublish} />
              <AppButton loading={saving} onPress={() => saveListing(publish ? 'published' : 'draft')} title={publish ? 'Publish portfolio item' : 'Save draft'} />
              <ListingRows items={portfolio} titleKey="title" />
            </>
          ) : (
            <>
              {renderCategoryOptions()}
              <AppInput label={activeType === 'product' ? 'Product name' : activeType === 'job' ? 'Job title' : 'Project title'} onChangeText={(value) => setField('title', value)} value={form.title} />
              <AppInput label={activeType === 'product' ? 'Product description' : activeType === 'job' ? 'Job description' : 'Project scope'} multiline onChangeText={(value) => setField('description', value)} value={form.description} />
              {activeType === 'product' ? (
                <>
                  <View style={styles.row}>
                    <AppInput keyboardType="decimal-pad" label="Price" onChangeText={(value) => setField('price', value)} value={form.price} />
                    <AppInput keyboardType="number-pad" label="Stock quantity" onChangeText={(value) => setField('stockQuantity', value)} value={form.stockQuantity} />
                  </View>
                  <AppInput label="Currency" maxLength={3} onChangeText={(value) => setField('currency', value)} value={form.currency} />
                  <AppInput label="Variants (JSON)" helper="Optional, e.g. {&quot;size&quot;:[&quot;M&quot;,&quot;L&quot;]}" onChangeText={(value) => setField('variants', value)} value={form.variants} />
                  <AppInput label="Delivery or pickup information" onChangeText={(value) => setField('deliveryInfo', value)} value={form.deliveryInfo} />
                  <AppButton onPress={pickImages} title={`Add product images (${productImages.length}/8)`} variant="outline" />
                  <View style={styles.imageRow}>
                    {productImages.map((image, index) => (
                      <Image key={`${image.uri}-${index}`} source={{ uri: image.uri }} style={styles.thumb} />
                    ))}
                  </View>
                </>
              ) : activeType === 'job' ? (
                <>
                  <ChoiceRow label="Employment type" options={['full-time', 'part-time', 'contract', 'temporary', 'internship']} value={form.employmentType} onChange={(value) => setField('employmentType', value)} />
                  <ChoiceRow label="Work mode" options={['on-site', 'remote', 'hybrid']} value={form.workMode} onChange={(value) => setField('workMode', value)} />
                  <AppInput label="Location" onChangeText={(value) => setField('location', value)} value={form.location} />
                  <View style={styles.row}>
                    <AppInput keyboardType="decimal-pad" label="Minimum salary" onChangeText={(value) => setField('salaryMin', value)} value={form.salaryMin} />
                    <AppInput keyboardType="decimal-pad" label="Maximum salary" onChangeText={(value) => setField('salaryMax', value)} value={form.salaryMax} />
                  </View>
                  <AppInput label="Experience requirements" onChangeText={(value) => setField('experienceRequired', value)} value={form.experienceRequired} />
                  <AppInput label="Education requirements" onChangeText={(value) => setField('educationRequired', value)} value={form.educationRequired} />
                  <AppInput label="Required skills (comma-separated)" onChangeText={(value) => setField('skills', value)} value={form.skills} />
                  <AppInput label="Application deadline (YYYY-MM-DD)" onChangeText={(value) => setField('deadline', value)} value={form.deadline} />
                </>
              ) : (
                <>
                  <AppInput label="Required skills (comma-separated)" onChangeText={(value) => setField('skills', value)} value={form.skills} />
                  <AppInput keyboardType="decimal-pad" label="Budget" onChangeText={(value) => setField('budget', value)} value={form.budget} />
                  <AppInput label="Deadline (YYYY-MM-DD)" onChangeText={(value) => setField('deadline', value)} value={form.deadline} />
                  <AppInput label="Deliverables" multiline onChangeText={(value) => setField('deliverables', value)} value={form.deliverables} />
                  <ChoiceRow label="Work mode" options={['on-site', 'remote', 'hybrid']} value={form.workMode} onChange={(value) => setField('workMode', value)} />
                  <AppInput label="Location" onChangeText={(value) => setField('location', value)} value={form.location} />
                  <AppButton onPress={pickProjectAttachment} title={`Add attachments (${projectAttachments.length}/10)`} variant="outline" />
                  {projectAttachments.map((file, index) => (
                    <AppText key={`${file.uri}-${index}`} variant="caption" color={colors.muted}>{file.name}</AppText>
                  ))}
                </>
              )}
              <PublishPicker publish={publish} setPublish={setPublish} />
              <AppButton
                loading={saving}
                onPress={() => saveListing(publish ? 'published' : 'draft')}
                title={publish ? 'Publish listing' : 'Save draft'}
              />
              <AppText variant="title" color={colors.text}>Your listings</AppText>
              <View style={styles.stack}>
                {listings.map((item) => (
                  <View key={item.id} style={styles.listingCard}>
                    <View style={styles.listingCopy}>
                      <AppText variant="label" color={colors.text} numberOfLines={1}>
                        {item.name || item.title}
                      </AppText>
                      <AppText variant="caption" color={colors.muted}>{item.status}</AppText>
                    </View>
                    <AppButton
                      onPress={() => changeStatus(item)}
                      size="sm"
                      title={item.status === 'published' ? 'Pause' : 'Publish'}
                      variant="outline"
                    />
                    <AppButton onPress={() => archiveItem(item)} size="sm" title="Archive" variant="danger" />
                  </View>
                ))}
                {!listings.length ? <AppText variant="caption" color={colors.muted}>No listings yet.</AppText> : null}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PublishPicker({ publish, setPublish }) {
  return (
    <View style={styles.chips}>
      {[
        [true, 'Publish now'],
        [false, 'Save as draft'],
      ].map(([value, label]) => (
        <AppPressable key={label} onPress={() => setPublish(value)} style={[styles.chip, publish === value && styles.chipActive]}>
          <AppText variant="caption" color={publish === value ? colors.inverse : colors.textSecondary}>{label}</AppText>
        </AppPressable>
      ))}
    </View>
  );
}

function ChoiceRow({ label, options, value, onChange }) {
  return (
    <View style={styles.block}>
      <AppText variant="label" color={colors.text}>{label}</AppText>
      <View style={styles.chips}>
        {options.map((option) => (
          <AppPressable key={option} onPress={() => onChange(option)} style={[styles.chip, value === option && styles.chipActive]}>
            <AppText variant="caption" color={value === option ? colors.inverse : colors.textSecondary}>{option}</AppText>
          </AppPressable>
        ))}
      </View>
    </View>
  );
}

function ListingRows({ items, titleKey }) {
  return (
    <View style={styles.stack}>
      <AppText variant="title" color={colors.text}>Published work</AppText>
      {items.map((item) => (
        <View key={item.id} style={styles.listingCard}>
          <View style={styles.listingCopy}>
            <AppText variant="label" color={colors.text}>{item[titleKey]}</AppText>
            <AppText variant="caption" color={colors.muted}>{item.status}</AppText>
          </View>
        </View>
      ))}
      {!items.length ? <AppText variant="caption" color={colors.muted}>No portfolio items yet.</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  row: { flexDirection: 'row', gap: spacing.sm },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 76, height: 76, borderRadius: radii.md },
  preview: { width: '100%', height: 180, borderRadius: radii.md },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  listingCopy: { flex: 1, gap: spacing.xxs },
});
