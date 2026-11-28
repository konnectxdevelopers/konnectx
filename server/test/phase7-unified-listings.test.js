import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { getModerationPolicy } from '../src/listing-engine.js';

const SVC_CAT_ID = '00000000-0000-4000-8000-000000000001';
const SVC_SUB_ID = '10000000-0000-4000-8000-000000000001';
const PROD_CAT_ID = '22000000-0000-4000-8000-000000000001';
const PROD_SUB_ID = '28000000-0000-4000-8000-000000000018';
const JOB_CAT_ID = '24000000-0000-4000-8000-000000000001';
const PROJ_CAT_ID = '25000000-0000-4000-8000-000000000001';

function makeConfig(overrides = {}) {
  return {
    jwtSecret: 'test-secret-key-for-phase7-unified-listings',
    jwtIssuer: 'konnectx-test',
    jwtAudience: 'konnectx-app',
    corsOrigins: [],
    uploadUrlTtlSeconds: 300,
    maxUploadBytes: 25000000,
    moderation: { requireReviewTypes: [] },
    email: { provider: 'console' },
    b2: {},
    ...overrides,
  };
}

function makeToken(userId, config) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: '1h',
  });
}

function createPhase7MockPool() {
  const users = new Map([
    ['pro-1', { id: 'pro-1', name: 'Alex Pro' }],
    ['biz-1', { id: 'biz-1', name: 'Acme Business' }],
    ['biz-hiring', { id: 'biz-hiring', name: 'Hiring Biz' }],
    ['hiring-1', { id: 'hiring-1', name: 'Tech Recruiter' }],
    ['cust-1', { id: 'cust-1', name: 'Casey Customer' }],
    ['admin-1', { id: 'admin-1', name: 'Mod Admin' }],
  ]);

  const userRoles = [
    { user_id: 'pro-1', role: 'professional', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
    { user_id: 'biz-1', role: 'business', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
    { user_id: 'biz-hiring', role: 'business', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
    { user_id: 'hiring-1', role: 'hiring', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
    { user_id: 'cust-1', role: 'customer', is_primary: 1, profile_completion_status: 'complete', verification_status: 'not_required' },
    { user_id: 'admin-1', role: 'admin', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
  ];

  const businessProfiles = new Map([
    ['biz-1', { user_id: 'biz-1', listing_id: null, hiring_enabled: 0, profile: JSON.stringify({ companyName: 'Acme Business', hiringEnabled: false }) }],
    ['biz-hiring', { user_id: 'biz-hiring', listing_id: null, hiring_enabled: 1, profile: JSON.stringify({ companyName: 'Hiring Biz', hiringEnabled: true }) }],
  ]);
  const professionalProfiles = new Map([
    ['pro-1', { user_id: 'pro-1', listing_id: null, profile: JSON.stringify({ fullName: 'Alex Pro', headline: 'Senior Plumber' }) }],
  ]);

  const serviceCategories = new Map([
    [SVC_CAT_ID, { id: SVC_CAT_ID, slug: 'home-cleaning', name: 'Home Cleaning', is_active: 1 }],
  ]);
  const serviceSubcategories = new Map([
    [SVC_SUB_ID, { id: SVC_SUB_ID, category_id: SVC_CAT_ID, slug: 'deep-cleaning', name: 'Deep cleaning', is_active: 1 }],
  ]);
  const categories = new Map([
    ['20000000-0000-4000-8000-000000000002', { id: '20000000-0000-4000-8000-000000000002', parent_id: null, listing_type: 'product', name: 'Shopping & Products', is_active: 1 }],
    [PROD_CAT_ID, { id: PROD_CAT_ID, parent_id: '20000000-0000-4000-8000-000000000002', listing_type: null, name: 'Fashion', is_active: 1 }],
    [PROD_SUB_ID, { id: PROD_SUB_ID, parent_id: PROD_CAT_ID, listing_type: null, name: "Men's Clothing", is_active: 1 }],
    ['20000000-0000-4000-8000-000000000004', { id: '20000000-0000-4000-8000-000000000004', parent_id: null, listing_type: 'job', name: 'Jobs & Employment', is_active: 1 }],
    [JOB_CAT_ID, { id: JOB_CAT_ID, parent_id: '20000000-0000-4000-8000-000000000004', listing_type: null, name: 'IT & Software', is_active: 1 }],
    ['20000000-0000-4000-8000-000000000005', { id: '20000000-0000-4000-8000-000000000005', parent_id: null, listing_type: 'project', name: 'Freelance Projects', is_active: 1 }],
    [PROJ_CAT_ID, { id: PROJ_CAT_ID, parent_id: '20000000-0000-4000-8000-000000000005', listing_type: null, name: 'Website Development', is_active: 1 }],
  ]);

  const listings = new Map();
  const services = new Map();
  const servicePricing = new Map();
  const serviceLocations = [];
  const serviceAvailability = [];
  const serviceTags = [];
  const products = new Map();
  const jobs = new Map();
  const projects = new Map();
  const listingMedia = [];
  const serviceMedia = [];
  const mediaAssets = new Map();
  const history = [];
  const moderationPolicy = { requireReviewTypes: [], defaultVisibility: 'public' };
  const queryLog = [];

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();
    queryLog.push({ sql: s, params: [...params] });

    if (s.startsWith('SELECT 1')) return [[{ result: 1 }]];
    if (s.startsWith('SELECT * FROM service_category_rules WHERE category_id = ?')) {
      const rule = {
        category_id: SVC_CAT_ID,
        requires_location: 0,
        supports_coverage_radius: 1,
        supports_duration: 1,
        supports_availability: 1,
        supports_booking_lead_time: 1,
        supports_packages: 1,
        allowed_delivery_methods: JSON.stringify(['customer_location', 'provider_location', 'online', 'remote', 'hybrid']),
        allowed_pricing_types: JSON.stringify(['fixed', 'hourly', 'per_visit', 'per_day', 'negotiable', 'starting_from', 'quote_required']),
        required_fields: JSON.stringify(['title', 'shortDescription', 'description', 'categoryId', 'pricingType', 'deliveryMethod']),
        attributes: '[]',
      };
      return [params[0] === SVC_CAT_ID ? [rule] : []];
    }

    if (s.startsWith('SELECT role, is_primary, profile_completion_status, verification_status FROM user_roles')) {
      return [userRoles.filter((r) => r.user_id === params[0])];
    }
    if (s.startsWith('SELECT role FROM user_roles WHERE user_id = ? AND role = ?')) {
      const match = userRoles.find((r) => r.user_id === params[0] && r.role === params[1]);
      return [match ? [{ role: match.role }] : []];
    }
    if (s.startsWith('SELECT user_id, listing_id, hiring_enabled, profile FROM business_profiles')) {
      const bp = businessProfiles.get(params[0]);
      return [bp ? [bp] : []];
    }
    if (s.startsWith('SELECT user_id, hiring_enabled, profile, shop_settings FROM business_profiles WHERE user_id IN')) {
      return [params.map((id) => businessProfiles.get(id)).filter(Boolean)];
    }
    if (s.startsWith('SELECT bp.*, ml.status AS listing_status')) {
      const bp = businessProfiles.get(params[0]);
      if (!bp) return [[]];
      const ml = listings.get(bp.listing_id);
      return [[{ ...bp, listing_status: ml?.status || 'published', listing_is_public: ml?.is_public ?? 1, listing_visibility: ml?.visibility || 'public' }]];
    }
    if (s.startsWith('SELECT id, parent_id, name, slug FROM categories WHERE id IN') ||
        s.startsWith('SELECT id, name, slug FROM categories WHERE id IN')) {
      return [params.map((id) => categories.get(id)).filter(Boolean)];
    }
    if (s.startsWith('SELECT * FROM product_category_rules') ||
        s.startsWith('SELECT attribute_key, attribute_label') ||
        s.startsWith('SELECT * FROM product_variants')) {
      return [[]];
    }
    if (s.startsWith('SELECT COUNT(*) AS total FROM products p')) {
      const rows = Array.from(products.values()).filter((product) => {
        if (product.status !== 'published') return false;
        const listing = listings.get(product.id);
        return listing?.listing_type === 'product' &&
          listing.status === 'published' && Boolean(listing.is_public) &&
          listing.visibility === 'public';
      });
      return [[{ total: rows.length }]];
    }
    if (s.startsWith('SELECT p.brand, p.product_condition, p.attributes FROM products p')) {
      return [[]];
    }
    if (s.startsWith('SELECT p.id, p.brand, p.product_condition, p.attributes FROM products p')) {
      return [Array.from(products.values()).filter((product) => {
        const listing = listings.get(product.id);
        return product.status === 'published' && Boolean(product.is_active) &&
          listing?.listing_type === 'product' && listing.status === 'published' &&
          Boolean(listing.is_public) && listing.visibility === 'public';
      })];
    }

    if (s.startsWith('SELECT user_id, listing_id FROM professional_profiles')) {
      const pp = professionalProfiles.get(params[0]);
      return [pp ? [pp] : []];
    }
    if (s.startsWith('SELECT user_id, listing_id FROM business_profiles')) {
      const bp = businessProfiles.get(params[0]);
      return [bp ? [bp] : []];
    }
    if (s.startsWith('SELECT profile FROM professional_profiles WHERE user_id = ?')) {
      const pp = professionalProfiles.get(params[0]);
      return [pp ? [pp] : []];
    }
    if (s.startsWith('SELECT profile, hiring_enabled FROM business_profiles WHERE user_id = ?')) {
      const bp = businessProfiles.get(params[0]);
      return [bp ? [bp] : []];
    }
    if (s.startsWith('SELECT user_id, profile FROM professional_profiles WHERE user_id IN')) {
      return [params.map((id) => professionalProfiles.get(id)).filter(Boolean)];
    }
    if (s.startsWith('SELECT professional_user_id, skill FROM professional_skills')) return [[]];
    if (s.startsWith('SELECT bc.business_user_id')) return [[]];
    if (s.startsWith('SELECT p.*, u.name AS seller_name') && s.includes('FROM products p')) {
      const publicGuard = s.includes("ml.status = 'published'") &&
        s.includes('ml.is_public = TRUE') && s.includes("ml.visibility = 'public'");
      const rows = Array.from(products.values())
        .filter((product) => product.status === 'published')
        .filter((product) => !publicGuard || (() => {
          const listing = listings.get(product.id);
          return listing?.listing_type === 'product' &&
            listing.status === 'published' && Boolean(listing.is_public) &&
            listing.visibility === 'public';
        })())
        .map((product) => ({ ...product, seller_name: users.get(product.seller_user_id)?.name || null }));
      return [rows];
    }
    if (s.startsWith('SELECT listing_id, media_asset_id FROM listing_media')) {
      return [listingMedia.map((media) => ({
        listing_id: media.listing_id,
        media_asset_id: media.media_asset_id,
      }))];
    }
    if (s.startsWith('SELECT setting_value FROM marketplace_settings')) {
      return [[{ setting_value: JSON.stringify(moderationPolicy) }]];
    }
    if (s.startsWith('SELECT name FROM users WHERE id = ?')) {
      const u = users.get(params[0]);
      return [u ? [u] : []];
    }
    if (s.startsWith('SELECT verification_status FROM user_roles')) {
      const r = userRoles.find((x) => x.user_id === params[0] && x.role === params[1]);
      return [r ? [r] : []];
    }
    if (s.startsWith('SELECT id, slug, name, description, display_order FROM service_categories')) {
      const c = serviceCategories.get(params[0]);
      return [c && c.is_active ? [c] : []];
    }
    if (s.startsWith('SELECT id FROM service_subcategories')) {
      const sub = serviceSubcategories.get(params[0]);
      return [sub && sub.category_id === params[1] && sub.is_active ? [sub] : []];
    }
    if (s.startsWith('SELECT c.id FROM categories c')) {
      const cat = categories.get(params[0]);
      if (!cat || !cat.is_active) return [[]];
      const p = cat.parent_id ? categories.get(cat.parent_id) : null;
      const gp = p?.parent_id ? categories.get(p.parent_id) : null;
      const section = params[1];
      const match = cat.listing_type === section || p?.listing_type === section || gp?.listing_type === section;
      return [match ? [{ id: cat.id }] : []];
    }
    if (s.startsWith('SELECT id FROM categories WHERE id = ? AND parent_id = ?')) {
      const sub = categories.get(params[0]);
      return [sub && sub.parent_id === params[1] && sub.is_active ? [sub] : []];
    }
    if (s.startsWith('SELECT name FROM categories WHERE id = ?')) {
      const c = categories.get(params[0]) || serviceCategories.get(params[0]) || serviceSubcategories.get(params[0]);
      return [c ? [{ name: c.name }] : []];
    }

    if (s.startsWith('INSERT INTO services')) {
      const [id, provider_user_id, provider_role, category_id, subcategory_id, slug, title, short_description, description, delivery_method, duration_value, duration_unit, inclusions, exclusions, customer_requirements, terms_and_conditions, booking_lead_time_hours, cancellation_policy, packages, addons, custom_attributes, booking_constraints, status] = params;
      services.set(id, { id, provider_user_id, provider_role, category_id, subcategory_id, slug, title, short_description, description, delivery_method, duration_value, duration_unit, inclusions, exclusions, customer_requirements, terms_and_conditions, booking_lead_time_hours, cancellation_policy, packages, addons, custom_attributes, booking_constraints, status, rating_avg: 0, review_count: 0 });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO service_pricing')) {
      servicePricing.set(params[0], { service_id: params[0], pricing_type: params[1], amount: params[2], min_price: params[3], max_price: params[4], currency: params[5] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM service_locations')) {
      for (let i = serviceLocations.length - 1; i >= 0; i--) if (serviceLocations[i].service_id === params[0]) serviceLocations.splice(i, 1);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO service_locations')) {
      serviceLocations.push({ id: params[0], service_id: params[1], country: params[2], state: params[3], city: params[4], area: params[5], radius_km: params[6], is_primary: params[7] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM service_availability')) {
      for (let i = serviceAvailability.length - 1; i >= 0; i--) if (serviceAvailability[i].service_id === params[0]) serviceAvailability.splice(i, 1);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO service_availability')) {
      serviceAvailability.push({ id: params[0], service_id: params[1], day_of_week: params[2], start_time: params[3], end_time: params[4], is_unavailable: params[5] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM service_tags')) {
      for (let i = serviceTags.length - 1; i >= 0; i--) if (serviceTags[i].service_id === params[0]) serviceTags.splice(i, 1);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT IGNORE INTO service_tags')) {
      serviceTags.push({ service_id: params[0], tag: params[1] });
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('INSERT INTO products')) {
      const [id, seller_user_id, seller_role, category_id, subcategory_id, name, description, price, currency, stock_quantity, variants, images, delivery_info, status] = params;
      products.set(id, { id, seller_user_id, seller_role, category_id, subcategory_id, name, description, price, currency, stock_quantity, variants, images, delivery_info, status });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO jobs')) {
      const [id, employer_user_id, employer_role, category_id, title, description, employment_type, work_mode, location, salary_min, salary_max, currency, experience_required, education_required, skills, deadline, status] = params;
      jobs.set(id, { id, employer_user_id, employer_role, category_id, title, description, employment_type, work_mode, location, salary_min, salary_max, currency, experience_required, education_required, skills, deadline, status });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO freelance_projects')) {
      const [id, client_user_id, category_id, title, description, required_skills, budget, currency, deadline, deliverables, work_mode, location, status] = params;
      projects.set(id, { id, client_user_id, category_id, title, description, required_skills, budget, currency, deadline, deliverables, work_mode, location, status });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO professional_profiles')) {
      professionalProfiles.set(params[0], { user_id: params[0], listing_id: params[1], profile: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO business_profiles')) {
      businessProfiles.set(params[0], { user_id: params[0], listing_id: params[1], hiring_enabled: params[2], profile: params[3] });
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('INSERT INTO marketplace_listings')) {
      const [id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id, title, short_summary, description, location, visibility, status, is_public, published_at, archived_at, submitted_for_review_at, moderation_status, moderation_reason, moderated_by, moderated_at] = params;
      const existing = listings.get(id);
      const now = new Date().toISOString();
      listings.set(id, {
        id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id,
        title, short_summary: short_summary ?? existing?.short_summary ?? null,
        description, location: location ?? existing?.location ?? null,
        visibility, status, is_public: is_public ? 1 : 0,
        published_at: existing?.published_at || published_at,
        archived_at: archived_at || existing?.archived_at || null,
        submitted_for_review_at: submitted_for_review_at || existing?.submitted_for_review_at || null,
        moderation_status: moderation_status || existing?.moderation_status || 'not_required',
        moderation_reason: moderation_reason ?? existing?.moderation_reason ?? null,
        moderated_by: moderated_by ?? existing?.moderated_by ?? null,
        moderated_at: moderated_at ?? existing?.moderated_at ?? null,
        created_at: existing?.created_at || now,
        updated_at: now,
      });
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('DELETE FROM listing_categories') || s.startsWith('INSERT IGNORE INTO listing_categories')) {
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('INSERT INTO listing_status_history')) {
      history.push({
        id: params[0], listing_id: params[1], listing_type: params[2],
        from_status: params[3], to_status: params[4], changed_by_user_id: params[5],
        changed_by_role: params[6], reason: params[7], created_at: new Date().toISOString(),
      });
      return [{ affectedRows: 1 }];
    }

    if (s.startsWith('SELECT id, listing_id AS listingId')) {
      return [history.filter((h) => h.listing_id === params[0]).slice().reverse()];
    }

    if (s.startsWith('SELECT id, listing_type FROM marketplace_listings WHERE id = ?')) {
      const l = listings.get(params[0]);
      return [l ? [{ id: l.id, listing_type: l.listing_type }] : []];
    }

    if (s.startsWith('SELECT * FROM marketplace_listings WHERE id = ?')) {
      const l = listings.get(params[0]);
      return [l ? [l] : []];
    }

    if (s.startsWith('UPDATE services SET status = ?')) {
      const item = services.get(params[1]);
      if (item) item.status = params[0];
      return [{ affectedRows: item ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE products SET status = ?')) {
      const item = products.get(params[1]);
      if (item) item.status = params[0];
      return [{ affectedRows: item ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE jobs SET status = ?')) {
      const item = jobs.get(params[1]);
      if (item) item.status = params[0];
      return [{ affectedRows: item ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE freelance_projects SET status = ?')) {
      const item = projects.get(params[1]);
      if (item) item.status = params[0];
      return [{ affectedRows: item ? 1 : 0 }];
    }

    if (s.startsWith('UPDATE marketplace_listings SET status = ?')) {
      const id = params[params.length - 1];
      const item = listings.get(id);
      if (!item) return [{ affectedRows: 0 }];
      const nextStatus = params[0];
      item.status = nextStatus;
      item.is_public = nextStatus === 'published' && item.visibility === 'public' ? 1 : 0;
      if (nextStatus === 'published' && !item.published_at) item.published_at = new Date().toISOString();
      if (nextStatus === 'archived' && !item.archived_at) item.archived_at = new Date().toISOString();
      if (nextStatus === 'pending_review') {
        item.submitted_for_review_at = new Date().toISOString();
        item.moderation_status = 'pending';
      }
      if (s.includes('moderated_by = ?')) {
        item.moderation_status = params[4] || item.moderation_status;
        item.moderation_reason = params[5];
        item.moderated_by = params[6];
        item.moderated_at = new Date().toISOString();
      }
      item.updated_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }

    // Media asset & listing_media
    if (s.startsWith('SELECT id, user_id, role, purpose, object_key FROM media_assets WHERE id IN')) {
      return [Array.from(mediaAssets.values()).filter((asset) => params.includes(asset.id))];
    }
    if (s.startsWith('SELECT id, user_id, role, object_key, content_type, byte_size, purpose FROM media_assets')) {
      const a = mediaAssets.get(params[0]);
      return [a && a.user_id === params[1] ? [a] : []];
    }
    if (s.startsWith('SELECT COUNT(*) AS total FROM listing_media')) {
      return [[{ total: listingMedia.filter((m) => m.listing_id === params[0]).length }]];
    }
    if (s.startsWith('UPDATE listing_media SET is_cover = FALSE')) {
      listingMedia.forEach((m) => { if (m.listing_id === params[0]) m.is_cover = 0; });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO listing_media')) {
      if (listingMedia.some((m) => m.listing_id === params[2] && m.media_asset_id === params[3])) {
        const err = new Error('Duplicate');
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }
      listingMedia.push({
        id: params[0], listing_type: params[1], listing_id: params[2], media_asset_id: params[3],
        media_role: params[4], display_order: params[5], is_cover: params[6] ? 1 : 0,
        alt_text: params[7], mime_type: params[8], file_size: params[9], object_key: params[10],
        visibility: params[11], created_at: new Date().toISOString(),
      });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT IGNORE INTO service_media')) {
      serviceMedia.push({ id: params[0], service_id: params[1], media_asset_id: params[2], media_type: params[3], display_order: params[4] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith("UPDATE media_assets SET status = 'attached'")) {
      const a = mediaAssets.get(params[0]);
      if (a) a.status = 'attached';
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT id, media_role, visibility FROM listing_media')) {
      return [listingMedia.filter((m) => m.listing_id === params[0]).sort((a, b) => a.display_order - b.display_order)];
    }
    if (s.startsWith('UPDATE listing_media SET')) {
      const id = params[params.length - 2];
      const listingId = params[params.length - 1];
      const m = listingMedia.find((x) => x.id === id && x.listing_id === listingId);
      if (m) {
        let pIdx = 0;
        if (s.includes('display_order = ?')) m.display_order = params[pIdx++];
        if (s.includes('is_cover = ?')) m.is_cover = params[pIdx++] ? 1 : 0;
        if (s.includes('alt_text = ?')) m.alt_text = params[pIdx++];
      }
      return [{ affectedRows: m ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE service_media SET display_order = ?')) {
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT id, media_asset_id, media_role')) {
      return [listingMedia.filter((m) => m.listing_id === params[0])];
    }
    if (s.startsWith('SELECT lm.id, lm.listing_type, lm.media_asset_id')) {
      const m = listingMedia.find((x) => x.id === params[0] && x.listing_id === params[1]);
      const l = listings.get(params[1]);
      const a = m ? mediaAssets.get(m.media_asset_id) : null;
      return [m && l && l.owner_user_id === params[2] && a
        ? [{ id: m.id, listing_type: m.listing_type, media_asset_id: m.media_asset_id, object_key: a.object_key }]
        : []];
    }
    if (s.startsWith('DELETE FROM listing_media WHERE id = ?')) {
      const idx = listingMedia.findIndex((m) => m.id === params[0]);
      if (idx >= 0) listingMedia.splice(idx, 1);
      return [{ affectedRows: idx >= 0 ? 1 : 0 }];
    }
    if (s.startsWith('DELETE FROM service_media WHERE id = ?')) {
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT (SELECT COUNT(*) FROM listing_media')) {
      const assetId = params[0];
      const total = listingMedia.filter((m) => m.media_asset_id === assetId).length;
      return [[{ total }]];
    }
    if (s.startsWith('DELETE FROM media_assets WHERE id = ?')) {
      const a = mediaAssets.get(params[0]);
      if (a && a.user_id === params[1]) mediaAssets.delete(params[0]);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT id, object_key, status FROM media_assets')) {
      const a = mediaAssets.get(params[0]);
      return [a && a.user_id === params[1] ? [a] : []];
    }
    if (s.startsWith('SELECT ma.id, ma.object_key FROM media_assets ma')) {
      const attachedIds = new Set(listingMedia.map((m) => m.media_asset_id));
      const found = Array.from(mediaAssets.values()).filter(
        (a) => a.user_id === params[0] && a.status === 'pending' && !attachedIds.has(a.id)
      );
      return [found];
    }

    // Hydration queries
    if (s.startsWith('SELECT lm.id, lm.listing_id')) {
      return [listingMedia
        .filter((m) => params.includes(m.listing_id))
        .map((m) => {
          const a = mediaAssets.get(m.media_asset_id);
          return { ...m, purpose: a?.purpose || null, asset_content_type: a?.content_type, asset_byte_size: a?.byte_size, asset_object_key: a?.object_key };
        })
        .sort((a, b) => (b.is_cover - a.is_cover) || (a.display_order - b.display_order))];
    }
    if (s.startsWith('SELECT sm.id, sm.service_id AS listing_id')) return [[]];
    if (s.startsWith('SELECT * FROM services WHERE id IN')) return [params.map((id) => services.get(id)).filter(Boolean)];
    if (s.startsWith('SELECT * FROM service_pricing WHERE service_id IN')) return [params.map((id) => servicePricing.get(id)).filter(Boolean)];
    if (s.startsWith('SELECT * FROM service_locations WHERE service_id IN')) return [serviceLocations.filter((l) => params.includes(l.service_id))];
    if (s.startsWith('SELECT * FROM service_availability WHERE service_id IN')) return [serviceAvailability.filter((a) => params.includes(a.service_id))];
    if (s.startsWith('SELECT service_id, tag FROM service_tags WHERE service_id IN')) return [serviceTags.filter((t) => params.includes(t.service_id))];
    if (s.startsWith('SELECT * FROM products WHERE id IN')) return [params.map((id) => products.get(id)).filter(Boolean)];
    if (s.startsWith('SELECT * FROM jobs WHERE id IN')) return [params.map((id) => jobs.get(id)).filter(Boolean)];
    if (s.startsWith('SELECT * FROM freelance_projects WHERE id IN')) return [params.map((id) => projects.get(id)).filter(Boolean)];

    // Status counts & listing queries
    if (s.startsWith('SELECT status, COUNT(*) AS total FROM marketplace_listings')) {
      const ownerId = params[0];
      const typeFilter = s.includes('AND listing_type = ?') ? params[1] : null;
      const map = new Map();
      for (const l of listings.values()) {
        if (l.owner_user_id !== ownerId || l.status === 'deleted') continue;
        if (typeFilter && l.listing_type !== typeFilter) continue;
        map.set(l.status, (map.get(l.status) || 0) + 1);
      }
      return [Array.from(map.entries()).map(([status, total]) => ({ status, total }))];
    }

    const filterListings = (stmt, p) => {
      let rows = Array.from(listings.values());
      let idx = 0;
      if (stmt.includes('WHERE ml.id = ?')) {
        const id = p[idx++];
        rows = rows.filter((r) => r.id === id);
        if (stmt.includes("ml.status = 'published'")) {
          rows = rows.filter((r) => r.status === 'published' && Boolean(r.is_public) && r.visibility === 'public');
        }
      } else if (stmt.includes('WHERE ml.owner_user_id = ?')) {
        const ownerId = p[idx++];
        rows = rows.filter((r) => r.owner_user_id === ownerId && r.status !== 'deleted');
        if (stmt.includes('AND ml.listing_type = ?')) {
          const t = p[idx++];
          rows = rows.filter((r) => r.listing_type === t);
        }
        if (stmt.includes('AND ml.status = ?')) {
          const st = p[idx++];
          rows = rows.filter((r) => r.status === st);
        }
        if (stmt.includes('AND ml.category_id = ?')) {
          const cat = p[idx++];
          rows = rows.filter((r) => r.category_id === cat);
        }
        if (stmt.includes('ml.title LIKE ?')) {
          const like = p[idx++].replace(/%/g, '').toLowerCase();
          idx += 2;
          rows = rows.filter((r) => (r.title || '').toLowerCase().includes(like));
        }
      } else if (stmt.includes("WHERE ml.status = 'pending_review'")) {
        rows = rows.filter((r) => r.status === 'pending_review');
      } else {
        rows = rows.filter((r) => r.status === 'published' && Boolean(r.is_public) && r.visibility === 'public');
        if (stmt.includes('AND ml.listing_type = ?')) {
          const t = p[idx++];
          rows = rows.filter((r) => r.listing_type === t);
        }
        if (stmt.includes('AND ml.category_id = ?')) {
          const cat = p[idx++];
          rows = rows.filter((r) => r.category_id === cat);
        }
        if (stmt.includes('AND ml.subcategory_id = ?')) {
          const sub = p[idx++];
          rows = rows.filter((r) => r.subcategory_id === sub);
        }
        if (stmt.includes('ml.title LIKE ?')) {
          const like = p[idx++].replace(/%/g, '').toLowerCase();
          idx += 2;
          rows = rows.filter((r) => (r.title || '').toLowerCase().includes(like));
        }
      }
      return { rows, idx };
    };

    if (s.startsWith('SELECT COUNT(*) AS total FROM marketplace_listings ml')) {
      const { rows } = filterListings(s, params);
      return [[{ total: rows.length }]];
    }

    if (s.startsWith('SELECT ml.*')) {
      const { rows } = filterListings(s, params);
      const enriched = rows.map((r) => {
        const u = users.get(r.owner_user_id);
        const ur = userRoles.find((x) => x.user_id === r.owner_user_id && x.role === r.owner_role);
        const bp = businessProfiles.get(r.owner_user_id);
        const cat = categories.get(r.category_id) || serviceCategories.get(r.category_id);
        const sub = categories.get(r.subcategory_id) || serviceSubcategories.get(r.subcategory_id);
        return {
          ...r,
          owner_name: u?.name || null,
          verification_status: ur?.verification_status || 'not_started',
          business_profile: bp?.profile || null,
          category_name: cat?.name || null,
          subcategory_name: sub?.name || null,
          service_category_name: cat?.name || null,
          service_subcategory_name: sub?.name || null,
        };
      });
      if (s.includes('LIMIT ? OFFSET ?')) {
        const limit = params[params.length - 2];
        const offset = params[params.length - 1];
        return [enriched.slice(offset, offset + limit)];
      }
      return [enriched];
    }

    throw new Error(`Unexpected mock SQL in Phase 7 test: ${s}`);
  }

  return {
    query,
    execute: query,
    async getConnection() {
      return {
        query,
        execute: query,
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
      };
    },
    addMediaAsset(asset) {
      mediaAssets.set(asset.id, asset);
    },
    hasMediaAsset(id) {
      return mediaAssets.has(id);
    },
    setModerationPolicy(policy) {
      Object.assign(moderationPolicy, policy);
    },
    getQueryLog() {
      return [...queryLog];
    },
  };
}

async function startServer(pool, config) {
  const app = createApp({ pool, config });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function api(baseUrl, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

test('Phase 7 role-to-listing permissions & business hiring capability enforcement', async (t) => {
  const config = makeConfig({
    b2: {
      endpoint: 'https://s3.us-west-004.backblazeb2.com',
      region: 'us-west-004',
      bucket: 'test-bucket',
      keyId: 'test-key-id',
      applicationKey: 'test-application-key',
    },
  });
  const pool = createPhase7MockPool();
  const server = await startServer(pool, config);
  t.after(server.close);

  const proToken = makeToken('pro-1', config);
  const bizToken = makeToken('biz-1', config);
  const bizHiringToken = makeToken('biz-hiring', config);
  const hiringToken = makeToken('hiring-1', config);
  const custToken = makeToken('cust-1', config);

  // Customer cannot create any listing
  const custCap = await api(server.url, '/api/v1/listings/capabilities', { token: custToken });
  assert.equal(custCap.status, 200);
  assert.deepEqual(custCap.data.allowedListingTypes, []);

  const custCreate = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: custToken,
    body: { listingType: 'freelance_project', title: 'Customer project', description: 'Should be blocked', categoryId: PROJ_CAT_ID, status: 'draft' },
  });
  assert.equal(custCreate.status, 403);

  // Professional: allowed service & professional_profile; denied product & job
  const proProduct = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: proToken,
    body: { listingType: 'product', title: 'Soap', description: 'Desc', categoryId: PROD_CAT_ID, price: 100 },
  });
  assert.equal(proProduct.status, 403);

  const proSvc = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: proToken,
    body: {
      listingType: 'service',
      title: 'Pipe repair',
      shortSummary: 'Quick pipe repair',
      description: 'Full leak fix',
      categoryId: SVC_CAT_ID,
      subcategoryId: SVC_SUB_ID,
      pricingType: 'fixed',
      price: 500,
      status: 'published',
    },
  });
  assert.equal(proSvc.status, 201);
  assert.equal(proSvc.data.listing.listingType, 'service');

  const proProfile = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: proToken,
    body: {
      listingType: 'professional_profile',
      title: 'Alex Pro',
      shortSummary: 'Master Plumber',
      description: '10 years experience',
      details: { profilePhoto: { id: 'professional-profile-photo' } },
      status: 'published',
    },
  });
  assert.equal(proProfile.status, 201);
  assert.equal(proProfile.data.listing.listingType, 'professional_profile');
  pool.addMediaAsset({
    id: 'professional-profile-photo',
    user_id: 'pro-1',
    role: 'professional',
    purpose: 'profile-photo',
    object_key: 'pro-1/professional/profile.jpg',
  });
  const profileDiscovery = await api(server.url, '/api/v1/listings/sections/professional_profile');
  assert.equal(profileDiscovery.status, 200);
  assert.match(profileDiscovery.data.listings[0].profileImageUrl, /^https:\/\/.+/);
  pool.addMediaAsset({
    id: 'professional-profile-photo',
    user_id: 'another-user',
    role: 'professional',
    purpose: 'profile-photo',
    object_key: 'another-user/professional/profile.jpg',
  });
  const mismatchedProfileDiscovery = await api(server.url, '/api/v1/listings/sections/professional_profile');
  assert.equal(mismatchedProfileDiscovery.status, 200);
  assert.equal(mismatchedProfileDiscovery.data.listings[0].profileImageUrl, null);

  // Business (hiring disabled): allowed product, service, business_profile; denied job
  const bizJobDenied = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: bizToken,
    body: { listingType: 'job', title: 'Clerk', description: 'Desk clerk', categoryId: JOB_CAT_ID },
  });
  assert.equal(bizJobDenied.status, 403);
  assert.equal(bizJobDenied.data.code, 'hiring_capability_disabled');

  const bizProduct = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: bizToken,
    body: {
      listingType: 'product',
      title: 'Cotton Shirt',
      description: 'Blue shirt',
      categoryId: PROD_CAT_ID,
      subcategoryId: PROD_SUB_ID,
      price: 799,
      stockQuantity: 12,
      status: 'published',
    },
  });
  assert.equal(bizProduct.status, 201);

  const privateProduct = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: bizToken,
    body: {
      listingType: 'product',
      title: 'Private item',
      description: 'Not for customer discovery',
      categoryId: PROD_CAT_ID,
      price: 799,
      stockQuantity: 2,
      visibility: 'private',
      status: 'published',
    },
  });
  assert.equal(privateProduct.status, 201);
  const legacyProducts = await api(server.url, '/api/v1/marketplace/products');
  assert.deepEqual(legacyProducts.data.products.map((item) => item.id), [bizProduct.data.listing.id]);

  const bizProfile = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: bizToken,
    body: { listingType: 'business_profile', title: 'Acme Business', description: 'Retail shop', status: 'published' },
  });
  assert.equal(bizProfile.status, 201);

  // Business (hiring enabled): job allowed!
  const bizJobAllowed = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: bizHiringToken,
    body: { listingType: 'job', title: 'Store Manager', description: 'Manage retail floor', categoryId: JOB_CAT_ID, status: 'published' },
  });
  assert.equal(bizJobAllowed.status, 201);
  assert.equal(bizJobAllowed.data.listing.owner.role, 'business');

  // Hiring: allowed job & freelance_project; denied service
  const hiringProj = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: hiringToken,
    body: {
      listingType: 'freelance_project',
      title: 'Build Portal',
      description: 'Full stack portal',
      categoryId: PROJ_CAT_ID,
      budget: 50000,
      status: 'published',
    },
  });
  assert.equal(hiringProj.status, 201);
  assert.equal(hiringProj.data.listing.listingType, 'freelance_project');

  const hiringSvcDenied = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: hiringToken,
    body: { listingType: 'service', title: 'Cleaning', shortSummary: 'Clean', description: 'Clean', categoryId: SVC_CAT_ID, pricingType: 'fixed', price: 100 },
  });
  assert.equal(hiringSvcDenied.status, 403);

  // Section-isolated public discovery (no cross-contamination!)
  const svcDiscover = await api(server.url, '/api/v1/listings/sections/service');
  assert.equal(svcDiscover.data.listings.length, 1);
  assert.equal(svcDiscover.data.listings[0].listingType, 'service');

  const prodDiscover = await api(server.url, '/api/v1/listings/sections/product');
  assert.equal(prodDiscover.data.listings.length, 1);
  assert.equal(prodDiscover.data.listings[0].listingType, 'product');

  const projDiscover = await api(server.url, '/api/v1/listings/sections/freelance_project');
  assert.equal(projDiscover.data.listings.length, 1);
  assert.equal(projDiscover.data.listings[0].listingType, 'freelance_project');
});

test('Phase 12 public discovery validates filters and parameterizes project facets', async (t) => {
  const config = makeConfig();
  const pool = createPhase7MockPool();
  const server = await startServer(pool, config);
  t.after(server.close);

  const project = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: makeToken('hiring-1', config),
    body: {
      listingType: 'freelance_project',
      title: 'Searchable design project',
      description: 'Build a design system',
      categoryId: PROJ_CAT_ID,
      budget: 300,
      status: 'published',
    },
  });
  assert.equal(project.status, 201);

  const filtered = await api(
    server.url,
    '/api/v1/listings/sections/freelance_project?category=Product%20Design&skill=React&minBudget=100&maxBudget=500&deadline=2027-12-01&workMode=remote&location=Toronto'
  );
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.listings[0].listingType, 'freelance_project');

  const discoveryQuery = pool.getQueryLog().find((entry) =>
    entry.sql.startsWith('SELECT COUNT(*) AS total FROM marketplace_listings ml')
  );
  assert.ok(discoveryQuery);
  assert.match(discoveryQuery.sql, /project_skills ps/);
  assert.match(discoveryQuery.sql, /p\.budget_max/);
  assert.match(discoveryQuery.sql, /p\.deadline <= \?/);
  assert.match(discoveryQuery.sql, /p\.work_mode = \?/);
  assert.match(discoveryQuery.sql, /CAST\(ml\.location AS CHAR\) LIKE \?/);
  assert.ok(discoveryQuery.params.includes('%React%'));
  assert.ok(discoveryQuery.params.includes('remote'));
  assert.ok(discoveryQuery.params.includes('%Toronto%'));

  const invalidRange = await api(
    server.url,
    '/api/v1/listings/sections/freelance_project?minBudget=500&maxBudget=100'
  );
  assert.equal(invalidRange.status, 400);
  assert.equal(invalidRange.data.code, 'invalid_filter');

  const invalidDate = await api(
    server.url,
    '/api/v1/listings/sections/freelance_project?deadline=2025-02-30'
  );
  assert.equal(invalidDate.status, 400);

  const invalidSort = await api(
    server.url,
    '/api/v1/listings/sections/job?sort=experience_desc'
  );
  assert.equal(invalidSort.status, 400);
  assert.equal(invalidSort.data.code, 'invalid_sort');
});

test('Phase 7 lifecycle, moderation, ownership denial, preview, and invalid transitions', async (t) => {
  const config = makeConfig();
  const pool = createPhase7MockPool();
  pool.setModerationPolicy({ requireReviewTypes: ['product'], defaultVisibility: 'public' });
  const server = await startServer(pool, config);
  t.after(server.close);

  const bizToken = makeToken('biz-1', config);
  const otherToken = makeToken('pro-1', config);
  const adminToken = makeToken('admin-1', config);

  // 1. Draft persistence
  const draftRes = await api(server.url, '/api/v1/listings/draft', {
    method: 'POST',
    token: bizToken,
    body: { listingType: 'product', title: 'Draft Jacket' },
  });
  assert.equal(draftRes.status, 201);
  const id = draftRes.data.listing.id;
  assert.equal(draftRes.data.listing.status, 'draft');

  // Draft is NOT in public discovery
  const pubBefore = await api(server.url, '/api/v1/listings?type=product');
  assert.equal(pubBefore.data.listings.length, 0);
  const detailBefore = await api(server.url, `/api/v1/listings/${id}`);
  assert.equal(detailBefore.status, 404);

  // 2. Ownership denial for another user
  const otherGet = await api(server.url, `/api/v1/listings/mine/${id}`, { token: otherToken });
  assert.equal(otherGet.status, 403);
  const otherEdit = await api(server.url, `/api/v1/listings/${id}`, {
    method: 'PUT',
    token: otherToken,
    body: { title: 'Hacked' },
  });
  assert.equal(otherEdit.status, 403);

  // 3. Edit draft & Preview
  const editRes = await api(server.url, `/api/v1/listings/${id}`, {
    method: 'PUT',
    token: bizToken,
    body: {
      title: 'Winter Jacket',
      description: 'Warm waterproof jacket',
      categoryId: PROD_CAT_ID,
      subcategoryId: PROD_SUB_ID,
      price: 2499,
      stockQuantity: 5,
    },
  });
  assert.equal(editRes.status, 200);
  assert.equal(editRes.data.listing.title, 'Winter Jacket');

  const previewRes = await api(server.url, `/api/v1/listings/${id}/preview`, { token: bizToken });
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.data.preview.title, 'Winter Jacket');
  assert.equal(previewRes.data.preview.moderation, undefined);

  // 4. Moderation policy prevents direct publish -> must submit for review
  const directPub = await api(server.url, `/api/v1/listings/${id}/publish`, {
    method: 'POST',
    token: bizToken,
  });
  assert.equal(directPub.status, 409);

  const legacyDirectPub = await api(server.url, '/api/v1/marketplace/products', {
    method: 'POST',
    token: bizToken,
    body: {
      name: 'Bypass attempt',
      description: 'Must require review',
      categoryId: PROD_CAT_ID,
      price: 500,
      stockQuantity: 1,
      status: 'published',
    },
  });
  assert.equal(legacyDirectPub.status, 409);
  assert.equal(legacyDirectPub.data.code, 'review_required');
  assert.equal(directPub.data.code, 'review_required');

  const submitRes = await api(server.url, `/api/v1/listings/${id}/submit-review`, {
    method: 'POST',
    token: bizToken,
  });

  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.data.listing.status, 'pending_review');

  // Non-admin cannot moderate
  const nonAdminMod = await api(server.url, `/api/v1/listings/${id}/moderate`, {
    method: 'POST',
    token: bizToken,
    body: { action: 'approve' },
  });
  assert.equal(nonAdminMod.status, 403);

  // Admin reject requires reason
  const rejectNoReason = await api(server.url, `/api/v1/listings/${id}/moderate`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'reject' },
  });
  assert.equal(rejectNoReason.status, 400);

  const rejectRes = await api(server.url, `/api/v1/listings/${id}/moderate`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'reject', reason: 'Add clearer product dimensions' },
  });
  assert.equal(rejectRes.status, 200);
  assert.equal(rejectRes.data.listing.status, 'rejected');
  assert.equal(rejectRes.data.listing.moderation.reason, 'Add clearer product dimensions');

  // Rejected listing is NOT in public discovery
  assert.equal((await api(server.url, '/api/v1/listings?type=product')).data.listings.length, 0);

  // Resubmit and admin approve
  await api(server.url, `/api/v1/listings/${id}/submit-review`, { method: 'POST', token: bizToken });
  const approveRes = await api(server.url, `/api/v1/listings/${id}/moderate`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'approve', reason: 'Looks good' },
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.listing.status, 'published');

  // Now visible in public discovery!
  const pubAfter = await api(server.url, '/api/v1/listings?type=product');
  assert.equal(pubAfter.data.listings.length, 1);
  assert.equal(pubAfter.data.listings[0].id, id);

  // 5. Pause removes from discovery; Resume restores
  const pauseRes = await api(server.url, `/api/v1/listings/${id}/pause`, { method: 'POST', token: bizToken });
  assert.equal(pauseRes.status, 200);
  assert.equal(pauseRes.data.listing.status, 'paused');
  assert.equal((await api(server.url, '/api/v1/listings?type=product')).data.listings.length, 0);

  const resumeRes = await api(server.url, `/api/v1/listings/${id}/resume`, { method: 'POST', token: bizToken });
  assert.equal(resumeRes.status, 200);
  assert.equal(resumeRes.data.listing.status, 'published');
  assert.equal((await api(server.url, '/api/v1/listings?type=product')).data.listings.length, 1);

  // 6. Archive & invalid post-archive transition
  const archiveRes = await api(server.url, `/api/v1/listings/${id}/archive`, { method: 'POST', token: bizToken });
  assert.equal(archiveRes.status, 200);
  assert.equal(archiveRes.data.listing.status, 'archived');
  assert.equal((await api(server.url, '/api/v1/listings?type=product')).data.listings.length, 0);

  const invalidResume = await api(server.url, `/api/v1/listings/${id}/resume`, { method: 'POST', token: bizToken });
  assert.equal(invalidResume.status, 409);
  assert.equal(invalidResume.data.code, 'invalid_status_transition');

  // 7. Status history recorded all transitions
  const historyRes = await api(server.url, `/api/v1/listings/${id}/history`, { token: bizToken });
  assert.equal(historyRes.status, 200);
  assert.ok(historyRes.data.history.length >= 6);
});

test('moderation policy database errors fail closed', async () => {
  const pool = {
    async query() {
      throw new Error('marketplace_settings unavailable');
    },
  };
  await assert.rejects(
    getModerationPolicy(pool, { moderation: { requireReviewTypes: [] } }),
    /marketplace_settings unavailable/
  );
});

test('Phase 7 media ordering, cover image, alt text, private document isolation, and orphan cleanup', async (t) => {
  const config = makeConfig();
  const pool = createPhase7MockPool();
  const server = await startServer(pool, config);
  t.after(server.close);

  const bizToken = makeToken('biz-1', config);
  const created = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: bizToken,
    body: {
      listingType: 'product',
      title: 'Ceramic Mug',
      description: 'Handmade mug',
      categoryId: PROD_CAT_ID,
      price: 450,
      status: 'published',
    },
  });
  const listingId = created.data.listing.id;

  pool.addMediaAsset({
    id: 'asset-img-1',
    user_id: 'biz-1',
    role: 'business',
    object_key: 'biz-1/business/mug-1.jpg',
    content_type: 'image/jpeg',
    byte_size: 120000,
    purpose: 'listing-image',
    status: 'pending',
  });
  pool.addMediaAsset({
    id: 'asset-img-2',
    user_id: 'biz-1',
    role: 'business',
    object_key: 'biz-1/business/mug-2.png',
    content_type: 'image/png',
    byte_size: 150000,
    purpose: 'listing-image',
    status: 'pending',
  });
  pool.addMediaAsset({
    id: 'asset-private-doc',
    user_id: 'biz-1',
    role: 'business',
    object_key: 'biz-1/business/cert.pdf',
    content_type: 'application/pdf',
    byte_size: 95000,
    purpose: 'verification-document',
    status: 'pending',
  });
  pool.addMediaAsset({
    id: 'asset-orphan',
    user_id: 'biz-1',
    role: 'business',
    object_key: 'biz-1/business/orphan.jpg',
    content_type: 'image/jpeg',
    byte_size: 80000,
    purpose: 'listing-image',
    status: 'pending',
  });

  const m1 = await api(server.url, `/api/v1/listings/${listingId}/media`, {
    method: 'POST',
    token: bizToken,
    body: { mediaAssetId: 'asset-img-1', mediaType: 'image', isCover: true, altText: 'Front view' },
  });
  assert.equal(m1.status, 201);
  assert.equal(m1.data.media.isCover, true);
  assert.equal(m1.data.media.mimeType, 'image/jpeg');
  assert.equal(m1.data.media.fileSize, 120000);
  assert.equal(m1.data.media.objectKey, 'biz-1/business/mug-1.jpg');

  const m2 = await api(server.url, `/api/v1/listings/${listingId}/media`, {
    method: 'POST',
    token: bizToken,
    body: { mediaAssetId: 'asset-img-2', mediaType: 'image', altText: 'Side view' },
  });
  assert.equal(m2.status, 201);

  const mDoc = await api(server.url, `/api/v1/listings/${listingId}/media`, {
    method: 'POST',
    token: bizToken,
    body: { mediaAssetId: 'asset-private-doc', mediaType: 'document' },
  });
  assert.equal(mDoc.status, 201);
  assert.equal(mDoc.data.media.visibility, 'private');

  // Reorder & switch cover image
  const reorderRes = await api(server.url, `/api/v1/listings/${listingId}/media/reorder`, {
    method: 'PATCH',
    token: bizToken,
    body: {
      items: [
        { mediaId: m2.data.media.id, displayOrder: 0, isCover: true, altText: 'Hero side view' },
        { mediaId: m1.data.media.id, displayOrder: 1, isCover: false },
      ],
    },
  });
  assert.equal(reorderRes.status, 200);
  assert.equal(reorderRes.data.listing.coverImage.id, m2.data.media.id);
  assert.equal(reorderRes.data.listing.coverImage.altText, 'Hero side view');

  // Public detail exposes ONLY public images, NEVER private document
  const publicDetail = await api(server.url, `/api/v1/listings/${listingId}`);
  assert.equal(publicDetail.status, 200);
  assert.equal(publicDetail.data.listing.media.length, 2);
  assert.ok(publicDetail.data.listing.media.every((item) => item.visibility === 'public'));

  // Owner detail sees all 3 (including private doc)
  const ownerDetail = await api(server.url, `/api/v1/listings/mine/${listingId}`, { token: bizToken });
  assert.equal(ownerDetail.data.listing.media.length, 3);

  // Remove media & clean up orphan upload
  const delMedia = await api(server.url, `/api/v1/listings/${listingId}/media/${m1.data.media.id}`, {
    method: 'DELETE',
    token: bizToken,
  });
  assert.equal(delMedia.status, 200);

  const cleanup = await api(server.url, '/api/v1/uploads/cleanup-orphans', {
    method: 'POST',
    token: bizToken,
    body: { includeActivePending: true },
  });
  assert.equal(cleanup.status, 503);
  assert.equal(cleanup.data.code, 'storage_unavailable');
  assert.equal(pool.hasMediaAsset('asset-orphan'), true);
});

