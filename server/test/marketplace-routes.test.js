import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const CATEGORY_ID = '00000000-0000-4000-8000-000000000001';
const SUBCATEGORY_ID = '10000000-0000-4000-8000-000000000001';

function makeTestConfig() {
  return {
    jwtSecret: 'test-secret-key-for-marketplace-tests',
    jwtIssuer: 'konnectx-test',
    jwtAudience: 'konnectx-app',
    corsOrigins: [],
    uploadUrlTtlSeconds: 300,
    maxUploadBytes: 25000000,
    email: { provider: 'console' },
    b2: {},
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

function createMockPool() {
  const categories = [{
    id: CATEGORY_ID,
    slug: 'home-cleaning',
    name: 'Home Cleaning',
    description: 'Cleaning services',
    icon_ref: 'broom',
    image_url: null,
    is_active: 1,
    display_order: 1,
  }];
  const subcategories = [{
    id: SUBCATEGORY_ID,
    category_id: CATEGORY_ID,
    slug: 'deep-cleaning',
    name: 'Deep cleaning',
    description: '',
    is_active: 1,
    display_order: 1,
  }];
  const serviceCategoryRule = {
    category_id: CATEGORY_ID,
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
  const roles = new Set([
    'pro-1:professional',
    'biz-1:business',
  ]);
  const profiles = new Set(['pro-1:professional', 'biz-1:business']);
  const services = new Map();
  const marketplaceListings = new Map();
  const statusHistory = [];
  const pricing = new Map();
  const availability = [];
  const locations = [];
  const tags = [];
  const serviceMedia = [];
  const mediaAssets = new Map();

  async function query(sql, params = []) {
    const statement = sql.replace(/\s+/g, ' ').trim();

    if (statement.startsWith('SELECT 1')) return [[{ result: 1 }]];
    if (statement.startsWith('SELECT setting_value FROM marketplace_settings')) {
      return [[{ setting_value: JSON.stringify({ requireReviewTypes: [], defaultVisibility: 'public' }) }]];
    }
    if (statement.startsWith('SELECT * FROM service_category_rules WHERE category_id = ?')) {
      return [params[0] === CATEGORY_ID ? [serviceCategoryRule] : []];
    }
    if (statement.startsWith('SELECT * FROM service_category_rules')) {
      return [[serviceCategoryRule]];
    }
    if (statement.startsWith('INSERT INTO marketplace_listings')) {
      const [
        id, listing_type, entity_id, owner_user_id, owner_role,
        category_id, subcategory_id, title, short_summary, description,
        location, visibility, status, is_public, published_at, archived_at,
        submitted_for_review_at, moderation_status, moderation_reason, moderated_by, moderated_at,
      ] = params;
      marketplaceListings.set(id, {
        id,
        listing_type,
        entity_id,
        owner_user_id,
        owner_role,
        category_id,
        subcategory_id,
        title,
        short_summary,
        description,
        location,
        visibility,
        status,
        is_public,
        published_at,
        archived_at,
        submitted_for_review_at,
        moderation_status,
        moderation_reason,
        moderated_by,
        moderated_at,
      });
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('UPDATE marketplace_listings SET status')) {
      const listing = marketplaceListings.get(params[5]);
      if (listing) {
        listing.status = params[0];
        listing.is_public = params[0] === 'published' && (params[2] || listing.visibility) === 'public';
        if (params[2]) listing.visibility = params[2];
      }
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('SELECT * FROM marketplace_listings')) {
      const listing = marketplaceListings.get(params[0]);
      return [listing && listing.listing_type === 'service' && listing.owner_user_id === params[1]
        ? [listing]
        : []];
    }
    if (statement.startsWith('SELECT id, status, moderation_status, visibility, owner_role FROM marketplace_listings')) {
      const listing = marketplaceListings.get(params[0]);
      return [listing && listing.listing_type === 'service' && listing.owner_user_id === params[1]
        ? [listing]
        : []];
    }
    if (statement.startsWith('INSERT INTO listing_status_history')) {
      statusHistory.push(params);
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('SELECT id, slug, name, description, icon_ref')) {
      if (statement.includes('WHERE id = ?')) {
        return [categories.filter((item) => item.id === params[0] && item.is_active)];
      }
      return [categories.filter((item) => item.is_active)];
    }
    if (statement.startsWith('SELECT id, category_id, slug, name, description')) {
      if (statement.includes('category_id IN')) {
        return [subcategories.filter((item) => params.includes(item.category_id) && item.is_active)];
      }
      return [subcategories.filter((item) => item.category_id === params[0] && item.is_active)];
    }
    if (statement.startsWith('SELECT id FROM service_categories')) {
      return [categories.filter((item) => item.id === params[0] && item.is_active)];
    }
    if (statement.startsWith('SELECT id FROM service_subcategories')) {
      return [subcategories.filter(
        (item) => item.id === params[0] && item.category_id === params[1] && item.is_active
      )];
    }
    if (statement.startsWith('SELECT role FROM user_roles')) {
      return [roles.has(`${params[0]}:${params[1]}`) ? [{ role: params[1] }] : []];
    }
    if (statement.startsWith('SELECT user_id FROM professional_profiles')) {
      return [profiles.has(`${params[0]}:professional`) ? [{ user_id: params[0] }] : []];
    }
    if (statement.startsWith('SELECT user_id FROM business_profiles')) {
      return [profiles.has(`${params[0]}:business`) ? [{ user_id: params[0] }] : []];
    }
    if (statement.startsWith('INSERT INTO services')) {
      const [
        id, provider_user_id, provider_role, category_id, subcategory_id,
        slug, title, short_description, description, delivery_method,
        duration_value, duration_unit, inclusions, exclusions,
        customer_requirements, terms_and_conditions, status,
      ] = params;
      services.set(id, {
        id,
        provider_user_id,
        provider_role,
        category_id,
        subcategory_id,
        slug,
        title,
        short_description,
        description,
        delivery_method,
        duration_value,
        duration_unit,
        inclusions,
        exclusions,
        customer_requirements,
        terms_and_conditions,
        status,
        rating_avg: 0,
        review_count: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('INSERT INTO service_pricing')) {
      pricing.set(params[0], {
        service_id: params[0],
        pricing_type: params[1],
        amount: params[2],
        min_price: params[3],
        max_price: params[4],
        currency: params[5],
      });
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('INSERT INTO service_availability')) {
      availability.push({
        id: params[0],
        service_id: params[1],
        day_of_week: params[2],
        start_time: params[3],
        end_time: params[4],
        is_unavailable: params[5],
      });
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('INSERT INTO service_locations')) {
      locations.push({
        id: params[0],
        service_id: params[1],
        country: params[2],
        state: params[3],
        city: params[4],
        area: params[5],
        radius_km: params[6],
        is_primary: params[7],
      });
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('INSERT INTO service_tags')) {
      tags.push({ service_id: params[0], tag: params[1] });
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('SELECT service_id, pricing_type')) {
      return [Array.from(pricing.values()).filter((item) => params.includes(item.service_id))];
    }
    if (statement.startsWith('SELECT service_id, day_of_week')) {
      return [availability.filter((item) => params.includes(item.service_id))];
    }
    if (statement.startsWith('SELECT service_id, country')) {
      return [locations.filter((item) => params.includes(item.service_id))];
    }
    if (statement.startsWith('SELECT service_id, tag')) {
      return [tags.filter((item) => params.includes(item.service_id))];
    }
    if (statement.startsWith('SELECT sm.id, sm.service_id')) {
      return [serviceMedia
        .filter((item) => params.includes(item.service_id))
        .map((item) => ({
          ...item,
          object_key: mediaAssets.get(item.media_asset_id)?.object_key,
        }))];
    }
    if (statement.startsWith('SELECT COUNT(*) AS total FROM services')) {
      let found = Array.from(services.values());
      if (statement.includes('provider_user_id = ?')) {
        found = found.filter((item) => item.provider_user_id === params[0]);
        if (statement.includes('provider_role = ?')) {
          found = found.filter((item) => item.provider_role === params[1]);
        }
      } else {
        found = found.filter((item) => item.status === 'published');
      }
      if (statement.includes('marketplace_listings ml')) {
        found = found.filter((item) => {
          const listing = marketplaceListings.get(item.id);
          return listing?.status === 'published' && listing.is_public && listing.visibility === 'public';
        });
      }
      if (statement.includes("status != 'deleted'")) {
        found = found.filter((item) => item.status !== 'deleted');
      }
      if (statement.includes('AND s.status = ?')) {
        found = found.filter((item) => item.status === params[params.length - 1]);
      }
      return [[{ total: found.length }]];
    }
    if (statement.startsWith('SELECT COUNT(*) AS total FROM service_media')) {
      const found = serviceMedia.filter(
        (item) => item.service_id === params[0] && item.media_type === params[1]
      );
      return [[{ total: found.length }]];
    }
    if (statement.startsWith('SELECT s.* FROM services s WHERE s.id = ?')) {
      const service = services.get(params[0]);
      return [service && service.status !== 'deleted' ? [service] : []];
    }
    if (statement.startsWith('SELECT id FROM services WHERE id = ?')) {
      return [services.has(params[0]) ? [{ id: params[0] }] : []];
    }
    if (statement.startsWith('SELECT s.*')) {
      let found = Array.from(services.values()).map((item) => ({
        ...item,
        pricing_type: pricing.get(item.id)?.pricing_type,
        amount: pricing.get(item.id)?.amount,
        min_price: pricing.get(item.id)?.min_price,
        max_price: pricing.get(item.id)?.max_price,
        currency: pricing.get(item.id)?.currency,
        category_name: categories.find((category) => category.id === item.category_id)?.name,
        subcategory_name: subcategories.find((category) => category.id === item.subcategory_id)?.name,
        provider_name: item.provider_user_id === 'pro-1' ? 'Test Professional' : 'Test Business',
        provider_verified: 0,
        business_profile: null,
        professional_profile: null,
      }));
      if (statement.includes('WHERE s.id = ?')) {
        found = found.filter((item) => item.id === params[0]);
        if (statement.includes("s.status = 'published'")) {
          found = found.filter((item) => item.status === 'published');
        }
      } else if (statement.includes('WHERE s.provider_user_id = ?')) {
        found = found.filter((item) => item.provider_user_id === params[0]);
        if (statement.includes('s.provider_role = ?')) {
          found = found.filter((item) => item.provider_role === params[1]);
        }
        if (statement.includes('s.status = ?')) {
          found = found.filter((item) => item.status === params[params.length - 3]);
        }
      } else {
        found = found.filter((item) => item.status === 'published');
      }
      if (statement.includes('marketplace_listings ml')) {
        found = found.filter((item) => {
          const listing = marketplaceListings.get(item.id);
          return listing?.status === 'published' && listing.is_public && listing.visibility === 'public';
        });
      }
      const limit = params[params.length - 2];
      const offset = params[params.length - 1];
      if (Number.isInteger(limit) && Number.isInteger(offset)) {
        found = found.slice(offset, offset + limit);
      }
      return [found];
    }
    if (statement.startsWith('SELECT id, object_key, content_type FROM media_assets')) {
      const asset = mediaAssets.get(params[0]);
      return [asset &&
        asset.user_id === params[1] &&
        asset.role === params[2] &&
        asset.purpose === params[3]
        ? [asset]
        : []];
    }
    if (statement.startsWith('SELECT id, provider_user_id, provider_role FROM services')) {
      const item = services.get(params[0]);
      return [item && item.status !== 'deleted' ? [item] : []];
    }
    if (statement.startsWith('INSERT INTO service_media')) {
      if (serviceMedia.some((item) => item.media_asset_id === params[2])) {
        const error = new Error('Duplicate media asset');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      serviceMedia.push({
        id: params[0],
        service_id: params[1],
        media_asset_id: params[2],
        media_type: params[3],
        display_order: params[4],
      });
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('UPDATE services SET status = ?')) {
      const service = services.get(params[1]);
      if (!service || service.provider_user_id !== params[2] || service.status === 'deleted') {
        return [{ affectedRows: 0 }];
      }
      service.status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith("UPDATE services SET status = 'deleted'")) {
      const service = services.get(params[0]);
      if (!service || service.provider_user_id !== params[1] || service.status === 'deleted') {
        return [{ affectedRows: 0 }];
      }
      service.status = 'deleted';
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('UPDATE services SET category_id')) {
      const serviceId = params[params.length - 2];
      const service = services.get(serviceId);
      if (service) {
        [
          service.category_id,
          service.subcategory_id,
          service.title,
          service.short_description,
          service.description,
          service.delivery_method,
          service.duration_value,
          service.duration_unit,
          service.inclusions,
          service.exclusions,
          service.customer_requirements,
          service.terms_and_conditions,
        ] = params.slice(0, 12);
      }
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('DELETE FROM service_pricing')) {
      pricing.delete(params[0]);
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('DELETE FROM service_availability')) {
      for (let index = availability.length - 1; index >= 0; index -= 1) {
        if (availability[index].service_id === params[0]) availability.splice(index, 1);
      }
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('DELETE FROM service_locations')) {
      for (let index = locations.length - 1; index >= 0; index -= 1) {
        if (locations[index].service_id === params[0]) locations.splice(index, 1);
      }
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('DELETE FROM service_tags')) {
      for (let index = tags.length - 1; index >= 0; index -= 1) {
        if (tags[index].service_id === params[0]) tags.splice(index, 1);
      }
      return [{ affectedRows: 1 }];
    }
    if (statement.startsWith('SELECT sm.id, sm.media_asset_id')) {
      const media = serviceMedia.find((item) =>
        item.id === params[0] && item.service_id === params[1]
      );
      const service = services.get(params[1]);
      const asset = media ? mediaAssets.get(media.media_asset_id) : null;
      return [media && service?.provider_user_id === params[2] && asset
        ? [{ id: media.id, media_asset_id: media.media_asset_id, object_key: asset.object_key }]
        : []];
    }
    if (statement.startsWith('DELETE FROM service_media WHERE id = ?')) {
      const index = serviceMedia.findIndex((item) => item.id === params[0]);
      if (index >= 0) serviceMedia.splice(index, 1);
      return [{ affectedRows: index >= 0 ? 1 : 0 }];
    }
    if (statement.startsWith('DELETE FROM media_assets WHERE id = ?')) {
      const asset = mediaAssets.get(params[0]);
      if (asset?.user_id === params[1]) mediaAssets.delete(params[0]);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected mock SQL: ${statement}`);
  }

  return {
    query,
    async getConnection() {
      return {
        query,
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
      };
    },
    addMediaAsset(asset) {
      mediaAssets.set(asset.id, asset);
    },
    setListingVisibility(id, visibility) {
      const listing = marketplaceListings.get(id);
      if (listing) listing.visibility = visibility;
    },
    getListing(id) {
      return marketplaceListings.get(id);
    },
    getStatusHistory() {
      return statusHistory;
    },
  };
}

function servicePayload(overrides = {}) {
  return {
    providerRole: 'professional',
    categoryId: CATEGORY_ID,
    subcategoryId: SUBCATEGORY_ID,
    title: 'Home deep cleaning',
    shortDescription: 'Detailed home cleaning service.',
    description: 'A complete deep cleaning service for your home.',
    deliveryMethod: 'customer_location',
    pricingType: 'fixed',
    price: 2500,
    currency: 'INR',
    durationValue: 3,
    durationUnit: 'hours',
    tags: ['deep clean', 'home'],
    inclusions: ['Cleaning materials'],
    exclusions: ['Wall painting'],
    locations: [{ city: 'Hyderabad', state: 'Telangana', area: 'Madhapur' }],
    availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
    status: 'draft',
    ...overrides,
  };
}

test('professional and business discovery reject invalid section filters', async (t) => {
  const config = makeTestConfig();
  const server = await startTestServer(createMockPool(), config);
  t.after(server.close);

  const invalidProfessionalRange = await fetch(
    `${server.url}/api/v1/marketplace/professionals?minExperience=8&maxExperience=3`
  );
  assert.equal(invalidProfessionalRange.status, 400);
  assert.equal((await invalidProfessionalRange.json()).code, 'invalid_filter');

  const invalidProfessionalSort = await fetch(
    `${server.url}/api/v1/marketplace/professionals?sort=rating_desc`
  );
  assert.equal(invalidProfessionalSort.status, 400);
  assert.equal((await invalidProfessionalSort.json()).code, 'invalid_filter');

  const invalidBusinessSort = await fetch(
    `${server.url}/api/v1/marketplace/businesses?sort=experience_desc`
  );
  assert.equal(invalidBusinessSort.status, 400);
  assert.equal((await invalidBusinessSort.json()).code, 'invalid_filter');
});

async function startTestServer(pool, config) {
  const app = createApp({ pool, config });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test('marketplace categories and provider services persist with ownership checks', async (t) => {
  const config = makeTestConfig();
  const pool = createMockPool();
  const server = await startTestServer(pool, config);
  t.after(server.close);
  const professionalToken = makeToken('pro-1', config);
  const otherToken = makeToken('other-user', config);

  const categoryResponse = await fetch(`${server.url}/api/v1/services/categories`);
  const categoryBody = await categoryResponse.json();
  assert.equal(categoryResponse.status, 200);
  assert.equal(categoryBody.categories[0].name, 'Home Cleaning');
  assert.equal(categoryBody.categories[0].subcategories[0].id, SUBCATEGORY_ID);

  const unauthorizedCreate = await fetch(`${server.url}/api/v1/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(servicePayload()),
  });
  assert.equal(unauthorizedCreate.status, 401);

  const createResponse = await fetch(`${server.url}/api/v1/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${professionalToken}`,
    },
    body: JSON.stringify(servicePayload()),
  });
  assert.equal(createResponse.status, 201);
  const { service: created } = await createResponse.json();
  assert.equal(created.status, 'draft');
  assert.equal(created.price, 2500);
  assert.equal(created.inclusions[0], 'Cleaning materials');
  assert.equal(created.availability[0].dayOfWeek, 1);
  assert.equal(created.locations[0].city, 'Hyderabad');

  const draftDiscovery = await fetch(`${server.url}/api/v1/services`);
  assert.equal((await draftDiscovery.json()).services.length, 0);

  const myServicesResponse = await fetch(`${server.url}/api/v1/services/my-services?role=professional`, {
    headers: { Authorization: `Bearer ${professionalToken}` },
  });
  assert.equal((await myServicesResponse.json()).services.length, 1);

  const unauthorizedEdit = await fetch(`${server.url}/api/v1/services/${created.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${otherToken}`,
    },
    body: JSON.stringify(servicePayload()),
  });
  assert.equal(unauthorizedEdit.status, 403);

  const statusOnEditResponse = await fetch(`${server.url}/api/v1/services/${created.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${professionalToken}`,
    },
    body: JSON.stringify(servicePayload({ status: 'published' })),
  });
  assert.equal(statusOnEditResponse.status, 409);

  const publishResponse = await fetch(`${server.url}/api/v1/services/${created.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${professionalToken}`,
    },
    body: JSON.stringify({ status: 'published' }),
  });
  assert.equal(publishResponse.status, 200);

  const discoveryResponse = await fetch(`${server.url}/api/v1/services?categoryId=${CATEGORY_ID}&sort=price_asc`);
  const discovery = await discoveryResponse.json();
  assert.equal(discovery.services.length, 1);
  assert.equal(discovery.services[0].providerName, 'Test Professional');
  assert.equal(discovery.pagination.total, 1);

  const detailResponse = await fetch(`${server.url}/api/v1/services/${created.id}`);
  const detail = await detailResponse.json();
  assert.equal(detail.service.categoryName, 'Home Cleaning');
  assert.equal(detail.service.subcategoryName, 'Deep cleaning');

  const providerResponse = await fetch(`${server.url}/api/v1/professionals/pro-1/services`);
  assert.equal((await providerResponse.json()).services.length, 1);
  assert.equal(pool.getStatusHistory().length, 1);

  pool.setListingVisibility(created.id, 'private');
  const editResponse = await fetch(`${server.url}/api/v1/services/${created.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${professionalToken}`,
    },
    body: JSON.stringify(servicePayload({
      title: 'Updated deep cleaning',
      shortDescription: 'Updated short description.',
      status: undefined,
    })),
  });
  assert.equal(editResponse.status, 200);
  assert.equal((await editResponse.json()).service.title, 'Updated deep cleaning');
  assert.equal(pool.getListing(created.id).status, 'published');
  assert.equal(pool.getListing(created.id).visibility, 'private');
  assert.equal(pool.getListing(created.id).is_public, false);
  const hiddenAfterEdit = await fetch(`${server.url}/api/v1/services`);
  assert.equal((await hiddenAfterEdit.json()).services.length, 0);

  const deleteResponse = await fetch(`${server.url}/api/v1/services/${created.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${professionalToken}` },
  });
  assert.equal(deleteResponse.status, 200);
  assert.equal((await (await fetch(`${server.url}/api/v1/services`)).json()).services.length, 0);
  const resurrectDeletedResponse = await fetch(`${server.url}/api/v1/services/${created.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${professionalToken}`,
    },
    body: JSON.stringify({ status: 'published' }),
  });
  assert.equal(resurrectDeletedResponse.status, 409);
});

test('marketplace validates service fields and does not permit ordinary category writes', async (t) => {
  const config = makeTestConfig();
  const pool = createMockPool();
  const server = await startTestServer(pool, config);
  t.after(server.close);
  const token = makeToken('pro-1', config);

  const invalidPrice = await fetch(`${server.url}/api/v1/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(servicePayload({ minPrice: 3000, maxPrice: 2000 })),
  });
  assert.equal(invalidPrice.status, 400);

  const invalidSubcategory = await fetch(`${server.url}/api/v1/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(servicePayload({ subcategoryId: 'other-subcategory' })),
  });
  assert.equal(invalidSubcategory.status, 400);

  for (const invalidFields of [
    { packages: {} },
    { addons: {} },
    { customAttributes: [] },
    { bookingConstraints: [] },
  ]) {
    const invalidServiceDetails = await fetch(`${server.url}/api/v1/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(servicePayload(invalidFields)),
    });
    assert.equal(invalidServiceDetails.status, 400);
  }

  const categoryWrite = await fetch(`${server.url}/api/v1/services/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Unauthorized category' }),
  });
  assert.equal(categoryWrite.status, 404);
});

test('service media attachment is scoped to the owning provider and service', async (t) => {
  const config = makeTestConfig();
  const pool = createMockPool();
  const server = await startTestServer(pool, config);
  t.after(server.close);
  const token = makeToken('pro-1', config);

  const createResponse = await fetch(`${server.url}/api/v1/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(servicePayload()),
  });
  const { service } = await createResponse.json();
  pool.addMediaAsset({
    id: 'media-1',
    user_id: 'pro-1',
    role: 'professional',
    purpose: 'service-image',
    object_key: 'pro-1/professional/service-image.jpg',
    content_type: 'image/jpeg',
  });

  const attachResponse = await fetch(`${server.url}/api/v1/services/${service.id}/media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mediaAssetId: 'media-1', mediaType: 'image' }),
  });
  assert.equal(attachResponse.status, 201);

  const otherToken = makeToken('other-user', config);
  const otherAttach = await fetch(`${server.url}/api/v1/services/${service.id}/media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${otherToken}`,
    },
    body: JSON.stringify({ mediaAssetId: 'media-1', mediaType: 'image' }),
  });
  assert.equal(otherAttach.status, 403);
});
