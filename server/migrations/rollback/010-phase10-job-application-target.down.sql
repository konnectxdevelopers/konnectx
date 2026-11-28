CREATE TABLE IF NOT EXISTS phase10_rollback_backup (
  source_table VARCHAR(64) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  backed_up_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_table, record_id)
);

INSERT INTO phase10_rollback_backup (source_table, record_id, payload)
SELECT 'jobs', id, JSON_OBJECT('application_target', application_target)
  FROM jobs
 WHERE application_target IS NOT NULL
ON DUPLICATE KEY UPDATE
  payload = VALUES(payload),
  backed_up_at = CURRENT_TIMESTAMP;

DELETE FROM schema_migrations WHERE version = '010-phase10-job-application-target.sql';
