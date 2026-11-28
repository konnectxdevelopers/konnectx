import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  AppHeader,
  AppInput,
  AppPressable,
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchBar,
} from '../../components/ui';
import {
  getMarketplaceCategoryTreeRequest,
  listProjectsRequest,
} from '../../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../../theme/tokens';

const EMPTY_FILTERS = {
  categoryId: '',
  subcategoryId: '',
  minBudget: '',
  maxBudget: '',
  deadline: '',
  location: '',
  workMode: '',
  skills: '',
};

function projectBudget(project) {
  if (project.budgetType === 'negotiable') return 'Negotiable';
  const currency = project.currency === 'INR' ? '₹' : `${project.currency || 'INR'} `;
  if (project.budgetType === 'range' && project.budgetMin != null && project.budgetMax != null) {
    return `${currency}${Number(project.budgetMin).toLocaleString()}–${currency}${Number(project.budgetMax).toLocaleString()}`;
  }
  return project.budget == null ? 'Budget not specified' : `${currency}${Number(project.budget).toLocaleString()} · ${project.budgetType}`;
}

export default function ProjectDiscoveryScreen() {
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState({});
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);

  const categoryRoot = categories.find((category) =>
    category.listingType === 'project' || category.slug === 'freelance-projects'
  );
  const projectCategories = categoryRoot?.children?.length
    ? categoryRoot.children
    : categories.filter((category) => category.listingType === 'project');
  const selectedCategory = projectCategories.find((category) => category.id === filters.categoryId);

  const query = useMemo(() => ({
    q: search || undefined,
    ...appliedFilters,
    limit: 10,
  }), [appliedFilters, search]);

  const loadProjects = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    try {
      const response = await listProjectsRequest({ ...query, page: 1 });
      if (requestId !== requestSequence.current) return;
      setItems(response.projects || response.items || []);
      setPagination(response.pagination || null);
      setPage(1);
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      setError(requestError?.message || 'Could not load freelance projects.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    let active = true;
    getMarketplaceCategoryTreeRequest('project')
      .then((response) => {
        if (active) setCategories(response.tree || response.categories || []);
      })
      .catch((requestError) => {
        if (active) setCategoryError(requestError?.message || 'Could not load project categories.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) loadProjects();
    });
    return () => {
      active = false;
      requestSequence.current += 1;
    };
  }, [loadProjects]);

  const loadMore = async () => {
    if (!pagination?.hasMore || loadingMore) return;
    const nextPage = page + 1;
    const requestId = requestSequence.current;
    setLoadingMore(true);
    try {
      const response = await listProjectsRequest({ ...query, page: nextPage });
      if (requestId !== requestSequence.current) return;
      setItems((current) => [...current, ...(response.projects || response.items || [])]);
      setPagination(response.pagination || null);
      setPage(nextPage);
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      setError(requestError?.message || 'Could not load more projects.');
    } finally {
      if (requestId === requestSequence.current) setLoadingMore(false);
    }
  };

  const applyFilters = () => {
    setAppliedFilters(Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== '')
    ));
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters({});
    setSearchText('');
    setSearch('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle="Projects accepting proposals"
        title="Freelance Projects"
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SearchBar
          onChangeText={setSearchText}
          onSubmit={() => setSearch(searchText.trim())}
          placeholder="Search project scope or title"
          value={searchText}
        />
        {categoryError ? <ErrorState message={categoryError} /> : null}
        <View style={styles.card}>
          <AppText variant="label" color={colors.text}>Category</AppText>
          <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
            <AppPressable
              onPress={() => setFilters((current) => ({ ...current, categoryId: '', subcategoryId: '' }))}
              style={[styles.pill, !filters.categoryId && styles.pillActive]}
            >
              <AppText variant="caption" color={!filters.categoryId ? colors.inverse : colors.textSecondary}>
                All
              </AppText>
            </AppPressable>
            {projectCategories.map((category) => (
              <AppPressable
                key={category.id}
                onPress={() => setFilters((current) => ({
                  ...current,
                  categoryId: category.id,
                  subcategoryId: '',
                }))}
                style={[styles.pill, filters.categoryId === category.id && styles.pillActive]}
              >
                <AppText
                  variant="caption"
                  color={filters.categoryId === category.id ? colors.inverse : colors.textSecondary}
                >
                  {category.name}
                </AppText>
              </AppPressable>
            ))}
          </ScrollView>
          {selectedCategory?.children?.length ? (
            <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
              {selectedCategory.children.map((category) => (
                <AppPressable
                  key={category.id}
                  onPress={() => setFilters((current) => ({ ...current, subcategoryId: category.id }))}
                  style={[styles.pill, filters.subcategoryId === category.id && styles.pillActive]}
                >
                  <AppText
                    variant="caption"
                    color={filters.subcategoryId === category.id ? colors.inverse : colors.textSecondary}
                  >
                    {category.name}
                  </AppText>
                </AppPressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.row}>
            <AppInput
              containerStyle={styles.flex}
              keyboardType="decimal-pad"
              label="Minimum budget"
              onChangeText={(value) => setFilters((current) => ({ ...current, minBudget: value }))}
              value={filters.minBudget}
            />
            <AppInput
              containerStyle={styles.flex}
              keyboardType="decimal-pad"
              label="Maximum budget"
              onChangeText={(value) => setFilters((current) => ({ ...current, maxBudget: value }))}
              value={filters.maxBudget}
            />
          </View>
          <AppInput
            label="Project deadline by"
            onChangeText={(value) => setFilters((current) => ({ ...current, deadline: value }))}
            placeholder="YYYY-MM-DD"
            value={filters.deadline}
          />
          <AppInput
            label="Location"
            onChangeText={(value) => setFilters((current) => ({ ...current, location: value }))}
            placeholder="City or region"
            value={filters.location}
          />
          <AppText variant="label" color={colors.text}>Work mode</AppText>
          <View style={styles.rail}>
            {[
              ['', 'Any'],
              ['remote', 'Remote'],
              ['on-site', 'On-site'],
              ['hybrid', 'Hybrid'],
            ].map(([value, label]) => (
              <AppPressable
                key={`mode-${value || 'any'}`}
                onPress={() => setFilters((current) => ({ ...current, workMode: value }))}
                style={[styles.pill, filters.workMode === value && styles.pillActive]}
              >
                <AppText
                  variant="caption"
                  color={filters.workMode === value ? colors.inverse : colors.textSecondary}
                >
                  {label}
                </AppText>
              </AppPressable>
            ))}
          </View>
          <AppInput
            label="Skills (comma separated)"
            onChangeText={(value) => setFilters((current) => ({ ...current, skills: value }))}
            value={filters.skills}
          />
          <View style={styles.row}>
            <AppButton containerStyle={styles.flex} onPress={applyFilters} title="Apply" />
            <AppButton containerStyle={styles.flex} onPress={clearFilters} title="Clear" variant="outline" />
          </View>
        </View>

        {loading ? <LoadingState message="Loading freelance projects..." /> : null}
        {error ? <ErrorState message={error} onRetry={loadProjects} /> : null}
        {!loading && !error && !items.length ? (
          <EmptyState
            icon="rocket-launch-outline"
            message="Published projects with open proposal windows will appear here."
            title="No projects match"
          />
        ) : null}
        {items.map((project) => (
          <AppPressable
            key={project.id}
            accessibilityRole="button"
            onPress={() => router.push(`/project/${project.id}`)}
            style={styles.projectCard}
          >
            <View style={styles.rail}>
              <Badge label={project.budgetType || 'Budget'} variant="neutral" />
              <Badge label={project.workMode || 'Remote'} variant="info" />
            </View>
            <AppText variant="h4" color={colors.text}>{project.title}</AppText>
            <AppText variant="label" color={colors.primary}>{projectBudget(project)}</AppText>
            <AppText variant="caption" color={colors.muted}>
              {[project.categoryName, project.location, project.deadline ? `Due ${String(project.deadline).slice(0, 10)}` : null]
                .filter(Boolean).join(' · ')}
            </AppText>
            <AppText variant="body" color={colors.textSecondary} numberOfLines={3}>
              {project.description}
            </AppText>
            {project.requiredSkills?.length ? (
              <View style={styles.rail}>
                {project.requiredSkills.slice(0, 5).map((skill) => (
                  <Badge key={skill} label={skill} variant="neutral" />
                ))}
              </View>
            ) : null}
            <AppText variant="caption" color={colors.primary}>View details and submit a proposal</AppText>
          </AppPressable>
        ))}
        {pagination?.hasMore ? (
          <AppButton loading={loadingMore} onPress={loadMore} title="Load more projects" variant="secondary" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  projectCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rail: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
