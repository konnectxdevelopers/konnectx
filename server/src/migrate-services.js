import { createHash, randomUUID } from 'node:crypto';
import { getConfig } from './config.js';
import { createDatabasePool } from './db.js';
import { withTransaction } from './listing-engine.js';
import { syncMarketplaceListing } from './marketplace-listings.js';

const CATEGORY_MAP_BY_NAME = [
  { match: /clean/i, categoryId: '00000000-0000-4000-8000-000000000001' },
  { match: /plumb/i, categoryId: '00000000-0000-4000-8000-000000000002' },
  { match: /electri/i, categoryId: '00000000-0000-4000-8000-000000000003' },
  { match: /paint/i, categoryId: '00000000-0000-4000-8000-000000000004' },
  { match: /beauty|wellness|health/i, categoryId: '00000000-0000-4000-8000-000000000005' },
  { match: /photo/i, categoryId: '00000000-0000-4000-8000-000000000006' },
  { match: /event/i, categoryId: '00000000-0000-4000-8000-000000000007' },
  { match: /interior/i, categoryId: '00000000-0000-4000-8000-000000000008' },
  { match: /software|tech|web|app|\bit\b/i, categoryId: '00000000-0000-4000-8000-000000000009' },
  { match: /design|graphic/i, categoryId: '00000000-0000-4000-8000-000000000010' },
  { match: /market/i, categoryId: '00000000-0000-4000-8000-000000000011' },
  { match: /transport|delivery/i, categoryId: '00000000-0000-4000-8000-000000000012' },
  { match: /tutor|educat|train/i, categoryId: '00000000-0000-4000-8000-000000000013' },
  { match: /repair|maint/i, categoryId: '00000000-0000-4000-8000-000000000014' },
];

const FALLBACK_CATEGORY_ID = '00000000-0000-4000-8000-000000000015';

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || 'service')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160);
}

function mapCategoryId(rawCategory, rawTitle) {
  const haystack = `${rawCategory || ''} ${rawTitle || ''}`;
  const matched = CATEGORY_MAP_BY_NAME.find((entry) => entry.match.test(haystack));
  return matched ? matched.categoryId : FALLBACK_CATEGORY_ID;
}

function mapPricingType(rawType, amount) {
  const val = String(rawType || '').trim().toLowerCase();
  if (val === 'fixed') return amount ? 'fixed' : 'quote_required';
  if (val === 'hourly') return amount ? 'hourly' : 'negotiable';
  if (val === 'per visit' || val === 'per_visit') return amount ? 'per_visit' : 'quote_required';
  if (val === 'starting at' || val === 'starting from' || val === 'starting_from') return amount ? 'starting_from' : 'quote_required';
  if (val === 'quote required' || val === 'quote_required') return 'quote_required';
  return 'negotiable';
}

function mapDeliveryMethod(rawMethod, categoryId) {
  const val = String(rawMethod || '').trim().toLowerCase();
  if (val === 'on-site' || val === 'at customer location') return 'customer_location';
  if (val === 'provider_location' || val === 'at provider location') return 'provider_location';
  if (val === 'remote') return 'remote';
  if (val === 'online') return 'online';
  if (val === 'hybrid') return 'hybrid';
  if (['00000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011'].includes(categoryId)) {
    return 'remote';
  }
  return 'customer_location';
}

function splitLegacyServiceNames(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof rawValue !== 'string') return [];
  return rawValue
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

export async function migrateLegacyProfileServices(pool) {
  const report = {
    migratedCount: 0,
    skippedCount: 0,
    migratedServices: [],
  };

  const [proRows] = await pool.query(
    `SELECT pp.user_id, pp.profile
       FROM professional_profiles pp
       JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'professional'`
  );
  const [bizRows] = await pool.query(
    `SELECT bp.user_id, bp.profile
       FROM business_profiles bp
       JOIN user_roles ur ON ur.user_id = bp.user_id AND ur.role = 'business'`
  );

  const candidates = [
    ...proRows.map((row) => ({ role: 'professional', userId: row.user_id, profile: parseJson(row.profile, {}) })),
    ...bizRows.map((row) => ({ role: 'business', userId: row.user_id, profile: parseJson(row.profile, {}) })),
  ];

  for (const entry of candidates) {
    const names = splitLegacyServiceNames(entry.profile.services);
    if (!names.length) continue;

    for (const name of names) {
      const serviceKey = slugify(name).slice(0, 60) || createHash('sha256').update(name).digest('hex').slice(0, 32);
      const legacyKey = `${entry.role}:${entry.userId}:${serviceKey}`;
      const migrated = await withTransaction(pool, async (connection) => {
        const [existing] = await connection.query(
          'SELECT id FROM services WHERE legacy_source_key = ? LIMIT 1',
          [legacyKey]
        );
        if (existing.length) return null;

        const categoryLabel = entry.role === 'professional'
          ? entry.profile.primaryCategory
          : entry.profile.businessCategory;
        const categoryId = mapCategoryId(categoryLabel, name);
        const rawAmount = Number(entry.profile.startingPrice);
        const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;
        const pricingType = mapPricingType(entry.profile.pricingType, amount);
        const deliveryMethod = mapDeliveryMethod(entry.profile.deliveryMethod, categoryId);
        const currency = typeof entry.profile.currency === 'string' && /^[A-Z]{3}$/.test(entry.profile.currency.trim().toUpperCase())
          ? entry.profile.currency.trim().toUpperCase()
          : 'INR';
        const title = name.slice(0, 180);
        const shortSummary = (entry.profile.headline || entry.profile.shortDescription || `${title} service`).slice(0, 500);
        const description = entry.profile.serviceDescriptions || entry.profile.bio || entry.profile.detailedDescription || shortSummary;
        const serviceId = randomUUID();
        const slug = `${slugify(title) || 'service'}-${serviceId.slice(0, 8)}`;
        const status = 'draft';
        const locationObj = entry.profile.city
          ? {
            city: String(entry.profile.city).trim().slice(0, 120),
            state: entry.profile.state ? String(entry.profile.state).trim().slice(0, 120) : null,
            country: entry.profile.country ? String(entry.profile.country).trim().slice(0, 80) : null,
            area: entry.profile.area ? String(entry.profile.area).trim().slice(0, 160) : null,
            radiusKm: Number.isFinite(Number(entry.profile.workingRadius)) && Number(entry.profile.workingRadius) > 0
              ? Number(entry.profile.workingRadius)
              : null,
          }
          : null;

        await connection.query(
          `INSERT INTO services (
             id, provider_user_id, provider_role, category_id, subcategory_id,
             slug, title, short_description, description, delivery_method,
             status, legacy_source_key
           ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
          [
            serviceId,
            entry.userId,
            entry.role,
            categoryId,
            slug,
            title,
            shortSummary,
            description,
            deliveryMethod,
            status,
            legacyKey,
          ]
        );
        await connection.query(
          `INSERT INTO service_pricing (service_id, pricing_type, amount, currency)
           VALUES (?, ?, ?, ?)`,
          [serviceId, pricingType, amount, currency]
        );
        if (locationObj) {
          await connection.query(
            `INSERT INTO service_locations (id, service_id, country, state, city, area, radius_km, is_primary)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [randomUUID(), serviceId, locationObj.country, locationObj.state, locationObj.city, locationObj.area, locationObj.radiusKm]
          );
        }
        await syncMarketplaceListing(connection, {
          id: serviceId,
          entityId: serviceId,
          type: 'service',
          ownerId: entry.userId,
          ownerRole: entry.role,
          categoryId,
          subcategoryId: null,
          title,
          shortSummary,
          description,
          location: locationObj,
          status,
        });
        await connection.query(
          `INSERT INTO listing_status_history (id, listing_id, listing_type, from_status, to_status, changed_by_user_id, changed_by_role, reason)
           VALUES (?, ?, 'service', NULL, ?, ?, ?, ?)`,
          [randomUUID(), serviceId, status, entry.userId, entry.role, 'Migrated from legacy profile services field']
        );
        await connection.query(
          `INSERT INTO migration_report
             (migration_version, entity_type, old_reference, new_reference, action_taken, requires_manual_review)
           SELECT ?, 'legacy_profile_service', ?, ?, ?, TRUE
            WHERE NOT EXISTS (
              SELECT 1 FROM migration_report
               WHERE migration_version = ? AND entity_type = 'legacy_profile_service' AND old_reference = ?
            )`,
          [
            '007-phase8-service-management.sql',
            legacyKey,
            serviceId,
            `Migrated legacy ${entry.role} profile service "${title}" into draft service listing`,
            '007-phase8-service-management.sql',
            legacyKey,
          ]
        );
        return { serviceId, role: entry.role, userId: entry.userId, title, categoryId, status };
      });

      if (!migrated) {
        report.skippedCount += 1;
        continue;
      }
      report.migratedCount += 1;
      report.migratedServices.push(migrated);
    }
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate-services.js')) {
  const pool = createDatabasePool(getConfig());
  try {
    const report = await migrateLegacyProfileServices(pool);
    console.log('Phase 8 service migration report:', JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

