-- Explicit additive migration; application startup never creates tables.
CREATE TABLE IF NOT EXISTS data_export_tasks (
 id CHAR(36) NOT NULL PRIMARY KEY,
 owner_id VARCHAR(128) NOT NULL,
 runtime VARCHAR(16) NOT NULL,
 host_key CHAR(64) NOT NULL,
 request_id CHAR(36) NOT NULL,
 options_json TEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'queued',
 stage VARCHAR(24) NOT NULL DEFAULT 'queued',
 total INT UNSIGNED NOT NULL DEFAULT 0,
 completed INT UNSIGNED NOT NULL DEFAULT 0,
 failed INT UNSIGNED NOT NULL DEFAULT 0,
 error_code VARCHAR(80) NULL,
 lease_token CHAR(36) NULL,
 lease_until DATETIME NULL,
 create_time DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL,
 UNIQUE KEY export_request (owner_id, runtime, host_key, request_id),
 KEY export_owner (owner_id, runtime, host_key, create_time),
 KEY export_queue (runtime, host_key, status, lease_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS data_export_items (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 task_id CHAR(36) NOT NULL,
 kind VARCHAR(16) NOT NULL,
 resource_id VARCHAR(128) NOT NULL,
 title VARCHAR(1024) NOT NULL,
 version CHAR(64) NOT NULL,
 path TEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending',
 error_code VARCHAR(80) NULL,
 UNIQUE KEY export_resource (task_id, kind, resource_id),
 KEY export_items (task_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
