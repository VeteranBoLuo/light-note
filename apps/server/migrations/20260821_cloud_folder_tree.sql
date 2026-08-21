-- 2026-08-21 云空间多级文件夹（MySQL 5.7 兼容、幂等）
-- parent_id 已存在于部分历史基线；本迁移只补齐缺失列和目录树查询索引，不改写用户数据。

SET @has_cloud_folder_parent = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'folders' AND column_name = 'parent_id'
);
SET @sql = IF(
  @has_cloud_folder_parent = 0,
  "ALTER TABLE `folders` ADD COLUMN `parent_id` int(11) NULL COMMENT '父文件夹 ID，NULL 表示一级文件夹' AFTER `name`",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_cloud_folder_tree_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'folders' AND index_name = 'idx_folders_owner_parent_order'
);
SET @sql = IF(
  @has_cloud_folder_tree_index = 0,
  'ALTER TABLE `folders` ADD KEY `idx_folders_owner_parent_order` (`create_by`(64), `parent_id`, `del_flag`, `sort`, `create_time`, `id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 迁移本身不自动修数据：以下查询必须返回 0 行，否则应先人工确认异常关系再启用目录树。
SELECT child.id, child.name, child.parent_id
FROM folders child
LEFT JOIN folders parent ON parent.id = child.parent_id
WHERE child.del_flag = 0
  AND child.parent_id IS NOT NULL
  AND (
    child.parent_id = child.id
    OR parent.id IS NULL
    OR parent.del_flag <> 0
    OR NOT (parent.create_by <=> child.create_by)
  );
