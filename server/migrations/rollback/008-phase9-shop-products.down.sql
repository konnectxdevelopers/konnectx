-- Preserve Phase 9 data before recording the migration as rolled back.
CREATE TABLE IF NOT EXISTS phase9_rollback_backup (
  source_table VARCHAR(64) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  backed_up_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_table, record_id)
);

INSERT INTO phase9_rollback_backup (source_table, record_id, payload)
SELECT 'business_profiles', user_id,
       JSON_OBJECT('shop_settings', shop_settings)
  FROM business_profiles
 WHERE shop_settings IS NOT NULL
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase9_rollback_backup (source_table, record_id, payload)
SELECT 'products', id,
       JSON_OBJECT(
         'shop_location_id', shop_location_id,
         'sku', sku,
         'short_description', short_description,
         'brand', brand,
         'compare_at_price', compare_at_price,
         'product_condition', product_condition,
         'stock_status', stock_status,
         'delivery_options', delivery_options,
         'return_policy', return_policy,
         'warranty_info', warranty_info,
         'attributes', attributes,
         'is_active', is_active
       )
  FROM products
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase9_rollback_backup (source_table, record_id, payload)
SELECT 'product_variants', id,
       JSON_OBJECT(
         'compare_at_price', compare_at_price,
         'is_active', is_active,
         'version', version
       )
  FROM product_variants
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase9_rollback_backup (source_table, record_id, payload)
SELECT 'business_shop_locations', id,
       JSON_OBJECT(
         'business_user_id', business_user_id,
         'label', label,
         'address', address,
         'city', city,
         'state', state,
         'country', country,
         'pin_code', pin_code,
         'phone', phone,
         'operating_hours', operating_hours,
         'pickup_enabled', pickup_enabled,
         'delivery_enabled', delivery_enabled,
         'is_primary', is_primary,
         'is_active', is_active,
         'created_at', created_at,
         'updated_at', updated_at
       )
  FROM business_shop_locations
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase9_rollback_backup (source_table, record_id, payload)
SELECT 'inventory_adjustments', id,
       JSON_OBJECT(
         'product_id', product_id,
         'variant_id', variant_id,
         'adjusted_by_user_id', adjusted_by_user_id,
         'previous_quantity', previous_quantity,
         'new_quantity', new_quantity,
         'delta', delta,
         'reason', reason,
         'created_at', created_at
       )
  FROM inventory_adjustments
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase9_rollback_backup (source_table, record_id, payload)
SELECT 'product_category_rules', category_id,
       JSON_OBJECT(
         'supports_variants', supports_variants,
         'supports_condition', supports_condition,
         'supports_warranty', supports_warranty,
         'supports_return_policy', supports_return_policy,
         'supports_compare_at_price', supports_compare_at_price,
         'variant_attribute_keys', variant_attribute_keys,
         'filterable_attribute_keys', filterable_attribute_keys,
         'attributes', attributes,
         'updated_at', updated_at
       )
  FROM product_category_rules
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

-- Keep Phase 9 tables and columns in place: the base schema also declares them,
-- and dropping them could invalidate products created while this migration ran.
DELETE FROM schema_migrations WHERE version = '008-phase9-shop-products.sql';
