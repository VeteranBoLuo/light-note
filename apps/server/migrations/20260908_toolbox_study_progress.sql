CREATE TABLE IF NOT EXISTS toolbox_study_progress (
  user_id VARCHAR(64) NOT NULL, artifact_id CHAR(36) NOT NULL, artifact_version INT UNSIGNED NOT NULL,
  card_id VARCHAR(24) NOT NULL, mastered TINYINT(1) NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,artifact_id,artifact_version,card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
