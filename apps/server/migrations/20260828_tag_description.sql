-- 2026-08-28 标签说明（MySQL 5.7 兼容、幂等）
-- 标签说明属于标签元信息；空值继续由前端展示既有的自动说明，不改写历史标签。

SET @has_tag_description = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tag'
    AND COLUMN_NAME = 'description'
);
SET @sql = IF(
  @has_tag_description = 0,
  "ALTER TABLE `tag` ADD COLUMN `description` varchar(500) DEFAULT NULL COMMENT '标签说明' AFTER `name`",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tag'
  AND COLUMN_NAME = 'description';
