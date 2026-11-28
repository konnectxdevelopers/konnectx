import { randomUUID } from 'node:crypto';
import {
  getModerationPolicy,
  isRecord,
  parseJson,
  recordStatusHistory,
  requiresReviewForType,
  validateOwnerTransition,
  withTransaction,
} from './listing-engine.js';
import { syncMarketplaceListing, syncMarketplaceListingStatus } from './marketplace-listings.js';
import { createPrivateReadUrl } from './storage.js';

const SHOPPING_ROOT_ID = '20000000-0000-4000-8000-000000000002';
const VALID_CONDITIONS = new Set(['new', 'open_box', 'refurbished', 'used']);
const PRODUCT_LIFECYCLE_ACTIONS = new Set([
  'save_draft',
  'submit',
  'publish',
  'pause',
  'resume',
  'archive',
  'restore',
]);

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    code,
    message,
    ...(details ? { details } : {}),
  });
}

function optionalText(value, maxLength, fieldName) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string') {
    return { error: `${fieldName} must be text.` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > maxLength) {
    return { error: `${fieldName} must be no more than ${maxLength} characters.` };
  }
  return { value: trimmed };
}

function requiredText(value, maxLength, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: `${fieldName} is required.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { error: `${fieldName} must be no more than ${maxLength} characters.` };
  }
  return { value: trimmed };
}

function nonNegativeInt(value, fieldName, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return { value: fallback };
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000000) {
    return { error: `${fieldName} must be a non-negative integer.` };
  }
  return { value: parsed };
}

function priceNumber(value, fieldName, { required = false, allowZero = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? { error: `${fieldName} is required.` } : { value: null };
  }
  const parsed = Number(value);
  const minOk = allowZero ? parsed >= 0 : parsed > 0;
  if (!Number.isFinite(parsed) || !minOk || parsed > 100000000) {
    return { error: `${fieldName} must be a valid positive amount.` };
  }
  return { value: Number(parsed.toFixed(2)) };
}

function computeStockStatus(quantity) {
  const qty = Number(quantity || 0);
  if (qty <= 0) return 'out_of_stock';
  if (qty <= 5) return 'low_stock';
  return 'in_stock';
}

function isObjectPublic(shopSettings) {
  if (!shopSettings || typeof shopSettings !== 'object') return true;
  if (shopSettings.publicVisibility === false) return false;
  return true;
}

function mediaAssetId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRecord(value) && typeof value.id === 'string' && value.id.trim()) {
    return value.id.trim();
  }
  return null;
}

function mediaIdInput(value, fieldName) {
  if (value === undefined) return { value: undefined };
  if (value === null || value === '') return { value: null };
  const id = mediaAssetId(value);
  return id ? { value: id } : { error: `${fieldName} must reference an uploaded image.` };
}

async function ensureBusinessAccount(pool, userId) {
  const [roles] = await pool.query(
    'SELECT role FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1',
    [userId, 'business']
  );
  if (!roles.length) {
    return {
      ok: false,
      status: 403,
      code: 'forbidden_role',
      message: 'Only business accounts can manage shop profiles and products.',
    };
  }
  const [profiles] = await pool.query(
    `SELECT bp.*, ml.status AS listing_status, ml.is_public AS listing_is_public,
            ml.visibility AS listing_visibility
       FROM business_profiles bp
       LEFT JOIN marketplace_listings ml
         ON ml.id = bp.listing_id AND ml.listing_type = 'business_profile'
      WHERE bp.user_id = ?
      LIMIT 1`,
    [userId]
  );
  return {
    ok: true,
    role: roles[0],
    profile: profiles[0] || null,
  };
}

async function loadShopMedia(pool, config, rawMediaAssetId, ownerUserId, purpose) {
  const assetId = mediaAssetId(rawMediaAssetId);
  if (!assetId || !ownerUserId) return { id: null, url: null };
  const [rows] = await pool.query(
    `SELECT object_key FROM media_assets
      WHERE id = ? AND user_id = ? AND role = 'business' AND purpose = ?
        AND content_type LIKE 'image/%'
      LIMIT 1`,
    [assetId, ownerUserId, purpose]
  );
  if (!rows.length || !rows[0].object_key) return { id: null, url: null };
  return {
    id: assetId,
    url: await createPrivateReadUrl(config, rows[0].object_key).catch(() => null),
  };
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

function variantLabelFromAttrs(attributes, sku) {
  const vals = Object.values(attributes || {}).filter(Boolean).map((v) => String(v).trim());
  if (vals.length) return vals.join(' / ').slice(0, 120);
  if (sku) return String(sku).slice(0, 120);
  return 'Variant';
}

const PRODUCT_SELECT_COLUMNS = `p.*, u.name AS seller_name,
  bp.user_id AS business_profile_user_id, bp.listing_id AS business_listing_id,
  bp.profile AS business_profile, bp.shop_settings,
  bml.status AS business_listing_status,
  bml.is_public AS business_listing_is_public,
  bml.visibility AS business_listing_visibility,
  ur.verification_status AS verification_status,
  bsl.label AS loc_label, bsl.city AS loc_city, bsl.state AS loc_state,
  bsl.address AS loc_address, bsl.operating_hours AS loc_hours,
  bsl.pickup_enabled AS loc_pickup_enabled, bsl.delivery_enabled AS loc_delivery_enabled`;

const PRODUCT_FROM_JOIN = `FROM products p
  LEFT JOIN users u ON u.id = p.seller_user_id
  LEFT JOIN business_profiles bp ON bp.user_id = p.seller_user_id
  LEFT JOIN marketplace_listings bml
    ON bml.id = bp.listing_id AND bml.listing_type = 'business_profile'
  LEFT JOIN user_roles ur ON ur.user_id = p.seller_user_id AND ur.role = 'business'
  LEFT JOIN business_shop_locations bsl ON bsl.id = p.shop_location_id`;

async function buildShopPayload(pool, config, businessUserId) {
  const [profiles] = await pool.query(
    `SELECT bp.*, u.name AS owner_name, ur.verification_status AS verification_status,
            ml.status AS listing_status, ml.is_public AS listing_is_public,
            ml.visibility AS listing_visibility
       FROM business_profiles bp
       JOIN users u ON u.id = bp.user_id
       LEFT JOIN user_roles ur ON ur.user_id = bp.user_id AND ur.role = 'business'
       LEFT JOIN marketplace_listings ml
         ON ml.id = bp.listing_id AND ml.listing_type = 'business_profile'
      WHERE bp.user_id = ?
      LIMIT 1`,
    [businessUserId]
  );
  if (!profiles.length) return null;
  const bp = profiles[0];
  const bpProfile = parseJson(bp.profile, {}) || {};
  const shopSettings = parseJson(bp.shop_settings, {}) || {};
  const [locationRows] = await pool.query(
    `SELECT * FROM business_shop_locations
      WHERE business_user_id = ?
      ORDER BY is_primary DESC, is_active DESC, created_at ASC`,
    [businessUserId]
  );
  const [statsRows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'published' AND is_active = TRUE) AS published_count,
       SUM(status = 'draft') AS draft_count,
       SUM(status = 'pending_review') AS pending_count,
       SUM(status = 'paused' OR (status = 'published' AND is_active = FALSE)) AS paused_count,
       SUM(status = 'archived') AS archived_count,
       SUM(stock_status = 'out_of_stock' AND status != 'archived' AND status != 'deleted') AS out_of_stock_count,
       SUM(stock_status = 'low_stock' AND status != 'archived' AND status != 'deleted') AS low_stock_count
     FROM products
    WHERE seller_user_id = ? AND status != 'deleted'`,
    [businessUserId]
  );
  const stats = statsRows[0] || {};
  const [logoMedia, coverMedia] = await Promise.all([
    loadShopMedia(
      pool,
      config,
      shopSettings.logoMediaId || bpProfile.companyLogo,
      businessUserId,
      'business-logo'
    ),
    loadShopMedia(
      pool,
      config,
      shopSettings.coverMediaId || bpProfile.coverImage,
      businessUserId,
      'cover-image'
    ),
  ]);

  const businessName = bpProfile.companyName || bpProfile.businessName || bp.owner_name || null;

  const locations = locationRows.map((loc) => ({
    id: loc.id,
    businessUserId: loc.business_user_id,
    label: loc.label,
    address: loc.address,
    city: loc.city,
    state: loc.state || null,
    country: loc.country || null,
    pinCode: loc.pin_code || null,
    phone: loc.phone || null,
    operatingHours: loc.operating_hours || null,
    pickupEnabled: Boolean(loc.pickup_enabled),
    deliveryEnabled: Boolean(loc.delivery_enabled),
    isPrimary: Boolean(loc.is_primary),
    isActive: Boolean(loc.is_active),
    createdAt: loc.created_at,
    updatedAt: loc.updated_at,
  }));

  return {
    shop: {
      businessUserId: bp.user_id,
      listingId: bp.listing_id || bp.user_id,
      ownerName: bp.owner_name || null,
      businessName,
      storeDisplayName: shopSettings.storeDisplayName || businessName,
      storeCategory: shopSettings.storeCategory || bpProfile.businessType || bpProfile.industry || null,
      businessType: bpProfile.businessType || null,
      description: shopSettings.description ?? bpProfile.description ?? null,
      address: shopSettings.address ?? bpProfile.address ?? null,
      city: shopSettings.city ?? bpProfile.city ?? null,
      state: shopSettings.state ?? bpProfile.state ?? null,
      country: shopSettings.country ?? bpProfile.country ?? null,
      pinCode: shopSettings.pinCode ?? bpProfile.pinCode ?? null,
      businessEmail: shopSettings.businessEmail ?? bpProfile.email ?? null,
      businessPhone: shopSettings.businessPhone ?? bpProfile.phone ?? null,
      website: shopSettings.website ?? bpProfile.website ?? null,
      operatingHours: shopSettings.operatingHours ?? bpProfile.workingHours ?? null,
      pickupEnabled: shopSettings.pickupEnabled !== false,
      deliveryEnabled: shopSettings.deliveryEnabled !== false,
      shippingNotes: shopSettings.shippingNotes || null,
      returnPolicyDefault: shopSettings.returnPolicyDefault || null,
      warrantyDefault: shopSettings.warrantyDefault || null,
      publicVisibility: isObjectPublic(shopSettings) &&
        (!bp.listing_id || (
          bp.listing_status === 'published' &&
          Boolean(bp.listing_is_public) &&
          bp.listing_visibility === 'public'
        )),
      verificationStatus: bp.verification_status || 'pending',
      logoMediaId: logoMedia.id,
      logoUrl: logoMedia.url,
      coverMediaId: coverMedia.id,
      coverUrl: coverMedia.url,
    },
    locations,
    productStats: {
      total: Number(stats.total || 0),
      published: Number(stats.published_count || 0),
      draft: Number(stats.draft_count || 0),
      pendingReview: Number(stats.pending_count || 0),
      paused: Number(stats.paused_count || 0),
      archived: Number(stats.archived_count || 0),
      outOfStock: Number(stats.out_of_stock_count || 0),
      lowStock: Number(stats.low_stock_count || 0),
    },
  };
}

async function resolveProductCategoryRule(pool, categoryId, subcategoryId = null) {
  const defaultSchema = {
    categoryId: categoryId || null,
    supportsVariants: true,
    supportsCondition: false,
    supportsWarranty: false,
    supportsReturnPolicy: true,
    supportsCompareAtPrice: true,
    variantAttributeKeys: ['color'],
    filterableAttributeKeys: ['brand', 'color'],
    attributes: [
      { key: 'brand', label: 'Brand', type: 'text', filterable: true },
    ],
  };

  if (!categoryId && !subcategoryId) return defaultSchema;

  const candidates = [];
  if (subcategoryId) candidates.push(subcategoryId);
  if (categoryId) candidates.push(categoryId);

  const [catRows] = await pool.query(
    `SELECT id, parent_id, name, slug FROM categories WHERE id IN (${candidates.map(() => '?').join(',')})`,
    candidates
  );
  const catMap = new Map(catRows.map((c) => [c.id, c]));
  const lookupIds = [...candidates];
  for (const id of candidates) {
    const cat = catMap.get(id);
    if (cat?.parent_id && !lookupIds.includes(cat.parent_id)) {
      lookupIds.push(cat.parent_id);
    }
  }
  const uniqueIds = [...new Set(lookupIds)].filter(Boolean);
  if (!uniqueIds.length) return defaultSchema;

  const [ruleRows] = await pool.query(
    `SELECT * FROM product_category_rules WHERE category_id IN (${uniqueIds.map(() => '?').join(',')})`,
    uniqueIds
  );
  const ruleMap = new Map(ruleRows.map((r) => [r.category_id, r]));
  let matchedRule = null;
  for (const candidate of uniqueIds) {
    if (ruleMap.has(candidate)) {
      matchedRule = ruleMap.get(candidate);
      break;
    }
  }

  const [attrRows] = await pool.query(
    `SELECT attribute_key, label, attribute_type, options, is_filterable, is_required
       FROM category_attributes
      WHERE category_id IN (${uniqueIds.map(() => '?').join(',')})
      ORDER BY display_order ASC`,
    uniqueIds
  );

  const ruleAttributes = matchedRule ? parseJson(matchedRule.attributes, []) : [];
  const mergedMap = new Map();
  for (const attr of Array.isArray(ruleAttributes) ? ruleAttributes : []) {
    if (attr?.key) mergedMap.set(attr.key, attr);
  }
  for (const row of attrRows) {
    if (!mergedMap.has(row.attribute_key)) {
      mergedMap.set(row.attribute_key, {
        key: row.attribute_key,
        label: row.label,
        type: row.attribute_type || 'text',
        options: parseJson(row.options, []),
        filterable: Boolean(row.is_filterable),
        required: Boolean(row.is_required),
      });
    }
  }

  const attributes = Array.from(mergedMap.values());
  if (!matchedRule) {
    return {
      ...defaultSchema,
      attributes: attributes.length ? attributes : defaultSchema.attributes,
    };
  }

  return {
    categoryId: matchedRule.category_id,
    supportsVariants: Boolean(matchedRule.supports_variants),
    supportsCondition: Boolean(matchedRule.supports_condition),
    supportsWarranty: Boolean(matchedRule.supports_warranty),
    supportsReturnPolicy: Boolean(matchedRule.supports_return_policy),
    supportsCompareAtPrice: Boolean(matchedRule.supports_compare_at_price),
    variantAttributeKeys: parseJson(matchedRule.variant_attribute_keys, []),
    filterableAttributeKeys: parseJson(matchedRule.filterable_attribute_keys, []),
    attributes,
  };
}

async function validateProductCategorySelection(pool, categoryId, subcategoryId, { required = true } = {}) {
  if (!categoryId) {
    return required ? { ok: false, message: 'Select a product category.' } : { ok: true, categoryId: null, subcategoryId: null };
  }
  if (typeof categoryId !== 'string' || !categoryId.trim()) {
    return { ok: false, message: 'Select a valid product category.' };
  }
  const cleanCat = categoryId.trim();
  const cleanSub = typeof subcategoryId === 'string' && subcategoryId.trim() ? subcategoryId.trim() : null;

  const [catRows] = await pool.query(
    `SELECT c.id, c.parent_id, c.listing_type
       FROM categories c
       LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE c.id = ? AND c.is_active = TRUE
        AND (c.listing_type = 'product' OR parent.listing_type = 'product' OR c.parent_id = ?)
      LIMIT 1`,
    [cleanCat, SHOPPING_ROOT_ID]
  );
  if (!catRows.length) {
    return { ok: false, message: 'Select a valid product category.' };
  }
  if (cleanSub) {
    const [subRows] = await pool.query(
      'SELECT id FROM categories WHERE id = ? AND parent_id = ? AND is_active = TRUE LIMIT 1',
      [cleanSub, cleanCat]
    );
    if (!subRows.length) {
      return { ok: false, message: 'The selected subcategory does not belong to this category.' };
    }
  }
  return { ok: true, categoryId: cleanCat, subcategoryId: cleanSub };
}

function normalizeProductAttributes(rawAttributes, schema) {
  if (rawAttributes === undefined || rawAttributes === null) return { value: {} };
  if (!isRecord(rawAttributes)) return { error: 'Product attributes must be an object.' };
  if (Object.keys(rawAttributes).length > 30) {
    return { error: 'A product can have at most 30 category attributes.' };
  }
  const definitions = new Map((schema?.attributes || []).map((attribute) => [attribute.key, attribute]));
  const variantKeys = new Set(schema?.variantAttributeKeys || []);
  const clean = {};
  for (const [key, val] of Object.entries(rawAttributes)) {
    const definition = definitions.get(key) || (key === 'brand'
      ? { key: 'brand', label: 'Brand', type: 'text' }
      : null);
    if (!definition || variantKeys.has(key) || definition.variant) {
      return { error: `${key} is not a supported product-level attribute for this category.` };
    }
    if (val === undefined || val === null || val === '') continue;
    if (typeof val === 'string') {
      const value = val.trim();
      if (!value) continue;
      if (value.length > 160) return { error: `${definition.label || key} must be no more than 160 characters.` };
      if (definition.type === 'select' && Array.isArray(definition.options) && !definition.options.includes(value)) {
        return { error: `Select a valid ${String(definition.label || key).toLowerCase()}.` };
      }
      clean[key] = value;
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      clean[key] = val;
    } else if (typeof val === 'boolean') {
      clean[key] = val;
    } else {
      return { error: `${definition.label || key} must be text, a number, or a boolean.` };
    }
  }
  return { value: clean };
}

function normalizeVariantsInput(rawVariants, basePrice, schema) {
  if (rawVariants === undefined) return { provided: false, value: [] };
  if (rawVariants === null) return { provided: true, value: [] };
  if (!Array.isArray(rawVariants)) {
    return { error: 'Variants must be a list of variant options.' };
  }
  if (rawVariants.length > 50) {
    return { error: 'A product can have at most 50 variants.' };
  }

  const normalized = [];
  const variantKeys = new Set(schema?.variantAttributeKeys || []);
  const definitions = new Map((schema?.attributes || []).map((attribute) => [attribute.key, attribute]));
  const seenSkus = new Set();
  const seenOptions = new Set();
  for (const [idx, item] of rawVariants.entries()) {
    if (!isRecord(item)) {
      return { error: `Variant #${idx + 1} must be an object.` };
    }
    const skuCheck = optionalText(item.sku, 100, `Variant #${idx + 1} SKU`);
    if (skuCheck.error) return { error: skuCheck.error };
    const normalizedSku = skuCheck.value?.toLowerCase();
    if (normalizedSku && seenSkus.has(normalizedSku)) {
      return { error: 'Variant SKUs must be unique within a product.' };
    }
    if (normalizedSku) seenSkus.add(normalizedSku);

    const stockCheck = nonNegativeInt(item.stockQuantity, `Variant #${idx + 1} stock`, 0);
    if (stockCheck.error) return { error: stockCheck.error };
    const versionCheck = item.version === undefined
      ? { value: null }
      : nonNegativeInt(item.version, `Variant #${idx + 1} version`, 0);
    if (versionCheck.error) return { error: versionCheck.error };

    const effectivePriceRaw = item.price === undefined || item.price === null || item.price === ''
      ? basePrice
      : item.price;
    const priceCheck = priceNumber(effectivePriceRaw, `Variant #${idx + 1} price`, { required: false, allowZero: true });
    if (priceCheck.error) return { error: priceCheck.error };

    const compareCheck = priceNumber(item.compareAtPrice, `Variant #${idx + 1} compare-at price`, { required: false, allowZero: false });
    if (compareCheck.error) return { error: compareCheck.error };

    if (item.attributes !== undefined && item.attributes !== null && !isRecord(item.attributes)) {
      return { error: `Variant #${idx + 1} attributes must be an object.` };
    }
    const attrs = {};
    for (const [key, rawValue] of Object.entries(item.attributes || {})) {
      const definition = definitions.get(key);
      if (!variantKeys.has(key) || (definition && !definition.variant)) {
        return { error: `${key} is not a supported variant option for this category.` };
      }
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;
      if (!['string', 'number'].includes(typeof rawValue) || !String(rawValue).trim()) {
        return { error: `Variant #${idx + 1} option values must be text or numbers.` };
      }
      const value = String(rawValue).trim();
      if (value.length > 120) return { error: `Variant #${idx + 1} option values must be no more than 120 characters.` };
      if (definition?.type === 'select' && Array.isArray(definition.options) && !definition.options.includes(value)) {
        return { error: `Select a valid ${String(definition.label || key).toLowerCase()} for variant #${idx + 1}.` };
      }
      attrs[key] = value;
    }
    if (!Object.keys(attrs).length && !skuCheck.value) {
      return { error: `Variant #${idx + 1} needs at least one option (such as size or color) or a SKU.` };
    }
    const optionKey = JSON.stringify(Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b)));
    if (Object.keys(attrs).length && seenOptions.has(optionKey)) {
      return { error: 'Each variant must have a unique combination of options.' };
    }
    if (Object.keys(attrs).length) seenOptions.add(optionKey);

    if (item.isActive !== undefined && typeof item.isActive !== 'boolean') {
      return { error: `Variant #${idx + 1} active state must be true or false.` };
    }
    if (item.id !== undefined && item.id !== null && typeof item.id !== 'string') {
      return { error: `Variant #${idx + 1} ID must be text.` };
    }

    normalized.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : null,
      sku: skuCheck.value,
      attributes: attrs,
      price: priceCheck.value,
      compareAtPrice: compareCheck.value,
      stockQuantity: stockCheck.value,
      version: versionCheck.value,
      isActive: item.isActive !== false,
    });
  }
  return { provided: true, value: normalized };
}

function missingRequiredProductAttributes(schema, attributes, variants) {
  const missing = [];
  for (const definition of schema?.attributes || []) {
    if (!definition.required) continue;
    if (definition.variant || (schema.variantAttributeKeys || []).includes(definition.key)) {
      if (!variants.some((variant) => variant.isActive !== false && variant.attributes?.[definition.key])) {
        missing.push(definition.label || definition.key);
      }
    } else if (attributes[definition.key] === undefined || attributes[definition.key] === '') {
      missing.push(definition.label || definition.key);
    }
  }
  return missing;
}

function summarizeVariantsForLegacyColumn(variantsList) {
  const summary = {};
  for (const v of variantsList) {
    if (v.isActive === false) continue;
    for (const [k, val] of Object.entries(v.attributes || {})) {
      if (!summary[k]) summary[k] = [];
      if (!summary[k].includes(val)) summary[k].push(val);
    }
  }
  return summary;
}

async function syncProductVariantsInTx(connection, productId, normalizedVariants, baseStockQuantity) {
  const [existingRows] = await connection.query(
    'SELECT id, stock_quantity, version FROM product_variants WHERE product_id = ? FOR UPDATE',
    [productId]
  );
  const existingMap = new Map(existingRows.map((r) => [r.id, r]));
  const keptIds = new Set();

  for (const variant of normalizedVariants) {
    const variantName = variantLabelFromAttrs(variant.attributes, variant.sku);
    if (variant.id && existingMap.has(variant.id)) {
      keptIds.add(variant.id);
      await connection.query(
        `UPDATE product_variants
            SET sku = ?, name = ?, attributes = ?, price = ?, compare_at_price = ?,
                stock_quantity = ?, is_active = ?, version = version + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND product_id = ?`,
        [
          variant.sku,
          variantName,
          JSON.stringify(variant.attributes || {}),
          variant.price,
          variant.compareAtPrice,
          variant.stockQuantity,
          variant.isActive ? 1 : 0,
          variant.id,
          productId,
        ]
      );
    } else {
      const nextId = randomUUID();
      keptIds.add(nextId);
      await connection.query(
        `INSERT INTO product_variants (
           id, product_id, sku, name, attributes, price, compare_at_price, stock_quantity, is_active, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          nextId,
          productId,
          variant.sku,
          variantName,
          JSON.stringify(variant.attributes || {}),
          variant.price,
          variant.compareAtPrice,
          variant.stockQuantity,
          variant.isActive ? 1 : 0,
        ]
      );
    }
  }

  for (const existing of existingRows) {
    if (!keptIds.has(existing.id)) {
      await connection.query(
        `UPDATE product_variants
            SET is_active = FALSE, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND product_id = ?`,
        [existing.id, productId]
      );
    }
  }

  const activeVariants = normalizedVariants.filter((v) => v.isActive !== false);
  const effectiveStock = activeVariants.length
    ? activeVariants.reduce((sum, v) => sum + Number(v.stockQuantity || 0), 0)
    : Number(baseStockQuantity || 0);
  const stockStatus = computeStockStatus(effectiveStock);

  await connection.query(
    `UPDATE products
        SET stock_quantity = ?, stock_status = ?, variants = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [
      effectiveStock,
      stockStatus,
      JSON.stringify(summarizeVariantsForLegacyColumn(normalizedVariants)),
      productId,
    ]
  );

  return { effectiveStock, stockStatus };
}

async function recalculateProductStockFromVariantsTx(connection, productId) {
  const [variants] = await connection.query(
    'SELECT * FROM product_variants WHERE product_id = ? AND is_active = TRUE',
    [productId]
  );
  const [prodRows] = await connection.query(
    'SELECT stock_quantity FROM products WHERE id = ? LIMIT 1 FOR UPDATE',
    [productId]
  );
  if (!prodRows.length) return null;

  const effectiveStock = variants.length
    ? variants.reduce((sum, v) => sum + Number(v.stock_quantity || 0), 0)
    : Number(prodRows[0].stock_quantity || 0);
  const stockStatus = computeStockStatus(effectiveStock);

  const mapped = variants.map((v) => ({
    attributes: parseJson(v.attributes, {}),
    isActive: Boolean(v.is_active),
  }));

  await connection.query(
    `UPDATE products
        SET stock_quantity = ?, stock_status = ?, variants = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [
      effectiveStock,
      stockStatus,
      JSON.stringify(summarizeVariantsForLegacyColumn(mapped)),
      productId,
    ]
  );
  return { effectiveStock, stockStatus };
}

async function resolveAndAttachProductMedia(connection, productId, ownerUserId, mediaInput) {
  if (mediaInput === undefined) return { ok: true };
  if (!Array.isArray(mediaInput)) {
    return { ok: false, status: 400, code: 'invalid_media', message: 'Product media must be an array.' };
  }
  if (mediaInput.length > 8) {
    return { ok: false, status: 400, code: 'invalid_media', message: 'Attach at most 8 media items per product.' };
  }

  const normalized = [];
  for (const [index, entry] of mediaInput.entries()) {
    const assetId = typeof entry === 'string' ? entry : entry?.mediaAssetId;
    if (!assetId || typeof assetId !== 'string') {
      return { ok: false, status: 400, code: 'invalid_media', message: 'Each media item requires a valid mediaAssetId.' };
    }
    normalized.push({
      mediaAssetId: assetId,
      isCover: typeof entry === 'object' && entry !== null && entry.isCover !== undefined
        ? Boolean(entry.isCover)
        : index === 0,
      altText: typeof entry === 'object' && entry !== null && typeof entry.altText === 'string'
        ? entry.altText.trim().slice(0, 255)
        : null,
      displayOrder: index,
    });
  }

  const uniqueAssetIds = [...new Set(normalized.map((item) => item.mediaAssetId))];
  let assetMap = new Map();
  if (uniqueAssetIds.length) {
    const [assetRows] = await connection.query(
      `SELECT id, object_key, content_type, byte_size, purpose
         FROM media_assets
        WHERE user_id = ? AND role = 'business'
          AND purpose IN ('product-image', 'listing-image', 'listing-video')
          AND id IN (${uniqueAssetIds.map(() => '?').join(',')})`,
      [ownerUserId, ...uniqueAssetIds]
    );
    if (assetRows.length !== uniqueAssetIds.length) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_media',
        message: 'Product images and videos must be uploaded by this business.',
      };
    }
    assetMap = new Map(assetRows.map((a) => [a.id, a]));
  }

  await connection.query(
    `DELETE FROM listing_media WHERE listing_type = 'product' AND listing_id = ?`,
    [productId]
  );

  let coverAssigned = false;
  const legacyImages = [];
  for (const item of normalized) {
    const asset = assetMap.get(item.mediaAssetId);
    const isVideo = asset.content_type === 'video/mp4' || asset.purpose === 'listing-video';
    const mediaRole = isVideo ? 'video' : 'image';
    const isCover = !isVideo && item.isCover && !coverAssigned;
    if (isCover) coverAssigned = true;

    await connection.query(
      `INSERT INTO listing_media (
         id, listing_type, listing_id, media_asset_id, media_role, display_order,
         is_cover, alt_text, mime_type, file_size, object_key, visibility
       ) VALUES (?, 'product', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public')`,
      [
        randomUUID(),
        productId,
        item.mediaAssetId,
        mediaRole,
        item.displayOrder,
        isCover,
        item.altText,
        asset.content_type || null,
        asset.byte_size || null,
        asset.object_key || null,
      ]
    );
    await connection.query(
      `UPDATE media_assets SET status = 'attached', expires_at = NULL WHERE id = ?`,
      [item.mediaAssetId]
    );
    if (!isVideo) legacyImages.push(item.mediaAssetId);
  }

  await connection.query(
    'UPDATE products SET images = ? WHERE id = ?',
    [JSON.stringify(legacyImages), productId]
  );

  return { ok: true };
}

async function hydrateProducts(pool, config, rows, {
  includeShopDetails = true,
  publicOnlyVariants = false,
} = {}) {
  if (!rows.length) return [];
  const productIds = rows.map((r) => r.id);
  const placeholders = productIds.map(() => '?').join(',');

  const [variantRows] = await pool.query(
    `SELECT * FROM product_variants
      WHERE product_id IN (${placeholders})
      ORDER BY created_at ASC`,
    productIds
  );
  const variantsByProduct = new Map();
  for (const v of variantRows) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id).push({
      id: v.id,
      productId: v.product_id,
      sku: v.sku || null,
      attributes: parseJson(v.attributes, {}),
      price: v.price === null || v.price === undefined ? null : Number(v.price),
      compareAtPrice: v.compare_at_price === null || v.compare_at_price === undefined ? null : Number(v.compare_at_price),
      stockQuantity: Number(v.stock_quantity || 0),
      stockStatus: computeStockStatus(v.stock_quantity),
      isActive: Boolean(v.is_active),
      version: Number(v.version || 0),
    });
  }

  const [mediaRows] = await pool.query(
    `SELECT lm.id, lm.listing_id, lm.media_asset_id, lm.media_role, lm.display_order,
            lm.is_cover, lm.alt_text, lm.mime_type, lm.file_size, lm.object_key,
            ma.object_key AS asset_object_key, ma.content_type AS asset_content_type,
            ma.byte_size AS asset_byte_size
       FROM listing_media lm
       LEFT JOIN media_assets ma ON ma.id = lm.media_asset_id
      WHERE lm.listing_type = 'product' AND lm.listing_id IN (${placeholders})
      ORDER BY lm.is_cover DESC, lm.display_order ASC, lm.created_at ASC`,
    productIds
  );

  const mediaByProduct = new Map();
  for (const m of mediaRows) {
    const objectKey = m.object_key || m.asset_object_key || null;
    const url = objectKey ? await createPrivateReadUrl(config, objectKey).catch(() => null) : null;
    if (!mediaByProduct.has(m.listing_id)) mediaByProduct.set(m.listing_id, []);
    mediaByProduct.get(m.listing_id).push({
      id: m.id,
      mediaAssetId: m.media_asset_id,
      mediaRole: m.media_role || 'image',
      displayOrder: Number(m.display_order || 0),
      isCover: Boolean(m.is_cover),
      altText: m.alt_text || null,
      mimeType: m.mime_type || m.asset_content_type || null,
      fileSize: m.file_size === null || m.file_size === undefined
        ? (m.asset_byte_size === null || m.asset_byte_size === undefined ? null : Number(m.asset_byte_size))
        : Number(m.file_size),
      url,
    });
  }

  const categoryIds = [
    ...new Set(
      rows.flatMap((r) => [r.category_id, r.subcategory_id].filter(Boolean))
    ),
  ];
  const categoryNameMap = new Map();
  if (categoryIds.length) {
    const [catRows] = await pool.query(
      `SELECT id, name, slug FROM categories WHERE id IN (${categoryIds.map(() => '?').join(',')})`,
      categoryIds
    );
    for (const c of catRows) categoryNameMap.set(c.id, c.name);
  }

  const logoCache = new Map();
  const hydrated = [];
  for (const r of rows) {
    const storedVariants = variantsByProduct.get(r.id) || [];
    const variantsList = publicOnlyVariants
      ? storedVariants.filter((variant) => variant.isActive)
      : storedVariants;
    const media = mediaByProduct.get(r.id) || [];
    const cover = media.find((m) => m.isCover && m.mediaRole === 'image') ||
      media.find((m) => m.mediaRole === 'image') ||
      null;
    const bpProfile = parseJson(r.business_profile, {}) || {};
    const shopSettings = parseJson(r.shop_settings, {}) || {};
    const deliveryOptions = parseJson(r.delivery_options, null) || {};
    const attributes = parseJson(r.attributes, {}) || {};
    const businessName = bpProfile.companyName || bpProfile.businessName || r.seller_name || null;
    const logoId = mediaAssetId(shopSettings.logoMediaId) || mediaAssetId(bpProfile.companyLogo);

    let shopLogoUrl = null;
    if (includeShopDetails && logoId) {
      const cacheKey = `${r.seller_user_id}:${logoId}`;
      if (!logoCache.has(cacheKey)) {
        logoCache.set(
          cacheKey,
          await loadShopMedia(pool, config, logoId, r.seller_user_id, 'business-logo')
        );
      }
      shopLogoUrl = logoCache.get(cacheKey).url;
    }

    const activeVariants = variantsList.filter((v) => v.isActive);
    const totalStock = activeVariants.length
      ? activeVariants.reduce((sum, v) => sum + v.stockQuantity, 0)
      : Number(r.stock_quantity || 0);
    const priceNum = Number(r.price || 0);
    const compareAtNum = r.compare_at_price === null || r.compare_at_price === undefined
      ? null
      : Number(r.compare_at_price);
    const discountPercent = compareAtNum && compareAtNum > priceNum
      ? Math.round(((compareAtNum - priceNum) / compareAtNum) * 100)
      : 0;

    hydrated.push({
      id: r.id,
      listingId: r.id,
      listingType: 'product',
      sellerUserId: r.seller_user_id,
      sellerRole: r.seller_role || 'business',
      sellerName: r.seller_name || businessName || null,
      categoryId: r.category_id || null,
      categoryName: categoryNameMap.get(r.category_id) || null,
      subcategoryId: r.subcategory_id || null,
      subcategoryName: categoryNameMap.get(r.subcategory_id) || null,
      shopLocationId: r.shop_location_id || null,
      name: r.name,
      title: r.name,
      sku: r.sku || null,
      shortDescription: r.short_description || null,
      description: r.description || '',
      brand: r.brand || attributes.brand || null,
      price: priceNum,
      compareAtPrice: compareAtNum,
      discountPercent,
      currency: r.currency || 'INR',
      productCondition: r.product_condition || null,
      stockQuantity: totalStock,
      stockStatus: computeStockStatus(totalStock),
      isActive: r.is_active === undefined ? true : Boolean(r.is_active),
      status: r.status,
      moderationStatus: r.moderation_status || null,
      moderationReason: r.moderation_reason || null,
      variants: variantsList,
      variantSummary: summarizeVariantsForLegacyColumn(variantsList),
      attributes,
      deliveryInfo: r.delivery_info || deliveryOptions.deliveryInfo || null,
      deliveryOptions: {
        deliveryEnabled: deliveryOptions.deliveryEnabled !== false,
        pickupEnabled: Boolean(deliveryOptions.pickupEnabled ?? r.loc_pickup_enabled ?? shopSettings.pickupEnabled),
        shippingFee: deliveryOptions.shippingFee ?? null,
        estimatedDispatchDays: deliveryOptions.estimatedDispatchDays ?? null,
        deliveryInfo: r.delivery_info || deliveryOptions.deliveryInfo || null,
      },
      returnPolicy: r.return_policy || null,
      warrantyInfo: r.warranty_info || null,
      media,
      images: media.filter((m) => m.mediaRole === 'image').map((m) => m.url).filter(Boolean),
      coverImage: cover?.url || null,
      shop: includeShopDetails ? {
        businessUserId: r.seller_user_id,
        businessName,
        storeDisplayName: shopSettings.storeDisplayName || businessName,
        verificationStatus: r.verification_status || 'pending',
        city: r.loc_city || shopSettings.city || bpProfile.city || null,
        state: r.loc_state || shopSettings.state || bpProfile.state || null,
        locationLabel: r.loc_label || null,
        pickupEnabled: shopSettings.pickupEnabled !== false,
        deliveryEnabled: shopSettings.deliveryEnabled !== false,
        logoUrl: shopLogoUrl,
      } : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }
  return hydrated;
}

export function registerShopProductRoutes(router, { pool, config, authenticate }) {
  // ---- Business Shop & Locations ----
  router.get('/business/shop', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);
      const payload = await buildShopPayload(pool, config, req.auth.userId);
      if (!payload) {
        return sendError(res, 404, 'profile_not_found', 'Complete your business profile before managing shop settings.');
      }
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  });

  router.put('/business/shop', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);
      if (!check.profile) {
        return sendError(res, 404, 'profile_not_found', 'Business profile was not found.');
      }
      const body = req.body || {};
      const storeDisplayName = optionalText(body.storeDisplayName, 140, 'Store display name');
      const businessName = optionalText(body.businessName, 140, 'Business name');
      const storeCategory = optionalText(body.storeCategory, 120, 'Store category');
      const description = optionalText(body.description, 4000, 'Shop description');
      const address = optionalText(body.address, 500, 'Address');
      const city = optionalText(body.city, 120, 'City');
      const state = optionalText(body.state, 120, 'State');
      const country = optionalText(body.country, 80, 'Country');
      const pinCode = optionalText(body.pinCode, 24, 'PIN / Postal code');
      const businessEmail = optionalText(body.businessEmail, 255, 'Business email');
      const businessPhone = optionalText(body.businessPhone, 32, 'Business phone');
      const website = optionalText(body.website, 255, 'Website');
      const operatingHours = optionalText(body.operatingHours, 255, 'Operating hours');
      const shippingNotes = optionalText(body.shippingNotes, 500, 'Shipping / delivery notes');
      const returnPolicyDefault = optionalText(body.returnPolicyDefault, 1000, 'Default return policy');
      const warrantyDefault = optionalText(body.warrantyDefault, 1000, 'Default warranty policy');

      const firstErr = [
        storeDisplayName, businessName, storeCategory, description, address, city,
        state, country, pinCode, businessEmail, businessPhone, website,
        operatingHours, shippingNotes, returnPolicyDefault, warrantyDefault,
      ].find((item) => item.error);
      if (firstErr) return sendError(res, 400, 'validation_error', firstErr.error);

      const existingProfile = parseJson(check.profile.profile, {}) || {};
      const existingSettings = parseJson(check.profile.shop_settings, {}) || {};
      const logoInput = mediaIdInput(body.logoMediaId, 'Store logo');
      const coverInput = mediaIdInput(body.coverMediaId, 'Store cover');
      if (logoInput.error || coverInput.error) {
        return sendError(res, 400, 'validation_error', logoInput.error || coverInput.error);
      }
      for (const [assetId, purpose, label] of [
        [logoInput.value, 'business-logo', 'Store logo'],
        [coverInput.value, 'cover-image', 'Store cover'],
      ]) {
        if (!assetId) continue;
        const [assetRows] = await pool.query(
          `SELECT id FROM media_assets
            WHERE id = ? AND user_id = ? AND role = 'business'
              AND purpose = ? AND content_type LIKE 'image/%'
            LIMIT 1`,
          [assetId, req.auth.userId, purpose]
        );
        if (!assetRows.length) {
          return sendError(res, 400, 'invalid_shop_media', `${label} must be an image uploaded by this business.`);
        }
      }
      for (const key of ['pickupEnabled', 'deliveryEnabled', 'publicVisibility']) {
        if (body[key] !== undefined && typeof body[key] !== 'boolean') {
          return sendError(res, 400, 'validation_error', `${key} must be true or false.`);
        }
      }
      const fallbackName = existingProfile.companyName || existingProfile.businessName || 'Business Shop';
      const effectiveBusinessName = businessName.value || fallbackName;
      const nextProfile = {
        ...existingProfile,
        ...(businessName.value ? { companyName: businessName.value, businessName: businessName.value } : {}),
        ...(body.storeCategory !== undefined && storeCategory.value ? { businessType: storeCategory.value } : {}),
        ...(body.description !== undefined ? { description: description.value } : {}),
        ...(body.address !== undefined ? { address: address.value } : {}),
        ...(body.city !== undefined ? { city: city.value } : {}),
        ...(body.state !== undefined ? { state: state.value } : {}),
        ...(body.country !== undefined ? { country: country.value } : {}),
        ...(body.pinCode !== undefined ? { pinCode: pinCode.value } : {}),
        ...(body.businessEmail !== undefined ? { email: businessEmail.value } : {}),
        ...(body.businessPhone !== undefined ? { phone: businessPhone.value } : {}),
        ...(body.website !== undefined ? { website: website.value } : {}),
        ...(body.logoMediaId !== undefined ? { companyLogo: logoInput.value } : {}),
        ...(body.coverMediaId !== undefined ? { coverImage: coverInput.value } : {}),
      };
      const nextSettings = {
        ...existingSettings,
        storeDisplayName: body.storeDisplayName !== undefined
          ? (storeDisplayName.value || effectiveBusinessName)
          : (existingSettings.storeDisplayName || effectiveBusinessName),
        storeCategory: body.storeCategory !== undefined ? storeCategory.value : (existingSettings.storeCategory || existingProfile.businessType || null),
        description: body.description !== undefined ? description.value : (existingSettings.description ?? existingProfile.description ?? null),
        address: body.address !== undefined ? address.value : (existingSettings.address ?? existingProfile.address ?? null),
        city: body.city !== undefined ? city.value : (existingSettings.city ?? existingProfile.city ?? null),
        state: body.state !== undefined ? state.value : (existingSettings.state ?? existingProfile.state ?? null),
        country: body.country !== undefined ? country.value : (existingSettings.country ?? existingProfile.country ?? null),
        pinCode: body.pinCode !== undefined ? pinCode.value : (existingSettings.pinCode ?? existingProfile.pinCode ?? null),
        businessEmail: body.businessEmail !== undefined ? businessEmail.value : (existingSettings.businessEmail ?? existingProfile.email ?? null),
        businessPhone: body.businessPhone !== undefined ? businessPhone.value : (existingSettings.businessPhone ?? existingProfile.phone ?? null),
        website: body.website !== undefined ? website.value : (existingSettings.website ?? existingProfile.website ?? null),
        logoMediaId: body.logoMediaId !== undefined
          ? logoInput.value
          : (existingSettings.logoMediaId || existingProfile.companyLogo || null),
        coverMediaId: body.coverMediaId !== undefined
          ? coverInput.value
          : (existingSettings.coverMediaId || existingProfile.coverImage || null),
        operatingHours: body.operatingHours !== undefined ? operatingHours.value : (existingSettings.operatingHours || existingProfile.workingHours || null),
        pickupEnabled: body.pickupEnabled !== undefined ? body.pickupEnabled : (existingSettings.pickupEnabled !== false),
        deliveryEnabled: body.deliveryEnabled !== undefined ? body.deliveryEnabled : (existingSettings.deliveryEnabled !== false),
        shippingNotes: body.shippingNotes !== undefined ? shippingNotes.value : (existingSettings.shippingNotes || null),
        returnPolicyDefault: body.returnPolicyDefault !== undefined ? returnPolicyDefault.value : (existingSettings.returnPolicyDefault || null),
        warrantyDefault: body.warrantyDefault !== undefined ? warrantyDefault.value : (existingSettings.warrantyDefault || null),
        publicVisibility: body.publicVisibility !== undefined
          ? body.publicVisibility
          : isObjectPublic(existingSettings),
      };

      const nextVisibility = nextSettings.publicVisibility ? 'public' : 'private';

      await withTransaction(pool, async (connection) => {
        for (const [assetId, purpose] of [
          [logoInput.value, 'business-logo'],
          [coverInput.value, 'cover-image'],
        ]) {
          if (assetId) {
            const [assetRows] = await connection.query(
              `SELECT id FROM media_assets
                WHERE id = ? AND user_id = ? AND role = 'business'
                  AND purpose = ? AND content_type LIKE 'image/%'
                LIMIT 1 FOR UPDATE`,
              [assetId, req.auth.userId, purpose]
            );
            if (!assetRows.length) {
              const err = new Error('Store images must be uploaded by this business.');
              err.status = 400;
              err.code = 'invalid_shop_media';
              throw err;
            }
            await connection.query(
              `UPDATE media_assets SET status = 'attached', expires_at = NULL
                WHERE id = ? AND user_id = ? AND role = 'business' AND purpose = ?`,
              [assetId, req.auth.userId, purpose]
            );
          }
        }
        await connection.query(
          `UPDATE business_profiles
              SET profile = ?,
                  shop_settings = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?`,
          [
            JSON.stringify(nextProfile),
            JSON.stringify(nextSettings),
            req.auth.userId,
          ]
        );

        await syncMarketplaceListing(connection, {
          id: check.profile.listing_id || req.auth.userId,
          entityId: req.auth.userId,
          type: 'business_profile',
          ownerId: req.auth.userId,
          ownerRole: 'business',
          title: nextSettings.storeDisplayName || effectiveBusinessName,
          shortSummary: (nextSettings.description || effectiveBusinessName).slice(0, 240),
          description: nextSettings.description ?? effectiveBusinessName,
          location: {
            city: nextSettings.city || undefined,
            state: nextSettings.state || undefined,
            country: nextSettings.country || undefined,
          },
          visibility: nextVisibility,
          status: check.profile.listing_status || 'published',
        });
      });

      const payload = await buildShopPayload(pool, config, req.auth.userId);
      return res.json(payload);
    } catch (error) {
      if (error.status && error.code) {
        return sendError(res, error.status, error.code, error.message);
      }
      return next(error);
    }
  });

  router.post('/business/shop/locations', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);
      const body = req.body || {};
      const label = requiredText(body.label, 120, 'Location label');
      const address = requiredText(body.address, 500, 'Address');
      const city = requiredText(body.city, 120, 'City');
      const state = optionalText(body.state, 120, 'State');
      const country = optionalText(body.country, 80, 'Country');
      const pinCode = optionalText(body.pinCode, 24, 'PIN / Postal code');
      const phone = optionalText(body.phone, 32, 'Contact phone');
      const operatingHours = optionalText(body.operatingHours, 255, 'Operating hours');
      const err = [label, address, city, state, country, pinCode, phone, operatingHours].find((i) => i.error);
      if (err) return sendError(res, 400, 'validation_error', err.error);

      const id = randomUUID();
      const isPrimary = Boolean(body.isPrimary);

      await withTransaction(pool, async (connection) => {
        if (isPrimary) {
          await connection.query(
            'UPDATE business_shop_locations SET is_primary = FALSE WHERE business_user_id = ?',
            [req.auth.userId]
          );
        }
        await connection.query(
          `INSERT INTO business_shop_locations (
             id, business_user_id, label, address, city, state, country, pin_code,
             phone, operating_hours, pickup_enabled, delivery_enabled, is_primary, is_active
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            req.auth.userId,
            label.value,
            address.value,
            city.value,
            state.value,
            country.value,
            pinCode.value,
            phone.value,
            operatingHours.value,
            body.pickupEnabled !== false,
            body.deliveryEnabled !== false,
            isPrimary,
            body.isActive !== false,
          ]
        );
      });

      const payload = await buildShopPayload(pool, config, req.auth.userId);
      return res.status(201).json({
        location: payload?.locations.find((l) => l.id === id) || null,
        locations: payload?.locations || [],
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/business/shop/locations/:id', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);
      const [existing] = await pool.query(
        'SELECT * FROM business_shop_locations WHERE id = ? AND business_user_id = ? LIMIT 1',
        [req.params.id, req.auth.userId]
      );
      if (!existing.length) {
        return sendError(res, 404, 'location_not_found', 'Shop location was not found.');
      }
      const body = req.body || {};
      const label = body.label !== undefined ? requiredText(body.label, 120, 'Location label') : { value: existing[0].label };
      const address = body.address !== undefined ? requiredText(body.address, 500, 'Address') : { value: existing[0].address };
      const city = body.city !== undefined ? requiredText(body.city, 120, 'City') : { value: existing[0].city };
      const state = body.state !== undefined ? optionalText(body.state, 120, 'State') : { value: existing[0].state };
      const country = body.country !== undefined ? optionalText(body.country, 80, 'Country') : { value: existing[0].country };
      const pinCode = body.pinCode !== undefined ? optionalText(body.pinCode, 24, 'PIN / Postal code') : { value: existing[0].pin_code };
      const phone = body.phone !== undefined ? optionalText(body.phone, 32, 'Contact phone') : { value: existing[0].phone };
      const operatingHours = body.operatingHours !== undefined ? optionalText(body.operatingHours, 255, 'Operating hours') : { value: existing[0].operating_hours };

      const err = [label, address, city, state, country, pinCode, phone, operatingHours].find((i) => i.error);
      if (err) return sendError(res, 400, 'validation_error', err.error);

      const isPrimary = body.isPrimary !== undefined ? Boolean(body.isPrimary) : Boolean(existing[0].is_primary);
      await withTransaction(pool, async (connection) => {
        if (isPrimary) {
          await connection.query(
            'UPDATE business_shop_locations SET is_primary = FALSE WHERE business_user_id = ?',
            [req.auth.userId]
          );
        }
        await connection.query(
          `UPDATE business_shop_locations
              SET label = ?, address = ?, city = ?, state = ?, country = ?, pin_code = ?,
                  phone = ?, operating_hours = ?, pickup_enabled = ?, delivery_enabled = ?,
                  is_primary = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND business_user_id = ?`,
          [
            label.value,
            address.value,
            city.value,
            state.value,
            country.value,
            pinCode.value,
            phone.value,
            operatingHours.value,
            body.pickupEnabled !== undefined ? Boolean(body.pickupEnabled) : Boolean(existing[0].pickup_enabled),
            body.deliveryEnabled !== undefined ? Boolean(body.deliveryEnabled) : Boolean(existing[0].delivery_enabled),
            isPrimary,
            body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing[0].is_active),
            req.params.id,
            req.auth.userId,
          ]
        );
      });

      const payload = await buildShopPayload(pool, config, req.auth.userId);
      return res.json({
        location: payload?.locations.find((l) => l.id === req.params.id) || null,
        locations: payload?.locations || [],
      });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/business/shop/locations/:id', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);
      const deleted = await withTransaction(pool, async (connection) => {
        await connection.query(
          'UPDATE products SET shop_location_id = NULL WHERE shop_location_id = ? AND seller_user_id = ?',
          [req.params.id, req.auth.userId]
        );
        const [result] = await connection.query(
          'DELETE FROM business_shop_locations WHERE id = ? AND business_user_id = ?',
          [req.params.id, req.auth.userId]
        );
        return result.affectedRows > 0;
      });
      if (!deleted) {
        return sendError(res, 404, 'location_not_found', 'Shop location was not found.');
      }
      const payload = await buildShopPayload(pool, config, req.auth.userId);
      return res.json({ deleted: true, locations: payload?.locations || [] });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/shops/:id', async (req, res, next) => {
    try {
      const payload = await buildShopPayload(pool, config, req.params.id);
      if (!payload || !payload.shop.publicVisibility) {
        return sendError(res, 404, 'shop_not_found', 'Shop was not found.');
      }
      const [prodRows] = await pool.query(
        `SELECT ${PRODUCT_SELECT_COLUMNS}
           ${PRODUCT_FROM_JOIN}
          WHERE p.seller_user_id = ?
            AND p.status = 'published' AND p.is_active = TRUE
            AND EXISTS (
              SELECT 1 FROM marketplace_listings product_listing
               WHERE product_listing.id = p.id AND product_listing.listing_type = 'product'
                 AND product_listing.status = 'published'
                 AND product_listing.is_public = TRUE
                 AND product_listing.visibility = 'public'
            )
          ORDER BY p.created_at DESC
          LIMIT 40`,
        [req.params.id]
      );
      const products = await hydrateProducts(pool, config, prodRows, {
        includeShopDetails: true,
        publicOnlyVariants: true,
      });
      return res.json({
        shop: payload.shop,
        locations: payload.locations.filter((loc) => loc.isActive),
        products,
      });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Category Schema (Dynamic Product Attributes) ----
  router.get('/marketplace/products/categories/:id/schema', async (req, res, next) => {
    try {
      const subcategoryId = typeof req.query.subcategoryId === 'string' && req.query.subcategoryId.trim()
        ? req.query.subcategoryId.trim()
        : null;
      const schema = await resolveProductCategoryRule(pool, req.params.id, subcategoryId);
      return res.json({ schema });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Business Product Catalogue Management ----
  router.get('/marketplace/my-products', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || req.query.pageSize) || 20));
      const offset = (page - 1) * limit;
      const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
      const stockStatus = typeof req.query.stockStatus === 'string' ? req.query.stockStatus.trim() : '';

      const params = [req.auth.userId];
      let where = `WHERE p.seller_user_id = ? AND p.status != 'deleted'`;
      if (statusFilter && statusFilter !== 'all') {
        where += ` AND p.status = ?`;
        params.push(statusFilter);
      }
      if (categoryId) {
        where += ` AND p.category_id = ?`;
        params.push(categoryId);
      }
      if (stockStatus && stockStatus !== 'all') {
        where += ` AND p.stock_status = ?`;
        params.push(stockStatus);
      }
      if (search) {
        const like = `%${search}%`;
        where += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?)`;
        params.push(like, like, like);
      }

      const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM products p ${where}`, params);
      const total = Number(countRows[0]?.total || 0);

      const [rows] = await pool.query(
        `SELECT ${PRODUCT_SELECT_COLUMNS},
                ml.moderation_status, ml.moderation_reason
           ${PRODUCT_FROM_JOIN}
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'product'
          ${where}
          ORDER BY p.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const [statusCountRows] = await pool.query(
        `SELECT status, COUNT(*) AS count
           FROM products
          WHERE seller_user_id = ? AND status != 'deleted'
          GROUP BY status`,
        [req.auth.userId]
      );
      const countsByStatus = {
        all: 0,
        draft: 0,
        pending_review: 0,
        published: 0,
        rejected: 0,
        paused: 0,
        archived: 0,
      };
      for (const row of statusCountRows) {
        countsByStatus[row.status] = Number(row.count || 0);
        countsByStatus.all += Number(row.count || 0);
      }

      const items = await hydrateProducts(pool, config, rows);
      return res.json({
        items,
        countsByStatus,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasMore: offset + items.length < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/my-products/:id', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const [rows] = await pool.query(
        `SELECT ${PRODUCT_SELECT_COLUMNS},
                ml.moderation_status, ml.moderation_reason
           ${PRODUCT_FROM_JOIN}
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'product'
          WHERE p.id = ? AND p.seller_user_id = ? AND p.status != 'deleted'
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) {
        return sendError(res, 404, 'listing_not_found', 'Product was not found.');
      }

      const [hydrated] = await hydrateProducts(pool, config, rows);
      const schema = await resolveProductCategoryRule(pool, rows[0].category_id, rows[0].subcategory_id);
      const [historyRows] = await pool.query(
        `SELECT from_status, to_status, changed_by_role, reason, created_at
           FROM listing_status_history
          WHERE listing_id = ? AND listing_type = 'product'
          ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      );
      const [inventoryRows] = await pool.query(
        `SELECT * FROM inventory_adjustments WHERE product_id = ? ORDER BY created_at DESC LIMIT 25`,
        [req.params.id]
      );

      return res.json({
        product: hydrated,
        schema,
        statusHistory: historyRows,
        inventoryHistory: inventoryRows,
      });
    } catch (error) {
      return next(error);
    }
  });

  async function saveOrUpdateProduct(req, res, next, { isCreate }) {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      let existing = null;
      if (!isCreate) {
        const [existingRows] = await pool.query(
          `SELECT p.*, ml.moderation_status, ml.moderation_reason
             FROM products p
             LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'product'
            WHERE p.id = ? AND p.seller_user_id = ? AND p.status != 'deleted'
            LIMIT 1`,
          [req.params.id, req.auth.userId]
        );
        if (!existingRows.length) {
          return sendError(res, 404, 'listing_not_found', 'Product was not found.');
        }
        existing = existingRows[0];
        if (req.method === 'PATCH' && req.body?.status !== undefined) {
          return sendError(
            res,
            409,
            'use_listing_lifecycle',
            'Use the product transition or unified listing lifecycle endpoint to change status.'
          );
        }
      }

      const body = req.body || {};
      const action = typeof body.action === 'string' && PRODUCT_LIFECYCLE_ACTIONS.has(body.action)
        ? body.action
        : null;
      const requestedStatusRaw = action === 'save_draft'
        ? 'draft'
        : action === 'submit'
          ? 'pending_review'
          : action === 'publish' || action === 'resume'
            ? 'published'
            : action === 'pause'
              ? 'paused'
              : action === 'archive'
                ? 'archived'
                : body.status;

      const policy = await getModerationPolicy(pool, config);
      let nextStatus = existing ? existing.status : (requestedStatusRaw === 'published' ? 'published' : 'draft');
      if (isCreate) {
        if (requestedStatusRaw === 'pending_review') {
          nextStatus = 'pending_review';
        } else if (requestedStatusRaw === 'published') {
          if (requiresReviewForType(policy, 'product')) {
            if (!action) {
              return sendError(
                res,
                409,
                'review_required',
                'Products require review before publishing. Submit for review or save as a draft.'
              );
            }
            nextStatus = 'pending_review';
          } else {
            nextStatus = 'published';
          }
        } else {
          nextStatus = 'draft';
        }
      } else if (requestedStatusRaw !== undefined && requestedStatusRaw !== existing.status) {
        const candidateStatus = requestedStatusRaw === 'published' && requiresReviewForType(policy, 'product') && existing.moderation_status !== 'approved'
          ? 'pending_review'
          : requestedStatusRaw;
        const transition = validateOwnerTransition({
          fromStatus: existing.status,
          toStatus: candidateStatus,
          moderationPolicy: policy,
          listingType: 'product',
          moderationStatus: existing.moderation_status,
        });
        if (!transition.ok) {
          return sendError(res, transition.status, transition.code, transition.message);
        }
        nextStatus = transition.toStatus;
      }

      const isDraft = nextStatus === 'draft';
      if (!isDraft && !check.profile) {
        return sendError(res, 409, 'business_profile_required', 'Complete a business profile before submitting products.');
      }
      const nameCheck = body.name !== undefined || isCreate
        ? requiredText(body.name, 180, 'Product name')
        : { value: existing.name };
      if (nameCheck.error) return sendError(res, 400, 'validation_error', nameCheck.error);

      const descRaw = body.description !== undefined ? body.description : (existing ? existing.description : '');
      const descCheck = isDraft
        ? optionalText(descRaw || null, 10000, 'Description')
        : requiredText(descRaw, 10000, 'Description');
      if (descCheck.error) return sendError(res, 400, 'validation_error', descCheck.error);

      const shortDescCheck = body.shortDescription !== undefined
        ? optionalText(body.shortDescription, 500, 'Short description')
        : { value: existing?.short_description || null };
      if (shortDescCheck.error) return sendError(res, 400, 'validation_error', shortDescCheck.error);

      const skuCheck = body.sku !== undefined ? optionalText(body.sku, 100, 'SKU') : { value: existing?.sku || null };
      if (skuCheck.error) return sendError(res, 400, 'validation_error', skuCheck.error);

      const brandCheck = body.brand !== undefined ? optionalText(body.brand, 120, 'Brand') : { value: existing?.brand || null };
      if (brandCheck.error) return sendError(res, 400, 'validation_error', brandCheck.error);

      const priceRaw = body.price !== undefined ? body.price : existing?.price;
      const priceCheck = priceNumber(priceRaw, 'Selling price', { required: !isDraft, allowZero: isDraft });
      if (priceCheck.error) return sendError(res, 400, 'validation_error', priceCheck.error);

      const compareRaw = body.compareAtPrice !== undefined ? body.compareAtPrice : existing?.compare_at_price;
      const compareCheck = priceNumber(compareRaw, 'Compare-at price', { required: false, allowZero: false });
      if (compareCheck.error) return sendError(res, 400, 'validation_error', compareCheck.error);

      const stockRaw = body.stockQuantity !== undefined ? body.stockQuantity : existing?.stock_quantity;
      const stockCheck = nonNegativeInt(stockRaw, 'Stock quantity', 0);
      if (stockCheck.error) return sendError(res, 400, 'validation_error', stockCheck.error);

      const catId = body.categoryId !== undefined ? body.categoryId : existing?.category_id;
      const subId = body.subcategoryId !== undefined ? body.subcategoryId : existing?.subcategory_id;
      const catCheck = await validateProductCategorySelection(pool, catId, subId, { required: !isDraft });
      if (!catCheck.ok) return sendError(res, 400, 'invalid_category', catCheck.message);

      let shopLocationId = body.shopLocationId !== undefined
        ? (typeof body.shopLocationId === 'string' && body.shopLocationId.trim() ? body.shopLocationId.trim() : null)
        : (existing?.shop_location_id || null);
      if (shopLocationId) {
        const [locRows] = await pool.query(
          'SELECT id FROM business_shop_locations WHERE id = ? AND business_user_id = ? LIMIT 1',
          [shopLocationId, req.auth.userId]
        );
        if (!locRows.length) {
          return sendError(res, 400, 'invalid_location', 'Selected shop location does not belong to this business.');
        }
      }

      const conditionRaw = body.productCondition !== undefined ? body.productCondition : existing?.product_condition;
      if (conditionRaw && !VALID_CONDITIONS.has(conditionRaw)) {
        return sendError(res, 400, 'validation_error', 'Condition must be new, open_box, refurbished, or used.');
      }

      const schema = await resolveProductCategoryRule(pool, catCheck.categoryId, catCheck.subcategoryId);
      const rawAttrs = body.attributes !== undefined ? body.attributes : parseJson(existing?.attributes, {});
      const attributesResult = normalizeProductAttributes(rawAttrs, schema);
      if (attributesResult.error) return sendError(res, 400, 'validation_error', attributesResult.error);
      const cleanAttributes = attributesResult.value;
      const effectiveBrand = brandCheck.value || cleanAttributes.brand || null;
      if (effectiveBrand) cleanAttributes.brand = effectiveBrand;

      const variantsInput = normalizeVariantsInput(
        body.variants,
        priceCheck.value,
        schema
      );
      if (variantsInput.error) return sendError(res, 400, 'validation_error', variantsInput.error);
      if (variantsInput.provided && variantsInput.value.length && !schema.supportsVariants) {
        return sendError(res, 400, 'variants_not_supported', 'This product category does not support variants.');
      }
      if (conditionRaw && !schema.supportsCondition) {
        return sendError(res, 400, 'condition_not_supported', 'Condition is not available for this product category.');
      }
      if (compareCheck.value !== null && !schema.supportsCompareAtPrice) {
        return sendError(res, 400, 'compare_at_price_not_supported', 'Compare-at pricing is not available for this product category.');
      }

      const deliveryInfoCheck = body.deliveryInfo !== undefined
        ? optionalText(body.deliveryInfo, 255, 'Delivery info')
        : { value: existing?.delivery_info || null };
      if (deliveryInfoCheck.error) return sendError(res, 400, 'validation_error', deliveryInfoCheck.error);

      const returnPolicyCheck = body.returnPolicy !== undefined
        ? optionalText(body.returnPolicy, 2000, 'Return policy')
        : { value: existing?.return_policy || null };
      const warrantyCheck = body.warrantyInfo !== undefined
        ? optionalText(body.warrantyInfo, 2000, 'Warranty info')
        : { value: existing?.warranty_info || null };
      if (returnPolicyCheck.error || warrantyCheck.error) {
        return sendError(res, 400, 'validation_error', returnPolicyCheck.error || warrantyCheck.error);
      }
      if (returnPolicyCheck.value && !schema.supportsReturnPolicy) {
        return sendError(res, 400, 'return_policy_not_supported', 'Return policies are not available for this product category.');
      }
      if (warrantyCheck.value && !schema.supportsWarranty) {
        return sendError(res, 400, 'warranty_not_supported', 'Warranty details are not available for this product category.');
      }

      const existingDeliveryOpts = parseJson(existing?.delivery_options, {}) || {};
      if (body.deliveryOptions !== undefined && !isRecord(body.deliveryOptions)) {
        return sendError(res, 400, 'validation_error', 'Delivery options must be an object.');
      }
      const suppliedDeliveryOptions = isRecord(body.deliveryOptions) ? body.deliveryOptions : {};
      for (const key of ['deliveryEnabled', 'pickupEnabled']) {
        if (suppliedDeliveryOptions[key] !== undefined && typeof suppliedDeliveryOptions[key] !== 'boolean') {
          return sendError(res, 400, 'validation_error', `${key} must be true or false.`);
        }
      }
      const shippingFeeCheck = priceNumber(suppliedDeliveryOptions.shippingFee, 'Shipping fee', { allowZero: true });
      if (shippingFeeCheck.error) return sendError(res, 400, 'validation_error', shippingFeeCheck.error);
      const dispatchDaysCheck = nonNegativeInt(suppliedDeliveryOptions.estimatedDispatchDays, 'Estimated dispatch days', null);
      if (dispatchDaysCheck.error || (dispatchDaysCheck.value !== null && dispatchDaysCheck.value > 365)) {
        return sendError(res, 400, 'validation_error', dispatchDaysCheck.error || 'Estimated dispatch days must be no more than 365.');
      }
      const deliveryOptions = {
        ...existingDeliveryOpts,
        deliveryEnabled: suppliedDeliveryOptions.deliveryEnabled !== undefined
          ? suppliedDeliveryOptions.deliveryEnabled
          : (existingDeliveryOpts.deliveryEnabled !== false),
        pickupEnabled: suppliedDeliveryOptions.pickupEnabled !== undefined
          ? suppliedDeliveryOptions.pickupEnabled
          : Boolean(existingDeliveryOpts.pickupEnabled),
        shippingFee: suppliedDeliveryOptions.shippingFee !== undefined
          ? shippingFeeCheck.value
          : (existingDeliveryOpts.shippingFee ?? null),
        estimatedDispatchDays: suppliedDeliveryOptions.estimatedDispatchDays !== undefined
          ? dispatchDaysCheck.value
          : (existingDeliveryOpts.estimatedDispatchDays ?? null),
        deliveryInfo: deliveryInfoCheck.value || existingDeliveryOpts.deliveryInfo || null,
      };

      if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
        return sendError(res, 400, 'validation_error', 'Product active state must be true or false.');
      }
      const isActive = body.isActive !== undefined ? body.isActive : (existing ? Boolean(existing.is_active) : true);
      const currency = String(body.currency || existing?.currency || 'INR').trim().slice(0, 8) || 'INR';
      const productId = existing ? existing.id : randomUUID();

      if (nextStatus !== 'draft') {
        let effectiveVariants = variantsInput.value;
        if (!variantsInput.provided && existing) {
          const [existingVariants] = await pool.query(
            'SELECT attributes, is_active FROM product_variants WHERE product_id = ? AND is_active = TRUE',
            [existing.id]
          );
          effectiveVariants = existingVariants.map((variant) => ({
            attributes: parseJson(variant.attributes, {}) || {},
            isActive: Boolean(variant.is_active),
          }));
        }
        const missingAttributes = missingRequiredProductAttributes(schema, cleanAttributes, effectiveVariants);
        if (missingAttributes.length) {
          return sendError(
            res,
            400,
            'required_attributes_missing',
            `Complete the required category attributes: ${missingAttributes.join(', ')}.`
          );
        }
      }

      await withTransaction(pool, async (connection) => {
        const stockStatus = computeStockStatus(stockCheck.value);
        if (isCreate) {
          await connection.query(
            `INSERT INTO products (
               id, seller_user_id, seller_role, category_id, subcategory_id, shop_location_id,
               name, sku, short_description, description, brand, price, compare_at_price,
               currency, product_condition, stock_quantity, stock_status, variants, images,
               delivery_info, delivery_options, return_policy, warranty_info, attributes,
               is_active, status
             ) VALUES (?, ?, 'business', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              productId,
              req.auth.userId,
              catCheck.categoryId,
              catCheck.subcategoryId,
              shopLocationId,
              nameCheck.value,
              skuCheck.value,
              shortDescCheck.value,
              descCheck.value || '',
              effectiveBrand,
              priceCheck.value ?? 0,
              compareCheck.value,
              currency,
              conditionRaw || null,
              stockCheck.value,
              stockStatus,
              JSON.stringify(isRecord(body.variants) ? body.variants : {}),
              JSON.stringify([]),
              deliveryInfoCheck.value,
              JSON.stringify(deliveryOptions),
              returnPolicyCheck.value,
              warrantyCheck.value,
              JSON.stringify(cleanAttributes),
              isActive ? 1 : 0,
              nextStatus,
            ]
          );
        } else {
          await connection.query(
            `UPDATE products
                SET category_id = ?, subcategory_id = ?, shop_location_id = ?,
                    name = ?, sku = ?, short_description = ?, description = ?, brand = ?,
                    price = ?, compare_at_price = ?, currency = ?, product_condition = ?,
                    stock_quantity = ?, stock_status = ?, delivery_info = ?, delivery_options = ?,
                    return_policy = ?, warranty_info = ?, attributes = ?, is_active = ?,
                    status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND seller_user_id = ?`,
            [
              catCheck.categoryId,
              catCheck.subcategoryId,
              shopLocationId,
              nameCheck.value,
              skuCheck.value,
              shortDescCheck.value,
              descCheck.value || '',
              effectiveBrand,
              priceCheck.value ?? 0,
              compareCheck.value,
              currency,
              conditionRaw || null,
              stockCheck.value,
              stockStatus,
              deliveryInfoCheck.value,
              JSON.stringify(deliveryOptions),
              returnPolicyCheck.value,
              warrantyCheck.value,
              JSON.stringify(cleanAttributes),
              isActive ? 1 : 0,
              nextStatus,
              productId,
              req.auth.userId,
            ]
          );
        }

        if (variantsInput.provided) {
          const [existingVariants] = await connection.query(
            'SELECT id, stock_quantity, version FROM product_variants WHERE product_id = ? FOR UPDATE',
            [productId]
          );
          const existingVariantMap = new Map(existingVariants.map((variant) => [variant.id, variant]));
          for (const variant of variantsInput.value) {
            const previous = variant.id ? existingVariantMap.get(variant.id) : null;
            if (variant.id && !previous) {
              const err = new Error('A selected variant does not belong to this product.');
              err.status = 400;
              err.code = 'invalid_variant';
              throw err;
            }
            if (previous && variant.stockQuantity !== Number(previous.stock_quantity)) {
              if (variant.version === null || variant.version !== Number(previous.version || 0)) {
                const err = new Error('Inventory changed since this product was loaded. Reload it before saving stock.');
                err.status = 409;
                err.code = 'stock_version_conflict';
                throw err;
              }
            }
            const previousQuantity = Number(previous?.stock_quantity || 0);
            if (existing && previousQuantity !== variant.stockQuantity) {
              await connection.query(
                `INSERT INTO inventory_adjustments
                   (id, product_id, variant_id, adjusted_by_user_id, previous_quantity, new_quantity, delta, reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  randomUUID(),
                  productId,
                  previous?.id || null,
                  req.auth.userId,
                  previousQuantity,
                  variant.stockQuantity,
                  variant.stockQuantity - previousQuantity,
                  'Product edit',
                ]
              );
            }
          }
          const hasActiveVariants = variantsInput.value.some((variant) => variant.isActive);
          if (existing && !hasActiveVariants && Number(existing.stock_quantity) !== stockCheck.value) {
            await connection.query(
              `INSERT INTO inventory_adjustments
                 (id, product_id, variant_id, adjusted_by_user_id, previous_quantity, new_quantity, delta, reason)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
              [
                randomUUID(),
                productId,
                req.auth.userId,
                Number(existing.stock_quantity || 0),
                stockCheck.value,
                stockCheck.value - Number(existing.stock_quantity || 0),
                'Product edit',
              ]
            );
          }
          await syncProductVariantsInTx(connection, productId, variantsInput.value, stockCheck.value);
        } else if (!isCreate) {
          const [activeVariants] = await connection.query(
            'SELECT id FROM product_variants WHERE product_id = ? AND is_active = TRUE',
            [productId]
          );
          if (!activeVariants.length && Number(existing.stock_quantity) !== stockCheck.value) {
            await connection.query(
              `INSERT INTO inventory_adjustments
                 (id, product_id, variant_id, adjusted_by_user_id, previous_quantity, new_quantity, delta, reason)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
              [
                randomUUID(),
                productId,
                req.auth.userId,
                Number(existing.stock_quantity || 0),
                stockCheck.value,
                stockCheck.value - Number(existing.stock_quantity || 0),
                'Product edit',
              ]
            );
          }
          await recalculateProductStockFromVariantsTx(connection, productId);
        }

        const mediaPayload = body.media !== undefined ? body.media : body.mediaAssetIds;
        const mediaResult = await resolveAndAttachProductMedia(connection, productId, req.auth.userId, mediaPayload);
        if (!mediaResult.ok) {
          const err = new Error(mediaResult.message);
          err.status = mediaResult.status;
          err.code = mediaResult.code;
          throw err;
        }
        if (nextStatus !== 'draft') {
          const [imageRows] = await connection.query(
            `SELECT id FROM listing_media
              WHERE listing_id = ? AND listing_type = 'product' AND media_role = 'image'
              LIMIT 1`,
            [productId]
          );
          if (!imageRows.length) {
            const err = new Error('Add at least one product image before submission.');
            err.status = 400;
            err.code = 'product_image_required';
            throw err;
          }
        }

        const bizProfileObj = parseJson(check.profile?.profile, {}) || {};
        await syncMarketplaceListing(connection, {
          id: productId,
          type: 'product',
          ownerId: req.auth.userId,
          ownerRole: 'business',
          categoryId: catCheck.categoryId,
          subcategoryId: catCheck.subcategoryId,
          title: nameCheck.value,
          shortSummary: shortDescCheck.value || (descCheck.value ? descCheck.value.slice(0, 240) : null),
          description: descCheck.value || '',
          location: bizProfileObj.city ? { city: bizProfileObj.city, state: bizProfileObj.state || undefined } : null,
          visibility: isActive ? 'public' : 'private',
          status: nextStatus,
        });

        if (isCreate || nextStatus !== existing.status) {
          await recordStatusHistory(connection, {
            listingId: productId,
            listingType: 'product',
            fromStatus: existing ? existing.status : null,
            toStatus: nextStatus,
            userId: req.auth.userId,
            role: 'business',
          });
        }
      });

      const [savedRows] = await pool.query(
        `SELECT ${PRODUCT_SELECT_COLUMNS}
           ${PRODUCT_FROM_JOIN}
          WHERE p.id = ? LIMIT 1`,
        [productId]
      );
      const [hydrated] = await hydrateProducts(pool, config, savedRows);
      return res.status(isCreate ? 201 : 200).json({ product: hydrated });
    } catch (error) {
      if (error.status && error.code) {
        return sendError(res, error.status, error.code, error.message);
      }
      return next(error);
    }
  }

  router.post('/marketplace/products', authenticate, (req, res, next) =>
    saveOrUpdateProduct(req, res, next, { isCreate: true })
  );
  router.put('/marketplace/products/:id', authenticate, (req, res, next) =>
    saveOrUpdateProduct(req, res, next, { isCreate: false })
  );
  router.patch('/marketplace/products/:id', authenticate, (req, res, next) =>
    saveOrUpdateProduct(req, res, next, { isCreate: false })
  );

  router.post('/marketplace/products/:id/transition', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const action = String(req.body?.action || '').trim();
      const targetMap = {
        save_draft: 'draft',
        submit: 'pending_review',
        publish: 'published',
        resume: 'published',
        pause: 'paused',
        archive: 'archived',
        restore: 'draft',
      };
      const targetStatus = targetMap[action];
      if (!targetStatus) {
        return sendError(res, 400, 'invalid_action', 'Use save_draft, submit, publish, pause, resume, archive, or restore.');
      }

      const [rows] = await pool.query(
        `SELECT p.*, ml.moderation_status
           FROM products p
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'product'
          WHERE p.id = ? AND p.seller_user_id = ? AND p.status != 'deleted'
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'listing_not_found', 'Product was not found.');
      const existing = rows[0];

      if (targetStatus === 'published' || targetStatus === 'pending_review') {
        if (!check.profile) {
          return sendError(res, 409, 'business_profile_required', 'Complete a business profile before submitting products.');
        }
        if (!existing.name || !existing.description || !existing.category_id || Number(existing.price) <= 0) {
          return sendError(
            res,
            400,
            'validation_error',
            'Product name, description, category, and a positive selling price are required before submission.'
          );
        }
        const categoryCheck = await validateProductCategorySelection(
          pool,
          existing.category_id,
          existing.subcategory_id
        );
        if (!categoryCheck.ok) return sendError(res, 400, 'invalid_category', categoryCheck.message);
        const schema = await resolveProductCategoryRule(pool, existing.category_id, existing.subcategory_id);
        const attrsResult = normalizeProductAttributes(parseJson(existing.attributes, {}), schema);
        if (attrsResult.error) return sendError(res, 400, 'validation_error', attrsResult.error);
        const [variantRows] = await pool.query(
          'SELECT attributes, is_active FROM product_variants WHERE product_id = ? AND is_active = TRUE',
          [existing.id]
        );
        const variants = variantRows.map((variant) => ({
          attributes: parseJson(variant.attributes, {}) || {},
          isActive: Boolean(variant.is_active),
        }));
        const missingAttributes = missingRequiredProductAttributes(schema, attrsResult.value, variants);
        if (missingAttributes.length) {
          return sendError(
            res,
            400,
            'required_attributes_missing',
            `Complete the required category attributes: ${missingAttributes.join(', ')}.`
          );
        }
        const [imageRows] = await pool.query(
          `SELECT id FROM listing_media
            WHERE listing_id = ? AND listing_type = 'product' AND media_role = 'image'
            LIMIT 1`,
          [existing.id]
        );
        if (!imageRows.length) {
          return sendError(res, 400, 'product_image_required', 'Add at least one product image before submission.');
        }
      }

      const policy = await getModerationPolicy(pool, config);
      const effectiveTarget = targetStatus === 'published' && requiresReviewForType(policy, 'product') && existing.moderation_status !== 'approved'
        ? 'pending_review'
        : targetStatus;

      const transition = validateOwnerTransition({
        fromStatus: existing.status,
        toStatus: effectiveTarget,
        moderationPolicy: policy,
        listingType: 'product',
        moderationStatus: existing.moderation_status,
      });
      if (!transition.ok) return sendError(res, transition.status, transition.code, transition.message);

      await withTransaction(pool, async (connection) => {
        await connection.query(
          `UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND seller_user_id = ?`,
          [transition.toStatus, existing.id, req.auth.userId]
        );
        await syncMarketplaceListingStatus(connection, 'product', existing.id, transition.toStatus);
        await recordStatusHistory(connection, {
          listingId: existing.id,
          listingType: 'product',
          fromStatus: existing.status,
          toStatus: transition.toStatus,
          userId: req.auth.userId,
          role: 'business',
          reason: typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 240) : null,
        });
      });

      const [updatedRows] = await pool.query(
        `SELECT ${PRODUCT_SELECT_COLUMNS}
           ${PRODUCT_FROM_JOIN}
          WHERE p.id = ? LIMIT 1`,
        [existing.id]
      );
      const [hydrated] = await hydrateProducts(pool, config, updatedRows);
      return res.json({ product: hydrated });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Variants & Concurrency-Safe Transactional Inventory ----
  router.post('/marketplace/products/:id/variants', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const [prodRows] = await pool.query(
        `SELECT id, category_id, subcategory_id, price FROM products
          WHERE id = ? AND seller_user_id = ? AND status != 'deleted' LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!prodRows.length) return sendError(res, 404, 'listing_not_found', 'Product was not found.');

      const schema = await resolveProductCategoryRule(pool, prodRows[0].category_id, prodRows[0].subcategory_id);
      if (!schema.supportsVariants) {
        return sendError(res, 400, 'variants_not_supported', 'Variants are not enabled for this category.');
      }

      const norm = normalizeVariantsInput(
        [req.body || {}],
        Number(prodRows[0].price || 0),
        schema
      );
      if (norm.error) return sendError(res, 400, 'validation_error', norm.error);
      const v = norm.value[0];
      const variantId = randomUUID();
      const variantName = variantLabelFromAttrs(v.attributes, v.sku);

      await withTransaction(pool, async (connection) => {
        await connection.query(
          `INSERT INTO product_variants (
             id, product_id, sku, name, attributes, price, compare_at_price, stock_quantity, is_active, version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            variantId,
            prodRows[0].id,
            v.sku,
            variantName,
            JSON.stringify(v.attributes || {}),
            v.price,
            v.compareAtPrice,
            v.stockQuantity,
            v.isActive ? 1 : 0,
          ]
        );
        await recalculateProductStockFromVariantsTx(connection, prodRows[0].id);
      });

      const [rows] = await pool.query(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC',
        [prodRows[0].id]
      );
      return res.status(201).json({
        variantId,
        variants: rows.map((row) => ({
          id: row.id,
          productId: row.product_id,
          sku: row.sku || null,
          attributes: parseJson(row.attributes, {}),
          price: row.price === null || row.price === undefined ? null : Number(row.price),
          compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price),
          stockQuantity: Number(row.stock_quantity || 0),
          stockStatus: computeStockStatus(row.stock_quantity),
          isActive: Boolean(row.is_active),
          version: Number(row.version || 0),
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/marketplace/products/:id/variants/:variantId', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const [prodRows] = await pool.query(
        `SELECT id, price FROM products WHERE id = ? AND seller_user_id = ? AND status != 'deleted' LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!prodRows.length) return sendError(res, 404, 'listing_not_found', 'Product was not found.');

      const result = await withTransaction(pool, async (connection) => {
        const [vRows] = await connection.query(
          'SELECT * FROM product_variants WHERE id = ? AND product_id = ? LIMIT 1 FOR UPDATE',
          [req.params.variantId, prodRows[0].id]
        );
        if (!vRows.length) return { error: { status: 404, code: 'variant_not_found', message: 'Variant was not found.' } };
        const existingV = vRows[0];
        const body = req.body || {};

        const skuCheck = body.sku !== undefined ? optionalText(body.sku, 100, 'Variant SKU') : { value: existingV.sku };
        if (skuCheck.error) return { error: { status: 400, code: 'validation_error', message: skuCheck.error } };

        const priceCheck = body.price !== undefined
          ? priceNumber(body.price, 'Variant price', { required: false, allowZero: true })
          : { value: existingV.price === null ? null : Number(existingV.price) };
        if (priceCheck.error) return { error: { status: 400, code: 'validation_error', message: priceCheck.error } };

        const compareCheck = body.compareAtPrice !== undefined
          ? priceNumber(body.compareAtPrice, 'Variant compare-at price', { required: false, allowZero: false })
          : { value: existingV.compare_at_price === null ? null : Number(existingV.compare_at_price) };
        if (compareCheck.error) return { error: { status: 400, code: 'validation_error', message: compareCheck.error } };

        const stockCheck = body.stockQuantity !== undefined
          ? nonNegativeInt(body.stockQuantity, 'Variant stock')
          : { value: Number(existingV.stock_quantity || 0) };
        if (stockCheck.error) return { error: { status: 400, code: 'validation_error', message: stockCheck.error } };

        const nextAttrs = isRecord(body.attributes) ? body.attributes : parseJson(existingV.attributes, {});
        const nextActive = body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existingV.is_active);
        const prevQty = Number(existingV.stock_quantity || 0);
        const nextVariantName = variantLabelFromAttrs(nextAttrs, skuCheck.value);

        await connection.query(
          `UPDATE product_variants
              SET sku = ?, name = ?, attributes = ?, price = ?, compare_at_price = ?,
                  stock_quantity = ?, is_active = ?, version = version + 1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND product_id = ?`,
          [
            skuCheck.value,
            nextVariantName,
            JSON.stringify(nextAttrs),
            priceCheck.value,
            compareCheck.value,
            stockCheck.value,
            nextActive ? 1 : 0,
            existingV.id,
            prodRows[0].id,
          ]
        );

        if (stockCheck.value !== prevQty) {
          await connection.query(
            `INSERT INTO inventory_adjustments (
               id, product_id, variant_id, adjusted_by_user_id, previous_quantity, new_quantity, delta, reason
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              prodRows[0].id,
              existingV.id,
              req.auth.userId,
              prevQty,
              stockCheck.value,
              stockCheck.value - prevQty,
              typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 120) : 'Variant stock updated',
            ]
          );
        }

        const stockSummary = await recalculateProductStockFromVariantsTx(connection, prodRows[0].id);
        return { ok: true, stockSummary };
      });

      if (result.error) {
        return sendError(res, result.error.status, result.error.code, result.error.message);
      }

      const [rows] = await pool.query(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC',
        [prodRows[0].id]
      );
      return res.json({
        stockSummary: result.stockSummary,
        variants: rows.map((row) => ({
          id: row.id,
          productId: row.product_id,
          sku: row.sku || null,
          attributes: parseJson(row.attributes, {}),
          price: row.price === null || row.price === undefined ? null : Number(row.price),
          compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price),
          stockQuantity: Number(row.stock_quantity || 0),
          stockStatus: computeStockStatus(row.stock_quantity),
          isActive: Boolean(row.is_active),
          version: Number(row.version || 0),
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/marketplace/products/:id/variants/:variantId', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const [prodRows] = await pool.query(
        `SELECT id FROM products WHERE id = ? AND seller_user_id = ? AND status != 'deleted' LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!prodRows.length) return sendError(res, 404, 'listing_not_found', 'Product was not found.');

      const result = await withTransaction(pool, async (connection) => {
        const [del] = await connection.query(
          'DELETE FROM product_variants WHERE id = ? AND product_id = ?',
          [req.params.variantId, prodRows[0].id]
        );
        if (!del.affectedRows) return { notFound: true };
        const stockSummary = await recalculateProductStockFromVariantsTx(connection, prodRows[0].id);
        return { stockSummary };
      });
      if (result.notFound) return sendError(res, 404, 'variant_not_found', 'Variant was not found.');
      return res.json({ deleted: true, stockSummary: result.stockSummary });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/marketplace/products/:id/inventory', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const body = req.body || {};
      const mode = body.mode === 'delta' ? 'delta' : 'set';
      const variantId = typeof body.variantId === 'string' && body.variantId.trim() ? body.variantId.trim() : null;
      const reason = typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 120)
        : 'Manual stock adjustment';

      const txResult = await withTransaction(pool, async (connection) => {
        const [prodRows] = await connection.query(
          `SELECT id, seller_user_id, stock_quantity
             FROM products
            WHERE id = ? AND seller_user_id = ? AND status != 'deleted'
            LIMIT 1 FOR UPDATE`,
          [req.params.id, req.auth.userId]
        );
        if (!prodRows.length) {
          return { error: { status: 404, code: 'listing_not_found', message: 'Product was not found.' } };
        }

        let previousQuantity = Number(prodRows[0].stock_quantity || 0);
        if (variantId) {
          const [vRows] = await connection.query(
            `SELECT id, stock_quantity, version FROM product_variants
              WHERE id = ? AND product_id = ? LIMIT 1 FOR UPDATE`,
            [variantId, prodRows[0].id]
          );
          if (!vRows.length) {
            return { error: { status: 404, code: 'variant_not_found', message: 'Product variant was not found.' } };
          }
          if (body.expectedVersion !== undefined && Number(body.expectedVersion) !== Number(vRows[0].version)) {
            return {
              error: {
                status: 409,
                code: 'concurrent_modification',
                message: 'Stock was modified concurrently. Refresh and try again.',
              },
            };
          }
          previousQuantity = Number(vRows[0].stock_quantity || 0);
        } else {
          const [activeVariants] = await connection.query(
            'SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ? AND is_active = TRUE',
            [prodRows[0].id]
          );
          if (Number(activeVariants[0]?.count || 0) > 0) {
            return {
              error: {
                status: 400,
                code: 'variant_required',
                message: 'This product uses active variants. Specify variantId when adjusting stock.',
              },
            };
          }
        }

        const nextQty = mode === 'delta'
          ? previousQuantity + Number(body.delta)
          : Number(body.newQuantity);
        if (!Number.isInteger(nextQty) || nextQty < 0 || nextQty > 10000000) {
          return {
            error: {
              status: 400,
              code: 'negative_stock_forbidden',
              message: 'Stock quantity cannot be negative.',
            },
          };
        }

        if (variantId) {
          await connection.query(
            `UPDATE product_variants
                SET stock_quantity = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND product_id = ?`,
            [nextQty, variantId, prodRows[0].id]
          );
          await recalculateProductStockFromVariantsTx(connection, prodRows[0].id);
        } else {
          await connection.query(
            `UPDATE products
                SET stock_quantity = ?, stock_status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND seller_user_id = ?`,
            [nextQty, computeStockStatus(nextQty), prodRows[0].id, req.auth.userId]
          );
        }

        const adjustmentId = randomUUID();
        await connection.query(
          `INSERT INTO inventory_adjustments (
             id, product_id, variant_id, adjusted_by_user_id, previous_quantity, new_quantity, delta, reason
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adjustmentId,
            prodRows[0].id,
            variantId,
            req.auth.userId,
            previousQuantity,
            nextQty,
            nextQty - previousQuantity,
            reason,
          ]
        );

        const [updatedProd] = await connection.query(
          'SELECT stock_quantity, stock_status FROM products WHERE id = ? LIMIT 1',
          [prodRows[0].id]
        );
        return {
          ok: true,
          adjustment: {
            id: adjustmentId,
            productId: prodRows[0].id,
            variantId,
            previousQuantity,
            newQuantity: nextQty,
            delta: nextQty - previousQuantity,
            reason,
          },
          productStockQuantity: Number(updatedProd[0]?.stock_quantity || 0),
          productStockStatus: updatedProd[0]?.stock_status || computeStockStatus(nextQty),
        };
      });

      if (txResult.error) {
        return sendError(res, txResult.error.status, txResult.error.code, txResult.error.message);
      }
      return res.json(txResult);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/products/:id/inventory', authenticate, async (req, res, next) => {
    try {
      const check = await ensureBusinessAccount(pool, req.auth.userId);
      if (!check.ok) return sendError(res, check.status, check.code, check.message);

      const [prodRows] = await pool.query(
        `SELECT id, name, stock_quantity, stock_status
           FROM products WHERE id = ? AND seller_user_id = ? AND status != 'deleted' LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!prodRows.length) return sendError(res, 404, 'listing_not_found', 'Product was not found.');

      const [variants] = await pool.query(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC',
        [req.params.id]
      );
      const [history] = await pool.query(
        `SELECT * FROM inventory_adjustments WHERE product_id = ? ORDER BY created_at DESC LIMIT 50`,
        [req.params.id]
      );

      return res.json({
        productId: prodRows[0].id,
        name: prodRows[0].name,
        stockQuantity: Number(prodRows[0].stock_quantity || 0),
        stockStatus: prodRows[0].stock_status || computeStockStatus(prodRows[0].stock_quantity),
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku || null,
          attributes: parseJson(v.attributes, {}),
          stockQuantity: Number(v.stock_quantity || 0),
          version: Number(v.version || 0),
          isActive: Boolean(v.is_active),
        })),
        history: history.map((h) => ({
          id: h.id,
          variantId: h.variant_id || null,
          previousQuantity: Number(h.previous_quantity),
          newQuantity: Number(h.new_quantity),
          delta: Number(h.delta),
          reason: h.reason,
          createdAt: h.created_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Customer Public Product Discovery & Detail ----
  router.get('/marketplace/products', async (req, res, next) => {
    try {
      const {
        q,
        categoryId,
        subcategoryId,
        brand,
        size,
        color,
        condition,
        inStock,
        minPrice,
        maxPrice,
        city,
        sellerId,
        sort = 'newest',
        limit = '20',
        page = '1',
      } = req.query;

      const cleanCategoryId = typeof categoryId === 'string' && categoryId.trim()
        ? categoryId.trim()
        : '';
      const cleanSubcategoryId = typeof subcategoryId === 'string' && subcategoryId.trim()
        ? subcategoryId.trim()
        : '';
      const categorySchema = cleanCategoryId
        ? await resolveProductCategoryRule(pool, cleanCategoryId, cleanSubcategoryId || null)
        : null;
      let attributeFilters = {};
      if (req.query.attributeFilters !== undefined && req.query.attributeFilters !== '') {
        const rawFilters = req.query.attributeFilters;
        if (typeof rawFilters === 'string') {
          try {
            attributeFilters = JSON.parse(rawFilters);
          } catch {
            return sendError(res, 400, 'invalid_attribute_filters', 'Attribute filters must be valid JSON.');
          }
        } else {
          attributeFilters = rawFilters;
        }
        if (!isRecord(attributeFilters) || Object.keys(attributeFilters).length > 8) {
          return sendError(res, 400, 'invalid_attribute_filters', 'Provide up to eight category attribute filters.');
        }
        if (Object.keys(attributeFilters).length && !categorySchema) {
          return sendError(res, 400, 'category_required', 'Select a category before filtering by its attributes.');
        }
        const filterableKeys = new Set(categorySchema?.filterableAttributeKeys || []);
        for (const [key, value] of Object.entries(attributeFilters)) {
          if (!/^[a-zA-Z0-9_]{1,64}$/.test(key) || !filterableKeys.has(key)) {
            return sendError(res, 400, 'attribute_not_filterable', `${key} is not a filterable attribute for this category.`);
          }
          if (!['string', 'number'].includes(typeof value) || !String(value).trim()) {
            return sendError(res, 400, 'invalid_attribute_filters', `Provide a text or number value for ${key}.`);
          }
          const definition = (categorySchema.attributes || []).find((attribute) => attribute.key === key);
          if (definition?.type === 'select' && Array.isArray(definition.options) && !definition.options.includes(String(value))) {
            return sendError(res, 400, 'invalid_attribute_filters', `Select a valid ${String(definition.label || key).toLowerCase()} filter.`);
          }
        }
      }

      const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
      const pageNum = Math.max(1, Number(page) || 1);
      const offset = (pageNum - 1) * limitNum;

      const params = [];
      const productAttributeFilters = [];
      const variantAttributeFilters = [];
      let where = `WHERE p.status = 'published'
        AND p.is_active = TRUE
        AND EXISTS (
          SELECT 1 FROM marketplace_listings ml
           WHERE ml.id = p.id AND ml.listing_type = 'product'
             AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
        )
        AND (
          bp.user_id IS NULL
          OR (
            (
              bp.listing_id IS NULL
              OR (
                bml.status = 'published'
                AND bml.is_public = TRUE
                AND bml.visibility = 'public'
              )
            )
            AND (
              JSON_EXTRACT(bp.shop_settings, '$.publicVisibility') IS NULL
              OR JSON_EXTRACT(bp.shop_settings, '$.publicVisibility') != false
            )
          )
        )`;

      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ` AND (p.name LIKE ? OR p.short_description LIKE ? OR p.description LIKE ? OR p.brand LIKE ? OR p.sku LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.companyName')) LIKE ?)`;
        params.push(like, like, like, like, like, like);
      }
      if (categoryId) {
        where += ` AND p.category_id = ?`;
        params.push(cleanCategoryId);
      }
      if (subcategoryId) {
        where += ` AND p.subcategory_id = ?`;
        params.push(cleanSubcategoryId);
      }
      if (sellerId) {
        where += ` AND p.seller_user_id = ?`;
        params.push(String(sellerId).trim());
      }
      if (brand && String(brand).trim()) {
        where += ` AND LOWER(COALESCE(p.brand, JSON_UNQUOTE(JSON_EXTRACT(p.attributes, '$.brand')), '')) = ?`;
        params.push(String(brand).trim().toLowerCase());
      }
      if (condition && VALID_CONDITIONS.has(String(condition).trim())) {
        where += ` AND p.product_condition = ?`;
        params.push(String(condition).trim());
      }
      if (String(inStock) === 'true' || String(inStock) === '1') {
        where += ` AND p.stock_quantity > 0 AND p.stock_status != 'out_of_stock'`;
      }
      if (minPrice !== undefined && minPrice !== '' && Number.isFinite(Number(minPrice))) {
        where += ` AND p.price >= ?`;
        params.push(Number(minPrice));
      }
      if (maxPrice !== undefined && maxPrice !== '' && Number.isFinite(Number(maxPrice))) {
        where += ` AND p.price <= ?`;
        params.push(Number(maxPrice));
      }
      if (city && String(city).trim()) {
        const cityLike = `%${String(city).trim()}%`;
        where += ` AND (bsl.city LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.city')) LIKE ?)`;
        params.push(cityLike, cityLike);
      }
      for (const [key, value] of [['size', size], ['color', color]]) {
        if (!value || !String(value).trim()) continue;
        const filter = { key, value: String(value).trim().toLowerCase() };
        if (categorySchema?.variantAttributeKeys?.includes(key)) variantAttributeFilters.push(filter);
        else productAttributeFilters.push(filter);
      }
      for (const [key, value] of Object.entries(attributeFilters)) {
        const filter = { key, value: String(value).trim().toLowerCase() };
        if (categorySchema?.variantAttributeKeys?.includes(key)) variantAttributeFilters.push(filter);
        else productAttributeFilters.push(filter);
      }
      if (productAttributeFilters.length) {
        where += ` AND ${productAttributeFilters.map(() =>
          `LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.attributes, ?)), '')) = ?`
        ).join(' AND ')}`;
        for (const filter of productAttributeFilters) {
          params.push(`$.${filter.key}`, filter.value);
        }
      }
      if (variantAttributeFilters.length) {
        where += ` AND EXISTS (
          SELECT 1 FROM product_variants pv
           WHERE pv.product_id = p.id AND pv.is_active = TRUE
             AND ${variantAttributeFilters.map(() =>
               `LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pv.attributes, ?)), '')) = ?`
             ).join(' AND ')}
        )`;
        for (const filter of variantAttributeFilters) {
          params.push(`$.${filter.key}`, filter.value);
        }
      }

      const orderBy = sort === 'price_asc'
        ? 'p.price ASC, p.created_at DESC'
        : sort === 'price_desc'
          ? 'p.price DESC, p.created_at DESC'
          : sort === 'discount'
            ? '(CASE WHEN p.compare_at_price > p.price THEN (p.compare_at_price - p.price) / p.compare_at_price ELSE 0 END) DESC, p.created_at DESC'
            : 'p.created_at DESC';

      const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${PRODUCT_FROM_JOIN} ${where}`, params);
      const total = Number(countRows[0]?.total || 0);

      const [rows] = await pool.query(
        `SELECT ${PRODUCT_SELECT_COLUMNS}
           ${PRODUCT_FROM_JOIN}
           ${where}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );

      const items = await hydrateProducts(pool, config, rows, { publicOnlyVariants: true });

      // Compute dynamic facets for selected category (or published catalogue)
      const [facetRows] = await pool.query(
        `SELECT p.id, p.brand, p.product_condition, p.attributes
           FROM products p
           LEFT JOIN business_profiles bp ON bp.user_id = p.seller_user_id
           LEFT JOIN marketplace_listings bml
             ON bml.id = bp.listing_id AND bml.listing_type = 'business_profile'
          WHERE p.status = 'published' AND p.is_active = TRUE
            AND EXISTS (
              SELECT 1 FROM marketplace_listings ml
               WHERE ml.id = p.id AND ml.listing_type = 'product'
                 AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
            )
            AND (
              bp.user_id IS NULL
              OR (
                (
                  bp.listing_id IS NULL
                  OR (
                    bml.status = 'published' AND bml.is_public = TRUE AND bml.visibility = 'public'
                  )
                )
                AND (
                  JSON_EXTRACT(bp.shop_settings, '$.publicVisibility') IS NULL
                  OR JSON_EXTRACT(bp.shop_settings, '$.publicVisibility') != false
                )
              )
            )
            ${cleanCategoryId ? 'AND p.category_id = ?' : ''}
            ${cleanSubcategoryId ? 'AND p.subcategory_id = ?' : ''}
          LIMIT 200`,
        [
          ...(cleanCategoryId ? [cleanCategoryId] : []),
          ...(cleanSubcategoryId ? [cleanSubcategoryId] : []),
        ]
      );
      const facetProductIds = facetRows.map((row) => row.id).filter(Boolean);
      const [variantFacetRows] = facetProductIds.length
        ? await pool.query(
            `SELECT product_id, attributes FROM product_variants
              WHERE product_id IN (${facetProductIds.map(() => '?').join(',')})
                AND is_active = TRUE`,
            facetProductIds
          )
        : [[]];
      const brands = new Set();
      const conditions = new Set();
      const attributeValues = new Map(
        (categorySchema?.filterableAttributeKeys || []).map((key) => [key, new Set()])
      );
      for (const fr of facetRows) {
        if (fr.brand) brands.add(fr.brand);
        if (fr.product_condition) conditions.add(fr.product_condition);
        const attrs = parseJson(fr.attributes, {});
        if (fr.brand && attributeValues.has('brand')) attributeValues.get('brand').add(String(fr.brand));
        for (const [key, value] of Object.entries(attrs)) {
          if (attributeValues.has(key) && ['string', 'number'].includes(typeof value) && String(value).trim()) {
            attributeValues.get(key).add(String(value));
          }
        }
      }
      for (const variant of variantFacetRows) {
        const attrs = parseJson(variant.attributes, {});
        for (const [key, value] of Object.entries(attrs)) {
          if (attributeValues.has(key) && ['string', 'number'].includes(typeof value) && String(value).trim()) {
            attributeValues.get(key).add(String(value));
          }
        }
      }

      const attributeFacets = Array.from(attributeValues.entries()).map(([key, values]) => ({
        key,
        label: (categorySchema?.attributes || []).find((attribute) => attribute.key === key)?.label || key,
        values: Array.from(values).sort(),
      }));

      return res.json({
        products: items,
        items,
        facets: {
          brands: Array.from(brands).sort(),
          sizes: attributeValues.has('size') ? Array.from(attributeValues.get('size')) : [],
          colors: attributeValues.has('color') ? Array.from(attributeValues.get('color')) : [],
          conditions: Array.from(conditions),
          filterableKeys: categorySchema?.filterableAttributeKeys || ['brand'],
          attributes: attributeFacets,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(1, Math.ceil(total / limitNum)),
          hasMore: offset + items.length < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/products/:id', async (req, res, next) => {
    try {
      const viewerId = await resolveOptionalUserId(req, authenticate);
      const [rows] = await pool.query(
        `SELECT ${PRODUCT_SELECT_COLUMNS},
                ml.status AS listing_status, ml.is_public AS listing_is_public, ml.visibility AS listing_visibility
           ${PRODUCT_FROM_JOIN}
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'product'
          WHERE p.id = ? AND p.status != 'deleted'
          LIMIT 1`,
        [req.params.id]
      );
      if (!rows.length) {
        return sendError(res, 404, 'product_not_found', 'Product was not found.');
      }

      const row = rows[0];
      const shopSettings = parseJson(row.shop_settings, {}) || {};
      const isPublicProduct =
        row.status === 'published' &&
        Boolean(row.is_active) &&
        row.listing_status === 'published' &&
        Boolean(row.listing_is_public) &&
        row.listing_visibility === 'public' &&
        (!row.business_profile_user_id || !row.business_listing_id || (
          row.business_listing_status === 'published' &&
          Boolean(row.business_listing_is_public) &&
          row.business_listing_visibility === 'public'
        )) &&
        isObjectPublic(shopSettings);

      if (!isPublicProduct && (!viewerId || viewerId !== row.seller_user_id)) {
        return sendError(res, 404, 'product_not_found', 'Product was not found.');
      }

      const [hydrated] = await hydrateProducts(pool, config, rows, {
        publicOnlyVariants: isPublicProduct,
      });
      const schema = await resolveProductCategoryRule(pool, row.category_id, row.subcategory_id);

      return res.json({
        product: hydrated,
        schema,
        shopLocation: row.shop_location_id
          ? {
              id: row.shop_location_id,
              label: row.loc_label || null,
              address: row.loc_address || null,
              city: row.loc_city || null,
              state: row.loc_state || null,
              operatingHours: row.loc_hours || null,
              pickupEnabled: Boolean(row.loc_pickup_enabled),
              deliveryEnabled: Boolean(row.loc_delivery_enabled),
            }
          : null,
        futureCapabilities: {
          cart: false,
          checkout: false,
          orders: false,
          shippingTracking: false,
          payments: false,
          note: 'Online cart, checkout, payment, and order tracking will arrive in a future commerce phase. Contact or enquire directly with the shop.',
        },
      });
    } catch (error) {
      return next(error);
    }
  });
}
