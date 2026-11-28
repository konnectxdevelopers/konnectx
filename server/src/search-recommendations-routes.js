import { randomUUID } from 'node:crypto';
import { hydrateUnifiedListings, UNIFIED_LISTING_SELECT } from './listing-engine.js';
import { normalizeListingType } from './marketplace-listings.js';

const PUBLIC_TYPES = [
  'service',
  'product',
  'professional_profile',
  'job',
  'freelance_project',
  'business_profile',
];

const SEARCH_FROM = `
  FROM marketplace_listings ml
  LEFT JOIN users u ON u.id = ml.owner_user_id
  LEFT JOIN categories c ON c.id = ml.category_id
  LEFT JOIN categories subc ON subc.id = ml.subcategory_id
  LEFT JOIN service_categories sc ON sc.id = ml.category_id
  LEFT JOIN service_subcategories ssub ON ssub.id = ml.subcategory_id`;

const CATEGORY_TYPE_MAP = {
  service: 'service',
  product: 'product',
  professional_profile: 'professional',
  job: 'job',
  freelance_project: 'project',
  business_profile: 'business',
};

const SORT_OPTIONS = {
  all: ['relevance', 'newest'],
  service: ['relevance', 'newest', 'price_asc', 'price_desc', 'rating_desc'],
  product: ['relevance', 'newest', 'price_asc', 'price_desc', 'discount'],
  professional_profile: ['relevance', 'newest', 'experience_desc'],
  job: ['relevance', 'newest', 'salary_desc'],
  freelance_project: ['relevance', 'newest', 'budget_desc', 'deadline_asc'],
  business_profile: ['relevance', 'newest'],
};

const PUBLIC_LISTING_ELIGIBILITY = `
  ml.status = 'published'
  AND ml.is_public = TRUE
  AND ml.visibility = 'public'
  AND (ml.listing_type <> 'service' OR EXISTS (
    SELECT 1 FROM services s
     WHERE s.id = ml.entity_id AND s.status = 'published'
  ))
  AND (ml.listing_type <> 'product' OR EXISTS (
    SELECT 1 FROM products p
     WHERE p.id = ml.entity_id AND p.status = 'published' AND p.is_active = TRUE
  ))
  AND (ml.listing_type <> 'professional_profile' OR EXISTS (
    SELECT 1 FROM professional_profiles pp WHERE pp.listing_id = ml.id
  ))
  AND (ml.listing_type <> 'business_profile' OR EXISTS (
    SELECT 1 FROM business_profiles bp WHERE bp.listing_id = ml.id
  ))
  AND (ml.listing_type <> 'job' OR EXISTS (
    SELECT 1 FROM jobs j
     WHERE j.id = ml.entity_id AND j.status = 'published' AND j.is_active = TRUE
       AND (j.deadline IS NULL OR j.deadline >= CURDATE())
  ))
  AND (ml.listing_type <> 'freelance_project' OR EXISTS (
    SELECT 1 FROM freelance_projects fp
     WHERE fp.id = ml.entity_id AND fp.status = 'published' AND fp.is_active = TRUE
       AND fp.visibility = 'public'
       AND (fp.proposal_deadline IS NULL OR fp.proposal_deadline >= CURDATE())
  ))`;

function sendError(res, status, code, message) {
  return res.status(status).json({ code, message });
}

function readTextParam(query, key, maxLength) {
  const raw = query[key];
  if (raw === undefined || raw === null || raw === '') return { value: null };
  if (typeof raw !== 'string') return { error: `${key} must be a string.` };
  const value = raw.trim();
  if (value.length > maxLength) return { error: `${key} must be no more than ${maxLength} characters.` };
  return { value: value || null };
}

function readNumberParam(query, key, maxValue = 100000000) {
  const raw = query[key];
  if (raw === undefined || raw === null || raw === '') return { value: null };
  if (typeof raw !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    return { error: `${key} must be a non-negative number.` };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value > maxValue) {
    return { error: `${key} is outside the supported range.` };
  }
  return { value };
}

function readBooleanParam(query, key) {
  const raw = query[key];
  if (raw === undefined || raw === null || raw === '') return { value: null };
  if (raw === 'true' || raw === '1') return { value: true };
  if (raw === 'false' || raw === '0') return { value: false };
  return { error: `${key} must be true or false.` };
}

function readPagination(query) {
  const pageText = query.page === undefined ? '1' : query.page;
  const limitText = query.limit === undefined ? '20' : query.limit;
  if (typeof pageText !== 'string' || !/^\d+$/.test(pageText) ||
      typeof limitText !== 'string' || !/^\d+$/.test(limitText)) {
    return { error: 'Page and limit must be positive whole numbers.' };
  }
  const page = Number(pageText);
  const limit = Number(limitText);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 40) {
    return { error: 'Page must be between 1 and 100000; limit must be between 1 and 40.' };
  }
  return { page, limit };
}

function appendKeywordFilter(parts, params, query) {
  const pattern = `%${query}%`;
  const fields = [
    'ml.title',
    'ml.short_summary',
    'ml.description',
    'u.name',
    'c.name',
    'subc.name',
    'sc.name',
    'ssub.name',
  ];
  for (const field of fields) {
    parts.push(`${field} LIKE ?`);
    params.push(pattern);
  }
  parts.push(`EXISTS (
    SELECT 1 FROM products p
     WHERE p.id = ml.entity_id AND p.brand LIKE ?
  )`);
  params.push(pattern);
  parts.push(`EXISTS (
    SELECT 1 FROM services s
     LEFT JOIN service_tags st ON st.service_id = s.id
     WHERE s.id = ml.entity_id
       AND (s.short_description LIKE ? OR s.description LIKE ? OR st.tag LIKE ?)
  )`);
  params.push(pattern, pattern, pattern);
  parts.push(`EXISTS (
    SELECT 1 FROM professional_profiles pp
     WHERE pp.listing_id = ml.id
       AND (
         JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.headline')) LIKE ?
         OR JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) LIKE ?
         OR JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.subCategory')) LIKE ?
         OR CAST(JSON_EXTRACT(pp.profile, '$.skills') AS CHAR) LIKE ?
         OR EXISTS (
           SELECT 1 FROM professional_skills ps
            WHERE ps.professional_user_id = pp.user_id AND ps.skill LIKE ?
         )
         OR EXISTS (
           SELECT 1 FROM professional_portfolio_items pi
            WHERE pi.professional_user_id = pp.user_id AND pi.status = 'published'
              AND (pi.title LIKE ? OR pi.description LIKE ?)
         )
       )
  )`);
  params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  parts.push(`EXISTS (
    SELECT 1 FROM jobs j
     WHERE j.id = ml.entity_id
       AND (j.responsibilities LIKE ? OR j.education_required LIKE ?
         OR j.experience_required LIKE ?
         OR EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = j.id AND js.skill LIKE ?))
  )`);
  params.push(pattern, pattern, pattern, pattern);
  parts.push(`EXISTS (
    SELECT 1 FROM freelance_projects fp
     WHERE fp.id = ml.entity_id
       AND (fp.deliverables LIKE ?
         OR EXISTS (SELECT 1 FROM project_skills ps WHERE ps.project_id = fp.id AND ps.skill LIKE ?))
  )`);
  params.push(pattern, pattern);
  parts.push(`EXISTS (
    SELECT 1 FROM business_profiles bp
     WHERE bp.listing_id = ml.id
       AND (
         JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.companyName')) LIKE ?
         OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.businessName')) LIKE ?
         OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.businessType')) LIKE ?
         OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.industry')) LIKE ?
         OR JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.storeDisplayName')) LIKE ?
         OR EXISTS (
           SELECT 1 FROM business_categories bc
           JOIN categories business_category ON business_category.id = bc.category_id
           WHERE bc.business_user_id = bp.user_id AND business_category.name LIKE ?
         )
         OR EXISTS (
           SELECT 1 FROM marketplace_listings offering
           WHERE offering.owner_user_id = bp.user_id
             AND offering.listing_type IN ('service', 'product')
             AND offering.status = 'published' AND offering.is_public = TRUE
             AND offering.visibility = 'public'
             AND (offering.title LIKE ? OR offering.short_summary LIKE ? OR offering.description LIKE ?)
         )
       )
  )`);
  params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
}

async function pruneSearchHistory(pool, userId) {
  await pool.query(
    `DELETE FROM customer_search_history
      WHERE user_id = ? AND created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)`,
    [userId]
  );
  const [olderRows] = await pool.query(
    `SELECT id FROM customer_search_history
      WHERE user_id = ? ORDER BY created_at DESC, id DESC
      LIMIT 1000 OFFSET 20`,
    [userId]
  );
  if (olderRows.length) {
    await pool.query(
      `DELETE FROM customer_search_history
        WHERE user_id = ? AND id IN (${olderRows.map(() => '?').join(', ')})`,
      [userId, ...olderRows.map((row) => row.id)]
    );
  }
}

async function resolveOptionalUserId(req, authenticate) {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return new Promise((resolve) => {
    authenticate(req, {
      status: () => ({ json: () => resolve(null) }),
    }, () => {
      resolve(req.auth?.userId || null);
    });
  }).catch(() => null);
}

export function registerSearchRecommendationsRoutes(router, { pool, config, authenticate }) {
  // 1. Global Marketplace Search
  router.get('/customer/marketplace/search', async (req, res, next) => {
    try {
      const textKeys = [
        ['q', 160],
        ['type', 40],
        ['categoryId', 80],
        ['subcategoryId', 80],
        ['category', 120],
        ['location', 120],
        ['skill', 120],
        ['brand', 120],
        ['pricingType', 32],
        ['deliveryMethod', 32],
        ['providerType', 24],
        ['stockStatus', 24],
        ['employmentType', 32],
        ['workMode', 24],
        ['education', 160],
        ['businessType', 80],
        ['deadline', 10],
        ['sort', 32],
      ];
      const textValues = {};
      for (const [key, maxLength] of textKeys) {
        const result = readTextParam(req.query, key, maxLength);
        if (result.error) return sendError(res, 400, 'invalid_query', result.error);
        textValues[key] = result.value;
      }

      const q = textValues.q || '';
      const rawType = textValues.type || '';
      const canonicalType = rawType && rawType !== 'all' ? normalizeListingType(rawType) : null;
      if (rawType && rawType !== 'all' && !canonicalType) {
        return sendError(res, 400, 'invalid_listing_type', 'Unsupported listing type filter.');
      }
      const location = textValues.location;
      const sort = textValues.sort || 'relevance';
      const pagination = readPagination(req.query);
      if (pagination.error) return sendError(res, 400, 'invalid_pagination', pagination.error);
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      const numericKeys = [
        'minPrice',
        'maxPrice',
        'minExperience',
        'maxExperience',
        'salaryMin',
        'salaryMax',
        'minBudget',
        'maxBudget',
      ];
      const numericValues = {};
      for (const key of numericKeys) {
        const result = readNumberParam(req.query, key, key.includes('Experience') ? 80 : 100000000);
        if (result.error) return sendError(res, 400, 'invalid_filter', result.error);
        numericValues[key] = result.value;
      }
      const booleanKeys = ['verified', 'hasPortfolio', 'hasServices', 'hasProducts'];
      const booleanValues = {};
      for (const key of booleanKeys) {
        const result = readBooleanParam(req.query, key);
        if (result.error) return sendError(res, 400, 'invalid_filter', result.error);
        booleanValues[key] = result.value;
      }
      const availabilityDayResult = readNumberParam(req.query, 'availabilityDay', 6);
      if (availabilityDayResult.error ||
          (availabilityDayResult.value !== null && !Number.isInteger(availabilityDayResult.value))) {
        return sendError(res, 400, 'invalid_filter', 'Availability day must be an integer from 0 to 6.');
      }

      const requestedFilters = [
        ['minPrice', 'maxPrice', ['service', 'product']],
        ['pricingType', 'deliveryMethod', 'providerType', 'availabilityDay', ['service']],
        ['brand', 'stockStatus', ['product']],
        ['minExperience', 'maxExperience', ['professional_profile', 'job']],
        ['hasPortfolio', ['professional_profile']],
        ['employmentType', 'salaryMin', 'salaryMax', 'education', ['job']],
        ['minBudget', 'maxBudget', 'deadline', ['freelance_project']],
        ['businessType', 'hasServices', 'hasProducts', ['business_profile']],
      ];
      for (const group of requestedFilters) {
        const allowedTypes = group[group.length - 1];
        for (const key of group.slice(0, -1)) {
          if (textValues[key] || numericValues[key] !== undefined && numericValues[key] !== null ||
              booleanValues[key] !== undefined && booleanValues[key] !== null ||
              key === 'availabilityDay' && availabilityDayResult.value !== null) {
            if (canonicalType && !allowedTypes.includes(canonicalType)) {
              return sendError(res, 400, 'invalid_filter', `${key} does not apply to this content type.`);
            }
            if (!canonicalType) {
              return sendError(res, 400, 'invalid_filter', `Choose a content type before applying ${key}.`);
            }
          }
        }
      }
      if (textValues.skill && canonicalType && ![
        'professional_profile',
        'job',
        'freelance_project',
      ].includes(canonicalType)) {
        return sendError(res, 400, 'invalid_filter', 'skill does not apply to this content type.');
      }
      if (textValues.workMode && !['job', 'freelance_project'].includes(canonicalType)) {
        return sendError(res, 400, 'invalid_filter', 'workMode applies to jobs and projects only.');
      }
      if (booleanValues.verified !== null && !['professional_profile', 'business_profile'].includes(canonicalType)) {
        return sendError(res, 400, 'invalid_filter', 'verified applies to professionals and businesses only.');
      }
      if (textValues.pricingType &&
          !['fixed', 'hourly', 'per_visit', 'per_day', 'negotiable', 'starting_from', 'quote_required'].includes(textValues.pricingType)) {
        return sendError(res, 400, 'invalid_filter', 'Unsupported service pricing type.');
      }
      if (textValues.deliveryMethod &&
          !['customer_location', 'provider_location', 'online', 'remote', 'hybrid'].includes(textValues.deliveryMethod)) {
        return sendError(res, 400, 'invalid_filter', 'Unsupported service delivery method.');
      }
      if (textValues.employmentType &&
          !['full-time', 'part-time', 'contract', 'temporary', 'internship'].includes(textValues.employmentType)) {
        return sendError(res, 400, 'invalid_filter', 'Unsupported employment type.');
      }
      if (textValues.providerType && !['professional', 'business'].includes(textValues.providerType)) {
        return sendError(res, 400, 'invalid_filter', 'Provider type must be professional or business.');
      }
      if (textValues.stockStatus && !['in_stock', 'low_stock', 'out_of_stock'].includes(textValues.stockStatus)) {
        return sendError(res, 400, 'invalid_filter', 'Unsupported stock status.');
      }
      if (textValues.workMode && !['remote', 'on-site', 'hybrid'].includes(textValues.workMode)) {
        return sendError(res, 400, 'invalid_filter', 'Unsupported work mode.');
      }
      if (textValues.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(textValues.deadline)) {
        return sendError(res, 400, 'invalid_filter', 'Deadline must use YYYY-MM-DD format.');
      }
      if ((numericValues.minPrice !== null && numericValues.maxPrice !== null && numericValues.minPrice > numericValues.maxPrice) ||
          (numericValues.minExperience !== null && numericValues.maxExperience !== null && numericValues.minExperience > numericValues.maxExperience) ||
          (numericValues.salaryMin !== null && numericValues.salaryMax !== null && numericValues.salaryMin > numericValues.salaryMax) ||
          (numericValues.minBudget !== null && numericValues.maxBudget !== null && numericValues.minBudget > numericValues.maxBudget)) {
        return sendError(res, 400, 'invalid_filter', 'Minimum filter values cannot exceed maximum values.');
      }

      const sortOptions = SORT_OPTIONS[canonicalType || 'all'];
      if (!sortOptions.includes(sort)) {
        return sendError(res, 400, 'invalid_sort', 'The selected sort order is not supported for this content type.');
      }

      const params = [];
      const conditions = [PUBLIC_LISTING_ELIGIBILITY];

      if (canonicalType) {
        conditions.push('ml.listing_type = ?');
        params.push(canonicalType);
      }
      if (textValues.categoryId) {
        if (canonicalType === 'professional_profile') {
          conditions.push('EXISTS (SELECT 1 FROM professional_skills ps WHERE ps.professional_user_id = ml.owner_user_id AND ps.category_id = ?)');
        } else if (canonicalType === 'business_profile') {
          conditions.push('EXISTS (SELECT 1 FROM business_categories bc WHERE bc.business_user_id = ml.owner_user_id AND bc.category_id = ?)');
        } else {
          conditions.push('(ml.category_id = ? OR ml.subcategory_id = ?)');
          params.push(textValues.categoryId);
        }
        params.push(textValues.categoryId);
      }
      if (textValues.subcategoryId) {
        conditions.push('ml.subcategory_id = ?');
        params.push(textValues.subcategoryId);
      }
      if (location) {
        conditions.push(`(
          CAST(ml.location AS CHAR) LIKE ?
          OR EXISTS (SELECT 1 FROM service_locations sl WHERE sl.service_id = ml.entity_id
            AND CONCAT_WS(' ', sl.city, sl.state, sl.area, sl.country) LIKE ?)
          OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.location LIKE ?)
          OR EXISTS (SELECT 1 FROM freelance_projects fp WHERE fp.id = ml.entity_id AND fp.location LIKE ?)
          OR JSON_UNQUOTE(JSON_EXTRACT((SELECT pp.profile FROM professional_profiles pp WHERE pp.listing_id = ml.id LIMIT 1), '$.city')) LIKE ?
          OR JSON_UNQUOTE(JSON_EXTRACT((SELECT bp.profile FROM business_profiles bp WHERE bp.listing_id = ml.id LIMIT 1), '$.city')) LIKE ?
        )`);
        const locationLike = `%${location}%`;
        params.push(locationLike, locationLike, locationLike, locationLike, locationLike, locationLike);
      }
      if (q) {
        const keywordParts = [];
        appendKeywordFilter(keywordParts, params, q);
        conditions.push(`(${keywordParts.join(' OR ')})`);
      }
      if (textValues.category) {
        const like = `%${textValues.category}%`;
        conditions.push(`(
          c.name LIKE ? OR subc.name LIKE ? OR sc.name LIKE ? OR ssub.name LIKE ?
          OR JSON_UNQUOTE(JSON_EXTRACT((SELECT pp.profile FROM professional_profiles pp WHERE pp.listing_id = ml.id LIMIT 1), '$.primaryCategory')) LIKE ?
          OR EXISTS (SELECT 1 FROM business_categories bc JOIN categories business_category ON business_category.id = bc.category_id
            WHERE bc.business_user_id = ml.owner_user_id AND business_category.name LIKE ?)
        )`);
        params.push(like, like, like, like, like, like);
      }
      if (textValues.skill) {
        const like = `%${textValues.skill}%`;
        conditions.push(`(
          EXISTS (SELECT 1 FROM professional_skills ps WHERE ps.professional_user_id = ml.owner_user_id AND ps.skill LIKE ?)
          OR EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = ml.entity_id AND js.skill LIKE ?)
          OR EXISTS (SELECT 1 FROM project_skills ps WHERE ps.project_id = ml.entity_id AND ps.skill LIKE ?)
        )`);
        params.push(like, like, like);
      }
      if (textValues.providerType) {
        conditions.push('ml.owner_role = ?');
        params.push(textValues.providerType);
      }
      if (textValues.pricingType) {
        conditions.push('EXISTS (SELECT 1 FROM service_pricing sp WHERE sp.service_id = ml.entity_id AND sp.pricing_type = ?)');
        params.push(textValues.pricingType);
      }
      if (textValues.deliveryMethod) {
        conditions.push('EXISTS (SELECT 1 FROM services s WHERE s.id = ml.entity_id AND s.delivery_method = ?)');
        params.push(textValues.deliveryMethod);
      }
      if (availabilityDayResult.value !== null) {
        conditions.push('EXISTS (SELECT 1 FROM service_availability sa WHERE sa.service_id = ml.entity_id AND sa.day_of_week = ? AND sa.is_unavailable = FALSE)');
        params.push(availabilityDayResult.value);
      }
      if (numericValues.minPrice !== null) {
        conditions.push(`(
          EXISTS (SELECT 1 FROM service_pricing sp WHERE sp.service_id = ml.entity_id
            AND COALESCE(sp.max_price, sp.amount, sp.min_price) >= ?)
          OR EXISTS (SELECT 1 FROM products p WHERE p.id = ml.entity_id AND p.price >= ?)
        )`);
        params.push(numericValues.minPrice, numericValues.minPrice);
      }
      if (numericValues.maxPrice !== null) {
        conditions.push(`(
          EXISTS (SELECT 1 FROM service_pricing sp WHERE sp.service_id = ml.entity_id
            AND COALESCE(sp.min_price, sp.amount, sp.max_price) <= ?)
          OR EXISTS (SELECT 1 FROM products p WHERE p.id = ml.entity_id AND p.price <= ?)
        )`);
        params.push(numericValues.maxPrice, numericValues.maxPrice);
      }
      if (textValues.brand) {
        conditions.push('EXISTS (SELECT 1 FROM products p WHERE p.id = ml.entity_id AND p.brand LIKE ?)');
        params.push(`%${textValues.brand}%`);
      }
      if (textValues.stockStatus) {
        conditions.push('EXISTS (SELECT 1 FROM products p WHERE p.id = ml.entity_id AND p.stock_status = ?)');
        params.push(textValues.stockStatus);
      }
      if (numericValues.minExperience !== null) {
        conditions.push(`(
          EXISTS (SELECT 1 FROM professional_profiles pp WHERE pp.listing_id = ml.id
            AND CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2)) >= ?)
          OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.experience_max >= ?)
        )`);
        params.push(numericValues.minExperience, numericValues.minExperience);
      }
      if (numericValues.maxExperience !== null) {
        conditions.push(`(
          EXISTS (SELECT 1 FROM professional_profiles pp WHERE pp.listing_id = ml.id
            AND CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2)) <= ?)
          OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.experience_min <= ?)
        )`);
        params.push(numericValues.maxExperience, numericValues.maxExperience);
      }
      if (booleanValues.hasPortfolio !== null) {
        conditions.push(`${booleanValues.hasPortfolio ? 'EXISTS' : 'NOT EXISTS'} (
          SELECT 1 FROM professional_portfolio_items pi
           WHERE pi.professional_user_id = ml.owner_user_id AND pi.status = 'published'
        )`);
      }
      if (booleanValues.verified !== null) {
        conditions.push(`${booleanValues.verified ? 'EXISTS' : 'NOT EXISTS'} (
          SELECT 1 FROM user_roles ur
           WHERE ur.user_id = ml.owner_user_id AND ur.role = ml.owner_role
             AND ur.verification_status = 'verified'
        )`);
      }
      if (textValues.employmentType) {
        conditions.push('EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.employment_type = ?)');
        params.push(textValues.employmentType);
      }
      if (textValues.workMode) {
        const table = canonicalType === 'job' ? 'jobs' : 'freelance_projects';
        conditions.push(`EXISTS (SELECT 1 FROM ${table} item WHERE item.id = ml.entity_id AND item.work_mode = ?)`);
        params.push(textValues.workMode);
      }
      if (numericValues.salaryMin !== null) {
        conditions.push('EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.salary_undisclosed = FALSE AND j.salary_max >= ?)');
        params.push(numericValues.salaryMin);
      }
      if (numericValues.salaryMax !== null) {
        conditions.push('EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.salary_undisclosed = FALSE AND j.salary_min <= ?)');
        params.push(numericValues.salaryMax);
      }
      if (textValues.education) {
        conditions.push('EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.education_required LIKE ?)');
        params.push(`%${textValues.education}%`);
      }
      if (numericValues.minBudget !== null) {
        conditions.push('EXISTS (SELECT 1 FROM freelance_projects fp WHERE fp.id = ml.entity_id AND COALESCE(fp.budget_max, fp.budget, 0) >= ?)');
        params.push(numericValues.minBudget);
      }
      if (numericValues.maxBudget !== null) {
        conditions.push('EXISTS (SELECT 1 FROM freelance_projects fp WHERE fp.id = ml.entity_id AND COALESCE(fp.budget_min, fp.budget, 0) <= ?)');
        params.push(numericValues.maxBudget);
      }
      if (textValues.deadline) {
        const parsedDeadline = new Date(`${textValues.deadline}T00:00:00.000Z`);
        if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.toISOString().slice(0, 10) !== textValues.deadline) {
          return sendError(res, 400, 'invalid_filter', 'Deadline must be a valid calendar date.');
        }
        conditions.push('EXISTS (SELECT 1 FROM freelance_projects fp WHERE fp.id = ml.entity_id AND fp.deadline <= ?)');
        params.push(textValues.deadline);
      }
      if (textValues.businessType) {
        conditions.push(`EXISTS (SELECT 1 FROM business_profiles bp WHERE bp.listing_id = ml.id
          AND JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.businessType')) LIKE ?)`);
        params.push(`%${textValues.businessType}%`);
      }
      if (booleanValues.hasServices !== null) {
        conditions.push(`${booleanValues.hasServices ? 'EXISTS' : 'NOT EXISTS'} (
          SELECT 1 FROM marketplace_listings offering
           WHERE offering.owner_user_id = ml.owner_user_id AND offering.listing_type = 'service'
             AND offering.status = 'published' AND offering.is_public = TRUE AND offering.visibility = 'public'
        )`);
      }
      if (booleanValues.hasProducts !== null) {
        conditions.push(`${booleanValues.hasProducts ? 'EXISTS' : 'NOT EXISTS'} (
          SELECT 1 FROM marketplace_listings offering
           WHERE offering.owner_user_id = ml.owner_user_id AND offering.listing_type = 'product'
             AND offering.status = 'published' AND offering.is_public = TRUE AND offering.visibility = 'public'
        )`);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      let orderClause = 'COALESCE(ml.published_at, ml.created_at) DESC, ml.id ASC';
      if (sort === 'relevance' && q) {
        orderClause = `CASE
          WHEN ml.title = ? THEN 5
          WHEN ml.title LIKE ? THEN 4
          WHEN ml.short_summary LIKE ? THEN 3
          WHEN ml.description LIKE ? THEN 2
          WHEN u.name LIKE ? THEN 1 ELSE 0 END DESC,
          COALESCE(ml.published_at, ml.created_at) DESC, ml.id ASC`;
      } else if (sort === 'price_asc' || sort === 'price_desc') {
        const direction = sort === 'price_asc' ? 'ASC' : 'DESC';
        const priceExpression = canonicalType === 'service'
          ? '(SELECT COALESCE(sp.amount, sp.min_price, sp.max_price) FROM services s LEFT JOIN service_pricing sp ON sp.service_id = s.id WHERE s.id = ml.entity_id LIMIT 1)'
          : '(SELECT p.price FROM products p WHERE p.id = ml.entity_id LIMIT 1)';
        orderClause = `${priceExpression} ${direction}, ml.id ASC`;
      } else if (sort === 'rating_desc') {
        orderClause = `(SELECT CASE WHEN s.review_count > 0 THEN s.rating_avg ELSE NULL END
          FROM services s WHERE s.id = ml.entity_id LIMIT 1) DESC, ml.id ASC`;
      } else if (sort === 'discount') {
        orderClause = `(SELECT CASE WHEN p.compare_at_price > p.price
          THEN (p.compare_at_price - p.price) / p.compare_at_price ELSE NULL END
          FROM products p WHERE p.id = ml.entity_id LIMIT 1) DESC, ml.id ASC`;
      } else if (sort === 'experience_desc') {
        orderClause = `(SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2))
          FROM professional_profiles pp WHERE pp.listing_id = ml.id LIMIT 1) DESC, ml.id ASC`;
      } else if (sort === 'salary_desc') {
        orderClause = `(SELECT j.salary_max FROM jobs j WHERE j.id = ml.entity_id LIMIT 1) DESC, ml.id ASC`;
      } else if (sort === 'budget_desc') {
        orderClause = `(SELECT COALESCE(fp.budget_max, fp.budget, fp.budget_min)
          FROM freelance_projects fp WHERE fp.id = ml.entity_id LIMIT 1) DESC, ml.id ASC`;
      } else if (sort === 'deadline_asc') {
        orderClause = `(SELECT fp.deadline FROM freelance_projects fp WHERE fp.id = ml.entity_id LIMIT 1) ASC, ml.id ASC`;
      } else if (sort === 'newest') {
        orderClause = 'COALESCE(ml.published_at, ml.created_at) DESC, ml.id ASC';
      }

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
           FROM marketplace_listings ml
           LEFT JOIN users u ON u.id = ml.owner_user_id
           LEFT JOIN categories c ON c.id = ml.category_id
           LEFT JOIN categories subc ON subc.id = ml.subcategory_id
           LEFT JOIN service_categories sc ON sc.id = ml.category_id
           LEFT JOIN service_subcategories ssub ON ssub.id = ml.subcategory_id
          ${where}`,
        params
      );
      const total = Number(countRows[0]?.total || 0);

      const orderParams = sort === 'relevance' && q
        ? [q, `${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]
        : [];

      const [rows] = await pool.query(
        `${UNIFIED_LISTING_SELECT}
         ${where}
         ORDER BY ${orderClause}
         LIMIT ? OFFSET ?`,
        [...params, ...orderParams, limit, offset]
      );

      const data = await hydrateUnifiedListings(pool, rows, config, { audience: 'public' });
      return res.json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasMore: offset + data.length < total,
        },
        meta: {
          query: q,
          appliedFilters: {
            type: canonicalType || 'all',
            categoryId: textValues.categoryId,
            subcategoryId: textValues.subcategoryId,
            location,
            ...Object.fromEntries(textKeys
              .filter(([key]) => !['q', 'type', 'categoryId', 'subcategoryId', 'location', 'sort'].includes(key))
              .map(([key]) => [key, textValues[key]])
              .filter(([, value]) => value !== null)),
            ...Object.fromEntries(numericKeys.map((key) => [key, numericValues[key]]).filter(([, value]) => value !== null)),
            ...Object.fromEntries(booleanKeys.map((key) => [key, booleanValues[key]]).filter(([, value]) => value !== null)),
            ...(availabilityDayResult.value !== null ? { availabilityDay: availabilityDayResult.value } : {}),
            sort,
          },
          availableTypes: PUBLIC_TYPES,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  // 2. Search Suggestions (Real DB-driven)
  router.get('/customer/marketplace/search/suggestions', async (req, res, next) => {
    try {
      const queryResult = readTextParam(req.query, 'q', 120);
      if (queryResult.error) return sendError(res, 400, 'invalid_query', queryResult.error);
      const typeResult = readTextParam(req.query, 'type', 40);
      if (typeResult.error) return sendError(res, 400, 'invalid_listing_type', typeResult.error);
      const q = queryResult.value || '';
      const rawType = typeResult.value || '';
      const canonicalType = rawType && rawType !== 'all' ? normalizeListingType(rawType) : null;
      if (rawType && rawType !== 'all' && !canonicalType) {
        return sendError(res, 400, 'invalid_listing_type', 'Unsupported listing type filter.');
      }
      if (!q) {
        return res.json({ categories: [], skills: [], listings: [] });
      }
      const like = `%${q}%`;
      const [catRows] = await pool.query(
        `SELECT c.id, c.name, COALESCE(c.listing_type, root.listing_type) AS listing_type
           FROM categories c
           LEFT JOIN categories root ON root.id = c.parent_id
          WHERE c.is_active = TRUE AND c.name LIKE ?
            ${canonicalType ? 'AND COALESCE(c.listing_type, root.listing_type) = ?' : ''}
          ORDER BY c.display_order, c.name LIMIT 5`,
        canonicalType ? [like, CATEGORY_TYPE_MAP[canonicalType]] : [like]
      );
      let sectionCategories = [];
      if (!canonicalType || canonicalType === 'service') {
        const [rows] = await pool.query(
          `SELECT id, name, 'service' AS listing_type FROM service_categories
            WHERE is_active = TRUE AND name LIKE ?
            ORDER BY display_order, name LIMIT 5`,
          [like]
        );
        sectionCategories.push(...rows);
      }
      if (!canonicalType || canonicalType === 'professional_profile') {
        const [rows] = await pool.query(
          `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) AS name
             FROM professional_profiles pp JOIN marketplace_listings ml ON ml.id = pp.listing_id
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) LIKE ?
            ORDER BY name LIMIT 5`,
          [like]
        );
        sectionCategories.push(...rows
          .filter((row) => row.name)
          .map((row) => ({ id: row.name, name: row.name, listing_type: 'professional_profile' })));
      }
      if (!canonicalType || canonicalType === 'business_profile') {
        const [rows] = await pool.query(
          `SELECT DISTINCT c.id, c.name, 'business_profile' AS listing_type
             FROM business_categories bc JOIN categories c ON c.id = bc.category_id
             JOIN business_profiles bp ON bp.user_id = bc.business_user_id
             JOIN marketplace_listings ml ON ml.id = bp.listing_id
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND c.is_active = TRUE AND c.name LIKE ?
            ORDER BY c.name LIMIT 5`,
          [like]
        );
        sectionCategories.push(...rows);
      }
      const keywordParts = [];
      const keywordParams = [];
      appendKeywordFilter(keywordParts, keywordParams, q);
      const [listingRows] = await pool.query(
        `SELECT ml.id, ml.listing_type, ml.title
           ${SEARCH_FROM}
          WHERE ${PUBLIC_LISTING_ELIGIBILITY}
            ${canonicalType ? 'AND ml.listing_type = ?' : ''}
            AND (${keywordParts.join(' OR ')})
          ORDER BY COALESCE(ml.published_at, ml.created_at) DESC, ml.id ASC
          LIMIT 6`,
        [...(canonicalType ? [canonicalType] : []), ...keywordParams]
      );
      const skillQueries = [];
      if (!canonicalType || canonicalType === 'professional_profile') {
        skillQueries.push(pool.query(
          `SELECT DISTINCT ps.skill FROM professional_skills ps
             JOIN professional_profiles pp ON pp.user_id = ps.professional_user_id
             JOIN marketplace_listings ml ON ml.id = pp.listing_id
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND ps.skill LIKE ? ORDER BY ps.skill LIMIT 5`,
          [like]
        ));
      }
      if (!canonicalType || canonicalType === 'job') {
        skillQueries.push(pool.query(
          `SELECT DISTINCT js.skill FROM job_skills js
             JOIN jobs j ON j.id = js.job_id
             JOIN marketplace_listings ml ON ml.entity_id = j.id AND ml.listing_type = 'job'
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND j.status = 'published' AND j.is_active = TRUE
              AND (j.deadline IS NULL OR j.deadline >= CURDATE())
              AND js.skill LIKE ? ORDER BY js.skill LIMIT 5`,
          [like]
        ));
      }
      if (!canonicalType || canonicalType === 'freelance_project') {
        skillQueries.push(pool.query(
          `SELECT DISTINCT ps.skill FROM project_skills ps
             JOIN freelance_projects fp ON fp.id = ps.project_id
             JOIN marketplace_listings ml ON ml.entity_id = fp.id AND ml.listing_type = 'freelance_project'
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND fp.status = 'published' AND fp.is_active = TRUE AND fp.visibility = 'public'
              AND (fp.proposal_deadline IS NULL OR fp.proposal_deadline >= CURDATE())
              AND ps.skill LIKE ? ORDER BY ps.skill LIMIT 5`,
          [like]
        ));
      }
      const skillRows = (await Promise.all(skillQueries)).flatMap(([rows]) => rows);

      return res.json({
        categories: [...catRows, ...sectionCategories].slice(0, 8).map((c) => ({
          id: c.id,
          name: c.name,
          listingType: normalizeListingType(c.listing_type) || c.listing_type,
        })),
        skills: [...new Set(skillRows.map((row) => row.skill))].slice(0, 8),
        listings: listingRows.map((l) => ({
          id: l.id,
          listingType: normalizeListingType(l.listing_type) || l.listing_type,
          title: l.title,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  // 3. Context-Aware Filter Metadata
  router.get('/customer/marketplace/search/filters', async (req, res, next) => {
    try {
      const typeResult = readTextParam(req.query, 'type', 40);
      if (typeResult.error) return sendError(res, 400, 'invalid_listing_type', typeResult.error);
      const rawType = typeResult.value || 'all';
      const canonical = rawType === 'all' ? null : normalizeListingType(rawType);
      if (rawType !== 'all' && !canonical) {
        return sendError(res, 400, 'invalid_listing_type', 'Unsupported listing type filter.');
      }

      const categories = [];
      const subcategories = [];
      const skills = [];
      const filterOptions = {
        brands: [],
        businessTypes: [],
        employmentTypes: [],
        workModes: [],
        pricingTypes: [],
        deliveryMethods: [],
        stockStatuses: [],
        availabilityDays: [],
        providerTypes: [],
      };
      if (!canonical) {
        return res.json({
          type: 'all',
          categories,
          subcategories,
          skills,
          ...filterOptions,
          sortOptions: SORT_OPTIONS.all,
          availableTypes: PUBLIC_TYPES,
        });
      }

      if (canonical === 'service') {
        const [categoryRows] = await pool.query(
          'SELECT id, name, slug FROM service_categories WHERE is_active = TRUE ORDER BY display_order, name'
        );
        categories.push(...categoryRows);
        const [subcategoryRows] = await pool.query(
          `SELECT id, category_id AS categoryId, name, slug
             FROM service_subcategories WHERE is_active = TRUE
            ORDER BY category_id, display_order, name`
        );
        subcategories.push(...subcategoryRows);
        const [pricingRows] = await pool.query(
          `SELECT DISTINCT sp.pricing_type AS value FROM service_pricing sp
             JOIN services s ON s.id = sp.service_id
             JOIN marketplace_listings ml ON ml.entity_id = s.id AND ml.listing_type = 'service'
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND s.status = 'published' ORDER BY value`
        );
        filterOptions.pricingTypes = pricingRows.map((row) => row.value);
        const [deliveryRows] = await pool.query(
          `SELECT DISTINCT s.delivery_method AS value FROM services s
             JOIN marketplace_listings ml ON ml.entity_id = s.id AND ml.listing_type = 'service'
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND s.status = 'published' ORDER BY value`
        );
        filterOptions.deliveryMethods = deliveryRows.map((row) => row.value);
        const [availabilityRows] = await pool.query(
          `SELECT DISTINCT sa.day_of_week AS value FROM service_availability sa
             JOIN services s ON s.id = sa.service_id
             JOIN marketplace_listings ml ON ml.entity_id = s.id AND ml.listing_type = 'service'
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND s.status = 'published' AND sa.is_unavailable = FALSE
            ORDER BY value`
        );
        filterOptions.availabilityDays = availabilityRows.map((row) => Number(row.value));
        const [providerRows] = await pool.query(
          `SELECT DISTINCT ml.owner_role AS value FROM marketplace_listings ml
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND ml.listing_type = 'service' ORDER BY value`
        );
        filterOptions.providerTypes = providerRows.map((row) => row.value);
      } else if (canonical === 'professional_profile') {
        const [categoryRows] = await pool.query(
          `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) AS name
             FROM professional_profiles pp JOIN marketplace_listings ml ON ml.id = pp.listing_id
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) IS NOT NULL
            ORDER BY name LIMIT 100`
        );
        categories.push(...categoryRows
          .filter((row) => row.name)
          .map((row) => ({ id: row.name, name: row.name })));
        const [skillRows] = await pool.query(
          `SELECT DISTINCT ps.skill AS value FROM professional_skills ps
             JOIN professional_profiles pp ON pp.user_id = ps.professional_user_id
             JOIN marketplace_listings ml ON ml.id = pp.listing_id
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
            ORDER BY value LIMIT 100`
        );
        skills.push(...skillRows.map((row) => row.value));
      } else if (canonical === 'business_profile') {
        const [categoryRows] = await pool.query(
          `SELECT DISTINCT c.id, c.name FROM business_categories bc
             JOIN categories c ON c.id = bc.category_id AND c.is_active = TRUE
             JOIN business_profiles bp ON bp.user_id = bc.business_user_id
             JOIN marketplace_listings ml ON ml.id = bp.listing_id
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
            ORDER BY c.name LIMIT 100`
        );
        categories.push(...categoryRows);
        const [businessTypeRows] = await pool.query(
          `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.businessType')) AS value
             FROM business_profiles bp JOIN marketplace_listings ml ON ml.id = bp.listing_id
            WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              AND JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.businessType')) IS NOT NULL
            ORDER BY value LIMIT 100`
        );
        filterOptions.businessTypes = businessTypeRows.map((row) => row.value);
      } else {
        const categoryType = CATEGORY_TYPE_MAP[canonical];
        const [categoryRows] = await pool.query(
          `SELECT c.id, c.name, c.parent_id AS parentId,
                  c.listing_type AS listingType,
                  parent.listing_type AS parentListingType,
                  root.listing_type AS rootListingType
             FROM categories c
             LEFT JOIN categories parent ON parent.id = c.parent_id
             LEFT JOIN categories root ON root.id = parent.parent_id
            WHERE c.is_active = TRUE
              AND (c.listing_type = ? OR parent.listing_type = ? OR root.listing_type = ?)
            ORDER BY COALESCE(root.display_order, c.display_order), c.display_order, c.name`,
          [categoryType, categoryType, categoryType]
        );
        categories.push(...categoryRows.filter((row) => row.parentListingType === categoryType));
        if (!categories.length) {
          categories.push(...categoryRows.filter((row) => row.listingType === categoryType));
        }
        subcategories.push(...categoryRows
          .filter((row) => row.rootListingType === categoryType)
          .map(({ id, name, parentId }) => ({ id, name, categoryId: parentId })));

        if (canonical === 'product') {
          const [brandRows] = await pool.query(
            `SELECT DISTINCT p.brand AS value FROM products p
               JOIN marketplace_listings ml ON ml.entity_id = p.id AND ml.listing_type = 'product'
              WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
                AND p.status = 'published' AND p.is_active = TRUE AND p.brand IS NOT NULL
              ORDER BY value LIMIT 100`
          );
          filterOptions.brands = brandRows.map((row) => row.value);
          const [stockRows] = await pool.query(
            `SELECT DISTINCT p.stock_status AS value FROM products p
               JOIN marketplace_listings ml ON ml.entity_id = p.id AND ml.listing_type = 'product'
              WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
                AND p.status = 'published' AND p.is_active = TRUE ORDER BY value`
          );
          filterOptions.stockStatuses = stockRows.map((row) => row.value);
        } else if (canonical === 'job') {
          const [employmentRows] = await pool.query(
            `SELECT DISTINCT j.employment_type AS value FROM jobs j
               JOIN marketplace_listings ml ON ml.entity_id = j.id AND ml.listing_type = 'job'
              WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
                AND j.status = 'published' AND j.is_active = TRUE
                AND (j.deadline IS NULL OR j.deadline >= CURDATE()) ORDER BY value`
          );
          filterOptions.employmentTypes = employmentRows.map((row) => row.value);
          const [workModeRows] = await pool.query(
            `SELECT DISTINCT j.work_mode AS value FROM jobs j
               JOIN marketplace_listings ml ON ml.entity_id = j.id AND ml.listing_type = 'job'
              WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
                AND j.status = 'published' AND j.is_active = TRUE ORDER BY value`
          );
          filterOptions.workModes = workModeRows.map((row) => row.value);
          const [skillRows] = await pool.query(
            `SELECT DISTINCT js.skill AS value FROM job_skills js
               JOIN jobs j ON j.id = js.job_id
               JOIN marketplace_listings ml ON ml.entity_id = j.id AND ml.listing_type = 'job'
              WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
                AND j.status = 'published' AND j.is_active = TRUE
              ORDER BY value LIMIT 100`
          );
          skills.push(...skillRows.map((row) => row.value));
        } else if (canonical === 'freelance_project') {
          const [workModeRows] = await pool.query(
            `SELECT DISTINCT fp.work_mode AS value FROM freelance_projects fp
               JOIN marketplace_listings ml ON ml.entity_id = fp.id AND ml.listing_type = 'freelance_project'
              WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
                AND fp.status = 'published' AND fp.is_active = TRUE AND fp.visibility = 'public'
              ORDER BY value`
          );
          filterOptions.workModes = workModeRows.map((row) => row.value).filter(Boolean);
          const [skillRows] = await pool.query(
            `SELECT DISTINCT ps.skill AS value FROM project_skills ps
               JOIN freelance_projects fp ON fp.id = ps.project_id
               JOIN marketplace_listings ml ON ml.entity_id = fp.id AND ml.listing_type = 'freelance_project'
              WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
                AND fp.status = 'published' AND fp.is_active = TRUE AND fp.visibility = 'public'
              ORDER BY value LIMIT 100`
          );
          skills.push(...skillRows.map((row) => row.value));
        }
      }

      return res.json({
        type: canonical,
        categories,
        subcategories,
        skills,
        ...filterOptions,
        sortOptions: SORT_OPTIONS[canonical],
        availableTypes: PUBLIC_TYPES,
      });
    } catch (error) {
      return next(error);
    }
  });

  // 4. Private Customer Search History
  router.get('/customer/marketplace/search/history', authenticate, async (req, res, next) => {
    try {
      await pruneSearchHistory(pool, req.auth.userId);
      const [rows] = await pool.query(
        `SELECT id, query, listing_type, created_at
           FROM customer_search_history
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 20`,
        [req.auth.userId]
      );
      return res.json({
        items: rows.map((r) => ({
          id: r.id,
          query: r.query,
          listingType: r.listing_type || 'all',
          createdAt: r.created_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/customer/marketplace/search/history', authenticate, async (req, res, next) => {
    try {
      const q = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      if (!q || q.length > 160) {
        return sendError(res, 400, 'validation_error', 'Search query is required and must be at most 160 characters.');
      }
      const rawType = typeof req.body?.listingType === 'string' ? req.body.listingType.trim() : null;
      const canonical = rawType && rawType !== 'all' ? normalizeListingType(rawType) : null;
      if (rawType && rawType !== 'all' && !canonical) {
        return sendError(res, 400, 'invalid_listing_type', 'Unsupported listing type filter.');
      }

      await pool.query(
        'DELETE FROM customer_search_history WHERE user_id = ? AND query = ?',
        [req.auth.userId, q]
      );
      const id = randomUUID();
      await pool.query(
        'INSERT INTO customer_search_history (id, user_id, query, listing_type) VALUES (?, ?, ?, ?)',
        [id, req.auth.userId, q, canonical]
      );
      await pruneSearchHistory(pool, req.auth.userId);
      return res.status(201).json({ item: { id, query: q, listingType: canonical || 'all' } });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/customer/marketplace/search/history/:id', authenticate, async (req, res, next) => {
    try {
      const [result] = await pool.query(
        'DELETE FROM customer_search_history WHERE id = ? AND user_id = ?',
        [req.params.id, req.auth.userId]
      );
      if (!result.affectedRows) return sendError(res, 404, 'not_found', 'Search history entry was not found.');
      return res.json({ deleted: true });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/customer/marketplace/search/history', authenticate, async (req, res, next) => {
    try {
      await pool.query('DELETE FROM customer_search_history WHERE user_id = ?', [req.auth.userId]);
      return res.json({ cleared: true });
    } catch (error) {
      return next(error);
    }
  });

  // 5. Rule-Based Customer Recommendations (No fake AI/popularity)
  router.get('/customer/marketplace/recommendations', async (req, res, next) => {
    try {
      const viewerId = await resolveOptionalUserId(req, authenticate);
      const locationResult = readTextParam(req.query, 'location', 120);
      if (locationResult.error) return sendError(res, 400, 'invalid_query', locationResult.error);
      const limitText = req.query.limit === undefined ? '10' : req.query.limit;
      if (typeof limitText !== 'string' || !/^\d+$/.test(limitText)) {
        return sendError(res, 400, 'invalid_pagination', 'Limit must be a whole number between 1 and 20.');
      }
      const limit = Number(limitText);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        return sendError(res, 400, 'invalid_pagination', 'Limit must be a whole number between 1 and 20.');
      }
      const location = locationResult.value;
      let searchTerms = [];

      if (viewerId) {
        const [hist] = await pool.query(
          `SELECT query FROM customer_search_history
            WHERE user_id = ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
            ORDER BY created_at DESC, id DESC LIMIT 3`,
          [viewerId]
        );
        searchTerms = hist.map((h) => h.query).filter(Boolean);
      }

      const params = [];
      const conditions = [
        PUBLIC_LISTING_ELIGIBILITY,
        `(ml.listing_type <> 'product' OR EXISTS (
          SELECT 1 FROM products available_product
           WHERE available_product.id = ml.entity_id
             AND available_product.stock_quantity > 0
             AND available_product.stock_status <> 'out_of_stock'
        ))`,
      ];
      if (viewerId) {
        conditions.push('ml.owner_user_id <> ?');
        params.push(viewerId);
      }
      if (location) {
        conditions.push(`(
          CAST(ml.location AS CHAR) LIKE ?
          OR EXISTS (SELECT 1 FROM service_locations sl WHERE sl.service_id = ml.entity_id
            AND CONCAT_WS(' ', sl.city, sl.state, sl.area, sl.country) LIKE ?)
          OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.entity_id AND j.location LIKE ?)
          OR EXISTS (SELECT 1 FROM freelance_projects fp WHERE fp.id = ml.entity_id AND fp.location LIKE ?)
          OR JSON_UNQUOTE(JSON_EXTRACT((SELECT pp.profile FROM professional_profiles pp WHERE pp.listing_id = ml.id LIMIT 1), '$.city')) LIKE ?
          OR JSON_UNQUOTE(JSON_EXTRACT((SELECT bp.profile FROM business_profiles bp WHERE bp.listing_id = ml.id LIMIT 1), '$.city')) LIKE ?
        )`);
        const locationLike = `%${location}%`;
        params.push(locationLike, locationLike, locationLike, locationLike, locationLike, locationLike);
      }
      const where = `WHERE ${conditions.join(' AND ')}`;
      const relevanceClauses = searchTerms.map(() =>
        '(ml.title LIKE ? OR ml.short_summary LIKE ? OR ml.description LIKE ? OR u.name LIKE ?)'
      );
      const relevanceParams = searchTerms.flatMap((term) => Array(4).fill(`%${term}%`));
      const orderBy = relevanceClauses.length
        ? `CASE ${relevanceClauses.map((clause, index) => `WHEN ${clause} THEN ${searchTerms.length - index}`).join(' ')}
             ELSE 0 END DESC, COALESCE(ml.published_at, ml.created_at) DESC, ml.id ASC`
        : 'COALESCE(ml.published_at, ml.created_at) DESC, ml.id ASC';

      const [rows] = await pool.query(
        `${UNIFIED_LISTING_SELECT}
         ${where}
         ORDER BY ${orderBy}
         LIMIT ?`,
        [...params, ...relevanceParams, limit]
      );

      let items = await hydrateUnifiedListings(pool, rows, config, { audience: 'public' });
      let usedLocation = Boolean(location);
      if (!items.length && location) {
        usedLocation = false;
        const fallbackConditions = [
          PUBLIC_LISTING_ELIGIBILITY,
          `(ml.listing_type <> 'product' OR EXISTS (
            SELECT 1 FROM products available_product
             WHERE available_product.id = ml.entity_id
               AND available_product.stock_quantity > 0
               AND available_product.stock_status <> 'out_of_stock'
          ))`,
        ];
        const fallbackParams = [];
        if (viewerId) {
          fallbackConditions.push('ml.owner_user_id <> ?');
          fallbackParams.push(viewerId);
        }
        const [fallbackRows] = await pool.query(
          `${UNIFIED_LISTING_SELECT}
           WHERE ${fallbackConditions.join(' AND ')}
           ORDER BY ${orderBy}
           LIMIT ?`,
          [...fallbackParams, ...relevanceParams, limit]
        );
        items = await hydrateUnifiedListings(pool, fallbackRows, config, { audience: 'public' });
      }

      const signals = [];
      if (searchTerms.length) signals.push('recent_searches');
      if (usedLocation) signals.push('selected_location');
      return res.json({
        items,
        signals: signals.length ? signals : ['latest_published'],
      });
    } catch (error) {
      return next(error);
    }
  });
}

