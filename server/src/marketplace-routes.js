import { randomUUID } from 'node:crypto';
import { registerMarketplaceDiscoveryRoutes } from './marketplace-discovery-routes.js';
import { syncMarketplaceListing, syncMarketplaceListingStatus } from './marketplace-listings.js';
import { createPrivateReadUrl, deletePrivateObject } from './storage.js';
import {
  getModerationPolicy,
  normalizePackagesOrAddons,
  recordStatusHistory,
  requiresReviewForType,
  validateOwnerTransition,
} from './listing-engine.js';
import {
  loadServiceCategoryRules,
  loadServiceCategoryRulesMap,
  validateServiceCategoryRules,
} from './service-category-rules.js';

const VALID_PROVIDER_ROLES = new Set(['professional', 'business']);
const VALID_STATUSES = new Set([
  'draft',
  'pending_review',
  'published',
  'rejected',
  'paused',
  'archived',
  'inactive',
]);
const VALID_PRICING_TYPES = new Set([
  'fixed',
  'hourly',
  'per_visit',
  'per_day',
  'negotiable',
  'starting_from',
  'quote_required',
]);
const VALID_DELIVERY_METHODS = new Set([
  'customer_location',
  'provider_location',
  'online',
  'remote',
  'hybrid',
]);
const VALID_DURATION_UNITS = new Set(['minutes', 'hours', 'days']);
const PROFILE_TABLES = {
  professional: 'professional_profiles',
  business: 'business_profiles',
};
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    code,
    message,
    ...(details ? { details } : {}),
  });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value, maxLength, fieldName) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    return { error: `${fieldName} must be no more than ${maxLength} characters.` };
  }
  return { value: value.trim() || null };
}

function requiredText(value, maxLength, fieldName) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    return { error: `${fieldName} is required and must be no more than ${maxLength} characters.` };
  }
  return { value: value.trim() };
}

function positiveNumber(value, fieldName, { optional = true } = {}) {
  if (value === undefined || value === null || value === '') {
    return optional ? { value: null } : { error: `${fieldName} is required.` };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000000) {
    return { error: `${fieldName} must be a positive number.` };
  }
  return { value: parsed };
}

function stringList(value, fieldName, { maxItems = 20, maxLength = 100 } = {}) {
  if (value === undefined || value === null) {
    return { value: [] };
  }
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > maxLength)
  ) {
    return { error: `${fieldName} must contain at most ${maxItems} valid text values.` };
  }
  return { value: [...new Set(value.map((item) => item.trim()))] };
}

function normalizeLocations(value) {
  if (value === undefined || value === null) {
    return { value: [] };
  }
  if (!Array.isArray(value) || value.length > 20) {
    return { error: 'Locations must be a list of no more than 20 service areas.' };
  }
  const locations = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      return { error: `Location ${index + 1} is invalid.` };
    }
    const city = requiredText(item.city, 120, 'City');
    const country = optionalText(item.country, 80, 'Country');
    const state = optionalText(item.state, 120, 'State');
    const area = optionalText(item.area, 160, 'Area');
    const radiusKm = item.radiusKm === undefined || item.radiusKm === null || item.radiusKm === ''
      ? { value: null }
      : positiveNumber(item.radiusKm, 'Coverage radius');
    const invalid = city.error || country.error || state.error || area.error || radiusKm.error;
    if (invalid) {
      return { error: `Location ${index + 1}: ${invalid}` };
    }
    locations.push({
      city: city.value,
      country: country.value,
      state: state.value,
      area: area.value,
      radiusKm: radiusKm.value,
    });
  }
  return { value: locations };
}

function normalizeAvailability(value) {
  if (value === undefined || value === null) {
    return { value: [] };
  }
  if (!Array.isArray(value) || value.length > 28) {
    return { error: 'Availability must contain no more than 28 time slots.' };
  }
  const slots = [];
  for (const [index, item] of value.entries()) {
    if (
      !isRecord(item) ||
      !Number.isInteger(Number(item.dayOfWeek)) ||
      Number(item.dayOfWeek) < 0 ||
      Number(item.dayOfWeek) > 6 ||
      !TIME_PATTERN.test(item.startTime || '') ||
      !TIME_PATTERN.test(item.endTime || '') ||
      item.endTime <= item.startTime
    ) {
      return { error: `Availability slot ${index + 1} is invalid.` };
    }
    slots.push({
      dayOfWeek: Number(item.dayOfWeek),
      startTime: item.startTime,
      endTime: item.endTime,
      isUnavailable: Boolean(item.isUnavailable),
    });
  }
  return { value: slots };
}

function normalizeService(input, { allowStatus = false } = {}) {
  if (!isRecord(input)) {
    return { error: 'A service object is required.' };
  }

  const title = requiredText(input.title, 180, 'Service title');
  const shortDescription = requiredText(input.shortDescription, 500, 'Short description');
  const description = requiredText(input.description, 5000, 'Description');
  if (title.error || shortDescription.error || description.error) {
    return { error: title.error || shortDescription.error || description.error };
  }
  if (typeof input.categoryId !== 'string' || !input.categoryId.trim()) {
    return { error: 'Select a service category.' };
  }

  const subcategoryId = input.subcategoryId || null;
  if (subcategoryId !== null && typeof subcategoryId !== 'string') {
    return { error: 'Select a valid service subcategory.' };
  }
  const deliveryMethod = input.deliveryMethod;
  if (!VALID_DELIVERY_METHODS.has(deliveryMethod)) {
    return { error: 'Select a valid service delivery method.' };
  }

  const rawPricingType = input.pricingType === 'starting_at' ? 'starting_from' : input.pricingType;
  const pricingType = rawPricingType;
  if (!VALID_PRICING_TYPES.has(pricingType)) {
    return { error: 'Select a valid pricing model.' };
  }
  const priceOptional = pricingType === 'negotiable' || pricingType === 'quote_required';
  const amount = positiveNumber(input.price, 'Price', {
    optional: priceOptional,
  });
  const minPrice = positiveNumber(input.minPrice, 'Minimum price');
  const maxPrice = positiveNumber(input.maxPrice, 'Maximum price');
  if (amount.error || minPrice.error || maxPrice.error) {
    return { error: amount.error || minPrice.error || maxPrice.error };
  }
  if ((minPrice.value === null) !== (maxPrice.value === null)) {
    return { error: 'Enter both minimum and maximum prices, or leave both blank.' };
  }
  if (minPrice.value !== null && minPrice.value > maxPrice.value) {
    return { error: 'Minimum price cannot exceed maximum price.' };
  }
  if (!priceOptional && amount.value === null) {
    return { error: 'Enter a price for this pricing model.' };
  }

  const currency = typeof input.currency === 'string'
    ? input.currency.trim().toUpperCase()
    : '';
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: 'Currency must be a three-letter code.' };
  }

  const durationValue = positiveNumber(input.durationValue, 'Duration');
  const durationUnit = input.durationUnit || null;
  if (durationValue.error) {
    return { error: durationValue.error };
  }
  if (
    (durationValue.value !== null && !VALID_DURATION_UNITS.has(durationUnit)) ||
    (durationValue.value === null && durationUnit !== null && !VALID_DURATION_UNITS.has(durationUnit))
  ) {
    return { error: 'Select minutes, hours, or days for the estimated duration.' };
  }

  const tags = stringList(input.tags, 'Tags', { maxItems: 20, maxLength: 40 });
  const inclusions = stringList(input.inclusions, 'Inclusions', { maxItems: 30, maxLength: 200 });
  const exclusions = stringList(input.exclusions, 'Exclusions', { maxItems: 30, maxLength: 200 });
  const locations = normalizeLocations(input.locations);
  const availability = normalizeAvailability(input.availability);
  const requirements = optionalText(input.customerRequirements, 5000, 'Customer requirements');
  const terms = optionalText(input.termsAndConditions, 5000, 'Terms and conditions');
  const cancellationPolicy = optionalText(input.cancellationPolicy, 5000, 'Cancellation policy');
  let bookingLeadTimeHours = null;
  if (input.bookingLeadTimeHours !== undefined && input.bookingLeadTimeHours !== null && input.bookingLeadTimeHours !== '') {
    const parsedLead = Number(input.bookingLeadTimeHours);
    if (!Number.isInteger(parsedLead) || parsedLead < 0 || parsedLead > 8760) {
      return { error: 'Booking lead time must be an integer number of hours between 0 and 8760.' };
    }
    bookingLeadTimeHours = parsedLead;
  }
  const packages = normalizePackagesOrAddons(input.packages, 'Packages');
  const addons = normalizePackagesOrAddons(input.addons, 'Add-ons', true);
  const customAttributes = input.customAttributes === undefined
    ? { value: {} }
    : isRecord(input.customAttributes) && Object.keys(input.customAttributes).length <= 30
      ? { value: input.customAttributes }
      : { error: 'Custom service attributes must be an object with at most 30 fields.' };
  const bookingConstraints = input.bookingConstraints === undefined
    ? { value: {} }
    : isRecord(input.bookingConstraints) && Object.keys(input.bookingConstraints).length <= 20
      ? { value: input.bookingConstraints }
      : { error: 'Booking constraints must be an object with at most 20 fields.' };
  if (
    tags.error ||
    inclusions.error ||
    exclusions.error ||
    locations.error ||
    availability.error ||
    requirements.error ||
    terms.error ||
    cancellationPolicy.error ||
    packages.error ||
    addons.error ||
    customAttributes.error ||
    bookingConstraints.error
  ) {
    return {
      error:
        tags.error ||
        inclusions.error ||
        exclusions.error ||
        locations.error ||
        availability.error ||
        requirements.error ||
        terms.error ||
        cancellationPolicy.error ||
        packages.error ||
        addons.error ||
        customAttributes.error ||
        bookingConstraints.error,
    };
  }

  let status;
  if (allowStatus && input.status !== undefined) {
    if (!VALID_STATUSES.has(input.status)) {
      return { error: 'Select a valid service status.' };
    }
    status = input.status;
  }

  return {
    value: {
      categoryId: input.categoryId.trim(),
      subcategoryId: subcategoryId ? subcategoryId.trim() : null,
      title: title.value,
      shortDescription: shortDescription.value,
      description: description.value,
      deliveryMethod,
      durationValue: durationValue.value,
      durationUnit,
      pricingType,
      price: amount.value,
      minPrice: minPrice.value,
      maxPrice: maxPrice.value,
      currency,
      tags: tags.value,
      inclusions: inclusions.value,
      exclusions: exclusions.value,
      locations: locations.value,
      availability: availability.value,
      customerRequirements: requirements.value,
      termsAndConditions: terms.value,
      bookingLeadTimeHours,
      cancellationPolicy: cancellationPolicy.value,
      packages: packages.value,
      addons: addons.value,
      customAttributes: customAttributes.value,
      bookingConstraints: bookingConstraints.value,
      ...(status ? { status } : {}),
    },
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 170);
}

async function withTransaction(pool, callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      error.rollbackErrorCode = rollbackError.code || 'rollback_error';
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function validateCategory(connection, categoryId, subcategoryId) {
  const [categories] = await connection.query(
    'SELECT id FROM service_categories WHERE id = ? AND is_active = TRUE LIMIT 1',
    [categoryId]
  );
  if (!categories.length) {
    return 'The selected category is unavailable.';
  }
  if (subcategoryId) {
    const [subcategories] = await connection.query(
      `SELECT id FROM service_subcategories
        WHERE id = ? AND category_id = ? AND is_active = TRUE LIMIT 1`,
      [subcategoryId, categoryId]
    );
    if (!subcategories.length) {
      return 'The selected subcategory does not belong to this category.';
    }
  }
  return null;
}

async function saveRelatedData(connection, serviceId, data) {
  await connection.query(
    `INSERT INTO service_pricing
       (service_id, pricing_type, amount, min_price, max_price, currency)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pricing_type = VALUES(pricing_type),
       amount = VALUES(amount),
       min_price = VALUES(min_price),
       max_price = VALUES(max_price),
       currency = VALUES(currency)`,
    [serviceId, data.pricingType, data.price, data.minPrice, data.maxPrice, data.currency]
  );

  for (const slot of data.availability) {
    await connection.query(
      `INSERT INTO service_availability
         (id, service_id, day_of_week, start_time, end_time, is_unavailable)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        serviceId,
        slot.dayOfWeek,
        `${slot.startTime}:00`,
        `${slot.endTime}:00`,
        slot.isUnavailable,
      ]
    );
  }
  for (const location of data.locations) {
    await connection.query(
      `INSERT INTO service_locations
         (id, service_id, country, state, city, area, radius_km, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        serviceId,
        location.country,
        location.state,
        location.city,
        location.area,
        location.radiusKm,
        false,
      ]
    );
  }
  for (const tag of data.tags) {
    await connection.query(
      'INSERT INTO service_tags (service_id, tag) VALUES (?, ?)',
      [serviceId, tag]
    );
  }
  for (const value of data.inclusions) {
    await connection.query(
      'INSERT INTO service_tags (service_id, tag) VALUES (?, ?)',
      [serviceId, `include:${value}`.slice(0, 40)]
    );
  }
  for (const value of data.exclusions) {
    await connection.query(
      'INSERT INTO service_tags (service_id, tag) VALUES (?, ?)',
      [serviceId, `exclude:${value}`.slice(0, 40)]
    );
  }
}

async function replaceRelatedData(connection, serviceId, data) {
  await connection.query('DELETE FROM service_pricing WHERE service_id = ?', [serviceId]);
  await connection.query('DELETE FROM service_availability WHERE service_id = ?', [serviceId]);
  await connection.query('DELETE FROM service_locations WHERE service_id = ?', [serviceId]);
  await connection.query('DELETE FROM service_tags WHERE service_id = ?', [serviceId]);
  await saveRelatedData(connection, serviceId, data);
}

function parseProfile(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function hydrateServices(pool, rows, config) {
  if (!rows.length) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  const [pricingRows] = await pool.query(
    `SELECT service_id, pricing_type, amount, min_price, max_price, currency
       FROM service_pricing WHERE service_id IN (${placeholders})`,
    ids
  );
  const [availabilityRows] = await pool.query(
    `SELECT service_id, day_of_week, start_time, end_time, is_unavailable
       FROM service_availability WHERE service_id IN (${placeholders})
       ORDER BY day_of_week, start_time`,
    ids
  );
  const [locationRows] = await pool.query(
    `SELECT service_id, country, state, city, area, radius_km, is_primary
       FROM service_locations WHERE service_id IN (${placeholders})
       ORDER BY is_primary DESC, city, area`,
    ids
  );
  const [tagRows] = await pool.query(
    `SELECT service_id, tag FROM service_tags WHERE service_id IN (${placeholders})`,
    ids
  );
  const [mediaRows] = await pool.query(
    `SELECT sm.id, sm.service_id, sm.media_type, sm.display_order,
            ma.object_key
       FROM service_media sm
       JOIN media_assets ma ON ma.id = sm.media_asset_id
      WHERE sm.service_id IN (${placeholders})
      ORDER BY sm.display_order, sm.created_at`,
    ids
  );

  const pricingByService = new Map(pricingRows.map((row) => [row.service_id, row]));
  const availabilityByService = new Map();
  const locationsByService = new Map();
  const tagsByService = new Map();
  const mediaByService = new Map();
  const add = (map, serviceId, value) => {
    if (!map.has(serviceId)) map.set(serviceId, []);
    map.get(serviceId).push(value);
  };

  for (const row of availabilityRows) {
    add(availabilityByService, row.service_id, {
      dayOfWeek: Number(row.day_of_week),
      startTime: String(row.start_time).slice(0, 5),
      endTime: String(row.end_time).slice(0, 5),
      isUnavailable: Boolean(row.is_unavailable),
    });
  }
  for (const row of locationRows) {
    add(locationsByService, row.service_id, {
      country: row.country || null,
      state: row.state || null,
      city: row.city,
      area: row.area || null,
      radiusKm: row.radius_km === null ? null : Number(row.radius_km),
      isPrimary: Boolean(row.is_primary),
    });
  }
  for (const row of tagRows) {
    add(tagsByService, row.service_id, row.tag);
  }
  const mediaValues = await Promise.all(mediaRows.map(async (row) => ({
    id: row.id,
    serviceId: row.service_id,
    mediaType: row.media_type,
    displayOrder: Number(row.display_order),
    url: await createPrivateReadUrl(config, row.object_key),
  })));
  for (const media of mediaValues) {
    add(mediaByService, media.serviceId, media);
  }

  return rows.map((row) => {
    const pricing = pricingByService.get(row.id) || {};
    const profile = row.provider_role === 'business'
      ? parseProfile(row.business_profile)
      : parseProfile(row.professional_profile);
    const reviewCount = Number(row.review_count || 0);
    const locations = locationsByService.get(row.id) || [];
    const availability = availabilityByService.get(row.id) || [];
    const packages = parseStringArray(row.packages);
    const addons = parseStringArray(row.addons);
    const customAttributes = parseProfile(row.custom_attributes);
    const bookingConstraints = parseProfile(row.booking_constraints);
    const bookingLeadTimeHours = row.booking_lead_time_hours === null || row.booking_lead_time_hours === undefined
      ? null
      : Number(row.booking_lead_time_hours);
    const pricingType = pricing.pricing_type || null;
    const price = pricing.amount === null || pricing.amount === undefined
      ? null
      : Number(pricing.amount);
    const minPrice = pricing.min_price === null || pricing.min_price === undefined
      ? null
      : Number(pricing.min_price);
    const maxPrice = pricing.max_price === null || pricing.max_price === undefined
      ? null
      : Number(pricing.max_price);
    const currency = pricing.currency || null;
    const durationValue = row.duration_value === null ? null : Number(row.duration_value);
    const durationUnit = row.duration_unit || null;
    const media = mediaByService.get(row.id) || [];
    return {
      id: row.id,
      providerUserId: row.provider_user_id,
      providerRole: row.provider_role,
      providerName: row.provider_name || null,
      businessName: row.provider_role === 'business'
        ? profile.companyName || profile.businessName || null
        : null,
      providerVerified: Boolean(row.provider_verified),
      categoryId: row.category_id,
      categoryName: row.category_name || null,
      subcategoryId: row.subcategory_id || null,
      subcategoryName: row.subcategory_name || null,
      title: row.title,
      slug: row.slug,
      shortDescription: row.short_description,
      description: row.description,
      deliveryMethod: row.delivery_method,
      durationValue,
      durationUnit,
      pricingType,
      price,
      minPrice,
      maxPrice,
      currency,
      tags: tagsByService.get(row.id) || [],
      inclusions: parseStringArray(row.inclusions),
      exclusions: parseStringArray(row.exclusions),
      locations,
      availability,
      customerRequirements: row.customer_requirements || null,
      termsAndConditions: row.terms_and_conditions || null,
      bookingLeadTimeHours,
      cancellationPolicy: row.cancellation_policy || null,
      packages,
      addons,
      customAttributes,
      bookingConstraints,
      bookingReadiness: {
        serviceId: row.id,
        listingId: row.id,
        providerUserId: row.provider_user_id,
        providerRole: row.provider_role,
        pricingType,
        price,
        minPrice,
        maxPrice,
        currency,
        durationValue,
        durationUnit,
        deliveryMethod: row.delivery_method,
        locations,
        availability,
        bookingLeadTimeHours,
        cancellationPolicy: row.cancellation_policy || null,
        termsAndConditions: row.terms_and_conditions || null,
        customerRequirements: row.customer_requirements || null,
        packages,
        addons,
        constraints: {
          requiresLocation: ['customer_location', 'provider_location', 'hybrid'].includes(row.delivery_method),
          requiresCustomerRequirements: Boolean(row.customer_requirements),
          ...bookingConstraints,
        },
        bookingEnabled: false,
      },
      media,
      images: media.filter((item) => item.mediaType === 'image'),
      status: row.status,
      ratingAvg: reviewCount > 0 ? Number(row.rating_avg) : null,
      reviewCount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

const SERVICE_SELECT = `SELECT s.*, p.pricing_type, p.amount, p.min_price, p.max_price, p.currency,
       c.name AS category_name, sc.name AS subcategory_name, u.name AS provider_name,
       ur.verification_status,
       CASE WHEN ur.verification_status = 'verified' THEN 1 ELSE 0 END AS provider_verified,
       bp.profile AS business_profile, pp.profile AS professional_profile
  FROM services s
  LEFT JOIN service_pricing p ON p.service_id = s.id
  LEFT JOIN service_categories c ON c.id = s.category_id
  LEFT JOIN service_subcategories sc ON sc.id = s.subcategory_id
  LEFT JOIN users u ON u.id = s.provider_user_id
  LEFT JOIN user_roles ur ON ur.user_id = s.provider_user_id AND ur.role = s.provider_role
  LEFT JOIN business_profiles bp ON bp.user_id = s.provider_user_id
  LEFT JOIN professional_profiles pp ON pp.user_id = s.provider_user_id`;
const PUBLIC_SERVICE_LISTING_FILTER = `EXISTS (
  SELECT 1 FROM marketplace_listings ml
   WHERE ml.id = s.id AND ml.listing_type = 'service'
     AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
)`;

async function fetchService(pool, id, config, { publicOnly = false } = {}) {
  const [rows] = await pool.query(
    `${SERVICE_SELECT} WHERE s.id = ? ${
      publicOnly ? `AND s.status = 'published' AND ${PUBLIC_SERVICE_LISTING_FILTER}` : ''
    } LIMIT 1`,
    [id]
  );
  if (!rows.length) {
    return null;
  }
  const [service] = await hydrateServices(pool, rows, config);
  return service;
}

function registerPaths(router, method, paths, ...handlers) {
  router[method](paths, ...handlers);
}

export function registerMarketplaceRoutes(router, { pool, config, authenticate }) {
  registerMarketplaceDiscoveryRoutes(router, { pool, config, authenticate });

  const categoryPaths = ['/services/categories', '/marketplace/categories'];
  const categoryDetailPaths = ['/services/categories/:id', '/marketplace/categories/:id'];
  const subcategoryPaths = [
    '/services/categories/:id/subcategories',
    '/marketplace/categories/:id/subcategories',
  ];
  const servicePaths = ['/services', '/marketplace/services'];
  const myServicePaths = ['/services/my-services', '/marketplace/my-services'];
  const serviceDetailPaths = ['/services/:id', '/marketplace/services/:id'];

  registerPaths(router, 'get', categoryPaths, async (req, res, next) => {
    try {
      const [categories] = await pool.query(
        `SELECT id, slug, name, description, icon_ref, image_url, display_order
           FROM service_categories
          WHERE is_active = TRUE
          ORDER BY display_order, name`
      );
      if (!categories.length) {
        return res.json({ categories: [] });
      }
      const categoryIds = categories.map((item) => item.id);
      const [subcategories] = await pool.query(
        `SELECT id, category_id, slug, name, description, display_order
           FROM service_subcategories
          WHERE is_active = TRUE AND category_id IN (${categoryIds.map(() => '?').join(', ')})
          ORDER BY display_order, name`,
        categoryIds
      );
      const children = new Map();
      for (const item of subcategories) {
        if (!children.has(item.category_id)) children.set(item.category_id, []);
        children.get(item.category_id).push({
          id: item.id,
          categoryId: item.category_id,
          slug: item.slug,
          name: item.name,
          description: item.description || '',
          displayOrder: Number(item.display_order || 0),
        });
      }
      const rulesMap = await loadServiceCategoryRulesMap(pool);
      const formattedCategories = await Promise.all(categories.map(async (item) => {
        const rules = rulesMap.get(item.id) || await loadServiceCategoryRules(pool, item.id);
        return {
          id: item.id,
          slug: item.slug,
          name: item.name,
          description: item.description || '',
          icon: item.icon_ref || null,
          imageUrl: item.image_url || null,
          displayOrder: Number(item.display_order || 0),
          subcategories: children.get(item.id) || [],
          rules,
          attributes: rules.attributes || [],
        };
      }));
      return res.json({
        categories: formattedCategories,
      });
    } catch (error) {
      return next(error);
    }
  });

  registerPaths(router, 'get', categoryDetailPaths, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, slug, name, description, icon_ref, image_url, display_order
           FROM service_categories WHERE id = ? AND is_active = TRUE LIMIT 1`,
        [req.params.id]
      );
      if (!rows.length) {
        return sendError(res, 404, 'category_not_found', 'Service category not found.');
      }
      const item = rows[0];
      const rules = await loadServiceCategoryRules(pool, item.id);
      return res.json({
        category: {
          id: item.id,
          slug: item.slug,
          name: item.name,
          description: item.description || '',
          icon: item.icon_ref || null,
          imageUrl: item.image_url || null,
          displayOrder: Number(item.display_order || 0),
          rules,
          attributes: rules.attributes || [],
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get(['/services/categories/:id/attributes', '/marketplace/services/categories/:id/attributes'], async (req, res, next) => {
    try {
      const rules = await loadServiceCategoryRules(pool, req.params.id);
      return res.json({
        categoryId: req.params.id,
        rules,
        attributes: rules.attributes || [],
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get(['/categories/:id/attributes', '/marketplace/categories/:id/attributes'], async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, attribute_key, label, attribute_type, options, is_required, is_filterable, display_order
           FROM category_attributes
          WHERE category_id = ?
          ORDER BY display_order ASC`,
        [req.params.id]
      );
      return res.json({
        attributes: rows.map((item) => ({
          id: item.id,
          key: item.attribute_key,
          label: item.label,
          type: item.attribute_type,
          options: typeof item.options === 'string' ? JSON.parse(item.options) : item.options,
          required: Boolean(item.is_required),
          filterable: Boolean(item.is_filterable),
          displayOrder: Number(item.display_order || 0),
        })),
      });
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return res.json({ attributes: [] });
      }
      return next(error);
    }
  });

  async function requireCategoryAdmin(req, res) {
    const [rows] = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1',
      [req.auth.userId, 'admin']
    );
    if (!rows.length) {
      sendError(res, 403, 'forbidden_role', 'Only authorized administrators can manage categories.');
      return false;
    }
    return true;
  }

  router.post('/categories', authenticate, async (req, res, next) => {
    try {
      if (!(await requireCategoryAdmin(req, res))) return;
      const body = req.body || {};
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return sendError(res, 400, 'validation_error', 'Category name is required.');
      }
      const id = randomUUID();
      await pool.query(
        `INSERT INTO categories (id, parent_id, listing_type, slug, name, description, icon_ref, image_url, is_active, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          body.parentId || null,
          body.listingType || null,
          String(body.slug || body.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,''),
          body.name.trim(),
          body.description || null,
          body.icon || null,
          body.imageUrl || null,
          body.isActive !== false,
          Number(body.displayOrder || 0),
        ]
      );
      return res.status(201).json({ category: { id, name: body.name.trim() } });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/categories/:id', authenticate, async (req, res, next) => {
    try {
      if (!(await requireCategoryAdmin(req, res))) return;
      const body = req.body || {};
      await pool.query(
        `UPDATE categories SET parent_id = COALESCE(?, parent_id), listing_type = COALESCE(?, listing_type),
         name = COALESCE(?, name), description = COALESCE(?, description), icon_ref = COALESCE(?, icon_ref),
         image_url = COALESCE(?, image_url), is_active = COALESCE(?, is_active), display_order = COALESCE(?, display_order)
         WHERE id = ?`,
        [
          body.parentId || null, body.listingType || null, body.name || null, body.description || null,
          body.icon || null, body.imageUrl || null,
          body.isActive === undefined ? null : body.isActive,
          body.displayOrder === undefined ? null : Number(body.displayOrder),
          req.params.id,
        ]
      );
      return res.json({ category: { id: req.params.id } });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/categories/:id', authenticate, async (req, res, next) => {
    try {
      if (!(await requireCategoryAdmin(req, res))) return;
      await pool.query('UPDATE categories SET is_active = FALSE WHERE id = ?', [req.params.id]);
      return res.json({ deleted: true, id: req.params.id });
    } catch (error) {
      return next(error);
    }
  });

  registerPaths(router, 'get', subcategoryPaths, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, category_id, slug, name, description, display_order
           FROM service_subcategories
          WHERE category_id = ? AND is_active = TRUE
          ORDER BY display_order, name`,
        [req.params.id]
      );
      return res.json({
        subcategories: rows.map((item) => ({
          id: item.id,
          categoryId: item.category_id,
          slug: item.slug,
          name: item.name,
          description: item.description || '',
          displayOrder: Number(item.display_order || 0),
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  registerPaths(router, 'get', myServicePaths, authenticate, async (req, res, next) => {
    try {
      const requestedRole = req.query.role;
      if (requestedRole && !VALID_PROVIDER_ROLES.has(requestedRole)) {
        return sendError(res, 400, 'invalid_role', 'Role must be professional or business.');
      }
      const status = req.query.status;
      if (status && !VALID_STATUSES.has(status)) {
        return sendError(res, 400, 'invalid_status', 'The requested service status is invalid.');
      }
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return sendError(res, 400, 'invalid_pagination', 'Use a page of at least 1 and a limit from 1 to 50.');
      }

      const params = [req.auth.userId];
      let where = `WHERE s.provider_user_id = ? AND s.status != 'deleted'`;
      if (requestedRole) {
        where += ' AND s.provider_role = ?';
        params.push(requestedRole);
      }
      if (status) {
        where += ' AND s.status = ?';
        params.push(status);
      }
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM services s ${where}`,
        params
      );
      const [rows] = await pool.query(
        `${SERVICE_SELECT} ${where}
          ORDER BY s.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      );
      const services = await hydrateServices(pool, rows, config);
      let counts = null;
      try {
        const countWhere = requestedRole
          ? "WHERE provider_user_id = ? AND status != 'deleted' AND provider_role = ?"
          : "WHERE provider_user_id = ? AND status != 'deleted'";
        const countParams = requestedRole ? [req.auth.userId, requestedRole] : [req.auth.userId];
        const [statusRows] = await pool.query(
          `SELECT status, COUNT(*) AS total FROM services ${countWhere} GROUP BY status`,
          countParams
        );
        counts = { all: 0, draft: 0, pending_review: 0, published: 0, rejected: 0, paused: 0, archived: 0 };
        for (const r of statusRows) {
          counts[r.status] = Number(r.total || 0);
          counts.all += Number(r.total || 0);
        }
      } catch {
        counts = null;
      }
      return res.json({
        services,
        ...(counts ? { counts } : {}),
        pagination: {
          page,
          limit,
          total: Number(countRows[0]?.total || 0),
          hasMore: page * limit < Number(countRows[0]?.total || 0),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  const createService = async (req, res, next) => {
    try {
      const input = req.body || {};
      const providerRole = input.providerRole;
      if (!VALID_PROVIDER_ROLES.has(providerRole)) {
        return sendError(res, 400, 'invalid_role', 'providerRole must be professional or business.');
      }
      const [roleRows] = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1',
        [req.auth.userId, providerRole]
      );
      if (!roleRows.length) {
        return sendError(res, 403, 'forbidden_role', `You do not have the ${providerRole} role.`);
      }
      const [profileRows] = await pool.query(
        `SELECT user_id FROM ${PROFILE_TABLES[providerRole]} WHERE user_id = ? LIMIT 1`,
        [req.auth.userId]
      );
      if (!profileRows.length) {
        return sendError(res, 409, 'provider_profile_required', 'Complete your provider profile before listing a service.');
      }

      const normalized = normalizeService(input, { allowStatus: true });
      if (normalized.error) {
        return sendError(res, 400, 'validation_error', normalized.error);
      }
      const data = normalized.value;
      const status = data.status || 'draft';
      if (status !== 'draft' && status !== 'published') {
        return sendError(res, 400, 'invalid_status', 'New services can only be saved as draft or published.');
      }
      const categoryError = await validateCategory(pool, data.categoryId, data.subcategoryId);
      if (categoryError) {
        return sendError(res, 400, 'invalid_category', categoryError);
      }
      const categoryRules = await loadServiceCategoryRules(pool, data.categoryId);
      const ruleError = validateServiceCategoryRules(categoryRules, data, { requireComplete: status !== 'draft' });
      if (ruleError) {
        return sendError(res, 400, ruleError.code, ruleError.message);
      }

      const id = randomUUID();
      const slug = `${slugify(data.title) || 'service'}-${id.slice(0, 8)}`;
      const hasPhase8Fields =
        data.bookingLeadTimeHours !== null ||
        data.cancellationPolicy !== null ||
        data.packages.length > 0 ||
        data.addons.length > 0 ||
        Object.keys(data.customAttributes || {}).length > 0 ||
        Object.keys(data.bookingConstraints || {}).length > 0;
      if (status === 'published') {
        const policy = await getModerationPolicy(pool, config);
        if (requiresReviewForType(policy, 'service')) {
          return sendError(
            res,
            409,
            'review_required',
            'This listing type requires review. Create or submit it through the unified listings API.'
          );
        }
      }
      await withTransaction(pool, async (connection) => {
        await connection.query(
          `INSERT INTO services (
             id, provider_user_id, provider_role, category_id, subcategory_id,
             slug, title, short_description, description, delivery_method,
             duration_value, duration_unit, inclusions, exclusions,
             customer_requirements, terms_and_conditions, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            req.auth.userId,
            providerRole,
            data.categoryId,
            data.subcategoryId,
            slug,
            data.title,
            data.shortDescription,
            data.description,
            data.deliveryMethod,
            data.durationValue,
            data.durationUnit,
            JSON.stringify(data.inclusions),
            JSON.stringify(data.exclusions),
            data.customerRequirements,
            data.termsAndConditions,
            status,
          ]
        );
        if (hasPhase8Fields) {
          await connection.query(
            `UPDATE services
                SET booking_lead_time_hours = ?, cancellation_policy = ?,
                    packages = ?, addons = ?, custom_attributes = ?, booking_constraints = ?
              WHERE id = ?`,
            [
              data.bookingLeadTimeHours,
              data.cancellationPolicy,
              JSON.stringify(data.packages),
              JSON.stringify(data.addons),
              JSON.stringify(data.customAttributes),
              JSON.stringify(data.bookingConstraints),
              id,
            ]
          );
        }
        await saveRelatedData(connection, id, data);
        await syncMarketplaceListing(
          connection,
          {
            id,
            entityId: id,
            type: 'service',
            ownerId: req.auth.userId,
            ownerRole: providerRole,
            categoryId: data.categoryId,
            subcategoryId: data.subcategoryId,
            title: data.title,
            shortSummary: data.shortDescription,
            description: data.description,
            location: data.locations?.[0] || null,
            status,
          },
          { linkCategory: false }
        );
      });

      const service = await fetchService(pool, id, config);
      return res.status(201).json({ service });
    } catch (error) {
      return next(error);
    }
  };
  registerPaths(router, 'post', servicePaths, authenticate, createService);

  const listServices = async (req, res, next) => {
    try {
      const {
        q,
        categoryId,
        subcategoryId,
        location,
        minPrice,
        maxPrice,
        pricingType,
        deliveryMethod,
        providerRole,
        availableDay,
        minRating,
        verified,
        featured,
        sort = 'newest',
      } = req.query;
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return sendError(res, 400, 'invalid_pagination', 'Use a page of at least 1 and a limit from 1 to 50.');
      }
      if (q !== undefined && (typeof q !== 'string' || q.trim().length > 100)) {
        return sendError(res, 400, 'invalid_search', 'Search text must be no more than 100 characters.');
      }
      if (providerRole && !VALID_PROVIDER_ROLES.has(providerRole)) {
        return sendError(res, 400, 'invalid_role', 'Role must be professional or business.');
      }
      if (pricingType && !VALID_PRICING_TYPES.has(pricingType)) {
        return sendError(res, 400, 'invalid_pricing_type', 'The pricing filter is invalid.');
      }
      if (deliveryMethod && !VALID_DELIVERY_METHODS.has(deliveryMethod)) {
        return sendError(res, 400, 'invalid_delivery_method', 'The delivery filter is invalid.');
      }
      if (availableDay !== undefined && availableDay !== '') {
        const dayNum = Number(availableDay);
        if (!Number.isInteger(dayNum) || dayNum < 0 || dayNum > 6) {
          return sendError(res, 400, 'invalid_availability_day', 'Available day must be 0 (Sun) through 6 (Sat).');
        }
      }
      if (minRating !== undefined && minRating !== '') {
        const ratingNum = Number(minRating);
        if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
          return sendError(res, 400, 'invalid_rating', 'Minimum rating must be between 1 and 5.');
        }
      }
      if (!['newest', 'price_asc', 'price_desc', 'rating_desc'].includes(sort)) {
        return sendError(res, 400, 'invalid_sort', 'Choose newest, price_asc, price_desc, or rating_desc.');
      }
      if (minPrice !== undefined && minPrice !== '') {
        const parsed = Number(minPrice);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return sendError(res, 400, 'invalid_price', 'Minimum price must be zero or greater.');
        }
      }
      if (maxPrice !== undefined && maxPrice !== '') {
        const parsed = Number(maxPrice);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return sendError(res, 400, 'invalid_price', 'Maximum price must be zero or greater.');
        }
      }
      if (verified !== undefined && !['true', 'false'].includes(verified)) {
        return sendError(res, 400, 'invalid_verified_filter', 'Verified must be true or false.');
      }
      if (featured !== undefined && !['true', 'false'].includes(featured)) {
        return sendError(res, 400, 'invalid_featured_filter', 'Featured must be true or false.');
      }

      const params = [];
      let where = `WHERE s.status = 'published' AND ${PUBLIC_SERVICE_LISTING_FILTER}`;
      if (q && q.trim()) {
        const like = `%${q.trim()}%`;
        where += ` AND (s.title LIKE ? OR s.short_description LIKE ? OR s.description LIKE ?
          OR EXISTS (SELECT 1 FROM service_tags st WHERE st.service_id = s.id AND st.tag LIKE ?))`;
        params.push(like, like, like, like);
      }
      if (categoryId) {
        where += ' AND s.category_id = ?';
        params.push(categoryId);
      }
      if (subcategoryId) {
        where += ' AND s.subcategory_id = ?';
        params.push(subcategoryId);
      }
      if (location && String(location).trim()) {
        if (String(location).trim().length > 120) {
          return sendError(res, 400, 'invalid_location', 'Location must be no more than 120 characters.');
        }
        where += ` AND EXISTS (
          SELECT 1 FROM service_locations sl
           WHERE sl.service_id = s.id
             AND (sl.city LIKE ? OR sl.state LIKE ? OR sl.area LIKE ?)
        )`;
        const like = `%${String(location).trim()}%`;
        params.push(like, like, like);
      }
      if (minPrice !== undefined && minPrice !== '') {
        where += ' AND (p.amount >= ? OR p.max_price >= ?)';
        params.push(Number(minPrice), Number(minPrice));
      }
      if (maxPrice !== undefined && maxPrice !== '') {
        where += ' AND (p.amount <= ? OR p.min_price <= ?)';
        params.push(Number(maxPrice), Number(maxPrice));
      }
      if (pricingType) {
        where += ' AND p.pricing_type = ?';
        params.push(pricingType);
      }
      if (deliveryMethod) {
        where += ' AND s.delivery_method = ?';
        params.push(deliveryMethod);
      }
      if (providerRole) {
        where += ' AND s.provider_role = ?';
        params.push(providerRole);
      }
      if (availableDay !== undefined && availableDay !== '') {
        where += ` AND EXISTS (
          SELECT 1 FROM service_availability sa
           WHERE sa.service_id = s.id AND sa.day_of_week = ? AND sa.is_unavailable = FALSE
        )`;
        params.push(Number(availableDay));
      }
      if (minRating !== undefined && minRating !== '') {
        where += ' AND s.review_count > 0 AND s.rating_avg >= ?';
        params.push(Number(minRating));
      }
      if (verified === 'true') {
        where += ` AND EXISTS (
          SELECT 1 FROM user_roles v
           WHERE v.user_id = s.provider_user_id
             AND v.role = s.provider_role
             AND v.verification_status = 'verified'
        )`;
      }
      if (featured === 'true') {
        where += ' AND s.is_featured = TRUE';
      }

      const orderBy = sort === 'price_asc'
        ? 'ORDER BY p.amount IS NULL, p.amount ASC, s.created_at DESC'
        : sort === 'price_desc'
          ? 'ORDER BY p.amount IS NULL, p.amount DESC, s.created_at DESC'
          : sort === 'rating_desc'
            ? 'ORDER BY s.review_count > 0 DESC, s.rating_avg DESC, s.created_at DESC'
            : 'ORDER BY s.created_at DESC';
      const from = `FROM services s
        LEFT JOIN service_pricing p ON p.service_id = s.id
        LEFT JOIN user_roles ur ON ur.user_id = s.provider_user_id AND ur.role = s.provider_role`;
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total ${from} ${where}`,
        params
      );
      const [rows] = await pool.query(
        `${SERVICE_SELECT} ${where} ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      );
      const services = await hydrateServices(pool, rows, config);
      const total = Number(countRows[0]?.total || 0);
      return res.json({
        services,
        pagination: { page, limit, total, hasMore: page * limit < total },
      });
    } catch (error) {
      return next(error);
    }
  };
  registerPaths(router, 'get', servicePaths, listServices);

  const getService = async (req, res, next) => {
    try {
      const service = await fetchService(pool, req.params.id, config, { publicOnly: true });
      if (!service) {
        return sendError(res, 404, 'service_not_found', 'Service was not found.');
      }
      return res.json({ service });
    } catch (error) {
      return next(error);
    }
  };
  registerPaths(router, 'get', serviceDetailPaths, getService);

  for (const role of VALID_PROVIDER_ROLES) {
    const route = role === 'professional'
      ? '/professionals/:id/services'
      : '/businesses/:id/services';
    router.get(route, async (req, res, next) => {
      try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
          return sendError(res, 400, 'invalid_pagination', 'Use a page of at least 1 and a limit from 1 to 50.');
        }
        const [countRows] = await pool.query(
          `SELECT COUNT(*) AS total FROM services
            WHERE provider_user_id = ? AND provider_role = ? AND status = 'published'
              AND EXISTS (
                SELECT 1 FROM marketplace_listings ml
                 WHERE ml.id = services.id AND ml.listing_type = 'service'
                   AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              )`,
          [req.params.id, role]
        );
        const [rows] = await pool.query(
          `${SERVICE_SELECT}
            WHERE s.provider_user_id = ? AND s.provider_role = ? AND s.status = 'published'
              AND ${PUBLIC_SERVICE_LISTING_FILTER}
            ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
          [req.params.id, role, limit, (page - 1) * limit]
        );
        const services = await hydrateServices(pool, rows, config);
        const total = Number(countRows[0]?.total || 0);
        return res.json({
          services,
          pagination: { page, limit, total, hasMore: page * limit < total },
        });
      } catch (error) {
        return next(error);
      }
    });
  }

  const updateService = async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT s.* FROM services s
          WHERE s.id = ? AND s.status != 'deleted' LIMIT 1`,
        [req.params.id]
      );
      if (!rows.length) {
        return sendError(res, 404, 'service_not_found', 'Service was not found.');
      }
      const existing = rows[0];
      if (existing.provider_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden', 'You can only manage your own services.');
      }
      if (req.body?.status !== undefined) {
        return sendError(res, 409, 'use_listing_lifecycle', 'Use the unified listing lifecycle endpoint to change status.');
      }
      const [commonRows] = await pool.query(
        `SELECT * FROM marketplace_listings
          WHERE id = ? AND listing_type = 'service' AND owner_user_id = ? LIMIT 1`,
        [existing.id, req.auth.userId]
      );
      const common = commonRows[0];
      if (!common) {
        return sendError(res, 409, 'listing_identity_missing', 'Run the marketplace migrations before managing this service.');
      }
      const current = await fetchService(pool, existing.id, config);
      const normalized = normalizeService({ ...current, ...(req.body || {}) });
      if (normalized.error) {
        return sendError(res, 400, 'validation_error', normalized.error);
      }
      const data = normalized.value;
      const categoryError = await validateCategory(pool, data.categoryId, data.subcategoryId);
      if (categoryError) {
        return sendError(res, 400, 'invalid_category', categoryError);
      }
      const ruleError = validateServiceCategoryRules(
        await loadServiceCategoryRules(pool, data.categoryId),
        data,
        { requireComplete: !['draft', 'rejected'].includes(common.status) }
      );
      if (ruleError) {
        return sendError(res, 400, ruleError.code, ruleError.message);
      }
      const hasPhase8Fields =
        data.bookingLeadTimeHours !== null ||
        data.cancellationPolicy !== null ||
        data.packages.length > 0 ||
        data.addons.length > 0 ||
        Object.keys(data.customAttributes || {}).length > 0 ||
        Object.keys(data.bookingConstraints || {}).length > 0;
      await withTransaction(pool, async (connection) => {
        await connection.query(
          `UPDATE services SET
             category_id = ?, subcategory_id = ?, title = ?, short_description = ?,
             description = ?, delivery_method = ?, duration_value = ?, duration_unit = ?,
             inclusions = ?, exclusions = ?, customer_requirements = ?,
             terms_and_conditions = ?
           WHERE id = ? AND provider_user_id = ?`,
          [
            data.categoryId,
            data.subcategoryId,
            data.title,
            data.shortDescription,
            data.description,
            data.deliveryMethod,
            data.durationValue,
            data.durationUnit,
            JSON.stringify(data.inclusions),
            JSON.stringify(data.exclusions),
            data.customerRequirements,
            data.termsAndConditions,
            existing.id,
            req.auth.userId,
          ]
        );
        if (hasPhase8Fields) {
          await connection.query(
            `UPDATE services
                SET booking_lead_time_hours = ?, cancellation_policy = ?,
                    packages = ?, addons = ?, custom_attributes = ?, booking_constraints = ?
              WHERE id = ? AND provider_user_id = ?`,
            [
              data.bookingLeadTimeHours,
              data.cancellationPolicy,
              JSON.stringify(data.packages),
              JSON.stringify(data.addons),
              JSON.stringify(data.customAttributes),
              JSON.stringify(data.bookingConstraints),
              existing.id,
              req.auth.userId,
            ]
          );
        }
        await replaceRelatedData(connection, existing.id, data);
        await syncMarketplaceListing(
          connection,
          {
            id: existing.id,
            entityId: existing.id,
            type: 'service',
            ownerId: req.auth.userId,
            ownerRole: existing.provider_role,
            categoryId: data.categoryId,
            subcategoryId: data.subcategoryId,
            title: data.title,
            shortSummary: data.shortDescription,
            description: data.description,
            location: data.locations?.[0] || null,
            visibility: common.visibility,
            status: common.status,
            moderationStatus: common.moderation_status,
            moderationReason: common.moderation_reason,
            moderatedBy: common.moderated_by,
            moderatedAt: common.moderated_at,
            submittedForReviewAt: common.submitted_for_review_at,
            publishedAt: common.published_at,
            archivedAt: common.archived_at,
          },
          { linkCategory: false }
        );
      });
      return res.json({ service: await fetchService(pool, existing.id, config) });
    } catch (error) {
      return next(error);
    }
  };
  registerPaths(router, 'put', serviceDetailPaths, authenticate, updateService);
  registerPaths(router, 'patch', serviceDetailPaths, authenticate, updateService);

  registerPaths(
    router,
    'patch',
    ['/services/:id/status', '/marketplace/services/:id/status'],
    authenticate,
    async (req, res, next) => {
      try {
        const { status } = req.body || {};
        if (!VALID_STATUSES.has(status) || status === 'deleted') {
          return sendError(res, 400, 'invalid_status', 'Select draft, published, paused, or inactive.');
        }
        if (['pending_review', 'rejected', 'archived'].includes(status)) {
          return sendError(res, 409, 'use_listing_lifecycle', 'Use the unified listing lifecycle endpoint for this action.');
        }
        const [listingRows] = await pool.query(
          `SELECT id, status, moderation_status, visibility, owner_role FROM marketplace_listings
            WHERE id = ? AND listing_type = 'service' AND owner_user_id = ? LIMIT 1`,
          [req.params.id, req.auth.userId]
        );
        if (!listingRows.length) {
          const [rows] = await pool.query(
            'SELECT id FROM services WHERE id = ? LIMIT 1',
            [req.params.id]
          );
          return sendError(
            res,
            rows.length ? 403 : 404,
            rows.length ? 'forbidden' : 'service_not_found',
            rows.length ? 'You can only manage your own services.' : 'Service was not found.'
          );
        }
        const current = listingRows[0];
        const targetStatus = status === 'inactive' ? 'paused' : status;
        const policy = await getModerationPolicy(pool, config);
        const transition = validateOwnerTransition({
          fromStatus: current.status,
          toStatus: targetStatus,
          listingType: 'service',
          moderationPolicy: policy,
          moderationStatus: current.moderation_status,
        });
        if (!transition.ok) {
          return sendError(res, transition.status, transition.code, transition.message);
        }
        if (targetStatus === 'published') {
          const service = await fetchService(pool, req.params.id, config);
          const ruleError = validateServiceCategoryRules(
            await loadServiceCategoryRules(pool, service.categoryId),
            service,
            { requireComplete: true }
          );
          if (ruleError) {
            return sendError(res, 400, ruleError.code, ruleError.message);
          }
        }
        await withTransaction(pool, async (connection) => {
          await connection.query(
            `UPDATE services SET status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND provider_user_id = ? AND status != 'deleted'`,
            [targetStatus, req.params.id, req.auth.userId]
          );
          await syncMarketplaceListingStatus(connection, 'service', req.params.id, targetStatus, {
            visibility: current.visibility,
          });
          await recordStatusHistory(connection, {
            listingId: req.params.id,
            listingType: 'service',
            fromStatus: current.status,
            toStatus: targetStatus,
            userId: req.auth.userId,
            role: current.owner_role || 'professional',
            reason: 'Changed through the legacy service status endpoint',
          });
        });
        return res.json({ service: await fetchService(pool, req.params.id, config) });
      } catch (error) {
        return next(error);
      }
    }
  );

  registerPaths(router, 'delete', serviceDetailPaths, authenticate, async (req, res, next) => {
    try {
      const [result] = await pool.query(
        `UPDATE services SET status = 'deleted'
          WHERE id = ? AND provider_user_id = ? AND status != 'deleted'`,
        [req.params.id, req.auth.userId]
      );
      if (!result.affectedRows) {
        const [rows] = await pool.query('SELECT id FROM services WHERE id = ? LIMIT 1', [req.params.id]);
        return sendError(
          res,
          rows.length ? 403 : 404,
          rows.length ? 'forbidden' : 'service_not_found',
          rows.length ? 'You can only delete your own services.' : 'Service was not found.'
        );
      }
      await syncMarketplaceListingStatus(pool, 'service', req.params.id, 'deleted');
      return res.json({ deleted: true, id: req.params.id });
    } catch (error) {
      return next(error);
    }
  });

  registerPaths(
    router,
    'post',
    ['/services/:id/media', '/marketplace/services/:id/media'],
    authenticate,
    async (req, res, next) => {
      try {
        const { mediaAssetId, mediaType } = req.body || {};
        if (
          typeof mediaAssetId !== 'string' ||
          !['image', 'video'].includes(mediaType)
        ) {
          return sendError(res, 400, 'invalid_media', 'A media asset ID and image or video type are required.');
        }
        const [services] = await pool.query(
          `SELECT id, provider_user_id, provider_role FROM services
            WHERE id = ? AND status != 'deleted' LIMIT 1`,
          [req.params.id]
        );
        if (!services.length) {
          return sendError(res, 404, 'service_not_found', 'Service was not found.');
        }
        const service = services[0];
        if (service.provider_user_id !== req.auth.userId) {
          return sendError(res, 403, 'forbidden', 'You can only manage your own services.');
        }
        const purpose = mediaType === 'image' ? 'service-image' : 'service-video';
        const [assets] = await pool.query(
          `SELECT id, object_key, content_type
             FROM media_assets
            WHERE id = ? AND user_id = ? AND role = ? AND purpose = ?
            LIMIT 1`,
          [mediaAssetId, req.auth.userId, service.provider_role, purpose]
        );
        if (!assets.length) {
          return sendError(res, 404, 'media_not_found', 'The uploaded media asset was not found.');
        }
        const contentType = assets[0].content_type;
        const validImage = mediaType === 'image' &&
          ['image/jpeg', 'image/png', 'image/webp'].includes(contentType);
        const validVideo = mediaType === 'video' && contentType === 'video/mp4';
        if (!validImage && !validVideo) {
          return sendError(res, 415, 'unsupported_media_type', 'The uploaded file does not match the requested media type.');
        }
        const [countRows] = await pool.query(
          'SELECT COUNT(*) AS total FROM service_media WHERE service_id = ? AND media_type = ?',
          [service.id, mediaType]
        );
        const total = Number(countRows[0]?.total || 0);
        if ((mediaType === 'image' && total >= 8) || (mediaType === 'video' && total >= 1)) {
          return sendError(res, 409, 'media_limit_reached', 'This service has reached its media limit.');
        }
        const id = randomUUID();
        await pool.query(
          `INSERT INTO service_media (id, service_id, media_asset_id, media_type, display_order)
           VALUES (?, ?, ?, ?, ?)`,
          [id, service.id, mediaAssetId, mediaType, total]
        );
        return res.status(201).json({ media: { id, mediaType, displayOrder: total } });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          return sendError(res, 409, 'media_already_attached', 'This uploaded file is already attached to a service.');
        }
        return next(error);
      }
    }
  );

  registerPaths(
    router,
    'delete',
    ['/services/:id/media/:mediaId', '/marketplace/services/:id/media/:mediaId'],
    authenticate,
    async (req, res, next) => {
      try {
        const [rows] = await pool.query(
          `SELECT sm.id, sm.media_asset_id, ma.object_key
             FROM service_media sm
             JOIN services s ON s.id = sm.service_id
             JOIN media_assets ma ON ma.id = sm.media_asset_id
            WHERE sm.id = ? AND sm.service_id = ?
              AND s.provider_user_id = ? AND s.status != 'deleted'
            LIMIT 1`,
          [req.params.mediaId, req.params.id, req.auth.userId]
        );
        if (!rows.length) {
          return sendError(res, 404, 'media_not_found', 'Service media was not found.');
        }
        await deletePrivateObject(config, rows[0].object_key);
        await withTransaction(pool, async (connection) => {
          await connection.query('DELETE FROM service_media WHERE id = ?', [rows[0].id]);
          await connection.query('DELETE FROM media_assets WHERE id = ? AND user_id = ?', [
            rows[0].media_asset_id,
            req.auth.userId,
          ]);
        });
        return res.json({ deleted: true, id: rows[0].id });
      } catch (error) {
        if (error.message === 'Private file storage is not configured.') {
          return sendError(res, 503, 'storage_unavailable', error.message);
        }
        return next(error);
      }
    }
  );
}
