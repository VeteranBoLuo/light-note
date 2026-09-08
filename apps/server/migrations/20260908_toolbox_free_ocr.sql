-- Free OCR usage is independent of points and AI quota.
CREATE TABLE IF NOT EXISTS toolbox_ocr_usage (
    user_id VARCHAR(64) NOT NULL, usage_date DATE NOT NULL, used_pages INT UNSIGNED NOT NULL DEFAULT 0,
    reserved_pages INT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (user_id, usage_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS toolbox_ocr_inputs (
    job_id CHAR(36) NOT NULL, input_index SMALLINT UNSIGNED NOT NULL, user_id VARCHAR(64) NOT NULL,
    usage_date DATE NOT NULL, source_json JSON NOT NULL, content_hash CHAR(64) NOT NULL,
    pages SMALLINT UNSIGNED NOT NULL, attempted_pages SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending', result_json JSON DEFAULT NULL,
    PRIMARY KEY(job_id, input_index), KEY idx_ocr_cache(user_id, content_hash, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Free tasks have no quote; paid snapshots remain unchanged.
ALTER TABLE toolbox_jobs MODIFY COLUMN quote_id CHAR(36) DEFAULT NULL;
