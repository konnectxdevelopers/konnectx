import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
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
  EmptyState,
  ErrorState,
  LoadingState,
  SearchBar,
} from '../components/ui';
import {
  clearSearchHistoryRequest,
  deleteSearchHistoryItemRequest,
  getSearchHistoryRequest,
  getSearchFilterMetadataRequest,
  getSearchSuggestionsRequest,
  globalMarketplaceSearchRequest,
  saveSearchHistoryRequest,
} from '../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../theme/tokens';
import MarketplaceListingCard from '../features/marketplace/MarketplaceListingCard';

const TYPE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'service', label: 'Services' },
  { key: 'product', label: 'Products' },
  { key: 'professional_profile', label: 'Pros' },
  { key: 'job', label: 'Jobs' },
  { key: 'freelance_project', label: 'Projects' },
  { key: 'business_profile', label: 'Businesses' },
];

const EMPTY_SUGGESTIONS = { categories: [], skills: [], listings: [] };
const EMPTY_FILTERS = {
  categoryId: '',
  subcategoryId: '',
  category: '',
  location: '',
  skill: '',
  minPrice: '',
  maxPrice: '',
  pricingType: '',
  deliveryMethod: '',
  providerType: '',
  availabilityDay: '',
  brand: '',
  stockStatus: '',
  minExperience: '',
  maxExperience: '',
  verified: '',
  hasPortfolio: '',
  employmentType: '',
  workMode: '',
  salaryMin: '',
  salaryMax: '',
  education: '',
  minBudget: '',
  maxBudget: '',
  deadline: '',
  businessType: '',
  hasServices: '',
  hasProducts: '',
};

const SORT_LABELS = {
  relevance: 'Relevance',
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating_desc: 'Rating',
  discount: 'Discount',
  experience_desc: 'Experience',
  salary_desc: 'Salary',
  budget_desc: 'Budget',
  deadline_asc: 'Deadline',
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function navigateToResult(item) {
  const type = item.listingType;
  if (type === 'service') return router.push(`/service/${item.entityId || item.id}`);
  if (type === 'product') return router.push(`/product/${item.entityId || item.id}`);
  if (type === 'job') return router.push(`/job/${item.entityId || item.id}`);
  if (type === 'freelance_project') return router.push(`/project/${item.entityId || item.id}`);
  return router.push(`/listing/${item.id}`);
}

export default function MarketplaceSearchScreen() {
  const { q: initialQ, type: initialType } = useLocalSearchParams();
  const { session } = useAuth();

  const initialTypeValue = initialType ? String(initialType) : 'all';
  const initialTypeKey = TYPE_TABS.some((tab) => tab.key === initialTypeValue) ? initialTypeValue : 'all';
  const sessionKey = session?.user?.id || session?.userId || session?.token || null;
  const [queryText, setQueryText] = useState(initialQ ? String(initialQ) : '');
  const [submittedQuery, setSubmittedQuery] = useState(initialQ ? String(initialQ) : '');
  const [activeType, setActiveType] = useState(initialTypeKey);
  const [sort, setSort] = useState('relevance');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterState, setFilterState] = useState({ type: null, data: null, error: null, loaded: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);

  const [suggestionState, setSuggestionState] = useState({
    key: null,
    data: EMPTY_SUGGESTIONS,
    loading: false,
    error: null,
  });
  const [historyState, setHistoryState] = useState({ key: null, items: [] });
  const [historyErrorState, setHistoryErrorState] = useState({ key: null, message: null });
  const requestSeq = useRef(0);
  const suggestionSeq = useRef(0);
  const filterSeq = useRef(0);

  const history = historyState.key === sessionKey ? historyState.items : [];
  const historyError = historyErrorState.key === sessionKey ? historyErrorState.message : null;
  const suggestionKey = `${activeType}:${queryText.trim()}`;
  const suggestions = suggestionState.key === suggestionKey ? suggestionState.data : EMPTY_SUGGESTIONS;
  const suggestionLoading = suggestionState.key === suggestionKey && suggestionState.loading;
  const suggestionError = suggestionState.key === suggestionKey ? suggestionState.error : null;
  const filterMetadata = filterState.type === activeType ? filterState.data : null;
  const filterLoading = filterState.type !== activeType || !filterState.loaded;
  const filterError = filterState.type === activeType ? filterState.error : null;
  const apiFilters = useMemo(() => Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  ), [filters]);
  const filterCount = Object.keys(apiFilters).length;

  useEffect(() => {
    let active = true;
    if (!session?.token) return undefined;
    getSearchHistoryRequest(session)
      .then((res) => {
        if (active) {
          setHistoryState({ key: sessionKey, items: res.items || [] });
          setHistoryErrorState({ key: sessionKey, message: null });
        }
      })
      .catch(() => {
        if (active) {
          setHistoryState({ key: sessionKey, items: [] });
          setHistoryErrorState({ key: sessionKey, message: 'Recent searches could not be loaded.' });
        }
      });
    return () => {
      active = false;
    };
  }, [session, sessionKey]);

  useEffect(() => {
    const trimmed = queryText.trim();
    const sequence = ++suggestionSeq.current;
    if (!trimmed) return undefined;
    const key = `${activeType}:${trimmed}`;
    const timer = setTimeout(async () => {
      if (sequence !== suggestionSeq.current) return;
      setSuggestionState({ key, data: EMPTY_SUGGESTIONS, loading: true, error: null });
      try {
        const response = await getSearchSuggestionsRequest(
          trimmed,
          activeType === 'all' ? undefined : activeType
        );
        if (sequence === suggestionSeq.current) {
          setSuggestionState({
            key,
            data: response || EMPTY_SUGGESTIONS,
            loading: false,
            error: null,
          });
        }
      } catch {
        if (sequence === suggestionSeq.current) {
          setSuggestionState({
            key,
            data: EMPTY_SUGGESTIONS,
            loading: false,
            error: 'Suggestions are temporarily unavailable.',
          });
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      if (sequence === suggestionSeq.current) suggestionSeq.current += 1;
    };
  }, [activeType, queryText]);

  useEffect(() => {
    let active = true;
    const sequence = ++filterSeq.current;
    getSearchFilterMetadataRequest(activeType)
      .then((response) => {
        if (active && sequence === filterSeq.current) {
          setFilterState({ type: activeType, data: response, error: null, loaded: true });
        }
      })
      .catch(() => {
        if (active && sequence === filterSeq.current) {
          setFilterState({
            type: activeType,
            data: null,
            error: 'Filter options could not be loaded.',
            loaded: true,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [activeType]);

  const executeSearch = useCallback(async (
    qVal,
    typeVal,
    sortVal,
    filterValues,
    pageNum = 1,
    append = false
  ) => {
    const seq = ++requestSeq.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await globalMarketplaceSearchRequest({
        q: qVal || undefined,
        type: typeVal === 'all' ? undefined : typeVal,
        sort: sortVal,
        page: pageNum,
        limit: 15,
        ...filterValues,
      });
      if (seq !== requestSeq.current) return;
      setResults((prev) => {
        if (!append) return res.data || [];
        const ids = new Set(prev.map((item) => item.id));
        return [...prev, ...(res.data || []).filter((item) => !ids.has(item.id))];
      });
      setPagination(res.pagination || null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err?.message || 'Search failed.');
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      executeSearch(submittedQuery, activeType, sort, apiFilters);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeType, apiFilters, executeSearch, sort, submittedQuery]);

  const handleSubmit = (textOverride = null, typeOverride = activeType) => {
    const target = (textOverride !== null ? textOverride : queryText).trim();
    const sameSearch = target === submittedQuery && typeOverride === activeType;
    setQueryText(target);
    setSubmittedQuery(target);
    if (typeOverride !== activeType) {
      setActiveType(typeOverride);
      setFilters(EMPTY_FILTERS);
      setDraftFilters(EMPTY_FILTERS);
      setSort('relevance');
    }
    if (sameSearch) executeSearch(target, activeType, sort, apiFilters);
    if (target && session?.token) {
      setHistoryErrorState({ key: sessionKey, message: null });
      saveSearchHistoryRequest(session, target, typeOverride === 'all' ? null : typeOverride)
        .then(() => getSearchHistoryRequest(session))
        .then((res) => setHistoryState({ key: sessionKey, items: res.items || [] }))
        .catch(() => setHistoryErrorState({
          key: sessionKey,
          message: 'This search could not be saved to recent searches.',
        }));
    }
  };

  const handleDeleteHistory = async (id) => {
    try {
      await deleteSearchHistoryItemRequest(session, id);
      setHistoryState((current) => current.key === sessionKey
        ? { ...current, items: current.items.filter((item) => item.id !== id) }
        : current);
      setHistoryErrorState({ key: sessionKey, message: null });
    } catch {
      setHistoryErrorState({ key: sessionKey, message: 'That recent search could not be removed.' });
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearSearchHistoryRequest(session);
      setHistoryState({ key: sessionKey, items: [] });
      setHistoryErrorState({ key: sessionKey, message: null });
    } catch {
      setHistoryErrorState({ key: sessionKey, message: 'Recent searches could not be cleared.' });
    }
  };

  const handleTypeChange = (nextType) => {
    if (nextType === activeType) return;
    setActiveType(nextType);
    setFilters(EMPTY_FILTERS);
    setDraftFilters(EMPTY_FILTERS);
    setSort('relevance');
  };

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setFilterVisible(false);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFilterVisible(false);
  };

  const setDraftFilter = (key, value) => {
    setDraftFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'categoryId' && current.categoryId !== value ? { subcategoryId: '' } : {}),
    }));
  };

  const renderFilterField = (label, key, keyboardType = 'default', placeholder = '') => (
    <AppInput
      key={`${key}-input`}
      keyboardType={keyboardType}
      label={label}
      onChangeText={(value) => setDraftFilter(key, value)}
      placeholder={placeholder || label}
      style={styles.filterInput}
      value={draftFilters[key]}
    />
  );

  const renderFilterOptions = (label, key, options, valueForOption = null) => {
    const availableOptions = (options || []).filter((option) => {
      const value = valueForOption
        ? valueForOption(option)
        : (option && typeof option === 'object' ? option.value ?? option.id : option);
      return value !== null && value !== undefined && String(value) !== '';
    });
    if (!availableOptions.length) return null;
    return (
      <View key={key} style={styles.filterGroup}>
        <AppText variant="label" color={colors.text}>{label}</AppText>
        <ScrollView horizontal contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false}>
          <AppPressable
            accessibilityRole="button"
            onPress={() => setDraftFilter(key, '')}
            style={[styles.pill, !draftFilters[key] && styles.pillActive]}
          >
            <AppText variant="caption" color={!draftFilters[key] ? colors.inverse : colors.textSecondary}>
              Any
            </AppText>
          </AppPressable>
          {availableOptions.map((option, index) => {
            const value = valueForOption
              ? valueForOption(option)
              : (option && typeof option === 'object' ? option.value ?? option.id : option);
            const labelValue = option && typeof option === 'object'
              ? option.label || option.name || option.value || option.id
              : option;
            const selected = String(draftFilters[key]) === String(value);
            return (
              <AppPressable
                accessibilityRole="button"
                key={`${key}-${value}-${index}`}
                onPress={() => setDraftFilter(key, String(value))}
                style={[styles.pill, selected && styles.pillActive]}
              >
                <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                  {String(labelValue)}
                </AppText>
              </AppPressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const categoryFilterField = activeType === 'professional_profile' ? 'category' : 'categoryId';
  const categoryValueForOption = activeType === 'professional_profile'
    ? (option) => option.name
    : (option) => option.id;
  const categoryOptions = filterMetadata?.categories || [];
  const subcategoryOptions = (filterMetadata?.subcategories || []).filter((option) => (
    !draftFilters.categoryId || option.categoryId === draftFilters.categoryId
  ));
  const sortOptions = filterMetadata?.sortOptions || ['relevance', 'newest'];
  const booleanOptions = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader subtitle="Search across all 6 destinations" title="Marketplace Search" />

      <View style={styles.topArea}>
        <SearchBar
          filterActive={filterCount > 0}
          onClear={() => setSubmittedQuery('')}
          onFilterPress={() => {
            setDraftFilters({ ...filters });
            setFilterVisible(true);
          }}
          onChangeText={setQueryText}
          onSubmit={() => handleSubmit()}
          placeholder="Search services, products, pros, jobs, projects..."
          value={queryText}
        />
        <AppButton
          onPress={() => handleSubmit()}
          size="sm"
          title="Search"
          variant="secondary"
        />
        <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
          {TYPE_TABS.map((tab) => (
            <AppPressable
              key={tab.key}
              onPress={() => handleTypeChange(tab.key)}
              style={[styles.pill, activeType === tab.key && styles.pillActive]}
            >
              <AppText variant="caption" color={activeType === tab.key ? colors.inverse : colors.textSecondary}>
                {tab.label}
              </AppText>
            </AppPressable>
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={styles.sortRow} horizontal showsHorizontalScrollIndicator={false}>
          {sortOptions.map((sortOption) => (
            <AppPressable
              key={sortOption}
              onPress={() => setSort(sortOption)}
              style={[styles.pill, sort === sortOption && styles.pillActive]}
            >
              <AppText variant="caption" color={sort === sortOption ? colors.inverse : colors.textSecondary}>
                {SORT_LABELS[sortOption] || sortOption}
              </AppText>
            </AppPressable>
          ))}
        </ScrollView>
        {filterCount ? (
          <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
            {Object.entries(apiFilters).map(([key, value]) => (
              <AppPressable
                accessibilityRole="button"
                key={key}
                onPress={() => setFilters((current) => ({
                  ...current,
                  [key]: '',
                  ...(key === 'categoryId' ? { subcategoryId: '' } : {}),
                }))}
                style={styles.activeFilter}
              >
                <AppText variant="micro" color={colors.primary}>
                  {`${key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}: ${value} ×`}
                </AppText>
              </AppPressable>
            ))}
            <AppButton onPress={clearFilters} size="sm" title="Clear filters" variant="ghost" />
          </ScrollView>
        ) : null}
        {historyError ? <AppText color={colors.danger} variant="caption">{historyError}</AppText> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!submittedQuery && history.length > 0 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <AppText variant="label" color={colors.text}>Recent Searches</AppText>
              <AppButton onPress={handleClearHistory} size="sm" title="Clear all" variant="ghost" />
            </View>
            {history.slice(0, 6).map((h) => (
              <View key={h.id} style={styles.historyRow}>
                <AppPressable
                  onPress={() => handleSubmit(h.query, h.listingType || 'all')}
                  style={styles.historyTap}
                >
                  <AppIcon name="history" size={16} color={colors.muted} />
                  <AppText variant="body" color={colors.text}>{h.query}</AppText>
                </AppPressable>
                <AppButton onPress={() => handleDeleteHistory(h.id)} size="sm" title="Remove" variant="ghost" />
              </View>
            ))}
          </View>
        ) : null}

        {queryText.trim().length > 0 && (
          <View style={styles.sectionCard}>
            <AppText variant="label" color={colors.text}>Suggestions</AppText>
            {suggestionLoading ? <AppText variant="caption" color={colors.muted}>Finding matches...</AppText> : null}
            {suggestionError ? <AppText variant="caption" color={colors.danger}>{suggestionError}</AppText> : null}
            {suggestions.categories?.length ? (
              <View style={styles.wrapRow}>
                {suggestions.categories.map((category) => (
                  <AppPressable
                    key={`${category.listingType}-${category.id}`}
                    onPress={() => handleSubmit(category.name, category.listingType || activeType)}
                    style={styles.pill}
                  >
                    <AppText variant="caption" color={colors.primary}>
                      {category.name}
                    </AppText>
                  </AppPressable>
                ))}
              </View>
            ) : null}
            {suggestions.skills?.length ? (
              <View style={styles.wrapRow}>
                {suggestions.skills.map((sk) => (
                  <AppPressable key={sk} onPress={() => handleSubmit(sk)} style={styles.pill}>
                    <AppText variant="caption" color={colors.primary}>{sk}</AppText>
                  </AppPressable>
                ))}
              </View>
            ) : null}
            {suggestions.listings?.length ? (
              <View style={styles.wrapRow}>
                {suggestions.listings.slice(0, 4).map((l) => (
                  <AppPressable key={l.id} onPress={() => handleSubmit(l.title)} style={styles.pill}>
                    <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                      {l.title}
                    </AppText>
                  </AppPressable>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {loading ? (
          <LoadingState message="Searching marketplace..." />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={() => executeSearch(submittedQuery, activeType, sort, apiFilters)}
          />
        ) : !results.length ? (
          <EmptyState
            actionLabel={filterCount ? 'Clear search and filters' : 'Clear search'}
            icon="magnify-close"
            message="Try correcting the spelling, changing the section, or removing filters."
            onAction={() => {
              setQueryText('');
              setSubmittedQuery('');
              clearFilters();
            }}
            title="No matching listings"
          />
        ) : (
          <View style={styles.resultList}>
            {results.map((item) => (
              <MarketplaceListingCard
                key={item.id}
                compact
                item={item}
                onPress={() => navigateToResult(item)}
                type={item.listingType}
              />
            ))}
            {pagination?.hasMore ? (
              <AppButton
                loading={loadingMore}
                onPress={() => executeSearch(
                  submittedQuery,
                  activeType,
                  sort,
                  apiFilters,
                  (pagination.page || 1) + 1,
                  true
                )}
                title="Load more results"
                variant="secondary"
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      <AppModal
        actions={(
          <View style={styles.modalActions}>
            <AppButton onPress={clearFilters} title="Clear all" variant="ghost" />
            <AppButton onPress={applyFilters} title="Apply filters" variant="primary" />
          </View>
        )}
        description={activeType === 'all'
          ? 'Choose a marketplace section to see its specific filters. Location works across all sections.'
          : `Filters and choices are based on published ${TYPE_TABS.find((tab) => tab.key === activeType)?.label.toLowerCase()} data.`}
        icon="tune-variant"
        onClose={() => setFilterVisible(false)}
        title="Filter results"
        visible={filterVisible}
      >
        {filterLoading ? <LoadingState message="Loading available filters..." /> : null}
        {filterError ? (
          <View style={styles.filterGroup}>
            <AppText variant="caption" color={colors.danger}>{filterError}</AppText>
          </View>
        ) : null}
        {renderFilterField('Location', 'location', 'default', 'City or area')}
        {activeType !== 'all' ? (
          <>
            {renderFilterOptions(
              'Category',
              categoryFilterField,
              categoryOptions,
              categoryValueForOption
            )}
            {subcategoryOptions.length ? renderFilterOptions(
              'Subcategory',
              'subcategoryId',
              subcategoryOptions,
              (option) => option.id
            ) : null}
            {activeType === 'service' ? (
              <>
                {renderFilterOptions('Pricing model', 'pricingType', filterMetadata?.pricingTypes)}
                {renderFilterOptions('Delivery mode', 'deliveryMethod', filterMetadata?.deliveryMethods)}
                {renderFilterOptions(
                  'Provider type',
                  'providerType',
                  filterMetadata?.providerTypes
                )}
                {renderFilterOptions(
                  'Available day',
                  'availabilityDay',
                  (filterMetadata?.availabilityDays || []).map((day) => ({
                    value: String(day),
                    label: DAY_LABELS[day] || `Day ${day}`,
                  }))
                )}
                <View style={styles.inputRow}>
                  {renderFilterField('Min price', 'minPrice', 'decimal-pad')}
                  {renderFilterField('Max price', 'maxPrice', 'decimal-pad')}
                </View>
              </>
            ) : null}
            {activeType === 'product' ? (
              <>
                {filterMetadata?.brands?.length
                  ? renderFilterOptions('Brand', 'brand', filterMetadata.brands)
                  : renderFilterField('Brand name', 'brand', 'default', 'Type a brand')}
                {renderFilterOptions('Stock availability', 'stockStatus', filterMetadata?.stockStatuses)}
                <View style={styles.inputRow}>
                  {renderFilterField('Min price', 'minPrice', 'decimal-pad')}
                  {renderFilterField('Max price', 'maxPrice', 'decimal-pad')}
                </View>
              </>
            ) : null}
            {activeType === 'professional_profile' ? (
              <>
                {filterMetadata?.skills?.length
                  ? renderFilterOptions('Skill', 'skill', filterMetadata.skills)
                  : renderFilterField('Skill', 'skill', 'default', 'Type a skill')}
                <View style={styles.inputRow}>
                  {renderFilterField('Min experience (years)', 'minExperience', 'decimal-pad')}
                  {renderFilterField('Max experience (years)', 'maxExperience', 'decimal-pad')}
                </View>
                {renderFilterOptions('Verified profile', 'verified', booleanOptions, (option) => option.value)}
                {renderFilterOptions('Has portfolio', 'hasPortfolio', booleanOptions, (option) => option.value)}
              </>
            ) : null}
            {activeType === 'job' ? (
              <>
                {filterMetadata?.skills?.length
                  ? renderFilterOptions('Required skill', 'skill', filterMetadata.skills)
                  : renderFilterField('Required skill', 'skill', 'default', 'Type a skill')}
                {renderFilterOptions('Employment type', 'employmentType', filterMetadata?.employmentTypes)}
                {renderFilterOptions('Work mode', 'workMode', filterMetadata?.workModes)}
                <View style={styles.inputRow}>
                  {renderFilterField('Min salary', 'salaryMin', 'decimal-pad')}
                  {renderFilterField('Max salary', 'salaryMax', 'decimal-pad')}
                </View>
                <View style={styles.inputRow}>
                  {renderFilterField('Min experience (years)', 'minExperience', 'decimal-pad')}
                  {renderFilterField('Max experience (years)', 'maxExperience', 'decimal-pad')}
                </View>
                {renderFilterField('Education', 'education', 'default', 'Education requirement')}
              </>
            ) : null}
            {activeType === 'freelance_project' ? (
              <>
                {filterMetadata?.skills?.length
                  ? renderFilterOptions('Required skill', 'skill', filterMetadata.skills)
                  : renderFilterField('Required skill', 'skill', 'default', 'Type a skill')}
                {renderFilterOptions('Work mode', 'workMode', filterMetadata?.workModes)}
                <View style={styles.inputRow}>
                  {renderFilterField('Min budget', 'minBudget', 'decimal-pad')}
                  {renderFilterField('Max budget', 'maxBudget', 'decimal-pad')}
                </View>
                {renderFilterField('Deadline by (YYYY-MM-DD)', 'deadline', 'default', 'YYYY-MM-DD')}
              </>
            ) : null}
            {activeType === 'business_profile' ? (
              <>
                {filterMetadata?.businessTypes?.length
                  ? renderFilterOptions('Business type', 'businessType', filterMetadata.businessTypes)
                  : renderFilterField('Business type', 'businessType', 'default', 'Type a business type')}
                {renderFilterOptions('Verified business', 'verified', booleanOptions, (option) => option.value)}
                {renderFilterOptions('Has published services', 'hasServices', booleanOptions, (option) => option.value)}
                {renderFilterOptions('Has published products', 'hasProducts', booleanOptions, (option) => option.value)}
              </>
            ) : null}
          </>
        ) : null}
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topArea: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  rail: { gap: spacing.xs, paddingVertical: 2 },
  sortRow: { flexDirection: 'row', gap: spacing.xs },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  filterGroup: { gap: spacing.xs },
  filterInput: { flex: 1, minWidth: 0 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  activeFilter: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.primarySoft,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 4 },
  resultList: { gap: spacing.sm },
});
