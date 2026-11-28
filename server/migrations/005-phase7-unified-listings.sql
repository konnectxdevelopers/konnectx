INSERT IGNORE INTO listing_types (key_name, label) VALUES
  ('freelance_project', 'Freelance Projects'),
  ('professional_profile', 'Professionals & Freelancers'),
  ('business_profile', 'Businesses & Shops');

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS entity_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS short_summary VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS location JSON NULL,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(24) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(24) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS moderated_by CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS marketplace_listings_entity_idx
  ON marketplace_listings (listing_type, entity_id);

CREATE INDEX IF NOT EXISTS marketplace_listings_visibility_idx
  ON marketplace_listings (listing_type, status, is_public, visibility, published_at);

ALTER TABLE professional_profiles
  ADD COLUMN IF NOT EXISTS listing_id CHAR(36) NULL;

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS listing_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS hiring_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS professional_profiles_listing_id_unique
  ON professional_profiles (listing_id);

CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_listing_id_unique
  ON business_profiles (listing_id);

ALTER TABLE listing_media
  ADD COLUMN IF NOT EXISTS is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alt_text VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS file_size BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS object_key VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(24) NOT NULL DEFAULT 'public';

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS listing_status_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  listing_id CHAR(36) NOT NULL,
  listing_type VARCHAR(32) NOT NULL,
  from_status VARCHAR(24) NULL,
  to_status VARCHAR(24) NOT NULL,
  changed_by_user_id CHAR(36) NULL,
  changed_by_role VARCHAR(24) NULL,
  reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY listing_status_history_listing_idx (listing_id, created_at),
  KEY listing_status_history_type_idx (listing_type, created_at)
);

CREATE TABLE IF NOT EXISTS marketplace_settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO marketplace_settings (setting_key, setting_value) VALUES
  ('moderation_policy', JSON_OBJECT('requireReviewTypes', JSON_ARRAY(), 'defaultVisibility', 'public'));

UPDATE media_assets ma
   SET ma.status = 'attached'
 WHERE ma.status = 'pending'
   AND (
     EXISTS (SELECT 1 FROM service_media sm WHERE sm.media_asset_id = ma.id)
     OR EXISTS (SELECT 1 FROM listing_media lm WHERE lm.media_asset_id = ma.id)
     OR EXISTS (SELECT 1 FROM professional_portfolio_items pi WHERE pi.media_asset_id = ma.id)
     OR ma.purpose IN ('profile-photo', 'business-logo', 'cover-image', 'certificate', 'verification-document')
   );

UPDATE marketplace_listings ml
  JOIN professional_profiles pp ON pp.user_id = ml.owner_user_id
   SET ml.listing_type = 'professional_profile',
       ml.entity_id = pp.user_id,
       ml.published_at = CASE WHEN ml.status = 'published' AND ml.published_at IS NULL THEN ml.updated_at ELSE ml.published_at END,
       pp.listing_id = COALESCE(pp.listing_id, ml.id)
 WHERE ml.listing_type = 'professional'
   AND ml.id = pp.user_id;

UPDATE marketplace_listings ml
  JOIN business_profiles bp ON bp.user_id = ml.owner_user_id
   SET ml.listing_type = 'business_profile',
       ml.entity_id = bp.user_id,
       ml.published_at = CASE WHEN ml.status = 'published' AND ml.published_at IS NULL THEN ml.updated_at ELSE ml.published_at END,
       bp.listing_id = COALESCE(bp.listing_id, ml.id)
 WHERE ml.listing_type = 'business'
   AND ml.id = bp.user_id;

UPDATE marketplace_listings
   SET listing_type = 'freelance_project',
       entity_id = COALESCE(entity_id, id),
       published_at = CASE WHEN status = 'published' AND published_at IS NULL THEN updated_at ELSE published_at END
 WHERE listing_type = 'project';

UPDATE marketplace_listings
   SET entity_id = COALESCE(entity_id, id),
       published_at = CASE WHEN status = 'published' AND published_at IS NULL THEN updated_at ELSE published_at END
 WHERE listing_type IN ('service', 'product', 'job') AND entity_id IS NULL;

INSERT IGNORE INTO marketplace_listings (
  id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id,
  title, short_summary, description, status, is_public, visibility, published_at, created_at, updated_at
)
SELECT s.id, 'service', s.id, s.provider_user_id, s.provider_role, s.category_id, s.subcategory_id,
       s.title, s.short_description, s.description, s.status, s.status = 'published', 'public',
       CASE WHEN s.status = 'published' THEN s.updated_at ELSE NULL END,
       s.created_at, s.updated_at
  FROM services s
 WHERE s.status != 'deleted';

INSERT IGNORE INTO marketplace_listings (
  id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id,
  title, short_summary, description, status, is_public, visibility, published_at, created_at, updated_at
)
SELECT p.id, 'product', p.id, p.seller_user_id, p.seller_role, p.category_id, p.subcategory_id,
       p.name, LEFT(p.description, 500), p.description, p.status, p.status = 'published', 'public',
       CASE WHEN p.status = 'published' THEN p.updated_at ELSE NULL END,
       p.created_at, p.updated_at
  FROM products p;

INSERT IGNORE INTO marketplace_listings (
  id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id,
  title, short_summary, description, location, status, is_public, visibility, published_at, created_at, updated_at
)
SELECT j.id, 'job', j.id, j.employer_user_id, j.employer_role, j.category_id, NULL,
       j.title, LEFT(j.description, 500), j.description,
       CASE WHEN j.location IS NOT NULL OR j.work_mode IS NOT NULL
         THEN JSON_OBJECT('city', j.location, 'workMode', j.work_mode)
         ELSE NULL
       END,
       j.status, j.status = 'published', 'public',
       CASE WHEN j.status = 'published' THEN j.updated_at ELSE NULL END,
       j.created_at, j.updated_at
  FROM jobs j;

INSERT IGNORE INTO marketplace_listings (
  id, listing_type, entity_id, owner_user_id, owner_role, category_id, subcategory_id,
  title, short_summary, description, location, status, is_public, visibility, published_at, created_at, updated_at
)
SELECT fp.id, 'freelance_project', fp.id, fp.client_user_id, 'hiring', fp.category_id, NULL,
       fp.title, LEFT(fp.description, 500), fp.description,
       CASE WHEN fp.location IS NOT NULL OR fp.work_mode IS NOT NULL
         THEN JSON_OBJECT('city', fp.location, 'workMode', fp.work_mode)
         ELSE NULL
       END,
       fp.status, fp.status = 'published', 'public',
       CASE WHEN fp.status = 'published' THEN fp.updated_at ELSE NULL END,
       fp.created_at, fp.updated_at
  FROM freelance_projects fp;

INSERT IGNORE INTO listing_media (
  id, listing_type, listing_id, media_asset_id, media_role, display_order,
  is_cover, mime_type, file_size, object_key, visibility, created_at
)
SELECT sm.id, 'service', sm.service_id, sm.media_asset_id, sm.media_type, sm.display_order,
       sm.display_order = 0 AND sm.media_type = 'image',
       ma.content_type, ma.byte_size, ma.object_key, 'public', sm.created_at
  FROM service_media sm
  JOIN media_assets ma ON ma.id = sm.media_asset_id;

UPDATE listing_media lm
  JOIN media_assets ma ON ma.id = lm.media_asset_id
   SET lm.mime_type = COALESCE(lm.mime_type, ma.content_type),
       lm.file_size = COALESCE(lm.file_size, ma.byte_size),
       lm.object_key = COALESCE(lm.object_key, ma.object_key),
       lm.listing_type = CASE WHEN lm.listing_type = 'project' THEN 'freelance_project' ELSE lm.listing_type END;

INSERT IGNORE INTO migration_report (migration_version, entity_type, old_reference, new_reference, action_taken, requires_manual_review)
SELECT '005-phase7-unified-listings.sql', 'portfolio_listing_cleanup', ml.id, ml.id,
       'Portfolio item existed in marketplace_listings under professional type; review if separate portfolio record', TRUE
  FROM marketplace_listings ml
  JOIN professional_portfolio_items pi ON pi.id = ml.id
 WHERE ml.listing_type = 'professional';

