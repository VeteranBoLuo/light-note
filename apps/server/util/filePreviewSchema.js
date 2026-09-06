import pool from '../db/index.js';

let ensurePromise = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS file_preview_artifacts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'cloud_file',
    file_id BIGINT UNSIGNED NOT NULL,
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
    UNIQUE KEY uk_file_preview_artifact (source_type, file_id, strategy, strategy_version),
    KEY idx_file_preview_owner_status (owner_user_id, status, update_time),
    KEY idx_file_preview_cleanup (last_access_at, update_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS file_preview_jobs (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function ensurePreviewSourceContract() {
  const [columnRows] = await pool.query(
    `SELECT column_name AS columnName, column_type AS columnType
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'file_preview_artifacts'
        AND column_name IN ('source_type', 'file_id')`,
  );
  const columns = new Map(columnRows.map((row) => [row.columnName, String(row.columnType || '').toLowerCase()]));
  if (!columns.has('source_type')) {
    await pool.query(
      "ALTER TABLE file_preview_artifacts ADD COLUMN source_type varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'cloud_file' AFTER id",
    );
  }
  if (!String(columns.get('file_id') || '').includes('bigint')) {
    await pool.query('ALTER TABLE file_preview_artifacts MODIFY COLUMN file_id bigint unsigned NOT NULL');
  }
  const [indexRows] = await pool.query(
    `SELECT column_name AS columnName
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'file_preview_artifacts'
        AND INDEX_NAME = 'uk_file_preview_artifact'
      ORDER BY seq_in_index`,
  );
  const expected = ['source_type', 'file_id', 'strategy', 'strategy_version'];
  if (indexRows.map((row) => row.columnName).join(',') !== expected.join(',')) {
    if (indexRows.length) await pool.query('ALTER TABLE file_preview_artifacts DROP INDEX uk_file_preview_artifact');
    await pool.query(
      'ALTER TABLE file_preview_artifacts ADD UNIQUE KEY uk_file_preview_artifact (source_type, file_id, strategy, strategy_version)',
    );
  }
}

export function ensureFilePreviewSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      for (const sql of statements) await pool.query(sql);
      await ensurePreviewSourceContract();
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
