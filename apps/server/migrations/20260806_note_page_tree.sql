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

SET @idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'note'
    AND INDEX_NAME = 'idx_note_owner_parent_order'
);
SET @ddl := IF(
  @idx = 0,
  "ALTER TABLE `note` ADD KEY `idx_note_owner_parent_order` (`create_by`, `parent_id`, `del_flag`, `is_top`, `sort`, `update_time`, `id`)",
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
