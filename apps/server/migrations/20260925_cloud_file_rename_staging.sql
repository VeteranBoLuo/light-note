-- Durable, private cleanup identities for uncommitted rename copies. No business backfill.
CREATE TABLE IF NOT EXISTS cloud_file_rename_staging (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  file_id BIGINT NOT NULL,
  target_key VARCHAR(500) NOT NULL,
  state ENUM('pending','adopted','deleting') NOT NULL DEFAULT 'pending',
  available_at DATETIME NOT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cloud_rename_due (available_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
