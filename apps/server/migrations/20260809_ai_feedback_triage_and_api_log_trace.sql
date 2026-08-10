-- AI 回答反馈管理员闭环 + API 日志链路观测。
-- MySQL 5.7 不支持 ADD COLUMN / ADD INDEX IF NOT EXISTS，全部通过 information_schema 保持幂等。

CREATE TABLE IF NOT EXISTS `admin_ai_feedback_triage` (
  `feedback_id` varchar(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open' COMMENT 'open/investigating/actioned/dismissed',
  `priority` varchar(16) NOT NULL DEFAULT 'normal' COMMENT 'low/normal/high/urgent',
  `note` varchar(500) NOT NULL DEFAULT '',
  `updated_by` varchar(64) NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`feedback_id`),
  KEY `idx_admin_ai_feedback_triage_status_time` (`status`,`update_time`,`feedback_id`),
  KEY `idx_admin_ai_feedback_triage_priority_time` (`priority`,`update_time`,`feedback_id`),
  CONSTRAINT `fk_admin_ai_feedback_triage_feedback`
    FOREIGN KEY (`feedback_id`) REFERENCES `ai_feedback` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 回答反馈管理员处理状态';

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='api_logs' AND column_name='request_id'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE `api_logs` ADD COLUMN `request_id` varchar(64) DEFAULT NULL COMMENT '服务端链路请求 ID' AFTER `status_code`",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='api_logs' AND column_name='duration_ms'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE `api_logs` ADD COLUMN `duration_ms` int unsigned DEFAULT NULL COMMENT '服务端处理耗时毫秒' AFTER `request_id`",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='api_logs' AND index_name='idx_api_logs_request_id'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `api_logs` ADD KEY `idx_api_logs_request_id` (`request_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='api_logs' AND index_name='idx_api_logs_status_time'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `api_logs` ADD KEY `idx_api_logs_status_time` (`del_flag`,`status_code`,`request_time`,`id`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
