CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  phone VARCHAR(32) NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  selected_role VARCHAR(24) NULL,
  common_profile JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY users_email_unique (email)
);

CREATE TABLE IF NOT EXISTS auth_email_codes (
  user_id CHAR(36) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, purpose),
  KEY auth_email_codes_expiry_index (expires_at)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role VARCHAR(24) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  profile_completion_status VARCHAR(24) NOT NULL DEFAULT 'incomplete',
  profile_completion_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verification_status VARCHAR(24) NOT NULL DEFAULT 'not_started',
  profile_created_at TIMESTAMP NULL,
  profile_updated_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role),
  KEY user_roles_role_index (role)
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  profile JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS professional_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  listing_id CHAR(36) NULL,
  profile JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY professional_profiles_listing_id_unique (listing_id)
);

CREATE TABLE IF NOT EXISTS business_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  listing_id CHAR(36) NULL,
  hiring_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  shop_settings JSON NULL,
  profile JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY business_profiles_listing_id_unique (listing_id)
);

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
  KEY business_shop_locations_owner_idx (business_user_id, is_active, is_primary)
);

CREATE TABLE IF NOT EXISTS hiring_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  profile JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_assets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role VARCHAR(24) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  content_type VARCHAR(128) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY media_object_key_unique (object_key),
  KEY media_user_role_index (user_id, role)
);

CREATE TABLE IF NOT EXISTS service_categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  icon_ref VARCHAR(80) NULL,
  image_url VARCHAR(512) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY service_categories_slug_unique (slug),
  KEY service_categories_active_order_idx (is_active, display_order)
);

CREATE TABLE IF NOT EXISTS service_subcategories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  category_id CHAR(36) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY service_subcategories_category_slug_unique (category_id, slug),
  UNIQUE KEY service_subcategories_id_category_unique (id, category_id),
  KEY service_subcategories_active_order_idx (category_id, is_active, display_order),
  CONSTRAINT service_subcategories_category_fk
    FOREIGN KEY (category_id) REFERENCES service_categories (id)
);

CREATE TABLE IF NOT EXISTS services (
  id CHAR(36) NOT NULL PRIMARY KEY,
  provider_user_id CHAR(36) NOT NULL,
  provider_role VARCHAR(24) NOT NULL,
  category_id CHAR(36) NULL,
  subcategory_id CHAR(36) NULL,
  slug VARCHAR(220) NOT NULL,
  title VARCHAR(180) NOT NULL,
  short_description VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  delivery_method VARCHAR(32) NOT NULL,
  duration_value DECIMAL(8, 2) NULL,
  duration_unit VARCHAR(16) NULL,
  inclusions JSON NULL,
  exclusions JSON NULL,
  customer_requirements TEXT NULL,
  terms_and_conditions TEXT NULL,
  booking_lead_time_hours INT UNSIGNED NULL,
  cancellation_policy TEXT NULL,
  packages JSON NULL,
  addons JSON NULL,
  custom_attributes JSON NULL,
  booking_constraints JSON NULL,
  legacy_source_key VARCHAR(120) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY services_owner_slug_unique (provider_user_id, provider_role, slug),
  UNIQUE KEY services_legacy_source_unique (legacy_source_key),
  KEY services_provider_idx (provider_user_id, provider_role, status, updated_at),
  KEY services_discovery_idx (status, category_id, subcategory_id, created_at),
  KEY services_rating_idx (status, review_count, rating_avg, created_at),
  KEY services_featured_idx (status, is_featured, created_at),
  CONSTRAINT services_owner_role_fk
    FOREIGN KEY (provider_user_id, provider_role) REFERENCES user_roles (user_id, role),
  CONSTRAINT services_category_fk
    FOREIGN KEY (category_id) REFERENCES service_categories (id),
  CONSTRAINT services_subcategory_category_fk
    FOREIGN KEY (subcategory_id, category_id)
    REFERENCES service_subcategories (id, category_id)
);

CREATE TABLE IF NOT EXISTS service_pricing (
  service_id CHAR(36) NOT NULL PRIMARY KEY,
  pricing_type VARCHAR(24) NOT NULL,
  amount DECIMAL(10, 2) NULL,
  min_price DECIMAL(10, 2) NULL,
  max_price DECIMAL(10, 2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT service_pricing_service_fk
    FOREIGN KEY (service_id) REFERENCES services (id)
);

CREATE TABLE IF NOT EXISTS service_availability (
  id CHAR(36) NOT NULL PRIMARY KEY,
  service_id CHAR(36) NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY service_availability_slot_unique (service_id, day_of_week, start_time, end_time),
  KEY service_availability_service_day_idx (service_id, day_of_week),
  CONSTRAINT service_availability_service_fk
    FOREIGN KEY (service_id) REFERENCES services (id)
);

CREATE TABLE IF NOT EXISTS service_locations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  service_id CHAR(36) NOT NULL,
  country VARCHAR(80) NULL,
  state VARCHAR(120) NULL,
  city VARCHAR(120) NOT NULL,
  area VARCHAR(160) NULL,
  radius_km DECIMAL(7, 2) NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  KEY service_locations_city_idx (city, state),
  CONSTRAINT service_locations_service_fk
    FOREIGN KEY (service_id) REFERENCES services (id)
);

CREATE TABLE IF NOT EXISTS service_tags (
  service_id CHAR(36) NOT NULL,
  tag VARCHAR(40) NOT NULL,
  PRIMARY KEY (service_id, tag),
  KEY service_tags_tag_idx (tag),
  CONSTRAINT service_tags_service_fk
    FOREIGN KEY (service_id) REFERENCES services (id)
);

CREATE TABLE IF NOT EXISTS service_media (
  id CHAR(36) NOT NULL PRIMARY KEY,
  service_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  media_type VARCHAR(16) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY service_media_asset_unique (media_asset_id),
  KEY service_media_service_order_idx (service_id, display_order),
  CONSTRAINT service_media_service_fk
    FOREIGN KEY (service_id) REFERENCES services (id),
  CONSTRAINT service_media_asset_fk
    FOREIGN KEY (media_asset_id) REFERENCES media_assets (id)
);


CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) NOT NULL PRIMARY KEY,
  seller_user_id CHAR(36) NOT NULL,
  seller_role VARCHAR(24) NOT NULL DEFAULT 'business',
  category_id CHAR(36) NULL,
  subcategory_id CHAR(36) NULL,
  shop_location_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL,
  sku VARCHAR(100) NULL,
  short_description VARCHAR(500) NULL,
  description TEXT NOT NULL,
  brand VARCHAR(120) NULL,
  price DECIMAL(10, 2) NOT NULL,
  compare_at_price DECIMAL(10, 2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  product_condition VARCHAR(32) NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  stock_status VARCHAR(24) NOT NULL DEFAULT 'in_stock',
  variants JSON NULL,
  images JSON NULL,
  delivery_info VARCHAR(255) NULL,
  delivery_options JSON NULL,
  return_policy TEXT NULL,
  warranty_info TEXT NULL,
  attributes JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY products_seller_idx (seller_user_id, status),
  KEY products_discovery_idx (status, category_id, subcategory_id, price),
  KEY products_brand_idx (brand),
  KEY products_stock_idx (status, is_active, stock_status, stock_quantity)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  sku VARCHAR(100) NULL,
  attributes JSON NULL,
  price DECIMAL(10, 2) NULL,
  compare_at_price DECIMAL(10, 2) NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY product_variants_product_idx (product_id),
  CONSTRAINT product_variants_product_fk
    FOREIGN KEY (product_id) REFERENCES products (id)
);

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

CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  employer_user_id CHAR(36) NOT NULL,
  employer_role VARCHAR(24) NOT NULL DEFAULT 'hiring',
  category_id CHAR(36) NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  employment_type VARCHAR(32) NOT NULL DEFAULT 'full-time',
  work_mode VARCHAR(24) NOT NULL DEFAULT 'on-site',
  location VARCHAR(160) NULL,
  salary_min DECIMAL(12, 2) NULL,
  salary_max DECIMAL(12, 2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  experience_required VARCHAR(80) NULL,
  skills JSON NULL,
  deadline DATE NULL,
  application_target VARCHAR(320) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY jobs_employer_idx (employer_user_id, status),
  KEY jobs_discovery_idx (status, category_id, employment_type, work_mode)
);

CREATE TABLE IF NOT EXISTS freelance_projects (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_user_id CHAR(36) NOT NULL,
  category_id CHAR(36) NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  required_skills JSON NULL,
  budget DECIMAL(12, 2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  deadline DATE NULL,
  deliverables TEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY projects_client_idx (client_user_id, status),
  KEY projects_discovery_idx (status, category_id, budget)
);
