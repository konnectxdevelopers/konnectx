-- Rollback for 007-phase8-service-management.sql
CREATE TABLE IF NOT EXISTS phase8_rollback_backup (
  source_table VARCHAR(64) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  backed_up_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_table, record_id)
);

INSERT INTO phase8_rollback_backup (source_table, record_id, payload)
SELECT 'services', id,
       JSON_OBJECT(
         'booking_lead_time_hours', booking_lead_time_hours,
         'cancellation_policy', cancellation_policy,
         'packages', packages,
         'addons', addons,
         'custom_attributes', custom_attributes,
         'booking_constraints', booking_constraints,
         'legacy_source_key', legacy_source_key
       )
  FROM services
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase8_rollback_backup (source_table, record_id, payload)
SELECT 'service_category_rules', category_id,
       JSON_OBJECT(
         'requires_location', requires_location,
         'supports_coverage_radius', supports_coverage_radius,
         'supports_duration', supports_duration,
         'supports_availability', supports_availability,
         'supports_booking_lead_time', supports_booking_lead_time,
         'supports_packages', supports_packages,
         'allowed_delivery_methods', allowed_delivery_methods,
         'allowed_pricing_types', allowed_pricing_types,
         'required_fields', required_fields,
         'attributes', attributes,
         'updated_at', updated_at
       )
  FROM service_category_rules
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

DROP TABLE IF EXISTS service_category_rules;

DROP INDEX IF EXISTS services_rating_idx ON services;

ALTER TABLE services
  DROP COLUMN IF EXISTS booking_constraints,
  DROP COLUMN IF EXISTS custom_attributes,
  DROP COLUMN IF EXISTS addons,
  DROP COLUMN IF EXISTS packages,
  DROP COLUMN IF EXISTS cancellation_policy,
  DROP COLUMN IF EXISTS booking_lead_time_hours;

DELETE FROM schema_migrations WHERE version = '007-phase8-service-management.sql';

