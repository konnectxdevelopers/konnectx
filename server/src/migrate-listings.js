import { randomUUID } from 'node:crypto';
import { getConfig } from './config.js';
import { createDatabasePool } from './db.js';

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function migrateProfileListingsAndReport(pool) {
  const report = {
    professionalProfilesMapped: 0,
    businessProfilesMapped: 0,
    servicesBackfilled: 0,
    unmappedRecords: [],
  };

  // 1. Ensure every professional_profile has a dedicated marketplace_listings row
  const [proRows] = await pool.query(
    `SELECT pp.user_id, pp.listing_id, pp.profile, ur.profile_completion_status,
            pp.created_at, pp.updated_at
       FROM professional_profiles pp
       LEFT JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'professional'`
  );
  for (const row of proRows) {
    if (row.listing_id) continue;
    const profile = parseJson(row.profile, {});
    const [existing] = await pool.query(
      `SELECT id, listing_type FROM marketplace_listings WHERE id = ? LIMIT 1`,
      [row.user_id]
    );
    const listingId = !existing.length || ['professional', 'professional_profile'].includes(existing[0].listing_type)
      ? row.user_id
      : randomUUID();
    const status = row.profile_completion_status === 'complete' ? 'published' : 'draft';
    const location = profile.city || profile.state || profile.country
      ? JSON.stringify({
        city: profile.city || null,
        state: profile.state || null,
        country: profile.country || null,
        area: profile.area || null,
      })
      : null;
    await pool.query(
      `INSERT INTO marketplace_listings (
         id, listing_type, entity_id, owner_user_id, owner_role,
         title, short_summary, description, location, status, is_public, visibility, published_at, created_at, updated_at
       ) VALUES (?, 'professional_profile', ?, ?, 'professional', ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         listing_type = 'professional_profile',
         entity_id = VALUES(entity_id),
         short_summary = COALESCE(short_summary, VALUES(short_summary)),
         location = COALESCE(location, VALUES(location))`,
      [
        listingId,
        row.user_id,
        row.user_id,
        profile.fullName || 'Professional Profile',
        profile.headline || null,
        profile.bio || profile.headline || null,
        location,
        status,
        status === 'published',
        status === 'published' ? row.updated_at : null,
        row.created_at,
        row.updated_at,
      ]
    );
    await pool.query(
      'UPDATE professional_profiles SET listing_id = ? WHERE user_id = ?',
      [listingId, row.user_id]
    );
    report.professionalProfilesMapped += 1;
  }

  // 2. Ensure every business_profile has a dedicated marketplace_listings row (never colliding with professional_profile)
  const [bizRows] = await pool.query(
    `SELECT bp.user_id, bp.listing_id, bp.profile, ur.profile_completion_status,
            bp.created_at, bp.updated_at
       FROM business_profiles bp
       LEFT JOIN user_roles ur ON ur.user_id = bp.user_id AND ur.role = 'business'`
  );
  for (const row of bizRows) {
    if (row.listing_id) continue;
    const profile = parseJson(row.profile, {});
    const [existing] = await pool.query(
      `SELECT id, listing_type FROM marketplace_listings WHERE id = ? LIMIT 1`,
      [row.user_id]
    );
    const listingId = !existing.length || ['business', 'business_profile'].includes(existing[0].listing_type)
      ? row.user_id
      : randomUUID();
    const status = row.profile_completion_status === 'complete' ? 'published' : 'draft';
    const location = profile.city || profile.state || profile.country
      ? JSON.stringify({
        city: profile.city || null,
        state: profile.state || null,
        country: profile.country || null,
      })
      : null;
    await pool.query(
      `INSERT INTO marketplace_listings (
         id, listing_type, entity_id, owner_user_id, owner_role,
         title, short_summary, description, location, status, is_public, visibility, published_at, created_at, updated_at
       ) VALUES (?, 'business_profile', ?, ?, 'business', ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         listing_type = 'business_profile',
         entity_id = VALUES(entity_id),
         short_summary = COALESCE(short_summary, VALUES(short_summary)),
         location = COALESCE(location, VALUES(location))`,
      [
        listingId,
        row.user_id,
        row.user_id,
        profile.companyName || profile.businessName || 'Business Profile',
        profile.shortDescription || null,
        profile.detailedDescription || profile.shortDescription || null,
        location,
        status,
        status === 'published',
        status === 'published' ? row.updated_at : null,
        row.created_at,
        row.updated_at,
      ]
    );
    await pool.query(
      'UPDATE business_profiles SET listing_id = ?, hiring_enabled = ? WHERE user_id = ?',
      [listingId, Boolean(profile.hiringEnabled), row.user_id]
    );
    report.businessProfilesMapped += 1;
  }

  // 3. Audit unmapped records across legacy tables
  const [unmappedServices] = await pool.query(
    `SELECT s.id, s.provider_user_id, s.status
       FROM services s
       LEFT JOIN marketplace_listings ml ON ml.id = s.id AND ml.listing_type = 'service'
      WHERE s.status != 'deleted' AND ml.id IS NULL`
  );
  for (const row of unmappedServices) {
    report.unmappedRecords.push({ table: 'services', id: row.id, reason: 'missing_marketplace_listing' });
  }

  const [orphanedListings] = await pool.query(
    `SELECT ml.id, ml.listing_type, ml.owner_user_id
       FROM marketplace_listings ml
      WHERE (ml.listing_type = 'service' AND NOT EXISTS (SELECT 1 FROM services s WHERE s.id = ml.id))
         OR (ml.listing_type = 'product' AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ml.id))
         OR (ml.listing_type = 'job' AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = ml.id))
         OR (ml.listing_type = 'freelance_project' AND NOT EXISTS (SELECT 1 FROM freelance_projects fp WHERE fp.id = ml.id))`
  );
  for (const row of orphanedListings) {
    report.unmappedRecords.push({
      table: 'marketplace_listings',
      id: row.id,
      listingType: row.listing_type,
      reason: 'missing_type_specific_record',
    });
    await pool.query(
      `INSERT INTO migration_report
         (migration_version, entity_type, old_reference, new_reference, action_taken, requires_manual_review)
       SELECT ?, ?, ?, NULL, ?, TRUE
        WHERE NOT EXISTS (
          SELECT 1 FROM migration_report
           WHERE migration_version = ? AND entity_type = ? AND old_reference = ? AND action_taken = ?
        )`,
      [
        '005-phase7-unified-listings.sql',
        row.listing_type,
        row.id,
        'Orphaned marketplace_listings record without type-specific row',
        '005-phase7-unified-listings.sql',
        row.listing_type,
        row.id,
        'Orphaned marketplace_listings record without type-specific row',
      ]
    );
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate-listings.js')) {
  const pool = createDatabasePool(getConfig());
  try {
    const report = await migrateProfileListingsAndReport(pool);
    console.log('Phase 7 listing backfill report:', JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

