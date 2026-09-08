-- Todo workspace: additive, idempotent MySQL 5.7 migration. No historical classification.
CREATE TABLE IF NOT EXISTS todo_lists (
 id CHAR(36) NOT NULL PRIMARY KEY,
 user_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 name VARCHAR(40) NOT NULL,
 color VARCHAR(7) NOT NULL DEFAULT '#6554ed',
 create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_todo_lists_owner (user_id, create_time),
 CONSTRAINT fk_todo_lists_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS todo_tag_relations (
 user_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 target_type VARCHAR(8) NOT NULL COMMENT 'todo/series',
 target_id CHAR(36) NOT NULL,
 tag_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
 create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (target_type, target_id, tag_id),
 KEY idx_todo_tags_owner (user_id, target_type, target_id),
 KEY idx_todo_tags_tag (tag_id, target_type, user_id),
 CONSTRAINT fk_todo_tags_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
 CONSTRAINT fk_todo_tags_tag FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC;

SET @todo_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'list_id');
SET @todo_ddl := IF(@todo_col = 0, 'ALTER TABLE todo_items ADD COLUMN list_id CHAR(36) DEFAULT NULL', 'SELECT 1');
PREPARE todo_stmt FROM @todo_ddl;
EXECUTE todo_stmt;
DEALLOCATE PREPARE todo_stmt;

SET @todo_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_series' AND COLUMN_NAME = 'list_id');
SET @todo_ddl := IF(@todo_col = 0, 'ALTER TABLE todo_series ADD COLUMN list_id CHAR(36) DEFAULT NULL', 'SELECT 1');
PREPARE todo_stmt FROM @todo_ddl;
EXECUTE todo_stmt;
DEALLOCATE PREPARE todo_stmt;

SET @todo_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND INDEX_NAME = 'idx_todo_items_list');
SET @todo_ddl := IF(@todo_idx = 0, 'ALTER TABLE todo_items ADD KEY idx_todo_items_list (user_id, list_id)', 'SELECT 1');
PREPARE todo_stmt FROM @todo_ddl;
EXECUTE todo_stmt;
DEALLOCATE PREPARE todo_stmt;

SET @todo_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_series' AND INDEX_NAME = 'idx_todo_series_list');
SET @todo_ddl := IF(@todo_idx = 0, 'ALTER TABLE todo_series ADD KEY idx_todo_series_list (user_id, list_id)', 'SELECT 1');
PREPARE todo_stmt FROM @todo_ddl;
EXECUTE todo_stmt;
DEALLOCATE PREPARE todo_stmt;
