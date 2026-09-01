-- 整理中心 2.0：精确网址事实、可撤销忽略决定、动作幂等与链接健康观测分层。
-- MySQL 5.7；部署前仍需通过 schema-assertions.sql，只读接口不会在请求内建表。

SET NAMES utf8mb4;

SET @schema_name = DATABASE();
SET @has_url_hash = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark' AND COLUMN_NAME = 'url_exact_hash'
);
SET @sql = IF(
  @has_url_hash = 0,
  'ALTER TABLE `bookmark` ADD COLUMN `url_exact_hash` BINARY(32) DEFAULT NULL AFTER `url`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_url_hash_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark' AND INDEX_NAME = 'idx_bookmark_exact_url'
);
SET @sql = IF(
  @has_url_hash_index = 0,
  'ALTER TABLE `bookmark` ADD KEY `idx_bookmark_exact_url` (`user_id`, `del_flag`, `url_exact_hash`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE bookmark
   SET url_exact_hash = UNHEX(SHA2(CONVERT(url USING utf8mb4), 256))
 WHERE url_exact_hash IS NULL AND url IS NOT NULL AND url <> '';

CREATE TABLE IF NOT EXISTS organize_issue_suppressions (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  issue_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subject_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_organize_suppression (user_id, issue_type, subject_key),
  KEY idx_organize_suppression_issue (user_id, issue_type, update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户整理中心明确忽略决定';

CREATE TABLE IF NOT EXISTS organize_action_requests (
  user_id VARCHAR(255) NOT NULL,
  client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  response_json JSON DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, client_request_id),
  KEY idx_organize_action_status (status, update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='整理中心高风险动作幂等结果';

CREATE TABLE IF NOT EXISTS bookmark_health (
  bookmark_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'unknown',
  note VARCHAR(32) DEFAULT NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observed_status VARCHAR(16) NOT NULL DEFAULT 'unknown',
  observed_code VARCHAR(32) DEFAULT NULL,
  checked_url_hash BINARY(32) DEFAULT NULL,
  user_override VARCHAR(16) DEFAULT NULL,
  override_at DATETIME DEFAULT NULL,
  PRIMARY KEY (bookmark_id),
  KEY idx_user_status (user_id, status),
  KEY idx_bookmark_health_observed (user_id, observed_status, checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='书签链接健康观测与用户覆盖决定';

SET @has_observed_status = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'observed_status'
);
SET @sql = IF(@has_observed_status = 0,
  'ALTER TABLE `bookmark_health` ADD COLUMN `observed_status` VARCHAR(16) NOT NULL DEFAULT ''unknown'' AFTER `checked_at`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_observed_code = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'observed_code'
);
SET @sql = IF(@has_observed_code = 0,
  'ALTER TABLE `bookmark_health` ADD COLUMN `observed_code` VARCHAR(32) DEFAULT NULL AFTER `observed_status`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_checked_hash = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'checked_url_hash'
);
SET @sql = IF(@has_checked_hash = 0,
  'ALTER TABLE `bookmark_health` ADD COLUMN `checked_url_hash` BINARY(32) DEFAULT NULL AFTER `observed_code`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_user_override = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'user_override'
);
SET @sql = IF(@has_user_override = 0,
  'ALTER TABLE `bookmark_health` ADD COLUMN `user_override` VARCHAR(16) DEFAULT NULL AFTER `checked_url_hash`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_override_at = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND COLUMN_NAME = 'override_at'
);
SET @sql = IF(@has_override_at = 0,
  'ALTER TABLE `bookmark_health` ADD COLUMN `override_at` DATETIME DEFAULT NULL AFTER `user_override`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_health_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'bookmark_health' AND INDEX_NAME = 'idx_bookmark_health_observed'
);
SET @sql = IF(@has_health_index = 0,
  'ALTER TABLE `bookmark_health` ADD KEY `idx_bookmark_health_observed` (`user_id`, `observed_status`, `checked_at`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE bookmark_health h
INNER JOIN bookmark b ON b.id = h.bookmark_id AND b.user_id = h.user_id
   SET h.observed_status = CASE WHEN h.status IN ('alive', 'suspect') THEN h.status ELSE 'unknown' END,
       h.observed_code = COALESCE(h.observed_code, h.note),
       h.checked_url_hash = b.url_exact_hash,
       h.user_override = CASE WHEN h.note = 'user' THEN 'normal' ELSE h.user_override END,
       h.override_at = CASE WHEN h.note = 'user' THEN COALESCE(h.override_at, h.checked_at) ELSE h.override_at END
 WHERE h.checked_url_hash IS NULL;
