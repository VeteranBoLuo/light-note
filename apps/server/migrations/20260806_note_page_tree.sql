-- 2026-08-06 笔记页面树基础模型（MySQL 5.7，可重复执行）
--
-- 每篇笔记仍是可编辑页面；parent_id 只表达其在个人知识树中的位置。
-- 不添加自引用外键：软删除、批次恢复和物理清理都必须保留父子语义，
-- 节点归属、循环与最大深度由 noteTreeService 在事务内校验。

SET @col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note'
    AND COLUMN_NAME = 'parent_id'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE `note` ADD COLUMN `parent_id` varchar(255) NULL COMMENT '页面树父笔记 ID，NULL 表示我的知识库根层' AFTER `type`",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note'
    AND COLUMN_NAME = 'tree_delete_batch_id'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE `note` ADD COLUMN `tree_delete_batch_id` varchar(255) NULL COMMENT '同一次页面子树软删除的恢复批次' AFTER `parent_id`",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note'
    AND INDEX_NAME = 'idx_note_owner_parent_order'
);
SET @ddl := IF(
  @idx = 0,
  "ALTER TABLE `note` ADD KEY `idx_note_owner_parent_order` (`create_by`(64), `parent_id`(64), `del_flag`(8), `is_top`, `sort`, `update_time`, `id`(64))",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note'
    AND INDEX_NAME = 'idx_note_tree_delete_batch'
);
SET @ddl := IF(
  @idx = 0,
  "ALTER TABLE `note` ADD KEY `idx_note_tree_delete_batch` (`create_by`(64), `tree_delete_batch_id`(64), `del_flag`(8))",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note'
    AND INDEX_NAME = 'idx_note_parent'
);
SET @ddl := IF(
  @idx = 0,
  "ALTER TABLE `note` ADD KEY `idx_note_parent` (`parent_id`)",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
