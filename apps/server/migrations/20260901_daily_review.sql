-- 每日回顾：账号本地日期会话 + 当日固定条目。
-- MySQL 5.7 兼容；只补幂等结构，不做历史业务回填。

-- 每日回顾复用成长域的跨日抑制事实；新库可能尚未启动过成长中心，迁移必须独立可执行。
CREATE TABLE IF NOT EXISTS growth_recap_state (
  user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(16) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  snoozed_until DATETIME DEFAULT NULL,
  dismissed_at DATETIME DEFAULT NULL,
  last_shown_date DATE DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, resource_type, resource_id),
  KEY idx_growth_recap_available (user_id, dismissed_at, snoozed_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='成长内容回顾状态';

SET @daily_review_last_shown_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'growth_recap_state'
    AND COLUMN_NAME = 'last_shown_date'
);
SET @daily_review_sql := IF(
  @daily_review_last_shown_column = 0,
  'ALTER TABLE growth_recap_state ADD COLUMN last_shown_date DATE DEFAULT NULL AFTER dismissed_at',
  'SELECT 1'
);
PREPARE stmt FROM @daily_review_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 历史奖励型回顾已经占用旧版会话 / 条目表名。
-- 内容回顾使用独立表名与旧数据并存，禁止通过 IF NOT EXISTS 把旧表误当成新版 Schema。
CREATE TABLE IF NOT EXISTS daily_content_review_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  review_date DATE NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  item_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  completed_at DATETIME DEFAULT NULL,
  skipped_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_daily_content_review_session_user_date (user_id, review_date),
  KEY idx_daily_content_review_session_user_status (user_id, status, review_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
  COMMENT='账号时区下的每日回顾固定会话';

CREATE TABLE IF NOT EXISTS daily_content_review_items (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  resource_type VARCHAR(16) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  resource_date DATE DEFAULT NULL,
  reason_code VARCHAR(24) NOT NULL,
  reason_tag_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  action VARCHAR(24) NOT NULL DEFAULT 'pending',
  acted_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_daily_content_review_item_session_slot (session_id, slot),
  UNIQUE KEY uk_daily_content_review_item_session_resource (session_id, resource_type, resource_id),
  KEY idx_daily_content_review_item_user_resource (user_id, resource_type, resource_id(128), create_time),
  KEY idx_daily_content_review_item_session_action (session_id, action, slot),
  CONSTRAINT fk_daily_content_review_item_session
    FOREIGN KEY (session_id) REFERENCES daily_content_review_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
  COMMENT='每日回顾会话中的稳定资源条目';

SET @daily_review_resource_date_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'daily_content_review_items'
    AND COLUMN_NAME = 'resource_date'
);
SET @daily_review_sql := IF(
  @daily_review_resource_date_column = 0,
  'ALTER TABLE daily_content_review_items ADD COLUMN resource_date DATE DEFAULT NULL AFTER resource_id',
  'SELECT 1'
);
PREPARE stmt FROM @daily_review_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
