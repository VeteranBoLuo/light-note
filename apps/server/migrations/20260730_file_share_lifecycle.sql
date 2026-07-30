-- 文件分享生命周期与历史版本基线补齐。
-- 仅声明结构，不在应用启动时自动改库；部署前按 release gate 执行并跑 schema-assertions.sql。

SET @has_legacy_share_token := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'files'
    AND COLUMN_NAME = 'share_token'
);
SET @add_legacy_share_token_sql := IF(
  @has_legacy_share_token = 0,
  'ALTER TABLE files ADD COLUMN share_token VARCHAR(64) NULL COMMENT ''旧版分享令牌（仅迁移兼容，禁止新写入）'' AFTER deleted_at',
  'SELECT 1'
);
PREPARE add_legacy_share_token_stmt FROM @add_legacy_share_token_sql;
EXECUTE add_legacy_share_token_stmt;
DEALLOCATE PREPARE add_legacy_share_token_stmt;

CREATE TABLE IF NOT EXISTS note_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  note_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  content LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'html',
  create_by VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_note_versions_note_time (note_id, create_time, id),
  KEY idx_note_versions_owner (create_by, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记历史版本';

SET @has_note_time_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note_versions'
    AND INDEX_NAME = 'idx_note_versions_note_time'
);
SET @add_note_time_index_sql := IF(
  @has_note_time_index = 0,
  'ALTER TABLE note_versions ADD INDEX idx_note_versions_note_time (note_id, create_time, id)',
  'SELECT 1'
);
PREPARE add_note_time_index_stmt FROM @add_note_time_index_sql;
EXECUTE add_note_time_index_stmt;
DEALLOCATE PREPARE add_note_time_index_stmt;

SET @has_note_owner_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note_versions'
    AND INDEX_NAME = 'idx_note_versions_owner'
);
SET @add_note_owner_index_sql := IF(
  @has_note_owner_index = 0,
  'ALTER TABLE note_versions ADD INDEX idx_note_versions_owner (create_by, create_time)',
  'SELECT 1'
);
PREPARE add_note_owner_index_stmt FROM @add_note_owner_index_sql;
EXECUTE add_note_owner_index_stmt;
DEALLOCATE PREPARE add_note_owner_index_stmt;

CREATE TABLE IF NOT EXISTS file_shares (
  id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  file_id INT NOT NULL,
  owner_user_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hint VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  access_code_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  max_access_count INT UNSIGNED DEFAULT NULL,
  max_download_count INT UNSIGNED DEFAULT NULL,
  access_count INT UNSIGNED NOT NULL DEFAULT 0,
  download_count INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
  last_access_at DATETIME DEFAULT NULL,
  last_download_at DATETIME DEFAULT NULL,
  revoked_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_file_shares_token_hash (token_hash),
  KEY idx_file_shares_owner_status (owner_user_id, status, create_time),
  KEY idx_file_shares_file_status (file_id, status),
  KEY idx_file_shares_expiry (status, expires_at),
  CONSTRAINT fk_file_shares_file FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='可撤销文件分享';

CREATE TABLE IF NOT EXISTS file_share_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  share_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  outcome VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_file_share_events_share_time (share_id, create_time),
  KEY idx_file_share_events_retention (create_time),
  CONSTRAINT fk_file_share_events_share FOREIGN KEY (share_id) REFERENCES file_shares (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件分享隐私化访问事件';

-- 旧链接一次性迁入新生命周期。默认再保留 30 天，之后统一按新分享重新签发。
INSERT IGNORE INTO file_shares (
  id, file_id, owner_user_id, token_hash, token_hint, description, expires_at, status
)
SELECT
  UUID(),
  id,
  create_by,
  SHA2(share_token, 256),
  RIGHT(share_token, 8),
  '',
  DATE_ADD(NOW(), INTERVAL 30 DAY),
  IF(del_flag = 0, 'active', 'revoked')
FROM files
WHERE share_token IS NOT NULL
  AND share_token <> '';
