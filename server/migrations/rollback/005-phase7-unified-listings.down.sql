-- Rollback for 005-phase7-unified-listings.sql
-- Preserve Phase 7-only data before removing its schema extensions.

CREATE TABLE IF NOT EXISTS phase7_rollback_backup (
  source_table VARCHAR(64) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  backed_up_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_table, record_id)
);

INSERT IGNORE INTO phase7_rollback_backup (source_table, record_id, payload)
SELECT 'marketplace_listings', id,
       JSON_OBJECT(
         'listing_type', listing_type, 'entity_id', entity_id, 'short_summary', short_summary,
         'location', location, 'visibility', visibility, 'published_at', published_at,
         'archived_at', archived_at, 'submitted_for_review_at', submitted_for_review_at,
         'moderation_status', moderation_status, 'moderation_reason', moderation_reason,
         'moderated_by', moderated_by, 'moderated_at', moderated_at
       )
  FROM marketplace_listings;

INSERT IGNORE INTO phase7_rollback_backup (source_table, record_id, payload)
SELECT 'listing_status_history', id,
       JSON_OBJECT(
         'listing_id', listing_id, 'listing_type', listing_type, 'from_status', from_status,
         'to_status', to_status, 'changed_by_user_id', changed_by_user_id,
         'changed_by_role', changed_by_role, 'reason', reason, 'created_at', created_at
       )
  FROM listing_status_history;

INSERT IGNORE INTO phase7_rollback_backup (source_table, record_id, payload)
SELECT 'listing_media', id,
       JSON_OBJECT(
         'listing_type', listing_type, 'listing_id', listing_id, 'media_asset_id', media_asset_id,
         'media_role', media_role, 'display_order', display_order, 'is_cover', is_cover,
         'alt_text', alt_text, 'mime_type', mime_type, 'file_size', file_size,
         'object_key', object_key, 'visibility', visibility
       )
  FROM listing_media;

INSERT IGNORE INTO phase7_rollback_backup (source_table, record_id, payload)
SELECT 'media_assets', id,
       JSON_OBJECT('status', status, 'expires_at', expires_at)
  FROM media_assets;

INSERT IGNORE INTO phase7_rollback_backup (source_table, record_id, payload)
SELECT 'professional_profiles', user_id, JSON_OBJECT('listing_id', listing_id)
  FROM professional_profiles;

INSERT IGNORE INTO phase7_rollback_backup (source_table, record_id, payload)
SELECT 'business_profiles', user_id,
       JSON_OBJECT('listing_id', listing_id, 'hiring_enabled', hiring_enabled)
  FROM business_profiles;

INSERT IGNORE INTO phase7_rollback_backup (source_table, record_id, payload)
SELECT 'marketplace_settings', setting_key,
       JSON_OBJECT('setting_value', setting_value, 'updated_by', updated_by, 'updated_at', updated_at)
  FROM marketplace_settings;

UPDATE marketplace_listings
   SET listing_type = 'project'
 WHERE listing_type = 'freelance_project';

UPDATE marketplace_listings
   SET listing_type = 'professional'
 WHERE listing_type = 'professional_profile';

UPDATE marketplace_listings
   SET listing_type = 'business'
 WHERE listing_type = 'business_profile';

UPDATE listing_media
   SET listing_type = 'project'
 WHERE listing_type = 'freelance_project';

DROP TABLE IF EXISTS listing_status_history;

DROP INDEX IF EXISTS professional_profiles_listing_id_unique ON professional_profiles;
DROP INDEX IF EXISTS business_profiles_listing_id_unique ON business_profiles;
DROP INDEX IF EXISTS marketplace_listings_entity_idx ON marketplace_listings;
DROP INDEX IF EXISTS marketplace_listings_visibility_idx ON marketplace_listings;

ALTER TABLE media_assets
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS status;

ALTER TABLE listing_media
  DROP COLUMN IF EXISTS visibility,
  DROP COLUMN IF EXISTS object_key,
  DROP COLUMN IF EXISTS file_size,
  DROP COLUMN IF EXISTS mime_type,
  DROP COLUMN IF EXISTS alt_text,
  DROP COLUMN IF EXISTS is_cover;

ALTER TABLE business_profiles
  DROP COLUMN IF EXISTS hiring_enabled,
  DROP COLUMN IF EXISTS listing_id;

ALTER TABLE professional_profiles
  DROP COLUMN IF EXISTS listing_id;

ALTER TABLE marketplace_listings
  DROP COLUMN IF EXISTS moderated_at,
  DROP COLUMN IF EXISTS moderated_by,
  DROP COLUMN IF EXISTS moderation_reason,
  DROP COLUMN IF EXISTS moderation_status,
  DROP COLUMN IF EXISTS submitted_for_review_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS visibility,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS short_summary,
  DROP COLUMN IF EXISTS entity_id;

DELETE FROM schema_migrations WHERE version = '005-phase7-unified-listings.sql';

