import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { migrateLegacyProfileServices } from '../src/migrate-services.js';

const CLEANING_CAT_ID = '00000000-0000-4000-8000-000000000001';
const CLEANING_SUB_ID = '10000000-0000-4000-8000-000000000001';
const WEB_CAT_ID = '00000000-0000-4000-8000-000000000009';
const WEB_SUB_ID = '10000000-0000-4000-8000-000000000017';

function makeConfig(overrides = {}) {
  return {
    jwtSecret: 'test-secret-key-for-phase8-service-tests',
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

function createPhase8MockPool() {
  const users = new Map([
    ['pro-1', { id: 'pro-1', name: 'Priya Plumber' }],
    ['biz-1', { id: 'biz-1', name: 'Vinay Owner' }],
    ['cust-1', { id: 'cust-1', name: 'Casey Customer' }],
    ['admin-1', { id: 'admin-1', name: 'Mod Admin' }],
  ]);
  const userRoles = [
    { user_id: 'pro-1', role: 'professional', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
    { user_id: 'biz-1', role: 'business', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
    { user_id: 'cust-1', role: 'customer', is_primary: 1, profile_completion_status: 'complete', verification_status: 'not_required' },
    { user_id: 'admin-1', role: 'admin', is_primary: 1, profile_completion_status: 'complete', verification_status: 'verified' },
  ];
  const professionalProfiles = new Map([
    ['pro-1', {
      user_id: 'pro-1',
      listing_id: 'pro-1',
      profile: JSON.stringify({
        fullName: 'Priya Plumber',
        primaryCategory: 'Home services',
        services: 'Leak Fix, Tap Install',
        pricingType: 'Fixed',
        startingPrice: '750',
        city: 'Hyderabad',
      }),
    }],
  ]);
  const businessProfiles = new Map([
    ['biz-1', {
      user_id: 'biz-1',
      listing_id: 'biz-1',
      hiring_enabled: 0,
      profile: JSON.stringify({
        companyName: 'Sparkle Co',
        businessCategory: 'Software & tech',
        services: 'Full Stack Web',
        city: 'Bengaluru',
      }),
    }],
  ]);

  const serviceCategories = new Map([
    [CLEANING_CAT_ID, { id: CLEANING_CAT_ID, slug: 'home-cleaning', name: 'Home Cleaning', description: 'Cleaning', icon_ref: 'broom', image_url: null, is_active: 1, display_order: 1 }],
    [WEB_CAT_ID, { id: WEB_CAT_ID, slug: 'web-development', name: 'Web Development', description: 'Web', icon_ref: 'web', image_url: null, is_active: 1, display_order: 9 }],
  ]);
  const serviceSubcategories = new Map([
    [CLEANING_SUB_ID, { id: CLEANING_SUB_ID, category_id: CLEANING_CAT_ID, slug: 'deep-cleaning', name: 'Deep cleaning', description: '', is_active: 1, display_order: 1 }],
    [WEB_SUB_ID, { id: WEB_SUB_ID, category_id: WEB_CAT_ID, slug: 'website-development', name: 'Website development', description: '', is_active: 1, display_order: 1 }],
  ]);
  const categoryRules = new Map([
    [CLEANING_CAT_ID, {
      category_id: CLEANING_CAT_ID,
      requires_location: 1,
      supports_coverage_radius: 1,
      supports_duration: 1,
      supports_availability: 1,
      supports_booking_lead_time: 1,
      supports_packages: 1,
      allowed_delivery_methods: JSON.stringify(['customer_location', 'hybrid']),
      allowed_pricing_types: JSON.stringify(['fixed', 'hourly', 'per_visit', 'starting_from', 'quote_required', 'negotiable']),
      required_fields: JSON.stringify(['title', 'shortDescription', 'description', 'categoryId', 'pricingType', 'deliveryMethod', 'locations']),
      attributes: JSON.stringify([{ key: 'property_size', label: 'Property size', type: 'select', options: ['1 BHK', '2 BHK'] }]),
    }],
    [WEB_CAT_ID, {
      category_id: WEB_CAT_ID,
      requires_location: 0,
      supports_coverage_radius: 0,
      supports_duration: 1,
      supports_availability: 1,
      supports_booking_lead_time: 1,
      supports_packages: 1,
      allowed_delivery_methods: JSON.stringify(['online', 'remote', 'hybrid']),
      allowed_pricing_types: JSON.stringify(['fixed', 'hourly', 'starting_from', 'quote_required', 'negotiable']),
      required_fields: JSON.stringify(['title', 'shortDescription', 'description', 'categoryId', 'pricingType', 'deliveryMethod']),
      attributes: JSON.stringify([{ key: 'tech_stack', label: 'Tech stack', type: 'text' }]),
    }],
  ]);

  const services = new Map();
  const pricing = new Map();
  const locations = [];
  const availability = [];
  const tags = [];
  const listings = new Map();
  const serviceMedia = [];
  const listingMedia = [];
  const mediaAssets = new Map();
  const history = [];
  const migrationReports = [];
  const moderationPolicy = { requireReviewTypes: [], defaultVisibility: 'public' };

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT 1')) return [[{ result: 1 }]];
    if (s.startsWith('SELECT * FROM service_category_rules WHERE category_id = ?')) {
      const rule = categoryRules.get(params[0]);
      return [rule ? [rule] : []];
    }
    if (s.startsWith('SELECT * FROM service_category_rules')) {
      return [Array.from(categoryRules.values())];
    }
    if (s.startsWith('SELECT id, slug, name, description, icon_ref')) {
      if (s.includes('WHERE id = ?')) {
        const c = serviceCategories.get(params[0]);
        return [c ? [c] : []];
      }
      return [Array.from(serviceCategories.values())];
    }
    if (s.startsWith('SELECT id, category_id, slug, name, description')) {
      return [Array.from(serviceSubcategories.values()).filter((sub) => params.includes(sub.category_id))];
    }
    if (s.startsWith('SELECT id, slug, name, description, display_order FROM service_categories') || s.startsWith('SELECT id FROM service_categories')) {
      const c = serviceCategories.get(params[0]);
      return [c ? [c] : []];
    }
    if (s.startsWith('SELECT id FROM service_subcategories')) {
      const sub = serviceSubcategories.get(params[0]);
      return [sub && sub.category_id === params[1] ? [sub] : []];
    }
    if (s.startsWith('SELECT role, is_primary')) {
      return [userRoles.filter((r) => r.user_id === params[0])];
    }
    if (s.startsWith('SELECT role FROM user_roles')) {
      return [userRoles.filter((r) => r.user_id === params[0] && r.role === params[1])];
    }
    if (s.startsWith('SELECT user_id FROM professional_profiles')) {
      return [professionalProfiles.has(params[0]) ? [{ user_id: params[0] }] : []];
    }
    if (s.startsWith('SELECT user_id FROM business_profiles')) {
      return [businessProfiles.has(params[0]) ? [{ user_id: params[0] }] : []];
    }
    if (s.startsWith('SELECT pp.user_id, pp.profile FROM professional_profiles')) {
      return [Array.from(professionalProfiles.values())];
    }
    if (s.startsWith('SELECT bp.user_id, bp.profile FROM business_profiles')) {
      return [Array.from(businessProfiles.values())];
    }
    if (s.startsWith('SELECT setting_value FROM marketplace_settings')) {
      return [[{ setting_value: JSON.stringify(moderationPolicy) }]];
    }
    if (s.startsWith('SELECT id FROM services WHERE legacy_source_key = ?')) {
      const found = Array.from(services.values()).find((svc) => svc.legacy_source_key === params[0]);
      return [found ? [{ id: found.id }] : []];
    }
    if (s.startsWith('INSERT INTO services')) {
      if (params.length === 11) {
        const [id, provider_user_id, provider_role, category_id, slug, title, short_description, description, delivery_method, status, legacy_source_key] = params;
        services.set(id, {
          id, provider_user_id, provider_role, category_id, subcategory_id: null, slug, title, short_description, description, delivery_method,
          duration_value: null, duration_unit: null, inclusions: '[]', exclusions: '[]', customer_requirements: null, terms_and_conditions: null,
          booking_lead_time_hours: null, cancellation_policy: null, packages: '[]', addons: '[]', custom_attributes: '{}', booking_constraints: '{}',
          status, legacy_source_key, rating_avg: 0, review_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        return [{ affectedRows: 1 }];
      }
      if (params.length >= 22) {
        const [id, provider_user_id, provider_role, category_id, subcategory_id, slug, title, short_description, description, delivery_method, duration_value, duration_unit, inclusions, exclusions, customer_requirements, terms_and_conditions, booking_lead_time_hours, cancellation_policy, packages, addons, custom_attributes, booking_constraints, status] = params;
        services.set(id, {
          id, provider_user_id, provider_role, category_id, subcategory_id, slug, title, short_description, description, delivery_method,
          duration_value, duration_unit, inclusions, exclusions, customer_requirements, terms_and_conditions,
          booking_lead_time_hours, cancellation_policy, packages, addons, custom_attributes, booking_constraints,
          status, rating_avg: 0, review_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        return [{ affectedRows: 1 }];
      }
      const [id, provider_user_id, provider_role, category_id, subcategory_id, slug, title, short_description, description, delivery_method, duration_value, duration_unit, inclusions, exclusions, customer_requirements, terms_and_conditions, status] = params;
      services.set(id, {
        id, provider_user_id, provider_role, category_id, subcategory_id, slug, title, short_description, description, delivery_method,
        duration_value, duration_unit, inclusions, exclusions, customer_requirements, terms_and_conditions,
        booking_lead_time_hours: null, cancellation_policy: null, packages: '[]', addons: '[]', custom_attributes: '{}', booking_constraints: '{}',
        status, rating_avg: 0, review_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE services SET booking_lead_time_hours = ?')) {
      const id = params[6];
      const svc = services.get(id);
      if (svc) {
        [svc.booking_lead_time_hours, svc.cancellation_policy, svc.packages, svc.addons, svc.custom_attributes, svc.booking_constraints] = params.slice(0, 6);
      }
      return [{ affectedRows: svc ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE services SET category_id')) {
      const id = params[12];
      const svc = services.get(id);
      if (svc) {
        [svc.category_id, svc.subcategory_id, svc.title, svc.short_description, svc.description, svc.delivery_method, svc.duration_value, svc.duration_unit, svc.inclusions, svc.exclusions, svc.customer_requirements, svc.terms_and_conditions] = params.slice(0, 12);
      }
      return [{ affectedRows: svc ? 1 : 0 }];
    }
    if (s.startsWith('UPDATE services SET status = ?')) {
      const svc = services.get(params[1]);
      if (svc) svc.status = params[0];
      return [{ affectedRows: svc ? 1 : 0 }];
    }
    if (s.startsWith('INSERT INTO service_pricing')) {
      if (params.length === 4) {
        pricing.set(params[0], { service_id: params[0], pricing_type: params[1], amount: params[2], min_price: null, max_price: null, currency: params[3] });
      } else {
        pricing.set(params[0], { service_id: params[0], pricing_type: params[1], amount: params[2], min_price: params[3], max_price: params[4], currency: params[5] });
      }
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO service_locations')) {
      locations.push({ id: params[0], service_id: params[1], country: params[2], state: params[3], city: params[4], area: params[5], radius_km: params[6], is_primary: params[7] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO service_availability')) {
      availability.push({ id: params[0], service_id: params[1], day_of_week: params[2], start_time: params[3], end_time: params[4], is_unavailable: params[5] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO service_tags') || s.startsWith('INSERT IGNORE INTO service_tags')) {
      tags.push({ service_id: params[0], tag: params[1] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM service_pricing')) { pricing.delete(params[0]); return [{ affectedRows: 1 }]; }
    if (s.startsWith('DELETE FROM service_locations')) {
      for (let i = locations.length - 1; i >= 0; i--) if (locations[i].service_id === params[0]) locations.splice(i, 1);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM service_availability')) {
      for (let i = availability.length - 1; i >= 0; i--) if (availability[i].service_id === params[0]) availability.splice(i, 1);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('DELETE FROM service_tags')) {
      for (let i = tags.length - 1; i >= 0; i--) if (tags[i].service_id === params[0]) tags.splice(i, 1);
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO marketplace_listings')) {
      const [id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id, title, short_summary, description, location, visibility, status, is_public] = params;
      listings.set(id, {
        id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id, title, short_summary, description,
        location, visibility, status, is_public: is_public ? 1 : 0, moderation_status: 'not_required',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('UPDATE marketplace_listings SET status = ?')) {
      const item = listings.get(params[params.length - 1]);
      if (item) {
        item.status = params[0];
        item.is_public = params[0] === 'published' ? 1 : 0;
        if (params[0] === 'pending_review') item.moderation_status = 'pending';
        if (s.includes('moderated_by = ?')) {
          item.moderation_status = params[4] || item.moderation_status;
          item.moderation_reason = params[5];
        }
      }
      return [{ affectedRows: item ? 1 : 0 }];
    }
    if (s.startsWith('DELETE FROM listing_categories') || s.startsWith('INSERT IGNORE INTO listing_categories')) return [{ affectedRows: 1 }];
    if (s.startsWith('INSERT INTO listing_status_history')) {
      history.push({ id: params[0], listing_id: params[1], listing_type: params[2], from_status: params[3], to_status: params[4], reason: params[7] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('INSERT INTO migration_report')) {
      migrationReports.push({ old_reference: params[1], new_reference: params[2], action_taken: params[3] });
      return [{ affectedRows: 1 }];
    }
    if (s.startsWith('SELECT * FROM marketplace_listings WHERE id = ?')) {
      const item = listings.get(params[0]);
      return [item ? [item] : []];
    }
    if (s.startsWith('SELECT id, status, moderation_status, visibility, owner_role FROM marketplace_listings')) {
      const item = listings.get(params[0]);
      return [item && item.listing_type === 'service' && item.owner_user_id === params[1]
        ? [item]
        : []];
    }
    if (s.startsWith('SELECT id, listing_type FROM marketplace_listings')) {
      const item = listings.get(params[0]);
      return [item ? [{ id: item.id, listing_type: item.listing_type }] : []];
    }
    if (s.startsWith('SELECT id, provider_user_id, provider_role FROM services')) {
      const svc = services.get(params[0]);
      return [svc ? [svc] : []];
    }
    if (s.startsWith('SELECT s.* FROM services s WHERE s.id = ?')) {
      const svc = services.get(params[0]);
      return [svc && svc.status !== 'deleted' ? [svc] : []];
    }
    if (s.startsWith('SELECT status, COUNT(*) AS total FROM services')) {
      const ownerId = params[0];
      const map = new Map();
      for (const svc of services.values()) {
        if (svc.provider_user_id === ownerId && svc.status !== 'deleted') {
          map.set(svc.status, (map.get(svc.status) || 0) + 1);
        }
      }
      return [Array.from(map.entries()).map(([status, total]) => ({ status, total }))];
    }
    if (s.startsWith('SELECT service_id, pricing_type')) return [Array.from(pricing.values()).filter((p) => params.includes(p.service_id))];
    if (s.startsWith('SELECT service_id, day_of_week')) return [availability.filter((a) => params.includes(a.service_id))];
    if (s.startsWith('SELECT service_id, country')) return [locations.filter((l) => params.includes(l.service_id))];
    if (s.startsWith('SELECT service_id, tag')) return [tags.filter((t) => params.includes(t.service_id))];
    if (s.startsWith('SELECT sm.id, sm.service_id')) {
      return [serviceMedia.filter((m) => params.includes(m.service_id)).map((m) => ({ ...m, object_key: mediaAssets.get(m.media_asset_id)?.object_key }))];
    }
    if (s.startsWith('SELECT COUNT(*) AS total FROM service_media')) {
      return [[{ total: serviceMedia.filter((m) => m.service_id === params[0] && m.media_type === params[1]).length }]];
    }
    if (s.startsWith('SELECT id, object_key, content_type FROM media_assets')) {
      const a = mediaAssets.get(params[0]);
      return [a && a.user_id === params[1] && a.role === params[2] && a.purpose === params[3] ? [a] : []];
    }
    if (s.startsWith('INSERT INTO service_media')) {
      serviceMedia.push({ id: params[0], service_id: params[1], media_asset_id: params[2], media_type: params[3], display_order: params[4] });
      return [{ affectedRows: 1 }];
    }

    const filterServices = (stmt, p) => {
      let rows = Array.from(services.values());
      let idx = 0;
      if (stmt.includes('WHERE s.id = ?')) {
        const targetId = p[idx++];
        rows = rows.filter((r) => r.id === targetId);
        if (stmt.includes("s.status = 'published'")) {
          rows = rows.filter((r) => r.status === 'published' && listings.get(r.id)?.status === 'published' && Boolean(listings.get(r.id)?.is_public));
        }
      } else if (stmt.includes('WHERE s.provider_user_id = ?')) {
        const owner = p[idx++];
        rows = rows.filter((r) => r.provider_user_id === owner && r.status !== 'deleted');
        if (stmt.includes('provider_role = ?')) {
          const role = p[idx++];
          rows = rows.filter((r) => r.provider_role === role);
        }
        if (stmt.includes('status = ?')) {
          const status = p[idx++];
          rows = rows.filter((r) => r.status === status);
        }
      } else {
        rows = rows.filter((r) => r.status === 'published' && listings.get(r.id)?.status === 'published' && Boolean(listings.get(r.id)?.is_public));
        if (stmt.includes('s.category_id = ?')) {
          const catId = p[idx++];
          rows = rows.filter((r) => r.category_id === catId);
        }
        if (stmt.includes('s.subcategory_id = ?')) {
          const subId = p[idx++];
          rows = rows.filter((r) => r.subcategory_id === subId);
        }
        if (stmt.includes('sl.city LIKE ?')) {
          const cityPattern = p[idx++].replace(/%/g, '').toLowerCase();
          idx += 2;
          rows = rows.filter((r) => locations.some((location) =>
            location.service_id === r.id &&
            [location.city, location.state, location.area]
              .some((value) => String(value || '').toLowerCase().includes(cityPattern))
          ));
        }
        if (stmt.includes('p.pricing_type = ?')) {
          const pType = p[idx++];
          rows = rows.filter((r) => pricing.get(r.id)?.pricing_type === pType);
        }
        if (stmt.includes('s.delivery_method = ?')) {
          const dMethod = p[idx++];
          rows = rows.filter((r) => r.delivery_method === dMethod);
        }
        if (stmt.includes('s.provider_role = ?')) {
          const pRole = p[idx++];
          rows = rows.filter((r) => r.provider_role === pRole);
        }
        if (stmt.includes('sa.day_of_week = ?')) {
          const day = p[idx++];
          rows = rows.filter((r) => availability.some((a) => a.service_id === r.id && a.day_of_week === day && !a.is_unavailable));
        }
        if (stmt.includes('s.review_count > 0 AND s.rating_avg >= ?')) {
          const minR = p[idx++];
          rows = rows.filter((r) => r.review_count > 0 && r.rating_avg >= minR);
        }
      }
      return rows;
    };

    if (s.startsWith('SELECT COUNT(*) AS total FROM services')) {
      return [[{ total: filterServices(s, params).length }]];
    }
    if (s.startsWith('SELECT s.*')) {
      const found = filterServices(s, params).map((item) => ({
        ...item,
        pricing_type: pricing.get(item.id)?.pricing_type,
        amount: pricing.get(item.id)?.amount,
        min_price: pricing.get(item.id)?.min_price,
        max_price: pricing.get(item.id)?.max_price,
        currency: pricing.get(item.id)?.currency,
        category_name: serviceCategories.get(item.category_id)?.name || null,
        subcategory_name: serviceSubcategories.get(item.subcategory_id)?.name || null,
        provider_name: users.get(item.provider_user_id)?.name || null,
        provider_verified: 1,
        business_profile: businessProfiles.get(item.provider_user_id)?.profile || null,
        professional_profile: professionalProfiles.get(item.provider_user_id)?.profile || null,
      }));
      if (s.includes('LIMIT ? OFFSET ?')) {
        const limit = params[params.length - 2];
        const offset = params[params.length - 1];
        return [found.slice(offset, offset + limit)];
      }
      return [found];
    }

    // Hydration fallback for unified listing endpoints
    if (s.startsWith('SELECT lm.id, lm.listing_id')) return [[]];
    if (s.startsWith('SELECT sm.id, sm.service_id AS listing_id')) return [[]];
    if (s.startsWith('SELECT * FROM services WHERE id IN')) return [params.map((id) => services.get(id)).filter(Boolean)];
    if (s.startsWith('SELECT * FROM service_pricing WHERE service_id IN')) return [params.map((id) => pricing.get(id)).filter(Boolean)];
    if (s.startsWith('SELECT * FROM service_locations WHERE service_id IN')) return [locations.filter((l) => params.includes(l.service_id))];
    if (s.startsWith('SELECT * FROM service_availability WHERE service_id IN')) return [availability.filter((a) => params.includes(a.service_id))];
    if (s.startsWith('SELECT service_id, tag FROM service_tags WHERE service_id IN')) return [tags.filter((t) => params.includes(t.service_id))];
    if (s.startsWith('SELECT ml.*')) {
      const id = params[0];
      const l = listings.get(id);
      if (!l) return [[]];
      return [[{
        ...l,
        owner_name: users.get(l.owner_user_id)?.name || null,
        verification_status: 'verified',
        business_profile: businessProfiles.get(l.owner_user_id)?.profile || null,
        category_name: null,
        subcategory_name: null,
        service_category_name: serviceCategories.get(l.category_id)?.name || null,
        service_subcategory_name: serviceSubcategories.get(l.subcategory_id)?.name || null,
      }]];
    }

    throw new Error(`Unexpected mock SQL in Phase 8 test: ${s}`);
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
    setServiceRating(serviceId, ratingAvg, reviewCount) {
      const svc = services.get(serviceId);
      if (svc) {
        svc.rating_avg = ratingAvg;
        svc.review_count = reviewCount;
      }
    },
    getMigrationReports() {
      return migrationReports;
    },
    getServiceCount() {
      return services.size;
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
  return { status: res.status, data: await res.json() };
}

test('Phase 8 service creation rules, professional vs business identity, filters, booking readiness, and legacy migration', async (t) => {
  const config = makeConfig();
  const pool = createPhase8MockPool();
  const server = await startServer(pool, config);
  t.after(server.close);

  const proToken = makeToken('pro-1', config);
  const bizToken = makeToken('biz-1', config);
  const custToken = makeToken('cust-1', config);
  const adminToken = makeToken('admin-1', config);

  // 1. Legacy profile service migration creates real draft service records idempotently
  const mig1 = await migrateLegacyProfileServices(pool);
  assert.equal(mig1.migratedCount, 3); // 2 pro + 1 biz
  const mig2 = await migrateLegacyProfileServices(pool);
  assert.equal(mig2.migratedCount, 0);
  assert.equal(mig2.skippedCount, 3);
  assert.equal(pool.getMigrationReports().length, 3);

  // Draft migrated services do NOT appear in customer discovery
  const initialDisc = await api(server.url, '/api/v1/services');
  assert.equal(initialDisc.data.services.length, 0);

  // 2. Category rules & attributes are returned from backend
  const cats = await api(server.url, '/api/v1/services/categories');
  assert.equal(cats.status, 200);
  const cleaningCat = cats.data.categories.find((c) => c.id === CLEANING_CAT_ID);
  assert.equal(cleaningCat.rules.requiresLocation, true);
  assert.equal(cleaningCat.attributes[0].key, 'property_size');

  const webAttrs = await api(server.url, `/api/v1/services/categories/${WEB_CAT_ID}/attributes`);
  assert.equal(webAttrs.status, 200);
  assert.equal(webAttrs.data.rules.requiresLocation, false);

  const invalidUnifiedService = await api(server.url, '/api/v1/listings', {
    method: 'POST',
    token: proToken,
    body: {
      listingType: 'service',
      ownerRole: 'professional',
      categoryId: WEB_CAT_ID,
      title: 'Invalid remote-category service',
      shortSummary: 'A service with an unsupported delivery method',
      description: 'The service category only allows remote or online delivery.',
      deliveryMethod: 'customer_location',
      pricingType: 'fixed',
      price: 500,
      currency: 'INR',
      status: 'pending_review',
    },
  });
  assert.equal(invalidUnifiedService.status, 400);
  assert.equal(invalidUnifiedService.data.code, 'invalid_delivery_method');

  // 3. Customer cannot create a service
  const custAttempt = await api(server.url, '/api/v1/services', {
    method: 'POST',
    token: custToken,
    body: {
      providerRole: 'professional',
      categoryId: CLEANING_CAT_ID,
      title: 'Unauthorized',
      shortDescription: 'X',
      description: 'X',
      deliveryMethod: 'customer_location',
      pricingType: 'fixed',
      price: 500,
      currency: 'INR',
      locations: [{ city: 'Hyderabad' }],
    },
  });
  assert.equal(custAttempt.status, 403);

  // 4. Category rules enforce location on Home Cleaning when publishing, and block invalid delivery method
  const missingLoc = await api(server.url, '/api/v1/services', {
    method: 'POST',
    token: proToken,
    body: {
      providerRole: 'professional',
      categoryId: CLEANING_CAT_ID,
      subcategoryId: CLEANING_SUB_ID,
      title: 'Deep Home Clean',
      shortDescription: 'Sparkling home clean',
      description: 'Full home cleaning service',
      deliveryMethod: 'customer_location',
      pricingType: 'per_visit',
      price: 1800,
      currency: 'INR',
      status: 'published',
    },
  });
  assert.equal(missingLoc.status, 400);
  assert.equal(missingLoc.data.code, 'location_required');

  const malformedServiceDetails = await api(server.url, '/api/v1/services', {
    method: 'POST',
    token: proToken,
    body: {
      providerRole: 'professional',
      categoryId: CLEANING_CAT_ID,
      title: 'Malformed package data',
      shortDescription: 'Invalid package payload',
      description: 'Package details must use the expected list shape.',
      deliveryMethod: 'customer_location',
      pricingType: 'fixed',
      price: 500,
      currency: 'INR',
      locations: [{ city: 'Hyderabad' }],
      packages: {},
      status: 'draft',
    },
  });
  assert.equal(malformedServiceDetails.status, 400);

  const invalidAttributeDraft = await api(server.url, '/api/v1/services', {
    method: 'POST',
    token: proToken,
    body: {
      providerRole: 'professional',
      categoryId: CLEANING_CAT_ID,
      title: 'Invalid attribute draft',
      shortDescription: 'Test category attributes',
      description: 'This draft has a custom attribute that is not configured for the category.',
      deliveryMethod: 'customer_location',
      pricingType: 'fixed',
      price: 500,
      currency: 'INR',
      locations: [{ city: 'Hyderabad' }],
      customAttributes: { unknown_attribute: 'not supported' },
      status: 'draft',
    },
  });
  assert.equal(invalidAttributeDraft.status, 201);
  const invalidAttributePublish = await api(
    server.url,
    `/api/v1/services/${invalidAttributeDraft.data.service.id}/status`,
    { method: 'PATCH', token: proToken, body: { status: 'published' } }
  );
  assert.equal(invalidAttributePublish.status, 400);
  assert.equal(invalidAttributePublish.data.code, 'invalid_service_attribute');

  // 5. Professional creates published service with Phase 8 fields & booking readiness
  const proSvc = await api(server.url, '/api/v1/services', {
    method: 'POST',
    token: proToken,
    body: {
      providerRole: 'professional',
      categoryId: CLEANING_CAT_ID,
      subcategoryId: CLEANING_SUB_ID,
      title: 'Deep Home Clean',
      shortDescription: 'Sparkling home clean',
      description: 'Full home cleaning service',
      deliveryMethod: 'customer_location',
      pricingType: 'per_visit',
      price: 1800,
      currency: 'INR',
      durationValue: 3,
      durationUnit: 'hours',
      bookingLeadTimeHours: 12,
      cancellationPolicy: 'Free cancellation 12h prior',
      packages: [{ name: '2 BHK Package', price: 1800, description: 'Full 2 BHK' }],
      customAttributes: { property_size: '2 BHK' },
      locations: [{ city: 'Hyderabad', area: 'Madhapur', radiusKm: 10 }],
      availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
      status: 'published',
    },
  });
  assert.equal(proSvc.status, 201);
  assert.equal(proSvc.data.service.providerRole, 'professional');
  assert.equal(proSvc.data.service.providerName, 'Priya Plumber');
  assert.equal(proSvc.data.service.businessName, null);
  assert.equal(proSvc.data.service.bookingReadiness.bookingLeadTimeHours, 12);
  assert.equal(proSvc.data.service.bookingReadiness.bookingEnabled, false);
  assert.equal(proSvc.data.service.bookingReadiness.pricingType, 'per_visit');

  // 6. Business creates remote Web Development service with quote_required (no city forced!)
  const bizSvc1 = await api(server.url, '/api/v1/services', {
    method: 'POST',
    token: bizToken,
    body: {
      providerRole: 'business',
      categoryId: WEB_CAT_ID,
      subcategoryId: WEB_SUB_ID,
      title: 'Custom Web App',
      shortDescription: 'End-to-end web engineering',
      description: 'React & Node web application delivery',
      deliveryMethod: 'remote',
      pricingType: 'quote_required',
      currency: 'INR',
      availability: [{ dayOfWeek: 3, startTime: '10:00', endTime: '18:00' }],
      status: 'published',
    },
  });
  assert.equal(bizSvc1.status, 201);
  assert.equal(bizSvc1.data.service.providerRole, 'business');
  assert.equal(bizSvc1.data.service.businessName, 'Sparkle Co');
  assert.equal(bizSvc1.data.service.pricingType, 'quote_required');

  // Business creates second service (multiple services per business!)
  const bizSvc2 = await api(server.url, '/api/v1/services', {
    method: 'POST',
    token: bizToken,
    body: {
      providerRole: 'business',
      categoryId: WEB_CAT_ID,
      title: 'SEO Audit',
      shortDescription: 'Full technical SEO check',
      description: 'Detailed SEO audit report',
      deliveryMethod: 'online',
      pricingType: 'fixed',
      price: 4500,
      currency: 'INR',
      status: 'draft',
    },
  });
  assert.equal(bizSvc2.status, 201);
  assert.equal(bizSvc2.data.service.status, 'draft');

  // 7. Customer discovery filters: providerRole, availableDay, pricingType, minRating (genuine ratings only)
  const onlyPro = await api(server.url, '/api/v1/services?providerRole=professional');
  assert.equal(onlyPro.data.services.length, 1);
  assert.equal(onlyPro.data.services[0].id, proSvc.data.service.id);

  const cleaningOnly = await api(server.url, `/api/v1/services?categoryId=${CLEANING_CAT_ID}`);
  assert.equal(cleaningOnly.data.services.length, 1);
  assert.equal(cleaningOnly.data.services[0].id, proSvc.data.service.id);

  const hyderabadOnly = await api(server.url, '/api/v1/services?location=Hyderabad');
  assert.equal(hyderabadOnly.data.services.length, 1);
  assert.equal(hyderabadOnly.data.services[0].id, proSvc.data.service.id);

  const serviceDetail = await api(server.url, `/api/v1/services/${proSvc.data.service.id}`);
  assert.equal(serviceDetail.status, 200);
  assert.equal(serviceDetail.data.service.providerRole, 'professional');
  assert.equal(serviceDetail.data.service.categoryName, 'Home Cleaning');
  assert.equal(serviceDetail.data.service.bookingReadiness.durationValue, 3);

  const onlyBiz = await api(server.url, '/api/v1/services?providerRole=business');
  assert.equal(onlyBiz.data.services.length, 1);
  assert.equal(onlyBiz.data.services[0].id, bizSvc1.data.service.id);

  const monAvail = await api(server.url, '/api/v1/services?availableDay=1');
  assert.equal(monAvail.data.services.length, 1);
  assert.equal(monAvail.data.services[0].id, proSvc.data.service.id);

  const quoteFilter = await api(server.url, '/api/v1/services?pricingType=quote_required');
  assert.equal(quoteFilter.data.services.length, 1);

  // Genuine rating filter returns 0 before any real reviews exist
  assert.equal((await api(server.url, '/api/v1/services?minRating=4')).data.services.length, 0);
  pool.setServiceRating(proSvc.data.service.id, 4.8, 12);
  assert.equal((await api(server.url, '/api/v1/services?minRating=4')).data.services.length, 1);

  // 8. Unauthorized edit denied & pause/moderate hides from public discovery
  const unauthEdit = await api(server.url, `/api/v1/services/${proSvc.data.service.id}`, {
    method: 'PUT',
    token: bizToken,
    body: {
      categoryId: CLEANING_CAT_ID,
      title: 'Stolen',
      shortDescription: 'X',
      description: 'X',
      deliveryMethod: 'customer_location',
      pricingType: 'fixed',
      price: 100,
      currency: 'INR',
    },
  });
  assert.equal(unauthEdit.status, 403);

  const rejectSvc = await api(server.url, `/api/v1/listings/${proSvc.data.service.id}/moderate`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'reject', reason: 'Add before/after photos' },
  });
  assert.equal(rejectSvc.status, 200);
  assert.equal((await api(server.url, `/api/v1/services/${proSvc.data.service.id}`)).status, 404);

  // 9. Media attach scoped to provider & service
  pool.addMediaAsset({
    id: 'svc-img-1',
    user_id: 'biz-1',
    role: 'business',
    purpose: 'service-image',
    object_key: 'biz-1/business/seo.jpg',
    content_type: 'image/jpeg',
    byte_size: 42000,
  });
  const mediaAttach = await api(server.url, `/api/v1/services/${bizSvc1.data.service.id}/media`, {
    method: 'POST',
    token: bizToken,
    body: { mediaAssetId: 'svc-img-1', mediaType: 'image' },
  });
  assert.equal(mediaAttach.status, 201);
});
