-- 项目看板：增量字段，旧内容与状态保持不变。
ALTER TABLE toolbox_workspaces ADD COLUMN board_version BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE toolbox_workspace_items ADD COLUMN source_item_id CHAR(36) DEFAULT NULL, ADD COLUMN source_title VARCHAR(255) NOT NULL DEFAULT '', ADD COLUMN source_content TEXT DEFAULT NULL;
CREATE TABLE IF NOT EXISTS toolbox_board_operations (workspace_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, request_id VARCHAR(64) NOT NULL, request_hash CHAR(64) NOT NULL, before_json JSON NOT NULL, after_json JSON NOT NULL, after_version BIGINT UNSIGNED NOT NULL, focus_item_id CHAR(36) DEFAULT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (workspace_id,user_id,request_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
