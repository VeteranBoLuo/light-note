export const TRANSLATION_SCHEMA = `CREATE TABLE IF NOT EXISTS toolbox_translation_inputs (
  quote_id CHAR(36) NOT NULL, job_id CHAR(36) DEFAULT NULL, user_id VARCHAR(64) NOT NULL,
  content MEDIUMTEXT NOT NULL, segments_json JSON NOT NULL, expires_at DATETIME NOT NULL,
  PRIMARY KEY (quote_id), UNIQUE KEY uk_translation_job (job_id),
  KEY idx_translation_owner (user_id), KEY idx_translation_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
