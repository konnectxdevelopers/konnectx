import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppInput,
  AppModal,
  AppPressable,
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  useToast,
} from '../components/ui';
import ListingPreviewContent from '../features/marketplace/ListingPreviewContent';
import { dashboardArtworkForCategory } from '../features/profile/dashboardAssets';
import {
  archiveListingRequest,
  getListingCapabilitiesRequest,
  getListingHistoryRequest,
  getMyListingsRequest,
  getSavedListingPreviewRequest,
  pauseListingRequest,
  publishListingRequest,
  resumeListingRequest,
  submitListingForReviewRequest,
} from '../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../theme/tokens';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'published', label: 'Published' },
  { key: 'paused', label: 'Paused' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'archived', label: 'Archived' },
];

const TYPE_LABELS = {
  service: 'Service',
  product: 'Product',
  job: 'Job',
  freelance_project: 'Project',
  professional_profile: 'Pro Profile',
  business_profile: 'Business Profile',
};

function badgeTone(status) {
  if (status === 'published') return 'success';
  if (status === 'pending_review') return 'warning';
  if (status === 'rejected') return 'danger';
  if (status === 'paused') return 'info';
  return 'neutral';
}

export default function MyListingsScreen() {
  const params = useLocalSearchParams();
  const initialRole = Array.isArray(params.role) ? params.role[0] : params.role;
  const initialType = Array.isArray(params.type) ? params.type[0] : params.type;
  const { session } = useAuth();
  const toast = useToast();

  const [capabilities, setCapabilities] = useState(null);
  const [activeStatus, setActiveStatus] = useState('');
  const [activeType, setActiveType] = useState(initialType || '');
  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [listings, setListings] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const [previewListing, setPreviewListing] = useState(null);
  const [historyModal, setHistoryModal] = useState({ visible: false, title: '', items: [], loading: false });

  const loadListings = useCallback(async ({ page = 1, append = false, isRefresh = false } = {}) => {
    if (!session?.token) {
      setError('Sign in to manage your marketplace listings.');
      setLoading(false);
      return;
    }
    if (append) setLoadingMore(true);
    else if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [capRes, listRes] = await Promise.all([
        capabilities ? Promise.resolve(capabilities) : getListingCapabilitiesRequest(session),
        getMyListingsRequest(session, {
          type: activeType || undefined,
          status: activeStatus || undefined,
          q: submittedSearch || undefined,
          page,
          limit: 15,
        }),
      ]);
      if (!capabilities) setCapabilities(capRes);
      setListings((current) => append ? [...current, ...(listRes.listings || [])] : (listRes.listings || []));
      setCounts(listRes.counts || {});
      setPagination(listRes.pagination || { page, limit: 15, total: 0, hasMore: false });
    } catch (requestError) {
      setError(requestError?.message || 'Could not load your listings.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [activeStatus, activeType, capabilities, session, submittedSearch]);

  useEffect(() => {
    Promise.resolve().then(() => loadListings({ page: 1, append: false }));
  }, [loadListings]);

  const runAction = async (item, fn, successMessage) => {
    setBusyId(item.id);
    setError(null);
    try {
      await fn();
      toast?.show?.(successMessage, { variant: 'success' });
      await loadListings({ page: 1, append: false, isRefresh: true });
    } catch (actionError) {
      setError(actionError?.message || 'Could not update listing status.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmArchive = (item) => {
    Alert.alert(
      'Archive listing?',
      `"${item.title}" will be removed from public discovery and cannot be edited afterward.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => runAction(item, () => archiveListingRequest(session, item.id), 'Listing archived.'),
        },
      ]
    );
  };

  const openPreview = async (item) => {
    setBusyId(item.id);
    try {
      const response = await getSavedListingPreviewRequest(session, item.id);
      setPreviewListing(response.preview);
    } catch (previewError) {
      setError(previewError?.message || 'Could not load preview.');
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (item) => {
    setHistoryModal({ visible: true, title: item.title, items: [], loading: true });
    try {
      const response = await getListingHistoryRequest(session, item.id);
      setHistoryModal({ visible: true, title: item.title, items: response.history || [], loading: false });
    } catch (historyError) {
      setHistoryModal({ visible: false, title: '', items: [], loading: false });
      setError(historyError?.message || 'Could not load status history.');
    }
  };

  const allowedTypes = capabilities?.allowedListingTypes || [];
  const requireReviewTypes = capabilities?.moderationPolicy?.requireReviewTypes || [];

  const needsReview = (listingType) =>
    requireReviewTypes.includes('all') || requireReviewTypes.includes(listingType);

  const openEditor = (listingId = null) => {
    const query = [];
    if (listingId) query.push(`id=${encodeURIComponent(listingId)}`);
    if (initialRole) query.push(`role=${encodeURIComponent(initialRole)}`);
    if (!listingId && activeType) query.push(`type=${encodeURIComponent(activeType)}`);
    router.push(`/listing-editor${query.length ? `?${query.join('&')}` : ''}`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        right={allowedTypes.length ? (
          <AppButton onPress={() => openEditor()} size="sm" title="Create" variant="cta" />
        ) : null}
        showBack
        subtitle={initialRole ? `${initialRole[0].toUpperCase()}${initialRole.slice(1)} listings` : 'Unified Listing Engine'}
        title="My Listings"
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => loadListings({ page: 1, isRefresh: true })}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
      >
        {error ? <InlineAlert message={error} variant="error" /> : null}

        {capabilities && !allowedTypes.length ? (
          <InlineAlert
            message="Your current account role cannot publish listings. Switch to Professional, Business, or Hiring to create listings."
            variant="info"
          />
        ) : null}

        <View style={styles.searchRow}>
          <View style={styles.flex}>
            <AppInput
              onChangeText={setSearchInput}
              onSubmitEditing={() => setSubmittedSearch(searchInput.trim())}
              placeholder="Search your listings..."
              returnKeyType="search"
              value={searchInput}
            />
          </View>
          <AppButton
            onPress={() => setSubmittedSearch(searchInput.trim())}
            size="sm"
            title="Search"
            variant="secondary"
          />
        </View>

        {allowedTypes.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
            <AppPressable
              onPress={() => setActiveType('')}
              style={[styles.chip, !activeType && styles.chipActive]}
            >
              <AppText variant="caption" color={!activeType ? colors.inverse : colors.textSecondary}>
                All types
              </AppText>
            </AppPressable>
            {allowedTypes.map((typeKey) => (
              <AppPressable
                key={typeKey}
                onPress={() => setActiveType(typeKey)}
                style={[styles.chip, activeType === typeKey && styles.chipActive]}
              >
                <AppText variant="caption" color={activeType === typeKey ? colors.inverse : colors.textSecondary}>
                  {TYPE_LABELS[typeKey] || typeKey}
                </AppText>
              </AppPressable>
            ))}
          </ScrollView>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
          {STATUS_TABS.map((tab) => {
            const count = tab.key === '' ? (counts.all ?? 0) : (counts[tab.key] ?? 0);
            const selected = activeStatus === tab.key;
            return (
              <AppPressable
                key={tab.key || 'all'}
                onPress={() => setActiveStatus(tab.key)}
                style={[styles.chip, selected && styles.chipActive]}
              >
                <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                  {tab.label} ({count})
                </AppText>
              </AppPressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <LoadingState message="Loading your listings..." />
        ) : error && !listings.length ? (
          <ErrorState message={error} onRetry={() => loadListings({ page: 1 })} />
        ) : !listings.length ? (
          <EmptyState
            actionLabel={allowedTypes.length ? 'Create listing' : undefined}
            icon="briefcase-plus-outline"
            message={activeStatus ? `You do not have any ${activeStatus.replace('_', ' ')} listings.` : 'Create a draft or publish your first marketplace listing.'}
            onAction={allowedTypes.length ? () => openEditor() : undefined}
            title="No listings found"
          />
        ) : (
          <View style={styles.list}>
            {listings.map((item) => {
              const isBusy = busyId === item.id;
              const coverUri = item.coverImage?.url;
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Image
                      source={coverUri
                        ? { uri: coverUri }
                        : dashboardArtworkForCategory(item.categoryName || item.title)}
                      style={styles.thumb}
                    />
                    <View style={styles.cardMeta}>
                      <View style={styles.badgeRow}>
                        <Badge label={TYPE_LABELS[item.listingType] || item.listingType} variant="neutral" />
                        <Badge label={item.status.replace('_', ' ')} tone={badgeTone(item.status)} />
                      </View>
                      <AppText variant="subtitle" color={colors.text} numberOfLines={1}>
                        {item.title}
                      </AppText>
                      <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                        {item.categoryName || 'Uncategorized'}
                        {item.subcategoryName ? ` · ${item.subcategoryName}` : ''}
                      </AppText>
                    </View>
                  </View>

                  {item.shortSummary ? (
                    <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
                      {item.shortSummary}
                    </AppText>
                  ) : null}

                  {item.status === 'rejected' && item.moderation?.reason ? (
                    <InlineAlert message={`Rejection reason: ${item.moderation.reason}`} variant="error" />
                  ) : null}

                  <View style={styles.actions}>
                    {item.status !== 'archived' ? (
                      <AppButton
                        disabled={isBusy}
                        onPress={() => openEditor(item.id)}
                        size="sm"
                        title="Edit"
                        variant="secondary"
                      />
                    ) : null}
                    <AppButton
                      disabled={isBusy}
                      onPress={() => openPreview(item)}
                      size="sm"
                      title="Preview"
                      variant="outline"
                    />
                    {['draft', 'rejected'].includes(item.status) ? (
                      needsReview(item.listingType) ? (
                        <AppButton
                          disabled={isBusy}
                          onPress={() => runAction(item, () => submitListingForReviewRequest(session, item.id), 'Submitted for review.')}
                          size="sm"
                          title="Submit review"
                        />
                      ) : (
                        <AppButton
                          disabled={isBusy}
                          onPress={() => runAction(item, () => publishListingRequest(session, item.id), 'Listing published.')}
                          size="sm"
                          title="Publish"
                        />
                      )
                    ) : null}
                    {item.status === 'published' ? (
                      <AppButton
                        disabled={isBusy}
                        onPress={() => runAction(item, () => pauseListingRequest(session, item.id), 'Listing paused.')}
                        size="sm"
                        title="Pause"
                        variant="outline"
                      />
                    ) : null}
                    {item.status === 'paused' ? (
                      <AppButton
                        disabled={isBusy}
                        onPress={() => runAction(item, () => resumeListingRequest(session, item.id), 'Listing resumed.')}
                        size="sm"
                        title="Resume"
                      />
                    ) : null}
                    <AppButton
                      disabled={isBusy}
                      onPress={() => openHistory(item)}
                      size="sm"
                      title="History"
                      variant="ghost"
                    />
                    {item.status !== 'archived' ? (
                      <AppButton
                        disabled={isBusy}
                        onPress={() => confirmArchive(item)}
                        size="sm"
                        title="Archive"
                        variant="danger"
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}

            {pagination.hasMore ? (
              <AppButton
                loading={loadingMore}
                onPress={() => loadListings({ page: pagination.page + 1, append: true })}
                title="Load more"
                variant="secondary"
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      <AppModal
        actions={<AppButton onPress={() => setPreviewListing(null)} title="Close preview" variant="secondary" />}
        onClose={() => setPreviewListing(null)}
        title="Customer Preview"
        visible={Boolean(previewListing)}
      >
        <ScrollView style={styles.modalScroll}>
          <ListingPreviewContent isPreview listing={previewListing} />
        </ScrollView>
      </AppModal>

      <AppModal
        actions={<AppButton onPress={() => setHistoryModal({ visible: false, title: '', items: [], loading: false })} title="Close" variant="secondary" />}
        description={historyModal.title}
        onClose={() => setHistoryModal({ visible: false, title: '', items: [], loading: false })}
        title="Status History"
        visible={historyModal.visible}
      >
        {historyModal.loading ? <LoadingState message="Loading status history..." /> : (
          <View style={styles.historyList}>
            {historyModal.items.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <AppText variant="label" color={colors.text}>
                  {entry.fromStatus ? `${entry.fromStatus} -> ${entry.toStatus}` : entry.toStatus}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {entry.changedByRole || 'system'} · {new Date(entry.createdAt).toLocaleString()}
                </AppText>
                {entry.reason ? (
                  <AppText variant="caption" color={colors.textSecondary}>{entry.reason}</AppText>
                ) : null}
              </View>
            ))}
            {!historyModal.items.length ? (
              <AppText variant="caption" color={colors.muted}>No status transitions recorded yet.</AppText>
            ) : null}
          </View>
        )}
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  chipRail: { gap: spacing.xs, paddingVertical: spacing.xxs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  list: { gap: spacing.md },
  card: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  cardMeta: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  modalScroll: { maxHeight: 460 },
  historyList: { gap: spacing.sm },
  historyRow: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 2,
  },
});
