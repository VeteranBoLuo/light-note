-- Explicit V3 migration. No historical jobs are backfilled or replayed.
CREATE TABLE IF NOT EXISTS organize_processing_jobs (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 user_id VARCHAR(255) NOT NULL,
 work_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 kind VARCHAR(24) NOT NULL,
 lane VARCHAR(16) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'queued',
 prepared_json JSON DEFAULT NULL,
 lease_token CHAR(36) DEFAULT NULL,
 lease_expires_at DATETIME DEFAULT NULL,
 next_check_at DATETIME DEFAULT NULL,
 attempts INT NOT NULL DEFAULT 0,
 error_code VARCHAR(80) DEFAULT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_organize_processing_work(run_id,work_key),
 KEY idx_organize_processing_claim(lane,status,next_check_at,lease_expires_at),
 KEY idx_organize_processing_item(run_id,item_id,lane)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
