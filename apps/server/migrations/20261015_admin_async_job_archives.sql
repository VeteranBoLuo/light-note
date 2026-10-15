CREATE TABLE IF NOT EXISTS admin_async_job_archives (
  source VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  job_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  job_status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  job_updated_at_epoch DECIMAL(20,6) NOT NULL,
  archived_by VARCHAR(255) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source, job_id),
  KEY idx_admin_async_archive_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
