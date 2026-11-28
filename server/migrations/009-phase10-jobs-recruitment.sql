ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS subcategory_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS responsibilities TEXT NULL,
  ADD COLUMN IF NOT EXISTS experience_min TINYINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS experience_max TINYINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS salary_undisclosed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS openings INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS application_method VARCHAR(32) NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS application_questions JSON NULL,
  ADD COLUMN IF NOT EXISTS employer_details JSON NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS job_requirements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  requirement_type VARCHAR(32) NOT NULL DEFAULT 'qualification',
  label VARCHAR(255) NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY job_requirements_job_idx (job_id),
  CONSTRAINT job_requirements_job_fk
    FOREIGN KEY (job_id) REFERENCES jobs (id)
);

CREATE TABLE IF NOT EXISTS job_skills (
  job_id CHAR(36) NOT NULL,
  skill VARCHAR(80) NOT NULL,
  PRIMARY KEY (job_id, skill),
  KEY job_skills_skill_idx (skill),
  CONSTRAINT job_skills_job_fk
    FOREIGN KEY (job_id) REFERENCES jobs (id)
);

CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  applicant_user_id CHAR(36) NOT NULL,
  applicant_role VARCHAR(24) NOT NULL DEFAULT 'customer',
  cover_note TEXT NULL,
  answers JSON NULL,
  resume_media_id CHAR(36) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'submitted',
  internal_notes TEXT NULL,
  interview_stage VARCHAR(80) NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY applications_job_applicant_unique (job_id, applicant_user_id),
  KEY applications_job_status_idx (job_id, status),
  KEY applications_applicant_idx (applicant_user_id, applied_at),
  CONSTRAINT applications_job_fk
    FOREIGN KEY (job_id) REFERENCES jobs (id)
);

CREATE TABLE IF NOT EXISTS application_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  file_name VARCHAR(255) NULL,
  mime_type VARCHAR(128) NULL,
  file_size BIGINT UNSIGNED NULL,
  object_key VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY application_attachments_app_idx (application_id),
  CONSTRAINT application_attachments_app_fk
    FOREIGN KEY (application_id) REFERENCES applications (id)
);

CREATE TABLE IF NOT EXISTS application_status_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  application_id CHAR(36) NOT NULL,
  from_status VARCHAR(24) NULL,
  to_status VARCHAR(24) NOT NULL,
  changed_by_user_id CHAR(36) NULL,
  changed_by_role VARCHAR(24) NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY application_status_history_app_idx (application_id, created_at),
  CONSTRAINT application_status_history_app_fk
    FOREIGN KEY (application_id) REFERENCES applications (id)
);

