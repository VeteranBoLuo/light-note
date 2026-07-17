-- 笔记置顶（幂等、兼容 MySQL 5.7）：
-- 1) is_top 保存置顶状态；
-- 2) 组合索引覆盖笔记库按用户、删除状态、置顶分组和自定义顺序读取。

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note' AND COLUMN_NAME = 'is_top');
SET @ddl := IF(@col = 0, "ALTER TABLE `note` ADD COLUMN `is_top` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否置顶:1是,0否' AFTER `sort`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note' AND INDEX_NAME = 'idx_note_owner_top_sort');
SET @ddl := IF(@idx = 0, "ALTER TABLE `note` ADD KEY `idx_note_owner_top_sort` (`create_by`, `del_flag`, `is_top`, `sort`, `update_time`)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
