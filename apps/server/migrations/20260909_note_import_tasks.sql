-- Explicit migration; no runtime DDL or historical data changes.
CREATE TABLE IF NOT EXISTS note_import_tasks (
 id CHAR(36) NOT NULL PRIMARY KEY,
 owner_id VARCHAR(128) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'uploading',
 parent_id VARCHAR(128) NULL,
 share_fingerprint CHAR(64) NULL,
 upload_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
 lease_token CHAR(36) NULL,
 lease_until DATETIME NULL,
 stop_requested TINYINT NOT NULL DEFAULT 0,
 error_code VARCHAR(80) NULL,
 create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL,
 KEY import_owner (owner_id, create_time),
 KEY import_queue (status, lease_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS note_import_items (
 id CHAR(36) NOT NULL PRIMARY KEY,
 task_id CHAR(36) NOT NULL,
 title VARCHAR(255) NOT NULL,
 source_name VARCHAR(1024) NOT NULL,
 type VARCHAR(16) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'ready',
 selected TINYINT NOT NULL DEFAULT 1,
 warnings TEXT NOT NULL,
 image_count INT UNSIGNED NOT NULL DEFAULT 0,
 error_code VARCHAR(80) NULL,
 note_id VARCHAR(128) NULL,
 position INT NOT NULL,
 KEY import_items (task_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
