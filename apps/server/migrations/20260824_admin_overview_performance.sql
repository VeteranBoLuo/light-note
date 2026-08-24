-- 后台总览历史趋势与最近新增按“有效状态 + 创建时间”读取。
-- MySQL 5.7 不支持 ADD INDEX IF NOT EXISTS，统一通过 information_schema 保持幂等。

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='note' AND index_name='idx_note_admin_created'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `note` ADD KEY `idx_note_admin_created` (`del_flag`(8),`create_time`,`create_by`(64))',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='todo_items' AND index_name='idx_todo_admin_created'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `todo_items` ADD KEY `idx_todo_admin_created` (`del_flag`,`create_time`,`user_id`(64))',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
