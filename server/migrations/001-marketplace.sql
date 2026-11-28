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
  category_id CHAR(36) NOT NULL,
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
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY services_owner_slug_unique (provider_user_id, provider_role, slug),
  KEY services_provider_idx (provider_user_id, provider_role, status, updated_at),
  KEY services_discovery_idx (status, category_id, subcategory_id, created_at),
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

INSERT IGNORE INTO service_categories
  (id, slug, name, description, icon_ref, display_order)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'home-cleaning', 'Home Cleaning', 'Home cleaning and housekeeping services.', 'broom', 1),
  ('00000000-0000-4000-8000-000000000002', 'plumbing', 'Plumbing', 'Residential and commercial plumbing services.', 'pipe-wrench', 2),
  ('00000000-0000-4000-8000-000000000003', 'electrical', 'Electrical', 'Electrical installation, inspection, and repair.', 'lightning-bolt-outline', 3),
  ('00000000-0000-4000-8000-000000000004', 'painting', 'Painting', 'Interior and exterior painting services.', 'format-paint', 4),
  ('00000000-0000-4000-8000-000000000005', 'beauty-wellness', 'Beauty & Wellness', 'Personal care, beauty, and wellness services.', 'spa-outline', 5),
  ('00000000-0000-4000-8000-000000000006', 'photography', 'Photography', 'Portrait, event, and commercial photography.', 'camera-outline', 6),
  ('00000000-0000-4000-8000-000000000007', 'event-management', 'Event Management', 'Planning and production for events.', 'calendar-star', 7),
  ('00000000-0000-4000-8000-000000000008', 'interior-design', 'Interior Design', 'Interior planning, styling, and consultation.', 'sofa-outline', 8),
  ('00000000-0000-4000-8000-000000000009', 'web-development', 'Web Development', 'Website design, engineering, and support.', 'web', 9),
  ('00000000-0000-4000-8000-000000000010', 'graphic-design', 'Graphic Design', 'Branding, illustration, and graphic design.', 'palette-outline', 10),
  ('00000000-0000-4000-8000-000000000011', 'digital-marketing', 'Digital Marketing', 'Marketing strategy and campaign services.', 'bullhorn-outline', 11),
  ('00000000-0000-4000-8000-000000000012', 'transportation', 'Transportation', 'Local transport and delivery services.', 'car-outline', 12),
  ('00000000-0000-4000-8000-000000000013', 'education-training', 'Education & Training', 'Tutoring, instruction, and professional training.', 'school-outline', 13),
  ('00000000-0000-4000-8000-000000000014', 'repair-maintenance', 'Repair & Maintenance', 'Appliance, equipment, and property repair.', 'tools', 14),
  ('00000000-0000-4000-8000-000000000015', 'other-services', 'Other Services', 'Other professional and local services.', 'dots-horizontal-circle-outline', 15);
