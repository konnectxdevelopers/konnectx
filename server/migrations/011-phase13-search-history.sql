CREATE TABLE IF NOT EXISTS customer_search_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  query VARCHAR(160) NOT NULL,
  listing_type VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY customer_search_history_user_idx (user_id, created_at)
);

CREATE INDEX IF NOT EXISTS marketplace_listings_public_type_pub_idx
  ON marketplace_listings (status, is_public, visibility, listing_type, published_at);

