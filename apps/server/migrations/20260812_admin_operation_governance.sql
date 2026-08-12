-- 后台高风险操作治理：通知发送记录归档、知识库可恢复归档。
-- MySQL 5.7 不支持 ADD COLUMN / ADD INDEX IF NOT EXISTS，统一通过 information_schema 幂等执行。

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='notification' AND column_name='admin_archived'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE `notification` ADD COLUMN `admin_archived` tinyint NOT NULL DEFAULT 0 COMMENT '管理员发送历史是否归档' AFTER `recalled`",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='notification' AND index_name='idx_notification_admin_history'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `notification` ADD KEY `idx_notification_admin_history` (`admin_archived`,`type`,`create_time`,`batch_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='knowledge_base' AND column_name='admin_archived'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE `knowledge_base` ADD COLUMN `admin_archived` tinyint NOT NULL DEFAULT 0 COMMENT '后台知识条目是否归档' AFTER `status`",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='knowledge_base' AND index_name='idx_knowledge_admin_archive'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `knowledge_base` ADD KEY `idx_knowledge_admin_archive` (`admin_archived`,`status`,`sort`,`created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
