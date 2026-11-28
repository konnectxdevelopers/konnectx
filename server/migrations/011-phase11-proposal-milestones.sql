CREATE TABLE IF NOT EXISTS proposal_milestones (
  id CHAR(36) NOT NULL PRIMARY KEY,
  proposal_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  sequence_no SMALLINT UNSIGNED NOT NULL,
  estimated_days SMALLINT UNSIGNED NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY proposal_milestones_sequence_unique (proposal_id, sequence_no),
  CONSTRAINT proposal_milestones_proposal_fk
    FOREIGN KEY (proposal_id) REFERENCES project_proposals (id)
);
