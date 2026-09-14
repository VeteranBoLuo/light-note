-- First cross-day open of an owned, non-seeded resource. No content or resource IDs retained.
CREATE TABLE IF NOT EXISTS resource_reuse_milestones (
  user_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  resource_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  first_opened_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, resource_type),
  KEY idx_reuse_user_time (user_id, first_opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resource_reuse_metadata (
  id TINYINT UNSIGNED NOT NULL,
  started_at DATETIME(3) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Installation is not proof of client collection coverage. Activate only after rollout verification.
INSERT IGNORE INTO resource_reuse_metadata (id, started_at) VALUES (1, NULL);
