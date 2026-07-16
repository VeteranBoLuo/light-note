CREATE TABLE IF NOT EXISTS ai_document_sources (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(96) NULL,
  source_type ENUM('temporary', 'cloud') NOT NULL,
  file_id BIGINT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(160) NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  object_key VARCHAR(1024) NOT NULL,
  status ENUM('awaiting_upload', 'queued', 'parsing', 'ready', 'failed') NOT NULL DEFAULT 'awaiting_upload',
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  extracted_chars INT UNSIGNED NOT NULL DEFAULT 0,
  chunk_count INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_document_cloud_file (user_id, file_id),
  KEY idx_ai_document_owner_status (user_id, status, create_time),
  KEY idx_ai_document_expiry (source_type, expires_at),
  KEY idx_ai_document_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_document_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id VARCHAR(36) NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  content MEDIUMTEXT NOT NULL,
  locator_type ENUM('page', 'section', 'row', 'paragraph') NOT NULL DEFAULT 'paragraph',
  locator_value VARCHAR(160) NULL,
  content_hash CHAR(64) NOT NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_document_chunk (source_id, chunk_index),
  KEY idx_ai_document_chunk_source (source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_document_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id VARCHAR(36) NOT NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME NULL,
  locked_by VARCHAR(96) NULL,
  error_message VARCHAR(500) NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_document_job_source (source_id),
  KEY idx_ai_document_job_queue (status, available_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
