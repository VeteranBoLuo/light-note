-- Chronological search filters owner + live state before seeking time + ID.
-- Preserve the time-first reporting indexes and the pinned-file list index.
-- Additive and idempotent; MySQL 5.7 compatible, no application-start DDL.
SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='bookmark' AND index_name='idx_bookmark_search_time');
SET @ddl := IF(@idx=0,
  'ALTER TABLE `bookmark` ADD KEY `idx_bookmark_search_time` (`user_id`,`del_flag`,`create_time`,`id`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='files' AND index_name='idx_files_search_time');
SET @ddl := IF(@idx=0,
  'ALTER TABLE `files` ADD KEY `idx_files_search_time` (`create_by`,`del_flag`,`create_time`,`id`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
