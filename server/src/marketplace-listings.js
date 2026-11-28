export const CANONICAL_LISTING_TYPES = Object.freeze([
  'service',
  'product',
  'job',
  'freelance_project',
  'professional_profile',
  'business_profile',
]);

const TYPE_ALIASES = {
  service: 'service',
  product: 'product',
  job: 'job',
  project: 'freelance_project',
  freelance_project: 'freelance_project',
  professional: 'professional_profile',
  professional_profile: 'professional_profile',
  business: 'business_profile',
  business_profile: 'business_profile',
};

const CATEGORY_SECTIONS = {
  service: 'service',
  product: 'product',
  job: 'job',
  freelance_project: 'project',
  professional_profile: 'professional',
  business_profile: 'business',
};

export function normalizeListingType(type) {
  if (typeof type !== 'string') return null;
  return TYPE_ALIASES[type.trim()] || null;
}

export function toCategorySection(type) {
  const canonical = normalizeListingType(type);
  return canonical ? CATEGORY_SECTIONS[canonical] : null;
}

export async function syncMarketplaceListing(
  connection,
  {
    id,
    entityId = null,
    type,
    ownerId,
    ownerRole,
    categoryId = null,
    subcategoryId = null,
    title,
    shortSummary = null,
    description = null,
    location = null,
    visibility = 'public',
    status = 'draft',
    moderationStatus = null,
    moderationReason = null,
    moderatedBy = null,
    moderatedAt = null,
    submittedForReviewAt = null,
    publishedAt = null,
    archivedAt = null,
  },
  { linkCategory = true } = {}
) {
  const canonicalType = normalizeListingType(type) || type;
  const effectiveEntityId = entityId || id;
  const isPublic = status === 'published' && visibility === 'public';
  const effectivePublishedAt = publishedAt || (status === 'published' ? new Date() : null);
  const effectiveArchivedAt = archivedAt || (status === 'archived' ? new Date() : null);
  const locationJson = location === null || location === undefined
    ? null
    : typeof location === 'string'
      ? location
      : JSON.stringify(location);

  await connection.query(
    `INSERT INTO marketplace_listings (
       id, listing_type, entity_id, owner_user_id, owner_role,
       category_id, subcategory_id, title, short_summary, description,
       location, visibility, status, is_public, published_at, archived_at,
       submitted_for_review_at, moderation_status, moderation_reason, moderated_by, moderated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       listing_type = VALUES(listing_type),
       entity_id = VALUES(entity_id),
       owner_user_id = VALUES(owner_user_id),
       owner_role = VALUES(owner_role),
       category_id = VALUES(category_id),
       subcategory_id = VALUES(subcategory_id),
       title = VALUES(title),
       short_summary = COALESCE(VALUES(short_summary), short_summary),
       description = VALUES(description),
       location = COALESCE(VALUES(location), location),
       visibility = VALUES(visibility),
       status = VALUES(status),
       is_public = VALUES(is_public),
       published_at = COALESCE(published_at, VALUES(published_at)),
       archived_at = COALESCE(VALUES(archived_at), archived_at),
       submitted_for_review_at = COALESCE(VALUES(submitted_for_review_at), submitted_for_review_at),
       moderation_status = COALESCE(VALUES(moderation_status), moderation_status),
       moderation_reason = COALESCE(VALUES(moderation_reason), moderation_reason),
       moderated_by = COALESCE(VALUES(moderated_by), moderated_by),
       moderated_at = COALESCE(VALUES(moderated_at), moderated_at),
       updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      canonicalType,
      effectiveEntityId,
      ownerId,
      ownerRole,
      categoryId,
      subcategoryId,
      title,
      shortSummary,
      description || null,
      locationJson,
      visibility,
      status,
      isPublic,
      effectivePublishedAt,
      effectiveArchivedAt,
      submittedForReviewAt,
      moderationStatus || 'not_required',
      moderationReason,
      moderatedBy,
      moderatedAt,
    ]
  );

  if (!linkCategory) return;
  await connection.query(
    'DELETE FROM listing_categories WHERE listing_id = ? AND listing_type IN (?, ?)',
    [id, canonicalType, type]
  );
  if (categoryId) {
    await connection.query(
      `INSERT IGNORE INTO listing_categories (listing_type, listing_id, category_id, subcategory_id)
       VALUES (?, ?, ?, ?)`,
      [canonicalType, id, categoryId, subcategoryId]
    );
  }
}

export async function syncMarketplaceListingStatus(connection, type, id, status, options = {}) {
  const canonicalType = normalizeListingType(type) || type;
  const visibility = options.visibility || null;
  const isPublic = status === 'published' && (visibility ? visibility === 'public' : true);
  await connection.query(
    `UPDATE marketplace_listings
        SET status = ?,
            is_public = CASE
              WHEN ? = 'published' AND COALESCE(?, visibility) = 'public' THEN TRUE
              ELSE FALSE
            END,
            published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END,
            archived_at = CASE WHEN ? = 'archived' AND archived_at IS NULL THEN CURRENT_TIMESTAMP ELSE archived_at END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND listing_type IN (?, ?)`,
    [status, status, visibility, status, status, id, canonicalType, type]
  );
}
