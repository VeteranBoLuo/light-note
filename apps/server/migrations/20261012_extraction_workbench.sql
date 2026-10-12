-- Additive migration. Existing extraction data survives rollback.
CREATE TABLE IF NOT EXISTS toolbox_extractions (
 id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, request_id CHAR(36) NOT NULL, input_digest CHAR(64) NOT NULL,
 title VARCHAR(120) NOT NULL, goal VARCHAR(1000) NOT NULL DEFAULT '', status VARCHAR(24) NOT NULL DEFAULT 'preparing',
 phase VARCHAR(16) NOT NULL DEFAULT 'prepare', plan_json JSON DEFAULT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 data_version INT UNSIGNED NOT NULL DEFAULT 1, accept_partial TINYINT(1) NOT NULL DEFAULT 0,
 lease_token CHAR(36) DEFAULT NULL, lease_until DATETIME DEFAULT NULL, dispatched TINYINT(1) NOT NULL DEFAULT 0,
 error_code VARCHAR(64) DEFAULT NULL, available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uk_extraction_request(user_id,request_id), KEY idx_extraction_owner(user_id,updated_at),
 KEY idx_extraction_queue(status,available_at,lease_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS toolbox_extraction_sources (
 id CHAR(36) NOT NULL, extraction_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, position SMALLINT UNSIGNED NOT NULL,
 resource_type VARCHAR(16) NOT NULL, resource_id VARCHAR(128) NOT NULL, resource_version VARCHAR(128) NOT NULL,
 title VARCHAR(255) NOT NULL DEFAULT '', status VARCHAR(24) NOT NULL DEFAULT 'preparing', source_json MEDIUMTEXT DEFAULT NULL,
 coverage_json JSON DEFAULT NULL, window_count INT UNSIGNED NOT NULL DEFAULT 0, processed_windows INT UNSIGNED NOT NULL DEFAULT 0,
 error_code VARCHAR(64) DEFAULT NULL, expires_at DATETIME NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uk_extraction_source(extraction_id,resource_type,resource_id),
 KEY idx_extraction_sources_owner(user_id), KEY idx_extraction_source_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS toolbox_extraction_records (
 id CHAR(24) NOT NULL, extraction_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, source_id CHAR(36) NOT NULL,
 payload_json JSON NOT NULL, reviews_json JSON NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 pending_cells SMALLINT UNSIGNED NOT NULL DEFAULT 0, excluded TINYINT(1) NOT NULL DEFAULT 0, published TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(extraction_id,id), KEY idx_extraction_records_owner(user_id,extraction_id), KEY idx_extraction_records_source(source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS toolbox_extraction_receipts (
 extraction_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, request_id CHAR(36) NOT NULL,
 digest CHAR(64) NOT NULL, response_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(extraction_id,request_id), KEY idx_extraction_receipts_owner(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
