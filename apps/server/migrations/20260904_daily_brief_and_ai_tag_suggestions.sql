-- 桌面工作台每日简报与整理中心 AI 标签建议持久化闭环。
-- MySQL 5.7；HTTP 读取不建表，服务启动阶段仅执行同结构的幂等 CREATE。

SET NAMES utf8mb4;

-- 唯一约束只补结构，不自动合并、删除或重写历史标签关系。
-- 如已有同名存活标签，创建唯一键会失败；先核对并单独处理冲突，再安全重试。
ALTER TABLE tag ROW_FORMAT=DYNAMIC;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tag' AND COLUMN_NAME='active_name'), 'SELECT 1',
 'ALTER TABLE tag ADD COLUMN active_name VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN del_flag = 0 THEN name ELSE NULL END) STORED');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tag' AND INDEX_NAME='uk_tag_active_user_name'), 'SELECT 1',
 'ALTER TABLE tag ADD UNIQUE KEY uk_tag_active_user_name (user_id, active_name)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS workbench_daily_briefs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  brief_date DATE NOT NULL,
  timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'generating',
  facts_json JSON NOT NULL,
  brief_json JSON DEFAULT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  lease_expires_at DATETIME DEFAULT NULL,
  generated_at DATETIME DEFAULT NULL,
  last_error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_workbench_daily_brief_user_date (user_id, brief_date),
  KEY idx_workbench_daily_brief_lease (status, lease_expires_at)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='桌面工作台每日简报幂等产物';

CREATE TABLE IF NOT EXISTS organize_ai_tag_batches (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resource_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope_mode VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'queued',
  total INT UNSIGNED NOT NULL DEFAULT 0,
  processed INT UNSIGNED NOT NULL DEFAULT 0,
  ready_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  accepted_count INT UNSIGNED NOT NULL DEFAULT 0,
  ignored_count INT UNSIGNED NOT NULL DEFAULT 0,
  conflicted_count INT UNSIGNED NOT NULL DEFAULT 0,
  lease_owner VARCHAR(128) DEFAULT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  lease_expires_at DATETIME DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  last_error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_organize_ai_tag_request (user_id, client_request_id),
  KEY idx_organize_ai_tag_claim (status, lease_expires_at, create_time),
  KEY idx_organize_ai_tag_user (user_id, create_time, id)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='整理中心 AI 标签建议批次';

CREATE TABLE IF NOT EXISTS organize_ai_tag_suggestions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  batch_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  resource_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  resource_title VARCHAR(255) NOT NULL DEFAULT '',
  resource_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  current_tags_json JSON NOT NULL,
  recommended_tags_json JSON DEFAULT NULL,
  accepted_tags_json JSON DEFAULT NULL,
  reason VARCHAR(500) DEFAULT NULL,
  status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_organize_ai_tag_batch_resource (batch_id, resource_type, resource_id),
  KEY idx_organize_ai_tag_batch_status (batch_id, status, id),
  KEY idx_organize_ai_tag_user_status (user_id, status, update_time)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='整理中心逐资源 AI 标签建议';
