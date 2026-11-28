CREATE TABLE IF NOT EXISTS phase10_rollback_backup (
  source_table VARCHAR(64) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  backed_up_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_table, record_id)
);

INSERT INTO phase10_rollback_backup (source_table, record_id, payload)
SELECT 'applications', id,
       JSON_OBJECT(
         'job_id', job_id,
         'applicant_user_id', applicant_user_id,
         'applicant_role', applicant_role,
         'cover_note', cover_note,
         'answers', answers,
         'resume_media_id', resume_media_id,
         'status', status,
         'internal_notes', internal_notes,
         'interview_stage', interview_stage,
         'applied_at', applied_at,
         'updated_at', updated_at
       )
  FROM applications
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase10_rollback_backup (source_table, record_id, payload)
SELECT 'application_attachments', id,
       JSON_OBJECT(
         'application_id', application_id,
         'media_asset_id', media_asset_id,
         'file_name', file_name,
         'mime_type', mime_type,
         'file_size', file_size,
         'object_key', object_key,
         'created_at', created_at
       )
  FROM application_attachments
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase10_rollback_backup (source_table, record_id, payload)
SELECT 'application_status_history', id,
       JSON_OBJECT(
         'application_id', application_id,
         'from_status', from_status,
         'to_status', to_status,
         'changed_by_user_id', changed_by_user_id,
         'changed_by_role', changed_by_role,
         'note', note,
         'created_at', created_at
       )
  FROM application_status_history
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase10_rollback_backup (source_table, record_id, payload)
SELECT 'job_requirements', id,
       JSON_OBJECT(
         'job_id', job_id,
         'requirement_type', requirement_type,
         'label', label,
         'is_mandatory', is_mandatory,
         'created_at', created_at
       )
  FROM job_requirements
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

INSERT INTO phase10_rollback_backup (source_table, record_id, payload)
SELECT 'job_skills', CONCAT(job_id, ':', skill),
       JSON_OBJECT('job_id', job_id, 'skill', skill)
  FROM job_skills
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

-- Keep Phase 10 tables and columns: existing jobs and application records must remain available.
DELETE FROM schema_migrations WHERE version = '009-phase10-jobs-recruitment.sql';
