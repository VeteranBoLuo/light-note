-- 云文件派生预览：压缩包只保存目录清单，旧 Office/ODF/RTF 保存转换后的私有 PDF 对象键。
-- MySQL 5.7；可重复执行。发布前手工应用，并运行 check:schema 与 check:file-previews。

CREATE TABLE IF NOT EXISTS file_preview_artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  file_id INT NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  strategy ENUM('archive_manifest', 'converted_pdf') NOT NULL,
  strategy_version SMALLINT UNSIGNED NOT NULL,
  format_id VARCHAR(40) NOT NULL,
  source_etag VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_size BIGINT UNSIGNED NOT NULL,
  status ENUM('queued', 'processing', 'ready', 'failed') NOT NULL DEFAULT 'queued',
  artifact_object_key VARCHAR(1024) NULL,
  artifact_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  manifest_json MEDIUMTEXT NULL,
  entry_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_uncompressed_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  contains_encrypted TINYINT(1) NOT NULL DEFAULT 0,
  suspicious_expansion TINYINT(1) NOT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  last_access_at DATETIME NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_file_preview_artifact (file_id, strategy, strategy_version),
  KEY idx_file_preview_owner_status (owner_user_id, status, update_time),
  KEY idx_file_preview_cleanup (last_access_at, update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS file_preview_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  artifact_id BIGINT UNSIGNED NOT NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME NULL,
  locked_by VARCHAR(96) NULL,
  error_code VARCHAR(64) NULL,
  output_object_key VARCHAR(1024) NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_file_preview_job_artifact (artifact_id),
  KEY idx_file_preview_job_queue (status, available_at, id),
  CONSTRAINT fk_file_preview_job_artifact FOREIGN KEY (artifact_id) REFERENCES file_preview_artifacts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
