-- 书签 favicon 静默刷新时间（MySQL 5.7 兼容、可重复执行）。
-- 已有图标回填为当前时间，避免上线后一次性刷新全部历史书签；无图标记录保留 NULL，允许立即抓取。

SET @col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bookmark'
    AND COLUMN_NAME = 'icon_checked_at'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE bookmark ADD COLUMN icon_checked_at datetime DEFAULT NULL COMMENT 'favicon 最近一次抓取检查时间' AFTER icon_url",
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE bookmark
SET icon_checked_at = NOW()
WHERE icon_url IS NOT NULL
  AND icon_url <> ''
  AND icon_checked_at IS NULL;
