-- Additive, idempotent migration. Existing files remain unpinned; no object/preview changes.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'is_top');
SET @ddl := IF(@col = 0, 'ALTER TABLE `files` ADD COLUMN `is_top` tinyint(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND INDEX_NAME = 'idx_files_owner_pin_time');
SET @ddl := IF(@idx = 0, 'ALTER TABLE `files` ADD KEY `idx_files_owner_pin_time` (`create_by`(64), `del_flag`, `is_top`, `create_time`, `id`)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
