-- Coordinate legacy filename PUT signatures, confirmations and retirement.
CREATE TABLE IF NOT EXISTS cloud_legacy_object_lifecycle (
  object_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  generation CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  upload_key VARCHAR(500) DEFAULT NULL,
  state ENUM('active','pending','deleting','retired') NOT NULL DEFAULT 'active',
  upload_until DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00',
  available_at DATETIME DEFAULT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (object_hash),
  KEY idx_cloud_legacy_owner (user_id),
  KEY idx_cloud_legacy_due (available_at,object_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
