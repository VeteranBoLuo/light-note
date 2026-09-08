export const BOARD_COLUMNS = [
  ['toolbox_workspaces', 'board_version', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['toolbox_workspace_items', 'source_item_id', 'CHAR(36) DEFAULT NULL'],
  ['toolbox_workspace_items', 'source_title', "VARCHAR(255) NOT NULL DEFAULT ''"],
  ['toolbox_workspace_items', 'source_content', 'TEXT DEFAULT NULL'],
];
export const BOARD_OPERATIONS_SCHEMA = `CREATE TABLE IF NOT EXISTS toolbox_board_operations (
  workspace_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, request_id VARCHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL, before_json JSON NOT NULL, after_json JSON NOT NULL,
  after_version BIGINT UNSIGNED NOT NULL, focus_item_id CHAR(36) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id, request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
