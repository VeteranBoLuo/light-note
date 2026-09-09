-- 通用整理任务：独立于原 AI 标签历史，不回填或改写旧批次。
CREATE TABLE IF NOT EXISTS organize_suggestion_runs (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id VARCHAR(255) NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 start_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 options_json JSON NOT NULL,
 summary_json JSON NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'preview',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_organize_run_request(user_id,request_id),
 UNIQUE KEY uk_organize_run_start(user_id,start_request_id),
 KEY idx_organize_runs_queue(status,created_at,id),
 KEY idx_organize_runs_owner(user_id,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS organize_suggestion_items (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id VARCHAR(255) NOT NULL,
 resource_type VARCHAR(16) NOT NULL,
 resource_id VARCHAR(128) NOT NULL,
 snapshot_json JSON NOT NULL,
 version_hash CHAR(64) NOT NULL,
 ai_kinds_json JSON NOT NULL,
 ai_status VARCHAR(24) NOT NULL,
 lease_token CHAR(36) DEFAULT NULL,
 lease_expires_at DATETIME DEFAULT NULL,
 next_check_at DATETIME DEFAULT NULL,
 error_code VARCHAR(80) DEFAULT NULL,
 UNIQUE KEY uk_organize_run_resource(run_id,resource_type,resource_id),
 KEY idx_organize_item_queue(ai_status,lease_expires_at,run_id),
 KEY idx_organize_item_owner(user_id,run_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS organize_suggestions (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id VARCHAR(255) NOT NULL,
 kind VARCHAR(24) NOT NULL,
 status VARCHAR(24) NOT NULL,
 payload_json JSON NOT NULL,
 applied_request_id CHAR(36) DEFAULT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_organize_item_kind(item_id,kind),
 KEY idx_organize_suggestion_run(user_id,run_id,status,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
