ALTER TABLE services
  ADD COLUMN IF NOT EXISTS booking_lead_time_hours INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT NULL,
  ADD COLUMN IF NOT EXISTS packages JSON NULL,
  ADD COLUMN IF NOT EXISTS addons JSON NULL,
  ADD COLUMN IF NOT EXISTS custom_attributes JSON NULL,
  ADD COLUMN IF NOT EXISTS booking_constraints JSON NULL,
  ADD COLUMN IF NOT EXISTS legacy_source_key VARCHAR(120) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS services_legacy_source_unique
  ON services (legacy_source_key);

CREATE INDEX IF NOT EXISTS services_rating_idx
  ON services (status, review_count, rating_avg, created_at);

CREATE TABLE IF NOT EXISTS service_category_rules (
  category_id CHAR(36) NOT NULL PRIMARY KEY,
  requires_location BOOLEAN NOT NULL DEFAULT TRUE,
  supports_coverage_radius BOOLEAN NOT NULL DEFAULT TRUE,
  supports_duration BOOLEAN NOT NULL DEFAULT TRUE,
  supports_availability BOOLEAN NOT NULL DEFAULT TRUE,
  supports_booking_lead_time BOOLEAN NOT NULL DEFAULT TRUE,
  supports_packages BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_delivery_methods JSON NOT NULL,
  allowed_pricing_types JSON NOT NULL,
  required_fields JSON NOT NULL,
  attributes JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT service_category_rules_category_fk
    FOREIGN KEY (category_id) REFERENCES service_categories (id)
);

INSERT IGNORE INTO service_category_rules (
  category_id, requires_location, supports_coverage_radius, supports_duration,
  supports_availability, supports_booking_lead_time, supports_packages,
  allowed_delivery_methods, allowed_pricing_types, required_fields, attributes
) VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","hybrid"]',
    '["fixed","hourly","per_visit","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"property_size","label":"Property size","type":"select","options":["1 BHK","2 BHK","3 BHK","Villa / Commercial"],"required":false},{"key":"supplies_included","label":"Cleaning supplies included","type":"select","options":["Yes","Customer provides"],"required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","hybrid"]',
    '["fixed","hourly","per_visit","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"emergency_service","label":"Emergency callout available","type":"select","options":["Yes","Scheduled only"],"required":false},{"key":"warranty_days","label":"Workmanship warranty (days)","type":"number","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","hybrid"]',
    '["fixed","hourly","per_visit","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"licensed_technician","label":"Licensed technician","type":"select","options":["Yes","Certified assistant"],"required":false},{"key":"warranty_days","label":"Workmanship warranty (days)","type":"number","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","hybrid"]',
    '["fixed","per_visit","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"paint_materials","label":"Paint & materials","type":"select","options":["Included","Excluded (labour only)"],"required":false},{"key":"surface_area_unit","label":"Pricing basis","type":"select","options":["Per sq. ft.","Per room","Full property"],"required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","provider_location","hybrid"]',
    '["fixed","hourly","per_visit","starting_from","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"service_setting","label":"Service setting","type":"select","options":["At home","Salon / Studio","Both"],"required":false},{"key":"products_used","label":"Products / brands used","type":"text","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","provider_location","hybrid"]',
    '["fixed","hourly","per_day","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"edited_photos_count","label":"Edited photos included","type":"number","required":false},{"key":"turnaround_days","label":"Delivery turnaround (days)","type":"number","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000007',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","provider_location","hybrid"]',
    '["fixed","per_day","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"guest_capacity","label":"Guest capacity supported","type":"text","required":false},{"key":"event_types","label":"Event types","type":"text","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000008',
    FALSE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","provider_location","online","remote","hybrid"]',
    '["fixed","hourly","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod"]',
    '[{"key":"renders_included","label":"3D renders included","type":"select","options":["Yes","Optional add-on","No"],"required":false},{"key":"site_visits","label":"Site visits included","type":"number","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000009',
    FALSE, FALSE, TRUE, TRUE, TRUE, TRUE,
    '["online","remote","hybrid"]',
    '["fixed","hourly","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod"]',
    '[{"key":"tech_stack","label":"Primary technologies","type":"text","required":false},{"key":"revisions_included","label":"Revisions included","type":"number","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000010',
    FALSE, FALSE, TRUE, TRUE, TRUE, TRUE,
    '["online","remote","hybrid"]',
    '["fixed","hourly","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod"]',
    '[{"key":"deliverable_formats","label":"Source file formats","type":"text","required":false},{"key":"revisions_included","label":"Revisions included","type":"number","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    FALSE, FALSE, TRUE, TRUE, TRUE, TRUE,
    '["online","remote","hybrid"]',
    '["fixed","hourly","per_day","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod"]',
    '[{"key":"channels","label":"Marketing channels","type":"text","required":false},{"key":"reporting_cadence","label":"Reporting cadence","type":"select","options":["Weekly","Bi-weekly","Monthly"],"required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    TRUE, TRUE, TRUE, TRUE, TRUE, FALSE,
    '["customer_location","hybrid"]',
    '["fixed","hourly","per_visit","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"vehicle_type","label":"Vehicle type","type":"text","required":false},{"key":"max_capacity","label":"Max load / passenger capacity","type":"text","required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000013',
    FALSE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["online","remote","provider_location","customer_location","hybrid"]',
    '["fixed","hourly","per_visit","starting_from","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod"]',
    '[{"key":"skill_level","label":"Learner level","type":"select","options":["Beginner","Intermediate","Advanced","All levels"],"required":false},{"key":"session_format","label":"Session format","type":"select","options":["1-on-1","Small group","Workshop"],"required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000014',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","provider_location","hybrid"]',
    '["fixed","hourly","per_visit","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod","locations"]',
    '[{"key":"appliances_covered","label":"Equipment / appliances covered","type":"text","required":false},{"key":"inspection_fee_waived","label":"Inspection fee waived on repair","type":"select","options":["Yes","No"],"required":false}]'
  ),
  (
    '00000000-0000-4000-8000-000000000015',
    FALSE, TRUE, TRUE, TRUE, TRUE, TRUE,
    '["customer_location","provider_location","online","remote","hybrid"]',
    '["fixed","hourly","per_visit","per_day","starting_from","quote_required","negotiable"]',
    '["title","shortDescription","description","categoryId","pricingType","deliveryMethod"]',
    '[]'
  );

