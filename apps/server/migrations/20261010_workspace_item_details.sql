-- Apply explicitly before starting HTTP/Worker. MySQL 5.7+, additive and rerunnable.
-- References only; no note/todo creation, backfill or source deletion.
SET @missing = (SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'toolbox_workspace_items' AND column_name = 'details_json');
SET @ddl = IF(@missing, 'ALTER TABLE toolbox_workspace_items ADD COLUMN details_json JSON DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @missing = (SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'toolbox_workspace_items' AND column_name = 'linked_todo_id');
SET @ddl = IF(@missing, 'ALTER TABLE toolbox_workspace_items ADD COLUMN linked_todo_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
