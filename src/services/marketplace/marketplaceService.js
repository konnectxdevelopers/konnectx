import { apiRequest } from '../api/apiClient';

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, key === 'attributeFilters' && typeof value === 'object'
        ? JSON.stringify(value)
        : String(value));
    }
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

function authHeaders(session) {
  if (!session?.token) {
    throw new Error('Sign in is required to manage services.');
  }
  return { Authorization: `Bearer ${session.token}` };
}

function jsonBody(value) {
  return JSON.stringify(value);
}

export async function getCategoriesRequest() {
  return apiRequest('/api/v1/services/categories');
}

export async function getCategoryRequest(id) {
  return apiRequest(`/api/v1/services/categories/${encodeURIComponent(id)}`);
}

export async function getSubcategoriesRequest(categoryId) {
  return apiRequest(
    `/api/v1/services/categories/${encodeURIComponent(categoryId)}/subcategories`
  );
}

export async function getServiceCategoryAttributesRequest(categoryId) {
  return apiRequest(
    `/api/v1/services/categories/${encodeURIComponent(categoryId)}/attributes`
  );
}

export async function listServicesRequest(params = {}) {
  return apiRequest(`/api/v1/services${buildQuery(params)}`);
}

export async function getServiceDetailRequest(id) {
  return apiRequest(`/api/v1/services/${encodeURIComponent(id)}`);
}

export async function getProfessionalServicesRequest(id, params = {}) {
  return apiRequest(
    `/api/v1/professionals/${encodeURIComponent(id)}/services${buildQuery(params)}`
  );
}

export async function getBusinessServicesRequest(id, params = {}) {
  return apiRequest(
    `/api/v1/businesses/${encodeURIComponent(id)}/services${buildQuery(params)}`
  );
}

export async function getMyServicesRequest(session, params = {}) {
  return apiRequest(`/api/v1/services/my-services${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function createServiceRequest(session, payload) {
  return apiRequest('/api/v1/services', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function updateServiceRequest(session, id, payload) {
  return apiRequest(`/api/v1/services/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function updateServiceStatusRequest(session, id, status) {
  return apiRequest(`/api/v1/services/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: authHeaders(session),
    body: jsonBody({ status }),
  });
}

export async function deleteServiceRequest(session, id) {
  return apiRequest(`/api/v1/services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  });
}

export async function attachServiceMediaRequest(session, serviceId, mediaAssetId, mediaType) {
  return apiRequest(`/api/v1/services/${encodeURIComponent(serviceId)}/media`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ mediaAssetId, mediaType }),
  });
}

export async function deleteServiceMediaRequest(session, serviceId, mediaId) {
  return apiRequest(
    `/api/v1/services/${encodeURIComponent(serviceId)}/media/${encodeURIComponent(mediaId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(session),
    }
  );
}

export async function getMarketplaceSectionsRequest() {
  return apiRequest('/api/v1/marketplace/sections');
}

export async function getMarketplaceCategoryTreeRequest(section) {
  return apiRequest(`/api/v1/categories/tree${buildQuery({ section })}`);
}

export async function listProductsRequest(params = {}) {
  return apiRequest(`/api/v1/marketplace/products${buildQuery(params)}`);
}

export async function createProductRequest(session, payload) {
  return apiRequest('/api/v1/marketplace/products', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function listJobsRequest(params = {}) {
  return apiRequest(`/api/v1/marketplace/jobs${buildQuery(params)}`);
}

export async function createJobRequest(session, payload) {
  return apiRequest('/api/v1/marketplace/jobs', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function listProjectsRequest(params = {}) {
  return apiRequest(`/api/v1/marketplace/projects${buildQuery(params)}`);
}

export async function createProjectRequest(session, payload) {
  return apiRequest('/api/v1/marketplace/projects', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function listProfessionalsRequest(params = {}) {
  return apiRequest(`/api/v1/marketplace/professionals${buildQuery(params)}`);
}

export async function listBusinessesRequest(params = {}) {
  return apiRequest(`/api/v1/marketplace/businesses${buildQuery(params)}`);
}

export async function getMyMarketplaceListingsRequest(session, type) {
  return apiRequest(`/api/v1/marketplace/my-listings${buildQuery({ type })}`, {
    headers: authHeaders(session),
  });
}

export async function updateMarketplaceListingRequest(session, type, id, payload) {
  return apiRequest(`/api/v1/marketplace/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function archiveMarketplaceListingRequest(session, type, id) {
  if (!['products', 'jobs', 'projects'].includes(type)) {
    throw new Error('Unsupported marketplace listing type.');
  }
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({}),
  });
}

export async function getMyPortfolioRequest(session) {
  return apiRequest('/api/v1/marketplace/my-portfolio', { headers: authHeaders(session) });
}

export async function createPortfolioItemRequest(session, payload) {
  return apiRequest('/api/v1/marketplace/portfolio', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function getMySkillsRequest(session) {
  return apiRequest('/api/v1/marketplace/my-skills', { headers: authHeaders(session) });
}

export async function saveMySkillsRequest(session, skills) {
  return apiRequest('/api/v1/marketplace/my-skills', {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody({ skills }),
  });
}

export async function updateBusinessCategoriesRequest(session, categoryIds) {
  return apiRequest('/api/v1/marketplace/business/categories', {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody({ categoryIds }),
  });
}

export async function getBusinessCategoriesRequest(session) {
  return apiRequest('/api/v1/marketplace/business/categories', {
    headers: authHeaders(session),
  });
}

export async function getFavoritesRequest(session) {
  return apiRequest('/api/v1/marketplace/favorites', { headers: authHeaders(session) });
}

export async function saveFavoriteRequest(session, type, id) {
  return apiRequest('/api/v1/marketplace/favorites', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ type, id }),
  });
}

export async function removeFavoriteRequest(session, type, id) {
  return apiRequest(
    `/api/v1/marketplace/favorites/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: authHeaders(session) }
  );
}

export async function sendEnquiryRequest(session, type, id, message) {
  return apiRequest('/api/v1/marketplace/enquiries', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ type, id, message }),
  });
}

export async function listEnquiriesRequest(session, view) {
  return apiRequest(`/api/v1/marketplace/enquiries${buildQuery({ view })}`, {
    headers: authHeaders(session),
  });
}

export async function updateEnquiryRequest(session, id, status) {
  return apiRequest(`/api/v1/marketplace/enquiries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(session),
    body: jsonBody({ status }),
  });
}

export async function attachMarketplaceMediaRequest(session, type, id, mediaAssetId) {
  return apiRequest(`/api/v1/marketplace/${encodeURIComponent(type)}/${encodeURIComponent(id)}/media`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ mediaAssetId }),
  });
}

export async function getMarketplaceMediaUrlRequest(id) {
  return apiRequest(`/api/v1/marketplace/media/${encodeURIComponent(id)}/url`);
}

// Phase 7: Unified Marketplace Listing Engine APIs
export async function getListingCapabilitiesRequest(session) {
  return apiRequest('/api/v1/listings/capabilities', {
    headers: authHeaders(session),
  });
}

export async function getMyListingsRequest(session, params = {}) {
  return apiRequest(`/api/v1/listings/mine${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function getMyListingDetailRequest(session, id) {
  return apiRequest(`/api/v1/listings/mine/${encodeURIComponent(id)}`, {
    headers: authHeaders(session),
  });
}

export async function createListingRequest(session, payload) {
  return apiRequest('/api/v1/listings', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function saveListingDraftRequest(session, payload, id = null) {
  if (id) {
    return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/draft`, {
      method: 'PATCH',
      headers: authHeaders(session),
      body: jsonBody(payload),
    });
  }
  return apiRequest('/api/v1/listings/draft', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function updateListingRequest(session, id, payload) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function previewListingPayloadRequest(session, payload) {
  return apiRequest('/api/v1/listings/preview', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function getSavedListingPreviewRequest(session, id) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/preview`, {
    headers: authHeaders(session),
  });
}

export async function submitListingForReviewRequest(session, id, reason) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/submit-review`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ ...(reason ? { reason } : {}) }),
  });
}

export async function publishListingRequest(session, id, reason) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ ...(reason ? { reason } : {}) }),
  });
}

export async function pauseListingRequest(session, id, reason) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ ...(reason ? { reason } : {}) }),
  });
}

export async function resumeListingRequest(session, id, reason) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ ...(reason ? { reason } : {}) }),
  });
}

export async function archiveListingRequest(session, id, reason) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ ...(reason ? { reason } : {}) }),
  });
}

export async function getListingHistoryRequest(session, id) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}/history`, {
    headers: authHeaders(session),
  });
}

export async function attachListingMediaRequest(session, listingId, payload) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(listingId)}/media`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function reorderListingMediaRequest(session, listingId, payload) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(listingId)}/media/reorder`, {
    method: 'PATCH',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function deleteListingMediaRequest(session, listingId, mediaId) {
  return apiRequest(
    `/api/v1/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(session),
    }
  );
}

export async function discoverListingsRequest(params = {}) {
  return apiRequest(`/api/v1/listings${buildQuery(params)}`);
}

export async function discoverSectionListingsRequest(type, params = {}) {
  return apiRequest(`/api/v1/listings/sections/${encodeURIComponent(type)}${buildQuery(params)}`);
}

export async function getPublicListingDetailRequest(id) {
  return apiRequest(`/api/v1/listings/${encodeURIComponent(id)}`);
}

// Phase 9: Business Shop & Product Catalogue APIs
export async function getBusinessShopRequest(session) {
  return apiRequest('/api/v1/business/shop', {
    headers: authHeaders(session),
  });
}

export async function updateBusinessShopRequest(session, payload) {
  return apiRequest('/api/v1/business/shop', {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function createShopLocationRequest(session, payload) {
  return apiRequest('/api/v1/business/shop/locations', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function updateShopLocationRequest(session, id, payload) {
  return apiRequest(`/api/v1/business/shop/locations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function deleteShopLocationRequest(session, id) {
  return apiRequest(`/api/v1/business/shop/locations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  });
}

export async function getPublicShopRequest(id) {
  return apiRequest(`/api/v1/marketplace/shops/${encodeURIComponent(id)}`);
}

export async function getProductCategorySchemaRequest(categoryId, subcategoryId) {
  return apiRequest(
    `/api/v1/marketplace/products/categories/${encodeURIComponent(categoryId)}/schema${buildQuery({ subcategoryId })}`
  );
}

export async function getMyProductsRequest(session, params = {}) {
  return apiRequest(`/api/v1/marketplace/my-products${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function getMyProductDetailRequest(session, id) {
  return apiRequest(`/api/v1/marketplace/my-products/${encodeURIComponent(id)}`, {
    headers: authHeaders(session),
  });
}

export async function updateProductRequest(session, id, payload) {
  return apiRequest(`/api/v1/marketplace/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function transitionProductStatusRequest(session, id, action, reason) {
  return apiRequest(`/api/v1/marketplace/products/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ action, ...(reason ? { reason } : {}) }),
  });
}

export async function addProductVariantRequest(session, productId, payload) {
  return apiRequest(`/api/v1/marketplace/products/${encodeURIComponent(productId)}/variants`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function updateProductVariantRequest(session, productId, variantId, payload) {
  return apiRequest(
    `/api/v1/marketplace/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(session),
      body: jsonBody(payload),
    }
  );
}

export async function deleteProductVariantRequest(session, productId, variantId) {
  return apiRequest(
    `/api/v1/marketplace/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(session),
    }
  );
}

export async function adjustProductInventoryRequest(session, productId, payload) {
  return apiRequest(`/api/v1/marketplace/products/${encodeURIComponent(productId)}/inventory`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function getProductInventoryHistoryRequest(session, productId) {
  return apiRequest(`/api/v1/marketplace/products/${encodeURIComponent(productId)}/inventory`, {
    headers: authHeaders(session),
  });
}

export async function getPublicProductDetailRequest(id) {
  return apiRequest(`/api/v1/marketplace/products/${encodeURIComponent(id)}`);
}

// Phase 10: Jobs, Employment & Recruitment APIs
export async function getMyJobsRequest(session, params = {}) {
  return apiRequest(`/api/v1/marketplace/my-jobs${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function getMyJobDetailRequest(session, id) {
  return apiRequest(`/api/v1/marketplace/my-jobs/${encodeURIComponent(id)}`, {
    headers: authHeaders(session),
  });
}

export async function updateJobRequest(session, id, payload) {
  return apiRequest(`/api/v1/marketplace/jobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function transitionJobStatusRequest(session, id, action, reason) {
  return apiRequest(`/api/v1/marketplace/jobs/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ action, ...(reason ? { reason } : {}) }),
  });
}

export async function getPublicJobDetailRequest(session, id) {
  return apiRequest(`/api/v1/marketplace/jobs/${encodeURIComponent(id)}`, {
    ...(session?.token ? { headers: authHeaders(session) } : {}),
  });
}

export async function applyToJobRequest(session, jobId, payload) {
  return apiRequest(`/api/v1/marketplace/jobs/${encodeURIComponent(jobId)}/apply`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function getMyApplicationsRequest(session) {
  return apiRequest('/api/v1/marketplace/my-applications', {
    headers: authHeaders(session),
  });
}

export async function getEmployerApplicationsRequest(session, params = {}) {
  return apiRequest(`/api/v1/marketplace/employer/applications${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function getJobApplicationsRequest(session, jobId, params = {}) {
  return apiRequest(`/api/v1/marketplace/jobs/${encodeURIComponent(jobId)}/applications${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function updateApplicationStatusRequest(session, applicationId, payload) {
  return apiRequest(`/api/v1/marketplace/applications/${encodeURIComponent(applicationId)}`, {
    method: 'PATCH',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function getApplicationAttachmentUrlRequest(session, applicationId, attachmentId) {
  return apiRequest(
    `/api/v1/marketplace/applications/${encodeURIComponent(applicationId)}/attachments/${encodeURIComponent(attachmentId)}/url`,
    { headers: authHeaders(session) }
  );
}

// Phase 11: Freelance Projects & Proposal Management APIs
export async function getMyProjectsRequest(session, params = {}) {
  return apiRequest(`/api/v1/marketplace/my-projects${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function getMyProjectDetailRequest(session, id) {
  return apiRequest(`/api/v1/marketplace/my-projects/${encodeURIComponent(id)}`, {
    headers: authHeaders(session),
  });
}

export async function getMyProjectAttachmentUrlRequest(session, projectId, attachmentId) {
  return apiRequest(
    `/api/v1/marketplace/my-projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}/url`,
    { headers: authHeaders(session) }
  );
}

export async function updateProjectRequest(session, id, payload) {
  return apiRequest(`/api/v1/marketplace/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function transitionProjectStatusRequest(session, id, action, reason) {
  return apiRequest(`/api/v1/marketplace/projects/${encodeURIComponent(id)}/transition`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ action, ...(reason ? { reason } : {}) }),
  });
}

export async function getPublicProjectDetailRequest(session, id) {
  return apiRequest(`/api/v1/marketplace/projects/${encodeURIComponent(id)}`, {
    ...(session?.token ? { headers: authHeaders(session) } : {}),
  });
}

export async function getPublicProjectAttachmentUrlRequest(session, projectId, attachmentId) {
  return apiRequest(
    `/api/v1/marketplace/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}/url`,
    { headers: authHeaders(session) }
  );
}

export async function submitProposalRequest(session, projectId, payload) {
  return apiRequest(`/api/v1/marketplace/projects/${encodeURIComponent(projectId)}/proposals`, {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function getMyProposalsRequest(session) {
  return apiRequest('/api/v1/marketplace/my-proposals', {
    headers: authHeaders(session),
  });
}

export async function getOwnerProposalsRequest(session, params = {}) {
  return apiRequest(`/api/v1/marketplace/owner/proposals${buildQuery(params)}`, {
    headers: authHeaders(session),
  });
}

export async function updateProposalStatusRequest(session, proposalId, payload) {
  return apiRequest(`/api/v1/marketplace/proposals/${encodeURIComponent(proposalId)}`, {
    method: 'PATCH',
    headers: authHeaders(session),
    body: jsonBody(payload),
  });
}

export async function getProposalAttachmentUrlRequest(session, proposalId, attachmentId) {
  return apiRequest(
    `/api/v1/marketplace/proposals/${encodeURIComponent(proposalId)}/attachments/${encodeURIComponent(attachmentId)}/url`,
    { headers: authHeaders(session) }
  );
}

// Phase 13: Unified Marketplace Search, Filter Metadata & Recommendations
export async function globalMarketplaceSearchRequest(params = {}) {
  return apiRequest(`/api/v1/customer/marketplace/search${buildQuery(params)}`);
}

export async function getSearchSuggestionsRequest(q, type) {
  return apiRequest(`/api/v1/customer/marketplace/search/suggestions${buildQuery({ q, type })}`);
}

export async function getSearchFilterMetadataRequest(type) {
  return apiRequest(`/api/v1/customer/marketplace/search/filters${buildQuery({ type })}`);
}

export async function getSearchHistoryRequest(session) {
  return apiRequest('/api/v1/customer/marketplace/search/history', {
    headers: authHeaders(session),
  });
}

export async function saveSearchHistoryRequest(session, query, listingType) {
  return apiRequest('/api/v1/customer/marketplace/search/history', {
    method: 'POST',
    headers: authHeaders(session),
    body: jsonBody({ query, ...(listingType ? { listingType } : {}) }),
  });
}

export async function deleteSearchHistoryItemRequest(session, id) {
  return apiRequest(`/api/v1/customer/marketplace/search/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(session),
  });
}

export async function clearSearchHistoryRequest(session) {
  return apiRequest('/api/v1/customer/marketplace/search/history', {
    method: 'DELETE',
    headers: authHeaders(session),
  });
}

export async function getMarketplaceRecommendationsRequest(session, params = {}) {
  return apiRequest(`/api/v1/customer/marketplace/recommendations${buildQuery(params)}`, {
    ...(session?.token ? { headers: authHeaders(session) } : {}),
  });
}
