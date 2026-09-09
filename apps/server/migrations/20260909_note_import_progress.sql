-- Additive import progress; no historical data rewrite. Apply before API/Worker update.
SET @import_progress_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='note_import_tasks' AND COLUMN_NAME='progress_json')=0, 'ALTER TABLE note_import_tasks ADD COLUMN progress_json TEXT NULL', 'SELECT 1');
PREPARE import_progress_stmt FROM @import_progress_ddl;
EXECUTE import_progress_stmt;
DEALLOCATE PREPARE import_progress_stmt;
SET @import_progress_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='note_import_tasks' AND COLUMN_NAME='finished_at')=0, 'ALTER TABLE note_import_tasks ADD COLUMN finished_at DATETIME NULL', 'SELECT 1');
PREPARE import_progress_stmt FROM @import_progress_ddl;
EXECUTE import_progress_stmt;
DEALLOCATE PREPARE import_progress_stmt;
SET @import_progress_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='note_import_items' AND COLUMN_NAME='warning_details')=0, 'ALTER TABLE note_import_items ADD COLUMN warning_details TEXT NULL', 'SELECT 1');
PREPARE import_progress_stmt FROM @import_progress_ddl;
EXECUTE import_progress_stmt;
DEALLOCATE PREPARE import_progress_stmt;
