ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS shop_settings JSON NULL;

CREATE TABLE IF NOT EXISTS business_shop_locations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  business_user_id CHAR(36) NOT NULL,
  label VARCHAR(120) NOT NULL,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NULL,
  country VARCHAR(80) NULL,
  pin_code VARCHAR(24) NULL,
  phone VARCHAR(32) NULL,
  operating_hours VARCHAR(255) NULL,
  pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY business_shop_locations_owner_idx (business_user_id, is_active, is_primary),
  CONSTRAINT business_shop_locations_business_fk
    FOREIGN KEY (business_user_id) REFERENCES business_profiles (user_id)
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shop_location_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS sku VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS short_description VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS brand VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS compare_at_price DECIMAL(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS product_condition VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS stock_status VARCHAR(24) NOT NULL DEFAULT 'in_stock',
  ADD COLUMN IF NOT EXISTS delivery_options JSON NULL,
  ADD COLUMN IF NOT EXISTS return_policy TEXT NULL,
  ADD COLUMN IF NOT EXISTS warranty_info TEXT NULL,
  ADD COLUMN IF NOT EXISTS attributes JSON NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS products_brand_idx
  ON products (brand);

CREATE INDEX IF NOT EXISTS products_stock_idx
  ON products (status, is_active, stock_status, stock_quantity);

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS compare_at_price DECIMAL(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS version INT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  variant_id CHAR(36) NULL,
  adjusted_by_user_id CHAR(36) NOT NULL,
  previous_quantity INT UNSIGNED NOT NULL,
  new_quantity INT UNSIGNED NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY inventory_adjustments_product_idx (product_id, created_at),
  KEY inventory_adjustments_variant_idx (variant_id, created_at),
  CONSTRAINT inventory_adjustments_product_fk
    FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE TABLE IF NOT EXISTS product_category_rules (
  category_id CHAR(36) NOT NULL PRIMARY KEY,
  supports_variants BOOLEAN NOT NULL DEFAULT TRUE,
  supports_condition BOOLEAN NOT NULL DEFAULT FALSE,
  supports_warranty BOOLEAN NOT NULL DEFAULT FALSE,
  supports_return_policy BOOLEAN NOT NULL DEFAULT TRUE,
  supports_compare_at_price BOOLEAN NOT NULL DEFAULT TRUE,
  variant_attribute_keys JSON NOT NULL,
  filterable_attribute_keys JSON NOT NULL,
  attributes JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT product_category_rules_category_fk
    FOREIGN KEY (category_id) REFERENCES categories (id)
);

INSERT IGNORE INTO product_category_rules (
  category_id, supports_variants, supports_condition, supports_warranty,
  supports_return_policy, supports_compare_at_price,
  variant_attribute_keys, filterable_attribute_keys, attributes
) VALUES
  (
    '22000000-0000-4000-8000-000000000001',
    TRUE, FALSE, FALSE, TRUE, TRUE,
    '["size","color"]',
    '["brand","size","color"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"size","label":"Clothing size","type":"select","options":["XS","S","M","L","XL","XXL"],"variant":true,"filterable":true},{"key":"color","label":"Color","type":"text","variant":true,"filterable":true},{"key":"material","label":"Material / fabric","type":"text","filterable":false},{"key":"fit","label":"Fit","type":"select","options":["Regular","Slim","Relaxed","Oversized"],"filterable":false}]'
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    TRUE, TRUE, TRUE, TRUE, TRUE,
    '["storage","color"]',
    '["brand","color","storage"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"model","label":"Model name / number","type":"text","filterable":false},{"key":"color","label":"Color","type":"text","variant":true,"filterable":true},{"key":"storage","label":"Storage capacity","type":"select","options":["64GB","128GB","256GB","512GB","1TB"],"variant":true,"filterable":true},{"key":"ram","label":"Memory (RAM)","type":"select","options":["4GB","8GB","16GB","32GB"],"filterable":false}]'
  ),
  (
    '22000000-0000-4000-8000-000000000003',
    TRUE, TRUE, TRUE, TRUE, TRUE,
    '["color","material"]',
    '["brand","color"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"material","label":"Material","type":"text","filterable":false},{"key":"color","label":"Color","type":"text","variant":true,"filterable":true},{"key":"dimensions","label":"Dimensions","type":"text","filterable":false},{"key":"assembly_required","label":"Assembly required","type":"select","options":["Yes","No"],"filterable":false}]'
  ),
  (
    '22000000-0000-4000-8000-000000000004',
    TRUE, FALSE, FALSE, FALSE, TRUE,
    '["pack_size"]',
    '["brand"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"pack_size","label":"Pack size / weight","type":"select","options":["250g","500g","1kg","2kg","500ml","1L"],"variant":true,"filterable":false},{"key":"organic","label":"Organic","type":"select","options":["Yes","No"],"filterable":false}]'
  ),
  (
    '22000000-0000-4000-8000-000000000005',
    TRUE, FALSE, FALSE, TRUE, TRUE,
    '["shade","volume"]',
    '["brand","color"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"volume","label":"Volume / size","type":"text","variant":true,"filterable":false},{"key":"shade","label":"Shade / variant","type":"text","variant":true,"filterable":false},{"key":"skin_type","label":"Suitable for","type":"select","options":["All skin types","Dry","Oily","Sensitive"],"filterable":false}]'
  ),
  (
    '22000000-0000-4000-8000-000000000006',
    TRUE, TRUE, TRUE, TRUE, TRUE,
    '["size","color"]',
    '["brand","size","color"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"size","label":"Size","type":"select","options":["S","M","L","XL","Standard"],"variant":true,"filterable":true},{"key":"color","label":"Color","type":"text","variant":true,"filterable":true},{"key":"material","label":"Material","type":"text","filterable":false}]'
  ),
  (
    '22000000-0000-4000-8000-000000000007',
    TRUE, FALSE, FALSE, TRUE, TRUE,
    '["size","color"]',
    '["brand","size","color"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"size","label":"Shoe size (UK/India)","type":"select","options":["5","6","7","8","9","10","11","12"],"variant":true,"filterable":true},{"key":"color","label":"Color","type":"text","variant":true,"filterable":true},{"key":"material","label":"Upper material","type":"text","filterable":false}]'
  ),
  (
    '22000000-0000-4000-8000-000000000008',
    TRUE, FALSE, FALSE, TRUE, TRUE,
    '["color"]',
    '["brand","color"]',
    '[{"key":"brand","label":"Brand","type":"text","filterable":true},{"key":"color","label":"Color","type":"text","variant":true,"filterable":true},{"key":"material","label":"Material","type":"text","filterable":false}]'
  );

