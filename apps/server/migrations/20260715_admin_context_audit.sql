CREATE TABLE IF NOT EXISTS admin_context_audit (
  id char(36) NOT NULL,
  context_id char(36) DEFAULT NULL,
  actor_user_id varchar(255) NOT NULL,
  subject_user_id varchar(255) DEFAULT NULL,
  subject_role varchar(20) DEFAULT NULL,
  mode varchar(16) DEFAULT NULL,
  capability varchar(64) DEFAULT NULL,
  action varchar(32) NOT NULL,
  route varchar(255) DEFAULT NULL,
  method varchar(16) DEFAULT NULL,
  resource_type varchar(32) DEFAULT NULL,
  outcome varchar(16) DEFAULT NULL COMMENT 'allowed/blocked/noop/failed/expired',
  result_status int DEFAULT NULL,
  ip varchar(64) DEFAULT NULL,
  user_agent varchar(512) DEFAULT NULL,
  meta json DEFAULT NULL,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_context (context_id, create_time),
  KEY idx_admin_actor (actor_user_id, create_time),
  KEY idx_admin_subject (subject_user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员预览与内容维护审计';

-- 兼容迁移执行到一半或早期测试环境已创建旧表的情况。
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_context_audit' AND COLUMN_NAME = 'subject_role');
SET @ddl := IF(@col = 0, "ALTER TABLE `admin_context_audit` ADD COLUMN `subject_role` varchar(20) DEFAULT NULL AFTER `subject_user_id`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_context_audit' AND COLUMN_NAME = 'capability');
SET @ddl := IF(@col = 0, "ALTER TABLE `admin_context_audit` ADD COLUMN `capability` varchar(64) DEFAULT NULL AFTER `mode`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
