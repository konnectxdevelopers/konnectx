-- Rollback for 006-phase7-service-draft-category.sql
-- Keep category_id nullable so Phase 7 drafts are not lost or assigned a false category.
-- The nullable column is backward-compatible with the Phase 6 service APIs.

DELETE FROM schema_migrations WHERE version = '006-phase7-service-draft-category.sql';

