CREATE TABLE IF NOT EXISTS professional_portfolio_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  professional_user_id CHAR(36) NOT NULL,
  category_id CHAR(36) NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  media_asset_id CHAR(36) NULL,
  project_url VARCHAR(512) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY professional_portfolio_owner_idx (professional_user_id, status, created_at),
  CONSTRAINT professional_portfolio_media_fk FOREIGN KEY (media_asset_id) REFERENCES media_assets(id)
);

CREATE TABLE IF NOT EXISTS business_categories (
  business_user_id CHAR(36) NOT NULL,
  category_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_user_id, category_id),
  KEY business_categories_category_idx (category_id),
  CONSTRAINT business_categories_category_fk FOREIGN KEY (category_id) REFERENCES categories(id)
);
