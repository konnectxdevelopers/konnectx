ALTER TABLE freelance_projects
  ADD COLUMN IF NOT EXISTS client_role VARCHAR(24) NOT NULL DEFAULT 'hiring',
  ADD COLUMN IF NOT EXISTS subcategory_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS budget_type VARCHAR(24) NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS budget_min DECIMAL(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS budget_max DECIMAL(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS experience_level VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS proposal_deadline DATE NULL,
  ADD COLUMN IF NOT EXISTS screening_questions JSON NULL,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(24) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS project_skills (
  project_id CHAR(36) NOT NULL,
  skill VARCHAR(80) NOT NULL,
  PRIMARY KEY (project_id, skill),
  KEY project_skills_skill_idx (skill),
  CONSTRAINT project_skills_project_fk
    FOREIGN KEY (project_id) REFERENCES freelance_projects (id)
);

CREATE TABLE IF NOT EXISTS project_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NULL,
  mime_type VARCHAR(128) NULL,
  file_size BIGINT UNSIGNED NULL,
  object_key VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY project_attachments_proj_idx (project_id),
  CONSTRAINT project_attachments_proj_fk
    FOREIGN KEY (project_id) REFERENCES freelance_projects (id)
);

CREATE TABLE IF NOT EXISTS project_proposals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  proposer_user_id CHAR(36) NOT NULL,
  proposer_role VARCHAR(24) NOT NULL DEFAULT 'professional',
  cover_message TEXT NOT NULL,
  proposed_amount DECIMAL(12, 2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  timeline_text VARCHAR(160) NULL,
  answers JSON NULL,
  portfolio_links JSON NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'submitted',
  internal_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY project_proposals_unique (project_id, proposer_user_id),
  KEY project_proposals_proj_status_idx (project_id, status),
  KEY project_proposals_proposer_idx (proposer_user_id, created_at),
  CONSTRAINT project_proposals_proj_fk
    FOREIGN KEY (project_id) REFERENCES freelance_projects (id)
);

CREATE TABLE IF NOT EXISTS proposal_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  proposal_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NULL,
  mime_type VARCHAR(128) NULL,
  file_size BIGINT UNSIGNED NULL,
  object_key VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY proposal_attachments_prop_idx (proposal_id),
  CONSTRAINT proposal_attachments_prop_fk
    FOREIGN KEY (proposal_id) REFERENCES project_proposals (id)
);

CREATE TABLE IF NOT EXISTS proposal_status_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  proposal_id CHAR(36) NOT NULL,
  from_status VARCHAR(24) NULL,
  to_status VARCHAR(24) NOT NULL,
  changed_by_user_id CHAR(36) NULL,
  changed_by_role VARCHAR(24) NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY proposal_status_history_prop_idx (proposal_id, created_at),
  CONSTRAINT proposal_status_history_prop_fk
    FOREIGN KEY (proposal_id) REFERENCES project_proposals (id)
);

