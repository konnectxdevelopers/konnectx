CREATE TABLE IF NOT EXISTS listing_types (
  key_name VARCHAR(32) NOT NULL PRIMARY KEY,
  label VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO listing_types (key_name, label) VALUES
  ('service', 'Services'),
  ('product', 'Shopping & Products'),
  ('professional', 'Professionals & Freelancers'),
  ('job', 'Jobs & Employment'),
  ('project', 'Freelance Projects'),
  ('business', 'Businesses & Shops');

CREATE TABLE IF NOT EXISTS categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  parent_id CHAR(36) NULL,
  listing_type VARCHAR(32) NULL,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  icon_ref VARCHAR(80) NULL,
  image_url VARCHAR(512) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY categories_slug_unique (slug),
  KEY categories_parent_order_idx (parent_id, is_active, display_order),
  CONSTRAINT categories_parent_fk FOREIGN KEY (parent_id) REFERENCES categories(id),
  CONSTRAINT categories_listing_type_fk FOREIGN KEY (listing_type) REFERENCES listing_types(key_name)
);

CREATE TABLE IF NOT EXISTS category_attributes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  category_id CHAR(36) NOT NULL,
  attribute_key VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  attribute_type VARCHAR(24) NOT NULL,
  options JSON NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_filterable BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY category_attributes_unique (category_id, attribute_key),
  KEY category_attributes_filter_idx (category_id, is_filterable, display_order),
  CONSTRAINT category_attributes_category_fk FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS listing_categories (
  listing_type VARCHAR(32) NOT NULL,
  listing_id CHAR(36) NOT NULL,
  category_id CHAR(36) NOT NULL,
  subcategory_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (listing_type, listing_id, category_id),
  KEY listing_categories_category_idx (category_id, subcategory_id),
  CONSTRAINT listing_categories_type_fk FOREIGN KEY (listing_type) REFERENCES listing_types(key_name),
  CONSTRAINT listing_categories_category_fk FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  listing_type VARCHAR(32) NOT NULL,
  owner_user_id CHAR(36) NOT NULL,
  owner_role VARCHAR(24) NOT NULL,
  category_id CHAR(36) NULL,
  subcategory_id CHAR(36) NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY marketplace_listings_discovery_idx (listing_type, status, is_public, created_at),
  KEY marketplace_listings_owner_idx (owner_user_id, owner_role, status),
  CONSTRAINT marketplace_listings_type_fk FOREIGN KEY (listing_type) REFERENCES listing_types(key_name)
);

CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) NOT NULL PRIMARY KEY,
  seller_user_id CHAR(36) NOT NULL,
  seller_role VARCHAR(24) NOT NULL DEFAULT 'business',
  category_id CHAR(36) NULL,
  subcategory_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  variants JSON NULL,
  images JSON NULL,
  delivery_info VARCHAR(255) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY products_seller_idx (seller_user_id, status),
  KEY products_discovery_idx (status, category_id, subcategory_id, price)
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
  salary_min DECIMAL(12,2) NULL,
  salary_max DECIMAL(12,2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  experience_required VARCHAR(80) NULL,
  education_required VARCHAR(160) NULL,
  skills JSON NULL,
  deadline DATE NULL,
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
  budget DECIMAL(12,2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  deadline DATE NULL,
  deliverables TEXT NULL,
  work_mode VARCHAR(24) NULL,
  location VARCHAR(160) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY projects_client_idx (client_user_id, status),
  KEY projects_discovery_idx (status, category_id, budget)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  sku VARCHAR(100) NULL,
  name VARCHAR(160) NOT NULL,
  attributes JSON NULL,
  price DECIMAL(10,2) NULL,
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY product_variants_product_stock_idx (product_id, stock_quantity),
  CONSTRAINT product_variants_product_fk FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS professional_skills (
  professional_user_id CHAR(36) NOT NULL,
  skill VARCHAR(120) NOT NULL,
  category_id CHAR(36) NULL,
  experience_years TINYINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (professional_user_id, skill),
  KEY professional_skills_category_idx (category_id, skill)
);

CREATE TABLE IF NOT EXISTS listing_media (
  id CHAR(36) NOT NULL PRIMARY KEY,
  listing_type VARCHAR(32) NOT NULL,
  listing_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  media_role VARCHAR(32) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY listing_media_asset_unique (listing_type, listing_id, media_asset_id),
  KEY listing_media_listing_idx (listing_type, listing_id, display_order),
  CONSTRAINT listing_media_type_fk FOREIGN KEY (listing_type) REFERENCES listing_types(key_name),
  CONSTRAINT listing_media_asset_fk FOREIGN KEY (media_asset_id) REFERENCES media_assets(id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id CHAR(36) NOT NULL,
  listing_type VARCHAR(32) NOT NULL,
  listing_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, listing_type, listing_id),
  CONSTRAINT favorites_type_fk FOREIGN KEY (listing_type) REFERENCES listing_types(key_name)
);

CREATE TABLE IF NOT EXISTS enquiries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sender_user_id CHAR(36) NOT NULL,
  listing_type VARCHAR(32) NOT NULL,
  listing_id CHAR(36) NOT NULL,
  owner_user_id CHAR(36) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY enquiries_owner_status_idx (owner_user_id, status, created_at),
  CONSTRAINT enquiries_type_fk FOREIGN KEY (listing_type) REFERENCES listing_types(key_name)
);

CREATE TABLE IF NOT EXISTS migration_report (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  migration_version VARCHAR(255) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  old_reference VARCHAR(255) NULL,
  new_reference VARCHAR(255) NULL,
  action_taken VARCHAR(255) NOT NULL,
  requires_manual_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO categories (id, parent_id, listing_type, slug, name, description, display_order) VALUES
  ('20000000-0000-4000-8000-000000000001', NULL, 'service', 'services', 'Services', 'Professional and local services', 1),
  ('20000000-0000-4000-8000-000000000002', NULL, 'product', 'shopping-products', 'Shopping & Products', 'Physical and digital products', 2),
  ('20000000-0000-4000-8000-000000000003', NULL, 'professional', 'professionals-freelancers', 'Professionals & Freelancers', 'Independent professionals and skilled freelancers', 3),
  ('20000000-0000-4000-8000-000000000004', NULL, 'job', 'jobs-employment', 'Jobs & Employment', 'Full-time, part-time and temporary employment', 4),
  ('20000000-0000-4000-8000-000000000005', NULL, 'project', 'freelance-projects', 'Freelance Projects', 'Project briefs and proposal opportunities', 5),
  ('20000000-0000-4000-8000-000000000006', NULL, 'business', 'businesses-shops', 'Businesses & Shops', 'Verified businesses and local shops', 6);

INSERT IGNORE INTO categories (id, parent_id, listing_type, slug, name, display_order) VALUES
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', NULL, 'home-services', 'Home Services', 1),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', NULL, 'beauty-wellness', 'Beauty & Wellness', 2),
  ('21000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', NULL, 'education', 'Education', 3),
  ('21000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', NULL, 'technology', 'Technology', 4),
  ('21000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', NULL, 'events', 'Events', 5),
  ('21000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', NULL, 'automotive', 'Automotive', 6),
  ('21000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', NULL, 'professional-services', 'Professional Services', 7),
  ('21000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', NULL, 'construction', 'Construction', 8),
  ('22000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', NULL, 'fashion', 'Fashion', 1),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', NULL, 'electronics', 'Electronics', 2),
  ('22000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', NULL, 'home-furniture', 'Home & Furniture', 3),
  ('22000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', NULL, 'grocery', 'Grocery', 4),
  ('22000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', NULL, 'beauty-products', 'Beauty', 5),
  ('22000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', NULL, 'sports', 'Sports', 6),
  ('22000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', NULL, 'footwear', 'Footwear', 7),
  ('22000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', NULL, 'accessories', 'Accessories', 8),
  ('23000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', NULL, 'software-developers', 'Software Developers', 1),
  ('23000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', NULL, 'designers', 'Designers', 2),
  ('23000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', NULL, 'content-writers', 'Content Writers', 3),
  ('23000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003', NULL, 'consultants', 'Consultants', 4),
  ('24000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', NULL, 'it-software', 'IT & Software', 1),
  ('24000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', NULL, 'sales-marketing', 'Sales & Marketing', 2),
  ('24000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', NULL, 'finance-accounting', 'Finance & Accounting', 3),
  ('24000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', NULL, 'healthcare', 'Healthcare', 4),
  ('24000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000004', NULL, 'construction-trades', 'Construction & Skilled Trades', 5),
  ('25000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', NULL, 'website-development-project', 'Website Development', 1),
  ('25000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', NULL, 'mobile-development-project', 'Mobile Application Development', 2),
  ('25000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000005', NULL, 'graphic-design-project', 'Graphic Design', 3),
  ('25000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005', NULL, 'marketing-project', 'Digital Marketing', 4),
  ('26000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006', NULL, 'retail-shop', 'Retail Shops', 1),
  ('26000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000006', NULL, 'restaurant', 'Restaurants', 2),
  ('26000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000006', NULL, 'digital-agency', 'Digital Agencies', 3),
  ('26000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000006', NULL, 'service-agency', 'Service Agencies', 4);

INSERT IGNORE INTO category_attributes (id, category_id, attribute_key, label, attribute_type, options, is_required, is_filterable, display_order) VALUES
  ('27000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'price_range', 'Price range', 'range', NULL, FALSE, TRUE, 1),
  ('27000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'delivery_method', 'Delivery method', 'select', '[\"customer_location\",\"provider_location\",\"online\",\"remote\",\"hybrid\"]', FALSE, TRUE, 2),
  ('27000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'brand', 'Brand', 'text', NULL, FALSE, TRUE, 1),
  ('27000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'size', 'Size', 'text', NULL, FALSE, TRUE, 2),
  ('27000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'color', 'Color', 'text', NULL, FALSE, TRUE, 3),
  ('27000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000004', 'employment_type', 'Employment type', 'select', '[\"full-time\",\"part-time\",\"contract\",\"temporary\",\"internship\"]', TRUE, TRUE, 1),
  ('27000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000004', 'work_mode', 'Work mode', 'select', '[\"on-site\",\"remote\",\"hybrid\"]', TRUE, TRUE, 2),
  ('27000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000005', 'budget', 'Budget', 'range', NULL, FALSE, TRUE, 1),
  ('27000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000005', 'deadline', 'Deadline', 'date', NULL, FALSE, TRUE, 2);

INSERT IGNORE INTO categories (id, parent_id, listing_type, slug, name, display_order) VALUES
  ('28000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', NULL, 'plumbing', 'Plumbing', 1),
  ('28000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', NULL, 'electrical-work', 'Electrical Work', 2),
  ('28000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', NULL, 'home-cleaning-sub', 'Home Cleaning', 3),
  ('28000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', NULL, 'painting', 'Painting', 4),
  ('28000000-0000-4000-8000-000000000005', '21000000-0000-4000-8000-000000000001', NULL, 'carpentry', 'Carpentry', 5),
  ('28000000-0000-4000-8000-000000000006', '21000000-0000-4000-8000-000000000001', NULL, 'pest-control', 'Pest Control', 6),
  ('28000000-0000-4000-8000-000000000007', '21000000-0000-4000-8000-000000000001', NULL, 'appliance-repair', 'Appliance Repair', 7),
  ('28000000-0000-4000-8000-000000000008', '21000000-0000-4000-8000-000000000002', NULL, 'salon', 'Salon', 1),
  ('28000000-0000-4000-8000-000000000009', '21000000-0000-4000-8000-000000000002', NULL, 'haircut', 'Haircut', 2),
  ('28000000-0000-4000-8000-000000000010', '21000000-0000-4000-8000-000000000002', NULL, 'makeup', 'Makeup', 3),
  ('28000000-0000-4000-8000-000000000011', '21000000-0000-4000-8000-000000000002', NULL, 'spa', 'Spa', 4),
  ('28000000-0000-4000-8000-000000000012', '21000000-0000-4000-8000-000000000002', NULL, 'fitness', 'Fitness', 5),
  ('28000000-0000-4000-8000-000000000013', '21000000-0000-4000-8000-000000000004', NULL, 'website-development', 'Website Development', 1),
  ('28000000-0000-4000-8000-000000000014', '21000000-0000-4000-8000-000000000004', NULL, 'mobile-app-development', 'Mobile App Development', 2),
  ('28000000-0000-4000-8000-000000000015', '21000000-0000-4000-8000-000000000004', NULL, 'software-development', 'Software Development', 3),
  ('28000000-0000-4000-8000-000000000016', '21000000-0000-4000-8000-000000000004', NULL, 'it-support', 'IT Support', 4),
  ('28000000-0000-4000-8000-000000000017', '21000000-0000-4000-8000-000000000004', NULL, 'networking', 'Networking', 5),
  ('28000000-0000-4000-8000-000000000018', '22000000-0000-4000-8000-000000000001', NULL, 'mens-clothing', 'Men\'s Clothing', 1),
  ('28000000-0000-4000-8000-000000000019', '22000000-0000-4000-8000-000000000001', NULL, 'womens-clothing', 'Women\'s Clothing', 2),
  ('28000000-0000-4000-8000-000000000020', '22000000-0000-4000-8000-000000000001', NULL, 'kids-clothing', 'Kids\' Clothing', 3),
  ('28000000-0000-4000-8000-000000000021', '22000000-0000-4000-8000-000000000001', NULL, 'ethnic-wear', 'Ethnic Wear', 4),
  ('28000000-0000-4000-8000-000000000022', '22000000-0000-4000-8000-000000000001', NULL, 'shirts', 'Shirts', 5),
  ('28000000-0000-4000-8000-000000000023', '22000000-0000-4000-8000-000000000001', NULL, 'trousers', 'Trousers', 6),
  ('28000000-0000-4000-8000-000000000024', '22000000-0000-4000-8000-000000000001', NULL, 'dresses', 'Dresses', 7),
  ('28000000-0000-4000-8000-000000000025', '22000000-0000-4000-8000-000000000002', NULL, 'mobiles', 'Mobiles', 1),
  ('28000000-0000-4000-8000-000000000026', '22000000-0000-4000-8000-000000000002', NULL, 'laptops', 'Laptops', 2),
  ('28000000-0000-4000-8000-000000000027', '22000000-0000-4000-8000-000000000002', NULL, 'computers', 'Computers', 3),
  ('28000000-0000-4000-8000-000000000028', '22000000-0000-4000-8000-000000000002', NULL, 'accessories-electronics', 'Accessories', 4),
  ('28000000-0000-4000-8000-000000000029', '24000000-0000-4000-8000-000000000001', NULL, 'software-engineering', 'Software Engineering', 1),
  ('28000000-0000-4000-8000-000000000030', '24000000-0000-4000-8000-000000000001', NULL, 'mobile-app-development-job', 'Mobile Application Development', 2),
  ('28000000-0000-4000-8000-000000000031', '25000000-0000-4000-8000-000000000001', NULL, 'business-website-project', 'Business Website', 1),
  ('28000000-0000-4000-8000-000000000032', '25000000-0000-4000-8000-000000000002', NULL, 'mobile-app-project', 'Mobile Application', 1);

ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_role VARCHAR(24) NOT NULL DEFAULT 'business';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS education_required VARCHAR(160) NULL;
ALTER TABLE freelance_projects ADD COLUMN IF NOT EXISTS work_mode VARCHAR(24) NULL;
ALTER TABLE freelance_projects ADD COLUMN IF NOT EXISTS location VARCHAR(160) NULL;

INSERT IGNORE INTO migration_report (migration_version, entity_type, old_reference, new_reference, action_taken, requires_manual_review)
SELECT '003-phase6-marketplace.sql', 'service_category', sc.id, sc.id,
       'Legacy category preserved; use it for migration compatibility until listing remapped', TRUE
FROM service_categories sc;
