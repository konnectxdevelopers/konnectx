ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS application_target VARCHAR(320) NULL;

CREATE INDEX IF NOT EXISTS jobs_status_deadline_idx
  ON jobs (status, deadline, created_at);
