import { randomUUID } from 'node:crypto';
import { createPrivateReadUrl, deletePrivateObject, createB2Client } from './storage.js';
import {
  CANONICAL_LISTING_TYPES,
  normalizeListingType,
  syncMarketplaceListing,
  toCategorySection,
} from './marketplace-listings.js';

export const LISTING_STATUSES = Object.freeze([
  'draft',
  'pending_review',
  'published',
  'rejected',
  'paused',
  'archived',
]);

export const VISIBILITY_OPTIONS = Object.freeze(['public', 'unlisted', 'private']);

const VALID_STATUS_SET = new Set(LISTING_STATUSES);
const VALID_VISIBILITY_SET = new Set(VISIBILITY_OPTIONS);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_MIME_TYPES = new Set(['video/mp4']);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf']);
const PRIVATE_PURPOSES = new Set(['certificate', 'verification-document']);

const OWNER_TRANSITIONS = {
  draft: new Set(['draft', 'pending_review', 'published', 'archived']),
  pending_review: new Set(['pending_review', 'draft', 'archived']),
  published: new Set(['published', 'paused', 'draft', 'archived']),
  paused: new Set(['paused', 'published', 'pending_review', 'draft', 'archived']),
  rejected: new Set(['rejected', 'draft', 'pending_review', 'archived']),
  archived: new Set([]),
};

const ADMIN_TRANSITIONS = {
  approve: {
    allowedFrom: new Set(['pending_review', 'rejected', 'paused', 'draft']),
    toStatus: 'published',
    moderationStatus: 'approved',
  },
  reject: {
    allowedFrom: new Set(['pending_review', 'published', 'paused', 'draft']),
    toStatus: 'rejected',
    moderationStatus: 'rejected',
    requiresReason: true,
  },
  pause: {
    allowedFrom: new Set(['published']),
    toStatus: 'paused',
    moderationStatus: null,
  },
  archive: {
    allowedFrom: new Set(['draft', 'pending_review', 'published', 'paused', 'rejected']),
    toStatus: 'archived',
    moderationStatus: null,
  },
};

export function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function profileImageAssetId(value) {
  if (typeof value === 'string') return value.trim() || null;
  return value && typeof value === 'object' && typeof value.id === 'string'
    ? value.id.trim() || null
    : null;
}

async function loadPublicProfileImageUrls(pool, config, candidates) {
  const assetIds = [...new Set(candidates.map((candidate) => candidate.assetId).filter(Boolean))];
  if (!assetIds.length) return new Map();

  const [assets] = await pool.query(
    `SELECT id, user_id, role, purpose, object_key
       FROM media_assets
      WHERE id IN (${assetIds.map(() => '?').join(', ')})`,
    assetIds
  );
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const urlsByAssetId = new Map();
  const urlsByUserId = new Map();

  for (const candidate of candidates) {
    const asset = assetsById.get(candidate.assetId);
    if (!asset ||
        asset.user_id !== candidate.userId ||
        asset.role !== candidate.role ||
        asset.purpose !== candidate.purpose ||
        !asset.object_key) {
      continue;
    }
    if (!urlsByAssetId.has(asset.id)) {
      urlsByAssetId.set(asset.id, await createPrivateReadUrl(config, asset.object_key));
    }
    const url = urlsByAssetId.get(asset.id);
    if (url && !urlsByUserId.has(candidate.userId)) urlsByUserId.set(candidate.userId, url);
  }
  return urlsByUserId;
}

export async function withTransaction(pool, callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve original error
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function getUserCapabilities(pool, userId) {
  const [roleRows] = await pool.query(
    `SELECT role, is_primary, profile_completion_status, verification_status
       FROM user_roles
      WHERE user_id = ?`,
    [userId]
  );
  const roles = roleRows.map((row) => row.role);
  const roleSet = new Set(roles);

  let businessProfile = null;
  let businessHiringEnabled = false;
  if (roleSet.has('business')) {
    const [bpRows] = await pool.query(
      `SELECT user_id, listing_id, hiring_enabled, profile
         FROM business_profiles
        WHERE user_id = ? LIMIT 1`,
      [userId]
    ).catch(async () => {
      const [fallback] = await pool.query(
        'SELECT user_id, profile FROM business_profiles WHERE user_id = ? LIMIT 1',
        [userId]
      );
      return [fallback];
    });
    if (bpRows[0]) {
      businessProfile = bpRows[0];
      const parsed = parseJson(bpRows[0].profile, {});
      businessHiringEnabled = Boolean(bpRows[0].hiring_enabled) ||
        parsed.hiringEnabled === true ||
        parsed.hiringEnabled === 'true';
    }
  }

  const allowedTypes = new Set();
  if (roleSet.has('professional')) {
    allowedTypes.add('service');
    allowedTypes.add('professional_profile');
  }
  if (roleSet.has('business')) {
    allowedTypes.add('service');
    allowedTypes.add('product');
    allowedTypes.add('business_profile');
    if (businessHiringEnabled) {
      allowedTypes.add('job');
    }
  }
  if (roleSet.has('hiring')) {
    allowedTypes.add('job');
    allowedTypes.add('freelance_project');
  }

  return {
    roles,
    roleSet,
    isAdmin: roleSet.has('admin'),
    businessHiringEnabled,
    businessProfile,
    allowedCreateTypes: CANONICAL_LISTING_TYPES.filter((type) => allowedTypes.has(type)),
  };
}

export function resolveOwnerRoleForType(capabilities, listingType, requestedRole = null) {
  const canonicalType = normalizeListingType(listingType);
  if (!canonicalType) {
    return { ok: false, status: 400, code: 'invalid_listing_type', message: 'Unsupported listing type.' };
  }

  const checkRole = (role) => {
    if (!capabilities.roleSet.has(role)) {
      return {
        ok: false,
        status: 403,
        code: 'forbidden_role',
        message: `Your account does not hold the ${role} role.`,
      };
    }
    return null;
  };

  if (canonicalType === 'product' || canonicalType === 'business_profile') {
    if (requestedRole && requestedRole !== 'business') {
      return {
        ok: false,
        status: 403,
        code: 'forbidden_role',
        message: `Only business accounts can manage ${canonicalType.replace('_', ' ')} listings.`,
      };
    }
    const denied = checkRole('business');
    if (denied) return denied;
    return { ok: true, ownerRole: 'business', canonicalType };
  }

  if (canonicalType === 'professional_profile') {
    if (requestedRole && requestedRole !== 'professional') {
      return {
        ok: false,
        status: 403,
        code: 'forbidden_role',
        message: 'Only professional accounts can manage a professional profile listing.',
      };
    }
    const denied = checkRole('professional');
    if (denied) return denied;
    return { ok: true, ownerRole: 'professional', canonicalType };
  }

  if (canonicalType === 'freelance_project') {
    if (requestedRole && requestedRole !== 'hiring') {
      return {
        ok: false,
        status: 403,
        code: 'forbidden_role',
        message: 'Only hiring accounts can create or manage freelance projects.',
      };
    }
    const denied = checkRole('hiring');
    if (denied) return denied;
    return { ok: true, ownerRole: 'hiring', canonicalType };
  }

  if (canonicalType === 'service') {
    if (requestedRole) {
      if (!['professional', 'business'].includes(requestedRole)) {
        return {
          ok: false,
          status: 403,
          code: 'forbidden_role',
          message: 'Only professional or business accounts can manage services.',
        };
      }
      const denied = checkRole(requestedRole);
      if (denied) return denied;
      return { ok: true, ownerRole: requestedRole, canonicalType };
    }
    if (capabilities.roleSet.has('professional')) {
      return { ok: true, ownerRole: 'professional', canonicalType };
    }
    if (capabilities.roleSet.has('business')) {
      return { ok: true, ownerRole: 'business', canonicalType };
    }
    return {
      ok: false,
      status: 403,
      code: 'forbidden_role',
      message: 'Only professional or business accounts can manage services.',
    };
  }

  if (canonicalType === 'job') {
    if (requestedRole) {
      if (!['hiring', 'business'].includes(requestedRole)) {
        return {
          ok: false,
          status: 403,
          code: 'forbidden_role',
          message: 'Only hiring or hiring-enabled business accounts can manage job posts.',
        };
      }
      const denied = checkRole(requestedRole);
      if (denied) return denied;
      if (requestedRole === 'business' && !capabilities.businessHiringEnabled) {
        return {
          ok: false,
          status: 403,
          code: 'hiring_capability_disabled',
          message: 'Enable business hiring capability before posting jobs as a business.',
        };
      }
      return { ok: true, ownerRole: requestedRole, canonicalType };
    }
    if (capabilities.roleSet.has('hiring')) {
      return { ok: true, ownerRole: 'hiring', canonicalType };
    }
    if (capabilities.roleSet.has('business')) {
      if (!capabilities.businessHiringEnabled) {
        return {
          ok: false,
          status: 403,
          code: 'hiring_capability_disabled',
          message: 'Enable business hiring capability before posting jobs as a business.',
        };
      }
      return { ok: true, ownerRole: 'business', canonicalType };
    }
    return {
      ok: false,
      status: 403,
      code: 'forbidden_role',
      message: 'Only hiring or hiring-enabled business accounts can post jobs.',
    };
  }

  return { ok: false, status: 403, code: 'forbidden_role', message: 'Not permitted.' };
}

export async function getModerationPolicy(pool, config = {}) {
  const configured = (config?.moderation?.requireReviewTypes || [])
    .map((item) => (item === 'all' ? 'all' : normalizeListingType(item)))
    .filter(Boolean);

  let dbPolicy = {};
  const [rows] = await pool.query(
    `SELECT setting_value FROM marketplace_settings WHERE setting_key = 'moderation_policy' LIMIT 1`
  );
  if (rows[0]) {
    dbPolicy = parseJson(rows[0].setting_value, null);
    if (!isRecord(dbPolicy)) {
      throw new Error('Marketplace moderation policy is invalid.');
    }
    if (dbPolicy.requireReviewTypes !== undefined && !Array.isArray(dbPolicy.requireReviewTypes)) {
      throw new Error('Marketplace moderation policy requireReviewTypes must be an array.');
    }
  }

  const dbTypes = Array.isArray(dbPolicy.requireReviewTypes)
    ? dbPolicy.requireReviewTypes
      .map((item) => (item === 'all' ? 'all' : normalizeListingType(item)))
      .filter(Boolean)
    : [];

  return {
    requireReviewTypes: [...new Set([...configured, ...dbTypes])],
    defaultVisibility: VALID_VISIBILITY_SET.has(dbPolicy.defaultVisibility)
      ? dbPolicy.defaultVisibility
      : 'public',
  };
}

export function requiresReviewForType(policy, listingType) {
  const canonical = normalizeListingType(listingType) || listingType;
  return Boolean(
    policy?.requireReviewTypes?.includes('all') ||
    policy?.requireReviewTypes?.includes(canonical)
  );
}

export function validateOwnerTransition({
  fromStatus,
  toStatus,
  listingType,
  moderationPolicy,
  moderationStatus,
}) {
  if (!VALID_STATUS_SET.has(toStatus)) {
    return { ok: false, status: 400, code: 'invalid_status', message: 'Unsupported listing status.' };
  }
  if (toStatus === 'rejected') {
    return {
      ok: false,
      status: 403,
      code: 'forbidden_moderation_status',
      message: 'Only authorized administrators can mark a listing as rejected.',
    };
  }
  const allowed = OWNER_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.has(toStatus)) {
    return {
      ok: false,
      status: 409,
      code: 'invalid_status_transition',
      message: `Cannot change status from ${fromStatus} to ${toStatus}.`,
    };
  }
  if (
    toStatus === 'published' &&
    fromStatus !== 'published' &&
    requiresReviewForType(moderationPolicy, listingType) &&
    moderationStatus !== 'approved'
  ) {
    return {
      ok: false,
      status: 409,
      code: 'review_required',
      message: 'This listing type requires moderation approval before publishing. Submit it for review.',
    };
  }
  return { ok: true, toStatus };
}

export function validateAdminModeration({ fromStatus, action, reason }) {
  const rule = ADMIN_TRANSITIONS[action];
  if (!rule) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_moderation_action',
      message: 'Action must be approve, reject, pause, or archive.',
    };
  }
  if (!rule.allowedFrom.has(fromStatus)) {
    return {
      ok: false,
      status: 409,
      code: 'invalid_status_transition',
      message: `Cannot ${action} a listing in ${fromStatus} status.`,
    };
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (rule.requiresReason && !trimmedReason) {
    return {
      ok: false,
      status: 400,
      code: 'moderation_reason_required',
      message: 'Provide a moderation reason when rejecting a listing.',
    };
  }
  return {
    ok: true,
    toStatus: rule.toStatus,
    moderationStatus: rule.moderationStatus,
    reason: trimmedReason || null,
  };
}

export async function recordStatusHistory(
  connection,
  { listingId, listingType, fromStatus = null, toStatus, userId = null, role = null, reason = null }
) {
  await connection.query(
    `INSERT INTO listing_status_history
       (id, listing_id, listing_type, from_status, to_status, changed_by_user_id, changed_by_role, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      listingId,
      normalizeListingType(listingType) || listingType,
      fromStatus,
      toStatus,
      userId,
      role,
      reason,
    ]
  );
}

export async function validateAndResolveCategory(pool, listingType, categoryId, subcategoryId, { required = true } = {}) {
  const canonicalType = normalizeListingType(listingType);
  if (!categoryId) {
    if (!required) return { ok: true, categoryId: null, subcategoryId: null };
    return { ok: false, message: 'Select a category.' };
  }
  if (typeof categoryId !== 'string' || !categoryId.trim()) {
    return { ok: false, message: 'Select a valid category.' };
  }
  const cleanCategoryId = categoryId.trim();
  const cleanSubcategoryId = typeof subcategoryId === 'string' && subcategoryId.trim()
    ? subcategoryId.trim()
    : null;

  if (canonicalType === 'service') {
    const [svcCats] = await pool.query(
      'SELECT id, slug, name, description, display_order FROM service_categories WHERE id = ? AND is_active = TRUE LIMIT 1',
      [cleanCategoryId]
    );
    if (svcCats.length) {
      if (cleanSubcategoryId) {
        const [svcSubs] = await pool.query(
          'SELECT id FROM service_subcategories WHERE id = ? AND category_id = ? AND is_active = TRUE LIMIT 1',
          [cleanSubcategoryId, cleanCategoryId]
        );
        if (!svcSubs.length) {
          return { ok: false, message: 'The selected subcategory does not belong to this category.' };
        }
      }
      return { ok: true, categoryId: cleanCategoryId, subcategoryId: cleanSubcategoryId };
    }

    // Fallback: allow categories from unified categories tree (section='service') and mirror safely
    const [treeCats] = await pool.query(
      `SELECT c.id, c.slug, c.name, c.description, c.display_order
         FROM categories c
         LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE c.id = ? AND c.is_active = TRUE
          AND (c.listing_type = 'service' OR parent.listing_type = 'service')
        LIMIT 1`,
      [cleanCategoryId]
    );
    if (!treeCats.length) {
      return { ok: false, message: 'The selected service category is unavailable.' };
    }
    const cat = treeCats[0];
    await pool.query(
      `INSERT IGNORE INTO service_categories (id, slug, name, description, is_active, display_order)
       VALUES (?, ?, ?, ?, TRUE, ?)`,
      [cat.id, `svc-${cat.id.slice(0, 8)}-${String(cat.slug).slice(0, 60)}`, cat.name, cat.description, cat.display_order || 0]
    );
    if (cleanSubcategoryId) {
      const [treeSubs] = await pool.query(
        'SELECT id, slug, name, description, display_order FROM categories WHERE id = ? AND parent_id = ? AND is_active = TRUE LIMIT 1',
        [cleanSubcategoryId, cleanCategoryId]
      );
      if (!treeSubs.length) {
        return { ok: false, message: 'The selected subcategory does not belong to this category.' };
      }
      const sub = treeSubs[0];
      await pool.query(
        `INSERT IGNORE INTO service_subcategories (id, category_id, slug, name, description, is_active, display_order)
         VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
        [sub.id, cleanCategoryId, `sub-${sub.id.slice(0, 8)}-${String(sub.slug).slice(0, 60)}`, sub.name, sub.description, sub.display_order || 0]
      );
    }
    return { ok: true, categoryId: cleanCategoryId, subcategoryId: cleanSubcategoryId };
  }

  const section = toCategorySection(canonicalType);
  const [rows] = await pool.query(
    `SELECT c.id
       FROM categories c
       LEFT JOIN categories parent ON parent.id = c.parent_id
       LEFT JOIN categories grandparent ON grandparent.id = parent.parent_id
      WHERE c.id = ? AND c.is_active = TRUE
        AND (c.listing_type = ? OR parent.listing_type = ? OR grandparent.listing_type = ?)
      LIMIT 1`,
    [cleanCategoryId, section, section, section]
  );
  if (!rows.length) {
    return { ok: false, message: 'Select a valid category for this listing type.' };
  }
  if (cleanSubcategoryId) {
    const [subRows] = await pool.query(
      'SELECT id FROM categories WHERE id = ? AND parent_id = ? AND is_active = TRUE LIMIT 1',
      [cleanSubcategoryId, cleanCategoryId]
    );
    if (!subRows.length) {
      return { ok: false, message: 'The selected subcategory does not belong to this category.' };
    }
  }
  return { ok: true, categoryId: cleanCategoryId, subcategoryId: cleanSubcategoryId };
}

function optionalText(value, maxLength, fieldName) {
  if (value === undefined || value === null || value === '') return { value: null };
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

function numberValue(value, fieldName, { optional = true, min = 0, allowZero = false, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return optional ? { value: null } : { error: `${fieldName} is required.` };
  }
  const parsed = Number(value);
  const minValid = allowZero ? parsed >= min : parsed > min;
  if (!Number.isFinite(parsed) || !minValid || parsed > 100000000 || (integer && !Number.isInteger(parsed))) {
    return { error: `${fieldName} must be a valid ${integer ? 'integer' : 'number'}.` };
  }
  return { value: parsed };
}

function stringList(value, fieldName, { maxItems = 30, maxLength = 120 } = {}) {
  if (value === undefined || value === null || value === '') return { value: [] };
  const items = typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : value;
  if (
    !Array.isArray(items) ||
    items.length > maxItems ||
    items.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > maxLength)
  ) {
    return { error: `${fieldName} must contain at most ${maxItems} valid text entries.` };
  }
  return { value: [...new Set(items.map((item) => item.trim()))] };
}

function normalizeVisibility(value, fallback = 'public') {
  if (value === undefined || value === null || value === '') return { value: fallback };
  if (!VALID_VISIBILITY_SET.has(value)) {
    return { error: 'Visibility must be public, unlisted, or private.' };
  }
  return { value };
}

function normalizeLocationObject(input) {
  if (!input) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? { city: trimmed } : null;
  }
  if (!isRecord(input)) return null;
  const out = {};
  for (const key of ['city', 'state', 'country', 'area', 'workMode']) {
    if (typeof input[key] === 'string' && input[key].trim()) {
      out[key] = input[key].trim().slice(0, 120);
    }
  }
  if (input.radiusKm !== undefined && input.radiusKm !== null && input.radiusKm !== '') {
    const r = Number(input.radiusKm);
    if (Number.isFinite(r) && r > 0) out.radiusKm = r;
  }
  return Object.keys(out).length ? out : null;
}

const DELIVERY_METHODS = new Set(['customer_location', 'provider_location', 'online', 'remote', 'hybrid']);
const PRICING_TYPES = new Set(['fixed', 'hourly', 'per_visit', 'per_day', 'negotiable', 'starting_from', 'quote_required']);
const DURATION_UNITS = new Set(['minutes', 'hours', 'days']);
const EMPLOYMENT_TYPES = new Set(['full-time', 'part-time', 'contract', 'temporary', 'internship']);
const WORK_MODES = new Set(['on-site', 'remote', 'hybrid']);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function normalizePricingTypeAlias(raw) {
  if (raw === 'starting_at') return 'starting_from';
  return raw;
}

export function normalizePackagesOrAddons(value, fieldName, isAddon = false) {
  if (value === undefined || value === null || value === '') return { value: [] };
  if (!Array.isArray(value) || value.length > 10) {
    return { error: `${fieldName} must contain at most 10 items.` };
  }
  const items = [];
  for (const [idx, item] of value.entries()) {
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) {
      return { error: `${fieldName} item ${idx + 1} requires a name.` };
    }
    const price = numberValue(item.price, `${fieldName} price`, { optional: true, min: 0, allowZero: true });
    if (price.error) return { error: price.error };
    if (isAddon) {
      const durationMinutes = numberValue(item.durationMinutes, 'Duration minutes', { optional: true, min: 0, integer: true });
      if (durationMinutes.error) return { error: durationMinutes.error };
      items.push({
        name: item.name.trim().slice(0, 120),
        price: price.value,
        durationMinutes: durationMinutes.value,
      });
    } else {
      const durationValue = numberValue(item.durationValue, 'Package duration', { optional: true, min: 0 });
      if (durationValue.error) return { error: durationValue.error };
      items.push({
        name: item.name.trim().slice(0, 120),
        description: typeof item.description === 'string' ? item.description.trim().slice(0, 500) || null : null,
        price: price.value,
        durationValue: durationValue.value,
        durationUnit: DURATION_UNITS.has(item.durationUnit) ? item.durationUnit : null,
      });
    }
  }
  return { value: items };
}

export function normalizeUnifiedListingInput(listingType, input = {}, { isDraft = false } = {}) {
  if (!isRecord(input)) {
    return { error: 'A valid listing payload object is required.' };
  }
  const canonicalType = normalizeListingType(listingType);
  if (!canonicalType) {
    return { error: 'Unsupported listing type.' };
  }

  const rawDetails = isRecord(input.details) ? input.details : {};
  const merged = { ...rawDetails, ...input };
  const visibility = normalizeVisibility(merged.visibility);
  if (visibility.error) return { error: visibility.error };

  const rawTitle = merged.title ?? merged.name ?? merged.fullName ?? merged.companyName;
  const title = isDraft
    ? optionalText(rawTitle, 180, 'Title')
    : requiredText(rawTitle, 180, 'Title');
  if (title.error) return { error: title.error };
  const effectiveTitle = title.value || 'Untitled draft';

  const rawShortSummary = merged.shortSummary ?? merged.shortDescription ?? merged.headline;
  const shortSummary = optionalText(rawShortSummary, 500, 'Short summary');
  if (shortSummary.error) return { error: shortSummary.error };

  const rawDescription = merged.description ?? merged.bio ?? merged.detailedDescription;
  const description = isDraft
    ? optionalText(rawDescription, 10000, 'Description')
    : requiredText(rawDescription, 10000, 'Description');
  if (description.error) return { error: description.error };

  const currency = typeof merged.currency === 'string' && merged.currency.trim()
    ? merged.currency.trim().toUpperCase().slice(0, 8)
    : 'INR';
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: 'Currency must be a three-letter code such as INR or USD.' };
  }

  if (canonicalType === 'service') {
    const shortDesc = isDraft
      ? (shortSummary.value || description.value?.slice(0, 500) || 'Draft service summary')
      : shortSummary.value;
    if (!isDraft && !shortDesc) {
      return { error: 'Short summary is required for a service listing.' };
    }
    const deliveryMethod = merged.deliveryMethod || 'customer_location';
    if (!DELIVERY_METHODS.has(deliveryMethod)) {
      return { error: 'Select a valid service delivery method.' };
    }
    const pricingType = normalizePricingTypeAlias(merged.pricingType || (isDraft ? 'negotiable' : null));
    if (!PRICING_TYPES.has(pricingType)) {
      return { error: 'Select a valid pricing model.' };
    }
    const priceOptional = isDraft || pricingType === 'negotiable' || pricingType === 'quote_required';
    const price = numberValue(merged.price, 'Price', {
      optional: priceOptional,
      min: 0,
    });
    const minPrice = numberValue(merged.minPrice, 'Minimum price', { optional: true, min: 0 });
    const maxPrice = numberValue(merged.maxPrice, 'Maximum price', { optional: true, min: 0 });
    if (price.error || minPrice.error || maxPrice.error) {
      return { error: price.error || minPrice.error || maxPrice.error };
    }
    if ((minPrice.value === null) !== (maxPrice.value === null)) {
      return { error: 'Enter both minimum and maximum prices, or leave both blank.' };
    }
    if (minPrice.value !== null && minPrice.value > maxPrice.value) {
      return { error: 'Minimum price cannot exceed maximum price.' };
    }
    if (!priceOptional && price.value === null) {
      return { error: 'Enter a price for this pricing model.' };
    }

    const durationValue = numberValue(merged.durationValue, 'Duration', { optional: true, min: 0 });
    const durationUnit = merged.durationUnit || null;
    if (durationValue.error) return { error: durationValue.error };
    if (durationValue.value !== null && !DURATION_UNITS.has(durationUnit)) {
      return { error: 'Select minutes, hours, or days for estimated duration.' };
    }

    const tags = stringList(merged.tags, 'Tags', { maxItems: 20, maxLength: 40 });
    const inclusions = stringList(merged.inclusions, 'Inclusions', { maxItems: 30, maxLength: 200 });
    const exclusions = stringList(merged.exclusions, 'Exclusions', { maxItems: 30, maxLength: 200 });
    const packages = normalizePackagesOrAddons(merged.packages, 'Packages', false);
    const addons = normalizePackagesOrAddons(merged.addons, 'Add-ons', true);
    const bookingLeadTimeHours = numberValue(merged.bookingLeadTimeHours, 'Booking lead time (hours)', {
      optional: true,
      min: 0,
      allowZero: true,
      integer: true,
    });
    if (tags.error || inclusions.error || exclusions.error || packages.error || addons.error || bookingLeadTimeHours.error) {
      return { error: tags.error || inclusions.error || exclusions.error || packages.error || addons.error || bookingLeadTimeHours.error };
    }

    const rawLocations = Array.isArray(merged.locations)
      ? merged.locations
      : merged.location
        ? [typeof merged.location === 'string' ? { city: merged.location } : merged.location]
        : [];
    const locations = [];
    for (const loc of rawLocations) {
      const normalizedLoc = normalizeLocationObject(loc);
      if (normalizedLoc?.city) locations.push(normalizedLoc);
    }

    const availability = [];
    if (Array.isArray(merged.availability)) {
      for (const slot of merged.availability) {
        if (
          !isRecord(slot) ||
          !Number.isInteger(Number(slot.dayOfWeek)) ||
          Number(slot.dayOfWeek) < 0 ||
          Number(slot.dayOfWeek) > 6 ||
          !TIME_PATTERN.test(slot.startTime || '') ||
          !TIME_PATTERN.test(slot.endTime || '') ||
          slot.endTime <= slot.startTime
        ) {
          return { error: 'One or more availability time slots are invalid.' };
        }
        availability.push({
          dayOfWeek: Number(slot.dayOfWeek),
          startTime: slot.startTime,
          endTime: slot.endTime,
          isUnavailable: Boolean(slot.isUnavailable),
        });
      }
    }

    const customerRequirements = optionalText(merged.customerRequirements, 5000, 'Customer requirements');
    const termsAndConditions = optionalText(merged.termsAndConditions, 5000, 'Terms and conditions');
    const cancellationPolicy = optionalText(merged.cancellationPolicy, 5000, 'Cancellation policy');
    if (customerRequirements.error || termsAndConditions.error || cancellationPolicy.error) {
      return { error: customerRequirements.error || termsAndConditions.error || cancellationPolicy.error };
    }
    const customAttributes = merged.customAttributes === undefined
      ? { value: {} }
      : isRecord(merged.customAttributes) && Object.keys(merged.customAttributes).length <= 30
        ? { value: merged.customAttributes }
        : { error: 'Custom service attributes must be an object with at most 30 fields.' };
    const bookingConstraints = merged.bookingConstraints === undefined
      ? { value: {} }
      : isRecord(merged.bookingConstraints) && Object.keys(merged.bookingConstraints).length <= 20
        ? { value: merged.bookingConstraints }
        : { error: 'Booking constraints must be an object with at most 20 fields.' };
    if (customAttributes.error || bookingConstraints.error) {
      return { error: customAttributes.error || bookingConstraints.error };
    }

    return {
      value: {
        listingType: canonicalType,
        title: effectiveTitle,
        shortSummary: shortDesc,
        description: description.value || '',
        categoryId: merged.categoryId || null,
        subcategoryId: merged.subcategoryId || null,
        location: locations[0] || normalizeLocationObject(merged.location),
        visibility: visibility.value,
        details: {
          deliveryMethod,
          pricingType,
          price: price.value,
          minPrice: minPrice.value,
          maxPrice: maxPrice.value,
          currency,
          durationValue: durationValue.value,
          durationUnit,
          tags: tags.value,
          inclusions: inclusions.value,
          exclusions: exclusions.value,
          locations,
          availability,
          customerRequirements: customerRequirements.value,
          termsAndConditions: termsAndConditions.value,
          bookingLeadTimeHours: bookingLeadTimeHours.value,
          cancellationPolicy: cancellationPolicy.value,
          packages: packages.value,
          addons: addons.value,
          customAttributes: customAttributes.value,
          bookingConstraints: bookingConstraints.value,
        },
      },
    };
  }

  if (canonicalType === 'product') {
    const price = numberValue(merged.price, 'Price', { optional: isDraft, min: 0 });
    const stockQuantity = numberValue(merged.stockQuantity ?? 0, 'Stock quantity', {
      optional: true,
      min: 0,
      allowZero: true,
      integer: true,
    });
    const deliveryInfo = optionalText(merged.deliveryInfo, 255, 'Delivery info');
    if (price.error || stockQuantity.error || deliveryInfo.error) {
      return { error: price.error || stockQuantity.error || deliveryInfo.error };
    }
    let variants = {};
    if (merged.variants !== undefined && merged.variants !== null && merged.variants !== '') {
      const parsed = typeof merged.variants === 'string'
        ? parseJson(merged.variants, null)
        : merged.variants;
      if (!parsed || typeof parsed !== 'object') {
        return { error: 'Product variants must be valid JSON.' };
      }
      variants = parsed;
    }
    const location = normalizeLocationObject(merged.location);
    return {
      value: {
        listingType: canonicalType,
        title: effectiveTitle,
        shortSummary: shortSummary.value || (description.value ? description.value.slice(0, 240) : null),
        description: description.value || '',
        categoryId: merged.categoryId || null,
        subcategoryId: merged.subcategoryId || null,
        location,
        visibility: visibility.value,
        details: {
          price: price.value ?? 0,
          currency,
          stockQuantity: stockQuantity.value ?? 0,
          variants,
          deliveryInfo: deliveryInfo.value,
        },
      },
    };
  }

  if (canonicalType === 'job') {
    const employmentType = merged.employmentType || 'full-time';
    const workMode = merged.workMode || 'on-site';
    if (!EMPLOYMENT_TYPES.has(employmentType)) {
      return { error: 'Select a valid employment type.' };
    }
    if (!WORK_MODES.has(workMode)) {
      return { error: 'Select a valid work mode.' };
    }
    const salaryMin = numberValue(merged.salaryMin, 'Minimum salary', { optional: true, min: 0, allowZero: true });
    const salaryMax = numberValue(merged.salaryMax, 'Maximum salary', { optional: true, min: 0, allowZero: true });
    if (salaryMin.error || salaryMax.error) {
      return { error: salaryMin.error || salaryMax.error };
    }
    if (salaryMin.value !== null && salaryMax.value !== null && salaryMin.value > salaryMax.value) {
      return { error: 'Minimum salary cannot exceed maximum salary.' };
    }
    const skills = stringList(merged.skills, 'Skills', { maxItems: 30, maxLength: 80 });
    if (skills.error) return { error: skills.error };
    const locationObj = normalizeLocationObject(merged.location);
    const locationText = typeof merged.location === 'string'
      ? merged.location.trim() || null
      : locationObj
        ? [locationObj.area, locationObj.city, locationObj.state].filter(Boolean).join(', ') || null
        : null;
    const deadline = optionalText(merged.deadline, 32, 'Deadline');
    if (deadline.error) return { error: deadline.error };
    if (deadline.value && !/^\d{4}-\d{2}-\d{2}$/.test(deadline.value)) {
      return { error: 'Deadline must be in YYYY-MM-DD format.' };
    }

    return {
      value: {
        listingType: canonicalType,
        title: effectiveTitle,
        shortSummary: shortSummary.value || (description.value ? description.value.slice(0, 240) : null),
        description: description.value || '',
        categoryId: merged.categoryId || null,
        subcategoryId: merged.subcategoryId || null,
        location: { ...(locationObj || {}), ...(locationText ? { city: locationObj?.city || locationText } : {}), workMode },
        visibility: visibility.value,
        details: {
          employmentType,
          workMode,
          location: locationText,
          salaryMin: salaryMin.value,
          salaryMax: salaryMax.value,
          currency,
          experienceRequired: optionalText(merged.experienceRequired, 80, 'Experience required').value,
          educationRequired: optionalText(merged.educationRequired, 160, 'Education required').value,
          skills: skills.value,
          deadline: deadline.value,
        },
      },
    };
  }

  if (canonicalType === 'freelance_project') {
    const budget = numberValue(merged.budget, 'Budget', { optional: true, min: 0, allowZero: true });
    if (budget.error) return { error: budget.error };
    const workMode = merged.workMode || 'remote';
    if (workMode && !WORK_MODES.has(workMode)) {
      return { error: 'Select a valid work mode.' };
    }
    const requiredSkills = stringList(merged.requiredSkills ?? merged.skills, 'Required skills', {
      maxItems: 30,
      maxLength: 80,
    });
    if (requiredSkills.error) return { error: requiredSkills.error };
    const deadline = optionalText(merged.deadline, 32, 'Deadline');
    if (deadline.error) return { error: deadline.error };
    if (deadline.value && !/^\d{4}-\d{2}-\d{2}$/.test(deadline.value)) {
      return { error: 'Deadline must be in YYYY-MM-DD format.' };
    }
    const deliverables = optionalText(merged.deliverables, 5000, 'Deliverables');
    if (deliverables.error) return { error: deliverables.error };
    const locationObj = normalizeLocationObject(merged.location);
    const locationText = typeof merged.location === 'string'
      ? merged.location.trim() || null
      : locationObj?.city || null;

    return {
      value: {
        listingType: canonicalType,
        title: effectiveTitle,
        shortSummary: shortSummary.value || (description.value ? description.value.slice(0, 240) : null),
        description: description.value || '',
        categoryId: merged.categoryId || null,
        subcategoryId: merged.subcategoryId || null,
        location: { ...(locationObj || {}), ...(locationText ? { city: locationObj?.city || locationText } : {}), workMode },
        visibility: visibility.value,
        details: {
          budget: budget.value,
          currency,
          deadline: deadline.value,
          deliverables: deliverables.value,
          workMode,
          location: locationText,
          requiredSkills: requiredSkills.value,
        },
      },
    };
  }

  // professional_profile or business_profile
  const locationObj = normalizeLocationObject(merged.location || {
    city: merged.city,
    state: merged.state,
    country: merged.country,
    area: merged.area,
  });
  return {
    value: {
      listingType: canonicalType,
      title: effectiveTitle,
      shortSummary: shortSummary.value,
      description: description.value || '',
      categoryId: merged.categoryId || null,
      subcategoryId: merged.subcategoryId || null,
      location: locationObj,
      visibility: visibility.value,
      details: {
        ...rawDetails,
        ...(merged.hiringEnabled !== undefined ? { hiringEnabled: Boolean(merged.hiringEnabled) } : {}),
      },
    },
  };
}

export async function attachMediaToListing(
  connection,
  {
    listingId,
    listingType,
    ownerUserId,
    mediaAssetId,
    mediaType = null,
    isCover = false,
    altText = null,
    displayOrder = null,
    visibility = null,
  }
) {
  const canonicalType = normalizeListingType(listingType);
  const [assets] = await connection.query(
    `SELECT id, user_id, role, object_key, content_type, byte_size, purpose
       FROM media_assets
      WHERE id = ? AND user_id = ? LIMIT 1`,
    [mediaAssetId, ownerUserId]
  );
  if (!assets.length) {
    return { error: { status: 404, code: 'media_not_found', message: 'Uploaded media asset was not found for your account.' } };
  }
  const asset = assets[0];
  const isImage = IMAGE_MIME_TYPES.has(asset.content_type);
  const isVideo = VIDEO_MIME_TYPES.has(asset.content_type);
  const isDocument = DOCUMENT_MIME_TYPES.has(asset.content_type);
  if (!isImage && !isVideo && !isDocument) {
    return { error: { status: 415, code: 'unsupported_media_type', message: 'Unsupported media MIME type.' } };
  }

  const effectiveRole = mediaType || (isImage ? 'image' : isVideo ? 'video' : 'document');
  if (effectiveRole === 'image' && !isImage) {
    return { error: { status: 415, code: 'unsupported_media_type', message: 'Asset is not a valid image.' } };
  }
  if (effectiveRole === 'video' && !isVideo) {
    return { error: { status: 415, code: 'unsupported_media_type', message: 'Asset is not a valid MP4 video.' } };
  }
  if (effectiveRole === 'document' && !isDocument && !isImage) {
    return { error: { status: 415, code: 'unsupported_media_type', message: 'Asset is not a valid document.' } };
  }

  const effectiveVisibility = PRIVATE_PURPOSES.has(asset.purpose) || visibility === 'private'
    ? 'private'
    : 'public';
  const coverFlag = Boolean(isCover && effectiveRole === 'image' && effectiveVisibility === 'public');

  const [existingRows] = await connection.query(
    `SELECT COUNT(*) AS total FROM listing_media WHERE listing_id = ?`,
    [listingId]
  );
  const currentTotal = Number(existingRows[0]?.total || 0);
  if (currentTotal >= 12) {
    return { error: { status: 409, code: 'media_limit_reached', message: 'A listing can hold at most 12 media items.' } };
  }

  const order = Number.isInteger(Number(displayOrder)) ? Number(displayOrder) : currentTotal;
  const cleanAlt = typeof altText === 'string' && altText.trim() ? altText.trim().slice(0, 255) : null;

  if (coverFlag) {
    await connection.query(
      'UPDATE listing_media SET is_cover = FALSE WHERE listing_id = ?',
      [listingId]
    );
  }

  const mediaId = randomUUID();
  await connection.query(
    `INSERT INTO listing_media (
       id, listing_type, listing_id, media_asset_id, media_role, display_order,
       is_cover, alt_text, mime_type, file_size, object_key, visibility
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mediaId,
      canonicalType,
      listingId,
      asset.id,
      effectiveRole,
      order,
      coverFlag,
      cleanAlt,
      asset.content_type,
      asset.byte_size,
      asset.object_key,
      effectiveVisibility,
    ]
  );

  if (canonicalType === 'service' && ['image', 'video'].includes(effectiveRole)) {
    await connection.query(
      `INSERT IGNORE INTO service_media (id, service_id, media_asset_id, media_type, display_order)
       VALUES (?, ?, ?, ?, ?)`,
      [mediaId, listingId, asset.id, effectiveRole, order]
    );
  }

  await connection.query(
    `UPDATE media_assets SET status = 'attached', expires_at = NULL WHERE id = ?`,
    [asset.id]
  );

  return {
    media: {
      id: mediaId,
      mediaAssetId: asset.id,
      mediaType: effectiveRole,
      displayOrder: order,
      isCover: coverFlag,
      altText: cleanAlt,
      mimeType: asset.content_type,
      fileSize: Number(asset.byte_size),
      objectKey: asset.object_key,
      visibility: effectiveVisibility,
    },
  };
}

export async function detachMediaFromListing(connection, config, { listingId, mediaId, ownerUserId }) {
  const [rows] = await connection.query(
    `SELECT lm.id, lm.listing_type, lm.media_asset_id, ma.object_key
       FROM listing_media lm
       JOIN marketplace_listings ml ON ml.id = lm.listing_id
       JOIN media_assets ma ON ma.id = lm.media_asset_id
      WHERE lm.id = ? AND lm.listing_id = ? AND ml.owner_user_id = ?
      LIMIT 1`,
    [mediaId, listingId, ownerUserId]
  );
  if (!rows.length) {
    return { error: { status: 404, code: 'media_not_found', message: 'Listing media was not found.' } };
  }
  const target = rows[0];
  await connection.query('DELETE FROM listing_media WHERE id = ?', [target.id]);
  if (target.listing_type === 'service') {
    await connection.query('DELETE FROM service_media WHERE id = ? OR (service_id = ? AND media_asset_id = ?)', [
      target.id,
      listingId,
      target.media_asset_id,
    ]);
  }
  const [refs] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM listing_media WHERE media_asset_id = ?) +
       (SELECT COUNT(*) FROM service_media WHERE media_asset_id = ?) +
       (SELECT COUNT(*) FROM professional_portfolio_items WHERE media_asset_id = ?) AS total`,
    [target.media_asset_id, target.media_asset_id, target.media_asset_id]
  );
  if (Number(refs[0]?.total || 0) === 0) {
    if (createB2Client(config)) {
      await deletePrivateObject(config, target.object_key).catch(() => {});
    }
    await connection.query('DELETE FROM media_assets WHERE id = ? AND user_id = ?', [
      target.media_asset_id,
      ownerUserId,
    ]);
  }
  return { deleted: true, id: target.id };
}

export async function reorderListingMedia(connection, { listingId, items = [], order = [], coverMediaId = null }) {
  const [existing] = await connection.query(
    'SELECT id, media_role, visibility FROM listing_media WHERE listing_id = ? ORDER BY display_order, created_at',
    [listingId]
  );
  if (!existing.length) return [];
  const existingMap = new Map(existing.map((row) => [row.id, row]));

  const normalizedUpdates = [];
  if (Array.isArray(items) && items.length) {
    for (const [index, entry] of items.entries()) {
      if (!entry || !existingMap.has(entry.mediaId)) continue;
      normalizedUpdates.push({
        id: entry.mediaId,
        displayOrder: Number.isInteger(Number(entry.displayOrder)) ? Number(entry.displayOrder) : index,
        isCover: entry.isCover !== undefined ? Boolean(entry.isCover) : undefined,
        altText: entry.altText !== undefined
          ? (typeof entry.altText === 'string' && entry.altText.trim() ? entry.altText.trim().slice(0, 255) : null)
          : undefined,
      });
    }
  } else if (Array.isArray(order) && order.length) {
    for (const [index, id] of order.entries()) {
      if (!existingMap.has(id)) continue;
      normalizedUpdates.push({
        id,
        displayOrder: index,
        isCover: coverMediaId ? id === coverMediaId : undefined,
      });
    }
  } else if (coverMediaId && existingMap.has(coverMediaId)) {
    normalizedUpdates.push({ id: coverMediaId, isCover: true });
  }

  const hasCoverChange = normalizedUpdates.some((u) => u.isCover === true);
  if (hasCoverChange) {
    await connection.query('UPDATE listing_media SET is_cover = FALSE WHERE listing_id = ?', [listingId]);
  }

  for (const update of normalizedUpdates) {
    const row = existingMap.get(update.id);
    const sets = [];
    const params = [];
    if (update.displayOrder !== undefined) {
      sets.push('display_order = ?');
      params.push(update.displayOrder);
    }
    if (update.isCover !== undefined) {
      const canCover = update.isCover && row.media_role === 'image' && row.visibility === 'public';
      sets.push('is_cover = ?');
      params.push(canCover);
    }
    if (update.altText !== undefined) {
      sets.push('alt_text = ?');
      params.push(update.altText);
    }
    if (sets.length) {
      params.push(update.id, listingId);
      await connection.query(
        `UPDATE listing_media SET ${sets.join(', ')} WHERE id = ? AND listing_id = ?`,
        params
      );
      if (update.displayOrder !== undefined) {
        await connection.query(
          'UPDATE service_media SET display_order = ? WHERE id = ? AND service_id = ?',
          [update.displayOrder, update.id, listingId]
        );
      }
    }
  }

  const [updated] = await connection.query(
    `SELECT id, media_asset_id, media_role, display_order, is_cover, alt_text, mime_type, file_size, object_key, visibility
       FROM listing_media WHERE listing_id = ? ORDER BY display_order, created_at`,
    [listingId]
  );
  return updated;
}

export async function hydrateUnifiedListings(pool, rows, config, { audience = 'public' } = {}) {
  if (!rows.length) return [];
  const listingIds = rows.map((row) => row.id);
  const placeholders = listingIds.map(() => '?').join(', ');

  // Load media
  const [mediaRows] = await pool.query(
    `SELECT lm.id, lm.listing_id, lm.listing_type, lm.media_asset_id, lm.media_role,
            lm.display_order, lm.is_cover, lm.alt_text, lm.mime_type, lm.file_size,
            lm.object_key, lm.visibility, ma.purpose, ma.content_type AS asset_content_type,
            ma.byte_size AS asset_byte_size, ma.object_key AS asset_object_key
       FROM listing_media lm
       LEFT JOIN media_assets ma ON ma.id = lm.media_asset_id
      WHERE lm.listing_id IN (${placeholders})
      ORDER BY lm.is_cover DESC, lm.display_order ASC, lm.created_at ASC`,
    listingIds
  );

  // Also check legacy service_media for any service not yet copied
  const serviceIds = rows.filter((r) => normalizeListingType(r.listing_type) === 'service').map((r) => r.entity_id || r.id);
  const legacyServiceMedia = [];
  if (serviceIds.length) {
    const [smRows] = await pool.query(
      `SELECT sm.id, sm.service_id AS listing_id, 'service' AS listing_type, sm.media_asset_id,
              sm.media_type AS media_role, sm.display_order,
              (sm.display_order = 0 AND sm.media_type = 'image') AS is_cover,
              NULL AS alt_text, ma.content_type AS mime_type, ma.byte_size AS file_size,
              ma.object_key, 'public' AS visibility, ma.purpose
         FROM service_media sm
         JOIN media_assets ma ON ma.id = sm.media_asset_id
        WHERE sm.service_id IN (${serviceIds.map(() => '?').join(', ')})
        ORDER BY sm.display_order ASC, sm.created_at ASC`,
      serviceIds
    );
    legacyServiceMedia.push(...smRows);
  }

  const seenMediaKeys = new Set();
  const allMedia = [];
  for (const row of [...mediaRows, ...legacyServiceMedia]) {
    const dedupeKey = `${row.listing_id}:${row.media_asset_id}`;
    if (seenMediaKeys.has(dedupeKey)) continue;
    seenMediaKeys.add(dedupeKey);
    const isPrivateDoc = row.visibility === 'private' || PRIVATE_PURPOSES.has(row.purpose);
    if (audience !== 'owner' && isPrivateDoc) continue;
    const objectKey = row.object_key || row.asset_object_key || null;
    const url = objectKey ? await createPrivateReadUrl(config, objectKey).catch(() => null) : null;
    allMedia.push({
      id: row.id,
      listingId: row.listing_id,
      mediaAssetId: row.media_asset_id,
      mediaType: row.media_role,
      displayOrder: Number(row.display_order || 0),
      isCover: Boolean(row.is_cover),
      altText: row.alt_text || null,
      mimeType: row.mime_type || row.asset_content_type || null,
      fileSize: row.file_size !== null && row.file_size !== undefined
        ? Number(row.file_size)
        : row.asset_byte_size !== null && row.asset_byte_size !== undefined
          ? Number(row.asset_byte_size)
          : null,
      objectKey: audience === 'owner' ? objectKey : undefined,
      visibility: isPrivateDoc ? 'private' : 'public',
      url,
    });
  }

  const mediaByListing = new Map();
  for (const item of allMedia) {
    if (!mediaByListing.has(item.listingId)) mediaByListing.set(item.listingId, []);
    mediaByListing.get(item.listingId).push(item);
  }

  // Load type-specific details
  const productIds = rows.filter((r) => normalizeListingType(r.listing_type) === 'product').map((r) => r.entity_id || r.id);
  const jobIds = rows.filter((r) => normalizeListingType(r.listing_type) === 'job').map((r) => r.entity_id || r.id);
  const projectIds = rows.filter((r) => normalizeListingType(r.listing_type) === 'freelance_project').map((r) => r.entity_id || r.id);
  const proUserIds = rows.filter((r) => normalizeListingType(r.listing_type) === 'professional_profile').map((r) => r.owner_user_id);
  const bizUserIds = rows.filter((r) => normalizeListingType(r.listing_type) === 'business_profile').map((r) => r.owner_user_id);

  const serviceDetailMap = new Map();
  if (serviceIds.length) {
    const sp = serviceIds.map(() => '?').join(', ');
    const [svcRows] = await pool.query(`SELECT * FROM services WHERE id IN (${sp})`, serviceIds);
    const [priceRows] = await pool.query(`SELECT * FROM service_pricing WHERE service_id IN (${sp})`, serviceIds);
    const [locRows] = await pool.query(`SELECT * FROM service_locations WHERE service_id IN (${sp})`, serviceIds);
    const [availRows] = await pool.query(`SELECT * FROM service_availability WHERE service_id IN (${sp}) ORDER BY day_of_week, start_time`, serviceIds);
    const [tagRows] = await pool.query(`SELECT service_id, tag FROM service_tags WHERE service_id IN (${sp})`, serviceIds);
    const priceById = new Map(priceRows.map((p) => [p.service_id, p]));
    const locById = new Map();
    const availById = new Map();
    const tagsById = new Map();
    for (const l of locRows) {
      if (!locById.has(l.service_id)) locById.set(l.service_id, []);
      locById.get(l.service_id).push({
        country: l.country || null,
        state: l.state || null,
        city: l.city,
        area: l.area || null,
        radiusKm: l.radius_km === null ? null : Number(l.radius_km),
        isPrimary: Boolean(l.is_primary),
      });
    }
    for (const a of availRows) {
      if (!availById.has(a.service_id)) availById.set(a.service_id, []);
      availById.get(a.service_id).push({
        dayOfWeek: Number(a.day_of_week),
        startTime: String(a.start_time).slice(0, 5),
        endTime: String(a.end_time).slice(0, 5),
        isUnavailable: Boolean(a.is_unavailable),
      });
    }
    for (const t of tagRows) {
      if (!tagsById.has(t.service_id)) tagsById.set(t.service_id, []);
      tagsById.get(t.service_id).push(t.tag);
    }
    for (const s of svcRows) {
      const p = priceById.get(s.id) || {};
      const locs = locById.get(s.id) || [];
      const avail = availById.get(s.id) || [];
      const pkgs = parseJson(s.packages, []);
      const addons = parseJson(s.addons, []);
      const customAttributes = parseJson(s.custom_attributes, {});
      const bookingConstraints = parseJson(s.booking_constraints, {});
      const bookingLeadTimeHours = s.booking_lead_time_hours === null || s.booking_lead_time_hours === undefined
        ? null
        : Number(s.booking_lead_time_hours);
      const pricingType = p.pricing_type || null;
      const price = p.amount === null || p.amount === undefined ? null : Number(p.amount);
      const minPrice = p.min_price === null || p.min_price === undefined ? null : Number(p.min_price);
      const maxPrice = p.max_price === null || p.max_price === undefined ? null : Number(p.max_price);
      const currency = p.currency || 'INR';
      const durationValue = s.duration_value === null ? null : Number(s.duration_value);
      const durationUnit = s.duration_unit || null;
      serviceDetailMap.set(s.id, {
        slug: s.slug,
        shortDescription: s.short_description,
        deliveryMethod: s.delivery_method,
        durationValue,
        durationUnit,
        pricingType,
        price,
        minPrice,
        maxPrice,
        currency,
        inclusions: parseJson(s.inclusions, []),
        exclusions: parseJson(s.exclusions, []),
        tags: tagsById.get(s.id) || [],
        locations: locs,
        availability: avail,
        customerRequirements: s.customer_requirements || null,
        termsAndConditions: s.terms_and_conditions || null,
        bookingLeadTimeHours,
        cancellationPolicy: s.cancellation_policy || null,
        packages: Array.isArray(pkgs) ? pkgs : [],
        addons: Array.isArray(addons) ? addons : [],
        customAttributes: customAttributes || {},
        bookingConstraints: bookingConstraints || {},
        bookingReadiness: {
          serviceId: s.id,
          listingId: s.id,
          providerUserId: s.provider_user_id,
          providerRole: s.provider_role,
          pricingType,
          price,
          minPrice,
          maxPrice,
          currency,
          durationValue,
          durationUnit,
          deliveryMethod: s.delivery_method,
          locations: locs,
          availability: avail,
          bookingLeadTimeHours,
          cancellationPolicy: s.cancellation_policy || null,
          termsAndConditions: s.terms_and_conditions || null,
          customerRequirements: s.customer_requirements || null,
          packages: Array.isArray(pkgs) ? pkgs : [],
          addons: Array.isArray(addons) ? addons : [],
          constraints: {
            requiresLocation: ['customer_location', 'provider_location', 'hybrid'].includes(s.delivery_method),
            requiresCustomerRequirements: Boolean(s.customer_requirements),
            ...(bookingConstraints || {}),
          },
          bookingEnabled: false,
        },
        ratingAvg: Number(s.review_count || 0) > 0 ? Number(s.rating_avg) : null,
        reviewCount: Number(s.review_count || 0),
      });
    }
  }

    const productDetailMap = new Map();
  if (productIds.length) {
    const [pRows] = await pool.query(`SELECT * FROM products WHERE id IN (${productIds.map(() => '?').join(', ')})`, productIds);
    for (const p of pRows) {
      const stockQty = Number(p.stock_quantity || 0);
      productDetailMap.set(p.id, {
        name: p.name,
        sku: p.sku || null,
        shortDescription: p.short_description || null,
        brand: p.brand || null,
        price: Number(p.price),
        compareAtPrice: p.compare_at_price === null || p.compare_at_price === undefined ? null : Number(p.compare_at_price),
        currency: p.currency || 'INR',
        productCondition: p.product_condition || null,
        stockQuantity: stockQty,
        stockStatus: p.stock_status || (stockQty <= 0 ? 'out_of_stock' : stockQty <= 5 ? 'low_stock' : 'in_stock'),
        variants: parseJson(p.variants, {}),
        attributes: parseJson(p.attributes, {}),
        deliveryInfo: p.delivery_info || null,
        deliveryOptions: parseJson(p.delivery_options, null),
        returnPolicy: p.return_policy || null,
        warrantyInfo: p.warranty_info || null,
        isActive: p.is_active === undefined ? true : Boolean(p.is_active),
      });
    }
  }

  const jobDetailMap = new Map();
  if (jobIds.length) {
    const [jRows] = await pool.query(`SELECT * FROM jobs WHERE id IN (${jobIds.map(() => '?').join(', ')})`, jobIds);
    for (const j of jRows) {
      jobDetailMap.set(j.id, {
        employmentType: j.employment_type,
        workMode: j.work_mode,
        location: j.location || null,
        salaryMin: j.salary_min === null || j.salary_min === undefined ? null : Number(j.salary_min),
        salaryMax: j.salary_max === null || j.salary_max === undefined ? null : Number(j.salary_max),
        currency: j.currency || 'INR',
        experienceRequired: j.experience_required || null,
        educationRequired: j.education_required || null,
        skills: parseJson(j.skills, []),
        deadline: j.deadline || null,
      });
    }
  }

  const projectDetailMap = new Map();
  if (projectIds.length) {
    const [fpRows] = await pool.query(`SELECT * FROM freelance_projects WHERE id IN (${projectIds.map(() => '?').join(', ')})`, projectIds);
    for (const fp of fpRows) {
      projectDetailMap.set(fp.id, {
        budgetType: fp.budget_type || null,
        budget: fp.budget === null || fp.budget === undefined ? null : Number(fp.budget),
        budgetMin: fp.budget_min === null || fp.budget_min === undefined ? null : Number(fp.budget_min),
        budgetMax: fp.budget_max === null || fp.budget_max === undefined ? null : Number(fp.budget_max),
        currency: fp.currency || 'INR',
        deadline: fp.deadline || null,
        deliverables: fp.deliverables || null,
        workMode: fp.work_mode || null,
        location: fp.location || null,
        requiredSkills: parseJson(fp.required_skills, []),
      });
    }
  }

  const proDetailMap = new Map();
  const profileImageCandidates = [];
  if (proUserIds.length) {
    const [ppRows] = await pool.query(`SELECT user_id, profile FROM professional_profiles WHERE user_id IN (${proUserIds.map(() => '?').join(', ')})`, proUserIds);
    const [skillRows] = await pool.query(`SELECT professional_user_id, skill FROM professional_skills WHERE professional_user_id IN (${proUserIds.map(() => '?').join(', ')}) ORDER BY skill`, proUserIds);
    const skillsMap = new Map();
    for (const s of skillRows) {
      if (!skillsMap.has(s.professional_user_id)) skillsMap.set(s.professional_user_id, []);
      skillsMap.get(s.professional_user_id).push(s.skill);
    }
    for (const pp of ppRows) {
      const p = parseJson(pp.profile, {});
      const profilePhotoId = profileImageAssetId(p.profilePhoto);
      if (profilePhotoId) {
        profileImageCandidates.push({
          assetId: profilePhotoId,
          userId: pp.user_id,
          role: 'professional',
          purpose: 'profile-photo',
        });
      }
      proDetailMap.set(pp.user_id, {
        headline: p.headline || null,
        primaryCategory: p.primaryCategory || null,
        subCategory: p.subCategory || null,
        experienceYears: p.experienceYears || null,
        pricingType: p.pricingType || null,
        startingPrice: p.startingPrice || null,
        currency: p.currency || 'INR',
        deliveryMethod: p.deliveryMethod || null,
        skills: skillsMap.get(pp.user_id) || (Array.isArray(p.skills) ? p.skills : []),
        city: p.city || null,
        state: p.state || null,
      });
    }
  }

  const bizDetailMap = new Map();
  if (bizUserIds.length) {
    const [bpRows] = await pool.query(`SELECT user_id, hiring_enabled, profile, shop_settings FROM business_profiles WHERE user_id IN (${bizUserIds.map(() => '?').join(', ')})`, bizUserIds);
    const [catRows] = await pool.query(
      `SELECT bc.business_user_id, c.id, c.name
         FROM business_categories bc
         JOIN categories c ON c.id = bc.category_id
        WHERE bc.business_user_id IN (${bizUserIds.map(() => '?').join(', ')})`,
      bizUserIds
    );
    const catsMap = new Map();
    for (const c of catRows) {
      if (!catsMap.has(c.business_user_id)) catsMap.set(c.business_user_id, []);
      catsMap.get(c.business_user_id).push({ id: c.id, name: c.name });
    }
    for (const bp of bpRows) {
      const p = parseJson(bp.profile, {});
      const shopSettings = parseJson(bp.shop_settings, {}) || {};
      const logoId = profileImageAssetId(shopSettings.logoMediaId) ||
        profileImageAssetId(p.companyLogo);
      const coverId = profileImageAssetId(shopSettings.coverMediaId) ||
        profileImageAssetId(p.coverImage);
      if (logoId) {
        profileImageCandidates.push({
          assetId: logoId,
          userId: bp.user_id,
          role: 'business',
          purpose: 'business-logo',
        });
      }
      if (coverId) {
        profileImageCandidates.push({
          assetId: coverId,
          userId: bp.user_id,
          role: 'business',
          purpose: 'cover-image',
        });
      }
      bizDetailMap.set(bp.user_id, {
        companyName: p.companyName || p.businessName || null,
        businessType: p.businessType || null,
        industry: p.industry || null,
        website: p.website || null,
        yearEstablished: p.yearEstablished || null,
        employeeCount: p.employeeCount || null,
        workingHours: p.workingHours || null,
        hiringEnabled: Boolean(bp.hiring_enabled || p.hiringEnabled),
        categories: catsMap.get(bp.user_id) || [],
        city: p.city || null,
        state: p.state || null,
      });
    }
  }

  const profileImageUrls = await loadPublicProfileImageUrls(pool, config, profileImageCandidates);
  for (const [userId, url] of profileImageUrls) {
    if (proDetailMap.has(userId)) proDetailMap.get(userId).profileImageUrl = url;
    if (bizDetailMap.has(userId)) bizDetailMap.get(userId).logoUrl = url;
  }

  return rows.map((row) => {
    const canonicalType = normalizeListingType(row.listing_type) || row.listing_type;
    const entityId = row.entity_id || row.id;
    const media = mediaByListing.get(row.id) || [];
    const coverImage = media.find((m) => m.isCover) || media.find((m) => m.mediaType === 'image') || null;
    const businessProfileJson = parseJson(row.business_profile, {});
    const parsedLocation = parseJson(row.location, null);

    let details = {};
    if (canonicalType === 'service') details = serviceDetailMap.get(entityId) || {};
    else if (canonicalType === 'product') details = productDetailMap.get(entityId) || {};
    else if (canonicalType === 'job') details = jobDetailMap.get(entityId) || {};
    else if (canonicalType === 'freelance_project') details = projectDetailMap.get(entityId) || {};
    else if (canonicalType === 'professional_profile') details = proDetailMap.get(row.owner_user_id) || {};
    else if (canonicalType === 'business_profile') details = bizDetailMap.get(row.owner_user_id) || {};

    const base = {
      id: row.id,
      entityId,
      listingType: canonicalType,
      title: row.title,
      shortSummary: row.short_summary || details.shortDescription || details.headline || null,
      description: row.description || null,
      categoryId: row.category_id || null,
      categoryName: row.category_name || row.service_category_name || null,
      subcategoryId: row.subcategory_id || null,
      subcategoryName: row.subcategory_name || row.service_subcategory_name || null,
      location: parsedLocation || (details.locations?.[0] || (details.location ? { city: details.location } : null)),
      visibility: row.visibility || 'public',
      status: row.status,
      isPublic: Boolean(row.is_public),
      publishedAt: row.published_at || null,
      archivedAt: row.archived_at || null,
      submittedForReviewAt: row.submitted_for_review_at || null,
      owner: {
        userId: row.owner_user_id,
        role: row.owner_role,
        displayName: row.owner_name || null,
        businessName: row.owner_role === 'business'
          ? businessProfileJson.companyName || businessProfileJson.businessName || null
          : null,
        verified: row.verification_status === 'verified',
      },
      profileImageUrl: details.profileImageUrl || details.logoUrl || null,
      coverImage,
      media,
      details,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (audience === 'owner') {
      base.moderation = {
        status: row.moderation_status || 'not_required',
        reason: row.moderation_reason || null,
        moderatedBy: row.moderated_by || null,
        moderatedAt: row.moderated_at || null,
      };
    }

    return base;
  });
}

export const UNIFIED_LISTING_SELECT = `
  SELECT ml.*,
         u.name AS owner_name,
         ur.verification_status,
         bp.profile AS business_profile,
         c.name AS category_name,
         subc.name AS subcategory_name,
         sc.name AS service_category_name,
         ssub.name AS service_subcategory_name
    FROM marketplace_listings ml
    LEFT JOIN users u ON u.id = ml.owner_user_id
    LEFT JOIN user_roles ur ON ur.user_id = ml.owner_user_id AND ur.role = ml.owner_role
    LEFT JOIN business_profiles bp ON bp.user_id = ml.owner_user_id
    LEFT JOIN categories c ON c.id = ml.category_id
    LEFT JOIN categories subc ON subc.id = ml.subcategory_id
    LEFT JOIN service_categories sc ON sc.id = ml.category_id
    LEFT JOIN service_subcategories ssub ON ssub.id = ml.subcategory_id
`;
