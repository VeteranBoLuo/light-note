-- 书签图标任务表增加 finished_at 字段和增量查询索引。
-- 可重复执行。

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bookmark_icon_jobs'
    AND COLUMN_NAME = 'finished_at'
);

SET @sql := IF(@exists = 0,
  'ALTER TABLE bookmark_icon_jobs
   ADD COLUMN finished_at DATETIME(3) NULL AFTER error_code',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bookmark_icon_jobs'
    AND INDEX_NAME = 'idx_icon_job_updates'
);

SET @index_sql := IF(@index_exists = 0,
  'ALTER TABLE bookmark_icon_jobs
   ADD KEY idx_icon_job_updates (user_id, batch_id, finished_at, id)',
  'SELECT 1'
);

PREPARE index_stmt FROM @index_sql;
EXECUTE index_stmt;
DEALLOCATE PREPARE index_stmt;
