import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Image, ImageBackground, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../auth/AuthProvider';
import {
  AppButton,
  AppIcon,
  AppInput,
  AppModal,
  AppPressable,
  AppText,
  Badge,
  InlineAlert,
  LoadingState,
  SearchBar,
} from '../../components/ui';
import {
  getCategoriesRequest,
  getFavoritesRequest,
  getMarketplaceCategoryTreeRequest,
  listServicesRequest,
  listProductsRequest,
  listJobsRequest,
  getMyApplicationsRequest,
  listProjectsRequest,
  listProfessionalsRequest,
  listBusinessesRequest,
  discoverListingsRequest,
  getMarketplaceRecommendationsRequest,
  removeFavoriteRequest,
  saveFavoriteRequest,
  sendEnquiryRequest,
} from '../../services/marketplace/marketplaceService';
import { colors, radii, shadows, spacing } from '../../theme/tokens';
import ProductCard from '../marketplace/ProductCard';
import ServiceListingCard from '../marketplace/ServiceListingCard';
import MarketplaceListingCard from '../marketplace/MarketplaceListingCard';
import {
  DashboardAccountTypeSwitcher,
  DashboardDetail,
  DashboardGreeting,
  DashboardLayout,
  DashboardModuleCard,
  DashboardProfileCard,
  DashboardProfileStatus,
  DashboardSection,
} from './DashboardUi';
import { dashboardAssets, dashboardArtworkForCategory } from './dashboardAssets';

const tabs = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'explore', label: 'Explore', icon: 'compass-outline', activeIcon: 'compass' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar-month-outline', activeIcon: 'calendar-month' },
  { key: 'favorites', label: 'Saved', icon: 'heart-outline', activeIcon: 'heart' },
  { key: 'profile', label: 'Profile', icon: 'account-outline', activeIcon: 'account' },
];

const discoverySections = [
  { key: 'services', label: 'Services', icon: 'wrench-outline' },
  { key: 'products', label: 'Shopping', icon: 'shopping-outline' },
  { key: 'professionals', label: 'Pros', icon: 'account-tie-outline' },
  { key: 'jobs', label: 'Jobs', icon: 'briefcase-outline' },
  { key: 'projects', label: 'Projects', icon: 'rocket-launch-outline' },
  { key: 'businesses', label: 'Shops', icon: 'storefront-outline' },
];

function formatJobSalary(job) {
  if (!job || job.salaryUndisclosed || (job.salaryMin == null && job.salaryMax == null)) {
    return 'Salary undisclosed';
  }
  const currency = job.currency === 'INR' ? '₹' : `${job.currency || 'INR'} `;
  if (job.salaryMin != null && job.salaryMax != null) {
    return `${currency}${Number(job.salaryMin).toLocaleString()} - ${currency}${Number(job.salaryMax).toLocaleString()}`;
  }
  return job.salaryMin != null
    ? `From ${currency}${Number(job.salaryMin).toLocaleString()}`
    : `Up to ${currency}${Number(job.salaryMax).toLocaleString()}`;
}

function marketplaceDetailPath(item) {
  const entityId = item.entityId || item.id;
  const paths = {
    service: '/service/',
    product: '/product/',
    job: '/job/',
    freelance_project: '/project/',
  };
  return paths[item.listingType]
    ? `${paths[item.listingType]}${entityId}`
    : `/listing/${item.id}`;
}

export default function CustomerDashboardScreen({
  dashboard,
  refreshing,
  onRefresh,
  error,
}) {
  const [activeTab, setActiveTab] = useState('home');
  const [searchText, setSearchText] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [serviceResult, setServiceResult] = useState({
    key: null,
    services: [],
    pagination: null,
    page: 1,
    error: null,
  });
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState(null);
  const [locationInput, setLocationInput] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [minPriceFilter, setMinPriceFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [pricingFilter, setPricingFilter] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState('');
  const [providerRoleFilter, setProviderRoleFilter] = useState('');
  const [availableDayFilter, setAvailableDayFilter] = useState('');
  const [minRatingFilter, setMinRatingFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [activeSubcategoryId, setActiveSubcategoryId] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeSection, setActiveSection] = useState('services');
  const [discoveryResult, setDiscoveryResult] = useState({
    loading: false,
    loadingMore: false,
    items: [],
    pagination: null,
    page: 1,
    error: null,
  });
  const [jobTree, setJobTree] = useState([]);
  const [jobCategoryError, setJobCategoryError] = useState(null);
  const [jobFilterValues, setJobFilterValues] = useState({
    categoryId: '',
    subcategoryId: '',
    employmentType: '',
    workMode: '',
    location: '',
    experienceMax: '',
    minSalary: '',
    maxSalary: '',
    skills: '',
    education: '',
    postedWithin: '',
    sort: 'newest',
  });
  const [jobFilters, setJobFilters] = useState({});
  const [projectTree, setProjectTree] = useState([]);
  const [projectCategoryError, setProjectCategoryError] = useState(null);
  const [projectFilterValues, setProjectFilterValues] = useState({
    categoryId: '',
    subcategoryId: '',
    minBudget: '',
    maxBudget: '',
    deadline: '',
    location: '',
    workMode: '',
    skills: '',
    sort: 'newest',
  });
  const [projectFilters, setProjectFilters] = useState({});
  const [professionalFilterValues, setProfessionalFilterValues] = useState({
    category: '',
    skill: '',
    location: '',
    minExperience: '',
    maxExperience: '',
    sort: 'newest',
  });
  const [professionalFilters, setProfessionalFilters] = useState({});
  const [businessFilterValues, setBusinessFilterValues] = useState({
    category: '',
    location: '',
    sort: 'newest',
  });
  const [businessFilters, setBusinessFilters] = useState({});
  const [homeDiscovery, setHomeDiscovery] = useState({
    items: [],
    loading: true,
    error: null,
  });
  const [homeRecommendations, setHomeRecommendations] = useState({
    items: [],
    loading: true,
    error: null,
  });
  const [myApplications, setMyApplications] = useState([]);
  const [myApplicationsLoading, setMyApplicationsLoading] = useState(false);
  const [myApplicationsError, setMyApplicationsError] = useState(null);
  const [productTree, setProductTree] = useState([]);
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodSubcategoryId, setProdSubcategoryId] = useState('');
  const [prodBrand, setProdBrand] = useState('');
  const [prodSize, setProdSize] = useState('');
  const [prodColor, setProdColor] = useState('');
  const [prodAttributeFilters, setProdAttributeFilters] = useState({});
  const [prodCondition, setProdCondition] = useState('');
  const [prodInStockOnly, setProdInStockOnly] = useState(false);
  const [prodSort, setProdSort] = useState('newest');
  const [prodResult, setProdResult] = useState({
    loading: false,
    loadingMore: false,
    items: [],
    facets: { brands: [], sizes: [], colors: [], conditions: [], filterableKeys: [] },
    pagination: null,
    page: 1,
    error: null,
  });
  const { session } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [favoriteError, setFavoriteError] = useState(null);
  const [enquiryTarget, setEnquiryTarget] = useState(null);
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [enquirySaving, setEnquirySaving] = useState(false);
  const [enquiryError, setEnquiryError] = useState(null);

  useEffect(() => {
    if (!session?.token) return;
    let active = true;
    getFavoritesRequest(session)
      .then((response) => {
        if (active) setFavorites(response.favorites || []);
      })
      .catch((requestError) => {
        if (active) setFavoriteError(requestError?.message || 'Could not load saved listings.');
      });
    return () => {
      active = false;
    };
  }, [refreshKey, session]);

  const toggleFavorite = async (type, id) => {
    if (!session?.token) {
      setFavoriteError('Sign in to save marketplace listings.');
      return;
    }
    const alreadySaved = favorites.some((item) => item.type === type && item.id === id);
    setFavoriteError(null);
    try {
      if (alreadySaved) {
        await removeFavoriteRequest(session, type, id);
        setFavorites((current) => current.filter((item) => !(item.type === type && item.id === id)));
      } else {
        await saveFavoriteRequest(session, type, id);
        setFavorites((current) => [...current, { type, id }]);
      }
    } catch (requestError) {
      setFavoriteError(requestError?.message || 'Could not update saved listings.');
    }
  };

  const submitEnquiry = async () => {
    if (!enquiryTarget || !enquiryMessage.trim()) {
      setEnquiryError('Write a message before sending.');
      return;
    }
    setEnquirySaving(true);
    setEnquiryError(null);
    try {
      await sendEnquiryRequest(session, enquiryTarget.type, enquiryTarget.id, enquiryMessage.trim());
      setEnquiryTarget(null);
      setEnquiryMessage('');
    } catch (requestError) {
      setEnquiryError(requestError?.message || 'Could not send this enquiry.');
    } finally {
      setEnquirySaving(false);
    }
  };

  const renderListingActions = (type, id) => {
    const isSaved = favorites.some((item) => item.type === type && item.id === id);
    return (
      <View style={styles.listingActions}>
        <AppButton
          onPress={() => toggleFavorite(type, id)}
          size="sm"
          title={isSaved ? 'Saved' : 'Save'}
          variant={isSaved ? 'secondary' : 'outline'}
        />
        <AppButton
          onPress={() => {
            setEnquiryTarget({ type, id });
            setEnquiryError(null);
          }}
          size="sm"
          title="Enquire"
        />
      </View>
    );
  };

  useEffect(() => {
    let active = true;
    getCategoriesRequest()
      .then((res) => {
        if (active) {
          setCategories(res.categories || []);
          setCategoryError(null);
        }
      })
      .catch((err) => {
        if (active) setCategoryError(err?.message || 'Could not load service categories.');
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    getMarketplaceCategoryTreeRequest('product')
      .then((res) => {
        if (!active) return;
        const tree = res.tree || [];
        const root = tree.find((n) => n.listingType === 'product' || n.slug === 'shopping-products');
        setProductTree(root?.children?.length ? root.children : tree.filter((n) => n.listingType === 'product'));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const currentProductFilters = useMemo(() => ({
    q: submittedSearch || undefined,
    categoryId: prodCategoryId || undefined,
    subcategoryId: prodSubcategoryId || undefined,
    brand: prodBrand || undefined,
    size: prodSize || undefined,
    color: prodColor || undefined,
    attributeFilters: Object.keys(prodAttributeFilters).length ? prodAttributeFilters : undefined,
    condition: prodCondition || undefined,
    inStock: prodInStockOnly ? 'true' : undefined,
    minPrice: minPriceFilter || undefined,
    maxPrice: maxPriceFilter || undefined,
    sort: prodSort,
    limit: 10,
  }), [
    maxPriceFilter,
    minPriceFilter,
    prodBrand,
    prodAttributeFilters,
    prodCategoryId,
    prodColor,
    prodCondition,
    prodInStockOnly,
    prodSize,
    prodSort,
    prodSubcategoryId,
    submittedSearch,
  ]);

  useEffect(() => {
    if (activeSection !== 'products') return;
    let active = true;
    setProdResult((curr) => ({ ...curr, loading: true, error: null }));
    listProductsRequest({ ...currentProductFilters, page: 1 })
      .then((res) => {
        if (!active) return;
        setProdResult({
          loading: false,
          loadingMore: false,
          items: res.items || res.products || [],
          facets: res.facets || { brands: [], sizes: [], colors: [], conditions: [], filterableKeys: [] },
          pagination: res.pagination || null,
          page: 1,
          error: null,
        });
      })
      .catch((err) => {
        if (!active) return;
        setProdResult((curr) => ({
          ...curr,
          loading: false,
          loadingMore: false,
          error: err?.message || 'Could not load products.',
        }));
      });
    return () => {
      active = false;
    };
  }, [activeSection, currentProductFilters, refreshKey]);

  const loadMoreProducts = async () => {
    if (!prodResult.pagination?.hasMore || prodResult.loadingMore) return;
    const nextPage = (prodResult.page || 1) + 1;
    setProdResult((curr) => ({ ...curr, loadingMore: true }));
    try {
      const res = await listProductsRequest({ ...currentProductFilters, page: nextPage });
      setProdResult((curr) => ({
        ...curr,
        loadingMore: false,
        items: [...curr.items, ...(res.items || res.products || [])],
        pagination: res.pagination || null,
        page: nextPage,
      }));
    } catch (err) {
      setProdResult((curr) => ({
        ...curr,
        loadingMore: false,
        error: err?.message || 'Could not load more products.',
      }));
    }
  };

  useEffect(() => {
    let active = true;
    getMarketplaceCategoryTreeRequest('job')
      .then((response) => {
        if (active) setJobTree(response.tree || []);
      })
      .catch((err) => {
        if (active) setJobCategoryError(err?.message || 'Could not load job categories.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getMarketplaceCategoryTreeRequest('project')
      .then((response) => {
        if (active) setProjectTree(response.tree || response.categories || []);
      })
      .catch((err) => {
        if (active) setProjectCategoryError(err?.message || 'Could not load project categories.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'home') return undefined;
    let active = true;
    setHomeDiscovery((current) => ({ ...current, loading: true, error: null }));
    discoverListingsRequest({ page: 1, limit: 8 })
      .then((response) => {
        if (active) {
          setHomeDiscovery({
            items: response.listings || [],
            loading: false,
            error: null,
          });
        }
      })
      .catch((requestError) => {
        if (active) {
          setHomeDiscovery((current) => ({
            ...current,
            loading: false,
            error: requestError?.message || 'Could not load recent marketplace listings.',
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [activeTab, refreshKey]);

  useEffect(() => {
    if (activeTab !== 'home') return undefined;
    let active = true;
    getMarketplaceRecommendationsRequest(session, { location: location || undefined, limit: 8 })
      .then((response) => {
        if (active) {
          setHomeRecommendations({
            items: response.items || [],
            loading: false,
            error: null,
          });
        }
      })
      .catch((requestError) => {
        if (active) {
          setHomeRecommendations((current) => ({
            ...current,
            loading: false,
            error: requestError?.message || 'Could not load recommendations.',
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [activeTab, location, refreshKey, session]);

  useEffect(() => {
    if (activeSection === 'services' || activeSection === 'products') return;
    let active = true;
    setDiscoveryResult({
      loading: true,
      loadingMore: false,
      items: [],
      pagination: null,
      page: 1,
      error: null,
    });
    const request = {
      professionals: listProfessionalsRequest,
      jobs: listJobsRequest,
      projects: listProjectsRequest,
      businesses: listBusinessesRequest,
    }[activeSection];
    const requestParams = {
      q: submittedSearch || undefined,
      page: 1,
      limit: 10,
      ...(activeSection === 'professionals' ? professionalFilters : {}),
      ...(activeSection === 'businesses' ? businessFilters : {}),
      ...(activeSection === 'jobs' ? { ...jobFilters, page: 1, limit: 10 } : {}),
      ...(activeSection === 'projects' ? { ...projectFilters, page: 1, limit: 10 } : {}),
    };
    Promise.resolve(request ? request(requestParams) : { items: [] })
      .then((response) => {
        if (!active) return;
        const items =
          response.professionals || response.jobs ||
          response.projects || response.businesses || [];
        setDiscoveryResult({
          loading: false,
          loadingMore: false,
          items,
          pagination: response.pagination || null,
          page: 1,
          error: null,
        });
      })
      .catch((err) => {
        if (active) setDiscoveryResult({
          loading: false,
          loadingMore: false,
          items: [],
          pagination: null,
          page: 1,
          error: err?.message || 'Could not load marketplace listings.',
        });
      });
    return () => {
      active = false;
    };
  }, [
    activeSection,
    businessFilters,
    jobFilters,
    professionalFilters,
    projectFilters,
    refreshKey,
    submittedSearch,
  ]);

  useEffect(() => {
    if (activeSection !== 'jobs' || !session?.token) return undefined;
    let active = true;
    setMyApplicationsLoading(true);
    setMyApplicationsError(null);
    getMyApplicationsRequest(session)
      .then((response) => {
        if (active) setMyApplications(response.items || []);
      })
      .catch((err) => {
        if (active) setMyApplicationsError(err?.message || 'Could not load your applications.');
      })
      .finally(() => {
        if (active) setMyApplicationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeSection, refreshKey, session]);

  const loadMoreJobs = async () => {
    if (!discoveryResult.pagination?.hasMore || discoveryResult.loadingMore) return;
    const nextPage = (discoveryResult.page || 1) + 1;
    setDiscoveryResult((current) => ({ ...current, loadingMore: true }));
    try {
      const response = await listJobsRequest({
        q: submittedSearch || undefined,
        ...jobFilters,
        page: nextPage,
        limit: 10,
      });
      setDiscoveryResult((current) => ({
        ...current,
        loadingMore: false,
        items: [...current.items, ...(response.jobs || response.items || [])],
        pagination: response.pagination || null,
        page: nextPage,
      }));
    } catch (err) {
      setDiscoveryResult((current) => ({
        ...current,
        loadingMore: false,
        error: err?.message || 'Could not load more jobs.',
      }));
    }
  };

  const loadMoreProjects = async () => {
    if (!discoveryResult.pagination?.hasMore || discoveryResult.loadingMore) return;
    const nextPage = (discoveryResult.page || 1) + 1;
    setDiscoveryResult((current) => ({ ...current, loadingMore: true }));
    try {
      const response = await listProjectsRequest({
        q: submittedSearch || undefined,
        ...projectFilters,
        page: nextPage,
        limit: 10,
      });
      setDiscoveryResult((current) => ({
        ...current,
        loadingMore: false,
        items: [...current.items, ...(response.projects || response.items || [])],
        pagination: response.pagination || null,
        page: nextPage,
      }));
    } catch (err) {
      setDiscoveryResult((current) => ({
        ...current,
        loadingMore: false,
        error: err?.message || 'Could not load more projects.',
      }));
    }
  };

  const loadMorePeopleOrBusinesses = async () => {
    if (!discoveryResult.pagination?.hasMore || discoveryResult.loadingMore) return;
    const nextPage = (discoveryResult.page || 1) + 1;
    const request = activeSection === 'professionals'
      ? listProfessionalsRequest
      : listBusinessesRequest;
    setDiscoveryResult((current) => ({ ...current, loadingMore: true }));
    try {
      const response = await request({
        q: submittedSearch || undefined,
        ...(activeSection === 'professionals' ? professionalFilters : businessFilters),
        page: nextPage,
        limit: 10,
      });
      const items = activeSection === 'professionals'
        ? response.professionals || response.items || []
        : response.businesses || response.items || [];
      setDiscoveryResult((current) => ({
        ...current,
        loadingMore: false,
        items: [...current.items, ...items],
        pagination: response.pagination || null,
        page: nextPage,
      }));
    } catch (requestError) {
      setDiscoveryResult((current) => ({
        ...current,
        loadingMore: false,
        error: requestError?.message || 'Could not load more listings.',
      }));
    }
  };

  const currentServiceFilters = useMemo(() => ({
    q: submittedSearch || undefined,
    categoryId: activeCategoryId || undefined,
    subcategoryId: activeSubcategoryId || undefined,
    location: locationFilter.trim() || undefined,
    minPrice: minPriceFilter || undefined,
    maxPrice: maxPriceFilter || undefined,
    pricingType: pricingFilter || undefined,
    deliveryMethod: deliveryFilter || undefined,
    providerRole: providerRoleFilter || undefined,
    availableDay: availableDayFilter !== '' ? availableDayFilter : undefined,
    minRating: minRatingFilter || undefined,
    verified: verifiedOnly ? true : undefined,
    sort,
  }), [
    activeCategoryId,
    activeSubcategoryId,
    availableDayFilter,
    deliveryFilter,
    locationFilter,
    maxPriceFilter,
    minPriceFilter,
    minRatingFilter,
    pricingFilter,
    providerRoleFilter,
    sort,
    submittedSearch,
    verifiedOnly,
  ]);
  const serviceQueryKey = JSON.stringify({ ...currentServiceFilters, refreshKey });
  const currentServiceResult = serviceResult.key === serviceQueryKey ? serviceResult : null;
  const liveServices = currentServiceResult?.services || [];
  const pagination = currentServiceResult?.pagination || null;
  const page = currentServiceResult?.page || 1;
  const servicesError = currentServiceResult?.error || null;
  const servicesLoading = currentServiceResult === null;

  useEffect(() => {
    let active = true;
    listServicesRequest({ ...currentServiceFilters, page: 1, limit: 8 })
      .then((res) => {
        if (!active) return;
        setServiceResult({
          key: serviceQueryKey,
          services: res.services || [],
          pagination: res.pagination || null,
          page: 1,
          error: null,
        });
      })
      .catch((err) => {
        if (active) {
          setServiceResult({
            key: serviceQueryKey,
            services: [],
            pagination: null,
            page: 1,
            error: err?.message || 'Could not load services.',
          });
        }
      })
    return () => {
      active = false;
    };
  }, [
    currentServiceFilters,
    serviceQueryKey,
  ]);

  const { profile, user, profileCompletion, verificationStatus } = dashboard;
  const profileName = profile.fullName || user.name;
  const location = [profile.city, profile.state].filter(Boolean).join(', ');
  const activeCategory = categories.find((category) => category.id === activeCategoryId);
  const jobCategoryRoot = jobTree.find((category) =>
    category.listingType === 'job' || category.slug === 'jobs-employment'
  );
  const jobCategories = jobCategoryRoot?.children?.length
    ? jobCategoryRoot.children
    : jobTree.filter((category) => category.listingType === 'job');
  const projectCategoryRoot = projectTree.find((category) =>
    category.listingType === 'project' || category.slug === 'freelance-projects'
  );
  const projectCategories = projectCategoryRoot?.children?.length
    ? projectCategoryRoot.children
    : projectTree.filter((category) => category.listingType === 'project');
  const activeProjectCategory = projectCategories.find((category) =>
    category.id === projectFilterValues.categoryId
  );
  const activeJobCategory = jobCategories.find((category) =>
    category.id === jobFilterValues.categoryId
  );
  const editProfile = () => router.push('/role-profile/customer');

  const submitSearch = () => setSubmittedSearch(searchText.trim());
  const refreshMarketplace = useCallback(async () => {
    setRefreshKey((current) => current + 1);
    await onRefresh?.();
  }, [onRefresh]);
  const loadMoreServices = async () => {
    if (!pagination?.hasMore || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const response = await listServicesRequest({
        ...currentServiceFilters,
        page: nextPage,
        limit: 8,
      });
      setServiceResult((current) => current.key === serviceQueryKey
        ? {
          ...current,
          services: [...current.services, ...(response.services || [])],
          pagination: response.pagination || null,
          page: nextPage,
          error: null,
        }
        : current);
    } catch (err) {
      setServiceResult((current) => current.key === serviceQueryKey
        ? { ...current, error: err?.message || 'Could not load more services.' }
        : current);
    } finally {
      setLoadingMore(false);
    }
  };
  const openCategory = (category) => {
    setActiveCategoryId(category.id);
    setActiveSubcategoryId('');
    setSubmittedSearch('');
    setSearchText('');
    setActiveTab('explore');
  };

  const renderSearch = () => (
    <SearchBar
      onChangeText={(value) => {
        setSearchText(value);
      }}
      onSubmit={() => {
        if (activeTab === 'home') {
          router.push({
            pathname: '/marketplace-search',
            params: { q: searchText.trim() },
          });
        } else {
          submitSearch();
        }
      }}
      placeholder="Search across services, products, people, and work..."
      value={searchText}
    />
  );

  const renderJobFilters = () => (
    <View style={styles.jobFilters}>
      {jobCategoryError ? <InlineAlert message={jobCategoryError} variant="error" /> : null}
      <AppText variant="label" color={colors.text}>Category</AppText>
      <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
        <AppPressable
          onPress={() => setJobFilterValues((current) => ({ ...current, categoryId: '', subcategoryId: '' }))}
          style={[styles.filterChip, !jobFilterValues.categoryId && styles.filterChipActive]}
        >
          <AppText variant="caption" color={!jobFilterValues.categoryId ? colors.inverse : colors.textSecondary}>
            All categories
          </AppText>
        </AppPressable>
        {jobCategories.map((category) => (
          <AppPressable
            key={category.id}
            onPress={() => setJobFilterValues((current) => ({
              ...current,
              categoryId: category.id,
              subcategoryId: '',
            }))}
            style={[styles.filterChip, jobFilterValues.categoryId === category.id && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={jobFilterValues.categoryId === category.id ? colors.inverse : colors.textSecondary}
            >
              {category.name}
            </AppText>
          </AppPressable>
        ))}
      </ScrollView>

      {activeJobCategory?.children?.length ? (
        <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
          <AppPressable
            onPress={() => setJobFilterValues((current) => ({ ...current, subcategoryId: '' }))}
            style={[styles.filterChip, !jobFilterValues.subcategoryId && styles.filterChipActive]}
          >
            <AppText variant="caption" color={!jobFilterValues.subcategoryId ? colors.inverse : colors.textSecondary}>
              All {activeJobCategory.name}
            </AppText>
          </AppPressable>
          {activeJobCategory.children.map((subcategory) => (
            <AppPressable
              key={subcategory.id}
              onPress={() => setJobFilterValues((current) => ({ ...current, subcategoryId: subcategory.id }))}
              style={[styles.filterChip, jobFilterValues.subcategoryId === subcategory.id && styles.filterChipActive]}
            >
              <AppText
                variant="caption"
                color={jobFilterValues.subcategoryId === subcategory.id ? colors.inverse : colors.textSecondary}
              >
                {subcategory.name}
              </AppText>
            </AppPressable>
          ))}
        </ScrollView>
      ) : null}

      <AppText variant="label" color={colors.text}>Employment Type</AppText>
      <View style={styles.filterRow}>
        {[
          ['', 'Any'],
          ['full-time', 'Full-time'],
          ['part-time', 'Part-time'],
          ['contract', 'Contract'],
          ['temporary', 'Temporary'],
          ['internship', 'Internship'],
        ].map(([value, label]) => (
          <AppPressable
            key={`employment-${value || 'any'}`}
            onPress={() => setJobFilterValues((current) => ({ ...current, employmentType: value }))}
            style={[styles.filterChip, jobFilterValues.employmentType === value && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={jobFilterValues.employmentType === value ? colors.inverse : colors.textSecondary}
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>

      <AppText variant="label" color={colors.text}>Work Mode</AppText>
      <View style={styles.filterRow}>
        {[
          ['', 'Any'],
          ['on-site', 'On-site'],
          ['remote', 'Remote'],
          ['hybrid', 'Hybrid'],
        ].map(([value, label]) => (
          <AppPressable
            key={`mode-${value || 'any'}`}
            onPress={() => setJobFilterValues((current) => ({ ...current, workMode: value }))}
            style={[styles.filterChip, jobFilterValues.workMode === value && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={jobFilterValues.workMode === value ? colors.inverse : colors.textSecondary}
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>

      <AppInput
        label="Location"
        onChangeText={(value) => setJobFilterValues((current) => ({ ...current, location: value }))}
        placeholder="City, state, or country"
        value={jobFilterValues.location}
      />
      <View style={styles.priceRange}>
        <AppInput
          style={styles.flexInput}
          keyboardType="number-pad"
          label="Max required experience (years)"
          onChangeText={(value) => setJobFilterValues((current) => ({ ...current, experienceMax: value }))}
          value={jobFilterValues.experienceMax}
        />
      </View>
      <View style={styles.priceRange}>
        <AppInput
          style={styles.flexInput}
          keyboardType="number-pad"
          label="Minimum salary"
          onChangeText={(value) => setJobFilterValues((current) => ({ ...current, minSalary: value }))}
          value={jobFilterValues.minSalary}
        />
        <AppInput
          style={styles.flexInput}
          keyboardType="number-pad"
          label="Maximum salary"
          onChangeText={(value) => setJobFilterValues((current) => ({ ...current, maxSalary: value }))}
          value={jobFilterValues.maxSalary}
        />
      </View>
      <AppInput
        label="Skills (comma separated)"
        onChangeText={(value) => setJobFilterValues((current) => ({ ...current, skills: value }))}
        value={jobFilterValues.skills}
      />
      <AppInput
        label="Education / qualification"
        onChangeText={(value) => setJobFilterValues((current) => ({ ...current, education: value }))}
        value={jobFilterValues.education}
      />
      <AppText variant="label" color={colors.text}>Posted</AppText>
      <View style={styles.filterRow}>
        {[
          ['', 'Any time'],
          ['24h', '24 hours'],
          ['7d', '7 days'],
          ['30d', '30 days'],
        ].map(([value, label]) => (
          <AppPressable
            key={`posted-${value || 'any'}`}
            onPress={() => setJobFilterValues((current) => ({ ...current, postedWithin: value }))}
            style={[styles.filterChip, jobFilterValues.postedWithin === value && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={jobFilterValues.postedWithin === value ? colors.inverse : colors.textSecondary}
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>
      <AppText variant="label" color={colors.text}>Sort</AppText>
      <View style={styles.filterRow}>
        {[
          ['newest', 'Newest'],
          ['salary_desc', 'Salary: high to low'],
          ['salary_asc', 'Salary: low to high'],
        ].map(([value, label]) => (
          <AppPressable
            key={`sort-${value}`}
            onPress={() => setJobFilterValues((current) => ({ ...current, sort: value }))}
            style={[styles.filterChip, jobFilterValues.sort === value && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={jobFilterValues.sort === value ? colors.inverse : colors.textSecondary}
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>
      <View style={styles.jobFilterActions}>
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => setJobFilters(Object.fromEntries(
            Object.entries(jobFilterValues).filter(([, value]) => value !== '')
          ))}
          title="Apply Filters"
        />
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => {
            const cleared = { ...jobFilterValues };
            Object.keys(cleared).forEach((key) => {
              cleared[key] = key === 'sort' ? 'newest' : '';
            });
            setJobFilterValues(cleared);
            setJobFilters({});
            setSubmittedSearch('');
            setSearchText('');
          }}
          title="Clear"
          variant="outline"
        />
      </View>
    </View>
  );

  const renderProjectFilters = () => (
    <View style={styles.jobFilters}>
      {projectCategoryError ? <InlineAlert message={projectCategoryError} variant="error" /> : null}
      <AppText variant="label" color={colors.text}>Category</AppText>
      <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
        <AppPressable
          onPress={() => setProjectFilterValues((current) => ({ ...current, categoryId: '', subcategoryId: '' }))}
          style={[styles.filterChip, !projectFilterValues.categoryId && styles.filterChipActive]}
        >
          <AppText variant="caption" color={!projectFilterValues.categoryId ? colors.inverse : colors.textSecondary}>
            All categories
          </AppText>
        </AppPressable>
        {projectCategories.map((category) => (
          <AppPressable
            key={category.id}
            onPress={() => setProjectFilterValues((current) => ({
              ...current,
              categoryId: category.id,
              subcategoryId: '',
            }))}
            style={[styles.filterChip, projectFilterValues.categoryId === category.id && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={projectFilterValues.categoryId === category.id ? colors.inverse : colors.textSecondary}
            >
              {category.name}
            </AppText>
          </AppPressable>
        ))}
      </ScrollView>
      {activeProjectCategory?.children?.length ? (
        <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
          <AppPressable
            onPress={() => setProjectFilterValues((current) => ({ ...current, subcategoryId: '' }))}
            style={[styles.filterChip, !projectFilterValues.subcategoryId && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={!projectFilterValues.subcategoryId ? colors.inverse : colors.textSecondary}
            >
              All subcategories
            </AppText>
          </AppPressable>
          {activeProjectCategory.children.map((subcategory) => (
            <AppPressable
              key={subcategory.id}
              onPress={() => setProjectFilterValues((current) => ({ ...current, subcategoryId: subcategory.id }))}
              style={[styles.filterChip, projectFilterValues.subcategoryId === subcategory.id && styles.filterChipActive]}
            >
              <AppText
                variant="caption"
                color={projectFilterValues.subcategoryId === subcategory.id ? colors.inverse : colors.textSecondary}
              >
                {subcategory.name}
              </AppText>
            </AppPressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.priceRange}>
        <AppInput
          style={styles.flexInput}
          keyboardType="decimal-pad"
          label="Minimum budget"
          onChangeText={(value) => setProjectFilterValues((current) => ({ ...current, minBudget: value }))}
          value={projectFilterValues.minBudget}
        />
        <AppInput
          style={styles.flexInput}
          keyboardType="decimal-pad"
          label="Maximum budget"
          onChangeText={(value) => setProjectFilterValues((current) => ({ ...current, maxBudget: value }))}
          value={projectFilterValues.maxBudget}
        />
      </View>
      <AppInput
        label="Project deadline by"
        onChangeText={(value) => setProjectFilterValues((current) => ({ ...current, deadline: value }))}
        placeholder="YYYY-MM-DD"
        value={projectFilterValues.deadline}
      />
      <AppInput
        label="Location"
        onChangeText={(value) => setProjectFilterValues((current) => ({ ...current, location: value }))}
        placeholder="City or region"
        value={projectFilterValues.location}
      />
      <AppText variant="label" color={colors.text}>Work mode</AppText>
      <View style={styles.filterRow}>
        {[
          ['', 'Any'],
          ['remote', 'Remote'],
          ['on-site', 'On-site'],
          ['hybrid', 'Hybrid'],
        ].map(([value, label]) => (
          <AppPressable
            key={`project-mode-${value || 'any'}`}
            onPress={() => setProjectFilterValues((current) => ({ ...current, workMode: value }))}
            style={[styles.filterChip, projectFilterValues.workMode === value && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={projectFilterValues.workMode === value ? colors.inverse : colors.textSecondary}
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>
      <AppInput
        label="Skills (comma separated)"
        onChangeText={(value) => setProjectFilterValues((current) => ({ ...current, skills: value }))}
        value={projectFilterValues.skills}
      />
      <View style={styles.filterRow}>
        {[
          ['newest', 'Newest'],
          ['budget_asc', 'Lowest budget'],
          ['budget_desc', 'Highest budget'],
        ].map(([value, label]) => (
          <AppPressable
            key={`project-sort-${value}`}
            onPress={() => setProjectFilterValues((current) => ({ ...current, sort: value }))}
            style={[styles.filterChip, projectFilterValues.sort === value && styles.filterChipActive]}
          >
            <AppText
              color={projectFilterValues.sort === value ? colors.inverse : colors.textSecondary}
              variant="caption"
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>
      <View style={styles.jobFilterActions}>
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => setProjectFilters(Object.fromEntries(
            Object.entries(projectFilterValues).filter(([, value]) => value !== '')
          ))}
          title="Apply Filters"
        />
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => {
            const cleared = { ...projectFilterValues };
            Object.keys(cleared).forEach((key) => { cleared[key] = key === 'sort' ? 'newest' : ''; });
            setProjectFilterValues(cleared);
            setProjectFilters({});
          }}
          title="Clear"
          variant="outline"
        />
      </View>
    </View>
  );

  const renderProfessionalFilters = () => (
    <View style={styles.jobFilters}>
      <AppInput
        label="Category"
        onChangeText={(value) => setProfessionalFilterValues((current) => ({ ...current, category: value }))}
        placeholder="e.g. Design"
        value={professionalFilterValues.category}
      />
      <AppInput
        label="Skill"
        onChangeText={(value) => setProfessionalFilterValues((current) => ({ ...current, skill: value }))}
        placeholder="e.g. Figma"
        value={professionalFilterValues.skill}
      />
      <AppInput
        label="Location"
        onChangeText={(value) => setProfessionalFilterValues((current) => ({ ...current, location: value }))}
        placeholder="City or region"
        value={professionalFilterValues.location}
      />
      <View style={styles.priceRange}>
        <AppInput
          containerStyle={styles.flexInput}
          keyboardType="number-pad"
          label="Minimum experience (years)"
          onChangeText={(value) => setProfessionalFilterValues((current) => ({ ...current, minExperience: value }))}
          value={professionalFilterValues.minExperience}
        />
        <AppInput
          containerStyle={styles.flexInput}
          keyboardType="number-pad"
          label="Maximum experience (years)"
          onChangeText={(value) => setProfessionalFilterValues((current) => ({ ...current, maxExperience: value }))}
          value={professionalFilterValues.maxExperience}
        />
      </View>
      <View style={styles.filterRow}>
        {[
          ['newest', 'Newest'],
          ['name_asc', 'Name A–Z'],
          ['experience_desc', 'Most experienced'],
        ].map(([value, label]) => (
          <AppPressable
            key={`professional-sort-${value}`}
            onPress={() => setProfessionalFilterValues((current) => ({ ...current, sort: value }))}
            style={[styles.filterChip, professionalFilterValues.sort === value && styles.filterChipActive]}
          >
            <AppText
              color={professionalFilterValues.sort === value ? colors.inverse : colors.textSecondary}
              variant="caption"
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>
      <View style={styles.jobFilterActions}>
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => setProfessionalFilters(Object.fromEntries(
            Object.entries(professionalFilterValues).filter(([, value]) => value !== '')
          ))}
          title="Apply Filters"
        />
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => {
            const cleared = { category: '', skill: '', location: '', minExperience: '', maxExperience: '', sort: 'newest' };
            setProfessionalFilterValues(cleared);
            setProfessionalFilters({});
          }}
          title="Clear"
          variant="outline"
        />
      </View>
    </View>
  );

  const renderBusinessFilters = () => (
    <View style={styles.jobFilters}>
      <AppInput
        label="Category"
        onChangeText={(value) => setBusinessFilterValues((current) => ({ ...current, category: value }))}
        placeholder="Business category"
        value={businessFilterValues.category}
      />
      <AppInput
        label="Location"
        onChangeText={(value) => setBusinessFilterValues((current) => ({ ...current, location: value }))}
        placeholder="City or region"
        value={businessFilterValues.location}
      />
      <View style={styles.filterRow}>
        {[
          ['newest', 'Newest'],
          ['name_asc', 'Name A–Z'],
        ].map(([value, label]) => (
          <AppPressable
            key={`business-sort-${value}`}
            onPress={() => setBusinessFilterValues((current) => ({ ...current, sort: value }))}
            style={[styles.filterChip, businessFilterValues.sort === value && styles.filterChipActive]}
          >
            <AppText
              color={businessFilterValues.sort === value ? colors.inverse : colors.textSecondary}
              variant="caption"
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </View>
      <View style={styles.jobFilterActions}>
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => setBusinessFilters(Object.fromEntries(
            Object.entries(businessFilterValues).filter(([, value]) => value !== '')
          ))}
          title="Apply Filters"
        />
        <AppButton
          containerStyle={styles.flexInput}
          onPress={() => {
            const cleared = { category: '', location: '', sort: 'newest' };
            setBusinessFilterValues(cleared);
            setBusinessFilters({});
          }}
          title="Clear"
          variant="outline"
        />
      </View>
    </View>
  );

  const renderCategoryRail = () => (
    <ScrollView
      contentContainerStyle={styles.categoryRail}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {categories.map((category) => (
        <AppPressable
          key={category.id}
          onPress={() => openCategory(category)}
          scaleTo={0.96}
          style={styles.categoryCard}
        >
          <ImageBackground
            source={category.imageUrl
              ? { uri: category.imageUrl }
              : dashboardArtworkForCategory(category.name)}
            style={styles.categoryImg}
            imageStyle={styles.categoryImgRadius}
          >
            <LinearGradient
              colors={['transparent', 'rgba(17, 24, 39, 0.82)']}
              style={styles.categoryGradient}
            >
              <AppText variant="label" color={colors.inverse} numberOfLines={2}>
                {category.name}
              </AppText>
            </LinearGradient>
          </ImageBackground>
        </AppPressable>
      ))}
    </ScrollView>
  );

  const renderPopularServices = () => (
    <ScrollView
      contentContainerStyle={styles.popularRail}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {liveServices.slice(0, 4).map((service) => (
        <View key={service.id} style={styles.popularCard}>
          <ServiceListingCard
            compact
            onPress={() => router.push(`/service/${service.id}`)}
            service={service}
          />
        </View>
      ))}
    </ScrollView>
  );

  const renderRecentListings = () => (
    <DashboardSection
      actionLabel="Explore all"
      onAction={() => setActiveTab('explore')}
      subtitle="Recent public listings from every marketplace section"
      title="Recently Published"
    >
      {homeDiscovery.loading ? <LoadingState message="Loading recent listings..." /> : null}
      {homeDiscovery.error ? <InlineAlert message={homeDiscovery.error} variant="error" /> : null}
      {!homeDiscovery.loading && !homeDiscovery.error && !homeDiscovery.items.length ? (
        <DashboardModuleCard
          icon="view-grid-outline"
          subtitle="New public listings will appear here when available."
          title="No recent listings"
        />
      ) : null}
      {homeDiscovery.items.length ? (
        <ScrollView
          contentContainerStyle={styles.recentListings}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {homeDiscovery.items.slice(0, 4).map((item) => (
            <View key={item.id} style={styles.recentListingCard}>
              <MarketplaceListingCard
                compact
                item={item}
                onPress={() => router.push(marketplaceDetailPath(item))}
                type={item.listingType}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </DashboardSection>
  );

  const renderRecommendedListings = () => (
    <DashboardSection
      actionLabel="Explore all"
      onAction={() => setActiveTab('explore')}
      subtitle="Based on recent searches and your location"
      title="Recommended for You"
    >
      {homeRecommendations.loading ? <LoadingState message="Finding recommendations..." /> : null}
      {homeRecommendations.error ? (
        <InlineAlert message={homeRecommendations.error} variant="error" />
      ) : null}
      {!homeRecommendations.loading && !homeRecommendations.error && !homeRecommendations.items.length ? (
        <DashboardModuleCard
          icon="lightbulb-outline"
          subtitle="Explore listings or try a search to get personalized recommendations."
          title="No recommendations yet"
        />
      ) : null}
      {homeRecommendations.items.length ? (
        <ScrollView
          contentContainerStyle={styles.recentListings}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {homeRecommendations.items.slice(0, 4).map((item) => (
            <View key={item.id} style={styles.recentListingCard}>
              <MarketplaceListingCard
                compact
                item={item}
                onPress={() => router.push(marketplaceDetailPath(item))}
                type={item.listingType}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </DashboardSection>
  );

  const openServices = () => {
    setActiveSection('services');
    setActiveTab('explore');
  };

  const renderEditorialHero = () => (
    <AppPressable
      accessibilityRole="button"
      accessibilityLabel="Explore services"
      onPress={openServices}
      scaleTo={0.985}
      style={styles.heroWrap}
    >
      <ImageBackground
        source={dashboardAssets.customer}
        style={styles.heroImage}
        imageStyle={styles.heroImageRadius}
      >
        <LinearGradient
          colors={['rgba(11, 59, 46, 0.15)', 'rgba(7, 42, 32, 0.88)']}
          style={styles.heroGradient}
        >
          <View style={styles.heroBadge}>
            <AppText variant="overline" color={colors.inverse}>
              CURATED MARKETPLACE
            </AppText>
          </View>
          <View style={styles.heroBottom}>
            <AppText variant="h2" color={colors.inverse} style={styles.heroTitle}>
              Trusted experts,{'\n'}right at your door
            </AppText>
            <AppText variant="body" color="rgba(255,255,255,0.85)" style={styles.heroSub}>
              Find local experts for home, design, and wellness.
            </AppText>
            <View style={styles.heroCtaRow}>
              <AppButton
                title="Explore Services"
                onPress={openServices}
                size="sm"
                variant="cta"
              />
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>
    </AppPressable>
  );

  const renderHome = () => (
    <View style={styles.stack}>
      <DashboardGreeting
        location={location || 'Add your location'}
        name={profileName}
        onAction={() => setActiveTab('profile')}
        onLocationPress={editProfile}
        profileAsset={profile.profilePhoto}
        subtitle="GOOD TO SEE YOU"
      />

      {renderSearch()}
      {renderEditorialHero()}

      <DashboardSection subtitle="Explore all 6 marketplace areas" title="Discover">
        <ScrollView
          contentContainerStyle={styles.discoveryRail}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {discoverySections.map((sec) => (
            <AppPressable
              key={sec.key}
              onPress={() => {
                setActiveSection(sec.key);
                setActiveTab('explore');
              }}
              scaleTo={0.95}
              style={styles.discoveryChip}
            >
              <View style={styles.discoveryIconWrap}>
                <AppIcon name={sec.icon} size={20} color={colors.primary} />
              </View>
              <AppText variant="caption" color={colors.text} numberOfLines={1}>
                {sec.label}
              </AppText>
            </AppPressable>
          ))}
        </ScrollView>
      </DashboardSection>

      {renderRecentListings()}
      {renderRecommendedListings()}

      <DashboardSection
        actionLabel="See all"
        onAction={() => setActiveTab('explore')}
        subtitle="Browse by specialty"
        title="Service Categories"
      >
        {renderCategoryRail()}
      </DashboardSection>

      <DashboardSection
        actionLabel="Explore"
        onAction={() => setActiveTab('explore')}
        subtitle="Newly published by service providers"
        title="Available Services"
      >
        {servicesLoading ? <LoadingState message="Loading services..." /> : null}
        {servicesError ? <InlineAlert message={servicesError} variant="error" /> : null}
        {!servicesLoading && !servicesError && !liveServices.length ? (
          <DashboardModuleCard
            actionLabel="Explore categories"
            icon="briefcase-search-outline"
            onAction={() => setActiveTab('explore')}
            subtitle="Published service listings will appear here."
            title="No services available yet"
          />
        ) : null}
        {liveServices.length ? renderPopularServices() : null}
      </DashboardSection>
    </View>
  );

  const renderExplore = () => (
    <View style={styles.stack}>
      {renderSearch()}
      <ScrollView
        contentContainerStyle={styles.filterRail}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {[
          ['services', 'Services'],
          ['products', 'Shopping & Products'],
          ['professionals', 'Professionals & Freelancers'],
          ['jobs', 'Jobs & Employment'],
          ['projects', 'Freelance Projects'],
          ['businesses', 'Businesses & Shops'],
        ].map(([key, label]) => (
          <AppPressable
            key={key}
            onPress={() => setActiveSection(key)}
            style={[styles.filterChip, activeSection === key && styles.filterChipActive]}
          >
            <AppText
              variant="caption"
              color={activeSection === key ? colors.inverse : colors.textSecondary}
            >
              {label}
            </AppText>
          </AppPressable>
        ))}
      </ScrollView>
      {activeSection === 'products' ? (
        <View style={styles.stack}>
          <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
            <AppPressable
              onPress={() => {
                setProdCategoryId('');
                setProdSubcategoryId('');
                setProdBrand('');
                setProdSize('');
                setProdColor('');
                setProdAttributeFilters({});
                setProdCondition('');
              }}
              style={[styles.filterChip, !prodCategoryId && styles.filterChipActive]}
            >
              <AppText variant="caption" color={!prodCategoryId ? colors.inverse : colors.textSecondary}>
                All Shopping
              </AppText>
            </AppPressable>
            {productTree.map((cat) => (
              <AppPressable
                key={`prod-cat-${cat.id}`}
                onPress={() => {
                  setProdCategoryId(cat.id);
                  setProdSubcategoryId('');
                  setProdBrand('');
                  setProdSize('');
                  setProdColor('');
                  setProdAttributeFilters({});
                  setProdCondition('');
                }}
                style={[styles.filterChip, prodCategoryId === cat.id && styles.filterChipActive]}
              >
                <AppText variant="caption" color={prodCategoryId === cat.id ? colors.inverse : colors.textSecondary}>
                  {cat.name}
                </AppText>
              </AppPressable>
            ))}
          </ScrollView>

          {(() => {
            const activeProdCat = productTree.find((c) => c.id === prodCategoryId);
            if (!activeProdCat?.children?.length) return null;
            return (
              <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
                <AppPressable
                  onPress={() => setProdSubcategoryId('')}
                  style={[styles.filterChip, !prodSubcategoryId && styles.filterChipActive]}
                >
                  <AppText variant="caption" color={!prodSubcategoryId ? colors.inverse : colors.textSecondary}>
                    All {activeProdCat.name}
                  </AppText>
                </AppPressable>
                {activeProdCat.children.map((sub) => (
                  <AppPressable
                    key={`prod-sub-${sub.id}`}
                    onPress={() => setProdSubcategoryId(sub.id)}
                    style={[styles.filterChip, prodSubcategoryId === sub.id && styles.filterChipActive]}
                  >
                    <AppText variant="caption" color={prodSubcategoryId === sub.id ? colors.inverse : colors.textSecondary}>
                      {sub.name}
                    </AppText>
                  </AppPressable>
                ))}
              </ScrollView>
            );
          })()}

          <View style={styles.priceRange}>
            <AppInput
              keyboardType="decimal-pad"
              label="Min price"
              onChangeText={setMinPriceInput}
              placeholder="0"
              value={minPriceInput}
            />
            <AppInput
              keyboardType="decimal-pad"
              label="Max price"
              onChangeText={setMaxPriceInput}
              placeholder="Any"
              value={maxPriceInput}
            />
          </View>
          <AppButton
            title="Apply search and price"
            onPress={() => {
              setSubmittedSearch(searchText.trim());
              setMinPriceFilter(minPriceInput.trim());
              setMaxPriceFilter(maxPriceInput.trim());
            }}
            variant="secondary"
          />

          <View style={styles.filterRow}>
            <AppPressable
              onPress={() => setProdInStockOnly((v) => !v)}
              style={[styles.filterChip, prodInStockOnly && styles.filterChipActive]}
            >
              <AppText variant="caption" color={prodInStockOnly ? colors.inverse : colors.textSecondary}>
                In stock only
              </AppText>
            </AppPressable>
            {[
              { key: 'newest', label: 'Newest' },
              { key: 'price_asc', label: 'Price: Low-High' },
              { key: 'price_desc', label: 'Price: High-Low' },
              { key: 'discount', label: 'Best Discount' },
            ].map((item) => (
              <AppPressable
                key={`psort-${item.key}`}
                onPress={() => setProdSort(item.key)}
                style={[styles.filterChip, prodSort === item.key && styles.filterChipActive]}
              >
                <AppText variant="caption" color={prodSort === item.key ? colors.inverse : colors.textSecondary}>
                  {item.label}
                </AppText>
              </AppPressable>
            ))}
          </View>

          {prodResult.facets?.brands?.length > 0 ? (
            <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
              <AppPressable
                onPress={() => setProdBrand('')}
                style={[styles.filterChip, !prodBrand && styles.filterChipActive]}
              >
                <AppText variant="caption" color={!prodBrand ? colors.inverse : colors.textSecondary}>
                  All Brands
                </AppText>
              </AppPressable>
              {prodResult.facets.brands.map((brandName) => (
                <AppPressable
                  key={`brand-${brandName}`}
                  onPress={() => setProdBrand(prodBrand === brandName ? '' : brandName)}
                  style={[styles.filterChip, prodBrand === brandName && styles.filterChipActive]}
                >
                  <AppText variant="caption" color={prodBrand === brandName ? colors.inverse : colors.textSecondary}>
                    {brandName}
                  </AppText>
                </AppPressable>
              ))}
            </ScrollView>
          ) : null}

          {(prodResult.facets?.filterableKeys || []).includes('size') && prodResult.facets?.sizes?.length > 0 ? (
            <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
              <AppPressable
                onPress={() => setProdSize('')}
                style={[styles.filterChip, !prodSize && styles.filterChipActive]}
              >
                <AppText variant="caption" color={!prodSize ? colors.inverse : colors.textSecondary}>
                  Any Size
                </AppText>
              </AppPressable>
              {prodResult.facets.sizes.map((sz) => (
                <AppPressable
                  key={`size-${sz}`}
                  onPress={() => setProdSize(prodSize === sz ? '' : sz)}
                  style={[styles.filterChip, prodSize === sz && styles.filterChipActive]}
                >
                  <AppText variant="caption" color={prodSize === sz ? colors.inverse : colors.textSecondary}>
                    Size: {sz}
                  </AppText>
                </AppPressable>
              ))}
            </ScrollView>
          ) : null}

          {(prodResult.facets?.filterableKeys || []).includes('color') && prodResult.facets?.colors?.length > 0 ? (
            <ScrollView contentContainerStyle={styles.filterRail} horizontal showsHorizontalScrollIndicator={false}>
              <AppPressable
                onPress={() => setProdColor('')}
                style={[styles.filterChip, !prodColor && styles.filterChipActive]}
              >
                <AppText variant="caption" color={!prodColor ? colors.inverse : colors.textSecondary}>
                  Any Color
                </AppText>
              </AppPressable>
              {prodResult.facets.colors.map((clr) => (
                <AppPressable
                  key={`color-${clr}`}
                  onPress={() => setProdColor(prodColor === clr ? '' : clr)}
                  style={[styles.filterChip, prodColor === clr && styles.filterChipActive]}
                >
                  <AppText variant="caption" color={prodColor === clr ? colors.inverse : colors.textSecondary}>
                    {clr}
                  </AppText>
                </AppPressable>
              ))}
            </ScrollView>
          ) : null}

          {(prodResult.facets?.attributes || [])
            .filter((attribute) => !['brand', 'size', 'color'].includes(attribute.key) && attribute.values?.length)
            .map((attribute) => (
              <ScrollView
                key={`attribute-filter-${attribute.key}`}
                contentContainerStyle={styles.filterRail}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {attribute.values.map((value) => {
                  const selected = prodAttributeFilters[attribute.key] === value;
                  return (
                    <AppPressable
                      key={`${attribute.key}-${value}`}
                      onPress={() => setProdAttributeFilters((current) => {
                        const next = { ...current };
                        if (next[attribute.key] === value) delete next[attribute.key];
                        else next[attribute.key] = value;
                        return next;
                      })}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                    >
                      <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>
                        {attribute.label}: {value}
                      </AppText>
                    </AppPressable>
                  );
                })}
              </ScrollView>
            ))}

          {prodResult.facets?.conditions?.length > 0 ? (
            <View style={styles.filterRow}>
              <AppPressable
                onPress={() => setProdCondition('')}
                style={[styles.filterChip, !prodCondition && styles.filterChipActive]}
              >
                <AppText variant="caption" color={!prodCondition ? colors.inverse : colors.textSecondary}>
                  All Conditions
                </AppText>
              </AppPressable>
              {prodResult.facets.conditions.map((cond) => (
                <AppPressable
                  key={`cond-${cond}`}
                  onPress={() => setProdCondition(prodCondition === cond ? '' : cond)}
                  style={[styles.filterChip, prodCondition === cond && styles.filterChipActive]}
                >
                  <AppText variant="caption" color={prodCondition === cond ? colors.inverse : colors.textSecondary}>
                    {cond.replace('_', ' ')}
                  </AppText>
                </AppPressable>
              ))}
            </View>
          ) : null}

          <DashboardSection subtitle="Published products from local & partner shops" title="Shopping & Products">
            {prodResult.loading ? <LoadingState message="Loading products..." /> : null}
            {prodResult.error ? <InlineAlert message={prodResult.error} variant="error" /> : null}
            {!prodResult.loading && !prodResult.error && !prodResult.items.length ? (
              <DashboardModuleCard
                actionLabel="Clear product filters"
                icon="shopping-search-outline"
                onAction={() => {
                  setSearchText('');
                  setSubmittedSearch('');
                  setProdCategoryId('');
                  setProdSubcategoryId('');
                  setProdBrand('');
                  setProdSize('');
                  setProdColor('');
                  setProdAttributeFilters({});
                  setProdCondition('');
                  setProdInStockOnly(false);
                  setMinPriceInput('');
                  setMaxPriceInput('');
                  setMinPriceFilter('');
                  setMaxPriceFilter('');
                }}
                subtitle="Try clearing filters or switching category."
                title="No products match these filters"
              />
            ) : null}
            {!prodResult.loading && prodResult.items.map((prod) => (
              <View key={prod.id} style={styles.discoveryCard}>
                <ProductCard
                  onPress={() => router.push(`/product/${prod.id}`)}
                  product={prod}
                />
                {renderListingActions('product', prod.id)}
              </View>
            ))}
            {prodResult.pagination?.hasMore ? (
              <AppButton
                loading={prodResult.loadingMore}
                onPress={loadMoreProducts}
                title="Load more products"
                variant="secondary"
              />
            ) : null}
          </DashboardSection>
        </View>
      ) : activeSection !== 'services' ? (
        <View style={styles.stack}>
          {activeSection === 'professionals' ? renderProfessionalFilters() : null}
          {activeSection === 'businesses' ? renderBusinessFilters() : null}
          {activeSection === 'jobs' ? renderJobFilters() : null}
          {activeSection === 'projects' ? renderProjectFilters() : null}
          <DashboardSection
            subtitle="Published marketplace discovery"
            title={[
              ['professionals', 'Professionals & Freelancers'],
              ['jobs', 'Jobs & Employment'],
              ['projects', 'Freelance Projects'],
              ['businesses', 'Businesses & Shops'],
            ].find(([key]) => key === activeSection)?.[1] || 'Marketplace'}
          >
            {discoveryResult.loading ? <LoadingState message="Loading listings..." /> : null}
            {discoveryResult.error ? <InlineAlert message={discoveryResult.error} variant="error" /> : null}
            {!discoveryResult.loading && !discoveryResult.error && !discoveryResult.items.length ? (
              <DashboardModuleCard
                icon="store-search-outline"
                subtitle="No published listings match this section yet."
                title="Nothing available yet"
              />
            ) : null}
            {!discoveryResult.loading && discoveryResult.items.map((item) => {
              const type = activeSection === 'professionals' ? 'professional'
                : activeSection === 'jobs' ? 'job'
                  : activeSection === 'projects' ? 'project' : 'business';
              return (
                <View key={item.id} style={styles.discoveryCard}>
                  {type === 'job' ? (
                    <AppPressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/job/${item.id}`)}
                      style={styles.jobCard}
                    >
                      <View style={styles.filterRow}>
                        <Badge label={item.employmentType || 'Employment'} variant="neutral" />
                        <Badge label={item.workMode || 'Work mode'} variant="info" />
                      </View>
                      <AppText variant="h4" color={colors.text}>{item.title}</AppText>
                      <AppText variant="label" color={colors.primary}>
                        {item.employerName || 'Employer'}
                      </AppText>
                      <AppText variant="caption" color={colors.muted}>
                        {[
                          item.categoryName,
                          item.subcategoryName,
                          item.location,
                          item.experienceRequired ||
                            (item.experienceMin !== null && item.experienceMin !== undefined
                              ? `${item.experienceMin}${item.experienceMax !== null && item.experienceMax !== undefined ? `-${item.experienceMax}` : '+'} years`
                              : null),
                        ].filter(Boolean).join(' · ')}
                      </AppText>
                      <AppText variant="subtitle" color={colors.text}>{formatJobSalary(item)}</AppText>
                      {item.createdAt ? (
                        <AppText variant="micro" color={colors.muted}>
                          Posted {new Date(item.createdAt).toLocaleDateString()}
                        </AppText>
                      ) : null}
                      {item.skills?.length ? (
                        <View style={styles.filterRow}>
                          {item.skills.slice(0, 4).map((skill) => (
                            <Badge key={skill} label={skill} variant="neutral" />
                          ))}
                        </View>
                      ) : null}
                      <AppText variant="caption" color={colors.primary}>View job details</AppText>
                    </AppPressable>
                  ) : type === 'project' ? (
                    <AppPressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/project/${item.id}`)}
                      style={styles.jobCard}
                    >
                      <View style={styles.filterRow}>
                        <Badge label={item.budgetType || 'Budget'} variant="neutral" />
                        <Badge label={item.workMode || 'Work mode'} variant="info" />
                      </View>
                      <AppText variant="h4" color={colors.text}>{item.title}</AppText>
                      <AppText variant="label" color={colors.primary}>{item.clientName || 'Client'}</AppText>
                      <AppText variant="caption" color={colors.muted}>
                        {[item.categoryName, item.location, item.deadline ? `Deadline: ${String(item.deadline).slice(0, 10)}` : null]
                          .filter(Boolean).join(' · ')}
                      </AppText>
                      {item.requiredSkills?.length ? (
                        <View style={styles.filterRow}>
                          {item.requiredSkills.slice(0, 5).map((skill) => (
                            <Badge key={skill} label={skill} variant="neutral" />
                          ))}
                        </View>
                      ) : null}
                      <AppText variant="caption" color={colors.primary}>View project details</AppText>
                    </AppPressable>
                  ) : (
                    <MarketplaceListingCard
                      item={item}
                      onPress={() => router.push(`/listing/${item.listingId || item.id}`)}
                      type={type}
                    />
                  )}
                  {type !== 'project' ? renderListingActions(type, item.id) : null}
                </View>
              );
            })}
            {['professionals', 'businesses'].includes(activeSection) && discoveryResult.pagination?.hasMore ? (
              <AppButton
                loading={discoveryResult.loadingMore}
                onPress={loadMorePeopleOrBusinesses}
                title={`Load more ${activeSection}`}
                variant="secondary"
              />
            ) : null}
            {activeSection === 'jobs' && discoveryResult.pagination?.hasMore ? (
              <AppButton
                loading={discoveryResult.loadingMore}
                onPress={loadMoreJobs}
                title="Load more jobs"
                variant="secondary"
              />
            ) : null}
            {activeSection === 'projects' && discoveryResult.pagination?.hasMore ? (
              <AppButton
                loading={discoveryResult.loadingMore}
                onPress={loadMoreProjects}
                title="Load more projects"
                variant="secondary"
              />
            ) : null}
          </DashboardSection>

          {activeSection === 'jobs' && session?.token ? (
            <DashboardSection subtitle="Your submitted applications" title="My Applications">
              {myApplicationsLoading ? <LoadingState message="Loading your applications..." /> : null}
              {myApplicationsError ? <InlineAlert message={myApplicationsError} variant="error" /> : null}
              {!myApplicationsLoading && !myApplicationsError && !myApplications.length ? (
                <DashboardModuleCard
                  icon="file-document-outline"
                  subtitle="Applications you submit to published jobs will appear here."
                  title="No applications yet"
                />
              ) : null}
              {myApplications.map((application) => (
                <View key={application.id} style={styles.jobCard}>
                  <View style={styles.jobApplicationHeader}>
                    <View style={styles.jobApplicationCopy}>
                      <AppText variant="label" color={colors.text}>{application.jobTitle}</AppText>
                      <AppText variant="caption" color={colors.muted}>
                        {[application.employerName, application.jobLocation, application.workMode].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                    <Badge label={application.status} variant="info" />
                  </View>
                  <AppButton
                    onPress={() => router.push(`/job/${application.jobId}`)}
                    size="sm"
                    title="View Job"
                    variant="outline"
                  />
                </View>
              ))}
            </DashboardSection>
          ) : null}
        </View>
      ) : (
        <>
          {categoryError ? (
            <InlineAlert message={categoryError} variant="error" />
          ) : null}
          <ScrollView
            contentContainerStyle={styles.filterRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <AppPressable
              onPress={() => {
                setActiveCategoryId('');
                setActiveSubcategoryId('');
              }}
              style={[styles.filterChip, !activeCategoryId && styles.filterChipActive]}
            >
              <AppText variant="caption" color={!activeCategoryId ? colors.inverse : colors.textSecondary}>
                All categories
              </AppText>
            </AppPressable>
            {categories.map((category) => (
              <AppPressable
                key={`filter-${category.id}`}
                onPress={() => {
                  setActiveCategoryId(category.id);
                  setActiveSubcategoryId('');
                }}
                style={[styles.filterChip, activeCategoryId === category.id && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={activeCategoryId === category.id ? colors.inverse : colors.textSecondary}
                >
                  {category.name}
                </AppText>
              </AppPressable>
            ))}
          </ScrollView>
          {activeCategory?.subcategories?.length ? (
            <ScrollView
              contentContainerStyle={styles.filterRail}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <AppPressable
                onPress={() => setActiveSubcategoryId('')}
                style={[styles.filterChip, !activeSubcategoryId && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={!activeSubcategoryId ? colors.inverse : colors.textSecondary}
                >
                  All {activeCategory.name}
                </AppText>
              </AppPressable>
              {activeCategory.subcategories.map((subcategory) => (
                <AppPressable
                  key={`subcategory-${subcategory.id}`}
                  onPress={() => setActiveSubcategoryId(subcategory.id)}
                  style={[
                    styles.filterChip,
                    activeSubcategoryId === subcategory.id && styles.filterChipActive,
                  ]}
                >
                  <AppText
                    variant="caption"
                    color={activeSubcategoryId === subcategory.id ? colors.inverse : colors.textSecondary}
                  >
                    {subcategory.name}
                  </AppText>
                </AppPressable>
              ))}
            </ScrollView>
          ) : null}
          <AppInput
            label="Service area"
            onChangeText={setLocationInput}
            placeholder="City, state, or area"
            value={locationInput}
          />
          <View style={styles.priceRange}>
            <AppInput
              keyboardType="decimal-pad"
              label="Minimum price"
              onChangeText={setMinPriceInput}
              placeholder="0"
              value={minPriceInput}
            />
            <AppInput
              keyboardType="decimal-pad"
              label="Maximum price"
              onChangeText={setMaxPriceInput}
              placeholder="Any"
              value={maxPriceInput}
            />
          </View>
          <AppButton
            title="Apply search and filters"
            onPress={() => {
              setSubmittedSearch(searchText.trim());
              setLocationFilter(locationInput.trim());
              setMinPriceFilter(minPriceInput.trim());
              setMaxPriceFilter(maxPriceInput.trim());
            }}
            variant="secondary"
          />
          <View style={styles.filterRow}>
            {[
              { key: '', label: 'Any price' },
              { key: 'fixed', label: 'Fixed' },
              { key: 'hourly', label: 'Hourly' },
              { key: 'per_visit', label: 'Per visit' },
              { key: 'quote_required', label: 'Quote required' },
              { key: 'negotiable', label: 'Negotiable' },
            ].map((item) => (
              <AppPressable
                key={item.key || 'any-price'}
                onPress={() => setPricingFilter(item.key)}
                style={[styles.filterChip, pricingFilter === item.key && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={pricingFilter === item.key ? colors.inverse : colors.textSecondary}
                >
                  {item.label}
                </AppText>
              </AppPressable>
            ))}
          </View>
          <View style={styles.filterRow}>
            {[
              { key: '', label: 'All providers' },
              { key: 'professional', label: 'Individual' },
              { key: 'business', label: 'Business' },
            ].map((item) => (
              <AppPressable
                key={item.key || 'all-providers'}
                onPress={() => setProviderRoleFilter(item.key)}
                style={[styles.filterChip, providerRoleFilter === item.key && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={providerRoleFilter === item.key ? colors.inverse : colors.textSecondary}
                >
                  {item.label}
                </AppText>
              </AppPressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
            {[
              { key: '', label: 'Any day' },
              { key: '1', label: 'Mon' },
              { key: '2', label: 'Tue' },
              { key: '3', label: 'Wed' },
              { key: '4', label: 'Thu' },
              { key: '5', label: 'Fri' },
              { key: '6', label: 'Sat' },
              { key: '0', label: 'Sun' },
            ].map((item) => (
              <AppPressable
                key={item.key || 'any-day'}
                onPress={() => setAvailableDayFilter(item.key)}
                style={[styles.filterChip, availableDayFilter === item.key && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={availableDayFilter === item.key ? colors.inverse : colors.textSecondary}
                >
                  {item.label}
                </AppText>
              </AppPressable>
            ))}
          </ScrollView>
          <View style={styles.filterRow}>
            {[
              { key: '', label: 'Any rating' },
              { key: '4', label: '4★ & up' },
              { key: '3', label: '3★ & up' },
            ].map((item) => (
              <AppPressable
                key={item.key || 'any-rating'}
                onPress={() => setMinRatingFilter(item.key)}
                style={[styles.filterChip, minRatingFilter === item.key && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={minRatingFilter === item.key ? colors.inverse : colors.textSecondary}
                >
                  {item.label}
                </AppText>
              </AppPressable>
            ))}
            <AppPressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: verifiedOnly }}
              onPress={() => setVerifiedOnly((current) => !current)}
              style={[styles.filterChip, verifiedOnly && styles.filterChipActive]}
            >
              <AppText
                variant="caption"
                color={verifiedOnly ? colors.inverse : colors.textSecondary}
              >
                Verified only
              </AppText>
            </AppPressable>
          </View>
          <View style={styles.filterRow}>
            {[
              { key: '', label: 'Any delivery' },
              { key: 'customer_location', label: 'At your location' },
              { key: 'provider_location', label: 'At provider' },
              { key: 'online', label: 'Online' },
              { key: 'remote', label: 'Remote' },
              { key: 'hybrid', label: 'Hybrid' },
            ].map((item) => (
              <AppPressable
                key={item.key || 'any-delivery'}
                onPress={() => setDeliveryFilter(item.key)}
                style={[styles.filterChip, deliveryFilter === item.key && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={deliveryFilter === item.key ? colors.inverse : colors.textSecondary}
                >
                  {item.label}
                </AppText>
              </AppPressable>
            ))}
          </View>
          <View style={styles.filterRow}>
            {[
              { key: 'newest', label: 'Recently added' },
              { key: 'price_asc', label: 'Price: low to high' },
              { key: 'price_desc', label: 'Price: high to low' },
              { key: 'rating_desc', label: 'Highest rated' },
            ].map((item) => (
              <AppPressable
                key={item.key}
                onPress={() => setSort(item.key)}
                style={[styles.filterChip, sort === item.key && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  color={sort === item.key ? colors.inverse : colors.textSecondary}
                >
                  {item.label}
                </AppText>
              </AppPressable>
            ))}
          </View>
          {servicesError ? <InlineAlert message={servicesError} variant="error" /> : null}
          {servicesLoading ? <LoadingState message="Finding available services..." /> : null}
          {!servicesLoading && liveServices.length ? (
            <DashboardSection subtitle="Published service listings" title="Available Services">
              <View style={styles.stack}>
                {liveServices.map((svc) => (
                  <View key={svc.id} style={styles.discoveryCard}>
                    <ServiceListingCard
                      onPress={() => router.push(`/service/${svc.id}`)}
                      service={svc}
                    />
                    {renderListingActions('service', svc.id)}
                  </View>
                ))}
              </View>
            </DashboardSection>
          ) : null}
          {!servicesLoading && !liveServices.length ? (
            <DashboardModuleCard
              actionLabel="Clear filters"
              icon="briefcase-search-outline"
              onAction={() => {
                setSearchText('');
                setSubmittedSearch('');
                setActiveCategoryId('');
                setActiveSubcategoryId('');
                setLocationFilter('');
                setLocationInput('');
                setMinPriceInput('');
                setMaxPriceInput('');
                setMinPriceFilter('');
                setMaxPriceFilter('');
                setPricingFilter('');
                setDeliveryFilter('');
                setProviderRoleFilter('');
                setAvailableDayFilter('');
                setMinRatingFilter('');
                setVerifiedOnly(false);
              }}
              subtitle="Try a different search or category. Service listings appear here after a provider publishes them."
              title={submittedSearch ? `No services for "${submittedSearch}"` : 'No services match these filters'}
            />
          ) : null}
          {pagination?.hasMore ? (
            <AppButton
              title="Load more services"
              loading={loadingMore}
              onPress={loadMoreServices}
              variant="secondary"
            />
          ) : null}
          <DashboardSection
            actionLabel={categoriesLoading ? undefined : 'Reset'}
            onAction={() => setActiveCategoryId('')}
            subtitle="Categories from the marketplace catalog"
            title="Browse Categories"
          >
            {categoriesLoading ? <LoadingState message="Loading categories..." /> : null}
            <View style={styles.grid}>
              {categories.map((category) => (
                <AppPressable
                  key={`grid-${category.id}`}
                  onPress={() => openCategory(category)}
                  scaleTo={0.97}
                  style={styles.gridCard}
                >
                  <Image
                    source={category.imageUrl
                      ? { uri: category.imageUrl }
                      : dashboardArtworkForCategory(category.name)}
                    style={styles.gridImage}
                    resizeMode="cover"
                  />
                  <View style={styles.gridBody}>
                    <AppText variant="label" color={colors.text} numberOfLines={1}>
                      {category.name}
                    </AppText>
                  </View>
                </AppPressable>
              ))}
            </View>
          </DashboardSection>
        </>
      )}
    </View>
  );

  const renderBookings = () => (
    <View style={styles.stack}>
      <DashboardSection subtitle="Active & past requests" title="Your Bookings">
        <DashboardModuleCard
          actionLabel="View enquiries"
          icon="calendar-check-outline"
          onAction={() => router.push('/marketplace-enquiries?view=sent')}
          subtitle="Service bookings are not enabled yet. You can review enquiries you sent."
          title="Bookings not enabled"
        />
      </DashboardSection>
    </View>
  );

  const renderFavorites = () => (
    <View style={styles.stack}>
      <DashboardSection subtitle="Professionals & businesses you saved" title="Saved">
        {favoriteError ? <InlineAlert message={favoriteError} variant="error" /> : null}
        {favorites.map((item) => (
          <View key={`${item.type}-${item.id}`} style={styles.savedRow}>
            <View style={styles.savedCopy}>
              <AppText variant="label" color={colors.text}>{item.type}</AppText>
              <AppText variant="caption" color={colors.muted} numberOfLines={1}>{item.id}</AppText>
            </View>
            <AppButton
              onPress={() => toggleFavorite(item.type, item.id)}
              size="sm"
              title="Remove"
              variant="outline"
            />
          </View>
        ))}
        {!favorites.length ? (
          <DashboardModuleCard
            actionLabel="Discover Pros"
            icon="heart-outline"
            onAction={() => setActiveTab('explore')}
            subtitle="Save published services, shops, professionals, jobs, or projects."
            title="No saved listings yet"
          />
        ) : null}
      </DashboardSection>
    </View>
  );

  const renderProfile = () => (
    <View style={styles.stack}>
      <DashboardProfileCard
        asset={profile.profilePhoto}
        badge="Customer"
        name={profileName}
        onEdit={editProfile}
        subtitle={location || user.email}
      />
      <DashboardProfileStatus
        completion={profileCompletion}
        onEdit={editProfile}
        verificationStatus={verificationStatus}
      />
      <DashboardSection title="Account Details">
        <View style={styles.detailsCard}>
          <DashboardDetail label="Full Name" value={profile.fullName || user.name} />
          <DashboardDetail label="City" value={profile.city} />
          <DashboardDetail label="State" value={profile.state} />
          <DashboardDetail label="Email" value={user.email} />
          <DashboardDetail label="Phone" value={user.phone} />
        </View>
      </DashboardSection>
      <DashboardAccountTypeSwitcher currentRole="customer" />
    </View>
  );

  const tabContent = {
    home: renderHome,
    explore: renderExplore,
    bookings: renderBookings,
    favorites: renderFavorites,
    profile: renderProfile,
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      error={error}
      onRefresh={refreshMarketplace}
      onTabChange={setActiveTab}
      refreshing={refreshing}
      roleTitle="Customer"
      tabs={tabs}
    >
      {(tabContent[activeTab] || renderHome)()}
      <AppModal
        actions={(
          <>
            <AppButton
              loading={enquirySaving}
              onPress={submitEnquiry}
              title="Send enquiry"
            />
            <AppButton
              disabled={enquirySaving}
              onPress={() => setEnquiryTarget(null)}
              title="Cancel"
              variant="outline"
            />
          </>
        )}
        description="Your message will be sent to the listing owner."
        icon="message-outline"
        onClose={() => setEnquiryTarget(null)}
        title="Send an enquiry"
        visible={Boolean(enquiryTarget)}
      >
        {enquiryError ? <InlineAlert message={enquiryError} variant="error" /> : null}
        <AppInput
          label="Message"
          maxLength={3000}
          multiline
          onChangeText={setEnquiryMessage}
          placeholder="Tell the listing owner what you need."
          value={enquiryMessage}
        />
      </AppModal>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
  discoveryCard: {
    gap: spacing.sm,
  },
  jobFilters: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  flexInput: {
    flex: 1,
  },
  jobFilterActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  jobCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  jobApplicationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  jobApplicationCopy: {
    flex: 1,
    gap: 2,
  },
  productImage: {
    width: '100%',
    height: 180,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
  },
  listingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  savedCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  heroWrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  heroImage: {
    width: '100%',
    height: 224,
    justifyContent: 'space-between',
  },
  heroImageRadius: {
    borderRadius: radii.xl,
  },
  heroGradient: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  heroBottom: {
    gap: spacing.xs,
  },
  heroTitle: {
    letterSpacing: -0.5,
  },
  heroSub: {
    maxWidth: '88%',
  },
  heroCtaRow: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  categoryRail: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  discoveryRail: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  discoveryChip: {
    alignItems: 'center',
    gap: 6,
    width: 74,
  },
  discoveryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCard: {
    width: 128,
    height: 158,
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  categoryImg: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  categoryImgRadius: {
    borderRadius: radii.lg,
  },
  categoryGradient: {
    padding: spacing.sm,
    paddingTop: spacing.xl,
  },
  popularRail: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  recentListings: {
    gap: spacing.sm,
    paddingRight: spacing.md,
    paddingBottom: spacing.xs,
  },
  recentListingCard: {
    width: 280,
  },
  popularCard: {
    width: 248,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  filterRail: {
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  priceRange: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  popularImage: {
    width: '100%',
    height: 136,
  },
  popularBody: {
    padding: spacing.md,
    gap: 4,
  },
  popularMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridCard: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: 108,
  },
  gridBody: {
    padding: spacing.sm,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
});
